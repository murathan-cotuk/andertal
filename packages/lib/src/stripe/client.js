import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

// Calculate commission (10% of order total)
export const calculateCommission = (amount) => {
  return Math.round(amount * 0.1);
};

// Create payout to seller (after commission)
export const createSellerPayout = async (sellerStripeAccountId, amount) => {
  const commission = calculateCommission(amount);
  const payoutAmount = amount - commission;

  // Transfer to seller's connected account
  const transfer = await stripe.transfers.create({
    amount: payoutAmount,
    currency: "usd",
    destination: sellerStripeAccountId,
  });

  return {
    transfer,
    commission,
    payoutAmount,
  };
};

// Create checkout session
export const createCheckoutSession = async (
  items,
  successUrl,
  cancelUrl,
  metadata
) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: items,
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });

  return session;
};

