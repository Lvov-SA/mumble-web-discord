import audioContext from 'audio-context'
import LegacyBufferQueueNode from 'web-audio-buffer-queue'
import workletUrl from '!!file-loader?name=audio-worklet.[hash].js!./audio-worklet.js'

let workletReady
let workletSupported = false

export function initAudio () {
  const context = audioContext()
  if (!workletReady) {
    workletReady = context.audioWorklet
      ? context.audioWorklet.addModule(workletUrl).then(() => { workletSupported = true })
      : Promise.resolve()
  }
  return workletReady
}

export function createMicrophoneNode (stream, onData) {
  if (!workletSupported) return null
  const context = audioContext()
  const source = context.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(context, 'mumble-microphone')
  node.port.onmessage = ({ data }) => onData(Buffer.from(data.buffer))
  source.connect(node)
  node.connect(context.destination)
  return { source, node }
}

export default class BufferQueueNode {
  constructor () {
    const context = audioContext()
    if (!workletSupported) {
      this._legacy = new LegacyBufferQueueNode({ audioContext: context })
      return
    }
    this._node = new AudioWorkletNode(context, 'mumble-playback', {
      numberOfInputs: 0,
      outputChannelCount: [1]
    })
    this._node.port.onmessage = ({ data }) => {
      if (data.drained) {
        this._node.disconnect()
        this._node.port.close()
      }
    }
  }

  connect (destination) {
    return (this._legacy || this._node).connect(destination)
  }

  write (buffer) {
    if (this._legacy) return this._legacy.write(buffer)
    // Copy exactly this view; Buffer may occupy only part of its ArrayBuffer.
    const copy = new Uint8Array(buffer.byteLength)
    copy.set(buffer)
    const samples = new Float32Array(copy.buffer)
    this._node.port.postMessage(samples, [samples.buffer])
    return true
  }

  end () {
    if (this._legacy) return this._legacy.end()
    this._node.port.postMessage({ end: true })
  }
}
