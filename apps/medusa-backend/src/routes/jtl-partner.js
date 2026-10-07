'use strict'
const { Router } = require('express')
const jtl = require('../jtl-partner')
const { sendEmail } = require('../email')

/**
 * Billing → JTL (docs/jtl.md Faz C/D). Superuser only. The 1 % JTL partner commission is a
 * platform liability — nothing here reads or writes seller money.
 */
module.exports = function createJtlPartnerRouter() {
  const router = Router()
  const getDbClient = () => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    if (!dbUrl || !dbUrl.startsWith('postgres')) return null
    const { Client } = require('pg')
    return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  }
  const actorOf = (req) => `superuser:${req.sellerUser?.email || req.sellerUser?.seller_id || '?'}`
  const superOnly = (fn) => async (req, res) => {
    if (req.sellerUser?.is_superuser !== true) return res.status(403).json({ message: 'Superuser access required' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      await fn(req, res, client)
    } catch (e) {
      if (!res.headersSent) res.status(e?.status || 500).json({ message: e?.message || 'Error' })
    } finally {
      try { await client.end() } catch (_) {}
    }
  }
  const periodOrDefault = (req) => String(req.query.period || req.body?.period || jtl.previousQuarter()).trim()

  // Summary + per-seller rows + attributed sellers for one quarter (default: last quarter).
  router.get('/admin-hub/v1/billing/jtl', superOnly(async (req, res, client) => {
    const report = await jtl.jtlQuarterReport(client, periodOrDefault(req))
    res.json({ ...report, recipient: jtl.reportRecipient(), auto_send: String(process.env.JTL_REPORT_AUTO_SEND || '').toLowerCase() === 'true' })
  }))

  router.get('/admin-hub/v1/billing/jtl/export.csv', superOnly(async (req, res, client) => {
    const report = await jtl.jtlQuarterReport(client, periodOrDefault(req))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="andertal-jtl-reporting-${report.period}.csv"`)
    res.send('﻿' + jtl.reportCsv(report))
  }))

  // Manual attribution (connector sign-up calls attributeJtlSeller directly with source jtl_scx_signup).
  router.post('/admin-hub/v1/billing/jtl/attribute', superOnly(async (req, res, client) => {
    const out = await jtl.attributeJtlSeller(client, {
      sellerId: req.body?.seller_id,
      externalId: req.body?.jtl_external_id || null,
      source: 'manual_superuser',
      actor: actorOf(req),
    })
    res.json(out)
  }))

  router.post('/admin-hub/v1/billing/jtl/end', superOnly(async (req, res, client) => {
    res.json({ ended: await jtl.endJtlAttribution(client, { sellerId: req.body?.seller_id, actor: actorOf(req) }) })
  }))

  // Send the quarterly report: confirm_accuracy required; dry_run sends only to the caller.
  router.post('/admin-hub/v1/billing/jtl/send-report', superOnly(async (req, res, client) => {
    const dryRun = req.body?.dry_run === true
    const out = await jtl.sendJtlReport(client, {
      period: periodOrDefault(req),
      confirmAccuracy: req.body?.confirm_accuracy === true,
      actor: actorOf(req),
      dryRun,
      recipient: dryRun ? (req.body?.recipient || req.sellerUser?.email || null) : null,
      cc: dryRun ? null : (process.env.JTL_REPORT_CC || req.sellerUser?.email || null),
      sendEmail,
    })
    res.json({ send: out.send, totals: out.report.totals })
  }))

  router.get('/admin-hub/v1/billing/jtl/sends', superOnly(async (req, res, client) => {
    const r = await client.query(`SELECT * FROM jtl_report_sends ORDER BY created_at DESC LIMIT 50`)
    res.json({ sends: r.rows })
  }))

  return router
}

/** Daily tick for the opt-in auto report (server.js schedules it). */
module.exports.runJtlAutoReport = async function runJtlAutoReport() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  try {
    await client.connect()
    return await jtl.autoSendDueJtlReport(client, { sendEmail })
  } finally {
    try { await client.end() } catch (_) {}
  }
}
