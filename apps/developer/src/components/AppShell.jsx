'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import AuthGuard from './AuthGuard'
import { clearToken } from '../lib/api'

export const ORANGE = '#ff971c'
export const ORANGE_DARK = '#e0810a'
export const ORANGE_TINT = 'rgba(255,151,28,0.12)'
export const ORANGE_BORDER = 'rgba(255,151,28,0.4)'

const S = {
  shell: { minHeight: '100vh', background: '#0a0a0a', display: 'flex' },
  sidebar: { width: 240, flexShrink: 0, background: '#141414', borderRight: '1px solid #262626', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  brand: { padding: '22px 20px 18px', display: 'block', textDecoration: 'none' },
  brandName: { fontSize: 16, fontWeight: 700, color: '#f5f5f5', letterSpacing: '-0.01em' },
  brandSub: { fontSize: 11, color: '#71717a', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 3 },
  nav: { flex: 1, padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 2 },
  link: (active) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
    color: active ? ORANGE : '#a1a1aa', background: active ? ORANGE_TINT : 'transparent',
    textDecoration: 'none', fontSize: 14, fontWeight: active ? 600 : 500,
  }),
  footer: { padding: 12, borderTop: '1px solid #262626' },
  logoutBtn: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'none', border: 'none', color: '#a1a1aa', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box' },
  main: { flex: 1, minWidth: 0 },
}

function DashboardIcon({ color }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

function AppsIcon({ color }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 17l5-5-5-5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12H9" />
    </svg>
  )
}

/**
 * Shared authenticated shell: dark background, fixed left sidebar (brand + nav + logout),
 * content slot on the right. Wraps AuthGuard so every page using this gets the auth check
 * for free instead of repeating <AuthGuard><div className="page">... on each route.
 */
export default function AppShell({ children }) {
  const t = useTranslations('nav')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const isActive = (seg) => pathname.includes(`/${seg}`)

  function logout() {
    clearToken()
    router.push(`/${locale}/login`)
  }

  return (
    <AuthGuard>
      <div style={S.shell}>
        <aside style={S.sidebar}>
          <a href={`/${locale}/dashboard`} style={S.brand}>
            <div style={S.brandName}>Andertal</div>
            <div style={S.brandSub}>Developers</div>
          </a>
          <nav style={S.nav}>
            <a href={`/${locale}/dashboard`} style={S.link(isActive('dashboard'))}>
              <DashboardIcon color={isActive('dashboard') ? ORANGE : '#a1a1aa'} />
              {t('dashboard')}
            </a>
            <a href={`/${locale}/apps`} style={S.link(isActive('/apps'))}>
              <AppsIcon color={isActive('/apps') ? ORANGE : '#a1a1aa'} />
              {t('apps')}
            </a>
          </nav>
          <div style={S.footer}>
            <button style={S.logoutBtn} onClick={logout}>
              <LogoutIcon />
              {t('logout')}
            </button>
          </div>
        </aside>
        <main style={S.main}>{children}</main>
      </div>
    </AuthGuard>
  )
}
