"use client";

/**
 * Sticky save bar (Konsept s34/s35/s37): "● Ungespeicherte Änderungen · Verwerfen · Speichern".
 * Same actions as before (UnsavedChangesContext runSave / runDiscard) — only placement and
 * wording changed (was an English Discard/Save pair in the top bar).
 */

import React, { useState } from "react";
import { useLocale } from "next-intl";
import { lt } from "@/lib/locale-text";

export default function UnsavedBar({ unsaved }) {
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  if (!unsaved?.isDirty) return null;
  const save = async () => {
    setBusy(true);
    try { await unsaved.runSave(); } finally { setBusy(false); }
  };
  return (
    <div className="sc-unsaved-bar" role="region" aria-label={lt(locale, "Unsaved changes", "Kaydedilmemiş değişiklikler", "Modifications non enregistrées", "Cambios sin guardar", "Modifiche non salvate", "Ungespeicherte Änderungen")}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#3a352f" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: "#ee8a12" }} aria-hidden />
        {lt(locale, "Unsaved changes", "Kaydedilmemiş değişiklikler", "Modifications non enregistrées", "Cambios sin guardar", "Modifiche non salvate", "Ungespeicherte Änderungen")}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="sc-unsaved-discard" onClick={() => unsaved.runDiscard()} disabled={busy}>
          {lt(locale, "Discard", "Vazgeç", "Annuler", "Descartar", "Annulla", "Verwerfen")}
        </button>
        <button type="button" className="sc-unsaved-save" onClick={save} disabled={busy}>
          {busy ? "…" : lt(locale, "Save", "Kaydet", "Enregistrer", "Guardar", "Salva", "Speichern")}
        </button>
      </span>
    </div>
  );
}
