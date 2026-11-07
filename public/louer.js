const form = $('#filters');
const sortEl = $('#sort');
const results = $('#results');
const geoMsg = $('#geo-msg');
let near = null;

function priceLabel(l) { return fcfa(l.price) + ' / ' + l.period; }

function card(l) {
  const photo = l.photos[0]
    ? `<img src="/api/photos/${esc(l.photos[0])}" alt="" loading="lazy">`
    : `<div class="noimg">Pas de photo</div>`;
  const dist = l.kmFromYou != null ? `${l.kmFromYou.toLocaleString('fr-FR')} km de vous`
    : l.kmFromCenter != null ? `${l.kmFromCenter.toLocaleString('fr-FR')} km du centre-ville` : '';
  const rooms = [l.bedrooms ? `${l.bedrooms} chambre${l.bedrooms > 1 ? 's' : ''}` : '', l.bathrooms ? `${l.bathrooms} sdb` : ''].filter(Boolean).join(' · ');
  return `<a class="card" href="/annonce.html?id=${encodeURIComponent(l.id)}">
    <div class="thumb">${photo}<span class="tag">${esc(CATEGORY_LABELS[l.category] || l.category)}</span></div>
    <div class="body">
      <h3>${esc(l.title)}</h3>
      <p class="loc">${esc(l.area || '')}, Libreville</p>
      <p class="zone-tag">${esc(l.zoneName || '')}</p>
      ${rooms ? `<p class="loc">${esc(rooms)}</p>` : ''}
      ${dist ? `<p class="dist">${esc(dist)}</p>` : ''}
      <div class="price big">${esc(priceLabel(l))}</div>
    </div></a>`;
}

async function search() {
  const p = new URLSearchParams();
  new FormData(form).forEach((v, k) => v && p.set(k, v));
  if (sortEl.value) p.set('sort', sortEl.value);
  if (near) p.set('near', near.lat + ',' + near.lng);
  if (!results.children.length) results.innerHTML = skeletons(6);
  const list = await api('/api/listings?' + p);
  $('#count').textContent = list.length + ' annonce(s)';
  results.innerHTML = list.length ? list.map(card).join('')
    : '<div class="empty">Aucune annonce pour ces critères. <a href="/compte.html">Publiez la vôtre</a>.</div>';
}

async function init() {
  const [opts, geo] = await Promise.all([api('/api/options'), fillNeighborhoods($('#neighborhood'), 'Tous les quartiers')]);
  opts.categories.forEach(c => $('#category').add(new Option(CATEGORY_LABELS[c] || c, c)));
  $('#zones').innerHTML = '<h2>Explorer par zone</h2>' + geo.zones.map(z => `
    <div class="zone"><h3>${esc(z.name)}</h3><p>${esc(z.description)}</p>
    <div class="chips">${z.neighborhoods.map(n => `<button type="button" class="chip" data-n="${esc(n.id)}">${esc(n.name)}</button>`).join('')}</div></div>`).join('');
  $('#zones').addEventListener('click', e => {
    const b = e.target.closest('[data-n]');
    if (!b) return;
    form.elements.neighborhood.value = b.dataset.n;
    near = null; geoMsg.textContent = '';
    search();
    $('.bar').scrollIntoView({ behavior: 'smooth' });
  });
  await search();
}

$('#locate').addEventListener('click', () => {
  if (!navigator.geolocation) { geoMsg.textContent = 'La localisation n\'est pas disponible sur cet appareil.'; return; }
  geoMsg.textContent = 'Recherche de votre position…';
  navigator.geolocation.getCurrentPosition(pos => {
    near = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    geoMsg.textContent = 'Résultats triés par distance depuis votre position.';
    search();
  }, () => { geoMsg.textContent = 'Position refusée ou indisponible.'; }, { timeout: 10000 });
});
form.addEventListener('submit', e => { e.preventDefault(); search(); });
sortEl.addEventListener('change', search);

initNav('/louer.html');
applySite();
init();
