'use strict'
const { generateId }                       = require('./ids')
const { hashSecret, generateSecret, generateCode, timingSafeEqual } = require('./crypto')
const { validateManifest, validateTierTypeMatch }  = require('./manifest-validator')
const { getScopeDescription }              = require('./scope-registry')

const DEV_JWT_SECRET = (() => {
  const s = process.env.DEVELOPER_JWT_SECRET || process.env.APP_PLATFORM_JWT_SECRET || ''
  if (!s && process.env.NODE_ENV === 'production') {
    console.error('[SECURITY] DEVELOPER_JWT_SECRET env var is not set!')
  }
  return s || 'dev-only-app-platform-secret-change-in-prod'
})()

const DEV_TOKEN_TTL   = 7 * 24 * 3600   // 7 days
const ACCESS_TTL      = Number(process.env.OAUTH_ACCESS_TOKEN_TTL_SECONDS  || 86400)   // 24h
const REFRESH_TTL     = Number(process.env.OAUTH_REFRESH_TOKEN_TTL_SECONDS || 5184000) // 60d
const CODE_TTL        = Number(process.env.OAUTH_CODE_TTL_SECONDS          || 600)     // 10m

function signDeveloperToken(payload) {
  const _c = require('crypto')
  const h = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')
  const b = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + DEV_TOKEN_TTL })).toString('base64url')
  const sig = _c.createHmac('sha256', DEV_JWT_SECRET).update(`${h}.${b}`).digest('base64url')
  return `${h}.${b}.${sig}`
}

function verifyDeveloperToken(token) {
  if (!token) return null
  try {
    const _c = require('crypto')
    const [h, b, sig] = token.split('.')
    if (!h || !b || !sig) return null
    const expected = _c.createHmac('sha256', DEV_JWT_SECRET).update(`${h}.${b}`).digest('base64url')
    if (!timingSafeEqual(sig, expected)) return null
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString())
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null
    return payload
  } catch { return null }
}

module.exports = {
  generateId, hashSecret, generateSecret, generateCode, timingSafeEqual,
  validateManifest, validateTierTypeMatch, getScopeDescription,
  signDeveloperToken, verifyDeveloperToken,
  ACCESS_TTL, REFRESH_TTL, CODE_TTL,
}
