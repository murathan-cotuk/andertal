/**
 * Role Guards - Route protection and role-based access control
 * 
 * Provides:
 * - Route protection (authenticated users only)
 * - Role-based access control (customer vs seller)
 * - Redirect logic (unauthorized → login)
 * - Server-side safe (Next.js middleware uyumlu)
 * - Reusable guard patterns (HOC + Hook + Component)
 * 
 * @module roleGuards
 */

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getToken, isTokenValid, getTokenClaims } from './tokenService.js';

/**
 * @typedef {'customer' | 'seller'} UserType
 */

/**
 * @typedef {Object} GuardOptions
 * @property {UserType} [requiredRole] - Required user type ('customer' or 'seller')
 * @property {string} [redirectTo] - Redirect path if unauthorized
 * @property {boolean} [redirectIfAuthenticated] - Redirect if already logged in (for login pages)
 */

/**
 * Server-side authentication guard
 * NOTE: Only for Next.js Pages Router (getServerSideProps)
 * For App Router, use middleware.ts instead
 * 
 * @deprecated Use middleware.ts for App Router
 * 
 * @param {Object} context - Next.js context (req, res, resolvedUrl)
 * @param {GuardOptions} options - Guard options
 * @returns {Object|null} Redirect object or null if authorized
 * 
 * @example
 * // In getServerSideProps (Pages Router only)
 * export async function getServerSideProps(context) {
 *   const guardResult = serverSideAuthGuard(context, {
 *     requiredRole: 'customer',
 *     redirectTo: '/login'
 *   });
 *   if (guardResult) return guardResult;
 *   
 *   return { props: {} };
 * }
 */
export function serverSideAuthGuard(context, options = {}) {
  const {
    requiredRole = 'customer',
    redirectTo = '/login',
    redirectIfAuthenticated = false,
  } = options;

  // Get token from cookies (Next.js req.cookies)
  const cookies = context.req?.cookies || {};
  const tokenKey = `belucha_${requiredRole}_token`;
  const token = cookies[tokenKey];

  // Check if user is authenticated
  const isAuthenticated = token && isTokenValid(token);

  // Redirect if already authenticated (for login pages)
  if (redirectIfAuthenticated && isAuthenticated) {
    const destination = requiredRole === 'customer' ? '/' : '/';
    return {
      redirect: {
        destination,
        permanent: false,
      },
    };
  }

  // Redirect if not authenticated
  if (!redirectIfAuthenticated && !isAuthenticated) {
    const resolvedUrl = context.resolvedUrl || context.req?.url || '/';
    return {
      redirect: {
        destination: `${redirectTo}?redirect=${encodeURIComponent(resolvedUrl)}`,
        permanent: false,
      },
    };
  }

  // Check role if token exists
  if (isAuthenticated && requiredRole) {
    const claims = getTokenClaims(token);
    const userRole = claims?.role || claims?.collection; // Payload uses 'collection' field
    
    // Role mismatch (e.g., seller trying to access customer route)
    if (userRole && userRole !== requiredRole) {
      console.warn(`[roleGuards] Role mismatch: expected ${requiredRole}, got ${userRole}`);
      return {
        redirect: {
          destination: '/unauthorized',
          permanent: false,
        },
      };
    }
  }

  // Authorized
  return null;
}

/**
 * Client-side authentication guard hook
 * Redirects to login if not authenticated
 * 
 * @param {GuardOptions} options - Guard options
 * 
 * @example
 * function AccountPage() {
 *   useAuthGuard({ requiredRole: 'customer', redirectTo: '/login' });
 *   return <div>Protected content</div>;
 * }
 */
export function useAuthGuard(options = {}) {
  const {
    requiredRole = 'customer',
    redirectTo = '/login',
    redirectIfAuthenticated = false,
  } = options;

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check if user is authenticated
    const token = getToken(requiredRole);
    const isAuthenticated = token && isTokenValid(token);

    // Redirect if already authenticated (for login pages)
    if (redirectIfAuthenticated && isAuthenticated) {
      const destination = requiredRole === 'customer' ? '/' : '/';
      router.replace(destination);
      return;
    }

    // Redirect if not authenticated
    if (!redirectIfAuthenticated && !isAuthenticated) {
      router.replace(`${redirectTo}?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    // Check role if authenticated
    if (isAuthenticated && requiredRole) {
      const claims = getTokenClaims(token);
      const userRole = claims?.role || claims?.collection;

      // Role mismatch
      if (userRole && userRole !== requiredRole) {
        console.warn(`[roleGuards] Role mismatch: expected ${requiredRole}, got ${userRole}`);
        router.replace('/unauthorized');
      }
    }
  }, [requiredRole, redirectTo, redirectIfAuthenticated, router, pathname]);
}

/**
 * Higher-Order Component for route protection
 * Wraps a component and adds authentication guard
 * 
 * @param {React.Component} Component - Component to protect
 * @param {GuardOptions} options - Guard options
 * @returns {React.Component} Protected component
 * 
 * @example
 * const ProtectedAccount = withAuthGuard(AccountPage, {
 *   requiredRole: 'customer',
 *   redirectTo: '/login'
 * });
 */
export function withAuthGuard(Component, options = {}) {
  const ProtectedComponent = (props) => {
    useAuthGuard(options);
    return <Component {...props} />;
  };

  ProtectedComponent.displayName = `withAuthGuard(${Component.displayName || Component.name || 'Component'})`;

  return ProtectedComponent;
}

/**
 * Check if current user has required role
 * @param {UserType} requiredRole - Required role
 * @returns {boolean} True if user has role
 * 
 * @example
 * if (hasRole('seller')) {
 *   // Show seller-only content
 * }
 */
export function hasRole(requiredRole) {
  try {
    const token = getToken(requiredRole);
    if (!token || !isTokenValid(token)) {
      return false;
    }

    const claims = getTokenClaims(token);
    const userRole = claims?.role || claims?.collection;

    return userRole === requiredRole;
  } catch (error) {
    console.error('[roleGuards] Error checking role:', error);
    return false;
  }
}

/**
 * Get current user role from any valid token
 * @returns {UserType|null} User role or null
 * 
 * @example
 * const role = getCurrentRole();
 * if (role === 'seller') {
 *   // Seller-specific logic
 * }
 */
export function getCurrentRole() {
  try {
    // Check customer token first
    const customerToken = getToken('customer');
    if (customerToken && isTokenValid(customerToken)) {
      return 'customer';
    }

    // Check seller token
    const sellerToken = getToken('seller');
    if (sellerToken && isTokenValid(sellerToken)) {
      return 'seller';
    }

    return null;
  } catch (error) {
    console.error('[roleGuards] Error getting current role:', error);
    return null;
  }
}

/**
 * Check if any user is authenticated (customer or seller)
 * @returns {boolean} True if any user is logged in
 */
export function isAnyUserAuthenticated() {
  return hasRole('customer') || hasRole('seller');
}

/**
 * Protected Route Component
 * Alternative to HOC pattern
 * 
 * @example
 * <ProtectedRoute requiredRole="customer" redirectTo="/login">
 *   <AccountPage />
 * </ProtectedRoute>
 */
export function ProtectedRoute({ children, requiredRole = 'customer', redirectTo = '/login' }) {
  useAuthGuard({ requiredRole, redirectTo });
  return <>{children}</>;
}

