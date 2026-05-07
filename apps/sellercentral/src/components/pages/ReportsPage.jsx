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

export default function ReportsPage() {
  const [exporting, setExporting] = useState("");

  const runExport = async (format) => {
    try {
      setExporting(format);
      const token = typeof window !== "undefined" ? localStorage.getItem("sellerToken") : null;
      if (!token) {
        alert("Please login again.");
        return;
      }
      const response = await fetch("/api/import-export/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerToken: token,
          datasets: ["orders", "customers", "transactions"],
          format,
        }),
      });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reports-export.${format}`;
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
      <Title>Reports</Title>
      <Section>
        <h2>Generate and download reports</h2>
        <p>Sales reports, tax reports, and more.</p>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button
            onClick={() => runExport("xlsx")}
            disabled={exporting !== ""}
            style={{
              padding: "12px 20px",
              backgroundColor: "#0ea5e9",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {exporting === "xlsx" ? "Exporting..." : "Export XLSX"}
          </button>
          <button
            onClick={() => runExport("csv")}
            disabled={exporting !== ""}
            style={{
              padding: "12px 20px",
              backgroundColor: "#fff",
              color: "#0ea5e9",
              border: "2px solid #0ea5e9",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {exporting === "csv" ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </Section>
    </Container>
  );
}

