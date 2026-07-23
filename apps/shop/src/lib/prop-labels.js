const PROP_LABELS = {
  weee_number:   { de: "WEEE Nummer",      tr: "WEEE Numarası",   fr: "Numéro WEEE",     it: "Numero WEEE",    es: "Número WEEE",    en: "WEEE Number" },
  eprel_number:  { de: "EPREL Nummer",     tr: "EPREL Numarası",  fr: "Numéro EPREL",    it: "Numero EPREL",   es: "Número EPREL",   en: "EPREL Number" },
  material:      { de: "Material",         tr: "Malzeme",         fr: "Matériau",         it: "Materiale",      es: "Material",       en: "Material" },
  farbe:         { de: "Farbe",            tr: "Renk",            fr: "Couleur",          it: "Colore",         es: "Color",          en: "Color" },
  colour:        { de: "Farbe",            tr: "Renk",            fr: "Couleur",          it: "Colore",         es: "Color",          en: "Color" },
  color:         { de: "Farbe",            tr: "Renk",            fr: "Couleur",          it: "Colore",         es: "Color",          en: "Color" },
  size:          { de: "Größe",            tr: "Boyut",           fr: "Taille",           it: "Taglia",         es: "Tamaño",         en: "Size" },
  gewicht:       { de: "Gewicht",          tr: "Ağırlık",         fr: "Poids",            it: "Peso",           es: "Peso",           en: "Weight" },
  typ:           { de: "Typ",              tr: "Tip",             fr: "Type",             it: "Tipo",           es: "Tipo",           en: "Type" },
  stoff:         { de: "Stoff",            tr: "Kumaş",           fr: "Tissu",            it: "Tessuto",        es: "Tela",           en: "Fabric" },
  marke:         { de: "Marke",            tr: "Marka",           fr: "Marque",           it: "Marca",          es: "Marca",          en: "Brand" },
  modell:        { de: "Modell",           tr: "Model",           fr: "Modèle",           it: "Modello",        es: "Modelo",         en: "Model" },
  herstellernummer: { de: "Herstellernummer", tr: "Üretici Numarası", fr: "Référence fabricant", it: "Codice produttore", es: "Referencia fabricante", en: "Manufacturer Number" },
  zustand:       { de: "Zustand",          tr: "Durum",           fr: "État",             it: "Condizione",     es: "Estado",         en: "Condition" },
  garantie:      { de: "Garantie",         tr: "Garanti",         fr: "Garantie",         it: "Garanzia",       es: "Garantía",       en: "Warranty" },
  lieferumfang:  { de: "Lieferumfang",     tr: "Teslimat kapsamı",fr: "Contenu livraison",it: "Contenuto confezione", es: "Contenido entrega", en: "Package Contents" },
  herkunftsland: { de: "Herkunftsland",    tr: "Menşei Ülke",     fr: "Pays d'origine",   it: "Paese d'origine",es: "País de origen",  en: "Country of Origin" },
  breite:        { de: "Breite",           tr: "Genişlik",        fr: "Largeur",          it: "Larghezza",      es: "Ancho",          en: "Width" },
  hoehe:         { de: "Höhe",             tr: "Yükseklik",       fr: "Hauteur",          it: "Altezza",        es: "Altura",         en: "Height" },
  tiefe:         { de: "Tiefe",            tr: "Derinlik",        fr: "Profondeur",       it: "Profondità",     es: "Profundidad",    en: "Depth" },
  laenge:        { de: "Länge",            tr: "Uzunluk",         fr: "Longueur",         it: "Lunghezza",      es: "Longitud",       en: "Length" },
  volumen:       { de: "Volumen",          tr: "Hacim",           fr: "Volume",           it: "Volume",         es: "Volumen",        en: "Volume" },
  kapazitaet:    { de: "Kapazität",        tr: "Kapasite",        fr: "Capacité",         it: "Capacità",       es: "Capacidad",      en: "Capacity" },
  leistung:      { de: "Leistung",         tr: "Güç",             fr: "Puissance",        it: "Potenza",        es: "Potencia",       en: "Power" },
  spannung:      { de: "Spannung",         tr: "Voltaj",          fr: "Tension",          it: "Tensione",       es: "Voltaje",        en: "Voltage" },
  frequenz:      { de: "Frequenz",         tr: "Frekans",         fr: "Fréquence",        it: "Frequenza",      es: "Frecuencia",     en: "Frequency" },
  // GPSR category-specific compliance fields (docs/HUKUKI.md Faz 4)
  energy_label_image:      { de: "Energielabel",                 tr: "Enerji etiketi",              fr: "Étiquette énergie",           it: "Etichetta energetica",       es: "Etiqueta energética",       en: "Energy label" },
  energy_label_qr:         { de: "Energielabel QR",               tr: "Enerji etiketi QR",           fr: "QR étiquette énergie",        it: "QR etichetta energetica",    es: "QR etiqueta energética",    en: "Energy label QR" },
  ce_declaration_url:      { de: "CE-Konformitätserklärung",      tr: "CE uygunluk beyanı",          fr: "Déclaration CE",              it: "Dichiarazione CE",           es: "Declaración CE",            en: "CE declaration" },
  battery_chemistry:       { de: "Batteriechemie",                tr: "Batarya kimyası",             fr: "Chimie de la batterie",       it: "Chimica della batteria",     es: "Química de la batería",     en: "Battery chemistry" },
  battery_capacity_wh:     { de: "Kapazität (Wh)",                tr: "Kapasite (Wh)",               fr: "Capacité (Wh)",               it: "Capacità (Wh)",              es: "Capacidad (Wh)",            en: "Capacity (Wh)" },
  inci_list:                { de: "INCI-Liste",                    tr: "INCI listesi",                fr: "Liste INCI",                  it: "Elenco INCI",                es: "Lista INCI",                en: "INCI list" },
  responsible_person_eu:   { de: "Verantwortliche Person (Kosmetik)", tr: "Sorumlu kişi (kozmetik)",  fr: "Personne responsable (UE)",   it: "Persona responsabile (UE)",  es: "Persona responsable (UE)",  en: "Responsible person (EU)" },
  ingredients:              { de: "Zutaten",                       tr: "İçindekiler",                 fr: "Ingrédients",                 it: "Ingredienti",                es: "Ingredientes",              en: "Ingredients" },
  allergens:                 { de: "Allergene",                     tr: "Alerjenler",                  fr: "Allergènes",                  it: "Allergeni",                  es: "Alérgenos",                 en: "Allergens" },
  best_before:               { de: "Mindesthaltbarkeit",            tr: "Son kullanma tarihi",         fr: "À consommer de préférence avant", it: "Da consumarsi preferibilmente entro", es: "Consumir preferentemente antes de", en: "Best before" },
  nutrition_values:          { de: "Nährwerte",                     tr: "Besin değerleri",             fr: "Valeurs nutritionnelles",     it: "Valori nutrizionali",        es: "Valores nutricionales",     en: "Nutrition values" },
  daily_dose:                 { de: "Tagesdosis",                    tr: "Günlük doz",                  fr: "Dose journalière",            it: "Dose giornaliera",           es: "Dosis diaria",              en: "Daily dose" },
  warning_text:               { de: "Warnhinweis",                   tr: "Uyarı metni",                 fr: "Avertissement",               it: "Avvertenza",                 es: "Advertencia",               en: "Warning" },
  age_warning:                { de: "Altersempfehlung",              tr: "Yaş uyarısı",                 fr: "Avertissement d'âge",         it: "Avviso di età",              es: "Advertencia de edad",       en: "Age warning" },
  fiber_composition:          { de: "Faserzusammensetzung",          tr: "Elyaf kompozisyonu",           fr: "Composition textile",         it: "Composizione fibre",         es: "Composición textil",        en: "Fiber composition" },
  care_symbols:                { de: "Pflegesymbole",                 tr: "Bakım sembolleri",             fr: "Symboles d'entretien",        it: "Simboli di manutenzione",    es: "Símbolos de cuidado",       en: "Care symbols" },
  safety_data_sheet_url:       { de: "Sicherheitsdatenblatt (SDB)",   tr: "Güvenlik bilgi formu",          fr: "Fiche de données de sécurité", it: "Scheda dati di sicurezza",  es: "Ficha de datos de seguridad", en: "Safety data sheet" },
  tpd_compliance_ref:          { de: "TPD-Referenz",                  tr: "TPD referansı",                 fr: "Référence TPD",               it: "Riferimento TPD",            es: "Referencia TPD",            en: "TPD reference" },
  age_verification:            { de: "Altersverifikation",            tr: "Yaş doğrulama",                 fr: "Vérification d'âge",          it: "Verifica dell'età",          es: "Verificación de edad",      en: "Age verification" },
  ce_class:                     { de: "CE-Klasse",                     tr: "CE sınıfı",                     fr: "Classe CE",                   it: "Classe CE",                  es: "Clase CE",                  en: "CE class" },
  udi:                           { de: "UDI",                           tr: "UDI",                            fr: "UDI",                          it: "UDI",                         es: "UDI",                        en: "UDI" },
  authorized_representative:    { de: "Bevollmächtigter",              tr: "Yetkili temsilci",              fr: "Représentant autorisé",       it: "Rappresentante autorizzato", es: "Representante autorizado",  en: "Authorized representative" },
  isbn:                          { de: "ISBN",                          tr: "ISBN",                           fr: "ISBN",                         it: "ISBN",                        es: "ISBN",                       en: "ISBN" },
};

export function localizeMetaKey(key, locale) {
  const k = String(key || "").toLowerCase().trim();
  const entry = PROP_LABELS[k];
  if (entry) {
    return entry[locale] || entry.de || entry.en || key;
  }
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const SECTION_LABELS = {
  eigenschaften: { de: "Eigenschaften", tr: "Özellikler", fr: "Caractéristiques", it: "Caratteristiche", es: "Características", en: "Properties" },
  abmessungen:   { de: "Abmessungen",   tr: "Boyutlar",   fr: "Dimensions",       it: "Dimensioni",       es: "Dimensiones",     en: "Dimensions" },
};

export function localizeSectionLabel(key, locale) {
  const entry = SECTION_LABELS[key];
  if (!entry) return key;
  return entry[locale] || entry.de || entry.en || key;
}
