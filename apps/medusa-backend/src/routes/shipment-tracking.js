'use strict'
const { Router } = require('express')
const { runAutomationFlowsForOrder } = require('../flow-automation')
const { enqueueFlowEvent } = require('../flow-queue')
const { chargeSellerForLabel } = require('../seller-billing')
const { sqlOrderOwnedBySeller } = require('../seller-scope')

// Dispatches order-related automation flow triggers via the queue, falling back to immediate execution.
// (Mirrors the helper in orders.js — kept separate since these two route files aren't shared modules.)
const dispatchOrderFlowEvent = async (triggerKey, orderId) => {
  const tk = String(triggerKey || '').trim()
  const oid = String(orderId || '').trim()
  if (!tk || !oid) return
  try {
    const queued = await enqueueFlowEvent('order-flow-event', { triggerKey: tk, orderId: oid })
    if (queued) return
  } catch (qe) {
    console.warn('[flow-queue] enqueue order event failed, fallback immediate:', qe?.message || qe)
  }
  setImmediate(() => {
    runAutomationFlowsForOrder({ triggerKey: tk, orderId: oid }).catch((fe) => {
      console.warn(`runAutomationFlowsForOrder ${tk}:`, fe?.message || fe)
    })
  })
}

module.exports = function createShipmentTrackingRouter({
  logSellerError,
  loadPlatformCheckoutRow,
  resolveStripeSecretKeyFromPlatform,
}) {
    // ─── Shipment Events & Tracking ───────────────────────────────────────────

    const DEFAULT_TRACKING_URLS = {
      'dhl': 'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?lang=de&idc={tracking_number}',
      'dpd': 'https://tracking.dpd.de/status/de_DE/parcel/{tracking_number}',
      'gls': 'https://gls-group.com/track/{tracking_number}',
      'ups': 'https://www.ups.com/track?tracknum={tracking_number}&loc=de_DE',
      'fedex': 'https://www.fedex.com/fedextrack/?trknbr={tracking_number}',
      'hermes': 'https://www.myhermes.de/empfangen/sendungsverfolgung/#/search?trackNumber={tracking_number}',
      'go! express': 'https://www.general-overnight.com/sendungsverfolgung/?tracking={tracking_number}',
      'go express': 'https://www.general-overnight.com/sendungsverfolgung/?tracking={tracking_number}',
    }
    function buildTrackingUrl(carrierName, trackingNumber, urlTemplate) {
      if (!trackingNumber) return null
      const tn = encodeURIComponent(String(trackingNumber).trim())
      const applyTemplate = (tpl) => tpl.replace(/\{tracking_number\}/g, tn).replace(/\{tracking\}/g, tn)
      if (urlTemplate) return applyTemplate(urlTemplate)
      const key = (carrierName || '').toLowerCase().trim()
      const tpl = DEFAULT_TRACKING_URLS[key]
      if (tpl) return applyTemplate(tpl)
      return null
    }

    // Returns order row if the caller sold a line on this order (not merely catalog-owns the SKU).
    const sellerOrderAccessSQL = (isSuperuser) => isSuperuser
      ? ''
      : ` AND ${sqlOrderOwnedBySeller('store_orders', '$2')}`

    const adminHubShipmentEventsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = isSuperuser ? null : (req.sellerUser?.seller_id || null)
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'order id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ownerCheck = await client.query(
          'SELECT id, carrier_name, tracking_number FROM store_orders WHERE id=$1::uuid' + sellerOrderAccessSQL(isSuperuser),
          isSuperuser ? [id] : [id, callerSellerId]
        )
        if (!ownerCheck.rows[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const order = ownerCheck.rows[0]
        const evRes = await client.query('SELECT * FROM store_shipment_events WHERE order_id=$1::uuid ORDER BY event_time ASC, created_at ASC', [id])
        const carrierRes = await client.query(`SELECT tracking_url_template FROM store_shipping_carriers WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) AND is_active=true LIMIT 1`, [order.carrier_name || ''])
        const urlTemplate = carrierRes.rows[0]?.tracking_url_template || null
        const trackingUrl = buildTrackingUrl(order.carrier_name, order.tracking_number, urlTemplate)
        await client.end()
        res.json({ events: evRes.rows || [], trackingUrl })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubShipmentEventPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = isSuperuser ? null : (req.sellerUser?.seller_id || null)
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'order id required' })
      const { status, description, location, event_time } = req.body || {}
      if (!status) return res.status(400).json({ message: 'status required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ownerCheck = await client.query(
          'SELECT id FROM store_orders WHERE id=$1::uuid' + sellerOrderAccessSQL(isSuperuser),
          isSuperuser ? [id] : [id, callerSellerId]
        )
        if (!ownerCheck.rows[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const evRes = await client.query(
          `INSERT INTO store_shipment_events (order_id, status, description, location, event_time, source) VALUES ($1::uuid, $2, $3, $4, $5, 'manual') RETURNING *`,
          [id, status, description || null, location || null, event_time ? new Date(event_time).toISOString() : new Date().toISOString()]
        )
        const event = evRes.rows[0]
        let firedTrigger = null
        if (status === 'zugestellt') {
          // A seller's own "delivered" entry is recorded for display only — it never sets the
          // payout-relevant delivery date (settlement: carrier webhook / carrier API / superuser).
          const upd = isSuperuser
            ? await client.query(`UPDATE store_orders SET delivery_status='zugestellt', delivery_date=COALESCE(delivery_date, now()), updated_at=now() WHERE id=$1::uuid AND delivery_status != 'zugestellt'`, [id])
            : await client.query(`UPDATE store_orders SET delivery_status='zugestellt', seller_reported_delivered_at=COALESCE(seller_reported_delivered_at, now()), updated_at=now() WHERE id=$1::uuid AND delivery_status != 'zugestellt'`, [id])
          await client.query(`UPDATE store_orders SET order_status='abgeschlossen', updated_at=now() WHERE id=$1::uuid AND payment_status='bezahlt' AND delivery_status='zugestellt' AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`, [id])
          if (isSuperuser) {
            const { confirmDelivery } = require('../settlement/payables')
            await confirmDelivery(client, id, { source: 'superuser', at: event.event_time ? new Date(event.event_time) : new Date(), actor: `superuser:${req.sellerUser?.email || ''}` }).catch((e) => console.warn('confirmDelivery:', e?.message))
          }
          if (upd.rowCount > 0) firedTrigger = 'order_delivered'
        } else if (status === 'versendet') {
          const upd = await client.query(`UPDATE store_orders SET delivery_status='versendet', updated_at=now() WHERE id=$1::uuid AND delivery_status NOT IN ('versendet','zugestellt')`, [id])
          if (upd.rowCount > 0) firedTrigger = 'order_shipped'
        }
        await client.end()
        res.json({ event })
        if (firedTrigger) void dispatchOrderFlowEvent(firedTrigger, id)
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubShipmentEventDELETE = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = isSuperuser ? null : (req.sellerUser?.seller_id || null)
      const eventId = (req.params.eventId || '').trim()
      if (!eventId) return res.status(400).json({ message: 'eventId required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const sellerEventAccessSQL = isSuperuser ? '' : ` AND ${sqlOrderOwnedBySeller('o', '$2')}`
        const ownerCheck = await client.query(
          `SELECT e.id FROM store_shipment_events e JOIN store_orders o ON o.id=e.order_id WHERE e.id=$1::uuid` + sellerEventAccessSQL,
          isSuperuser ? [eventId] : [eventId, callerSellerId]
        )
        if (!ownerCheck.rows[0]) { await client.end(); return res.status(404).json({ message: 'Event not found' }) }
        if (!isSuperuser) {
          await client.end()
          return res.status(403).json({ message: 'Shipment events cannot be deleted' })
        }
        await client.query('DELETE FROM store_shipment_events WHERE id=$1::uuid', [eventId])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ─── Carrier API Tracking Refresh ─────────────────────────────────────────

    /**
     * Maps DHL event status codes / descriptions to our internal status values.
     * https://developer.dhl.com/api-reference/shipment-tracking
     * Packstation/Filiale: pickup by consignee = final delivery for our order flow → zugestellt
     */
    function mapDhlStatus(event) {
      const st = event?.status && typeof event.status === 'object' ? event.status : {}
      const code = String(st.statusCode || event?.statusCode || '').toUpperCase().replace(/-/g, '_')
      const desc = String(st.description || st.status || event?.description || '').toLowerCase()
      // Delivered to door or parcel locker / Filiale pickup (customer has the parcel)
      if (
        code === 'DELIVERED' ||
        code === 'PICKED_UP' ||
        code === 'PICKED_UP_BY_CONSIGNEE' ||
        code === 'CONSIGNMENT_PICKED_UP' ||
        code === 'SUCCESSFULLY_DELIVERED'
      ) return 'zugestellt'
      if (desc.includes('zugestellt') || desc.includes('successfully delivered') || desc.includes('erfolgreich zugestellt')) return 'zugestellt'
      if (desc.includes('abholung in der filiale') || desc.includes('abholung in der packstation')) return 'zugestellt'
      if (desc.includes('filiale') && desc.includes('abholung') && (desc.includes('erfolgt') || desc.includes('erfolgreich'))) return 'zugestellt'
      if (desc.includes('packstation') && (desc.includes('abgeholt') || desc.includes('abholung'))) return 'zugestellt'
      if (desc.includes('wunschfiliale') && desc.includes('bereit')) return 'in_transit'
      if (code === 'OUT_FOR_DELIVERY' || desc.includes('zur zustellung') || desc.includes('out for delivery')) return 'in_transit'
      if (code === 'IN_TRANSIT' || code === 'TRANSIT' || desc.includes('transport') || desc.includes('weitertransport') || desc.includes('in transit')) return 'in_transit'
      if (code === 'EXCEPTION' || desc.includes('ausnahme') || desc.includes('exception') || desc.includes('fehler')) return 'exception'
      if (code === 'PRE_TRANSIT' || desc.includes('aufgegeben') || desc.includes('pre-transit') || desc.includes('vorbereitung') || desc.includes('elektronisch angekündigt')) return 'versendet'
      return 'in_transit'
    }

    const adminHubOrderRefreshTrackingPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = isSuperuser ? null : (req.sellerUser?.seller_id || null)
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'order id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ownerQ = await client.query(
          'SELECT id, seller_id, carrier_name, tracking_number, postal_code FROM store_orders WHERE id=$1::uuid' + sellerOrderAccessSQL(isSuperuser),
          isSuperuser ? [id] : [id, callerSellerId]
        )
        if (!ownerQ.rows[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        let order = ownerQ.rows[0]
        // Multi-seller order: each seller's parcel has its own tracking number (order_shipments).
        // A seller refreshes their own parcel; the superuser may name one via body.tracking_number.
        // Without a match the order-level (last entered) tracking number is used as before.
        try {
          const wanted = String(req.body?.tracking_number || '').trim().toLowerCase()
          const ships = (await client.query(
            `SELECT seller_id, carrier_name, tracking_number FROM order_shipments
              WHERE order_id = $1::uuid AND NULLIF(TRIM(tracking_number), '') IS NOT NULL ORDER BY updated_at DESC`,
            [id],
          )).rows
          const mine = (s) => isSuperuser || String(s.seller_id) === String(callerSellerId || '')
          const pick = wanted
            ? ships.find((s) => String(s.tracking_number).trim().toLowerCase() === wanted && mine(s))
            : (!isSuperuser ? ships.find(mine) : null)
          if (pick) order = { ...order, seller_id: pick.seller_id, carrier_name: pick.carrier_name || order.carrier_name, tracking_number: pick.tracking_number }
        } catch (_) { /* order_shipments missing on an old DB → order-level tracking */ }
        if (!order.tracking_number) { await client.end(); return res.json({ events: [], message: 'No tracking number' }) }

        // Look up carrier API key + tracking URL template from DB (env fallback so tracking works without per-carrier key).
        // Prefer the order's OWN seller's carrier config (each seller can register their own account/credentials
        // for the same carrier brand), falling back to the platform-wide entry (seller_id IS NULL) if the seller
        // hasn't configured one themselves.
        const carrierQ = await client.query(
          `SELECT name, tracking_url_template, api_key, api_secret FROM store_shipping_carriers
           WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) AND is_active=true AND (seller_id = $2 OR seller_id IS NULL)
           ORDER BY (seller_id IS NOT NULL) DESC LIMIT 1`,
          [order.carrier_name || '', order.seller_id || null]
        )
        const carrierRow = carrierQ.rows[0] || {}
        const carrierName = String(order.carrier_name || '').trim().toLowerCase()
        const trackingNumber = String(order.tracking_number || '').trim()
        const envDhlKey = (process.env.DHL_API_KEY || process.env.DHL_TRACK_API_KEY || process.env.DHLPARCEL_API_KEY || '').toString().trim()
        const apiKey = (carrierRow.api_key && String(carrierRow.api_key).trim()) || envDhlKey || null

        let newEvents = []
        let fetchError = null

        // ── DHL API ──────────────────────────────────────────────────────────
        if (carrierName === 'dhl' || carrierName.startsWith('dhl')) {
          if (!apiKey) {
            fetchError = 'DHL-API-Key fehlt: unter Einstellungen → Versand → Versanddienstleister „DHL“ einen API-Key eintragen, oder Umgebungsvariable DHL_API_KEY setzen.'
          } else try {
            const https = require('https')
            const pc = String(order.postal_code || '').trim().replace(/\s+/g, '')
            let path = `/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`
            if (pc) path += `&recipientPostalCode=${encodeURIComponent(pc)}`
            const dhlData = await new Promise((resolve, reject) => {
              const r = https.request(
                { hostname: 'api-eu.dhl.com', path, method: 'GET', headers: { 'DHL-API-Key': apiKey, Accept: 'application/json' } },
                (resp) => {
                  let body = ''
                  resp.on('data', (d) => { body += d })
                  resp.on('end', () => {
                    let parsed = {}
                    try {
                      parsed = JSON.parse(body || '{}')
                    } catch {
                      parsed = { _raw: body }
                    }
                    parsed._httpStatus = resp.statusCode
                    resolve(parsed)
                  })
                }
              )
              r.on('error', reject)
              r.end()
            })
            if (dhlData._httpStatus >= 400) {
              const detail = dhlData.detail || dhlData.title || dhlData.message || JSON.stringify(dhlData).slice(0, 200)
              fetchError = `DHL API (${dhlData._httpStatus}): ${detail}`
            } else {
              const shipment = dhlData?.shipments?.[0] || dhlData?.shipment || null
              let events = Array.isArray(shipment?.events) ? shipment.events : []
              if (!events.length && shipment?.status) {
                events = [{ timestamp: shipment.timestamp, status: shipment.status, location: shipment.location }]
              }
              for (const ev of events) {
                const tsRaw = ev.timestamp || ev.eventTimestamp || ev.status?.timestamp
                const ts = tsRaw ? new Date(tsRaw).toISOString() : new Date().toISOString()
                const addr = ev.location?.address || {}
                const location = [addr.addressLocality, addr.countryCode].filter(Boolean).join(', ') || null
                const desc = (ev.description || ev.status?.description || ev.status?.status || '').trim()
                const status = mapDhlStatus(ev)
                newEvents.push({ status, description: desc || '—', location, event_time: ts })
              }
              newEvents.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
            }
          } catch (e) {
            fetchError = e?.message || 'DHL API error'
          }
        }
        // ── DPD API (public REST, no key required) ───────────────────────────
        else if (carrierName === 'dpd' || carrierName.startsWith('dpd')) {
          try {
            const https = require('https')
            const dpdData = await new Promise((resolve) => {
              const path = `/parcel/${encodeURIComponent(trackingNumber)}/de_DE/parcelstatus`
              const req2 = https.request(
                { hostname: 'tracking.dpd.de', path, method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } },
                (resp) => {
                  let body = ''; resp.on('data', d => { body += d }); resp.on('end', () => { try { resolve({ data: JSON.parse(body), status: resp.statusCode }) } catch { resolve({ data: {}, status: resp.statusCode }) } })
                }
              )
              req2.on('error', () => resolve({ data: {}, status: 0 })); req2.end()
            })
            if (dpdData.status >= 400) {
              fetchError = `DPD (${dpdData.status}): Sendung nicht gefunden`
            } else {
              const steps = dpdData.data?.parcelStatusList || []
              for (const step of steps) {
                const desc = (step.label || step.description || '').trim()
                const rawDate = step.date || ''; const rawTime = step.time || '00:00:00'
                const ts = rawDate ? new Date(`${rawDate}T${rawTime}`).toISOString() : new Date().toISOString()
                const loc = step.city || null
                const descLower = desc.toLowerCase()
                let status = 'in_transit'
                if (descLower.includes('zugestellt') || descLower.includes('übergeben an') || descLower.includes('delivered')) status = 'zugestellt'
                else if (descLower.includes('aufgabe') || descLower.includes('übergabe an dpd') || descLower.includes('abgegeben')) status = 'versendet'
                newEvents.push({ status, description: desc || '—', location: loc, event_time: ts })
              }
              if (newEvents.length) newEvents.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
            }
          } catch (e) { fetchError = e?.message || 'DPD Tracking error' }
        }
        // ── GLS API (public REST, no key required) ───────────────────────────
        else if (carrierName === 'gls' || carrierName.startsWith('gls')) {
          try {
            const https = require('https')
            const glsData = await new Promise((resolve) => {
              const path = `/app/service/open/rest/DE/de/rstt001/?match=${encodeURIComponent(trackingNumber)}&type=standard&caller=witt&milis=${Date.now()}`
              const req2 = https.request(
                { hostname: 'gls-group.com', path, method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } },
                (resp) => {
                  let body = ''; resp.on('data', d => { body += d }); resp.on('end', () => { try { resolve({ data: JSON.parse(body), status: resp.statusCode }) } catch { resolve({ data: {}, status: resp.statusCode }) } })
                }
              )
              req2.on('error', () => resolve({ data: {}, status: 0 })); req2.end()
            })
            if (glsData.status >= 400) {
              fetchError = `GLS (${glsData.status}): Sendung nicht gefunden`
            } else {
              const tuples = glsData.data?.tuples || []
              for (const tuple of tuples) {
                for (const ev of (tuple.history || [])) {
                  const desc = (ev.evtDscr || ev.description || '').trim()
                  const dateStr = ev.date || ''; const timeStr = ev.time || '00:00'
                  const ts = dateStr ? new Date(`${dateStr}T${timeStr}:00`).toISOString() : new Date().toISOString()
                  const loc = ev.location || null
                  const descLower = desc.toLowerCase()
                  let status = 'in_transit'
                  if (descLower.includes('zugestellt') || descLower.includes('delivered')) status = 'zugestellt'
                  else if (descLower.includes('aufgabe') || descLower.includes('einlieferung') || descLower.includes('paketshop')) status = 'versendet'
                  newEvents.push({ status, description: desc || '—', location: loc, event_time: ts })
                }
              }
              if (newEvents.length) newEvents.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
            }
          } catch (e) { fetchError = e?.message || 'GLS Tracking error' }
        }
        // ── UPS API (requires Client-ID + Secret as api_key:api_secret) ──────
        else if (carrierName === 'ups') {
          if (!apiKey) {
            fetchError = 'UPS Client-ID fehlt: unter Einstellungen → Versand → Versanddienstleister „UPS" API-Key (Client-ID) und ggf. API-Secret eintragen.'
          } else {
            try {
              const https = require('https')
              const apiSecret = (carrierRow.api_secret && String(carrierRow.api_secret).trim()) || ''
              const creds = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
              const tokenBody = 'grant_type=client_credentials'
              const tokenData = await new Promise((resolve) => {
                const req2 = https.request(
                  { hostname: 'onlinetools.ups.com', path: '/security/v1/oauth/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}`, 'Content-Length': Buffer.byteLength(tokenBody) } },
                  (resp) => { let b = ''; resp.on('data', d => { b += d }); resp.on('end', () => { try { resolve(JSON.parse(b)) } catch { resolve({}) } }) }
                )
                req2.on('error', () => resolve({})); req2.write(tokenBody); req2.end()
              })
              const accessToken = tokenData.access_token
              if (!accessToken) {
                fetchError = 'UPS OAuth2 fehlgeschlagen — Client-ID und Secret prüfen.'
              } else {
                const upsData = await new Promise((resolve) => {
                  const req2 = https.request(
                    { hostname: 'onlinetools.ups.com', path: `/api/track/v1/details/${encodeURIComponent(trackingNumber)}`, method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, transId: `order-${id}`, transactionSrc: 'andertal', Accept: 'application/json' } },
                    (resp) => { let b = ''; resp.on('data', d => { b += d }); resp.on('end', () => { try { resolve({ data: JSON.parse(b), status: resp.statusCode }) } catch { resolve({ data: {}, status: resp.statusCode }) } }) }
                  )
                  req2.on('error', () => resolve({ data: {}, status: 0 })); req2.end()
                })
                if (upsData.status >= 400) {
                  fetchError = `UPS API (${upsData.status}): ${upsData.data?.response?.errors?.[0]?.message || 'Fehler'}`
                } else {
                  const activities = upsData.data?.trackResponse?.shipment?.[0]?.package?.[0]?.activity || []
                  for (const act of activities) {
                    const desc = (act.status?.description || '').trim()
                    const loc = [act.location?.address?.city, act.location?.address?.countryCode].filter(Boolean).join(', ') || null
                    const d = act.date || ''; const t = act.time || '000000'
                    const ts = d.length === 8 ? new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`).toISOString() : new Date().toISOString()
                    const statusCode = String(act.status?.type || '').toUpperCase()
                    let status = 'in_transit'
                    if (statusCode === 'D' || statusCode === 'P') status = 'zugestellt'
                    else if (statusCode === 'M' || statusCode === 'O') status = 'versendet'
                    newEvents.push({ status, description: desc || '—', location: loc, event_time: ts })
                  }
                  if (newEvents.length) newEvents.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
                }
              }
            } catch (e) { fetchError = e?.message || 'UPS API error' }
          }
        }

        if (!newEvents.length) {
          const evFallback = await client.query('SELECT * FROM store_shipment_events WHERE order_id=$1::uuid ORDER BY event_time ASC, created_at ASC', [id])
          await client.end()
          let msg = fetchError
          if (!msg) {
            if (carrierName === 'dhl' || carrierName.startsWith('dhl')) {
              msg = 'Keine neuen Ereignisse von DHL — ggf. bereits synchron oder Sendung noch nicht im DHL-System.'
            } else {
              msg = 'Automatischer API-Abruf für diesen Versanddienst ist noch nicht angebunden.'
            }
          }
          return res.json({
            events: evFallback.rows || [],
            inserted: 0,
            message: msg,
            trackingUrl: buildTrackingUrl(order.carrier_name, trackingNumber, carrierRow.tracking_url_template),
          })
        }

        // Upsert events: insert only new ones (Zeit + Status + Beschreibung wie DHL liefert)
        let inserted = 0
        for (const ev of newEvents) {
          const exists = await client.query(
            `SELECT id FROM store_shipment_events WHERE order_id=$1::uuid AND status=$2 AND event_time=$3::timestamptz AND description IS NOT DISTINCT FROM $4 LIMIT 1`,
            [id, ev.status, ev.event_time, ev.description || null]
          )
          if (!exists.rows.length) {
            await client.query(
              `INSERT INTO store_shipment_events (order_id, status, description, location, event_time, source) VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, 'api')`,
              [id, ev.status, ev.description || null, ev.location || null, ev.event_time]
            )
            inserted++
          }
        }
        const mostRecentEvent = newEvents[newEvents.length - 1]
        const mostRecentStatus = mostRecentEvent?.status
        let firedTrigger = null
        if (mostRecentStatus === 'zugestellt') {
          // Delivery event fetched from the carrier's API → trusted for the payout hold period.
          // Multi-seller order: only the seller whose parcel this tracking number belongs to.
          let scope = 'order'
          try {
            const { confirmDeliveryForTracking } = require('../settlement/shipments')
            const r = await confirmDeliveryForTracking(client, id, trackingNumber, { source: 'carrier_api', at: mostRecentEvent?.event_time ? new Date(mostRecentEvent.event_time) : new Date(), actor: 'carrier_api' })
            scope = r.scope
          } catch (dErr) { console.warn('confirmDelivery (carrier api):', dErr?.message || dErr) }
          const upd = scope === 'order'
            ? await client.query(`UPDATE store_orders SET delivery_status='zugestellt', delivery_date=COALESCE(delivery_date, now()), updated_at=now() WHERE id=$1::uuid AND delivery_status != 'zugestellt'`, [id])
            : { rowCount: 0 }
          await client.query(`UPDATE store_orders SET order_status='abgeschlossen', updated_at=now() WHERE id=$1::uuid AND payment_status='bezahlt' AND delivery_status='zugestellt' AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`, [id])
          if (upd.rowCount > 0) firedTrigger = 'order_delivered'
        } else if (mostRecentStatus === 'versendet' || mostRecentStatus === 'in_transit') {
          const upd = await client.query(`UPDATE store_orders SET delivery_status='versendet', updated_at=now() WHERE id=$1::uuid AND delivery_status NOT IN ('versendet','zugestellt')`, [id])
          if (upd.rowCount > 0) firedTrigger = 'order_shipped'
        }
        const allEvents = await client.query('SELECT * FROM store_shipment_events WHERE order_id=$1::uuid ORDER BY event_time ASC, created_at ASC', [id])
        await client.end()
        res.json({ events: allEvents.rows || [], inserted, trackingUrl: buildTrackingUrl(order.carrier_name, trackingNumber, carrierRow.tracking_url_template) })
        if (firedTrigger) void dispatchOrderFlowEvent(firedTrigger, id)
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ── Sendcloud label purchase flow ─────────────────────────────────────────

    const sellerTechnicalMessage = (locale) => {
      const loc = String(locale || 'de').slice(0, 2).toLowerCase()
      if (loc === 'tr') return 'Teknik bir sorun nedeniyle işlem şu an tamamlanamıyor. Ekibimiz bilgilendirildi — en kısa sürede ilgileneceğiz.'
      if (loc === 'en') return 'This action could not be completed due to a technical issue. Our team has been notified and will resolve it shortly.'
      return 'Aus technischen Gründen konnte die Aktion nicht abgeschlossen werden. Unser Team wurde informiert und kümmert sich darum.'
    }

    const respondSellerSystemError = async (req, res, { status = 503, errorCode, errorMessage, terminalOutput, context, sellerId }) => {
      const isSuperuser = req.sellerUser?.is_superuser === true
      const locale = req.body?.locale || req.query?.locale || 'de'
      await logSellerError(sellerId || req.sellerUser?.seller_id || null, {
        errorCode: errorCode || 'SYSTEM_ERROR',
        errorMessage: errorMessage || 'Unbekannter Systemfehler',
        terminalOutput: terminalOutput || null,
        context: context || null,
      })
      const userMessage = isSuperuser ? (errorMessage || sellerTechnicalMessage(locale)) : sellerTechnicalMessage(locale)
      return res.status(status).json({ message: userMessage, code: errorCode || 'SYSTEM_ERROR' })
    }

    const { getSendcloudCredentials, sendcloudRequest } = require('../sendcloud-client')

    const adminHubLabelRatesPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = req.sellerUser?.seller_id || null
      if (!id) return res.status(400).json({ message: 'id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ownerCheck = await client.query(
          'SELECT id, country, postal_code FROM store_orders WHERE id=$1::uuid' + sellerOrderAccessSQL(isSuperuser),
          isSuperuser ? [id] : [id, callerSellerId]
        )
        if (!ownerCheck.rows[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const order = ownerCheck.rows[0]
        const sc = await getSendcloudCredentials(client)
        await client.end()
        if (!sc.public_key || !sc.secret_key) {
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_NOT_CONFIGURED',
            errorMessage: 'Sendcloud nicht konfiguriert (API-Schlüssel fehlen)',
            sellerId: callerSellerId,
            context: JSON.stringify({ order_id: id, endpoint: 'label/rates' }),
          })
        }
        const { weight_kg = 1, length_cm = 30, width_cm = 20, height_cm = 15, locale = 'de' } = req.body || {}
        const weightG = Math.round(Number(weight_kg) * 1000) || 1000
        const toCountry = (order.country || 'DE').trim().toUpperCase().slice(0, 2)
        const length = Math.round(Number(length_cm) || 30)
        const width = Math.round(Number(width_cm) || 20)
        const height = Math.round(Number(height_cm) || 15)
        // NOTE: '/api/v2/shipping_products' 404s on this Sendcloud account (not enabled for
        // this contract) — '/api/v2/shipping_methods' is the classic endpoint that this
        // account actually has access to (verified against the live account). It returns a
        // flat method list with a per-country price/lead-time instead of nested products.
        const qs = `?to_country=${toCountry}`
        const resp = await sendcloudRequest('/api/v2/shipping_methods' + qs, sc)
        if (resp.status >= 400) {
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_API_ERROR',
            errorMessage: `Sendcloud API ${resp.status}: ${JSON.stringify(resp.data?.error || resp.data)}`,
            terminalOutput: JSON.stringify(resp.data || {}),
            sellerId: callerSellerId,
            context: JSON.stringify({ order_id: id, endpoint: 'label/rates', qs }),
          })
        }
        const methods = resp.data?.shipping_methods || []
        const weightKg = weightG / 1000
        const { computeLabelRates } = require('../label-pricing')
        const rates = computeLabelRates(methods, { toCountry, weightKg, markupPct: sc.markup_pct })
        // Superuser-only diagnostic: lets us see exactly what Sendcloud returned for each DHL
        // method's weight bracket without needing server-log access, since the account may
        // simply not have differentiated min/max_weight configured per method.
        const debugMethods = []
        if (isSuperuser) {
          for (const method of methods) {
            if (!String(method.carrier || method.name || '').toLowerCase().includes('dhl')) continue
            debugMethods.push({ id: method.id, name: method.name, carrier: method.carrier, min_weight: method.min_weight, max_weight: method.max_weight })
          }
        }
        if (rates.length === 0) {
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_NO_RATES',
            errorMessage: `Keine Versandoptionen für ${toCountry}, ${weightG}g, ${length}×${width}×${height} cm. Sendcloud-Methoden: ${methods.length}`,
            sellerId: callerSellerId,
            context: JSON.stringify({ order_id: id, endpoint: 'label/rates', to_country: toCountry, weight_g: weightG, methods_count: methods.length }),
          })
        }
        res.json({ rates, to_country: toCountry, markup_pct: sc.markup_pct, ...(isSuperuser ? { debug_dhl_methods: debugMethods } : {}) })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        return respondSellerSystemError(req, res, {
          errorCode: 'LABEL_RATES_ERROR',
          errorMessage: e?.message || 'Versandoptionen konnten nicht geladen werden',
          terminalOutput: e?.stack || null,
          sellerId: callerSellerId,
          context: JSON.stringify({ order_id: id, endpoint: 'label/rates' }),
        })
      }
    }

    // Buys the label synchronously — no Stripe Checkout redirect. Charges the seller's
    // available balance (unpaid revenue, may go negative) or, if none, their saved card.
    const adminHubLabelPurchasePOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = req.sellerUser?.seller_id || null
      if (!id) return res.status(400).json({ message: 'id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        // Ownership check — buying a label charges money, unlike viewing/scanning an order's own
        // items, so only a seller with at least one of their own items in this order (or a
        // superuser) may do this. order.seller_id is always the platform now (see store-checkout.js
        // order creation), never a real seller, so this can't be a direct-equality check — it must
        // match the same "has an item here" access pattern as every other seller-scoped order query
        // in this file (sellerOrderAccessSQL).
        const orderR = await client.query(
          `SELECT id, order_number, seller_id, first_name, last_name, email, phone, country, postal_code, city, address_line1, address_line2, sendcloud_label_url, tracking_number, delivery_status
           FROM store_orders WHERE id=$1::uuid${sellerOrderAccessSQL(isSuperuser)}`,
          isSuperuser ? [id] : [id, callerSellerId],
        )
        const order = orderR.rows[0]
        if (!order) { await client.end(); return res.status(404).json({ message: 'Order not found or belongs to a different seller.' }) }
        // store_orders.seller_id is the platform ('default') — the label is billed to the real
        // seller: the caller, or for the superuser the order's only seller (or body.seller_id).
        const { orderSellerIds } = require('../settlement/shipments')
        const realSellers = await orderSellerIds(client, id).catch(() => [])
        const billingSellerId = isSuperuser
          ? (String(req.body?.seller_id || '').trim() || (realSellers.length === 1 ? realSellers[0] : ''))
          : callerSellerId
        if (!billingSellerId || (isSuperuser && !realSellers.includes(billingSellerId))) {
          await client.end()
          return res.status(400).json({ code: 'seller_required', message: 'Mehrere Händler — bitte seller_id angeben.', sellers: realSellers })
        }

        const { service_id, service_name, carrier, price_eur, weight_kg, length_cm, width_cm, height_cm } = req.body || {}
        if (!service_id) { await client.end(); return res.status(400).json({ message: 'service_id erforderlich' }) }

        // Double click / retry: one label per seller and order within 2 minutes.
        const recent = await client.query(
          `SELECT 1 FROM seller_ledger_adjustments WHERE seller_id = $1 AND order_id = $2::uuid AND type = 'shipping_label'
             AND amount_cents < 0 AND created_at > now() - interval '2 minutes' LIMIT 1`,
          [billingSellerId, id],
        ).catch(() => ({ rows: [] }))
        if (recent.rows.length && req.body?.confirm_additional !== true) {
          await client.end()
          return res.status(409).json({ code: 'label_just_purchased', message: 'Für diese Bestellung wurde gerade ein Etikett gekauft.' })
        }

        const checkoutRow = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(checkoutRow)
        if (!secretKey) {
          await client.end()
          return respondSellerSystemError(req, res, {
            errorCode: 'STRIPE_NOT_CONFIGURED',
            errorMessage: 'Stripe nicht konfiguriert (Label-Kauf)',
            sellerId: callerSellerId,
            context: JSON.stringify({ order_id: id, endpoint: 'label/purchase' }),
          })
        }
        const stripe = new (require('stripe'))(secretKey)

        // Price is re-quoted here — the browser's price_eur is only used to detect a change.
        const scQuote = await getSendcloudCredentials(client)
        if (!scQuote.public_key || !scQuote.secret_key) {
          await client.end()
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_NOT_CONFIGURED',
            errorMessage: 'Sendcloud nicht konfiguriert',
            sellerId: billingSellerId,
            context: JSON.stringify({ order_id: id, endpoint: 'label/purchase' }),
          })
        }
        const { computeLabelRates, normalizeWeightKg } = require('../label-pricing')
        const quoteCountry = (order.country || 'DE').trim().toUpperCase().slice(0, 2)
        const methodsResp = await sendcloudRequest(`/api/v2/shipping_methods?to_country=${quoteCountry}`, scQuote)
        const quoted = methodsResp.status < 400
          ? computeLabelRates(methodsResp.data?.shipping_methods || [], { toCountry: quoteCountry, weightKg: normalizeWeightKg(weight_kg), markupPct: scQuote.markup_pct })
            .find((r) => String(r.service_id) === String(service_id))
          : null
        if (!quoted) {
          await client.end()
          return res.status(409).json({ code: 'rate_unavailable', message: 'Versandoption für dieses Gewicht/Land nicht verfügbar — bitte Preise neu laden.' })
        }
        if (price_eur != null && Math.abs(Number(price_eur) - quoted.price_eur) > 0.005) {
          await client.end()
          return res.status(409).json({ code: 'price_changed', message: `Preis geändert: ${quoted.price_eur.toFixed(2)} €`, price_eur: quoted.price_eur })
        }

        let chargeResult
        try {
          chargeResult = await chargeSellerForLabel(client, {
            sellerId: billingSellerId,
            orderId: id,
            amountCents: Math.round(quoted.price_eur * 100),
            orderNumber: order.order_number,
            stripe,
          })
        } catch (chargeErr) {
          await client.end()
          return res.status(402).json({ message: chargeErr?.message || 'Payment failed' })
        }

        const sc = scQuote
        const { reverseLabelCharge } = require('../seller-billing')
        const undoCharge = async (why) => {
          try { return await reverseLabelCharge(client, chargeResult, { stripe, reason: why }) } catch (rErr) {
            console.error('[label] charge reversal failed — manual correction needed:', chargeResult?.ledger_id, rErr?.message || rErr)
            return { reversed: false }
          }
        }
        const parcelBody = JSON.stringify({ parcel: {
          name: [order.first_name, order.last_name].filter(Boolean).join(' ') || order.email || 'Kunde',
          address: order.address_line1 || '',
          address_2: order.address_line2 || '',
          city: order.city || '',
          postal_code: order.postal_code || '',
          country: { iso_2: (order.country || 'DE').toUpperCase() },
          telephone: order.phone || '',
          email: order.email || '',
          weight: String(Number(weight_kg) || 1),
          length: String(length_cm || 30),
          width: String(width_cm || 20),
          height: String(height_cm || 15),
          shipment: { id: Number(service_id) },
          request_label: true,
          order_number: String(id).slice(0, 8),
        }})
        let scResp
        try {
          scResp = await sendcloudRequest('/api/v2/parcels', sc, { method: 'POST', body: parcelBody })
        } catch (netErr) {
          await undoCharge('sendcloud_unreachable')
          throw netErr
        }
        if (scResp.status >= 400) {
          await undoCharge('sendcloud_parcel_error')
          await client.end()
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_PARCEL_ERROR',
            errorMessage: `Sendcloud Fehler: ${JSON.stringify(scResp.data?.error || scResp.data)}`,
            terminalOutput: JSON.stringify(scResp.data || {}),
            sellerId: billingSellerId,
            context: JSON.stringify({ order_id: id, service_id, endpoint: 'label/purchase', charge_method: chargeResult.charge_method }),
          })
        }
        const parcel = scResp.data?.parcel || {}
        const trackingNumber = parcel.tracking_number || ''
        const labelUrl = parcel.label?.label_printer || parcel.label?.normal_printer || ''
        const carrierName = carrier || service_name || 'Sendcloud'
        const prevStatus = String(order.delivery_status || '')
        await client.query(
          `UPDATE store_orders SET
             tracking_number = COALESCE(NULLIF($1, ''), tracking_number),
             carrier_name = COALESCE(NULLIF($2, ''), carrier_name),
             sendcloud_label_url = COALESCE(NULLIF($3, ''), sendcloud_label_url),
             delivery_status = CASE WHEN delivery_status = 'zugestellt' THEN delivery_status ELSE 'versendet' END,
             shipped_at = COALESCE(shipped_at, now()),
             updated_at = now()
           WHERE id = $4::uuid`,
          [trackingNumber, carrierName, labelUrl, id]
        )
        // Per-seller shipment (multi-seller orders keep each parcel's own tracking number).
        try {
          const { recordShipment } = require('../settlement/shipments')
          await recordShipment(client, { orderId: id, sellerId: billingSellerId, carrierName, trackingNumber, deliveryStatus: 'versendet', labelUrl })
        } catch (shErr) { console.warn('[label] recordShipment:', shErr?.message || shErr) }
        await client.end()
        res.json({ label_url: labelUrl, tracking_number: trackingNumber, carrier_name: carrierName, charge_method: chargeResult.charge_method })
        if (prevStatus !== 'versendet' && prevStatus !== 'zugestellt') void dispatchOrderFlowEvent('order_shipped', id)
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        return respondSellerSystemError(req, res, {
          errorCode: 'LABEL_PURCHASE_ERROR',
          errorMessage: e?.message || 'Etikett konnte nicht erstellt werden',
          terminalOutput: e?.stack || null,
          sellerId: req.sellerUser?.seller_id || null,
          context: JSON.stringify({ order_id: id, endpoint: 'label/purchase' }),
        })
      }
    }


  const router = Router()
  router.get('/admin-hub/v1/orders/:id/shipment-events', adminHubShipmentEventsGET)
  router.post('/admin-hub/v1/orders/:id/shipment-events', adminHubShipmentEventPOST)
  router.delete('/admin-hub/v1/shipment-events/:eventId', adminHubShipmentEventDELETE)
  router.post('/admin-hub/v1/orders/:id/refresh-tracking', adminHubOrderRefreshTrackingPOST)
  router.post('/admin-hub/v1/orders/:id/label/rates', adminHubLabelRatesPOST)
  router.post('/admin-hub/v1/orders/:id/label/purchase', adminHubLabelPurchasePOST)

  return router
}
