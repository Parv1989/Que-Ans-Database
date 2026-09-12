const Fuse = require('fuse.js');
const QA = require('../models/QA');
const Synonym = require('../models/Synonym');

// Common filler words (English + Hinglish) that add noise to matching.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'do', 'does', 'did', 'to', 'of', 'in', 'on', 'for', 'and', 'or',
  'i', 'you', 'we', 'my', 'your', 'me', 'it', 'this', 'that',
  'please', 'tell', 'know', 'want', 'can', 'how', 'what', 'kya',
  'hai', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'aur', 'hi',
  'h', 'pls', 'plz', 'sir', 'mam', 'madam'
]);

// In-memory cache of synonym groups so every request doesn't hit the DB.
let synonymCache = null;
let synonymCacheAt = 0;
const CACHE_TTL_MS = 60 * 1000; // refresh every minute

async function getSynonymMap() {
  const now = Date.now();
  if (synonymCache && now - synonymCacheAt < CACHE_TTL_MS) {
    return synonymCache;
  }
  const groups = await Synonym.find().lean();
  const map = new Map(); // word -> Set of all words in its group (including itself)
  for (const group of groups) {
    const words = group.words || [];
    const wordSet = new Set(words);
    for (const w of words) {
      map.set(w, wordSet);
    }
  }
  synonymCache = map;
  synonymCacheAt = now;
  return map;
}

function invalidateSynonymCache() {
  synonymCache = null;
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // strip punctuation, keep unicode letters/numbers
    .split(/\s+/)
    .filter((tok) => tok.length > 1 && !STOPWORDS.has(tok));
}

/**
 * Corrects small typos in query tokens by snapping them to the closest known
 * word in the saved questions/keywords, e.g. "buk" -> "book", "pric" -> "price".
 * Only applies when a genuinely close match exists, so unrelated words are
 * left alone (they might be typo'd but that's fine, they just won't correct).
 */
function correctToken(token, vocabFuse, vocabSet) {
  if (vocabSet.has(token)) return token;
  const results = vocabFuse.search(token);
  if (results.length > 0 && results[0].score <= 0.3) {
    return results[0].item;
  }
  return token;
}

async function expandQuery(rawQuery, vocabFuse, vocabSet) {
  const rawTokens = tokenize(rawQuery);
  const correctedTokens = rawTokens.map((t) => correctToken(t, vocabFuse, vocabSet));
  const synonymMap = await getSynonymMap();

  const expanded = new Set(correctedTokens);
  for (const tok of correctedTokens) {
    const group = synonymMap.get(tok);
    if (group) {
      for (const syn of group) expanded.add(syn);
    }
  }
  return { rawTokens, correctedTokens, expandedTokens: Array.from(expanded) };
}

/**
 * Finds the best matching QA entry for a student's question.
 * Uses token-overlap scoring (query tokens vs each answer's vocabulary,
 * after typo-correction and synonym expansion) rather than raw fuzzy string
 * distance, which holds up much better on short, keyword-style questions.
 */
async function findAnswer(rawQuery) {
  const allQA = await QA.find().lean();
  if (allQA.length === 0) {
    return { match: null, confidence: 0, suggestions: [] };
  }

  // Per-doc token set, built from its question + keywords + category.
  const docTokens = allQA.map((doc) => ({
    doc,
    tokens: new Set(tokenize([doc.question, ...(doc.keywords || []), doc.category].join(' ')))
  }));

  // Vocabulary of every word used anywhere, used for typo correction.
  const vocabSet = new Set();
  for (const { tokens } of docTokens) {
    for (const t of tokens) vocabSet.add(t);
  }
  const vocabList = Array.from(vocabSet);
  const vocabFuse = new Fuse(vocabList, { includeScore: true, threshold: 0.3 });

  const { expandedTokens } = await expandQuery(rawQuery, vocabFuse, vocabSet);

  if (expandedTokens.length === 0) {
    return { match: null, confidence: 0, suggestions: [] };
  }

  // Score each doc by how many (synonym-expanded) query tokens it contains,
  // normalized against the number of meaningful query tokens.
  const scored = docTokens.map(({ doc, tokens }) => {
    let hits = 0;
    for (const qt of expandedTokens) {
      if (tokens.has(qt)) hits += 1;
    }
    const score = hits / expandedTokens.length;
    return { doc, score, hits };
  });

  scored.sort((a, b) => b.score - a.score || b.hits - a.hits);

  const best = scored[0];
  const confidence = Math.round(best.score * 100);
  const CONFIDENCE_THRESHOLD = 40; // at least 40% of the query's meaningful words matched

  if (best.hits > 0 && confidence >= CONFIDENCE_THRESHOLD) {
    await QA.findByIdAndUpdate(best.doc._id, { $inc: { hitCount: 1 } });
    return {
      match: { _id: best.doc._id, question: best.doc.question, answer: best.doc.answer },
      confidence,
      suggestions: scored
        .slice(1, 4)
        .filter((s) => s.hits > 0)
        .map((s) => ({ _id: s.doc._id, question: s.doc.question }))
    };
  }

  return {
    match: null,
    confidence,
    suggestions: scored
      .slice(0, 3)
      .filter((s) => s.hits > 0)
      .map((s) => ({ _id: s.doc._id, question: s.doc.question }))
  };
}

module.exports = { findAnswer, expandQuery, tokenize, invalidateSynonymCache };
