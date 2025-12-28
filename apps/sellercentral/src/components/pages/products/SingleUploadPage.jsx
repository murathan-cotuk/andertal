"use client";

import React, { useState } from "react";
import { useMutation, useQuery, gql } from "@apollo/client";
import styled from "styled-components";
import { Card, Button, Input } from "@belucha/ui";

const CREATE_PRODUCT = gql`
  mutation CreateProduct($data: JSON!) {
    createProducts(data: $data) {
      id
      title
      price
      inventory
      status
    }
  }
`;

const GET_SELLERS = gql`
  query GetSellers {
    Sellers(limit: 10) {
      docs {
        id
        storeName
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

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const Label = styled.label`
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
`;

const Select = styled.select`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  color: #1f2937;
  background: white;
  transition: all 0.2s ease;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  color: #1f2937;
  background: white;
  transition: all 0.2s ease;
  box-sizing: border-box;
  min-height: 120px;
  font-family: inherit;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
  }
`;

const SuccessMessage = styled.div`
  background-color: #d1fae5;
  border: 1px solid #10b981;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  color: #065f46;
`;

const ErrorMessage = styled.div`
  background-color: #fee2e2;
  border: 1px solid #ef4444;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  color: #991b1b;
`;

export default function SingleUploadPage() {
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    description: "",
    price: "",
    inventory: "",
    status: "draft",
    seller: "",
  });
  const [message, setMessage] = useState({ type: "", text: "" });

  const { data: sellersData } = useQuery(GET_SELLERS);
  const [createProduct, { loading: creating }] = useMutation(CREATE_PRODUCT);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    try {
      const slug = formData.slug || formData.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

      let sellerId = formData.seller;
      if (!sellerId && sellersData?.Sellers?.docs?.length > 0) {
        sellerId = sellersData.Sellers.docs[0].id;
      }

      if (!sellerId) {
        setMessage({ type: "error", text: "Please create a seller account first" });
        return;
      }

      const productData = {
        title: formData.title,
        slug: slug,
        description: formData.description || "",
        price: parseFloat(formData.price),
        inventory: parseInt(formData.inventory) || 0,
        status: formData.status,
        seller: sellerId,
      };

      await createProduct({
        variables: {
          data: productData,
        },
      });

      setMessage({ type: "success", text: "Product created successfully!" });
      setFormData({
        title: "",
        slug: "",
        description: "",
        price: "",
        inventory: "",
        status: "draft",
        seller: sellerId,
      });
    } catch (error) {
      console.error("Error creating product:", error);
      setMessage({
        type: "error",
        text: error.message || "An error occurred while creating the product",
      });
    }
  };

  const sellers = sellersData?.Sellers?.docs || [];

  return (
    <Container>
      <Title>Single Product Upload</Title>

      {message.text && (
        <>
          {message.type === "success" ? (
            <SuccessMessage>{message.text}</SuccessMessage>
          ) : (
            <ErrorMessage>{message.text}</ErrorMessage>
          )}
        </>
      )}

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "24px" }}>
          Add New Product
        </h2>

        <Form onSubmit={handleSubmit}>
          <Input
            label="Product Title *"
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />

          <Input
            label="Slug (auto-generated if empty)"
            type="text"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            placeholder="product-slug"
          />

          <div>
            <Label>Description</Label>
            <TextArea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Product description..."
            />
          </div>

          <FormRow>
            <Input
              label="Price (€) *"
              type="number"
              step="0.01"
              min="0"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              required
            />

            <Input
              label="Inventory *"
              type="number"
              min="0"
              value={formData.inventory}
              onChange={(e) => setFormData({ ...formData, inventory: e.target.value })}
              required
            />
          </FormRow>

          <FormRow>
            <div>
              <Label>Status *</Label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </div>

            {sellers.length > 0 && (
              <div>
                <Label>Seller</Label>
                <Select
                  value={formData.seller || sellers[0]?.id || ""}
                  onChange={(e) => setFormData({ ...formData, seller: e.target.value })}
                >
                  {sellers.map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {seller.storeName}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </FormRow>

          <Button type="submit" fullWidth disabled={creating}>
            {creating ? "Creating..." : "Create Product"}
          </Button>
        </Form>
      </Section>
    </Container>
  );
}

