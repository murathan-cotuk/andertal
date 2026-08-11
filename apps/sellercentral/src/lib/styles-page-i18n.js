import { lt } from "@/lib/locale-text";

export function getStylesPageCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);

  return {
    // ── Shared field labels ──────────────────────────────────────────────────
    text: t("Text", "Metin", "Texte", "Texto", "Testo", "Text"),
    linkHref: t("Link (href)", "Bağlantı (href)", "Lien (href)", "Enlace (href)", "Link (href)", "Link (href)"),
    stylePreset: t("Style preset", "Stil şablonu", "Modèle de style", "Plantilla de estilo", "Preset stile", "Stil-Vorlage"),
    bgColor: t("Background color", "Arka plan rengi", "Couleur d'arrière-plan", "Color de fondo", "Colore sfondo", "Hintergrundfarbe"),
    textColor: t("Text color", "Metin rengi", "Couleur du texte", "Color de texto", "Colore testo", "Textfarbe"),
    height: t("Height (height)", "Yükseklik (height)", "Hauteur (height)", "Altura (height)", "Altezza (height)", "Höhe (height)"),
    fontSize: t("Font size (font-size)", "Yazı boyutu (font-size)", "Taille police (font-size)", "Tamaño fuente (font-size)", "Dimensione font (font-size)", "Schriftgröße (font-size)"),
    fontWeight: t("Font weight (font-weight)", "Yazı kalınlığı (font-weight)", "Graisse (font-weight)", "Peso fuente (font-weight)", "Peso font (font-weight)", "Schriftgewicht (font-weight)"),
    shadow: t("Shadow (box-shadow)", "Gölge (box-shadow)", "Ombre (box-shadow)", "Sombra (box-shadow)", "Ombra (box-shadow)", "Schatten (box-shadow)"),
    imageUrl: t("Image URL", "Görsel URL", "URL image", "URL imagen", "URL immagine", "Bild-URL"),
    urlPlaceholder: t("https://... or /uploads/...", "https://... veya /uploads/...", "https://... ou /uploads/...", "https://... o /uploads/...", "https://... o /uploads/...", "https://... oder /uploads/..."),
    fromMediaLibrary: t("From media library", "Medya kütüphanesinden", "Depuis la médiathèque", "Desde medios", "Da media", "Aus Mediathek"),
    activeColor: t("Active color", "Aktif renk", "Couleur active", "Color activo", "Colore attivo", "Aktiv-Farbe"),
    desktop: t("Desktop", "Masaüstü", "Bureau", "Escritorio", "Desktop", "Desktop"),
    tablet: t("Tablet", "Tablet", "Tablette", "Tablet", "Tablet", "Tablet"),
    mobile: t("Mobile", "Mobil", "Mobile", "Móvil", "Mobile", "Mobil"),
    desktopGte1024: t("Desktop (≥1024px)", "Masaüstü (≥1024px)", "Bureau (≥1024px)", "Escritorio (≥1024px)", "Desktop (≥1024px)", "Desktop (≥1024px)"),
    tablet768: t("Tablet (768–1023px)", "Tablet (768–1023px)", "Tablette (768–1023px)", "Tablet (768–1023px)", "Tablet (768–1023px)", "Tablet (768–1023px)"),
    mobileLte767: t("Mobile (≤767px)", "Mobil (≤767px)", "Mobile (≤767px)", "Móvil (≤767px)", "Mobile (≤767px)", "Mobil (≤767px)"),
    desktopGte1024Short: t("Desktop ≥1024px", "Masaüstü ≥1024px", "Bureau ≥1024px", "Escritorio ≥1024px", "Desktop ≥1024px", "Desktop ≥1024px"),
    tablet768Short: t("Tablet 768–1023px", "Tablet 768–1023px", "Tablette 768–1023px", "Tablet 768–1023px", "Tablet 768–1023px", "Tablet 768–1023px"),
    mobileLte767Short: t("Mobile ≤767px", "Mobil ≤767px", "Mobile ≤767px", "Móvil ≤767px", "Mobile ≤767px", "Mobil ≤767px"),
    emptyNoChange: t("empty = no change", "boş = değişiklik yok", "vide = pas de changement", "vacío = sin cambio", "vuoto = nessuna modifica", "leer = keine Änderung"),
    moveUp: t("Move up", "Yukarı", "Monter", "Subir", "Sposta su", "Nach oben"),
    moveDown: t("Move down", "Aşağı", "Descendre", "Bajar", "Sposta giù", "Nach unten"),
    remove: t("Remove", "Kaldır", "Retirer", "Quitar", "Rimuovi", "Entfernen"),
    preview: t("Preview:", "Önizleme:", "Aperçu :", "Vista previa:", "Anteprima:", "Vorschau:"),
    borderBottom: t("Bottom border (border-bottom)", "Alt kenarlık (border-bottom)", "Bordure bas (border-bottom)", "Borde inferior (border-bottom)", "Bordo inferiore (border-bottom)", "Border unten (border-bottom)"),
    borderTop: t("Top border (border-top)", "Üst kenarlık (border-top)", "Bordure haut (border-top)", "Borde superior (border-top)", "Bordo superiore (border-top)", "Oberer Rand (border-top)"),
    border: t("Border", "Kenarlık", "Bordure", "Borde", "Bordo", "Rahmen"),

    // ── Top Bar ────────────────────────────────────────────────────────────
    topBarShowInShop: t("Show top bar in shop", "Mağazada üst çubuğu göster", "Afficher la barre supérieure dans la boutique", "Mostrar barra superior en la tienda", "Mostra barra superiore nel negozio", "Top Bar im Shop anzeigen"),
    entriesDisplay: t("Entry display", "Giriş gösterimi", "Affichage des entrées", "Visualización de entradas", "Visualizzazione voci", "Einträge-Anzeige"),
    carouselInterval: t("Carousel: switch every (seconds)", "Karusel: her (saniye) değiştir", "Carrousel : changement toutes les (secondes)", "Carrusel: cambio cada (segundos)", "Carosello: cambio ogni (secondi)", "Karussell: Wechsel alle (Sekunden)"),
    carouselIntervalHelp: t(
      "Carousel only. Also: swipe left/right and arrow keys.",
      "Yalnızca karusel. Ayrıca: sola/sağa kaydırma ve ok tuşları.",
      "Carrousel uniquement. Aussi : balayage gauche/droite et touches fléchées.",
      "Solo carrusel. También: deslizar izquierda/derecha y teclas de flecha.",
      "Solo carosello. Anche: scorrimento sinistra/destra e tasti freccia.",
      "Nur bei Karussell. Zusätzlich: Wischen links/rechts und Pfeiltasten."
    ),
    carouselBanner: t(
      "Carousel: one visible entry, automatic rotation at this interval, pause on mouse hover, manual via arrows or swipe (touch). Side by side: all links in one row (wrapping on narrow screens).",
      "Karusel: tek görünür giriş, bu aralıkta otomatik geçiş, fare üzerindeyken duraklama, oklar veya kaydırma ile manuel. Yan yana: tüm bağlantılar tek satırda (dar ekranlarda sarılır).",
      "Carrousel : une entrée visible, rotation automatique à cet intervalle, pause au survol, manuel via flèches ou balayage. Côte à côte : tous les liens sur une ligne.",
      "Carrusel: una entrada visible, rotación automática en este intervalo, pausa al pasar el ratón, manual con flechas o deslizar. En fila: todos los enlaces en una línea.",
      "Carosello: una voce visibile, rotazione automatica a questo intervallo, pausa al passaggio del mouse, manuale con frecce o swipe. Affiancati: tutti i link su una riga.",
      "Karussell: ein sichtbarer Eintrag, automatischer Wechsel in diesem Intervall, Pause bei Maus über der Leiste, manuell per Pfeilen oder Wisch-Geste (Touch). Nebeneinander: alle Links in einer Zeile (umbrechend auf schmalen Screens)."
    ),
    topBarEntries: t("Top bar entries", "Üst çubuk girişleri", "Entrées barre supérieure", "Entradas barra superior", "Voci barra superiore", "Top-Bar-Einträge"),
    topBarTextPh: t("e.g. Free shipping from €50", "ör. 50 € üzeri ücretsiz kargo", "ex. Livraison gratuite dès 50 €", "p. ej. Envío gratis desde 50 €", "es. Spedizione gratuita da 50 €", "z.B. Kostenloser Versand ab 50 €"),
    topBarHrefPh: t("e.g. /shipping", "ör. /shipping", "ex. /shipping", "p. ej. /shipping", "es. /shipping", "z.B. /shipping"),
    addEntry: t("+ Add entry", "+ Giriş ekle", "+ Ajouter une entrée", "+ Añadir entrada", "+ Aggiungi voce", "+ Eintrag hinzufügen"),

    topbarDisplayModeOptions: [
      { label: t("All side by side", "Hepsi yan yana", "Tous côte à côte", "Todos en fila", "Tutti affiancati", "Alle nebeneinander"), value: "inline" },
      { label: t("Carousel (one entry at a time, auto + manual)", "Karusel (tek giriş, otomatik + manuel)", "Carrousel (une entrée, auto + manuel)", "Carrusel (una entrada, auto + manual)", "Carosello (una voce, auto + manuale)", "Karussell (ein Eintrag, auto + manuell)"), value: "carousel" },
    ],

    topbarPresetOptions: [
      { value: "default", label: t("Standard", "Standart", "Standard", "Estándar", "Standard", "Standard") },
      { value: "minimal", label: t("Narrow / minimal", "Dar / minimal", "Étroit / minimal", "Estrecho / minimal", "Stretto / minimale", "Schmal / minimal") },
      { value: "elevated", label: t("With shadow", "Gölgeli", "Avec ombre", "Con sombra", "Con ombra", "Mit Schatten") },
      { value: "accent_line", label: t("Accent line bottom", "Alt vurgu çizgisi", "Ligne d'accent en bas", "Línea de acento inferior", "Linea accento in basso", "Akzent-Linie unten") },
    ],

  effectiveInShop: t(
    "Effective in shop",
    "Mağazada uygulanan",
    "Effectif dans la boutique",
    "Efectivo en la tienda",
    "Effettivo nel negozio",
    "Im Shop wirksam"
  ),
  applyUnifiedNavbarPreset: t(
    "Apply unified navbar preset",
    "Birleşik navbar şablonunu uygula",
    "Appliquer le preset navbar unifié",
    "Aplicar preset navbar unificado",
    "Applica preset navbar unificato",
    "Einheitliches Navbar-Preset anwenden"
  ),
  unifiedNavbarPresetHelp: t(
    "Transparent gradient header (navbar + second nav seamless at top), second nav #f9fafb when scrolling up, frosted white header on scroll down.",
    "Şeffaf gradyan header (en üstte navbar + second nav tek parça), yukarı kaydırınca second nav #f9fafb, aşağı kaydırınca buzlu beyaz header.",
    "En-tête dégradé transparent (navbar + second nav unifiés en haut), second nav #f9fafb au scroll vers le haut, header blanc givré en scroll bas.",
    "Cabecera degradado transparente (navbar + second nav unidos arriba), second nav #f9fafb al subir, header blanco escarchado al bajar.",
    "Header gradiente trasparente (navbar + second nav uniti in alto), second nav #f9fafb scroll su, header bianco satinato scroll giù.",
    "Transparenter Verlauf-Header (Navbar + Second Nav oben nahtlos), Second Nav #f9fafb beim Hochscrollen, milchiger Header beim Runterscrollen."
  ),
  stylesLoadHint: t(
    "Fields left empty inherit defaults or style presets. Use “Effective in shop” hints below each field. If your customization was lost after a backend outage, apply the unified navbar preset and save.",
    "Boş alanlar varsayılanları veya stil şablonlarını kullanır. Her alanın altındaki “Mağazada uygulanan” ipuçlarına bakın. Backend kesintisinden sonra özelleştirmeler kaybolduysa birleşik navbar şablonunu uygulayıp kaydedin.",
    "Les champs vides héritent des défauts ou presets. Voir « Effectif dans la boutique » sous chaque champ. Si une panne backend a effacé vos réglages, appliquez le preset navbar unifié puis enregistrez.",
    "Los campos vacíos heredan valores por defecto o presets. Vea « Efectivo en la tienda » bajo cada campo. Si un fallo del backend borró su configuración, aplique el preset navbar unificado y guarde.",
    "I campi vuoti ereditano default o preset. Vedi « Effettivo nel negozio » sotto ogni campo. Se un'interruzione backend ha cancellato le impostazioni, applica il preset navbar unificato e salva.",
    "Leere Felder übernehmen Defaults oder Stil-Vorlagen. Hinweise « Im Shop wirksam » unter jedem Feld. Nach Backend-Ausfall: Einheitliches Navbar-Preset anwenden und speichern."
  ),

    // ── Header ───────────────────────────────────────────────────────────────
    headerBgColorGradientStart: t(
      "Background color (base / gradient start)",
      "Arka plan rengi (temel / gradyan başlangıcı)",
      "Couleur d'arrière-plan (base / début dégradé)",
      "Color de fondo (base / inicio degradado)",
      "Colore sfondo (base / inizio gradiente)",
      "Hintergrundfarbe (Basis / Verlauf Start)"
    ),
    gradientBgHeading: t("Gradient (background)", "Gradyan (arka plan)", "Dégradé (arrière-plan)", "Degradado (fondo)", "Gradiente (sfondo)", "Verlauf (Hintergrund)"),
    gradientBgDesc: t(
      "— enable or disable per viewport. Target color, angle and intensity apply to all viewports where gradient is on.",
      "— görünüme göre aç/kapat. Hedef renk, açı ve yoğunluk gradyan açık olan tüm görünümler için geçerlidir.",
      "— activer ou désactiver par vue. Couleur cible, angle et intensité pour toutes les vues avec dégradé.",
      "— activar o desactivar por vista. Color destino, ángulo e intensidad para todas las vistas con degradado.",
      "— attiva o disattiva per viewport. Colore target, angolo e intensità per tutte le viewport con gradiente.",
      "— pro Ansicht einzeln ein- oder ausschalten. Ziel-Farbe, Winkel und Stärke gelten für alle Ansichten, in denen der Verlauf eingeschaltet ist."
    ),
    gradientFallback: t(
      "Default gradient (fallback when no device-specific toggle is set)",
      "Varsayılan gradyan (cihaza özel anahtar yoksa)",
      "Dégradé par défaut (repli si aucun interrupteur par appareil)",
      "Degradado predeterminado (respaldo sin interruptor por dispositivo)",
      "Gradiente predefinito (fallback senza toggle per dispositivo)",
      "Standard-Verlauf (Fallback, wenn kein gerätespezifischer Schalter gesetzt ist)"
    ),
    gradientTargetColor: t("Gradient target color", "Gradyan hedef rengi", "Couleur cible du dégradé", "Color destino del degradado", "Colore target gradiente", "Verlauf Ziel-Farbe"),
    gradientDirection: t("Gradient direction (angle)", "Gradyan yönü (açı)", "Direction du dégradé (angle)", "Dirección del degradado (ángulo)", "Direzione gradiente (angolo)", "Verlauf-Richtung (Winkel)"),
    gradientDirectionShort: t("Gradient direction", "Gradyan yönü", "Direction du dégradé", "Dirección del degradado", "Direzione gradiente", "Verlauf-Richtung"),
    gradientIntensity: t("Gradient intensity (0–100)", "Gradyan yoğunluğu (0–100)", "Intensité du dégradé (0–100)", "Intensidad del degradado (0–100)", "Intensità gradiente (0–100)", "Verlauf-Stärke (0–100)"),
    gradientIntensityHelp: t(
      "0 = soft (almost base color only), 100 = full blend to target color",
      "0 = yumuşak (neredeyse sadece temel renk), 100 = hedef renge tam karışım",
      "0 = doux (presque couleur de base), 100 = mélange complet vers la cible",
      "0 = suave (casi solo color base), 100 = mezcla completa al destino",
      "0 = morbido (quasi solo colore base), 100 = miscela completa al target",
      "0 = sanft (fast nur Basisfarbe), 100 = volle Mischung zur Ziel-Farbe"
    ),
    headerGradientAngleOptions: [
      { label: t("Diagonal ↘ (135°)", "Çapraz ↘ (135°)", "Diagonal ↘ (135°)", "Diagonal ↘ (135°)", "Diagonale ↘ (135°)", "Diagonal ↘ (135°)"), value: "135" },
      { label: t("Downward (180°)", "Aşağı (180°)", "Vers le bas (180°)", "Hacia abajo (180°)", "Verso il basso (180°)", "Nach unten (180°)"), value: "180" },
      { label: t("Rightward (90°)", "Sağa (90°)", "Vers la droite (90°)", "Hacia la derecha (90°)", "Verso destra (90°)", "Nach rechts (90°)"), value: "90" },
      { label: t("Upward (0°)", "Yukarı (0°)", "Vers le haut (0°)", "Hacia arriba (0°)", "Verso l'alto (0°)", "Nach oben (0°)"), value: "0" },
      { label: t("Leftward (270°)", "Sola (270°)", "Vers la gauche (270°)", "Hacia la izquierda (270°)", "Verso sinistra (270°)", "Nach links (270°)"), value: "270" },
      { label: t("Diagonal ↗ (45°)", "Çapraz ↗ (45°)", "Diagonal ↗ (45°)", "Diagonal ↗ (45°)", "Diagonale ↗ (45°)", "Diagonal ↗ (45°)"), value: "45" },
    ],
    bgImageOptional: t(
      "Background image (optional, under color/gradient)",
      "Arka plan görseli (isteğe bağlı, renk/gradyan altında)",
      "Image d'arrière-plan (optionnel, sous couleur/dégradé)",
      "Imagen de fondo (opcional, bajo color/degradado)",
      "Immagine sfondo (opzionale, sotto colore/gradiente)",
      "Hintergrundbild (optional, unter Farbe/Verlauf)"
    ),
    normalHeight: t("Normal height", "Normal yükseklik", "Hauteur normale", "Altura normal", "Altezza normale", "Normalhöhe"),
    normalHeightHelp: t(
      "Empty = next larger device as fallback (Desktop → Tablet → Mobile → 72px).",
      "Boş = bir üst cihaz yedek olarak (Masaüstü → Tablet → Mobil → 72px).",
      "Vide = appareil plus grand en repli (Bureau → Tablette → Mobile → 72px).",
      "Vacío = dispositivo mayor como respaldo (Escritorio → Tablet → Móvil → 72px).",
      "Vuoto = dispositivo più grande come fallback (Desktop → Tablet → Mobile → 72px).",
      "Leer = nächstgrößeres Gerät als Fallback (Desktop → Tablet → Mobil → 72px)."
    ),
    compactHeight: t("Compact height (on scroll)", "Kompakt yükseklik (kaydırınca)", "Hauteur compacte (au scroll)", "Altura compacta (al desplazar)", "Altezza compatta (allo scroll)", "Compact-Höhe (beim Scrollen)"),
    compactHeightHelp: t(
      "Height after scrolling. Empty = no change (header stays same size). Cascades: tablet inherits desktop if empty, mobile inherits tablet if empty.",
      "Kaydırma sonrası yükseklik. Boş = değişiklik yok. Tablet boşsa masaüstünden, mobil boşsa tabletten alır.",
      "Hauteur après défilement. Vide = pas de changement. Tablette hérite du bureau si vide, mobile de la tablette.",
      "Altura tras desplazar. Vacío = sin cambio. Tablet hereda de escritorio si vacío, móvil de tablet.",
      "Altezza dopo lo scroll. Vuoto = nessuna modifica. Tablet eredita da desktop se vuoto, mobile da tablet.",
      "Höhe nach dem Scrollen. Leer = keine Änderung (Header bleibt gleich groß). Kaskadiert: Tablet übernimmt Desktop-Wert wenn leer, Mobil übernimmt Tablet wenn leer."
    ),
    headerBottomBorder: t("Bottom edge (border-bottom)", "Alt kenar (border-bottom)", "Bord inférieur (border-bottom)", "Borde inferior (border-bottom)", "Bordo inferiore (border-bottom)", "Unterer Rand (border-bottom)"),
    pageSpecificBg: t("Page-specific background (optional)", "Sayfaya özel arka plan (isteğe bağlı)", "Arrière-plan spécifique à la page (optionnel)", "Fondo específico de página (opcional)", "Sfondo specifico pagina (opzionale)", "Seitenspezifischer Hintergrund (Optional)"),
    pageSpecificBgHelp: t(
      "For category or collection pages, the background can be set differently here. Empty fields use the default above. Height, shadow and border are always global.",
      "Kategori veya koleksiyon sayfaları için arka plan burada farklı ayarlanabilir. Boş alanlar yukarıdaki varsayılanı kullanır. Yükseklik, gölge ve kenarlık her zaman globaldir.",
      "Pour les pages catégorie ou collection, l'arrière-plan peut être défini ici. Les champs vides reprennent le défaut ci-dessus.",
      "Para páginas de categoría o colección, el fondo se puede configurar aquí. Los campos vacíos usan el predeterminado de arriba.",
      "Per pagine categoria o collezione, lo sfondo può essere impostato qui. I campi vuoti usano il default sopra.",
      "Für Kategorie- oder Kollektion-Seiten kann der Hintergrund hier abweichend gesetzt werden. Leere Felder übernehmen den Standard oben. Höhe, Schatten und Rahmen sind immer global."
    ),
    customizePage: t("Customize page", "Sayfayı özelleştir", "Personnaliser la page", "Personalizar página", "Personalizza pagina", "Seite anpassen"),
    categoryPages: t("Category pages (/category/…)", "Kategori sayfaları (/category/…)", "Pages catégorie (/category/…)", "Páginas categoría (/category/…)", "Pagine categoria (/category/…)", "Kategorie-Seiten (/category/…)"),
    collectionPages: t("Collection pages (/collections/…)", "Koleksiyon sayfaları (/collections/…)", "Pages collection (/collections/…)", "Páginas colección (/collections/…)", "Pagine collezione (/collections/…)", "Kollektion-Seiten (/collections/…)"),
    emptyDefaultBg: t("Empty = default background color", "Boş = varsayılan arka plan rengi", "Vide = couleur d'arrière-plan par défaut", "Vacío = color de fondo predeterminado", "Vuoto = colore sfondo predefinito", "Leer = Standard-Hintergrundfarbe"),
    gradientForPages: t("Gradient for these pages:", "Bu sayfalar için gradyan:", "Dégradé pour ces pages :", "Degradado para estas páginas:", "Gradiente per queste pagine:", "Verlauf für diese Seiten:"),
    gradientFallbackShort: t("Default gradient (fallback)", "Varsayılan gradyan (yedek)", "Dégradé par défaut (repli)", "Degradado predeterminado (respaldo)", "Gradiente predefinito (fallback)", "Standard-Verlauf (Fallback)"),
    emptyDefaultTarget: t("Empty = default target color", "Boş = varsayılan hedef renk", "Vide = couleur cible par défaut", "Vacío = color destino predeterminado", "Vuoto = colore target predefinito", "Leer = Standard-Zielfarbe"),
    bgImage: t("Background image", "Arka plan görseli", "Image d'arrière-plan", "Imagen de fondo", "Immagine sfondo", "Hintergrundbild"),
    emptyDefaultText: t("Empty = default text color", "Boş = varsayılan metin rengi", "Vide = couleur de texte par défaut", "Vacío = color de texto predeterminado", "Vuoto = colore testo predefinito", "Leer = Standard-Textfarbe"),

    headerPresetOptions: [
      { value: "default", label: t("Standard", "Standart", "Standard", "Estándar", "Standard", "Standard") },
      { value: "flat", label: t("Flat (no shadow)", "Düz (gölgesiz)", "Plat (sans ombre)", "Plano (sin sombra)", "Piatto (senza ombra)", "Flach (ohne Schatten)") },
      { value: "floating", label: t("Slightly floating", "Hafif yüzen", "Légèrement flottant", "Ligeramente flotante", "Leggermente fluttuante", "Leicht schwebend") },
      { value: "underline", label: t("Underline only", "Yalnızca alt çizgi", "Soulignement uniquement", "Solo subrayado", "Solo sottolineatura", "Nur Unterstrich") },
    ],

    // ── Second Nav ─────────────────────────────────────────────────────────
    secondNavRow: t("Second-nav row", "Second-nav satırı", "Ligne second-nav", "Fila second-nav", "Riga second-nav", "Second-Nav-Zeile"),
    rectangle: t("rectangle", "dikdörtgen", "rectangle", "rectángulo", "rettangolo", "Rechteck"),
    secondNavBanner1: t(
      "Shared header chrome (color/gradient) is controlled under",
      "Ortak üst çubuk görünümü (renk/gradyan) şuradan ayarlanır:",
      "Le chrome d'en-tête partagé (couleur/dégradé) se configure sous",
      "El chrome de cabecera compartido (color/degradado) se controla en",
      "Il chrome header condiviso (colore/gradiente) si configura in",
      "Der gemeinsame Header-Chrome (Farbe/Verlauf) steuern Sie unter"
    ),
    secondNavBanner2: t(
      "The second-nav row below can additionally get its own background, border, text and active color",
      "Altındaki second-nav satırı ek olarak kendi arka plan, kenarlık, metin ve aktif rengini alabilir",
      "La ligne second-nav en dessous peut avoir son propre arrière-plan, bordure, texte et couleur active",
      "La fila second-nav debajo puede tener su propio fondo, borde, texto y color activo",
      "La riga second-nav sotto può avere sfondo, bordo, testo e colore attivo propri",
      "Die Second-Nav-Zeile darunter kann zusätzlich einen eigenen Hintergrund, Rahmen sowie Text- und Aktivfarbe"
    ),
    secondNavBanner3: t("per device", "cihaza göre", "par appareil", "por dispositivo", "per dispositivo", "je nach Gerät"),
    secondNavBanner4: t("— see next section. Whether links appear as classic text or frosted-glass tiles is set", "— sonraki bölüme bakın. Bağlantıların klasik metin mi yoksa buzlu cam karo mu görüneceği", "— voir section suivante. L'affichage des liens en texte classique ou tuiles verre dépoli se configure", "— ver sección siguiente. Si los enlaces son texto clásico o mosaicos de cristal esmerilado se configura", "— vedi sezione successiva. Se i link sono testo classico o tile vetro smerigliato si imposta", "— siehe nächster Abschnitt. Ob Links als klassischer Text oder als Frostglas-Kachel erscheinen, legen Sie darunter"),
    secondNavRowBgBorder: t("Second-nav row: background & border per device", "Second-nav satırı: cihaza göre arka plan ve kenarlık", "Ligne second-nav : arrière-plan et bordure par appareil", "Fila second-nav: fondo y borde por dispositivo", "Riga second-nav: sfondo e bordo per dispositivo", "Second-Nav-Zeile: Hintergrund & Rahmen je Gerät"),
    secondNavBreakpoints: t(
      "Shop breakpoints: mobile up to 767 px, tablet 768–1023 px, desktop from 1024 px. Per device you can set background and border or leave empty (transparent / no border) unless a fallback below applies. Free CSS values are allowed (e.g.",
      "Mağaza breakpoint'leri: mobil 767 px'e kadar, tablet 768–1023 px, masaüstü 1024 px'den. Cihaza göre arka plan ve kenarlık ayarlayın veya boş bırakın. Serbest CSS değerleri mümkün (ör.",
      "Breakpoints boutique : mobile jusqu'à 767 px, tablette 768–1023 px, bureau à partir de 1024 px. Par appareil, définissez arrière-plan et bordure ou laissez vide. Valeurs CSS libres possibles (ex.",
      "Breakpoints tienda: móvil hasta 767 px, tablet 768–1023 px, escritorio desde 1024 px. Por dispositivo, configure fondo y borde o deje vacío. Valores CSS libres permitidos (p. ej.",
      "Breakpoint negozio: mobile fino a 767 px, tablet 768–1023 px, desktop da 1024 px. Per dispositivo imposta sfondo e bordo o lascia vuoto. Valori CSS liberi ammessi (es.",
      "Shop-Breakpoints: Mobil bis 767 px, Tablet 768–1023 px, Desktop ab 1024 px. Pro Gerät können Sie Hintergrund und Rahmen setzen oder leer lassen (transparent bzw. kein Rahmen), sofern unten kein Fallback greift. Freie CSS-Werte sind möglich (z. B."
    ),
    desktopBgCss: t("Desktop: background (CSS)", "Masaüstü: arka plan (CSS)", "Bureau : arrière-plan (CSS)", "Escritorio: fondo (CSS)", "Desktop: sfondo (CSS)", "Desktop: Hintergrund (CSS)"),
    desktopBorderCss: t("Desktop: border (CSS border)", "Masaüstü: kenarlık (CSS border)", "Bureau : bordure (CSS border)", "Escritorio: borde (CSS border)", "Desktop: bordo (CSS border)", "Desktop: Rahmen (CSS border)"),
    desktopTextColor: t("Desktop: text color", "Masaüstü: metin rengi", "Bureau : couleur texte", "Escritorio: color texto", "Desktop: colore testo", "Desktop: Textfarbe"),
    desktopActiveColor: t("Desktop: active color", "Masaüstü: aktif renk", "Bureau : couleur active", "Escritorio: color activo", "Desktop: colore attivo", "Desktop: Aktiv-Farbe"),
    tabletBgCss: t("Tablet: background (CSS)", "Tablet: arka plan (CSS)", "Tablette : arrière-plan (CSS)", "Tablet: fondo (CSS)", "Tablet: sfondo (CSS)", "Tablet: Hintergrund (CSS)"),
    tabletBorderCss: t("Tablet: border (CSS border)", "Tablet: kenarlık (CSS border)", "Tablette : bordure (CSS border)", "Tablet: borde (CSS border)", "Tablet: bordo (CSS border)", "Tablet: Rahmen (CSS border)"),
    tabletTextColor: t("Tablet: text color", "Tablet: metin rengi", "Tablette : couleur texte", "Tablet: color texto", "Tablet: colore testo", "Tablet: Textfarbe"),
    tabletActiveColor: t("Tablet: active color", "Tablet: aktif renk", "Tablette : couleur active", "Tablet: color activo", "Tablet: colore attivo", "Tablet: Aktiv-Farbe"),
    mobileBgCss: t("Mobile: background (CSS)", "Mobil: arka plan (CSS)", "Mobile : arrière-plan (CSS)", "Móvil: fondo (CSS)", "Mobile: sfondo (CSS)", "Mobil: Hintergrund (CSS)"),
    mobileBorderCss: t("Mobile: border (CSS border)", "Mobil: kenarlık (CSS border)", "Mobile : bordure (CSS border)", "Móvil: borde (CSS border)", "Mobile: bordo (CSS border)", "Mobil: Rahmen (CSS border)"),
    mobileTextColor: t("Mobile: text color", "Mobil: metin rengi", "Mobile : couleur texte", "Móvil: color texto", "Mobile: colore testo", "Mobil: Textfarbe"),
    mobileActiveColor: t("Mobile: active color", "Mobil: aktif renk", "Mobile : couleur active", "Móvil: color activo", "Mobile: colore attivo", "Mobil: Aktiv-Farbe"),
    emptyFallbackBg: t("empty = fallback bg_color or transparent", "boş = yedek bg_color veya şeffaf", "vide = repli bg_color ou transparent", "vacío = respaldo bg_color o transparente", "vuoto = fallback bg_color o trasparente", "leer = Fallback bg_color oder transparent"),
    emptyFallbackBorder: t("empty = fallback border", "boş = yedek border", "vide = repli border", "vacío = respaldo border", "vuoto = fallback border", "leer = Fallback border"),
    emptyGlobalTextBelow: t("Empty = global text color below", "Boş = alttaki global metin rengi", "Vide = couleur texte globale ci-dessous", "Vacío = color texto global abajo", "Vuoto = colore testo globale sotto", "Leer = globale Textfarbe darunter"),
    emptyGlobalActive: t("Empty = global active color", "Boş = global aktif renk", "Vide = couleur active globale", "Vacío = color activo global", "Vuoto = colore attivo globale", "Leer = globale Aktiv-Farbe"),
    emptyGlobalText: t("Empty = global text color", "Boş = global metin rengi", "Vide = couleur texte globale", "Vacío = color texto global", "Vuoto = colore testo globale", "Leer = globale Textfarbe"),
    bgExample: t("e.g. transparent, #f9fafb, rgba(255,255,255,0.85)", "ör. transparent, #f9fafb, rgba(255,255,255,0.85)", "ex. transparent, #f9fafb, rgba(255,255,255,0.85)", "p. ej. transparent, #f9fafb, rgba(255,255,255,0.85)", "es. transparent, #f9fafb, rgba(255,255,255,0.85)", "z. B. transparent, #f9fafb, rgba(255,255,255,0.85)"),
    borderExample: t("e.g. none, 1px solid rgba(0,0,0,0.06)", "ör. none, 1px solid rgba(0,0,0,0.06)", "ex. none, 1px solid rgba(0,0,0,0.06)", "p. ej. none, 1px solid rgba(0,0,0,0.06)", "es. none, 1px solid rgba(0,0,0,0.06)", "z. B. none, 1px solid rgba(0,0,0,0.06)"),
    fallbackAllDevices: t(
      "Fallback for all devices when a device-specific field stays empty:",
      "Cihaza özel alan boş kalırsa tüm cihazlar için yedek:",
      "Repli pour tous les appareils si un champ spécifique reste vide :",
      "Respaldo para todos los dispositivos si un campo específico queda vacío:",
      "Fallback per tutti i dispositivi se un campo specifico resta vuoto:",
      "Fallback für alle Geräte, wenn ein gerätespezifisches Feld leer bleibt (nicht ausgefüllt):"
    ),
    bgFallback: t("Background fallback (bg_color)", "Arka plan yedeği (bg_color)", "Repli arrière-plan (bg_color)", "Respaldo fondo (bg_color)", "Fallback sfondo (bg_color)", "Hintergrund-Fallback (bg_color)"),
    bgFallbackHelp: t(
      "Style presets often set this; empty = fully transparent when no per-device bg_* is set.",
      "Stil şablonları bunu sık ayarlar; boş = cihaza özel bg_* yoksa tamamen şeffaf.",
      "Les modèles de style le définissent souvent ; vide = transparent si aucun bg_* par appareil.",
      "Las plantillas de estilo suelen configurarlo; vacío = transparente sin bg_* por dispositivo.",
      "I preset stile lo impostano spesso; vuoto = trasparente senza bg_* per dispositivo.",
      "Stil-Vorlagen setzen das oft; leer = durchgehend transparent wenn keine bg_* pro Gerät gesetzt sind."
    ),
    borderFallback: t("Border fallback (border)", "Kenarlık yedeği (border)", "Repli bordure (border)", "Respaldo borde (border)", "Fallback bordo (border)", "Rahmen-Fallback (border)"),
    borderFallbackDefault: t("Default: none", "Varsayılan: none", "Par défaut : none", "Predeterminado: none", "Predefinito: none", "Standard: none"),
    linkStylePerDevice: t("Link appearance per device", "Cihaza göre bağlantı görünümü", "Apparence des liens par appareil", "Apariencia de enlaces por dispositivo", "Aspetto link per dispositivo", "Link-Darstellung nach Gerät"),
    linkStylePerDeviceHelp: t(
      "Under \"Menu tiles\" you only control the pill/tile look (visible when \"Tile / frosted glass\" is selected here). On a landing page, \"Second navigation classic on desktop\" can still override the desktop setting here and force classic.",
      "\"Menü karoları\" altında yalnızca pill/karo görünümünü kontrol edersiniz (burada \"Karo / buzlu cam\" seçiliyse görünür). Landing page'de \"Masaüstünde second navigation klasik\" masaüstü ayarını geçersiz kılabilir.",
      "Sous « Tuiles menu » vous contrôlez uniquement l'apparence pill/tuile. Sur une landing page, « Navigation secondaire classique sur bureau » peut forcer le classique.",
      "Bajo \"Mosaicos de menú\" solo controlas el aspecto pill/mosaico. En una landing page, \"Navegación secondaria clásica en escritorio\" puede forzar clásico.",
      "Sotto \"Tile menu\" controlli solo l'aspetto pill/tile. Su una landing page, \"Second navigation classica su desktop\" può forzare il classico.",
      'Unter „Menü-Kacheln" steuern Sie nur die Pill-/Kachel-Optik (sichtbar, wenn hier „Kachel / Frostglas" gewählt ist). In einer Landing-Page kann die Option „Second-Navigation auf Desktop klassisch" die Desktop-Einstellung hier noch überschreiben und immer klassisch erzwingen.'
    ),
    secondNavPresetOptions: [
      { value: "default", label: t("Standard", "Standart", "Standard", "Estándar", "Standard", "Standard") },
      { value: "compact", label: t("Compact", "Kompakt", "Compact", "Compacto", "Compatto", "Kompakt") },
      { value: "pill_bar", label: t("Pill background", "Pill arka plan", "Fond pill", "Fondo pill", "Sfondo pill", "Pill-Hintergrund") },
      { value: "contrast", label: t("Contrast bar", "Kontrast çubuk", "Barre contraste", "Barra contraste", "Barra contrasto", "Kontrast-Leiste") },
    ],
    secondNavLinkStyleOptions: [
      { value: "classic", label: t("Classic (text links, hover underline)", "Klasik (metin bağlantılar, hover alt çizgi)", "Classique (liens texte, soulignement au survol)", "Clásico (enlaces texto, subrayado al pasar)", "Classico (link testo, sottolineatura hover)", "Klassisch (Textlinks, Hover-Unterstrich)") },
      { value: "pill", label: t("Tile / frosted glass (pills)", "Karo / buzlu cam (pills)", "Tuile / verre dépoli (pills)", "Mosaico / cristal esmerilado (pills)", "Tile / vetro smerigliato (pills)", "Kachel / Frostglas (Pills)") },
    ],
    secondNavAtTopDesktop: t("Second nav at page top (desktop ≥1024px)", "Sayfa en üstünde second nav (desktop ≥1024px)", "Second nav en haut de page (desktop ≥1024px)", "Second nav arriba del todo (desktop ≥1024px)", "Second nav in cima pagina (desktop ≥1024px)", "Second Nav oben auf der Seite (Desktop ≥1024px)"),
    secondNavAtTopDesktopHelp: t(
      "When the header uses a gradient or landing-page tint, the second nav can merge into one surface at the top. Choose \"Always own background\" to keep the second-nav row color visible on desktop.",
      "Header gradyan veya landing rengi kullanıyorsa second nav en üstte tek yüzey gibi birleşebilir. Desktop'ta second nav satır renginin her zaman görünmesi için \"Her zaman kendi arka planı\"nı seçin.",
      "Avec un dégradé d'en-tête ou une teinte landing, la second nav peut fusionner en haut. Choisissez « Toujours son propre fond » pour garder la couleur de la ligne second nav sur desktop.",
      "Con degradado en cabecera o tinte landing, la second nav puede fusionarse arriba. Elija « Siempre fondo propio » para mantener el color de la fila second nav en desktop.",
      "Con gradiente header o tinta landing, la second nav può unirsi in alto. Scegli « Sempre sfondo proprio » per mantenere il colore della riga second nav su desktop.",
      "Bei Header-Verlauf oder Landing-Farbton kann sich die Second Nav oben verbinden. Wählen Sie „Immer eigener Hintergrund“, damit die Second-Nav-Zeile auf Desktop immer sichtbar bleibt."
    ),
    secondNavAtTopDesktopOptions: [
      { value: "merge", label: t("Merge with navbar (default)", "Navbar ile birleşik (varsayılan)", "Fusionner avec la navbar (défaut)", "Fusionar con navbar (predeterminado)", "Unisci alla navbar (predefinito)", "Mit Navbar verbinden (Standard)") },
      { value: "separate", label: t("Always own background color", "Her zaman kendi arka plan rengi", "Toujours son propre fond", "Siempre fondo propio", "Sempre sfondo proprio", "Immer eigener Hintergrund") },
    ],
    hideSecondNavOnScroll: t("Hide second nav on scroll", "Kaydırınca second nav gizle", "Masquer second nav au scroll", "Ocultar second nav al desplazar", "Nascondi second nav allo scroll", "Second Nav beim Scrollen ausblenden"),
    hideSecondNavOnScrollHelp: t(
      "Off: second nav stays visible while scrolling.",
      "Kapalı: second nav kaydırırken görünür kalır.",
      "Désactivé : second nav reste visible au scroll.",
      "Desactivado: second nav permanece visible al desplazar.",
      "Disattivato: second nav resta visibile durante lo scroll.",
      "Ausgeschaltet: Second Nav bleibt immer sichtbar, auch beim Scrollen."
    ),
    chromeCoversOnScroll: t("Keep header chrome behind second nav on scroll", "Kaydırınca header chrome'u second nav arkasında tut", "Garder le chrome header derrière second nav au scroll", "Mantener chrome header detrás de second nav al desplazar", "Mantieni chrome header dietro second nav allo scroll", "Header-Chrome beim Scrollen hinter Second Nav beibehalten"),
    chromeCoversOnScrollHelp: t(
      "On: header background stays visible behind the second-nav area even when content hides. Off (default): background shrinks together with second nav.",
      "Açık: header arka planı içerik gizlense bile second-nav alanının arkasında kalır. Kapalı (varsayılan): arka plan second nav ile birlikte küçülür.",
      "Activé : le fond header reste visible derrière second nav. Désactivé (défaut) : le fond rétrécit avec second nav.",
      "Activado: el fondo del header permanece detrás de second nav. Desactivado (predeterminado): el fondo se reduce con second nav.",
      "Attivato: lo sfondo header resta dietro second nav. Disattivato (predefinito): lo sfondo si riduce con second nav.",
      "Eingeschaltet: Der Header-Hintergrund bleibt hinter dem Second-Nav-Bereich sichtbar, auch wenn der Inhalt ausblendet. Ausgeschaltet (Standard): Hintergrund schrumpft gemeinsam mit dem Second Nav."
    ),
    menuTiles: t("Menu tiles (second nav links)", "Menü karoları (second nav bağlantıları)", "Tuiles menu (liens second nav)", "Mosaicos menú (enlaces second nav)", "Tile menu (link second nav)", "Menü-Kacheln (Second Nav Links)"),
    menuTilesHelp: t(
      "Only applies when \"Tile / frosted glass\" is active for the respective device above. Each entry sits on a rounded rectangle: corner radius in px — no high percentages that look like cylinders on wide labels.",
      "Yalnızca ilgili cihazda yukarıda \"Karo / buzlu cam\" aktifken geçerli. Her giriş yuvarlatılmış dikdörtgende: köşe yarıçapı px cinsinden.",
      "S'applique uniquement si « Tuile / verre dépoli » est actif pour l'appareil ci-dessus. Chaque entrée sur un rectangle arrondi : rayon en px.",
      "Solo aplica cuando \"Mosaico / cristal esmerilado\" está activo para el dispositivo arriba. Cada entrada en un rectángulo redondeado: radio en px.",
      "Si applica solo quando \"Tile / vetro smerigliato\" è attivo per il dispositivo sopra. Ogni voce su rettangolo arrotondato: raggio in px.",
      'Gilt nur, wenn für das jeweilige Gerät oben „Kachel / Frostglas" aktiv ist. Jeder Eintrag sitzt auf einem abgerundeten Rechteck: Eckenradius in px — keine hohen Prozentwerte, die auf breiten Labels wie Zylinder wirken.'
    ),
    tileBgCss: t("Tile background (CSS)", "Karo arka plan (CSS)", "Fond tuile (CSS)", "Fondo mosaico (CSS)", "Sfondo tile (CSS)", "Kachel-Hintergrund (CSS)"),
    tileBgHelp: t(
      "Click the color preview to open the system color dialog. For rgba(…) transparency is preserved; free CSS text remains editable.",
      "Renk önizlemesine tıklayınca sistem renk diyaloğu açılır. rgba(…) için şeffaflık korunur; serbest CSS metni düzenlenebilir kalır.",
      "Cliquez sur l'aperçu couleur pour ouvrir le dialogue système. Pour rgba(…) la transparence est conservée.",
      "Haz clic en la vista previa de color para abrir el diálogo del sistema. Para rgba(…) se conserva la transparence.",
      "Clicca sull'anteprima colore per aprire il dialogo di sistema. Per rgba(…) la trasparenza è preservata.",
      "Klick auf die Farbvorschau öffnet den System-Farbdialog. Bei rgba(…) bleibt die Transparenz erhalten; freier CSS-Text bleibt editierbar."
    ),
    tileBorderHelp: t("e.g. 1px solid rgba(255,255,255,0.2) or none", "ör. 1px solid rgba(255,255,255,0.2) veya none", "ex. 1px solid rgba(255,255,255,0.2) ou none", "p. ej. 1px solid rgba(255,255,255,0.2) o none", "es. 1px solid rgba(255,255,255,0.2) o none", "z.B. 1px solid rgba(255,255,255,0.2) oder none"),
    blurBackdrop: t("Blur (backdrop-filter)", "Bulanıklık (backdrop-filter)", "Flou (backdrop-filter)", "Desenfoque (backdrop-filter)", "Sfocatura (backdrop-filter)", "Unschärfe (backdrop-filter)"),
    blurExample: t("e.g. blur(12px)", "ör. blur(12px)", "ex. blur(12px)", "p. ej. blur(12px)", "es. blur(12px)", "z.B. blur(12px)"),
    cornerRadius: t("Corner radius", "Köşe yarıçapı", "Rayon des coins", "Radio de esquina", "Raggio angoli", "Eckenradius"),
    cornerRadiusHelp: t(
      "Round corners only: e.g. 8px or 12px (not 20% / 9999px — otherwise pill look)",
      "Yalnızca köşeleri yuvarla: ör. 8px veya 12px (20% / 9999px değil — pill görünümü olur)",
      "Arrondir les coins uniquement : ex. 8px ou 12px (pas 20% / 9999px)",
      "Redondear solo esquinas: p. ej. 8px o 12px (no 20% / 9999px)",
      "Arrotonda solo angoli: es. 8px o 12px (non 20% / 9999px)",
      "Nur Ecken runden: z.B. 8px oder 12px (kein 20% / 9999px — sonst Pillen-Look)"
    ),
    padding: t("Padding", "İç boşluk", "Marge intérieure", "Relleno", "Padding", "Innenabstand (padding)"),
    paddingExample: t("e.g. 6px 14px", "ör. 6px 14px", "ex. 6px 14px", "p. ej. 6px 14px", "es. 6px 14px", "z.B. 6px 14px"),
    shadowMostlyNone: t("Usually none", "Genelde none", "Généralement none", "Generalmente none", "Di solito none", "Meist none"),

    // ── Footer ───────────────────────────────────────────────────────────────
    footerBorderTop: t("Top edge (border-top)", "Üst kenar (border-top)", "Bord supérieur (border-top)", "Borde superior (border-top)", "Bordo superiore (border-top)", "Oberer Rand (border-top)"),

    // ── Mobile chrome ──────────────────────────────────────────────────────
    mobileScrollTitle: t("Mobile: scroll & bottom bar", "Mobil: kaydırma ve alt çubuk", "Mobile : défilement et barre basse", "Móvil: desplazamiento y barra inferior", "Mobile: scroll e barra inferiore", "Mobil: Kaydırma & untere Leiste"),
    mobileScrollSubtitle: t(
      "Applies to narrow/tablet view (≤1023px). Header on scroll; bottom tab bar (fixed or at page end).",
      "Dar/tablet görünümü için (≤1023px). Kaydırınca header; alt sekme çubuğu (sabit veya sayfa sonunda).",
      "Pour la vue étroite/tablette (≤1023px). Header au scroll ; barre d'onglets en bas.",
      "Para vista estrecha/tablet (≤1023px). Header al desplazar; barra inferior de pestañas.",
      "Per vista stretta/tablet (≤1023px). Header allo scroll; barra tab inferiore.",
      "Gilt für schmale/tablet Ansicht (≤1023px). Header beim Scrollen; untere Tab-Leiste (fest oder am Seitenende)."
    ),
    headerOnScrollUp: t("Header after scrolling up", "Yukarı kaydırınca header", "Header après défilement vers le haut", "Header al desplazar hacia arriba", "Header dopo scroll verso l'alto", "Header nach dem Hochscrollen"),
    mobileHeaderOnScrollOptions: [
      { label: t("Frosted white + blur on scroll", "Buzlu beyaz + kaydırınca blur", "Blanc givré + flou au scroll", "Blanco esmerilado + desenfoque al desplazar", "Bianco satinato + blur allo scroll", "Frosted white + blur on scroll"), value: "frosted_white" },
      { label: t("Keep theme / landing role", "Temayı / landing rolünü koru", "Garder thème / rôle landing", "Mantener tema / rol landing", "Mantieni tema / ruolo landing", "Keep theme / landing role"), value: "inherit" },
    ],
    frostedBg: t("Frosted — background (CSS)", "Buzlu — arka plan (CSS)", "Givré — arrière-plan (CSS)", "Esmerilado — fondo (CSS)", "Satinato — sfondo (CSS)", "Frosted — Hintergrund (CSS)"),
    frostedBlur: t("Frosted — blur", "Buzlu — bulanıklık", "Givré — flou", "Esmerilado — desenfoque", "Satinato — sfocatura", "Frosted — Unschärfe (blur)"),
    frostedBlurHelp: t("e.g. 16px or blur(20px)", "ör. 16px veya blur(20px)", "ex. 16px ou blur(20px)", "p. ej. 16px o blur(20px)", "es. 16px o blur(20px)", "z. B. 16px oder blur(20px)"),
    pinHeaderTop: t("Pin header to top (≤1023px)", "Header'ı üste sabitle (≤1023px)", "Fixer header en haut (≤1023px)", "Fijar header arriba (≤1023px)", "Fissa header in alto (≤1023px)", "Header oben fixieren (≤1023px)"),
    pinHeaderHelp: t("Off = header scrolls with page (no overlay).", "Kapalı = header sayfayla kayar (overlay yok).", "Désactivé = header défile avec la page.", "Desactivado = header se desplaza con la página.", "Disattivato = header scorre con la pagina.", "Aus = Header scrollt mit der Seite (kein Overlay)."),
    pinBottomBar: t("Pin bottom bar to viewport bottom", "Alt çubuğu viewport altına sabitle", "Fixer barre basse au bas du viewport", "Fijar barra inferior al fondo del viewport", "Fissa barra inferiore al fondo viewport", "Untere Leiste am Viewport-Boden fixieren"),
    pinBottomBarHelp: t("Off = bar below page content (after footer).", "Kapalı = çubuk sayfa içeriğinin altında (footer sonrası).", "Désactivé = barre sous le contenu (après footer).", "Desactivado = barra bajo el contenido (tras footer).", "Disattivato = barra sotto il contenuto (dopo footer).", "Aus = Leiste unter dem Seiteninhalt (nach dem Footer)."),
    recessBottomBar: t("Retract bottom bar on scroll down", "Aşağı kaydırınca alt çubuğu içeri çek", "Rétracter barre basse en défilant vers le bas", "Retraer barra inferior al bajar", "Ritrai barra inferiore scrollando giù", "Untere Leiste beim Runterscrollen einziehen"),
    recessBottomBarHelp: t(
      "Default: off — bar stays at bottom. Only when bar is fixed.",
      "Varsayılan: kapalı — çubuk altta kalır. Yalnızca çubuk sabitlendiyse.",
      "Par défaut : désactivé — barre reste en bas. Seulement si fixée.",
      "Predeterminado: desactivado — barra permanece abajo. Solo si está fijada.",
      "Predefinito: disattivato — barra resta in basso. Solo se fissata.",
      "Standard: aus — Leiste bleibt am unteren Rand. Nur wenn die Leiste fixiert ist."
    ),
    bottomBarBg: t("Bottom bar — background", "Alt çubuk — arka plan", "Barre basse — arrière-plan", "Barra inferior — fondo", "Barra inferiore — sfondo", "Untere Leiste — Hintergrund"),
    bottomBarBorderTop: t("Bottom bar — top border (border-top)", "Alt çubuk — üst kenarlık (border-top)", "Barre basse — bordure haut (border-top)", "Barra inferior — borde superior (border-top)", "Barra inferiore — bordo superiore (border-top)", "Untere Leiste — oberer Rand (border-top)"),
    bottomBarBlur: t("Bottom bar — blur", "Alt çubuk — bulanıklık", "Barre basse — flou", "Barra inferior — desenfoque", "Barra inferiore — sfocatura", "Untere Leiste — Unschärfe"),
    bottomBarShadow: t("Bottom bar — shadow", "Alt çubuk — gölge", "Barre basse — ombre", "Barra inferior — sombra", "Barra inferiore — ombra", "Untere Leiste — Schatten"),

    // ── Scroll-up button ───────────────────────────────────────────────────
    scrollUpTitle: t("Scroll-up button", "Yukarı kaydır butonu", "Bouton retour haut", "Botón volver arriba", "Pulsante scroll-up", "Scroll-up Button"),
    iconColor: t("Icon color", "İkon rengi", "Couleur icône", "Color icono", "Colore icona", "Icon-Farbe"),
    borderRadius: t("Border radius (border-radius)", "Kenar yarıçapı (border-radius)", "Rayon bordure (border-radius)", "Radio borde (border-radius)", "Raggio bordo (border-radius)", "Randradius (border-radius)"),
    size: t("Size (size)", "Boyut (size)", "Taille (size)", "Tamaño (size)", "Dimensione (size)", "Größe (size)"),
    scrollUpPresetOptions: [
      { value: "default", label: t("Standard (round)", "Standart (yuvarlak)", "Standard (rond)", "Estándar (redondo)", "Standard (tondo)", "Standard (rund)") },
      { value: "soft", label: t("Soft rounded", "Yumuşak yuvarlatılmış", "Arrondi doux", "Redondeado suave", "Arrotondato morbido", "Weich abgerundet") },
      { value: "square", label: t("Square", "Köşeli", "Carré", "Cuadrado", "Quadrato", "Eckig") },
      { value: "outline", label: t("Outline / transparent", "Outline / şeffaf", "Contour / transparent", "Contorno / transparente", "Outline / trasparente", "Outline / transparent") },
    ],

    // ── Button styles ──────────────────────────────────────────────────────
    buttonStylesTitle: t("Button styles", "Buton stilleri", "Styles de boutons", "Estilos de botones", "Stili pulsanti", "Button-Stile"),

    // ── Media picker modals ──────────────────────────────────────────────────
    brandingMediaPickerTitle: t("Choose branding media", "Marka medyası seç", "Choisir média branding", "Elegir medios branding", "Scegli media branding", "Branding-Medien waehlen"),
    headerBgPickerTitle: t("Header background image", "Header arka plan görseli", "Image d'arrière-plan header", "Imagen fondo header", "Immagine sfondo header", "Header-Hintergrundbild"),

    // ── Page meta (also used in first half — optional consolidation) ─────────
    pageTitle: t("Website styles", "Web sitesi stilleri", "Styles du site", "Estilos del sitio", "Stili del sito", "Website-Stile"),
    pageSubtitle: t(
      "Colors, buttons and visual styles of your shop",
      "Mağazanın renkleri, butonları ve görsel stilleri",
      "Couleurs, boutons et styles visuels de votre boutique",
      "Colores, botones y estilos visuales de tu tienda",
      "Colori, pulsanti e stili visivi del tuo negozio",
      "Farben, Buttons und visuelle Stile deines Shops"
    ),
    stylesSaved: t("Styles saved.", "Stiller kaydedildi.", "Styles enregistrés.", "Estilos guardados.", "Stili salvati.", "Stile gespeichert."),

    // ── CMS pages ────────────────────────────────────────────────────────────
    cmsPagesTitle: t("Layout: CMS pages", "Layout: CMS sayfaları", "Mise en page : pages CMS", "Diseño: páginas CMS", "Layout: pagine CMS", "Layout: CMS-Seiten"),
    cmsPagesSubtitle: t(
      "Spacing below the header on Content → Pages (title / body).",
      "Content → Pages sayfalarında header altı boşluk (başlık / gövde).",
      "Espacement sous le header sur Contenu → Pages (titre / corps).",
      "Espaciado bajo el header en Contenido → Páginas (título / cuerpo).",
      "Spaziatura sotto l'header in Contenuto → Pagine (titolo / corpo).",
      "Abstand unter dem Header auf Content → Seiten (Titel / Inhalt)."
    ),
    cmsPaddingTop: t("Top padding (px)", "Üst boşluk (px)", "Marge haute (px)", "Padding superior (px)", "Padding superiore (px)", "Abstand oben (px)"),
    cmsPaddingTopHelp: t(
      "Extra space between header and page title. Default 0. Header height is already reserved separately.",
      "Header ile sayfa başlığı arası ekstra boşluk. Varsayılan 0. Header yüksekliği ayrıca ayrılır.",
      "Espace supplémentaire entre le header et le titre. Défaut 0. La hauteur du header est déjà réservée.",
      "Espacio extra entre el header y el título. Predeterminado 0. La altura del header ya está reservada.",
      "Spazio extra tra header e titolo. Predefinito 0. L'altezza dell'header è già riservata.",
      "Extra-Abstand zwischen Header und Seitentitel. Standard 0. Die Header-Höhe ist separat reserviert."
    ),
    cmsPaddingBottom: t("Bottom padding (px)", "Alt boşluk (px)", "Marge basse (px)", "Padding inferior (px)", "Padding inferiore (px)", "Abstand unten (px)"),
  };
}
