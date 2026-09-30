"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
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
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function formatJoined(d, locale) {
  if (!d) return "—";
  try {
    const loc = locale === "tr" ? "tr-TR" : locale === "en" ? "en-GB" : locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : "de-DE";
    return new Date(d).toLocaleDateString(loc, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatSessionDate(d, locale) {
  if (!d) return "—";
  try {
    const loc = locale === "tr" ? "tr-TR" : locale === "en" ? "en-GB" : locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : "de-DE";
    return new Date(d).toLocaleString(loc, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function DevicesCard({ locale }) {
  const router = useRouter();
  const [sessions, setSessions] = useState(null); // null = loading
  const [sessionTracking, setSessionTracking] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const t = (en, tr, de) => (locale === "en" ? en : locale === "tr" ? tr : de);

  const load = useCallback(async () => {
    try {
      const d = await getMedusaAdminClient().getSellerSessions();
      setSessions(Array.isArray(d?.sessions) ? d.sessions : []);
      setSessionTracking(d?.session_tracking !== false);
    } catch (e) {
      setSessions([]);
      setSessionTracking(true);
      setErr(e?.message || t("Could not load devices.", "Cihazlar yüklenemedi.", "Geräte konnten nicht geladen werden."));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const localLogout = () => {
    ["sellerLoggedIn", "sellerEmail", "sellerId", "storeName", "sellerToken", "sellerIsSuperuser", "sellerPermissions", "sellerApprovalStatus", "andertal_su_auth_backup"]
      .forEach((k) => localStorage.removeItem(k));
    try {
      sessionStorage.removeItem("andertal_seller_impersonation_v1");
    } catch {
      /* ignore */
    }
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    router.push("/login");
  };

  const revokeOne = async (session) => {
    setErr("");
    setBusyId(session.id);
    try {
      await getMedusaAdminClient().revokeSellerSession(session.id);
      if (session.is_current) {
        localLogout();
        return;
      }
      setSessions((list) => (list || []).filter((s) => s.id !== session.id));
    } catch (e) {
      setErr(e?.message || t("Could not end this session.", "Bu oturum sonlandırılamadı.", "Sitzung konnte nicht beendet werden."));
    }
    setBusyId(null);
  };

  const revokeAllOthers = async () => {
    setErr("");
    setRevokingAll(true);
    try {
      await getMedusaAdminClient().revokeAllSellerSessions({ includeCurrent: false });
      await load();
    } catch (e) {
      setErr(e?.message || t("Could not end other sessions.", "Diğer oturumlar sonlandırılamadı.", "Andere Sitzungen konnten nicht beendet werden."));
    }
    setRevokingAll(false);
  };

  const emptyHint = !sessionTracking
    ? t(
        "This login is not device-tracked yet. Sign out and sign in once — then this device will appear here.",
        "Bu oturum henüz cihaz olarak izlenmiyor. Bir kez çıkış yapıp tekrar giriş yapın — cihazınız burada görünecek.",
        "Diese Anmeldung wird noch nicht als Gerät erfasst. Melden Sie sich einmal ab und wieder an — danach erscheint dieses Gerät hier.",
      )
    : t(
        "No other tracked devices right now.",
        "Şu anda başka takip edilen cihaz yok.",
        "Derzeit keine weiteren erfassten Geräte.",
      );

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text variant="headingMd" as="h2">
            {t("Devices", "Cihazlar", "Geräte")}
          </Text>
          {sessions && sessions.length > 1 && (
            <Button tone="critical" onClick={revokeAllOthers} loading={revokingAll} size="slim">
              {t("Log out other devices", "Diğer cihazlardan çıkış yap", "Andere Geräte abmelden")}
            </Button>
          )}
        </InlineStack>
        <Text as="p" tone="subdued">
          {t(
            "Every device currently logged into your account. If you don't recognize one, end it.",
            "Hesabınızda şu anda oturum açık olan tüm cihazlar. Tanımadığınız biri varsa oturumunu sonlandırın.",
            "Alle Geräte, die aktuell in Ihrem Konto angemeldet sind. Erkennen Sie eines nicht, beenden Sie es.",
          )}
        </Text>

        {err ? (
          <Banner tone="critical" onDismiss={() => setErr("")}>
            <Text as="p">{err}</Text>
          </Banner>
        ) : null}

        {!sessionTracking && sessions !== null ? (
          <Banner tone="warning">
            <Text as="p">{emptyHint}</Text>
          </Banner>
        ) : null}

        {sessions === null ? (
          <Text as="p" tone="subdued">{t("Loading…", "Yükleniyor…", "Wird geladen…")}</Text>
        ) : sessions.length === 0 ? (
          sessionTracking ? (
            <Text as="p" tone="subdued">{emptyHint}</Text>
          ) : null
        ) : (
          <BlockStack gap="200">
            {sessions.map((s) => (
              <Box key={s.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="050">
                    <InlineStack gap="150" blockAlign="center">
                      <Text variant="bodyMd" fontWeight="semibold">{s.device_label}</Text>
                      {s.is_current && (
                        <Badge tone="success">{t("This device", "Bu cihaz", "Dieses Gerät")}</Badge>
                      )}
                    </InlineStack>
                    <Text variant="bodySm" tone="subdued">
                      {t("Last active", "Son aktif", "Zuletzt aktiv")}: {formatSessionDate(s.last_seen_at, locale)}
                      {s.ip_address ? ` · ${s.ip_address}` : ""}
                    </Text>
                  </BlockStack>
                  <Button
                    tone="critical"
                    variant="plain"
                    size="slim"
                    loading={busyId === s.id}
                    onClick={() => revokeOne(s)}
                  >
                    {s.is_current
                      ? t("Log out", "Çıkış yap", "Abmelden")
                      : t("End session", "Oturumu sonlandır", "Sitzung beenden")}
                  </Button>
                </InlineStack>
              </Box>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

function TotpSetupCard({ onStatusChange, locale }) {
  const ui = getUI(locale);
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
      setErr(e?.message || (locale === "tr" ? "Kurulum başarısız." : locale === "en" ? "Setup failed." : locale === "fr" ? "Échec de la configuration." : locale === "es" ? "La configuración falló." : locale === "it" ? "Configurazione non riuscita." : "Setup fehlgeschlagen."));
      setStep("idle");
    }
  };

  const verifyCode = async () => {
    if (!code) {
      setErr(locale === "tr" ? "Lütfen kodu girin." : locale === "en" ? "Please enter the code." : locale === "fr" ? "Veuillez saisir le code." : locale === "es" ? "Introduce el código." : locale === "it" ? "Inserisci il codice." : "Bitte Code eingeben.");
      return;
    }
    setErr("");
    setStep("verifying");
    try {
      await getMedusaAdminClient().verify2fa(code);
      setEnabled(true);
      setStep("done");
      setOk(locale === "tr" ? "2FA başarıyla etkinleştirildi!" : locale === "en" ? "2FA successfully activated!" : locale === "fr" ? "2FA activée avec succès !" : locale === "es" ? "¡2FA activada correctamente!" : locale === "it" ? "2FA attivata con successo!" : "2FA erfolgreich aktiviert!");
      onStatusChange?.(true);
    } catch (e) {
      setErr(e?.message || (locale === "tr" ? "Geçersiz kod." : locale === "en" ? "Invalid code." : locale === "fr" ? "Code invalide." : locale === "es" ? "Código no válido." : locale === "it" ? "Codice non valido." : "Ungültiger Code."));
      setStep("qr");
    }
  };

  const disable2fa = async () => {
    if (!disableCode && !disablePassword) {
      setErr(locale === "tr" ? "Lütfen mevcut kodunuzu veya şifrenizi girin." : locale === "en" ? "Please enter your current code or password." : locale === "fr" ? "Veuillez saisir votre code actuel ou votre mot de passe." : locale === "es" ? "Introduce tu código actual o tu contraseña." : locale === "it" ? "Inserisci il codice attuale o la password." : "Bitte aktuellen Code oder Passwort eingeben.");
      return;
    }
    setErr("");
    setDisabling(true);
    try {
      await getMedusaAdminClient().disable2fa({ code: disableCode, password: disablePassword });
      setEnabled(false);
      setDisableCode("");
      setDisablePassword("");
      setOk(locale === "tr" ? "2FA devre dışı bırakıldı." : locale === "en" ? "2FA has been disabled." : locale === "fr" ? "La 2FA a été désactivée." : locale === "es" ? "La 2FA se ha desactivado." : locale === "it" ? "La 2FA è stata disattivata." : "2FA wurde deaktiviert.");
      onStatusChange?.(false);
    } catch (e) {
      setErr(e?.message || (locale === "tr" ? "Devre dışı bırakma başarısız." : locale === "en" ? "Deactivation failed." : locale === "fr" ? "Échec de la désactivation." : locale === "es" ? "No se pudo desactivar." : locale === "it" ? "Disattivazione non riuscita." : "Deaktivierung fehlgeschlagen."));
    } finally {
      setDisabling(false);
    }
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text variant="headingMd" as="h2">
            {locale === "tr" ? "İki faktörlü kimlik doğrulama (2FA)" : locale === "en" ? "Two-factor authentication (2FA)" : locale === "fr" ? "Authentification à deux facteurs (2FA)" : locale === "es" ? "Autenticación de dos factores (2FA)" : locale === "it" ? "Autenticazione a due fattori (2FA)" : "Zwei-Faktor-Authentifizierung (2FA)"}
          </Text>
          <Badge tone={enabled ? "success" : "attention"}>
            {enabled ? (locale === "tr" ? "Etkin" : locale === "en" ? "Enabled" : locale === "fr" ? "Activée" : locale === "es" ? "Activada" : locale === "it" ? "Attiva" : "Aktiviert") : (locale === "tr" ? "Etkin değil" : locale === "en" ? "Not enabled" : locale === "fr" ? "Non activée" : locale === "es" ? "No activada" : locale === "it" ? "Non attiva" : "Nicht aktiviert")}
          </Badge>
        </InlineStack>
        <Text as="p" tone="subdued">
          {locale === "tr" ? "Giriş sırasında ek bir tek kullanımlık kod istemek için bir kimlik doğrulayıcı uygulama (ör. Google Authenticator, Authy) kullanılır. Bu, şifreniz çalınsa bile hesabınızı korur." : locale === "en" ? "An authenticator app (e.g. Google Authenticator, Authy) is used to request an additional one-time code at login. This protects your account even if your password is stolen." : locale === "fr" ? "Une application d’authentification (p. ex. Google Authenticator, Authy) demande un code à usage unique supplémentaire à la connexion. Votre compte reste protégé même si votre mot de passe est volé." : locale === "es" ? "Una app de autenticación (p. ej. Google Authenticator, Authy) solicita un código de un solo uso adicional al iniciar sesión. Así tu cuenta queda protegida aunque te roben la contraseña." : locale === "it" ? "Un’app di autenticazione (ad es. Google Authenticator, Authy) richiede un codice monouso aggiuntivo all’accesso. Il tuo account resta protetto anche se la password viene rubata." : "Mit einem Authenticator-App (z. B. Google Authenticator, Authy) wird beim Anmelden ein zusätzlicher einmaliger Code abgefragt. Dadurch ist Ihr Konto auch bei gestohlenen Passwörtern geschützt."}
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
            {locale === "tr" ? "2FA'yı kur" : locale === "en" ? "Set up 2FA" : locale === "fr" ? "Configurer la 2FA" : locale === "es" ? "Configurar 2FA" : locale === "it" ? "Configura la 2FA" : "2FA einrichten"}
          </Button>
        )}

        {step === "loading" && (
          <Text as="p" tone="subdued">{ui.loading}</Text>
        )}

        {step === "qr" && qrCode && (
          <BlockStack gap="400">
            <Text as="p" fontWeight="semibold">
              {locale === "tr" ? "Adım 1: QR kodu tara" : locale === "en" ? "Step 1: Scan QR code" : locale === "fr" ? "Étape 1 : scanner le QR code" : locale === "es" ? "Paso 1: escanear el código QR" : locale === "it" ? "Passo 1: scansiona il codice QR" : "Schritt 1: QR-Code scannen"}
            </Text>
            <Text as="p" tone="subdued">
              {locale === "tr" ? "Kimlik doğrulayıcı uygulamanızı (Google Authenticator, Authy, Microsoft Authenticator vb.) açın ve bu QR kodunu tarayın:" : locale === "en" ? "Open your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.) and scan this QR code:" : locale === "fr" ? "Ouvrez votre application d’authentification (Google Authenticator, Authy, Microsoft Authenticator, etc.) et scannez ce QR code :" : locale === "es" ? "Abre tu app de autenticación (Google Authenticator, Authy, Microsoft Authenticator, etc.) y escanea este código QR:" : locale === "it" ? "Apri la tua app di autenticazione (Google Authenticator, Authy, Microsoft Authenticator, ecc.) e scansiona questo codice QR:" : "Öffnen Sie Ihre Authenticator-App (Google Authenticator, Authy, Microsoft Authenticator usw.) und scannen Sie diesen QR-Code:"}
            </Text>
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  background: "#fff",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #e6dfd4",
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
                    {locale === "tr" ? "QR kod okunamıyor mu? Gizli anahtarı manuel girin:" : locale === "en" ? "QR code not readable? Enter the secret key manually:" : locale === "fr" ? "QR code illisible ? Saisissez la clé secrète manuellement :" : locale === "es" ? "¿No se puede leer el QR? Introduce la clave secreta manualmente:" : locale === "it" ? "Codice QR non leggibile? Inserisci manualmente la chiave segreta:" : "QR-Code nicht lesbar? Geheimschlüssel manuell eingeben:"}
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
                      {showSecret ? (locale === "tr" ? "Gizle" : locale === "en" ? "Hide" : locale === "fr" ? "Masquer" : locale === "es" ? "Ocultar" : locale === "it" ? "Nascondi" : "Verbergen") : (locale === "tr" ? "Göster" : locale === "en" ? "Show" : locale === "fr" ? "Afficher" : locale === "es" ? "Mostrar" : locale === "it" ? "Mostra" : "Anzeigen")}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Box>
            )}
            <Divider />
            <Text as="p" fontWeight="semibold">
              {locale === "tr" ? "Adım 2: Kodu onayla" : locale === "en" ? "Step 2: Confirm code" : locale === "fr" ? "Étape 2 : confirmer le code" : locale === "es" ? "Paso 2: confirmar el código" : locale === "it" ? "Passo 2: conferma il codice" : "Schritt 2: Code bestätigen"}
            </Text>
            <Text as="p" tone="subdued">
              {locale === "tr" ? "2FA'yı etkinleştirmek için uygulamanızdaki 6 haneli kodu girin:" : locale === "en" ? "Enter the 6-digit code from your app to activate 2FA:" : locale === "fr" ? "Saisissez le code à 6 chiffres de votre application pour activer la 2FA :" : locale === "es" ? "Introduce el código de 6 dígitos de tu app para activar la 2FA:" : locale === "it" ? "Inserisci il codice a 6 cifre della tua app per attivare la 2FA:" : "Geben Sie den 6-stelligen Code aus Ihrer App ein, um 2FA zu aktivieren:"}
            </Text>
            <div style={{ maxWidth: 200 }}>
              <TextField
                label={locale === "tr" ? "6 haneli kod" : locale === "en" ? "6-digit code" : locale === "fr" ? "Code à 6 chiffres" : locale === "es" ? "Código de 6 dígitos" : locale === "it" ? "Codice a 6 cifre" : "6-stelliger Code"}
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
                {locale === "tr" ? "Kodu onayla & etkinleştir" : locale === "en" ? "Confirm code & activate" : locale === "fr" ? "Confirmer le code et activer" : locale === "es" ? "Confirmar código y activar" : locale === "it" ? "Conferma codice e attiva" : "Code bestätigen & aktivieren"}
              </Button>
              <Button variant="plain" onClick={() => { setStep("idle"); setQrCode(null); setSecret(null); }}>
                {ui.cancel}
              </Button>
            </InlineStack>
          </BlockStack>
        )}

        {step === "done" && enabled && (
          <Banner tone="success">
            <Text as="p">{locale === "tr" ? "2FA artık aktif. Bir sonraki girişte kod istenecek." : locale === "en" ? "2FA is now active. You will be asked for a code at next login." : locale === "fr" ? "La 2FA est active. Un code vous sera demandé à la prochaine connexion." : locale === "es" ? "La 2FA ya está activa. Se te pedirá un código en el próximo inicio de sesión." : locale === "it" ? "La 2FA è attiva. Al prossimo accesso ti verrà chiesto un codice." : "2FA ist jetzt aktiv. Beim nächsten Login wird ein Code abgefragt."}</Text>
          </Banner>
        )}

        {enabled && step !== "qr" && (
          <>
            <Divider />
            <BlockStack gap="300">
              <Text variant="headingSm" as="h3">{locale === "tr" ? "2FA'yı devre dışı bırak" : locale === "en" ? "Disable 2FA" : locale === "fr" ? "Désactiver la 2FA" : locale === "es" ? "Desactivar 2FA" : locale === "it" ? "Disattiva la 2FA" : "2FA deaktivieren"}</Text>
              <Text as="p" tone="subdued">
                {locale === "tr" ? "Onaylamak için mevcut kimlik doğrulayıcı kodunuzu veya şifrenizi girin:" : locale === "en" ? "To confirm, enter either your current authenticator code or your password:" : locale === "fr" ? "Pour confirmer, saisissez votre code d’authentification actuel ou votre mot de passe :" : locale === "es" ? "Para confirmar, introduce tu código de autenticación actual o tu contraseña:" : locale === "it" ? "Per confermare, inserisci il codice di autenticazione attuale o la password:" : "Zur Bestätigung geben Sie entweder Ihren aktuellen Authenticator-Code oder Ihr Passwort ein:"}
              </Text>
              <div style={{ maxWidth: 240 }}>
                <TextField
                  label={locale === "tr" ? "Mevcut kimlik doğrulayıcı kodu" : locale === "en" ? "Current authenticator code" : locale === "fr" ? "Code d’authentification actuel" : locale === "es" ? "Código de autenticación actual" : locale === "it" ? "Codice di autenticazione attuale" : "Aktueller Authenticator-Code"}
                  value={disableCode}
                  onChange={setDisableCode}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                />
              </div>
              <Text as="p" tone="subdued" variant="bodySm">{locale === "tr" ? "veya" : locale === "en" ? "or" : locale === "fr" ? "ou" : locale === "es" ? "o" : locale === "it" ? "oppure" : "oder"}</Text>
              <div style={{ maxWidth: 240 }}>
                <TextField
                  label={locale === "tr" ? "Şifreniz" : locale === "en" ? "Your password" : locale === "fr" ? "Votre mot de passe" : locale === "es" ? "Tu contraseña" : locale === "it" ? "La tua password" : "Ihr Passwort"}
                  type="password"
                  value={disablePassword}
                  onChange={setDisablePassword}
                  autoComplete="current-password"
                />
              </div>
              <InlineStack gap="300">
                <Button tone="critical" onClick={disable2fa} loading={disabling}>
                  {locale === "tr" ? "2FA'yı devre dışı bırak" : locale === "en" ? "Disable 2FA" : locale === "fr" ? "Désactiver la 2FA" : locale === "es" ? "Desactivar 2FA" : locale === "it" ? "Disattiva la 2FA" : "2FA deaktivieren"}
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
  const locale = useLocale();
  const ui = getUI(locale);

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Superuser-only inline edit of Name/Email on the "Ihr Konto" card — everyone else keeps the
  // plain read-only display above (explicit user instruction).
  const [editingAccount, setEditingAccount] = useState(false);
  const [accFirstName, setAccFirstName] = useState("");
  const [accLastName, setAccLastName] = useState("");
  const [accEmail, setAccEmail] = useState("");
  const [accSaving, setAccSaving] = useState(false);
  const [accErr, setAccErr] = useState("");

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await getMedusaAdminClient().getSellerAccount();
      setAccount(data?.user || null);
    } catch (e) {
      setAccount(null);
      setErr(e?.message || (locale === "tr" ? "Profil yüklenemedi." : locale === "en" ? "Could not load profile." : locale === "fr" ? "Impossible de charger le profil." : locale === "es" ? "No se pudo cargar el perfil." : locale === "it" ? "Impossibile caricare il profilo." : "Profil konnte nicht geladen werden."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const displayName = (() => {
    const fn = (account?.first_name || "").trim();
    const ln = (account?.last_name || "").trim();
    if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
    return (account?.store_name || "").trim() || (account?.email || "").split("@")[0] || "—";
  })();

  const roleLabel = account?.is_superuser
    ? (locale === "tr" ? "Platform süper kullanıcısı" : locale === "en" ? "Platform superuser" : locale === "fr" ? "Superutilisateur de la plateforme" : locale === "es" ? "Superusuario de la plataforma" : locale === "it" ? "Superutente della piattaforma" : "Plattform-Superuser")
    : account?.is_team_member
      ? (locale === "tr" ? "Takım erişimi" : locale === "en" ? "Team access" : locale === "fr" ? "Accès équipe" : locale === "es" ? "Acceso de equipo" : locale === "it" ? "Accesso team" : "Team-Zugang")
      : (locale === "tr" ? "Satıcı hesabı" : locale === "en" ? "Seller account" : locale === "fr" ? "Compte vendeur" : locale === "es" ? "Cuenta de vendedor" : locale === "it" ? "Account venditore" : "Verkäufer-Konto");

  const roleTone = account?.is_superuser ? "info" : account?.is_team_member ? "attention" : "success";

  const startEditAccount = () => {
    setAccFirstName(account?.first_name || "");
    setAccLastName(account?.last_name || "");
    setAccEmail(account?.email || "");
    setAccErr("");
    setEditingAccount(true);
  };

  const cancelEditAccount = () => {
    setEditingAccount(false);
    setAccErr("");
  };

  const saveAccount = async () => {
    setAccErr("");
    setAccSaving(true);
    try {
      const data = await getMedusaAdminClient().updateSellerAccount({
        first_name: accFirstName.trim(),
        last_name: accLastName.trim(),
        email: accEmail.trim().toLowerCase(),
      });
      setAccount((a) => ({ ...a, ...(data?.user || {}) }));
      setEditingAccount(false);
    } catch (e) {
      setAccErr(e?.message || (locale === "tr" ? "Kaydedilemedi." : locale === "en" ? "Could not save." : locale === "fr" ? "Impossible d’enregistrer." : locale === "es" ? "No se pudo guardar." : locale === "it" ? "Impossibile salvare." : "Konnte nicht gespeichert werden."));
    } finally {
      setAccSaving(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setErr("");
    setOk("");
    if (newPw !== confirmPw) {
      setErr(locale === "tr" ? "Yeni şifreler eşleşmiyor." : locale === "en" ? "The new passwords do not match." : locale === "fr" ? "Les nouveaux mots de passe ne correspondent pas." : locale === "es" ? "Las nuevas contraseñas no coinciden." : locale === "it" ? "Le nuove password non corrispondono." : "Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    if (newPw.length < 8 || !/[a-zA-Z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      setErr(locale === "tr" ? "Yeni şifre en az 8 karakter, bir harf ve bir rakam içermelidir." : locale === "en" ? "New password must be at least 8 characters and contain a letter and a number." : locale === "fr" ? "Le nouveau mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre." : locale === "es" ? "La nueva contraseña debe tener al menos 8 caracteres, una letra y un número." : locale === "it" ? "La nuova password deve avere almeno 8 caratteri, una lettera e un numero." : "Neues Passwort muss mindestens 8 Zeichen, einen Buchstaben und eine Zahl enthalten.");
      return;
    }
    setSaving(true);
    try {
      await getMedusaAdminClient().changeSellerPassword({
        current_password: currentPw,
        new_password: newPw,
      });
      setOk(locale === "tr" ? "Şifre değiştirildi." : locale === "en" ? "Password changed." : locale === "fr" ? "Mot de passe modifié." : locale === "es" ? "Contraseña cambiada." : locale === "it" ? "Password modificata." : "Passwort wurde geändert.");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (e) {
      setErr(e?.message || (locale === "tr" ? "Şifre değiştirilemedi." : locale === "en" ? "Could not change password." : locale === "fr" ? "Impossible de modifier le mot de passe." : locale === "es" ? "No se pudo cambiar la contraseña." : locale === "it" ? "Impossibile modificare la password." : "Passwort konnte nicht geändert werden."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <Box padding="400">
          <Text as="p" tone="subdued">
            {locale === "tr" ? "Güvenlik ayarları yükleniyor…" : locale === "en" ? "Loading security settings…" : locale === "fr" ? "Chargement des paramètres de sécurité…" : locale === "es" ? "Cargando ajustes de seguridad…" : locale === "it" ? "Caricamento impostazioni di sicurezza…" : "Sicherheitseinstellungen werden geladen…"}
          </Text>
        </Box>
      </Card>
    );
  }

  return (
    <BlockStack gap="500">
      <Text as="p" tone="subdued">
        {locale === "tr" ? "Bu bilgiler ve şifre yalnızca kendi giriş hesabınız için geçerlidir — satıcı profilinizin diğer kullanıcıları için değil." : locale === "en" ? "These details and password apply only to your own login account — not to other users of your seller profile." : locale === "fr" ? "Ces informations et le mot de passe ne concernent que votre propre compte de connexion — pas les autres utilisateurs de votre profil vendeur." : locale === "es" ? "Estos datos y la contraseña solo se aplican a tu propia cuenta de acceso, no a otros usuarios de tu perfil de vendedor." : locale === "it" ? "Questi dati e la password valgono solo per il tuo account di accesso — non per gli altri utenti del tuo profilo venditore." : "Diese Angaben und das Passwort gelten nur für Ihr eigenes Anmeldekonto — nicht für andere Benutzer Ihres Verkäuferprofils."}
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
              {locale === "tr" ? "Hesabınız" : locale === "en" ? "Your account" : locale === "fr" ? "Votre compte" : locale === "es" ? "Tu cuenta" : locale === "it" ? "Il tuo account" : "Ihr Konto"}
            </Text>
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={roleTone}>{roleLabel}</Badge>
              {account?.is_superuser && !editingAccount ? (
                <Button size="slim" onClick={startEditAccount}>
                  {locale === "tr" ? "Düzenle" : locale === "en" ? "Edit" : locale === "fr" ? "Modifier" : locale === "es" ? "Editar" : locale === "it" ? "Modifica" : "Bearbeiten"}
                </Button>
              ) : null}
            </InlineStack>
          </InlineStack>
          <Divider />

          {editingAccount ? (
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                {locale === "tr" ? "Süper kullanıcı olarak kendi adını ve giriş e-postanı doğrudan düzenleyebilirsin." : locale === "en" ? "As a superuser you can edit your own name and login email directly." : locale === "fr" ? "En tant que superutilisateur, vous pouvez modifier directement votre nom et votre e-mail de connexion." : locale === "es" ? "Como superusuario puedes editar directamente tu nombre y tu e-mail de acceso." : locale === "it" ? "Come superutente puoi modificare direttamente il tuo nome e l’e-mail di accesso." : "Als Superuser können Sie Ihren eigenen Namen und Ihre Anmelde-E-Mail direkt bearbeiten."}
              </Text>
              {accErr ? (
                <Banner tone="critical" onDismiss={() => setAccErr("")}>
                  <Text as="p">{accErr}</Text>
                </Banner>
              ) : null}
              <InlineStack gap="300" wrap>
                <div style={{ minWidth: 200, flex: 1 }}>
                  <TextField
                    label={locale === "tr" ? "Ad" : locale === "en" ? "First name" : locale === "fr" ? "Prénom" : locale === "es" ? "Nombre" : locale === "it" ? "Nome" : "Vorname"}
                    value={accFirstName}
                    onChange={setAccFirstName}
                    autoComplete="given-name"
                  />
                </div>
                <div style={{ minWidth: 200, flex: 1 }}>
                  <TextField
                    label={locale === "tr" ? "Soyad" : locale === "en" ? "Last name" : locale === "fr" ? "Nom" : locale === "es" ? "Apellidos" : locale === "it" ? "Cognome" : "Nachname"}
                    value={accLastName}
                    onChange={setAccLastName}
                    autoComplete="family-name"
                  />
                </div>
              </InlineStack>
              <TextField
                label={locale === "tr" ? "E-posta (giriş)" : locale === "en" ? "Email (login)" : locale === "fr" ? "E-mail (connexion)" : locale === "es" ? "E-mail (acceso)" : locale === "it" ? "E-mail (accesso)" : "E-Mail (Anmeldung)"}
                type="email"
                value={accEmail}
                onChange={setAccEmail}
                autoComplete="email"
              />
              <InlineStack gap="200">
                <Button variant="primary" onClick={saveAccount} loading={accSaving}>
                  {locale === "tr" ? "Kaydet" : locale === "en" ? "Save" : locale === "fr" ? "Enregistrer" : locale === "es" ? "Guardar" : locale === "it" ? "Salva" : "Speichern"}
                </Button>
                <Button onClick={cancelEditAccount} disabled={accSaving}>
                  {ui.cancel}
                </Button>
              </InlineStack>
            </BlockStack>
          ) : (
          <BlockStack gap="200">
            <div>
              <Text variant="bodySm" tone="subdued">
                {locale === "tr" ? "Ad" : locale === "en" ? "Name" : locale === "fr" ? "Nom" : locale === "es" ? "Nombre" : locale === "it" ? "Nome" : "Name"}
              </Text>
              <Text variant="bodyMd" as="p" fontWeight="semibold">
                {displayName}
              </Text>
            </div>
            <div>
              <Text variant="bodySm" tone="subdued">
                {locale === "tr" ? "E-posta (giriş)" : locale === "en" ? "Email (login)" : locale === "fr" ? "E-mail (connexion)" : locale === "es" ? "E-mail (acceso)" : locale === "it" ? "E-mail (accesso)" : "E-Mail (Anmeldung)"}
              </Text>
              <Text variant="bodyMd" as="p" fontWeight="semibold">
                {account?.email || "—"}
              </Text>
            </div>
            {account?.store_name ? (
              <div>
                <Text variant="bodySm" tone="subdued">
                  {locale === "tr" ? "Mağaza / Görünen ad" : locale === "en" ? "Shop / Display name" : locale === "fr" ? "Boutique / nom affiché" : locale === "es" ? "Tienda / nombre visible" : locale === "it" ? "Negozio / nome visualizzato" : "Shop / Anzeigename"}
                </Text>
                <Text variant="bodyMd" as="p">
                  {account.store_name}
                </Text>
              </div>
            ) : null}
            <div>
              <Text variant="bodySm" tone="subdued">
                {locale === "tr" ? "Satıcı kimliği" : locale === "en" ? "Seller ID" : locale === "fr" ? "ID vendeur" : locale === "es" ? "ID de vendedor" : locale === "it" ? "ID venditore" : "Verkäufer-ID"}
              </Text>
              <Text variant="bodyMd" as="p">
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{account?.seller_id || "—"}</span>
              </Text>
            </div>
            <div>
              <Text variant="bodySm" tone="subdued">
                {locale === "tr" ? "Hesap tarihi" : locale === "en" ? "Account since" : locale === "fr" ? "Compte depuis" : locale === "es" ? "Cuenta desde" : locale === "it" ? "Account dal" : "Konto seit"}
              </Text>
              <Text variant="bodyMd" as="p">
                {formatJoined(account?.created_at, locale)}
              </Text>
            </div>
          </BlockStack>
          )}
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">
            {locale === "tr" ? "Şifre değiştir" : locale === "en" ? "Change password" : locale === "fr" ? "Changer le mot de passe" : locale === "es" ? "Cambiar contraseña" : locale === "it" ? "Cambia password" : "Passwort ändern"}
          </Text>
          <Text as="p" tone="subdued">
            {locale === "tr" ? "Başka hiçbir yerde kullanmadığınız güvenli bir şifre seçin." : locale === "en" ? "Choose a secure password that you do not use anywhere else." : locale === "fr" ? "Choisissez un mot de passe sûr que vous n’utilisez nulle part ailleurs." : locale === "es" ? "Elige una contraseña segura que no uses en ningún otro sitio." : locale === "it" ? "Scegli una password sicura che non usi altrove." : "Wählen Sie ein sicheres Passwort, das Sie nirgendwo woanders verwenden."}
          </Text>
          <form onSubmit={submitPassword}>
            <BlockStack gap="300">
              <TextField
                label={locale === "tr" ? "Mevcut şifre" : locale === "en" ? "Current password" : locale === "fr" ? "Mot de passe actuel" : locale === "es" ? "Contraseña actual" : locale === "it" ? "Password attuale" : "Aktuelles Passwort"}
                type="password"
                value={currentPw}
                onChange={setCurrentPw}
                autoComplete="current-password"
              />
              <TextField
                label={locale === "tr" ? "Yeni şifre" : locale === "en" ? "New password" : locale === "fr" ? "Nouveau mot de passe" : locale === "es" ? "Nueva contraseña" : locale === "it" ? "Nuova password" : "Neues Passwort"}
                type={showNewPw ? "text" : "password"}
                value={newPw}
                onChange={setNewPw}
                autoComplete="new-password"
                helpText={locale === "tr" ? "En az 8 karakter, bir harf ve bir rakam" : locale === "en" ? "At least 8 characters, one letter and one number" : locale === "fr" ? "Au moins 8 caractères, une lettre et un chiffre" : locale === "es" ? "Al menos 8 caracteres, una letra y un número" : locale === "it" ? "Almeno 8 caratteri, una lettera e un numero" : "Mindestens 8 Zeichen, ein Buchstabe und eine Zahl"}
                suffix={
                  <Button variant="plain" size="slim" onClick={() => setShowNewPw((v) => !v)}>
                    {showNewPw ? (locale === "tr" ? "Gizle" : locale === "en" ? "Hide" : locale === "fr" ? "Masquer" : locale === "es" ? "Ocultar" : locale === "it" ? "Nascondi" : "Verbergen") : (locale === "tr" ? "Göster" : locale === "en" ? "Show" : locale === "fr" ? "Afficher" : locale === "es" ? "Mostrar" : locale === "it" ? "Mostra" : "Anzeigen")}
                  </Button>
                }
              />
              <TextField
                label={locale === "tr" ? "Yeni şifreyi onayla" : locale === "en" ? "Confirm new password" : locale === "fr" ? "Confirmer le nouveau mot de passe" : locale === "es" ? "Confirmar nueva contraseña" : locale === "it" ? "Conferma nuova password" : "Neues Passwort bestätigen"}
                type={showConfirmPw ? "text" : "password"}
                value={confirmPw}
                onChange={setConfirmPw}
                autoComplete="new-password"
                suffix={
                  <Button variant="plain" size="slim" onClick={() => setShowConfirmPw((v) => !v)}>
                    {showConfirmPw ? (locale === "tr" ? "Gizle" : locale === "en" ? "Hide" : locale === "fr" ? "Masquer" : locale === "es" ? "Ocultar" : locale === "it" ? "Nascondi" : "Verbergen") : (locale === "tr" ? "Göster" : locale === "en" ? "Show" : locale === "fr" ? "Afficher" : locale === "es" ? "Mostrar" : locale === "it" ? "Mostra" : "Anzeigen")}
                  </Button>
                }
              />
              <InlineStack gap="300">
                <Button variant="primary" submit loading={saving}>
                  {locale === "tr" ? "Şifreyi kaydet" : locale === "en" ? "Save password" : locale === "fr" ? "Enregistrer le mot de passe" : locale === "es" ? "Guardar contraseña" : locale === "it" ? "Salva password" : "Passwort speichern"}
                </Button>
              </InlineStack>
            </BlockStack>
          </form>
        </BlockStack>
      </Card>

      <DevicesCard locale={locale} />

      <TotpSetupCard locale={locale} />
    </BlockStack>
  );
}
