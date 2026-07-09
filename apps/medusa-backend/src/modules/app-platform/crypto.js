'use strict'
const crypto = require('crypto')

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

function timingSafeEqual(a, b) {
  try {
    const bufA = Buffer.from(String(a), 'utf8')
    const bufB = Buffer.from(String(b), 'utf8')
    if (bufA.length !== bufB.length) {
      // Avoid short-circuit: still run compare on equal-size buffers to prevent timing leaks
      crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length))
      return false
    }
    return crypto.timingSafeEqual(bufA, bufB)
  } catch { return false }
}

function generateSecret() {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCode() {
  return crypto.randomBytes(24).toString('base64url')
}

module.exports = { hashSecret, timingSafeEqual, generateSecret, generateCode }
