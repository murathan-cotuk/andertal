"use client";

import React, { useState, useEffect, useCallback, useRef, forwardRef } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  AppProvider,
  Frame,
  Navigation,
  TopBar,
  Button,
  Modal,
  Text,
  Popover,
  ActionList,
  UnstyledLink,
  Icon,
} from "@shopify/polaris";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import {
  HomeIcon,
  ProductIcon,
  OrderIcon,
  ProfileIcon,
  ChartVerticalIcon,
  MegaphoneIcon,
  DiscountIcon,
  SettingsIcon,
  ListBulletedIcon,
  ImportIcon,
  StoreIcon,
  EditIcon,
} from "@shopify/polaris-icons";
import dynamic from "next/dynamic";
import en from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { fieldNameDisplayLabel } from "@/lib/product-change-request-format";

const discardBtnStyles = `
  .belucha-discard-topbar-btn,
  .belucha-discard-topbar-btn *,
  .belucha-discard-topbar-btn span { color: #ffffff !important; }
`;

/** Polaris Frame logo img: never pass empty/invalid src (React 19 + browser warning). */
function normalizeSellerCentralLogoUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (low === "null" || low === "undefined" || low === "about:blank") return null;
  if (s === "/") return null;
  if (/^https?:\/\//i.test(s) || s.startsWith("data:image/")) return s;
  if (/^\/\/[^/]/i.test(s)) return s;
  if (s.startsWith("/") && s.length > 1) return s;
  return null;
}

const GroupedDropdownSearch = dynamic(
  () => import("./GroupedDropdownSearch").then((m) => m.default),
  { ssr: false, loading: () => <div style={{ width: "100%", maxWidth: 400, height: 36 }} /> }
);

const SUPERUSER_ACCENT_COLOR = "#812727";

const styleSuperuserOnlyNavItems = (items, isSuperuser) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const subNavigationItems = Array.isArray(item.subNavigationItems)
      ? item.subNavigationItems.map((sub) => {
          const isSuperOnlySub = !!sub.superuserOnly;
          return {
            ...sub,
            label: isSuperuser && isSuperOnlySub
              ? <span style={{ color: SUPERUSER_ACCENT_COLOR, fontWeight: 700 }}>{sub.label}</span>
              : sub.label,
          };
        })
      : item.subNavigationItems;
    const isSuperOnlyItem = !!item.superuserOnly;
    return {
      ...item,
      label: isSuperuser && isSuperOnlyItem
        ? <span style={{ color: SUPERUSER_ACCENT_COLOR, fontWeight: 700 }}>{item.label}</span>
        : item.label,
      subNavigationItems,
    };
  });
};

function getMenuItemsMain(t, isSuperuser = false) {
  const tx = (key, fallback) => {
    try {
      if (typeof t.has === "function" && !t.has(key)) return fallback;
      return t(key);
    } catch {
      return fallback;
    }
  };
  const items = [
    { url: "/dashboard", label: tx("home", "Home"), icon: HomeIcon },
    {
      url: "/orders",
      label: tx("orders", "Orders"),
      icon: OrderIcon,
      subNavigationItems: [
        { url: "/orders", label: tx("view", "View") },
        { url: "/orders/returns", label: tx("returns", "Returns") },
        {
          url: "/orders/abandoned-checkouts",
          label: tx("abandonedCheckouts", "Abandoned checkouts"),
          superuserOnly: true,
        },
      ],
    },
    {
      url: "/products",
      label: tx("products", "Products"),
      icon: ProductIcon,
      subNavigationItems: [
        { url: "/products/inventory", label: tx("inventory", "Inventory") },
        { url: "/products/collections", label: tx("collections", "Collections"), superuserOnly: true },
        { url: "/products/product-groups", label: "Produktgruppen" },
      ],
    },
    {
      url: "/customers-menu",
      label: tx("customers", "Customers"),
      icon: ProfileIcon,
      subNavigationItems: [
        { url: "/customers", label: tx("list", "List") },
        { url: "/customers/reviews", label: tx("reviews", "Reviews") },
      ],
    },
  ];

  if (isSuperuser) {
    items.push({
      url: "/sellers-menu",
      label: tx("sellers", "Sellers"),
      superuserOnly: true,
      icon: StoreIcon,
      subNavigationItems: [
        { url: "/sellers", label: tx("view", "View"), superuserOnly: true },
      ],
    });
  }

  items.push(
    {
      url: "/marketing",
      label: tx("marketing", "Marketing"),
      icon: MegaphoneIcon,
      subNavigationItems: [
        { url: "/marketing/campaigns", label: tx("campaigns", "Campaigns") },
        { url: "/marketing/attribution", label: tx("attribution", "Attribution") },
        { url: "/marketing/automations", label: tx("automations", "Automations") },
      ],
    },
    {
      url: "/discounts",
      label: tx("discounts", "Discounts"),
      icon: DiscountIcon,
      subNavigationItems: [
        { url: "/discounts/coupons", label: tx("coupons", "Coupons") },
        { url: "/discounts/campaigns", label: "Aktionen" },
      ],
    },
    {
      url: "/content",
      label: tx("content", "Content"),
      icon: ListBulletedIcon,
      subNavigationItems: [
        { url: "/content/media", label: tx("media", "Media") },
        { url: "/content/menus", label: tx("menus", "Menus"), superuserOnly: true },
        { url: "/content/categories", label: tx("categories", "Categories"), superuserOnly: true },
        { url: "/content/brands", label: tx("brands", "Brands") },
        { url: "/content/metaobjects", label: tx("metaobjects", "Metaobjects") },
        { url: "/content/landing-page", label: tx("landingPage", "Landing Page"), superuserOnly: true },
        { url: "/content/styles", label: tx("styles", "Styles"), superuserOnly: true },
        { url: "/content/pages", label: tx("pages", "Pages"), superuserOnly: true },
        { url: "/content/blog-posts", label: tx("blogPosts", "Blog Posts"), superuserOnly: true },
      ],
    },
    {
      url: "/analytics",
      label: tx("analytics", "Analytics"),
      icon: ChartVerticalIcon,
      subNavigationItems: [
        { url: "/analytics/reports", label: tx("reports", "Reports") },
        { url: "/analytics/transactions", label: "Transactions" },
        { url: "/analytics/live-view", label: tx("liveView", "Live View"), superuserOnly: true },
        { url: "/analytics/ranking", label: tx("reports", "Reports") },
      ],
    },
    { url: "/import-export", label: tx("importExport", "Import/Export"), icon: ImportIcon },
  );
  return items;
}

function getMenuItemsSettings(t, isSuperuser = false) {
  return [{
    url: "/settings",
    label: t("settings"),
    icon: SettingsIcon,
  }];
}

// Parent nav URLs that should expand/collapse sub-menus on click (no page navigation)
const PARENT_NAV_URLS = new Set([
  "/products", "/marketing", "/content", "/analytics", "/customers-menu", "/sellers-menu", "/discounts",
]);
const NAV_VIRTUAL_URL_FALLBACK = {
  "/customers-menu": "/customers",
  "/sellers-menu": "/sellers",
};

const isModifiedOrNewTabClick = (e) => {
  if (!e) return false;
  return (
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey ||
    e.button === 1
  );
};

const NextLink = forwardRef(function NextLink({ url, children, external, onClick, ...rest }, ref) {
  const href = NAV_VIRTUAL_URL_FALLBACK[url] || (url || "");
  const handleClick = (e) => {
    // Keep browser-native new-tab behavior (Ctrl/Cmd click, middle click, etc.)
    if (isModifiedOrNewTabClick(e)) {
      onClick?.(e);
      return;
    }
    if (PARENT_NAV_URLS.has(url || "") && typeof onClick === "function") {
      e.preventDefault();
    }
    onClick?.(e);
  };
  return (
    <Link href={href} ref={ref} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
});

const UnsavedAwareLink = forwardRef(function UnsavedAwareLink({ url, children, external, onClick, ...rest }, ref) {
  const ctx = useUnsavedChanges();
  const href = NAV_VIRTUAL_URL_FALLBACK[url] || (url || "#");
  const handleClick = (e) => {
    // Do not block browser-native new-tab actions.
    if (isModifiedOrNewTabClick(e)) {
      onClick?.(e);
      return;
    }
    if (PARENT_NAV_URLS.has(url || "") && typeof onClick === "function") {
      e.preventDefault();
      onClick?.(e);
      return;
    }
    if (ctx?.isDirty && (url || "").trim() && !(url || "").startsWith("#")) {
      e.preventDefault();
      ctx.startNavigate(url || "/");
      return;
    }
    onClick?.(e);
  };
  return (
    <Link ref={ref} href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
});

const LOCALES = [
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
  { code: "tr", label: "TR" },
  { code: "fr", label: "FR" },
  { code: "it", label: "IT" },
  { code: "es", label: "ES" },
];

export default function PolarisLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const tRaw = useTranslations("nav");
  const t = useCallback((key) => {
    try {
      return tRaw(key);
    } catch {
      return String(key);
    }
  }, [tRaw]);
  t.has = (key) => {
    try {
      return typeof tRaw.has === "function" ? tRaw.has(key) : true;
    } catch {
      return false;
    }
  };
  const locale = useLocale();
  const unsaved = useUnsavedChanges();
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(
    typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true"
  );
  const [userPermissions, setUserPermissions] = useState(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("sellerPermissions") || "null"); } catch { return null; }
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifData, setNotifData] = useState(null);
  const [msgUnread, setMsgUnread] = useState(0);
  const notifRef = useRef(null);
  // Track which parent nav item has its sub-menu expanded
  const [expandedLabel, setExpandedLabel] = useState(null);
  const [storeName, setStoreName] = useState(
    typeof window !== "undefined"
      ? localStorage.getItem("storeName") || "Seller Account"
      : "Seller Account"
  );
  const [approvalStatus, setApprovalStatus] = useState(
    typeof window !== "undefined" ? String(localStorage.getItem("sellerApprovalStatus") || "").toLowerCase() : ""
  );
  const [platformBranding, setPlatformBranding] = useState({
    sellercentral_logo_url: "",
    sellercentral_favicon_url: "",
    sellercentral_logo_height: 30,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("sellerToken");
    const base = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").replace(/\/$/, "");
    if (!base) return;
    fetch(`${base}/admin-hub/seller-settings?seller_id=default`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        setPlatformBranding({
          sellercentral_logo_url: normalizeSellerCentralLogoUrl(d?.sellercentral_logo_url) ?? "",
          sellercentral_favicon_url: (d?.sellercentral_favicon_url || "").trim(),
          sellercentral_logo_height: d?.sellercentral_logo_height != null ? Number(d.sellercentral_logo_height) : 30,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fav = (platformBranding.sellercentral_favicon_url || "").trim();
    if (!fav || typeof document === "undefined") return;
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "icon");
      document.head.appendChild(link);
    }
    link.setAttribute("href", fav);
  }, [platformBranding.sellercentral_favicon_url]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const h = Math.min(Math.max(platformBranding.sellercentral_logo_height || 30, 16), 44);
    const id = "belucha-sc-logo-height";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = `[class*="LogoContainer"] img,[class*="LogoLink"] img,.Polaris-TopBar__LogoContainer img{height:${h}px!important;width:auto!important;max-height:${h}px!important;}`;
  }, [platformBranding.sellercentral_logo_height]);

  const refreshNotifications = useCallback(async () => {
    try {
      const d = await getMedusaAdminClient().getNotificationsUnread();
      if (d && !d.__error) {
        setNotifData(d);
        setMsgUnread(d.messages || 0);
      }
    } catch {
      // Backend unreachable — silently ignore
    }
  }, []);

  // Poll notifications + message unread count every 60s
  useEffect(() => {
    if (!isAuthenticated) return;
    refreshNotifications();
    const id = setInterval(refreshNotifications, 60000);
    return () => clearInterval(id);
  }, [isAuthenticated, refreshNotifications]);

  // Inbox: refresh badge immediately after messages are marked read (not only on 60s poll)
  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") return;
    const onRefresh = () => {
      refreshNotifications();
    };
    window.addEventListener("belucha-msg-unread-refresh", onRefresh);
    window.addEventListener("belucha-notifications-refresh", onRefresh);
    return () => {
      window.removeEventListener("belucha-msg-unread-refresh", onRefresh);
      window.removeEventListener("belucha-notifications-refresh", onRefresh);
    };
  }, [isAuthenticated, refreshNotifications]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!pathname || !pathname.includes("/inbox")) return;
    refreshNotifications();
  }, [pathname, isAuthenticated, refreshNotifications]);

  // Close notif dropdown on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  // Routes blocked for non-superuser sellers
  const SELLER_BLOCKED_ROUTES = new Set([
    "/sellers",
    "/products/collections",
    "/products/collections/new",
    "/content/menus",
    "/content/menus/new",
    "/content/categories",
    "/content/landing-page",
    "/content/styles",
    "/content/pages",
    "/content/blog-posts",
    "/analytics/live-view",
    "/orders/abandoned-checkouts",
    "/settings/checkout",
  ]);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/register") return;
    const loggedIn = localStorage.getItem("sellerLoggedIn");
    if (!loggedIn) {
      router.push("/login");
    } else {
      const superuser = localStorage.getItem("sellerIsSuperuser") === "true";
      setIsAuthenticated(true);
      setIsSuperuser(superuser);
      // Load permissions from profile (cache in localStorage)
      const cachedPerms = localStorage.getItem("sellerPermissions");
      if (cachedPerms) {
        try { setUserPermissions(JSON.parse(cachedPerms)); } catch { setUserPermissions(null); }
      }
      // Fetch fresh profile to get latest permissions
      getMedusaAdminClient().getSellerProfile().then((d) => {
        const perms = d?.user?.permissions || null;
        localStorage.setItem("sellerPermissions", perms ? JSON.stringify(perms) : "null");
        setUserPermissions(perms);
      }).catch(() => {});
      getMedusaAdminClient().getSellerAccount().then((d) => {
        const status = String(d?.user?.approval_status || "").toLowerCase();
        if (status) localStorage.setItem("sellerApprovalStatus", status);
        setApprovalStatus(status);
      }).catch(() => {});
      // Redirect non-superusers away from blocked routes
      if (!superuser && SELLER_BLOCKED_ROUTES.has(pathname)) {
        router.replace("/dashboard");
        return;
      }
      // Fetch store name from backend if not cached
      const cached = localStorage.getItem("storeName");
      if (!cached) {
        getMedusaAdminClient().getSellerSettings().then((data) => {
          if (data?.store_name) {
            localStorage.setItem("storeName", data.store_name);
            setStoreName(data.store_name);
          }
        }).catch(() => {});
      }
    }
  }, [pathname, router]);

  // Nav seçili öğe: sadece mevcut path vurgulansın (Home "/" başka sayfadayken vurgulu kalmasın)
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.setAttribute("data-pathname", pathname || "/");
    return () => {
      document.body.removeAttribute("data-pathname");
    };
  }, [pathname]);

  const handleLogout = useCallback(async () => {
    localStorage.removeItem("sellerLoggedIn");
    localStorage.removeItem("sellerEmail");
    localStorage.removeItem("sellerId");
    localStorage.removeItem("storeName");
    localStorage.removeItem("sellerToken");
    localStorage.removeItem("sellerIsSuperuser");
    localStorage.removeItem("sellerPermissions");
    localStorage.removeItem("sellerApprovalStatus");
    // Clear httpOnly session cookie
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    router.push("/login");
  }, [router]);

  const userMenuActions = [
    {
      items: [
        { content: "Settings", onAction: () => router.push("/settings") },
        { content: "Logout", destructive: true, onAction: handleLogout },
      ],
    },
  ];

  const getUserInitials = () => {
    if (storeName && storeName !== "Seller Account") {
      return storeName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);
    }
    return "S";
  };

  if (pathname === "/login" || pathname === "/register") {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    return null;
  }

  const localeLabel =
    LOCALES.find((l) => l.code === locale)?.label ?? String(locale || "").toUpperCase();

  const notifUnread = notifData
    ? (notifData.orders || 0) +
      (notifData.returns || 0) +
      (notifData.verifications || 0) +
      (notifData.change_requests || 0)
    : 0;

  const topBarIconStyle = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.1)",
    border: "none", cursor: "pointer", color: "#fff", flexShrink: 0,
    position: "relative",
  };

  const langSelector = (
    <Popover
      active={langDropdownOpen}
      autofocusTarget="first-node"
      preferredAlignment="right"
      preferredPosition="below"
      onClose={() => setLangDropdownOpen(false)}
      activator={
        <Button
          variant="plain"
          onClick={() => setLangDropdownOpen((v) => !v)}
          accessibilityLabel={`Language / Dil — ${localeLabel}`}
          size="slim"
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#fff", height: 36, padding: "0 6px" }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="20" height="20" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.04em", lineHeight: 1 }}>
              {localeLabel}
            </span>
          </span>
        </Button>
      }
    >
      <ActionList
        items={LOCALES.map(({ code, label }) => ({
          content: label,
          active: locale === code,
          onAction: () => {
            router.replace(pathname, { locale: code });
            setLangDropdownOpen(false);
          },
        }))}
      />
    </Popover>
  );

  const frameLogoUrl = normalizeSellerCentralLogoUrl(platformBranding.sellercentral_logo_url);
  const topBarLogoMaxH = Math.min(Math.max(platformBranding.sellercentral_logo_height || 30, 16), 44);

  /** Polaris Frame `logo` makes TopBar + Navigation render Image with `topBarSource || ''` (empty src warning). Use contextControl on both instead. */
  const polarisLogoContextControl = frameLogoUrl ? (
    <div style={{ display: "flex", alignItems: "center" }}>
      <UnstyledLink url="/dashboard" style={{ display: "block", width: 140, lineHeight: 0 }}>
        <img
          src={frameLogoUrl}
          alt="Sellercentral"
          style={{
            display: "block",
            width: "auto",
            maxWidth: 140,
            height: topBarLogoMaxH,
            objectFit: "contain",
          }}
        />
      </UnstyledLink>
    </div>
  ) : undefined;

  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={() => setShowMobileNav((v) => !v)}
      contextControl={polarisLogoContextControl}
      userMenu={
        <div style={{ display: "flex", alignItems: "center", gap: 4, height: 56 }}>
          {/* Language selector */}
          {langSelector}

          {/* Mail / Inbox */}
          <Link href="/inbox" style={{ ...topBarIconStyle, textDecoration: "none" }} title="Nachrichten">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="20" height="20" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
            {msgUnread > 0 && (
              <span style={{ position: "absolute", top: 4, right: 4, background: "#ef4444", color: "#fff", borderRadius: "50%", fontSize: 9, fontWeight: 800, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                {msgUnread > 9 ? "9+" : msgUnread}
              </span>
            )}
          </Link>

          {/* Bell / Notifications */}
          <div ref={notifRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={async () => {
                setNotifOpen((v) => !v);
                if (!notifOpen) {
                  try {
                    await getMedusaAdminClient().markNotificationsSeen();
                    await refreshNotifications();
                  } catch {
                    // ignore
                  }
                }
              }}
              style={{ ...topBarIconStyle }}
              title="Benachrichtigungen"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="20" height="20" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
              {notifUnread > 0 && (
                <span style={{ position: "absolute", top: 4, right: 4, background: "#ef4444", color: "#fff", borderRadius: "50%", fontSize: 9, fontWeight: 800, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                  {notifUnread > 9 ? "9+" : notifUnread}
                </span>
              )}
            </button>
            {notifOpen && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 320, background: "#fff", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb", zIndex: 9999 }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 13, fontWeight: 700, color: "#111827" }}>Benachrichtigungen</div>
                <div style={{ maxHeight: 340, overflowY: "auto" }}>
                  {(!notifData?.recent_orders?.length &&
                    !notifData?.recent_returns?.length &&
                    !notifData?.recent_verifications?.length &&
                    !notifData?.recent_product_change_requests?.length) ? (
                    <div style={{ padding: "24px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Keine neuen Benachrichtigungen</div>
                  ) : (
                    <>
                      {(notifData?.recent_verifications || []).map((v) => (
                        <Link key={v.id} href={v.seller_id ? `/sellers/${v.seller_id}` : "/sellers"} onClick={() => setNotifOpen(false)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", borderBottom: "1px solid #f9fafb", textDecoration: "none" }}>
                          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>📋</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{v.title || "Evrak Gönderildi"}</div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>{v.body || "Satıcı doğrulama evraklarını gönderdi."}</div>
                          </div>
                        </Link>
                      ))}
                      {(notifData?.recent_product_change_requests || []).map((cr) => (
                        <Link
                          key={cr.id}
                          href={cr.product_id ? `/products/${cr.product_id}` : "/products/inventory"}
                          onClick={() => setNotifOpen(false)}
                          style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", borderBottom: "1px solid #f9fafb", textDecoration: "none" }}
                        >
                          <span
                            style={{
                              flexShrink: 0,
                              marginTop: 1,
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: "var(--p-color-bg-fill-secondary)",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--p-color-icon)",
                            }}
                            aria-hidden
                          >
                            <Icon source={EditIcon} tone="subdued" />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-color-text)" }}>
                              Produktänderung ausstehend
                            </div>
                            <div style={{ fontSize: 12, color: "var(--p-color-text-secondary)", lineHeight: 1.35, marginTop: 2 }}>
                              {cr.product_title || "Produkt"} · {fieldNameDisplayLabel(cr.field_name, locale)}
                            </div>
                          </div>
                        </Link>
                      ))}
                      {(notifData?.recent_orders || []).map((o) => (
                        <Link key={o.id} href={`/orders/${o.id}`} onClick={() => setNotifOpen(false)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", borderBottom: "1px solid #f9fafb", textDecoration: "none" }}>
                          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>📦</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Neue Bestellung #{o.order_number || "—"}</div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>{o.first_name} {o.last_name} · {o.total_cents ? (o.total_cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €" : ""}</div>
                          </div>
                        </Link>
                      ))}
                      {(notifData?.recent_returns || []).map((r) => (
                        <Link key={r.id} href="/orders/returns" onClick={() => setNotifOpen(false)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", borderBottom: "1px solid #f9fafb", textDecoration: "none" }}>
                          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>↩️</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Rückgabeanfrage R-{r.return_number || "—"}</div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>Bestellung #{r.order_number || "—"} · {r.status}</div>
                          </div>
                        </Link>
                      ))}
                    </>
                  )}
                </div>
                <div style={{ padding: "10px 16px", borderTop: "1px solid #f3f4f6" }}>
                  <Link href="/notifications" onClick={() => setNotifOpen(false)} style={{ fontSize: 12, color: "#0284c7", textDecoration: "none", fontWeight: 600 }}>
                    Alle Benachrichtigungen →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Profile */}
          <TopBar.UserMenu
            name={storeName}
            detail={isSuperuser ? "⚡ Superuser" : "Seller"}
            initials={getUserInitials()}
            actions={userMenuActions}
            open={userMenuOpen}
            onToggle={() => setUserMenuOpen((v) => !v)}
          />
        </div>
      }
      searchField={
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: "100%" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <GroupedDropdownSearch placeholder="Search products, orders, customers..." />
          </div>
          {unsaved?.isDirty && (
            <>
              <style>{discardBtnStyles}</style>
              <div className="belucha-discard-topbar-btn">
                <Button
                  size="slim"
                  variant="tertiary"
                  onClick={() => unsaved.runDiscard()}
                  style={{
                    background: "#4d4d4d",
                    color: "#ffffff",
                    border: "1px solid #5c5c5c",
                  }}
                >
                  Discard
                </Button>
              </div>
              <Button
                size="medium"
                variant="secondary"
                onClick={() => unsaved.runSave()}
                style={{
                  background: "#fff",
                  color: "#202223",
                  border: "2px solid #202223",
                  fontWeight: 600,
                  minWidth: 80,
                }}
              >
                Save
              </Button>
            </>
          )}
        </div>
      }
    />
  );

  // Filter nav items based on role
  const SELLER_BLOCKED_NAV = new Set([
    "/products/collections",
    "/content/menus",
    "/content/categories",
    "/content/landing-page",
    "/content/styles",
    "/content/pages",
    "/content/blog-posts",
    "/analytics/live-view",
    "/orders/abandoned-checkouts",
  ]);

  const filterNavForRole = (items) => {
    if (isSuperuser) return items;
    // If user has custom permissions, use those; otherwise use default blocked set
    const isAllowed = (url) => {
      if (userPermissions) return userPermissions.some((p) => url === p || url.startsWith(p + "/"));
      return !SELLER_BLOCKED_NAV.has(url);
    };
    return items
      .filter((item) => isAllowed(item.url) || item.subNavigationItems?.some((s) => isAllowed(s.url)))
      .map((item) => {
        if (!item.subNavigationItems) return item;
        return { ...item, subNavigationItems: item.subNavigationItems.filter((s) => isAllowed(s.url)) };
      });
  };

  const menuMain = styleSuperuserOnlyNavItems(
    filterNavForRole(getMenuItemsMain(t, isSuperuser)),
    isSuperuser
  );
  const menuSettings = getMenuItemsSettings(t, isSuperuser);
  const navLocation = pathname && pathname !== "" ? pathname : "/";

  const navMarkup = (
    <Navigation
      location={navLocation}
      onDismiss={() => setShowMobileNav(false)}
      contextControl={polarisLogoContextControl}
    >
      <Navigation.Section
        items={menuMain.map((item) => {
          const hasSub = item.subNavigationItems?.length > 0;
          const shouldToggleOnly = hasSub && PARENT_NAV_URLS.has(item.url);
          // A parent is "selected" (expanded) if we manually toggled it OR a child matches current path
          const parentTargetUrl = shouldToggleOnly && item.subNavigationItems?.[0]?.url ? item.subNavigationItems[0].url : item.url;
          const parentIsActive = !!parentTargetUrl && (navLocation === parentTargetUrl || navLocation.startsWith(`${parentTargetUrl}/`));
          const childIsActive = hasSub && item.subNavigationItems.some((s) => s.url !== item.url && navLocation.startsWith(s.url));
          const isSelected = hasSub
            ? ((shouldToggleOnly && expandedLabel === item.label) || parentIsActive || childIsActive)
            : undefined;
          return {
            url: item.url,
            label: item.label,
            icon: item.icon,
            subNavigationItems: item.subNavigationItems,
            selected: isSelected,
            onClick: shouldToggleOnly
              ? () => setExpandedLabel((prev) => prev === item.label ? null : item.label)
              : undefined,
          };
        })}
      />
      <Navigation.Section
        fill
        separator
        items={menuSettings.map((item) => {
          const hasSub = item.subNavigationItems?.length > 0;
          const shouldToggleOnly = hasSub && PARENT_NAV_URLS.has(item.url);
          const parentIsActive = navLocation === item.url || navLocation.startsWith(item.url + "/");
          const childIsActive = hasSub && item.subNavigationItems.some((s) => navLocation.startsWith(s.url));
          const isSelected = hasSub ? (shouldToggleOnly && expandedLabel === item.label) || parentIsActive || childIsActive : undefined;
          return {
            url: item.url,
            label: item.label,
            icon: item.icon,
            subNavigationItems: item.subNavigationItems,
            selected: isSelected,
            onClick: shouldToggleOnly
              ? () => setExpandedLabel((prev) => prev === item.label ? null : item.label)
              : undefined,
          };
        })}
      />
    </Navigation>
  );

  const linkComponent = unsaved ? UnsavedAwareLink : NextLink;
  const bannerI18n = locale === "tr"
    ? {
        completeVerification: "Satışa başlayabilmek için doğrulama adımlarına geçin",
        goVerification: "Doğrulamaya git",
        suspended: "hesabınız askıya alındı. lütfen destek ile iletişime geçin",
        rejected: "hesabınız reddedildi. lütfen evrakları kontrol edip destek ile iletişime geçin.",
        docsSubmitted: "evraklar gönderildi. hesabınız inceleme altında.",
        pending: "hesabınız onay bekliyor. inceleme sonrası bilgilendirileceksiniz.",
      }
    : locale === "de"
      ? {
          completeVerification: "Gehe zu den Verifizierungsschritten, um mit dem Verkauf zu starten",
          goVerification: "Zur Verifizierung",
          suspended: "your account is suspended. please contact with support",
          rejected: "your account was rejected. please review your documents and contact support.",
          docsSubmitted: "documents submitted. your account is under review.",
          pending: "your account is pending approval. you will be notified after review.",
        }
      : {
          completeVerification: "Go to verification steps to start selling",
          goVerification: "Go to verification",
          suspended: "your account is suspended. please contact with support",
          rejected: "your account was rejected. please review your documents and contact support.",
          docsSubmitted: "documents submitted. your account is under review.",
          pending: "your account is pending approval. you will be notified after review.",
        };
  const approvalBanner = !isSuperuser ? (() => {
    const status = String(approvalStatus || "").toLowerCase();
    if (!status) return null;
    if (status === "registered") {
      return {
        background: "#f59e0b",
        color: "#111827",
        text: bannerI18n.completeVerification,
        actionLabel: bannerI18n.goVerification,
        actionHref: "/settings/verification",
      };
    }
    if (status === "approved" || status === "active") return null;
    if (status === "suspended") {
      return {
        background: "#dc2626",
        color: "#fff",
        text: bannerI18n.suspended,
      };
    }
    if (status === "rejected") {
      return {
        background: "#ef4444",
        color: "#fff",
        text: bannerI18n.rejected,
      };
    }
    if (status === "documents_submitted") {
      return {
        background: "#d97706",
        color: "#fff",
        text: bannerI18n.docsSubmitted,
      };
    }
    if (status === "pending_approval" || status === "pending") {
      return {
        background: "#2563eb",
        color: "#fff",
        text: bannerI18n.pending,
      };
    }
    return {
      background: "#4b5563",
      color: "#fff",
      text: `account status: ${status}`,
    };
  })() : null;

  return (
    <AppProvider i18n={en} linkComponent={linkComponent}>
      <Frame
        navigation={navMarkup}
        topBar={topBarMarkup}
        showMobileNavigation={showMobileNav}
        onNavigationDismiss={() => setShowMobileNav(false)}
      >
        {approvalBanner && (
          <div
            style={{
              background: approvalBanner.background,
              color: approvalBanner.color,
              textAlign: "center",
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 16px",
            }}
          >
            <span>{approvalBanner.text}</span>
            {approvalBanner.actionHref && (
              <button
                type="button"
                onClick={() => router.push(approvalBanner.actionHref)}
                style={{
                  marginLeft: 12,
                  border: "none",
                  background: "transparent",
                  color: approvalBanner.color,
                  cursor: "pointer",
                  fontWeight: 700,
                  textDecoration: "underline",
                }}
              >
                {approvalBanner.actionLabel} {"\u2192"}
              </button>
            )}
          </div>
        )}
        {unsaved?.showNavigateConfirm && (
          <Modal
            open={true}
            onClose={() => unsaved.setShowNavigateConfirm(false)}
            title="Unsaved changes"
            primaryAction={{
              content: "Save",
              onAction: () => unsaved.runSave(),
            }}
            secondaryActions={[
              {
                content: "Discard",
                destructive: true,
                onAction: () => unsaved.runDiscard(),
              },
            ]}
          >
            <Modal.Section>
              <Text as="p">You have unsaved changes. Save or discard before leaving.</Text>
            </Modal.Section>
          </Modal>
        )}
        <div className="belucha-scroll-wrapper">
          <div className="belucha-page-content belucha-page-content-transition">
            {children}
          </div>
        </div>
      </Frame>
    </AppProvider>
  );
}
