"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Badge, Button, Banner, Box, Select, Modal, TextField, Tabs, ProgressBar, Checkbox,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { lt, dateLocaleFor } from "@/lib/locale-text";
import SearchableSelect from "@/components/inputs/SearchableSelect";

function shT(locale, en, tr, fr, es, it, de) {
  return lt(locale, en, tr, fr, es, it, de);
}

function getHealthCopy(locale) {
  const t = (en, tr, fr, es, it, de) => shT(locale, en, tr, fr, es, it, de);
  return {
    pageTitle: t("Seller Health", "Satıcı Sağlığı", "Santé du vendeur", "Salud del vendedor", "Salute del venditore", "Verkäufer-Health"),
    pageSubtitle: t(
      "Overall performance, compliance and risk score, built from your real order, product and support data.",
      "Gerçek sipariş, ürün ve destek verilerinizden hesaplanan genel performans, uyumluluk ve risk puanı.",
      "Score global de performance, conformité et risque, calculé à partir de vos vraies données.",
      "Puntuación global de rendimiento, cumplimiento y riesgo, calculada con sus datos reales.",
      "Punteggio complessivo di performance, conformità e rischio, calcolato sui tuoi dati reali.",
      "Gesamt-Score aus Performance, Compliance und Risiko, berechnet aus deinen echten Bestell-, Produkt- und Support-Daten."
    ),
    tabOverview: t("Overview", "Özet", "Aperçu", "Resumen", "Panoramica", "Übersicht"),
    tabHistory: t("History", "Geçmiş", "Historique", "Historial", "Storico", "Verlauf"),
    tabAdmin: t("Configuration", "Yapılandırma", "Configuration", "Configuración", "Configurazione", "Konfiguration"),
    loading: t("Loading…", "Yükleniyor…", "Chargement…", "Cargando…", "Caricamento…", "Laden…"),
    error: t("Error", "Hata", "Erreur", "Error", "Errore", "Fehler"),
    refresh: t("Refresh", "Yenile", "Actualiser", "Actualizar", "Aggiorna", "Aktualisieren"),
    recalculate: t("Recalculate now", "Şimdi yeniden hesapla", "Recalculer", "Recalcular", "Ricalcola", "Neu berechnen"),
    seller: t("Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Seller"),
    selectSeller: t("— Select a seller —", "— Bir satıcı seçin —", "— Sélectionner un vendeur —", "— Seleccione un vendedor —", "— Seleziona un venditore —", "— Seller auswählen —"),
    outOf100: t("/ 100", "/ 100", "/ 100", "/ 100", "/ 100", "/ 100"),
    notEnoughData: t("Not enough data yet", "Henüz yeterli veri yok", "Pas encore assez de données", "Aún no hay suficientes datos", "Dati non ancora sufficienti", "Noch nicht genug Daten"),
    newSellerHint: t(
      "New seller — the score will appear once there are enough orders or products to evaluate.",
      "Yeni satıcı — değerlendirme için yeterli sipariş veya ürün olduğunda puan görünecektir.",
      "Nouveau vendeur — le score apparaîtra une fois assez de commandes ou produits disponibles.",
      "Vendedor nuevo — la puntuación aparecerá cuando haya suficientes pedidos o productos.",
      "Nuovo venditore — il punteggio apparirà quando ci saranno ordini o prodotti sufficienti.",
      "Neuer Seller — der Score erscheint, sobald genug Bestellungen oder Produkte vorliegen."
    ),
    blockedBanner: t(
      "This seller account is blocked, independent of the numeric score below.",
      "Bu satıcı hesabı, aşağıdaki sayısal puandan bağımsız olarak bloke edilmiştir.",
      "Ce compte vendeur est bloqué, indépendamment du score numérique ci-dessous.",
      "Esta cuenta de vendedor está bloqueada, independientemente de la puntuación numérica.",
      "Questo account venditore è bloccato, indipendentemente dal punteggio numerico.",
      "Dieses Seller-Konto ist gesperrt — unabhängig vom Zahlen-Score unten."
    ),
    blockReasons: t("Reasons", "Sebepler", "Raisons", "Motivos", "Motivi", "Gründe"),
    dataBasis: t("Based on", "Şuna dayalı", "Basé sur", "Basado en", "Basato su", "Basierend auf"),
    products: t("products", "ürün", "produits", "productos", "prodotti", "Produkte"),
    orders: t("orders", "sipariş", "commandes", "pedidos", "ordini", "Bestellungen"),
    returns: t("returns", "iade", "retours", "devoluciones", "resi", "Rücksendungen"),
    reviews: t("reviews", "değerlendirme", "avis", "reseñas", "recensioni", "Bewertungen"),
    issuesTitle: t("Issues affecting your score", "Puanınızı etkileyen sorunlar", "Problèmes affectant votre score", "Problemas que afectan su puntuación", "Problemi che influenzano il punteggio", "Probleme, die deinen Score senken"),
    noIssues: t("No open issues — nice work.", "Açık sorun yok — güzel iş.", "Aucun problème ouvert — beau travail.", "Sin problemas abiertos — buen trabajo.", "Nessun problema aperto — ottimo lavoro.", "Keine offenen Probleme — sehr gut."),
    pointsLost: (n) => t(`−${n} pts`, `−${n} puan`, `−${n} pts`, `−${n} pts`, `−${n} pt`, `−${n} Pkt.`),
    categories: t("Categories", "Kategoriler", "Catégories", "Categorías", "Categorie", "Kategorien"),
    currentValue: t("Current value", "Mevcut değer", "Valeur actuelle", "Valor actual", "Valore attuale", "Aktueller Wert"),
    targetValue: t("Target", "Hedef", "Objectif", "Objetivo", "Obiettivo", "Zielwert"),
    howToImprove: t("How to improve", "Nasıl iyileştirilir", "Comment améliorer", "Cómo mejorar", "Come migliorare", "So verbessern Sie sich"),
    notImplemented: t("Not yet automatically tracked — full points awarded until this is instrumented.", "Henüz otomatik olarak izlenmiyor — bu ölçülene kadar tam puan verilir.", "Pas encore suivi automatiquement — points complets accordés pour l'instant.", "Aún no se rastrea automáticamente — se otorgan todos los puntos por ahora.", "Non ancora tracciato automaticamente — punteggio pieno per ora.", "Noch nicht automatisch erfasst — bis dahin volle Punktzahl."),
    confidenceLow: t("Low confidence", "Düşük güven", "Faible confiance", "Confianza baja", "Bassa affidabilità", "Geringe Aussagekraft"),
    confidenceMedium: t("Medium confidence", "Orta güven", "Confiance moyenne", "Confianza media", "Affidabilità media", "Mittlere Aussagekraft"),
    confidenceHigh: t("High confidence", "Yüksek güven", "Confiance élevée", "Confianza alta", "Affidabilità alta", "Hohe Aussagekraft"),
    dataPoints: t("data points", "veri noktası", "points de données", "puntos de datos", "punti dati", "Datenpunkte"),
    scorePoints: (score, max) => `${score} / ${max}`,
    trendVs30: t("vs. 30 days ago", "30 gün öncesine göre", "vs. il y a 30 jours", "vs. hace 30 días", "vs. 30 giorni fa", "vs. vor 30 Tagen"),
    historyRange7: t("7 days", "7 gün", "7 jours", "7 días", "7 giorni", "7 Tage"),
    historyRange30: t("30 days", "30 gün", "30 jours", "30 días", "30 giorni", "30 Tage"),
    historyRange90: t("90 days", "90 gün", "90 jours", "90 días", "90 giorni", "90 Tage"),
    noHistory: t("No history yet — snapshots are taken daily.", "Henüz geçmiş yok — günlük anlık görüntüler alınır.", "Pas encore d'historique — instantanés pris chaque jour.", "Aún no hay historial — se toman instantáneas a diario.", "Nessuno storico ancora — snapshot giornalieri.", "Noch kein Verlauf — es werden täglich Snapshots erstellt."),
    editAll: t("Edit all", "Tümünü düzenle", "Tout modifier", "Editar todo", "Modifica tutto", "Alle bearbeiten"),
    saveChanges: t("Save changes", "Değişiklikleri kaydet", "Enregistrer", "Guardar cambios", "Salva modifiche", "Änderungen speichern"),
    resetDefaults: t("Reset to defaults", "Varsayılanlara sıfırla", "Réinitialiser", "Restablecer valores", "Ripristina predefiniti", "Auf Standard zurücksetzen"),
    resetConfirm: t("Reset all categories and criteria to their shipped defaults?", "Tüm kategoriler ve kriterler varsayılan değerlere sıfırlansın mı?", "Réinitialiser toutes les catégories et critères aux valeurs par défaut ?", "¿Restablecer todas las categorías y criterios a los valores predeterminados?", "Ripristinare tutte le categorie e i criteri ai valori predefiniti?", "Alle Kategorien und Kriterien auf die Standardwerte zurücksetzen?"),
    cancel: t("Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen"),
    enabled: t("Enabled", "Etkin", "Activé", "Habilitado", "Attivo", "Aktiv"),
    maxPoints: t("Max points", "Maks. puan", "Points max.", "Puntos máx.", "Punti max.", "Max. Punkte"),
    minSampleSize: t("Min. sample size", "Min. örneklem", "Taille min. échantillon", "Tamaño mín. muestra", "Dimensione campione min.", "Min. Stichprobengröße"),
    categoryWeightSum: (sum) => t(`Category weights sum to ${sum} / 100`, `Kategori ağırlıkları toplamı ${sum} / 100`, `Somme des poids des catégories : ${sum} / 100`, `Suma de pesos de categoría: ${sum} / 100`, `Somma dei pesi categoria: ${sum} / 100`, `Summe der Kategoriegewichte: ${sum} / 100`),
    weightWarning: t("Category weights should sum to exactly 100.", "Kategori ağırlıkları toplamı tam olarak 100 olmalıdır.", "La somme des poids de catégorie doit être exactement 100.", "La suma de los pesos de categoría debe ser exactamente 100.", "La somma dei pesi categoria deve essere esattamente 100.", "Die Summe der Kategoriegewichte muss genau 100 ergeben."),
    saved: t("Saved", "Kaydedildi", "Enregistré", "Guardado", "Salvato", "Gespeichert"),
    auditLog: t("Audit log", "Denetim günlüğü", "Journal d'audit", "Registro de auditoría", "Log di controllo", "Änderungsprotokoll"),
    auditEmpty: t("No configuration changes yet.", "Henüz yapılandırma değişikliği yok.", "Aucune modification de configuration.", "Sin cambios de configuración aún.", "Nessuna modifica alla configurazione.", "Noch keine Konfigurationsänderungen."),
    events: t("Risk & hard-block events", "Risk ve bloke olayları", "Événements de risque et blocage", "Eventos de riesgo y bloqueo", "Eventi di rischio e blocco", "Risiko- & Sperr-Ereignisse"),
    eventsEmpty: t("No events recorded for this seller.", "Bu satıcı için kayıtlı olay yok.", "Aucun événement enregistré pour ce vendeur.", "Sin eventos registrados para este vendedor.", "Nessun evento registrato per questo venditore.", "Keine Ereignisse für diesen Seller erfasst."),
    addEvent: t("Add event", "Olay ekle", "Ajouter un événement", "Añadir evento", "Aggiungi evento", "Ereignis hinzufügen"),
    eventType: t("Event type", "Olay türü", "Type d'événement", "Tipo de evento", "Tipo di evento", "Ereignistyp"),
    eventLabel: t("Description", "Açıklama", "Description", "Descripción", "Descrizione", "Beschreibung"),
    eventSeverity: t("Severity", "Önem derecesi", "Gravité", "Gravedad", "Gravità", "Schweregrad"),
    hardBlock: t("Hard block (forces BLOCKED status)", "Sert bloke (BLOKE durumunu zorunlu kılar)", "Blocage strict (force le statut BLOQUÉ)", "Bloqueo forzoso (fuerza el estado BLOQUEADO)", "Blocco forzato (forza lo stato BLOCCATO)", "Hard-Block (erzwingt Status GESPERRT)"),
    resolve: t("Resolve", "Çöz", "Résoudre", "Resolver", "Risolvi", "Auflösen"),
    resolved: t("Resolved", "Çözüldü", "Résolu", "Resuelto", "Risolto", "Aufgelöst"),
    open: t("Open", "Açık", "Ouvert", "Abierto", "Aperto", "Offen"),
    createdBy: t("by", "tarafından", "par", "por", "da", "von"),
    submit: t("Add", "Ekle", "Ajouter", "Añadir", "Aggiungi", "Hinzufügen"),
    eventTypeRequired: t("Please enter an event type", "Lütfen bir olay türü girin", "Veuillez saisir un type d'événement", "Introduzca un tipo de evento", "Inserisci un tipo di evento", "Bitte einen Ereignistyp eingeben"),
    calculatedAt: t("Last calculated", "Son hesaplama", "Dernier calcul", "Último cálculo", "Ultimo calcolo", "Zuletzt berechnet"),
    field: t("Field", "Alan", "Champ", "Campo", "Campo", "Feld"),
    from: t("From", "Şundan", "De", "Desde", "Da", "Von"),
    to: t("To", "Şuna", "À", "A", "A", "Auf"),
    changedBy: t("Changed by", "Değiştiren", "Modifié par", "Modificado por", "Modificato da", "Geändert von"),
    when: t("When", "Ne zaman", "Quand", "Cuándo", "Quando", "Wann"),
  };
}

function fmtDateTime(d, locale) {
  return d ? new Date(d).toLocaleString(dateLocaleFor(locale), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}
function fmtDate(d, locale) {
  return d ? new Date(d).toLocaleDateString(dateLocaleFor(locale), { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

function statusMeta(locale, status) {
  const t = (en, tr, fr, es, it, de) => shT(locale, en, tr, fr, es, it, de);
  switch (status) {
    case "excellent": return { label: t("Excellent", "Mükemmel", "Excellent", "Excelente", "Eccellente", "Exzellent"), tone: "success", color: "#059669" };
    case "very_good": return { label: t("Very good", "Çok iyi", "Très bon", "Muy bueno", "Molto buono", "Sehr gut"), tone: "success", color: "#059669" };
    case "good": return { label: t("Good", "İyi", "Bon", "Bueno", "Buono", "Gut"), tone: "success", color: "#0d9488" };
    case "average": return { label: t("Average", "Ortalama", "Moyen", "Promedio", "Medio", "Durchschnittlich"), tone: "warning", color: "#b45309" };
    case "poor": return { label: t("Poor", "Kötü", "Faible", "Deficiente", "Scarso", "Schlecht"), tone: "critical", color: "#dc2626" };
    case "risky": return { label: t("Risky", "Riskli", "Risqué", "Riesgo", "Rischioso", "Riskant"), tone: "critical", color: "#b91c1c" };
    case "blocked": return { label: t("Blocked", "Bloke", "Bloqué", "Bloqueado", "Bloccato", "Gesperrt"), tone: "critical", color: "#991b1b" };
    default: return { label: t("Insufficient data", "Yetersiz veri", "Données insuffisantes", "Datos insuficientes", "Dati insufficienti", "Unzureichende Daten"), tone: "info", color: "#6b7280" };
  }
}

function scoreColor(pct) {
  if (pct >= 80) return "#059669";
  if (pct >= 60) return "#b45309";
  return "#dc2626";
}

// Backend calculators (seller-health/calculators.js) return structured issue objects —
// {key, count, productIds?/orderIds?/eventId?/details?} — never plain strings, so the display
// text is built here (backend owns stable keys, frontend owns translated labels, same convention
// as status keys). Unknown/dynamic keys (compliance field names, event types) fall back to a
// humanized version of the key itself rather than a blank/broken label.
function issueKeyLabels(locale) {
  const t = (en, tr, fr, es, it, de) => shT(locale, en, tr, fr, es, it, de);
  return {
    missing_title: t("Missing product title", "Eksik ürün başlığı", "Titre du produit manquant", "Falta el título del producto", "Titolo prodotto mancante", "Fehlender Produkttitel"),
    missing_description: t("Missing description", "Eksik açıklama", "Description manquante", "Falta la descripción", "Descrizione mancante", "Fehlende Beschreibung"),
    missing_bullets: t("Missing bullet points", "Eksik madde işaretleri", "Points clés manquants", "Faltan los puntos clave", "Punti elenco mancanti", "Fehlende Stichpunkte"),
    missing_brand: t("Missing brand", "Eksik marka", "Marque manquante", "Falta la marca", "Marchio mancante", "Fehlende Marke"),
    missing_manufacturer: t("Missing manufacturer", "Eksik üretici", "Fabricant manquant", "Falta el fabricante", "Produttore mancante", "Fehlender Hersteller"),
    missing_ean: t("Missing EAN/GTIN", "Eksik EAN/GTIN", "EAN/GTIN manquant", "Falta el EAN/GTIN", "EAN/GTIN mancante", "Fehlende EAN/GTIN"),
    missing_sku: t("Missing SKU", "Eksik SKU", "SKU manquant", "Falta el SKU", "SKU mancante", "Fehlende SKU"),
    missing_images: t("Missing product images", "Eksik ürün görseli", "Images produit manquantes", "Faltan imágenes del producto", "Immagini prodotto mancanti", "Fehlende Produktbilder"),
    short_description: t("Description too short", "Açıklama çok kısa", "Description trop courte", "Descripción demasiado corta", "Descrizione troppo breve", "Beschreibung zu kurz"),
    duplicate_title: t("Duplicate product title", "Yinelenen ürün başlığı", "Titre de produit en double", "Título de producto duplicado", "Titolo prodotto duplicato", "Doppelter Produkttitel"),
    no_images: t("No product images", "Ürün görseli yok", "Aucune image produit", "Sin imágenes de producto", "Nessuna immagine prodotto", "Keine Produktbilder"),
    missing_category: t("Missing category", "Eksik kategori", "Catégorie manquante", "Falta la categoría", "Categoria mancante", "Fehlende Kategorie"),
    missing_price: t("Missing price", "Eksik fiyat", "Prix manquant", "Falta el precio", "Prezzo mancante", "Fehlender Preis"),
    duplicate_ean: t("Duplicate EAN/GTIN", "Yinelenen EAN/GTIN", "EAN/GTIN en double", "EAN/GTIN duplicado", "EAN/GTIN duplicato", "Doppelte EAN/GTIN"),
    malformed_sku: t("Malformed SKU", "Hatalı biçimli SKU", "SKU mal formé", "SKU con formato incorrecto", "SKU malformato", "Fehlerhafte SKU"),
    approved: t("Seller not yet approved", "Satıcı henüz onaylanmadı", "Vendeur pas encore approuvé", "Vendedor aún no aprobado", "Venditore non ancora approvato", "Seller noch nicht freigegeben"),
    company_name: t("Missing company name", "Eksik şirket adı", "Nom de société manquant", "Falta el nombre de la empresa", "Ragione sociale mancante", "Fehlender Firmenname"),
    tax_id: t("Missing tax ID", "Eksik vergi numarası", "Numéro fiscal manquant", "Falta el NIF", "Partita IVA mancante", "Fehlende Steuernummer"),
    vat_id: t("Missing VAT ID", "Eksik KDV numarası", "Numéro de TVA manquant", "Falta el NIF-IVA", "Partita IVA mancante", "Fehlende USt-IdNr."),
    iban: t("Missing IBAN", "Eksik IBAN", "IBAN manquant", "Falta el IBAN", "IBAN mancante", "Fehlende IBAN"),
    business_address: t("Missing business address", "Eksik işletme adresi", "Adresse professionnelle manquante", "Falta la dirección comercial", "Indirizzo aziendale mancante", "Fehlende Geschäftsadresse"),
    agreement_accepted: t("Marketplace agreement not accepted", "Pazar yeri sözleşmesi kabul edilmedi", "Accord marketplace non accepté", "Acuerdo de marketplace no aceptado", "Accordo marketplace non accettato", "Marktplatzvereinbarung nicht akzeptiert"),
    documents_submitted: t("No documents submitted", "Belge gönderilmedi", "Aucun document soumis", "No se han enviado documentos", "Nessun documento inviato", "Keine Dokumente eingereicht"),
    lucid_number: t("Missing LUCID number", "Eksik LUCID numarası", "Numéro LUCID manquant", "Falta el número LUCID", "Numero LUCID mancante", "Fehlende LUCID-Nummer"),
    non_compliant_products: t("Products with compliance issues", "Uyumluluk sorunu olan ürünler", "Produits non conformes", "Productos con problemas de cumplimiento", "Prodotti non conformi", "Produkte mit Compliance-Problemen"),
    trade_register: t("Missing trade register extract", "Eksik ticaret sicil belgesi", "Extrait de registre du commerce manquant", "Falta el extracto del registro mercantil", "Estratto registro imprese mancante", "Fehlender Handelsregisterauszug"),
    id_passport: t("Missing ID/passport", "Eksik kimlik/pasaport", "Pièce d'identité manquante", "Falta el DNI/pasaporte", "Documento d'identità mancante", "Fehlender Ausweis/Reisepass"),
    cancelled_orders: t("Cancelled orders", "İptal edilen siparişler", "Commandes annulées", "Pedidos cancelados", "Ordini annullati", "Stornierte Bestellungen"),
    defect_orders: t("Orders with reported defects", "Kusur bildirilen siparişler", "Commandes avec défauts signalés", "Pedidos con defectos reportados", "Ordini con difetti segnalati", "Bestellungen mit gemeldeten Mängeln"),
    stalled_orders: t("Orders stuck unconfirmed", "Onaylanmadan bekleyen siparişler", "Commandes bloquées non confirmées", "Pedidos atascados sin confirmar", "Ordini bloccati non confermati", "Unbestätigt hängengebliebene Bestellungen"),
    missing_tracking: t("Shipments without tracking", "Takip numarası olmayan gönderiler", "Envois sans suivi", "Envíos sin seguimiento", "Spedizioni senza tracking", "Sendungen ohne Tracking"),
    shipping_incidents: t("Shipping incidents (lost/damaged in transit)", "Kargo olayları (kayıp/hasarlı)", "Incidents de livraison (perdu/endommagé)", "Incidentes de envío (perdido/dañado)", "Incidenti di spedizione (perso/danneggiato)", "Versandvorfälle (verloren/beschädigt)"),
    inactive_seller: t("No recent seller activity", "Son zamanlarda satıcı aktivitesi yok", "Aucune activité récente du vendeur", "Sin actividad reciente del vendedor", "Nessuna attività recente del venditore", "Keine kürzliche Seller-Aktivität"),
  };
}

function humanizeIssueKey(key) {
  return String(key || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function issueLabel(locale, issue) {
  if (!issue) return "";
  if (typeof issue === "string") return issue;
  const label = issueKeyLabels(locale)[issue.key] || humanizeIssueKey(issue.key);
  return issue.count > 1 ? `${label} (${issue.count})` : label;
}

const SH_CSS = `
.sh-page { font-size: 12px; color: #111827; }
.sh-page .Polaris-Header-Title { font-size: 18px !important; line-height: 1.25 !important; }
.sh-hero { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }
.sh-ring { position: relative; width: 128px; height: 128px; border-radius: 50%; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; }
.sh-ring-value { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; }
.sh-ring-max { font-size: 12px; color: #98a2b3; margin-top: -2px; }
.sh-cat-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; cursor: pointer; }
.sh-cat-row:hover { background: #fafafa; }
.sh-crit-row { padding: 10px 14px; border-top: 1px solid #f3f4f6; }
.sh-issue-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 14px; border-top: 1px solid #f3f4f6; }
.sh-issue-row:first-child { border-top: none; }
.sh-hist-bars { display: flex; align-items: flex-end; gap: 2px; height: 90px; }
.sh-hist-bar { flex: 1 1 auto; border-radius: 2px 2px 0 0; min-width: 2px; }
.sh-table th, .sh-table td { font-size: 11px; padding: 6px 8px; border-bottom: 1px solid #f3f4f6; text-align: left; }
.sh-table th { color: #667085; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.02em; background: #fafafa; }
.sh-chip { display: inline-block; font-size: 10px; padding: 1px 7px; border-radius: 999px; background: #f2f4f7; color: #667085; font-weight: 600; }
`;

function ScoreHero({ data, copy, locale }) {
  const insufficient = !data?.overallDataSufficient;
  const status = data?.status || "insufficient_data";
  const meta = statusMeta(locale, status);
  const score = data?.totalScore;
  const pct = score != null ? Math.round(score) : null;

  return (
    <Card>
      <BlockStack gap="300">
        <div className="sh-hero">
          <div className="sh-ring" style={{ background: `conic-gradient(${meta.color} ${insufficient || score == null ? 0 : pct * 3.6}deg, #eef1f4 0deg)` }}>
            <div style={{ position: "absolute", inset: 8, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div className="sh-ring-value" style={{ color: score == null ? "#98a2b3" : meta.color }}>
                {score == null ? "—" : pct}
              </div>
              <div className="sh-ring-max">{copy.outOf100}</div>
            </div>
          </div>
          <BlockStack gap="150">
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={meta.tone} size="large">{meta.label}</Badge>
              {data?.isBlocked && <Badge tone="critical">{statusMeta(locale, "blocked").label}</Badge>}
            </InlineStack>
            {insufficient ? (
              <Text tone="subdued">{copy.newSellerHint}</Text>
            ) : (
              <Text tone="subdued" as="p" variant="bodySm">
                {copy.dataBasis}: {data?.dataCounts?.orders ?? 0} {copy.orders}, {data?.dataCounts?.products ?? 0} {copy.products}, {data?.dataCounts?.returns ?? 0} {copy.returns}, {data?.dataCounts?.reviews ?? 0} {copy.reviews}
              </Text>
            )}
            {data?.calculatedAt && (
              <Text tone="subdued" as="p" variant="bodySm">{copy.calculatedAt}: {fmtDateTime(data.calculatedAt, locale)}</Text>
            )}
          </BlockStack>
        </div>

        {data?.isBlocked && (
          <Banner tone="critical" title={copy.blockedBanner}>
            <BlockStack gap="100">
              {(data.blockReasons || []).map((r, i) => (
                <Text as="p" key={r.key || i}>• {r.label}</Text>
              ))}
            </BlockStack>
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
}

function IssuesPanel({ issues, copy, locale, onJump }) {
  return (
    <Card padding="0">
      <Box padding="300" paddingBlockEnd="0">
        <Text variant="headingSm" as="h3">{copy.issuesTitle}</Text>
      </Box>
      {!issues || issues.length === 0 ? (
        <Box padding="400"><Text tone="subdued" alignment="center">{copy.noIssues}</Text></Box>
      ) : (
        <Box paddingBlockStart="200">
          {issues.map((iss, i) => {
            const summary = issueLabel(locale, iss.issueSummary);
            const extra = (iss.issueCount || 0) > 1 ? ` +${iss.issueCount - 1}` : "";
            return (
              <div key={iss.criterionId || i} className="sh-issue-row" onClick={() => onJump?.(iss.categoryId)} style={{ cursor: onJump ? "pointer" : "default" }}>
                <div style={{ minWidth: 0 }}>
                  <Text as="span" fontWeight="medium">{iss.label}</Text>
                  {summary && <div><Text tone="subdued" as="span" variant="bodySm">{summary}{extra}</Text></div>}
                </div>
                <Badge tone="critical">{copy.pointsLost(iss.pointsLost)}</Badge>
              </div>
            );
          })}
        </Box>
      )}
    </Card>
  );
}

function confidenceText(copy, confidence, n) {
  if (!confidence) return null;
  const label = confidence === "low" ? copy.confidenceLow : confidence === "medium" ? copy.confidenceMedium : copy.confidenceHigh;
  return `${label} · ${n ?? 0} ${copy.dataPoints}`;
}

function CriterionRow({ crit, copy, locale }) {
  const pct = crit.maxPoints > 0 ? Math.round((crit.score / crit.maxPoints) * 100) : 0;
  return (
    <div className="sh-crit-row">
      <InlineStack align="space-between" blockAlign="start" gap="200">
        <BlockStack gap="050">
          <Text as="span" fontWeight="medium">{crit.label}</Text>
          {crit.description && <Text tone="subdued" as="p" variant="bodySm">{crit.description}</Text>}
        </BlockStack>
        <Text as="span" fontWeight="semibold" tone={pct >= 80 ? "success" : pct >= 40 ? undefined : "critical"}>
          {copy.scorePoints(crit.score, crit.maxPoints)}
        </Text>
      </InlineStack>
      <Box paddingBlockStart="150" paddingBlockEnd="150">
        <ProgressBar progress={pct} size="small" tone={pct >= 80 ? "success" : pct >= 40 ? "highlight" : "critical"} />
      </Box>
      <InlineStack gap="400" wrap>
        {crit.currentValue != null && (
          <Text tone="subdued" variant="bodySm">{copy.currentValue}: <Text as="span" fontWeight="medium">{String(crit.currentValue)}{crit.unit && crit.unit !== "not_automated" ? ` ${crit.unit}` : ""}</Text></Text>
        )}
        {crit.targetValue != null && (
          <Text tone="subdued" variant="bodySm">{copy.targetValue}: <Text as="span" fontWeight="medium">{String(crit.targetValue)}</Text></Text>
        )}
        {crit.pointsLost > 0.05 && (
          <Text tone="critical" variant="bodySm" fontWeight="medium">{copy.pointsLost(crit.pointsLost)}</Text>
        )}
      </InlineStack>
      {crit.confidence && (
        <Box paddingBlockStart="100"><span className="sh-chip">{confidenceText(copy, crit.confidence, crit.sampleSize)}</span></Box>
      )}
      {crit.notImplemented && (
        <Box paddingBlockStart="100"><Text tone="subdued" variant="bodySm">{copy.notImplemented}</Text></Box>
      )}
      {Array.isArray(crit.issues) && crit.issues.length > 0 && (
        <Box paddingBlockStart="150">
          <BlockStack gap="050">
            <Text variant="bodySm" fontWeight="medium">{copy.howToImprove}</Text>
            {crit.issues.slice(0, 5).map((issue, i) => (
              <Text key={issue.key || i} tone="subdued" variant="bodySm" as="p">• {issueLabel(locale, issue)}</Text>
            ))}
          </BlockStack>
        </Box>
      )}
    </div>
  );
}

function CategoryCard({ cat, copy, locale, openId, setOpenId }) {
  const isOpen = openId === cat.id;
  const pct = cat.maxPoints > 0 && cat.score != null ? Math.round((cat.score / cat.maxPoints) * 100) : 0;
  return (
    <Card padding="0">
      <div className="sh-cat-row" onClick={() => setOpenId(isOpen ? null : cat.id)}>
        <div style={{ flex: 1, minWidth: 0 }}>
        <BlockStack gap="100">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="span" fontWeight="semibold">{cat.label}</Text>
            <Text as="span" fontWeight="semibold" tone={cat.score == null ? "subdued" : (pct >= 80 ? "success" : pct >= 40 ? undefined : "critical")}>
              {cat.score == null ? "—" : copy.scorePoints(cat.score, cat.maxPoints)}
            </Text>
          </InlineStack>
          <ProgressBar progress={cat.score == null ? 0 : pct} size="small" tone={pct >= 80 ? "success" : pct >= 40 ? "highlight" : "critical"} />
        </BlockStack>
        </div>
        <Text as="span" tone="subdued">{isOpen ? "▲" : "▼"}</Text>
      </div>
      {isOpen && (
        <Box>
          {(cat.criteria || []).length === 0 ? (
            <Box padding="300"><Text tone="subdued">{copy.notEnoughData}</Text></Box>
          ) : (
            cat.criteria.map((crit) => <CriterionRow key={crit.id} crit={crit} copy={copy} locale={locale} />)
          )}
        </Box>
      )}
    </Card>
  );
}

function HistoryChart({ sellerId, copy, locale }) {
  const [days, setDays] = useState(30);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      const res = await getMedusaAdminClient().getSellerHealthHistory({ seller_id: sellerId, days });
      setHistory(Array.isArray(res?.history) ? res.history : []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [sellerId, days]);

  useEffect(() => { load(); }, [load]);

  const max = 100;
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between">
          <Text variant="headingSm" as="h3">{copy.tabHistory}</Text>
          <InlineStack gap="100">
            {[7, 30, 90].map((d) => (
              <Button key={d} size="slim" pressed={days === d} onClick={() => setDays(d)}>
                {d === 7 ? copy.historyRange7 : d === 30 ? copy.historyRange30 : copy.historyRange90}
              </Button>
            ))}
          </InlineStack>
        </InlineStack>
        {loading ? (
          <Text tone="subdued">{copy.loading}</Text>
        ) : history.length === 0 ? (
          <Text tone="subdued" alignment="center">{copy.noHistory}</Text>
        ) : (
          <div className="sh-hist-bars">
            {history.map((h, i) => {
              const heightPct = h.score != null ? Math.max(4, (h.score / max) * 100) : 4;
              const color = h.isBlocked ? "#991b1b" : h.score == null ? "#e5e7eb" : scoreColor(h.score);
              return (
                <div
                  key={h.date || i}
                  className="sh-hist-bar"
                  title={`${fmtDate(h.date, locale)}: ${h.score != null ? Math.round(h.score) : "—"}`}
                  style={{ height: `${heightPct}%`, background: color }}
                />
              );
            })}
          </div>
        )}
      </BlockStack>
    </Card>
  );
}

function ConfigEditorCard({ config, copy, onSaved }) {
  const [categories, setCategories] = useState(config.categories || []);
  const [criteria, setCriteria] = useState(config.criteria || []);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [openCat, setOpenCat] = useState(null);

  useEffect(() => {
    setCategories(config.categories || []);
    setCriteria(config.criteria || []);
  }, [config]);

  const weightSum = categories.reduce((s, c) => s + Number(c.max_points || 0), 0);

  const updateCat = (id, patch) => setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const updateCrit = (id, patch) => setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const save = async () => {
    setSaving(true); setErr("");
    try {
      await getMedusaAdminClient().updateSellerHealthConfig({
        categories: categories.map((c) => ({ id: c.id, max_points: Number(c.max_points), enabled: !!c.enabled })),
        criteria: criteria.map((c) => ({ id: c.id, max_points: Number(c.max_points), enabled: !!c.enabled, min_sample_size: Number(c.min_sample_size || 0) })),
      });
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setErr(e?.message || copy.error);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (typeof window !== "undefined" && !window.confirm(copy.resetConfirm)) return;
    setSaving(true); setErr("");
    try {
      await getMedusaAdminClient().resetSellerHealthConfig();
      onSaved?.();
    } catch (e) {
      setErr(e?.message || copy.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between">
          <Text variant="headingSm" as="h3">{copy.categories}</Text>
          <InlineStack gap="150">
            {editing && (
              <Text tone={weightSum === 100 ? "subdued" : "critical"} variant="bodySm">
                {copy.categoryWeightSum(weightSum)}
              </Text>
            )}
            {!editing ? (
              <Button onClick={() => setEditing(true)}>{copy.editAll}</Button>
            ) : (
              <>
                <Button onClick={reset} tone="critical" variant="tertiary" loading={saving}>{copy.resetDefaults}</Button>
                <Button onClick={() => { setEditing(false); setCategories(config.categories || []); setCriteria(config.criteria || []); }}>{copy.cancel}</Button>
                <Button variant="primary" onClick={save} loading={saving}>{copy.saveChanges}</Button>
              </>
            )}
          </InlineStack>
        </InlineStack>

        {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}
        {editing && weightSum !== 100 && <Banner tone="warning"><Text>{copy.weightWarning}</Text></Banner>}

        <BlockStack gap="200">
          {categories.map((cat) => {
            const catCriteria = criteria.filter((c) => c.category_id === cat.id);
            const isOpen = openCat === cat.id;
            return (
              <Card key={cat.id} padding="0">
                <div className="sh-cat-row" onClick={() => setOpenCat(isOpen ? null : cat.id)}>
                  <InlineStack gap="200" blockAlign="center">
                    <Text fontWeight="semibold">{cat.label}</Text>
                    {!cat.enabled && <Badge>{copy.enabled}: {copy.cancel}</Badge>}
                  </InlineStack>
                  <InlineStack gap="300" blockAlign="center">
                    {editing ? (
                      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div style={{ width: 90 }}>
                          <TextField label={copy.maxPoints} labelHidden type="number" value={String(cat.max_points)} onChange={(v) => updateCat(cat.id, { max_points: v })} autoComplete="off" />
                        </div>
                        <Checkbox label={copy.enabled} checked={!!cat.enabled} onChange={(v) => updateCat(cat.id, { enabled: v })} />
                      </div>
                    ) : (
                      <Text tone="subdued">{cat.max_points} / 100</Text>
                    )}
                    <Text tone="subdued">{isOpen ? "▲" : "▼"}</Text>
                  </InlineStack>
                </div>
                {isOpen && (
                  <Box>
                    {catCriteria.map((crit) => (
                      <div key={crit.id} className="sh-crit-row">
                        <InlineStack align="space-between" blockAlign="center" gap="200">
                          <div style={{ flex: 1, minWidth: 0 }}>
                          <BlockStack gap="050">
                            <Text fontWeight="medium">{crit.label}</Text>
                            {crit.description && <Text tone="subdued" variant="bodySm">{crit.description}</Text>}
                          </BlockStack>
                          </div>
                          {editing ? (
                            <InlineStack gap="200" blockAlign="center">
                              <div style={{ width: 90 }}>
                                <TextField label={copy.maxPoints} labelHidden type="number" value={String(crit.max_points)} onChange={(v) => updateCrit(crit.id, { max_points: v })} autoComplete="off" />
                              </div>
                              <div style={{ width: 110 }}>
                                <TextField label={copy.minSampleSize} labelHidden type="number" value={String(crit.min_sample_size || 0)} onChange={(v) => updateCrit(crit.id, { min_sample_size: v })} autoComplete="off" />
                              </div>
                              <Checkbox label={copy.enabled} checked={!!crit.enabled} onChange={(v) => updateCrit(crit.id, { enabled: v })} />
                            </InlineStack>
                          ) : (
                            <Text tone="subdued">{crit.max_points} pts</Text>
                          )}
                        </InlineStack>
                      </div>
                    ))}
                  </Box>
                )}
              </Card>
            );
          })}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function EventsCard({ sellerId, copy, locale }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [eventType, setEventType] = useState("");
  const [eventLabel, setEventLabel] = useState("");
  const [severity, setSeverity] = useState("high");
  const [isHardBlock, setIsHardBlock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [resolvingId, setResolvingId] = useState(null);

  const load = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      const res = await getMedusaAdminClient().getSellerHealthEvents({ seller_id: sellerId });
      setEvents(Array.isArray(res?.events) ? res.events : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => { load(); }, [load]);

  const openModal = () => {
    setEventType(""); setEventLabel(""); setSeverity("high"); setIsHardBlock(false); setErr("");
    setModalOpen(true);
  };

  const submit = async () => {
    if (!eventType.trim()) { setErr(copy.eventTypeRequired); return; }
    setSaving(true); setErr("");
    try {
      await getMedusaAdminClient().createSellerHealthEvent({
        seller_id: sellerId, event_type: eventType.trim(), severity, is_hard_block: isHardBlock,
        details: eventLabel.trim() ? { label: eventLabel.trim() } : {},
      });
      setModalOpen(false);
      await load();
    } catch (e) {
      setErr(e?.message || copy.error);
    } finally {
      setSaving(false);
    }
  };

  const resolve = async (id) => {
    setResolvingId(id);
    try {
      await getMedusaAdminClient().resolveSellerHealthEvent(id);
      await load();
    } catch (e) {
      alert(e?.message || copy.error);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between">
          <Text variant="headingSm" as="h3">{copy.events}</Text>
          <Button onClick={openModal} disabled={!sellerId}>{copy.addEvent}</Button>
        </InlineStack>
        {loading ? (
          <Text tone="subdued">{copy.loading}</Text>
        ) : events.length === 0 ? (
          <Text tone="subdued" alignment="center">{copy.eventsEmpty}</Text>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="sh-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>{copy.eventType}</th>
                  <th>{copy.eventLabel}</th>
                  <th>{copy.eventSeverity}</th>
                  <th>{copy.hardBlock}</th>
                  <th>{copy.open}</th>
                  <th>{copy.when}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{e.event_type}</td>
                    <td>{e.details?.label || "—"}</td>
                    <td>{e.severity}</td>
                    <td>{e.is_hard_block ? "✓" : "—"}</td>
                    <td>{e.resolved ? <Badge>{copy.resolved}</Badge> : <Badge tone="critical">{copy.open}</Badge>}</td>
                    <td>{fmtDate(e.created_at, locale)}</td>
                    <td>
                      {!e.resolved && (
                        <Button size="micro" loading={resolvingId === e.id} onClick={() => resolve(e.id)}>{copy.resolve}</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BlockStack>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={copy.addEvent} primaryAction={{ content: copy.submit, onAction: submit, loading: saving }} secondaryActions={[{ content: copy.cancel, onAction: () => setModalOpen(false) }]}>
        <Modal.Section>
          <BlockStack gap="300">
            {err && <Banner tone="critical"><Text>{err}</Text></Banner>}
            <TextField label={copy.eventType} value={eventType} onChange={setEventType} autoComplete="off" placeholder="counterfeit_suspicion" />
            <TextField label={copy.eventLabel} value={eventLabel} onChange={setEventLabel} autoComplete="off" multiline={2} />
            <Select label={copy.eventSeverity} options={[{ label: "low", value: "low" }, { label: "medium", value: "medium" }, { label: "high", value: "high" }, { label: "critical", value: "critical" }]} value={severity} onChange={setSeverity} />
            <Checkbox label={copy.hardBlock} checked={isHardBlock} onChange={setIsHardBlock} />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Card>
  );
}

function AuditLogCard({ copy, locale }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getMedusaAdminClient().getSellerHealthAuditLog({ limit: 100 });
        setEntries(Array.isArray(res?.entries) ? res.entries : []);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingSm" as="h3">{copy.auditLog}</Text>
        {loading ? (
          <Text tone="subdued">{copy.loading}</Text>
        ) : entries.length === 0 ? (
          <Text tone="subdued" alignment="center">{copy.auditEmpty}</Text>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="sh-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>{copy.when}</th>
                  <th>{copy.field}</th>
                  <th>{copy.from}</th>
                  <th>{copy.to}</th>
                  <th>{copy.changedBy}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDateTime(e.changed_at, locale)}</td>
                    <td>{e.criterion_id || e.category_id || "—"} · {e.field_changed}</td>
                    <td>{JSON.stringify(e.old_value)}</td>
                    <td>{JSON.stringify(e.new_value)}</td>
                    <td>{e.changed_by || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BlockStack>
    </Card>
  );
}

function SellerHealthPage({ isSuperuser, sellerId }) {
  const locale = useLocale();
  const copy = getHealthCopy(locale);

  const [selectedSellerId, setSelectedSellerId] = useState(isSuperuser ? "" : sellerId);
  const [sellers, setSellers] = useState([]);
  const [tab, setTab] = useState(0);
  const [health, setHealth] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [openCatId, setOpenCatId] = useState(null);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    if (!isSuperuser) return;
    (async () => {
      try {
        const res = await getMedusaAdminClient().getSellerHealthSellers();
        setSellers(Array.isArray(res?.sellers) ? res.sellers : []);
      } catch {
        setSellers([]);
      }
    })();
  }, [isSuperuser]);

  const activeSellerId = isSuperuser ? selectedSellerId : sellerId;

  const loadHealth = useCallback(async () => {
    if (!activeSellerId) { setHealth(null); return; }
    setLoading(true); setErr("");
    try {
      const res = await getMedusaAdminClient().getSellerHealth({ seller_id: activeSellerId });
      setHealth(res);
    } catch (e) {
      setErr(e?.message || copy.error);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [activeSellerId, copy.error]);

  useEffect(() => { loadHealth(); }, [loadHealth]);

  const loadConfig = useCallback(async () => {
    try {
      const res = await getMedusaAdminClient().getSellerHealthConfig();
      setConfig(res);
    } catch {
      setConfig(null);
    }
  }, []);

  useEffect(() => { if (tab === 2 || (!isSuperuser && tab === 0)) loadConfig(); }, [tab, isSuperuser, loadConfig]);

  const recalculate = async () => {
    setRecalculating(true);
    try {
      await getMedusaAdminClient().recalculateSellerHealth(isSuperuser ? { seller_id: activeSellerId } : {});
      await loadHealth();
    } catch (e) {
      alert(e?.message || copy.error);
    } finally {
      setRecalculating(false);
    }
  };

  const tabs = [
    { id: "overview", content: copy.tabOverview },
    { id: "history", content: copy.tabHistory },
    ...(isSuperuser ? [{ id: "admin", content: copy.tabAdmin }] : []),
  ];

  const sellerOptions = sellers.map((s) => ({
    label: s.store_name || s.seller_id,
    value: s.seller_id,
    sublabel: s.latest_score != null ? `${Math.round(s.latest_score)} / 100${s.is_blocked ? " · BLOCKED" : ""}` : "—",
  }));

  return (
    <div className="sh-page">
      <style>{SH_CSS}</style>
      <Page
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        primaryAction={activeSellerId ? { content: copy.recalculate, onAction: recalculate, loading: recalculating } : undefined}
      >
        <Layout>
          {isSuperuser && (
            <Layout.Section>
              <Card>
                <div style={{ maxWidth: 360 }}>
                  <SearchableSelect
                    label={copy.seller}
                    options={sellerOptions}
                    value={selectedSellerId}
                    onChange={setSelectedSellerId}
                    emptyLabel={copy.selectSeller}
                  />
                </div>
              </Card>
            </Layout.Section>
          )}

          <Layout.Section>
            <Card padding="0">
              <Tabs tabs={tabs} selected={tab} onSelect={setTab} />
            </Card>
          </Layout.Section>

          {err && (
            <Layout.Section>
              <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>
            </Layout.Section>
          )}

          {!activeSellerId ? (
            <Layout.Section>
              <Card><Box padding="400"><Text tone="subdued" alignment="center">{copy.selectSeller}</Text></Box></Card>
            </Layout.Section>
          ) : loading && !health ? (
            <Layout.Section>
              <Card><Box padding="400"><Text tone="subdued" alignment="center">{copy.loading}</Text></Box></Card>
            </Layout.Section>
          ) : tab === 0 ? (
            <>
              <Layout.Section>
                <ScoreHero data={health} copy={copy} locale={locale} />
              </Layout.Section>
              {health?.overallDataSufficient && (
                <>
                  <Layout.Section>
                    <IssuesPanel issues={health.issues} copy={copy} locale={locale} onJump={setOpenCatId} />
                  </Layout.Section>
                  <Layout.Section>
                    <BlockStack gap="300">
                      {(health.categories || []).map((cat) => (
                        <CategoryCard key={cat.id} cat={cat} copy={copy} locale={locale} openId={openCatId} setOpenId={setOpenCatId} />
                      ))}
                    </BlockStack>
                  </Layout.Section>
                </>
              )}
            </>
          ) : tab === 1 ? (
            <Layout.Section>
              <HistoryChart sellerId={activeSellerId} copy={copy} locale={locale} />
            </Layout.Section>
          ) : (
            <>
              <Layout.Section>
                {config ? <ConfigEditorCard config={config} copy={copy} onSaved={loadConfig} /> : <Card><Box padding="400"><Text tone="subdued">{copy.loading}</Text></Box></Card>}
              </Layout.Section>
              <Layout.Section>
                <EventsCard sellerId={activeSellerId} copy={copy} locale={locale} />
              </Layout.Section>
              <Layout.Section>
                <AuditLogCard copy={copy} locale={locale} />
              </Layout.Section>
            </>
          )}
        </Layout>
      </Page>
    </div>
  );
}

export default function SellerHealthPageWrapper() {
  const locale = useLocale();
  const copy = getHealthCopy(locale);
  const [isSuperuser, setIsSuperuser] = useState(null);
  const [sellerId, setSellerId] = useState("");

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    const sid = typeof window !== "undefined" ? (localStorage.getItem("sellerId") || "") : "";
    setIsSuperuser(su);
    setSellerId(sid);
  }, []);

  if (isSuperuser === null) {
    return (
      <DashboardLayout>
        <Page title={copy.pageTitle}>
          <Box padding="400"><Text tone="subdued">{copy.loading}</Text></Box>
        </Page>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <SellerHealthPage isSuperuser={isSuperuser} sellerId={sellerId} />
    </DashboardLayout>
  );
}
