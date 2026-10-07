const express = require('express');
const router = express.Router();
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
