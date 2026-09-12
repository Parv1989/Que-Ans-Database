const mongoose = require('mongoose');

// A synonym group: any word in "words" is treated as interchangeable.
// e.g. words: ["price", "cost", "fees", "kitna paisa", "rate"]
// So if a student asks "book ka rate kya hai" it still matches a question about "price".
const SynonymSchema = new mongoose.Schema(
  {
    words: {
      type: [String],
      required: true,
      set: (arr) => arr.map((w) => w.toLowerCase().trim()).filter(Boolean)
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Synonym', SynonymSchema);
