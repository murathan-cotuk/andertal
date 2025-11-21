"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import AppsPage from "@/components/pages/AppsPage";

export default function Apps() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <AppsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

