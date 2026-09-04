/**
 * Shared by the /api/store-landing-page proxy route AND the homepage's server-side render
 * (apps/shop/src/app/[locale]/page.jsx) — keeps the fetch URL, revalidate window, and the
 * `{ __error }` failure shape identical across both, so SSR-fetched data and the client-fetch
 * fallback in LandingContainers.jsx can never drift into different shapes and cause a hydration
 * mismatch.
 */
const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function fetchLandingPage(suffix = "") {
  try {
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/landing-page${suffix}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 30 },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { __error: true, status: res.status, message: data?.message || res.statusText };
    }
    return data;
  } catch (e) {
    return { __error: true, status: 0, message: e?.message || "Network error" };
  }
}
