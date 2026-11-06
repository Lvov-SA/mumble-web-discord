import { Writable } from 'stream'
import MicrophoneStream from 'microphone-stream'
import audioContext from 'audio-context'
import keyboardjs from 'keyboardjs'
import { initAudio, createMicrophoneNode } from './audio'
import DropStream from 'drop-stream'
import { WorkerBasedMumbleClient } from './worker-client'

class VoiceHandler extends Writable {
  constructor (client, settings) {
    super({ objectMode: true })
    this._client = client
    this._settings = settings
    this._outbound = null
    this._mute = false
  }

  setMute (mute) {
    this._mute = mute
    if (mute) {
      this._stopOutbound()
    }
  }

  _getOrCreateOutbound () {
    if (this._mute) {
      throw new Error('tried to send audio while self-muted')
    }
    if (!this._outbound) {
      if (!this._client) {
        this._outbound = DropStream.obj()
        this.emit('started_talking')
        return this._outbound
      }

      if (this._client instanceof WorkerBasedMumbleClient) {
        // Note: the samplesPerPacket argument is handled in worker.js and not passed on
        this._outbound = this._client.createVoiceStream(this._settings.samplesPerPacket)
      } else {
        this._outbound = this._client.createVoiceStream()
      }

      this.emit('started_talking')
    }
    return this._outbound
  }

  _stopOutbound () {
    if (this._outbound) {
      this.emit('stopped_talking')
      this._outbound.end()
      this._outbound = null
    }
  }

  _final (callback) {
    this._stopOutbound()
    callback()
  }
}

export class ContinuousVoiceHandler extends VoiceHandler {
  constructor (client, settings) {
    super(client, settings)
  }

  _write (data, _, callback) {
    if (this._mute) {
      callback()
    } else {
      this._getOrCreateOutbound().write(data, callback)
    }
  }
}

export class PushToTalkVoiceHandler extends VoiceHandler {
  constructor (client, settings) {
    super(client, settings)
    this._key = settings.pttKey
    this._pushed = false
    this._keydown_handler = () => this._pushed = true
    this._keyup_handler = () => {
      this._stopOutbound()
      this._pushed = false
    }
    keyboardjs.bind(this._key, this._keydown_handler, this._keyup_handler)
  }

  _write (data, _, callback) {
    if (this._pushed && !this._mute) {
      this._getOrCreateOutbound().write(data, callback)
    } else {
      callback()
    }
  }

  _final (callback) {
    super._final(e => {
      keyboardjs.unbind(this._key, this._keydown_handler, this._keyup_handler)
      callback(e)
    })
  }
}

export class VADVoiceHandler extends VoiceHandler {
  constructor (client, settings) {
    super(client, settings)
    let level = settings.vadLevel
    this._vadThreshold = level
    this._activity = 0
    this._source = audioContext().createMediaStreamSource(theUserMedia)
    this._analyser = audioContext().createAnalyser()
    this._analyser.fftSize = 1024
    this._analyser.smoothingTimeConstant = 0.2
    this._source.connect(this._analyser)
    this._frequencies = new Uint8Array(this._analyser.frequencyBinCount)
    // Need to keep a backlog of the last ~150ms (dependent on sample rate)
    // because VAD will activate with ~125ms delay
    this._backlog = []
    this._backlogLength = 0
    this._backlogLengthMin = Math.ceil(audioContext().sampleRate * 0.15) * 4
  }

  _write (data, _, callback) {
    // Follow captured PCM blocks rather than a second ScriptProcessor clock.
    this._analyser.getByteFrequencyData(this._frequencies)
    const binWidth = audioContext().sampleRate / this._analyser.fftSize
    const firstBin = Math.round(85 / binWidth)
    const lastBin = Math.round(255 / binWidth)
    let average = 0
    for (let bin = firstBin; bin < lastBin; bin++) average += this._frequencies[bin] / 255
    average /= Math.max(1, lastBin - firstBin)
    const step = data.length / 4 / audioContext().sampleRate / (1024 / 48000)
    this._activity = Math.max(0, Math.min(60,
      this._activity + (average >= this._vadThreshold ? step : -step)))
    const active = this._activity > 5
    if (this._active && !active) this._stopOutbound()
    this._active = active
    this._level = Math.max(0, average - this._vadThreshold) / Math.max(0.001, 1 - this._vadThreshold)
    this.emit('level', this._level)
    if (this._active && !this._mute) {
      if (this._backlog.length > 0) {
        for (let oldData of this._backlog) {
          this._getOrCreateOutbound().write(oldData)
        }
        this._backlog = []
        this._backlogLength = 0
      }
      this._getOrCreateOutbound().write(data, callback)
    } else {
      // Make sure we always keep the backlog filled if we're not (yet) talking
      this._backlog.push(Buffer.from(data))
      this._backlogLength += data.length
      // Check if we can discard the oldest element without becoming too short
      while (this._backlogLength - this._backlog[0].length > this._backlogLengthMin) {
        this._backlogLength -= this._backlog.shift().length
      }
      callback()
    }
  }

  _final (callback) {
    super._final(e => {
      this._source.disconnect()
      this._analyser.disconnect()
      callback(e)
    })
  }
}

var theUserMedia = null

export function initVoice (onData) {
  return window.navigator.mediaDevices.getUserMedia({ audio: true }).then(async (userMedia) => {
    theUserMedia = userMedia
    await initAudio()
    const capture = createMicrophoneNode(userMedia, onData)
    if (capture) return userMedia
    var micStream = new MicrophoneStream(userMedia, {
      context: audioContext(), objectMode: true, bufferSize: 1024
    })
    micStream.on('data', data => {
      const samples = new Float32Array(data.getChannelData(0))
      onData(Buffer.from(samples.buffer))
    })
    return userMedia
  })
}
