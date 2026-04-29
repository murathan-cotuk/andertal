/**
 * Role Guards Test Components
 * 
 * Manual test components for roleGuards functionality
 * 
 * Usage:
 * import { TestHookComponent, TestHOCComponent, TestComponentPattern } from '@andertal/lib/auth/__tests__/roleGuards.test.jsx';
 */

import React from 'react';
import { useAuthGuard, withAuthGuard, ProtectedRoute, hasRole, getCurrentRole } from '../roleGuards.js';

/**
 * Test Component 1: Hook pattern
 */
export function TestHookComponent() {
  useAuthGuard({ requiredRole: 'customer', redirectTo: '/login' });
  
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>Protected with Hook Pattern</h2>
      <p><strong>Current role:</strong> {getCurrentRole() || 'None'}</p>
      <p><strong>Has customer role:</strong> {hasRole('customer') ? '✅ Yes' : '❌ No'}</p>
      <p><strong>Has seller role:</strong> {hasRole('seller') ? '✅ Yes' : '❌ No'}</p>
      <p style={{ color: '#666', fontSize: '12px' }}>
        This component uses useAuthGuard hook. If not authenticated, it will redirect to /login.
      </p>
    </div>
  );
}

/**
 * Test Component 2: HOC pattern
 */
const BaseComponent = function BaseComponent() {
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>Protected with HOC Pattern</h2>
      <p><strong>Current role:</strong> {getCurrentRole() || 'None'}</p>
      <p style={{ color: '#666', fontSize: '12px' }}>
        This component is wrapped with withAuthGuard HOC. If not authenticated, it will redirect to /login.
      </p>
    </div>
  );
};

export const TestHOCComponent = withAuthGuard(
  BaseComponent,
  { requiredRole: 'customer', redirectTo: '/login' }
);

/**
 * Test Component 3: Component pattern
 */
export function TestComponentPattern() {
  return (
    <ProtectedRoute requiredRole="customer" redirectTo="/login">
      <div style={{ padding: '20px', fontFamily: 'monospace' }}>
        <h2>Protected with Component Pattern</h2>
        <p><strong>Current role:</strong> {getCurrentRole() || 'None'}</p>
        <p style={{ color: '#666', fontSize: '12px' }}>
          This component is wrapped with ProtectedRoute component. If not authenticated, it will redirect to /login.
        </p>
      </div>
    </ProtectedRoute>
  );
}

/**
 * Test Component 4: Role check utilities
 */
export function TestRoleUtilities() {
  const currentRole = getCurrentRole();
  const hasCustomerRole = hasRole('customer');
  const hasSellerRole = hasRole('seller');
  
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
      <h3>Role Utilities Test</h3>
      <p><strong>getCurrentRole():</strong> {currentRole || 'null'}</p>
      <p><strong>hasRole('customer'):</strong> {hasCustomerRole ? '✅ true' : '❌ false'}</p>
      <p><strong>hasRole('seller'):</strong> {hasSellerRole ? '✅ true' : '❌ false'}</p>
    </div>
  );
}

export default {
  TestHookComponent,
  TestHOCComponent,
  TestComponentPattern,
  TestRoleUtilities,
};

