"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  Badge,
  Spinner,
  EmptyState,
} from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import {
  PLATFORM_OPTIONS,
  fmtBudget,
  fmtDate,
  AD_STATUS_TONE,
  AD_STATUS_LABEL,
  parseJsonIdArray,
} from "@/components/pages/marketing/ppcCampaignShared";

function CampaignRow({ campaign, isSuperuser, onEdit, onDelete, onPublish, onPause, onResume, actionLoading }) {
  const adStatus = campaign.ad_status || "draft";
  const platforms = parseJsonIdArray(campaign.ad_platforms);
  const budget = fmtBudget(campaign.budget_daily_cents);
  const platformLabels = platforms.map((p) => PLATFORM_OPTIONS.find((o) => o.value === p)?.label || p).join(", ");
  const shopLine = isSuperuser
    ? (platformLabels ? ` · Ausspielung: ${platformLabels}` : "")
    : " · Fokus: Sichtbarkeit & Sponsored im Shop";

  return (
    <div style={{ borderTop: "1px solid #f1f2f4", padding: "14px 0" }}>
      <InlineStack align="space-between" blockAlign="start" wrap={false}>
        <BlockStack gap="100" inlineSize="grow">
          <InlineStack gap="200" blockAlign="center" wrap>
            <Text as="span" fontWeight="semibold">{campaign.name}</Text>
            <Badge tone={AD_STATUS_TONE[adStatus] || "info"}>{AD_STATUS_LABEL[adStatus] || adStatus}</Badge>
            {campaign.status === "active" && adStatus === "published" && (
              <Badge tone="success">Sponsored aktiv</Badge>
            )}
          </InlineStack>
          <Text tone="subdued" as="span" variant="bodySm">
            ID: {campaign.id}
          </Text>
          {campaign.description && (
            <Text tone="subdued" as="span" variant="bodySm">{campaign.description}</Text>
          )}
          <Text tone="subdued" as="span" variant="bodySm">
            Budget: {budget}
            {shopLine}
            {campaign.start_at || campaign.end_at ? ` · ${fmtDate(campaign.start_at)} – ${fmtDate(campaign.end_at)}` : ""}
          </Text>
        </BlockStack>
        <InlineStack gap="200" wrap>
          {isSuperuser && adStatus === "draft" && (
            <Button size="slim" tone="success" onClick={() => onPublish(campaign.id)} loading={actionLoading === campaign.id + "_publish"}>
              Veröffentlichen
            </Button>
          )}
          {isSuperuser && adStatus === "published" && (
            <Button size="slim" onClick={() => onPause(campaign.id)} loading={actionLoading === campaign.id + "_pause"}>
              Pausieren
            </Button>
          )}
          {isSuperuser && adStatus === "paused" && (
            <Button size="slim" tone="success" onClick={() => onResume(campaign.id)} loading={actionLoading === campaign.id + "_resume"}>
              Fortsetzen
            </Button>
          )}
          <Button size="slim" onClick={() => onEdit(campaign)}>Bearbeiten</Button>
          <Button size="slim" tone="critical" variant="plain" onClick={() => onDelete(campaign.id)}>Löschen</Button>
        </InlineStack>
      </InlineStack>
    </div>
  );
}

export default function MarketingCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [msg, setMsg] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [sellerId, setSellerId] = useState(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
      setSellerId(localStorage.getItem("sellerId"));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cRes = await getMedusaAdminClient().getCampaigns();
      const allCampaigns = Array.isArray(cRes?.campaigns) ? cRes.campaigns : [];
      setCampaigns(allCampaigns.filter((c) => c.campaign_type === "ppc" || (c.campaign_type == null && c.budget_daily_cents > 0)));
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Daten konnten nicht geladen werden." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const goEdit = (c) => {
    router.push(`/marketing/campaigns/${c.id}`);
  };

  const remove = async (id) => {
    if (!confirm("Kampagne wirklich löschen?")) return;
    try {
      await getMedusaAdminClient().deleteCampaign(id);
      setMsg({ tone: "success", text: "Kampagne gelöscht." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Löschen." });
    }
  };

  const handlePublish = async (id) => {
    setActionLoading(id + "_publish");
    setMsg(null);
    try {
      const r = await getMedusaAdminClient().publishCampaign(id);
      const count = r?.platforms_published?.length || 0;
      const budgetPerPlatform = r?.budget_per_platform_cents ? `${(r.budget_per_platform_cents / 100).toFixed(2)} €` : "";
      setMsg({ tone: "success", text: `Kampagne auf ${count} Plattform(en) veröffentlicht.${budgetPerPlatform ? ` Budget je Plattform: ${budgetPerPlatform}/Tag.` : ""}` });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Veröffentlichen." });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (id) => {
    setActionLoading(id + "_pause");
    try {
      await getMedusaAdminClient().pauseCampaign(id);
      setMsg({ tone: "success", text: "Kampagne pausiert." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Pausieren." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (id) => {
    setActionLoading(id + "_resume");
    try {
      await getMedusaAdminClient().resumeCampaign(id);
      setMsg({ tone: "success", text: "Kampagne fortgesetzt." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Fortsetzen." });
    } finally {
      setActionLoading(null);
    }
  };

  const ownCampaigns = campaigns.filter((c) => c.seller_id === sellerId);
  const otherSellers = isSuperuser
    ? [...new Set(campaigns.filter((c) => c.seller_id !== sellerId).map((c) => c.seller_id))]
    : [];

  const [connectedPlatforms, setConnectedPlatforms] = useState([]);

  useEffect(() => {
    if (!isSuperuser) return;
    (async () => {
      try {
        const d = await getMedusaAdminClient().getMarketingAccounts();
        const active = (d?.accounts || []).filter((a) => a.is_active && Object.keys(a.credentials || {}).some((k) => a.credentials[k]));
        setConnectedPlatforms(active.map((a) => a.platform));
      } catch {
        setConnectedPlatforms([]);
      }
    })();
  }, [isSuperuser]);

  return (
    <Page
      title="Marketing-Kampagnen"
      subtitle={
        isSuperuser
          ? "Übersicht: Shop-Promotion & externe Ausspielung (Admin)"
          : "Mehr Sichtbarkeit im Shop — Sponsored, Ranking und Reichweite über das Marketplace-Team"
      }
      primaryAction={{ content: "Neue Kampagne", onAction: () => router.push("/marketing/campaigns/new") }}
    >
      <BlockStack gap="400">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Banner>
        )}

        {isSuperuser && connectedPlatforms.length === 0 && (
          <Banner tone="warning">
            Keine Marketing-Konten verbunden. Gehe zu{" "}
            <strong>Apps & Integrationen</strong> um Werbekonten (Meta, Google Ads, etc.) zu verbinden.
          </Banner>
        )}

        {loading ? (
          <Card>
            <div style={{ padding: 32, textAlign: "center" }}>
              <Spinner size="small" />
            </div>
          </Card>
        ) : campaigns.length === 0 ? (
          <Card>
            <EmptyState heading="Noch keine Shop-Kampagnen" image="">
              <p>
                Lege eine Promotion an — im Shop erscheint sie als effektive, gesponserte Darstellung mit erhöhter Sichtbarkeit.
                Die Aussteuerung außerhalb des Shops übernimmt das Marketplace-Team im Hintergrund.
              </p>
              <div style={{ marginTop: 16 }}>
                <Button variant="primary" onClick={() => router.push("/marketing/campaigns/new")}>Neue Kampagne</Button>
              </div>
            </EmptyState>
          </Card>
        ) : (
          <>
            {ownCampaigns.length > 0 && (
              <Card>
                <BlockStack gap="0">
                  <Text as="h2" variant="headingMd">
                    {isSuperuser ? "Eigene Kampagnen" : "Meine Kampagnen"} ({ownCampaigns.length})
                  </Text>
                  {ownCampaigns.map((c) => (
                    <CampaignRow
                      key={c.id}
                      campaign={c}
                      isSuperuser={isSuperuser}
                      onEdit={goEdit}
                      onDelete={remove}
                      onPublish={handlePublish}
                      onPause={handlePause}
                      onResume={handleResume}
                      actionLoading={actionLoading}
                    />
                  ))}
                </BlockStack>
              </Card>
            )}

            {isSuperuser &&
              otherSellers.map((sid) => {
                const sellerCamps = campaigns.filter((c) => c.seller_id === sid);
                if (!sellerCamps.length) return null;
                return (
                  <Card key={sid}>
                    <BlockStack gap="0">
                      <Text as="h2" variant="headingMd" tone="subdued">
                        Verkäufer: {sid} ({sellerCamps.length})
                      </Text>
                      {sellerCamps.map((c) => (
                        <CampaignRow
                          key={c.id}
                          campaign={c}
                          isSuperuser={isSuperuser}
                          onEdit={goEdit}
                          onDelete={remove}
                          onPublish={handlePublish}
                          onPause={handlePause}
                          onResume={handleResume}
                          actionLoading={actionLoading}
                        />
                      ))}
                    </BlockStack>
                  </Card>
                );
              })}
          </>
        )}
      </BlockStack>
    </Page>
  );
}
