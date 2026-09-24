const express = require('express');
const router = express.Router();
const googleTTS = require('google-tts-api');

// GET /api/tts?text=...&lang=hi
router.get('/', async (req, res) => {
  try {
    const text = (req.query.text || '').trim();
    const lang = req.query.lang || 'hi';
    if (!text) return res.status(400).json({ error: 'Text parameter is required' });

    // Generate Google TTS audio URLs for chunks of text
    const results = googleTTS.getAllAudioUrls(text, {
      lang: 'hi',
      slow: false,
      host: 'https://translate.google.com',
      timeout: 10000
    });

    res.json({ urls: results.map((r) => r.url) });
  } catch (err) {
    console.error('TTS generation error:', err.message);
    res.status(500).json({ error: 'TTS generation failed' });
  }
});

module.exports = router;
