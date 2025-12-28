"use client";

import React, { useState } from "react";
import { useQuery, gql } from "@apollo/client";
import styled from "styled-components";
import { Card, Button } from "@belucha/ui";
import Link from "next/link";

const GET_PRODUCTS = gql`
  query GetProducts {
    Products(limit: 100) {
      docs {
        id
        title
        price
        inventory
        status
        slug
        images {
          url
          alt
        }
      }
    }
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
`;

const AddProductWrapper = styled.div`
  position: relative;
`;

const AddProductButton = styled(Button)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background-color: #0ea5e9;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: #0284c7;
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
  z-index: 100;
  overflow: hidden;
`;

const DropdownItem = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: white;
  color: #1f2937;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  text-align: left;

  &:hover {
    background-color: #f3f4f6;
  }

  &:not(:last-child) {
    border-bottom: 1px solid #e5e7eb;
  }

  i {
    color: #0ea5e9;
  }
`;

const Section = styled(Card)`
  padding: 24px;
  margin-bottom: 24px;
`;

const ProductsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 24px;
`;

const ProductCard = styled(Card)`
  padding: 20px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  }
`;

const ProductImage = styled.div`
  width: 100%;
  height: 200px;
  background-color: #f3f4f6;
  border-radius: 8px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 48px;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const ProductTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1f2937;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ProductInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
`;

const ProductPrice = styled.span`
  font-size: 20px;
  font-weight: 700;
  color: #0ea5e9;
`;

const ProductInventory = styled.span`
  font-size: 14px;
  color: #6b7280;
`;

const ProductStatus = styled.span`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  margin-top: 8px;
  background-color: ${({ status }) => {
    if (status === "published") return "#d1fae5";
    if (status === "draft") return "#fef3c7";
    return "#fee2e2";
  }};
  color: ${({ status }) => {
    if (status === "published") return "#065f46";
    if (status === "draft") return "#92400e";
    return "#991b1b";
  }};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #6b7280;
`;

const EmptyStateIcon = styled.div`
  font-size: 64px;
  color: #d1d5db;
  margin-bottom: 16px;
`;

const EmptyStateTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
`;

const EmptyStateText = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 24px;
`;

export default function InventoryPage() {
  const [showDropdown, setShowDropdown] = useState(false);
  const { data, loading, error } = useQuery(GET_PRODUCTS);

  const products = data?.Products?.docs || [];

  return (
    <Container>
      <Header>
        <Title>Inventory</Title>
        <AddProductWrapper>
          <AddProductButton onClick={() => setShowDropdown(!showDropdown)}>
            <i className="fas fa-plus" />
            Add Product
          </AddProductButton>
          {showDropdown && (
            <>
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 99,
                }}
                onClick={() => setShowDropdown(false)}
              />
              <DropdownMenu>
                <Link href="/products/single-upload" style={{ textDecoration: "none" }}>
                  <DropdownItem>
                    <i className="fas fa-plus-circle" />
                    Single Upload
                  </DropdownItem>
                </Link>
                <Link href="/products/bulk-upload" style={{ textDecoration: "none" }}>
                  <DropdownItem>
                    <i className="fas fa-upload" />
                    Bulk Upload
                  </DropdownItem>
                </Link>
              </DropdownMenu>
            </>
          )}
        </AddProductWrapper>
      </Header>

      <Section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937" }}>All Products</h2>
          <span style={{ fontSize: "14px", color: "#6b7280" }}>{products.length} products</span>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: "32px", color: "#0ea5e9" }} />
          </div>
        )}

        {error && (
          <div style={{ padding: "16px", backgroundColor: "#fee2e2", borderRadius: "8px", color: "#991b1b" }}>
            Error loading products: {error.message}
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <EmptyState>
            <EmptyStateIcon>
              <i className="fas fa-box-open" />
            </EmptyStateIcon>
            <EmptyStateTitle>No products yet</EmptyStateTitle>
            <EmptyStateText>Start by adding your first product to inventory</EmptyStateText>
            <Button onClick={() => setShowDropdown(true)}>
              <i className="fas fa-plus" style={{ marginRight: "8px" }} />
              Add Product
            </Button>
          </EmptyState>
        )}

        {!loading && !error && products.length > 0 && (
          <ProductsGrid>
            {products.map((product) => (
              <ProductCard key={product.id}>
                <ProductImage>
                  {product.images && product.images.length > 0 ? (
                    <img src={product.images[0].url} alt={product.images[0].alt || product.title} />
                  ) : (
                    <i className="fas fa-image" />
                  )}
                </ProductImage>
                <ProductTitle>{product.title}</ProductTitle>
                <ProductStatus status={product.status}>{product.status}</ProductStatus>
                <ProductInfo>
                  <ProductPrice>€{product.price?.toFixed(2) || "0.00"}</ProductPrice>
                  <ProductInventory>Stock: {product.inventory || 0}</ProductInventory>
                </ProductInfo>
              </ProductCard>
            ))}
          </ProductsGrid>
        )}
      </Section>
    </Container>
  );
}
