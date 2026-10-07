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
        confidence: result.confidence
      });
    }

    return res.json({
      answered: false,
      message: "Mujhe iska exact answer nahi mila. Kya aapka sawaal in me se kisi se milta hai?",
      suggestions: result.suggestions,
      confidence: result.confidence
    });
  } catch (err) {
    console.error('ask error:', err);
    res.status(500).json({ error: 'Something went wrong, please try again' });
  }
});

module.exports = router;
