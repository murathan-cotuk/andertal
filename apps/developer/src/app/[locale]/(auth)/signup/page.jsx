'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { api } from '../../../../lib/api'

const S = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f8fa', padding: '24px 16px' },
  card: { background: '#fff', borderRadius: 12, padding: '40px 36px', width: 420, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' },
  logo: { fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 28 },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#333', marginBottom: 6 },
  input: { width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  btn: { width: '100%', padding: '11px 0', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 20 },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  err: { color: '#e53e3e', fontSize: 13, marginTop: 10, textAlign: 'center' },
  ok: { color: '#22863a', fontSize: 13, marginTop: 10, textAlign: 'center' },
  foot: { marginTop: 20, textAlign: 'center', fontSize: 13, color: '#666' },
  link: { color: '#0070f3', textDecoration: 'none', fontWeight: 500 },
  field: { marginBottom: 16 },
  checkRow: { display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  checkLabel: { fontSize: 13, color: '#444', lineHeight: '1.4' },
}

export default function SignupPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const locale = useLocale()
  const [form, setForm] = useState({ email: '', password: '', company_name: '', country: '', vat_number: '' })
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!agreed) return
    setError('')
    setLoading(true)
    try {
      await api.signup(form)
      setSuccess(true)
      setTimeout(() => router.push(`/${locale}/login`), 1800)
    } catch {
      setError(t('signupError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={S.logo}>Andertal Developers</div>
        <div style={S.subtitle}>Developer Portal</div>
        <form onSubmit={submit}>
          <div style={S.field}>
            <label style={S.label}>{t('email')}</label>
            <input style={S.input} type="email" value={form.email} onChange={set('email')} required autoFocus />
          </div>
          <div style={S.field}>
            <label style={S.label}>{t('password')}</label>
            <input style={S.input} type="password" value={form.password} onChange={set('password')} required minLength={8} />
          </div>
          <div style={S.field}>
            <label style={S.label}>{t('companyName')}</label>
            <input style={S.input} type="text" value={form.company_name} onChange={set('company_name')} required />
          </div>
          <div style={{ ...S.row, ...S.field }}>
            <div>
              <label style={S.label}>{t('country')}</label>
              <input style={S.input} type="text" value={form.country} onChange={set('country')} placeholder="DE" maxLength={2} />
            </div>
            <div>
              <label style={S.label}>{t('vatNumber')}</label>
              <input style={S.input} type="text" value={form.vat_number} onChange={set('vat_number')} />
            </div>
          </div>
          <div style={S.checkRow}>
            <input type="checkbox" id="agree" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
            <label htmlFor="agree" style={S.checkLabel}>{t('agreeTerms')}</label>
          </div>
          {error && <div style={S.err}>{error}</div>}
          {success && <div style={S.ok}>{t('signupSuccess')}</div>}
          <button style={{ ...S.btn, ...(loading || !agreed ? S.btnDisabled : {}) }} disabled={loading || !agreed}>
            {loading ? t('loading') : t('signup')}
          </button>
        </form>
        <div style={S.foot}>
          {t('alreadyHaveAccount')}{' '}
          <a href={`/${locale}/login`} style={S.link}>{t('login')}</a>
        </div>
      </div>
    </div>
  )
}
