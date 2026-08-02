'use strict'

/**
 * One-time, idempotent seed for the "Product Review" (trigger_key = review_request)
 * customer flow. Skips if a flow already has this trigger_key — never overwrites
 * what the superuser has since edited. Mirrors seed-message-flows.js's pattern.
 */

const ACCENT = '#f59e0b'

function shell(bodyHtml) {
  return `<div style="background:#f4f5f7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);"><div style="background:#111827;padding:22px 32px;text-align:center;"><span style="color:#fff;font-size:19px;font-weight:700;">{PLATFORM_NAME}</span></div><div style="height:4px;background:${ACCENT};"></div><div style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
${bodyHtml}
</div><div style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #eee;"><p style="margin:0;font-size:11px;color:#9ca3af;">{STORE_NAME} · {PLATFORM_NAME}</p><p style="margin:6px 0 0;font-size:11px;color:#9ca3af;"><a href="{IMPRESSUM_URL}" style="color:#9ca3af;">Impressum</a> &nbsp;·&nbsp; <a href="{DATENSCHUTZ_URL}" style="color:#9ca3af;">Datenschutz</a> &nbsp;·&nbsp; {SUPPORT_EMAIL}</p></div></div></div>`
}

function stars() {
  return `<div style="text-align:center;font-size:28px;letter-spacing:6px;margin:0 0 20px;">⭐⭐⭐⭐⭐</div>`
}

function productCard(name, image) {
  return `<div style="display:flex;align-items:center;gap:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:0 0 20px;">${image}<div style="font-size:14px;font-weight:600;color:#111827;">${name}</div></div>`
}

function cta(url, label) {
  return `<div style="text-align:center;margin:8px 0 8px;"><a href="${url}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-weight:600;font-size:14px;">${label}</a></div>`
}

const FLOW = {
  trigger_key: 'review_request',
  name: 'Product Review',
  audience: 'customer',
  content: {
    en: {
      subject: 'How do you like {PRODUCT_NAME}?',
      body: shell(`
${stars()}
<p style="margin:0 0 16px;">Hi {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">Your order <strong>#{ORDER_NUMBER}</strong> was delivered a little while ago — we hope you're enjoying it!</p>
${productCard('{PRODUCT_NAME}', '{PRODUCT_IMAGE_HTML}')}
<p style="margin:0 0 16px;">Would you take a minute to share your experience? Your review helps other customers make better decisions — and takes less than a minute.</p>
${cta('{PRODUCT_URL}', 'Write a review')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Not happy with something? Reply to this email or reach us at {SUPPORT_EMAIL} — we're here to help before you leave a rating.</p>`),
    },
    tr: {
      subject: '{PRODUCT_NAME} nasıldı?',
      body: shell(`
${stars()}
<p style="margin:0 0 16px;">Merhaba {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;"><strong>#{ORDER_NUMBER}</strong> numaralı siparişiniz bir süre önce teslim edildi — umarız beğenmişsinizdir!</p>
${productCard('{PRODUCT_NAME}', '{PRODUCT_IMAGE_HTML}')}
<p style="margin:0 0 16px;">Deneyiminizi bizimle paylaşmak için bir dakikanızı ayırır mısınız? Değerlendirmeniz diğer müşterilerin daha iyi karar vermesine yardımcı olur — ve bir dakikadan az sürer.</p>
${cta('{PRODUCT_URL}', 'Değerlendirme yaz')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Bir sorun mu var? Bu e-postayı yanıtlayın veya {SUPPORT_EMAIL} adresinden bize ulaşın — puan vermeden önce yardımcı olmak isteriz.</p>`),
    },
    fr: {
      subject: 'Que pensez-vous de {PRODUCT_NAME} ?',
      body: shell(`
${stars()}
<p style="margin:0 0 16px;">Bonjour {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">Votre commande <strong>#{ORDER_NUMBER}</strong> a été livrée il y a peu de temps — nous espérons qu'elle vous plaît !</p>
${productCard('{PRODUCT_NAME}', '{PRODUCT_IMAGE_HTML}')}
<p style="margin:0 0 16px;">Pourriez-vous prendre une minute pour partager votre expérience ? Votre avis aide d'autres clients à mieux choisir — et prend moins d'une minute.</p>
${cta('{PRODUCT_URL}', 'Laisser un avis')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Un souci avec votre commande ? Répondez à cet e-mail ou contactez-nous à {SUPPORT_EMAIL} — nous sommes là pour vous aider avant que vous ne laissiez une note.</p>`),
    },
    it: {
      subject: 'Cosa ne pensi di {PRODUCT_NAME}?',
      body: shell(`
${stars()}
<p style="margin:0 0 16px;">Ciao {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">Il tuo ordine <strong>#{ORDER_NUMBER}</strong> è stato consegnato qualche giorno fa — speriamo che ti piaccia!</p>
${productCard('{PRODUCT_NAME}', '{PRODUCT_IMAGE_HTML}')}
<p style="margin:0 0 16px;">Potresti dedicare un minuto a condividere la tua esperienza? La tua recensione aiuta altri clienti a scegliere meglio — e richiede meno di un minuto.</p>
${cta('{PRODUCT_URL}', 'Scrivi una recensione')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">C'è qualcosa che non va? Rispondi a questa email o scrivi a {SUPPORT_EMAIL} — siamo qui per aiutarti prima che tu lasci una valutazione.</p>`),
    },
    es: {
      subject: '¿Qué te ha parecido {PRODUCT_NAME}?',
      body: shell(`
${stars()}
<p style="margin:0 0 16px;">Hola {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">Tu pedido <strong>#{ORDER_NUMBER}</strong> se entregó hace un tiempo — ¡esperamos que lo estés disfrutando!</p>
${productCard('{PRODUCT_NAME}', '{PRODUCT_IMAGE_HTML}')}
<p style="margin:0 0 16px;">¿Podrías dedicar un minuto a compartir tu experiencia? Tu opinión ayuda a otros clientes a decidir mejor — y lleva menos de un minuto.</p>
${cta('{PRODUCT_URL}', 'Escribir una reseña')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">¿Algo no fue como esperabas? Responde a este correo o escríbenos a {SUPPORT_EMAIL} — estamos aquí para ayudarte antes de que dejes una valoración.</p>`),
    },
    de: {
      subject: 'Wie gefällt dir {PRODUCT_NAME}?',
      body: shell(`
${stars()}
<p style="margin:0 0 16px;">Hallo {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">deine Bestellung <strong>#{ORDER_NUMBER}</strong> wurde vor Kurzem geliefert — wir hoffen, sie gefällt dir!</p>
${productCard('{PRODUCT_NAME}', '{PRODUCT_IMAGE_HTML}')}
<p style="margin:0 0 16px;">Hättest du eine Minute Zeit, deine Erfahrung zu teilen? Deine Bewertung hilft anderen Kund:innen bei der Entscheidung — und dauert weniger als eine Minute.</p>
${cta('{PRODUCT_URL}', 'Bewertung schreiben')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Etwas stimmt nicht? Antworte einfach auf diese E-Mail oder schreib uns an {SUPPORT_EMAIL} — wir helfen dir gerne, bevor du bewertest.</p>`),
    },
  },
}

async function seedReviewRequestFlow(client) {
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
    console.warn('[seed-review-request-flow]', e?.message || e)
  }
}

module.exports = { seedReviewRequestFlow }
