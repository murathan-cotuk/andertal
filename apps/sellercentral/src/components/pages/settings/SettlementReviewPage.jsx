"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Banner, BlockStack, Button, Card, InlineStack, Page, Select, Spinner, Text, TextField } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { lt, fmtMoney } from "@/lib/locale-text";

/**
 * Superuser queue of settlement cases that need a human decision (payout failures, transfers in
 * review, refunds Stripe executed but nobody allocated, failed webhooks, payments without an
 * order, blocked sellers, deliveries without carrier confirmation). Every action is audited in
 * the backend; nothing here changes money by itself without the canonical domain functions.
 */
const th = { textAlign: "left", fontSize: 12, fontWeight: 600, color: "#5e574e", padding: "6px 8px", borderBottom: "1px solid #e6dfd4", whiteSpace: "nowrap" };
const td = { fontSize: 12.5, padding: "6px 8px", borderBottom: "1px solid #f3eee6", verticalAlign: "middle" };

function Section({ title, count, children, empty }) {
  return (
    <Card padding="0">
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3eee6", display: "flex", justifyContent: "space-between" }}>
        <Text variant="headingSm">{title}</Text>
        <Text tone={count ? "critical" : "subdued"}>{count}</Text>
      </div>
      {count ? <div style={{ overflowX: "auto" }}>{children}</div> : <div style={{ padding: "10px 14px" }}><Text tone="subdued">{empty}</Text></div>}
    </Card>
  );
}

export default function SettlementReviewPage() {
  const locale = useLocale();
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const money = (c) => fmtMoney(Number(c || 0), locale);
  const when = (d) => (d ? new Date(d).toLocaleString(locale === "en" ? "en-GB" : "de-DE") : "—");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [ok, setOk] = useState("");
  const [allocSeller, setAllocSeller] = useState({});
  const [allocOptions, setAllocOptions] = useState({});
  const [blockReason, setBlockReason] = useState({});
  const [deliveryDate, setDeliveryDate] = useState({});

  const load = useCallback(async () => {
    setErr("");
    try {
      setData(await getMedusaAdminClient().getSettlementReview());
    } catch (e) {
      setErr(e?.message || "Error");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key, fn, doneMsg) => {
    setBusy(key); setErr(""); setOk("");
    try {
      await fn();
      setOk(doneMsg);
      await load();
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setBusy("");
    }
  };

  const loadAllocOptions = async (refund) => {
    if (allocOptions[refund.id]) return;
    const r = await getMedusaAdminClient().getSettlementOrder(refund.order_id).catch(() => null);
    const sellers = [...new Set((r?.payables || []).map((p) => p.seller_id))];
    setAllocOptions((o) => ({ ...o, [refund.id]: sellers }));
  };

  if (!data) {
    return <Page title={t("Settlement review", "Hesap kesim kontrolü", "Contrôle des règlements", "Revisión de liquidaciones", "Revisione liquidazioni", "Settlement-Prüfung")}>{err ? <Banner tone="critical">{err}</Banner> : <Spinner />}</Page>;
  }

  const done = t("Done.", "Tamamlandı.", "Terminé.", "Hecho.", "Fatto.", "Erledigt.");
  return (
    <Page
      title={t("Settlement review", "Hesap kesim kontrolü", "Contrôle des règlements", "Revisión de liquidaciones", "Revisione liquidazioni", "Settlement-Prüfung")}
      subtitle={t("Cases that need a decision. All actions are written to the finance audit log.", "Karar gerektiren durumlar. Tüm işlemler finans denetim kaydına yazılır.", "Cas nécessitant une décision. Toutes les actions sont journalisées.", "Casos que requieren una decisión. Todas las acciones se registran.", "Casi che richiedono una decisione. Tutte le azioni sono registrate.", "Fälle, die eine Entscheidung brauchen. Jede Aktion wird im Finanz-Audit-Log protokolliert.")}
      secondaryActions={[{ content: t("Reload", "Yenile", "Recharger", "Recargar", "Ricarica", "Neu laden"), onAction: load }]}
    >
      <BlockStack gap="400">
        {err && <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>}
        {ok && <Banner tone="success" onDismiss={() => setOk("")}>{ok}</Banner>}

        <Section title={t("Payouts needing attention", "Dikkat gerektiren ödemeler", "Versements à vérifier", "Pagos a revisar", "Pagamenti da verificare", "Auszahlungen mit Handlungsbedarf")} count={data.payouts.length} empty={t("Nothing open.", "Açık kayıt yok.", "Rien d’ouvert.", "Nada pendiente.", "Niente in sospeso.", "Nichts offen.")}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Seller</th><th style={th}>Status</th><th style={th}>{t("Amount", "Tutar", "Montant", "Importe", "Importo", "Betrag")}</th><th style={th}>{t("Error", "Hata", "Erreur", "Error", "Errore", "Fehler")}</th><th style={th}>{t("Updated", "Güncellendi", "Mis à jour", "Actualizado", "Aggiornato", "Aktualisiert")}</th><th style={th} /></tr></thead>
            <tbody>
              {data.payouts.map((p) => (
                <tr key={p.id}>
                  <td style={td}>{p.store_name || p.seller_id}</td>
                  <td style={td}><code>{p.status}</code></td>
                  <td style={td}>{money(p.amount_cents)}</td>
                  <td style={td}>{p.failure_message || p.failure_code || "—"}</td>
                  <td style={td}>{when(p.updated_at)}</td>
                  <td style={td}>
                    {p.status === "payout_failed" && (
                      <Button size="slim" loading={busy === `retry-${p.id}`} onClick={() => run(`retry-${p.id}`, () => getMedusaAdminClient().retrySettlementPayout(p.id), done)}>
                        {t("Retry bank payout", "Banka ödemesini tekrar dene", "Relancer le virement", "Reintentar pago", "Riprova pagamento", "Bankauszahlung erneut versuchen")}
                      </Button>
                    )}
                    {p.status === "transfer_review" && <Text tone="subdued">{t("Check transfers in Stripe", "Stripe’ta transferleri kontrol et", "Vérifier dans Stripe", "Revisar en Stripe", "Verifica in Stripe", "Transfers in Stripe prüfen")}</Text>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title={t("Refunds", "İadeler", "Remboursements", "Reembolsos", "Rimborsi", "Erstattungen")} count={data.refunds.length} empty={t("Nothing open.", "Açık kayıt yok.", "Rien d’ouvert.", "Nada pendiente.", "Niente in sospeso.", "Nichts offen.")}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>#</th><th style={th}>Status</th><th style={th}>{t("Amount", "Tutar", "Montant", "Importe", "Importo", "Betrag")}</th><th style={th}>{t("Reason", "Sebep", "Motif", "Motivo", "Motivo", "Grund")}</th><th style={th} /></tr></thead>
            <tbody>
              {data.refunds.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.order_number || String(r.order_id).slice(0, 8)}</td>
                  <td style={td}><code>{r.unallocated && r.stripe_refund_id ? "unallocated" : r.status}</code></td>
                  <td style={td}>{money(r.amount_cents)}</td>
                  <td style={td}>{r.failure_reason || r.reason || "—"}</td>
                  <td style={td}>
                    {r.unallocated && r.stripe_refund_id && (
                      <InlineStack gap="200" blockAlign="center">
                        <div onFocus={() => loadAllocOptions(r)} onMouseEnter={() => loadAllocOptions(r)} style={{ minWidth: 160 }}>
                          <Select labelHidden label="Seller"
                            options={[{ label: t("Seller…", "Satıcı…", "Vendeur…", "Vendedor…", "Venditore…", "Verkäufer…"), value: "" }, ...(allocOptions[r.id] || []).map((s) => ({ label: s, value: s }))]}
                            value={allocSeller[r.id] || ""} onChange={(v) => setAllocSeller((m) => ({ ...m, [r.id]: v }))} />
                        </div>
                        <Button size="slim" disabled={!allocSeller[r.id]} loading={busy === `alloc-${r.id}`}
                          onClick={() => run(`alloc-${r.id}`, () => getMedusaAdminClient().allocateSettlementRefund(r.id, { seller_id: allocSeller[r.id] }), done)}>
                          {t("Allocate", "Ata", "Attribuer", "Asignar", "Assegna", "Zuordnen")}
                        </Button>
                      </InlineStack>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title={t("Deliveries without carrier confirmation", "Kargo onayı olmayan teslimatlar", "Livraisons sans confirmation transporteur", "Entregas sin confirmación", "Consegne senza conferma corriere", "Zustellungen ohne Carrier-Bestätigung")} count={data.awaiting_delivery_confirmation.length} empty={t("Nothing open.", "Açık kayıt yok.", "Rien d’ouvert.", "Nada pendiente.", "Niente in sospeso.", "Nichts offen.")}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>#</th><th style={th}>{t("Seller says delivered", "Satıcıya göre teslim", "Livré selon vendeur", "Entregado según vendedor", "Consegnato secondo venditore", "Laut Verkäufer zugestellt")}</th><th style={th}>Tracking</th><th style={th}>{t("Delivery date", "Teslim tarihi", "Date de livraison", "Fecha de entrega", "Data di consegna", "Zustelldatum")}</th><th style={th} /></tr></thead>
            <tbody>
              {data.awaiting_delivery_confirmation.map((o) => (
                <tr key={o.id}>
                  <td style={td}>{o.order_number}</td>
                  <td style={td}>{when(o.seller_reported_delivered_at)}</td>
                  <td style={td}>{o.tracking_number || "—"}</td>
                  <td style={td}><TextField labelHidden label="date" type="date" autoComplete="off" value={deliveryDate[o.id] || ""} onChange={(v) => setDeliveryDate((m) => ({ ...m, [o.id]: v }))} /></td>
                  <td style={td}>
                    <Button size="slim" disabled={!deliveryDate[o.id]} loading={busy === `del-${o.id}`}
                      onClick={() => run(`del-${o.id}`, () => getMedusaAdminClient().confirmSettlementDelivery(o.id, `${deliveryDate[o.id]}T00:00:00Z`), done)}>
                      {t("Confirm delivery", "Teslimi onayla", "Confirmer la livraison", "Confirmar entrega", "Conferma consegna", "Zustellung bestätigen")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title={t("Sellers (payout blocked / account issues)", "Satıcılar (ödeme bloklu / hesap sorunu)", "Vendeurs (bloqués / compte)", "Vendedores (bloqueados / cuenta)", "Venditori (bloccati / conto)", "Verkäufer (Auszahlung gesperrt / Kontoprobleme)")} count={data.sellers.length} empty={t("Nothing open.", "Açık kayıt yok.", "Rien d’ouvert.", "Nada pendiente.", "Niente in sospeso.", "Nichts offen.")}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Seller</th><th style={th}>{t("Issue", "Sorun", "Problème", "Problema", "Problema", "Problem")}</th><th style={th}>{t("Reason (sent to seller)", "Sebep (satıcıya gider)", "Motif (envoyé au vendeur)", "Motivo (se envía)", "Motivo (inviato)", "Grund (geht an Verkäufer)")}</th><th style={th} /></tr></thead>
            <tbody>
              {data.sellers.map((s) => {
                const issues = [
                  s.payout_blocked ? `blocked: ${s.payout_block_reason || "—"}` : null,
                  s.stripe_custom_account_id && s.stripe_service_agreement !== "recipient" ? "service_agreement≠recipient" : null,
                  s.bank_holder_matches_legal_entity === false ? "holder≠legal name" : null,
                  s.stripe_custom_account_id && s.stripe_payouts_enabled !== true ? `payouts disabled (${s.stripe_disabled_reason || "—"})` : null,
                ].filter(Boolean);
                return (
                  <tr key={s.seller_id}>
                    <td style={td}>{s.store_name || s.seller_id}</td>
                    <td style={td}>{issues.join(" · ")}</td>
                    <td style={td}><TextField labelHidden label="reason" autoComplete="off" value={blockReason[s.seller_id] || ""} onChange={(v) => setBlockReason((m) => ({ ...m, [s.seller_id]: v }))} /></td>
                    <td style={td}>
                      <Button size="slim" disabled={(blockReason[s.seller_id] || "").trim().length < 5} loading={busy === `blk-${s.seller_id}`}
                        onClick={() => run(`blk-${s.seller_id}`, () => getMedusaAdminClient().setSellerPayoutBlock(s.seller_id, !s.payout_blocked, blockReason[s.seller_id]), done)}>
                        {s.payout_blocked ? t("Release payouts", "Ödemeleri serbest bırak", "Débloquer", "Desbloquear", "Sblocca", "Auszahlungen freigeben") : t("Block payouts", "Ödemeleri blokla", "Bloquer", "Bloquear", "Blocca", "Auszahlungen sperren")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section title={t("Stripe webhooks failed / stuck", "Başarısız / takılı Stripe webhook’ları", "Webhooks Stripe en échec", "Webhooks de Stripe fallidos", "Webhook Stripe falliti", "Fehlgeschlagene / hängende Stripe-Webhooks")} count={data.webhooks.length} empty={t("Nothing open.", "Açık kayıt yok.", "Rien d’ouvert.", "Nada pendiente.", "Niente in sospeso.", "Nichts offen.")}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Event</th><th style={th}>Typ</th><th style={th}>{t("Error", "Hata", "Erreur", "Error", "Errore", "Fehler")}</th><th style={th}>{t("Received", "Alındı", "Reçu", "Recibido", "Ricevuto", "Empfangen")}</th><th style={th} /></tr></thead>
            <tbody>
              {data.webhooks.map((w) => (
                <tr key={w.stripe_event_id}>
                  <td style={td}><code>{w.stripe_event_id}</code></td>
                  <td style={td}>{w.type}</td>
                  <td style={td}>{w.last_error || w.status}</td>
                  <td style={td}>{when(w.received_at)}</td>
                  <td style={td}>
                    <Button size="slim" loading={busy === `wh-${w.stripe_event_id}`} onClick={() => run(`wh-${w.stripe_event_id}`, () => getMedusaAdminClient().replaySettlementWebhook(w.stripe_event_id), done)}>
                      {t("Process again", "Tekrar işle", "Retraiter", "Procesar de nuevo", "Rielabora", "Erneut verarbeiten")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title={t("Payments without an order", "Siparişi olmayan ödemeler", "Paiements sans commande", "Pagos sin pedido", "Pagamenti senza ordine", "Zahlungen ohne Bestellung")} count={data.orphan_payments.length} empty={t("Nothing open.", "Açık kayıt yok.", "Rien d’ouvert.", "Nada pendiente.", "Niente in sospeso.", "Nichts offen.")}>
          <div style={{ padding: "8px 14px" }}>
            <Text tone="subdued">{t("Customer paid but the order was never created. Refund the PaymentIntent in Stripe or create the order manually — the payment is not settled to any seller.", "Müşteri ödedi ama sipariş oluşmadı. Stripe’ta iade et veya siparişi manuel oluştur — ödeme hiçbir satıcıya aktarılmaz.", "Le client a payé mais la commande n’existe pas. Remboursez dans Stripe ou créez la commande.", "El cliente pagó pero no existe pedido. Reembolse en Stripe o cree el pedido.", "Il cliente ha pagato ma l’ordine non esiste. Rimborsa in Stripe o crea l’ordine.", "Kunde hat bezahlt, aber keine Bestellung entstand. In Stripe erstatten oder Bestellung manuell anlegen — die Zahlung wird keinem Verkäufer abgerechnet.")}</Text>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>PaymentIntent</th><th style={th}>{t("Amount", "Tutar", "Montant", "Importe", "Importo", "Betrag")}</th><th style={th}>{t("Received", "Alındı", "Reçu", "Recibido", "Ricevuto", "Empfangen")}</th></tr></thead>
            <tbody>
              {data.orphan_payments.map((p) => (
                <tr key={p.stripe_event_id}>
                  <td style={td}><code>{p.payment_intent_id}</code></td>
                  <td style={td}>{money(p.amount_cents)}</td>
                  <td style={td}>{when(p.received_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title={t("Order lines without a seller", "Satıcısı olmayan sipariş kalemleri", "Lignes sans vendeur", "Líneas sin vendedor", "Righe senza venditore", "Bestellpositionen ohne Verkäufer")} count={data.unresolved_payables.length} empty={t("Nothing open.", "Açık kayıt yok.", "Rien d’ouvert.", "Nada pendiente.", "Niente in sospeso.", "Nichts offen.")}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Order</th><th style={th}>Items</th><th style={th}>{t("Logged", "Kaydedildi", "Journalisé", "Registrado", "Registrato", "Protokolliert")}</th></tr></thead>
            <tbody>
              {data.unresolved_payables.map((u, i) => (
                <tr key={`${u.order_id}-${i}`}>
                  <td style={td}><code>{u.order_id}</code></td>
                  <td style={td}>{(u.details?.order_item_ids || []).length}</td>
                  <td style={td}>{when(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </BlockStack>
    </Page>
  );
}
