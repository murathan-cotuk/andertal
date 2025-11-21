"use client";

import React, { useState } from "react";
import Link from "next/link";
import styled from "styled-components";
import { Button, Input, Card } from "@belucha/ui";

const Container = styled.div`
  min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8;
`;

const FormCard = styled(Card)`
  max-width: 500px;
  width: 100%;
  padding: 32px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 8px;
  color: #1f2937;
`;

const Subtitle = styled.p`
  text-align: center;
  color: #6b7280;
  margin-bottom: 32px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const InfoBox = styled.div`
  background-color: #f0f9ff;
  border: 1px solid #0ea5e9;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
`;

const InfoText = styled.p`
  font-size: 14px;
  color: #0369a1;
  margin-bottom: 8px;
`;

const LoginLink = styled(Link)`
  text-align: center;
  color: #0ea5e9;
  margin-top: 16px;
  display: block;
`;

export default function Register() {
  const [formData, setFormData] = useState({
    storeName: "",
    email: "",
    password: "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle registration
    console.log("Register:", formData);
  };

  return (
    <Container>
      <FormCard>
        <Title>Become a Seller</Title>
        <Subtitle>Join Belucha and start selling today</Subtitle>
        <InfoBox>
          <InfoText>
            <strong>Free Registration</strong>
          </InfoText>
          <InfoText>
            Sellers pay a 10% commission on each sale. No upfront fees, no
            monthly charges.
          </InfoText>
        </InfoBox>
        <Form onSubmit={handleSubmit}>
          <Input
            label="Store Name"
            type="text"
            value={formData.storeName}
            onChange={(e) =>
              setFormData({ ...formData, storeName: e.target.value })
            }
            required
          />
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            required
          />
          <Input
            label="Password"
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            required
          />
          <Button type="submit" fullWidth size="lg">
            Create Seller Account
          </Button>
        </Form>
        <LoginLink href="/login">Already have an account? Sign in</LoginLink>
      </FormCard>
    </Container>
  );
}

