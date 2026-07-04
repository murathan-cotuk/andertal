'use strict'
const { Router } = require('express')

// Sends an email to every SUPERUSER_EMAILS address when a seller creates a new PPC campaign.
    // Sends an email to every SUPERUSER_EMAILS address when a seller creates a new PPC campaign.
    async function notifySuperusersNewCampaign({ campaignId, campaignName, sellerDisplayName, sellerId, budgetCents }) {
      if (!process.env.SMTP_HOST) return
      const superuserEmails = (process.env.SUPERUSER_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)
      if (!superuserEmails.length) return
      const nodemailer = require('nodemailer')
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
      const sellerCentralUrl = process.env.SELLER_CENTRAL_URL || 'https://andertal-sellercentral.vercel.app'
      const budgetEuro = ((parseInt(budgetCents, 10) || 0) / 100).toFixed(2)
      const subject = `Neue Werbekampagne von ${sellerDisplayName}: ${campaignName}`
      const html = `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1f2937">
  <div style="font-size:22px;font-weight:900;letter-spacing:0.14em;color:#111;margin-bottom:24px">ANDERTAL</div>
  <h2 style="font-size:17px;font-weight:700;margin:0 0 16px">Neue Werbekampagne eingereicht</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
    <tr><td style="padding:7px 0;color:#6b7280;width:140px">Verkäufer</td><td style="padding:7px 0;font-weight:500">${sellerDisplayName}</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">Kampagne</td><td style="padding:7px 0">${campaignName}</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">Tagesbudget</td><td style="padding:7px 0">${budgetEuro} €</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">Seller ID</td><td style="padding:7px 0;font-family:monospace;font-size:12px">${sellerId}</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">Eingegangen</td><td style="padding:7px 0">${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</td></tr>
  </table>
  <a href="${sellerCentralUrl}/de/marketing/campaigns/${campaignId}"
     style="display:inline-block;padding:11px 22px;background:#ff971c;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
    Kampagne öffnen →
  </a>
  <p style="margin-top:24px;font-size:12px;color:#9ca3af">Diese E-Mail wurde automatisch generiert.</p>
</div>`
      await transport.sendMail({
        from: process.env.SMTP_FROM || '"Andertal Sellercentral" <noreply@andertal.de>',
        to: superuserEmails.join(', '),
        subject,
        html,
        text: `Neue Werbekampagne eingereicht\n\nVerkäufer: ${sellerDisplayName}\nKampagne: ${campaignName}\nTagesbudget: ${budgetEuro} €\nSeller ID: ${sellerId}\n\nÖffnen: ${sellerCentralUrl}/de/marketing/campaigns/${campaignId}`,
      })
      console.log(`[notify] New campaign email sent to ${superuserEmails.join(', ')}`)
    }

module.exports = function createCampaignsRouter({
  requireSuperuser,
  loadPlatformCheckoutRow,
  resolveStripeSecretKeyFromPlatform,
  getAdminHubProductByIdOrHandleDb,
}) {
    // pgDbClient is also used below by the Seller Campaigns / Automation Rules / Marketing Accounts sections.
    const pgDbClient = () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    }

    // ── Seller Campaigns (Aktionen/Kampagnen) ─────────────────────────────────
    // Helper: get all product IDs covered by a campaign (products + group products)
    const resolveCampaignProductIds = async (c, campaign) => {
      const ids = new Set(Array.isArray(campaign.product_ids) ? campaign.product_ids.map(String) : [])
      const groupIds = Array.isArray(campaign.group_ids) ? campaign.group_ids : []
      if (groupIds.length > 0) {
        for (const gid of groupIds) {
          const gr = await c.query(`SELECT product_ids FROM seller_product_groups WHERE id=$1`, [gid]).catch(() => ({ rows: [] }))
          const gProds = Array.isArray(gr.rows[0]?.product_ids) ? gr.rows[0].product_ids : []
          gProds.forEach((id) => ids.add(String(id)))
        }
      }
      return [...ids]
    }

  const router = Router()

  router.get('/admin-hub/v1/campaigns', async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      const c = pgDbClient(); try {
        await c.connect()
        const r = isSuperuser
          ? await c.query(`SELECT * FROM seller_campaigns ORDER BY created_at DESC`)
          : await c.query(`SELECT * FROM seller_campaigns WHERE seller_id=$1 ORDER BY created_at DESC`, [sellerId])
        await c.end(); res.json({ campaigns: r.rows })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

  router.post('/admin-hub/v1/campaigns', async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(403).json({ message: 'Seller ID required' })
      const { name, description, status, start_at, end_at, discount_type, discount_value, target_type, product_ids, group_ids, variant_ids, settings, campaign_type, budget_daily_cents, bid_strategy, ad_platforms } = req.body || {}
      if (!name?.trim()) return res.status(400).json({ message: 'name required' })
      const dType = String(discount_type || 'percentage').toLowerCase()
      const dVal = parseFloat(discount_value) || 0
      if (dVal < 0) return res.status(400).json({ message: 'discount_value must be >= 0' })
      if (dType === 'percentage' && dVal > 100) return res.status(400).json({ message: 'percentage discount must be 0–100' })
      const finalCampaignType = campaign_type || 'internal'
      const isPpc = finalCampaignType === 'ppc'
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(
          `INSERT INTO seller_campaigns (seller_id, name, description, status, start_at, end_at, discount_type, discount_value, target_type, product_ids, group_ids, variant_ids, settings, campaign_type, budget_daily_cents, bid_strategy, ad_platforms, ad_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
          [sellerId, name.trim(), description || '', status || 'draft', start_at || null, end_at || null, discount_type || 'percentage', dVal, target_type || 'products', JSON.stringify(Array.isArray(product_ids) ? product_ids : []), JSON.stringify(Array.isArray(group_ids) ? group_ids : []), JSON.stringify(Array.isArray(variant_ids) ? variant_ids : []), JSON.stringify(settings || {}), finalCampaignType, parseInt(budget_daily_cents) || 0, bid_strategy || 'cpc', JSON.stringify(Array.isArray(ad_platforms) ? ad_platforms : []), isPpc ? 'pending' : 'draft']
        )
        const created = r.rows[0]
        // For PPC campaigns: notify all superusers (in-app + email)
        if (isPpc) {
          try {
            const sellerNameR = await c.query(
              `SELECT s.store_name AS settings_store_name, u.store_name AS user_store_name,
                      u.company_name, u.first_name, u.last_name, u.email
               FROM seller_users u
               LEFT JOIN admin_hub_seller_settings s ON s.seller_id = u.seller_id
               WHERE u.seller_id = $1 AND u.sub_of_seller_id IS NULL
               LIMIT 1`,
              [sellerId],
            )
            const sRow = sellerNameR.rows[0] || {}
            const sellerDisplayName =
              (sRow.settings_store_name && String(sRow.settings_store_name).trim()) ||
              (sRow.user_store_name && String(sRow.user_store_name).trim()) ||
              (sRow.company_name && String(sRow.company_name).trim()) ||
              [sRow.first_name, sRow.last_name].filter(Boolean).join(' ').trim() ||
              sRow.email ||
              sellerId
            await c.query(
              `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
               VALUES ('campaign_submitted', $1, $2, $3, $4)`,
              [
                `Neue Werbekampagne: ${created.name}`,
                `${sellerDisplayName} hat eine neue PPC-Kampagne erstellt. Budget: ${((parseInt(created.budget_daily_cents, 10) || 0) / 100).toFixed(2)} €/Tag.`,
                sellerId,
                created.id,
              ],
            ).catch(() => {})
            // Fire-and-forget email
            notifySuperusersNewCampaign({
              campaignId: created.id,
              campaignName: created.name,
              sellerDisplayName,
              sellerId,
              budgetCents: parseInt(created.budget_daily_cents, 10) || 0,
            }).catch((e) => log.error('notifySuperusersNewCampaign:', e?.message))
          } catch (notifErr) {
            log.error('campaign_submitted notification failed:', notifErr?.message)
          }
        }
        await c.end(); res.status(201).json({ campaign: created })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

  router.get('/admin-hub/v1/campaigns/:id', async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`SELECT * FROM seller_campaigns WHERE id=$1`, [req.params.id])
        await c.end()
        const camp = r.rows[0]
        if (!camp) return res.status(404).json({ message: 'Not found' })
        if (!isSuperuser && camp.seller_id !== sellerId) return res.status(403).json({ message: 'Forbidden' })
        res.json({ campaign: camp })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

  router.put('/admin-hub/v1/campaigns/:id', async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      const c = pgDbClient(); try {
        await c.connect()
        const exist = await c.query(`SELECT * FROM seller_campaigns WHERE id=$1`, [req.params.id])
        const camp = exist.rows[0]
        if (!camp) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        if (!isSuperuser && camp.seller_id !== sellerId) { await c.end(); return res.status(403).json({ message: 'Forbidden' }) }
        const b = req.body || {}
        const dVal = b.discount_value !== undefined ? parseFloat(b.discount_value) : Number(camp.discount_value)
        const dTypePut = String(b.discount_type || camp.discount_type || 'percentage').toLowerCase()
        if (dVal < 0 || !Number.isFinite(dVal)) {
          await c.end()
          return res.status(400).json({ message: 'discount_value invalid' })
        }
        if (dTypePut === 'percentage' && dVal > 100) {
          await c.end()
          return res.status(400).json({ message: 'percentage discount must be 0–100' })
        }
        let nextVariants = Array.isArray(b.variant_ids) ? b.variant_ids : camp.variant_ids
        if (!Array.isArray(nextVariants)) {
          try {
            nextVariants = camp.variant_ids != null && typeof camp.variant_ids === 'string' ? JSON.parse(camp.variant_ids) : []
          } catch (_) {
            nextVariants = []
          }
          if (!Array.isArray(nextVariants)) nextVariants = []
        }
        const r = await c.query(
          `UPDATE seller_campaigns SET name=$1, description=$2, status=$3, start_at=$4, end_at=$5, discount_type=$6, discount_value=$7, target_type=$8, product_ids=$9, group_ids=$10, variant_ids=$11, settings=$12, campaign_type=$13, budget_daily_cents=$14, bid_strategy=$15, ad_platforms=$16, updated_at=now() WHERE id=$17 RETURNING *`,
          [b.name?.trim() || camp.name, b.description ?? camp.description, b.status || camp.status, b.start_at !== undefined ? (b.start_at || null) : camp.start_at, b.end_at !== undefined ? (b.end_at || null) : camp.end_at, b.discount_type || camp.discount_type, dVal, b.target_type || camp.target_type, JSON.stringify(Array.isArray(b.product_ids) ? b.product_ids : camp.product_ids), JSON.stringify(Array.isArray(b.group_ids) ? b.group_ids : camp.group_ids), JSON.stringify(Array.isArray(nextVariants) ? nextVariants : []), JSON.stringify(b.settings || camp.settings || {}), b.campaign_type || camp.campaign_type || 'internal', b.budget_daily_cents !== undefined ? parseInt(b.budget_daily_cents) : (camp.budget_daily_cents || 0), b.bid_strategy || camp.bid_strategy || 'cpc', JSON.stringify(Array.isArray(b.ad_platforms) ? b.ad_platforms : (camp.ad_platforms || [])), req.params.id]
        )
        await c.end(); res.json({ campaign: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

  router.delete('/admin-hub/v1/campaigns/:id', async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      const c = pgDbClient(); try {
        await c.connect()
        const exist = await c.query(`SELECT * FROM seller_campaigns WHERE id=$1`, [req.params.id])
        const camp = exist.rows[0]
        if (!camp) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        if (!isSuperuser && camp.seller_id !== sellerId) { await c.end(); return res.status(403).json({ message: 'Forbidden' }) }
        await c.query(`DELETE FROM seller_campaigns WHERE id=$1`, [req.params.id])
        await c.end(); res.json({ deleted: true })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // ── Google Ads API helpers ────────────────────────────────────────────────
    const GADS_API_VER = 'v19'

    async function gadsRefreshToken (creds) {
      const params = new URLSearchParams({
        client_id: creds.oauth_client_id || '',
        client_secret: creds.oauth_client_secret || '',
        refresh_token: creds.refresh_token || '',
        grant_type: 'refresh_token',
      })
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(`Google OAuth token refresh fehlgeschlagen: ${d.error_description || d.error || r.status}`)
      return d.access_token
    }

    async function gadsCall (resource, body, creds, accessToken) {
      const cid = String(creds.customer_id || '').replace(/-/g, '')
      const url = `https://googleads.googleapis.com/${GADS_API_VER}/customers/${cid}/${resource}:mutate`
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': String(creds.developer_token || ''),
        'Content-Type': 'application/json',
      }
      const mcc = String(creds.login_customer_id || '').replace(/-/g, '')
      if (mcc) headers['login-customer-id'] = mcc
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) {
        const msg = d?.error?.message
          || d?.error?.details?.[0]?.errors?.[0]?.message
          || JSON.stringify(d).slice(0, 300)
        throw new Error(`Google Ads API [${resource}]: ${msg}`)
      }
      return d
    }

    async function publishToGoogleAds (account, camp, budgetDailyCents) {
      const creds = account.credentials || {}
      const cid = String(creds.customer_id || '').replace(/-/g, '')
      if (!cid || !creds.developer_token || !creds.refresh_token)
        throw new Error('Google Ads Zugangsdaten unvollständig (customer_id, developer_token, refresh_token erforderlich). Zugangsdaten unter Apps & Integrationen → Marketing konfigurieren.')
      if (!creds.oauth_client_id || !creds.oauth_client_secret)
        throw new Error('Google Ads OAuth Client ID/Secret fehlen. Zugangsdaten unter Apps & Integrationen → Marketing konfigurieren.')

      // Parse campaign settings for ad details
      let settings = {}
      try { settings = typeof camp.settings === 'string' ? JSON.parse(camp.settings) : (camp.settings || {}) } catch (_) {}

      const gadsHeadlines = Array.isArray(settings.gads_headlines) ? settings.gads_headlines.filter(h => h && h.trim()) : []
      const gadsDescriptions = Array.isArray(settings.gads_descriptions) ? settings.gads_descriptions.filter(d => d && d.trim()) : []
      const gadsKeywords = Array.isArray(settings.gads_keywords) ? settings.gads_keywords.filter(k => k && k.trim()) : []
      const gadsFinalUrl = settings.gads_final_url || process.env.SHOP_URL || process.env.NEXT_PUBLIC_SHOP_URL || 'https://andertal.de'
      const gadsGeoTargets = Array.isArray(settings.gads_geo_targets) && settings.gads_geo_targets.length > 0
        ? settings.gads_geo_targets
        : ['2276'] // Default: Germany
      const gadsLanguage = settings.gads_target_language || '1001' // Default: German
      const gadsCpcBidMicros = String(Math.max((Number(settings.gads_cpc_bid_cents) || 50), 10) * 10000)

      // Build headlines list (min 3, max 15, each max 30 chars)
      const campNameHeadline = (camp.name || 'Entdecke Angebote').slice(0, 30)
      const allHeadlines = [
        campNameHeadline,
        ...gadsHeadlines.map(h => h.slice(0, 30)),
      ]
      const fallbackHeadlines = ['Jetzt entdecken', 'Qualität online', 'Jetzt bestellen', 'Top Angebote', 'Direkt kaufen']
      for (const fb of fallbackHeadlines) {
        if (allHeadlines.length >= 5) break
        if (!allHeadlines.includes(fb)) allHeadlines.push(fb)
      }
      const headlines = allHeadlines.slice(0, 15).map(text => ({ text }))

      // Build descriptions list (min 2, max 4, each max 90 chars)
      const campDesc = (camp.description || '').slice(0, 90)
      const allDescriptions = [
        ...(campDesc ? [campDesc] : []),
        ...gadsDescriptions.map(d => d.slice(0, 90)),
      ]
      const fallbackDescs = ['Schnelle Lieferung · Sichere Zahlung', 'Jetzt bestellen und sparen', 'Top Qualität zum besten Preis']
      for (const fb of fallbackDescs) {
        if (allDescriptions.length >= 4) break
        if (!allDescriptions.includes(fb)) allDescriptions.push(fb)
      }
      const descriptions = allDescriptions.slice(0, 4).map(text => ({ text }))

      const token = await gadsRefreshToken(creds)
      const yyyymmdd = d => d ? new Date(d).toISOString().slice(0, 10).replace(/-/g, '') : null

      // 1 ── Campaign Budget (min 1 EUR = 1 000 000 micros; budgetDailyCents in cents)
      const budgetAmountMicros = String(Math.max(budgetDailyCents, 100) * 10000)
      const budgetRes = await gadsCall('campaignBudgets', {
        operations: [{ create: {
          name: `Andertal — ${camp.name} — ${Date.now()}`,
          amountMicros: budgetAmountMicros,
          deliveryMethod: 'STANDARD',
          explicitlyShared: false,
        }}]
      }, creds, token)
      const budgetResourceName = budgetRes.results?.[0]?.resourceName
      if (!budgetResourceName) throw new Error('Google Ads: Budget wurde erstellt aber kein resourceName zurückgegeben')
      const budgetId = budgetResourceName.split('/').pop()

      // 2 ── Campaign (SEARCH, bid strategy based on settings)
      const startDate = yyyymmdd(camp.start_at) || yyyymmdd(new Date())
      const bidStrategy = String(camp.bid_strategy || 'cpc').toLowerCase()
      const campCreate = {
        name: `${camp.name} — Andertal`,
        advertisingChannelType: 'SEARCH',
        status: 'ENABLED',
        campaignBudget: `customers/${cid}/campaignBudgets/${budgetId}`,
        networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false },
        startDate,
      }
      // Bid strategy
      if (bidStrategy === 'target_roas') {
        campCreate.targetRoas = { targetRoas: 3.0 }
      } else if (bidStrategy === 'cpm') {
        campCreate.targetSpend = { cpcBidCeilingMicros: gadsCpcBidMicros }
      } else {
        // cpc → Maximize Clicks with CPC ceiling
        campCreate.targetSpend = { cpcBidCeilingMicros: gadsCpcBidMicros }
      }
      const endDate = yyyymmdd(camp.end_at)
      if (endDate) campCreate.endDate = endDate
      const campRes = await gadsCall('campaigns', { operations: [{ create: campCreate }] }, creds, token)
      const campaignResourceName = campRes.results?.[0]?.resourceName
      if (!campaignResourceName) throw new Error('Google Ads: Kampagne erstellt aber kein resourceName zurückgegeben')
      const campaignId = campaignResourceName.split('/').pop()

      // 3 ── Geo targeting (campaignCriteria locations)
      if (gadsGeoTargets.length > 0) {
        const geoOps = gadsGeoTargets.map(geoId => ({
          create: {
            campaign: `customers/${cid}/campaigns/${campaignId}`,
            location: { geoTargetConstant: `geoTargetConstants/${geoId}` },
          }
        }))
        await gadsCall('campaignCriteria', { operations: geoOps }, creds, token).catch(e => {
          console.warn('[gads] geo targeting warning:', e?.message)
        })
      }

      // 4 ── Language targeting
      await gadsCall('campaignCriteria', {
        operations: [{
          create: {
            campaign: `customers/${cid}/campaigns/${campaignId}`,
            language: { languageConstant: `languageConstants/${gadsLanguage}` },
          }
        }]
      }, creds, token).catch(e => {
        console.warn('[gads] language targeting warning:', e?.message)
      })

      // 5 ── Ad Group
      const agRes = await gadsCall('adGroups', {
        operations: [{ create: {
          name: `${camp.name} — Gruppe`,
          campaign: `customers/${cid}/campaigns/${campaignId}`,
          status: 'ENABLED',
          type: 'SEARCH_STANDARD',
          cpcBidMicros: gadsCpcBidMicros,
        }}]
      }, creds, token)
      const adGroupResourceName = agRes.results?.[0]?.resourceName
      if (!adGroupResourceName) throw new Error('Google Ads: Ad Group erstellt aber kein resourceName zurückgegeben')
      const adGroupId = adGroupResourceName.split('/').pop()

      // 6 ── Keywords (BROAD match; at least one required for Search to show)
      const keywordsToAdd = gadsKeywords.length > 0 ? gadsKeywords : ['online kaufen', 'produkte kaufen', camp.name || 'angebote']
      const kwOps = keywordsToAdd.slice(0, 20).map(kwText => ({
        create: {
          adGroup: `customers/${cid}/adGroups/${adGroupId}`,
          status: 'ENABLED',
          keyword: { text: kwText.slice(0, 80), matchType: 'BROAD' },
        }
      }))
      await gadsCall('adGroupCriteria', { operations: kwOps }, creds, token)

      // 7 ── Responsive Search Ad
      await gadsCall('adGroupAds', {
        operations: [{ create: {
          adGroup: `customers/${cid}/adGroups/${adGroupId}`,
          status: 'ENABLED',
          ad: {
            responsiveSearchAd: { headlines, descriptions },
            finalUrls: [gadsFinalUrl],
          },
        }}]
      }, creds, token)

      return { campaignId, budgetId, adGroupId }
    }

    // Publish PPC campaign to ad platforms (superuser only)
  router.post('/admin-hub/v1/campaigns/:id/publish', requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        const exist = await c.query(`SELECT * FROM seller_campaigns WHERE id=$1`, [req.params.id])
        const camp = exist.rows[0]
        if (!camp) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        const platforms = Array.isArray(camp.ad_platforms) ? camp.ad_platforms : []
        if (!platforms.length) { await c.end(); return res.status(400).json({ message: 'Kampanya için reklam platformu seçilmemiş' }) }
        const maRows = await c.query(`SELECT * FROM platform_marketing_accounts WHERE platform = ANY($1) AND is_active = true`, [platforms])
        const accounts = maRows.rows
        if (!accounts.length) { await c.end(); return res.status(400).json({ message: 'Seçilen platformlar için bağlı pazarlama hesabı bulunamadı' }) }
        await c.end()

        const budgetPerPlatform = Math.floor((camp.budget_daily_cents || 0) / accounts.length)
        const externalIds = {}
        const publishErrors = []

        for (const account of accounts) {
          try {
            if (account.platform === 'google_ads') {
              const ids = await publishToGoogleAds(account, camp, budgetPerPlatform)
              externalIds['google_ads'] = `gads_${ids.campaignId}`
              externalIds['google_ads_budget_id'] = ids.budgetId
              externalIds['google_ads_adgroup_id'] = ids.adGroupId
            } else {
              // Other platforms: simulation placeholder until implemented
              externalIds[account.platform] = `sim_${account.platform}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
            }
          } catch (err) {
            console.error(`[publish] ${account.platform} error:`, err?.message)
            publishErrors.push({ platform: account.platform, error: err?.message || String(err) })
          }
        }

        const adStatus = publishErrors.length >= accounts.length ? 'draft' : (publishErrors.length > 0 ? 'partial' : 'published')
        const c2 = pgDbClient()
        await c2.connect()
        const r = await c2.query(
          `UPDATE seller_campaigns SET ad_status=$1, external_campaign_ids=$2, status='active', updated_at=now() WHERE id=$3 RETURNING *`,
          [adStatus, JSON.stringify(externalIds), req.params.id]
        )
        await c2.end()
        const successPlatforms = accounts.filter(a => !publishErrors.some(e => e.platform === a.platform)).map(a => a.platform)
        res.json({
          campaign: r.rows[0],
          budget_per_platform_cents: budgetPerPlatform,
          platforms_published: successPlatforms,
          errors: publishErrors.length ? publishErrors : undefined,
          warning: publishErrors.length >= accounts.length
            ? 'Externe Plattformen fehlgeschlagen — Kampagne ist intern aktiv. Zugangsdaten unter Apps & Integrationen prüfen.'
            : undefined,
        })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // Pause published PPC campaign (superuser only)
  router.post('/admin-hub/v1/campaigns/:id/pause', requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`UPDATE seller_campaigns SET ad_status='paused', status='paused', updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id])
        if (!r.rows[0]) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        await c.end(); res.json({ campaign: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // Resume paused PPC campaign (superuser only)
  router.post('/admin-hub/v1/campaigns/:id/resume', requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`UPDATE seller_campaigns SET ad_status='published', status='active', updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id])
        if (!r.rows[0]) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        await c.end(); res.json({ campaign: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // Campaign budget prepayment via Stripe Checkout (seller-initiated)
  router.post('/admin-hub/v1/campaigns/:id/checkout', async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(403).json({ message: 'Seller ID required' })
      const campaignId = req.params.id
      const { success_url, cancel_url } = req.body || {}
      const c = pgDbClient(); try {
        await c.connect()
        const cr = await c.query(`SELECT * FROM seller_campaigns WHERE id=$1`, [campaignId])
        const camp = cr.rows[0]
        if (!camp) { await c.end(); return res.status(404).json({ message: 'Campaign not found' }) }
        if (!req.sellerUser?.is_superuser && camp.seller_id !== sellerId) { await c.end(); return res.status(403).json({ message: 'Forbidden' }) }
        const platformRow = await loadPlatformCheckoutRow(c)
        await c.end()
        const sk = resolveStripeSecretKeyFromPlatform(platformRow)
        if (!sk) return res.status(400).json({ message: 'Stripe nicht konfiguriert.' })
        const stripe = new (require('stripe'))(sk)
        const dailyCents = parseInt(camp.budget_daily_cents || 0, 10)
        if (dailyCents <= 0) return res.status(400).json({ message: 'Tagesbudget muss > 0 sein.' })
        const totalCents = dailyCents * 30 // 30-day prepayment
        const sellerCentral = process.env.NEXT_PUBLIC_SELLERCENTRAL_URL || 'https://sellercentral.andertal.de'
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [{
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: totalCents,
              product_data: {
                name: `Werbekampagne: ${camp.name}`,
                description: `30-Tage-Vorauszahlung · ${(dailyCents / 100).toFixed(2)} €/Tag`,
              },
            },
          }],
          metadata: { type: 'campaign_budget', campaign_id: campaignId, seller_id: sellerId },
          success_url: success_url || `${sellerCentral}/de/marketing/campaigns/${campaignId}?payment=success`,
          cancel_url: cancel_url || `${sellerCentral}/de/marketing/campaigns/${campaignId}?payment=cancelled`,
        })
        res.json({ checkout_url: session.url, session_id: session.id })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // ── Automation Rules (superuser only) ────────────────────────────────────────
    const VALID_AUTOMATION_TYPES = ['review_request', 'welcome_email', 'reorder_reminder', 'abandoned_cart', 'low_stock_alert', 'loyalty_reward', 'price_drop_alert']

    const ensureAutomationTable = async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_hub_automation_rules (
          type TEXT PRIMARY KEY,
          is_active BOOLEAN NOT NULL DEFAULT false,
          config JSONB NOT NULL DEFAULT '{}',
          triggered_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
    }

  router.get('/admin-hub/v1/automations', requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        await ensureAutomationTable(c)
        const r = await c.query(`SELECT * FROM admin_hub_automation_rules ORDER BY type`)
        let statsRows = []
        try {
          const sr = await c.query(
            `SELECT trigger_key AS type, COUNT(*)::int AS count FROM store_flow_execution_logs WHERE trigger_key = ANY($1) GROUP BY trigger_key`,
            [VALID_AUTOMATION_TYPES]
          )
          statsRows = sr.rows
        } catch (_) {}
        await c.end()
        res.json({ rules: r.rows, stats: statsRows })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

  router.put('/admin-hub/v1/automations/:type', requireSuperuser, async (req, res) => {
      const { type } = req.params
      if (!VALID_AUTOMATION_TYPES.includes(type)) return res.status(400).json({ message: 'Invalid automation type' })
      const { is_active, config } = req.body || {}
      const c = pgDbClient(); try {
        await c.connect()
        await ensureAutomationTable(c)
        const r = await c.query(
          `INSERT INTO admin_hub_automation_rules (type, is_active, config, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (type) DO UPDATE SET is_active=$2, config=$3, updated_at=now()
           RETURNING *`,
          [type, is_active !== undefined ? Boolean(is_active) : false, JSON.stringify(config || {})]
        )
        await c.end()
        res.json({ rule: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // ── Platform Marketing Accounts (superuser only) ──────────────────────────────
  router.get('/admin-hub/v1/marketing-accounts', requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`SELECT * FROM platform_marketing_accounts ORDER BY platform`)
        await c.end(); res.json({ accounts: r.rows })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

  router.patch('/admin-hub/v1/marketing-accounts', requireSuperuser, async (req, res) => {
      const { platform, display_name, credentials, is_active } = req.body || {}
      if (!platform) return res.status(400).json({ message: 'platform required' })
      const c = pgDbClient(); try {
        await c.connect()
        const existing = await c.query(`SELECT * FROM platform_marketing_accounts WHERE platform=$1`, [platform])
        let row
        if (existing.rows[0]) {
          const curr = existing.rows[0]
          const mergedCreds = { ...(curr.credentials || {}) }
          if (credentials && typeof credentials === 'object') {
            for (const [k, v] of Object.entries(credentials)) {
              if (v !== '' && v !== undefined) mergedCreds[k] = v
            }
          }
          const r = await c.query(
            `UPDATE platform_marketing_accounts SET display_name=$1, credentials=$2, is_active=$3, updated_at=now() WHERE platform=$4 RETURNING *`,
            [display_name ?? curr.display_name, JSON.stringify(mergedCreds), is_active !== undefined ? is_active : curr.is_active, platform]
          )
          row = r.rows[0]
        } else {
          const r = await c.query(
            `INSERT INTO platform_marketing_accounts (platform, display_name, credentials, is_active) VALUES ($1,$2,$3,$4) RETURNING *`,
            [platform, display_name || '', JSON.stringify(credentials || {}), is_active !== undefined ? is_active : true]
          )
          row = r.rows[0]
        }
        await c.end(); res.json({ account: row })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    /** Rabatt aus seller_campaigns auf Listenpreis (Cent) anwenden — fixed = € aus DB. */
    const applySellerCampaignToPriceCents = (priceCents, camp) => {
      const p = Math.max(0, Number(priceCents || 0))
      if (!camp || p <= 0) return p
      const t = String(camp.discount_type || 'percentage').toLowerCase()
      const v = Number(camp.discount_value || 0)
      if (t === 'fixed') {
        const off = Math.round(v * 100)
        return Math.max(0, p - off)
      }
      const pct = Math.min(100, Math.max(0, v))
      return Math.round(p * (1 - pct / 100))
    }

    const parseJsonbArray = (raw) => {
      if (raw == null) return []
      if (Array.isArray(raw)) return raw.map(String)
      if (typeof raw === 'string') {
        try {
          const x = JSON.parse(raw)
          return Array.isArray(x) ? x.map(String) : []
        } catch (_) {
          return []
        }
      }
      return []
    }

    async function sellerCampaignCoversProductVariant(c, camp, productId, variantId) {
      const pid = String(productId || '').trim()
      const vid = String(variantId || '').trim()
      const targetType = String(camp.target_type || 'products').toLowerCase()
      const variantIdsList = parseJsonbArray(camp.variant_ids)

      let productMatch = false
      if (targetType === 'all') {
        productMatch = true
      } else if (targetType === 'groups') {
        const groupIds = parseJsonbArray(camp.group_ids)
        for (const gid of groupIds) {
          const gr = await c.query(`SELECT product_ids FROM seller_product_groups WHERE id=$1`, [gid]).catch(() => ({ rows: [] }))
          const gProds = parseJsonbArray(gr.rows[0]?.product_ids)
          if (gProds.includes(pid)) {
            productMatch = true
            break
          }
        }
      } else {
        const productIds = parseJsonbArray(camp.product_ids)
        productMatch = productIds.includes(pid)
      }

      if (variantIdsList.length > 0) {
        if (!vid || !variantIdsList.includes(vid)) return false
        if (productMatch || targetType === 'all') return true
        return vid.startsWith(`${pid}-`)
      }
      return productMatch
    }

    async function findBestSellerCampaignDiscountRow(c, { productId, variantId, sellerId }) {
      const pid = String(productId || '').trim()
      const vid = String(variantId || '').trim()
      const sid = String(sellerId || '').trim()
      if (!pid || !sid) return null
      const nowIso = new Date().toISOString()
      const r = await c.query(
        `SELECT * FROM seller_campaigns
         WHERE seller_id = $1
           AND status = 'active'
           AND COALESCE(campaign_type, 'internal') = 'internal'
           AND (start_at IS NULL OR start_at <= $2::timestamptz)
           AND (end_at IS NULL OR end_at >= $2::timestamptz)
         ORDER BY discount_value DESC`,
        [sid, nowIso],
      )
      let bestDiscount = null
      for (const camp of r.rows || []) {
        const covered = await sellerCampaignCoversProductVariant(c, camp, pid, vid)
        if (covered) {
          if (!bestDiscount || parseFloat(camp.discount_value) > parseFloat(bestDiscount.discount_value)) {
            bestDiscount = camp
          }
        }
      }
      return bestDiscount
    }

    // Store API: active campaign discounts for a product + variant (shop PDP)
  router.get('/store/campaigns/discount', async (req, res) => {
      const product_id = (req.query.product_id || '').toString().trim()
      const variant_id = (req.query.variant_id || '').toString().trim()
      const seller_id_query = (req.query.seller_id || '').toString().trim()
      if (!product_id) return res.status(400).json({ message: 'product_id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        let sellerId = seller_id_query
        if (!sellerId) {
          const product = await getAdminHubProductByIdOrHandleDb(product_id)
          sellerId = product?.seller_id ? String(product.seller_id).trim() : ''
        }
        if (!sellerId) {
          await c.end()
          return res.json({ discount: null })
        }
        const bestDiscount = await findBestSellerCampaignDiscountRow(c, {
          productId: product_id,
          variantId: variant_id,
          sellerId,
        })
        await c.end()
        if (!bestDiscount) return res.json({ discount: null })
        let settings = bestDiscount.settings || {}
        if (typeof settings === 'string') {
          try {
            settings = JSON.parse(settings)
          } catch (_) {
            settings = {}
          }
        }
        res.json({
          discount: {
            campaign_id: bestDiscount.id,
            campaign_name: bestDiscount.name,
            discount_type: bestDiscount.discount_type,
            discount_value: parseFloat(bestDiscount.discount_value),
            show_badge: settings.show_badge !== false,
            badge_text: settings.badge_text ? String(settings.badge_text) : '',
          },
        })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.json({ discount: null })
      }
    })

  return router
}
