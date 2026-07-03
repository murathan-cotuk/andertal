/**
 * telegram_report.js — Periyodik sistem durum raporu (Telegram + errors sayfası).
 *
 * TASARIM: Varsayılan olarak HİÇ token harcamaz. Rapor tamamen kod içinde,
 * veritabanı sinyallerinden üretilir; analiz edilmiş, sade ve Türkçe olur.
 * Claude'lu (yapay zeka) özet İSTEĞE BAĞLIDIR: sadece REPORT_USE_CLAUDE=1 ise
 * ve o an gerçekten yeni hata varsa, minimal bir istekle çalışır.
 *
 * Ne yapar:
 *  1) DB'den gerçek sinyalleri toplar (açık hatalar, son 6 saat, sipariş/mesaj vb.).
 *  2) Bunları analiz edip Türkçe bir durum raporu üretir (0 token).
 *  3) Raporu Telegram'a gönderir.
 *  4) Raporu seller_error_logs tablosuna "HEALTH_REPORT" olarak yazar
 *     (Seller Central > sellers/errors sayfasında görünür; bilgi amaçlı, "resolved").
 *
 * Ortam değişkenleri:
 *  - .env.local (kök): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CLAUDE_BIN
 *  - apps/medusa-backend/.env.local: DATABASE_URL
 *  - REPORT_USE_CLAUDE=1 → yalnızca yeni hata varken kısa bir AI özeti ekler (token harcar).
 *  - REPORT_DEEP=1       → (yalnızca AI açıksa) Read/Bash ile repoyu da inceler (daha çok token).
 */

const path = require('path')
const { spawn } = require('child_process')

require('dotenv').config({ path: path.join(__dirname, '.env.local') })
require('dotenv').config({ path: path.join(__dirname, 'apps', 'medusa-backend', '.env.local') })
require('dotenv').config({ path: path.join(__dirname, '.env') })

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '').trim()
const DB_URL = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
const CLAUDE_BIN = process.env.CLAUDE_BIN || (process.platform === 'win32' ? 'claude.cmd' : 'claude')
const WORKDIR = process.env.CLAUDE_WORKDIR || __dirname
const USE_CLAUDE = process.env.REPORT_USE_CLAUDE === '1'
const DEEP = process.env.REPORT_DEEP === '1'
const CLAUDE_TIMEOUT_MS = parseInt(process.env.REPORT_CLAUDE_TIMEOUT_MS || '120000', 10)
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null

// Rapor kendi kayıtlarını "hata" saymasın diye hariç tutulan kodlar.
const EXCLUDE = `error_code <> 'HEALTH_REPORT'`

// ── Telegram gönderimi (dış bağımlılık yok) ────────────────────────────────
async function tgSend(text) {
  if (!API || !CHAT_ID) { console.error('[HATA] Telegram TOKEN/CHAT_ID eksik.'); return }
  const size = 3800
  let remaining = String(text)
  const chunks = []
  while (remaining.length > size) {
    let cut = remaining.lastIndexOf('\n', size)
    if (cut < size * 0.5) cut = size
    chunks.push(remaining.slice(0, cut)); remaining = remaining.slice(cut)
  }
  if (remaining.length) chunks.push(remaining)
  for (const chunk of chunks) {
    try {
      const r = await fetch(`${API}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: chunk, parse_mode: 'Markdown' }),
      })
      const j = await r.json()
      if (!j || j.ok !== true) {
        await fetch(`${API}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: CHAT_ID, text: chunk }),
        })
      }
    } catch (e) { console.error('[HATA] Telegram:', e && e.message) }
  }
}

// ── DB sinyallerini topla (her sorgu hataya dayanıklı) ─────────────────────
async function collectSignals() {
  const signals = { ok: true, generatedAt: new Date().toISOString(), db: false }
  if (!DB_URL) { signals.ok = false; signals.dbError = 'DATABASE_URL yok'; return signals }
  const { Client } = require('pg')
  const client = new Client({ connectionString: DB_URL, ssl: DB_URL.includes('render.com') ? { rejectUnauthorized: false } : false })
  const safe = async (label, sql, params = []) => {
    try { const r = await client.query(sql, params); return r.rows } catch (e) { signals[label + '_error'] = e.message; return null }
  }
  try {
    await client.connect()
    signals.db = true

    const openCount = await safe('openCount', `SELECT COUNT(*)::int c FROM seller_error_logs WHERE status = 'open' AND ${EXCLUDE}`)
    signals.openErrors = openCount ? openCount[0].c : null

    const last6h = await safe('last6h', `SELECT COUNT(*)::int c FROM seller_error_logs WHERE created_at > now() - interval '6 hours' AND ${EXCLUDE}`)
    signals.errorsLast6h = last6h ? last6h[0].c : null

    const unread = await safe('unread', `SELECT COUNT(*)::int c FROM seller_error_logs WHERE is_read = false AND ${EXCLUDE}`)
    signals.unread = unread ? unread[0].c : null

    signals.recent = await safe('recent', `
      SELECT error_code, error_message, context, seller_id, status, created_at
      FROM seller_error_logs
      WHERE status <> 'resolved' AND ${EXCLUDE}
      ORDER BY created_at DESC LIMIT 8`)

    // Genel sağlık sinyalleri (tablo yoksa sessizce atlanır)
    const orders24 = await safe('orders24', `SELECT COUNT(*)::int c FROM store_orders WHERE created_at > now() - interval '24 hours'`)
    if (orders24) signals.orders24h = orders24[0].c
    const unreadMsgs = await safe('unreadMsgs', `SELECT COUNT(*)::int c FROM store_messages WHERE sender_type = 'customer' AND is_read_by_seller = false`)
    if (unreadMsgs) signals.unreadCustomerMsgs = unreadMsgs[0].c
    const activeProducts = await safe('activeProducts', `SELECT COUNT(*)::int c FROM admin_hub_products WHERE LOWER(TRIM(COALESCE(status,''))) IN ('published','active')`)
    if (activeProducts) signals.activeProducts = activeProducts[0].c
  } catch (e) {
    signals.ok = false; signals.dbError = e.message
  } finally {
    try { await client.end() } catch (_) {}
  }
  return signals
}

// ── Basit yorumlama (0 token): hata desenlerini tanı, öneri üret ───────────
function analyze(recent) {
  const out = { topCode: null, hints: [] }
  if (!Array.isArray(recent) || !recent.length) return out
  const byCode = {}
  let dbTrouble = false
  for (const r of recent) {
    const code = r.error_code || 'HATA'
    byCode[code] = (byCode[code] || 0) + 1
    const blob = `${r.error_code || ''} ${r.error_message || ''}`.toLowerCase()
    if (blob.includes('econnrefused') || blob.includes('5432') || blob.includes('unreachable') || blob.includes('backend')) dbTrouble = true
  }
  out.topCode = Object.entries(byCode).sort((a, b) => b[1] - a[1])[0]
  if (dbTrouble) out.hints.push('Backend/veritabanı bağlantı hataları görünüyor → önce API ve DB bağlantısını (NEXT_PUBLIC_MEDUSA_BACKEND_URL / DATABASE_URL) kontrol et.')
  return out
}

// ── Analiz edilmiş, sade Türkçe rapor (0 token) ────────────────────────────
function buildReport(s) {
  const lines = []
  if (!s.db) {
    lines.push('Durum: VERİTABANINA BAĞLANILAMADI.')
    lines.push(`Sebep: ${s.dbError || 'bilinmiyor'}`)
    lines.push('Öneri: DATABASE_URL ve veritabanı sunucusunun ayakta olup olmadığını kontrol et.')
    return lines.join('\n')
  }

  const open = s.openErrors || 0
  const new6h = s.errorsLast6h || 0
  const info = analyze(s.recent)

  // Genel durum cümlesi
  if (open === 0 && new6h === 0) {
    lines.push('Durum: Sistem sağlıklı görünüyor. Bekleyen hata yok.')
  } else if (new6h > 0) {
    lines.push(`Durum: Dikkat — son 6 saatte ${new6h} yeni hata oluştu (toplam ${open} açık).`)
  } else {
    lines.push(`Durum: ${open} açık hata var ama son 6 saatte yenisi yok.`)
  }

  // Öne çıkan öneri (varsa)
  if (info.hints.length) lines.push('Öneri: ' + info.hints[0])
  else if (info.topCode && info.topCode[1] > 1) lines.push(`Öneri: En sık tekrar eden hata "${info.topCode[0]}" (${info.topCode[1]} kez) — önce buna bak.`)

  // Özet metrikler
  lines.push('')
  lines.push('Özet:')
  lines.push(`• Açık hata: ${open}${new6h ? ` (son 6 saatte ${new6h} yeni)` : ''}`)
  if (s.unreadCustomerMsgs != null) lines.push(`• Yanıtlanmamış müşteri mesajı: ${s.unreadCustomerMsgs}`)
  if (s.orders24h != null) lines.push(`• Son 24 saatte sipariş: ${s.orders24h}`)
  if (s.activeProducts != null) lines.push(`• Yayında/aktif ürün: ${s.activeProducts}`)

  // Somut son hatalar (varsa, en fazla 5)
  if (Array.isArray(s.recent) && s.recent.length) {
    lines.push('')
    lines.push('Son hatalar:')
    for (const r of s.recent.slice(0, 5)) {
      const msg = String(r.error_message || '').replace(/\s+/g, ' ').slice(0, 110)
      const when = new Date(r.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      const who = r.seller_id && r.seller_id !== 'SYSTEM' ? ` — ${r.seller_id}` : ''
      lines.push(`• [${r.error_code || 'HATA'}] ${msg}${who} · ${when}`)
    }
  }
  return lines.join('\n')
}

// ── (Opsiyonel) Claude ile kısa AI özeti — sadece REPORT_USE_CLAUDE=1 ───────
function runClaude(prompt) {
  return new Promise((resolve) => {
    const tools = DEEP ? 'Read,Bash' : 'Read'
    const args = ['-p', prompt, '--allowedTools', tools, '--permission-mode', 'acceptEdits']
    let stdout = '', stderr = '', done = false, child
    try { child = spawn(CLAUDE_BIN, args, { cwd: WORKDIR, shell: false }) }
    catch (e) { return resolve({ ok: false, output: `Claude başlatılamadı: ${e.message}` }) }
    const timer = setTimeout(() => { if (done) return; done = true; try { child.kill('SIGKILL') } catch (_) {} ; resolve({ ok: false, output: 'zaman aşımı' }) }, CLAUDE_TIMEOUT_MS)
    child.stdout.on('data', d => stdout += d)
    child.stderr.on('data', d => stderr += d)
    child.on('error', e => { if (done) return; done = true; clearTimeout(timer); resolve({ ok: false, output: e.message }) })
    child.on('close', code => { if (done) return; done = true; clearTimeout(timer); resolve({ ok: code === 0, output: (stdout.trim() || stderr.trim()) }) })
  })
}

// ── Raporu errors sayfasına yaz (bilgi amaçlı: resolved + okunmuş) ──────────
async function storeReport(summary) {
  if (!DB_URL) return
  const { Client } = require('pg')
  const client = new Client({ connectionString: DB_URL, ssl: DB_URL.includes('render.com') ? { rejectUnauthorized: false } : false })
  try {
    await client.connect()
    await client.query(
      `INSERT INTO seller_error_logs (seller_id, error_code, error_message, terminal_output, context, status, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['SYSTEM', 'HEALTH_REPORT', summary.slice(0, 500), summary, 'periyodik-durum-raporu', 'resolved', true]
    )
  } catch (e) { console.error('[HATA] Rapor DB\'ye yazılamadı:', e.message) }
  finally { try { await client.end() } catch (_) {} }
}

// ── Ana akış ───────────────────────────────────────────────────────────────
;(async () => {
  const signals = await collectSignals()
  let body = buildReport(signals) // 0 token, her zaman üretilir

  // İsteğe bağlı AI özeti: sadece açıkça istenirse VE gerçekten yeni hata varsa.
  if (USE_CLAUDE && (signals.errorsLast6h || 0) > 0) {
    const prompt = [
      'Aşağıdaki sistem raporunu tek paragrafta, en fazla 3 cümlede, Türkçe ve sade özetle.',
      'Sadece en kritik noktayı ve önerilen ilk adımı söyle. Emoji ve ham log kullanma.',
      '',
      body,
    ].join('\n')
    const res = await runClaude(prompt)
    if (res.ok && res.output && res.output.length > 10) {
      body = `${res.output}\n\n— — —\n${body}`
    }
    // AI başarısız olursa sessizce kod-üretimi rapora devam (uyarı basmıyoruz).
  }

  const header = `*Sistem Durum Raporu*\n${new Date().toLocaleString('tr-TR')}\n\n`
  await tgSend(header + body)
  await storeReport(body)
  console.log('Rapor gönderildi ve kaydedildi.')
  process.exit(0)
})().catch(e => { console.error('Rapor hatası:', e); process.exit(1) })
