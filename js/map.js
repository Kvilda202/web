// Kvilda 202 – vlastní stylizovaná mapa okolí (Leaflet + volně dostupné mapové vrstvy)
// Podklady: OpenStreetMap (základní mapa), Waymarked Trails (turistické a cyklo trasy),
// OpenSnowMap (sjezdovky a běžecké trasy). Všechny vrstvy jsou zdarma a nevyžadují API klíč.

document.addEventListener('DOMContentLoaded', () => {
  const mapEl = document.getElementById('map');
  if (!mapEl || typeof L === 'undefined') return;

  const KVILDA_202 = [49.016101, 13.581747]; // přesná poloha domu Kvilda 202 (ne obecní úřad)

  const POIS = [
    { id:'home', type:'home', name:'Apartmán Kvilda 202', desc:'Váš výchozí bod pro výlety po Šumavě.', coords:KVILDA_202, link:null },
    { id:'pramen-vltavy', type:'nature', name:'Pramen Vltavy', desc:'Symbolický pramen nejdelší české řeky, cca 5,5 km od Kvildy u Bučiny.', coords:[48.9749,13.5608], link:'https://cs.wikipedia.org/wiki/Pramen_Vltavy' },
    { id:'modrava', type:'nature', name:'Modrava', desc:'Malebná horská osada, výchozí bod k Rokytské slati a Vydře.', coords:[49.0237,13.4958], link:'https://cs.wikipedia.org/wiki/Modrava' },
    { id:'jezerni-slat', type:'nature', name:'Jezerní slať', desc:'Rašeliniště s naučnou stezkou mezi Kvildou a Horskou Kvildou.', coords:[49.0398,13.5754], link:'https://cs.wikipedia.org/wiki/Jezern%C3%AD_sla%C5%A5' },
    { id:'bucina', type:'nature', name:'Bučina', desc:'Zaniklá obec na hranici s Německem, replika drátěných zátarasů.', coords:[48.9671,13.5925], link:'https://cs.wikipedia.org/wiki/Bu%C4%8Dina_(Kvilda)' },
    { id:'knizeci-plane', type:'nature', name:'Knížecí Pláně', desc:'Zaniklá osada s obnoveným hřbitovem, klidné šumavské pláně.', coords:[48.9520,13.6162], link:'https://cs.wikipedia.org/wiki/Kn%C3%AD%C5%BEec%C3%AD_Pl%C3%A1n%C4%9B' },
    { id:'borova-lada', type:'nature', name:'Borová Lada', desc:'Sousední obec, křižovatka pěších a cyklotras.', coords:[48.9899,13.6598], link:'https://cs.wikipedia.org/wiki/Borov%C3%A1_Lada' },
    { id:'luzny', type:'nature', name:'Luzný (1373 m)', desc:'Výrazná hora s kamenným mořem na německé straně Šumavy.', coords:[48.9392,13.5068], link:'https://cs.wikipedia.org/wiki/Luzn%C3%BD' },
    { id:'horska-kvilda', type:'nature', name:'Horská Kvilda', desc:'Sousední horská obec, oblíbený cíl běžkařů i turistů.', coords:[49.0576,13.5580], link:'https://cs.wikipedia.org/wiki/Horsk%C3%A1_Kvilda' },
    { id:'vybeh-rysu', type:'nature', name:'Jelení a rysí výběh', desc:'Návštěvnické centrum NP Šumava, bezbariérová stezka s vyhlídkovými věžemi, vstup zdarma.', coords:[49.0312,13.5809], link:'https://www.npsumava.cz/navstivte-sumavu/navstevnicka-centra/navstevnicke-centrum-kvilda/' },
    { id:'zadov-ski', type:'ski', name:'Skiareál Zadov–Churáňov', desc:'Největší lyžařské středisko na Šumavě, sjezdovky i běžecké trasy.', coords:[49.0663,13.6316], link:'https://www.lazadov.cz/' },
    { id:'zadov-rozhledna', type:'ski', name:'Rozhledna Zadov', desc:'Netradiční vyhlídka na bývalém skokanském můstku, 32 m nad zemí.', coords:[49.0615,13.6298], link:'https://www.lazadov.cz/la/leto-rozhledna.asp' },
    { id:'pivovar', type:'food', name:'Pekárna a pivovar Kvilda', desc:'Rodinný pivovar, pekárna a restaurace přímo na Kvildě.', coords:[49.0207,13.5797], link:'https://www.pekarnakvilda.cz' },
    { id:'nadivoko', type:'food', name:'Kvilda Nadivoko', desc:'Restaurace s poctivou kuchyní z lokálních surovin.', coords:[49.0149,13.5789], link:'https://www.kvilda-nadivoko.cz' },
    { id:'sumava-inn', type:'food', name:'Hotel a restaurace Šumava Inn', desc:'Restaurace se staročeskou šumavskou i mezinárodní kuchyní.', coords:[49.0180,13.5797], link:'https://www.sumavainn.cz/cz/' },
    { id:'wild-burgers', type:'food', name:'Wild Burgers – Bistro Kvilda', desc:'Burgrárna a bistro v centru Kvildy.', coords:[49.01683,13.58020], link:'https://www.facebook.com/p/Wild-Burgers-Bistro-Kvilda-100061838151073/' },
    { id:'kvilda-hotel', type:'food', name:'Kvilda Hotel – restaurace', desc:'Hotelová restaurace v centru obce.', coords:[49.01795,13.57941], link:'https://kvildahotel.cz' },
    { id:'u-sulku', type:'food', name:'Penzion U Šulků', desc:'Penzion s restaurací na jižním okraji Kvildy.', coords:[49.01036,13.57960], link:null },
    { id:'obcerstveni', type:'food', name:'Občerstvení u parkoviště', desc:'Rychlé občerstvení u centrálního parkoviště.', coords:[49.01600,13.57957], link:null },
    { id:'kvildy-cafe', type:'cafe', name:'Kvildy.café', desc:'Stylová kavárna (Kvilda 34) – snídaně, polévky, dezerty a výběrová káva. Po–Čt 12–18, Pá–So 10–19, Ne 10–18.', coords:[49.02064,13.58024], link:'https://www.kvildy.cafe/' },
    { id:'na-kvilde', type:'cafe', name:'Kavárna a cukrárna Na Kvildě', desc:'Domácí zákusky a občerstvení (Kvilda 207). Tel. 723 227 377.', coords:[49.02057,13.58072], link:'http://www.nakvilde.cz/' },
    { id:'obchod', type:'shop', name:'Smíšené zboží Kvilda', desc:'Obchod s potravinami v centru, ve stejné budově pošta.', coords:[49.01709,13.57997], link:null },
    { id:'pekarna', type:'shop', name:'Pekárna Kvilda', desc:'Čerstvé pečivo z vlastní pekárny, denně 8–17 h.', coords:[49.02058,13.57953], link:'https://www.pekarnakvilda.cz' },
    { id:'bus-kvilda', type:'bus', name:'Zastávka Kvilda', desc:'Hlavní autobusová zastávka v centru. Zelené linky 979 (Modrava – Železná Ruda) a 980 (Horská Kvilda – Bučina), cyklobus 689.', coords:[49.01827,13.57950], link:'https://www.npsumava.cz/navstivte-sumavu/zelene-linky-sumavy-2026/' },
    { id:'bus-bucina', type:'bus', name:'Zastávka Kvilda, Bučina st. hr.', desc:'Konečná zelené linky 980 u státní hranice. Cca 100 m pěšky na německou zastávku Teufelshäng Grenze.', coords:[48.96541,13.58994], link:'https://www.npsumava.cz/navstivte-sumavu/zelene-linky-sumavy-2026/' },
    { id:'bus-teufelshaeng', type:'bus', name:'Teufelshäng Grenze (DE)', desc:'Zastávka Igelbusu 603 (Finsteraubus) – přes Finsterau a Mauth do Spiegelau / NP centra Lusen.', coords:[48.96508,13.58818], link:'https://www.bayerwald-ticket.com/wp-content/uploads/2026/05/Fahrplaene-Igel-und-Freizeitbusse_FRG_2026.pdf' },
    { id:'bus-finsterau', type:'bus', name:'Finsterau Ortsmitte (DE)', desc:'Zastávka linky 603 v obci Finsterau – skanzen Freilichtmuseum Finsterau.', coords:[48.93068,13.57756], link:'https://www.bayerwald-ticket.com/igelbusse-im-rachel-lusen-gebiet/' },
  ];

  const ICONS = {
    home:  { emoji:'🏠', cls:'home' },
    nature:{ emoji:'🌲', cls:'nature' },
    food:  { emoji:'🍺', cls:'food' },
    ski:   { emoji:'⛷️', cls:'ski' },
    cafe:  { emoji:'☕', cls:'cafe' },
    shop:  { emoji:'🛒', cls:'shop' },
    bus:   { emoji:'🚌', cls:'bus' },
  };

  function makeIcon(type) {
    if (type === 'home') {
      return L.divIcon({
        className: '',
        html: `<div class="kv-pin home kv-pin-logo"><img src="assets/icons/logo-marker.webp" alt=""></div>`,
        iconSize: [42,42],
        iconAnchor: [21,42],
        popupAnchor: [0,-40],
      });
    }
    const conf = ICONS[type] || ICONS.nature;
    return L.divIcon({
      className: '',
      html: `<div class="kv-pin ${conf.cls}"><span>${conf.emoji}</span></div>`,
      iconSize: [30,30],
      iconAnchor: [15,30],
      popupAnchor: [0,-28],
    });
  }

  const map = L.map('map', { scrollWheelZoom:false }).setView(KVILDA_202, 12);

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> přispěvatelé'
  }).addTo(map);

  const hikingLayer = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
    maxZoom: 18, opacity:.85,
    attribution: 'Trasy: <a href="https://waymarkedtrails.org">Waymarked Trails</a>'
  });
  const cyclingLayer = L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
    maxZoom: 18, opacity:.85,
    attribution: 'Trasy: <a href="https://waymarkedtrails.org">Waymarked Trails</a>'
  });
  const snowLayer = L.tileLayer('https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png', {
    maxZoom: 18, opacity:.9,
    attribution: 'Sjezdovky a běžky: <a href="https://www.opensnowmap.org">OpenSnowMap</a>'
  });

  let currentSeason = 'leto';
  function applySeason(season) {
    currentSeason = season;
    [hikingLayer, cyclingLayer, snowLayer].forEach(l => map.removeLayer(l));
    if (season === 'leto') { hikingLayer.addTo(map); cyclingLayer.addTo(map); }
    else { snowLayer.addTo(map); }
    document.querySelectorAll('.map-toolbar [data-season]').forEach(b => {
      b.classList.toggle('active', b.dataset.season === season);
    });
  }
  applySeason('leto');

  document.querySelectorAll('.map-toolbar [data-season]').forEach(btn => {
    btn.addEventListener('click', () => applySeason(btn.dataset.season));
  });

  const markers = {};
  POIS.forEach(poi => {
    const m = L.marker(poi.coords, { icon: makeIcon(poi.type) }).addTo(map);
    const linkHtml = poi.link ? `<br><a href="${poi.link}" target="_blank" rel="noopener">více info →</a>` : '';
    m.bindPopup(`<b>${poi.name}</b><br>${poi.desc}${linkHtml}`);
    markers[poi.id] = m;
  });

  document.querySelectorAll('[data-fly-to]').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const id = el.dataset.flyTo;
      const poi = POIS.find(p => p.id === id);
      if (!poi) return;
      map.flyTo(poi.coords, 14, { duration: 1.1 });
      markers[id].openPopup();
      document.getElementById('mapa').scrollIntoView({ behavior:'smooth', block:'start' });
    });
  });
});
