/**
 * Token Service - Centralized token management for Belucha E-Commerce
 * 
 * Provides localStorage abstraction for JWT token management with:
 * - Token storage and retrieval
 * - Token validation and expiry checking
 * - JWT claims parsing
 * - Role-based token separation (Customer vs Seller)
 * - SSR safety
 * - Future-proof design for httpOnly cookie migration
 * 
 * @module tokenService
 */

import { jwtDecode } from 'jwt-decode';

/**
 * @typedef {'customer' | 'seller'} UserType
 */

/**
 * @typedef {Object} TokenClaims
 * @property {number} [exp] - Expiration timestamp (Unix)
 * @property {number} [iat] - Issued at timestamp (Unix)
 * @property {string} [sub] - Subject (user ID)
 * @property {string} [role] - User role
 * @property {string} [email] - User email
 */

/**
 * @typedef {Object} MigrationResult
 * @property {boolean} migrated - Whether migration occurred
 * @property {string[]} keys - Migrated key names
 */

/**
 * Storage key constants to prevent typos
 * @private
 */
const STORAGE_KEYS = {
  customer: {
    token: "belucha_customer_token",
    id: "belucha_customer_id",
    loggedIn: "belucha_customer_logged_in",
  },
  seller: {
    token: "belucha_seller_token",
    id: "belucha_seller_id",
    loggedIn: "belucha_seller_logged_in",
  },
};

/**
 * Get storage keys for user type
 * @private
 * @param {UserType} userType
 * @returns {Object} Storage keys
 * @throws {Error} If invalid userType
 */
function getStorageKeys(userType) {
  const keys = STORAGE_KEYS[userType];
  if (!keys) {
    throw new Error(`[TokenService] Invalid userType: ${userType}. Must be 'customer' or 'seller'`);
  }
  return keys;
}

/**
 * Check if running in browser environment (SSR safety)
 * @returns {boolean}
 */
const isBrowser = () => {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
};

/**
 * Safe localStorage getter with SSR check
 * @param {string} key - Storage key
 * @returns {string | null}
 */
const safeGetItem = (key) => {
  if (!isBrowser()) {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`[tokenService] Error reading localStorage key "${key}":`, error);
    return null;
  }
};

/**
 * Safe localStorage setter with SSR check
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} - Success status
 */
const safeSetItem = (key, value) => {
  if (!isBrowser()) {
    return false;
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`[tokenService] Error writing localStorage key "${key}":`, error);
    return false;
  }
};

/**
 * Safe localStorage remover with SSR check
 * @param {string} key - Storage key
 * @returns {boolean} - Success status
 */
const safeRemoveItem = (key) => {
  if (!isBrowser()) {
    return false;
  }
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`[tokenService] Error removing localStorage key "${key}":`, error);
    return false;
  }
};

/**
 * Validate JWT token format (basic structure check)
 * @param {string} token - JWT token string
 * @returns {boolean}
 */
const isValidTokenFormat = (token) => {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // JWT format: header.payload.signature (3 parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }
  
  // Each part should be base64url encoded (non-empty)
  return parts.every(part => part.length > 0);
};

/**
 * Decode JWT token and extract claims
 * @param {string} token - JWT token string
 * @returns {object | null} - Decoded token claims or null if invalid
 */
const decodeToken = (token) => {
  if (!isValidTokenFormat(token)) {
    return null;
  }
  
  try {
    return jwtDecode(token);
  } catch (error) {
    console.error('[tokenService] Error decoding token:', error);
    return null;
  }
};

/**
 * Check if token is expired
 * @param {string} token - JWT token string
 * @returns {boolean} - True if expired, invalid, or missing expiry
 */
const isTokenExpired = (token) => {
  try {
    if (!token || typeof token !== "string") {
      return true; // Invalid token = treat as expired
    }

    const claims = decodeToken(token);
    if (!claims) {
      return true; // Parse failed = treat as expired
    }

    // ✅ CRITICAL: If no exp claim, treat as expired (security)
    if (!claims.exp || typeof claims.exp !== "number") {
      console.warn("[TokenService] Token missing valid exp claim - treating as expired");
      return true;
    }

    // ✅ Use <= instead of < (if exp === now, it's expired)
    const now = Math.floor(Date.now() / 1000);
    const isExpired = claims.exp <= now;

    if (isExpired) {
      console.info(
        `[TokenService] Token expired at ${new Date(claims.exp * 1000).toISOString()}`
      );
    }

    return isExpired;
  } catch (error) {
    console.error("[TokenService] Error checking token expiry:", error);
    return true; // Error = treat as expired
  }
};

/**
 * Check if token should be refreshed
 * Refreshes at 80% of token lifetime to prevent expiry during requests
 * 
 * @param {string} token - JWT token
 * @returns {boolean} - True if refresh needed
 * 
 * @example
 * // Token issued at 10:00, expires at 11:00 (1 hour lifetime)
 * // At 10:48 (80% elapsed) → returns true
 */
const shouldRefreshToken = (token) => {
  try {
    if (!token || !isValidTokenFormat(token)) {
      return true; // Invalid/expired = refresh needed
    }

    const claims = decodeToken(token);
    if (!claims || !claims.exp || !claims.iat) {
      return true; // Missing claims = refresh needed
    }

    const now = Math.floor(Date.now() / 1000);
    const totalLifetime = claims.exp - claims.iat; // Token lifetime in seconds
    const elapsed = now - claims.iat; // Time elapsed since issuance

    // Refresh at 80% of token lifetime
    // Example: 1 hour token → refresh after 48 minutes
    const shouldRefresh = elapsed >= totalLifetime * 0.8;

    if (shouldRefresh) {
      console.info(
        `[TokenService] Token refresh recommended (${Math.floor(elapsed / 60)}m/${Math.floor(totalLifetime / 60)}m elapsed)`
      );
    }

    return shouldRefresh;
  } catch (error) {
    console.error("[TokenService] Error checking refresh status:", error);
    return true; // Error = refresh needed
  }
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Token Storage API
 */

/**
 * Store JWT token for a user type
 * @param {string} token - JWT token string
 * @param {UserType} userType - 'customer' | 'seller'
 * @returns {boolean} - Success status
 */
export const setToken = (token, userType) => {
  if (!token || !userType) {
    console.error('[tokenService] setToken: token and userType are required');
    return false;
  }
  
  if (userType !== 'customer' && userType !== 'seller') {
    console.error(`[tokenService] setToken: Invalid userType "${userType}". Must be "customer" or "seller"`);
    return false;
  }
  
  // Validate token format before storing
  if (!isValidTokenFormat(token)) {
    console.error('[tokenService] setToken: Invalid token format');
    return false;
  }
  
  // Check if token is already expired
  if (isTokenExpired(token)) {
    console.warn('[tokenService] setToken: Token is expired, storing anyway (backend should handle refresh)');
  }
  
  const keys = getStorageKeys(userType);
  const success = safeSetItem(keys.token, token);
  
  if (success) {
    // Also set logged_in flag
    safeSetItem(keys.loggedIn, 'true');
  }
  
  return success;
};

/**
 * Retrieve JWT token for a user type
 * @param {UserType} userType - 'customer' | 'seller'
 * @returns {string | null} - Token string or null if not found/invalid
 */
export const getToken = (userType) => {
  if (!userType) {
    console.error('[tokenService] getToken: userType is required');
    return null;
  }
  
  if (userType !== 'customer' && userType !== 'seller') {
    console.error(`[tokenService] getToken: Invalid userType "${userType}". Must be "customer" or "seller"`);
    return null;
  }
  
  const keys = getStorageKeys(userType);
  const token = safeGetItem(keys.token);
  
  if (!token) {
    return null;
  }
  
  // Validate token format
  if (!isValidTokenFormat(token)) {
    console.warn(`[tokenService] getToken: Invalid token format for ${userType}, removing`);
    removeToken(userType);
    return null;
  }
  
  // Check if token is expired
  if (isTokenExpired(token)) {
    console.warn(`[tokenService] getToken: Token expired for ${userType}, removing`);
    removeToken(userType);
    return null;
  }
  
  return token;
};

/**
 * Remove JWT token for a user type (logout)
 * @param {UserType} userType - 'customer' | 'seller'
 * @returns {boolean} - Success status
 */
export const removeToken = (userType) => {
  if (!userType) {
    console.error('[tokenService] removeToken: userType is required');
    return false;
  }
  
  if (userType !== 'customer' && userType !== 'seller') {
    console.error(`[tokenService] removeToken: Invalid userType "${userType}". Must be "customer" or "seller"`);
    return false;
  }
  
  const keys = getStorageKeys(userType);
  
  safeRemoveItem(keys.token);
  safeRemoveItem(keys.id);
  safeRemoveItem(keys.loggedIn);
  
  return true;
};

/**
 * User Data API
 */

/**
 * Store user ID for a user type
 * @param {string} userId - User ID string
 * @param {UserType} userType - 'customer' | 'seller'
 * @returns {boolean} - Success status
 */
export const setUser = (userId, userType) => {
  if (!userId || !userType) {
    console.error('[tokenService] setUser: userId and userType are required');
    return false;
  }
  
  if (userType !== 'customer' && userType !== 'seller') {
    console.error(`[tokenService] setUser: Invalid userType "${userType}". Must be "customer" or "seller"`);
    return false;
  }
  
  const keys = getStorageKeys(userType);
  return safeSetItem(keys.id, String(userId));
};

/**
 * Retrieve user ID for a user type
 * @param {UserType} userType - 'customer' | 'seller'
 * @returns {string | null} - User ID or null if not found
 */
export const getUser = (userType) => {
  if (!userType) {
    console.error('[tokenService] getUser: userType is required');
    return null;
  }
  
  if (userType !== 'customer' && userType !== 'seller') {
    console.error(`[tokenService] getUser: Invalid userType "${userType}". Must be "customer" or "seller"`);
    return null;
  }
  
  const keys = getStorageKeys(userType);
  return safeGetItem(keys.id);
};

/**
 * Remove user ID for a user type
 * @param {UserType} userType - 'customer' | 'seller'
 * @returns {boolean} - Success status
 */
export const removeUser = (userType) => {
  if (!userType) {
    console.error('[tokenService] removeUser: userType is required');
    return false;
  }
  
  if (userType !== 'customer' && userType !== 'seller') {
    console.error(`[tokenService] removeUser: Invalid userType "${userType}". Must be "customer" or "seller"`);
    return false;
  }
  
  const keys = getStorageKeys(userType);
  return safeRemoveItem(keys.id);
};

/**
 * Validation API
 */

/**
 * Check if a token is valid (format + expiry)
 * @param {string} token - JWT token string
 * @returns {boolean}
 */
export const isTokenValid = (token) => {
  if (!token) {
    return false;
  }
  
  if (!isValidTokenFormat(token)) {
    return false;
  }
  
  if (isTokenExpired(token)) {
    return false;
  }
  
  return true;
};

/**
 * Check if a token is expired
 * @param {string} token - JWT token string
 * @returns {boolean}
 */
export { isTokenExpired };

/**
 * Decode JWT token and return claims
 * @param {string} token - JWT token string
 * @returns {object | null} - Decoded token claims or null if invalid
 */
export const getTokenClaims = (token) => {
  return decodeToken(token);
};

/**
 * Refresh Token API (Placeholder - backend not ready)
 */

/**
 * Check if token should be refreshed
 * @param {string} token - JWT token string
 * @param {number} minutesBeforeExpiry - Minutes before expiry to trigger refresh (default: 5)
 * @returns {boolean}
 */
export { shouldRefreshToken };

/**
 * Check if user is logged in (has valid token)
 * @param {UserType} userType - 'customer' | 'seller'
 * @returns {boolean}
 */
export const isLoggedIn = (userType) => {
  const token = getToken(userType);
  return token !== null && isTokenValid(token);
};

/**
 * Clear all authentication data for a user type (full logout)
 * @param {UserType} userType - 'customer' | 'seller'
 * @returns {boolean} - Success status
 */
export const clearAuth = (userType) => {
  return removeToken(userType) && removeUser(userType);
};

/**
 * Get all stored tokens (for debugging/migration purposes)
 * @returns {object} - Object with customer and seller tokens
 */
export const getAllTokens = () => {
  const customerKeys = getStorageKeys('customer');
  const sellerKeys = getStorageKeys('seller');
  return {
    customer: safeGetItem(customerKeys.token),
    seller: safeGetItem(sellerKeys.token),
  };
};

/**
 * Clear all authentication data (full cleanup - use with caution)
 * @returns {boolean} - Success status
 */
export const clearAllAuth = () => {
  const customerCleared = clearAuth('customer');
  const sellerCleared = clearAuth('seller');
  return customerCleared && sellerCleared;
};

/**
 * Migrate old localStorage keys to new format
 * Should be called once on app initialization (AuthContext mount)
 * 
 * Old keys:
 * - Customer: 'token', 'customerId', 'customerLoggedIn'
 * - Seller: 'token', 'sellerId', 'sellerLoggedIn'
 * 
 * @returns {Object} Migration summary
 */
export function migrateOldTokens() {
  if (typeof window === "undefined") {
    return { migrated: false, reason: "SSR - no window" };
  }

  const migrations = {
    customer: { migrated: false, keys: [] },
    seller: { migrated: false, keys: [] },
  };

  try {
    // ===== Customer Migration =====
    const oldCustomerToken = localStorage.getItem("token");
    const oldCustomerId = localStorage.getItem("customerId");
    const oldCustomerLoggedIn = localStorage.getItem("customerLoggedIn");

    if (oldCustomerToken || oldCustomerId || oldCustomerLoggedIn) {
      console.info("[TokenService] 🔄 Migrating old customer tokens...");

      if (oldCustomerToken && isTokenValid(oldCustomerToken)) {
        setToken(oldCustomerToken, "customer");
        migrations.customer.keys.push("token");
      }

      if (oldCustomerId) {
        setUser(oldCustomerId, "customer");
        migrations.customer.keys.push("customerId");
      }

      // Clean up old keys
      localStorage.removeItem("token");
      localStorage.removeItem("customerId");
      localStorage.removeItem("customerLoggedIn");

      migrations.customer.migrated = true;
      console.info("[TokenService] ✅ Customer migration completed");
    }

    // ===== Seller Migration =====
    const oldSellerToken = localStorage.getItem("sellerToken"); // If exists
    const oldSellerId = localStorage.getItem("sellerId");
    const oldSellerLoggedIn = localStorage.getItem("sellerLoggedIn");

    if (oldSellerToken || oldSellerId || oldSellerLoggedIn) {
      console.info("[TokenService] 🔄 Migrating old seller tokens...");

      if (oldSellerToken && isTokenValid(oldSellerToken)) {
        setToken(oldSellerToken, "seller");
        migrations.seller.keys.push("sellerToken");
      }

      if (oldSellerId) {
        setUser(oldSellerId, "seller");
        migrations.seller.keys.push("sellerId");
      }

      // Clean up old keys
      localStorage.removeItem("sellerToken");
      localStorage.removeItem("sellerId");
      localStorage.removeItem("sellerLoggedIn");

      migrations.seller.migrated = true;
      console.info("[TokenService] ✅ Seller migration completed");
    }

    return migrations;
  } catch (error) {
    console.error("[TokenService] ❌ Migration failed:", error);
    return migrations;
  }
}

