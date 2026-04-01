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
} from "@shopify/polaris-icons";
import dynamic from "next/dynamic";
import en from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const discardBtnStyles = `
  .belucha-discard-topbar-btn,
  .belucha-discard-topbar-btn *,
  .belucha-discard-topbar-btn span { color: #ffffff !important; }
`;

const GroupedDropdownSearch = dynamic(
  () => import("./GroupedDropdownSearch").then((m) => m.default),
  { ssr: false, loading: () => <div style={{ width: "100%", maxWidth: 400, height: 36 }} /> }
);

function getMenuItemsMain(t) {
  return [
    { url: "/dashboard", label: t("home"), icon: HomeIcon },
    {
      url: "/orders",
      label: t("orders"),
      icon: OrderIcon,
      subNavigationItems: [
        { url: "/orders", label: "Ansicht" },
        { url: "/orders/returns", label: t("returns") },
        { url: "/orders/abandoned-checkouts", label: t("abandonedCheckouts") },
      ],
    },
    {
      url: "/products",
      label: t("products"),
      icon: ProductIcon,
      subNavigationItems: [
        { url: "/products/inventory", label: t("inventory") },
        { url: "/products/collections", label: t("collections") },
        { url: "/products/gift-cards", label: t("giftCards") },
      ],
    },
    {
      url: "/customers-menu",
      label: t("customers"),
      icon: ProfileIcon,
      subNavigationItems: [
        { url: "/customers", label: "Liste" },
        { url: "/orders/abandoned-checkouts", label: t("abandonedCheckouts") },
        { url: "/customers/reviews", label: "Bewertungen" },
      ],
    },
    {
      url: "/marketing",
      label: t("marketing"),
      icon: MegaphoneIcon,
      subNavigationItems: [
        { url: "/marketing/campaigns", label: t("campaigns") },
        { url: "/marketing/attribution", label: t("attribution") },
        { url: "/marketing/automations", label: t("automations") },
      ],
    },
    { url: "/discounts", label: t("discounts"), icon: DiscountIcon },
    {
      url: "/content",
      label: t("content"),
      icon: ListBulletedIcon,
      subNavigationItems: [
        { url: "/content/media", label: t("media") },
        { url: "/content/menus", label: t("menus") },
        { url: "/content/categories", label: t("categories") },
        { url: "/content/brands", label: t("brands") },
        { url: "/content/metaobjects", label: t("metaobjects") },
        { url: "/content/landing-page", label: "Landing Page" },
        { url: "/content/styles", label: "Styles" },
        { url: "/content/pages", label: t("pages") },
        { url: "/content/blog-posts", label: t("blogPosts") },
      ],
    },
    {
      url: "/analytics",
      label: t("analytics"),
      icon: ChartVerticalIcon,
      subNavigationItems: [
        { url: "/analytics/reports", label: t("reports") },
        { url: "/analytics/transactions", label: "Transactions" },
        { url: "/analytics/live-view", label: t("liveView") },
      ],
    },
    { url: "/import-export", label: t("importExport"), icon: ImportIcon },
  ];
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
  "/products", "/marketing", "/content", "/analytics", "/customers-menu",
]);

const NextLink = forwardRef(function NextLink({ url, children, external, onClick, ...rest }, ref) {
  const handleClick = (e) => {
    if (PARENT_NAV_URLS.has(url || "") && typeof onClick === "function") {
      e.preventDefault();
    }
    onClick?.(e);
  };
  return (
    <Link href={url || ""} ref={ref} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
});

const UnsavedAwareLink = forwardRef(function UnsavedAwareLink({ url, children, external, onClick, ...rest }, ref) {
  const ctx = useUnsavedChanges();
  const handleClick = (e) => {
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
    <Link ref={ref} href={url || "#"} onClick={handleClick} {...rest}>
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
  const t = useTranslations("nav");
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

  // Poll notifications + message unread count every 60s
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchNotifs = async () => {
      try {
        const d = await getMedusaAdminClient().getNotificationsUnread();
        if (d && !d.__error) { setNotifData(d); setMsgUnread(d.messages || 0); }
      } catch {
        // Backend unreachable — silently ignore
      }
    };
    fetchNotifs();
    const id = setInterval(fetchNotifs, 60000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // Close notif dropdown on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  // Routes blocked for non-superuser sellers
  const SELLER_BLOCKED_ROUTES = new Set([
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

  const handleLogout = useCallback(() => {
    localStorage.removeItem("sellerLoggedIn");
    localStorage.removeItem("sellerEmail");
    localStorage.removeItem("sellerId");
    localStorage.removeItem("storeName");
    localStorage.removeItem("sellerToken");
    localStorage.removeItem("sellerIsSuperuser");
    localStorage.removeItem("sellerPermissions");
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
    ? (notifData.orders || 0) + (notifData.returns || 0)
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

  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={() => setShowMobileNav((v) => !v)}
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
                    setNotifData((d) => d ? { ...d, orders: 0, returns: 0 } : d);
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
                  {(!notifData?.recent_orders?.length && !notifData?.recent_returns?.length) ? (
                    <div style={{ padding: "24px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Keine neuen Benachrichtigungen</div>
                  ) : (
                    <>
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
                  <Link href="/orders" onClick={() => setNotifOpen(false)} style={{ fontSize: 12, color: "#ff971c", textDecoration: "none", fontWeight: 600 }}>Alle Bestellungen →</Link>
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 520 }}>
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

  const menuMain = filterNavForRole(getMenuItemsMain(t));
  const menuSettings = getMenuItemsSettings(t, isSuperuser);
  const navLocation = pathname && pathname !== "" ? pathname : "/";

  const navMarkup = (
    <Navigation location={navLocation} onDismiss={() => setShowMobileNav(false)}>
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

  return (
    <AppProvider i18n={en} linkComponent={linkComponent}>
      <Frame
        navigation={navMarkup}
        topBar={topBarMarkup}
        showMobileNavigation={showMobileNav}
        onNavigationDismiss={() => setShowMobileNav(false)}
      >
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
