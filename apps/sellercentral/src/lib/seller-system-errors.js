/** Generic message shown to sellers for platform/system failures (not configuration details). */
export function sellerTechnicalMessage(locale = "de") {
  const loc = String(locale).slice(0, 2).toLowerCase();
  if (loc === "tr") {
    return "Teknik bir sorun nedeniyle işlem şu an tamamlanamıyor. Ekibimiz bilgilendirildi — en kısa sürede ilgileneceğiz.";
  }
  if (loc === "en") {
    return "This action could not be completed due to a technical issue. Our team has been notified and will resolve it shortly.";
  }
  return "Aus technischen Gründen konnte die Aktion nicht abgeschlossen werden. Unser Team wurde informiert und kümmert sich darum.";
}

export function readSellerIsSuperuser() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("sellerIsSuperuser") === "true";
}

const TECHNICAL_DETAIL_RE = /sendcloud|stripe|api.?key|nicht konfiguriert|not configured|versandoptionen gefunden|shipping.?option/i;

/** Show API detail to superusers only; sellers always get the generic technical message. */
export function resolveSellerFacingError(err, locale, isSuperuser) {
  const msg = err?.message || "";
  if (isSuperuser && msg) return msg;
  if (!isSuperuser && TECHNICAL_DETAIL_RE.test(msg)) return sellerTechnicalMessage(locale);
  return msg || sellerTechnicalMessage(locale);
}
