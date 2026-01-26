"use client";

import Navbar from "../components/Navbar";
import SlimBar from "../components/SlimBar";
import Footer from "../components/Footer";
import Hero from "../components/Hero";
import ProductGrid from "../components/ProductGrid";

export default function Home() {
  return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <SlimBar />
        <main className="flex-grow">
          <Hero />
          <ProductGrid />
        </main>
        <Footer />
      </div>
  );
}

