"use client";

import { useState } from "react";
import { Text } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { lt } from "@/lib/locale-text";

/**
 * Konsept s34: per-market prices (metadata.prices[CC]). Only EUR markets — checkout charges in
 * EUR and reads prices[country] first (line-unit-price.js), so a CHF/TRY amount here would be
 * charged as euros. Empty = the DE price applies.
 */
export const EUR_MARKETS = [
  { code: "AT", flag: "🇦🇹", label: "Österreich", vatRate: 20 },
  { code: "FR", flag: "🇫🇷", label: "France", vatRate: 20 },
  { code: "IT", flag: "🇮🇹", label: "Italia", vatRate: 22 },
  { code: "ES", flag: "🇪🇸", label: "España", vatRate: 21 },
];

const fmt = (cents) => (cents != null && Number.isFinite(Number(cents)) ? (Number(cents) / 100).toFixed(2) : "");

function parseCents(raw) {
  const s = String(raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

export default function MarketPriceTable({ prices = {}, deBruttoCents = null, deSaleCents = null, onCommit }) {
  const locale = useLocale();
  const [drafts, setDrafts] = useState({});
  const L = {
    market: lt(locale, "Market", "Pazar", "Marché", "Mercado", "Mercato", "Markt"),
    vat: lt(locale, "VAT", "KDV", "TVA", "IVA", "IVA", "MwSt."),
    price: lt(locale, "Price (gross)", "Fiyat (brüt)", "Prix (TTC)", "Precio (bruto)", "Prezzo (lordo)", "Preis (brutto)"),
    sale: lt(locale, "Sale price", "İndirimli fiyat", "Prix promo", "Precio de oferta", "Prezzo scontato", "Angebotspreis"),
    net: lt(locale, "Net", "Net", "HT", "Neto", "Netto", "Netto"),
    title: lt(locale, "Prices per market", "Pazar bazlı fiyatlar", "Prix par marché", "Precios por mercado", "Prezzi per mercato", "Preise je Markt"),
    help: lt(locale,
      "Optional. Empty = the Germany price applies. EUR markets only.",
      "İsteğe bağlı. Boş = Almanya fiyatı geçerli. Yalnız EUR pazarları.",
      "Facultatif. Vide = le prix Allemagne s'applique. Marchés en EUR uniquement.",
      "Opcional. Vacío = se aplica el precio de Alemania. Solo mercados en EUR.",
      "Facoltativo. Vuoto = vale il prezzo Germania. Solo mercati in EUR.",
      "Optional. Leer = es gilt der Deutschland-Preis. Nur EUR-Märkte."),
  };

  const cell = (code, field, stored, fallback) => {
    const key = `${code}_${field}`;
    const value = Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : fmt(stored);
    return (
      <input
        className="sc-market-price-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={fallback != null ? fmt(fallback) : "—"}
        aria-label={`${code} ${field === "brutto_cents" ? L.price : L.sale}`}
        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value.replace(/[^\d.,]/g, "") }))}
        onBlur={(e) => {
          const cents = parseCents(e.currentTarget.value);
          setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
          if (cents === undefined) return;
          if ((stored ?? null) !== cents) onCommit?.(code, field, cents);
        }}
      />
    );
  };

  return (
    <div className="sc-market-prices">
      <Text as="h3" variant="headingSm">{L.title}</Text>
      <Text as="p" variant="bodySm" tone="subdued">{L.help}</Text>
      <div className="sc-market-prices-scroll">
        <table className="sc-market-prices-table">
          <thead>
            <tr>
              <th>{L.market}</th>
              <th>{L.vat}</th>
              <th>{L.price}</th>
              <th>{L.sale}</th>
              <th className="is-num">{L.net}</th>
            </tr>
          </thead>
          <tbody>
            {EUR_MARKETS.map((m) => {
              const entry = prices?.[m.code] && typeof prices[m.code] === "object" ? prices[m.code] : {};
              const brutto = entry.brutto_cents != null ? Number(entry.brutto_cents) : null;
              const sale = entry.sale_cents != null ? Number(entry.sale_cents) : null;
              const effective = sale ?? brutto ?? deSaleCents ?? deBruttoCents;
              const net = effective != null ? Math.round(effective / (1 + m.vatRate / 100)) : null;
              return (
                <tr key={m.code}>
                  <td><span aria-hidden>{m.flag}</span> {m.label}</td>
                  <td>{m.vatRate} %</td>
                  <td>{cell(m.code, "brutto_cents", brutto, deBruttoCents)}</td>
                  <td>{cell(m.code, "sale_cents", sale, null)}</td>
                  <td className="is-num">{net != null ? `${fmt(net)} €` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
