"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardHome from "@/components/DashboardHome";

export default function Home() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <DashboardHome />
      </DashboardLayout>
    </ApolloProvider>
  );
}

