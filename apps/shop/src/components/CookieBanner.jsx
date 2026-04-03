"use client";

import { useState, useEffect } from "react";
import { useLocale } from "next-intl";

const STORAGE_KEY = "belucha_cookie_consent";

const TEXTS = {
  de: {
    title: "Wir verwenden Cookies",
    body: "Wir setzen Cookies ein, um dein Erlebnis zu verbessern, den Traffic zu analysieren und personalisierte Inhalte anzuzeigen. Einige Cookies sind für den Betrieb der Website notwendig.",
    acceptAll: "Alle akzeptieren",
    necessary: "Nur notwendige",
    manage: "Einstellungen",
    save: "Auswahl speichern",
    categories: {
      necessary: { label: "Notwendig", desc: "Unbedingt erforderlich für die Grundfunktionen der Website.", fixed: true },
      analytics: { label: "Analyse", desc: "Helfen uns, die Nutzung der Website zu verstehen (z. B. Google Analytics)." },
      marketing: { label: "Marketing", desc: "Werden für personalisierte Werbung und Conversion-Tracking verwendet." },
    },
    privacyLink: "Datenschutzerklärung",
  },
  tr: {
    title: "Çerez kullanımı",
    body: "Deneyimi geliştirmek, trafiği analiz etmek ve kişiselleştirilmiş içerik göstermek için çerezler kullanıyoruz. Bazı çerezler sitenin çalışması için zorunludur.",
    acceptAll: "Tümünü kabul et",
    necessary: "Sadece gerekli",
    manage: "Ayarlar",
    save: "Seçimi kaydet",
    categories: {
      necessary: { label: "Gerekli", desc: "Sitenin temel işlevleri için zorunludur.", fixed: true },
      analytics: { label: "Analitik", desc: "Site kullanımını anlamamıza yardımcı olur." },
      marketing: { label: "Pazarlama", desc: "Kişiselleştirilmiş reklam ve dönüşüm ölçümü için kullanılır." },
    },
    privacyLink: "Gizlilik politikası",
  },
  en: {
    title: "We use cookies",
    body: "We use cookies to improve your experience, analyze traffic, and show personalized content. Some cookies are required for the website to function.",
    acceptAll: "Accept all",
    necessary: "Necessary only",
    manage: "Manage",
    save: "Save preferences",
    categories: {
      necessary: { label: "Necessary", desc: "Required for the basic functions of the website.", fixed: true },
      analytics: { label: "Analytics", desc: "Help us understand how the website is used (e.g. Google Analytics)." },
      marketing: { label: "Marketing", desc: "Used for personalized advertising and conversion tracking." },
    },
    privacyLink: "Privacy policy",
  },
};

function getTexts(locale) {
  return TEXTS[locale] || TEXTS["de"];
}

// Dispatch a custom event so analytics/tracking can listen
function dispatchConsentEvent(consent) {
  if (typeof window === "undefined") return;
  window.__cookieConsent = consent;
  window.dispatchEvent(new CustomEvent("cookieConsent", { detail: consent }));
}

export default function CookieBanner() {
  const locale = useLocale();
  const t = getTexts(locale);

  const [visible, setVisible] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [prefs, setPrefs] = useState({ analytics: false, marketing: false });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        dispatchConsentEvent(parsed);
        setVisible(false);
      } else {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const save = (consent) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(consent)); } catch {}
    dispatchConsentEvent(consent);
    setVisible(false);
    setShowManage(false);
  };

  const acceptAll = () => save({ necessary: true, analytics: true, marketing: true });
  const acceptNecessary = () => save({ necessary: true, analytics: false, marketing: false });
  const savePrefs = () => save({ necessary: true, ...prefs });

  if (!visible) return null;

  const btnBase = {
    padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 14,
    cursor: "pointer", border: "2px solid #000", transition: "opacity .15s",
  };

  return (
    <div
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
        background: "#fff", borderTop: "2px solid #000",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.13)",
        fontFamily: "inherit",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
    >
      {!showManage ? (
        /* ── Compact bar ─────────────────────────────── */
        <div style={{
          maxWidth: 1200, margin: "0 auto", padding: "18px 24px",
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <span style={{ fontWeight: 700, fontSize: 15, marginRight: 8 }}>{t.title}</span>
            <span style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.5 }}>{t.body}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
            <button
              onClick={() => setShowManage(true)}
              style={{ ...btnBase, background: "#fff", color: "#374151" }}
            >
              {t.manage}
            </button>
            <button
              onClick={acceptNecessary}
              style={{ ...btnBase, background: "#f3f4f6", color: "#374151" }}
            >
              {t.necessary}
            </button>
            <button
              onClick={acceptAll}
              style={{ ...btnBase, background: "#ff971c", color: "#fff", border: "2px solid #000" }}
            >
              {t.acceptAll}
            </button>
          </div>
        </div>
      ) : (
        /* ── Manage panel ────────────────────────────── */
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 24px 20px" }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 16 }}>{t.manage}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
            {Object.entries(t.categories).map(([key, cat]) => (
              <label
                key={key}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  padding: "12px 14px", borderRadius: 8,
                  background: "#f9fafb", border: "1px solid #e5e7eb",
                  cursor: cat.fixed ? "default" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={cat.fixed || !!prefs[key]}
                  disabled={!!cat.fixed}
                  onChange={(e) => !cat.fixed && setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                  style={{ marginTop: 2, flexShrink: 0, accentColor: "#ff971c", width: 16, height: 16 }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                    {cat.label}{cat.fixed && <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400, marginLeft: 6 }}>Immer aktiv</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{cat.desc}</div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => setShowManage(false)}
              style={{ ...btnBase, background: "#f3f4f6", color: "#374151", fontSize: 13 }}
            >
              ← Zurück
            </button>
            <button
              onClick={savePrefs}
              style={{ ...btnBase, background: "#111827", color: "#fff", fontSize: 13 }}
            >
              {t.save}
            </button>
            <button
              onClick={acceptAll}
              style={{ ...btnBase, background: "#ff971c", color: "#fff", fontSize: 13 }}
            >
              {t.acceptAll}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
