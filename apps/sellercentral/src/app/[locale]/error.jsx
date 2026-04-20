"use client";

import { useEffect } from "react";

export default function SellerError({ error, reset }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[SellerError boundary]", error);
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
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
        color: "#1f2937",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
        Etwas ist schiefgelaufen
      </h1>
      <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 400, margin: "0 0 28px", lineHeight: 1.6 }}>
        Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{
            padding: "10px 24px",
            background: "#ff971c",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Erneut versuchen
        </button>
        <button
          onClick={() => (window.location.href = "/dashboard")}
          style={{
            padding: "10px 24px",
            background: "#f3f4f6",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Zum Dashboard
        </button>
      </div>

      {process.env.NODE_ENV === "development" && error?.message && (
        <pre
          style={{
            marginTop: 28,
            fontSize: 11,
            color: "#ef4444",
            textAlign: "left",
            maxWidth: 600,
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
