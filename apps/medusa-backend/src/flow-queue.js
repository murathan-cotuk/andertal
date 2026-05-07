const { Queue, Worker } = require('bullmq')

const FLOW_QUEUE_NAME = 'flow-email-events'

function isQueueEnabled() {
  return String(process.env.NOTIFICATION_QUEUE_ENABLED || '').trim().toLowerCase() === 'true'
}

function getRedisUrl() {
  return String(process.env.REDIS_URL || process.env.NOTIFICATION_REDIS_URL || '').trim()
}

function createConnectionOpts(redisUrl) {
  if (!redisUrl) return null
  // BullMQ accepts URL form directly.
  return { connection: { url: redisUrl } }
}

let queueSingleton = null
let workerSingleton = null

function getQueue() {
  if (!isQueueEnabled()) return null
  if (queueSingleton) return queueSingleton
  const redisUrl = getRedisUrl()
  if (!redisUrl) {
    console.warn('[flow-queue] queue disabled: REDIS_URL missing')
    return null
  }
  const opts = createConnectionOpts(redisUrl)
  queueSingleton = new Queue(FLOW_QUEUE_NAME, opts)
  return queueSingleton
}

async function enqueueFlowEvent(jobName, payload) {
  const q = getQueue()
  if (!q) return false
  const safePayload = payload && typeof payload === 'object' ? payload : {}
  const trigger = String(safePayload.triggerKey || '').trim().toLowerCase()
  const orderId = String(safePayload.orderId || '').trim().toLowerCase()
  const customerId = String(safePayload.customerId || '').trim().toLowerCase()
  const email = String(safePayload.email || '').trim().toLowerCase()
  const jobId = `${jobName}:${trigger}:${orderId || customerId || email || 'na'}`
  await q.add(jobName, safePayload, {
    jobId,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
  })
  return true
}

function startFlowQueueWorker({ onOrderEvent, onCustomerEvent }) {
  if (!isQueueEnabled()) return null
  if (workerSingleton) return workerSingleton
  const redisUrl = getRedisUrl()
  if (!redisUrl) return null
  const opts = createConnectionOpts(redisUrl)
  const worker = new Worker(
    FLOW_QUEUE_NAME,
    async (job) => {
      if (job.name === 'order-flow-event') {
        if (typeof onOrderEvent !== 'function') return
        await onOrderEvent(job.data || {})
        return
      }
      if (job.name === 'customer-flow-event') {
        if (typeof onCustomerEvent !== 'function') return
        await onCustomerEvent(job.data || {})
      }
    },
    {
      ...opts,
      concurrency: Math.max(1, Number(process.env.NOTIFICATION_QUEUE_CONCURRENCY || 4)),
    },
  )
  worker.on('failed', (job, err) => {
    console.error(
      `[flow-queue] job failed name=${job?.name || ''} id=${job?.id || ''}:`,
      err?.message || err,
    )
  })
  worker.on('completed', (job) => {
    if (String(process.env.NOTIFICATION_QUEUE_VERBOSE || '').toLowerCase() === 'true') {
      console.log(`[flow-queue] job completed name=${job?.name || ''} id=${job?.id || ''}`)
    }
  })
  workerSingleton = worker
  console.log('[flow-queue] worker started')
  return workerSingleton
}

module.exports = {
  isQueueEnabled,
  enqueueFlowEvent,
  startFlowQueueWorker,
}

