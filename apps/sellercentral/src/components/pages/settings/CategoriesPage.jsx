"use client";

import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { Card, Button, Input } from "@belucha/ui";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

/** Build nested tree from flat array using parent_id */
function buildTree(flat) {
  const map = {};
  flat.forEach(c => { map[c.id] = { ...c, children: [] }; });
  const roots = [];
  flat.forEach(c => {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });
  return roots;
}

function CategoryTreeNode({ node, depth = 0, onDelete, allOpen }) {
  const [open, setOpen] = useState(allOpen);
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 20;

  // sync with allOpen toggle
  useEffect(() => { setOpen(allOpen); }, [allOpen]);

  return (
    <div>
      <TreeRow style={{ paddingLeft: 16 + indent }}>
        <TreeToggle onClick={() => hasChildren && setOpen(o => !o)} $hasChildren={hasChildren}>
          {hasChildren ? (
            <ChevronIcon $open={open}>›</ChevronIcon>
          ) : (
            <DotIcon>·</DotIcon>
          )}
        </TreeToggle>
        <TreeInfo>
          <TreeName>{node.name}</TreeName>
          <TreeMeta>
            <span style={{ fontFamily: "monospace", fontSize: 11 }}>{node.slug}</span>
            {node.is_visible && <Badge $color="#dbeafe" $text="#1e40af">Nav</Badge>}
            {node.has_collection && <Badge $color="#d1fae5" $text="#065f46">Collection</Badge>}
            {!node.active && <Badge $color="#fee2e2" $text="#991b1b">Pasif</Badge>}
            {hasChildren && <Badge $color="#fef3c7" $text="#92400e">{node.children.length} alt</Badge>}
          </TreeMeta>
        </TreeInfo>
        <TreeActions>
          <DeleteBtn onClick={() => onDelete(node)} title="Sil">✕</DeleteBtn>
        </TreeActions>
      </TreeRow>
      {hasChildren && open && (
        <div>
          {node.children.map(child => (
            <CategoryTreeNode key={child.id} node={child} depth={depth + 1} onDelete={onDelete} allOpen={allOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

const TreeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  padding-right: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f3f4f6;
  &:hover { background: #f9fafb; }
`;

const TreeToggle = styled.button`
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ${p => p.$hasChildren ? "pointer" : "default"};
`;

const ChevronIcon = styled.span`
  font-size: 16px;
  color: #6b7280;
  display: inline-block;
  transform: rotate(${p => p.$open ? "90deg" : "0deg"});
  transition: transform 0.18s ease;
  line-height: 1;
`;

const DotIcon = styled.span`
  font-size: 18px;
  color: #d1d5db;
  line-height: 1;
`;

const TreeInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const TreeName = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #111827;
`;

const TreeMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const Badge = styled.span`
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 20px;
  background: ${p => p.$color};
  color: ${p => p.$text};
`;

const TreeActions = styled.div`
  display: flex;
  gap: 4px;
  flex-shrink: 0;
`;

const DeleteBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 4px;
  &:hover { color: #ef4444; background: #fee2e2; }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
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


export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [bulkJson, setBulkJson] = useState("");
  const [creating, setCreating] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

  const [singleCategory, setSingleCategory] = useState({
    name: "",
    slug: "",
    description: "",
    is_visible: true,
    has_collection: true,
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const client = getMedusaAdminClient();
      const data = await client.getAdminHubCategories({ all: true });
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
      setMessage({ type: "error", text: "Kategoriler yüklenemedi" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = useCallback(async (cat) => {
    if (!confirm(`"${cat.name}" kategorisini silmek istediğinize emin misiniz?`)) return;
    try {
      const client = getMedusaAdminClient();
      await client.deleteAdminHubCategory(cat.id);
      setCategories(prev => prev.filter(c => c.id !== cat.id));
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Silme işlemi başarısız" });
    }
  }, []);

  const handleSingleCreate = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    setCreating(true);

    try {
      if (!singleCategory.name || !singleCategory.slug) {
        throw new Error("Name ve slug zorunludur");
      }

      const client = getMedusaAdminClient();
      await client.createAdminHubCategory({
        name: singleCategory.name,
        slug: singleCategory.slug,
        description: singleCategory.description || '',
        active: true,
        is_visible: singleCategory.is_visible,
        has_collection: singleCategory.has_collection,
        sort_order: 0,
      });

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

      const client = getMedusaAdminClient();
      for (const category of categoriesToAdd) {
        try {
          const result = await client.createAdminHubCategory({
            name: category.name,
            slug: category.slug || category.name.toLowerCase().replace(/\s+/g, '-'),
            description: category.description || '',
            parent_id: category.parent_id || null,
            active: category.active !== undefined ? category.active : true,
            is_visible: category.is_visible !== undefined ? category.is_visible : true,
            has_collection: category.has_collection !== undefined ? category.has_collection : true,
            sort_order: category.sort_order || 0,
            metadata: category.metadata || null,
          });
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
        <Title>Category Management</Title>
        <Subtitle>Manage platform categories - Single source of truth</Subtitle>
      </Header>

      <Section>
        <h2 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: "600" }}>
          Add Single Category
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
              URL-friendly slug (e.g., electronics, clothing)
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
                Visible in navigation
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
                Has collection page (/collections/slug)
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
              JSON array format for bulk category creation.
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>
            Kategoriler ({categories.length})
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setAllOpen(true)}
              style={{ fontSize: 12, padding: "4px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#374151" }}
            >
              Tümünü Aç
            </button>
            <button
              onClick={() => setAllOpen(false)}
              style={{ fontSize: 12, padding: "4px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#374151" }}
            >
              Tümünü Kapat
            </button>
          </div>
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>Yükleniyor…</div>
        ) : categories.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
            Henüz kategori yok. Yukarıdaki formdan ekleyin.
          </div>
        ) : (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            {buildTree(categories).map(node => (
              <CategoryTreeNode key={node.id} node={node} depth={0} onDelete={handleDelete} allOpen={allOpen} />
            ))}
          </div>
        )}
      </Section>
    </Container>
  );
}
