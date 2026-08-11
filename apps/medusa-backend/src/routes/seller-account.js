'use strict'
const { Router } = require('express')
const { z } = require('zod')

function validate(schema, body, res) {
  const result = schema.safeParse(body)
  if (!result.success) {
    const first = result.error.errors[0]
    const msg = first ? `${first.path.join('.') || 'field'}: ${first.message}` : 'Invalid input'
    res.status(400).json({ message: msg })
    return null
  }
  return result.data
}

const zPassword = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

const validateSepaIbanChecksum = (raw) => {
  const iban = String(raw || '').replace(/\s/g, '').toUpperCase()
  if (!iban) return { ok: false, message: 'IBAN erforderlich' }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return { ok: false, message: 'Ungültiges IBAN-Format' }
  if (iban.length < 15 || iban.length > 34) return { ok: false, message: 'IBAN-Länge ungültig' }
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let expanded = ''
  for (let i = 0; i < rearranged.length; i++) {
    const c = rearranged[i]
    if (c >= 'A' && c <= 'Z') expanded += String(c.charCodeAt(0) - 55)
    else expanded += c
  }
  let rem = 0
  for (let i = 0; i < expanded.length; i++) {
    const d = expanded.charCodeAt(i) - 48
    if (d < 0 || d > 9) return { ok: false, message: 'Ungültiges IBAN-Format' }
    rem = (rem * 10 + d) % 97
  }
  if (rem !== 1) return { ok: false, message: 'IBAN-Prüfziffer ungültig' }
  return { ok: true, iban }
}

module.exports = function createSellerAccountRouter({
  getSellerDbClient,
  loadPlatformCheckoutRow,
  resolveStripeSecretKeyFromPlatform,
  verifySellerPassword,
  hashSellerPassword,
  getSmtpTransport,
}) {
    const adminHubSellerIbanPATCH = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const sellerEmail = req.sellerUser?.email
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { iban, payment_account_holder, payment_bic, payment_bank_name } = req.body || {}
        const cleanIban = (iban || '').replace(/\s/g, '').toUpperCase() || null
        if (cleanIban) {
          const ichk = validateSepaIbanChecksum(cleanIban)
          if (!ichk.ok) {
            await client.end()
            return res.status(400).json({ message: ichk.message || 'Ungültige IBAN' })
          }
        }
        await client.query(
          `UPDATE seller_users SET iban = $1, payment_account_holder = $2, payment_bic = $3, payment_bank_name = $4, updated_at = now() WHERE seller_id = $5`,
          [cleanIban, payment_account_holder || null, payment_bic || null, payment_bank_name || null, sellerId]
        )

        // Create/update Stripe Custom account for IBAN payouts. Kept in its own try/catch so a
        // Stripe-side rejection (e.g. missing KYC fields on the connected account, an implausible
        // account holder name) surfaces its real, actionable message to the seller — previously
        // any error here fell through to the generic catch below and came back as an opaque
        // "technical issue" 500 with nothing to act on (see seller_error_logs HTTP_500 entries
        // for PATCH /admin-hub/v1/seller/iban).
        if (cleanIban) {
          const platformRow = await loadPlatformCheckoutRow(client)
          const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
          if (secretKey) {
            try {
              const stripeInst = new (require('stripe'))(secretKey)
              const sellerRow = (await client.query('SELECT email, store_name, stripe_custom_account_id FROM seller_users WHERE seller_id = $1', [sellerId])).rows[0]
              let customAccountId = sellerRow?.stripe_custom_account_id

              if (!customAccountId) {
                const acct = await stripeInst.accounts.create({
                  type: 'custom',
                  country: 'DE',
                  email: sellerRow?.email || sellerEmail,
                  capabilities: { transfers: { requested: true } },
                  tos_acceptance: { service_agreement: 'full', date: Math.floor(Date.now() / 1000), ip: req.ip || '127.0.0.1' },
                })
                customAccountId = acct.id
                await client.query('UPDATE seller_users SET stripe_custom_account_id = $1 WHERE seller_id = $2', [customAccountId, sellerId])
              }

              // Replace external bank account with new IBAN
              try {
                const existing = await stripeInst.accounts.listExternalAccounts(customAccountId, { object: 'bank_account', limit: 10 })
                for (const ba of existing.data || []) {
                  await stripeInst.accounts.deleteExternalAccount(customAccountId, ba.id).catch(() => {})
                }
              } catch (_) {}
              await stripeInst.accounts.createExternalAccount(customAccountId, {
                external_account: {
                  object: 'bank_account',
                  country: 'DE',
                  currency: 'eur',
                  account_number: cleanIban,
                  account_holder_name: payment_account_holder || sellerRow?.store_name || 'Account Holder',
                  account_holder_type: 'individual',
                },
              })
            } catch (stripeErr) {
              await client.end()
              // IBAN + payment fields were already saved above — only the Stripe payout wiring
              // failed, so tell the seller specifically what Stripe rejected instead of a blanket 500.
              return res.status(400).json({
                message: `IBAN gespeichert, aber Stripe-Auszahlungskonto fehlgeschlagen: ${stripeErr?.message || 'Unbekannter Stripe-Fehler'}`,
              })
            }
          }
        }

        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/seller/profile — get own profile (iban, commission_rate, etc.)
    const adminHubSellerProfileGET = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query('SELECT id, email, store_name, seller_id, is_superuser, iban, commission_rate, created_at FROM seller_users WHERE seller_id = $1', [sellerId])
        await client.end()
        const user = r.rows[0]
        if (!user) return res.status(404).json({ message: 'User not found' })
        res.json({ user })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    /** GET /admin-hub/v1/seller/account — angezeigter Benutzer exakt die eingeloggte Zeile (inkl. Team-Mitglieder) */
    const adminHubSellerAccountGET = async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `SELECT id, email, store_name, seller_id, is_superuser, sub_of_seller_id, first_name, last_name,
                  approval_status, created_at, iban, payment_account_holder, payment_bic, payment_bank_name,
                  company_name, authorized_person_name, tax_id, vat_id,
                  business_address, phone, documents, rejection_reason, approved_at,
                  commission_rate, lucid_number, epr_document_url
           FROM seller_users WHERE id = $1`,
          [userId],
        )
        await client.end()
        const row = r.rows?.[0]
        if (!row) return res.status(404).json({ message: 'User not found' })
        res.json({
          sellerUser: {
            id: row.id,
            email: row.email,
            store_name: row.store_name,
            seller_id: row.seller_id,
            is_superuser: row.is_superuser === true,
            is_team_member: row.sub_of_seller_id != null && String(row.sub_of_seller_id).trim() !== '',
            approval_status: row.approval_status || 'registered',
            first_name: row.first_name,
            last_name: row.last_name,
            created_at: row.created_at,
            iban: row.iban,
            payment_account_holder: row.payment_account_holder,
            payment_bic: row.payment_bic,
            payment_bank_name: row.payment_bank_name,
            company_name: row.company_name,
            authorized_person_name: row.authorized_person_name,
            tax_id: row.tax_id,
            vat_id: row.vat_id,
            business_address: row.business_address,
            phone: row.phone,
            documents: row.documents,
            rejection_reason: row.rejection_reason,
            approved_at: row.approved_at,
            commission_rate: row.commission_rate != null ? parseFloat(row.commission_rate) : 0.12,
            lucid_number: row.lucid_number,
            epr_document_url: row.epr_document_url,
          },
          // legacy alias
          user: {
            id: row.id,
            email: row.email,
            store_name: row.store_name,
            seller_id: row.seller_id,
            is_superuser: row.is_superuser === true,
            is_team_member: row.sub_of_seller_id != null && String(row.sub_of_seller_id).trim() !== '',
            approval_status: row.approval_status || 'registered',
            first_name: row.first_name,
            last_name: row.last_name,
            created_at: row.created_at,
            commission_rate: row.commission_rate != null ? parseFloat(row.commission_rate) : 0.12,
          },
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const PasswordChangeSchema = z.object({
      current_password: z.string().min(1, 'Current password is required').max(256),
      new_password:     zPassword,
    })
    /** PATCH /admin-hub/v1/seller/password — eigenes Passwort (nur eingeloggter Benutzer) */
    const adminHubSellerPasswordPATCH = async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const parsed = validate(PasswordChangeSchema, req.body || {}, res)
      if (!parsed) return
      const cur = parsed.current_password
      const neu = parsed.new_password
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query('SELECT id, password_hash FROM seller_users WHERE id = $1', [userId])
        const row = r.rows?.[0]
        if (!row) {
          await client.end()
          return res.status(404).json({ message: 'Benutzer nicht gefunden.' })
        }
        if (!verifySellerPassword(cur, row.password_hash)) {
          await client.end()
          return res.status(400).json({ message: 'Das aktuelle Passwort ist nicht korrekt.' })
        }
        await client.query('UPDATE seller_users SET password_hash = $1, updated_at = now() WHERE id = $2', [
          hashSellerPassword(neu),
          userId,
        ])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }
    // POST /admin-hub/users/invite — invite a new seller sub-user
    const adminHubUsersInvitePOST = async (req, res) => {
      const inviterSellerId = req.sellerUser?.seller_id
      if (!inviterSellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { email, first_name, last_name, permissions } = req.body || {}
        if (!email) { await client.end(); return res.status(400).json({ message: 'Email required' }) }
        const normalEmail = email.trim().toLowerCase()
        // Check if already registered as a seller user
        const existing = await client.query('SELECT id, sub_of_seller_id FROM seller_users WHERE email = $1', [normalEmail])
        if (existing.rows.length) {
          const row = existing.rows[0]
          if (row.sub_of_seller_id && row.sub_of_seller_id !== inviterSellerId) {
            await client.end()
            return res.status(409).json({ message: 'Dieser Benutzer ist bereits einem anderen Verkäufer-Konto zugeordnet.' })
          }
          if (row.sub_of_seller_id === inviterSellerId) {
            await client.end()
            return res.status(409).json({ message: 'Dieser Benutzer ist bereits Mitglied Ihres Teams.' })
          }
          // User registered but not linked (sub_of_seller_id IS NULL) — directly link them
          await client.query(
            `UPDATE seller_users SET sub_of_seller_id = $1, updated_at = now() WHERE email = $2 AND sub_of_seller_id IS NULL`,
            [inviterSellerId, normalEmail]
          ).catch(() => {})
          await client.end()
          return res.json({ success: true, linked: true })
        }
        // Check if pending invite from a different seller already exists
        const pendingInv = await client.query(
          `SELECT id, invited_by_seller_id FROM seller_invitations WHERE email = $1 AND accepted_at IS NULL AND expires_at > now()`,
          [normalEmail]
        )
        if (pendingInv.rows.length && pendingInv.rows[0].invited_by_seller_id !== inviterSellerId) {
          await client.end()
          return res.status(409).json({ message: 'Für diese E-Mail gibt es bereits eine ausstehende Einladung von einem anderen Verkäufer.' })
        }
        // Create/replace invitation token (upsert for same seller re-invite)
        const token = require('crypto').randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        const permJson = permissions ? JSON.stringify(permissions) : null
        await client.query(
          `INSERT INTO seller_invitations (email, invited_by_seller_id, token, expires_at, first_name, last_name, permissions)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (email) DO UPDATE SET token = $3, expires_at = $4, accepted_at = NULL, first_name = $5, last_name = $6, permissions = $7::jsonb
           WHERE seller_invitations.invited_by_seller_id = $2`,
          [normalEmail, inviterSellerId, token, expiresAt, first_name || null, last_name || null, permJson]
        )
        await client.end()
        // Try to send invitation email
        const inviteUrl = `${process.env.NEXT_PUBLIC_SELLERCENTRAL_URL || 'http://localhost:3001'}/register?invite=${token}&email=${encodeURIComponent(normalEmail)}`
        try {
          const dbClient2 = getDbClient()
          if (dbClient2) {
            await dbClient2.connect()
            const transport = await getSmtpTransport(dbClient2)
            await dbClient2.end()
            if (transport) {
              const displayName = [first_name, last_name].filter(Boolean).join(' ')
              await transport.sendMail({
                to: normalEmail,
                subject: 'Einladung zur Andertal Seller Platform',
                text: `${displayName ? `Hallo ${displayName},\n\n` : ''}Sie wurden eingeladen, der Andertal Seller Platform beizutreten.\n\nRegistrierungslink: ${inviteUrl}\n\nDieser Link ist 7 Tage gültig.`,
                html: `<p>${displayName ? `Hallo <strong>${displayName}</strong>,` : ''}</p><p>Sie wurden eingeladen, der <strong>Andertal Seller Platform</strong> beizutreten.</p><p><a href="${inviteUrl}">Jetzt registrieren</a></p><p>Dieser Link ist 7 Tage gültig.</p>`
              })
            }
          }
        } catch (_) { /* email sending is best-effort */ }
        res.json({ success: true, invite_url: inviteUrl })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/subusers — list sub-users belonging to current seller
    const adminHubSubusersGET = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        // Auto-link: find users who registered with an invited email but weren't linked yet
        const pendingToLink = await client.query(
          `SELECT si.id AS invite_id, si.email, si.permissions, si.first_name, si.last_name
           FROM seller_invitations si
           JOIN seller_users su ON LOWER(su.email) = LOWER(si.email) AND su.sub_of_seller_id IS NULL
           WHERE si.invited_by_seller_id = $1 AND si.accepted_at IS NULL`,
          [sellerId]
        )
        for (const row of (pendingToLink.rows || [])) {
          await client.query(
            `UPDATE seller_users SET sub_of_seller_id = $1, permissions = COALESCE(permissions, $2::jsonb), updated_at = now() WHERE LOWER(email) = LOWER($3) AND sub_of_seller_id IS NULL`,
            [sellerId, row.permissions ? JSON.stringify(row.permissions) : null, row.email]
          ).catch(() => {})
          await client.query(
            `UPDATE seller_invitations SET accepted_at = now() WHERE id = $1`,
            [row.invite_id]
          ).catch(() => {})
        }
        // Sub-users: those whose sub_of_seller_id matches our seller_id
        const r = await client.query(
          `SELECT id, email, first_name, last_name, permissions, created_at FROM seller_users WHERE sub_of_seller_id = $1 ORDER BY created_at ASC`,
          [sellerId]
        )
        // Pending invitations (not yet accepted, no matching registered user)
        const inv = await client.query(
          `SELECT si.id, si.email, si.first_name, si.last_name, si.permissions, si.expires_at, si.created_at
           FROM seller_invitations si
           WHERE si.invited_by_seller_id = $1 AND si.accepted_at IS NULL AND si.expires_at > now()
           AND NOT EXISTS (SELECT 1 FROM seller_users su WHERE LOWER(su.email) = LOWER(si.email))
           ORDER BY si.created_at DESC`,
          [sellerId]
        )
        await client.end()
        res.json({ subusers: r.rows || [], pending_invites: inv.rows || [] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // PATCH /admin-hub/v1/subusers/:id — update sub-user permissions
    const adminHubSubuserUpdatePATCH = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { id } = req.params
      const { permissions } = req.body || {}
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        // Ensure the sub-user belongs to this seller
        const check = await client.query('SELECT id FROM seller_users WHERE id = $1 AND sub_of_seller_id = $2', [id, sellerId])
        if (!check.rows.length) { await client.end(); return res.status(404).json({ message: 'Benutzer nicht gefunden' }) }
        const r = await client.query(
          `UPDATE seller_users SET permissions = $1::jsonb, updated_at = now() WHERE id = $2 RETURNING id, email, first_name, last_name, permissions`,
          [permissions ? JSON.stringify(permissions) : null, id]
        )
        await client.end()
        res.json({ user: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // DELETE /admin-hub/v1/subusers/:id — delete sub-user
    const adminHubSubuserDeleteDELETE = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { id } = req.params
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const check = await client.query('SELECT id FROM seller_users WHERE id = $1 AND sub_of_seller_id = $2', [id, sellerId])
        if (!check.rows.length) { await client.end(); return res.status(404).json({ message: 'Benutzer nicht gefunden' }) }
        await client.query('DELETE FROM seller_users WHERE id = $1', [id])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // DELETE /admin-hub/v1/pending-invites/:id — cancel a pending invite
    const adminHubPendingInviteDeleteDELETE = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { id } = req.params
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await client.query('DELETE FROM seller_invitations WHERE id = $1 AND invited_by_seller_id = $2', [id, sellerId])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

  const router = Router()
  router.patch('/admin-hub/v1/seller/iban', adminHubSellerIbanPATCH)
  router.get('/admin-hub/v1/seller/account', adminHubSellerAccountGET)
  router.patch('/admin-hub/v1/seller/password', adminHubSellerPasswordPATCH)
  router.get('/admin-hub/v1/seller/profile', adminHubSellerProfileGET)
  router.post('/admin-hub/users/invite', adminHubUsersInvitePOST)
  router.get('/admin-hub/v1/subusers', adminHubSubusersGET)
  router.patch('/admin-hub/v1/subusers/:id', adminHubSubuserUpdatePATCH)
  router.delete('/admin-hub/v1/subusers/:id', adminHubSubuserDeleteDELETE)
  router.delete('/admin-hub/v1/pending-invites/:id', adminHubPendingInviteDeleteDELETE)

  return router
}
