"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import NotificationSettingsPage from "@/components/pages/settings/NotificationSettingsPage";

export default function NotificationSettings() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <NotificationSettingsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

