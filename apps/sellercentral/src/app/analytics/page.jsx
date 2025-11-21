"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import AnalyticsPage from "@/components/pages/AnalyticsPage";

export default function Analytics() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <AnalyticsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

