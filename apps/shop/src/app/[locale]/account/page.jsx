"use client";

import { useState, useEffect } from "react";
import { useCustomerAuth as useAuth, useAuthGuard, getToken } from "@belucha/lib";
import styled from "styled-components";
import NewtonsCradle from "@/components/NewtonsCradle";
import { Link, useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";
import { getMedusaClient } from "@/lib/medusa-client";

const ORANGE = "#ff971c";
const DARK = "#1A1A1A";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";

const inp = {
  width: "100%",
  padding: "10px 14px",
  border: `1.5px solid ${BORDER}`,
  borderRadius: 8,
  fontSize: 14,
  color: DARK,
  background: "#fff",
  boxSizing: "border-box",
  outline: "none",
  fontFamily: "inherit",
};

const lbl = {
  fontSize: 12,
  fontWeight: 600,
  color: GRAY,
  display: "block",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

// ── Styled components ─────────────────────────────────────────────────────────

const CarouselSection = styled.div`
  background: #fff;
  border-radius: 12px;
  border: 1px solid ${BORDER};
  overflow: hidden;
  margin-bottom: 16px;
`;

const CarouselHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 10px;
`;

const CarouselTitle = styled.h2`
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: ${DARK};
`;

const CarouselViewAll = styled(Link)`
  font-size: 13px;
  font-weight: 600;
  color: ${ORANGE};
  text-decoration: none;
  &:hover { opacity: 0.8; }
`;

const CarouselTrack = styled.div`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 0 18px 16px;
  &::-webkit-scrollbar { display: none; }
`;

const MiniCard = styled(Link)`
  flex: 0 0 116px;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  text-decoration: none;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid ${BORDER};
  background: #fafafa;
  transition: box-shadow 0.15s;
  &:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
  @media (max-width: 767px) { flex: 0 0 104px; }
`;

const MiniImg = styled.div`
  aspect-ratio: 1 / 1;
  background: #fff;
  overflow: hidden;
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 5px;
    box-sizing: border-box;
    display: block;
  }
`;

const MiniBody = styled.div`
  padding: 6px 7px 8px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MiniName = styled.div`
  font-size: 11px;
  font-weight: 500;
  color: ${DARK};
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const MiniPrice = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: ${ORANGE};
  margin-top: auto;
  padding-top: 3px;
`;

const OrderCard = styled(Link)`
  flex: 0 0 140px;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  text-decoration: none;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid ${BORDER};
  background: #fafafa;
  transition: box-shadow 0.15s;
  &:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
  @media (max-width: 767px) { flex: 0 0 128px; }
`;

const OrderCardImgWrap = styled.div`
  aspect-ratio: 1 / 1;
  background: #fff;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const OrderCardBody = styled.div`
  padding: 7px 9px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const OrderCardNum = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: ${DARK};
`;

const OrderCardDate = styled.div`
  font-size: 10px;
  color: ${GRAY};
`;

const OrderCardStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  margin-top: 1px;
`;

const StatusDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${(p) => p.$color || GRAY};
  flex-shrink: 0;
  display: inline-block;
`;

// ── Sub-components ────────────────────────────────────────────────────────────

const SectionCard = styled.div`
  background: #fff;
  border-radius: 12px;
  border: 1px solid ${BORDER};
  padding: 24px 28px;
  margin-bottom: 16px;
  @media (max-width: 767px) {
    padding: 16px 14px;
    border-radius: 10px;
  }
`;

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 8px;
  @media (max-width: 767px) {
    margin-bottom: 14px;
  }
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const EditFormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

function InfoRow({ label, value }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={lbl}>{label}</div>
      <div style={{ fontSize: 15, color: DARK, fontWeight: 500 }}>{value || "—"}</div>
    </div>
  );
}

function Section({ title, children, action }) {
  return (
    <SectionCard>
      <SectionHead>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: DARK }}>{title}</h2>
        {action}
      </SectionHead>
      {children}
    </SectionCard>
  );
}

function EditButton({ onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "7px 16px",
        background: hover ? ORANGE : "#fff",
        color: hover ? "#fff" : ORANGE,
        border: `1.5px solid ${ORANGE}`,
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      Bearbeiten
    </button>
  );
}

function SaveButton({ onClick, loading }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "10px 24px",
        background: hover && !loading ? "#e6880e" : ORANGE,
        color: "#fff",
        border: "none",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 700,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
        transition: "background 0.15s",
        boxShadow: "0 2px 0 2px #000",
      }}
    >
      {loading ? "Speichern…" : "Speichern"}
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEur(cents) {
  return (Number(cents || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const STATUS_COLOR = {
  offen: "#92400e", in_bearbeitung: "#1e40af", versendet: "#6d28d9",
  zugestellt: "#166534", abgeschlossen: "#166534", storniert: "#991b1b",
  bezahlt: "#166534", refunded: "#1d4ed8", retoure: "#b91c1c",
  retoure_anfrage: "#b45309", pending: "#92400e", shipped: "#6d28d9",
  delivered: "#166534", completed: "#166534", cancelled: "#991b1b",
};

const STATUS_LABEL = {
  offen: "Offen", in_bearbeitung: "In Bearb.", versendet: "Versendet",
  zugestellt: "Zugestellt", abgeschlossen: "Abgeschl.", storniert: "Storniert",
  bezahlt: "Bezahlt", refunded: "Erstattet", retoure: "Retoure",
  retoure_anfrage: "Rückg. läuft", pending: "Offen", shipped: "Versendet",
  delivered: "Zugestellt", completed: "Abgeschl.", cancelled: "Storniert",
};

function shortTitle(raw) {
  const m = (raw || "").match(/^(.*)\s+\(.+\)$/);
  return m ? m[1] : (raw || "");
}


// ── Main component ────────────────────────────────────────────────────────────

export default function AccountPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });

  const { user, logout } = useAuth();
  const router = useRouter();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editSection, setEditSection] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [orders, setOrders] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);

  useEffect(() => {
    const fetchCustomer = async () => {
      if (!user?.id) return;
      try {
        setLoading(true);
        const token = getToken("customer");
        if (!token) { setError("Nicht angemeldet"); return; }
        const client = getMedusaClient();
        const result = await client.getCustomer(token);
        if (result?.customer) setCustomer(result.customer);
        else setError("Profil konnte nicht geladen werden.");
      } catch (err) {
        setError(err?.message || "Fehler");
      } finally {
        setLoading(false);
      }
    };
    fetchCustomer();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const fetchOrders = async () => {
      try {
        const token = getToken("customer");
        if (!token) return;
        const res = await getMedusaClient().request("/store/orders/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res?.__error) setOrders(res?.orders || []);
      } catch (_) {}
    };
    fetchOrders();
  }, [user?.id]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("belucha_recently_viewed");
      if (raw) setRecentlyViewed(JSON.parse(raw).slice(0, 12));
    } catch (_) {}
  }, []);

  const startEdit = (section) => {
    setForm({
      first_name: customer?.first_name || "",
      last_name: customer?.last_name || "",
      phone: customer?.phone || "",
      account_type: customer?.account_type || "privat",
      company_name: customer?.company_name || "",
      vat_number: customer?.vat_number || "",
      address_line1: customer?.address_line1 || "",
      address_line2: customer?.address_line2 || "",
      zip_code: customer?.zip_code || "",
      city: customer?.city || "",
      country: customer?.country || "DE",
    });
    setSaveErr("");
    setEditSection(section);
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveEdit = async () => {
    setSaving(true);
    setSaveErr("");
    try {
      const token = getToken("customer");
      const result = await getMedusaClient().updateCustomerMe(token, form);
      if (result?.customer) {
        setCustomer(result.customer);
        setEditSection(null);
      }
    } catch (e) {
      setSaveErr(e?.message || "Fehler beim Speichern.");
    }
    setSaving(false);
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const accountTypeLabel = (t) => {
    if (t === "gewerbe") return "Gewerbekunde";
    if (t === "gastkunde") return "Gastkunde";
    return "Privatkunde";
  };

  // Carousel data
  const recentOrders = orders.slice(0, 8);

  const rebuyItems = (() => {
    const seen = new Set();
    const items = [];
    for (const order of orders) {
      for (const item of order.items || []) {
        if (!item.product_handle || seen.has(item.product_handle)) continue;
        seen.add(item.product_handle);
        items.push({
          handle: item.product_handle,
          title: item.title || "",
          thumbnail: item.thumbnail || null,
          price_cents: item.unit_price_cents,
        });
        if (items.length >= 12) return items;
      }
    }
    return items;
  })();

  const getOrderStatus = (order) => {
    const ds = String(order.delivery_status || "").toLowerCase();
    if (ds === "zugestellt") return "zugestellt";
    if (ds === "versendet") return "versendet";
    return (order.order_status || "offen").toLowerCase();
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fff" }}>
        <ShopHeader />
        <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <NewtonsCradle />
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fff" }}>
        <ShopHeader />
        <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "#ef4444", fontSize: 15 }}>{error}</div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />

      <main style={{ flex: 1 }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>

          <AccountPageLayout onLogout={handleLogout}>
            <div>

              {/* Personal data */}
              <Section
                title="Persönliche Daten"
                action={editSection !== "personal" && <EditButton onClick={() => startEdit("personal")} />}
              >
                {editSection === "personal" ? (
                  <div>
                    <EditFormGrid>
                      <div>
                        <label htmlFor="acc-first_name" style={lbl}>Vorname</label>
                        <input id="acc-first_name" style={inp} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
                      </div>
                      <div>
                        <label htmlFor="acc-last_name" style={lbl}>Nachname</label>
                        <input id="acc-last_name" style={inp} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
                      </div>
                      <div>
                        <label htmlFor="acc-phone" style={lbl}>Telefon</label>
                        <input id="acc-phone" style={inp} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+49 123 456789" />
                      </div>
                      <div>
                        <label htmlFor="acc-account_type" style={lbl}>Kontotyp</label>
                        <select id="acc-account_type" style={inp} value={form.account_type} onChange={(e) => set("account_type", e.target.value)}>
                          <option value="privat">Privatkunde</option>
                          <option value="gewerbe">Gewerbekunde</option>
                        </select>
                      </div>
                      {form.account_type === "gewerbe" && (
                        <>
                          <div>
                            <label htmlFor="acc-company_name" style={lbl}>Firmenname</label>
                            <input id="acc-company_name" style={inp} value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
                          </div>
                          <div>
                            <label htmlFor="acc-vat_number" style={lbl}>USt-IdNr.</label>
                            <input id="acc-vat_number" style={inp} value={form.vat_number} onChange={(e) => set("vat_number", e.target.value)} />
                          </div>
                        </>
                      )}
                    </EditFormGrid>
                    {saveErr && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{saveErr}</p>}
                    <div style={{ display: "flex", gap: 10 }}>
                      <SaveButton onClick={saveEdit} loading={saving} />
                      <button
                        onClick={() => setEditSection(null)}
                        style={{ padding: "10px 20px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, cursor: "pointer", background: "#fff", color: GRAY }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <InfoGrid>
                    <InfoRow label="Vorname" value={customer?.first_name} />
                    <InfoRow label="Nachname" value={customer?.last_name} />
                    <InfoRow label="E-Mail" value={customer?.email} />
                    <InfoRow label="Telefon" value={customer?.phone} />
                    <InfoRow label="Kontotyp" value={accountTypeLabel(customer?.account_type)} />
                    {customer?.company_name && <InfoRow label="Firma" value={customer.company_name} />}
                    {customer?.vat_number && <InfoRow label="USt-IdNr." value={customer.vat_number} />}
                  </InfoGrid>
                )}
              </Section>

              {/* Addresses */}
              <Section
                title="Adressen"
                action={
                  <Link href="/addresses" style={{ fontSize: 13, fontWeight: 600, color: ORANGE, textDecoration: "none" }}>
                    Alle verwalten →
                  </Link>
                }
              >
                <p style={{ fontSize: 14, color: DARK, margin: "0 0 8px", lineHeight: 1.5 }}>
                  {Array.isArray(customer?.addresses) && customer.addresses.length > 0
                    ? `${customer.addresses.length} gespeicherte Adresse${customer.addresses.length === 1 ? "" : "n"} — Liefer- und Rechnungsadresse können Sie dort festlegen.`
                    : "Noch keine Adressen im Konto. Speichern Sie Liefer- und Rechnungsadressen für schnelleres Bestellen."}
                </p>
                <Link
                  href="/addresses"
                  style={{
                    display: "inline-block",
                    marginTop: 4,
                    padding: "8px 16px",
                    border: `1.5px solid ${ORANGE}`,
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: ORANGE,
                    textDecoration: "none",
                  }}
                >
                  Adressen bearbeiten
                </Link>
              </Section>

              {/* Meine Bestellungen carousel */}
              {recentOrders.length > 0 && (
                <CarouselSection>
                  <CarouselHeader>
                    <CarouselTitle>Meine Bestellungen</CarouselTitle>
                    <CarouselViewAll href="/orders">Alle ansehen →</CarouselViewAll>
                  </CarouselHeader>
                  <CarouselTrack>
                    {recentOrders.map((order) => {
                      const status = getOrderStatus(order);
                      const statusColor = STATUS_COLOR[status] || GRAY;
                      const statusLabel = STATUS_LABEL[status] || status;
                      const firstItem = (order.items || [])[0];
                      return (
                        <OrderCard key={order.id} href="/orders">
                          <OrderCardImgWrap>
                            {firstItem?.thumbnail ? (
                              <img
                                src={firstItem.thumbnail}
                                alt=""
                                style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6, boxSizing: "border-box" }}
                              />
                            ) : (
                              <span style={{ fontSize: 28, opacity: 0.25 }}>📦</span>
                            )}
                          </OrderCardImgWrap>
                          <OrderCardBody>
                            <OrderCardNum>#{order.order_number || order.id?.slice(0, 6)}</OrderCardNum>
                            <OrderCardDate>{fmtDate(order.created_at)}</OrderCardDate>
                            <OrderCardStatus>
                              <StatusDot $color={statusColor} />
                              <span style={{ color: statusColor }}>{statusLabel}</span>
                            </OrderCardStatus>
                          </OrderCardBody>
                        </OrderCard>
                      );
                    })}
                  </CarouselTrack>
                </CarouselSection>
              )}

              {/* Erneut kaufen carousel */}
              {rebuyItems.length > 0 && (
                <CarouselSection>
                  <CarouselHeader>
                    <CarouselTitle>Erneut kaufen</CarouselTitle>
                  </CarouselHeader>
                  <CarouselTrack>
                    {rebuyItems.map((item) => (
                      <MiniCard key={item.handle} href={`/produkt/${item.handle}`}>
                        <MiniImg>
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="" />
                          ) : (
                            <div style={{ width: "100%", height: "100%", background: "#f3f4f6" }} />
                          )}
                        </MiniImg>
                        <MiniBody>
                          <MiniName>{shortTitle(item.title)}</MiniName>
                          {item.price_cents && <MiniPrice>{fmtEur(item.price_cents)}</MiniPrice>}
                        </MiniBody>
                      </MiniCard>
                    ))}
                  </CarouselTrack>
                </CarouselSection>
              )}

              {/* Weiter einkaufen carousel */}
              {recentlyViewed.length > 0 && (
                <CarouselSection>
                  <CarouselHeader>
                    <CarouselTitle>Weiter einkaufen</CarouselTitle>
                  </CarouselHeader>
                  <CarouselTrack>
                    {recentlyViewed.map((p) => (
                      <MiniCard key={p.handle} href={`/produkt/${p.handle}`}>
                        <MiniImg>
                          {p.thumbnail ? (
                            <img src={p.thumbnail} alt="" />
                          ) : (
                            <div style={{ width: "100%", height: "100%", background: "#f3f4f6" }} />
                          )}
                        </MiniImg>
                        <MiniBody>
                          <MiniName>{p.title || p.name || ""}</MiniName>
                          {p.price_cents && <MiniPrice>{fmtEur(p.price_cents)}</MiniPrice>}
                        </MiniBody>
                      </MiniCard>
                    ))}
                  </CarouselTrack>
                </CarouselSection>
              )}

            </div>
          </AccountPageLayout>
        </div>
      </main>

      <Footer />
    </div>
  );
}
