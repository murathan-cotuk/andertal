import { lt } from "@/lib/locale-text";

/** Normalize seller (published) vs master-catalog (active) product status codes. */
export function normalizeProductStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "published" || s === "active") return "active";
  if (s === "draft" || !s) return "draft";
  if (s === "inactive" || s === "archived") return "inactive";
  return s;
}

export function productStatusLabel(locale, status) {
  const norm = normalizeProductStatus(status);
  if (norm === "active") {
    return lt(locale, "Active", "Aktif", "Actif", "Activo", "Attivo", "Aktiv");
  }
  if (norm === "draft") {
    return lt(locale, "Draft", "Taslak", "Brouillon", "Borrador", "Bozza", "Entwurf");
  }
  if (norm === "inactive") {
    return lt(locale, "Inactive", "Pasif", "Inactif", "Inactivo", "Inattivo", "Inaktiv");
  }
  return String(status || "—").replace(/_/g, " ");
}

export function productStatusBadgeTone(status) {
  const norm = normalizeProductStatus(status);
  if (norm === "active") return "success";
  if (norm === "draft") return "attention";
  return "critical";
}
