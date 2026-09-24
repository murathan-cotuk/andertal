"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Badge, Button, Box, TextField, Tooltip, Icon,
} from "@shopify/polaris";
import { InfoIcon } from "@shopify/polaris-icons";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { lt } from "@/lib/locale-text";

function t(locale, en, tr, de) {
  return lt(locale, en, tr, en, en, en, de);
}

function getCopy(locale) {
  const tt = (en, tr, de) => t(locale, en, tr, de);
  return {
    title: tt("Seller Comparison", "Satıcı Karşılaştırması", "Seller-Vergleich"),
    subtitle: tt(
      "Every product sold by more than one seller, compared side by side — the buybox winner is whichever authorized seller has the best combined score, even if they weren't first to list it.",
      "Birden fazla satıcı tarafından satılan her ürün yan yana karşılaştırılır — buybox kazananı, ilk ekleyen olmasa bile en iyi birleşik skora sahip yetkili satıcıdır.",
      "Jedes von mehreren Sellern verkaufte Produkt im Vergleich — der Buybox-Gewinner ist der autorisierte Seller mit dem besten Gesamt-Score, auch wenn er nicht der Erste war."
    ),
    search: tt("Search title, EAN or AN-ID…", "Başlık, EAN veya AN-ID ara…", "Titel, EAN oder AN-ID suchen…"),
    loading: tt("Loading…", "Yükleniyor…", "Laden…"),
    empty: tt("No multi-seller products found.", "Birden fazla satıcısı olan ürün bulunamadı.", "Keine Produkte mit mehreren Sellern gefunden."),
    error: tt("Error", "Hata", "Fehler"),
    sellers: (n) => tt(`${n} seller${n === 1 ? "" : "s"}`, `${n} satıcı`, `${n} Seller`),
    buybox: tt("Buybox", "Buybox", "Buybox"),
    otherSellers: tt("Other sellers", "Diğer satıcılar", "Andere Seller"),
    noWinner: tt("No authorized seller currently qualifies for the buybox.", "Şu anda buybox için uygun yetkili satıcı yok.", "Aktuell qualifiziert sich kein autorisierter Seller für die Buybox."),
    firstAdder: tt("First to add", "İlk ekleyen", "Zuerst hinzugefügt"),
    notAuthorized: tt("Not brand-authorized", "Markaya yetkili değil", "Nicht markenautorisiert"),
    blocked: tt("Account blocked", "Hesap bloke", "Konto gesperrt"),
    outOfStock: tt("Out of stock", "Stokta yok", "Nicht auf Lager"),
    colSeller: tt("Seller", "Satıcı", "Seller"),
    colPrice: tt("Price", "Fiyat", "Preis"),
    colGeneral: tt("General score", "Genel puan", "Allgemein-Score"),
    colProduct: tt("Product score", "Ürün puanı", "Produkt-Score"),
    colCombined: tt("Combined", "Birleşik", "Kombiniert"),
    colReviews: tt("Reviews", "Yorumlar", "Bewertungen"),
    colReturns: tt("Returns", "İade", "Retouren"),
    colShip: tt("Ship time", "Kargo süresi", "Versandzeit"),
    colStock: tt("Stock", "Stok", "Lager"),
    colBrand: tt("Brand auth.", "Marka yetkisi", "Markenautorisierung"),
    noData: tt("no data", "veri yok", "keine Daten"),
    hours: (h) => `${h.toFixed(1)}h`,
    generalScoreHelp: tt(
      "Seller Health score (0–100): overall order, product and compliance quality across everything this seller sells.",
      "Seller Health puanı (0–100): bu satıcının sattığı her şeyde genel sipariş, ürün ve uyumluluk kalitesi.",
      "Seller-Health-Score (0–100): allgemeine Bestell-, Produkt- und Compliance-Qualität über alles, was dieser Seller verkauft."
    ),
    productScoreHelp: tt(
      "This listing only: price rank among competing sellers, product-specific reviews, sales volume and stock.",
      "Sadece bu ürün: rakip satıcılar arasında fiyat sırası, ürüne özel yorumlar, satış hacmi ve stok.",
      "Nur dieser Artikel: Preisrang unter konkurrierenden Sellern, produktspezifische Bewertungen, Verkaufsvolumen und Lagerbestand."
    ),
    returnShipHelp: tt(
      "Seller-wide average (not tracked per product yet).",
      "Satıcı geneli ortalama (henüz ürün bazında izlenmiyor).",
      "Seller-weiter Durchschnitt (noch nicht pro Produkt erfasst)."
    ),
  };
}

function fmtPrice(cents) {
  return cents != null ? `${(Number(cents) / 100).toFixed(2)} €` : "—";
}

function scoreTone(score) {
  if (score == null) return undefined;
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "critical";
}

const CSS = `
.spc-page { font-size: 12px; color: #111827; }
.spc-product-head { display: flex; align-items: center; gap: 12px; }
.spc-thumb { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; background: #f3f4f6; flex: 0 0 auto; }
.spc-table { width: 100%; border-collapse: collapse; }
.spc-table th, .spc-table td { font-size: 11px; padding: 6px 8px; border-bottom: 1px solid #f3f4f6; text-align: left; white-space: nowrap; }
.spc-table th { color: #667085; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; background: #fafafa; }
.spc-table tr.spc-winner { background: #ecfdf5; }
.spc-help { cursor: help; opacity: 0.55; display: inline-flex; vertical-align: -2px; }
`;

function HelpTip({ text }) {
  return (
    <Tooltip content={text}>
      <span className="spc-help"><Icon source={InfoIcon} tone="subdued" /></span>
    </Tooltip>
  );
}

function ProductRow({ product, copy }) {
  return (
    <Card padding="0">
      <Box padding="300" paddingBlockEnd="200">
        <div className="spc-product-head">
          {product.thumbnail ? (
            <img src={product.thumbnail} alt="" className="spc-thumb" />
          ) : (
            <div className="spc-thumb" />
          )}
          <BlockStack gap="050">
            <Text fontWeight="semibold">{product.title || "—"}</Text>
            <InlineStack gap="200">
              {product.ean && <Text tone="subdued" variant="bodySm">EAN: {product.ean}</Text>}
              {product.an_id && <Text tone="subdued" variant="bodySm">AN-ID: {product.an_id}</Text>}
              <Badge>{copy.sellers(product.seller_count)}</Badge>
              {!product.has_buybox_winner && <Badge tone="critical">{copy.noWinner}</Badge>}
            </InlineStack>
          </BlockStack>
        </div>
      </Box>
      <div style={{ overflowX: "auto" }}>
        <table className="spc-table">
          <thead>
            <tr>
              <th></th>
              <th>{copy.colSeller}</th>
              <th>{copy.colPrice}</th>
              <th>{copy.colGeneral} <HelpTip text={copy.generalScoreHelp} /></th>
              <th>{copy.colProduct} <HelpTip text={copy.productScoreHelp} /></th>
              <th>{copy.colCombined}</th>
              <th>{copy.colReviews}</th>
              <th>{copy.colReturns} <HelpTip text={copy.returnShipHelp} /></th>
              <th>{copy.colShip} <HelpTip text={copy.returnShipHelp} /></th>
              <th>{copy.colStock}</th>
              <th>{copy.colBrand}</th>
            </tr>
          </thead>
          <tbody>
            {product.listings.map((l) => (
              <tr key={l.listing_id} className={l.is_buybox ? "spc-winner" : ""}>
                <td>{l.is_buybox && <Badge tone="success">{copy.buybox}</Badge>}</td>
                <td>
                  <Text fontWeight={l.is_buybox ? "semibold" : undefined}>{l.store_name}</Text>
                  {l.is_first_adder && <div><Text tone="subdued" variant="bodySm">{copy.firstAdder}</Text></div>}
                </td>
                <td>{fmtPrice(l.price_cents)}</td>
                <td>
                  {l.general_score != null ? (
                    <Badge tone={scoreTone(l.general_score)}>{Math.round(l.general_score)}</Badge>
                  ) : (
                    <Text tone="subdued">{copy.noData}</Text>
                  )}
                  {l.general_score_blocked && <div><Badge tone="critical">{copy.blocked}</Badge></div>}
                </td>
                <td>{l.product_score != null ? <Badge tone={scoreTone(l.product_score)}>{l.product_score}</Badge> : <Text tone="subdued">{copy.noData}</Text>}</td>
                <td><Text fontWeight="semibold">{l.combined_score}</Text></td>
                <td>{l.review_count > 0 ? `${l.review_avg.toFixed(1)} ★ (${l.review_count})` : <Text tone="subdued">{copy.noData}</Text>}</td>
                <td>{l.return_rate != null ? `${(l.return_rate * 100).toFixed(1)}%` : <Text tone="subdued">{copy.noData}</Text>}</td>
                <td>{l.ship_hours != null ? copy.hours(l.ship_hours) : <Text tone="subdued">{copy.noData}</Text>}</td>
                <td>{l.inventory > 0 ? l.inventory : <Badge tone="critical">{copy.outOfStock}</Badge>}</td>
                <td>
                  {l.brand_authorized ? (
                    <Badge tone="success">{l.brand_name || "OK"}</Badge>
                  ) : (
                    <Badge tone="critical">{copy.notAuthorized}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SellerComparisonBody() {
  const locale = useLocale();
  const copy = getCopy(locale);
  const [q, setQ] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async (search) => {
    setLoading(true); setErr("");
    try {
      const res = await getMedusaAdminClient().getProductSellerAnalytics({ min_sellers: 2, ...(search ? { q: search } : {}) });
      setProducts(Array.isArray(res?.products) ? res.products : []);
    } catch (e) {
      setErr(e?.message || copy.error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [copy.error]);

  useEffect(() => {
    const handle = setTimeout(() => load(q), q ? 400 : 0);
    return () => clearTimeout(handle);
  }, [q, load]);

  return (
    <div className="spc-page">
      <style>{CSS}</style>
      <Page title={copy.title} subtitle={copy.subtitle}>
        <Layout>
          <Layout.Section>
            <Card>
              <TextField label={copy.search} labelHidden value={q} onChange={setQ} autoComplete="off" placeholder={copy.search} />
            </Card>
          </Layout.Section>
          {err && (
            <Layout.Section>
              <Card><Box padding="300"><Text tone="critical">{err}</Text></Box></Card>
            </Layout.Section>
          )}
          {loading ? (
            <Layout.Section>
              <Card><Box padding="400"><Text tone="subdued" alignment="center">{copy.loading}</Text></Box></Card>
            </Layout.Section>
          ) : products.length === 0 ? (
            <Layout.Section>
              <Card><Box padding="400"><Text tone="subdued" alignment="center">{copy.empty}</Text></Box></Card>
            </Layout.Section>
          ) : (
            products.map((p) => (
              <Layout.Section key={p.id}>
                <ProductRow product={p} copy={copy} />
              </Layout.Section>
            ))
          )}
        </Layout>
      </Page>
    </div>
  );
}

export default function SellerComparisonPage() {
  const [isSuperuser, setIsSuperuser] = useState(null);

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
  }, []);

  if (isSuperuser === null) return null;
  if (!isSuperuser) return null;

  return (
    <DashboardLayout>
      <SellerComparisonBody />
    </DashboardLayout>
  );
}
