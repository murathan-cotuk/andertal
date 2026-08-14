'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  isOrderDispatcherTrigger,
  isMessageDispatcherTrigger,
  isSellerLifecycleTrigger,
  flowTemplateLooksLikeInboxOrSupport,
  shouldSkipOrderFlowTemplate,
} = require('./flow-triggers')

describe('flow trigger families', () => {
  it('keeps checkout, shipping and returns on the order dispatcher', () => {
    assert.equal(isOrderDispatcherTrigger('order_placed'), true)
    assert.equal(isOrderDispatcherTrigger('order_shipped'), true)
    assert.equal(isOrderDispatcherTrigger('return_requested'), true)
    assert.equal(isOrderDispatcherTrigger('review_request'), true)
  })

  it('does not run inbox or support-ticket triggers via the order dispatcher', () => {
    assert.equal(isOrderDispatcherTrigger('seller_support_ticket_sent'), false)
    assert.equal(isOrderDispatcherTrigger('seller_support_ticket_replied'), false)
    assert.equal(isOrderDispatcherTrigger('customer_message_sent'), false)
    assert.equal(isMessageDispatcherTrigger('seller_support_ticket_sent'), true)
    assert.equal(isMessageDispatcherTrigger('customer_support_case_updated'), true)
    assert.equal(isSellerLifecycleTrigger('seller_signup'), true)
    assert.equal(isSellerLifecycleTrigger('order_placed'), false)
  })

  it('skips support-ticket templates even if the flow was saved as order_placed', () => {
    const sent = [{
      email_subject: 'Deine Anfrage an den Support',
      email_body: '<p>wir haben deine Anfrage erhalten. {MESSAGE_BODY}</p>',
    }]
    const replied = [{
      email_subject: 'Antwort auf deine Support-Anfrage',
      email_body: '<p>unser Support-Team hat geantwortet.</p>',
    }]
    const confirmation = [{
      email_subject: 'Neue Bestellung #{ORDER_NUMBER}',
      email_body: '<p>Hallo {SELLER_NAME}, eine neue Bestellung ist eingegangen.</p>',
    }]
    assert.equal(flowTemplateLooksLikeInboxOrSupport(sent), true)
    assert.equal(flowTemplateLooksLikeInboxOrSupport(replied), true)
    assert.equal(flowTemplateLooksLikeInboxOrSupport(confirmation), false)
    assert.equal(shouldSkipOrderFlowTemplate('order_placed', sent), true)
    assert.equal(shouldSkipOrderFlowTemplate('order_placed', replied), true)
    assert.equal(shouldSkipOrderFlowTemplate('order_placed', confirmation), false)
    assert.equal(shouldSkipOrderFlowTemplate('seller_support_ticket_sent', confirmation), true)
  })
})
