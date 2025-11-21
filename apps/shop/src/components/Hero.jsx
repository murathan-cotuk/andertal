"use client";

import React from "react";
import styled from "styled-components";

const HeroSection = styled.section`
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  color: white;
  padding: 80px 24px;
  text-align: center;
`;

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 48px;
  font-weight: 700;
  margin-bottom: 24px;
  font-family: "Aeonik", sans-serif;
`;

const Subtitle = styled.p`
  font-size: 20px;
  margin-bottom: 32px;
  opacity: 0.9;
`;

export default function Hero() {
  return (
    <HeroSection>
      <Container>
        <Title>Welcome to Belucha</Title>
        <Subtitle>Discover amazing products from independent sellers</Subtitle>
      </Container>
    </HeroSection>
  );
}

