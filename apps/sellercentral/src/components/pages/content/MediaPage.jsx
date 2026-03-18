"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Page,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  TextField,
  Modal,
  Spinner,
  Divider,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const BACKEND_URL = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").replace(/\/$/, "");

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return `${BACKEND_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(item) {
  if (!item) return false;
  if ((item.mime_type || "").startsWith("image/")) return true;
  const u = (item.url || "").toLowerCase().split("?")[0];
  return /\.(jpg|jpeg|png|gif|webp|svg|avif|ico)$/.test(u);
}

/* ── Lightbox ── */
function Lightbox({ item, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <button type="button" onClick={onClose} style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", color: "#fff", fontSize: 32, cursor: "pointer", lineHeight: 1 }} aria-label="Close">×</button>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <img src={resolveUrl(item.url)} alt={item.alt || item.filename || ""} style={{ maxWidth: "85vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8, display: "block" }} />
        <span style={{ color: "#ccc", fontSize: 13 }}>{item.filename}</span>
      </div>
    </div>
  );
}

/* ── Copy URL button ── */
function CopyBtn({ url }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <button type="button" onClick={copy} title={copied ? "Copied!" : "Copy URL"}
      style={{ background: copied ? "#16a34a" : "#f3f4f6", border: "none", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600, cursor: "pointer", color: copied ? "#fff" : "#374151", whiteSpace: "nowrap", transition: "background 0.15s", flexShrink: 0 }}
    >{copied ? "✓ Copied" : "Copy URL"}</button>
  );
}

export default function MediaPage() {
  const client = getMedusaAdminClient();

  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null); // null = all media, "FolderName" = specific folder
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "grid" | "list"

  const [lightboxItem, setLightboxItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderSaving, setFolderSaving] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlFolder, setUrlFolder] = useState("");
  const [urlSaving, setUrlSaving] = useState(false);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [mediaRes, foldersRes] = await Promise.all([
        client.getMedia({ limit: 1000 }),
        client.getMediaFolders().catch(() => ({ folders: [] })),
      ]);
      setItems(mediaRes.media || []);
      setFolders(foldersRes.folders || []);
    } catch (err) {
      setError(err?.message || "Failed to load media");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { fetchAll(); }, []);

  const visibleItems = currentFolder === null
    ? items
    : items.filter((i) => i.folder === currentFolder);

  const uploadFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    let count = 0;
    try {
      await Promise.all(Array.from(files).map(async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        if (currentFolder) fd.append("folder", currentFolder);
        await client.uploadMedia(fd);
        count++;
      }));
      showToast(`${count} file${count > 1 ? "s" : ""} uploaded`);
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleAddByUrl = async () => {
    const lines = urlInput.split(/[\n,]/).map((s) => s.trim()).filter((s) => s.startsWith("http"));
    if (!lines.length) return;
    setUrlSaving(true);
    try {
      await Promise.all(lines.map((url) =>
        client.registerMediaUrl({ url, folder: urlFolder || currentFolder || undefined })
      ));
      showToast(`${lines.length} URL${lines.length > 1 ? "s" : ""} added`);
      setUrlModalOpen(false);
      setUrlInput("");
      setUrlFolder("");
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Failed to add URLs");
    } finally {
      setUrlSaving(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setFolderSaving(true);
    try {
      await client.createMediaFolder(newFolderName.trim());
      showToast(`Folder "${newFolderName.trim()}" created`);
      setFolderModalOpen(false);
      setNewFolderName("");
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Failed to create folder");
    } finally {
      setFolderSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await client.deleteMedia(deleteTarget.id);
      showToast("Deleted");
      setDeleteTarget(null);
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Delete failed");
    }
  };

  const handleDeleteFolder = async (name) => {
    if (!confirm(`Delete folder "${name}"? Items will be moved to root.`)) return;
    try {
      await client.deleteMediaFolder(name);
      if (currentFolder === name) setCurrentFolder(null);
      showToast(`Folder "${name}" deleted`);
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Failed to delete folder");
    }
  };

  // All unique folder names (explicit + implicit from items)
  const allFolders = [...new Set([...folders, ...items.map((i) => i.folder).filter(Boolean)])].sort();

  return (
    <Page
      title="Medien"
      primaryAction={{ content: uploading ? "Uploading…" : "Upload", onAction: () => fileInputRef.current?.click(), loading: uploading }}
      secondaryActions={[
        { content: "Add by URL", onAction: () => { setUrlFolder(currentFolder || ""); setUrlModalOpen(true); } },
        { content: "New folder", onAction: () => setFolderModalOpen(true) },
      ]}
    >
      <input ref={fileInputRef} type="file" accept="image/*,.pdf,.svg" multiple style={{ display: "none" }}
        onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }} />
      <input ref={folderInputRef} type="file" accept="image/*,.pdf,.svg" multiple
        // @ts-ignore
        webkitdirectory="" directory="" style={{ display: "none" }}
        onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }} />

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 9998, background: "#111", color: "#fff", padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, pointerEvents: "none" }}>
          {toast}
        </div>
      )}

      {lightboxItem && <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* ── Sidebar ── */}
        <div style={{ width: 190, flexShrink: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 8px" }}>
          <BlockStack gap="050">
            {/* All media */}
            <button type="button" onClick={() => setCurrentFolder(null)}
              style={{ width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 6, background: currentFolder === null ? "#f0f4ff" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: currentFolder === null ? 600 : 400 }}
            >
              All media <span style={{ color: "#9ca3af", fontWeight: 400 }}>({items.length})</span>
            </button>

            {allFolders.length > 0 && <div style={{ height: 1, background: "#f3f4f6", margin: "6px 0" }} />}

            {allFolders.map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "center" }}>
                <button type="button" onClick={() => setCurrentFolder(f)}
                  style={{ flex: 1, textAlign: "left", padding: "7px 10px", border: "none", borderRadius: 6, background: currentFolder === f ? "#f0f4ff" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: currentFolder === f ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  📁 {f} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({items.filter((i) => i.folder === f).length})</span>
                </button>
                <button type="button" onClick={() => handleDeleteFolder(f)} title="Delete folder"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 14, padding: "2px 6px", flexShrink: 0 }}
                  onMouseEnter={(e) => e.target.style.color = "#ef4444"}
                  onMouseLeave={(e) => e.target.style.color = "#d1d5db"}
                >×</button>
              </div>
            ))}

            <div style={{ height: 1, background: "#f3f4f6", margin: "6px 0" }} />
            <button type="button" onClick={() => setFolderModalOpen(true)}
              style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: "1px dashed #d1d5db", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 12, color: "#6b7280" }}
            >+ New folder</button>
            <button type="button" onClick={() => folderInputRef.current?.click()}
              style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: "1px dashed #d1d5db", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 12, color: "#6b7280" }}
            >📂 Upload folder</button>
          </BlockStack>
        </div>

        {/* ── Main ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {error && (
            <Box paddingBlockEnd="300">
              <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>
            </Box>
          )}

          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text as="p" variant="bodySm" tone="subdued">
              {loading ? "Loading…" : `${visibleItems.length} item${visibleItems.length !== 1 ? "s" : ""}${currentFolder ? ` — ${currentFolder}` : ""}`}
            </Text>
            <div style={{ display: "flex", gap: 4 }}>
              <button type="button" onClick={() => setViewMode("grid")} title="Grid view"
                style={{ padding: "5px 8px", border: `1px solid ${viewMode === "grid" ? "#111" : "#e0e0e0"}`, borderRadius: 4, background: viewMode === "grid" ? "#111" : "#fff", color: viewMode === "grid" ? "#fff" : "#374151", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
              >⊞</button>
              <button type="button" onClick={() => setViewMode("list")} title="List view"
                style={{ padding: "5px 8px", border: `1px solid ${viewMode === "list" ? "#111" : "#e0e0e0"}`, borderRadius: 4, background: viewMode === "list" ? "#111" : "#fff", color: viewMode === "list" ? "#fff" : "#374151", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
              >☰</button>
            </div>
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spinner /></div>
          ) : visibleItems.length === 0 ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); uploadFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: "2px dashed #d1d5db", borderRadius: 12, padding: 48, textAlign: "center", color: "#9ca3af", cursor: "pointer" }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
              <Text as="p" tone="subdued">Drop images here or click to upload</Text>
            </div>
          ) : viewMode === "grid" ? (
            /* ── Grid view ── */
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); uploadFiles(e.dataTransfer.files); }}
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}
            >
              {visibleItems.map((item) => {
                const url = resolveUrl(item.url);
                const img = isImage(item);
                return (
                  <div key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
                    {/* Thumbnail — natural aspect ratio, not cropped */}
                    <div
                      onClick={() => img && setLightboxItem(item)}
                      style={{ width: "100%", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", cursor: img ? "pointer" : "default", minHeight: 120, maxHeight: 180, overflow: "hidden" }}
                    >
                      {img ? (
                        <img src={url} alt={item.alt || item.filename || ""} style={{ width: "100%", height: "auto", display: "block", objectFit: "contain" }} loading="lazy" />
                      ) : (
                        <span style={{ fontSize: 36, padding: 24 }}>📄</span>
                      )}
                    </div>
                    {/* Info */}
                    <div style={{ padding: "7px 8px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.filename}>
                        {item.filename || "—"}
                      </div>
                      {item.folder && <div style={{ fontSize: 10, color: "#9ca3af" }}>📁 {item.folder}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                        <span style={{ fontSize: 10, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={url}>
                          {url.length > 28 ? `…${url.slice(-26)}` : url}
                        </span>
                        <CopyBtn url={url} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: "#d1d5db" }}>{formatSize(item.size)}</span>
                        <button type="button" onClick={() => setDeleteTarget(item)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 11, padding: "1px 0" }}
                          onMouseEnter={(e) => e.target.style.color = "#ef4444"}
                          onMouseLeave={(e) => e.target.style.color = "#9ca3af"}
                        >Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── List view ── */
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
              {visibleItems.map((item, idx) => {
                const url = resolveUrl(item.url);
                const img = isImage(item);
                return (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: idx < visibleItems.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    {/* Thumb */}
                    <div onClick={() => img && setLightboxItem(item)}
                      style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 6, overflow: "hidden", background: "#f9fafb", cursor: img ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {img ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" /> : <span style={{ fontSize: 20 }}>📄</span>}
                    </div>
                    {/* Name + folder */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.filename || "—"}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{item.folder ? `📁 ${item.folder} · ` : ""}{formatSize(item.size)}</div>
                    </div>
                    {/* URL */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: 260 }}>
                      <span style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={url}>{url}</span>
                      <CopyBtn url={url} />
                    </div>
                    {/* Delete */}
                    <button type="button" onClick={() => setDeleteTarget(item)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 12, flexShrink: 0, padding: "4px 6px" }}
                      onMouseEnter={(e) => e.target.style.color = "#ef4444"}
                      onMouseLeave={(e) => e.target.style.color = "#9ca3af"}
                    >Delete</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* New folder modal */}
      <Modal open={folderModalOpen} onClose={() => { setFolderModalOpen(false); setNewFolderName(""); }}
        title="New folder"
        primaryAction={{ content: "Create", onAction: handleCreateFolder, loading: folderSaving, disabled: !newFolderName.trim() }}
        secondaryActions={[{ content: "Cancel", onAction: () => { setFolderModalOpen(false); setNewFolderName(""); } }]}
      >
        <Modal.Section>
          <TextField label="Folder name" value={newFolderName} onChange={setNewFolderName}
            placeholder="e.g. Products, Banners" autoComplete="off"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateFolder(); } }} />
        </Modal.Section>
      </Modal>

      {/* Add by URL modal */}
      <Modal open={urlModalOpen} onClose={() => { setUrlModalOpen(false); setUrlInput(""); setUrlFolder(""); }}
        title="Add images by URL"
        primaryAction={{ content: "Add", onAction: handleAddByUrl, loading: urlSaving, disabled: !urlInput.trim() }}
        secondaryActions={[{ content: "Cancel", onAction: () => { setUrlModalOpen(false); setUrlInput(""); setUrlFolder(""); } }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField label="Image URL(s)" value={urlInput} onChange={setUrlInput}
              placeholder={"https://example.com/image.jpg\nhttps://example.com/image2.jpg"}
              multiline={5} autoComplete="off"
              helpText="One URL per line (or comma-separated). Must start with http:// or https://" />
            <TextField label="Add to folder (optional)" value={urlFolder} onChange={setUrlFolder}
              placeholder="Leave empty for root" autoComplete="off" />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete file?"
        primaryAction={{ content: "Delete", destructive: true, onAction: handleDelete }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteTarget(null) }]}
      >
        <Modal.Section>
          <Text as="p">{deleteTarget ? `"${deleteTarget.filename || deleteTarget.id}" will be permanently deleted.` : ""}</Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
