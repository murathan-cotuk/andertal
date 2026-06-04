export const PLATFORM_OPTIONS = [
  { value: "meta", label: "Meta (Facebook / Instagram)" },
  { value: "google_ads", label: "Google Ads" },
  { value: "tiktok", label: "TikTok Ads" },
  { value: "snapchat", label: "Snapchat Ads" },
];

export const BID_OPTIONS = [
  { value: "cpc", label: "CPC – Cost per Click" },
  { value: "cpm", label: "CPM – Cost per 1000 Impressions" },
  { value: "target_roas", label: "Target ROAS" },
];

export const TARGET_OPTIONS = [
  { value: "products", label: "Bestimmte Produkte" },
  { value: "groups", label: "Produktgruppen" },
  { value: "all", label: "Alle eigenen Produkte" },
];

/** Verkäufer: Ziele ohne Ads-Jargon (in settings gespeichert) */
export const SHOP_GOAL_OPTIONS = [
  { value: "visibility", label: "Maximale Sichtbarkeit im Shop", hint: "Produkte höher in Suchergebnissen & Kategorien" },
  { value: "traffic", label: "Mehr Produktaufrufe", hint: "Mehr Klicks auf deine Produktseiten" },
  { value: "conversion_focus", label: "Kaufabsicht stärken", hint: "Fokus auf überzeugende Platzierung zum Point of Sale" },
];

export const CAMPAIGN_LOCALES = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
];

export const GEO_TARGET_OPTIONS = [
  { value: "2276", label: "Deutschland" },
  { value: "2040", label: "Österreich" },
  { value: "2756", label: "Schweiz" },
  { value: "2792", label: "Türkiye" },
  { value: "2250", label: "France" },
  { value: "2380", label: "Italia" },
  { value: "2724", label: "España" },
  { value: "2826", label: "United Kingdom" },
  { value: "2840", label: "United States" },
];

export const LANGUAGE_TARGET_OPTIONS = [
  { value: "1001", label: "Deutsch" },
  { value: "1000", label: "English" },
  { value: "1036", label: "Türkçe" },
  { value: "1002", label: "Français" },
  { value: "1004", label: "Italiano" },
  { value: "1003", label: "Español" },
];

export function parseSellerSettings(rawSettings) {
  let s = rawSettings;
  if (typeof s === "string") {
    try {
      s = JSON.parse(s);
    } catch {
      s = {};
    }
  }
  if (!s || typeof s !== "object") s = {};
  return {
    seller_shop_goal: s.seller_shop_goal || "visibility",
    seller_audience_note: s.seller_audience_note || "",
    seller_creative_note: s.seller_creative_note || "",
    seller_video_shop_url: s.seller_video_shop_url || "",
    seller_video_reels_url: s.seller_video_reels_url || "",
    seller_image_url: s.seller_image_url || "",
    locale_content: s.locale_content && typeof s.locale_content === "object" ? s.locale_content : {},
    // Google Ads specific
    gads_headlines: Array.isArray(s.gads_headlines) ? s.gads_headlines : [],
    gads_descriptions: Array.isArray(s.gads_descriptions) ? s.gads_descriptions : [],
    gads_keywords: Array.isArray(s.gads_keywords) ? s.gads_keywords : [],
    gads_final_url: s.gads_final_url || "",
    gads_geo_targets: Array.isArray(s.gads_geo_targets) ? s.gads_geo_targets : ["2276"],
    gads_target_language: s.gads_target_language || "1001",
    gads_cpc_bid_cents: s.gads_cpc_bid_cents != null ? Number(s.gads_cpc_bid_cents) : 50,
  };
}

export function fmtBudget(cents) {
  if (!cents) return "—";
  return `${(parseInt(cents, 10) / 100).toFixed(2)} €/Tag`;
}

export function fmtDate(v) {
  return v ? new Date(v).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export function toInputDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export const AD_STATUS_TONE = {
  draft: "info",
  pending: "warning",
  pending_review: "warning",
  approved: "attention",
  published: "success",
  partial: "attention",
  paused: "warning",
  rejected: "critical",
};

export const AD_STATUS_LABEL = {
  draft: "Entwurf",
  pending: "Ausstehend",
  pending_review: "Prüfung",
  approved: "Genehmigt",
  published: "Live",
  partial: "Teilweise live",
  paused: "Pausiert",
  rejected: "Abgelehnt",
};

/** Customer-facing campaign status (visible to seller & superuser). */
export const CAMPAIGN_STATUS_TONE = {
  draft: "info",
  active: "success",
  paused: "warning",
  archived: "subdued",
};

export const CAMPAIGN_STATUS_LABEL = {
  draft: "Entwurf",
  active: "Aktiv",
  paused: "Pausiert",
  archived: "Archiviert",
};

const PLATFORM_KEY_SET = new Set(PLATFORM_OPTIONS.map((p) => p.value));

/** Returns labels of platforms that the campaign is currently published on. */
export function getActivePlatformLabels(externalIdsRaw) {
  let ids = externalIdsRaw;
  if (typeof ids === "string") {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = {};
    }
  }
  if (!ids || typeof ids !== "object") return [];
  return Object.keys(ids)
    .filter((k) => PLATFORM_KEY_SET.has(k))
    .map((k) => PLATFORM_OPTIONS.find((o) => o.value === k)?.label || k);
}

export function parseJsonIdArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const x = JSON.parse(raw);
      return Array.isArray(x) ? x : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parseCampaignToForm(c) {
  const sellerExtras = parseSellerSettings(c.settings);
  return {
    name: c.name || "",
    description: c.description || "",
    target_type: c.target_type || "products",
    product_ids: parseJsonIdArray(c.product_ids),
    variant_ids: parseJsonIdArray(c.variant_ids),
    group_ids: parseJsonIdArray(c.group_ids),
    budget_daily_cents: c.budget_daily_cents ? String(Math.round(Number(c.budget_daily_cents) / 100)) : "",
    bid_strategy: c.bid_strategy || "cpc",
    ad_platforms: parseJsonIdArray(c.ad_platforms),
    start_at: toInputDate(c.start_at),
    end_at: toInputDate(c.end_at),
    campaign_type: "ppc",
    ...sellerExtras,
  };
}

export function mergeCampaignSettings(prevRaw, sellerPatch) {
  let prev = prevRaw;
  if (typeof prev === "string") {
    try {
      prev = JSON.parse(prev);
    } catch {
      prev = {};
    }
  }
  const base = prev && typeof prev === "object" ? { ...prev } : {};
  return {
    ...base,
    seller_shop_goal: sellerPatch.seller_shop_goal,
    seller_audience_note: sellerPatch.seller_audience_note,
    seller_creative_note: sellerPatch.seller_creative_note,
    seller_video_shop_url: sellerPatch.seller_video_shop_url ?? base.seller_video_shop_url ?? "",
    seller_video_reels_url: sellerPatch.seller_video_reels_url ?? base.seller_video_reels_url ?? "",
    seller_image_url: sellerPatch.seller_image_url ?? base.seller_image_url ?? "",
    locale_content: sellerPatch.locale_content !== undefined ? sellerPatch.locale_content : (base.locale_content ?? {}),
    gads_headlines: sellerPatch.gads_headlines ?? base.gads_headlines ?? [],
    gads_descriptions: sellerPatch.gads_descriptions ?? base.gads_descriptions ?? [],
    gads_keywords: sellerPatch.gads_keywords ?? base.gads_keywords ?? [],
    gads_final_url: sellerPatch.gads_final_url ?? base.gads_final_url ?? "",
    gads_geo_targets: sellerPatch.gads_geo_targets ?? base.gads_geo_targets ?? ["2276"],
    gads_target_language: sellerPatch.gads_target_language ?? base.gads_target_language ?? "1001",
    gads_cpc_bid_cents: sellerPatch.gads_cpc_bid_cents ?? base.gads_cpc_bid_cents ?? 50,
  };
}
