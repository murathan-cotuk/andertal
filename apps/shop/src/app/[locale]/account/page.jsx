"use client";

import { useState, useEffect } from "react";
import { useCustomerAuth as useAuth, useAuthGuard, getToken } from "@belucha/lib";
import NewtonsCradle from "@/components/NewtonsCradle";
import { Link, useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountSidebar from "@/components/account/AccountSidebar";
import { getMedusaClient } from "@/lib/medusa-client";

const ORANGE = "#ff971c";
const DARK = "#1A1A1A";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";
const BG_SOFT = "#fafafa";

const COUNTRIES = [
  { code: "DE", name: "Deutschland" },
  { code: "AT", name: "Österreich" },
  { code: "CH", name: "Schweiz" },
  { code: "FR", name: "Frankreich" },
  { code: "IT", name: "Italien" },
  { code: "ES", name: "Spanien" },
  { code: "TR", name: "Türkei" },
  { code: "GB", name: "Vereinigtes Königreich" },
  { code: "US", name: "USA" },
];

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
    <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "24px 28px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: DARK }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
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

export default function AccountPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });

  const { user, logout } = useAuth();
  const router = useRouter();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editSection, setEditSection] = useState(null); // "personal" | null
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => setIsMobile(window.innerWidth <= 1023);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveEdit = async () => {
    setSaving(true);
    setSaveErr("");
    try {
      const token = getToken("customer");
      const client = getMedusaClient();
      const result = await client.updateCustomerMe(token, form);
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
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
          {/* Page header */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: DARK, margin: "0 0 4px" }}>Übersicht</h1>
            <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>
              {customer?.customer_number ? `Kundennummer: #${customer.customer_number} · ` : ""}
              {customer?.email}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "220px 1fr", gap: 24, alignItems: "start" }}>
            {!isMobile && <AccountSidebar onLogout={handleLogout} />}

            {/* Main content */}
            <div>
              <Section title="Bonuspunkte">
                <div style={{ fontSize: 32, fontWeight: 800, color: ORANGE, marginBottom: 8 }}>
                  {customer?.bonus_points != null ? customer.bonus_points : "—"}{" "}
                  <span style={{ fontSize: 16, fontWeight: 600, color: DARK }}>Punkte</span>
                </div>
                <p style={{ fontSize: 13, color: GRAY, margin: "0 0 12px", lineHeight: 1.5 }}>
                  25 Punkte = 1 € Rabatt an der Kasse (frei einlösbar, z. B. 34 Punkte = 1,36 €). Pro bezahltem Euro (aufgerundet)
                  sammeln Sie Punkte; bei Registrierung gibt es 100 Willkommenspunkte.
                </p>
                <Link href="/bonus" style={{ fontSize: 14, fontWeight: 600, color: ORANGE, textDecoration: "none" }}>
                  Details &amp; Regeln →
                </Link>
              </Section>

              {/* Personal info */}
              <Section
                title="Persönliche Daten"
                action={editSection !== "personal" && <EditButton onClick={() => startEdit("personal")} />}
              >
                {editSection === "personal" ? (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                      <div>
                        <label htmlFor="acc-first_name" style={lbl}>Vorname</label>
                        <input id="acc-first_name" style={inp} value={form.first_name} onChange={e => set("first_name", e.target.value)} />
                      </div>
                      <div>
                        <label htmlFor="acc-last_name" style={lbl}>Nachname</label>
                        <input id="acc-last_name" style={inp} value={form.last_name} onChange={e => set("last_name", e.target.value)} />
                      </div>
                      <div>
                        <label htmlFor="acc-phone" style={lbl}>Telefon</label>
                        <input id="acc-phone" style={inp} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+49 123 456789" />
                      </div>
                      <div>
                        <label htmlFor="acc-account_type" style={lbl}>Kontotyp</label>
                        <select id="acc-account_type" style={inp} value={form.account_type} onChange={e => set("account_type", e.target.value)}>
                          <option value="privat">Privatkunde</option>
                          <option value="gewerbe">Gewerbekunde</option>
                        </select>
                      </div>
                      {form.account_type === "gewerbe" && (
                        <>
                          <div>
                            <label htmlFor="acc-company_name" style={lbl}>Firmenname</label>
                            <input id="acc-company_name" style={inp} value={form.company_name} onChange={e => set("company_name", e.target.value)} />
                          </div>
                          <div>
                            <label htmlFor="acc-vat_number" style={lbl}>USt-IdNr.</label>
                            <input id="acc-vat_number" style={inp} value={form.vat_number} onChange={e => set("vat_number", e.target.value)} />
                          </div>
                        </>
                      )}
                    </div>
                    {saveErr && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{saveErr}</p>}
                    <div style={{ display: "flex", gap: 10 }}>
                      <SaveButton onClick={saveEdit} loading={saving} />
                      <button onClick={() => setEditSection(null)} style={{ padding: "10px 20px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, cursor: "pointer", background: "#fff", color: GRAY }}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    <InfoRow label="Vorname" value={customer?.first_name} />
                    <InfoRow label="Nachname" value={customer?.last_name} />
                    <InfoRow label="E-Mail" value={customer?.email} />
                    <InfoRow label="Telefon" value={customer?.phone} />
                    <InfoRow label="Kontotyp" value={accountTypeLabel(customer?.account_type)} />
                    {customer?.company_name && <InfoRow label="Firma" value={customer.company_name} />}
                    {customer?.vat_number && <InfoRow label="USt-IdNr." value={customer.vat_number} />}
                  </div>
                )}
              </Section>

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
                    : "Noch keine Adressen im Konto. Sie können mehrere Adressen speichern und Standard-Liefer- bzw. Rechnungsadresse wählen."}
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

              {/* Quick links */}
              <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "20px 28px" }}>
                <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: DARK }}>Schnellzugriff</h2>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Link
                    href="/orders"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      padding: "10px 20px", background: ORANGE, color: "#fff",
                      border: "2px solid #000", borderRadius: 10, fontSize: 14,
                      fontWeight: 700, textDecoration: "none", boxShadow: "0 2px 0 2px #000",
                    }}
                  >
                    📦 Meine Bestellungen
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
