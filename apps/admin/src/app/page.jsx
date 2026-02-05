"use client";

import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { Card, Button, Input } from "@belucha/ui";

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  min-height: 100vh;
  background-color: #f9fafb;
`;

const Header = styled.div`
  background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
  color: white;
  padding: 32px;
  border-radius: 12px;
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #d1d5db;
  margin: 0;
`;

const TabContainer = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 2px solid #e5e7eb;
`;

const Tab = styled.button`
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid ${({ $active }) => ($active ? "#0ea5e9" : "transparent")};
  color: ${({ $active }) => ($active ? "#0ea5e9" : "#6b7280")};
  font-weight: ${({ $active }) => ($active ? "600" : "400")};
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;

  &:hover {
    color: #0ea5e9;
  }
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

const Label = styled.label`
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  font-family: 'Courier New', monospace;
  min-height: 300px;
  resize: vertical;
  box-sizing: border-box;

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

const CategoryList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
  margin-top: 24px;
`;

const CategoryCard = styled(Card)`
  padding: 16px;
  border-left: 4px solid #0ea5e9;
  position: relative;
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

const DeleteButton = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  background: #fee2e2;
  border: none;
  color: #ef4444;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;

  &:hover {
    background: #fecaca;
  }
`;

const MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000';
const ADMIN_HUB_API_URL = `${MEDUSA_BACKEND_URL}/admin-hub`;

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState("categories");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [bulkJson, setBulkJson] = useState("");
  const [creating, setCreating] = useState(false);
  
  // Text input için state'ler
  const [singleCategory, setSingleCategory] = useState({
    name: "",
    slug: "",
    description: "",
    is_visible: true,
    has_collection: true,
  });

  useEffect(() => {
    if (activeTab === "categories") {
      fetchCategories();
    }
  }, [activeTab]);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${ADMIN_HUB_API_URL}/categories`);
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
      setMessage({ type: "error", text: "Kategoriler yüklenemedi" });
    } finally {
      setLoading(false);
    }
  };

  const handleSingleCreate = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    setCreating(true);

    try {
      if (!singleCategory.name || !singleCategory.slug) {
        throw new Error("Name ve slug zorunludur");
      }

      const response = await fetch(`${ADMIN_HUB_API_URL}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: singleCategory.name,
          slug: singleCategory.slug,
          description: singleCategory.description || '',
          active: true,
          is_visible: singleCategory.is_visible,
          has_collection: singleCategory.has_collection,
          sort_order: 0,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      setMessage({
        type: "success",
        text: "Kategori başarıyla eklendi!",
      });
      setSingleCategory({ name: "", slug: "", description: "", is_visible: true, has_collection: true });
      fetchCategories();
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Kategori eklenirken hata oluştu",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleBulkCreate = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    setCreating(true);

    try {
      const categoriesToAdd = JSON.parse(bulkJson);
      if (!Array.isArray(categoriesToAdd)) {
        throw new Error("JSON bir array olmalı");
      }

      const results = [];
      const errors = [];

      for (const category of categoriesToAdd) {
        try {
          const response = await fetch(`${ADMIN_HUB_API_URL}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: category.name,
              slug: category.slug || category.name.toLowerCase().replace(/\s+/g, '-'),
              description: category.description || '',
              parent_id: category.parent_id || null,
              active: category.active !== undefined ? category.active : true,
              is_visible: category.is_visible !== undefined ? category.is_visible : true,
              has_collection: category.has_collection !== undefined ? category.has_collection : true,
              sort_order: category.sort_order || 0,
              metadata: category.metadata || null,
            }),
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const result = await response.json();
          results.push(result.category);
        } catch (error) {
          errors.push({ category: category.name, error: error.message });
        }
      }

      if (results.length > 0) {
        setMessage({
          type: "success",
          text: `${results.length} kategori başarıyla eklendi${errors.length > 0 ? `, ${errors.length} hata` : ""}`,
        });
        setBulkJson("");
        fetchCategories();
      }

      if (errors.length > 0) {
        console.error("Kategori ekleme hataları:", errors);
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Kategoriler eklenirken hata oluştu",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Container>
      <Header>
        <Title>Super Admin Panel</Title>
        <Subtitle>Global verileri yönetin: Kategoriler, Bannerlar, vb.</Subtitle>
      </Header>

      <TabContainer>
        <Tab $active={activeTab === "categories"} onClick={() => setActiveTab("categories")}>
          Categories
        </Tab>
        <Tab $active={activeTab === "banners"} onClick={() => setActiveTab("banners")}>
          Banners
        </Tab>
        <Tab $active={activeTab === "settings"} onClick={() => setActiveTab("settings")}>
          Settings
        </Tab>
      </TabContainer>

      {activeTab === "categories" && (
        <>
          <Section>
            <h2 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: "600" }}>
              Add Single Category (Text Input)
            </h2>
            <Form onSubmit={handleSingleCreate}>
              <div>
                <Label>Category Name *</Label>
                <Input
                  type="text"
                  value={singleCategory.name}
                  onChange={(e) => setSingleCategory({ ...singleCategory, name: e.target.value })}
                  placeholder="Electronics"
                  required
                />
              </div>
              <div>
                <Label>Category Slug *</Label>
                <Input
                  type="text"
                  value={singleCategory.slug}
                  onChange={(e) => setSingleCategory({ ...singleCategory, slug: e.target.value })}
                  placeholder="electronics"
                  required
                />
                <small style={{ color: "#6b7280", marginTop: "4px", display: "block" }}>
                  URL-friendly slug (örn: electronics, clothing)
                </small>
              </div>
              <div>
                <Label>Description</Label>
                <TextArea
                  value={singleCategory.description}
                  onChange={(e) => setSingleCategory({ ...singleCategory, description: e.target.value })}
                  placeholder="Category description..."
                  style={{ minHeight: "100px" }}
                />
              </div>

              <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="is_visible"
                    checked={singleCategory.is_visible}
                    onChange={(e) => setSingleCategory({ ...singleCategory, is_visible: e.target.checked })}
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <Label htmlFor="is_visible" style={{ margin: 0, cursor: "pointer", fontWeight: "400" }}>
                    Navigasyonda görünsün
                  </Label>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="has_collection"
                    checked={singleCategory.has_collection}
                    onChange={(e) => setSingleCategory({ ...singleCategory, has_collection: e.target.checked })}
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <Label htmlFor="has_collection" style={{ margin: 0, cursor: "pointer", fontWeight: "400" }}>
                    Collection sayfası olsun (/collections/slug)
                  </Label>
                </div>
              </div>

              {message.text && (
                message.type === "success" ? (
                  <SuccessMessage>{message.text}</SuccessMessage>
                ) : (
                  <ErrorMessage>{message.text}</ErrorMessage>
                )
              )}

              <Button type="submit" disabled={creating || !singleCategory.name || !singleCategory.slug}>
                {creating ? "Adding Category..." : "Add Category"}
              </Button>
            </Form>
          </Section>

          <Section>
            <h2 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: "600" }}>
              Bulk Add Categories (JSON)
            </h2>
            <Form onSubmit={handleBulkCreate}>
              <div>
                <Label>Categories JSON</Label>
                <TextArea
                  value={bulkJson}
                  onChange={(e) => setBulkJson(e.target.value)}
                  placeholder={`[\n  {\n    "name": "Electronics",\n    "slug": "electronics",\n    "description": "Electronic products"\n  },\n  {\n    "name": "Clothing",\n    "slug": "clothing",\n    "description": "Clothing and apparel"\n  }\n]`}
                />
                <small style={{ color: "#6b7280", marginTop: "8px", display: "block" }}>
                  JSON formatında kategori array'i. Toplu ekleme için kullanın.
                </small>
              </div>

              {message.text && (
                message.type === "success" ? (
                  <SuccessMessage>{message.text}</SuccessMessage>
                ) : (
                  <ErrorMessage>{message.text}</ErrorMessage>
                )
              )}

              <Button type="submit" disabled={creating || !bulkJson.trim()}>
                {creating ? "Adding Categories..." : "Add Categories (Bulk)"}
              </Button>
            </Form>
          </Section>

          <Section>
            <h2 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: "600" }}>
              Existing Categories ({categories.length})
            </h2>
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: "32px", color: "#0ea5e9" }} />
              </div>
            ) : categories.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
                No categories found. Add categories using the form above.
              </div>
            ) : (
              <CategoryList>
                {categories.map((category) => (
                  <CategoryCard key={category.id}>
                    <CategoryName>{category.name}</CategoryName>
                    <CategoryHandle>URL: /collections/{category.slug || "N/A"}</CategoryHandle>
                    {category.description && (
                      <div style={{ fontSize: "14px", color: "#4b5563", marginTop: "8px" }}>
                        {category.description}
                      </div>
                    )}
                    <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px", display: "flex", gap: "12px" }}>
                      {category.is_visible && <span>👁️ Navigasyonda</span>}
                      {category.has_collection && <span>📦 Collection</span>}
                    </div>
                  </CategoryCard>
                ))}
              </CategoryList>
            )}
          </Section>
        </>
      )}

      {activeTab === "banners" && (
        <Section>
          <h2 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: "600" }}>
            Banner Management
          </h2>
          <p style={{ color: "#6b7280" }}>Banner yönetimi yakında eklenecek.</p>
        </Section>
      )}

      {activeTab === "settings" && (
        <Section>
          <h2 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: "600" }}>
            Platform Settings
          </h2>
          <p style={{ color: "#6b7280" }}>Platform ayarları yakında eklenecek.</p>
        </Section>
      )}
    </Container>
  );
}
