"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Small (i) info icon — hover/focus shows a tooltip that lingers ~3s after the
 * pointer leaves before fading, instead of vanishing instantly.
 */
export default function InfoIconTooltip({ text }) {
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef(null);

  const show = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setVisible(true);
  };
  const scheduleHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVisible(false), 3000);
  };

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  if (!text) return null;

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <span
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        tabIndex={0}
        role="button"
        aria-label="Info"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1px solid #9ca3af",
          color: "#6b7280",
          fontSize: 10,
          fontWeight: 700,
          cursor: "help",
          flexShrink: 0,
        }}
      >
        i
      </span>
      <span
        style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: 0,
          background: "#111827",
          color: "#fff",
          fontSize: 12,
          lineHeight: 1.45,
          padding: "8px 10px",
          borderRadius: 6,
          whiteSpace: "normal",
          width: "max-content",
          maxWidth: 280,
          boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
          zIndex: 50,
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(4px)",
          pointerEvents: "none",
          transition: "opacity 0.25s ease, transform 0.25s ease",
        }}
      >
        {text}
      </span>
    </span>
  );
}
