// ==========================================================================
// Kvilda 202 – aktuální počasí v hero sekci (Open-Meteo, zdarma, bez API klíče)
// ==========================================================================
(function () {
  const LAT = 49.016101, LON = 13.581747; // Kvilda 202

  const WMO = {
    0: ['Jasno', '☀️'],
    1: ['Skoro jasno', '🌤️'],
    2: ['Polojasno', '⛅'],
    3: ['Zataženo', '☁️'],
    45: ['Mlha', '🌫️'],
    48: ['Mrznoucí mlha', '🌫️'],
    51: ['Slabé mrholení', '🌦️'],
    53: ['Mrholení', '🌦️'],
    55: ['Vydatné mrholení', '🌦️'],
    56: ['Mrznoucí mrholení', '🌧️'],
    57: ['Mrznoucí mrholení', '🌧️'],
    61: ['Slabý déšť', '🌧️'],
    63: ['Déšť', '🌧️'],
    65: ['Vydatný déšť', '🌧️'],
    66: ['Mrznoucí déšť', '🌧️'],
    67: ['Mrznoucí déšť', '🌧️'],
    71: ['Slabé sněžení', '🌨️'],
    73: ['Sněžení', '❄️'],
    75: ['Vydatné sněžení', '❄️'],
    77: ['Sněhové zrno', '❄️'],
    80: ['Přeháňky', '🌦️'],
    81: ['Přeháňky', '🌦️'],
    82: ['Silné přeháňky', '⛈️'],
    85: ['Sněhové přeháňky', '🌨️'],
    86: ['Sněhové přeháňky', '🌨️'],
    95: ['Bouřka', '⛈️'],
    96: ['Bouřka s kroupami', '⛈️'],
    99: ['Bouřka s kroupami', '⛈️'],
  };

  const elIcon = document.getElementById('weather-icon');
  const elTemp = document.getElementById('weather-temp');
  const elDesc = document.getElementById('weather-desc');
  if (!elTemp) return;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code&timezone=Europe%2FPrague`;

  fetch(url)
    .then(r => r.json())
    .then(data => {
      const cur = data && data.current;
      if (!cur) throw new Error('no data');
      const [desc, icon] = WMO[cur.weather_code] || ['Počasí na Kvildě', '⛅'];
      elTemp.textContent = Math.round(cur.temperature_2m) + '°C';
      elDesc.textContent = desc;
      if (elIcon) elIcon.textContent = icon;
    })
    .catch(() => {
      elDesc.textContent = 'Počasí se nepodařilo načíst';
      elTemp.textContent = '–°C';
    });
})();
