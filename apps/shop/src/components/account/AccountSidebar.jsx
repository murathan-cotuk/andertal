"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useCustomerAuth as useAuth } from "@andertal/lib";
import { restPathFromPathname } from "@/lib/shop-market";
import { useState, useEffect } from "react";

const ORANGE = "#ff971c";
const DARK = "#1A1A1A";
const BORDER = "#e5e7eb";

const NAV = [
  { label: "Übersicht", href: "/account" },
  { label: "Meine Bestellungen", href: "/orders" },
  { label: "Merkzettel", href: "/merkzettel" },
  { label: "Adressen", href: "/addresses" },
  { label: "Zahlungsmethoden", href: "/payment-methods" },
  { label: "Nachrichten", href: "/nachrichten", badge: true },
  { label: "Bewertungen", href: "/reviews" },
  { label: "Bonuspunkte", href: "/bonus" },
];

function normalizePath(pathname) {
  if (!pathname) return "/";
  const rest = restPathFromPathname(pathname);
  return rest === "" ? "/" : rest.startsWith("/") ? rest : `/${rest}`;
}

export default function AccountSidebar({ onLogout, onNavigate }) {
  const pathname = usePathname() || "/";
  const appPath = normalizePath(pathname);
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.email) return;
    const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";
    fetch(`${backendUrl}/store/messages/unread-count?email=${encodeURIComponent(user.email)}`)
      .then((r) => r.json())
      .then((d) => setUnreadCount(d?.count || 0))
      .catch(() => {});
  }, [user?.email, appPath]);

  return (
    <nav style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, overflow: "hidden", minWidth: 200 }}>
      {user && (
        <div style={{ padding: "14px 18px", fontSize: 13, fontWeight: 600, color: DARK, borderBottom: `1px solid ${BORDER}` }}>
          {user.firstName} {user.lastName}
        </div>
      )}
      {NAV.map((item) => {
        const active =
          item.href === "/account"
            ? appPath === "/account"
            : item.href === "/merkzettel"
              ? appPath === "/merkzettel" || appPath === "/favorites" || appPath === "/wishlist"
              : appPath === item.href || appPath.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => onNavigate?.()}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "14px 18px", fontSize: 14, fontWeight: 500,
              color: active ? ORANGE : DARK,
              background: active ? "#fff7ed" : "transparent",
              borderLeft: active ? `3px solid ${ORANGE}` : "3px solid transparent",
              textDecoration: "none", borderBottom: `1px solid ${BORDER}`,
              transition: "all 0.1s",
            }}
          >
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.badge && unreadCount > 0 && (
              <span style={{
                background: "#ef4444", color: "#fff", borderRadius: "50%",
                fontSize: 10, fontWeight: 800, width: 18, height: 18,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => {
          document.cookie = "andertal_cauth=; path=/; max-age=0; SameSite=Lax";
          onNavigate?.();
          onLogout?.();
        }}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px", fontSize: 14, fontWeight: 500,
          color: "#ef4444", background: "transparent",
          border: "none", borderLeft: "3px solid transparent",
          width: "100%", textAlign: "left", cursor: "pointer",
        }}
      >
        Abmelden
      </button>
    </nav>
  );
}
