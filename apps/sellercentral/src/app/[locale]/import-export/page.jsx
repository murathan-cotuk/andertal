"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useLocale } from "next-intl";
import DashboardLayout from "@/components/DashboardLayout";
import { productExcelTemplateFilename } from "@/lib/download-names";
import { getImportExportCopy } from "@/lib/import-export-i18n";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import {
  Page, Layout, Card, Button, Text, BlockStack, InlineStack,
  Box, Banner, Divider, Badge, ProgressBar, Checkbox, Spinner, Tabs,
} from "@shopify/polaris";
import { ImportIcon, ExportIcon, NoteIcon } from "@shopify/polaris-icons";
import CustomCheckbox from "@/components/ui/CustomCheckbox";

function sortDeep(nodes) {
  nodes.sort((a, b) => String(a.name || a.slug || "").localeCompare(String(b.name || b.slug || ""), undefined, { sensitivity: "base" }));
  nodes.forEach((n) => n.children?.length && sortDeep(n.children));
  return nodes;
}

function buildTreeFromFlat(list) {
  const byId = new Map();
  (list || []).forEach((c) => { if (c?.id) byId.set(String(c.id), { ...c, children: [] }); });
  const roots = [];
  byId.forEach((node) => {
    const pid = node.parent_id != null ? String(node.parent_id) : null;
    if (pid && byId.has(pid)) byId.get(pid).children.push(node);
    else roots.push(node);
  });
  return sortDeep(roots);
}

function collectAllSlugs(nodes, out = []) {
  for (const n of nodes || []) {
    if (n.slug) out.push(n.slug);
    if (n.children?.length) collectAllSlugs(n.children, out);
  }
  return out;
}

/** Amazon-style multi-select drilldown for categories */
function CategoryMultiDrilldown({ tree, selectedSlugs, onToggle, onToggleSubtree, t }) {
  // Accordion path: only one open branch per depth.
  const [openPath, setOpenPath] = useState([]);

  const getSubtreeSlugs = (node) => collectAllSlugs([node]);
  const isSubtreeFullySelected = (node) => {
    const slugs = getSubtreeSlugs(node);
    return slugs.length > 0 && slugs.every((s) => selectedSlugs.has(s));
  };
  const isSubtreePartiallySelected = (node) => {
    const slugs = getSubtreeSlugs(node);
    return slugs.some((s) => selectedSlugs.has(s)) && !slugs.every((s) => selectedSlugs.has(s));
  };

  const toggleOpen = (depth, nodeId) => {
    setOpenPath((prev) => {
      if (prev[depth] === nodeId) return prev.slice(0, depth); // close current branch
      const next = prev.slice(0, depth);
      next[depth] = nodeId;
      return next;
    });
  };

  const renderNodes = (nodes, depth = 0) => (
    (nodes || []).map((node) => {
      const hasKids = (node.children?.length || 0) > 0;
      const allSelected = isSubtreeFullySelected(node);
      const partial = !allSelected && isSubtreePartiallySelected(node);
      const directSelected = selectedSlugs.has(node.slug);
      const isOpen = openPath[depth] === node.id;
      return (
        <React.Fragment key={`${depth}-${node.id}`}>
          <div
            onClick={() => hasKids && toggleOpen(depth, node.id)}
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 0,
              borderBottom: "1px solid #f3f4f6",
              minHeight: 44,
              cursor: hasKids ? "pointer" : "default",
              background: isOpen ? "#f8fafc" : "#fff",
              marginLeft: depth * 18,
            }}
          >
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", flex: 1, cursor: "pointer", userSelect: "none" }}
            >
              <CustomCheckbox
                checked={directSelected}
                onChange={() => onToggle(node.slug)}
                size={18}
                style={{ flexShrink: 0 }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: depth > 0 ? 12 : 13,
                    color: depth > 0 ? "#374151" : "#111827",
                    fontWeight: depth > 0 ? 500 : 600,
                    lineHeight: 1.3,
                    paddingLeft: depth > 0 ? 4 : 0,
                  }}
                >
                  {node.name || node.slug}
                </div>
              </div>
              {hasKids && allSelected && <span style={{ marginLeft: "auto", fontSize: 11, color: "#16a34a", flexShrink: 0 }}>{t.allSelected}</span>}
              {hasKids && partial && <span style={{ marginLeft: "auto", fontSize: 11, color: "#f59e0b", flexShrink: 0 }}>{t.partialSelected}</span>}
            </label>
            {hasKids ? (
              <div
                style={{
                  flexShrink: 0,
                  width: 58,
                  minHeight: 44,
                  padding: 0,
                  background: "#f8fafc",
                  borderLeft: "1px solid #e5e7eb",
                  color: "#374151",
                  fontSize: 22,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: isOpen ? "rotate(90deg)" : "none",
                  transition: "transform .15s ease",
                }}
                aria-hidden
              >
                ›
              </div>
            ) : null}
          </div>
          {hasKids && isOpen ? renderNodes(node.children, depth + 1) : null}
        </React.Fragment>
      );
    })
  );

  return (
    <div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", maxHeight: 460, overflowY: "auto" }}>
        {!Array.isArray(tree) || tree.length === 0 ? (
          <div style={{ padding: "16px 12px", fontSize: 13, color: "#9ca3af" }}>{t.noSubcategories}</div>
        ) : (
          renderNodes(tree, 0)
        )}
      </div>
    </div>
  );
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
function ImportResult({ result, t }) {
  if (!result) return null;
  const hasErrors = result.errors?.length > 0;
  return (
    <BlockStack gap="300">
      <Banner tone={result.failed === 0 ? "success" : result.created > 0 || result.updated > 0 ? "warning" : "critical"}>
        <Text as="p" variant="bodyMd">
          <strong>{result.created}</strong> {t.importResultCreatedSuffix}
          {result.updated > 0 && <>, <strong>{result.updated}</strong> {t.importResultUpdatedSuffix}</>}
          {result.failed > 0 && <>, <strong>{result.failed}</strong> {t.importResultFailedSuffix}</>}
          {" "}{t.importResultTotal(result.total)}
        </Text>
      </Banner>
      {result.media && result.media.registered > 0 && (
        <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, fontSize: 12, color: "#15803d" }}>
          📁 {t.mediaRegistered(result.media.registered)}
          {result.media.folder && <> {t.mediaFolder(result.media.folder.name)}</>}
          {result.media.skipped > 0 && <>, {t.mediaSkipped(result.media.skipped)}</>}
        </div>
      )}
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
  const [isSuperuser, setIsSuperuser] = useState(false);
  const locale = useLocale();
  const t = useMemo(() => getImportExportCopy(locale), [locale]);

  const [activeTab, setActiveTab] = useState(0);
  const [categoryTree, setCategoryTree] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState(null);
  const [selectedSlugs, setSelectedSlugs] = useState(() => new Set());
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  useEffect(() => {
    if (!isSuperuser) setGroupBySeller(false);
  }, [isSuperuser]);

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
        const rawTree = data.tree || data.categories || [];
        // If API returns flat list, build tree; if already tree (has children), use directly
        const hasFlatItems = Array.isArray(rawTree) && rawTree.length > 0 && !rawTree[0]?.children;
        const built = hasFlatItems ? buildTreeFromFlat(rawTree) : sortDeep(rawTree.map((n) => ({ ...n, children: n.children || [] })));
        if (!cancelled) setCategoryTree(built);
      } catch (e) {
        if (!cancelled) setCategoriesError(e?.message || t.categoriesLoadError);
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const categoryAncestorsBySlug = useMemo(() => {
    const map = new Map();
    const walk = (nodes, ancestors = []) => {
      for (const n of nodes || []) {
        if (!n) continue;
        const slug = String(n.slug || "").trim();
        const nextAncestors = slug ? [...ancestors, slug] : [...ancestors];
        if (slug) map.set(slug, ancestors);
        if (Array.isArray(n.children) && n.children.length) walk(n.children, nextAncestors);
      }
    };
    walk(categoryTree, []);
    return map;
  }, [categoryTree]);

  const toggleCategory = useCallback((slug) => {
    const k = String(slug || "").trim();
    if (!k) return;
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else {
        next.add(k);
        const ancestors = categoryAncestorsBySlug.get(k) || [];
        for (const a of ancestors) next.delete(a);
      }
      return next;
    });
  }, [categoryAncestorsBySlug]);

  const selectedCategoryDetails = useMemo(() => {
    const out = [];
    const selected = new Set([...selectedSlugs].map((s) => String(s).trim()).filter(Boolean));
    const selectedEffective = new Set(selected);
    for (const slug of selected) {
      const ancestors = categoryAncestorsBySlug.get(slug) || [];
      for (const a of ancestors) {
        if (selected.has(a)) selectedEffective.delete(a);
      }
    }
    const walk = (nodes, parents = []) => {
      for (const n of nodes || []) {
        if (!n) continue;
        const slug = String(n.slug || "").trim();
        const name = String(n.name || n.slug || "").trim();
        const nextParents = [...parents, name];
        if (slug && selectedEffective.has(slug)) {
          out.push({
            slug,
            name,
            breadcrumb: parents.join(" / "),
          });
        }
        if (Array.isArray(n.children) && n.children.length) walk(n.children, nextParents);
      }
    };
    walk(categoryTree, []);
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return out;
  }, [categoryTree, selectedSlugs, categoryAncestorsBySlug]);

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
      fd.append("locale", locale);

      setProgress(60);
      const res = await fetch("/api/import-export/import", { method: "POST", body: fd });
      const data = await res.json();
      setProgress(100);

      if (!res.ok || data.error) {
        setImportError(data.error || t.importFailed);
      } else {
        setImportResult(data);
      }
    } catch (e) {
      setImportError(e.message || t.importFailed);
    } finally {
      setImporting(false);
      setTimeout(() => setProgress(0), 1500);
    }
  };

  const downloadProductTemplate = async () => {
    setTemplateError(null);
    if (selectedSlugs.size === 0) {
      setTemplateError(t.selectCategoryError);
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
        setTemplateError(errJson.error || t.downloadFailed(res.status));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = productExcelTemplateFilename(locale);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setTemplateError(e?.message || t.downloadFailed(""));
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
          locale,
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
        setExportError(data.error || t.columnsLoadError);
        return;
      }
      setExportInfo(data);
      setAvailableColumns(data.columns || []);
      setSelectedColumns(new Set(data.columns || []));
    } catch (e) {
      setExportError(e?.message || t.columnsLoadError);
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
          group_by_seller: isSuperuser ? groupBySeller : false,
          locale,
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
        setExportError(data.error || t.downloadFailed(res.status));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `andertal-export.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e?.message || t.exportFailed);
    } finally {
      setExporting(false);
    }
  };

  const tabs = [
    { id: "import", content: t.tabImport, panelID: "import-panel" },
    { id: "export", content: t.tabExport, panelID: "export-panel" },
  ];

  return (
    <DashboardLayout>
      <Page
        title={t.pageTitle}
        subtitle={t.pageSubtitle}
      >
        <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab}>
          {activeTab === 0 ? (
        <Layout>

          <Layout.Section>
            <SectionCard
              icon="📋"
              title={t.templatesTitle}
              subtitle={t.templatesSubtitle}
            >
              {categoriesLoading && (
                <InlineStack gap="200" blockAlign="center">
                  <Spinner size="small" />
                  <Text as="span" variant="bodySm" tone="subdued">{t.categoriesLoading}</Text>
                </InlineStack>
              )}
              {categoriesError && (
                <Banner tone="critical">{categoriesError}</Banner>
              )}
              {!categoriesLoading && !categoriesError && categoryTree.length > 0 && (
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {t.categorySelectLabel}
                    </Text>
                    {selectedSlugs.size > 0 && (
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodySm" tone="subdued">{t.selectedCount(selectedSlugs.size)}</Text>
                        <Button size="slim" variant="plain" tone="critical" onClick={() => setSelectedSlugs(new Set())}>{t.reset}</Button>
                      </InlineStack>
                    )}
                  </InlineStack>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                    <div style={{ width: "60%", minWidth: 320, maxWidth: 760 }}>
                      <CategoryMultiDrilldown
                        tree={categoryTree}
                        selectedSlugs={selectedSlugs}
                        onToggle={toggleCategory}
                        t={t}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 260, border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", maxHeight: 460, overflowY: "auto" }}>
                      <div style={{ padding: "10px 12px", borderBottom: "1px solid #f1f2f4", background: "#fafafa" }}>
                        <Text as="p" variant="bodySm" fontWeight="semibold">{t.selectedCategories}</Text>
                      </div>
                      {selectedCategoryDetails.length === 0 ? (
                        <div style={{ padding: "10px 12px" }}>
                          <Text as="p" variant="bodySm" tone="subdued">{t.noCategorySelected}</Text>
                        </div>
                      ) : (
                        selectedCategoryDetails.map((row) => (
                          <div key={row.slug} style={{ padding: "8px 12px", borderBottom: "1px solid #f5f6f7" }}>
                            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.2, marginBottom: 2 }}>
                              {row.breadcrumb || t.parent}
                            </div>
                            <div style={{ fontSize: 13, color: "#111827", fontWeight: 600, lineHeight: 1.25 }}>
                              {row.name}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </BlockStack>
              )}

              {templateError && (
                <Banner tone="critical" onDismiss={() => setTemplateError(null)}>{templateError}</Banner>
              )}

              <Box paddingBlockStart="400">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {[
                    { type: "products", label: t.templateProducts, desc: t.templateProductsDesc, icon: "📦", primary: true },
                    { type: "collections", label: t.templateCollections, desc: t.templateCollectionsDesc, icon: "🗂" },
                    { type: "customers", label: t.templateCustomers, desc: t.templateCustomersDesc, icon: "👥" },
                    { type: "inventory", label: t.templateInventory, desc: t.templateInventoryDesc, icon: "📊" },
                  ]
                    .filter((item) => {
                      if (isSuperuser) return true;
                      return !["collections", "customers", "inventory"].includes(item.type);
                    })
                    .map(({ type, label, desc, icon, primary }) => (
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
                        {t.downloadXlsx}
                      </Button>
                      {type !== "products" && (
                        <Text as="p" variant="bodySm" tone="subdued">{t.comingSoon}</Text>
                      )}
                    </div>
                  ))}
                </div>
              </Box>

              <Box paddingBlockStart="300">
                <Banner tone="info">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{t.productTemplateInfo}</Text>
                    <Text as="p" variant="bodySm">{t.productTemplateBody}</Text>
                  </BlockStack>
                </Banner>
              </Box>
            </SectionCard>
          </Layout.Section>

          <Layout.Section>
            <SectionCard
              icon="📥"
              title={t.importProductsTitle}
              subtitle={t.importProductsSubtitle}
            >
              <BlockStack gap="400">
                <DropZone
                  onFile={setProductFile}
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  label={t.dropLabel}
                  hint={t.dropHint}
                />

                {importing && progress > 0 && (
                  <ProgressBar progress={progress} tone="highlight" animated />
                )}

                {importError && (
                  <Banner tone="critical" onDismiss={() => setImportError(null)}>
                    {importError}
                  </Banner>
                )}

                <ImportResult result={importResult} t={t} />

                <InlineStack gap="300" blockAlign="center">
                  <Button
                    variant="primary"
                    icon={ImportIcon}
                    onClick={handleProductImport}
                    loading={importing}
                    disabled={!productFile || importing}
                  >
                    {importing ? t.importing : t.importProducts}
                  </Button>
                  {productFile && !importing && (
                    <Button variant="plain" onClick={() => { setProductFile(null); setImportResult(null); setImportError(null); }}>
                      {t.removeFile}
                    </Button>
                  )}
                </InlineStack>

                <Divider />

                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">{t.importRules}</Text>
                  {t.importRulesList.map((rule, i) => (
                    <InlineStack key={i} gap="200" blockAlign="start">
                      <Text as="span" variant="bodySm" tone="subdued">•</Text>
                      <Text as="span" variant="bodySm">{rule}</Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </SectionCard>
          </Layout.Section>

        </Layout>
          ) : (
        <Layout>
          <Layout.Section>
            <SectionCard
              icon="📤"
              title={t.exportTitle}
              subtitle={t.exportSubtitle}
            >
              <BlockStack gap="400">
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff" }}>
                  <BlockStack gap="250">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{t.exportScope}</Text>
                    <div style={{ maxWidth: 360 }}>
                      <select
                        value={exportPreset}
                        onChange={(e) => {
                          const v = e.target.value;
                          setExportPreset(v);
                          if (v !== "custom") applyPreset(v);
                        }}
                        style={{ width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff" }}
                      >
                        <option value="custom">{t.presetCustom}</option>
                        <option value="basic_products">{t.presetBasicProducts}</option>
                        <option value="sales_report">{t.presetSalesReport}</option>
                        <option value="full_export">{t.presetFullExport}</option>
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                      {[
                        ["products", t.datasetProducts],
                        ["orders", t.datasetOrders],
                        ["customers", t.datasetCustomers],
                        ["transactions", t.datasetTransactions],
                        ["ranking", t.datasetRanking],
                      ].map(([k, label]) => (
                        <div key={k} style={{ border: "1px solid #eef0f3", borderRadius: 8, padding: "8px 10px", background: "#fafbfc" }}>
                          <Checkbox
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
                        </div>
                      ))}
                    </div>
                  </BlockStack>
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff" }}>
                  <BlockStack gap="250">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{t.exportFilters}</Text>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                      <input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder={t.filterSearch} style={{ padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8 }} />
                      <input value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} placeholder={t.filterStatus} style={{ padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8 }} />
                      <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={{ padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8 }} />
                      <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={{ padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8 }} />
                    </div>
                    <InlineStack gap="300">
                      {isSuperuser ? (
                        <Checkbox label={t.includeAllSellers} checked={includeAllSellers} onChange={setIncludeAllSellers} />
                      ) : null}
                      {isSuperuser ? (
                        <Checkbox label={t.groupBySeller} checked={groupBySeller} onChange={setGroupBySeller} />
                      ) : null}
                    </InlineStack>
                  </BlockStack>
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff" }}>
                  <BlockStack gap="250">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">{t.exportColumns}</Text>
                      <InlineStack gap="200">
                        <Button variant="secondary" onClick={loadExportColumns}>{t.loadColumns}</Button>
                        {availableColumns.length > 0 && (
                          <>
                            <Button size="slim" onClick={() => setSelectedColumns(new Set(availableColumns))}>{t.selectAll}</Button>
                            <Button size="slim" onClick={() => setSelectedColumns(new Set())}>{t.clear}</Button>
                          </>
                        )}
                      </InlineStack>
                    </InlineStack>
                    <InlineStack gap="200">
                      {exportInfo?.total != null ? <Badge tone="info">{t.rowsMatched(exportInfo.total)}</Badge> : null}
                      {availableColumns.length > 0 ? <Badge tone="success">{t.columnsSelected(selectedColumns.size)}</Badge> : null}
                    </InlineStack>
                    {availableColumns.length > 0 && (
                      <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                          {availableColumns.map((c) => (
                            <div key={c} style={{ border: "1px solid #f1f2f4", borderRadius: 7, padding: "6px 8px" }}>
                              <Checkbox
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
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </BlockStack>
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff" }}>
                  <BlockStack gap="250">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{t.exportFormat}</Text>
                    <div style={{ maxWidth: 260 }}>
                      <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} style={{ width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff" }}>
                        <option value="xlsx">XLSX</option>
                        <option value="csv">CSV</option>
                        <option value="txt">TXT</option>
                      </select>
                    </div>
                    {exportError && <Banner tone="critical" onDismiss={() => setExportError(null)}>{exportError}</Banner>}
                    <InlineStack>
                      <Button
                        variant="primary"
                        icon={ExportIcon}
                        onClick={runExport}
                        loading={exporting}
                        disabled={exporting || exportDatasets.size === 0}
                      >
                        {exporting ? t.exportRunning : t.startExport}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </div>
              </BlockStack>
            </SectionCard>
          </Layout.Section>

        </Layout>
          )}
        </Tabs>
      </Page>
    </DashboardLayout>
  );
}
