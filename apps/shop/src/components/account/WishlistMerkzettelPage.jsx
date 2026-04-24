"use client";

import { useState, useEffect } from "react";
import { useAuthGuard, getToken } from "@belucha/lib";
import NewtonsCradle from "@/components/NewtonsCradle";
import { Link, useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout from "@/components/account/AccountPageLayout";
import { ProductCard } from "@/components/ProductCard";
import { getMedusaClient } from "@/lib/medusa-client";
import { useCustomerAuth as useAuth } from "@belucha/lib";
import styled from "styled-components";

const ORANGE = "#ff971c";
const DARK = "#1A1A1A";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";

const WishGrid = styled.div`
  display: grid;
  gap: 16px;
  width: 100%;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  @media (max-width: 1280px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  @media (max-width: 900px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

export default function WishlistMerkzettelPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const { user, logout } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const token = getToken("customer");
      if (!token) {
        setLoading(false);
        return;
      }
      const client = getMedusaClient();
      const w = await client.getWishlist(token);
      const ids = (w?.items || []).map((x) => x.product_id).filter(Boolean);
      const list = [];
      for (const id of ids) {
        const res = await client.getProduct(id);
        if (res?.product) list.push(res.product);
      }
      setProducts(list);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: DARK, margin: "0 0 24px" }}>Merkzettel</h1>
          <AccountPageLayout onLogout={() => { logout(); router.push("/"); }}>
            <div>
              {loading ? (
                <NewtonsCradle />
              ) : products.length === 0 ? (
                <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
                  <p style={{ color: GRAY, marginBottom: 20 }}>Ihr Merkzettel ist noch leer.</p>
                  <Link
                    href="/"
                    style={{
                      display: "inline-block",
                      background: ORANGE,
                      color: "#fff",
                      padding: "10px 24px",
                      borderRadius: 10,
                      fontWeight: 700,
                      textDecoration: "none",
                      border: "2px solid #000",
                      boxShadow: "0 2px 0 2px #000",
                    }}
                  >
                    Zum Shop
                  </Link>
                </div>
              ) : (
                <WishGrid>
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </WishGrid>
              )}
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
