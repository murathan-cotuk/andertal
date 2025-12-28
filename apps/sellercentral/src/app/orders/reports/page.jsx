"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import OrdersReportsPage from "@/components/pages/orders/OrdersReportsPage";

export default function OrdersReports() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <OrdersReportsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

