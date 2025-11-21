"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import BrandPage from "@/components/pages/BrandPage";

export default function Brand() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <BrandPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

