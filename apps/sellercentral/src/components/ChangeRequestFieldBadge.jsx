"use client";

import React, { useMemo, useState } from "react";
import { Popover, Box, BlockStack, Text } from "@shopify/polaris";
import { useLocale } from "next-intl";
import {
  formatChangeRequestValueForDisplay,
  fieldNameDisplayLabel,
} from "@/lib/product-change-request-format";

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
          cur: "Mevcut değer",
          prop: "Önerilen değer",
          hint: "Onay bekleyen değişiklik",
        }
      : locale === "de"
        ? {
            cur: "Aktueller Wert",
            prop: "Vorgeschlagener Wert",
            hint: "Änderung ausstehend",
          }
        : {
            cur: "Current value",
            prop: "Proposed value",
            hint: "Change pending approval",
          };

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
          <BlockStack gap="100">
            <Text as="p" variant="bodyXs" tone="subdued">
              {l.cur}
            </Text>
            <div style={{ fontSize: 13, lineHeight: 1.45, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
              {formatChangeRequestValueForDisplay(cr.old_value)}
            </div>
          </BlockStack>
          <BlockStack gap="100">
            <Text as="p" variant="bodyXs" tone="subdued">
              {l.prop}
            </Text>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.45,
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
                fontWeight: 600,
                color: "var(--p-color-text)",
              }}
            >
              {formatChangeRequestValueForDisplay(cr.new_value)}
            </div>
          </BlockStack>
        </BlockStack>
      </Box>
    </Popover>
  );
}
