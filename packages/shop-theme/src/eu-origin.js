/** Product metadata keys + helpers for Made in Europe (shared shop / sellercentral / backend). */

export const EU_ORIGIN_META_KEYS = [
  "eu_origin_provider",
  "eu_origin_registry_id",
  "eu_origin_document_url",
  "eu_origin_status",
  "eu_origin_verified_at",
  "eu_origin_country",
];

export const EU_ORIGIN_STATUS = {
  NONE: "",
  PENDING: "pending",
  VERIFIED: "verified",
  REJECTED: "rejected",
};

export const DEFAULT_MADE_IN_EUROPE_BADGE = {
  image_url: "",
  width: 88,
  height: 32,
  offset_left: 10,
  offset_bottom: 10,
};

/** @param {unknown} meta */
export function pickEuOriginFromMetadata(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  return {
    eu_origin_provider: String(m.eu_origin_provider ?? "").trim(),
    eu_origin_registry_id: String(m.eu_origin_registry_id ?? "").trim(),
    eu_origin_document_url: String(m.eu_origin_document_url ?? "").trim(),
    eu_origin_status: String(m.eu_origin_status ?? "").trim().toLowerCase(),
    eu_origin_verified_at: String(m.eu_origin_verified_at ?? "").trim(),
    eu_origin_country: String(m.eu_origin_country ?? "").trim(),
  };
}

/** @param {unknown} meta */
export function isEuOriginVerified(meta) {
  return pickEuOriginFromMetadata(meta).eu_origin_status === EU_ORIGIN_STATUS.VERIFIED;
}

/** @param {unknown} loaded */
export function mergeMadeInEuropeBadge(loaded) {
  const base = DEFAULT_MADE_IN_EUROPE_BADGE;
  if (!loaded || typeof loaded !== "object") return { ...base };
  return {
    image_url: String(loaded.image_url ?? base.image_url).trim(),
    width: Number(loaded.width) > 0 ? Number(loaded.width) : base.width,
    height: Number(loaded.height) > 0 ? Number(loaded.height) : base.height,
    offset_left: Number.isFinite(Number(loaded.offset_left)) ? Number(loaded.offset_left) : base.offset_left,
    offset_bottom: Number.isFinite(Number(loaded.offset_bottom)) ? Number(loaded.offset_bottom) : base.offset_bottom,
  };
}
