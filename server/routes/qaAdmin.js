const express = require('express');
const router = express.Router();
const QA = require('../models/QA');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/qa  - list all, newest first, optional ?search=
router.get('/', async (req, res) => {
  const { search } = req.query;
  const filter = search
    ? { $or: [
        { question: { $regex: search, $options: 'i' } },
        { keywords: { $regex: search, $options: 'i' } }
      ] }
    : {};
  const items = await QA.find(filter).sort({ createdAt: -1 });
  res.json(items);
});

// POST /api/admin/qa  { question, answer, keywords[], category }
router.post('/', async (req, res) => {
  try {
    const { question, answer, keywords = [], category } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are both required' });
    }
    const doc = await QA.create({
      question: question.trim(),
      answer: answer.trim(),
      keywords: keywords.map((k) => k.trim()).filter(Boolean),
      category: category ? category.trim() : 'general'
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Could not save this entry' });
  }
});

// PUT /api/admin/qa/:id
router.put('/:id', async (req, res) => {
  try {
    const { question, answer, keywords, category } = req.body;
    const update = {};
    if (question !== undefined) update.question = question.trim();
    if (answer !== undefined) update.answer = answer.trim();
    if (keywords !== undefined) update.keywords = keywords.map((k) => k.trim()).filter(Boolean);
    if (category !== undefined) update.category = category.trim();

    const doc = await QA.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'Entry not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Could not update this entry' });
  }
});

// DELETE /api/admin/qa/:id
router.delete('/:id', async (req, res) => {
  const doc = await QA.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Entry not found' });
  res.json({ deleted: true });
});

module.exports = router;
