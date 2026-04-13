"use client";

import React, { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { useCustomerAuth as useAuth } from "@belucha/lib";
import { getMedusaClient } from "@/lib/medusa-client";
import { useCart } from "@/context/CartContext";
import DropdownSearch from "@/components/DropdownSearch";

const Nav = styled.nav`
  background-color: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 16px 0;
  min-height: 56px;
  position: sticky;
  top: 0;
  z-index: 100;
  transform: translateZ(0);
  backface-visibility: hidden;
`;

const NavContainer = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 32px;
`;

const Logo = styled(Link)`
  font-size: 24px;
  font-weight: 700;
  color: #0ea5e9;
  font-family: "Manrope", sans-serif;
  letter-spacing: 0.05em;
`;

const SearchBar = styled.div`
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
  position: relative;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 12px 16px 12px 48px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
  }
`;

const SearchIcon = styled.i`
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7280;
`;

const CategoriesMenu = styled.div`
  display: flex;
  gap: 24px;
  align-items: center;
  flex-wrap: wrap;
`;

const CategoryLink = styled(Link)`
  color: #374151;
  font-weight: 500;
  transition: color 0.2s ease;
  text-decoration: none;

  &:hover {
    color: #0ea5e9;
  }
`;

const CategoryDropdown = styled.div`
  position: relative;
  display: inline-block;
`;

const CategoryButton = styled.button`
  color: #374151;
  font-weight: 500;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color 0.2s ease;

  &:hover {
    color: #0ea5e9;
  }
`;

const SubcategoryMenu = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  min-width: 200px;
  padding: 8px 0;
  z-index: 1000;
  display: ${props => props.$isOpen ? 'block' : 'none'};
`;

const SubcategoryLink = styled(Link)`
  display: block;
  padding: 8px 16px;
  color: #374151;
  text-decoration: none;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #f3f4f6;
    color: #0ea5e9;
  }
`;

const RightMenu = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
`;

const CartButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.2s ease;
  width: 40px;
  height: 40px;
  position: relative;

  &:hover {
    background-color: #f3f4f6;
  }
`;

const CartBadge = styled.span`
  position: absolute;
  top: 4px;
  right: 4px;
  background-color: #ef4444;
  color: white;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
`;

const ProfileMenu = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const ProfileButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.2s ease;
  width: 40px;
  height: 40px;

  &:hover {
    background-color: #f3f4f6;
  }
`;

const DropdownMenu = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  min-width: 200px;
  z-index: 1000;
  overflow: hidden;
  display: ${props => props.$isOpen ? 'block' : 'none'};
`;

const DropdownItem = styled(Link)`
  display: block;
  padding: 12px 16px;
  color: #374151;
  text-decoration: none;
  transition: background-color 0.2s ease;
  font-size: 14px;
  font-weight: 500;

  &:hover {
    background-color: #f3f4f6;
    color: #0ea5e9;
  }

  &:not(:last-child) {
    border-bottom: 1px solid #f3f4f6;
  }
`;

const DropdownButton = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: 12px 16px;
  color: #374151;
  text-decoration: none;
  transition: background-color 0.2s ease;
  font-size: 14px;
  font-weight: 500;
  border: none;
  background: transparent;
  cursor: pointer;

  &:hover {
    background-color: #f3f4f6;
    color: #0ea5e9;
  }

  &:not(:last-child) {
    border-bottom: 1px solid #f3f4f6;
  }
`;

const UserName = styled.div`
  padding: 12px 16px;
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid #f3f4f6;
`;

// link_type: 'url' | 'category' | 'collection' | ... → href; link_value may be JSON string
function slugify(s) {
  return (s || "")
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
function menuItemHref(item) {
  if (!item) return "#";
  const raw = item.link_value;
  let value = raw;
  let parsed = null;
  const itemSlug = String(item.slug || "").trim();
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try { parsed = JSON.parse(raw); } catch (_) {}
  }
  if (item.link_type === "page") {
    const labelSlug = itemSlug || parsed?.label_slug || slugify(item.label);
    return labelSlug ? `/${labelSlug}` : "#";
  }
  if (item.link_type === "api") {
    const fn = String(parsed?.function || parsed?.api_function || value || "").trim().toLowerCase();
    if (fn === "brand" || fn === "marke" || fn === "brands") return "/brands";
    if (fn === "sales") return "/sales";
    if (fn === "neuheiten") return "/neuheiten";
    if (fn === "bestsellers") return "/bestsellers";
    return "#";
  }
  if (parsed) {
    if (itemSlug) value = itemSlug;
    else if (parsed.handle) value = parsed.handle;
    else if (parsed.slug) value = parsed.slug;
  } else if (itemSlug) {
    value = itemSlug;
  }
  if (item.link_type === "url" && value) return String(value).startsWith("http") ? value : `/${String(value).replace(/^\//, "")}`;
  if ((item.link_type === "category" || item.link_type === "collection") && value) return `/kollektion/${value}`;
  if (item.link_type === "product" && value) return `/produkt/${value}`;
  return value ? `/${String(value).replace(/^\//, "")}` : "#";
}

export default function Navbar() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]); // { menu, items } from backend
  const [loading, setLoading] = useState(true);
  const [openCategoryId, setOpenCategoryId] = useState(null);
  const { isAuthenticated, user, logout } = useAuth();
  const { openCartSidebar, itemCount } = useCart();

  // Fetch store menus: prefer location "main" (navbar), else first menu; fallback to categories
  useEffect(() => {
    const fetchMenusAndCategories = async () => {
      try {
        setLoading(true);
        const client = getMedusaClient();
        const menuData = await client.getMenus();
        const menus = menuData.menus || [];
        // Only use a menu explicitly assigned to location "main"
        const mainMenu = menus.find((m) => m.location === "main") || null;
        if (mainMenu && mainMenu.items && mainMenu.items.length > 0) {
          // Menu has items → show them
          setMenuItems(mainMenu.items);
          setCategories([]);
          setLoading(false);
          return;
        }
        // No main menu assigned, OR menu is empty (with/without categories_with_products) → show categories
        const data = await client.getCategories({ tree: true, is_visible: true });
        setCategories(data.tree || data.categories || []);
        setMenuItems([]);
      } catch (error) {
        console.error("Failed to fetch menus/categories:", error);
        setMenuItems([]);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };
    fetchMenusAndCategories();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isDropdownOpen && !event.target.closest('[data-dropdown]')) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  return (
    <Nav>
      <NavContainer>
        <Logo href="/">Belucha</Logo>
        <SearchBar>
          <DropdownSearch
            placeholder="Search products..."
            hitsPerPage={5}
            attributes={{
              primaryText: "title",
              secondaryText: "description",
              url: "handle",
              image: "thumbnail",
            }}
          />
        </SearchBar>
        <CategoriesMenu>
          {loading ? (
            <span style={{ color: "#6b7280" }}>Loading...</span>
          ) : menuItems.length > 0 ? (
            menuItems.map((item) => (
              <CategoryLink key={item.id} href={menuItemHref(item)}>
                {item.label}
              </CategoryLink>
            ))
          ) : categories.length > 0 ? (
            categories.map((category) => (
              <CategoryLink key={category.id} href={`/kollektion/${category.slug}`}>
                {category.name}
              </CategoryLink>
            ))
          ) : null}
        </CategoriesMenu>
        <RightMenu>
          <ProfileMenu data-dropdown>
            <ProfileButton onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
              <i className="fas fa-user-circle" style={{ fontSize: "24px", color: "#374151" }} />
            </ProfileButton>
            <DropdownMenu $isOpen={isDropdownOpen}>
              {isAuthenticated ? (
                <>
                  {user && (
                    <UserName>
                      {user.firstName} {user.lastName}
                    </UserName>
                  )}
              <DropdownItem href="/account" onClick={() => setIsDropdownOpen(false)}>
                Übersicht
              </DropdownItem>
              <DropdownItem href="/orders" onClick={() => setIsDropdownOpen(false)}>
                Meine Bestellungen
              </DropdownItem>
              <DropdownItem href="/merkzettel" onClick={() => setIsDropdownOpen(false)}>
                Merkzettel
              </DropdownItem>
              <DropdownItem href="/addresses" onClick={() => setIsDropdownOpen(false)}>
                Adressen
              </DropdownItem>
              <DropdownItem href="/reviews" onClick={() => setIsDropdownOpen(false)}>
                Bewertungen
              </DropdownItem>
              <DropdownItem href="/bonus" onClick={() => setIsDropdownOpen(false)}>
                Bonuspunkte
              </DropdownItem>
                  <DropdownButton
                    onClick={() => {
                      logout();
                      setIsDropdownOpen(false);
                    }}
                  >
                    Abmelden
                  </DropdownButton>
                </>
              ) : (
                <>
              <DropdownItem href="/login" onClick={() => setIsDropdownOpen(false)}>
                Anmelden
              </DropdownItem>
                  <DropdownItem href="/register" onClick={() => setIsDropdownOpen(false)}>
                    Registrieren
                  </DropdownItem>
                </>
              )}
            </DropdownMenu>
          </ProfileMenu>
          <CartButton as="button" type="button" onClick={openCartSidebar} title="Warenkorb">
            <i className="fas fa-shopping-cart" style={{ fontSize: "20px", color: "#374151" }} />
            <CartBadge>{itemCount > 0 ? itemCount : 0}</CartBadge>
          </CartButton>
        </RightMenu>
      </NavContainer>
    </Nav>
  );
}

