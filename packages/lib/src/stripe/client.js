import Stripe from "stripe";

// Lazy initialization - only create Stripe client when actually used
let stripeInstance = null;

const getStripe = () => {
  // Only initialize on server-side
  if (typeof window !== "undefined") {
    throw new Error("Stripe client can only be used on the server side");
  }

  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Missing STRIPE_SECRET_KEY environment variable");
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });
  }
  return stripeInstance;
};

// Export getter function instead of direct instance
// This prevents the error from being thrown when the module is imported
export const stripe = new Proxy({}, {
  get(target, prop) {
    const stripeClient = getStripe();
    const value = stripeClient[prop];
    return typeof value === "function" ? value.bind(stripeClient) : value;
  }
});

// Calculate commission (12% of order total)
export const calculateCommission = (amount) => {
  return Math.round(amount * 0.12);
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

