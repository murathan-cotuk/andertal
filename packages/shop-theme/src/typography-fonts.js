/** Collect Google Font family names from theme typography for combined stylesheet link. */

const CSS_GENERIC = new Set([
  "inherit",
  "initial",
  "unset",
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "emoji",
]);

/**
 * Names that are valid CSS font families but are not (reliably) hosted on Google Fonts
 * — system fonts, classic Office stacks, common commercial desktop faces.
 * We skip them when building fonts.googleapis.com requests to avoid useless or failing loads.
 */
const NOT_HOSTED_ON_GOOGLE_FONTS = new Set([
  "arial",
  "arial black",
  "helvetica",
  "helvetica neue",
  "calibri",
  "cambria",
  "candara",
  "consolas",
  "constantia",
  "corbel",
  "franklin gothic medium",
  "franklin gothic",
  "garamond",
  "georgia",
  "impact",
  "lucida console",
  "lucida sans unicode",
  "palatino linotype",
  "book antiqua",
  "bookman old style",
  "century gothic",
  "segoe ui",
  "segoe print",
  "segoe script",
  "tahoma",
  "times new roman",
  "trebuchet ms",
  "verdana",
  "comic sans ms",
  "ms sans serif",
  "ms serif",
  "courier new",
  "symbol",
  "wingdings",
  "webdings",
  "aeonic",
  "aeonik",
]);

function isHostedOnGoogleFontsCatalog(name) {
  const n = (name || "").trim().toLowerCase();
  if (!n) return false;
  if (CSS_GENERIC.has(n)) return false;
  if (NOT_HOSTED_ON_GOOGLE_FONTS.has(n)) return false;
  return true;
}

export function firstFontFamilyFromCssStack(stack) {
  if (!stack || typeof stack !== "string") return "";
  const s = stack.trim();
  const q = s.match(/^["']([^"']+)["']\s*,/);
  if (q) return q[1].trim();
  const q2 = s.match(/^["']([^"']+)["']\s*$/);
  if (q2) return q2[1].trim();
  const first = s.split(",")[0].trim().replace(/^["']|["']$/g, "").trim();
  return first;
}

function shouldIncludeFamily(name) {
  const n = (name || "").trim();
  if (!n) return false;
  if (CSS_GENERIC.has(n.toLowerCase())) return false;
  return true;
}

/**
 * Unique Google Font family names referenced by typography (levels + legacy + global).
 * @param {Record<string, unknown>} typography
 * @returns {string[]}
 */
export function collectTypographyGoogleFamilies(typography) {
  if (!typography || typeof typography !== "object") return [];
  const out = [];
  const add = (raw) => {
    const name = (raw || "").trim();
    if (!shouldIncludeFamily(name)) return;
    if (!isHostedOnGoogleFontsCatalog(name)) return;
    if (!out.includes(name)) out.push(name);
  };

  add(typography.google_font_family);

  for (const key of [
    "body",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "product_title",
    "catalog_title",
    "menu_catalog",
  ]) {
    const level = typography[key];
    const stack = (level?.font_family || "").trim();
    if (stack) add(firstFontFamilyFromCssStack(stack));
  }

  const legacy = (typography.font_family || "").trim();
  if (legacy) add(firstFontFamilyFromCssStack(legacy));

  return out;
}

const W_AXIS = "ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600;1,700";

/**
 * One stylesheet URL loading multiple Google families (Shopfront).
 * @param {string[]} names
 * @returns {string|null}
 */
export function buildGoogleFontsLinkHrefForFamilies(names) {
  const unique = [
    ...new Set(
      (names || [])
        .map((n) => String(n).trim())
        .filter(shouldIncludeFamily)
        .filter((n) => isHostedOnGoogleFontsCatalog(n)),
    ),
  ];
  if (!unique.length) return null;
  const q = unique
    .map((name) => `family=${encodeURIComponent(name).replace(/%20/g, "+")}:${W_AXIS}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}
