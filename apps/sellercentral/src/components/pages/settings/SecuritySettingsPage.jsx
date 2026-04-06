"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Text,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  Badge,
  Divider,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function formatJoined(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function summarizeUserAgent(ua) {
  if (!ua || typeof ua !== "string") return "Dieses Gerät";
  const u = ua.toLowerCase();
  let os = "Unbekanntes System";
  if (u.includes("windows")) os = "Windows";
  else if (u.includes("mac os") || u.includes("macintosh")) os = "macOS";
  else if (u.includes("linux")) os = "Linux";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("iphone") || u.includes("ipad")) os = "iOS";
  let browser = "Browser";
  if (u.includes("edg/")) browser = "Edge";
  else if (u.includes("chrome") && !u.includes("chromium")) browser = "Chrome";
  else if (u.includes("firefox")) browser = "Firefox";
  else if (u.includes("safari") && !u.includes("chrome")) browser = "Safari";
  return `${os} · ${browser}`;
}

export default function SecuritySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [sessionHint, setSessionHint] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await getMedusaAdminClient().getSellerAccount();
      setAccount(data?.user || null);
    } catch (e) {
      setAccount(null);
      setErr(e?.message || "Profil konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (typeof navigator !== "undefined") setSessionHint(summarizeUserAgent(navigator.userAgent));
  }, []);

  const displayName = (() => {
    const fn = (account?.first_name || "").trim();
    const ln = (account?.last_name || "").trim();
    if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
    return (account?.store_name || "").trim() || (account?.email || "").split("@")[0] || "—";
  })();

  const roleLabel = account?.is_superuser
    ? "Plattform-Superuser"
    : account?.is_team_member
      ? "Team-Zugang"
      : "Verkäufer-Konto";

  const roleTone = account?.is_superuser ? "info" : account?.is_team_member ? "attention" : "success";

  const submitPassword = async (e) => {
    e.preventDefault();
    setErr("");
    setOk("");
    if (newPw !== confirmPw) {
      setErr("Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    if (newPw.length < 6) {
      setErr("Neues Passwort muss mindestens 6 Zeichen haben.");
      return;
    }
    setSaving(true);
    try {
      await getMedusaAdminClient().changeSellerPassword({
        current_password: currentPw,
        new_password: newPw,
      });
      setOk("Passwort wurde geändert.");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (e) {
      setErr(e?.message || "Passwort konnte nicht geändert werden.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <Box padding="400">
          <Text as="p" tone="subdued">
            Sicherheitseinstellungen werden geladen…
          </Text>
        </Box>
      </Card>
    );
  }

  return (
    <BlockStack gap="500">
      <Text as="p" tone="subdued">
        Diese Angaben und das Passwort gelten nur für Ihr eigenes Anmeldekonto — nicht für andere Benutzer
        Ihres Verkäuferprofils.
      </Text>

      {err ? (
        <Banner tone="critical" onDismiss={() => setErr("")}>
          <Text as="p">{err}</Text>
        </Banner>
      ) : null}
      {ok ? (
        <Banner tone="success" onDismiss={() => setOk("")}>
          <Text as="p">{ok}</Text>
        </Banner>
      ) : null}

      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center" wrap>
            <Text variant="headingMd" as="h2">
              Ihr Konto
            </Text>
            <Badge tone={roleTone}>{roleLabel}</Badge>
          </InlineStack>
          <Divider />
          <BlockStack gap="200">
            <div>
              <Text variant="bodySm" tone="subdued">
                Name
              </Text>
              <Text variant="bodyMd" as="p" fontWeight="semibold">
                {displayName}
              </Text>
            </div>
            <div>
              <Text variant="bodySm" tone="subdued">
                E-Mail (Anmeldung)
              </Text>
              <Text variant="bodyMd" as="p" fontWeight="semibold">
                {account?.email || "—"}
              </Text>
            </div>
            {account?.store_name ? (
              <div>
                <Text variant="bodySm" tone="subdued">
                  Shop / Anzeigename
                </Text>
                <Text variant="bodyMd" as="p">
                  {account.store_name}
                </Text>
              </div>
            ) : null}
            <div>
              <Text variant="bodySm" tone="subdued">
                Verkäufer-ID
              </Text>
              <Text variant="bodyMd" as="p">
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{account?.seller_id || "—"}</span>
              </Text>
            </div>
            <div>
              <Text variant="bodySm" tone="subdued">
                Konto seit
              </Text>
              <Text variant="bodyMd" as="p">
                {formatJoined(account?.created_at)}
              </Text>
            </div>
          </BlockStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">
            Passwort ändern
          </Text>
          <Text as="p" tone="subdued">
            Wählen Sie ein sicheres Passwort, das Sie nirgendwo woanders verwenden.
          </Text>
          <form onSubmit={submitPassword}>
            <BlockStack gap="300">
              <TextField
                label="Aktuelles Passwort"
                type="password"
                value={currentPw}
                onChange={setCurrentPw}
                autoComplete="current-password"
              />
              <TextField
                label="Neues Passwort"
                type="password"
                value={newPw}
                onChange={setNewPw}
                autoComplete="new-password"
                helpText="Mindestens 6 Zeichen"
              />
              <TextField
                label="Neues Passwort bestätigen"
                type="password"
                value={confirmPw}
                onChange={setConfirmPw}
                autoComplete="new-password"
              />
              <InlineStack gap="300">
                <Button variant="primary" submit loading={saving}>
                  Passwort speichern
                </Button>
              </InlineStack>
            </BlockStack>
          </form>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">
            Aktuelle Sitzung
          </Text>
          <Text as="p" tone="subdued">
            Sie sind mit diesem Browser angemeldet. Eine zentrale Liste aller Geräte ist derzeit nicht
            verfügbar; zum Schutz können Sie unten alle anderen Sitzungen beenden (nur dieser Browser
            bleibt aktiv, sofern Cookies erhalten bleiben).
          </Text>
          <Box padding="300" background="bg-surface-secondary" borderRadius="200">
            <BlockStack gap="100">
              <Text variant="bodyMd" fontWeight="semibold">
                {sessionHint || "Dieses Gerät"}
              </Text>
              <Text variant="bodySm" tone="subdued">
                Gerätehinweis wird lokal aus Ihrem Browser abgeleitet — nicht auf dem Server gespeichert.
              </Text>
            </BlockStack>
          </Box>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">
            Zwei-Faktor-Authentifizierung
          </Text>
          <Banner tone="info">
            <Text as="p">
              Zwei-Faktor-Authentifizierung (2FA) ist für Sellercentral in Vorbereitung. Bis dahin schützt ein
              starkes, einzigartiges Passwort Ihr Konto.
            </Text>
          </Banner>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
