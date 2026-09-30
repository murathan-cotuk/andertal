"use client";

import { useState, useEffect } from "react";
import { useCustomerAuth as useAuth, useAuthGuard, getToken } from "@andertal/lib";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";
import { getMedusaClient } from "@/lib/medusa-client";
import { useLocale, useTranslations } from "next-intl";

const ORANGE = "#ee8a12";
const DARK = "#1A1A1A";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";

function fmtLedgerDate(iso, locale = "de") {
  if (!iso) return { date: "—", time: "" };
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" }),
      time: d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { date: String(iso), time: "" };
  }
}

const LEDGER_SOURCES = ["registration", "order_earn", "order_redeem", "manual"];

export default function BonusPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const t = useTranslations("bonusPage");
  const locale = useLocale();
  const sourceLabel = (source) => (LEDGER_SOURCES.includes(source) ? t(`src_${source}`) : source || "—");
  const b = (chunks) => <strong>{chunks}</strong>;
  const { user, isLoading: authLoading, isAuthenticated, token: authToken } = useAuth();
  const [points, setPoints] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    const load = async () => {
      const token = authToken || getToken("customer");
      if (!isAuthenticated || !token) {
        setPoints(0);
        setLedger([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const client = getMedusaClient();
      const r = await client.getCustomer(token);
      if (!r?.customer) {
        setPoints(0);
        setLedger([]);
        setLoading(false);
        return;
      }
      setPoints(r.customer.bonus_points ?? 0);
      setLedger(Array.isArray(r.customer.bonus_ledger) ? r.customer.bonus_ledger : []);
      setLoading(false);
    };
    load();
  }, [authLoading, isAuthenticated, authToken, user?.id, user?.sub]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      <main style={{ flex: 1, width: "100%", boxSizing: "border-box" }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout
            title={t("title")}
            description={t("description")}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  padding: "clamp(16px, 4vw, 28px) clamp(14px, 4vw, 32px)",
                  marginBottom: 24,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: GRAY, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  {t("balance")}
                </div>
                {loading ? (
                  <div style={{ fontSize: 20, color: GRAY }}>…</div>
                ) : (
                  <div style={{ fontSize: 42, fontWeight: 800, color: ORANGE, lineHeight: 1.2 }}>
                    {points ?? 0} <span style={{ fontSize: 20, fontWeight: 600, color: DARK }}>{t("points")}</span>
                  </div>
                )}
              </div>

              <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "14px 10px 14px", marginBottom: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: DARK, margin: "0 0 12px", paddingLeft: 4 }}>{t("history")}</h2>
                {loading ? (
                  <GlobalPageLoader />
                ) : ledger.length === 0 ? (
                  <p style={{ color: GRAY, margin: 0 }}>{t("empty")}</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "40%" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ color: GRAY, fontSize: 11, textAlign: "left", borderBottom: `1px solid ${BORDER}` }}>
                        <th style={{ padding: "8px 4px", fontWeight: 600 }}>{t("colDate")}</th>
                        <th style={{ padding: "8px 4px", fontWeight: 600 }}>{t("colPoints")}</th>
                        <th style={{ padding: "8px 4px", fontWeight: 600 }}>{t("colSource")}</th>
                        <th style={{ padding: "8px 4px", fontWeight: 600 }}>{t("colDescription")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((row) => {
                        const { date, time } = fmtLedgerDate(row.occurred_at || row.created_at, locale);
                        return (
                          <tr key={row.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                            <td style={{ padding: "10px 4px", color: DARK }}>
                              <div style={{ fontSize: 12 }}>{date}</div>
                              {time && <div style={{ fontSize: 10, color: GRAY, marginTop: 1 }}>{time}</div>}
                            </td>
                            <td style={{
                              padding: "10px 4px",
                              fontWeight: 700,
                              color: Number(row.points_delta) >= 0 ? "#059669" : "#dc2626",
                            }}>
                              {Number(row.points_delta) > 0 ? "+" : ""}{row.points_delta}
                            </td>
                            <td style={{ padding: "10px 4px", color: GRAY, fontSize: 12 }}>{sourceLabel(row.source)}</td>
                            <td style={{ padding: "10px 4px", color: DARK, lineHeight: 1.4, fontSize: 12, wordBreak: "break-word" }}>{row.description || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "24px 28px" }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: DARK, margin: "0 0 16px" }}>{t("howTitle")}</h2>
                <ul style={{ margin: 0, paddingLeft: 20, color: DARK, fontSize: 15, lineHeight: 1.7 }}>
                  <li>{t.rich("howRegistration", { b })}</li>
                  <li>{t.rich("howOrder", { b })}</li>
                  <li>{t.rich("howRedeem", { b })}</li>
                  <li>{t("howPay")}</li>
                </ul>
              </div>
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
