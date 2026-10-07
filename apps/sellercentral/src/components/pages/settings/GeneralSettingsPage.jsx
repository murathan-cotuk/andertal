"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { usePathname, Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { userError } from "@/lib/api-error-messages";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import {
  Card,
  Text,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Box,
  Divider,
  Banner,
  Select,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import MediaPickerModal from "@/components/MediaPickerModal";
import { routing } from "@/i18n/routing";
import { getUI } from "@/lib/ui-strings";

import { confirmRemoval } from "@/lib/confirm-delete";
const ALL_SHOP_LOCALES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "tr", label: "Türkçe" },
];

function LocaleToggle({ on, onChange, disabled, label }) {
  return (
    <button
      type="button"
      onClick={() => { if (!disabled) onChange(!on); }}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-checked={on}
      role="switch"
      style={{
        width: 46,
        height: 26,
        borderRadius: 13,
        padding: 0,
        background: on ? "#10b981" : "#d6ccbd",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

function SectionLabel({ title, subtitle }) {
  return (
    <BlockStack gap="100">
      <Text as="h2" variant="headingMd">{title}</Text>
      {subtitle ? (
        <Text as="p" tone="subdued" variant="bodySm">{subtitle}</Text>
      ) : null}
    </BlockStack>
  );
}

function parseLegalCity(raw) {
  const s = String(raw || "").trim();
  if (!s) return { postal: "", city: "" };
  const m = s.match(/^(\d{4,5})\s+(.+)$/);
  if (m) return { postal: m[1], city: m[2].trim() };
  return { postal: "", city: s };
}

export default function GeneralSettingsPage() {
  const client = getMedusaAdminClient();
  const router = useRouter();
  const locale = useLocale();
  const ui = getUI(locale || "de");
  const pathname = usePathname() || "/";
  const pathWithoutLocale = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const t = useTranslations("locale");
  const [formData, setFormData] = useState({
    storeName: "",
    shopLogoUrl: "",
    phone: "",
    companyName: "",
    taxId: "",
    vatId: "",
    lucidNumber: "",
    eprDocumentUrl: "",
    website: "",
    businessStreet: "",
    businessCity: "",
    businessPostalCode: "",
    businessCountry: "",
    representative: "",
    tradeRegister: "",
    registerCourt: "",
    legalEmail: "",
    shopAbout: "",
    returnConditions: "",
    documents: [],
  });
  const [saved, setSaved] = useState(false);
  const [baselineSnapshot, setBaselineSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadingDocs, setUploadingDocs] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [enabledShopLocales, setEnabledShopLocales] = useState(() => ALL_SHOP_LOCALES.map((l) => l.code));
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceImageUrl, setMaintenanceImageUrl] = useState("");
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState("");
  const [maintenancePickerOpen, setMaintenancePickerOpen] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [localesSaving, setLocalesSaving] = useState(false);
  const [localesSaved, setLocalesSaved] = useState(false);
  const [localesError, setLocalesError] = useState("");
  const [uiLocale, setUiLocale] = useState(locale || "de");
  const [localeSaving, setLocaleSaving] = useState(false);

  const copy = {
    pageIntro: locale === "tr" ? "Mağaza adı, şirket ve yasal bilgiler. Adresler (depo / iade / fatura) Ayarlar → Konumlar’da yönetilir." : locale === "en" ? "Store name, company and legal details. Addresses (warehouse / returns / billing) are managed under Settings → Locations." : locale === "fr" ? "Nom de la boutique, données de l’entreprise et mentions légales. Les adresses (entrepôt / retours / facturation) se gèrent dans Paramètres → Emplacements." : locale === "es" ? "Nombre de la tienda, datos de la empresa y legales. Las direcciones (almacén / devoluciones / facturación) se gestionan en Ajustes → Ubicaciones." : locale === "it" ? "Nome del negozio, dati aziendali e legali. Gli indirizzi (magazzino / resi / fatturazione) si gestiscono in Impostazioni → Sedi." : "Shopname, Firmen- und Rechtsdaten. Adressen (Lager / Retoure / Rechnung) verwalten Sie unter Einstellungen → Standorte.",
    storeCard: locale === "tr" ? "Mağaza" : locale === "en" ? "Store" : locale === "fr" ? "Boutique" : locale === "es" ? "Tienda" : locale === "it" ? "Negozio" : "Shop",
    storeCardSub: locale === "tr" ? "Shop’ta ürün sayfalarında satıcı olarak görünür." : locale === "en" ? "Shown as the seller on product pages in the shop." : locale === "fr" ? "Affiché comme vendeur sur les pages produit de la boutique." : locale === "es" ? "Se muestra como vendedor en las páginas de producto de la tienda." : locale === "it" ? "Mostrato come venditore nelle pagine prodotto del negozio." : "Wird im Shop auf Produktseiten als Verkäufer angezeigt.",
    companyCard: isSuperuser
      ? (locale === "tr" ? "Şirket & platform işletmecisi" : locale === "en" ? "Company & platform operator" : locale === "fr" ? "Entreprise et opérateur de la plateforme" : locale === "es" ? "Empresa y operador de la plataforma" : locale === "it" ? "Azienda e gestore della piattaforma" : "Firma & Plattformbetreiber")
      : (locale === "tr" ? "Şirket bilgileri" : locale === "en" ? "Company details" : locale === "fr" ? "Données de l’entreprise" : locale === "es" ? "Datos de la empresa" : locale === "it" ? "Dati aziendali" : "Firmendaten"),
    companyCardSub: isSuperuser
      ? (locale === "tr" ? "Tek form: satıcı hesabı ve platform Impressum / sözleşme PDF’i aynı kaynaktan beslenir." : locale === "en" ? "One form feeds both your seller account and the platform Impressum / seller-agreement PDF." : locale === "fr" ? "Un seul formulaire alimente votre compte vendeur et les mentions légales / le PDF du contrat vendeur de la plateforme." : locale === "es" ? "Un solo formulario alimenta tu cuenta de vendedor y el aviso legal / PDF del contrato de vendedor de la plataforma." : locale === "it" ? "Un unico modulo alimenta il tuo account venditore e le note legali / il PDF del contratto venditore della piattaforma." : "Ein Formular speist Konto und Plattform-Impressum / Seller-Agreement-PDF.")
      : (locale === "tr" ? "Yasal şirket adı, vergi bilgileri ve kayıtlı iş adresi." : locale === "en" ? "Legal company name, tax details and registered business address." : locale === "fr" ? "Raison sociale, données fiscales et adresse du siège." : locale === "es" ? "Razón social, datos fiscales y domicilio social." : locale === "it" ? "Ragione sociale, dati fiscali e sede legale." : "Rechtlicher Firmenname, Steuerdaten und eingetragene Geschäftsadresse."),
    identity: locale === "tr" ? "Kimlik" : locale === "en" ? "Identity" : locale === "fr" ? "Identité" : locale === "es" ? "Identidad" : locale === "it" ? "Identità" : "Identität",
    address: locale === "tr" ? "Kayıtlı iş adresi" : locale === "en" ? "Registered business address" : locale === "fr" ? "Adresse du siège" : locale === "es" ? "Domicilio social" : locale === "it" ? "Sede legale" : "Eingetragene Geschäftsadresse",
    register: locale === "tr" ? "Ticaret sicili" : locale === "en" ? "Trade register" : locale === "fr" ? "Registre du commerce" : locale === "es" ? "Registro mercantil" : locale === "it" ? "Registro delle imprese" : "Handelsregister",
    contact: locale === "tr" ? "İletişim" : locale === "en" ? "Contact" : locale === "fr" ? "Contact" : locale === "es" ? "Contacto" : locale === "it" ? "Contatto" : "Kontakt",
    compliance: locale === "tr" ? "Ambalaj Geri Dönüşüm (LUCID / EPR)" : locale === "en" ? "Packaging Recycling (LUCID / EPR)" : locale === "fr" ? "Emballages (LUCID / REP)" : locale === "es" ? "Envases (LUCID / RAP)" : locale === "it" ? "Imballaggi (LUCID / EPR)" : "Verpackungsgesetz (LUCID / EPR)",
    complianceSub: locale === "tr" ? "VerpackG gereği zorunlu. Geçerli LUCID olmadan Almanya’da ürün listelenemez." : locale === "en" ? "Required under VerpackG. Without valid LUCID you cannot list on DE marketplaces." : locale === "fr" ? "Obligatoire selon la loi allemande VerpackG. Sans enregistrement LUCID valide, aucune mise en vente sur les marketplaces allemandes." : locale === "es" ? "Obligatorio según la ley alemana VerpackG. Sin registro LUCID válido no se puede vender en marketplaces alemanes." : locale === "it" ? "Obbligatorio secondo la legge tedesca VerpackG. Senza registrazione LUCID valida non si può vendere sui marketplace tedeschi." : "Pflichtangabe nach VerpackG. Ohne gültige LUCID-Registrierung keine Listings auf DE-Marktplätzen.",
    docs: locale === "tr" ? "Zorunlu belgeler" : locale === "en" ? "Required documents" : locale === "fr" ? "Documents obligatoires" : locale === "es" ? "Documentos obligatorios" : locale === "it" ? "Documenti obbligatori" : "Pflichtunterlagen",
    docsSub: locale === "tr"
      ? "Üç belge zorunludur. Her biri kendi alanına yüklenir."
      : locale === "en"
        ? "Three documents are required. Each one is uploaded in its own field."
        : locale === "fr"
          ? "Trois documents sont obligatoires. Chacun se téléverse dans son propre champ."
          : locale === "es"
            ? "Tres documentos son obligatorios. Cada uno se sube en su propio campo."
            : locale === "it"
              ? "Tre documenti sono obbligatori. Ognuno va caricato nel proprio campo."
              : "Drei Dokumente sind Pflicht. Jedes wird in ein eigenes Feld geladen.",
    docSlots: [
      {
        id: "authority",
        title: locale === "tr" ? "Yetkili kişiyi gösteren resmi belge" : locale === "en" ? "Official document naming the responsible person" : locale === "fr" ? "Document officiel désignant le responsable" : locale === "es" ? "Documento oficial que identifica al responsable" : locale === "it" ? "Documento ufficiale che indica il responsabile" : "Amtliches Dokument zur vertretungsberechtigten Person",
        help: locale === "tr"
          ? "Belediyeden alınmış Gewerbeanmeldung ya da ticaret siciline kayıtlıysanız Handelsregisterauszug. Belgede yasal sorumlu kişinin adı yazmalıdır. Tek dosya."
          : locale === "en"
            ? "The Gewerbeanmeldung from the municipality, or a Handelsregisterauszug if the business is registered. The document must name the person legally responsible. One file."
            : locale === "fr"
              ? "La Gewerbeanmeldung de la commune, ou un extrait du registre du commerce si l’entreprise y est inscrite. Le document doit nommer la personne responsable. Un seul fichier."
              : locale === "es"
                ? "La Gewerbeanmeldung del municipio o un extracto del registro mercantil si la empresa está inscrita. El documento debe nombrar a la persona responsable. Un solo archivo."
                : locale === "it"
                  ? "La Gewerbeanmeldung del comune oppure un estratto del registro delle imprese se l’attività è iscritta. Il documento deve indicare la persona responsabile. Un solo file."
                  : "Die Gewerbeanmeldung der Gemeinde oder, bei Registereintragung, ein Handelsregisterauszug. Das Dokument muss die vertretungsberechtigte Person namentlich nennen. Eine Datei.",
      },
      {
        id: "address_invoice",
        title: locale === "tr" ? "Adres için fatura" : locale === "en" ? "Invoice as proof of address" : locale === "fr" ? "Facture comme justificatif d’adresse" : locale === "es" ? "Factura como prueba de domicilio" : locale === "it" ? "Fattura come prova dell’indirizzo" : "Rechnung als Adressnachweis",
        help: locale === "tr"
          ? "İşletmenin veya sahibin adına düzenlenmiş, işletme adresini gösteren bir fatura. Son üç ay içinde kesilmiş olmalıdır. Tek dosya."
          : locale === "en"
            ? "One invoice issued to the business or the owner and showing the business address. It must be dated within the last three months. One file."
            : locale === "fr"
              ? "Une facture au nom de l’entreprise ou du titulaire, indiquant l’adresse de l’entreprise. Elle doit dater de moins de trois mois. Un seul fichier."
              : locale === "es"
                ? "Una factura a nombre de la empresa o del titular que muestre la dirección del negocio. Debe tener menos de tres meses. Un solo archivo."
                : locale === "it"
                  ? "Una fattura intestata all’impresa o al titolare che indichi l’indirizzo dell’attività. Deve risalire a meno di tre mesi. Un solo file."
                  : "Eine Rechnung auf den Namen des Unternehmens oder des Inhabers mit der Geschäftsadresse. Sie darf nicht älter als drei Monate sein. Eine Datei.",
      },
      {
        id: "identity",
        title: locale === "tr" ? "Yasal sorumlunun kimliği" : locale === "en" ? "Identity document of the responsible person" : locale === "fr" ? "Pièce d’identité du responsable" : locale === "es" ? "Documento de identidad del responsable" : locale === "it" ? "Documento d’identità del responsabile" : "Ausweis der vertretungsberechtigten Person",
        help: locale === "tr"
          ? "Resmi belgede adı geçen kişinin pasaportu veya kimlik kartı. Çevrimiçi pazar yeri için (AB) 2022/2065 sayılı Tüzük madde 30 bunu ister. Tek dosya."
          : locale === "en"
            ? "Passport or national identity card of the person named in the official document. Article 30 of Regulation (EU) 2022/2065 requires this for an online marketplace. One file."
            : locale === "fr"
              ? "Passeport ou carte d’identité de la personne nommée dans le document officiel. L’article 30 du règlement (UE) 2022/2065 l’exige pour une place de marché. Un seul fichier."
              : locale === "es"
                ? "Pasaporte o documento nacional de identidad de la persona que figura en el documento oficial. El artículo 30 del Reglamento (UE) 2022/2065 lo exige en un mercado en línea. Un solo archivo."
                : locale === "it"
                  ? "Passaporto o carta d’identità della persona indicata nel documento ufficiale. L’articolo 30 del regolamento (UE) 2022/2065 lo richiede per un marketplace. Un solo file."
                  : "Reisepass oder Personalausweis der Person, die im amtlichen Dokument genannt ist. Artikel 30 der Verordnung (EU) 2022/2065 verlangt dies für einen Online-Marktplatz. Eine Datei.",
      },
    ],
    locationsNote: locale === "tr" ? "Depo, iade ve fatura adresleri →" : locale === "en" ? "Warehouse, returns and billing addresses →" : locale === "fr" ? "Adresses d’entrepôt, de retour et de facturation →" : locale === "es" ? "Direcciones de almacén, devoluciones y facturación →" : locale === "it" ? "Indirizzi di magazzino, resi e fatturazione →" : "Lager-, Retouren- und Rechnungsadressen →",
    locationsLink: locale === "tr" ? "Konumlar" : locale === "en" ? "Locations" : locale === "fr" ? "Emplacements" : locale === "es" ? "Ubicaciones" : locale === "it" ? "Sedi" : "Standorte",
    managingDirector: locale === "tr" ? "Yetkili kişi (Geschäftsführer)" : locale === "en" ? "Managing Director" : locale === "fr" ? "Représenté par (gérant)" : locale === "es" ? "Representado por (administrador)" : locale === "it" ? "Rappresentato da (amministratore)" : "Vertreten durch (Geschäftsführer)",
    tradeReg: locale === "tr" ? "Ticaret sicil no." : locale === "en" ? "Trade Register No." : locale === "fr" ? "N° au registre du commerce" : locale === "es" ? "N.º de registro mercantil" : locale === "it" ? "N. registro imprese" : "Handelsregisternummer",
    regCourt: locale === "tr" ? "Sicil mahkemesi" : locale === "en" ? "Registry Court" : locale === "fr" ? "Tribunal d’immatriculation" : locale === "es" ? "Juzgado del registro" : locale === "it" ? "Tribunale del registro" : "Registergericht",
    legalEmail: locale === "tr" ? "Yasal / Impressum e-posta" : locale === "en" ? "Legal / Impressum email" : locale === "fr" ? "E-mail légal / mentions légales" : locale === "es" ? "E-mail legal / aviso legal" : locale === "it" ? "E-mail legale / note legali" : "Rechtliche / Impressum-E-Mail",
    ibanNote: locale === "tr" ? "IBAN ve banka bilgileri: Ayarlar → Ödemeler." : locale === "en" ? "IBAN and bank details: Settings → Payments." : locale === "fr" ? "IBAN et coordonnées bancaires : Paramètres → Paiements." : locale === "es" ? "IBAN y datos bancarios: Ajustes → Pagos." : locale === "it" ? "IBAN e dati bancari: Impostazioni → Pagamenti." : "IBAN und Bankverbindung: Einstellungen → Zahlungen.",
  };

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8000);
    const load = async () => {
      try {
        const isSuLs = typeof window !== "undefined" ? localStorage.getItem("sellerIsSuperuser") === "true" : false;
        const [data, accountData] = await Promise.all([
          client.getSellerSettings(),
          client.getSellerAccount().catch(() => ({})),
        ]);
        const isSu = accountData?.sellerUser?.is_superuser === true || accountData?.is_superuser === true || isSuLs;
        if (!cancelled) setIsSuperuser(isSu);

        let platData = {};
        if (isSu) {
          platData = await client.getSellerSettings("default").catch(() => ({}));
          const enabled = Array.isArray(platData.enabled_shop_locales) && platData.enabled_shop_locales.length
            ? platData.enabled_shop_locales.map((c) => String(c).toLowerCase())
            : ALL_SHOP_LOCALES.map((l) => l.code);
          if (!cancelled) {
            setEnabledShopLocales(ALL_SHOP_LOCALES.map((l) => l.code).filter((c) => enabled.includes(c)));
            setMaintenanceEnabled(platData.maintenance_mode_enabled === true);
            setMaintenanceImageUrl(platData.maintenance_mode_image_url || "");
          }
        }

        if (!cancelled) {
          const preferred = String(data?.locale || "").toLowerCase();
          if (routing.locales.includes(preferred)) {
            setUiLocale(preferred);
            try { localStorage.setItem("sellerLocale", preferred); } catch (_) {}
          }

          const sellerUser = accountData?.sellerUser || data?.sellerUser || data?.seller || {};
          const businessAddress = sellerUser.business_address || {};
          const documents = Array.isArray(sellerUser.documents) ? sellerUser.documents : [];
          const legalCityParsed = parseLegalCity(platData.legal_city);

          // One source of truth: prefer platform legal_* when present (superuser), else seller company fields
          const companyName = (isSu && platData.legal_company_name) || sellerUser.company_name || "";
          const taxId = (isSu && platData.legal_tax_id) || sellerUser.tax_id || "";
          const vatId = (isSu && platData.legal_vat_id) || sellerUser.vat_id || "";
          const businessStreet = (isSu && platData.legal_street) || businessAddress.street || "";
          const businessPostalCode = (isSu && legalCityParsed.postal) || businessAddress.postal_code || "";
          const businessCity = (isSu && legalCityParsed.city) || businessAddress.city || "";
          const businessCountry = businessAddress.country || "";

          setFormData((prev) => {
            const next = {
              ...prev,
              storeName: data.store_name || "",
              shopLogoUrl: data.shop_logo_url || "",
              phone: sellerUser.phone || "",
              companyName,
              taxId,
              vatId,
              lucidNumber: sellerUser.lucid_number || "",
              eprDocumentUrl: sellerUser.epr_document_url || "",
              website: sellerUser.website || "",
              businessStreet,
              businessCity,
              businessPostalCode,
              businessCountry,
              representative: platData.legal_representative || "",
              tradeRegister: platData.legal_trade_register || "",
              registerCourt: platData.legal_register_court || "",
              legalEmail: platData.legal_email || "",
              shopAbout: data.shop_about || "",
              returnConditions: data.return_conditions || "",
              documents,
            };
            setBaselineSnapshot(JSON.stringify(next));
            return next;
          });
        }
      } catch (_) {
        if (!cancelled) {
          setFormData((prev) => {
            const next = {
              ...prev,
              storeName: typeof window !== "undefined" ? (localStorage.getItem("storeName") || "") : "",
            };
            setBaselineSnapshot(JSON.stringify(next));
            return next;
          });
        }
      } finally {
        if (!cancelled) {
          clearTimeout(timeout);
          setLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setSaveError("");
    setSaving(true);
    try {
      await client.updateSellerSettings({
        store_name: formData.storeName.trim(),
        shop_logo_url: formData.shopLogoUrl.trim() || "",
        shop_about: formData.shopAbout.trim() || "",
        return_conditions: formData.returnConditions.trim() || "",
      });
      await client.updateSellerCompanyInfo({
        company_name: formData.companyName.trim() || null,
        tax_id: formData.taxId.trim() || null,
        vat_id: formData.vatId.trim() || null,
        lucid_number: formData.lucidNumber.trim() || null,
        epr_document_url: formData.eprDocumentUrl.trim() || null,
        phone: formData.phone.trim() || null,
        website: formData.website.trim() || null,
        documents: Array.isArray(formData.documents) ? formData.documents : [],
        business_address: {
          street: formData.businessStreet.trim() || "",
          city: formData.businessCity.trim() || "",
          postal_code: formData.businessPostalCode.trim() || "",
          country: formData.businessCountry.trim() || "",
        },
      });

      // Superuser: same values also become platform Impressum / agreement PDF source
      if (isSuperuser) {
        const legalCity = [formData.businessPostalCode.trim(), formData.businessCity.trim()].filter(Boolean).join(" ");
        await client.updateSellerSettings({
          seller_id: "default",
          legal_company_name: formData.companyName.trim() || "",
          legal_representative: formData.representative.trim() || "",
          legal_street: formData.businessStreet.trim() || "",
          legal_city: legalCity,
          legal_trade_register: formData.tradeRegister.trim() || "",
          legal_register_court: formData.registerCourt.trim() || "",
          legal_vat_id: formData.vatId.trim() || "",
          legal_tax_id: formData.taxId.trim() || "",
          legal_email: formData.legalEmail.trim() || "",
        });
      }

      const newName = formData.storeName.trim();
      if (typeof window !== "undefined" && newName) {
        localStorage.setItem("storeName", newName);
        window.dispatchEvent(new CustomEvent("sellerStoreNameChanged", { detail: { storeName: newName } }));
      }
      setBaselineSnapshot(JSON.stringify(formData));
      setSaved(true);
      setSaving(false);
      setTimeout(() => setSaved(false), 3000);
      return true;
    } catch (err) {
      setSaveError(userError(err, locale, "Failed to save settings."));
      setSaving(false);
      return false;
    }
  };

  // Top save/discard bar (next to the search bar) — same pattern as ProductEditPage etc.,
  // instead of this form's own bottom Save button, which most settings pages never had wired up.
  const isDirty = baselineSnapshot != null && JSON.stringify(formData) !== baselineSnapshot;
  const unsaved = useUnsavedChanges();

  const handleDiscard = useCallback(() => {
    if (baselineSnapshot == null) return;
    setFormData(JSON.parse(baselineSnapshot));
    setSaveError("");
  }, [baselineSnapshot]);

  const saveRef = useRef(handleSubmit);
  saveRef.current = handleSubmit;
  const discardRef = useRef(handleDiscard);
  discardRef.current = handleDiscard;

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setDirty(!!isDirty);
  }, [isDirty, unsaved]);

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setHandlers({
      onSave: () => saveRef.current?.(),
      onDiscard: () => discardRef.current?.(),
    });
    return () => {
      unsaved.clearHandlers();
      unsaved.setDirty(false);
    };
    // Deliberately not depending on `unsaved` itself — see ProductEditPage.jsx for why (its
    // memoized value changes identity on every isDirty toggle, which would re-run this cleanup
    // and wipe the bar out right after it appears).
  }, [unsaved?.setHandlers, unsaved?.clearHandlers, unsaved?.setDirty]);

  const handleLocaleToggle = async (code, nextOn) => {
    if (!isSuperuser) return;
    const prev = enabledShopLocales;
    let next;
    if (nextOn) {
      next = ALL_SHOP_LOCALES.map((l) => l.code).filter((c) => c === code || prev.includes(c));
    } else {
      next = prev.filter((c) => c !== code);
      if (!next.length) {
        setLocalesError(
          locale === "tr" ? "En az bir dil açık kalmalı." : locale === "en" ? "At least one language must stay enabled." : locale === "fr" ? "Au moins une langue doit rester activée." : locale === "es" ? "Al menos un idioma debe permanecer activo." : locale === "it" ? "Almeno una lingua deve restare attiva." : "Mindestens eine Sprache muss aktiv bleiben.",
        );
        return;
      }
    }
    setLocalesError("");
    setEnabledShopLocales(next);
    setLocalesSaving(true);
    try {
      await client.updateSellerSettings({ seller_id: "default", enabled_shop_locales: next });
      setLocalesSaved(true);
      setTimeout(() => setLocalesSaved(false), 2500);
      try {
        const shopOrigin = (typeof window !== "undefined" && window.location?.origin?.includes("localhost"))
          ? (process.env.NEXT_PUBLIC_SHOP_URL || "http://localhost:3000")
          : (process.env.NEXT_PUBLIC_SHOP_URL || "");
        if (shopOrigin) {
          fetch(`${shopOrigin.replace(/\/$/, "")}/api/store-seller-settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seller_id: "default" }),
          }).catch(() => {});
        }
      } catch (_) {}
    } catch (err) {
      setEnabledShopLocales(prev);
      setLocalesError(err?.message || ui.saveError);
    } finally {
      setLocalesSaving(false);
    }
  };

  const bustShopSettingsCache = () => {
    try {
      const shopOrigin = (typeof window !== "undefined" && window.location?.origin?.includes("localhost"))
        ? (process.env.NEXT_PUBLIC_SHOP_URL || "http://localhost:3000")
        : (process.env.NEXT_PUBLIC_SHOP_URL || "");
      if (shopOrigin) {
        fetch(`${shopOrigin.replace(/\/$/, "")}/api/store-seller-settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seller_id: "default" }),
        }).catch(() => {});
      }
    } catch (_) {}
  };

  const handleMaintenanceToggle = async (nextOn) => {
    if (!isSuperuser) return;
    const prev = maintenanceEnabled;
    setMaintenanceEnabled(nextOn);
    setMaintenanceError("");
    setMaintenanceSaving(true);
    try {
      await client.updateSellerSettings({ seller_id: "default", maintenance_mode_enabled: nextOn });
      bustShopSettingsCache();
    } catch (err) {
      setMaintenanceEnabled(prev);
      setMaintenanceError(err?.message || ui.saveError);
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const handleMaintenanceImageSelect = async (urls) => {
    const url = urls?.[0];
    if (!url) return;
    setMaintenancePickerOpen(false);
    const prev = maintenanceImageUrl;
    setMaintenanceImageUrl(url);
    setMaintenanceError("");
    setMaintenanceSaving(true);
    try {
      await client.updateSellerSettings({ seller_id: "default", maintenance_mode_image_url: url });
      bustShopSettingsCache();
    } catch (err) {
      setMaintenanceImageUrl(prev);
      setMaintenanceError(err?.message || ui.saveError);
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const handleDocumentUpload = async (kind, files) => {
    const file = files?.[0];
    if (!file || !kind) return;
    setUploadingDocs(kind);
    setSaveError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await client.uploadMedia(fd);
      if (!result?.url) return;
      const nextDoc = {
        kind,
        name: file.name,
        url: result.url,
        mime_type: file.type || "",
        size: file.size || 0,
        uploaded_at: new Date().toISOString(),
      };
      setFormData((p) => ({
        ...p,
        documents: [...(p.documents || []).filter((doc) => doc?.kind !== kind), nextDoc],
      }));
    } catch (err) {
      setSaveError(userError(err, locale, "Document upload failed."));
    } finally {
      setUploadingDocs(false);
    }
  };

  const removeDocument = (kind) => {
    setFormData((p) => ({ ...p, documents: (p.documents || []).filter((doc) => doc?.kind !== kind) }));
  };

  const handleLanguageChange = async (value) => {
    const next = String(value || "").toLowerCase();
    if (!routing.locales.includes(next) || next === uiLocale) return;
    setUiLocale(next);
    setLocaleSaving(true);
    setSaveError("");
    try {
      await client.updateSellerSettings({ locale: next });
      try { localStorage.setItem("sellerLocale", next); } catch (_) {}
      const base =
        pathWithoutLocale === "/" || !pathWithoutLocale
          ? "/settings/general"
          : pathWithoutLocale.startsWith("/")
            ? pathWithoutLocale
            : `/${pathWithoutLocale}`;
      router.push(base, { locale: next });
    } catch (err) {
      setUiLocale(locale || "de");
      setSaveError(userError(err, locale, "Could not save language preference."));
    } finally {
      setLocaleSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="p" tone="subdued">{ui.loading || "Loading…"}</Text>
        </BlockStack>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued">{copy.pageIntro}</Text>
      {saved && (
        <Banner tone="success" onDismiss={() => setSaved(false)}>
          {ui.savedSuccess || "Settings saved successfully."}
        </Banner>
      )}
      {saveError && (
        <Banner tone="critical" onDismiss={() => setSaveError("")}>
          {saveError}
        </Banner>
      )}

      <Card>
        <BlockStack gap="300">
          <SectionLabel
            title={locale === "tr" ? "Arayüz dili" : locale === "en" ? "Interface language" : locale === "fr" ? "Langue de l’interface" : locale === "es" ? "Idioma de la interfaz" : locale === "it" ? "Lingua dell’interfaccia" : "Sprache der Benutzeroberfläche"}
            subtitle={locale === "tr" ? "Sellercentral dil tercihi hesabınıza kaydedilir." : locale === "en" ? "Sellercentral language preference is saved to your account." : locale === "fr" ? "La langue de Sellercentral est enregistrée dans votre compte." : locale === "es" ? "El idioma de Sellercentral se guarda en tu cuenta." : locale === "it" ? "La lingua di Sellercentral viene salvata nel tuo account." : "Die Sellercentral-Spracheinstellung wird in Ihrem Konto gespeichert."}
          />
          <Box maxWidth="320px">
            <Select
              label={locale === "tr" ? "Dil" : locale === "en" ? "Language" : locale === "fr" ? "Langue" : locale === "es" ? "Idioma" : locale === "it" ? "Lingua" : "Sprache"}
              labelHidden
              options={routing.locales.map((loc) => ({ label: t(loc), value: loc }))}
              value={uiLocale}
              onChange={handleLanguageChange}
              disabled={localeSaving}
            />
          </Box>
        </BlockStack>
      </Card>

      <form onSubmit={handleSubmit}>
        <BlockStack gap="400">
          <Card>
            <BlockStack gap="400">
              <SectionLabel title={copy.storeCard} subtitle={copy.storeCardSub} />
              <TextField
                label={ui.storeName || "Store name"}
                value={formData.storeName}
                onChange={(v) => setFormData((p) => ({ ...p, storeName: v }))}
                placeholder="e.g. Mein Shop"
                autoComplete="organization"
              />
              <div>
                <Text as="p" variant="bodySm" tone="subdued">
                  {locale === "tr" ? "Mağaza logosu (herkese açık satıcı sayfanızda görünür)" : locale === "en" ? "Store logo (shown on your public seller page)" : locale === "fr" ? "Logo de la boutique (affiché sur votre page vendeur publique)" : locale === "es" ? "Logo de la tienda (se muestra en tu página pública de vendedor)" : locale === "it" ? "Logo del negozio (mostrato nella tua pagina venditore pubblica)" : "Shop-Logo (erscheint auf Ihrer öffentlichen Verkäuferseite)"}
                </Text>
                <InlineStack gap="300" blockAlign="center">
                  {formData.shopLogoUrl ? (
                    <img
                      src={formData.shopLogoUrl}
                      alt=""
                      style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 8, border: "1px solid #e6dfd4", background: "#fff" }}
                    />
                  ) : (
                    <div style={{ width: 64, height: 64, borderRadius: 8, border: "1px dashed #d6ccbd", background: "#faf7f2" }} />
                  )}
                  <Button size="slim" onClick={() => setLogoPickerOpen(true)}>
                    {locale === "tr" ? "Görsel seç" : locale === "en" ? "Choose image" : locale === "fr" ? "Choisir une image" : locale === "es" ? "Elegir imagen" : locale === "it" ? "Scegli immagine" : "Bild auswählen"}
                  </Button>
                  {formData.shopLogoUrl ? (
                    <Button size="slim" tone="critical" variant="plain" onClick={() => setFormData((p) => ({ ...p, shopLogoUrl: "" }))}>
                      {ui.remove || (locale === "tr" ? "Kaldır" : locale === "en" ? "Remove" : locale === "fr" ? "Supprimer" : locale === "es" ? "Eliminar" : locale === "it" ? "Rimuovi" : "Entfernen")}
                    </Button>
                  ) : null}
                </InlineStack>
              </div>
              <InlineStack gap="300" wrap>
                <Box minWidth="200px" width="100%">
                  <TextField
                    label={ui.phone || "Phone"}
                    type="tel"
                    value={formData.phone}
                    onChange={(v) => setFormData((p) => ({ ...p, phone: v }))}
                    placeholder="+49 …"
                    autoComplete="tel"
                  />
                </Box>
                <Box minWidth="200px" width="100%">
                  <TextField
                    label="Website"
                    value={formData.website}
                    onChange={(v) => setFormData((p) => ({ ...p, website: v }))}
                    placeholder="https://..."
                    autoComplete="url"
                  />
                </Box>
              </InlineStack>
              <TextField
                label={locale === "tr" ? "Mağaza hakkında (herkese açık satıcı sayfasında görünür)" : locale === "en" ? "About the shop (shown on your public seller page)" : locale === "fr" ? "À propos de la boutique (affiché sur votre page vendeur publique)" : locale === "es" ? "Sobre la tienda (se muestra en tu página pública de vendedor)" : locale === "it" ? "Informazioni sul negozio (mostrate nella tua pagina venditore pubblica)" : "Über den Shop (erscheint auf deiner öffentlichen Verkäuferseite)"}
                value={formData.shopAbout}
                onChange={(v) => setFormData((p) => ({ ...p, shopAbout: v }))}
                multiline={3}
                autoComplete="off"
                maxLength={800}
                showCharacterCount
              />
              <TextField
                label={locale === "tr" ? "İade ve geri ödeme koşulları (herkese açık satıcı sayfasında görünür)" : locale === "en" ? "Return & refund conditions (shown on your public seller page)" : locale === "fr" ? "Conditions de retour et de remboursement (affichées sur votre page vendeur publique)" : locale === "es" ? "Condiciones de devolución y reembolso (se muestran en tu página pública de vendedor)" : locale === "it" ? "Condizioni di reso e rimborso (mostrate nella tua pagina venditore pubblica)" : "Rücksende- und Erstattungsbedingungen (erscheint auf deiner öffentlichen Verkäuferseite)"}
                value={formData.returnConditions}
                onChange={(v) => setFormData((p) => ({ ...p, returnConditions: v }))}
                multiline={4}
                autoComplete="off"
                maxLength={2000}
              />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <SectionLabel title={copy.companyCard} subtitle={copy.companyCardSub} />

              <Text as="h3" variant="headingSm">{copy.identity}</Text>
              <TextField
                label={ui.companyName || "Company legal name"}
                value={formData.companyName}
                onChange={(v) => setFormData((p) => ({ ...p, companyName: v }))}
                placeholder={isSuperuser ? "Andertal" : "Legal company name"}
                autoComplete="organization"
              />
              {isSuperuser && (
                <TextField
                  label={copy.managingDirector}
                  value={formData.representative}
                  onChange={(v) => setFormData((p) => ({ ...p, representative: v }))}
                  placeholder="First Last"
                  autoComplete="name"
                />
              )}
              <InlineStack gap="300" wrap>
                <Box minWidth="180px">
                  <TextField
                    label={ui.taxId || "Tax ID"}
                    value={formData.taxId}
                    onChange={(v) => setFormData((p) => ({ ...p, taxId: v }))}
                    autoComplete="off"
                  />
                </Box>
                <Box minWidth="180px">
                  <TextField
                    label={ui.vatId || "USt-IdNr. / VAT ID"}
                    value={formData.vatId}
                    onChange={(v) => setFormData((p) => ({ ...p, vatId: v }))}
                    autoComplete="off"
                    helpText="z.B. DE123456789"
                  />
                </Box>
              </InlineStack>
              <Text as="p" tone="subdued" variant="bodySm">{copy.ibanNote}</Text>

              <Divider />
              <Text as="h3" variant="headingSm">{copy.address}</Text>
              <TextField
                label={ui.address || "Street"}
                value={formData.businessStreet}
                onChange={(v) => setFormData((p) => ({ ...p, businessStreet: v }))}
                autoComplete="street-address"
              />
              <InlineStack gap="300" wrap>
                <Box minWidth="120px">
                  <TextField
                    label={ui.postalCode || "Postal code"}
                    value={formData.businessPostalCode}
                    onChange={(v) => setFormData((p) => ({ ...p, businessPostalCode: v }))}
                    autoComplete="postal-code"
                  />
                </Box>
                <Box minWidth="160px">
                  <TextField
                    label={locale === "tr" ? "Şehir" : locale === "en" ? "City" : locale === "fr" ? "Ville" : locale === "es" ? "Ciudad" : locale === "it" ? "Città" : "Stadt"}
                    value={formData.businessCity}
                    onChange={(v) => setFormData((p) => ({ ...p, businessCity: v }))}
                    autoComplete="address-level2"
                  />
                </Box>
                <Box minWidth="140px">
                  <TextField
                    label={locale === "tr" ? "Ülke" : locale === "en" ? "Country" : locale === "fr" ? "Pays" : locale === "es" ? "País" : locale === "it" ? "Paese" : "Land"}
                    value={formData.businessCountry}
                    onChange={(v) => setFormData((p) => ({ ...p, businessCountry: v }))}
                    autoComplete="country-name"
                  />
                </Box>
              </InlineStack>
              <Banner tone="info">
                <p>
                  {copy.locationsNote}{" "}
                  <Link href="/settings/locations" style={{ fontWeight: 600, textDecoration: "underline" }}>
                    {copy.locationsLink}
                  </Link>
                </p>
              </Banner>

              {isSuperuser && (
                <>
                  <Divider />
                  <Text as="h3" variant="headingSm">{copy.register}</Text>
                  <InlineStack gap="300" wrap>
                    <Box minWidth="200px" width="100%">
                      <TextField
                        label={copy.tradeReg}
                        value={formData.tradeRegister}
                        onChange={(v) => setFormData((p) => ({ ...p, tradeRegister: v }))}
                        placeholder="HRB XXXXX"
                        autoComplete="off"
                      />
                    </Box>
                    <Box minWidth="200px" width="100%">
                      <TextField
                        label={copy.regCourt}
                        value={formData.registerCourt}
                        onChange={(v) => setFormData((p) => ({ ...p, registerCourt: v }))}
                        placeholder="Amtsgericht Düsseldorf"
                        autoComplete="off"
                      />
                    </Box>
                  </InlineStack>
                  <Text as="h3" variant="headingSm">{copy.contact}</Text>
                  <TextField
                    label={copy.legalEmail}
                    value={formData.legalEmail}
                    onChange={(v) => setFormData((p) => ({ ...p, legalEmail: v }))}
                    placeholder="info@andertal.com"
                    autoComplete="email"
                    type="email"
                    helpText={ui.adminInfoNote}
                  />
                </>
              )}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <SectionLabel title={copy.compliance} subtitle={copy.complianceSub} />
              <Box maxWidth="320px">
                <TextField
                  label={locale === "tr" ? "LUCID Kayıt Numarası" : locale === "en" ? "LUCID Registration Number" : locale === "fr" ? "Numéro d’enregistrement LUCID" : locale === "es" ? "Número de registro LUCID" : locale === "it" ? "Numero di registrazione LUCID" : "LUCID-Registrierungsnummer"}
                  value={formData.lucidNumber}
                  onChange={(v) => setFormData((p) => ({ ...p, lucidNumber: v }))}
                  placeholder="DE1234567890123"
                  autoComplete="off"
                />
              </Box>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <SectionLabel title={copy.docs} subtitle={copy.docsSub} />
              {copy.docSlots.map((slot) => {
                const current = (formData.documents || []).find((doc) => doc?.kind === slot.id);
                const busy = uploadingDocs === slot.id;
                return (
                  <BlockStack key={slot.id} gap="150">
                    <Text as="h3" variant="headingSm">{slot.title}</Text>
                    <Text as="p" tone="subdued" variant="bodySm">{slot.help}</Text>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => { handleDocumentUpload(slot.id, e.target.files); e.target.value = ""; }}
                      disabled={Boolean(uploadingDocs)}
                    />
                    {busy && <Text as="p" tone="subdued">{locale === "tr" ? "Yükleniyor…" : locale === "de" ? "Wird hochgeladen…" : "Uploading…"}</Text>}
                    {current?.url && (
                      <InlineStack align="space-between" blockAlign="center">
                        <a href={current.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, textDecoration: "underline" }}>
                          {current.name || current.url}
                        </a>
                        <Button size="slim" variant="plain" tone="critical" onClick={async () => { if (await confirmRemoval()) { removeDocument(slot.id); } }}>
                          {ui.delete || "Remove"}
                        </Button>
                      </InlineStack>
                    )}
                  </BlockStack>
                );
              })}
            </BlockStack>
          </Card>
        </BlockStack>
      </form>

      {isSuperuser && (
        <Card>
          <BlockStack gap="400">
            <SectionLabel
              title={locale === "tr" ? "Website dilleri" : locale === "en" ? "Website languages" : locale === "fr" ? "Langues du site" : locale === "es" ? "Idiomas del sitio" : locale === "it" ? "Lingue del sito" : "Website-Sprachen"}
              subtitle={locale === "tr" ? "Shop’ta gösterilecek dilleri aç/kapa." : locale === "en" ? "Toggle which languages appear on the shop." : locale === "fr" ? "Activez ou désactivez les langues affichées dans la boutique." : locale === "es" ? "Activa o desactiva los idiomas que aparecen en la tienda." : locale === "it" ? "Attiva o disattiva le lingue mostrate nel negozio." : "Sprachen für den Shop ein-/ausschalten."}
            />
            <BlockStack gap="300">
              {ALL_SHOP_LOCALES.map((l) => {
                const on = enabledShopLocales.includes(l.code);
                return (
                  <InlineStack key={l.code} align="space-between" blockAlign="center" wrap={false}>
                    <Text as="span" variant="bodyMd">
                      {l.label}{" "}
                      <Text as="span" tone="subdued" variant="bodySm">
                        ({l.code.toUpperCase()})
                      </Text>
                    </Text>
                    <LocaleToggle
                      on={on}
                      disabled={localesSaving || (on && enabledShopLocales.length <= 1)}
                      label={`${l.label} ${on ? "on" : "off"}`}
                      onChange={(v) => handleLocaleToggle(l.code, v)}
                    />
                  </InlineStack>
                );
              })}
            </BlockStack>
            {localesError && <Banner tone="critical"><p>{localesError}</p></Banner>}
            {localesSaved && !localesError && (
              <Banner tone="success">
                <p>{ui.savedSuccess}</p>
              </Banner>
            )}
          </BlockStack>
        </Card>
      )}

      {isSuperuser && (
        <Card>
          <BlockStack gap="400">
            <SectionLabel
              title={locale === "tr" ? "Bakım modu (Coming soon)" : locale === "en" ? "Maintenance mode (Coming soon)" : locale === "fr" ? "Mode maintenance (Coming soon)" : locale === "es" ? "Modo mantenimiento (Coming soon)" : locale === "it" ? "Modalità manutenzione (Coming soon)" : "Wartungsmodus (Coming soon)"}
              subtitle={locale === "tr" ? "Açıldığında shop'taki tüm sayfalar seçilen görselle tam ekran kaplanır." : locale === "en" ? "When on, every page on the shop is covered full-screen by the selected image." : locale === "fr" ? "Une fois activé, chaque page de la boutique est recouverte en plein écran par l’image choisie." : locale === "es" ? "Al activarlo, cada página de la tienda queda cubierta a pantalla completa por la imagen elegida." : locale === "it" ? "Se attivo, ogni pagina del negozio viene coperta a tutto schermo dall’immagine scelta." : "Wenn aktiviert, wird jede Shop-Seite vollflächig vom ausgewählten Bild überdeckt."}
            />
            <InlineStack align="space-between" blockAlign="center" wrap={false}>
              <Text as="span" variant="bodyMd">
                {locale === "tr" ? "Siteyi duraklat" : locale === "en" ? "Pause the site" : locale === "fr" ? "Mettre le site en pause" : locale === "es" ? "Pausar el sitio" : locale === "it" ? "Metti in pausa il sito" : "Website pausieren"}
              </Text>
              <LocaleToggle
                on={maintenanceEnabled}
                disabled={maintenanceSaving}
                label="maintenance mode"
                onChange={handleMaintenanceToggle}
              />
            </InlineStack>
            <BlockStack gap="200">
              <Text as="span" variant="bodyMd">
                {locale === "tr" ? "Görsel" : locale === "en" ? "Image" : locale === "fr" ? "Image" : locale === "es" ? "Imagen" : locale === "it" ? "Immagine" : "Bild"}
              </Text>
              {maintenanceImageUrl ? (
                <img
                  src={maintenanceImageUrl}
                  alt=""
                  style={{ width: "100%", maxWidth: 320, borderRadius: 8, border: "1px solid #e6dfd4", display: "block" }}
                />
              ) : (
                <Text as="p" tone="subdued" variant="bodySm">
                  {locale === "tr" ? "Henüz görsel seçilmedi." : locale === "en" ? "No image selected yet." : locale === "fr" ? "Aucune image sélectionnée." : locale === "es" ? "Aún no se ha elegido imagen." : locale === "it" ? "Nessuna immagine selezionata." : "Noch kein Bild ausgewählt."}
                </Text>
              )}
              <InlineStack gap="200">
                <Button onClick={() => setMaintenancePickerOpen(true)} disabled={maintenanceSaving}>
                  {locale === "tr" ? "Görsel seç" : locale === "en" ? "Choose image" : locale === "fr" ? "Choisir une image" : locale === "es" ? "Elegir imagen" : locale === "it" ? "Scegli immagine" : "Bild auswählen"}
                </Button>
              </InlineStack>
            </BlockStack>
            {maintenanceError && <Banner tone="critical"><p>{maintenanceError}</p></Banner>}
            <MediaPickerModal
              open={maintenancePickerOpen}
              onClose={() => setMaintenancePickerOpen(false)}
              multiple={false}
              onSelect={handleMaintenanceImageSelect}
            />
          </BlockStack>
        </Card>
      )}

      <MediaPickerModal
        open={logoPickerOpen}
        onClose={() => setLogoPickerOpen(false)}
        multiple={false}
        onSelect={(urls) => {
          const url = urls?.[0];
          setLogoPickerOpen(false);
          if (url) setFormData((p) => ({ ...p, shopLogoUrl: url }));
        }}
      />
    </BlockStack>
  );
}
