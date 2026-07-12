import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveViewportTier,
  buildShopLogoSlotsFromSettings,
  pickShopLogoSlot,
} from "./logo-branding.js";

test("resolveViewportTier matches StylesPage breakpoints", () => {
  assert.equal(resolveViewportTier(1200), "desktop");
  assert.equal(resolveViewportTier(1024), "desktop");
  assert.equal(resolveViewportTier(1023), "tablet");
  assert.equal(resolveViewportTier(768), "tablet");
  assert.equal(resolveViewportTier(767), "mobile");
  assert.equal(resolveViewportTier(375), "mobile");
});

test("pickShopLogoSlot uses mobile url and size", () => {
  const settings = {
    shop_logo_url: "https://cdn.example.com/desktop.png",
    shop_logo_height: 40,
    logo_config: {
      shop: {
        desktop: { url: "https://cdn.example.com/desktop.png", size: 40, height: 40, pt: 0, pr: 0, pb: 0, pl: 0 },
        tablet: { url: "https://cdn.example.com/tablet.png", size: 32, height: 32, pt: 0, pr: 0, pb: 0, pl: 0 },
        mobile: { url: "https://cdn.example.com/mobile.png", size: 24, height: 24, pt: 2, pr: 0, pb: 0, pl: 0 },
      },
    },
  };
  const mob = pickShopLogoSlot(settings, "mobile");
  assert.equal(mob.url, "https://cdn.example.com/mobile.png");
  assert.equal(mob.size, 24);
  assert.equal(mob.pt, 2);
});

test("mobile falls back to desktop logo url when empty", () => {
  const settings = {
    shop_logo_url: "https://cdn.example.com/legacy.png",
    logo_config: {
      shop: {
        desktop: { url: "https://cdn.example.com/desktop.png", size: 34, height: 34 },
        mobile: { url: "", size: 28, height: 28 },
      },
    },
  };
  const mob = pickShopLogoSlot(settings, "mobile");
  assert.equal(mob.url, "https://cdn.example.com/desktop.png");
  assert.equal(mob.size, 28);
});

test("legacy flat fields when no logo_config", () => {
  const slots = buildShopLogoSlotsFromSettings({
    shop_logo_url: "https://cdn.example.com/only.png",
    shop_logo_height: 36,
  });
  assert.equal(slots.mobile.url, "https://cdn.example.com/only.png");
  assert.equal(slots.mobile.size, 28);
});
