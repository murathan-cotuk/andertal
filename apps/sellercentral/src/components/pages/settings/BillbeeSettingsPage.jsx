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
import { DuplicateIcon, HideIcon, ViewIcon } from "@shopify/polaris-icons";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

/** Festes Feld mit kleinem Kopieren-Icon oben rechts neben dem Label (übliches UI-Muster). */
function CopyField({ label, value, helpText, multiline, masked = false }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);
  const copy = useCallback(() => {
    const v = String(value || "");
    if (!v) return;
    navigator.clipboard.writeText(v).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);

  const hidden = masked && !visible;

  return (
    <BlockStack gap="100">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {label}
        </Text>
        <InlineStack gap="100" blockAlign="center" wrap={false}>
          {masked ? (
            <Button
              icon={hidden ? ViewIcon : HideIcon}
              variant="plain"
              size="slim"
              disabled={!value}
              accessibilityLabel={hidden ? "Anzeigen" : "Ausblenden"}
              title={hidden ? "Anzeigen" : "Ausblenden"}
              onClick={() => setVisible((v) => !v)}
            />
          ) : null}
          <Button
            icon={DuplicateIcon}
            variant="plain"
            size="slim"
            disabled={!value}
            accessibilityLabel={copied ? "Kopiert" : "Kopieren"}
            title={copied ? "Kopiert" : "Kopieren"}
            onClick={copy}
          />
        </InlineStack>
      </div>
      <TextField
        label={label}
        labelHidden
        helpText={helpText}
        value={value}
        readOnly
        type={hidden ? "password" : "text"}
        multiline={multiline ? 3 : undefined}
        autoComplete="off"
      />
    </BlockStack>
  );
}

/** Marketplace-Verbindung für Billbee. Mit embedded=true in Apps & Integrationen eingebettet (ohne eigene Route). */
export default function BillbeeSettingsPage({ embedded = false }) {
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

  const formInner = (
    <BlockStack gap="400">
      <Banner tone="info">
        <BlockStack gap="200">
          <Text as="p" variant="bodySm">
            <strong>Billbee:</strong>{" "}
            <strong>Einstellungen → Kanäle → Shop hinzufügen → „Eigener Webshop (Billbee API)“</strong> (nicht die alte „Shopverbindung“ mit anderen Feldern).
          </Text>
          <Text as="p" variant="bodySm">
            <strong>Shop-URL / API-Basis:</strong> exakt die „URL (API-Basis)“ von unten kopieren (endet auf{" "}
            <Text as="span" fontWeight="semibold">/api/billbee</Text>). Billbee ruft darunter{" "}
            <code>/orders</code>, <code>/products</code>, <code>/stock</code> auf.
          </Text>
          <Text as="p" variant="bodySm">
            <strong>Anmeldung (HTTP Basic):</strong> Billbee setzt oft den <strong>Schlüssel</strong> (<code>andertal_seller_…</code>) als{" "}
            <strong>Benutzername</strong> und das <strong>Basic-Auth-Passwort</strong> aus Sellercentral als Passwort — dann das Feld „Schlüssel“ in Billbee ggf. leer lassen oder denselben Wert, je nach Maske.
            Alternativ funktioniert <strong>Benutzername = E-Mail</strong> (wie unten) und <strong>Passwort = Basic-Auth-Passwort</strong>.
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Du brauchst <strong>kein</strong> Billbee.io Developer-API-Token in .env für diese Verbindung — Andertal ist der Server, Billbee ist der Client.
          </Text>
        </BlockStack>
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
        <CopyField
          label="Basic Auth Passwort"
          value={loading ? "" : basicPass}
          helpText="Auge-Symbol: ein-/ausblenden. Doppelblatt-Symbol: kopieren."
          masked
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
  );

  return (
    <BlockStack gap="400">
      {!embedded ? (
        <BlockStack gap="100">
          <Text as="h1" variant="headingLg">
            Billbee ↔ Andertal
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            Andertal stellt die API unter <Text as="span" fontWeight="semibold">/api/billbee</Text> bereit. Billbee ruft{" "}
            <strong>deinen Shop</strong> mit den unten angezeigten Zugangsdaten ab — getrennt pro Verkäuferkonto.
          </Text>
        </BlockStack>
      ) : (
        <Text as="p" variant="bodySm" tone="subdued">
          Andertal stellt die API unter <Text as="span" fontWeight="semibold">/api/billbee</Text> bereit — Zugang nur für dein Verkäuferkonto.
        </Text>
      )}

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

      {embedded ? formInner : <Card>{formInner}</Card>}
    </BlockStack>
  );
}
