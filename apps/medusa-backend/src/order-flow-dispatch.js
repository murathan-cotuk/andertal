'use strict'

/** Order flow trigger via the queue, falling back to immediate execution (same as orders.js). */
async function dispatchOrderFlowEvent(triggerKey, orderId) {
  const tk = String(triggerKey || '').trim()
  const oid = String(orderId || '').trim()
  if (!tk || !oid) return
  try {
    const { enqueueFlowEvent } = require('./flow-queue')
    const queued = await enqueueFlowEvent('order-flow-event', { triggerKey: tk, orderId: oid })
    if (queued) return
  } catch (qe) {
    console.warn('[flow-queue] enqueue order event failed, fallback immediate:', qe?.message || qe)
  }
  setImmediate(() => {
    require('./flow-automation').runAutomationFlowsForOrder({ triggerKey: tk, orderId: oid }).catch((fe) => {
      console.warn(`runAutomationFlowsForOrder ${tk}:`, fe?.message || fe)
    })
  })
}

module.exports = { dispatchOrderFlowEvent }
