"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import OrdersPage from "@/components/pages/OrdersPage";

export default function Orders() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <OrdersPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

