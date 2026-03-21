"use client";

"use client";

import { useState, useEffect } from "react";
import { useCustomerAuth as useAuth, useAuthGuard, getToken } from "@belucha/lib";
import styled from "styled-components";
import { Card, Button } from "@belucha/ui";
import { Link } from "@/i18n/navigation";
import { getMedusaClient } from "@/lib/medusa-client";

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 48px 24px;
  min-height: 80vh;
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

const SectionTitle = styled.h2`
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #1f2937;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
`;

const InfoValue = styled.span`
  font-size: 16px;
  color: #1f2937;
  font-weight: 600;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
`;

const Loading = styled.div`
  text-align: center;
  padding: 48px;
  color: #6b7280;
`;

const Error = styled.div`
  text-align: center;
  padding: 48px;
  color: #ef4444;
`;

export default function AccountPage() {
  // Protect route
  useAuthGuard({ requiredRole: 'customer', redirectTo: '/login' });

  const { user, logout } = useAuth();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCustomer = async () => {
      if (!user?.id) return;
      
      try {
        setLoading(true);
        const token = getToken('customer');
        if (!token) {
          setError('No authentication token found');
          return;
        }
        
        const client = getMedusaClient();
        const result = await client.getCustomer(token);
        setCustomer(result.customer);
      } catch (err) {
        console.error('Failed to fetch customer:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomer();
  }, [user?.id]);

  if (loading) {
    return (
      <Container>
        <Loading>Loading...</Loading>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Error>Error loading profile: {error.message}</Error>
      </Container>
    );
  }

  return (
    <Container>
        <Title>Mein Konto</Title>

        <Section>
          <SectionTitle>Persönliche Informationen</SectionTitle>
          <InfoGrid>
            <InfoItem>
              <InfoLabel>Vorname</InfoLabel>
              <InfoValue>{customer?.first_name || customer?.firstName || "-"}</InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>Nachname</InfoLabel>
              <InfoValue>{customer?.last_name || customer?.lastName || "-"}</InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>Email</InfoLabel>
              <InfoValue>{customer?.email || "-"}</InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>Telefonnummer</InfoLabel>
              <InfoValue>{customer?.phone || "-"}</InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>Kontotyp</InfoLabel>
              <InfoValue>{customer?.account_type === 'business' ? 'Gewerbe' : 'Privat'}</InfoValue>
            </InfoItem>
            {customer?.company_name && (
              <InfoItem>
                <InfoLabel>Firmenname</InfoLabel>
                <InfoValue>{customer.company_name}</InfoValue>
              </InfoItem>
            )}
            {customer?.vat_number && (
              <InfoItem>
                <InfoLabel>USt-IdNr.</InfoLabel>
                <InfoValue>{customer.vat_number}</InfoValue>
              </InfoItem>
            )}
          </InfoGrid>
        </Section>

        {customer?.address_line1 && (
          <Section>
            <SectionTitle>Adresse</SectionTitle>
            <InfoGrid>
              <InfoItem>
                <InfoLabel>Straße</InfoLabel>
                <InfoValue>{customer.address_line1}</InfoValue>
              </InfoItem>
              {customer.address_line2 && (
                <InfoItem>
                  <InfoLabel>Adresszusatz</InfoLabel>
                  <InfoValue>{customer.address_line2}</InfoValue>
                </InfoItem>
              )}
              <InfoItem>
                <InfoLabel>PLZ</InfoLabel>
                <InfoValue>{customer.zip_code || "-"}</InfoValue>
              </InfoItem>
              <InfoItem>
                <InfoLabel>Stadt</InfoLabel>
                <InfoValue>{customer.city || "-"}</InfoValue>
              </InfoItem>
              <InfoItem>
                <InfoLabel>Land</InfoLabel>
                <InfoValue>{customer.country || "-"}</InfoValue>
              </InfoItem>
            </InfoGrid>
          </Section>
        )}

        <Section>
          <SectionTitle>Aktionen</SectionTitle>
          <ButtonGroup>
            <Link href="/orders">
              <Button variant="outline">Meine Bestellungen</Button>
            </Link>
            <Button variant="outline" onClick={logout}>
              Abmelden
            </Button>
          </ButtonGroup>
        </Section>
      </Container>
  );
}

