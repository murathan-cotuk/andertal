"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCustomerAuth as useAuth } from "@andertal/lib";
import { LogoutButton } from "@andertal/ui";
import { restPathFromPathname } from "@/lib/shop-market";
import { useState, useEffect } from "react";

const ORANGE = "#ff971c";
const DARK = "#1A1A1A";
const BORDER = "#e5e7eb";

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
    <nav style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, overflow: "hidden", minWidth: 200 }}>
      {user && (
        <div style={{ padding: "14px 18px", fontSize: 13, fontWeight: 600, color: DARK, borderBottom: `1px solid ${BORDER}` }}>
          {user.firstName} {user.lastName}
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
              padding: "14px 18px", fontSize: 14, fontWeight: 500,
              color: active ? ORANGE : DARK,
              background: active ? "#fff7ed" : "transparent",
              borderLeft: active ? `3px solid ${ORANGE}` : "3px solid transparent",
              textDecoration: "none", borderBottom: `1px solid ${BORDER}`,
              transition: "all 0.1s",
            }}
          >
            <span style={{ flex: 1 }}>{tNav(item.key)}</span>
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
      <div style={{ padding: "14px 18px", borderTop: `1px solid ${BORDER}` }}>
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
