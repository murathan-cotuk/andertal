'use strict'

/**
 * Official-style Amazon marketplace labels for US browse-tree English names.
 * Used before machine translation so roots (e.g. Appliances) match shop language,
 * not a literal word-for-word rendering.
 */
const AMAZON_CATEGORY_NAME_GLOSSARY = {
  Appliances: {
    de: 'Haushaltsgeräte',
    fr: 'Appareils électroménagers',
    es: 'Electrodomésticos',
    it: 'Elettrodomestici',
    tr: 'Ev Aletleri',
  },
  'Arts, Crafts & Sewing': {
    de: 'Kunst, Handwerk & Nähen',
    fr: 'Arts, artisanat et couture',
    es: 'Arte, manualidades y costura',
    it: 'Arte, artigianato e cucito',
    tr: 'Sanat, El İşi ve Dikiş',
  },
  Automotive: {
    de: 'Auto & Motorrad',
    fr: 'Auto et Moto',
    es: 'Coche y moto',
    it: 'Auto e Moto',
    tr: 'Otomotiv',
  },
  'Baby Products': {
    de: 'Baby',
    fr: 'Bébé et Puériculture',
    es: 'Bebé',
    it: 'Prima infanzia',
    tr: 'Bebek Ürünleri',
  },
  'Beauty & Personal Care': {
    de: 'Beauty',
    fr: 'Beauté et Parfum',
    es: 'Belleza',
    it: 'Bellezza',
    tr: 'Güzellik ve Kişisel Bakım',
  },
  Books: {
    de: 'Bücher',
    fr: 'Livres',
    es: 'Libros',
    it: 'Libri',
    tr: 'Kitap',
  },
  'CDs & Vinyl': {
    de: 'Musik-CDs & Vinyl',
    fr: 'CD et Vinyles',
    es: 'CDs y vinilos',
    it: 'CD e vinili',
    tr: 'CD ve Plak',
  },
  'Cell Phones & Accessories': {
    de: 'Handy & Zubehör',
    fr: 'Téléphones portables et accessoires',
    es: 'Móviles y accesorios',
    it: 'Cellulari e accessori',
    tr: 'Cep Telefonları ve Aksesuarları',
  },
  'Clothing, Shoes & Jewelry': {
    de: 'Bekleidung, Schuhe & Schmuck',
    fr: 'Vêtements, chaussures et bijoux',
    es: 'Ropa, zapatos y joyería',
    it: 'Abbigliamento, scarpe e gioielli',
    tr: 'Giyim, Ayakkabı ve Takı',
  },
  Electronics: {
    de: 'Elektronik',
    fr: 'High-Tech',
    es: 'Electrónica',
    it: 'Elettronica',
    tr: 'Elektronik',
  },
  'Grocery & Gourmet Food': {
    de: 'Lebensmittel & Getränke',
    fr: 'Épicerie',
    es: 'Alimentación y bebidas',
    it: 'Alimentari',
    tr: 'Market ve Gurme',
  },
  'Health & Household': {
    de: 'Drogerie & Körperpflege',
    fr: 'Hygiène et Santé',
    es: 'Salud y hogar',
    it: 'Salute e cura della persona',
    tr: 'Sağlık ve Ev',
  },
  'Home & Kitchen': {
    de: 'Küche, Haushalt & Wohnen',
    fr: 'Cuisine et Maison',
    es: 'Hogar y cocina',
    it: 'Casa e cucina',
    tr: 'Ev ve Mutfak',
  },
  'Industrial & Scientific': {
    de: 'Gewerbe, Industrie & Wissenschaft',
    fr: 'Industrie et Science',
    es: 'Industria y ciencia',
    it: 'Industria e scienza',
    tr: 'Endüstriyel ve Bilimsel',
  },
  'Movies & TV': {
    de: 'Filme & TV-Serien',
    fr: 'Films et TV',
    es: 'Películas y TV',
    it: 'Film e TV',
    tr: 'Film ve Dizi',
  },
  'Musical Instruments': {
    de: 'Musikinstrumente',
    fr: 'Instruments de musique',
    es: 'Instrumentos musicales',
    it: 'Strumenti musicali',
    tr: 'Müzik Enstrümanları',
  },
  'Office Products': {
    de: 'Bürobedarf & Schreibwaren',
    fr: 'Fournitures de bureau',
    es: 'Oficina y papelería',
    it: 'Cancelleria e prodotti per ufficio',
    tr: 'Ofis Ürünleri',
  },
  'Patio, Lawn & Garden': {
    de: 'Garten',
    fr: 'Jardin',
    es: 'Jardín',
    it: 'Giardino e giardinaggio',
    tr: 'Bahçe',
  },
  'Pet Supplies': {
    de: 'Haustier',
    fr: 'Animalerie',
    es: 'Productos para mascotas',
    it: 'Prodotti per animali domestici',
    tr: 'Evcil Hayvan Ürünleri',
  },
  'Sports & Outdoors': {
    de: 'Sport & Freizeit',
    fr: 'Sports et Loisirs',
    es: 'Deportes y aire libre',
    it: 'Sport e tempo libero',
    tr: 'Spor ve Outdoor',
  },
  'Tools & Home Improvement': {
    de: 'Baumarkt',
    fr: 'Bricolage',
    es: 'Bricolaje',
    it: 'Fai da te',
    tr: 'Yapı Market',
  },
  'Toys & Games': {
    de: 'Spielzeug',
    fr: 'Jeux et Jouets',
    es: 'Juguetes y juegos',
    it: 'Giochi e giocattoli',
    tr: 'Oyuncak ve Oyun',
  },
  'Video Games': {
    de: 'Games',
    fr: 'Jeux vidéo',
    es: 'Videojuegos',
    it: 'Videogiochi',
    tr: 'Video Oyunları',
  },
  'Parts & Accessories': {
    de: 'Teile & Zubehör',
    fr: 'Pièces et accessoires',
    es: 'Piezas y accesorios',
    it: 'Ricambi e accessori',
    tr: 'Parça ve Aksesuar',
  },
  'Replacement Parts': {
    de: 'Ersatzteile',
    fr: 'Pièces de rechange',
    es: 'Piezas de recambio',
    it: 'Ricambi',
    tr: 'Yedek Parçalar',
  },
}

function glossaryLookup(englishName, locale) {
  const key = String(englishName || '').trim()
  const row = AMAZON_CATEGORY_NAME_GLOSSARY[key]
  if (!row) return ''
  return String(row[String(locale || '').slice(0, 2).toLowerCase()] || '').trim()
}

module.exports = {
  AMAZON_CATEGORY_NAME_GLOSSARY,
  glossaryLookup,
}
