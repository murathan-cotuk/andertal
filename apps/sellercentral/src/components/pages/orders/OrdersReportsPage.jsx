"use client";

import React, { useState } from "react";
import styled from "styled-components";
import { Card } from "@andertal/ui";

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

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-top: 24px;
`;

const StatCard = styled(Card)`
  padding: 24px;
  text-align: center;
`;

const StatValue = styled.div`
  font-size: 32px;
  font-weight: 700;
  color: #0ea5e9;
  margin-bottom: 8px;
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: #6b7280;
`;

export default function OrdersReportsPage() {
  const [exporting, setExporting] = useState("");

  const runExport = async (format) => {
    try {
      setExporting(format);
      const token = typeof window !== "undefined" ? localStorage.getItem("sellerToken") : null;
      if (!token) {
        alert("Bitte erneut einloggen.");
        return;
      }
      const response = await fetch("/api/import-export/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerToken: token,
          datasets: ["orders"],
          format,
        }),
      });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e?.message || "Export failed");
    } finally {
      setExporting("");
    }
  };

  return (
    <Container>
      <Title>Order Reports</Title>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Sales Overview
        </h2>
        <StatsGrid>
          <StatCard>
            <StatValue>€0.00</StatValue>
            <StatLabel>Total Revenue</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>0</StatValue>
            <StatLabel>Total Orders</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>€0.00</StatValue>
            <StatLabel>Average Order Value</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>0</StatValue>
            <StatLabel>Pending Orders</StatLabel>
          </StatCard>
        </StatsGrid>
      </Section>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Export Reports
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "16px" }}>
          Generate and download detailed order reports for your records
        </p>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => runExport("xlsx")}
            disabled={exporting !== ""}
            style={{
              padding: "12px 24px",
              backgroundColor: "#0ea5e9",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            <i className="fas fa-file-excel" style={{ marginRight: "8px" }} />
            {exporting === "xlsx" ? "Exporting..." : "Export to XLSX"}
          </button>
          <button
            onClick={() => runExport("csv")}
            disabled={exporting !== ""}
            style={{
              padding: "12px 24px",
              backgroundColor: "white",
              color: "#0ea5e9",
              border: "2px solid #0ea5e9",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            <i className="fas fa-file-csv" style={{ marginRight: "8px" }} />
            {exporting === "csv" ? "Exporting..." : "Export to CSV"}
          </button>
        </div>
      </Section>
    </Container>
  );
}

