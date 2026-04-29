"use client";

import React, { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { tokens } from "@/design-system/tokens";

const MEDUSA_BACKEND_URL = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const val = String(email || "").trim().toLowerCase();
    if (!val) {
      setError(t("enterEmail"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${MEDUSA_BACKEND_URL}/store/customers/password-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: val }),
      });
      // Security best-practice: don't reveal if email exists.
      if (!res.ok) {
        setSuccess(t("resetSent"));
      } else {
        setSuccess(t("resetSent"));
      }
    } catch {
      setSuccess(t("resetSent"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa", fontFamily: tokens.fontFamily.sans }}>
      <div style={{ padding: "16px 24px" }}>
        <Link href="/" style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", textDecoration: "none", letterSpacing: "-0.03em" }}>
          Andertal
        </Link>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "#fff",
            border: "2px solid #1A1A1A",
            borderRadius: 16,
            boxShadow: "4px 4px 0 0 #1A1A1A",
            padding: "36px 30px 30px",
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1A1A1A", margin: "0 0 8px" }}>{t("forgotPasswordTitle")}</h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 18px" }}>
            {t("forgotPasswordSubtitle")}
          </p>

          {error ? (
            <div style={{ marginBottom: 12, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, color: "#dc2626", fontSize: 13 }}>
              {error}
            </div>
          ) : null}
          {success ? (
            <div style={{ marginBottom: 12, padding: "10px 12px", background: "#ecfdf5", border: "1px solid #86efac", borderRadius: 8, color: "#166534", fontSize: 13 }}>
              {success}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label htmlFor="forgot-email" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>E-Mail</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              required
              style={{
                width: "100%",
                padding: "11px 14px",
                border: "2px solid #1A1A1A",
                borderRadius: 8,
                fontSize: 15,
                color: "#1A1A1A",
                background: "#fff",
                boxSizing: "border-box",
                outline: "none",
              }}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 0",
                background: loading ? "#ccc" : tokens.primary.DEFAULT,
                color: "#fff",
                border: `2px solid ${loading ? "#bbb" : "#1A1A1A"}`,
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 3px 0 2px #1A1A1A",
              }}
            >
              {loading ? t("sending") : t("sendResetLink")}
            </button>
          </form>

          <p style={{ fontSize: 13, color: "#6b7280", margin: "14px 0 0", textAlign: "center" }}>
            <Link href="/login" style={{ color: tokens.primary.DEFAULT, fontWeight: 700, textDecoration: "none" }}>
              {t("backToLogin")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
