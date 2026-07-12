/** @typedef {'desktop'|'tablet'|'mobile'} ViewportTier */

/**
 * Breakpoints aligned with StylesPage branding tabs:
 * mobile ≤767 px, tablet 768–1023 px, desktop ≥1024 px.
 * @param {number} width
 * @returns {ViewportTier}
 */
export function resolveViewportTier(width) {
  const w = Number(width) || 0;
  if (w >= 1024) return "desktop";
  if (w >= 768) return "tablet";
  return "mobile";
}

function logoSlotSize(block, fallback) {
  if (block?.size != null && Number.isFinite(Number(block.size))) return Number(block.size);
  if (block?.height != null && Number.isFinite(Number(block.height))) return Number(block.height);
  return fallback;
}

function padFromBlock(b) {
  return {
    pt: Number(b?.pt || 0),
    pr: Number(b?.pr || 0),
    pb: Number(b?.pb || 0),
    pl: Number(b?.pl || 0),
  };
}

/**
 * Resolve shop logo slots from seller settings (logo_config.shop + legacy flat fields).
 * Empty tablet/mobile URLs fall back to desktop — same as save normalization in StylesPage.
 *
 * @param {Record<string, unknown>} settings
 */
export function buildShopLogoSlotsFromSettings(settings) {
  const legUrl = String(settings?.shop_logo_url ?? "").trim();
  const legH = settings?.shop_logo_height != null ? Number(settings.shop_logo_height) : 34;
  const shop = settings?.logo_config?.shop;

  if (!shop || typeof shop !== "object") {
    const slot = (size) => ({ url: legUrl || "", size, height: size, ...padFromBlock({}) });
    return { desktop: slot(legH), tablet: slot(30), mobile: slot(28) };
  }

  const deskBlock = shop.desktop || {};
  const deskUrlStr = String(deskBlock.url ?? "").trim() || legUrl;

  const desktop = {
    url: deskUrlStr,
    size: logoSlotSize(deskBlock, legH),
    height: logoSlotSize(deskBlock, legH),
    ...padFromBlock(deskBlock),
  };

  const tabBlock = shop.tablet || {};
  const tabUrlStr = String(tabBlock.url ?? "").trim() || deskUrlStr;
  const tablet = {
    url: tabUrlStr,
    size: logoSlotSize(tabBlock, 30),
    height: logoSlotSize(tabBlock, 30),
    ...padFromBlock(tabBlock),
  };

  const mobBlock = shop.mobile || {};
  const mobUrlStr = String(mobBlock.url ?? "").trim() || deskUrlStr;
  const mobile = {
    url: mobUrlStr,
    size: logoSlotSize(mobBlock, 28),
    height: logoSlotSize(mobBlock, 28),
    ...padFromBlock(mobBlock),
  };

  return { desktop, tablet, mobile };
}

/**
 * @param {Record<string, unknown>} settings
 * @param {ViewportTier} tier
 */
export function pickShopLogoSlot(settings, tier) {
  const slots = buildShopLogoSlotsFromSettings(settings);
  return slots[tier] || slots.desktop;
}
