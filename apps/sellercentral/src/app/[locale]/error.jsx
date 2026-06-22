"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { useLt } from "@/lib/locale-text";
import { reportSellerClientError } from "@/lib/report-seller-client-error";

export default function SellerError({ error, reset }) {
  const locale = useLocale();
  const lt = useLt();

  useEffect(() => {
    console.error("[SellerError boundary]", error);
    reportSellerClientError({
      errorCode: "REACT_ERROR_BOUNDARY",
      errorMessage: error?.message || "Unexpected render error",
      terminalOutput: error?.stack || null,
      context: typeof window !== "undefined" ? window.location.pathname : "",
    });
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
        {lt("Something went wrong", "Bir şeyler ters gitti", "Une erreur s'est produite", "Algo salió mal", "Qualcosa è andato storto", "Etwas ist schiefgelaufen")}
      </h1>
      <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 400, margin: "0 0 28px", lineHeight: 1.6 }}>
        {lt(
          "An unexpected error occurred. Please try again.",
          "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
          "Une erreur inattendue s'est produite. Veuillez réessayer.",
          "Ocurrió un error inesperado. Inténtelo de nuevo.",
          "Si è verificato un errore imprevisto. Riprovare.",
          "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
        )}
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{
            padding: "10px 24px",
            background: "#1f2937",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {lt("Try again", "Tekrar dene", "Réessayer", "Reintentar", "Riprova", "Erneut versuchen")}
        </button>
        <button
          onClick={() => (window.location.href = `/${locale}/dashboard`)}
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
          {lt("Go to dashboard", "Panele git", "Aller au tableau de bord", "Ir al panel", "Vai alla dashboard", "Zum Dashboard")}
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
