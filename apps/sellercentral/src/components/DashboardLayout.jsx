"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, gql, ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import styled from "styled-components";

const GET_SELLER = gql`
  query GetSeller($id: String!) {
    Sellers(where: { id: { equals: $id } }, limit: 1) {
      docs {
        id
        storeName
      }
    }
  }
`;

const Container = styled.div`
  display: flex;
  min-h-screen;
  background-color: #f9fafb;
`;

const Sidebar = styled.aside`
  width: ${({ $collapsed }) => ($collapsed ? "80px" : "260px")};
  background-color: #1f2937;
  color: white;
  padding: 24px 0;
  position: fixed;
  height: 100vh;
  overflow-y: auto;
  transition: width 0.3s ease;
  z-index: 100;
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    transform: ${({ isOpen }) => (isOpen ? "translateX(0)" : "translateX(-100%)")};
    width: 260px;
  }
`;

const SidebarHeader = styled.div`
  padding: 0 ${({ $collapsed }) => ($collapsed ? "16px" : "24px")} 24px;
  border-bottom: 1px solid #374151;
  margin-bottom: 24px;
  display: flex;
  justify-content: ${({ $collapsed }) => ($collapsed ? "center" : "flex-start")};
  align-items: center;
`;

const Logo = styled(Link)`
  font-size: ${({ $collapsed }) => ($collapsed ? "20px" : "24px")};
  font-weight: 700;
  color: #0ea5e9;
  font-family: "Manrope", sans-serif;
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Menu = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 ${({ $collapsed }) => ($collapsed ? "8px" : "16px")};
  flex: 1;
`;

const MenuItem = styled.div`
  position: relative;
`;

const MenuItemLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? "center" : "space-between")};
  gap: 12px;
  padding: 12px ${({ $collapsed }) => ($collapsed ? "8px" : "16px")};
  border-radius: 8px;
  color: ${({ $active }) => ($active ? "#0ea5e9" : "#9ca3af")};
  background-color: ${({ $active }) => ($active ? "#1e3a5f" : "transparent")};
  transition: all 0.2s ease;
  font-weight: ${({ $active }) => ($active ? "600" : "400")};
  text-decoration: none;
  position: relative;

  &:hover {
    background-color: #374151;
    color: white;
  }

  span {
    ${({ $collapsed }) => ($collapsed ? "display: none;" : "display: block;")}
  }
`;

const MenuItemTooltip = styled.div`
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  background-color: #1f2937;
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
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
  ${({ $collapsed }) => ($collapsed ? "display: none;" : "display: block;")}
`;

const SubMenu = styled.div`
  max-height: ${({ $isOpen }) => ($isOpen ? "500px" : "0")};
  overflow: hidden;
  transition: max-height 0.3s ease;
  margin-left: ${({ $collapsed }) => ($collapsed ? "0" : "16px")};
  border-left: ${({ $collapsed }) => ($collapsed ? "none" : "2px solid #374151")};
  padding-left: ${({ $collapsed }) => ($collapsed ? "0" : "8px")};
`;

const SubMenuItemLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px ${({ $collapsed }) => ($collapsed ? "8px" : "16px")};
  border-radius: 6px;
  color: ${({ $active }) => ($active ? "#0ea5e9" : "#9ca3af")};
  background-color: ${({ $active }) => ($active ? "#1e3a5f" : "transparent")};
  transition: all 0.2s ease;
  font-size: 14px;
  text-decoration: none;
  justify-content: ${({ $collapsed }) => ($collapsed ? "center" : "flex-start")};

  &:hover {
    background-color: #374151;
    color: white;
  }

  i {
    ${({ $collapsed }) => ($collapsed ? "display: block;" : "display: block;")}
  }

  span {
    ${({ $collapsed }) => ($collapsed ? "display: none;" : "display: block;")}
  }
`;

const SidebarFooter = styled.div`
  padding: 16px;
  border-top: 1px solid #374151;
  margin-top: auto;
  display: flex;
  justify-content: center;
`;

const CollapseButton = styled.button`
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 20px;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    background-color: #374151;
    color: white;
  }
`;

const Main = styled.main`
  flex: 1;
  margin-left: ${({ $sidebarCollapsed }) => ($sidebarCollapsed ? "80px" : "260px")};
  padding: 0;
  transition: margin-left 0.3s ease;

  @media (max-width: 768px) {
    margin-left: 0;
  }
`;

const TopBar = styled.div`
  background-color: white;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 50;
  gap: 24px;
`;

const SearchBar = styled.div`
  flex: 1;
  max-width: 600px;
  position: relative;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 16px 10px 44px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #1f2937;
  background: white;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const SearchIcon = styled.i`
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  font-size: 16px;
`;

const UserMenuWrapper = styled.div`
  position: relative;
`;

const UserMenuButton = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #f3f4f6;
  }
`;

const UserAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 16px;
  flex-shrink: 0;
`;

const UserName = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
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
    href: "/inventory",
    label: "Products",
    icon: "fas fa-shopping-bag",
    submenu: [
      { href: "/inventory", label: "Inventory" },
      { href: "/products/bulk-upload", label: "Bulk Product Upload" },
      { href: "/products/upload-templates", label: "Upload Templates" },
      { href: "/products/bulk-images", label: "Upload Images Bulk" },
      { href: "/products/bulk-videos", label: "Upload Videos Bulk" },
    ],
  },
  {
    href: "/orders",
    label: "Orders",
    icon: "fas fa-shopping-cart",
    submenu: [
      { href: "/orders", label: "Orders Dashboard" },
      { href: "/orders/reports", label: "Reports" },
      { href: "/orders/returns", label: "Returns" },
    ],
  },
  {
    href: "/advertise",
    label: "Advertise",
    icon: "fas fa-bullhorn",
    submenu: [
      { href: "/advertise/google", label: "Google Ads" },
      { href: "/advertise/meta", label: "Meta (Facebook/Instagram)" },
      { href: "/advertise/tiktok", label: "TikTok Ads" },
      { href: "/advertise/pinterest", label: "Pinterest Ads" },
    ],
  },
  {
    href: "/stores",
    label: "Stores",
    icon: "fas fa-store",
  },
  {
    href: "/brands",
    label: "Brands",
    icon: "fas fa-tag",
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: "fas fa-chart-line",
  },
  {
    href: "/apps",
    label: "Apps",
    icon: "fas fa-th",
  },
];

function DashboardLayoutContent({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState({});
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const userMenuRef = useRef(null);
  const sellerId = typeof window !== "undefined" ? localStorage.getItem("sellerId") : null;

  const { data: sellerData } = useQuery(GET_SELLER, {
    variables: { id: sellerId },
    skip: !sellerId,
  });

  const storeName = sellerData?.Sellers?.docs?.[0]?.storeName || "Seller Account";

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
      <Sidebar isOpen={sidebarOpen} $collapsed={sidebarCollapsed}>
        <SidebarHeader $collapsed={sidebarCollapsed}>
          <Logo href="/inventory" $collapsed={sidebarCollapsed}>
            {sidebarCollapsed ? "SC" : "Seller Central"}
          </Logo>
        </SidebarHeader>
        <Menu $collapsed={sidebarCollapsed}>
          {menuItems.map((item) => {
            const hasSubmenu = item.submenu && item.submenu.length > 0;
            const isItemActive = isActive(item.href);
            const isDropdownOpen = openDropdowns[item.href];

            return (
              <MenuItem key={item.href}>
                <MenuItemLink
                  href={item.href}
                  $active={isItemActive}
                  $collapsed={sidebarCollapsed}
                  onClick={(e) => handleMenuItemClick(e, item)}
                  onMouseEnter={(e) => {
                    if (sidebarCollapsed) {
                      const tooltip = e.currentTarget.querySelector('[data-tooltip]');
                      if (tooltip) tooltip.style.opacity = '1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (sidebarCollapsed) {
                      const tooltip = e.currentTarget.querySelector('[data-tooltip]');
                      if (tooltip) tooltip.style.opacity = '0';
                    }
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <i className={item.icon} style={{ fontSize: "18px", minWidth: "18px" }} />
                    <span>{item.label}</span>
                  </div>
                  {hasSubmenu && !sidebarCollapsed && (
                    <DropdownIcon className="fas fa-chevron-down" $isOpen={isDropdownOpen} />
                  )}
                  {sidebarCollapsed && (
                    <MenuItemTooltip data-tooltip>{item.label}</MenuItemTooltip>
                  )}
                </MenuItemLink>
                {hasSubmenu && (
                  <SubMenu $isOpen={isDropdownOpen} $collapsed={sidebarCollapsed}>
                    {item.submenu.map((subItem) => (
                      <SubMenuItemLink
                        key={subItem.href}
                        href={subItem.href}
                        $active={pathname === subItem.href}
                        $collapsed={sidebarCollapsed}
                        onMouseEnter={(e) => {
                          if (sidebarCollapsed) {
                            const tooltip = e.currentTarget.querySelector('[data-tooltip]');
                            if (tooltip) tooltip.style.opacity = '1';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (sidebarCollapsed) {
                            const tooltip = e.currentTarget.querySelector('[data-tooltip]');
                            if (tooltip) tooltip.style.opacity = '0';
                          }
                        }}
                      >
                        <i className="fas fa-circle" style={{ fontSize: "6px" }} />
                        <span>{subItem.label}</span>
                        {sidebarCollapsed && (
                          <MenuItemTooltip data-tooltip>{subItem.label}</MenuItemTooltip>
                        )}
                      </SubMenuItemLink>
                    ))}
                  </SubMenu>
                )}
              </MenuItem>
            );
          })}
        </Menu>
        <SidebarFooter>
          <CollapseButton
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i className={`fas fa-chevron-${sidebarCollapsed ? "right" : "left"}`} />
          </CollapseButton>
        </SidebarFooter>
      </Sidebar>
      <Main $sidebarCollapsed={sidebarCollapsed}>
        <TopBar>
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
              <i className="fas fa-chevron-down" style={{ fontSize: "12px", color: "#6b7280" }} />
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
        <ContentArea>{children}</ContentArea>
      </Main>
    </Container>
  );
}

export default function DashboardLayout({ children }) {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </ApolloProvider>
  );
}
