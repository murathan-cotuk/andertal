"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Page, Layout, Card, Text, BlockStack, InlineStack, Box, TextField } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function CustomerNewsletterSubscribersPage() {
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [search, setSearch] = useState("");
  const [subscribers, setSubscribers] = useState([]);

  useEffect(() => {
    const ok = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(ok);
    setAuthChecked(true);
  }, []);

  const loadSubscribers = React.useCallback(() => {
    if (!isSuperuser) return;
    setLoading(true);
    getMedusaAdminClient()
      .getNewsletterSubscribers()
      .then((d) => {
        setSubscribers(Array.isArray(d?.subscribers) ? d.subscribers : []);
      })
      .catch(() => setSubscribers([]))
      .finally(() => setLoading(false));
  }, [isSuperuser]);

  useEffect(() => {
    if (!isSuperuser) return;
    loadSubscribers();
  }, [isSuperuser, loadSubscribers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subscribers;
    return subscribers.filter((s) =>
      [s.email, s.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [subscribers, search]);

  if (!authChecked || !isSuperuser) return null;

  const setStatus = async (id, status) => {
    if (!id) return;
    setBusyId(id);
    try {
      await getMedusaAdminClient().updateNewsletterSubscriber(id, { status });
      await loadSubscribers();
    } finally {
      setBusyId("");
    }
  };

  const statusBadge = (statusRaw) => {
    const status = String(statusRaw || "active").toLowerCase();
    if (status === "active") return { label: "Kayıtlı", bg: "#dcfce7", color: "#166534" };
    if (status === "unsubscribed") return { label: "Çıkmış", bg: "#fee2e2", color: "#991b1b" };
    if (status === "deactivated") return { label: "Deaktif", bg: "#e5e7eb", color: "#374151" };
    return { label: status, bg: "#f3f4f6", color: "#4b5563" };
  };

  return (
    <Page title="Newsletter-Abonnenten">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text as="h2" variant="headingSm">
                  Newsletter-Abonnenten (Datenbankgruppe)
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {filtered.length} Abonnent{filtered.length !== 1 ? "en" : ""}
                </Text>
              </InlineStack>

              <Box maxWidth="420px">
                <TextField
                  label="Suche"
                  labelHidden
                  value={search}
                  onChange={setSearch}
                  autoComplete="off"
                  placeholder="E-Mail veya Quelle…"
                />
              </Box>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      {["E-Mail", "Quelle", "Durum", "Abonniert am", "Aksiyon"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "10px 12px",
                            textAlign: "left",
                            fontWeight: 600,
                            fontSize: 11,
                            color: "#6b7280",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={5} style={{ padding: 36, textAlign: "center", color: "#9ca3af" }}>
                          Laden…
                        </td>
                      </tr>
                    )}
                    {!loading && filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: 36, textAlign: "center", color: "#9ca3af" }}>
                          Keine Newsletter-Abonnenten gefunden.
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      filtered.map((s, i) => (
                        <tr
                          key={s.id || i}
                          style={{ borderBottom: "1px solid #f3f4f6" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#fafafa";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "";
                          }}
                        >
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                            {s.email || "—"}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12, textTransform: "capitalize" }}>
                            {String(s.source || "landing_page").replace(/_/g, " ")}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                            {(() => {
                              const b = statusBadge(s.status);
                              return (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "3px 8px",
                                    borderRadius: 999,
                                    fontWeight: 700,
                                    background: b.bg,
                                    color: b.color,
                                  }}
                                >
                                  {b.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                            {fmtDate(s.subscribed_at)}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                            <InlineStack gap="200" wrap={false}>
                              {String(s.status || "active").toLowerCase() !== "active" ? (
                                <button
                                  type="button"
                                  disabled={busyId === s.id}
                                  onClick={() => setStatus(s.id, "active")}
                                  style={{
                                    padding: "4px 8px",
                                    border: "1px solid #16a34a",
                                    borderRadius: 6,
                                    background: "#f0fdf4",
                                    color: "#166534",
                                    fontSize: 12,
                                    cursor: "pointer",
                                  }}
                                >
                                  Aktif et
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busyId === s.id}
                                  onClick={() => setStatus(s.id, "deactivated")}
                                  style={{
                                    padding: "4px 8px",
                                    border: "1px solid #9ca3af",
                                    borderRadius: 6,
                                    background: "#f9fafb",
                                    color: "#374151",
                                    fontSize: 12,
                                    cursor: "pointer",
                                  }}
                                >
                                  Deaktif et
                                </button>
                              )}
                            </InlineStack>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
