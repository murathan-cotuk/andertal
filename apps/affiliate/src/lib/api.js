'use client'

// Same convention as apps/shop and apps/sellercentral: fall back to the real production
// backend, not localhost — this app is public-facing, and a missing/not-yet-rebuilt
// NEXT_PUBLIC_MEDUSA_BACKEND_URL in production used to make every fetch here try
// http://localhost:9000 from the VISITOR's own browser (ERR_CONNECTION_REFUSED).
const DEFAULT_PUBLIC_MEDUSA_URL = 'https://api.andertal.com'
const BASE = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_PUBLIC_MEDUSA_URL).replace(/\/$/, '') + '/affiliate-api/v1'

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('aff_token')
}

export function saveToken(token) {
  localStorage.setItem('aff_token', token)
}

export function clearToken() {
  localStorage.removeItem('aff_token')
}

export async function apiFetch(path, opts = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(BASE + path, { ...opts, headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.message || 'Error'), { status: res.status, body: json })
  return json
}

export const api = {
  login: (email, password) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (data) => apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  me: () => apiFetch('/auth/me'),

  dashboard: () => apiFetch('/dashboard'),
  listLinks: () => apiFetch('/links'),
  createLink: (data) => apiFetch('/links', { method: 'POST', body: JSON.stringify(data) }),
  listCommissions: (status) => apiFetch(`/commissions${status ? `?status=${encodeURIComponent(status)}` : ''}`),

  listReferrals: () => apiFetch('/referrals'),
  listPayouts: () => apiFetch('/payouts'),

  stripeConnectOnboard: () => apiFetch('/stripe-connect/onboard', { method: 'POST' }),
  stripeConnectStatus: () => apiFetch('/stripe-connect/status'),
  stripeConnectDashboardLink: () => apiFetch('/stripe-connect/dashboard-link'),
}
