"use client";

import React from "react";
import styled from "styled-components";
import { Card, Button } from "@belucha/ui";

const Container = styled.div`
  max-width: 1200px;
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

const InvoiceTable = styled.table`
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

export default function BillingSettingsPage() {
  const invoices = [
    { id: "INV-001", date: "2024-01-15", amount: "€29.99", status: "Paid" },
    { id: "INV-002", date: "2024-02-15", amount: "€29.99", status: "Paid" },
    { id: "INV-003", date: "2024-03-15", amount: "€29.99", status: "Pending" },
  ];

  return (
    <Container>
      <Title>Billing</Title>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Subscription Plan
        </h2>
        <div style={{ padding: "20px", backgroundColor: "#f0f9ff", borderRadius: "8px", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#1f2937", marginBottom: "4px" }}>
                Free Plan
              </h3>
              <p style={{ margin: 0, fontSize: "14px", color: "#6b7280" }}>
                10% commission on each sale • No monthly fees
              </p>
            </div>
            <Button variant="outline">
              Upgrade Plan
            </Button>
          </div>
        </div>
      </Section>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Billing History
        </h2>

        {invoices.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7280" }}>
            <i className="fas fa-file-invoice" style={{ fontSize: "48px", marginBottom: "16px", color: "#d1d5db" }} />
            <p>No invoices yet</p>
          </div>
        ) : (
          <InvoiceTable>
            <thead>
              <tr>
                <TableHeader>Invoice ID</TableHeader>
                <TableHeader>Date</TableHeader>
                <TableHeader>Amount</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Action</TableHeader>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <TableCell>{invoice.id}</TableCell>
                  <TableCell>{invoice.date}</TableCell>
                  <TableCell>{invoice.amount}</TableCell>
                  <TableCell>
                    <span
                      style={{
                        padding: "4px 12px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: "600",
                        backgroundColor: invoice.status === "Paid" ? "#d1fae5" : "#fef3c7",
                        color: invoice.status === "Paid" ? "#065f46" : "#92400e",
                      }}
                    >
                      {invoice.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" style={{ padding: "6px 12px", fontSize: "12px" }}>
                      <i className="fas fa-download" style={{ marginRight: "4px" }} />
                      Download
                    </Button>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </InvoiceTable>
        )}
      </Section>
    </Container>
  );
}

