// ==========================================================================
// Kvilda 202 – administrace kalendáře a apartmánů (jen pro přihlášené správce)
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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
  const provider = new GoogleAuthProvider();

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
    const apartmentId = aptSelect.value;
    if (!start || !end || end <= start) { alert('Zkontrolujte prosím data – konec musí být po začátku.'); return; }
    try {
      await addDoc(collection(db, 'blocked_ranges'), {
        apartmentId, start, end, note,
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
      li.innerHTML = `<span><b>${aptName}</b> — ${r.start} → ${r.end} <em>(${r.note || ''})</em></span>`;
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Smazat';
      delBtn.className = 'btn-del';
      delBtn.addEventListener('click', async () => {
        if (confirm('Opravdu smazat tento termín?')) {
          await deleteDoc(doc(db, 'blocked_ranges', r.id));
        }
      });
      li.appendChild(delBtn);
      blockList.appendChild(li);
    });
  }
}
