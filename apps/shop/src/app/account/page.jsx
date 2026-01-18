"use client";

import { useQuery, gql } from "@apollo/client";
import { useCustomerAuth as useAuth, useAuthGuard } from "@belucha/lib";
import styled from "styled-components";
import { Card, Button } from "@belucha/ui";
import Link from "next/link";

const GET_CUSTOMER = gql`
  query GetCustomer($id: String!) {
    Customers(where: { id: { equals: $id } }) {
      docs {
        id
        email
        firstName
        lastName
        gender
        birthDate
        phone
        address
        addressLine2
        zipCode
        city
        country
      }
    }
  }
`;

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

  const { data, loading, error } = useQuery(GET_CUSTOMER, {
    variables: { id: user?.id },
    skip: !user?.id,
  });

  const customer = data?.Customers?.docs?.[0];

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
              <InfoValue>{customer?.firstName || "-"}</InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>Nachname</InfoLabel>
              <InfoValue>{customer?.lastName || "-"}</InfoValue>
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
              <InfoLabel>Geschlecht</InfoLabel>
              <InfoValue>
                {customer?.gender === "male"
                  ? "Männlich"
                  : customer?.gender === "female"
                  ? "Weiblich"
                  : customer?.gender === "other"
                  ? "Andere"
                  : "-"}
              </InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>Geburtsdatum</InfoLabel>
              <InfoValue>
                {customer?.birthDate
                  ? new Date(customer.birthDate).toLocaleDateString("de-DE")
                  : "-"}
              </InfoValue>
            </InfoItem>
          </InfoGrid>
        </Section>

        <Section>
          <SectionTitle>Adresse</SectionTitle>
          <InfoGrid>
            <InfoItem>
              <InfoLabel>Straße</InfoLabel>
              <InfoValue>{customer?.address || "-"}</InfoValue>
            </InfoItem>
            {customer?.addressLine2 && (
              <InfoItem>
                <InfoLabel>Adresszusatz</InfoLabel>
                <InfoValue>{customer.addressLine2}</InfoValue>
              </InfoItem>
            )}
            <InfoItem>
              <InfoLabel>PLZ</InfoLabel>
              <InfoValue>{customer?.zipCode || "-"}</InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>Stadt</InfoLabel>
              <InfoValue>{customer?.city || "-"}</InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>Land</InfoLabel>
              <InfoValue>{customer?.country || "-"}</InfoValue>
            </InfoItem>
          </InfoGrid>
        </Section>

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

