const express = require('express');
const router = express.Router();

const PRESTATIONS = [
  {
    id: 'decouverte',
    eyebrow: 'Première fois · Sans engagement',
    titre: 'Appel découverte',
    duree: '15 min',
    mode: 'visio',
    prix: 0,
    prixLabel: 'Gratuit',
    paiement: false,
    wide: true
  },
  {
    id: 'seance_couple',
    eyebrow: 'Couples',
    titre: 'Séance couple',
    duree: '1h',
    mode: 'cabinet_ou_visio',
    prix: parseInt(process.env.PRIX_SEANCE_COUPLE),
    prixLabel: `${process.env.PRIX_SEANCE_COUPLE} €`,
    paiement: true,
    
  },
  {
    id: 'forfait_couple',
    eyebrow: 'Couples · Engagement',
    titre: 'Forfait couple',
    duree: '6 séances',
    mode: 'cabinet_ou_visio',
    prix: parseInt(process.env.PRIX_FORFAIT_COUPLE),
    prixLabel: `${process.env.PRIX_FORFAIT_COUPLE} € — soit 115 € la séance`,
    paiement: true,
    echelon: true
  },
  {
    id: 'seance_individuel',
    eyebrow: 'Individuel',
    titre: 'Séance individuelle',
    duree: '1h',
    mode: 'cabinet_ou_visio',
    prix: parseInt(process.env.PRIX_SEANCE_INDIVIDUEL),
    prixLabel: `${process.env.PRIX_SEANCE_INDIVIDUEL} €`,
    paiement: false
  },
  {
    id: 'forfait_individuel',
    eyebrow: 'Individuel · Engagement',
    titre: 'Forfait individuel',
    duree: '6 séances',
    mode: 'cabinet_ou_visio',
    prix: parseInt(process.env.PRIX_FORFAIT_INDIVIDUEL),
    prixLabel: `${process.env.PRIX_FORFAIT_INDIVIDUEL} € — soit 65 € la séance`,
    paiement: false,
    echelon: true
  },
{
  id: 'seance_enfant',
  eyebrow: 'Enfants · Karla',
  titre: 'Séance enfant',
  duree: '1h',
  mode: 'cabinet',
  prix: 0,
  prixLabel: 'Règlement sur place',
  paiement: false,
  praticien: 'karla'
}];

router.get('/', (req, res) => {
  res.render('index', {
    prestations: PRESTATIONS.filter(p => p.id !== 'seance_enfant'),
    stripePublicKey: process.env.STRIPE_PUBLIC_KEY
  });
});

module.exports = router;
module.exports.PRESTATIONS = PRESTATIONS;