"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { getMedusaClient } from "@/lib/medusa-client";
import { resolveImageUrl } from "@/lib/image-url";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import LandingContainers from "@/components/landing/LandingContainers";
import { SectionErrorBoundary } from "@/components/ErrorBoundary";
import { useShopStyles } from "@/context/ShopStylesContext";

/** DE lives on the plain field; other locales live under `${field}_i18n[locale][field]`, falling back to DE. */
function lt(page, field, locale) {
  if (!locale || locale === "de") return page?.[field] || "";
  return page?.[`${field}_i18n`]?.[locale]?.[field] || page?.[field] || "";
}

function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "");
}

function cmsPagePadding(tmpl) {
  const t = tmpl && typeof tmpl === "object" ? tmpl : {};
  const top = Number(t.padding_top);
  const bottom = Number(t.padding_bottom);
  return {
    paddingTop: Number.isFinite(top) ? Math.max(0, top) : 0,
    paddingBottom: Number.isFinite(bottom) ? Math.max(0, bottom) : 48,
  };
}

export default function CmsPageBySlug() {
  const params = useParams();
  const locale = useLocale();
  const slug = params?.slug != null ? String(params.slug) : undefined;
  const shopStyles = useShopStyles();
  const pagePad = cmsPagePadding(shopStyles?.cms_page_template);

  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [hasContainers, setHasContainers] = useState(false);

  useEffect(() => {
    if (!slug) return;

    const fetchPage = async () => {
      try {
        setLoading(true);
        setNotFound(false);
        setHasContainers(false);
        const client = getMedusaClient();
        const data = await client.getPageBySlug(slug);
        setPage(data);
        if (data?.id) {
          // A page built with the Sellercentral landing-page container editor (e.g. the
          // "Kundenservice"/customer-support page) has its real content there, not in `body`.
          try {
            const landing = await fetch(`/api/store-landing-page/${encodeURIComponent(data.id)}`).then((r) => r.json());
            setHasContainers(Array.isArray(landing?.containers) && landing.containers.length > 0);
          } catch {
            setHasContainers(false);
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
  }, [slug]);

  if (loading) {
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

  // Landing containers (Sellercentral) are the page body when present — avoid a second
  // CMS chrome title/hero fighting the first container (e.g. Verkäufer werden hero).
  return (
    <div className="min-h-screen flex flex-col">
      <ShopHeader />
      <main className="flex-1">
        {hasContainers ? (
          <SectionErrorBoundary>
            <LandingContainers pageId={page.id} />
          </SectionErrorBoundary>
        ) : null}
        <div
          className="container mx-auto px-4 max-w-3xl w-full"
          style={{
            paddingTop: hasContainers ? Math.max(24, pagePad.paddingTop) : (hero ? 8 : pagePad.paddingTop),
            paddingBottom: pagePad.paddingBottom,
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
          {safeBody ? (
            <div
              className="prose prose-gray max-w-none"
              dangerouslySetInnerHTML={{ __html: safeBody }}
            />
          ) : hasContainers ? null : (
            <p className="text-gray-500">No content.</p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
