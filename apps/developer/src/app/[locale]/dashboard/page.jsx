'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import AppShell, { ORANGE } from '../../../components/AppShell'
import { api } from '../../../lib/api'

const STATUS_COLOR = { draft: '#a1a1aa', submitted: '#d97706', published: '#22c55e', rejected: '#ef4444' }

const S = {
  main: { maxWidth: 900, margin: '0 auto', padding: '36px 24px' },
  h1: { fontSize: 26, fontWeight: 700, color: '#f5f5f5', margin: '0 0 4px' },
  sub: { fontSize: 14, color: '#9ca3af', margin: '0 0 32px' },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 36 },
  stat: { background: '#161616', border: '1px solid #262626', borderRadius: 10, padding: '20px 22px' },
  statVal: { fontSize: 32, fontWeight: 700, color: '#f5f5f5', lineHeight: 1.1 },
  statLabel: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  section: { marginBottom: 36 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: '#d4d4d8', marginBottom: 14 },
  quickBtns: { display: 'flex', gap: 12 },
  qBtn: { padding: '10px 18px', background: ORANGE, color: '#111', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' },
  qBtnGhost: { padding: '10px 18px', background: 'transparent', color: '#e4e4e7', border: '1.5px solid #333', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', textDecoration: 'none' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#161616', border: '1px solid #262626', borderRadius: 10, overflow: 'hidden' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #262626' },
  td: { padding: '12px 16px', fontSize: 14, color: '#d4d4d8', borderBottom: '1px solid #1f1f1f' },
  badge: (s) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: STATUS_COLOR[s] + '22', color: STATUS_COLOR[s] }),
  emptyRow: { textAlign: 'center', color: '#71717a', padding: 32 },
}

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  const tApps = useTranslations('apps')
  const router = useRouter()
  const locale = useLocale()
  const [apps, setApps] = useState([])
  const [me, setMe] = useState(null)

  useEffect(() => {
    api.me().then(setMe).catch(() => {})
    api.listApps().then(r => setApps(r.apps || [])).catch(() => {})
  }, [])

  const published = apps.filter(a => a.status === 'published').length
  const totalInstalls = apps.reduce((s, a) => s + (a.install_count || 0), 0)
  const recent = apps.slice(0, 5)

  return (
    <AppShell>
      <div style={S.main}>
        <h1 style={S.h1}>{t('welcome')}{me?.company_name ? `, ${me.company_name}` : ''}</h1>
        <p style={S.sub}>{t('title')}</p>
        <div style={S.stats}>
          <div style={S.stat}><div style={S.statVal}>{apps.length}</div><div style={S.statLabel}>{t('totalApps')}</div></div>
          <div style={S.stat}><div style={S.statVal}>{published}</div><div style={S.statLabel}>{t('publishedApps')}</div></div>
          <div style={S.stat}><div style={S.statVal}>{totalInstalls}</div><div style={S.statLabel}>{t('totalInstalls')}</div></div>
        </div>
        <div style={S.section}>
          <div style={S.sectionTitle}>{t('quickActions')}</div>
          <div style={S.quickBtns}>
            <a href={`/${locale}/apps/new`} style={S.qBtn}>{t('createApp')}</a>
            <a href={`/${locale}/apps`} style={S.qBtnGhost}>{tApps('title')}</a>
          </div>
        </div>
        <div style={S.section}>
          <div style={S.sectionTitle}>{t('recentApps')}</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>{tApps('handle')}</th>
                <th style={S.th}>{tApps('appType.integration_app').split(' ')[0]}</th>
                <th style={S.th}>{tApps('version')}</th>
                <th style={S.th}>{tApps('installs')}</th>
                <th style={S.th}>{tApps('status')}</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0
                ? <tr><td colSpan={5} style={S.emptyRow}>{t('noApps')}</td></tr>
                : recent.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/${locale}/apps/${a.id}`)}>
                    <td style={S.td}><strong style={{ color: '#f5f5f5' }}>{a.handle}</strong></td>
                    <td style={S.td}>{tApps(`appType.${a.type}`)}</td>
                    <td style={S.td}>{a.current_version || '—'}</td>
                    <td style={S.td}>{a.install_count ?? 0}</td>
                    <td style={S.td}><span style={S.badge(a.status)}>{t(`status.${a.status}`)}</span></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
