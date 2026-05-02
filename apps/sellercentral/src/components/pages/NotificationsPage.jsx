"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Page, Card, Button, Checkbox, BlockStack, InlineStack, Text, Box } from "@shopify/polaris";
import { Link } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function itemKey(it) {
  return `${it.source_type}:${it.source_id}`;
}

function NotificationRow({ it, busy, selected, onToggle, onDeleteOne }) {
  const k = itemKey(it);
  const dt = it.created_at ? new Date(it.created_at).toLocaleString("de-DE") : "—";
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
        <Button size="slim" variant="plain" tone="critical" disabled={busy} onClick={() => onDeleteOne(it)}>
          Aus Liste entfernen
        </Button>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const [groups, setGroups] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const flatItems = useMemo(() => groups.flatMap((g) => g.items || []), [groups]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const data = await client.getNotificationsFeed({ grouped: "1" });
      if (data.grouped && Array.isArray(data.groups)) {
        setGroups(data.groups);
        setGrandTotal(typeof data.grand_total === "number" ? data.grand_total : (data.groups || []).reduce((s, g) => s + (g.items?.length || 0), 0));
      } else {
        const legacy = data.items || [];
        setGroups([{ key: "all", label_de: "Alle", description_de: "", items: legacy, total: legacy.length }]);
        setGrandTotal(typeof data.total === "number" ? data.total : legacy.length);
      }
    } catch {
      setGroups([]);
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
    if (
      !window.confirm(
        "Alle Einträge aus dieser Übersicht entfernen? Die Daten selbst (Bestellungen, Verkäufer usw.) bleiben unverändert — nur die Anzeige hier wird ausgeblendet.",
      )
    ) {
      return;
    }
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

  return (
    <Page
      title="Benachrichtigungen"
      subtitle="Nach Kategorie gruppiert. Einträge werden nicht automatisch gelöscht — nur wenn Sie sie aus dieser Liste entfernen (technisch: Ausblendung für Ihr Konto)."
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">
              Beim Öffnen dieser Seite werden ungelesene Hinweise als gelesen markiert (roter Zähler oben verschwindet).
              Bestellungen und andere Stammdaten werden nie durch diese Aktion gelöscht.
            </Text>
            <InlineStack gap="200" wrap>
              <Button disabled={busy || selected.size === 0} onClick={deleteSelected}>
                Ausgewählte aus Liste entfernen ({selected.size})
              </Button>
              <Button tone="critical" disabled={busy || flatItems.length === 0} onClick={deleteAll}>
                Alle aus Liste entfernen
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
          ) : flatItems.length === 0 ? (
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
                  background: "#fafafa",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Checkbox label="" labelHidden checked={allKeys.length > 0 && selected.size === allKeys.length} onChange={toggleAll} />
                </div>
                <div>Gesamt ({grandTotal})</div>
                <div style={{ textAlign: "right" }}>Datum</div>
                <div />
              </div>

              {groups.map((g) => {
                const sectionItems = g.items || [];
                if (sectionItems.length === 0) return null;
                const sectionKeys = sectionItems.map(itemKey);
                const allSectionSelected = sectionKeys.length > 0 && sectionKeys.every((k) => selected.has(k));
                return (
                  <div key={g.key}>
                    <div
                      style={{
                        padding: "14px 16px 10px",
                        background: "linear-gradient(to bottom, #f8fafc 0%, #fff 100%)",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      <BlockStack gap="100">
                        <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
                          <BlockStack gap="050">
                            <Text as="h2" variant="headingSm">
                              {g.label_de}
                            </Text>
                            {g.description_de ? (
                              <Text as="p" variant="bodySm" tone="subdued">
                                {g.description_de}
                              </Text>
                            ) : null}
                          </BlockStack>
                          <InlineStack gap="200" wrap>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {sectionItems.length} Einträge
                            </Text>
                            <Button size="slim" variant="plain" onClick={() => toggleSectionKeys(sectionItems)}>
                              {allSectionSelected ? "Auswahl aufheben" : "Alle in dieser Kategorie"}
                            </Button>
                          </InlineStack>
                        </InlineStack>
                      </BlockStack>
                    </div>
                    <div>
                      {sectionItems.map((it) => (
                        <NotificationRow
                          key={itemKey(it)}
                          it={it}
                          busy={busy}
                          selected={selected}
                          onToggle={toggleOne}
                          onDeleteOne={deleteOne}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!loading && flatItems.length > 0 && (
            <Box padding="300">
              <Text as="p" tone="subdued">
                {grandTotal} Einträge gesamt — bis zu 500 je Kategorie (Bestellungen, Rücksendungen
                {groups.some((x) => x.key === "verification") ? ", Verifizierung, Produktänderungen" : ""}
                ).
              </Text>
            </Box>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
