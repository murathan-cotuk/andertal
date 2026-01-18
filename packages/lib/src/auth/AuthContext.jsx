/**
 * AuthContext - React Context wrapper for Token Service
 * 
 * Provides authentication state management with:
 * - Token Service integration
 * - Auto token migration on mount
 * - Token refresh checking (5min interval)
 * - Role-based context separation (Customer vs Seller)
 * - SSR-safe implementation
 * - State caching (avoids unnecessary localStorage reads)
 * 
 * @module AuthContext
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

import {
  getToken,
  setToken,
  removeToken,
  getUser,
  setUser,
  removeUser,
  isTokenValid,
  getTokenClaims,
  shouldRefreshToken,
  isLoggedIn as checkLoggedIn,
  clearAuth,
  migrateOldTokens,
} from './tokenService.js';

/**
 * @typedef {'customer' | 'seller'} UserType
 */

/**
 * @typedef {Object} AuthState
 * @property {boolean} isAuthenticated - Whether user is logged in
 * @property {boolean} isLoading - Whether auth state is being determined
 * @property {string|null} token - Current JWT token
 * @property {string|null} userId - Current user ID
 * @property {Object|null} user - Decoded token claims (email, role, etc.)
 * @property {Function} login - Login function
 * @property {Function} logout - Logout function
 * @property {Function} refreshToken - Refresh token function (placeholder)
 * @property {UserType} userType - User type for debugging
 */

/**
 * Create a typed auth context
 * @param {UserType} userType - 'customer' or 'seller'
 * @returns {Object} Context and Provider
 */
function createAuthContext(userType) {
  const AuthContext = createContext(null);

  /**
   * Auth Provider Component
   */
  function AuthProvider({ children }) {
    // State
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [token, setTokenState] = useState(null);
    const [userId, setUserIdState] = useState(null);
    const [user, setUserState] = useState(null);

    /**
     * Initialize auth state from storage
     */
    const initializeAuth = useCallback(() => {
      try {
        // Run migration on first mount
        const migrations = migrateOldTokens();
        if (migrations.customer?.migrated || migrations.seller?.migrated) {
          console.info(`[AuthContext:${userType}] Migration completed:`, migrations);
        }

        // Check if user is logged in
        const isLoggedIn = checkLoggedIn(userType);
        if (!isLoggedIn) {
          setIsLoading(false);
          return;
        }

        // Get token from storage
        const storedToken = getToken(userType);
        if (!storedToken) {
          // Token was invalid/expired and auto-removed
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        // Validate token
        if (!isTokenValid(storedToken)) {
          console.warn(`[AuthContext:${userType}] Stored token is invalid, clearing auth`);
          clearAuth(userType);
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        // Get user ID and claims
        const storedUserId = getUser(userType);
        const claims = getTokenClaims(storedToken);

        // Update state
        setTokenState(storedToken);
        setUserIdState(storedUserId);
        setUserState(claims);
        setIsAuthenticated(true);

        console.info(`[AuthContext:${userType}] Auth initialized for user:`, storedUserId);
      } catch (error) {
        console.error(`[AuthContext:${userType}] Initialization error:`, error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    }, [userType]);

    /**
     * Login function
     * @param {string} jwtToken - JWT token from backend
     * @param {string} uid - User ID
     */
    const login = useCallback((jwtToken, uid) => {
      try {
        // Validate token format
        if (!isTokenValid(jwtToken)) {
          throw new Error('Invalid token format');
        }

        // Store token and user ID
        setToken(jwtToken, userType);
        setUser(uid, userType);

        // Get claims
        const claims = getTokenClaims(jwtToken);

        // Update state
        setTokenState(jwtToken);
        setUserIdState(uid);
        setUserState(claims);
        setIsAuthenticated(true);

        console.info(`[AuthContext:${userType}] User logged in:`, uid);
      } catch (error) {
        console.error(`[AuthContext:${userType}] Login error:`, error);
        throw error;
      }
    }, [userType]);

    /**
     * Logout function
     */
    const logout = useCallback(() => {
      try {
        // Clear storage
        clearAuth(userType);

        // Clear state
        setTokenState(null);
        setUserIdState(null);
        setUserState(null);
        setIsAuthenticated(false);

        console.info(`[AuthContext:${userType}] User logged out`);
      } catch (error) {
        console.error(`[AuthContext:${userType}] Logout error:`, error);
      }
    }, [userType]);

    /**
     * Refresh token function (placeholder - backend not ready)
     * @returns {Promise<boolean>} Success status
     */
    const refreshToken = useCallback(async () => {
      console.warn(`[AuthContext:${userType}] Token refresh not implemented yet`);
      
      // TODO: Call backend refresh endpoint
      // const newToken = await fetch('/api/auth/refresh', {
      //   headers: { Authorization: `Bearer ${token}` }
      // });
      // login(newToken, userId);
      
      return false;
    }, [token, userId, login, userType]);

    /**
     * Check if token needs refresh (on mount and periodically)
     */
    useEffect(() => {
      if (!isAuthenticated || !token) return;

      const checkRefresh = () => {
        if (shouldRefreshToken(token)) {
          console.info(`[AuthContext:${userType}] Token refresh recommended`);
          // Auto-refresh when backend is ready
          // refreshToken();
        }
      };

      // Check immediately
      checkRefresh();

      // Check every 5 minutes
      const interval = setInterval(checkRefresh, 5 * 60 * 1000);

      return () => clearInterval(interval);
    }, [isAuthenticated, token, userType]);

    /**
     * Initialize on mount
     */
    useEffect(() => {
      initializeAuth();
    }, [initializeAuth]);

    // Context value
    const value = {
      isAuthenticated,
      isLoading,
      token,
      userId,
      user,
      login,
      logout,
      refreshToken,
      userType, // Expose userType for debugging
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  /**
   * Hook to use auth context
   * @returns {AuthState}
   */
  function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
      throw new Error(`useAuth must be used within ${userType}AuthProvider`);
    }
    return context;
  }

  return { AuthProvider, useAuth, AuthContext };
}

// ===== Customer Auth Context =====
export const {
  AuthProvider: CustomerAuthProvider,
  useAuth: useCustomerAuth,
  AuthContext: CustomerAuthContext,
} = createAuthContext('customer');

// ===== Seller Auth Context =====
export const {
  AuthProvider: SellerAuthProvider,
  useAuth: useSellerAuth,
  AuthContext: SellerAuthContext,
} = createAuthContext('seller');

// ===== Default exports (for backward compatibility) =====
export const AuthProvider = CustomerAuthProvider;
export const useAuth = useCustomerAuth;

