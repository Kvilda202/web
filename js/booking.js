// ==========================================================================
// Kvilda 202 – veřejný kalendář volných / obsazených termínů
// Čte kolekce "blocked_ranges" a "apartments" z Firestore (zápis smí jen
// přihlášená administrátorka/administrátor – viz admin.html a firestore.rules).
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const cfg = window.KVILDA_FIREBASE_CONFIG || {};
const calendarRoot = document.getElementById('booking-calendar');
const statusEl = document.getElementById('booking-status');
const aptSelectCal = document.getElementById('cal-apartment');
const aptSelectForm = document.getElementById('reserve-apartment');

const FALLBACK_APARTMENTS = [{ id: 'apt1', name: 'Apartmán Kvilda 202', available: true }];

// -------------------------------------------------------------------------
// České svátky a hlavní prázdniny (pro vyznačení v kalendáři)
// -------------------------------------------------------------------------
function easterSunday(year) {
  // Gaussův algoritmus pro datum Velikonoční neděle
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function czechHolidays(year) {
  const easter = easterSunday(year);
  const fixed = [
    [1,1,'Nový rok'], [5,1,'Svátek práce'], [5,8,'Den vítězství'],
    [7,5,'Den slovanských věrozvěstů'], [7,6,'Upálení mistra Jana Husa'],
    [9,28,'Den české státnosti'], [10,28,'Den vzniku ČSR'],
    [11,17,'Den boje za svobodu a demokracii'],
    [12,24,'Štědrý den'], [12,25,'1. svátek vánoční'], [12,26,'2. svátek vánoční'],
  ];
  const map = {};
  fixed.forEach(([m,d,name]) => { map[ymd(new Date(year, m-1, d))] = name; });
  map[ymd(addDays(easter,-2))] = 'Velký pátek';
  map[ymd(addDays(easter,1))] = 'Velikonoční pondělí';
  return map;
}
function schoolBreaks(year) {
  // Přibližné hlavní prázdninové úseky (letní přesně, vánoční obvykle).
  // Pololetní/jarní/podzimní se liší dle okresu a roku – zde nejsou zahrnuty.
  const map = {};
  for (let d = new Date(year,6,1); d <= new Date(year,7,31); d = addDays(d,1)) map[ymd(d)] = 'Letní prázdniny';
  for (let d = new Date(year,11,23); d <= new Date(year,11,31); d = addDays(d,1)) map[ymd(d)] = 'Vánoční prázdniny';
  for (let d = new Date(year+1,0,1); d <= new Date(year+1,0,2); d = addDays(d,1)) map[ymd(d)] = 'Vánoční prázdniny';
  return map;
}
function specialDaysFor(year) {
  return Object.assign({}, schoolBreaks(year), czechHolidays(year)); // svátky mají přednost v popisku
}

// -------------------------------------------------------------------------
// Výběr apartmánu (z Firestore, s fallbackem na jeden výchozí apartmán)
// -------------------------------------------------------------------------
function fillApartmentSelects(apts) {
  [aptSelectCal, aptSelectForm].forEach(sel => {
    if (!sel) return;
    const prevValue = sel.value;
    sel.innerHTML = '';
    apts.forEach(a => {
      const opt = document.createElement('option');
      opt.value = sel === aptSelectForm ? a.name : a.id;
      opt.textContent = a.name + (a.available ? '' : ' – zatím nedostupné');
      opt.disabled = !a.available && sel === aptSelectForm;
      sel.appendChild(opt);
    });
    if (prevValue && Array.from(sel.options).some(o => o.value === prevValue)) sel.value = prevValue;
  });
}
fillApartmentSelects(FALLBACK_APARTMENTS);

const isConfigured = cfg.apiKey && !String(cfg.apiKey).startsWith('VLOZTE');

if (!isConfigured) {
  if (calendarRoot) {
    calendarRoot.innerHTML = '<p style="text-align:center;color:var(--text-soft);font-size:.88rem;">Živý kalendář obsazenosti se připravuje. Termín prosím ověřte telefonicky na <a href="tel:+420606080413">606&nbsp;080&nbsp;413</a> nebo přes poptávkový formulář níže.</p>';
  }
} else {
  const app = initializeApp(cfg);
  const db = getFirestore(app);

  let blockedRanges = [];
  let apartments = FALLBACK_APARTMENTS;
  const today = new Date(); today.setHours(0,0,0,0);
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();

  function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
  function currentApt() { return aptSelectCal ? aptSelectCal.value : (apartments[0] && apartments[0].id); }
  function isBlocked(date) {
    const apt = currentApt();
    return blockedRanges.some(r => r.apartmentId === apt && date >= parseDate(r.start) && date < parseDate(r.end));
  }

  function buildCalendarShell() {
    if (!calendarRoot) return null;
    calendarRoot.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'cal-card';

    const header = document.createElement('div');
    header.className = 'cal-header';
    const prevBtn = document.createElement('button');
    prevBtn.className = 'cal-nav-btn'; prevBtn.type = 'button'; prevBtn.textContent = '‹';
    prevBtn.setAttribute('aria-label', 'Předchozí měsíc');
    const nextBtn = document.createElement('button');
    nextBtn.className = 'cal-nav-btn'; nextBtn.type = 'button'; nextBtn.textContent = '›';
    nextBtn.setAttribute('aria-label', 'Další měsíc');
    const title = document.createElement('h4');
    header.append(prevBtn, title, nextBtn);

    const grid = document.createElement('div');
    grid.className = 'cal-grid';

    const legend = document.createElement('div');
    legend.className = 'cal-legend';
    legend.innerHTML = `
      <span><i style="background:#c3e6c9;"></i> Volno</span>
      <span><i style="background:#f3b36b;"></i> Obsazeno</span>
      <span><i style="background:#e3ddc9;border:1px solid #cfc8b0;"></i> Víkend</span>
      <span><i style="background:#fff;border:2px solid #b5461f;border-radius:50%;width:9px;height:9px;"></i> Svátek / prázdniny</span>
    `;

    card.append(header, grid, legend);
    calendarRoot.appendChild(card);

    prevBtn.addEventListener('click', () => {
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderMonth();
    });
    nextBtn.addEventListener('click', () => {
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderMonth();
    });

    return { title, grid, prevBtn };
  }

  let shell = null;

  function renderMonth() {
    if (!shell) shell = buildCalendarShell();
    if (!shell) return;
    const { title, grid, prevBtn } = shell;

    const monthNames = ['leden','únor','březen','duben','květen','červen','červenec','srpen','září','říjen','listopad','prosinec'];
    title.textContent = `${monthNames[viewMonth]} ${viewYear}`;

    // zákaz jít před aktuální (dnešní) měsíc
    prevBtn.disabled = (viewYear === today.getFullYear() && viewMonth === today.getMonth());

    grid.innerHTML = '';
    ['Po','Út','St','Čt','Pá','So','Ne'].forEach((d,i) => {
      const c = document.createElement('div');
      c.className = 'cal-weekday' + (i >= 5 ? ' weekend' : '');
      c.textContent = d;
      grid.appendChild(c);
    });

    const first = new Date(viewYear, viewMonth, 1);
    const startWeekday = (first.getDay() + 6) % 7; // pondělí = 0
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const special = specialDaysFor(viewYear);

    for (let i = 0; i < startWeekday; i++) {
      const filler = document.createElement('div');
      filler.className = 'cal-day';
      grid.appendChild(filler);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const key = ymd(date);
      const weekday = (date.getDay() + 6) % 7;
      const isWeekend = weekday >= 5;
      const isPast = date < today;
      const blocked = isBlocked(date);
      const holidayName = special[key];

      const cell = document.createElement('div');
      cell.className = 'cal-day in-month' + (isWeekend ? ' weekend' : '') + (isPast ? ' past' : (blocked ? ' occupied' : ' free'));
      if (date.getTime() === today.getTime()) cell.classList.add('today');
      cell.textContent = d;

      let title = isPast ? 'Minulé datum' : (blocked ? 'Obsazeno' : 'Volný termín');
      if (holidayName) {
        title += ` — ${holidayName}`;
        const dot = document.createElement('span');
        dot.className = 'dot';
        cell.appendChild(dot);
      }
      cell.title = title;
      grid.appendChild(cell);
    }
  }

  if (aptSelectCal) {
    aptSelectCal.addEventListener('change', renderMonth);
  }

  onSnapshot(collection(db, 'blocked_ranges'), snap => {
    blockedRanges = snap.docs.map(d => d.data());
    if (statusEl) statusEl.textContent = 'Kalendář je aktualizován automaticky v reálném čase.';
    renderMonth();
  }, err => {
    console.error(err);
    if (calendarRoot) calendarRoot.innerHTML = '<p style="text-align:center;color:var(--text-soft);font-size:.88rem;">Kalendář se teď nepodařilo načíst. Termín prosím ověřte telefonicky na 606 080 413.</p>';
  });

  onSnapshot(query(collection(db, 'apartments'), orderBy('name')), snap => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    apartments = list.length ? list : FALLBACK_APARTMENTS;
    fillApartmentSelects(apartments);
    renderMonth();
  }, err => {
    console.error(err);
    apartments = FALLBACK_APARTMENTS;
    fillApartmentSelects(apartments);
  });
}
