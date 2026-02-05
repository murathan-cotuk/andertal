"use client";

import React, { useState } from "react";
// GraphQL removed - will migrate to Medusa REST API
import styled from "styled-components";
import { Card, Button, Input } from "@belucha/ui";

const GET_BRANDS = gql`
  query GetBrands {
    Brands(limit: 50) {
      docs {
        id
        name
        slug
        description
        logo {
          url
        }
      }
    }
  }
`;

const CREATE_BRAND = gql`
  mutation CreateBrand($data: JSON!) {
    createBrands(data: $data) {
      id
      name
      slug
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

const BrandsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
  margin-top: 24px;
`;

const BrandCard = styled(Card)`
  padding: 20px;
  text-align: center;
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-4px);
  }
`;

const BrandLogo = styled.div`
  width: 80px;
  height: 80px;
  margin: 0 auto 16px;
  border-radius: 50%;
  background-color: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: #0ea5e9;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const BrandName = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
`;

export default function BrandPage() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
  });
  const [message, setMessage] = useState({ type: "", text: "" });

  const { data, loading, refetch } = useQuery(GET_BRANDS);
  const [createBrand, { loading: creating }] = useMutation(CREATE_BRAND);

  const brands = data?.Brands?.docs || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    try {
      const slug = formData.slug || formData.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

      await createBrand({
        variables: {
          data: {
            name: formData.name,
            slug: slug,
            description: formData.description || "",
          },
        },
      });

      setMessage({ type: "success", text: "Brand created successfully!" });
      setFormData({ name: "", slug: "", description: "" });
      setShowForm(false);
      refetch();
    } catch (error) {
      console.error("Error creating brand:", error);
      setMessage({ type: "error", text: error.message || "An error occurred while creating the brand" });
    }
  };

  return (
    <Container>
      <Title>Brand Management</Title>

      {message.text && (
        <div
          style={{
            padding: "16px",
            marginBottom: "24px",
            borderRadius: "8px",
            backgroundColor: message.type === "success" ? "#d1fae5" : "#fee2e2",
            color: message.type === "success" ? "#065f46" : "#991b1b",
          }}
        >
          {message.text}
        </div>
      )}

      <Section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937" }}>Your Brands</h2>
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Add New Brand"}
          </Button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Input
              label="Brand Name *"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="Slug (auto-generated if empty)"
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            />
            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "8px",
                  minHeight: "100px",
                }}
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Brand"}
            </Button>
          </form>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: "32px", color: "#0ea5e9" }} />
          </div>
        ) : brands.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7280" }}>
            <i className="fas fa-tag" style={{ fontSize: "48px", marginBottom: "16px", color: "#d1d5db" }} />
            <p>No brands yet. Create your first brand to get started.</p>
          </div>
        ) : (
          <BrandsGrid>
            {brands.map((brand) => (
              <BrandCard key={brand.id}>
                <BrandLogo>
                  {brand.logo?.url ? (
                    <img src={brand.logo.url} alt={brand.name} />
                  ) : (
                    <i className="fas fa-tag" />
                  )}
                </BrandLogo>
                <BrandName>{brand.name}</BrandName>
                {brand.description && (
                  <p style={{ fontSize: "14px", color: "#6b7280" }}>{brand.description}</p>
                )}
              </BrandCard>
            ))}
          </BrandsGrid>
        )}
      </Section>
    </Container>
  );
}
