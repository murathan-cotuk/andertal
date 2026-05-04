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
  pending_review: "warning",
  approved: "attention",
  published: "success",
  paused: "warning",
  rejected: "critical",
};

export const AD_STATUS_LABEL = {
  draft: "Entwurf",
  pending_review: "Prüfung",
  approved: "Genehmigt",
  published: "Live",
  paused: "Pausiert",
  rejected: "Abgelehnt",
};

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
  };
}
