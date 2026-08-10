const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const crypto = require('crypto');

const TACHES_POSITIVES = [
  { titre: 'Mettre la table', points: 15, icone: '🍽️' },
  { titre: 'Promener le chien', points: 20, icone: '🐾' },
  { titre: 'Ranger la chambre', points: 25, icone: '🛏️' },
  { titre: 'Devoirs faits', points: 30, icone: '📚' },
  { titre: 'Faire le lit', points: 10, icone: '🛌' },
  { titre: 'Nourrir l\'animal', points: 10, icone: '🐶' },
  { titre: 'Ranger les jouets', points: 10, icone: '📦' },
  { titre: 'Vider le lave-vaisselle', points: 15, icone: '🍽️' },
  { titre: 'Sortir la poubelle', points: 15, icone: '🗑️' },
  { titre: 'Aider à cuisiner', points: 20, icone: '🔥' },
  { titre: 'Passer l\'aspirateur', points: 20, icone: '💨' },
  { titre: 'Arroser les plantes', points: 10, icone: '💧' },
];

const TACHES_NEGATIVES = [
  { titre: 'Lumières allumées', points: -5, icone: '💡' },
  { titre: 'Oublier la chasse', points: -10, icone: '🚿' },
  { titre: 'En retard au dîner', points: -15, icone: '⏰' },
  { titre: 'Crier', points: -20, icone: '📢' },
  { titre: 'Sol en désordre', points: -10, icone: '🧹' },
  { titre: 'Se disputer', points: -25, icone: '💬' },
  { titre: 'N\'a pas fait le lit', points: -5, icone: '🛌' },
  { titre: 'Trop de TV', points: -15, icone: '📺' },
];

function requireFamille(req, res, next) {
  if (!req.session.famille_id) return res.redirect('/famille/setup');
  next();
}

router.get('/', requireFamille, (req, res) => {
  res.render('famille/app', {
    famille_id: req.session.famille_id,
    membre_id: req.session.membre_id || null
  });
});

router.get('/setup', (req, res) => {
  if (req.session.famille_id) return res.redirect('/famille');
  res.render('famille/setup');
});

router.post('/setup/creer', async (req, res) => {
  const { nom_famille, prenom, avatar, couleur } = req.body;
  if (!nom_famille || !prenom || !avatar) {
    return res.status(400).json({ error: 'Données manquantes' });
  }
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [famResult] = await conn.execute(
      'INSERT INTO familles (nom, code) VALUES (?, ?)',
      [nom_famille.trim(), code]
    );
    const famille_id = famResult.insertId;
    const [memResult] = await conn.execute(
      'INSERT INTO membres (famille_id, prenom, avatar, couleur, role) VALUES (?, ?, ?, ?, ?)',
      [famille_id, prenom.trim(), avatar, couleur || '#3B82F6', 'parent']
    );
    for (const t of [...TACHES_POSITIVES, ...TACHES_NEGATIVES]) {
      await conn.execute(
        'INSERT INTO taches (famille_id, titre, points, icone) VALUES (?, ?, ?, ?)',
        [famille_id, t.titre, t.points, t.icone]
      );
    }
    await conn.commit();
    req.session.famille_id = famille_id;
    req.session.membre_id = memResult.insertId;
    res.json({ success: true, code });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

router.post('/setup/rejoindre', async (req, res) => {
  const { code, prenom, avatar, couleur } = req.body;
  if (!code || !prenom || !avatar) {
    return res.status(400).json({ error: 'Données manquantes' });
  }
  try {
    const [familles] = await pool.execute(
      'SELECT * FROM familles WHERE code = ?',
      [code.trim().toUpperCase()]
    );
    if (familles.length === 0) {
      return res.status(404).json({ error: 'Code famille introuvable' });
    }
    const famille = familles[0];
    const [memResult] = await pool.execute(
      'INSERT INTO membres (famille_id, prenom, avatar, couleur, role) VALUES (?, ?, ?, ?, ?)',
      [famille.id, prenom.trim(), avatar, couleur || '#3B82F6', 'enfant']
    );
    req.session.famille_id = famille.id;
    req.session.membre_id = memResult.insertId;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/quitter', (req, res) => {
  req.session.famille_id = null;
  req.session.membre_id = null;
  res.redirect('/famille/setup');
});

// ── API ──────────────────────────────────────────────────────────────

router.get('/api/info', requireFamille, async (req, res) => {
  try {
    const [familles] = await pool.execute('SELECT * FROM familles WHERE id = ?', [req.session.famille_id]);
    const [membres] = await pool.execute(
      'SELECT * FROM membres WHERE famille_id = ? ORDER BY created_at',
      [req.session.famille_id]
    );
    res.json({ famille: familles[0], membres, membre_id: req.session.membre_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/api/scores', requireFamille, async (req, res) => {
  const periode = req.query.periode || 'semaine';
  const filters = {
    semaine: 'YEARWEEK(a.created_at, 1) = YEARWEEK(CURDATE(), 1)',
    mois:    'DATE(a.created_at) >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)',
    annee:   'YEAR(a.created_at) = YEAR(CURDATE())',
  };
  const dateFilter = filters[periode] || filters.semaine;
  try {
    const [membres] = await pool.execute(
      `SELECT m.id, m.prenom, m.avatar, m.couleur,
              COALESCE(SUM(a.points), 0) as total_points
       FROM membres m
       LEFT JOIN attributions a ON a.membre_id = m.id AND ${dateFilter}
       WHERE m.famille_id = ?
       GROUP BY m.id
       ORDER BY total_points DESC`,
      [req.session.famille_id]
    );
    res.json({ membres, periode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/api/activite', requireFamille, async (req, res) => {
  try {
    const [activites] = await pool.execute(
      `SELECT a.id, a.points, a.created_at,
              m.prenom, m.avatar, m.couleur,
              t.titre as tache_titre
       FROM attributions a
       JOIN membres m ON m.id = a.membre_id
       JOIN taches t ON t.id = a.tache_id
       WHERE m.famille_id = ?
       ORDER BY a.created_at DESC
       LIMIT 25`,
      [req.session.famille_id]
    );
    res.json({ activites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/api/taches', requireFamille, async (req, res) => {
  try {
    const [taches] = await pool.execute(
      'SELECT * FROM taches WHERE famille_id = ? AND active = 1 ORDER BY ABS(points) DESC',
      [req.session.famille_id]
    );
    res.json({ positives: taches.filter(t => t.points > 0), negatives: taches.filter(t => t.points < 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/api/attribution', requireFamille, async (req, res) => {
  const { membre_id, tache_id } = req.body;
  if (!membre_id || !tache_id) return res.status(400).json({ error: 'Données manquantes' });
  try {
    const [[tache]] = await pool.execute(
      'SELECT * FROM taches WHERE id = ? AND famille_id = ? AND active = 1',
      [tache_id, req.session.famille_id]
    );
    if (!tache) return res.status(403).json({ error: 'Tâche introuvable' });

    const [[membre]] = await pool.execute(
      'SELECT * FROM membres WHERE id = ? AND famille_id = ?',
      [membre_id, req.session.famille_id]
    );
    if (!membre) return res.status(403).json({ error: 'Membre introuvable' });

    await pool.execute(
      'INSERT INTO attributions (membre_id, tache_id, points) VALUES (?, ?, ?)',
      [membre_id, tache_id, tache.points]
    );

    const [scores] = await pool.execute(
      `SELECT m.id, m.prenom, m.avatar, m.couleur,
              COALESCE(SUM(a.points), 0) as total_points
       FROM membres m
       LEFT JOIN attributions a ON a.membre_id = m.id
         AND YEARWEEK(a.created_at, 1) = YEARWEEK(CURDATE(), 1)
       WHERE m.famille_id = ?
       GROUP BY m.id
       ORDER BY total_points DESC`,
      [req.session.famille_id]
    );

    res.json({ success: true, membre, tache, champion: scores[0], scores });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/api/tache', requireFamille, async (req, res) => {
  const { titre, points, icone } = req.body;
  if (!titre || points === undefined) return res.status(400).json({ error: 'Données manquantes' });
  try {
    const [result] = await pool.execute(
      'INSERT INTO taches (famille_id, titre, points, icone) VALUES (?, ?, ?, ?)',
      [req.session.famille_id, titre.trim(), parseInt(points), icone || '⭐']
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/api/tache/:id', requireFamille, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE taches SET active = 0 WHERE id = ? AND famille_id = ?',
      [req.params.id, req.session.famille_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/api/membre', requireFamille, async (req, res) => {
  const { prenom, avatar, couleur, role } = req.body;
  if (!prenom || !avatar) return res.status(400).json({ error: 'Données manquantes' });
  try {
    const [result] = await pool.execute(
      'INSERT INTO membres (famille_id, prenom, avatar, couleur, role) VALUES (?, ?, ?, ?, ?)',
      [req.session.famille_id, prenom.trim(), avatar, couleur || '#3B82F6', role || 'enfant']
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/api/membre/:id', requireFamille, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM membres WHERE id = ? AND famille_id = ?',
      [req.params.id, req.session.famille_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/api/reset-scores', requireFamille, async (req, res) => {
  try {
    await pool.execute(
      `DELETE a FROM attributions a
       JOIN membres m ON m.id = a.membre_id
       WHERE m.famille_id = ?`,
      [req.session.famille_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/api/juge', requireFamille, async (req, res) => {
  const { situation } = req.body;
  if (!situation) return res.status(400).json({ error: 'Situation manquante' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.json({ verdict: "Le Juge IA n'est pas encore configuré. Discutez en famille et votez !" });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        messages: [{
          role: 'user',
          content: `Tu es le Juge IA d'une app de gamification familiale. Arbitre cette situation en 2-3 phrases, de façon juste et bienveillante. Indique si des points doivent être attribués ou retirés, et à qui. Réponds en français.\n\nSituation: ${situation}`
        }]
      })
    });
    const data = await response.json();
    res.json({ verdict: data.content[0].text });
  } catch (err) {
    console.error(err);
    res.json({ verdict: "Je ne peux pas rendre de verdict maintenant. Discutez en famille !" });
  }
});

module.exports = router;
