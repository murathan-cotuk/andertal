"use client";

import { useEffect } from "react";

// global-error.jsx wraps the root layout — must render its own <html> and <body>.
// Triggered only when the root layout itself throws (rare but catastrophic).
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[GlobalError boundary]", error);
    }
  }, [error]);

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          fontFamily: "Montserrat, system-ui, sans-serif",
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "32px 24px",
          textAlign: "center",
          color: "#1f2937",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: "0.12em", color: "#ff971c", marginBottom: 8 }}>
          BELUCHA
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "16px 0 8px" }}>
          Seite nicht verfügbar
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 400, margin: "0 0 28px", lineHeight: 1.6 }}>
          Ein kritischer Fehler ist aufgetreten. Unser Team wurde benachrichtigt.
          Bitte laden Sie die Seite neu.
        </p>

        <button
          onClick={reset}
          style={{
            padding: "11px 28px",
            background: "#ff971c",
            color: "#fff",
            border: "2px solid #000",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 2px 0 2px #000",
          }}
        >
          Neu laden
        </button>

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
      </body>
    </html>
  );
}
