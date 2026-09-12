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
    // how many times this answer has been served - useful for the admin dashboard
    hitCount: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('QA', QASchema);
