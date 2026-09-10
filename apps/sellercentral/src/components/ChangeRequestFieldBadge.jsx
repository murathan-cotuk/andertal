"use client";

import React, { useMemo, useState } from "react";
import { Popover, Box, BlockStack, Text } from "@shopify/polaris";
import { useLocale } from "next-intl";
import {
  buildChangeRequestDiff,
  fieldNameDisplayLabel,
} from "@/lib/product-change-request-format";

function changeRequestSellerLabel(cr) {
  if (!cr || typeof cr !== "object") return "—";
  return String(
    cr.seller_label ||
      cr.seller_store_name ||
      cr.seller_company_name ||
      cr.seller_email ||
      cr.seller_id ||
      "—"
  );
}

export function ChangeRequestFieldBadge({ requests, fieldName }) {
  const locale = useLocale();
  const list = useMemo(
    () => (requests || []).filter((r) => String(r.field_name) === String(fieldName)),
    [requests, fieldName],
  );
  const [open, setOpen] = useState(false);

  if (!list.length) return null;
  const cr = list[0];

  const l =
    locale === "tr"
      ? {
          cur: "Önce",
          prop: "Sonra",
          hint: "Onay bekleyen değişiklik",
          seller: "Öneren satıcı",
          empty: "(boş)",
          removed: "(kaldırıldı)",
          noChange: "Fiili bir değişiklik yok.",
          changed: "alan değişti",
        }
      : locale === "de"
        ? {
            cur: "Vorher",
            prop: "Nachher",
            hint: "Änderung ausstehend",
            seller: "Vorschlag von",
            empty: "(leer)",
            removed: "(entfernt)",
            noChange: "Keine effektive Änderung.",
            changed: "Feld(er) geändert",
          }
        : {
            cur: "Before",
            prop: "After",
            hint: "Change pending approval",
            seller: "Suggested by",
            empty: "(empty)",
            removed: "(removed)",
            noChange: "No effective change.",
            changed: "field(s) changed",
          };
  const diff = buildChangeRequestDiff(cr.old_value, cr.new_value);

  return (
    <Popover
      active={open}
      autofocusTarget="first-node"
      preferredPosition="below"
      onClose={() => setOpen(false)}
      activator={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "1px solid #dc2626",
            background: "#fef2f2",
            color: "#b91c1c",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            lineHeight: 1,
            flexShrink: 0,
            verticalAlign: "middle",
          }}
          aria-label={l.hint}
          title={l.hint}
        >
          <span style={{ fontSize: 12, fontWeight: 800 }}>!</span>
        </button>
      }
    >
      <Box padding="400" maxWidth="min(420px, 92vw)">
        <BlockStack gap="300">
          <Text as="p" variant="bodySm" fontWeight="semibold">
            {fieldNameDisplayLabel(cr.field_name, locale)}
          </Text>
          <Text as="p" variant="bodyXs" tone="subdued">
            {l.hint}
          </Text>
          <Text as="p" variant="bodyXs" tone="subdued">
            {l.seller}: {changeRequestSellerLabel(cr)}
          </Text>
          {diff.kind === "scalar" ? (
            <>
              <BlockStack gap="100">
                <Text as="p" variant="bodyXs" tone="subdued">{l.cur}</Text>
                <div style={{ fontSize: 13, lineHeight: 1.45, wordBreak: "break-word", whiteSpace: "pre-wrap", color: "#6b7280", textDecoration: diff.changed ? "line-through" : "none" }}>
                  {diff.before || l.empty}
                </div>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" variant="bodyXs" tone="subdued">{l.prop}</Text>
                <div style={{ fontSize: 13, lineHeight: 1.45, wordBreak: "break-word", whiteSpace: "pre-wrap", fontWeight: 600, color: "var(--p-color-text)" }}>
                  {diff.after || l.empty}
                </div>
              </BlockStack>
            </>
          ) : diff.rows.length === 0 ? (
            <Text as="p" variant="bodySm" tone="subdued">{l.noChange}</Text>
          ) : (
            <BlockStack gap="200">
              <Text as="p" variant="bodyXs" tone="subdued">{`${diff.rows.length} ${l.changed}`}</Text>
              {diff.rows.map((r) => (
                <div key={r.path} style={{ borderLeft: "3px solid var(--p-color-border)", paddingLeft: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--p-color-text)", marginBottom: 2 }}>{r.path}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.45, color: "#9ca3af", textDecoration: "line-through", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                    {r.before ? r.before : l.empty}
                  </div>
                  {r.status === "removed" ? (
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>{l.removed}</div>
                  ) : (
                    <div style={{ fontSize: 13, lineHeight: 1.45, color: "#047857", fontWeight: 600, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                      {r.after ? r.after : l.empty}
                    </div>
                  )}
                </div>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </Box>
    </Popover>
  );
}
