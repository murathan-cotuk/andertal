"use client";

import React from "react";
import { useQuery, gql } from "@apollo/client";
import { useParams } from "next/navigation";
import Link from "next/link";
import styled from "styled-components";
import { Card } from "@belucha/ui";

const GET_CATEGORY = gql`
  query GetCategory($slug: String!) {
    Categories(where: { slug: { equals: $slug } }) {
      docs {
        id
        name
        description
        image {
          url
          alt
        }
      }
    }
  }
`;

const GET_CATEGORY_PRODUCTS = gql`
  query GetCategoryProducts($categorySlug: String!) {
    Products(where: { category: { slug: { equals: $categorySlug } } }) {
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
        seller {
          storeName
        }
      }
    }
  }
`;

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 48px 24px;
`;

const CategoryHeader = styled.div`
  text-align: center;
  margin-bottom: 48px;
`;

const CategoryImage = styled.img`
  width: 100%;
  max-width: 600px;
  height: 300px;
  object-fit: cover;
  border-radius: 12px;
  margin-bottom: 24px;
`;

const CategoryTitle = styled.h1`
  font-size: 48px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #1f2937;
`;

const CategoryDescription = styled.p`
  font-size: 18px;
  color: #6b7280;
  max-width: 800px;
  margin: 0 auto;
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

export default function CategoryTemplate() {
  const params = useParams();
  const slug = params?.slug;

  const { data: categoryData, loading: categoryLoading } = useQuery(
    GET_CATEGORY,
    {
      variables: { slug },
    }
  );

  const { data: productsData, loading: productsLoading } = useQuery(
    GET_CATEGORY_PRODUCTS,
    {
      variables: { categorySlug: slug },
    }
  );

  if (categoryLoading || productsLoading) {
    return <Container>Loading...</Container>;
  }

  const category = categoryData?.Categories?.docs?.[0];
  const products = productsData?.Products?.docs || [];

  return (
    <Container>
      {category && (
        <CategoryHeader>
          {category.image && (
            <CategoryImage
              src={category.image.url}
              alt={category.image.alt || category.name}
            />
          )}
          <CategoryTitle>{category.name}</CategoryTitle>
          {category.description && (
            <CategoryDescription>{category.description}</CategoryDescription>
          )}
        </CategoryHeader>
      )}
      <Grid>
        {products.map((product) => (
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

