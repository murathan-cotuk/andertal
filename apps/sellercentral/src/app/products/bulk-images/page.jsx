"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import BulkImagesPage from "@/components/pages/products/BulkImagesPage";

export default function BulkImages() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <BulkImagesPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

