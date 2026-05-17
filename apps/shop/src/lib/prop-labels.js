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
