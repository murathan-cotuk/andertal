"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styled from "styled-components";

const Container = styled.div`
  display: flex;
  min-h-screen;
  background-color: #f9fafb;
`;

const Sidebar = styled.aside`
  width: 260px;
  background-color: #1f2937;
  color: white;
  padding: 24px 0;
  position: fixed;
  height: 100vh;
  overflow-y: auto;
  transition: transform 0.3s ease;
  z-index: 100;

  @media (max-width: 768px) {
    transform: ${({ isOpen }) => (isOpen ? "translateX(0)" : "translateX(-100%)")};
  }
`;

const SidebarHeader = styled.div`
  padding: 0 24px 24px;
  border-bottom: 1px solid #374151;
  margin-bottom: 24px;
`;

const Logo = styled(Link)`
  font-size: 24px;
  font-weight: 700;
  color: #0ea5e9;
  font-family: "Manrope", sans-serif;
  text-decoration: none;
`;

const Menu = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 16px;
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
  color: ${({ $active }) => ($active ? "#0ea5e9" : "#9ca3af")};
  background-color: ${({ $active }) => ($active ? "#1e3a5f" : "transparent")};
  transition: all 0.2s ease;
  font-weight: ${({ $active }) => ($active ? "600" : "400")};
  text-decoration: none;

  &:hover {
    background-color: #374151;
    color: white;
  }
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
  border-left: 2px solid #374151;
  padding-left: 8px;
`;

const SubMenuItemLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 6px;
  color: ${({ $active }) => ($active ? "#0ea5e9" : "#9ca3af")};
  background-color: ${({ $active }) => ($active ? "#1e3a5f" : "transparent")};
  transition: all 0.2s ease;
  font-size: 14px;
  text-decoration: none;

  &:hover {
    background-color: #374151;
    color: white;
  }
`;

const Main = styled.main`
  flex: 1;
  margin-left: 260px;
  padding: 24px;

  @media (max-width: 768px) {
    margin-left: 0;
  }
`;

const TopBar = styled.div`
  background-color: white;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 50;
`;

const MenuToggle = styled.button`
  display: none;
  background: none;
  border: none;
  color: #374151;
  font-size: 24px;
  cursor: pointer;

  @media (max-width: 768px) {
    display: block;
  }
`;

const UserMenu = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
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

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState({});

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

  return (
    <Container>
      <Sidebar isOpen={sidebarOpen}>
        <SidebarHeader>
          <Logo href="/inventory">Seller Central</Logo>
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
                    <i className={item.icon} />
                    <span>{item.label}</span>
                  </div>
                  {hasSubmenu && <DropdownIcon className="fas fa-chevron-down" $isOpen={isDropdownOpen} />}
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
        <TopBar>
          <MenuToggle onClick={() => setSidebarOpen(!sidebarOpen)}>
            <i className="fas fa-bars" />
          </MenuToggle>
          <UserMenu>
            <span>Seller Account</span>
            <i className="fas fa-user-circle" style={{ fontSize: "24px" }} />
          </UserMenu>
        </TopBar>
        {children}
      </Main>
    </Container>
  );
}
