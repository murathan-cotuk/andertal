'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import ShopHeader from '@/components/ShopHeader'
import Footer from '@/components/Footer'
import GlobalPageLoader from '@/components/ui/GlobalPageLoader'
import LandingContainers from '@/components/landing/LandingContainers'
import { SectionErrorBoundary } from '@/components/ErrorBoundary'
import { getMedusaClient } from '@/lib/medusa-client'

function lt(page, field, locale) {
  if (!locale || locale === 'de') return page?.[field] || ''
  return page?.[`${field}_i18n`]?.[locale]?.[field] || page?.[field] || ''
}

/**
 * Decide whether CMS landing containers should paint above the native catalog body.
 *
 * TASKS §8: catalog_hub_v1 stacks (text/newsletter/product rows) were pushed onto
 * bestsellers/sales and sat on top of the old sidebar+carousel templates. Pages that
 * pass `preferNativeCatalog` only opt into CMS when the intentional category layout
 * is present (`category_sidebar` + `bestseller_carousel`, or layout marker
 * `category_carousels_v1`). Brands and other hubs can still render any CMS stack.
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

  const visible = containers.filter((c) => c && c.visible !== false)
  const hasSidebar = visible.some((c) => c.type === 'category_sidebar')
  const carouselCount = visible.filter((c) => c.type === 'bestseller_carousel').length
  return hasSidebar && carouselCount > 0
}

/**
 * CMS + landing shell for catalog hubs (bestsellers, sales, neuheiten, brands).
 * With `preferNativeCatalog`, Sellercentral stacks are ignored unless they are the
 * intentional category sidebar + carousel layout — otherwise native children win.
 */
export default function CatalogCmsLanding({
  slug,
  fallbackTitle,
  children = null,
  showTitleWhenNoContainers = true,
  preferNativeCatalog = false,
}) {
  const locale = useLocale()
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
  // When CMS owns the category layout, skip native children to avoid double carousels.
  const showNativeBody = hasChildren && !useContainers
  const showTitle = showTitleWhenNoContainers && !useContainers

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
      </main>
      <Footer />
    </div>
  )
}
