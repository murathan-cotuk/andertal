"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styled from "styled-components";
import { useMutation, gql } from "@apollo/client";
import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
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

const ErrorMessage = styled.p`
  color: #ef4444;
  font-size: 14px;
  margin-top: -8px;
`;

const SuccessMessage = styled.p`
  color: #10b981;
  font-size: 14px;
  margin-top: -8px;
`;

const CREATE_SELLER = gql`
  mutation CreateSeller($data: JSON!) {
    createSellers(data: $data) {
      id
      storeName
      slug
    }
  }
`;

function RegisterForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    storeName: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [createSeller, { loading }] = useMutation(CREATE_SELLER);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      // Slug oluştur
      const slug = formData.storeName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

      const sellerData = {
        storeName: formData.storeName,
        slug: slug,
        status: "pending",
      };

      const result = await createSeller({
        variables: {
          data: sellerData,
        },
      });

      if (result.data?.createSellers) {
        setSuccess("Seller account created successfully! Redirecting to login...");
        // localStorage'a kaydet
        localStorage.setItem("sellerEmail", formData.email);
        localStorage.setItem("sellerId", result.data.createSellers.id);
        
        // 2 saniye sonra login sayfasına yönlendir
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      }
    } catch (err) {
      console.error("Registration error:", err);
      setError(err.message || "Registration failed. Please try again.");
    }
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
            label="Store Name *"
            type="text"
            value={formData.storeName}
            onChange={(e) =>
              setFormData({ ...formData, storeName: e.target.value })
            }
            required
          />
          <Input
            label="Email *"
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            required
          />
          <Input
            label="Password *"
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            required
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          {success && <SuccessMessage>{success}</SuccessMessage>}
          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? "Creating Account..." : "Create Seller Account"}
          </Button>
        </Form>
        <LoginLink href="/login">Already have an account? Sign in</LoginLink>
      </FormCard>
    </Container>
  );
}

export default function Register() {
  return (
    <ApolloProvider client={apolloClient}>
      <RegisterForm />
    </ApolloProvider>
  );
}

