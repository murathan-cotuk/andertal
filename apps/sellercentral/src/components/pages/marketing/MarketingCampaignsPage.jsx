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
import { confirmDelete } from "@/lib/confirm-delete";
import {
  PLATFORM_OPTIONS,
  adStatusLabelForLocale,
  campaignStatusLabelForLocale,
  fmtBudget,
  fmtDate,
  AD_STATUS_TONE,
  CAMPAIGN_STATUS_TONE,
  getActivePlatformLabels,
  parseJsonIdArray,
} from "@/components/pages/marketing/ppcCampaignShared";
import { useLocale } from "next-intl";
import { getMarketingPpcEditorCopy } from "@/lib/marketing-i18n";
import { getUI } from "@/lib/ui-strings";

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

function CampaignRow({ campaign, isSuperuser, onEdit, onDelete, onPublish, onPause, onResume, actionLoading, googleAdsCustomerId, locale, ui, mc }) {
  const adStatus = campaign.ad_status || "draft";
  const customerStatus = campaign.status || "draft";
  const platforms = parseJsonIdArray(campaign.ad_platforms);
  const budget = fmtBudget(campaign.budget_daily_cents, locale);

  const hasGoogleAds = platforms.includes("google_ads");
  const externalIds = (() => { try { return typeof campaign.external_campaign_ids === "string" ? JSON.parse(campaign.external_campaign_ids) : (campaign.external_campaign_ids || {}); } catch { return {}; } })();
  const activePlatformLabels = getActivePlatformLabels(externalIds);

  let myStatusLabel = adStatusLabelForLocale(locale, adStatus) || adStatus;
  let myStatusTone = AD_STATUS_TONE[adStatus] || "info";
  if ((adStatus === "published" || adStatus === "partial") && activePlatformLabels.length > 0) {
    myStatusLabel = `${mc.activeOn}: ${activePlatformLabels.join(", ")}`;
    myStatusTone = adStatus === "partial" ? "attention" : "success";
  }

  const createdLabel = mc.created;
  const focusLabel = mc.focusShop;

  return (
    <div style={{ borderTop: "1px solid #f1f2f4", padding: "14px 0" }}>
      <InlineStack align="space-between" blockAlign="start" wrap={false}>
        <BlockStack gap="100" inlineSize="grow">
          <InlineStack gap="200" blockAlign="center" wrap>
            <Text as="span" fontWeight="semibold">{campaign.name}</Text>
            <Badge tone={CAMPAIGN_STATUS_TONE[customerStatus] || "info"}>
              {campaignStatusLabelForLocale(locale, customerStatus) || customerStatus}
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
            {campaign.created_at ? ` · ${createdLabel}: ${fmtDate(campaign.created_at, locale)}` : ""}
            {!isSuperuser ? ` · ${focusLabel}` : ""}
            {campaign.start_at || campaign.end_at ? ` · ${fmtDate(campaign.start_at, locale)} – ${fmtDate(campaign.end_at, locale)}` : ""}
          </Text>
        </BlockStack>
        <InlineStack gap="200" wrap>
          {isSuperuser && adStatus === "draft" && (
            <Button size="slim" tone="success" onClick={() => onPublish(campaign.id)} loading={actionLoading === campaign.id + "_publish"}>
              {ui.publish}
            </Button>
          )}
          {isSuperuser && adStatus === "published" && (
            <Button size="slim" onClick={() => onPause(campaign.id)} loading={actionLoading === campaign.id + "_pause"}>
              {mc.pause}
            </Button>
          )}
          {isSuperuser && adStatus === "paused" && (
            <Button size="slim" tone="success" onClick={() => onResume(campaign.id)} loading={actionLoading === campaign.id + "_resume"}>
              {mc.resume}
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
          <Button size="slim" onClick={() => onEdit(campaign)}>{ui.edit}</Button>
          <Button size="slim" tone="critical" variant="plain" onClick={() => onDelete(campaign.id)}>{ui.delete}</Button>
        </InlineStack>
      </InlineStack>
    </div>
  );
}

export default function MarketingCampaignsPage() {
  const locale = useLocale();
  const ui = getUI(locale);
  const mc = useMemo(() => getMarketingPpcEditorCopy(locale), [locale]);
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
      setMsg({ tone: "critical", text: e?.message || (locale === "de" ? "Daten konnten nicht geladen werden." : locale === "tr" ? "Veriler yüklenemedi." : locale === "fr" ? "Impossible de charger les données." : locale === "es" ? "No se pudieron cargar los datos." : locale === "it" ? "Impossibile caricare i dati." : "Could not load data.") });
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
    if (!(await confirmDelete(locale === "de" ? "Kampagne wirklich löschen?" : locale === "tr" ? "Kampanya silinsin mi?" : locale === "fr" ? "Supprimer vraiment cette campagne ?" : locale === "es" ? "¿Eliminar realmente la campaña?" : locale === "it" ? "Eliminare davvero la campagna?" : "Really delete campaign?"))) return;
    try {
      await getMedusaAdminClient().deleteCampaign(id);
      setMsg({ tone: "success", text: locale === "de" ? "Kampagne gelöscht." : locale === "tr" ? "Kampanya silindi." : locale === "fr" ? "Campagne supprimée." : locale === "es" ? "Campaña eliminada." : locale === "it" ? "Campagna eliminata." : "Campaign deleted." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "de" ? "Fehler beim Löschen." : locale === "tr" ? "Silme hatası." : locale === "fr" ? "Erreur lors de la suppression." : locale === "es" ? "Error al eliminar." : locale === "it" ? "Errore durante l'eliminazione." : "Error deleting.") });
    }
  };

  const handlePublish = async (id) => {
    setActionLoading(id + "_publish");
    setMsg(null);
    try {
      const r = await getMedusaAdminClient().publishCampaign(id);
      const count = r?.platforms_published?.length || 0;
      const budgetPerPlatform = r?.budget_per_platform_cents ? `${(r.budget_per_platform_cents / 100).toFixed(2)} €` : "";
      const errDetail = r?.errors?.length ? ` ${locale === "de" ? "Fehler" : "Errors"}: ${r.errors.map(e => `${e.platform}: ${e.error}`).join(" | ")}` : "";
      if (r?.warning) {
        setMsg({ tone: "warning", text: r.warning + errDetail });
      } else if (count > 0) {
        const publishedText = locale === "de"
          ? `Kampagne auf ${count} Plattform(en) veröffentlicht.${budgetPerPlatform ? ` Budget je Plattform: ${budgetPerPlatform}/Tag.` : ""}`
          : locale === "tr"
          ? `Kampanya ${count} platform(lar)da yayınlandı.${budgetPerPlatform ? ` Platform başına bütçe: ${budgetPerPlatform}/gün.` : ""}`
          : locale === "fr"
          ? `Campagne publiée sur ${count} plateforme(s).${budgetPerPlatform ? ` Budget par plateforme: ${budgetPerPlatform}/jour.` : ""}`
          : locale === "es"
          ? `Campaña publicada en ${count} plataforma(s).${budgetPerPlatform ? ` Presupuesto por plataforma: ${budgetPerPlatform}/día.` : ""}`
          : locale === "it"
          ? `Campagna pubblicata su ${count} piattaforma/e.${budgetPerPlatform ? ` Budget per piattaforma: ${budgetPerPlatform}/giorno.` : ""}`
          : `Campaign published on ${count} platform(s).${budgetPerPlatform ? ` Budget per platform: ${budgetPerPlatform}/day.` : ""}`;
        setMsg({ tone: "success", text: publishedText + errDetail });
      } else {
        setMsg({ tone: "warning", text: (locale === "de" ? "Kampagne intern aktiviert, externe Plattformen fehlgeschlagen." : locale === "tr" ? "Kampanya dahili olarak etkinleştirildi, harici platformlar başarısız oldu." : locale === "fr" ? "Campagne activée en interne, échec des plateformes externes." : locale === "es" ? "Campaña activada internamente, fallaron las plataformas externas." : locale === "it" ? "Campagna attivata internamente, le piattaforme esterne hanno fallito." : "Campaign activated internally, external platforms failed.") + errDetail });
      }
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "de" ? "Fehler beim Veröffentlichen." : locale === "tr" ? "Yayınlama hatası." : locale === "fr" ? "Erreur lors de la publication." : locale === "es" ? "Error al publicar." : locale === "it" ? "Errore durante la pubblicazione." : "Error publishing.") });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (id) => {
    setActionLoading(id + "_pause");
    try {
      await getMedusaAdminClient().pauseCampaign(id);
      setMsg({ tone: "success", text: locale === "de" ? "Kampagne pausiert." : locale === "tr" ? "Kampanya duraklatıldı." : locale === "fr" ? "Campagne mise en pause." : locale === "es" ? "Campaña pausada." : locale === "it" ? "Campagna messa in pausa." : "Campaign paused." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "de" ? "Fehler beim Pausieren." : locale === "tr" ? "Duraklatma hatası." : locale === "fr" ? "Erreur lors de la mise en pause." : locale === "es" ? "Error al pausar." : locale === "it" ? "Errore durante la messa in pausa." : "Error pausing.") });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (id) => {
    setActionLoading(id + "_resume");
    try {
      await getMedusaAdminClient().resumeCampaign(id);
      setMsg({ tone: "success", text: locale === "de" ? "Kampagne fortgesetzt." : locale === "tr" ? "Kampanya devam ettiridi." : locale === "fr" ? "Campagne reprise." : locale === "es" ? "Campaña reanudada." : locale === "it" ? "Campagna ripresa." : "Campaign resumed." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "de" ? "Fehler beim Fortsetzen." : locale === "tr" ? "Devam ettirme hatası." : locale === "fr" ? "Erreur lors de la reprise." : locale === "es" ? "Error al reanudar." : locale === "it" ? "Errore durante la ripresa." : "Error resuming.") });
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

  const sortOptions = [
    { value: "created_desc", label: locale === "de" ? "Neueste zuerst" : locale === "tr" ? "En yeniler önce" : locale === "fr" ? "Les plus récents d'abord" : locale === "es" ? "Más recientes primero" : locale === "it" ? "Più recenti prima" : "Newest first" },
    { value: "created_asc", label: locale === "de" ? "Älteste zuerst" : locale === "tr" ? "En eskiler önce" : locale === "fr" ? "Les plus anciens d'abord" : locale === "es" ? "Más antiguos primero" : locale === "it" ? "Più vecchi prima" : "Oldest first" },
    { value: "name_asc", label: "Name A → Z" },
    { value: "name_desc", label: "Name Z → A" },
    ...(isSuperuser ? [{ value: "seller_asc", label: locale === "de" ? "Verkäufer A → Z" : locale === "tr" ? "Satıcı A → Z" : locale === "fr" ? "Vendeur A → Z" : locale === "es" ? "Vendedor A → Z" : locale === "it" ? "Venditore A → Z" : "Seller A → Z" }] : []),
  ];

  return (
    <Page
      title={locale === "de" ? "Marketing-Kampagnen" : locale === "tr" ? "Pazarlama Kampanyaları" : locale === "fr" ? "Campagnes marketing" : locale === "es" ? "Campañas de marketing" : locale === "it" ? "Campagne di marketing" : "Marketing Campaigns"}
      subtitle={
        isSuperuser
          ? (locale === "de" ? "Übersicht: Shop-Promotion & externe Ausspielung (Admin)" : locale === "tr" ? "Genel bakış: Mağaza promosyonu & harici yayın (Admin)" : locale === "fr" ? "Vue d'ensemble : Promotion boutique & diffusion externe (Admin)" : locale === "es" ? "Resumen: Promoción de tienda & distribución externa (Admin)" : locale === "it" ? "Panoramica: Promozione negozio & distribuzione esterna (Admin)" : "Overview: Shop promotion & external distribution (Admin)")
          : (locale === "de" ? "Mehr Sichtbarkeit im Shop — Sponsored, Ranking und Reichweite über das Marketplace-Team" : locale === "tr" ? "Mağazada daha fazla görünürlük — Pazaryeri ekibi aracılığıyla sponsorlu, sıralama ve erişim" : locale === "fr" ? "Plus de visibilité dans la boutique — Sponsorisé, classement et portée via l'équipe marketplace" : locale === "es" ? "Más visibilidad en la tienda — Patrocinado, clasificación y alcance a través del equipo del marketplace" : locale === "it" ? "Più visibilità nel negozio — Sponsorizzato, ranking e portata tramite il team marketplace" : "More visibility in the shop — Sponsored, ranking and reach via the marketplace team")
      }
      primaryAction={{ content: locale === "de" ? "Neue Kampagne" : locale === "tr" ? "Yeni Kampanya" : locale === "fr" ? "Nouvelle campagne" : locale === "es" ? "Nueva campaña" : locale === "it" ? "Nuova campagna" : "New campaign", onAction: () => router.push("/marketing/campaigns/new") }}
    >
      <BlockStack gap="400">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Banner>
        )}

        {isSuperuser && connectedPlatforms.length === 0 && (
          <Banner tone="warning">
            {locale === "de"
              ? <span>Keine Marketing-Konten verbunden. Gehe zu <strong>Apps & Integrationen</strong> um Werbekonten (Meta, Google Ads, etc.) zu verbinden.</span>
              : locale === "tr"
              ? <span>Bağlı pazarlama hesabı yok. Reklam hesaplarını (Meta, Google Ads, vb.) bağlamak için <strong>Uygulamalar & Entegrasyonlar</strong>'a git.</span>
              : locale === "fr"
              ? <span>Aucun compte marketing connecté. Allez dans <strong>Applications & Intégrations</strong> pour connecter des comptes publicitaires (Meta, Google Ads, etc.).</span>
              : locale === "es"
              ? <span>Sin cuentas de marketing conectadas. Ve a <strong>Aplicaciones e integraciones</strong> para conectar cuentas publicitarias (Meta, Google Ads, etc.).</span>
              : locale === "it"
              ? <span>Nessun account marketing collegato. Vai su <strong>App e integrazioni</strong> per collegare account pubblicitari (Meta, Google Ads, ecc.).</span>
              : <span>No marketing accounts connected. Go to <strong>Apps & Integrations</strong> to connect ad accounts (Meta, Google Ads, etc.).</span>}
          </Banner>
        )}

        {!loading && campaigns.length > 0 && (
          <Card>
            <InlineStack gap="200" blockAlign="center" wrap>
              <Text as="span" variant="bodySm" tone="subdued">{locale === "de" ? "Sortieren:" : locale === "tr" ? "Sırala:" : locale === "fr" ? "Trier :" : locale === "es" ? "Ordenar:" : locale === "it" ? "Ordina:" : "Sort:"}</Text>
              <div style={{ minWidth: 220 }}>
                <Select
                  label=""
                  labelHidden
                  options={sortOptions}
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
            <EmptyState heading={locale === "de" ? "Noch keine Shop-Kampagnen" : locale === "tr" ? "Henüz mağaza kampanyası yok" : locale === "fr" ? "Pas encore de campagnes boutique" : locale === "es" ? "Sin campañas de tienda aún" : locale === "it" ? "Nessuna campagna negozio ancora" : "No shop campaigns yet"} image="">
              <p>
                {locale === "de"
                  ? "Lege eine Promotion an — im Shop erscheint sie als effektive, gesponserte Darstellung mit erhöhter Sichtbarkeit. Die Aussteuerung außerhalb des Shops übernimmt das Marketplace-Team im Hintergrund."
                  : locale === "tr"
                  ? "Bir promosyon oluştur — mağazada artan görünürlükle etkili, sponsorlu bir sunum olarak görünür. Mağaza dışındaki dağıtımı Marketplace ekibi arka planda yönetir."
                  : locale === "fr"
                  ? "Créez une promotion — elle apparaît dans la boutique comme une présentation sponsorisée efficace avec une visibilité accrue. La diffusion hors boutique est gérée par l'équipe Marketplace en arrière-plan."
                  : locale === "es"
                  ? "Crea una promoción — aparece en la tienda como una presentación patrocinada efectiva con mayor visibilidad. El equipo de Marketplace gestiona la distribución fuera de la tienda en segundo plano."
                  : locale === "it"
                  ? "Crea una promozione — appare nel negozio come una presentazione sponsorizzata efficace con maggiore visibilità. Il team Marketplace gestisce la distribuzione fuori dal negozio in background."
                  : "Create a promotion — it appears in the shop as an effective sponsored presentation with increased visibility. The Marketplace team handles distribution outside the shop in the background."}
              </p>
              <div style={{ marginTop: 16 }}>
                <Button variant="primary" onClick={() => router.push("/marketing/campaigns/new")}>
                  {locale === "de" ? "Neue Kampagne" : locale === "tr" ? "Yeni Kampanya" : locale === "fr" ? "Nouvelle campagne" : locale === "es" ? "Nueva campaña" : locale === "it" ? "Nuova campagna" : "New campaign"}
                </Button>
              </div>
            </EmptyState>
          </Card>
        ) : (
          <>
            {ownCampaigns.length > 0 && (
              <Card>
                <BlockStack gap="0">
                  <Text as="h2" variant="headingMd">
                    {isSuperuser
                      ? (locale === "de" ? "Eigene Kampagnen" : locale === "tr" ? "Kendi Kampanyalarım" : locale === "fr" ? "Mes propres campagnes" : locale === "es" ? "Mis propias campañas" : locale === "it" ? "Le mie campagne" : "My own campaigns")
                      : (locale === "de" ? "Meine Kampagnen" : locale === "tr" ? "Kampanyalarım" : locale === "fr" ? "Mes campagnes" : locale === "es" ? "Mis campañas" : locale === "it" ? "Le mie campagne" : "My campaigns")} ({ownCampaigns.length})
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
                      locale={locale}
                      ui={ui}
                      mc={mc}
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
                        {locale === "de" ? "Verkäufer" : locale === "tr" ? "Satıcı" : locale === "fr" ? "Vendeur" : locale === "es" ? "Vendedor" : locale === "it" ? "Venditore" : "Seller"}: {sellerDisplayName(sid)} ({sellerCamps.length})
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
                          locale={locale}
                          ui={ui}
                          mc={mc}
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
