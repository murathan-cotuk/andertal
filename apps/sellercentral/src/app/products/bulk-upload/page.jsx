"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import BulkUploadPage from "@/components/pages/products/BulkUploadPage";

export default function BulkUpload() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <BulkUploadPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

