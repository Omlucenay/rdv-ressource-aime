const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { oauth2Client, getTokens } = require('./auth');

const CALENDAR_CABINET = process.env.GOOGLE_CALENDAR_CABINET;
const CALENDAR_KARLA   = process.env.GOOGLE_CALENDAR_KARLA;
const CALENDAR_APPEL   = process.env.GOOGLE_CALENDAR_APPEL;

// Plages horaires cabinet (séances individuelles, couples, forfaits)
const DISPO_CABINET = {
  3: [{ start: 13, end: 15 }],
  4: [{ start: 17, end: 19 }],
  5: [{ start: 13, end: 19 }],
  6: [{ start: 10, end: 12 }, { start: 13, end: 18 }]
};

// Plages horaires appel découverte (mardi, mercredi 18h-20h)
const DISPO_DECOUVERTE = {
  2: [{ start: 18, end: 20 }],
  3: [{ start: 18, end: 20 }]
};

const DUREE_SEANCE     = 60;
const DUREE_DECOUVERTE = 15;

async function getEvents(calendarId, dateMin, dateMax, tokens) {
  oauth2Client.setCredentials(tokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const res = await calendar.events.list({
    calendarId,
    timeMin: dateMin,
    timeMax: dateMax,
    singleEvents: true,
    orderBy: 'startTime'
  });
  return res.data.items || [];
}

function estBloque(slotStart, slotEnd, events) {
  return events.some(ev => {
    if (ev.status === 'cancelled') return false;
    if (ev.summary && ev.summary.startsWith('Annulé')) return false;
    const evStart = new Date(ev.start.dateTime || ev.start.date).getTime();
    const evEnd   = new Date(ev.end.dateTime   || ev.end.date).getTime();
    return slotStart < evEnd && slotEnd > evStart;
  });
}

router.get('/slots', async (req, res) => {
  const { date, type } = req.query;
  if (!date) return res.json({ slots: [] });

  const tokens = await getTokens();
  if (!tokens) return res.json({ slots: [], auth: false });

  try {
    const [y, m, d] = date.split('-').map(Number);
    const jourSemaine = new Date(y, m - 1, d).getDay();
    const dateMin = new Date(`${date}T00:00:00.000-04:00`).toISOString();
    const dateMax = new Date(`${date}T23:59:59.999-04:00`).toISOString();

    // --- APPEL DÉCOUVERTE : lundi-mercredi, créneaux 15 min ---
    if (type === 'decouverte') {
      const regleJour = DISPO_DECOUVERTE[jourSemaine];
      if (!regleJour) return res.json({ slots: [] });

      const [eventsCabinet, eventsAppel] = await Promise.all([
        getEvents(CALENDAR_CABINET, dateMin, dateMax, tokens),
        getEvents(CALENDAR_APPEL,   dateMin, dateMax, tokens)
      ]);
      const tousLesEvents = [...eventsCabinet, ...eventsAppel];

      const slots = [];
      regleJour.forEach(plage => {
        for (let h = plage.start; h < plage.end; h++) {
          for (let min of [0, 15, 30, 45]) {
            const slotLocal = new Date(`${date}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`);
            const slotStart = slotLocal.getTime() + 4 * 60 * 60 * 1000;
            const slotEnd   = slotStart + DUREE_DECOUVERTE * 60 * 1000;
            if (!estBloque(slotStart, slotEnd, tousLesEvents)) {
              slots.push(`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`);
            }
          }
        }
      });

      return res.json({ slots });
    }

    // --- SÉANCES KARLA (enfant/ado + adulte) : créneaux depuis le calendrier Karla ---
    if (type === 'seance_enfant' || type === 'seance_adulte') {
      const [eventsKarla, eventsCabinet] = await Promise.all([
        getEvents(CALENDAR_KARLA,   dateMin, dateMax, tokens),
        getEvents(CALENDAR_CABINET, dateMin, dateMax, tokens)
      ]);

      const dispoKarla = eventsKarla.filter(ev =>
        ev.summary && ev.summary.toUpperCase().includes('DISPO')
      );

      const slots = [];
      dispoKarla.forEach(ev => {
        const evStart   = new Date(ev.start.dateTime);
        const h = evStart.getUTCHours() - 4;
        const slotStart = evStart.getTime();
        const slotEnd   = slotStart + DUREE_SEANCE * 60 * 1000;
        if (!estBloque(slotStart, slotEnd, eventsCabinet)) {
          slots.push(`${String(h).padStart(2,'0')}:00`);
        }
      });

      return res.json({ slots });
    }

    // --- SÉANCES CABINET : double vérification toi + Karla ---
    const regleJour = DISPO_CABINET[jourSemaine];
    if (!regleJour) return res.json({ slots: [] });

    const [eventsCabinet, eventsKarla] = await Promise.all([
      getEvents(CALENDAR_CABINET, dateMin, dateMax, tokens),
      getEvents(CALENDAR_KARLA,   dateMin, dateMax, tokens)
    ]);

    const tousLesEvents = [...eventsCabinet, ...eventsKarla];
    const slots = [];

    regleJour.forEach(plage => {
      for (let h = plage.start; h < plage.end; h++) {
        const slot      = new Date(`${date}T${String(h).padStart(2,'0')}:00:00-04:00`);
        const slotStart = slot.getTime();
        const slotEnd   = slotStart + DUREE_SEANCE * 60 * 1000;
        if (!estBloque(slotStart, slotEnd, tousLesEvents)) {
          slots.push(`${String(h).padStart(2,'0')}:00`);
        }
      }
    });

    res.json({ slots });

  } catch (err) {
    console.error('Erreur calendar:', err);
    res.json({ slots: [], error: true });
  }
});


router.get('/available-days', async (req, res) => {
  const { month, type } = req.query;
  if (!month) return res.json({ days: [] });
  const tokens = await getTokens();
  if (!tokens) return res.json({ days: [], auth: false });

  try {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const dateMin = new Date(`${month}-01T00:00:00.000-04:00`).toISOString();
    const dateMax = new Date(`${month}-${String(lastDay).padStart(2,'0')}T23:59:59.999-04:00`).toISOString();

    if (type === 'seance_enfant' || type === 'seance_adulte') {
      const eventsKarla = await getEvents(CALENDAR_KARLA, dateMin, dateMax, tokens);
      const dispo = eventsKarla.filter(ev => ev.summary && ev.summary.toUpperCase().includes('DISPO'));
      const days = new Set();
      dispo.forEach(ev => {
        const s = new Date(ev.start.dateTime);
        const d = s.getUTCHours() < 4 ? new Date(s.getTime() - 86400000) : s;
        days.add(d.toISOString().substring(0, 10));
      });
      return res.json({ days: [...days] });
    }

    const dispoMap = type === 'decouverte' ? DISPO_DECOUVERTE : DISPO_CABINET;
    const duree    = type === 'decouverte' ? DUREE_DECOUVERTE : DUREE_SEANCE;
    const secondCalendar = type === 'decouverte' ? CALENDAR_APPEL : CALENDAR_KARLA;

    const [eventsCabinet, eventsSecond] = await Promise.all([
      getEvents(CALENDAR_CABINET, dateMin, dateMax, tokens),
      getEvents(secondCalendar,   dateMin, dateMax, tokens)
    ]);
    const tousLesEvents = [...eventsCabinet, ...eventsSecond];

    const days = [];
    for (let day = 1; day <= lastDay; day++) {
      const dateStr     = `${month}-${String(day).padStart(2,'0')}`;
      const jourSemaine = new Date(y, m - 1, day).getDay();
      const regleJour   = dispoMap[jourSemaine];
      if (!regleJour) continue;

      let hasSlot = false;
      outer: for (const plage of regleJour) {
        const mins = duree === DUREE_DECOUVERTE ? [0, 15, 30, 45] : [0];
        for (let h = plage.start; h < plage.end; h++) {
          for (const min of mins) {
            const slot      = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00-04:00`);
            const slotStart = slot.getTime();
            const slotEnd   = slotStart + duree * 60 * 1000;
            if (!estBloque(slotStart, slotEnd, tousLesEvents)) {
              hasSlot = true;
              break outer;
            }
          }
        }
      }

      if (hasSlot) days.push(dateStr);
    }

    return res.json({ days });

  } catch (err) {
    console.error('available-days error:', err);
    res.json({ days: [] });
  }
});

module.exports = router;