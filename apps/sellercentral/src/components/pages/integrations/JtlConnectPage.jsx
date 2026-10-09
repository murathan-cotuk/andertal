"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Page, Card, BlockStack, InlineStack, Text, Button, Banner, Badge } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { lt } from "@/lib/locale-text";

/**
 * JTL-Wawi ↔ Andertal (SCX). JTL's Partner Portal sends the seller here with ?session=… —
 * mode "signup" (first connection) or "update" (re-activation from JTL-Wawi). The seller confirms
 * explicitly; the backend binds the JTL account to this seller account.
 */
export default function JtlConnectPage({ mode = "signup" }) {
  const locale = useLocale();
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const searchParams = useSearchParams();
  const session = (searchParams?.get("session") || searchParams?.get("sessionId") || "").trim();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getMedusaAdminClient().request("/admin-hub/v1/erp/connections"));
    } catch (e) {
      setError(e?.message || "Error");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const jtl = (data?.connections || []).find((c) => c.erp_type === "jtl_scx") || null;

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      await getMedusaAdminClient().request(`/admin-hub/v1/erp/jtl/${mode === "update" ? "update" : "signup"}`, {
        method: "POST",
        body: JSON.stringify({ session }),
      });
      setDone(true);
      await load();
    } catch (e) {
      setError(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (s) => {
    if (s === "active") return <Badge tone="success">{t("Connected", "Bağlı", "Connecté", "Conectado", "Collegato", "Verbunden")}</Badge>;
    if (s === "unlinked") return <Badge tone="warning">{t("Disconnected", "Bağlantı kesildi", "Déconnecté", "Desconectado", "Scollegato", "Getrennt")}</Badge>;
    return <Badge>{s}</Badge>;
  };

  const fmt = (d) => (d ? new Date(d).toLocaleDateString(locale) : "—");

  return (
    <Page
      title={t("Connect JTL-Wawi", "JTL-Wawi bağla", "Connecter JTL-Wawi", "Conectar JTL-Wawi", "Collega JTL-Wawi", "JTL-Wawi verbinden")}
      subtitle={t(
        "Products and stock from JTL-Wawi, orders back to JTL-Wawi — via the JTL marketplace interface (SCX).",
        "Ürünler ve stok JTL-Wawi'den, siparişler JTL-Wawi'ye — JTL pazaryeri arayüzü (SCX) üzerinden.",
        "Produits et stock depuis JTL-Wawi, commandes vers JTL-Wawi — via l'interface marketplace JTL (SCX).",
        "Productos y stock desde JTL-Wawi, pedidos de vuelta a JTL-Wawi — mediante la interfaz de marketplace de JTL (SCX).",
        "Prodotti e stock da JTL-Wawi, ordini verso JTL-Wawi — tramite l'interfaccia marketplace JTL (SCX).",
        "Artikel und Bestand aus JTL-Wawi, Bestellungen zurück in JTL-Wawi — über die JTL-Marktplatzschnittstelle (SCX).",
      )}
    >
      <BlockStack gap="400">
        {error ? <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner> : null}
        {done ? (
          <Banner tone="success">
            {mode === "update"
              ? t("Connection updated.", "Bağlantı güncellendi.", "Connexion mise à jour.", "Conexión actualizada.", "Connessione aggiornata.", "Verbindung aktualisiert.")
              : t(
                "JTL-Wawi is connected. Listings you activate for Andertal in JTL-Wawi appear in your product list; orders are transferred automatically.",
                "JTL-Wawi bağlandı. JTL-Wawi'de Andertal için etkinleştirdiğiniz ilanlar ürün listenizde görünür; siparişler otomatik aktarılır.",
                "JTL-Wawi est connecté. Les offres activées pour Andertal dans JTL-Wawi apparaissent dans vos produits ; les commandes sont transférées automatiquement.",
                "JTL-Wawi está conectado. Las ofertas activadas para Andertal en JTL-Wawi aparecen en sus productos; los pedidos se transfieren automáticamente.",
                "JTL-Wawi è collegato. Le offerte attivate per Andertal in JTL-Wawi compaiono nei prodotti; gli ordini vengono trasferiti automaticamente.",
                "JTL-Wawi ist verbunden. Angebote, die Sie in JTL-Wawi für Andertal aktivieren, erscheinen in Ihrer Produktliste; Bestellungen werden automatisch übertragen.",
              )}
          </Banner>
        ) : null}

        {data && data.jtl_available === false ? (
          <Banner tone="info">
            {t(
              "The JTL connection is being prepared and is not available yet.",
              "JTL bağlantısı hazırlanıyor, henüz kullanılamıyor.",
              "La connexion JTL est en préparation et pas encore disponible.",
              "La conexión con JTL se está preparando y aún no está disponible.",
              "Il collegamento JTL è in preparazione e non ancora disponibile.",
              "Die JTL-Anbindung wird vorbereitet und ist noch nicht verfügbar.",
            )}
          </Banner>
        ) : null}

        {session && !done ? (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {mode === "update"
                  ? t("Confirm JTL-Wawi update", "JTL-Wawi güncellemesini onayla", "Confirmer la mise à jour JTL-Wawi", "Confirmar actualización de JTL-Wawi", "Conferma aggiornamento JTL-Wawi", "JTL-Wawi-Aktualisierung bestätigen")
                  : t("Link JTL-Wawi with this seller account", "JTL-Wawi'yi bu satıcı hesabına bağla", "Lier JTL-Wawi à ce compte vendeur", "Vincular JTL-Wawi con esta cuenta de vendedor", "Collega JTL-Wawi a questo account venditore", "JTL-Wawi mit diesem Verkäuferkonto verknüpfen")}
              </Text>
              <Text as="p" tone="subdued">
                {t(
                  "Products must meet the Andertal requirements (EAN, manufacturer and EU responsible person for GPSR, images, category). Listings that do not are reported back to JTL-Wawi with the reason.",
                  "Ürünler Andertal gereksinimlerini karşılamalı (EAN, GPSR için üretici ve AB sorumlu kişi, görseller, kategori). Karşılamayan ilanlar sebebiyle birlikte JTL-Wawi'ye bildirilir.",
                  "Les produits doivent respecter les exigences d'Andertal (EAN, fabricant et personne responsable UE pour le GPSR, images, catégorie). Sinon, le motif est renvoyé à JTL-Wawi.",
                  "Los productos deben cumplir los requisitos de Andertal (EAN, fabricante y persona responsable en la UE para GPSR, imágenes, categoría). Si no, el motivo se devuelve a JTL-Wawi.",
                  "I prodotti devono soddisfare i requisiti di Andertal (EAN, produttore e persona responsabile UE per GPSR, immagini, categoria). Altrimenti il motivo viene segnalato a JTL-Wawi.",
                  "Artikel müssen die Andertal-Anforderungen erfüllen (EAN, Hersteller und EU-verantwortliche Person nach GPSR, Bilder, Kategorie). Andernfalls wird der Grund an JTL-Wawi zurückgemeldet.",
                )}
              </Text>
              <InlineStack>
                <Button variant="primary" loading={busy} onClick={connect} disabled={data?.jtl_available === false}>
                  {mode === "update"
                    ? t("Confirm", "Onayla", "Confirmer", "Confirmar", "Conferma", "Bestätigen")
                    : t("Connect", "Bağla", "Connecter", "Conectar", "Collega", "Verbinden")}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        ) : null}

        {!session && !jtl ? (
          <Card>
            <Text as="p">
              {t(
                "Start the connection in JTL-Wawi: Marketplace connections (SCX) → add Andertal. You will be sent back here to confirm.",
                "Bağlantıyı JTL-Wawi'de başlatın: Pazaryeri bağlantıları (SCX) → Andertal ekle. Onay için buraya yönlendirileceksiniz.",
                "Lancez la connexion dans JTL-Wawi : connexions marketplace (SCX) → ajouter Andertal. Vous serez renvoyé ici pour confirmer.",
                "Inicie la conexión en JTL-Wawi: conexiones de marketplace (SCX) → añadir Andertal. Volverá aquí para confirmar.",
                "Avvia il collegamento in JTL-Wawi: connessioni marketplace (SCX) → aggiungi Andertal. Verrai riportato qui per confermare.",
                "Starten Sie die Verbindung in JTL-Wawi: Marktplatz-Anbindungen (SCX) → Andertal hinzufügen. Sie werden zur Bestätigung hierher zurückgeleitet.",
              )}
            </Text>
          </Card>
        ) : null}

        {jtl ? (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">JTL-Wawi</Text>
                {statusBadge(jtl.status)}
              </InlineStack>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {[
                    [t("Connected since", "Bağlantı tarihi", "Connecté depuis", "Conectado desde", "Collegato dal", "Verbunden seit"), fmt(jtl.connected_at)],
                    [t("Listed offers", "Yayındaki ilanlar", "Offres publiées", "Ofertas publicadas", "Offerte pubblicate", "Gelistete Angebote"), jtl.listed],
                    [t("Rejected offers", "Reddedilen ilanlar", "Offres refusées", "Ofertas rechazadas", "Offerte rifiutate", "Abgelehnte Angebote"), jtl.failed],
                    [t("Orders transferred", "Aktarılan siparişler", "Commandes transférées", "Pedidos transferidos", "Ordini trasferiti", "Übertragene Bestellungen"), jtl.orders_exported],
                    ...(jtl.unlinked_at ? [[t("Disconnected on", "Bağlantı kesilme", "Déconnecté le", "Desconectado el", "Scollegato il", "Getrennt am"), `${fmt(jtl.unlinked_at)}${jtl.unlink_reason ? ` — ${jtl.unlink_reason}` : ""}`]] : []),
                  ].map(([k, v]) => (
                    <tr key={k} style={{ borderTop: "1px solid var(--p-color-border-secondary)" }}>
                      <td style={{ padding: "6px 8px", color: "var(--p-color-text-secondary)" }}>{k}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BlockStack>
          </Card>
        ) : null}

        {(data?.failed_offers || []).length ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                {t("Rejected offers", "Reddedilen ilanlar", "Offres refusées", "Ofertas rechazadas", "Offerte rifiutate", "Abgelehnte Angebote")}
              </Text>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--p-color-text-secondary)" }}>
                    <th style={{ padding: "4px 8px" }}>JTL Offer</th>
                    <th style={{ padding: "4px 8px" }}>{t("Reason", "Sebep", "Motif", "Motivo", "Motivo", "Grund")}</th>
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>{t("Date", "Tarih", "Date", "Fecha", "Data", "Datum")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.failed_offers.map((o) => (
                    <tr key={o.offer_id} style={{ borderTop: "1px solid var(--p-color-border-secondary)" }}>
                      <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{o.offer_id}</td>
                      <td style={{ padding: "4px 8px" }}>{o.last_error || "—"}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmt(o.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BlockStack>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}
