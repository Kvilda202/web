// ==========================================================================
// Kvilda 202 – aktuální meteoradar v hero sekci (RainViewer, zdarma, bez API klíče)
// Zobrazuje animaci posledních snímků srážkového radaru nad okolím Kvildy.
// ==========================================================================
(function () {
  const el = document.getElementById('radar-map');
  const elTime = document.getElementById('radar-time');
  if (!el || typeof L === 'undefined') return;

  const KVILDA = [49.016101, 13.581747];
  const ZOOM = 7;              // RainViewer (free) poskytuje dlaždice max. do zoomu 7
  const FRAMES = 6;            // posledních ~60 minut po 10 min
  const STEP_MS = 700;

  const map = L.map(el, {
    center: KVILDA, zoom: ZOOM, zoomControl: false, attributionControl: false,
    dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
    keyboard: false, touchZoom: false, tap: false,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
  L.marker(KVILDA, {
    icon: L.divIcon({ className: '', html: '<div class="radar-home"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
    interactive: false,
  }).addTo(map);

  const fmt = t => new Date(t * 1000).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

  function load() {
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(r => r.json())
      .then(data => {
        const frames = (data.radar && data.radar.past || []).slice(-FRAMES);
        if (!frames.length) throw new Error('no frames');
        const layers = frames.map(f => L.tileLayer(
          `${data.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
          { opacity: 0, maxNativeZoom: 7, maxZoom: 18, zIndex: 10 }
        ).addTo(map));

        let i = layers.length - 1;
        const show = idx => {
          layers.forEach((l, k) => l.setOpacity(k === idx ? 0.8 : 0));
          elTime.textContent = (idx === layers.length - 1 ? 'Stav ' : '') + fmt(frames[idx].time);
        };
        show(i);
        clearInterval(load.timer);
        load.timer = setInterval(() => {
          i = (i + 1) % layers.length;
          show(i);
        }, STEP_MS);
        // po 10 minutách načíst čerstvá data
        setTimeout(() => { clearInterval(load.timer); layers.forEach(l => map.removeLayer(l)); load(); }, 10 * 60 * 1000);
      })
      .catch(() => { elTime.textContent = 'Radar se nepodařilo načíst'; });
  }
  load();
})();
