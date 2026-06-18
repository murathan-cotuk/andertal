"use client";

import React, { useEffect, useState } from "react";
import { Banner, BlockStack, Box, Button, Card, InlineStack, Text } from "@shopify/polaris";
import { useSearchParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

export default function StripeConnectPage() {
  const locale = useLocale();
  const ui = getUI(locale);
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

  const t = {
    headerTitle:
      locale === "en" ? "Stripe Connect — Payouts"
      : locale === "tr" ? "Stripe Connect — Ödemeler"
      : locale === "fr" ? "Stripe Connect — Versements"
      : locale === "es" ? "Stripe Connect — Pagos"
      : locale === "it" ? "Stripe Connect — Pagamenti"
      : "Stripe Connect — Auszahlungen",
    headerDesc:
      locale === "en" ? `Connect your Stripe account to receive payouts directly. After delivery +14 days, ${sellerPct}% will be automatically transferred to you — Andertal retains the ${commissionPct}% platform fee.`
      : locale === "tr" ? `Doğrudan ödeme almak için Stripe hesabınızı bağlayın. Teslimat +14 gün sonra ${sellerPct}% otomatik olarak size aktarılır — Andertal %${commissionPct} platform ücretini alıkoyar.`
      : locale === "fr" ? `Connectez votre compte Stripe pour recevoir des versements directement. Après livraison +14 jours, ${sellerPct}% vous seront versés automatiquement — Andertal conserve les ${commissionPct}% de frais de plateforme.`
      : locale === "es" ? `Conecte su cuenta Stripe para recibir pagos directamente. Tras la entrega +14 días, se le transferirá automáticamente el ${sellerPct}% — Andertal retiene el ${commissionPct}% de tarifa de plataforma.`
      : locale === "it" ? `Collega il tuo account Stripe per ricevere i pagamenti direttamente. Dopo la consegna +14 giorni, il ${sellerPct}% verrà trasferito automaticamente a te — Andertal trattiene il ${commissionPct}% come commissione di piattaforma.`
      : `Verbinde dein Stripe-Konto, um Auszahlungen direkt zu erhalten. Nach Lieferung +14 Tagen werden automatisch ${sellerPct}% an dich überwiesen — ${commissionPct}% Plattformgebühr behält Andertal.`,
    connectedSuccess:
      locale === "en" ? "Stripe account successfully connected! Payouts will be processed automatically from now on."
      : locale === "tr" ? "Stripe hesabı başarıyla bağlandı! Ödemeler artık otomatik olarak işlenecek."
      : locale === "fr" ? "Compte Stripe connecté avec succès ! Les versements seront traités automatiquement désormais."
      : locale === "es" ? "¡Cuenta Stripe conectada con éxito! Los pagos se procesarán automáticamente a partir de ahora."
      : locale === "it" ? "Account Stripe connesso con successo! I pagamenti verranno elaborati automaticamente da ora in poi."
      : "Stripe-Konto erfolgreich verbunden! Auszahlungen werden ab sofort automatisch verarbeitet.",
    refreshExpired:
      locale === "en" ? 'The onboarding link has expired. Click "Connect Stripe" below again.'
      : locale === "tr" ? '"Stripe\'ı Bağla"ya aşağıdan tekrar tıklayın. Bağlantı süresi doldu.'
      : locale === "fr" ? 'Le lien d\'inscription a expiré. Cliquez à nouveau sur « Connecter Stripe » ci-dessous.'
      : locale === "es" ? 'El enlace de incorporación ha caducado. Haga clic de nuevo en "Conectar Stripe" a continuación.'
      : locale === "it" ? 'Il link di onboarding è scaduto. Fai clic di nuovo su "Collega Stripe" qui sotto.'
      : 'Der Onboarding-Link ist abgelaufen. Klicke unten erneut auf "Stripe verbinden".',
    statusConnectedActive:
      locale === "en" ? "Connected & active"
      : locale === "tr" ? "Bağlandı & aktif"
      : locale === "fr" ? "Connecté & actif"
      : locale === "es" ? "Conectado y activo"
      : locale === "it" ? "Connesso & attivo"
      : "Verbunden & aktiv",
    statusConnectedPending:
      locale === "en" ? "Connected — onboarding pending"
      : locale === "tr" ? "Bağlandı — kayıt beklemede"
      : locale === "fr" ? "Connecté — inscription en attente"
      : locale === "es" ? "Conectado — incorporación pendiente"
      : locale === "it" ? "Connesso — onboarding in attesa"
      : "Verbunden — Onboarding ausstehend",
    statusNotConnected:
      locale === "en" ? "Not connected"
      : locale === "tr" ? "Bağlı değil"
      : locale === "fr" ? "Non connecté"
      : locale === "es" ? "No conectado"
      : locale === "it" ? "Non connesso"
      : "Nicht verbunden",
    accountId:
      locale === "en" ? "Account ID"
      : locale === "tr" ? "Hesap Kimliği"
      : locale === "fr" ? "ID de compte"
      : locale === "es" ? "ID de cuenta"
      : locale === "it" ? "ID account"
      : "Konto-ID",
    howPayoutsWork:
      locale === "en" ? "How payouts work:"
      : locale === "tr" ? "Ödemeler nasıl çalışır:"
      : locale === "fr" ? "Comment fonctionnent les versements :"
      : locale === "es" ? "Cómo funcionan los pagos:"
      : locale === "it" ? "Come funzionano i pagamenti:"
      : "Wie Auszahlungen funktionieren:",
    howPayoutsDesc:
      locale === "en"
        ? <>When a customer pays, the payout is automatically released after delivery +14 days and Stripe transfers{" "}<strong>{sellerPct}%</strong> of the product value directly to your connected account. The {commissionPct}% platform fee stays with Andertal. Payouts appear in your Stripe Express Dashboard.</>
        : locale === "tr"
        ? <>Bir müşteri ödeme yaptığında, ödeme teslimat +14 gün sonra otomatik olarak serbest bırakılır ve Stripe ürün değerinin{" "}<strong>{sellerPct}%</strong>'sini doğrudan bağlı hesabınıza aktarır. {commissionPct}% platform ücreti Andertal'da kalır. Ödemeler Stripe Express Dashboard'unuzda görünür.</>
        : locale === "fr"
        ? <>Lorsqu'un client paie, le versement est automatiquement libéré après livraison +14 jours et Stripe transfère{" "}<strong>{sellerPct}%</strong> de la valeur du produit directement sur votre compte connecté. Les {commissionPct}% de frais de plateforme restent chez Andertal. Les versements apparaissent dans votre Stripe Express Dashboard.</>
        : locale === "es"
        ? <>Cuando un cliente paga, el pago se libera automáticamente tras la entrega +14 días y Stripe transfiere{" "}<strong>{sellerPct}%</strong> del valor del producto directamente a su cuenta conectada. El {commissionPct}% de tarifa de plataforma se queda en Andertal. Los pagos aparecen en su Stripe Express Dashboard.</>
        : locale === "it"
        ? <>Quando un cliente paga, il pagamento viene rilasciato automaticamente dopo la consegna +14 giorni e Stripe trasferisce{" "}<strong>{sellerPct}%</strong> del valore del prodotto direttamente sul tuo account connesso. Il {commissionPct}% di commissione di piattaforma rimane ad Andertal. I pagamenti appaiono nel tuo Stripe Express Dashboard.</>
        : <>Wenn ein Kunde bezahlt, wird die Auszahlung nach Lieferung +14 Tagen automatisch freigegeben und Stripe überweist{" "}<strong>{sellerPct}%</strong> des Produktwerts direkt auf dein verbundenes Konto. Die {commissionPct}% Plattformgebühr verbleibt bei Andertal. Auszahlungen erscheinen in deinem Stripe Express Dashboard.</>,
    onboardingIncomplete:
      locale === "en" ? 'You have not yet fully completed the Stripe registration. Click "Continue onboarding" to enter your bank and identity details with Stripe. Until then, no payouts will be processed.'
      : locale === "tr" ? '"Kayıta devam et"e tıklayarak Stripe\'ta banka ve kimlik bilgilerinizi girin. Siz bunu yapana kadar ödeme işlenmez.'
      : locale === "fr" ? 'Vous n\'avez pas encore entièrement complété l\'inscription Stripe. Cliquez sur « Continuer l\'inscription » pour saisir vos coordonnées bancaires et d\'identité chez Stripe. Jusque-là, aucun versement ne sera traité.'
      : locale === "es" ? 'Aún no ha completado el registro de Stripe. Haga clic en "Continuar incorporación" para ingresar sus datos bancarios e identidad en Stripe. Hasta entonces no se procesarán pagos.'
      : locale === "it" ? 'Non hai ancora completato completamente la registrazione Stripe. Fai clic su "Continua onboarding" per inserire i tuoi dati bancari e di identità su Stripe. Nel frattempo non verranno elaborati pagamenti.'
      : 'Du hast die Stripe-Registrierung noch nicht vollständig abgeschlossen. Klicke auf "Onboarding fortsetzen", um deine Bank- und Identitätsdaten bei Stripe einzutragen. Bis dahin werden keine Auszahlungen verarbeitet.',
    btnConnectStripe:
      locale === "en" ? "Connect Stripe"
      : locale === "tr" ? "Stripe'ı Bağla"
      : locale === "fr" ? "Connecter Stripe"
      : locale === "es" ? "Conectar Stripe"
      : locale === "it" ? "Collega Stripe"
      : "Stripe verbinden",
    btnContinueOnboarding:
      locale === "en" ? "Continue onboarding"
      : locale === "tr" ? "Kayıta devam et"
      : locale === "fr" ? "Continuer l'inscription"
      : locale === "es" ? "Continuar incorporación"
      : locale === "it" ? "Continua onboarding"
      : "Onboarding fortsetzen",
    btnOpenDashboard:
      locale === "en" ? "Open Stripe Dashboard ↗"
      : locale === "tr" ? "Stripe Dashboard'u Aç ↗"
      : locale === "fr" ? "Ouvrir le Dashboard Stripe ↗"
      : locale === "es" ? "Abrir Dashboard de Stripe ↗"
      : locale === "it" ? "Apri Stripe Dashboard ↗"
      : "Stripe Dashboard öffnen ↗",
    btnRefreshStatus:
      locale === "en" ? "Refresh status"
      : locale === "tr" ? "Durumu yenile"
      : locale === "fr" ? "Actualiser le statut"
      : locale === "es" ? "Actualizar estado"
      : locale === "it" ? "Aggiorna stato"
      : "Status aktualisieren",
    commissionTitle:
      locale === "en" ? "Payout breakdown"
      : locale === "tr" ? "Ödeme dağılımı"
      : locale === "fr" ? "Répartition des versements"
      : locale === "es" ? "Desglose de pagos"
      : locale === "it" ? "Ripartizione dei pagamenti"
      : "Vergütungsaufteilung",
    labelProductPrice:
      locale === "en" ? "Product price"
      : locale === "tr" ? "Ürün fiyatı"
      : locale === "fr" ? "Prix du produit"
      : locale === "es" ? "Precio del producto"
      : locale === "it" ? "Prezzo del prodotto"
      : "Produktpreis",
    labelProductPriceSub:
      locale === "en" ? "what the customer pays"
      : locale === "tr" ? "müşterinin ödediği"
      : locale === "fr" ? "ce que paie le client"
      : locale === "es" ? "lo que paga el cliente"
      : locale === "it" ? "quello che paga il cliente"
      : "was der Kunde zahlt",
    labelYourPayout:
      locale === "en" ? "Your payout"
      : locale === "tr" ? "Sizin ödemeniz"
      : locale === "fr" ? "Votre versement"
      : locale === "es" ? "Su pago"
      : locale === "it" ? "Il tuo pagamento"
      : "Deine Auszahlung",
    labelYourPayoutSub:
      locale === "en" ? "automatically via Stripe"
      : locale === "tr" ? "Stripe üzerinden otomatik"
      : locale === "fr" ? "automatiquement via Stripe"
      : locale === "es" ? "automáticamente vía Stripe"
      : locale === "it" ? "automaticamente via Stripe"
      : "automatisch via Stripe",
    labelPlatformFee:
      locale === "en" ? "Platform fee"
      : locale === "tr" ? "Platform ücreti"
      : locale === "fr" ? "Frais de plateforme"
      : locale === "es" ? "Tarifa de plataforma"
      : locale === "it" ? "Commissione di piattaforma"
      : "Plattformgebühr",
    labelPlatformFeeSub:
      locale === "en" ? "incl. Stripe fees"
      : locale === "tr" ? "Stripe ücretleri dahil"
      : locale === "fr" ? "frais Stripe inclus"
      : locale === "es" ? "incl. tarifas de Stripe"
      : locale === "it" ? "incl. commissioni Stripe"
      : "inkl. Stripe-Gebühren",
  };

  return (
    <BlockStack gap="400">
      {/* Header */}
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">{t.headerTitle}</Text>
          <Text as="p" tone="subdued">{t.headerDesc}</Text>
        </BlockStack>
      </Card>

      {/* Just connected success */}
      {justConnected && (
        <Banner tone="success" onDismiss={() => router.replace("/settings/stripe-connect")}>
          {t.connectedSuccess}
        </Banner>
      )}

      {/* Needs refresh */}
      {needsRefresh && !justConnected && (
        <Banner tone="warning" onDismiss={() => router.replace("/settings/stripe-connect")}>
          {t.refreshExpired}
        </Banner>
      )}

      {error && (
        <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>
      )}

      {loading ? (
        <Card><Text as="p" tone="subdued">{ui.loading}</Text></Card>
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
                      ? t.statusConnectedActive
                      : status?.connected
                      ? t.statusConnectedPending
                      : t.statusNotConnected}
                  </Text>
                  {status?.stripe_account_id && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t.accountId}: {status.stripe_account_id}
                    </Text>
                  )}
                </BlockStack>
              </InlineStack>

              {/* How it works */}
              {status?.onboarding_complete && (
                <Box background="bg-surface-secondary" borderRadius="200" padding="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">{t.howPayoutsWork}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t.howPayoutsDesc}
                    </Text>
                  </BlockStack>
                </Box>
              )}

              {/* Onboarding incomplete warning */}
              {status?.connected && !status?.onboarding_complete && (
                <Box background="bg-surface-caution" borderRadius="200" padding="300">
                  <Text as="p" variant="bodySm">
                    {t.onboardingIncomplete}
                  </Text>
                </Box>
              )}
            </BlockStack>
          </Card>

          {/* Actions */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">{ui.actions}</Text>
              <InlineStack gap="300" wrap>
                {!status?.connected ? (
                  <Button variant="primary" onClick={handleConnect} loading={connecting}>
                    {t.btnConnectStripe}
                  </Button>
                ) : !status?.onboarding_complete ? (
                  <Button variant="primary" onClick={handleConnect} loading={connecting}>
                    {t.btnContinueOnboarding}
                  </Button>
                ) : (
                  <Button onClick={handleDashboard} loading={dashboardLoading}>
                    {t.btnOpenDashboard}
                  </Button>
                )}
                {status?.connected && (
                  <Button onClick={fetchStatus} loading={loading} size="slim">
                    {t.btnRefreshStatus}
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Commission breakdown */}
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">{t.commissionTitle}</Text>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: t.labelProductPrice, value: "100%", sub: t.labelProductPriceSub },
                  { label: t.labelYourPayout, value: `${sellerPct}%`, sub: t.labelYourPayoutSub, highlight: true },
                  { label: t.labelPlatformFee, value: `${commissionPct}%`, sub: t.labelPlatformFeeSub },
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
