"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useMutation, gql } from "@apollo/client";
import { useRouter } from "next/navigation";

const LOGIN_CUSTOMER = gql`
  mutation LoginCustomer($email: String!, $password: String!) {
    loginCustomers(email: $email, password: $password) {
      token
      user {
        id
        email
        firstName
        lastName
      }
    }
  }
`;

const REGISTER_CUSTOMER = gql`
  mutation RegisterCustomer($data: JSON!) {
    createCustomers(data: $data) {
      id
      email
      firstName
      lastName
    }
  }
`;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [loginMutation] = useMutation(LOGIN_CUSTOMER);
  const [registerMutation] = useMutation(REGISTER_CUSTOMER);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem("customerToken");
    const storedUser = localStorage.getItem("customerUser");

    if (storedToken && storedUser) {
      setToken(storedToken);
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Error parsing stored user:", e);
        localStorage.removeItem("customerToken");
        localStorage.removeItem("customerUser");
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const { data } = await loginMutation({
        variables: { email, password },
      });

      if (data?.loginCustomers?.token) {
        const { token: newToken, user: userData } = data.loginCustomers;
        setToken(newToken);
        setUser(userData);
        localStorage.setItem("customerToken", newToken);
        localStorage.setItem("customerUser", JSON.stringify(userData));
        return { success: true };
      }
      return { success: false, error: "Login failed" };
    } catch (error) {
      console.error("Login error:", error);
      return {
        success: false,
        error: error.message || "Login failed. Please check your credentials.",
      };
    }
  };

  const register = async (customerData) => {
    try {
      // Create customer - Payload CMS will hash the password automatically
      const { data } = await registerMutation({
        variables: { data: customerData },
      });

      if (data?.createCustomers) {
        // After registration, automatically log in with the provided credentials
        const loginResult = await login(customerData.email, customerData.password);
        return loginResult;
      }
      return { success: false, error: "Registration failed" };
    } catch (error) {
      console.error("Registration error:", error);
      // Extract error message from GraphQL error
      const errorMessage = error.graphQLErrors?.[0]?.message || 
                          error.message || 
                          "Registration failed. Please try again.";
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("customerToken");
    localStorage.removeItem("customerUser");
    router.push("/");
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user && !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

