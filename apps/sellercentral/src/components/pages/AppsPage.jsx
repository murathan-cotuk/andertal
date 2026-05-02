"use client";

import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { Card, Button, Input } from "@andertal/ui";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 32px;
  color: #1f2937;
`;

const Section = styled(Card)`
  padding: 24px;
  margin-bottom: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const AppsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 24px;
`;

const AppCard = styled(Card)`
  padding: 24px;
  transition: transform 0.2s ease;
  position: relative;

  &:hover {
    transform: translateY(-4px);
  }
`;

const AppIcon = styled.div`
  font-size: 48px;
  color: #0ea5e9;
  margin-bottom: 16px;
`;

const AppTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
`;

const AppDescription = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 16px;
`;

const ManageButton = styled.button`
  padding: 8px 16px;
  background-color: #f3f4f6;
  color: #1f2937;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #e5e7eb;
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled(Card)`
  padding: 24px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
`;

// ── Marketing Accounts helpers ────────────────────────────────────────────────

const PLATFORMS = [
  {
    value: "meta",
    label: "Meta (Facebook / Instagram)",
    color: "#1877f2",
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
    color: "#4285f4",
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
    color: "#010101",
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
    color: "#fffc00",
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
      style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, outline: "none", boxSizing: "border-box" }}
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
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: isConnected && isActive ? "#22c55e" : "#d1d5db" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{platform.label}</span>
          {isConnected && isActive && (
            <span style={{ fontSize: 11, fontWeight: 600, background: "#dcfce7", color: "#16a34a", borderRadius: 20, padding: "2px 8px" }}>
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
            onClick={() => onSave(platform.value, creds, isActive)}
            disabled={saving}
            style={{ marginTop: 8, padding: "9px 20px", background: "#ff971c", color: "#fff", border: "2px solid #000", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", boxShadow: "0 2px 0 2px #000" }}
          >
            {saving ? "Speichere…" : "Speichern"}
          </button>
        </div>
      )}
    </div>
  );
}

function MarketingAccountsSection() {
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
        return exists
          ? prev.map((a) => (a.platform === platform ? d.account : a))
          : [...prev, d.account];
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
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          {err}
        </div>
      )}
      {savedPlatform && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
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

// ─────────────────────────────────────────────────────────────────────────────

export default function AppsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);

  useEffect(() => {
    setIsSuperuser(typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  const installedApps = [
    {
      id: "stripe",
      name: "Stripe",
      description: "Payment processing and subscription management",
      icon: "fab fa-stripe",
      connected: true,
    },
    {
      id: "analytics",
      name: "Google Analytics",
      description: "Track and analyze your store performance",
      icon: "fab fa-google",
      connected: true,
    },
  ];

  const availableApps = [
    {
      id: "mailchimp",
      name: "Mailchimp",
      description: "Email marketing and automation",
      icon: "fab fa-mailchimp",
    },
    {
      id: "zapier",
      name: "Zapier",
      description: "Automate workflows and connect apps",
      icon: "fas fa-plug",
    },
  ];

  const handleManageApp = (app) => {
    setSelectedApp(app);
    setShowManageModal(true);
  };

  return (
    <Container>
      <Title>Apps & Integrationen</Title>

      {isSuperuser && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "24px 20px", marginBottom: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>Marketing-Konten</h2>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>
              Verbinde Werbekonten, um Kampagnen automatisch auf diesen Plattformen zu schalten. Budgets werden gleichmäßig auf die ausgewählten Plattformen verteilt.
            </p>
          </div>
          <MarketingAccountsSection />
        </div>
      )}

      <Section>
        <Header>
          <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937" }}>Installed Apps</h2>
          <Button onClick={() => setShowAddModal(true)}>
            <i className="fas fa-plus" style={{ marginRight: "8px" }} />
            Add App
          </Button>
        </Header>

        {installedApps.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7280" }}>
            <i className="fas fa-th" style={{ fontSize: "48px", marginBottom: "16px", color: "#d1d5db" }} />
            <p>No apps installed yet</p>
          </div>
        ) : (
          <AppsGrid>
            {installedApps.map((app) => (
              <AppCard key={app.id}>
                <AppIcon>
                  <i className={app.icon} />
                </AppIcon>
                <AppTitle>{app.name}</AppTitle>
                <AppDescription>{app.description}</AppDescription>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: "600",
                      backgroundColor: "#d1fae5",
                      color: "#065f46",
                    }}
                  >
                    Connected
                  </span>
                  <ManageButton onClick={() => handleManageApp(app)}>Manage</ManageButton>
                </div>
              </AppCard>
            ))}
          </AppsGrid>
        )}
      </Section>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Available Apps
        </h2>
        <AppsGrid>
          {availableApps.map((app) => (
            <AppCard key={app.id}>
              <AppIcon>
                <i className={app.icon} />
              </AppIcon>
              <AppTitle>{app.name}</AppTitle>
              <AppDescription>{app.description}</AppDescription>
              <Button fullWidth>
                <i className="fas fa-download" style={{ marginRight: "8px" }} />
                Install
              </Button>
            </AppCard>
          ))}
        </AppsGrid>
      </Section>

      {showManageModal && selectedApp && (
        <Modal onClick={() => setShowManageModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#1f2937" }}>Manage {selectedApp.name}</h2>
              <button
                onClick={() => setShowManageModal(false)}
                style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#6b7280" }}
              >
                ×
              </button>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <Input
                label="API Key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
              />
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <Button onClick={() => setShowManageModal(false)}>Save</Button>
              <Button variant="outline" onClick={() => setShowManageModal(false)}>
                Cancel
              </Button>
            </div>
          </ModalContent>
        </Modal>
      )}

      {showAddModal && (
        <Modal onClick={() => setShowAddModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#1f2937" }}>Add New App</h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#6b7280" }}
              >
                ×
              </button>
            </div>
            <p style={{ color: "#6b7280", marginBottom: "24px" }}>
              Browse available apps from the list below or search for a specific integration
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <Button onClick={() => setShowAddModal(false)}>Browse Apps</Button>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
            </div>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
}
