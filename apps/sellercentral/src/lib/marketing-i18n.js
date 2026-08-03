import { lt, dateLocaleFor } from "@/lib/locale-text";

export function getAdStatusLabel(locale, status) {
  const s = String(status || "").toLowerCase();
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const map = {
    draft: t("Draft", "Taslak", "Brouillon", "Borrador", "Bozza", "Entwurf"),
    pending: t("Pending", "Beklemede", "En attente", "Pendiente", "In sospeso", "Ausstehend"),
    pending_review: t("Review", "İnceleme", "Examen", "Revisión", "Revisione", "Prüfung"),
    approved: t("Approved", "Onaylandı", "Approuvé", "Aprobado", "Approvato", "Genehmigt"),
    published: t("Live", "Yayında", "En ligne", "Activo", "Live", "Live"),
    partial: t("Partially live", "Kısmen yayında", "Partiellement en ligne", "Parcialmente activo", "Parzialmente live", "Teilweise live"),
    paused: t("Paused", "Duraklatıldı", "En pause", "Pausado", "In pausa", "Pausiert"),
    rejected: t("Rejected", "Reddedildi", "Rejeté", "Rechazado", "Rifiutato", "Abgelehnt"),
  };
  return map[s] || status;
}

export function getCampaignStatusLabel(locale, status) {
  const s = String(status || "").toLowerCase();
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const map = {
    draft: t("Draft", "Taslak", "Brouillon", "Borrador", "Bozza", "Entwurf"),
    active: t("Active", "Aktif", "Actif", "Activo", "Attivo", "Aktiv"),
    paused: t("Paused", "Duraklatıldı", "En pause", "Pausado", "In pausa", "Pausiert"),
    archived: t("Archived", "Arşiv", "Archivé", "Archivado", "Archiviato", "Archiviert"),
  };
  return map[s] || status;
}

export function fmtBudgetLocale(cents, locale) {
  if (!cents) return "—";
  const perDay = lt(locale, "/day", "/gün", "/jour", "/día", "/giorno", "/Tag");
  return `${(parseInt(cents, 10) / 100).toFixed(2)} €${perDay}`;
}

export function fmtDateLocale(v, locale) {
  return v
    ? new Date(v).toLocaleString(dateLocaleFor(locale), { dateStyle: "short", timeStyle: "short" })
    : "—";
}

export function getTargetOptions(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return [
    { value: "products", label: t("Specific products", "Belirli ürünler", "Produits spécifiques", "Productos específicos", "Prodotti specifici", "Bestimmte Produkte") },
    { value: "groups", label: t("Product groups", "Ürün grupları", "Groupes de produits", "Grupos de productos", "Gruppi di prodotti", "Produktgruppen") },
    { value: "all", label: t("All own products", "Tüm kendi ürünlerim", "Tous mes produits", "Todos mis productos", "Tutti i miei prodotti", "Alle eigenen Produkte") },
  ];
}

export function getShopGoalOptions(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return [
    { value: "visibility", label: t("Maximum visibility in shop", "Mağazada maksimum görünürlük", "Visibilité maximale dans la boutique", "Máxima visibilidad en la tienda", "Massima visibilità nel negozio", "Maximale Sichtbarkeit im Shop"), hint: t("Products higher in search & categories", "Ürünler arama ve kategorilerde daha üstte", "Produits plus hauts dans recherche et catégories", "Productos más arriba en búsqueda y categorías", "Prodotti più in alto in ricerca e categorie", "Produkte höher in Suchergebnissen & Kategorien") },
    { value: "traffic", label: t("More product page views", "Daha fazla ürün sayfası görüntüleme", "Plus de vues produit", "Más visitas a páginas de producto", "Più visualizzazioni prodotto", "Mehr Produktaufrufe"), hint: t("More clicks on your product pages", "Ürün sayfalarınıza daha fazla tıklama", "Plus de clics sur vos pages produit", "Más clics en tus páginas de producto", "Più clic sulle tue pagine prodotto", "Mehr Klicks auf deine Produktseiten") },
    { value: "conversion_focus", label: t("Strengthen purchase intent", "Satın alma niyetini güçlendir", "Renforcer l'intention d'achat", "Reforzar intención de compra", "Rafforzare intenzione d'acquisto", "Kaufabsicht stärken"), hint: t("Focus on compelling placement at point of sale", "Satış noktasında ikna edici yerleşim", "Placement convaincant au point de vente", "Colocación convincente en el punto de venta", "Posizionamento convincente al punto vendita", "Fokus auf überzeugende Platzierung zum Point of Sale") },
  ];
}

export function getMarketingPpcEditorCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    yourCampaign: t("Your campaign", "Kampanyanız", "Votre campagne", "Tu campaña", "La tua campagna", "Deine Kampagne"),
    allItems: t("All items", "Tüm ürünler", "Tous les articles", "Todos los artículos", "Tutti gli articoli", "Alle Artikel"),
    groups: t("Groups", "Gruplar", "Groupes", "Grupos", "Gruppi", "Gruppen"),
    productCount: (n) => t(`${n} product(s)`, `${n} ürün`, `${n} produit(s)`, `${n} producto(s)`, `${n} prodotto/i`, `${n} Produkt(e)`),
    visibilityHint: t("Higher visibility when campaign is approved", "Kampanya onaylandığında daha yüksek görünürlük", "Visibilité accrue lorsque la campagne est approuvée", "Mayor visibilidad cuando la campaña está aprobada", "Maggiore visibilità con campagna approvata", "Höhere Sichtbarkeit bei aktiver Kampagnenfreigabe"),
    uploading: t("Uploading…", "Yükleniyor…", "Téléchargement…", "Subiendo…", "Caricamento…", "Wird hochgeladen …"),
    addVideo: t("+ Add video", "+ Video ekle", "+ Ajouter une vidéo", "+ Añadir video", "+ Aggiungi video", "+ Video hinzufügen"),
    replaceVideo: t("Replace video", "Videoyu değiştir", "Remplacer la vidéo", "Reemplazar video", "Sostituisci video", "Video ersetzen"),
    chooseFile: t("Choose file", "Dosya seç", "Choisir un fichier", "Elegir archivo", "Scegli file", "Datei wählen"),
    campaignImage: t("Campaign image · Banner", "Kampanya görseli · Banner", "Image campagne · Bannière", "Imagen campaña · Banner", "Immagine campagna · Banner", "Kampagnenbild · Banner"),
    addImage: t("+ Add image", "+ Görsel ekle", "+ Ajouter une image", "+ Añadir imagen", "+ Aggiungi immagine", "+ Bild hinzufügen"),
    replaceImage: t("Replace image", "Görseli değiştir", "Remplacer l'image", "Reemplazar imagen", "Sostituisci immagine", "Bild ersetzen"),
    campaignNameLocale: (lang) => t(`Campaign name (${lang})`, `Kampanya adı (${lang})`, `Nom de campagne (${lang})`, `Nombre de campaña (${lang})`, `Nome campagna (${lang})`, `Kampagnenname (${lang})`),
    campaignNamePlaceholder: t("Campaign name in this language…", "Bu dilde kampanya adı…", "Nom de campagne dans cette langue…", "Nombre de campaña en este idioma…", "Nome campagna in questa lingua…", "Kampagnenname in dieser Sprache …"),
    descriptionLocale: (lang) => t(`Description (${lang})`, `Açıklama (${lang})`, `Description (${lang})`, `Descripción (${lang})`, `Descrizione (${lang})`, `Beschreibung (${lang})`),
    descriptionPlaceholder: t("Short description for this language…", "Bu dil için kısa açıklama…", "Courte description pour cette langue…", "Descripción breve para este idioma…", "Breve descrizione per questa lingua…", "Kurzbeschreibung für diese Sprache …"),
    paymentSuccess: t("Payment successful! Your campaign was submitted and will be reviewed.", "Ödeme başarılı! Kampanyanız gönderildi ve incelenecek.", "Paiement réussi ! Votre campagne a été soumise et sera examinée.", "¡Pago exitoso! Tu campaña fue enviada y será revisada.", "Pagamento riuscito! La campagna è stata inviata e sarà revisionata.", "Zahlung erfolgreich! Deine Kampagne wurde eingereicht und wird von uns geprüft."),
    paymentCancelled: t("Payment cancelled. You can try again anytime.", "Ödeme iptal edildi. İstediğiniz zaman tekrar deneyebilirsiniz.", "Paiement annulé. Vous pouvez réessayer à tout moment.", "Pago cancelado. Puedes intentarlo de nuevo.", "Pagamento annullato. Puoi riprovare in qualsiasi momento.", "Zahlung abgebrochen. Du kannst es jederzeit erneut versuchen."),
    campaignNotFound: t("Campaign not found.", "Kampanya bulunamadı.", "Campagne introuvable.", "Campaña no encontrada.", "Campagna non trovata.", "Kampagne nicht gefunden."),
    notAdCampaign: t("This campaign is not an advertising campaign.", "Bu kampanya bir reklam kampanyası değil.", "Cette campagne n'est pas une campagne publicitaire.", "Esta campaña no es una campaña publicitaria.", "Questa campagna non è una campagna pubblicitaria.", "Diese Kampagne ist keine Werbekampagne."),
    loadError: t("Could not load data.", "Veriler yüklenemedi.", "Impossible de charger les données.", "No se pudieron cargar los datos.", "Impossibile caricare i dati.", "Daten konnten nicht geladen werden."),
    videoFormatError: t("Please use MP4, WebM or MOV.", "Lütfen MP4, WebM veya MOV kullanın.", "Utilisez MP4, WebM ou MOV.", "Usa MP4, WebM o MOV.", "Usa MP4, WebM o MOV.", "Bitte MP4, WebM oder MOV verwenden."),
    videoSizeError: t("Video max. 120 MB.", "Video maks. 120 MB.", "Vidéo max. 120 Mo.", "Video máx. 120 MB.", "Video max. 120 MB.", "Video maximal 120 MB."),
    noUrlReturned: t("No URL returned.", "URL döndürülmedi.", "Aucune URL retournée.", "No se devolvió URL.", "Nessun URL restituito.", "Keine URL zurückgegeben."),
    videoUploaded: t("Video uploaded. Save to apply changes.", "Video yüklendi. Değişiklikleri kaydetmek için Kaydet.", "Vidéo téléchargée. Enregistrez pour appliquer.", "Video subido. Guarda para aplicar cambios.", "Video caricato. Salva per applicare.", "Video hochgeladen. Änderungen mit Speichern übernehmen."),
    uploadFailed: t("Upload failed.", "Yükleme başarısız.", "Échec du téléchargement.", "Error al subir.", "Caricamento fallito.", "Upload fehlgeschlagen."),
    imageFormatError: t("Please use JPG, PNG or WebP.", "Lütfen JPG, PNG veya WebP kullanın.", "Utilisez JPG, PNG ou WebP.", "Usa JPG, PNG o WebP.", "Usa JPG, PNG o WebP.", "Bitte JPG, PNG oder WebP verwenden."),
    imageSizeError: t("Image max. 10 MB.", "Görsel maks. 10 MB.", "Image max. 10 Mo.", "Imagen máx. 10 MB.", "Immagine max. 10 MB.", "Bild maximal 10 MB."),
    imageUploaded: t("Image uploaded. Save to apply changes.", "Görsel yüklendi. Değişiklikleri kaydetmek için Kaydet.", "Image téléchargée. Enregistrez pour appliquer.", "Imagen subida. Guarda para aplicar.", "Immagine caricata. Salva per applicare.", "Bild hochgeladen. Änderungen mit Speichern übernehmen."),
    nameRequired: t("Please enter a campaign name.", "Lütfen bir kampanya adı girin.", "Veuillez saisir un nom de campagne.", "Introduce un nombre de campaña.", "Inserisci un nome campagna.", "Bitte einen Kampagnennamen eingeben."),
    budgetRequired: t("Please enter a valid daily budget (e.g. 5 for €5/day).", "Lütfen geçerli bir günlük bütçe girin (örn. 5 = 5 €/gün).", "Saisissez un budget journalier valide (ex. 5 pour 5 €/jour).", "Introduce un presupuesto diario válido (p. ej. 5 = 5 €/día).", "Inserisci un budget giornaliero valido (es. 5 = 5 €/giorno).", "Bitte ein gültiges Tagesbudget eingeben (z.B. 5 für 5 €/Tag)."),
    saved: t("Campaign saved.", "Kampanya kaydedildi.", "Campagne enregistrée.", "Campaña guardada.", "Campagna salvata.", "Kampagne gespeichert."),
    saveError: t("Error saving.", "Kaydetme hatası.", "Erreur lors de l'enregistrement.", "Error al guardar.", "Errore durante il salvataggio.", "Fehler beim Speichern."),
    budgetSaveFirst: t("Please enter a valid daily budget and save first.", "Lütfen önce geçerli bir günlük bütçe girin ve kaydedin.", "Saisissez d'abord un budget journalier valide et enregistrez.", "Introduce primero un presupuesto diario válido y guarda.", "Inserisci prima un budget giornaliero valido e salva.", "Bitte zuerst ein gültiges Tagesbudget eingeben und speichern."),
    checkoutFailed: t("Could not start checkout.", "Ödeme başlatılamadı.", "Impossible de démarrer le paiement.", "No se pudo iniciar el pago.", "Impossibile avviare il checkout.", "Checkout konnte nicht gestartet werden."),
    payError: t("Error processing payment.", "Ödeme işlenirken hata.", "Erreur lors du paiement.", "Error al procesar el pago.", "Errore durante il pagamento.", "Fehler beim Bezahlen."),
    loadingCampaign: t("Loading campaign…", "Kampanya yükleniyor…", "Chargement de la campagne…", "Cargando campaña…", "Caricamento campagna…", "Kampagne laden …"),
    back: t("Back", "Geri", "Retour", "Atrás", "Indietro", "Zurück"),
    editShopAd: t("Edit shop advertising", "Mağaza reklamını düzenle", "Modifier la publicité boutique", "Editar publicidad de tienda", "Modifica pubblicità negozio", "Shop-Werbung bearbeiten"),
    adCampaign: t("Advertising campaign", "Werbekampagne", "Campagne publicitaire", "Campaña publicitaria", "Campagna pubblicitaria", "Werbekampagne"),
    backToOverview: t("Back to overview", "Genel bakışa dön", "Retour à l'aperçu", "Volver al resumen", "Torna alla panoramica", "Zurück zur Übersicht"),
    save: t("Save", "Kaydet", "Enregistrer", "Guardar", "Salva", "Speichern"),
    newShopCampaign: t("New shop campaign", "Yeni mağaza kampanyası", "Nouvelle campagne boutique", "Nueva campaña de tienda", "Nuova campagna negozio", "Neue Shop-Kampagne"),
    basicsTitle: t("Basics & strategy", "Temeller ve strateji", "Bases et stratégie", "Fundamentos y estrategia", "Basi e strategia", "Grundlagen & Strategie"),
    basicsSubtitleSeller: t("Name your campaign and describe internally what it's about — this helps us place it consistently.", "Kampanyanızı adlandırın ve dahili olarak ne hakkında olduğunu açıklayın — tutarlı yerleştirmemize yardımcı olur.", "Nommez votre campagne et décrivez en interne — cela nous aide à la placer de façon cohérente.", "Nombra tu campaña y describe internamente de qué trata.", "Nomina la campagna e descrivi internamente di cosa si tratta.", "Benenne deine Kampagne und beschreibe intern, worum es geht — das hilft uns, sie konsistent zu platzieren."),
    basicsSubtitleAdmin: t("Internal name and description.", "Dahili ad ve açıklama.", "Nom et description internes.", "Nombre y descripción internos.", "Nome e descrizione interni.", "Interne Benennung und Beschreibung."),
    campaignName: t("Campaign name *", "Kampanya adı *", "Nom de campagne *", "Nombre de campaña *", "Nome campagna *", "Kampagnenname *"),
    internalNote: t("Internal note", "Dahili not", "Note interne", "Nota interna", "Nota interna", "Interne Notiz"),
    pause: t("Pause", "Duraklat", "Mettre en pause", "Pausar", "Metti in pausa", "Pausieren"),
    resume: t("Resume", "Devam et", "Reprendre", "Reanudar", "Riprendi", "Fortsetzen"),
    activeOn: t("Active on", "Aktif:", "Actif sur", "Activo en", "Attivo su", "Aktiv auf"),
    created: t("Created", "Oluşturuldu", "Créé", "Creado", "Creato", "Erstellt"),
    budgetDaily: t("Budget", "Butce", "Budget", "Presupuesto", "Budget", "Budget"),
    googleAds: t("Google Ads", "Google Ads", "Google Ads", "Google Ads", "Google Ads", "Google Ads"),
    pushToAds: t("Push to ad accounts", "Reklam hesaplarına gönder", "Envoyer aux comptes publicitaires", "Enviar a cuentas de anuncios", "Invia agli account pubblicitari", "An Werbekonten senden"),
    pushSuccess: t("Campaign pushed to the connected ad account(s).", "Kampanya bağlı reklam hesabına/hesaplarına gönderildi.", "Campagne envoyée au(x) compte(s) publicitaire(s) connecté(s).", "Campaña enviada a la(s) cuenta(s) de anuncios conectada(s).", "Campagna inviata agli account pubblicitari collegati.", "Kampagne an das/die verbundene(n) Werbekonto/-konten gesendet."),
    pushError: t("Error pushing to ad accounts.", "Reklam hesaplarına gönderirken hata.", "Erreur lors de l'envoi aux comptes publicitaires.", "Error al enviar a las cuentas de anuncios.", "Errore durante l'invio agli account pubblicitari.", "Fehler beim Senden an die Werbekonten."),
    noAdPlatformsSelected: t("No ad platform selected for this campaign yet.", "Bu kampanya için henüz bir reklam platformu seçilmedi.", "Aucune plateforme publicitaire sélectionnée pour cette campagne.", "Aún no se ha seleccionado ninguna plataforma publicitaria.", "Nessuna piattaforma pubblicitaria selezionata per questa campagna.", "Für diese Kampagne ist noch keine Werbeplattform ausgewählt."),
    focusShop: t("Focus: Visibility & Sponsored in shop", "Odak: Mağazada görünürlük & sponsorlu", "Focus : Visibilité & sponsorisé dans la boutique", "Enfoque: Visibilidad & patrocinado en la tienda", "Focus: Visibilità & sponsorizzato nel negozio", "Fokus: Sichtbarkeit & Sponsored im Shop"),
    errors: t("Errors", "Hatalar", "Erreurs", "Errores", "Errori", "Fehler"),
    remove: t("Remove", "Kaldır", "Supprimer", "Eliminar", "Rimuovi", "Entfernen"),
    sponsored: t("Sponsored", "Sponsorlu", "Sponsorisé", "Patrocinado", "Sponsorizzato", "Sponsored"),
    liveShopPreview: t("Live shop preview", "Canlı mağaza önizlemesi", "Aperçu en direct dans la boutique", "Vista previa en la tienda", "Anteprima live nel negozio", "Live-Vorschau im Shop"),
    dailyBudget: t("Daily budget", "Günlük bütçe", "Budget journalier", "Presupuesto diario", "Budget giornaliero", "Tagesbudget"),
    targetAudience: t("Target audience", "Hedef kitle", "Public cible", "Público objetivo", "Pubblico target", "Zielgruppe"),
    promotion: t("Promotion", "Promosyon", "Promotion", "Promoción", "Promozione", "Promotion"),
    budgetPerDay: (n) => t(`Budget ${n} €/day`, `Bütçe ${n} €/gün`, `Budget ${n} €/jour`, `Presupuesto ${n} €/día`, `Budget ${n} €/giorno`, `Budget ${n} €/Tag`),
    imageBadge: t("Image", "Görsel", "Image", "Imagen", "Immagine", "Bild"),
    imageRoleLine: t("Used as thumbnail or banner in the shop and on external channels.", "Mağazada ve harici kanallarda küçük resim veya banner olarak kullanılır.", "Utilisé comme miniature ou bannière dans la boutique et sur les canaux externes.", "Se usa como miniatura o banner en la tienda y canales externos.", "Usato come miniatura o banner nel negozio e sui canali esterni.", "Wird als Thumbnail oder Banner im Shop und auf externen Kanälen eingesetzt."),
    imageSpecsLine: t("JPG / PNG / WebP · min. 800 × 600 px · max. 10 MB", "JPG / PNG / WebP · min. 800 × 600 px · maks. 10 MB", "JPG / PNG / WebP · min. 800 × 600 px · max. 10 Mo", "JPG / PNG / WebP · mín. 800 × 600 px · máx. 10 MB", "JPG / PNG / WebP · min. 800 × 600 px · max. 10 MB", "JPG / PNG / WebP · min. 800 × 600 px · max. 10 MB"),
    shopHighlightTitle: t("Shop highlight · 16 : 9", "Mağaza öne çıkan · 16 : 9", "Mise en avant boutique · 16 : 9", "Destacado en tienda · 16 : 9", "In evidenza nel negozio · 16 : 9", "Shop-Highlight · 16 : 9"),
    shopHighlightBadge: t("Prominent in shop", "Mağazada öne çıkan", "En vedette dans la boutique", "Destacado en la tienda", "In evidenza nel negozio", "Im Shop prominent"),
    shopHighlightRole: t("This format is displayed large in the marketplace — maximum attention for your campaign.", "Bu format pazaryerinde büyük gösterilir — kampanyanız için maksimum dikkat.", "Ce format est affiché en grand sur la marketplace — attention maximale pour votre campagne.", "Este formato se muestra grande en el marketplace — máxima atención para tu campaña.", "Questo formato viene mostrato in grande nel marketplace — massima attenzione per la campagna.", "Dieses Format wird im Marktplatz groß ausgespielt — maximale Aufmerksamkeit für deine Kampagne."),
    shopHighlightSpecs: t("Recommended: 1920 × 1080 px or higher · MP4 (H.264) · max. 120 MB", "Önerilen: 1920 × 1080 px veya üzeri · MP4 (H.264) · maks. 120 MB", "Recommandé : 1920 × 1080 px ou plus · MP4 (H.264) · max. 120 Mo", "Recomendado: 1920 × 1080 px o más · MP4 (H.264) · máx. 120 MB", "Consigliato: 1920 × 1080 px o superiore · MP4 (H.264) · max. 120 MB", "Empfehlung: 1920 × 1080 px oder höher · MP4 (H.264) · max. 120 MB"),
    reelsTitle: t("Reels / Stories · 9 : 16", "Reels / Stories · 9 : 16", "Reels / Stories · 9 : 16", "Reels / Stories · 9 : 16", "Reels / Stories · 9 : 16", "Reels / Stories · 9 : 16"),
    reelsBadge: t("Social media", "Sosyal medya", "Réseaux sociaux", "Redes sociales", "Social media", "Social Media"),
    reelsRole: t("Vertical video for paid social advertising (Reels / Stories).", "Ücretli sosyal medya reklamları için dikey video (Reels / Stories).", "Vidéo verticale pour publicité sociale payante (Reels / Stories).", "Video vertical para publicidad social de pago (Reels / Stories).", "Video verticale per pubblicità social a pagamento (Reels / Stories).", "Vertikales Video für bezahlte Social-Media-Werbung (Reels / Stories)."),
    reelsSpecs: t("Recommended: 1080 × 1920 px · MP4 (H.264) · max. 120 MB", "Önerilen: 1080 × 1920 px · MP4 (H.264) · maks. 120 MB", "Recommandé : 1080 × 1920 px · MP4 (H.264) · max. 120 Mo", "Recomendado: 1080 × 1920 px · MP4 (H.264) · máx. 120 MB", "Consigliato: 1080 × 1920 px · MP4 (H.264) · max. 120 MB", "Empfehlung: 1080 × 1920 px · MP4 (H.264) · max. 120 MB"),
    shopPromotionBadge: t("Shop promotion", "Mağaza promosyonu", "Promotion boutique", "Promoción de tienda", "Promozione negozio", "Shop-Promotion"),
    visibilityRankingBadge: t("Visibility & ranking", "Görünürlük & sıralama", "Visibilité & classement", "Visibilidad & ranking", "Visibilità & ranking", "Sichtbarkeit & Ranking"),
    heroSubtitle: t("Boost your offers' visibility in the marketplace: Sponsored badge, better placement and more attention.", "Tekliflerinizin pazaryerindeki görünürlüğünü artırın: Sponsorlu rozet, daha iyi yerleşim ve daha fazla dikkat.", "Augmentez la visibilité de vos offres sur la marketplace : badge sponsorisé, meilleur placement et plus d'attention.", "Aumenta la visibilidad de tus ofertas en el marketplace: insignia patrocinada, mejor posición y más atención.", "Aumenta la visibilità delle tue offerte nel marketplace: badge sponsorizzato, posizionamento migliore e più attenzione.", "Steigere die Sichtbarkeit deiner Angebote im Marktplatz: Sponsored-Badge, bessere Platzierung und mehr Aufmerksamkeit."),
    adminMarketingHint: t("Admin note: Connect marketing accounts under Apps & Integrations to control external distribution.", "Admin notu: Harici dağıtımı kontrol etmek için Uygulamalar & Entegrasyonlar altında pazarlama hesaplarını bağlayın.", "Note admin : connectez les comptes marketing sous Apps & Intégrations pour contrôler la diffusion externe.", "Nota admin: conecta cuentas de marketing en Apps e integraciones para controlar la distribución externa.", "Nota admin: collega gli account marketing in App & integrazioni per controllare la distribuzione esterna.", "Admin-Hinweis: Marketing-Konten unter Apps & Integrationen verbinden, um externe Ausspielung zu steuern."),
    internalNoteHelp: t("Visible only to you and our team.", "Yalnızca size ve ekibimize görünür.", "Visible uniquement pour vous et notre équipe.", "Visible solo para ti y nuestro equipo.", "Visibile solo a te e al nostro team.", "Nur für dich und unser Team sichtbar."),
    yourShopGoal: t("Your shop goal", "Mağaza hedefiniz", "Votre objectif boutique", "Tu objetivo en la tienda", "Il tuo obiettivo nel negozio", "Dein Ziel im Shop"),
    audienceOptional: t("Audience (optional)", "Hedef kitle (isteğe bağlı)", "Public (optionnel)", "Público (opcional)", "Pubblico (opzionale)", "Zielgruppe (optional)"),
    selected: t("Selected", "Seçildi", "Sélectionné", "Seleccionado", "Selezionato", "Ausgewählt"),
    keywordsOptional: t("Keywords & messages (optional)", "Anahtar kelimeler & mesajlar (isteğe bağlı)", "Mots-clés & messages (optionnel)", "Palabras clave y mensajes (opcional)", "Parole chiave & messaggi (opzionale)", "Keywords & Botschaften (optional)"),
    keywordPlaceholder: t("Enter keyword + Enter …", "Anahtar kelime girin + Enter …", "Saisir un mot-clé + Entrée …", "Introduce palabra clave + Enter …", "Inserisci parola chiave + Invio …", "Keyword eingeben + Enter …"),
    add: t("Add", "Ekle", "Ajouter", "Añadir", "Aggiungi", "Hinzufügen"),
    mediaCreativeTitle: t("Media creative", "Medya kreatifi", "Créatif média", "Creativo multimedia", "Creative media", "Medien-Creative"),
    mediaCreativeSubtitleSeller: t("Image and videos for the campaign — for maximum visibility in the shop and on social media.", "Kampanya için görsel ve videolar — mağazada ve sosyal medyada maksimum görünürlük.", "Image et vidéos pour la campagne — visibilité maximale dans la boutique et sur les réseaux sociaux.", "Imagen y videos para la campaña — máxima visibilidad en la tienda y redes sociales.", "Immagine e video per la campagna — massima visibilità nel negozio e sui social.", "Bild und Videos für die Kampagne — für maximale Sichtbarkeit im Shop und auf Social Media."),
    mediaCreativeSubtitleAdmin: t("Seller assets: image, shop highlight (16:9) and vertical Reels format.", "Satıcı varlıkları: görsel, mağaza öne çıkan (16:9) ve dikey Reels formatı.", "Assets vendeur : image, mise en avant boutique (16:9) et format Reels vertical.", "Activos del vendedor: imagen, destacado en tienda (16:9) y formato Reels vertical.", "Asset venditore: immagine, highlight negozio (16:9) e formato Reels verticale.", "Verkäufer-Assets: Bild, Shop-Highlight (16:9) und vertikales Reels-Format."),
    creativeBannerText: t("Good creative gets extra distribution: If your media is compelling, we may also use it in paid social media campaigns alongside the shop.", "İyi kreatif ekstra dağıtım alır: Medyanız ikna ediciyse mağazanın yanı sıra ücretli sosyal medya kampanyalarında da kullanabiliriz.", "Un bon créatif est diffusé en plus : si vos médias convainquent, nous pouvons aussi les utiliser dans des campagnes sociales payantes en plus de la boutique.", "Buen creativo = más distribución: si tu contenido convence, también podemos usarlo en campañas sociales de pago además de la tienda.", "Un buon creative viene diffuso in più: se i tuoi media convincono, possiamo usarli anche in campagne social a pagamento oltre al negozio.", "Gutes Creative wird zusätzlich ausgespielt: Wenn deine Medien überzeugen, können wir sie neben dem Shop auch in bezahlten Social-Media-Kampagnen einsetzen."),
    creativeBannerStrong: t("Good creative gets extra distribution:", "İyi kreatif ekstra dağıtım alır:", "Un bon créatif est diffusé en plus :", "Buen creativo = más distribución:", "Un buon creative viene diffuso in più:", "Gutes Creative wird zusätzlich ausgespielt:"),
    adminUrlsNote: t("URLs are stored in campaign settings; external distribution via admin processes.", "URL'ler kampanya ayarlarında saklanır; harici dağıtım admin süreçleriyle.", "Les URL sont stockées dans les paramètres de campagne ; diffusion externe via processus admin.", "Las URL se guardan en la configuración de campaña; distribución externa vía procesos admin.", "Gli URL sono salvati nelle impostazioni campagna; distribuzione esterna via processi admin.", "URLs werden in den Kampagneneinstellungen gespeichert; Ausspielung extern über Admin-Prozesse."),
    multilingualTitle: t("Multilingual content", "Çok dilli içerik", "Contenu multilingue", "Contenido multilingüe", "Contenuto multilingue", "Mehrsprachiger Inhalt"),
    multilingualSubtitle: t("Campaign name and description per language — shown according to customer language.", "Dile göre kampanya adı ve açıklama — müşteri diline göre gösterilir.", "Nom et description de campagne par langue — affichés selon la langue du client.", "Nombre y descripción de campaña por idioma — según el idioma del cliente.", "Nome e descrizione campagna per lingua — mostrati in base alla lingua del cliente.", "Kampagnenname und Beschreibung je Sprache — wird je nach Kundensprache ausgespielt."),
    budgetRuntimeTitle: t("Budget & runtime", "Bütçe & süre", "Budget & durée", "Presupuesto y duración", "Budget & durata", "Budget & Laufzeit"),
    budgetRuntimeSubtitleSeller: t("Your daily budget controls promotion intensity in the shop. We also use it for professional off-site distribution — without you setting up channels.", "Günlük bütçeniz mağazadaki promosyon yoğunluğunu belirler. Kanal kurmadan profesyonel dış dağıtım için de kullanırız.", "Votre budget journalier contrôle l'intensité de la promotion dans la boutique. Nous l'utilisons aussi pour une diffusion externe professionnelle — sans configuration de canaux.", "Tu presupuesto diario controla la intensidad de la promoción en la tienda. También lo usamos para distribución externa profesional — sin configurar canales.", "Il budget giornaliero controlla l'intensità della promozione nel negozio. Lo usiamo anche per la distribuzione esterna professionale — senza configurare canali.", "Dein Tagesbudget steuert die Intensität der Promotion im Shop. Wir nutzen es zusätzlich für die professionelle Ausspielung außerhalb — ohne dass du Kanäle einrichten musst."),
    budgetRuntimeSubtitleAdmin: t("Daily budget and time window.", "Günlük bütçe ve zaman aralığı.", "Budget journalier et fenêtre temporelle.", "Presupuesto diario y ventana de tiempo.", "Budget giornaliero e finestra temporale.", "Tagesbudget und Zeitfenster."),
    dailyBudgetEuro: t("Daily budget (€) *", "Günlük bütçe (€) *", "Budget journalier (€) *", "Presupuesto diario (€) *", "Budget giornaliero (€) *", "Tagesbudget (€) *"),
    budgetHelpSeller: t("Recommendation: consistent budget over several days. If you want strong off-shop distribution with video (step 2), plan a bit more generously.", "Öneri: birkaç gün boyunca tutarlı bütçe. Güçlü video ile mağaza dışı dağıtım istiyorsanız (adım 2) biraz daha cömert planlayın.", "Recommandation : budget constant sur plusieurs jours. Pour une forte diffusion hors boutique avec vidéo (étape 2), prévoyez un peu plus.", "Recomendación: presupuesto constante varios días. Si quieres fuerte distribución fuera de la tienda con video (paso 2), planifica con más margen.", "Consiglio: budget costante per diversi giorni. Per forte distribuzione fuori negozio con video (passo 2), pianifica un po' più generosamente.", "Empfehlung: konsistentes Budget über mehrere Tage. Wenn du mit starkem Video zusätzlich außerhalb des Shops ausgespielt werden möchtest (Schritt 2), lieber etwas großzügiger planen."),
    budgetHelpAdmin: t("e.g. 5 for €5/day.", "örn. 5 = 5 €/gün.", "ex. 5 pour 5 €/jour.", "p. ej. 5 = 5 €/día.", "es. 5 = 5 €/giorno.", "z.B. 5 für 5 €/Tag."),
    start: t("Start", "Başlangıç", "Début", "Inicio", "Inizio", "Start"),
    endOptional: t("End (optional)", "Bitiş (isteğe bağlı)", "Fin (optionnel)", "Fin (opcional)", "Fine (opzionale)", "Ende (optional)"),
    bidStrategyTechnical: t("Bid strategy (technical)", "Teklif stratejisi (teknik)", "Stratégie d'enchères (technique)", "Estrategia de puja (técnica)", "Strategia di offerta (tecnica)", "Gebotsstrategie (technisch)"),
    externalAdminTitle: t("External distribution (admin)", "Harici dağıtım (admin)", "Diffusion externe (admin)", "Distribución externa (admin)", "Distribuzione esterna (admin)", "Externe Ausspielung (Admin)"),
    externalAdminSubtitle: t("Platform assignment only for team with connected accounts.", "Yalnızca bağlı hesapları olan ekip için platform ataması.", "Attribution de plateforme uniquement pour l'équipe avec comptes connectés.", "Asignación de plataforma solo para equipo con cuentas conectadas.", "Assegnazione piattaforma solo per team con account collegati.", "Plattform-Zuweisung nur für Team mit verbundenen Konten."),
    budgetOnChannels: (budget, count) => t(`${budget} on ${count} channel(s)`, `${budget} üzerinde ${count} kanal`, `${budget} sur ${count} canal(aux)`, `${budget} en ${count} canal(es)`, `${budget} su ${count} canale/i`, `${budget} auf ${count} Kanäle`),
    noChannels: t("no", "yok", "aucun", "ninguno", "nessuno", "keine"),
    notConnected: t("Not connected", "Bağlı değil", "Non connecté", "No conectado", "Non collegato", "Nicht verbunden"),
    connected: t("Connected", "Bağlı", "Connecté", "Conectado", "Collegato", "Verbunden"),
    gadsTitle: t("Google Ads details", "Google Ads detayları", "Détails Google Ads", "Detalles de Google Ads", "Dettagli Google Ads", "Google Ads Details"),
    gadsSubtitle: t("This information is used directly for automatic Google Ads campaign creation. Without keywords and ad copy, no search ads will run.", "Bu bilgiler otomatik Google Ads kampanya oluşturma için doğrudan kullanılır. Anahtar kelime ve reklam metni olmadan arama reklamları yayınlanmaz.", "Ces informations sont utilisées directement pour la création automatique de campagnes Google Ads. Sans mots-clés ni textes, aucune annonce de recherche ne sera diffusée.", "Esta información se usa directamente para crear campañas Google Ads automáticas. Sin palabras clave ni textos, no se mostrarán anuncios de búsqueda.", "Queste informazioni sono usate direttamente per la creazione automatica di campagne Google Ads. Senza parole chiave e testi, nessun annuncio di ricerca verrà mostrato.", "Diese Informationen werden direkt für die automatische Google Ads Kampagnenerstellung verwendet. Ohne Keywords und Anzeigentexte werden keine Suchanzeigen ausgespielt."),
    keywordsLabel: t("Keywords (search terms) *", "Anahtar kelimeler (arama terimleri) *", "Mots-clés (termes de recherche) *", "Palabras clave (términos de búsqueda) *", "Parole chiave (termini di ricerca) *", "Keywords (Suchwörter) *"),
    keywordsHelp: t("Words potential customers search for. Recommendation: 5–20 relevant keywords. Separate with Enter or comma.", "Potansiyel müşterilerin aradığı kelimeler. Öneri: 5–20 ilgili anahtar kelime. Enter veya virgülle ayırın.", "Mots que les clients potentiels recherchent. Recommandation : 5–20 mots-clés pertinents. Séparez par Entrée ou virgule.", "Palabras que buscan clientes potenciales. Recomendación: 5–20 palabras clave relevantes. Separa con Enter o coma.", "Parole cercate dai clienti potenziali. Consiglio: 5–20 parole chiave pertinenti. Separa con Invio o virgola.", "Wörter, nach denen potenzielle Kunden suchen. Empfehlung: 5–20 relevante Keywords. Trennung per Enter oder Komma."),
    keywordGadsPlaceholder: t("Enter keyword, press Enter …", "Anahtar kelime girin, Enter'a basın …", "Saisir un mot-clé, appuyer sur Entrée …", "Introduce palabra clave, pulsa Enter …", "Inserisci parola chiave, premi Invio …", "Keyword eingeben, Enter drücken …"),
    noKeywordsWarning: t("⚠ Without keywords, search ads will not run.", "⚠ Anahtar kelime olmadan arama reklamları yayınlanmaz.", "⚠ Sans mots-clés, aucune annonce de recherche ne sera diffusée.", "⚠ Sin palabras clave, no se mostrarán anuncios de búsqueda.", "⚠ Senza parole chiave, gli annunci di ricerca non verranno mostrati.", "⚠ Ohne Keywords werden Suchanzeigen nicht ausgespielt."),
    headlinesLabel: t("Ad headlines *", "Reklam başlıkları *", "Titres d'annonce *", "Títulos de anuncio *", "Titoli annuncio *", "Anzeigentitel (Headlines) *"),
    headlinesHelp: t("At least 3 headlines required, max. 15. Each max. 30 characters. Google picks the best combination.", "En az 3 başlık gerekli, maks. 15. Her biri maks. 30 karakter. Google en iyi kombinasyonu seçer.", "Au moins 3 titres requis, max. 15. Chacun max. 30 caractères. Google choisit la meilleure combinaison.", "Mínimo 3 títulos, máx. 15. Cada uno máx. 30 caracteres. Google elige la mejor combinación.", "Almeno 3 titoli richiesti, max. 15. Ognuno max. 30 caratteri. Google sceglie la migliore combinazione.", "Mindestens 3 Titel erforderlich, max. 15. Jeder max. 30 Zeichen. Google wählt die beste Kombination."),
    headlineRequired: (n) => t(`Headline ${n} (required)`, `Başlık ${n} (zorunlu)`, `Titre ${n} (obligatoire)`, `Título ${n} (obligatorio)`, `Titolo ${n} (obbligatorio)`, `Titel ${n} (Pflichtfeld)`),
    headlineOptional: (n) => t(`Headline ${n} (optional)`, `Başlık ${n} (isteğe bağlı)`, `Titre ${n} (optionnel)`, `Título ${n} (opcional)`, `Titolo ${n} (opzionale)`, `Titel ${n} (optional)`),
    minHeadlinesWarning: t("⚠ At least 3 headlines required.", "⚠ En az 3 başlık gerekli.", "⚠ Au moins 3 titres requis.", "⚠ Mínimo 3 títulos requeridos.", "⚠ Almeno 3 titoli richiesti.", "⚠ Mindestens 3 Titel erforderlich."),
    descriptionsLabel: t("Ad descriptions *", "Reklam açıklamaları *", "Descriptions d'annonce *", "Descripciones de anuncio *", "Descrizioni annuncio *", "Anzeigenbeschreibungen *"),
    descriptionsHelp: t("At least 2 descriptions, max. 4. Each max. 90 characters.", "En az 2 açıklama, maks. 4. Her biri maks. 90 karakter.", "Au moins 2 descriptions, max. 4. Chacune max. 90 caractères.", "Mínimo 2 descripciones, máx. 4. Cada una máx. 90 caracteres.", "Almeno 2 descrizioni, max. 4. Ognuna max. 90 caratteri.", "Mindestens 2 Beschreibungen, max. 4. Jede max. 90 Zeichen."),
    descriptionRequired: (n) => t(`Description ${n} (required)`, `Açıklama ${n} (zorunlu)`, `Description ${n} (obligatoire)`, `Descripción ${n} (obligatoria)`, `Descrizione ${n} (obbligatoria)`, `Beschreibung ${n} (Pflichtfeld)`),
    descriptionOptional: (n) => t(`Description ${n} (optional)`, `Açıklama ${n} (isteğe bağlı)`, `Description ${n} (optionnel)`, `Descripción ${n} (opcional)`, `Descrizione ${n} (opzionale)`, `Beschreibung ${n} (optional)`),
    landingUrl: t("Target URL (landing page)", "Hedef URL (açılış sayfası)", "URL cible (page d'atterrissage)", "URL de destino (landing page)", "URL di destinazione (landing page)", "Ziel-URL (Landing Page)"),
    landingUrlHelp: t("Leave empty to use the shop homepage.", "Mağaza ana sayfasını kullanmak için boş bırakın.", "Laisser vide pour utiliser la page d'accueil de la boutique.", "Deja vacío para usar la página principal de la tienda.", "Lascia vuoto per usare la homepage del negozio.", "Leer lassen, um die Shop-Startseite zu verwenden."),
    geoTargets: t("Target regions", "Hedef bölgeler", "Régions cibles", "Regiones objetivo", "Regioni target", "Zielregionen"),
    multiSelect: t("Multiple selection possible.", "Çoklu seçim mümkün.", "Sélection multiple possible.", "Selección múltiple posible.", "Selezione multipla possibile.", "Mehrfachauswahl möglich."),
    targetLanguage: t("Target language", "Hedef dil", "Langue cible", "Idioma objetivo", "Lingua target", "Zielsprache"),
    maxCpcBid: t("Max. CPC bid (cents)", "Maks. CPC teklifi (sent)", "Enchère CPC max. (centimes)", "Puja CPC máx. (céntimos)", "Offerta CPC max. (centesimi)", "Max. CPC Gebot (Cent)"),
    cpcHelp: t("e.g. 50 = €0.50 per click. Recommendation: 30–200 cents.", "örn. 50 = tıklama başına 0,50 €. Öneri: 30–200 sent.", "ex. 50 = 0,50 € par clic. Recommandation : 30–200 centimes.", "p. ej. 50 = 0,50 € por clic. Recomendación: 30–200 céntimos.", "es. 50 = 0,50 € per clic. Consiglio: 30–200 centesimi.", "z.B. 50 = 0,50 € pro Klick. Empfehlung: 30–200 Cent."),
    productsFocusTitle: t("Products in focus", "Odak ürünler", "Produits en vedette", "Productos en foco", "Prodotti in evidenza", "Produkte im Fokus"),
    productsFocusSubtitleSeller: t("Choose which listings benefit from this promotion — or all your active items.", "Bu promosyondan hangi listelerin yararlanacağını seçin — veya tüm aktif ürünleriniz.", "Choisissez quelles fiches profitent de cette promotion — ou tous vos articles actifs.", "Elige qué listados se benefician de esta promoción — o todos tus artículos activos.", "Scegli quali inserzioni beneficiano di questa promozione — o tutti i tuoi articoli attivi.", "Wähle, welche Listings von dieser Promotion profitieren — oder alle deine aktiven Artikel."),
    productsFocusSubtitleAdmin: t("Targeting as in the backend.", "Backend'deki gibi hedefleme.", "Ciblage comme dans le backend.", "Segmentación como en el backend.", "Targeting come nel backend.", "Targeting wie im Backend."),
    targetSelection: t("Target selection", "Hedef seçimi", "Sélection de cible", "Selección de objetivo", "Selezione target", "Zielauswahl"),
    searchProducts: t("Search products …", "Ürün ara …", "Rechercher des produits …", "Buscar productos …", "Cerca prodotti …", "Produkte suchen …"),
    variants: (n) => t(`${n} var.`, `${n} varyant`, `${n} var.`, `${n} var.`, `${n} var.`, `${n} Var.`),
    noProductGroups: t("No product groups yet.", "Henüz ürün grubu yok.", "Pas encore de groupes de produits.", "Aún no hay grupos de productos.", "Nessun gruppo di prodotti ancora.", "Noch keine Produktgruppen."),
    productsCount: (n) => t(`${n} products`, `${n} ürün`, `${n} produits`, `${n} productos`, `${n} prodotti`, `${n} Produkte`),
    allProductsBanner: t("All your active listings will be included in this promotion — ideal for brand presence and assortment campaigns.", "Tüm aktif teklifleriniz bu promosyona dahil edilir — marka görünürlüğü ve sortiment kampanyaları için ideal.", "Toutes vos fiches actives seront incluses dans cette promotion — idéal pour la présence de marque et les campagnes assortiment.", "Todos tus listados activos se incluirán en esta promoción — ideal para presencia de marca y campañas de surtido.", "Tutti i tuoi inserzioni attivi saranno inclusi in questa promozione — ideale per presenza del brand e campagne assortimento.", "Alle deine aktiven Angebote werden für diese Promotion berücksichtigt — ideal für Markenauftritte und Sortiments-Kampagnen."),
    cancel: t("Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen"),
    payAndSubmit: t("Pay & submit", "Öde & gönder", "Payer & soumettre", "Pagar y enviar", "Paga e invia", "Bezahlen & einreichen"),
    stripeNote: (total) => t(`"Pay & submit" bills a 30-day budget (${total}) via Stripe. Your campaign will then be submitted for approval.`, `"Öde & gönder" 30 günlük bütçeyi (${total}) Stripe ile faturalandırır. Kampanyanız ardından onaya gönderilir.`, `"Payer & soumettre" facture un budget 30 jours (${total}) via Stripe. Votre campagne sera ensuite soumise pour approbation.`, `"Pagar y enviar" factura un presupuesto de 30 días (${total}) vía Stripe. Tu campaña se enviará luego para aprobación.`, `"Paga e invia" addebita un budget di 30 giorni (${total}) via Stripe. La campagna verrà poi inviata per approvazione.`, `Mit „Bezahlen & einreichen" wird ein 30-Tage-Budget (${total}) via Stripe abgerechnet. Deine Kampagne wird danach zur Freigabe eingereicht.`),
  };
}

export const getMarketingPpcCopy = getMarketingPpcEditorCopy;

export function targetOptionsForLocale(locale) {
  return getTargetOptions(locale);
}

export function shopGoalOptionsForLocale(locale) {
  return getShopGoalOptions(locale);
}

export function getAudienceOptions(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return [
    t("Summer shoppers", "Yaz alışverişçileri", "Acheteurs d'été", "Compradores de verano", "Acquirenti estivi", "Sommer-Käufer"),
    t("Winter fans", "Kış tutkunları", "Fans d'hiver", "Fans del invierno", "Fan dell'inverno", "Winter-Fans"),
    t("Spring shoppers", "Bahar alışverişçileri", "Acheteurs de printemps", "Compradores de primavera", "Acquirenti primaverili", "Frühlings-Shopper"),
    t("Autumn shoppers", "Sonbahar alışverişçileri", "Acheteurs d'automne", "Compradores de otoño", "Acquirenti autunnali", "Herbst-Käufer"),
    t("Bargain hunters", "Fırsat avcıları", "Chasseurs de bonnes affaires", "Cazadores de ofertas", "Cacciatori di occasioni", "Schnäppchenjäger"),
    t("Gift shoppers", "Hediye alışverişçileri", "Acheteurs de cadeaux", "Compradores de regalos", "Acquirenti regali", "Geschenk-Shopper"),
    t("Fitness enthusiasts", "Fitness tutkunları", "Passionnés de fitness", "Entusiastas del fitness", "Appassionati di fitness", "Fitness-Begeisterte"),
    t("Fashion fans", "Moda tutkunları", "Fans de mode", "Fans de moda", "Fan di moda", "Mode-Fans"),
    t("Parents & family", "Ebeveynler & aile", "Parents & famille", "Padres y familia", "Genitori & famiglia", "Eltern & Familie"),
    t("Beauty fans", "Güzellik tutkunları", "Fans beauté", "Fans de belleza", "Fan di bellezza", "Beauty-Fans"),
    t("Outdoor lovers", "Açık hava tutkunları", "Amateurs de plein air", "Amantes del aire libre", "Amanti dell'outdoor", "Outdoor-Liebhaber"),
    t("DIY enthusiasts", "Kendin yap tutkunları", "Bricoleurs", "Aficionados al bricolaje", "Appassionati di fai-da-te", "Heimwerker"),
    t("Tech enthusiasts", "Teknoloji tutkunları", "Passionnés de tech", "Entusiastas de la tecnología", "Appassionati di tech", "Tech-Enthusiasten"),
    t("Pet lovers", "Hayvan severler", "Amoureux des animaux", "Amantes de las mascotas", "Amanti degli animali", "Tierliebhaber"),
  ];
}

export function getAutomationsCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);

  return {
    pageTitle: t("Marketing automations", "Pazarlama otomasyonları", "Automatisations marketing", "Automatizaciones de marketing", "Automazioni marketing", "Marketing Automationen"),
    pageSubtitle: t("Reporting for the email flows you build under Content → Flows.", "Content → Akışlar altında oluşturduğunuz e-posta akışları için raporlama.", "Rapports pour les flux e-mail créés sous Contenu → Flux.", "Informes de los flujos de correo creados en Contenido → Flujos.", "Report per i flussi email creati in Contenuto → Flussi.", "Auswertung für die E-Mail-Flows, die du unter Content → Flows anlegst."),
    statActiveFlows: t("Active flows", "Aktif akışlar", "Flux actifs", "Flujos activos", "Flussi attivi", "Aktive Flows"),
    statTriggered: t("Emails sent (total)", "Gönderilen e-posta (toplam)", "E-mails envoyés (total)", "Correos enviados (total)", "Email inviate (totale)", "Gesendete E-Mails (gesamt)"),
    loadError: t("Could not load data.", "Veriler yüklenemedi.", "Impossible de charger les données.", "No se pudieron cargar los datos.", "Impossibile caricare i dati.", "Daten konnten nicht geladen werden."),
    activeFlowsTitle: t("Active flows", "Aktif akışlar", "Flux actifs", "Flujos activos", "Flussi attivi", "Aktive Flows"),
    manageInFlows: t("Manage in Content → Flows", "Content → Akışlar'da yönet", "Gérer dans Contenu → Flux", "Gestionar en Contenido → Flujos", "Gestisci in Contenuto → Flussi", "Verwalten unter Content → Flows"),
    noActiveFlows: t("No active flows yet — create and activate one under Content → Flows.", "Henüz aktif akış yok — Content → Akışlar altında bir tane oluşturup etkinleştirin.", "Aucun flux actif — créez-en un et activez-le sous Contenu → Flux.", "Aún no hay flujos activos — crea y activa uno en Contenido → Flujos.", "Nessun flusso attivo — creane uno e attivalo in Contenuto → Flussi.", "Noch keine aktiven Flows — leg einen unter Content → Flows an und aktiviere ihn."),
    colName: t("Name", "Ad", "Nom", "Nombre", "Nome", "Name"),
    colAudience: t("Recipients", "Alıcılar", "Destinataires", "Destinatarios", "Destinatari", "Empfänger"),
    colSent: t("Sent", "Gönderildi", "Envoyés", "Enviados", "Inviate", "Gesendet"),
    audienceCustomer: t("Customers", "Müşteriler", "Clients", "Clientes", "Clienti", "Kunden"),
    audienceSeller: t("Sellers", "Satıcılar", "Vendeurs", "Vendedores", "Venditori", "Verkäufer"),
    howItWorksTitle: t("How do flows work?", "Akışlar nasıl çalışır?", "Comment fonctionnent les flux ?", "¿Cómo funcionan los flujos?", "Come funzionano i flussi?", "Wie funktionieren Flows?"),
    howItWorksBody: t("Flows are created and edited under Content → Flows — this page only reports on the ones that are already Active. Emails are sent via the SMTP connection configured under Settings → Email.", "Akışlar Content → Akışlar altında oluşturulur ve düzenlenir — bu sayfa yalnızca zaten Aktif olanları raporlar. E-postalar Ayarlar → E-posta altında yapılandırılan SMTP bağlantısı üzerinden gönderilir.", "Les flux sont créés et modifiés sous Contenu → Flux — cette page ne fait que rendre compte de ceux déjà actifs. Les e-mails sont envoyés via la connexion SMTP configurée sous Paramètres → E-mail.", "Los flujos se crean y editan en Contenido → Flujos — esta página solo informa sobre los que ya están activos. Los correos se envían vía SMTP configurado en Configuración → Correo.", "I flussi vengono creati e modificati in Contenuto → Flussi — questa pagina riporta solo quelli già attivi. Le email vengono inviate via SMTP configurato in Impostazioni → Email.", "Flows werden unter Content → Flows angelegt und bearbeitet — diese Seite berichtet nur über die bereits aktiven. E-Mails werden über die unter Einstellungen → E-Mail konfigurierte SMTP-Verbindung versendet."),
    settingsEmail: t("Settings → Email", "Ayarlar → E-posta", "Paramètres → E-mail", "Configuración → Correo", "Impostazioni → Email", "Einstellungen → E-Mail"),
    flowActivityTitle: t("Email flow activity", "E-posta akışı aktivitesi", "Activité des flux e-mail", "Actividad de flujos de correo", "Attività flussi email", "E-Mail-Flow Aktivität"),
    flowActivitySuperuser: t("Log of flow steps (sent, skipped, failed) for the entire platform — including Content → Flows and optional queue.", "Tüm platform için akış adımları günlüğü (gönderildi, atlandı, başarısız) — İçerik → Akışlar ve isteğe bağlı kuyruk dahil.", "Journal des étapes de flux (envoyé, ignoré, échoué) pour toute la plateforme — y compris Contenu → Fluxs et file d'attente optionnelle.", "Registro de pasos de flujo (enviado, omitido, fallido) para toda la plataforma — incl. Contenido → Flujos y cola opcional.", "Registro passi flusso (inviato, saltato, fallito) per l'intera piattaforma — incl. Contenuto → Flussi e coda opzionale.", "Protokoll der Flow-Schritte (Versand, übersprungen, fehlgeschlagen) für die gesamte Plattform — inkl. Content → Flows und optionaler Warteschlange."),
    flowActivitySeller: t("Only entries for your orders (via order_id → seller_id). Flows without order reference (e.g. newsletter only) do not appear here.", "Yalnızca siparişlerinize ait kayıtlar (order_id → seller_id üzerinden). Sipariş bağlantısı olmayan akışlar (örn. yalnızca bülten) burada görünmez.", "Uniquement les entrées pour vos commandes (via order_id → seller_id). Les flux sans référence commande (ex. newsletter seul) n'apparaissent pas ici.", "Solo entradas de tus pedidos (vía order_id → seller_id). Flujos sin referencia de pedido (p. ej. solo newsletter) no aparecen aquí.", "Solo voci per i tuoi ordini (via order_id → seller_id). Flussi senza riferimento ordine (es. solo newsletter) non compaiono qui.", "Nur Einträge zu Ihren Bestellungen (über order_id → seller_id). Flows ohne Bestellbezug (z. B. reiner Newsletter) erscheinen hier nicht."),
    yourOrders: t("your orders", "siparişleriniz", "vos commandes", "tus pedidos", "i tuoi ordini", "Ihren Bestellungen"),
    allStatuses: t("All statuses", "Tüm durumlar", "Tous les statuts", "Todos los estados", "Tutti gli stati", "Alle Status"),
    refresh: t("Refresh", "Yenile", "Actualiser", "Actualizar", "Aggiorna", "Aktualisieren"),
    logLoadError: t("Could not load log.", "Günlük yüklenemedi.", "Impossible de charger le journal.", "No se pudo cargar el registro.", "Impossibile caricare il registro.", "Protokoll konnte nicht geladen werden."),
    dayOverview: (days) => t(`${days}-day overview`, `${days} günlük özet`, `Aperçu ${days} jours`, `Resumen ${days} días`, `Panoramica ${days} giorni`, `${days}-Tage‑Überblick`),
    executions: t("executions", "çalıştırma", "exécutions", "ejecuciones", "esecuzioni", "Ausführungen"),
    loading: t("Loading…", "Yükleniyor…", "Chargement…", "Cargando…", "Caricamento…", "Laden…"),
    noLogEntries: t("No entries yet or filter matches no rows.", "Henüz kayıt yok veya filtre eşleşmiyor.", "Pas encore d'entrées ou le filtre ne correspond à aucune ligne.", "Aún no hay entradas o el filtro no coincide.", "Nessuna voce ancora o il filtro non corrisponde.", "Noch keine Einträge oder Filter passt auf keine Zeilen."),
    colTime: t("Time", "Zaman", "Heure", "Hora", "Ora", "Zeit"),
    colStatus: t("Status", "Durum", "Statut", "Estado", "Stato", "Status"),
    colTrigger: t("Trigger", "Tetikleyici", "Déclencheur", "Disparador", "Trigger", "Trigger"),
    colFlow: t("Flow", "Akış", "Flux", "Flujo", "Flusso", "Flow"),
    colStep: t("Step", "Adım", "Étape", "Paso", "Passo", "Schritt"),
    colRecipient: t("Recipient", "Alıcı", "Destinataire", "Destinatario", "Destinatario", "Empfänger"),
    colAttempts: t("Attempts", "Denemeler", "Tentatives", "Intentos", "Tentativi", "Versuche"),
    errorPrefix: t("Error: ", "Hata: ", "Erreur : ", "Error: ", "Errore: ", "Fehler: "),
    entriesTotal: (total, from, to) => t(`${total.toLocaleString(dateLocaleFor(locale))} entries total · showing ${from}–${to}`, `${total.toLocaleString(dateLocaleFor(locale))} kayıt toplam · gösterilen ${from}–${to}`, `${total.toLocaleString(dateLocaleFor(locale))} entrées au total · affichage ${from}–${to}`, `${total.toLocaleString(dateLocaleFor(locale))} entradas en total · mostrando ${from}–${to}`, `${total.toLocaleString(dateLocaleFor(locale))} voci totali · visualizzazione ${from}–${to}`, `${total.toLocaleString(dateLocaleFor(locale))} Einträge gesamt · Anzeige ${from}–${to}`),
    prev: t("Previous", "Önceki", "Précédent", "Anterior", "Precedente", "Zurück"),
    next: t("Next", "Sonraki", "Suivant", "Siguiente", "Successivo", "Weiter"),
    dateLocale: dateLocaleFor(locale),
  };
}

export function getSellerApprovalStatus(locale, status) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const map = {
    registered: t("Registered", "Kayıt Oldu", "Inscrit", "Registrado", "Registrato", "Registriert"),
    documents_submitted: t("Documents submitted", "Evrak Gönderildi", "Documents soumis", "Documentos enviados", "Documenti inviati", "Dokumente eingereicht"),
    pending_approval: t("Pending approval", "Onay Bekliyor", "En attente d'approbation", "Pendiente de aprobación", "In attesa di approvazione", "Genehmigung ausstehend"),
    approved: t("Approved", "Onaylandı", "Approuvé", "Aprobado", "Approvato", "Genehmigt"),
    rejected: t("Rejected", "Reddedildi", "Rejeté", "Rechazado", "Rifiutato", "Abgelehnt"),
    suspended: t("Suspended", "Askıya Alındı", "Suspendu", "Suspendido", "Sospeso", "Gesperrt"),
  };
  return map[status] || status;
}

export function getImpersonationCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    backToSuperuser: t("Back to superuser mode", "Süper kullanıcı moduna dön", "Retour au mode superutilisateur", "Volver al modo superusuario", "Torna alla modalità superutente", "Zurück zum Superuser-Modus"),
    collapse: t("Collapse", "Daralt", "Réduire", "Contraer", "Comprimi", "Einklappen"),
    openAs: (name) => t(`Open as ${name}`, `${name} olarak aç`, `Ouvrir en tant que ${name}`, `Abrir como ${name}`, `Apri come ${name}`, `Als ${name} öffnen`),
    close: t("Close", "Kapat", "Fermer", "Cerrar", "Chiudi", "Schließen"),
    loggedInAsSeller: t("Logged in as seller", "Satıcı olarak giriş yapıldı", "Connecté en tant que vendeur", "Conectado como vendedor", "Accesso come venditore", "Eingeloggt als Seller"),
    profile: t("Profile", "Profil", "Profil", "Perfil", "Profilo", "Profil"),
    products: t("Products", "Ürünler", "Produits", "Productos", "Prodotti", "Produkte"),
    orders: t("Orders", "Siparişler", "Commandes", "Pedidos", "Ordini", "Bestellungen"),
    shopName: t("Shop name", "Mağaza adı", "Nom de boutique", "Nombre de tienda", "Nome negozio", "Shop-Name"),
    email: t("Email", "E-posta", "E-mail", "Correo", "Email", "E-Mail"),
    company: t("Company", "Firma", "Entreprise", "Empresa", "Azienda", "Firma"),
    joined: t("Joined", "Katıldı", "Inscrit le", "Registrado", "Iscritto", "Beigetreten"),
    revenue: t("Revenue", "Gelir", "Chiffre d'affaires", "Ingresos", "Fatturato", "Umsatz"),
    commission: t("Commission", "Komisyon", "Commission", "Comisión", "Commissione", "Provision"),
    shopSettings: t("Shop settings", "Mağaza ayarları", "Paramètres boutique", "Configuración de tienda", "Impostazioni negozio", "Shop-Einstellungen"),
    description: t("Description", "Açıklama", "Description", "Descripción", "Descrizione", "Beschreibung"),
    phone: t("Phone", "Telefon", "Téléphone", "Teléfono", "Telefono", "Telefon"),
    website: t("Website", "Web sitesi", "Site web", "Sitio web", "Sito web", "Website"),
    address: t("Address", "Adres", "Adresse", "Dirección", "Indirizzo", "Adresse"),
    noProducts: t("No products", "Ürün yok", "Aucun produit", "Sin productos", "Nessun prodotto", "Keine Produkte"),
    noOrders: t("No orders", "Sipariş yok", "Aucune commande", "Sin pedidos", "Nessun ordine", "Keine Bestellungen"),
    order: t("Order", "Sipariş", "Commande", "Pedido", "Ordine", "Bestellung"),
    customer: t("Customer", "Müşteri", "Client", "Cliente", "Cliente", "Kunde"),
    amount: t("Amount", "Tutar", "Montant", "Importe", "Importo", "Betrag"),
    date: t("Date", "Tarih", "Date", "Fecha", "Data", "Datum"),
    status: t("Status", "Durum", "Statut", "Estado", "Stato", "Status"),
    sellerMode: (name) => t(`Seller mode: ${name}`, `Satıcı modu: ${name}`, `Mode vendeur : ${name}`, `Modo vendedor: ${name}`, `Modalità venditore: ${name}`, `Seller-Modus: ${name}`),
  };
}

export function getSellerErrorsCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    issueDetail: t("Issue detail", "Sorun detayı", "Détail du problème", "Detalle del problema", "Dettaglio problema", "Problemdetail"),
    unknownSeller: t("Unknown seller", "Bilinmeyen satıcı", "Vendeur inconnu", "Vendedor desconocido", "Venditore sconosciuto", "Unbekannter Verkäufer"),
    all: t("All", "Tümü", "Tous", "Todos", "Tutti", "Alle"),
    open: t("Open", "Açık", "Ouvert", "Abierto", "Aperto", "Offen"),
    resolved: t("Resolved", "Çözüldü", "Résolu", "Resuelto", "Risolto", "Gelöst"),
    inProgress: t("In progress", "İşlemde", "En cours", "En progreso", "In corso", "In Bearbeitung"),
    errorPrefix: t("Error: ", "Hata: ", "Erreur : ", "Error: ", "Errore: ", "Fehler: "),
    unknown: t("Unknown", "Bilinmiyor", "Inconnu", "Desconocido", "Sconosciuto", "Unbekannt"),
    issueLog: t("Issue log", "Sorun günlüğü", "Journal des problèmes", "Registro de incidencias", "Registro problemi", "Problemtagebuch"),
    issueLogSubtitle: t("Log of issues reported by sellers", "Satıcıların bildirdiği sorunların kaydı", "Journal des problèmes signalés par les vendeurs", "Registro de problemas de vendedores", "Registro problemi segnalati dai venditori", "Protokoll der vom Verkäufer gemeldeten Probleme"),
    unread: (n) => t(`${n} unread`, `${n} okunmamış`, `${n} non lu(s)`, `${n} sin leer`, `${n} non letti`, `${n} ungelesen`),
    markAllRead: t("Mark all as read", "Tümünü okundu işaretle", "Tout marquer comme lu", "Marcar todo como leído", "Segna tutto come letto", "Alle als gelesen markieren"),
    addManual: t("+ Add manually", "+ Manuel ekle", "+ Ajouter manuellement", "+ Añadir manualmente", "+ Aggiungi manualmente", "+ Manuell hinzufügen"),
    filterBySeller: t("Filter by seller ID", "Satıcı ID ile filtrele", "Filtrer par ID vendeur", "Filtrar por ID de vendedor", "Filtra per ID venditore", "Nach Verkäufer-ID filtern"),
    records: (n) => t(`${n} records`, `${n} kayıt`, `${n} entrées`, `${n} registros`, `${n} record`, `${n} Einträge`),
    resolutionPlaceholder: t("How did you resolve the issue? Add your notes here…", "Sorunu nasıl çözdünüz? Notlarınızı buraya yazın…", "Comment avez-vous résolu le problème ? Notes ici…", "¿Cómo resolvió el problema? Notas aquí…", "Come hai risolto? Note qui…", "Wie wurde das Problem gelöst? Notizen hier…"),
  };
}
