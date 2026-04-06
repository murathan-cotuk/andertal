"use client";

import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { BrandCard } from "@/components/BrandCard";
import { useLocale } from "next-intl";

const PageWrap = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fafafa;
`;

const Main = styled.main`
  flex: 1;
`;

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

const Title = styled.h1`
  margin: 0 0 16px;
`;

const Subtitle = styled.p`
  margin: 0 0 20px;
  font-size: 14px;
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

export default function BrandsPage() {
  const locale = useLocale();
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = useMemo(() => {
    if (locale === "tr") return { title: "Markalar", subtitle: "Tum markalari kesfedin", cta: "Markaya git", empty: "Henuz marka bulunmuyor." };
    if (locale === "de") return { title: "Marken", subtitle: "Entdecke alle Marken", cta: "Zur Marke", empty: "Noch keine Marken vorhanden." };
    return { title: "Brands", subtitle: "Explore all brands", cta: "Go to brand", empty: "No brands yet." };
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

  return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <Container>
          <Title className="shop-typo-catalog-title">{copy.title}</Title>
          <Subtitle>{copy.subtitle}</Subtitle>
          {loading ? <p style={{ color: "#6b7280" }}>Loading…</p> : null}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
          {!loading && !error ? (
            brands.length ? (
              <Grid>
                {brands.map((brand) => (
                  <BrandCard key={brand.id || brand.handle} brand={brand} ctaLabel={copy.cta} />
                ))}
              </Grid>
            ) : (
              <p style={{ color: "#6b7280" }}>{copy.empty}</p>
            )
          ) : null}
        </Container>
      </Main>
      <Footer />
    </PageWrap>
  );
}

