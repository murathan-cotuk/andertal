"use client";

import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console in dev; Sentry picks it up automatically in prod
    if (process.env.NODE_ENV === "development") {
      console.error("[ErrorBoundary]", error, info?.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 320,
          padding: "48px 24px",
          textAlign: "center",
          color: "#374151",
          fontFamily: "system-ui, sans-serif",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
            Etwas ist schiefgelaufen
          </h2>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 24px", maxWidth: 380 }}>
            Ein unerwarteter Fehler ist aufgetreten. Bitte laden Sie die Seite neu oder versuchen Sie es später erneut.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              padding: "10px 24px",
              background: "#1b8880",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Seite neu laden
          </button>
          {process.env.NODE_ENV === "development" && this.state.error && (
            <pre style={{ marginTop: 24, fontSize: 11, color: "#ef4444", textAlign: "left", maxWidth: "100%", overflow: "auto", background: "#fef2f2", padding: "12px 16px", borderRadius: 6 }}>
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

/** Convenience wrapper for section-level boundaries (shows empty instead of full-page error) */
export function SectionErrorBoundary({ children }) {
  return (
    <ErrorBoundary
      fallback={
        <div style={{ padding: "24px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
          Dieser Bereich konnte nicht geladen werden.
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
