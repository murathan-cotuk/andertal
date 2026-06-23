"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuthGuard, getToken } from "@andertal/lib";
import { useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";
import { getMedusaClient } from "@/lib/medusa-client";
import { useCustomerAuth as useAuth } from "@andertal/lib";
import { useCart } from "@/context/CartContext";
import { COUNTRY_MAP, getShippableCountries } from "@/lib/countries";
import { useLocale, useTranslations } from "next-intl";
import CustomCheckbox from "@/components/ui/CustomCheckbox";
const ORANGE = "#ff971c";
const DARK = "#1A1A1A";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";

const cardStyle = {
  background: "#fff",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: 20,
  minHeight: 180,
  display: "flex",
  flexDirection: "column",
  position: "relative",
};

export default function AddressesPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const { user, logout } = useAuth();
  const locale = useLocale();
  const td = useTranslations("pages.addresses");
  const { shippingGroups } = useCart();
  const shippableCountries = useMemo(() => getShippableCountries(shippingGroups, locale), [shippingGroups, locale]);
  const router = useRouter();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    label: "",
    address_line1: "",
    address_line2: "",
    zip_code: "",
    city: "",
    country: "DE",
    is_default_shipping: false,
    is_default_billing: false,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const token = getToken("customer");
    if (!token) return;
    const client = getMedusaClient();
    const me = await client.getCustomer(token);
    setAddresses(me?.customer?.addresses || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [user?.id, load]);

  useEffect(() => {
    if (!shippableCountries.length) return;
    const codes = new Set(shippableCountries.map((c) => c.code));
    setForm((f) => (codes.has(f.country) ? f : { ...f, country: shippableCountries[0].code }));
  }, [shippableCountries]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveNew = async () => {
    if (!form.address_line1.trim()) {
      setErr(td("streetRequired"));
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const token = getToken("customer");
      const client = getMedusaClient();
      await client.createCustomerAddress(token, {
        label: form.label.trim() || null,
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim() || null,
        zip_code: form.zip_code.trim() || null,
        city: form.city.trim() || null,
        country: form.country,
        is_default_shipping: form.is_default_shipping,
        is_default_billing: form.is_default_billing,
      });
      setForm({
        label: "",
        address_line1: "",
        address_line2: "",
        zip_code: "",
        city: "",
        country: shippableCountries.find((c) => c.code === "DE")?.code || shippableCountries[0]?.code || "DE",
        is_default_shipping: false,
        is_default_billing: false,
      });
      setAdding(false);
      await load();
    } catch (e) {
      setErr(e?.message || td("error"));
    }
    setSaving(false);
  };

  const setDefaultShip = async (id) => {
    const token = getToken("customer");
    const client = getMedusaClient();
    await client.updateCustomerAddress(token, id, { is_default_shipping: true });
    await load();
  };

  const setDefaultBill = async (id) => {
    const token = getToken("customer");
    const client = getMedusaClient();
    await client.updateCustomerAddress(token, id, { is_default_billing: true });
    await load();
  };

  const remove = async (id) => {
    if (!window.confirm(td("deleteConfirm"))) return;
    const token = getToken("customer");
    const client = getMedusaClient();
    await client.deleteCustomerAddress(token, id);
    await load();
  };

  const inp = {
    width: "100%",
    padding: "8px 10px",
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    fontSize: 14,
    boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      <main style={{ flex: 1 }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout title={td("title")}>
            <div>
              {loading ? (
                <GlobalPageLoader />
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 16,
                  }}
                >
                  {addresses.map((a) => (
                    <div key={a.id} style={cardStyle}>
                      {a.label && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: ORANGE, marginBottom: 8 }}>{a.label}</div>
                      )}
                      <div style={{ fontSize: 14, color: DARK, lineHeight: 1.5, flex: 1 }}>
                        <div>{a.address_line1}</div>
                        {a.address_line2 && <div>{a.address_line2}</div>}
                        <div>
                          {[a.zip_code, a.city].filter(Boolean).join(" ")}
                        </div>
                        <div>{COUNTRY_MAP[a.country]?.label || a.country}</div>
                      </div>
                      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                        {a.is_default_shipping && (
                          <span style={{ background: "#ecfdf5", color: "#065f46", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                            {td("defaultShipping")}
                          </span>
                        )}
                        {a.is_default_billing && (
                          <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                            {td("defaultBilling")}
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {!a.is_default_shipping && (
                          <button type="button" onClick={() => setDefaultShip(a.id)} style={{ fontSize: 12, border: "none", background: "none", color: ORANGE, cursor: "pointer", fontWeight: 600 }}>
                            {td("setAsShipping")}
                          </button>
                        )}
                        {!a.is_default_billing && (
                          <button type="button" onClick={() => setDefaultBill(a.id)} style={{ fontSize: 12, border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontWeight: 600 }}>
                            {td("setAsBilling")}
                          </button>
                        )}
                        <button type="button" onClick={() => remove(a.id)} style={{ fontSize: 12, border: "none", background: "none", color: "#ef4444", cursor: "pointer", marginLeft: "auto" }}>
                          {td("delete")}
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => { setAdding(true); setErr(""); }}
                    style={{
                      ...cardStyle,
                      borderStyle: "dashed",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      minHeight: 180,
                      background: "#fafafa",
                    }}
                  >
                    <span style={{ fontSize: 42, color: GRAY, lineHeight: 1 }}>+</span>
                    <span style={{ fontSize: 13, color: GRAY, marginTop: 8 }}>{td("newAddress")}</span>
                  </button>
                </div>
              )}

              {adding && (
                <div style={{ marginTop: 24, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, maxWidth: 520 }}>
                  <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>{td("newAddress")}</h2>
                  <div style={{ display: "grid", gap: 12 }}>
                    <input aria-label={td("labelAria")} style={inp} placeholder={td("labelOptional")} value={form.label} onChange={(e) => set("label", e.target.value)} />
                    <input
                      aria-label={td("streetAria")}
                      style={inp}
                      name="address_line1"
                      autoComplete="address-line1"
                      placeholder={td("streetPlaceholder")}
                      value={form.address_line1}
                      onChange={(e) => set("address_line1", e.target.value)}
                    />
                    <input
                      aria-label={td("addressLine2Aria")}
                      style={inp}
                      name="address_line2"
                      autoComplete="address-line2"
                      placeholder={td("addressLine2")}
                      value={form.address_line2}
                      onChange={(e) => set("address_line2", e.target.value)}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <input aria-label={td("postalAria")} style={inp} name="zip_code" autoComplete="postal-code" placeholder={td("postalCode")} value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} />
                      <input aria-label={td("cityAria")} style={inp} name="city" autoComplete="address-level2" placeholder={td("city")} value={form.city} onChange={(e) => set("city", e.target.value)} />
                    </div>
                    <select aria-label={td("countryAria")} style={inp} name="country" autoComplete="country" value={shippableCountries.some((c) => c.code === form.country) ? form.country : (shippableCountries[0]?.code || "")} onChange={(e) => set("country", e.target.value)} disabled={!shippableCountries.length}>
                      {shippableCountries.map((c) => (
                        <option key={c.code} value={c.code}>{c.flag ? `${c.flag} ` : ""}{c.label}</option>
                      ))}
                    </select>
                    <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                      <CustomCheckbox checked={form.is_default_shipping} onChange={(e) => set("is_default_shipping", e.target.checked)} size={18} />
                      {td("defaultShippingCheckbox")}
                    </label>
                    <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                      <CustomCheckbox checked={form.is_default_billing} onChange={(e) => set("is_default_billing", e.target.checked)} size={18} />
                      {td("defaultBillingCheckbox")}
                    </label>
                    {err && <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{err}</p>}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        onClick={saveNew}
                        disabled={saving}
                        style={{ padding: "10px 20px", background: ORANGE, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}
                      >
                        {saving ? td("saving") : td("save")}
                      </button>
                      <button type="button" onClick={() => setAdding(false)} style={{ padding: "10px 20px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", cursor: "pointer" }}>
                        {td("cancel")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
