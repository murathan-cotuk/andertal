"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
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
  Select,
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

/* ── Copy URL button ── */
function CopyBtn({ url, size = "md" }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e?.stopPropagation();
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  const pad = size === "lg" ? "8px 16px" : "2px 7px";
  const fs = size === "lg" ? 13 : 11;
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied!" : "Copy URL"}
      style={{
        background: copied ? "#16a34a" : size === "lg" ? "#f0fdf4" : "#f3f4f6",
        border: size === "lg" ? "1px solid #bbf7d0" : "none",
        borderRadius: 6,
        padding: pad,
        fontSize: fs,
        fontWeight: 600,
        cursor: "pointer",
        color: copied ? "#fff" : size === "lg" ? "#15803d" : "#374151",
        whiteSpace: "nowrap",
        transition: "background 0.15s",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      {copied ? "✓ Copied!" : size === "lg" ? "📋 Copy URL" : "Copy URL"}
    </button>
  );
}

/* ── Lightbox / Detail panel ── */
function DetailPanel({ item, folders, onClose, onDelete, onMoveToFolder, isSuperuser }) {
  const [movingFolderId, setMovingFolderId] = useState(item.folder_id || "");
  const [saving, setSaving] = useState(false);
  const url = resolveUrl(item.url);
  const img = isImage(item);

  useEffect(() => {
    setMovingFolderId(item.folder_id || "");
  }, [item.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleMove = async () => {
    setSaving(true);
    try {
      await onMoveToFolder(item.id, movingFolderId || null);
    } finally {
      setSaving(false);
    }
  };

  const folderOptions = [
    { label: "— No folder (root) —", value: "" },
    ...folders.map((f) => ({ label: `📁 ${f.name}`, value: f.id })),
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.35)" }}
      />
      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 401,
          width: 360,
          background: "#fff",
          boxShadow: "-4px 0 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #f0f0f0" }}>
          <Text as="h3" variant="headingSm">Media details</Text>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280", lineHeight: 1, padding: 2 }}
            aria-label="Close"
          >×</button>
        </div>

        {/* Preview */}
        <div style={{ background: "#f9fafb", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 220, maxHeight: 300, overflow: "hidden" }}>
          {img ? (
            <img
              src={url}
              alt={item.alt || item.filename || ""}
              style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain", display: "block" }}
            />
          ) : (
            <span style={{ fontSize: 64 }}>📄</span>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px" }}>
          <BlockStack gap="400">
            {/* Filename */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Filename</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", wordBreak: "break-all" }}>{item.filename || "—"}</div>
            </div>

            {isSuperuser ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Seller / store</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
                  {item.seller_id ? (item.seller_store_name || item.seller_id) : "Platform / admin"}
                </div>
              </div>
            ) : null}

            {/* Metadata row */}
            <div style={{ display: "flex", gap: 16 }}>
              {item.size ? (
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>Size</div>
                  <div style={{ fontSize: 13, color: "#374151" }}>{formatSize(item.size)}</div>
                </div>
              ) : null}
              {item.mime_type ? (
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>Type</div>
                  <div style={{ fontSize: 13, color: "#374151" }}>{item.mime_type}</div>
                </div>
              ) : null}
              {item.created_at ? (
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>Added</div>
                  <div style={{ fontSize: 13, color: "#374151" }}>{new Date(item.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                </div>
              ) : null}
            </div>

            {/* URL */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>URL</div>
              <div style={{
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 11,
                color: "#6b7280",
                wordBreak: "break-all",
                marginBottom: 8,
                lineHeight: 1.5,
              }}>{url}</div>
              <CopyBtn url={url} size="lg" />
            </div>

            {/* Move to folder */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Folder</div>
              <Select
                label=""
                labelHidden
                options={folderOptions}
                value={movingFolderId}
                onChange={setMovingFolderId}
              />
              <div style={{ marginTop: 8 }}>
                <Button
                  size="slim"
                  onClick={handleMove}
                  loading={saving}
                  disabled={movingFolderId === (item.folder_id || "")}
                >
                  Move to folder
                </Button>
              </div>
            </div>
          </BlockStack>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 18px", borderTop: "1px solid #f0f0f0" }}>
          <button
            type="button"
            onClick={() => onDelete(item)}
            style={{
              width: "100%",
              padding: "9px 0",
              background: "none",
              border: "1px solid #fca5a5",
              borderRadius: 6,
              color: "#dc2626",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.target.style.background = "#fef2f2"; }}
            onMouseLeave={(e) => { e.target.style.background = "none"; }}
          >
            🗑 Delete file
          </button>
        </div>
      </div>
    </>
  );
}

export default function MediaPage() {
  const client = getMedusaAdminClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [rawMedia, setRawMedia] = useState([]);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [sellerFilter, setSellerFilter] = useState(""); // "" = all, "__null" = platform-only, else seller_id
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null); // null=all, {id,name}=folder, "none"=no folder
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // "3/10"
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [viewMode, setViewMode] = useState("grid");

  // Detail panel
  const [activeItem, setActiveItem] = useState(null);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selecting, setSelecting] = useState(false); // selection mode

  // Modals
  const [deleteTarget, setDeleteTarget] = useState(null); // single or "bulk"
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderSaving, setFolderSaving] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlFolderId, setUrlFolderId] = useState("");
  const [urlSaving, setUrlSaving] = useState(false);
  const [bulkMoveModalOpen, setBulkMoveModalOpen] = useState(false);
  const [bulkMoveFolderId, setBulkMoveFolderId] = useState("");
  const [bulkMoving, setBulkMoving] = useState(false);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  useEffect(() => {
    setIsSuperuser(typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  useEffect(() => {
    // Superuser defaults to platform scope to avoid mixing seller media/folders.
    if (isSuperuser && !sellerFilter) setSellerFilter("__null");
  }, [isSuperuser, sellerFilter]);

  const items = useMemo(() => {
    if (!isSuperuser || !sellerFilter) return rawMedia;
    if (sellerFilter === "__null") return rawMedia.filter((i) => !i.seller_id);
    return rawMedia.filter((i) => i.seller_id === sellerFilter);
  }, [rawMedia, isSuperuser, sellerFilter]);

  const visibleFolders = useMemo(() => {
    if (!isSuperuser || !sellerFilter) return folders;
    if (sellerFilter === "__null") return folders.filter((f) => !f.seller_id);
    return folders.filter((f) => f.seller_id === sellerFilter);
  }, [folders, isSuperuser, sellerFilter]);

  const sellerBuckets = useMemo(() => {
    const map = new Map();
    for (const i of rawMedia) {
      const sid = i.seller_id;
      if (!sid) {
        if (!map.has("__null")) map.set("__null", { key: "__null", label: "Platform / admin", count: 0 });
        map.get("__null").count++;
      } else {
        if (!map.has(sid)) {
          const label = (i.seller_store_name || "").trim() || sid;
          map.set(sid, { key: sid, label, count: 0 });
        }
        map.get(sid).count++;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rawMedia]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [mediaRes, foldersRes] = await Promise.all([
        client.getMedia({ limit: 1000 }),
        client.getMediaFolders().catch(() => ({ folders: [] })),
      ]);
      setRawMedia(mediaRes.media || []);
      setFolders(foldersRes.folders || []);
    } catch (err) {
      setError(err?.message || "Failed to load media");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Sync currentFolder from URL when folders are loaded
  useEffect(() => {
    const param = searchParams.get("folder");
    if (!param) {
      setCurrentFolder(null);
    } else if (param === "none") {
      setCurrentFolder("none");
    } else {
      const found = folders.find((f) => f.id === param);
      if (found) setCurrentFolder(found);
    }
  }, [folders, searchParams]);

  useEffect(() => {
    if (currentFolder && currentFolder !== "none" && !visibleFolders.some((f) => f.id === currentFolder.id)) {
      setCurrentFolder(null);
    }
  }, [currentFolder, visibleFolders]);

  /* ── Navigate to folder (updates URL + state) ── */
  const navigateToFolder = useCallback((folder) => {
    if (folder === null) {
      router.replace(pathname, {});
      setCurrentFolder(null);
    } else if (folder === "none") {
      router.replace(`${pathname}?folder=none`, {});
      setCurrentFolder("none");
    } else {
      router.replace(`${pathname}?folder=${folder.id}`, {});
      setCurrentFolder(folder);
    }
    setSelectedIds(new Set());
    setSelecting(false);
    setActiveItem(null);
  }, [router, pathname]);

  /* ── Filtering ── */
  const visibleItems =
    currentFolder === null
      ? items
      : currentFolder === "none"
      ? items.filter((i) => !i.folder_id)
      : items.filter((i) => i.folder_id === currentFolder.id);

  // Pending upload state for duplicate handling
  const [pendingUpload, setPendingUpload] = useState(null); // {files, folderId, dups}
  const [dupAction, setDupAction] = useState("keep_both"); // "keep_both" | "skip" | "replace"

  /* ── Core upload: uploads files and then PATCHes folder_id (two-step, reliable) ── */
  const doUpload = async (arr, folderId) => {
    if (!arr?.length) return;
    setUploading(true);
    let done = 0;
    setUploadProgress(`0/${arr.length}`);
    try {
      await Promise.all(
        arr.map(async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          const result = await client.uploadMedia(fd);
          // Two-step: PATCH with folder_id after upload (reliable regardless of multipart field order)
          if (folderId && result?.id) {
            await client.updateMedia(result.id, { folder_id: folderId }).catch(() => {});
          }
          done++;
          setUploadProgress(`${done}/${arr.length}`);
        })
      );
      showToast(`${arr.length} file${arr.length > 1 ? "s" : ""} uploaded`);
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  /* ── Upload files: checks duplicates first ── */
  const uploadFiles = async (files, forceFolderId) => {
    if (!files?.length) return;
    const arr = Array.from(files);
    const fid = forceFolderId ?? (typeof currentFolder === "object" && currentFolder ? currentFolder.id : null);

    // Check for duplicate filenames
    const existingNames = new Set(items.map((i) => i.filename));
    const dups = arr.filter((f) => existingNames.has(f.name));
    if (dups.length > 0) {
      setPendingUpload({ files: arr, folderId: fid, dups });
      setDupAction("keep_both");
      return; // modal will handle it
    }

    await doUpload(arr, fid);
  };

  /* ── Confirm duplicate upload ── */
  const confirmDupUpload = async () => {
    if (!pendingUpload) return;
    const { files, folderId, dups } = pendingUpload;
    setPendingUpload(null);
    const dupNames = new Set(dups.map((f) => f.name));

    if (dupAction === "skip") {
      await doUpload(files.filter((f) => !dupNames.has(f.name)), folderId);
    } else if (dupAction === "replace") {
      // Delete existing items with duplicate names, then upload all
      const toDelete = items.filter((i) => dupNames.has(i.filename));
      await Promise.all(toDelete.map((i) => client.deleteMedia(i.id).catch(() => {})));
      await doUpload(files, folderId);
    } else {
      // keep_both: upload all
      await doUpload(files, folderId);
    }
  };

  /* ── Upload folder (creates folder by dirname, then uploads inside) ── */
  const uploadFolder = async (files) => {
    if (!files?.length) return;
    const arr = Array.from(files);
    const topFolder = arr[0]?.webkitRelativePath?.split("/")?.[0];
    if (!topFolder) return uploadFiles(arr);

    setUploading(true);
    setUploadProgress("Creating folder…");
    try {
      let folderId = null;
      const existing = folders.find((f) => f.name === topFolder);
      if (existing) {
        folderId = existing.id;
      } else {
        const res = await client.createMediaFolder(topFolder);
        folderId = res.folder?.id || null;
      }
      let done = 0;
      setUploadProgress(`0/${arr.length}`);
      await Promise.all(
        arr.map(async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          const result = await client.uploadMedia(fd);
          if (folderId && result?.id) {
            await client.updateMedia(result.id, { folder_id: folderId }).catch(() => {});
          }
          done++;
          setUploadProgress(`${done}/${arr.length}`);
        })
      );
      showToast(`Folder "${topFolder}" uploaded with ${arr.length} file${arr.length > 1 ? "s" : ""}`);
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Folder upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  /* ── Add by URL ── */
  const handleAddByUrl = async () => {
    const lines = urlInput.split(/[\n,]/).map((s) => s.trim()).filter((s) => s.startsWith("http"));
    if (!lines.length) return;
    setUrlSaving(true);
    try {
      await Promise.all(
        lines.map((url) =>
          client.registerMediaUrl({
            url,
            folder_id: urlFolderId || (typeof currentFolder === "object" && currentFolder ? currentFolder.id : undefined),
          })
        )
      );
      showToast(`${lines.length} URL${lines.length > 1 ? "s" : ""} added`);
      setUrlModalOpen(false);
      setUrlInput("");
      setUrlFolderId("");
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Failed to add URLs");
    } finally {
      setUrlSaving(false);
    }
  };

  /* ── Create folder ── */
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

  /* ── Delete single ── */
  const handleDeleteSingle = async () => {
    if (!deleteTarget || deleteTarget === "bulk") return;
    try {
      await client.deleteMedia(deleteTarget.id);
      showToast("Deleted");
      setDeleteTarget(null);
      if (activeItem?.id === deleteTarget.id) setActiveItem(null);
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Delete failed");
    }
  };

  /* ── Delete bulk ── */
  const handleDeleteBulk = async () => {
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map((id) => client.deleteMedia(id)));
      showToast(`${ids.length} item${ids.length > 1 ? "s" : ""} deleted`);
      setSelectedIds(new Set());
      setSelecting(false);
      setDeleteTarget(null);
      if (activeItem && ids.includes(activeItem.id)) setActiveItem(null);
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Bulk delete failed");
    }
  };

  /* ── Move to folder (single from detail panel) ── */
  const handleMoveToFolder = async (itemId, folderId) => {
    try {
      await client.updateMedia(itemId, { folder_id: folderId || null });
      showToast("Moved");
      // Update local state too
      setRawMedia((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                folder_id: folderId || null,
                folder_name: folderId ? folders.find((f) => f.id === folderId)?.name || null : null,
              }
            : i
        )
      );
      setActiveItem((prev) =>
        prev?.id === itemId
          ? {
              ...prev,
              folder_id: folderId || null,
              folder_name: folderId ? folders.find((f) => f.id === folderId)?.name || null : null,
            }
          : prev
      );
    } catch (err) {
      setError(err?.message || "Move failed");
    }
  };

  /* ── Bulk move to folder ── */
  const handleBulkMove = async () => {
    const ids = [...selectedIds];
    setBulkMoving(true);
    try {
      await Promise.all(ids.map((id) => client.updateMedia(id, { folder_id: bulkMoveFolderId || null })));
      showToast(`${ids.length} item${ids.length > 1 ? "s" : ""} moved`);
      setSelectedIds(new Set());
      setSelecting(false);
      setBulkMoveModalOpen(false);
      setBulkMoveFolderId("");
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Bulk move failed");
    } finally {
      setBulkMoving(false);
    }
  };

  /* ── Delete folder ── */
  const handleDeleteFolder = async (folder) => {
    if (!confirm(`Delete folder "${folder.name}"? Files will stay in root.`)) return;
    try {
      await client.deleteMediaFolder(folder.id);
      if (currentFolder?.id === folder.id) navigateToFolder(null);
      showToast(`Folder "${folder.name}" deleted`);
      await fetchAll();
    } catch (err) {
      setError(err?.message || "Failed to delete folder");
    }
  };

  /* ── Selection helpers ── */
  const toggleSelect = (id, e) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!selecting) setSelecting(true);
  };

  const selectAll = () => {
    setSelectedIds(new Set(visibleItems.map((i) => i.id)));
    setSelecting(true);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelecting(false);
  };

  /* ── Drag-and-drop ── */
  const handleDrop = (e) => {
    e.preventDefault();
    uploadFiles(e.dataTransfer.files);
  };

  const folderSelectOptions = [
    { label: "— No folder (root) —", value: "" },
    ...folders.map((f) => ({ label: `📁 ${f.name}`, value: f.id })),
  ];

  const isAnySelected = selectedIds.size > 0;

  return (
    <Page
      title="Media"
      primaryAction={{
        content: uploading
          ? uploadProgress
            ? `Uploading ${uploadProgress}…`
            : "Uploading…"
          : "Upload files",
        onAction: () => fileInputRef.current?.click(),
        loading: uploading,
      }}
      secondaryActions={[
        { content: "Add by URL", onAction: () => { setUrlFolderId(typeof currentFolder === "object" && currentFolder ? currentFolder.id : ""); setUrlModalOpen(true); } },
        { content: "New folder", onAction: () => setFolderModalOpen(true) },
        { content: "Upload folder", onAction: () => folderInputRef.current?.click() },
      ]}
    >
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.svg"
        multiple
        style={{ display: "none" }}
        onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={folderInputRef}
        type="file"
        accept="image/*,.pdf,.svg"
        multiple
        // @ts-ignore
        webkitdirectory=""
        directory=""
        style={{ display: "none" }}
        onChange={(e) => { uploadFolder(e.target.files); e.target.value = ""; }}
      />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 9998, background: "#111", color: "#fff", padding: "10px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, pointerEvents: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}

      {error && (
        <Box paddingBlockEnd="300">
          <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>
        </Box>
      )}

      {/* Bulk actions bar */}
      {isAnySelected && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 16px", marginBottom: 16, flexWrap: "wrap" }}>
          <Text as="span" variant="bodyMd" fontWeight="semibold">{selectedIds.size} selected</Text>
          <button
            type="button"
            onClick={() => { setBulkMoveFolderId(""); setBulkMoveModalOpen(true); }}
            style={{ padding: "5px 12px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}
          >
            📁 Move to folder
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget("bulk")}
            style={{ padding: "5px 12px", background: "#fff", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 500, color: "#dc2626" }}
          >
            🗑 Delete selected
          </button>
          <button
            type="button"
            onClick={selectAll}
            style={{ padding: "5px 12px", background: "none", border: "none", fontSize: 12, cursor: "pointer", color: "#6b7280" }}
          >
            Select all ({visibleItems.length})
          </button>
          <button
            type="button"
            onClick={clearSelection}
            style={{ marginLeft: "auto", padding: "4px 8px", background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#9ca3af" }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

        {/* ── Sidebar ── */}
        <div style={{ width: 200, flexShrink: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 8px", position: "sticky", top: 16 }}>
          {isSuperuser && sellerBuckets.length > 0 ? (
            <>
              <div style={{ marginBottom: 6, padding: "0 4px" }}>
                <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">SELLERS</Text>
              </div>
              <BlockStack gap="050">
                <button
                  type="button"
                  onClick={() => setSellerFilter("__null")}
                  style={{ width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 6, background: sellerFilter === "__null" ? "#fef3c7" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: sellerFilter === "__null" ? 600 : 400, color: sellerFilter === "__null" ? "#b45309" : "#374151" }}
                >
                  Platform / admin <span style={{ color: "#9ca3af", fontWeight: 400 }}>({rawMedia.filter((i) => !i.seller_id).length})</span>
                </button>
                {sellerBuckets.map((b) => (
                  b.key === "__null" ? null : (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setSellerFilter(b.key)}
                    style={{ width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 6, background: sellerFilter === b.key ? "#fef3c7" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: sellerFilter === b.key ? 600 : 400, color: sellerFilter === b.key ? "#b45309" : "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={b.label}
                  >
                    🏪 {b.label} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({b.count})</span>
                  </button>
                  )
                ))}
              </BlockStack>
              <div style={{ height: 1, background: "#f0f0f0", margin: "12px 0" }} />
            </>
          ) : null}
          <div style={{ marginBottom: 6, padding: "0 4px" }}>
            <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">FOLDERS</Text>
          </div>
          <BlockStack gap="050">
            <button
              type="button"
              onClick={() => navigateToFolder(null)}
              style={{ width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 6, background: currentFolder === null ? "#eff6ff" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: currentFolder === null ? 600 : 400, color: currentFolder === null ? "#1d4ed8" : "#374151" }}
            >
              🗂 All media <span style={{ color: "#9ca3af", fontWeight: 400 }}>({items.length})</span>
            </button>
            <button
              type="button"
              onClick={() => navigateToFolder("none")}
              style={{ width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 6, background: currentFolder === "none" ? "#eff6ff" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: currentFolder === "none" ? 600 : 400, color: currentFolder === "none" ? "#1d4ed8" : "#374151" }}
            >
              📄 Without folder <span style={{ color: "#9ca3af", fontWeight: 400 }}>({items.filter((i) => !i.folder_id).length})</span>
            </button>

            {visibleFolders.length > 0 && (
              <div style={{ height: 1, background: "#f0f0f0", margin: "6px 0" }} />
            )}

            {visibleFolders.map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  type="button"
                  onClick={() => navigateToFolder(f)}
                  style={{ flex: 1, textAlign: "left", padding: "7px 10px", border: "none", borderRadius: 6, background: currentFolder?.id === f.id ? "#eff6ff" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: currentFolder?.id === f.id ? 600 : 400, color: currentFolder?.id === f.id ? "#1d4ed8" : "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  📁 {f.name} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({items.filter((i) => i.folder_id === f.id).length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteFolder(f)}
                  title={`Delete folder "${f.name}"`}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 14, padding: "2px 5px", flexShrink: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#d1d5db"; }}
                >×</button>
              </div>
            ))}

            <div style={{ height: 1, background: "#f0f0f0", margin: "6px 0" }} />
            <button
              type="button"
              onClick={() => setFolderModalOpen(true)}
              style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: "1px dashed #d1d5db", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 12, color: "#6b7280" }}
            >+ New folder</button>
          </BlockStack>
        </div>

        {/* ── Main content ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Text as="p" variant="bodySm" tone="subdued">
                {loading ? "Loading…" : `${visibleItems.length} item${visibleItems.length !== 1 ? "s" : ""}${currentFolder && currentFolder !== "none" ? ` in ${currentFolder.name}` : ""}`}
              </Text>
              {!isAnySelected && visibleItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setSelecting(true); setSelectedIds(new Set()); }}
                  style={{ fontSize: 12, color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}
                >
                  Select
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                title="Grid view"
                style={{ padding: "5px 9px", border: `1px solid ${viewMode === "grid" ? "#111" : "#e0e0e0"}`, borderRadius: 4, background: viewMode === "grid" ? "#111" : "#fff", color: viewMode === "grid" ? "#fff" : "#374151", cursor: "pointer", fontSize: 14 }}
              >⊞</button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                title="List view"
                style={{ padding: "5px 9px", border: `1px solid ${viewMode === "list" ? "#111" : "#e0e0e0"}`, borderRadius: 4, background: viewMode === "list" ? "#111" : "#fff", color: viewMode === "list" ? "#fff" : "#374151", cursor: "pointer", fontSize: 14 }}
              >☰</button>
            </div>
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
              <Spinner />
            </div>
          ) : visibleItems.length === 0 ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: "2px dashed #d1d5db", borderRadius: 12, padding: 56, textAlign: "center", color: "#9ca3af", cursor: "pointer" }}
            >
              <div style={{ fontSize: 40, marginBottom: 10 }}>🖼️</div>
              <Text as="p" tone="subdued">Drop files here or click to upload</Text>
            </div>
          ) : viewMode === "grid" ? (
            /* ── Grid ── */
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}
            >
              {visibleItems.map((item) => {
                const url = resolveUrl(item.url);
                const img = isImage(item);
                const checked = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (selecting || isAnySelected) {
                        toggleSelect(item.id);
                      } else {
                        setActiveItem(item);
                      }
                    }}
                    style={{
                      border: `2px solid ${checked ? "#3b82f6" : "#e5e7eb"}`,
                      borderRadius: 10,
                      overflow: "hidden",
                      background: "#fff",
                      cursor: "pointer",
                      position: "relative",
                      transition: "border-color 0.1s, box-shadow 0.1s",
                      boxShadow: checked ? "0 0 0 3px #bfdbfe" : "none",
                    }}
                    onMouseEnter={(e) => { if (!checked) e.currentTarget.style.borderColor = "#93c5fd"; }}
                    onMouseLeave={(e) => { if (!checked) e.currentTarget.style.borderColor = "#e5e7eb"; }}
                  >
                    {/* Checkbox */}
                    <div
                      onClick={(e) => toggleSelect(item.id, e)}
                      style={{
                        position: "absolute",
                        top: 6,
                        left: 6,
                        zIndex: 10,
                        width: 20,
                        height: 20,
                        background: checked ? "#3b82f6" : "rgba(255,255,255,0.85)",
                        border: `2px solid ${checked ? "#3b82f6" : "#d1d5db"}`,
                        borderRadius: 5,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      {checked && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                    </div>

                    {/* Thumbnail */}
                    <div style={{ width: "100%", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 110, maxHeight: 150, overflow: "hidden" }}>
                      {img ? (
                        <img
                          src={url}
                          alt={item.alt || item.filename || ""}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 110, maxHeight: 150 }}
                          loading="lazy"
                        />
                      ) : (
                        <span style={{ fontSize: 36, padding: 24 }}>📄</span>
                      )}
                    </div>

                    {/* Name */}
                    <div style={{ padding: "6px 8px", borderTop: "1px solid #f3f4f6" }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.filename}>
                        {item.filename || "—"}
                      </div>
                      {item.folder_name && (
                        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>📁 {item.folder_name}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── List ── */
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}
            >
              {visibleItems.map((item, idx) => {
                const url = resolveUrl(item.url);
                const img = isImage(item);
                const checked = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 16px",
                      borderBottom: idx < visibleItems.length - 1 ? "1px solid #f3f4f6" : "none",
                      background: checked ? "#eff6ff" : "transparent",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      if (selecting || isAnySelected) toggleSelect(item.id);
                      else setActiveItem(item);
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      onClick={(e) => toggleSelect(item.id, e)}
                      style={{
                        width: 18,
                        height: 18,
                        flexShrink: 0,
                        background: checked ? "#3b82f6" : "#fff",
                        border: `2px solid ${checked ? "#3b82f6" : "#d1d5db"}`,
                        borderRadius: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      {checked && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                    </div>
                    {/* Thumb */}
                    <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 6, overflow: "hidden", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {img ? (
                        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
                      ) : (
                        <span style={{ fontSize: 18 }}>📄</span>
                      )}
                    </div>
                    {/* Name + folder */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.filename || "—"}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>
                        {item.folder_name ? `📁 ${item.folder_name} · ` : ""}
                        {formatSize(item.size)}
                      </div>
                    </div>
                    {/* URL + copy */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: 240 }}>
                      <span style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={url}>
                        {url.length > 30 ? `…${url.slice(-28)}` : url}
                      </span>
                      <CopyBtn url={url} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail panel ── */}
      {activeItem && (
        <DetailPanel
          item={activeItem}
          folders={folders}
          isSuperuser={isSuperuser}
          onClose={() => setActiveItem(null)}
          onDelete={(item) => { setDeleteTarget(item); setActiveItem(null); }}
          onMoveToFolder={handleMoveToFolder}
        />
      )}

      {/* ── Duplicate file modal ── */}
      <Modal
        open={!!pendingUpload}
        onClose={() => setPendingUpload(null)}
        title={`${pendingUpload?.dups?.length || 0} duplicate filename${(pendingUpload?.dups?.length || 0) !== 1 ? "s" : ""} found`}
        primaryAction={{ content: "Continue", onAction: confirmDupUpload }}
        secondaryActions={[{ content: "Cancel", onAction: () => setPendingUpload(null) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">
              The following files already exist in your media library:
            </Text>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "8px 12px", maxHeight: 140, overflowY: "auto" }}>
              {(pendingUpload?.dups || []).map((f) => (
                <div key={f.name} style={{ fontSize: 13, color: "#374151", padding: "2px 0" }}>📄 {f.name}</div>
              ))}
            </div>
            <Text as="p" variant="bodyMd" fontWeight="semibold">What would you like to do?</Text>
            <BlockStack gap="200">
              {[
                { value: "keep_both", label: "Keep both", desc: "Upload anyway — both versions will exist in the library" },
                { value: "replace", label: "Replace", desc: "Delete the existing file and upload the new one" },
                { value: "skip", label: "Skip duplicates", desc: "Only upload files that don't already exist" },
              ].map(({ value, label, desc }) => (
                <label key={value} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "8px 10px", borderRadius: 6, border: `2px solid ${dupAction === value ? "#3b82f6" : "#e5e7eb"}`, background: dupAction === value ? "#eff6ff" : "#fff" }}>
                  <input
                    type="radio"
                    name="dupAction"
                    value={value}
                    checked={dupAction === value}
                    onChange={() => setDupAction(value)}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{label}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{desc}</div>
                  </div>
                </label>
              ))}
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── New folder modal ── */}
      <Modal
        open={folderModalOpen}
        onClose={() => { setFolderModalOpen(false); setNewFolderName(""); }}
        title="New folder"
        primaryAction={{ content: "Create", onAction: handleCreateFolder, loading: folderSaving, disabled: !newFolderName.trim() }}
        secondaryActions={[{ content: "Cancel", onAction: () => { setFolderModalOpen(false); setNewFolderName(""); } }]}
      >
        <Modal.Section>
          <TextField
            label="Folder name"
            value={newFolderName}
            onChange={setNewFolderName}
            placeholder="e.g. Products, Banners"
            autoComplete="off"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateFolder(); } }}
          />
        </Modal.Section>
      </Modal>

      {/* ── Add by URL modal ── */}
      <Modal
        open={urlModalOpen}
        onClose={() => { setUrlModalOpen(false); setUrlInput(""); setUrlFolderId(""); }}
        title="Add images by URL"
        primaryAction={{ content: "Add", onAction: handleAddByUrl, loading: urlSaving, disabled: !urlInput.trim() }}
        secondaryActions={[{ content: "Cancel", onAction: () => { setUrlModalOpen(false); setUrlInput(""); setUrlFolderId(""); } }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField
              label="Image URL(s)"
              value={urlInput}
              onChange={setUrlInput}
              placeholder={"https://example.com/image.jpg\nhttps://example.com/image2.jpg"}
              multiline={4}
              autoComplete="off"
              helpText="One URL per line (or comma-separated). Must start with http://"
            />
            <Select
              label="Add to folder (optional)"
              options={folderSelectOptions}
              value={urlFolderId}
              onChange={setUrlFolderId}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Delete confirm (single) ── */}
      <Modal
        open={!!deleteTarget && deleteTarget !== "bulk"}
        onClose={() => setDeleteTarget(null)}
        title="Delete file?"
        primaryAction={{ content: "Delete", destructive: true, onAction: handleDeleteSingle }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteTarget(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            {deleteTarget && deleteTarget !== "bulk"
              ? `"${deleteTarget.filename || deleteTarget.id}" will be permanently deleted.`
              : ""}
          </Text>
        </Modal.Section>
      </Modal>

      {/* ── Delete confirm (bulk) ── */}
      <Modal
        open={deleteTarget === "bulk"}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${selectedIds.size} file${selectedIds.size !== 1 ? "s" : ""}?`}
        primaryAction={{ content: "Delete all", destructive: true, onAction: handleDeleteBulk }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteTarget(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            {selectedIds.size} file{selectedIds.size !== 1 ? "s" : ""} will be permanently deleted. This cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>

      {/* ── Bulk move modal ── */}
      <Modal
        open={bulkMoveModalOpen}
        onClose={() => setBulkMoveModalOpen(false)}
        title={`Move ${selectedIds.size} file${selectedIds.size !== 1 ? "s" : ""} to folder`}
        primaryAction={{ content: "Move", onAction: handleBulkMove, loading: bulkMoving }}
        secondaryActions={[{ content: "Cancel", onAction: () => setBulkMoveModalOpen(false) }]}
      >
        <Modal.Section>
          <Select
            label="Select destination folder"
            options={folderSelectOptions}
            value={bulkMoveFolderId}
            onChange={setBulkMoveFolderId}
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
