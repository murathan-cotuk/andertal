"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { tokens } from "@/design-system/tokens";

const MEDUSA_BACKEND_URL = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

const inputStyle = {
  width: "100%",
  padding: "11px 14px",
  border: "1px solid #e6dfd4",
  borderRadius: 8,
  fontSize: 15,
  color: "#1A1A1A",
  background: "#fff",
  boxSizing: "border-box",
  outline: "none",
};

/** Sets a new password from the e-mailed one-time link (backend: /store/customers/password-reset). */
function ResetPasswordForm() {
  const t = useTranslations("auth");
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) { setError(t("resetPasswordRule")); return; }
    if (password !== confirm) { setError(t("resetPasswordMismatch")); return; }
    setLoading(true);
    try {
      const res = await fetch(`${MEDUSA_BACKEND_URL}/store/customers/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) setDone(true);
      else setError(data?.code === "weak_password" ? t("resetPasswordRule") : t("resetLinkInvalid"));
    } catch {
      setError(t("resetLinkInvalid"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--shop-bg, #f6f2ec)", fontFamily: tokens.fontFamily.sans }}>
      <div style={{ padding: "16px 24px" }}>
        <Link href="/" style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", textDecoration: "none", letterSpacing: "-0.03em" }}>
          Andertal
        </Link>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #e6dfd4", borderRadius: 24, boxShadow: "0 0 0 1px rgba(29,27,24,0.08)", padding: "36px 30px 30px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1A1A1A", margin: "0 0 8px" }}>{t("resetPasswordTitle")}</h1>
          {!token ? (
            <p style={{ fontSize: 14, color: "#dc2626", margin: "0 0 18px" }}>{t("resetLinkInvalid")}</p>
          ) : done ? (
            <div style={{ marginBottom: 12, padding: "10px 12px", background: "#ecfdf5", border: "1px solid #86efac", borderRadius: 8, color: "#166534", fontSize: 13 }}>
              {t("resetPasswordDone")}
            </div>
          ) : (
            <>
              <p style={{ fontSize: 14, color: "#5e574e", margin: "0 0 18px" }}>{t("resetPasswordRule")}</p>
              {error ? (
                <div style={{ marginBottom: 12, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, color: "#dc2626", fontSize: 13 }}>
                  {error}
                </div>
              ) : null}
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label htmlFor="reset-pw" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("resetNewPassword")}</label>
                <input id="reset-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
                <label htmlFor="reset-pw2" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{t("resetConfirmPassword")}</label>
                <input id="reset-pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required style={inputStyle} />
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%", padding: "12px 0", background: loading ? "#ccc" : tokens.primary.DEFAULT, color: "#fff",
                    border: "1px solid transparent", borderRadius: 999, fontSize: 15, fontWeight: 800,
                    cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 0 0 1px rgba(29,27,24,0.08)",
                  }}
                >
                  {loading ? t("sending") : t("resetSavePassword")}
                </button>
              </form>
            </>
          )}
          <p style={{ fontSize: 13, color: "#5e574e", margin: "14px 0 0", textAlign: "center" }}>
            <Link href="/login" style={{ color: tokens.primary.DEFAULT, fontWeight: 700, textDecoration: "none" }}>
              {t("backToLogin")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
