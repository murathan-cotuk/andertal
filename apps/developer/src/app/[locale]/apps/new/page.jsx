'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import AuthGuard from '../../../../components/AuthGuard'
import PortalNav from '../../../../components/PortalNav'
import { api } from '../../../../lib/api'

const ALL_SCOPES = [
  'read_orders', 'write_orders', 'read_products', 'write_products',
  'write_inventory', 'write_fulfillments', 'read_customers', 'write_customers',
  'read_analytics', 'read_shipping', 'write_shipping', 'read_discounts',
  'write_discounts', 'write_storefront', 'write_checkout', 'read_seller', 'write_seller',
]

const CATEGORIES = [
  { value: 'shipping-fulfillment', label: 'Shipping & Logistics' },
  { value: 'accounting',           label: 'Accounting & Finance' },
  { value: 'marketing',            label: 'Marketing' },
  { value: 'analytics',            label: 'Analytics' },
  { value: 'inventory',            label: 'Inventory Management' },
  { value: 'reviews',              label: 'Reviews' },
  { value: 'storefront',           label: 'Storefront' },
  { value: 'other',                label: 'Other' },
]

const S = {
  page: { minHeight: '100vh', background: '#f7f8fa' },
  main: { maxWidth: 680, margin: '0 auto', padding: '36px 24px' },
  back: { color: '#0070f3', fontSize: 14, textDecoration: 'none', display: 'inline-block', marginBottom: 20 },
  h1: { fontSize: 26, fontWeight: 700, color: '#111', margin: '0 0 28px' },
  card: { background: '#fff', borderRadius: 10, padding: '28px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 18 },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#333', marginBottom: 6 },
  hint: { fontSize: 12, color: '#888', marginTop: 4 },
  input: { width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: 80 },
  select: { width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, background: '#fff', boxSizing: 'border-box' },
  field: { marginBottom: 18 },
  typeCard: (active) => ({ border: `2px solid ${active ? '#0070f3' : '#e0e0e0'}`, borderRadius: 8, padding: '12px 14px', cursor: 'pointer', marginBottom: 10, background: active ? '#eff6ff' : '#fff' }),
  typeName: { fontSize: 14, fontWeight: 600, color: '#111' },
  typeDesc: { fontSize: 12, color: '#666', marginTop: 3 },
  scopesGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 },
  scopeItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#333', cursor: 'pointer' },
  footer: { display: 'flex', gap: 12, justifyContent: 'flex-end' },
  btn: { padding: '11px 22px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '11px 22px', background: '#fff', color: '#333', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  err: { color: '#e53e3e', fontSize: 13, marginBottom: 12 },
}

export default function NewAppPage() {
  const t = useTranslations('newApp')
  const tApps = useTranslations('apps')
  const router = useRouter()
  const locale = useLocale()
  const [form, setForm] = useState({
    handle: '', name: '', type: 'integration_app', description: '',
    category: 'other', privacy_policy_url: '', redirect_urls: '', scopes: [],
    version: '1.0.0', support_url: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const toggleScope = (s) => setForm(f => ({
    ...f, scopes: f.scopes.includes(s) ? f.scopes.filter(x => x !== s) : [...f.scopes, s]
  }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const redirect_urls = form.redirect_urls.split('\n').map(s => s.trim()).filter(Boolean)
      const payload = {
        handle: form.handle,
        manifest: {
          schema_version: '1',
          handle: form.handle,
          name: form.name,
          type: form.type,
          version: form.version,
          description: form.description,
          category: form.category,
          support: { privacy_policy_url: form.privacy_policy_url, support_url: form.support_url || undefined },
          scopes: form.scopes,
          oauth: { redirect_urls },
          pricing: { model: 'free' },
        }
      }
      const { app } = await api.createApp(payload)
      router.push(`/${locale}/apps/${app.id}`)
    } catch (err) {
      setError(err?.body?.message || t('error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthGuard>
      <div style={S.page}>
        <PortalNav />
        <div style={S.main}>
          <a href={`/${locale}/apps`} style={S.back}>← {tApps('title')}</a>
          <h1 style={S.h1}>{t('title')}</h1>
          <form onSubmit={submit}>
            {/* Basic info */}
            <div style={S.card}>
              <div style={S.sectionTitle}>{t('step1')}</div>
              <div style={S.field}>
                <label style={S.label}>{t('name')} *</label>
                <input style={S.input} value={form.name} onChange={set('name')} required />
              </div>
              <div style={S.field}>
                <label style={S.label}>{t('handle')} *</label>
                <input style={S.input} value={form.handle} onChange={set('handle')} required pattern="[a-z0-9][a-z0-9-]{0,62}[a-z0-9]" />
                <div style={S.hint}>{t('handleHint')}</div>
              </div>
              <div style={S.field}>
                <label style={S.label}>{t('type')}</label>
                <div style={S.typeCard(form.type === 'integration_app')} onClick={() => setForm(f => ({ ...f, type: 'integration_app' }))}>
                  <div style={S.typeName}>Integration App</div>
                  <div style={S.typeDesc}>{t('typeIntegration')}</div>
                </div>
                <div style={S.typeCard(form.type === 'shop_app')} onClick={() => setForm(f => ({ ...f, type: 'shop_app' }))}>
                  <div style={S.typeName}>Shop App</div>
                  <div style={S.typeDesc}>{t('typeShop')}</div>
                </div>
              </div>
              <div style={S.field}>
                <label style={S.label}>{t('category')}</label>
                <select style={S.select} value={form.category} onChange={set('category')}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>{t('description')}</label>
                <textarea style={S.textarea} value={form.description} onChange={set('description')} />
              </div>
            </div>

            {/* OAuth */}
            <div style={S.card}>
              <div style={S.sectionTitle}>{t('step3')}</div>
              <div style={S.field}>
                <label style={S.label}>{t('redirectUrls')}</label>
                <textarea style={S.textarea} value={form.redirect_urls} onChange={set('redirect_urls')} placeholder="https://yourapp.com/oauth/callback" />
                <div style={S.hint}>{t('redirectUrlsHint')}</div>
              </div>
              <div style={S.field}>
                <label style={S.label}>{t('privacyUrl')}</label>
                <input style={S.input} type="url" value={form.privacy_policy_url} onChange={set('privacy_policy_url')} />
              </div>
              <div style={S.field}>
                <label style={S.label}>{t('scopes')}</label>
                <div style={S.scopesGrid}>
                  {ALL_SCOPES.map(s => (
                    <label key={s} style={S.scopeItem}>
                      <input type="checkbox" checked={form.scopes.includes(s)} onChange={() => toggleScope(s)} />
                      <span>{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {error && <div style={S.err}>{error}</div>}
            <div style={S.footer}>
              <button type="button" style={S.cancelBtn} onClick={() => router.push(`/${locale}/apps`)}>{t('cancel')}</button>
              <button type="submit" style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }} disabled={loading}>
                {loading ? t('creating') : t('create')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AuthGuard>
  )
}
