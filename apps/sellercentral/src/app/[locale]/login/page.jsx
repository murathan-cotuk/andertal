"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

export default function Login() {
  const router = useRouter();
  const t = useTranslations("auth.login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // 2FA step
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  const finishLogin = async (data) => {
    localStorage.setItem("sellerToken", data.token);
    localStorage.setItem("sellerEmail", data.user.email);
    localStorage.setItem("sellerId", data.user.seller_id);
    localStorage.setItem("storeName", data.user.store_name || "");
    localStorage.setItem("sellerIsSuperuser", data.user.is_superuser ? "true" : "false");
    localStorage.setItem("sellerPermissions", data.user.permissions ? JSON.stringify(data.user.permissions) : "null");
    localStorage.setItem("sellerLoggedIn", "true");
    // Also persist token in httpOnly cookie (XSS-safe session gate)
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: data.token }),
    }).catch(() => {}); // non-fatal — localStorage remains the primary auth source
    router.push("/dashboard");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError(t("errorRequired")); return; }
    setLoading(true);
    try {
      const data = await getMedusaAdminClient().loginSeller(email.trim().toLowerCase(), password);
      if (data?.totp_required) {
        setTotpRequired(true);
        setLoading(false);
        return;
      }
      if (!data?.token) throw new Error("Login failed");
      finishLogin(data);
    } catch (err) {
      setError(err?.message || t("errorFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!totpCode) { setError("Bitte Code eingeben."); return; }
    setLoading(true);
    try {
      const data = await getMedusaAdminClient().loginSeller(email.trim().toLowerCase(), password, { totp_code: totpCode });
      if (!data?.token) throw new Error("Login failed");
      finishLogin(data);
    } catch (err) {
      setError(err?.message || "Ungültiger Code. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 32, fontWeight: 900, letterSpacing: "0.18em", color: "#111827" }}>BELUCHA</span>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: "40px 36px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          {!totpRequired ? (
            <>
              <div style={{ textAlign: "center", marginBottom: 32 }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>{t("title")}</h1>
                <p style={{ color: "#6b7280", fontSize: 15, margin: 0 }}>{t("subtitle")}</p>
              </div>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 6 }}>{t("email")}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #d1d5db", borderRadius: 8, fontSize: 15, outline: "none", boxSizing: "border-box" }}
                    placeholder={t("emailPlaceholder")}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 6 }}>{t("password")}</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      style={{ width: "100%", padding: "10px 44px 10px 14px", border: "1.5px solid #d1d5db", borderRadius: 8, fontSize: 15, outline: "none", boxSizing: "border-box" }}
                      placeholder={t("passwordPlaceholder")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 0, display: "flex", alignItems: "center" }}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 0 1 1.563-3.029m5.858.908a3 3 0 1 1 4.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88 6.59 6.59m7.532 7.532 3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0 1 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 0 1-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                      )}
                    </button>
                  </div>
                </div>
                {error && (
                  <div style={{ background: "#fee2e2", border: "1px solid #ef4444", borderRadius: 8, padding: "12px 14px", color: "#991b1b", fontSize: 14 }}>
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  style={{ padding: "12px", background: loading ? "#9ca3af" : "#ff971c", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}
                >
                  {loading ? t("submitting") : t("submit")}
                </button>
              </form>
              <p style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: "#6b7280" }}>
                <Link href="/register" style={{ color: "#ff971c", fontWeight: 600, textDecoration: "none" }}>{t("noAccount")}</Link>
              </p>
            </>
          ) : (
            <>
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>Zwei-Faktor-Authentifizierung</h1>
                <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
                  Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein.
                </p>
              </div>
              <form onSubmit={handleTotpSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 6 }}>Authenticator-Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    autoFocus
                    maxLength={6}
                    style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #d1d5db", borderRadius: 8, fontSize: 22, fontWeight: 700, textAlign: "center", letterSpacing: "0.25em", outline: "none", boxSizing: "border-box" }}
                    placeholder="000000"
                  />
                </div>
                {error && (
                  <div style={{ background: "#fee2e2", border: "1px solid #ef4444", borderRadius: 8, padding: "12px 14px", color: "#991b1b", fontSize: 14 }}>
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || totpCode.length !== 6}
                  style={{ padding: "12px", background: loading || totpCode.length !== 6 ? "#9ca3af" : "#ff971c", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: loading || totpCode.length !== 6 ? "not-allowed" : "pointer" }}
                >
                  {loading ? "Überprüfen…" : "Bestätigen"}
                </button>
                <button
                  type="button"
                  onClick={() => { setTotpRequired(false); setTotpCode(""); setError(""); }}
                  style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
                >
                  Zurück zur Anmeldung
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
