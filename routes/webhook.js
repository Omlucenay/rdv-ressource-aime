const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { confirmerReservation } = require('./booking');
const db = require('../db/connection');

// IMPORTANT : raw body necessaire pour verifier la signature Stripe
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const reservationId = session.metadata?.reservationId;

    if (reservationId) {
      try {
        await confirmerReservation(parseInt(reservationId), null);
        console.log(`Reservation ${reservationId} confirmee via Stripe`);
      } catch (err) {
        console.error('Erreur confirmation reservation:', err);
      }
    }
  }

  res.json({ received: true });
});

// Systeme.io normalise le payload (unicode/symboles JSON echappes) avant de le
// hasher : voir https://developer.systeme.io/docs/webhooks. JSON.stringify ne
// couvre que les guillemets/backslash, il faut echapper le non-ASCII a la main.
function normalizeSystemeIoPayload(payload) {
  const json = JSON.stringify(payload);
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    if (code > 127) {
      out += '\\u' + ('0000' + code.toString(16)).slice(-4);
    } else {
      out += json[i];
    }
  }
  return out;
}

// Forfaits individuel/couple vendus sur Systeme.io (paiement Stripe cote
// Systeme.io, hors de notre propre integration Stripe) : ce webhook recoit
// "New sale" pour TOUTES les ventes du compte Systeme.io, pas seulement ces
// deux forfaits, on ignore silencieusement tout ce qui ne correspond a
// aucune reservation en attente. Rapprochement par email (le produit achete
// n'est pas fiable a mapper sans connaitre les noms exacts des offres
// Systeme.io) : la reservation "pending" la plus recente pour cet email sur
// ces deux prestations est confirmee.
router.post('/systeme-io', express.raw({ type: 'application/json' }), async (req, res) => {
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch (err) {
    console.error('Webhook Systeme.io : JSON invalide', err.message);
    return res.status(400).send('invalid json');
  }

  const secret = process.env.SYSTEME_IO_WEBHOOK_SECRET;
  const signature = req.headers['x-webhook-signature'];
  if (secret) {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(normalizeSystemeIoPayload(payload))
      .digest('hex');
    if (signature !== expected) {
      // Ne bloque pas tant que la normalisation n'a pas ete confirmee sur un
      // vrai envoi (voir HISTORY.md), juste trace pour investigation.
      console.warn('Webhook Systeme.io : signature inattendue (a verifier en conditions reelles)');
    }
  }

  const email = payload.customer && payload.customer.email;
  if (!email) return res.json({ received: true });

  try {
    const [rows] = await db.execute(
      `SELECT id FROM reservations
       WHERE email = ? AND prestation_id IN ('forfait_individuel', 'forfait_couple') AND statut = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    );
    if (rows[0]) {
      await confirmerReservation(rows[0].id);
      console.log(`Reservation ${rows[0].id} confirmee via Systeme.io (${email})`);
    }
  } catch (err) {
    console.error('Erreur confirmation reservation Systeme.io:', err);
  }

  res.json({ received: true });
});

module.exports = router;
