"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import SecuritySettingsPage from "@/components/pages/settings/SecuritySettingsPage";

export default function SecuritySettings() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <SecuritySettingsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

