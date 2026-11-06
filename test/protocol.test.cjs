const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Encoder, Decoder, messages } = require('mumble-streams').data

function roundTrip (name, payload) {
  return new Promise((resolve, reject) => {
    const encoder = new Encoder()
    const decoder = new Decoder()
    encoder.on('error', reject)
    decoder.on('error', reject)
    decoder.once('data', resolve)
    encoder.pipe(decoder)
    encoder.end({ name, payload })
  })
}

test('Mumble protobuf preserves field names and optional-field presence', async () => {
  const { payload } = await roundTrip('UserState', {
    session: 12, name: 'Visitor', self_mute: false, channel_id: 5,
    texture: Buffer.from([1, 2, 3])
  })
  assert.equal(payload.session, 12)
  assert.equal(payload.self_mute, false)
  assert.equal(payload.channel_id, 5)
  assert.equal(Object.hasOwn(payload, 'mute'), false)
  assert.equal(Object.hasOwn(payload, 'self_deaf'), false)
  assert.deepEqual(Array.from(payload.texture), [1, 2, 3])
})

test('Mumble text messages retain empty repeated fields', async () => {
  const { payload } = await roundTrip('TextMessage', { message: 'hello', channel_id: [0] })
  assert.equal(payload.message, 'hello')
  assert.deepEqual(payload.channel_id, [0])
  assert.deepEqual(payload.session, [])
  assert.deepEqual(payload.tree_id, [])
})

test('Mumble ping timestamps remain Long values and permission enums are available', async () => {
  const timestamp = Date.now()
  const { payload } = await roundTrip('Ping', { timestamp })
  assert.equal(payload.timestamp.toNumber(), timestamp)
  assert.equal(messages.PermissionDenied.DenyType.Permission, 1)
})

test('legacy avatar and description requests accept a single ID', async () => {
  const { payload } = await roundTrip('RequestBlob', {
    session_texture: 12, session_comment: 12, channel_description: 0
  })
  assert.deepEqual(payload.session_texture, [12])
  assert.deepEqual(payload.session_comment, [12])
  assert.deepEqual(payload.channel_description, [0])
})

test('avatar uploads accept browser ArrayBuffers', async () => {
  const { payload } = await roundTrip('UserState', { texture: new Uint8Array([1, 2, 3]).buffer })
  assert.deepEqual(Array.from(payload.texture), [1, 2, 3])
})

test('protobuf output matches the Mumble wire format', () => {
  const type = messages.Authenticate
  const wire = type.encode(type.fromObject({ username: 'A', opus: true })).finish()
  assert.equal(Buffer.from(wire).toString('hex'), '0a01412801')
})
