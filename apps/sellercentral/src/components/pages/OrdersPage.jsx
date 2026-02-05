"use client";

import React from "react";
// GraphQL removed - will migrate to Medusa REST API
import styled from "styled-components";
import { Card } from "@belucha/ui";

const GET_ORDERS = gql`
  query GetOrders {
    Orders(limit: 50) {
      docs {
        id
        orderNumber
        total
        status
        createdAt
        customer {
          email
        }
      }
    }
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 32px;
  color: #1f2937;
`;

const Section = styled(Card)`
  padding: 24px;
  margin-bottom: 24px;
`;

const OrdersTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 16px;
`;

const TableHeader = styled.th`
  text-align: left;
  padding: 12px;
  font-weight: 600;
  color: #374151;
  border-bottom: 2px solid #e5e7eb;
`;

const TableCell = styled.td`
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
  color: #1f2937;
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background-color: ${({ status }) => {
    if (status === "completed") return "#d1fae5";
    if (status === "pending") return "#fef3c7";
    if (status === "cancelled") return "#fee2e2";
    return "#e5e7eb";
  }};
  color: ${({ status }) => {
    if (status === "completed") return "#065f46";
    if (status === "pending") return "#92400e";
    if (status === "cancelled") return "#991b1b";
    return "#6b7280";
  }};
`;

export default function OrdersPage() {
  const { data, loading, error } = useQuery(GET_ORDERS);
  const orders = data?.Orders?.docs || [];

  return (
    <Container>
      <Title>Orders Dashboard</Title>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Recent Orders
        </h2>

        {loading && (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: "32px", color: "#0ea5e9" }} />
          </div>
        )}

        {error && (
          <div style={{ padding: "16px", backgroundColor: "#fee2e2", borderRadius: "8px", color: "#991b1b" }}>
            Error loading orders: {error.message}
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7280" }}>
            <i className="fas fa-shopping-cart" style={{ fontSize: "48px", marginBottom: "16px", color: "#d1d5db" }} />
            <p>No orders yet</p>
          </div>
        )}

        {!loading && !error && orders.length > 0 && (
          <OrdersTable>
            <thead>
              <tr>
                <TableHeader>Order Number</TableHeader>
                <TableHeader>Customer</TableHeader>
                <TableHeader>Total</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Date</TableHeader>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <TableCell>{order.orderNumber || order.id}</TableCell>
                  <TableCell>{order.customer?.email || "N/A"}</TableCell>
                  <TableCell>€{order.total?.toFixed(2) || "0.00"}</TableCell>
                  <TableCell>
                    <StatusBadge status={order.status}>{order.status || "pending"}</StatusBadge>
                  </TableCell>
                  <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                </tr>
              ))}
            </tbody>
          </OrdersTable>
        )}
      </Section>
    </Container>
  );
}

