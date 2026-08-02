'use strict'

/**
 * One-time, idempotent seed for the seller lifecycle notification flows
 * (Content → Flows in Sellercentral, audience = "seller"). Skips any trigger_key
 * that already has a flow — so re-running on every boot never overwrites what the
 * superuser has since edited. Mirrors seed-message-flows.js's pattern exactly.
 */

const ACCENTS = {
  seller_signup: '#2563eb',
  seller_docs_submitted: '#0891b2',
  seller_verification_approved: '#16a34a',
  seller_verification_rejected: '#dc2626',
  seller_documents_required: '#d97706',
}

function shell(accent, bodyHtml) {
  return `<div style="background:#f4f5f7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);"><div style="background:#111827;padding:22px 32px;text-align:center;"><span style="color:#fff;font-size:19px;font-weight:700;">{PLATFORM_NAME}</span><div style="color:#9ca3af;font-size:11px;margin-top:2px;letter-spacing:.5px;">SELLER CENTRAL</div></div><div style="height:4px;background:${accent};"></div><div style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
${bodyHtml}
</div><div style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #eee;"><p style="margin:0;font-size:11px;color:#9ca3af;">{STORE_NAME} · {PLATFORM_NAME}</p><p style="margin:6px 0 0;font-size:11px;color:#9ca3af;"><a href="{IMPRESSUM_URL}" style="color:#9ca3af;">Impressum</a> &nbsp;·&nbsp; <a href="{DATENSCHUTZ_URL}" style="color:#9ca3af;">Datenschutz</a> &nbsp;·&nbsp; {SUPPORT_EMAIL}</p></div></div></div>`
}

function cta(accent, url, label) {
  return `<div style="text-align:center;margin:28px 0 8px;"><a href="${url}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-weight:600;font-size:14px;">${label}</a></div>`
}

const FLOWS = [
  {
    trigger_key: 'seller_signup',
    name: 'Seller registered — welcome',
    audience: 'seller',
    content: {
      en: {
        subject: "Welcome to {PLATFORM_NAME} Seller Central — let's get you verified",
        body: shell(ACCENTS.seller_signup, `
<p style="margin:0 0 16px;">Hi {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Thanks for registering <strong>{STORE_NAME}</strong> on {PLATFORM_NAME}! Your account has been created and you can already log in to Seller Central.</p>
<p style="margin:0 0 16px;">Before you can start selling, we need to verify your business. Here's what's next:</p>
<ol style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">Log in to Seller Central</li>
<li style="margin-bottom:6px;">Complete your company profile (tax ID, VAT ID, business address)</li>
<li style="margin-bottom:6px;">Upload the required verification documents</li>
<li>We'll review everything and get back to you — usually within 1–2 business days</li>
</ol>
${cta(ACCENTS.seller_signup, '{SELLERCENTRAL_LOGIN_URL}', 'Complete verification')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Questions? Just reply to this email or reach us at {SUPPORT_EMAIL}.</p>`),
      },
      tr: {
        subject: "{PLATFORM_NAME} Seller Central'a Hoş Geldiniz — Doğrulama Sürecine Başlayalım",
        body: shell(ACCENTS.seller_signup, `
<p style="margin:0 0 16px;">Merhaba {FIRST_NAME},</p>
<p style="margin:0 0 16px;"><strong>{STORE_NAME}</strong> mağazanızı {PLATFORM_NAME} üzerinde kaydettiğiniz için teşekkürler! Hesabınız oluşturuldu ve Seller Central'a hemen giriş yapabilirsiniz.</p>
<p style="margin:0 0 16px;">Satışa başlayabilmeniz için işletmenizi doğrulamamız gerekiyor. Sıradaki adımlar:</p>
<ol style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">Seller Central'a giriş yapın</li>
<li style="margin-bottom:6px;">Firma profilinizi tamamlayın (vergi no, KDV no, işletme adresi)</li>
<li style="margin-bottom:6px;">Gerekli doğrulama evraklarını yükleyin</li>
<li>Başvurunuzu inceleyip genellikle 1-2 iş günü içinde size döneceğiz</li>
</ol>
${cta(ACCENTS.seller_signup, '{SELLERCENTRAL_LOGIN_URL}', 'Doğrulamayı tamamla')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Sorularınız için bu e-postayı yanıtlayabilir veya {SUPPORT_EMAIL} adresine yazabilirsiniz.</p>`),
      },
      fr: {
        subject: 'Bienvenue sur {PLATFORM_NAME} Seller Central — passons à la vérification',
        body: shell(ACCENTS.seller_signup, `
<p style="margin:0 0 16px;">Bonjour {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Merci d'avoir inscrit <strong>{STORE_NAME}</strong> sur {PLATFORM_NAME} ! Votre compte a été créé et vous pouvez déjà vous connecter à Seller Central.</p>
<p style="margin:0 0 16px;">Avant de pouvoir vendre, nous devons vérifier votre entreprise. Voici les prochaines étapes :</p>
<ol style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">Connectez-vous à Seller Central</li>
<li style="margin-bottom:6px;">Complétez votre profil d'entreprise (n° fiscal, n° TVA, adresse)</li>
<li style="margin-bottom:6px;">Téléchargez les documents de vérification requis</li>
<li>Nous examinerons votre dossier et reviendrons vers vous sous 1 à 2 jours ouvrés</li>
</ol>
${cta(ACCENTS.seller_signup, '{SELLERCENTRAL_LOGIN_URL}', 'Compléter la vérification')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Des questions ? Répondez simplement à cet e-mail ou écrivez-nous à {SUPPORT_EMAIL}.</p>`),
      },
      it: {
        subject: 'Benvenuto su {PLATFORM_NAME} Seller Central — iniziamo la verifica',
        body: shell(ACCENTS.seller_signup, `
<p style="margin:0 0 16px;">Ciao {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Grazie per aver registrato <strong>{STORE_NAME}</strong> su {PLATFORM_NAME}! Il tuo account è stato creato e puoi già accedere a Seller Central.</p>
<p style="margin:0 0 16px;">Prima di poter vendere, dobbiamo verificare la tua attività. Ecco i prossimi passi:</p>
<ol style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">Accedi a Seller Central</li>
<li style="margin-bottom:6px;">Completa il profilo aziendale (P.IVA, codice fiscale, indirizzo)</li>
<li style="margin-bottom:6px;">Carica i documenti di verifica richiesti</li>
<li>Esamineremo la tua richiesta e ti risponderemo entro 1-2 giorni lavorativi</li>
</ol>
${cta(ACCENTS.seller_signup, '{SELLERCENTRAL_LOGIN_URL}', 'Completa la verifica')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Domande? Rispondi a questa email oppure scrivi a {SUPPORT_EMAIL}.</p>`),
      },
      es: {
        subject: 'Bienvenido a {PLATFORM_NAME} Seller Central — empecemos la verificación',
        body: shell(ACCENTS.seller_signup, `
<p style="margin:0 0 16px;">Hola {FIRST_NAME},</p>
<p style="margin:0 0 16px;">¡Gracias por registrar <strong>{STORE_NAME}</strong> en {PLATFORM_NAME}! Tu cuenta ya está creada y puedes acceder a Seller Central.</p>
<p style="margin:0 0 16px;">Antes de poder vender, necesitamos verificar tu negocio. Estos son los próximos pasos:</p>
<ol style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">Inicia sesión en Seller Central</li>
<li style="margin-bottom:6px;">Completa tu perfil de empresa (NIF, IVA, dirección fiscal)</li>
<li style="margin-bottom:6px;">Sube los documentos de verificación requeridos</li>
<li>Revisaremos tu solicitud y te responderemos en 1-2 días hábiles</li>
</ol>
${cta(ACCENTS.seller_signup, '{SELLERCENTRAL_LOGIN_URL}', 'Completar verificación')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">¿Dudas? Responde a este correo o escríbenos a {SUPPORT_EMAIL}.</p>`),
      },
      de: {
        subject: 'Willkommen bei {PLATFORM_NAME} Seller Central — jetzt verifizieren',
        body: shell(ACCENTS.seller_signup, `
<p style="margin:0 0 16px;">Hallo {FIRST_NAME},</p>
<p style="margin:0 0 16px;">danke, dass Sie <strong>{STORE_NAME}</strong> bei {PLATFORM_NAME} registriert haben! Ihr Konto wurde erstellt und Sie können sich bereits im Seller Central anmelden.</p>
<p style="margin:0 0 16px;">Bevor Sie mit dem Verkauf starten können, müssen wir Ihr Unternehmen verifizieren. Die nächsten Schritte:</p>
<ol style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">Im Seller Central anmelden</li>
<li style="margin-bottom:6px;">Firmenprofil vervollständigen (Steuernummer, USt-IdNr., Geschäftsadresse)</li>
<li style="margin-bottom:6px;">Erforderliche Verifizierungsdokumente hochladen</li>
<li>Wir prüfen alles und melden uns in der Regel innerhalb von 1–2 Werktagen</li>
</ol>
${cta(ACCENTS.seller_signup, '{SELLERCENTRAL_LOGIN_URL}', 'Verifizierung abschließen')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Fragen? Antworten Sie einfach auf diese E-Mail oder schreiben Sie an {SUPPORT_EMAIL}.</p>`),
      },
    },
  },
  {
    trigger_key: 'seller_docs_submitted',
    name: 'Seller documents submitted — under review',
    audience: 'seller',
    content: {
      en: {
        subject: "We've received your documents — verification in progress",
        body: shell(ACCENTS.seller_docs_submitted, `
<p style="margin:0 0 16px;">Hi {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Thanks — we've received the verification documents for <strong>{STORE_NAME}</strong>. Our team is now reviewing them.</p>
<p style="margin:0 0 16px;">This usually takes <strong>1–2 business days</strong>. You'll get an email the moment a decision is made — no action needed from you right now.</p>
<p style="margin:0 0 16px;">You can check your current status anytime in Seller Central under "Verifizierung".</p>
${cta(ACCENTS.seller_docs_submitted, '{SELLERCENTRAL_LOGIN_URL}', 'View verification status')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Questions in the meantime? Reach us at {SUPPORT_EMAIL}.</p>`),
      },
      tr: {
        subject: 'Evraklarınızı Aldık — Doğrulama Süreci Başladı',
        body: shell(ACCENTS.seller_docs_submitted, `
<p style="margin:0 0 16px;">Merhaba {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Teşekkürler — <strong>{STORE_NAME}</strong> için doğrulama evraklarınızı aldık. Ekibimiz şu anda inceliyor.</p>
<p style="margin:0 0 16px;">Bu süreç genellikle <strong>1-2 iş günü</strong> sürer. Bir karar verildiğinde hemen e-posta ile bilgilendirileceksiniz — şu an sizden bir işlem beklenmiyor.</p>
<p style="margin:0 0 16px;">Güncel durumunuzu Seller Central'da "Doğrulama" bölümünden dilediğiniz zaman kontrol edebilirsiniz.</p>
${cta(ACCENTS.seller_docs_submitted, '{SELLERCENTRAL_LOGIN_URL}', 'Doğrulama durumunu görüntüle')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Bu süreçte sorularınız olursa {SUPPORT_EMAIL} adresinden bize ulaşabilirsiniz.</p>`),
      },
      fr: {
        subject: 'Nous avons bien reçu vos documents — vérification en cours',
        body: shell(ACCENTS.seller_docs_submitted, `
<p style="margin:0 0 16px;">Bonjour {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Merci — nous avons bien reçu les documents de vérification pour <strong>{STORE_NAME}</strong>. Notre équipe les examine actuellement.</p>
<p style="margin:0 0 16px;">Cela prend généralement <strong>1 à 2 jours ouvrés</strong>. Vous recevrez un e-mail dès qu'une décision sera prise — aucune action n'est requise de votre part pour le moment.</p>
<p style="margin:0 0 16px;">Vous pouvez consulter votre statut à tout moment dans Seller Central, sous « Vérification ».</p>
${cta(ACCENTS.seller_docs_submitted, '{SELLERCENTRAL_LOGIN_URL}', 'Voir le statut de vérification')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Des questions en attendant ? Contactez-nous à {SUPPORT_EMAIL}.</p>`),
      },
      it: {
        subject: 'Abbiamo ricevuto i tuoi documenti — verifica in corso',
        body: shell(ACCENTS.seller_docs_submitted, `
<p style="margin:0 0 16px;">Ciao {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Grazie — abbiamo ricevuto i documenti di verifica per <strong>{STORE_NAME}</strong>. Il nostro team li sta esaminando.</p>
<p style="margin:0 0 16px;">Di solito richiede <strong>1-2 giorni lavorativi</strong>. Riceverai un'email non appena verrà presa una decisione — al momento non è richiesta nessuna azione da parte tua.</p>
<p style="margin:0 0 16px;">Puoi controllare lo stato in qualsiasi momento in Seller Central, sotto "Verifica".</p>
${cta(ACCENTS.seller_docs_submitted, '{SELLERCENTRAL_LOGIN_URL}', 'Visualizza stato verifica')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Domande nel frattempo? Scrivici a {SUPPORT_EMAIL}.</p>`),
      },
      es: {
        subject: 'Hemos recibido tus documentos — verificación en curso',
        body: shell(ACCENTS.seller_docs_submitted, `
<p style="margin:0 0 16px;">Hola {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Gracias — hemos recibido los documentos de verificación de <strong>{STORE_NAME}</strong>. Nuestro equipo los está revisando.</p>
<p style="margin:0 0 16px;">Esto suele tardar <strong>1-2 días hábiles</strong>. Recibirás un correo en cuanto tomemos una decisión — no necesitas hacer nada más por ahora.</p>
<p style="margin:0 0 16px;">Puedes consultar el estado en cualquier momento en Seller Central, en "Verificación".</p>
${cta(ACCENTS.seller_docs_submitted, '{SELLERCENTRAL_LOGIN_URL}', 'Ver estado de verificación')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">¿Dudas mientras tanto? Escríbenos a {SUPPORT_EMAIL}.</p>`),
      },
      de: {
        subject: 'Wir haben Ihre Dokumente erhalten — Prüfung läuft',
        body: shell(ACCENTS.seller_docs_submitted, `
<p style="margin:0 0 16px;">Hallo {FIRST_NAME},</p>
<p style="margin:0 0 16px;">danke — wir haben die Verifizierungsdokumente für <strong>{STORE_NAME}</strong> erhalten. Unser Team prüft diese gerade.</p>
<p style="margin:0 0 16px;">Das dauert in der Regel <strong>1–2 Werktage</strong>. Sobald eine Entscheidung getroffen wurde, erhalten Sie eine E-Mail — Sie müssen aktuell nichts weiter tun.</p>
<p style="margin:0 0 16px;">Ihren aktuellen Status können Sie jederzeit im Seller Central unter „Verifizierung" einsehen.</p>
${cta(ACCENTS.seller_docs_submitted, '{SELLERCENTRAL_LOGIN_URL}', 'Verifizierungsstatus ansehen')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Fragen in der Zwischenzeit? Schreiben Sie an {SUPPORT_EMAIL}.</p>`),
      },
    },
  },
  {
    trigger_key: 'seller_verification_approved',
    name: 'Seller verification approved',
    audience: 'seller',
    content: {
      en: {
        subject: "You're approved! Start selling on {PLATFORM_NAME}",
        body: shell(ACCENTS.seller_verification_approved, `
<div style="text-align:center;font-size:40px;margin-bottom:8px;">🎉</div>
<p style="margin:0 0 16px;text-align:center;font-size:18px;font-weight:700;color:#16a34a;">Congratulations, {FIRST_NAME}!</p>
<p style="margin:0 0 16px;"><strong>{STORE_NAME}</strong> has been verified and approved. You can now list products and start selling on {PLATFORM_NAME}.</p>
<p style="margin:0 0 16px;">A few tips to get off to a strong start:</p>
<ul style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">Add your first products with clear photos and complete descriptions</li>
<li style="margin-bottom:6px;">Set competitive prices and accurate stock levels</li>
<li style="margin-bottom:6px;">Keep your shipping times up to date to avoid delays</li>
</ul>
${cta(ACCENTS.seller_verification_approved, '{SELLERCENTRAL_LOGIN_URL}', 'Go to Seller Central')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Need help getting started? We're at {SUPPORT_EMAIL}.</p>`),
      },
      tr: {
        subject: "Onaylandınız! {PLATFORM_NAME}'de Satışa Başlayabilirsiniz",
        body: shell(ACCENTS.seller_verification_approved, `
<div style="text-align:center;font-size:40px;margin-bottom:8px;">🎉</div>
<p style="margin:0 0 16px;text-align:center;font-size:18px;font-weight:700;color:#16a34a;">Tebrikler, {FIRST_NAME}!</p>
<p style="margin:0 0 16px;"><strong>{STORE_NAME}</strong> doğrulandı ve onaylandı. Artık ürün ekleyip {PLATFORM_NAME}'de satışa başlayabilirsiniz.</p>
<p style="margin:0 0 16px;">Güçlü bir başlangıç için birkaç ipucu:</p>
<ul style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">İlk ürünlerinizi net fotoğraflar ve eksiksiz açıklamalarla ekleyin</li>
<li style="margin-bottom:6px;">Rekabetçi fiyatlar ve doğru stok seviyeleri belirleyin</li>
<li style="margin-bottom:6px;">Gecikmeleri önlemek için kargo sürelerinizi güncel tutun</li>
</ul>
${cta(ACCENTS.seller_verification_approved, '{SELLERCENTRAL_LOGIN_URL}', "Seller Central'a git")}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Başlarken yardıma mı ihtiyacınız var? {SUPPORT_EMAIL} adresinden bize ulaşın.</p>`),
      },
      fr: {
        subject: 'Vous êtes approuvé ! Commencez à vendre sur {PLATFORM_NAME}',
        body: shell(ACCENTS.seller_verification_approved, `
<div style="text-align:center;font-size:40px;margin-bottom:8px;">🎉</div>
<p style="margin:0 0 16px;text-align:center;font-size:18px;font-weight:700;color:#16a34a;">Félicitations, {FIRST_NAME} !</p>
<p style="margin:0 0 16px;"><strong>{STORE_NAME}</strong> a été vérifié et approuvé. Vous pouvez désormais ajouter des produits et commencer à vendre sur {PLATFORM_NAME}.</p>
<p style="margin:0 0 16px;">Quelques conseils pour bien démarrer :</p>
<ul style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">Ajoutez vos premiers produits avec des photos claires et des descriptions complètes</li>
<li style="margin-bottom:6px;">Fixez des prix compétitifs et des niveaux de stock précis</li>
<li style="margin-bottom:6px;">Tenez vos délais de livraison à jour pour éviter tout retard</li>
</ul>
${cta(ACCENTS.seller_verification_approved, '{SELLERCENTRAL_LOGIN_URL}', 'Accéder à Seller Central')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Besoin d'aide pour démarrer ? Écrivez-nous à {SUPPORT_EMAIL}.</p>`),
      },
      it: {
        subject: 'Sei stato approvato! Inizia a vendere su {PLATFORM_NAME}',
        body: shell(ACCENTS.seller_verification_approved, `
<div style="text-align:center;font-size:40px;margin-bottom:8px;">🎉</div>
<p style="margin:0 0 16px;text-align:center;font-size:18px;font-weight:700;color:#16a34a;">Congratulazioni, {FIRST_NAME}!</p>
<p style="margin:0 0 16px;"><strong>{STORE_NAME}</strong> è stato verificato e approvato. Ora puoi aggiungere prodotti e iniziare a vendere su {PLATFORM_NAME}.</p>
<p style="margin:0 0 16px;">Qualche consiglio per partire con il piede giusto:</p>
<ul style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">Aggiungi i primi prodotti con foto chiare e descrizioni complete</li>
<li style="margin-bottom:6px;">Imposta prezzi competitivi e livelli di stock accurati</li>
<li style="margin-bottom:6px;">Mantieni aggiornati i tempi di spedizione per evitare ritardi</li>
</ul>
${cta(ACCENTS.seller_verification_approved, '{SELLERCENTRAL_LOGIN_URL}', 'Vai a Seller Central')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Serve aiuto per iniziare? Scrivici a {SUPPORT_EMAIL}.</p>`),
      },
      es: {
        subject: '¡Has sido aprobado! Empieza a vender en {PLATFORM_NAME}',
        body: shell(ACCENTS.seller_verification_approved, `
<div style="text-align:center;font-size:40px;margin-bottom:8px;">🎉</div>
<p style="margin:0 0 16px;text-align:center;font-size:18px;font-weight:700;color:#16a34a;">¡Enhorabuena, {FIRST_NAME}!</p>
<p style="margin:0 0 16px;"><strong>{STORE_NAME}</strong> ha sido verificado y aprobado. Ya puedes añadir productos y empezar a vender en {PLATFORM_NAME}.</p>
<p style="margin:0 0 16px;">Algunos consejos para empezar con fuerza:</p>
<ul style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">Añade tus primeros productos con fotos claras y descripciones completas</li>
<li style="margin-bottom:6px;">Define precios competitivos y niveles de stock precisos</li>
<li style="margin-bottom:6px;">Mantén tus plazos de envío actualizados para evitar retrasos</li>
</ul>
${cta(ACCENTS.seller_verification_approved, '{SELLERCENTRAL_LOGIN_URL}', 'Ir a Seller Central')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">¿Necesitas ayuda para empezar? Escríbenos a {SUPPORT_EMAIL}.</p>`),
      },
      de: {
        subject: 'Sie wurden freigeschaltet! Jetzt bei {PLATFORM_NAME} verkaufen',
        body: shell(ACCENTS.seller_verification_approved, `
<div style="text-align:center;font-size:40px;margin-bottom:8px;">🎉</div>
<p style="margin:0 0 16px;text-align:center;font-size:18px;font-weight:700;color:#16a34a;">Herzlichen Glückwunsch, {FIRST_NAME}!</p>
<p style="margin:0 0 16px;"><strong>{STORE_NAME}</strong> wurde verifiziert und freigeschaltet. Sie können jetzt Produkte einstellen und bei {PLATFORM_NAME} mit dem Verkauf starten.</p>
<p style="margin:0 0 16px;">Ein paar Tipps für einen starken Start:</p>
<ul style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">Stellen Sie Ihre ersten Produkte mit klaren Fotos und vollständigen Beschreibungen ein</li>
<li style="margin-bottom:6px;">Wählen Sie wettbewerbsfähige Preise und korrekte Lagerbestände</li>
<li style="margin-bottom:6px;">Halten Sie Ihre Lieferzeiten aktuell, um Verzögerungen zu vermeiden</li>
</ul>
${cta(ACCENTS.seller_verification_approved, '{SELLERCENTRAL_LOGIN_URL}', 'Zum Seller Central')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Brauchen Sie Hilfe beim Start? Schreiben Sie an {SUPPORT_EMAIL}.</p>`),
      },
    },
  },
  {
    trigger_key: 'seller_verification_rejected',
    name: 'Seller verification rejected',
    audience: 'seller',
    content: {
      en: {
        subject: 'Update on your {PLATFORM_NAME} seller application',
        body: shell(ACCENTS.seller_verification_rejected, `
<p style="margin:0 0 16px;">Hi {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Thank you for applying to sell on {PLATFORM_NAME} with <strong>{STORE_NAME}</strong>. After reviewing your application, we're unable to approve your seller account at this time.</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>Reason:</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">If you believe this decision was made in error, or if you can address the issue above, you're welcome to update your profile and documents in Seller Central and we'll take another look.</p>
${cta(ACCENTS.seller_verification_rejected, '{SELLERCENTRAL_LOGIN_URL}', 'Update my application')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Questions about this decision? Contact us at {SUPPORT_EMAIL}.</p>`),
      },
      tr: {
        subject: '{PLATFORM_NAME} Satıcı Başvurunuz Hakkında Bilgilendirme',
        body: shell(ACCENTS.seller_verification_rejected, `
<p style="margin:0 0 16px;">Merhaba {FIRST_NAME},</p>
<p style="margin:0 0 16px;"><strong>{STORE_NAME}</strong> ile {PLATFORM_NAME}'de satıcı olmak için başvurduğunuz için teşekkür ederiz. Başvurunuzu inceledik ancak şu an satıcı hesabınızı onaylayamıyoruz.</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>Sebep:</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">Bu kararın hatalı olduğunu düşünüyorsanız veya yukarıdaki konuyu giderebiliyorsanız, Seller Central üzerinden profilinizi ve evraklarınızı güncelleyebilir, başvurunuzu tekrar değerlendirmemizi sağlayabilirsiniz.</p>
${cta(ACCENTS.seller_verification_rejected, '{SELLERCENTRAL_LOGIN_URL}', 'Başvurumu güncelle')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Bu karar hakkında sorularınız için {SUPPORT_EMAIL} adresinden bize ulaşabilirsiniz.</p>`),
      },
      fr: {
        subject: 'Mise à jour concernant votre candidature vendeur {PLATFORM_NAME}',
        body: shell(ACCENTS.seller_verification_rejected, `
<p style="margin:0 0 16px;">Bonjour {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Merci d'avoir postulé pour vendre sur {PLATFORM_NAME} avec <strong>{STORE_NAME}</strong>. Après examen de votre dossier, nous ne sommes pas en mesure d'approuver votre compte vendeur pour le moment.</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>Motif :</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">Si vous pensez qu'il s'agit d'une erreur, ou si vous pouvez corriger le point ci-dessus, vous pouvez mettre à jour votre profil et vos documents dans Seller Central afin que nous réexaminions votre dossier.</p>
${cta(ACCENTS.seller_verification_rejected, '{SELLERCENTRAL_LOGIN_URL}', 'Mettre à jour ma candidature')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Des questions sur cette décision ? Contactez-nous à {SUPPORT_EMAIL}.</p>`),
      },
      it: {
        subject: 'Aggiornamento sulla tua candidatura come venditore {PLATFORM_NAME}',
        body: shell(ACCENTS.seller_verification_rejected, `
<p style="margin:0 0 16px;">Ciao {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Grazie per aver richiesto di vendere su {PLATFORM_NAME} con <strong>{STORE_NAME}</strong>. Dopo aver esaminato la tua richiesta, al momento non possiamo approvare il tuo account venditore.</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>Motivo:</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">Se ritieni che si tratti di un errore, o se puoi risolvere il problema sopra indicato, puoi aggiornare il tuo profilo e i documenti in Seller Central e rivaluteremo la tua richiesta.</p>
${cta(ACCENTS.seller_verification_rejected, '{SELLERCENTRAL_LOGIN_URL}', 'Aggiorna la mia candidatura')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Domande su questa decisione? Contattaci a {SUPPORT_EMAIL}.</p>`),
      },
      es: {
        subject: 'Actualización sobre tu solicitud de vendedor en {PLATFORM_NAME}',
        body: shell(ACCENTS.seller_verification_rejected, `
<p style="margin:0 0 16px;">Hola {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Gracias por solicitar vender en {PLATFORM_NAME} con <strong>{STORE_NAME}</strong>. Tras revisar tu solicitud, no podemos aprobar tu cuenta de vendedor en este momento.</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>Motivo:</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">Si crees que se trata de un error, o si puedes resolver lo indicado arriba, puedes actualizar tu perfil y documentos en Seller Central y volveremos a revisar tu solicitud.</p>
${cta(ACCENTS.seller_verification_rejected, '{SELLERCENTRAL_LOGIN_URL}', 'Actualizar mi solicitud')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">¿Dudas sobre esta decisión? Contáctanos en {SUPPORT_EMAIL}.</p>`),
      },
      de: {
        subject: 'Update zu Ihrer {PLATFORM_NAME} Verkäufer-Bewerbung',
        body: shell(ACCENTS.seller_verification_rejected, `
<p style="margin:0 0 16px;">Hallo {FIRST_NAME},</p>
<p style="margin:0 0 16px;">vielen Dank für Ihre Bewerbung als Verkäufer bei {PLATFORM_NAME} mit <strong>{STORE_NAME}</strong>. Nach Prüfung Ihrer Bewerbung können wir Ihr Verkäuferkonto derzeit leider nicht freischalten.</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>Grund:</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">Falls Sie diese Entscheidung für einen Fehler halten oder den genannten Punkt beheben können, können Sie Ihr Profil und Ihre Dokumente im Seller Central aktualisieren — wir prüfen Ihre Bewerbung dann erneut.</p>
${cta(ACCENTS.seller_verification_rejected, '{SELLERCENTRAL_LOGIN_URL}', 'Bewerbung aktualisieren')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Fragen zu dieser Entscheidung? Kontaktieren Sie uns unter {SUPPORT_EMAIL}.</p>`),
      },
    },
  },
  {
    trigger_key: 'seller_documents_required',
    name: 'Seller — additional documents required',
    audience: 'seller',
    content: {
      en: {
        subject: 'Action required: additional documents needed',
        body: shell(ACCENTS.seller_documents_required, `
<p style="margin:0 0 16px;">Hi {FIRST_NAME},</p>
<p style="margin:0 0 16px;">We're reviewing the verification documents for <strong>{STORE_NAME}</strong>, but we need a bit more information before we can continue.</p>
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#92400e;"><strong>What's needed:</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">Please upload the requested document(s) in Seller Central as soon as possible so we can continue the review without delay.</p>
${cta(ACCENTS.seller_documents_required, '{SELLERCENTRAL_LOGIN_URL}', 'Upload documents')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Not sure what's needed? Reach out to {SUPPORT_EMAIL} and we'll clarify.</p>`),
      },
      tr: {
        subject: 'İşlem Gerekiyor: Ek Evrak Talep Edildi',
        body: shell(ACCENTS.seller_documents_required, `
<p style="margin:0 0 16px;">Merhaba {FIRST_NAME},</p>
<p style="margin:0 0 16px;"><strong>{STORE_NAME}</strong> için doğrulama evraklarınızı inceliyoruz, ancak devam edebilmemiz için birkaç ek bilgiye daha ihtiyacımız var.</p>
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#92400e;"><strong>Gerekli olan:</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">İncelemenin gecikmemesi için lütfen talep edilen evrak(lar)ı en kısa sürede Seller Central üzerinden yükleyin.</p>
${cta(ACCENTS.seller_documents_required, '{SELLERCENTRAL_LOGIN_URL}', 'Evrak yükle')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Neyin gerektiğinden emin değil misiniz? {SUPPORT_EMAIL} adresinden bize ulaşın, açıklayalım.</p>`),
      },
      fr: {
        subject: 'Action requise : documents supplémentaires nécessaires',
        body: shell(ACCENTS.seller_documents_required, `
<p style="margin:0 0 16px;">Bonjour {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Nous examinons les documents de vérification de <strong>{STORE_NAME}</strong>, mais il nous manque quelques informations pour poursuivre.</p>
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#92400e;"><strong>Ce qu'il faut fournir :</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">Merci de téléverser le(s) document(s) demandé(s) dans Seller Central dès que possible afin que nous puissions poursuivre l'examen sans délai.</p>
${cta(ACCENTS.seller_documents_required, '{SELLERCENTRAL_LOGIN_URL}', 'Téléverser les documents')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Vous ne savez pas quoi fournir ? Écrivez-nous à {SUPPORT_EMAIL}.</p>`),
      },
      it: {
        subject: 'Azione richiesta: documenti aggiuntivi necessari',
        body: shell(ACCENTS.seller_documents_required, `
<p style="margin:0 0 16px;">Ciao {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Stiamo esaminando i documenti di verifica di <strong>{STORE_NAME}</strong>, ma ci serve qualche informazione in più prima di poter proseguire.</p>
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#92400e;"><strong>Cosa serve:</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">Ti chiediamo di caricare il/i documento/i richiesto/i in Seller Central il prima possibile, così da proseguire la revisione senza ritardi.</p>
${cta(ACCENTS.seller_documents_required, '{SELLERCENTRAL_LOGIN_URL}', 'Carica documenti')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Non sei sicuro di cosa serva? Scrivi a {SUPPORT_EMAIL} e ti aiuteremo.</p>`),
      },
      es: {
        subject: 'Acción requerida: se necesitan documentos adicionales',
        body: shell(ACCENTS.seller_documents_required, `
<p style="margin:0 0 16px;">Hola {FIRST_NAME},</p>
<p style="margin:0 0 16px;">Estamos revisando los documentos de verificación de <strong>{STORE_NAME}</strong>, pero necesitamos un poco más de información para continuar.</p>
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#92400e;"><strong>Qué necesitamos:</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">Por favor, sube el/los documento(s) solicitado(s) en Seller Central lo antes posible para poder continuar con la revisión sin demoras.</p>
${cta(ACCENTS.seller_documents_required, '{SELLERCENTRAL_LOGIN_URL}', 'Subir documentos')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">¿No estás seguro de qué necesitas? Escríbenos a {SUPPORT_EMAIL}.</p>`),
      },
      de: {
        subject: 'Handlungsbedarf: Weitere Dokumente erforderlich',
        body: shell(ACCENTS.seller_documents_required, `
<p style="margin:0 0 16px;">Hallo {FIRST_NAME},</p>
<p style="margin:0 0 16px;">wir prüfen aktuell die Verifizierungsdokumente für <strong>{STORE_NAME}</strong>, benötigen aber noch ein paar zusätzliche Informationen, um fortzufahren.</p>
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:13px;color:#92400e;"><strong>Was benötigt wird:</strong> {REJECTION_REASON}</p>
</div>
<p style="margin:0 0 16px;">Bitte laden Sie die angeforderten Dokumente so bald wie möglich im Seller Central hoch, damit wir die Prüfung ohne Verzögerung fortsetzen können.</p>
${cta(ACCENTS.seller_documents_required, '{SELLERCENTRAL_LOGIN_URL}', 'Dokumente hochladen')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Nicht sicher, was benötigt wird? Schreiben Sie an {SUPPORT_EMAIL}, wir klären das gerne.</p>`),
      },
    },
  },
]

async function seedSellerLifecycleFlows(client) {
  for (const flow of FLOWS) {
    try {
      const existing = await client.query(`SELECT id FROM admin_hub_flows WHERE trigger_key = $1 LIMIT 1`, [flow.trigger_key])
      let flowId = existing.rows[0]?.id
      if (!flowId) {
        const fr = await client.query(
          `INSERT INTO admin_hub_flows (name, trigger_key, status, audience) VALUES ($1, $2, 'active', $3) RETURNING id`,
          [flow.name, flow.trigger_key, flow.audience],
        )
        flowId = fr.rows[0].id
      }
      // Flow row may already exist (e.g. created blank via the UI) — only fill in content
      // if it has no steps yet, so a superuser's own edits are never overwritten.
      const steps = await client.query(`SELECT id FROM admin_hub_flow_steps WHERE flow_id = $1 LIMIT 1`, [flowId])
      if (steps.rows[0]) continue

      const de = flow.content.de
      await client.query(
        `INSERT INTO admin_hub_flow_steps (flow_id, step_order, step_type, email_subject, email_body, email_i18n)
         VALUES ($1, 0, 'send_email', $2, $3, $4::jsonb)`,
        [flowId, de.subject, de.body, JSON.stringify(flow.content)],
      )
    } catch (e) {
      console.warn('[seed-seller-lifecycle-flows]', flow.trigger_key, e?.message || e)
    }
  }
}

module.exports = { seedSellerLifecycleFlows }
