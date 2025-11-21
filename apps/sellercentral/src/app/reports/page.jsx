"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import ReportsPage from "@/components/pages/ReportsPage";

export default function Reports() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <ReportsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

