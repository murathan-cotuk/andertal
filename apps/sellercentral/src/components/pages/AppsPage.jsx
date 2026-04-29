"use client";

import React, { useState } from "react";
import styled from "styled-components";
import { Card, Button, Input } from "@andertal/ui";

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

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const AppsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 24px;
`;

const AppCard = styled(Card)`
  padding: 24px;
  transition: transform 0.2s ease;
  position: relative;

  &:hover {
    transform: translateY(-4px);
  }
`;

const AppIcon = styled.div`
  font-size: 48px;
  color: #0ea5e9;
  margin-bottom: 16px;
`;

const AppTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
`;

const AppDescription = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 16px;
`;

const ManageButton = styled.button`
  padding: 8px 16px;
  background-color: #f3f4f6;
  color: #1f2937;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #e5e7eb;
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled(Card)`
  padding: 24px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
`;

export default function AppsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [apiKey, setApiKey] = useState("");

  const installedApps = [
    {
      id: "stripe",
      name: "Stripe",
      description: "Payment processing and subscription management",
      icon: "fab fa-stripe",
      connected: true,
    },
    {
      id: "analytics",
      name: "Google Analytics",
      description: "Track and analyze your store performance",
      icon: "fab fa-google",
      connected: true,
    },
  ];

  const availableApps = [
    {
      id: "mailchimp",
      name: "Mailchimp",
      description: "Email marketing and automation",
      icon: "fab fa-mailchimp",
    },
    {
      id: "zapier",
      name: "Zapier",
      description: "Automate workflows and connect apps",
      icon: "fas fa-plug",
    },
  ];

  const handleManageApp = (app) => {
    setSelectedApp(app);
    setShowManageModal(true);
  };

  return (
    <Container>
      <Title>Apps</Title>

      <Section>
        <Header>
          <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937" }}>Installed Apps</h2>
          <Button onClick={() => setShowAddModal(true)}>
            <i className="fas fa-plus" style={{ marginRight: "8px" }} />
            Add App
          </Button>
        </Header>

        {installedApps.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7280" }}>
            <i className="fas fa-th" style={{ fontSize: "48px", marginBottom: "16px", color: "#d1d5db" }} />
            <p>No apps installed yet</p>
          </div>
        ) : (
          <AppsGrid>
            {installedApps.map((app) => (
              <AppCard key={app.id}>
                <AppIcon>
                  <i className={app.icon} />
                </AppIcon>
                <AppTitle>{app.name}</AppTitle>
                <AppDescription>{app.description}</AppDescription>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: "600",
                      backgroundColor: "#d1fae5",
                      color: "#065f46",
                    }}
                  >
                    Connected
                  </span>
                  <ManageButton onClick={() => handleManageApp(app)}>Manage</ManageButton>
                </div>
              </AppCard>
            ))}
          </AppsGrid>
        )}
      </Section>

      <Section>
        <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
          Available Apps
        </h2>
        <AppsGrid>
          {availableApps.map((app) => (
            <AppCard key={app.id}>
              <AppIcon>
                <i className={app.icon} />
              </AppIcon>
              <AppTitle>{app.name}</AppTitle>
              <AppDescription>{app.description}</AppDescription>
              <Button fullWidth>
                <i className="fas fa-download" style={{ marginRight: "8px" }} />
                Install
              </Button>
            </AppCard>
          ))}
        </AppsGrid>
      </Section>

      {showManageModal && selectedApp && (
        <Modal onClick={() => setShowManageModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#1f2937" }}>Manage {selectedApp.name}</h2>
              <button
                onClick={() => setShowManageModal(false)}
                style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#6b7280" }}
              >
                ×
              </button>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <Input
                label="API Key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
              />
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <Button onClick={() => setShowManageModal(false)}>Save</Button>
              <Button variant="outline" onClick={() => setShowManageModal(false)}>
                Cancel
              </Button>
            </div>
          </ModalContent>
        </Modal>
      )}

      {showAddModal && (
        <Modal onClick={() => setShowAddModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#1f2937" }}>Add New App</h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#6b7280" }}
              >
                ×
              </button>
            </div>
            <p style={{ color: "#6b7280", marginBottom: "24px" }}>
              Browse available apps from the list below or search for a specific integration
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <Button onClick={() => setShowAddModal(false)}>Browse Apps</Button>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
            </div>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
}
