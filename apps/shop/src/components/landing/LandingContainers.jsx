"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getMedusaClient } from "@/lib/medusa-client";

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
  return `${BACKEND_URL}/uploads/${url}`;
}

function getTextPositionStyle(pos) {
  const map = {
    "top-left":     { alignItems: "flex-start", justifyContent: "flex-start", textAlign: "left" },
    "top-center":   { alignItems: "flex-start", justifyContent: "center",     textAlign: "center" },
    "top-right":    { alignItems: "flex-start", justifyContent: "flex-end",   textAlign: "right" },
    "center-left":  { alignItems: "center",     justifyContent: "flex-start", textAlign: "left" },
    "center":       { alignItems: "center",     justifyContent: "center",     textAlign: "center" },
    "center-right": { alignItems: "center",     justifyContent: "flex-end",   textAlign: "right" },
    "bottom-left":  { alignItems: "flex-end",   justifyContent: "flex-start", textAlign: "left" },
    "bottom-center":{ alignItems: "flex-end",   justifyContent: "center",     textAlign: "center" },
    "bottom-right": { alignItems: "flex-end",   justifyContent: "flex-end",   textAlign: "right" },
  };
  return map[pos] || map["center"];
}

// ── Hero Banner Slider ────────────────────────────────────────────────────────
function HeroBanner({ container }) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);
  const slides = (container.slides || []).filter((s) => s.image);
  const height = container.height || "500px";

  const goTo = useCallback((idx) => {
    setCurrent(idx);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (container.autoplay !== false && slides.length > 1) {
      timerRef.current = setTimeout(() => setCurrent((c) => (c + 1) % slides.length), container.delay || 4000);
    }
  }, [slides.length, container.autoplay, container.delay]);

  useEffect(() => {
    if (slides.length > 1 && container.autoplay !== false) {
      timerRef.current = setTimeout(() => setCurrent((c) => (c + 1) % slides.length), container.delay || 4000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, slides.length, container.autoplay, container.delay]);

  if (slides.length === 0) return null;

  const slide = slides[current];
  const posStyle = getTextPositionStyle(slide.text_position || "center");

  return (
    <div style={{ position: "relative", width: "100%", height, overflow: "hidden", background: "#111" }}>
      {/* Slides */}
      {slides.map((s, i) => {
        const imgContent = (
          <>
            <img src={resolveUrl(s.image)} alt={s.title || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {(s.overlay > 0) && <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${(s.overlay || 0) / 100})` }} />}
          </>
        );
        const wrapStyle = { position: "absolute", inset: 0, opacity: i === current ? 1 : 0, transition: "opacity 0.7s ease" };
        return s.btn_url ? (
          <a key={i} href={s.btn_url} style={{ ...wrapStyle, display: "block" }}>{imgContent}</a>
        ) : (
          <div key={i} style={wrapStyle}>{imgContent}</div>
        );
      })}

      {/* Text content */}
      {(slide.title || slide.subtitle || slide.btn_text) && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          padding: "32px 48px", pointerEvents: "none",
          ...posStyle,
        }}>
          {slide.title && (
            <h2 style={{ fontSize: slide.title_size || "clamp(24px,4vw,56px)", fontWeight: 900, color: slide.text_color || "#fff", margin: 0, lineHeight: 1.1, marginBottom: slide.subtitle ? 12 : 0 }}>
              {slide.title}
            </h2>
          )}
          {slide.subtitle && (
            <p style={{ fontSize: slide.subtitle_size || "clamp(14px,2vw,22px)", color: slide.text_color || "#fff", margin: "0 0 20px", maxWidth: 600 }}>
              {slide.subtitle}
            </p>
          )}
          {slide.btn_text && slide.btn_url && (
            <a
              href={slide.btn_url}
              style={{
                pointerEvents: "auto", display: "inline-block", padding: "12px 28px",
                background: "#ff971c", color: "#fff", border: "2px solid #000", borderRadius: 8,
                fontWeight: 800, fontSize: 15, textDecoration: "none", boxShadow: "0 3px 0 2px #000",
                alignSelf: posStyle.justifyContent === "flex-start" ? "flex-start" : posStyle.justifyContent === "flex-end" ? "flex-end" : "center",
              }}
            >
              {slide.btn_text}
            </a>
          )}
        </div>
      )}

      {/* Dots */}
      {slides.length > 1 && (
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8, zIndex: 5 }}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => goTo(i)} style={{ width: i === current ? 24 : 10, height: 10, borderRadius: 5, border: "none", cursor: "pointer", background: i === current ? "#ff971c" : "rgba(255,255,255,0.6)", transition: "all .3s", padding: 0 }} />
          ))}
        </div>
      )}

      {/* Arrows */}
      {slides.length > 1 && (
        <>
          <button onClick={() => goTo((current - 1 + slides.length) % slides.length)} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.35)", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>‹</button>
          <button onClick={() => goTo((current + 1) % slides.length)} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.35)", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>›</button>
        </>
      )}
    </div>
  );
}

// ── Text Block ────────────────────────────────────────────────────────────────
function TextBlock({ container }) {
  const align = container.align || "center";
  return (
    <div style={{ background: container.bg_color || "#fff", padding: "48px 24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", textAlign: align }}>
        {container.title && <h2 style={{ fontSize: "clamp(20px,3vw,36px)", fontWeight: 800, color: container.text_color || "#111827", margin: "0 0 16px" }}>{container.title}</h2>}
        {container.body && (
          <div style={{ fontSize: 16, color: container.text_color || "#374151", lineHeight: 1.7, margin: "0 0 24px" }} dangerouslySetInnerHTML={{ __html: container.body }} />
        )}
        {container.btn_text && container.btn_url && (
          <a href={container.btn_url} style={{ display: "inline-block", padding: "12px 28px", background: "#ff971c", color: "#fff", border: "2px solid #000", borderRadius: 8, fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 3px 0 2px #000" }}>
            {container.btn_text}
          </a>
        )}
      </div>
    </div>
  );
}

// ── Image + Text ──────────────────────────────────────────────────────────────
function ImageText({ container }) {
  const imageLeft = container.image_side !== "right";
  const imgSrc = resolveUrl(container.image);
  return (
    <div style={{ background: container.bg_color || "#fff", padding: "48px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: imageLeft ? "row" : "row-reverse", gap: 40, alignItems: "center", flexWrap: "wrap" }}>
        {imgSrc && (
          <div style={{ flex: "0 0 auto", width: "min(45%, 480px)" }}>
            <img src={imgSrc} alt={container.title || ""} style={{ width: "100%", borderRadius: 12, display: "block", border: "2px solid #000", boxShadow: "0 4px 0 2px #000" }} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 240 }}>
          {container.title && <h2 style={{ fontSize: "clamp(20px,2.5vw,32px)", fontWeight: 800, color: container.text_color || "#111827", margin: "0 0 12px" }}>{container.title}</h2>}
          {container.body && (
            <div style={{ fontSize: 16, color: container.text_color || "#374151", lineHeight: 1.7, margin: "0 0 20px" }} dangerouslySetInnerHTML={{ __html: container.body }} />
          )}
          {container.btn_text && container.btn_url && (
            <a href={container.btn_url} style={{ display: "inline-block", padding: "10px 24px", background: "#ff971c", color: "#fff", border: "2px solid #000", borderRadius: 8, fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 3px 0 2px #000" }}>
              {container.btn_text}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Image Grid ────────────────────────────────────────────────────────────────
function ImageGrid({ container }) {
  const cols = container.cols || 2;
  const gap = container.gap || 16;
  const images = (container.images || []).filter((i) => i.url);
  if (!images.length) return null;
  return (
    <div style={{ padding: "32px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}>
        {images.map((img, i) => {
          const ratio = img.aspect_ratio || "1/1";
          const el = <img src={resolveUrl(img.url)} alt="" style={{ width: "100%", aspectRatio: ratio, objectFit: "cover", borderRadius: 10, display: "block", border: "1px solid #e5e7eb" }} />;
          return img.link ? <a key={i} href={img.link} style={{ display: "block" }}>{el}</a> : <div key={i}>{el}</div>;
        })}
      </div>
    </div>
  );
}

// ── Banner CTA ────────────────────────────────────────────────────────────────
function BannerCta({ container }) {
  const posStyle = getTextPositionStyle(container.text_position || "center");
  return (
    <div style={{ background: container.bg_color || "#ff971c", padding: "40px 48px", display: "flex", flexDirection: "column", ...posStyle }}>
      {container.title && <h2 style={{ fontSize: "clamp(20px,3vw,36px)", fontWeight: 900, color: container.text_color || "#fff", margin: "0 0 8px" }}>{container.title}</h2>}
      {container.subtitle && <p style={{ fontSize: 16, color: container.text_color || "#fff", margin: "0 0 20px", opacity: 0.9 }}>{container.subtitle}</p>}
      {container.btn_text && container.btn_url && (
        <a
          href={container.btn_url}
          style={{
            display: "inline-block", padding: "12px 28px", background: "#fff", color: "#111827",
            border: "2px solid #000", borderRadius: 8, fontWeight: 800, fontSize: 14,
            textDecoration: "none", boxShadow: "0 3px 0 2px #000",
            alignSelf: posStyle.justifyContent === "flex-start" ? "flex-start" : posStyle.justifyContent === "flex-end" ? "flex-end" : "center",
          }}
        >
          {container.btn_text}
        </a>
      )}
    </div>
  );
}

// ── Collection Carousel ───────────────────────────────────────────────────────
function CollectionCarousel({ container }) {
  const [products, setProducts] = useState([]);
  const itemsPerRow = container.items_per_row || 4;
  const itemWidth = `calc(${100 / itemsPerRow}% - 16px)`;

  useEffect(() => {
    if (!container.collection_id && !container.collection_handle) return;
    const param = container.collection_id
      ? `collection_id=${encodeURIComponent(container.collection_id)}`
      : `collection_handle=${encodeURIComponent(container.collection_handle)}`;
    fetch(`${BACKEND_URL}/store/products?${param}&limit=20`)
      .then((r) => r.json())
      .then((d) => setProducts(Array.isArray(d?.products) ? d.products : []))
      .catch(() => {});
  }, [container.collection_id, container.collection_handle]);

  if (!products.length) return null;

  return (
    <div style={{ padding: "32px 24px", background: "#fff" }}>
      {container.title && (
        <h2 style={{ fontSize: "clamp(18px,2.5vw,28px)", fontWeight: 800, color: "#111827", margin: "0 0 20px" }}>
          {container.title}
        </h2>
      )}
      <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 12, scrollbarWidth: "thin" }}>
        {products.map((p) => {
          const imgSrc = p.thumbnail || p.images?.[0]?.url || "";
          const price = p.variants?.[0]?.prices?.[0]?.amount;
          const priceStr = price != null ? `${(price / 100).toFixed(2).replace(".", ",")} €` : "";
          const handle = p.handle || p.id;
          return (
            <a key={p.id} href={`/produkt/${handle}`} style={{ display: "block", flexShrink: 0, width: itemWidth, minWidth: 140, textDecoration: "none", color: "inherit" }}>
              <div style={{ aspectRatio: "1", overflow: "hidden", borderRadius: 10, background: "#f4f4f2", marginBottom: 8, border: "1px solid #e5e7eb" }}>
                {imgSrc ? (
                  <img src={resolveUrl(imgSrc)} alt={p.title || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: 12 }}>No image</div>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {p.title}
              </div>
              {priceStr && <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{priceStr}</div>}
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── Renderer ──────────────────────────────────────────────────────────────────
function renderContainer(c) {
  if (!c.visible) return null;
  switch (c.type) {
    case "hero_banner":         return <HeroBanner key={c.id} container={c} />;
    case "text_block":          return <TextBlock key={c.id} container={c} />;
    case "image_text":          return <ImageText key={c.id} container={c} />;
    case "image_grid":          return <ImageGrid key={c.id} container={c} />;
    case "banner_cta":          return <BannerCta key={c.id} container={c} />;
    case "collection_carousel": return <CollectionCarousel key={c.id} container={c} />;
    default: return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function LandingContainers({ pageId }) {
  const [containers, setContainers] = useState(null);

  useEffect(() => {
    const endpoint = pageId
      ? `/store/landing-page/${encodeURIComponent(pageId)}`
      : "/store/landing-page";
    getMedusaClient().request(endpoint).then((data) => {
      if (Array.isArray(data?.containers)) setContainers(data.containers);
    }).catch(() => {});
  }, [pageId]);

  if (!containers || containers.length === 0) return null;

  return (
    <div>
      {containers.map((c) => renderContainer(c))}
    </div>
  );
}
