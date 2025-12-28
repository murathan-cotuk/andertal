"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@belucha/lib";
import DashboardLayout from "@/components/DashboardLayout";
import AdvertisePage from "@/components/pages/AdvertisePage";

export default function Advertise() {
  return (
    <ApolloProvider client={apolloClient}>
      <DashboardLayout>
        <AdvertisePage />
      </DashboardLayout>
    </ApolloProvider>
  );
}

