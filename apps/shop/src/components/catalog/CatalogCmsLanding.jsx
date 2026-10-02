'use client'

import { cloneElement, isValidElement, useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import ShopHeader from '@/components/ShopHeader'
import Footer from '@/components/Footer'
import GlobalPageLoader from '@/components/ui/GlobalPageLoader'
import LandingContainers from '@/components/landing/LandingContainers'
import { SectionErrorBoundary } from '@/components/ErrorBoundary'
import { getMedusaClient } from '@/lib/medusa-client'
import { useShopStyles } from '@/context/ShopStylesContext'
import { localizedCmsField } from '@/lib/seo'
import { catalogAliasesForHub, catalogCmsSeo } from '@/lib/catalog-cms-page'

function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return ''
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
}

function cmsPagePadding(tmpl) {
  const t = tmpl && typeof tmpl === 'object' ? tmpl : {}
  const top = Number(t.padding_top)
  const bottom = Number(t.padding_bottom)
  return {
    paddingTop: Number.isFinite(top) ? Math.max(0, top) : 0,
    paddingBottom: Number.isFinite(bottom) ? Math.max(0, bottom) : 48,
  }
}

function shouldUseLandingContainers(landing, { preferNativeCatalog }) {
  const containers = Array.isArray(landing?.containers) ? landing.containers : []
  if (!containers.length) return false
  if (!preferNativeCatalog) return true

  const settings = landing?.settings && typeof landing.settings === 'object' ? landing.settings : {}
  // 'category_carousels_v1' was this flag's original name; catalog-landing-pages-seed.js writes
  // catalog_hub_v* (full CMS stack) or native_catalog_v* (hub_intro above AutoCatalogHub).
  const layout = String(settings.catalog_landing_layout || '')
  if (
    layout === 'category_carousels_v1'
    || layout.startsWith('catalog_hub_v')
    || layout.startsWith('native_catalog_v')
    || settings.catalog_use_containers === true
  ) {
    return true
  }
  // 'bestseller_carousel' and 'personalized_product_row' both render an algorithm-driven
  // product carousel — a page built entirely from personalized rows (Sellercentral's
  // landing-page editor lets sellers assemble Sales/Neuheiten/Bestsellers exactly this way)
  // is just as much a hand-built catalog layout as one using the sidebar+carousel combo below,
  // and was previously discarded in favor of the generic AutoCatalogHub fallback.
  const isCarouselContainer = (c) => c && c.visible !== false && (c.type === 'bestseller_carousel' || c.type === 'personalized_product_row')
  // Category / filter-bar checkboxes on this landing page mean the containers stay,
  // and CatalogCmsLanding wraps them in the hub sidebar instead of dropping them.
  if (
    (settings.show_submenu_left === true || settings.show_product_filter_bar === true || settings.show_filter_bar === true)
    && containers.some((c) => c && c.visible !== false)
  ) {
    return true
  }

  const visible = containers.filter((c) => c && c.visible !== false)
  if (visible.some((c) => c.type === 'hub_intro')) return true
  const hasSidebar = visible.some((c) => c.type === 'category_sidebar')
  const carouselCount = visible.filter(isCarouselContainer).length
  return hasSidebar ? carouselCount > 0 : carouselCount >= 2
}

function hasBrandsDirectoryContainer(landing) {
  const containers = Array.isArray(landing?.containers) ? landing.containers : []
  return containers.some(
    (c) =>
      c &&
      c.visible !== false &&
      (c.type === 'brands_directory' || c.type === 'seller_carousel'),
  )
}

async function loadCatalogPage(client, slug) {
  const aliases = catalogAliasesForHub(slug)
  for (const alias of aliases) {
    const data = await client.getPageBySlug(alias)
    if (data?.id) return data
  }
  try {
    const list = await fetch('/api/store-pages', { cache: 'no-store' }).then((r) => r.json())
    const pages = Array.isArray(list?.pages) ? list.pages : []
    const wanted = new Set(aliases.map((s) => s.toLowerCase()))
    const bySlug = pages.find((p) => wanted.has(String(p.slug || '').toLowerCase()))
    if (bySlug?.id) return bySlug
    if (slug === 'brands') {
      const byTitle = pages.find((p) =>
        /^(marken|brands|markalar)$/i.test(String(p.title || '').trim()),
      )
      if (byTitle?.id) return byTitle
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * CMS + chrome shell for catalog hubs (bestsellers, sales, neuheiten, brands).
 * Order: landing containers → native catalog body → Seiten richtext (always last).
 */
export default function CatalogCmsLanding({
  slug,
  fallbackTitle,
  children = null,
  showTitleWhenNoContainers = true,
  preferNativeCatalog = false,
}) {
  const locale = useLocale()
  const shopStyles = useShopStyles()
  const tmpl = shopStyles?.cms_page_template && typeof shopStyles.cms_page_template === 'object'
    ? shopStyles.cms_page_template
    : {}
  const pagePad = cmsPagePadding(tmpl)
  const [page, setPage] = useState(null)
  const [landing, setLanding] = useState(null)
  const [loading, setLoading] = useState(true)
  const hasChildren = children != null && children !== false

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const client = getMedusaClient()
        const data = await loadCatalogPage(client, slug)
        if (cancelled) return
        setPage(data || null)
        if (data?.id) {
          try {
            const lp = await fetch(`/api/store-landing-page/${encodeURIComponent(data.id)}`, {
              cache: 'no-store',
            }).then((r) => r.json())
            if (!cancelled) setLanding(lp && !lp.__error ? lp : null)
          } catch {
            if (!cancelled) setLanding(null)
          }
        } else if (!cancelled) {
          setLanding(null)
        }
      } catch {
        if (!cancelled) {
          setPage(null)
          setLanding(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [slug])

  useEffect(() => {
    if (!page) return
    const seo = catalogCmsSeo(page, locale, fallbackTitle)
    if (seo.title) document.title = seo.title
    if (seo.description) {
      let meta = document.querySelector('meta[name="description"]')
      if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('name', 'description')
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', seo.description)
    }
  }, [page, locale, fallbackTitle])

  const title = (page ? localizedCmsField(page, 'title', locale) : '') || fallbackTitle || slug
  const containers = Array.isArray(landing?.containers) ? landing.containers : []
  const useContainers = shouldUseLandingContainers(landing, { preferNativeCatalog })
  const brandsDirInCms = slug === 'brands' && hasBrandsDirectoryContainer(landing)
  const hasProductSlot = containers.some((c) => c && c.visible !== false && c.type === 'product_container')
  const hasCmsProductRows = containers.some(
    (c) => c && c.visible !== false && (c.type === 'bestseller_carousel' || c.type === 'personalized_product_row'),
  )
  const hasRichtextSlot = containers.some((c) => c && c.visible !== false && c.type === 'page_richtext')
  const showTitle = showTitleWhenNoContainers && !useContainers
  const safeBody = sanitizeHtml(page ? localizedCmsField(page, 'body', locale) : '')
  const trailingBody = safeBody && !hasRichtextSlot
  // Sellercentral landing-page settings for this hub page control left chrome only.
  // Banners/heroes must be containers on the Containers tab — AutoCatalogHub no longer
  // injects a marketing Intro banner when CMS containers are present.
  const landingSettings = landing?.settings && typeof landing.settings === 'object' ? landing.settings : {}
  const wantCategories = landingSettings.show_submenu_left === true
  const wantFilters = landingSettings.show_product_filter_bar === true
  // Mobile "Filter" button + drawer follows the Filterleiste tab ("Produkt-Filterleiste anzeigen"),
  // not the header second-nav row. With only the category checkbox on, mobile gets category pills.
  const wantMobileFilter = wantFilters
  // Only embed LandingContainers *inside* AutoCatalogHub when CMS owns the product rows —
  // otherwise embedOnly would hide the native carousels. Intro-only stacks render above the hub.
  const hubEmbed = useContainers && hasChildren && preferNativeCatalog && isValidElement(children)
    && (hasProductSlot || hasCmsProductRows)
  const showContainersAboveNative = useContainers && page?.id && !hubEmbed
  const showNativeBody = hasChildren && !hasProductSlot && !hubEmbed && (
    !useContainers || preferNativeCatalog || (slug === 'brands' && !brandsDirInCms)
  )
  const hasHubIntro = containers.some((c) => c && c.visible !== false && c.type === 'hub_intro')
  const chromeProps = {
    showCategories: wantCategories,
    showFilters: wantFilters,
    showMobileFilter: wantMobileFilter,
    // CMS hub_intro owns the H1 / subtitle — don't duplicate under the native carousels
    ...(hasHubIntro ? { title: '', subtitle: '' } : {}),
  }
  const richtextAlign = tmpl.richtext_align || 'left'
  const richtextMaxW = tmpl.richtext_max_width || '700px'

  const bodyBlock = safeBody ? (
          <div
            className="container mx-auto px-4 w-full"
            style={{
              maxWidth: richtextMaxW === 'full' ? 1200 : 800,
              paddingTop: Math.max(24, pagePad.paddingTop || 0),
              paddingBottom: pagePad.paddingBottom,
              boxSizing: 'border-box',
              textAlign: richtextAlign,
            }}
          >
            <div
              className="prose prose-gray max-w-none"
              dangerouslySetInnerHTML={{ __html: safeBody }}
            />
          </div>
  ) : null

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <ShopHeader />
        <main className="flex-1"><GlobalPageLoader /></main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--shop-bg, #faf7f2)' }}>
      <ShopHeader />
      <main className="flex-1">
        {hubEmbed && page?.id ? (
          cloneElement(children, {
            ...chromeProps,
            children: (
              <SectionErrorBoundary>
                <LandingContainers
                  pageId={page.id}
                  initialContainers={containers}
                  initialSettings={landingSettings}
                  catalogSlots={{ product_container: null, page_richtext: bodyBlock }}
                  suppressCatalogSidebar
                />
              </SectionErrorBoundary>
            ),
          })
        ) : null}
        {showContainersAboveNative ? (
          <SectionErrorBoundary>
            <LandingContainers
              pageId={page.id}
              initialContainers={containers}
              initialSettings={landingSettings}
              catalogSlots={{
                product_container: (!preferNativeCatalog && hasChildren) ? children : null,
                page_richtext: bodyBlock,
              }}
            />
          </SectionErrorBoundary>
        ) : null}
        {showTitle ? (
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 8px', boxSizing: 'border-box' }}>
            <h1 className="shop-typo-catalog-title" style={{ margin: 0 }}>{title}</h1>
          </div>
        ) : null}
        {showNativeBody
          ? (isValidElement(children) ? cloneElement(children, chromeProps) : children)
          : null}

        {trailingBody ? bodyBlock : null}
      </main>
      <Footer />
    </div>
  )
}
