/** Options for Insert dropdown (Antwortvorlagen / Nachrichten). */
export const MESSAGE_TEMPLATE_PLACEHOLDER_OPTIONS = [
  { label: "— Platzhalter einfügen", value: "" },
  { label: "{customer_name}", value: "{customer_name}" },
  { label: "{customer_email}", value: "{customer_email}" },
  { label: "{order_number}", value: "{order_number}" },
  { label: "{store_name}", value: "{store_name}" },
  { label: "{seller_name}", value: "{seller_name}" },
];

/**
 * Replace `{token}` placeholders. Unknown keys stay unchanged.
 * @param {string} template
 * @param {Record<string, string>} context
 */
export function applyMessagePlaceholders(template, context = {}) {
  if (template == null) return "";
  const ctx = context || {};
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const v = ctx[key];
    return v != null && String(v).length ? String(v) : `{${key}}`;
  });
}

export function buildCustomerInboxPlaceholderContext(thread, sellerNames) {
  if (!thread) return {};
  const name = [thread.order_first_name, thread.order_last_name].filter(Boolean).join(" ").trim();
  const sid = thread.order_seller_id != null ? String(thread.order_seller_id) : "";
  const store =
    (thread.seller_store_name && String(thread.seller_store_name).trim()) ||
    (sid && sellerNames?.[sid]) ||
    "";
  return {
    customer_name: name || thread.order_email || "",
    customer_email: thread.order_email || "",
    order_number: thread.order_number != null ? String(thread.order_number) : "",
    store_name: store,
    seller_name: store,
  };
}

export function buildSupportInboxPlaceholderContext(selectedSellerThread, sellerNames) {
  if (!selectedSellerThread) return {};
  const sid = selectedSellerThread.seller_id != null ? String(selectedSellerThread.seller_id) : "";
  const fromMsg = selectedSellerThread.messages?.find((m) => m.seller_store_name && String(m.seller_store_name).trim());
  const label =
    (fromMsg?.seller_store_name && String(fromMsg.seller_store_name).trim()) ||
    (sid && sellerNames?.[sid]) ||
    sid ||
    "";
  return {
    seller_name: label,
    store_name: label,
    customer_name: "",
    customer_email: "",
    order_number: "",
  };
}
