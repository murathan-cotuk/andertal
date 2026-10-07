import test from "node:test";
import assert from "node:assert/strict";

// metafield-definitions.js is a client module importing "@/lib/prop-labels"; test the pure merge
// by loading the source and evaluating only the exported helper.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./metafield-definitions.js", import.meta.url), "utf8");
const helper = src.slice(src.indexOf("/** Packaging units"));
const mod = await import("data:text/javascript," + encodeURIComponent(helper));
const { mergeMetafieldRows } = mod;

test("same key → one row, values joined; duplicates removed", () => {
  const rows = mergeMetafieldRows([{ key: "design", value: "Blume" }, { key: "design", value: "Stern" }, { key: "design", value: "Blume" }], []);
  assert.deepEqual(rows, [{ key: "design", values: ["Blume", "Stern"] }]);
});

test("variant replaces the parent's value for the same key; parent-only keys stay", () => {
  const rows = mergeMetafieldRows(
    [{ key: "material", value: "Baumwolle" }, { key: "farbe", value: "Rot" }],
    [{ key: "Farbe", value: "Blau" }, { key: "groesse", value: "M" }],
  );
  assert.deepEqual(rows, [
    { key: "material", values: ["Baumwolle"] },
    { key: "Farbe", values: ["Blau"] },
    { key: "groesse", values: ["M"] },
  ]);
});

test("packaging units and empty values are hidden", () => {
  assert.deepEqual(mergeMetafieldRows([{ key: "packaging_unit", value: "Karton" }, { key: "packaging_unit_plural", value: "Kartons" }, { key: "x", value: "" }], []), []);
});
