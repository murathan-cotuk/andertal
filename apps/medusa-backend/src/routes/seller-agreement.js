'use strict'
const { Router } = require('express')

module.exports = function createSellerAgreementRouter({ verifySellerPassword, getProductsDbClient }) {
      const { getSellerAgreement, AGREEMENT_VERSION, DEFAULT_PLATFORM_NAME } = require('../seller-agreement-contract')

      const signPdfDeLatin = (s) => {
        if (s == null) return ''
        return String(s)
          .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
          .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
          .replace(/ß/g, 'ss')
          .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ç/g, 'C')
          .replace(/é/g, 'e').replace(/è/g, 'e').replace(/ê/g, 'e').replace(/ë/g, 'e')
          .replace(/à/g, 'a').replace(/â/g, 'a').replace(/á/g, 'a')
          .replace(/ù/g, 'u').replace(/û/g, 'u').replace(/ú/g, 'u')
          .replace(/ô/g, 'o').replace(/ò/g, 'o').replace(/ó/g, 'o')
          .replace(/î/g, 'i').replace(/ï/g, 'i').replace(/í/g, 'i')
          .replace(/ñ/g, 'n').replace(/ã/g, 'a').replace(/õ/g, 'o')
      }

      const buildAgreementPdf = async (seller, locale, signatureDataUrl, signedAt, signedIp, platformInfo) => {
        const PDFDocument = require('pdfkit')
        const agreement = getSellerAgreement(locale)
        const sections = agreement.sections
        const signedDate = signedAt ? new Date(signedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' }) : new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' })
        const pi = platformInfo || {}
        const platName = pi.legal_company_name || DEFAULT_PLATFORM_NAME
        const platRep = pi.legal_representative || ''
        const platAddr = [pi.legal_street, pi.legal_city].filter(Boolean).join(', ')
        const platReg = [pi.legal_trade_register, pi.legal_register_court ? `(${pi.legal_register_court})` : ''].filter(Boolean).join(' ')
        const platVat = pi.legal_vat_id || ''
        const platTax = pi.legal_tax_id || ''
        const platEmail = pi.legal_email || 'info@andertal.com'

        return new Promise((resolve, reject) => {
          try {
            const doc = new PDFDocument({ margin: 48, size: 'A4', compress: false, pdfVersion: '1.7' })
            const chunks = []
            doc.on('data', (c) => chunks.push(c))
            doc.on('end', () => resolve(Buffer.concat(chunks)))
            doc.on('error', reject)

            // Header
            doc.fontSize(18).font('Helvetica-Bold').fillColor('#111').text(
              signPdfDeLatin(agreement.title),
              { align: 'center' }
            )
            doc.moveDown(0.3)
            doc.fontSize(9).font('Helvetica').fillColor('#666').text(
              `${signPdfDeLatin(platName)} | ` + (locale === 'de' ? 'Unterzeichnetes Exemplar' : locale === 'tr' ? 'Imzali Kopya' : 'Signed Copy'),
              { align: 'center' }
            )
            doc.moveDown(0.2)
            doc.fontSize(8).font('Helvetica').fillColor('#888').text(
              signPdfDeLatin(`${agreement.governing_note} | Version ${agreement.version} | ${agreement.updated}`),
              { align: 'center' }
            )
            doc.moveDown(0.5)
            doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
            doc.moveDown(0.4)

            // Platform operator block
            const platOpLabel = locale === 'de' ? 'Plattformbetreiber' : locale === 'tr' ? 'Platform Isletmecisi' : 'Platform Operator'
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333').text(signPdfDeLatin(platOpLabel) + ':')
            doc.fontSize(8).font('Helvetica').fillColor('#555')
            doc.text(signPdfDeLatin(platName))
            if (platRep) doc.text(signPdfDeLatin((locale === 'de' ? 'Vertreten durch: ' : locale === 'tr' ? 'Temsilen: ' : 'Represented by: ') + platRep))
            if (platAddr) doc.text(signPdfDeLatin(platAddr))
            if (platReg) doc.text(signPdfDeLatin((locale === 'de' ? 'Handelsregister: ' : locale === 'tr' ? 'Ticaret Sicil: ' : 'Commercial Register: ') + platReg))
            if (platVat) doc.text(signPdfDeLatin((locale === 'de' ? 'USt-IdNr.: ' : locale === 'tr' ? 'KDV No: ' : 'VAT ID: ') + platVat))
            if (platTax) doc.text(signPdfDeLatin((locale === 'de' ? 'Steuernummer: ' : locale === 'tr' ? 'Vergi No: ' : 'Tax ID: ') + platTax))
            doc.text(signPdfDeLatin((locale === 'de' ? 'E-Mail: ' : 'Email: ') + platEmail))
            doc.moveDown(0.5)
            doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
            doc.moveDown(0.5)

            // Contract sections
            for (const sec of sections) {
              doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(signPdfDeLatin(sec.heading))
              doc.moveDown(0.15)
              doc.fontSize(9).font('Helvetica').fillColor('#333').text(signPdfDeLatin(sec.body), { lineGap: 2 })
              doc.moveDown(0.5)
            }

            doc.moveDown(0.5)
            doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
            doc.moveDown(0.5)

            // Seller signature block (left) + platform block (right)
            const sigLabel = locale === 'de' ? 'Unterschrift des Verkaeufers' : locale === 'tr' ? 'Satici Imzasi' : 'Seller Signature'
            const dateLabel = locale === 'de' ? 'Datum & Uhrzeit' : locale === 'tr' ? 'Tarih & Saat' : 'Date & Time'
            const ipLabel = locale === 'de' ? 'IP-Adresse' : locale === 'tr' ? 'IP Adresi' : 'IP Address'
            const nameLabel = locale === 'de' ? 'Name / Unternehmen' : locale === 'tr' ? 'Ad / Firma' : 'Name / Company'
            const usernameLabel = locale === 'de' ? 'Benutzername' : locale === 'tr' ? 'Kullanici Adi' : 'Username'

            doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(
              locale === 'de' ? 'Unterschriftsblock' : locale === 'tr' ? 'Imza Blogu' : 'Signature Block'
            )
            doc.moveDown(0.3)
            doc.fontSize(9).font('Helvetica').fillColor('#333')
            doc.text(`${dateLabel}: ${signPdfDeLatin(signedDate)}`)
            doc.text(`${ipLabel}: ${signPdfDeLatin(signedIp || '—')}`)
            doc.text(`${nameLabel}: ${signPdfDeLatin([seller.authorized_person_name, seller.company_name].filter(Boolean).join(' / ') || '—')}`)
            doc.text(`${usernameLabel}: ${signPdfDeLatin(seller.seller_name || seller.email || '—')}`)
            doc.moveDown(0.5)
            doc.text(`${sigLabel}:`)
            doc.moveDown(0.3)

            if (signatureDataUrl && signatureDataUrl.startsWith('data:image/png;base64,')) {
              const imgBuf = Buffer.from(signatureDataUrl.split(',')[1], 'base64')
              doc.image(imgBuf, { fit: [200, 80], align: 'left' })
              doc.moveDown(0.3)
            }

            doc.moveTo(48, doc.y).lineTo(248, doc.y).strokeColor('#999').lineWidth(0.5).stroke()
            doc.moveDown(0.2)
            doc.fontSize(8).fillColor('#666').text(signPdfDeLatin(`${seller.authorized_person_name || seller.seller_name || ''}, ${seller.company_name || ''}`), { width: 200 })

            // Platform representative block below signature
            doc.moveDown(0.8)
            const platSigLabel = locale === 'de' ? 'Plattformbetreiber (Andertal)' : locale === 'tr' ? 'Platform Isletmecisi (Andertal)' : 'Platform Operator (Andertal)'
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333').text(signPdfDeLatin(platSigLabel))
            doc.fontSize(8).font('Helvetica').fillColor('#555')
            doc.text(signPdfDeLatin(platName))
            if (platRep) doc.text(signPdfDeLatin(platRep))
            if (platAddr) doc.text(signPdfDeLatin(platAddr))
            if (platReg) doc.text(signPdfDeLatin(platReg))
            if (platVat) doc.text(signPdfDeLatin(platVat))

            doc.end()
          } catch (e) {
            reject(e)
          }
        })
      }

      // POST /admin-hub/v1/seller/sign-token — create a signing session token + QR code
  const router = Router()

  router.post('/admin-hub/v1/seller/sign-token', async (req, res) => {
        const sellerUser = req.sellerUser
        if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const crypto = require('crypto')
          const QRCode = require('qrcode')
          const { Client } = require('pg')
          const token = crypto.randomBytes(32).toString('hex')
          const locale = String(req.body?.locale || sellerUser.locale || 'de').slice(0, 10)
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          await client.query(
            `INSERT INTO seller_sign_tokens (token, seller_id, locale, ip) VALUES ($1, $2, $3, $4)`,
            [token, String(sellerUser.id), locale, req.ip || null]
          )
          await client.end()
          const sellercentralUrl = (process.env.NEXT_PUBLIC_SELLERCENTRAL_URL || process.env.SELLERCENTRAL_PUBLIC_URL || 'https://sellercentral.andertal.com').replace(/\/$/, '')
          const signUrl = `${sellercentralUrl}/${locale}/sign/${token}`
          const qrDataUrl = await QRCode.toDataURL(signUrl, { width: 256, margin: 2 })
          res.json({ token, sign_url: signUrl, qr_data_url: qrDataUrl })
        } catch (e) {
          console.error('sign-token:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // GET /public/sign/:token — info endpoint, called from sellercentral sign page (no auth)
  router.get('/public/sign/:token', async (req, res) => {
        const token = String(req.params.token || '').trim()
        if (!token) return res.status(400).json({ message: 'Token required' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const tr = await client.query(
            `SELECT st.locale, st.used_at, st.expires_at, su.store_name, su.company_name, su.authorized_person_name
             FROM seller_sign_tokens st
             JOIN seller_users su ON su.id::text = st.seller_id
             WHERE st.token = $1`,
            [token]
          )
          await client.end()
          if (!tr.rows.length || new Date(tr.rows[0].expires_at) < new Date()) return res.status(404).json({ message: 'Token not found or expired' })
          const row = tr.rows[0]
          if (row.used_at) return res.status(410).json({ message: 'Already signed', signed: true })
          res.json({ valid: true, locale: row.locale, seller_name: row.store_name || null, company_name: row.company_name || null, authorized_person_name: row.authorized_person_name || null })
        } catch (e) {
          console.error('public-sign-get:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })


      // POST /seller/sign/:token/auth — validate seller credentials, return sign_session
  router.post('/seller/sign/:token/auth', async (req, res) => {
        const token = String(req.params.token || '').trim()
        const { email, password } = req.body || {}
        if (!token || !email || !password) return res.status(400).json({ message: 'Token, email and password required' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Service unavailable' })
        try {
          const { Client } = require('pg')
          const crypto = require('crypto')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const tr = await client.query(
            `SELECT st.seller_id, st.used_at, st.expires_at FROM seller_sign_tokens st WHERE st.token = $1`,
            [token]
          )
          if (!tr.rows.length || new Date(tr.rows[0].expires_at) < new Date()) {
            await client.end()
            return res.status(404).json({ message: 'Token not found or expired' })
          }
          if (tr.rows[0].used_at) {
            await client.end()
            return res.status(410).json({ message: 'Already signed' })
          }
          const sellerId = tr.rows[0].seller_id
          const sr = await client.query(
            `SELECT id, email, password_hash FROM seller_users WHERE id::text = $1 AND LOWER(TRIM(email)) = LOWER(TRIM($2))`,
            [sellerId, email]
          )
          if (!sr.rows.length || !verifySellerPassword(password, sr.rows[0].password_hash)) {
            await client.end()
            return res.status(401).json({ message: 'Invalid email or password' })
          }
          const signSession = crypto.randomBytes(32).toString('hex')
          await client.query(`UPDATE seller_sign_tokens SET sign_session = $1 WHERE token = $2`, [signSession, token])
          await client.end()
          res.json({ sign_session: signSession })
        } catch (e) {
          console.error('sign-auth:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // POST /seller/sign/:token/submit — save signature (requires sign_session)
  router.post('/seller/sign/:token/submit', async (req, res) => {
        const token = String(req.params.token || '').trim()
        const { sign_session, signature_data } = req.body || {}
        if (!token || !sign_session) return res.status(400).json({ message: 'Token and sign_session required' })
        if (!signature_data || typeof signature_data !== 'string' || !signature_data.startsWith('data:image/png;base64,')) {
          return res.status(400).json({ message: 'Valid signature_data (PNG base64 data URL) required' })
        }
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Service unavailable' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const tr = await client.query(
            `SELECT st.*, su.company_name, su.authorized_person_name, su.store_name, su.email
             FROM seller_sign_tokens st
             JOIN seller_users su ON su.id::text = st.seller_id
             WHERE st.token = $1 AND st.sign_session = $2 AND st.expires_at > now() AND st.used_at IS NULL`,
            [token, sign_session]
          )
          if (!tr.rows.length) {
            await client.end()
            return res.status(403).json({ message: 'Invalid session, token expired or already signed' })
          }
          const row = tr.rows[0]
          const signedAt = new Date()
          const signedIp = req.ip || null
          // Fetch platform legal info for PDF
          let platformInfo = {}
          try {
            const pc = getProductsDbClient()
            if (pc) {
              await pc.connect()
              const pr = await pc.query(
                `SELECT legal_company_name, legal_representative, legal_street, legal_city, legal_trade_register, legal_register_court, legal_vat_id, legal_tax_id, legal_email FROM admin_hub_seller_settings WHERE seller_id = 'default'`
              )
              await pc.end()
              platformInfo = pr.rows[0] || {}
            }
          } catch (_) {}
          const pdfBuf = await buildAgreementPdf(
            { company_name: row.company_name, authorized_person_name: row.authorized_person_name, seller_name: row.store_name, email: row.email },
            row.locale,
            signature_data,
            signedAt,
            signedIp,
            platformInfo
          )
          const pdfBase64 = 'data:application/pdf;base64,' + pdfBuf.toString('base64')
          await client.query(
            `UPDATE seller_users SET signature_data = $1, signature_at = $2, signature_ip = $3, agreement_pdf_url = $4,
              agreement_accepted = true, agreement_accepted_at = $2, agreement_version = $6, agreement_ip = $3
              WHERE id::text = $5`,
            [signature_data, signedAt, signedIp, pdfBase64, row.seller_id, AGREEMENT_VERSION]
          )
          await client.query(`UPDATE seller_sign_tokens SET used_at = $1, ip = $2 WHERE token = $3`, [signedAt, signedIp, token])
          await client.end()
          res.json({ success: true })
        } catch (e) {
          console.error('sign-submit:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // GET /admin-hub/v1/seller/sign-status — poll for signature completion
  router.get('/admin-hub/v1/seller/sign-status', async (req, res) => {
        const sellerUser = req.sellerUser
        if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const r = await client.query(`SELECT signature_at, agreement_pdf_url FROM seller_users WHERE id = $1`, [String(sellerUser.id)])
          await client.end()
          const row = r.rows[0] || {}
          res.json({ signed: !!row.signature_at, signature_at: row.signature_at || null, has_pdf: !!row.agreement_pdf_url })
        } catch (e) {
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // GET /admin-hub/v1/seller/agreement-pdf — download signed PDF (seller or superuser)
  router.get('/admin-hub/v1/seller/agreement-pdf', async (req, res) => {
        const sellerUser = req.sellerUser
        if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
        const targetSellerId = req.query.seller_id && sellerUser.is_superuser ? String(req.query.seller_id) : String(sellerUser.id)
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const r = await client.query(`SELECT agreement_pdf_url FROM seller_users WHERE id = $1`, [targetSellerId])
          await client.end()
          const pdfData = r.rows[0]?.agreement_pdf_url
          if (!pdfData) return res.status(404).json({ message: 'No signed agreement found' })
          if (pdfData.startsWith('data:application/pdf;base64,')) {
            const buf = Buffer.from(pdfData.split(',')[1], 'base64')
            res.set('Content-Type', 'application/pdf')
            res.set('Content-Disposition', 'attachment; filename="andertal-agreement.pdf"')
            return res.send(buf)
          }
          res.status(500).json({ message: 'Invalid PDF data' })
        } catch (e) {
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })


  router.get('/public/seller-agreement', (req, res) => {
    try {
      const locale = req.query.locale || req.headers['accept-language'] || 'de'
      const payload = getSellerAgreement(locale)
      res.set('Cache-Control', 'public, max-age=300')
      res.json(payload)
    } catch (e) {
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  return router
}
