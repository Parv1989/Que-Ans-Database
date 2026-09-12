const express = require('express');
const router = express.Router();
const Synonym = require('../models/Synonym');
const { requireAdmin } = require('../middleware/auth');
const { invalidateSynonymCache } = require('../utils/matcher');

router.use(requireAdmin);

// GET /api/admin/synonyms
router.get('/', async (req, res) => {
  const items = await Synonym.find().sort({ createdAt: -1 });
  res.json(items);
});

// POST /api/admin/synonyms  { words: ["price","cost","rate"] }
router.post('/', async (req, res) => {
  try {
    const { words } = req.body;
    if (!Array.isArray(words) || words.length < 2) {
      return res.status(400).json({ error: 'Give at least 2 words that mean the same thing' });
    }
    const doc = await Synonym.create({ words });
    invalidateSynonymCache();
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Could not save this synonym group' });
  }
});

// PUT /api/admin/synonyms/:id
router.put('/:id', async (req, res) => {
  try {
    const { words } = req.body;
    const doc = await Synonym.findByIdAndUpdate(req.params.id, { words }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Group not found' });
    invalidateSynonymCache();
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Could not update this group' });
  }
});

// DELETE /api/admin/synonyms/:id
router.delete('/:id', async (req, res) => {
  const doc = await Synonym.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Group not found' });
  invalidateSynonymCache();
  res.json({ deleted: true });
});

module.exports = router;
