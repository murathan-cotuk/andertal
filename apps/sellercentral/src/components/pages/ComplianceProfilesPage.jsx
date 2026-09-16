"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Page, Card, BlockStack, InlineStack, Text, Badge, Banner, Select, Button, Box, Spinner, TextField } from "@shopify/polaris";
import CategoryDrilldownSelect from "@/components/inputs/CategoryDrilldownSelect";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

// Per-category compliance profile override (follow-up to docs/HUKUKI.md's automatic keyword-based
// assignment, which isn't always right — e.g. a subcategory like "washing machines" may need a
// different profile than its parent "electronics"). Inheritance from the nearest ancestor stays
// the default; this page only lets a superuser correct the exception cases. It also lets a
// superuser add ad-hoc manual required fields directly on a category, for gaps the static profile
// catalog doesn't cover — those are NOT inherited by children, each category gets its own set.
function localizedLabel(i18n, locale, fallback) {
  if (i18n && typeof i18n === "object") {
    if (locale && i18n[locale]) return i18n[locale];
    if (i18n.de) return i18n.de;
  }
  return fallback;
}

const INHERIT_VALUE = "__inherit__";
const CUSTOM_FIELD_TYPES = ["text", "number", "select", "file"];

const copy = (locale) => {
  const t = (en, tr, de) => (locale === "en" ? en : locale === "tr" ? tr : de);
  return {
    title: t("Compliance profiles", "Uyumluluk profilleri", "Compliance-Profile"),
    subtitle: t(
      "Every category was auto-assigned a compliance profile (docs/HUKUKI.md). That assignment isn't always right — pick a category below to override it, or add your own manual required fields.",
      "Her kategoriye otomatik olarak bir uyumluluk profili atandı. Bu atama her zaman doğru değildir — geçersiz kılmak veya kendi manuel zorunlu alanlarınızı eklemek için aşağıdan bir kategori seçin.",
      "Jeder Kategorie wurde automatisch ein Compliance-Profil zugewiesen. Diese Zuordnung ist nicht immer korrekt — wählen Sie unten eine Kategorie, um sie zu überschreiben oder eigene Pflichtfelder hinzuzufügen.",
    ),
    pickCategory: t("Category", "Kategori", "Kategorie"),
    pickPlaceholder: t("Search or browse a category…", "Bir kategori arayın veya gezinin…", "Kategorie suchen oder durchsuchen…"),
    currentProfile: t("Effective profile", "Geçerli profil", "Wirksames Profil"),
    ownOverride: t("This category's own setting", "Bu kategorinin kendi ayarı", "Eigene Einstellung dieser Kategorie"),
    inheritOption: t("— Inherit from parent category —", "— Üst kategoriden miras al —", "— Von übergeordneter Kategorie erben —"),
    inheritedBadge: t("Inherited", "Miras alınıyor", "Geerbt"),
    ownBadge: t("Own setting", "Kendi ayarı", "Eigene Einstellung"),
    save: t("Save", "Kaydet", "Speichern"),
    saved: t("Saved.", "Kaydedildi.", "Gespeichert."),
    saveError: t("Could not save.", "Kaydedilemedi.", "Konnte nicht gespeichert werden."),
    loadError: t("Could not load categories.", "Kategoriler yüklenemedi.", "Kategorien konnten nicht geladen werden."),
    selectFirst: t("Select a category above to see and change its compliance profile.", "Uyumluluk profilini görmek ve değiştirmek için yukarıdan bir kategori seçin.", "Wählen Sie oben eine Kategorie, um deren Compliance-Profil zu sehen und zu ändern."),
    requiredFields: t("Required fields from the profile", "Profilden gelen zorunlu alanlar", "Pflichtfelder aus dem Profil"),
    noProfileFields: t("No profile fields for this category.", "Bu kategori için profil alanı yok.", "Keine Profilfelder für diese Kategorie."),
    customFieldsTitle: t("Manual required fields for this category", "Bu kategori için manuel zorunlu alanlar", "Manuelle Pflichtfelder für diese Kategorie"),
    customFieldsHint: t(
      "These apply only to this exact category (not inherited by subcategories). They appear as required fields in the product's Legal tab.",
      "Bunlar yalnızca bu kategori için geçerlidir (alt kategorilere miras alınmaz). Ürünün Yasal sekmesinde zorunlu alan olarak görünür.",
      "Diese gelten nur für genau diese Kategorie (werden nicht an Unterkategorien vererbt). Sie erscheinen im Rechtlich-Tab des Produkts als Pflichtfeld.",
    ),
    noCustomFields: t("No manual fields added yet.", "Henüz manuel alan eklenmedi.", "Noch keine manuellen Felder hinzugefügt."),
    fieldLabel: t("Field label", "Alan adı", "Feldbezeichnung"),
    fieldLabelPlaceholder: t("e.g. Certificate number", "örn. Sertifika numarası", "z. B. Zertifikatsnummer"),
    fieldType: t("Field type", "Alan tipi", "Feldtyp"),
    fieldOptions: t("Options (comma-separated)", "Seçenekler (virgülle ayrılmış)", "Optionen (kommagetrennt)"),
    addField: t("Add field", "Alan ekle", "Feld hinzufügen"),
    removeField: t("Remove", "Kaldır", "Entfernen"),
    typeText: t("Text", "Metin", "Text"),
    typeNumber: t("Number", "Sayı", "Zahl"),
    typeSelect: t("Dropdown", "Açılır liste", "Auswahlliste"),
    typeFile: t("File / URL", "Dosya / URL", "Datei / URL"),
    customSaveError: t("Could not save the field.", "Alan kaydedilemedi.", "Feld konnte nicht gespeichert werden."),
    profileFieldsHint: t(
      "Fields the profile normally requires for this category. Edit any of them (just for this category) or turn one off if it doesn't actually apply here — nothing here is locked.",
      "Bu kategori için profilin normalde zorunlu tuttuğu alanlar. Herhangi birini (yalnızca bu kategori için) düzenleyin veya burada gerçekten geçerli değilse kapatın — hiçbiri sabit değildir.",
      "Felder, die das Profil für diese Kategorie normalerweise verlangt. Bearbeiten Sie eines davon (nur für diese Kategorie) oder schalten Sie es aus, wenn es hier eigentlich nicht zutrifft — nichts davon ist fest vorgegeben.",
    ),
    requiredBadge: t("Required", "Zorunlu", "Pflicht"),
    optionalBadge: t("Optional", "İsteğe bağlı", "Optional"),
    editedBadge: t("Edited for this category", "Bu kategori için düzenlendi", "Für diese Kategorie angepasst"),
    disabledBadge: t("Disabled for this category", "Bu kategori için kapalı", "Für diese Kategorie deaktiviert"),
    editField: t("Edit", "Düzenle", "Bearbeiten"),
    disableField: t("Disable for this category", "Bu kategori için kapat", "Für diese Kategorie deaktivieren"),
    enableField: t("Enable", "Aç", "Aktivieren"),
    resetField: t("Reset to profile default", "Profil varsayılanına dön", "Auf Profil-Standard zurücksetzen"),
    cancelEdit: t("Cancel", "İptal", "Abbrechen"),
    saveEdit: t("Save changes", "Değişiklikleri kaydet", "Änderungen speichern"),
  };
};

export default function ComplianceProfilesPage() {
  const locale = useLocale();
  const router = useRouter();
  const c = copy(locale);
  const [isSuperuser, setIsSuperuser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [schema, setSchema] = useState(null); // resolved compliance-schema for categoryId
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(INHERIT_VALUE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Manual required-fields editor for the selected category (own only, not inherited).
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [customSaving, setCustomSaving] = useState(false);

  // Inline editor for a PROFILE field (edit label/type/options as a per-category override, or
  // disable it outright) — keyed by the field's real key (e.g. "weee_number"), null = closed.
  const [editingKey, setEditingKey] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState("text");
  const [editOptions, setEditOptions] = useState("");
  const [fieldSaving, setFieldSaving] = useState(null); // key currently being saved/toggled, or null

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
    if (!su) { router.replace("/"); return; }
    const client = getMedusaAdminClient();
    Promise.all([client.getAdminHubCategories(), client.getComplianceProfiles()])
      .then(([catRes, profRes]) => {
        setCategories(catRes.categories || []);
        setProfiles(profRes.profiles || []);
      })
      .catch(() => setLoadError(c.loadError));
  }, []);

  const loadSchema = (id) => {
    setSchemaLoading(true);
    setMessage({ type: "", text: "" });
    return getMedusaAdminClient().getCategoryComplianceSchema(id)
      .then((data) => {
        setSchema(data);
        setSelectedProfile(data?.own_profile_id || INHERIT_VALUE);
        return data;
      })
      .catch(() => setSchema(null))
      .finally(() => setSchemaLoading(false));
  };

  useEffect(() => {
    if (!categoryId) { setSchema(null); return; }
    loadSchema(categoryId);
  }, [categoryId]);

  const profileOptions = useMemo(() => [
    { label: c.inheritOption, value: INHERIT_VALUE },
    ...profiles.map((p) => ({ label: localizedLabel(p.label_i18n, locale, p.label), value: p.id })),
  ], [profiles, locale, c.inheritOption]);

  // Own custom/override fields keyed by field key for quick lookup while rendering profile rows.
  const ownFieldsByKey = useMemo(() => {
    const m = new Map();
    for (const f of schema?.own_custom_fields || []) m.set(f.key, f);
    return m;
  }, [schema]);
  const ownDisabledSet = useMemo(() => new Set(schema?.own_disabled_fields || []), [schema]);

  // Every field the PROFILE itself defines for this category (required + optional), regardless
  // of whether a superuser has since edited or disabled it — this is the full editable list
  // ComplianceProfilesPage shows, separate from schema.required_fields/optional_fields (which
  // have already had disabled ones filtered out for the actual product-editor rendering).
  const profileFieldRows = useMemo(() => {
    if (!schema) return [];
    const required = schema.profile_required_fields || [];
    const optional = schema.profile_optional_fields || [];
    const defs = schema.profile_field_definitions || {};
    return [...required.map((key) => ({ key, isRequired: true })), ...optional.map((key) => ({ key, isRequired: false }))]
      .map(({ key, isRequired }) => {
        const own = ownFieldsByKey.get(key);
        const baseDef = defs[key] || {};
        return {
          key,
          isRequired,
          isOverridden: !!own?.override,
          isDisabled: ownDisabledSet.has(key),
          label: own?.override ? own.label : (localizedLabel(baseDef.label_i18n, locale, key)),
          type: own?.override ? own.type : (baseDef.type || "text"),
          options: own?.override ? (own.options || []) : (baseDef.options || []),
        };
      });
  }, [schema, ownFieldsByKey, ownDisabledSet, locale]);

  const startEditField = (row) => {
    setEditingKey(row.key);
    setEditLabel(row.label);
    setEditType(row.type === "select" ? "select" : row.type);
    setEditOptions((row.options || []).join(", "));
    setMessage({ type: "", text: "" });
  };
  const cancelEditField = () => setEditingKey(null);

  /**
   * Saves the in-progress edit for `key`. `markOverride: true` is for a PROFILE field being
   * edited for the first time (stamps override:true so it's recognized as a per-category
   * override of that real field, not a brand-new one); editing an already-own field (an
   * existing override, or a plain custom field) preserves whatever it already was.
   */
  const saveFieldEdit = async (key, { markOverride = false } = {}) => {
    const label = editLabel.trim();
    if (!label || !categoryId) return;
    setFieldSaving(key);
    setMessage({ type: "", text: "" });
    try {
      const existingEntry = (schema?.own_custom_fields || []).find((f) => f.key === key);
      const existing = (schema?.own_custom_fields || []).filter((f) => f.key !== key);
      const next = [
        ...existing,
        {
          key,
          ...(markOverride || existingEntry?.override ? { override: true } : {}),
          label,
          type: editType,
          ...(editType === "select"
            ? { options: editOptions.split(",").map((o) => o.trim()).filter(Boolean) }
            : {}),
        },
      ];
      await getMedusaAdminClient().setCategoryComplianceCustomFields(categoryId, next);
      await loadSchema(categoryId);
      setEditingKey(null);
    } catch (e) {
      setMessage({ type: "error", text: e?.message || c.customSaveError });
    }
    setFieldSaving(null);
  };

  const resetFieldOverride = async (key) => {
    if (!categoryId) return;
    setFieldSaving(key);
    setMessage({ type: "", text: "" });
    try {
      const next = (schema?.own_custom_fields || []).filter((f) => f.key !== key);
      await getMedusaAdminClient().setCategoryComplianceCustomFields(categoryId, next);
      await loadSchema(categoryId);
    } catch (e) {
      setMessage({ type: "error", text: e?.message || c.customSaveError });
    }
    setFieldSaving(null);
  };

  const toggleFieldDisabled = async (key) => {
    if (!categoryId) return;
    setFieldSaving(key);
    setMessage({ type: "", text: "" });
    try {
      const current = schema?.own_disabled_fields || [];
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      await getMedusaAdminClient().setCategoryComplianceCustomFields(categoryId, schema?.own_custom_fields || [], next);
      await loadSchema(categoryId);
    } catch (e) {
      setMessage({ type: "error", text: e?.message || c.customSaveError });
    }
    setFieldSaving(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const nextProfileId = selectedProfile === INHERIT_VALUE ? null : selectedProfile;
      await getMedusaAdminClient().setCategoryComplianceProfile(categoryId, nextProfileId);
      await loadSchema(categoryId);
      setMessage({ type: "success", text: c.saved });
    } catch (e) {
      setMessage({ type: "error", text: e?.message || c.saveError });
    }
    setSaving(false);
  };

  const handleAddCustomField = async () => {
    const label = newFieldLabel.trim();
    if (!label || !categoryId) return;
    setCustomSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const existing = schema?.own_custom_fields || [];
      const next = [
        ...existing,
        {
          label,
          type: newFieldType,
          ...(newFieldType === "select"
            ? { options: newFieldOptions.split(",").map((o) => o.trim()).filter(Boolean) }
            : {}),
        },
      ];
      await getMedusaAdminClient().setCategoryComplianceCustomFields(categoryId, next);
      await loadSchema(categoryId);
      setNewFieldLabel("");
      setNewFieldType("text");
      setNewFieldOptions("");
    } catch (e) {
      setMessage({ type: "error", text: e?.message || c.customSaveError });
    }
    setCustomSaving(false);
  };

  const handleRemoveCustomField = async (key) => {
    if (!categoryId) return;
    setCustomSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const next = (schema?.own_custom_fields || []).filter((f) => f.key !== key);
      await getMedusaAdminClient().setCategoryComplianceCustomFields(categoryId, next);
      await loadSchema(categoryId);
    } catch (e) {
      setMessage({ type: "error", text: e?.message || c.customSaveError });
    }
    setCustomSaving(false);
  };

  const typeLabel = (type) => (
    type === "number" ? c.typeNumber : type === "select" ? c.typeSelect : type === "file" ? c.typeFile : c.typeText
  );

  if (!isSuperuser) return null;

  return (
    <Page title={c.title}>
      <BlockStack gap="400">
        <Text as="p" tone="subdued">{c.subtitle}</Text>
        {loadError && <Banner tone="critical">{loadError}</Banner>}

        <Card>
          <BlockStack gap="300">
            <CategoryDrilldownSelect
              label={c.pickCategory}
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              placeholder={c.pickPlaceholder}
            />
          </BlockStack>
        </Card>

        {!categoryId ? (
          <Box padding="600">
            <Text as="p" tone="subdued" alignment="center">{c.selectFirst}</Text>
          </Box>
        ) : schemaLoading ? (
          <Box padding="600"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>
        ) : schema ? (
          <>
            <Card>
              <BlockStack gap="400">
                {message.text && (
                  <Banner tone={message.type === "success" ? "success" : "critical"} onDismiss={() => setMessage({ type: "", text: "" })}>
                    {message.text}
                  </Banner>
                )}
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingSm">{c.currentProfile}</Text>
                  <Badge tone={schema.own_profile_id ? "success" : "info"}>
                    {schema.own_profile_id ? c.ownBadge : c.inheritedBadge}
                  </Badge>
                </InlineStack>
                <Select
                  label={c.ownOverride}
                  options={profileOptions}
                  value={selectedProfile}
                  onChange={setSelectedProfile}
                />
                <InlineStack>
                  <Button variant="primary" onClick={handleSave} loading={saving}>{c.save}</Button>
                </InlineStack>
                <BlockStack gap="200">
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">{c.requiredFields}</Text>
                    <Text as="p" tone="subdued" variant="bodySm">{c.profileFieldsHint}</Text>
                  </BlockStack>
                  {profileFieldRows.length === 0 ? (
                    <Text as="p" tone="subdued" variant="bodySm">{c.noProfileFields}</Text>
                  ) : (
                    <BlockStack gap="200">
                      {profileFieldRows.map((row) => (
                        <Box
                          key={row.key}
                          padding="200"
                          background="bg-surface-secondary"
                          borderRadius="200"
                        >
                          <BlockStack gap="150">
                            <InlineStack align="space-between" blockAlign="center" wrap>
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="span" fontWeight="medium" tone={row.isDisabled ? "subdued" : undefined}>
                                  {row.label}
                                </Text>
                                <Badge tone={row.isRequired ? "critical" : undefined}>
                                  {row.isRequired ? c.requiredBadge : c.optionalBadge}
                                </Badge>
                                {row.isOverridden && <Badge tone="attention">{c.editedBadge}</Badge>}
                                {row.isDisabled && <Badge>{c.disabledBadge}</Badge>}
                              </InlineStack>
                              {editingKey !== row.key && (
                                <InlineStack gap="150">
                                  <Button size="slim" onClick={() => startEditField(row)} disabled={row.isDisabled}>
                                    {c.editField}
                                  </Button>
                                  {row.isOverridden && (
                                    <Button
                                      size="slim"
                                      variant="tertiary"
                                      onClick={() => resetFieldOverride(row.key)}
                                      loading={fieldSaving === row.key}
                                    >
                                      {c.resetField}
                                    </Button>
                                  )}
                                  <Button
                                    size="slim"
                                    tone={row.isDisabled ? undefined : "critical"}
                                    variant="tertiary"
                                    onClick={() => toggleFieldDisabled(row.key)}
                                    loading={fieldSaving === row.key}
                                  >
                                    {row.isDisabled ? c.enableField : c.disableField}
                                  </Button>
                                </InlineStack>
                              )}
                            </InlineStack>

                            {editingKey === row.key && (
                              <InlineStack gap="200" wrap blockAlign="end">
                                <div style={{ minWidth: 200, flex: 1 }}>
                                  <TextField
                                    label={c.fieldLabel}
                                    value={editLabel}
                                    onChange={setEditLabel}
                                    autoComplete="off"
                                  />
                                </div>
                                <div style={{ minWidth: 150 }}>
                                  <Select
                                    label={c.fieldType}
                                    options={CUSTOM_FIELD_TYPES.map((t) => ({ label: typeLabel(t), value: t }))}
                                    value={editType}
                                    onChange={setEditType}
                                  />
                                </div>
                                {editType === "select" && (
                                  <div style={{ minWidth: 200, flex: 1 }}>
                                    <TextField
                                      label={c.fieldOptions}
                                      value={editOptions}
                                      onChange={setEditOptions}
                                      placeholder="A, B, C"
                                      autoComplete="off"
                                    />
                                  </div>
                                )}
                                <Button
                                  variant="primary"
                                  onClick={() => saveFieldEdit(row.key, { markOverride: true })}
                                  loading={fieldSaving === row.key}
                                  disabled={!editLabel.trim()}
                                >
                                  {c.saveEdit}
                                </Button>
                                <Button onClick={cancelEditField}>{c.cancelEdit}</Button>
                              </InlineStack>
                            )}
                          </BlockStack>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">{c.customFieldsTitle}</Text>
                  <Text as="p" tone="subdued" variant="bodySm">{c.customFieldsHint}</Text>
                </BlockStack>

                {(schema.own_custom_fields || []).filter((f) => !f.override).length === 0 ? (
                  <Text as="p" tone="subdued" variant="bodySm">{c.noCustomFields}</Text>
                ) : (
                  <BlockStack gap="200">
                    {schema.own_custom_fields.filter((f) => !f.override).map((f) => (
                      <BlockStack key={f.key} gap="150">
                        <InlineStack align="space-between" blockAlign="center" wrap>
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="span" fontWeight="medium">{f.label}</Text>
                            <Badge tone="attention">{typeLabel(f.type)}</Badge>
                            {f.type === "select" && f.options?.length ? (
                              <Text as="span" tone="subdued" variant="bodySm">{f.options.join(", ")}</Text>
                            ) : null}
                          </InlineStack>
                          {editingKey !== f.key && (
                            <InlineStack gap="150">
                              <Button
                                size="slim"
                                onClick={() => startEditField(f)}
                              >
                                {c.editField}
                              </Button>
                              <Button
                                size="slim"
                                tone="critical"
                                variant="tertiary"
                                onClick={() => handleRemoveCustomField(f.key)}
                                loading={customSaving}
                              >
                                {c.removeField}
                              </Button>
                            </InlineStack>
                          )}
                        </InlineStack>

                        {editingKey === f.key && (
                          <InlineStack gap="200" wrap blockAlign="end">
                            <div style={{ minWidth: 200, flex: 1 }}>
                              <TextField
                                label={c.fieldLabel}
                                value={editLabel}
                                onChange={setEditLabel}
                                autoComplete="off"
                              />
                            </div>
                            <div style={{ minWidth: 150 }}>
                              <Select
                                label={c.fieldType}
                                options={CUSTOM_FIELD_TYPES.map((t) => ({ label: typeLabel(t), value: t }))}
                                value={editType}
                                onChange={setEditType}
                              />
                            </div>
                            {editType === "select" && (
                              <div style={{ minWidth: 200, flex: 1 }}>
                                <TextField
                                  label={c.fieldOptions}
                                  value={editOptions}
                                  onChange={setEditOptions}
                                  placeholder="A, B, C"
                                  autoComplete="off"
                                />
                              </div>
                            )}
                            <Button
                              variant="primary"
                              onClick={() => saveFieldEdit(f.key)}
                              loading={fieldSaving === f.key}
                              disabled={!editLabel.trim()}
                            >
                              {c.saveEdit}
                            </Button>
                            <Button onClick={cancelEditField}>{c.cancelEdit}</Button>
                          </InlineStack>
                        )}
                      </BlockStack>
                    ))}
                  </BlockStack>
                )}

                <InlineStack gap="200" wrap blockAlign="end">
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <TextField
                      label={c.fieldLabel}
                      value={newFieldLabel}
                      onChange={setNewFieldLabel}
                      placeholder={c.fieldLabelPlaceholder}
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ minWidth: 160 }}>
                    <Select
                      label={c.fieldType}
                      options={CUSTOM_FIELD_TYPES.map((t) => ({ label: typeLabel(t), value: t }))}
                      value={newFieldType}
                      onChange={setNewFieldType}
                    />
                  </div>
                  {newFieldType === "select" && (
                    <div style={{ minWidth: 220, flex: 1 }}>
                      <TextField
                        label={c.fieldOptions}
                        value={newFieldOptions}
                        onChange={setNewFieldOptions}
                        placeholder="A, B, C"
                        autoComplete="off"
                      />
                    </div>
                  )}
                  <Button onClick={handleAddCustomField} loading={customSaving} disabled={!newFieldLabel.trim()}>
                    {c.addField}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </>
        ) : null}
      </BlockStack>
    </Page>
  );
}
