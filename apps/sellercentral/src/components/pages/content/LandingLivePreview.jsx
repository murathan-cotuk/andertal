"use client";

import { useEffect, useRef, useState } from "react";
import { Banner, Text } from "@shopify/polaris";

const MESSAGE_SOURCE = "andertal-cms-preview";

function shopOrigin() {
  const env = String(process.env.NEXT_PUBLIC_SHOP_URL || "").trim().replace(/\/$/, "");
  if (env) {
    try {
      return new URL(env).origin;
    } catch {
      return env;
    }
  }
  if (typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return "http://localhost:3000";
  }
  return "https://andertal.com";
}

export default function LandingLivePreview({ containers, settings, locale, copy }) {
  const origin = shopOrigin();
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const src = `${origin}/${loc}/cms-preview`;
  const iframeRef = useRef(null);
  const [ready, setReady] = useState(false);
  const revRef = useRef(0);

  useEffect(() => {
    const onMsg = (event) => {
      const msg = event.data;
      if (!msg || msg.source !== MESSAGE_SOURCE || msg.kind !== "ready") return;
      if (event.origin !== origin) return;
      setReady(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [origin]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!ready || !win) return;
    revRef.current += 1;
    const t = window.setTimeout(() => {
      win.postMessage(
        {
          source: MESSAGE_SOURCE,
          kind: "state",
          containers: Array.isArray(containers) ? containers : [],
          settings: settings && typeof settings === "object" ? settings : {},
          rev: revRef.current,
        },
        origin,
      );
    }, 120);
    return () => window.clearTimeout(t);
  }, [containers, settings, ready, origin]);

  if (!origin) {
    return <Banner tone="warning">{copy.previewUnavailable}</Banner>;
  }

  return (
    <div style={{ border: "1px solid var(--p-color-border, #e1e3e5)", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--p-color-border, #e1e3e5)" }}>
        <Text as="h3" variant="headingSm">{copy.livePreviewTitle}</Text>
      </div>
      <iframe
        ref={iframeRef}
        title={copy.livePreviewTitle}
        src={src}
        onLoad={() => {
          iframeRef.current?.contentWindow?.postMessage({ source: MESSAGE_SOURCE, kind: "ping" }, origin);
        }}
        style={{ width: "100%", height: 520, border: 0, display: "block", background: "#fff" }}
      />
    </div>
  );
}
