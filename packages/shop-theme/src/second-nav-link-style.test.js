import test from "node:test";
import assert from "node:assert/strict";
import { mergeLoadedShopStyles } from "./merge-styles.js";
import { resolveSecondNavLinkStyles } from "./second-nav-link-style.js";

test("resolveSecondNavLinkStyles uses saved values", () => {
  const merged = mergeLoadedShopStyles({
    secondNav: {
      link_style_desktop: "pill",
      link_style_tablet: "classic",
      link_style_mobile: "pill",
    },
  });
  assert.deepEqual(resolveSecondNavLinkStyles(merged), {
    desktop: "pill",
    tablet: "classic",
    mobile: "pill",
  });
});

test("resolveSecondNavLinkStyles applies pill_bar preset when link_style not set", () => {
  const merged = mergeLoadedShopStyles({
    secondNav: { variant: "pill_bar" },
  });
  assert.deepEqual(resolveSecondNavLinkStyles(merged), {
    desktop: "pill",
    tablet: "pill",
    mobile: "pill",
  });
});

test("explicit link_style wins over pill_bar preset", () => {
  const merged = mergeLoadedShopStyles({
    secondNav: {
      variant: "pill_bar",
      link_style_desktop: "classic",
    },
  });
  assert.equal(resolveSecondNavLinkStyles(merged).desktop, "classic");
});
