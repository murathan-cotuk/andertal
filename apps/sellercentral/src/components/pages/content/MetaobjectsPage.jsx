"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page, Layout, Card, Text, Button, TextField, Badge,
  BlockStack, InlineStack, Box, Divider, Spinner, Banner,
  Modal, Tag, EmptyState,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useLocale } from "next-intl";
import { getMetaobjectsCopy } from "@/lib/metaobjects-i18n";
import { getUI } from "@/lib/ui-strings";

const client = getMedusaAdminClient();

export default function MetaobjectsPage() {
  const locale = useLocale();
  const ui = getUI(locale);
  const c = getMetaobjectsCopy(locale);
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
      setError(e?.message || c.loadError);
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
      setError(e?.message || c.saveError);
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
    if (!k) { setNewKeyErr(c.keyRequired); return; }
    if (definitions[k]) { setNewKeyErr(c.keyExists); return; }
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
      setError(e?.message || c.approvalFailed);
    } finally {
      setPendingActionId("");
    }
  };
  const editAndApprovePending = async (p) => {
    const current = Array.isArray(p?.proposed_values) ? p.proposed_values.join(", ") : "";
    const raw = window.prompt(c.editPrompt, current);
    if (raw == null) return;
    const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
    if (!values.length) return;
    setPendingActionId(p.id);
    try {
      await client.approveMetafieldProposal(p.id, { values, label: (p.label || p.key || "").trim() });
      await load();
    } catch (e) {
      setError(e?.message || c.editApprovalFailed);
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
      setError(e?.message || c.rejectionFailed);
    } finally {
      setPendingActionId("");
    }
  };

  const sortedKeys = Object.keys(definitions).sort();

  return (
    <Page
      title={c.pageTitle}
      subtitle={c.pageSubtitle}
      primaryAction={
        isSuperuser
          ? {
              content: c.newDefinition,
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
              {c.sellerBanner}
            </Banner>
          </Layout.Section>
        )}

        {isSuperuser && pending.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">
                  {c.pendingHeading}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {c.pendingHelp}
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
                                <> · {c.seller}: <code style={{ fontFamily: "monospace", background: "var(--p-color-bg-surface-secondary)", padding: "1px 5px", borderRadius: 3 }}>{p.seller_id}</code></>
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
                              {c.approve}
                            </Button>
                            <Button size="slim" onClick={() => editAndApprovePending(p)} disabled={pendingActionId === p.id}>
                              {c.editApprove}
                            </Button>
                            <Button size="slim" tone="critical" onClick={() => rejectPending(p.id)} disabled={pendingActionId === p.id}>
                              {c.reject}
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
                heading={c.emptyHeading}
                action={
                  isSuperuser
                    ? { content: c.createFirst, onAction: () => setNewDefOpen(true) }
                    : undefined
                }
                image=""
              >
                <p>
                  {isSuperuser ? c.emptySuperuser : c.emptySeller}
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
                          <Badge>{def.values.length} {def.values.length === 1 ? c.value : c.values}</Badge>
                          {isSuperuser ? (
                            <>
                              <Button size="slim" onClick={() => openAddVal(key)} disabled={isSaving}>+ {c.addValue}</Button>
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
                          {c.noValues}{isSuperuser ? <> {c.clickAddValue}</> : null}
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
                {c.howTitle}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {c.howDefine}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {c.howDropdown}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {c.autoValues}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* ── New definition modal ── */}
      <Modal
        open={newDefOpen}
        onClose={() => setNewDefOpen(false)}
        title={c.modalNewTitle}
        primaryAction={{ content: c.create, onAction: handleCreateDef }}
        secondaryActions={[{ content: c.cancel, onAction: () => setNewDefOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label={c.fieldKey}
              value={newKey}
              onChange={v => { setNewKey(v); setNewKeyErr(""); }}
              helpText={c.fieldKeyHelp}
              error={newKeyErr}
              autoComplete="off"
            />
            <TextField
              label={c.fieldLabel}
              value={newLabel}
              onChange={setNewLabel}
              placeholder={newKey || c.fieldLabel}
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Add value modal ── */}
      <Modal
        open={addValOpen}
        onClose={() => setAddValOpen(false)}
        title={`${c.modalAddValueTitle} — ${definitions[addValKey]?.label || addValKey}`}
        primaryAction={{
          content: c.add,
          onAction: handleAddValue,
          disabled: !addValText.trim(),
        }}
        secondaryActions={[{ content: c.cancel, onAction: () => setAddValOpen(false) }]}
      >
        <Modal.Section>
          <TextField
            label={c.addValue}
            value={addValText}
            onChange={setAddValText}
            placeholder={c.valuePh}
            autoComplete="off"
            onKeyDown={e => { if (e.key === "Enter") handleAddValue(); }}
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
