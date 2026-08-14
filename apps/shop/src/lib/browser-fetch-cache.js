/**
 * Module-level (per browser tab) fetch-and-parse cache for client components.
 *
 * Unlike a serverless-side in-memory cache (which is per-instance and unreliable — every cold
 * Vercel function starts with an empty cache), this runs in the browser's own JS context, which
 * genuinely persists across client-side route changes within the same tab. Components like
 * ShopHeader remount on every page navigation (no shared layout) and re-fetch categories/menus
 * each time; this cache turns repeat navigations within the TTL window into a synchronous
 * cache hit instead of a fresh network round trip, cutting both browser→Vercel and
 * Vercel→Render request volume.
 *
 * Concurrent callers for the same URL share a single in-flight request (dedup), so two
 * components mounting at nearly the same time don't double-fetch either.
 */

const cache = new Map(); // url -> { data, expiresAt } | { promise }

export function cachedJsonFetch(url, { ttlMs = 60000, fetchOptions } = {}) {
  const now = Date.now();
  const entry = cache.get(url);
  if (entry) {
    if (entry.promise) return entry.promise;
    if (entry.expiresAt > now) return Promise.resolve(entry.data);
  }
  const promise = fetch(url, fetchOptions)
    .then((r) => r.json())
    .then((data) => {
      cache.set(url, { data, expiresAt: Date.now() + ttlMs });
      return data;
    })
    .catch((err) => {
      cache.delete(url);
      throw err;
    });
  cache.set(url, { promise });
  return promise;
}

/** Drop a cached entry (e.g. after an admin action that should invalidate it immediately). */
export function invalidateCachedFetch(url) {
  cache.delete(url);
}
