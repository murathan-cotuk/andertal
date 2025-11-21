"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import MediaPage from "@/components/pages/MediaPage";

export default function Media() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <MediaPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

