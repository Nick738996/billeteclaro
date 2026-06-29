import type { Categoria } from '@/lib/types'

// Patrones en minúsculas — se comparan con comercio.toLowerCase()
// El orden del objeto determina prioridad (primero que matchee gana).
const CATEGORY_PATTERNS: Partial<Record<Categoria, string[]>> = {

  SALIDAS: [
    // Cadenas nacionales
    'crepes', 'wok', 'andrés carne', 'andres carne', 'andrés dc',
    'la brasa roja', 'el corral', 'hamburguesas el corral',
    'primos', 'pollos mario', 'frisby', 'kokoriko',
    'cali mio', 'leños y carbon', 'carbon de palo',
    'sipote burrito', 'panka', 'harry sasson', 'criterion',
    'astrid y gaston', 'masa', 'quinua y amaranto',
    // Internacionales
    'mcdonalds', 'mcdonald', 'burger king', 'kfc',
    'subway', 'dominos', 'pizza hut', 'papa johns',
    'taco bell', 'wendys', 'chilis', 'tgif', 't.g.i',
    'hooters', 'tony romas', 'nikos',
    // Cafés
    'juan valdez', 'oma', 'tostao', 'starbucks',
    'cafe quindio', 'llorente', 'coffee', 'cafeter',
    'libertario', 'pergamino', 'amor perfecto',
    // Bares y rumba
    'bbc', 'berlín', 'berlin', 'galería café libro',
    'teatro bar', 'lounge', 'rooftop', 'discoteca',
    'gato negro', 'quiebra canto',
    // Heladerías y postres
    'popsy', "mimo's", 'mimos', 'baskin', 'häagen', 'haagen',
    // Restaurantes genéricos
    'restaurante', 'rest.', 'parrilla', 'asadero', 'picada',
    'buffalo wings', 'wings', 'sushi', 'pizza', 'burger',
    // Delivery (clasificados como salida, no transporte)
    'rappi', 'ifood', 'pedidosya', 'domicilios', 'domicilio',
    // Cine y entretenimiento
    'cine colombia', 'cinemark', 'procinal', 'royal films',
    'multiplex', 'cinemax',
    'tuboleta', 'tu boleta', 'eticket', 'ticketmaster',
    'moviticket', 'mango live',
    // Parques
    'salitre magico', 'mundo aventura', 'divercity',
  ],

  TRANSPORTE: [
    // Ride hailing
    'uber', 'cabify', 'didi', 'indrive', 'in drive', 'beat',
    'picap', 'tapsi',
    // Transporte público
    'transmilenio', 'sitp', 'mio cali', 'metro medellin',
    'metro de medellin', 'metroplus', 'transcaribe',
    'megabus', 'transmetro', 'sitva',
    // Parqueaderos
    'ipark', 'parking', 'parqueadero', 'parqueo', 'apcoa',
    'helios parking', 'set parking',
    // Combustible
    'terpel', 'biomax', 'texaco', 'mobil', 'esso',
    'gulf', 'puma energy', 'zeuss',
    // Buses intermunicipales
    'flota', 'expreso', 'berlinas', 'copetran',
    'bolivariano', 'oleotrans',
  ],

  HOGAR: [
    // Supermercados
    'exito', 'éxito', 'carulla', 'jumbo', 'olimpica',
    'la 14', 'superinter', 'metro sup', 'lider',
    'd1', 'ara', 'justo y bueno', 'surtimax',
    'mercamas', 'surtifamiliar', 'colsubsidio super',
    'makro', 'pricesmart', 'costco',
    // Tiendas de frutas y verduras
    'mercar', 'fruver', 'fruteria', 'frutas y verduras', 'verduras',
    // Servicios públicos — energía
    'enel', 'codensa', 'electricaribe', 'epm', 'essa',
    'celsia', 'emcali', 'electrocaqueta',
    // Gas
    'vanti', 'gases del caribe', 'surtigas',
    'gases de occidente', 'alcanos', 'llanogas',
    // Agua
    'acueducto', 'triple a', 'veolia', 'emvarias',
    // Internet y telefonía
    'claro', 'movistar', 'tigo', 'wom', 'etb',
    'une', 'avantel', 'virgin mobile', 'directv',
    // Construcción y muebles
    'homecenter', 'easy', 'tugó', 'tugo',
    'muebles jamar', 'muebles y muebles',
    'ferreteria', 'ferretería', 'pintuco', 'sherwin',
  ],

  SALUD: [
    // Droguerías
    'farmatodo', 'drogas la rebaja', 'la rebaja',
    'cafam', 'droguerias', 'drogueria', 'farmacia',
    'dromayor', 'locatel', 'pasteur', 'cruz verde', 'medicity',
    // Clínicas y hospitales
    'clinica', 'clínica', 'hospital', 'urgencias',
    'medicentro', 'salud total', 'sura salud',
    'compensar salud', 'coomeva',
    // Gimnasios
    'bodytech', 'smartfit', 'smart fit',
    'spinning', 'crossfit', 'gym', 'gimnasio',
    'stark fitness', 'nas fitness', 'athletic', 'iron gym',
    // Fisioterapia y bienestar
    'fisioterapia', 'reactive move', 'kinesis',
    'ortopedica', 'fisiomed',
    // Ópticas
    'optima', 'lafam', 'multiopticas', 'vision uno', 'eye center',
    // Laboratorios
    'laboratorio', 'laboratorios', 'clinilaser', 'labco', 'synlab',
    // Veterinarios
    'veterinaria', 'veterinario', 'vetline',
    'anipet', 'mundo animal', 'clinica veterinaria',
    'colegio canino', 'peluqueria canina',
    // Deporte
    'decathlon', 'marathon sports', 'intersport',
  ],

  SUSCRIPCIONES: [
    // Streaming video
    'netflix', 'hbo max', 'disney+', 'disney plus', 'disney',
    'amazon prime', 'paramount+', 'apple tv', 'crunchyroll',
    'mubi', 'claro video',
    // Música
    'spotify', 'apple music', 'deezer', 'tidal', 'youtube premium',
    // Productividad y software
    'claude', 'anthropic', 'chatgpt', 'openai',
    'microsoft 365', 'office 365', 'google one',
    'dropbox', 'notion', 'figma', 'canva',
    'adobe', 'autodesk', 'slack', 'grammarly',
    // Gaming
    'playstation', 'xbox', 'nintendo', 'steam',
    'epic games', 'ea play',
    // Otros
    'linkedin premium', 'rappiprime', 'rappi prime', 'peoplepass',
  ],

  COMPRAS_ONLINE: [
    // Global
    'temu', 'dlo temu', 'amazon', 'ebay', 'aliexpress', 'shein', 'wish',
    // LATAM
    'mercadolibre', 'mercado libre', 'linio', 'falabella', 'ripley',
    // Ropa
    'adidas', 'nike', 'zara', 'h&m', 'bershka',
    'pull and bear', 'stradivarius', 'forever 21',
    // Tecnología
    'samsung', 'xiaomi',
    // Locales
    'studio f', 'fuera de serie', 'tennis', 'armi', 'chevignon',
    'gef', 'pronto', 'pat primo',
  ],

  EDUCACION: [
    // Universidades
    'uniandes', 'javeriana', 'universidad nacional',
    'sabana', 'rosario', 'eafit', 'icesi', 'uninorte',
    'externado', 'uniminuto', 'udea', 'universidad libre',
    'univ int valenciana', 'viu',
    // Online
    'coursera', 'udemy', 'platzi', 'domestika',
    'edx', 'khan', 'duolingo', 'babbel',
    'open english', 'british council', 'masterclass',
    // Colegios
    'colegio', 'school', 'instituto', 'liceo', 'gimnasio coleg',
  ],

  DONACIONES: [
    'world vision', 'worldvision', 'techo', 'un techo',
    'save the children', 'unicef', 'cruz roja',
    'medicos sin fronteras', 'banco de alimentos',
    'fundacion', 'fundación', 'iglesia', 'parroquia',
    'diocesis', 'diezmo', 'ofrenda', 'caritas',
    'minuto de dios', 'hogar nazareth', 'amor fe y vida',
  ],

  INVERSION: [
    // Fondos y fiducias
    'fiducolombia', 'fidubogota', 'alianza fiduciaria',
    'corficolombiana', 'skandia', 'proteccion', 'porvenir',
    'old mutual', 'sura inversiones',
    // Comisionistas
    'valores bancolombia', 'acciones y valores', 'credicorp',
    // CDT y ahorro
    'cdt', 'boveda', 'bóveda',
    // Crypto
    'binance', 'buda', 'paxful', 'bitso', 'kraken', 'coinbase',
    // Cooperativas
    'cooperativa', 'cotrafa', 'confiar',
  ],
}

export function guessCategoria(comercio: string): Categoria {
  const lower = comercio.toLowerCase()
  for (const [categoria, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (patterns.some((p) => lower.includes(p))) {
      return categoria as Categoria
    }
  }
  return 'OTRO'
}
