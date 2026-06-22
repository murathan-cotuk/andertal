"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Page, Card, Button, Checkbox, BlockStack, InlineStack, Text, Box } from "@shopify/polaris";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { useLt, dateLocaleFor } from "@/lib/locale-text";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";
import { getNotificationsPageCopy } from "@/lib/notifications-page-i18n";
import {
  getNotificationGroupLabel,
  localizeNotificationItem,
  changeSuggestionTypeLabel,
  changeSuggestionItemLabel,
  changeSuggestionFieldLabel,
} from "@/lib/notifications-feed-localize";
import { formatChangeRequestValueForDisplay } from "@/lib/product-change-request-format";

function itemKey(it) {
  return `${it.source_type}:${it.source_id}`;
}

function formatDateDmy(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(dateLocaleFor(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const TABLE_GRID = "40px 100px 90px minmax(120px, 1fr) minmax(90px, 0.8fr) minmax(140px, 1.2fr) minmax(140px, 1.2fr) 100px";

function cellStyle(extra = {}) {
  return {
    padding: "10px 12px",
    borderRight: "1px solid #e5e7eb",
    borderBottom: "1px solid #e5e7eb",
    fontSize: 13,
    lineHeight: 1.45,
    verticalAlign: "top",
    wordBreak: "break-word",
    ...extra,
  };
}

function ChangeSuggestionsTable({ items, busy, selected, onToggle, onDeleteOne, locale, c }) {
  const tbl = c.changeTable;

  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: TABLE_GRID,
          minWidth: 960,
          background: "#f3f4f6",
          borderTop: "1px solid #e5e7eb",
          borderLeft: "1px solid #e5e7eb",
          fontWeight: 600,
          fontSize: 11,
          color: "#4b5563",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        <div style={cellStyle({ display: "flex", justifyContent: "center", alignItems: "center" })}>{tbl.colSelect}</div>
        <div style={cellStyle()}>{tbl.colDate}</div>
        <div style={cellStyle()}>{tbl.colType}</div>
        <div style={cellStyle()}>{tbl.colItem}</div>
        <div style={cellStyle()}>{tbl.colField}</div>
        <div style={{ ...cellStyle(), background: "#fef2f2" }}>{tbl.colCurrent}</div>
        <div style={{ ...cellStyle({ borderRight: "none" }), background: "#f0fdf4" }}>{tbl.colProposed}</div>
        <div style={{ ...cellStyle({ borderRight: "none" }), background: "#f3f4f6" }}>{tbl.colActions}</div>
      </div>

      {items.map((raw, idx) => {
        const it = localizeNotificationItem(raw, locale);
        const k = itemKey(it);
        const href = it.href || "#";
        const currentVal = it.old_value != null ? formatChangeRequestValueForDisplay(it.old_value) : "—";
        const proposedVal = it.new_value != null ? formatChangeRequestValueForDisplay(it.new_value) : "—";
        const rowBg = idx % 2 === 0 ? "#fff" : "#fafafa";

        return (
          <div
            key={k}
            style={{
              display: "grid",
              gridTemplateColumns: TABLE_GRID,
              minWidth: 960,
              borderLeft: "1px solid #e5e7eb",
              background: it.read ? rowBg : "#fffbeb",
            }}
          >
            <div style={cellStyle({ display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 14 })}>
              <Checkbox label="" labelHidden checked={selected.has(k)} onChange={() => onToggle(k)} />
            </div>
            <div style={cellStyle({ color: "#6b7280", whiteSpace: "nowrap" })}>{formatDateDmy(it.created_at, locale)}</div>
            <div style={cellStyle({ fontWeight: 600 })}>{changeSuggestionTypeLabel(it, locale)}</div>
            <div style={cellStyle()}>
              <Link href={href} style={{ color: "#111827", fontWeight: 600, textDecoration: "none" }}>
                {changeSuggestionItemLabel(it, locale)}
              </Link>
            </div>
            <div style={cellStyle({ color: "#374151" })}>{changeSuggestionFieldLabel(it, locale)}</div>
            <div style={{ ...cellStyle(), background: idx % 2 === 0 ? "#fffafa" : "#fef8f8", color: "#374151", whiteSpace: "pre-wrap" }}>
              {currentVal}
            </div>
            <div style={{ ...cellStyle({ borderRight: "none" }), background: idx % 2 === 0 ? "#f8fffa" : "#f3fdf6", color: "#111827", fontWeight: 600, whiteSpace: "pre-wrap" }}>
              {proposedVal}
            </div>
            <div style={{ ...cellStyle({ borderRight: "none" }), display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
              <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: "#0284c7", textDecoration: "none" }}>
                {tbl.open} →
              </Link>
              <Button size="slim" variant="plain" tone="critical" disabled={busy} onClick={() => onDeleteOne(it)}>
                {c.removeFromList}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NotificationRow({ it, busy, selected, onToggle, onDeleteOne, locale }) {
  const c = getNotificationsPageCopy(locale);
  const localized = localizeNotificationItem(it, locale);
  const k = itemKey(it);
  const dt = formatDateDmy(it.created_at, locale);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr auto auto",
        gap: 8,
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: "1px solid #f3f4f6",
        background: it.read ? "#fff" : "#fffbeb",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Checkbox label="" labelHidden checked={selected.has(k)} onChange={() => onToggle(k)} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {!it.read && (
            <span
              title={c.unread}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#ef4444",
                flexShrink: 0,
              }}
            />
          )}
          <Link href={it.href || "#"} style={{ textDecoration: "none", color: "inherit", fontWeight: it.read ? 500 : 700 }}>
            <span style={{ fontSize: 14, color: "#111827" }}>{localized.title}</span>
          </Link>
        </div>
        {localized.subtitle ? (
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, lineHeight: 1.4 }}>{localized.subtitle}</div>
        ) : null}
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>{dt}</div>
      <div>
        <Button size="slim" variant="plain" tone="critical" disabled={busy} onClick={() => onDeleteOne(it)}>
          {c.removeFromList}
        </Button>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const locale = useLocale();
  const lt = useLt();
  const ui = getUI(locale);
  const c = getNotificationsPageCopy(locale);

  const [groups, setGroups] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [activeGroupKey, setActiveGroupKey] = useState(null);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items || []), [groups]);
  const activeGroup = useMemo(() => groups.find((g) => g.key === activeGroupKey) || null, [groups, activeGroupKey]);
  const activeGroupItems = useMemo(() => activeGroup?.items || [], [activeGroup]);
  const isChangeSuggestionTab = activeGroupKey === "change_suggestion";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const data = await client.getNotificationsFeed({ grouped: "1" });
      if (data.grouped && Array.isArray(data.groups)) {
        const nextGroups = data.groups;
        setGroups(nextGroups);
        setActiveGroupKey((prev) => {
          if (prev && nextGroups.some((g) => g.key === prev)) return prev;
          return nextGroups[0]?.key || null;
        });
        setGrandTotal(typeof data.grand_total === "number" ? data.grand_total : (data.groups || []).reduce((s, g) => s + (g.items?.length || 0), 0));
      } else {
        const legacy = data.items || [];
        const nextGroups = [{ key: "all", label_de: c.allFallback, items: legacy, total: legacy.length }];
        setGroups(nextGroups);
        setActiveGroupKey("all");
        setGrandTotal(typeof data.total === "number" ? data.total : legacy.length);
      }
    } catch {
      setGroups([]);
      setActiveGroupKey(null);
      setGrandTotal(0);
    }
    setLoading(false);
  }, [c.allFallback]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getMedusaAdminClient().markNotificationsSeen();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("andertal-notifications-refresh"));
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const visibleKeys = useMemo(() => activeGroupItems.map(itemKey), [activeGroupItems]);

  const toggleOne = (k) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const toggleAllVisible = () => {
    const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));
    setSelected((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) visibleKeys.forEach((k) => n.delete(k));
      else visibleKeys.forEach((k) => n.add(k));
      return n;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const payload = {
        items: [...selected].map((k) => {
          const idx = k.indexOf(":");
          return { source_type: k.slice(0, idx), source_id: k.slice(idx + 1) };
        }),
      };
      await getMedusaAdminClient().deleteNotifications(payload);
      setSelected(new Set());
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("andertal-notifications-refresh"));
      }
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  const deleteAll = async () => {
    if (!await confirmDelete(c.removeAllConfirm)) return;
    setBusy(true);
    try {
      await getMedusaAdminClient().deleteNotifications({ all: true });
      setSelected(new Set());
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("andertal-notifications-refresh"));
      }
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  const deleteOne = async (it) => {
    setBusy(true);
    try {
      await getMedusaAdminClient().deleteNotifications({
        items: [{ source_type: it.source_type, source_id: it.source_id }],
      });
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(itemKey(it));
        return n;
      });
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("andertal-notifications-refresh"));
      }
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  const removeSelectedLabel = c.removeSelected(selected.size);

  const footerText = useMemo(() => {
    const hasVerif = groups.some((x) => x.key === "verification" || x.key === "change_suggestion");
    const extra = hasVerif
      ? lt(", verification, change suggestions", ", doğrulama, değişiklik önerileri", ", vérification, suggestions de modification", ", verificación, sugerencias de cambio", ", verifica, suggerimenti di modifica", ", Verifizierung, Änderungsvorschläge")
      : "";
    return lt(
      `${grandTotal} entries total — up to 500 per category (orders, returns${extra}).`,
      `Toplam ${grandTotal} kayıt — kategori başına en fazla 500 (siparişler, iadeler${extra}).`,
      `${grandTotal} entrées au total — jusqu'à 500 par catégorie (commandes, retours${extra}).`,
      `${grandTotal} entradas en total — hasta 500 por categoría (pedidos, devoluciones${extra}).`,
      `${grandTotal} voci totali — fino a 500 per categoria (ordini, resi${extra}).`,
      `${grandTotal} Einträge gesamt — bis zu 500 je Kategorie (Bestellungen, Rücksendungen${extra}).`,
    );
  }, [groups, grandTotal, lt]);

  return (
    <Page title={c.pageTitle} subtitle={c.pageSubtitle}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">{c.infoText}</Text>
            <InlineStack gap="200" wrap>
              <Button disabled={busy || selected.size === 0} onClick={deleteSelected}>
                {removeSelectedLabel}
              </Button>
              <Button tone="critical" disabled={busy || flatItems.length === 0} onClick={deleteAll}>
                {c.removeAll}
              </Button>
              <Button variant="plain" disabled={busy || loading} onClick={load}>
                {ui.refresh}
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card padding="0">
          {loading ? (
            <Box padding="400">
              <Text as="p">{ui.loading}</Text>
            </Box>
          ) : flatItems.length === 0 ? (
            <Box padding="400">
              <Text as="p" tone="subdued">
                {ui.noNotifications}.
              </Text>
            </Box>
          ) : (
            <div style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: "14px 16px",
                  borderBottom: "1px solid #e5e7eb",
                  background: "#fff",
                }}
              >
                {groups.map((g) => {
                  const count = g.items?.length || 0;
                  const active = g.key === activeGroupKey;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setActiveGroupKey(g.key)}
                      style={{
                        border: active ? "1px solid #111827" : "1px solid #d1d5db",
                        background: active ? "#111827" : "#fff",
                        color: active ? "#fff" : "#374151",
                        borderRadius: 999,
                        padding: "6px 12px",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {getNotificationGroupLabel(g, locale)} ({count})
                    </button>
                  );
                })}
              </div>

              {!isChangeSuggestionTab && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr auto auto",
                    gap: 0,
                    alignItems: "center",
                    padding: "10px 16px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 600,
                    fontSize: 12,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <Checkbox
                      label=""
                      labelHidden
                      checked={visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k))}
                      onChange={toggleAllVisible}
                    />
                  </div>
                  <div>
                    {getNotificationGroupLabel(activeGroup || {}, locale)} ({activeGroupItems.length})
                  </div>
                  <div style={{ textAlign: "right" }}>{ui.colDate}</div>
                  <div />
                </div>
              )}

              {isChangeSuggestionTab && activeGroupItems.length > 0 && (
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #e5e7eb", background: "#fafafa" }}>
                  <InlineStack gap="200" blockAlign="center">
                    <Checkbox
                      label=""
                      labelHidden
                      checked={visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k))}
                      onChange={toggleAllVisible}
                    />
                    <Text as="span" variant="bodySm" fontWeight="semibold" tone="subdued">
                      {getNotificationGroupLabel(activeGroup || {}, locale)} ({activeGroupItems.length})
                    </Text>
                  </InlineStack>
                </div>
              )}

              <div>
                {activeGroupItems.length === 0 ? (
                  <Box padding="400">
                    <Text as="p" tone="subdued">
                      {c.noInCategory}
                    </Text>
                  </Box>
                ) : isChangeSuggestionTab ? (
                  <ChangeSuggestionsTable
                    items={activeGroupItems}
                    busy={busy}
                    selected={selected}
                    onToggle={toggleOne}
                    onDeleteOne={deleteOne}
                    locale={locale}
                    c={c}
                  />
                ) : (
                  activeGroupItems.map((it) => (
                    <NotificationRow
                      key={itemKey(it)}
                      it={it}
                      busy={busy}
                      selected={selected}
                      onToggle={toggleOne}
                      onDeleteOne={deleteOne}
                      locale={locale}
                    />
                  ))
                )}
              </div>
            </div>
          )}
          {!loading && flatItems.length > 0 && (
            <Box padding="300">
              <Text as="p" tone="subdued">
                {footerText}
              </Text>
            </Box>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
