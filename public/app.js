const TYPES = { hotel: 'Hôtel', apartment: 'Appartement', lodge: 'Lodge' };
const form = document.getElementById('search');
const sortEl = document.getElementById('sort');
const results = document.getElementById('results');
const count = document.getElementById('count');
const geoMsg = document.getElementById('geo-msg');
const mapbox = document.getElementById('mapbox');
const layout = document.querySelector('.layout');

const km1 = n => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

let near = null;        // {lat,lng} si "Autour de moi"
let map = null, markers = null, geo = null;

async function loadGeo() {
  geo = await api('/api/neighborhoods');
  const sel = document.getElementById('neighborhood');
  geo.zones.forEach(z => {
    const g = document.createElement('optgroup');
    g.label = z.name;
    z.neighborhoods.forEach(n => g.appendChild(new Option(n.name, n.id)));
    sel.appendChild(g);
  });
  // Bloc "Explorer par zone" : puces de quartiers cliquables
  document.getElementById('zones').innerHTML = '<h2 data-text="zones_title">Explorer Libreville par zone</h2>' + geo.zones.map(z => `
    <div class="zone">
      <h3>${esc(z.name)}</h3>
      <p>${esc(z.description)}</p>
      <div class="chips">${z.neighborhoods.map(n =>
        `<button type="button" class="chip" data-n="${esc(n.id)}">${esc(n.name)}</button>`).join('')}</div>
    </div>`).join('');
}

function initMap() {
  if (typeof L === 'undefined') { mapbox.classList.add('nomap'); return; }
  map = L.map('map', { scrollWheelZoom: false }).setView([geo.center.lat, geo.center.lng], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; contributeurs OpenStreetMap'
  }).addTo(map);
  markers = L.layerGroup().addTo(map);
}

function drawMarkers(list) {
  if (!map) return;
  markers.clearLayers();
  const pts = [];
  list.forEach(s => {
    if (typeof s.lat !== 'number') return;
    pts.push([s.lat, s.lng]);
    L.marker([s.lat, s.lng]).addTo(markers).bindPopup(
      `<strong>${esc(s.name)}</strong><br>${esc(s.area || s.city)}<br>${fcfa(s.price)}/nuit<br>` +
      `<a href="/stay.html?id=${encodeURIComponent(s.id)}">Voir la fiche</a>`);
  });
  if (near) pts.push([near.lat, near.lng]);
  if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
}

async function search() {
  const p = new URLSearchParams();
  new FormData(form).forEach((v, k) => v && p.set(k, v));
  if (sortEl.value) p.set('sort', sortEl.value);
  if (near) p.set('near', near.lat + ',' + near.lng);
  if (!results.children.length) results.innerHTML = skeletons(6);
  const list = await api('/api/stays?' + p);
  count.textContent = list.length + ' hébergement(s)';
  if (!list.length) {
    results.innerHTML = '<div class="empty">Aucun résultat. Essayez d\'autres critères.</div>';
  } else {
    results.innerHTML = list.map(s => {
      const dist = s.kmFromYou != null ? `${km1(s.kmFromYou)} km de vous`
        : s.kmFromCenter != null && s.zone ? `${km1(s.kmFromCenter)} km du centre-ville` : '';
      return `
      <a class="card" data-type="${esc(s.type)}" href="/stay.html?id=${encodeURIComponent(s.id)}">
        <div class="pic ${esc(s.type)}"><span class="tag">${TYPES[s.type] || ''} · ${'★'.repeat(s.stars)}</span></div>
        <div class="body">
          <h3>${esc(s.name)}</h3>
          <p class="loc">${esc(s.area || '')}${s.area ? ', ' : ''}${esc(s.city)}</p>
          ${s.zoneName ? `<p class="zone-tag">${esc(s.zoneName)}${s.arrondissement && /^\d/.test(s.arrondissement) ? ' · ' + esc(s.arrondissement) + ' arr.' : ''}</p>` : ''}
          ${dist ? `<p class="dist">${dist}</p>` : ''}
          <div class="row">
            <div><span class="score">${s.rating.toFixed(1)}</span><span class="rev">${s.reviews} avis</span></div>
            <div class="price">${fcfa(s.price)}<small>par nuit</small></div>
          </div>
        </div>
      </a>`;
    }).join('');
  }
  drawMarkers(list);
}

// Géolocalisation : tri par proximité
document.getElementById('locate').addEventListener('click', () => {
  if (!navigator.geolocation) { geoMsg.textContent = 'La localisation n\'est pas disponible sur cet appareil.'; return; }
  geoMsg.textContent = 'Recherche de votre position…';
  navigator.geolocation.getCurrentPosition(pos => {
    near = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    geoMsg.textContent = 'Résultats triés par distance depuis votre position.';
    search();
  }, () => { geoMsg.textContent = 'Position refusée ou indisponible.'; }, { timeout: 10000 });
});

// Puces de zone : filtre par quartier
document.getElementById('zones').addEventListener('click', e => {
  const b = e.target.closest('[data-n]');
  if (!b) return;
  form.elements.neighborhood.value = b.dataset.n;
  near = null; geoMsg.textContent = '';
  search();
  document.querySelector('.bar').scrollIntoView({ behavior: 'smooth' });
});

// Liste / Carte (téléphone)
const showList = document.getElementById('show-list');
const showMap = document.getElementById('show-map');
function setView(v) {
  layout.dataset.view = v;
  showList.classList.toggle('on', v === 'list');
  showMap.classList.toggle('on', v === 'map');
  showList.setAttribute('aria-selected', v === 'list');
  showMap.setAttribute('aria-selected', v === 'map');
  if (v === 'map' && map) setTimeout(() => map.invalidateSize(), 50);
}
showList.addEventListener('click', () => setView('list'));
showMap.addEventListener('click', () => setView('map'));

form.addEventListener('submit', e => { e.preventDefault(); search(); });
sortEl.addEventListener('change', search);
form.elements.neighborhood.addEventListener('change', () => { if (map) map.invalidateSize(); });

setView('list');
loadGeo().then(() => { initMap(); applySite(); return search(); });

// Destinations : un clic lance la recherche
document.getElementById('rail')?.addEventListener('click', e => {
  const t = e.target.closest('[data-q]');
  if (!t) return;
  form.reset();
  form.elements.q.value = t.dataset.q;
  near = null; geoMsg.textContent = '';
  search();
  document.querySelector('.bar').scrollIntoView({ behavior: 'smooth' });
});

// Chiffres clés (calculés à partir des vraies données)
(async () => {
  try {
    const [stays, rent, g] = await Promise.all([api('/api/stays'), api('/api/listings'), api('/api/neighborhoods')]);
    const set = (id, n) => { const el = document.getElementById(id); if (el) el.dataset.target = n; };
    set('st-stays', stays.length);
    set('st-rent', rent.length);
    if (!rent.length) { const el = document.getElementById('st-rent'); el.dataset.target = ''; el.dataset.counted = '1'; el.textContent = 'Nouveau'; el.nextElementSibling.textContent = 'Publiez la première annonce de location'; }
    set('st-nb', g.zones.reduce((n, z) => n + z.neighborhoods.length, 0));
    set('st-cities', new Set(stays.map(x => x.city)).size);
    if (window.fxCount) fxCount();
  } catch { /* chiffres facultatifs */ }
})();
