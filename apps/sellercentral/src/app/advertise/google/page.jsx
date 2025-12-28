"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import GoogleAdsPage from "@/components/pages/advertise/GoogleAdsPage";

export default function GoogleAds() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <GoogleAdsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

