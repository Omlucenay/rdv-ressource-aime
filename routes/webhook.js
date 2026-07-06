const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { confirmerReservation } = require('./booking');

// IMPORTANT : raw body nécessaire pour vérifier la signature Stripe
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
        console.log(`Réservation ${reservationId} confirmée via Stripe`);
      } catch (err) {
        console.error('Erreur confirmation réservation:', err);
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;