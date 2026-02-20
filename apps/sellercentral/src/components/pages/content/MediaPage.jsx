"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  Thumbnail,
  DataTable,
  Modal,
  TextField,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "";

function formatSize(bytes) {
  if (bytes == null || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [altField, setAltField] = useState("");
  const fileInputRef = useRef(null);
  const client = getMedusaAdminClient();

  const fetchMedia = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await client.getMedia({ limit: 100 });
      setItems(data.media || []);
    } catch (err) {
      setError(err?.message || "Failed to load media");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append("file", file);
      if (altField.trim()) formData.append("alt", altField.trim());
      await client.uploadMedia(formData);
      setAltField("");
      await fetchMedia();
    } catch (err) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteRequest = (item) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    try {
      setError(null);
      await client.deleteMedia(itemToDelete.id);
      setDeleteModalOpen(false);
      setItemToDelete(null);
      await fetchMedia();
    } catch (err) {
      setError(err?.message || "Delete failed");
    }
  };

  const fullUrl = (item) => {
    if (!item?.url) return null;
    if (item.url.startsWith("http")) return item.url;
    const base = (BACKEND_URL || "").replace(/\/$/, "");
    return base ? `${base}${item.url}` : item.url;
  };

  const rows = items.map((item) => [
    <Thumbnail
      key={item.id}
      source={fullUrl(item) || ""}
      alt={item.alt || item.filename || ""}
      size="small"
    />,
    item.filename || "—",
    formatSize(item.size),
    item.mime_type || "—",
    item.created_at ? new Date(item.created_at).toLocaleDateString() : "—",
    <Button key={`del-${item.id}`} variant="plain" tone="critical" onClick={() => handleDeleteRequest(item)}>
      Delete
    </Button>,
  ]);

  return (
    <Page
      title="Media Library"
      primaryAction={{
        content: uploading ? "Uploading…" : "Upload",
        onAction: handleUploadClick,
        loading: uploading,
      }}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingSm">
                  All media
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {items.length} {items.length === 1 ? "file" : "files"}
                </Text>
              </InlineStack>

              {loading ? (
                <Box paddingBlock="400">
                  <Text as="p" tone="subdued">
                    Loading…
                  </Text>
                </Box>
              ) : items.length === 0 ? (
                <Box paddingBlock="400">
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">
                      No files yet. Upload images or documents to use in pages and products.
                    </Text>
                    <Button variant="primary" onClick={handleUploadClick}>
                      Upload file
                    </Button>
                  </BlockStack>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                  headings={["Preview", "Filename", "Size", "Type", "Created", "Actions"]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <Modal
        open={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        title="Delete file?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDeleteConfirm,
        }}
      >
        <Modal.Section>
          <Text as="p">
            {itemToDelete ? `Delete "${itemToDelete.filename || itemToDelete.id}"? This cannot be undone.` : ""}
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
