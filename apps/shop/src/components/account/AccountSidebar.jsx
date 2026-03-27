"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useCustomerAuth as useAuth } from "@belucha/lib";
import { restPathFromPathname } from "@/lib/shop-market";

const ORANGE = "#ff971c";
const DARK = "#1A1A1A";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";

const NAV = [
  { label: "Übersicht", icon: "👤", href: "/account" },
  { label: "Meine Bestellungen", icon: "📦", href: "/orders" },
  { label: "Merkzettel", icon: "♥", href: "/merkzettel" },
  { label: "Adressen", icon: "📍", href: "/addresses" },
  { label: "Bewertungen", icon: "💬", href: "/reviews" },
  { label: "Bonuspunkte", icon: "⭐", href: "/bonus" },
];

function normalizePath(pathname) {
  if (!pathname) return "/";
  const rest = restPathFromPathname(pathname);
  return rest === "" ? "/" : rest.startsWith("/") ? rest : `/${rest}`;
}

export default function AccountSidebar({ onLogout }) {
  const pathname = usePathname() || "/";
  const appPath = normalizePath(pathname);
  const { user } = useAuth();

  return (
    <nav style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, overflow: "hidden" }}>
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
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 18px",
              fontSize: 14,
              fontWeight: 500,
              color: active ? ORANGE : DARK,
              background: active ? "#fff7ed" : "transparent",
              borderLeft: active ? `3px solid ${ORANGE}` : "3px solid transparent",
              textDecoration: "none",
              borderBottom: `1px solid ${BORDER}`,
              transition: "all 0.1s",
            }}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => {
          document.cookie = "belucha_cauth=; path=/; max-age=0; SameSite=Lax";
          onLogout?.();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          fontSize: 14,
          fontWeight: 500,
          color: "#ef4444",
          background: "transparent",
          border: "none",
          borderLeft: "3px solid transparent",
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 16 }}>🚪</span>
        Abmelden
      </button>
    </nav>
  );
}
