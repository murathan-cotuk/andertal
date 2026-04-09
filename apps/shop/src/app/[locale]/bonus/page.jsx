"use client";

import { useState, useEffect } from "react";
import { useCustomerAuth as useAuth, useAuthGuard, getToken } from "@belucha/lib";
import NewtonsCradle from "@/components/NewtonsCradle";
import { useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountSidebar from "@/components/account/AccountSidebar";
import { getMedusaClient } from "@/lib/medusa-client";

const ORANGE = "#ff971c";
const DARK = "#1A1A1A";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";

function fmtLedgerDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function sourceLabel(source) {
  const m = {
    registration: "Registrierung",
    order_earn: "Bestellung",
    order_redeem: "Einlösung",
    manual: "Anpassung",
  };
  return m[source] || source || "—";
}

export default function BonusPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const { user, logout } = useAuth();
  const router = useRouter();
  const [points, setPoints] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const token = getToken("customer");
      if (!token) {
        setLoading(false);
        return;
      }
      const client = getMedusaClient();
      const r = await client.getCustomer(token);
      setPoints(r?.customer?.bonus_points ?? 0);
      setLedger(Array.isArray(r?.customer?.bonus_ledger) ? r.customer.bonus_ledger : []);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      <main style={{ flex: 1, padding: "40px 24px", width: "100%", boxSizing: "border-box" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: DARK, margin: "0 0 8px" }}>Meine Bonuspunkte</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: "0 0 28px", lineHeight: 1.5 }}>
            Sammeln und einlösen Sie Punkte bei jedem Einkauf — inklusive Übersicht Ihrer letzten Bewegungen.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, alignItems: "start" }}>
            <AccountSidebar onLogout={() => { logout(); router.push("/"); }} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  padding: "28px 32px",
                  marginBottom: 24,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: GRAY, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Aktueller Kontostand
                </div>
                {loading ? (
                  <div style={{ fontSize: 20, color: GRAY }}>…</div>
                ) : (
                  <div style={{ fontSize: 42, fontWeight: 800, color: ORANGE, lineHeight: 1.2 }}>
                    {points ?? 0} <span style={{ fontSize: 20, fontWeight: 600, color: DARK }}>Punkte</span>
                  </div>
                )}
              </div>

              <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "24px 28px", marginBottom: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: DARK, margin: "0 0 16px" }}>Verlauf</h2>
                {loading ? (
                  <NewtonsCradle />
                ) : ledger.length === 0 ? (
                  <p style={{ color: GRAY, margin: 0 }}>Noch keine Einträge.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ color: GRAY, fontSize: 12, textAlign: "left", borderBottom: `1px solid ${BORDER}` }}>
                          <th style={{ padding: "10px 8px", fontWeight: 600 }}>Datum</th>
                          <th style={{ padding: "10px 8px", fontWeight: 600 }}>Punkte</th>
                          <th style={{ padding: "10px 8px", fontWeight: 600 }}>Herkunft</th>
                          <th style={{ padding: "10px 8px", fontWeight: 600 }}>Beschreibung</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map((row) => (
                          <tr key={row.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                            <td style={{ padding: "12px 8px", whiteSpace: "nowrap", color: DARK }}>{fmtLedgerDate(row.occurred_at || row.created_at)}</td>
                            <td style={{
                              padding: "12px 8px",
                              fontWeight: 700,
                              color: Number(row.points_delta) >= 0 ? "#059669" : "#dc2626",
                            }}>
                              {Number(row.points_delta) > 0 ? "+" : ""}{row.points_delta}
                            </td>
                            <td style={{ padding: "12px 8px", color: GRAY }}>{sourceLabel(row.source)}</td>
                            <td style={{ padding: "12px 8px", color: DARK, lineHeight: 1.4 }}>{row.description || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "24px 28px" }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: DARK, margin: "0 0 16px" }}>So funktioniert es</h2>
                <ul style={{ margin: 0, paddingLeft: 20, color: DARK, fontSize: 15, lineHeight: 1.7 }}>
                  <li>
                    <strong>Registrierung:</strong> Bei Kontoeröffnung erhalten Sie <strong>100 Willkommenspunkte</strong>.
                  </li>
                  <li>
                    <strong>Pro Bestellung:</strong> Punkte erhalten Sie vom <strong>tatsächlich gezahlten Gesamtbetrag</strong>
                    (Waren nach allen Rabatten inkl. Bonuspunkte sowie Versand) — auf ganze Euro aufgerundet, z. B.{" "}
                    <strong>78,29 €</strong> gezahlt → <strong>79 Punkte</strong>.
                  </li>
                  <li>
                    <strong>Einlösen:</strong> An der Kasse: <strong>25 Punkte = 1 € Rabatt</strong> und frei einlösbar
                    (z. B. <strong>34 Punkte = 1,36 €</strong>). Der Rabatt zählt als Plattform-Vorteil:{" "}
                    <strong>Verkäufer werden weiterhin zum vollen Listenpreis der Ware</strong> abgerechnet.
                  </li>
                  <li>Sie zahlen den reduzierten Betrag mit Ihrer Zahlungsart.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
