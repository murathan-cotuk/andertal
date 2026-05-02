"use client";

import React, { useState, useEffect } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const PLATFORMS = [
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
      { key: "customer_id", label: "Customer ID", placeholder: "123-456-7890" },
      { key: "developer_token", label: "Developer Token", type: "password", placeholder: "DevToken..." },
      { key: "oauth_client_id", label: "OAuth Client ID", placeholder: "123.apps.googleusercontent.com" },
      { key: "oauth_client_secret", label: "OAuth Client Secret", type: "password", placeholder: "GOCSPX-..." },
      { key: "refresh_token", label: "Refresh Token", type: "password", placeholder: "1//0g..." },
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

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{label}</label>
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

function PlatformPanel({ platform, accountData, onSave, saving }) {
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
              Bağlı
            </span>
          )}
        </div>
        <span style={{ fontSize: 18, color: "#6b7280" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "16px 16px 20px", borderTop: "1px solid #f3f4f6", background: "#fafafa" }}>
          {platform.fields.map((f) => (
            <Field key={f.key} label={f.label}>
              <MInput
                type={f.type || "text"}
                value={creds[f.key] || ""}
                onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder={f.type === "password" ? "Leer lassen um beizubehalten" : f.placeholder}
              />
            </Field>
          ))}
          <Field label="">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#374151" }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Hesap aktif
            </label>
          </Field>
          <button
            type="button"
            onClick={() => onSave(platform.value, creds, isActive)}
            disabled={saving}
            style={{
              marginTop: 8,
              padding: "9px 20px",
              background: "#ff971c",
              color: "#fff",
              border: "2px solid #000",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              boxShadow: "0 2px 0 2px #000",
            }}
          >
            {saving ? "Speichere…" : "Speichern"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Werbekonten (Meta, Google Ads, TikTok, Snapchat) — nur Superuser */
export default function MarketingAccountsSection() {
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
      setErr(e?.message || "Fehler beim Speichern");
    }
    setSavingPlatform(null);
  };

  if (loading) return <div style={{ padding: 20, color: "#9ca3af", fontSize: 13 }}>Laden…</div>;

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
          {PLATFORMS.find((p) => p.value === savedPlatform)?.label} gespeichert ✓
        </div>
      )}
      {PLATFORMS.map((platform) => (
        <PlatformPanel
          key={platform.value}
          platform={platform}
          accountData={accounts.find((a) => a.platform === platform.value)}
          onSave={handleSave}
          saving={savingPlatform === platform.value}
        />
      ))}
      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
        Die gespeicherten Zugangsdaten werden für die automatische Kampagnenerstellung in den verbundenen Werbenetzwerken verwendet.
      </div>
    </div>
  );
}
