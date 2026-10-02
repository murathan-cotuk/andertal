"use client";

import { useState, useEffect } from "react";
import styled, { keyframes } from "styled-components";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import { useAuthGuard, getToken } from "@andertal/lib";
import { Link } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";
import { getMedusaClient } from "@/lib/medusa-client";
import { resolveImageUrl } from "@/lib/image-url";
import { storefrontProductHandle } from "@/lib/product-url-handle";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createOrderSupportCase, primaryCaseIdFromCreate } from "@/lib/create-order-support-case";
import { destinationCountryFromOrder, formatVatPercent, getGoodsVatRatePercent, splitInclusiveVat } from "@/lib/goods-vat";

/* ─────────────── Design tokens ─────────────── */
const T = {
  orange: "var(--shop-accent, #ee8a12)",
  dark: "var(--body-color, #1d1b18)",
  dark2: "var(--body-color, #1d1b18)",
  gray1: "#5e574e",
  gray2: "#6b6459",
  gray3: "#a39a8d",
  border: "#efe8dd",
  cardBg: "#FFFFFF",
  pageBg: "#FAF7F2",
  radius: "18px",
  font: "inherit",
};

/* ─────────────── Status config ─────────────── */
const STATUS = {
  offen:           { dot: "#f59e0b", bg: "#fffbeb", color: "#92400e" },
  pending:         { dot: "#f59e0b", bg: "#fffbeb", color: "#92400e" },
  bezahlt:         { dot: "#10b981", bg: "#ecfdf5", color: "#065f46" },
  in_bearbeitung:  { dot: "#a65300", bg: "#fcebd5", color: "#7f3f00" },
  processing:      { dot: "#a65300", bg: "#fcebd5", color: "#7f3f00" },
  versendet:       { dot: "#1d1b18", bg: "#efe8dd", color: "#1d1b18" },
  shipped:         { dot: "#1d1b18", bg: "#efe8dd", color: "#1d1b18" },
  zugestellt:      { dot: "#10b981", bg: "#ecfdf5", color: "#065f46" },
  delivered:       { dot: "#10b981", bg: "#ecfdf5", color: "#065f46" },
  abgeschlossen:   { dot: "#10b981", bg: "#ecfdf5", color: "#065f46" },
  completed:       { dot: "#10b981", bg: "#ecfdf5", color: "#065f46" },
  storniert:       { dot: "#ef4444", bg: "#fef2f2", color: "#991b1b" },
  cancelled:       { dot: "#ef4444", bg: "#fef2f2", color: "#991b1b" },
  refunded:        { dot: "#a65300", bg: "#fcebd5", color: "#7f3f00" },
  retoure:         { dot: "#ef4444", bg: "#fef2f2", color: "#b91c1c" },
  retoure_anfrage: { dot: "#f59e0b", bg: "#fffbeb", color: "#92400e" },
};

const RETURN_STATUS = {
  offen:         { color: "#92400e", bg: "#fffbeb" },
  genehmigt:     { color: "#065f46", bg: "#ecfdf5" },
  abgelehnt:     { color: "#991b1b", bg: "#fef2f2" },
  abgeschlossen: { color: "#3a352f", bg: "#f3eee6" },
};

/** English / German status aliases → translation key (ordersPage.status_*). */
const STATUS_KEY = {
  offen: "offen", pending: "offen", bezahlt: "bezahlt", in_bearbeitung: "in_bearbeitung", processing: "in_bearbeitung",
  versendet: "versendet", shipped: "versendet", zugestellt: "zugestellt", delivered: "zugestellt",
  abgeschlossen: "abgeschlossen", completed: "abgeschlossen", storniert: "storniert", cancelled: "storniert",
  refunded: "refunded", retoure: "retoure", retoure_anfrage: "retoure_anfrage",
};

/* ─────────────── Carrier tracking ─────────────── */
const CARRIERS = [
  { match: "dhl",    name: "DHL",    url: n => `https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode=${n}` },
  { match: "dpd",    name: "DPD",    url: n => `https://tracking.dpd.de/status/de_DE/parcel/${n}` },
  { match: "ups",    name: "UPS",    url: n => `https://www.ups.com/track?tracknum=${n}` },
  { match: "fedex",  name: "FedEx",  url: n => `https://www.fedex.com/fedextrack/?trknbr=${n}` },
  { match: "hermes", name: "Hermes", url: n => `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsdetails/#/${n}` },
  { match: "evri",   name: "Evri",   url: n => `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsdetails/#/${n}` },
  { match: "gls",    name: "GLS",    url: n => `https://gls-group.com/DE/de/paketverfolgung?match=${n}` },
  { match: "post",   name: "Deutsche Post", url: n => `https://www.deutschepost.de/de/s/sendungsverfolgung.html?barcode=${n}` },
  { match: "go!",    name: "GO!",    url: n => `https://www.general-overnight.com/sendungsverfolgung/?tracking=${n}` },
  { match: "go express", name: "GO!", url: n => `https://www.general-overnight.com/sendungsverfolgung/?tracking=${n}` },
];

function resolveCarrier(name) {
  const c = (name || "").toLowerCase().trim();
  return CARRIERS.find(x => c.includes(x.match));
}

function buildTrackingUrl(carrier, num) {
  if (!num) return null;
  const found = resolveCarrier(carrier);
  return found ? found.url(encodeURIComponent(String(num).trim())) : null;
}

/* ─────────────── Helpers ─────────────── */
function fmtDate(d, locale = "de") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}
function fmtEur(cents, locale = "de") {
  return (Number(cents || 0) / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function displayStatus(order) {
  if (order.order_status === "refunded") return "refunded";
  if ((order.returns || []).some(r => r.refund_status === "erstattet")) return "refunded";
  const activeRet = (order.returns || []).find(r => r.status !== "abgelehnt" && r.status !== "abgeschlossen");
  if (activeRet) return activeRet.status === "genehmigt" ? "retoure" : "retoure_anfrage";
  const ds = String(order.delivery_status || "").toLowerCase();
  if (ds === "zugestellt") return "zugestellt";
  if (ds === "versendet") return "versendet";
  const os = String(order.order_status || "").toLowerCase();
  const ps = String(order.payment_status || "").toLowerCase();
  if ((ps === "bezahlt" || order.status === "paid") && (os === "offen" || os === "")) return "bezahlt";
  return order.order_status || order.delivery_status || "offen";
}

async function downloadBlob(endpoint, filename, token) {
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────── Styled components ─────────────── */
const slideDown = keyframes`
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const PageWrap = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${T.pageBg};
  font-family: ${T.font};
`;

const Card = styled.div`
  background: ${T.cardBg};
  border: 1px solid ${T.border};
  border-radius: ${T.radius};
  overflow: hidden;
  transition: box-shadow 200ms ease;
`;

const CardHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(160px, 200px) 1fr auto 36px;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  cursor: pointer;
  user-select: none;
  border-bottom: ${({ $open }) => ($open ? `1px solid ${T.border}` : "none")};

  &:hover { background: #faf7f2; }

  @media (max-width: 600px) {
    grid-template-columns: 1fr auto 32px;
  }
`;

const OrderNum = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
`;

const OrderNumText = styled.span`
  font-size: 13px;
  font-weight: 800;
  color: ${T.dark};
  white-space: nowrap;
  letter-spacing: -0.2px;
`;

const OrderDate = styled.span`
  font-size: 11px;
  color: ${T.gray3};
  white-space: nowrap;
`;

const ProductNames = styled.div`
  font-size: 12.5px;
  color: ${T.gray1};
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;

  @media (max-width: 600px) { display: none; }
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
`;

const Chevron = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid ${T.border};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: ${T.gray2};
  transition: transform 200ms ease, background 150ms ease;
  transform: ${({ $open }) => ($open ? "rotate(180deg)" : "rotate(0deg)")};
  background: ${({ $open }) => ($open ? "#f3eee6" : "#fff")};
`;

const ExpandedPanel = styled.div`
  animation: ${slideDown} 180ms ease;
`;

const Section = styled.div`
  padding: 14px 18px;
  border-bottom: 1px solid ${T.border};

  &:last-child { border-bottom: none; }
`;

const SectionLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  color: ${T.gray3};
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 10px;
`;

/* Status pill */
const PulsingDot = styled.span`
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`;

function StatusPill({ status }) {
  const t = useTranslations("ordersPage");
  const k = (status || "").toLowerCase();
  const s = STATUS[k]
    ? { ...STATUS[k], label: t(`status_${STATUS_KEY[k]}`) }
    : { label: status || "—", dot: "#a39a8d", bg: "#f3eee6", color: "#3a352f" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11.5, fontWeight: 700, color: s.color,
      background: s.bg, borderRadius: 20, padding: "3px 10px",
      letterSpacing: 0.1, whiteSpace: "nowrap", fontFamily: T.font,
    }}>
      <PulsingDot $color={s.dot} />
      {s.label}
    </span>
  );
}

/* Tracking chip */
function TrackingChip({ carrier, number }) {
  const t = useTranslations("ordersPage");
  const url = buildTrackingUrl(carrier, number);
  const carrierInfo = resolveCarrier(carrier);
  const displayName = carrierInfo?.name || carrier || "";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "#f0f9ff", border: "1px solid #bae6fd",
      borderRadius: 10, padding: "10px 14px",
    }}>
      {/* truck icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a65300" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <rect x="1" y="3" width="15" height="13" rx="1"/>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>

      <div style={{ flex: 1, minWidth: 0 }}>
        {displayName && (
          <div style={{ fontSize: 10, fontWeight: 700, color: "#a65300", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
            {displayName}
          </div>
        )}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              fontSize: 13, fontWeight: 600, fontFamily: "monospace",
              color: "#a65300", textDecoration: "none",
              borderBottom: "1px dashed #a65300",
              wordBreak: "break-all",
            }}
          >
            {number}
          </a>
        ) : (
          <span style={{ fontSize: 13, fontFamily: "monospace", color: "#3a352f", wordBreak: "break-all" }}>
            {number}
          </span>
        )}
      </div>

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 12, fontWeight: 700, color: "#fff",
            background: "#a65300", borderRadius: 8, padding: "6px 12px",
            textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          {t("trackShipment")}
          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd"/>
          </svg>
        </a>
      )}
    </div>
  );
}

/* Items row */
function ItemRow({ item, isLast, locale }) {
  const raw = item.title || "";
  const m = raw.match(/^(.*)\s+\((.+)\)$/);
  const name = m ? m[1] : raw;
  const variant = m ? m[2] : null;
  const lineTotal = (item.unit_price_cents || 0) * (item.quantity || 1);
  const productUrl = storefrontProductHandle(
    { id: item.product_id, handle: item.product_handle, metadata: item.product_metadata },
    locale,
  );

  const thumbEl = item.thumbnail
    ? <img src={resolveImageUrl ? resolveImageUrl(item.thumbnail) : item.thumbnail} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    : <div style={{ width: "100%", height: "100%", background: "#e6dfd4" }} />;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      paddingBottom: isLast ? 0 : 12, marginBottom: isLast ? 0 : 12,
      borderBottom: isLast ? "none" : `1px solid ${T.border}`,
    }}>
      {/* Thumbnail */}
      {productUrl ? (
        <Link href={`/${productUrl}`} onClick={e => e.stopPropagation()} style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}`, flexShrink: 0, background: "#faf7f2", display: "block" }}>
          {thumbEl}
        </Link>
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}`, flexShrink: 0, background: "#faf7f2" }}>
          {thumbEl}
        </div>
      )}

      {/* Name + variant */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {productUrl ? (
          <Link
            href={`/${productUrl}`}
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 13, fontWeight: 600, color: T.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", textDecoration: "none" }}
          >
            {name}
          </Link>
        ) : (
          <div style={{ fontSize: 13, fontWeight: 600, color: T.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </div>
        )}
        {variant && (
          <div style={{ fontSize: 11.5, color: T.gray2, marginTop: 2 }}>
            {variant.split(/\s*\/\s*/).join(" · ")}
          </div>
        )}
      </div>

      {/* Qty */}
      <div style={{ fontSize: 12, color: T.gray2, flexShrink: 0 }}>
        ×{item.quantity || 1}
      </div>

      {/* Price */}
      <div style={{ fontSize: 13, fontWeight: 700, color: T.dark, flexShrink: 0, textAlign: "right", minWidth: 72 }}>
        {fmtEur(lineTotal, locale)}
      </div>
    </div>
  );
}

/* Action button */
function ActionBtn({ children, onClick, disabled, color = T.dark, bg = "#faf7f2", danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 12.5, fontWeight: 600,
        color: disabled ? T.gray3 : (danger ? "#b91c1c" : color),
        background: disabled ? "#f3eee6" : (danger ? "#fef2f2" : bg),
        border: `1px solid ${disabled ? T.border : (danger ? "#fecaca" : color + "22")}`,
        borderRadius: 8, padding: "7px 13px",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: T.font, whiteSpace: "nowrap",
        transition: "opacity 150ms ease",
      }}
    >
      {children}
    </button>
  );
}

/* Retoure reasons — the German text is the value stored with the return (sellers read it in
 * Sellercentral); the label shown to the customer comes from ordersPage.reason_<index>. */
const RETOURE_REASONS = [
  "Falsches Produkt erhalten",
  "Defektes / beschädigtes Produkt",
  "Falsche Größe / Farbe",
  "Nicht wie beschrieben",
  "Produkt gefällt mir nicht",
  "Doppelte Bestellung",
  "Sonstiges",
];

/* ─────────────── OrderCard ─────────────── */
function OrderCard({ order, expanded, onToggle, onRefresh }) {
  const locale = useLocale();
  const t = useTranslations("ordersPage");
  const router = useRouter();
  const items = order.items || [];
  const returns = order.returns || [];
  const status = displayStatus(order);
  const total = Number(order.total_cents || 0);
  const subtotal = Number(order.subtotal_cents || 0);
  const shipping = Number(order.shipping_cents || 0);
  const discount = Number(order.discount_cents || 0);
  const vatRate = getGoodsVatRatePercent(destinationCountryFromOrder(order));
  const { vatCents: vatAmount } = splitInclusiveVat(Math.max(0, (subtotal || 0) + (shipping || 0) || total), vatRate);
  const orderNum = order.order_number || order.id?.slice(0, 8).toUpperCase();

  const activeReturn = returns.find(r => r.status !== "abgelehnt" && r.status !== "abgeschlossen");
  const hasApprovedReturn = returns.some(r => r.status === "genehmigt");
  // Auto-generated at return-request time now (Sendcloud) — no longer waits on manual approval.
  const returnWithLabel = returns.find(r => r.label_url) || null;
  const blockedForReturn = ["storniert", "refunded", "cancelled", "retoure", "retoure_anfrage"];
  const canRequestReturn = !activeReturn && !blockedForReturn.includes(status);

  const [showRetoure, setShowRetoure] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [messageStep, setMessageStep] = useState("pick"); // pick | compose
  const [retoureReason, setRetoureReason] = useState(RETOURE_REASONS[0]);
  const [retoureNotes, setRetoureNotes] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [busy, setBusy] = useState(null);
  const [actionErr, setActionErr] = useState(null);
  const [actionOk, setActionOk] = useState(null);

  async function withBusy(key, fn) {
    setBusy(key); setActionErr(null); setActionOk(null);
    try { await fn(); } catch (e) { setActionErr(e.message || t("error")); } finally { setBusy(null); }
  }

  const token = () => getToken("customer");
  const openMessageFlow = () => {
    setShowRetoure(false);
    setShowMessage(true);
    setMessageBody("");
    setActionErr(null);
    if (items.length === 1 && items[0]?.id) {
      setSelectedItemId(String(items[0].id));
      setMessageStep("compose");
    } else {
      setSelectedItemId("");
      setMessageStep("pick");
    }
  };
  const selectedMessageItem = items.find((it) => String(it.id || "") === String(selectedItemId || "")) || null;

  /* thumbnail strip for collapsed view */
  const thumbs = items.slice(0, 3).filter(it => it.thumbnail);

  return (
    <Card>
      {/* ── Collapsed header ── */}
      <CardHeader $open={expanded} onClick={onToggle}>
        {/* Col 1: order # (links directly into the order — doesn't just toggle the accordion) + date */}
        <OrderNum>
          <Link href={`/order/${order.id}`} onClick={e => e.stopPropagation()} style={{ textDecoration: "none" }}>
            <OrderNumText>#{orderNum}</OrderNumText>
          </Link>
          <OrderDate>{fmtDate(order.created_at, locale)}</OrderDate>
        </OrderNum>

        {/* Col 2: product names (hidden on mobile via CSS) */}
        <ProductNames>
          {thumbs.length > 0 ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              {thumbs.map((it, i) => (
                <img
                  key={i}
                  src={resolveImageUrl ? resolveImageUrl(it.thumbnail) : it.thumbnail}
                  alt=""
                  style={{ width: 28, height: 28, borderRadius: 5, objectFit: "cover", border: `1px solid ${T.border}`, flexShrink: 0 }}
                />
              ))}
              <span style={{ marginLeft: 4 }}>
                {items.map(it => (it.title || "").replace(/\s+\(.+\)$/, "")).filter(Boolean).join(", ")}
              </span>
            </span>
          ) : (
            items.map(it => (it.title || "").replace(/\s+\(.+\)$/, "")).filter(Boolean).join(", ")
          )}
        </ProductNames>

        {/* Col 3: status + price */}
        <HeaderRight>
          <StatusPill status={status} />
          <span style={{ fontSize: 14, fontWeight: 800, color: T.dark, letterSpacing: -0.4, fontFamily: T.font }}>
            {fmtEur(total, locale)}
          </span>
        </HeaderRight>

        {/* Col 4: chevron */}
        <Chevron $open={expanded}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </Chevron>
      </CardHeader>

      {/* ── Expanded panel ── */}
      {expanded && (
        <ExpandedPanel>

          {/* Items */}
          {items.length > 0 && (
            <Section>
              <SectionLabel>{t("items", { count: items.length })}</SectionLabel>
              {items.map((item, i) => (
                <ItemRow key={item.id || i} item={item} isLast={i === items.length - 1} locale={locale} />
              ))}
            </Section>
          )}

          {/* Price breakdown */}
          <Section>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <PriceRow label={t("subtotal")} value={fmtEur(subtotal || (total - shipping + discount), locale)} />
              <PriceRow label={t("shipping")} value={shipping === 0 ? t("free") : fmtEur(shipping, locale)} />
              {discount > 0 && <PriceRow label={t("discount")} value={`−${fmtEur(discount, locale)}`} color="#dc2626" />}
              <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 6, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.dark, fontFamily: T.font }}>{t("total")}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.dark, fontFamily: T.font }}>{fmtEur(total, locale)}</span>
              </div>
              <PriceRow label={t("vatIncluded", { rate: formatVatPercent(vatRate) })} value={fmtEur(vatAmount, locale)} muted />
            </div>
          </Section>

          {/* Tracking */}
          {order.tracking_number && (
            <Section>
              <TrackingChip carrier={order.carrier_name} number={order.tracking_number} />
            </Section>
          )}

          {/* Return requests */}
          {returns.length > 0 && (
            <Section>
              <SectionLabel>{t("returns")}</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {returns.map((r, i) => {
                  const rs = (r.status || "offen").toLowerCase();
                  const s = RETURN_STATUS[rs] ? { ...RETURN_STATUS[rs], label: t(`ret_${rs}`) } : { label: r.status, color: "#3a352f", bg: "#f3eee6" };
                  const reasonIdx = RETOURE_REASONS.indexOf(r.reason);
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                      background: s.bg, borderRadius: 8, padding: "8px 12px",
                      fontSize: 12.5, color: s.color, fontFamily: T.font,
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.96"/>
                      </svg>
                      <span style={{ fontWeight: 700 }}>
                        {t("returnLabel")}{r.return_number ? ` #${r.return_number}` : ""}
                      </span>
                      <span style={{ opacity: 0.8 }}>· {s.label}</span>
                      {r.reason && <span style={{ opacity: 0.65 }}>· {reasonIdx >= 0 ? t(`reason_${reasonIdx}`) : r.reason}</span>}
                      {r.created_at && (
                        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>{fmtDate(r.created_at, locale)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Feedback */}
          {actionErr && (
            <div style={{ margin: "0 18px 4px", background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "8px 12px", borderRadius: 8, fontSize: 12.5, fontFamily: T.font }}>
              {actionErr}
            </div>
          )}
          {actionOk && (
            <div style={{ margin: "0 18px 4px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", padding: "8px 12px", borderRadius: 8, fontSize: 12.5, fontFamily: T.font }}>
              {actionOk}
            </div>
          )}

          {/* Actions */}
          <Section style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {/* Rechnung */}
            <ActionBtn
              color="#a65300" bg="#f0f9ff"
              disabled={busy === "invoice"}
              onClick={e => { e.stopPropagation(); withBusy("invoice", () => downloadBlob(`/api/store-invoice/${order.id}`, `Rechnung-${orderNum}.pdf`, token())); }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              {busy === "invoice" ? "…" : t("invoice")}
            </ActionBtn>

            {/* Retourenschein */}
            {hasApprovedReturn && (
              <ActionBtn
                color="#6d28d9" bg="#efe8dd"
                disabled={busy === "retourenschein"}
                onClick={e => { e.stopPropagation(); withBusy("retourenschein", () => downloadBlob(`/api/store-return-retourenschein/${order.id}`, `Retourenschein-${orderNum}.pdf`, token())); }}
              >
                {busy === "retourenschein" ? "…" : t("returnSlip")}
              </ActionBtn>
            )}

            {/* Rücksende-Etikett (DHL, auto-generiert via Sendcloud) */}
            {returnWithLabel && (
              <ActionBtn
                color="#a65300" bg="#fcebd5"
                onClick={e => { e.stopPropagation(); window.open(returnWithLabel.label_url, "_blank", "noopener,noreferrer"); }}
              >
                {t("returnShippingLabel")}
              </ActionBtn>
            )}

            {/* Retoure anfragen */}
            {canRequestReturn && (
              <ActionBtn
                color={T.orange} bg="#fff7ed"
                onClick={e => { e.stopPropagation(); setShowRetoure(v => !v); setShowMessage(false); }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.96"/>
                </svg>
                {t("requestReturn")}
              </ActionBtn>
            )}

            {/* Nachricht */}
            <ActionBtn
              color={T.gray1} bg="#faf7f2"
              onClick={e => { e.stopPropagation(); openMessageFlow(); }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              {t("message")}
            </ActionBtn>

            {/* Stornieren */}
            {order.cancellation_allowed && (
              <ActionBtn
                danger
                disabled={busy === "cancel"}
                onClick={e => {
                  e.stopPropagation();
                  if (!confirm(t("confirmCancel"))) return;
                  withBusy("cancel", async () => {
                    const res = await getMedusaClient().request(`/store/orders/${order.id}/cancel`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token()}` },
                      body: JSON.stringify({}),
                    });
                    if (res?.__error) throw new Error(res.message || t("cancelFailed"));
                    setActionOk(t("cancelled"));
                    onRefresh?.();
                  });
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                {busy === "cancel" ? "…" : t("cancel")}
              </ActionBtn>
            )}

            {/* Details link */}
            <Link
              href={`/order/${order.id}`}
              onClick={e => e.stopPropagation()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                marginLeft: "auto",
                fontSize: 12.5, fontWeight: 700, color: T.orange,
                background: "#fff7ed", border: `1px solid ${T.orange}22`,
                borderRadius: 8, padding: "7px 13px", textDecoration: "none",
                fontFamily: T.font, whiteSpace: "nowrap",
              }}
            >
              {t("details")}
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </Link>
          </Section>

          {/* Retoure form */}
          {showRetoure && (
            <div style={{ margin: "0 18px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "14px", fontFamily: T.font }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 12 }}>{t("returnFormTitle")}</div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: T.dark2, display: "block", marginBottom: 5 }}>{t("reason")}</label>
              <select
                value={retoureReason}
                onChange={e => setRetoureReason(e.target.value)}
                style={{ width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${T.border}`, borderRadius: 8, color: T.dark, background: "#fff", marginBottom: 10, fontFamily: T.font }}
              >
                {RETOURE_REASONS.map((r, i) => <option key={r} value={r}>{t(`reason_${i}`)}</option>)}
              </select>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: T.dark2, display: "block", marginBottom: 5 }}>{t("notes")}</label>
              <textarea
                value={retoureNotes}
                onChange={e => setRetoureNotes(e.target.value)}
                rows={3}
                placeholder={t("notesPlaceholder")}
                style={{ width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${T.border}`, borderRadius: 8, color: T.dark, resize: "vertical", fontFamily: T.font, boxSizing: "border-box", marginBottom: 10 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    withBusy("retoure", async () => {
                      const res = await getMedusaClient().request(`/store/orders/${order.id}/return-request`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token()}` },
                        body: JSON.stringify({ reason: retoureReason, notes: retoureNotes }),
                      });
                      if (res?.__error) throw new Error(res.message || t("error"));
                      setActionOk(t("returnSubmitted"));
                      setShowRetoure(false);
                      onRefresh?.();
                    });
                  }}
                  disabled={busy === "retoure"}
                  style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: T.orange, border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontFamily: T.font }}
                >
                  {busy === "retoure" ? t("sending") : t("sendRequest")}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setShowRetoure(false); }}
                  style={{ fontSize: 13, color: T.gray2, background: "none", border: "none", cursor: "pointer", padding: "8px", fontFamily: T.font }}
                >
                  {t("abort")}
                </button>
              </div>
            </div>
          )}

          {/* Message form: 1) Produkt wählen → 2) Nachricht → Support-Fall */}
          {showMessage && (
            <div style={{ margin: "0 18px 16px", background: "#faf7f2", border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px", fontFamily: T.font }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.dark, marginBottom: 12 }}>
                {messageStep === "pick" ? t("pickProduct") : t("sendMessage")}
              </div>

              {messageStep === "pick" && (
                <>
                  <p style={{ fontSize: 12.5, color: T.gray1, margin: "0 0 10px" }}>
                    {t("pickHint")}
                  </p>
                  {items.length === 0 && (
                    <p style={{ fontSize: 12.5, color: "#b91c1c" }}>{t("noItems")}</p>
                  )}
                  {items.map((it) => (
                    <button
                      key={it.id || it.product_id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!it.id) return;
                        setSelectedItemId(String(it.id));
                        setMessageStep("compose");
                      }}
                      disabled={!it.id}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px",
                        border: "1px solid #e6dfd4", borderRadius: 10, marginBottom: 8, background: "#fff",
                        cursor: it.id ? "pointer" : "not-allowed", opacity: it.id ? 1 : 0.5, textAlign: "left",
                        fontFamily: T.font,
                      }}
                    >
                      <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 6, overflow: "hidden", background: "#f3eee6" }}>
                        {it.thumbnail ? (
                          <img src={resolveImageUrl(it.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                        ) : <div style={{ width: "100%", height: "100%", background: "#e6dfd4" }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {it.title || it.product_title || t("product")}
                        </div>
                        <div style={{ fontSize: 11, color: T.gray3 }}>× {it.quantity}</div>
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setShowMessage(false); }}
                    style={{ fontSize: 13, color: T.gray2, background: "none", border: "none", cursor: "pointer", padding: "8px 0", fontFamily: T.font }}
                  >
                    {t("abort")}
                  </button>
                </>
              )}

              {messageStep === "compose" && (
                <>
                  {selectedMessageItem && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: "#fff", marginBottom: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 6, overflow: "hidden", background: "#f3eee6", flexShrink: 0 }}>
                        {selectedMessageItem.thumbnail ? (
                          <img src={resolveImageUrl(selectedMessageItem.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        ) : null}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: T.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {selectedMessageItem.title || selectedMessageItem.product_title || t("product")}
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMessageStep("pick"); setMessageBody(""); }}
                          style={{ background: "none", border: "none", color: T.orange, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
                        >
                          {t("change")}
                        </button>
                      )}
                    </div>
                  )}
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: T.dark2, display: "block", marginBottom: 5 }}>{t("message")}</label>
                  <textarea
                    value={messageBody}
                    onChange={e => setMessageBody(e.target.value)}
                    rows={4}
                    placeholder={t("messagePlaceholder", { number: orderNum })}
                    style={{ width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${T.border}`, borderRadius: 8, color: T.dark, resize: "vertical", fontFamily: T.font, boxSizing: "border-box", marginBottom: 10 }}
                  />
                  <div style={{ fontSize: 12, color: T.gray2, marginBottom: 10 }}>
                    {t("messageHint")}
                  </div>
                  {actionErr && <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>{actionErr}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        if (!messageBody.trim() || !selectedItemId) return;
                        withBusy("message", async () => {
                          const res = await createOrderSupportCase({
                            orderId: order.id,
                            itemIds: [selectedItemId],
                            title: t("caseTitle", { number: orderNum }),
                            description: messageBody.trim(),
                            locale,
                            category: "seller",
                            subcategory: "message",
                          });
                          if (res?.__error) throw new Error(res.message || t("error"));
                          const caseId = primaryCaseIdFromCreate(res);
                          setShowMessage(false);
                          setMessageBody("");
                          router.push(caseId ? `/nachrichten?case=${encodeURIComponent(caseId)}` : "/nachrichten");
                        });
                      }}
                      disabled={busy === "message" || !messageBody.trim() || !selectedItemId}
                      style={{
                        fontSize: 13, fontWeight: 700, color: "#fff", background: T.dark,
                        border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer",
                        fontFamily: T.font, opacity: (!messageBody.trim() || busy === "message" || !selectedItemId) ? 0.5 : 1,
                      }}
                    >
                      {busy === "message" ? t("sending") : t("submit")}
                    </button>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setShowMessage(false); }}
                      style={{ fontSize: 13, color: T.gray2, background: "none", border: "none", cursor: "pointer", padding: "8px", fontFamily: T.font }}
                    >
                      {t("abort")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        </ExpandedPanel>
      )}
    </Card>
  );
}

/* Small price row helper (inline, not styled-component) */
function PriceRow({ label, value, color, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: color || (muted ? T.gray3 : T.gray1), fontFamily: T.font }}>
      <span>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

/* ─────────────── Page ─────────────── */
export default function OrdersPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const t = useTranslations("ordersPage");

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  function fetchOrders() {
    const tok = getToken("customer");
    if (!tok) { setLoading(false); return; }
    getMedusaClient().request("/store/orders/me", { headers: { Authorization: `Bearer ${tok}` } })
      .then(res => {
        if (res?.__error) setError(res.message || t("error"));
        else setOrders(res?.orders || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchOrders(); }, []);

  const toggleExpand = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <PageWrap>
      <ShopHeader />
      <main style={{ flex: 1 }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout title={t("title")}>
            <div>
              {loading && <GlobalPageLoader />}

              {error && !loading && (
                <div style={{
                  background: "#fef2f2", border: "1px solid #fecaca",
                  color: "#dc2626", padding: "12px 16px", borderRadius: T.radius,
                  fontSize: 13, fontFamily: T.font,
                }}>
                  {t("loadError")}
                </div>
              )}

              {!loading && !error && orders.length === 0 && (
                <div style={{ textAlign: "center", padding: "64px 0", fontFamily: T.font }}>
                  {/* Shopping bag icon */}
                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: "50%", background: "#fff7ed", marginBottom: 20 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                      <line x1="3" y1="6" x2="21" y2="6"/>
                      <path d="M16 10a4 4 0 01-8 0"/>
                    </svg>
                  </div>
                  <p style={{ color: T.gray1, fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>
                    {t("empty")}
                  </p>
                  <p style={{ color: T.gray3, fontSize: 13, margin: "0 0 24px" }}>
                    {t("emptyHint")}
                  </p>
                  <Link href="/" style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: T.orange, color: "#fff", padding: "10px 22px",
                    borderRadius: 10, fontWeight: 700, textDecoration: "none",
                    fontSize: 13.5, fontFamily: T.font,
                    border: "1px solid #e6dfd4", boxShadow: "0 0 0 1px rgba(29,27,24,0.08)",
                  }}>
                    {t("toShop")}
                  </Link>
                </div>
              )}

              {orders.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {orders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      expanded={!!expanded[order.id]}
                      onToggle={() => toggleExpand(order.id)}
                      onRefresh={fetchOrders}
                    />
                  ))}
                </div>
              )}
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </PageWrap>
  );
}
