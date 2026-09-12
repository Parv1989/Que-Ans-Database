// Run with: npm run seed
// Adds a few sample Q&A pairs and synonym groups so you can test the bot
// right away. Safe to delete/edit everything from the admin panel afterwards.
require('dotenv').config();
const mongoose = require('mongoose');
const QA = require('../models/QA');
const Synonym = require('../models/Synonym');

const sampleQA = [
  {
    question: 'How can I buy this book?',
    answer: 'Aap hamari website ke "Buy Now" button se ya nazdeeki bookstore se ye book kharid sakte hain.',
    keywords: ['purchase', 'order', 'buy book', 'kharidna'],
    category: 'purchase'
  },
  {
    question: 'What is the price of this book?',
    answer: 'Is book ki price back cover par MRP me likhi hai. Online store par bhi price listed hai.',
    keywords: ['cost', 'rate', 'kitne ka hai', 'price kya hai'],
    category: 'purchase'
  },
  {
    question: 'How do I get the answer key?',
    answer: 'Answer key book ke last chapter me di gayi hai. Agar nahi mil rahi to publisher ki website se download kar sakte hain.',
    keywords: ['solution', 'answers', 'solved answers'],
    category: 'content'
  },
  {
    question: 'I found a printing mistake in the book',
    answer: 'Iske liye maaf kijiye. Kripya galti ka photo aur book ka edition number publisher@example.com par bhejein, hum jald sudhar karenge.',
    keywords: ['error', 'mistake', 'wrong answer', 'printing error'],
    category: 'support'
  }
];

const sampleSynonyms = [
  { words: ['price', 'cost', 'rate', 'mrp', 'kitna', 'kitne ka'] },
  { words: ['buy', 'purchase', 'order', 'kharidna', 'kharido'] },
  { words: ['mistake', 'error', 'galti', 'galat'] }
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  await QA.deleteMany({});
  await Synonym.deleteMany({});
  await QA.insertMany(sampleQA);
  await Synonym.insertMany(sampleSynonyms);
  console.log('Seeded sample Q&A and synonyms.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
