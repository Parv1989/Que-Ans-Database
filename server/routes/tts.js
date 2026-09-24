const express = require('express');
const router = express.Router();
const googleTTS = require('google-tts-api');

// GET /api/tts?text=...&lang=hi
router.get('/', async (req, res) => {
  try {
    const text = (req.query.text || '').trim();
    const lang = req.query.lang || 'hi';
    if (!text) return res.status(400).json({ error: 'Text parameter is required' });

    // Fetch Google TTS audio base64 server-side to prevent browser CORS / 403 hotlink blocks
    const results = await googleTTS.getAllAudioBase64(text, {
      lang: 'hi',
      slow: false,
      host: 'https://translate.google.com',
      timeout: 10000
    });

    const audios = results.map((r) => `data:audio/mp3;base64,${r.base64}`);
    res.json({ audios });
  } catch (err) {
    console.error('TTS generation error:', err.message);
    res.status(500).json({ error: 'TTS generation failed: ' + err.message });
  }
});

module.exports = router;
