"use client";

/**
 * Categories Page - READ ONLY
 * 
 * Kategoriler sadece görüntülenir, ekleme/düzenleme yapılamaz.
 * Kategoriler Medusa Admin Panel'den veya Super Admin Panel'den yönetilir.
 */

import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { Card } from "@belucha/ui";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import DashboardLayout from "@/components/DashboardLayout";

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
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

const InfoBox = styled.div`
  background-color: #eff6ff;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
  color: #1e40af;
`;

const CategoryList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
  margin-top: 24px;
`;

const CategoryCard = styled(Card)`
  padding: 16px;
  border-left: 4px solid #0ea5e9;
`;

const CategoryName = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
`;

const CategoryHandle = styled.div`
  font-size: 12px;
  color: #6b7280;
  font-family: 'Courier New', monospace;
`;

const CategoryDescription = styled.div`
  font-size: 14px;
  color: #4b5563;
  margin-top: 8px;
`;

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const medusaClient = getMedusaAdminClient();

  // Kategorileri yükle
  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await medusaClient.getAdminHubCategories();
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
      setError("Kategoriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <Container>
        <Title>Categories</Title>

        <InfoBox>
          <strong>ℹ️ Read Only:</strong> Kategoriler sadece görüntülenir.
          <br />
          Kategori eklemek/düzenlemek için Medusa Admin Panel veya Super Admin Panel kullanın.
        </InfoBox>

        <Section>
          <h2 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: "600" }}>
            Available Categories ({categories.length})
          </h2>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: "32px", color: "#0ea5e9" }} />
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#ef4444" }}>
              {error}
            </div>
          ) : categories.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
              No categories found. Categories will appear here once added from Admin Panel.
            </div>
          ) : (
            <CategoryList>
              {categories.map((category) => (
                <CategoryCard key={category.id}>
                  <CategoryName>{category.name}</CategoryName>
                  <CategoryHandle>URL: /collections/{category.slug || "N/A"}</CategoryHandle>
                  {category.description && (
                    <CategoryDescription>{category.description}</CategoryDescription>
                  )}
                </CategoryCard>
              ))}
            </CategoryList>
          )}
        </Section>
      </Container>
    </DashboardLayout>
  );
}
