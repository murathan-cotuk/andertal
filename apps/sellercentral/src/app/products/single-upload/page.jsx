"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import SingleUploadPage from "@/components/pages/products/SingleUploadPage";

export default function SingleUpload() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <SingleUploadPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

