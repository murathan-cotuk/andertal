"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "andertal_presence_sid";
const INTERVAL_MS = 25_000;

function getOrCreateSessionId() {
  if (typeof window === "undefined") return null;
  try {
    let sid = localStorage.getItem(STORAGE_KEY);
    if (!sid || sid.length < 8) {
      sid = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `s${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(STORAGE_KEY, sid);
    }
    return sid;
  } catch {
    return null;
  }
}

function backendBase() {
  return (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
}

export default function ShopPresenceHeartbeat() {
  const pathname = usePathname() || "/";
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    const sid = getOrCreateSessionId();
    if (!sid) return undefined;

    let cancelled = false;

    const ping = () => {
      if (cancelled || typeof document === "undefined" || document.visibilityState === "hidden") return;
      const base = backendBase();
      fetch(`${base}/store/presence/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          path: pathnameRef.current,
          title: document.title || "",
          referrer: typeof document !== "undefined" ? document.referrer || "" : "",
        }),
        keepalive: true,
      }).catch(() => {});
    };

    ping();
    const id = window.setInterval(ping, INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    const sid = getOrCreateSessionId();
    if (!sid) return;
    const base = backendBase();
    fetch(`${base}/store/presence/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sid,
        path: pathname,
        title: typeof document !== "undefined" ? document.title || "" : "",
        referrer: typeof document !== "undefined" ? document.referrer || "" : "",
      }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
