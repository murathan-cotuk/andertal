"use client";

/**
 * sellerToken / sellerId / storeName / sellerEmail / sellerIsSuperuser identify who this
 * browser tab currently is. Impersonation must not overwrite other tabs' shared login, so
 * those keys can live in sessionStorage as a per-tab overlay.
 *
 * The first version of this shim *only* read sessionStorage. Tokens from before the shim
 * (and the shared login in localStorage) became invisible → every page called the API
 * without a Bearer token and rendered "Unauthorized".
 *
 * Rules:
 * - Normal login: read session, then fall back to localStorage. Writes go to both.
 * - Impersonation overlay: read/write sessionStorage only (other tabs keep the real login).
 * - On first load, copy any existing localStorage values into this tab's sessionStorage.
 */
const TAB_SCOPED_KEYS = new Set([
  "sellerToken",
  "sellerId",
  "storeName",
  "sellerEmail",
  "sellerIsSuperuser",
]);

const OVERLAY_FLAG = "andertal_auth_overlay";

let installed = false;

function overlayActive() {
  try {
    return window.sessionStorage.getItem(OVERLAY_FLAG) === "1";
  } catch {
    return false;
  }
}

function install() {
  if (installed || typeof window === "undefined" || !window.localStorage || !window.sessionStorage) return;
  installed = true;

  const rawGetItem = window.localStorage.getItem.bind(window.localStorage);
  const rawSetItem = window.localStorage.setItem.bind(window.localStorage);
  const rawRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

  for (const key of TAB_SCOPED_KEYS) {
    try {
      if (window.sessionStorage.getItem(key) == null) {
        const existing = rawGetItem(key);
        if (existing != null) window.sessionStorage.setItem(key, existing);
      }
    } catch {
      /* private mode / quota */
    }
  }

  window.localStorage.getItem = function (key) {
    if (!TAB_SCOPED_KEYS.has(key)) return rawGetItem(key);
    try {
      if (overlayActive()) return window.sessionStorage.getItem(key);
      const fromSession = window.sessionStorage.getItem(key);
      if (fromSession != null) return fromSession;
    } catch {
      /* fall through */
    }
    return rawGetItem(key);
  };

  window.localStorage.setItem = function (key, value) {
    if (!TAB_SCOPED_KEYS.has(key)) return rawSetItem(key, value);
    const str = String(value);
    try {
      window.sessionStorage.setItem(key, str);
    } catch {
      /* ignore */
    }
    if (!overlayActive()) rawSetItem(key, str);
  };

  window.localStorage.removeItem = function (key) {
    if (!TAB_SCOPED_KEYS.has(key)) return rawRemoveItem(key);
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    if (!overlayActive()) rawRemoveItem(key);
  };
}

function setTabAuthOverlay(active) {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    if (active) window.sessionStorage.setItem(OVERLAY_FLAG, "1");
    else window.sessionStorage.removeItem(OVERLAY_FLAG);
  } catch {
    /* ignore */
  }
}

install();

export { install as installTabScopedAuthStorage, setTabAuthOverlay };
