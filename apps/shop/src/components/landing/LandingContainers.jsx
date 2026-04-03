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

function marginValueMeaningful(v) {
  if (v === undefined || v === null) return false;
  return String(v).trim() !== "";
}

// Returns padding style for a container.
// If container.margin has a non-empty top or bottom, inner vertical padding is cleared
// so margin is the only vertical inset (avoids fighting horizontal-only padding editor).
function getContainerPadding(container, defaultPad) {
  const [t, r, b, l] = parsePaddingParts(container.padding || defaultPad || "0px");
  const m = container.margin;
  const hasVerticalMargin =
    m != null && (marginValueMeaningful(m.top) || marginValueMeaningful(m.bottom));
  if (hasVerticalMargin) return { paddingTop: "0px", paddingRight: r, paddingBottom: "0px", paddingLeft: l };
  return { paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l };
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
      <div style={{ maxWidth: 800, margin: "0 auto", textAlign: align }}>
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
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: imageLeft ? "row" : "row-reverse", gap: 40, alignItems: "center", flexWrap: "wrap" }}>
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
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}>
        {images.map((img, i) => {
          const ratio = img.aspect_ratio || "1/1";
          const imgEl = <img src={resolveUrl(img.url)} alt={img.title || ""} style={{ width: "100%", aspectRatio: ratio, objectFit: "cover", borderRadius: 10, display: "block", border: "1px solid #e5e7eb" }} />;
          const caption = (img.title || img.text) ? (
            <div style={{ paddingTop: 10 }}>
              {img.title && <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>{img.title}</div>}
              {img.text && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4, lineHeight: 1.5 }}>{img.text}</div>}
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
  return (
    <div style={{ background: container.bg_color || "#ff971c", ...getContainerPadding(container, "40px 48px"), display: "flex", flexDirection: "column", ...posStyle }}>
      {container.title && (
        <h2 style={{ fontSize: "clamp(20px,3vw,36px)", fontWeight: 900, color: container.text_color || "#fff", margin: "0 0 8px" }}>
          {container.title}
        </h2>
      )}
      {container.subtitle && (
        <p style={{ fontSize: 16, color: container.subtitle_color || container.text_color || "#fff", margin: "0 0 20px", opacity: 0.9 }}>
          {container.subtitle}
        </p>
      )}
      {container.btn_text && container.btn_url && (
        <a
          href={container.btn_url}
          style={{
            display: "inline-block", padding: container.btn_padding || "12px 28px",
            background: container.btn_bg || "#fff",
            color: container.btn_color || "#111827",
            border: container.btn_border || "2px solid #000",
            borderRadius: container.btn_radius || 8,
            fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 3px 0 2px #000",
            alignSelf: btnAlignSelf(posStyle.justifyContent),
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
  );
}

function CollectionsCarousel({ container }) {
  const collections = Array.isArray(container.collections) ? container.collections.filter(Boolean) : [];
  const itemsPerRow = container.items_per_row || 4;
  const ratio = container.card_aspect_ratio || "4/5";

  if (!collections.length) return null;

  return (
    <div style={{ ...getContainerPadding(container, "32px 24px"), background: "#fff" }}>
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
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
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
  const posts = Array.isArray(container.posts) ? container.posts.filter((p) => p && (p.title || p.image || p.excerpt)) : [];
  const [openId, setOpenId] = useState(null);
  const itemsPerRow = container.items_per_row || 3;
  const gap = 16;

  if (!posts.length) return null;

  const bg = container.bg_color || "#fff";
  const textColor = container.text_color || "#111827";

  return (
    <div style={{ ...getContainerPadding(container, "40px 24px"), background: bg }}>
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
                  <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
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
function Accordion({ container }) {
  const [openIdx, setOpenIdx] = useState(null);
  const items = container.items || [];
  const bg = container.bg_color || "#ffffff";
  const textColor = container.text_color || "#111827";
  const borderColor = container.border_color || "#e5e7eb";
  const iconColor = container.icon_color || "#111827";

  return (
    <div style={{ background: bg, ...getContainerPadding(container, "48px 24px") }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {container.title && (
          <h2 style={{ fontSize: "clamp(20px,3vw,32px)", fontWeight: 700, color: textColor, marginBottom: 28, textAlign: "center" }}>
            {container.title}
          </h2>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${borderColor}`, borderRadius: 10, overflow: "hidden" }}>
          {items.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div key={idx} style={{ borderBottom: idx < items.length - 1 ? `1px solid ${borderColor}` : "none" }}>
                <button
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "18px 22px", background: isOpen ? `${bg}ee` : bg,
                    border: "none", cursor: "pointer", textAlign: "left", gap: 16,
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 600, color: textColor, flex: 1 }}>{item.question}</span>
                  <span style={{ fontSize: 22, fontWeight: 300, color: iconColor, lineHeight: 1, flexShrink: 0, transform: isOpen ? "rotate(45deg)" : "none", transition: "transform 0.2s" }}>+</span>
                </button>
                {isOpen && (
                  <div
                    style={{ padding: "0 22px 20px", color: textColor, fontSize: 15, lineHeight: 1.7 }}
                    dangerouslySetInnerHTML={{ __html: item.answer || "" }}
                  />
                )}
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
  const tabBg = container.tab_bg || "#f3f4f6";
  const style = container.tab_style || "underline";

  const tabStyle = (idx) => {
    const isActive = idx === activeIdx;
    if (style === "pills") return {
      padding: "8px 20px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
      background: isActive ? activeColor : tabBg,
      color: isActive ? "#fff" : textColor,
      transition: "background 0.2s",
    };
    if (style === "boxes") return {
      padding: "10px 22px", border: `2px solid ${isActive ? activeColor : "transparent"}`, cursor: "pointer", fontSize: 14, fontWeight: 600,
      background: isActive ? `${activeColor}15` : tabBg,
      color: isActive ? activeColor : textColor,
      borderRadius: 6,
    };
    // underline (default)
    return {
      padding: "12px 22px", border: "none", borderBottom: `3px solid ${isActive ? activeColor : "transparent"}`,
      cursor: "pointer", fontSize: 14, fontWeight: 600, background: "transparent",
      color: isActive ? activeColor : textColor, transition: "border-color 0.2s, color 0.2s",
    };
  };

  const activeTab = tabs[activeIdx] || tabs[0];

  return (
    <div style={{ background: bg, ...getContainerPadding(container, "48px 24px") }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Tab bar */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: style === "pills" ? 8 : 0,
          borderBottom: style === "underline" ? `1px solid #e5e7eb` : "none",
          background: style === "underline" ? "transparent" : tabBg,
          borderRadius: style !== "underline" ? 8 : 0,
          padding: style !== "underline" ? 6 : 0,
          marginBottom: 24,
        }}>
          {tabs.map((tab, idx) => (
            <button key={idx} style={tabStyle(idx)} onClick={() => setActiveIdx(idx)}>
              {tab.label}
            </button>
          ))}
        </div>
        {/* Active content */}
        {activeTab && (
          <div
            style={{ color: textColor, fontSize: 15, lineHeight: 1.75 }}
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
