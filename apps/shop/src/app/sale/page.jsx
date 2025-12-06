"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import Navbar from "@/components/Navbar";
import SlimBar from "@/components/SlimBar";
import Footer from "@/components/Footer";
import ProductGrid from "@/components/ProductGrid";

export default function SalePage() {
  return (
    <ApolloProvider client={apolloClient}>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <SlimBar />
        <main className="flex-grow">
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <h1 style={{ fontSize: "36px", fontWeight: 700, marginBottom: "16px", letterSpacing: "0.05em" }}>
              Angebote
            </h1>
            <p style={{ fontSize: "18px", color: "#6b7280", marginBottom: "32px" }}>
              Reduzierte Produkte - Jetzt sparen!
            </p>
          </div>
          <ProductGrid />
        </main>
        <Footer />
      </div>
    </ApolloProvider>
  );
}

