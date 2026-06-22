"use client";

import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { useLocale } from "next-intl";
import { lt } from "@/lib/locale-text";
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

const AvatarSection = styled.div`
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 32px;
`;

const Avatar = styled.div`
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 48px;
  flex-shrink: 0;
`;

const AvatarInfo = styled.div`
  flex: 1;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

export default function ProfilePage() {
  const locale = useLocale();
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const [formData, setFormData] = useState({
    storeName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    postalCode: "",
    website: "",
    description: "",
  });

  useEffect(() => {
    const email = localStorage.getItem("sellerEmail") || "";
    const storeName = localStorage.getItem("storeName") || "";
    setFormData((prev) => ({ ...prev, email, storeName }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.storeName && typeof window !== "undefined") {
      localStorage.setItem("storeName", formData.storeName.trim());
    }
    alert(t("Profile updated successfully!", "Profil başarıyla güncellendi!", "Profil mis a jour avec succes !", "Perfil actualizado correctamente!", "Profilo aggiornato con successo!", "Profil erfolgreich aktualisiert!"));
  };

  const getUserInitials = () => {
    if (formData.storeName) {
      return formData.storeName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);
    }
    if (formData.email) {
      return formData.email.charAt(0).toUpperCase();
    }
    return "S";
  };

  return (
    <Container>
      <Title>{t("Profile", "Profil", "Profil", "Perfil", "Profilo", "Profil")}</Title>

      <Section>
        <AvatarSection>
          <Avatar>{getUserInitials()}</Avatar>
          <AvatarInfo>
            <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#1f2937", marginBottom: "8px" }}>
              {formData.storeName || t("Seller Account", "Satici Hesabi", "Compte vendeur", "Cuenta de vendedor", "Account venditore", "Verkauferkonto")}
            </h2>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "16px" }}>{formData.email}</p>
            <Button variant="outline" style={{ padding: "8px 16px", fontSize: "14px" }}>
              <i className="fas fa-camera" style={{ marginRight: "8px" }} />
              {t("Change Avatar", "Avatari degistir", "Changer l'avatar", "Cambiar avatar", "Cambia avatar", "Avatar andern")}
            </Button>
          </AvatarInfo>
        </AvatarSection>

        <Form onSubmit={handleSubmit}>
          <FormRow>
            <Input
              label={t("Store Name *", "Magaza Adi *", "Nom de la boutique *", "Nombre de la tienda *", "Nome negozio *", "Shopname *")}
              type="text"
              value={formData.storeName}
              onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
              required
            />
            <Input
              label={t("Email *", "E-posta *", "E-mail *", "Correo electronico *", "Email *", "E-Mail *")}
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </FormRow>

          <FormRow>
            <Input
              label={t("Phone", "Telefon", "Telephone", "Telefono", "Telefono", "Telefon")}
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
            <Input
              label={t("Website", "Web sitesi", "Site web", "Sitio web", "Sito web", "Webseite")}
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            />
          </FormRow>

          <Input
            label={t("Address", "Adres", "Adresse", "Direccion", "Indirizzo", "Adresse")}
            type="text"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />

          <FormRow>
            <Input
              label={t("City", "Sehir", "Ville", "Ciudad", "Citta", "Stadt")}
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
            <Input
              label={t("Country", "Ulke", "Pays", "Pais", "Paese", "Land")}
              type="text"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            />
          </FormRow>

          <Input
            label={t("Postal Code", "Posta Kodu", "Code postal", "Codigo postal", "CAP", "Postleitzahl")}
            type="text"
            value={formData.postalCode}
            onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
          />

          <div>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              {t("Description", "Aciklama", "Description", "Descripcion", "Descrizione", "Beschreibung")}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "2px solid #e5e7eb",
                borderRadius: "8px",
                minHeight: "120px",
                fontFamily: "inherit",
              }}
              placeholder={t("Tell us about your store...", "Magazanizdan kisaca bahsedin...", "Parlez-nous de votre boutique...", "Cuentanos sobre tu tienda...", "Parlaci del tuo negozio...", "Erzahlen Sie uns von Ihrem Shop...")}
            />
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <Button type="button" variant="outline">
              {t("Cancel", "Iptal", "Annuler", "Cancelar", "Annulla", "Abbrechen")}
            </Button>
            <Button type="submit">
              {t("Save Changes", "Degisiklikleri kaydet", "Enregistrer les modifications", "Guardar cambios", "Salva modifiche", "Anderungen speichern")}
            </Button>
          </div>
        </Form>
      </Section>
    </Container>
  );
}

