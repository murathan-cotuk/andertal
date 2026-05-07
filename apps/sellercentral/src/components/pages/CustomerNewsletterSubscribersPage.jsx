"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Page, Layout, Card, Text, BlockStack, InlineStack, Box, TextField } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtCents(c) {
  return (Number(c || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €";
}

export default function CustomerNewsletterSubscribersPage() {
  const router = useRouter();
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    const ok = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(ok);
    setAuthChecked(true);
    if (!ok) {
      router.replace("/dashboard");
    }
  }, [router]);

  useEffect(() => {
    if (!isSuperuser) return;
    setLoading(true);
    getMedusaAdminClient()
      .getCustomers()
      .then((d) => {
        const list = Array.isArray(d?.customers) ? d.customers : [];
        setCustomers(list.filter((c) => !!c.newsletter_opted_in));
      })
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, [isSuperuser]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.first_name, c.last_name, c.email, c.customer_number, c.country]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [customers, search]);

  if (!authChecked || !isSuperuser) return null;

  return (
    <Page title="Newsletter-Abonnenten">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text as="h2" variant="headingSm">
                  Nur Kunden mit Newsletter-Opt-in
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
                  placeholder="Name, E-Mail, Kundennummer…"
                />
              </Box>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      {["Kundennr.", "Name", "E-Mail", "Land", "Bestellungen", "Umsatz", "Letzter Kauf"].map((h) => (
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
                        <td colSpan={7} style={{ padding: 36, textAlign: "center", color: "#9ca3af" }}>
                          Laden…
                        </td>
                      </tr>
                    )}
                    {!loading && filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: 36, textAlign: "center", color: "#9ca3af" }}>
                          Keine Newsletter-Abonnenten gefunden.
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      filtered.map((c, i) => (
                        <tr
                          key={c.id || i}
                          style={{ borderBottom: "1px solid #f3f4f6", cursor: c.id ? "pointer" : "default" }}
                          onClick={() => c.id && router.push(`/customers/${c.id}`)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#fafafa";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "";
                          }}
                        >
                          <td style={{ padding: "10px 12px", fontWeight: 700, color: "#6b7280", fontSize: 12 }}>
                            {c.customer_number ? `#${c.customer_number}` : "—"}
                          </td>
                          <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                            {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#4b5563" }}>{c.email || "—"}</td>
                          <td style={{ padding: "10px 12px", color: "#6b7280" }}>{c.country || "—"}</td>
                          <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600 }}>
                            {c.order_count || 0}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600 }}>
                            {fmtCents(c.total_spent)}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                            {fmtDate(c.last_order)}
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
