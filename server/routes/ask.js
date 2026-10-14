const express = require('express');
const router = express.Router();
const QA = require('../models/QA');
const QueryLog = require('../models/QueryLog');
const { findAnswer, getHierarchy } = require('../utils/matcher');

// GET /api/ask/hierarchy - returns dynamic Class -> Book -> Chapter structure for dropdowns
router.get('/hierarchy', async (req, res) => {
  try {
    const hierarchy = await getHierarchy();
    res.json(hierarchy);
  } catch (err) {
    console.error('hierarchy error:', err);
    res.status(500).json({ error: 'Could not fetch class/book hierarchy' });
  }
});

// GET /api/ask/worksheet-questions - returns questions for printable worksheet generation
router.get('/worksheet-questions', async (req, res) => {
  try {
    const { className, bookName, chapterName } = req.query;
    const query = {};

    if (className && className.trim().toLowerCase() !== 'all' && className.trim().toLowerCase() !== 'all classes') {
      query.className = new RegExp('^' + className.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    }
    if (bookName && bookName.trim().toLowerCase() !== 'all' && bookName.trim().toLowerCase() !== 'all books') {
      query.bookName = new RegExp('^' + bookName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    }
    if (chapterName && chapterName.trim().toLowerCase() !== 'all' && chapterName.trim().toLowerCase() !== 'all chapters') {
      query.chapterName = new RegExp('^' + chapterName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    }

    const questions = await QA.find(query)
      .select('question answer imageUrl questionImageUrl className bookName chapterName')
      .lean();

    res.json({
      total: questions.length,
      questions
    });
  } catch (err) {
    console.error('worksheet questions error:', err);
    res.status(500).json({ error: 'Could not fetch worksheet questions' });
  }
});

// POST /api/ask  { question: "...", className: "...", bookName: "...", chapterName: "..." }
router.post('/', async (req, res) => {
  try {
    const { question, className, bookName, chapterName } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const filters = { className, bookName, chapterName };
    const result = await findAnswer(question.trim(), filters);

    // Fire-and-forget query logging for analytics and unanswered query tracking
    QueryLog.create({
      query: question.trim(),
      answered: !!result.match,
      confidence: result.confidence || 0,
      matchedQA: result.match ? result.match._id : null,
      matchedQuestion: result.match ? result.match.question : '',
      className: filters.className || 'All Classes',
      bookName: filters.bookName || 'All Books',
      chapterName: filters.chapterName || 'All Chapters'
    }).catch((logErr) => console.warn('QueryLog create warning:', logErr.message));

    if (result.match) {
      return res.json({
        answered: true,
        answer: result.match.answer,
        matchedQuestion: result.match.question,
        className: result.match.className,
        bookName: result.match.bookName,
        chapterName: result.match.chapterName,
        imageUrl: result.match.imageUrl || '',
        confidence: result.confidence
      });
    }

    return res.json({
      answered: false,
      message: result.message || "I couldn't find an exact answer for that. Please explain or rephrase your question in more detail.",
      clarificationNeeded: !!result.clarificationNeeded,
      suggestions: result.suggestions,
      confidence: result.confidence
    });
  } catch (err) {
    console.error('ask error:', err);
    res.status(500).json({ error: 'Something went wrong, please try again' });
  }
});

// POST /api/ask/ai-explain - AI fallback or "explain simply" powered by Gemini
router.post('/ai-explain', async (req, res) => {
  try {
    const { question, answer, className, bookName, chapterName } = req.body;
    if (!question && !answer) {
      return res.status(400).json({ error: 'Question or answer is required' });
    }

    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Re-read .env dynamically in case it was updated while server was running
      const path = require('path');
      require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });
      apiKey = process.env.GEMINI_API_KEY;
    }

    if (!apiKey) {
      return res.json({
        available: false,
        message: 'AI Tutor is in preview mode. Please add GEMINI_API_KEY in Render Environment Variables (or server/.env for local).'
      });
    }

    let promptText = '';
    if (answer) {
      promptText = `You are "Study Buddy AI", an encouraging, friendly, kind school tutor for children.
Grade/Class: ${className || 'Elementary / Middle School'}
Subject/Book: ${bookName || 'General'}
Chapter: ${chapterName || 'General'}
Original Question: ${question || ''}
Original Answer: ${answer}

Task: Explain this answer in very simple, conversational language that a child can easily understand. Include a short, relatable real-world example or analogy.
If in Hindi/Hinglish, reply in warm Hindi/Hinglish. If in English, reply in friendly English. Keep response under 80 words.`;
    } else {
      promptText = `You are "Study Buddy AI", a kind and helpful school tutor for children.
Grade/Class: ${className || 'Elementary / Middle School'}
Subject/Book: ${bookName || 'General'}
Chapter: ${chapterName || 'General'}
Student Question: ${question}

Task: Answer this student's question accurately and simply for their grade level. Keep the answer clear, positive, and under 80 words.
If the question is in Hindi/Hinglish, reply in warm Hindi/Hinglish. If in English, reply in friendly English.`;
    }

    // Try high-availability models with automatic fallback if Google has traffic spikes (503/429)
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
    let explanation = '';

    for (const model of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          explanation = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (explanation) break;
        } else {
          const errData = await response.json().catch(() => ({}));
          console.warn(`Gemini model ${model} status ${response.status}:`, errData?.error?.message);
        }
      } catch (callErr) {
        console.warn(`Error calling model ${model}:`, callErr.message);
      }
    }

    if (!explanation) {
      return res.json({
        available: false,
        message: 'AI Tutor is temporarily busy. Please try asking again in a few seconds.'
      });
    }

    res.json({
      available: true,
      explanation: explanation.trim()
    });
  } catch (err) {
    console.error('ai-explain error:', err);
    res.status(500).json({ error: 'AI explanation failed: ' + err.message });
  }
});

module.exports = router;

