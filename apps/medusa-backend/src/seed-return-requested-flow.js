'use strict'

/**
 * One-time, idempotent seed for the "Return requested" (trigger_key = return_requested)
 * customer flow — sent the moment a customer requests a return; carries the DHL return
 * label as both a PDF attachment and a direct download link. Order-context dispatch
 * (runAutomationFlowsForOrder via dispatchOrderFlowEvent), so RETURN_, ORDER_, and
 * PRODUCT_ merge fields are all populated. Skips if a flow already has this trigger_key — never
 * overwrites what the superuser has since edited. Mirrors seed-message-flows.js's pattern.
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
  trigger_key: 'return_requested',
  name: 'Return requested — return label',
  audience: 'customer',
  content: {
    en: {
      subject: 'Your return label for order #{ORDER_NUMBER}',
      body: shell(`
<p style="margin:0 0 16px;">Hi {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">we've received your return request for <strong>{PRODUCT_NAME}</strong> from order <strong>#{ORDER_NUMBER}</strong>. Your DHL return label is ready — it's attached to this email as a PDF and you can also download it below.</p>
${infoBox('Return number', '{RETURN_NUMBER}')}
${infoBox('Reason', '{RETURN_REASON}')}
${cta('{RETURN_LABEL_URL}', 'Download return label')}
<p style="margin:20px 0 16px;">Just print the label, attach it to the parcel, and drop it off at any {RETURN_CARRIER_NAME} location. You can also find this label anytime under "My orders" → "Documents".</p>
<p style="margin:0;font-size:13px;color:#6b7280;">Questions about your return? Reply to this email or reach us at {SUPPORT_EMAIL}.</p>`),
    },
    tr: {
      subject: '#{ORDER_NUMBER} numaralı siparişiniz için iade etiketi',
      body: shell(`
<p style="margin:0 0 16px;">Merhaba {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;"><strong>#{ORDER_NUMBER}</strong> numaralı siparişinizdeki <strong>{PRODUCT_NAME}</strong> ürünü için iade talebinizi aldık. DHL iade etiketiniz hazır — bu e-postaya PDF olarak eklendi, ayrıca aşağıdan da indirebilirsiniz.</p>
${infoBox('İade numarası', '{RETURN_NUMBER}')}
${infoBox('Sebep', '{RETURN_REASON}')}
${cta('{RETURN_LABEL_URL}', 'İade etiketini indir')}
<p style="margin:20px 0 16px;">Etiketi yazdırıp pakete yapıştırmanız ve herhangi bir {RETURN_CARRIER_NAME} şubesine bırakmanız yeterli. Bu etiketi dilediğiniz zaman "Siparişlerim" → "Evraklar" bölümünden de bulabilirsiniz.</p>
<p style="margin:0;font-size:13px;color:#6b7280;">İadeniz hakkında sorularınız için bu e-postayı yanıtlayabilir veya {SUPPORT_EMAIL} adresinden bize ulaşabilirsiniz.</p>`),
    },
    fr: {
      subject: 'Votre étiquette de retour pour la commande #{ORDER_NUMBER}',
      body: shell(`
<p style="margin:0 0 16px;">Bonjour {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">nous avons bien reçu votre demande de retour pour <strong>{PRODUCT_NAME}</strong> de la commande <strong>#{ORDER_NUMBER}</strong>. Votre étiquette de retour DHL est prête — elle est jointe à cet e-mail au format PDF et vous pouvez également la télécharger ci-dessous.</p>
${infoBox('Numéro de retour', '{RETURN_NUMBER}')}
${infoBox('Motif', '{RETURN_REASON}')}
${cta('{RETURN_LABEL_URL}', "Télécharger l'étiquette de retour")}
<p style="margin:20px 0 16px;">Il vous suffit d'imprimer l'étiquette, de la coller sur le colis et de le déposer dans un point {RETURN_CARRIER_NAME}. Vous retrouverez aussi cette étiquette à tout moment sous « Mes commandes » → « Documents ».</p>
<p style="margin:0;font-size:13px;color:#6b7280;">Des questions sur votre retour ? Répondez à cet e-mail ou contactez-nous à {SUPPORT_EMAIL}.</p>`),
    },
    it: {
      subject: 'La tua etichetta di reso per l\'ordine #{ORDER_NUMBER}',
      body: shell(`
<p style="margin:0 0 16px;">Ciao {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">abbiamo ricevuto la tua richiesta di reso per <strong>{PRODUCT_NAME}</strong> dall'ordine <strong>#{ORDER_NUMBER}</strong>. La tua etichetta di reso DHL è pronta — è allegata a questa email in PDF e puoi anche scaricarla qui sotto.</p>
${infoBox('Numero di reso', '{RETURN_NUMBER}')}
${infoBox('Motivo', '{RETURN_REASON}')}
${cta('{RETURN_LABEL_URL}', 'Scarica etichetta di reso')}
<p style="margin:20px 0 16px;">Ti basta stampare l'etichetta, applicarla al pacco e lasciarlo presso un punto {RETURN_CARRIER_NAME}. Puoi ritrovare questa etichetta in qualsiasi momento in "I miei ordini" → "Documenti".</p>
<p style="margin:0;font-size:13px;color:#6b7280;">Domande sul tuo reso? Rispondi a questa email o scrivici a {SUPPORT_EMAIL}.</p>`),
    },
    es: {
      subject: 'Tu etiqueta de devolución para el pedido #{ORDER_NUMBER}',
      body: shell(`
<p style="margin:0 0 16px;">Hola {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">hemos recibido tu solicitud de devolución de <strong>{PRODUCT_NAME}</strong> del pedido <strong>#{ORDER_NUMBER}</strong>. Tu etiqueta de devolución DHL ya está lista — va adjunta a este correo en PDF y también puedes descargarla abajo.</p>
${infoBox('Número de devolución', '{RETURN_NUMBER}')}
${infoBox('Motivo', '{RETURN_REASON}')}
${cta('{RETURN_LABEL_URL}', 'Descargar etiqueta de devolución')}
<p style="margin:20px 0 16px;">Solo tienes que imprimir la etiqueta, pegarla al paquete y dejarlo en cualquier punto {RETURN_CARRIER_NAME}. También puedes encontrar esta etiqueta en cualquier momento en "Mis pedidos" → "Documentos".</p>
<p style="margin:0;font-size:13px;color:#6b7280;">¿Dudas sobre tu devolución? Responde a este correo o escríbenos a {SUPPORT_EMAIL}.</p>`),
    },
    de: {
      subject: 'Dein Retourenschein für Bestellung #{ORDER_NUMBER}',
      body: shell(`
<p style="margin:0 0 16px;">Hallo {CUSTOMER_NAME},</p>
<p style="margin:0 0 16px;">wir haben deine Retourenanfrage für <strong>{PRODUCT_NAME}</strong> aus Bestellung <strong>#{ORDER_NUMBER}</strong> erhalten. Dein DHL-Retourenschein ist fertig — er liegt dieser E-Mail als PDF bei und du kannst ihn auch unten herunterladen.</p>
${infoBox('Retourennummer', '{RETURN_NUMBER}')}
${infoBox('Grund', '{RETURN_REASON}')}
${cta('{RETURN_LABEL_URL}', 'Retourenschein herunterladen')}
<p style="margin:20px 0 16px;">Einfach den Schein ausdrucken, am Paket anbringen und bei einer beliebigen {RETURN_CARRIER_NAME}-Annahmestelle abgeben. Du findest diesen Schein jederzeit auch unter „Meine Bestellungen" → „Dokumente".</p>
<p style="margin:0;font-size:13px;color:#6b7280;">Fragen zu deiner Retoure? Antworte einfach auf diese E-Mail oder schreib uns an {SUPPORT_EMAIL}.</p>`),
    },
  },
}

async function seedReturnRequestedFlow(client) {
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
      `INSERT INTO admin_hub_flow_steps (flow_id, step_order, step_type, email_subject, email_body, email_i18n, email_attachments)
       VALUES ($1, 0, 'send_email', $2, $3, $4::jsonb, $5::jsonb)`,
      [flowId, de.subject, de.body, JSON.stringify(FLOW.content), JSON.stringify(['return_label_pdf'])],
    )
  } catch (e) {
    console.warn('[seed-return-requested-flow]', e?.message || e)
  }
}

module.exports = { seedReturnRequestedFlow }
