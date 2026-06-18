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
            {locale === "en"
              ? <strong>Settings → Channels → Add shop → "Custom web shop (Billbee API)"</strong>
              : locale === "tr"
              ? <strong>Ayarlar → Kanallar → Mağaza ekle → "Özel web mağazası (Billbee API)"</strong>
              : locale === "fr"
              ? <strong>Paramètres → Canaux → Ajouter une boutique → « Boutique web personnalisée (API Billbee) »</strong>
              : locale === "es"
              ? <strong>Configuración → Canales → Agregar tienda → "Tienda web personalizada (API Billbee)"</strong>
              : locale === "it"
              ? <strong>Impostazioni → Canali → Aggiungi negozio → "Negozio web personalizzato (API Billbee)"</strong>
              : <strong>Einstellungen → Kanäle → Shop hinzufügen → „Eigener Webshop (Billbee API)"</strong>
            }
          </Text>
          <Text as="p" variant="bodySm">
            {locale === "en" ? "Fill in the fields in Billbee:" : locale === "tr" ? "Billbee'deki alanları doldurun:" : locale === "fr" ? "Remplissez les champs dans Billbee :" : locale === "es" ? "Complete los campos en Billbee:" : locale === "it" ? "Compilare i campi in Billbee:" : "Felder in Billbee ausfüllen:"}
          </Text>
          <Text as="p" variant="bodySm">
            • <strong>{locale === "en" ? "Shop URL" : locale === "tr" ? "Mağaza URL" : locale === "fr" ? "URL boutique" : locale === "es" ? "URL de tienda" : locale === "it" ? "URL negozio" : "Shop-URL"}</strong>{" "}
            → {locale === "en" ? <>Copy "URL (API Base)" below (ends with <code>/api/billbee</code>)</> : locale === "tr" ? <>Aşağıdaki "URL (API Tabanı)"nı kopyalayın (<code>/api/billbee</code> ile biter)</> : locale === "fr" ? <>Copier « URL (base API) » ci-dessous (se termine par <code>/api/billbee</code>)</> : locale === "es" ? <>Copiar "URL (Base API)" abajo (termina en <code>/api/billbee</code>)</> : locale === "it" ? <>Copiare "URL (base API)" qui sotto (termina con <code>/api/billbee</code>)</> : <>„URL (API-Basis)" unten kopieren (endet auf <code>/api/billbee</code>)</>}
          </Text>
          <Text as="p" variant="bodySm">
            • <strong>{locale === "en" ? "Key / API Key" : locale === "tr" ? "Anahtar / API Anahtarı" : locale === "fr" ? "Clé / API Key" : locale === "es" ? "Clave / API Key" : locale === "it" ? "Chiave / API Key" : "Schlüssel / API-Key"}</strong>{" "}
            → {locale === "en" ? <>Copy "Key (API Key)" below (<code>andertal_seller_…</code>)</> : locale === "tr" ? <>Aşağıdaki "Anahtar (API Anahtarı)"nı kopyalayın (<code>andertal_seller_…</code>)</> : locale === "fr" ? <>Copier « Clé (API Key) » ci-dessous (<code>andertal_seller_…</code>)</> : locale === "es" ? <>Copiar "Clave (API Key)" abajo (<code>andertal_seller_…</code>)</> : locale === "it" ? <>Copiare "Chiave (API Key)" qui sotto (<code>andertal_seller_…</code>)</> : <>„Schlüssel (API-Key)" unten kopieren (<code>andertal_seller_…</code>)</>}
          </Text>
          <Text as="p" variant="bodySm">
            • <strong>{locale === "en" ? "Username" : locale === "tr" ? "Kullanıcı adı" : locale === "fr" ? "Nom d'utilisateur" : locale === "es" ? "Nombre de usuario" : locale === "it" ? "Nome utente" : "Benutzername"}</strong>{" "}
            → {locale === "en" ? <>"Basic Auth Username" (your email) <em>or</em> enter the key again</> : locale === "tr" ? <>"Basic Auth Kullanıcı Adı" (e-postanız) <em>veya</em> anahtarı tekrar girin</> : locale === "fr" ? <>"Nom d'utilisateur Basic Auth" (votre e-mail) <em>ou</em> entrez à nouveau la clé</> : locale === "es" ? <>"Nombre de usuario Basic Auth" (su correo) <em>o</em> ingrese la clave nuevamente</> : locale === "it" ? <>"Nome utente Basic Auth" (la tua email) <em>o</em> inserisci di nuovo la chiave</> : <>"Basic Auth Benutzername" (deine E-Mail) <em>oder</em> den Schlüssel nochmal eintragen</>}
          </Text>
          <Text as="p" variant="bodySm">
            • <strong>{locale === "en" ? "Password" : locale === "tr" ? "Şifre" : locale === "fr" ? "Mot de passe" : locale === "es" ? "Contraseña" : locale === "it" ? "Password" : "Passwort"}</strong>{" "}
            → {locale === "en" ? 'Copy "Basic Auth Password" below' : locale === "tr" ? 'Aşağıdaki "Basic Auth Şifresi"ni kopyalayın' : locale === "fr" ? '« Mot de passe Basic Auth » ci-dessous' : locale === "es" ? 'Copiar "Contraseña Basic Auth" abajo' : locale === "it" ? 'Copiare "Password Basic Auth" qui sotto' : '„Basic Auth Passwort" unten kopieren'}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {locale === "en"
              ? "Tip: If Billbee only uses the key field (no username/password), the key alone is sufficient for the connection."
              : locale === "tr"
              ? "İpucu: Billbee yalnızca anahtar alanını kullanıyorsa (kullanıcı adı/şifre yok), bağlantı için anahtar tek başına yeterlidir."
              : locale === "fr"
              ? "Conseil : si Billbee n'utilise que le champ clé (sans nom d'utilisateur/mot de passe), la clé seule suffit pour la connexion."
              : locale === "es"
              ? "Consejo: si Billbee solo usa el campo de clave (sin nombre de usuario/contraseña), la clave sola es suficiente para la conexión."
              : locale === "it"
              ? "Suggerimento: se Billbee utilizza solo il campo chiave (senza nome utente/password), la chiave da sola è sufficiente per la connessione."
              : "Tipp: Wenn Billbee nur das Schlüssel-Feld verwendet (kein Benutzername/Passwort), reicht der Schlüssel allein für die Verbindung."
            }
          </Text>
        </BlockStack>
      </Banner>

      <TextField
        label={locale === "en" ? "Name (suggestion)" : locale === "tr" ? "Ad (öneri)" : locale === "fr" ? "Nom (suggestion)" : locale === "es" ? "Nombre (sugerencia)" : locale === "it" ? "Nome (suggerimento)" : "Name (Vorschlag)"}
        value={loading ? "…" : name}
        readOnly
        autoComplete="off"
      />

      <CopyField
        label={locale === "en" ? "URL (API Base)" : locale === "tr" ? "URL (API Tabanı)" : locale === "fr" ? "URL (base API)" : locale === "es" ? "URL (base API)" : locale === "it" ? "URL (base API)" : "URL (API-Basis)"}
        value={loading ? "" : apiBaseUrl}
        helpText={locale === "en" ? "Often used as Shop URL in Billbee; endpoints: /orders, /products, /stock" : locale === "tr" ? "Billbee'de genellikle Shop URL olarak kullanılır; uç noktalar: /orders, /products, /stock" : locale === "fr" ? "Souvent utilisé comme URL de boutique dans Billbee ; points de terminaison : /orders, /products, /stock" : locale === "es" ? "Se usa frecuentemente como URL de tienda en Billbee; puntos finales: /orders, /products, /stock" : locale === "it" ? "Spesso usato come URL negozio in Billbee; endpoint: /orders, /products, /stock" : "Oft als Shop-URL in Billbee; Endpunkte: /orders, /products, /stock"}
        multiline
        locale={locale}
      />

      <CopyField
        label={locale === "en" ? "Key (API Key)" : locale === "tr" ? "Anahtar (API Anahtarı)" : locale === "fr" ? "Clé (API Key)" : locale === "es" ? "Clave (API Key)" : locale === "it" ? "Chiave (API Key)" : "Schlüssel (API-Key)"}
        value={loading ? "" : apiKey}
        helpText={locale === "en" ? "Format andertal_seller_… — also optionally as X-Andertal-Api-Key header" : locale === "tr" ? "Format andertal_seller_… — opsiyonel olarak X-Andertal-Api-Key başlığı olarak da kullanılabilir" : locale === "fr" ? "Format andertal_seller_… — également optionnellement en tant qu'en-tête X-Andertal-Api-Key" : locale === "es" ? "Formato andertal_seller_… — también opcionalmente como cabecera X-Andertal-Api-Key" : locale === "it" ? "Formato andertal_seller_… — anche opzionalmente come intestazione X-Andertal-Api-Key" : "Format andertal_seller_… — zusätzlich optional als X-Andertal-Api-Key Header"}
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
