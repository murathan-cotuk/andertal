"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page, Layout, Card, Text, Button, TextField, Badge,
  BlockStack, InlineStack, Box, Divider, Spinner, Banner,
  Modal, Tag, EmptyState,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";

const client = getMedusaAdminClient();

export default function MetaobjectsPage() {
  const locale = useLocale();
  const ui = getUI(locale);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [definitions, setDefinitions] = useState({}); // { key: { label, values[] } }
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [pendingActionId, setPendingActionId] = useState("");

  // New definition modal
  const [newDefOpen, setNewDefOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newKeyErr, setNewKeyErr] = useState("");

  // Add value modal
  const [addValOpen, setAddValOpen] = useState(false);
  const [addValKey, setAddValKey] = useState("");
  const [addValText, setAddValText] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await client.getMetafieldDefinitions();
      setDefinitions(res?.definitions || {});
      const sup = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
      if (sup) {
        try {
          const pr = await client.getMetafieldPendingProposals();
          setPending(Array.isArray(pr?.pending) ? pr.pending : []);
        } catch {
          setPending([]);
        }
      } else {
        setPending([]);
      }
    } catch (e) {
      setError(e?.message || (locale === "de" ? "Fehler beim Laden" : "Error loading data"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Save entire definition for a key
  const saveDef = async (key, label, values) => {
    setSaving(key);
    try {
      await client.putMetafieldDefinition(key, { label, values });
      setDefinitions(prev => ({ ...prev, [key]: { label, values } }));
    } catch (e) {
      setError(e?.message || (locale === "de" ? "Speicherfehler" : "Save error"));
    } finally {
      setSaving("");
    }
  };

  // Remove a single value from a definition
  const removeValue = (key, val) => {
    const def = definitions[key];
    if (!def) return;
    const values = def.values.filter(v => v !== val);
    saveDef(key, def.label, values);
  };

  // Delete entire definition
  const deleteDef = async (key) => {
    if (!isSuperuser) return;
    setSaving(key);
    try {
      await client.deleteMetafieldDefinition(key);
      setDefinitions(prev => { const n = { ...prev }; delete n[key]; return n; });
    } catch (e) {
      setError(e?.message || ui.error);
    } finally {
      setSaving("");
    }
  };

  // Create new definition
  const handleCreateDef = async () => {
    const k = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!k) { setNewKeyErr(locale === "de" ? "Key ist erforderlich" : "Key is required"); return; }
    if (definitions[k]) { setNewKeyErr(locale === "de" ? "Dieser Key existiert bereits" : "This key already exists"); return; }
    await saveDef(k, newLabel.trim() || k, []);
    setNewDefOpen(false);
    setNewKey(""); setNewLabel(""); setNewKeyErr("");
  };

  // Add a value to existing definition
  const handleAddValue = async () => {
    if (!isSuperuser) return;
    const val = addValText.trim();
    if (!val || !addValKey) return;
    const def = definitions[addValKey];
    if (!def) return;
    if (def.values.includes(val)) { setAddValText(""); return; }
    await saveDef(addValKey, def.label, [...def.values, val].sort());
    setAddValText("");
    setAddValOpen(false);
  };

  const openAddVal = (key) => { setAddValKey(key); setAddValText(""); setAddValOpen(true); };

  const approvePending = async (id) => {
    setPendingActionId(id);
    try {
      await client.approveMetafieldProposal(id);
      await load();
    } catch (e) {
      setError(e?.message || (locale === "de" ? "Freigabe fehlgeschlagen" : "Approval failed"));
    } finally {
      setPendingActionId("");
    }
  };
  const editAndApprovePending = async (p) => {
    const current = Array.isArray(p?.proposed_values) ? p.proposed_values.join(", ") : "";
    const raw = window.prompt(locale === "de" ? "Werte bearbeiten (Komma getrennt) und freigeben:" : "Edit values (comma-separated) and approve:", current);
    if (raw == null) return;
    const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
    if (!values.length) return;
    setPendingActionId(p.id);
    try {
      await client.approveMetafieldProposal(p.id, { values, label: (p.label || p.key || "").trim() });
      await load();
    } catch (e) {
      setError(e?.message || (locale === "de" ? "Bearbeiten/Freigabe fehlgeschlagen" : "Edit/approval failed"));
    } finally {
      setPendingActionId("");
    }
  };

  const rejectPending = async (id) => {
    setPendingActionId(id);
    try {
      await client.rejectMetafieldProposal(id);
      await load();
    } catch (e) {
      setError(e?.message || (locale === "de" ? "Ablehnen fehlgeschlagen" : "Rejection failed"));
    } finally {
      setPendingActionId("");
    }
  };

  const sortedKeys = Object.keys(definitions).sort();

  return (
    <Page
      title="Meta objects"
      subtitle={locale === "de" ? "Definiere wiederverwendbare Attribute für deine Produkte" : locale === "tr" ? "Ürünlerin için yeniden kullanılabilir özellikler tanımla" : locale === "fr" ? "Définissez des attributs réutilisables pour vos produits" : locale === "es" ? "Define atributos reutilizables para tus productos" : locale === "it" ? "Definisci attributi riutilizzabili per i tuoi prodotti" : "Define reusable attributes for your products"}
      primaryAction={
        isSuperuser
          ? {
              content: locale === "de" ? "Neue Definition" : locale === "tr" ? "Yeni Tanım" : locale === "fr" ? "Nouvelle définition" : locale === "es" ? "Nueva definición" : locale === "it" ? "Nuova definizione" : "New definition",
              onAction: () => { setNewKey(""); setNewLabel(""); setNewKeyErr(""); setNewDefOpen(true); },
            }
          : undefined
      }
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>
          </Layout.Section>
        )}

        {!isSuperuser && (
          <Layout.Section>
            <Banner tone="info">
              {locale === "de"
                ? "Als Verkäufer kannst du neue Katalog-Metafelder in der Produktbearbeitung vorschlagen. Diese Seite zeigt den gemeinsamen Katalog; Bearbeiten und Freigaben sind für Superuser reserviert."
                : locale === "tr"
                ? "Satıcı olarak ürün düzenleme bölümünden yeni katalog meta alanları önerebilirsin. Bu sayfa ortak kataloğu gösterir; düzenleme ve onaylar süper kullanıcılara ayrılmıştır."
                : locale === "fr"
                ? "En tant que vendeur, vous pouvez proposer de nouveaux champs méta depuis l'édition du produit. Cette page affiche le catalogue commun ; les modifications et approbations sont réservées aux superutilisateurs."
                : locale === "es"
                ? "Como vendedor, puedes proponer nuevos campos meta desde la edición de productos. Esta página muestra el catálogo común; las ediciones y aprobaciones están reservadas para superusuarios."
                : locale === "it"
                ? "Come venditore, puoi proporre nuovi campi meta dalla modifica del prodotto. Questa pagina mostra il catalogo comune; le modifiche e le approvazioni sono riservate ai superutenti."
                : "As a seller, you can propose new catalog meta fields from the product editor. This page shows the shared catalog; editing and approvals are reserved for superusers."}
            </Banner>
          </Layout.Section>
        )}

        {isSuperuser && pending.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">
                  {locale === "de" ? "Ausstehende Freigaben (Verkäufer-Vorschläge)" : locale === "tr" ? "Bekleyen Onaylar (Satıcı Önerileri)" : locale === "fr" ? "Approbations en attente (Propositions vendeur)" : locale === "es" ? "Aprobaciones pendientes (Propuestas del vendedor)" : locale === "it" ? "Approvazioni in sospeso (Proposte del venditore)" : "Pending approvals (Seller proposals)"}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {locale === "de" ? "Nach Genehmigung erscheinen Key und Werte im Katalog und in der Produktauswahl." : locale === "tr" ? "Onaylandıktan sonra anahtar ve değerler katalogda ve ürün seçiminde görünür." : locale === "fr" ? "Après approbation, la clé et les valeurs apparaissent dans le catalogue et la sélection de produits." : locale === "es" ? "Tras la aprobación, la clave y los valores aparecen en el catálogo y en la selección de productos." : locale === "it" ? "Dopo l'approvazione, la chiave e i valori compaiono nel catalogo e nella selezione dei prodotti." : "After approval, the key and values appear in the catalog and product selection."}
                </Text>
                <BlockStack gap="300">
                  {pending.map((p) => (
                    <Box key={p.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="start" wrap>
                          <BlockStack gap="100">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">{p.label || p.key}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              key: <code style={{ fontFamily: "monospace", background: "var(--p-color-bg-surface-secondary)", padding: "1px 5px", borderRadius: 3 }}>{p.key}</code>
                              {p.seller_id ? (
                                <> · {locale === "de" ? "Verkäufer" : locale === "tr" ? "Satıcı" : locale === "fr" ? "Vendeur" : locale === "es" ? "Vendedor" : locale === "it" ? "Venditore" : "Seller"}: <code style={{ fontFamily: "monospace", background: "var(--p-color-bg-surface-secondary)", padding: "1px 5px", borderRadius: 3 }}>{p.seller_id}</code></>
                              ) : null}
                            </Text>
                            <InlineStack gap="150" wrap>
                              {(p.proposed_values || []).map((v) => <Tag key={v}>{v}</Tag>)}
                            </InlineStack>
                          </BlockStack>
                          <InlineStack gap="200">
                            <Button
                              size="slim"
                              variant="primary"
                              loading={pendingActionId === p.id}
                              onClick={() => approvePending(p.id)}
                            >
                              {locale === "de" ? "Genehmigen" : locale === "tr" ? "Onayla" : locale === "fr" ? "Approuver" : locale === "es" ? "Aprobar" : locale === "it" ? "Approva" : "Approve"}
                            </Button>
                            <Button size="slim" onClick={() => editAndApprovePending(p)} disabled={pendingActionId === p.id}>
                              {locale === "de" ? "Bearbeiten + Genehmigen" : locale === "tr" ? "Düzenle + Onayla" : locale === "fr" ? "Modifier + Approuver" : locale === "es" ? "Editar + Aprobar" : locale === "it" ? "Modifica + Approva" : "Edit + Approve"}
                            </Button>
                            <Button size="slim" tone="critical" onClick={() => rejectPending(p.id)} disabled={pendingActionId === p.id}>
                              {locale === "de" ? "Ablehnen" : locale === "tr" ? "Reddet" : locale === "fr" ? "Rejeter" : locale === "es" ? "Rechazar" : locale === "it" ? "Rifiuta" : "Reject"}
                            </Button>
                          </InlineStack>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          {loading ? (
            <Card><Box padding="600"><InlineStack align="center"><Spinner /></InlineStack></Box></Card>
          ) : sortedKeys.length === 0 ? (
            <Card>
              <EmptyState
                heading={locale === "de" ? "Noch keine Definitionen" : locale === "tr" ? "Henüz tanım yok" : locale === "fr" ? "Aucune définition pour l'instant" : locale === "es" ? "Sin definiciones aún" : locale === "it" ? "Nessuna definizione ancora" : "No definitions yet"}
                action={
                  isSuperuser
                    ? { content: locale === "de" ? "Erste Definition erstellen" : locale === "tr" ? "İlk tanımı oluştur" : locale === "fr" ? "Créer la première définition" : locale === "es" ? "Crear primera definición" : locale === "it" ? "Crea la prima definizione" : "Create first definition", onAction: () => setNewDefOpen(true) }
                    : undefined
                }
                image=""
              >
                <p>
                  {isSuperuser
                    ? (locale === "de" ? 'Erstelle Attribut-Definitionen wie "Farbe" oder "Material" und füge wiederverwendbare Werte hinzu.' : locale === "tr" ? '"Renk" veya "Malzeme" gibi özellik tanımları oluştur ve yeniden kullanılabilir değerler ekle.' : locale === "fr" ? 'Créez des définitions d\'attributs comme "Couleur" ou "Matière" et ajoutez des valeurs réutilisables.' : locale === "es" ? 'Crea definiciones de atributos como "Color" o "Material" y añade valores reutilizables.' : locale === "it" ? 'Crea definizioni di attributi come "Colore" o "Materiale" e aggiungi valori riutilizzabili.' : 'Create attribute definitions like "Color" or "Material" and add reusable values.')
                    : (locale === "de" ? "Neue Metafelder legst du in der Produktbearbeitung an (Titel + Wert); ein Superuser gibt sie hier frei." : locale === "tr" ? "Yeni meta alanları ürün düzenleme bölümünden oluşturursun (Başlık + Değer); bir süper kullanıcı burada onaylar." : locale === "fr" ? "Les nouveaux champs méta sont créés dans l'édition du produit (Titre + Valeur) ; un superutilisateur les approuve ici." : locale === "es" ? "Los nuevos campos meta se crean en la edición del producto (Título + Valor); un superusuario los aprueba aquí." : locale === "it" ? "I nuovi campi meta si creano nella modifica del prodotto (Titolo + Valore); un superutente li approva qui." : "New meta fields are created in the product editor (Title + Value); a superuser approves them here.")}
                </p>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="400">
              {sortedKeys.map(key => {
                const def = definitions[key];
                const isSaving = saving === key;
                return (
                  <Card key={key}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="h2" variant="headingSm">{def.label}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">key: <code style={{ fontFamily: "monospace", background: "var(--p-color-bg-surface-secondary)", padding: "1px 5px", borderRadius: 3 }}>{key}</code></Text>
                        </BlockStack>
                        <InlineStack gap="200">
                          <Badge>{def.values.length} {def.values.length === 1 ? (locale === "de" ? "Wert" : locale === "tr" ? "değer" : locale === "fr" ? "valeur" : locale === "es" ? "valor" : locale === "it" ? "valore" : "value") : (locale === "de" ? "Werte" : locale === "tr" ? "değer" : locale === "fr" ? "valeurs" : locale === "es" ? "valores" : locale === "it" ? "valori" : "values")}</Badge>
                          {isSuperuser ? (
                            <>
                              <Button size="slim" onClick={() => openAddVal(key)} disabled={isSaving}>+ {locale === "de" ? "Wert" : locale === "tr" ? "Değer" : locale === "fr" ? "Valeur" : locale === "es" ? "Valor" : locale === "it" ? "Valore" : "Value"}</Button>
                              <Button size="slim" tone="critical" variant="plain" onClick={() => deleteDef(key)} disabled={isSaving} loading={isSaving}>
                                {ui.delete}
                              </Button>
                            </>
                          ) : null}
                        </InlineStack>
                      </InlineStack>

                      {def.values.length > 0 && (
                        <>
                          <Divider />
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {def.values.map(val => (
                              <Tag
                                key={val}
                                onRemove={isSuperuser ? () => removeValue(key, val) : undefined}
                              >
                                {val}
                              </Tag>
                            ))}
                          </div>
                        </>
                      )}

                      {def.values.length === 0 && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {locale === "de" ? "Noch keine Werte." : locale === "tr" ? "Henüz değer yok." : locale === "fr" ? "Aucune valeur pour l'instant." : locale === "es" ? "Sin valores aún." : locale === "it" ? "Nessun valore ancora." : "No values yet."}{isSuperuser ? <> {locale === "de" ? <>Klicke auf <strong>+ Wert</strong>, um den ersten hinzuzufügen.</> : locale === "tr" ? <><strong>+ Değer</strong> butonuna tıkla ve ilkini ekle.</> : locale === "fr" ? <>Cliquez sur <strong>+ Valeur</strong> pour ajouter le premier.</> : locale === "es" ? <>Haz clic en <strong>+ Valor</strong> para añadir el primero.</> : locale === "it" ? <>Fai clic su <strong>+ Valore</strong> per aggiungere il primo.</> : <>Click <strong>+ Value</strong> to add the first one.</>}</> : null}
                        </Text>
                      )}
                    </BlockStack>
                  </Card>
                );
              })}
            </BlockStack>
          )}
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                {locale === "de" ? "Wie funktioniert das?" : locale === "tr" ? "Bu nasıl çalışır?" : locale === "fr" ? "Comment ça fonctionne ?" : locale === "es" ? "¿Cómo funciona?" : locale === "it" ? "Come funziona?" : "How does this work?"}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {locale === "de" ? <span>Definiere hier Attribute wie <strong>Farbe</strong>, <strong>Material</strong> oder <strong>Größe</strong> und füge vordefinierte Werte hinzu.</span> : locale === "tr" ? <span><strong>Renk</strong>, <strong>Malzeme</strong> veya <strong>Beden</strong> gibi özellikler tanımla ve önceden tanımlı değerler ekle.</span> : locale === "fr" ? <span>Définissez des attributs comme <strong>Couleur</strong>, <strong>Matière</strong> ou <strong>Taille</strong> et ajoutez des valeurs prédéfinies.</span> : locale === "es" ? <span>Define atributos como <strong>Color</strong>, <strong>Material</strong> o <strong>Talla</strong> y añade valores predefinidos.</span> : locale === "it" ? <span>Definisci attributi come <strong>Colore</strong>, <strong>Materiale</strong> o <strong>Taglia</strong> e aggiungi valori predefiniti.</span> : <span>Define attributes like <strong>Color</strong>, <strong>Material</strong> or <strong>Size</strong> and add predefined values.</span>}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {locale === "de" ? "Im Produkt-Editor kannst du diese Werte dann per Dropdown auswählen — schnell und einheitlich." : locale === "tr" ? "Ürün düzenleyicide bu değerleri açılır listeden seçebilirsin — hızlı ve tutarlı." : locale === "fr" ? "Dans l'éditeur de produits, vous pouvez sélectionner ces valeurs via un menu déroulant — rapidement et de manière cohérente." : locale === "es" ? "En el editor de productos, puedes seleccionar estos valores mediante un desplegable — rápido y uniforme." : locale === "it" ? "Nell'editor prodotto, puoi selezionare questi valori tramite un menu a discesa — veloce e uniforme." : "In the product editor, you can select these values via a dropdown — quickly and consistently."}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {locale === "de" ? "Werte aus bestehenden Produkten werden automatisch hier angezeigt." : locale === "tr" ? "Mevcut ürünlerden gelen değerler otomatik olarak burada gösterilir." : locale === "fr" ? "Les valeurs issues des produits existants sont automatiquement affichées ici." : locale === "es" ? "Los valores de los productos existentes se muestran automáticamente aquí." : locale === "it" ? "I valori dei prodotti esistenti vengono visualizzati automaticamente qui." : "Values from existing products are automatically displayed here."}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* ── New definition modal ── */}
      <Modal
        open={newDefOpen}
        onClose={() => setNewDefOpen(false)}
        title={locale === "de" ? "Neue Metafeld-Definition" : locale === "tr" ? "Yeni Meta Alan Tanımı" : locale === "fr" ? "Nouvelle définition de champ méta" : locale === "es" ? "Nueva definición de campo meta" : locale === "it" ? "Nuova definizione campo meta" : "New meta field definition"}
        primaryAction={{ content: ui.create, onAction: handleCreateDef }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setNewDefOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label={locale === "de" ? "Key (intern, z.B. farbe)" : locale === "tr" ? "Anahtar (dahili, örn. renk)" : locale === "fr" ? "Clé (interne, ex. couleur)" : locale === "es" ? "Clave (interna, ej. color)" : locale === "it" ? "Chiave (interna, es. colore)" : "Key (internal, e.g. color)"}
              value={newKey}
              onChange={v => { setNewKey(v); setNewKeyErr(""); }}
              helpText={locale === "de" ? "Kleinbuchstaben, Zahlen, Unterstriche. Wird als Metafeld-Key im Produkt gespeichert." : locale === "tr" ? "Küçük harfler, rakamlar, alt çizgiler. Üründe meta alan anahtarı olarak kaydedilir." : locale === "fr" ? "Minuscules, chiffres, underscores. Enregistré comme clé de champ méta dans le produit." : locale === "es" ? "Minúsculas, números, guiones bajos. Se guarda como clave de campo meta en el producto." : locale === "it" ? "Minuscole, numeri, trattini bassi. Salvato come chiave del campo meta nel prodotto." : "Lowercase letters, numbers, underscores. Saved as the meta field key in the product."}
              error={newKeyErr}
              autoComplete="off"
            />
            <TextField
              label={locale === "de" ? "Anzeigename (z.B. Farbe)" : locale === "tr" ? "Görünen ad (örn. Renk)" : locale === "fr" ? "Nom d'affichage (ex. Couleur)" : locale === "es" ? "Nombre visible (ej. Color)" : locale === "it" ? "Nome visualizzato (es. Colore)" : "Display name (e.g. Color)"}
              value={newLabel}
              onChange={setNewLabel}
              placeholder={newKey || (locale === "de" ? "Anzeigename" : locale === "tr" ? "Görünen ad" : locale === "fr" ? "Nom d'affichage" : locale === "es" ? "Nombre visible" : locale === "it" ? "Nome visualizzato" : "Display name")}
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Add value modal ── */}
      <Modal
        open={addValOpen}
        onClose={() => setAddValOpen(false)}
        title={`${locale === "de" ? "Wert hinzufügen" : locale === "tr" ? "Değer ekle" : locale === "fr" ? "Ajouter une valeur" : locale === "es" ? "Añadir valor" : locale === "it" ? "Aggiungi valore" : "Add value"} — ${definitions[addValKey]?.label || addValKey}`}
        primaryAction={{
          content: ui.add,
          onAction: handleAddValue,
          disabled: !addValText.trim(),
        }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setAddValOpen(false) }]}
      >
        <Modal.Section>
          <TextField
            label={locale === "de" ? "Wert" : locale === "tr" ? "Değer" : locale === "fr" ? "Valeur" : locale === "es" ? "Valor" : locale === "it" ? "Valore" : "Value"}
            value={addValText}
            onChange={setAddValText}
            placeholder={locale === "de" ? `z.B. ${addValKey === "farbe" ? "Rot" : addValKey === "material" ? "Baumwolle" : "Wert"}` : locale === "tr" ? `örn. ${addValKey === "farbe" ? "Kırmızı" : addValKey === "material" ? "Pamuk" : "Değer"}` : locale === "fr" ? `ex. ${addValKey === "farbe" ? "Rouge" : addValKey === "material" ? "Coton" : "Valeur"}` : locale === "es" ? `ej. ${addValKey === "farbe" ? "Rojo" : addValKey === "material" ? "Algodón" : "Valor"}` : locale === "it" ? `es. ${addValKey === "farbe" ? "Rosso" : addValKey === "material" ? "Cotone" : "Valore"}` : `e.g. ${addValKey === "farbe" ? "Red" : addValKey === "material" ? "Cotton" : "Value"}`}
            autoComplete="off"
            onKeyDown={e => { if (e.key === "Enter") handleAddValue(); }}
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
