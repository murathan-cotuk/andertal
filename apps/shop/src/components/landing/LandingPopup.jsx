"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { getMedusaClient, resolveMedusaBaseUrl } from "@/lib/medusa-client";

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
  return `${BACKEND_URL}/uploads/${url}`;
}

// ── Device detection ──────────────────────────────────────────────────────────
function getDeviceKey() {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w <= 599) return "mobile";
  if (w <= 1023) return "tablet";
  return "desktop";
}

// ── Frequency / dismiss storage ───────────────────────────────────────────────
function getDismissKey(pageId) {
  return `lp_popup_dismissed_${pageId || "home"}`;
}

function shouldShow(frequency, pageId) {
  if (typeof window === "undefined") return false;
  if (frequency === "always") return true;
  const key = getDismissKey(pageId);
  const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
  if (!raw) return true;
  try {
    const { ts, freq } = JSON.parse(raw);
    if (freq === "once") return false;
    if (freq === "session") return false; // sessionStorage handles this
    const now = Date.now();
    if (freq === "day") return now - ts > 86400000;
    if (freq === "week") return now - ts > 604800000;
  } catch (_) {}
  return true;
}

function markDismissed(frequency, pageId) {
  if (typeof window === "undefined") return;
  const key = getDismissKey(pageId);
  const val = JSON.stringify({ ts: Date.now(), freq: frequency });
  if (frequency === "session") {
    sessionStorage.setItem(key, val);
  } else {
    localStorage.setItem(key, val);
  }
}

// ── CSS animations ────────────────────────────────────────────────────────────
const ANIMATIONS = {
  fade: {
    enter: { opacity: 0 },
    active: { opacity: 1, transition: "opacity 0.35s ease" },
  },
  "slide-up": {
    enter: { opacity: 0, transform: "translateY(40px)" },
    active: { opacity: 1, transform: "translateY(0)", transition: "opacity 0.35s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1)" },
  },
  "slide-down": {
    enter: { opacity: 0, transform: "translateY(-40px)" },
    active: { opacity: 1, transform: "translateY(0)", transition: "opacity 0.35s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1)" },
  },
  zoom: {
    enter: { opacity: 0, transform: "scale(0.88)" },
    active: { opacity: 1, transform: "scale(1)", transition: "opacity 0.3s ease, transform 0.3s cubic-bezier(0.22,1,0.36,1)" },
  },
};

// ── Position → overlay alignment ─────────────────────────────────────────────
function positionToFlex(position) {
  switch (position) {
    case "bottom-center": return { alignItems: "flex-end", justifyContent: "center" };
    case "bottom-left":   return { alignItems: "flex-end", justifyContent: "flex-start" };
    case "bottom-right":  return { alignItems: "flex-end", justifyContent: "flex-end" };
    case "top-center":    return { alignItems: "flex-start", justifyContent: "center" };
    case "top-left":      return { alignItems: "flex-start", justifyContent: "flex-start" };
    case "top-right":     return { alignItems: "flex-start", justifyContent: "flex-end" };
    default:              return { alignItems: "center", justifyContent: "center" };
  }
}

function popupMargin(position) {
  if (position === "center" || !position) return undefined;
  const [vert, horiz] = position.split("-");
  return {
    ...(vert === "bottom" ? { marginBottom: 24 } : vert === "top" ? { marginTop: 24 } : {}),
    ...(horiz === "left" ? { marginLeft: 24 } : horiz === "right" ? { marginRight: 24 } : {}),
  };
}

// ── Popup Modal ───────────────────────────────────────────────────────────────
function PopupModal({ config, onClose }) {
  const tc = useTranslations("common");
  const [visible, setVisible] = useState(false);
  const anim = ANIMATIONS[config.animation] || ANIMATIONS.fade;
  const flex = positionToFlex(config.position);
  const margin = popupMargin(config.position);
  const isBottomBar = config.position === "bottom-center";

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const modalStyle = {
    ...(visible ? anim.active : anim.enter),
    position: "relative",
    background: config.bg_color || "#fff",
    color: config.text_color || "#111827",
    borderRadius: isBottomBar ? 0 : (config.border_radius ?? 16),
    width: config.width || "600px",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: config.max_height || "80vh",
    overflowY: "auto",
    boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
    ...margin,
    ...(isBottomBar ? { width: "100%", maxWidth: "100%", marginBottom: 0 } : {}),
  };

  const imageUrl = resolveUrl(config.image || "");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: `rgba(0,0,0,${config.overlay ?? 0.5})`,
        zIndex: 2147483645,
        display: "flex",
        ...flex,
        padding: isBottomBar ? 0 : 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={modalStyle} role="dialog" aria-modal="true">
        {config.show_close !== false && (
          <button
            onClick={onClose}
            aria-label={tc("close")}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "rgba(0,0,0,0.08)",
              border: "none",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              color: config.text_color || "#111827",
              zIndex: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        )}

        {imageUrl && (
          <div style={{ width: "100%", lineHeight: 0 }}>
            <img
              src={imageUrl}
              alt=""
              style={{
                width: "100%",
                maxHeight: 320,
                objectFit: "cover",
                borderRadius: isBottomBar ? 0 : `${config.border_radius ?? 16}px ${config.border_radius ?? 16}px 0 0`,
                display: "block",
              }}
            />
          </div>
        )}

        <div style={{ padding: isBottomBar ? "20px 24px" : 32 }}>
          {config.title && (
            <div
              style={{
                fontSize: isBottomBar ? 16 : 22,
                fontWeight: 700,
                marginBottom: 10,
                lineHeight: 1.3,
                paddingRight: config.show_close !== false ? 36 : 0,
              }}
            >
              {config.title}
            </div>
          )}

          {config.body && (
            <div
              style={{ fontSize: 14, lineHeight: 1.65, marginBottom: config.btn_text ? 20 : 0 }}
              dangerouslySetInnerHTML={{ __html: config.body }}
            />
          )}

          {config.btn_text && (
            <a
              href={config.btn_url || "#"}
              style={{
                display: "inline-block",
                padding: "10px 24px",
                background: config.btn_bg || "#111827",
                color: config.btn_color || "#ffffff",
                borderRadius: config.btn_radius ?? 8,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 14,
                marginTop: 4,
              }}
              onClick={onClose}
            >
              {config.btn_text}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LandingPopup({ pageId }) {
  const [config, setConfig] = useState(null);
  const [open, setOpen] = useState(false);
  const triggeredRef = useRef(false);
  const frequencyRef = useRef("session");

  useEffect(() => {
    fetch("/api/store-landing-page")
      .then((r) => r.json())
      .then((data) => {
        const popup = data?.settings?.popup;
        if (!popup) return;
        const key = getDeviceKey();
        const cfg = popup[key];
        if (!cfg?.enabled) return;
        frequencyRef.current = cfg.frequency || "session";
        if (!shouldShow(cfg.frequency, pageId)) return;
        setConfig(cfg);
      })
      .catch(() => {});
  }, [pageId]);

  const trigger = useCallback(() => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!config) return;
    const type = config.trigger || "delay";

    if (type === "delay") {
      const ms = (config.delay ?? 3) * 1000;
      const id = setTimeout(trigger, ms);
      return () => clearTimeout(id);
    }

    if (type === "scroll") {
      const pct = config.scroll_pct ?? 40;
      const onScroll = () => {
        const scrolled = window.scrollY + window.innerHeight;
        const total = document.documentElement.scrollHeight;
        if (total > 0 && (scrolled / total) * 100 >= pct) {
          trigger();
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }

    if (type === "exit_intent") {
      const onMouseLeave = (e) => {
        if (e.clientY <= 0) trigger();
      };
      document.addEventListener("mouseleave", onMouseLeave);
      return () => document.removeEventListener("mouseleave", onMouseLeave);
    }
  }, [config, trigger]);

  const handleClose = useCallback(() => {
    setOpen(false);
    markDismissed(frequencyRef.current, pageId);
  }, [pageId]);

  if (!open || !config) return null;
  return <PopupModal config={config} onClose={handleClose} />;
}
