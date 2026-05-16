const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  decodeMultipartFilename,
  fixUtf8Mojibake,
  sanitizeStorageBasename,
} = require('./media-filename')

describe('media-filename', () => {
  it('fixes latin1-misread UTF-8 (weiß)', () => {
    const broken = Buffer.from('weiß.png', 'utf8').toString('latin1')
    assert.equal(fixUtf8Mojibake(broken), 'weiß.png')
    assert.equal(decodeMultipartFilename(broken), 'weiß.png')
  })

  it('keeps correct UTF-8 unchanged', () => {
    assert.equal(decodeMultipartFilename('日本語.jpg'), '日本語.jpg')
    assert.equal(decodeMultipartFilename('café.png'), 'café.png')
  })

  it('sanitizeStorageBasename strips path chars only', () => {
    assert.equal(sanitizeStorageBasename('weiß.png'), 'weiß.png')
    const safe = sanitizeStorageBasename('../evil/weiß.png')
    assert.equal(safe, 'weiß.png')
    assert.ok(!safe.includes('/'))
  })
})
