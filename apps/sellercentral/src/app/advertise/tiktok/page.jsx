"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import TikTokAdsPage from "@/components/pages/advertise/TikTokAdsPage";

export default function TikTokAds() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <TikTokAdsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

