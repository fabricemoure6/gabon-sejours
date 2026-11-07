// Rail « Découvrez le Gabon » : les photos viennent de l'admin (aucun dessin)
(function () {
  const DESTINATIONS = [
    { kind: 'libreville', title: 'Libreville', text: 'Capitale entre mer et forêt : front de mer, restaurants, affaires.', q: 'Libreville' },
    { kind: 'loango', title: 'Parc de Loango', text: 'Lagune, savane et plage : éléphants, buffles et oiseaux.', q: 'Loango' },
    { kind: 'lope', title: 'Parc de la Lopé', text: 'Forêt tropicale, randonnées guidées et primates.', q: 'Lopé' },
    { kind: 'pongara', title: 'Pongara', text: 'Plage et tortues luth, de novembre à février.', q: 'Pongara' },
    { kind: 'mayumba', title: 'Mayumba', text: 'Océan, baleines et tortues, tout au sud.', q: 'Mayumba' },
    { kind: 'lambarene', title: 'Lambaréné', text: 'Au bord du fleuve Ogooué, au cœur du pays.', q: 'Lambaréné' }
  ];
  window.DESTINATIONS = DESTINATIONS;
  window.renderDiscover = function (photos) {
    const rail = document.getElementById('rail');
    if (!rail) return;
    photos = photos || {};
    rail.innerHTML = DESTINATIONS.map(d => `
      <button type="button" class="tile" data-q="${d.q}">
        <span class="tile-art">${photos[d.kind] ? `<i style="background-image:url(/api/photos/${photos[d.kind]})" role="img" aria-label="${d.title}"></i>` : ''}</span>
        <span class="tile-body"><strong>${d.title}</strong><span>${d.text}</span><em>Voir les hébergements →</em></span>
      </button>`).join('');
  };
  renderDiscover({});
})();
