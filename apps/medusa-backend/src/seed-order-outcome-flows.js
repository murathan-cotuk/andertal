'use strict'

/**
 * Idempotent seed for the order outcome flows added 2026-10-08 (order_cancelled customer+seller,
 * order_refunded, return_approved, return_rejected). Only created when no flow exists yet for that
 * trigger + audience — anything the superuser already set up in Sellercentral → Flows stays
 * untouched, and the texts can be edited there. Same shell as seed-return-requested-flow.js.
 */

const ACCENT = '#0d9488'

function shell(bodyHtml) {
  return `<div style="background:#f4f5f7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);"><div style="background:#111827;padding:22px 32px;text-align:center;"><span style="color:#fff;font-size:19px;font-weight:700;">{STORE_NAME}</span></div><div style="height:4px;background:${ACCENT};"></div><div style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
${bodyHtml}
</div><div style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #eee;"><p style="margin:0;font-size:11px;color:#9ca3af;">{STORE_NAME}</p><p style="margin:6px 0 0;font-size:11px;color:#9ca3af;"><a href="{IMPRESSUM_URL}" style="color:#9ca3af;">Impressum</a> &nbsp;·&nbsp; <a href="{DATENSCHUTZ_URL}" style="color:#9ca3af;">Datenschutz</a> &nbsp;·&nbsp; {SUPPORT_EMAIL}</p></div></div></div>`
}

function cta(url, label) {
  return `<div style="text-align:center;margin:24px 0 8px;"><a href="${url}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-weight:600;font-size:14px;">${label}</a></div>`
}

const p = (t) => `<p style="margin:0 0 16px;">${t}</p>`
const small = (t) => `<p style="margin:0;font-size:13px;color:#6b7280;">${t}</p>`

/** Builds { lang: { subject, body } } from per-language strings. */
function content(map) {
  const out = {}
  for (const [lang, v] of Object.entries(map)) {
    out[lang] = { subject: v.subject, body: shell([p(v.hello), ...v.lines.map(p), v.cta ? cta(v.cta[0], v.cta[1]) : '', small(v.foot)].join('\n')) }
  }
  return out
}

const FLOWS = [
  {
    trigger_key: 'order_cancelled', audience: 'customer', name: 'Bestellung storniert — Kunde',
    content: content({
      de: { subject: 'Deine Bestellung #{ORDER_NUMBER} wurde storniert', hello: 'Hallo {CUSTOMER_NAME},', lines: ['deine Bestellung <strong>#{ORDER_NUMBER}</strong> wurde storniert.', 'Bereits bezahlte Beträge erstatten wir auf das ursprüngliche Zahlungsmittel. Je nach Zahlungsart dauert die Gutschrift einige Werktage.'], cta: ['{ORDER_DETAIL_URL}', 'Bestellung ansehen'], foot: 'Fragen? Antworte auf diese E-Mail oder schreib uns an {SUPPORT_EMAIL}.' },
      en: { subject: 'Your order #{ORDER_NUMBER} has been cancelled', hello: 'Hi {CUSTOMER_NAME},', lines: ['your order <strong>#{ORDER_NUMBER}</strong> has been cancelled.', 'Any amount already paid is refunded to your original payment method. Depending on the payment method this can take a few business days.'], cta: ['{ORDER_DETAIL_URL}', 'View order'], foot: 'Questions? Reply to this email or contact {SUPPORT_EMAIL}.' },
      tr: { subject: '#{ORDER_NUMBER} numaralı siparişiniz iptal edildi', hello: 'Merhaba {CUSTOMER_NAME},', lines: ['<strong>#{ORDER_NUMBER}</strong> numaralı siparişiniz iptal edildi.', 'Ödenmiş tutarlar orijinal ödeme yönteminize iade edilir. Ödeme yöntemine göre birkaç iş günü sürebilir.'], cta: ['{ORDER_DETAIL_URL}', 'Siparişi görüntüle'], foot: 'Sorularınız için bu e-postayı yanıtlayın veya {SUPPORT_EMAIL} adresine yazın.' },
      fr: { subject: 'Votre commande #{ORDER_NUMBER} a été annulée', hello: 'Bonjour {CUSTOMER_NAME},', lines: ['votre commande <strong>#{ORDER_NUMBER}</strong> a été annulée.', 'Les montants déjà payés sont remboursés sur votre moyen de paiement initial. Selon le moyen de paiement, cela peut prendre quelques jours ouvrés.'], cta: ['{ORDER_DETAIL_URL}', 'Voir la commande'], foot: 'Des questions ? Répondez à cet e-mail ou écrivez à {SUPPORT_EMAIL}.' },
      it: { subject: 'Il tuo ordine #{ORDER_NUMBER} è stato annullato', hello: 'Ciao {CUSTOMER_NAME},', lines: ['il tuo ordine <strong>#{ORDER_NUMBER}</strong> è stato annullato.', 'Gli importi già pagati vengono rimborsati sul metodo di pagamento originale. A seconda del metodo possono servire alcuni giorni lavorativi.'], cta: ['{ORDER_DETAIL_URL}', 'Vedi ordine'], foot: 'Domande? Rispondi a questa email o scrivi a {SUPPORT_EMAIL}.' },
      es: { subject: 'Tu pedido #{ORDER_NUMBER} ha sido cancelado', hello: 'Hola {CUSTOMER_NAME},', lines: ['tu pedido <strong>#{ORDER_NUMBER}</strong> ha sido cancelado.', 'Los importes ya pagados se reembolsan en tu método de pago original. Según el método, puede tardar algunos días hábiles.'], cta: ['{ORDER_DETAIL_URL}', 'Ver pedido'], foot: '¿Dudas? Responde a este correo o escribe a {SUPPORT_EMAIL}.' },
    }),
  },
  {
    trigger_key: 'order_cancelled', audience: 'seller', name: 'Bestellung storniert — Seller',
    content: content({
      de: { subject: 'Bestellung #{ORDER_NUMBER} wurde storniert', hello: 'Hallo,', lines: ['die Bestellung <strong>#{ORDER_NUMBER}</strong> wurde storniert. Bitte nicht mehr versenden.', 'Die Erstattung an den Kunden und die Korrektur deiner Abrechnung erfolgen automatisch.'], foot: '{STORE_NAME}' },
      en: { subject: 'Order #{ORDER_NUMBER} has been cancelled', hello: 'Hello,', lines: ['order <strong>#{ORDER_NUMBER}</strong> has been cancelled. Please do not ship it.', 'The customer refund and the correction of your settlement happen automatically.'], foot: '{STORE_NAME}' },
      tr: { subject: '#{ORDER_NUMBER} numaralı sipariş iptal edildi', hello: 'Merhaba,', lines: ['<strong>#{ORDER_NUMBER}</strong> numaralı sipariş iptal edildi. Lütfen kargoya vermeyin.', 'Müşteriye iade ve hesap düzeltmeniz otomatik yapılır.'], foot: '{STORE_NAME}' },
      fr: { subject: 'La commande #{ORDER_NUMBER} a été annulée', hello: 'Bonjour,', lines: ['la commande <strong>#{ORDER_NUMBER}</strong> a été annulée. Merci de ne pas l’expédier.', 'Le remboursement du client et la correction de votre décompte sont automatiques.'], foot: '{STORE_NAME}' },
      it: { subject: 'L’ordine #{ORDER_NUMBER} è stato annullato', hello: 'Ciao,', lines: ['l’ordine <strong>#{ORDER_NUMBER}</strong> è stato annullato. Non spedirlo.', 'Il rimborso al cliente e la correzione del tuo conteggio avvengono automaticamente.'], foot: '{STORE_NAME}' },
      es: { subject: 'El pedido #{ORDER_NUMBER} ha sido cancelado', hello: 'Hola,', lines: ['el pedido <strong>#{ORDER_NUMBER}</strong> ha sido cancelado. No lo envíes.', 'El reembolso al cliente y la corrección de tu liquidación se hacen automáticamente.'], foot: '{STORE_NAME}' },
    }),
  },
  {
    trigger_key: 'order_refunded', audience: 'customer', name: 'Erstattung ausgeführt — Kunde',
    content: content({
      de: { subject: 'Erstattung zu Bestellung #{ORDER_NUMBER}', hello: 'Hallo {CUSTOMER_NAME},', lines: ['zu deiner Bestellung <strong>#{ORDER_NUMBER}</strong> haben wir eine Erstattung veranlasst.', 'Der Betrag wird deinem ursprünglichen Zahlungsmittel gutgeschrieben; je nach Zahlungsart dauert das einige Werktage.'], cta: ['{ORDER_DETAIL_URL}', 'Bestellung ansehen'], foot: 'Fragen? Antworte auf diese E-Mail oder schreib uns an {SUPPORT_EMAIL}.' },
      en: { subject: 'Refund for order #{ORDER_NUMBER}', hello: 'Hi {CUSTOMER_NAME},', lines: ['we have issued a refund for your order <strong>#{ORDER_NUMBER}</strong>.', 'The amount is credited to your original payment method; depending on the payment method this takes a few business days.'], cta: ['{ORDER_DETAIL_URL}', 'View order'], foot: 'Questions? Reply to this email or contact {SUPPORT_EMAIL}.' },
      tr: { subject: '#{ORDER_NUMBER} numaralı sipariş için iade ödemesi', hello: 'Merhaba {CUSTOMER_NAME},', lines: ['<strong>#{ORDER_NUMBER}</strong> numaralı siparişiniz için iade ödemesi başlattık.', 'Tutar orijinal ödeme yönteminize yatırılır; ödeme yöntemine göre birkaç iş günü sürebilir.'], cta: ['{ORDER_DETAIL_URL}', 'Siparişi görüntüle'], foot: 'Sorularınız için bu e-postayı yanıtlayın veya {SUPPORT_EMAIL} adresine yazın.' },
      fr: { subject: 'Remboursement de la commande #{ORDER_NUMBER}', hello: 'Bonjour {CUSTOMER_NAME},', lines: ['nous avons effectué un remboursement pour votre commande <strong>#{ORDER_NUMBER}</strong>.', 'Le montant est crédité sur votre moyen de paiement initial ; selon le moyen de paiement, cela prend quelques jours ouvrés.'], cta: ['{ORDER_DETAIL_URL}', 'Voir la commande'], foot: 'Des questions ? Répondez à cet e-mail ou écrivez à {SUPPORT_EMAIL}.' },
      it: { subject: 'Rimborso per l’ordine #{ORDER_NUMBER}', hello: 'Ciao {CUSTOMER_NAME},', lines: ['abbiamo effettuato un rimborso per il tuo ordine <strong>#{ORDER_NUMBER}</strong>.', 'L’importo viene accreditato sul metodo di pagamento originale; a seconda del metodo servono alcuni giorni lavorativi.'], cta: ['{ORDER_DETAIL_URL}', 'Vedi ordine'], foot: 'Domande? Rispondi a questa email o scrivi a {SUPPORT_EMAIL}.' },
      es: { subject: 'Reembolso del pedido #{ORDER_NUMBER}', hello: 'Hola {CUSTOMER_NAME},', lines: ['hemos realizado un reembolso de tu pedido <strong>#{ORDER_NUMBER}</strong>.', 'El importe se abona en tu método de pago original; según el método, tarda algunos días hábiles.'], cta: ['{ORDER_DETAIL_URL}', 'Ver pedido'], foot: '¿Dudas? Responde a este correo o escribe a {SUPPORT_EMAIL}.' },
    }),
  },
  {
    trigger_key: 'return_approved', audience: 'customer', name: 'Retoure genehmigt — Kunde',
    content: content({
      de: { subject: 'Deine Retoure {RETURN_NUMBER} wurde genehmigt', hello: 'Hallo {CUSTOMER_NAME},', lines: ['deine Retoure <strong>{RETURN_NUMBER}</strong> zu Bestellung <strong>#{ORDER_NUMBER}</strong> wurde genehmigt.', 'Sobald die Ware beim Händler eingegangen und geprüft ist, erstatten wir den Betrag.'], cta: ['{ORDER_DETAIL_URL}', 'Bestellung ansehen'], foot: 'Fragen? Antworte auf diese E-Mail oder schreib uns an {SUPPORT_EMAIL}.' },
      en: { subject: 'Your return {RETURN_NUMBER} has been approved', hello: 'Hi {CUSTOMER_NAME},', lines: ['your return <strong>{RETURN_NUMBER}</strong> for order <strong>#{ORDER_NUMBER}</strong> has been approved.', 'Once the seller has received and checked the goods, we refund the amount.'], cta: ['{ORDER_DETAIL_URL}', 'View order'], foot: 'Questions? Reply to this email or contact {SUPPORT_EMAIL}.' },
      tr: { subject: '{RETURN_NUMBER} numaralı iadeniz onaylandı', hello: 'Merhaba {CUSTOMER_NAME},', lines: ['<strong>#{ORDER_NUMBER}</strong> numaralı siparişinize ait <strong>{RETURN_NUMBER}</strong> numaralı iadeniz onaylandı.', 'Ürün satıcıya ulaşıp kontrol edildiğinde tutarı iade ederiz.'], cta: ['{ORDER_DETAIL_URL}', 'Siparişi görüntüle'], foot: 'Sorularınız için bu e-postayı yanıtlayın veya {SUPPORT_EMAIL} adresine yazın.' },
      fr: { subject: 'Votre retour {RETURN_NUMBER} a été accepté', hello: 'Bonjour {CUSTOMER_NAME},', lines: ['votre retour <strong>{RETURN_NUMBER}</strong> pour la commande <strong>#{ORDER_NUMBER}</strong> a été accepté.', 'Dès que le vendeur a reçu et vérifié la marchandise, nous remboursons le montant.'], cta: ['{ORDER_DETAIL_URL}', 'Voir la commande'], foot: 'Des questions ? Répondez à cet e-mail ou écrivez à {SUPPORT_EMAIL}.' },
      it: { subject: 'Il tuo reso {RETURN_NUMBER} è stato approvato', hello: 'Ciao {CUSTOMER_NAME},', lines: ['il tuo reso <strong>{RETURN_NUMBER}</strong> per l’ordine <strong>#{ORDER_NUMBER}</strong> è stato approvato.', 'Quando il venditore avrà ricevuto e controllato la merce, rimborseremo l’importo.'], cta: ['{ORDER_DETAIL_URL}', 'Vedi ordine'], foot: 'Domande? Rispondi a questa email o scrivi a {SUPPORT_EMAIL}.' },
      es: { subject: 'Tu devolución {RETURN_NUMBER} ha sido aprobada', hello: 'Hola {CUSTOMER_NAME},', lines: ['tu devolución <strong>{RETURN_NUMBER}</strong> del pedido <strong>#{ORDER_NUMBER}</strong> ha sido aprobada.', 'Cuando el vendedor reciba y revise la mercancía, reembolsaremos el importe.'], cta: ['{ORDER_DETAIL_URL}', 'Ver pedido'], foot: '¿Dudas? Responde a este correo o escribe a {SUPPORT_EMAIL}.' },
    }),
  },
  {
    trigger_key: 'return_rejected', audience: 'customer', name: 'Retoure abgelehnt — Kunde',
    content: content({
      de: { subject: 'Zu deiner Retoure {RETURN_NUMBER}', hello: 'Hallo {CUSTOMER_NAME},', lines: ['deine Retoure <strong>{RETURN_NUMBER}</strong> zu Bestellung <strong>#{ORDER_NUMBER}</strong> wurde abgelehnt.', 'Wenn du Fragen dazu hast oder die Entscheidung nicht nachvollziehen kannst, melde dich bitte bei uns — wir prüfen den Fall.'], cta: ['{ORDER_DETAIL_URL}', 'Bestellung ansehen'], foot: 'Antworte auf diese E-Mail oder schreib uns an {SUPPORT_EMAIL}.' },
      en: { subject: 'About your return {RETURN_NUMBER}', hello: 'Hi {CUSTOMER_NAME},', lines: ['your return <strong>{RETURN_NUMBER}</strong> for order <strong>#{ORDER_NUMBER}</strong> has been declined.', 'If you have questions or disagree with the decision, please contact us — we will review the case.'], cta: ['{ORDER_DETAIL_URL}', 'View order'], foot: 'Reply to this email or contact {SUPPORT_EMAIL}.' },
      tr: { subject: '{RETURN_NUMBER} numaralı iadeniz hakkında', hello: 'Merhaba {CUSTOMER_NAME},', lines: ['<strong>#{ORDER_NUMBER}</strong> numaralı siparişinize ait <strong>{RETURN_NUMBER}</strong> numaralı iadeniz reddedildi.', 'Sorunuz varsa veya karara katılmıyorsanız lütfen bize yazın — durumu inceleyeceğiz.'], cta: ['{ORDER_DETAIL_URL}', 'Siparişi görüntüle'], foot: 'Bu e-postayı yanıtlayın veya {SUPPORT_EMAIL} adresine yazın.' },
      fr: { subject: 'Concernant votre retour {RETURN_NUMBER}', hello: 'Bonjour {CUSTOMER_NAME},', lines: ['votre retour <strong>{RETURN_NUMBER}</strong> pour la commande <strong>#{ORDER_NUMBER}</strong> a été refusé.', 'Si vous avez des questions ou contestez la décision, contactez-nous — nous examinerons le cas.'], cta: ['{ORDER_DETAIL_URL}', 'Voir la commande'], foot: 'Répondez à cet e-mail ou écrivez à {SUPPORT_EMAIL}.' },
      it: { subject: 'Sul tuo reso {RETURN_NUMBER}', hello: 'Ciao {CUSTOMER_NAME},', lines: ['il tuo reso <strong>{RETURN_NUMBER}</strong> per l’ordine <strong>#{ORDER_NUMBER}</strong> è stato rifiutato.', 'Se hai domande o non condividi la decisione, contattaci — esamineremo il caso.'], cta: ['{ORDER_DETAIL_URL}', 'Vedi ordine'], foot: 'Rispondi a questa email o scrivi a {SUPPORT_EMAIL}.' },
      es: { subject: 'Sobre tu devolución {RETURN_NUMBER}', hello: 'Hola {CUSTOMER_NAME},', lines: ['tu devolución <strong>{RETURN_NUMBER}</strong> del pedido <strong>#{ORDER_NUMBER}</strong> ha sido rechazada.', 'Si tienes dudas o no estás de acuerdo con la decisión, contáctanos — revisaremos el caso.'], cta: ['{ORDER_DETAIL_URL}', 'Ver pedido'], foot: 'Responde a este correo o escribe a {SUPPORT_EMAIL}.' },
    }),
  },
]

async function seedOrderOutcomeFlows(client) {
  for (const f of FLOWS) {
    try {
      const existing = await client.query(
        `SELECT id FROM admin_hub_flows WHERE trigger_key = $1 AND COALESCE(audience, 'customer') = $2 LIMIT 1`,
        [f.trigger_key, f.audience],
      )
      if (existing.rows[0]) continue // superuser's own flow (or an earlier seed) wins
      const fr = await client.query(
        `INSERT INTO admin_hub_flows (name, trigger_key, status, audience) VALUES ($1, $2, 'active', $3) RETURNING id`,
        [f.name, f.trigger_key, f.audience],
      )
      const de = f.content.de
      await client.query(
        `INSERT INTO admin_hub_flow_steps (flow_id, step_order, step_type, email_subject, email_body, email_i18n, email_attachments)
         VALUES ($1, 0, 'send_email', $2, $3, $4::jsonb, $5::jsonb)`,
        [fr.rows[0].id, de.subject, de.body, JSON.stringify(f.content), JSON.stringify([])],
      )
    } catch (e) {
      console.warn('[seed-order-outcome-flows]', f.trigger_key, f.audience, e?.message || e)
    }
  }
}

module.exports = { seedOrderOutcomeFlows, FLOWS }
