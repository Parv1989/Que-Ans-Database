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

// In-memory cache of QA documents & Fuse vocabulary index to avoid querying DB per request
let qaCache = null;
let qaCacheAt = 0;
let cachedDocTokens = null;
let cachedVocabFuse = null;
let cachedVocabSet = null;

async function getQADataset() {
  const now = Date.now();
  if (qaCache && (now - qaCacheAt < CACHE_TTL_MS)) {
    return { allQA: qaCache, docTokens: cachedDocTokens, vocabFuse: cachedVocabFuse, vocabSet: cachedVocabSet };
  }

  const allQA = await QA.find().lean();
  const docTokens = allQA.map((doc) => ({
    doc,
    tokens: new Set(tokenize([doc.question, ...(doc.keywords || []), doc.category].join(' ')))
  }));

  const vocabSet = new Set();
  for (const { tokens } of docTokens) {
    for (const t of tokens) vocabSet.add(t);
  }
  const vocabList = Array.from(vocabSet);
  const vocabFuse = new Fuse(vocabList, { includeScore: true, threshold: 0.3 });

  qaCache = allQA;
  cachedDocTokens = docTokens;
  cachedVocabFuse = vocabFuse;
  cachedVocabSet = vocabSet;
  qaCacheAt = now;

  return { allQA, docTokens, vocabFuse, vocabSet };
}

function invalidateQACache() {
  qaCache = null;
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
 * Filters by className, bookName, and chapterName if provided.
 */
async function findAnswer(rawQuery, filters = {}) {
  const { allQA, docTokens, vocabFuse, vocabSet } = await getQADataset();
  if (!allQA || allQA.length === 0) {
    return { match: null, confidence: 0, suggestions: [] };
  }

  const { correctedTokens, expandedTokens } = await expandQuery(rawQuery, vocabFuse, vocabSet);

  if (expandedTokens.length === 0) {
    return { match: null, confidence: 0, suggestions: [] };
  }

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

  // Base scoring on original query tokens length so synonym expansion doesn't dilute accuracy
  const queryTokensCount = Math.max(1, correctedTokens.length);

  // Score each candidate doc by how many (synonym-expanded) query tokens it contains
  const scored = candidateDocs.map(({ doc, tokens }) => {
    let hits = 0;
    for (const qt of expandedTokens) {
      if (tokens.has(qt)) hits += 1;
    }
    const score = hits / queryTokensCount;
    return { doc, score, hits };
  });

  scored.sort((a, b) => b.score - a.score || b.hits - a.hits);

  const best = scored[0];
  const confidence = Math.min(100, Math.round(best.score * 100));
  const CONFIDENCE_THRESHOLD = 35; // at least 35% keyword overlap with query tokens

  if (best && best.hits > 0 && confidence >= CONFIDENCE_THRESHOLD) {
    // Fire and forget hit count increment
    QA.findByIdAndUpdate(best.doc._id, { $inc: { hitCount: 1 } }).catch(() => {});
    return {
      match: {
        _id: best.doc._id,
        question: best.doc.question,
        answer: best.doc.answer,
        className: best.doc.className,
        bookName: best.doc.bookName,
        chapterName: best.doc.chapterName,
        imageUrl: best.doc.imageUrl
      },
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

module.exports = { findAnswer, getHierarchy, expandQuery, tokenize, invalidateSynonymCache, invalidateQACache };
