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
  const hero = $('.hero[data-section="hero"]');
  if (hero && site.settings.hero_photo_id) {
    hero.style.backgroundImage = `linear-gradient(rgba(5,50,28,.72),rgba(5,50,28,.72)), url(/api/photos/${encodeURIComponent(site.settings.hero_photo_id)})`;
    hero.style.backgroundSize = 'cover';
    hero.classList.add('has-photo');
    hero.style.backgroundPosition = 'center';
  }
  return site;
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
