"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import BulkVideosPage from "@/components/pages/products/BulkVideosPage";

export default function BulkVideos() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <BulkVideosPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

