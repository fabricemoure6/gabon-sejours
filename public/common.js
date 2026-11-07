// Fonctions communes à toutes les pages
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fcfa = n => Number(n).toLocaleString('fr-FR') + ' FCFA';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

async function api(path, opts = {}) {
  const o = { credentials: 'same-origin', ...opts, headers: { 'x-csrf': '1', ...(opts.headers || {}) } };
  if (opts.json !== undefined) {
    o.method = o.method || 'POST';
    o.headers['content-type'] = 'application/json';
    o.body = JSON.stringify(opts.json);
    delete o.json;
  }
  const r = await fetch(path, o);
  let data = null;
  try { data = await r.json(); } catch { /* corps vide */ }
  if (!r.ok) throw Object.assign(new Error((data && data.error) || 'Erreur'), { status: r.status, data });
  return data;
}

const CATEGORY_LABELS = { maison: 'Maison', villa: 'Villa', appartement: 'Appartement', studio: 'Studio', chambre: 'Chambre' };

// Remplit les textes éditables et réordonne les sections de la page d'accueil
async function applySite() {
  let site;
  try { site = await api('/api/site'); } catch { return null; }
  $$('[data-text]').forEach(el => { const v = site.texts[el.dataset.text]; if (v) el.textContent = v; });
  const page = $('#page');
  if (page) {
    site.sections.forEach(s => {
      const el = page.querySelector(`[data-section="${s.id}"]`);
      if (el) { page.appendChild(el); el.hidden = !s.visible; }
    });
  }
  buildHeroMedia(site.settings.hero_photos || []);
  if (window.renderDiscover) renderDiscover(site.settings.dest_photos || {});
  return site;
}

// Bandeau : diaporama de vraies photos (fondu + zoom lent) ou fond uni si aucune photo
let slideTimer = null;
function buildHeroMedia(ids) {
  const box = $('.hero-media');
  if (!box) return;
  clearInterval(slideTimer);
  box.classList.toggle('has-slides', ids.length > 0);
  box.innerHTML = ids.map((id, i) =>
    `<div class="slide${i === 0 ? ' on' : ''}" style="background-image:url(/api/photos/${encodeURIComponent(id)})"></div>`).join('') +
    (ids.length ? '<div class="shade"></div>' : '');
  const slides = $$('.slide', box);
  if (slides.length > 1) {
    let cur = 0;
    slideTimer = setInterval(() => {
      slides[cur].classList.remove('on');
      cur = (cur + 1) % slides.length;
      slides[cur].classList.add('on');
    }, 7000);
  }
}

// Menu de navigation selon l'état de connexion
async function initNav(active) {
  const nav = $('#nav');
  if (!nav) return null;
  let me = null;
  try { me = await api('/api/auth/me'); } catch { /* non connecté */ }
  const links = [['/', 'Hébergements'], ['/louer.html', 'Maisons à louer']];
  links.push(me ? ['/compte.html', 'Mon compte'] : ['/compte.html', 'Connexion']);
  if (me && me.role === 'admin') links.push(['/admin.html', 'Admin']);
  nav.innerHTML = links.map(([h, t]) =>
    `<a href="${h}"${h === active ? ' aria-current="page"' : ''}>${esc(t)}</a>`).join('');
  return me;
}

// Photo redimensionnée côté navigateur (JPEG, 1280 px max) avant envoi
function compressImage(file, maxSide = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Compression impossible')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

async function uploadPhotoFile(file) {
  let blob = await compressImage(file);
  if (blob.size > 900 * 1024) blob = await compressImage(file, 1000, 0.7);
  const r = await api('/api/photos', { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg' } });
  return r.id;
}

// Cartes « squelette » pendant le chargement
function skeletons(n = 6) {
  return Array.from({ length: n }, () =>
    '<div class="card skel" aria-hidden="true"><div class="sk img"></div><div class="sk l"></div><div class="sk l s"></div><div class="sk l s"></div></div>').join('');
}

function flash(el, msg, kind = 'ok') {
  el.innerHTML = msg ? `<div class="msg ${kind}" role="status">${esc(msg)}</div>` : '';
}

// Remplit un <select> avec les quartiers regroupés par zone
async function fillNeighborhoods(select, placeholder) {
  const geo = await api('/api/neighborhoods');
  select.innerHTML = `<option value="">${esc(placeholder)}</option>`;
  geo.zones.forEach(z => {
    const g = document.createElement('optgroup');
    g.label = z.name;
    z.neighborhoods.forEach(n => g.appendChild(new Option(n.name, n.id)));
    select.appendChild(g);
  });
  return geo;
}


// ---------- J'aime et commentaires ----------
function timeAgo(iso) {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 2592000) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

async function renderSocial(box, type, id) {
  const base = `/api/social/${type}/${encodeURIComponent(id)}`;
  let d;
  try { d = await api(base); } catch { box.innerHTML = ''; return; }
  const next = encodeURIComponent(location.pathname + location.search);
  box.innerHTML = `
    <div class="social-head">
      <button type="button" class="like-btn${d.liked ? ' on' : ''}" id="like-btn" aria-pressed="${d.liked}">
        <span class="heart" aria-hidden="true">${d.liked ? '♥' : '♡'}</span> <span id="like-n">${d.likes}</span> J'aime
      </button>
      <h3>Commentaires (${d.comments.length})</h3>
    </div>
    <div id="social-msg"></div>
    ${d.loggedIn ? `<form id="cform" class="cform">
        <textarea name="body" rows="3" maxlength="500" placeholder="Votre commentaire (500 caractères maximum)…" required></textarea>
        <button type="submit">Publier</button>
      </form>`
      : `<p class="loc login-note">Pour aimer ou commenter, <a href="/compte.html">connectez-vous ou créez un compte gratuit</a>.</p>`}
    <ul class="comments">
      ${d.comments.map(c => `<li data-id="${esc(c.id)}">
        <div class="avatar" aria-hidden="true">${esc((c.name || '?').trim().charAt(0).toUpperCase())}</div>
        <div class="cbody"><strong>${esc(c.name)}</strong> <small>${esc(timeAgo(c.createdAt))}</small>
          <p>${esc(c.body)}</p>
          ${c.canDelete ? `<button type="button" class="linklike" data-del="${esc(c.id)}">Supprimer</button>` : ''}</div></li>`).join('')
        || '<li class="none">Aucun commentaire pour le moment. Soyez le premier !</li>'}
    </ul>`;
  const msg = $('#social-msg', box);
  $('#like-btn', box).addEventListener('click', async () => {
    if (!d.loggedIn) { flash(msg, "Connectez-vous pour aimer cette publication.", 'err'); return; }
    try { await api(base + '/like', { method: 'POST' }); renderSocial(box, type, id); }
    catch (e) { flash(msg, e.message, 'err'); }
  });
  const f = $('#cform', box);
  if (f) f.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api(base + '/comments', { json: { body: f.body.value } }); renderSocial(box, type, id); }
    catch (err) { flash(msg, err.message, 'err'); }
  });
  $$('[data-del]', box).forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer ce commentaire ?')) return;
    try { await api('/api/comments/' + b.dataset.del, { method: 'DELETE' }); renderSocial(box, type, id); }
    catch (err) { flash(msg, err.message, 'err'); }
  }));
}
