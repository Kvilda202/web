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

  const fnListDevices = httpsCallable(functions, 'tuyaListDevices');
  const fnSetDevice = httpsCallable(functions, 'tuyaSetDevice');
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
    tuyaStatusEl.textContent = 'Načítám zařízení…';
    try {
      const res = await fnListDevices();
      tuyaDevices = res.data?.devices || [];
      tuyaStatusEl.textContent = '';
      renderTuyaDevices();
    } catch (err) {
      tuyaStatusEl.textContent = 'Nepodařilo se načíst zařízení: ' + err.message;
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
      const statusSpan = document.createElement('span');
      statusSpan.innerHTML = `<b>${dev.name}</b> <span class="dev-status ${dev.online ? 'online' : ''}">${dev.online ? 'online' : 'offline'}</span>`;

      const controls = document.createElement('div');
      controls.className = 'dev-controls';

      const toggleBtn = document.createElement('button');
      toggleBtn.textContent = dev.on ? 'Vypnout' : 'Zapnout';
      toggleBtn.className = 'btn-mail';
      toggleBtn.addEventListener('click', async () => {
        toggleBtn.disabled = true;
        try {
          await fnSetDevice({ deviceId: dev.id, on: !dev.on });
          await loadTuyaDevices();
        } catch (err) {
          alert('Nepodařilo se přepnout zařízení: ' + err.message);
          toggleBtn.disabled = false;
        }
      });
      controls.appendChild(toggleBtn);

      if (dev.kind === 'thermostat') {
        const tempInput = document.createElement('input');
        tempInput.type = 'number';
        tempInput.step = '0.5';
        tempInput.value = dev.tempC ?? '';
        tempInput.placeholder = '°C';
        const tempBtn = document.createElement('button');
        tempBtn.textContent = 'Nastavit °C';
        tempBtn.className = 'btn-mail';
        tempBtn.addEventListener('click', async () => {
          const tempC = parseFloat(tempInput.value);
          if (Number.isNaN(tempC)) return;
          tempBtn.disabled = true;
          try {
            await fnSetDevice({ deviceId: dev.id, tempC });
            await loadTuyaDevices();
          } catch (err) {
            alert('Nepodařilo se nastavit teplotu: ' + err.message);
          }
          tempBtn.disabled = false;
        });
        controls.append(tempInput, tempBtn);
      }

      li.append(statusSpan, controls);
      tuyaDevicesEl.appendChild(li);
    });
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
