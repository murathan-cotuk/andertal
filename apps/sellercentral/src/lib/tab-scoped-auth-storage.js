"use client";

/**
 * sellerToken/sellerId/storeName/sellerEmail/sellerIsSuperuser identify "who this browser
 * tab currently is" (the logged-in superuser, or — while an impersonation tab is expanded —
 * the seller being viewed). localStorage is shared across every tab of the same origin, so
 * writing these keys there let one tab's impersonation swap bleed into every other open tab
 * on refresh (superuser dashboard showing seller identity, wrong sidebar menu, etc).
 *
 * sessionStorage is private per tab, which is exactly the isolation these keys need. Rather
 * than rewrite every one of the ~60 call sites that already do
 * `localStorage.getItem('sellerToken')` across the app, this transparently reroutes
 * localStorage.getItem/setItem/removeItem to sessionStorage for just these five keys —
 * everything else in localStorage is untouched.
 */
const TAB_SCOPED_KEYS = new Set([
  "sellerToken",
  "sellerId",
  "storeName",
  "sellerEmail",
  "sellerIsSuperuser",
]);

let installed = false;

function install() {
  if (installed || typeof window === "undefined" || !window.localStorage || !window.sessionStorage) return;
  installed = true;

  const rawGetItem = window.localStorage.getItem.bind(window.localStorage);
  const rawSetItem = window.localStorage.setItem.bind(window.localStorage);
  const rawRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

  window.localStorage.getItem = function (key) {
    if (TAB_SCOPED_KEYS.has(key)) return window.sessionStorage.getItem(key);
    return rawGetItem(key);
  };
  window.localStorage.setItem = function (key, value) {
    if (TAB_SCOPED_KEYS.has(key)) {
      window.sessionStorage.setItem(key, value);
      return;
    }
    return rawSetItem(key, value);
  };
  window.localStorage.removeItem = function (key) {
    if (TAB_SCOPED_KEYS.has(key)) {
      window.sessionStorage.removeItem(key);
      return;
    }
    return rawRemoveItem(key);
  };
}

install();

export { install as installTabScopedAuthStorage };
