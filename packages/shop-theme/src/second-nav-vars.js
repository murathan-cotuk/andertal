/** @typedef {'desktop'|'tablet'|'mobile'} SecondNavViewport */

function own(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function trimOpt(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

/**
 * @param {Record<string, unknown>} sn — already passed through resolveSectionStrings(primary)
 * @param {SecondNavViewport} vp
 */
export function secondNavSurfaceForViewport(sn, vp) {
  return {
    bg: pickSecondNavBg(sn, vp),
    border: pickSecondNavBorder(sn, vp),
    text: pickSecondNavText(sn, vp),
    active: pickSecondNavActive(sn, vp),
  };
}

/**
 * @param {Record<string, unknown>} sn
 */
export function buildSecondNavSurfacesByViewport(sn) {
  return {
    desktop: secondNavSurfaceForViewport(sn, "desktop"),
    tablet: secondNavSurfaceForViewport(sn, "tablet"),
    mobile: secondNavSurfaceForViewport(sn, "mobile"),
  };
}

function pickSecondNavBg(sn, vp) {
  const k = `bg_${vp}`;
  if (own(sn, k)) {
    const t = trimOpt(sn[k]);
    return t === "" ? "transparent" : t;
  }
  const leg = trimOpt(sn.bg_color);
  return leg === "" ? "transparent" : leg;
}

function pickSecondNavBorder(sn, vp) {
  const k = `border_${vp}`;
  if (own(sn, k)) {
    const t = trimOpt(sn[k]);
    return t === "" ? "none" : t;
  }
  const leg = trimOpt(sn.border);
  return leg === "" ? "none" : leg;
}

function pickSecondNavText(sn, vp) {
  const k = `text_color_${vp}`;
  if (own(sn, k)) {
    const t = trimOpt(sn[k]);
    if (t !== "") return t;
  }
  return trimOpt(sn.text_color) || "#374151";
}

function pickSecondNavActive(sn, vp) {
  const k = `active_color_${vp}`;
  if (own(sn, k)) {
    const t = trimOpt(sn[k]);
    if (t !== "") return t;
  }
  return trimOpt(sn.active_color) || "#ff971c";
}
