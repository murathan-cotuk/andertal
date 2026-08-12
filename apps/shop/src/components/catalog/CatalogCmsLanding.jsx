'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import ShopHeader from '@/components/ShopHeader'
import Footer from '@/components/Footer'
import GlobalPageLoader from '@/components/ui/GlobalPageLoader'
import LandingContainers from '@/components/landing/LandingContainers'
import { SectionErrorBoundary } from '@/components/ErrorBoundary'
import { getMedusaClient } from '@/lib/medusa-client'
import { useShopStyles } from '@/context/ShopStylesContext'

function lt(page, field, locale) {
  if (!locale || locale === 'de') return page?.[field] || ''
  return page?.[`${field}_i18n`]?.[locale]?.[field] || page?.[field] || ''
}

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

/**
 * Decide whether CMS landing containers should paint above the native catalog body.
 *
 * TASKS §8: catalog_hub stacks were pushed onto bestsellers/sales and sat on top of
 * the old sidebar+carousel templates. Pages that pass `preferNativeCatalog` only opt
 * into CMS when the intentional category layout is present.
 */
function shouldUseLandingContainers(landing, { preferNativeCatalog }) {
  const containers = Array.isArray(landing?.containers) ? landing.containers : []
  if (!containers.length) return false

  if (!preferNativeCatalog) return true

  const settings = landing?.settings && typeof landing.settings === 'object' ? landing.settings : {}
  const layout = String(settings.catalog_landing_layout || '')
  if (layout === 'category_carousels_v1' || settings.catalog_use_containers === true) {
    return true
  }
  if (settings.show_product_filter_bar === true) {
    const carouselCount = containers.filter((c) => c && c.visible !== false && c.type === 'bestseller_carousel').length
    if (carouselCount > 0) return true
  }

  const visible = containers.filter((c) => c && c.visible !== false)
  const hasSidebar = visible.some((c) => c.type === 'category_sidebar')
  const carouselCount = visible.filter((c) => c.type === 'bestseller_carousel').length
  return hasSidebar && carouselCount > 0
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

/**
 * CMS + chrome shell for catalog hubs (bestsellers, sales, neuheiten, brands).
 *
 * TASKS §7: Seiteninhalt (page body / richtext from Content → Pages) always renders
 * at the very bottom — after containers and after any native body.
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
  const pagePad = cmsPagePadding(shopStyles?.cms_page_template)
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
        const data = await client.getPageBySlug(slug)
        if (cancelled) return
        setPage(data || null)
        if (data?.id) {
          try {
            const lp = await client.request(`/store/landing-page/${encodeURIComponent(data.id)}`, { cache: 'no-store' })
            if (!cancelled) setLanding(lp || null)
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

  const title = (page ? lt(page, 'title', locale) : '') || fallbackTitle || slug
  const useContainers = shouldUseLandingContainers(landing, { preferNativeCatalog })
  // Brands: if CMS already has brands_directory (or legacy seller_carousel→directory),
  // skip native fallback to avoid a double grid.
  const brandsDirInCms = slug === 'brands' && hasBrandsDirectoryContainer(landing)
  const showNativeBody = hasChildren && (!useContainers || (slug === 'brands' && !brandsDirInCms))
  const showTitle = showTitleWhenNoContainers && !useContainers
  const safeBody = sanitizeHtml(page ? lt(page, 'body', locale) : '')

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
    <div className="min-h-screen flex flex-col" style={{ background: '#fafafa' }}>
      <ShopHeader />
      <main className="flex-1">
        {useContainers && page?.id ? (
          <SectionErrorBoundary>
            <LandingContainers pageId={page.id} />
          </SectionErrorBoundary>
        ) : null}
        {showTitle ? (
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 8px', boxSizing: 'border-box' }}>
            <h1 className="shop-typo-catalog-title" style={{ margin: 0 }}>{title}</h1>
          </div>
        ) : null}
        {showNativeBody ? children : null}

        {/* TASKS §7: Seiteninhalt always last — below every container / native block */}
        {safeBody ? (
          <div
            className="container mx-auto px-4 max-w-3xl w-full"
            style={{
              paddingTop: Math.max(24, pagePad.paddingTop || 0),
              paddingBottom: pagePad.paddingBottom,
              boxSizing: 'border-box',
            }}
          >
            <div
              className="prose prose-gray max-w-none"
              dangerouslySetInnerHTML={{ __html: safeBody }}
            />
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  )
}
