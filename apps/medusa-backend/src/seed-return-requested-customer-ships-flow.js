'use strict'

/**
 * One-time, idempotent seed for the "Return requested — customer ships" (trigger_key =
 * return_requested_customer_ships) customer flow — sent when the return_method is
 * 'customer_ships' (Model B, see docs/TASKS.md TASK-13.2): the platform does NOT auto-generate
 * a label, so this email gives the customer the seller's return address instead and asks them
 * to submit their own tracking number on the order page once shipped. Mirrors
 * seed-return-requested-flow.js's pattern and shell/infoBox/cta helpers.
 */

const ACCENT = '#0d9488'

function shell(bodyHtml) {
  return `<div style="background:#f4f5f7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);"><div style="background:#111827;padding:22px 32px;text-align:center;"><span style="color:#fff;font-size:19px;font-weight:700;">{STORE_NAME}</span></div><div style="height:4px;background:${ACCENT};"></div><div style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
${bodyHtml}
</div><div style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #eee;"><p style="margin:0;font-size:11px;color:#9ca3af;">{STORE_NAME}</p><p style="margin:6px 0 0;font-size:11px;color:#9ca3af;"><a href="{IMPRESSUM_URL}" style="color:#9ca3af;">Impressum</a> &nbsp;·&nbsp; <a href="{DATENSCHUTZ_URL}" style="color:#9ca3af;">Datenschutz</a> &nbsp;·&nbsp; {SUPPORT_EMAIL}</p></div></div></div>`
}

function infoBox(label, value) {
  return `<div style="margin:0 0 10px;padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;"><span style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;">${label}</span><br/><span style="font-size:14px;color:#111827;font-weight:600;">${value}</span></div>`
}

function cta(url, label) {
  return `<div style="text-align:center;margin:24px 0 8px;"><a href="${url}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-weight:600;font-size:14px;">${label}</a></div>`
}

const FLOW = {
  trigger_key: 'return_requested_customer_ships',
  name: 'Return requested — customer ships (Model B)',
  audience: 'customer',
  content: {
    en: {
      subject: 'How to send back your return for order #{ORDER_NUMBER}',
      body: shell(`
<p style="margin:0 0 16px;">Hi {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">we've received your return request for <strong>{PRODUCT_NAME}</strong> from order <strong>#{ORDER_NUMBER}</strong>. For this order, please arrange and pay for your own return shipment to the address below.</p>
${infoBox('Return number', '{RETURN_NUMBER}')}
${infoBox('Reason', '{RETURN_REASON}')}
${infoBox('Return address', '{RETURN_ADDRESS_HTML}')}
<p style="margin:16px 0;">Once you've shipped the parcel, please add your tracking number on the order page so we can follow up.</p>
${cta('{ORDER_DETAIL_URL}', 'Submit tracking number')}
<p style="margin:0;font-size:13px;color:#6b7280;">Questions about your return? Reply to this email or reach us at {SUPPORT_EMAIL}.</p>`),
    },
    tr: {
      subject: '#{ORDER_NUMBER} numaralı siparişiniz için iade gönderim bilgisi',
      body: shell(`
<p style="margin:0 0 16px;">Merhaba {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;"><strong>#{ORDER_NUMBER}</strong> numaralı siparişinizdeki <strong>{PRODUCT_NAME}</strong> ürünü için iade talebinizi aldık. Bu sipariş için iade gönderisini kendiniz düzenleyip aşağıdaki adrese göndermeniz gerekiyor.</p>
${infoBox('İade numarası', '{RETURN_NUMBER}')}
${infoBox('Sebep', '{RETURN_REASON}')}
${infoBox('İade adresi', '{RETURN_ADDRESS_HTML}')}
<p style="margin:16px 0;">Paketi gönderdikten sonra lütfen takip numaranızı sipariş sayfasına ekleyin.</p>
${cta('{ORDER_DETAIL_URL}', 'Takip numarası gönder')}
<p style="margin:0;font-size:13px;color:#6b7280;">İadeniz hakkında sorularınız için bu e-postayı yanıtlayabilir veya {SUPPORT_EMAIL} adresinden bize ulaşabilirsiniz.</p>`),
    },
    fr: {
      subject: 'Comment renvoyer votre retour pour la commande #{ORDER_NUMBER}',
      body: shell(`
<p style="margin:0 0 16px;">Bonjour {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">nous avons bien reçu votre demande de retour pour <strong>{PRODUCT_NAME}</strong> de la commande <strong>#{ORDER_NUMBER}</strong>. Pour cette commande, merci d'organiser et de payer vous-même l'envoi du retour à l'adresse ci-dessous.</p>
${infoBox('Numéro de retour', '{RETURN_NUMBER}')}
${infoBox('Motif', '{RETURN_REASON}')}
${infoBox('Adresse de retour', '{RETURN_ADDRESS_HTML}')}
<p style="margin:16px 0;">Une fois le colis expédié, merci d'ajouter votre numéro de suivi sur la page de la commande.</p>
${cta('{ORDER_DETAIL_URL}', 'Indiquer le numéro de suivi')}
<p style="margin:0;font-size:13px;color:#6b7280;">Des questions sur votre retour ? Répondez à cet e-mail ou contactez-nous à {SUPPORT_EMAIL}.</p>`),
    },
    it: {
      subject: 'Come rispedire il tuo reso per l\'ordine #{ORDER_NUMBER}',
      body: shell(`
<p style="margin:0 0 16px;">Ciao {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">abbiamo ricevuto la tua richiesta di reso per <strong>{PRODUCT_NAME}</strong> dall'ordine <strong>#{ORDER_NUMBER}</strong>. Per questo ordine, organizza e paga tu stesso la spedizione di reso all'indirizzo qui sotto.</p>
${infoBox('Numero di reso', '{RETURN_NUMBER}')}
${infoBox('Motivo', '{RETURN_REASON}')}
${infoBox('Indirizzo di reso', '{RETURN_ADDRESS_HTML}')}
<p style="margin:16px 0;">Una volta spedito il pacco, aggiungi il numero di tracking nella pagina dell'ordine.</p>
${cta('{ORDER_DETAIL_URL}', 'Invia numero di tracking')}
<p style="margin:0;font-size:13px;color:#6b7280;">Domande sul tuo reso? Rispondi a questa email o scrivici a {SUPPORT_EMAIL}.</p>`),
    },
    es: {
      subject: 'Cómo enviar tu devolución del pedido #{ORDER_NUMBER}',
      body: shell(`
<p style="margin:0 0 16px;">Hola {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">hemos recibido tu solicitud de devolución de <strong>{PRODUCT_NAME}</strong> del pedido <strong>#{ORDER_NUMBER}</strong>. Para este pedido, organiza y paga tú mismo el envío de la devolución a la siguiente dirección.</p>
${infoBox('Número de devolución', '{RETURN_NUMBER}')}
${infoBox('Motivo', '{RETURN_REASON}')}
${infoBox('Dirección de devolución', '{RETURN_ADDRESS_HTML}')}
<p style="margin:16px 0;">Una vez enviado el paquete, añade tu número de seguimiento en la página del pedido.</p>
${cta('{ORDER_DETAIL_URL}', 'Enviar número de seguimiento')}
<p style="margin:0;font-size:13px;color:#6b7280;">¿Dudas sobre tu devolución? Responde a este correo o escríbenos a {SUPPORT_EMAIL}.</p>`),
    },
    de: {
      subject: 'So sendest du deine Retoure für Bestellung #{ORDER_NUMBER} zurück',
      body: shell(`
<p style="margin:0 0 16px;">Hallo {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">wir haben deine Retourenanfrage für <strong>{PRODUCT_NAME}</strong> aus Bestellung <strong>#{ORDER_NUMBER}</strong> erhalten. Bitte organisiere und bezahle für diese Bestellung den Rückversand selbst an folgende Adresse.</p>
${infoBox('Retourennummer', '{RETURN_NUMBER}')}
${infoBox('Grund', '{RETURN_REASON}')}
${infoBox('Rücksendeadresse', '{RETURN_ADDRESS_HTML}')}
<p style="margin:16px 0;">Sobald du das Paket verschickt hast, trage bitte deine Sendungsnummer auf der Bestellseite ein.</p>
${cta('{ORDER_DETAIL_URL}', 'Sendungsnummer eintragen')}
<p style="margin:0;font-size:13px;color:#6b7280;">Fragen zu deiner Retoure? Antworte einfach auf diese E-Mail oder schreib uns an {SUPPORT_EMAIL}.</p>`),
    },
  },
}

async function seedReturnRequestedCustomerShipsFlow(client) {
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
    const steps = await client.query(`SELECT id FROM admin_hub_flow_steps WHERE flow_id = $1 LIMIT 1`, [flowId])
    if (steps.rows[0]) return

    const de = FLOW.content.de
    await client.query(
      `INSERT INTO admin_hub_flow_steps (flow_id, step_order, step_type, email_subject, email_body, email_i18n, email_attachments)
       VALUES ($1, 0, 'send_email', $2, $3, $4::jsonb, $5::jsonb)`,
      [flowId, de.subject, de.body, JSON.stringify(FLOW.content), JSON.stringify([])],
    )
  } catch (e) {
    console.warn('[seed-return-requested-customer-ships-flow]', e?.message || e)
  }
}

module.exports = { seedReturnRequestedCustomerShipsFlow }
