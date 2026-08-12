"use client";

import CatalogCmsLanding from "@/components/catalog/CatalogCmsLanding";
import BrandsDirectoryBlock from "@/components/landing/BrandsDirectoryBlock";
import { useLocale } from "next-intl";
import { useMemo } from "react";

export default function BrandsPage() {
  const locale = useLocale();
  const title = useMemo(() => {
    if (locale === "tr") return "Markalar";
    if (locale === "de") return "Marken";
    return "Brands";
  }, [locale]);

  return (
    <CatalogCmsLanding slug="brands" fallbackTitle={title} showTitleWhenNoContainers>
      {/* Fallback when CMS has no brands_directory / legacy seller_carousel yet */}
      <BrandsDirectoryBlock locale={locale} perRow={5} maxRows={10} />
    </CatalogCmsLanding>
  );
}
