"use client";

/**
 * Live "vitrin" preview for the Sellercentral landing-page editor (docs/TASKS.md §4.1).
 *
 * This route renders NOTHING on its own — it only shows whatever draft `{ containers, settings }`
 * JSON the parent window posts to it via postMessage, using the real LandingContainers renderer so
 * the preview is pixel-identical to the live shop, not a mock. It carries no real customer/session
 * data of its own (no fetch here beyond what LandingContainers' children already call against the
 * same public storefront APIs any shop visitor could reach), so embedding arbitrary attacker-
 * supplied JSON in it has no data-exfiltration value — the only thing worth protecting is that
 * OTHER sites can't iframe it for clickjacking, which next.config.js's per-route frame-ancestors
 * override already restricts to the Sellercentral origin (+ localhost in dev).
 */

import { useEffect, useRef, useState } from "react";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import LandingContainers from "@/components/landing/LandingContainers";
import { SectionErrorBoundary } from "@/components/ErrorBoundary";

// Shared with apps/sellercentral/.../LandingPageEditor.jsx — keep both sides of this literal in
// sync if it ever changes.
const MESSAGE_SOURCE = "andertal-cms-preview";

export default function CmsPreviewPage() {
  const [state, setState] = useState(null); // { containers, settings, rev }
  const originRef = useRef(null);

  useEffect(() => {
    function onMessage(event) {
      const msg = event.data;
      if (!msg || msg.source !== MESSAGE_SOURCE || msg.kind !== "state") return;
      // Pin to whichever origin first successfully posts a state message. A preview tab only ever
      // has one legitimate parent, and next.config.js's frame-ancestors already restricts who can
      // frame this route at all — this is just belt-and-suspenders against a stray postMessage
      // from an unrelated same-tab script.
      if (!originRef.current) originRef.current = event.origin;
      if (event.origin !== originRef.current) return;
      setState({
        containers: Array.isArray(msg.containers) ? msg.containers : [],
        settings: msg.settings && typeof msg.settings === "object" ? msg.settings : {},
        rev: msg.rev,
      });
    }
    window.addEventListener("message", onMessage);
    // Tell the parent we're mounted and ready to receive state — the iframe's onLoad can fire
    // slightly before this listener attaches, so the editor should retry/resend on "ready" too.
    window.parent?.postMessage({ source: MESSAGE_SOURCE, kind: "ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!state) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14 }}>
        Preview…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />
      <main className="flex-grow bg-white">
        <SectionErrorBoundary>
          {/* Remount on every revision — LandingContainers only ever reads initialContainers/
              initialSettings once (into useState), so a fresh key is what makes new draft data
              actually re-render instead of being silently ignored after the first paint. */}
          <LandingContainers key={state.rev} initialContainers={state.containers} initialSettings={state.settings} />
        </SectionErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
