"use client";

/**
 * Billing → JTL (superuser): JTL partner 1 % commission (docs/jtl.md Faz C/D).
 * Platform liability towards JTL — never part of seller payouts or commission invoices.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BlockStack, InlineStack, Text, Button, Select, TextField, Checkbox, Banner, Badge, Box, Card } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { lt } from "@/lib/locale-text";

const money = (cents, locale) =>
  (Number(cents || 0) / 100).toLocaleString(locale === "en" ? "en-GB" : "de-DE", { style: "currency", currency: "EUR" });

function quarterOptions(count = 8) {
  const out = [];
  const now = new Date();
  let y = now.getFullYear();
  let q = Math.ceil((now.getMonth() + 1) / 3);
  for (let i = 0; i < count; i += 1) {
    out.push(`${y}-Q${q}`);
    q -= 1;
    if (q === 0) { q = 4; y -= 1; }
  }
  return out;
}

const th = { textAlign: "left", padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
const td = { padding: "6px 8px", fontSize: 13, borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" };
const tdNum = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

export default function JtlPartnerTab() {
  const locale = useLocale() || "de";
  const t = useCallback((en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de), [locale]);
  const client = useMemo(() => getMedusaAdminClient(), []);
  const quarters = useMemo(() => quarterOptions(), []);
  const [period, setPeriod] = useState(quarters[1]); // default: last finished quarter
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sellers, setSellers] = useState([]);
  const [attrSeller, setAttrSeller] = useState("");
  const [attrExternal, setAttrExternal] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState("");
  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await client.request(`/admin-hub/v1/billing/jtl?period=${encodeURIComponent(period)}`));
    } catch (e) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }, [client, period]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data) return;
    setRecipient(data.recipient || "");
    setCc(data.cc || "");
  }, [data]);
  useEffect(() => {
    client.getSellers().then((r) => setSellers(r?.sellers || [])).catch(() => setSellers([]));
  }, [client]);

  const run = async (key, fn, okText) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
      if (okText) setNotice(okText);
      await load();
    } catch (e) {
      setError(e?.message || "Error");
    } finally {
      setBusy("");
    }
  };

  const token = () => (typeof window !== "undefined" ? localStorage.getItem("sellerToken") : null);
  const download = async (kind) => run(kind, async () => {
    const tok = token();
    let res;
    if (kind === "csv") {
      res = await fetch(`${client.baseURL}/admin-hub/v1/billing/jtl/export.csv?period=${encodeURIComponent(period)}`, { headers: { Authorization: `Bearer ${tok}` } });
    } else {
      res = await fetch("/api/billing/jtl-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerToken: tok, period }) });
    }
    if (!res.ok) throw new Error(`Export ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `andertal-jtl-reporting-${period}.${kind}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const send = (dryRun) => run(dryRun ? "test" : "send", async () => {
    if (!dryRun && typeof window !== "undefined" && !window.confirm(t(
      `Send the ${period} report to ${data?.recipient}?`, `${period} raporu ${data?.recipient} adresine gönderilsin mi?`,
      `Envoyer le rapport ${period} à ${data?.recipient} ?`, `¿Enviar el informe ${period} a ${data?.recipient}?`,
      `Inviare il report ${period} a ${data?.recipient}?`, `Reporting ${period} an ${data?.recipient} senden?`,
    ))) return;
    await client.request("/admin-hub/v1/billing/jtl/send-report", {
      method: "POST",
      body: JSON.stringify({ period, confirm_accuracy: confirm, dry_run: dryRun }),
    });
  }, dryRun
    ? t("Test e-mail sent to you.", "Test e-postası size gönderildi.", "E-mail de test envoyé.", "Correo de prueba enviado.", "E-mail di prova inviata.", "Test-E-Mail an Sie gesendet.")
    : t("Report sent to JTL.", "Rapor JTL'e gönderildi.", "Rapport envoyé à JTL.", "Informe enviado a JTL.", "Report inviato a JTL.", "Reporting an JTL gesendet."));

  const attribute = () => run("attr", async () => {
    await client.request("/admin-hub/v1/billing/jtl/attribute", {
      method: "POST",
      body: JSON.stringify({ seller_id: attrSeller, jtl_external_id: attrExternal.trim() || null }),
    });
    setAttrSeller("");
    setAttrExternal("");
  });
  const endAttr = (sellerId) => run(`end-${sellerId}`, async () => {
    if (typeof window !== "undefined" && !window.confirm(t("End the JTL attribution for this seller?", "Bu satıcının JTL ilişkisi sonlandırılsın mı?", "Mettre fin à l'attribution JTL ?", "¿Finalizar la atribución JTL?", "Terminare l'attribuzione JTL?", "JTL-Zuordnung für diesen Händler beenden?"))) return;
    await client.request("/admin-hub/v1/billing/jtl/end", { method: "POST", body: JSON.stringify({ seller_id: sellerId }) });
  });

  const reasonLabel = (r) => ({
    first_time_customer: t("first-time customer", "ilk kez müşteri", "nouveau client", "cliente nuevo", "nuovo cliente", "Neukunde"),
    returning_after_12_months: t("returning after 12+ months", "12+ ay sonra dönen", "retour après 12+ mois", "vuelve tras 12+ meses", "ritorno dopo 12+ mesi", "Rückkehr nach 12+ Monaten"),
    active_within_12_months: t("not eligible: active within 12 months", "uygun değil: son 12 ayda aktif", "non éligible : actif < 12 mois", "no elegible: activo < 12 meses", "non idoneo: attivo < 12 mesi", "nicht provisionspflichtig: in den letzten 12 Monaten aktiv"),
  }[r] || r);

  const totals = data?.totals || {};
  const lastSend = data?.last_send;

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h2" variant="headingMd">{t("JTL partnership — 1 % commission", "JTL ortaklığı — %1 provizyon", "Partenariat JTL — commission 1 %", "Alianza JTL — comisión 1 %", "Partnership JTL — commissione 1 %", "JTL-Partnerschaft — 1 % Provision")}</Text>
        <Text as="p" variant="bodySm" tone="subdued">{t(
          "Andertal pays JTL 1 % (+ VAT) of the gross revenue of JTL sellers won through the partnership (contract § 3). Platform liability — not part of seller payouts or commission invoices. Report due by the 5th of the month after each quarter.",
          "Andertal, ortaklıkla gelen JTL satıcılarının brüt cirosunun %1'ini (+ KDV) JTL'e öder (sözleşme § 3). Platform borcudur — satıcı ödemelerine ve komisyon faturalarına girmez. Rapor her çeyrekten sonraki ayın 5'ine kadar.",
          "Andertal verse à JTL 1 % (+ TVA) du CA brut des vendeurs JTL issus du partenariat (contrat § 3). Dette de la plateforme — hors versements vendeurs et factures de commission. Rapport avant le 5 du mois suivant chaque trimestre.",
          "Andertal paga a JTL el 1 % (+ IVA) de la facturación bruta de los vendedores JTL captados por la alianza (contrato § 3). Deuda de la plataforma — no afecta pagos a vendedores ni facturas de comisión. Informe antes del día 5 del mes siguiente a cada trimestre.",
          "Andertal paga a JTL l'1 % (+ IVA) del fatturato lordo dei venditori JTL acquisiti tramite la partnership (contratto § 3). Debito della piattaforma — escluso da pagamenti ai venditori e fatture di commissione. Report entro il 5 del mese successivo a ogni trimestre.",
          "Andertal zahlt JTL 1 % (zzgl. USt) des Bruttoumsatzes der über die Partnerschaft gewonnenen JTL-Händler (Vertrag § 3). Plattformverbindlichkeit — nicht Teil von Händlerauszahlungen oder Provisionsrechnungen. Reporting bis zum 5. des Folgemonats nach jedem Quartal.",
        )}</Text>
      </BlockStack>

      {error && <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>}
      {notice && <Banner tone="success" onDismiss={() => setNotice("")}>{notice}</Banner>}

      <InlineStack gap="300" blockAlign="end" wrap>
        <Box minWidth="160px">
          <Select label={t("Quarter", "Çeyrek", "Trimestre", "Trimestre", "Trimestre", "Quartal")} options={quarters.map((q) => ({ label: q, value: q }))} value={period} onChange={setPeriod} />
        </Box>
        <Button onClick={() => download("csv")} loading={busy === "csv"}>CSV</Button>
        <Button onClick={() => download("xlsx")} loading={busy === "xlsx"}>XLSX</Button>
      </InlineStack>

      <Card>
        <InlineStack gap="600" wrap>
          {[
            [t("Gross revenue (JTL sellers)", "Brüt ciro (JTL satıcıları)", "CA brut (vendeurs JTL)", "Facturación bruta (vendedores JTL)", "Fatturato lordo (venditori JTL)", "Bruttoumsatz (JTL-Händler)"), money(totals.gross_gmv_cents, locale)],
            [t("Commission 1 % (net)", "Provizyon %1 (net)", "Commission 1 % (HT)", "Comisión 1 % (neto)", "Commissione 1 % (netto)", "Provision 1 % (netto)"), money(totals.provision_1pct_cents, locale)],
            [t("VAT (estimate)", "KDV (tahmini)", "TVA (estimation)", "IVA (estimación)", "IVA (stima)", "USt (Schätzung)"), money(totals.vat_estimate_cents, locale)],
            [t("Sellers", "Satıcı", "Vendeurs", "Vendedores", "Venditori", "Händler"), String(totals.seller_count || 0)],
            [t("Report due", "Rapor son tarihi", "Échéance", "Vencimiento", "Scadenza", "Frist"), data?.deadline || "—"],
          ].map(([label, value]) => (
            <BlockStack key={label} gap="050">
              <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
              <Text as="span" variant="headingSm">{loading ? "…" : value}</Text>
            </BlockStack>
          ))}
          <BlockStack gap="050">
            <Text as="span" variant="bodySm" tone="subdued">{t("Last report", "Son rapor", "Dernier rapport", "Último informe", "Ultimo report", "Letztes Reporting")}</Text>
            {lastSend
              ? <Badge tone={lastSend.status === "sent" ? "success" : "critical"}>{`${lastSend.status} · ${String(lastSend.sent_at || lastSend.created_at || "").slice(0, 10)}`}</Badge>
              : <Badge tone="attention">{t("not sent", "gönderilmedi", "non envoyé", "no enviado", "non inviato", "nicht gesendet")}</Badge>}
          </BlockStack>
        </InlineStack>
      </Card>

      <Card padding="0">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>{t("Month", "Ay", "Mois", "Mes", "Mese", "Monat")}</th>
                <th style={th}>{t("Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Händler")}</th>
                <th style={th}>JTL-ID</th>
                <th style={{ ...th, textAlign: "right" }}>{t("Gross", "Brüt", "Brut", "Bruto", "Lordo", "Brutto")}</th>
                <th style={{ ...th, textAlign: "right" }}>1 %</th>
                <th style={{ ...th, textAlign: "right" }}>{t("Orders", "Sipariş", "Commandes", "Pedidos", "Ordini", "Bestellungen")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).length === 0 && (
                <tr><td style={td} colSpan={6}><Text as="span" tone="subdued">{loading ? "…" : t("No commission-relevant sales in this quarter.", "Bu çeyrekte provizyona tabi satış yok.", "Aucune vente concernée ce trimestre.", "Sin ventas relevantes este trimestre.", "Nessuna vendita rilevante nel trimestre.", "Keine provisionsrelevanten Umsätze in diesem Quartal.")}</Text></td></tr>
              )}
              {(data?.rows || []).map((r) => (
                <tr key={`${r.month}-${r.seller_id}`}>
                  <td style={td}>{r.month}</td>
                  <td style={td}>{r.seller_name || r.seller_id}</td>
                  <td style={td}>{r.jtl_external_id || "—"}</td>
                  <td style={tdNum}>{money(r.gross_gmv_cents, locale)}</td>
                  <td style={tdNum}>{money(r.provision_1pct_cents, locale)}</td>
                  <td style={tdNum}>{r.order_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">{t("Send quarterly report", "Çeyrek raporunu gönder", "Envoyer le rapport trimestriel", "Enviar informe trimestral", "Invia report trimestrale", "Quartals-Reporting senden")}</Text>
          <InlineStack gap="300" blockAlign="end" wrap>
            <div style={{ minWidth: 260, flex: 1 }}>
              <TextField label={t("Recipient (JTL)", "Alıcı (JTL)", "Destinataire (JTL)", "Destinatario (JTL)", "Destinatario (JTL)", "Empfänger (JTL)")} type="email" value={recipient} onChange={setRecipient} autoComplete="off" />
            </div>
            <div style={{ minWidth: 260, flex: 1 }}>
              <TextField label={t("CC (comma-separated)", "CC (virgülle ayrılmış)", "CC (séparés par des virgules)", "CC (separados por comas)", "CC (separati da virgole)", "CC (kommagetrennt)")} value={cc} onChange={setCc} autoComplete="off" />
            </div>
            <Button
              loading={busy === "settings"}
              onClick={() => run("settings", () => client.request("/admin-hub/v1/billing/jtl/settings", { method: "PUT", body: JSON.stringify({ recipient, cc }) }),
                t("Saved.", "Kaydedildi.", "Enregistré.", "Guardado.", "Salvato.", "Gespeichert."))}
            >
              {t("Save", "Kaydet", "Enregistrer", "Guardar", "Salva", "Speichern")}
            </Button>
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            {t("Automatic send (4th–10th after each quarter, deadline 5th)", "Otomatik gönderim (her çeyrek sonrası 4–10'u, son gün 5'i)", "Envoi automatique (du 4 au 10 après chaque trimestre, échéance le 5)", "Envío automático (del 4 al 10 tras cada trimestre, plazo el 5)", "Invio automatico (dal 4 al 10 dopo ogni trimestre, scadenza il 5)", "Automatischer Versand (4.–10. nach Quartalsende, Frist 5.)")}:{" "}
            {data?.auto_send
              ? <Badge tone="success">{t("on", "açık", "activé", "activado", "attivo", "an")}</Badge>
              : <Badge>{t("off", "kapalı", "désactivé", "desactivado", "disattivo", "aus")}</Badge>}{" "}
            {data?.auto_send_env === "false"
              ? t("(forced off on this server: JTL_REPORT_AUTO_SEND=false)", "(bu sunucuda kapatılmış: JTL_REPORT_AUTO_SEND=false)", "(désactivé sur ce serveur : JTL_REPORT_AUTO_SEND=false)", "(desactivado en este servidor: JTL_REPORT_AUTO_SEND=false)", "(disattivato su questo server: JTL_REPORT_AUTO_SEND=false)", "(auf diesem Server abgeschaltet: JTL_REPORT_AUTO_SEND=false)")
              : t("— switch on/off and edit the e-mail text in Content → Flows → “JTL-Partner-Reporting”.", "— aç/kapat ve e-posta metni: İçerik → Flows → “JTL-Partner-Reporting”.", "— activer/désactiver et modifier le texte : Contenu → Flows → « JTL-Partner-Reporting ».", "— activar/desactivar y editar el texto: Contenido → Flows → «JTL-Partner-Reporting».", "— attiva/disattiva e modifica il testo: Contenuti → Flows → «JTL-Partner-Reporting».", "— an/aus und E-Mail-Text: Inhalte → Flows → „JTL-Partner-Reporting“.")}
          </Text>
          <Checkbox
            label={t(
              "I confirm the information in this report is complete and correct (contract § 3.3 ii).",
              "Bu rapordaki bilgilerin eksiksiz ve doğru olduğunu onaylıyorum (sözleşme § 3.3 ii).",
              "Je confirme que les informations de ce rapport sont complètes et exactes (contrat § 3.3 ii).",
              "Confirmo que la información de este informe es completa y correcta (contrato § 3.3 ii).",
              "Confermo che le informazioni di questo report sono complete e corrette (contratto § 3.3 ii).",
              "Ich versichere die Vollständigkeit und Richtigkeit der Angaben (Vertrag § 3.3 ii).",
            )}
            checked={confirm}
            onChange={setConfirm}
          />
          <InlineStack gap="200">
            <Button onClick={() => send(true)} disabled={!confirm} loading={busy === "test"}>{t("Send test to me", "Bana test gönder", "M'envoyer un test", "Enviarme una prueba", "Inviami un test", "Test an mich senden")}</Button>
            <Button variant="primary" onClick={() => send(false)} disabled={!confirm} loading={busy === "send"}>{t("Send to JTL", "JTL'e gönder", "Envoyer à JTL", "Enviar a JTL", "Invia a JTL", "An JTL senden")}</Button>
          </InlineStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">{t("JTL sellers (attribution)", "JTL satıcıları (ilişkilendirme)", "Vendeurs JTL (attribution)", "Vendedores JTL (atribución)", "Venditori JTL (attribuzione)", "JTL-Händler (Zuordnung)")}</Text>
          <Text as="p" variant="bodySm" tone="subdued">{t(
            "Sellers connecting via JTL-Wawi (SCX sign-up) are attributed automatically. Billbee / organic sign-ups never count. Eligibility follows § 3.1 (first-time customer or no business in the last 12 months).",
            "JTL-Wawi (SCX kayıt) ile bağlanan satıcılar otomatik ilişkilendirilir. Billbee / organik kayıtlar sayılmaz. Uygunluk § 3.1'e göre (ilk kez müşteri ya da son 12 ayda işlem yok).",
            "Les vendeurs connectés via JTL-Wawi (inscription SCX) sont attribués automatiquement. Billbee / inscriptions organiques ne comptent pas. Éligibilité selon § 3.1.",
            "Los vendedores conectados vía JTL-Wawi (alta SCX) se atribuyen automáticamente. Billbee / altas orgánicas no cuentan. Elegibilidad según § 3.1.",
            "I venditori collegati tramite JTL-Wawi (registrazione SCX) sono attribuiti automaticamente. Billbee / registrazioni organiche non contano. Idoneità secondo § 3.1.",
            "Händler, die sich über JTL-Wawi (SCX-Sign-up) verbinden, werden automatisch zugeordnet. Billbee / organische Registrierungen zählen nie. Provisionspflicht nach § 3.1.",
          )}</Text>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>{t("Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Händler")}</th>
                  <th style={th}>JTL-ID</th>
                  <th style={th}>{t("Source", "Kaynak", "Source", "Origen", "Origine", "Quelle")}</th>
                  <th style={th}>{t("Since", "Başlangıç", "Depuis", "Desde", "Dal", "Seit")}</th>
                  <th style={th}>{t("Eligibility", "Uygunluk", "Éligibilité", "Elegibilidad", "Idoneità", "Provisionspflicht")}</th>
                  <th style={th}>{t("Last sale", "Son satış", "Dernière vente", "Última venta", "Ultima vendita", "Letzter Verkauf")}</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {(data?.sellers || []).map((s) => (
                  <tr key={`${s.seller_id}-${s.attributed_at}`}>
                    <td style={td}>{s.seller_name || s.seller_id}</td>
                    <td style={td}>{s.jtl_external_id || "—"}</td>
                    <td style={td}>{s.source === "jtl_scx_signup" ? "JTL SCX" : t("manual", "manuel", "manuel", "manual", "manuale", "manuell")}</td>
                    <td style={td}>{String(s.attributed_at || "").slice(0, 10)}</td>
                    <td style={td}><Badge tone={s.eligible ? "success" : undefined}>{reasonLabel(s.eligibility_reason)}</Badge></td>
                    <td style={td}>{s.last_sale_at ? String(s.last_sale_at).slice(0, 10) : "—"}</td>
                    <td style={td}>
                      {s.ended_at
                        ? <Text as="span" tone="subdued">{t("ended", "bitti", "terminé", "finalizado", "terminato", "beendet")} {String(s.ended_at).slice(0, 10)}</Text>
                        : <Button size="slim" tone="critical" variant="plain" onClick={() => endAttr(s.seller_id)} loading={busy === `end-${s.seller_id}`}>{t("End", "Sonlandır", "Terminer", "Finalizar", "Termina", "Beenden")}</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InlineStack gap="200" blockAlign="end" wrap>
            <Box minWidth="240px">
              <Select
                label={t("Attribute seller manually", "Satıcıyı manuel ilişkilendir", "Attribuer manuellement", "Atribuir manualmente", "Attribuisci manualmente", "Händler manuell zuordnen")}
                options={[{ label: "—", value: "" }, ...sellers.filter((s) => s.seller_id && s.seller_id !== "default").map((s) => ({ label: s.store_name || s.company_name || s.email || s.seller_id, value: s.seller_id }))]}
                value={attrSeller}
                onChange={setAttrSeller}
              />
            </Box>
            <Box minWidth="180px">
              <TextField label="JTL-ID" value={attrExternal} onChange={setAttrExternal} autoComplete="off" />
            </Box>
            <Button onClick={attribute} disabled={!attrSeller} loading={busy === "attr"}>{t("Attribute", "İlişkilendir", "Attribuer", "Atribuir", "Attribuisci", "Zuordnen")}</Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
