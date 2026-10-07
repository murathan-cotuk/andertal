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

/** Default "really delete?" text in the UI language (taken from the /[locale]/ URL segment). */
export function defaultDeleteMessage() {
  const loc = typeof window !== "undefined" ? (window.location.pathname.split("/")[1] || "de").slice(0, 2) : "de";
  const msgs = {
    en: "Are you sure you want to delete this? This cannot be undone.",
    tr: "Silmek istediğine emin misin? Bu işlem geri alınamaz.",
    fr: "Voulez-vous vraiment supprimer cet élément ? Cette action est irréversible.",
    es: "¿Seguro que quieres eliminarlo? No se puede deshacer.",
    it: "Vuoi davvero eliminarlo? L’operazione non può essere annullata.",
    de: "Wirklich löschen? Das kann nicht rückgängig gemacht werden.",
  };
  return msgs[loc] || msgs.de;
}

/** Shorthand for delete/remove buttons: `if (await confirmRemoval()) doDelete()`. */
export function confirmRemoval(message) {
  return confirmDelete(message || defaultDeleteMessage());
}
