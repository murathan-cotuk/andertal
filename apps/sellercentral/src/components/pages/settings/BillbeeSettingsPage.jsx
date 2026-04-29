"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Text,
  TextField,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function CopyField({ label, value, helpText, multiline }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    const v = String(value || "");
    if (!v) return;
    navigator.clipboard.writeText(v).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);

  return (
    <BlockStack gap="200">
      <TextField
        label={label}
        helpText={helpText}
        value={value}
        readOnly
        multiline={multiline ? 3 : undefined}
        autoComplete="off"
      />
      <Button onClick={copy} disabled={!value}>
        {copied ? "Kopiert" : "Kopieren"}
      </Button>
    </BlockStack>
  );
}

export default function BillbeeSettingsPage() {
  const client = getMedusaAdminClient();
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [err, setErr] = useState("");
  const [okBanner, setOkBanner] = useState("");

  const [name, setName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [basicUser, setBasicUser] = useState("");
  const [basicPass, setBasicPass] = useState("");
  const [hint, setHint] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await client.getBillbeeMarketplaceConnection();
      setName(data?.name || "Andertal Marketplace");
      setApiBaseUrl(data?.api_base_url || "");
      setApiKey(data?.api_key || "");
      setBasicUser(data?.basic_auth_username || "");
      setBasicPass(data?.basic_auth_password || "");
      setHint(data?.hint || "");
    } catch (e) {
      setErr(e?.message || "Verbindungsdaten konnten nicht geladen werden.");
    }
    setLoading(false);
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRotateSecret = async () => {
    if (!confirm("Neues Basic-Auth-Passwort erzeugen? In Billbee musst du das Passwort danach aktualisieren.")) return;
    setRotating(true);
    setErr("");
    setOkBanner("");
    try {
      const data = await client.rotateBillbeeMarketplaceSecret();
      if (data?.basic_auth_password) setBasicPass(data.basic_auth_password);
      setOkBanner("Neues Passwort gespeichert. Bitte in Billbee eintragen.");
    } catch (e) {
      setErr(e?.message || "Fehler beim Erneuern.");
    }
    setRotating(false);
  };

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h1" variant="headingLg">
          Billbee ↔ Andertal
        </Text>
        <Text as="p" variant="bodyMd" tone="subdued">
          Andertal stellt die API unter <Text as="span" fontWeight="semibold">/api/billbee</Text> bereit. Billbee ruft{" "}
          <strong>deinen Shop</strong> mit den unten angezeigten Zugangsdaten ab — getrennt pro Verkäuferkonto.
        </Text>
      </BlockStack>

      {okBanner ? (
        <Banner tone="success" onDismiss={() => setOkBanner("")}>
          {okBanner}
        </Banner>
      ) : null}
      {err ? (
        <Banner tone="critical" onDismiss={() => setErr("")}>
          {err}
        </Banner>
      ) : null}

      <Card>
        <BlockStack gap="400">
          <Banner tone="info">
            <Text as="p" variant="bodySm">
              In Billbee (<strong>Einstellungen → Kanäle → Shopverbindung</strong>):{" "}
              <strong>Name</strong> z. B. „{name}“, <strong>URL</strong> = Basis-URL unten (oder einzelne Endpunkte wie …/orders).{" "}
              <strong>Schlüssel</strong> = API-Schlüssel. <strong>Basic Auth</strong> = E-Mail + Passwort. Optional Header{" "}
              <code>X-Andertal-Api-Key</code> mit demselben Schlüssel mitsenden.
            </Text>
          </Banner>

          <TextField label="Name (Vorschlag)" value={loading ? "…" : name} readOnly autoComplete="off" />

          <CopyField
            label="URL (API-Basis)"
            value={loading ? "" : apiBaseUrl}
            helpText="Oft als Shop-URL in Billbee; Endpunkte: /orders, /products, /stock"
            multiline
          />

          <CopyField
            label="Schlüssel (API-Key)"
            value={loading ? "" : apiKey}
            helpText="Format andertal_seller_… — zusätzlich optional als X-Andertal-Api-Key Header"
            multiline={false}
          />

          <CopyField
            label="Basic Auth Benutzername"
            value={loading ? "" : basicUser}
            helpText="Deine Seller-Central E-Mail-Adresse"
          />

          <BlockStack gap="200">
            <TextField
              label="Basic Auth Passwort"
              type="password"
              value={loading ? "" : basicPass}
              readOnly
              autoComplete="off"
            />
            <Button onClick={handleRotateSecret} loading={rotating} disabled={loading}>
              Neues Passwort erzeugen
            </Button>
          </BlockStack>

          {hint ? (
            <Text as="p" variant="bodySm" tone="subdued">
              {hint}
            </Text>
          ) : null}

          <InlineStack gap="200">
            <Button onClick={load} disabled={loading}>
              Aktualisieren
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
