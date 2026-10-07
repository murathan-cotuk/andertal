"use client";

/**
 * Mobile bottom tab bar (Konsept s36): Start · Bestellungen · Produkte · Analysen · Nachrichten.
 * Shown only below 48em via CSS (.sc-mobile-tabbar in globals.css); the sidebar drawer stays
 * available through the top bar menu for everything else.
 */

import React from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { lt } from "@/lib/locale-text";

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  orders: "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20.5h.01M17 20.5h.01",
  products: "M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10",
  analytics: "M5 20V11M12 20V5M19 20v-7",
  messages: "M4 5h16v11H8l-4 4z",
}

export default function MobileTabBar() {
  const locale = useLocale()
  const pathname = usePathname() || ""
  const path = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/"
  const items = [
    { href: "/dashboard", icon: "home", label: lt(locale, "Home", "Ana sayfa", "Accueil", "Inicio", "Home", "Start"), match: (p) => p === "/" || p.startsWith("/dashboard") },
    { href: "/orders", icon: "orders", label: lt(locale, "Orders", "Siparişler", "Commandes", "Pedidos", "Ordini", "Bestellungen"), match: (p) => p.startsWith("/orders") },
    { href: "/products/inventory", icon: "products", label: lt(locale, "Products", "Ürünler", "Produits", "Productos", "Prodotti", "Produkte"), match: (p) => p.startsWith("/products") },
    { href: "/analytics", icon: "analytics", label: lt(locale, "Analytics", "Analiz", "Analyses", "Análisis", "Analisi", "Analysen"), match: (p) => p.startsWith("/analytics") },
    { href: "/inbox", icon: "messages", label: lt(locale, "Messages", "Mesajlar", "Messages", "Mensajes", "Messaggi", "Nachrichten"), match: (p) => p.startsWith("/inbox") },
  ]
  return (
    <nav className="sc-mobile-tabbar" aria-label={lt(locale, "Main navigation", "Ana menü", "Navigation principale", "Navegación principal", "Navigazione principale", "Hauptnavigation")}>
      {items.map((it) => {
        const on = it.match(path)
        return (
          <Link key={it.href} href={it.href} className={on ? "is-active" : undefined} aria-current={on ? "page" : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={ICONS[it.icon]} />
            </svg>
            <span>{it.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
