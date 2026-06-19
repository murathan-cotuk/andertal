"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Button,
  Banner,
  Spinner,
  Badge,
  Divider,
  ProgressBar,
} from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import CustomCheckbox from "@/components/ui/CustomCheckbox";
import {
  PLATFORM_OPTIONS,
  BID_OPTIONS,
  CAMPAIGN_LOCALES,
  GEO_TARGET_OPTIONS,
  LANGUAGE_TARGET_OPTIONS,
  parseCampaignToForm,
  mergeCampaignSettings,
  fmtBudget,
} from "@/components/pages/marketing/ppcCampaignShared";
import { resolveImageUrl } from "@/lib/image-url";
import { useLocale } from "next-intl";
import { getMarketingPpcEditorCopy, getAudienceOptions, shopGoalOptionsForLocale, targetOptionsForLocale } from "@/lib/marketing-i18n";

const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
const VIDEO_MAX_BYTES = 120 * 1024 * 1024;
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const shell = {
  pageBg: "#f4f6fb",
  heroGradient: "linear-gradient(135deg, #0b1220 0%, #151f35 42%, #251e45 72%, #312066 100%)",
  heroGlow: "radial-gradient(ellipse 80% 60% at 70% 20%, rgba(99, 102, 241, 0.35), transparent 55%)",
  cardRadius: 18,
  cardShadow: "0 4px 24px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04)",
  accent: "#6366f1",
  accentSoft: "rgba(99, 102, 241, 0.12)",
  border: "1px solid rgba(226, 232, 240, 0.95)",
};

function StepHeader({ step, title, subtitle }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
      <div
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 12,
          background: shell.accentSoft,
          border: `1px solid rgba(99, 102, 241, 0.25)`,
          color: "#4338ca",
          fontWeight: 800,
          fontSize: 15,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {step}
      </div>
      <div style={{ minWidth: 0 }}>
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        {subtitle ? (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.45, maxWidth: 560 }}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ShopPreviewMock({ mc, name, budgetEuro, goalLabel, targetType, productCount, highlightVideoUrl }) {
  const shopClip = highlightVideoUrl ? resolveImageUrl(highlightVideoUrl) : "";
  return (
    <div
      style={{
        borderRadius: shell.cardRadius,
        border: shell.border,
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        boxShadow: shell.cardShadow,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#64748b", textTransform: "uppercase" }}>
          {mc.liveShopPreview}
        </span>
      </div>
      <div style={{ padding: 18 }}>
        {shopClip ? (
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 14,
              aspectRatio: "16/9",
              background: "#0f172a",
              border: "1px solid #e2e8f0",
            }}
          >
            <video key={shopClip} src={shopClip} controls muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ) : null}
        <div
          style={{
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            padding: 14,
            background: "#fff",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 10,
              background: "linear-gradient(145deg, #e0e7ff, #fae8ff)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 650, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name || mc.yourCampaign}
            </div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #fef3c7, #fde68a)",
                  color: "#92400e",
                  border: "1px solid #fcd34d",
                }}
              >
                {mc.sponsored}
              </span>
              <span style={{ fontSize: 11, color: "#64748b" }}>{goalLabel}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>{mc.dailyBudget}</span>
            <strong style={{ color: "#0f172a" }}>{budgetEuro ? `${budgetEuro} €` : "—"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{mc.targetAudience}</span>
            <strong style={{ color: "#0f172a" }}>
              {targetType === "all" ? mc.allItems : targetType === "groups" ? mc.groups : mc.productCount(productCount)}
            </strong>
          </div>
          <div style={{ marginTop: 12 }}>
            <ProgressBar progress={budgetEuro ? 72 : 24} tone="primary" size="small" />
            <span style={{ fontSize: 10, marginTop: 6, display: "block", color: "#94a3b8" }}>
              {mc.visibilityHint}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignVideoSlot({
  mc,
  title,
  badge,
  roleLine,
  specsLine,
  aspectMode,
  url,
  uploading,
  onSelectFile,
  onClear,
}) {
  const inputRef = useRef(null);
  const resolved = url ? resolveImageUrl(url) : "";
  const wide = aspectMode === "169";

  return (
    <div
      style={{
        borderRadius: 18,
        border: shell.border,
        padding: 20,
        background: "linear-gradient(165deg, #fafbff 0%, #ffffff 52%, #f8fafc 100%)",
        boxShadow: shell.cardShadow,
        height: "100%",
      }}
    >
      <InlineStack align="space-between" blockAlign="start" wrap>
        <BlockStack gap="100">
          <Text as="span" variant="headingSm">{title}</Text>
          <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{roleLine}</p>
          <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", lineHeight: 1.45 }}>{specsLine}</p>
        </BlockStack>
        <Badge tone="attention">{badge}</Badge>
      </InlineStack>

      <div
        style={{
          marginTop: 16,
          width: "100%",
          ...(wide ? { aspectRatio: "16/9" } : { aspectRatio: "9/16", maxWidth: 240, marginLeft: "auto", marginRight: "auto" }),
          borderRadius: 14,
          overflow: "hidden",
          background: "linear-gradient(145deg, #0f172a 0%, #1e293b 55%, #312e81 120%)",
          border: "1px solid rgba(148, 163, 184, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: wide ? 168 : 320,
        }}
      >
        {resolved ? (
          <video
            key={resolved}
            src={resolved}
            controls
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: wide ? "contain" : "cover",
              display: "block",
              maxHeight: wide ? 320 : 420,
            }}
          />
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            style={{
              width: "100%",
              height: "100%",
              minHeight: wide ? 168 : 320,
              border: "none",
              background: "transparent",
              cursor: uploading ? "wait" : "pointer",
              color: "rgba(248,250,252,0.92)",
              fontSize: 14,
              fontWeight: 650,
              padding: 16,
            }}
          >
            {uploading ? mc.uploading : mc.addVideo}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelectFile(f);
          e.target.value = "";
        }}
      />

      <InlineStack gap="300" wrap blockAlign="center">
        <div style={{ marginTop: 14 }}>
          <Button size="slim" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {resolved ? mc.replaceVideo : mc.chooseFile}
          </Button>
        </div>
        {resolved ? (
          <div style={{ marginTop: 14 }}>
            <Button size="slim" tone="critical" variant="plain" disabled={uploading} onClick={onClear}>
              {mc.remove}
            </Button>
          </div>
        ) : null}
      </InlineStack>
    </div>
  );
}

function CampaignImageSlot({ mc, url, uploading, onSelectFile, onClear }) {
  const inputRef = useRef(null);
  const resolved = url ? resolveImageUrl(url) : "";

  return (
    <div style={{ borderRadius: 18, border: shell.border, padding: 20, background: "linear-gradient(165deg, #fafbff 0%, #ffffff 52%, #f8fafc 100%)", boxShadow: shell.cardShadow }}>
      <InlineStack align="space-between" blockAlign="start" wrap>
        <BlockStack gap="100">
          <Text as="span" variant="headingSm">{mc.campaignImage}</Text>
          <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{mc.imageRoleLine}</p>
          <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>{mc.imageSpecsLine}</p>
        </BlockStack>
        <Badge tone="info">{mc.imageBadge}</Badge>
      </InlineStack>

      <div style={{ marginTop: 16, width: "100%", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "linear-gradient(145deg, #0f172a 0%, #1e293b 55%, #312e81 120%)", border: "1px solid rgba(148,163,184,0.35)", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 168 }}>
        {resolved ? (
          <img src={resolved} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", maxHeight: 320 }} />
        ) : (
          <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} style={{ width: "100%", height: "100%", minHeight: 168, border: "none", background: "transparent", cursor: uploading ? "wait" : "pointer", color: "rgba(248,250,252,0.92)", fontSize: 14, fontWeight: 650, padding: 16 }}>
            {uploading ? mc.uploading : mc.addImage}
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept={IMAGE_ACCEPT} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelectFile(f); e.target.value = ""; }} />

      <InlineStack gap="300" wrap blockAlign="center">
        <div style={{ marginTop: 14 }}>
          <Button size="slim" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {resolved ? mc.replaceImage : mc.chooseFile}
          </Button>
        </div>
        {resolved ? (
          <div style={{ marginTop: 14 }}>
            <Button size="slim" tone="critical" variant="plain" disabled={uploading} onClick={onClear}>{mc.remove}</Button>
          </div>
        ) : null}
      </InlineStack>
    </div>
  );
}

function LocaleContentEditor({ mc, localeContent, onChange }) {
  const [activeLocale, setActiveLocale] = useState("de");
  const current = localeContent[activeLocale] || { name: "", description: "" };

  const setLocaleField = (field, value) => {
    onChange({ ...localeContent, [activeLocale]: { ...current, [field]: value } });
  };

  return (
    <BlockStack gap="300">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {CAMPAIGN_LOCALES.map((loc) => {
          const hasContent = localeContent[loc.code]?.name || localeContent[loc.code]?.description;
          return (
            <button
              key={loc.code}
              type="button"
              onClick={() => setActiveLocale(loc.code)}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${activeLocale === loc.code ? shell.accent : "#e2e8f0"}`,
                background: activeLocale === loc.code ? shell.accentSoft : "#fff",
                color: activeLocale === loc.code ? "#4338ca" : (hasContent ? "#334155" : "#94a3b8"),
              }}
            >
              {loc.label}{hasContent ? " ✓" : ""}
            </button>
          );
        })}
      </div>
      <TextField
        label={mc.campaignNameLocale(CAMPAIGN_LOCALES.find(l => l.code === activeLocale)?.label)}
        value={current.name}
        onChange={(v) => setLocaleField("name", v)}
        placeholder={mc.campaignNamePlaceholder}
        autoComplete="off"
      />
      <TextField
        label={mc.descriptionLocale(CAMPAIGN_LOCALES.find(l => l.code === activeLocale)?.label)}
        value={current.description}
        onChange={(v) => setLocaleField("description", v)}
        placeholder={mc.descriptionPlaceholder}
        multiline={3}
        autoComplete="off"
      />
    </BlockStack>
  );
}

export default function MarketingPpcCampaignEditorPage({ campaignId }) {
  const router = useRouter();
  const locale = useLocale();
  const mc = useMemo(() => getMarketingPpcEditorCopy(locale), [locale]);
  const shopGoals = useMemo(() => shopGoalOptionsForLocale(locale), [locale]);
  const targetOptions = useMemo(() => targetOptionsForLocale(locale), [locale]);
  const audienceOptions = useMemo(() => getAudienceOptions(locale), [locale]);
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [connectedPlatforms, setConnectedPlatforms] = useState([]);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [loadedCampaign, setLoadedCampaign] = useState(null);
  const [form, setForm] = useState(() => parseCampaignToForm({}));
  const [productSearch, setProductSearch] = useState("");
  const [videoUploadSlot, setVideoUploadSlot] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
    }
  }, []);

  useEffect(() => {
    const payment = searchParams?.get("payment");
    if (payment === "success") {
      setMsg({ tone: "success", text: mc.paymentSuccess });
    } else if (payment === "cancelled") {
      setMsg({ tone: "warning", text: mc.paymentCancelled });
    }
  }, [searchParams, mc.paymentSuccess, mc.paymentCancelled]);

  const loadConnectedPlatforms = useCallback(async () => {
    if (!isSuperuser) return;
    try {
      const client = getMedusaAdminClient();
      const d = await client.getMarketingAccounts();
      const active = (d?.accounts || []).filter((a) => a.is_active && Object.keys(a.credentials || {}).some((k) => a.credentials[k]));
      setConnectedPlatforms(active.map((a) => a.platform));
    } catch {
      setConnectedPlatforms([]);
    }
  }, [isSuperuser]);

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setMsg(null);
    try {
      const client = getMedusaAdminClient();
      const [campRes, gRes, pRes] = await Promise.all([
        client.getCampaign(campaignId),
        client.getProductGroups(),
        client.getAdminHubProducts({ limit: 500 }),
      ]);
      const c = campRes?.campaign;
      if (!c) {
        setMsg({ tone: "critical", text: mc.campaignNotFound });
        setLoadedCampaign(null);
        setForm(parseCampaignToForm({}));
        return;
      }
      if (String(c.campaign_type || "").toLowerCase() !== "ppc" && !(c.budget_daily_cents > 0)) {
        setMsg({ tone: "warning", text: mc.notAdCampaign });
      }
      setLoadedCampaign(c);
      setForm(parseCampaignToForm(c));
      setGroups(Array.isArray(gRes?.groups) ? gRes.groups : []);
      setProducts(Array.isArray(pRes?.products) ? pRes.products : []);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || mc.loadError });
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadConnectedPlatforms();
  }, [loadConnectedPlatforms]);

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const togglePlatform = (val) => {
    setForm((prev) => {
      const set = new Set(prev.ad_platforms);
      if (set.has(val)) set.delete(val); else set.add(val);
      return { ...prev, ad_platforms: Array.from(set) };
    });
  };

  const toggleProduct = (id) => {
    setForm((prev) => {
      const ids = new Set(prev.product_ids);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { ...prev, product_ids: Array.from(ids) };
    });
  };

  const toggleVariant = (variantId) => {
    setForm((prev) => {
      const ids = new Set(prev.variant_ids || []);
      if (ids.has(variantId)) ids.delete(variantId); else ids.add(variantId);
      return { ...prev, variant_ids: Array.from(ids) };
    });
  };

  const toggleGroup = (id) => {
    setForm((prev) => {
      const ids = new Set(prev.group_ids);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { ...prev, group_ids: Array.from(ids) };
    });
  };

  const goalLabel = useMemo(() => {
    const g = shopGoals.find((o) => o.value === form.seller_shop_goal);
    return g?.label || shopGoals[0].label;
  }, [form.seller_shop_goal, shopGoals]);

  const keywords = useMemo(
    () => (form.seller_creative_note ? form.seller_creative_note.split(",").map((k) => k.trim()).filter(Boolean) : []),
    [form.seller_creative_note],
  );
  const addKeyword = (kw) => {
    const trimmed = kw.trim();
    if (!trimmed || keywords.includes(trimmed)) return;
    setField("seller_creative_note", [...keywords, trimmed].join(", "));
  };
  const removeKeyword = (kw) => {
    setField("seller_creative_note", keywords.filter((k) => k !== kw).join(", "));
  };

  const selectedAudiences = useMemo(
    () => (form.seller_audience_note ? form.seller_audience_note.split(",").map((k) => k.trim()).filter(Boolean) : []),
    [form.seller_audience_note],
  );
  const toggleAudience = (aud) => {
    if (selectedAudiences.includes(aud)) {
      setField("seller_audience_note", selectedAudiences.filter((a) => a !== aud).join(", "));
    } else {
      setField("seller_audience_note", [...selectedAudiences, aud].join(", "));
    }
  };

  const uploadCampaignVideo = async (slot, file) => {
    const okMime = ["video/mp4", "video/webm", "video/quicktime"].includes(file.type || "");
    const okExt = /\.(mp4|webm|mov)$/i.test(file.name || "");
    if (!okMime && !okExt) {
      setMsg({ tone: "warning", text: mc.videoFormatError });
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      setMsg({ tone: "warning", text: mc.videoSizeError });
      return;
    }
    setVideoUploadSlot(slot);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await getMedusaAdminClient().uploadMedia(fd, { purpose: "campaign_video" });
      const u = r?.url;
      if (!u) throw new Error(mc.noUrlReturned);
      if (slot === "shop") setField("seller_video_shop_url", u);
      else setField("seller_video_reels_url", u);
      setMsg({ tone: "success", text: mc.videoUploaded });
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || mc.uploadFailed });
    } finally {
      setVideoUploadSlot(null);
    }
  };

  const uploadCampaignImage = async (file) => {
    const okMime = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type || "");
    const okExt = /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name || "");
    if (!okMime && !okExt) {
      setMsg({ tone: "warning", text: mc.imageFormatError });
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setMsg({ tone: "warning", text: mc.imageSizeError });
      return;
    }
    setImageUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await getMedusaAdminClient().uploadMedia(fd, { purpose: "campaign_image" });
      const u = r?.url;
      if (!u) throw new Error(mc.noUrlReturned);
      setField("seller_image_url", u);
      setMsg({ tone: "success", text: mc.imageUploaded });
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || mc.uploadFailed });
    } finally {
      setImageUploading(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      setMsg({ tone: "warning", text: mc.nameRequired });
      return;
    }
    const budgetEuro = parseFloat(form.budget_daily_cents);
    if (!form.budget_daily_cents || Number.isNaN(budgetEuro) || budgetEuro <= 0) {
      setMsg({ tone: "warning", text: mc.budgetRequired });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const client = getMedusaAdminClient();
      const settingsMerged = mergeCampaignSettings(loadedCampaign?.settings, {
        seller_shop_goal: form.seller_shop_goal,
        seller_audience_note: form.seller_audience_note,
        seller_creative_note: form.seller_creative_note,
        seller_video_shop_url: form.seller_video_shop_url || "",
        seller_video_reels_url: form.seller_video_reels_url || "",
        seller_image_url: form.seller_image_url || "",
        locale_content: form.locale_content || {},
        gads_headlines: form.gads_headlines || [],
        gads_descriptions: form.gads_descriptions || [],
        gads_keywords: form.gads_keywords || [],
        gads_final_url: form.gads_final_url || "",
        gads_geo_targets: form.gads_geo_targets || ["2276"],
        gads_target_language: form.gads_target_language || "1001",
        gads_cpc_bid_cents: form.gads_cpc_bid_cents ?? 50,
      });

      const basePayload = {
        name: form.name.trim(),
        description: form.description,
        target_type: form.target_type,
        product_ids: form.product_ids,
        group_ids: form.group_ids,
        variant_ids: form.variant_ids || [],
        budget_daily_cents: Math.round(budgetEuro * 100),
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        campaign_type: "ppc",
        discount_type: "percentage",
        discount_value: 0,
        settings: settingsMerged,
      };

      let payload = basePayload;
      if (isSuperuser) {
        payload = {
          ...basePayload,
          bid_strategy: form.bid_strategy,
          ad_platforms: form.ad_platforms,
        };
      }

      await client.updateCampaign(campaignId, payload);
      setMsg({ tone: "success", text: mc.saved });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || mc.saveError });
    } finally {
      setSaving(false);
    }
  };

  const handlePayAndSubmit = async () => {
    if (!campaignId) return;
    const budgetEuro = parseFloat(form.budget_daily_cents);
    if (!form.budget_daily_cents || Number.isNaN(budgetEuro) || budgetEuro <= 0) {
      setMsg({ tone: "warning", text: mc.budgetSaveFirst });
      return;
    }
    setCheckoutLoading(true);
    setMsg(null);
    try {
      // Save first, then redirect to checkout
      await getMedusaAdminClient().updateCampaign(campaignId, {
        name: form.name.trim(),
        description: form.description,
        target_type: form.target_type,
        product_ids: form.product_ids,
        group_ids: form.group_ids,
        variant_ids: form.variant_ids || [],
        budget_daily_cents: Math.round(budgetEuro * 100),
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        campaign_type: "ppc",
        discount_type: "percentage",
        discount_value: 0,
      });
      const res = await getMedusaAdminClient().createCampaignCheckout(campaignId);
      if (res?.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        setMsg({ tone: "critical", text: res?.message || mc.checkoutFailed });
        setCheckoutLoading(false);
      }
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || mc.payError });
      setCheckoutLoading(false);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      !productSearch ||
      (p.title || "").toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.ean || "").includes(productSearch),
  );

  if (loading) {
    return (
      <Page title={mc.loadingCampaign} backAction={{ content: mc.back, url: "/marketing/campaigns" }}>
        <Card>
          <div style={{ padding: 48, textAlign: "center" }}>
            <Spinner size="large" accessibilityLabel={mc.loadingCampaign} />
            <p style={{ marginTop: 16, color: "#64748b", fontSize: 14 }}>{mc.loadingCampaign}</p>
          </div>
        </Card>
      </Page>
    );
  }

  const sellerExperience = !isSuperuser;

  return (
    <Page
      fullWidth
      title={sellerExperience ? mc.editShopAd : form.name.trim() || mc.adCampaign}
      subtitle={undefined}
      backAction={{ content: mc.backToOverview, url: "/marketing/campaigns" }}
      primaryAction={{ content: mc.save, onAction: save, loading: saving }}
    >
      <div style={{ background: shell.pageBg, margin: "-16px -16px 0", paddingBottom: 48 }}>
        {sellerExperience && (
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              background: shell.heroGradient,
              padding: "36px 28px 44px",
              marginBottom: 28,
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: shell.heroGlow, pointerEvents: "none" }} />
            <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto" }}>
              <InlineStack gap="200" blockAlign="center" wrap>
                <Badge tone="success">{mc.shopPromotionBadge}</Badge>
                <Badge tone="info">{mc.visibilityRankingBadge}</Badge>
              </InlineStack>
              <h1
                style={{
                  margin: "14px 0 0",
                  fontSize: "clamp(1.65rem, 3vw, 2.25rem)",
                  fontWeight: 750,
                  letterSpacing: "-0.03em",
                  color: "#f8fafc",
                  lineHeight: 1.15,
                  maxWidth: 720,
                  fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
                }}
              >
                {form.name.trim() || mc.newShopCampaign}
              </h1>
              <p style={{ margin: "14px 0 0", fontSize: 15, color: "rgba(226, 232, 240, 0.88)", maxWidth: 620, lineHeight: 1.55 }}>
                {mc.heroSubtitle}
              </p>
              <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "rgba(248,250,252,0.9)" }}>
                  {form.budget_daily_cents ? mc.budgetPerDay(form.budget_daily_cents) : fmtBudget(loadedCampaign?.budget_daily_cents)}
                </span>
              </div>
            </div>
          </div>
        )}

        <div style={{ maxWidth: 1180, margin: "0 auto", padding: sellerExperience ? "0 20px" : "20px" }}>
          {msg && (
            <div style={{ marginBottom: 20 }}>
              <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
                {msg.text}
              </Banner>
            </div>
          )}

          {isSuperuser && connectedPlatforms.length === 0 && (
            <div style={{ marginBottom: 20 }}>
              <Banner tone="warning">
                {mc.adminMarketingHint}
              </Banner>
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 28,
              alignItems: "flex-start",
            }}
          >
            <div style={{ flex: "1 1 420px", minWidth: 0, maxWidth: "100%" }}>
            <BlockStack gap="500">
              {/* Step 1 */}
              <div
                style={{
                  borderRadius: shell.cardRadius,
                  border: shell.border,
                  background: "#fff",
                  boxShadow: shell.cardShadow,
                  padding: "26px 26px 28px",
                }}
              >
                <StepHeader
                  step={1}
                  title={mc.basicsTitle}
                  subtitle={sellerExperience ? mc.basicsSubtitleSeller : mc.basicsSubtitleAdmin}
                />
                <BlockStack gap="400">
                  <TextField label={mc.campaignName} value={form.name} onChange={(v) => setField("name", v)} autoComplete="off" />
                  <TextField
                    label={mc.internalNote}
                    value={form.description}
                    onChange={(v) => setField("description", v)}
                    multiline={3}
                    autoComplete="off"
                    helpText={sellerExperience ? mc.internalNoteHelp : undefined}
                  />

                  {sellerExperience && (
                    <>
                      <Divider />
                      <Text as="h3" variant="headingSm">
                        {mc.yourShopGoal}
                      </Text>
                      <div style={{ display: "grid", gap: 12 }}>
                        {shopGoals.map((opt) => {
                          const active = form.seller_shop_goal === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setField("seller_shop_goal", opt.value)}
                              style={{
                                textAlign: "left",
                                cursor: "pointer",
                                padding: "14px 16px",
                                borderRadius: 14,
                                border: active ? "2px solid #6366f1" : "1px solid #e2e8f0",
                                background: active ? "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.06))" : "#fafafa",
                                transition: "border-color 0.15s, box-shadow 0.15s",
                                boxShadow: active ? "0 4px 20px rgba(99, 102, 241, 0.12)" : "none",
                              }}
                            >
                              <div style={{ fontWeight: 650, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>{opt.label}</div>
                              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{opt.hint}</div>
                            </button>
                          );
                        })}
                      </div>
                      <div>
                        <Text as="p" variant="bodySm" tone="subdued">{mc.audienceOptional}</Text>
                        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {audienceOptions.map((aud) => {
                            const active = selectedAudiences.includes(aud);
                            return (
                              <button
                                key={aud}
                                type="button"
                                onClick={() => toggleAudience(aud)}
                                style={{
                                  cursor: "pointer",
                                  padding: "6px 14px",
                                  borderRadius: 999,
                                  fontSize: 13,
                                  fontWeight: active ? 650 : 400,
                                  border: active ? "2px solid #6366f1" : "1px solid #e2e8f0",
                                  background: active ? "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08))" : "#fafafa",
                                  color: active ? "#4338ca" : "#475569",
                                  transition: "all 0.15s",
                                }}
                              >
                                {aud}
                              </button>
                            );
                          })}
                        </div>
                        {selectedAudiences.length > 0 && (
                          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>
                            {mc.selected}: {selectedAudiences.join(", ")}
                          </p>
                        )}
                      </div>
                      <div>
                        <Text as="p" variant="bodySm" tone="subdued">{mc.keywordsOptional}</Text>
                        {keywords.length > 0 && (
                          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {keywords.map((kw) => (
                              <span
                                key={kw}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  background: "rgba(99,102,241,0.1)",
                                  border: "1px solid rgba(99,102,241,0.25)",
                                  color: "#4338ca",
                                }}
                              >
                                {kw}
                                <button
                                  type="button"
                                  onClick={() => removeKeyword(kw)}
                                  style={{
                                    border: "none",
                                    background: "none",
                                    cursor: "pointer",
                                    color: "#6366f1",
                                    fontSize: 14,
                                    lineHeight: 1,
                                    padding: 0,
                                    fontWeight: 700,
                                  }}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            value={keywordInput}
                            onChange={(e) => setKeywordInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addKeyword(keywordInput);
                                setKeywordInput("");
                              }
                            }}
                            placeholder={mc.keywordPlaceholder}
                            style={{
                              flex: 1,
                              padding: "8px 12px",
                              borderRadius: 10,
                              border: "1px solid #e2e8f0",
                              fontSize: 13,
                              outline: "none",
                              fontFamily: "inherit",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => { addKeyword(keywordInput); setKeywordInput(""); }}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 10,
                              border: "1px solid #e2e8f0",
                              background: shell.accentSoft,
                              color: "#4338ca",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {mc.add}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </BlockStack>
              </div>

              {/* Step 2 — Medien */}
              <div
                style={{
                  borderRadius: shell.cardRadius,
                  border: shell.border,
                  background: "#fff",
                  boxShadow: shell.cardShadow,
                  padding: "26px 26px 28px",
                }}
              >
                <StepHeader
                  step={2}
                  title={mc.mediaCreativeTitle}
                  subtitle={sellerExperience ? mc.mediaCreativeSubtitleSeller : mc.mediaCreativeSubtitleAdmin}
                />
                {sellerExperience ? (
                  <div style={{ marginBottom: 20 }}>
                    <Banner tone="warning">
                      <p style={{ margin: 0, lineHeight: 1.55 }}>
                        <strong>{mc.creativeBannerStrong}</strong> {mc.creativeBannerText.replace(mc.creativeBannerStrong, "").trim()}
                      </p>
                    </Banner>
                  </div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    <Text tone="subdued" as="p" variant="bodySm">
                      {mc.adminUrlsNote}
                    </Text>
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
                  <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                    <CampaignImageSlot
                      mc={mc}
                      url={form.seller_image_url}
                      uploading={imageUploading}
                      onSelectFile={uploadCampaignImage}
                      onClear={() => setField("seller_image_url", "")}
                    />
                  </div>
                  <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                    <CampaignVideoSlot
                      mc={mc}
                      title={mc.shopHighlightTitle}
                      badge={mc.shopHighlightBadge}
                      roleLine={mc.shopHighlightRole}
                      specsLine={mc.shopHighlightSpecs}
                      aspectMode="169"
                      url={form.seller_video_shop_url}
                      uploading={videoUploadSlot === "shop"}
                      onSelectFile={(f) => uploadCampaignVideo("shop", f)}
                      onClear={() => setField("seller_video_shop_url", "")}
                    />
                  </div>
                  <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                    <CampaignVideoSlot
                      mc={mc}
                      title={mc.reelsTitle}
                      badge={mc.reelsBadge}
                      roleLine={mc.reelsRole}
                      specsLine={mc.reelsSpecs}
                      aspectMode="916"
                      url={form.seller_video_reels_url}
                      uploading={videoUploadSlot === "reels"}
                      onSelectFile={(f) => uploadCampaignVideo("reels", f)}
                      onClear={() => setField("seller_video_reels_url", "")}
                    />
                  </div>
                </div>
              </div>

              {/* Step 2.5 — Dil bazlı içerik */}
              <div
                style={{
                  borderRadius: shell.cardRadius,
                  border: shell.border,
                  background: "#fff",
                  boxShadow: shell.cardShadow,
                  padding: "26px 26px 28px",
                }}
              >
                <StepHeader
                  step={sellerExperience ? 3 : 3}
                  title={mc.multilingualTitle}
                  subtitle={mc.multilingualSubtitle}
                />
                <LocaleContentEditor
                  mc={mc}
                  localeContent={form.locale_content || {}}
                  onChange={(v) => setField("locale_content", v)}
                />
              </div>

              {/* Step 4 */}
              <div
                style={{
                  borderRadius: shell.cardRadius,
                  border: shell.border,
                  background: "#fff",
                  boxShadow: shell.cardShadow,
                  padding: "26px 26px 28px",
                }}
              >
                <StepHeader
                  step={4}
                  title={mc.budgetRuntimeTitle}
                  subtitle={sellerExperience ? mc.budgetRuntimeSubtitleSeller : mc.budgetRuntimeSubtitleAdmin}
                />
                <BlockStack gap="400">
                  <TextField
                    label={mc.dailyBudgetEuro}
                    type="number"
                    min="1"
                    step="0.5"
                    value={form.budget_daily_cents}
                    onChange={(v) => setField("budget_daily_cents", v)}
                    helpText={sellerExperience ? mc.budgetHelpSeller : mc.budgetHelpAdmin}
                    autoComplete="off"
                  />
                  <InlineStack gap="400" wrap={false}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TextField label={mc.start} type="datetime-local" value={form.start_at} onChange={(v) => setField("start_at", v)} autoComplete="off" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TextField label={mc.endOptional} type="datetime-local" value={form.end_at} onChange={(v) => setField("end_at", v)} autoComplete="off" />
                    </div>
                  </InlineStack>
                  {isSuperuser && (
                    <Select label={mc.bidStrategyTechnical} options={BID_OPTIONS} value={form.bid_strategy} onChange={(v) => setField("bid_strategy", v)} />
                  )}
                </BlockStack>
              </div>

              {/* Admin: platforms */}
              {isSuperuser && (
                <div
                  style={{
                    borderRadius: shell.cardRadius,
                    border: shell.border,
                    background: "#fffbeb",
                    boxShadow: shell.cardShadow,
                    padding: "26px 26px 28px",
                  }}
                >
                  <StepHeader step={5} title={mc.externalAdminTitle} subtitle={mc.externalAdminSubtitle} />
                  <BlockStack gap="300">
                    <Text tone="subdued" as="p" variant="bodySm">
                      {mc.budgetOnChannels(
                        form.budget_daily_cents ? `${form.budget_daily_cents} €/day` : "—",
                        form.ad_platforms.length || mc.noChannels,
                      )}
                    </Text>
                    <div style={{ border: "1px solid #fcd34d", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                      {PLATFORM_OPTIONS.map((p) => {
                        const checked = form.ad_platforms.includes(p.value);
                        const isConnected = connectedPlatforms.includes(p.value);
                        return (
                          <label
                            key={p.value}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "10px 14px",
                              cursor: "pointer",
                              background: checked ? "#fffbeb" : "transparent",
                              borderBottom: "1px solid #fef3c7",
                            }}
                          >
                            <CustomCheckbox checked={checked} onChange={() => togglePlatform(p.value)} size={18} />
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400 }}>{p.label}</span>
                              {!isConnected && <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>{mc.notConnected}</span>}
                              {isConnected && <span style={{ fontSize: 11, color: "#22c55e", marginLeft: 8 }}>{mc.connected}</span>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </BlockStack>
                </div>
              )}

              {/* Google Ads Details */}
              <div
                style={{
                  borderRadius: shell.cardRadius,
                  border: "1px solid #dbeafe",
                  background: "#f0f7ff",
                  boxShadow: shell.cardShadow,
                  padding: "26px 26px 28px",
                }}
              >
                <StepHeader
                  step={isSuperuser ? 6 : 5}
                  title={mc.gadsTitle}
                  subtitle={mc.gadsSubtitle}
                />

                <BlockStack gap="400">
                  <div>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">{mc.keywordsLabel}</Text>
                    <p style={{ margin: "4px 0 10px", fontSize: 13, color: "#475569" }}>
                      {mc.keywordsHelp}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, minHeight: 32 }}>
                      {(form.gads_keywords || []).map((kw, i) => (
                        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: "#dbeafe", color: "#1d4ed8", fontSize: 12, fontWeight: 600 }}>
                          {kw}
                          <button type="button" onClick={() => setField("gads_keywords", (form.gads_keywords || []).filter((_, j) => j !== i))} style={{ border: "none", background: "none", cursor: "pointer", color: "#3b82f6", fontWeight: 700, padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        placeholder={mc.keywordGadsPlaceholder}
                        style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, outline: "none" }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            const val = e.target.value.trim().replace(/,$/, "");
                            if (val && !(form.gads_keywords || []).includes(val)) {
                              setField("gads_keywords", [...(form.gads_keywords || []), val]);
                            }
                            e.target.value = "";
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val && !(form.gads_keywords || []).includes(val)) {
                            setField("gads_keywords", [...(form.gads_keywords || []), val]);
                            e.target.value = "";
                          }
                        }}
                      />
                    </div>
                    {(form.gads_keywords || []).length === 0 && (
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#dc2626" }}>{mc.noKeywordsWarning}</p>
                    )}
                  </div>

                  {/* Headlines */}
                  <div>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">{mc.headlinesLabel}</Text>
                    <p style={{ margin: "4px 0 10px", fontSize: 13, color: "#475569" }}>
                      {mc.headlinesHelp}
                    </p>
                    <BlockStack gap="200">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const val = (form.gads_headlines || [])[i] || "";
                        const isRequired = i < 3;
                        const charCount = val.length;
                        const overLimit = charCount > 30;
                        return (
                          <div key={i} style={{ position: "relative" }}>
                            <input
                              type="text"
                              maxLength={30}
                              value={val}
                              placeholder={isRequired ? mc.headlineRequired(i + 1) : mc.headlineOptional(i + 1)}
                              style={{ width: "100%", padding: "8px 52px 8px 12px", borderRadius: 8, border: `1px solid ${overLimit ? "#f87171" : (isRequired && !val ? "#fcd34d" : "#cbd5e1")}`, fontSize: 13, boxSizing: "border-box", outline: "none" }}
                              onChange={(e) => {
                                const updated = [...(form.gads_headlines || [])];
                                updated[i] = e.target.value;
                                while (updated.length > 0 && !updated[updated.length - 1]) updated.pop();
                                setField("gads_headlines", updated);
                              }}
                            />
                            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: overLimit ? "#dc2626" : "#94a3b8", fontWeight: 600 }}>{charCount}/30</span>
                          </div>
                        );
                      })}
                    </BlockStack>
                    {(form.gads_headlines || []).filter(h => h?.trim()).length < 3 && (
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#dc2626" }}>{mc.minHeadlinesWarning}</p>
                    )}
                  </div>

                  {/* Descriptions */}
                  <div>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">{mc.descriptionsLabel}</Text>
                    <p style={{ margin: "4px 0 10px", fontSize: 13, color: "#475569" }}>
                      {mc.descriptionsHelp}
                    </p>
                    <BlockStack gap="200">
                      {Array.from({ length: 4 }).map((_, i) => {
                        const val = (form.gads_descriptions || [])[i] || "";
                        const isRequired = i < 2;
                        const charCount = val.length;
                        const overLimit = charCount > 90;
                        return (
                          <div key={i} style={{ position: "relative" }}>
                            <input
                              type="text"
                              maxLength={90}
                              value={val}
                              placeholder={isRequired ? mc.descriptionRequired(i + 1) : mc.descriptionOptional(i + 1)}
                              style={{ width: "100%", padding: "8px 56px 8px 12px", borderRadius: 8, border: `1px solid ${overLimit ? "#f87171" : (isRequired && !val ? "#fcd34d" : "#cbd5e1")}`, fontSize: 13, boxSizing: "border-box", outline: "none" }}
                              onChange={(e) => {
                                const updated = [...(form.gads_descriptions || [])];
                                updated[i] = e.target.value;
                                while (updated.length > 0 && !updated[updated.length - 1]) updated.pop();
                                setField("gads_descriptions", updated);
                              }}
                            />
                            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: overLimit ? "#dc2626" : "#94a3b8", fontWeight: 600 }}>{charCount}/90</span>
                          </div>
                        );
                      })}
                    </BlockStack>
                  </div>

                  {/* Final URL */}
                  <TextField
                    label={mc.landingUrl}
                    value={form.gads_final_url || ""}
                    onChange={(v) => setField("gads_final_url", v)}
                    placeholder="https://andertal.de/..."
                    helpText={mc.landingUrlHelp}
                    autoComplete="off"
                  />

                  {/* Geo + Language */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{mc.geoTargets}</Text>
                      <p style={{ margin: "4px 0 8px", fontSize: 12, color: "#64748b" }}>{mc.multiSelect}</p>
                      <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                        {GEO_TARGET_OPTIONS.map((g) => {
                          const checked = (form.gads_geo_targets || []).includes(g.value);
                          return (
                            <label key={g.value} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", background: checked ? "#eff6ff" : "#fff", borderBottom: "1px solid #f1f5f9" }}>
                              <CustomCheckbox checked={checked} onChange={() => {
                                const cur = new Set(form.gads_geo_targets || []);
                                if (cur.has(g.value)) cur.delete(g.value); else cur.add(g.value);
                                setField("gads_geo_targets", Array.from(cur));
                              }} size={16} />
                              <span style={{ fontSize: 13 }}>{g.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <Select
                        label={mc.targetLanguage}
                        options={LANGUAGE_TARGET_OPTIONS}
                        value={form.gads_target_language || "1001"}
                        onChange={(v) => setField("gads_target_language", v)}
                      />
                      <div style={{ marginTop: 16 }}>
                        <TextField
                          label={mc.maxCpcBid}
                          type="number"
                          min="10"
                          step="5"
                          value={String(form.gads_cpc_bid_cents ?? 50)}
                          onChange={(v) => setField("gads_cpc_bid_cents", Number(v) || 50)}
                          helpText={mc.cpcHelp}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </div>
                </BlockStack>
              </div>

              {/* Step 4/5 — Produkte */}
              <div
                style={{
                  borderRadius: shell.cardRadius,
                  border: shell.border,
                  background: "#fff",
                  boxShadow: shell.cardShadow,
                  padding: "26px 26px 28px",
                }}
              >
                <StepHeader
                  step={isSuperuser ? 7 : 6}
                  title={mc.productsFocusTitle}
                  subtitle={sellerExperience ? mc.productsFocusSubtitleSeller : mc.productsFocusSubtitleAdmin}
                />
                <Select label={mc.targetSelection} options={targetOptions} value={form.target_type} onChange={(v) => setField("target_type", v)} />

                {form.target_type === "products" && (
                  <BlockStack gap="300">
                    <div style={{ marginTop: 12 }}>
                      <TextField
                        label=""
                        labelHidden
                        placeholder={mc.searchProducts}
                        value={productSearch}
                        onChange={setProductSearch}
                        autoComplete="off"
                        clearButton
                        onClearButtonClick={() => setProductSearch("")}
                      />
                    </div>
                    <div
                      style={{
                        maxHeight: 460,
                        overflowY: "auto",
                        border: "1px solid #e2e8f0",
                        borderRadius: 14,
                        background: "#fafafa",
                      }}
                    >
                      {filteredProducts.map((p) => {
                        const checked = form.product_ids.includes(p.id);
                        const rawVariants = p.variants;
                        const variants = Array.isArray(rawVariants)
                          ? rawVariants
                          : (typeof rawVariants === "string" ? (() => { try { return JSON.parse(rawVariants); } catch { return []; } })() : []);
                        const hasVariants = variants.length > 0;
                        const isExpanded = expandedProductId === p.id;
                        return (
                          <div key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: checked ? "#eef2ff" : "#fff", transition: "background 0.12s" }}>
                              <CustomCheckbox checked={checked} onChange={() => toggleProduct(p.id)} size={18} />
                              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => toggleProduct(p.id)}>
                                <div style={{ fontSize: 13, fontWeight: checked ? 650 : 500, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {p.title || p.id}
                                </div>
                                {p.ean && <div style={{ fontSize: 11, color: "#64748b" }}>EAN {p.ean}</div>}
                              </div>
                              {hasVariants && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedProductId(isExpanded ? null : p.id)}
                                  style={{ fontSize: 11, color: "#6366f1", background: "none", border: "1px solid #e0e7ff", borderRadius: 6, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                                >
                                  {isExpanded ? "▲" : "▼"} {mc.variants(variants.length)}
                                </button>
                              )}
                            </div>
                            {hasVariants && isExpanded && (
                              <div style={{ background: "#f8f9ff", borderTop: "1px solid #e0e7ff" }}>
                                {variants.map((v) => {
                                  const vid = v.id || v.sku || String(v);
                                  const vChecked = (form.variant_ids || []).includes(vid);
                                  const vLabel = [v.title, v.sku, v.ean].filter(Boolean).join(" · ") || vid;
                                  return (
                                    <label key={vid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px 8px 36px", cursor: "pointer", background: vChecked ? "#eef2ff" : "transparent", borderBottom: "1px solid #eff0fb" }}>
                                      <CustomCheckbox checked={vChecked} onChange={() => toggleVariant(vid)} size={16} />
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: vChecked ? 650 : 400, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {vLabel}
                                        </div>
                                        {v.price_cents != null && (
                                          <div style={{ fontSize: 11, color: "#64748b" }}>{(v.price_cents / 100).toFixed(2)} €</div>
                                        )}
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </BlockStack>
                )}

                {form.target_type === "groups" && (
                  <BlockStack gap="200">
                    {groups.length === 0 ? (
                      <Banner tone="info">{mc.noProductGroups}</Banner>
                    ) : (
                      <div style={{ marginTop: 12, border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
                        {groups.map((g) => {
                          const checked = form.group_ids.includes(g.id);
                          return (
                            <label
                              key={g.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "12px 14px",
                                cursor: "pointer",
                                background: checked ? "#eef2ff" : "#fff",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <CustomCheckbox checked={checked} onChange={() => toggleGroup(g.id)} size={18} />
                              <div>
                                <div style={{ fontSize: 13, fontWeight: checked ? 650 : 500 }}>{g.name}</div>
                                <div style={{ fontSize: 11, color: "#64748b" }}>{mc.productsCount((g.product_ids || []).length)}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </BlockStack>
                )}

                {form.target_type === "all" && (
                  <div style={{ marginTop: 12 }}>
                    <Banner tone="success">
                      {mc.allProductsBanner}
                    </Banner>
                  </div>
                )}
              </div>

              <InlineStack gap="300" wrap>
                <Button variant="primary" size="large" onClick={save} loading={saving}>
                  {mc.save}
                </Button>
                {!isSuperuser && (
                  <Button
                    tone="success"
                    size="large"
                    onClick={handlePayAndSubmit}
                    loading={checkoutLoading}
                    disabled={saving}
                  >
                    {mc.payAndSubmit}
                  </Button>
                )}
                <Button onClick={() => router.push("/marketing/campaigns")}>{mc.cancel}</Button>
              </InlineStack>
              {!isSuperuser && (
                <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                  {mc.stripeNote(form.budget_daily_cents ? `${(parseFloat(form.budget_daily_cents) * 30).toFixed(2)} €` : "—")}
                </p>
              )}
            </BlockStack>
            </div>

            {/* Preview column */}
            <aside style={{ flex: "0 1 320px", width: "100%", maxWidth: 360, position: "sticky", top: 24, alignSelf: "flex-start" }}>
              <BlockStack gap="400">
                <ShopPreviewMock
                  mc={mc}
                  name={form.name}
                  budgetEuro={form.budget_daily_cents}
                  goalLabel={sellerExperience ? goalLabel : mc.promotion}
                  targetType={form.target_type}
                  productCount={form.product_ids.length}
                  highlightVideoUrl={form.seller_video_shop_url}
                />
              </BlockStack>
            </aside>
          </div>

        </div>
      </div>
    </Page>
  );
}
