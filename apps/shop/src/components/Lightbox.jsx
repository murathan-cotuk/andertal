"use client";

import React, { useEffect } from "react";

export function Lightbox({ images = [], currentIndex = 0, onClose, onPrev, onNext }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onPrev, onNext]);

  const src = images[currentIndex]?.url || images[currentIndex] || "";
  const alt = images[currentIndex]?.alt ?? "Produktbild";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/80"
      style={{ zIndex: 2147483647 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bildergalerie"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center justify-center text-2xl"
        aria-label="Schließen"
      >
        ×
      </button>
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center justify-center text-2xl"
            aria-label="Vorheriges Bild"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center justify-center text-2xl"
            aria-label="Nächstes Bild"
          >
            ›
          </button>
        </>
      )}
      <div
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {typeof src === "string" && src ? (
          <img src={src} alt={alt} className="max-w-full max-h-[90vh] object-contain rounded" />
        ) : null}
      </div>
    </div>
  );
}
