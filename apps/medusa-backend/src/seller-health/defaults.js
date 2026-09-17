'use strict'

/**
 * Default Seller Health scoring config (docs: Sellercentral → Analysen → Seller Health).
 * Seeded once into seller_health_categories_config / seller_health_criteria_config on first
 * boot (see routes/seller-health.js) — after that, the DB rows are the source of truth and a
 * superuser can edit weights/thresholds via "Edit all" without a code deploy. This file is only
 * ever read again by "Reset to defaults".
 *
 * Category max_points must sum to 100; each category's criteria max_points must sum to that
 * category's max_points. Verified by a self-check at the bottom (throws on boot if wrong).
 */

const CATEGORIES = [
  { id: 'product_quality', label: 'Product & Content Quality', max_points: 20, sort_order: 1 },
  { id: 'legal_compliance', label: 'Legal & Compliance', max_points: 15, sort_order: 2 },
  { id: 'order_fulfillment', label: 'Order Fulfillment', max_points: 20, sort_order: 3 },
  { id: 'shipping', label: 'Shipping Performance', max_points: 15, sort_order: 4 },
  { id: 'returns_refunds', label: 'Returns & Refunds', max_points: 10, sort_order: 5 },
  { id: 'customer_satisfaction', label: 'Customer Satisfaction', max_points: 10, sort_order: 6 },
  { id: 'reliability_communication', label: 'Seller Reliability & Communication', max_points: 5, sort_order: 7 },
  { id: 'risk_trust', label: 'Risk & Trust', max_points: 5, sort_order: 8 },
]

// calculation_type reference (interpreted by seller-health/calculators.js):
//   CHECKLIST              — config.weights ignored here; score = passRatio * maxPoints (code owns
//                            the individual checks per criterion id, config only carries maxPoints)
//   THRESHOLD_LOWER_BETTER — config: {excellent, good, average, poor} — measured value in the
//                            criterion's own unit (hours, or a 0-1 rate); lower = better
//   THRESHOLD_HIGHER_BETTER— same shape, higher = better (rates like on-time %, SLA %)
//   EVENT_COUNT_PENALTY    — config: {pointsPerEvent} — deducts from seller_health_events rows
//   RATING_WITH_CONFIDENCE — config: {excellent, good, average, poor} on a 1-5 star scale, scaled
//                            down for low review counts so a new seller isn't over/under-scored
//   TREND                 — config: {excellent, good, average, poor} on the DELTA between two
//                            windows (e.g. avg rating this 30d vs prior 30d)
//   TRUST_SIGNALS         — bespoke positive checklist (tenure, order volume, verified company…)
//   NOT_AUTOMATED         — always full marks; the UI shows "not automatically tracked yet" —
//                           used only where this session's schema audit found no real signal to
//                           compute from (refund-amount errors, payment-network chargebacks) —
//                           never a silent fake pass, always disclosed in the criterion description
const CRITERIA = [
  // ── Product & Content Quality (20) ──────────────────────────────────────────
  {
    id: 'content_completeness', category_id: 'product_quality', max_points: 5, sort_order: 1,
    calculation_type: 'CHECKLIST', min_sample_size: 1,
    label: 'Product Content Completeness',
    description: 'Title, description, bullet points, brand, manufacturer, EAN/GTIN, SKU, and at least one image, present on every active product.',
    config: {},
  },
  {
    id: 'content_quality', category_id: 'product_quality', max_points: 4, sort_order: 2,
    calculation_type: 'CHECKLIST', min_sample_size: 1,
    label: 'Product Content Quality',
    description: 'Descriptions long enough to be useful, no duplicate titles/descriptions within your own catalog, at least one real image per product.',
    config: { minDescriptionLength: 40 },
  },
  {
    id: 'data_accuracy', category_id: 'product_quality', max_points: 3, sort_order: 3,
    calculation_type: 'CHECKLIST', min_sample_size: 1,
    label: 'Product Data Accuracy',
    description: 'Category assigned and price set on every active product.',
    config: {},
  },
  {
    id: 'legal_product_data', category_id: 'product_quality', max_points: 5, sort_order: 4,
    calculation_type: 'CHECKLIST', min_sample_size: 1,
    label: 'Legal Product Data (GPSR/EPREL/WEEE…)',
    description: 'Category-specific mandatory legal fields (manufacturer address, responsible person, EPREL/WEEE numbers, energy label, etc. — resolved per product\'s own compliance profile) are filled in.',
    config: {},
  },
  {
    id: 'catalog_quality_signals', category_id: 'product_quality', max_points: 3, sort_order: 5,
    calculation_type: 'CHECKLIST', min_sample_size: 1,
    label: 'Catalog Quality Signals',
    description: 'No duplicate EAN within your own catalog, no malformed SKU, every product mapped to a category.',
    config: {},
  },

  // ── Legal & Compliance (15) ──────────────────────────────────────────────────
  {
    id: 'seller_verification', category_id: 'legal_compliance', max_points: 3, sort_order: 1,
    calculation_type: 'CHECKLIST', min_sample_size: 1,
    label: 'Seller Verification',
    description: 'Business approved, company name, tax ID, VAT ID, IBAN and business address on file.',
    config: {},
  },
  {
    id: 'marketplace_compliance', category_id: 'legal_compliance', max_points: 3, sort_order: 2,
    calculation_type: 'CHECKLIST', min_sample_size: 1,
    label: 'Marketplace Compliance',
    description: 'Seller agreement accepted and on-boarding documents submitted.',
    config: {},
  },
  {
    id: 'product_compliance', category_id: 'legal_compliance', max_points: 4, sort_order: 3,
    calculation_type: 'CHECKLIST', min_sample_size: 1,
    label: 'Product Compliance Coverage',
    description: 'Share of active products that are fully compliant (no missing or invalid legal field at all), not just the average field count from "Legal Product Data".',
    config: {},
  },
  {
    id: 'legal_document_completeness', category_id: 'legal_compliance', max_points: 2, sort_order: 4,
    calculation_type: 'CHECKLIST', min_sample_size: 1,
    label: 'Legal Document Completeness',
    description: 'Trade register extract, ID/passport, and (where applicable) LUCID packaging registration on file.',
    config: {},
  },
  {
    id: 'compliance_violations', category_id: 'legal_compliance', max_points: 3, sort_order: 5,
    calculation_type: 'EVENT_COUNT_PENALTY', min_sample_size: 0,
    label: 'Compliance Violations',
    description: 'Unresolved compliance/legal violation events on file for this seller.',
    config: { pointsPerEvent: 1, eventTypes: ['legal_violation', 'counterfeit_suspicion', 'repeated_policy_violation'] },
  },

  // ── Order Fulfillment (20) ───────────────────────────────────────────────────
  {
    id: 'order_processing_time', category_id: 'order_fulfillment', max_points: 6, sort_order: 1,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 5,
    label: 'Order Processing Time', unit: 'hours',
    description: 'Average hours from order paid to shipped.',
    config: { excellent: 24, good: 48, average: 72, poor: 120 },
  },
  {
    id: 'cancellation_rate', category_id: 'order_fulfillment', max_points: 4, sort_order: 2,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 5,
    label: 'Order Cancellation Rate', unit: 'ratio',
    description: 'Share of orders cancelled. The current data model does not yet distinguish a seller-caused cancellation from a customer-requested one — every cancellation counts equally until that field exists.',
    config: { excellent: 0.02, good: 0.05, average: 0.1, poor: 0.2 },
  },
  {
    id: 'order_defect_rate', category_id: 'order_fulfillment', max_points: 4, sort_order: 3,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 5,
    label: 'Order Defect Rate', unit: 'ratio',
    description: 'Share of orders with a return whose stated reason indicates a seller-caused defect (damaged, wrong item, not as described).',
    config: { excellent: 0.01, good: 0.03, average: 0.06, poor: 0.12 },
  },
  {
    id: 'order_confirmation_accuracy', category_id: 'order_fulfillment', max_points: 2, sort_order: 4,
    calculation_type: 'THRESHOLD_HIGHER_BETTER', min_sample_size: 5,
    label: 'Order Confirmation Accuracy', unit: 'ratio',
    description: 'Share of paid orders that left "open" status within 48h instead of stalling.',
    config: { excellent: 0.98, good: 0.95, average: 0.9, poor: 0.8, stallHours: 48 },
  },
  {
    id: 'sla_compliance', category_id: 'order_fulfillment', max_points: 4, sort_order: 5,
    calculation_type: 'THRESHOLD_HIGHER_BETTER', min_sample_size: 5,
    label: 'SLA Compliance', unit: 'ratio',
    description: 'Share of orders that were both shipped within the processing-time target and free of a defect-return.',
    config: { excellent: 0.97, good: 0.93, average: 0.85, poor: 0.7 },
  },

  // ── Shipping Performance (15) ────────────────────────────────────────────────
  {
    id: 'dispatch_time', category_id: 'shipping', max_points: 4, sort_order: 1,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 5,
    label: 'Dispatch Time', unit: 'hours',
    description: 'Average hours from order paid to handed over to the carrier.',
    config: { excellent: 24, good: 48, average: 72, poor: 120 },
  },
  {
    id: 'delivery_time', category_id: 'shipping', max_points: 4, sort_order: 2,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 5,
    label: 'Delivery Time', unit: 'hours',
    description: 'Average hours from handed to carrier to delivered.',
    config: { excellent: 48, good: 96, average: 144, poor: 240 },
  },
  {
    id: 'on_time_delivery_rate', category_id: 'shipping', max_points: 3, sort_order: 3,
    calculation_type: 'THRESHOLD_HIGHER_BETTER', min_sample_size: 5,
    label: 'On-Time Delivery Rate', unit: 'ratio',
    description: 'Share of delivered orders arriving within the target delivery window (no promised-delivery-date field exists yet, so this uses a configurable target window from dispatch instead).',
    config: { excellent: 0.95, good: 0.9, average: 0.8, poor: 0.6, targetDays: 5 },
  },
  {
    id: 'tracking_quality', category_id: 'shipping', max_points: 2, sort_order: 4,
    calculation_type: 'THRESHOLD_HIGHER_BETTER', min_sample_size: 5,
    label: 'Tracking Quality', unit: 'ratio',
    description: 'Share of shipped orders with both a tracking number and a carrier on file.',
    config: { excellent: 0.98, good: 0.9, average: 0.75, poor: 0.5 },
  },
  {
    id: 'shipping_incident_rate', category_id: 'shipping', max_points: 2, sort_order: 5,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 5,
    label: 'Shipping Incident Rate', unit: 'ratio',
    description: 'Share of shipped orders with a return citing a shipping-related problem (lost, damaged in transit).',
    config: { excellent: 0.01, good: 0.03, average: 0.06, poor: 0.12 },
  },

  // ── Returns & Refunds (10) ───────────────────────────────────────────────────
  {
    id: 'return_rate', category_id: 'returns_refunds', max_points: 3, sort_order: 1,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 5,
    label: 'Return Rate', unit: 'ratio',
    description: 'Share of orders returned, weighted so seller-caused reasons (defective, wrong item, not as described) count more heavily than customer-choice reasons (changed mind, wrong size) — the underlying reason text is free-form, not yet a fixed taxonomy, so this is a best-effort keyword match.',
    config: { excellent: 0.03, good: 0.05, average: 0.08, poor: 0.12, sellerFaultWeight: 2 },
  },
  {
    id: 'return_processing_time', category_id: 'returns_refunds', max_points: 3, sort_order: 2,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 3,
    label: 'Return Processing Time', unit: 'hours',
    description: 'Average hours from return requested to approved/refunded (no separate "refund completed" timestamp exists yet, so approval time is used as the closest available proxy).',
    config: { excellent: 48, good: 72, average: 120, poor: 240 },
  },
  {
    id: 'refund_sla_compliance', category_id: 'returns_refunds', max_points: 2, sort_order: 3,
    calculation_type: 'THRESHOLD_HIGHER_BETTER', min_sample_size: 3,
    label: 'Refund SLA Compliance', unit: 'ratio',
    description: 'Share of returns approved/refunded within the target window.',
    config: { excellent: 0.95, good: 0.85, average: 0.7, poor: 0.5, targetHours: 72 },
  },
  {
    id: 'refund_error_rate', category_id: 'returns_refunds', max_points: 2, sort_order: 4,
    calculation_type: 'NOT_AUTOMATED', min_sample_size: 0,
    label: 'Refund Error Rate',
    description: 'Wrong amount / duplicate / missing refunds. Not automatically tracked yet — no field distinguishes a corrected refund from a first-time one. Full marks until this is instrumented.',
    config: {},
  },

  // ── Customer Satisfaction (10) ───────────────────────────────────────────────
  {
    id: 'product_rating', category_id: 'customer_satisfaction', max_points: 4, sort_order: 1,
    calculation_type: 'RATING_WITH_CONFIDENCE', min_sample_size: 1,
    label: 'Product Rating', unit: 'stars',
    description: 'Average product rating across all of this seller\'s reviews, scaled down when the review count is too low to be a confident signal.',
    config: { excellent: 4.8, good: 4.5, average: 4.2, poor: 4.0 },
  },
  {
    id: 'negative_review_rate', category_id: 'customer_satisfaction', max_points: 2, sort_order: 2,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 5,
    label: 'Negative Review Rate', unit: 'ratio',
    description: 'Share of reviews at 1-2 stars.',
    config: { excellent: 0.02, good: 0.05, average: 0.1, poor: 0.2 },
  },
  {
    id: 'complaint_rate', category_id: 'customer_satisfaction', max_points: 2, sort_order: 3,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 5,
    label: 'Customer Complaint Rate', unit: 'ratio',
    description: 'Support cases opened per order.',
    config: { excellent: 0.01, good: 0.03, average: 0.06, poor: 0.12 },
  },
  {
    id: 'satisfaction_trend', category_id: 'customer_satisfaction', max_points: 2, sort_order: 4,
    calculation_type: 'TREND', min_sample_size: 3,
    label: 'Customer Satisfaction Trend', unit: 'stars_delta',
    description: 'Change in average rating between the last 30 days and the 30 days before that.',
    config: { excellent: 0.1, good: 0, average: -0.2, poor: -0.5 },
  },

  // ── Seller Reliability & Communication (5) ──────────────────────────────────
  {
    id: 'response_time', category_id: 'reliability_communication', max_points: 2, sort_order: 1,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 2,
    label: 'Seller Response Time', unit: 'hours',
    description: 'Average hours from a support case being opened to the seller\'s first reply.',
    config: { excellent: 6, good: 24, average: 48, poor: 96 },
  },
  {
    id: 'response_rate', category_id: 'reliability_communication', max_points: 1, sort_order: 2,
    calculation_type: 'THRESHOLD_HIGHER_BETTER', min_sample_size: 2,
    label: 'Response Rate', unit: 'ratio',
    description: 'Share of support cases that got at least one seller reply.',
    config: { excellent: 0.95, good: 0.85, average: 0.7, poor: 0.5 },
  },
  {
    id: 'issue_resolution_time', category_id: 'reliability_communication', max_points: 1, sort_order: 3,
    calculation_type: 'THRESHOLD_LOWER_BETTER', min_sample_size: 2,
    label: 'Issue Resolution Time', unit: 'hours',
    description: 'Average hours from a support case opening to it being closed.',
    config: { excellent: 48, good: 96, average: 168, poor: 336 },
  },
  {
    id: 'seller_activity', category_id: 'reliability_communication', max_points: 1, sort_order: 4,
    calculation_type: 'CHECKLIST', min_sample_size: 0,
    label: 'Seller Activity',
    description: 'Any order handled or product updated in the last 30 days.',
    config: { activeWindowDays: 30 },
  },

  // ── Risk & Trust (5) ─────────────────────────────────────────────────────────
  {
    id: 'fraud_signals', category_id: 'risk_trust', max_points: 2, sort_order: 1,
    calculation_type: 'EVENT_COUNT_PENALTY', min_sample_size: 0,
    label: 'Fraud Signals',
    description: 'Unresolved fraud-risk events on file for this seller.',
    config: { pointsPerEvent: 1, eventTypes: ['fraud_risk', 'systematic_order_fraud'] },
  },
  {
    id: 'chargeback_rate', category_id: 'risk_trust', max_points: 1, sort_order: 2,
    calculation_type: 'NOT_AUTOMATED', min_sample_size: 0,
    label: 'Chargeback Rate',
    description: 'Payment-network chargebacks. Not automatically tracked yet — no dispute/chargeback data is captured in the current checkout pipeline. Full marks until this is instrumented.',
    config: {},
  },
  {
    id: 'policy_violation_history', category_id: 'risk_trust', max_points: 1, sort_order: 3,
    calculation_type: 'EVENT_COUNT_PENALTY', min_sample_size: 0,
    label: 'Policy Violation History',
    description: 'Unresolved marketplace policy violation events on file for this seller.',
    config: { pointsPerEvent: 0.5, eventTypes: ['repeated_policy_violation'] },
  },
  {
    id: 'trust_signals', category_id: 'risk_trust', max_points: 1, sort_order: 4,
    calculation_type: 'TRUST_SIGNALS', min_sample_size: 0,
    label: 'Trust Signals',
    description: 'Positive signals: marketplace tenure, order volume, and a verified business.',
    config: { tenureMonthsForFull: 12, orderCountForFull: 100 },
  },
]

const sumBy = (arr, fn) => Math.round(arr.reduce((s, x) => s + fn(x), 0) * 100) / 100
const categoryTotal = sumBy(CATEGORIES, (c) => c.max_points)
if (categoryTotal !== 100) {
  throw new Error(`seller-health defaults: category max_points sum to ${categoryTotal}, expected 100`)
}
for (const cat of CATEGORIES) {
  const ownCriteria = CRITERIA.filter((c) => c.category_id === cat.id)
  const criteriaTotal = sumBy(ownCriteria, (c) => c.max_points)
  if (criteriaTotal !== cat.max_points) {
    throw new Error(`seller-health defaults: category "${cat.id}" criteria sum to ${criteriaTotal}, expected ${cat.max_points}`)
  }
}

module.exports = { CATEGORIES, CRITERIA }
