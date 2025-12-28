"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import PinterestAdsPage from "@/components/pages/advertise/PinterestAdsPage";

export default function PinterestAds() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <PinterestAdsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

