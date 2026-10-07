'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

let sharp = null
try { sharp = require('sharp') } catch (_) {}

const { processProductImageToSquareWebp } = require('./routes/media')

const png = (width, height, background) =>
  sharp({ create: { width, height, channels: 4, background } }).png().toBuffer()

test('wide image is padded to a white square, never cropped', { skip: !sharp }, async () => {
  const input = await png(1600, 800, { r: 255, g: 0, b: 0, alpha: 1 })
  const out = await processProductImageToSquareWebp(input, 'image/png')
  const meta = await sharp(out).metadata()
  assert.equal(meta.format, 'webp')
  assert.equal(meta.width, 1600)
  assert.equal(meta.height, 1600)
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => [...data.slice((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)]
  assert.ok(px(10, 10).every((c) => c > 245), 'top padding is white')
  const mid = px(800, 800)
  assert.ok(mid[0] > 200 && mid[1] < 60 && mid[2] < 60, 'product (red) fully kept in the centre')
  assert.ok(px(5, 800)[0] > 200 && px(5, 800)[1] < 60, 'left edge of the product not cropped')
})

test('transparent background becomes white; output capped at 2000 px', { skip: !sharp }, async () => {
  const input = await png(3000, 3000, { r: 0, g: 0, b: 0, alpha: 0 })
  const out = await processProductImageToSquareWebp(input, 'image/png')
  const meta = await sharp(out).metadata()
  assert.equal(meta.width, 2000)
  const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true })
  assert.ok(data[0] > 245 && data[1] > 245 && data[2] > 245)
})

test('WebP input accepted; too small and unsupported types rejected', { skip: !sharp }, async () => {
  const webp = await sharp({ create: { width: 1200, height: 1000, channels: 3, background: '#00ff00' } }).webp().toBuffer()
  assert.ok((await processProductImageToSquareWebp(webp, 'image/webp')).length > 0)
  await assert.rejects(processProductImageToSquareWebp(await png(900, 900, '#000'), 'image/png'), { code: 'PRODUCT_IMAGE_MIN_SIZE' })
  await assert.rejects(processProductImageToSquareWebp(Buffer.from('x'), 'image/gif'), { code: 'PRODUCT_IMAGE_TYPE' })
})
