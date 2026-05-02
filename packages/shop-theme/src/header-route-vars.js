import { applyLayoutPresets } from "./layout-presets.js";
import { mergeLoadedShopStyles } from "./merge-styles.js";
import { buildHeaderSurfaceCssVars } from "./header-chrome.js";

/**
 * Inline-CSS-Variablen für Header, wenn für `routeScope` ein nicht leeres Override gesetzt ist.
 * @param {Record<string, unknown>} rawStyles — wie aus ShopStylesContext
 * @param {"category"|"collection"|null|undefined} routeScope
 * @returns {Record<string, string>|null}
 */
export function buildHeaderSurfaceCssVarsFromRoute(rawStyles, routeScope) {
  if (!routeScope) return null;
  const merged = mergeLoadedShopStyles(rawStyles || {});
  const withPresets = applyLayoutPresets(merged);
  const base = withPresets.header || {};
  const scopes = base.scopes;
  const patch = scopes && typeof scopes === "object" ? scopes[routeScope] : null;
  if (!patch || typeof patch !== "object") return null;

  const meaningful = Object.keys(patch).filter((k) => {
    const v = patch[k];
    if (v === undefined) return false;
    if (v === "") return false;
    return true;
  });
  if (meaningful.length === 0) return null;

  const { scopes: _drop, ...baseRest } = base;
  const effective = { ...baseRest, ...patch };
  return buildHeaderSurfaceCssVars(effective, merged.colors?.primary);
}
