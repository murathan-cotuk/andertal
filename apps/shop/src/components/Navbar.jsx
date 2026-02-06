"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import styled from "styled-components";
import { useCustomerAuth as useAuth } from "@belucha/lib";
import { getMedusaClient } from "@/lib/medusa-client";

const Nav = styled.nav`
  background-color: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 16px 0;
  position: sticky;
  top: 0;
  z-index: 100;
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

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openCategoryId, setOpenCategoryId] = useState(null);
  const { isAuthenticated, user, logout } = useAuth();

  // Fetch category tree via client only
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        const client = getMedusaClient();
        const data = await client.getCategories({ tree: true, is_visible: true });
        setCategories(data.tree || data.categories || []);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
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
          <SearchIcon className="fas fa-search" />
          <SearchInput
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </SearchBar>
        <CategoriesMenu>
          {loading ? (
            <span style={{ color: "#6b7280" }}>Loading...</span>
          ) : categories.length > 0 ? (
            categories.map((category) => {
              const hasChildren = category.children && category.children.length > 0;
              const hasCollection = category.has_collection;
              
              if (hasChildren) {
                return (
                  <CategoryDropdown
                    key={category.id}
                    onMouseEnter={() => setOpenCategoryId(category.id)}
                    onMouseLeave={() => setOpenCategoryId(null)}
                  >
                    <CategoryButton>{category.name}</CategoryButton>
                    <SubcategoryMenu $isOpen={openCategoryId === category.id}>
                      {hasCollection && (
                        <SubcategoryLink href={`/collections/${category.slug}`}>
                          {category.name} (All)
                        </SubcategoryLink>
                      )}
                      {category.children.map((child) => (
                        <SubcategoryLink
                          key={child.id}
                          href={child.has_collection ? `/collections/${child.slug}` : '#'}
                        >
                          {child.name}
                        </SubcategoryLink>
                      ))}
                    </SubcategoryMenu>
                  </CategoryDropdown>
                );
              } else if (hasCollection) {
                return (
                  <CategoryLink key={category.id} href={`/collections/${category.slug}`}>
                    {category.name}
                  </CategoryLink>
                );
              }
              return null;
            })
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
                Konto
              </DropdownItem>
              <DropdownItem href="/favorites" onClick={() => setIsDropdownOpen(false)}>
                Merkzettel
              </DropdownItem>
              <DropdownItem href="/orders" onClick={() => setIsDropdownOpen(false)}>
                Bestellungen
              </DropdownItem>
              <DropdownItem href="/invoices" onClick={() => setIsDropdownOpen(false)}>
                Rechnungen
              </DropdownItem>
              <DropdownItem href="/help" onClick={() => setIsDropdownOpen(false)}>
                Hilfe
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
                  <DropdownItem href="/help" onClick={() => setIsDropdownOpen(false)}>
                    Hilfe
                  </DropdownItem>
                </>
              )}
            </DropdownMenu>
          </ProfileMenu>
          <Link href="/cart">
            <CartButton>
              <i className="fas fa-shopping-cart" style={{ fontSize: "20px", color: "#374151" }} />
              <CartBadge>0</CartBadge>
            </CartButton>
          </Link>
        </RightMenu>
      </NavContainer>
    </Nav>
  );
}

