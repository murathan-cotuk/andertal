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
 * CMS + landing shell for catalog hubs (bestsellers, sales, neuheiten, brands).
 * Renders page title as H1, then Sellercentral landing containers.
 * Children render below the landing (e.g. category carousels / brand directory).
 */
export default function CatalogCmsLanding({ slug, fallbackTitle, children = null }) {
  const locale = useLocale()
  const [page, setPage] = useState(null)
  const [hasContainers, setHasContainers] = useState(false)
  const [loading, setLoading] = useState(true)

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
            const landing = await client.request(`/store/landing-page/${encodeURIComponent(data.id)}`, { cache: 'no-store' })
            if (!cancelled) {
              setHasContainers(Array.isArray(landing?.containers) && landing.containers.length > 0)
            }
          } catch {
            if (!cancelled) setHasContainers(false)
          }
        } else if (!cancelled) {
          setHasContainers(false)
        }
      } catch {
        if (!cancelled) {
          setPage(null)
          setHasContainers(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [slug])

  const title = (page ? lt(page, 'title', locale) : '') || fallbackTitle || slug

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
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 8px', boxSizing: 'border-box' }}>
          <h1 className="shop-typo-catalog-title" style={{ margin: 0 }}>{title}</h1>
        </div>
        {hasContainers && page?.id ? (
          <SectionErrorBoundary>
            <LandingContainers pageId={page.id} />
          </SectionErrorBoundary>
        ) : null}
        {children}
      </main>
      <Footer />
    </div>
  )
}
