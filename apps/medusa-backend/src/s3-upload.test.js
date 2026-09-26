'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('s3-upload helpers', () => {
  it('publicUrlForUploadsPath maps /uploads/media to R2 key without uploads prefix', () => {
    process.env.S3_UPLOAD_BUCKET = 'test-bucket'
    process.env.S3_UPLOAD_REGION = 'auto'
    process.env.S3_UPLOAD_PUBLIC_BASE_URL = 'https://pub-test.r2.dev'
    // Re-require after env set
    delete require.cache[require.resolve('./s3-upload')]
    const { publicUrlForUploadsPath } = require('./s3-upload')
    assert.equal(
      publicUrlForUploadsPath('/uploads/media/shop/a.webp'),
      'https://pub-test.r2.dev/media/shop/a.webp',
    )
    assert.equal(
      publicUrlForUploadsPath('https://api.example.com/uploads/media/x.png'),
      'https://pub-test.r2.dev/media/x.png',
    )
  })
})
