const express = require('express');
const router = express.Router();

const KARLA_PRESTATIONS = [
  {
    id: 'seance_enfant',
    eyebrow: 'Consultation · Enfants & Adolescents',
    titre: 'Séance enfant / ado',
    description: 'Dès 4 ans, jusqu\'à 17 ans. Je reçois l\'enfant et j\'accompagne les parents en parallèle.',
    duree: '1h',
    prixLabel: 'Règlement sur place',
    paiement: false
  },
  {
    id: 'seance_adulte',
    eyebrow: 'Consultation · Adultes & Guidance parentale',
    titre: 'Séance adulte',
    description: 'Burn-out parental, anxiété, difficultés relationnelles. La thérapie commence quand on décide de ne plus faire semblant.',
    duree: '1h',
    prixLabel: 'Règlement sur place',
    paiement: false
  }
];

router.get('/', (req, res) => {
  res.render('karla', { prestations: KARLA_PRESTATIONS });
});

module.exports = router;
module.exports.KARLA_PRESTATIONS = KARLA_PRESTATIONS;