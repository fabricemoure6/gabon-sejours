const root = $('#detail');
const id = new URLSearchParams(location.search).get('id');

async function init() {
  let l;
  try { l = await api('/api/listings/' + encodeURIComponent(id || '')); }
  catch { root.innerHTML = '<p>Annonce introuvable. <a href="/louer.html">Retour aux annonces</a></p>'; return; }
  document.title = l.title + ' – Gabon Séjours';
  const hasGeo = typeof l.lat === 'number';
  const wa = l.whatsapp
    ? `https://wa.me/${encodeURIComponent(l.whatsapp)}?text=${encodeURIComponent(`Bonjour, je suis intéressé(e) par votre annonce « ${l.title} » (${l.area}, Libreville) sur Gabon Séjours.`)}` : '';
  const tel = l.phone ? `tel:${l.phone.replace(/[^\d+]/g, '')}` : '';
  const rooms = [l.bedrooms ? `${l.bedrooms} chambre(s)` : '', l.bathrooms ? `${l.bathrooms} salle(s) de bain` : ''].filter(Boolean).join(' · ');

  root.innerHTML = `
    <section>
      <a href="/louer.html" class="back">← Retour aux annonces</a>
      <div class="gallery">
        ${l.photos.length
          ? `<img id="main-photo" class="main-photo" src="/api/photos/${esc(l.photos[0])}" alt="Photo principale de l'annonce">
             ${l.photos.length > 1 ? `<div class="thumbs">${l.photos.map((p, i) => `<button type="button" class="thumb-btn" data-p="${esc(p)}" aria-label="Photo ${i + 1}"><img src="/api/photos/${esc(p)}" alt=""></button>`).join('')}</div>` : ''}`
          : `<div class="noimg tall">Pas de photo</div>`}
      </div>
      <h1>${esc(l.title)}</h1>
      <p class="loc">${esc(CATEGORY_LABELS[l.category] || l.category)} · ${esc(l.area)}, Libreville</p>
      <p class="zone-tag">${esc(l.zoneName)}${l.arrondissement && /^\d/.test(l.arrondissement) ? ' · ' + esc(l.arrondissement) + ' arrondissement' : ''}</p>
      ${rooms ? `<p>${esc(rooms)}</p>` : ''}
      <p class="desc">${esc(l.description || '')}</p>
      ${l.amenities.length ? `<h3>Équipements</h3><ul class="chips-static">${l.amenities.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      ${hasGeo ? `<div class="geo-box"><h3>Localisation</h3>
        <p class="loc">Position approximative du quartier, à environ ${l.kmFromCenter.toLocaleString('fr-FR')} km du centre-ville. L'adresse exacte est communiquée par le propriétaire.</p>
        <div id="mini" class="mini-map" aria-label="Carte"></div></div>` : ''}
    </section>
    <aside class="box">
      <div class="price big">${fcfa(l.price)} <small>par ${esc(l.period)}</small></div>
      <p class="loc">Annonce publiée par ${esc(l.ownerName || 'un propriétaire')}</p>
      <div class="contact">
        ${wa ? `<a class="btn wa" href="${wa}" target="_blank" rel="noopener">Contacter sur WhatsApp</a>` : ''}
        ${tel ? `<a class="btn alt" href="${esc(tel)}">Appeler ${esc(l.phone)}</a>` : ''}
      </div>
      <p class="loc">Gabon Séjours met en relation locataires et propriétaires. Ne payez jamais avant d'avoir visité le bien et rencontré le propriétaire.</p>
    </aside>`;

  $$('.thumb-btn').forEach(b => b.addEventListener('click', () => { $('#main-photo').src = '/api/photos/' + b.dataset.p; }));

  if (hasGeo && typeof L !== 'undefined') {
    const m = L.map('mini', { scrollWheelZoom: false, dragging: !L.Browser.mobile }).setView([l.lat, l.lng], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; contributeurs OpenStreetMap' }).addTo(m);
    L.circle([l.lat, l.lng], { radius: 500, color: '#0b6b3a' }).addTo(m);
  }
}
initNav('/louer.html');
init();
