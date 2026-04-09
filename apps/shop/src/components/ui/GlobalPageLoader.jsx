"use client";

import React from "react";

export default function GlobalPageLoader({ label = "Loading..." }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "60vh",
        width: "100%",
        display: "grid",
        placeItems: "center",
        padding: "48px 16px",
      }}
    >
      <div style={{ display: "grid", placeItems: "center", gap: 14 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "999px",
            border: "3px solid #d1d5db",
            borderTopColor: "#1b8880",
            animation: "belucha-spin 0.9s linear infinite",
          }}
        />
        <div style={{ fontSize: 14, color: "#6b7280", fontWeight: 500 }}>{label}</div>
      </div>
      <style jsx>{`
        @keyframes belucha-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

