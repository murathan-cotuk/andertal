"use client";

import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import CatalogCmsLanding from "@/components/catalog/CatalogCmsLanding";
import { BrandCard } from "@/components/BrandCard";
import { useLocale } from "next-intl";

const Container = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  padding: 22px 24px 72px;

  @media (max-width: 767px) {
    padding: 18px 16px 56px;
  }
`;

const ToolBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
`;

const SearchInput = styled.input`
  width: 220px;
  max-width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  background: #fff;

  &:focus { border-color: #111827; }

  @media (max-width: 680px) {
    width: 100%;
  }
`;

const SortSelect = styled.select`
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  background: #fff;
  color: #111827;
  outline: none;
  cursor: pointer;

  &:focus { border-color: #111827; }
`;

const AlphaBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 20px;
`;

const AlphaBtn = styled.button`
  min-width: 26px;
  padding: 4px 6px;
  border: 1px solid ${(p) => (p.$active ? "#111827" : "#e5e7eb")};
  background: ${(p) => (p.$active ? "#111827" : "#fff")};
  color: ${(p) => (p.$active ? "#fff" : "#374151")};
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-transform: uppercase;

  &:hover { border-color: #111827; }
`;

const ResultCount = styled.span`
  font-size: 12px;
  color: #6b7280;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;

  @media (max-width: 1280px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  @media (max-width: 980px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 680px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function BrandsPage() {
  const locale = useLocale();
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [letter, setLetter] = useState("");
  const [sort, setSort] = useState("name_asc");

  const copy = useMemo(() => {
    if (locale === "tr") return { title: "Markalar", cta: "Markaya git", empty: "Henuz marka bulunmuyor.", noMatch: "Aramanla eslesen marka bulunamadi.", searchPlaceholder: "Marka ara...", sortNameAsc: "Isim (A-Z)", sortNameDesc: "Isim (Z-A)", sortNewest: "En yeni" };
    if (locale === "de") return { title: "Marken", cta: "Zur Marke", empty: "Noch keine Marken vorhanden.", noMatch: "Keine Marken für diese Suche gefunden.", searchPlaceholder: "Marke suchen...", sortNameAsc: "Name (A-Z)", sortNameDesc: "Name (Z-A)", sortNewest: "Neueste" };
    return { title: "Brands", cta: "Go to brand", empty: "No brands yet.", noMatch: "No brands match your search.", searchPlaceholder: "Search brands...", sortNameAsc: "Name (A-Z)", sortNameDesc: "Name (Z-A)", sortNewest: "Newest" };
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch("/api/store-brands", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          const list = Array.isArray(data?.brands) ? data.brands : [];
          setBrands(list.filter((b) => b && b.handle));
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load brands");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableLetters = useMemo(() => {
    const set = new Set();
    for (const b of brands) {
      const first = (b.name || "").trim().charAt(0).toUpperCase();
      if (first) set.add(ALPHABET.includes(first) ? first : "#");
    }
    return set;
  }, [brands]);

  const visibleBrands = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = brands.filter((b) => {
      if (q && !(b.name || "").toLowerCase().includes(q)) return false;
      if (letter) {
        const first = (b.name || "").trim().charAt(0).toUpperCase();
        const bucket = ALPHABET.includes(first) ? first : "#";
        if (bucket !== letter) return false;
      }
      return true;
    });
    list = [...list];
    if (sort === "name_asc") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    else if (sort === "name_desc") list.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    // "newest" keeps the API's default created_at DESC order.
    return list;
  }, [brands, search, letter, sort]);

  return (
    <CatalogCmsLanding slug="brands" fallbackTitle={copy.title} showTitleWhenNoContainers>
      <Container>
        {loading ? <GlobalPageLoader /> : null}
        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        {!loading && !error && brands.length > 0 ? (
          <>
            <ToolBar>
              <SearchInput
                type="search"
                placeholder={copy.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={copy.searchPlaceholder}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ResultCount>{visibleBrands.length}</ResultCount>
                <SortSelect value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
                  <option value="newest">{copy.sortNewest}</option>
                  <option value="name_asc">{copy.sortNameAsc}</option>
                  <option value="name_desc">{copy.sortNameDesc}</option>
                </SortSelect>
              </div>
            </ToolBar>
            <AlphaBar>
              <AlphaBtn type="button" $active={!letter} onClick={() => setLetter("")}>
                {locale === "de" ? "Alle" : locale === "tr" ? "Tumu" : "All"}
              </AlphaBtn>
              {ALPHABET.map((ch) => {
                const has = availableLetters.has(ch);
                return (
                  <AlphaBtn
                    key={ch}
                    type="button"
                    $active={letter === ch}
                    disabled={!has}
                    style={!has ? { opacity: 0.3, cursor: "default" } : undefined}
                    onClick={() => has && setLetter(letter === ch ? "" : ch)}
                  >
                    {ch}
                  </AlphaBtn>
                );
              })}
            </AlphaBar>
            {visibleBrands.length ? (
              <Grid>
                {visibleBrands.map((brand) => (
                  <BrandCard key={brand.id || brand.handle} brand={brand} ctaLabel={copy.cta} />
                ))}
              </Grid>
            ) : (
              <p style={{ color: "#6b7280" }}>{copy.noMatch}</p>
            )}
          </>
        ) : null}
        {!loading && !error && brands.length === 0 ? (
          <p style={{ color: "#6b7280" }}>{copy.empty}</p>
        ) : null}
      </Container>
    </CatalogCmsLanding>
  );
}

