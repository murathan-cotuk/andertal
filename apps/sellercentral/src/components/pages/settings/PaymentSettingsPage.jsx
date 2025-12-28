"use client";

import React, { useState } from "react";
import styled from "styled-components";
import { Card, Button, Input } from "@belucha/ui";

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

const PaymentMethodCard = styled(Card)`
  padding: 20px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export default function PaymentSettingsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    cardholderName: "",
  });

  const paymentMethods = [
    { id: 1, type: "visa", last4: "4242", expiry: "12/25", name: "John Doe" },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    // TODO: Implement payment method addition
    alert("Payment method added successfully!");
    setShowAddForm(false);
    setFormData({ cardNumber: "", expiryDate: "", cvv: "", cardholderName: "" });
  };

  return (
    <Container>
      <Title>Payment Methods</Title>

      <Section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937" }}>Saved Payment Methods</h2>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <i className="fas fa-plus" style={{ marginRight: "8px" }} />
            Add Payment Method
          </Button>
        </div>

        {showAddForm && (
          <Card style={{ padding: "24px", marginBottom: "24px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
              Add New Payment Method
            </h3>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <Input
                label="Cardholder Name"
                type="text"
                value={formData.cardholderName}
                onChange={(e) => setFormData({ ...formData, cardholderName: e.target.value })}
                required
              />
              <Input
                label="Card Number"
                type="text"
                value={formData.cardNumber}
                onChange={(e) => setFormData({ ...formData, cardNumber: e.target.value })}
                placeholder="1234 5678 9012 3456"
                required
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <Input
                  label="Expiry Date"
                  type="text"
                  value={formData.expiryDate}
                  onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                  placeholder="MM/YY"
                  required
                />
                <Input
                  label="CVV"
                  type="text"
                  value={formData.cvv}
                  onChange={(e) => setFormData({ ...formData, cvv: e.target.value })}
                  placeholder="123"
                  required
                />
              </div>
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Add Card
                </Button>
              </div>
            </form>
          </Card>
        )}

        {paymentMethods.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7280" }}>
            <i className="fas fa-credit-card" style={{ fontSize: "48px", marginBottom: "16px", color: "#d1d5db" }} />
            <p>No payment methods added yet</p>
          </div>
        ) : (
          paymentMethods.map((method) => (
            <PaymentMethodCard key={method.id}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <i className={`fab fa-cc-${method.type}`} style={{ fontSize: "32px", color: "#0ea5e9" }} />
                <div>
                  <p style={{ margin: 0, fontWeight: "600", color: "#1f2937" }}>
                    •••• •••• •••• {method.last4}
                  </p>
                  <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#6b7280" }}>
                    {method.name} • Expires {method.expiry}
                  </p>
                </div>
              </div>
              <Button variant="outline" style={{ padding: "8px 16px", fontSize: "14px" }}>
                Remove
              </Button>
            </PaymentMethodCard>
          ))
        )}
      </Section>
    </Container>
  );
}

