const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

const transporterKarla = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER_KARLA,
    pass: process.env.SMTP_PASSWORD_KARLA
  }
});

function formatDateFR(dateVal) {
  const jours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d = new Date(dateVal);
  return `${jours[d.getUTCDay()]} ${d.getUTCDate()} ${mois[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const modeLabel = resa => resa.prestation_id === 'decouverte'
  ? 'Par téléphone — nous vous appellerons'
  : resa.mode === 'cabinet'
  ? 'Au cabinet — Centre commercial Place d\'Armes, à l\'étage'
  : 'En visio';

const indicationsCabinet = mode => mode === 'cabinet' ? `
  <p style="background:#F0D4CC;padding:14px 18px;border-radius:8px;margin:20px 0;color:#2B4743">
    <strong>Accès au cabinet :</strong> Nous nous trouvons à l'étage du centre commercial Place d'Armes, zone rouge, porte 211.
  </p>
` : '';

const KARLA_PRESTATION_IDS = ['seance_enfant', 'seance_adulte'];
const isKarla = resa => KARLA_PRESTATION_IDS.includes(resa.prestation_id);

const SUMUP_LINK = 'https://pay.sumup.com/b2c/QKXGOT7O';

// Séance individuelle en visio : pas de terminal SumUp physique, réglée en ligne après la séance
const lienPaiementVisio = resa => resa.mode === 'visio' && resa.prestation_id === 'seance_individuel' ? `
  <p style="background:#F0D4CC;padding:14px 18px;border-radius:8px;margin:20px 0;color:#2B4743">
    <strong>Règlement de la séance :</strong> après notre échange, vous pouvez régler directement en ligne via <a href="${SUMUP_LINK}" style="color:#2B4743">ce lien de paiement</a>.
  </p>
` : '';

async function sendConfirmationClient(resa) {
  const karla = isKarla(resa);
  const accent = karla ? '#1A4A5C' : '#4A8B85';
  const fromName = karla ? 'Karla Ampigny Lucenay' : 'Ressource A.I.M.E';
  const signatureName = karla ? 'Karla Ampigny Lucenay' : 'Olivier-Marie Lucenay';
  const signatureRole = karla ? 'Psychologue clinicienne' : 'Ressource A.I.M.E';

  await (karla ? transporterKarla : transporter).sendMail({
    from: `"${fromName}" <${karla ? process.env.SMTP_USER_KARLA : process.env.SMTP_USER}>`,
    to: resa.email,
    subject: `Confirmation — ${resa.prestation_titre}`,
    html: `
      <div style="font-family:Georgia,serif;color:#2B4743;max-width:600px;margin:0 auto">
        <h2 style="color:${accent}">Votre réservation est confirmée.</h2>
        <p>Bonjour ${resa.prenom},</p>
        <p>Voici le récapitulatif de votre rendez-vous :</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr><td style="padding:10px;border-bottom:1px solid #eee"><strong>Prestation</strong></td><td style="padding:10px;border-bottom:1px solid #eee">${resa.prestation_titre}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee"><strong>Date</strong></td><td style="padding:10px;border-bottom:1px solid #eee">${formatDateFR(resa.date)} à ${resa.heure}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee"><strong>Format</strong></td><td style="padding:10px;border-bottom:1px solid #eee">${modeLabel(resa)}</td></tr>
        </table>
        ${indicationsCabinet(resa.mode)}
        ${lienPaiementVisio(resa)}
        <p style="font-style:italic;color:${accent}">
          Vous pouvez <a href="${process.env.BASE_URL}/booking/gerer/${resa.id}${resa.manage_token ? `?t=${resa.manage_token}` : ''}" style="color:${accent}">annuler ou modifier votre rendez-vous</a> jusqu'à 48h avant.
        </p>
        <p>À bientôt,<br><strong>${signatureName}</strong><br>${signatureRole}<br><br>
        ${resa.prestation_id === 'decouverte' ? '' : `<span style="color:${accent}">📞 ${karla ? '06 96 75 65 02' : '06 96 69 60 21'}</span><br>`}
        <span style="font-size:13px;opacity:0.8">N'hésitez pas à nous contacter via WhatsApp si besoin.</span>
        </p>
      </div>
    `
  });
}

const KARLA_NOTIFICATION_EMAIL = 'k.ampigny@gmail.com';

async function sendNotificationAdmin(resa) {
  await transporter.sendMail({
    from: `"RDV App" <${process.env.SMTP_USER}>`,
    to: isKarla(resa) ? KARLA_NOTIFICATION_EMAIL : process.env.SMTP_USER,
    subject: `Nouveau RDV — ${resa.prestation_titre} — ${resa.prenom} ${resa.nom}`,
    html: `
      <div style="font-family:Georgia,serif;color:#2B4743;max-width:600px;margin:0 auto">
        <h2 style="color:#4A8B85">Nouvelle réservation</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Prestation</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${resa.prestation_titre}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Client</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${resa.prenom} ${resa.nom}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${resa.email}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Téléphone</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${resa.telephone}</td></tr>
          ${resa.prestation_id === 'seance_enfant' && resa.enfant_prenom ? `<tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Enfant</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${resa.enfant_prenom}${resa.enfant_age ? ` (${resa.enfant_age} ans)` : ''}</td></tr>` : ''}
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Date</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${formatDateFR(resa.date)} à ${resa.heure}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Format</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${modeLabel(resa)}</td></tr>
        </table>
      </div>
    `
  });
}

module.exports = { sendConfirmationClient, sendNotificationAdmin };