"use client";

import React, { useState } from "react";
import styled from "styled-components";
import { Card, Button } from "@andertal/ui";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getBulkMediaCopy } from "@/lib/products-pages-i18n";

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 32px;
  color: #1d1b18;
`;

const Section = styled(Card)`
  padding: 24px;
  margin-bottom: 24px;
`;

const UploadArea = styled.div`
  border: 2px dashed #d6ccbd;
  border-radius: 8px;
  padding: 60px 20px;
  text-align: center;
  background-color: #faf7f2;
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    border-color: #ee8a12;
    background-color: #f0f9ff;
  }
`;

const UploadIcon = styled.div`
  font-size: 48px;
  color: #ee8a12;
  margin-bottom: 16px;
`;

export default function BulkImagesPage() {
  const [files, setFiles] = useState([]);
  const locale = useLocale();
  const copy = getBulkMediaCopy(locale, "image");

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles([...files, ...selectedFiles]);
  };

  return (
    <Container>
      <Title>{copy.title}</Title>

      <Section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1d1b18" }}>{copy.sectionTitle}</h2>
          <Link href="/products/upload-templates">
            <Button variant="outline">
              <i className="fas fa-download" style={{ marginRight: "8px" }} />
              {copy.downloadTemplate}
            </Button>
          </Link>
        </div>

        <UploadArea onClick={() => document.getElementById("image-input").click()}>
          <input
            id="image-input"
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
          <UploadIcon>
            <i className="fas fa-images" />
          </UploadIcon>
          <p style={{ fontSize: "16px", color: "#5e574e", marginBottom: "8px" }}>
            {copy.dropText}
          </p>
          <p style={{ fontSize: "14px", color: "#a39a8d" }}>{copy.supportText}</p>
        </UploadArea>

        {files.length > 0 && (
          <div style={{ marginTop: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#1d1b18", marginBottom: "16px" }}>
              {copy.selectedLabel} ({files.length})
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "16px" }}>
              {files.map((file, index) => (
                <div
                  key={index}
                  style={{
                    position: "relative",
                    padding: "8px",
                    border: "1px solid #e6dfd4",
                    borderRadius: "8px",
                    backgroundColor: "#faf7f2",
                  }}
                >
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    style={{ width: "100%", height: "150px", objectFit: "cover", borderRadius: "4px" }}
                  />
                  <p style={{ fontSize: "12px", color: "#5e574e", marginTop: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.name}
                  </p>
                </div>
              ))}
            </div>
            <Button style={{ marginTop: "16px" }}>
              <i className="fas fa-upload" style={{ marginRight: "8px" }} />
              {copy.uploadButtonPrefix} {files.length} {copy.uploadButtonSuffix}
            </Button>
          </div>
        )}
      </Section>
    </Container>
  );
}

