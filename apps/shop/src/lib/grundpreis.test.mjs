import test from "node:test";
import assert from "node:assert/strict";
import { computeGrundpreis, resolveUnitFields } from "./grundpreis.js";

test("g content is always shown per 1 kg (PAngV 2022)", () => {
  const gp = computeGrundpreis({ unit_type: "g", unit_value: "200", unit_reference: "100" }, null, 500);
  assert.equal(gp.referenceLabel, "1 kg");
  assert.equal(gp.perUnitCents, 2500);
  assert.equal(gp.contentLabel, "200 g");
  assert.equal(gp.display, "(1 kg = 25,00 €)");
});

test("ml content is shown per 1 l, German decimal input accepted", () => {
  const gp = computeGrundpreis({ unit_type: "ml", unit_value: "30" }, null, 599);
  assert.equal(gp.referenceLabel, "1 l");
  assert.equal(gp.perUnitCents, 19967);
  const half = computeGrundpreis({ unit_type: "L", unit_value: "0,5" }, null, 199);
  assert.equal(half.perUnitCents, 398);
  assert.equal(half.contentLabel, "0,5 l");
});

test("variant content wins over the parent's", () => {
  const parent = { unit_type: "ml", unit_value: "30" };
  const variant = { unit_type: "ml", unit_value: "60" };
  assert.equal(resolveUnitFields(parent, variant), variant);
  assert.equal(computeGrundpreis(parent, variant, 1200).perUnitCents, 20000);
  assert.equal(computeGrundpreis(parent, { color: "red" }, 600).perUnitCents, 20000);
});

test("pieces keep the seller's reference quantity", () => {
  const gp = computeGrundpreis({ unit_type: "stück", unit_value: "10", unit_reference: "1" }, null, 450);
  assert.equal(gp.display, "(1 Stück = 0,45 €)");
});

test("missing or invalid data yields no unit price", () => {
  assert.equal(computeGrundpreis({}, null, 100), null);
  assert.equal(computeGrundpreis({ unit_type: "g", unit_value: "0" }, null, 100), null);
  assert.equal(computeGrundpreis({ unit_type: "g", unit_value: "100" }, null, 0), null);
});
