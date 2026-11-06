const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

function processors (sampleRate) {
  const registered = {}
  class AudioWorkletProcessor {
    constructor () {
      this.port = { messages: [], postMessage (data) { this.messages.push(data) } }
    }
  }
  vm.runInNewContext(fs.readFileSync('app/audio-worklet.js', 'utf8'), {
    AudioWorkletProcessor, Float32Array, sampleRate,
    registerProcessor: (name, processor) => { registered[name] = processor }
  })
  return registered
}

for (const sampleRate of [44100, 48000]) {
  test(`capture owns its samples and preserves order at ${sampleRate} Hz`, () => {
    const Capture = processors(sampleRate)['mumble-microphone']
    const capture = new Capture()
    const input = new Float32Array(128)
    for (let block = 0; block < 24; block++) {
      for (let i = 0; i < input.length; i++) input[i] = block * 128 + i
      capture.process([[input]])
      input.fill(-1) // Browser reuses its input memory after each callback.
    }
    assert.equal(capture.port.messages.length, 3)
    capture.port.messages.forEach((chunk, block) => {
      for (let i = 0; i < chunk.length; i++) assert.equal(chunk[i], block * 1024 + i)
    })
  })

  test(`playback absorbs jitter, drains short speech, and closes at ${sampleRate} Hz`, () => {
    const Playback = processors(sampleRate)['mumble-playback']
    const playback = new Playback()
    const render = () => {
      const output = new Float32Array(128)
      const alive = playback.process([], [[output]])
      return { output, alive }
    }
    playback.port.onmessage({ data: new Float32Array(sampleRate * 0.02).fill(0.25) })
    assert.ok(render().output.every(value => value === 0))
    playback.port.onmessage({ data: new Float32Array(sampleRate * 0.06).fill(0.5) })
    assert.ok(render().output.every(value => value === 0.25))
    playback.port.onmessage({ data: { end: true } })
    let heard = 128
    let result
    do {
      result = render()
      heard += result.output.filter(value => value !== 0).length
    } while (result.alive)
    assert.equal(heard, sampleRate * 0.08)
    assert.deepEqual(playback.port.messages.map(value => value.drained), [true])

    const short = new Playback()
    short.port.onmessage({ data: new Float32Array(32).fill(0.75) })
    short.port.onmessage({ data: { end: true } })
    const output = new Float32Array(128)
    assert.equal(short.process([], [[output]]), false)
    assert.ok(output.subarray(0, 32).every(value => value === 0.75))
    assert.ok(output.subarray(32).every(value => value === 0))
  })
}

test('playback bounds latency after a long delivery stall', () => {
  const Playback = processors(48000)['mumble-playback']
  const playback = new Playback()
  for (let i = 0; i < 100; i++) {
    playback.port.onmessage({ data: new Float32Array(960).fill(i) })
  }
  assert.ok(playback.available <= 24000)
  const output = new Float32Array(128)
  playback.process([], [[output]])
  assert.equal(output[0], 75)
})
