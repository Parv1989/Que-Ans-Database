require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');
const QA = require('../models/QA');

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://parv09633_db_user:UNb2xMt9GbfTdHjV@cluster0.sbpvfkr.mongodb.net/bookqabot';

async function syncImages() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected.');

  const csvPath = path.join(__dirname, '../../sample-questions.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('sample-questions.csv not found at', csvPath);
    process.exit(1);
  }

  const rawBuffer = fs.readFileSync(csvPath);
  // Decode respecting Windows-1252 / latin1 if smart quotes present
  let csvContent = rawBuffer.toString('utf8');
  if (rawBuffer.includes(0x92)) {
    csvContent = rawBuffer.toString('latin1').replace(/\x92/g, "'").replace(/[\x93\x94]/g, '"');
  }

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  console.log(`Parsed ${records.length} records from sample-questions.csv.`);

  let updatedCount = 0;
  for (const row of records) {
    const question = (row.question || '').trim();
    // Check all possible image column variations
    const imageUrl = (
      row['Image link'] ||
      row['image link'] ||
      row['Image Link'] ||
      row['image_link'] ||
      row['imageUrl'] ||
      row['image_url'] ||
      row['Image url'] ||
      row['Image URL'] ||
      row['image url'] ||
      row.imageUrl ||
      row.Image ||
      row.image ||
      ''
    ).trim();

    if (!question || !imageUrl) continue;

    // Find and update matching QA document in database (case-insensitive question match)
    const safeRegex = new RegExp(`^${question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const existing = await QA.findOne({ question: safeRegex });

    if (existing) {
      if (existing.imageUrl !== imageUrl) {
        existing.imageUrl = imageUrl;
        await existing.save();
        console.log(`Updated question: "${question}" -> Image: ${imageUrl}`);
        updatedCount++;
      } else {
        console.log(`Already has correct image: "${question}"`);
      }
    } else {
      console.log(`Question not found in DB: "${question}"`);
    }
  }

  console.log(`\nSync finished! ${updatedCount} question(s) updated with images.`);
  process.exit(0);
}

syncImages().catch((err) => {
  console.error('Error during sync:', err);
  process.exit(1);
});
