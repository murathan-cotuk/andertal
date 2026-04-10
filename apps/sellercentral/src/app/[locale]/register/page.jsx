"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function RegisterForm() {
  const router = useRouter();
  const t = useTranslations("auth.register");
  const searchParams = useSearchParams();
  const [storeName, setStoreName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [isInvited, setIsInvited] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  useEffect(() => {
    const inviteEmail = searchParams?.get("email");
    const token = searchParams?.get("invite");
    if (inviteEmail) { setEmail(inviteEmail); setIsInvited(true); }
    if (token) setInviteToken(token);
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!email || !password) { setError(t("errorRequired")); return; }
    if (!isInvited && !storeName) { setError(t("errorStoreName")); return; }
    if (isInvited && (!firstName || !lastName)) { setError(t("errorName")); return; }
    if (password.length < 6) { setError(t("errorPasswordLength")); return; }
    if (!agreementAccepted) { setError(t("errorTerms")); return; }
    setLoading(true);
    try {
      const extra = {
        ...(inviteToken ? { invite_token: inviteToken, first_name: firstName, last_name: lastName } : {}),
        agreement_accepted: true,
        agreement_version: "1.0",
      };
      const data = await getMedusaAdminClient().registerSeller(
        email.trim().toLowerCase(), password, isInvited ? null : storeName.trim(), extra
      );
      if (!data?.token) throw new Error("Registration failed");
      localStorage.setItem("sellerToken", data.token);
      localStorage.setItem("sellerEmail", data.user.email);
      localStorage.setItem("sellerId", data.user.seller_id);
      localStorage.setItem("storeName", data.user.store_name || storeName || `${firstName} ${lastName}`);
      localStorage.setItem("sellerIsSuperuser", data.user.is_superuser ? "true" : "false");
      localStorage.setItem("sellerLoggedIn", "true");
      setSuccess(t("success"));
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err) {
      setError(err?.message || t("errorFailed"));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { width: "100%", padding: "10px 14px", border: "1.5px solid #d1d5db", borderRadius: 8, fontSize: 15, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 32, fontWeight: 900, letterSpacing: "0.18em", color: "#111827" }}>BELUCHA</span>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: "40px 36px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>{isInvited ? t("titleInvited") : t("title")}</h1>
            <p style={{ color: "#6b7280", fontSize: 15, margin: 0 }}>{isInvited ? t("subtitleInvited") : t("subtitle")}</p>
          </div>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {isInvited ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 6 }}>{t("firstName")} *</label>
                  <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required style={inputStyle} placeholder={t("firstNamePlaceholder")} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 6 }}>{t("lastName")} *</label>
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required style={inputStyle} placeholder={t("lastNamePlaceholder")} />
                </div>
              </div>
            ) : (
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 6 }}>{t("storeName")} *</label>
                <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} required style={inputStyle} placeholder={t("storeNamePlaceholder")} />
              </div>
            )}
            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 6 }}>{t("email")} *</label>
              <input
                type="email" value={email}
                onChange={(e) => !isInvited && setEmail(e.target.value)}
                required readOnly={isInvited}
                style={{ ...inputStyle, background: isInvited ? "#f9fafb" : "#fff" }}
                placeholder={t("emailPlaceholder")}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 6 }}>{t("password")} *</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} required
                  style={{ ...inputStyle, padding: "10px 44px 10px 14px" }}
                  placeholder={t("passwordPlaceholder")}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 0, display: "flex", alignItems: "center" }}
                  tabIndex={-1}>
                  {showPassword ? (
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 0 1 1.563-3.029m5.858.908a3 3 0 1 1 4.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88 6.59 6.59m7.532 7.532 3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0 1 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 0 1-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                  )}
                </button>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 14, color: "#374151" }}>
              <input
                type="checkbox"
                checked={agreementAccepted}
                onChange={(e) => setAgreementAccepted(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, cursor: "pointer", accentColor: "#ff971c", flexShrink: 0 }}
              />
              <span>
                {t.rich("agreeText", {
                  terms: (chunks) => (
                    <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#ff971c", textDecoration: "underline" }}>{chunks}</a>
                  ),
                  privacy: (chunks) => (
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#ff971c", textDecoration: "underline" }}>{chunks}</a>
                  ),
                })} *
              </span>
            </label>
            {error && (
              <div style={{ background: "#fee2e2", border: "1px solid #ef4444", borderRadius: 8, padding: "12px 14px", color: "#991b1b", fontSize: 14 }}>{error}</div>
            )}
            {success && (
              <div style={{ background: "#d1fae5", border: "1px solid #10b981", borderRadius: 8, padding: "12px 14px", color: "#065f46", fontSize: 14 }}>{success}</div>
            )}
            <button type="submit" disabled={loading}
              style={{ padding: "12px", background: loading ? "#9ca3af" : "#ff971c", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? t("submitting") : (isInvited ? t("submitInvited") : t("submit"))}
            </button>
          </form>
          <p style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: "#6b7280" }}>
            <Link href="/login" style={{ color: "#ff971c", fontWeight: 600, textDecoration: "none" }}>{t("alreadyHaveAccount")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Register() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading…</div>}>
      <RegisterForm />
    </Suspense>
  );
}
