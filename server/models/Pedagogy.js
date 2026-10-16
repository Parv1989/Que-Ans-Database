const mongoose = require('mongoose');

const PeriodSchema = new mongoose.Schema({
  periodNumber: { type: Number, required: true },
  title: { type: String, default: '' },
  focus: { type: String, default: '' },
  teacherActivity: { type: String, default: '' },
  studentActivity: { type: String, default: '' },
  teachingAids: { type: String, default: '' },
  assessmentQuestion: { type: String, default: '' }
}, { _id: false });

const SubtopicSchema = new mongoose.Schema({
  name: { type: String, required: true },
  detail: { type: String, default: '' },
  keywords: { type: [String], default: [] }
}, { _id: false });

const BranchSchema = new mongoose.Schema({
  id: { type: String, default: '' },
  title: { type: String, required: true },
  color: { type: String, default: '#6366f1' },
  subtopics: { type: [SubtopicSchema], default: [] }
}, { _id: false });

const PedagogySchema = new mongoose.Schema(
  {
    className: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    bookName: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    chapterName: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    // Lesson Plan Details
    lessonPlan: {
      unitTitle: { type: String, default: '' },
      learningObjectives: { type: [String], default: [] },
      pedagogicalMethodology: { type: String, default: '5E Inquiry Model, Visual Learning & Interactive Discussion' },
      periodsCount: { type: Number, default: 4 },
      periods: { type: [PeriodSchema], default: [] },
      bloomTaxonomy: { type: [String], default: ['Remembering', 'Understanding', 'Applying'] },
      classroomActivity: { type: String, default: '' },
      homeworkAssignment: { type: String, default: '' },
      lastGeneratedAt: { type: Date, default: null },
      isAIGenerated: { type: Boolean, default: false }
    },
    // Mind Map Details
    mindMap: {
      centralTopic: { type: String, default: '' },
      branches: { type: [BranchSchema], default: [] },
      lastGeneratedAt: { type: Date, default: null },
      isAIGenerated: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

PedagogySchema.index({ className: 1, bookName: 1, chapterName: 1 }, { unique: true });

module.exports = mongoose.model('Pedagogy', PedagogySchema);
