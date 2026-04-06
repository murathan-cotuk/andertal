"use client";

/**
 * MediaPickerModal — shared media picker used everywhere in sellercentral.
 *
 * Props:
 *   open        boolean
 *   onClose     () => void
 *   onSelect    (urls: string[]) => void   — called with selected URL(s) when "Apply" is clicked
 *   multiple    boolean  default false — allow multiple selection
 *   title       string   modal title
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Text,
  Button,
  TextField,
  BlockStack,
  Box,
  Divider,
  Thumbnail,
  DropZone,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const BACKEND_URL = (
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || ""
    : ""
).replace(/\/$/, "");

function resolveUrl(url) {
  if (!url || typeof url !== "string") return "";
  const u = url.trim();
  if (u.startsWith("http") || u.startsWith("data:")) return u;
  return `${BACKEND_URL}${u.startsWith("/") ? "" : "/"}${u}`;
}

export default function MediaPickerModal({
  open,
  onClose,
  onSelect,
  multiple = false,
  title = "Select media",
  onUploadingChange,
}) {
  const client = getMedusaAdminClient();

  const [library, setLibrary] = useState([]);
  const [loadingLib, setLoadingLib] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState(new Set()); // Set of resolved URLs
  const [urlInput, setUrlInput] = useState("");

  // Load library when opened (always refetch so visibility matches current user)
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setUrlInput("");
    setLoadingLib(true);
    client
      .getMedia({ limit: 1000 })
      .then((r) => setLibrary(r.media || []))
      .catch(() => setLibrary([]))
      .finally(() => setLoadingLib(false));
  }, [open, client]);

  const toggle = (url) => {
    const resolved = resolveUrl(url);
    if (multiple) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(resolved) ? next.delete(resolved) : next.add(resolved);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set();
        if (!prev.has(resolved)) next.add(resolved);
        return next;
      });
    }
  };

  const handleUpload = useCallback(
    (files) => {
      const list = Array.isArray(files) ? files : [files];
      if (!list.length) return;
      setUploading(true);
      onUploadingChange?.(true);
      Promise.all(
        list.map((file) => {
          const fd = new FormData();
          fd.append("file", file);
          return client.uploadMedia(fd).then((r) => r.url || null);
        })
      )
        .then((urls) => {
          const valid = urls.filter(Boolean);
          const newItems = valid.map((u, i) => ({
            id: `up-${Date.now()}-${i}`,
            url: u,
            filename: u.split("/").pop(),
          }));
          setLibrary((prev) => [...newItems, ...prev]);
          // Auto-select first uploaded
          if (valid.length) {
            const resolved = resolveUrl(valid[0]);
            setSelected((prev) => {
              if (multiple) {
                const next = new Set(prev);
                valid.forEach((u) => next.add(resolveUrl(u)));
                return next;
              }
              return new Set([resolved]);
            });
          }
        })
        .catch(() => {})
        .finally(() => {
          setUploading(false);
          onUploadingChange?.(false);
        });
    },
    [client, multiple]
  );

  const handleApply = () => {
    // Merge URL input with grid selections
    const urlLines = urlInput
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("http"));

    const all = [...Array.from(selected), ...urlLines.filter((u) => !selected.has(u))];
    if (!all.length) return;
    onSelect(all);
    onClose();
  };

  const canApply = selected.size > 0 || urlInput.trim().startsWith("http");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="large"
    >
      <Modal.Section>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {/* URL input (search-like) */}
            <TextField
              label={multiple ? "URL ile ekle (birden fazla için alt alta gir)" : "URL ile ekle"}
              value={urlInput}
              onChange={setUrlInput}
              placeholder="https://..."
              multiline={multiple ? 3 : 1}
              autoComplete="off"
              helpText={multiple ? "Her satıra bir URL, veya virgülle ayrılmış" : undefined}
            />
          </div>
          <div style={{ alignSelf: "end", display: "flex", gap: 8, paddingBottom: 2 }}>
            <Button variant="primary" onClick={handleApply} disabled={!canApply || uploading}>
              Save
            </Button>
            <Button onClick={onClose} disabled={uploading}>
              Discard
            </Button>
          </div>
        </div>

        <Divider />
        <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
          Medya kütüphanesinden seç
        </Text>
      </Modal.Section>

      <Modal.Section>
        {uploading && (
          <Box paddingBlockEnd="300">
            <Text as="p" variant="bodySm" tone="subdued">Yükleniyor…</Text>
          </Box>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
            gap: 10,
          }}
        >
          {/* Upload tile */}
          <DropZone
            accept="image/*"
            type="image"
            onDropAccepted={handleUpload}
            allowMultiple={multiple}
          >
            <div
              style={{
                aspectRatio: "1",
                border: "2px dashed var(--p-color-border)",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                cursor: "pointer",
                background: "var(--p-color-bg-fill-secondary)",
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" fill="var(--p-color-icon-subdued)">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5z" />
              </svg>
              <span style={{ fontSize: 10, color: "var(--p-color-text-subdued)" }}>Yükle</span>
            </div>
          </DropZone>

          {/* Library items */}
          {loadingLib
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  style={{ aspectRatio: "1", borderRadius: 8, background: "var(--p-color-bg-fill-secondary)" }}
                />
              ))
            : library.map((item) => {
                const url = item.url ? resolveUrl(item.url) : "";
                if (!url) return null;
                const isSelected = selected.has(url);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.url)}
                    style={{
                      position: "relative",
                      aspectRatio: "1",
                      padding: 0,
                      border: isSelected
                        ? "2.5px solid var(--p-color-border-focus)"
                        : "2px solid transparent",
                      borderRadius: 8,
                      overflow: "hidden",
                      cursor: "pointer",
                      background: "var(--p-color-bg-fill-secondary)",
                      outline: "none",
                    }}
                  >
                    <img
                      src={url}
                      alt={item.alt || item.filename || ""}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    {isSelected && (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "var(--p-color-border-focus)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
        </div>
        {library.length === 0 && !loadingLib && (
          <Box paddingBlockStart="300">
            <Text as="p" tone="subdued">
              Henüz medya yok. Yukarıdaki + kutusuna görsel sürükle ya da tıkla.
            </Text>
          </Box>
        )}
      </Modal.Section>
    </Modal>
  );
}
