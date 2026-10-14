const mongoose = require('mongoose');

const QueryLogSchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    answered: {
      type: Boolean,
      required: true,
      index: true
    },
    confidence: {
      type: Number,
      default: 0
    },
    matchedQA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QA',
      default: null
    },
    matchedQuestion: {
      type: String,
      default: ''
    },
    className: {
      type: String,
      default: 'All Classes',
      index: true
    },
    bookName: {
      type: String,
      default: 'All Books',
      index: true
    },
    chapterName: {
      type: String,
      default: 'All Chapters',
      index: true
    },
    resolved: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('QueryLog', QueryLogSchema);
