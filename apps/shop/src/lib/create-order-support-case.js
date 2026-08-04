import { getToken } from "@andertal/lib";
import { getMedusaClient } from "@/lib/medusa-client";

function newIdempotencyKey(prefix = "order-msg") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a support case from an order message (replaces legacy POST /store/messages).
 * Returns { primary_case_id, cases } or throws / returns __error payload.
 */
export async function createOrderSupportCase({
  orderId,
  itemIds,
  title,
  description,
  locale = "de",
  category = "seller",
  subcategory = "message",
}) {
  const ids = (Array.isArray(itemIds) ? itemIds : []).map(String).filter(Boolean);
  if (!orderId || !ids.length || !String(description || "").trim()) {
    return { __error: true, status: 400, message: "order_id, item_ids and description required" };
  }
  const token = getToken("customer");
  return getMedusaClient().request("/store/support/cases", {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category,
      subcategory,
      title: String(title || "Nachricht zur Bestellung").slice(0, 200),
      description: String(description).trim().slice(0, 10000),
      order_id: orderId,
      item_ids: ids,
      locale,
      idempotency_key: newIdempotencyKey(),
    }),
  });
}

export function primaryCaseIdFromCreate(result) {
  return result?.primary_case_id || result?.cases?.[0]?.id || "";
}
