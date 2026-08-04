'use strict'

const COPY = {
  de: { subject: 'Supportfall {CASE_NUMBER}: {CASE_TITLE}', intro: 'Der Supportfall wurde aktualisiert.', button: 'Supportfall öffnen' },
  en: { subject: 'Support case {CASE_NUMBER}: {CASE_TITLE}', intro: 'The support case was updated.', button: 'Open support case' },
  tr: { subject: 'Destek talebi {CASE_NUMBER}: {CASE_TITLE}', intro: 'Destek talebi güncellendi.', button: 'Destek talebini aç' },
  fr: { subject: 'Dossier support {CASE_NUMBER} : {CASE_TITLE}', intro: 'Le dossier support a été mis à jour.', button: 'Ouvrir le dossier' },
  it: { subject: 'Caso assistenza {CASE_NUMBER}: {CASE_TITLE}', intro: 'Il caso di assistenza è stato aggiornato.', button: 'Apri il caso' },
  es: { subject: 'Caso de soporte {CASE_NUMBER}: {CASE_TITLE}', intro: 'El caso de soporte se ha actualizado.', button: 'Abrir el caso' },
}

function localizedContent() {
  return Object.fromEntries(Object.entries(COPY).map(([locale, copy]) => [locale, {
    subject: copy.subject,
    body: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <p style="font-size:15px;color:#111827;">${copy.intro}</p>
      <p style="font-size:14px;color:#374151;"><strong>{CASE_NUMBER}</strong> · {CASE_TITLE}</p>
      <p style="font-size:13px;color:#6b7280;">{SUPPORT_CASE_EVENT} · {CASE_STATUS}</p>
      <p style="margin-top:22px;"><a href="{SUPPORT_CASE_URL}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;">${copy.button}</a></p>
    </div>`,
  }]))
}

const FLOWS = [
  { trigger_key: 'customer_support_case_updated', name: 'Support case — notify customer', audience: 'customer' },
  { trigger_key: 'seller_support_case_updated', name: 'Support case — notify seller', audience: 'seller' },
  { trigger_key: 'admin_support_case_updated', name: 'Support case — notify support team', audience: 'admin' },
]

async function seedSupportCaseFlows(client) {
  const content = localizedContent()
  for (const flow of FLOWS) {
    try {
      const existing = await client.query('SELECT id FROM admin_hub_flows WHERE trigger_key=$1 LIMIT 1', [flow.trigger_key])
      if (existing.rows[0]) continue
      const inserted = await client.query(
        `INSERT INTO admin_hub_flows (name, trigger_key, status, audience)
         VALUES ($1,$2,'active',$3) RETURNING id`,
        [flow.name, flow.trigger_key, flow.audience],
      )
      await client.query(
        `INSERT INTO admin_hub_flow_steps (flow_id, step_order, step_type, email_subject, email_body, email_i18n)
         VALUES ($1,0,'send_email',$2,$3,$4::jsonb)`,
        [inserted.rows[0].id, content.de.subject, content.de.body, JSON.stringify(content)],
      )
    } catch (error) {
      console.warn('[seed-support-case-flows]', flow.trigger_key, error?.message || error)
    }
  }
}

module.exports = { seedSupportCaseFlows }
