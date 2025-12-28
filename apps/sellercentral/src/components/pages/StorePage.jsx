"use client";

import React, { useState } from "react";
import styled from "styled-components";
import { Card, Button, Input } from "@belucha/ui";

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

const TemplateGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 24px;
`;

const TemplateCard = styled(Card)`
  padding: 24px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
  border: 2px solid ${({ $selected }) => ($selected ? "#0ea5e9" : "#e5e7eb")};

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  }
`;

const TemplatePreview = styled.div`
  width: 100%;
  height: 200px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 48px;
`;

const TemplateTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
`;

const TemplateDescription = styled.p`
  font-size: 14px;
  color: #6b7280;
`;

export default function StorePage() {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");

  const templates = [
    {
      id: "modern",
      name: "Modern Store",
      description: "Clean and contemporary design with focus on product showcase",
      icon: "fas fa-store",
    },
    {
      id: "classic",
      name: "Classic Store",
      description: "Traditional layout with emphasis on brand storytelling",
      icon: "fas fa-building",
    },
    {
      id: "minimal",
      name: "Minimal Store",
      description: "Simple and elegant design with minimal distractions",
      icon: "fas fa-gem",
    },
  ];

  return (
    <Container>
      <Title>Create Your Store</Title>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Store Information
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "500px" }}>
          <Input
            label="Store Name *"
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="My Awesome Store"
          />
          <Input
            label="Store URL Slug *"
            type="text"
            value={storeSlug}
            onChange={(e) => setStoreSlug(e.target.value)}
            placeholder="my-awesome-store"
          />
        </div>
      </Section>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Choose a Template
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "24px" }}>
          Select a template for your store landing page (similar to Amazon Stores)
        </p>

        <TemplateGrid>
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              $selected={selectedTemplate === template.id}
              onClick={() => setSelectedTemplate(template.id)}
            >
              <TemplatePreview>
                <i className={template.icon} />
              </TemplatePreview>
              <TemplateTitle>{template.name}</TemplateTitle>
              <TemplateDescription>{template.description}</TemplateDescription>
            </TemplateCard>
          ))}
        </TemplateGrid>

        {selectedTemplate && (
          <div style={{ marginTop: "24px" }}>
            <Button>
              <i className="fas fa-check" style={{ marginRight: "8px" }} />
              Create Store with {templates.find((t) => t.id === selectedTemplate)?.name} Template
            </Button>
          </div>
        )}
      </Section>
    </Container>
  );
}
