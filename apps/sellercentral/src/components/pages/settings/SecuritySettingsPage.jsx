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

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

export default function SecuritySettingsPage() {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert("New passwords do not match!");
      return;
    }
    // TODO: Implement password change
    alert("Password changed successfully!");
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
  };

  return (
    <Container>
      <Title>Security Settings</Title>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "24px" }}>
          Change Password
        </h2>

        <Form onSubmit={handlePasswordChange}>
          <Input
            label="Current Password *"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
            required
          />
          <Input
            label="New Password *"
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            required
          />
          <Input
            label="Confirm New Password *"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
            required
          />
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <Button type="submit">
              Change Password
            </Button>
          </div>
        </Form>
      </Section>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Two-Factor Authentication
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "16px" }}>
          Add an extra layer of security to your account
        </p>
        <Button variant="outline">
          <i className="fas fa-shield-alt" style={{ marginRight: "8px" }} />
          Enable 2FA
        </Button>
      </Section>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Active Sessions
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "16px" }}>
          Manage your active login sessions
        </p>
        <div style={{ padding: "16px", backgroundColor: "#f9fafb", borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, fontWeight: "600", color: "#1f2937" }}>Current Session</p>
              <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#6b7280" }}>
                Windows • Chrome • Last active: Just now
              </p>
            </div>
            <span style={{ padding: "4px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "600", backgroundColor: "#d1fae5", color: "#065f46" }}>
              Active
            </span>
          </div>
        </div>
        <Button variant="outline" style={{ marginTop: "16px" }}>
          <i className="fas fa-sign-out-alt" style={{ marginRight: "8px" }} />
          Sign Out All Other Sessions
        </Button>
      </Section>
    </Container>
  );
}

