// ==========================================================================
// Kvilda 202 – Firebase Cloud Functions
// ==========================================================================
// 1) Bezpečný proxy pro Tuya Cloud API (ovládání chytrých zařízení)
// 2) Dva scénáře: "arrival" (příjezd hosta – 22 °C, vše zapnuto) a
//    "departure" (odjezd hosta – útlum, 19 °C, přímotopy/bojler vypnuty)
// 3) Naplánovaná funkce, která scénáře spouští automaticky podle rezervací
//    v Firestore (blocked_ranges) – 24 h před příjezdem a po checkoutu (12:00)
// 4) Odeslání potvrzovacího e-mailu s QR platbou a odkazem na mapu
//
// Přístupové údaje (Tuya Client ID/Secret, Gmail App Password, IBAN) se
// NIKDY nedávají do kódu – nastavují se jako Firebase Functions secrets:
//   firebase functions:secrets:set TUYA_CLIENT_ID
//   firebase functions:secrets:set TUYA_CLIENT_SECRET
//   firebase functions:secrets:set GMAIL_APP_PASSWORD
//   firebase functions:secrets:set BANK_IBAN
// ==========================================================================

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { TuyaContext } = require('@tuya/tuya-connector-nodejs');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

admin.initializeApp();
const db = admin.firestore();

// ---------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------
const TUYA_CLIENT_ID = defineSecret('TUYA_CLIENT_ID');
const TUYA_CLIENT_SECRET = defineSecret('TUYA_CLIENT_SECRET');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');
const BANK_IBAN = defineSecret('BANK_IBAN');

const TUYA_SECRETS = [TUYA_CLIENT_ID, TUYA_CLIENT_SECRET];

// Musí odpovídat js/firebase-config.js (KVILDA_ADMIN_EMAILS) a firestore.rules
const ADMIN_EMAILS = ['kvilda202@gmail.com', 'pavla.hraba@gmail.com'];

const SENDER_EMAIL = 'kvilda202@gmail.com';
const MAPS_LINK = 'https://www.google.com/maps/search/?api=1&query=Kvilda+202%2C+384+93+Kvilda';

// ---------------------------------------------------------------------
// Zařízení zapojená do vytápěcích scénářů
// (SmartLock a Kulový ventil voda jsou úmyslně vynechány – bezpečnost)
// ---------------------------------------------------------------------
const HEATING_DEVICES = [
  { id: 'bf8f9bce4a367468a0bnew', name: 'Termostat předsíň', kind: 'thermostat' },
  { id: 'bf29d38c73464013aaogaw', name: 'Termostat obývací pokoj', kind: 'thermostat' },
  { id: 'bf1464e64c740a8898fsfn', name: 'Termostat horní koupelna', kind: 'thermostat' },
  { id: 'bf23966624a4e320c6rjk0', name: 'Termostat hlavní místnost', kind: 'thermostat' },
  { id: 'bfb301c578b33536c31dcs', name: 'Přímotop ložnice vpravo', kind: 'switch' },
  { id: 'bf80c97f57cba6f1dexevy', name: 'Přímotop ložnice vlevo', kind: 'switch' },
  { id: 'bfd31cd176744c8ecafaxw', name: 'Bojler (jistič)', kind: 'switch' },
];

const ARRIVAL_TEMP_C = 22;
const DEPARTURE_TEMP_C = 19;

function getTuya() {
  return new TuyaContext({
    baseUrl: 'https://openapi.tuyaeu.com', // Central Europe Data Center
    accessKey: TUYA_CLIENT_ID.value(),
    secretKey: TUYA_CLIENT_SECRET.value(),
  });
}

function assertAdmin(auth) {
  if (!auth || !ADMIN_EMAILS.includes(auth.token.email)) {
    throw new HttpsError('permission-denied', 'Nemáte oprávnění spravovat zařízení.');
  }
}

// ---------------------------------------------------------------------
// Tuya – obecné ovládání (funguje napříč modely termostatů/spínačů:
// zjistí si skutečné DP kódy zařízení místo natvrdo zadaných hodnot)
// ---------------------------------------------------------------------
async function getDeviceFunctions(client, deviceId) {
  const res = await client.request({
    path: `/v1.0/devices/${deviceId}/specifications`,
    method: 'GET',
  });
  if (!res.success) throw new Error(res.msg || `Tuya specifikace selhala (${deviceId})`);
  return res.result.functions || [];
}

async function setDeviceState(client, dev, { on, tempC }) {
  let functions;
  try {
    functions = await getDeviceFunctions(client, dev.id);
  } catch (e) {
    return { deviceId: dev.id, name: dev.name, success: false, msg: e.message };
  }

  const commands = [];

  if (typeof on === 'boolean') {
    const swFn = functions.find(f => f.type === 'Boolean' && /switch/i.test(f.code));
    if (swFn) commands.push({ code: swFn.code, value: on });
  }

  if (typeof tempC === 'number') {
    const tempFn = functions.find(f => f.type === 'Integer' && /temp_set/i.test(f.code));
    if (tempFn) {
      let scale = 0;
      try { scale = JSON.parse(tempFn.values).scale || 0; } catch (e) { /* ignore */ }
      commands.push({ code: tempFn.code, value: Math.round(tempC * 10 ** scale) });
    }
  }

  if (!commands.length) {
    return { deviceId: dev.id, name: dev.name, success: false, msg: 'Zařízení nepodporuje požadovaný příkaz nebo je offline.' };
  }

  const res = await client.request({
    path: `/v1.0/devices/${dev.id}/commands`,
    method: 'POST',
    body: { commands },
  });
  return { deviceId: dev.id, name: dev.name, success: res.success, msg: res.msg, commands };
}

async function runScenarioInternal(scenario) {
  const client = getTuya();
  const isArrival = scenario === 'arrival';
  const results = [];
  for (const dev of HEATING_DEVICES) {
    const opts = dev.kind === 'thermostat'
      ? { on: true, tempC: isArrival ? ARRIVAL_TEMP_C : DEPARTURE_TEMP_C }
      : { on: isArrival };
    // eslint-disable-next-line no-await-in-loop
    results.push(await setDeviceState(client, dev, opts));
  }
  return results;
}

async function logScenario(scenario, mode, extra = {}) {
  await db.collection('scenario_log').add({
    scenario, mode, ...extra,
    runAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Zjednoduší syrový stav Tuya zařízení (pole DP kódů) na {on, tempC} pro admin panel.
function simplifyStatus(statusArr, functions) {
  const out = {};
  if (!Array.isArray(statusArr)) return out;
  const swEntry = statusArr.find(s => /switch/i.test(s.code));
  if (swEntry) out.on = !!swEntry.value;

  const tempEntry = statusArr.find(s => /temp_set/i.test(s.code));
  if (tempEntry) {
    let scale = 0;
    const tempFn = (functions || []).find(f => /temp_set/i.test(f.code));
    if (tempFn) {
      try { scale = JSON.parse(tempFn.values).scale || 0; } catch (e) { /* ignore */ }
    }
    out.tempC = Number(tempEntry.value) / 10 ** scale;
  }
  return out;
}

// ---------------------------------------------------------------------
// Callable: seznam zařízení + aktuální stav (pro admin panel)
// ---------------------------------------------------------------------
exports.tuyaListDevices = onCall({ secrets: TUYA_SECRETS, region: 'europe-west1' }, async (req) => {
  assertAdmin(req.auth);
  const client = getTuya();
  const devices = [];
  for (const dev of HEATING_DEVICES) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await client.request({ path: `/v1.0/devices/${dev.id}`, method: 'GET' });
      let simplified = {};
      if (res.success) {
        let functions = [];
        try {
          // eslint-disable-next-line no-await-in-loop
          functions = await getDeviceFunctions(client, dev.id);
        } catch (e) { /* ignore, jen pro přepočet škály teploty */ }
        simplified = simplifyStatus(res.result.status, functions);
      }
      devices.push({
        ...dev,
        online: res.success ? !!res.result.online : false,
        ...simplified,
      });
    } catch (e) {
      devices.push({ ...dev, online: false, error: e.message });
    }
  }
  return { devices };
});

// ---------------------------------------------------------------------
// Callable: ruční ovládání jednoho zařízení (jednotlivý přepínač/teplota)
// ---------------------------------------------------------------------
exports.tuyaSetDevice = onCall({ secrets: TUYA_SECRETS, region: 'europe-west1' }, async (req) => {
  assertAdmin(req.auth);
  const { deviceId, on, tempC } = req.data || {};
  const dev = HEATING_DEVICES.find(d => d.id === deviceId);
  if (!dev) throw new HttpsError('invalid-argument', 'Neznámé zařízení.');
  const client = getTuya();
  return setDeviceState(client, dev, { on, tempC });
});

// ---------------------------------------------------------------------
// VŠECHNA zařízení v Tuya projektu (pro admin panel) – obecné ovládání
// ---------------------------------------------------------------------
// Kategorie, u kterých admin panel i server vyžadují potvrzení
// (zámky, ventily vody/plynu, alarmy) – aby nešlo omylem odemknout / zavřít vodu.
const SENSITIVE_CATEGORIES = ['ms', 'jtmspro', 'jtmsbh', 'mk', 'bxx', 'gyms', 'sfkzq', 'fs_valve', 'mal'];
const SENSITIVE_NAME_RE = /(zámek|zamek|lock|ventil|valve|alarm)/i;

function parseValues(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

// Vrátí seznam zařízení v projektu (id, name, category, online…)
async function listProjectDevices(client) {
  const out = [];
  // 1) Tuya IoT projekt – "Query devices in project"
  try {
    let lastId = '';
    for (let page = 0; page < 20; page++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await client.request({
        path: '/v2.0/cloud/thing/device',
        method: 'GET',
        query: lastId ? { page_size: 20, last_id: lastId } : { page_size: 20 },
      });
      if (!res.success) break;
      const list = Array.isArray(res.result) ? res.result : (res.result?.list || []);
      out.push(...list);
      if (list.length < 20) break;
      lastId = list[list.length - 1].id;
    }
  } catch (e) { logger.warn('v2.0 device list failed', e.message); }

  // 2) Záloha – zařízení z propojeného účtu aplikace Smart Life / Tuya Smart
  if (!out.length) {
    let lastRowKey = '';
    for (let page = 0; page < 20; page++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await client.request({
        path: '/v1.0/iot-01/associated-users/devices',
        method: 'GET',
        query: lastRowKey ? { size: 100, last_row_key: lastRowKey } : { size: 100 },
      });
      if (!res.success) throw new Error(res.msg || 'Seznam zařízení z Tuya se nepodařilo načíst.');
      out.push(...(res.result?.devices || []));
      if (!res.result?.has_more) break;
      lastRowKey = res.result.last_row_key;
    }
  }

  // sjednocení názvů polí mezi verzemi API + odstranění duplicit
  const seen = new Set();
  return out.map(d => ({
    id: d.id,
    name: d.customName || d.name || d.id,
    category: d.category || '',
    productName: d.productName || d.product_name || '',
    online: !!(d.isOnline ?? d.online ?? d.is_online),
  })).filter(d => d.id && !seen.has(d.id) && seen.add(d.id));
}

async function getDeviceDetail(client, dev) {
  const [specRes, statusRes] = await Promise.all([
    client.request({ path: `/v1.0/devices/${dev.id}/specifications`, method: 'GET' }).catch(e => ({ success: false, msg: e.message })),
    client.request({ path: `/v1.0/devices/${dev.id}/status`, method: 'GET' }).catch(e => ({ success: false, msg: e.message })),
  ]);
  const functions = specRes.success ? (specRes.result.functions || []) : [];
  const statusSpec = specRes.success ? (specRes.result.status || []) : [];
  const status = statusRes.success ? (statusRes.result || []) : [];
  const heating = HEATING_DEVICES.some(h => h.id === dev.id);
  return {
    ...dev,
    heating,
    sensitive: SENSITIVE_CATEGORIES.includes(dev.category) || SENSITIVE_NAME_RE.test(dev.name),
    functions: functions.map(f => ({ code: f.code, type: f.type, values: parseValues(f.values) })),
    statusSpec: statusSpec.map(f => ({ code: f.code, type: f.type, values: parseValues(f.values) })),
    status: status.map(x => ({ code: x.code, value: x.value })),
    error: specRes.success ? undefined : specRes.msg,
  };
}

exports.tuyaListAllDevices = onCall({ secrets: TUYA_SECRETS, region: 'europe-west1', timeoutSeconds: 120 }, async (req) => {
  assertAdmin(req.auth);
  const client = getTuya();
  let list;
  try {
    list = await listProjectDevices(client);
  } catch (e) {
    throw new HttpsError('unavailable', e.message);
  }
  // doplnit i scénářová zařízení, kdyby je seznam z projektu nevrátil
  HEATING_DEVICES.forEach(h => {
    if (!list.some(d => d.id === h.id)) list.push({ id: h.id, name: h.name, category: '', productName: '', online: false });
  });
  const devices = await Promise.all(list.map(d => getDeviceDetail(client, d)));
  devices.sort((a, b) => (b.heating - a.heating) || a.name.localeCompare(b.name, 'cs'));
  return { devices };
});

// Obecný příkaz pro jedno zařízení: { deviceId, code, value, confirm }
// value = hodnota v "lidských" jednotkách (např. 21.5 °C) – škálování dělá server.
exports.tuyaSendCommand = onCall({ secrets: TUYA_SECRETS, region: 'europe-west1' }, async (req) => {
  assertAdmin(req.auth);
  const { deviceId, code, value, confirm } = req.data || {};
  if (typeof deviceId !== 'string' || typeof code !== 'string') {
    throw new HttpsError('invalid-argument', 'Chybí zařízení nebo příkaz.');
  }
  const client = getTuya();
  const list = await listProjectDevices(client).catch(() => []);
  let dev = list.find(d => d.id === deviceId);
  if (!dev) {
    const h = HEATING_DEVICES.find(d => d.id === deviceId);
    if (h) dev = { id: h.id, name: h.name, category: '' };
  }
  if (!dev) throw new HttpsError('invalid-argument', 'Zařízení nepatří do projektu.');
  const sensitive = SENSITIVE_CATEGORIES.includes(dev.category) || SENSITIVE_NAME_RE.test(dev.name);
  if (sensitive && confirm !== true) {
    throw new HttpsError('failed-precondition', 'Toto zařízení vyžaduje potvrzení.');
  }

  let functions;
  try { functions = await getDeviceFunctions(client, deviceId); } catch (e) {
    throw new HttpsError('unavailable', e.message);
  }
  const fn = functions.find(f => f.code === code);
  if (!fn) throw new HttpsError('invalid-argument', 'Zařízení tento příkaz nepodporuje.');
  const vals = parseValues(fn.values);

  let raw;
  if (fn.type === 'Boolean') {
    if (typeof value !== 'boolean') throw new HttpsError('invalid-argument', 'Očekávána hodnota ano/ne.');
    raw = value;
  } else if (fn.type === 'Integer') {
    const num = Number(value);
    if (!Number.isFinite(num)) throw new HttpsError('invalid-argument', 'Očekáváno číslo.');
    const scale = vals.scale || 0;
    raw = Math.round(num * 10 ** scale);
    if (typeof vals.min === 'number' && raw < vals.min) raw = vals.min;
    if (typeof vals.max === 'number' && raw > vals.max) raw = vals.max;
  } else if (fn.type === 'Enum') {
    if (!Array.isArray(vals.range) || !vals.range.includes(value)) throw new HttpsError('invalid-argument', 'Neplatná volba.');
    raw = value;
  } else {
    throw new HttpsError('invalid-argument', `Typ ${fn.type} nelze z panelu ovládat.`);
  }

  const res = await client.request({
    path: `/v1.0/devices/${deviceId}/commands`,
    method: 'POST',
    body: { commands: [{ code, value: raw }] },
  });
  logger.info('tuyaSendCommand', { by: req.auth.token.email, deviceId, name: dev.name, code, raw, success: res.success });
  if (!res.success) throw new HttpsError('aborted', res.msg || 'Tuya příkaz odmítla.');
  return { success: true };
});

// ---------------------------------------------------------------------
// Callable: ruční spuštění scénáře z admin panelu
// ---------------------------------------------------------------------
exports.tuyaRunScenario = onCall({ secrets: TUYA_SECRETS, region: 'europe-west1' }, async (req) => {
  assertAdmin(req.auth);
  const { scenario } = req.data || {};
  if (!['arrival', 'departure'].includes(scenario)) {
    throw new HttpsError('invalid-argument', 'Neznámý scénář.');
  }
  const results = await runScenarioInternal(scenario);
  await logScenario(scenario, 'manual', { triggeredBy: req.auth.token.email, results });
  return { results };
});

// ---------------------------------------------------------------------
// Naplánovaná funkce (každou hodinu): automatické spouštění dle rezervací
// - "arrival"   – spustí se, jakmile do check-inu (předpoklad 14:00) zbývá
//                 24 hodin nebo méně (a ještě nebyl pro tuto rezervaci spuštěn)
// - "departure" – spustí se po checkoutu (předpoklad 12:00) v den odjezdu
// ---------------------------------------------------------------------
exports.scenarioScheduler = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'Europe/Prague', secrets: TUYA_SECRETS, region: 'europe-west1' },
  async () => {
    const now = new Date();
    const snap = await db.collection('blocked_ranges').get();

    for (const docSnap of snap.docs) {
      const r = docSnap.data();
      if (!r.start || !r.end) continue;

      const arrivalAt = new Date(`${r.start}T14:00:00`);
      const hoursToArrival = (arrivalAt.getTime() - now.getTime()) / 3.6e6;
      if (!r.arrivalScenarioRun && hoursToArrival <= 24 && hoursToArrival > -6) {
        // eslint-disable-next-line no-await-in-loop
        const results = await runScenarioInternal('arrival');
        // eslint-disable-next-line no-await-in-loop
        await docSnap.ref.update({ arrivalScenarioRun: true });
        // eslint-disable-next-line no-await-in-loop
        await logScenario('arrival', 'auto', { rangeId: docSnap.id, results });
        logger.info(`Scénář příjezdu spuštěn pro rezervaci ${docSnap.id}`);
      }

      const departureAt = new Date(`${r.end}T12:00:00`);
      const hoursSinceDeparture = (now.getTime() - departureAt.getTime()) / 3.6e6;
      if (!r.departureScenarioRun && hoursSinceDeparture >= 0 && hoursSinceDeparture < 6) {
        // eslint-disable-next-line no-await-in-loop
        const results = await runScenarioInternal('departure');
        // eslint-disable-next-line no-await-in-loop
        await docSnap.ref.update({ departureScenarioRun: true });
        // eslint-disable-next-line no-await-in-loop
        await logScenario('departure', 'auto', { rangeId: docSnap.id, results });
        logger.info(`Scénář odjezdu spuštěn pro rezervaci ${docSnap.id}`);
      }
    }
  }
);

// ---------------------------------------------------------------------
// Odhad ceny (stejná logika jako ceník na webu – hlavní sezóna 5000 Kč/noc,
// mimo sezónu 4000 Kč/noc). Admin může částku v panelu před odesláním upravit
// (svátky typu Velikonoce se datem posouvají, proto jen orientační odhad).
// ---------------------------------------------------------------------
function estimatePriceCzk(startStr, endStr) {
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  const nights = Math.round((end - start) / 86400000);
  let total = 0;
  const d = new Date(start);
  for (let i = 0; i < nights; i++) {
    const month = d.getMonth() + 1; // 1-12
    const inSeason = month === 12 || month <= 3 || (month >= 7 && month <= 8);
    total += inSeason ? 5000 : 4000;
    d.setDate(d.getDate() + 1);
  }
  return { nights, total };
}

// Czech "QR Platba" (SPAYD) formát – naskenovatelné bankovními aplikacemi.
function buildSpaydString({ iban, amount, message, variableSymbol }) {
  const parts = [
    'SPD*1.0',
    `ACC:${iban}`,
    `AM:${amount.toFixed(2)}`,
    'CC:CZK',
  ];
  if (message) parts.push(`MSG:${message.slice(0, 60)}`);
  if (variableSymbol) parts.push(`X-VS:${variableSymbol}`);
  return parts.join('*');
}

// ---------------------------------------------------------------------
// Callable: odeslání potvrzovacího e-mailu hostovi k dané rezervaci
// ---------------------------------------------------------------------
exports.sendReservationEmail = onCall(
  { secrets: [GMAIL_APP_PASSWORD, BANK_IBAN], region: 'europe-west1' },
  async (req) => {
    assertAdmin(req.auth);
    const { rangeId, guestEmail, guestName, amountOverride } = req.data || {};
    if (!rangeId || !guestEmail) {
      throw new HttpsError('invalid-argument', 'Chybí rezervace nebo e-mail hosta.');
    }

    const rangeSnap = await db.collection('blocked_ranges').doc(rangeId).get();
    if (!rangeSnap.exists) throw new HttpsError('not-found', 'Rezervace nenalezena.');
    const r = rangeSnap.data();

    const iban = BANK_IBAN.value();
    if (!iban) {
      throw new HttpsError('failed-precondition', 'Bankovní účet (IBAN) zatím není nastaven – doplňte secret BANK_IBAN.');
    }

    const { nights, total } = estimatePriceCzk(r.start, r.end);
    const amount = typeof amountOverride === 'number' && amountOverride > 0 ? amountOverride : total;
    const variableSymbol = rangeId.replace(/\D/g, '').slice(0, 10) || undefined;

    const spayd = buildSpaydString({
      iban,
      amount,
      message: 'Kvilda 202 - rezervace',
      variableSymbol,
    });
    const qrDataUrl = await QRCode.toDataURL(spayd, { margin: 1, width: 260 });
    const qrCid = 'platba-qr';

    const dateFmt = (s) => {
      const [y, m, d] = s.split('-');
      return `${d}. ${m}. ${y}`;
    };

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#2a2b23;">
        <div style="text-align:center;padding:18px 0;">
          <img src="cid:logo" alt="Kvilda 202" style="width:96px;height:96px;border-radius:50%;">
        </div>
        <h2 style="color:#1c3a29;text-align:center;">Potvrzení rezervace – Kvilda 202</h2>
        <p>Dobrý den${guestName ? ' ' + guestName : ''},</p>
        <p>děkujeme za rezervaci apartmánu <b>Kvilda 202</b>. Shrnutí pobytu:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#666;">Příjezd</td><td style="padding:6px 0;text-align:right;"><b>${dateFmt(r.start)}</b> (od 14:00)</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Odjezd</td><td style="padding:6px 0;text-align:right;"><b>${dateFmt(r.end)}</b> (do 12:00)</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Počet nocí</td><td style="padding:6px 0;text-align:right;">${nights}</td></tr>
          <tr><td style="padding:10px 0;color:#666;border-top:1px solid #eee;">Cena k úhradě</td><td style="padding:10px 0;text-align:right;border-top:1px solid #eee;"><b>${amount.toLocaleString('cs-CZ')} Kč</b></td></tr>
        </table>
        <p style="text-align:center;">Platbu můžete provést jednoduše naskenováním QR kódu v bankovní aplikaci:</p>
        <div style="text-align:center;margin:16px 0;">
          <img src="cid:${qrCid}" alt="QR platba" width="220" height="220">
        </div>
        <p style="text-align:center;font-size:.85rem;color:#666;">Variabilní symbol: ${variableSymbol || '—'}</p>
        <div style="text-align:center;margin:26px 0;">
          <a href="${MAPS_LINK}" style="background:#29553b;color:#fff;text-decoration:none;padding:12px 22px;border-radius:100px;font-weight:600;">Navigovat na Kvilda 202 →</a>
        </div>
        <p style="font-size:.85rem;color:#666;">Apartmán Kvilda 202, 384 93 Kvilda, Šumava<br>606 080 413 · kvilda202@gmail.com</p>
      </div>`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SENDER_EMAIL, pass: GMAIL_APP_PASSWORD.value() },
    });

    await transporter.sendMail({
      from: `"Kvilda 202" <${SENDER_EMAIL}>`,
      to: guestEmail,
      subject: `Potvrzení rezervace – Kvilda 202 (${dateFmt(r.start)} – ${dateFmt(r.end)})`,
      html,
      attachments: [
        { filename: 'logo.webp', path: `${__dirname}/assets/logo.webp`, cid: 'logo' },
        { filename: 'qr-platba.png', content: qrDataUrl.split('base64,')[1], encoding: 'base64', cid: qrCid },
      ],
    });

    await rangeSnap.ref.update({
      emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      emailSentTo: guestEmail,
    });

    return { ok: true, amount, nights };
  }
);
