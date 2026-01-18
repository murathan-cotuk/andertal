"use client";

import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@/lib/apollo-client";
import { CustomerAuthProvider } from "@belucha/lib";

export default function Providers({ children }) {
  return (
    <ApolloProvider client={apolloClient}>
      <CustomerAuthProvider>{children}</CustomerAuthProvider>
    </ApolloProvider>
  );
}

