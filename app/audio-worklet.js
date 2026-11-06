// Runs on the audio rendering thread, independently of page rendering/timers.
class MicrophoneProcessor extends AudioWorkletProcessor {
  constructor () {
    super()
    this.buffer = new Float32Array(1024)
    this.offset = 0
  }

  process (inputs) {
    const channels = inputs[0]
    if (!channels || !channels.length) return true
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0
      for (const channel of channels) sample += channel[i]
      this.buffer[this.offset++] = sample / channels.length
      if (this.offset === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer])
        this.buffer = new Float32Array(1024)
        this.offset = 0
      }
    }
    // Output stays silent: never play the microphone through the speakers.
    return true
  }
}

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor () {
    super()
    this.queue = []
    this.offset = 0
    this.available = 0
    this.started = false
    this.ended = false
    this.port.onmessage = ({ data }) => {
      if (data.end) {
        this.ended = true
      } else {
        this.queue.push(data)
        this.available += data.length
        // Discard stale audio after a long stall instead of accumulating delay.
        while (this.available > sampleRate * 0.5 && this.queue.length > 1) {
          this.available -= this.queue.shift().length - this.offset
          this.offset = 0
        }
      }
    }
  }

  process (inputs, outputs) {
    const output = outputs[0][0]
    if (!this.started && (this.available >= sampleRate * 0.06 || this.ended)) {
      this.started = true
    }
    if (this.started) {
      let written = 0
      while (written < output.length && this.queue.length) {
        const chunk = this.queue[0]
        const count = Math.min(output.length - written, chunk.length - this.offset)
        output.set(chunk.subarray(this.offset, this.offset + count), written)
        this.offset += count
        this.available -= count
        written += count
        if (this.offset === chunk.length) {
          this.queue.shift()
          this.offset = 0
        }
      }
      if (!this.available) this.started = false
    }
    if (this.ended && !this.available) {
      this.port.postMessage({ drained: true })
      return false
    }
    return true
  }
}

registerProcessor('mumble-microphone', MicrophoneProcessor)
registerProcessor('mumble-playback', PlaybackProcessor)
