const mongoose = require('mongoose');

const BookFeatureSchema = new mongoose.Schema(
  {
    className: {
      type: String,
      required: true,
      trim: true
    },
    bookName: {
      type: String,
      required: true,
      trim: true
    },
    features: {
      lessonPlan: { type: Boolean, default: true },
      mindMap: { type: Boolean, default: true },
      testPaper: { type: Boolean, default: true },
      worksheet: { type: Boolean, default: true },
      oralTest: { type: Boolean, default: true },
      quiz: { type: Boolean, default: true },
      notes: { type: Boolean, default: true },
      explainSimply: { type: Boolean, default: true },
      voiceTts: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

BookFeatureSchema.index({ className: 1, bookName: 1 }, { unique: true });

module.exports = mongoose.model('BookFeature', BookFeatureSchema);
