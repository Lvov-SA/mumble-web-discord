const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dist = path.resolve(__dirname, '../dist')

test('built images, including icons inside Knockout templates, are shipped in dist', () => {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
  const images = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)]
  assert.ok(images.length > 20, 'Check both toolbar and template images')
  for (const [, src] of images) {
    const target = path.resolve(dist, src)
    assert.ok(target.startsWith(dist + path.sep), `Image escapes dist: ${src}`)
    assert.ok(fs.statSync(target).isFile(), `Image missing from dist: ${src}`)
  }
  assert.match(html, /<script type="text\/html" id="channel">/)
  assert.doesNotMatch(html, /mumble-build-template/)
})
