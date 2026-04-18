"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Page, Card, Button, Checkbox, BlockStack, InlineStack, Text, Box } from "@shopify/polaris";
import { Link } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function itemKey(it) {
  return `${it.source_type}:${it.source_id}`;
}

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const data = await client.getNotificationsFeed({ limit: 200, offset: 0 });
      setItems(data.items || []);
      setTotal(typeof data.total === "number" ? data.total : (data.items || []).length);
    } catch {
      setItems([]);
      setTotal(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getMedusaAdminClient().markNotificationsSeen();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("belucha-notifications-refresh"));
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

  const allKeys = useMemo(() => items.map(itemKey), [items]);

  const toggleOne = (k) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === allKeys.length) setSelected(new Set());
    else setSelected(new Set(allKeys));
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
        window.dispatchEvent(new Event("belucha-notifications-refresh"));
      }
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  const deleteAll = async () => {
    if (!window.confirm("Alle Benachrichtigungen aus dieser Liste entfernen? Die zugrunde liegenden Daten (Bestellungen usw.) bleiben erhalten.")) {
      return;
    }
    setBusy(true);
    try {
      await getMedusaAdminClient().deleteNotifications({ all: true });
      setSelected(new Set());
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("belucha-notifications-refresh"));
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
        window.dispatchEvent(new Event("belucha-notifications-refresh"));
      }
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  return (
    <Page title="Benachrichtigungen" subtitle="Alle Benachrichtigungen an einem Ort. Gelesene Einträge sind ohne roten Hinweis; löschen entfernt nur die Anzeige hier.">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">
              Beim Öffnen dieser Seite werden ungelesene Hinweise als gelesen markiert (roter Zähler oben verschwindet). Einträge bleiben sichtbar, bis Sie sie löschen.
            </Text>
            <InlineStack gap="200" wrap>
              <Button disabled={busy || selected.size === 0} onClick={deleteSelected}>
                Ausgewählte löschen ({selected.size})
              </Button>
              <Button tone="critical" disabled={busy || items.length === 0} onClick={deleteAll}>
                Alle löschen
              </Button>
              <Button variant="plain" disabled={busy || loading} onClick={load}>
                Aktualisieren
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card padding="0">
          {loading ? (
            <Box padding="400">
              <Text as="p">Laden…</Text>
            </Box>
          ) : items.length === 0 ? (
            <Box padding="400">
              <Text as="p" tone="subdued">
                Keine Benachrichtigungen.
              </Text>
            </Box>
          ) : (
            <div style={{ width: "100%" }}>
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
                }}
              >
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Checkbox label="" labelHidden checked={allKeys.length > 0 && selected.size === allKeys.length} onChange={toggleAll} />
                </div>
                <div>Benachrichtigung</div>
                <div style={{ textAlign: "right" }}>Datum</div>
                <div />
              </div>
              {items.map((it) => {
                const k = itemKey(it);
                const dt = it.created_at ? new Date(it.created_at).toLocaleString("de-DE") : "—";
                return (
                  <div
                    key={k}
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
                      <Checkbox label="" labelHidden checked={selected.has(k)} onChange={() => toggleOne(k)} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {!it.read && (
                          <span
                            title="Ungelesen"
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
                      <Button size="slim" variant="plain" tone="critical" disabled={busy} onClick={() => deleteOne(it)}>
                        Löschen
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!loading && items.length > 0 && (
            <Box padding="300">
              <Text as="p" tone="subdued">
                {total} Einträge (Bestellungen, Rücksendungen, Verifizierung, Produktänderungen — jeweils bis 500).
              </Text>
            </Box>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
