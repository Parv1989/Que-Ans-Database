const express = require('express');
const router = express.Router();
const { findAnswer } = require('../utils/matcher');

// POST /api/ask  { question: "..." }
router.post('/', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const result = await findAnswer(question.trim());

    if (result.match) {
      return res.json({
        answered: true,
        answer: result.match.answer,
        matchedQuestion: result.match.question,
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
