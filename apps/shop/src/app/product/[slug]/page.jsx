"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import Navbar from "@/components/Navbar";
import SlimBar from "@/components/SlimBar";
import Footer from "@/components/Footer";
import ProductTemplate from "@/components/templates/ProductTemplate";

export default function ProductPage() {
  return (
    <ApolloProvider client={apolloClient}>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <SlimBar />
        <main className="flex-grow">
          <ProductTemplate />
        </main>
        <Footer />
      </div>
    </ApolloProvider>
  );
}

