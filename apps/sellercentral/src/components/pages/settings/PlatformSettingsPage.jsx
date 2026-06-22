"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
  InlineStack,
  Divider,
  Box,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { lt } from "@/lib/locale-text";
import { userError } from "@/lib/api-error-messages";

export default function PlatformSettingsPage() {
  const locale = useLocale();
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const ui = getUI(locale);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [platformName, setPlatformName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storefrontUrl, setStorefrontUrl] = useState("");

  const [snapshot, setSnapshot] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const d = await getMedusaAdminClient().getSellerSettings("default");
      const pn = d?.platform_name || "";
      const se = d?.support_email || "";
      const sn = d?.store_name || "";
      const su = d?.storefront_url || "";
      setPlatformName(pn);
      setSupportEmail(se);
      setStoreName(sn);
      setStorefrontUrl(su);
      setSnapshot(JSON.stringify({ pn, se, sn, su }));
    } catch (e) {
      setErr(userError(e, locale, t("Loading failed.", "Yükleme başarısız.", "Échec du chargement.", "Error de carga.", "Caricamento non riuscito.", "Laden fehlgeschlagen.")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setIsSuperuser(typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  const isDirty =
    snapshot !== null &&
    snapshot !== JSON.stringify({ pn: platformName, se: supportEmail, sn: storeName, su: storefrontUrl });

  const save = async () => {
    setSaving(true);
    setErr("");
    setOk("");
    try {
      await getMedusaAdminClient().updateSellerSettings({
        seller_id: "default",
        store_name: storeName.trim(),
        platform_name: platformName.trim(),
        support_email: supportEmail.trim(),
        storefront_url: storefrontUrl.trim(),
      });
      setOk(t("Settings saved.", "Ayarlar kaydedildi.", "Paramètres enregistrés.", "Configuración guardada.", "Impostazioni salvate.", "Einstellungen gespeichert."));
      await load();
    } catch (e) {
      setErr(userError(e, locale, t("Saving failed.", "Kaydetme başarısız.", "Échec de l'enregistrement.", "Error al guardar.", "Salvataggio non riuscito.", "Speichern fehlgeschlagen.")));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!snapshot) return;
    const s = JSON.parse(snapshot);
    setPlatformName(s.pn);
    setSupportEmail(s.se);
    setStoreName(s.sn);
    setStorefrontUrl(s.su);
    setErr("");
    setOk("");
  };

  const pageTitle = t("Platform Settings", "Platform Ayarları", "Paramètres de la plateforme", "Configuración de plataforma", "Impostazioni piattaforma", "Plattform-Einstellungen");

  if (loading) {
    return (
      <Page title={pageTitle}>
        <Box padding="400">
          <Text tone="subdued">{ui.loading}</Text>
        </Box>
      </Page>
    );
  }

  return (
    <Page title={pageTitle}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              {t("Global settings for the entire platform. Visible to superusers only.", "Tüm platform için genel ayarlar. Yalnızca superkullanıcılar tarafından görülür.", "Paramètres globaux de la plateforme. Visible uniquement par les superutilisateurs.", "Configuración global de la plataforma. Visible solo para superusuarios.", "Impostazioni globali della piattaforma. Visibile solo ai superuser.", "Globale Einstellungen für die gesamte Plattform. Nur für Superuser sichtbar.")}
            </Text>

            {err && (
              <Banner tone="critical" onDismiss={() => setErr("")}>
                <Text as="p">{err}</Text>
              </Banner>
            )}
            {ok && (
              <Banner tone="success" onDismiss={() => setOk("")}>
                <Text as="p">{ok}</Text>
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  {t("General platform data", "Genel platform bilgileri", "Données générales de la plateforme", "Datos generales de la plataforma", "Dati generali della piattaforma", "Allgemeine Plattformdaten")}
                </Text>
                <Text as="p" tone="subdued">
                  {t("These details appear in emails, invoices and the public imprint.", "Bu bilgiler e-postalarda, faturalarda ve kamuya açık künye bölümünde görünür.", "Ces informations apparaissent dans les e-mails, les factures et les mentions légales publiques.", "Estos datos aparecen en correos, facturas y aviso legal público.", "Questi dati compaiono in email, fatture e note legali pubbliche.", "Diese Angaben erscheinen in E-Mails, Rechnungen und im öffentlichen Impressum.")}
                </Text>
                <TextField
                  label={t("Platform name", "Platform adı", "Nom de la plateforme", "Nombre de la plataforma", "Nome piattaforma", "Plattformname")}
                  value={platformName}
                  onChange={setPlatformName}
                  placeholder="e.g. Andertal Marketplace"
                  autoComplete="off"
                  helpText={t("Display name of the platform (visible in emails and the shop)", "Platformun görünen adı (e-postalarda ve mağazada görünür)", "Nom affiché de la plateforme (visible dans les e-mails et la boutique)", "Nombre visible de la plataforma (visible en correos y tienda)", "Nome visualizzato della piattaforma (visibile in email e negozio)", "Anzeigename der Plattform (in E-Mails und im Shop sichtbar)")}
                />
                <TextField
                  label={t("Shop/display name (internal)", "Mağaza/görünen adı (dahili)", "Nom boutique/affichage (interne)", "Nombre de tienda/visualización (interno)", "Nome negozio/visualizzazione (interno)", "Shop-/Anzeigename (intern)")}
                  value={storeName}
                  onChange={setStoreName}
                  placeholder="e.g. Andertal"
                  autoComplete="off"
                  helpText={t("Short name — shown in the Sellercentral header", "Kısa ad — Sellercentral başlığında gösterilir", "Nom court — affiché dans l'en-tête Sellercentral", "Nombre corto — mostrado en el encabezado de Sellercentral", "Nome breve — mostrato nell'intestazione Sellercentral", "Kurzname – wird im Sellercentral-Header angezeigt")}
                />
                <TextField
                  label={t("Support email", "Destek e-postası", "E-mail de support", "Correo de soporte", "Email supporto", "Support-E-Mail")}
                  value={supportEmail}
                  onChange={setSupportEmail}
                  type="email"
                  placeholder="support@andertal.de"
                  autoComplete="off"
                  helpText={t("Contact email for buyers and automated emails", "Alıcılar ve otomatik e-postalar için iletişim e-postası", "E-mail de contact pour les acheteurs et les e-mails automatiques", "Correo de contacto para compradores y correos automáticos", "Email di contatto per clienti ed email automatiche", "Kontakt-E-Mail für Käufer und automatische E-Mails")}
                />
                <TextField
                  label={t("Shop URL", "Mağaza URL", "URL de la boutique", "URL de la tienda", "URL negozio", "Shop-URL")}
                  value={storefrontUrl}
                  onChange={setStorefrontUrl}
                  type="url"
                  placeholder="https://www.andertal.com"
                  autoComplete="off"
                  helpText={t("Public URL of the shop — used in flow emails for links like 'View order'", "Mağazanın genel URL'si — akış e-postalarında 'Siparişi görüntüle' gibi bağlantılar için kullanılır", "URL publique de la boutique — utilisée dans les e-mails flow pour des liens comme 'Voir la commande'", "URL pública de la tienda — usada en correos de flujo para enlaces como 'Ver pedido'", "URL pubblica del negozio — usata nelle email flow per link come 'Visualizza ordine'", "Öffentliche URL des Shops – wird in Flow-E-Mails für Links wie 'Bestellung ansehen' verwendet")}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  {t("More settings", "Daha fazla ayar", "Plus de paramètres", "Más ajustes", "Altre impostazioni", "Weitere Einstellungen")}
                </Text>
                <Divider />
                {[
                  {
                    label: t("Checkout & Payments", "Ödeme & Ödemeler", "Paiement & paiements", "Pago y cobros", "Checkout e pagamenti", "Checkout & Zahlungen"),
                    href: "/settings/checkout",
                    desc: "Stripe, PayPal, Klarna",
                  },
                  {
                    label: t("Branding & Styles", "Marka & Stiller", "Marque & styles", "Marca y estilos", "Branding e stili", "Branding & Stile"),
                    href: "/content/styles",
                    desc: t("Logos, colours, favicon", "Logolar, renkler, favicon", "Logos, couleurs, favicon", "Logos, colores, favicon", "Loghi, colori, favicon", "Logos, Farben, Favicon"),
                  },
                  ...(isSuperuser ? [{
                    label: t("Email (SMTP)", "E-posta (SMTP)", "E-mail (SMTP)", "Correo (SMTP)", "Email (SMTP)", "E-Mail (SMTP)"),
                    href: "/settings/integrations",
                    desc: t("Outgoing email configuration", "Giden e-posta yapılandırması", "Configuration des e-mails sortants", "Configuración de correo saliente", "Configurazione email in uscita", "Ausgehende E-Mail-Konfiguration"),
                  }] : []),
                  {
                    label: t("Billbee Integration", "Billbee Entegrasyonu", "Intégration Billbee", "Integración Billbee", "Integrazione Billbee", "Billbee-Integration"),
                    href: "/settings/integrations",
                    desc: t("Order processing & shipping", "Sipariş işleme & kargo", "Traitement des commandes et expédition", "Procesamiento de pedidos y envío", "Elaborazione ordini e spedizione", "Auftragsabwicklung & Versand"),
                  },
                ].map((item) => (
                  <InlineStack key={item.href} align="space-between" blockAlign="center" wrap={false}>
                    <BlockStack gap="0">
                      <Text variant="bodyMd" fontWeight="semibold">{item.label}</Text>
                      <Text variant="bodySm" tone="subdued">{item.desc}</Text>
                    </BlockStack>
                    <Button
                      variant="plain"
                      url={item.href}
                    >
                      {t("Open", "Aç", "Ouvrir", "Abrir", "Apri", "Öffnen")}
                    </Button>
                  </InlineStack>
                ))}
              </BlockStack>
            </Card>

            <InlineStack gap="300">
              <Button variant="primary" onClick={save} loading={saving} disabled={!isDirty}>
                {ui.save}
              </Button>
              {isDirty && (
                <Button variant="plain" onClick={discard}>
                  {t("Discard", "Vazgeç", "Annuler les changements", "Descartar", "Annulla modifiche", "Verwerfen")}
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
