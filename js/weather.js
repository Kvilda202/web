// ==========================================================================
// Kvilda 202 – aktuální počasí v hero sekci (Open-Meteo, zdarma, bez API klíče)
// ==========================================================================
(function () {
  const LAT = 49.016101, LON = 13.581747; // Kvilda 202

  // Barevné SVG ikony (místo emoji – ty se na každém zařízení vykreslují jinak)
  const SUN = '<circle cx="32" cy="32" r="11" fill="#FFC83D"/><g stroke="#FFB300" stroke-width="3.5" stroke-linecap="round"><path d="M32 8v7M32 49v7M8 32h7M49 32h7M15 15l5 5M44 44l5 5M15 49l5-5M44 20l5-5"/></g>';
  const SUN_SMALL = '<g transform="translate(-6 -8) scale(.8)">' + SUN + '</g>';
  const MOON = '<path d="M38 10a20 20 0 1 0 16 30A17 17 0 0 1 38 10z" fill="#FFE082" stroke="#F9C74F" stroke-width="2"/>';
  const MOON_SMALL = '<g transform="translate(-4 -6) scale(.75)">' + MOON + '</g>';
  const CLOUD = (fill = '#F4F7FB', stroke = '#B8C4D2') =>
    `<path d="M20 50h26a11 11 0 0 0 1-22 15 15 0 0 0-28-3 12 12 0 0 0 1 25z" fill="${fill}" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/>`;
  const CLOUD_DARK = CLOUD('#AEB9C7', '#7F8C9D');
  const RAIN = (n) => '<g stroke="#2F8BFF" stroke-width="3.5" stroke-linecap="round">' +
    [[22, 55], [32, 55], [42, 55]].slice(0, n).map(([x, y]) => `<path d="M${x} ${y}l-3 7"/>`).join('') + '</g>';
  const SNOW = '<g fill="#6EC6FF">' + [[22, 58], [32, 61], [42, 58]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3"/>`).join('') + '</g>';
  const BOLT = '<path d="M34 46l-8 10h7l-4 8 11-12h-7l4-6z" fill="#FFD23F" stroke="#F4A100" stroke-width="1.5" stroke-linejoin="round"/>';
  const FOG = '<g stroke="#C9D2DC" stroke-width="3.5" stroke-linecap="round"><path d="M14 54h36M18 61h28"/></g>';
  const up = (inner) => `<g transform="translate(0 -6)">${inner}</g>`;

  const ICONS = {
    clear:   d => d ? SUN : MOON,
    partly:  d => (d ? SUN_SMALL : MOON_SMALL) + '<g transform="translate(6 6) scale(.85)">' + CLOUD() + '</g>',
    cloudy:  () => CLOUD(),
    fog:     () => up(CLOUD()) + FOG,
    drizzle: () => up(CLOUD()) + RAIN(2),
    rain:    () => up(CLOUD_DARK) + RAIN(3),
    shower:  d => (d ? SUN_SMALL : MOON_SMALL) + up(CLOUD()) + RAIN(2),
    snow:    () => up(CLOUD()) + SNOW,
    thunder: () => up(CLOUD_DARK) + BOLT,
  };

  const WMO = {
    0: ['Jasno', 'clear'],
    1: ['Skoro jasno', 'partly'],
    2: ['Polojasno', 'partly'],
    3: ['Zataženo', 'cloudy'],
    45: ['Mlha', 'fog'],
    48: ['Mrznoucí mlha', 'fog'],
    51: ['Slabé mrholení', 'drizzle'],
    53: ['Mrholení', 'drizzle'],
    55: ['Vydatné mrholení', 'drizzle'],
    56: ['Mrznoucí mrholení', 'drizzle'],
    57: ['Mrznoucí mrholení', 'drizzle'],
    61: ['Slabý déšť', 'rain'],
    63: ['Déšť', 'rain'],
    65: ['Vydatný déšť', 'rain'],
    66: ['Mrznoucí déšť', 'rain'],
    67: ['Mrznoucí déšť', 'rain'],
    71: ['Slabé sněžení', 'snow'],
    73: ['Sněžení', 'snow'],
    75: ['Vydatné sněžení', 'snow'],
    77: ['Sněhové zrno', 'snow'],
    80: ['Přeháňky', 'shower'],
    81: ['Přeháňky', 'shower'],
    82: ['Silné přeháňky', 'shower'],
    85: ['Sněhové přeháňky', 'snow'],
    86: ['Sněhové přeháňky', 'snow'],
    95: ['Bouřka', 'thunder'],
    96: ['Bouřka s kroupami', 'thunder'],
    99: ['Bouřka s kroupami', 'thunder'],
  };

  const svg = (key, isDay) =>
    `<svg viewBox="0 0 64 68" width="100%" height="100%" aria-hidden="true">${(ICONS[key] || ICONS.partly)(isDay)}</svg>`;

  const elIcon = document.getElementById('weather-icon');
  const elTemp = document.getElementById('weather-temp');
  const elDesc = document.getElementById('weather-desc');
  if (!elTemp) return;
  if (elIcon) elIcon.innerHTML = svg('partly', true);

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code,is_day&timezone=Europe%2FPrague`;

  fetch(url)
    .then(r => r.json())
    .then(data => {
      const cur = data && data.current;
      if (!cur) throw new Error('no data');
      const [desc, key] = WMO[cur.weather_code] || ['Počasí na Kvildě', 'partly'];
      elTemp.textContent = Math.round(cur.temperature_2m) + '°C';
      elDesc.textContent = desc;
      if (elIcon) elIcon.innerHTML = svg(key, cur.is_day !== 0);
    })
    .catch(() => {
      elDesc.textContent = 'Počasí se nepodařilo načíst';
      elTemp.textContent = '–°C';
    });
})();
