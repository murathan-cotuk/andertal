"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  Select,
} from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import {
import { confirmDelete } from "@/lib/confirm-delete";
  PLATFORM_OPTIONS,
  fmtBudget,
  fmtDate,
  AD_STATUS_TONE,
  AD_STATUS_LABEL,
  CAMPAIGN_STATUS_TONE,
  CAMPAIGN_STATUS_LABEL,
  getActivePlatformLabels,
  parseJsonIdArray,
} from "@/components/pages/marketing/ppcCampaignShared";

function buildGoogleAdsUrl(customerId, externalIds) {
  const base = "https://ads.google.com/aw/campaigns";
  const cid = (customerId || "").replace(/-/g, "");
  const ids = externalIds || {};
  const gadsKey = Object.keys(ids).find((k) => k.startsWith("gads_"));
  const campaignId = gadsKey ? gadsKey.replace("gads_", "") : null;
  if (cid && campaignId) return `${base}?__c=${cid}&campaignId=${campaignId}`;
  if (cid) return `${base}?__c=${cid}`;
  return base;
}

function CampaignRow({ campaign, isSuperuser, onEdit, onDelete, onPublish, onPause, onResume, actionLoading, googleAdsCustomerId }) {
  const adStatus = campaign.ad_status || "draft";
  const customerStatus = campaign.status || "draft";
  const platforms = parseJsonIdArray(campaign.ad_platforms);
  const budget = fmtBudget(campaign.budget_daily_cents);

  const hasGoogleAds = platforms.includes("google_ads");
  const externalIds = (() => { try { return typeof campaign.external_campaign_ids === "string" ? JSON.parse(campaign.external_campaign_ids) : (campaign.external_campaign_ids || {}); } catch { return {}; } })();
  const activePlatformLabels = getActivePlatformLabels(externalIds);

  // Superuser-only "my action status" badge text:
  //   - pending (campaign just arrived, not yet published)
  //   - "Aktiv auf: Meta, Google Ads, ..." (after publish)
  //   - "Pausiert" (after pause)
  let myStatusLabel = AD_STATUS_LABEL[adStatus] || adStatus;
  let myStatusTone = AD_STATUS_TONE[adStatus] || "info";
  if ((adStatus === "published" || adStatus === "partial") && activePlatformLabels.length > 0) {
    myStatusLabel = `Aktiv auf: ${activePlatformLabels.join(", ")}`;
    myStatusTone = adStatus === "partial" ? "attention" : "success";
  }

  return (
    <div style={{ borderTop: "1px solid #f1f2f4", padding: "14px 0" }}>
      <InlineStack align="space-between" blockAlign="start" wrap={false}>
        <BlockStack gap="100" inlineSize="grow">
          <InlineStack gap="200" blockAlign="center" wrap>
            <Text as="span" fontWeight="semibold">{campaign.name}</Text>
            <Badge tone={CAMPAIGN_STATUS_TONE[customerStatus] || "info"}>
              {CAMPAIGN_STATUS_LABEL[customerStatus] || customerStatus}
            </Badge>
            {isSuperuser && (
              <Badge tone={myStatusTone}>{myStatusLabel}</Badge>
            )}
          </InlineStack>
          {campaign.description && (
            <Text tone="subdued" as="span" variant="bodySm">{campaign.description}</Text>
          )}
          <Text tone="subdued" as="span" variant="bodySm">
            Budget: {budget}
            {campaign.created_at ? ` · Erstellt: ${fmtDate(campaign.created_at)}` : ""}
            {!isSuperuser ? " · Fokus: Sichtbarkeit & Sponsored im Shop" : ""}
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
          {isSuperuser && hasGoogleAds && (
            <Button
              size="slim"
              url={buildGoogleAdsUrl(googleAdsCustomerId, externalIds)}
              external
            >
              Google Ads
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
  const [sellersMap, setSellersMap] = useState({});
  const [sortBy, setSortBy] = useState("created_desc");

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

  // Superuser: load sellers to map seller_id → display name
  useEffect(() => {
    if (!isSuperuser) return;
    (async () => {
      try {
        const d = await getMedusaAdminClient().getSellers();
        const list = Array.isArray(d?.sellers) ? d.sellers : [];
        const map = {};
        for (const s of list) {
          if (!s?.seller_id) continue;
          const displayName =
            (s.store_name && String(s.store_name).trim()) ||
            (s.company_name && String(s.company_name).trim()) ||
            [s.first_name, s.last_name].filter(Boolean).join(" ").trim() ||
            s.email ||
            s.seller_id;
          map[s.seller_id] = displayName;
        }
        setSellersMap(map);
      } catch {
        setSellersMap({});
      }
    })();
  }, [isSuperuser]);

  const sellerDisplayName = useCallback(
    (sid) => sellersMap[sid] || sid || "—",
    [sellersMap],
  );

  const sortCampaigns = useCallback(
    (arr) => {
      const list = [...arr];
      switch (sortBy) {
        case "created_asc":
          list.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
          break;
        case "name_asc":
          list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
          break;
        case "name_desc":
          list.sort((a, b) => (b.name || "").localeCompare(a.name || "", "de"));
          break;
        case "seller_asc":
          list.sort((a, b) =>
            sellerDisplayName(a.seller_id).localeCompare(sellerDisplayName(b.seller_id), "de"),
          );
          break;
        case "created_desc":
        default:
          list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      }
      return list;
    },
    [sortBy, sellerDisplayName],
  );

  const goEdit = (c) => {
    router.push(`/marketing/campaigns/${c.id}`);
  };

  const remove = async (id) => {
    if (!(await confirmDelete("Kampagne wirklich löschen?"))) return;
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
      const errDetail = r?.errors?.length ? ` Fehler: ${r.errors.map(e => `${e.platform}: ${e.error}`).join(" | ")}` : "";
      if (r?.warning) {
        setMsg({ tone: "warning", text: r.warning + errDetail });
      } else if (count > 0) {
        setMsg({ tone: "success", text: `Kampagne auf ${count} Plattform(en) veröffentlicht.${budgetPerPlatform ? ` Budget je Plattform: ${budgetPerPlatform}/Tag.` : ""}${errDetail}` });
      } else {
        setMsg({ tone: "warning", text: `Kampagne intern aktiviert, externe Plattformen fehlgeschlagen.${errDetail}` });
      }
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

  const ownCampaigns = useMemo(
    () => sortCampaigns(campaigns.filter((c) => c.seller_id === sellerId)),
    [campaigns, sellerId, sortCampaigns],
  );

  const otherSellers = useMemo(() => {
    if (!isSuperuser) return [];
    const ids = [...new Set(campaigns.filter((c) => c.seller_id !== sellerId).map((c) => c.seller_id))];
    if (sortBy === "seller_asc" || sortBy === "name_asc" || sortBy === "name_desc") {
      ids.sort((a, b) => sellerDisplayName(a).localeCompare(sellerDisplayName(b), "de"));
    } else if (sortBy === "created_asc" || sortBy === "created_desc") {
      // Sort seller groups by the most recent (or oldest) campaign in each group
      const newestPerSeller = new Map();
      for (const c of campaigns) {
        if (c.seller_id === sellerId) continue;
        const ts = new Date(c.created_at || 0).getTime();
        const cur = newestPerSeller.get(c.seller_id);
        if (cur == null || ts > cur) newestPerSeller.set(c.seller_id, ts);
      }
      ids.sort((a, b) => {
        const diff = (newestPerSeller.get(b) || 0) - (newestPerSeller.get(a) || 0);
        return sortBy === "created_asc" ? -diff : diff;
      });
    }
    return ids;
  }, [isSuperuser, campaigns, sellerId, sortBy, sellerDisplayName]);

  const [connectedPlatforms, setConnectedPlatforms] = useState([]);
  const [googleAdsCustomerId, setGoogleAdsCustomerId] = useState("");

  useEffect(() => {
    if (!isSuperuser) return;
    (async () => {
      try {
        const d = await getMedusaAdminClient().getMarketingAccounts();
        const active = (d?.accounts || []).filter((a) => a.is_active && Object.keys(a.credentials || {}).some((k) => a.credentials[k]));
        setConnectedPlatforms(active.map((a) => a.platform));
        const gads = (d?.accounts || []).find((a) => a.platform === "google_ads");
        if (gads?.credentials?.customer_id) setGoogleAdsCustomerId(gads.credentials.customer_id);
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

        {!loading && campaigns.length > 0 && (
          <Card>
            <InlineStack gap="200" blockAlign="center" wrap>
              <Text as="span" variant="bodySm" tone="subdued">Sortieren:</Text>
              <div style={{ minWidth: 220 }}>
                <Select
                  label=""
                  labelHidden
                  options={[
                    { value: "created_desc", label: "Neueste zuerst" },
                    { value: "created_asc", label: "Älteste zuerst" },
                    { value: "name_asc", label: "Name A → Z" },
                    { value: "name_desc", label: "Name Z → A" },
                    ...(isSuperuser ? [{ value: "seller_asc", label: "Verkäufer A → Z" }] : []),
                  ]}
                  value={sortBy}
                  onChange={setSortBy}
                />
              </div>
            </InlineStack>
          </Card>
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
                      googleAdsCustomerId={googleAdsCustomerId}
                    />
                  ))}
                </BlockStack>
              </Card>
            )}

            {isSuperuser &&
              otherSellers.map((sid) => {
                const sellerCamps = sortCampaigns(campaigns.filter((c) => c.seller_id === sid));
                if (!sellerCamps.length) return null;
                return (
                  <Card key={sid}>
                    <BlockStack gap="0">
                      <Text as="h2" variant="headingMd" tone="subdued">
                        Verkäufer: {sellerDisplayName(sid)} ({sellerCamps.length})
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
                          googleAdsCustomerId={googleAdsCustomerId}
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
