"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import {
  Page, Layout, Card, Button, Text, BlockStack, InlineStack,
  Box, Banner, Divider, Badge, ProgressBar, Checkbox, Spinner,
} from "@shopify/polaris";
import { ImportIcon, ExportIcon, NoteIcon } from "@shopify/polaris-icons";

function flattenCategoryTree(nodes, parentPath = "") {
  const out = [];
  for (const node of nodes || []) {
    const slug = (node.slug || "").trim();
    const name = (node.name || slug || "").trim();
    const path = parentPath ? `${parentPath} › ${name}` : name;
    if (slug) out.push({ id: node.id, slug, name, path });
    const children = node.children || node.category_children;
    if (Array.isArray(children) && children.length) {
      out.push(...flattenCategoryTree(children, path));
    }
  }
  return out;
}

function buildCategoryTree(list) {
  const byId = new Map();
  (list || []).forEach((c) => {
    if (!c?.id) return;
    byId.set(c.id, { ...c, children: [] });
  });
  const roots = [];
  byId.forEach((node) => {
    if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id).children.push(node);
    else roots.push(node);
  });
  const sortDeep = (nodes) => {
    nodes.sort((a, b) => String(a.name || a.slug || "").localeCompare(String(b.name || b.slug || ""), undefined, { sensitivity: "base" }));
    nodes.forEach((n) => n.children?.length && sortDeep(n.children));
  };
  sortDeep(roots);
  return roots;
}

// ── Section wrapper ────────────────────────────────────────────────────────
function SectionCard({ icon, title, subtitle, children }) {
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack gap="300" blockAlign="center">
          <div style={{ color: "#2563eb", fontSize: 22 }}>{icon}</div>
          <BlockStack gap="050">
            <Text as="h2" variant="headingMd">{title}</Text>
            <Text as="p" variant="bodySm" tone="subdued">{subtitle}</Text>
          </BlockStack>
        </InlineStack>
        <Divider />
        {children}
      </BlockStack>
    </Card>
  );
}

// ── Drag-and-drop file zone ────────────────────────────────────────────────
function DropZone({ onFile, accept, label, hint }) {
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState(null);
  const inputRef = useRef();

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) { setFileName(f.name); onFile(f); }
  }, [onFile]);

  const handleFile = useCallback((e) => {
    const f = e.target.files?.[0];
    if (f) { setFileName(f.name); onFile(f); }
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${drag ? "#2563eb" : "#d1d5db"}`,
        borderRadius: 10,
        padding: "28px 24px",
        background: drag ? "#eff6ff" : "#fafafa",
        cursor: "pointer",
        textAlign: "center",
        transition: "all .15s",
      }}
    >
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={handleFile} />
      <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
      <Text as="p" variant="bodyMd" fontWeight="semibold">
        {fileName ? `✓ ${fileName}` : label}
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">{hint}</Text>
    </div>
  );
}

// ── Import result panel ───────────────────────────────────────────────────
function ImportResult({ result }) {
  if (!result) return null;
  const hasErrors = result.errors?.length > 0;
  return (
    <BlockStack gap="300">
      <Banner tone={result.failed === 0 ? "success" : result.created > 0 || result.updated > 0 ? "warning" : "critical"}>
        <Text as="p" variant="bodyMd">
          <strong>{result.created}</strong> ürün oluşturuldu
          {result.updated > 0 && <>, <strong>{result.updated}</strong> güncellendi</>}
          {result.failed > 0 && <>, <strong>{result.failed}</strong> başarısız</>}
          {" "}(Toplam: {result.total})
        </Text>
      </Banner>
      {hasErrors && (
        <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #fee2e2", borderRadius: 8, padding: 12, background: "#fff5f5" }}>
          {result.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: "#991b1b", padding: "2px 0" }}>
              <strong>{e.sku}</strong>: {e.error}
            </div>
          ))}
        </div>
      )}
    </BlockStack>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function ImportExportPage() {
  const params = useParams();
  const locale = typeof params?.locale === "string" ? params.locale.split("-")[0].toLowerCase() : "de";

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState(null);
  const [selectedSlugs, setSelectedSlugs] = useState(() => new Set());
  const [categoryPathIds, setCategoryPathIds] = useState([]);
  const [templateDownloading, setTemplateDownloading] = useState(false);
  const [templateError, setTemplateError] = useState(null);

  const [productFile, setProductFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportInfo, setExportInfo] = useState(null);
  const [availableColumns, setAvailableColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState(() => new Set());
  const [exportDatasets, setExportDatasets] = useState(() => new Set(["products"]));
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [includeAllSellers, setIncludeAllSellers] = useState(false);
  const [groupBySeller, setGroupBySeller] = useState(true);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [exportPreset, setExportPreset] = useState("custom");

  const applyPreset = useCallback((preset) => {
    if (preset === "basic_products") {
      setExportDatasets(new Set(["products"]));
      setFilterStatus("published");
      setExportFormat("xlsx");
      return;
    }
    if (preset === "sales_report") {
      setExportDatasets(new Set(["orders", "transactions"]));
      setFilterStatus("");
      setExportFormat("xlsx");
      return;
    }
    if (preset === "full_export") {
      setExportDatasets(new Set(["products", "orders", "customers", "transactions", "ranking"]));
      setFilterStatus("");
      setExportFormat("xlsx");
      return;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCategoriesLoading(true);
      setCategoriesError(null);
      try {
        const client = getMedusaAdminClient();
        const data = await client.getAdminHubCategories({ all: true, tree: "true", active: "true" });
        const tree = data.tree || data.categories || [];
        const flat = flattenCategoryTree(Array.isArray(tree) ? tree : []);
        if (!cancelled) setCategories(flat);
      } catch (e) {
        if (!cancelled) setCategoriesError(e?.message || "Kategorien konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const categoryTree = React.useMemo(() => buildCategoryTree(categories), [categories]);

  const toggleCategory = useCallback((slug) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      const k = String(slug).trim();
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const currentCategoryNodes = React.useMemo(() => {
    let nodes = categoryTree;
    for (const id of categoryPathIds) {
      const found = (nodes || []).find((n) => n.id === id);
      nodes = found?.children || [];
    }
    return nodes || [];
  }, [categoryTree, categoryPathIds]);

  const categoryPathNodes = React.useMemo(() => {
    const out = [];
    let nodes = categoryTree;
    for (const id of categoryPathIds) {
      const found = (nodes || []).find((n) => n.id === id);
      if (!found) break;
      out.push(found);
      nodes = found.children || [];
    }
    return out;
  }, [categoryTree, categoryPathIds]);

  const enterCategory = useCallback((node) => {
    if (!node || !Array.isArray(node.children) || node.children.length === 0) return;
    setCategoryPathIds((prev) => [...prev, node.id]);
  }, []);

  const goToPathDepth = useCallback((depth) => {
    setCategoryPathIds((prev) => prev.slice(0, depth));
  }, []);

  const handleProductImport = async () => {
    if (!productFile) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    setProgress(30);

    try {
      const sellerToken = typeof window !== "undefined" ? (localStorage.getItem("sellerToken") || "") : "";
      const fd = new FormData();
      fd.append("file", productFile);
      fd.append("sellerToken", sellerToken);

      setProgress(60);
      const res = await fetch("/api/import-export/import", { method: "POST", body: fd });
      const data = await res.json();
      setProgress(100);

      if (!res.ok || data.error) {
        setImportError(data.error || "Import fehlgeschlagen");
      } else {
        setImportResult(data);
      }
    } catch (e) {
      setImportError(e.message || "Import fehlgeschlagen");
    } finally {
      setImporting(false);
      setTimeout(() => setProgress(0), 1500);
    }
  };

  const downloadProductTemplate = async () => {
    setTemplateError(null);
    if (selectedSlugs.size === 0) {
      setTemplateError("Bitte mindestens eine Kategorie auswählen.");
      return;
    }
    setTemplateDownloading(true);
    try {
      const sellerToken = typeof window !== "undefined" ? (localStorage.getItem("sellerToken") || "") : "";
      const res = await fetch("/api/import-export/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerToken,
          locale,
          selectedCategorySlugs: [...selectedSlugs],
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setTemplateError(errJson.error || `Download fehlgeschlagen (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "belucha-produkte-template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setTemplateError(e?.message || "Download fehlgeschlagen");
    } finally {
      setTemplateDownloading(false);
    }
  };

  const loadExportColumns = async () => {
    setExportError(null);
    try {
      const sellerToken = typeof window !== "undefined" ? (localStorage.getItem("sellerToken") || "") : "";
      const res = await fetch("/api/import-export/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview: true,
          sellerToken,
          datasets: [...exportDatasets],
          include_all_sellers: includeAllSellers,
          filters: {
            search: filterSearch,
            status: filterStatus,
            date_from: filterDateFrom,
            date_to: filterDateTo,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setExportError(data.error || "Spalten konnten nicht geladen werden.");
        return;
      }
      setExportInfo(data);
      setAvailableColumns(data.columns || []);
      setSelectedColumns(new Set(data.columns || []));
    } catch (e) {
      setExportError(e?.message || "Spalten konnten nicht geladen werden.");
    }
  };

  const runExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const sellerToken = typeof window !== "undefined" ? (localStorage.getItem("sellerToken") || "") : "";
      const cols = selectedColumns.size ? [...selectedColumns] : availableColumns;
      const res = await fetch("/api/import-export/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerToken,
          datasets: [...exportDatasets],
          columns: cols,
          format: exportFormat,
          include_all_sellers: includeAllSellers,
          group_by_seller: groupBySeller,
          filters: {
            search: filterSearch,
            status: filterStatus,
            date_from: filterDateFrom,
            date_to: filterDateTo,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setExportError(data.error || `Export fehlgeschlagen (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `belucha-export.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e?.message || "Export fehlgeschlagen.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout>
      <Page
        title="Import / Export"
        subtitle="Produkte, Bestellungen und Kunden in großen Mengen importieren und exportieren"
      >
        <Layout>

          <Layout.Section>
            <SectionCard
              icon="📋"
              title="Templates herunterladen"
              subtitle="Kategorien wählen, dann die Vorlage laden. Das zweite Blatt erklärt alle Spalten in Ihrer Shopsprache."
            >
              {categoriesLoading && (
                <InlineStack gap="200" blockAlign="center">
                  <Spinner size="small" />
                  <Text as="span" variant="bodySm" tone="subdued">Kategorien werden geladen…</Text>
                </InlineStack>
              )}
              {categoriesError && (
                <Banner tone="critical">{categoriesError}</Banner>
              )}
              {!categoriesLoading && !categoriesError && categories.length > 0 && (
                <BlockStack gap="300">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Kategorien für diesen Import (Pflicht für Download)
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Drilldown wie ürün sayfası: önce parent, sonra onun sub kategorileri. İstediğin seviyede kategoriyi seçebilirsin.
                  </Text>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fafafa" }}>
                    <InlineStack gap="200" blockAlign="center" wrap>
                      <Button size="slim" onClick={() => goToPathDepth(0)} disabled={categoryPathIds.length === 0}>Parent</Button>
                      {categoryPathNodes.map((n, i) => (
                        <Button key={n.id} size="slim" onClick={() => goToPathDepth(i + 1)}>{n.name || n.slug}</Button>
                      ))}
                    </InlineStack>
                    <div style={{ marginTop: 10, maxHeight: 280, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: 8 }}>
                      <BlockStack gap="100">
                        {currentCategoryNodes.length === 0 ? (
                          <Text as="p" variant="bodySm" tone="subdued">Bu seviyede alt kategori yok.</Text>
                        ) : currentCategoryNodes.map((n) => {
                          const hasChildren = Array.isArray(n.children) && n.children.length > 0;
                          return (
                            <div key={n.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 4px", borderBottom: "1px solid #f3f4f6" }}>
                              <Checkbox
                                label={`${n.name || n.slug} — ${n.slug}`}
                                checked={selectedSlugs.has(n.slug)}
                                onChange={() => toggleCategory(n.slug)}
                              />
                              {hasChildren ? (
                                <Button size="slim" onClick={() => enterCategory(n)}>Subcategories</Button>
                              ) : null}
                            </div>
                          );
                        })}
                      </BlockStack>
                    </div>
                    {selectedSlugs.size > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <Text as="p" variant="bodySm" tone="subdued">{selectedSlugs.size} Kategorie ausgewählt</Text>
                      </div>
                    )}
                  </div>
                </BlockStack>
              )}

              {templateError && (
                <Banner tone="critical" onDismiss={() => setTemplateError(null)}>{templateError}</Banner>
              )}

              <Box paddingBlockStart="400">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {[
                    { type: "products", label: "Produkte", desc: "Parent/Child, Varianten, Dropdowns, Kılavuz", icon: "📦", primary: true },
                    { type: "collections", label: "Kollektionen", desc: "Kollektion-Titel und Beschreibungen", icon: "🗂" },
                    { type: "customers", label: "Kunden", desc: "Kundendaten & Adressen", icon: "👥" },
                    { type: "inventory", label: "Lagerbestand", desc: "Schnell-Update: SKU + Menge", icon: "📊" },
                  ].map(({ type, label, desc, icon, primary }) => (
                    <div
                      key={type}
                      style={{
                        border: `1px solid ${primary ? "#bfdbfe" : "#e5e7eb"}`,
                        borderRadius: 10,
                        padding: "16px",
                        background: primary ? "#eff6ff" : "#fff",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontSize: 28 }}>{icon}</div>
                      <div>
                        <Text as="p" variant="bodyMd" fontWeight="semibold">{label}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{desc}</Text>
                      </div>
                      <Button
                        variant={primary ? "primary" : "secondary"}
                        size="slim"
                        icon={NoteIcon}
                        onClick={() => type === "products" && downloadProductTemplate()}
                        disabled={type !== "products" || categoriesLoading || selectedSlugs.size === 0}
                        loading={type === "products" && templateDownloading}
                      >
                        .xlsx herunterladen
                      </Button>
                      {type !== "products" && (
                        <Text as="p" variant="bodySm" tone="subdued">Demnächst verfügbar</Text>
                      )}
                    </div>
                  ))}
                </div>
              </Box>

              <Box paddingBlockStart="300">
                <Banner tone="info">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Produkt-Template</Text>
                    <Text as="p" variant="bodySm">
                      Jede Zeile nutzt <strong>product_type</strong>{" "}
                      <Badge>parent</Badge> oder <Badge>child</Badge>.
                      Dropdowns (Kategorie, Marke, Versandgruppe, Status, …) beziehen sich auf die Listen im versteckten Excel-Blatt.
                      URL-Handles werden automatisch erzeugt. Kollektionen sind im Excel-Import nicht setzbar.
                    </Text>
                  </BlockStack>
                </Banner>
              </Box>
            </SectionCard>
          </Layout.Section>

          <Layout.Section>
            <SectionCard
              icon="📥"
              title="Produkte importieren"
              subtitle="Lade eine ausgefüllte .xlsx-Datei hoch, um Produkte in großen Mengen anzulegen."
            >
              <BlockStack gap="400">
                <DropZone
                  onFile={setProductFile}
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  label="Excel-Datei hier ablegen oder klicken"
                  hint=".xlsx • max. 10 MB • UTF-8 mit Sonderzeichen"
                />

                {importing && progress > 0 && (
                  <ProgressBar progress={progress} tone="highlight" animated />
                )}

                {importError && (
                  <Banner tone="critical" onDismiss={() => setImportError(null)}>
                    {importError}
                  </Banner>
                )}

                <ImportResult result={importResult} />

                <InlineStack gap="300" blockAlign="center">
                  <Button
                    variant="primary"
                    icon={ImportIcon}
                    onClick={handleProductImport}
                    loading={importing}
                    disabled={!productFile || importing}
                  >
                    {importing ? "Importiere…" : "Produkte importieren"}
                  </Button>
                  {productFile && !importing && (
                    <Button variant="plain" onClick={() => { setProductFile(null); setImportResult(null); setImportError(null); }}>
                      Datei entfernen
                    </Button>
                  )}
                </InlineStack>

                <Divider />

                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Import-Regeln</Text>
                  {[
                    "Zeile 1–3: Gruppenüberschriften & Spaltenbezeichner (nicht löschen)",
                    "Ab Zeile 4: Datenzeilen. Leere Zeilen werden übersprungen.",
                    "Zeilen mit SKU beginnend mit # werden als Kommentar ignoriert.",
                    "Parent-Zeilen müssen title_de (oder title_en) enthalten.",
                    "Child-Zeilen benötigen parent_sku = SKU der zugehörigen Parent-Zeile.",
                    "Marke und Versandgruppe müssen exakt den Namen aus dem System haben — sonst Fehlermeldung.",
                    "Kategorie: slug muss existieren; am besten dieselbe Vorlage mit Kategorieauswahl verwenden.",
                    "Kollektionen: nicht per Excel setzen.",
                    "Handles (URL) werden automatisch vergeben — keine handle_*-Spalten nötig.",
                    "Metafelder: Paare metafield_N_key / metafield_N_value; weitere Nummern als Spalten ergänzbar.",
                    "Varianten: mindestens option1/2; option3… in der Vorlage — weitere optionN-Spalten in Excel möglich.",
                    "Preise als Dezimalzahl: z.B. 29.99 (Punkt als Trennzeichen).",
                    "HTML in description_*: <p>, <b>, <ul>, <li> usw. werden übernommen.",
                  ].map((rule, i) => (
                    <InlineStack key={i} gap="200" blockAlign="start">
                      <Text as="span" variant="bodySm" tone="subdued">•</Text>
                      <Text as="span" variant="bodySm">{rule}</Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </SectionCard>
          </Layout.Section>

          <Layout.Section>
            <SectionCard
              icon="📤"
              title="Daten exportieren"
              subtitle="Einfacher Export wie Billbee-Style: Datentyp wählen, Filter setzen, Spalten auswählen, Format downloaden."
            >
              <BlockStack gap="300">
                <Text as="p" variant="bodySm" tone="subdued">
                  Seller hesapları yalnızca kendi verilerini export eder. Superuser, ister sadece platform verisini, ister tüm seller verisini export edebilir.
                </Text>
                <Divider />
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">1) Veri kapsamı</Text>
                  <div style={{ maxWidth: 360 }}>
                    <select
                      value={exportPreset}
                      onChange={(e) => {
                        const v = e.target.value;
                        setExportPreset(v);
                        if (v !== "custom") applyPreset(v);
                      }}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}
                    >
                      <option value="custom">Custom</option>
                      <option value="basic_products">Preset: Ürün temel</option>
                      <option value="sales_report">Preset: Satış raporu</option>
                      <option value="full_export">Preset: Tam export</option>
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                    {[
                      ["products", "Ürünler (fiyat, görsel, metadata)"],
                      ["orders", "Siparişler / satışlar"],
                      ["customers", "Müşteriler"],
                      ["transactions", "Transactions / ödeme hareketleri"],
                      ["ranking", "Görüntülenme / tıklama / performans (ranking)"],
                    ].map(([k, label]) => (
                      <Checkbox
                        key={k}
                        label={label}
                        checked={exportDatasets.has(k)}
                        onChange={() =>
                          setExportDatasets((prev) => {
                            const next = new Set(prev);
                            if (next.has(k)) next.delete(k); else next.add(k);
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">2) Filtreler</Text>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
                    <input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Arama (SKU, ad, email...)" style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }} />
                    <input value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} placeholder="Status (optional)" style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }} />
                    <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }} />
                    <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }} />
                  </div>
                  <InlineStack gap="300">
                    <Checkbox label="Superuser: tüm seller verileri dahil" checked={includeAllSellers} onChange={setIncludeAllSellers} />
                    <Checkbox label="XLSX exportta seller bazlı sheetlere ayır" checked={groupBySeller} onChange={setGroupBySeller} />
                  </InlineStack>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">3) Sütunlar</Text>
                  <InlineStack gap="300">
                    <Button variant="secondary" onClick={loadExportColumns}>Spalten laden</Button>
                    {availableColumns.length > 0 && (
                      <>
                        <Button size="slim" onClick={() => setSelectedColumns(new Set(availableColumns))}>Tümünü seç</Button>
                        <Button size="slim" onClick={() => setSelectedColumns(new Set())}>Temizle</Button>
                      </>
                    )}
                    {exportInfo?.total != null ? <Badge tone="info">{exportInfo.total} satır eşleşti</Badge> : null}
                    {availableColumns.length > 0 ? <Badge tone="success">{selectedColumns.size} sütun seçili</Badge> : null}
                  </InlineStack>
                  {availableColumns.length > 0 && (
                    <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                        {availableColumns.map((c) => (
                          <Checkbox
                            key={c}
                            label={c}
                            checked={selectedColumns.has(c)}
                            onChange={() =>
                              setSelectedColumns((prev) => {
                                const next = new Set(prev);
                                if (next.has(c)) next.delete(c); else next.add(c);
                                return next;
                              })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">4) Format ve indir</Text>
                  <div style={{ maxWidth: 260 }}>
                    <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}>
                      <option value="xlsx">XLSX</option>
                      <option value="csv">CSV</option>
                      <option value="txt">TXT</option>
                    </select>
                  </div>
                  {exportError && <Banner tone="critical" onDismiss={() => setExportError(null)}>{exportError}</Banner>}
                  <Button
                    variant="primary"
                    icon={ExportIcon}
                    onClick={runExport}
                    loading={exporting}
                    disabled={exporting || exportDatasets.size === 0}
                  >
                    {exporting ? "Export läuft..." : "Export starten"}
                  </Button>
                </BlockStack>
              </BlockStack>
            </SectionCard>
          </Layout.Section>

        </Layout>
      </Page>
    </DashboardLayout>
  );
}
