const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const router = express.Router();
const QA = require('../models/QA');
const { requireAdmin } = require('../middleware/auth');
const { invalidateQACache } = require('../utils/matcher');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAdmin);

// GET /api/admin/qa/sample-csv - downloadable template
router.get('/sample-csv', (req, res) => {
  const sample =
    'question,answer,keywords,category,className,bookName,chapterName,imageUrl\n' +
    '"Where does King Vikram live?","King Vikram lived in Ujjain.","vikram;king vikram;ujjain",history,"Class 3","Ripples","Chapter 4","Que1.png"\n' +
    '"What is photosynthesis?","Photosynthesis is the process by which green plants make food using sunlight.","sunlight;plants food;chlorophyll",science,"Class 4","Science Explorer","Chapter 2",""\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="qa-template.csv"');
  res.send(sample);
});

// POST /api/admin/qa/bulk-upload  (multipart form field name: "file")
router.post('/bulk-upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file received' });
  }

  let records;
  try {
    records = parse(req.file.buffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
  } catch (err) {
    return res.status(400).json({ error: 'Could not read this CSV file: ' + err.message });
  }

  const toInsert = [];
  const skipped = [];

  records.forEach((row, idx) => {
    const question = (row.question || '').trim();
    const answer = (row.answer || '').trim();
    if (!question || !answer) {
      skipped.push({ row: idx + 2, reason: 'Missing question or answer' }); // +2: header row + 1-index
      return;
    }
    const keywords = (row.keywords || '')
      .split(';')
      .map((k) => k.trim())
      .filter(Boolean);
    const category = (row.category || 'general').trim();

    // Flexible column headers for class, book, chapter, and image
    const className = (row.className || row.class || 'Class 3').trim();
    const bookName = (row.bookName || row.book || 'General').trim();
    const chapterName = (row.chapterName || row.chapter || 'Chapter 1').trim();
    const imageUrl = (row.imageUrl || row.Image || row.image || '').trim();

    toInsert.push({ question, answer, keywords, category, className, bookName, chapterName, imageUrl });
  });

  let inserted = [];
  if (toInsert.length > 0) {
    inserted = await QA.insertMany(toInsert);
    invalidateQACache();
  }

  res.json({
    insertedCount: inserted.length,
    skippedCount: skipped.length,
    skipped
  });
});

// GET /api/admin/qa  - list all, newest first, optional ?search=
router.get('/', async (req, res) => {
  const { search, className, bookName } = req.query;
  let filter = {};
  if (search && search.trim()) {
    const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { question: { $regex: safeSearch, $options: 'i' } },
      { keywords: { $regex: safeSearch, $options: 'i' } },
      { className: { $regex: safeSearch, $options: 'i' } },
      { bookName: { $regex: safeSearch, $options: 'i' } },
      { chapterName: { $regex: safeSearch, $options: 'i' } }
    ];
  }
  if (className && className !== 'All') filter.className = className;
  if (bookName && bookName !== 'All') filter.bookName = bookName;

  const items = await QA.find(filter).sort({ createdAt: -1 });
  res.json(items);
});

// POST /api/admin/qa  { question, answer, keywords[], category, className, bookName, chapterName, imageUrl }
router.post('/', async (req, res) => {
  try {
    const { question, answer, keywords = [], category, className, bookName, chapterName, imageUrl } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are both required' });
    }
    const doc = await QA.create({
      question: question.trim(),
      answer: answer.trim(),
      keywords: keywords.map((k) => k.trim()).filter(Boolean),
      category: category ? category.trim() : 'general',
      className: className ? className.trim() : 'Class 3',
      bookName: bookName ? bookName.trim() : 'General',
      chapterName: chapterName ? chapterName.trim() : 'Chapter 1',
      imageUrl: imageUrl ? imageUrl.trim() : ''
    });
    invalidateQACache();
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Could not save this entry' });
  }
});

// PUT /api/admin/qa/:id
router.put('/:id', async (req, res) => {
  try {
    const { question, answer, keywords, category, className, bookName, chapterName, imageUrl } = req.body;
    const update = {};
    if (question !== undefined) update.question = question.trim();
    if (answer !== undefined) update.answer = answer.trim();
    if (keywords !== undefined) update.keywords = keywords.map((k) => k.trim()).filter(Boolean);
    if (category !== undefined) update.category = category.trim();
    if (className !== undefined) update.className = className.trim();
    if (bookName !== undefined) update.bookName = bookName.trim();
    if (chapterName !== undefined) update.chapterName = chapterName.trim();
    if (imageUrl !== undefined) update.imageUrl = imageUrl.trim();

    const doc = await QA.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'Entry not found' });
    invalidateQACache();
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Could not update this entry' });
  }
});

// DELETE /api/admin/qa/:id
router.delete('/:id', async (req, res) => {
  try {
    const doc = await QA.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Entry not found' });
    invalidateQACache();
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete this entry: ' + err.message });
  }
});

module.exports = router;
