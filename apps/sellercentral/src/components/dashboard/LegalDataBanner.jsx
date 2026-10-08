"use client";

import { useEffect, useState } from "react";
import { Banner } from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { lt } from "@/lib/locale-text";
import { approvalBlockerLabel } from "@/lib/seller-approval-blockers";

/**
 * Missing required seller data (tax number, LUCID, address, agreement …) — shown to the seller on
 * the dashboard until complete, also for already approved accounts.
 */
export default function LegalDataBanner({ locale }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getMedusaAdminClient().request("/admin-hub/v1/seller/approval-readiness")
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const blockers = Array.isArray(data?.blockers) ? data.blockers : [];
  if (!blockers.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <Banner
        tone="warning"
        title={lt(locale, "Required details missing", "Zorunlu bilgiler eksik", "Informations obligatoires manquantes", "Faltan datos obligatorios", "Dati obbligatori mancanti", "Pflichtangaben fehlen")}
        action={{ content: lt(locale, "Complete now", "Şimdi tamamla", "Compléter", "Completar", "Completa ora", "Jetzt ergänzen"), onAction: () => router.push("/settings/verification") }}
      >
        <p>{lt(locale,
          "These details are required by law for selling on the marketplace:",
          "Pazaryerinde satış için yasal olarak gerekli bilgiler:",
          "Ces informations sont légalement requises pour vendre sur la marketplace :",
          "Estos datos son legalmente obligatorios para vender en el marketplace:",
          "Questi dati sono obbligatori per legge per vendere sul marketplace:",
          "Diese Angaben sind für den Verkauf auf dem Marktplatz gesetzlich erforderlich:")}</p>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {blockers.map((b) => <li key={b}>{approvalBlockerLabel(locale, b)}</li>)}
        </ul>
      </Banner>
    </div>
  );
}
