"use client";

/**
 * Tiny CSS wireframe thumbnails for landing container types —
 * shows approximate shop layout without screenshots.
 */

const FRAME = {
  width: 112,
  height: 72,
  borderRadius: 6,
  background: "#f6f6f7",
  border: "1px solid #e1e3e5",
  overflow: "hidden",
  position: "relative",
  flexShrink: 0,
};

const bar = (extra = {}) => ({
  background: "#c9cccf",
  borderRadius: 2,
  ...extra,
});

const block = (extra = {}) => ({
  background: "#dfe3e8",
  borderRadius: 3,
  ...extra,
});

const ink = (extra = {}) => ({
  background: "#8c9196",
  borderRadius: 2,
  ...extra,
});

function PreviewShell({ children, title }) {
  return (
    <div style={FRAME} title={title} aria-hidden>
      {children}
    </div>
  );
}

/** Wireframe by container type */
export function ContainerTypePreview({ type, label }) {
  switch (type) {
    case "hero_banner":
      return (
        <PreviewShell title={label}>
          <div style={{ ...block({ position: "absolute", inset: 4 }), background: "linear-gradient(135deg,#b8c4ce,#8a9bab)" }} />
          <div style={{ position: "absolute", left: "50%", top: "42%", transform: "translate(-50%,-50%)", width: 48, ...bar({ height: 5, background: "#fff" }) }} />
          <div style={{ position: "absolute", left: "50%", top: "58%", transform: "translate(-50%,-50%)", width: 28, height: 8, borderRadius: 3, background: "#202223" }} />
        </PreviewShell>
      );
    case "text_block":
      return (
        <PreviewShell title={label}>
          <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={bar({ width: "70%", height: 6 })} />
            <div style={ink({ width: "95%", height: 3 })} />
            <div style={ink({ width: "88%", height: 3 })} />
            <div style={ink({ width: "60%", height: 3 })} />
            <div style={{ width: 36, height: 8, borderRadius: 3, background: "#202223", marginTop: 4 }} />
          </div>
        </PreviewShell>
      );
    case "image_text":
      return (
        <PreviewShell title={label}>
          <div style={{ display: "flex", height: "100%", gap: 4, padding: 6 }}>
            <div style={{ ...block({ flex: 1, height: "100%" }), background: "#aeb6bf" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
              <div style={bar({ width: "90%", height: 5 })} />
              <div style={ink({ width: "100%", height: 2 })} />
              <div style={ink({ width: "80%", height: 2 })} />
              <div style={{ width: 28, height: 7, borderRadius: 2, background: "#202223", marginTop: 2 }} />
            </div>
          </div>
        </PreviewShell>
      );
    case "image_grid":
      return (
        <PreviewShell title={label}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, padding: 6, height: "100%", boxSizing: "border-box" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ ...block({ minHeight: 0 }), background: i % 2 ? "#b5bec8" : "#9aa3ad" }} />
            ))}
          </div>
        </PreviewShell>
      );
    case "content_mosaic":
      return (
        <PreviewShell title={label}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gridTemplateRows: "1fr 1fr", gap: 3, padding: 6, height: "100%", boxSizing: "border-box" }}>
            <div style={{ ...block({ gridRow: "1 / 3" }), background: "#9aa3ad" }} />
            <div style={{ ...block({}), background: "#c5ccd4" }} />
            <div style={{ ...block({}), background: "#b5bec8" }} />
          </div>
        </PreviewShell>
      );
    case "image_carousel":
    case "collection_carousel":
    case "bestseller_carousel":
    case "seller_carousel":
    case "collections_carousel":
    case "blog_carousel":
    case "personalized_product_row":
      return (
        <PreviewShell title={label}>
          <div style={{ padding: "8px 6px", display: "flex", flexDirection: "column", gap: 4, height: "100%", boxSizing: "border-box" }}>
            <div style={bar({ width: "45%", height: 4 })} />
            <div style={{ display: "flex", gap: 4, flex: 1 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ flex: 1, ...block({}), background: i === 1 ? "#8c969f" : "#c5ccd4", display: "flex", flexDirection: "column", padding: 3, gap: 2 }}>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.35)", borderRadius: 2 }} />
                  <div style={{ height: 2, width: "70%", background: "rgba(32,34,35,0.35)", borderRadius: 1 }} />
                </div>
              ))}
            </div>
          </div>
        </PreviewShell>
      );
    case "video_block":
      return (
        <PreviewShell title={label}>
          <div style={{ ...block({ position: "absolute", inset: 6 }), background: "#6d7175", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              width: 0, height: 0,
              borderTop: "7px solid transparent",
              borderBottom: "7px solid transparent",
              borderLeft: "12px solid #fff",
              marginLeft: 2,
            }} />
          </div>
        </PreviewShell>
      );
    case "banner_cta":
      return (
        <PreviewShell title={label}>
          <div style={{ position: "absolute", inset: 8, borderRadius: 4, background: "#202223", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <div style={{ width: 50, height: 4, background: "#fff", borderRadius: 2 }} />
            <div style={{ width: 32, height: 8, borderRadius: 3, background: "#fff" }} />
          </div>
        </PreviewShell>
      );
    case "category_sidebar":
      return (
        <PreviewShell title={label}>
          <div style={{ display: "flex", height: "100%", padding: 5, gap: 4 }}>
            <div style={{ width: 28, ...block({ height: "100%" }), display: "flex", flexDirection: "column", gap: 3, padding: 4 }}>
              {[0, 1, 2, 3].map((i) => <div key={i} style={ink({ height: 3, width: "100%" })} />)}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={bar({ height: 4, width: "50%" })} />
              <div style={{ display: "flex", gap: 3, flex: 1 }}>
                <div style={{ flex: 1, ...block({}) }} />
                <div style={{ flex: 1, ...block({}) }} />
              </div>
            </div>
          </div>
        </PreviewShell>
      );
    case "accordion":
    case "support_faq":
      return (
        <PreviewShell title={label}>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ ...block({ height: i === 0 ? 22 : 12, padding: "3px 5px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }) }}>
                <div style={bar({ width: "55%", height: 3, background: "#8c9196" })} />
                <div style={{ fontSize: 8, lineHeight: 1, color: "#6d7175" }}>{i === 0 ? "▾" : "▸"}</div>
              </div>
            ))}
          </div>
        </PreviewShell>
      );
    case "tabs":
      return (
        <PreviewShell title={label}>
          <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 4, height: "100%", boxSizing: "border-box" }}>
            <div style={{ display: "flex", gap: 3 }}>
              <div style={{ ...bar({ height: 8, width: 28, background: "#202223" }) }} />
              <div style={{ ...bar({ height: 8, width: 24 }) }} />
              <div style={{ ...bar({ height: 8, width: 22 }) }} />
            </div>
            <div style={{ flex: 1, ...block({}), padding: 6 }}>
              <div style={ink({ width: "80%", height: 3, marginBottom: 3 })} />
              <div style={ink({ width: "65%", height: 3 })} />
            </div>
          </div>
        </PreviewShell>
      );
    case "single_product":
      return (
        <PreviewShell title={label}>
          <div style={{ display: "flex", height: "100%", padding: 6, gap: 5 }}>
            <div style={{ width: 40, ...block({ height: "100%" }), background: "#aeb6bf" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" }}>
              <div style={bar({ width: "85%", height: 4 })} />
              <div style={ink({ width: "50%", height: 3 })} />
              <div style={{ width: 30, height: 8, borderRadius: 2, background: "#202223", marginTop: 2 }} />
            </div>
          </div>
        </PreviewShell>
      );
    case "newsletter":
      return (
        <PreviewShell title={label}>
          <div style={{ padding: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, height: "100%", boxSizing: "border-box" }}>
            <div style={bar({ width: "60%", height: 5 })} />
            <div style={{ display: "flex", gap: 3, width: "90%" }}>
              <div style={{ flex: 1, height: 10, borderRadius: 2, border: "1px solid #c9cccf", background: "#fff" }} />
              <div style={{ width: 22, height: 10, borderRadius: 2, background: "#202223" }} />
            </div>
          </div>
        </PreviewShell>
      );
    case "feature_grid":
    case "support_topic_grid":
      return (
        <PreviewShell title={label}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, padding: 6, height: "100%", boxSizing: "border-box" }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ ...block({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: 2 }) }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#8c9196" }} />
                <div style={ink({ width: "70%", height: 2 })} />
              </div>
            ))}
          </div>
        </PreviewShell>
      );
    case "testimonials":
      return (
        <PreviewShell title={label}>
          <div style={{ display: "flex", gap: 4, padding: 6, height: "100%", boxSizing: "border-box" }}>
            {[0, 1].map((i) => (
              <div key={i} style={{ flex: 1, ...block({ padding: 5, display: "flex", flexDirection: "column", gap: 3 }) }}>
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#8c9196" }} />
                  <div style={bar({ width: 20, height: 3 })} />
                </div>
                <div style={ink({ width: "100%", height: 2 })} />
                <div style={ink({ width: "80%", height: 2 })} />
                <div style={{ fontSize: 7, color: "#8c9196", letterSpacing: 0.5 }}>★★★★★</div>
              </div>
            ))}
          </div>
        </PreviewShell>
      );
    case "support_hero":
      return (
        <PreviewShell title={label}>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4, height: "100%", boxSizing: "border-box" }}>
            <div style={bar({ width: "55%", height: 5 })} />
            <div style={{ height: 12, borderRadius: 3, border: "#fff", border: "1px solid #c9cccf" }} />
            <div style={{ display: "flex", gap: 3 }}>
              <div style={{ width: 36, height: 8, borderRadius: 2, background: "#202223" }} />
              <div style={{ width: 36, height: 8, borderRadius: 2, border: "1px solid #c9cccf" }} />
            </div>
          </div>
        </PreviewShell>
      );
    case "support_case_wizard":
      return (
        <PreviewShell title={label}>
          <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 3, height: "100%", boxSizing: "border-box" }}>
            <div style={bar({ width: "40%", height: 4 })} />
            <div style={{ display: "flex", gap: 3, flex: 1 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ flex: 1, ...block({}), border: i === 0 ? "1px solid #202223" : "1px solid transparent" }} />
              ))}
            </div>
            <div style={{ alignSelf: "flex-end", width: 28, height: 8, borderRadius: 2, background: "#202223" }} />
          </div>
        </PreviewShell>
      );
    default:
      return (
        <PreviewShell title={label}>
          <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={bar({ width: "50%", height: 5 })} />
            <div style={block({ height: 36 })} />
          </div>
        </PreviewShell>
      );
  }
}

/** Re-export catalog helpers for convenience */
export { CONTAINER_TYPE_GROUP, groupLabel, groupContainerTypes, CONTAINER_GROUPS } from "@/lib/landing-container-catalog";
