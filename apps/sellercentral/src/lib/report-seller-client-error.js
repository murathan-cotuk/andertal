import { getClientLocale } from "@/lib/api-error-messages";
import { readSellerIsSuperuser } from "@/lib/seller-system-errors";

const DEDUP_MS = 15 * 60 * 1000;
const recentKeys = new Map();

function dedupKey({ errorCode, context, message }) {
  return `${errorCode || ""}|${context || ""}|${String(message || "").slice(0, 120)}`;
}

function shouldSkip({ errorCode, context, message }) {
  const key = dedupKey({ errorCode, context, message });
  const now = Date.now();
  const prev = recentKeys.get(key);
  if (prev && now - prev < DEDUP_MS) return true;
  recentKeys.set(key, now);
  return false;
}

/**
 * Report a client-side or API error to the backend issue log (visible at /sellers/errors).
 * Sellers only — superusers are not reported (they are the operators).
 */
export async function reportSellerClientError({
  errorCode = "CLIENT_ERROR",
  errorMessage,
  terminalOutput,
  context,
  pageUrl,
} = {}) {
  if (typeof window === "undefined") return;
  if (readSellerIsSuperuser()) return;
  const message = String(errorMessage || "").trim();
  if (!message) return;

  const ctx = context || pageUrl || window.location.pathname || "";
  if (shouldSkip({ errorCode, context: ctx, message })) return;

  const token = localStorage.getItem("sellerToken");
  if (!token) return;

  const base = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "";
  if (!base || base.startsWith("undefined")) return;

  try {
    await fetch(`${base}/admin-hub/v1/seller-errors/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        error_code: errorCode,
        error_message: message,
        terminal_output: terminalOutput || null,
        context: ctx,
        page_url: pageUrl || window.location.pathname,
        locale: getClientLocale(),
      }),
    });
  } catch {
    /* best-effort */
  }
}
