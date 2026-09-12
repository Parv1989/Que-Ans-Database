const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// POST /api/auth/login  { username, password }
// Simple single-admin login: credentials live in .env, not in the database.
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token });
  }

  return res.status(401).json({ error: 'Invalid username or password' });
});

module.exports = router;
