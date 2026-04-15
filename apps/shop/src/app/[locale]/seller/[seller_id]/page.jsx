"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import styled, { keyframes } from "styled-components";

/* ─── Shimmer ─────────────────────────────────────────────── */
const shimmer = keyframes`
  0%   { background-position: -800px 0; }
  100% { background-position:  800px 0; }
`;
const Bone = styled.div`
  background: linear-gradient(90deg, #efefed 25%, #e5e5e3 50%, #efefed 75%);
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
  border-radius: 6px;
`;

/* ─── Layout ──────────────────────────────────────────────── */
const PageWrap = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
`;

const Main = styled.main`
  flex: 1;
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
  padding: 36px 24px 60px;
  box-sizing: border-box;
`;

/* ─── Seller header card ──────────────────────────────────── */
const SellerCard = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 28px 32px;
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 32px;
  flex-wrap: wrap;

  @media (max-width: 640px) {
    padding: 20px 16px;
    gap: 16px;
  }
`;

const SellerLogo = styled.div`
  flex-shrink: 0;
  width: 80px;
  height: 80px;
  border-radius: 12px;
  background: #f3f4f6;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;

const SellerInitial = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1b8880, #0d6e66);
  color: #fff;
  font-size: 32px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const SellerInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const SellerName = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 6px;
`;

const RatingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const Stars = styled.span`
  font-size: 20px;
  letter-spacing: 1px;
`;

const RatingNum = styled.span`
  font-size: 18px;
  font-weight: 700;
  color: #111827;
`;

const RatingCount = styled.span`
  font-size: 13px;
  color: #6b7280;
`;

/* ─── Rating distribution ─────────────────────────────────── */
const DistWrap = styled.div`
  margin-left: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;

  @media (max-width: 640px) {
    min-width: 100%;
    margin-left: 0;
  }
`;

const DistRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #6b7280;
`;

const DistBar = styled.div`
  flex: 1;
  height: 6px;
  background: #f3f4f6;
  border-radius: 99px;
  overflow: hidden;
`;

const DistFill = styled.div`
  height: 100%;
  background: #f59e0b;
  border-radius: 99px;
  width: ${(p) => p.$pct}%;
  transition: width 0.4s ease;
`;

/* ─── Section ─────────────────────────────────────────────── */
const SectionTitle = styled.h2`
  font-size: 17px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 16px;
`;

/* ─── Reviews ─────────────────────────────────────────────── */
const ReviewsWrap = styled.div`
  margin-top: 40px;
`;

const ReviewCard = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 12px;
`;

const ReviewHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  gap: 8px;
  flex-wrap: wrap;
`;

const ReviewAuthor = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: #374151;
`;

const ReviewProduct = styled.span`
  font-size: 12px;
  color: #9ca3af;
  margin-left: 6px;
`;

const ReviewDate = styled.span`
  font-size: 11px;
  color: #9ca3af;
`;

const ReviewComment = styled.p`
  margin: 6px 0 0;
  font-size: 13.5px;
  color: #4b5563;
  line-height: 1.55;
`;

function renderStars(avg, size = 18) {
  const full = Math.floor(avg || 0);
  const half = (avg || 0) - full >= 0.5;
  return (
    <Stars style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ color: n <= full ? "#f59e0b" : half && n === full + 1 ? "#f59e0b" : "#d1d5db", opacity: half && n === full + 1 ? 0.5 : 1 }}>
          ★
        </span>
      ))}
    </Stars>
  );
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function SellerProfilePage() {
  const { seller_id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seller_id) return;
    fetch(`/api/store-seller-profile/${encodeURIComponent(seller_id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [seller_id]);

  const seller = data?.seller;
  const reviews = data?.reviews || [];
  const products = (data?.products || []).map((p) => ({
    ...p,
    slug: p.handle,
    images: p.metadata?.media || [],
    thumbnail: p.metadata?.thumbnail || "",
    price: p.price_cents ? p.price_cents / 100 : 0,
  }));
  const dist = seller?.rating_distribution || {};
  const totalDist = Object.values(dist).reduce((s, v) => s + v, 0) || 1;
  const avg = seller?.review_avg || 0;
  const count = seller?.review_count || 0;
  const storeName = seller?.store_name || seller_id;

  return (
    <PageWrap>
      <ShopHeader />
      <Main>
        {/* ── Seller header ── */}
        <SellerCard>
          {loading ? (
            <>
              <Bone style={{ width: 80, height: 80, borderRadius: 12 }} />
              <div style={{ flex: 1 }}>
                <Bone style={{ width: 200, height: 24, marginBottom: 10 }} />
                <Bone style={{ width: 140, height: 16 }} />
              </div>
            </>
          ) : (
            <>
              {seller?.shop_logo_url ? (
                <SellerLogo>
                  <img src={seller.shop_logo_url} alt={storeName} />
                </SellerLogo>
              ) : (
                <SellerInitial>{(storeName || "S").charAt(0).toUpperCase()}</SellerInitial>
              )}

              <SellerInfo>
                <SellerName>{storeName}</SellerName>
                {count > 0 ? (
                  <RatingRow>
                    {renderStars(avg)}
                    <RatingNum>{Number(avg).toFixed(1)}</RatingNum>
                    <RatingCount>({count} Bewertung{count !== 1 ? "en" : ""})</RatingCount>
                  </RatingRow>
                ) : (
                  <RatingCount>Noch keine Bewertungen</RatingCount>
                )}
              </SellerInfo>

              {count > 0 && (
                <DistWrap>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <DistRow key={n}>
                      <span style={{ minWidth: 8 }}>{n}</span>
                      <span style={{ color: "#f59e0b", fontSize: 11 }}>★</span>
                      <DistBar>
                        <DistFill $pct={(dist[n] || 0) / totalDist * 100} />
                      </DistBar>
                      <span style={{ minWidth: 24, textAlign: "right" }}>{dist[n] || 0}</span>
                    </DistRow>
                  ))}
                </DistWrap>
              )}
            </>
          )}
        </SellerCard>

        {/* ── Products ── */}
        {(loading || products.length > 0) && (
          <div style={{ marginBottom: 40 }}>
            <SectionTitle>
              {loading ? <Bone style={{ width: 160, height: 20 }} /> : `Produkte von ${storeName}`}
            </SectionTitle>
            {loading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                {[...Array(8)].map((_, i) => (
                  <Bone key={i} style={{ height: 280, borderRadius: 10 }} />
                ))}
              </div>
            ) : (
              <ProductGrid products={products} maxColumns={4} />
            )}
          </div>
        )}

        {/* ── Reviews ── */}
        <ReviewsWrap>
          <SectionTitle>
            {loading ? (
              <Bone style={{ width: 120, height: 20 }} />
            ) : (
              `Bewertungen${count > 0 ? ` (${count})` : ""}`
            )}
          </SectionTitle>

          {loading && (
            <>
              {[...Array(3)].map((_, i) => (
                <Bone key={i} style={{ height: 90, borderRadius: 10, marginBottom: 12 }} />
              ))}
            </>
          )}

          {!loading && reviews.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 }}>
              Noch keine Bewertungen vorhanden.
            </div>
          )}

          {!loading && reviews.map((r) => (
            <ReviewCard key={r.id}>
              <ReviewHeader>
                <div>
                  {renderStars(r.rating, 15)}
                  <ReviewAuthor style={{ marginLeft: 6 }}>{r.customer_name || "Anonym"}</ReviewAuthor>
                  {r.product_title && (
                    <ReviewProduct>· {r.product_title}</ReviewProduct>
                  )}
                </div>
                <ReviewDate>{fmtDate(r.created_at)}</ReviewDate>
              </ReviewHeader>
              {r.comment && <ReviewComment>{r.comment}</ReviewComment>}
            </ReviewCard>
          ))}
        </ReviewsWrap>
      </Main>
      <Footer />
    </PageWrap>
  );
}
