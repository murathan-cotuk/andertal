import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { getToken } from "@belucha/lib";

const httpLink = createHttpLink({
  uri: '/api/graphql', // Payload CMS GraphQL endpoint (Next.js plugin)
});

const authLink = setContext((_, { headers }) => {
  // Use new token service for customer token
  const token = typeof window !== "undefined" ? getToken('customer') : null;
  
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    },
  };
});

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: "cache-and-network",
    },
  },
});

