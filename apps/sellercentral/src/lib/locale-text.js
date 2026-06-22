"use client";

import { useCallback } from "react";
import { useLocale } from "next-intl";

/** Pick localized UI string: en, tr, fr, es, it, de (default). */
export function lt(locale, en, tr, fr, es, it, de) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  if (loc === "en") return en;
  if (loc === "tr") return tr;
  if (loc === "fr") return fr;
  if (loc === "es") return es;
  if (loc === "it") return it;
  return de;
}

export function useLt() {
  const locale = useLocale();
  return useCallback(
    (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de),
    [locale],
  );
}

export function dateLocaleFor(locale) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  if (loc === "en") return "en-GB";
  if (loc === "tr") return "tr-TR";
  if (loc === "fr") return "fr-FR";
  if (loc === "es") return "es-ES";
  if (loc === "it") return "it-IT";
  return "de-DE";
}

export function fmtMoney(cents, locale) {
  return ((cents || 0) / 100).toLocaleString(dateLocaleFor(locale), { style: "currency", currency: "EUR" });
}

export function fmtDateShort(d, locale) {
  return d
    ? new Date(d).toLocaleDateString(dateLocaleFor(locale), { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";
}

export function fmtDateTimeShort(d, locale) {
  return d
    ? new Date(d).toLocaleString(dateLocaleFor(locale), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}
