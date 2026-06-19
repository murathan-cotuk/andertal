"use client";

import { useEffect, useState, useRef } from "react";
import { Page, Card, Banner, Spinner, BlockStack, Button, InlineStack } from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { lt } from "@/lib/locale-text";
import DashboardLayout from "@/components/DashboardLayout";

export default function MarketingCampaignNewRoute() {
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState(null);
  const createStarted = useRef(false);

  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);

  useEffect(() => {
    if (createStarted.current) return;
    createStarted.current = true;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const client = getMedusaAdminClient();
        const res = await client.createCampaign({
          name: t("New ad campaign", "Yeni reklam kampanyası", "Nouvelle campagne publicitaire", "Nueva campaña publicitaria", "Nuova campagna pubblicitaria", "Neue Werbekampagne"),
          description: "",
          target_type: "products",
          product_ids: [],
          group_ids: [],
          variant_ids: [],
          budget_daily_cents: 100,
          bid_strategy: "cpc",
          ad_platforms: [],
          start_at: null,
          end_at: null,
          campaign_type: "ppc",
          discount_type: "percentage",
          discount_value: 0,
          status: "draft",
        });
        const id = res?.campaign?.id;
        if (!id) throw new Error(t("No campaign ID returned from API.", "API'den kampanya ID'si alınamadı.", "Aucun ID de campagne renvoyé par l'API.", "La API no devolvió ID de campaña.", "Nessun ID campagna restituito dall'API.", "Keine Kampagnen-ID von der API erhalten."));
        if (!cancelled) router.replace(`/marketing/campaigns/${id}`);
      } catch (e) {
        if (!cancelled) setError(e?.message || t("Could not create campaign.", "Kampanya oluşturulamadı.", "Impossible de créer la campagne.", "No se pudo crear la campaña.", "Impossibile creare la campagna.", "Kampagne konnte nicht angelegt werden."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, locale]);

  return (
    <DashboardLayout>
      <Page
        title={t("New campaign", "Yeni kampanya", "Nouvelle campagne", "Nueva campaña", "Nuova campagna", "Neue Kampagne")}
        backAction={{ content: t("Back", "Geri", "Retour", "Atrás", "Indietro", "Zurück"), url: "/marketing/campaigns" }}
      >
        <Card>
          <div style={{ padding: 32, textAlign: "center" }}>
            <BlockStack gap="400">
              {error ? (
                <BlockStack gap="300">
                  <Banner tone="critical">{error}</Banner>
                  <InlineStack gap="200">
                    <Button url="/marketing/campaigns">{t("Back to overview", "Genel bakışa dön", "Retour à l'aperçu", "Volver al resumen", "Torna alla panoramica", "Zur Übersicht")}</Button>
                    <Button variant="primary" onClick={() => window.location.reload()}>{t("Try again", "Tekrar dene", "Réessayer", "Reintentar", "Riprova", "Erneut versuchen")}</Button>
                  </InlineStack>
                </BlockStack>
              ) : (
                <>
                  <Spinner accessibilityLabel={t("Creating", "Oluşturuluyor", "Création", "Creando", "Creazione", "Anlegen")} size="large" />
                  <BlockStack gap="100">
                    <span style={{ fontSize: 14, color: "#6d7175" }}>{t("Creating campaign…", "Kampanya oluşturuluyor…", "Création de la campagne…", "Creando campaña…", "Creazione campagna…", "Kampagne wird angelegt …")}</span>
                  </BlockStack>
                </>
              )}
            </BlockStack>
          </div>
        </Card>
      </Page>
    </DashboardLayout>
  );
}
