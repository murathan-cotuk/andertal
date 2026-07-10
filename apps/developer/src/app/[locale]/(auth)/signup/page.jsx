'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { api, saveToken } from '../../../../lib/api'

const LOCALES = [
  { code: 'en', label: 'EN' }, { code: 'de', label: 'DE' }, { code: 'tr', label: 'TR' },
  { code: 'fr', label: 'FR' }, { code: 'it', label: 'IT' }, { code: 'es', label: 'ES' },
]

function LocaleSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0]

  function switchLocale(code) {
    const segments = pathname.split('/')
    segments[1] = code
    window.location.href = segments.join('/')
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: '#374151', fontSize: 13, fontWeight: 600 }}
      >
        {current.label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 80 }}>
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => switchLocale(l.code)}
              style={{ display: 'block', width: '100%', padding: '8px 14px', background: l.code === locale ? '#f3f4f6' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: l.code === locale ? 700 : 400, textAlign: 'left', color: '#111827' }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EyeOpen() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 0 1 1.563-3.029m5.858.908a3 3 0 1 1 4.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88 6.59 6.59m7.532 7.532 3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0 1 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 0 1-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

export default function SignupPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const locale = useLocale()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [country, setCountry] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof document === 'undefined') return
    let viewport = document.querySelector('meta[name="viewport"]')
    const previous = viewport?.getAttribute('content') || ''
    if (!viewport) {
      viewport = document.createElement('meta')
      viewport.setAttribute('name', 'viewport')
      document.head.appendChild(viewport)
    }
    viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')
    return () => { if (viewport && previous) viewport.setAttribute('content', previous) }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError(t('requiredFields')); return }
    if (!companyName) { setError(t('requiredCompany')); return }
    if (password.length < 8) { setError(t('passwordTooShort')); return }
    if (!agreed) { setError(t('mustAgree')); return }
    setLoading(true)
    try {
      const data = await api.signup({
        email: email.trim().toLowerCase(),
        password,
        company_name: companyName.trim(),
        country: country.trim().toUpperCase() || undefined,
        vat_number: vatNumber.trim() || undefined,
        dpa_accepted: true,
      })
      if (data?.token) {
        saveToken(data.token)
        setSuccess(true)
        setTimeout(() => router.push(`/${locale}/dashboard`), 1200)
      } else {
        setSuccess(true)
        setTimeout(() => router.push(`/${locale}/login`), 1800)
      }
    } catch (err) {
      setError(err?.message || t('signupError'))
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 15, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', overflowX: 'hidden', overflowY: 'auto', touchAction: 'pan-y', padding: '16px', boxSizing: 'border-box' }}>
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 100 }}><LocaleSwitcher /></div>
      <div style={{ width: '100%', maxWidth: 440, boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: '0.18em', color: '#111827' }}>ANDERTAL</span>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, fontWeight: 500, letterSpacing: '0.04em' }}>DEVELOPER PORTAL</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: 'clamp(20px, 5vw, 40px) clamp(16px, 4vw, 36px)', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>{t('signup')}</h1>
            <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>{t('signupSubtitle')}</p>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>{t('companyName')} *</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                autoFocus
                placeholder="Acme GmbH"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('email')} *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('password')} *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder={t('passwordHint')}
                  style={{ ...inputStyle, padding: '10px 44px 10px 14px' }}
                />
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); setShowPassword((v) => !v) }}
                  tabIndex={-1}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0, display: 'flex', alignItems: 'center', zIndex: 2, touchAction: 'manipulation' }}
                >
                  {showPassword ? <EyeOff /> : <EyeOpen />}
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>{t('country')}</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="DE"
                  maxLength={2}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t('vatNumber')}</label>
                <input
                  type="text"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="DE123456789"
                  style={inputStyle}
                />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14, color: '#374151', marginTop: 4 }}>
              <div style={{ position: 'relative', flexShrink: 0, marginTop: 1 }}>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  style={{ position: 'absolute', opacity: 0, width: 18, height: 18, cursor: 'pointer', margin: 0 }}
                />
                <div style={{
                  width: 18, height: 18, borderRadius: 4,
                  border: agreed ? 'none' : '1.5px solid #d1d5db',
                  background: agreed ? '#111827' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s, border 0.15s',
                }}>
                  {agreed && (
                    <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                      <path d="M1 4L4 7.5L10 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
              <span style={{ lineHeight: 1.5 }}>{t('agreeTerms')} *</span>
            </label>
            {error && (
              <div style={{ background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 8, padding: '12px 14px', color: '#991b1b', fontSize: 14 }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ background: '#d1fae5', border: '1px solid #10b981', borderRadius: 8, padding: '12px 14px', color: '#065f46', fontSize: 14 }}>
                {t('signupSuccess')}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !agreed}
              style={{ padding: '12px', background: loading || !agreed ? '#9ca3af' : '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: loading || !agreed ? 'not-allowed' : 'pointer' }}
            >
              {loading ? t('loading') : t('signup')}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#6b7280' }}>
            {t('alreadyHaveAccount')}{' '}
            <a href={`/${locale}/login`} style={{ color: '#111827', fontWeight: 600, textDecoration: 'none' }}>{t('login')}</a>
          </p>
        </div>
      </div>
    </div>
  )
}
