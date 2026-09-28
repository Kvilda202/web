// ==========================================================================
// Kvilda 202 – administrace kalendáře a apartmánů (jen pro přihlášené správce)
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, serverTimestamp, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";

const cfg = window.KVILDA_FIREBASE_CONFIG || {};
const adminEmails = window.KVILDA_ADMIN_EMAILS || [];

const loginBox = document.getElementById('admin-login');
const panelBox = document.getElementById('admin-panel');
const deniedBox = document.getElementById('admin-denied');
const configBox = document.getElementById('admin-not-configured');
const userLabel = document.getElementById('admin-user');
const btnLogin = document.getElementById('btn-google-login');
const btnLogout = document.getElementById('btn-logout');

const blockForm = document.getElementById('block-form');
const blockList = document.getElementById('block-list');
const aptSelect = document.getElementById('block-apartment');

const aptForm = document.getElementById('apartment-form');
const aptList = document.getElementById('apartment-list');

const tuyaDevicesEl = document.getElementById('tuya-devices');
const tuyaStatusEl = document.getElementById('tuya-status');
const scenarioLogEl = document.getElementById('scenario-log');
const btnScenarioArrival = document.getElementById('btn-scenario-arrival');
const btnScenarioDeparture = document.getElementById('btn-scenario-departure');

function show(el) { el.style.display = ''; }
function hide(el) { el.style.display = 'none'; }
[loginBox, panelBox, deniedBox, configBox].forEach(el => el && hide(el));

const isConfigured = cfg.apiKey && !String(cfg.apiKey).startsWith('VLOZTE');
if (!isConfigured) {
  show(configBox);
} else {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'europe-west1');
  const provider = new GoogleAuthProvider();

  const fnListDevices = httpsCallable(functions, 'tuyaListAllDevices');
  const fnSendCommand = httpsCallable(functions, 'tuyaSendCommand');
  const fnRunScenario = httpsCallable(functions, 'tuyaRunScenario');
  const fnSendEmail = httpsCallable(functions, 'sendReservationEmail');

  let apartments = [];

  btnLogin.addEventListener('click', () => signInWithPopup(auth, provider).catch(e => alert('Přihlášení se nezdařilo: ' + e.message)));
  btnLogout.addEventListener('click', () => signOut(auth));

  onAuthStateChanged(auth, user => {
    hide(loginBox); hide(panelBox); hide(deniedBox);
    if (!user) { show(loginBox); return; }
    if (!adminEmails.includes(user.email)) {
      deniedBox.querySelector('.who').textContent = user.email;
      show(deniedBox);
      return;
    }
    userLabel.textContent = user.email;
    show(panelBox);
    listenApartments();
    listenRanges();
    loadTuyaDevices();
    listenScenarioLog();
  });

  // ---------------- Apartmány ----------------
  aptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = aptForm.name.value.trim();
    if (!name) return;
    try {
      await addDoc(collection(db, 'apartments'), {
        name, available: true, createdAt: serverTimestamp(),
      });
      aptForm.reset();
    } catch (err) {
      alert('Uložení apartmánu se nezdařilo: ' + err.message);
    }
  });

  function listenApartments() {
    const q = query(collection(db, 'apartments'), orderBy('name'));
    onSnapshot(q, snap => {
      apartments = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // seznam v panelu správy apartmánů
      aptList.innerHTML = '';
      if (!apartments.length) {
        aptList.innerHTML = '<li style="color:#888;">Zatím žádný apartmán. Přidejte první výše (např. „Apartmán Kvilda 202“).</li>';
      } else {
        apartments.forEach(a => {
          const li = document.createElement('li');
          li.innerHTML = `<span><b>${a.name}</b> — ${a.available ? 'dostupný' : 'skrytý'}</span>`;
          const toggleBtn = document.createElement('button');
          toggleBtn.textContent = a.available ? 'Skrýt' : 'Zveřejnit';
          toggleBtn.className = 'btn-del';
          toggleBtn.style.background = a.available ? '#6b4a30' : '#29553b';
          toggleBtn.addEventListener('click', () => updateDoc(doc(db, 'apartments', a.id), { available: !a.available }));
          const delBtn = document.createElement('button');
          delBtn.textContent = 'Smazat';
          delBtn.className = 'btn-del';
          delBtn.addEventListener('click', async () => {
            if (confirm(`Opravdu smazat apartmán „${a.name}“? Blokované termíny k němu zůstanou v databázi, ale nebudou se už nikde zobrazovat.`)) {
              await deleteDoc(doc(db, 'apartments', a.id));
            }
          });
          li.append(toggleBtn, delBtn);
          aptList.appendChild(li);
        });
      }

      // výběr apartmánu ve formuláři pro blokování termínů
      const prev = aptSelect.value;
      aptSelect.innerHTML = '';
      apartments.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        aptSelect.appendChild(opt);
      });
      if (prev && apartments.some(a => a.id === prev)) aptSelect.value = prev;

      renderRanges();
    });
  }

  // ---------------- Blokované termíny ----------------
  let ranges = [];

  blockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!apartments.length) { alert('Nejdřív přidejte alespoň jeden apartmán (viz sekce výše).'); return; }
    const start = blockForm.start.value;
    const end = blockForm.end.value;
    const note = blockForm.note.value || 'Obsazeno';
    const guestEmail = (blockForm.guestEmail.value || '').trim();
    const apartmentId = aptSelect.value;
    if (!start || !end || end <= start) { alert('Zkontrolujte prosím data – konec musí být po začátku.'); return; }
    try {
      await addDoc(collection(db, 'blocked_ranges'), {
        apartmentId, start, end, note, guestEmail,
        createdBy: auth.currentUser.email,
        createdAt: serverTimestamp(),
      });
      blockForm.reset();
    } catch (err) {
      alert('Uložení se nezdařilo: ' + err.message);
    }
  });

  function listenRanges() {
    const q = query(collection(db, 'blocked_ranges'), orderBy('start'));
    onSnapshot(q, snap => {
      ranges = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderRanges();
    });
  }

  function renderRanges() {
    blockList.innerHTML = '';
    if (!ranges.length) {
      blockList.innerHTML = '<li style="color:#888;">Zatím žádné blokované termíny.</li>';
      return;
    }
    ranges.forEach(r => {
      const aptName = (apartments.find(a => a.id === r.apartmentId) || {}).name || r.apartmentId;
      const li = document.createElement('li');
      const emailNote = r.emailSentAt ? ` · e-mail odeslán (${r.emailSentTo || ''})` : '';
      li.innerHTML = `<span><b>${aptName}</b> — ${r.start} → ${r.end} <em>(${r.note || ''})</em><br><span style="font-size:.78rem;color:#888;">${r.guestEmail || 'bez e-mailu hosta'}${emailNote}</span></span>`;

      const mailBtn = document.createElement('button');
      mailBtn.textContent = r.emailSentAt ? 'Odeslat znovu' : 'Odeslat e-mail';
      mailBtn.className = 'btn-mail';
      mailBtn.addEventListener('click', async () => {
        let guestEmail = r.guestEmail;
        if (!guestEmail) {
          guestEmail = prompt('Zadejte e-mail hosta pro odeslání potvrzení:');
          if (!guestEmail) return;
        }
        mailBtn.disabled = true;
        mailBtn.textContent = 'Odesílám…';
        try {
          await fnSendEmail({ rangeId: r.id, guestEmail });
          mailBtn.textContent = 'Odesláno ✓';
        } catch (err) {
          alert('Odeslání e-mailu se nezdařilo: ' + err.message);
          mailBtn.disabled = false;
          mailBtn.textContent = 'Odeslat e-mail';
        }
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Smazat';
      delBtn.className = 'btn-del';
      delBtn.addEventListener('click', async () => {
        if (confirm('Opravdu smazat tento termín?')) {
          await deleteDoc(doc(db, 'blocked_ranges', r.id));
        }
      });
      li.append(mailBtn, delBtn);
      blockList.appendChild(li);
    });
  }

  // ---------------- Chytrá domácnost (Tuya) ----------------
  let tuyaDevices = [];

  async function loadTuyaDevices() {
    tuyaStatusEl.textContent = 'Načítám všechna zařízení z Tuya…';
    try {
      const res = await fnListDevices();
      tuyaDevices = res.data?.devices || [];
      tuyaStatusEl.textContent = '';
      renderTuyaDevices();
    } catch (err) {
      tuyaStatusEl.textContent = 'Nepodařilo se načíst zařízení: ' + err.message;
    }
  }

  // Srozumitelné názvy běžných Tuya DP kódů
  const DP_LABELS = {
    switch: 'Zapnuto', switch_1: 'Vypínač 1', switch_2: 'Vypínač 2', switch_3: 'Vypínač 3', switch_4: 'Vypínač 4',
    switch_led: 'Světlo', switch_usb1: 'USB', temp_set: 'Nastavená teplota', temp_current: 'Aktuální teplota',
    upper_temp: 'Max. teplota', lower_temp: 'Min. teplota', temp_correction: 'Korekce teploty',
    mode: 'Režim', work_mode: 'Režim', child_lock: 'Dětský zámek', window_check: 'Detekce okna',
    frost: 'Ochrana proti mrazu', eco: 'Úsporný režim', battery_percentage: 'Baterie', battery_state: 'Baterie',
    humidity_value: 'Vlhkost', va_humidity: 'Vlhkost', va_temperature: 'Teplota',
    cur_power: 'Příkon', cur_current: 'Proud', cur_voltage: 'Napětí', add_ele: 'Spotřeba',
    countdown_1: 'Odpočet', relay_status: 'Stav po výpadku proudu', light_mode: 'Podsvícení',
    bright_value: 'Jas', bright_value_v2: 'Jas', temp_value: 'Teplota světla', temp_value_v2: 'Teplota světla',
    colour_data: 'Barva', control: 'Ovládání', percent_control: 'Poloha', valve_state: 'Ventil',
    doorcontact_state: 'Dveře otevřené', pir: 'Pohyb', unlock_fingerprint: 'Odemčeno otiskem',
    unlock_password: 'Odemčeno kódem', unlock_app: 'Odemčeno aplikací', alarm_lock: 'Alarm zámku',
    residual_electricity: 'Baterie', closed_opened: 'Stav dveří', fault: 'Porucha', factory_reset: null,
  };
  const ENUM_LABELS = {
    auto: 'automaticky', manual: 'ručně', holiday: 'dovolená', eco: 'úsporný', comfort: 'komfort',
    smart: 'chytrý', program: 'program', temp_auto: 'program', hot: 'topení', cold: 'chlazení',
    power_off: 'vypnuto', power_on: 'zapnuto', last: 'poslední stav', open: 'otevřít', close: 'zavřít',
    stop: 'stop', white: 'bílá', colour: 'barevná', scene: 'scéna', music: 'hudba',
    relay: 'podle relé', pos: 'podle polohy', none: 'vypnuto', low: 'nízká', middle: 'střední', high: 'vysoká',
  };
  const label = code => (code in DP_LABELS ? DP_LABELS[code] : code.replace(/_/g, ' '));
  const enumLabel = v => ENUM_LABELS[v] || v;
  const HIDDEN_CODES = /^(factory_reset|colour_data.*|scene_data.*|flash_scene.*|music_data|control_data|countdown.*|cycle_time|random_time|switch_inching|week_program.*|program.*|temp_program.*|unlock_.*|.*_ticket.*|.*_record)$/;

  function fmtValue(spec, value) {
    if (!spec) return String(value);
    const v = spec.values || {};
    if (spec.type === 'Boolean') return value ? 'ano' : 'ne';
    if (spec.type === 'Integer' || spec.type === 'Value') {
      const n = Number(value) / 10 ** (v.scale || 0);
      return `${n.toLocaleString('cs-CZ')}${v.unit ? ' ' + v.unit.replace('℃', '°C') : ''}`;
    }
    if (spec.type === 'Enum') return enumLabel(value);
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  async function sendCommand(dev, code, value, el) {
    if (dev.sensitive && !confirm(`Opravdu změnit „${label(code)}“ u zařízení ${dev.name}?`)) return false;
    if (el) el.disabled = true;
    try {
      await fnSendCommand({ deviceId: dev.id, code, value, confirm: dev.sensitive ? true : undefined });
      tuyaStatusEl.textContent = `✔ ${dev.name}: ${label(code)} → ${typeof value === 'boolean' ? (value ? 'zapnuto' : 'vypnuto') : enumLabel(value)}`;
      setTimeout(loadTuyaDevices, 1500); // Tuya potvrdí nový stav s malým zpožděním
      return true;
    } catch (err) {
      alert(`Nepodařilo se ovládat ${dev.name}: ${err.message}`);
      if (el) el.disabled = false;
      return false;
    }
  }

  function renderTuyaDevices() {
    tuyaDevicesEl.innerHTML = '';
    if (!tuyaDevices.length) {
      tuyaDevicesEl.innerHTML = '<li style="color:#888;">Žádná zařízení nenalezena.</li>';
      return;
    }
    tuyaDevices.forEach(dev => {
      const li = document.createElement('li');
      li.className = 'tuya-dev' + (dev.online ? '' : ' offline');
      const statusMap = Object.fromEntries((dev.status || []).map(x => [x.code, x.value]));
      const specMap = Object.fromEntries([...(dev.statusSpec || []), ...(dev.functions || [])].map(f => [f.code, f]));
      const fnCodes = new Set((dev.functions || []).map(f => f.code));

      const head = document.createElement('div');
      head.className = 'dev-head';
      head.innerHTML = `<b>${escapeHtml(dev.name)}</b>
        <span class="dev-status ${dev.online ? 'online' : ''}">${dev.online ? '● online' : '○ offline'}</span>
        ${dev.heating ? '<span class="dev-tag">scénáře</span>' : ''}
        ${dev.sensitive ? '<span class="dev-tag warn">s potvrzením</span>' : ''}
        ${dev.productName ? `<small class="dev-product">${escapeHtml(dev.productName)}</small>` : ''}`;
      li.appendChild(head);

      // Jen pro čtení – stavy, které nejdou ovládat (teplota, baterie, příkon…)
      const readings = (dev.status || []).filter(x => !fnCodes.has(x.code) && !HIDDEN_CODES.test(x.code) && DP_LABELS[x.code] !== null && typeof x.value !== 'object');
      if (readings.length) {
        const r = document.createElement('div');
        r.className = 'dev-readings';
        r.innerHTML = readings.map(x => `<span><em>${escapeHtml(label(x.code))}:</em> ${escapeHtml(fmtValue(specMap[x.code], x.value))}</span>`).join('');
        li.appendChild(r);
      }

      const controls = document.createElement('div');
      controls.className = 'dev-controls';
      (dev.functions || []).filter(f => !HIDDEN_CODES.test(f.code) && DP_LABELS[f.code] !== null).forEach(f => {
        const cur = statusMap[f.code];
        const v = f.values || {};
        const wrap = document.createElement('label');
        wrap.className = 'dev-ctl';
        if (f.type === 'Boolean') {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'dev-toggle' + (cur ? ' on' : '');
          btn.textContent = `${label(f.code)}: ${cur ? 'ZAP' : 'VYP'}`;
          btn.disabled = !dev.online;
          btn.addEventListener('click', () => sendCommand(dev, f.code, !cur, btn));
          controls.appendChild(btn);
          return;
        }
        if (f.type === 'Integer') {
          const scale = v.scale || 0;
          const inp = document.createElement('input');
          inp.type = 'number';
          inp.step = (v.step || 1) / 10 ** scale;
          if (typeof v.min === 'number') inp.min = v.min / 10 ** scale;
          if (typeof v.max === 'number') inp.max = v.max / 10 ** scale;
          if (cur !== undefined) inp.value = Number(cur) / 10 ** scale;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-mail';
          btn.textContent = 'Nastavit';
          btn.disabled = !dev.online;
          btn.addEventListener('click', () => {
            const n = parseFloat(inp.value);
            if (!Number.isNaN(n)) sendCommand(dev, f.code, n, btn);
          });
          wrap.append(`${label(f.code)}${v.unit ? ' (' + v.unit.replace('℃', '°C') + ')' : ''} `, inp, btn);
          controls.appendChild(wrap);
          return;
        }
        if (f.type === 'Enum' && Array.isArray(v.range)) {
          const sel = document.createElement('select');
          v.range.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt; o.textContent = enumLabel(opt);
            if (opt === cur) o.selected = true;
            sel.appendChild(o);
          });
          sel.disabled = !dev.online;
          sel.addEventListener('change', async () => {
            const ok = await sendCommand(dev, f.code, sel.value, sel);
            if (!ok) sel.value = cur;
          });
          wrap.append(`${label(f.code)} `, sel);
          controls.appendChild(wrap);
        }
      });
      if (controls.children.length) li.appendChild(controls);
      if (dev.error) {
        const e = document.createElement('small');
        e.className = 'dev-status';
        e.textContent = 'Chyba: ' + dev.error;
        li.appendChild(e);
      }
      tuyaDevicesEl.appendChild(li);
    });
  }

  function escapeHtml(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function runScenario(scenario, btn) {
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.textContent = 'Spouštím…';
    tuyaStatusEl.textContent = '';
    try {
      await fnRunScenario({ scenario });
      tuyaStatusEl.textContent = `Scénář "${scenario === 'arrival' ? 'Příjezd' : 'Odjezd'}" byl spuštěn.`;
      await loadTuyaDevices();
    } catch (err) {
      tuyaStatusEl.textContent = 'Scénář se nepodařilo spustit: ' + err.message;
    }
    btn.disabled = false;
    btn.innerHTML = original;
  }

  btnScenarioArrival.addEventListener('click', () => runScenario('arrival', btnScenarioArrival));
  btnScenarioDeparture.addEventListener('click', () => runScenario('departure', btnScenarioDeparture));
  const btnTuyaRefresh = document.getElementById('btn-tuya-refresh');
  if (btnTuyaRefresh) btnTuyaRefresh.addEventListener('click', loadTuyaDevices);

  function listenScenarioLog() {
    const q = query(collection(db, 'scenario_log'), orderBy('runAt', 'desc'), limit(5));
    onSnapshot(q, snap => {
      const entries = snap.docs.map(d => d.data());
      if (!entries.length) { scenarioLogEl.textContent = ''; return; }
      scenarioLogEl.innerHTML = 'Poslední spuštění: ' + entries.map(e => {
        const when = e.runAt?.toDate ? e.runAt.toDate().toLocaleString('cs-CZ') : '';
        return `${e.scenario === 'arrival' ? 'Příjezd' : 'Odjezd'} (${e.mode === 'auto' ? 'auto' : 'ručně'}) – ${when}`;
      }).join(' · ');
    }, () => { /* scenario_log ještě nemusí existovat / bez oprávnění – tiše ignorovat */ });
  }
}
