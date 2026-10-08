"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { lt } from "@/lib/locale-text";

const API = () => (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").replace(/\/$/, "");

const inputStyle = { width: "100%", padding: "10px 14px", border: "1.5px solid #d6ccbd", borderRadius: 8, fontSize: 15, outline: "none", boxSizing: "border-box" };
const labelStyle = { display: "block", fontSize: 14, fontWeight: 500, color: "#3a352f", marginBottom: 6 };
const btnStyle = (busy) => ({ padding: "12px", background: busy ? "#a39a8d" : "#1d1b18", color: "#fff", border: "none", borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" });
const box = (ok) => ({ marginBottom: 14, padding: "10px 12px", borderRadius: 8, fontSize: 13, background: ok ? "#ecfdf5" : "#fef2f2", border: `1px solid ${ok ? "#86efac" : "#fca5a5"}`, color: ok ? "#166534" : "#b91c1c" });

/**
 * Seller password reset (backend: /admin-hub/auth/password-token + /password-reset).
 * mode "request": e-mail form; mode "reset": new password from the e-mailed one-time link.
 */
export default function PasswordResetCard({ mode, token = "" }) {
  const locale = useLocale();
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  const rule = t("At least 8 characters, with a letter and a digit.", "En az 8 karakter; bir harf ve bir rakam.", "Au moins 8 caractères, avec une lettre et un chiffre.", "Al menos 8 caracteres, con una letra y un número.", "Almeno 8 caratteri, con una lettera e una cifra.", "Mindestens 8 Zeichen, mit einem Buchstaben und einer Ziffer.");
  const invalid = t("This link is invalid or has expired. Please request a new one.", "Bağlantı geçersiz veya süresi dolmuş. Lütfen yenisini isteyin.", "Ce lien est invalide ou a expiré. Veuillez en demander un nouveau.", "El enlace no es válido o ha caducado. Solicita uno nuevo.", "Il link non è valido o è scaduto. Richiedine uno nuovo.", "Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an.");

  const request = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await fetch(`${API()}/admin-hub/auth/password-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), locale }),
      });
    } catch (_) { /* same answer either way */ }
    setMsg({ ok: true, text: t("If an account exists for this e-mail, we have sent a link to reset the password.", "Bu e-postaya ait bir hesap varsa, şifre sıfırlama bağlantısı gönderdik.", "Si un compte existe pour cet e-mail, nous avons envoyé un lien de réinitialisation.", "Si existe una cuenta con este correo, hemos enviado un enlace para restablecer la contraseña.", "Se esiste un account per questa e-mail, abbiamo inviato un link per reimpostare la password.", "Falls ein Konto mit dieser E-Mail existiert, haben wir einen Link zum Zurücksetzen gesendet.") });
    setBusy(false);
  };

  const reset = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) { setMsg({ ok: false, text: rule }); return; }
    if (pw !== pw2) { setMsg({ ok: false, text: t("The passwords do not match.", "Şifreler eşleşmiyor.", "Les mots de passe ne correspondent pas.", "Las contraseñas no coinciden.", "Le password non coincidono.", "Die Passwörter stimmen nicht überein.") }); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API()}/admin-hub/auth/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setMsg({ ok: true, done: true, text: t("Your password has been changed. All devices were signed out — please sign in again.", "Şifreniz değiştirildi. Tüm cihazlarda oturum kapatıldı; lütfen yeniden giriş yapın.", "Votre mot de passe a été modifié. Tous les appareils ont été déconnectés — reconnectez-vous.", "Tu contraseña se ha cambiado. Se cerró la sesión en todos los dispositivos; vuelve a iniciar sesión.", "La password è stata modificata. Tutti i dispositivi sono stati disconnessi — accedi di nuovo.", "Ihr Passwort wurde geändert. Alle Geräte wurden abgemeldet — bitte melden Sie sich neu an.") });
      } else {
        setMsg({ ok: false, text: data?.code === "weak_password" ? rule : invalid });
      }
    } catch (_) {
      setMsg({ ok: false, text: invalid });
    }
    setBusy(false);
  };

  const title = mode === "request"
    ? t("Forgot password", "Şifremi unuttum", "Mot de passe oublié", "Contraseña olvidada", "Password dimenticata", "Passwort vergessen")
    : t("Set a new password", "Yeni şifre belirle", "Définir un nouveau mot de passe", "Establecer nueva contraseña", "Imposta una nuova password", "Neues Passwort festlegen");

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f2ec", padding: 16, boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 24, padding: "clamp(20px, 5vw, 40px) clamp(16px, 4vw, 36px)", boxShadow: "0 0 0 1px rgba(29,27,24,0.06)" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1d1b18", margin: "0 0 18px", textAlign: "center" }}>{title}</h1>
        {msg ? <div style={box(msg.ok)}>{msg.text}</div> : null}
        {mode === "request" && !msg?.ok ? (
          <form onSubmit={request} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>E-Mail</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} autoComplete="email" />
            </div>
            <button type="submit" disabled={busy} style={btnStyle(busy)}>
              {t("Send reset link", "Sıfırlama bağlantısı gönder", "Envoyer le lien", "Enviar enlace", "Invia link", "Link senden")}
            </button>
          </form>
        ) : null}
        {mode === "reset" && !msg?.done ? (
          !token ? <div style={box(false)}>{invalid}</div> : (
            <form onSubmit={reset} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#5e574e" }}>{rule}</p>
              <div>
                <label style={labelStyle}>{t("New password", "Yeni şifre", "Nouveau mot de passe", "Nueva contraseña", "Nuova password", "Neues Passwort")}</label>
                <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} style={inputStyle} autoComplete="new-password" />
              </div>
              <div>
                <label style={labelStyle}>{t("Repeat password", "Şifreyi tekrarla", "Répéter le mot de passe", "Repetir contraseña", "Ripeti la password", "Passwort wiederholen")}</label>
                <input type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} style={inputStyle} autoComplete="new-password" />
              </div>
              <button type="submit" disabled={busy} style={btnStyle(busy)}>
                {t("Save password", "Şifreyi kaydet", "Enregistrer", "Guardar", "Salva", "Passwort speichern")}
              </button>
            </form>
          )
        ) : null}
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 14 }}>
          <Link href="/login" style={{ color: "#1d1b18", fontWeight: 600, textDecoration: "none" }}>
            {t("Back to sign in", "Girişe dön", "Retour à la connexion", "Volver al inicio de sesión", "Torna all'accesso", "Zurück zur Anmeldung")}
          </Link>
        </p>
      </div>
    </div>
  );
}
