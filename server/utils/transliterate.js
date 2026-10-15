/**
 * Bilingual & Transliteration Helper
 * Provides zero-AI, high-accuracy Hindi <-> English <-> Hinglish decoding, transliteration, and semantic matching.
 */

const DEVANAGARI_MAP = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '', '़': '', '।': ''
};

function devanagariToLatin(text) {
  if (!text) return '';
  return text
    .split('')
    .map((c) => (DEVANAGARI_MAP[c] !== undefined ? DEVANAGARI_MAP[c] : c))
    .join('')
    .toLowerCase()
    .replace(/ai/g, 'e')
    .replace(/au/g, 'o')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/w/g, 'v')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Common bilingual educational concept dictionary (English <-> Hindi <-> Hinglish)
const CONCEPT_PAIRS = [
  // Astronomy / Space
  ['solar system', 'solar', 'system', 'सौरमंडल', 'सौर मण्डल', 'सौर मंडल', 'मंडल', 'मण्डल', 'saur mandal', 'saurmandal', 'sor mandal'],
  ['planet', 'planets', 'ग्रह', 'गृह', 'grah', 'grih', 'graha'],
  ['red planet', 'mars', 'लाल ग्रह', 'मंगल', 'मंगल ग्रह', 'mangal', 'mangal grah', 'laal grah', 'lal grah'],
  ['sun', 'sunlight', 'सूर्य', 'सूरज', 'धूप', 'suraj', 'surya', 'dhoop', 'roshni'],
  ['moon', 'चंद्रमा', 'चांद', 'chanda', 'chand', 'chandrama'],
  ['earth', 'पृथ्वी', 'धरती', 'prithvi', 'dharti'],
  ['rainbow', 'इंद्रधनुष', 'इन्द्रधनुष', 'indradhanush', 'indra dhanush'],
  ['colour', 'colours', 'color', 'colors', 'रंग', 'वर्ण', 'rang', 'varna'],
  ['how many', 'many', 'count', 'total', 'kitne', 'kitna', 'kitni', 'कितने', 'कितना', 'कितनी', 'कुल', 'संख्या'],

  // History / Persons / Leaders
  ['shivaji', 'chhatrapati', 'sivaji', 'shivji', 'शिवाजी', 'छत्रपति शिवाजी', 'छत्रपति', 'chhatrapati shivaji', 'shivaji maharaj'],
  ['maratha', 'मराठा', 'marathe', 'maratha samrajya'],
  ['king', 'emperor', 'ruler', 'राजा', 'महाराज', 'सम्राट', 'शासक', 'raja', 'samrat', 'maharaja'],
  ['who', 'who was', 'who were', 'kaun', 'kon', 'kaun the', 'kon the', 'कौन', 'कौन थे', 'कौन था', 'koun'],

  // Plants & Nature
  ['plants', 'plant', 'tree', 'trees', 'पौधे', 'पौधा', 'पेड़', 'वृक्ष', 'वनस्पति', 'paudhe', 'paudha', 'ped', 'pedh', 'vriksh'],
  ['food', 'photosynthesis', 'भोजन', 'खाना', 'प्रकाश संश्लेषण', 'bhojan', 'khana'],
  ['seed', 'seeds', 'बीज', 'beej'],
  ['root', 'roots', 'जड़', 'जड़ें', 'मूल', 'jad', 'jaden', 'mool'],
  ['water', 'पानी', 'जल', 'नीर', 'paani', 'pani', 'jal'],
  ['heat', 'heated', 'warm', 'गर्म', 'गर्मी', 'ताप', 'उष्मा', 'garm', 'garam', 'tap'],
  ['evaporation', 'वाष्पीकरण', 'वाष्पन', 'vashpikaran', 'vashpan'],
  ['condensation', 'संघनन', 'sanghanan'],
  ['vapour', 'vapor', 'steam', 'वाष्प', 'भाप', 'जलवाष्प', 'vashp', 'bhaap', 'jalvashp'],
  ['droplets', 'drops', 'बूंदें', 'बूंद', 'कण', 'boond', 'boonde', 'boondein'],
  ['water cycle', 'continuous movement', 'जल चक्र', 'जलचक्र', 'jal chakra', 'jalchakra'],
  ['give', 'gives', 'देते', 'देता', 'देती', 'dete', 'deta', 'deti'],

  // Physics / Science / Mirrors / Magnets
  ['current', 'electric current', 'विद्युत', 'धारा', 'विद्युत धारा', 'bijli', 'vidyut', 'vidyut dhara'],
  ['ampere', 'amp', 'एम्पीयर', 'एम्पियर', 'ampere', 'ampiyer'],
  ['unit', 'si unit', 'मात्रक', 'इकाई', 'matrak', 'ikai', 'si matrak'],
  ['magnet', 'magnets', 'चुंबक', 'chumbak'],
  ['poles', 'pole', 'ध्रुव', 'dhruv'],
  ['repel', 'repeal', 'repels', 'repelling', 'प्रतिकर्षित', 'दूर धकेलना', 'दूर भागना', 'door'],
  ['similar', 'like poles', 'समान', 'एक जैसे', 'saman'],
  ['mirror', 'mirrors', 'दर्पण', 'शीशा', 'आईना', 'darpan', 'sheesha', 'aaina'],
  ['concave', 'अवतल', 'avtal', 'avatal'],
  ['convex', 'उत्तल', 'uttal'],
  ['difference', 'अंतर', 'भेद', 'antar', 'bhed'],
  ['vehicle', 'side mirror', 'वाहन', 'गाड़ी', 'कार', 'साइड मिरर', 'gadi', 'vahan', 'side mirror'],

  // Biology / Anatomy / Organs
  ['lungs', 'lung', 'फेफड़े', 'फेफड़ा', 'फुफ्फुस', 'phephade', 'fephde', 'fuffus'],
  ['breathe', 'breathing', 'respiration', 'सांस', 'साँस', 'श्वसन', 'saans', 'swasan'],
  ['organ', 'organs', 'अंग', 'ang'],
  ['heart', 'हृदय', 'दिल', 'hriday', 'dil'],
  ['pumps', 'pump', 'पंप', 'संचलन', 'sanchalan'],
  ['blood', 'रक्त', 'खून', 'khoon', 'rakt', 'rudhir'],
  ['blood cells', 'white blood cells', 'wbc', 'श्वेत रक्त कणिकाएं', 'श्वेत रक्त कोशिकाएं', 'रक्त कोशिकाएं', 'wbc cells'],
  ['diseases', 'disease', 'fight', 'infection', 'रोग', 'बीमारी', 'बीमारियां', 'रोगों', 'rog', 'bimari'],

  // Geography & General Knowledge
  ['capital', 'राजधानी', 'rajdhani'],
  ['india', 'भारत', 'हिंदुस्तान', 'bharat', 'hindustan'],
  ['delhi', 'new delhi', 'दिल्ली', 'नई दिल्ली', 'nayi dilli'],
  ['largest', 'biggest', 'सबसे बड़ा', 'sabse bada'],
  ['country', 'देश', 'राष्ट्र', 'desh', 'rashtra'],
  ['area', 'क्षेत्रफल', 'kshetraphal'],
  ['russia', 'रूस', 'roos'],
  ['vowels', 'vowel', 'स्वर', 'swar'],
  ['alphabet', 'letters', 'वर्णमाला', 'अक्षर', 'akshar', 'varnamala'],
  ['brain', 'computer', 'cpu', 'दिमाग', 'मस्तिष्क', 'कंप्यूटर', 'सीपीयू', 'dimag', 'mastishk'],
  ['highest', 'tallest', 'सबसे ऊंचा', 'उच्चतम', 'sabse ooncha', 'sabse uncha'],
  ['mountain', 'mountains', 'पर्वत', 'पहाड़', 'चोटी', 'parvat', 'pahad'],
  ['everest', 'mount everest', 'एवरेस्ट', 'माउंट एवरेस्ट'],
  ['continent', 'continents', 'महाद्वीप', 'mahadweep'],
  ['asia', 'एशिया', 'eshia'],

  // General Questions / Commerce
  ['buy', 'purchase', 'order', 'kharidna', 'kharid', 'खरीदना', 'खरीद', 'kharide'],
  ['price', 'cost', 'mrp', 'rate', 'कीमत', 'दाम', 'मूल्य', 'भाव', 'kitna paisa'],
  ['answer key', 'solution', 'उत्तर कुंजी', 'हल', 'answers', 'uttar punji']
];

// Build inverted concept lookup table
const conceptMap = new Map();
CONCEPT_PAIRS.forEach((group) => {
  const normGroup = group.map((w) => w.toLowerCase().trim()).filter(Boolean);
  const set = new Set(normGroup);
  normGroup.forEach((w) => {
    if (!conceptMap.has(w)) conceptMap.set(w, new Set());
    set.forEach((item) => conceptMap.get(w).add(item));
  });
});

function getConceptSynonyms(word) {
  const clean = (word || '').toLowerCase().trim();
  const set = conceptMap.get(clean);
  return set ? Array.from(set) : [];
}

/**
 * Normalizes common phonetic spelling variations across Hindi/Hinglish/English
 */
function normalizePhonetic(text) {
  if (!text) return '';
  const latin = devanagariToLatin(text);
  return latin
    .replace(/\bkaun\b/g, 'kon')
    .replace(/\bkoun\b/g, 'kon')
    .replace(/\btha\b/g, 'the')
    .replace(/\bthee\b/g, 'the')
    .replace(/\bthi\b/g, 'the')
    .replace(/\bkia\b/g, 'kya')
    .replace(/\bhe\b/g, 'hai')
    .replace(/\bh\b/g, 'hai')
    .replace(/\bhen\b/g, 'hai')
    .replace(/\bhain\b/g, 'hai')
    .replace(/\bhmen\b/g, 'hume')
    .replace(/\bhame\b/g, 'hume')
    .replace(/\bgrih\b/g, 'grah')
    .replace(/\bgraha\b/g, 'grah')
    .replace(/\bsor\b/g, 'saur')
    .replace(/\bmandl\b/g, 'mandal')
    .replace(/\bpaani\b/g, 'pani')
    .replace(/\bpedh\b/g, 'ped')
    .replace(/\bshuru\b/g, 'suru')
    .replace(/\bkonsa\b/g, 'kaunsa')
    .replace(/\bkonsi\b/g, 'kaunsa')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  devanagariToLatin,
  normalizePhonetic,
  getConceptSynonyms,
  CONCEPT_PAIRS
};
