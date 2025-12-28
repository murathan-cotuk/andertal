"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import OrdersReturnsPage from "@/components/pages/orders/OrdersReturnsPage";

export default function OrdersReturns() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <OrdersReturnsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

