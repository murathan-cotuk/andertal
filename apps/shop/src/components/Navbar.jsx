"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, gql } from "@apollo/client";
import styled from "styled-components";

const GET_CATEGORIES = gql`
  query GetCategories {
    Categories {
      docs {
        id
        name
        slug
      }
    }
  }
`;

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
  display: flex;
  align-items: center;
  gap: 32px;
`;

const Logo = styled(Link)`
  font-size: 24px;
  font-weight: 700;
  color: #0ea5e9;
  font-family: "Aeonik", sans-serif;
`;

const SearchBar = styled.div`
  flex: 1;
  max-width: 600px;
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
`;

const CategoryLink = styled(Link)`
  color: #374151;
  font-weight: 500;
  transition: color 0.2s ease;

  &:hover {
    color: #0ea5e9;
  }
`;

const ProfileMenu = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
`;

const ProfileButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #f3f4f6;
  }
`;

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data, loading } = useQuery(GET_CATEGORIES);

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
          {!loading &&
            data?.Categories?.docs?.slice(0, 5).map((category) => (
              <CategoryLink key={category.id} href={`/category/${category.slug}`}>
                {category.name}
              </CategoryLink>
            ))}
        </CategoriesMenu>
        <ProfileMenu>
          <ProfileButton>
            <i className="fas fa-user-circle" style={{ fontSize: "24px" }} />
            <span>Account</span>
          </ProfileButton>
        </ProfileMenu>
      </NavContainer>
    </Nav>
  );
}

