"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@shopify/polaris";
import { useLt } from "@/lib/use-locale-text";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function getPlatforms(lt) {
  return [
    {
      value: "meta",
      label: "Meta (Facebook / Instagram)",
      fields: [
        { key: "ad_account_id", label: "Ad Account ID", placeholder: "act_123456789" },
        { key: "pixel_id", label: "Pixel ID", placeholder: "123456789" },
        { key: "access_token", label: "Access Token", type: "password", placeholder: "EAABsbCS..." },
        { key: "app_id", label: "App ID", placeholder: "123456789" },
        { key: "app_secret", label: "App Secret", type: "password", placeholder: "abc123..." },
      ],
    },
    {
      value: "google_ads",
      label: "Google Ads",
      fields: [
        {
          key: "customer_id",
          label: lt("Customer ID (Ads account)", "Müşteri ID (Ads hesabı)", "ID client (compte Ads)", "ID de cliente (cuenta Ads)", "ID cliente (account Ads)", "Customer ID (Ads-Konto)"),
          placeholder: "123-456-7890",
          helpText: lt(
            "Your Google Ads customer number (10 digits, e.g. 123-456-7890).",
            "Google Ads müşteri numaranız (10 haneli, örn. 123-456-7890).",
            "Votre numéro client Google Ads (10 chiffres, ex. 123-456-7890).",
            "Su número de cliente de Google Ads (10 dígitos, p. ej. 123-456-7890).",
            "Il numero cliente Google Ads (10 cifre, es. 123-456-7890).",
            "Ihre Google Ads Kundennummer (10-stellig, z.B. 123-456-7890).",
          ),
        },
        {
          key: "login_customer_id",
          label: lt("Manager Account ID (MCC)", "Yönetici hesap ID (MCC)", "ID compte gestionnaire (MCC)", "ID de cuenta administrador (MCC)", "ID account manager (MCC)", "Manager Account ID (MCC)"),
          placeholder: "987-654-3210",
          helpText: lt(
            "Only fill in if you use a manager account (MCC). Leave empty if you work directly with the Ads account.",
            "Yönetici hesabı (MCC) kullanıyorsanız doldurun. Doğrudan Ads hesabıyla çalışıyorsanız boş bırakın.",
            "Remplir uniquement si vous utilisez un compte gestionnaire (MCC). Laisser vide si vous travaillez directement avec le compte Ads.",
            "Complete solo si usa una cuenta de administrador (MCC). Déjelo vacío si trabaja directamente con la cuenta Ads.",
            "Compilare solo se usi un account manager (MCC). Lasciare vuoto se lavori direttamente con l'account Ads.",
            "Nur ausfüllen wenn Sie ein Manager-Konto (MCC) verwenden. Leer lassen wenn Sie direkt mit dem Ads-Konto arbeiten.",
          ),
        },
        {
          key: "developer_token",
          label: "Developer Token",
          type: "password",
          placeholder: "DevToken...",
          helpText: lt(
            "Found under: Google Ads → Tools & Settings → API Center. Basic Access required for production.",
            "Google Ads → Araçlar ve Ayarlar → API Merkezi altında bulunur. Üretim için Basic Access gerekir.",
            "Sous : Google Ads → Outils et paramètres → Centre API. Accès Basic requis en production.",
            "En: Google Ads → Herramientas y configuración → Centro de API. Se requiere acceso Basic en producción.",
            "In: Google Ads → Strumenti e impostazioni → Centro API. Basic Access richiesto in produzione.",
            "Zu finden unter: Google Ads → Tools & Einstellungen → API-Center. Für den Produktiveinsatz benötigen Sie Basic Access.",
          ),
        },
        {
          key: "oauth_client_id",
          label: "OAuth Client ID",
          placeholder: "123.apps.googleusercontent.com",
          helpText: lt(
            "From Google Cloud Console (APIs & Services → Credentials).",
            "Google Cloud Console'dan (API'ler ve Hizmetler → Kimlik bilgileri).",
            "Depuis Google Cloud Console (API et services → Identifiants).",
            "Desde Google Cloud Console (APIs y servicios → Credenciales).",
            "Da Google Cloud Console (API e servizi → Credenziali).",
            "Aus der Google Cloud Console (APIs & Dienste → Anmeldedaten).",
          ),
        },
        { key: "oauth_client_secret", label: "OAuth Client Secret", type: "password", placeholder: "GOCSPX-..." },
        {
          key: "refresh_token",
          label: "Refresh Token",
          type: "password",
          placeholder: "1//0g...",
          helpText: lt(
            "Generate this token with the OAuth Playground (oauth2.googleapis.com/playground) or a local OAuth flow.",
            "OAuth Playground (oauth2.googleapis.com/playground) veya yerel OAuth akışı ile oluşturun.",
            "Générez ce jeton avec OAuth Playground ou un flux OAuth local.",
            "Genere este token con OAuth Playground o un flujo OAuth local.",
            "Genera questo token con OAuth Playground o un flusso OAuth locale.",
            "Generieren Sie diesen Token mit dem OAuth Playground oder einem lokalen OAuth-Flow mit Ihren Zugangsdaten.",
          ),
        },
      ],
    },
    {
      value: "tiktok",
      label: "TikTok Ads",
      fields: [
        { key: "advertiser_id", label: "Advertiser ID", placeholder: "123456789" },
        { key: "pixel_id", label: "Pixel ID", placeholder: "C3MXXXX..." },
        { key: "access_token", label: "Access Token", type: "password", placeholder: "TikTok Access Token" },
        { key: "app_id", label: "App ID", placeholder: "123456789" },
      ],
    },
    {
      value: "snapchat",
      label: "Snapchat Ads",
      fields: [
        { key: "ad_account_id", label: "Ad Account ID", placeholder: "12345678-1234-..." },
        { key: "pixel_id", label: "Snap Pixel ID", placeholder: "12345678-1234-..." },
        { key: "client_id", label: "OAuth Client ID", placeholder: "client_id..." },
        { key: "client_secret", label: "OAuth Client Secret", type: "password", placeholder: "client_secret..." },
      ],
    },
  ];
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label ? (
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{label}</label>
      ) : null}
      {children}
      {hint && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function MInput({ ...props }) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        padding: "8px 10px",
        border: "1px solid #e5e7eb",
        borderRadius: 7,
        fontSize: 13,
        outline: "none",
        boxSizing: "border-box",
      }}
    />
  );
}

function PlatformPanel({ platform, accountData, onSave, saving, lt }) {
  const [creds, setCreds] = useState({});
  const [isActive, setIsActive] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (accountData) {
      setCreds(accountData.credentials || {});
      setIsActive(accountData.is_active !== false);
    }
  }, [accountData]);

  const isConnected = accountData && Object.keys(accountData.credentials || {}).some((k) => accountData.credentials[k]);
  const keepPasswordPlaceholder = lt("Leave blank to keep current value", "Mevcut değeri korumak için boş bırakın", "Laisser vide pour conserver la valeur actuelle", "Dejar en blanco para mantener el valor actual", "Lasciare vuoto per mantenere il valore attuale", "Leer lassen um beizubehalten");

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          background: "#fff",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: isConnected && isActive ? "#22c55e" : "#d1d5db",
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{platform.label}</span>
          {isConnected && isActive && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                background: "#dcfce7",
                color: "#16a34a",
                borderRadius: 20,
                padding: "2px 8px",
              }}
            >
              {lt("Connected", "Bağlı", "Connecté", "Conectado", "Connesso", "Verbunden")}
            </span>
          )}
        </div>
        <span style={{ fontSize: 18, color: "#6b7280" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "16px 16px 20px", borderTop: "1px solid #f3f4f6", background: "#fafafa" }}>
          {platform.fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.helpText}>
              <MInput
                type={f.type || "text"}
                value={creds[f.key] || ""}
                onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder={f.type === "password" ? keepPasswordPlaceholder : f.placeholder}
              />
            </Field>
          ))}
          <Field label="">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#374151" }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              {lt("Account active", "Hesap aktif", "Compte actif", "Cuenta activa", "Account attivo", "Konto aktiv")}
            </label>
          </Field>
          <div style={{ marginTop: 8 }}>
            <Button
              variant="primary"
              onClick={() => onSave(platform.value, creds, isActive)}
              loading={saving}
            >
              {lt("Save", "Kaydet", "Enregistrer", "Guardar", "Salva", "Speichern")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Advertising accounts (Meta, Google Ads, TikTok, Snapchat) — superuser only */
export default function MarketingAccountsSection({ hideFooterHint = false }) {
  const lt = useLt();
  const platforms = useMemo(() => getPlatforms(lt), [lt]);

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingPlatform, setSavingPlatform] = useState(null);
  const [savedPlatform, setSavedPlatform] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    getMedusaAdminClient()
      .getMarketingAccounts()
      .then((d) => setAccounts(d?.accounts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (platform, credentials, is_active) => {
    setSavingPlatform(platform);
    setErr("");
    try {
      const d = await getMedusaAdminClient().updateMarketingAccount(platform, { credentials, is_active });
      setAccounts((prev) => {
        const exists = prev.find((a) => a.platform === platform);
        return exists ? prev.map((a) => (a.platform === platform ? d.account : a)) : [...prev, d.account];
      });
      setSavedPlatform(platform);
      setTimeout(() => setSavedPlatform(null), 2500);
    } catch (e) {
      setErr(e?.message || lt("Error saving", "Kaydetme hatası", "Erreur d'enregistrement", "Error al guardar", "Errore di salvataggio", "Fehler beim Speichern"));
    }
    setSavingPlatform(null);
  };

  if (loading) {
    return (
      <div style={{ padding: 20, color: "#9ca3af", fontSize: 13 }}>
        {lt("Loading…", "Yükleniyor…", "Chargement…", "Cargando…", "Caricamento…", "Laden…")}
      </div>
    );
  }

  return (
    <div>
      {err && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#dc2626",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {err}
        </div>
      )}
      {savedPlatform && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#15803d",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {platforms.find((p) => p.value === savedPlatform)?.label} {lt("saved ✓", "kaydedildi ✓", "enregistré ✓", "guardado ✓", "salvato ✓", "gespeichert ✓")}
        </div>
      )}
      {platforms.map((platform) => (
        <PlatformPanel
          key={platform.value}
          platform={platform}
          accountData={accounts.find((a) => a.platform === platform.value)}
          onSave={handleSave}
          saving={savingPlatform === platform.value}
          lt={lt}
        />
      ))}
      {!hideFooterHint && (
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
          {lt(
            "Saved credentials are used for automatic campaign creation in connected ad networks.",
            "Kayıtlı kimlik bilgileri bağlı reklam ağlarında otomatik kampanya oluşturma için kullanılır.",
            "Les identifiants enregistrés servent à la création automatique de campagnes dans les réseaux publicitaires connectés.",
            "Las credenciales guardadas se usan para la creación automática de campañas en redes publicitarias conectadas.",
            "Le credenziali salvate vengono usate per la creazione automatica di campagne nelle reti pubblicitarie collegate.",
            "Die gespeicherten Zugangsdaten werden für die automatische Kampagnenerstellung in den verbundenen Werbenetzwerken verwendet.",
          )}
        </div>
      )}
    </div>
  );
}
