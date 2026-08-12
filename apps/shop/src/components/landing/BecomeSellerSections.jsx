"use client";

import { useState } from "react";
import styles from "./BecomeSellerLanding.module.css";
import {
  assetField,
  fontFamilyStack,
  inferFeatureGridVariant,
  itemBody,
  ltField,
  parseStepsHtml,
  resolveUrl,
  slideOverlayOpacity,
} from "./become-seller-utils";

function Reveal({ className = "", children }) {
  return <div className={`${className} ${styles.reveal}`.trim()}>{children}</div>;
}

function Accordion({ items, dark, btnColor, panelColor }) {
  const [open, setOpen] = useState(0);
  if (!items?.length) return null;
  return (
    <div className={styles.accList}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={`${styles.accItem}${isOpen ? ` ${styles.open}` : ""}`}>
            <button
              type="button"
              className={styles.accBtn}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? -1 : i)}
              style={btnColor ? { color: btnColor } : (dark ? { color: "#f4f1ea" } : undefined)}
            >
              <span>{item.q}</span>
              <span className={styles.accIcon} aria-hidden>+</span>
            </button>
            <div className={styles.accPanel}>
              <div className={styles.accPanelInner}>
                <p style={panelColor ? { color: panelColor } : undefined}>{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BsButton({ btn, locale }) {
  const text = ltField(btn, "text", locale) || btn.text || "";
  const url = ltField(btn, "url", locale) || btn.url || "#";
  if (!text) return null;

  const variant = btn.variant || "seller_brass";
  const baseClass = variant === "ghost" || variant === "outline" ? styles.btnGhost : styles.btnPrimary;

  const custom =
    variant === "custom" || variant === "andertal_orange"
      ? {
          background: btn.bg || (variant === "andertal_orange" ? "#ff971c" : undefined),
          color: btn.color || (variant === "andertal_orange" ? "#fff" : undefined),
          border: btn.border || (variant === "andertal_orange" ? "2px solid #000" : undefined),
          borderRadius: btn.radius != null ? `${btn.radius}px` : variant === "andertal_orange" ? 8 : undefined,
          boxShadow: variant === "andertal_orange" ? "0 3px 0 2px #000" : undefined,
        }
      : {};

  const hoverBg = btn.hover_bg;
  const hoverColor = btn.hover_color;
  const baseBg = custom.background;
  const baseColor = custom.color;

  return (
    <a
      href={url}
      className={variant === "custom" || variant === "andertal_orange" ? styles.btnPrimary : baseClass}
      style={Object.keys(custom).length ? custom : undefined}
      onMouseEnter={(e) => {
        if (hoverBg) e.currentTarget.style.background = hoverBg;
        if (hoverColor) e.currentTarget.style.color = hoverColor;
      }}
      onMouseLeave={(e) => {
        if (hoverBg && baseBg) e.currentTarget.style.background = baseBg;
        if (hoverColor && baseColor) e.currentTarget.style.color = baseColor;
      }}
    >
      {text}
    </a>
  );
}

function btnFromSlide(slide, locale, secondary = false) {
  const prefix = secondary ? "btn2" : "btn";
  return {
    text: ltField(slide, `${prefix}_text`, locale) || slide[`${prefix}_text`],
    url: ltField(slide, `${prefix}_url`, locale) || slide[`${prefix}_url`],
    variant: slide[`${prefix}_variant`] || slide.btn_variant || (secondary ? "ghost" : "seller_brass"),
    bg: slide[`${prefix}_bg`] || slide.btn_bg,
    color: slide[`${prefix}_color`] || slide.btn_color,
    border: slide[`${prefix}_border`] || slide.btn_border,
    radius: slide[`${prefix}_radius`] ?? slide.btn_radius,
    hover_bg: slide[`${prefix}_hover_bg`] || slide.btn_hover_bg,
    hover_color: slide[`${prefix}_hover_color`] || slide.btn_hover_color,
  };
}

export function BsHeroSection({ container, locale }) {
  const slide = Array.isArray(container.slides) && container.slides[0] ? container.slides[0] : container;
  const img =
    assetField(slide, "image", locale) ||
    assetField(slide, "image_url", locale) ||
    assetField(container, "image", locale);
  const overlay = slideOverlayOpacity(slide);
  const height = container.height || "min(100svh, 820px)";
  const mobileHeight = container.mobile_height || "70vh";
  const brand = ltField(container, "brand_mark", locale) || container.brand_mark || ltField(slide, "brand_mark", locale);
  const title = ltField(slide, "title", locale);
  const lead = ltField(slide, "subtitle", locale);
  const titleColor = slide.title_color || slide.text_color || "#f7f4ee";
  const leadColor = slide.subtitle_color || slide.text_color || "rgba(247, 244, 238, 0.82)";

  return (
    <section
      className={styles.hero}
      style={{ ["--hero-min-height"]: height, ["--hero-min-height-mobile"]: mobileHeight }}
      aria-label={brand || title || "Hero"}
    >
      <div className={styles.heroMedia} aria-hidden>
        {img ? <img src={resolveUrl(img)} alt="" /> : null}
      </div>
      {overlay > 0 && (
        <div
          aria-hidden
          style={{ position: "absolute", inset: 0, zIndex: 1, background: `rgba(0,0,0,${overlay})`, pointerEvents: "none" }}
        />
      )}
      <div className={styles.heroShade} />
      <div className={styles.heroGrain} />
      <div className={styles.heroInner}>
        {brand ? <p className={styles.brandMark} style={{ fontFamily: fontFamilyStack(slide.brand_font || "serif") }}>{brand}</p> : null}
        {title ? (
          <h1
            className={styles.heroTitle}
            style={{
              color: titleColor,
              fontSize: slide.title_size || undefined,
              fontFamily: fontFamilyStack(slide.title_font || "serif"),
            }}
          >
            {title}
          </h1>
        ) : null}
        {lead ? (
          <p
            className={styles.heroLead}
            style={{
              color: leadColor,
              fontSize: slide.subtitle_size || undefined,
              fontFamily: fontFamilyStack(slide.subtitle_font || "sans"),
            }}
          >
            {lead}
          </p>
        ) : null}
        <div className={styles.ctaRow}>
          <BsButton btn={btnFromSlide(slide, locale, false)} locale={locale} />
          <BsButton btn={btnFromSlide(slide, locale, true)} locale={locale} />
        </div>
      </div>
    </section>
  );
}

export function BsStatsSection({ container, locale }) {
  const title = ltField(container, "title", locale);
  const subtitle = ltField(container, "subtitle", locale);
  const items = (container.items || []).map((it) => ({
    n: ltField(it, "title", locale) || it.icon || "",
    l: itemBody(it, locale),
  })).filter((s) => s.n || s.l);

  return (
    <section className={styles.stats} aria-label={title || "Highlights"}>
      {(title || subtitle) && (
        <div className={styles.inner} style={{ paddingBottom: "1.5rem", textAlign: container.title_align || "center" }}>
          {title ? <p className={styles.eyebrow} style={{ color: "#f4f1ea" }}>{title}</p> : null}
          {subtitle ? <p style={{ margin: 0, color: "rgba(244,241,234,0.75)", fontSize: "1rem" }}>{subtitle}</p> : null}
        </div>
      )}
      <div className={`${styles.statsGrid} ${styles.reveal}`}>
        {items.map((s, i) => (
          <div key={`${s.n}-${i}`} className={styles.statItem}>
            <strong>{s.n}</strong>
            <span>{s.l}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BsFeaturesSection({ container, locale }) {
  const eyebrow = ltField(container, "eyebrow", locale) || ltField(container, "title", locale);
  const heading = ltField(container, "subtitle", locale) || ltField(container, "heading", locale);
  const lead = ltField(container, "lead", locale) || ltField(container, "body", locale);
  const items = (container.items || []).map((it, i) => ({
    icon: String(it.icon || i + 1),
    t: ltField(it, "title", locale),
    d: itemBody(it, locale),
  })).filter((f) => f.t);

  return (
    <section className={`${styles.section} ${styles.features}`}>
      <Reveal className={styles.inner}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {heading ? <h2 className={styles.h2}>{heading}</h2> : null}
        {lead ? <p className={styles.lead}>{lead}</p> : null}
        <div className={styles.featGrid}>
          {items.map((f) => (
            <article key={f.t} className={styles.featCard}>
              <div className={styles.featIcon}>{f.icon}</div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </article>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

export function BsReachSection({ container, locale }) {
  const eyebrow = ltField(container, "eyebrow", locale);
  const title = ltField(container, "title", locale);
  const lead = ltField(container, "body", locale) || ltField(container, "subtitle", locale);
  const img = assetField(container, "image", locale) || assetField(container, "image_url", locale);
  const eyebrowColor = container.eyebrow_color || container.text_color || "#b08d3a";
  const titleColor = container.title_color || container.text_color || "#0d1f1a";
  const leadColor = container.subtitle_color || container.text_color || "#5a6b63";
  const titleFont = container.title_font;
  const leadFont = container.subtitle_font;
  const btn = {
    text: ltField(container, "btn_text", locale),
    url: ltField(container, "btn_url", locale) || container.btn_url,
    variant: container.btn_variant || "seller_brass",
    bg: container.btn_bg,
    color: container.btn_color,
    border: container.btn_border,
    radius: container.btn_radius,
    hover_bg: container.btn_hover_bg,
    hover_color: container.btn_hover_color,
  };

  return (
    <section className={styles.section}>
      <Reveal className={`${styles.inner} ${styles.split}`}>
        <div className={styles.splitCopy}>
          {eyebrow ? <p className={styles.eyebrow} style={{ color: eyebrowColor }}>{eyebrow}</p> : null}
          {title ? <h2 className={styles.h2} style={{ color: titleColor, fontFamily: titleFont ? fontFamilyStack(titleFont) : undefined }}>{title}</h2> : null}
          {lead ? <p className={styles.lead} style={{ color: leadColor, fontFamily: leadFont ? fontFamilyStack(leadFont) : undefined }}>{lead}</p> : null}
          <div className={styles.ctaRow}>
            <BsButton btn={btn} locale={locale} />
          </div>
        </div>
        <div className={styles.splitMedia}>
          {img ? <img src={resolveUrl(img)} alt="" /> : null}
          <span className={styles.splitAccent} />
        </div>
      </Reveal>
    </section>
  );
}

export function BsStepsSection({ container, locale }) {
  const eyebrow = ltField(container, "eyebrow", locale);
  const title = ltField(container, "title", locale);
  const steps = parseStepsHtml(ltField(container, "body", locale));

  return (
    <section className={`${styles.section} ${styles.steps}`} id={container.anchor_id || "how"}>
      <Reveal className={styles.inner}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {title ? <h2 className={styles.h2}>{title}</h2> : null}
        <div className={styles.stepList}>
          {steps.map((s, i) => (
            <div key={`${s.t}-${i}`} className={styles.stepRow}>
              <div className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</div>
              <div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

export function BsAccordionSection({ container, locale }) {
  const dark = container.variant === "dark" || container.theme === "dark";
  const eyebrow = ltField(container, "eyebrow", locale);
  const title = ltField(container, "title", locale);
  const textColor = ltField(container, "text_color", locale) || container.text_color;
  const titleColor = ltField(container, "title_color", locale) || container.title_color || textColor;
  const iconColor = ltField(container, "icon_color", locale) || container.icon_color;
  const borderColor = ltField(container, "border_color", locale) || container.border_color;
  const items = (container.items || []).map((it) => ({
    q: ltField(it, "question", locale) || ltField(it, "title", locale),
    a: ltField(it, "answer", locale) || itemBody(it, locale),
  })).filter((x) => x.q);

  const btn = {
    text: ltField(container, "btn_text", locale),
    url: ltField(container, "btn_url", locale) || container.btn_url,
    variant: container.btn_variant || "seller_brass",
    bg: container.btn_bg,
    color: container.btn_color,
    hover_bg: container.btn_hover_bg,
    hover_color: container.btn_hover_color,
    border: container.btn_border,
    radius: container.btn_radius,
  };

  return (
    <section
      className={`${styles.section}${dark ? ` ${styles.darkBand}` : ""}`}
      style={{
        ["--acc-border"]: borderColor,
        ["--acc-border-dark"]: borderColor,
        ["--acc-panel-color"]: textColor,
        ["--acc-panel-color-dark"]: textColor,
      }}
    >
      <Reveal className={styles.inner}>
        {eyebrow ? <p className={styles.eyebrow} style={textColor ? { color: textColor } : undefined}>{eyebrow}</p> : null}
        {title ? <h2 className={styles.h2} style={titleColor ? { color: titleColor } : undefined}>{title}</h2> : null}
        <Accordion items={items} dark={dark} btnColor={iconColor || textColor} panelColor={textColor} />
        {btn.text ? (
          <div className={styles.ctaRow}>
            <BsButton btn={btn} locale={locale} />
          </div>
        ) : null}
      </Reveal>
    </section>
  );
}

export function BsTabsSection({ container, locale }) {
  const [typeIdx, setTypeIdx] = useState(0);
  const eyebrow = ltField(container, "eyebrow", locale);
  const title = ltField(container, "title", locale);
  const tabs = (container.tabs || []).map((tab, i) => ({
    id: tab.id || `t${i}`,
    label: ltField(tab, "label", locale) || `Tab ${i + 1}`,
    t: ltField(tab, "title", locale) || ltField(tab, "label", locale),
    d: ltField(tab, "content", locale) || itemBody(tab, locale),
    btn_url: tab.btn_url || container.btn_url,
  }));
  const active = tabs[typeIdx] || tabs[0];
  const btn = {
    text: ltField(container, "btn_text", locale),
    url: active?.btn_url || ltField(container, "btn_url", locale) || container.btn_url,
    variant: container.btn_variant || "seller_brass",
  };

  if (!tabs.length) return null;

  return (
    <section className={styles.section}>
      <Reveal className={styles.inner}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {title ? <h2 className={styles.h2}>{title}</h2> : null}
        <div className={styles.tabs} role="tablist">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={i === typeIdx}
              className={`${styles.tabBtn}${i === typeIdx ? ` ${styles.active}` : ""}`}
              onClick={() => setTypeIdx(i)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {active ? (
          <div className={styles.tabBody} role="tabpanel">
            <h3>{active.t}</h3>
            <p>{active.d}</p>
            {btn.text ? (
              <div className={styles.ctaRow}>
                <BsButton btn={btn} locale={locale} />
              </div>
            ) : null}
          </div>
        ) : null}
      </Reveal>
    </section>
  );
}

export function BsTestimonialsSection({ container, locale }) {
  const eyebrow = ltField(container, "eyebrow", locale);
  const title = ltField(container, "title", locale);
  const subtitle = ltField(container, "subtitle", locale);
  const quotes = (container.items || []).map((it) => ({
    q: ltField(it, "quote", locale),
    n: ltField(it, "name", locale) || ltField(it, "author", locale),
    r: ltField(it, "role", locale),
  })).filter((q) => q.q);

  return (
    <section className={`${styles.section} ${styles.features}`}>
      <Reveal className={styles.inner}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {title ? <h2 className={styles.h2}>{title}</h2> : null}
        {subtitle ? <p className={styles.lead}>{subtitle}</p> : null}
        <div className={styles.quoteGrid}>
          {quotes.map((q) => (
            <blockquote key={q.n} className={styles.quote}>
              <p>“{q.q}”</p>
              <footer>
                <strong>{q.n}</strong>
                {q.r}
              </footer>
            </blockquote>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

export function BsFeesSection({ container, locale }) {
  const eyebrow = ltField(container, "eyebrow", locale) || ltField(container, "title", locale);
  const title = ltField(container, "subtitle", locale) || ltField(container, "heading", locale);
  const lead = ltField(container, "lead", locale) || ltField(container, "body", locale);
  const fees = (container.items || []).map((it) => ({
    n: String(it.icon || ltField(it, "title", locale) || ""),
    t: ltField(it, "title", locale),
    d: itemBody(it, locale),
  })).filter((f) => f.t || f.n);
  const btn = {
    text: ltField(container, "btn_text", locale),
    url: ltField(container, "btn_url", locale) || container.btn_url,
    variant: container.btn_variant || "seller_brass",
  };

  return (
    <section className={`${styles.section} ${styles.darkBand}`}>
      <Reveal className={styles.inner}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {title ? <h2 className={styles.h2}>{title}</h2> : null}
        {lead ? <p className={styles.lead}>{lead}</p> : null}
        <div className={styles.priceGrid}>
          {fees.map((f, i) => (
            <article key={`${f.t}-${i}`} className={styles.priceCard}>
              <strong>{f.n}</strong>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </article>
          ))}
        </div>
        {btn.text ? (
          <div className={styles.ctaRow}>
            <BsButton btn={btn} locale={locale} />
          </div>
        ) : null}
      </Reveal>
    </section>
  );
}

export function BsMosaicSection({ container, locale }) {
  const eyebrow = ltField(container, "eyebrow", locale);
  const title = ltField(container, "title", locale);
  const lead = ltField(container, "subtitle", locale) || ltField(container, "body", locale);
  const eyebrowColor = ltField(container, "text_color", locale) || container.text_color;
  const titleColor = ltField(container, "title_color", locale) || container.title_color || eyebrowColor;
  const leadColor = ltField(container, "subtitle_color", locale) || container.subtitle_color || eyebrowColor;
  const imgs = (container.images || [])
    .map((im) => assetField(im, "url", locale) || assetField(im, "image", locale))
    .filter(Boolean)
    .slice(0, 3);
  const btn = {
    text: ltField(container, "btn_text", locale),
    url: ltField(container, "btn_url", locale) || container.btn_url,
    variant: container.btn_variant || "seller_brass",
    bg: container.btn_bg,
    color: container.btn_color,
    hover_bg: container.btn_hover_bg,
    hover_color: container.btn_hover_color,
    border: container.btn_border,
    radius: container.btn_radius,
  };

  return (
    <section className={`${styles.section} ${styles.steps}`}>
      <Reveal className={`${styles.inner} ${styles.split} ${styles.reverse}`}>
        <div className={styles.mosaic} aria-hidden>
          {imgs.map((src, i) => (
            <figure key={i}>
              <img src={resolveUrl(src)} alt="" />
            </figure>
          ))}
        </div>
        <div className={styles.splitCopy}>
          {eyebrow ? <p className={styles.eyebrow} style={eyebrowColor ? { color: eyebrowColor } : undefined}>{eyebrow}</p> : null}
          {title ? <h2 className={styles.h2} style={titleColor ? { color: titleColor } : undefined}>{title}</h2> : null}
          {lead ? <p className={styles.lead} style={leadColor ? { color: leadColor } : undefined}>{lead}</p> : null}
          {btn.text ? (
            <div className={styles.ctaRow}>
              <BsButton btn={btn} locale={locale} />
            </div>
          ) : null}
        </div>
      </Reveal>
    </section>
  );
}

export function BsFinalCtaSection({ container, locale }) {
  const eyebrow = ltField(container, "eyebrow", locale) || ltField(container, "note", locale);
  const title = ltField(container, "title", locale);
  const lead = ltField(container, "subtitle", locale);
  const btn = {
    text: ltField(container, "btn_text", locale),
    url: ltField(container, "btn_url", locale) || container.btn_url,
    variant: container.btn_variant || "seller_brass",
    bg: container.btn_bg,
    color: container.btn_color,
    hover_bg: container.btn_hover_bg,
    hover_color: container.btn_hover_color,
  };

  return (
    <section className={`${styles.section} ${styles.final}`}>
      <Reveal className={styles.inner}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {title ? <h2 className={styles.h2}>{title}</h2> : null}
        {lead ? <p className={styles.lead}>{lead}</p> : null}
        {btn.text ? (
          <div className={styles.ctaRow}>
            <BsButton btn={btn} locale={locale} />
          </div>
        ) : null}
      </Reveal>
    </section>
  );
}

export function BecomeSellerSection({ container, locale, gridIndex = 0 }) {
  switch (container.type) {
    case "hero_banner":
      return <BsHeroSection container={container} locale={locale} />;
    case "feature_grid": {
      const variant = inferFeatureGridVariant(container, gridIndex);
      if (variant === "stats_strip") return <BsStatsSection container={container} locale={locale} />;
      if (variant === "price_cards") return <BsFeesSection container={container} locale={locale} />;
      return <BsFeaturesSection container={container} locale={locale} />;
    }
    case "image_text":
      return <BsReachSection container={container} locale={locale} />;
    case "text_block":
      return <BsStepsSection container={container} locale={locale} />;
    case "accordion":
      return <BsAccordionSection container={container} locale={locale} />;
    case "tabs":
      return <BsTabsSection container={container} locale={locale} />;
    case "testimonials":
      return <BsTestimonialsSection container={container} locale={locale} />;
    case "content_mosaic":
      return <BsMosaicSection container={container} locale={locale} />;
    case "banner_cta":
      return <BsFinalCtaSection container={container} locale={locale} />;
    default:
      return null;
  }
}
