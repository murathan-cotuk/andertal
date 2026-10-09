"use client";

/**
 * PDP legal / compliance presentation (handoff Faz 0d + 0f, refs pic/eprel1.png, eprel2.png,
 * gewahrleistung.png):
 *  - EnergyClassBadge: EU energy-class arrow above the variant selector → modal with the label
 *    and the product information sheet (EU 2017/1369: class must be shown next to the offer).
 *  - SafetyResources: "Safety and product resources" right below the description — statutory
 *    warranty (fixed 6-language text, link from the superuser setting) + GPSR contacts + safety
 *    documents.
 *  - LegalGroupTabs: the remaining legal fields grouped by regime (GPSR, EPREL, electrical, …)
 *    as tabs, instead of one undifferentiated "product safety" stack. weee_number stays in the
 *    buybox only.
 * No marketing text is generated here — only fixed legal wording and the seller's own data.
 */

import { useEffect, useState } from "react";
import { localizeMetaKey } from "@/lib/prop-labels";

const L = (dict, locale) => dict[String(locale || "de").slice(0, 2)] ?? dict.de;

// ── Energy class ─────────────────────────────────────────────────────────────

const ENERGY_COLORS = {
  "A+++": "#00a651", "A++": "#00a651", "A+": "#00a651",
  A: "#00a651", B: "#50b848", C: "#bed630", D: "#fff200", E: "#fdb913", F: "#f37021", G: "#ed1c24",
};
const DARK_TEXT = new Set(["C", "D", "E"]);

function scaleEnds(scale) {
  const s = String(scale || "A-G").replace(/[–—]/g, "-");
  const [top, bottom] = s.split("-");
  return { top: top || "A", bottom: bottom || "G" };
}

const tx = {
  sheet: { de: "Produktdatenblatt", en: "Product information sheet", tr: "Ürün fişi", fr: "Fiche produit", it: "Scheda prodotto", es: "Ficha del producto" },
  modalTitle: { de: "Energieeffizienz und Produktdatenblatt", en: "Energy efficiency and product information sheet", tr: "Enerji verimliliği ve ürün bilgi etiketi", fr: "Efficacité énergétique et fiche produit", it: "Efficienza energetica e scheda prodotto", es: "Eficiencia energética y ficha del producto" },
  tabClass: { de: "Energieklasse", en: "Energy class", tr: "Enerji sınıfı", fr: "Classe énergétique", it: "Classe energetica", es: "Clase energética" },
  openSheet: { de: "Produktdatenblatt öffnen", en: "Open product information sheet", tr: "Ürün fişini aç", fr: "Ouvrir la fiche produit", it: "Apri la scheda prodotto", es: "Abrir la ficha del producto" },
  close: { de: "Schließen", en: "Close", tr: "Kapat", fr: "Fermer", it: "Chiudi", es: "Cerrar" },
  classAria: { de: "Energieeffizienzklasse", en: "Energy efficiency class", tr: "Enerji verimlilik sınıfı", fr: "Classe d'efficacité énergétique", it: "Classe di efficienza energetica", es: "Clase de eficiencia energética" },
  eprelNo: { de: "EPREL-Nummer", en: "EPREL number", tr: "EPREL numarası", fr: "Numéro EPREL", it: "Numero EPREL", es: "Número EPREL" },
};

/** Variant value wins over the parent's (the variant is the real product). */
export function energyInfo(meta, variantMeta) {
  const pick = (k) => {
    const v = variantMeta && variantMeta[k] != null && String(variantMeta[k]).trim() !== "" ? variantMeta[k] : meta?.[k];
    return v == null ? "" : String(v).trim();
  };
  const grade = pick("energy_class_grade").toUpperCase();
  if (!grade) return null;
  return {
    grade,
    scale: pick("energy_class_scale") || "A-G",
    label: pick("energy_label_image"),
    sheet: pick("energy_label_qr"),
    eprel: pick("eprel_number"),
  };
}

export function EnergyClassBadge({ meta, variantMeta, locale, resolveUrl = (u) => u }) {
  const info = energyInfo(meta, variantMeta);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("class");
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!info) return null;
  const color = ENERGY_COLORS[info.grade] || "#6b7280";
  const ends = scaleEnds(info.scale);
  const sheetHref = info.sheet && /^https?:\/\//i.test(info.sheet) ? info.sheet
    : (info.eprel ? `https://eprel.ec.europa.eu/qr/${encodeURIComponent(info.eprel)}` : "");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 10px" }}>
      <button
        type="button"
        onClick={() => { setTab("class"); setOpen(true); }}
        aria-label={`${L(tx.classAria, locale)} ${info.grade}`}
        style={{ display: "inline-flex", alignItems: "stretch", padding: 0, border: "none", background: "none", cursor: "pointer" }}
      >
        <span
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            minWidth: 44, height: 30, padding: "0 10px 0 16px",
            background: color, color: DARK_TEXT.has(info.grade) ? "#111" : "#fff",
            fontWeight: 800, fontSize: 18, lineHeight: 1,
            clipPath: "polygon(12px 0, 100% 0, 100% 100%, 12px 100%, 0 50%)",
          }}
        >
          {info.grade}
        </span>
        <span style={{ display: "inline-flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", width: 16, height: 30, border: "1px solid #111", borderLeft: "none", fontSize: 8, fontWeight: 700, lineHeight: 1, padding: "2px 0", boxSizing: "border-box" }}>
          <span>{ends.top}</span>
          <span aria-hidden>↑</span>
          <span>{ends.bottom}</span>
        </span>
      </button>
      {(sheetHref || info.label) && (
        <button
          type="button"
          onClick={() => { setTab(sheetHref ? "sheet" : "class"); setOpen(true); }}
          style={{ border: "none", background: "none", padding: 0, color: "#2563eb", fontSize: 13, cursor: "pointer" }}
        >
          {L(tx.sheet, locale)}
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={L(tx.modalTitle, locale)}
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
              <strong style={{ fontSize: 15 }}>{L(tx.modalTitle, locale)}</strong>
              <button type="button" onClick={() => setOpen(false)} aria-label={L(tx.close, locale)} style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, width: 32, height: 32, fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
            <div role="tablist" style={{ display: "flex", gap: 4, padding: "8px 18px 0", borderBottom: "1px solid #e5e7eb" }}>
              {[["class", L(tx.tabClass, locale)], ...(sheetHref ? [["sheet", L(tx.sheet, locale)]] : [])].map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  type="button"
                  onClick={() => setTab(id)}
                  style={{ border: "none", background: "none", padding: "8px 12px", fontSize: 13, fontWeight: tab === id ? 700 : 500, color: tab === id ? "#111" : "#4b5563", borderBottom: tab === id ? "2px solid #111" : "2px solid transparent", cursor: "pointer" }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ padding: 18, overflowY: "auto" }}>
              {tab === "class" && (
                info.label && /\.pdf(\?|#|$)/i.test(info.label)
                  ? (
                    <div>
                      <object data={resolveUrl(info.label)} type="application/pdf" aria-label={`${L(tx.classAria, locale)} ${info.grade}`} style={{ display: "block", width: "100%", height: "65vh", border: "none" }}>
                        <p style={{ fontSize: 14 }}>{L(tx.classAria, locale)}: <strong>{info.grade}</strong></p>
                      </object>
                      <p style={{ fontSize: 13, marginTop: 8 }}>
                        <a href={resolveUrl(info.label)} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>PDF ↗</a>
                      </p>
                    </div>
                  )
                  : info.label
                  ? <img src={resolveUrl(info.label)} alt={`${L(tx.classAria, locale)} ${info.grade}`} style={{ display: "block", maxWidth: "100%", maxHeight: "70vh", margin: "0 auto" }} />
                  : <p style={{ fontSize: 14 }}>{L(tx.classAria, locale)}: <strong>{info.grade}</strong> ({ends.top}–{ends.bottom})</p>
              )}
              {tab === "sheet" && sheetHref && (
                <p style={{ fontSize: 14 }}>
                  <a href={sheetHref} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>{L(tx.openSheet, locale)} ↗</a>
                </p>
              )}
              {info.eprel && <p style={{ fontSize: 12, color: "#6b7280", marginTop: 12 }}>{L(tx.eprelNo, locale)}: {info.eprel}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Legal groups (tabs) ──────────────────────────────────────────────────────

const GROUPS = [
  { id: "gpsr", keys: ["hersteller", "hersteller_information", "verantwortliche_person_information", "responsible_person_eu", "authorized_representative"], label: { de: "Hersteller & Verantwortliche", en: "Manufacturer & responsible person", tr: "Üretici ve sorumlu kişi", fr: "Fabricant et personne responsable", it: "Produttore e persona responsabile", es: "Fabricante y persona responsable" } },
  { id: "eprel", keys: ["energy_class_grade", "energy_class_scale", "eprel_number", "energy_label_qr", "energy_label_image"], label: { de: "Energieverbrauchskennzeichnung", en: "Energy labelling", tr: "Enerji etiketlemesi", fr: "Étiquetage énergétique", it: "Etichettatura energetica", es: "Etiquetado energético" } },
  { id: "electrical", keys: ["ce_declaration_url", "ce_class", "rohs_declaration"], label: { de: "Elektro-Sicherheit (CE)", en: "Electrical safety (CE)", tr: "Elektrik güvenliği (CE)", fr: "Sécurité électrique (CE)", it: "Sicurezza elettrica (CE)", es: "Seguridad eléctrica (CE)" } },
  { id: "battery", keys: ["battery_chemistry", "battery_capacity_wh"], label: { de: "Batterien", en: "Batteries", tr: "Bataryalar", fr: "Batteries", it: "Batterie", es: "Pilas" } },
  { id: "safety", keys: ["safety_warnings", "warning_text", "age_warning", "safety_data_sheet_url", "recall_procedure"], label: { de: "Warnhinweise", en: "Warnings", tr: "Uyarılar", fr: "Avertissements", it: "Avvertenze", es: "Advertencias" } },
  { id: "composition", keys: ["inci_list", "ingredients", "allergens", "nutrition_values", "daily_dose", "best_before", "fiber_composition", "care_symbols"], label: { de: "Inhaltsstoffe & Zusammensetzung", en: "Ingredients & composition", tr: "İçerik ve bileşim", fr: "Ingrédients et composition", it: "Ingredienti e composizione", es: "Ingredientes y composición" } },
  { id: "regulated", keys: ["tpd_compliance_ref", "age_verification", "udi", "isbn"], label: { de: "Regulierte Angaben", en: "Regulatory details", tr: "Düzenleyici bilgiler", fr: "Informations réglementaires", it: "Informazioni normative", es: "Datos regulatorios" } },
  { id: "custom", keys: [], prefix: "custom_", label: { de: "Weitere Angaben", en: "Further details", tr: "Diğer bilgiler", fr: "Autres informations", it: "Altre informazioni", es: "Otros datos" } },
];

const viewDoc = { de: "Dokument ansehen", en: "View document", tr: "Belgeyi görüntüle", fr: "Voir le document", it: "Vedi documento", es: "Ver documento" };

export function legalGroups(meta) {
  const has = (k) => meta && meta[k] != null && String(meta[k]).trim() !== "" && typeof meta[k] !== "object";
  const out = [];
  for (const g of GROUPS) {
    const keys = g.prefix
      ? Object.keys(meta || {}).filter((k) => k.startsWith(g.prefix) && has(k))
      : g.keys.filter(has);
    if (keys.length) out.push({ id: g.id, label: g.label, keys });
  }
  return out;
}

export function LegalGroupTabs({ meta, locale, labels = {}, resolveUrl = (u) => u }) {
  const groups = legalGroups(meta);
  const [active, setActive] = useState(groups[0]?.id || "gpsr");
  useEffect(() => {
    // "Safety images and contacts" link in SafetyResources opens the GPSR tab.
    const onOpen = (e) => { if (e?.detail) setActive(e.detail); };
    window.addEventListener("andertal-legal-tab", onOpen);
    return () => window.removeEventListener("andertal-legal-tab", onOpen);
  }, []);
  if (!groups.length) return null;
  const current = groups.find((g) => g.id === active) || groups[0];
  return (
    <div>
      <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 4, borderBottom: "1px solid #e5e7eb", marginBottom: 12 }}>
        {groups.map((g) => (
          <button
            key={g.id}
            role="tab"
            type="button"
            aria-selected={current.id === g.id}
            onClick={() => setActive(g.id)}
            style={{ border: "none", background: "none", padding: "8px 12px", fontSize: 13, fontWeight: current.id === g.id ? 700 : 500, color: current.id === g.id ? "#111" : "#4b5563", borderBottom: current.id === g.id ? "2px solid #111" : "2px solid transparent", cursor: "pointer" }}
          >
            {L(g.label, locale)}
          </button>
        ))}
      </div>
      <dl role="tabpanel" style={{ margin: 0 }}>
        {current.keys.map((key) => {
          const value = String(meta[key]);
          const isUrl = /^https?:\/\//i.test(value) || /^\/uploads\//.test(value);
          return (
            <div key={key} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 220px) 1fr", gap: 12, padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.9375rem" }}>
              <dt style={{ color: "#6b7280" }}>{labels[key] || localizeMetaKey(key, locale)}</dt>
              <dd style={{ margin: 0, color: "#1f2937", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {isUrl
                  ? <a href={resolveUrl(value)} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>{L(viewDoc, locale)}</a>
                  : value}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

// ── Safety and product resources (Faz 0f) ────────────────────────────────────

const sr = {
  title: { de: "Sicherheit und Produktressourcen", en: "Safety and product resources", tr: "Güvenlik ve ürün kaynakları", fr: "Sécurité et ressources produit", it: "Sicurezza e risorse del prodotto", es: "Seguridad y recursos del producto" },
  warrantyTitle: { de: "Ihre gesetzlichen Gewährleistungsrechte", en: "Your statutory warranty rights", tr: "Yasal garanti haklarınız", fr: "Vos droits de garantie légale", it: "I tuoi diritti di garanzia legale", es: "Sus derechos de garantía legal" },
  // Directive (EU) 2019/771: legal guarantee of conformity of at least 2 years.
  warrantyText: {
    de: "Jeder Verbraucher in der EU hat bei allen in der EU verkauften Konsumgütern Anspruch auf eine gesetzliche Gewährleistung von mindestens 2 Jahren.",
    en: "Every consumer in the EU is entitled to a statutory warranty of at least 2 years for all consumer goods sold in the EU.",
    tr: "AB'deki her tüketici, AB'de satılan tüm tüketim malları için en az 2 yıllık yasal garanti korumasından yararlanır.",
    fr: "Tout consommateur de l'UE bénéficie d'une garantie légale d'au moins 2 ans pour tous les biens de consommation vendus dans l'UE.",
    it: "Ogni consumatore nell'UE ha diritto a una garanzia legale di almeno 2 anni per tutti i beni di consumo venduti nell'UE.",
    es: "Todo consumidor de la UE tiene derecho a una garantía legal de al menos 2 años para todos los bienes de consumo vendidos en la UE.",
  },
  more: { de: "Mehr erfahren", en: "Learn more", tr: "Daha fazla bilgi", fr: "En savoir plus", it: "Scopri di più", es: "Más información" },
  contactsTitle: { de: "Bilder und Kontakte", en: "Images and contacts", tr: "Görseller ve kişiler", fr: "Images et contacts", it: "Immagini e contatti", es: "Imágenes y contactos" },
  contactsLink: { de: "Sicherheitsbilder und Kontakte", en: "Safety images and contacts", tr: "Güvenlik görselleri ve kişileri", fr: "Images de sécurité et contacts", it: "Immagini di sicurezza e contatti", es: "Imágenes de seguridad y contactos" },
  docsTitle: { de: "Sicherheitsdokumente", en: "Safety documents", tr: "Güvenlik belgeleri", fr: "Documents de sécurité", it: "Documenti di sicurezza", es: "Documentos de seguridad" },
  docPdf: { de: "Sicherheitsinformationen (PDF)", en: "Safety information (PDF)", tr: "Güvenlik bilgileri (PDF)", fr: "Informations de sécurité (PDF)", it: "Informazioni di sicurezza (PDF)", es: "Información de seguridad (PDF)" },
};

export function SafetyResources({ meta, locale, warrantyHref, legalAnchorId = "produktsicherheit", resolveUrl = (u) => u }) {
  const hasContacts = !!(meta?.hersteller || meta?.hersteller_information || meta?.verantwortliche_person_information);
  const safetyText = String(meta?.safety_information_text || "").trim();
  const safetyPdf = String(meta?.safety_information_pdf || "").trim();
  const openGpsr = (e) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("andertal-legal-tab", { detail: "gpsr" }));
    document.getElementById(legalAnchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const h4 = { fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 4px", color: "#111" };
  return (
    <div>
      <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 12px", color: "#111" }}>{L(sr.title, locale)}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
        <div>
          <p style={h4}>{L(sr.warrantyTitle, locale)}</p>
          <p style={{ fontSize: "0.875rem", color: "#374151", margin: 0 }}>
            {L(sr.warrantyText, locale)}{" "}
            {warrantyHref && <a href={warrantyHref} style={{ color: "#2563eb" }}>{L(sr.more, locale)}</a>}
          </p>
        </div>
        {(hasContacts || safetyText || safetyPdf) && (
          <div>
            {hasContacts && (
              <>
                <p style={h4}>{L(sr.contactsTitle, locale)}</p>
                <p style={{ fontSize: "0.875rem", margin: "0 0 10px" }}>
                  <a href={`#${legalAnchorId}`} onClick={openGpsr} style={{ color: "#2563eb" }}>{L(sr.contactsLink, locale)}</a>
                </p>
              </>
            )}
            {(safetyText || safetyPdf) && (
              <>
                <p style={h4}>{L(sr.docsTitle, locale)}</p>
                {safetyText && <p style={{ fontSize: "0.875rem", color: "#374151", margin: "0 0 4px", whiteSpace: "pre-wrap" }}>{safetyText}</p>}
                {safetyPdf && (
                  <p style={{ fontSize: "0.875rem", margin: 0 }}>
                    <a href={resolveUrl(safetyPdf)} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>{L(sr.docPdf, locale)}</a>
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
