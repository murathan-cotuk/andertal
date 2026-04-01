"use client";

import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Banner,
  Badge,
  Divider,
  Box,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const fmt = (cents) => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export default function PaymentsSettingsPage() {
  const [iban, setIban] = useState("");
  const [savedIban, setSavedIban] = useState("");
  const [commissionRate, setCommissionRate] = useState(0.1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [payouts, setPayouts] = useState([]);
  const [payoutsLoading, setPayoutsLoading] = useState(false);

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
    loadProfile();
    loadPayouts();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const d = await getMedusaAdminClient().getSellerProfile();
      setIban(d?.user?.iban || "");
      setSavedIban(d?.user?.iban || "");
      setCommissionRate(parseFloat(d?.user?.commission_rate ?? 0.10));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadPayouts = async () => {
    setPayoutsLoading(true);
    try {
      const d = await getMedusaAdminClient().getPayouts();
      setPayouts(d?.payouts || []);
    } catch {
      // ignore
    } finally {
      setPayoutsLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErr("");
    setSuccess(false);
    try {
      await getMedusaAdminClient().updateSellerIban(iban.trim() || null);
      setSavedIban(iban.trim());
      setSuccess(true);
    } catch (e) {
      setErr(e?.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const payoutStatusTone = (status) => {
    if (status === "bezahlt") return "success";
    if (status === "offen") return "warning";
    return "info";
  };

  return (
    <Page title="Zahlungseinstellungen" subtitle="IBAN und Auszahlungsübersicht">
      <Layout>
        <Layout.Section>
          {/* IBAN Card */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Bankverbindung (IBAN)</Text>
              <Text tone="subdued" variant="bodySm">
                Geben Sie Ihre IBAN an, damit Auszahlungen auf Ihr Konto überwiesen werden können.
                Die IBAN wird nur dem Plattformbetreiber angezeigt.
              </Text>
              {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}
              {success && <Banner tone="success" onDismiss={() => setSuccess(false)}><Text>IBAN erfolgreich gespeichert.</Text></Banner>}
              {loading ? (
                <Text tone="subdued">Laden…</Text>
              ) : (
                <InlineStack gap="300" blockAlign="end">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="IBAN"
                      value={iban}
                      onChange={setIban}
                      placeholder="DE89 3704 0044 0532 0130 00"
                      autoComplete="off"
                      helpText="Format: DE89 3704 0044 0532 0130 00"
                    />
                  </div>
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    loading={saving}
                    disabled={iban === savedIban}
                  >
                    Speichern
                  </Button>
                </InlineStack>
              )}
            </BlockStack>
          </Card>

          {/* Commission Info */}
          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Provisionsmodell</Text>
                <Divider />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <Text tone="subdued" variant="bodySm">Ihr Provisionssatz</Text>
                    <Text variant="headingLg" fontWeight="bold" tone="critical">
                      {(commissionRate * 100).toFixed(0)} %
                    </Text>
                  </div>
                  <div>
                    <Text tone="subdued" variant="bodySm">Auszahlungszyklus</Text>
                    <Text variant="headingLg" fontWeight="bold">15 Tage</Text>
                  </div>
                </div>
                <Text tone="subdued" variant="bodySm">
                  Auszahlungen werden alle 15 Tage verarbeitet. Nur Bestellungen, die
                  mindestens 14 Tage nach Lieferung abgelaufen sind, kommen für eine Auszahlung infrage.
                </Text>
              </BlockStack>
            </Card>
          </Box>

          {/* Payouts History */}
          <Box paddingBlockStart="400">
            <Card padding="0">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <Text variant="headingMd" as="h2">Auszahlungsverlauf</Text>
              </div>
              {payoutsLoading ? (
                <Box padding="400"><Text tone="subdued">Laden…</Text></Box>
              ) : payouts.length === 0 ? (
                <Box padding="600">
                  <div style={{ textAlign: "center" }}>
                    <Text tone="subdued">Noch keine Auszahlungen vorhanden.</Text>
                  </div>
                </Box>
              ) : (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 100px 80px", gap: 8, padding: "10px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                    <div>Zeitraum</div>
                    <div style={{ textAlign: "right" }}>Umsatz</div>
                    <div style={{ textAlign: "right" }}>Auszahlung</div>
                    <div style={{ textAlign: "right" }}>Bezahlt am</div>
                    <div style={{ textAlign: "center" }}>Status</div>
                  </div>
                  {payouts.map((p) => (
                    <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 100px 80px", gap: 8, padding: "10px 16px", borderBottom: "1px solid #f9fafb", fontSize: 13, alignItems: "center" }}>
                      <div style={{ fontSize: 12, color: "#374151" }}>
                        {p.period_start ? new Date(p.period_start).toLocaleDateString("de-DE") : "—"}
                        {" – "}
                        {p.period_end ? new Date(p.period_end).toLocaleDateString("de-DE") : "—"}
                      </div>
                      <div style={{ textAlign: "right" }}>{fmt(p.total_cents)}</div>
                      <div style={{ textAlign: "right", fontWeight: 600, color: "#10b981" }}>{fmt(p.payout_cents)}</div>
                      <div style={{ textAlign: "right", fontSize: 12, color: "#6b7280" }}>
                        {p.paid_at ? new Date(p.paid_at).toLocaleDateString("de-DE") : "—"}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <Badge tone={payoutStatusTone(p.status)}>{p.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
