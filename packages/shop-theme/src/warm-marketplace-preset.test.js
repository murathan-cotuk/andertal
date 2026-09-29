import test from "node:test";
import assert from "node:assert/strict";
import { applyWarmMarketplacePreset, WARM_MARKETPLACE_PRESET_ID } from "./warm-marketplace-preset.js";
import { mergeLoadedShopStyles } from "./merge-styles.js";
import { buildShopThemeCSS } from "./build-css.js";

test("preset keeps merchant content and existing button variants", () => {
  const base = mergeLoadedShopStyles({
    topbar: { items: [{ text: "Hallo" }] },
    seo_home_title: "Mein Shop",
    buttons: { primary: { variants: [{ name: "Mine", code: ".shop-btn{}", active: true }] } },
  });
  const out = applyWarmMarketplacePreset(base);
  assert.deepEqual(out.topbar.items, [{ text: "Hallo" }]);
  assert.equal(out.seo_home_title, "Mein Shop");
  const primary = out.buttons.primary.variants;
  assert.equal(primary[0].name, "Warmer Marktplatz");
  assert.equal(primary[0].active, true);
  assert.ok(primary.some((v) => v.name === "Mine" && v.active === false));
  assert.equal(out.design_preset, WARM_MARKETPLACE_PRESET_ID);
});

test("applying twice does not duplicate variants", () => {
  const once = applyWarmMarketplacePreset(mergeLoadedShopStyles({}));
  const twice = applyWarmMarketplacePreset(once);
  const names = twice.buttons.add_to_cart.variants.map((v) => v.name);
  assert.equal(names.filter((n) => n === "Warmer Marktplatz").length, 1);
});

test("preset survives a save/load round trip and reaches the CSS", () => {
  const saved = JSON.parse(JSON.stringify(applyWarmMarketplacePreset(mergeLoadedShopStyles({}))));
  const reloaded = mergeLoadedShopStyles(saved);
  assert.equal(reloaded.design_preset, WARM_MARKETPLACE_PRESET_ID);
  const css = buildShopThemeCSS(saved);
  assert.match(css, /--second-nav-text:\s+#1D1B18/);
  assert.match(css, /Bricolage Grotesque/);
});

test("header icons stay white when no preset is applied", () => {
  assert.match(buildShopThemeCSS({}), /--header-icon-color: #ffffff/);
});

test("storefront uses the warm design when no design was chosen", async () => {
  const { resolveStorefrontStyles } = await import("./warm-marketplace-preset.js");
  const out = resolveStorefrontStyles({ colors: { primary: "#123456" }, topbar: { items: [{ text: "x" }] } });
  assert.equal(out.colors.primary, "#EE8A12");
  assert.equal(out.secondNav.text_color_desktop, "#1D1B18");
  assert.deepEqual(out.topbar.items, [{ text: "x" }]);
});

test("storefront keeps saved styles once a design was chosen", async () => {
  const { resolveStorefrontStyles } = await import("./warm-marketplace-preset.js");
  assert.equal(resolveStorefrontStyles({ design_preset: "classic", colors: { primary: "#123456" } }).colors.primary, "#123456");
  assert.equal(resolveStorefrontStyles({ design_preset: "warm_marketplace", colors: { primary: "#abcdef" } }).colors.primary, "#abcdef");
});

test("preset keeps the merchant's header colours and overrides old second-nav text colours", async () => {
  const { resolveStorefrontStyles } = await import("./warm-marketplace-preset.js");
  const out = resolveStorefrontStyles({ header: { bg_color: "#1b7a72", text_color: "#ffffff" }, secondNav: { text_color_desktop: "#ffffff" } });
  assert.equal(out.header.bg_color, "#1b7a72");
  assert.equal(out.header.text_color, "#ffffff");
  assert.equal(out.secondNav.text_color_desktop, "#1D1B18");
});
