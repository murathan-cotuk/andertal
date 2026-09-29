import test from "node:test";
import assert from "node:assert/strict";
import { buildWarmHomeContainers, resolveHomeComposition, WARM_HOME_LAYOUT } from "./warm-home-composition.js";

const oldHome = [
  { id: "a", type: "hero_banner", slides: [{ image: "/uploads/a.jpg" }, { image: "/uploads/b.jpg" }] },
  { id: "b", type: "image_carousel", title: "", images: [{ url: "/uploads/c.jpg" }] },
  { id: "c", type: "newsletter" },
];

test("design homepage replaces an old composition and reuses its images", () => {
  const { containers, settings } = resolveHomeComposition(oldHome, {}, "");
  assert.deepEqual(containers.map((c) => c.type), ["promo_bento", "feature_grid", "image_carousel", "category_circles", "bestseller_carousel"]);
  assert.equal(containers[0].images[0].url, "/uploads/a.jpg");
  assert.equal(containers[2].images[0].url, "/uploads/c.jpg");
  assert.equal(containers[2].title, "Inspiration der Woche");
  assert.equal(settings.homepage_layout, WARM_HOME_LAYOUT);
});

test("classic design and saved warm pages keep the stored composition", () => {
  assert.equal(resolveHomeComposition(oldHome, {}, "classic").containers, oldHome);
  const saved = [...oldHome, { id: "d", type: "promo_bento" }];
  assert.equal(resolveHomeComposition(saved, {}, "").containers, saved);
  assert.equal(resolveHomeComposition(oldHome, { homepage_layout: WARM_HOME_LAYOUT }, "").containers, oldHome);
  assert.equal(resolveHomeComposition(oldHome, { homepage_layout: "custom" }, "").containers, oldHome);
  assert.notEqual(resolveHomeComposition(oldHome, { homepage_layout: "andertal_home_v1" }, "").containers, oldHome);
});

test("no images → no image carousel, still a full page", () => {
  const types = buildWarmHomeContainers([]).map((c) => c.type);
  assert.deepEqual(types, ["promo_bento", "feature_grid", "category_circles", "bestseller_carousel"]);
});
