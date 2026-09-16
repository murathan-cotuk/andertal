'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import AppShell, { ORANGE } from '../../../../components/AppShell'
import { api } from '../../../../lib/api'

const STATUS_COLOR = { draft: '#a1a1aa', submitted: '#d97706', published: '#22c55e', rejected: '#ef4444' }

const S = {
  main: { maxWidth: 860, margin: '0 auto', padding: '36px 24px' },
  back: { color: ORANGE, fontSize: 14, textDecoration: 'none', display: 'inline-block', marginBottom: 20 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 },
  h1: { fontSize: 26, fontWeight: 700, color: '#f5f5f5', margin: '0 0 6px' },
  meta: { fontSize: 13, color: '#9ca3af' },
  badge: (s) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: STATUS_COLOR[s] + '22', color: STATUS_COLOR[s] }),
  card: { background: '#161616', border: '1px solid #262626', borderRadius: 10, padding: '24px 26px', marginBottom: 20 },
  cardTitle: { fontSize: 15, fontWeight: 600, color: '#d4d4d8', marginBottom: 18 },
  row: { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, alignItems: 'center', marginBottom: 14 },
  label: { fontSize: 13, color: '#9ca3af', fontWeight: 500 },
  value: { fontSize: 14, color: '#f5f5f5', fontFamily: 'monospace', background: '#0f0f0f', border: '1px solid #262626', padding: '6px 10px', borderRadius: 6, wordBreak: 'break-all' },
  valueText: { fontSize: 14, color: '#f5f5f5' },
  copyBtn: { padding: '4px 10px', background: '#1e1e1e', border: '1px solid #333', color: '#d4d4d8', borderRadius: 5, fontSize: 12, cursor: 'pointer', marginLeft: 8 },
  rotateBtn: { padding: '7px 14px', background: 'transparent', border: '1.5px solid #ef4444', color: '#ef4444', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  textarea: { width: '100%', padding: '10px 12px', background: '#0f0f0f', border: '1.5px solid #333', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical', minHeight: 260, color: '#f5f5f5' },
  input: { width: '100%', padding: '10px 12px', background: '#0f0f0f', border: '1.5px solid #333', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginTop: 6, color: '#f5f5f5' },
  fieldLabel: { fontSize: 13, fontWeight: 500, color: '#d4d4d8', display: 'block', marginBottom: 4 },
  hint: { fontSize: 12, color: '#71717a', marginTop: 4 },
  btnRow: { display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' },
  saveBtn: { padding: '9px 18px', background: ORANGE, color: '#111', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  submitBtn: { padding: '9px 18px', background: '#22c55e', color: '#0a2e13', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  saveFeedback: { fontSize: 13, color: '#22c55e', alignSelf: 'center' },
  reviewBox: { background: 'rgba(217,119,6,0.12)', border: '1px solid #d97706', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#fbbf24' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  infoItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  infoLabel: { fontSize: 12, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' },
  infoValue: { fontSize: 14, color: '#f5f5f5' },
}

export default function AppDetailPage({ params }) {
  const { id } = use(params)
  const t = useTranslations('appDetail')
  const tD = useTranslations('dashboard')
  const router = useRouter()
  const locale = useLocale()
  const [app, setApp] = useState(null)
  const [manifest, setManifest] = useState('')
  const [changelog, setChangelog] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [secretVisible, setSecretVisible] = useState(false)
  const [newSecret, setNewSecret] = useState(null)

  useEffect(() => {
    api.getApp(id).then(r => {
      setApp(r.app)
      if (r.app.manifest) setManifest(JSON.stringify(r.app.manifest, null, 2))
      if (r.app.changelog) setChangelog(r.app.changelog)
    }).catch(() => {})
  }, [id])

  async function saveManifest() {
    setSaving(true)
    setSaveMsg('')
    try {
      const parsed = JSON.parse(manifest)
      await api.updateApp(id, { manifest: parsed, changelog })
      setSaveMsg(t('saved'))
      setTimeout(() => setSaveMsg(''), 2500)
    } catch (e) {
      setSaveMsg(e?.body?.message || 'Error: ' + e?.message)
    } finally {
      setSaving(false)
    }
  }

  async function rotateSecret() {
    if (!confirm(t('rotateConfirm'))) return
    try {
      const r = await api.rotateSecret(id)
      setNewSecret(r.client_secret)
      setSecretVisible(true)
    } catch (e) {
      alert(e?.body?.message || 'Error')
    }
  }

  async function submitForReview() {
    if (!confirm(t('submitConfirm'))) return
    setSubmitting(true)
    try {
      await api.submitApp(id, changelog)
      const r = await api.getApp(id)
      setApp(r.app)
    } catch (e) {
      alert(e?.body?.message || 'Error')
    } finally {
      setSubmitting(false)
    }
  }

  function copy(text) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  if (!app) return (
    <AppShell>
      <div style={S.main}><div style={{ color: '#9ca3af' }}>Loading…</div></div>
    </AppShell>
  )

  const isEditable = !['submitted'].includes(app.status)

  return (
    <AppShell>
      <div style={S.main}>
        <a href={`/${locale}/apps`} style={S.back}>{t('back')}</a>
        <div style={S.header}>
          <div>
            <h1 style={S.h1}>{app.handle}</h1>
            <div style={S.meta}>
              {t('type')}: {app.type} &nbsp;·&nbsp;
              {t('installCount')}: {app.install_count ?? 0} &nbsp;·&nbsp;
              {t('status')}: <span style={S.badge(app.status)}>{tD(`status.${app.status}`)}</span>
            </div>
          </div>
          {isEditable && (
            <button style={S.submitBtn} onClick={submitForReview} disabled={submitting}>
              {submitting ? t('submitting') : t('submitForReview')}
            </button>
          )}
        </div>

        {app.status === 'rejected' && app.review_notes && (
          <div style={S.reviewBox}><strong>{t('reviewNotes')}:</strong> {app.review_notes}</div>
        )}

        {/* OAuth Credentials */}
        <div style={S.card}>
          <div style={S.cardTitle}>{t('credentials')}</div>
          <div style={S.row}>
            <span style={S.label}>{t('clientId')}</span>
            <span>
              <span style={S.value}>{app.client_id}</span>
              <button style={S.copyBtn} onClick={() => copy(app.client_id)}>Copy</button>
            </span>
          </div>
          <div style={S.row}>
            <span style={S.label}>{t('clientSecret')}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {newSecret
                ? <><span style={S.value}>{newSecret}</span><button style={S.copyBtn} onClick={() => copy(newSecret)}>Copy</button></>
                : <span style={{ fontSize: 13, color: '#9ca3af' }}>••••••••••••••••</span>
              }
              <button style={S.rotateBtn} onClick={rotateSecret}>{t('rotateSecret')}</button>
            </span>
          </div>
        </div>

        {/* App info */}
        <div style={S.card}>
          <div style={S.cardTitle}>Details</div>
          <div style={S.infoGrid}>
            <div style={S.infoItem}><span style={S.infoLabel}>{t('version')}</span><span style={S.infoValue}>{app.current_version || '—'}</span></div>
            <div style={S.infoItem}><span style={S.infoLabel}>{t('installCount')}</span><span style={S.infoValue}>{app.install_count ?? 0}</span></div>
          </div>
        </div>

        {/* Manifest editor */}
        <div style={S.card}>
          <div style={S.cardTitle}>{t('manifest')}</div>
          <textarea
            style={{ ...S.textarea, ...(isEditable ? {} : { background: '#141414', color: '#71717a' }) }}
            value={manifest}
            onChange={e => setManifest(e.target.value)}
            readOnly={!isEditable}
          />
          <div style={{ marginTop: 14 }}>
            <label style={S.fieldLabel}>{t('changelog')}</label>
            <input
              style={S.input}
              value={changelog}
              onChange={e => setChangelog(e.target.value)}
              placeholder={t('changelogHint')}
              readOnly={!isEditable}
            />
          </div>
          <div style={S.btnRow}>
            {saveMsg && <span style={S.saveFeedback}>{saveMsg}</span>}
            {isEditable && (
              <button style={{ ...S.saveBtn, ...(saving ? S.btnDisabled : {}) }} onClick={saveManifest} disabled={saving}>
                {saving ? t('saving') : t('saveManifest')}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
