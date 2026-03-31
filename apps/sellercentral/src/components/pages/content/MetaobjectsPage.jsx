"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page, Layout, Card, Text, Button, TextField, Badge,
  BlockStack, InlineStack, Box, Divider, Spinner, Banner,
  Modal, Tag, EmptyState,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const client = getMedusaAdminClient();

export default function MetaobjectsPage() {
  const [definitions, setDefinitions] = useState({}); // { key: { label, values[] } }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  // New definition modal
  const [newDefOpen, setNewDefOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newKeyErr, setNewKeyErr] = useState("");

  // Add value modal
  const [addValOpen, setAddValOpen] = useState(false);
  const [addValKey, setAddValKey] = useState("");
  const [addValText, setAddValText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await client.getMetafieldDefinitions();
      setDefinitions(res?.definitions || {});
    } catch (e) {
      setError(e?.message || "Fehler beim Laden");
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
      setError(e?.message || "Speicherfehler");
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
    setSaving(key);
    try {
      await client.deleteMetafieldDefinition(key);
      setDefinitions(prev => { const n = { ...prev }; delete n[key]; return n; });
    } catch (e) {
      setError(e?.message || "Fehler");
    } finally {
      setSaving("");
    }
  };

  // Create new definition
  const handleCreateDef = async () => {
    const k = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!k) { setNewKeyErr("Key ist erforderlich"); return; }
    if (definitions[k]) { setNewKeyErr("Dieser Key existiert bereits"); return; }
    await saveDef(k, newLabel.trim() || k, []);
    setNewDefOpen(false);
    setNewKey(""); setNewLabel(""); setNewKeyErr("");
  };

  // Add a value to existing definition
  const handleAddValue = async () => {
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

  const sortedKeys = Object.keys(definitions).sort();

  return (
    <Page
      title="Metaobjects"
      subtitle="Definiere wiederverwendbare Attribute für deine Produkte"
      primaryAction={{
        content: "Neue Definition",
        onAction: () => { setNewKey(""); setNewLabel(""); setNewKeyErr(""); setNewDefOpen(true); },
      }}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          {loading ? (
            <Card><Box padding="600"><InlineStack align="center"><Spinner /></InlineStack></Box></Card>
          ) : sortedKeys.length === 0 ? (
            <Card>
              <EmptyState
                heading="Noch keine Definitionen"
                action={{ content: "Erste Definition erstellen", onAction: () => setNewDefOpen(true) }}
                image=""
              >
                <p>Erstelle Attribut-Definitionen wie "Farbe" oder "Material" und füge wiederverwendbare Werte hinzu.</p>
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
                          <Badge>{def.values.length} {def.values.length === 1 ? "Wert" : "Werte"}</Badge>
                          <Button size="slim" onClick={() => openAddVal(key)} disabled={isSaving}>+ Wert</Button>
                          <Button size="slim" tone="critical" variant="plain" onClick={() => deleteDef(key)} disabled={isSaving} loading={isSaving}>
                            Löschen
                          </Button>
                        </InlineStack>
                      </InlineStack>

                      {def.values.length > 0 && (
                        <>
                          <Divider />
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {def.values.map(val => (
                              <Tag key={val} onRemove={() => removeValue(key, val)}>{val}</Tag>
                            ))}
                          </div>
                        </>
                      )}

                      {def.values.length === 0 && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          Noch keine Werte. Klicke auf <strong>+ Wert</strong>, um den ersten hinzuzufügen.
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
              <Text as="h2" variant="headingSm">Wie funktioniert das?</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Definiere hier Attribute wie <strong>Farbe</strong>, <strong>Material</strong> oder <strong>Größe</strong> und füge vordefinierte Werte hinzu.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Im Produkt-Editor kannst du diese Werte dann per Dropdown auswählen — schnell und einheitlich.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Werte aus bestehenden Produkten werden automatisch hier angezeigt.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* ── New definition modal ── */}
      <Modal
        open={newDefOpen}
        onClose={() => setNewDefOpen(false)}
        title="Neue Metafeld-Definition"
        primaryAction={{ content: "Erstellen", onAction: handleCreateDef }}
        secondaryActions={[{ content: "Abbrechen", onAction: () => setNewDefOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Key (intern, z.B. farbe)"
              value={newKey}
              onChange={v => { setNewKey(v); setNewKeyErr(""); }}
              helpText="Kleinbuchstaben, Zahlen, Unterstriche. Wird als Metafeld-Key im Produkt gespeichert."
              error={newKeyErr}
              autoComplete="off"
            />
            <TextField
              label="Anzeigename (z.B. Farbe)"
              value={newLabel}
              onChange={setNewLabel}
              placeholder={newKey || "Anzeigename"}
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Add value modal ── */}
      <Modal
        open={addValOpen}
        onClose={() => setAddValOpen(false)}
        title={`Wert hinzufügen — ${definitions[addValKey]?.label || addValKey}`}
        primaryAction={{
          content: "Hinzufügen",
          onAction: handleAddValue,
          disabled: !addValText.trim(),
        }}
        secondaryActions={[{ content: "Abbrechen", onAction: () => setAddValOpen(false) }]}
      >
        <Modal.Section>
          <TextField
            label="Wert"
            value={addValText}
            onChange={setAddValText}
            placeholder={`z.B. ${addValKey === "farbe" ? "Rot" : addValKey === "material" ? "Baumwolle" : "Wert"}`}
            autoComplete="off"
            onKeyDown={e => { if (e.key === "Enter") handleAddValue(); }}
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
