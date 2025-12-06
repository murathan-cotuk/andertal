"use client";

import React from "react";
import Link from "next/link";
import styled from "styled-components";

const FooterContainer = styled.footer`
  background-color: #1f2937;
  color: white;
  padding: 48px 0 24px;
  margin-top: auto;
`;

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 32px;
  margin-bottom: 32px;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
`;

const FooterLink = styled(Link)`
  color: #9ca3af;
  transition: color 0.2s ease;

  &:hover {
    color: white;
  }
`;

const Bottom = styled.div`
  border-top: 1px solid #374151;
  padding-top: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const Copyright = styled.p`
  color: #9ca3af;
  font-size: 14px;
`;

const SellerLink = styled(Link)`
  color: #0ea5e9;
  font-weight: 600;
  transition: color 0.2s ease;

  &:hover {
    color: #38bdf8;
  }
`;

export default function Footer() {
  return (
    <FooterContainer>
      <Container>
        <Grid>
          <Column>
            <Title>Shop</Title>
            <FooterLink href="/">All Products</FooterLink>
            <FooterLink href="/?filter=bestsellers">Bestsellers</FooterLink>
            <FooterLink href="/?filter=sale">On Sale</FooterLink>
          </Column>
          <Column>
            <Title>About</Title>
            <FooterLink href="/about">About Us</FooterLink>
            <FooterLink href="/contact">Contact</FooterLink>
            <FooterLink href="/faq">FAQ</FooterLink>
          </Column>
          <Column>
            <Title>Legal</Title>
            <FooterLink href="/privacy">Privacy Policy</FooterLink>
            <FooterLink href="/terms">Terms of Service</FooterLink>
            <FooterLink href="/returns">Returns</FooterLink>
          </Column>
          <Column>
            <Title>Sell on Belucha</Title>
            <SellerLink href="http://localhost:3002/register">
              Become a Seller
            </SellerLink>
            <FooterLink href="http://localhost:3002">Seller Central</FooterLink>
          </Column>
        </Grid>
        <Bottom>
          <Copyright>© 2025 Belucha. All rights reserved.</Copyright>
        </Bottom>
      </Container>
    </FooterContainer>
  );
}

