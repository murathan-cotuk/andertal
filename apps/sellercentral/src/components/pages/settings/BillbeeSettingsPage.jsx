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
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";

/** Read-only field with copy icon (and optional show/hide for masked fields). */
function CopyField({ label, value, helpText, multiline, masked = false, locale = "de" }) {
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
              accessibilityLabel={hidden ? (locale === "en" ? "Show" : locale === "tr" ? "Göster" : "Anzeigen") : (locale === "en" ? "Hide" : locale === "tr" ? "Gizle" : "Ausblenden")}
              title={hidden ? (locale === "en" ? "Show" : locale === "tr" ? "Göster" : "Anzeigen") : (locale === "en" ? "Hide" : locale === "tr" ? "Gizle" : "Ausblenden")}
              onClick={() => setVisible((v) => !v)}
            />
          ) : null}
          <Button
            icon={DuplicateIcon}
            variant="plain"
            size="slim"
            disabled={!value}
            accessibilityLabel={copied ? (locale === "en" ? "Copied" : locale === "tr" ? "Kopyalandı" : "Kopiert") : (locale === "en" ? "Copy" : locale === "tr" ? "Kopyala" : "Kopieren")}
            title={copied ? (locale === "en" ? "Copied" : locale === "tr" ? "Kopyalandı" : "Kopiert") : (locale === "en" ? "Copy" : locale === "tr" ? "Kopyala" : "Kopieren")}
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

/** Billbee marketplace connection. With embedded=true it is embedded in Apps & Integrations (no own route). */
export default function BillbeeSettingsPage({ embedded = false }) {
  const locale = useLocale();
  const ui = getUI(locale);
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
      setErr(e?.message || (locale === "en" ? "Connection data could not be loaded." : locale === "tr" ? "Bağlantı verileri yüklenemedi." : "Verbindungsdaten konnten nicht geladen werden."));
    }
    setLoading(false);
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRotateSecret = async () => {
    if (!(await confirmDelete(locale === "en" ? "Generate new Basic Auth password? You will need to update it in Billbee afterwards." : locale === "tr" ? "Yeni Basic Auth şifresi oluşturulsun mu? Ardından Billbee'de güncellemeniz gerekecek." : "Neues Basic-Auth-Passwort erzeugen? In Billbee musst du das Passwort danach aktualisieren."))) return;
    setRotating(true);
    setErr("");
    setOkBanner("");
    try {
      const data = await client.rotateBillbeeMarketplaceSecret();
      if (data?.basic_auth_password) setBasicPass(data.basic_auth_password);
      setOkBanner(locale === "en" ? "New password saved. Please update it in Billbee." : locale === "tr" ? "Yeni şifre kaydedildi. Lütfen Billbee'de güncelleyin." : "Neues Passwort gespeichert. Bitte in Billbee eintragen.");
    } catch (e) {
      setErr(e?.message || (locale === "en" ? "Error generating new password." : locale === "tr" ? "Yeni şifre oluşturma hatası." : "Fehler beim Erneuern."));
    }
    setRotating(false);
  };

  const formInner = (
    <BlockStack gap="400">
      <Banner tone="info">
        <BlockStack gap="200">
          <Text as="p" variant="bodySm">
            <strong>Billbee:</strong>{" "}
            <strong>Einstellungen → Kanäle → Shop hinzufügen → „Eigener Webshop (Billbee API)"</strong>
          </Text>
          <Text as="p" variant="bodySm">
            Felder in Billbee ausfüllen:
          </Text>
          <Text as="p" variant="bodySm">
            • <strong>Shop-URL</strong> → „URL (API-Basis)" unten kopieren (endet auf <code>/api/billbee</code>)
          </Text>
          <Text as="p" variant="bodySm">
            • <strong>Schlüssel / API-Key</strong> → „Schlüssel (API-Key)" unten kopieren (<code>andertal_seller_…</code>)
          </Text>
          <Text as="p" variant="bodySm">
            • <strong>Benutzername</strong> → „Basic Auth Benutzername" (deine E-Mail) <em>oder</em> den Schlüssel nochmal eintragen
          </Text>
          <Text as="p" variant="bodySm">
            • <strong>Passwort</strong> → „Basic Auth Passwort" unten kopieren
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Tipp: Wenn Billbee nur das Schlüssel-Feld verwendet (kein Benutzername/Passwort), reicht der Schlüssel allein für die Verbindung.
          </Text>
        </BlockStack>
      </Banner>

      <TextField label="Name (Vorschlag)" value={loading ? "…" : name} readOnly autoComplete="off" />

      <CopyField
        label="URL (API-Basis)"
        value={loading ? "" : apiBaseUrl}
        helpText={locale === "en" ? "Often used as Shop URL in Billbee; endpoints: /orders, /products, /stock" : locale === "tr" ? "Billbee'de genellikle Shop URL olarak kullanılır; uç noktalar: /orders, /products, /stock" : "Oft als Shop-URL in Billbee; Endpunkte: /orders, /products, /stock"}
        multiline
        locale={locale}
      />

      <CopyField
        label="Schlüssel (API-Key)"
        value={loading ? "" : apiKey}
        helpText={locale === "en" ? "Format andertal_seller_… — also optionally as X-Andertal-Api-Key header" : locale === "tr" ? "Format andertal_seller_… — opsiyonel olarak X-Andertal-Api-Key başlığı olarak da kullanılabilir" : "Format andertal_seller_… — zusätzlich optional als X-Andertal-Api-Key Header"}
        multiline={false}
        locale={locale}
      />

      <CopyField
        label={locale === "en" ? "Basic Auth Username" : locale === "tr" ? "Basic Auth Kullanıcı Adı" : "Basic Auth Benutzername"}
        value={loading ? "" : basicUser}
        helpText={locale === "en" ? "Your Seller Central email address" : locale === "tr" ? "Seller Central e-posta adresiniz" : "Deine Seller-Central E-Mail-Adresse"}
        locale={locale}
      />

      <BlockStack gap="200">
        <CopyField
          label={locale === "en" ? "Basic Auth Password" : locale === "tr" ? "Basic Auth Şifresi" : "Basic Auth Passwort"}
          value={loading ? "" : basicPass}
          helpText={locale === "en" ? "Eye icon: show/hide. Duplicate icon: copy." : locale === "tr" ? "Göz ikonu: göster/gizle. Kopyala ikonu: kopyala." : "Auge-Symbol: ein-/ausblenden. Doppelblatt-Symbol: kopieren."}
          masked
          locale={locale}
        />
        <Button onClick={handleRotateSecret} loading={rotating} disabled={loading}>
          {locale === "en" ? "Generate new password" : locale === "tr" ? "Yeni şifre oluştur" : "Neues Passwort erzeugen"}
        </Button>
      </BlockStack>

      {hint ? (
        <Text as="p" variant="bodySm" tone="subdued">
          {hint}
        </Text>
      ) : null}

      <InlineStack gap="200">
        <Button onClick={load} disabled={loading}>
          {ui.refresh}
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
            {locale === "en"
              ? <>Andertal provides the API at <Text as="span" fontWeight="semibold">/api/billbee</Text>. Billbee fetches <strong>your shop</strong> using the credentials shown below — separately per seller account.</>
              : locale === "tr"
              ? <>Andertal, API'yi <Text as="span" fontWeight="semibold">/api/billbee</Text> adresinde sunar. Billbee, <strong>mağazanızı</strong> aşağıda gösterilen kimlik bilgileriyle çeker — her satıcı hesabı için ayrı ayrı.</>
              : <>Andertal stellt die API unter <Text as="span" fontWeight="semibold">/api/billbee</Text> bereit. Billbee ruft{" "}<strong>deinen Shop</strong> mit den unten angezeigten Zugangsdaten ab — getrennt pro Verkäuferkonto.</>
            }
          </Text>
        </BlockStack>
      ) : (
        <Text as="p" variant="bodySm" tone="subdued">
          {locale === "en"
            ? <>Andertal provides the API at <Text as="span" fontWeight="semibold">/api/billbee</Text> — access only for your seller account.</>
            : locale === "tr"
            ? <>Andertal, API'yi <Text as="span" fontWeight="semibold">/api/billbee</Text> adresinde sunar — yalnızca satıcı hesabınıza erişim.</>
            : <>Andertal stellt die API unter <Text as="span" fontWeight="semibold">/api/billbee</Text> bereit — Zugang nur für dein Verkäuferkonto.</>
          }
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
