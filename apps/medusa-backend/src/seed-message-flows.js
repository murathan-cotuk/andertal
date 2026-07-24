'use strict'

/**
 * One-time, idempotent seed for the customer/seller messaging notification flows
 * (Content → Flows in Sellercentral). Skips any trigger_key that already has a flow —
 * so re-running on every boot never overwrites what the superuser has since edited.
 */

const shell = (bodyHtml) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;">
  <div style="padding:24px 28px;">
    ${bodyHtml}
    <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;">{PLATFORM_NAME}</p>
  </div>
</div>`.trim()

const messageBox = (label) => `
    <div style="margin:16px 0;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;margin-bottom:6px;">${label}</div>
      <div style="font-size:14px;color:#111827;line-height:1.5;">{MESSAGE_BODY}</div>
    </div>`

const button = (url, label) => `
    <div style="margin:20px 0 4px;">
      <a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">${label}</a>
    </div>`

const FLOWS = [
  {
    trigger_key: 'customer_message_sent',
    name: 'Customer message — copy to customer',
    audience: 'customer',
    content: {
      de: {
        subject: 'Deine Nachricht wurde empfangen',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hallo {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">vielen Dank für deine Nachricht. Hier ist eine Kopie zu deinen Unterlagen:</p>
    ${messageBox('Deine Nachricht')}
    <p style="font-size:14px;color:#374151;">Wir melden uns so schnell wie möglich bei dir.</p>
    ${button('{SHOP_MESSAGES_URL}', 'Meine Nachrichten ansehen')}`),
      },
      en: {
        subject: 'We received your message',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hi {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">thanks for reaching out. Here's a copy of your message for your records:</p>
    ${messageBox('Your message')}
    <p style="font-size:14px;color:#374151;">We'll get back to you as soon as possible.</p>
    ${button('{SHOP_MESSAGES_URL}', 'View my messages')}`),
      },
      tr: {
        subject: 'Mesajınızı aldık',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Merhaba {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">Bize ulaştığınız için teşekkürler. Kayıtlarınız için mesajınızın bir kopyası:</p>
    ${messageBox('Mesajınız')}
    <p style="font-size:14px;color:#374151;">En kısa sürede size geri döneceğiz.</p>
    ${button('{SHOP_MESSAGES_URL}', 'Mesajlarımı görüntüle')}`),
      },
      fr: {
        subject: 'Nous avons bien reçu votre message',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Bonjour {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">merci de nous avoir contactés. Voici une copie de votre message pour vos archives :</p>
    ${messageBox('Votre message')}
    <p style="font-size:14px;color:#374151;">Nous vous répondrons dès que possible.</p>
    ${button('{SHOP_MESSAGES_URL}', 'Voir mes messages')}`),
      },
      it: {
        subject: 'Abbiamo ricevuto il tuo messaggio',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Ciao {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">grazie per averci contattato. Ecco una copia del tuo messaggio per i tuoi archivi:</p>
    ${messageBox('Il tuo messaggio')}
    <p style="font-size:14px;color:#374151;">Ti risponderemo il prima possibile.</p>
    ${button('{SHOP_MESSAGES_URL}', 'Vedi i miei messaggi')}`),
      },
      es: {
        subject: 'Hemos recibido tu mensaje',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hola {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">gracias por contactarnos. Aquí tienes una copia de tu mensaje para tus registros:</p>
    ${messageBox('Tu mensaje')}
    <p style="font-size:14px;color:#374151;">Te responderemos lo antes posible.</p>
    ${button('{SHOP_MESSAGES_URL}', 'Ver mis mensajes')}`),
      },
    },
  },
  {
    trigger_key: 'seller_new_customer_message',
    name: 'Customer message — notify seller',
    audience: 'seller',
    content: {
      de: {
        subject: 'Neue Kundennachricht',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hallo {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">du hast eine neue Nachricht von {CUSTOMER_NAME} ({CUSTOMER_EMAIL}) erhalten:</p>
    ${messageBox('Nachricht des Kunden')}
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Im Sellercentral-Posteingang antworten')}`),
      },
      en: {
        subject: 'New customer message',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hi {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">you've received a new message from {CUSTOMER_NAME} ({CUSTOMER_EMAIL}):</p>
    ${messageBox("Customer's message")}
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Reply in Sellercentral inbox')}`),
      },
      tr: {
        subject: 'Yeni müşteri mesajı',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Merhaba {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">{CUSTOMER_NAME} ({CUSTOMER_EMAIL}) size yeni bir mesaj gönderdi:</p>
    ${messageBox('Müşterinin mesajı')}
    ${button('{SELLERCENTRAL_INBOX_URL}', "Sellercentral gelen kutusunda yanıtla")}`),
      },
      fr: {
        subject: 'Nouveau message client',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Bonjour {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">vous avez reçu un nouveau message de {CUSTOMER_NAME} ({CUSTOMER_EMAIL}) :</p>
    ${messageBox('Message du client')}
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Répondre dans la boîte de réception')}`),
      },
      it: {
        subject: 'Nuovo messaggio dal cliente',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Ciao {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">hai ricevuto un nuovo messaggio da {CUSTOMER_NAME} ({CUSTOMER_EMAIL}):</p>
    ${messageBox('Messaggio del cliente')}
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Rispondi nella posta in arrivo')}`),
      },
      es: {
        subject: 'Nuevo mensaje de un cliente',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hola {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">has recibido un nuevo mensaje de {CUSTOMER_NAME} ({CUSTOMER_EMAIL}):</p>
    ${messageBox('Mensaje del cliente')}
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Responder en la bandeja de entrada')}`),
      },
    },
  },
  {
    trigger_key: 'customer_message_replied',
    name: 'Seller/support replied to customer',
    audience: 'customer',
    content: {
      de: {
        subject: 'Antwort auf deine Nachricht',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hallo {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">du hast eine Antwort von {SELLER_NAME} erhalten:</p>
    ${messageBox('Antwort')}
    ${button('{SHOP_MESSAGES_URL}', 'Antworten')}`),
      },
      en: {
        subject: 'Reply to your message',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hi {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">you've received a reply from {SELLER_NAME}:</p>
    ${messageBox('Reply')}
    ${button('{SHOP_MESSAGES_URL}', 'Reply')}`),
      },
      tr: {
        subject: 'Mesajınıza yanıt geldi',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Merhaba {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">{SELLER_NAME} tarafından bir yanıt aldınız:</p>
    ${messageBox('Yanıt')}
    ${button('{SHOP_MESSAGES_URL}', 'Yanıtla')}`),
      },
      fr: {
        subject: 'Réponse à votre message',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Bonjour {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">vous avez reçu une réponse de {SELLER_NAME} :</p>
    ${messageBox('Réponse')}
    ${button('{SHOP_MESSAGES_URL}', 'Répondre')}`),
      },
      it: {
        subject: 'Risposta al tuo messaggio',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Ciao {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">hai ricevuto una risposta da {SELLER_NAME}:</p>
    ${messageBox('Risposta')}
    ${button('{SHOP_MESSAGES_URL}', 'Rispondi')}`),
      },
      es: {
        subject: 'Respuesta a tu mensaje',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hola {CUSTOMER_NAME},</p>
    <p style="font-size:14px;color:#374151;">has recibido una respuesta de {SELLER_NAME}:</p>
    ${messageBox('Respuesta')}
    ${button('{SHOP_MESSAGES_URL}', 'Responder')}`),
      },
    },
  },
  {
    trigger_key: 'seller_support_ticket_sent',
    name: 'Seller support ticket — copy to seller',
    audience: 'seller',
    content: {
      de: {
        subject: 'Deine Anfrage an den Support wurde empfangen',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hallo {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">wir haben deine Anfrage erhalten. Hier ist eine Kopie zu deinen Unterlagen:</p>
    ${messageBox('Deine Nachricht')}
    <p style="font-size:14px;color:#374151;">Unser Support-Team meldet sich so schnell wie möglich bei dir.</p>
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Ticket im Sellercentral ansehen')}`),
      },
      en: {
        subject: 'We received your support request',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hi {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">we've received your request. Here's a copy for your records:</p>
    ${messageBox('Your message')}
    <p style="font-size:14px;color:#374151;">Our support team will get back to you as soon as possible.</p>
    ${button('{SELLERCENTRAL_INBOX_URL}', 'View ticket in Sellercentral')}`),
      },
      tr: {
        subject: 'Destek talebiniz alındı',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Merhaba {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">talebinizi aldık. Kayıtlarınız için bir kopya:</p>
    ${messageBox('Mesajınız')}
    <p style="font-size:14px;color:#374151;">Destek ekibimiz en kısa sürede size dönüş yapacak.</p>
    ${button('{SELLERCENTRAL_INBOX_URL}', "Sellercentral'da talebi görüntüle")}`),
      },
      fr: {
        subject: 'Votre demande de support a bien été reçue',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Bonjour {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">nous avons bien reçu votre demande. Voici une copie pour vos archives :</p>
    ${messageBox('Votre message')}
    <p style="font-size:14px;color:#374151;">Notre équipe support vous répondra dès que possible.</p>
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Voir le ticket dans Sellercentral')}`),
      },
      it: {
        subject: 'Abbiamo ricevuto la tua richiesta di supporto',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Ciao {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">abbiamo ricevuto la tua richiesta. Ecco una copia per i tuoi archivi:</p>
    ${messageBox('Il tuo messaggio')}
    <p style="font-size:14px;color:#374151;">Il nostro team di supporto ti risponderà il prima possibile.</p>
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Vedi il ticket in Sellercentral')}`),
      },
      es: {
        subject: 'Hemos recibido tu solicitud de soporte',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hola {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">hemos recibido tu solicitud. Aquí tienes una copia para tus registros:</p>
    ${messageBox('Tu mensaje')}
    <p style="font-size:14px;color:#374151;">Nuestro equipo de soporte te responderá lo antes posible.</p>
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Ver ticket en Sellercentral')}`),
      },
    },
  },
  {
    trigger_key: 'seller_support_ticket_replied',
    name: 'Support replied to seller ticket',
    audience: 'seller',
    content: {
      de: {
        subject: 'Antwort auf deine Support-Anfrage',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hallo {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">unser Support-Team hat auf dein Ticket geantwortet:</p>
    ${messageBox('Antwort')}
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Im Sellercentral antworten')}`),
      },
      en: {
        subject: 'Reply to your support request',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hi {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">our support team replied to your ticket:</p>
    ${messageBox('Reply')}
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Reply in Sellercentral')}`),
      },
      tr: {
        subject: 'Destek talebinize yanıt geldi',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Merhaba {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">destek ekibimiz talebinize yanıt verdi:</p>
    ${messageBox('Yanıt')}
    ${button('{SELLERCENTRAL_INBOX_URL}', "Sellercentral'da yanıtla")}`),
      },
      fr: {
        subject: 'Réponse à votre demande de support',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Bonjour {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">notre équipe support a répondu à votre ticket :</p>
    ${messageBox('Réponse')}
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Répondre dans Sellercentral')}`),
      },
      it: {
        subject: 'Risposta alla tua richiesta di supporto',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Ciao {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">il nostro team di supporto ha risposto al tuo ticket:</p>
    ${messageBox('Risposta')}
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Rispondi in Sellercentral')}`),
      },
      es: {
        subject: 'Respuesta a tu solicitud de soporte',
        body: shell(`
    <p style="font-size:15px;color:#111827;">Hola {SELLER_NAME},</p>
    <p style="font-size:14px;color:#374151;">nuestro equipo de soporte respondió a tu ticket:</p>
    ${messageBox('Respuesta')}
    ${button('{SELLERCENTRAL_INBOX_URL}', 'Responder en Sellercentral')}`),
      },
    },
  },
]

async function seedMessageFlows(client) {
  for (const flow of FLOWS) {
    try {
      const existing = await client.query(`SELECT id FROM admin_hub_flows WHERE trigger_key = $1 LIMIT 1`, [flow.trigger_key])
      if (existing.rows[0]) continue // never overwrite — superuser may already manage this flow

      const de = flow.content.de
      const fr = await client.query(
        `INSERT INTO admin_hub_flows (name, trigger_key, status, audience) VALUES ($1, $2, 'active', $3) RETURNING id`,
        [flow.name, flow.trigger_key, flow.audience],
      )
      const flowId = fr.rows[0].id
      await client.query(
        `INSERT INTO admin_hub_flow_steps (flow_id, step_order, step_type, email_subject, email_body, email_i18n)
         VALUES ($1, 0, 'send_email', $2, $3, $4::jsonb)`,
        [flowId, de.subject, de.body, JSON.stringify(flow.content)],
      )
    } catch (e) {
      console.warn('[seed-message-flows]', flow.trigger_key, e?.message || e)
    }
  }
}

module.exports = { seedMessageFlows }
