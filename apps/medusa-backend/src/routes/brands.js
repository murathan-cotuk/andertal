'use strict'
const { Router } = require('express')
const { getCategoriesPgClient } = require('../categories-helpers')

const slugifyTitle = (str) => {
  if (!str || typeof str !== 'string') return ''
  const map = { ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ı: 'i', I: 'i', İ: 'i', ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ä: 'ae', Ä: 'ae', ß: 'ss' }
  let s = str.trim()
  for (const [from, to] of Object.entries(map)) s = s.split(from).join(to)
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const requireSuperuser = (req, res, next) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  next()
}

// ── Brands ───────────────────────────────────────────────────────────────────

const BRAND_SELECT_COLS = 'id, name, handle, logo_image, banner_image, address, seller_id, status, brand_type, trademark_number, trademark_jurisdiction, approved_at, approved_by, rejection_reason, verification_level, metadata, created_at'

const AUTH_DOC_TYPES = [
  'trademark_certificate',
  'trademark_image',
  'product_packaging',
  'authorization_letter',
  'distribution_agreement',
  'purchase_invoice',
]

const mapBrandRow = (row) => {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : null
  const verification = metadata && metadata.verification && typeof metadata.verification === 'object'
    ? metadata.verification
    : null
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    logo_image: row.logo_image || null,
    banner_image: row.banner_image || null,
    address: row.address || null,
    seller_id: row.seller_id || null,
    status: row.status || 'active',
    brand_type: row.brand_type || 'own',
    trademark_number: row.trademark_number || null,
    trademark_jurisdiction: row.trademark_jurisdiction || null,
    approved_at: row.approved_at || null,
    approved_by: row.approved_by || null,
    rejection_reason: row.rejection_reason || null,
    verification_level: row.verification_level || null,
    verification,
    created_at: row.created_at,
  }
}

function isBrandVerified(brand) {
  return brand?.verification_level === 'verified' || brand?.verification_level === 'reseller'
}

function isBrandVerifyInFlight(brand) {
  return brand?.status === 'pending' || brand?.verification_level === 'pending_review'
}

// A brand name just became officially registered/authorized (own_registered or
// authorized_reseller, approved). Any OTHER seller still claiming the exact same
// brand name under an unverified 'own' claim loses that right from this point on:
// their claim is superseded and anything they listed under it goes to draft, since
// the name is now a protected registered brand. Runs on the same client/transaction
// as the approval so it never fires without the approval actually having committed.
async function supersedeUnverifiedSameNameBrands(client, { brandId, brandName, reviewerId }) {
  const others = await client.query(
    `SELECT id, seller_id FROM admin_hub_brands
     WHERE id <> $1 AND lower(trim(name)) = lower(trim($2)) AND brand_type = 'own' AND status = 'active'`,
    [brandId, brandName]
  )
  for (const other of others.rows || []) {
    await client.query(
      `UPDATE admin_hub_brands SET status = 'superseded', verification_level = 'unverified',
         approved_by = $1, rejection_reason = $2, updated_at = now() WHERE id = $3`,
      [
        reviewerId,
        'Diese Marke wurde von einem anderen Verkäufer offiziell registriert/verifiziert. Ihr nicht verifizierter Markeneintrag ist nicht mehr gültig.',
        other.id,
      ]
    ).catch(() => {})
    await client.query(
      `UPDATE admin_hub_products SET status = 'draft', updated_at = now()
       WHERE seller_id = $1 AND metadata->>'brand_id' = $2`,
      [other.seller_id, other.id]
    ).catch(() => {})
    if (other.seller_id) {
      await client.query(
        `UPDATE admin_hub_seller_listings SET status = 'draft', updated_at = now()
         WHERE seller_id = $1 AND brand_id = $2`,
        [other.seller_id, other.id]
      ).catch(() => {})
      await client.query(
        `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
         VALUES ('brand_superseded', $1, $2, $3, $4)`,
        [
          'Marke wurde registriert',
          `Die Marke "${brandName}" wurde soeben von einem anderen Verkäufer offiziell registriert/verifiziert. Ihr nicht verifizierter Markeneintrag wurde deaktiviert und betroffene Produkte auf Entwurf gesetzt. Bitte reichen Sie einen Nachweis (Vertriebsberechtigung/Rechnung) ein, um weiter unter dieser Marke zu verkaufen.`,
          other.seller_id,
          other.id,
        ]
      ).catch(() => {})
    }
  }
}

const adminBrandsGET = async (req, res) => {
  const client = getCategoriesPgClient()
  if (!client) return res.status(500).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    const r = await client.query(`SELECT ${BRAND_SELECT_COLS} FROM admin_hub_brands ORDER BY name`)
    await client.end()
    res.json({ brands: (r.rows || []).map(mapBrandRow) })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Brands GET:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

const adminBrandsPOST = async (req, res) => {
  const body = req.body || {}
  const name = (body.name || '').trim()
  if (!name) return res.status(400).json({ message: 'name is required' })
  const baseHandle = slugifyTitle((body.handle || '').trim()) || slugifyTitle(name) || ('brand-' + Date.now())
  const logo_image = (body.logo_image || body.logo || '').trim() || null
  const banner_image = (body.banner_image || '').trim() || null
  const address = (body.address || '').trim() || null
  const callerSellerId = req.sellerUser?.seller_id || null
  const isSuperuser = req.sellerUser?.is_superuser === true
  // Brand type:
  //   'own'               → Satıcının tescilsiz markası. Anında active, verification_level='unverified'.
  //   'own_registered'    → Tescilli marka (EUIPO/WIPO/ulusal). trademark_number + sertifika zorunlu → pending.
  //   'authorized_reseller' → Başka markanın yetkili bayisi. Yetki belgesi zorunlu → pending.
  let brandType = String(body.brand_type || 'own').trim().toLowerCase()
  if (!['own', 'own_registered', 'authorized_reseller'].includes(brandType)) brandType = 'own'
  // own_registered requires trademark proof fields at creation time
  const trademarkNumber = (body.trademark_number || '').trim() || null
  const trademarkJurisdiction = (body.trademark_jurisdiction || '').trim() || null
  if (brandType === 'own_registered' && !isSuperuser) {
    if (!trademarkNumber) return res.status(400).json({ message: 'trademark_number is required for registered brand claims' })
    if (!trademarkJurisdiction) return res.status(400).json({ message: 'trademark_jurisdiction is required for registered brand claims (e.g. EUIPO, DE, TR)' })
  }
  const needsApproval = (brandType === 'own_registered' || brandType === 'authorized_reseller') && !isSuperuser
  const status = needsApproval ? 'pending' : 'active'
  // verification_level: own=unverified (no proof), needs-approval=null until reviewed, superuser=verified
  const verificationLevel = brandType === 'own' ? 'unverified' : (isSuperuser ? 'verified' : null)
  const client = getCategoriesPgClient()
  if (!client) return res.status(500).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    let handle = baseHandle
    for (let i = 0; i < 100; i++) {
      const ex = await client.query(
        'SELECT id FROM admin_hub_brands WHERE LOWER(TRIM(handle)) = LOWER(TRIM($1)) LIMIT 1',
        [handle]
      )
      if (!ex.rows || !ex.rows.length) break
      handle = `${baseHandle}-${i + 1}`
    }
    const r = await client.query(
      `INSERT INTO admin_hub_brands (name, handle, logo_image, banner_image, address, seller_id, status, brand_type, trademark_number, trademark_jurisdiction, approved_at, approved_by, verification_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING ${BRAND_SELECT_COLS}`,
      [
        name, handle, logo_image, banner_image, address, callerSellerId,
        status, brandType, trademarkNumber, trademarkJurisdiction,
        status === 'active' ? new Date() : null,
        status === 'active' && isSuperuser ? (req.sellerUser?.id || 'superuser') : null,
        verificationLevel,
      ]
    )
    const row = r.rows && r.rows[0]
    // Notify superuser when a brand claim needs review
    if (needsApproval && row) {
      const notifBody = brandType === 'own_registered'
        ? `Bir satıcı tescilli marka "${name}" (${trademarkJurisdiction || '?'}, no: ${trademarkNumber || '?'}) için onay bekliyor.`
        : `Bir satıcı "${name}" markası için yetkili bayi belgesi yükledi, onay bekliyor.`
      await client.query(
        `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
         VALUES ('brand_authorization_pending', $1, $2, $3, $4)`,
        [
          'Marka yetkilendirme bekliyor',
          notifBody,
          callerSellerId,
          row.id,
        ]
      ).catch(() => {})
    }
    await client.end()
    res.status(201).json({ brand: row ? mapBrandRow(row) : null })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Brands POST:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

// ── Brand authorization documents + superuser review ─────────────────────────

const brandAuthDocsPOST = async (req, res) => {
  const brandId = (req.params.id || '').trim()
  if (!brandId) return res.status(400).json({ message: 'brand id required' })
  const body = req.body || {}
  const fileUrl = (body.file_url || '').trim()
  if (!fileUrl) return res.status(400).json({ message: 'file_url is required' })
  let docType = String(body.document_type || '').trim().toLowerCase()
  if (!AUTH_DOC_TYPES.includes(docType)) docType = 'purchase_invoice'
  const fileName = (body.file_name || '').trim() || null
  const callerSellerId = req.sellerUser?.seller_id || null
  const isSuperuser = req.sellerUser?.is_superuser === true
  const client = getCategoriesPgClient()
  if (!client) return res.status(500).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    const brand = await client.query('SELECT id, seller_id, status FROM admin_hub_brands WHERE id = $1', [brandId])
    if (!brand.rows || !brand.rows[0]) { await client.end(); return res.status(404).json({ message: 'Brand not found' }) }
    const isOwner = callerSellerId && brand.rows[0].seller_id === callerSellerId
    if (!isSuperuser && !isOwner) { await client.end(); return res.status(403).json({ message: 'You can only upload documents for your own brand claim' }) }
    const r = await client.query(
      `INSERT INTO admin_hub_brand_authorization_documents (brand_id, seller_id, document_type, file_url, file_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, brand_id, seller_id, document_type, file_url, file_name, status, uploaded_at`,
      [brandId, callerSellerId, docType, fileUrl, fileName]
    )
    // Re-upload after rejection puts the claim back in the superuser review queue.
    if (brand.rows[0].status === 'rejected') {
      await client.query(`UPDATE admin_hub_brands SET status = 'pending', rejection_reason = NULL, updated_at = now() WHERE id = $1`, [brandId]).catch(() => {})
    }
    await client.end()
    res.status(201).json({ document: r.rows[0] })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Brand auth doc POST:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

const brandVerifyPOST = async (req, res) => {
  const brandId = (req.params.id || '').trim()
  if (!brandId) return res.status(400).json({ message: 'brand id required' })
  const body = req.body || {}
  const callerSellerId = req.sellerUser?.seller_id || null
  const isSuperuser = req.sellerUser?.is_superuser === true
  const reviewerId = req.sellerUser?.id || callerSellerId || 'superuser'

  let brandType = String(body.brand_type || 'own_registered').trim().toLowerCase()
  if (!['own_registered', 'authorized_reseller'].includes(brandType)) {
    return res.status(400).json({ message: 'brand_type must be own_registered or authorized_reseller' })
  }

  const trademarkNumber = (body.trademark_number || '').trim() || null
  const trademarkJurisdiction = (body.trademark_jurisdiction || '').trim() || null
  const trademarkStatus = String(body.trademark_status || 'registered').trim().toLowerCase()
  const trademarkOwnerName = (body.trademark_owner_name || '').trim() || null
  const ownershipRole = String(body.ownership_role || '').trim().toLowerCase() || (brandType === 'authorized_reseller' ? 'authorized_reseller' : 'owner')
  const website = (body.website || '').trim() || null
  const docs = Array.isArray(body.documents) ? body.documents : []

  if (brandType === 'own_registered') {
    if (!trademarkNumber) return res.status(400).json({ message: 'trademark_number is required' })
    if (!trademarkJurisdiction) return res.status(400).json({ message: 'trademark_jurisdiction is required' })
    if (!['registered', 'pending'].includes(trademarkStatus)) {
      return res.status(400).json({ message: 'trademark_status must be registered or pending' })
    }
    if (!trademarkOwnerName) return res.status(400).json({ message: 'trademark_owner_name is required' })
    if (!['owner', 'licensee', 'authorized_agent'].includes(ownershipRole)) {
      return res.status(400).json({ message: 'ownership_role must be owner, licensee, or authorized_agent' })
    }
  }

  const normalizedDocs = docs
    .map((d) => ({
      document_type: AUTH_DOC_TYPES.includes(String(d?.document_type || '').trim().toLowerCase())
        ? String(d.document_type).trim().toLowerCase()
        : null,
      file_url: String(d?.file_url || '').trim(),
      file_name: String(d?.file_name || '').trim() || null,
    }))
    .filter((d) => d.document_type && d.file_url)

  if (!isSuperuser) {
    const types = new Set(normalizedDocs.map((d) => d.document_type))
    if (brandType === 'own_registered') {
      if (!types.has('trademark_certificate')) {
        return res.status(400).json({ message: 'trademark_certificate is required' })
      }
      if (!types.has('product_packaging')) {
        return res.status(400).json({ message: 'product_packaging photo is required (brand permanently affixed)' })
      }
      if ((ownershipRole === 'licensee' || ownershipRole === 'authorized_agent') && !types.has('authorization_letter') && !types.has('distribution_agreement')) {
        return res.status(400).json({ message: 'authorization_letter or distribution_agreement is required when you are not the trademark owner' })
      }
    } else if (!types.has('authorization_letter') && !types.has('distribution_agreement')) {
      return res.status(400).json({ message: 'authorization_letter or distribution_agreement is required' })
    }
  }

  const client = getCategoriesPgClient()
  if (!client) return res.status(500).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    const existing = await client.query(`SELECT ${BRAND_SELECT_COLS} FROM admin_hub_brands WHERE id = $1`, [brandId])
    if (!existing.rows || !existing.rows[0]) {
      await client.end()
      return res.status(404).json({ message: 'Brand not found' })
    }
    const brand = existing.rows[0]
    const mapped = mapBrandRow(brand)
    const isOwner = callerSellerId && brand.seller_id === callerSellerId
    if (!isSuperuser && !isOwner) {
      await client.end()
      return res.status(403).json({ message: 'You can only verify brands you added' })
    }
    if (isBrandVerified(mapped)) {
      await client.end()
      return res.status(409).json({ message: 'Brand is already verified' })
    }
    if (isBrandVerifyInFlight(mapped) && !isSuperuser) {
      await client.end()
      return res.status(409).json({ message: 'Verification is already in review' })
    }

    const prevMeta = brand.metadata && typeof brand.metadata === 'object' ? brand.metadata : {}
    const metadata = {
      ...prevMeta,
      verification: {
        trademark_status: brandType === 'own_registered' ? trademarkStatus : null,
        trademark_owner_name: trademarkOwnerName,
        ownership_role: ownershipRole,
        website,
        submitted_at: new Date().toISOString(),
        submitted_by: callerSellerId || reviewerId,
      },
    }

    const instant = isSuperuser === true
    const wasLive = brand.status === 'active' || brand.status == null
    const nextStatus = instant ? 'active' : (wasLive ? 'active' : 'pending')
    const nextLevel = instant
      ? (brandType === 'authorized_reseller' ? 'reseller' : 'verified')
      : 'pending_review'

    await client.query(
      `UPDATE admin_hub_brands SET
         brand_type = $1,
         trademark_number = $2,
         trademark_jurisdiction = $3,
         status = $4,
         verification_level = $5,
         rejection_reason = NULL,
         approved_at = $6,
         approved_by = $7,
         metadata = $8::jsonb,
         updated_at = now()
       WHERE id = $9`,
      [
        brandType,
        trademarkNumber,
        trademarkJurisdiction,
        nextStatus,
        nextLevel,
        instant ? new Date() : null,
        instant ? reviewerId : null,
        JSON.stringify(metadata),
        brandId,
      ]
    )

    for (const d of normalizedDocs) {
      await client.query(
        `INSERT INTO admin_hub_brand_authorization_documents (brand_id, seller_id, document_type, file_url, file_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [brandId, callerSellerId, d.document_type, d.file_url, d.file_name]
      ).catch(() => {})
    }

    if (instant) {
      await client.query(
        `UPDATE admin_hub_brand_authorization_documents SET status = 'approved', reviewer_id = $1, reviewed_at = now() WHERE brand_id = $2 AND status = 'pending'`,
        [reviewerId, brandId]
      ).catch(() => {})
      await supersedeUnverifiedSameNameBrands(client, { brandId, brandName: brand.name, reviewerId }).catch((e) => {
        console.error('supersedeUnverifiedSameNameBrands:', e)
      })
      if (brand.seller_id) {
        await client.query(
          `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
           VALUES ('brand_authorization_reviewed', $1, $2, $3, $4)`,
          [
            'Marke verifiziert',
            `Ihre Marke "${brand.name}" wurde verifiziert.`,
            brand.seller_id,
            brandId,
          ]
        ).catch(() => {})
      }
    } else {
      const notifBody = brandType === 'own_registered'
        ? `Bir satıcı tescilli marka "${brand.name}" (${trademarkJurisdiction || '?'}, no: ${trademarkNumber || '?'}) için doğrulama gönderdi.`
        : `Bir satıcı "${brand.name}" markası için yetkili bayi doğrulaması gönderdi.`
      await client.query(
        `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
         VALUES ('brand_authorization_pending', $1, $2, $3, $4)`,
        ['Marka doğrulama bekliyor', notifBody, callerSellerId, brandId]
      ).catch(() => {})
    }

    const r = await client.query(`SELECT ${BRAND_SELECT_COLS} FROM admin_hub_brands WHERE id = $1`, [brandId])
    await client.end()
    res.json({ brand: r.rows && r.rows[0] ? mapBrandRow(r.rows[0]) : null, instant })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Brand verify POST:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

const brandPendingAuthorizationsGET = async (req, res) => {
  const client = getCategoriesPgClient()
  if (!client) return res.status(500).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    const brands = await client.query(
      `SELECT ${BRAND_SELECT_COLS} FROM admin_hub_brands
       WHERE status = 'pending' OR verification_level = 'pending_review'
       ORDER BY created_at DESC`
    )
    const ids = (brands.rows || []).map((b) => b.id)
    let docsByBrand = {}
    if (ids.length) {
      const docs = await client.query(
        `SELECT id, brand_id, seller_id, document_type, file_url, file_name, status, uploaded_at
         FROM admin_hub_brand_authorization_documents WHERE brand_id = ANY($1::uuid[]) ORDER BY uploaded_at DESC`,
        [ids]
      )
      for (const d of docs.rows || []) {
        if (!docsByBrand[d.brand_id]) docsByBrand[d.brand_id] = []
        docsByBrand[d.brand_id].push(d)
      }
    }
    const sellerIds = [...new Set((brands.rows || []).map((b) => b.seller_id).filter(Boolean))]
    let sellerNameById = {}
    if (sellerIds.length) {
      const sellerRows = await client.query(
        `SELECT s.seller_id, s.store_name AS settings_store_name, u.store_name AS user_store_name, u.company_name, u.email
         FROM seller_users u
         LEFT JOIN admin_hub_seller_settings s ON s.seller_id = u.seller_id
         WHERE u.seller_id = ANY($1::varchar[]) AND u.sub_of_seller_id IS NULL`,
        [sellerIds]
      ).catch(() => ({ rows: [] }))
      for (const r of sellerRows.rows || []) {
        sellerNameById[r.seller_id] = (r.settings_store_name && String(r.settings_store_name).trim()) || (r.user_store_name && String(r.user_store_name).trim()) || (r.company_name && String(r.company_name).trim()) || r.email || r.seller_id
      }
    }
    await client.end()
    res.json({
      brands: (brands.rows || []).map((b) => ({ ...mapBrandRow(b), documents: docsByBrand[b.id] || [], seller_name: sellerNameById[b.seller_id] || b.seller_id })),
    })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Brand pending authorizations GET:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

const brandAuthReview = async (req, res, approve) => {
  const brandId = (req.params.id || '').trim()
  if (!brandId) return res.status(400).json({ message: 'brand id required' })
  const body = req.body || {}
  const reviewerId = req.sellerUser?.id || 'superuser'
  const reason = (body.rejection_reason || body.reason || '').trim() || null
  const client = getCategoriesPgClient()
  if (!client) return res.status(500).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    const existing = await client.query('SELECT id, name, seller_id, brand_type FROM admin_hub_brands WHERE id = $1', [brandId])
    if (!existing.rows || !existing.rows[0]) { await client.end(); return res.status(404).json({ message: 'Brand not found' }) }
    const brand = existing.rows[0]
    if (approve) {
      const approvedVerificationLevel = brand.brand_type === 'authorized_reseller' ? 'reseller' : 'verified'
      await client.query(
        `UPDATE admin_hub_brands SET status = 'active', approved_at = now(), approved_by = $1, rejection_reason = NULL, verification_level = $2, updated_at = now() WHERE id = $3`,
        [reviewerId, approvedVerificationLevel, brandId]
      )
      await client.query(
        `UPDATE admin_hub_brand_authorization_documents SET status = 'approved', reviewer_id = $1, reviewed_at = now() WHERE brand_id = $2 AND status = 'pending'`,
        [reviewerId, brandId]
      ).catch(() => {})
      await supersedeUnverifiedSameNameBrands(client, { brandId, brandName: brand.name, reviewerId }).catch((e) => {
        console.error('supersedeUnverifiedSameNameBrands:', e)
      })
    } else {
      await client.query(
        `UPDATE admin_hub_brands SET status = 'rejected', rejection_reason = $1, approved_by = $2, verification_level = 'unverified', updated_at = now() WHERE id = $3`,
        [reason, reviewerId, brandId]
      )
      await client.query(
        `UPDATE admin_hub_brand_authorization_documents SET status = 'rejected', reviewer_id = $1, reviewer_note = $2, reviewed_at = now() WHERE brand_id = $3 AND status = 'pending'`,
        [reviewerId, reason, brandId]
      ).catch(() => {})
    }
    if (brand.seller_id) {
      await client.query(
        `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
         VALUES ('brand_authorization_reviewed', $1, $2, $3, $4)`,
        [
          approve ? 'Marke freigegeben' : 'Markenautorisierung abgelehnt',
          approve
            ? `Ihre Marke "${brand.name}" wurde freigegeben und kann jetzt für Produkte verwendet werden.`
            : `Ihre Markenautorisierung für "${brand.name}" wurde abgelehnt.${reason ? ` Grund: ${reason}` : ''}`,
          brand.seller_id,
          brandId,
        ]
      ).catch(() => {})
    }
    const r = await client.query(`SELECT ${BRAND_SELECT_COLS} FROM admin_hub_brands WHERE id = $1`, [brandId])
    await client.end()
    res.json({ brand: r.rows && r.rows[0] ? mapBrandRow(r.rows[0]) : null })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Brand auth review:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

const adminBrandsPatchDelete = async (req, res, isPatch) => {
  const id = (req.params.id || '').trim()
  if (!id) return res.status(400).json({ message: 'id required' })
  const isSuperuserReq = req.sellerUser?.is_superuser === true
  const callerSellerId = req.sellerUser?.seller_id || null
  const client = getCategoriesPgClient()
  if (!client) return res.status(500).json({ message: 'Database unavailable' })
  try {
    await client.connect()
    const existing = await client.query('SELECT id, seller_id FROM admin_hub_brands WHERE id = $1', [id])
    if (!existing.rows || !existing.rows[0]) {
      await client.end()
      return res.status(404).json({ message: 'Brand not found' })
    }
    const brandOwnerId = existing.rows[0].seller_id
    const isOwner = callerSellerId && brandOwnerId === callerSellerId
    // Delete is superuser-only, even for a seller's own brand — editing (logo/banner/address)
    // stays available to the owner, deletion does not (explicit user instruction).
    if (!isPatch && !isSuperuserReq) {
      await client.end()
      return res.status(403).json({ message: 'Only a superuser can delete brands' })
    }
    if (!isSuperuserReq && !isOwner) {
      await client.end()
      return res.status(403).json({ message: 'You can only edit your own brands' })
    }
    if (isPatch) {
      const body = req.body || {}
      const updates = []
      const params = []
      let n = 1
      if (isSuperuserReq) {
        const name = (body.name || '').trim()
        const handle = (body.handle || '').trim()
        if (name) { updates.push('name = $' + n); params.push(name); n++ }
        if (handle) { updates.push('handle = $' + n); params.push(handle); n++ }
      }
      const logo_image = body.logo_image !== undefined ? (typeof body.logo_image === 'string' ? body.logo_image.trim() : null) : undefined
      const banner_image = body.banner_image !== undefined ? (typeof body.banner_image === 'string' ? body.banner_image.trim() : null) : undefined
      const address = body.address !== undefined ? (typeof body.address === 'string' ? body.address.trim() : null) : undefined
      if (logo_image !== undefined) { updates.push('logo_image = $' + n); params.push(logo_image || null); n++ }
      if (banner_image !== undefined) { updates.push('banner_image = $' + n); params.push(banner_image || null); n++ }
      if (address !== undefined) { updates.push('address = $' + n); params.push(address || null); n++ }
      if (updates.length === 0) {
        const r = await client.query(`SELECT ${BRAND_SELECT_COLS} FROM admin_hub_brands WHERE id = $1`, [id])
        await client.end()
        return res.json({ brand: r.rows[0] ? mapBrandRow(r.rows[0]) : null })
      }
      updates.push('updated_at = now()')
      params.push(id)
      const r = await client.query(
        'UPDATE admin_hub_brands SET ' + updates.join(', ') + ' WHERE id = $' + n + ` RETURNING ${BRAND_SELECT_COLS}`,
        params
      )
      await client.end()
      if (!r.rows || !r.rows[0]) return res.status(404).json({ message: 'Brand not found' })
      res.json({ brand: mapBrandRow(r.rows[0]) })
    } else {
      const r = await client.query('DELETE FROM admin_hub_brands WHERE id = $1 RETURNING id', [id])
      await client.end()
      if (!r.rows || !r.rows[0]) return res.status(404).json({ message: 'Brand not found' })
      res.status(200).json({ deleted: true })
    }
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Brands PATCH/DELETE:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

// ── Banners ──────────────────────────────────────────────────────────────────

const getBannersDb = async () => {
  const client = getCategoriesPgClient()
  if (!client) return []
  try {
    await client.connect()
    const r = await client.query('SELECT id, title, subtitle, image_url, video_url, link_url, button_text, is_active, position, created_at FROM admin_hub_banners ORDER BY position ASC, created_at ASC')
    await client.end()
    return r.rows || []
  } catch (e) {
    try { await client.end() } catch (_) {}
    return []
  }
}

const adminBannersGET = async (req, res) => {
  res.json({ banners: await getBannersDb() })
}

const adminBannersPOST = async (req, res) => {
  const b = req.body || {}
  const title = (b.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Title is required' })
  const client = getCategoriesPgClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `INSERT INTO admin_hub_banners (title, subtitle, image_url, video_url, link_url, button_text, is_active, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, b.subtitle || null, b.image_url || null, b.video_url || null, b.link_url || null, b.button_text || null, b.is_active !== false, Number(b.position) || 0]
    )
    await client.end()
    res.status(201).json({ banner: r.rows[0] })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Banners POST:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

const adminBannersPUT = async (req, res) => {
  const { id } = req.params
  const b = req.body || {}
  const client = getCategoriesPgClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `UPDATE admin_hub_banners SET title=$1, subtitle=$2, image_url=$3, video_url=$4, link_url=$5, button_text=$6, is_active=$7, position=$8, updated_at=now() WHERE id=$9 RETURNING *`,
      [(b.title || '').trim() || null, b.subtitle || null, b.image_url || null, b.video_url || null, b.link_url || null, b.button_text || null, b.is_active !== false, Number(b.position) || 0, id]
    )
    await client.end()
    if (!r.rows[0]) return res.status(404).json({ message: 'Not found' })
    res.json({ banner: r.rows[0] })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Banners PUT:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

const adminBannersDELETE = async (req, res) => {
  const client = getCategoriesPgClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    await client.query('DELETE FROM admin_hub_banners WHERE id=$1', [req.params.id])
    await client.end()
    res.json({ ok: true })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('Banners DELETE:', e)
    res.status(500).json({ message: (e && e.message) || 'Internal server error' })
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

module.exports = function createBrandsRouter() {
  const router = Router()

  router.get('/admin-hub/brands', adminBrandsGET)
  // Superuser: pending brand authorization claims — MUST be before /:id patterns
  router.get('/admin-hub/brands/pending-authorizations', requireSuperuser, brandPendingAuthorizationsGET)
  router.post('/admin-hub/brands', adminBrandsPOST)
  router.post('/admin-hub/brands/:id/authorization-documents', brandAuthDocsPOST)
  router.post('/admin-hub/brands/:id/verify', brandVerifyPOST)
  router.post('/admin-hub/brands/:id/authorization/approve', requireSuperuser, (req, res) => brandAuthReview(req, res, true))
  router.post('/admin-hub/brands/:id/authorization/reject', requireSuperuser, (req, res) => brandAuthReview(req, res, false))
  router.patch('/admin-hub/brands/:id', (req, res) => adminBrandsPatchDelete(req, res, true))
  router.delete('/admin-hub/brands/:id', (req, res) => adminBrandsPatchDelete(req, res, false))

  router.get('/admin-hub/v1/banners', requireSuperuser, adminBannersGET)
  router.post('/admin-hub/v1/banners', requireSuperuser, adminBannersPOST)
  router.put('/admin-hub/v1/banners/:id', requireSuperuser, adminBannersPUT)
  router.delete('/admin-hub/v1/banners/:id', requireSuperuser, adminBannersDELETE)

  return router
}
