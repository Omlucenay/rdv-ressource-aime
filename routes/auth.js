const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const db = require('../db/connection');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

router.get('/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    await db.execute(
      'INSERT INTO google_tokens (id, tokens) VALUES (1, ?) ON DUPLICATE KEY UPDATE tokens = ?',
      [JSON.stringify(tokens), JSON.stringify(tokens)]
    );
    res.redirect('/');
  } catch (err) {
    console.error('Erreur OAuth:', err);
    res.redirect('/');
  }
});

async function getTokens() {
  const [rows] = await db.execute('SELECT tokens FROM google_tokens WHERE id = 1');
  if (rows.length === 0) return null;
  const tokens = JSON.parse(rows[0].tokens);
  oauth2Client.setCredentials(tokens);
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await db.execute(
        'INSERT INTO google_tokens (id, tokens) VALUES (1, ?) ON DUPLICATE KEY UPDATE tokens = ?',
        [JSON.stringify(credentials), JSON.stringify(credentials)]
      );
      return credentials;
    } catch (err) {
      console.error('Erreur refresh token:', err);
      return null;
    }
  }
  return tokens;
}

module.exports = router;
module.exports.oauth2Client = oauth2Client;
module.exports.getTokens = getTokens;