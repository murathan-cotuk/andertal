"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, Link, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMedusaAuth } from "@/hooks/useMedusaAuth";
import { useCustomerAuth as useAuth, useAuthGuard } from "@belucha/lib";
import { tokens } from "@/design-system/tokens";
import { useCart } from "@/context/CartContext";
import { ALL_COUNTRIES, getLocalizedCountryName, getShippableCountries } from "@/lib/countries";
import CustomCheckbox from "@/components/ui/CustomCheckbox";
import { resolveImageUrl } from "@/lib/image-url";
import { DEFAULT_CURRENCY, marketPrefix, parseMarketPath } from "@/lib/shop-market";

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

  const t = useTranslations("auth");
  const [accountType, setAccountType] = useState("privat");
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    gender: "", birthDate: "",
    address: "", addressLine2: "", zipCode: "", city: "", country: "",
    companyName: "", vatNumber: "",
    billingSameAsShipping: true,
    billingAddress: "", billingZipCode: "", billingCity: "", billingCountry: "",
    password: "",
    passwordConfirm: "",
    legalConsent: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordConfirmTouched, setPasswordConfirmTouched] = useState(false);
  const [error, setError] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [billingCountrySearch, setBillingCountrySearch] = useState("");
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [isBillingCountryOpen, setIsBillingCountryOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const countryBoxRef = useRef(null);
  const billingCountryBoxRef = useRef(null);
  const [branding, setBranding] = useState({ logo: "", favicon: "", logoHeight: 34 });
  const { login } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { register: registerMedusa, login: loginMedusa, loading } = useMedusaAuth();
  const { shippingGroups } = useCart();
  const shippableCountries = useMemo(() => getShippableCountries(shippingGroups, locale), [shippingGroups, locale]);
  const localizedAllCountries = useMemo(() => {
    return ALL_COUNTRIES
      .map((c) => ({ ...c, label: getLocalizedCountryName(c.code, locale) }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  }, [locale]);
  const countriesForSelect = shippableCountries.length ? shippableCountries : localizedAllCountries;
  const localeItems = [
    { code: "en", label: "English" },
    { code: "de", label: "Deutsch" },
    { code: "fr", label: "Français" },
    { code: "it", label: "Italiano" },
    { code: "es", label: "Español" },
    { code: "tr", label: "Türkçe" },
  ];
  const localeHref = (nextLocale) => {
    const parsed = parseMarketPath(pathname || "");
    const country = parsed?.country || "de";
    const currency = parsed?.currency || DEFAULT_CURRENCY;
    return `${marketPrefix(country, nextLocale, currency)}/register`;
  };

  useEffect(() => {
    if (!shippableCountries.length) return;
    const codes = new Set(shippableCountries.map((c) => c.code));
    setFormData((f) => {
      const next = { ...f };
      if (next.country && !codes.has(next.country)) next.country = "";
      if (next.billingCountry && !codes.has(next.billingCountry)) next.billingCountry = "";
      return next;
    });
  }, [shippableCountries]);

  useEffect(() => {
    const selected = countriesForSelect.find((c) => c.code === formData.country);
    setCountrySearch(selected ? `${selected.label} (${selected.code})` : "");
  }, [formData.country, countriesForSelect]);

  useEffect(() => {
    const selected = countriesForSelect.find((c) => c.code === (formData.billingCountry || ""));
    setBillingCountrySearch(selected ? `${selected.label} (${selected.code})` : "");
  }, [formData.billingCountry, countriesForSelect]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (countryBoxRef.current && !countryBoxRef.current.contains(event.target)) {
        setIsCountryOpen(false);
      }
      if (billingCountryBoxRef.current && !billingCountryBoxRef.current.contains(event.target)) {
        setIsBillingCountryOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store-seller-settings?seller_id=default", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setBranding({
          logo: resolveImageUrl(d?.shop_logo_url || d?.sellercentral_logo_url || ""),
          favicon: resolveImageUrl(d?.shop_favicon_url || d?.sellercentral_favicon_url || ""),
          logoHeight:
            d?.shop_logo_height != null
              ? Number(d.shop_logo_height)
              : (d?.sellercentral_logo_height != null ? Number(d.sellercentral_logo_height) : 34),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const fav = (branding.favicon || "").trim();
    if (!fav || typeof document === "undefined") return;
    const upsert = (rel) => {
      let link = document.querySelector(`link[rel='${rel}']`);
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", rel);
        document.head.appendChild(link);
      }
      link.setAttribute("href", fav);
      link.setAttribute("type", "image/x-icon");
    };
    upsert("icon");
    upsert("shortcut icon");
  }, [branding.favicon]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    let viewport = document.querySelector('meta[name="viewport"]');
    const previous = viewport?.getAttribute("content") || "";
    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.setAttribute("name", "viewport");
      document.head.appendChild(viewport);
    }
    viewport.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
    );
    return () => {
      if (!viewport) return;
      if (previous) viewport.setAttribute("content", previous);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const set = (key) => (e) => setFormData(f => ({ ...f, [key]: e.target.value }));
  const parseCountryCode = (value, list) => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const byCode = list.find((c) => c.code.toLowerCase() === raw.toLowerCase());
    if (byCode) return byCode.code;
    const m = raw.match(/\(([A-Za-z]{2})\)\s*$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (list.some((c) => c.code === code)) return code;
    }
    const byLabel = list.find((c) => c.label.toLowerCase() === raw.toLowerCase());
    return byLabel ? byLabel.code : null;
  };

  const focusStyle = (e) => e.target.style.boxShadow = `0 0 0 3px ${tokens.primary.light}`;
  const blurStyle = (e) => e.target.style.boxShadow = "none";
  const passwordMismatch =
    !!formData.passwordConfirm &&
    formData.password !== formData.passwordConfirm;
  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return countriesForSelect;
    return countriesForSelect.filter((c) =>
      c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [countrySearch, countriesForSelect]);
  const filteredBillingCountries = useMemo(() => {
    const q = billingCountrySearch.trim().toLowerCase();
    if (!q) return countriesForSelect;
    return countriesForSelect.filter((c) =>
      c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [billingCountrySearch, countriesForSelect]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!formData.email || !formData.password) { setError(t("emailRequired")); return; }
    if (formData.password.length < 6) { setError(t("passwordTooShort")); return; }
    if (formData.password !== formData.passwordConfirm) {
      setPasswordConfirmTouched(true);
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    if (accountType === "gewerbe" && !formData.companyName.trim()) { setError(t("companyNameRequired")); return; }
    if (!formData.legalConsent) { setError(t("legalConsentRequired")); return; }

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
      if (!registerResult?.customer) { setError(t("registerFailed")); return; }

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
          setError(t("registerFailed"));
        }
      } else {
        setError(t("registerFailed"));
      }
    } catch (err) {
      setError(err.message || t("registerFailed"));
    }
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#fafafa", fontFamily: tokens.fontFamily.sans, overflowX: "hidden", overflowY: "auto", touchAction: "pan-y", overscrollBehaviorX: "none", WebkitOverflowScrolling: "touch" }}>
      {/* Top bar */}
      <div style={{ padding: "16px max(16px, env(safe-area-inset-left)) 16px max(16px, env(safe-area-inset-right))", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
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
        <details style={{ position: "relative" }}>
          <summary style={{ listStyle: "none", cursor: "pointer", border: "2px solid #1A1A1A", borderRadius: 10, padding: "7px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#fff", lineHeight: 0, boxShadow: isDesktop ? "0 3px 0 0 #1A1A1A" : "none", minWidth: isDesktop ? 42 : "auto" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="#1A1A1A" strokeWidth="2" />
              <path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" stroke="#1A1A1A" strokeWidth="1.6" />
            </svg>
          </summary>
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", background: "#fff", border: "2px solid #1A1A1A", borderRadius: isDesktop ? 14 : 10, minWidth: isDesktop ? 180 : 150, boxShadow: isDesktop ? "0 12px 30px rgba(0,0,0,0.18)" : "0 6px 20px rgba(0,0,0,0.14)", overflow: "hidden", zIndex: 20, padding: isDesktop ? 6 : 0 }}>
            {localeItems.map((l) => (
              <a
                key={l.code}
                href={localeHref(l.code)}
                style={{ display: "block", padding: "10px 12px", borderRadius: isDesktop ? 10 : 0, marginBottom: isDesktop ? 4 : 0, fontSize: 14, fontWeight: l.code === locale ? 800 : 600, textDecoration: "none", color: "#1A1A1A", background: l.code === locale ? "#fff4e8" : "#fff" }}
              >
                {l.label}
              </a>
            ))}
          </div>
        </details>
      </div>

      {/* Center card */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px", boxSizing: "border-box" }}>
        <div style={{
          width: "100%", maxWidth: 980,
          background: "#fff",
          border: "2px solid #1A1A1A",
          borderRadius: 16,
          boxShadow: "4px 4px 0 0 #1A1A1A",
          padding: "clamp(20px, 5vw, 40px) clamp(16px, 4vw, 36px) clamp(16px, 4vw, 36px)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
          marginBottom: 40,
        }}>
          {/* Monkey */}
          <MonkeyAvatar isBlind={!showPassword} />

          {/* Heading */}
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.03em" }}>
              {t("createAccount")}
            </h1>
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
              <label style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("accountType")}</label>
              <div style={{ display: "flex", border: "2px solid #1A1A1A", borderRadius: 8, overflow: "hidden" }}>
                {[{ val: "privat", label: t("private") }, { val: "gewerbe", label: t("business") }].map(({ val, label }) => (
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
                <div style={{ ...sectionLabel, gridColumn: "1 / -1" }}>{t("companyData")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="companyName" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("companyName")} *</label>
                  <input id="companyName" value={formData.companyName} onChange={set("companyName")} placeholder={t("placeholderCompany")} required style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="vatNumber" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("vatNumber")}</label>
                  <input id="vatNumber" value={formData.vatNumber} onChange={set("vatNumber")} placeholder="DE123456789" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                </div>
                <div style={{ ...sectionLabel, gridColumn: "1 / -1" }}>{t("contactPerson")}</div>
              </>
            )}

            {/* Name row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="firstName" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("firstName")} *</label>
                <input id="firstName" value={formData.firstName} onChange={set("firstName")} placeholder={t("placeholderFirstName")} required style={inp} onFocus={focusStyle} onBlur={blurStyle} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="lastName" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("lastName")} *</label>
                <input id="lastName" value={formData.lastName} onChange={set("lastName")} placeholder={t("placeholderLastName")} required style={inp} onFocus={focusStyle} onBlur={blurStyle} />
              </div>
            </div>

            {/* Gender + Birthdate */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="gender" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("gender")}</label>
              <select id="gender" value={formData.gender} onChange={set("gender")} style={selStyle} onFocus={focusStyle} onBlur={blurStyle}>
                <option value="">{t("genderSelect")}</option>
                <option value="male">{t("genderMale")}</option>
                <option value="female">{t("genderFemale")}</option>
                <option value="diverse">{t("genderDiverse")}</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="birthDate" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("birthDate")}</label>
              <input
                type="date"
                id="birthDate"
                value={formData.birthDate}
                onChange={set("birthDate")}
                style={{ ...inp, minHeight: 45, appearance: "none", WebkitAppearance: "none" }}
                onFocus={focusStyle}
                onBlur={blurStyle}
              />
            </div>

            {/* Email */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="email" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>E-Mail *</label>
              <input type="email" id="email" value={formData.email} onChange={set("email")} placeholder={t("emailPlaceholder")} required autoComplete="email" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            {/* Phone */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="phone" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("phone")}</label>
              <input type="tel" id="phone" value={formData.phone} onChange={set("phone")} placeholder={t("placeholderPhone")} autoComplete="tel" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            {/* Delivery address */}
            <div style={{ ...sectionLabel, gridColumn: "1 / -1" }}>{t("deliveryAddress")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
              <label htmlFor="address" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("street")}</label>
              <input id="address" value={formData.address} onChange={set("address")} placeholder={t("placeholderStreet")} autoComplete="street-address" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="zipCode" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("postalCode")}</label>
                <input id="zipCode" value={formData.zipCode} onChange={set("zipCode")} placeholder={t("placeholderZip")} autoComplete="postal-code" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="city" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("city")}</label>
                <input id="city" value={formData.city} onChange={set("city")} placeholder={t("placeholderCity")} autoComplete="address-level2" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="country" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("country")}</label>
              <div ref={countryBoxRef} style={{ position: "relative" }}>
                <input
                  id="country"
                  type="text"
                  value={countrySearch}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCountrySearch(v);
                    setIsCountryOpen(true);
                    if (!v.trim()) {
                      setFormData((f) => ({ ...f, country: "" }));
                    }
                  }}
                  autoComplete="off"
                  placeholder="Land suchen..."
                  style={inp}
                  onFocus={(e) => {
                    focusStyle(e);
                    setIsCountryOpen(true);
                  }}
                  onBlur={(e) => {
                    blurStyle(e);
                  }}
                  disabled={!countriesForSelect.length}
                />
                {isCountryOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      background: "#fff",
                      border: "2px solid #1A1A1A",
                      borderRadius: 8,
                      maxHeight: 220,
                      overflowY: "auto",
                      overscrollBehavior: "contain",
                      zIndex: 20,
                      boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
                    }}
                    onWheel={(e) => {
                      const el = e.currentTarget;
                      const atTop = el.scrollTop <= 0;
                      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                      if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
                        e.preventDefault();
                      }
                      e.stopPropagation();
                    }}
                  >
                    {filteredCountries.length ? filteredCountries.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setFormData((f) => ({ ...f, country: c.code }));
                          setCountrySearch(`${c.label} (${c.code})`);
                          setIsCountryOpen(false);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          borderBottom: "1px solid #f1f1f1",
                          background: "#fff",
                          padding: "9px 12px",
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        {c.label} ({c.code})
                      </button>
                    )) : (
                      <div style={{ padding: "9px 12px", fontSize: 14, color: "#6b7280" }}>
                        Sonuc bulunamadi
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Billing address checkbox */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, gridColumn: "1 / -1" }}>
              <CustomCheckbox
                id="billingSame"
                checked={formData.billingSameAsShipping !== false}
                onChange={e => setFormData(f => ({ ...f, billingSameAsShipping: e.target.checked }))}
                size={18}
              />
              <label htmlFor="billingSame" style={{ fontSize: 13, color: "#1A1A1A", cursor: "pointer", fontWeight: 600 }}>
                {t("billingSame")}
              </label>
            </div>

            {formData.billingSameAsShipping === false && (
              <>
                <div style={{ ...sectionLabel, gridColumn: "1 / -1" }}>{t("billingAddress")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
                  <label htmlFor="billingAddress" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("street")}</label>
                  <input id="billingAddress" value={formData.billingAddress || ""} onChange={set("billingAddress")} placeholder="Musterstraße 1" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="billingZipCode" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("postalCode")}</label>
                  <input id="billingZipCode" value={formData.billingZipCode || ""} onChange={set("billingZipCode")} placeholder="12345" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="billingCity" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("city")}</label>
                  <input id="billingCity" value={formData.billingCity || ""} onChange={set("billingCity")} placeholder="Berlin" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="billingCountry" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("country")}</label>
                  <div ref={billingCountryBoxRef} style={{ position: "relative" }}>
                    <input
                      id="billingCountry"
                      type="text"
                      value={billingCountrySearch}
                      onChange={(e) => {
                        const v = e.target.value;
                        setBillingCountrySearch(v);
                        setIsBillingCountryOpen(true);
                        if (!v.trim()) {
                          setFormData((f) => ({ ...f, billingCountry: "" }));
                        }
                      }}
                      autoComplete="off"
                      placeholder="Land suchen..."
                      style={inp}
                      onFocus={(e) => {
                        focusStyle(e);
                        setIsBillingCountryOpen(true);
                      }}
                      onBlur={(e) => {
                        blurStyle(e);
                      }}
                      disabled={!countriesForSelect.length}
                    />
                    {isBillingCountryOpen && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          left: 0,
                          right: 0,
                          background: "#fff",
                          border: "2px solid #1A1A1A",
                          borderRadius: 8,
                          maxHeight: 220,
                          overflowY: "auto",
                          overscrollBehavior: "contain",
                          zIndex: 20,
                          boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
                        }}
                        onWheel={(e) => {
                          const el = e.currentTarget;
                          const atTop = el.scrollTop <= 0;
                          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                          if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
                            e.preventDefault();
                          }
                          e.stopPropagation();
                        }}
                      >
                        {filteredBillingCountries.length ? filteredBillingCountries.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setFormData((f) => ({ ...f, billingCountry: c.code }));
                              setBillingCountrySearch(`${c.label} (${c.code})`);
                              setIsBillingCountryOpen(false);
                            }}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              border: "none",
                              borderBottom: "1px solid #f1f1f1",
                              background: "#fff",
                              padding: "9px 12px",
                              cursor: "pointer",
                              fontSize: 14,
                            }}
                          >
                            {c.label} ({c.code})
                          </button>
                        )) : (
                          <div style={{ padding: "9px 12px", fontSize: 14, color: "#6b7280" }}>
                            Sonuc bulunamadi
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("passwordLabel")}</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={formData.password}
                  onChange={set("password")}
                  placeholder={t("passwordPlaceholder")}
                  required
                  autoComplete="new-password"
                  style={{ ...inp, paddingRight: 90 }}
                  onFocus={focusStyle}
                  onBlur={blurStyle}
                />
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setShowPassword((v) => !v);
                  }}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, color: tokens.primary.DEFAULT,
                    padding: "3px 6px",
                    zIndex: 2,
                    touchAction: "manipulation",
                  }}
                >
                  {showPassword ? t("hide") : t("show")}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Passwort wiederholen *</label>
              <input
                type={showPassword ? "text" : "password"}
                id="passwordConfirm"
                value={formData.passwordConfirm}
                onChange={set("passwordConfirm")}
                placeholder={t("passwordPlaceholder")}
                required
                autoComplete="new-password"
                style={{
                  ...inp,
                  border: passwordConfirmTouched && passwordMismatch ? "2px solid #dc2626" : inp.border,
                }}
                onFocus={focusStyle}
                onBlur={(e) => {
                  blurStyle(e);
                  setPasswordConfirmTouched(true);
                }}
              />
              {passwordConfirmTouched && passwordMismatch && (
                <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>
                  Passwörter stimmen nicht überein.
                </span>
              )}
            </div>

            {/* Submit */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, gridColumn: "1 / -1" }}>
              <CustomCheckbox
                id="legalConsent"
                checked={!!formData.legalConsent}
                onChange={(e) => setFormData((f) => ({ ...f, legalConsent: e.target.checked }))}
                size={18}
                style={{ marginTop: 2 }}
              />
              <label htmlFor="legalConsent" style={{ fontSize: 13, lineHeight: 1.45, color: "#374151", cursor: "pointer" }}>
                {t("legalConsentPart1")}{" "}
                <Link href="/agb" style={{ color: tokens.primary.DEFAULT, fontWeight: 700, textDecoration: "none" }}>{t("termsLabel")}</Link>
                {t("legalConsentPart2")}{" "}
                <Link href="/datenschutz" style={{ color: tokens.primary.DEFAULT, fontWeight: 700, textDecoration: "none" }}>{t("privacyLabel")}</Link>{" "}
                {t("legalConsentPart3")}{" "}
                <Link href="/widerrufsrecht" style={{ color: tokens.primary.DEFAULT, fontWeight: 700, textDecoration: "none" }}>{t("withdrawalLabel")}</Link>{" "}
                {t("legalConsentPart4")}
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
              {loading ? t("registering") : t("createAccount")}
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
            {t("alreadyHaveAccount")}{" "}
            <Link href="/login" style={{ color: tokens.primary.DEFAULT, fontWeight: 700, textDecoration: "none" }}>
              {t("signInNow")}
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
