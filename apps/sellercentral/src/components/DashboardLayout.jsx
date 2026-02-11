"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
// Apollo Client removed - will migrate to Medusa REST API
import styled from "styled-components";

// GraphQL query removed - will migrate to Medusa REST API

const Container = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #f9fafb;
`;

const TopBar = styled.div`
  width: 100%;
  flex-shrink: 0;
  background-color: #2c2c2c;
  padding: 8px 20px;
  border-bottom: 1px solid #1a1a1a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  min-height: 48px;
  z-index: 50;
`;

const TopBarLogo = styled(Link)`
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  font-family: "Manrope", sans-serif;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    color: #e5e5e5;
  }
`;

const BodyRow = styled.div`
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
`;

const Sidebar = styled.aside`
  width: 260px;
  flex-shrink: 0;
  background-color: #c8c9ca;
  color: #000000;
  padding: 24px 0;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    transform: ${({ $isOpen }) => ($isOpen ? "translateX(0)" : "translateX(-100%)")};
    position: fixed;
    left: 0;
    top: 48px;
    bottom: 0;
    height: auto;
    z-index: 100;
  }
`;

const SidebarHeader = styled.div`
  padding: 0 24px 20px;
  border-bottom: 1px solid #a0a1a2;
  margin-bottom: 24px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
`;

const SidebarTitle = styled.span`
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  color: #000000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Menu = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 16px;
  flex: 1;
`;

const MenuItem = styled.div`
  position: relative;
`;

const MenuItemLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  color: ${({ $active }) => ($active ? "#0f172a" : "#000000")};
  background-color: ${({ $active }) => ($active ? "#a8a9aa" : "transparent")};
  transition: all 0.2s ease;
  font-weight: ${({ $active }) => ($active ? "600" : "400")};
  font-size: 13px;
  line-height: 1.5;
  text-decoration: none;
  position: relative;

  &:hover {
    background-color: #b0b1b2;
    color: #000000;
  }

  span {
    display: block;
  }
`;

const MenuItemTooltip = styled.div`
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  background-color: #2c2c2c;
  color: #ffffff;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
  z-index: 1000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
`;

const DropdownIcon = styled.i`
  font-size: 12px;
  transition: transform 0.2s ease;
  transform: ${({ $isOpen }) => ($isOpen ? "rotate(180deg)" : "rotate(0deg)")};
`;

const SubMenu = styled.div`
  max-height: ${({ $isOpen }) => ($isOpen ? "500px" : "0")};
  overflow: hidden;
  transition: max-height 0.3s ease;
  margin-left: 16px;
  border-left: 2px solid #a0a1a2;
  padding-left: 8px;
`;

const SubMenuItemLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 6px;
  color: ${({ $active }) => ($active ? "#0f172a" : "#000000")};
  background-color: ${({ $active }) => ($active ? "#a8a9aa" : "transparent")};
  transition: all 0.2s ease;
  font-size: 13px;
  line-height: 1.5;
  text-decoration: none;
  justify-content: flex-start;

  &:hover {
    background-color: #b0b1b2;
    color: #000000;
  }

  i {
    display: block;
  }

  span {
    display: block;
  }
`;

const Main = styled.main`
  flex: 1;
  min-width: 0;
  padding: 0;
  overflow: auto;
`;

const SearchBar = styled.div`
  flex: 1;
  max-width: 600px;
  position: relative;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 6px 12px 6px 40px;
  border: 1px solid #404040;
  border-radius: 6px;
  font-size: 14px;
  color: #ffffff;
  background: #1a1a1a;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #505050;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
  }

  &::placeholder {
    color: #a0a0a0;
  }
`;

const SearchIcon = styled.i`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #ffffff;
  font-size: 14px;
`;

const UserMenuWrapper = styled.div`
  position: relative;
`;

const UserMenuButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.2s ease;
  color: #ffffff;

  &:hover {
    background-color: #3d3d3d;
    color: #ffffff;
  }
`;

const UserAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #505050 0%, #3d3d3d 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
`;

const UserName = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
`;

const DropdownMenu = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  min-width: 220px;
  z-index: 1000;
  overflow: hidden;
`;

const DropdownMenuItem = styled(Link)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  color: #1f2937;
  text-decoration: none;
  font-size: 14px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #f3f4f6;
  }

  i {
    width: 20px;
    color: #6b7280;
  }

  ${({ $danger }) =>
    $danger &&
    `
    color: #ef4444;
    i {
      color: #ef4444;
    }
    &:hover {
      background-color: #fee2e2;
    }
  `}
`;

const DropdownDivider = styled.div`
  height: 1px;
  background-color: #e5e7eb;
  margin: 4px 0;
`;

const ContentArea = styled.div`
  padding: 24px;
`;

const menuItems = [
  {
    href: "/",
    label: "Home",
    icon: "fas fa-home",
  },
  {
    href: "/inventory",
    label: "Products",
    icon: "fas fa-shopping-bag",
    submenu: [
      { href: "/inventory", label: "All products" },
      { href: "/products/single-upload", label: "Add product" },
      { href: "/products/bulk-upload", label: "Bulk upload" },
      { href: "/products/upload-templates", label: "Upload templates" },
      { href: "/products/bulk-images", label: "Bulk images" },
      { href: "/products/bulk-videos", label: "Bulk videos" },
    ],
  },
  {
    href: "/orders",
    label: "Orders",
    icon: "fas fa-shopping-cart",
    submenu: [
      { href: "/orders", label: "All orders" },
      { href: "/orders/reports", label: "Reports" },
      { href: "/orders/returns", label: "Returns" },
    ],
  },
  {
    href: "/customers",
    label: "Customers",
    icon: "fas fa-users",
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: "fas fa-chart-line",
  },
  {
    href: "/marketing",
    label: "Marketing",
    icon: "fas fa-bullhorn",
    submenu: [
      { href: "/advertise/google", label: "Google Ads" },
      { href: "/advertise/meta", label: "Meta Ads" },
      { href: "/advertise/tiktok", label: "TikTok Ads" },
      { href: "/advertise/pinterest", label: "Pinterest Ads" },
    ],
  },
  {
    href: "/discounts",
    label: "Discounts",
    icon: "fas fa-tag",
  },
  {
    href: "/apps",
    label: "Apps",
    icon: "fas fa-th",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "fas fa-cog",
    submenu: [
      { href: "/settings/general", label: "General" },
      { href: "/settings/account", label: "Account" },
      { href: "/settings/notifications", label: "Notifications" },
      { href: "/settings/payments", label: "Payments" },
      { href: "/settings/shipping", label: "Shipping" },
      { href: "/settings/platform", label: "Platform Settings" },
      { href: "/settings/categories", label: "Categories" },
      { href: "/settings/banners", label: "Banners" },
    ],
  },
];

function DashboardLayoutContent({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState({});
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const userMenuRef = useRef(null);
  const sellerId = typeof window !== "undefined" ? localStorage.getItem("sellerId") : null;

  // GraphQL query removed - using localStorage for now
  const storeName = typeof window !== "undefined" ? localStorage.getItem("storeName") || "Seller Account" : "Seller Account";

  useEffect(() => {
    // Login sayfalarında authentication kontrolü yapma
    if (pathname === "/login" || pathname === "/register") {
      return;
    }

    // Authentication kontrolü
    const loggedIn = localStorage.getItem("sellerLoggedIn");
    if (!loggedIn) {
      router.push("/login");
    } else {
      setIsAuthenticated(true);
    }
  }, [pathname, router]);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userMenuOpen]);

  // Auto-open dropdown if current path matches submenu
  useEffect(() => {
    const newOpenDropdowns = {};
    menuItems.forEach((item) => {
      if (item.submenu) {
        const isActive = item.submenu.some((sub) => pathname.startsWith(sub.href));
        if (isActive || pathname === item.href) {
          newOpenDropdowns[item.href] = true;
        }
      }
    });
    setOpenDropdowns(newOpenDropdowns);
  }, [pathname]);

  const toggleDropdown = (href) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [href]: !prev[href],
    }));
  };

  const handleMenuItemClick = (e, item) => {
    if (item.submenu) {
      e.preventDefault();
      toggleDropdown(item.href);
      // If clicking main item, navigate to first submenu item
      if (!openDropdowns[item.href] && item.submenu.length > 0) {
        router.push(item.submenu[0].href);
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("sellerLoggedIn");
    localStorage.removeItem("sellerEmail");
    localStorage.removeItem("sellerId");
    router.push("/login");
  };

  // Login/register sayfalarında layout gösterme
  if (pathname === "/login" || pathname === "/register") {
    return <>{children}</>;
  }

  // Henüz authentication kontrolü yapılmadıysa loading göster
  if (!isAuthenticated) {
    return null;
  }

  const isActive = (href) => {
    if (href === "/inventory" && pathname === "/products") return true;
    return pathname === href || pathname.startsWith(href + "/");
  };

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

  return (
    <Container>
      <TopBar>
        <TopBarLogo href="/">Belucha</TopBarLogo>
        <SearchBar>
          <SearchIcon className="fas fa-search" />
          <SearchInput
            type="text"
            placeholder="Search products, orders, customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </SearchBar>
        <UserMenuWrapper ref={userMenuRef}>
          <UserMenuButton onClick={() => setUserMenuOpen(!userMenuOpen)}>
            <UserAvatar>{getUserInitials()}</UserAvatar>
            <UserName>{storeName}</UserName>
            <i className="fas fa-chevron-down" style={{ fontSize: "12px", color: "#ffffff" }} />
          </UserMenuButton>
          {userMenuOpen && (
            <DropdownMenu>
              <DropdownMenuItem href="/profile">
                <i className="fas fa-user" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem href="/settings">
                <i className="fas fa-cog" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem href="/settings/account">
                <i className="fas fa-user-cog" />
                <span>Account Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem href="/settings/payment">
                <i className="fas fa-credit-card" />
                <span>Payment Methods</span>
              </DropdownMenuItem>
              <DropdownMenuItem href="/settings/notifications">
                <i className="fas fa-bell" />
                <span>Notifications</span>
              </DropdownMenuItem>
              <DropdownDivider />
              <DropdownMenuItem href="/settings/security">
                <i className="fas fa-shield-alt" />
                <span>Security</span>
              </DropdownMenuItem>
              <DropdownMenuItem href="/settings/billing">
                <i className="fas fa-file-invoice-dollar" />
                <span>Billing</span>
              </DropdownMenuItem>
              <DropdownDivider />
              <DropdownMenuItem href="#" $danger onClick={(e) => { e.preventDefault(); handleLogout(); }}>
                <i className="fas fa-sign-out-alt" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenu>
          )}
        </UserMenuWrapper>
      </TopBar>
      <BodyRow>
        <Sidebar $isOpen={sidebarOpen}>
          <SidebarHeader>
            <SidebarTitle>Seller Central</SidebarTitle>
          </SidebarHeader>
          <Menu>
          {menuItems.map((item) => {
            const hasSubmenu = item.submenu && item.submenu.length > 0;
            const isItemActive = isActive(item.href);
            const isDropdownOpen = openDropdowns[item.href];

            return (
              <MenuItem key={item.href}>
                <MenuItemLink
                  href={item.href}
                  $active={isItemActive}
                  onClick={(e) => handleMenuItemClick(e, item)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <i className={item.icon} style={{ fontSize: "18px", minWidth: "18px" }} />
                    <span>{item.label}</span>
                  </div>
                  {hasSubmenu && (
                    <DropdownIcon className="fas fa-chevron-down" $isOpen={isDropdownOpen} />
                  )}
                </MenuItemLink>
                {hasSubmenu && (
                  <SubMenu $isOpen={isDropdownOpen}>
                    {item.submenu.map((subItem) => (
                      <SubMenuItemLink
                        key={subItem.href}
                        href={subItem.href}
                        $active={pathname === subItem.href}
                      >
                        <i className="fas fa-circle" style={{ fontSize: "6px" }} />
                        <span>{subItem.label}</span>
                      </SubMenuItemLink>
                    ))}
                  </SubMenu>
                )}
              </MenuItem>
            );
          })}
        </Menu>
      </Sidebar>
        <Main>
          <ContentArea>{children}</ContentArea>
        </Main>
      </BodyRow>
    </Container>
  );
}

export default function DashboardLayout({ children }) {
  return <DashboardLayoutContent>{children}</DashboardLayoutContent>;
}
