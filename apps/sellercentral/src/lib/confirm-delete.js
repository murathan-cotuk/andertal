"use client";

/**
 * Module-level singleton for delete confirmation dialogs.
 * Components call `await confirmDelete("message")` → returns true/false.
 * The ConfirmDeleteModal in PolarisLayout handles rendering.
 */

let _resolve = null;
let _setState = null;

export function __registerConfirmModal(setState) {
  _setState = setState;
}

export function confirmDelete(message) {
  return new Promise((resolve) => {
    _resolve = resolve;
    if (_setState) {
      _setState({ open: true, message: message || "" });
    } else {
      // Fallback: native dialog if modal not yet registered
      resolve(typeof window !== "undefined" ? window.confirm(message) : false);
    }
  });
}

export function __resolveConfirmModal(confirmed) {
  if (_setState) _setState({ open: false, message: "" });
  if (_resolve) {
    const r = _resolve;
    _resolve = null;
    r(confirmed);
  }
}
