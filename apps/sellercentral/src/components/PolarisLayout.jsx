"use client";

import React, { useState, useEffect, useCallback, forwardRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AppProvider,
  Frame,
  Navigation,
  TopBar,
} from "@shopify/polaris";
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

const GroupedDropdownSearch = dynamic(
  () => import("./GroupedDropdownSearch").then((m) => m.default),
  { ssr: false, loading: () => <div style={{ width: "100%", maxWidth: 400, height: 36 }} /> }
);

const menuItemsMain = [
  { url: "/", label: "Home", icon: HomeIcon },
  {
    url: "/orders",
    label: "Orders",
    icon: OrderIcon,
    subNavigationItems: [
      { url: "/orders/drafts", label: "Drafts" },
      { url: "/orders/abandoned-checkouts", label: "Abandoned checkouts" },
      { url: "/orders/returns", label: "Returns" },
    ],
  },
  {
    url: "/products",
    label: "Products",
    icon: ProductIcon,
    subNavigationItems: [
      { url: "/products/collections", label: "Collections" },
      { url: "/products/inventory", label: "Inventory" },
      { url: "/products/gift-cards", label: "Gift Cards" },
    ],
  },
  { url: "/customers", label: "Customers", icon: ProfileIcon },
  {
    url: "/marketing",
    label: "Marketing",
    icon: MegaphoneIcon,
    subNavigationItems: [
      { url: "/marketing/campaigns", label: "Campaigns" },
      { url: "/marketing/attribution", label: "Attribution" },
      { url: "/marketing/automations", label: "Automations" },
    ],
  },
  { url: "/discounts", label: "Discounts", icon: DiscountIcon },
  {
    url: "/content",
    label: "Content",
    icon: ListBulletedIcon,
    subNavigationItems: [
      { url: "/content/metaobjects", label: "Metaobjects" },
      { url: "/content/files", label: "Files" },
      { url: "/content/menus", label: "Menus" },
      { url: "/content/blog-posts", label: "Blog Posts" },
      { url: "/content/brands", label: "Brands" },
    ],
  },
  {
    url: "/analytics",
    label: "Analytics",
    icon: ChartVerticalIcon,
    subNavigationItems: [
      { url: "/analytics/reports", label: "Reports" },
      { url: "/analytics/live-view", label: "Live View" },
    ],
  },
  { url: "/import-export", label: "Import/Export", icon: ImportIcon },
];

const menuItemsSettings = [
  { url: "/settings", label: "Settings", icon: SettingsIcon },
];

const NextLink = forwardRef(function NextLink({ url, children, ...rest }, ref) {
  return (
    <Link href={url || ""} ref={ref} {...rest}>
      {children}
    </Link>
  );
});

export default function PolarisLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const storeName =
    typeof window !== "undefined"
      ? localStorage.getItem("storeName") || "Seller Account"
      : "Seller Account";

  useEffect(() => {
    if (pathname === "/login" || pathname === "/register") return;
    const loggedIn = localStorage.getItem("sellerLoggedIn");
    if (!loggedIn) {
      router.push("/login");
    } else {
      setIsAuthenticated(true);
    }
  }, [pathname, router]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("sellerLoggedIn");
    localStorage.removeItem("sellerEmail");
    localStorage.removeItem("sellerId");
    localStorage.removeItem("storeName");
    router.push("/login");
  }, [router]);

  const userMenuActions = [
    {
      items: [
        { content: "Profile", url: "/profile" },
        { content: "Settings", url: "/settings" },
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

  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={() => setShowMobileNav((v) => !v)}
      userMenu={
        <TopBar.UserMenu
          name={storeName}
          detail=""
          initials={getUserInitials()}
          actions={userMenuActions}
          open={userMenuOpen}
          onToggle={() => setUserMenuOpen((v) => !v)}
        />
      }
      searchField={
        <GroupedDropdownSearch placeholder="Search products, orders, customers..." />
      }
    />
  );

  const navMarkup = (
    <Navigation location={pathname || "/"} onDismiss={() => setShowMobileNav(false)}>
      <Navigation.Section
        items={menuItemsMain.map((item) => ({
          url: item.url,
          label: item.label,
          icon: item.icon,
          subNavigationItems: item.subNavigationItems,
        }))}
      />
      <Navigation.Section
        fill
        separator
        items={menuItemsSettings.map((item) => ({
          url: item.url,
          label: item.label,
          icon: item.icon,
        }))}
      />
    </Navigation>
  );

  const frameLogo = {
    url: "/",
    accessibilityLabel: "Belucha",
    topBarSource: "/logo.svg",
    width: 120,
  };

  return (
    <AppProvider i18n={en} linkComponent={NextLink}>
      <Frame
        logo={frameLogo}
        navigation={navMarkup}
        topBar={topBarMarkup}
        showMobileNavigation={showMobileNav}
        onNavigationDismiss={() => setShowMobileNav(false)}
      >
        <div key={pathname} className="belucha-page-content">
          {children}
        </div>
      </Frame>
    </AppProvider>
  );
}
