require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const askRoute = require('./routes/ask');
const authRoutes = require('./routes/authRoutes');
const qaAdminRoutes = require('./routes/qaAdmin');
const synonymAdminRoutes = require('./routes/synonymAdmin');
const ttsRoutes = require('./routes/tts');

const rateLimit = require('express-rate-limit');

const app = express();

// --- Rate Limiting for public endpoints ---
const askLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per minute
  message: { error: 'Too many requests, please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

// --- CORS: allow the widget to be embedded on the publisher's site(s) ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim());
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins
  })
);

app.use(express.json());

// --- Static files: admin panel + embeddable widget ---
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));
app.use('/widget', express.static(path.join(__dirname, '..', 'public', 'widget')));

// --- API routes ---
app.use('/api/ask', askLimiter, askRoute);
app.use('/api/tts', ttsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin/qa', qaAdminRoutes);
app.use('/api/admin/synonyms', synonymAdminRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
