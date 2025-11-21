"use client";

import React, { useState } from "react";
import { useQuery, gql } from "@apollo/client";
import Link from "next/link";
import styled from "styled-components";
import { Card } from "@belucha/ui";

const GET_PRODUCTS = gql`
  query GetProducts($search: String, $category: String, $seller: String) {
    Products(limit: 12, where: {
      ...(($search) ? { title: { contains: $search } } : {}),
      ...(($category) ? { category: { equals: $category } } : {}),
      ...(($seller) ? { seller: { equals: $seller } } : {})
    }) {
      docs {
        id
        title
        slug
        price
        compareAtPrice
        images {
          image {
            url
            alt
          }
        }
        category {
          name
          id
        }
        seller {
          id
          storeName
        }
      }
    }
    Categories {
      docs {
        id
        name
      }
    }
    Sellers {
      docs {
        id
        storeName
      }
    }
  }
`;

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 48px 24px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
`;

const ProductCard = styled(Card)`
  overflow: hidden;
  padding: 0;
`;

const ImageWrapper = styled.div`
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  background-color: #f3f4f6;
`;

const ProductImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;

  ${ProductCard}:hover & {
    transform: scale(1.05);
  }
`;

const ProductInfo = styled.div`
  padding: 16px;
`;

const ProductTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1f2937;
`;

const SellerName = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 12px;
`;

const PriceContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Price = styled.span`
  font-size: 20px;
  font-weight: 700;
  color: #0ea5e9;
`;

const ComparePrice = styled.span`
  font-size: 16px;
  color: #9ca3af;
  text-decoration: line-through;
`;

const Loading = styled.div`
  text-align: center;
  padding: 48px;
  color: #6b7280;
`;

const Error = styled.div`
  text-align: center;
  padding: 48px;
  color: #ef4444;
`;

export default function ProductGrid() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [seller, setSeller] = useState("");

  const { data, loading, error, refetch } = useQuery(GET_PRODUCTS, {
    variables: { search, category, seller },
  });

  // Kategori ve satıcı seçenekleri için veriler
  const categories = data?.Categories?.docs || [];
  const sellers = data?.Sellers?.docs || [];

  // Filtre değiştiğinde ürünleri yeniden çek
  const handleFilterChange = (e, type) => {
    const value = e.target.value;
    if (type === "search") setSearch(value);
    if (type === "category") setCategory(value);
    if (type === "seller") setSeller(value);
    // refetch({ search, category, seller }); // Apollo otomatik güncelliyor
  };

  if (loading) return <Loading>Loading products...</Loading>;
  if (error) return <Error>Error loading products: {error.message}</Error>;

  return (
    <Container>
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Ürün ara..."
          value={search}
          onChange={e => handleFilterChange(e, "search")}
          style={{ padding: 8, borderRadius: 4, border: "1px solid #ccc", minWidth: 200 }}
        />
        <select
          value={category}
          onChange={e => handleFilterChange(e, "category")}
          style={{ padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
        >
          <option value="">Tüm Kategoriler</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <select
          value={seller}
          onChange={e => handleFilterChange(e, "seller")}
          style={{ padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
        >
          <option value="">Tüm Satıcılar</option>
          {sellers.map(sel => (
            <option key={sel.id} value={sel.id}>{sel.storeName}</option>
          ))}
        </select>
      </div>
      <Grid>
        {data?.Products?.docs?.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#888", padding: 32 }}>Ürün bulunamadı.</div>
        )}
        {data?.Products?.docs?.map((product) => (
          <Link key={product.id} href={`/product/${product.slug}`}>
            <ProductCard hover>
              <ImageWrapper>
                <ProductImage
                  src={
                    product.images?.[0]?.image?.url ||
                    "https://via.placeholder.com/400"
                  }
                  alt={product.images?.[0]?.image?.alt || product.title}
                />
              </ImageWrapper>
              <ProductInfo>
                <ProductTitle>{product.title}</ProductTitle>
                <SellerName>{product.seller?.storeName}</SellerName>
                <PriceContainer>
                  <Price>${product.price}</Price>
                  {product.compareAtPrice && (
                    <ComparePrice>${product.compareAtPrice}</ComparePrice>
                  )}
                </PriceContainer>
              </ProductInfo>
            </ProductCard>
          </Link>
        ))}
      </Grid>
    </Container>
  );
}

