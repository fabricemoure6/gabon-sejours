// Animations : apparition au défilement, compteurs, parallaxe, inclinaison des cartes, en-tête dynamique.
(function () {
  document.documentElement.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover)').matches;

  // Marque (logo original : soleil sur les vagues)
  const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="13" r="8" fill="#f7b500"/>
    <path d="M2 21 q4 -4 7 0 t7 0 t7 0 t7 0 V32 H2Z" fill="#12559c"/><path d="M2 26 q4 -4 7 0 t7 0 t7 0 t7 0 V32 H2Z" fill="#0a6a45"/></svg>`;
  document.querySelectorAll('.brand').forEach(b => { if (!b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', MARK); });

  // En-tête qui se compacte
  const top = document.querySelector('.top');
  const onScroll = () => top && top.classList.toggle('scrolled', window.scrollY > 12);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Apparition au défilement (avec cascade)
  const SEL = '.card,.zone,.plan,.my-item,.promo,.sec-head,.tile,.stat,.card-box,.pay-box,.tile-art-wrap';
  const io = 'IntersectionObserver' in window && !reduce
    ? new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }), { threshold: 0.1, rootMargin: '0px 0px -30px 0px' })
    : null;
  function watch(el) {
    if (el.dataset.fx) return;
    el.dataset.fx = '1';
    el.classList.add('reveal');
    const i = Array.prototype.indexOf.call(el.parentNode ? el.parentNode.children : [], el);
    el.style.setProperty('--i', Math.max(0, Math.min(i, 9)));
    if (io) io.observe(el); else el.classList.add('in');
  }
  function scan(root) {
    if (root.matches && root.matches(SEL)) watch(root);
    if (root.querySelectorAll) root.querySelectorAll(SEL).forEach(watch);
  }
  scan(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) scan(n); })))
    .observe(document.body, { childList: true, subtree: true });

  // Compteurs animés
  const nf = new Intl.NumberFormat('fr-FR');
  function animate(el) {
    const target = Number(el.dataset.target) || 0;
    if (reduce || target === 0) { el.textContent = nf.format(target); return; }
    const t0 = performance.now(), dur = 1400;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = nf.format(Math.round(target * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  window.fxCount = function () {
    document.querySelectorAll('[data-target]').forEach(el => {
      if (el.dataset.counted) return;
      el.dataset.counted = '1';
      if (!('IntersectionObserver' in window)) { animate(el); return; }
      const o = new IntersectionObserver(es => { if (es[0].isIntersecting) { animate(el); o.disconnect(); } }, { threshold: 0.4 });
      o.observe(el);
    });
  };

  // Inclinaison 3D légère des cartes (souris uniquement)
  if (canHover && !reduce) {
    document.addEventListener('pointermove', e => {
      const c = e.target.closest && e.target.closest('.card.tiltable, a.card');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--ry', ((e.clientX - r.left) / r.width - 0.5) * 7 + 'deg');
      c.style.setProperty('--rx', (-((e.clientY - r.top) / r.height - 0.5)) * 7 + 'deg');
      c.classList.add('tilt');
    });
    document.addEventListener('pointerout', e => {
      const c = e.target.closest && e.target.closest('.card.tiltable, a.card');
      if (c && !c.contains(e.relatedTarget)) { c.classList.remove('tilt'); c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); }
    });
  }
})();


// Barre de progression de lecture (jaune)
(function () {
  const bar = document.createElement('div'); bar.id = 'progress'; document.body.appendChild(bar);
  const upd = () => { const h = document.documentElement; const max = h.scrollHeight - h.clientHeight; bar.style.width = (max > 0 ? Math.min(100, h.scrollTop / max * 100) : 0) + '%'; };
  addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
})();
