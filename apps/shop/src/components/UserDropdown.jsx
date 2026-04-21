"use client";

import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/* ─── Trigger icon — same as original ShopHeader person icon ─── */
function PersonIcon({ isAuthenticated }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

const ICONS = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6m-6 4h4"/>
    </svg>
  ),
  wishlist: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  addresses: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  reviews: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  bonus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
};

/* ─── Helper ─────────────────────────────────────────────────── */
function getInitials(user) {
  if (!user) return "?";
  const first = user.firstName || user.first_name || "";
  const last  = user.lastName  || user.last_name  || "";
  if (first && last) return (first[0] + last[0]).toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  if (user.email) return user.email[0].toUpperCase();
  return "?";
}

/* ─── Reusable menu item (link) ──────────────────────────────── */
function NavItem({ href, icon, children, onClick }) {
  return (
    <DropdownMenu.Item asChild>
      <Link
        href={href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg",
          "text-[13.5px] font-medium text-gray-600 no-underline",
          "outline-none cursor-pointer select-none",
          "transition-colors duration-100",
          "hover:bg-gray-100 hover:text-gray-900",
          "focus:bg-gray-100 focus:text-gray-900",
          "[&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-gray-400 [&>svg]:shrink-0",
          "hover:[&>svg]:text-gray-600"
        )}
      >
        {icon}
        {children}
      </Link>
    </DropdownMenu.Item>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function UserDropdown({ isAuthenticated, user, onLogout, onOpen }) {
  const initials    = getInitials(user);
  const displayName = user
    ? [user.firstName || user.first_name, user.lastName || user.last_name]
        .filter(Boolean).join(" ") || user.email || "My account"
    : "";

  return (
    <DropdownMenu.Root onOpenChange={(open) => { if (open && onOpen) onOpen(); }}>
      {/* ── Trigger: original ShopHeader person icon style ─────── */}
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={isAuthenticated ? "Mein Konto, angemeldet" : "Mein Konto"}
          title={isAuthenticated ? "Mein Konto — angemeldet" : "Mein Konto"}
          style={{
            position: "relative",
            width: 46, height: 46,
            border: "none", background: "transparent",
            color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 8,
            transition: "background 0.2s ease",
            outline: "none",
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          <PersonIcon />
          {isAuthenticated && (
            <span aria-hidden="true" style={{
              position: "absolute", top: 5, right: 5,
              width: 15, height: 15, borderRadius: "50%",
              background: "linear-gradient(160deg,#4ade80 0%,#22c55e 100%)",
              border: "2px solid #1b7a72",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", pointerEvents: "none",
            }}>
              <svg viewBox="0 0 12 12" fill="none" width="9" height="9">
                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      {/* ── Content: no Portal → positions directly below trigger ─ */}
      <DropdownMenu.Content
          align="end"
          sideOffset={8}
          style={{ zIndex: 2147483647 }}
          className={cn(
            "w-72 outline-none flex flex-col gap-1.5",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
            "data-[side=bottom]:slide-in-from-top-2",
          )}
        >
          {isAuthenticated ? (
            /* ── Single unified card ──────────────────────────── */
            <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_8px_24px_rgba(17,24,39,0.10),0_2px_8px_rgba(17,24,39,0.05)] p-1.5 overflow-hidden">
              {/* User header */}
              <div className="flex items-center gap-2.5 px-2.5 py-2.5">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-orange-500 text-white text-[13px] font-bold flex items-center justify-center shrink-0 border-2 border-white shadow-sm">
                  {initials}
                </div>
                {/* Info — show email only if displayName is NOT already the email */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-bold text-gray-900 truncate leading-tight">{displayName}</p>
                  {user?.email && displayName !== user.email && (
                    <p className="text-[11.5px] text-gray-400 truncate mt-0.5">{user.email}</p>
                  )}
                </div>
                {/* Badge */}
                <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  Online
                </span>
              </div>

              <div className="h-px bg-gray-100 my-1" />

              <NavItem href="/account" icon={ICONS.overview}>Overview</NavItem>
              <NavItem href="/orders"  icon={ICONS.orders}>My Orders</NavItem>
              <NavItem href="/merkzettel" icon={ICONS.wishlist}>Wishlist</NavItem>

              <div className="h-px bg-gray-100 my-1" />

              <NavItem href="/addresses" icon={ICONS.addresses}>Addresses</NavItem>
              <NavItem href="/reviews"   icon={ICONS.reviews}>Reviews</NavItem>
              <NavItem href="/bonus"     icon={ICONS.bonus}>Bonus Points</NavItem>

              {/* ── Logout — inside card, separated by border ─── */}
              <div className="h-px bg-gray-100 mt-1 mb-0" />
              <DropdownMenu.Item asChild>
                <button
                  type="button"
                  onClick={onLogout}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-2.5 py-2 mt-1 rounded-lg",
                    "text-[13.5px] font-medium text-red-500 text-left",
                    "outline-none cursor-pointer select-none",
                    "transition-colors duration-100",
                    "hover:bg-red-50 hover:text-red-600",
                    "focus:bg-red-50 focus:text-red-600",
                    "[&>svg]:w-4 [&>svg]:h-4 [&>svg]:shrink-0"
                  )}
                >
                  {ICONS.logout}
                  Abmelden
                </button>
              </DropdownMenu.Item>
            </div>
          ) : (
            /* ── Guest card ───────────────────────────────────── */
            <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_8px_24px_rgba(17,24,39,0.10),0_2px_8px_rgba(17,24,39,0.05)] overflow-hidden">
              <div className="px-4 pt-5 pb-3 text-center">
                <p className="text-[14px] font-bold text-gray-900">Welcome!</p>
                <p className="text-[12px] text-gray-400 mt-0.5">Sign in or create an account</p>
              </div>

              <div className="h-px bg-gray-100" />

              <div className="p-2 flex flex-col gap-1.5">
                <DropdownMenu.Item asChild>
                  <Link
                    href="/login"
                    className="block w-full py-2.5 px-4 text-center text-[13.5px] font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl no-underline transition-colors duration-150 outline-none"
                  >
                    Sign in
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                  <Link
                    href="/register"
                    className="block w-full py-2.5 px-4 text-center text-[13.5px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl no-underline transition-colors duration-150 outline-none"
                  >
                    Create account
                  </Link>
                </DropdownMenu.Item>
              </div>
            </div>
          )}
        </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
