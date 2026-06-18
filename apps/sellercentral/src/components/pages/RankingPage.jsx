"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import {
  Page,
  Card,
  Text,
  Button,
  Badge,
  BlockStack,
  InlineStack,
  Box,
  Spinner,
  Banner,
  Select,
  Tabs,
  TextField,
  Modal,
  Tooltip,
  Layout,
  DataTable,
  Divider,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const STRATEGY_I18N = [
  { value: "default", labelKey: "strategyDefault", descKey: "strategyDefaultDesc" },
  { value: "neuheiten", labelKey: "strategyNeuheiten", descKey: "strategyNeuheitenDesc" },
  { value: "bestsellers", labelKey: "strategyBestsellers", descKey: "strategyBestsellersDesc" },
  { value: "sales", labelKey: "strategySales", descKey: "strategySalesDesc" },
  { value: "search", labelKey: "strategySearch", descKey: "strategySearchDesc" },
];

// Weight field definitions — labels/descs are resolved at render time via locale helper
function getWeightFields(locale) {
  return [
    {
      key: "w_popularity",
      label:
        locale === "en" ? "Popularity" :
        locale === "tr" ? "Popülerlik" :
        locale === "fr" ? "Popularité" :
        locale === "es" ? "Popularidad" :
        locale === "it" ? "Popolarità" :
        "Popularität",
      desc:
        locale === "en" ? "Sales, GMV, Clicks" :
        locale === "tr" ? "Satışlar, GMV, Tıklamalar" :
        locale === "fr" ? "Ventes, GMV, Clics" :
        locale === "es" ? "Ventas, GMV, Clics" :
        locale === "it" ? "Vendite, GMV, Clic" :
        "Verkäufe, GMV, Klicks",
    },
    {
      key: "w_freshness",
      label:
        locale === "en" ? "Freshness" :
        locale === "tr" ? "Tazelik" :
        locale === "fr" ? "Fraîcheur" :
        locale === "es" ? "Frescura" :
        locale === "it" ? "Freschezza" :
        "Frische",
      desc:
        locale === "en" ? "Prefer newly listed products" :
        locale === "tr" ? "Yeni eklenen ürünleri öne çıkar" :
        locale === "fr" ? "Favoriser les produits récemment listés" :
        locale === "es" ? "Preferir productos recién listados" :
        locale === "it" ? "Preferire prodotti appena elencati" :
        "Neu eingestellte Produkte bevorzugen",
    },
    {
      key: "w_content",
      label:
        locale === "en" ? "Content" :
        locale === "tr" ? "İçerik" :
        locale === "fr" ? "Contenu" :
        locale === "es" ? "Contenido" :
        locale === "it" ? "Contenuto" :
        "Inhalt",
      desc:
        locale === "en" ? "Title, description, image, price" :
        locale === "tr" ? "Başlık, açıklama, görsel, fiyat" :
        locale === "fr" ? "Titre, description, image, prix" :
        locale === "es" ? "Título, descripción, imagen, precio" :
        locale === "it" ? "Titolo, descrizione, immagine, prezzo" :
        "Titel, Beschreibung, Bild, Preis",
    },
    {
      key: "w_discount",
      label:
        locale === "en" ? "Discount" :
        locale === "tr" ? "İndirim" :
        locale === "fr" ? "Remise" :
        locale === "es" ? "Descuento" :
        locale === "it" ? "Sconto" :
        "Rabatt",
      desc:
        locale === "en" ? "Percentage price reduction" :
        locale === "tr" ? "Yüzde fiyat indirimi" :
        locale === "fr" ? "Réduction de prix en pourcentage" :
        locale === "es" ? "Reducción de precio en porcentaje" :
        locale === "it" ? "Riduzione percentuale del prezzo" :
        "Prozent Preisreduktion",
    },
    {
      key: "w_seller",
      label:
        locale === "en" ? "Seller" :
        locale === "tr" ? "Satıcı" :
        locale === "fr" ? "Vendeur" :
        locale === "es" ? "Vendedor" :
        locale === "it" ? "Venditore" :
        "Verkäufer",
      desc:
        locale === "en" ? "Avg. seller rating" :
        locale === "tr" ? "Ort. satıcı puanı" :
        locale === "fr" ? "Note moyenne du vendeur" :
        locale === "es" ? "Calificación media del vendedor" :
        locale === "it" ? "Valutazione media del venditore" :
        "Ø Bewertung des Verkäufers",
    },
    {
      key: "w_velocity",
      label:
        locale === "en" ? "Trend velocity" :
        locale === "tr" ? "Trend hızı" :
        locale === "fr" ? "Vitesse de tendance" :
        locale === "es" ? "Velocidad de tendencia" :
        locale === "it" ? "Velocità trend" :
        "Trendgeschwindigkeit",
      desc:
        locale === "en" ? "7d vs 30d ratio" :
        locale === "tr" ? "7 gün / 30 gün oranı" :
        locale === "fr" ? "Ratio 7j vs 30j" :
        locale === "es" ? "Proporción 7d vs 30d" :
        locale === "it" ? "Rapporto 7d vs 30d" :
        "7d vs 30d Verhältnis",
    },
  ];
}

function getParamFields(locale) {
  return [
    {
      key: "freshness_halflife_days",
      label:
        locale === "en" ? "Freshness half-life (days)" :
        locale === "tr" ? "Tazelik yarı ömrü (gün)" :
        locale === "fr" ? "Demi-vie fraîcheur (jours)" :
        locale === "es" ? "Vida media frescura (días)" :
        locale === "it" ? "Emivita freschezza (giorni)" :
        "Frische-Halbwertszeit (Tage)",
      desc:
        locale === "en" ? "Days until a new product loses 50% of its freshness bonus" :
        locale === "tr" ? "Yeni bir ürünün tazelik bonusunun %50'sini kaybettiği gün sayısı" :
        locale === "fr" ? "Jours avant qu'un nouveau produit perde 50% de son bonus de fraîcheur" :
        locale === "es" ? "Días hasta que un producto nuevo pierde el 50% de su bonificación de frescura" :
        locale === "it" ? "Giorni prima che un nuovo prodotto perda il 50% del suo bonus freschezza" :
        "In wie vielen Tagen verliert ein neues Produkt 50% seines Frische-Bonus",
    },
    {
      key: "exploration_k",
      label:
        locale === "en" ? "Exploration factor (k)" :
        locale === "tr" ? "Keşif faktörü (k)" :
        locale === "fr" ? "Facteur d'exploration (k)" :
        locale === "es" ? "Factor de exploración (k)" :
        locale === "it" ? "Fattore esplorazione (k)" :
        "Entdeckungs-Faktor (k)",
      desc:
        locale === "en" ? "How strongly new products are initially boosted (0.0–1.0)" :
        locale === "tr" ? "Yeni ürünlerin başlangıçta ne kadar güçlü yükseltildiği (0.0–1.0)" :
        locale === "fr" ? "L'intensité de la mise en avant initiale des nouveaux produits (0,0–1,0)" :
        locale === "es" ? "La intensidad con que los nuevos productos se impulsan inicialmente (0,0–1,0)" :
        locale === "it" ? "Quanto fortemente i nuovi prodotti vengono inizialmente promossi (0.0–1.0)" :
        "Wie stark neue Produkte initial hochgestuft werden (0.0–1.0)",
    },
    {
      key: "diversity_max_consecutive",
      label:
        locale === "en" ? "Max. consecutive sellers" :
        locale === "tr" ? "Maks. ardışık satıcı" :
        locale === "fr" ? "Nb max. vendeurs consécutifs" :
        locale === "es" ? "Máx. vendedores consecutivos" :
        locale === "it" ? "Max. venditori consecutivi" :
        "Max. aufeinanderfolgende Seller",
      desc:
        locale === "en" ? "Diversity penalties apply beyond this number" :
        locale === "tr" ? "Bu sayıdan sonra çeşitlilik cezaları uygulanır" :
        locale === "fr" ? "Les pénalités de diversité s'appliquent au-delà de ce nombre" :
        locale === "es" ? "Las penalizaciones de diversidad se aplican a partir de este número" :
        locale === "it" ? "Le penalità di diversità si applicano oltre questo numero" :
        "Ab dieser Anzahl greifen Diversitäts-Strafen",
    },
    {
      key: "urgency_threshold",
      label:
        locale === "en" ? "Stock urgency threshold" :
        locale === "tr" ? "Stok aciliyet eşiği" :
        locale === "fr" ? "Seuil d'urgence stock" :
        locale === "es" ? "Umbral de urgencia de stock" :
        locale === "it" ? "Soglia urgenza scorte" :
        "Lagerbestand-Dringlichkeit",
      desc:
        locale === "en" ? "Products with stock ≤ this value receive a small urgency bonus" :
        locale === "tr" ? "Stok ≤ bu değer olan ürünler küçük bir aciliyet bonusu alır" :
        locale === "fr" ? "Les produits avec un stock ≤ cette valeur reçoivent un petit bonus d'urgence" :
        locale === "es" ? "Productos con stock ≤ este valor reciben una pequeña bonificación de urgencia" :
        locale === "it" ? "I prodotti con scorte ≤ questo valore ricevono un piccolo bonus urgenza" :
        "Produkte mit Bestand ≤ diesen Wert erhalten kleinen Urgency-Bonus",
    },
  ];
}

function strategySelectOptions(t) {
  return STRATEGY_I18N.map((s) => ({ label: t(s.labelKey), value: s.value }));
}

function strategyDescription(t, value) {
  const row = STRATEGY_I18N.find((s) => s.value === value);
  return row ? t(row.descKey) : "";
}

function ScoreBar({ value, max = 1, color = "#4f46e5" }) {
  const pct = Math.min(100, ((value || 0) / max) * 100);
  return (
    <Tooltip content={`${(value || 0).toFixed(4)}`}>
      <div style={{ minWidth: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, background: "var(--p-color-border-secondary)", borderRadius: 4, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4, transition: "width .3s" }} />
          </div>
          <span style={{ fontSize: 11, color: "var(--p-color-text-secondary)", width: 36, textAlign: "right", flexShrink: 0 }}>
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
    </Tooltip>
  );
}

function safeRatio(n, d) {
  const nn = Number(n || 0);
  const dd = Number(d || 0);
  if (!dd || !Number.isFinite(dd)) return 0;
  return nn / dd;
}

function RankingInsights({ products, locale }) {
  const metrics = useMemo(() => {
    const rows = Array.isArray(products) ? products : [];
    const totals = rows.reduce(
      (acc, p) => {
        acc.gmvCents += Number(p.gmv_30d_cents || 0);
        acc.sales30 += Number(p.sales_30d || 0);
        acc.impressions30 += Number(p.impressions_30d || 0);
        acc.clicks30 += Number(p.clicks_30d || 0);
        acc.atc30 += Number(p.add_to_cart_30d || 0);
        acc.returns30 += Number(p.return_count_30d || 0);
        const disc = Number(p.discount_pct || 0);
        if (disc > 0) {
          acc.discountWeighted += disc * Math.max(1, Number(p.sales_30d || 0));
          acc.discountWeight += Math.max(1, Number(p.sales_30d || 0));
        }
        return acc;
      },
      {
        gmvCents: 0,
        sales30: 0,
        impressions30: 0,
        clicks30: 0,
        atc30: 0,
        returns30: 0,
        discountWeighted: 0,
        discountWeight: 0,
      }
    );
    const gmv = totals.gmvCents / 100;
    const ctr = safeRatio(totals.clicks30, totals.impressions30);
    const atcRate = safeRatio(totals.atc30, totals.clicks30);
    const returnRate = safeRatio(totals.returns30, totals.sales30);
    const avgDiscount = totals.discountWeight > 0 ? totals.discountWeighted / totals.discountWeight : 0;
    const aov = safeRatio(gmv, totals.sales30);
    const revenuePerClick = safeRatio(gmv, totals.clicks30);
    // ROI proxy (not accounting for ad spend): revenue generated per active discount point.
    const discountRoiProxy = safeRatio(gmv, Math.max(avgDiscount, 1));
    return { gmv, ctr, atcRate, returnRate, avgDiscount, aov, revenuePerClick, discountRoiProxy };
  }, [products]);

  const moneyFmt = useMemo(
    () =>
      new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
      }),
    []
  );
  const pct = (v) => `${(Number(v || 0) * 100).toFixed(1)}%`;

  const cards = [
    {
      title:
        locale === "en" ? "GMV (30 days)" :
        locale === "tr" ? "GMV (30 gün)" :
        locale === "fr" ? "GMV (30 jours)" :
        locale === "es" ? "GMV (30 días)" :
        locale === "it" ? "GMV (30 giorni)" :
        "GMV (30 Tage)",
      value: moneyFmt.format(metrics.gmv),
      hint:
        locale === "en" ? "Total revenue of all products in this strategy view." :
        locale === "tr" ? "Bu strateji görünümündeki tüm ürünlerin toplam cirosu." :
        locale === "fr" ? "Chiffre d'affaires total de tous les produits dans cette vue stratégique." :
        locale === "es" ? "Ingresos totales de todos los productos en esta vista de estrategia." :
        locale === "it" ? "Fatturato totale di tutti i prodotti in questa vista strategia." :
        "Gesamtumsatz aller Produkte in dieser Strategieansicht.",
    },
    {
      title: "CTR",
      value: pct(metrics.ctr),
      hint:
        locale === "en" ? "Clicks / Impressions. Low = listing/title/image unattractive." :
        locale === "tr" ? "Tıklamalar / Gösterimler. Düşükse = liste/başlık/görsel çekici değil." :
        locale === "fr" ? "Clics / Impressions. Faible = annonce/titre/image peu attractifs." :
        locale === "es" ? "Clics / Impresiones. Bajo = listado/título/imagen poco atractivos." :
        locale === "it" ? "Clic / Impressioni. Basso = annuncio/titolo/immagine poco attraenti." :
        "Klicks / Impressionen. Niedrig = Listing/Titel/Bild unattraktiv.",
    },
    {
      title:
        locale === "en" ? "Add-to-Cart rate" :
        locale === "tr" ? "Sepete ekleme oranı" :
        locale === "fr" ? "Taux d'ajout au panier" :
        locale === "es" ? "Tasa de añadir al carrito" :
        locale === "it" ? "Tasso aggiungi al carrello" :
        "Add-to-Cart-Rate",
      value: pct(metrics.atcRate),
      hint:
        locale === "en" ? "Carts / Clicks. Measures offer fit after product click." :
        locale === "tr" ? "Sepetler / Tıklamalar. Ürün tıklamasından sonra teklif uyumunu ölçer." :
        locale === "fr" ? "Paniers / Clics. Mesure l'adéquation de l'offre après le clic produit." :
        locale === "es" ? "Carritos / Clics. Mide la adecuación de la oferta tras el clic en el producto." :
        locale === "it" ? "Carrelli / Clic. Misura l'adeguatezza dell'offerta dopo il clic sul prodotto." :
        "Warenkörbe / Klicks. Misst Angebot-Passung nach dem Produktklick.",
    },
    {
      title:
        locale === "en" ? "Return rate" :
        locale === "tr" ? "İade oranı" :
        locale === "fr" ? "Taux de retour" :
        locale === "es" ? "Tasa de devolución" :
        locale === "it" ? "Tasso di reso" :
        "Retourenquote",
      value: pct(metrics.returnRate),
      hint:
        locale === "en" ? "Returns / Sales (30d). High rate lowers ranking score." :
        locale === "tr" ? "İadeler / Satışlar (30g). Yüksek oran sıralama puanını düşürür." :
        locale === "fr" ? "Retours / Ventes (30j). Un taux élevé réduit le score de classement." :
        locale === "es" ? "Devoluciones / Ventas (30d). Una tasa alta reduce la puntuación de ranking." :
        locale === "it" ? "Resi / Vendite (30g). Un tasso elevato abbassa il punteggio di ranking." :
        "Rückgaben / Verkäufe (30d). Hohe Quote drückt den Ranking-Score.",
    },
    {
      title:
        locale === "en" ? "Avg. discount" :
        locale === "tr" ? "Ort. indirim" :
        locale === "fr" ? "Remise moy." :
        locale === "es" ? "Descuento medio" :
        locale === "it" ? "Sconto medio" :
        "Ø Rabatt",
      value: `${metrics.avgDiscount.toFixed(1)}%`,
      hint:
        locale === "en" ? "Sales-weighted. Helps assess whether discounts truly support sales." :
        locale === "tr" ? "Satış ağırlıklı. İndirimin satışları gerçekten destekleyip desteklemediğini görmeye yardımcı olur." :
        locale === "fr" ? "Pondéré par les ventes. Aide à voir si la remise soutient vraiment les ventes." :
        locale === "es" ? "Ponderado por ventas. Ayuda a ver si el descuento realmente apoya las ventas." :
        locale === "it" ? "Ponderato per vendite. Aiuta a capire se lo sconto supporta davvero le vendite." :
        "Verkaufsgewichtet. Hilft zu sehen, ob Rabatt den Vertrieb wirklich stützt.",
    },
    {
      title:
        locale === "en" ? "ROI proxy (discount)" :
        locale === "tr" ? "ROI vekili (indirim)" :
        locale === "fr" ? "Proxy ROI (remise)" :
        locale === "es" ? "Proxy ROI (descuento)" :
        locale === "it" ? "Proxy ROI (sconto)" :
        "ROI-Proxy (Rabatt)",
      value: `${moneyFmt.format(metrics.discountRoiProxy)} / %-${locale === "en" ? "pt" : locale === "tr" ? "puan" : locale === "fr" ? "pt" : locale === "es" ? "pt" : locale === "it" ? "pt" : "Punkt"}`,
      hint:
        locale === "en" ? "GMV per active discount percentage point. Not true profit ROI (ad costs/COGS missing)." :
        locale === "tr" ? "Aktif indirim yüzdesi başına GMV. Gerçek kâr ROI'si değil (reklam maliyetleri/COGS eksik)." :
        locale === "fr" ? "GMV par point de pourcentage de remise actif. Pas un ROI de profit réel (coûts pub/COGS manquants)." :
        locale === "es" ? "GMV por punto porcentual de descuento activo. No es ROI real (faltan costes pub/COGS)." :
        locale === "it" ? "GMV per punto percentuale di sconto attivo. Non è un ROI reale (mancano costi pub/COGS)." :
        "GMV pro aktivem Rabatt-Prozentpunkt. Kein echter Profit-ROI (Ad-Kosten/COGS fehlen).",
    },
    {
      title:
        locale === "en" ? "Revenue per click" :
        locale === "tr" ? "Tıklama başına gelir" :
        locale === "fr" ? "Revenu par clic" :
        locale === "es" ? "Ingresos por clic" :
        locale === "it" ? "Ricavo per clic" :
        "Umsatz je Klick",
      value: moneyFmt.format(metrics.revenuePerClick),
      hint:
        locale === "en" ? "Monetisation efficiency of incoming traffic." :
        locale === "tr" ? "Gelen trafiğin monetizasyon verimliliği." :
        locale === "fr" ? "Efficacité de monétisation du trafic entrant." :
        locale === "es" ? "Eficiencia de monetización del tráfico entrante." :
        locale === "it" ? "Efficienza di monetizzazione del traffico in entrata." :
        "Monetarisierungseffizienz des eingehenden Traffics.",
    },
    {
      title:
        locale === "en" ? "AOV (avg. order value)" :
        locale === "tr" ? "AOV (ort. sipariş değeri)" :
        locale === "fr" ? "AOV (valeur moy. commande)" :
        locale === "es" ? "AOV (valor medio pedido)" :
        locale === "it" ? "AOV (valore medio ordine)" :
        "AOV (Ø Bestellwert)",
      value: moneyFmt.format(metrics.aov),
      hint:
        locale === "en" ? "GMV / Sales. Shows mix of price level and basket size." :
        locale === "tr" ? "GMV / Satışlar. Fiyat seviyesi ve sepet büyüklüğü karışımını gösterir." :
        locale === "fr" ? "GMV / Ventes. Montre le mix entre niveau de prix et taille du panier." :
        locale === "es" ? "GMV / Ventas. Muestra la mezcla de nivel de precio y tamaño de carrito." :
        locale === "it" ? "GMV / Vendite. Mostra il mix tra livello di prezzo e dimensione del carrello." :
        "GMV / Verkäufe. Zeigt Mix aus Preisniveau und Warenkorbgröße.",
    },
  ];

  const roiBannerText =
    locale === "en"
      ? <>ROI values are presented here as a <strong>proxy</strong> because advertising costs, COGS, and logistics costs are not included in this ranking view.</>
      : locale === "tr"
      ? <>ROI değerleri burada <strong>vekil</strong> olarak sunulmaktadır, çünkü reklam maliyetleri, COGS ve lojistik maliyetleri bu sıralama görünümünde yer almamaktadır.</>
      : locale === "fr"
      ? <>Les valeurs ROI sont présentées ici comme un <strong>proxy</strong>, car les coûts publicitaires, COGS et coûts logistiques ne sont pas inclus dans cette vue de classement.</>
      : locale === "es"
      ? <>Los valores ROI se presentan aquí como un <strong>proxy</strong> porque los costes publicitarios, COGS y costes logísticos no están incluidos en esta vista de ranking.</>
      : locale === "it"
      ? <>I valori ROI sono presentati qui come un <strong>proxy</strong> perché i costi pubblicitari, COGS e i costi logistici non sono inclusi in questa vista di ranking.</>
      : <>ROI-Werte sind hier als <strong>Proxy</strong> dargestellt, weil Werbekosten, COGS und Logistikkosten nicht in dieser Ranking-Ansicht enthalten sind.</>;

  return (
    <BlockStack gap="300">
      <Banner tone="info">
        <p style={{ margin: 0 }}>
          {roiBannerText}
        </p>
      </Banner>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {cards.map((c) => (
          <Card key={c.title}>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                {c.title}
              </Text>
              <Text as="p" variant="headingMd" fontWeight="bold">
                {c.value}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {c.hint}
              </Text>
            </BlockStack>
          </Card>
        ))}
      </div>
    </BlockStack>
  );
}

function WeightSumBadge({ config, locale }) {
  const WEIGHT_FIELDS = getWeightFields(locale);
  const sum = WEIGHT_FIELDS.reduce((a, f) => a + parseFloat(config[f.key] || 0), 0);
  const diff = Math.abs(sum - 1.0);
  const labelSum =
    locale === "en" ? "Sum" :
    locale === "tr" ? "Toplam" :
    locale === "fr" ? "Somme" :
    locale === "es" ? "Suma" :
    locale === "it" ? "Somma" :
    "Summe";
  const labelShouldBe =
    locale === "en" ? "should be 1.00" :
    locale === "tr" ? "1.00 olmalı" :
    locale === "fr" ? "doit être 1,00" :
    locale === "es" ? "debe ser 1,00" :
    locale === "it" ? "dovrebbe essere 1,00" :
    "soll 1.00";
  if (diff < 0.001) return <Badge tone="success">{labelSum}: 1.00</Badge>;
  return <Badge tone="critical">{labelSum}: {sum.toFixed(2)} ({labelShouldBe})</Badge>;
}

function ConfigEditor({ configs, onSave, saving, t, locale }) {
  const [strategy, setStrategy] = useState("default");
  const [local, setLocal] = useState(null);
  const [err, setErr] = useState("");

  const WEIGHT_FIELDS = useMemo(() => getWeightFields(locale), [locale]);
  const PARAM_FIELDS = useMemo(() => getParamFields(locale), [locale]);

  const options = useMemo(() => strategySelectOptions(t), [t]);
  const strategyDesc = strategyDescription(t, strategy);

  useEffect(() => {
    const cfg = configs.find((c) => c.strategy === strategy)?.config || {};
    setLocal({ ...cfg });
  }, [strategy, configs]);

  const set = (key, val) => setLocal((prev) => ({ ...prev, [key]: parseFloat(val) || 0 }));

  const handleSave = async () => {
    setErr("");
    const sum = WEIGHT_FIELDS.reduce((a, f) => a + parseFloat(local[f.key] || 0), 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      setErr(t("errWeightSum", { sum: sum.toFixed(3) }));
      return;
    }
    await onSave(strategy, local);
  };

  if (!local) return <Box padding="400"><Spinner size="small" /></Box>;

  return (
    <BlockStack gap="400">
      <Banner tone="info">
        <p style={{ margin: 0 }}>{t("configBanner")}</p>
      </Banner>
      <InlineStack gap="300" blockAlign="center" wrap>
        <div style={{ minWidth: 240 }}>
          <Select
            label={t("strategyLabel")}
            options={options}
            value={strategy}
            onChange={setStrategy}
            helpText={strategyDesc}
          />
        </div>
        <div style={{ paddingTop: 20 }}>
          <WeightSumBadge config={local} locale={locale} />
        </div>
      </InlineStack>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <BlockStack gap="300">
          <Text as="p" variant="bodyMd" fontWeight="semibold">
            {t("weightsTitle")}
          </Text>
          {WEIGHT_FIELDS.map((f) => (
            <div key={f.key}>
              <Tooltip content={f.desc}>
                <TextField
                  label={f.label}
                  type="number"
                  value={String(local[f.key] ?? "")}
                  onChange={(v) => set(f.key, v)}
                  step={0.01}
                  min={0}
                  max={1}
                  autoComplete="off"
                />
              </Tooltip>
            </div>
          ))}
        </BlockStack>

        <BlockStack gap="300">
          <Text as="p" variant="bodyMd" fontWeight="semibold">
            {t("paramsTitle")}
          </Text>
          {PARAM_FIELDS.map((f) => (
            <div key={f.key}>
              <Tooltip content={f.desc}>
                <TextField
                  label={f.label}
                  type="number"
                  value={String(local[f.key] ?? "")}
                  onChange={(v) => set(f.key, parseFloat(v))}
                  step={f.key === "exploration_k" ? 0.05 : 1}
                  min={0}
                  autoComplete="off"
                />
              </Tooltip>
            </div>
          ))}
        </BlockStack>
      </div>

      {err && <Banner tone="critical">{err}</Banner>}
      <InlineStack gap="300">
        <Button variant="primary" onClick={handleSave} loading={saving}>
          {t("save")}
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

function RankingTable({ products, onBreakdown, strategy, t, router, maxScore }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          !search.trim() ||
          (p.title || "").toLowerCase().includes(search.toLowerCase()) ||
          (p.handle || "").toLowerCase().includes(search.toLowerCase()) ||
          (p.product_id || "").toLowerCase().includes(search.toLowerCase())
      ),
    [products, search]
  );

  const rows = useMemo(
    () =>
      filtered.map((p) => {
        const finalScore = parseFloat(p.final_score) || 0;
        const name = p.title || "—";
        const sub = p.product_id ? `${p.product_id.slice(0, 8)}…` : "—";
        const review =
          parseFloat(p.review_avg) > 0
            ? `⭐ ${parseFloat(p.review_avg).toFixed(1)} (${p.review_count})`
            : "—";
        return [
          "—",
          <BlockStack key={`n-${p.product_id}`} gap="100">
            <Text as="span" variant="bodySm" fontWeight="semibold" truncate>
              {name}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {sub}
            </Text>
          </BlockStack>,
          <ScoreBar key={`pop-${p.product_id}`} value={parseFloat(p.popularity_score)} color="#6366f1" />,
          <ScoreBar key={`fr-${p.product_id}`} value={parseFloat(p.freshness_override || p.freshness_score)} color="#10b981" />,
          <ScoreBar key={`v-${p.product_id}`} value={parseFloat(p.velocity_score)} color="#f59e0b" />,
          <ScoreBar key={`c-${p.product_id}`} value={parseFloat(p.content_score)} color="#3b82f6" />,
          parseFloat(p.discount_pct) > 0 ? (
            <Badge key={`d-${p.product_id}`} tone="success">
              {parseFloat(p.discount_pct).toFixed(0)}%
            </Badge>
          ) : (
            "—"
          ),
          review,
          <ScoreBar key={`fs-${p.product_id}`} value={finalScore} max={maxScore} color="#8b5cf6" />,
          <InlineStack key={`a-${p.product_id}`} gap="200" wrap={false}>
            <Button size="slim" onClick={() => onBreakdown(p.product_id)}>
              {t("btnDetails")}
            </Button>
            {p.product_id && (
              <Button size="slim" variant="plain" onClick={() => router.push(`/products/${p.product_id}`)}>
                {t("btnProduct")}
              </Button>
            )}
          </InlineStack>,
        ];
      }),
    [filtered, maxScore, onBreakdown, router, t]
  );

  // Rank numbers after filter
  const rowsNumbered = useMemo(
    () => rows.map((row, i) => [String(i + 1), ...row.slice(1)]),
    [rows]
  );

  return (
    <BlockStack gap="400">
      <div style={{ maxWidth: 400 }}>
        <TextField
          label={t("searchPlaceholder")}
          labelHidden
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={setSearch}
          autoComplete="off"
          clearButton
          onClearButtonClick={() => setSearch("")}
        />
      </div>

      <div style={{ overflowX: "auto" }}>
        {rowsNumbered.length === 0 ? (
          <Box padding="600">
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              {t("emptyTable")}
            </Text>
          </Box>
        ) : (
          <DataTable
            columnContentTypes={["numeric", "text", "text", "text", "text", "text", "text", "text", "text", "text"]}
            headings={[
              t("tableRank"),
              t("tableProduct"),
              t("tablePop"),
              t("tableFresh"),
              t("tableVelo"),
              t("tableContent"),
              t("tableDisc"),
              t("tableReview"),
              t("tableScore"),
              t("tableAction"),
            ]}
            rows={rowsNumbered}
          />
        )}
      </div>
    </BlockStack>
  );
}

function BreakdownModal({ productId, strategy, onClose, locale }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    const c = getMedusaAdminClient();
    c
      .getRankingBreakdown(productId, strategy)
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [productId, strategy]);

  const contribs = data?.weighted_contributions || {};
  const maxContrib = Math.max(...Object.values(contribs).map(Math.abs), 0.001);

  const labelRank =
    locale === "en" ? "Rank" :
    locale === "tr" ? "Sıra" :
    locale === "fr" ? "Rang" :
    locale === "es" ? "Rango" :
    locale === "it" ? "Posizione" :
    "Rang";

  const labelScore = "Score";

  const labelStrategy =
    locale === "en" ? "Strategy" :
    locale === "tr" ? "Strateji" :
    locale === "fr" ? "Stratégie" :
    locale === "es" ? "Estrategia" :
    locale === "it" ? "Strategia" :
    "Strategie";

  const labelNotFound =
    locale === "en" ? "Product not found. Compute first." :
    locale === "tr" ? "Ürün bulunamadı. Önce hesaplayın." :
    locale === "fr" ? "Produit introuvable. Calculer d'abord." :
    locale === "es" ? "Producto no encontrado. Calcular primero." :
    locale === "it" ? "Prodotto non trovato. Calcolare prima." :
    "Produkt nicht gefunden. Zuerst berechnen.";

  const labelRawData =
    locale === "en" ? "Raw data (signals)" :
    locale === "tr" ? "Ham veriler (sinyaller)" :
    locale === "fr" ? "Données brutes (signaux)" :
    locale === "es" ? "Datos brutos (señales)" :
    locale === "it" ? "Dati grezzi (segnali)" :
    "Rohdaten (Signale)";

  const labelWeightedContribs =
    locale === "en" ? "Weighted contributions" :
    locale === "tr" ? "Ağırlıklı katkılar" :
    locale === "fr" ? "Contributions pondérées" :
    locale === "es" ? "Contribuciones ponderadas" :
    locale === "it" ? "Contributi ponderati" :
    "Gewichtete Beiträge";

  const labelFinalScore =
    locale === "en" ? "Final score" :
    locale === "tr" ? "Nihai puan" :
    locale === "fr" ? "Score final" :
    locale === "es" ? "Puntuación final" :
    locale === "it" ? "Punteggio finale" :
    "Finaler Score";

  const labelDays =
    locale === "en" ? "days" :
    locale === "tr" ? "gün" :
    locale === "fr" ? "jours" :
    locale === "es" ? "días" :
    locale === "it" ? "giorni" :
    "Tage";

  const signalRows = data ? [
    [locale === "en" ? "Sales 7d" : locale === "tr" ? "Satışlar 7g" : locale === "fr" ? "Ventes 7j" : locale === "es" ? "Ventas 7d" : locale === "it" ? "Vendite 7g" : "Verkäufe 7d", data.signals.sales_7d],
    [locale === "en" ? "Sales 30d" : locale === "tr" ? "Satışlar 30g" : locale === "fr" ? "Ventes 30j" : locale === "es" ? "Ventas 30d" : locale === "it" ? "Vendite 30g" : "Verkäufe 30d", data.signals.sales_30d],
    [locale === "en" ? "Sales 90d" : locale === "tr" ? "Satışlar 90g" : locale === "fr" ? "Ventes 90j" : locale === "es" ? "Ventas 90d" : locale === "it" ? "Vendite 90g" : "Verkäufe 90d", data.signals.sales_90d],
    ["GMV 30d", `€${((data.signals.gmv_30d_cents || 0) / 100).toFixed(2)}`],
    [locale === "en" ? "Impressions 30d" : locale === "tr" ? "Gösterimler 30g" : locale === "fr" ? "Impressions 30j" : locale === "es" ? "Impresiones 30d" : locale === "it" ? "Impressioni 30g" : "Impressionen 30d", data.signals.impressions_30d],
    [locale === "en" ? "Clicks 30d" : locale === "tr" ? "Tıklamalar 30g" : locale === "fr" ? "Clics 30j" : locale === "es" ? "Clics 30d" : locale === "it" ? "Clic 30g" : "Klicks 30d", data.signals.clicks_30d],
    ["CTR 30d", `${((data.signals.ctr_30d || 0) * 100).toFixed(1)}%`],
    [locale === "en" ? "Carts 30d" : locale === "tr" ? "Sepetler 30g" : locale === "fr" ? "Paniers 30j" : locale === "es" ? "Carritos 30d" : locale === "it" ? "Carrelli 30g" : "Warenkörbe 30d", data.signals.add_to_cart_30d],
    [locale === "en" ? "Avg. rating" : locale === "tr" ? "Ort. puan" : locale === "fr" ? "Note moy." : locale === "es" ? "Valoración media" : locale === "it" ? "Valutazione media" : "Ø Bewertung", `${data.signals.review_avg} (${data.signals.review_count})`],
    [locale === "en" ? "Returns 30d" : locale === "tr" ? "İadeler 30g" : locale === "fr" ? "Retours 30j" : locale === "es" ? "Devoluciones 30d" : locale === "it" ? "Resi 30g" : "Rückgaben 30d", data.signals.return_count_30d],
    [locale === "en" ? "Discount" : locale === "tr" ? "İndirim" : locale === "fr" ? "Remise" : locale === "es" ? "Descuento" : locale === "it" ? "Sconto" : "Rabatt", `${data.signals.discount_pct}%`],
    [locale === "en" ? "Inventory" : locale === "tr" ? "Stok" : locale === "fr" ? "Stock" : locale === "es" ? "Inventario" : locale === "it" ? "Inventario" : "Lagerbestand", data.signals.inventory],
    [locale === "en" ? "Age" : locale === "tr" ? "Yaş" : locale === "fr" ? "Âge" : locale === "es" ? "Antigüedad" : locale === "it" ? "Età" : "Alter", `${data.signals.days_since_published} ${labelDays}`],
  ] : [];

  const contribRows = [
    { key: "popularity", label: locale === "en" ? "Popularity" : locale === "tr" ? "Popülerlik" : locale === "fr" ? "Popularité" : locale === "es" ? "Popularidad" : locale === "it" ? "Popolarità" : "Popularität", color: "#6366f1" },
    { key: "freshness", label: locale === "en" ? "Freshness" : locale === "tr" ? "Tazelik" : locale === "fr" ? "Fraîcheur" : locale === "es" ? "Frescura" : locale === "it" ? "Freschezza" : "Frische", color: "#10b981" },
    { key: "content", label: locale === "en" ? "Content" : locale === "tr" ? "İçerik" : locale === "fr" ? "Contenu" : locale === "es" ? "Contenido" : locale === "it" ? "Contenuto" : "Inhalt", color: "#3b82f6" },
    { key: "discount", label: locale === "en" ? "Discount" : locale === "tr" ? "İndirim" : locale === "fr" ? "Remise" : locale === "es" ? "Descuento" : locale === "it" ? "Sconto" : "Rabatt", color: "#f59e0b" },
    { key: "seller", label: locale === "en" ? "Seller" : locale === "tr" ? "Satıcı" : locale === "fr" ? "Vendeur" : locale === "es" ? "Vendedor" : locale === "it" ? "Venditore" : "Verkäufer", color: "#ec4899" },
    { key: "velocity", label: locale === "en" ? "Trend" : locale === "tr" ? "Trend" : locale === "fr" ? "Tendance" : locale === "es" ? "Tendencia" : locale === "it" ? "Trend" : "Trend", color: "#f97316" },
    { key: "exploration_bonus", label: locale === "en" ? "+ Exploration" : locale === "tr" ? "+ Keşif" : locale === "fr" ? "+ Exploration" : locale === "es" ? "+ Exploración" : locale === "it" ? "+ Esplorazione" : "+ Entdeckung", color: "#14b8a6" },
    { key: "urgency_bonus", label: locale === "en" ? "+ Urgency" : locale === "tr" ? "+ Aciliyet" : locale === "fr" ? "+ Urgence" : locale === "es" ? "+ Urgencia" : locale === "it" ? "+ Urgenza" : "+ Dringlichkeit", color: "#a855f7" },
    { key: "return_penalty", label: locale === "en" ? "− Return" : locale === "tr" ? "− İade" : locale === "fr" ? "− Retour" : locale === "es" ? "− Devolución" : locale === "it" ? "− Reso" : "− Rückgabe", color: "#ef4444" },
  ];

  return (
    <Modal
      open={!!productId}
      onClose={onClose}
      title={data?.title ? `Score: ${data.title}` : `${labelScore}-Details`}
      size="large"
    >
      <Modal.Section>
        {loading && (
          <Box padding="600">
            <InlineStack align="center">
              <Spinner size="small" />
            </InlineStack>
          </Box>
        )}
        {!loading && !data && <Banner tone="critical">{labelNotFound}</Banner>}
        {!loading && data && (
          <BlockStack gap="400">
            <InlineStack gap="400" blockAlign="center" wrap>
              <div
                style={{
                  background: "var(--p-color-bg-surface-success)",
                  border: "1px solid var(--p-color-border-success)",
                  borderRadius: 8,
                  padding: "10px 16px",
                  textAlign: "center",
                }}
              >
                <Text as="p" variant="bodySm" tone="subdued">{labelRank}</Text>
                <Text as="p" variant="headingLg" fontWeight="bold">
                  #{data.rank_position}
                </Text>
              </div>
              <div
                style={{
                  background: "var(--p-color-bg-surface-info)",
                  border: "1px solid var(--p-color-border-info)",
                  borderRadius: 8,
                  padding: "10px 16px",
                  textAlign: "center",
                }}
              >
                <Text as="p" variant="bodySm" tone="subdued">{labelScore}</Text>
                <Text as="p" variant="headingLg" fontWeight="bold">
                  {data.final_score?.toFixed(4)}
                </Text>
              </div>
              <div
                style={{
                  background: "var(--p-color-bg-surface-warning)",
                  border: "1px solid var(--p-color-border-warning)",
                  borderRadius: 8,
                  padding: "10px 16px",
                  textAlign: "center",
                }}
              >
                <Text as="p" variant="bodySm" tone="subdued">{labelStrategy}</Text>
                <Text as="p" variant="headingMd" fontWeight="bold">
                  {data.strategy}
                </Text>
              </div>
            </InlineStack>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">{labelRawData}</Text>
                {signalRows.map(([label, val]) => (
                  <InlineStack key={label} align="space-between" blockAlign="center">
                    <Text as="span" variant="bodySm" tone="subdued">
                      {label}
                    </Text>
                    <Text as="span" variant="bodySm" fontWeight="semibold">
                      {val}
                    </Text>
                  </InlineStack>
                ))}
              </BlockStack>

              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">{labelWeightedContribs}</Text>
                {contribRows.map(({ key, label, color }) => {
                  const val = contribs[key] || 0;
                  return (
                    <div key={key}>
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="span" variant="bodySm">
                          {label}
                        </Text>
                        <Text
                          as="span"
                          variant="bodySm"
                          fontWeight="semibold"
                          tone={val < 0 ? "critical" : val > 0 ? "success" : "subdued"}
                        >
                          {val >= 0 ? "+" : ""}
                          {val.toFixed(4)}
                        </Text>
                      </InlineStack>
                      <div style={{ background: "var(--p-color-border-secondary)", borderRadius: 3, height: 6, marginTop: 2 }}>
                        <div
                          style={{
                            width: `${Math.min(100, (Math.abs(val) / maxContrib) * 100)}%`,
                            background: color,
                            height: "100%",
                            borderRadius: 3,
                            opacity: val < 0 ? 0.6 : 1,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "2px solid var(--p-color-border)" }}>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {labelFinalScore}
                    </Text>
                    <Text as="span" variant="bodyMd" fontWeight="bold" tone="success">
                      {data.final_score?.toFixed(6)}
                    </Text>
                  </InlineStack>
                </div>
              </BlockStack>
            </div>
          </BlockStack>
        )}
      </Modal.Section>
    </Modal>
  );
}

export default function RankingPage() {
  const t = useTranslations("rankingPage");
  const router = useRouter();
  const locale = useLocale();
  const ui = getUI(locale);
  const [activeTab, setActiveTab] = useState(0);
  const [strategy, setStrategy] = useState("default");
  const [configs, setConfigs] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [success, setSuccess] = useState(null);
  const [breakdownId, setBreakdownId] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const closeBreakdown = useCallback(() => setBreakdownId(null), []);

  const strategyOptions = useMemo(() => strategySelectOptions(t), [t]);
  const currentStrategyDesc = strategyDescription(t, strategy);

  const maxScore = useMemo(
    () => products.reduce((m, p) => Math.max(m, parseFloat(p.final_score) || 0), 0.001),
    [products]
  );

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
  }, []);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const c = getMedusaAdminClient();
      const data = await c.getRankingConfig();
      if (data?.configs) setConfigs(data.configs);
    } catch {
      // ignore
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const c = getMedusaAdminClient();
      const data = await c.getRankingProducts({ strategy });
      if (data?.products) setProducts(data.products);
    } catch {
      // ignore
    } finally {
      setLoadingProducts(false);
    }
  }, [strategy]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (activeTab === 0) loadProducts();
  }, [activeTab, loadProducts]);

  const handleCompute = async () => {
    setComputing(true);
    setErr(null);
    try {
      await getMedusaAdminClient().triggerRankingCompute();
      setSuccess(t("successCompute"));
      setTimeout(() => {
        setSuccess(null);
        loadProducts();
      }, 6000);
    } catch (e) {
      setErr(e?.message || t("errorGeneric"));
    } finally {
      setComputing(false);
    }
  };

  const handleSaveConfig = async (strat, cfg) => {
    setSaving(true);
    setErr(null);
    try {
      await getMedusaAdminClient().updateRankingConfig(strat, cfg);
      setSuccess(t("successSave"));
      loadConfig();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setErr(e?.message || t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "placements", content: t("tabPlacements") },
    { id: "rules", content: t("tabRules") },
  ];

  return (
    <Page
      title={t("title")}
      subtitle={t("subtitle")}
      secondaryActions={[
        { content: t("load"), onAction: () => (activeTab === 0 ? loadProducts() : loadConfig()), disabled: activeTab === 0 ? loadingProducts : loadingConfig },
      ]}
      primaryAction={
        isSuperuser
          ? {
            content: computing ? t("computing") : t("compute"),
            onAction: handleCompute,
            loading: computing,
          }
          : undefined
      }
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {err && <Banner tone="critical" onDismiss={() => setErr(null)}>{err}</Banner>}
            {success && <Banner tone="success" onDismiss={() => setSuccess(null)}>{success}</Banner>}
            {isSuperuser && (
              <Text as="p" variant="bodySm" tone="subdued">
                {t("superuserOnly")}
              </Text>
            )}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  {t("whatIsTitle")}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  {t("whatIsBody")}
                </Text>
              </BlockStack>
            </Card>

            <Text as="h2" variant="headingLg">
              {t("flowTitle")}
            </Text>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
              }}
            >
              {[
                { title: t("flow1Title"), body: t("flow1Text") },
                { title: t("flow2Title"), body: t("flow2Text") },
                { title: t("flow3Title"), body: t("flow3Text") },
              ].map((step) => (
                <Card key={step.title}>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {step.title}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {step.body}
                    </Text>
                  </BlockStack>
                </Card>
              ))}
            </div>

            <Card>
              <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab} />
              <Box paddingBlockStart="400">
                {activeTab === 0 && (
                  <BlockStack gap="500">
                    <InlineStack align="space-between" blockAlign="start" wrap gap="400">
                      <div style={{ flex: "1 1 320px" }}>
                        <BlockStack gap="200">
                          <Text as="p" variant="bodySm" tone="subdued">
                            {t("strategyHelp")}
                          </Text>
                          <Select
                            label={t("strategyLabel")}
                            options={strategyOptions}
                            value={strategy}
                            onChange={setStrategy}
                            helpText={currentStrategyDesc}
                          />
                        </BlockStack>
                      </div>
                      <div style={{ paddingTop: 4 }}>
                        <BlockStack gap="200">
                          <Button onClick={loadProducts} loading={loadingProducts}>
                            {t("load")}
                          </Button>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {t("productCount", { count: products.length })}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {t("refreshNote")}
                          </Text>
                        </BlockStack>
                      </div>
                    </InlineStack>
                    <Divider />
                    <RankingInsights products={products} locale={locale} />
                    <Divider />
                    {loadingProducts ? (
                      <Box padding="600">
                        <InlineStack align="center">
                          <Spinner size="small" />
                        </InlineStack>
                      </Box>
                    ) : (
                      <RankingTable
                        products={products}
                        strategy={strategy}
                        onBreakdown={setBreakdownId}
                        t={t}
                        router={router}
                        maxScore={maxScore}
                      />
                    )}
                  </BlockStack>
                )}

                {activeTab === 1 && (
                  loadingConfig ? (
                    <Box padding="600">
                      <InlineStack align="center">
                        <Spinner size="small" />
                      </InlineStack>
                    </Box>
                  ) : (
                    <ConfigEditor configs={configs} onSave={handleSaveConfig} saving={saving} t={t} locale={locale} />
                  )
                )}
              </Box>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {breakdownId && (
        <BreakdownModal
          productId={breakdownId}
          strategy={strategy}
          onClose={closeBreakdown}
          locale={locale}
        />
      )}
    </Page>
  );
}
