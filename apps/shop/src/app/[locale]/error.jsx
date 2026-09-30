"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function LocaleError({ error, reset }) {
  const t = useTranslations("pageStates");
  useEffect(() => {
    // Sentry automatically picks this up via withSentryConfig.
    // Log to console in dev for quick debugging.
    if (process.env.NODE_ENV === "development") {
      console.error("[LocaleError boundary]", error);
    }
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        fontFamily: "Montserrat, system-ui, sans-serif",
        textAlign: "center",
        color: "#1f2937",
      }}
    >
      <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: "0.12em", color: "#ee8a12", marginBottom: 8 }}>
        ANDERTAL
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "16px 0 8px" }}>
        {t("errorTitle")}
      </h1>
      <p style={{ fontSize: 15, color: "#6b7280", maxWidth: 420, margin: "0 0 32px", lineHeight: 1.6 }}>
        {t("errorText")}
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{
            padding: "11px 28px",
            background: "#ee8a12",
            color: "#fff",
            border: "1px solid #e6dfd4",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 0 0 1px rgba(29,27,24,0.08)",
          }}
        >
          {t("retry")}
        </button>
        <Link
          href="/"
          style={{
            padding: "11px 28px",
            background: "#fff",
            color: "#1f2937",
            border: "1px solid #e6dfd4",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: "0 0 0 1px rgba(29,27,24,0.08)",
          }}
        >
          {t("toHome")}
        </Link>
      </div>

      {process.env.NODE_ENV === "development" && error?.message && (
        <pre
          style={{
            marginTop: 32,
            fontSize: 11,
            color: "#ef4444",
            textAlign: "left",
            maxWidth: 640,
            width: "100%",
            overflow: "auto",
            background: "#fef2f2",
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid #fca5a5",
          }}
        >
          {error.message}
          {error.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>
      )}
    </div>
  );
}
