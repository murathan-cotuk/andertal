"use client";

/**
 * Module-level singleton for a viewport-fixed toast (Polaris Frame toastMarkup).
 * Components call `showToast("Saved")` / `showToast("Error", { error: true })` from
 * anywhere — no prop drilling. PolarisLayout renders the actual <Toast> via Frame,
 * so it always appears in the visible viewport regardless of scroll position (unlike
 * a page-local <Banner> in a Layout.Section, which sits in normal document flow and
 * is invisible until the user scrolls back to the top of a long settings page).
 */

let _setState = null;

export function __registerToast(setState) {
  _setState = setState;
}

export function showToast(message, { error = false, duration = 4000 } = {}) {
  if (!_setState) return;
  _setState({ message: String(message || ""), error, duration, key: Date.now() });
}
