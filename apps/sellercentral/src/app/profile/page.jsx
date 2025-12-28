"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import ProfilePage from "@/components/pages/ProfilePage";

export default function Profile() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <ProfilePage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

