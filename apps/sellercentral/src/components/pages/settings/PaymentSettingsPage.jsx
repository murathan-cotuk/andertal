"use client";

import React, { useEffect, useState } from "react";
import {
  Banner, BlockStack, Box, Button, Card,
  InlineStack, Text, TextField,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

// ── IBAN validator (basic — checks format, not country-specific length) ────────
function validateIban(raw) {
  const v = raw.replace(/\s/g, "").toUpperCase();
  if (!v) return { ok: false, error: "IBAN darf nicht leer sein." };
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,}$/.test(v))
    return { ok: false, error: "Ungültiges IBAN-Format (z.B. DE89 3704 0044 0532 0130 00)." };
  if (v.length < 15 || v.length > 34)
    return { ok: false, error: "IBAN-Länge ungültig." };
  return { ok: true, error: null };
}

function maskIban(iban) {
  if (!iban) return "";
  const v = iban.replace(/\s/g, "").toUpperCase();
  if (v.length < 6) return v;
  return v.slice(0, 4) + " •••• •••• " + v.slice(-4);
}

function formatIbanDisplay(raw) {
  const v = raw.replace(/\s/g, "").toUpperCase();
  return v.match(/.{1,4}/g)?.join(" ") || v;
}

// ── Payout info card ─────────────────────────────────────────────────────────
function PayoutInfoBanner({ commissionRate }) {
  const sellerPct = Math.round((1 - (commissionRate ?? 0.12)) * 100);
  const platformPct = 100 - sellerPct;
  return (
    <Box
      background="bg-surface-secondary"
      borderRadius="300"
      padding="400"
    >
      <BlockStack gap="300">
        <InlineStack gap="200" blockAlign="center">
          <span style={{ fontSize: 20 }}>💳</span>
          <Text as="p" variant="bodyMd" fontWeight="semibold">Wie Auszahlungen funktionieren</Text>
        </InlineStack>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { step: "1", label: "Kunde kauft", desc: "Zahlung geht direkt an die Plattform (Stripe)" },
            { step: "2", label: "Abrechnung", desc: `${sellerPct}% deines Umsatzes wird berechnet — ${platformPct}% Plattformgebühr` },
            { step: "3", label: "Banküberweisung", desc: "Betrag wird an deine IBAN überwiesen" },
          ].map(({ step, label, desc }) => (
            <div
              key={step}
              style={{
                background: "#fff",
                borderRadius: 10,
                padding: "14px 16px",
                border: "1px solid #e5e7eb",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 24, height: 24, borderRadius: "50%", background: "#111827",
                  color: "#fff", fontSize: 12, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>{step}</span>
                <Text as="span" variant="bodySm" fontWeight="semibold">{label}</Text>
              </div>
              <Text as="p" variant="bodySm" tone="subdued">{desc}</Text>
            </div>
          ))}
        </div>
        <Text as="p" variant="bodySm" tone="subdued">
          Auszahlungen erfolgen manuell durch die Plattform. Du wirst per E-Mail benachrichtigt, wenn eine Überweisung eingeleitet wird.
        </Text>
      </BlockStack>
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PaymentSettingsPage() {
  const client = getMedusaAdminClient();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [editing, setEditing]   = useState(false);

  const [savedIban, setSavedIban]         = useState("");
  const [savedHolder, setSavedHolder]     = useState("");
  const [savedBic, setSavedBic]           = useState("");
  const [savedBankName, setSavedBankName] = useState("");
  const [commissionRate, setCommissionRate] = useState(0.12);

  const [iban, setIban]           = useState("");
  const [holder, setHolder]       = useState("");
  const [bic, setBic]             = useState("");
  const [bankName, setBankName]   = useState("");
  const [ibanError, setIbanError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const account = await client.getSellerAccount();
        const seller = account?.sellerUser || account?.user || {};
        setSavedIban(seller.iban || "");
        setSavedHolder(seller.payment_account_holder || "");
        setSavedBic(seller.payment_bic || "");
        setSavedBankName(seller.payment_bank_name || "");
        setCommissionRate(Number(seller.commission_rate ?? 0.12));
        setIban(seller.iban || "");
        setHolder(seller.payment_account_holder || "");
        setBic(seller.payment_bic || "");
        setBankName(seller.payment_bank_name || "");
      } catch (e) {
        setError(e?.message || "Fehler beim Laden der Zahlungsdaten.");
      } finally {
        setLoading(false);
      }
    })();
  }, [client]);

  const handleSave = async () => {
    setError(""); setSuccess("");
    const trimmed = iban.replace(/\s/g, "").toUpperCase();
    if (trimmed) {
      const { ok, error: ibanErr } = validateIban(trimmed);
      if (!ok) { setIbanError(ibanErr); return; }
    }
    setIbanError("");
    setSaving(true);
    try {
      await client.updateSellerIban(trimmed || null);
      // Save additional payment info if the endpoint supports it
      try {
        await client.updateSellerCompanyInfo({
          payment_account_holder: holder.trim() || null,
          payment_bic: bic.replace(/\s/g, "").toUpperCase() || null,
          payment_bank_name: bankName.trim() || null,
        });
      } catch (_) {}
      setSavedIban(trimmed);
      setSavedHolder(holder.trim());
      setSavedBic(bic.replace(/\s/g, "").toUpperCase());
      setSavedBankName(bankName.trim());
      setSuccess("Bankdaten erfolgreich gespeichert.");
      setEditing(false);
    } catch (e) {
      setError(e?.message || "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIban(savedIban); setHolder(savedHolder);
    setBic(savedBic); setBankName(savedBankName);
    setIbanError(""); setError(""); setSuccess("");
    setEditing(false);
  };

  if (loading) {
    return <Card><Text as="p" tone="subdued">Laden…</Text></Card>;
  }

  return (
    <BlockStack gap="500">
      {/* Page header */}
      <Box>
        <BlockStack gap="100">
          <Text as="h1" variant="headingLg">Zahlungen & Auszahlungen</Text>
          <Text as="p" tone="subdued">
            Hinterlege dein Bankkonto, um Verkaufserlöse zu empfangen.
          </Text>
        </BlockStack>
      </Box>

      {success && <Banner tone="success" onDismiss={() => setSuccess("")}>{success}</Banner>}
      {error   && <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>}

      {/* Payout info */}
      <PayoutInfoBanner commissionRate={commissionRate} />

      {/* Current bank account */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="h2" variant="headingMd">Bankkonto für Auszahlungen</Text>
              <Text as="p" tone="subdued" variant="bodySm">
                An dieses Konto werden deine Verkaufserlöse überwiesen.
              </Text>
            </BlockStack>
            {!editing && (
              <Button onClick={() => setEditing(true)} size="slim">
                {savedIban ? "Bearbeiten" : "Hinzufügen"}
              </Button>
            )}
          </InlineStack>

          {/* Saved state (read-only) */}
          {!editing && (
            savedIban ? (
              <Box
                background="bg-surface-secondary"
                borderRadius="200"
                padding="400"
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" }}>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodySm" tone="subdued">IBAN</Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {maskIban(savedIban)}
                    </Text>
                  </BlockStack>
                  {savedHolder && (
                    <BlockStack gap="050">
                      <Text as="p" variant="bodySm" tone="subdued">Kontoinhaber</Text>
                      <Text as="p" variant="bodyMd">{savedHolder}</Text>
                    </BlockStack>
                  )}
                  {savedBic && (
                    <BlockStack gap="050">
                      <Text as="p" variant="bodySm" tone="subdued">BIC / SWIFT</Text>
                      <Text as="p" variant="bodyMd">{savedBic}</Text>
                    </BlockStack>
                  )}
                  {savedBankName && (
                    <BlockStack gap="050">
                      <Text as="p" variant="bodySm" tone="subdued">Bank</Text>
                      <Text as="p" variant="bodyMd">{savedBankName}</Text>
                    </BlockStack>
                  )}
                </div>
                <Box paddingBlockStart="300">
                  <InlineStack gap="150" blockAlign="center">
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
                    <Text as="p" variant="bodySm" tone="success">Bankkonto hinterlegt — bereit für Auszahlungen</Text>
                  </InlineStack>
                </Box>
              </Box>
            ) : (
              <Box
                background="bg-surface-caution"
                borderRadius="200"
                padding="400"
              >
                <InlineStack gap="300" blockAlign="center">
                  <span style={{ fontSize: 20 }}>⚠️</span>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Kein Bankkonto hinterlegt</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Ohne IBAN können keine Auszahlungen verarbeitet werden. Bitte füge dein Bankkonto hinzu.
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Box>
            )
          )}

          {/* Edit form */}
          {editing && (
            <BlockStack gap="300">
              <Box borderBlockStartWidth="025" borderColor="border-subdued" paddingBlockStart="300">
                <BlockStack gap="300">
                  <TextField
                    label="IBAN"
                    value={formatIbanDisplay(iban)}
                    onChange={(v) => {
                      setIban(v.replace(/\s/g, "").toUpperCase());
                      setIbanError("");
                    }}
                    error={ibanError}
                    placeholder="DE89 3704 0044 0532 0130 00"
                    helpText="Internationale Bankkontonummer (ohne Leerzeichen eingeben oder mit Leerzeichen — beides wird akzeptiert)"
                    autoComplete="off"
                  />
                  <TextField
                    label="Kontoinhaber"
                    value={holder}
                    onChange={setHolder}
                    placeholder="Max Mustermann oder Musterfirma GmbH"
                    autoComplete="off"
                  />
                  <InlineStack gap="300">
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="BIC / SWIFT (optional)"
                        value={bic}
                        onChange={(v) => setBic(v.toUpperCase())}
                        placeholder="COBADEFFXXX"
                        autoComplete="off"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Bankname (optional)"
                        value={bankName}
                        onChange={setBankName}
                        placeholder="Commerzbank AG"
                        autoComplete="off"
                      />
                    </div>
                  </InlineStack>
                </BlockStack>
              </Box>
              <InlineStack align="end" gap="200">
                <Button onClick={handleCancel} disabled={saving}>Abbrechen</Button>
                <Button variant="primary" onClick={handleSave} loading={saving}>
                  Bankdaten speichern
                </Button>
              </InlineStack>
            </BlockStack>
          )}
        </BlockStack>
      </Card>

      {/* Payout history placeholder */}
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Auszahlungshistorie</Text>
          <Box
            background="bg-surface-secondary"
            borderRadius="200"
            padding="500"
          >
            <BlockStack gap="200">
              <Text as="p" tone="subdued" alignment="center">
                Noch keine Auszahlungen.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Sobald eine Überweisung durchgeführt wird, erscheint sie hier mit Datum, Betrag und Referenz.
              </Text>
            </BlockStack>
          </Box>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
