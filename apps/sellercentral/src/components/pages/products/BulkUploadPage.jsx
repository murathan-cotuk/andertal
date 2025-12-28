"use client";

import React, { useState } from "react";
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

const UploadArea = styled.div`
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  padding: 60px 20px;
  text-align: center;
  background-color: #f9fafb;
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    border-color: #0ea5e9;
    background-color: #f0f9ff;
  }

  ${({ $isDragging }) =>
    $isDragging &&
    `
    border-color: #0ea5e9;
    background-color: #f0f9ff;
  `}
`;

const UploadIcon = styled.div`
  font-size: 48px;
  color: #0ea5e9;
  margin-bottom: 16px;
`;

const UploadText = styled.p`
  font-size: 16px;
  color: #6b7280;
  margin-bottom: 8px;
`;

const UploadHint = styled.p`
  font-size: 14px;
  color: #9ca3af;
`;

const TemplateSection = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background-color: #f3f4f6;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const TemplateInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const TemplateIcon = styled.div`
  font-size: 24px;
  color: #0ea5e9;
`;

const TemplateText = styled.div`
  h3 {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 4px 0;
  }
  p {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }
`;

const downloadTemplate = () => {
  // Create Excel template structure
  const templateData = {
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
      "Weight",
      "Dimensions",
      "Image URL 1",
      "Image URL 2",
      "Image URL 3",
    ],
    sampleRow: [
      "Sample Product",
      "sample-product",
      "This is a sample product description",
      "29.99",
      "100",
      "published",
      "Electronics",
      "Sample Brand",
      "SKU-001",
      "0.5",
      "10x10x5",
      "https://example.com/image1.jpg",
      "https://example.com/image2.jpg",
      "https://example.com/image3.jpg",
    ],
  };

  // Convert to CSV format
  const csvContent = [
    templateData.headers.join(","),
    templateData.sampleRow.join(","),
  ].join("\n");

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "product-bulk-upload-template.csv");
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function BulkUploadPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.type === "text/csv" || file.name.endsWith(".csv"))) {
      setUploadedFile(file);
      setUploadStatus("File ready for upload");
    } else {
      setUploadStatus("Please upload a CSV file");
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && (file.type === "text/csv" || file.name.endsWith(".csv"))) {
      setUploadedFile(file);
      setUploadStatus("File ready for upload");
    } else {
      setUploadStatus("Please upload a CSV file");
    }
  };

  const handleUpload = async () => {
    if (!uploadedFile) {
      setUploadStatus("Please select a file first");
      return;
    }

    setUploadStatus("Uploading...");
    // TODO: Implement actual upload logic with GraphQL mutation
    setTimeout(() => {
      setUploadStatus("Upload successful! Processing products...");
    }, 2000);
  };

  return (
    <Container>
      <Title>Bulk Product Upload</Title>

      <Section>
        <TemplateSection>
          <TemplateInfo>
            <TemplateIcon>
              <i className="fas fa-file-excel" />
            </TemplateIcon>
            <TemplateText>
              <h3>Download Excel Template</h3>
              <p>Use our template to ensure your product data is formatted correctly</p>
            </TemplateText>
          </TemplateInfo>
          <Button onClick={downloadTemplate}>
            <i className="fas fa-download" style={{ marginRight: "8px" }} />
            Download Template
          </Button>
        </TemplateSection>

        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Upload Products CSV
        </h2>

        <UploadArea
          $isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById("file-input").click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
          <UploadIcon>
            <i className="fas fa-cloud-upload-alt" />
          </UploadIcon>
          <UploadText>Drag and drop your CSV file here, or click to browse</UploadText>
          <UploadHint>CSV files only. Maximum file size: 10MB</UploadHint>
        </UploadArea>

        {uploadedFile && (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#f0f9ff",
              borderRadius: "8px",
              marginTop: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <i className="fas fa-file-csv" style={{ fontSize: "24px", color: "#0ea5e9" }} />
              <div>
                <p style={{ margin: 0, fontWeight: "600", color: "#1f2937" }}>{uploadedFile.name}</p>
                <p style={{ margin: 0, fontSize: "14px", color: "#6b7280" }}>
                  {(uploadedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            </div>
            <Button onClick={handleUpload}>
              <i className="fas fa-upload" style={{ marginRight: "8px" }} />
              Upload Products
            </Button>
          </div>
        )}

        {uploadStatus && (
          <div
            style={{
              padding: "12px 16px",
              marginTop: "16px",
              borderRadius: "8px",
              backgroundColor: uploadStatus.includes("success") ? "#d1fae5" : "#fef3c7",
              color: uploadStatus.includes("success") ? "#065f46" : "#92400e",
            }}
          >
            {uploadStatus}
          </div>
        )}

        <div style={{ marginTop: "32px", padding: "20px", backgroundColor: "#f9fafb", borderRadius: "8px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#1f2937", marginBottom: "12px" }}>
            Instructions:
          </h3>
          <ul style={{ margin: 0, paddingLeft: "20px", color: "#6b7280", lineHeight: "1.8" }}>
            <li>Download the template CSV file above</li>
            <li>Fill in your product information following the template format</li>
            <li>Ensure all required fields (Title, Price, Inventory) are filled</li>
            <li>Upload the completed CSV file</li>
            <li>Review and confirm the products before finalizing</li>
          </ul>
        </div>
      </Section>
    </Container>
  );
}

