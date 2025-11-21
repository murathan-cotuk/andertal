"use client";

import React from "react";
import { useQuery, gql } from "@apollo/client";
import { useParams } from "next/navigation";
import styled from "styled-components";
import { Button, Card } from "@belucha/ui";

const GET_PRODUCT = gql`
  query GetProduct($slug: String!) {
    Products(where: { slug: { equals: $slug } }) {
      docs {
        id
        title
        description
        price
        compareAtPrice
        inventory
        images {
          image {
            url
            alt
          }
        }
        seller {
          id
          storeName
          slug
        }
        category {
          name
          slug
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

const ProductContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  margin-bottom: 48px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ImageGallery = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const MainImage = styled.img`
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 12px;
  background-color: #f3f4f6;
`;

const Thumbnails = styled.div`
  display: flex;
  gap: 12px;
  overflow-x: auto;
`;

const Thumbnail = styled.img`
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.2s ease;

  &:hover {
    border-color: #0ea5e9;
  }
`;

const ProductInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  color: #1f2937;
`;

const PriceContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const Price = styled.span`
  font-size: 36px;
  font-weight: 700;
  color: #0ea5e9;
`;

const ComparePrice = styled.span`
  font-size: 24px;
  color: #9ca3af;
  text-decoration: line-through;
`;

const Description = styled.div`
  color: #4b5563;
  line-height: 1.6;
`;

const Actions = styled.div`
  display: flex;
  gap: 16px;
  margin-top: 24px;
`;

const SellerInfo = styled(Card)`
  margin-top: 24px;
`;

export default function ProductTemplate() {
  const params = useParams();
  const slug = params?.slug;
  const [selectedImage, setSelectedImage] = React.useState(0);

  const { data, loading, error } = useQuery(GET_PRODUCT, {
    variables: { slug },
  });

  if (loading) return <Container>Loading...</Container>;
  if (error) return <Container>Error: {error.message}</Container>;

  const product = data?.Products?.docs?.[0];
  if (!product) return <Container>Product not found</Container>;

  const images = product.images || [];
  const mainImage = images[selectedImage]?.image?.url || "https://via.placeholder.com/600";

  return (
    <Container>
      <ProductContainer>
        <ImageGallery>
          <MainImage src={mainImage} alt={product.title} />
          {images.length > 1 && (
            <Thumbnails>
              {images.map((img, index) => (
                <Thumbnail
                  key={index}
                  src={img.image?.url || "https://via.placeholder.com/80"}
                  alt={img.image?.alt || product.title}
                  onClick={() => setSelectedImage(index)}
                />
              ))}
            </Thumbnails>
          )}
        </ImageGallery>
        <ProductInfo>
          <Title>{product.title}</Title>
          <PriceContainer>
            <Price>${product.price}</Price>
            {product.compareAtPrice && (
              <ComparePrice>${product.compareAtPrice}</ComparePrice>
            )}
          </PriceContainer>
          <Description
            dangerouslySetInnerHTML={{ __html: product.description || "" }}
          />
          <Actions>
            <Button size="lg" fullWidth>
              Add to Cart
            </Button>
            <Button size="lg" variant="outline" fullWidth>
              Buy Now
            </Button>
          </Actions>
          <SellerInfo>
            <p>
              <strong>Sold by:</strong> {product.seller?.storeName}
            </p>
            <p>
              <strong>Category:</strong> {product.category?.[0]?.name}
            </p>
            <p>
              <strong>Stock:</strong> {product.inventory} available
            </p>
          </SellerInfo>
        </ProductInfo>
      </ProductContainer>
    </Container>
  );
}

