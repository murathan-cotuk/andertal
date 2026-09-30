"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import CatalogCmsLanding from "@/components/catalog/CatalogCmsLanding";
import AutoCatalogHub from "@/components/catalog/AutoCatalogHub";

function pickI18n(i18n, locale) {
  if (!i18n || typeof i18n !== "object") return null;
  return i18n[locale] || i18n.de || i18n.en || null;
}

// Sellercentral API-page settings (sort_mode) → hub ranking.
const SORT_MODE_TO_RANK = { sales: "bestseller", views: "bestseller", random: "bestseller", rating: "rating", newest: "newest" };

/**
 * Catalog hub route (/bestsellers, /neuheiten, /sales): the page's CMS landing containers from
 * Sellercentral (content/landing-page) when it has some, otherwise the algorithmic hub.
 * `settingsKey` reads the optional Sellercentral API-page settings (title, subtitle, max items, sort).
 */
export default function CatalogHubRoute({ cmsSlug, settingsKey = "", mode, fallbackTitle }) {
  const locale = useLocale();
  const [pageSettings, setPageSettings] = useState(null);

  useEffect(() => {
    if (!settingsKey) return undefined;
    let cancelled = false;
    fetch(`/api/store-api-page-settings/${encodeURIComponent(settingsKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setPageSettings(d || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [settingsKey]);

  const maxItems = Number(pageSettings?.max_items) > 0 ? Number(pageSettings.max_items) : 20;
  const title = pickI18n(pageSettings?.title_i18n, locale)?.title || "";
  const subtitle = pickI18n(pageSettings?.subtitle_i18n, locale)?.subtitle || "";

  return (
    <CatalogCmsLanding slug={cmsSlug} fallbackTitle={title || fallbackTitle} showTitleWhenNoContainers={false} preferNativeCatalog>
      <AutoCatalogHub
        key={pageSettings?.sort_mode || "default"}
        mode={mode}
        title={title}
        subtitle={subtitle}
        maxItems={maxItems}
        rank={SORT_MODE_TO_RANK[pageSettings?.sort_mode] || ""}
      />
    </CatalogCmsLanding>
  );
}
