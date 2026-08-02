'use strict'

/**
 * One-time, idempotent seed for the "Win-Back Customer" (trigger_key = win_back)
 * customer flow. Dispatched via runWinBackScan for customers with no order in
 * REORDER_REMINDER_DAYS — customer-only context (no order/product data available),
 * so this template intentionally stays generic re-engagement copy.
 * Skips if a flow already has this trigger_key — never overwrites what the
 * superuser has since edited. Mirrors seed-message-flows.js's pattern.
 */

const ACCENT = '#7c3aed'

function shell(bodyHtml) {
  return `<div style="background:#f4f5f7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);"><div style="background:#111827;padding:22px 32px;text-align:center;"><span style="color:#fff;font-size:19px;font-weight:700;">{STORE_NAME}</span></div><div style="height:4px;background:${ACCENT};"></div><div style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
${bodyHtml}
</div><div style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #eee;"><p style="margin:0;font-size:11px;color:#9ca3af;">{STORE_NAME}</p><p style="margin:6px 0 0;font-size:11px;color:#9ca3af;"><a href="{IMPRESSUM_URL}" style="color:#9ca3af;">Impressum</a> &nbsp;·&nbsp; <a href="{DATENSCHUTZ_URL}" style="color:#9ca3af;">Datenschutz</a> &nbsp;·&nbsp; <a href="{UNSUBSCRIBE_URL}" style="color:#9ca3af;">Abmelden</a></p></div></div></div>`
}

function cta(url, label) {
  return `<div style="text-align:center;margin:24px 0 8px;"><a href="${url}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-weight:600;font-size:14px;">${label}</a></div>`
}

const FLOW = {
  trigger_key: 'win_back',
  name: 'Win-Back Customer',
  audience: 'customer',
  content: {
    en: {
      subject: 'We miss you, {FIRST_NAME}!',
      body: shell(`
<div style="text-align:center;font-size:36px;margin-bottom:8px;">👋</div>
<p style="margin:0 0 16px;">Hi {FIRST_NAME},</p>
<p style="margin:0 0 16px;">it's been a while since your last visit to <strong>{STORE_NAME}</strong>, and we wanted to check in. A lot has happened since then — new products, new brands, and plenty of fresh arrivals worth a look.</p>
<p style="margin:0 0 16px;">We'd love to have you back.</p>
${cta('{SHOP_HOME_URL}', 'See what\'s new')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">If there was something that didn't go well last time, just reply to this email — we'd genuinely like to know.</p>`),
    },
    tr: {
      subject: 'Seni özledik, {FIRST_NAME}!',
      body: shell(`
<div style="text-align:center;font-size:36px;margin-bottom:8px;">👋</div>
<p style="margin:0 0 16px;">Merhaba {FIRST_NAME},</p>
<p style="margin:0 0 16px;"><strong>{STORE_NAME}</strong>'e son ziyaretinden bu yana bir süre geçti, seni merak ettik. O zamandan beri çok şey değişti — yeni ürünler, yeni markalar ve göz atmaya değer birçok yenilik seni bekliyor.</p>
<p style="margin:0 0 16px;">Seni tekrar aramızda görmek isteriz.</p>
${cta('{SHOP_HOME_URL}', 'Yeniliklere göz at')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Geçen sefer bir sorun yaşadıysan, bu e-postayı yanıtlaman yeterli — gerçekten öğrenmek isteriz.</p>`),
    },
    fr: {
      subject: 'Vous nous manquez, {FIRST_NAME} !',
      body: shell(`
<div style="text-align:center;font-size:36px;margin-bottom:8px;">👋</div>
<p style="margin:0 0 16px;">Bonjour {FIRST_NAME},</p>
<p style="margin:0 0 16px;">cela fait un moment que vous n'êtes pas passé chez <strong>{STORE_NAME}</strong>, et nous voulions prendre de vos nouvelles. Beaucoup de choses ont changé depuis — nouveaux produits, nouvelles marques et de nombreuses nouveautés à découvrir.</p>
<p style="margin:0 0 16px;">Nous serions ravis de vous revoir.</p>
${cta('{SHOP_HOME_URL}', 'Découvrir les nouveautés')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Si quelque chose s'est mal passé la dernière fois, répondez simplement à cet e-mail — nous aimerions vraiment le savoir.</p>`),
    },
    it: {
      subject: 'Ci manchi, {FIRST_NAME}!',
      body: shell(`
<div style="text-align:center;font-size:36px;margin-bottom:8px;">👋</div>
<p style="margin:0 0 16px;">Ciao {FIRST_NAME},</p>
<p style="margin:0 0 16px;">è passato un po' dalla tua ultima visita su <strong>{STORE_NAME}</strong>, e volevamo sentirti. Da allora sono cambiate molte cose — nuovi prodotti, nuovi brand e tante novità da scoprire.</p>
<p style="margin:0 0 16px;">Ci piacerebbe rivederti.</p>
${cta('{SHOP_HOME_URL}', 'Scopri le novità')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Se qualcosa non è andato bene l'ultima volta, rispondi pure a questa email — vorremmo davvero saperlo.</p>`),
    },
    es: {
      subject: '¡Te echamos de menos, {FIRST_NAME}!',
      body: shell(`
<div style="text-align:center;font-size:36px;margin-bottom:8px;">👋</div>
<p style="margin:0 0 16px;">Hola {FIRST_NAME},</p>
<p style="margin:0 0 16px;">ha pasado un tiempo desde tu última visita a <strong>{STORE_NAME}</strong>, y queríamos saber de ti. Desde entonces han cambiado muchas cosas — nuevos productos, nuevas marcas y muchas novedades que vale la pena ver.</p>
<p style="margin:0 0 16px;">Nos encantaría que volvieras.</p>
${cta('{SHOP_HOME_URL}', 'Ver novedades')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Si algo no salió bien la última vez, simplemente responde a este correo — nos gustaría saberlo de verdad.</p>`),
    },
    de: {
      subject: 'Wir vermissen dich, {FIRST_NAME}!',
      body: shell(`
<div style="text-align:center;font-size:36px;margin-bottom:8px;">👋</div>
<p style="margin:0 0 16px;">Hallo {FIRST_NAME},</p>
<p style="margin:0 0 16px;">es ist eine Weile her seit deinem letzten Besuch bei <strong>{STORE_NAME}</strong>, und wir wollten uns mal melden. Seitdem hat sich einiges getan — neue Produkte, neue Marken und viele Neuheiten, die einen Blick wert sind.</p>
<p style="margin:0 0 16px;">Wir würden uns freuen, dich wiederzusehen.</p>
${cta('{SHOP_HOME_URL}', 'Neuheiten entdecken')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Falls beim letzten Mal etwas nicht gepasst hat, antworte einfach auf diese E-Mail — wir würden es wirklich gerne wissen.</p>`),
    },
  },
}

async function seedWinBackFlow(client) {
  try {
    const existing = await client.query(`SELECT id FROM admin_hub_flows WHERE trigger_key = $1 LIMIT 1`, [FLOW.trigger_key])
    let flowId = existing.rows[0]?.id
    if (!flowId) {
      const fr = await client.query(
        `INSERT INTO admin_hub_flows (name, trigger_key, status, audience) VALUES ($1, $2, 'active', $3) RETURNING id`,
        [FLOW.name, FLOW.trigger_key, FLOW.audience],
      )
      flowId = fr.rows[0].id
    }
    // Flow row may already exist (e.g. created blank via the UI) — only fill in content
    // if it has no steps yet, so a superuser's own edits are never overwritten.
    const steps = await client.query(`SELECT id FROM admin_hub_flow_steps WHERE flow_id = $1 LIMIT 1`, [flowId])
    if (steps.rows[0]) return

    const de = FLOW.content.de
    await client.query(
      `INSERT INTO admin_hub_flow_steps (flow_id, step_order, step_type, email_subject, email_body, email_i18n)
       VALUES ($1, 0, 'send_email', $2, $3, $4::jsonb)`,
      [flowId, de.subject, de.body, JSON.stringify(FLOW.content)],
    )
  } catch (e) {
    console.warn('[seed-winback-flow]', e?.message || e)
  }
}

module.exports = { seedWinBackFlow }
