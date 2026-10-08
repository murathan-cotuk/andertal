"use client";

import { Tooltip } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { lt } from "@/lib/locale-text";

/** Konsept s34: DE / EN / TR / FR / ES / IT pills with a translation-status dot per language. */
const LANGS = ["de", "en", "tr", "fr", "es", "it"];
const LOCALE_PREFIX_RE = /^\/(en|de|tr|fr|it|es)(?=\/|$)/i;

/** "complete" = title + description present and neither machine-filled; otherwise "missing". */
export function translationStatus(product, lang) {
  const meta = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const tr = (meta.translations || {})[lang] || {};
  const title = String(tr.title ?? (lang === "de" ? product?.title : "") ?? "").trim();
  const description = String(tr.description ?? (lang === "de" ? product?.description : "") ?? "").replace(/<[^>]*>/g, "").trim();
  const auto = tr._auto && typeof tr._auto === "object" ? tr._auto : {};
  if (!title || !description) return "missing";
  if (auto.title || auto.description) return "auto";
  return "complete";
}

export default function EditLanguagePills({ product, locked = false }) {
  const locale = useLocale();
  const router = useRouter();
  const lockedHint = lt(locale,
    "Save first — switching language reloads the page.",
    "Önce kaydedin — dil değişince sayfa yeniden yüklenir.",
    "Enregistrez d'abord — changer de langue recharge la page.",
    "Guarda primero: cambiar de idioma recarga la página.",
    "Salva prima: cambiare lingua ricarica la pagina.",
    "Erst speichern — der Sprachwechsel lädt die Seite neu.");
  const statusText = {
    complete: lt(locale, "Translated", "Çevrildi", "Traduit", "Traducido", "Tradotto", "Übersetzt"),
    auto: lt(locale, "Auto-translated — please review", "Otomatik çeviri — kontrol edin", "Traduction automatique — à vérifier", "Traducción automática: revísala", "Traduzione automatica — da verificare", "Automatisch übersetzt — bitte prüfen"),
    missing: lt(locale, "Title or description missing", "Başlık veya açıklama eksik", "Titre ou description manquant", "Falta título o descripción", "Titolo o descrizione mancante", "Titel oder Beschreibung fehlt"),
  };

  const go = (lang) => {
    if (locked || lang === locale || typeof window === "undefined") return;
    const path = window.location.pathname.replace(LOCALE_PREFIX_RE, "") || "/";
    router.replace(path, { locale: lang });
  };

  return (
    <div className="sc-lang-pills" role="tablist" aria-label={lt(locale, "Editing language", "Düzenleme dili", "Langue d'édition", "Idioma de edición", "Lingua di modifica", "Bearbeitungssprache")}>
      {LANGS.map((lang) => {
        const status = translationStatus(product, lang);
        const active = lang === locale;
        const pill = (
          <button
            key={lang}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={!active && locked}
            className={`sc-lang-pill${active ? " is-active" : ""}`}
            onClick={() => go(lang)}
          >
            <span className={`sc-lang-dot is-${status === "complete" ? "ok" : "warn"}`} aria-hidden />
            {lang.toUpperCase()}
          </button>
        );
        return (
          <Tooltip key={lang} content={!active && locked ? lockedHint : statusText[status]}>
            {pill}
          </Tooltip>
        );
      })}
    </div>
  );
}
