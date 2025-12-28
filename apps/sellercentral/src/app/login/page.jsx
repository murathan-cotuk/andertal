"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
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

const ErrorMessage = styled.div`
  background-color: #fee2e2;
  border: 1px solid #ef4444;
  border-radius: 8px;
  padding: 16px;
  color: #991b1b;
  font-size: 14px;
`;

const RegisterLink = styled(Link)`
  text-align: center;
  color: #0ea5e9;
  margin-top: 16px;
  display: block;
`;

export default function Login() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!formData.email || !formData.password) {
        setError("Email and password are required");
        setLoading(false);
        return;
      }

      // Basit authentication - production'da gerçek auth kullanılmalı
      // Şimdilik herhangi bir email/password ile giriş yapılabilir
      // Seller kontrolü giriş yapıldıktan sonra yapılacak
      localStorage.setItem("sellerEmail", formData.email);
      localStorage.setItem("sellerLoggedIn", "true");
      
      // Dashboard'a yönlendir
      router.push("/inventory");
    } catch (err) {
      console.error("Login error:", err);
      setError("An error occurred during login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <FormCard>
        <Title>Seller Login</Title>
        <Subtitle>Sign in to your seller account</Subtitle>
        
        <Form onSubmit={handleSubmit}>
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
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </Form>
        <RegisterLink href="/register">
          Don't have a seller account? Register here
        </RegisterLink>
      </FormCard>
    </Container>
  );
}
