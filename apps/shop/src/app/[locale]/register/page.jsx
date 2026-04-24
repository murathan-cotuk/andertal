"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, Link } from "@/i18n/navigation";
import { useMedusaAuth } from "@/hooks/useMedusaAuth";
import { useCustomerAuth as useAuth, useAuthGuard } from "@belucha/lib";
import { tokens } from "@/design-system/tokens";
import { useCart } from "@/context/CartContext";
import { getShippableCountries } from "@/lib/countries";
import { resolveImageUrl } from "@/lib/image-url";

/* ── Monkey SVG ─────────────────────────────────────────────────────────── */
function MonkeyAvatar({ isBlind }) {
  return (
    <div style={{
      width: 96, height: 96,
      borderRadius: "50%",
      border: "2.5px solid #1A1A1A",
      background: "#fff8f0",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", flexShrink: 0, position: "relative",
      boxShadow: "0 3px 0 2px #1A1A1A",
    }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="70" height="70" viewBox="0 0 64 64" style={{ position: "absolute" }}>
        <ellipse cx="53.7" cy="33" rx="8.3" ry="8.2" fill="#89664c" />
        <ellipse cx="53.7" cy="33" rx="5.4" ry="5.4" fill="#ffc5d3" />
        <ellipse cx="10.2" cy="33" rx="8.2" ry="8.2" fill="#89664c" />
        <ellipse cx="10.2" cy="33" rx="5.4" ry="5.4" fill="#ffc5d3" />
        <path fill="#89664c" d="m43.4 10.8c1.1-.6 1.9-.9 1.9-.9-3.2-1.1-6-1.8-8.5-2.1 1.3-1 2.1-1.3 2.1-1.3-20.4-2.9-30.1 9-30.1 19.5h46.4c-.7-7.4-4.8-12.4-11.8-15.2" />
        <path fill="#89664c" d="m55.3 27.6c0-9.7-10.4-17.6-23.3-17.6s-23.3 7.9-23.3 17.6c0 2.3.6 4.4 1.6 6.4-1 2-1.6 4.2-1.6 6.4 0 9.7 10.4 17.6 23.3 17.6s23.3-7.9 23.3-17.6c0-2.3-.6-4.4-1.6-6.4 1-2 1.6-4.2 1.6-6.4" />
        <path fill="#e0ac7e" d="m52 28.2c0-16.9-20-6.1-20-6.1s-20-10.8-20 6.1c0 4.7 2.9 9 7.5 11.7-1.3 1.7-2.1 3.6-2.1 5.7 0 6.1 6.6 11 14.7 11s14.7-4.9 14.7-11c0-2.1-.8-4-2.1-5.7 4.4-2.7 7.3-7 7.3-11.7" />
        <path fill="#3b302a" d="m35.1 38.7c0 1.1-.4 2.1-1 2.1-.6 0-1-.9-1-2.1 0-1.1.4-2.1 1-2.1.6.1 1 1 1 2.1" />
        <path fill="#3b302a" d="m30.9 38.7c0 1.1-.4 2.1-1 2.1-.6 0-1-.9-1-2.1 0-1.1.4-2.1 1-2.1.5.1 1 1 1 2.1" />
        <ellipse cx="40.7" cy={isBlind ? 30 : 31.7} rx="3.5" ry={isBlind ? 0.5 : 4.5} fill="#3b302a" />
        <ellipse cx="23.3" cy={isBlind ? 30 : 31.7} rx="3.5" ry={isBlind ? 0.5 : 4.5} fill="#3b302a" />
      </svg>
      <svg xmlns="http://www.w3.org/2000/svg" width="70" height="70" viewBox="0 0 64 64" style={{
        position: "absolute",
        transform: isBlind
          ? "translate3d(0, 0, 0) rotateX(0deg)"
          : "translateY(calc(70px / 1.25)) rotateX(-21deg)",
        transition: "transform 0.2s ease",
        transformOrigin: "50% 100%",
      }}>
        <path fill="#89664C" d="M9.4,32.5L2.1,61.9H14c-1.6-7.7,4-21,4-21L9.4,32.5z" />
        <path fill="#FFD6BB" d="M15.8,24.8c0,0,4.9-4.5,9.5-3.9c2.3,0.3-7.1,7.6-7.1,7.6s9.7-8.2,11.7-5.6c1.8,2.3-8.9,9.8-8.9,9.8s10-8.1,9.6-4.6c-0.3,3.8-7.9,12.8-12.5,13.8C11.5,43.2,6.3,39,9.8,24.4C11.6,17,13.3,25.2,15.8,24.8" />
        <path fill="#89664C" d="M54.8,32.5l7.3,29.4H50.2c1.6-7.7-4-21-4-21L54.8,32.5z" />
        <path fill="#FFD6BB" d="M48.4,24.8c0,0-4.9-4.5-9.5-3.9c-2.3,0.3,7.1,7.6,7.1,7.6s-9.7-8.2-11.7-5.6c-1.8,2.3,8.9,9.8,8.9,9.8s-10-8.1-9.7-4.6c0.4,3.8,8,12.8,12.6,13.8c6.6,1.3,11.8-2.9,8.3-17.5C52.6,17,50.9,25.2,48.4,24.8" />
      </svg>
    </div>
  );
}

/* ── Shared input style ─────────────────────────────────────────────────── */
const inp = {
  width: "100%", padding: "11px 14px",
  border: "2px solid #1A1A1A", borderRadius: 8,
  fontSize: 15, color: "#1A1A1A", background: "#fff",
  boxSizing: "border-box", outline: "none",
  fontFamily: tokens.fontFamily.sans,
  transition: "box-shadow 0.15s",
};

const selStyle = {
  ...inp,
  cursor: "pointer",
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%231A1A1A' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
  paddingRight: 36,
};

const sectionLabel = {
  fontSize: 11, fontWeight: 800, color: "#9ca3af",
  textTransform: "uppercase", letterSpacing: "0.08em",
};

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function RegisterPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/", redirectIfAuthenticated: true });

  const [accountType, setAccountType] = useState("privat");
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    gender: "", birthDate: "",
    address: "", addressLine2: "", zipCode: "", city: "", country: "DE",
    companyName: "", vatNumber: "",
    billingSameAsShipping: true,
    billingAddress: "", billingZipCode: "", billingCity: "", billingCountry: "DE",
    password: "",
    legalConsent: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [branding, setBranding] = useState({ logo: "", favicon: "", logoHeight: 34 });
  const { login } = useAuth();
  const router = useRouter();
  const { register: registerMedusa, login: loginMedusa, loading } = useMedusaAuth();
  const { shippingGroups } = useCart();
  const shippableCountries = useMemo(() => getShippableCountries(shippingGroups), [shippingGroups]);

  useEffect(() => {
    if (!shippableCountries.length) return;
    const codes = new Set(shippableCountries.map((c) => c.code));
    setFormData((f) => {
      const next = { ...f };
      if (!codes.has(next.country)) next.country = shippableCountries[0].code;
      const bc = next.billingCountry || "DE";
      if (!codes.has(bc)) next.billingCountry = shippableCountries[0].code;
      return next;
    });
  }, [shippableCountries]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store-seller-settings?seller_id=default", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setBranding({
          logo: resolveImageUrl(d?.shop_logo_url || ""),
          favicon: resolveImageUrl(d?.shop_favicon_url || ""),
          logoHeight: d?.shop_logo_height != null ? Number(d.shop_logo_height) : 34,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const fav = (branding.favicon || "").trim();
    if (!fav || typeof document === "undefined") return;
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "icon");
      document.head.appendChild(link);
    }
    link.setAttribute("href", fav);
  }, [branding.favicon]);

  const set = (key) => (e) => setFormData(f => ({ ...f, [key]: e.target.value }));

  const focusStyle = (e) => e.target.style.boxShadow = `0 0 0 3px ${tokens.primary.light}`;
  const blurStyle = (e) => e.target.style.boxShadow = "none";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!formData.email || !formData.password) { setError("E-Mail und Passwort sind erforderlich."); return; }
    if (formData.password.length < 6) { setError("Das Passwort muss mindestens 6 Zeichen lang sein."); return; }
    if (accountType === "gewerbe" && !formData.companyName.trim()) { setError("Firmenname ist erforderlich."); return; }
    if (!formData.legalConsent) { setError("Bitte akzeptieren Sie die rechtlichen Hinweise."); return; }

    try {
      const extra = {
        account_type: accountType,
        phone: formData.phone,
        gender: formData.gender,
        birth_date: formData.birthDate || undefined,
        address_line1: formData.address,
        address_line2: formData.addressLine2,
        zip_code: formData.zipCode,
        city: formData.city,
        country: formData.country,
        company_name: formData.companyName || undefined,
        vat_number: formData.vatNumber || undefined,
        billing_address_line1: formData.billingSameAsShipping !== false ? undefined : (formData.billingAddress || undefined),
        billing_zip_code: formData.billingSameAsShipping !== false ? undefined : (formData.billingZipCode || undefined),
        billing_city: formData.billingSameAsShipping !== false ? undefined : (formData.billingCity || undefined),
        billing_country: formData.billingSameAsShipping !== false ? undefined : (formData.billingCountry || undefined),
      };
      const registerResult = await registerMedusa(formData.email, formData.password, formData.firstName, formData.lastName, extra);
      if (!registerResult?.customer) { setError("Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut."); return; }

      const loginResult = await loginMedusa(formData.email, formData.password);
      if (loginResult?.customer?.id) {
        if (formData.legalConsent && formData.email) {
          const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";
          fetch(`${backendUrl}/store/newsletter-subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: formData.email.trim().toLowerCase() }),
          }).catch(() => {});
        }
        const token = loginResult.access_token || loginResult.token;
        if (token) {
          login(token, loginResult.customer.id);
          document.cookie = `belucha_cauth=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
          router.push("/");
          router.refresh();
        } else {
          setError("Registrierung erfolgreich. Bitte melden Sie sich an.");
        }
      } else {
        setError("Registrierung erfolgreich. Bitte melden Sie sich an.");
      }
    } catch (err) {
      setError(err.message || "Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.");
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa", fontFamily: tokens.fontFamily.sans }}>
      {/* Top bar */}
      <div style={{ padding: "16px 24px" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
          {branding.logo ? (
            <img
              src={branding.logo}
              alt="Belucha"
              style={{ height: Math.min(Math.max(branding.logoHeight || 34, 20), 56), width: "auto", maxWidth: 220, objectFit: "contain", display: "block" }}
            />
          ) : (
            <span style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.03em" }}>Belucha</span>
          )}
        </Link>
      </div>

      {/* Center card */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px" }}>
        <div style={{
          width: "100%", maxWidth: 980,
          background: "#fff",
          border: "2px solid #1A1A1A",
          borderRadius: 16,
          boxShadow: "4px 4px 0 0 #1A1A1A",
          padding: "40px 36px 36px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
          marginBottom: 40,
        }}>
          {/* Monkey */}
          <MonkeyAvatar isBlind={!showPassword} />

          {/* Heading */}
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.03em" }}>
              Konto erstellen
            </h1>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
              Werde Teil der Belucha-Community
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{ width: "100%", padding: "10px 14px", background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 8, color: "#dc2626", fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>

            <div className="register-grid">

            {/* Account type toggle */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Kontotyp</label>
              <div style={{ display: "flex", border: "2px solid #1A1A1A", borderRadius: 8, overflow: "hidden" }}>
                {[{ val: "privat", label: "👤 Privatkunde" }, { val: "gewerbe", label: "🏢 Geschäftskunde" }].map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAccountType(val)}
                    style={{
                      flex: 1, padding: "10px 0",
                      fontSize: 14, fontWeight: 700,
                      border: "none", cursor: "pointer",
                      background: accountType === val ? tokens.primary.DEFAULT : "#fff",
                      color: accountType === val ? "#fff" : "#6b7280",
                      transition: "background 0.15s, color 0.15s",
                      fontFamily: tokens.fontFamily.sans,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Business fields */}
            {accountType === "gewerbe" && (
              <>
                <div style={{ ...sectionLabel, gridColumn: "1 / -1" }}>Unternehmensdaten</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="companyName" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Firmenname *</label>
                  <input id="companyName" value={formData.companyName} onChange={set("companyName")} placeholder="Muster GmbH" required style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="vatNumber" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>USt-IdNr. (optional)</label>
                  <input id="vatNumber" value={formData.vatNumber} onChange={set("vatNumber")} placeholder="DE123456789" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                </div>
                <div style={{ ...sectionLabel, gridColumn: "1 / -1" }}>Ansprechpartner</div>
              </>
            )}

            {/* Name row */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="firstName" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Vorname *</label>
              <input id="firstName" value={formData.firstName} onChange={set("firstName")} placeholder="Max" required style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="lastName" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Nachname *</label>
              <input id="lastName" value={formData.lastName} onChange={set("lastName")} placeholder="Mustermann" required style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            {/* Gender + Birthdate */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="gender" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Geschlecht</label>
              <select id="gender" value={formData.gender} onChange={set("gender")} style={selStyle} onFocus={focusStyle} onBlur={blurStyle}>
                <option value="">Bitte wählen</option>
                <option value="male">Männlich</option>
                <option value="female">Weiblich</option>
                <option value="diverse">Divers</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="birthDate" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Geburtsdatum</label>
              <input type="date" id="birthDate" value={formData.birthDate} onChange={set("birthDate")} style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            {/* Email */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="email" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>E-Mail *</label>
              <input type="email" id="email" value={formData.email} onChange={set("email")} placeholder="ihre@email.de" required autoComplete="email" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            {/* Phone */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="phone" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Telefonnummer</label>
              <input type="tel" id="phone" value={formData.phone} onChange={set("phone")} placeholder="+49 123 456789" autoComplete="tel" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            {/* Delivery address */}
            <div style={{ ...sectionLabel, gridColumn: "1 / -1" }}>Lieferadresse</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
              <label htmlFor="address" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Straße und Hausnummer</label>
              <input id="address" value={formData.address} onChange={set("address")} placeholder="Musterstraße 1" autoComplete="street-address" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="zipCode" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>PLZ</label>
              <input id="zipCode" value={formData.zipCode} onChange={set("zipCode")} placeholder="12345" autoComplete="postal-code" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="city" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Stadt</label>
              <input id="city" value={formData.city} onChange={set("city")} placeholder="Berlin" autoComplete="address-level2" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="country" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Land</label>
              <select id="country" value={shippableCountries.some((c) => c.code === formData.country) ? formData.country : (shippableCountries[0]?.code || "")} onChange={set("country")} autoComplete="country" style={selStyle} onFocus={focusStyle} onBlur={blurStyle} disabled={!shippableCountries.length}>
                {shippableCountries.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag ? `${c.flag} ` : ""}{c.label}</option>
                ))}
              </select>
            </div>

            {/* Billing address checkbox */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, gridColumn: "1 / -1" }}>
              <input
                type="checkbox"
                id="billingSame"
                checked={formData.billingSameAsShipping !== false}
                onChange={e => setFormData(f => ({ ...f, billingSameAsShipping: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: tokens.primary.DEFAULT }}
              />
              <label htmlFor="billingSame" style={{ fontSize: 13, color: "#1A1A1A", cursor: "pointer", fontWeight: 600 }}>
                Rechnungsadresse = Lieferadresse
              </label>
            </div>

            {formData.billingSameAsShipping === false && (
              <>
                <div style={{ ...sectionLabel, gridColumn: "1 / -1" }}>Rechnungsadresse</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
                  <label htmlFor="billingAddress" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Straße und Hausnummer</label>
                  <input id="billingAddress" value={formData.billingAddress || ""} onChange={set("billingAddress")} placeholder="Musterstraße 1" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="billingZipCode" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>PLZ</label>
                  <input id="billingZipCode" value={formData.billingZipCode || ""} onChange={set("billingZipCode")} placeholder="12345" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="billingCity" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Stadt</label>
                  <input id="billingCity" value={formData.billingCity || ""} onChange={set("billingCity")} placeholder="Berlin" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="billingCountry" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Land</label>
                  <select id="billingCountry" value={(shippableCountries.find((c) => c.code === (formData.billingCountry || "")) || shippableCountries[0])?.code || ""} onChange={set("billingCountry")} style={selStyle} onFocus={focusStyle} onBlur={blurStyle} disabled={!shippableCountries.length}>
                    {shippableCountries.map((c) => (
                      <option key={c.code} value={c.code}>{c.flag ? `${c.flag} ` : ""}{c.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Passwort * (min. 6 Zeichen)</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={formData.password}
                  onChange={set("password")}
                  placeholder="Ihr Passwort"
                  required
                  autoComplete="new-password"
                  style={{ ...inp, paddingRight: 90 }}
                  onFocus={focusStyle}
                  onBlur={blurStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, color: tokens.primary.DEFAULT,
                    padding: "3px 6px",
                  }}
                >
                  {showPassword ? "Verbergen" : "Anzeigen"}
                </button>
              </div>
            </div>

            {/* Submit */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, gridColumn: "1 / -1" }}>
              <input
                type="checkbox"
                id="legalConsent"
                checked={!!formData.legalConsent}
                onChange={(e) => setFormData((f) => ({ ...f, legalConsent: e.target.checked }))}
                style={{ width: 16, height: 16, marginTop: 2, cursor: "pointer", accentColor: tokens.primary.DEFAULT }}
              />
              <label htmlFor="legalConsent" style={{ fontSize: 13, lineHeight: 1.45, color: "#374151", cursor: "pointer" }}>
                Ich habe die{" "}
                <Link href="/agb" style={{ color: tokens.primary.DEFAULT, fontWeight: 700, textDecoration: "none" }}>AGB</Link>,{" "}
                <Link href="/datenschutz" style={{ color: tokens.primary.DEFAULT, fontWeight: 700, textDecoration: "none" }}>Datenschutzhinweise</Link>{" "}
                und{" "}
                <Link href="/widerrufsrecht" style={{ color: tokens.primary.DEFAULT, fontWeight: 700, textDecoration: "none" }}>Widerrufsbelehrung</Link>{" "}
                gelesen und akzeptiere sie. Bei Zustimmung werde ich zum Newsletter angemeldet.
              </label>
            </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "13px 0",
                background: loading ? "#ccc" : tokens.primary.DEFAULT,
                color: "#fff",
                border: `2px solid ${loading ? "#bbb" : "#1A1A1A"}`,
                borderRadius: 8,
                fontSize: 15, fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 3px 0 2px #1A1A1A",
                transition: "transform 0.1s, box-shadow 0.1s",
                letterSpacing: 0.2,
                fontFamily: tokens.fontFamily.sans,
                maxWidth: 420,
                alignSelf: "center",
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = "translateY(1px)"; e.currentTarget.style.boxShadow = "0 2px 0 2px #1A1A1A"; } }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = loading ? "none" : "0 3px 0 2px #1A1A1A"; }}
            >
              {loading ? "Wird registriert…" : "Konto erstellen"}
            </button>
          </form>

          <style jsx>{`
            .register-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 12px;
            }
            @media (max-width: 767px) {
              .register-grid {
                grid-template-columns: 1fr;
              }
            }
          `}</style>

          {/* Login link */}
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0, textAlign: "center" }}>
            Bereits ein Konto?{" "}
            <Link href="/login" style={{ color: tokens.primary.DEFAULT, fontWeight: 700, textDecoration: "none" }}>
              Jetzt anmelden
            </Link>
          </p>
        </div>
      </div>

      {/* Footer hint */}
      <div style={{ padding: "16px 24px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
        © {new Date().getFullYear()} Belucha
      </div>
    </div>
  );
}
