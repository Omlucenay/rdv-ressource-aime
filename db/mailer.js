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

function formatDateFR(dateVal) {
  const jours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d = new Date(dateVal);
  return `${jours[d.getUTCDay()]} ${d.getUTCDate()} ${mois[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const modeLabel = mode => mode === 'cabinet'
  ? 'Au cabinet — Centre commercial Place d\'Armes, à l\'étage'
  : mode === 'telephone'
  ? 'Par téléphone — nous vous appellerons'
  : 'En visio';

const indicationsCabinet = mode => mode === 'cabinet' ? `
  <p style="background:#F0D4CC;padding:14px 18px;border-radius:8px;margin:20px 0;color:#2B4743">
    <strong>Accès au cabinet :</strong> Nous nous trouvons à l'étage du centre commercial Place d'Armes, zone rouge, porte 211.
  </p>
` : '';

async function sendConfirmationClient(resa) {
  await transporter.sendMail({
    from: `"Ressource A.I.M.E" <${process.env.SMTP_USER}>`,
    to: resa.email,
    subject: `Confirmation — ${resa.prestation_titre}`,
    html: `
      <div style="font-family:Georgia,serif;color:#2B4743;max-width:600px;margin:0 auto">
        <h2 style="color:#4A8B85">Votre réservation est confirmée.</h2>
        <p>Bonjour ${resa.prenom},</p>
        <p>Voici le récapitulatif de votre rendez-vous :</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr><td style="padding:10px;border-bottom:1px solid #eee"><strong>Prestation</strong></td><td style="padding:10px;border-bottom:1px solid #eee">${resa.prestation_titre}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee"><strong>Date</strong></td><td style="padding:10px;border-bottom:1px solid #eee">${formatDateFR(resa.date)} à ${resa.heure}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee"><strong>Format</strong></td><td style="padding:10px;border-bottom:1px solid #eee">${modeLabel(resa.mode)}</td></tr>
        </table>
        ${indicationsCabinet(resa.mode)}
        <p style="font-style:italic;color:#4A8B85">
          Vous pouvez <a href="${process.env.BASE_URL}/booking/manage/${resa.id}" style="color:#4A8B85">annuler ou modifier votre rendez-vous</a> jusqu'à 48h avant.
        </p>
        <p>À bientôt,<br><strong>Olivier-Marie Lucenay</strong><br>Ressource A.I.M.E<br><br>
        <span style="color:#4A8B85">📞 06 96 69 60 21</span><br>
        <span style="font-size:13px;opacity:0.8">N'hésitez pas à nous contacter via WhatsApp si besoin.</span>
        </p>
      </div>
    `
  });
}

async function sendNotificationAdmin(resa) {
  await transporter.sendMail({
    from: `"RDV App" <${process.env.SMTP_USER}>`,
    to: process.env.SMTP_USER,
    subject: `Nouveau RDV — ${resa.prestation_titre} — ${resa.prenom} ${resa.nom}`,
    html: `
      <div style="font-family:Georgia,serif;color:#2B4743;max-width:600px;margin:0 auto">
        <h2 style="color:#4A8B85">Nouvelle réservation</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Prestation</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${resa.prestation_titre}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Client</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${resa.prenom} ${resa.nom}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${resa.email}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Téléphone</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${resa.telephone}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Date</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${formatDateFR(resa.date)} à ${resa.heure}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Format</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${modeLabel(resa.mode)}</td></tr>
        </table>
      </div>
    `
  });
}

module.exports = { sendConfirmationClient, sendNotificationAdmin };