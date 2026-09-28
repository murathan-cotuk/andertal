"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCustomerAuth as useAuth } from "@andertal/lib";
import { LogoutButton } from "@andertal/ui";
import { restPathFromPathname } from "@/lib/shop-market";
import { useState, useEffect } from "react";

const DARK = "var(--body-color, #1d1b18)";
const BORDER = "#efe8dd";

const NAV_KEYS = [
  { key: "overview", href: "/account" },
  { key: "orders", href: "/orders" },
  { key: "wishlist", href: "/merkzettel" },
  { key: "addresses", href: "/addresses" },
  { key: "paymentMethods", href: "/payment-methods" },
  { key: "messages", href: "/nachrichten", badge: true },
  { key: "reviews", href: "/reviews" },
  { key: "bonus", href: "/bonus" },
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
  const t = useTranslations("common");
  const tNav = useTranslations("accountNav");
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
    <nav style={{ background: "#fff", borderRadius: 20, boxShadow: "0 0 0 1px rgba(29,27,24,0.06)", overflow: "hidden", minWidth: 200, padding: 10, display: "flex", flexDirection: "column", gap: 2 }}>
      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 8px 14px", marginBottom: 6, borderBottom: `1px solid ${BORDER}` }}>
          <span aria-hidden style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--shop-primary, #ee8a12)", color: "#1d1b18", fontWeight: 800, fontSize: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {String(user.firstName || user.email || "?").trim().charAt(0).toUpperCase()}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: DARK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.firstName} {user.lastName}
          </span>
        </div>
      )}
      {NAV_KEYS.map((item) => {
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
              minHeight: 44, padding: "0 14px", fontSize: 15,
              fontWeight: active ? 700 : 500,
              color: active ? "#fff" : DARK,
              background: active ? "var(--body-color, #1d1b18)" : "transparent",
              borderRadius: 12,
              textDecoration: "none",
              transition: "background 0.1s, color 0.1s",
            }}
          >
            <span style={{ flex: 1 }}>{tNav(item.key)}</span>
            {item.badge && unreadCount > 0 && (
              <span style={{
                background: "var(--shop-primary, #ee8a12)", color: "#1d1b18", borderRadius: "50%",
                fontSize: 10, fontWeight: 800, width: 18, height: 18,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
      <div style={{ padding: "12px 8px 6px", marginTop: 6, borderTop: `1px solid ${BORDER}` }}>
        <LogoutButton
          label={t("logout")}
          onClick={() => {
            document.cookie = "andertal_cauth=; path=/; max-age=0; SameSite=Lax";
            onNavigate?.();
            onLogout?.();
          }}
        />
      </div>
    </nav>
  );
}
