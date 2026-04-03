"use client";

import { useEffect, useState, useRef } from "react";

const BOOTSTRAP_SRC = "https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";

function loadTrustpilotBootstrap() {
  if (typeof window === "undefined") return;
  if (window.__beluchaTrustpilotScript) return;
  window.__beluchaTrustpilotScript = true;
  const s = document.createElement("script");
  s.src = BOOTSTRAP_SRC;
  s.async = true;
  document.body.appendChild(s);
}

/**
 * Renders a Trustpilot TrustBox when Business Unit ID is configured (Integrations → Trustpilot).
 * Optional template_id via integration config JSON: { "template_id": "..." }
 */
export default function TrustpilotTrustBox({
  locale = "de-DE",
  styleHeight = "140px",
  className,
  style,
}) {
  const [cfg, setCfg] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";
    fetch(`${base.replace(/\/$/, "")}/store/trustpilot-config`)
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => setCfg({ enabled: false }));
  }, []);

  useEffect(() => {
    if (!cfg?.enabled || !cfg.businessUnitId) return;
    loadTrustpilotBootstrap();
  }, [cfg]);

  if (!cfg?.enabled || !cfg.businessUnitId) return null;

  return (
    <div className={className} ref={wrapRef} style={style}>
      <div
        className="trustpilot-widget"
        data-locale={locale}
        data-template-id={cfg.templateId}
        data-businessunit-id={cfg.businessUnitId}
        data-style-height={styleHeight}
        data-style-width="100%"
        data-theme="light"
        style={{ minHeight: styleHeight }}
      >
        <a href="https://www.trustpilot.com" target="_blank" rel="noopener noreferrer">
          Trustpilot
        </a>
      </div>
    </div>
  );
}

/** Small Trustpilot-style label (green star + wordmark text). */
export function TrustpilotWordmark({ style }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        fontWeight: 700,
        color: "#191919",
        letterSpacing: "-0.02em",
        ...style,
      }}
    >
      <span style={{ color: "#00B67A", fontSize: 16, lineHeight: 1 }} aria-hidden>★</span>
      Trustpilot
    </span>
  );
}
