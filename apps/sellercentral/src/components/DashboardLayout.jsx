"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  font-family: "Aeonik", sans-serif;
`;

const Menu = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px;
`;

const MenuItem = styled(Link)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  color: ${({ active }) => (active ? "#0ea5e9" : "#9ca3af")};
  background-color: ${({ active }) => (active ? "#1e3a5f" : "transparent")};
  transition: all 0.2s ease;
  font-weight: ${({ active }) => (active ? "600" : "400")};

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
  { href: "/", label: "Dashboard", icon: "fas fa-home" },
  { href: "/inventory", label: "Inventory", icon: "fas fa-boxes" },
  { href: "/media", label: "Media", icon: "fas fa-images" },
  { href: "/analytics", label: "Analytics", icon: "fas fa-chart-line" },
  { href: "/reports", label: "Reports", icon: "fas fa-file-alt" },
  { href: "/products", label: "Products", icon: "fas fa-shopping-bag" },
  { href: "/brand", label: "Brand", icon: "fas fa-tag" },
  { href: "/store", label: "Store", icon: "fas fa-store" },
  { href: "/apps", label: "Apps Marketplace", icon: "fas fa-th" },
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <Container>
      <Sidebar isOpen={sidebarOpen}>
        <SidebarHeader>
          <Logo href="/">Seller Central</Logo>
        </SidebarHeader>
        <Menu>
          {menuItems.map((item) => (
            <MenuItem
              key={item.href}
              href={item.href}
              active={pathname === item.href}
            >
              <i className={item.icon} />
              <span>{item.label}</span>
            </MenuItem>
          ))}
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

