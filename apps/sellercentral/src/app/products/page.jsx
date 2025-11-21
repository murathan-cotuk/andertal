"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import ProductsPage from "@/components/pages/ProductsPage";

export default function Products() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <ProductsPage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

