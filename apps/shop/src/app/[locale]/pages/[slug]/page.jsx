"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { getMedusaClient } from "@/lib/medusa-client";
import { resolveImageUrl } from "@/lib/image-url";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import LandingContainers from "@/components/landing/LandingContainers";
import { SectionErrorBoundary } from "@/components/ErrorBoundary";
import { useShopStyles } from "@/context/ShopStylesContext";
import { localizedCmsField } from "@/lib/seo";
import { catalogShopPathForSlug } from "@/lib/catalog-cms-page";

/** DE lives on the plain field; other locales live under `${field}_i18n[locale][field]`, falling back to DE. */
function lt(page, field, locale) {
  return localizedCmsField(page, field, locale);
}

// A rich-text editor leaves a trailing empty block (<p><br></p> etc.) behind almost every save —
// harmless in the editor, but on the shop it renders as a real empty line, stacking with the
// container's own bottom padding into a much bigger gap than the padding value alone suggests.
const TRAILING_EMPTY_BLOCK = /(?:<p[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>|<br\s*\/?>)\s*$/i;
function stripTrailingEmptyBlocks(html) {
  let next = html;
  let prev;
  do {
    prev = next;
    next = prev.replace(TRAILING_EMPTY_BLOCK, "").trimEnd();
  } while (next !== prev);
  return next;
}

function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";
  const clean = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "");
  return stripTrailingEmptyBlocks(clean);
}

// 32px top/bottom matches the padding the landing-container blocks (text_block, image_text, …)
// default to — the "ideal" gap the rest of the page-builder already uses between sections.
function cmsPagePadding(tmpl) {
  const t = tmpl && typeof tmpl === "object" ? tmpl : {};
  const top = Number(t.padding_top);
  const bottom = Number(t.padding_bottom);
  return {
    paddingTop: Number.isFinite(top) ? Math.max(0, top) : 32,
    paddingBottom: Number.isFinite(bottom) ? Math.max(0, bottom) : 32,
  };
}

export default function CmsPageBySlug() {
  const params = useParams();
  const locale = useLocale();
  const router = useRouter();
  const slug = params?.slug != null ? String(params.slug) : undefined;
  const catalogDest = catalogShopPathForSlug(slug);
  const shopStyles = useShopStyles();
  const pagePad = cmsPagePadding(shopStyles?.cms_page_template);

  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [landing, setLanding] = useState(null);

  useEffect(() => {
    if (catalogDest) router.replace(catalogDest);
  }, [catalogDest, router]);

  useEffect(() => {
    if (!slug || catalogDest) return;

    const fetchPage = async () => {
      try {
        setLoading(true);
        setNotFound(false);
        setLanding(null);
        const client = getMedusaClient();
        const data = await client.getPageBySlug(slug);
        setPage(data);
        if (data?.id) {
          try {
            const next = await fetch(`/api/store-landing-page/${encodeURIComponent(data.id)}`, {
              cache: "no-store",
            }).then((r) => r.json());
            setLanding(next && !next.__error ? next : null);
          } catch {
            setLanding(null);
          }
        }
      } catch (err) {
        setPage(null);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [slug, catalogDest]);

  if (catalogDest || loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <ShopHeader />
        <main className="flex-1">
          <GlobalPageLoader />
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen flex flex-col">
        <ShopHeader />
        <main className="flex-1 container mx-auto px-4 py-12">
          <h1 className="text-2xl font-semibold text-gray-800">Page not found</h1>
          <p className="text-gray-500 mt-2">The page you are looking for does not exist or is not published.</p>
        </main>
        <Footer />
      </div>
    );
  }

  const localizedTitle = lt(page, "title", locale);
  const safeBody = sanitizeHtml(lt(page, "body", locale));
  const hero = page.featured_image ? resolveImageUrl(page.featured_image) : "";
  const containers = Array.isArray(landing?.containers) ? landing.containers : [];
  const hasContainers = containers.length > 0;
  const hasRichtextSlot = containers.some((c) => c && c.visible !== false && c.type === "page_richtext");
  const bodyBlock = safeBody ? (
        <div style={{ width: "100%", background: "#f5f5f5", boxSizing: "border-box" }}>
          <div
            className="cms-richtext container mx-auto px-4 max-w-3xl w-full"
            style={{ paddingTop: 40, paddingBottom: pagePad.paddingBottom }}
            dangerouslySetInnerHTML={{ __html: safeBody }}
          />
        </div>
  ) : null;
  const bannerBlock = (
    <>
          {hero ? (
            <div className="mb-8 rounded-xl overflow-hidden border border-gray-100">
              <img
                src={hero}
                alt={localizedTitle}
                className="w-full max-h-[min(42vh,400px)] object-cover block"
              />
            </div>
          ) : null}
          <h1>{localizedTitle}</h1>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <ShopHeader />
      <main className="flex-1">
        {hasContainers ? (
          <SectionErrorBoundary>
            <LandingContainers
              pageId={page.id}
              initialContainers={containers}
              initialSettings={landing?.settings || {}}
              catalogSlots={{
                page_banner: bannerBlock,
                page_richtext: bodyBlock,
              }}
            />
          </SectionErrorBoundary>
        ) : null}
        <div
          className="container mx-auto px-4 max-w-3xl w-full"
          style={{
            paddingTop: hasContainers ? Math.max(24, pagePad.paddingTop) : (hero ? 8 : pagePad.paddingTop),
            paddingBottom: safeBody ? 0 : pagePad.paddingBottom,
          }}
        >
          {!hasContainers && hero ? (
            <div className="mb-8 rounded-xl overflow-hidden border border-gray-100">
              <img
                src={hero}
                alt={localizedTitle}
                className="w-full max-h-[min(42vh,400px)] object-cover block"
              />
            </div>
          ) : null}
          {!hasContainers ? <h1>{localizedTitle}</h1> : null}
          {!safeBody && !hasContainers ? (
            <p className="text-gray-500">No content.</p>
          ) : null}
        </div>
        {/* Full-bleed backdrop behind the richtext block — spans the page's full width,
            independent of the constrained title/hero box above it. */}
        {safeBody && !hasRichtextSlot ? bodyBlock : null}
      </main>
      <Footer />
      {/* @tailwindcss/typography isn't installed, so "prose" utility classes are no-ops here —
          this file's own rules are the only thing normalizing the editor's raw HTML. The
          :global() + last-child rule is what actually kills the leftover space below the text. */}
      <style jsx>{`
        .cms-richtext :global(p),
        .cms-richtext :global(ul),
        .cms-richtext :global(ol) {
          margin: 0 0 1em;
          line-height: 1.7;
        }
        .cms-richtext :global(h1),
        .cms-richtext :global(h2),
        .cms-richtext :global(h3),
        .cms-richtext :global(h4) {
          margin: 1.25em 0 0.5em;
          line-height: 1.25;
        }
        .cms-richtext :global(> *:first-child) {
          margin-top: 0;
        }
        .cms-richtext :global(> *:last-child) {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
}
