const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { google } = require('googleapis');
const { oauth2Client, getTokens } = require('./auth');
const { PRESTATIONS } = require('./index');
const { KARLA_PRESTATIONS } = require('./karla');
const db = require('../db/connection');
const mailer = require('../db/mailer');

function formatDateFR(dateVal) {
  const jours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d = new Date(dateVal);
  return `${jours[d.getUTCDay()]} ${d.getUTCDate()} ${mois[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const PRESTATIONS_COUPLE = ['seance_couple', 'forfait_couple'];
const KARLA_PRESTATION_IDS = KARLA_PRESTATIONS.map(p => p.id);
const isKarlaResa = resa => resa && KARLA_PRESTATION_IDS.includes(resa.prestation_id);
const brandOf = resa => isKarlaResa(resa) ? 'Karla' : 'Ressource A.I.M.E';
const tokenValid = (resa, req) => req.query.t === resa.manage_token;

router.post('/create', async (req, res) => {
  const { prestationId, mode, date, heure, nom, prenom, email, telephone,
          prenom_partenaire, nom_partenaire, telephone_partenaire, replace_id,
          enfant_prenom, enfant_age } = req.body;
  const prestation = PRESTATIONS.find(p => p.id === prestationId) || KARLA_PRESTATIONS.find(p => p.id === prestationId);
  if (!prestation) return res.status(400).send('Prestation inconnue');

  try {
    const manageToken = crypto.randomBytes(16).toString('hex');
    const [result] = await db.execute(
      `INSERT INTO reservations (prestation_id, prestation_titre, mode, date, heure, nom, prenom, email, telephone, prenom_partenaire, nom_partenaire, telephone_partenaire, replace_id, enfant_prenom, enfant_age, manage_token, statut, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [prestationId, prestation.titre, mode, date, heure, nom, prenom, email, telephone,
       prenom_partenaire || null, nom_partenaire || null, telephone_partenaire || null, replace_id || null,
       enfant_prenom || null, enfant_age || null, manageToken]
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
              description: `${date} à ${heure} - ${mode === 'cabinet' ? 'En cabinet' : 'En visio'}`
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

router.get('/success', async (req, res) => {
  try {
    const { rid, session_id } = req.query;
    let resa = null;
    if (rid) {
      const [rows] = await db.execute('SELECT * FROM reservations WHERE id = ?', [rid]);
      resa = rows[0];
    } else if (session_id) {
      const [rows] = await db.execute('SELECT * FROM reservations WHERE stripe_session_id = ?', [session_id]);
      resa = rows[0];
    }
    res.render('success', { homeLink: isKarlaResa(resa) ? '/karla' : '/', brand: brandOf(resa) });
  } catch (err) {
    console.error('Erreur success:', err);
    res.render('success', { homeLink: '/', brand: 'Ressource A.I.M.E' });
  }
});
// Séances Karla non payantes (paiement Stripe non utilisé) : /cancel n'est jamais atteint par ce parcours.
router.get('/cancel', (req, res) => res.render('cancel'));
router.get('/cancelled', (req, res) => {
  const karla = req.query.home === '/karla';
  res.render('cancelled', { homeLink: karla ? '/karla' : '/', brand: karla ? 'Karla' : 'Ressource A.I.M.E' });
});

router.get('/gerer/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM reservations WHERE id = ?', [req.params.id]);
    const resa = rows[0];
    if (!resa || !tokenValid(resa, req)) return res.status(404).send('Réservation introuvable');
    const karla = isKarlaResa(resa);
    const homeLink = karla ? '/karla' : '/';
    const replaceSuffix = resa.manage_token ? `&t=${resa.manage_token}` : '';
    const newSlotLink = resa.prestation_id === 'decouverte'
      ? `/decouverte?replace=${resa.id}${replaceSuffix}`
      : karla ? '/karla' : `/?prestation=${resa.prestation_id}&replace=${resa.id}${replaceSuffix}`;
    res.render('manage', { resa, formatDateFR, homeLink, newSlotLink, token: resa.manage_token, brand: brandOf(resa) });
  } catch (err) {
    console.error('Erreur manage:', err);
    res.status(500).send('Une erreur est survenue.');
  }
});

router.get('/manage/:id', (req, res) => res.redirect(`/booking/gerer/${req.params.id}${req.query.t ? `?t=${req.query.t}` : ''}`));

router.get('/annuler/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM reservations WHERE id = ?', [req.params.id]);
    const resa = rows[0];
    if (!resa || !tokenValid(resa, req)) return res.status(404).send('Réservation introuvable');
    res.render('annuler', { resa, formatDateFR, homeLink: isKarlaResa(resa) ? '/karla' : '/', token: resa.manage_token, brand: brandOf(resa) });
  } catch (err) {
    console.error('Erreur annuler:', err);
    res.status(500).send('Une erreur est survenue.');
  }
});

router.get('/cancel/:id', (req, res) => res.redirect(`/booking/annuler/${req.params.id}${req.query.t ? `?t=${req.query.t}` : ''}`));

async function annulerReservation(resa) {
  if (!resa || resa.statut === 'cancelled') return;

  const tokens = await getTokens();
  if (tokens && resa.google_event_id) {
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calId = ['seance_enfant', 'seance_adulte'].includes(resa.prestation_id)
      ? process.env.GOOGLE_CALENDAR_KARLA
      : process.env.GOOGLE_CALENDAR_CABINET;
    await calendar.events.delete({
      calendarId: calId,
      eventId: resa.google_event_id,
      sendUpdates: 'all'
    }).catch(() => {});
  }

  await db.execute("UPDATE reservations SET statut = 'cancelled' WHERE id = ?", [resa.id]);
}

router.post('/annuler/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM reservations WHERE id = ?', [req.params.id]);
    const resa = rows[0];
    if (!resa || !tokenValid(resa, req)) return res.status(404).send('Réservation introuvable');
    const home = isKarlaResa(resa) ? '/karla' : '/';
    if (resa.statut === 'cancelled') return res.redirect(`/booking/cancelled?home=${encodeURIComponent(home)}`);

    await annulerReservation(resa);
    res.redirect(`/booking/cancelled?home=${encodeURIComponent(home)}`);
  } catch (err) {
    console.error('Erreur annulation:', err);
    res.status(500).send('Une erreur est survenue lors de l\'annulation.');
  }
});

async function confirmerReservation(reservationId) {
  const [rows] = await db.execute('SELECT * FROM reservations WHERE id = ?', [reservationId]);
  const resa = rows[0];
  if (!resa) return;

  if (resa.replace_id) {
    const [oldRows] = await db.execute('SELECT * FROM reservations WHERE id = ?', [resa.replace_id]);
    await annulerReservation(oldRows[0]);
  }

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

    const dateStr = resa.date;
    const heureStr = String(resa.heure).substring(0, 5);
    const dateTimeStart = new Date(`${dateStr}T${heureStr}:00-04:00`);
    const dureeMin = resa.prestation_id === 'decouverte' ? 15 : 60;
    const dateTimeEnd = new Date(dateTimeStart.getTime() + dureeMin * 60 * 1000);

    const calId = ['seance_enfant', 'seance_adulte'].includes(resa.prestation_id)
      ? process.env.GOOGLE_CALENDAR_KARLA
      : process.env.GOOGLE_CALENDAR_CABINET;

    const isCouple = PRESTATIONS_COUPLE.includes(resa.prestation_id);
    const isTelephone = resa.prestation_id === 'decouverte';
    const isVisio  = !isTelephone && resa.mode === 'visio';
    const karla = isKarlaResa(resa);

    // Titre de l'événement — le séparateur " et " (pas "&") est requis par le parser n8n cabinet-calendar-to-notion
    const nomClientEvenement = isCouple && resa.prenom_partenaire
      ? `${resa.prenom} ${resa.nom} et ${resa.prenom_partenaire} ${resa.nom_partenaire}`
      : `${resa.prenom} ${resa.nom}`;
    const summary = `${nomClientEvenement} et Centre Thérapeutique RESSOURCE A.I.M.E`;

    // Type d'événement — le parser n8n lit cette ligne pour classer la séance (découverte/couple/visio/individuelle).
    // Karla n'est jamais sur le calendrier cabinet lu par ce parser (calendrier Karla séparé), donc son libellé n'a pas besoin de matcher le parser.
    const typeEvenement = isTelephone
      ? 'Appel découverte gratuit'
      : isCouple
      ? 'Séance couple'
      : karla
      ? resa.prestation_titre
      : isVisio
      ? 'Individuelle visio'
      : 'Séance individuelle';

    // Description selon le contexte
    const infoContact = isCouple && resa.prenom_partenaire ? `
Nom d'événement
${typeEvenement}

👤 Contact principal : ${resa.prenom} ${resa.nom}
📧 ${resa.email}
📞 Téléphone : ${resa.telephone}

👤 Partenaire : ${resa.prenom_partenaire} ${resa.nom_partenaire}${resa.telephone_partenaire ? `\n📞 Téléphone : ${resa.telephone_partenaire}` : ''}
` : `
Nom d'événement
${typeEvenement}

👤 ${resa.prenom} ${resa.nom}
📧 ${resa.email}
📞 Téléphone : ${resa.telephone}
${resa.prestation_id === 'seance_enfant' && resa.enfant_prenom ? `\n👶 Enfant : ${resa.enfant_prenom}${resa.enfant_age ? ` (${resa.enfant_age} ans)` : ''}` : ''}
`;

    const infoLieu = isVisio ? `
💻 Séance en visio — Le lien Google Meet sera disponible dans cet événement.` : isTelephone ? `
📞 Cet entretien téléphonique gratuit nous permettra de faire connaissance et d'explorer ensemble le parcours adapté à votre demande.
Nous vous appellerons au numéro renseigné, à l'heure du rendez-vous.` : `
📍 Accès au cabinet :
Le cabinet se trouve à l'étage du Centre Commercial Place d'Armes.
Privilégiez l'entrée par la porte rose qui débouche sur la Pharmacie du centre.
Nous sommes dans la zone rouge, porte 211.
Sonnez à l'interphone « Ressource A.I.M.E »`;

    // Individuel en visio : pas de terminal SumUp physique, lien de paiement en ligne
    const tarifLigne = isTelephone
      ? 'Gratuit'
      : isVisio && resa.prestation_id === 'seance_individuel'
      ? 'à régler en ligne après la séance — <a href="https://pay.sumup.com/b2c/QKXGOT7O">cliquez ici pour payer</a>'
      : 'à régler en fin de séance';

    const description = `${infoContact}
────────────────────────
${infoLieu}

💳 Tarif : ${tarifLigne}

────────────────────────

Souhaitez-vous modifier ce rendez-vous ?
❌ Annuler : ${process.env.BASE_URL}/booking/annuler/${resa.id}?t=${resa.manage_token}
🔄 Modifier : ${process.env.BASE_URL}/booking/gerer/${resa.id}?t=${resa.manage_token}

À bientôt !
${karla ? 'Karla Ampigny Lucenay' : "L'équipe de Ressource A.I.M.E"}${isTelephone ? '' : `\n📞 ${karla ? '06 96 75 65 02' : '06 96 69 60 21'}`}`;

    // Conférence Google Meet pour les visios
    const conferenceData = isVisio ? {
      createRequest: {
        requestId: `rdv-${reservationId}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    } : undefined;

    const eventBody = {
      summary,
      description,
      start: { dateTime: dateTimeStart.toISOString(), timeZone: 'America/Martinique' },
      end: { dateTime: dateTimeEnd.toISOString(), timeZone: 'America/Martinique' },
      attendees: [{ email: resa.email, displayName: `${resa.prenom} ${resa.nom}` }]
    };

    if (!isVisio && !isTelephone) {
      eventBody.location = 'Centre Commercial Place d\'Armes, Le Lamentin, Martinique';
    }

    if (conferenceData) {
      eventBody.conferenceData = conferenceData;
    }

    const event = await calendar.events.insert({
      calendarId: calId,
      sendUpdates: 'all',
      conferenceDataVersion: isVisio ? 1 : 0,
      requestBody: eventBody
    });

    await db.execute(
      'UPDATE reservations SET google_event_id = ? WHERE id = ?',
      [event.data.id, reservationId]
    );
  }

  await db.execute('UPDATE reservations SET statut = ? WHERE id = ?', ['confirmed', reservationId]);
  await mailer.sendConfirmationClient(resa);
  await mailer.sendNotificationAdmin(resa);
}

module.exports = router;
module.exports.confirmerReservation = confirmerReservation;