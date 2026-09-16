'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import AppShell, { ORANGE } from '../../../components/AppShell'
import { api } from '../../../lib/api'

const STATUS_COLOR = { draft: '#a1a1aa', submitted: '#d97706', published: '#22c55e', rejected: '#ef4444' }

const S = {
  main: { maxWidth: 900, margin: '0 auto', padding: '36px 24px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  h1: { fontSize: 26, fontWeight: 700, color: '#f5f5f5', margin: 0 },
  createBtn: { padding: '10px 18px', background: ORANGE, color: '#111', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#161616', border: '1px solid #262626', borderRadius: 10, overflow: 'hidden' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #262626' },
  td: { padding: '13px 16px', fontSize: 14, color: '#d4d4d8', borderBottom: '1px solid #1f1f1f' },
  badge: (s) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: STATUS_COLOR[s] + '22', color: STATUS_COLOR[s] }),
  manageBtn: { padding: '5px 12px', background: '#1e1e1e', border: '1px solid #333', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: '#e4e4e7' },
  emptyRow: { textAlign: 'center', color: '#71717a', padding: 48 },
}

export default function AppsPage() {
  const t = useTranslations('apps')
  const tD = useTranslations('dashboard')
  const router = useRouter()
  const locale = useLocale()
  const [apps, setApps] = useState([])

  useEffect(() => {
    api.listApps().then(r => setApps(r.apps || [])).catch(() => {})
  }, [])

  return (
    <AppShell>
      <div style={S.main}>
        <div style={S.header}>
          <h1 style={S.h1}>{t('title')}</h1>
          <a href={`/${locale}/apps/new`} style={S.createBtn}>{t('createApp')}</a>
        </div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>{t('handle')}</th>
              <th style={S.th}>{t('appType.integration_app').split(' ')[0]}</th>
              <th style={S.th}>{t('version')}</th>
              <th style={S.th}>{t('installs')}</th>
              <th style={S.th}>{t('status')}</th>
              <th style={S.th}>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {apps.length === 0
              ? <tr><td colSpan={6} style={S.emptyRow}>{t('noApps')}</td></tr>
              : apps.map(a => (
                <tr key={a.id}>
                  <td style={S.td}><strong style={{ color: '#f5f5f5' }}>{a.handle}</strong></td>
                  <td style={S.td}>{t(`appType.${a.type}`)}</td>
                  <td style={S.td}>{a.current_version || '—'}</td>
                  <td style={S.td}>{a.install_count ?? 0}</td>
                  <td style={S.td}><span style={S.badge(a.status)}>{tD(`status.${a.status}`)}</span></td>
                  <td style={S.td}>
                    <button style={S.manageBtn} onClick={() => router.push(`/${locale}/apps/${a.id}`)}>{t('manage')}</button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </AppShell>
  )
}
