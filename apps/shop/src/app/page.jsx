"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import Navbar from "@/components/Navbar";
import SlimBar from "@/components/SlimBar";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import ProductGrid from "@/components/ProductGrid";

export default function Home() {
  return (
    <ApolloProvider client={apolloClient}>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <SlimBar />
        <main className="flex-grow">
          <Hero />
          <ProductGrid />
        </main>
        <Footer />
      </div>
    </ApolloProvider>
  );
}

