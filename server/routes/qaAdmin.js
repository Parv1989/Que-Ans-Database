const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const router = express.Router();
const QA = require('../models/QA');
const { requireAdmin } = require('../middleware/auth');
const { invalidateQACache } = require('../utils/matcher');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAdmin);

function getField(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim()) {
      return String(row[alias]).trim();
    }
  }
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const cleanAlias = alias.toLowerCase().replace(/[\s_-]/g, '');
    const foundKey = keys.find((k) => k.toLowerCase().replace(/[\s_-]/g, '') === cleanAlias);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim()) {
      return String(row[foundKey]).trim();
    }
  }
  return '';
}

// GET /api/admin/qa/sample-csv - downloadable template
router.get('/sample-csv', (req, res) => {
  const sample =
    'question,answer,keywords,Image link,category,className,bookName,chapterName\n' +
    '"Where does King Vikram live?","King Vikram lived in Ujjain.","vikram;king vikram;ujjain","https://example.com/vikram.png",history,"Class 3","Ripples","Chapter 4"\n' +
    '"What is photosynthesis?","Photosynthesis is the process by which green plants make food using sunlight.","sunlight;plants food;chlorophyll","",science,"Class 4","Science Explorer","Chapter 2"\n';
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
    let csvContent = req.file.buffer.toString('utf-8');
    // Normalize Windows-1252 / ANSI smart quotes if present
    if (req.file.buffer.includes(0x92) || req.file.buffer.includes(0x93) || req.file.buffer.includes(0x94)) {
      csvContent = req.file.buffer.toString('latin1').replace(/\x92/g, "'").replace(/[\x93\x94]/g, '"');
    }
    // Remove UTF-8 BOM if present
    if (csvContent.charCodeAt(0) === 0xfeff) {
      csvContent = csvContent.slice(1);
    }

    records = parse(csvContent, {
      columns: (headers) => headers.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true
    });
  } catch (err) {
    return res.status(400).json({ error: 'Could not read this CSV file: ' + err.message });
  }

  const toInsert = [];
  const skipped = [];

  records.forEach((row, idx) => {
    const question = getField(row, ['question', 'Question', 'q']);
    const answer = getField(row, ['answer', 'Answer', 'ans']);
    if (!question || !answer) {
      skipped.push({ row: idx + 2, reason: 'Missing question or answer' }); // +2: header row + 1-index
      return;
    }
    const rawKeywords = getField(row, ['keywords', 'Keywords', 'keyword', 'tags']);
    const keywords = rawKeywords
      .split(';')
      .map((k) => k.trim())
      .filter(Boolean);
    const category = getField(row, ['category', 'Category', 'cat']) || 'general';

    // Flexible column headers for class, book, chapter, and image
    const className = getField(row, ['className', 'class', 'Class', 'classname', 'standard', 'grade']) || 'Class 3';
    const bookName = getField(row, ['bookName', 'book', 'Book', 'bookname', 'subject']) || 'General';
    const chapterName = getField(row, ['chapterName', 'chapter', 'Chapter', 'chaptername', 'lesson', 'topic']) || 'Chapter 1';
    const imageUrl = getField(row, [
      'Image link', 'Image Link', 'image link', 'image_link',
      'imageUrl', 'Image URL', 'Image url', 'image_url', 'image url',
      'Image', 'image', 'img', 'photo', 'picture'
    ]);

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
