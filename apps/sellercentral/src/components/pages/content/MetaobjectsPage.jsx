"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Page, Layout, Card, Text, Button, TextField, Badge, Select,
  BlockStack, InlineStack, Box, Divider, Spinner, Banner,
  Modal, Tag, EmptyState,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useLocale } from "next-intl";
import { getMetaobjectsCopy } from "@/lib/metaobjects-i18n";
import { getLandingEditorCopy } from "@/lib/landing-page-editor-i18n";
import { getUI } from "@/lib/ui-strings";

const client = getMedusaAdminClient();

function setI18nField(i18nObj, field, lang, value) {
  return { ...(i18nObj || {}), [lang]: { ...(i18nObj?.[lang] || {}), [field]: value } };
}

function setValueTranslation(valuesI18n, lang, canonical, translated) {
  const nextLang = { ...(valuesI18n?.[lang] || {}) };
  const t = String(translated ?? "").trim();
  if (!t) delete nextLang[canonical];
  else nextLang[canonical] = t;
  const next = { ...(valuesI18n || {}) };
  if (Object.keys(nextLang).length === 0) delete next[lang];
  else next[lang] = nextLang;
  return next;
}

export default function MetaobjectsPage() {
  const locale = useLocale();
  const ui = getUI(locale);
  const c = getMetaobjectsCopy(locale);
  const langOptions = getLandingEditorCopy(locale).shopContentLangOptions();
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [definitions, setDefinitions] = useState({}); // { key: { label, values[], label_i18n, values_i18n } }
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [pendingActionId, setPendingActionId] = useState("");
  const [editLang, setEditLang] = useState("de");
  const saveTimersRef = useRef({});
  const definitionsRef = useRef(definitions);
  definitionsRef.current = definitions;

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
  }, [c.loadError]);

  useEffect(() => { load(); }, [load]);

  const persistDef = async (key, next) => {
    setSaving(key);
    try {
      await client.putMetafieldDefinition(key, next);
    } catch (e) {
      setError(e?.message || c.saveError);
    } finally {
      setSaving("");
    }
  };

  const saveDef = async (key, patch, { debounceMs = 0 } = {}) => {
    const prev = definitionsRef.current[key] || { label: key, values: [], label_i18n: null, values_i18n: null };
    const next = {
      label: patch.label !== undefined ? patch.label : prev.label,
      values: patch.values !== undefined ? patch.values : (prev.values || []),
      label_i18n: patch.label_i18n !== undefined ? patch.label_i18n : (prev.label_i18n || null),
      values_i18n: patch.values_i18n !== undefined ? patch.values_i18n : (prev.values_i18n || null),
    };
    setDefinitions((p) => {
      const merged = { ...p, [key]: next };
      definitionsRef.current = merged;
      return merged;
    });
    if (saveTimersRef.current[key]) clearTimeout(saveTimersRef.current[key]);
    if (debounceMs > 0) {
      saveTimersRef.current[key] = setTimeout(() => {
        const latest = definitionsRef.current[key] || next;
        persistDef(key, latest);
      }, debounceMs);
      return;
    }
    await persistDef(key, next);
  };

  const removeValue = (key, val) => {
    const def = definitions[key];
    if (!def) return;
    const values = (def.values || []).filter((v) => v !== val);
    let values_i18n = def.values_i18n || null;
    if (values_i18n && typeof values_i18n === "object") {
      const cleaned = {};
      for (const [lang, map] of Object.entries(values_i18n)) {
        if (!map || typeof map !== "object") continue;
        const nextMap = { ...map };
        delete nextMap[val];
        if (Object.keys(nextMap).length) cleaned[lang] = nextMap;
      }
      values_i18n = Object.keys(cleaned).length ? cleaned : null;
    }
    saveDef(key, { values, values_i18n });
  };

  const deleteDef = async (key) => {
    if (!isSuperuser) return;
    setSaving(key);
    try {
      await client.deleteMetafieldDefinition(key);
      setDefinitions((prev) => { const n = { ...prev }; delete n[key]; return n; });
    } catch (e) {
      setError(e?.message || ui.error);
    } finally {
      setSaving("");
    }
  };

  const handleCreateDef = async () => {
    const k = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!k) { setNewKeyErr(c.keyRequired); return; }
    if (definitions[k]) { setNewKeyErr(c.keyExists); return; }
    await saveDef(k, { label: newLabel.trim() || k, values: [], label_i18n: null, values_i18n: null });
    setNewDefOpen(false);
    setNewKey(""); setNewLabel(""); setNewKeyErr("");
  };

  const handleAddValue = async () => {
    if (!isSuperuser) return;
    const val = addValText.trim();
    if (!val || !addValKey) return;
    const def = definitions[addValKey];
    if (!def) return;
    if ((def.values || []).includes(val)) { setAddValText(""); return; }
    await saveDef(addValKey, { values: [...(def.values || []), val].sort() });
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
  const isDe = !editLang || editLang === "de";

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

        {isSuperuser && (
          <Layout.Section>
            <Card>
              <Select
                label={c.language}
                options={langOptions}
                value={editLang}
                onChange={setEditLang}
              />
            </Card>
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
              {sortedKeys.map((key) => {
                const def = definitions[key];
                const isSaving = saving === key;
                const displayedLabel = isDe
                  ? (def.label || "")
                  : (def.label_i18n?.[editLang]?.label || "");
                return (
                  <Card key={key}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="start" wrap>
                        <BlockStack gap="200">
                          <Text as="p" variant="bodySm" tone="subdued">
                            key: <code style={{ fontFamily: "monospace", background: "var(--p-color-bg-surface-secondary)", padding: "1px 5px", borderRadius: 3 }}>{key}</code>
                          </Text>
                          {isSuperuser ? (
                            <TextField
                              label={c.fieldLabel}
                              helpText={c.fieldLabelHelp}
                              value={displayedLabel}
                              onChange={(v) => {
                                if (isDe) {
                                  saveDef(key, { label: v }, { debounceMs: 450 });
                                  return;
                                }
                                saveDef(key, { label_i18n: setI18nField(def.label_i18n, "label", editLang, v) }, { debounceMs: 450 });
                              }}
                              placeholder={isDe ? key : (def.label || key)}
                              autoComplete="off"
                              disabled={isSaving}
                            />
                          ) : (
                            <Text as="h2" variant="headingSm">
                              {displayedLabel || def.label || key}
                            </Text>
                          )}
                        </BlockStack>
                        <InlineStack gap="200">
                          <Badge>{(def.values || []).length} {(def.values || []).length === 1 ? c.value : c.values}</Badge>
                          {isSuperuser && isDe ? (
                            <>
                              <Button size="slim" onClick={() => openAddVal(key)} disabled={isSaving}>+ {c.addValue}</Button>
                              <Button size="slim" tone="critical" variant="plain" onClick={() => deleteDef(key)} disabled={isSaving} loading={isSaving}>
                                {ui.delete}
                              </Button>
                            </>
                          ) : null}
                          {isSuperuser && !isDe ? (
                            <Button size="slim" tone="critical" variant="plain" onClick={() => deleteDef(key)} disabled={isSaving} loading={isSaving}>
                              {ui.delete}
                            </Button>
                          ) : null}
                        </InlineStack>
                      </InlineStack>

                      {(def.values || []).length > 0 && (
                        <>
                          <Divider />
                          {isDe ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {def.values.map((val) => (
                                <Tag
                                  key={val}
                                  onRemove={isSuperuser ? () => removeValue(key, val) : undefined}
                                >
                                  {val}
                                </Tag>
                              ))}
                            </div>
                          ) : (
                            <BlockStack gap="300">
                              <Text as="p" variant="bodySm" tone="subdued">{c.translateValuesHint}</Text>
                              {def.values.map((val) => (
                                <InlineStack key={val} gap="300" wrap blockAlign="end">
                                  <div style={{ minWidth: 140, flex: "0 0 auto" }}>
                                    <Text as="p" variant="bodySm" tone="subdued">{c.valueCanonical}</Text>
                                    <Text as="p" variant="bodyMd">{val}</Text>
                                  </div>
                                  {isSuperuser ? (
                                    <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                                      <TextField
                                        label={c.valueTranslation}
                                        labelHidden
                                        value={def.values_i18n?.[editLang]?.[val] || ""}
                                        onChange={(v) => {
                                          saveDef(key, {
                                            values_i18n: setValueTranslation(def.values_i18n, editLang, val, v),
                                          }, { debounceMs: 450 });
                                        }}
                                        placeholder={val}
                                        autoComplete="off"
                                        disabled={isSaving}
                                      />
                                    </div>
                                  ) : (
                                    <Text as="p" variant="bodyMd">
                                      {def.values_i18n?.[editLang]?.[val] || "—"}
                                    </Text>
                                  )}
                                </InlineStack>
                              ))}
                            </BlockStack>
                          )}
                        </>
                      )}

                      {(def.values || []).length === 0 && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {c.noValues}{isSuperuser && isDe ? <> {c.clickAddValue}</> : null}
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
              onChange={(v) => { setNewKey(v); setNewKeyErr(""); }}
              helpText={c.fieldKeyHelp}
              error={newKeyErr}
              autoComplete="off"
            />
            <TextField
              label={c.fieldLabel}
              value={newLabel}
              onChange={setNewLabel}
              placeholder={newKey || c.fieldLabel}
              helpText={c.fieldLabelHelp}
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

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
            onKeyDown={(e) => { if (e.key === "Enter") handleAddValue(); }}
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
