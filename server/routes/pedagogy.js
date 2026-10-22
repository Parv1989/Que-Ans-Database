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

    const seenKeys = new Set();
    const result = hierarchy.map((item) => {
      const c = item._id.className || 'General';
      const b = item._id.bookName || 'General';
      const ch = item._id.chapterName || 'General';
      const key = `${c}___${b}___${ch}`.toLowerCase();
      seenKeys.add(key);
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

    // Also include any chapters saved in Pedagogy that don't have QA questions yet
    pedagogies.forEach((p) => {
      const key = `${p.className}___${p.bookName}___${p.chapterName}`.toLowerCase();
      if (!seenKeys.has(key)) {
        const st = statusMap.get(key) || { hasLessonPlan: false, hasMindMap: false };
        result.push({
          className: p.className || 'General',
          bookName: p.bookName || 'General',
          chapterName: p.chapterName || 'General',
          questionCount: 0,
          hasLessonPlan: st.hasLessonPlan,
          hasMindMap: st.hasMindMap
        });
        seenKeys.add(key);
      }
    });

    // Natural numeric sorting for classes, books, and chapters (e.g. Chapter 2 before Chapter 10)
    function naturalCompare(a, b) {
      return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
    }

    result.sort((a, b) => {
      const c = naturalCompare(a.className, b.className);
      if (c !== 0) return c;
      const bk = naturalCompare(a.bookName, b.bookName);
      if (bk !== 0) return bk;
      return naturalCompare(a.chapterName, b.chapterName);
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

// Admin POST: Read chapter PDF and auto-generate Lesson Plan and Mind Map using Gemini AI
router.post('/admin/generate-from-pdf', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { className, bookName, chapterName, existingPdfUrl } = req.body;
    if (!className || !bookName || !chapterName) {
      return res.status(400).json({ error: 'className, bookName, and chapterName are required' });
    }

    let fileBuffer = null;
    let fileUrl = null;

    if (req.file) {
      fileUrl = `/uploads/pedagogy/${req.file.filename}`;
      fileBuffer = fs.readFileSync(req.file.path);
    } else if (existingPdfUrl) {
      const cleanPath = existingPdfUrl.startsWith('/') ? existingPdfUrl.slice(1) : existingPdfUrl;
      const localFilePath = path.join(__dirname, '..', '..', 'public', cleanPath);
      if (fs.existsSync(localFilePath)) {
        fileUrl = existingPdfUrl;
        fileBuffer = fs.readFileSync(localFilePath);
      }
    }

    if (!fileBuffer) {
      return res.status(400).json({ error: 'Please choose and upload a Chapter PDF file (.pdf) first!' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const base64Data = fileBuffer.toString('base64');

    const promptText = `You are a Master Academic Pedagogy Expert specializing in CBSE, ICSE, and NEP 2020 curriculum standards.
Carefully and thoroughly read the attached textbook Chapter PDF for:
- Class: "${className}"
- Book: "${bookName}"
- Chapter: "${chapterName}"

Based SOLELY on the actual contents, concepts, stories, examples, diagrams, and exercises present in this attached Chapter PDF, generate a complete, curriculum-aligned Pedagogical Lesson Plan and a Concept Mind Map.

Return ONLY a valid JSON object matching this exact schema without any markdown formatting or code fences:
{
  "lessonPlan": {
    "unitTitle": "Unit or Chapter Title extracted from PDF",
    "pedagogicalMethodology": "e.g. 5E Inquiry Model, Experiential Learning & Hands-on Visual Observation",
    "learningObjectives": [
      "Students will be able to explain...",
      "Students will identify and categorize...",
      "Students will analyze...",
      "Students will apply learning to real-world examples..."
    ],
    "bloomTaxonomy": ["Remembering", "Understanding", "Applying", "Analyzing"],
    "periodsCount": 4,
    "periods": [
      {
        "periodNumber": 1,
        "title": "Introduction, Hook & Concept Hook",
        "teacherActivity": "Detailed teacher explanation, story/real-life hook question based directly on the chapter content.",
        "studentActivity": "Active student listening, naming items, sharing prior experiences.",
        "teachingAids": "Concrete TLM: Real objects, blackboard illustrations, flashcards.",
        "assessmentQuestion": "Formative oral question based directly on Period 1 content."
      },
      {
        "periodNumber": 2,
        "title": "In-Depth Inquiry & Key Mechanisms",
        "teacherActivity": "Detailed explanation of core concepts and mechanisms from the chapter.",
        "studentActivity": "Group discussion, categorizing concepts, writing key terms.",
        "teachingAids": "Charts, diagrams from the textbook, flowcharts.",
        "assessmentQuestion": "Formative question checking understanding of mechanisms."
      },
      {
        "periodNumber": 3,
        "title": "Experiential Learning & Concept Application",
        "teacherActivity": "Guiding hands-on activity, reading passage, analyzing illustrations.",
        "studentActivity": "Sketching, solving interactive problem, peer demonstration.",
        "teachingAids": "Worksheet, activity materials, textbook pictures.",
        "assessmentQuestion": "Application-level question."
      },
      {
        "periodNumber": 4,
        "title": "Evaluation, Synthesis & Revision",
        "teacherActivity": "Conducting quick recap quiz, addressing misconceptions, summarizing key takeaways.",
        "studentActivity": "Answering revision questions, presenting learning outcomes.",
        "teachingAids": "Revision cards, summary chart, blackboard.",
        "assessmentQuestion": "Summary question assessing overall chapter understanding."
      }
    ],
    "classroomActivity": "A practical, experiential classroom demonstration, group game, or experiment connecting the chapter's main concept.",
    "homeworkAssignment": "Thoughtful, creative extension task or exercise questions to be completed in notebook."
  },
  "mindMap": {
    "centralTopic": "Main concept/theme of this chapter",
    "branches": [
      {
        "id": "branch-1",
        "title": "Core Fundamentals & Definitions",
        "color": "#059669",
        "subtopics": [
          {
            "name": "Subtopic Concept",
            "detail": "1-2 sentence clear definition from chapter",
            "keywords": ["keyword1", "keyword2"]
          }
        ]
      },
      {
        "id": "branch-2",
        "title": "Processes & Mechanisms",
        "color": "#6366f1",
        "subtopics": [
          {
            "name": "Subtopic Concept",
            "detail": "1-2 sentence clear definition from chapter",
            "keywords": ["keyword1", "keyword2"]
          }
        ]
      },
      {
        "id": "branch-3",
        "title": "Structures & Components",
        "color": "#d97706",
        "subtopics": [
          {
            "name": "Subtopic Concept",
            "detail": "1-2 sentence clear definition from chapter",
            "keywords": ["keyword1", "keyword2"]
          }
        ]
      },
      {
        "id": "branch-4",
        "title": "Real-Life Applications & Significance",
        "color": "#8b5cf6",
        "subtopics": [
          {
            "name": "Subtopic Concept",
            "detail": "1-2 sentence clear definition from chapter",
            "keywords": ["keyword1", "keyword2"]
          }
        ]
      }
    ]
  }
}
CRITICAL REQUIREMENTS:
1. Every objective, activity, question, and branch MUST be directly grounded in the provided Chapter PDF text.
2. Ensure realistic, creative, and age-appropriate teacher activities and student tasks.
3. Return ONLY raw JSON without any markdown code fences.`;

    const candidateModels = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
    let rawResponse = '';
    let lastError = '';

    for (const model of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const resp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'application/pdf',
                      data: base64Data
                    }
                  },
                  {
                    text: promptText
                  }
                ]
              }
            ]
          })
        });

        if (resp.ok) {
          const geminiData = await resp.json();
          rawResponse = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (rawResponse) break;
        } else {
          const errData = await resp.json().catch(() => ({}));
          lastError = errData?.error?.message || `Status ${resp.status}`;
          console.warn(`Model ${model} failed:`, lastError);
        }
      } catch (err) {
        lastError = err.message;
        console.warn(`Model ${model} exception:`, lastError);
      }
    }

    if (!rawResponse) {
      return res.status(502).json({ error: 'Gemini AI failed to process the PDF: ' + (lastError || 'Empty response') });
    }

    // Extract JSON safely
    let parsed;
    try {
      let cleaned = rawResponse.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      const start = rawResponse.indexOf('{');
      const end = rawResponse.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        parsed = JSON.parse(rawResponse.substring(start, end + 1));
      } else {
        throw new Error('Invalid JSON format returned by AI: ' + parseErr.message);
      }
    }

    if (!parsed || !parsed.lessonPlan || !parsed.mindMap) {
      return res.status(502).json({ error: 'AI output missing lessonPlan or mindMap structure' });
    }

    // Attach PDF URL to both
    parsed.lessonPlan.pdfUrl = fileUrl;
    parsed.mindMap.pdfUrl = fileUrl;

    // Save to Database
    const savedDoc = await Pedagogy.findOneAndUpdate(
      {
        className: className.trim(),
        bookName: bookName.trim(),
        chapterName: chapterName.trim()
      },
      {
        className: className.trim(),
        bookName: bookName.trim(),
        chapterName: chapterName.trim(),
        lessonPlan: {
          ...parsed.lessonPlan,
          isAIGenerated: true,
          lastGeneratedAt: new Date()
        },
        mindMap: {
          ...parsed.mindMap,
          isAIGenerated: true,
          lastGeneratedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: 'Lesson Plan and Mind Map generated successfully from Chapter PDF!',
      fileUrl,
      data: savedDoc
    });
  } catch (err) {
    console.error('generate-from-pdf error:', err);
    res.status(500).json({ error: 'Failed to generate from PDF: ' + err.message });
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

    const seenKeys = new Set();
    const result = booksAgg.map((item) => {
      const c = item._id.className || 'General';
      const b = item._id.bookName || 'General';
      const key = `${c}___${b}`.toLowerCase();
      seenKeys.add(key);
      const customFeatures = configMap.get(key);

      return {
        className: c,
        bookName: b,
        chaptersCount: (item.chapterCount || []).length,
        questionCount: item.questionCount,
        features: customFeatures ? { ...defaultFeatures, ...customFeatures } : { ...defaultFeatures }
      };
    });

    // Also include any books configured in BookFeature that might not be in QA yet
    existingConfigs.forEach((c) => {
      const key = `${c.className}___${c.bookName}`.toLowerCase();
      if (!seenKeys.has(key)) {
        result.push({
          className: c.className || 'General',
          bookName: c.bookName || 'General',
          chaptersCount: 0,
          questionCount: 0,
          features: c.features ? { ...defaultFeatures, ...c.features } : { ...defaultFeatures }
        });
        seenKeys.add(key);
      }
    });

    // Natural numeric sorting: Class 1, Class 2, ... Class 10; then Book Name
    function naturalCompare(a, b) {
      return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
    }

    result.sort((a, b) => {
      const c = naturalCompare(a.className, b.className);
      if (c !== 0) return c;
      return naturalCompare(a.bookName, b.bookName);
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
