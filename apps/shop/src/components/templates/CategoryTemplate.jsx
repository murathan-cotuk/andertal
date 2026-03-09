"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import styled from "styled-components";
import { getMedusaClient } from "@/lib/medusa-client";
import { ProductGrid } from "@/components/ProductGrid";
import Breadcrumbs from "@/components/Breadcrumbs";
import { Link } from "@/i18n/navigation";

const BannerWrapper = styled.div`
  width: 100%;
  margin-bottom: 0;
  flex-shrink: 0;
`;

const BannerImage = styled.img`
  width: 100%;
  max-height: 160px;
  min-height: 120px;
  object-fit: cover;
  display: block;
  vertical-align: middle;
`;

const ContentRow = styled.div`
  display: flex;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
`;

const FilterSidebar = styled.aside`
  width: 260px;
  flex-shrink: 0;
  position: sticky;
  top: 88px;
  align-self: flex-start;
  padding: 24px 20px 48px 24px;
  border-right: 1px solid #e5e7eb;
  background: #fafafa;
  min-height: calc(100vh - 72px);
`;

const FilterTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: #374151;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 16px;
`;

const FilterList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const FilterItem = styled.li`
  margin: 0;
  padding: 0;
`;

const FilterLink = styled(Link)`
  display: block;
  padding: 10px 12px;
  font-size: 15px;
  color: ${(p) => (p.$active ? "#111827" : "#4b5563")};
  font-weight: ${(p) => (p.$active ? 600 : 400)};
  text-decoration: none;
  border-radius: 8px;
  background: ${(p) => (p.$active ? "#e5e7eb" : "transparent")};
  margin-bottom: 2px;
  &:hover {
    background: #e5e7eb;
    color: #111827;
  }
`;

const ContentColumn = styled.div`
  flex: 1;
  min-width: 0;
  padding: 20px 24px 48px 32px;
`;

const BreadcrumbWrap = styled.div`
  text-align: left;
  margin-bottom: 12px;
`;

const CategoryHeader = styled.div`
  text-align: left;
  margin-bottom: 20px;
  margin-top: 0;
`;

const CategoryTitle = styled.h1`
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: #1f2937;
`;

const CategoryDescription = styled.p`
  font-size: 16px;
  color: #6b7280;
  max-width: 800px;
  margin: 0;
`;

const LongContent = styled.div`
  max-width: 800px;
  margin: 0 0 32px 0;
  color: #4b5563;
  line-height: 1.6;
  font-size: 1rem;

  & h1 { font-size: 1.75rem; font-weight: 700; margin: 1.25em 0 0.5em; color: #1f2937; line-height: 1.3; }
  & h2 { font-size: 1.5rem; font-weight: 700; margin: 1.25em 0 0.5em; color: #1f2937; line-height: 1.3; }
  & h3 { font-size: 1.25rem; font-weight: 600; margin: 1em 0 0.4em; color: #1f2937; line-height: 1.35; }
  & h4, & h5, & h6 { font-size: 1.125rem; font-weight: 600; margin: 0.85em 0 0.35em; color: #374151; line-height: 1.4; }
  & h1:first-child, & h2:first-child, & h3:first-child { margin-top: 0; }
  & p { margin: 0 0 1em; }
  & p:last-child { margin-bottom: 0; }
  & ul, & ol { margin: 0.5em 0 1em 1.5em; padding-left: 1.5em; }
  & ul { list-style-type: disc; }
  & ol { list-style-type: decimal; }
  & li { margin-bottom: 0.35em; }
  & strong { font-weight: 600; color: #374151; }
  & em { font-style: italic; }
  & a { color: #0ea5e9; text-decoration: underline; }
  & a:hover { text-decoration: none; }
  & blockquote { margin: 1em 0; padding-left: 1em; border-left: 4px solid #e5e7eb; color: #6b7280; }
  & hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.25em 0; }
`;

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 48px 24px;
`;

function flattenCategories(cats, out = []) {
  if (!Array.isArray(cats)) return out;
  for (const c of cats) {
    if (c && (c.slug || c.id)) out.push({ slug: c.slug || c.id, name: c.name || c.slug || "Category" });
    if (Array.isArray(c.children) && c.children.length) flattenCategories(c.children, out);
  }
  return out;
}

function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\s*on\w+=["'][^"']*["']/gi, "");
}

export default function CategoryTemplate() {
  const params = useParams();
  const slug = params?.slug;
  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const client = getMedusaClient();
        const [cat, prodRes, catRes] = await Promise.all([
          client.getCategoryBySlug(slug).catch(() => null),
          client.getProducts({ category: slug }),
          client.getCategories({ tree: true }).catch(() => ({ categories: [], tree: [] })),
        ]);
        setCategory(cat || null);
        setProducts(prodRes.products || []);
        const tree = catRes.tree || catRes.categories || [];
        setCategories(flattenCategories(Array.isArray(tree) ? tree : [tree]));
      } catch (err) {
        setError(err?.message || "Failed to load category");
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug]);

  if (loading) {
    return (
      <Container>
        <div style={{ textAlign: "center", padding: "48px", color: "#6b7280" }}>Loading category…</div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <div style={{ padding: "24px", backgroundColor: "#fef2f2", borderRadius: "8px", color: "#991b1b" }}>{error}</div>
      </Container>
    );
  }

  const title = category?.name || (slug ? `Category: ${slug}` : "Category");
  const safeLongContent = category?.long_content ? sanitizeHtml(category.long_content) : "";

  return (
    <>
      {category?.banner_image_url && (
        <BannerWrapper>
          <BannerImage src={category.banner_image_url} alt={title} />
        </BannerWrapper>
      )}
      <ContentRow>
        <FilterSidebar>
          <FilterTitle>Kategorien</FilterTitle>
          <FilterList>
            {categories.length === 0 ? (
              <li style={{ fontSize: 14, color: "#6b7280" }}>Keine Kategorien</li>
            ) : (
              categories.map((c) => (
                <FilterItem key={c.slug}>
                  <FilterLink href={"/category/" + c.slug} $active={c.slug === slug}>
                    {c.name}
                  </FilterLink>
                </FilterItem>
              ))
            )}
          </FilterList>
        </FilterSidebar>
        <ContentColumn>
          <BreadcrumbWrap>
            <Breadcrumbs title={title} />
          </BreadcrumbWrap>
          <CategoryHeader>
            <CategoryTitle>{title}</CategoryTitle>
            {category?.description && <CategoryDescription>{category.description}</CategoryDescription>}
          </CategoryHeader>
          {safeLongContent && (
            <LongContent dangerouslySetInnerHTML={{ __html: safeLongContent }} />
          )}
          <ProductGrid products={products} />
        </ContentColumn>
      </ContentRow>
    </>
  );
}
