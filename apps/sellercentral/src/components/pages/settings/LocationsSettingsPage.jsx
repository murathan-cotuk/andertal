"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Text, BlockStack, InlineStack, Button, TextField, Select,
  Spinner, Banner, Checkbox,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { lt } from "@/lib/locale-text";
import { defaultCountryName } from "@/lib/countries";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";
import { userError } from "@/lib/api-error-messages";

function getLocationTypes(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return [
    { label: t("Warehouse / Fulfillment", "Depo / Fulfillment", "Entrepôt / exécution", "Almacén / cumplimiento", "Magazzino / fulfillment", "Lager / Fulfillment"), value: "warehouse" },
    { label: t("Branch / Store", "Şube / Mağaza", "Succursale / magasin", "Sucursal / tienda", "Filiale / negozio", "Filiale / Store"), value: "store" },
    { label: t("Office", "Ofis", "Bureau", "Oficina", "Ufficio", "Büro"), value: "office" },
    { label: t("Other", "Diğer", "Autre", "Otro", "Altro", "Sonstige"), value: "other" },
  ];
}

function getTypeLabel(type, locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const map = {
    warehouse: t("Warehouse", "Depo", "Entrepôt", "Almacén", "Magazzino", "Lager"),
    store: t("Branch", "Şube", "Succursale", "Sucursal", "Filiale", "Filiale"),
    office: t("Office", "Ofis", "Bureau", "Oficina", "Ufficio", "Büro"),
    other: t("Other", "Diğer", "Autre", "Otro", "Altro", "Sonstige"),
  };
  return map[type] || type;
}

const TYPE_COLORS = { warehouse: "#0070f3", store: "#10b981", office: "#f59e0b", other: "#6b7280" };

const PURPOSE_KEYS = ["is_shipping_from", "is_returns_to", "is_billing"];

function getPurposeMeta(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    is_shipping_from: {
      key: "is_shipping_from",
      title: t("Warehouse / shipping", "Depo / gönderim", "Entrepôt / expédition", "Almacén / envío", "Magazzino / spedizione", "Lager / Versand"),
      short: t("Ships from", "Gönderim", "Expédition", "Envío", "Spedizione", "Versand"),
      hint: t(
        "Default sender address for outbound labels and fulfillment.",
        "Giden etiketler ve fulfillment için varsayılan gönderici adresi.",
        "Adresse d'expéditeur par défaut pour les étiquettes sortantes et l'exécution.",
        "Dirección de remitente predeterminada para etiquetas de salida y fulfillment.",
        "Indirizzo mittente predefinito per etichette in uscita e fulfillment.",
        "Standard-Absenderadresse für ausgehende Labels und Fulfillment.",
      ),
      defaultName: t("Main warehouse", "Ana depo", "Entrepôt principal", "Almacén principal", "Magazzino principale", "Hauptlager"),
      color: "#1e40af",
      bg: "#dbeafe",
      border: "#93c5fd",
    },
    is_returns_to: {
      key: "is_returns_to",
      title: t("Returns (Retoure)", "İade (Retoure)", "Retours", "Devoluciones", "Resi", "Retouren"),
      short: t("Returns", "İadeler", "Retours", "Devoluciones", "Resi", "Retouren"),
      hint: t(
        "Address printed on return labels and shown to customers for returns.",
        "İade etiketlerinde basılan ve müşterilere gösterilen iade adresi.",
        "Adresse imprimée sur les étiquettes de retour et indiquée aux clients.",
        "Dirección impresa en etiquetas de devolución y mostrada a los clientes.",
        "Indirizzo stampato sulle etichette di reso e mostrato ai clienti.",
        "Adresse auf Retourenlabels und für Kunden bei Rücksendungen.",
      ),
      defaultName: t("Returns address", "İade adresi", "Adresse de retour", "Dirección de devolución", "Indirizzo resi", "Retourenadresse"),
      color: "#92400e",
      bg: "#fef3c7",
      border: "#fcd34d",
    },
    is_billing: {
      key: "is_billing",
      title: t("Billing / invoice", "Fatura", "Facturation", "Facturación", "Fatturazione", "Rechnung"),
      short: t("Billing", "Fatura", "Facturation", "Facturación", "Fatturazione", "Rechnung"),
      hint: t(
        "Business / invoice address used on seller documents.",
        "Satıcı belgelerinde kullanılan iş / fatura adresi.",
        "Adresse professionnelle / de facturation sur les documents vendeur.",
        "Dirección comercial / de facturación en documentos del vendedor.",
        "Indirizzo aziendale / di fatturazione sui documenti venditore.",
        "Geschäfts- / Rechnungsadresse auf Verkäuferdokumenten.",
      ),
      defaultName: t("Billing address", "Fatura adresi", "Adresse de facturation", "Dirección de facturación", "Indirizzo di fatturazione", "Rechnungsadresse"),
      color: "#5b21b6",
      bg: "#ede9fe",
      border: "#c4b5fd",
    },
  };
}

const getEmpty = (locale, purposePreset = null) => {
  const meta = purposePreset ? getPurposeMeta(locale)[purposePreset] : null;
  return {
    name: meta?.defaultName || "",
    type: "warehouse",
    address_line1: "",
    address_line2: "",
    city: "",
    postal_code: "",
    country: defaultCountryName(locale),
    phone: "",
    email: "",
    is_primary: purposePreset === "is_shipping_from",
    is_shipping_from: purposePreset === "is_shipping_from",
    is_returns_to: purposePreset === "is_returns_to",
    is_billing: purposePreset === "is_billing",
  };
};

function formatAddressLines(loc) {
  return [loc.address_line1, loc.address_line2, [loc.postal_code, loc.city].filter(Boolean).join(" "), loc.country].filter(Boolean);
}

function LocationModal({ location, purposePreset, onSave, onClose, locale, ui }) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const [form, setForm] = useState(() => {
    if (location?.id) return { ...getEmpty(locale), ...location };
    return { ...getEmpty(locale, purposePreset) };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const client = getMedusaAdminClient();
  const purposeMeta = getPurposeMeta(locale);
  const purposeRequired = !!(form.is_shipping_from || form.is_returns_to || form.is_billing);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError(t("Name required", "Ad gerekli", "Nom requis", "Nombre requerido", "Nome obbligatorio", "Name erforderlich"));
      return;
    }
    if (purposeRequired) {
      if (!String(form.address_line1 || "").trim()) {
        setError(t("Street is required for warehouse, returns or billing.", "Depo, iade veya fatura için sokak gerekli.", "La rue est requise pour entrepôt, retours ou facturation.", "La calle es obligatoria para almacén, devoluciones o facturación.", "La via è obbligatoria per magazzino, resi o fatturazione.", "Straße ist für Lager, Retoure oder Rechnung erforderlich."));
        return;
      }
      if (!String(form.postal_code || "").trim() || !String(form.city || "").trim()) {
        setError(t("Postal code and city are required for warehouse, returns or billing.", "Depo, iade veya fatura için posta kodu ve şehir gerekli.", "Code postal et ville requis pour entrepôt, retours ou facturation.", "Código postal y ciudad obligatorios para almacén, devoluciones o facturación.", "CAP e città obbligatori per magazzino, resi o fatturazione.", "PLZ und Stadt sind für Lager, Retoure oder Rechnung erforderlich."));
        return;
      }
    }
    setSaving(true); setError(null);
    try {
      if (location?.id) {
        await client.request(`/admin-hub/v1/seller/locations/${location.id}`, {
          method: "PATCH", body: JSON.stringify(form),
        });
      } else {
        await client.request("/admin-hub/v1/seller/locations", {
          method: "POST", body: JSON.stringify(form),
        });
      }
      onSave();
    } catch (e) {
      setError(userError(e, locale, t("Error saving", "Kaydetme hatası", "Erreur d'enregistrement", "Error al guardar", "Errore durante il salvataggio", "Fehler beim Speichern")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        width: "min(560px, 95vw)", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{
          padding: "18px 22px 14px", borderBottom: "1px solid #e5e7eb",
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          borderRadius: "12px 12px 0 0",
        }}>
          <Text variant="headingMd" as="h2" tone="text-inverse">
            {location?.id
              ? t("Edit location", "Konumu düzenle", "Modifier l'emplacement", "Editar ubicación", "Modifica posizione", "Standort bearbeiten")
              : purposePreset
                ? t("Add address", "Adres ekle", "Ajouter une adresse", "Agregar dirección", "Aggiungi indirizzo", "Adresse hinzufügen")
                : t("Add location", "Konum ekle", "Ajouter un emplacement", "Agregar ubicación", "Aggiungi posizione", "Standort hinzufügen")}
          </Text>
        </div>
        <div style={{ padding: "20px 22px" }}>
          <BlockStack gap="300">
            {error && <Banner tone="critical"><p>{error}</p></Banner>}
            <InlineStack gap="300" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label={t("Name *", "Ad *", "Nom *", "Nombre *", "Nome *", "Name *")}
                  value={form.name}
                  onChange={set("name")}
                  placeholder={t("e.g. Main warehouse", "örn. Ana depo", "ex. Entrepôt principal", "p. ej. Almacén principal", "es. Magazzino principale", "z. B. Hauptlager")}
                  autoComplete="off"
                />
              </div>
              <div style={{ minWidth: 160 }}>
                <Select
                  label={t("Type", "Tür", "Type", "Tipo", "Tipo", "Typ")}
                  options={getLocationTypes(locale)}
                  value={form.type}
                  onChange={set("type")}
                />
              </div>
            </InlineStack>
            <TextField
              label={purposeRequired
                ? t("Street *", "Sokak *", "Rue *", "Calle *", "Via *", "Straße *")
                : t("Street", "Sokak", "Rue", "Calle", "Via", "Straße")}
              value={form.address_line1}
              onChange={set("address_line1")}
              autoComplete="street-address"
            />
            <TextField label={t("Address line 2", "Adres satırı 2", "Adresse ligne 2", "Dirección línea 2", "Indirizzo riga 2", "Adresszusatz")} value={form.address_line2} onChange={set("address_line2")} autoComplete="off" />
            <InlineStack gap="200" wrap={false}>
              <div style={{ minWidth: 100 }}>
                <TextField
                  label={purposeRequired
                    ? t("Postal code *", "Posta kodu *", "Code postal *", "Código postal *", "CAP *", "PLZ *")
                    : t("Postal code", "Posta kodu", "Code postal", "Código postal", "CAP", "PLZ")}
                  value={form.postal_code}
                  onChange={set("postal_code")}
                  autoComplete="postal-code"
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  label={purposeRequired
                    ? t("City *", "Şehir *", "Ville *", "Ciudad *", "Città *", "Stadt *")
                    : t("City", "Şehir", "Ville", "Ciudad", "Città", "Stadt")}
                  value={form.city}
                  onChange={set("city")}
                  autoComplete="address-level2"
                />
              </div>
            </InlineStack>
            <TextField label={t("Country", "Ülke", "Pays", "País", "Paese", "Land")} value={form.country} onChange={set("country")} autoComplete="country-name" />
            <InlineStack gap="200" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label={ui.phone} value={form.phone} onChange={set("phone")} autoComplete="off" type="tel" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label={ui.colEmail} value={form.email} onChange={set("email")} autoComplete="off" type="email" />
              </div>
            </InlineStack>
            <Checkbox
              label={t("Set as primary location", "Birincil konum olarak ayarla", "Définir comme emplacement principal", "Establecer como ubicación principal", "Imposta come posizione principale", "Als Primärstandort setzen")}
              checked={!!form.is_primary}
              onChange={set("is_primary")}
            />
            <BlockStack gap="150">
              <Text as="p" variant="bodySm" fontWeight="semibold">
                {t("Used as address for *", "Şu amaçla kullanılan adres *", "Utilisée comme adresse pour *", "Usada como dirección para *", "Usata come indirizzo per *", "Verwendet als Adresse für *")}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {t(
                  "Pick at least one: warehouse, returns or billing. Each purpose belongs to exactly one location.",
                  "En az birini seçin: depo, iade veya fatura. Her amaç yalnızca bir konuma aittir.",
                  "Choisissez au moins un usage : entrepôt, retours ou facturation. Chaque usage n'appartient qu'à un emplacement.",
                  "Elija al menos uno: almacén, devoluciones o facturación. Cada uso pertenece a una sola ubicación.",
                  "Scegli almeno uno: magazzino, resi o fatturazione. Ogni scopo appartiene a una sola posizione.",
                  "Mindestens einen Zweck wählen: Lager, Retoure oder Rechnung. Jeder Zweck gehört genau einem Standort.",
                )}
              </Text>
              {PURPOSE_KEYS.map((key) => (
                <Checkbox
                  key={key}
                  label={purposeMeta[key].title}
                  helpText={purposeMeta[key].hint}
                  checked={!!form[key]}
                  onChange={set(key)}
                />
              ))}
            </BlockStack>
          </BlockStack>
        </div>
        <div style={{ padding: "14px 22px 18px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button onClick={onClose} disabled={saving}>{ui.cancel}</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {location?.id ? ui.save : ui.add}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PurposeSlotCard({ purposeKey, loc, onEdit, onAdd, locale }) {
  const meta = getPurposeMeta(locale)[purposeKey];
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const lines = loc ? formatAddressLines(loc) : [];
  const missing = !loc || !String(loc.address_line1 || "").trim();

  return (
    <div style={{
      border: `1.5px solid ${missing ? "#fca5a5" : meta.border}`,
      borderRadius: 12,
      padding: "16px 18px",
      background: missing ? "#fff7f7" : meta.bg,
      minHeight: 148,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <InlineStack align="space-between" blockAlign="start" gap="200" wrap={false}>
        <BlockStack gap="050">
          <Text as="h3" variant="headingSm" fontWeight="bold">{meta.title}</Text>
          <Text as="p" tone="subdued" variant="bodySm">{meta.hint}</Text>
        </BlockStack>
        <span style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: missing ? "#fee2e2" : "#fff", color: missing ? "#b91c1c" : meta.color, whiteSpace: "nowrap",
        }}>
          {missing
            ? t("Missing", "Eksik", "Manquant", "Falta", "Mancante", "Fehlt")
            : t("Set", "Ayarlı", "Défini", "Definida", "Impostato", "Gesetzt")}
        </span>
      </InlineStack>
      {missing ? (
        <Text as="p" tone="critical" variant="bodySm">
          {t("No address yet — add one so this purpose can be used.", "Henüz adres yok — bu amacın kullanılabilmesi için ekleyin.", "Pas encore d'adresse — ajoutez-en une pour utiliser cet usage.", "Aún no hay dirección: agregue una para usar este propósito.", "Nessun indirizzo ancora — aggiungine uno per usare questo scopo.", "Noch keine Adresse — bitte hinterlegen, damit dieser Zweck nutzbar ist.")}
        </Text>
      ) : (
        <BlockStack gap="0">
          <Text as="p" variant="bodySm" fontWeight="semibold">{loc.name}</Text>
          {lines.map((l, i) => (
            <Text key={i} as="p" tone="subdued" variant="bodySm">{l}</Text>
          ))}
        </BlockStack>
      )}
      <div style={{ marginTop: "auto" }}>
        <Button size="slim" variant={missing ? "primary" : "secondary"} onClick={() => (loc ? onEdit(loc) : onAdd(purposeKey))}>
          {missing
            ? t("Add address", "Adres ekle", "Ajouter une adresse", "Agregar dirección", "Aggiungi indirizzo", "Adresse hinzufügen")
            : t("Edit address", "Adresi düzenle", "Modifier l'adresse", "Editar dirección", "Modifica indirizzo", "Adresse bearbeiten")}
        </Button>
      </div>
    </div>
  );
}

function LocationCard({ loc, onEdit, onDelete, onSetPrimary, locale, ui }) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const typeColor = TYPE_COLORS[loc.type] || "#6b7280";
  const typeLabel = getTypeLabel(loc.type, locale);
  const addressLines = formatAddressLines(loc);
  const purposeMeta = getPurposeMeta(locale);

  return (
    <div style={{
      border: loc.is_primary ? "2px solid #008060" : "1px solid #e5e7eb",
      borderRadius: 10,
      padding: "16px 18px",
      background: loc.is_primary ? "#f0faf6" : "#fff",
      position: "relative",
    }}>
      <InlineStack align="space-between" blockAlign="start" gap="200" wrap={false}>
        <BlockStack gap="100">
          <InlineStack gap="100" blockAlign="center">
            <Text variant="headingSm" as="h3" fontWeight="bold">{loc.name}</Text>
            <span style={{
              display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
              background: `${typeColor}18`, color: typeColor,
            }}>{typeLabel}</span>
            {loc.is_primary && (
              <span style={{
                display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                background: "#d1fae5", color: "#065f46",
              }}>{t("Primary", "Birincil", "Principal", "Principal", "Principale", "Primär")}</span>
            )}
            {PURPOSE_KEYS.filter((k) => loc[k]).map((k) => (
              <span key={k} style={{
                display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                background: purposeMeta[k].bg, color: purposeMeta[k].color,
              }}>{purposeMeta[k].short}</span>
            ))}
            {!loc.is_active && (
              <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#f3f4f6", color: "#9ca3af" }}>{ui.inactive}</span>
            )}
          </InlineStack>
          {addressLines.length > 0 && (
            <BlockStack gap="0">
              {addressLines.map((l, i) => (
                <Text key={i} as="p" tone="subdued" variant="bodySm">{l}</Text>
              ))}
            </BlockStack>
          )}
          {(loc.phone || loc.email) && (
            <InlineStack gap="200">
              {loc.phone && <Text as="span" tone="subdued" variant="bodySm">{loc.phone}</Text>}
              {loc.email && <Text as="span" tone="subdued" variant="bodySm">{loc.email}</Text>}
            </InlineStack>
          )}
        </BlockStack>
        <InlineStack gap="100" blockAlign="start">
          {!loc.is_primary && (
            <Button size="slim" onClick={() => onSetPrimary(loc)}>{t("Set primary", "Birincil yap", "Définir principal", "Establecer principal", "Imposta principale", "Primär setzen")}</Button>
          )}
          <Button size="slim" onClick={() => onEdit(loc)}>{ui.edit}</Button>
          <Button size="slim" tone="critical" onClick={() => onDelete(loc)}>{ui.delete}</Button>
        </InlineStack>
      </InlineStack>
    </div>
  );
}

export default function LocationsSettingsPage() {
  const locale = useLocale();
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const ui = getUI(locale);
  const client = getMedusaAdminClient();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // null | { mode: "add", purposePreset? } | { mode: "edit", location }
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.request("/admin-hub/v1/seller/locations");
      setLocations(res?.locations || []);
    } catch (e) {
      setError(userError(e, locale, t("Error loading", "Yükleme hatası", "Erreur de chargement", "Error de carga", "Errore di caricamento", "Fehler beim Laden")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const findByPurpose = (key) => locations.find((l) => !!l[key]) || null;

  const handleDelete = async (loc) => {
    const confirmMsg = t(
      `Delete location "${loc.name}"?`,
      `"${loc.name}" konumunu sil?`,
      `Supprimer l'emplacement "${loc.name}" ?`,
      `¿Eliminar ubicación "${loc.name}"?`,
      `Eliminare posizione "${loc.name}"?`,
      `Standort "${loc.name}" löschen?`,
    );
    if (!await confirmDelete(confirmMsg)) return;
    try {
      await client.request(`/admin-hub/v1/seller/locations/${loc.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(`${t("Error: ", "Hata: ", "Erreur : ", "Error: ", "Errore: ", "Fehler: ")}${userError(e, locale, t("Unknown", "Bilinmiyor", "Inconnu", "Desconocido", "Sconosciuto", "Unbekannt"))}`);
    }
  };

  const handleSetPrimary = async (loc) => {
    try {
      await client.request(`/admin-hub/v1/seller/locations/${loc.id}`, {
        method: "PATCH", body: JSON.stringify({ is_primary: true }),
      });
      load();
    } catch (e) {
      alert(`${t("Error: ", "Hata: ", "Erreur : ", "Error: ", "Errore: ", "Fehler: ")}${userError(e, locale, t("Unknown", "Bilinmiyor", "Inconnu", "Desconocido", "Sconosciuto", "Unbekannt"))}`);
    }
  };

  return (
    <BlockStack gap="400">
      <Card padding="400">
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text variant="headingMd" as="h2">{t("Locations", "Konumlar", "Emplacements", "Ubicaciones", "Posizioni", "Standorte")}</Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {t(
                  "Enter warehouse, returns and billing addresses here. Each purpose needs a concrete street address.",
                  "Depo, iade ve fatura adreslerini buradan girin. Her amaç için net bir sokak adresi gerekir.",
                  "Saisissez ici les adresses d'entrepôt, de retour et de facturation. Chaque usage nécessite une rue concrète.",
                  "Introduzca aquí las direcciones de almacén, devoluciones y facturación. Cada uso necesita una calle concreta.",
                  "Inserisci qui gli indirizzi di magazzino, resi e fatturazione. Ogni scopo richiede una via concreta.",
                  "Lager-, Retouren- und Rechnungsadressen hier hinterlegen. Jeder Zweck braucht eine konkrete Straße.",
                )}
              </Text>
            </BlockStack>
            <Button variant="primary" onClick={() => setModal({ mode: "add" })}>
              {t("+ Add location", "+ Konum ekle", "+ Ajouter un emplacement", "+ Agregar ubicación", "+ Aggiungi posizione", "+ Standort hinzufügen")}
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>

      {error && (
        <Banner tone="critical" onDismiss={() => setError(null)}><p>{error}</p></Banner>
      )}

      {loading ? (
        <Card padding="400">
          <InlineStack gap="200" blockAlign="center">
            <Spinner size="small" />
            <Text as="p" tone="subdued">{ui.loading}</Text>
          </InlineStack>
        </Card>
      ) : (
        <>
          <Card padding="400">
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                {t("Required addresses", "Zorunlu adresler", "Adresses requises", "Direcciones requeridas", "Indirizzi richiesti", "Erforderliche Adressen")}
              </Text>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
              }}>
                {PURPOSE_KEYS.map((key) => (
                  <PurposeSlotCard
                    key={key}
                    purposeKey={key}
                    loc={findByPurpose(key)}
                    locale={locale}
                    onEdit={(l) => setModal({ mode: "edit", location: l })}
                    onAdd={(purposePreset) => setModal({ mode: "add", purposePreset })}
                  />
                ))}
              </div>
            </BlockStack>
          </Card>

          {locations.length === 0 ? (
            <Card padding="600">
              <BlockStack gap="200" inlineAlign="center">
                <div style={{ fontSize: 40, textAlign: "center" }}>📍</div>
                <Text as="p" tone="subdued" alignment="center">
                  {t("No locations added yet.", "Henüz konum eklenmedi.", "Aucun emplacement ajouté pour l'instant.", "Aún no se han agregado ubicaciones.", "Nessuna posizione aggiunta finora.", "Noch keine Standorte hinterlegt.")}
                </Text>
                <Button variant="primary" onClick={() => setModal({ mode: "add", purposePreset: "is_shipping_from" })}>
                  {t("Add first location", "İlk konumu ekle", "Ajouter le premier emplacement", "Agregar primera ubicación", "Aggiungi prima posizione", "Ersten Standort hinzufügen")}
                </Button>
              </BlockStack>
            </Card>
          ) : (
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                {t("All locations", "Tüm konumlar", "Tous les emplacements", "Todas las ubicaciones", "Tutte le posizioni", "Alle Standorte")}
              </Text>
              {locations.map((loc) => (
                <LocationCard
                  key={loc.id}
                  loc={loc}
                  onEdit={(l) => setModal({ mode: "edit", location: l })}
                  onDelete={handleDelete}
                  onSetPrimary={handleSetPrimary}
                  locale={locale}
                  ui={ui}
                />
              ))}
            </BlockStack>
          )}
        </>
      )}

      {modal && (
        <LocationModal
          key={modal.mode === "edit" ? modal.location?.id : `add-${modal.purposePreset || "any"}`}
          location={modal.mode === "edit" ? modal.location : null}
          purposePreset={modal.mode === "add" ? (modal.purposePreset || null) : null}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
          locale={locale}
          ui={ui}
        />
      )}
    </BlockStack>
  );
}
