/**
 * Customer-facing text for order cancel / return errors: the backend sends a stable `code`
 * (store-checkout.js) — translated here; unknown codes fall back to the backend message.
 * `t` = useTranslations("orderErrors").
 */
export function orderErrorText(t, res, fallback) {
  const code = res?.code;
  if (code) {
    try {
      const text = t(code, { days: res?.return_days ?? res?.details?.return_days ?? 14 });
      if (text && text !== code && !String(text).startsWith("orderErrors.")) return text;
    } catch (_) { /* unknown key */ }
  }
  return res?.message || fallback;
}
