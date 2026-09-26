'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { isAlreadyHostedUrl, mapPool } = require('./remote-image-ingest')

describe('remote-image-ingest helpers', () => {
  it('isAlreadyHostedUrl recognizes relative uploads and r2.dev', () => {
    assert.equal(isAlreadyHostedUrl('/uploads/media/x.webp'), true)
    assert.equal(isAlreadyHostedUrl('https://pub-abc.r2.dev/media/x.webp'), true)
    assert.equal(isAlreadyHostedUrl('https://cdn.example.com/photo.jpg'), false)
  })

  it('mapPool respects concurrency and order', async () => {
    const items = [1, 2, 3, 4, 5]
    const out = await mapPool(items, 2, async (n) => n * 10)
    assert.deepEqual(out, [10, 20, 30, 40, 50])
  })
})
