const QA = require('../models/QA');
const Synonym = require('../models/Synonym');
const { devanagariToLatin, normalizePhonetic, getConceptSynonyms } = require('./transliterate');
const { checkGreeting, stripGreetingPrefix } = require('./greetingHandler');

// Common filler words (English + Hinglish + Hindi) that add noise to matching.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'do', 'does', 'did', 'to', 'of', 'in', 'on', 'for', 'and', 'or',
  'i', 'you', 'we', 'my', 'your', 'me', 'it', 'this', 'that',
  'please', 'tell', 'know', 'want', 'can', 'how', 'what', 'kya',
  'hai', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'aur', 'hi',
  'h', 'pls', 'plz', 'sir', 'mam', 'madam', 'give', 'detail', 'explain',
  // Devanagari Hindi common stopwords
  'का', 'की', 'के', 'को', 'से', 'में', 'ने', 'पर', 'है', 'हैं', 'था', 'थी', 'थे',
  'हो', 'हुए', 'हुआ', 'हुई', 'और', 'या', 'भी', 'ही', 'तो', 'कृपया', 'बताओ', 'बताएं',
  'बताइए', 'मुझे', 'हमें', 'क्या', 'कौन', 'कहाँ', 'कैसे'
]);

const CACHE_TTL_MS = 60 * 1000; // refresh every minute

// In-memory cache of synonym groups so every request doesn't hit the DB.
let synonymCache = null;
let synonymCacheAt = 0;

async function getSynonymMap() {
  const now = Date.now();
  if (synonymCache && now - synonymCacheAt < CACHE_TTL_MS) {
    return synonymCache;
  }
  const groups = await Synonym.find().lean();
  const map = new Map(); // word -> Set of all words in its group (including itself)
  for (const group of groups) {
    const words = group.words || [];
    const wordSet = new Set(words.map(w => w.toLowerCase().trim()));
    for (const w of words) {
      map.set(w.toLowerCase().trim(), wordSet);
    }
  }
  synonymCache = map;
  synonymCacheAt = now;
  return map;
}

function invalidateSynonymCache() {
  synonymCache = null;
}

// In-memory cache of QA documents & token index to avoid querying DB per request
let qaCache = null;
let qaCacheAt = 0;
let cachedDocTokens = null;
let cachedVocabSet = null;

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ') // strip punctuation, keep unicode letters, marks (matras), numbers
    .split(/\s+/)
    .filter((tok) => tok.length > 1 && !STOPWORDS.has(tok));
}

// Strict Levenshtein distance for typos - NEVER matches words with large length differences
function levenshtein(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Corrects genuine small typos without corrupting valid short English/Hindi words.
 * Short words (<= 4 chars like 'tree', 'hole', 'moon') are NEVER auto-corrected.
 */
function correctToken(token, vocabSet) {
  if (vocabSet.has(token)) return token;
  // If token is short (<= 4 chars), keep it intact to avoid turning 'tree' into 'between' or 'hole' into 'poles'
  if (token.length <= 4) return token;

  let bestCandidate = token;
  let minDistance = 99;

  for (const word of vocabSet) {
    if (Math.abs(word.length - token.length) > 1) continue;
    const dist = levenshtein(token, word);
    // Allow edit distance of 1 only for words length >= 5
    if (dist <= 1 && dist < minDistance) {
      minDistance = dist;
      bestCandidate = word;
    }
  }

  return minDistance <= 1 ? bestCandidate : token;
}

async function getQADataset() {
  const now = Date.now();
  if (qaCache && (now - qaCacheAt < CACHE_TTL_MS)) {
    return { allQA: qaCache, docTokens: cachedDocTokens, vocabSet: cachedVocabSet };
  }

  const allQA = await QA.find().lean();
  const docTokens = allQA.map((doc) => {
    const rawTokens = tokenize(doc.question);
    const transTokens = tokenize(devanagariToLatin(doc.question));
    const phoneticQ = normalizePhonetic(doc.question);

    // Build question token set with transliteration & concept synonyms
    const qTokensSet = new Set([...rawTokens, ...transTokens]);
    for (const t of [...rawTokens, ...transTokens]) {
      const syns = getConceptSynonyms(t);
      syns.forEach((s) => {
        tokenize(s).forEach((p) => qTokensSet.add(p));
        tokenize(devanagariToLatin(s)).forEach((p) => qTokensSet.add(p));
      });
    }

    // Build allTokens set (question + keywords + concepts + transliterations)
    const allTokensSet = new Set(qTokensSet);
    const kwText = (doc.keywords || []).join(' ');
    const kwTokens = tokenize(kwText);
    const kwTransTokens = tokenize(devanagariToLatin(kwText));
    for (const kt of [...kwTokens, ...kwTransTokens]) {
      allTokensSet.add(kt);
      const syns = getConceptSynonyms(kt);
      syns.forEach((s) => {
        tokenize(s).forEach((p) => allTokensSet.add(p));
        tokenize(devanagariToLatin(s)).forEach((p) => allTokensSet.add(p));
      });
    }

    return {
      doc,
      phoneticQ,
      qTokens: qTokensSet,
      allTokens: allTokensSet
    };
  });

  const vocabSet = new Set();
  for (const { allTokens } of docTokens) {
    for (const t of allTokens) vocabSet.add(t);
  }

  qaCache = allQA;
  cachedDocTokens = docTokens;
  cachedVocabSet = vocabSet;
  qaCacheAt = now;

  return { allQA, docTokens, vocabSet };
}

function invalidateQACache() {
  qaCache = null;
}

async function expandQuery(rawQuery, vocabSet) {
  const rawTokens = tokenize(rawQuery);
  const transTokens = tokenize(devanagariToLatin(rawQuery));
  const combinedRaw = Array.from(new Set([...rawTokens, ...transTokens]));

  const correctedTokens = combinedRaw.map((t) => correctToken(t, vocabSet));
  const synonymMap = await getSynonymMap();

  const expanded = new Set(correctedTokens);
  for (const tok of correctedTokens) {
    // 1. Synonyms from database
    const group = synonymMap.get(tok);
    if (group) {
      for (const syn of group) {
        tokenize(syn).forEach((p) => expanded.add(p));
      }
    }

    // 2. Bilingual Concept Synonyms (English <-> Hindi <-> Hinglish)
    const conceptSyns = getConceptSynonyms(tok);
    for (const cs of conceptSyns) {
      tokenize(cs).forEach((p) => expanded.add(p));
      tokenize(devanagariToLatin(cs)).forEach((p) => expanded.add(p));
    }
  }

  // Also check concept synonyms for the full trimmed query phrase
  const fullConceptSyns = getConceptSynonyms(rawQuery.trim());
  for (const fcs of fullConceptSyns) {
    tokenize(fcs).forEach((p) => expanded.add(p));
    tokenize(devanagariToLatin(fcs)).forEach((p) => expanded.add(p));
  }

  return { rawTokens, correctedTokens, expandedTokens: Array.from(expanded) };
}

/**
 * Finds the best matching QA entry for a student's question.
 * Filters by className, bookName, and chapterName if provided.
 * Enforces strict educational accuracy: NO false guesses on unrelated or vague questions.
 * Handles zero-AI cross-lingual question matching (English <-> Hindi <-> Hinglish).
 */
async function findAnswer(rawQuery, filters = {}) {
  // 0. Greeting check: If user sends "Hi", "Hello", "How are you?", "Kaise ho?", etc.
  const greeting = checkGreeting(rawQuery);
  if (greeting) {
    return {
      match: null,
      isGreeting: true,
      greetingReply: greeting.reply,
      category: greeting.category,
      confidence: 100,
      suggestions: []
    };
  }

  // If query is an educational question prefixed with a greeting ("Hi, what is photosynthesis?"), clean it
  const effectiveQuery = stripGreetingPrefix(rawQuery);

  const { allQA, docTokens, vocabSet } = await getQADataset();
  if (!allQA || allQA.length === 0) {
    return { match: null, confidence: 0, suggestions: [] };
  }

  const isHindiQuery = /[\u0900-\u097F]/.test(effectiveQuery);

  // Filter docTokens by className, bookName, chapterName if provided
  const targetClassName = (filters.className || '').trim();
  const targetBookName = (filters.bookName || '').trim();
  const targetChapterName = (filters.chapterName || '').trim();

  const filteredDocTokens = docTokens.filter(({ doc }) => {
    if (targetClassName && targetClassName.toLowerCase() !== 'all' && targetClassName.toLowerCase() !== 'all classes') {
      const docClass = (doc.className || '').trim();
      if (docClass && docClass.toLowerCase() !== 'all classes' && docClass.toLowerCase() !== targetClassName.toLowerCase()) {
        return false;
      }
    }
    if (targetBookName && targetBookName.toLowerCase() !== 'all' && targetBookName.toLowerCase() !== 'all books') {
      const docBook = (doc.bookName || '').trim();
      if (docBook && docBook.toLowerCase() !== 'all books' && docBook.toLowerCase() !== targetBookName.toLowerCase()) {
        return false;
      }
    }
    if (targetChapterName && targetChapterName.toLowerCase() !== 'all' && targetChapterName.toLowerCase() !== 'all chapters') {
      const docChap = (doc.chapterName || '').trim();
      if (docChap && docChap.toLowerCase() !== 'all chapters' && docChap.toLowerCase() !== targetChapterName.toLowerCase()) {
        return false;
      }
    }
    return true;
  });

  const candidateDocs = filteredDocTokens.length > 0 ? filteredDocTokens : docTokens;

  // 1. Direct Exact Normalized Match check
  const normQuery = normalizeText(effectiveQuery);
  if (normQuery) {
    const exactMatch = candidateDocs.find(({ doc }) => normalizeText(doc.question) === normQuery)
      || docTokens.find(({ doc }) => normalizeText(doc.question) === normQuery);
    if (exactMatch) {
      QA.findByIdAndUpdate(exactMatch.doc._id, { $inc: { hitCount: 1 } }).catch(() => {});
      return {
        match: {
          _id: exactMatch.doc._id,
          question: exactMatch.doc.question,
          answer: exactMatch.doc.answer,
          detailedAnswer: exactMatch.doc.detailedAnswer || '',
          className: exactMatch.doc.className,
          bookName: exactMatch.doc.bookName,
          chapterName: exactMatch.doc.chapterName,
          imageUrl: exactMatch.doc.imageUrl
        },
        confidence: 100,
        suggestions: []
      };
    }
  }

  // 2. Direct Phonetic & Transliteration Match (Zero-AI: Hindi <-> Hinglish <-> English)
  // Handles: 'shivaji kon the?' <-> 'शिवाजी कौन थे?', 'ped hume kya dete h' <-> 'पेड़ हमें क्या देते हैं?', etc.
  const queryPhonetic = normalizePhonetic(effectiveQuery);
  if (queryPhonetic) {
    const phoneticMatch = candidateDocs.find((d) => d.phoneticQ === queryPhonetic)
      || docTokens.find((d) => d.phoneticQ === queryPhonetic);
    if (phoneticMatch) {
      QA.findByIdAndUpdate(phoneticMatch.doc._id, { $inc: { hitCount: 1 } }).catch(() => {});
      return {
        match: {
          _id: phoneticMatch.doc._id,
          question: phoneticMatch.doc.question,
          answer: phoneticMatch.doc.answer,
          detailedAnswer: phoneticMatch.doc.detailedAnswer || '',
          className: phoneticMatch.doc.className,
          bookName: phoneticMatch.doc.bookName,
          chapterName: phoneticMatch.doc.chapterName,
          imageUrl: phoneticMatch.doc.imageUrl
        },
        confidence: 100,
        suggestions: []
      };
    }
  }

  const { correctedTokens, expandedTokens } = await expandQuery(effectiveQuery, vocabSet);

  // If query had only stopwords or symbols
  if (correctedTokens.length === 0) {
    return {
      match: null,
      confidence: 0,
      clarificationNeeded: true,
      message: isHindiQuery
        ? 'कृपया अपना प्रश्न थोड़ा और स्पष्ट या विस्तार से बताएं, ताकि सही उत्तर मिल सके।'
        : 'Please explain or ask your question in a bit more detail so I can give you an accurate answer.',
      suggestions: []
    };
  }

  // 3. Handling single-token queries (e.g. "shivaji", "tree", "vowels")
  if (correctedTokens.length === 1) {
    const singleWord = correctedTokens[0];
    const candidateHits = candidateDocs.filter((d) => d.allTokens.has(singleWord));

    // If this unique single term unambiguously matches exactly one QA document in the book, answer it directly!
    if (candidateHits.length === 1) {
      const singleMatch = candidateHits[0];
      QA.findByIdAndUpdate(singleMatch.doc._id, { $inc: { hitCount: 1 } }).catch(() => {});
      return {
        match: {
          _id: singleMatch.doc._id,
          question: singleMatch.doc.question,
          answer: singleMatch.doc.answer,
          detailedAnswer: singleMatch.doc.detailedAnswer || '',
          className: singleMatch.doc.className,
          bookName: singleMatch.doc.bookName,
          chapterName: singleMatch.doc.chapterName,
          imageUrl: singleMatch.doc.imageUrl
        },
        confidence: 90,
        suggestions: []
      };
    }

    const explanationMsg = isHindiQuery
      ? `आपका प्रश्न "${effectiveQuery}" काफ़ी छोटा या अधूरा है। कृपया प्रश्न को थोड़ा और विस्तार से बताएं (जैसे: इसके बारे में आप क्या जानना चाहते हैं?) ताकि सही उत्तर मिल सके।`
      : `Your question "${effectiveQuery}" is too brief or incomplete. Please explain your question in a bit more detail (for example, what you'd like to know about it) so I can give you an accurate answer.`;

    return {
      match: null,
      confidence: 0,
      clarificationNeeded: true,
      message: explanationMsg,
      suggestions: candidateHits.slice(0, 3).map((c) => ({ _id: c.doc._id, question: c.doc.question }))
    };
  }

  // 4. Bi-directional Precision & Recall Scoring for Multi-Token Queries
  function scoreList(list) {
    return list.map(({ doc, qTokens, allTokens }) => {
      let qHits = 0;
      let allHits = 0;
      for (const qt of expandedTokens) {
        if (qTokens.has(qt)) qHits += 1;
        if (allTokens.has(qt)) allHits += 1;
      }

      // Check which of the student's original query concepts had at least one match in the doc
      let studentTokensMatched = 0;
      for (const st of correctedTokens) {
        const tokenExpansions = new Set([st, devanagariToLatin(st)]);
        const syns = getConceptSynonyms(st);
        syns.forEach((s) => {
          tokenize(s).forEach((p) => tokenExpansions.add(p));
          tokenize(devanagariToLatin(s)).forEach((p) => tokenExpansions.add(p));
        });

        let hasHit = false;
        for (const te of tokenExpansions) {
          if (allTokens.has(te)) {
            hasHit = true;
            break;
          }
        }
        if (hasHit) studentTokensMatched += 1;
      }

      // Query coverage: fraction of student query tokens matched in question/keywords/concepts
      const queryCoverage = studentTokensMatched / Math.max(1, correctedTokens.length);
      // Question coverage: fraction of saved question tokens matched
      const qTokenCount = Math.max(1, qTokens.size);
      const questionCoverage = Math.min(1.0, qHits / qTokenCount);

      // Combined score giving 70% weight to query coverage and 30% to question coverage
      const combinedScore = (queryCoverage * 0.70) + (questionCoverage * 0.30);

      return {
        doc,
        allHits,
        qHits,
        studentTokensMatched,
        queryCoverage,
        combinedScore
      };
    }).sort((a, b) => b.combinedScore - a.combinedScore || b.allHits - a.allHits);
  }

  let scored = scoreList(candidateDocs);
  let best = scored[0];

  // Fall back to global search if filtered subset has no match
  if ((!best || best.allHits < 2 || best.queryCoverage < 0.60) && filteredDocTokens.length > 0) {
    const globalScored = scoreList(docTokens);
    if (globalScored[0] && globalScored[0].allHits >= 2 && globalScored[0].queryCoverage >= 0.60) {
      scored = globalScored;
      best = scored[0];
    }
  }

  const confidence = best ? Math.min(100, Math.round(best.combinedScore * 100)) : 0;

  // Strict Educational Accuracy Rules:
  // - Must match at least 2 tokens (or 100% of tokens if query length is 2)
  // - Query coverage must be >= 60%
  // - Confidence must be >= 60%
  const minHitsNeeded = Math.min(2, correctedTokens.length);
  const isValidMatch = best && best.allHits >= minHitsNeeded && best.queryCoverage >= 0.60 && confidence >= 60;

  if (isValidMatch) {
    QA.findByIdAndUpdate(best.doc._id, { $inc: { hitCount: 1 } }).catch(() => {});
    return {
      match: {
        _id: best.doc._id,
        question: best.doc.question,
        answer: best.doc.answer,
        detailedAnswer: best.doc.detailedAnswer || '',
        className: best.doc.className,
        bookName: best.doc.bookName,
        chapterName: best.doc.chapterName,
        imageUrl: best.doc.imageUrl
      },
      confidence,
      suggestions: scored
        .slice(1, 4)
        .filter((s) => s.allHits > 0)
        .map((s) => ({ _id: s.doc._id, question: s.doc.question }))
    };
  }

  // Not a confident match: Ask user to explain/rephrase or use AI Tutor
  const notFoundMessage = isHindiQuery
    ? 'यह प्रश्न हमारी पुस्तक के डेटाबेस में ठीक से मैच नहीं हुआ। कृपया अपने प्रश्न को थोड़ा और विस्तार से समझाएं, या नीचे "Ask AI Tutor" पर क्लिक करें।'
    : "I couldn't find an exact answer for this in our book. Please explain or rephrase your question in more detail, or click 'Ask AI Tutor' below for a live explanation.";

  return {
    match: null,
    confidence,
    clarificationNeeded: false,
    message: notFoundMessage,
    suggestions: scored
      .filter((s) => s.allHits >= 1 && s.queryCoverage >= 0.35)
      .slice(0, 3)
      .map((s) => ({ _id: s.doc._id, question: s.doc.question }))
  };
}

/**
 * Builds dynamic hierarchy of classes -> books -> chapters for cascading dropdowns
 */
async function getHierarchy() {
  const { allQA } = await getQADataset();
  const hierarchy = {}; // className -> { bookName -> Set(chapterName) }

  (allQA || []).forEach((doc) => {
    const c = (doc.className || 'General').trim();
    const b = (doc.bookName || 'General').trim();
    const ch = (doc.chapterName || 'General').trim();

    if (!hierarchy[c]) hierarchy[c] = {};
    if (!hierarchy[c][b]) hierarchy[c][b] = new Set();
    hierarchy[c][b].add(ch);
  });

  // Convert sets to arrays
  const formatted = {};
  Object.keys(hierarchy).sort().forEach((cls) => {
    formatted[cls] = {};
    Object.keys(hierarchy[cls]).sort().forEach((bk) => {
      formatted[cls][bk] = Array.from(hierarchy[cls][bk]).sort();
    });
  });

  return formatted;
}

module.exports = { findAnswer, getHierarchy, expandQuery, tokenize, invalidateSynonymCache, invalidateQACache, checkGreeting, stripGreetingPrefix };

