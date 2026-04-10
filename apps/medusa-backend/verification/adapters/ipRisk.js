/**
 * IP Risk Adapter — mock-ready.
 *
 * Supported providers: "mock" (default), "ipqualityscore", "ipinfo"
 *
 * Interface contract:
 *   checkIpRisk({ ip }) → { is_vpn: bool, is_proxy: bool, risk_level: 'low'|'medium'|'high', score_penalty: number }
 */

const PROVIDER = (process.env.IP_RISK_PROVIDER || 'mock').toLowerCase()
const IPQS_API_KEY = process.env.IPQUALITYSCORE_API_KEY || ''

// Known VPN/datacenter IP ranges (abbreviated — in production use a proper list or provider)
const DATACENTER_PREFIXES = ['104.21.', '172.67.', '162.158.', '198.41.', '103.21.']

function isLikelyDatacenter(ip) {
  if (!ip) return false
  return DATACENTER_PREFIXES.some((prefix) => ip.startsWith(prefix))
}

// ── Mock provider ─────────────────────────────────────────────────────────────
async function mockIpRisk({ ip }) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { is_vpn: false, is_proxy: false, risk_level: 'low', score_penalty: 0 }
  }
  const likely = isLikelyDatacenter(ip)
  return {
    is_vpn: likely,
    is_proxy: false,
    risk_level: likely ? 'medium' : 'low',
    score_penalty: likely ? 20 : 0,
  }
}

// ── IPQualityScore provider (ready to wire) ───────────────────────────────────
async function ipqsRisk({ ip }) {
  if (!IPQS_API_KEY) throw new Error('IPQUALITYSCORE_API_KEY not set')
  const url = `https://www.ipqualityscore.com/api/json/ip/${IPQS_API_KEY}/${encodeURIComponent(ip)}?strictness=1`
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) throw new Error(`IPQualityScore API error: ${res.status}`)
  const data = await res.json()
  const is_vpn = data.vpn || data.tor || false
  const is_proxy = data.proxy || false
  const fraud_score = data.fraud_score || 0
  const risk_level = fraud_score >= 75 ? 'high' : fraud_score >= 40 ? 'medium' : 'low'
  const score_penalty = is_vpn ? 20 : is_proxy ? 15 : fraud_score >= 75 ? 25 : 0
  return { is_vpn, is_proxy, risk_level, score_penalty, raw_fraud_score: fraud_score }
}

// ── Public interface ──────────────────────────────────────────────────────────
async function checkIpRisk(payload) {
  try {
    if (PROVIDER === 'ipqualityscore') return await ipqsRisk(payload)
    return await mockIpRisk(payload)
  } catch (err) {
    console.error('[ip-risk-adapter] error:', err.message)
    // Fail open — don't block on IP check failures
    return { is_vpn: false, is_proxy: false, risk_level: 'low', score_penalty: 0 }
  }
}

module.exports = { checkIpRisk }
