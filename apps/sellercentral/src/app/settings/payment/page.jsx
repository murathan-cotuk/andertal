"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import PaymentSettingsPage from "@/components/pages/settings/PaymentSettingsPage";

export default function PaymentSettings() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <PaymentSettingsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

