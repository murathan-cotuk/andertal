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

function TotpSetupCard({ onStatusChange }) {
  const [step, setStep] = useState("idle"); // idle | loading | qr | verifying | done
  const [qrCode, setQrCode] = useState(null);
  const [secret, setSecret] = useState(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const load = useCallback(async () => {
    setStep("loading");
    try {
      const d = await getMedusaAdminClient().get2faStatus();
      setEnabled(d?.totp_enabled || false);
      setStep("idle");
    } catch {
      setStep("idle");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startSetup = async () => {
    setErr("");
    setOk("");
    setStep("loading");
    try {
      const d = await getMedusaAdminClient().setup2fa();
      setQrCode(d?.qr_code || null);
      setSecret(d?.secret || null);
      setCode("");
      setStep("qr");
    } catch (e) {
      setErr(e?.message || "Setup fehlgeschlagen.");
      setStep("idle");
    }
  };

  const verifyCode = async () => {
    if (!code) { setErr("Bitte Code eingeben."); return; }
    setErr("");
    setStep("verifying");
    try {
      await getMedusaAdminClient().verify2fa(code);
      setEnabled(true);
      setStep("done");
      setOk("2FA erfolgreich aktiviert!");
      onStatusChange?.(true);
    } catch (e) {
      setErr(e?.message || "Ungültiger Code.");
      setStep("qr");
    }
  };

  const disable2fa = async () => {
    if (!disableCode && !disablePassword) {
      setErr("Bitte aktuellen Code oder Passwort eingeben.");
      return;
    }
    setErr("");
    setDisabling(true);
    try {
      await getMedusaAdminClient().disable2fa({ code: disableCode, password: disablePassword });
      setEnabled(false);
      setDisableCode("");
      setDisablePassword("");
      setOk("2FA wurde deaktiviert.");
      onStatusChange?.(false);
    } catch (e) {
      setErr(e?.message || "Deaktivierung fehlgeschlagen.");
    } finally {
      setDisabling(false);
    }
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text variant="headingMd" as="h2">
            Zwei-Faktor-Authentifizierung (2FA)
          </Text>
          <Badge tone={enabled ? "success" : "attention"}>
            {enabled ? "Aktiviert" : "Nicht aktiviert"}
          </Badge>
        </InlineStack>
        <Text as="p" tone="subdued">
          Mit einem Authenticator-App (z. B. Google Authenticator, Authy) wird beim Anmelden ein zusätzlicher
          einmaliger Code abgefragt. Dadurch ist Ihr Konto auch bei gestohlenen Passwörtern geschützt.
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

        {!enabled && step === "idle" && (
          <Button variant="primary" onClick={startSetup}>
            2FA einrichten
          </Button>
        )}

        {step === "loading" && (
          <Text as="p" tone="subdued">Laden…</Text>
        )}

        {step === "qr" && qrCode && (
          <BlockStack gap="400">
            <Text as="p" fontWeight="semibold">
              Schritt 1: QR-Code scannen
            </Text>
            <Text as="p" tone="subdued">
              Öffnen Sie Ihre Authenticator-App (Google Authenticator, Authy, Microsoft Authenticator usw.)
              und scannen Sie diesen QR-Code:
            </Text>
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  background: "#fff",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  display: "inline-block",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                }}
              >
                <img src={qrCode} alt="2FA QR Code" width={200} height={200} style={{ display: "block" }} />
              </div>
            </div>
            {secret && (
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued">
                    QR-Code nicht lesbar? Geheimschlüssel manuell eingeben:
                  </Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Text variant="bodyMd" fontWeight="semibold">
                      <span style={{ fontFamily: "monospace", letterSpacing: 2, fontSize: 13 }}>
                        {showSecret ? secret : "••••••••••••••••••••"}
                      </span>
                    </Text>
                    <Button
                      variant="plain"
                      size="slim"
                      onClick={() => setShowSecret((v) => !v)}
                    >
                      {showSecret ? "Verbergen" : "Anzeigen"}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Box>
            )}
            <Divider />
            <Text as="p" fontWeight="semibold">
              Schritt 2: Code bestätigen
            </Text>
            <Text as="p" tone="subdued">
              Geben Sie den 6-stelligen Code aus Ihrer App ein, um 2FA zu aktivieren:
            </Text>
            <div style={{ maxWidth: 200 }}>
              <TextField
                label="6-stelliger Code"
                value={code}
                onChange={setCode}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
              />
            </div>
            <InlineStack gap="300">
              <Button variant="primary" onClick={verifyCode} loading={step === "verifying"}>
                Code bestätigen &amp; aktivieren
              </Button>
              <Button variant="plain" onClick={() => { setStep("idle"); setQrCode(null); setSecret(null); }}>
                Abbrechen
              </Button>
            </InlineStack>
          </BlockStack>
        )}

        {step === "done" && enabled && (
          <Banner tone="success">
            <Text as="p">2FA ist jetzt aktiv. Beim nächsten Login wird ein Code abgefragt.</Text>
          </Banner>
        )}

        {enabled && step !== "qr" && (
          <>
            <Divider />
            <BlockStack gap="300">
              <Text variant="headingSm" as="h3">2FA deaktivieren</Text>
              <Text as="p" tone="subdued">
                Zur Bestätigung geben Sie entweder Ihren aktuellen Authenticator-Code oder Ihr Passwort ein:
              </Text>
              <div style={{ maxWidth: 240 }}>
                <TextField
                  label="Aktueller Authenticator-Code"
                  value={disableCode}
                  onChange={setDisableCode}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                />
              </div>
              <Text as="p" tone="subdued" variant="bodySm">oder</Text>
              <div style={{ maxWidth: 240 }}>
                <TextField
                  label="Ihr Passwort"
                  type="password"
                  value={disablePassword}
                  onChange={setDisablePassword}
                  autoComplete="current-password"
                />
              </div>
              <InlineStack gap="300">
                <Button tone="critical" onClick={disable2fa} loading={disabling}>
                  2FA deaktivieren
                </Button>
              </InlineStack>
            </BlockStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
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
    if (newPw.length < 8 || !/[a-zA-Z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      setErr("Neues Passwort muss mindestens 8 Zeichen, einen Buchstaben und eine Zahl enthalten.");
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
                helpText="Mindestens 8 Zeichen, ein Buchstabe und eine Zahl"
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

      <TotpSetupCard />
    </BlockStack>
  );
}
