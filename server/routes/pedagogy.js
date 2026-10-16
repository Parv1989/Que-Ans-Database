const express = require('express');
const router = express.Router();
const Pedagogy = require('../models/Pedagogy');
const QA = require('../models/QA');
const { requireAdmin } = require('../middleware/auth');

// Candidate Gemini models with fallback
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

    const pedagogies = await Pedagogy.find({}, 'className bookName chapterName lessonPlan.lastGeneratedAt mindMap.lastGeneratedAt').lean();
    const statusMap = new Map();
    pedagogies.forEach((p) => {
      const key = `${p.className}___${p.bookName}___${p.chapterName}`.toLowerCase();
      statusMap.set(key, {
        hasLessonPlan: !!(p.lessonPlan && p.lessonPlan.unitTitle),
        hasMindMap: !!(p.mindMap && p.mindMap.centralTopic),
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

// Admin POST: Generate with AI using Gemini & permanently save to MongoDB
router.post('/admin/generate-ai', requireAdmin, async (req, res) => {
  try {
    const { className, bookName, chapterName } = req.body;
    if (!className || !bookName || !chapterName) {
      return res.status(400).json({ error: 'className, bookName, and chapterName are required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY is not configured in server/.env' });
    }

    // Fetch sample questions from DB for authentic grounding
    const sampleQuestions = await QA.find({
      className: new RegExp('^' + className.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      bookName: new RegExp('^' + bookName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      chapterName: new RegExp('^' + chapterName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
    }).limit(15).lean();

    const qContext = sampleQuestions.map((q, i) => `${i + 1}. Q: ${q.question} | Ans: ${q.answer}`).join('\n');

    const prompt = `You are a Senior CBSE & NCERT Pedagogical Curriculum Specialist.
Target Class: ${className}
Book/Subject: ${bookName}
Chapter: ${chapterName}

Concepts and Q&A from this chapter in our curriculum database:
${qContext || 'Standard NCERT curriculum topics for ' + chapterName}

Your task:
1. Generate an authentic, comprehensive, teacher-friendly Lesson Plan adhering to CBSE guidelines (Learning Outcomes, 5E pedagogical model, 4 periods structure, teaching aids, class activity, homework).
2. Generate a structured multi-branch Mind Map (central topic with 4 distinct branches, each having concrete subtopics, details, and keywords).

You MUST respond strictly with valid JSON without markdown fences, matching this exact schema:
{
  "lessonPlan": {
    "unitTitle": "Unit / Chapter Title",
    "learningObjectives": [
      "Students will be able to...",
      "Students will understand...",
      "Students will apply..."
    ],
    "pedagogicalMethodology": "5E Model (Engage, Explore, Explain, Elaborate, Evaluate) with Interactive Discussion",
    "periodsCount": 4,
    "periods": [
      {
        "periodNumber": 1,
        "title": "Introduction & Concept Hook",
        "focus": "Engage and introduce core terminology",
        "teacherActivity": "Detailed teacher explanation and inquiry prompts",
        "studentActivity": "Active listening, responding to hook question, peer discussion",
        "teachingAids": "Blackboard, textbook illustrations, flashcards",
        "assessmentQuestion": "Formative oral check question"
      },
      {
        "periodNumber": 2,
        "title": "In-Depth Exploration & Mechanisms",
        "focus": "Core scientific/educational processes",
        "teacherActivity": "Step-by-step process demonstration and explanation",
        "studentActivity": "Making structured notes, identifying key steps",
        "teachingAids": "Process charts, visual models",
        "assessmentQuestion": "Conceptual check question"
      },
      {
        "periodNumber": 3,
        "title": "Visual Analysis & Application",
        "focus": "Diagrams, real-world connections, and case scenarios",
        "teacherActivity": "Guiding students through diagrams and practical examples",
        "studentActivity": "Diagram sketching, labeling parts, group activity",
        "teachingAids": "Diagram worksheet, interactive props",
        "assessmentQuestion": "Application-level question"
      },
      {
        "periodNumber": 4,
        "title": "Evaluation, Synthesis & Revision",
        "focus": "Assessment and doubt resolution",
        "teacherActivity": "Conducting quick recap quiz and reviewing student worksheets",
        "studentActivity": "Completing practice exercises and self-assessment",
        "teachingAids": "Review test paper, question cards",
        "assessmentQuestion": "Summative test question"
      }
    ],
    "bloomTaxonomy": ["Remembering", "Understanding", "Applying", "Analyzing"],
    "classroomActivity": "Exciting classroom activity, roleplay or mini-experiment",
    "homeworkAssignment": "Thoughtful revision task reinforcing chapter concepts"
  },
  "mindMap": {
    "centralTopic": "Chapter Central Concept Name",
    "branches": [
      {
        "id": "branch-1",
        "title": "Core Definitions & Fundamentals",
        "color": "#6366f1",
        "subtopics": [
          { "name": "Key Concept 1", "detail": "Clear explanation", "keywords": ["term1", "term2"] },
          { "name": "Key Concept 2", "detail": "Clear explanation", "keywords": ["term3"] }
        ]
      },
      {
        "id": "branch-2",
        "title": "Processes & Mechanisms",
        "color": "#059669",
        "subtopics": [
          { "name": "Process 1", "detail": "How it works", "keywords": ["process", "cycle"] }
        ]
      },
      {
        "id": "branch-3",
        "title": "Structures & Components",
        "color": "#d97706",
        "subtopics": [
          { "name": "Component 1", "detail": "Function and purpose", "keywords": ["role", "part"] }
        ]
      },
      {
        "id": "branch-4",
        "title": "Real-Life Applications & Significance",
        "color": "#8b5cf6",
        "subtopics": [
          { "name": "Application 1", "detail": "Why it matters in daily life", "keywords": ["life", "usage"] }
        ]
      }
    ]
  }
}
CRITICAL: Output ONLY valid JSON. No markdown code blocks, backticks, or introductory notes.`;

    let generatedText = null;
    let lastError = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const aiRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (aiRes.ok) {
          const data = await aiRes.json();
          const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            generatedText = candidateText;
            break;
          }
        } else {
          const errData = await aiRes.json().catch(() => ({}));
          lastError = errData?.error?.message || `HTTP ${aiRes.status}`;
        }
      } catch (callErr) {
        lastError = callErr.message;
      }
    }

    if (!generatedText) {
      return res.status(502).json({ error: 'AI generation failed: ' + (lastError || 'Gemini service unavailable') });
    }

    // Clean JSON response (strip markdown fences if any)
    const cleanedJson = generatedText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanedJson);
    } catch (parseErr) {
      console.error('Failed to parse Gemini output:', generatedText);
      return res.status(502).json({ error: 'AI output could not be parsed as JSON: ' + parseErr.message });
    }

    // Save permanently to MongoDB (Cache Forever)
    const savedDoc = await Pedagogy.findOneAndUpdate(
      { className: className.trim(), bookName: bookName.trim(), chapterName: chapterName.trim() },
      {
        className: className.trim(),
        bookName: bookName.trim(),
        chapterName: chapterName.trim(),
        lessonPlan: {
          ...parsed.lessonPlan,
          lastGeneratedAt: new Date(),
          isAIGenerated: true
        },
        mindMap: {
          ...parsed.mindMap,
          lastGeneratedAt: new Date(),
          isAIGenerated: true
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: 'Lesson Plan & Mind Map generated with AI and permanently saved to Database!',
      data: savedDoc
    });
  } catch (err) {
    console.error('pedagogy generate-ai error:', err);
    res.status(500).json({ error: 'Server error during AI generation: ' + err.message });
  }
});

// Admin POST: Save manual edits
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
        isAIGenerated: false
      };
    }
    if (mindMap) {
      updateData.mindMap = {
        ...mindMap,
        isAIGenerated: false
      };
    }

    const savedDoc = await Pedagogy.findOneAndUpdate(
      { className: className.trim(), bookName: bookName.trim(), chapterName: chapterName.trim() },
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
