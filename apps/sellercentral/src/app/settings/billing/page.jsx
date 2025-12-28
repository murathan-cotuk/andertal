"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import BillingSettingsPage from "@/components/pages/settings/BillingSettingsPage";

export default function BillingSettings() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <BillingSettingsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

