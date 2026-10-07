const mongoose = require('mongoose');

const QASchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true
    },
    answer: {
      type: String,
      required: true,
      trim: true
    },
    // Extra phrases/words admin wants this question to match on,
    // e.g. question = "How do I get my refund?" keywords = ["refund", "money back", "return payment"]
    keywords: {
      type: [String],
      default: []
    },
    category: {
      type: String,
      trim: true,
      default: 'general'
    },
    className: {
      type: String,
      trim: true,
      default: 'All Classes',
      index: true
    },
    bookName: {
      type: String,
      trim: true,
      default: 'All Books',
      index: true
    },
    chapterName: {
      type: String,
      trim: true,
      default: 'All Chapters',
      index: true
    },
    // Optional diagram or illustration image URL for the question/answer
    imageUrl: {
      type: String,
      trim: true,
      default: ''
    },
    // how many times this answer has been served - useful for the admin dashboard
    hitCount: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('QA', QASchema);
