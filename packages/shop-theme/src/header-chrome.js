/** Header chrome: solid / gradient + optional background image (shared by CSS build + runtime route overrides). */

const PRIMARY_TOKEN = "__PRIMARY__";

export function replacePrimaryInString(val, primary) {
  if (typeof val !== "string") return val;
  return val.split(PRIMARY_TOKEN).join(primary || "#ff971c");
}

function normalizeHexInput(hex) {
  if (!hex || typeof hex !== "string") return "#ffffff";
  let s = hex.trim();
  if (!s.startsWith("#")) s = `#${s}`;
  if (s.length === 4 && /^#[0-9a-fA-F]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  return "#ffffff";
}

function hexToRgb(hex) {
  const s = normalizeHexInput(hex).slice(1);
  const n = parseInt(s, 16);
  if (Number.isNaN(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixRgb(a, b, t) {
  const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
  const u = Math.min(1, Math.max(0, t));
  return {
    r: clamp(a.r + (b.r - a.r) * u),
    g: clamp(a.g + (b.g - a.g) * u),
    b: clamp(a.b + (b.b - a.b) * u),
  };
}

function mixHexColors(hexA, hexB, t) {
  const out = mixRgb(hexToRgb(hexA), hexToRgb(hexB), t);
  return `#${[out.r, out.g, out.b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function isGradientEnabled(header) {
  const v = header?.bg_gradient_enabled;
  return v === true || v === "true" || v === 1 || v === "1";
}

/**
 * Pro Viewport: eigener Schalter für gemeinsamen Header+Second-Nav-Verlauf.
 * Ohne Geräte-Feld → Fallback auf globales `bg_gradient_enabled`.
 * @param {"mobile"|"tablet"|"desktop"} viewport
 */
export function effectiveGradientEnabled(header, viewport) {
  const key =
    viewport === "mobile"
      ? "bg_gradient_enabled_mobile"
      : viewport === "tablet"
        ? "bg_gradient_enabled_tablet"
        : "bg_gradient_enabled_desktop";
  const raw = header?.[key];
  if (raw !== undefined && raw !== null && raw !== "") {
    return raw === true || raw === "true" || raw === 1 || raw === "1";
  }
  return isGradientEnabled(header);
}

/** Chrome-Hintergrund wie buildHeaderChromeBackground, aber Verlauf nur wenn für diese Ansicht aktiv */
export function buildHeaderChromeBackgroundForViewport(header, primary, viewport) {
  const merged = { ...(header || {}), bg_gradient_enabled: effectiveGradientEnabled(header, viewport) };
  return buildHeaderChromeBackground(merged, primary);
}

export function buildHeaderChromeBackgroundsByViewport(header, primary) {
  return {
    mobile: buildHeaderChromeBackgroundForViewport(header, primary, "mobile"),
    tablet: buildHeaderChromeBackgroundForViewport(header, primary, "tablet"),
    desktop: buildHeaderChromeBackgroundForViewport(header, primary, "desktop"),
  };
}

export function escapeCssUrlFragment(url) {
  return String(url || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/"/g, "%22");
}

/**
 * Für buildShopThemeCSS: Primary-Token ersetzen, `scopes` ignorieren.
 * @param {Record<string, unknown>} header
 * @param {string} primary
 */
export function resolveHeaderStringsForCss(header, primary) {
  if (!header || typeof header !== "object") return {};
  const out = { ...header };
  delete out.scopes;
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "string") out[k] = replacePrimaryInString(out[k], primary);
  }
  return out;
}

/**
 * Header-Hintergrund nur aus Farbe/Verlauf; optional Bild darunter (cover).
 * `header` sollte bereits Primary-Strings aufgelöst haben (wie aus resolveHeaderStringsForCss).
 */
export function buildHeaderChromeBackground(header, primary) {
  const baseRaw = replacePrimaryInString(String(header?.bg_color ?? "#ffffff"), primary);
  const base = normalizeHexInput(baseRaw);
  let layer;
  if (!isGradientEnabled(header)) {
    layer = base;
  } else {
    const endRaw = replacePrimaryInString(String(header?.bg_gradient_end ?? base), primary);
    const end = normalizeHexInput(endRaw);
    let angle = Number(header?.bg_gradient_angle);
    if (!Number.isFinite(angle)) angle = 135;
    let intenPct = Number(header?.bg_gradient_intensity);
    if (!Number.isFinite(intenPct)) intenPct = 75;
    const t = Math.min(1, Math.max(0, intenPct / 100));
    const mixedEnd = mixHexColors(base, end, t);
    layer = `linear-gradient(${angle}deg, ${base} 0%, ${mixedEnd} 100%)`;
  }
  const img = String(header?.bg_image_url ?? "").trim();
  if (!img) return layer;
  const safe = escapeCssUrlFragment(img);
  return `${layer}, url("${safe}") center/cover no-repeat`;
}

/**
 * Auf Header-Container als inline style (CSS-Variablen), wenn Routen-Overrides aktiv sind.
 */
export function buildHeaderSurfaceCssVars(header, primary) {
  const h = resolveHeaderStringsForCss(header, primary);
  /** Routen-Overrides: Desktop-Ansicht als Referenz (keine Media Queries in Inline-Styles) */
  const chromeBg = buildHeaderChromeBackgroundForViewport(h, primary, "desktop");
  const vars = {
    "--header-bg": h.bg_color,
    "--header-chrome-bg": chromeBg,
    "--header-text": h.text_color,
  };
  if (h.shadow != null && h.shadow !== "") vars["--header-shadow"] = h.shadow;
  if (h.border_bottom != null && h.border_bottom !== "") vars["--header-border"] = h.border_bottom;
  if (h.height != null && h.height !== "") vars["--header-h"] = h.height;
  return vars;
}
