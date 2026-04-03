"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "@/i18n/navigation";
import { getMedusaClient } from "@/lib/medusa-client";
import Carousel from "@/components/Carousel";
import { ProductCard } from "@/components/ProductCard";

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
  return `${BACKEND_URL}/uploads/${url}`;
}

function parsePaddingParts(val) {
  const parts = (val || "0px").trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return [parts[0], parts[1], parts[2], parts[3]];
}

// Inner padding from container.padding only. External gaps between containers use margin on the wrapper.
function getContainerPadding(container, defaultPad) {
  const [t, r, b, l] = parsePaddingParts(container.padding || defaultPad || "0px");
  return { paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l };
}

/** Innere Zeile: volle Breite innerhalb des Container-Paddings oder zentriert mit max-width (pro Block typischer Fallback in px). */
function normalizeContentMaxWidth(val, fallbackPx) {
  const n = Number(fallbackPx);
  const fb = `${Number.isFinite(n) && n > 0 ? n : 1200}px`;
  if (val == null || val === "") return fb;
  const s = String(val).trim();
  if (/^\d+$/.test(s)) return `${s}px`;
  if (/^[\d.]+(px|%|rem|em|ch|vw)$/i.test(s)) return s;
  return fb;
}

function getContentInnerStyle(container, fallbackMaxPx) {
  if (container.content_layout === "full") {
    return {
      width: "100%",
      maxWidth: "none",
      boxSizing: "border-box",
      minWidth: 0,
      marginLeft: 0,
      marginRight: 0,
    };
  }
  const cap = normalizeContentMaxWidth(container.content_max_width, fallbackMaxPx);
  return {
    width: "100%",
    maxWidth: cap,
    boxSizing: "border-box",
    minWidth: 0,
    marginLeft: "auto",
    marginRight: "auto",
  };
}

function collectionHref(handle) {
  const value = String(handle || "").trim();
  return value ? `/kollektion/${value}` : "#";
}

function sanitizeBlogHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=/gi, " data-removed=");
}

function getPositionStyle(pos) {
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

// Resolve alignSelf for a button based on justifyContent
function btnAlignSelf(justifyContent) {
  if (justifyContent === "flex-start") return "flex-start";
  if (justifyContent === "flex-end") return "flex-end";
  return "center";
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
  const posStyle = getPositionStyle(slide.text_position || "center");
  const contentPad = slide.content_padding || "32px 48px";

  return (
    <div style={{ position: "relative", width: "100%", height, overflow: "hidden" }}>
      {/* Slides */}
      {slides.map((s, i) => {
        const imgEl = (
          <>
            <img src={resolveUrl(s.image)} alt={s.title || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </>
        );
        const wrapStyle = { position: "absolute", inset: 0, opacity: i === current ? 1 : 0, transition: "opacity 0.7s ease" };
        return s.btn_url ? (
          <a key={i} href={s.btn_url} style={{ ...wrapStyle, display: "block" }}>{imgEl}</a>
        ) : (
          <div key={i} style={wrapStyle}>{imgEl}</div>
        );
      })}

      {/* Text content */}
      {(slide.title || slide.subtitle || slide.btn_text) && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          padding: contentPad, pointerEvents: "none",
          ...posStyle,
        }}>
          {slide.title && (
            <h2 style={{
              fontSize: slide.title_size || "clamp(24px,4vw,56px)", fontWeight: 900,
              color: slide.text_color || "#fff", margin: 0, lineHeight: 1.1,
              marginBottom: slide.subtitle ? 12 : (slide.btn_text ? 20 : 0),
            }}>
              {slide.title}
            </h2>
          )}
          {slide.subtitle && (
            <p style={{
              fontSize: slide.subtitle_size || "clamp(14px,2vw,22px)",
              color: slide.subtitle_color || slide.text_color || "#fff",
              margin: slide.btn_text ? "0 0 20px" : 0, maxWidth: 600,
            }}>
              {slide.subtitle}
            </p>
          )}
          {slide.btn_text && (
            <a
              href={slide.btn_url || "#"}
              style={{
                pointerEvents: "auto", display: "inline-block",
                padding: slide.btn_padding || "12px 28px",
                background: slide.btn_bg || "#ff971c",
                color: slide.btn_color || "#fff",
                border: slide.btn_border || "2px solid #000",
                borderRadius: slide.btn_radius || 8,
                fontWeight: 800, fontSize: 15, textDecoration: "none",
                boxShadow: "0 3px 0 2px #000",
                alignSelf: btnAlignSelf(posStyle.justifyContent),
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
  const posStyle = getPositionStyle(container.text_position || `center-${align === "left" ? "left" : align === "right" ? "right" : "center"}`);
  return (
    <div style={{ background: container.bg_color || "#fff", ...getContainerPadding(container, "48px 24px") }}>
      <div style={{ ...getContentInnerStyle(container, 800), textAlign: align }}>
        {container.title && (
          <h2 style={{ fontSize: "clamp(20px,3vw,36px)", fontWeight: 800, color: container.text_color || "#111827", margin: "0 0 16px" }}>
            {container.title}
          </h2>
        )}
        {container.body && (
          <div style={{ fontSize: 16, color: container.text_color || "#374151", lineHeight: 1.7, margin: "0 0 24px" }} dangerouslySetInnerHTML={{ __html: container.body }} />
        )}
        {container.btn_text && container.btn_url && (
          <a
            href={container.btn_url}
            style={{
              display: "inline-block", padding: container.btn_padding || "12px 28px",
              background: container.btn_bg || "#ff971c",
              color: container.btn_color || "#fff",
              border: container.btn_border || "2px solid #000",
              borderRadius: container.btn_radius || 8,
              fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 3px 0 2px #000",
            }}
          >
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
  const textAlign = container.text_align || "left";
  return (
    <div style={{ background: container.bg_color || "#fff", ...getContainerPadding(container, "48px 24px") }}>
      <div style={{ ...getContentInnerStyle(container, 1100), display: "flex", flexDirection: imageLeft ? "row" : "row-reverse", gap: 40, alignItems: "center", flexWrap: "wrap" }}>
        {imgSrc && (
          <div style={{ flex: "0 0 auto", width: "min(45%, 480px)" }}>
            <img src={imgSrc} alt={container.title || ""} style={{ width: "100%", borderRadius: 12, display: "block", border: "2px solid #000", boxShadow: "0 4px 0 2px #000" }} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 240, textAlign }}>
          {container.title && (
            <h2 style={{ fontSize: "clamp(20px,2.5vw,32px)", fontWeight: 800, color: container.text_color || "#111827", margin: "0 0 12px" }}>
              {container.title}
            </h2>
          )}
          {container.body && (
            <div style={{ fontSize: 16, color: container.text_color || "#374151", lineHeight: 1.7, margin: "0 0 20px" }} dangerouslySetInnerHTML={{ __html: container.body }} />
          )}
          {container.btn_text && container.btn_url && (
            <a
              href={container.btn_url}
              style={{
                display: "inline-block", padding: container.btn_padding || "10px 24px",
                background: container.btn_bg || "#ff971c",
                color: container.btn_color || "#fff",
                border: container.btn_border || "2px solid #000",
                borderRadius: container.btn_radius || 8,
                fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 3px 0 2px #000",
              }}
            >
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
    <div style={{ ...getContainerPadding(container, "32px 24px"), background: "#fff" }}>
      <div style={{ ...getContentInnerStyle(container, 1100), display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}>
        {images.map((img, i) => {
          const ratio = img.aspect_ratio || "1/1";
          const imgEl = <img src={resolveUrl(img.url)} alt={img.title || ""} style={{ width: "100%", aspectRatio: ratio, objectFit: "cover", borderRadius: 10, display: "block", border: "1px solid #e5e7eb" }} />;
          const caption = (img.title || img.text) ? (
            <div style={{ paddingTop: 10 }}>
              {img.title && <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>{img.title}</div>}
              {img.text ? (
                <div
                  style={{ fontSize: 14, color: "#374151", marginTop: img.title ? 6 : 0, lineHeight: 1.7 }}
                  dangerouslySetInnerHTML={{ __html: img.text }}
                />
              ) : null}
            </div>
          ) : null;
          const inner = <>{imgEl}{caption}</>;
          return img.link
            ? <a key={i} href={img.link} style={{ display: "block", textDecoration: "none" }}>{inner}</a>
            : <div key={i}>{inner}</div>;
        })}
      </div>
    </div>
  );
}

// ── Banner CTA ────────────────────────────────────────────────────────────────
function BannerCta({ container }) {
  const posStyle = getPositionStyle(container.text_position || "center");
  const padRaw = getContainerPadding(container, "32px 48px 40px 48px");
  // Eski horizontal-only kayıtlar 0 üst/alt veriyordu; buton/gölge taşmasın diye minimum.
  const pad =
    padRaw.paddingTop === "0px" && padRaw.paddingBottom === "0px"
      ? { ...padRaw, paddingTop: "32px", paddingBottom: "40px" }
      : padRaw;
  return (
    <div
      style={{
        background: container.bg_color || "#ff971c",
        boxSizing: "border-box",
        width: "100%",
        minWidth: 0,
        ...pad,
        display: "flex",
        flexDirection: "column",
        ...posStyle,
      }}
    >
      <div style={getContentInnerStyle(container, 960)}>
        {container.title && (
          <h2 style={{ fontSize: "clamp(20px,3vw,36px)", fontWeight: 900, color: container.text_color || "#fff", margin: "0 0 8px", maxWidth: "100%" }}>
            {container.title}
          </h2>
        )}
        {container.subtitle && (
          <p style={{ fontSize: 16, color: container.subtitle_color || container.text_color || "#fff", margin: "0 0 20px", opacity: 0.9, maxWidth: "100%" }}>
            {container.subtitle}
          </p>
        )}
        {container.btn_text && container.btn_url && (
          <a
            href={container.btn_url}
            style={{
              display: "inline-block",
              maxWidth: "100%",
              boxSizing: "border-box",
              padding: container.btn_padding || "12px 28px",
              background: container.btn_bg || "#fff",
              color: container.btn_color || "#111827",
              border: container.btn_border || "2px solid #000",
              borderRadius: container.btn_radius || 8,
              fontWeight: 800,
              fontSize: 14,
              textDecoration: "none",
              boxShadow: "0 2px 0 1px rgba(0,0,0,0.35)",
              marginBottom: 4,
              alignSelf: btnAlignSelf(posStyle.justifyContent),
            }}
          >
            {container.btn_text}
          </a>
        )}
      </div>
    </div>
  );
}

// ── Collection Carousel ───────────────────────────────────────────────────────
function CollectionCarousel({ container }) {
  const [products, setProducts] = useState([]);
  const itemsPerRow = container.items_per_row || 4;

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
    <div style={{ ...getContainerPadding(container, "32px 24px"), background: "#fff" }}>
      <div style={getContentInnerStyle(container, 1280)}>
        <Carousel
          contained={false}
          title={container.title?.trim() ? container.title : undefined}
          visibleCount={itemsPerRow}
          navOnSides
          gap={16}
          ariaLabel={container.title?.trim() || "Collection carousel"}
        >
          {products.map((product, i) => (
            <ProductCard key={product.id || i} product={product} />
          ))}
        </Carousel>
      </div>
    </div>
  );
}

function CollectionsCarousel({ container }) {
  const collections = Array.isArray(container.collections) ? container.collections.filter(Boolean) : [];
  const itemsPerRow = container.items_per_row || 4;
  const ratio = container.card_aspect_ratio || "4/5";

  if (!collections.length) return null;

  return (
    <div style={{ ...getContainerPadding(container, "32px 24px"), background: "#fff" }}>
      <div style={getContentInnerStyle(container, 1280)}>
        <Carousel
          contained={false}
          title={container.title?.trim() ? container.title : undefined}
          visibleCount={itemsPerRow}
          navOnSides
          gap={16}
          ariaLabel={container.title?.trim() || "Collections carousel"}
        >
          {collections.map((collection, i) => {
          const href = collectionHref(collection.handle);
          const image = resolveUrl(collection.image);
          const card = (
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: ratio,
                borderRadius: 18,
                overflow: "hidden",
                background: "#f3f4f6",
                border: "1px solid #ececec",
              }}
            >
              {image ? (
                <img src={image} alt={collection.title || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
                  Keine Vorschau
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  inset: "auto 0 0 0",
                  padding: "16px 18px",
                  background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)",
                  color: "#fff",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
                  {collection.title || collection.handle || `Kollektion ${i + 1}`}
                </div>
              </div>
            </div>
          );

          return href === "#" ? (
            <div key={collection.id || i}>{card}</div>
          ) : (
            <a key={collection.id || i} href={href} style={{ display: "block", textDecoration: "none" }}>
              {card}
            </a>
          );
        })}
        </Carousel>
      </div>
    </div>
  );
}

// ── Single featured product ───────────────────────────────────────────────────
function SingleProduct({ container }) {
  const [product, setProduct] = useState(null);
  const idOrHandle = (container.product_handle || container.product_id || "").toString().trim();

  useEffect(() => {
    if (!idOrHandle) return;
    fetch(`${BACKEND_URL}/store/products/${encodeURIComponent(idOrHandle)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setProduct(d?.product || null))
      .catch(() => setProduct(null));
  }, [idOrHandle]);

  if (!idOrHandle || !product) return null;

  const wrapBg = container.bg_color || "#fff";
  const title = container.title;

  return (
    <div style={{ ...getContainerPadding(container, "48px 24px"), background: wrapBg }}>
      <div style={getContentInnerStyle(container, 420)}>
        {title ? (
          <h2 style={{
            fontSize: "clamp(20px,3vw,28px)",
            fontWeight: 800,
            color: container.text_color || "#111827",
            marginBottom: 20,
            textAlign: "center",
          }}>
            {title}
          </h2>
        ) : null}
        <ProductCard product={product} />
      </div>
    </div>
  );
}

// ── Featured blog posts (manual entries, carousel + expand) ──────────────────
function BlogCarousel({ container }) {
  const posts = Array.isArray(container.posts)
    ? container.posts.filter((p) => p && (p.title || p.image || p.excerpt || p.body))
    : [];
  const [openId, setOpenId] = useState(null);
  const itemsPerRow = container.items_per_row || 3;
  const gap = 16;

  if (!posts.length) return null;

  const bg = container.bg_color || "#fff";
  const textColor = container.text_color || "#111827";

  return (
    <div style={{ ...getContainerPadding(container, "40px 24px"), background: bg }}>
      <div style={getContentInnerStyle(container, 1280)}>
        <Carousel
          contained={false}
          title={container.title?.trim() ? container.title : undefined}
          visibleCount={Math.min(itemsPerRow, posts.length)}
          navOnSides
          gap={gap}
          fadeBgColor={bg}
          ariaLabel={container.title?.trim() || "Blog"}
        >
          {posts.map((post, i) => {
          const id = post.id || `post-${i}`;
          const img = resolveUrl(post.image);
          const open = openId === id;
          const href = (post.href || "").trim();
          const CardInner = (
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                overflow: "hidden",
                background: "#fafafa",
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {img ? (
                <div style={{ aspectRatio: "16/10", overflow: "hidden", background: "#eee" }}>
                  <img src={img} alt={post.title || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
              ) : null}
              <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: textColor, lineHeight: 1.25, marginBottom: 8 }}>
                  {post.title || `Post ${i + 1}`}
                </div>
                {post.excerpt ? (
                  <p style={{ margin: 0, fontSize: 14, color: "#4b5563", lineHeight: 1.5, flex: 1 }}>
                    {post.excerpt}
                  </p>
                ) : null}
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {post.body ? (
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : id)}
                      style={{
                        border: "none",
                        background: "#111827",
                        color: "#fff",
                        padding: "8px 14px",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {open ? "Schließen" : "Weiterlesen"}
                    </button>
                  ) : null}
                  {href ? (
                    href.startsWith("http") ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>
                        Zum Artikel →
                      </a>
                    ) : (
                      <Link href={`/${href.replace(/^\//, "")}`} style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>
                        Zum Artikel →
                      </Link>
                    )
                  ) : null}
                </div>
                {open && post.body ? (
                  <div
                    style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e5e7eb", fontSize: 14, color: "#374151", lineHeight: 1.6 }}
                    dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(post.body) }}
                  />
                ) : null}
              </div>
            </div>
          );
          return <div key={id} style={{ height: "100%" }}>{CardInner}</div>;
        })}
        </Carousel>
      </div>
    </div>
  );
}

// ── Newsletter (form POST to Mailchimp / Brevo / Klaviyo action URL) ─────────
function NewsletterSignup({ container }) {
  const action = (container.form_action || "").trim();
  const method = (container.form_method || "post").toLowerCase() === "get" ? "get" : "post";
  const emailName = (container.email_field_name || "EMAIL").trim() || "EMAIL";
  const hiddenFields = Array.isArray(container.hidden_fields) ? container.hidden_fields : [];
  const bg = container.bg_color || "#f3f4f6";
  const textColor = container.text_color || "#111827";
  const btnBg = container.btn_bg || "#111827";
  const btnColor = container.btn_color || "#fff";

  if (!action) return null;

  return (
    <div style={{ ...getContainerPadding(container, "48px 24px"), background: bg }}>
      <div style={{ ...getContentInnerStyle(container, 560), textAlign: "center" }}>
        {container.title ? (
          <h2 style={{ fontSize: "clamp(20px,3vw,28px)", fontWeight: 800, color: textColor, margin: "0 0 8px" }}>
            {container.title}
          </h2>
        ) : null}
        {container.subtitle ? (
          <p style={{ margin: "0 0 20px", fontSize: 15, color: "#4b5563", lineHeight: 1.5 }}>
            {container.subtitle}
          </p>
        ) : null}
        <form action={action} method={method} target="_blank" style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
          {hiddenFields.map((f, i) => (
            f && f.name ? <input key={i} type="hidden" name={String(f.name)} value={String(f.value ?? "")} /> : null
          ))}
          <input
            type="email"
            name={emailName}
            required
            placeholder={container.email_placeholder || "E-Mail"}
            autoComplete="email"
            style={{
              padding: "14px 16px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              fontSize: 16,
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "14px 20px",
              borderRadius: 10,
              border: "none",
              background: btnBg,
              color: btnColor,
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            {container.button_text || "Abonnieren"}
          </button>
        </form>
        {container.privacy_note ? (
          <p style={{ marginTop: 14, fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
            {container.privacy_note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── Accordion ─────────────────────────────────────────────────────────────────
function AccordionChevron({ color, open }) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{
        flexShrink: 0,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <path d="M6 9l6 6 6-6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Accordion({ container }) {
  const [openIdx, setOpenIdx] = useState(null);
  const items = container.items || [];
  const bg = container.bg_color || "#ffffff";
  const textColor = container.text_color || "#111827";
  const borderColor = container.border_color || "#e5e7eb";
  const iconColor = container.icon_color || "#64748b";

  return (
    <div style={{ background: bg, ...getContainerPadding(container, "48px 24px") }}>
      <div style={getContentInnerStyle(container, 720)}>
        {container.title && (
          <h2
            style={{
              fontSize: "clamp(22px, 3.2vw, 34px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: textColor,
              margin: "0 0 32px",
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            {container.title}
          </h2>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                style={{
                  borderRadius: 18,
                  border: `1px solid ${borderColor}`,
                  background: bg,
                  boxShadow: isOpen
                    ? "0 10px 40px -12px rgba(15, 23, 42, 0.12), 0 2px 8px -4px rgba(15, 23, 42, 0.06)"
                    : "0 1px 3px rgba(15, 23, 42, 0.05)",
                  overflow: "hidden",
                  transition: "box-shadow 0.3s ease, border-color 0.25s ease, background 0.25s ease",
                }}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 20,
                    padding: "20px 24px",
                    background: "transparent",
                    border: "none",
                    borderLeft: isOpen ? `4px solid ${iconColor}` : "4px solid transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    boxSizing: "border-box",
                  }}
                >
                  <span
                    style={{
                      fontSize: "1.0625rem",
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                      color: textColor,
                      flex: 1,
                      lineHeight: 1.35,
                    }}
                  >
                    {item.question}
                  </span>
                  <AccordionChevron color={iconColor} open={isOpen} />
                </button>
                <div
                  style={{
                    maxHeight: isOpen ? 3200 : 0,
                    opacity: isOpen ? 1 : 0,
                    transition: "max-height 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease",
                    overflow: "hidden",
                    pointerEvents: isOpen ? "auto" : "none",
                  }}
                >
                  <div
                    style={{
                      padding: "4px 24px 22px 28px",
                      color: textColor,
                      fontSize: "0.984rem",
                      lineHeight: 1.75,
                    }}
                    dangerouslySetInnerHTML={{ __html: item.answer || "" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function Tabs({ container }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const tabs = container.tabs || [];
  const bg = container.bg_color || "#ffffff";
  const textColor = container.text_color || "#111827";
  const activeColor = container.active_color || "#ff971c";
  const tabBg = container.tab_bg || "#f1f5f9";
  const style = container.tab_style || "underline";

  const tabStyle = (idx) => {
    const isActive = idx === activeIdx;
    const baseTransition =
      "color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease, border-color 0.25s ease";

    if (style === "pills") {
      return {
        padding: "11px 22px",
        borderRadius: 9999,
        border: "none",
        cursor: "pointer",
        fontSize: "0.9375rem",
        fontWeight: 600,
        letterSpacing: "-0.02em",
        background: isActive ? activeColor : "transparent",
        color: isActive ? "#fff" : textColor,
        transition: baseTransition,
        boxShadow: isActive
          ? `0 4px 14px -4px ${activeColor}99, 0 2px 6px -2px rgba(15, 23, 42, 0.08)`
          : "none",
        transform: isActive ? "translateY(-1px)" : "none",
      };
    }
    if (style === "boxes") {
      return {
        padding: "12px 20px",
        border: `1.5px solid ${isActive ? activeColor : "rgba(148, 163, 184, 0.35)"}`,
        cursor: "pointer",
        fontSize: "0.9375rem",
        fontWeight: 600,
        letterSpacing: "-0.02em",
        background: isActive ? `${activeColor}12` : "rgba(255,255,255,0.55)",
        color: isActive ? activeColor : textColor,
        borderRadius: 12,
        transition: baseTransition,
        boxShadow: isActive ? `0 0 0 1px ${activeColor}22 inset` : "none",
      };
    }
    return {
      padding: "14px 20px",
      marginBottom: -2,
      border: "none",
      borderBottom: `3px solid ${isActive ? activeColor : "transparent"}`,
      cursor: "pointer",
      fontSize: "0.9375rem",
      fontWeight: isActive ? 600 : 500,
      letterSpacing: "-0.02em",
      background: "transparent",
      color: isActive ? activeColor : textColor,
      opacity: isActive ? 1 : 0.78,
      transition: baseTransition,
      borderRadius: "10px 10px 0 0",
    };
  };

  const activeTab = tabs[activeIdx] || tabs[0];

  const barWrap = (() => {
    if (style === "underline") {
      return {
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        borderBottom: "2px solid rgba(148, 163, 184, 0.35)",
        marginBottom: 0,
        paddingBottom: 0,
      };
    }
    if (style === "pills") {
      return {
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: 6,
        borderRadius: 9999,
        background: tabBg,
        boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.06)",
        marginBottom: 0,
        width: "fit-content",
        maxWidth: "100%",
      };
    }
    return {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      padding: 4,
      borderRadius: 16,
      background: tabBg,
      marginBottom: 0,
      border: "1px solid rgba(148, 163, 184, 0.25)",
      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
      width: "fit-content",
      maxWidth: "100%",
    };
  })();

  return (
    <div style={{ background: bg, ...getContainerPadding(container, "48px 24px") }}>
      <div style={getContentInnerStyle(container, 880)}>
        <div
          style={{
            marginBottom: 22,
            ...(style === "underline" ? {} : { display: "flex", justifyContent: "flex-start", flexWrap: "wrap", gap: 12 }),
          }}
        >
          <div role="tablist" aria-label="Inhalt" style={barWrap}>
            {tabs.map((tab, idx) => (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={idx === activeIdx}
                style={tabStyle(idx)}
                onClick={() => setActiveIdx(idx)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {activeTab && (
          <div
            role="tabpanel"
            style={{
              color: textColor,
              fontSize: "0.984rem",
              lineHeight: 1.78,
              padding: "28px 32px",
              borderRadius: 20,
              background: `linear-gradient(165deg, ${tabBg} 0%, ${bg} 72%)`,
              border: "1px solid rgba(148, 163, 184, 0.28)",
              boxShadow: "0 4px 28px -8px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(15, 23, 42, 0.05)",
              minHeight: 48,
            }}
            dangerouslySetInnerHTML={{ __html: activeTab.content || "" }}
          />
        )}
      </div>
    </div>
  );
}

// ── Renderer ──────────────────────────────────────────────────────────────────
function renderContainer(c) {
  if (!c.visible) return null;
  let inner = null;
  switch (c.type) {
    case "hero_banner":          inner = <HeroBanner container={c} />; break;
    case "text_block":           inner = <TextBlock container={c} />; break;
    case "image_text":           inner = <ImageText container={c} />; break;
    case "image_grid":           inner = <ImageGrid container={c} />; break;
    case "banner_cta":           inner = <BannerCta container={c} />; break;
    case "collection_carousel":  inner = <CollectionCarousel container={c} />; break;
    case "collections_carousel": inner = <CollectionsCarousel container={c} />; break;
    case "accordion":            inner = <Accordion container={c} />; break;
    case "tabs":                 inner = <Tabs container={c} />; break;
    case "single_product":       inner = <SingleProduct container={c} />; break;
    case "blog_carousel":        inner = <BlogCarousel container={c} />; break;
    case "newsletter":           inner = <NewsletterSignup container={c} />; break;
    default: return null;
  }
  const m = c.margin || {};
  const marginStyle = {
    ...(m.top    ? { marginTop:    m.top }    : {}),
    ...(m.bottom ? { marginBottom: m.bottom } : {}),
    ...(m.left   ? { marginLeft:   m.left }   : {}),
    ...(m.right  ? { marginRight:  m.right }  : {}),
  };
  const hasMargin = Object.keys(marginStyle).length > 0;
  return <div key={c.id} style={hasMargin ? marginStyle : undefined}>{inner}</div>;
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
