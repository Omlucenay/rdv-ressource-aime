// État global
const state = {
  prestation: null,
  mode: 'cabinet',
  date: null,
  heure: null,
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth()
};

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// Jours dispos selon le type de prestation
function getJoursDispo(type) {
  if (type === 'decouverte') return [1, 2, 3]; // Lundi, Mardi, Mercredi
  return [2, 3, 4, 5, 6]; // Mardi à Samedi
}

// Sélection prestation
function selectPrestation(el) {
  document.querySelectorAll('.card, .card-wide').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.prestation = {
    id: el.dataset.id,
    titre: el.dataset.titre || el.querySelector('.card-wide-title, .card-title')?.textContent,
    prix: parseInt(el.dataset.prix) || 0,
    paiement: el.dataset.paiement === 'true'
  };

  const step2 = document.getElementById('step2');
  step2.style.display = 'block';
  step2.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const modeSection = document.getElementById('modeSection');
  if (state.prestation.id === 'decouverte' || state.prestation.id === 'seance_enfant') {
    modeSection.style.display = 'none';
    state.mode = state.prestation.id === 'decouverte' ? 'visio' : 'cabinet';
  } else {
    modeSection.style.display = 'grid';
  }

  renderCalendar();
}

// Sélection mode
function selectMode(el) {
  document.querySelectorAll('.mode').forEach(m => m.classList.remove('selected'));
  el.classList.add('selected');
  state.mode = el.dataset.mode;
}

// Calendrier
async function renderCalendar() {
  const y = state.currentYear;
  const m = state.currentMonth;
  document.getElementById('calMonth').textContent = `${MOIS[m]} ${y}`;

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  ['L','M','M','J','V','S','D'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'dow';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(y, m, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  today.setHours(0,0,0,0);

  const JOURS_DISPO = getJoursDispo(state.prestation?.id);
  const type = state.prestation?.id || '';

  const joursAVerifier = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const dow = date.getDay();
    if (date >= today && JOURS_DISPO.includes(dow)) {
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      joursAVerifier.push({ d, dateStr });
    }
  }

  const slotsParJour = {};
  await Promise.all(joursAVerifier.map(async ({ d, dateStr }) => {
    try {
      const res = await fetch(`/calendar/slots?date=${dateStr}&type=${type}`);
      const data = await res.json();
      slotsParJour[dateStr] = data.slots || [];
    } catch {
      slotsParJour[dateStr] = [];
    }
  }));

  for (let i = 0; i < offset; i++) {
    const el = document.createElement('div');
    el.className = 'day muted';
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const dow = date.getDay();
    const el = document.createElement('div');
    el.textContent = d;

    if (date < today || !JOURS_DISPO.includes(dow)) {
      el.className = 'day muted';
    } else {
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const slots = slotsParJour[dateStr] || [];
      if (slots.length === 0) {
        el.className = 'day full';
        el.title = 'Complet';
      } else {
        el.className = 'day avail';
        el.onclick = () => selectDay(el, dateStr);
      }
    }
    grid.appendChild(el);
  }
}

function changeMonth(dir) {
  state.currentMonth += dir;
  if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
  if (state.currentMonth < 0)  { state.currentMonth = 11; state.currentYear--; }
  renderCalendar();
}

// Sélection d'un jour
async function selectDay(el, dateStr) {
  document.querySelectorAll('.day').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
  state.date = dateStr;
  state.heure = null;

  const label = document.getElementById('slotsLabel');
  const slotsEl = document.getElementById('slots');
  label.textContent = 'Chargement des créneaux...';
  slotsEl.innerHTML = '';

  try {
    const type = state.prestation?.id || '';
    const res = await fetch(`/calendar/slots?date=${dateStr}&type=${type}`);
    const data = await res.json();

    if (data.auth === false) {
      label.textContent = 'Connexion Google requise';
      slotsEl.innerHTML = '<a href="/auth/google" class="cta" style="display:block;text-align:center;text-decoration:none">Connecter Google Calendar</a>';
      return;
    }

    if (!data.slots || data.slots.length === 0) {
      label.textContent = 'Aucun créneau disponible ce jour';
      return;
    }

    const [dy, dm, dd] = dateStr.split('-').map(Number);
    const d = new Date(dy, dm - 1, dd);
    label.textContent = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });

    data.slots.forEach(h => {
      const s = document.createElement('div');
      s.className = 'slot';
      s.textContent = `${h} — ${addDuree(h)}`;
      s.onclick = () => selectSlot(s, h);
      slotsEl.appendChild(s);
    });
  } catch (e) {
    label.textContent = 'Erreur lors du chargement';
  }
}

function addDuree(heure) {
  const [h, min] = heure.split(':').map(Number);
  if (state.prestation?.id === 'decouverte') {
    const total = h * 60 + min + 15;
    return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
  }
  return `${String(h + 1).padStart(2,'0')}:00`;
}

// Sélection d'un créneau
function selectSlot(el, heure) {
  document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  state.heure = heure;

  const step3 = document.getElementById('step3');
  step3.style.display = 'block';
  step3.scrollIntoView({ behavior: 'smooth', block: 'start' });

  updateSummary();
}

// Résumé
function updateSummary() {
  if (!state.prestation || !state.date || !state.heure) return;

 const [dy, dm, dd] = state.date.split('-').map(Number);
const d = new Date(dy, dm - 1, dd);
const dateLabel = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const modeLabel = state.mode === 'cabinet' ? 'Cabinet du Lamentin' : 'Visio';

  let prixLabel;
  if (state.prestation.id === 'seance_enfant') prixLabel = 'Règlement sur place';
  else if (state.prestation.prix > 0) prixLabel = `${state.prestation.prix} €`;
  else prixLabel = 'Gratuit';

  const dureeLabel = state.prestation.id === 'decouverte' ? '15 min' : '1h';
  const ctaLabel = state.prestation.paiement === true ? 'Confirmer et payer →' : 'Confirmer →';

  document.getElementById('summary').innerHTML = `
    <p class="sum-title">Récapitulatif</p>
    <div class="sum-row"><span>${state.prestation.titre}</span><span>${dureeLabel}</span></div>
    <div class="sum-row"><span>${modeLabel}</span><span>${dateLabel} · ${state.heure}</span></div>
    ${(state.prestation.id === 'forfait_individuel' || state.prestation.id === 'forfait_couple') ? '<p class="sum-echelon">Choix des modalités de paiement (1x, 2x, 3x ou 4x sans frais) à l\'étape suivante.</p>' : ''} ${(state.prestation.id === 'forfait_individuel' || state.prestation.id === 'forfait_couple') ? '<p class="sum-echelon">Paiement en 1x, 2x, 3x ou 4x sans frais — tu choisiras à l\'étape suivante.</p>' : ''}
  `;

  document.getElementById('ctaBtn').textContent = ctaLabel;
  document.getElementById('fPrestationId').value = state.prestation.id;
  document.getElementById('fMode').value = state.mode;
  document.getElementById('fDate').value = state.date;
  document.getElementById('fHeure').value = state.heure;
}
