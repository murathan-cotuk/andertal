"use client";

import React, { useEffect, useState } from "react";
import { useSellerImpersonation } from "@/context/SellerImpersonationContext";

const BAR_HEIGHT = 44;
const PURPLE = "#7c3aed";
const PURPLE_DARK = "#5b21b6";
const PURPLE_ACTIVE = "#a78bfa";
const ORANGE_BORDER = "4px solid #f97316";

export default function SellerImperBar() {
  const { tabs, expandedId, isExpanded, activeTab, openTab, closeTab, switchTab, collapseAll, expandTab } = useSellerImpersonation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (tabs.length > 0) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [tabs.length]);

  if (!visible) return null;

  return (
    <>
      {/* Orange border overlay when in seller mode */}
      {isExpanded && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            border: ORANGE_BORDER,
            pointerEvents: "none",
            zIndex: 9990,
            borderRadius: 2,
          }}
        />
      )}

      {/* Bottom tab bar */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: BAR_HEIGHT,
          background: PURPLE,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 12px",
          zIndex: 9995,
          boxShadow: "0 -2px 12px rgba(0,0,0,0.25)",
          userSelect: "none",
        }}
      >
        {/* Superuser return button */}
        <button
          onClick={collapseAll}
          title="Zurück zum Superuser-Modus"
          style={{
            background: isExpanded ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.22)",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 6,
            color: "#fff",
            cursor: "pointer",
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 4,
            height: 30,
            whiteSpace: "nowrap",
            letterSpacing: "0.02em",
          }}
        >
          ⬡ Admin
        </button>

        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.2)", margin: "0 4px" }} />

        {/* Seller tabs */}
        {tabs.map((tab) => {
          const isActive = tab.id === expandedId;
          return (
            <div
              key={tab.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 0,
                background: isActive ? PURPLE_ACTIVE : "rgba(255,255,255,0.13)",
                border: isActive ? "1.5px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.2)",
                borderRadius: 6,
                height: 30,
                overflow: "hidden",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              {/* Seller name chip */}
              <button
                onClick={() => isActive ? collapseAll() : expandTab(tab.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: isActive ? "#1e1b4b" : "#fff",
                  cursor: "pointer",
                  padding: "0 10px",
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: "100%",
                  whiteSpace: "nowrap",
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={isActive ? "Össefalten" : `Als ${tab.storeName} öffnen`}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: isActive ? "#1e1b4b" : "rgba(255,255,255,0.3)",
                    color: isActive ? PURPLE_ACTIVE : "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    lineHeight: "18px",
                    textAlign: "center",
                    flexShrink: 0,
                  }}
                >
                  {(tab.storeName || "?").charAt(0).toUpperCase()}
                </span>
                {tab.storeName || tab.email || "Seller"}
                {isActive && <span style={{ fontSize: 9, opacity: 0.7 }}>▲</span>}
              </button>

              {/* Close button */}
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                style={{
                  background: "none",
                  border: "none",
                  color: isActive ? "#1e1b4b" : "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  padding: "0 8px 0 2px",
                  fontSize: 14,
                  lineHeight: 1,
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
                title="Schließen"
              >
                ×
              </button>
            </div>
          );
        })}

        {/* Info badge */}
        {isExpanded && activeTab && (
          <div
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "rgba(255,255,255,0.7)",
              fontStyle: "italic",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 200,
            }}
          >
            Angemeldet als: {activeTab.storeName || activeTab.email}
          </div>
        )}
      </div>

      {/* Bottom padding so content doesn't get hidden behind bar */}
      <style>{`
        .andertal-scroll-wrapper {
          padding-bottom: ${BAR_HEIGHT}px !important;
        }
      `}</style>
    </>
  );
}
