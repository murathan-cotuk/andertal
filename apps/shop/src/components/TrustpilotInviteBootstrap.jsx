"use client";

import { useEffect } from "react";

const INVITE_SRC = "https://invitejs.trustpilot.com/tp.min.js";

/**
 * Trustpilot „JavaScript Integration“ / Invitation bootstrap (tp.register).
 * Set NEXT_PUBLIC_TRUSTPILOT_INVITE_REGISTER_KEY to the key from Trustpilot Business → Integrationen.
 */
export default function TrustpilotInviteBootstrap() {
  const registerKey = process.env.NEXT_PUBLIC_TRUSTPILOT_INVITE_REGISTER_KEY;

  useEffect(() => {
    if (!registerKey || typeof window === "undefined") return;
    if (window.__andertalTpInviteLoaded) return;
    window.__andertalTpInviteLoaded = true;

    const w = window;
    const d = document;
    const s = "script";
    const n = "tp";
    w.TrustpilotObject = n;
    w[n] =
      w[n] ||
      function tpQueue() {
        (w[n].q = w[n].q || []).push(arguments);
      };
    const a = d.createElement(s);
    a.async = 1;
    a.src = INVITE_SRC;
    a.type = "text/javascript";
    const f = d.getElementsByTagName(s)[0];
    f.parentNode.insertBefore(a, f);
    w[n]("register", registerKey);
  }, [registerKey]);

  return null;
}
