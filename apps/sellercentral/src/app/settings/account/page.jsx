"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import AccountSettingsPage from "@/components/pages/settings/AccountSettingsPage";

export default function AccountSettings() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <AccountSettingsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

