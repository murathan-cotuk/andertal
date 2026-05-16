import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isEuOriginVerified,
  pickEuOriginFromMetadata,
  mergeMadeInEuropeBadge,
  EU_ORIGIN_STATUS,
} from "./eu-origin.js";

describe("eu-origin", () => {
  it("isEuOriginVerified only when status is verified", () => {
    assert.equal(isEuOriginVerified({ eu_origin_status: "verified" }), true);
    assert.equal(isEuOriginVerified({ eu_origin_status: "pending" }), false);
    assert.equal(isEuOriginVerified({}), false);
  });

  it("pickEuOriginFromMetadata normalizes strings", () => {
    const p = pickEuOriginFromMetadata({
      eu_origin_country: " DE ",
      eu_origin_status: "VERIFIED",
    });
    assert.equal(p.eu_origin_country, "DE");
    assert.equal(p.eu_origin_status, "verified");
  });

  it("mergeMadeInEuropeBadge applies defaults", () => {
    const b = mergeMadeInEuropeBadge({ width: 120 });
    assert.equal(b.width, 120);
    assert.equal(b.height, 32);
    assert.equal(b.offset_left, 10);
  });
});
