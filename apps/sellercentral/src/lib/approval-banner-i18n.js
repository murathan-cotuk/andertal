import { lt } from "@/lib/locale-text";

export function getApprovalBannerCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    completeVerification: t(
      "Go to verification steps to start selling",
      "Satışa başlayabilmek için doğrulama adımlarına geçin",
      "Accédez aux étapes de vérification pour commencer à vendre",
      "Vaya a los pasos de verificación para empezar a vender",
      "Vai ai passaggi di verifica per iniziare a vendere",
      "Gehe zu den Verifizierungsschritten, um mit dem Verkauf zu starten",
    ),
    goVerification: t("Go to verification", "Doğrulamaya git", "Aller à la vérification", "Ir a verificación", "Vai alla verifica", "Zur Verifizierung"),
    suspended: t(
      "Your account is suspended. Please contact support.",
      "Hesabınız askıya alındı. Lütfen destek ile iletişime geçin.",
      "Votre compte est suspendu. Veuillez contacter le support.",
      "Su cuenta está suspendida. Contacte con soporte.",
      "Il tuo account è sospeso. Contatta il supporto.",
      "Ihr Konto wurde gesperrt. Bitte kontaktieren Sie den Support.",
    ),
    rejected: t(
      "Your account was rejected. Please review your documents and contact support.",
      "Hesabınız reddedildi. Lütfen evrakları kontrol edip destek ile iletişime geçin.",
      "Votre compte a été refusé. Veuillez vérifier vos documents et contacter le support.",
      "Su cuenta fue rechazada. Revise sus documentos y contacte con soporte.",
      "Il tuo account è stato rifiutato. Controlla i documenti e contatta il supporto.",
      "Ihr Konto wurde abgelehnt. Bitte prüfen Sie Ihre Unterlagen und kontaktieren Sie den Support.",
    ),
    docsSubmitted: t(
      "Documents submitted. Your account is under review.",
      "Evraklar gönderildi. Hesabınız inceleme altında.",
      "Documents soumis. Votre compte est en cours d'examen.",
      "Documentos enviados. Su cuenta está en revisión.",
      "Documenti inviati. Il tuo account è in revisione.",
      "Unterlagen eingereicht. Ihr Konto wird geprüft.",
    ),
    pending: t(
      "Your account is pending approval. You will be notified after review.",
      "Hesabınız onay bekliyor. İnceleme sonrası bilgilendirileceksiniz.",
      "Votre compte est en attente d'approbation. Vous serez informé après examen.",
      "Su cuenta está pendiente de aprobación. Se le notificará tras la revisión.",
      "Il tuo account è in attesa di approvazione. Riceverai una notifica dopo la revisione.",
      "Ihr Konto wartet auf Freigabe. Sie werden nach der Prüfung benachrichtigt.",
    ),
    accountStatus: (status) =>
      t(
        `Account status: ${status}`,
        `Hesap durumu: ${status}`,
        `Statut du compte : ${status}`,
        `Estado de la cuenta: ${status}`,
        `Stato account: ${status}`,
        `Kontostatus: ${status}`,
      ),
  };
}
