"use client";

import React, { useState } from "react";
import { useLocale } from "next-intl";
import {
  Page,
  Card,
  Button,
  TextField,
  Text,
  BlockStack,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { lt } from "@/lib/locale-text";

export default function StorePage() {
  const locale = useLocale();
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const templates = [
    { id: "modern", name: t("Modern Store", "Modern Magaza", "Boutique moderne", "Tienda moderna", "Negozio moderno", "Moderner Shop"), description: t("Clean and contemporary design with focus on product showcase", "Urun odakli temiz ve modern tasarim", "Design epure et contemporain axe sur la presentation des produits", "Diseno limpio y contemporaneo centrado en productos", "Design pulito e moderno focalizzato sui prodotti", "Klares, modernes Design mit Fokus auf Produktprasentation") },
    { id: "classic", name: t("Classic Store", "Klasik Magaza", "Boutique classique", "Tienda clasica", "Negozio classico", "Klassischer Shop"), description: t("Traditional layout with emphasis on brand storytelling", "Marka hikayesi odakli geleneksel yerlesim", "Mise en page traditionnelle axee sur l'histoire de marque", "Diseno tradicional con enfoque en storytelling de marca", "Layout tradizionale con enfasi sul brand storytelling", "Traditionelles Layout mit Fokus auf Markenstory") },
    { id: "minimal", name: t("Minimal Store", "Minimal Magaza", "Boutique minimaliste", "Tienda minimalista", "Negozio minimal", "Minimaler Shop"), description: t("Simple and elegant design with minimal distractions", "Dikkat dagitmayan sade ve sik tasarim", "Design simple et elegant avec peu de distractions", "Diseno simple y elegante con minimas distracciones", "Design semplice ed elegante con minime distrazioni", "Schlichtes, elegantes Design mit wenig Ablenkung") },
  ];
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");

  return (
    <Page title={t("Create your store", "Magazanizi olusturun", "Creez votre boutique", "Crea tu tienda", "Crea il tuo negozio", "Erstellen Sie Ihren Shop")} backAction={{ content: t("Back", "Geri", "Retour", "Atras", "Indietro", "Zuruck"), url: "/" }}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              {t("Store information", "Magaza bilgileri", "Informations de la boutique", "Informacion de la tienda", "Informazioni negozio", "Shop-Informationen")}
            </Text>
            <BlockStack gap="300">
              <TextField
                label={t("Store name", "Magaza adi", "Nom de la boutique", "Nombre de la tienda", "Nome negozio", "Shopname")}
                value={storeName}
                onChange={setStoreName}
                placeholder={t("My Awesome Store", "Harika Magazam", "Ma Super Boutique", "Mi tienda increible", "Il mio negozio fantastico", "Mein toller Shop")}
                autoComplete="off"
              />
              <TextField
                label={t("Store URL slug", "Magaza URL slug", "Slug URL boutique", "Slug URL de tienda", "Slug URL negozio", "Shop-URL-Slug")}
                value={storeSlug}
                onChange={setStoreSlug}
                placeholder="my-awesome-store"
                autoComplete="off"
              />
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              {t("Choose a template", "Bir sablon secin", "Choisir un modele", "Elige una plantilla", "Scegli un template", "Vorlage auswahlen")}
            </Text>
            <Text as="p" tone="subdued">
              {t("Select a template for your store landing page (similar to Amazon Stores).", "Magaza acilis sayfaniz icin bir sablon secin (Amazon Stores benzeri).", "Selectionnez un modele pour la page d'accueil de votre boutique (similaire a Amazon Stores).", "Selecciona una plantilla para la pagina principal de tu tienda (similar a Amazon Stores).", "Seleziona un template per la landing page del tuo negozio (simile ad Amazon Stores).", "Wahlen Sie eine Vorlage fur Ihre Shop-Landingpage (ahnlich wie Amazon Stores).")}
            </Text>
            <InlineStack gap="300" wrap>
              {templates.map((template) => (
                <Box
                  key={template.id}
                  minWidth="280px"
                  padding="400"
                  background={selectedTemplate === template.id ? "bg-surface-selected" : "bg-surface"}
                  borderRadius="200"
                  borderWidth="025"
                  borderColor={selectedTemplate === template.id ? "border-brand" : "border"}
                  cursor="pointer"
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <BlockStack gap="200">
                    <Box minHeight="120px" background="bg-fill-info" borderRadius="200" padding="400" />
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {template.name}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {template.description}
                    </Text>
                  </BlockStack>
                </Box>
              ))}
            </InlineStack>
            {selectedTemplate && (
              <Button variant="primary">
                {t("Create store with", "Magazayi su sablonla olustur", "Creer la boutique avec", "Crear tienda con", "Crea negozio con", "Shop erstellen mit")} {templates.find((tpl) => tpl.id === selectedTemplate)?.name} {t("template", "sablonu", "modele", "plantilla", "template", "Vorlage")}
              </Button>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
