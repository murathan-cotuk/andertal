"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styled from "styled-components";
import { useAuth } from "@/contexts/AuthContext";

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  padding: 24px;
  position: relative;
`;

const LogoContainer = styled.div`
  position: absolute;
  top: 24px;
  left: 24px;
  z-index: 10;
`;

const Logo = styled(Link)`
  font-size: 24px;
  font-weight: 700;
  color: #0ea5e9;
  font-family: "Manrope", sans-serif;
  letter-spacing: 0.05em;
  text-decoration: none;
  transition: color 0.2s ease;

  &:hover {
    color: #0284c7;
  }
`;

const Card = styled.div`
  width: 100%;
  max-width: 500px;
  background: white;
  border-radius: 16px;
  padding: 48px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  max-height: 90vh;
  overflow-y: auto;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
  text-align: center;
  letter-spacing: 0.02em;
`;

const Form = styled.form`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  letter-spacing: 0.01em;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  color: #1f2937;
  background: white;
  transition: all 0.2s ease;
  box-sizing: border-box;
  text-transform: none;
  letter-spacing: 0.01em;

  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  color: #1f2937;
  background: white;
  transition: all 0.2s ease;
  box-sizing: border-box;
  text-transform: none;
  letter-spacing: 0.01em;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const PasswordWrapper = styled.div`
  position: relative;
  width: 100%;
`;

const ShowHideButton = styled.button`
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: #667eea;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  text-decoration: none;
  transition: color 0.2s ease;

  &:hover {
    color: #5568d3;
    text-decoration: underline;
  }

  &:focus {
    outline: none;
  }
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 14px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  letter-spacing: 0.5px;

  &:hover {
    background: #5568d3;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  margin: 8px 0;
  color: #9ca3af;
  font-size: 0.875rem;

  &::before,
  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #e5e7eb;
  }

  span {
    padding: 0 16px;
  }
`;

const GoogleButton = styled.button`
  width: 100%;
  padding: 14px;
  background: white;
  color: #374151;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  transition: all 0.2s ease;

  &:hover {
    background: #f9fafb;
    border-color: #d1d5db;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
`;

const LoginLink = styled(Link)`
  text-align: center;
  color: #667eea;
  text-decoration: none;
  font-size: 0.875rem;
  margin-top: 8px;
  transition: color 0.2s ease;

  &:hover {
    color: #5568d3;
    text-decoration: underline;
  }
`;

// Maymun Avatar Component - SADECE BU KALDI
const Avatar = styled.div`
  --sz-avatar: 120px;
  width: var(--sz-avatar);
  height: var(--sz-avatar);
  border: 2px solid #e5e7eb;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f9fafb;
  transition: all 0.3s ease;
  --sz-svg: calc(var(--sz-avatar) - 10px);

  &:hover {
    border-color: #667eea;
    transform: scale(1.05);
    box-shadow: 0 10px 20px rgba(102, 126, 234, 0.2);
  }

  svg {
    position: absolute;
    transition: transform 0.2s ease-in, opacity 0.1s;
    transform-origin: 50% 100%;
    height: var(--sz-svg);
    width: var(--sz-svg);
    pointer-events: none;
  }

  svg#monkey {
    z-index: 1;
  }

  svg#monkey-hands {
    z-index: 2;
    transform-style: preserve-3d;
    transform: ${props => props.$isBlind 
      ? 'translate3d(0, 0, 0) rotateX(0deg)' 
      : 'translateY(calc(var(--sz-avatar) / 1.25)) rotateX(-21deg)'};
    transition: transform 0.2s ease;
  }

  &::before {
    content: "";
    border-radius: ${props => props.$isBlind ? '50%' : '45%'};
    width: ${props => props.$isBlind 
      ? 'calc(var(--sz-svg) * (9 / 100))' 
      : 'calc(var(--sz-svg) / 3.889)'};
    height: ${props => props.$isBlind ? '0' : 'calc(var(--sz-svg) / 5.833)'};
    border: 0;
    border-bottom: ${props => props.$isBlind 
      ? 'calc(var(--sz-svg) * (10 / 100)) solid #3c302a' 
      : 'calc(var(--sz-svg) * (4 / 100)) solid #3c302a'};
    bottom: 20%;
    position: absolute;
    transition: all 0.2s ease;
    z-index: 3;
  }

  .monkey-eye-r,
  .monkey-eye-l {
    transition: all 0.2s ease;
    ry: ${props => props.$isBlind ? '0.5' : '4.5'};
    cy: ${props => props.$isBlind ? '30' : '31.7'};
  }
`;

const MonkeySVG = ({ isBlind }) => {
  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="35"
        height="35"
        viewBox="0 0 64 64"
        id="monkey"
      >
        <ellipse cx="53.7" cy="33" rx="8.3" ry="8.2" fill="#89664c" />
        <ellipse cx="53.7" cy="33" rx="5.4" ry="5.4" fill="#ffc5d3" />
        <ellipse cx="10.2" cy="33" rx="8.2" ry="8.2" fill="#89664c" />
        <ellipse cx="10.2" cy="33" rx="5.4" ry="5.4" fill="#ffc5d3" />
        <g fill="#89664c">
          <path d="m43.4 10.8c1.1-.6 1.9-.9 1.9-.9-3.2-1.1-6-1.8-8.5-2.1 1.3-1 2.1-1.3 2.1-1.3-20.4-2.9-30.1 9-30.1 19.5h46.4c-.7-7.4-4.8-12.4-11.8-15.2" />
          <path d="m55.3 27.6c0-9.7-10.4-17.6-23.3-17.6s-23.3 7.9-23.3 17.6c0 2.3.6 4.4 1.6 6.4-1 2-1.6 4.2-1.6 6.4 0 9.7 10.4 17.6 23.3 17.6s23.3-7.9 23.3-17.6c0-2.3-.6-4.4-1.6-6.4 1-2 1.6-4.2 1.6-6.4" />
        </g>
        <path
          d="m52 28.2c0-16.9-20-6.1-20-6.1s-20-10.8-20 6.1c0 4.7 2.9 9 7.5 11.7-1.3 1.7-2.1 3.6-2.1 5.7 0 6.1 6.6 11 14.7 11s14.7-4.9 14.7-11c0-2.1-.8-4-2.1-5.7 4.4-2.7 7.3-7 7.3-11.7"
          fill="#e0ac7e"
        />
        <g fill="#3b302a" className="monkey-eye-nose">
          <path d="m35.1 38.7c0 1.1-.4 2.1-1 2.1-.6 0-1-.9-1-2.1 0-1.1.4-2.1 1-2.1.6.1 1 1 1 2.1" />
          <path d="m30.9 38.7c0 1.1-.4 2.1-1 2.1-.6 0-1-.9-1-2.1 0-1.1.4-2.1 1-2.1.5.1 1 1 1 2.1" />
          <ellipse 
            cx="40.7" 
            cy={isBlind ? "30" : "31.7"} 
            rx="3.5" 
            ry={isBlind ? "0.5" : "4.5"} 
            className="monkey-eye-r"
          />
          <ellipse 
            cx="23.3" 
            cy={isBlind ? "30" : "31.7"} 
            rx="3.5" 
            ry={isBlind ? "0.5" : "4.5"} 
            className="monkey-eye-l"
          />
        </g>
      </svg>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="35"
        height="35"
        viewBox="0 0 64 64"
        id="monkey-hands"
      >
        <path
          fill="#89664C"
          d="M9.4,32.5L2.1,61.9H14c-1.6-7.7,4-21,4-21L9.4,32.5z"
        />
        <path
          fill="#FFD6BB"
          d="M15.8,24.8c0,0,4.9-4.5,9.5-3.9c2.3,0.3-7.1,7.6-7.1,7.6s9.7-8.2,11.7-5.6c1.8,2.3-8.9,9.8-8.9,9.8
	s10-8.1,9.6-4.6c-0.3,3.8-7.9,12.8-12.5,13.8C11.5,43.2,6.3,39,9.8,24.4C11.6,17,13.3,25.2,15.8,24.8"
        />
        <path
          fill="#89664C"
          d="M54.8,32.5l7.3,29.4H50.2c1.6-7.7-4-21-4-21L54.8,32.5z"
        />
        <path
          fill="#FFD6BB"
          d="M48.4,24.8c0,0-4.9-4.5-9.5-3.9c-2.3,0.3,7.1,7.6,7.1,7.6s-9.7-8.2-11.7-5.6c-1.8,2.3,8.9,9.8,8.9,9.8
	s-10-8.1-9.7-4.6c0.4,3.8,8,12.8,12.6,13.8c6.6,1.3,11.8-2.9,8.3-17.5C52.6,17,50.9,25.2,48.4,24.8"
        />
      </svg>
    </>
  );
};

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    gender: "",
    firstName: "",
    lastName: "",
    birthDate: "",
    email: "",
    phone: "",
    address: "",
    addressLine2: "",
    zipCode: "",
    city: "",
    country: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();
  
  // Maymun fonksiyonu: Şifre gizliyken gözler kapalı (blind)
  const isBlind = !showPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await register(formData);
      
      if (result.success) {
        router.push("/");
        router.refresh();
      } else {
        setError(result.error || "Registration failed. Please try again.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    console.log("Google login");
  };

  return (
    <Container>
      <LogoContainer>
        <Logo href="/">Belucha</Logo>
      </LogoContainer>
      <Card>
        <Avatar $isBlind={isBlind}>
          <MonkeySVG isBlind={isBlind} />
        </Avatar>
        
        <Title>Registrieren</Title>
        
        {error && (
          <div style={{
            width: "100%",
            padding: "12px",
            backgroundColor: "#fee2e2",
            border: "1px solid #ef4444",
            borderRadius: "8px",
            color: "#991b1b",
            fontSize: "14px",
          }}>
            {error}
          </div>
        )}
        
        <Form onSubmit={handleSubmit}>
          <FormGroup>
            <Label htmlFor="gender">Cinsiyet (Gender)</Label>
            <Select
              id="gender"
              name="gender"
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              required
            >
              <option value="">Bitte wählen...</option>
              <option value="male">Männlich</option>
              <option value="female">Weiblich</option>
              <option value="other">Andere</option>
            </Select>
          </FormGroup>

          <Row>
            <FormGroup>
              <Label htmlFor="firstName">Vorname</Label>
              <Input
                type="text"
                id="firstName"
                name="firstName"
                placeholder="Ihr Vorname"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
              />
            </FormGroup>
            <FormGroup>
              <Label htmlFor="lastName">Nachname</Label>
              <Input
                type="text"
                id="lastName"
                name="lastName"
                placeholder="Ihr Nachname"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
              />
            </FormGroup>
          </Row>

          <FormGroup>
            <Label htmlFor="birthDate">Geburtsdatum</Label>
            <Input
              type="date"
              id="birthDate"
              name="birthDate"
              value={formData.birthDate}
              onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
              required
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="email">Email</Label>
            <Input
              type="email"
              id="email"
              name="email"
              placeholder="ihre@email.de"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="phone">Telefonnummer</Label>
            <Input
              type="tel"
              id="phone"
              name="phone"
              placeholder="+49 123 456789"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="address">Adresse</Label>
            <Input
              type="text"
              id="address"
              name="address"
              placeholder="Straße und Hausnummer"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="addressLine2">Adresszusatz (optional)</Label>
            <Input
              type="text"
              id="addressLine2"
              name="addressLine2"
              placeholder="Wohnung, Etage, etc."
              value={formData.addressLine2}
              onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
            />
          </FormGroup>

          <Row>
            <FormGroup>
              <Label htmlFor="zipCode">PLZ</Label>
              <Input
                type="text"
                id="zipCode"
                name="zipCode"
                placeholder="12345"
                value={formData.zipCode}
                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                required
              />
            </FormGroup>
            <FormGroup>
              <Label htmlFor="city">Ort</Label>
              <Input
                type="text"
                id="city"
                name="city"
                placeholder="Stadt"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
              />
            </FormGroup>
          </Row>

          <FormGroup>
            <Label htmlFor="country">Land</Label>
            <Input
              type="text"
              id="country"
              name="country"
              placeholder="Deutschland"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              required
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="password">Passwort</Label>
            <PasswordWrapper>
              <Input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                placeholder="Ihr Passwort"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{ paddingRight: "80px" }}
                required
              />
              <ShowHideButton
                type="button"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Verbergen" : "Anzeigen"}
              </ShowHideButton>
            </PasswordWrapper>
          </FormGroup>

          <SubmitButton type="submit" disabled={loading}>
            {loading ? "Registrierung..." : "Registrieren"}
          </SubmitButton>

          <Divider>
            <span>oder</span>
          </Divider>

          <GoogleButton type="button" onClick={handleGoogleLogin}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Mit Google registrieren
          </GoogleButton>
        </Form>

        <LoginLink href="/login">
          Bereits ein Konto? Anmelden
        </LoginLink>
      </Card>
    </Container>
  );
}
