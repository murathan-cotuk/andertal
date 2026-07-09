'use client'

const BASE = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000') + '/developer-api/v1'

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('dev_token')
}

export function saveToken(token) {
  localStorage.setItem('dev_token', token)
}

export function clearToken() {
  localStorage.removeItem('dev_token')
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

  listApps: () => apiFetch('/apps'),
  createApp: (data) => apiFetch('/apps', { method: 'POST', body: JSON.stringify(data) }),
  getApp: (id) => apiFetch(`/apps/${id}`),
  updateApp: (id, data) => apiFetch(`/apps/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  rotateSecret: (id) => apiFetch(`/apps/${id}/rotate-secret`, { method: 'POST' }),
  submitApp: (id, changelog) => apiFetch(`/apps/${id}/submit`, { method: 'POST', body: JSON.stringify({ changelog }) }),
}
