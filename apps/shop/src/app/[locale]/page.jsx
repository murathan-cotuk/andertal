"use client";

import React from "react";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import LandingContainers from "@/components/landing/LandingContainers";
import Breadcrumbs from "@/components/Breadcrumbs";
import { SectionErrorBoundary } from "@/components/ErrorBoundary";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />
      <main className="flex-grow bg-white">
        <SectionErrorBoundary>
          <LandingContainers />
        </SectionErrorBoundary>
        <div className="container mx-auto px-4 py-8">
          <Breadcrumbs />
        </div>
      </main>
      <Footer />
    </div>
  );
}
