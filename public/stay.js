const TYPES = { hotel: 'Hôtel', apartment: 'Appartement', lodge: 'Lodge' };
const root = document.getElementById('detail');
const id = new URLSearchParams(location.search).get('id');

async function init() {
  const res = await fetch('/api/stays/' + encodeURIComponent(id || ''));
  if (!res.ok) { root.innerHTML = '<p>Hébergement introuvable. <a href="/">Retour</a></p>'; return; }
  const s = await res.json();
  document.title = s.name + ' – Gabon Séjours';
  const today = new Date().toISOString().slice(0, 10);
  const hasGeo = typeof s.lat === 'number';
  const where = [s.area, s.city].filter(Boolean).join(', ');
  const gmaps = hasGeo ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}` : '';
  const route = hasGeo ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}` : '';

  root.innerHTML = `
    <section>
      <div class="pic ${esc(s.type)}"><span class="tag">${TYPES[s.type] || ''} · ${'★'.repeat(s.stars)}</span></div>
      <h1>${esc(s.name)}</h1>
      <p class="loc">${esc(where)}</p>
      ${s.zoneName ? `<p class="zone-tag">${esc(s.zoneName)}${s.arrondissement && /^\d/.test(s.arrondissement) ? ' · ' + esc(s.arrondissement) + ' arrondissement' : ''}</p>` : ''}
      <p><span class="score">${s.rating.toFixed(1)}</span><span class="rev">${s.reviews} avis</span></p>
      <p>${esc(s.description)}</p>
      <h3>Équipements</h3>
      <ul class="chips-static">${s.amenities.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
      <p class="loc">Capacité : ${s.guests} personne(s)</p>
      ${hasGeo ? `
      <div class="geo-box">
        <h3>Localisation</h3>
        ${s.zone ? `<p class="loc">À environ ${s.kmFromCenter.toLocaleString('fr-FR')} km du centre-ville (à vol d'oiseau). Position approximative du quartier.</p>` : ''}
        <div id="mini" class="mini-map" aria-label="Carte"></div>
        <div class="geo-links">
          <a href="${gmaps}" target="_blank" rel="noopener">Ouvrir dans Maps</a>
          <a href="${route}" target="_blank" rel="noopener">Itinéraire</a>
        </div>
      </div>` : ''}
    </section>
    <aside class="box" id="book-box">
      <div class="price">${fcfa(s.price)} <small>par nuit</small></div>
      <form id="book">
        <label>Arrivée<input type="date" name="checkIn" min="${today}" required></label>
        <label>Départ<input type="date" name="checkOut" min="${today}" required></label>
        <label>Voyageurs<input type="number" name="guests" min="1" max="${s.guests}" value="${Math.min(2, s.guests)}"></label>
        <label>Nom complet<input name="name" autocomplete="name" required></label>
        <label>Téléphone<input name="phone" type="tel" autocomplete="tel" placeholder="+241 …" required></label>
        <label>Message (facultatif)<textarea name="message" rows="2"></textarea></label>
        <div class="total" id="total"></div>
        <button type="submit">Demander la réservation</button>
        <div id="feedback" role="status"></div>
      </form>
      <p class="loc">Aucun paiement en ligne. La demande est envoyée à l'hébergeur via WhatsApp.</p>
    </aside>
    <div class="sticky-cta">
      <strong>${fcfa(s.price)}<small>par nuit</small></strong>
      <button type="button" id="cta">Réserver</button>
    </div>`;

  document.getElementById('cta').addEventListener('click', () =>
    document.getElementById('book-box').scrollIntoView({ behavior: 'smooth' }));

  if (hasGeo && typeof L !== 'undefined') {
    const m = L.map('mini', { scrollWheelZoom: false, dragging: !L.Browser.mobile }).setView([s.lat, s.lng], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; contributeurs OpenStreetMap'
    }).addTo(m);
    L.marker([s.lat, s.lng]).addTo(m).bindPopup(esc(s.name));
  }

  const f = document.getElementById('book');
  const total = document.getElementById('total');
  const update = () => {
    const n = Math.round((new Date(f.checkOut.value) - new Date(f.checkIn.value)) / 86400000);
    total.textContent = n > 0 ? `${n} nuit(s) : ${fcfa(n * s.price)}` : '';
  };
  f.checkIn.addEventListener('change', () => { f.checkOut.min = f.checkIn.value; update(); });
  f.checkOut.addEventListener('change', update);

  f.addEventListener('submit', async e => {
    e.preventDefault();
    const fb = document.getElementById('feedback');
    const body = Object.fromEntries(new FormData(f));
    body.stayId = s.id;
    let data;
    try { data = await api('/api/requests', { json: body }); }
    catch (err) { fb.innerHTML = `<div class="msg err">${esc(err.message)}</div>`; return; }
    fb.innerHTML = `<div class="msg ok">Demande enregistrée. <a href="${esc(data.whatsappUrl)}" target="_blank" rel="noopener"><b>Envoyer sur WhatsApp</b></a></div>`;
    window.open(data.whatsappUrl, '_blank', 'noopener');
  });
}
init();
