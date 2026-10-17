const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Pedagogy = require('../models/Pedagogy');
const BookFeature = require('../models/BookFeature');
const QA = require('../models/QA');
const { requireAdmin } = require('../middleware/auth');

// Setup upload directory for pedagogy files (PDFs, images)
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'pedagogy');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e4);
    cb(null, `${cleanBase}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files (.png, .jpg, .jpeg, .webp) are allowed'));
    }
  }
});

// Candidate Gemini models with fallback (kept for internal reference)
const CANDIDATE_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];

// Public GET: Fetch saved lesson plan & mind map for a chapter
router.get('/', async (req, res) => {
  try {
    const { className, bookName, chapterName } = req.query;
    if (!className || !bookName || !chapterName) {
      return res.status(400).json({ error: 'className, bookName, and chapterName are required' });
    }

    const doc = await Pedagogy.findOne({
      className: new RegExp('^' + className.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      bookName: new RegExp('^' + bookName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      chapterName: new RegExp('^' + chapterName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
    }).lean();

    if (!doc) {
      return res.json({ exists: false });
    }

    res.json({
      exists: true,
      data: doc
    });
  } catch (err) {
    console.error('pedagogy get error:', err);
    res.status(500).json({ error: 'Failed to fetch pedagogy data' });
  }
});

// Public GET: Fetch feature toggles for a specific book
router.get('/book-features', async (req, res) => {
  try {
    const { className, bookName } = req.query;
    const defaultFeatures = {
      lessonPlan: true,
      mindMap: true,
      testPaper: true,
      worksheet: true,
      oralTest: true,
      quiz: true,
      notes: true,
      explainSimply: true,
      voiceTts: true
    };

    if (!className || !bookName) {
      return res.json({ features: defaultFeatures });
    }

    const doc = await BookFeature.findOne({
      className: new RegExp('^' + className.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      bookName: new RegExp('^' + bookName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
    }).lean();

    res.json({
      features: doc && doc.features ? { ...defaultFeatures, ...doc.features } : defaultFeatures
    });
  } catch (err) {
    console.error('book-features get error:', err);
    res.status(500).json({ error: 'Failed to fetch book features' });
  }
});

// Admin GET: List all chapters and their pedagogy completion status
router.get('/admin/chapters', requireAdmin, async (req, res) => {
  try {
    const hierarchy = await QA.aggregate([
      {
        $group: {
          _id: {
            className: '$className',
            bookName: '$bookName',
            chapterName: '$chapterName'
          },
          questionCount: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.className': 1,
          '_id.bookName': 1,
          '_id.chapterName': 1
        }
      }
    ]);

    const pedagogies = await Pedagogy.find({}, 'className bookName chapterName lessonPlan mindMap updatedAt').lean();
    const statusMap = new Map();
    pedagogies.forEach((p) => {
      const key = `${p.className}___${p.bookName}___${p.chapterName}`.toLowerCase();
      statusMap.set(key, {
        hasLessonPlan: !!(p.lessonPlan && (p.lessonPlan.unitTitle || p.lessonPlan.pdfUrl)),
        hasMindMap: !!(p.mindMap && (p.mindMap.centralTopic || p.mindMap.imageUrl || p.mindMap.pdfUrl)),
        lastUpdated: p.updatedAt
      });
    });

    const result = hierarchy.map((item) => {
      const c = item._id.className || 'General';
      const b = item._id.bookName || 'General';
      const ch = item._id.chapterName || 'General';
      const key = `${c}___${b}___${ch}`.toLowerCase();
      const st = statusMap.get(key) || { hasLessonPlan: false, hasMindMap: false };
      return {
        className: c,
        bookName: b,
        chapterName: ch,
        questionCount: item.questionCount,
        hasLessonPlan: st.hasLessonPlan,
        hasMindMap: st.hasMindMap
      };
    });

    res.json({ chapters: result });
  } catch (err) {
    console.error('pedagogy chapters error:', err);
    res.status(500).json({ error: 'Failed to fetch chapter status list' });
  }
});

// Admin POST: Upload PDF or image file for lesson plan or mind map
router.post('/admin/upload-file', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file received' });
    }
    const fileUrl = `/uploads/pedagogy/${req.file.filename}`;
    res.json({
      success: true,
      fileUrl,
      fileName: req.file.originalname,
      size: req.file.size
    });
  } catch (err) {
    console.error('pedagogy file upload error:', err);
    res.status(500).json({ error: 'Failed to upload file: ' + err.message });
  }
});

// Admin GET: List all books and their feature toggles
router.get('/admin/book-features', requireAdmin, async (req, res) => {
  try {
    const booksAgg = await QA.aggregate([
      {
        $group: {
          _id: {
            className: '$className',
            bookName: '$bookName'
          },
          chapterCount: { $addToSet: '$chapterName' },
          questionCount: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.className': 1,
          '_id.bookName': 1
        }
      }
    ]);

    const existingConfigs = await BookFeature.find({}).lean();
    const configMap = new Map();
    existingConfigs.forEach((c) => {
      const key = `${c.className}___${c.bookName}`.toLowerCase();
      configMap.set(key, c.features);
    });

    const defaultFeatures = {
      lessonPlan: true,
      mindMap: true,
      testPaper: true,
      worksheet: true,
      oralTest: true,
      quiz: true,
      notes: true,
      explainSimply: true,
      voiceTts: true
    };

    const result = booksAgg.map((item) => {
      const c = item._id.className || 'General';
      const b = item._id.bookName || 'General';
      const key = `${c}___${b}`.toLowerCase();
      const customFeatures = configMap.get(key);

      return {
        className: c,
        bookName: b,
        chaptersCount: (item.chapterCount || []).length,
        questionCount: item.questionCount,
        features: customFeatures ? { ...defaultFeatures, ...customFeatures } : { ...defaultFeatures }
      };
    });

    res.json({ books: result });
  } catch (err) {
    console.error('admin book-features list error:', err);
    res.status(500).json({ error: 'Failed to fetch book feature list' });
  }
});

// Admin POST: Save feature toggles for a book
router.post('/admin/book-features', requireAdmin, async (req, res) => {
  try {
    const { className, bookName, features } = req.body;
    if (!className || !bookName || !features) {
      return res.status(400).json({ error: 'className, bookName, and features are required' });
    }

    const savedDoc = await BookFeature.findOneAndUpdate(
      {
        className: className.trim(),
        bookName: bookName.trim()
      },
      {
        className: className.trim(),
        bookName: bookName.trim(),
        features: {
          lessonPlan: Boolean(features.lessonPlan),
          mindMap: Boolean(features.mindMap),
          testPaper: Boolean(features.testPaper),
          worksheet: Boolean(features.worksheet),
          oralTest: Boolean(features.oralTest),
          quiz: Boolean(features.quiz),
          notes: Boolean(features.notes),
          explainSimply: Boolean(features.explainSimply),
          voiceTts: Boolean(features.voiceTts)
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: `Features updated for ${className} • ${bookName}`,
      data: savedDoc
    });
  } catch (err) {
    console.error('admin book-features save error:', err);
    res.status(500).json({ error: 'Failed to save book features: ' + err.message });
  }
});

// Admin POST: Save manual edits for Lesson Plan and Mind Map
router.post('/admin/save', requireAdmin, async (req, res) => {
  try {
    const { className, bookName, chapterName, lessonPlan, mindMap } = req.body;
    if (!className || !bookName || !chapterName) {
      return res.status(400).json({ error: 'className, bookName, and chapterName are required' });
    }

    const updateData = {
      className: className.trim(),
      bookName: bookName.trim(),
      chapterName: chapterName.trim()
    };

    if (lessonPlan) {
      updateData.lessonPlan = {
        ...lessonPlan,
        isAIGenerated: false,
        lastGeneratedAt: new Date()
      };
    }
    if (mindMap) {
      updateData.mindMap = {
        ...mindMap,
        isAIGenerated: false,
        lastGeneratedAt: new Date()
      };
    }

    const savedDoc = await Pedagogy.findOneAndUpdate(
      {
        className: className.trim(),
        bookName: bookName.trim(),
        chapterName: chapterName.trim()
      },
      updateData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: 'Pedagogy content saved successfully!',
      data: savedDoc
    });
  } catch (err) {
    console.error('pedagogy save error:', err);
    res.status(500).json({ error: 'Failed to save pedagogy data' });
  }
});

module.exports = router;
