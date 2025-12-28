"use client";

import React from "react";
import styled from "styled-components";
import { Card, Button } from "@belucha/ui";

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

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  }
`;

const TemplateIcon = styled.div`
  font-size: 48px;
  color: #0ea5e9;
  margin-bottom: 16px;
`;

const TemplateTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
`;

const TemplateDescription = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 16px;
  line-height: 1.6;
`;

const downloadTemplate = (type) => {
  const templates = {
    products: {
      headers: [
        "Title",
        "Slug",
        "Description",
        "Price",
        "Inventory",
        "Status",
        "Category",
        "Brand",
        "SKU",
      ],
      filename: "product-upload-template.csv",
    },
    images: {
      headers: ["Product Slug", "Image URL 1", "Image URL 2", "Image URL 3"],
      filename: "bulk-images-template.csv",
    },
    videos: {
      headers: ["Product Slug", "Video URL", "Thumbnail URL"],
      filename: "bulk-videos-template.csv",
    },
  };

  const template = templates[type];
  const csvContent = template.headers.join(",");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", template.filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function UploadTemplatesPage() {
  return (
    <Container>
      <Title>Upload Templates</Title>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Available Templates
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "24px" }}>
          Download templates to ensure your data is formatted correctly for bulk uploads
        </p>

        <TemplateGrid>
          <TemplateCard>
            <TemplateIcon>
              <i className="fas fa-file-csv" />
            </TemplateIcon>
            <TemplateTitle>Product Upload Template</TemplateTitle>
            <TemplateDescription>
              Use this template for bulk product uploads. Includes all required fields and formatting guidelines.
            </TemplateDescription>
            <Button onClick={() => downloadTemplate("products")} fullWidth>
              <i className="fas fa-download" style={{ marginRight: "8px" }} />
              Download Template
            </Button>
          </TemplateCard>

          <TemplateCard>
            <TemplateIcon>
              <i className="fas fa-images" />
            </TemplateIcon>
            <TemplateTitle>Bulk Images Template</TemplateTitle>
            <TemplateDescription>
              Template for uploading multiple product images at once. Link images to products by slug.
            </TemplateDescription>
            <Button onClick={() => downloadTemplate("images")} fullWidth>
              <i className="fas fa-download" style={{ marginRight: "8px" }} />
              Download Template
            </Button>
          </TemplateCard>

          <TemplateCard>
            <TemplateIcon>
              <i className="fas fa-video" />
            </TemplateIcon>
            <TemplateTitle>Bulk Videos Template</TemplateTitle>
            <TemplateDescription>
              Template for uploading product videos. Include video URLs and thumbnail images.
            </TemplateDescription>
            <Button onClick={() => downloadTemplate("videos")} fullWidth>
              <i className="fas fa-download" style={{ marginRight: "8px" }} />
              Download Template
            </Button>
          </TemplateCard>
        </TemplateGrid>
      </Section>
    </Container>
  );
}

