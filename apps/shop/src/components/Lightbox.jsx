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
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {src && (
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="w-10 h-10 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center justify-center"
            aria-label="Bild in neuem Tab öffnen"
            title="In neuem Tab öffnen"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
            </svg>
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center justify-center text-2xl"
          aria-label="Schließen"
        >
          ×
        </button>
      </div>
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
