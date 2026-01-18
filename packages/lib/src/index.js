// Apollo Client
export * from "./apollo/client.js";

// SEO
export * from "./seo/helpers.js";

// Stripe
export * from "./stripe/client.js";

// Auth
export * from "./auth/tokenService.js";
export {
  CustomerAuthProvider,
  useCustomerAuth,
  CustomerAuthContext,
  SellerAuthProvider,
  useSellerAuth,
  SellerAuthContext,
  AuthProvider, // Default customer provider
  useAuth, // Default customer hook
} from "./auth/AuthContext.jsx";
export {
  serverSideAuthGuard,
  useAuthGuard,
  withAuthGuard,
  hasRole,
  getCurrentRole,
  isAnyUserAuthenticated,
  ProtectedRoute,
} from "./auth/roleGuards.js";

