"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import StorePage from "@/components/pages/StorePage";

export default function Store() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <StorePage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

