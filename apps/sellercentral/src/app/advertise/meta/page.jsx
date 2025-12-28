"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import MetaAdsPage from "@/components/pages/advertise/MetaAdsPage";

export default function MetaAds() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <MetaAdsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

