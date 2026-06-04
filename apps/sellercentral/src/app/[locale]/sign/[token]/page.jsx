"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";

const BACKEND_URL = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "https://api.andertal.com").replace(/\/$/, "");

const LABELS = {
  de: {
    loginHeading: "Anmeldung erforderlich",
    loginSub: "Bitte melden Sie sich mit Ihren Andertal-Zugangsdaten an, um fortzufahren.",
    emailPlaceholder: "E-Mail-Adresse",
    passwordPlaceholder: "Passwort",
    loginBtn: "Weiter zur Unterzeichnung",
    signHeading: "Unterschreiben Sie hier",
    signSub: "Bitte unterschreiben Sie in dem gelben Feld mit Ihrem Finger oder der Maus.",
    clearBtn: "Loeschen",
    submitBtn: "Vereinbarung unterzeichnen",
    successHeading: "Vielen Dank!",
    successMsg: "Ihre Unterschrift wurde erfolgreich gespeichert. Sie koennen zu Andertal Sellercentral zurueckkehren und dieses Fenster schliessen.",
    expiredMsg: "Dieser Link ist abgelaufen oder ungueltig. Bitte fordern Sie einen neuen Link im Sellercentral an.",
    alreadyMsg: "Diese Vereinbarung wurde bereits unterzeichnet.",
    errorLogin: "E-Mail oder Passwort falsch.",
    errorGeneral: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
    signing: "Wird verarbeitet...",
  },
  tr: {
    loginHeading: "Giris Gerekli",
    loginSub: "Devam etmek icin Andertal hesap bilgilerinizle giris yapin.",
    emailPlaceholder: "E-Posta Adresi",
    passwordPlaceholder: "Sifre",
    loginBtn: "Imzalamaya Devam Et",
    signHeading: "Buraya Imzalayin",
    signSub: "Lutfen sari kutucugun icine parmaginiz veya fare ile imzanizi atin.",
    clearBtn: "Temizle",
    submitBtn: "Sozlesmeyi Imzala",
    successHeading: "Tesekkurler!",
    successMsg: "Imzaniz basariyla kaydedildi. Andertal Satici Merkezine geri donup bu ekrani kapatabilirsiniz.",
    expiredMsg: "Bu baglanti suresi dolmus veya gecersiz. Lutfen Satici Merkezinden yeni bir baglanti talebinde bulunun.",
    alreadyMsg: "Bu sozlesme daha once imzalanmistir.",
    errorLogin: "E-posta veya sifre hatali.",
    errorGeneral: "Bir hata olustu. Lutfen tekrar deneyin.",
    signing: "Isleniyor...",
  },
  en: {
    loginHeading: "Login Required",
    loginSub: "Please log in with your Andertal credentials to continue.",
    emailPlaceholder: "Email Address",
    passwordPlaceholder: "Password",
    loginBtn: "Continue to Sign",
    signHeading: "Sign Here",
    signSub: "Please sign inside the yellow box using your finger or mouse.",
    clearBtn: "Clear",
    submitBtn: "Sign Agreement",
    successHeading: "Thank You!",
    successMsg: "Your signature has been saved successfully. You can return to Andertal Sellercentral and close this window.",
    expiredMsg: "This link has expired or is invalid. Please request a new link in Sellercentral.",
    alreadyMsg: "This agreement has already been signed.",
    errorLogin: "Incorrect email or password.",
    errorGeneral: "An error occurred. Please try again.",
    signing: "Processing...",
  },
  fr: {
    loginHeading: "Connexion requise",
    loginSub: "Veuillez vous connecter avec vos identifiants Andertal pour continuer.",
    emailPlaceholder: "Adresse e-mail",
    passwordPlaceholder: "Mot de passe",
    loginBtn: "Continuer vers la signature",
    signHeading: "Signez ici",
    signSub: "Veuillez signer dans le cadre jaune avec votre doigt ou la souris.",
    clearBtn: "Effacer",
    submitBtn: "Signer l'accord",
    successHeading: "Merci !",
    successMsg: "Votre signature a ete enregistree. Vous pouvez retourner a Andertal Sellercentral et fermer cette fenetre.",
    expiredMsg: "Ce lien a expire. Veuillez demander un nouveau lien dans Sellercentral.",
    alreadyMsg: "Cet accord a deja ete signe.",
    errorLogin: "E-mail ou mot de passe incorrect.",
    errorGeneral: "Une erreur est survenue. Veuillez reessayer.",
    signing: "Traitement en cours...",
  },
  es: {
    loginHeading: "Inicio de sesion requerido",
    loginSub: "Inicie sesion con sus credenciales de Andertal para continuar.",
    emailPlaceholder: "Correo electronico",
    passwordPlaceholder: "Contrasena",
    loginBtn: "Continuar para firmar",
    signHeading: "Firme aqui",
    signSub: "Por favor firme dentro del cuadro amarillo con su dedo o el raton.",
    clearBtn: "Borrar",
    submitBtn: "Firmar el acuerdo",
    successHeading: "Gracias!",
    successMsg: "Su firma se ha guardado. Puede volver a Andertal Sellercentral y cerrar esta ventana.",
    expiredMsg: "Este enlace ha caducado. Solicite un nuevo enlace en Sellercentral.",
    alreadyMsg: "Este acuerdo ya ha sido firmado.",
    errorLogin: "Correo o contrasena incorrectos.",
    errorGeneral: "Se ha producido un error. Intentelo de nuevo.",
    signing: "Procesando...",
  },
  it: {
    loginHeading: "Accesso richiesto",
    loginSub: "Acceda con le credenziali Andertal per continuare.",
    emailPlaceholder: "Indirizzo e-mail",
    passwordPlaceholder: "Password",
    loginBtn: "Continua per firmare",
    signHeading: "Firma qui",
    signSub: "Si prega di firmare nel riquadro giallo con il dito o il mouse.",
    clearBtn: "Cancella",
    submitBtn: "Firma l'accordo",
    successHeading: "Grazie!",
    successMsg: "La sua firma e stata salvata. Puo tornare ad Andertal Sellercentral e chiudere questa finestra.",
    expiredMsg: "Questo link e scaduto. Richieda un nuovo link in Sellercentral.",
    alreadyMsg: "Questo accordo e gia stato firmato.",
    errorLogin: "E-mail o password errati.",
    errorGeneral: "Si e verificato un errore. Riprovi.",
    signing: "Elaborazione in corso...",
  },
};

export default function SignPage() {
  const { token } = useParams();
  const locale = useLocale();
  const t = LABELS[locale] || LABELS.en;

  const [step, setStep] = useState("loading"); // loading | expired | already | login | sign | success
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [signSession, setSignSession] = useState(null);
  const [signError, setSignError] = useState("");
  const [signLoading, setSignLoading] = useState(false);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!token) return;
    fetch(`${BACKEND_URL}/public/sign/${token}`)
      .then((r) => r.json().then((d) => ({ _status: r.status, ...d })))
      .then((data) => {
        if (data._status === 404) { setStep("expired"); return; }
        if (data._status === 410 || data.signed) { setStep("already"); return; }
        setStep("login");
      })
      .catch(() => setStep("expired"));
  }, [token]); // intentionally omits BACKEND_URL (constant)

  useEffect(() => {
    if (step !== "sign") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      const src = e.touches ? e.touches[0] : e;
      return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
    };
    const onStart = (e) => { e.preventDefault(); drawingRef.current = true; lastPosRef.current = getPos(e); };
    const onMove = (e) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const p = getPos(e);
      const ctx = canvas.getContext("2d");
      ctx.beginPath(); ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#111"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.stroke();
      lastPosRef.current = p;
    };
    const onEnd = () => { drawingRef.current = false; };

    canvas.addEventListener("mousedown", onStart);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onEnd);
    canvas.addEventListener("mouseleave", onEnd);
    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onEnd);
    return () => {
      canvas.removeEventListener("mousedown", onStart);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onEnd);
      canvas.removeEventListener("mouseleave", onEnd);
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
    };
  }, [step]);

  const handleLogin = async () => {
    setLoginError("");
    if (!email || !password) { setLoginError(t.errorGeneral); return; }
    setLoginLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/seller/sign/${token}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) { setLoginError(data.message || t.errorLogin); return; }
      setSignSession(data.sign_session);
      setStep("sign");
    } catch { setLoginError(t.errorGeneral); }
    finally { setLoginLoading(false); }
  };

  const handleSubmit = async () => {
    setSignError("");
    const canvas = canvasRef.current;
    if (!canvas) return;
    const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    if (!Array.from(px).some((v, i) => i % 4 === 3 && v > 10)) { setSignError(t.signSub); return; }
    setSignLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/seller/sign/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sign_session: signSession, signature_data: canvas.toDataURL("image/png") }),
      });
      const data = await r.json();
      if (!r.ok) { setSignError(data.message || t.errorGeneral); return; }
      setStep("success");
    } catch { setSignError(t.errorGeneral); }
    finally { setSignLoading(false); }
  };

  const s = {
    page: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", margin: 0, background: "#f5f5f5", minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px 64px", boxSizing: "border-box" },
    card: { background: "#fff", borderRadius: 14, boxShadow: "0 2px 20px rgba(0,0,0,.10)", padding: "36px 28px", width: "100%", maxWidth: 440, marginTop: 16 },
    logo: { textAlign: "center", marginBottom: 24, fontSize: 22, fontWeight: 800, color: "#136761", letterSpacing: -0.5 },
    h2: { margin: "0 0 6px", fontSize: 19, fontWeight: 700, color: "#111" },
    sub: { color: "#666", fontSize: 14, marginBottom: 20, lineHeight: 1.5, margin: "0 0 20px" },
    input: { width: "100%", padding: "12px 14px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 15, outline: "none", boxSizing: "border-box", WebkitAppearance: "none", marginBottom: 14, display: "block" },
    btn: { width: "100%", padding: 13, background: "#136761", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: "pointer", display: "block" },
    btnDisabled: { background: "#999", cursor: "not-allowed" },
    error: { color: "#c00", fontSize: 13, marginTop: 10, textAlign: "center" },
    canvas: { display: "block", width: "100%", height: 180, border: "3px solid #f5c842", borderRadius: 6, background: "#fff", touchAction: "none", cursor: "crosshair" },
    btnRow: { display: "flex", gap: 10, marginTop: 14 },
    btnClear: { flex: "0 0 90px", background: "#eee", color: "#333", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, padding: "12px 0", cursor: "pointer" },
    center: { textAlign: "center", color: "#555", fontSize: 15, lineHeight: 1.6 },
    successH: { fontSize: 22, fontWeight: 700, color: "#136761", textAlign: "center", margin: "8px 0" },
    icon: { fontSize: 48, textAlign: "center" },
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>Andertal</div>

        {step === "loading" && <div style={s.center}>...</div>}

        {step === "expired" && <div style={s.center}>{t.expiredMsg}</div>}

        {step === "already" && (
          <>
            <div style={s.icon}>&#10003;</div>
            <div style={s.center}>{t.alreadyMsg}</div>
          </>
        )}

        {step === "login" && (
          <>
            <h2 style={s.h2}>{t.loginHeading}</h2>
            <p style={s.sub}>{t.loginSub}</p>
            <input type="email" style={s.input} placeholder={t.emailPlaceholder} value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="username email" />
            <input type="password" style={s.input} placeholder={t.passwordPlaceholder} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            <button style={{ ...s.btn, ...(loginLoading ? s.btnDisabled : {}) }}
              onClick={handleLogin} disabled={loginLoading}>
              {loginLoading ? t.signing : t.loginBtn}
            </button>
            {loginError && <div style={s.error}>{loginError}</div>}
          </>
        )}

        {step === "sign" && (
          <>
            <h2 style={s.h2}>{t.signHeading}</h2>
            <p style={s.sub}>{t.signSub}</p>
            <canvas ref={canvasRef} width={800} height={300} style={s.canvas} />
            <div style={s.btnRow}>
              <button style={s.btnClear}
                onClick={() => canvasRef.current?.getContext("2d").clearRect(0, 0, 800, 300)}>
                {t.clearBtn}
              </button>
              <button style={{ ...s.btn, flex: 1, ...(signLoading ? s.btnDisabled : {}) }}
                onClick={handleSubmit} disabled={signLoading}>
                {signLoading ? t.signing : t.submitBtn}
              </button>
            </div>
            {signError && <div style={s.error}>{signError}</div>}
          </>
        )}

        {step === "success" && (
          <>
            <div style={s.icon}>&#10003;</div>
            <div style={s.successH}>{t.successHeading}</div>
            <div style={s.center}>{t.successMsg}</div>
          </>
        )}
      </div>
    </div>
  );
}
