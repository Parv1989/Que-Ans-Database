const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const QA = require('../models/QA');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const updates = [
    { filter: { question: /शिवाजी/ }, addKw: ['shivaji', 'chhatrapati', 'maratha', 'king', 'raja', 'kon the'] },
    { filter: { question: /solar system/i }, addKw: ['सौर मंडल', 'सौर मण्डल', 'सौरमंडल', 'ग्रह', 'गृह', 'planets', 'saur mandal'] },
    { filter: { question: /पेड़/ }, addKw: ['पेड़', 'पौधे', 'trees', 'plants', 'oxygen', 'ped hume'] },
    { filter: { question: /red planet/i }, addKw: ['लाल ग्रह', 'मंगल', 'मंगल ग्रह', 'red planet', 'mars'] },
    { filter: { question: /rainbow/i }, addKw: ['इंद्रधनुष', 'रंग', 'rainbow', 'colours', '7 colours'] },
    { filter: { question: /plants need/i }, addKw: ['पौधे', 'भोजन', 'खाना', 'plants', 'food', 'photosynthesis'] },
    { filter: { question: /current/i }, addKw: ['विद्युत धारा', 'विद्युत', 'मात्रक', 'current', 'unit', 'ampere'] },
    { filter: { question: /breathe/i }, addKw: ['फेफड़े', 'सांस', 'lungs', 'breathe', 'organ'] },
    { filter: { question: /capital of india/i }, addKw: ['भारत', 'राजधानी', 'india', 'capital', 'delhi'] },
    { filter: { question: /brain of a computer/i }, addKw: ['कंप्यूटर', 'दिमाग', 'मस्तिष्क', 'computer', 'brain', 'cpu'] },
    { filter: { question: /highest mountains/i }, addKw: ['सबसे ऊंचा पर्वत', 'पहाड़', 'mountains', 'highest', 'everest'] },
    { filter: { question: /largest continent/i }, addKw: ['सबसे बड़ा महाद्वीप', 'continent', 'asia', 'largest'] },
    { filter: { question: /similar poles/i }, addKw: ['चुंबक', 'समान ध्रुव', 'magnets', 'poles', 'repel'] },
    { filter: { question: /side mirror/i }, addKw: ['उत्तल दर्पण', 'साइड मिरर', 'mirror', 'convex', 'vehicle'] }
  ];

  for (const u of updates) {
    const doc = await QA.findOne(u.filter);
    if (doc) {
      const merged = Array.from(new Set([...(doc.keywords || []), ...u.addKw]));
      await QA.updateOne({ _id: doc._id }, { $set: { keywords: merged } });
      console.log('Enriched:', doc.question, '-->', merged);
    }
  }

  console.log('Done!');
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
