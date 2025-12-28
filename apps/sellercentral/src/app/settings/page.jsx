"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import SettingsPage from "@/components/pages/SettingsPage";

export default function Settings() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <SettingsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

