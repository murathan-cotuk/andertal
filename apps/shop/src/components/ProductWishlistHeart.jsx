"use client";

import React, { useState } from "react";
import { useCustomerAuth as useAuth } from "@belucha/lib";
import { Link } from "@/i18n/navigation";
import { useWishlist } from "@/context/WishlistContext";

const btnBase = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.92)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  transition: "transform 0.15s, background 0.15s",
};

/**
 * Merkzettel toggle on product card / PDP. Guests see login hint (no navigation away on first click).
 */
export default function ProductWishlistHeart({ productId, title = "Merkzettel", positionAbsolute = true }) {
  const { user } = useAuth();
  const { isInWishlist, toggle } = useWishlist();
  const [guestMsg, setGuestMsg] = useState(false);
  const on = productId && isInWishlist(productId);

  const handleClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!productId) return;
    if (!user?.id) {
      setGuestMsg(true);
      window.setTimeout(() => setGuestMsg(false), 4000);
      return;
    }
    await toggle(productId);
  };

  const btnStyle = {
    ...btnBase,
    ...(positionAbsolute ? { position: "absolute", top: 8, right: 8, zIndex: 5 } : { position: "relative" }),
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={on ? `${title} entfernen` : `${title}`}
        title={!user?.id ? "Zum Merkzettel — Anmeldung erforderlich" : on ? "Vom Merkzettel entfernen" : "Auf den Merkzettel"}
        style={btnStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? "#e11d48" : "none"} stroke={on ? "#e11d48" : "#374151"} strokeWidth="2" aria-hidden>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
      {guestMsg && (
        <div
          style={{
            position: "absolute",
            top: 48,
            right: 0,
            zIndex: 6,
            maxWidth: 220,
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: 1.4,
            background: "#111827",
            color: "#fff",
            borderRadius: 8,
            boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          Bitte{" "}
          <Link href="/login" style={{ color: "#fdba74", fontWeight: 700 }}>
            anmelden
          </Link>
          , um Produkte auf Ihren Merkzettel zu legen.
        </div>
      )}
    </>
  );
}
