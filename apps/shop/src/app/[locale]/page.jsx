import React from "react";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import LandingContainers from "@/components/landing/LandingContainers";
import LandingPopup from "@/components/landing/LandingPopup";
import Breadcrumbs from "@/components/Breadcrumbs";
import { SectionErrorBoundary } from "@/components/ErrorBoundary";
import { fetchLandingPage } from "@/lib/landing-page-fetch";

// Server-rendered: the homepage's landing containers (hero banner + everything else) used to be
// fetched entirely client-side (empty HTML -> JS -> fetch -> fetch -> images), which was the
// primary driver of the PageSpeed LCP/CLS failure. Fetching here means the hero image URL is
// already in the initial HTML response instead of two round trips deep.
export default async function Home() {
  const data = await fetchLandingPage();
  const initialContainers = Array.isArray(data?.containers) ? data.containers : [];
  const initialSettings = data?.settings && typeof data.settings === "object" ? data.settings : {};

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />
      <main className="flex-grow bg-white">
        <SectionErrorBoundary>
          <LandingContainers initialContainers={initialContainers} initialSettings={initialSettings} />
        </SectionErrorBoundary>
        <div className="container mx-auto px-4 py-8">
          <Breadcrumbs />
        </div>
      </main>
      <Footer />
      <SectionErrorBoundary>
        <LandingPopup />
      </SectionErrorBoundary>
    </div>
  );
}
