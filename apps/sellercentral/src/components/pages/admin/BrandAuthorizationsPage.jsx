"use client";

import { useState, useEffect } from "react";
import {
  Page,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  Box,
  Badge,
  Divider,
  Modal,
  TextField,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useLocale } from "next-intl";
import { getBrandAuthorizationsPageCopy } from "@/lib/brand-page-i18n";
import { userError } from "@/lib/api-error-messages";

const getDefaultBaseUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").replace(/\/$/, "") ||
  (typeof window !== "undefined" ? "http://localhost:9000" : "");

function BrandAuthCard({ brand, copy, baseUrl, onApprove, onReject, busy }) {
  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("data:")) return url;
    return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  };
  const isReseller = brand.brand_type === "authorized_reseller";

  return (
    <Card padding="400">
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <InlineStack gap="150" blockAlign="center">
              <Text as="p" variant="bodyMd" fontWeight="semibold">{brand.name}</Text>
              <Badge tone="attention">{isReseller ? copy.typeReseller : copy.typeRegistered}</Badge>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">{copy.seller}: {brand.seller_name || brand.seller_id}</Text>
            {brand.created_at && (
              <Text as="p" variant="bodySm" tone="subdued">{copy.submittedOn}: {new Date(brand.created_at).toLocaleString()}</Text>
            )}
          </BlockStack>
          <InlineStack gap="200">
            <Button size="slim" tone="critical" onClick={() => onReject(brand)} disabled={busy}>{copy.reject}</Button>
            <Button size="slim" variant="primary" onClick={() => onApprove(brand)} loading={busy}>{copy.approve}</Button>
          </InlineStack>
        </InlineStack>

        {!isReseller && (brand.trademark_number || brand.trademark_jurisdiction) && (
          <Text as="p" variant="bodySm">
            {copy.trademark}: {brand.trademark_number || "—"} ({brand.trademark_jurisdiction || "—"})
          </Text>
        )}

        <Divider />

        <BlockStack gap="150">
          <Text as="p" variant="bodySm" fontWeight="medium">{copy.documents}</Text>
          {(!brand.documents || brand.documents.length === 0) ? (
            <Text as="p" variant="bodySm" tone="subdued">{copy.noDocuments}</Text>
          ) : (
            <BlockStack gap="100">
              {brand.documents.map((doc) => (
                <InlineStack key={doc.id} gap="200" blockAlign="center">
                  <Text as="span" variant="bodySm">{doc.document_type}{doc.file_name ? ` — ${doc.file_name}` : ""}</Text>
                  <Button size="slim" variant="plain" url={resolveUrl(doc.file_url)} target="_blank">
                    {copy.viewDocument}
                  </Button>
                </InlineStack>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

export default function BrandAuthorizationsPage() {
  const client = getMedusaAdminClient();
  const locale = useLocale();
  const baseUrl = (client.baseURL || getDefaultBaseUrl()).replace(/\/$/, "");
  const copy = getBrandAuthorizationsPageCopy(locale);

  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // brand or null
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const load = () => {
    setLoading(true);
    client.getPendingBrandAuthorizations()
      .then((r) => setBrands(r.brands || []))
      .catch(() => setBrands([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (brand) => {
    setBusyId(brand.id);
    setMessage({ type: "", text: "" });
    try {
      await client.approveBrandAuthorization(brand.id);
      setMessage({ type: "success", text: copy.approved });
      load();
    } catch (e) {
      setMessage({ type: "error", text: userError(e, locale, copy.actionError) });
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (brand) => {
    setRejectTarget(brand);
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    setMessage({ type: "", text: "" });
    try {
      await client.rejectBrandAuthorization(rejectTarget.id, rejectReason.trim());
      setMessage({ type: "success", text: copy.rejected });
      setRejectTarget(null);
      load();
    } catch (e) {
      setMessage({ type: "error", text: userError(e, locale, copy.actionError) });
    } finally {
      setRejecting(false);
    }
  };

  return (
    <Page title={copy.title} subtitle={copy.subtitle}>
      <BlockStack gap="400">
        {message.text && (
          <Banner tone={message.type === "success" ? "success" : "critical"} onDismiss={() => setMessage({ type: "", text: "" })}>
            {message.text}
          </Banner>
        )}

        {loading ? (
          <Card>
            <Box padding="800">
              <Text as="p" tone="subdued">{copy.loading}</Text>
            </Box>
          </Card>
        ) : brands.length === 0 ? (
          <Card>
            <Box padding="800">
              <Text as="p" tone="subdued" alignment="center">{copy.empty}</Text>
            </Box>
          </Card>
        ) : (
          <BlockStack gap="300">
            {brands.map((brand) => (
              <BrandAuthCard
                key={brand.id}
                brand={brand}
                copy={copy}
                baseUrl={baseUrl}
                onApprove={handleApprove}
                onReject={openReject}
                busy={busyId === brand.id}
              />
            ))}
          </BlockStack>
        )}
      </BlockStack>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? `${copy.confirmReject}: ${rejectTarget.name}` : copy.confirmReject}
        primaryAction={{ content: copy.reject, onAction: confirmReject, loading: rejecting, destructive: true }}
        secondaryActions={[{ content: copy.cancel, onAction: () => setRejectTarget(null) }]}
      >
        <Modal.Section>
          <TextField
            label={copy.rejectReasonLabel}
            value={rejectReason}
            onChange={setRejectReason}
            multiline={3}
            autoComplete="off"
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
