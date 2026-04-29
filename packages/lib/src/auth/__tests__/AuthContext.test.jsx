/**
 * AuthContext Test Component
 * 
 * Manual test component for AuthContext functionality
 * 
 * Usage:
 * import { AuthContextTest } from '@andertal/lib/auth/__tests__/AuthContext.test.jsx';
 * 
 * <AuthContextTest />
 */

import React from 'react';
import { CustomerAuthProvider, useCustomerAuth } from '../AuthContext.jsx';

/**
 * Test component that uses customer auth
 */
function TestComponent() {
  const { isAuthenticated, isLoading, login, logout, user, userId, token } = useCustomerAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const handleLogin = () => {
    // Mock token for testing (expires in 1 hour)
    const mockToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwicm9sZSI6ImN1c3RvbWVyIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.xxxxx";
    try {
      login(mockToken, '123');
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>AuthContext Test</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <p><strong>Authenticated:</strong> {isAuthenticated ? '✅ Yes' : '❌ No'}</p>
        <p><strong>User ID:</strong> {userId || 'None'}</p>
        <p><strong>User Email:</strong> {user?.email || 'None'}</p>
        <p><strong>User Role:</strong> {user?.role || 'None'}</p>
        <p><strong>Token:</strong> {token ? `${token.substring(0, 20)}...` : 'None'}</p>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button 
          onClick={handleLogin}
          disabled={isAuthenticated}
          style={{
            padding: '10px 20px',
            backgroundColor: isAuthenticated ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isAuthenticated ? 'not-allowed' : 'pointer'
          }}
        >
          Login (Mock)
        </button>
        
        <button 
          onClick={logout}
          disabled={!isAuthenticated}
          style={{
            padding: '10px 20px',
            backgroundColor: !isAuthenticated ? '#ccc' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: !isAuthenticated ? 'not-allowed' : 'pointer'
          }}
        >
          Logout
        </button>
      </div>

      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <p><strong>Instructions:</strong></p>
        <ul>
          <li>Click "Login" to test login functionality</li>
          <li>Click "Logout" to test logout functionality</li>
          <li>Check browser console for migration logs</li>
          <li>Check localStorage for token storage</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * AuthContext Test Wrapper
 * 
 * Wraps TestComponent with CustomerAuthProvider
 */
export function AuthContextTest() {
  return (
    <CustomerAuthProvider>
      <TestComponent />
    </CustomerAuthProvider>
  );
}

export default AuthContextTest;

