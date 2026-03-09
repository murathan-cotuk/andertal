"use client";

import React, { useState, useContext } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { CartContext } from "@/context/CartContext";
import { formatPriceCents, htmlToText, getLocalizedProduct } from "@/lib/format";

export function StarRating({ average = 0, count = 0 }) {
  const full = Math.floor(average);
  const half = average - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="flex items-center" aria-hidden>
        {[...Array(full)].map((_, i) => (
          <span key={i} className="text-amber-400">★</span>
        ))}
        {half ? <span className="text-amber-400">★</span> : null}
        {[...Array(empty)].map((_, i) => (
          <span key={i} className="text-gray-300">★</span>
        ))}
      </span>
      {count !== undefined && (
        <span className="text-gray-500 text-sm ml-1">
          ({count} {count === 1 ? "Bewertung" : "Bewertungen"})
        </span>
      )}
    </div>
  );
}

export function ProductCard({ product, compact = false }) {
  const locale = useLocale();
  const { title: displayTitle, description: displayDescription } = getLocalizedProduct(product, locale);
  const cartState = useContext(CartContext);
  const addToCart = cartState?.addToCart ?? (async () => null);
  const cartLoading = cartState?.loading ?? false;
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  const variants = product.variants || [];
  const variant = variants[selectedVariantIndex] || variants[0];
  const image =
    variant?.image_url ||
    product.images?.[0]?.url ||
    product.thumbnail ||
    (Array.isArray(product.metadata?.media) && product.metadata.media?.[0]);
  const priceCents =
    variant?.prices?.[0]?.amount != null
      ? Number(variant.prices[0].amount)
      : product.price != null
        ? Math.round(Number(product.price) * 100)
        : 0;
  const saleCents = product.metadata?.rabattpreis_cents != null ? Number(product.metadata.rabattpreis_cents) : null;
  const hasSale = saleCents != null && saleCents > 0 && priceCents > 0;
  const displayCents = hasSale ? saleCents : priceCents;
  const discountPercent = hasSale && priceCents > 0 && saleCents < priceCents
    ? Math.round(((priceCents - saleCents) / priceCents) * 100)
    : null;
  const formattedPrice = formatPriceCents(displayCents);
  const descriptionText = htmlToText(displayDescription || product.subtitle || "");
  const reviewCount = product.metadata?.review_count != null ? Number(product.metadata.review_count) : 0;
  const reviewAvg = product.metadata?.review_avg != null ? Number(product.metadata.review_avg) : 0;
  const soldLastMonth = product.metadata?.sold_last_month != null ? Number(product.metadata.sold_last_month) : null;
  const inventory = variant?.inventory_quantity ?? product.variants?.[0]?.inventory_quantity ?? 0;
  const maxQty = Math.min(inventory || 10, 10);

  const handleAddToCart = async () => {
    const variantId = variant?.id;
    if (!variantId) {
      alert("Variant nicht verfügbar");
      return;
    }
    const result = await addToCart(variantId, quantity);
    if (result) alert("In den Einkaufswagen gelegt");
    else alert("Hinzufügen fehlgeschlagen");
  };

  const productUrl = `/produkt/${product.handle || product.id}`;

  return (
    <div
      className={`border border-border-light rounded-card overflow-hidden bg-background-card shadow-card hover:shadow-card-hover transition-all duration-base flex flex-col ${
        compact ? "max-w-[280px] flex-shrink-0 hover:scale-[1.02]" : "hover:scale-[1.02]"
      }`}
    >
      <Link href={productUrl}>
        <div className="aspect-square bg-background-soft flex items-center justify-center min-w-0 overflow-hidden">
          {image ? (
            <img
              src={image}
              alt={product.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-dark-500 text-small">Kein Bild</span>
          )}
        </div>
      </Link>
      <div className="p-4 flex flex-col flex-1">
        <Link href={productUrl}>
          <h3 className="font-semibold text-h4 mb-1 hover:text-primary line-clamp-2 text-dark-800">
            {displayTitle}
          </h3>
        </Link>
        {descriptionText && (
          <p className="text-dark-600 text-small mb-2 line-clamp-2">
            {descriptionText}
          </p>
        )}
        <div className="mb-2">
          <StarRating average={reviewAvg} count={reviewCount} />
        </div>
        {soldLastMonth != null && soldLastMonth > 0 && (
          <p className="text-gray-500 text-xs mb-2">
            {soldLastMonth} im letzten Monat verkauft
          </p>
        )}
        <p className="text-xl font-bold mb-3">
          {hasSale && (
            <span className="text-sm font-normal text-gray-500 line-through mr-2">
              {formatPriceCents(priceCents)} €
            </span>
          )}
          {formattedPrice} €
          {discountPercent != null && discountPercent > 0 && (
            <span className="text-sm font-semibold text-red-600 ml-1">–{discountPercent}%</span>
          )}
        </p>

        {variants.length > 1 && (
          <div className="mb-2">
            <label className="text-xs text-gray-500 block mb-1">Variante</label>
            <select
              value={selectedVariantIndex}
              onChange={(e) => setSelectedVariantIndex(Number(e.target.value))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              {variants.map((v, i) => (
                <option key={i} value={i}>
                  {v.title || v.value || `Option ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-gray-500 whitespace-nowrap">Anzahl:</label>
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm w-20"
          >
            {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleAddToCart}
          disabled={cartLoading || (inventory !== undefined && inventory <= 0)}
          className="mt-auto w-full bg-blue-600 text-white py-2.5 rounded font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {cartLoading ? "Wird hinzugefügt…" : "In den Einkaufswagen"}
        </button>
      </div>
    </div>
  );
}
