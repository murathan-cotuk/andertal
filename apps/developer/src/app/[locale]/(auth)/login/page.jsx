'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { api, saveToken } from '../../../../lib/api'

const S = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f8fa' },
  card: { background: '#fff', borderRadius: 12, padding: '40px 36px', width: 380, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' },
  logo: { fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 28 },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#333', marginBottom: 6 },
  input: { width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border 0.15s' },
  btn: { width: '100%', padding: '11px 0', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 20 },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  err: { color: '#e53e3e', fontSize: 13, marginTop: 10, textAlign: 'center' },
  foot: { marginTop: 20, textAlign: 'center', fontSize: 13, color: '#666' },
  link: { color: '#0070f3', textDecoration: 'none', fontWeight: 500 },
  field: { marginBottom: 16 },
}

export default function LoginPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const locale = useLocale()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token } = await api.login(email, password)
      saveToken(token)
      router.push(`/${locale}/dashboard`)
    } catch {
      setError(t('loginError'))
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
            <input style={S.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          <div style={S.field}>
            <label style={S.label}>{t('password')}</label>
            <input style={S.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <div style={S.err}>{error}</div>}
          <button style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }} disabled={loading}>
            {loading ? t('loading') : t('login')}
          </button>
        </form>
        <div style={S.foot}>
          {t('noAccount')}{' '}
          <a href={`/${locale}/signup`} style={S.link}>{t('signup')}</a>
        </div>
      </div>
    </div>
  )
}
