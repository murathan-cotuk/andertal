/**
 * telegram_listener.js — İki yönlü Telegram ↔ Claude CLI köprüsü.
 *
 * Telegram botuna gelen mesajı, arka planda Claude Code CLI ile çalıştırır ve
 * çıktıyı tekrar Telegram'a gönderir.
 *
 * DIŞ BAĞIMLILIK YOK: Telegram API'si Node'un yerleşik fetch'i ile (long-polling)
 * kullanılır. (Üçüncü parti kütüphane = tedarik-zinciri riski, o yüzden yok.)
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  GÜVENLİK UYARISI (ÖNEMLİ — MUTLAKA OKU)
 * ────────────────────────────────────────────────────────────────────────────
 *  Bu köprü, Telegram'dan gelen metni `--permission-mode acceptEdits` ile (yani
 *  insan onayı olmadan) Read/Edit/Bash yetkileriyle çalıştırır. Pratikte bu,
 *  makinen ve kod tabanın üzerinde UZAKTAN KOD ÇALIŞTIRMA (RCE) demektir.
 *  Korumalar: sadece izin verilen Chat ID; token .env.local'den (gitignore'lu);
 *  mesaj kabuk yerine argüman dizisiyle geçer (shell injection yok); aynı anda
 *  tek iş + zaman aşımı. Yine de token/cihaz ele geçirilirse sistem tehlikededir.
 *  Sadece kendi güvendiğin makinede çalıştır.
 * ────────────────────────────────────────────────────────────────────────────
 */

const path = require('path')
const fs = require('fs')
const { randomUUID } = require('crypto')
const { spawn } = require('child_process')

require('dotenv').config({ path: path.join(__dirname, '.env.local') })
require('dotenv').config({ path: path.join(__dirname, '.env') })

// ── Aktivite logu ───────────────────────────────────────────────────────────
// Gelen mesaj, çalıştırılan komut ve dönen cevap hem konsola hem bu dosyaya
// yazılır. Canlı izlemek için başka bir terminalde:
//   Get-Content .\telegram_activity.log -Wait -Tail 30
const LOG_FILE = path.join(__dirname, 'telegram_activity.log')
function logLine(kind, text) {
  const ts = new Date().toLocaleString('tr-TR')
  const line = `[${ts}] ${kind}: ${String(text ?? '').replace(/\r?\n/g, ' ⏎ ')}`
  console.log(line)
  try { fs.appendFileSync(LOG_FILE, line + '\n') } catch (_) {}
}

// ── Konfigürasyon (hepsi .env.local'den) ──────────────────────────────────
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ALLOWED_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '').trim()
const CLAUDE_BIN = process.env.CLAUDE_BIN || (process.platform === 'win32' ? 'claude.cmd' : 'claude')
const WORKDIR = process.env.CLAUDE_WORKDIR || __dirname
const TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS || '3600000', 10) // 60 dk
const CHUNK_SIZE = 3800 // Telegram 4096 sınırının altında güvenli pay

if (!TOKEN) {
  console.error('[HATA] TELEGRAM_BOT_TOKEN tanımlı değil. .env.local dosyasına ekleyin.')
  process.exit(1)
}
if (!ALLOWED_CHAT_ID) {
  console.error('[HATA] TELEGRAM_CHAT_ID tanımlı değil. .env.local dosyasına ekleyin.')
  process.exit(1)
}

const API = `https://api.telegram.org/bot${TOKEN}`

// ── Telegram API çağrısı (fetch) ──────────────────────────────────────────
async function tgCall(method, params, timeoutMs = 65000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
      signal: controller.signal,
    })
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// ── Mesajı parçalara böl (Telegram 4096 sınırı) ───────────────────────────
function splitMessage(text, size = CHUNK_SIZE) {
  const out = []
  let remaining = String(text)
  while (remaining.length > size) {
    let cut = remaining.lastIndexOf('\n', size)
    if (cut < size * 0.5) cut = size // uygun satır sonu yoksa sert kes
    out.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut)
  }
  if (remaining.length) out.push(remaining)
  return out
}

// ── Güvenli gönderim: önce Markdown, hata olursa düz metin ─────────────────
async function sendSafe(chatId, text) {
  for (const chunk of splitMessage(text)) {
    try {
      const r = await tgCall('sendMessage', { chat_id: chatId, text: chunk, parse_mode: 'Markdown' })
      if (!r || r.ok !== true) {
        await tgCall('sendMessage', { chat_id: chatId, text: chunk }) // düz metin fallback
      }
    } catch (e) {
      try { await tgCall('sendMessage', { chat_id: chatId, text: chunk }) } catch (e2) {
        console.error('[HATA] Telegram gönderimi başarısız:', e2 && e2.message)
      }
    }
  }
}

// ── Sohbet hafızası (oturum devamlılığı) ───────────────────────────────────
// Bota KENDİNE AİT sabit bir oturum kimliği veriyoruz. Böylece her Telegram
// mesajı aynı sohbeti sürdürür (ikinci mesaj birinciyi hatırlar) ve senin
// IDE'deki interaktif Claude oturumundan izole kalır.
//   - İlk mesaj:  --session-id <uuid>   (oturumu oluşturur)
//   - Sonrakiler: --resume <uuid>       (aynı sohbeti sürdürür)
// Oturum kaybolursa otomatik yeni oturum açılır; /reset ile elle sıfırlanır.
const SESSION_FILE = path.join(__dirname, '.telegram_session')
let sessionId = null
let sessionExists = false // true ise oturum diskte var, --resume kullanılır

function loadSession() {
  try {
    const id = fs.readFileSync(SESSION_FILE, 'utf8').trim()
    if (id) { sessionId = id; sessionExists = true; return }
  } catch (_) {}
  sessionId = randomUUID()
  sessionExists = false
}
function persistSession() {
  try { fs.writeFileSync(SESSION_FILE, sessionId) } catch (_) {}
  sessionExists = true
}
function resetSession() {
  sessionId = randomUUID()
  sessionExists = false
  try { fs.unlinkSync(SESSION_FILE) } catch (_) {}
}

// ── Claude CLI'yi güvenli çalıştır (shell yok, argüman dizisi) ─────────────
// Claude'un yanıtını her zaman Türkçe ve sade vermesi için önek talimat.
const TR_PREAMBLE = 'Talimat: Yanıtını HER ZAMAN Türkçe ver. Yaptığın her adımı DETAYLI raporla: hangi dosyayı oluşturduğunu, kaç satır olduğunu, hangi satırları server.js\'ten sildiğini, commit hash\'ini, push edilip edilmediğini açıkça belirt. "Şunu yaptım, bunu yaptım, commit hash: xxx, push edildi." şeklinde konuşarak anlat. Ham log/stack-trace yapıştırma; hataları analiz edip özetle.\n\nKullanıcı mesajı:\n'

function runClaude(prompt) {
  return new Promise((resolve) => {
    const finalPrompt = TR_PREAMBLE + prompt
    // Oturum bağımlılığı: mevcutsa sürdür, değilse sabit id ile oluştur.
    const sessionArgs = sessionExists ? ['--resume', sessionId] : ['--session-id', sessionId]
    const args = ['-p', finalPrompt, ...sessionArgs, '--allowedTools', 'Read,Edit,Bash', '--permission-mode', 'acceptEdits']
    let stdout = ''
    let stderr = ''
    let finished = false
    let child
    try {
      child = spawn(CLAUDE_BIN, args, { cwd: WORKDIR, shell: false })
    } catch (e) {
      resolve({ ok: false, output: `Claude başlatılamadı: ${e && e.message}` })
      return
    }
    const timer = setTimeout(() => {
      if (finished) return
      finished = true
      try { child.kill('SIGKILL') } catch (_) {}
      resolve({ ok: false, output: `Zaman aşımı (${Math.round(TIMEOUT_MS / 1000)} sn). İşlem durduruldu.` })
    }, TIMEOUT_MS)
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (e) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve({ ok: false, output: `Çalıştırma hatası: ${e && e.message}. CLAUDE_BIN doğru mu? (şu an: ${CLAUDE_BIN})` })
    })
    child.on('close', (code) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n\n') || '(boş çıktı)'
      if (code === 0 && !sessionExists) persistSession() // ilk başarılı mesajda oturumu kaydet
      resolve({ ok: code === 0, code, output })
    })
  })
}

// ── Sıralı iş kuyruğu (aynı anda tek Claude işi) ───────────────────────────
let busy = false
const queue = []

async function processQueue() {
  if (busy) return
  const job = queue.shift()
  if (!job) return
  busy = true
  try {
    logLine('KOMUT ÇALIŞIYOR', job.prompt)
    await sendSafe(job.chatId, '⏳ İşleniyor...')
    let res = await runClaude(job.prompt)
    // Oturum kaybolmuşsa (disk temizlenmiş vb.) otomatik yeni oturum aç ve tekrar dene.
    if (!res.ok && sessionExists && /no conversation|session|resume|not found|bulunamad/i.test(res.output || '')) {
      logLine('OTURUM SIFIRLANDI', 'önceki oturum bulunamadı, yeni sohbet başlatılıyor')
      resetSession()
      res = await runClaude(job.prompt)
    }
    const header = res.ok ? '✅ Tamamlandı\n\n' : `⚠️ Hata (çıkış kodu: ${res.code ?? 'yok'})\n\n`
    logLine(res.ok ? 'CEVAP' : 'CEVAP (hata)', res.output)
    await sendSafe(job.chatId, header + res.output)
  } catch (e) {
    logLine('BEKLENMEYEN HATA', e && e.message)
    await sendSafe(job.chatId, `⚠️ Beklenmeyen hata: ${e && e.message}`)
  } finally {
    busy = false
    if (queue.length) processQueue()
  }
}

// ── Bir güncellemeyi işle ──────────────────────────────────────────────────
function handleUpdate(update) {
  const msg = update && update.message
  if (!msg) return
  const fromChatId = String(msg.chat && msg.chat.id)
  const fromUserId = String(msg.from && msg.from.id)

  // Güvenlik: sadece izin verilen Chat ID
  if (fromChatId !== ALLOWED_CHAT_ID) {
    logLine('REDDEDİLDİ (yetkisiz)', `chat_id=${fromChatId} user_id=${fromUserId}`)
    return
  }
  if (msg.from && msg.from.is_bot) return

  const text = (msg.text || '').trim()
  if (text) logLine('GELEN MESAJ', text)
  if (!text) { sendSafe(fromChatId, 'Sadece metin komutları destekleniyor.'); return }
  if (text === '/start' || text === '/help') {
    sendSafe(fromChatId, 'Andertal ↔ Claude köprüsü aktif.\nMesajını yaz; Claude sohbeti hatırlar (önceki mesajlarınla bağlantılı devam eder).\n\nKomutlar:\n/reset — hafızayı sıfırla, yeni sohbet başlat\n/help — bu yardım')
    return
  }
  if (text === '/reset' || text === '/yeni' || text === '/new') {
    resetSession()
    logLine('OTURUM SIFIRLANDI', 'kullanıcı /reset ile sıfırladı')
    sendSafe(fromChatId, '🧹 Hafıza sıfırlandı. Yeni bir sohbet başladı — bundan sonraki mesajlar sıfırdan başlar.')
    return
  }

  const position = queue.length + (busy ? 1 : 0)
  queue.push({ chatId: fromChatId, prompt: text })
  if (position > 0) sendSafe(fromChatId, `Sıraya alındı (önünde ${position} iş var).`)
  processQueue()
}

// ── Long-polling döngüsü ───────────────────────────────────────────────────
let offset = 0
let running = true

async function pollLoop() {
  loadSession()
  logLine('BAŞLATILDI', `Chat ID: ${ALLOWED_CHAT_ID} | Oturum: ${sessionId} (${sessionExists ? 'sürdürülüyor' : 'yeni'})`)
  await sendSafe(ALLOWED_CHAT_ID, '🤖 Andertal ↔ Claude köprüsü başlatıldı. Komutlarını bekliyorum.')

  while (running) {
    try {
      const r = await tgCall('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] })
      if (r && r.ok && Array.isArray(r.result)) {
        for (const update of r.result) {
          offset = update.update_id + 1
          try { handleUpdate(update) } catch (e) { console.error('[handleUpdate]', e && e.message) }
        }
      } else if (r && r.ok === false) {
        console.error('[getUpdates] API hata:', r.description)
        await new Promise((res) => setTimeout(res, 3000))
      }
    } catch (e) {
      // Abort/ağ hatası — kısa bekleyip tekrar dene
      if (e && e.name !== 'AbortError') console.error('[pollLoop]', e && e.message)
      await new Promise((res) => setTimeout(res, 2000))
    }
  }
}

process.on('SIGINT', () => { running = false; console.log('\nDurduruluyor...'); process.exit(0) })
process.on('SIGTERM', () => { running = false; process.exit(0) })

pollLoop()
