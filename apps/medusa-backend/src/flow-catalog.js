'use strict'

const FLOW_DEFINITIONS = [
  { trigger_key: 'order_placed', audience: 'customer', category: 'orders', name: 'Bestellbestätigung — Kunde' },
  { trigger_key: 'order_placed', audience: 'seller', category: 'orders', name: 'Neue Bestellung — Seller' },
  { trigger_key: 'order_processing', audience: 'customer', category: 'orders', name: 'Bestellung in Bearbeitung — Kunde' },
  { trigger_key: 'order_processing', audience: 'seller', category: 'orders', name: 'Bestellung in Bearbeitung — Seller' },
  { trigger_key: 'order_shipped', audience: 'customer', category: 'orders', name: 'Versandbestätigung — Kunde' },
  { trigger_key: 'order_shipped', audience: 'seller', category: 'orders', name: 'Bestellung versendet — Seller' },
  { trigger_key: 'order_delivered', audience: 'customer', category: 'orders', name: 'Zugestellt — Kunde' },
  { trigger_key: 'order_delivered', audience: 'seller', category: 'orders', name: 'Zugestellt — Seller' },
  { trigger_key: 'return_requested', audience: 'customer', category: 'returns', name: 'Retoure angefragt — Kunde (Label)' },
  { trigger_key: 'return_requested', audience: 'seller', category: 'returns', name: 'Retoure angefragt — Seller' },
  { trigger_key: 'return_requested_customer_ships', audience: 'customer', category: 'returns', name: 'Retoure — Kunde versendet selbst' },
  { trigger_key: 'return_requested_customer_ships', audience: 'seller', category: 'returns', name: 'Retoure (Kunde versendet) — Seller' },

  { trigger_key: 'customer_message_sent', audience: 'customer', category: 'inbox', name: 'Kundennachricht — Kopie an Kunden' },
  { trigger_key: 'seller_new_customer_message', audience: 'seller', category: 'inbox', name: 'Kundennachricht — Hinweis an Seller' },
  { trigger_key: 'customer_message_replied', audience: 'customer', category: 'inbox', name: 'Antwort an Kunden (Inbox)' },

  { trigger_key: 'seller_support_ticket_sent', audience: 'seller', category: 'sellerSupport', name: 'Seller-Support — Eingangsbestätigung' },
  { trigger_key: 'seller_support_ticket_replied', audience: 'seller', category: 'sellerSupport', name: 'Seller-Support — Antwort vom Support' },

  { trigger_key: 'customer_support_case_updated', audience: 'customer', category: 'supportCases', name: 'Supportfall — Update an Kunden' },
  { trigger_key: 'seller_support_case_updated', audience: 'seller', category: 'supportCases', name: 'Supportfall — Update an Seller' },
  { trigger_key: 'admin_support_case_updated', audience: 'admin', category: 'supportCases', name: 'Supportfall — Update an Support-Team' },

  { trigger_key: 'seller_signup', audience: 'seller', category: 'sellerAccount', name: 'Seller — Registrierung' },
  { trigger_key: 'seller_docs_submitted', audience: 'seller', category: 'sellerAccount', name: 'Seller — Dokumente eingereicht' },
  { trigger_key: 'seller_verification_approved', audience: 'seller', category: 'sellerAccount', name: 'Seller — Freigabe' },
  { trigger_key: 'seller_verification_rejected', audience: 'seller', category: 'sellerAccount', name: 'Seller — Ablehnung' },
  { trigger_key: 'seller_documents_required', audience: 'seller', category: 'sellerAccount', name: 'Seller — Neue Dokumente angefordert' },

  { trigger_key: 'customer_signup', audience: 'customer', category: 'customers', name: 'Kundenregistrierung' },
  { trigger_key: 'new_subscriber', audience: 'customer', category: 'customers', name: 'Newsletter — neue Anmeldung' },
  { trigger_key: 'abandoned_cart', audience: 'customer', category: 'marketing', name: 'Verlassener Warenkorb' },
  { trigger_key: 'review_request', audience: 'customer', category: 'marketing', name: 'Bewertungsanfrage' },
  { trigger_key: 'win_back', audience: 'customer', category: 'marketing', name: 'Win-Back (inaktiver Kunde)' },
  { trigger_key: 'customer_birthday', audience: 'customer', category: 'marketing', name: 'Kunden-Geburtstag' },
  { trigger_key: 'favorite_low_stock', audience: 'customer', category: 'marketing', name: 'Merkzettel — wenig Bestand' },
  { trigger_key: 'favorite_price_drop', audience: 'customer', category: 'marketing', name: 'Merkzettel — Preis gesenkt' },
]

const CATEGORY_ORDER = ['orders', 'returns', 'inbox', 'sellerSupport', 'supportCases', 'sellerAccount', 'customers', 'marketing']

function defKey(triggerKey, audience) {
  return `${String(triggerKey || '').trim()}::${String(audience || 'customer').trim() || 'customer'}`
}

const BY_KEY = new Map(FLOW_DEFINITIONS.map((d) => [defKey(d.trigger_key, d.audience), d]))
const BY_TRIGGER = new Map()
for (const d of FLOW_DEFINITIONS) {
  if (!BY_TRIGGER.has(d.trigger_key)) BY_TRIGGER.set(d.trigger_key, d)
}

function lookupFlowDefinition(triggerKey, audience) {
  const exact = BY_KEY.get(defKey(triggerKey, audience))
  if (exact) return exact
  return BY_TRIGGER.get(String(triggerKey || '').trim()) || null
}

function canonicalFlowName(triggerKey, audience) {
  return lookupFlowDefinition(triggerKey, audience)?.name || null
}

function flowCategory(triggerKey, audience) {
  return lookupFlowDefinition(triggerKey, audience)?.category || 'other'
}

function keepScore(row) {
  const name = String(row.name || '').toLowerCase()
  let score = 0
  if (row.status === 'active') score += 30
  else if (row.status === 'draft') score += 8
  else if (row.status === 'paused') score += 2
  if (/\((copy|kopie|kopya|copie|copia)\)/i.test(name) || /\bkopie\b|\bcopy\b/.test(name)) score -= 40
  const canon = canonicalFlowName(row.trigger_key, row.audience)
  if (canon && String(row.name || '').trim() === canon) score += 12
  score += Math.min(20, Number(row.sent_count) || 0) * 0.1
  score += Number(row.step_count) > 0 ? 5 : 0
  return score
}

/**
 * One flow per trigger+audience. Deletes copies, applies canonical names,
 * unique index so a send cannot "create" another row at the top of the list.
 */
async function dedupeAndNormalizeFlows(client) {
  await client.query(
    `UPDATE admin_hub_flows SET audience = 'customer' WHERE audience IS NULL OR TRIM(audience) = ''`,
  ).catch(() => {})

  const r = await client.query(`
    SELECT f.id, f.name, f.trigger_key, f.audience, f.status, f.sent_count, f.created_at,
           (SELECT COUNT(*)::int FROM admin_hub_flow_steps s WHERE s.flow_id = f.id) AS step_count
    FROM admin_hub_flows f
  `)
  const rows = r.rows || []

  for (const row of rows) {
    const name = canonicalFlowName(row.trigger_key, row.audience)
    if (name && String(row.name || '').trim() !== name) {
      await client.query(`UPDATE admin_hub_flows SET name = $2 WHERE id = $1::uuid`, [row.id, name])
      row.name = name
    }
  }

  const groups = new Map()
  for (const row of rows) {
    const key = defKey(row.trigger_key, row.audience)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => {
      const d = keepScore(b) - keepScore(a)
      if (d !== 0) return d
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    const keep = group[0]
    const drop = group.slice(1)
    const extraSent = drop.reduce((sum, row) => sum + (Number(row.sent_count) || 0), 0)
    if (extraSent > 0) {
      await client.query(
        `UPDATE admin_hub_flows SET sent_count = sent_count + $2 WHERE id = $1::uuid`,
        [keep.id, extraSent],
      )
    }
    const ids = drop.map((row) => row.id)
    await client.query(`DELETE FROM admin_hub_flows WHERE id = ANY($1::uuid[])`, [ids])
    console.warn(
      `[flow-catalog] removed ${ids.length} duplicate flow(s) for ${keep.trigger_key}/${keep.audience || 'customer'}; kept ${keep.id}`,
    )
  }

  await client.query(`DROP INDEX IF EXISTS uniq_admin_hub_flows_active_trigger_audience`).catch(() => {})
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_admin_hub_flows_trigger_audience
    ON admin_hub_flows (trigger_key, audience)
  `).catch((e) => {
    console.warn('[flow-catalog] unique index:', e?.message || e)
  })
}

module.exports = {
  FLOW_DEFINITIONS,
  CATEGORY_ORDER,
  lookupFlowDefinition,
  canonicalFlowName,
  flowCategory,
  keepScore,
  dedupeAndNormalizeFlows,
}
