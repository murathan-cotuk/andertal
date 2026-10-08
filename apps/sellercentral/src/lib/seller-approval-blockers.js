import { lt } from "@/lib/locale-text";

/** Labels for backend seller-approval-readiness.js codes (422 approval_blocked). */
const LABELS = {
  agreement_not_accepted: (l) => lt(l, "Seller agreement not accepted", "Satıcı sözleşmesi kabul edilmemiş", "Contrat vendeur non accepté", "Contrato de vendedor no aceptado", "Contratto venditore non accettato", "Verkäufervertrag nicht akzeptiert"),
  legal_name_missing: (l) => lt(l, "Company / legal name missing", "Şirket / yasal ad eksik", "Raison sociale manquante", "Falta la razón social", "Ragione sociale mancante", "Firmen- bzw. rechtlicher Name fehlt"),
  business_address_missing: (l) => lt(l, "Business address incomplete", "İşletme adresi eksik", "Adresse professionnelle incomplète", "Dirección comercial incompleta", "Indirizzo aziendale incompleto", "Geschäftsadresse unvollständig"),
  tax_number_missing: (l) => lt(l, "VAT ID or tax number missing", "KDV no veya vergi no eksik", "N° TVA ou n° fiscal manquant", "Falta NIF-IVA o número fiscal", "Partita IVA o codice fiscale mancante", "USt-IdNr. oder Steuernummer fehlt"),
  lucid_number_missing: (l) => lt(l, "LUCID registration number missing (VerpackG)", "LUCID kayıt numarası eksik (VerpackG)", "N° d'enregistrement LUCID manquant (VerpackG)", "Falta el número de registro LUCID (VerpackG)", "Numero di registrazione LUCID mancante (VerpackG)", "LUCID-Registrierungsnummer fehlt (VerpackG)"),
  payout_account_missing: (l) => lt(l, "No payout account yet", "Ödeme hesabı henüz yok", "Pas encore de compte de versement", "Aún no hay cuenta de pago", "Nessun conto di pagamento", "Noch kein Auszahlungskonto"),
  dac7_birth_date_missing: (l) => lt(l, "Date of birth missing (DAC7)", "Doğum tarihi eksik (DAC7)", "Date de naissance manquante (DAC7)", "Falta la fecha de nacimiento (DAC7)", "Data di nascita mancante (DAC7)", "Geburtsdatum fehlt (DAC7)"),
  vat_id_not_vies_valid: (l) => lt(l, "VAT ID not confirmed by VIES", "KDV no VIES ile doğrulanmadı", "N° TVA non confirmé par VIES", "NIF-IVA no confirmado por VIES", "Partita IVA non confermata da VIES", "USt-IdNr. nicht per VIES bestätigt"),
};

export function approvalBlockerLabel(locale, code) {
  return (LABELS[code] || (() => code))(locale);
}

/** User-facing text for a failed approval; null when the error is not an approval block. */
export function approvalBlockedText(err, locale) {
  if (err?.code !== "approval_blocked") return null;
  const blockers = Array.isArray(err?.body?.blockers) ? err.body.blockers : [];
  const head = lt(locale, "Cannot approve — missing:", "Onaylanamaz — eksik:", "Approbation impossible — manquant :", "No se puede aprobar; falta:", "Impossibile approvare — mancante:", "Freigabe nicht möglich — es fehlt:");
  return `${head} ${blockers.map((c) => approvalBlockerLabel(locale, c)).join(", ")}`;
}
