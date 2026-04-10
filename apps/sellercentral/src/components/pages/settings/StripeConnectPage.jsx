"use client";

import React, { useEffect, useState } from "react";
import { Banner, BlockStack, Box, Button, Card, InlineStack, Text } from "@shopify/polaris";
import { useSearchParams, useRouter } from "next/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

export default function StripeConnectPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const client = getMedusaAdminClient();

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  // null → { connected, onboarding_complete, stripe_account_id, commission_rate }

  const justConnected = searchParams?.get("connected") === "true";
  const needsRefresh  = searchParams?.get("refresh") === "true";

  useEffect(() => {
    fetchStatus();
  }, []);

  // If Stripe redirected back with ?connected=true, re-fetch status (Stripe might have updated)
  useEffect(() => {
    if (justConnected || needsRefresh) fetchStatus();
  }, [justConnected, needsRefresh]);

  const fetchStatus = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await client.stripeConnectStatus();
      setStatus(data);
    } catch (e) {
      setError(e?.message || "Failed to load Stripe Connect status.");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError("");
    try {
      const data = await client.stripeConnectOnboard();
      if (data?.url) {
        // Redirect to Stripe's hosted onboarding
        window.location.href = data.url;
      } else {
        throw new Error("No onboarding URL returned.");
      }
    } catch (e) {
      setError(e?.message || "Failed to start Stripe Connect onboarding.");
      setConnecting(false);
    }
  };

  const handleDashboard = async () => {
    setDashboardLoading(true);
    setError("");
    try {
      const data = await client.stripeConnectDashboardLink();
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e?.message || "Failed to get dashboard link.");
    } finally {
      setDashboardLoading(false);
    }
  };

  const commissionPct = status ? Math.round((status.commission_rate ?? 0.12) * 100) : 12;
  const sellerPct = 100 - commissionPct;

  return (
    <BlockStack gap="400">
      {/* Header */}
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Stripe Connect — Auszahlungen</Text>
          <Text as="p" tone="subdued">
            Verbinde dein Stripe-Konto, um Auszahlungen direkt zu erhalten.
            Nach Lieferung +14 Tagen werden automatisch {sellerPct}% an dich überwiesen —
            {commissionPct}% Plattformgebühr behält Belucha.
          </Text>
        </BlockStack>
      </Card>

      {/* Just connected success */}
      {justConnected && (
        <Banner tone="success" onDismiss={() => router.replace("/settings/stripe-connect")}>
          Stripe-Konto erfolgreich verbunden! Auszahlungen werden ab sofort automatisch verarbeitet.
        </Banner>
      )}

      {/* Needs refresh */}
      {needsRefresh && !justConnected && (
        <Banner tone="warning" onDismiss={() => router.replace("/settings/stripe-connect")}>
          Der Onboarding-Link ist abgelaufen. Klicke unten erneut auf &quot;Stripe verbinden&quot;.
        </Banner>
      )}

      {error && (
        <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>
      )}

      {loading ? (
        <Card><Text as="p" tone="subdued">Laden…</Text></Card>
      ) : (
        <>
          {/* Status card */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">Status</Text>

              <InlineStack gap="300" blockAlign="center">
                {/* Connection dot */}
                <span style={{
                  display: "inline-block", width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                  background: status?.onboarding_complete ? "#10b981" : status?.connected ? "#f59e0b" : "#d1d5db",
                }} />
                <BlockStack gap="0">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {status?.onboarding_complete
                      ? "Verbunden & aktiv"
                      : status?.connected
                      ? "Verbunden — Onboarding ausstehend"
                      : "Nicht verbunden"}
                  </Text>
                  {status?.stripe_account_id && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Konto-ID: {status.stripe_account_id}
                    </Text>
                  )}
                </BlockStack>
              </InlineStack>

              {/* How it works */}
              {status?.onboarding_complete && (
                <Box background="bg-surface-secondary" borderRadius="200" padding="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">Wie Auszahlungen funktionieren:</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Wenn ein Kunde bezahlt, wird die Auszahlung nach Lieferung +14 Tagen automatisch freigegeben und Stripe überweist{" "}
                      <strong>{sellerPct}%</strong> des Produktwerts direkt auf dein verbundenes Konto.
                      Die {commissionPct}% Plattformgebühr verbleibt bei Belucha.
                      Auszahlungen erscheinen in deinem Stripe Express Dashboard.
                    </Text>
                  </BlockStack>
                </Box>
              )}

              {/* Onboarding incomplete warning */}
              {status?.connected && !status?.onboarding_complete && (
                <Box background="bg-surface-caution" borderRadius="200" padding="300">
                  <Text as="p" variant="bodySm">
                    Du hast die Stripe-Registrierung noch nicht vollständig abgeschlossen.
                    Klicke auf &quot;Onboarding fortsetzen&quot;, um deine Bank- und Identitätsdaten bei Stripe einzutragen.
                    Bis dahin werden keine Auszahlungen verarbeitet.
                  </Text>
                </Box>
              )}
            </BlockStack>
          </Card>

          {/* Actions */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">Aktionen</Text>
              <InlineStack gap="300" wrap>
                {!status?.connected ? (
                  <Button variant="primary" onClick={handleConnect} loading={connecting}>
                    Stripe verbinden
                  </Button>
                ) : !status?.onboarding_complete ? (
                  <Button variant="primary" onClick={handleConnect} loading={connecting}>
                    Onboarding fortsetzen
                  </Button>
                ) : (
                  <Button onClick={handleDashboard} loading={dashboardLoading}>
                    Stripe Dashboard öffnen ↗
                  </Button>
                )}
                {status?.connected && (
                  <Button onClick={fetchStatus} loading={loading} size="slim">
                    Status aktualisieren
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Commission breakdown */}
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Vergütungsaufteilung</Text>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: "Produktpreis", value: "100%", sub: "was der Kunde zahlt" },
                  { label: "Deine Auszahlung", value: `${sellerPct}%`, sub: "automatisch via Stripe", highlight: true },
                  { label: "Plattformgebühr", value: `${commissionPct}%`, sub: "inkl. Stripe-Gebühren" },
                ].map(({ label, value, sub, highlight }) => (
                  <Box
                    key={label}
                    background={highlight ? "bg-surface-selected" : "bg-surface-secondary"}
                    borderRadius="200"
                    padding="300"
                  >
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
                      <Text as="p" variant="headingLg" fontWeight="bold"
                        tone={highlight ? "success" : undefined}>
                        {value}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>
                    </BlockStack>
                  </Box>
                ))}
              </div>
            </BlockStack>
          </Card>
        </>
      )}
    </BlockStack>
  );
}
