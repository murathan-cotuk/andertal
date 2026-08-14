'use strict'

/**
 * Canonical flow trigger families. Each dispatcher may only run its own keys, so a
 * support-ticket template that was accidentally saved as `order_placed` cannot email
 * sellers on checkout.
 */

const ORDER_TRIGGERS = [
  'order_placed',
  'order_processing',
  'order_shipped',
  'order_delivered',
  'return_requested',
  'return_requested_customer_ships',
  'review_request',
]

const MESSAGE_TRIGGERS = [
  'customer_message_sent',
  'seller_new_customer_message',
  'customer_message_replied',
  'seller_support_ticket_sent',
  'seller_support_ticket_replied',
]

const SUPPORT_CASE_TRIGGERS = [
  'customer_support_case_updated',
  'seller_support_case_updated',
  'admin_support_case_updated',
]

const SELLER_LIFECYCLE_TRIGGERS = [
  'seller_signup',
  'seller_docs_submitted',
  'seller_verification_approved',
  'seller_verification_rejected',
  'seller_documents_required',
]

const CUSTOMER_ACCOUNT_TRIGGERS = [
  'new_subscriber',
  'customer_signup',
  'abandoned_cart',
  'win_back',
  'customer_birthday',
  'favorite_low_stock',
  'favorite_price_drop',
]

const ORDER_SET = new Set(ORDER_TRIGGERS)
const MESSAGE_SET = new Set(MESSAGE_TRIGGERS)
const SUPPORT_CASE_SET = new Set(SUPPORT_CASE_TRIGGERS)
const SELLER_LIFECYCLE_SET = new Set(SELLER_LIFECYCLE_TRIGGERS)
const CUSTOMER_ACCOUNT_SET = new Set(CUSTOMER_ACCOUNT_TRIGGERS)

const ALL_FLOW_TRIGGER_KEYS = new Set([
  ...ORDER_TRIGGERS,
  ...MESSAGE_TRIGGERS,
  ...SUPPORT_CASE_TRIGGERS,
  ...SELLER_LIFECYCLE_TRIGGERS,
  ...CUSTOMER_ACCOUNT_TRIGGERS,
])

/** Distinctive copy from inbox / seller-support templates — must never send on checkout. */
const INBOX_OR_SUPPORT_TEMPLATE_HINTS = [
  '{message_body}',
  'anfrage an den support',
  'anfrage an de support',
  'support-anfrage',
  'support anfrage',
  'ihre anfrage an den support',
  'deine anfrage an den support',
  'antwort auf deine support',
  'antwort auf ihre support',
  'we received your support request',
  'reply to your support request',
  'destek talebiniz',
  'destek talebinize',
  'demande de support',
  'richiesta di supporto',
  'solicitud de soporte',
  'sellercentral-posteingang',
  'sellercentral inbox',
]

function isOrderDispatcherTrigger(triggerKey) {
  return ORDER_SET.has(String(triggerKey || '').trim())
}

function isMessageDispatcherTrigger(triggerKey) {
  const key = String(triggerKey || '').trim()
  return MESSAGE_SET.has(key) || SUPPORT_CASE_SET.has(key)
}

function isSellerLifecycleTrigger(triggerKey) {
  return SELLER_LIFECYCLE_SET.has(String(triggerKey || '').trim())
}

function isCustomerAccountTrigger(triggerKey) {
  return CUSTOMER_ACCOUNT_SET.has(String(triggerKey || '').trim())
}

function stepsBlob(steps) {
  return (Array.isArray(steps) ? steps : [])
    .map((step) => [step?.email_subject, step?.email_body, step?.email_i18n ? JSON.stringify(step.email_i18n) : ''].join('\n'))
    .join('\n')
    .toLowerCase()
}

function flowTemplateLooksLikeInboxOrSupport(steps) {
  const blob = stepsBlob(steps)
  if (!blob.trim()) return false
  return INBOX_OR_SUPPORT_TEMPLATE_HINTS.some((hint) => blob.includes(hint))
}

function shouldSkipOrderFlowTemplate(triggerKey, steps) {
  if (!isOrderDispatcherTrigger(triggerKey)) return true
  return flowTemplateLooksLikeInboxOrSupport(steps)
}

module.exports = {
  ORDER_TRIGGERS,
  MESSAGE_TRIGGERS,
  SUPPORT_CASE_TRIGGERS,
  SELLER_LIFECYCLE_TRIGGERS,
  CUSTOMER_ACCOUNT_TRIGGERS,
  ALL_FLOW_TRIGGER_KEYS,
  ORDER_SET,
  MESSAGE_SET,
  SUPPORT_CASE_SET,
  SELLER_LIFECYCLE_SET,
  CUSTOMER_ACCOUNT_SET,
  isOrderDispatcherTrigger,
  isMessageDispatcherTrigger,
  isSellerLifecycleTrigger,
  isCustomerAccountTrigger,
  flowTemplateLooksLikeInboxOrSupport,
  shouldSkipOrderFlowTemplate,
}
