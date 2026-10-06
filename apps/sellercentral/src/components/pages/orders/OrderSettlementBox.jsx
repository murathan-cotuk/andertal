"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { lt, fmtMoney } from "@/lib/locale-text";

/**
 * Superuser-only settlement facts of one order (from the canonical payables): which seller is
 * owed what, payout status, and the delivery confirmation that starts the 14-day hold. Orders
 * shipped without carrier tracking can be confirmed here (audited in the backend).
 */
export default function OrderSettlementBox({ orderId, order, onChanged }) {
  const locale = useLocale();
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const [data, setData] = useState(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setData(await getMedusaAdminClient().getSettlementOrder(orderId)); } catch (e) { setErr(e?.message || "Error"); }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);

  const confirm = async () => {
    setBusy(true); setErr("");
    try {
      await getMedusaAdminClient().confirmSettlementDelivery(orderId, `${date}T00:00:00Z`);
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const confirmedAt = order?.delivery_confirmed_at;
  const cell = { padding: "4px 8px 4px 0", fontSize: 12.5, borderBottom: "1px solid #f3eee6" };
  return (
    <div>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "#5e574e" }}>
        {t("Delivery confirmed (payout clock)", "Teslim onayı (ödeme saati)", "Livraison confirmée (délai)", "Entrega confirmada (plazo)", "Consegna confermata (termine)", "Zustellung bestätigt (Auszahlungsfrist)")}:{" "}
        <strong>{confirmedAt ? `${new Date(confirmedAt).toLocaleDateString("de-DE")} (${order?.delivery_confirmed_source || "—"})` : t("no", "hayır", "non", "no", "no", "nein")}</strong>
      </p>
      {!confirmedAt && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: "4px 6px", border: "1px solid #e6dfd4", borderRadius: 6, fontSize: 12 }} />
          <button type="button" disabled={!date || busy} onClick={confirm}
            style={{ padding: "5px 10px", fontSize: 12, borderRadius: 6, border: "1px solid #a65300", background: date ? "#a65300" : "#e6dfd4", color: "#fff", cursor: date ? "pointer" : "not-allowed" }}>
            {t("Confirm delivery", "Teslimi onayla", "Confirmer la livraison", "Confirmar entrega", "Conferma consegna", "Zustellung bestätigen")}
          </button>
        </div>
      )}
      {err && <p style={{ color: "#b42318", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}
      {data?.payables?.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#5e574e", fontSize: 11, textTransform: "uppercase", textAlign: "left" }}>
              <th style={cell}>Seller</th><th style={cell}>{t("Type", "Tür", "Type", "Tipo", "Tipo", "Art")}</th>
              <th style={cell}>Netto</th><th style={cell}>Status</th><th style={cell}>{t("Eligible from", "Ödenebilir", "Éligible dès", "Elegible desde", "Pagabile dal", "Auszahlbar ab")}</th>
            </tr>
          </thead>
          <tbody>
            {data.payables.map((p) => (
              <tr key={p.id}>
                <td style={cell}>{p.seller_id}</td>
                <td style={cell}>{p.kind}</td>
                <td style={cell}>{fmtMoney(Number(p.net_cents), locale)}</td>
                <td style={cell}><code>{p.status}</code>{p.block_reasons?.length ? ` (${p.block_reasons.join(", ")})` : ""}</td>
                <td style={cell}>{p.eligible_at ? new Date(p.eligible_at).toLocaleDateString("de-DE") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: 12.5, color: "#a39a8d", margin: 0 }}>{t("No settlement records (order before settlement cutover).", "Hesap kesim kaydı yok (geçişten önceki sipariş).", "Aucun règlement (commande antérieure).", "Sin liquidación (pedido anterior).", "Nessuna liquidazione (ordine precedente).", "Keine Abrechnungsdaten (Bestellung vor Settlement-Umstellung).")}</p>
      )}
    </div>
  );
}
