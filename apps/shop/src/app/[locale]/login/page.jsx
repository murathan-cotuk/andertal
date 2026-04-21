"use client";

import React, { useState } from "react";
import { useRouter, Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useMedusaAuth } from "@/hooks/useMedusaAuth";
import { useCustomerAuth as useAuth, useAuthGuard } from "@belucha/lib";
import { tokens } from "@/design-system/tokens";

/* ── Monkey SVG (password‑blind feature) ─────────────────── */
function MonkeyAvatar({ isBlind }) {
  return (
    <div style={{
      width: 96, height: 96,
      borderRadius: "50%",
      border: "2.5px solid #1A1A1A",
      background: "#fff8f0",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", flexShrink: 0, position: "relative",
      boxShadow: "0 3px 0 2px #1A1A1A",
    }}>
      {/* monkey body */}
      <svg xmlns="http://www.w3.org/2000/svg" width="70" height="70" viewBox="0 0 64 64" style={{ position: "absolute" }}>
        <ellipse cx="53.7" cy="33" rx="8.3" ry="8.2" fill="#89664c" />
        <ellipse cx="53.7" cy="33" rx="5.4" ry="5.4" fill="#ffc5d3" />
        <ellipse cx="10.2" cy="33" rx="8.2" ry="8.2" fill="#89664c" />
        <ellipse cx="10.2" cy="33" rx="5.4" ry="5.4" fill="#ffc5d3" />
        <path fill="#89664c" d="m43.4 10.8c1.1-.6 1.9-.9 1.9-.9-3.2-1.1-6-1.8-8.5-2.1 1.3-1 2.1-1.3 2.1-1.3-20.4-2.9-30.1 9-30.1 19.5h46.4c-.7-7.4-4.8-12.4-11.8-15.2" />
        <path fill="#89664c" d="m55.3 27.6c0-9.7-10.4-17.6-23.3-17.6s-23.3 7.9-23.3 17.6c0 2.3.6 4.4 1.6 6.4-1 2-1.6 4.2-1.6 6.4 0 9.7 10.4 17.6 23.3 17.6s23.3-7.9 23.3-17.6c0-2.3-.6-4.4-1.6-6.4 1-2 1.6-4.2 1.6-6.4" />
        <path fill="#e0ac7e" d="m52 28.2c0-16.9-20-6.1-20-6.1s-20-10.8-20 6.1c0 4.7 2.9 9 7.5 11.7-1.3 1.7-2.1 3.6-2.1 5.7 0 6.1 6.6 11 14.7 11s14.7-4.9 14.7-11c0-2.1-.8-4-2.1-5.7 4.4-2.7 7.3-7 7.3-11.7" />
        <path fill="#3b302a" d="m35.1 38.7c0 1.1-.4 2.1-1 2.1-.6 0-1-.9-1-2.1 0-1.1.4-2.1 1-2.1.6.1 1 1 1 2.1" />
        <path fill="#3b302a" d="m30.9 38.7c0 1.1-.4 2.1-1 2.1-.6 0-1-.9-1-2.1 0-1.1.4-2.1 1-2.1.5.1 1 1 1 2.1" />
        <ellipse cx="40.7" cy={isBlind ? 30 : 31.7} rx="3.5" ry={isBlind ? 0.5 : 4.5} fill="#3b302a" />
        <ellipse cx="23.3" cy={isBlind ? 30 : 31.7} rx="3.5" ry={isBlind ? 0.5 : 4.5} fill="#3b302a" />
      </svg>
      {/* hands (covers eyes when password visible = isBlind=false means showing password, hands should cover when password IS visible... wait original logic: isBlind = !showPassword. So when password shown, isBlind=false, hands down. When password hidden, isBlind=true, hands up (covering eyes)) */}
      <svg xmlns="http://www.w3.org/2000/svg" width="70" height="70" viewBox="0 0 64 64" style={{
        position: "absolute",
        transform: isBlind
          ? "translate3d(0, 0, 0) rotateX(0deg)"
          : "translateY(calc(70px / 1.25)) rotateX(-21deg)",
        transition: "transform 0.2s ease",
        transformOrigin: "50% 100%",
      }}>
        <path fill="#89664C" d="M9.4,32.5L2.1,61.9H14c-1.6-7.7,4-21,4-21L9.4,32.5z" />
        <path fill="#FFD6BB" d="M15.8,24.8c0,0,4.9-4.5,9.5-3.9c2.3,0.3-7.1,7.6-7.1,7.6s9.7-8.2,11.7-5.6c1.8,2.3-8.9,9.8-8.9,9.8s10-8.1,9.6-4.6c-0.3,3.8-7.9,12.8-12.5,13.8C11.5,43.2,6.3,39,9.8,24.4C11.6,17,13.3,25.2,15.8,24.8" />
        <path fill="#89664C" d="M54.8,32.5l7.3,29.4H50.2c1.6-7.7-4-21-4-21L54.8,32.5z" />
        <path fill="#FFD6BB" d="M48.4,24.8c0,0-4.9-4.5-9.5-3.9c-2.3,0.3,7.1,7.6,7.1,7.6s-9.7-8.2-11.7-5.6c-1.8,2.3,8.9,9.8,8.9,9.8s-10-8.1-9.7-4.6c0.4,3.8,8,12.8,12.6,13.8c6.6,1.3,11.8-2.9,8.3-17.5C52.6,17,50.9,25.2,48.4,24.8" />
      </svg>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */
export default function LoginPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/", redirectIfAuthenticated: true });

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const router = useRouter();
  const { login: loginMedusa, loading } = useMedusaAuth();
  const searchParams = useSearchParams();

  const isBlind = !showPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const result = await loginMedusa(formData.email, formData.password);
      if (result?.customer?.id) {
        const token = result.access_token || result.token;
        if (token) {
          login(token, result.customer.id);
          // Set session cookie for middleware-level route protection
          document.cookie = `belucha_cauth=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
          const redirectTo = searchParams.get("redirect") || "/";
          router.push(redirectTo);
          router.refresh();
        } else {
          setError("Anmeldung fehlgeschlagen. Bitte prüfe deine Zugangsdaten.");
        }
      } else {
        setError("Anmeldung fehlgeschlagen. Bitte prüfe deine Zugangsdaten.");
      }
    } catch (err) {
      setError(err.message || "Ein unerwarteter Fehler ist aufgetreten.");
    }
  };

  const inp = {
    width: "100%", padding: "11px 14px",
    border: "2px solid #1A1A1A", borderRadius: 8,
    fontSize: 15, color: "#1A1A1A", background: "#fff",
    boxSizing: "border-box", outline: "none",
    fontFamily: tokens.fontFamily.sans,
    transition: "box-shadow 0.15s",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa", fontFamily: tokens.fontFamily.sans }}>
      {/* Top bar */}
      <div style={{ padding: "16px 24px" }}>
        <Link href="/" style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", textDecoration: "none", letterSpacing: "-0.03em" }}>
          Belucha
        </Link>
      </div>

      {/* Center card */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{
          width: "100%", maxWidth: 420,
          background: "#fff",
          border: "2px solid #1A1A1A",
          borderRadius: 16,
          boxShadow: "4px 4px 0 0 #1A1A1A",
          padding: "40px 36px 36px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 28,
        }}>
          {/* Monkey */}
          <MonkeyAvatar isBlind={isBlind} />

          {/* Heading */}
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.03em" }}>
              Willkommen zurück
            </h1>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
              Melde dich an, um dein Konto zu nutzen
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{ width: "100%", padding: "10px 14px", background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 8, color: "#dc2626", fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Email */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="login-email" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>E-Mail</label>
              <input
                id="login-email"
                type="email"
                placeholder="deine@email.de"
                value={formData.email}
                onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                required
                style={inp}
                onFocus={e => e.target.style.boxShadow = `0 0 0 3px ${tokens.primary.light}`}
                onBlur={e => e.target.style.boxShadow = "none"}
              />
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label htmlFor="login-password" style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Passwort</label>
                <Link href="/forgot-password" style={{ fontSize: 12, color: tokens.primary.DEFAULT, textDecoration: "none", fontWeight: 600 }}>
                  Vergessen?
                </Link>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Dein Passwort"
                  value={formData.password}
                  onChange={e => setFormData(f => ({ ...f, password: e.target.value }))}
                  required
                  style={{ ...inp, paddingRight: 90 }}
                  onFocus={e => e.target.style.boxShadow = `0 0 0 3px ${tokens.primary.light}`}
                  onBlur={e => e.target.style.boxShadow = "none"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, color: tokens.primary.DEFAULT,
                    padding: "3px 6px",
                  }}
                >
                  {showPassword ? "Verbergen" : "Anzeigen"}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "13px 0",
                background: loading ? "#ccc" : tokens.primary.DEFAULT,
                color: "#fff",
                border: `2px solid ${loading ? "#bbb" : "#1A1A1A"}`,
                borderRadius: 8,
                fontSize: 15, fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 3px 0 2px #1A1A1A",
                transition: "transform 0.1s, box-shadow 0.1s",
                letterSpacing: 0.2,
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = "translateY(1px)"; e.currentTarget.style.boxShadow = "0 2px 0 2px #1A1A1A"; } }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = loading ? "none" : "0 3px 0 2px #1A1A1A"; }}
            >
              {loading ? "Wird angemeldet…" : "Anmelden"}
            </button>
          </form>

          {/* Register link */}
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0, textAlign: "center" }}>
            Noch kein Konto?{" "}
            <Link href="/register" style={{ color: tokens.primary.DEFAULT, fontWeight: 700, textDecoration: "none" }}>
              Jetzt registrieren
            </Link>
          </p>
        </div>
      </div>

      {/* Footer hint */}
      <div style={{ padding: "16px 24px", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
        © {new Date().getFullYear()} Belucha
      </div>
    </div>
  );
}
