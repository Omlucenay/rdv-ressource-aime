const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { google } = require('googleapis');
const { oauth2Client, getTokens } = require('./auth');
const { PRESTATIONS } = require('./index');
const { KARLA_PRESTATIONS } = require('./karla');
const db = require('../db/connection');
const mailer = require('../db/mailer');

router.post('/create', async (req, res) => {
const { prestationId, mode, date, heure, nom, prenom, email, telephone } = req.body;
const prestation = PRESTATIONS.find(p => p.id === prestationId);
if (!prestation) return res.status(400).send('Prestation inconnue');

try {
const [result] = await db.execute(
`INSERT INTO reservations  (prestation_id, prestation_titre, mode, date, heure, nom, prenom, email, telephone, statut, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
[prestationId, prestation.titre, mode, date, heure, nom, prenom, email, telephone]
);
const reservationId = result.insertId;

if (prestationId === 'forfait_individuel') {
  return res.redirect(303, 'https://www.ressource-aime.fr/forfaits');
}

if (prestationId === 'forfait_couple') {
  return res.redirect(303, 'https://urls.fr/drh9UE');
}

if (prestation.paiement) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: prestation.titre,
          description: `${date} a ${heure} - ${mode === 'cabinet' ? 'En cabinet' : 'Visio'}`
        },
        unit_amount: prestation.prix * 100
      },
      quantity: 1
    }],
    mode: 'payment',
    success_url: `${process.env.BASE_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/booking/cancel`,
    metadata: { reservationId: String(reservationId) },
    customer_email: email
  });

  await db.execute(
    'UPDATE reservations SET stripe_session_id = ? WHERE id = ?',
    [session.id, reservationId]
  );

  return res.redirect(303, session.url);
}

await confirmerReservation(reservationId);
res.redirect(`/booking/success?rid=${reservationId}`);

} catch (err) {
console.error('Erreur booking:', err);
res.status(500).send('Une erreur est survenue lors de la réservation.');
}
});

router.get('/success', (req, res) => res.render('success'));
router.get('/cancel', (req, res) => res.render('cancel'));

async function confirmerReservation(reservationId) {
const [rows] = await db.execute('SELECT * FROM reservations WHERE id = ?', [reservationId]);
const resa = rows[0];
if (!resa) return;

const tokens = await getTokens();
if (tokens) {
  oauth2Client.setCredentials(tokens);
  oauth2Client.on('tokens', async (newTokens) => {
    if (newTokens.refresh_token || newTokens.access_token) {
      const merged = { ...tokens, ...newTokens };
      await db.execute(
        'INSERT INTO google_tokens (id, tokens) VALUES (1, ?) ON DUPLICATE KEY UPDATE tokens = ?',
        [JSON.stringify(merged), JSON.stringify(merged)]
      );
    }
  });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const dateObj = new Date(resa.date);
dateObj.setHours(dateObj.getHours() + 4);
const dateStr = dateObj.toISOString().split('T')[0];
const heureStr = String(resa.heure).substring(0, 5);
console.log('DEBUG date brute:', resa.date);
console.log('DEBUG dateStr:', dateStr);
console.log('DEBUG heureStr:', heureStr);
console.log('DEBUG dateTimeStart:', new Date(`${dateStr}T${heureStr}:00-04:00`).toISOString());
const dateTimeStart = new Date(`${dateStr}T${heureStr}:00-04:00`);
const dateTimeEnd = new Date(dateTimeStart.getTime() + 60 * 60 * 1000);

await calendar.events.insert({
  calendarId: ['seance_enfant','seance_adulte'].includes(resa.prestation_id)
    ? process.env.GOOGLE_CALENDAR_KARLA
    : process.env.GOOGLE_CALENDAR_CABINET,
  requestBody: {
    summary: `${resa.prestation_titre} — ${resa.prenom} ${resa.nom}`,
    description: `Email: ${resa.email}\nTél: ${resa.telephone}\nMode: ${resa.mode}`,
    start: { dateTime: dateTimeStart.toISOString(), timeZone: 'America/Martinique' },
    end: { dateTime: dateTimeEnd.toISOString(), timeZone: 'America/Martinique' }
  }
});

}

await db.execute('UPDATE reservations SET statut = ? WHERE id = ?', ['confirmed', reservationId]);
await mailer.sendConfirmationClient(resa);
await mailer.sendNotificationAdmin(resa);
}

module.exports = router;
module.exports.confirmerReservation = confirmerReservation;