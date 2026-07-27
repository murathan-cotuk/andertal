'use strict'
const { Router } = require('express')
const { runAutomationFlowsForOrder } = require('../flow-automation')
const { enqueueFlowEvent } = require('../flow-queue')

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

    // Returns order row if the caller has access (direct seller_id match OR via seller listings)
    const sellerOrderAccessSQL = (isSuperuser) => isSuperuser
      ? ''
      : ` AND (seller_id=$2 OR EXISTS (SELECT 1 FROM store_order_items oi WHERE oi.order_id=store_orders.id AND (EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text=oi.product_id::text AND sl.seller_id=$2) OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text=oi.product_id::text AND ap.seller_id=$2))))`

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
          const upd = await client.query(`UPDATE store_orders SET delivery_status='zugestellt', delivery_date=COALESCE(delivery_date, now()), updated_at=now() WHERE id=$1::uuid AND delivery_status != 'zugestellt'`, [id])
          await client.query(`UPDATE store_orders SET order_status='abgeschlossen', updated_at=now() WHERE id=$1::uuid AND payment_status='bezahlt' AND delivery_status='zugestellt' AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`, [id])
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
        const sellerEventAccessSQL = isSuperuser ? '' : ` AND (o.seller_id=$2 OR EXISTS (SELECT 1 FROM store_order_items oi WHERE oi.order_id=o.id AND (EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text=oi.product_id::text AND sl.seller_id=$2) OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text=oi.product_id::text AND ap.seller_id=$2))))`
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
        const order = ownerQ.rows[0]
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
          const upd = await client.query(`UPDATE store_orders SET delivery_status='zugestellt', delivery_date=COALESCE(delivery_date, now()), updated_at=now() WHERE id=$1::uuid AND delivery_status != 'zugestellt'`, [id])
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

    const getSendcloudCredentials = async (pgClient) => {
      const r = await pgClient.query(
        `SELECT api_key, api_secret, config FROM store_integrations WHERE LOWER(TRIM(slug))='sendcloud' AND seller_scope_key='platform' LIMIT 1`
      )
      const row = r.rows[0]
      if (!row) return { public_key: '', secret_key: '', markup_pct: 5 }
      let extraCfg = {}
      try { extraCfg = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}) } catch (_) {}
      return { public_key: row.api_key || '', secret_key: row.api_secret || '', markup_pct: extraCfg.markup_pct ?? 5 }
    }

    const sendcloudRequest = async (path, { public_key, secret_key }, opts = {}) => {
      const https = require('https')
      const creds = Buffer.from(`${public_key}:${secret_key}`).toString('base64')
      const url = new URL('https://panel.sendcloud.sc' + path)
      return new Promise((resolve, reject) => {
        const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: opts.method || 'GET',
          headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }
        }, (resp) => {
          let body = ''
          resp.on('data', d => { body += d })
          resp.on('end', () => {
            try { resolve({ status: resp.statusCode, data: JSON.parse(body || '{}') }) }
            catch { resolve({ status: resp.statusCode, data: {} }) }
          })
        })
        req.on('error', reject)
        if (opts.body) req.write(opts.body)
        req.end()
      })
    }

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
        const markup = 1 + (Number(sc.markup_pct) || 5) / 100
        const weightKg = weightG / 1000
        const rates = []
        for (const method of methods) {
          // Platform ships via DHL only for now — other carriers stay hidden until
          // seller-owned carrier integrations are wired up.
          const carrierKey = String(method.carrier || method.name || '').toLowerCase()
          if (!carrierKey.includes('dhl')) continue
          const minW = method.min_weight != null ? Number(method.min_weight) : null
          const maxW = method.max_weight != null ? Number(method.max_weight) : null
          if (minW != null && weightKg < minW) continue
          if (maxW != null && weightKg > maxW) continue
          const countryEntry = (method.countries || []).find((c) => (c.iso_2 || '').toUpperCase() === toCountry)
          if (!countryEntry) continue
          const price = countryEntry.price
          if (price == null) continue
          const leadHours = countryEntry.lead_time_hours != null ? Number(countryEntry.lead_time_hours) : null
          let deliveryDays = null
          if (leadHours != null) {
            if (leadHours <= 24) deliveryDays = 'Lieferung am nächsten Werktag'
            else if (leadHours <= 48) deliveryDays = 'Lieferung in 1–2 Werktagen'
            else if (leadHours <= 72) deliveryDays = 'Lieferung in 2–3 Werktagen'
            else deliveryDays = `Lieferung in ca. ${Math.ceil(leadHours / 24)} Werktagen`
          }
          rates.push({
            service_id: method.id,
            name: method.name,
            carrier: method.carrier || (method.name || '').toLowerCase(),
            price_eur: Math.round(Number(price) * markup * 100) / 100,
            price_base: Math.round(Number(price) * 100) / 100,
            min_weight: method.min_weight,
            max_weight: method.max_weight,
            delivery_days: deliveryDays,
            tracking: true,
          })
        }
        rates.sort((a, b) => a.price_eur - b.price_eur)
        if (rates.length === 0) {
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_NO_RATES',
            errorMessage: `Keine Versandoptionen für ${toCountry}, ${weightG}g, ${length}×${width}×${height} cm. Sendcloud-Methoden: ${methods.length}`,
            sellerId: callerSellerId,
            context: JSON.stringify({ order_id: id, endpoint: 'label/rates', to_country: toCountry, weight_g: weightG, methods_count: methods.length }),
          })
        }
        res.json({ rates, to_country: toCountry, markup_pct: sc.markup_pct })
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

    const adminHubLabelCheckoutPOST = async (req, res) => {
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
          'SELECT id, first_name, last_name, email, country, postal_code, city, address_line1, address_line2 FROM store_orders WHERE id=$1::uuid' + sellerOrderAccessSQL(isSuperuser),
          isSuperuser ? [id] : [id, callerSellerId]
        )
        if (!ownerCheck.rows[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const checkoutRow = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(checkoutRow)
        await client.end()
        if (!secretKey) {
          return respondSellerSystemError(req, res, {
            errorCode: 'STRIPE_NOT_CONFIGURED',
            errorMessage: 'Stripe nicht konfiguriert (Label-Checkout)',
            sellerId: callerSellerId,
            context: JSON.stringify({ order_id: id, endpoint: 'label/checkout' }),
          })
        }
        const { service_id, service_name, carrier, price_eur, weight_kg, length_cm, width_cm, height_cm, locale = 'de' } = req.body || {}
        if (!service_id || !price_eur) return res.status(400).json({ message: 'service_id und price_eur erforderlich' })
        const stripe = new (require('stripe'))(secretKey)
        const SELLERCENTRAL_URL = (process.env.SELLERCENTRAL_URL || 'http://localhost:3002').replace(/\/$/, '')
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          line_items: [{
            price_data: {
              currency: 'eur',
              product_data: { name: `Versandetikett — ${service_name || carrier || 'Sendcloud'}`, description: `Bestellung #${ownerCheck.rows[0].id.slice(0,8)}` },
              unit_amount: Math.round(Number(price_eur) * 100),
            },
            quantity: 1,
          }],
          metadata: { order_id: id, service_id: String(service_id), service_name: service_name || '', carrier: carrier || '', weight_kg: String(weight_kg||1), length_cm: String(length_cm||30), width_cm: String(width_cm||20), height_cm: String(height_cm||15), seller_id: callerSellerId || 'platform' },
          success_url: `${SELLERCENTRAL_URL}/${locale}/orders?label_session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${SELLERCENTRAL_URL}/${locale}/orders?label_cancel=1`,
        })
        res.json({ checkout_url: session.url })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        return respondSellerSystemError(req, res, {
          errorCode: 'LABEL_CHECKOUT_ERROR',
          errorMessage: e?.message || 'Checkout konnte nicht erstellt werden',
          terminalOutput: e?.stack || null,
          sellerId: callerSellerId,
          context: JSON.stringify({ order_id: id, endpoint: 'label/checkout' }),
        })
      }
    }

    const adminHubLabelFulfillPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { session_id } = req.body || {}
      if (!session_id) return res.status(400).json({ message: 'session_id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const checkoutRow = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(checkoutRow)
        if (!secretKey) {
          await client.end()
          return respondSellerSystemError(req, res, {
            errorCode: 'STRIPE_NOT_CONFIGURED',
            errorMessage: 'Stripe nicht konfiguriert (Label-Fulfill)',
            sellerId: req.sellerUser?.seller_id || null,
            context: JSON.stringify({ session_id, endpoint: 'label/fulfill' }),
          })
        }
        const stripe = new (require('stripe'))(secretKey)
        const session = await stripe.checkout.sessions.retrieve(session_id)
        if (session.payment_status !== 'paid') { await client.end(); return res.status(400).json({ message: 'Zahlung nicht abgeschlossen' }) }
        const meta = session.metadata || {}
        const orderId = meta.order_id
        if (!orderId) { await client.end(); return res.status(400).json({ message: 'Keine Bestell-ID in Session' }) }
        // Check if already fulfilled (tracking already set via this session)
        const labelCheckR = await client.query(`SELECT sendcloud_label_url, tracking_number FROM store_orders WHERE id=$1::uuid`, [orderId])
        const existing = labelCheckR.rows[0]
        if (existing?.sendcloud_label_url) {
          await client.end()
          return res.json({ label_url: existing.sendcloud_label_url, tracking_number: existing.tracking_number, already_fulfilled: true })
        }
        const orderR = await client.query(`SELECT id, first_name, last_name, email, phone, country, postal_code, city, address_line1, address_line2 FROM store_orders WHERE id=$1::uuid`, [orderId])
        const order = orderR.rows[0]
        if (!order) { await client.end(); return res.status(404).json({ message: 'Bestellung nicht gefunden' }) }
        const sc = await getSendcloudCredentials(client)
        if (!sc.public_key || !sc.secret_key) {
          await client.end()
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_NOT_CONFIGURED',
            errorMessage: 'Sendcloud nicht konfiguriert (Label-Erstellung nach Zahlung)',
            sellerId: meta.seller_id || req.sellerUser?.seller_id || null,
            context: JSON.stringify({ order_id: orderId, session_id, endpoint: 'label/fulfill' }),
          })
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
          weight: String(Number(meta.weight_kg) || 1),
          length: meta.length_cm || '30',
          width: meta.width_cm || '20',
          height: meta.height_cm || '15',
          shipment: { id: Number(meta.service_id) },
          request_label: true,
          order_number: orderId.slice(0, 8),
        }})
        const scResp = await sendcloudRequest('/api/v2/parcels', sc, { method: 'POST', body: parcelBody })
        if (scResp.status >= 400) {
          await client.end()
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_PARCEL_ERROR',
            errorMessage: `Sendcloud Fehler: ${JSON.stringify(scResp.data?.error || scResp.data)}`,
            terminalOutput: JSON.stringify(scResp.data || {}),
            sellerId: meta.seller_id || req.sellerUser?.seller_id || null,
            context: JSON.stringify({ order_id: orderId, session_id, service_id: meta.service_id, endpoint: 'label/fulfill' }),
          })
        }
        const parcel = scResp.data?.parcel || {}
        const trackingNumber = parcel.tracking_number || ''
        const labelUrl = parcel.label?.label_printer || parcel.label?.normal_printer || ''
        const carrierName = meta.carrier || meta.service_name || 'Sendcloud'
        const updRes = await client.query(
          `UPDATE store_orders SET tracking_number=$1, carrier_name=$2, sendcloud_label_url=$3, delivery_status='versendet', shipped_at=COALESCE(shipped_at,now()), updated_at=now() WHERE id=$4::uuid AND delivery_status NOT IN ('versendet','zugestellt')`,
          [trackingNumber, carrierName, labelUrl, orderId]
        )
        await client.end()
        res.json({ label_url: labelUrl, tracking_number: trackingNumber, carrier_name: carrierName })
        if (updRes.rowCount > 0) void dispatchOrderFlowEvent('order_shipped', orderId)
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        return respondSellerSystemError(req, res, {
          errorCode: 'LABEL_FULFILL_ERROR',
          errorMessage: e?.message || 'Etikett konnte nicht erstellt werden',
          terminalOutput: e?.stack || null,
          sellerId: req.sellerUser?.seller_id || null,
          context: JSON.stringify({ session_id, endpoint: 'label/fulfill' }),
        })
      }
    }


  const router = Router()
  router.get('/admin-hub/v1/orders/:id/shipment-events', adminHubShipmentEventsGET)
  router.post('/admin-hub/v1/orders/:id/shipment-events', adminHubShipmentEventPOST)
  router.delete('/admin-hub/v1/shipment-events/:eventId', adminHubShipmentEventDELETE)
  router.post('/admin-hub/v1/orders/:id/refresh-tracking', adminHubOrderRefreshTrackingPOST)
  router.post('/admin-hub/v1/orders/:id/label/rates', adminHubLabelRatesPOST)
  router.post('/admin-hub/v1/orders/:id/label/checkout', adminHubLabelCheckoutPOST)
  router.post('/admin-hub/v1/label/fulfill', adminHubLabelFulfillPOST)

  return router
}
