'use strict'

/**
 * Order header after a return's refund succeeded. Only a FULL refund makes the order 'refunded'
 * (settlement already sets payment_status = 'refunded' then; legacy orders without payables are
 * compared against the refunded return amounts). A partial refund closes the return phase: the
 * order goes back to 'abgeschlossen' (paid + delivered) unless another return is still open.
 * Previously every return refund set order_status = 'refunded' while payment_status stayed
 * 'bezahlt', so partially refunded orders looked fully refunded / never payable.
 */
async function syncOrderStatusAfterReturnRefund(client, orderId) {
  if (!orderId) return null
  const r = await client.query(
    `WITH refunded AS (
       SELECT COALESCE(SUM(refund_amount_cents) FILTER (WHERE refund_status = 'erstattet'), 0)::bigint AS cents,
              BOOL_OR(COALESCE(status, '') NOT IN ('abgelehnt', 'abgeschlossen') AND COALESCE(refund_status, '') <> 'erstattet') AS open_return
         FROM store_returns WHERE order_id = $1::uuid
     ), st AS (
       SELECT o.id,
              (o.payment_status = 'refunded'
                OR (NOT EXISTS (SELECT 1 FROM seller_payables p WHERE p.order_id = o.id)
                    AND COALESCE(o.total_cents, 0) > 0
                    AND (SELECT cents FROM refunded) >= o.total_cents)) AS full_refund,
              COALESCE((SELECT open_return FROM refunded), false) AS open_return
         FROM store_orders o WHERE o.id = $1::uuid
     )
     UPDATE store_orders o SET
       payment_status = CASE WHEN st.full_refund THEN 'refunded' ELSE o.payment_status END,
       order_status = CASE
         WHEN o.order_status = 'storniert' THEN o.order_status
         WHEN st.full_refund THEN 'refunded'
         WHEN st.open_return THEN o.order_status
         WHEN o.payment_status = 'bezahlt' AND o.delivery_status = 'zugestellt' THEN 'abgeschlossen'
         ELSE o.order_status
       END,
       updated_at = now()
     FROM st WHERE o.id = st.id
     RETURNING o.order_status, o.payment_status`,
    [orderId],
  )
  return r.rows[0] || null
}

module.exports = { syncOrderStatusAfterReturnRefund }
