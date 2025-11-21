"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import InventoryPage from "@/components/pages/InventoryPage";

export default function Inventory() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <InventoryPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

