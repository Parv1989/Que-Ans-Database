const express = require('express');
const router = express.Router();
const QA = require('../models/QA');
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
      message: "I couldn't find an exact answer for that. Did you mean one of these questions?",
      suggestions: result.suggestions,
      confidence: result.confidence
    });
  } catch (err) {
    console.error('ask error:', err);
    res.status(500).json({ error: 'Something went wrong, please try again' });
  }
});

module.exports = router;
