"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import UploadTemplatesPage from "@/components/pages/products/UploadTemplatesPage";

export default function UploadTemplates() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <UploadTemplatesPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

