"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

// TASK-14 — real onboarding checklist for a newly registered seller. Verification/KYB is the
// only hard-required item (Stripe Connect, shipping and carrier setup are what a seller actually
// needs configured before they can take & fulfil an order, so those are the "real steps" the
// TASKS.md brief asked for instead of guessed placeholder items).
function isVerificationDone(approvalStatus) {
  const s = String(approvalStatus || "").toLowerCase();
  return s === "approved" || s === "active";
}

function skippedStorageKey(sellerId) {
  return `onboardingSkipped:${sellerId || "default"}`;
}

function loadSkipped(sellerId) {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(skippedStorageKey(sellerId));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSkipped(sellerId, set) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(skippedStorageKey(sellerId), JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export default function OnboardingChecklist({ locale, isSuperuser }) {
  const router = useRouter();
  const t = (en, tr, fr, es, it, de) =>
    locale === "en" ? en : locale === "tr" ? tr : locale === "fr" ? fr : locale === "es" ? es : locale === "it" ? it : de;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null); // { verificationDone, paymentDone, shippingGroupDone, carrierDone }
  const [sellerId, setSellerId] = useState("");
  const [skipped, setSkipped] = useState(new Set());

  useEffect(() => {
    const sid = typeof window !== "undefined" ? localStorage.getItem("sellerId") || "" : "";
    setSellerId(sid);
    setSkipped(loadSkipped(sid));
  }, []);

  useEffect(() => {
    if (isSuperuser) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const client = getMedusaAdminClient();
      const [account, shippingGroups, carriers] = await Promise.all([
        client.getSellerAccount().catch(() => null),
        client.request("/admin-hub/v1/shipping-groups").catch(() => null),
        client.getCarriers().catch(() => null),
      ]);
      if (cancelled) return;
      const seller = account?.sellerUser || account?.user || {};
      setStatus({
        verificationDone: isVerificationDone(seller?.approval_status),
        shippingGroupDone: Array.isArray(shippingGroups?.groups) ? shippingGroups.groups.length > 0 : false,
        carrierDone: Array.isArray(carriers?.carriers) ? carriers.carriers.length > 0 : false,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isSuperuser]);

  const items = useMemo(() => {
    if (!status) return [];
    return [
      {
        key: "verification",
        required: true,
        done: status.verificationDone,
        label: t("Verify your account", "Hesabınızı doğrulayın", "Vérifiez votre compte", "Verifique su cuenta", "Verifica il tuo account", "Konto verifizieren"),
        sub: t("Required before you can sell", "Satışa başlamadan önce zorunlu", "Requis avant de pouvoir vendre", "Requerido antes de poder vender", "Richiesto prima di poter vendere", "Vor dem Verkaufsstart erforderlich"),
        href: "/settings/verification",
      },
      {
        key: "shipping_group",
        done: status.shippingGroupDone,
        label: t("Create a shipping group", "Kargo grubu oluşturun", "Créez un groupe d'expédition", "Cree un grupo de envío", "Crea un gruppo di spedizione", "Versandgruppe anlegen"),
        sub: t("Defines where and for how much you ship", "Nereye ve ne kadara kargo göndereceğinizi belirler", "Définit où et à quel prix vous expédiez", "Define adónde y por cuánto envía", "Definisce dove e a quanto spedisci", "Legt fest, wohin und zu welchem Preis Sie versenden"),
        href: "/settings/shipping",
      },
      {
        key: "carrier",
        done: status.carrierDone,
        label: t("Connect a carrier", "Bir kargo firması bağlayın", "Connectez un transporteur", "Conecte una transportista", "Collega un corriere", "Versanddienstleister verbinden"),
        sub: t("Needed to print shipping labels", "Kargo etiketi basmak için gerekli", "Nécessaire pour imprimer les étiquettes", "Necesario para imprimir etiquetas", "Necessario per stampare le etichette", "Zum Drucken von Versandetiketten nötig"),
        href: "/settings/shipping",
      },
    ];
  }, [status, locale]);

  const toggleSkip = useCallback((key) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveSkipped(sellerId, next);
      return next;
    });
  }, [sellerId]);

  if (isSuperuser || loading || !status) return null;

  const visible = items.filter((it) => !it.done && !skipped.has(it.key));
  const skippedItems = items.filter((it) => !it.done && skipped.has(it.key));
  if (visible.length === 0 && skippedItems.length === 0) return null;

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: 20, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#111827" }}>
          {t("Get set up", "Kurulumu tamamla", "Terminez votre configuration", "Complete su configuración", "Completa la configurazione", "Einrichtung abschließen")}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
          {t("A few steps before you're ready to sell", "Satışa hazır olmadan önce birkaç adım", "Quelques étapes avant d'être prêt à vendre", "Unos pasos antes de estar listo para vender", "Alcuni passaggi prima di essere pronto a vendere", "Ein paar Schritte, bevor Sie verkaufsbereit sind")}
        </p>
      </div>
      <div style={{ padding: "8px 20px 16px" }}>
        {visible.map((it) => (
          <div key={it.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 6, border: "2px solid #d1d5db" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{it.label}</div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>{it.sub}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              {!it.required && (
                <Button variant="plain" size="slim" onClick={() => toggleSkip(it.key)}>
                  {t("Skip", "Atla", "Ignorer", "Omitir", "Salta", "Überspringen")}
                </Button>
              )}
              <Button size="slim" variant="primary" onClick={() => router.push(it.href)}>
                {t("Do now", "Şimdi yap", "Faire maintenant", "Hacer ahora", "Fai ora", "Jetzt erledigen")}
              </Button>
            </div>
          </div>
        ))}
        {skippedItems.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#9ca3af", alignSelf: "center" }}>
              {t("Postponed:", "Ertelenen:", "Reporté :", "Pospuesto:", "Rinviato:", "Zurückgestellt:")}
            </span>
            {skippedItems.map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={() => toggleSkip(it.key)}
                style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", cursor: "pointer" }}
              >
                {it.label} · {t("show again", "tekrar göster", "réafficher", "mostrar de nuevo", "mostra di nuovo", "wieder anzeigen")}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
