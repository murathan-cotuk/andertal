"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { tokens } from "@/design-system/tokens";

const BACKEND_URL = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

function UnsubscribeInner() {
  const t = useTranslations("newsletter");
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || "";

  const [status, setStatus] = useState("loading"); // "loading" | "success" | "already" | "error"

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    fetch(`${BACKEND_URL}/store/newsletter-unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.ok && data?.already) setStatus("already");
        else if (data?.ok) setStatus("success");
        else setStatus("error");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const icon = {
    loading: (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ animation: "spin 1s linear infinite" }}>
        <circle cx="28" cy="28" r="24" stroke="#D5D9D9" strokeWidth="4" />
        <path d="M28 4a24 24 0 0 1 24 24" stroke="#1196AB" strokeWidth="4" strokeLinecap="round" />
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </svg>
    ),
    success: (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="28" fill="#E6F9F1" />
        <path d="M16 28l9 9 15-15" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    already: (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="28" fill="#FFF8E1" />
        <path d="M28 18v12" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
        <circle cx="28" cy="36" r="2" fill="#F59E0B" />
      </svg>
    ),
    error: (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="28" fill="#FEF2F2" />
        <path d="M20 20l16 16M36 20L20 36" stroke="#DC2626" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  };

  const message = {
    loading: t("unsubscribeLoading"),
    success: t("unsubscribeSuccess"),
    already: t("unsubscribeAlready"),
    error: t("unsubscribeError"),
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#EAEDED",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 8,
          border: "1px solid #E3E6E6",
          padding: "40px 32px",
          maxWidth: 440,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "center" }}>{icon[status]}</div>

        <h1
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color: "#0F1111",
            margin: "0 0 12px 0",
            lineHeight: 1.3,
          }}
        >
          {t("unsubscribeTitle")}
        </h1>

        <p
          style={{
            fontSize: 15,
            color: "#565959",
            lineHeight: 1.6,
            margin: "0 0 28px 0",
          }}
        >
          {message[status]}
        </p>

        {status !== "loading" && (
          <Link
            href="/"
            style={{
              display: "inline-block",
              background: tokens?.colors?.primary?.DEFAULT || "#FFD814",
              border: "1px solid #FCD200",
              borderRadius: 20,
              padding: "10px 24px",
              fontSize: 15,
              fontWeight: "bold",
              color: "#0F1111",
              textDecoration: "none",
            }}
          >
            {t("backToShop")}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function NewsletterUnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "#EAEDED",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Arial, Helvetica, sans-serif",
            color: "#565959",
          }}
        >
          …
        </div>
      }
    >
      <UnsubscribeInner />
    </Suspense>
  );
}
