const express = require('express');
const crypto = require('crypto');
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

async function withRetry(fn, retries = 2, delayMs = 3000) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return withRetry(fn, retries - 1, delayMs);
  }
}

// N'importe qui visitant /auth/google pouvait écraser les tokens Google réels par les siens
// (créer une session Google avec son propre compte) et casser la prise de RDV en production.
// Route désormais protégée par un secret connu seulement d'Olivier (GOOGLE_AUTH_ADMIN_SECRET),
// vérifié à temps constant. L'autorisation est portée par la session le temps de l'aller-retour
// OAuth (le paramètre ne survit pas jusqu'au callback), consommée une seule fois.
function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

router.get('/google', (req, res) => {
  const expected = process.env.GOOGLE_AUTH_ADMIN_SECRET;
  const provided = req.query.key || '';
  if (!expected || !timingSafeEqualStrings(provided, expected)) {
    res.status(403).send('Accès refusé.');
    return;
  }
  req.session.googleAuthPending = true;
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  if (!req.session.googleAuthPending) {
    res.status(403).send('Accès refusé.');
    return;
  }
  req.session.googleAuthPending = false;
  const { code } = req.query;
  try {
    const { tokens } = await withRetry(() => oauth2Client.getToken(code));
    await db.execute(
      'INSERT INTO google_tokens (id, tokens) VALUES (1, ?) ON DUPLICATE KEY UPDATE tokens = ?',
      [JSON.stringify(tokens), JSON.stringify(tokens)]
    );
    res.redirect('/');
  } catch (err) {
    console.error('Erreur OAuth:', err);
    res.send('Échec de la connexion à Google Agenda (problème réseau temporaire). <a href="/auth/google">Réessayer</a>.');
  }
});

async function getTokens() {
  const [rows] = await db.execute('SELECT tokens FROM google_tokens WHERE id = 1');
  if (rows.length === 0) return null;
  const tokens = JSON.parse(rows[0].tokens);
  oauth2Client.setCredentials(tokens);
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60000) {
    try {
      const { credentials } = await withRetry(() => oauth2Client.refreshAccessToken());
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