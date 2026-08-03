'use strict'
const { Router } = require('express')

module.exports = function createNotificationsRouter() {
    // ── Notifications (per-recipient read/delete state: seller_hub_notification_state) ──
    const getNotifRecipientContext = (req) => {
      const u = req.sellerUser
      if (!u) return null
      const isSuperuser = !!u.is_superuser
      const sellerId = String(u.seller_id || '').trim()
      if (!isSuperuser && !sellerId) return null
      return { isSuperuser, sellerId, recipientKey: isSuperuser ? '__superuser__' : sellerId }
    }

    const markAllNotificationsRead = async (client, recipientKey, isSuperuser, sellerId) => {
      const sup = !!isSuperuser
      const sid = sellerId || ''
      await client.query(
        `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
         SELECT $1::varchar, 'order', o.id, now() FROM store_orders o
         WHERE ($2::boolean OR o.seller_id = $3 OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $3)
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $3)
              )
            ))
         ON CONFLICT (recipient_key, source_type, source_id)
         DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
        [recipientKey, sup, sid],
      )
      await client.query(
        `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
         SELECT $1::varchar, 'return', r.id, now()
         FROM store_returns r INNER JOIN store_orders o ON o.id = r.order_id
         WHERE ($2::boolean OR o.seller_id = $3 OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $3)
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $3)
              )
            ))
         ON CONFLICT (recipient_key, source_type, source_id)
         DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
        [recipientKey, sup, sid],
      )
      if (sup) {
        await client.query(
          `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
           SELECT $1::varchar, 'verification', n.id, now()
           FROM admin_hub_notifications n WHERE n.type = 'verification_submitted'
           ON CONFLICT (recipient_key, source_type, source_id)
           DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
          [recipientKey],
        )
        await client.query(
          `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
           SELECT $1::varchar, 'product_change_request', cr.id, now()
           FROM admin_hub_product_change_requests cr
           WHERE cr.status = 'pending'
           ON CONFLICT (recipient_key, source_type, source_id)
           DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
          [recipientKey],
        )
        await client.query(
          `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
           SELECT $1::varchar, 'metafield_pending', mp.id, now()
           FROM admin_hub_metafield_pending mp
           WHERE mp.status = 'pending'
           ON CONFLICT (recipient_key, source_type, source_id)
           DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
          [recipientKey],
        ).catch(() => {})
        await client.query(
          `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
           SELECT $1::varchar, 'campaign_submitted', n.id, now()
           FROM admin_hub_notifications n WHERE n.type = 'campaign_submitted'
           ON CONFLICT (recipient_key, source_type, source_id)
           DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
          [recipientKey],
        ).catch(() => {})
        await client.query(
          `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
           SELECT $1::varchar, 'seller_listing_pending', n.id, now()
           FROM admin_hub_notifications n WHERE n.type = 'seller_listing_pending'
           ON CONFLICT (recipient_key, source_type, source_id)
           DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
          [recipientKey],
        ).catch(() => {})
        await client.query(
          `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
           SELECT $1::varchar, 'brand_authorization_pending', n.id, now()
           FROM admin_hub_notifications n WHERE n.type = 'brand_authorization_pending'
           ON CONFLICT (recipient_key, source_type, source_id)
           DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
          [recipientKey],
        ).catch(() => {})
        await client.query(
          `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
           SELECT $1::varchar, 'flow_send_failed', n.id, now()
           FROM admin_hub_notifications n WHERE n.type = 'flow_send_failed'
           ON CONFLICT (recipient_key, source_type, source_id)
           DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
          [recipientKey],
        ).catch(() => {})
      }
    }

    const adminHubNotificationsUnreadGET = async (req, res) => {
      const ctx = getNotifRecipientContext(req)
      if (!ctx) return res.status(401).json({ message: 'Unauthorized' })
      const { recipientKey: rk, isSuperuser: sup, sellerId: sid } = ctx
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        let messagesR
        if (!sup) {
          messagesR = await client.query(
            `SELECT COUNT(*)::int AS c FROM store_messages m
             WHERE m.is_read_by_seller = false
               AND (
                 (
                   (m.channel = 'customer' OR m.channel IS NULL)
                   AND m.sender_type = 'customer'
                   AND m.order_id IN (
                     SELECT o.id FROM store_orders o WHERE o.seller_id = $1
                       OR EXISTS (
                         SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                           EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $1)
                           OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $1)
                         )
                       )
                   )
                 )
                 OR (
                   m.channel = 'support' AND m.seller_id = $1 AND m.sender_type = 'seller'
                 )
               )`,
            [sid],
          )
        } else {
          messagesR = await client.query(
            `SELECT COUNT(*)::int AS c FROM store_messages m
             WHERE (
                 (
                   (m.channel = 'customer' OR m.channel IS NULL)
                   AND m.sender_type = 'customer'
                   AND m.is_read_by_seller = false
                 )
                 OR (
                   m.channel = 'support' AND m.sender_type = 'seller' AND m.is_read_by_seller = false
                 )
                 OR (
                   m.channel = 'support' AND m.sender_type = 'customer' AND m.is_read_by_support = false
                 )
               )`,
          )
        }
        const ordersUnreadQ = `
          SELECT COUNT(*)::int AS c FROM store_orders o
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'order' AND s.source_id = o.id
          WHERE ($2::boolean OR o.seller_id = $3 OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $3)
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $3)
              )
            ))
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
        const returnsUnreadQ = `
          SELECT COUNT(*)::int AS c FROM store_returns r
          INNER JOIN store_orders o ON o.id = r.order_id
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'return' AND s.source_id = r.id
          WHERE ($2::boolean OR o.seller_id = $3 OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $3)
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $3)
              )
            ))
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
        const verificationsUnreadQ = sup
          ? `
          SELECT COUNT(*)::int AS c FROM admin_hub_notifications n
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'verification' AND s.source_id = n.id
          WHERE n.type = 'verification_submitted'
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
          : `SELECT 0::int AS c`
        const campaignsUnreadQ = sup
          ? `
          SELECT COUNT(*)::int AS c FROM admin_hub_notifications n
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'campaign_submitted' AND s.source_id = n.id
          WHERE n.type = 'campaign_submitted'
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
          : `SELECT 0::int AS c`
        const sellerListingUnreadQ = sup
          ? `
          SELECT COUNT(*)::int AS c FROM admin_hub_notifications n
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'seller_listing_pending' AND s.source_id = n.id
          WHERE n.type = 'seller_listing_pending'
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
          : `SELECT 0::int AS c`
        const brandAuthUnreadQ = sup
          ? `
          SELECT COUNT(*)::int AS c FROM admin_hub_notifications n
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'brand_authorization_pending' AND s.source_id = n.id
          WHERE n.type = 'brand_authorization_pending'
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
          : `SELECT 0::int AS c`
        const crUnreadQ = `
          SELECT COUNT(*)::int AS c FROM admin_hub_product_change_requests cr
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'product_change_request' AND s.source_id = cr.id
          WHERE cr.status = 'pending'
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
        const metafieldUnreadQ = `
          SELECT COUNT(*)::int AS c FROM admin_hub_metafield_pending mp
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'metafield_pending' AND s.source_id = mp.id
          WHERE mp.status = 'pending'
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
        const sellerNoticeUnreadQ = `
          SELECT COUNT(*)::int AS c FROM admin_hub_notifications n
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'seller_notice' AND s.source_id = n.id
          WHERE n.type IN ('product_change_request_reviewed', 'metafield_proposal_reviewed', 'brand_authorization_reviewed')
            AND n.seller_id = $2
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
        const sellerErrorsUnreadQ = sup
          ? `SELECT COUNT(*)::int AS c FROM seller_error_logs WHERE is_read = false`
          : `SELECT 0::int AS c`
        const flowFailuresUnreadQ = sup
          ? `
          SELECT COUNT(*)::int AS c FROM admin_hub_notifications n
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'flow_send_failed' AND s.source_id = n.id
          WHERE n.type = 'flow_send_failed'
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
          : `SELECT 0::int AS c`

        const [ordersR, returnsR, verificationsR, changeReqR, metafieldR, sellerNoticeR, campaignsR, sellerErrorsR, sellerListingR, brandAuthR, flowFailuresR] = await Promise.all([
          client.query(ordersUnreadQ, [rk, sup, sid]),
          client.query(returnsUnreadQ, [rk, sup, sid]),
          sup ? client.query(verificationsUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(crUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(metafieldUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          !sup && sid ? client.query(sellerNoticeUnreadQ, [rk, sid]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(campaignsUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(sellerErrorsUnreadQ).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(sellerListingUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(brandAuthUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(flowFailuresUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
        ])

        const recentOrders = await client.query(
          `SELECT o.id, o.order_number, o.first_name, o.last_name, o.total_cents, o.created_at,
                  (s.read_at IS NOT NULL) AS read
           FROM store_orders o
           LEFT JOIN seller_hub_notification_state s
             ON s.recipient_key = $1 AND s.source_type = 'order' AND s.source_id = o.id
           WHERE ($2::boolean OR o.seller_id = $3 OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $3)
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $3)
              )
            ))
             AND (s.id IS NULL OR s.deleted_at IS NULL)
           ORDER BY o.created_at DESC LIMIT 8`,
          [rk, sup, sid],
        )
        const recentReturns = await client.query(
          `SELECT r.id, r.return_number, r.status, r.created_at, o.order_number,
                  (s.read_at IS NOT NULL) AS read
           FROM store_returns r
           INNER JOIN store_orders o ON o.id = r.order_id
           LEFT JOIN seller_hub_notification_state s
             ON s.recipient_key = $1 AND s.source_type = 'return' AND s.source_id = r.id
           WHERE ($2::boolean OR o.seller_id = $3 OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $3)
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $3)
              )
            ))
             AND (s.id IS NULL OR s.deleted_at IS NULL)
           ORDER BY r.created_at DESC LIMIT 8`,
          [rk, sup, sid],
        )
        let recentVerifications = { rows: [] }
        if (sup) {
          recentVerifications = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'verification' AND s.source_id = n.id
             WHERE n.type = 'verification_submitted'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 8`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let recentCampaignSubmitted = { rows: [] }
        if (sup) {
          recentCampaignSubmitted = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'campaign_submitted' AND s.source_id = n.id
             WHERE n.type = 'campaign_submitted'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 8`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let recentSellerListingPending = { rows: [] }
        if (sup) {
          recentSellerListingPending = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'seller_listing_pending' AND s.source_id = n.id
             WHERE n.type = 'seller_listing_pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 8`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let recentBrandAuthPending = { rows: [] }
        if (sup) {
          recentBrandAuthPending = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'brand_authorization_pending' AND s.source_id = n.id
             WHERE n.type = 'brand_authorization_pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 8`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let recentFlowFailures = { rows: [] }
        if (sup) {
          recentFlowFailures = await client.query(
            `SELECT n.id, n.title, n.body, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'flow_send_failed' AND s.source_id = n.id
             WHERE n.type = 'flow_send_failed'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 8`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let recentChangeRequests = { rows: [] }
        if (sup) {
          recentChangeRequests = await client.query(
            `SELECT cr.id, cr.product_id, cr.seller_id, cr.field_name, cr.old_value, cr.new_value, cr.created_at, p.title AS product_title,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_product_change_requests cr
             LEFT JOIN admin_hub_products p ON p.id = cr.product_id
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'product_change_request' AND s.source_id = cr.id
             WHERE cr.status = 'pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY cr.created_at DESC LIMIT 8`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let recentMetafieldPending = { rows: [] }
        if (sup) {
          recentMetafieldPending = await client.query(
            `SELECT mp.id, mp.key, mp.label, mp.proposed_values, mp.seller_id, mp.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_metafield_pending mp
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'metafield_pending' AND s.source_id = mp.id
             WHERE mp.status = 'pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY mp.created_at DESC LIMIT 8`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let recentSellerNotices = { rows: [] }
        if (!sup && sid) {
          recentSellerNotices = await client.query(
            `SELECT n.id, n.title, n.body, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'seller_notice' AND s.source_id = n.id
             WHERE n.type IN ('product_change_request_reviewed', 'metafield_proposal_reviewed', 'brand_authorization_reviewed')
               AND n.seller_id = $2
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 8`,
            [rk, sid],
          ).catch(() => ({ rows: [] }))
        }

        let recentSellerErrors = { rows: [] }
        if (sup) {
          recentSellerErrors = await client.query(
            `SELECT e.id, e.seller_id, e.error_code, e.error_message, e.context, e.created_at, e.is_read,
                    s.store_name, s.email AS seller_email
             FROM seller_error_logs e
             LEFT JOIN seller_users s ON s.seller_id = e.seller_id
             WHERE e.is_read = false
             ORDER BY e.created_at DESC LIMIT 8`,
          ).catch(() => ({ rows: [] }))
        }

        await client.end()
        const verCount = verificationsR.rows[0]?.c || 0
        const crCount = changeReqR.rows[0]?.c || 0
        const mfCount = metafieldR.rows[0]?.c || 0
        const sellerNoticeCount = sellerNoticeR.rows[0]?.c || 0
        const campaignCount = campaignsR.rows[0]?.c || 0
        const sellerErrorsCount = sellerErrorsR.rows[0]?.c || 0
        const sellerListingCount = sellerListingR.rows[0]?.c || 0
        const brandAuthCount = brandAuthR.rows[0]?.c || 0
        const flowFailuresCount = flowFailuresR.rows[0]?.c || 0
        const ordCount = ordersR.rows[0]?.c || 0
        const retCount = returnsR.rows[0]?.c || 0
        res.json({
          unread: ordCount + retCount + (messagesR.rows[0]?.c || 0) + verCount + crCount + mfCount + sellerNoticeCount + campaignCount + sellerErrorsCount + sellerListingCount + brandAuthCount + flowFailuresCount,
          orders: ordCount,
          returns: retCount,
          messages: messagesR.rows[0]?.c || 0,
          verifications: verCount,
          change_requests: crCount + mfCount,
          campaigns: campaignCount,
          seller_errors: sellerErrorsCount,
          seller_listings_pending: sellerListingCount,
          brand_authorizations_pending: brandAuthCount,
          flow_failures: flowFailuresCount,
          recent_orders: recentOrders.rows.map((r) => ({ ...r, order_number: r.order_number ? Number(r.order_number) : null })),
          recent_returns: recentReturns.rows.map((r) => ({ ...r, return_number: r.return_number ? Number(r.return_number) : null, order_number: r.order_number ? Number(r.order_number) : null })),
          recent_verifications: recentVerifications.rows,
          recent_product_change_requests: [...(recentChangeRequests.rows || []), ...(recentMetafieldPending.rows || [])],
          recent_seller_notices: recentSellerNotices.rows || [],
          recent_campaigns_submitted: recentCampaignSubmitted.rows || [],
          recent_seller_errors: recentSellerErrors.rows || [],
          recent_seller_listings_pending: recentSellerListingPending.rows || [],
          recent_brand_authorizations_pending: recentBrandAuthPending.rows || [],
          recent_flow_failures: recentFlowFailures.rows || [],
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubNotificationsMarkSeenPOST = async (req, res) => {
      const ctx = getNotifRecipientContext(req)
      if (!ctx) return res.status(401).json({ message: 'Unauthorized' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await markAllNotificationsRead(client, ctx.recipientKey, ctx.isSuperuser, ctx.sellerId)
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubNotificationsFeedGET = async (req, res) => {
      const ctx = getNotifRecipientContext(req)
      if (!ctx) return res.status(401).json({ message: 'Unauthorized' })
      const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 200)
      const off = Math.max(parseInt(req.query.offset, 10) || 0, 0)
      const { recipientKey: rk, isSuperuser: sup, sellerId: sid } = ctx
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ordersQ = await client.query(
          `SELECT o.id, o.order_number, o.first_name, o.last_name, o.total_cents, o.created_at,
                  (s.read_at IS NOT NULL) AS read
           FROM store_orders o
           LEFT JOIN seller_hub_notification_state s
             ON s.recipient_key = $1 AND s.source_type = 'order' AND s.source_id = o.id
           WHERE ($2::boolean OR o.seller_id = $3 OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $3)
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $3)
              )
            ))
             AND (s.id IS NULL OR s.deleted_at IS NULL)
           ORDER BY o.created_at DESC LIMIT 500`,
          [rk, sup, sid],
        )
        const returnsQ = await client.query(
          `SELECT r.id, r.return_number, r.status, r.created_at, o.order_number,
                  (s.read_at IS NOT NULL) AS read
           FROM store_returns r
           INNER JOIN store_orders o ON o.id = r.order_id
           LEFT JOIN seller_hub_notification_state s
             ON s.recipient_key = $1 AND s.source_type = 'return' AND s.source_id = r.id
           WHERE ($2::boolean OR o.seller_id = $3 OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $3)
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $3)
              )
            ))
             AND (s.id IS NULL OR s.deleted_at IS NULL)
           ORDER BY r.created_at DESC LIMIT 500`,
          [rk, sup, sid],
        )
        let verQ = { rows: [] }
        if (sup) {
          verQ = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.created_at,
                    su.id AS seller_user_id,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_users su ON su.seller_id = n.seller_id AND su.sub_of_seller_id IS NULL
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'verification' AND s.source_id = n.id
             WHERE n.type = 'verification_submitted'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 500`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let campaignSubmittedQ = { rows: [] }
        if (sup) {
          campaignSubmittedQ = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'campaign_submitted' AND s.source_id = n.id
             WHERE n.type = 'campaign_submitted'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 500`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let sellerListingQ = { rows: [] }
        if (sup) {
          sellerListingQ = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'seller_listing_pending' AND s.source_id = n.id
             WHERE n.type = 'seller_listing_pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 500`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let brandAuthQ = { rows: [] }
        if (sup) {
          brandAuthQ = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'brand_authorization_pending' AND s.source_id = n.id
             WHERE n.type = 'brand_authorization_pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 500`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let flowFailuresQ = { rows: [] }
        if (sup) {
          flowFailuresQ = await client.query(
            `SELECT n.id, n.title, n.body, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'flow_send_failed' AND s.source_id = n.id
             WHERE n.type = 'flow_send_failed'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 500`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let crQ = { rows: [] }
        if (sup) {
          crQ = await client.query(
            `SELECT cr.id, cr.product_id, cr.seller_id, cr.field_name, cr.old_value, cr.new_value, cr.created_at, p.title AS product_title,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_product_change_requests cr
             LEFT JOIN admin_hub_products p ON p.id = cr.product_id
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'product_change_request' AND s.source_id = cr.id
             WHERE cr.status = 'pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY cr.created_at DESC LIMIT 500`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let metaPendingQ = { rows: [] }
        if (sup) {
          metaPendingQ = await client.query(
            `SELECT mp.id, mp.key, mp.label, mp.proposed_values, mp.seller_id, mp.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_metafield_pending mp
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'metafield_pending' AND s.source_id = mp.id
             WHERE mp.status = 'pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY mp.created_at DESC LIMIT 500`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let sellerNoticeQ = { rows: [] }
        if (!sup && sid) {
          sellerNoticeQ = await client.query(
            `SELECT n.id, n.title, n.body, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'seller_notice' AND s.source_id = n.id
             WHERE n.type IN ('product_change_request_reviewed', 'metafield_proposal_reviewed', 'brand_authorization_reviewed')
               AND n.seller_id = $2
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 500`,
            [rk, sid],
          ).catch(() => ({ rows: [] }))
        }
        const metaDefByKey = {}
        if (sup && (metaPendingQ.rows || []).length > 0) {
          const keys = [...new Set((metaPendingQ.rows || []).map((r) => r.key).filter(Boolean))]
          if (keys.length > 0) {
            const defQ = await client.query(
              `SELECT key, label, values FROM admin_hub_metafield_definitions WHERE key = ANY($1::varchar[])`,
              [keys],
            ).catch(() => ({ rows: [] }))
            for (const row of defQ.rows || []) {
              metaDefByKey[row.key] = row
            }
          }
        }
        await client.end()

        const crShortVal = (val) => {
          if (val == null || val === '') return '—'
          const s = String(val).trim()
          if (!s) return '—'
          try {
            const j = JSON.parse(s)
            if (j !== null && typeof j === 'object') {
              const t = JSON.stringify(j)
              return t.length > 90 ? `${t.slice(0, 89)}…` : t
            }
          } catch (_) { /* plain string */ }
          const one = s.replace(/\s+/g, ' ')
          return one.length > 100 ? `${one.slice(0, 99)}…` : one
        }
        const crFieldDe = (fn) => {
          const f = String(fn || '')
          if (f === 'title') return 'Titel'
          if (f === 'description') return 'Beschreibung'
          if (f.startsWith('metadata.')) return `Meta (${f.replace(/^metadata\./, '')})`
          return f || '—'
        }

        const orderFeedItems = []
        for (const r of ordersQ.rows || []) {
          orderFeedItems.push({
            source_type: 'order',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            order_number: r.order_number,
            first_name: r.first_name,
            last_name: r.last_name,
            total_cents: r.total_cents,
            title: `Neue Bestellung #${r.order_number != null ? r.order_number : '—'}`,
            subtitle: `${r.first_name || ''} ${r.last_name || ''}`.trim() + (r.total_cents ? ` · ${(Number(r.total_cents) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €` : ''),
            href: `/orders/${r.id}`,
          })
        }
        const returnFeedItems = []
        for (const r of returnsQ.rows || []) {
          returnFeedItems.push({
            source_type: 'return',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            return_number: r.return_number,
            order_number: r.order_number,
            status: r.status,
            title: `Rückgabeanfrage R-${r.return_number != null ? r.return_number : '—'}`,
            subtitle: `Bestellung #${r.order_number != null ? r.order_number : '—'} · ${r.status || ''}`,
            href: '/orders/returns',
          })
        }
        const verificationFeedItems = []
        for (const r of verQ.rows || []) {
          verificationFeedItems.push({
            source_type: 'verification',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: r.title || 'Evrak',
            subtitle: r.body || '',
            href: r.seller_user_id ? `/sellers/${r.seller_user_id}` : (r.seller_id ? `/sellers/${r.seller_id}` : '/sellers'),
          })
        }
        const campaignSubmittedFeedItems = []
        for (const r of campaignSubmittedQ.rows || []) {
          const campId = r.reference_id ? String(r.reference_id) : ''
          campaignSubmittedFeedItems.push({
            source_type: 'campaign_submitted',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: r.title || 'Neue Werbekampagne',
            subtitle: r.body || '',
            href: campId ? `/marketing/campaigns/${campId}` : '/marketing/campaigns',
          })
        }
        const sellerListingFeedItems = []
        for (const r of sellerListingQ.rows || []) {
          const pid = r.reference_id ? String(r.reference_id) : ''
          sellerListingFeedItems.push({
            source_type: 'seller_listing_pending',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: r.title || 'Neuer Verkäufer für vorhandenes Produkt',
            subtitle: r.body || '',
            href: pid ? `/products/${pid}` : '/products/inventory',
            product_id: pid || undefined,
            seller_id: r.seller_id || undefined,
          })
        }
        const brandAuthFeedItems = []
        for (const r of brandAuthQ.rows || []) {
          brandAuthFeedItems.push({
            source_type: 'brand_authorization_pending',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: r.title || 'Marka yetkilendirme bekliyor',
            subtitle: r.body || '',
            href: '/content/brands/authorizations',
            brand_id: r.reference_id ? String(r.reference_id) : undefined,
            seller_id: r.seller_id || undefined,
          })
        }
        const flowFailureFeedItems = []
        for (const r of flowFailuresQ.rows || []) {
          flowFailureFeedItems.push({
            source_type: 'flow_send_failed',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: r.title || 'Flow-Mail fehlgeschlagen',
            subtitle: r.body || '',
            href: '/marketing/automations',
            flow_id: r.reference_id ? String(r.reference_id) : undefined,
          })
        }
        const productChangeFeedItems = []
        for (const r of crQ.rows || []) {
          const pid = r.product_id ? String(r.product_id) : ''
          const sub = `${r.product_title || 'Produkt'} · ${crFieldDe(r.field_name)} — Aktuell: ${crShortVal(r.old_value)} → Vorschlag: ${crShortVal(r.new_value)}`
          productChangeFeedItems.push({
            source_type: 'product_change_request',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: 'Produktänderung ausstehend',
            subtitle: sub.length > 500 ? `${sub.slice(0, 499)}…` : sub,
            href: pid ? `/products/${pid}` : '/products/inventory',
            product_id: pid || undefined,
            product_title: r.product_title || undefined,
            seller_id: r.seller_id || undefined,
            field_name: r.field_name,
            old_value: r.old_value,
            new_value: r.new_value,
          })
        }
        const metafieldSuggestionFeedItems = []
        for (const r of metaPendingQ.rows || []) {
          const def = metaDefByKey[r.key]
          const currentVals = Array.isArray(def?.values) ? def.values : []
          const proposedVals = Array.isArray(r.proposed_values) ? r.proposed_values : []
          metafieldSuggestionFeedItems.push({
            source_type: 'metafield_pending',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: 'Metafield-Änderungsvorschlag',
            subtitle: `${r.label || r.key} · Vorschläge: ${proposedVals.join(', ')}`,
            href: '/content/metaobjects',
            metafield_key: r.key,
            metafield_label: r.label || def?.label || r.key,
            field_name: `metafield.${r.key}`,
            old_value: JSON.stringify(currentVals),
            new_value: JSON.stringify(proposedVals),
            seller_id: r.seller_id || undefined,
          })
        }
        const sellerNoticeFeedItems = []
        for (const r of sellerNoticeQ.rows || []) {
          const ref = r.reference_id ? String(r.reference_id) : ''
          sellerNoticeFeedItems.push({
            source_type: 'seller_notice',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: r.title || 'Hinweis',
            subtitle: r.body || '',
            href: ref ? `/products/${ref}` : '/products/inventory',
          })
        }

        const groupedMode = req.query.grouped === '1' || req.query.grouped === 'true'
        if (groupedMode) {
          const groups = [
            {
              key: 'order',
              label_de: 'Bestellungen',
              description_de: 'Neue Bestellungen und Bestellübersicht',
              items: orderFeedItems,
            },
            {
              key: 'return',
              label_de: 'Rücksendungen',
              description_de: 'Rückgabeanfragen und Erstattungen',
              items: returnFeedItems,
            },
          ]
          if (sup) {
            groups.push(
              {
                key: 'verification',
                label_de: 'Verifizierung & Evrak',
                description_de: 'Verkäufer-Verifizierung und eingereichte Dokumente',
                items: verificationFeedItems,
              },
              {
                key: 'change_suggestion',
                label_de: 'Änderungsvorschläge',
                description_de: 'Ausstehende Freigaben für Produkt- und Metafield-Änderungen',
                items: [...productChangeFeedItems, ...metafieldSuggestionFeedItems].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
              },
              {
                key: 'campaign_submitted',
                label_de: 'Werbekampagnen',
                description_de: 'Neue PPC-Kampagnen von Verkäufern',
                items: campaignSubmittedFeedItems,
              },
              {
                key: 'seller_listing_pending',
                label_de: 'Neue Verkäufer-Angebote',
                description_de: 'Verkäufer haben vorhandene Produkte (gleiche EAN) als Entwurf zu ihrem Bestand hinzugefügt',
                items: sellerListingFeedItems,
              },
              {
                key: 'brand_authorization_pending',
                label_de: 'Markenautorisierung',
                description_de: 'Verkäufer warten auf Freigabe für registrierte Marken oder Vertriebspartnerschaften',
                items: brandAuthFeedItems,
              },
              {
                key: 'flow_send_failed',
                label_de: 'Flow-Mail-Fehler',
                description_de: 'Automatisierte E-Mails, die beim Versand fehlgeschlagen sind',
                items: flowFailureFeedItems,
              },
            )
          }
          if (!sup) {
            groups.push({
              key: 'seller_notice',
              label_de: 'Freigabe-Ergebnisse',
              description_de: 'Ergebnisse zu Ihren Vorschlägen mit Produkt-Link',
              items: sellerNoticeFeedItems,
            })
          }
          const grand_total = groups.reduce((s, g) => s + g.items.length, 0)
          return res.json({
            grouped: true,
            groups: groups.map((g) => ({ ...g, total: g.items.length })),
            grand_total,
          })
        }

        const items = [...orderFeedItems, ...returnFeedItems, ...verificationFeedItems, ...productChangeFeedItems, ...metafieldSuggestionFeedItems, ...sellerNoticeFeedItems, ...campaignSubmittedFeedItems, ...sellerListingFeedItems, ...brandAuthFeedItems, ...flowFailureFeedItems]
        items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        const total = items.length
        const paged = items.slice(off, off + lim)
        res.json({ items: paged, total, offset: off, limit: lim })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubNotificationsDeletePOST = async (req, res) => {
      const ctx = getNotifRecipientContext(req)
      if (!ctx) return res.status(401).json({ message: 'Unauthorized' })
      const body = req.body || {}
      const all = !!body.all
      const items = Array.isArray(body.items) ? body.items : []
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const rk = ctx.recipientKey
        const sup = ctx.isSuperuser
        const sid = ctx.sellerId
        const markDeleted = async (sourceType, sourceId) => {
          await client.query(
            `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
             VALUES ($1::varchar, $2::varchar, $3::uuid, now())
             ON CONFLICT (recipient_key, source_type, source_id)
             DO UPDATE SET deleted_at = now()`,
            [rk, sourceType, sourceId],
          )
        }
        if (all) {
          await client.query(
            `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
             SELECT $1::varchar, 'order', o.id, now() FROM store_orders o
             WHERE ($2::boolean OR o.seller_id = $3 OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $3)
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $3)
              )
            ))
             ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
            [rk, sup, sid],
          )
          await client.query(
            `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
             SELECT $1::varchar, 'return', r.id, now()
             FROM store_returns r INNER JOIN store_orders o ON o.id = r.order_id
             WHERE ($2::boolean OR o.seller_id = $3 OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $3)
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $3)
              )
            ))
             ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
            [rk, sup, sid],
          )
          if (sup) {
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'verification', n.id, now()
               FROM admin_hub_notifications n WHERE n.type = 'verification_submitted'
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk],
            )
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'product_change_request', cr.id, now()
               FROM admin_hub_product_change_requests cr
               WHERE cr.status = 'pending'
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk],
            )
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'metafield_pending', mp.id, now()
               FROM admin_hub_metafield_pending mp
               WHERE mp.status = 'pending'
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk],
            ).catch(() => {})
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'campaign_submitted', n.id, now()
               FROM admin_hub_notifications n WHERE n.type = 'campaign_submitted'
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk],
            ).catch(() => {})
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'seller_listing_pending', n.id, now()
               FROM admin_hub_notifications n WHERE n.type = 'seller_listing_pending'
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk],
            ).catch(() => {})
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'brand_authorization_pending', n.id, now()
               FROM admin_hub_notifications n WHERE n.type = 'brand_authorization_pending'
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk],
            ).catch(() => {})
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'flow_send_failed', n.id, now()
               FROM admin_hub_notifications n WHERE n.type = 'flow_send_failed'
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk],
            ).catch(() => {})
          } else if (sid) {
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'seller_notice', n.id, now()
               FROM admin_hub_notifications n
               WHERE n.type IN ('product_change_request_reviewed', 'metafield_proposal_reviewed', 'brand_authorization_reviewed')
                 AND n.seller_id = $2
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk, sid],
            ).catch(() => {})
          }
        } else {
          for (const it of items) {
            const st = String(it.source_type || '').trim()
            const id = it.source_id
            if (!st || !id) continue
            if (!sup && (st === 'product_change_request' || st === 'metafield_pending' || st === 'verification' || st === 'campaign_submitted' || st === 'seller_listing_pending' || st === 'brand_authorization_pending' || st === 'flow_send_failed')) continue
            await markDeleted(st, id)
          }
        }
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

  const router = Router()
  router.get('/admin-hub/v1/notifications/unread', adminHubNotificationsUnreadGET)
  router.post('/admin-hub/v1/notifications/mark-seen', adminHubNotificationsMarkSeenPOST)
  router.get('/admin-hub/v1/notifications/feed', adminHubNotificationsFeedGET)
  router.post('/admin-hub/v1/notifications/delete', adminHubNotificationsDeletePOST)
  return router
}
