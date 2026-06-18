"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Page, Card, Button, Checkbox, BlockStack, InlineStack, Text, Box } from "@shopify/polaris";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";

function itemKey(it) {
  return `${it.source_type}:${it.source_id}`;
}

function formatDateDmy(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
  return d.toLocaleDateString(loc, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function NotificationRow({ it, busy, selected, onToggle, onDeleteOne, locale }) {
  const k = itemKey(it);
  const dt = formatDateDmy(it.created_at, locale);
  const removeLabel = locale === "en" ? "Remove from list" : locale === "tr" ? "Listeden kaldır" : "Aus Liste entfernen";
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
              title={locale === "en" ? "Unread" : locale === "tr" ? "Okunmadı" : "Ungelesen"}
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
            <span style={{ fontSize: 14, color: "#111827" }}>{it.title}</span>
          </Link>
        </div>
        {it.subtitle ? (
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, lineHeight: 1.4 }}>{it.subtitle}</div>
        ) : null}
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>{dt}</div>
      <div>
        <Button size="slim" variant="plain" tone="critical" disabled={busy} onClick={() => onDeleteOne(it)}>
          {removeLabel}
        </Button>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const locale = useLocale();
  const ui = getUI(locale);

  const [groups, setGroups] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [activeGroupKey, setActiveGroupKey] = useState(null);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items || []), [groups]);
  const activeGroupItems = useMemo(() => {
    if (!activeGroupKey) return [];
    return groups.find((g) => g.key === activeGroupKey)?.items || [];
  }, [groups, activeGroupKey]);

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
        const nextGroups = [{ key: "all", label_de: "Alle", description_de: "", items: legacy, total: legacy.length }];
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
  }, []);

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

  const allKeys = useMemo(() => flatItems.map(itemKey), [flatItems]);
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

  const toggleSectionKeys = (sectionItems) => {
    const keys = sectionItems.map(itemKey);
    const allIn = keys.length > 0 && keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const n = new Set(prev);
      if (allIn) keys.forEach((k) => n.delete(k));
      else keys.forEach((k) => n.add(k));
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
    const confirmMsg = locale === "en"
      ? "Remove all entries from this view? The underlying data (orders, sellers, etc.) will remain unchanged — only the display here will be hidden."
      : locale === "tr"
      ? "Tüm girişler bu görünümden kaldırılsın mı? Asıl veriler (siparişler, satıcılar vb.) değişmeyecek — yalnızca buradaki görüntü gizlenecek."
      : "Alle Einträge aus dieser Übersicht entfernen? Die Daten selbst (Bestellungen, Verkäufer usw.) bleiben unverändert — nur die Anzeige hier wird ausgeblendet.";
    if (!await confirmDelete(confirmMsg)) return;
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

  const pageTitle = locale === "en" ? "Notifications" : locale === "tr" ? "Bildirimler" : "Benachrichtigungen";
  const pageSubtitle = locale === "en"
    ? "Select a category above; only its notifications appear below."
    : locale === "tr"
    ? "Yukarıdan bir kategori seçin; yalnızca ilgili bildirimler aşağıda görünür."
    : "Kategorien oben auswählen, darunter erscheinen nur die zugehörigen Benachrichtigungen.";
  const infoText = locale === "en"
    ? "Opening this page marks unread notifications as read (the red counter at the top disappears). Orders and other records are never deleted by this action."
    : locale === "tr"
    ? "Bu sayfayı açmak okunmamış bildirimleri okundu olarak işaretler (üstteki kırmızı sayaç kaybolur). Siparişler ve diğer kayıtlar bu işlemle hiçbir zaman silinmez."
    : "Beim Öffnen dieser Seite werden ungelesene Hinweise als gelesen markiert (roter Zähler oben verschwindet). Bestellungen und andere Stammdaten werden nie durch diese Aktion gelöscht.";
  const removeSelectedLabel = locale === "en"
    ? `Remove selected from list (${selected.size})`
    : locale === "tr"
    ? `Seçilenleri listeden kaldır (${selected.size})`
    : `Ausgewählte aus Liste entfernen (${selected.size})`;
  const removeAllLabel = locale === "en" ? "Remove all from list" : locale === "tr" ? "Tümünü listeden kaldır" : "Alle aus Liste entfernen";
  const categoryLabel = locale === "en" ? "Category" : locale === "tr" ? "Kategori" : "Kategorie";
  const noNotifInCategory = locale === "en" ? "No notifications in this category." : locale === "tr" ? "Bu kategoride bildirim yok." : "Keine Benachrichtigungen in dieser Kategorie.";

  const getGroupLabel = (g) => {
    if (locale === "en" && g.label_en) return g.label_en;
    if (locale === "tr" && g.label_tr) return g.label_tr;
    return g.label_de || g.key;
  };

  const footerText = () => {
    const hasVerif = groups.some((x) => x.key === "verification" || x.key === "change_suggestion");
    if (locale === "en") {
      return `${grandTotal} entries total — up to 500 per category (orders, returns${hasVerif ? ", verification, change suggestions" : ""}).`;
    }
    if (locale === "tr") {
      return `Toplam ${grandTotal} kayıt — kategori başına en fazla 500 (siparişler, iadeler${hasVerif ? ", doğrulama, değişiklik önerileri" : ""}).`;
    }
    return `${grandTotal} Einträge gesamt — bis zu 500 je Kategorie (Bestellungen, Rücksendungen${hasVerif ? ", Verifizierung, Änderungsvorschläge" : ""}).`;
  };

  return (
    <Page title={pageTitle} subtitle={pageSubtitle}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">{infoText}</Text>
            <InlineStack gap="200" wrap>
              <Button disabled={busy || selected.size === 0} onClick={deleteSelected}>
                {removeSelectedLabel}
              </Button>
              <Button tone="critical" disabled={busy || flatItems.length === 0} onClick={deleteAll}>
                {removeAllLabel}
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
                      {getGroupLabel(g)} ({count})
                    </button>
                  );
                })}
              </div>

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
                  {getGroupLabel(groups.find((g) => g.key === activeGroupKey) || {})} (
                  {activeGroupItems.length})
                </div>
                <div style={{ textAlign: "right" }}>{ui.colDate}</div>
                <div />
              </div>

              <div>
                {activeGroupItems.length === 0 ? (
                  <Box padding="400">
                    <Text as="p" tone="subdued">
                      {noNotifInCategory}
                    </Text>
                  </Box>
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
                {footerText()}
              </Text>
            </Box>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
