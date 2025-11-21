"use client";

import React from "react";
import { useQuery, gql } from "@apollo/client";
import styled from "styled-components";
import { Card } from "@belucha/ui";

const GET_PRODUCTS = gql`
  query GetProducts {
    Products(limit: 50) {
      docs {
        id
        title
        price
        inventory
        status
      }
    }
  }
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 32px;
  color: #1f2937;
`;

const Section = styled(Card)`
  padding: 24px;
  margin-bottom: 24px;
`;

export default function ProductsPage() {
  const { data, loading } = useQuery(GET_PRODUCTS);

  return (
    <Container>
      <Title>Products</Title>
      <Section>
        <h2>Manage your products</h2>
        <p>Total products: {data?.Products?.docs?.length || 0}</p>
      </Section>
    </Container>
  );
}

