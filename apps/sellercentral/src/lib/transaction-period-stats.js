/** Period KPIs for analytics/transactions — same math as Provisionsrechnung / Billing. */

export function isPaidOrderTx(tx) {
  const type = String(tx?.type || "order");
  if (type === "return" || type === "ledger_adjustment") return false;
  return String(tx?.payment_status || "").toLowerCase() === "bezahlt";
}

export function sellerPeriodPayoutCents({
  grossCents = 0,
  commissionCents = 0,
  shippingPayoutCents = 0,
  labelBalanceCents = 0,
} = {}) {
  return Math.max(
    0,
    Math.round(Number(grossCents) || 0)
      - Math.round(Number(commissionCents) || 0)
      + Math.round(Number(shippingPayoutCents) || 0)
      - Math.round(Number(labelBalanceCents) || 0),
  );
}

function customerShippingCents(tx) {
  if (tx?.shipping_customer_cents != null) return Number(tx.shipping_customer_cents || 0);
  return Number(tx?.shipping_cents || 0);
}

function platformShippingCents(tx) {
  if (tx?.shipping_platform_cents != null) return Number(tx.shipping_platform_cents || 0);
  return 0;
}

function payoutShippingCents(tx) {
  if (tx?.shipping_payout_cents != null) return Number(tx.shipping_payout_cents || 0);
  return customerShippingCents(tx);
}

export function summarizeSellerPeriodTransactions(periodTx) {
  const rows = Array.isArray(periodTx) ? periodTx : [];
  const orders = rows.filter(isPaidOrderTx);
  const labels = rows.filter(
    (t) =>
      t.type === "ledger_adjustment" &&
      t.adjustment_type === "shipping_label" &&
      String(t.charge_method || "balance") !== "card",
  );
  const gross = orders.reduce((s, t) => s + Number(t.total_cents || 0), 0);
  const commission = orders.reduce((s, t) => s + Number(t.commission_cents || 0), 0);
  const shippingCustomer = orders.reduce((s, t) => s + customerShippingCents(t), 0);
  const shippingPayout = orders.reduce((s, t) => s + payoutShippingCents(t), 0);
  const shippingPlatformFromOrders = orders.reduce((s, t) => s + platformShippingCents(t), 0);
  const shippingPlatformFromLedger = labels.reduce((s, t) => s + Math.abs(Number(t.total_cents || t.payout_cents || 0)), 0);
  const shippingPlatform = shippingPlatformFromOrders > 0 ? shippingPlatformFromOrders : shippingPlatformFromLedger;
  const customerPaid = orders.reduce((s, t) => s + Number(t.customer_paid_cents || 0), 0);
  const refunds = orders.reduce((s, t) => s + Number(t.refund_cents || 0), 0);
  const commissionVat = orders.reduce((s, t) => s + Number(t.commission_vat_cents || 0), 0);
  const withheld = Math.max(0, shippingCustomer - shippingPayout);
  const labelBalance = Math.max(0, shippingPlatform - withheld);
  const payout = sellerPeriodPayoutCents({
    grossCents: gross,
    commissionCents: commission,
    shippingPayoutCents: shippingPayout,
    labelBalanceCents: labelBalance,
  });
  return {
    gross,
    commission,
    shipping: shippingCustomer,
    shippingCustomer,
    shippingPlatform,
    shippingPayout,
    customerPaid,
    refunds,
    commissionVat,
    labelCents: shippingPlatform,
    payout,
    orderCount: orders.length,
  };
}
