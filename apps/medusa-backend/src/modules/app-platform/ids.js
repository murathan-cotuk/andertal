'use strict'
const crypto = require('crypto')

const PREFIXES = { developer: 'dev', app: 'app', version: 'apv', installation: 'inst', token: 'tok', code: 'cod' }

function generateId(type) {
  const prefix = PREFIXES[type] || type
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`
}

module.exports = { generateId }
