// Illustrations originales du Gabon (SVG) : scène animée du bandeau, vignettes de destinations, visuels de cartes.
(function () {
  const rnd = seed => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  let uid = 0;

  // Ligne de canopée irrégulière
  function canopy(y, amp, seed, w, step) {
    const r = rnd(seed);
    let d = `M0 ${y + amp}`, x = 0;
    while (x < w) {
      const dx = step * (0.7 + r() * 0.7), h = amp * (0.4 + r() * 0.9);
      d += ` q ${dx * 0.25} ${-h} ${dx * 0.5} ${-h * 0.6} t ${dx * 0.5} ${h * 0.6}`;
      x += dx;
    }
    return `${d} L${w + 120} 900 L0 900 Z`;
  }

  // Vagues continues (sinusoïde répétée)
  function wave(y, amp, period, w) {
    let d = `M0 ${y} q ${period / 4} ${-amp} ${period / 2} 0`;
    for (let x = period / 2; x < w; x += period / 2) d += ` t ${period / 2} 0`;
    return `${d} L${w} 900 L0 900 Z`;
  }

  function palm(x, y, s, lean, color) {
    const fr = [-165, -135, -105, -75, -45, -15, 15]
      .map(a => `<path transform="translate(${lean} -112) rotate(${a})" d="M0 0 C25 -22 70 -26 105 -4 C70 -14 28 -8 0 0Z"/>`).join('');
    return `<g transform="translate(${x} ${y}) scale(${s})" fill="${color}" stroke="${color}">
      <path d="M0 0 C${lean * 0.2} -40 ${lean * 0.9} -80 ${lean} -112" fill="none" stroke-width="7" stroke-linecap="round"/>${fr}</g>`;
  }

  function elephant(color) {
    return `<g fill="${color}">
      <path d="M30 70 C30 30 80 15 130 18 C170 20 195 40 195 75 L195 105 L170 105 L168 85 L150 85 L148 105 L122 105 L120 88 L80 88 L78 105 L52 105 L50 85 C38 85 30 80 30 70Z"/>
      <path d="M185 30 C215 22 240 40 242 70 C243 90 238 105 232 128 C230 138 218 138 218 128 C220 110 218 100 214 92 C205 100 190 98 186 85Z"/>
      <ellipse cx="196" cy="62" rx="20" ry="28" opacity=".78"/>
      <path d="M226 92 C238 98 250 96 256 88" stroke="#f3ead2" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M30 60 C18 70 18 90 24 100" stroke="${color}" stroke-width="4" fill="none"/></g>`;
  }

  // ---------- Scène animée du bandeau ----------
  function heroScene(compact) {
    const clouds = `<g fill="#fff" opacity=".2">
      <g class="cloud c1"><ellipse cx="240" cy="110" rx="120" ry="22"/><ellipse cx="310" cy="94" rx="70" ry="24"/></g>
      <g class="cloud c2"><ellipse cx="900" cy="70" rx="130" ry="20"/><ellipse cx="960" cy="56" rx="64" ry="20"/></g>
      <g class="cloud c3"><ellipse cx="1220" cy="150" rx="100" ry="18"/><ellipse cx="1170" cy="138" rx="52" ry="18"/></g></g>`;
    const birds = [[220, 150, 0], [270, 180, 1.2], [180, 190, 2.1]].map(([x, y, dl]) =>
      `<path class="bird" style="animation-delay:${dl}s" transform="translate(${x} ${y})" d="M0 0 q8 -9 16 0 q8 -9 16 0" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>`).join('');
    const sparks = Array.from({ length: 14 }, (_, i) =>
      `<i class="spark" style="left:${(i * 73) % 100}%;animation-delay:${(i * 0.9) % 8}s;animation-duration:${9 + (i % 5)}s"></i>`).join('');
    return `
      <div class="sky bg"></div>
      <div class="sun-wrap bg"><div class="sun"></div></div>
      <svg class="layer bg" style="--d:.10" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice">${clouds}${birds}</svg>
      <svg class="layer bg" style="--d:.18" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice">
        <path d="M0 400 C120 335 240 325 380 368 C520 405 600 330 760 338 C900 348 1000 400 1140 358 C1260 322 1360 350 1440 382 L1440 700 L0 700Z" fill="#14705c" opacity=".55"/></svg>
      <svg class="layer" style="--d:.28" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice">
        <path d="${canopy(370, 26, 7, 1440, 52)}" fill="#0f6149"/>
        <path d="${canopy(410, 22, 19, 1440, 44)}" fill="#0b4d3a"/></svg>
      <svg class="layer" style="--d:.40" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice">
        <path d="M0 496 C400 480 900 490 1440 472 L1440 700 L0 700Z" fill="#efd9a6"/>
        <g class="walker"><g transform="translate(0 ${compact ? 418 : 412}) scale(.8)">${elephant('#17352a')}</g></g>
        ${palm(70, 520, 1.15, 38, '#0a3a2c')}${palm(150, 530, 0.85, -26, '#0d4535')}
        ${palm(1360, 522, 1.2, -42, '#0a3a2c')}${palm(1280, 532, 0.8, 24, '#0d4535')}</svg>
      <svg class="layer sea" style="--d:.55" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice">
        <g class="wv w1"><path d="${wave(538, 9, 240, 2880)}" fill="#2a8fc9" opacity=".92"/></g>
        <g class="wv w2"><path d="${wave(560, 12, 320, 2880)}" fill="#0f6ba8"/></g>
        <g class="wv w3"><path d="${wave(585, 8, 200, 2880)}" fill="#f8f4ea"/></g></svg>
      <div class="sparks">${sparks}</div>`;
  }

  // ---------- Vignettes de destinations ----------
  function grad(id, a, b) {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  }
  function tileArt(kind) {
    const id = 'g' + (++uid);
    const W = 400, H = 260;
    const open = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
    const sea = (y, c1, c2) => `<path d="${wave(y, 6, 80, 480)}" fill="${c1}"/><path d="${wave(y + 20, 7, 110, 480)}" fill="${c2}"/>`;
    const art = {
      loango: `<defs>${grad(id, '#ff9e5e', '#ffe3a3')}</defs><rect width="${W}" height="${H}" fill="url(#${id})"/>
        <circle cx="290" cy="112" r="32" fill="#fff3c4"/>
        <path d="${canopy(140, 14, 3, W, 26)}" fill="#1f5a43"/>
        <path d="M0 190 C120 180 260 188 400 178 L400 260 L0 260Z" fill="#f0d9a3"/>
        <g transform="translate(95 150) scale(.5)">${elephant('#17352a')}</g>
        ${sea(222, '#2a8bc4', '#1470a8')}${palm(352, 205, .6, -22, '#0a3a2c')}`,
      lope: `<defs>${grad(id, '#7fd0e8', '#e8f6dd')}</defs><rect width="${W}" height="${H}" fill="url(#${id})"/>
        <circle cx="86" cy="70" r="26" fill="#fff6c8"/>
        <path d="M0 150 C80 105 150 120 220 140 C290 160 340 120 400 130 L400 260 L0 260Z" fill="#6fae6a"/>
        <path d="${canopy(165, 16, 11, W, 24)}" fill="#2f7d4a"/>
        <path d="${canopy(195, 16, 23, W, 20)}" fill="#1d5e3a"/>
        <g fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".9"><path d="M250 58 q6 -7 12 0 q6 -7 12 0"/><path d="M290 80 q6 -7 12 0 q6 -7 12 0"/></g>`,
      pongara: `<defs>${grad(id, '#081a3a', '#1b4b6e')}</defs><rect width="${W}" height="${H}" fill="url(#${id})"/>
        <circle cx="300" cy="60" r="24" fill="#fdf3c8"/><circle cx="310" cy="54" r="22" fill="#12335a" opacity=".55"/>
        ${Array.from({ length: 22 }, (_, i) => `<circle cx="${(i * 53) % 390 + 6}" cy="${(i * 37) % 120 + 8}" r="${i % 3 ? 1 : 1.6}" fill="#fff" opacity=".8"/>`).join('')}
        ${sea(150, '#16507c', '#0e3a63')}
        <path d="M0 210 C100 200 280 206 400 198 L400 260 L0 260Z" fill="#cdb98a"/>
        <g transform="translate(150 214)" fill="#233a2f"><ellipse cx="50" cy="0" rx="46" ry="22"/><ellipse cx="108" cy="-4" rx="14" ry="9"/>
        <ellipse cx="20" cy="14" rx="20" ry="7" transform="rotate(-25 20 14)"/><ellipse cx="82" cy="14" rx="20" ry="7" transform="rotate(25 82 14)"/>
        <ellipse cx="14" cy="-14" rx="16" ry="6" transform="rotate(30 14 -14)"/><ellipse cx="86" cy="-14" rx="16" ry="6" transform="rotate(-30 86 -14)"/></g>`,
      mayumba: `<defs>${grad(id, '#9fd9ee', '#d8f0f6')}${grad(id + 's', '#2b95c9', '#0b5a93')}</defs>
        <rect width="${W}" height="${H}" fill="url(#${id})"/><circle cx="90" cy="64" r="24" fill="#fff6c8"/>
        <rect y="120" width="${W}" height="140" fill="url(#${id}s)"/>
        <g transform="translate(205 70)" fill="#17415f"><path d="M0 70 C6 40 8 22 -2 8 C14 16 24 14 30 0 C32 18 40 38 36 70Z"/>
        <path d="M-20 18 C-6 24 -2 14 -2 8 C0 30 8 30 8 20" opacity=".0"/></g>
        <g fill="none" stroke="#fff" stroke-width="3" opacity=".85" stroke-linecap="round"><path d="M175 140 q15 -8 30 0 t30 0 t30 0"/><path d="M150 168 q20 -9 40 0 t40 0 t40 0 t40 0"/></g>
        <g fill="#fff" opacity=".8"><circle cx="190" cy="136" r="4"/><circle cx="244" cy="132" r="3"/><circle cx="214" cy="126" r="2.5"/></g>`,
      libreville: `<defs>${grad(id, '#243b6b', '#f19a62')}</defs><rect width="${W}" height="${H}" fill="url(#${id})"/>
        <circle cx="300" cy="140" r="28" fill="#ffd98a"/>
        <g fill="#14233f">${[[40, 120, 34], [80, 90, 30], [116, 130, 36], [160, 100, 28], [196, 70, 34], [236, 112, 30], [272, 140, 36], [310, 96, 30], [346, 126, 34]]
          .map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${200 - y}"/>`).join('')}</g>
        <g fill="#ffd98a" opacity=".8">${Array.from({ length: 26 }, (_, i) => `<rect x="${44 + (i * 37) % 320}" y="${100 + (i * 23) % 90}" width="4" height="5"/>`).join('')}</g>
        ${sea(200, '#1a5f93', '#0f4673')}`,
      lambarene: `<defs>${grad(id, '#c8e8c4', '#f6efc9')}${grad(id + 'r', '#5aa7a0', '#2c7771')}</defs>
        <rect width="${W}" height="${H}" fill="url(#${id})"/><circle cx="320" cy="64" r="24" fill="#fff6c8"/>
        <path d="${canopy(112, 20, 5, W, 28)}" fill="#2b7a4b"/><path d="${canopy(134, 16, 17, W, 22)}" fill="#1a5a37"/>
        <path d="M0 170 C100 150 220 190 400 160 L400 260 L0 260Z" fill="url(#${id}r)"/>
        <path d="M120 206 C150 226 250 226 290 200 L270 200 C250 214 160 214 140 200Z" fill="#5b3a22"/>
        <path d="M205 200 L205 170" stroke="#5b3a22" stroke-width="3"/><circle cx="205" cy="164" r="6" fill="#5b3a22"/>
        <g fill="none" stroke="#fff" stroke-width="2" opacity=".5"><path d="M20 220 q20 -6 40 0 t40 0"/><path d="M280 240 q20 -6 40 0 t40 0"/></g>`
    };
    return open + (art[kind] || art.loango) + '</svg>';
  }

  // ---------- Visuels des cartes (formes seules, le dégradé vient du CSS) ----------
  function artFor(type) {
    const o = '<svg class="art" viewBox="0 0 300 140" preserveAspectRatio="xMidYMax slice" aria-hidden="true">';
    if (type === 'hotel') {
      return o + `<circle cx="236" cy="40" r="18" fill="#fff3c4" opacity=".9"/>
        <g fill="#0d2c55" opacity=".92">${[[26, 62, 36], [66, 40, 40], [110, 74, 30], [144, 28, 44], [192, 66, 34], [230, 50, 38]].map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${140 - y}"/>`).join('')}</g>
        <g fill="#ffd98a" opacity=".85">${Array.from({ length: 16 }, (_, i) => `<rect x="${32 + (i * 29) % 220}" y="${60 + (i * 17) % 60}" width="4" height="5"/>`).join('')}</g></svg>`;
    }
    if (type === 'lodge') {
      return o + `<circle cx="60" cy="38" r="18" fill="#fff0b8" opacity=".9"/>
        <path d="${canopy(84, 12, 4, 300, 22)}" fill="#245c3d" opacity=".9"/>
        <path d="M110 140 L160 66 L210 140Z" fill="#f4e3b8"/><path d="M160 66 L160 140 L135 140Z" fill="#d9c28c"/>
        <path d="M150 140 L160 108 L170 140Z" fill="#6b4a2b"/>${palm(250, 140, .5, -14, '#0f3d2b')}</svg>`;
    }
    return o + `<circle cx="244" cy="36" r="17" fill="#fff3c4" opacity=".9"/>
      <g><rect x="40" y="76" width="70" height="64" fill="#f6efe0"/><path d="M32 78 L75 46 L118 78Z" fill="#b8552b"/><rect x="62" y="102" width="16" height="38" fill="#7a4a2a"/>
      <rect x="130" y="90" width="66" height="50" fill="#fbf4e4"/><path d="M122 92 L163 64 L204 92Z" fill="#8c3f20"/><rect x="152" y="112" width="14" height="28" fill="#7a4a2a"/></g>
      ${palm(246, 140, .55, 14, '#0e4a35')}</svg>`;
  }

  // ---------- Destinations (rail « Découvrez le Gabon ») ----------
  const DESTINATIONS = [
    { kind: 'libreville', title: 'Libreville', text: 'Capitale entre mer et forêt : front de mer, restaurants, affaires.', q: 'Libreville' },
    { kind: 'loango', title: 'Parc de Loango', text: 'Lagune, savane et plage : éléphants, buffles et oiseaux.', q: 'Loango' },
    { kind: 'lope', title: 'Parc de la Lopé', text: 'Forêt tropicale, randonnées guidées et primates.', q: 'Lopé' },
    { kind: 'pongara', title: 'Pongara', text: 'Plage et tortues luth, de novembre à février.', q: 'Pongara' },
    { kind: 'mayumba', title: 'Mayumba', text: 'Océan, baleines et tortues, tout au sud.', q: 'Mayumba' },
    { kind: 'lambarene', title: 'Lambaréné', text: 'Au bord du fleuve Ogooué, au cœur du pays.', q: 'Lambaréné' }
  ];
  function renderDiscover() {
    const rail = document.getElementById('rail');
    if (!rail) return;
    rail.innerHTML = DESTINATIONS.map(d => `
      <button type="button" class="tile" data-q="${d.q}">
        <span class="tile-art">${tileArt(d.kind)}</span>
        <span class="tile-body"><strong>${d.title}</strong><span>${d.text}</span><em>Voir les hébergements →</em></span>
      </button>`).join('');
  }

  function init() {
    document.querySelectorAll('.scene[data-variant]').forEach(el => {
      el.innerHTML = heroScene(el.dataset.variant === 'compact');
    });
    renderDiscover();
  }
  window.GabonArt = { heroScene, tileArt, artFor, renderDiscover };
  init();
})();
