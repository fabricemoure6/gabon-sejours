// API Gabon Séjours pour Cloudflare Workers + D1.
// Les pages statiques (dossier public/) sont servies par Cloudflare ; ce code gère /api/*.
import staysData from '../data/stays.json';
import geo from '../data/neighborhoods.json';
import {
  json, bad, uid, rand, sha256, safeEqual, hashPassword, createSession, clearCookie, currentUser, destroySession,
  ensureSchema, loadSite, saveSite, DEFAULT_SITE, toBase64, fromBase64, sniffImage
} from './lib.js';

const CATEGORIES = ['maison', 'villa', 'appartement', 'studio', 'chambre'];
const AMENITIES = ['Eau courante', 'Électricité', 'Groupe électrogène', 'Climatisation', 'Wi-Fi', 'Cuisine équipée',
  'Meublé', 'Parking', 'Sécurité / gardien', 'Clôture', 'Terrasse / balcon', 'Citerne / forage'];
const MAX_PHOTO_BYTES = 900 * 1024;
const MAX_PHOTOS_PER_LISTING = 8;
const MAX_PHOTOS_PER_USER = 60;
const HEX16 = /^[a-f0-9]{16}$/;

const byId = Object.fromEntries(geo.neighborhoods.map(n => [n.id, n]));
const zonesById = Object.fromEntries(geo.zones.map(z => [z.id, z]));

// ---------- Géographie ----------
function km(a, b) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function geoFields(neighborhoodId) {
  const n = byId[neighborhoodId];
  if (!n) return {};
  return {
    area: n.name, lat: n.lat, lng: n.lng, zone: n.zone, zoneName: zonesById[n.zone].name,
    arrondissement: n.arrondissement,
    kmFromCenter: Math.round(km(geo.center, n) * 10) / 10
  };
}

// ---------- Hébergements (hôtels, lodges : données statiques) ----------
function loadStays() {
  return staysData.map(s => {
    const out = { ...s };
    if (s.neighborhood && byId[s.neighborhood]) Object.assign(out, geoFields(s.neighborhood));
    else if (typeof out.lat === 'number') out.kmFromCenter = Math.round(km(geo.center, out) * 10) / 10;
    return out;
  });
}

function searchStays(params) {
  const q = params.get('q'), city = params.get('city'), type = params.get('type');
  const guests = params.get('guests'), maxPrice = params.get('maxPrice');
  const neighborhood = params.get('neighborhood'), zone = params.get('zone');
  const near = params.get('near');
  let sortKey = params.get('sort');
  let list = loadStays();
  if (q) {
    const s = q.toLowerCase();
    list = list.filter(x => [x.name, x.city, x.area, x.zoneName].join(' ').toLowerCase().includes(s));
  }
  if (city) list = list.filter(x => x.city === city);
  if (type) list = list.filter(x => x.type === type);
  if (guests) list = list.filter(x => x.guests >= Number(guests));
  if (maxPrice) list = list.filter(x => x.price <= Number(maxPrice));
  if (neighborhood) list = list.filter(x => x.neighborhood === neighborhood);
  if (zone) list = list.filter(x => x.zone === zone);
  if (near) {
    const [lat, lng] = near.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      list = list.map(x => typeof x.lat === 'number'
        ? { ...x, kmFromYou: Math.round(km({ lat, lng }, x) * 10) / 10 } : x);
      sortKey = 'near';
    }
  }
  if (sortKey === 'price') list.sort((a, b) => a.price - b.price);
  else if (sortKey === 'rating') list.sort((a, b) => b.rating - a.rating);
  else if (sortKey === 'near') list.sort((a, b) => (a.kmFromYou ?? 1e9) - (b.kmFromYou ?? 1e9));
  else if (sortKey === 'center') list.sort((a, b) => (a.kmFromCenter ?? 1e9) - (b.kmFromCenter ?? 1e9));
  return list;
}

async function createBookingRequest(request, env) {
  let body;
  try { body = await request.json(); } catch { return bad('Requête invalide'); }
  const { stayId, name, phone, checkIn, checkOut, guests, message } = body || {};
  const stay = loadStays().find(x => x.id === stayId);
  if (!stay) return bad('Hébergement invalide');
  if (!name || !phone || !checkIn || !checkOut) return bad('Nom, téléphone et dates sont obligatoires');
  const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
  if (isNaN(nights) || nights < 1) return bad('Dates invalides');
  const clean = v => String(v || '').slice(0, 500);
  const rec = {
    id: uid(), createdAt: new Date().toISOString(), stayId, name: clean(name), phone: clean(phone),
    checkIn, checkOut, guests: Number(guests) || 1, message: clean(message), nights, total: nights * stay.price
  };
  await env.DB.prepare(`INSERT INTO requests VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
    .bind(rec.id, rec.createdAt, rec.stayId, rec.name, rec.phone, rec.checkIn, rec.checkOut,
      rec.guests, rec.message, rec.nights, rec.total).run();
  const where = [stay.area, stay.city].filter(Boolean).join(', ');
  const text =
    `Bonjour, je souhaite réserver : ${stay.name} (${where}).\n` +
    `Du ${checkIn} au ${checkOut} (${nights} nuit(s)), ${rec.guests} personne(s).\n` +
    `Total estimé : ${rec.total.toLocaleString('fr-FR')} FCFA.\n` +
    `Nom : ${rec.name} - Tél : ${rec.phone}` + (rec.message ? `\nMessage : ${rec.message}` : '');
  return json({ ok: true, request: rec, whatsappUrl: `https://wa.me/${stay.whatsapp}?text=${encodeURIComponent(text)}` }, 201);
}

// ---------- Annonces de location ----------
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const cleanPhone = v => String(v ?? '').replace(/[^\d+ ]/g, '').trim().slice(0, 20);
const waNumber = v => String(v ?? '').replace(/\D/g, '').slice(0, 15);

function parseListing(b) {
  b = b || {};
  const v = {
    title: cleanText(b.title, 120),
    category: b.category,
    neighborhood: b.neighborhood,
    price: Math.round(Number(b.price)),
    period: b.period === 'nuit' ? 'nuit' : 'mois',
    bedrooms: Math.max(0, Math.min(20, Math.round(Number(b.bedrooms) || 0))),
    bathrooms: Math.max(0, Math.min(20, Math.round(Number(b.bathrooms) || 0))),
    description: cleanText(b.description, 2000),
    amenities: (Array.isArray(b.amenities) ? b.amenities : []).filter(a => AMENITIES.includes(a)),
    phone: cleanPhone(b.phone),
    whatsapp: waNumber(b.whatsapp),
    photoIds: (Array.isArray(b.photoIds) ? b.photoIds : []).filter(id => HEX16.test(id)).slice(0, MAX_PHOTOS_PER_LISTING)
  };
  if (v.title.length < 5) return { error: 'Le titre doit contenir au moins 5 caractères' };
  if (!CATEGORIES.includes(v.category)) return { error: 'Type de bien invalide' };
  if (!byId[v.neighborhood]) return { error: 'Choisissez un quartier' };
  if (!Number.isFinite(v.price) || v.price < 0 || v.price > 100000000) return { error: 'Prix invalide' };
  if (!v.phone && !v.whatsapp) return { error: 'Indiquez un téléphone ou un numéro WhatsApp' };
  return { v };
}

function heroPhotos(st) {
  const l = Array.isArray(st.hero_photos) ? st.hero_photos : [];
  return l.length ? l : (st.hero_photo_id ? [st.hero_photo_id] : []);
}

async function photosByListing(env, ids) {
  const map = {};
  if (!ids.length) return map;
  const q = ids.map((_, i) => '?' + (i + 1)).join(',');
  const { results } = await env.DB.prepare(
    `SELECT id, listing_id FROM photos WHERE listing_id IN (${q}) ORDER BY sort, created_at`).bind(...ids).all();
  results.forEach(r => (map[r.listing_id] ||= []).push(r.id));
  return map;
}

function listingOut(row, photos, withOwner) {
  let amenities = [];
  try { amenities = JSON.parse(row.amenities || '[]'); } catch { /* ignoré */ }
  const out = {
    id: row.id, title: row.title, category: row.category, neighborhood: row.neighborhood, city: 'Libreville',
    price: row.price, period: row.period, bedrooms: row.bedrooms, bathrooms: row.bathrooms,
    description: row.description, amenities, phone: row.phone, whatsapp: row.whatsapp,
    status: row.status, createdAt: row.created_at, photos: photos || [], ...geoFields(row.neighborhood)
  };
  if (withOwner) { out.ownerName = row.owner_name; out.ownerId = row.owner_id; out.ownerEmail = row.owner_email; }
  return out;
}

async function searchListings(env, params) {
  const where = [`l.status='published'`, `u.status='active'`];
  const binds = [];
  const add = (cond, val) => { binds.push(val); where.push(cond.replace('?', '?' + binds.length)); };
  const cat = params.get('category'), nb = params.get('neighborhood'), maxPrice = params.get('maxPrice');
  if (cat && CATEGORIES.includes(cat)) add('l.category=?', cat);
  if (nb && byId[nb]) add('l.neighborhood=?', nb);
  if (maxPrice && Number(maxPrice) > 0) add('l.price<=?', Math.round(Number(maxPrice)));
  const { results } = await env.DB.prepare(
    `SELECT l.*, u.name AS owner_name FROM listings l JOIN users u ON u.id=l.owner_id
     WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT 200`).bind(...binds).all();
  const photos = await photosByListing(env, results.map(r => r.id));
  let list = results.map(r => listingOut(r, photos[r.id]));
  const zone = params.get('zone'), q = params.get('q');
  if (zone) list = list.filter(x => x.zone === zone);
  if (q) { const s = q.toLowerCase(); list = list.filter(x => [x.title, x.area, x.zoneName, x.description].join(' ').toLowerCase().includes(s)); }
  const near = params.get('near');
  let sort = params.get('sort');
  if (near) {
    const [lat, lng] = near.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      list = list.map(x => ({ ...x, kmFromYou: Math.round(km({ lat, lng }, x) * 10) / 10 }));
      sort = 'near';
    }
  }
  if (sort === 'price') list.sort((a, b) => a.price - b.price);
  else if (sort === 'near') list.sort((a, b) => (a.kmFromYou ?? 1e9) - (b.kmFromYou ?? 1e9));
  else if (sort === 'center') list.sort((a, b) => (a.kmFromCenter ?? 1e9) - (b.kmFromCenter ?? 1e9));
  return list;
}

// ---------- Abonnements ----------
async function activePlan(env, userId) {
  const now = Date.now();
  const sub = await env.DB.prepare(
    `SELECT s.id, s.expires_at, p.id AS plan_id, p.name, p.max_listings, p.price
     FROM subscriptions s JOIN plans p ON p.id=s.plan_id
     WHERE s.user_id=?1 AND s.status='active' AND s.expires_at>?2 ORDER BY s.expires_at DESC LIMIT 1`).bind(userId, now).first();
  if (sub) return { planId: sub.plan_id, name: sub.name, maxListings: sub.max_listings, expiresAt: sub.expires_at, paid: true };
  const free = await env.DB.prepare(`SELECT id,name,max_listings FROM plans WHERE price=0 AND active=1 ORDER BY sort LIMIT 1`).first();
  return { planId: free?.id || 'gratuit', name: free?.name || 'Gratuit', maxListings: free?.max_listings ?? 1, expiresAt: null, paid: false };
}

async function confirmPayment(env, payment) {
  if (payment.status === 'confirmed') return;
  const plan = await env.DB.prepare('SELECT * FROM plans WHERE id=?1').bind(payment.plan_id).first();
  if (!plan) return;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE payments SET status='confirmed', confirmed_at=?2 WHERE id=?1`).bind(payment.id, new Date(now).toISOString()),
    env.DB.prepare(`UPDATE subscriptions SET status='expired' WHERE user_id=?1 AND status='active'`).bind(payment.user_id),
    env.DB.prepare(`INSERT INTO subscriptions (id,user_id,plan_id,status,started_at,expires_at) VALUES (?1,?2,?3,'active',?4,?5)`)
      .bind(uid(), payment.user_id, plan.id, new Date(now).toISOString(), now + 30 * 86400000)
  ]);
}

// Point d'extension : brancher ici un prestataire de paiement en ligne (Airtel Money, carte bancaire).
// Doit renvoyer { redirectUrl } pour envoyer le client vers la page de paiement du prestataire,
// ou null pour rester en mode manuel (validation par l'administrateur).
async function startOnlinePayment(/* env, payment, plan, user */) {
  return null;
}

// ---------- Utilitaires de route ----------
const requireAuth = async (request, env) => currentUser(request, env);
const isAdmin = u => u && u.role === 'admin';

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function validEmail(e) { return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) && e.length <= 254; }

async function register(request, env, secure, role = 'owner') {
  const b = await readJson(request);
  if (!b) return bad('Requête invalide');
  const email = cleanText(b.email, 254).toLowerCase();
  const name = cleanText(b.name, 80);
  const password = String(b.password || '');
  if (!validEmail(email)) return bad('Adresse e-mail invalide');
  if (name.length < 2) return bad('Indiquez votre nom');
  if (password.length < 8 || password.length > 200) return bad('Le mot de passe doit contenir au moins 8 caractères');
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email=?1').bind(email).first();
  if (exists) return bad('Un compte existe déjà avec cet e-mail', 409);
  const { hash, salt } = await hashPassword(password);
  const id = uid();
  await env.DB.prepare(`INSERT INTO users (id,email,name,phone,pass_hash,salt,role,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'active',?8)`)
    .bind(id, email, name, cleanPhone(b.phone), hash, salt, role, new Date().toISOString()).run();
  const cookie = await createSession(env, id, secure);
  return json({ ok: true, user: { id, email, name, role } }, 201, { 'set-cookie': cookie });
}

async function login(request, env, secure) {
  const b = await readJson(request);
  if (!b) return bad('Requête invalide');
  const email = cleanText(b.email, 254).toLowerCase();
  const u = await env.DB.prepare('SELECT * FROM users WHERE email=?1').bind(email).first();
  // même coût de calcul que l'utilisateur existe ou non
  const { hash } = await hashPassword(String(b.password || ''), u ? u.salt : rand(16));
  if (!u || !safeEqual(hash, u.pass_hash)) return bad('E-mail ou mot de passe incorrect', 401);
  if (u.status !== 'active') return bad('Ce compte est suspendu', 403);
  const cookie = await createSession(env, u.id, secure);
  return json({ ok: true, user: { id: u.id, email: u.email, name: u.name, role: u.role } }, 200, { 'set-cookie': cookie });
}

// ---------- Photos ----------
async function uploadPhoto(request, env, user) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_PHOTO_BYTES + 1024) return bad('Photo trop lourde (900 Ko maximum après compression)', 413);
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return bad('Fichier vide');
  if (buf.byteLength > MAX_PHOTO_BYTES) return bad('Photo trop lourde (900 Ko maximum après compression)', 413);
  const mime = sniffImage(buf);
  if (!mime) return bad('Format accepté : JPEG, PNG ou WebP');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE owner_id=?1').bind(user.id).first();
  if (count.n >= MAX_PHOTOS_PER_USER && !isAdmin(user)) return bad('Limite de photos atteinte pour ce compte', 403);
  const id = uid();
  await env.DB.prepare(`INSERT INTO photos (id,owner_id,listing_id,mime,data,size,sort,created_at) VALUES (?1,?2,NULL,?3,?4,?5,0,?6)`)
    .bind(id, user.id, mime, toBase64(buf), buf.byteLength, new Date().toISOString()).run();
  return json({ id }, 201);
}

async function servePhoto(env, id) {
  const r = await env.DB.prepare('SELECT mime,data FROM photos WHERE id=?1').bind(id).first();
  if (!r) return new Response('Introuvable', { status: 404 });
  return new Response(fromBase64(r.data), {
    headers: { 'content-type': r.mime, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' }
  });
}

async function attachPhotos(env, user, listingId, photoIds) {
  const existing = (await env.DB.prepare('SELECT id FROM photos WHERE listing_id=?1').bind(listingId).all()).results.map(r => r.id);
  const stmts = [];
  // retirer les photos non conservées
  existing.filter(id => !photoIds.includes(id)).forEach(id => stmts.push(env.DB.prepare('DELETE FROM photos WHERE id=?1').bind(id)));
  for (let i = 0; i < photoIds.length; i++) {
    // une photo ne peut être rattachée que si elle appartient à l'utilisateur (ou à l'admin) et n'est pas déjà sur une autre annonce
    stmts.push(env.DB.prepare(
      `UPDATE photos SET listing_id=?1, sort=?2 WHERE id=?3 AND (owner_id=?4 OR ?5=1) AND (listing_id IS NULL OR listing_id=?1)`)
      .bind(listingId, i, photoIds[i], user.id, isAdmin(user) ? 1 : 0));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// ---------- Routeur ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const method = request.method;
    const secure = url.protocol === 'https:';

    if (!p.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.DB) return bad('Base de données non configurée (binding D1 « DB » manquant)', 503);

    try {
      await ensureSchema(env.DB);

      // Protection CSRF : les écritures exigent un en-tête personnalisé (impossible à envoyer depuis un autre site)
      const isWebhook = p === '/api/payments/webhook';
      if (!['GET', 'HEAD'].includes(method) && !isWebhook && request.headers.get('x-csrf') !== '1') {
        return bad('Requête refusée', 403);
      }

      let m;
      // ----- Public : hébergements, quartiers, site -----
      if (method === 'GET' && p === '/api/neighborhoods') {
        return json({
          center: geo.center,
          zones: geo.zones.map(z => ({ ...z, neighborhoods: geo.neighborhoods.filter(n => n.zone === z.id) }))
        });
      }
      if (method === 'GET' && p === '/api/stays') return json(searchStays(url.searchParams));
      if (method === 'GET' && (m = p.match(/^\/api\/stays\/([\w-]+)$/))) {
        const stay = loadStays().find(x => x.id === m[1]);
        return stay ? json(stay) : bad('Hébergement introuvable', 404);
      }
      if (method === 'POST' && p === '/api/requests') return createBookingRequest(request, env);

      if (method === 'GET' && p === '/api/site') {
        const s = await loadSite(env);
        return json({ texts: s.texts, sections: s.sections, settings: { hero_photos: heroPhotos(s.settings), dest_photos: s.settings.dest_photos || {}, merchant_name: s.settings.merchant_name } });
      }
      if (method === 'GET' && p === '/api/options') {
        return json({ categories: CATEGORIES, amenities: AMENITIES });
      }
      if (method === 'GET' && p === '/api/plans') {
        const { results } = await env.DB.prepare('SELECT id,name,price,max_listings FROM plans WHERE active=1 ORDER BY sort').all();
        return json(results);
      }
      if (method === 'GET' && (m = p.match(/^\/api\/photos\/([a-f0-9]{16})$/))) return servePhoto(env, m[1]);

      // ----- Public : annonces de location -----
      if (method === 'GET' && p === '/api/listings') return json(await searchListings(env, url.searchParams));
      if (method === 'GET' && (m = p.match(/^\/api\/listings\/([a-f0-9]{16})$/))) {
        const row = await env.DB.prepare(
          `SELECT l.*, u.name AS owner_name FROM listings l JOIN users u ON u.id=l.owner_id
           WHERE l.id=?1 AND l.status='published' AND u.status='active'`).bind(m[1]).first();
        if (!row) return bad('Annonce introuvable', 404);
        const photos = await photosByListing(env, [row.id]);
        const out = listingOut(row, photos[row.id], false);
        out.ownerName = row.owner_name;
        return json(out);
      }

      // ----- Authentification -----
      if (method === 'POST' && p === '/api/auth/register') return register(request, env, secure);
      if (method === 'POST' && p === '/api/auth/login') return login(request, env, secure);
      if (method === 'POST' && p === '/api/auth/logout') {
        await destroySession(request, env);
        return json({ ok: true }, 200, { 'set-cookie': clearCookie(secure) });
      }
      if (method === 'GET' && p === '/api/auth/me') {
        const u = await currentUser(request, env);
        return u ? json(u) : bad('Non connecté', 401);
      }
      // Création du premier administrateur (une seule fois, avec le code secret défini dans Cloudflare)
      if (method === 'GET' && p === '/api/admin/setup') {
        const a = await env.DB.prepare(`SELECT 1 FROM users WHERE role='admin' LIMIT 1`).first();
        return json({ needed: !a, configured: !!env.ADMIN_SETUP_CODE });
      }
      if (method === 'POST' && p === '/api/admin/setup') {
        const a = await env.DB.prepare(`SELECT 1 FROM users WHERE role='admin' LIMIT 1`).first();
        if (a) return bad('Un administrateur existe déjà', 403);
        if (!env.ADMIN_SETUP_CODE) return bad('Le code secret ADMIN_SETUP_CODE n\'est pas configuré dans Cloudflare', 503);
        const b = await readJson(request);
        if (!b || !safeEqual(String(b.code || ''), env.ADMIN_SETUP_CODE)) return bad('Code incorrect', 403);
        return register(new Request(request.url, { method: 'POST', body: JSON.stringify(b) }), env, secure, 'admin');
      }

      // ----- Webhook de paiement (prestataire) : signature HMAC-SHA256 du corps dans l'en-tête x-signature -----
      // À ADAPTER au format réel du prestataire choisi.
      if (isWebhook && method === 'POST') {
        if (!env.PAYMENT_WEBHOOK_SECRET) return bad('Webhook non configuré', 503);
        const raw = await request.text();
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.PAYMENT_WEBHOOK_SECRET),
          { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))]
          .map(x => x.toString(16).padStart(2, '0')).join('');
        if (!safeEqual(sig, request.headers.get('x-signature') || '')) return bad('Signature invalide', 401);
        let b; try { b = JSON.parse(raw); } catch { return bad('Corps invalide'); }
        const pay = await env.DB.prepare('SELECT * FROM payments WHERE reference=?1').bind(String(b.reference || '')).first();
        if (!pay) return bad('Paiement inconnu', 404);
        if (b.status === 'success') await confirmPayment(env, pay);
        else if (b.status === 'failed') await env.DB.prepare(`UPDATE payments SET status='rejected' WHERE id=?1 AND status!='confirmed'`).bind(pay.id).run();
        return json({ ok: true });
      }

      // ===== À partir d'ici : connexion obligatoire =====
      const user = await requireAuth(request, env);
      if (!user) return bad('Connexion requise', 401);

      // ----- Photos -----
      if (method === 'POST' && p === '/api/photos') return uploadPhoto(request, env, user);
      if (method === 'DELETE' && (m = p.match(/^\/api\/photos\/([a-f0-9]{16})$/))) {
        await env.DB.prepare('DELETE FROM photos WHERE id=?1 AND (owner_id=?2 OR ?3=1)').bind(m[1], user.id, isAdmin(user) ? 1 : 0).run();
        return json({ ok: true });
      }

      // ----- Mes annonces -----
      if (method === 'GET' && p === '/api/my/listings') {
        const { results } = await env.DB.prepare(
          `SELECT l.*, u.name AS owner_name FROM listings l JOIN users u ON u.id=l.owner_id
           WHERE l.owner_id=?1 AND l.status!='removed' ORDER BY l.created_at DESC`).bind(user.id).all();
        const photos = await photosByListing(env, results.map(r => r.id));
        return json(results.map(r => listingOut(r, photos[r.id])));
      }
      if (method === 'POST' && p === '/api/my/listings') {
        const parsed = parseListing(await readJson(request));
        if (parsed.error) return bad(parsed.error);
        const plan = await activePlan(env, user.id);
        const used = await env.DB.prepare(`SELECT COUNT(*) AS n FROM listings WHERE owner_id=?1 AND status IN ('published','hidden')`).bind(user.id).first();
        if (!isAdmin(user) && used.n >= plan.maxListings) {
          return bad(`Votre formule « ${plan.name} » permet ${plan.maxListings} annonce(s). Passez à une formule supérieure pour en publier davantage.`, 402, { code: 'limit' });
        }
        const v = parsed.v, id = uid(), now = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO listings (id,owner_id,title,category,neighborhood,price,period,bedrooms,bathrooms,description,amenities,phone,whatsapp,status,created_at,updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'published',?14,?14)`)
          .bind(id, user.id, v.title, v.category, v.neighborhood, v.price, v.period, v.bedrooms, v.bathrooms,
            v.description, JSON.stringify(v.amenities), v.phone, v.whatsapp, now).run();
        await attachPhotos(env, user, id, v.photoIds);
        return json({ ok: true, id }, 201);
      }
      if ((m = p.match(/^\/api\/my\/listings\/([a-f0-9]{16})$/))) {
        const row = await env.DB.prepare('SELECT * FROM listings WHERE id=?1').bind(m[1]).first();
        if (!row || (row.owner_id !== user.id && !isAdmin(user)) || row.status === 'removed') return bad('Annonce introuvable', 404);
        if (method === 'PUT') {
          const b = await readJson(request);
          const parsed = parseListing(b);
          if (parsed.error) return bad(parsed.error);
          const v = parsed.v;
          await env.DB.prepare(
            `UPDATE listings SET title=?2,category=?3,neighborhood=?4,price=?5,period=?6,bedrooms=?7,bathrooms=?8,
             description=?9,amenities=?10,phone=?11,whatsapp=?12,updated_at=?13 WHERE id=?1`)
            .bind(row.id, v.title, v.category, v.neighborhood, v.price, v.period, v.bedrooms, v.bathrooms,
              v.description, JSON.stringify(v.amenities), v.phone, v.whatsapp, new Date().toISOString()).run();
          await attachPhotos(env, user, row.id, v.photoIds);
          return json({ ok: true });
        }
        if (method === 'DELETE') {
          await env.DB.batch([
            env.DB.prepare(`UPDATE listings SET status='removed', updated_at=?2 WHERE id=?1`).bind(row.id, new Date().toISOString()),
            env.DB.prepare('DELETE FROM photos WHERE listing_id=?1').bind(row.id)
          ]);
          return json({ ok: true });
        }
      }
      if (method === 'POST' && (m = p.match(/^\/api\/my\/listings\/([a-f0-9]{16})\/status$/))) {
        const b = await readJson(request);
        if (!b || !['published', 'hidden'].includes(b.status)) return bad('Statut invalide');
        const row = await env.DB.prepare('SELECT * FROM listings WHERE id=?1').bind(m[1]).first();
        if (!row || row.owner_id !== user.id || row.status === 'removed') return bad('Annonce introuvable', 404);
        if (row.status === 'removed') return bad('Annonce retirée', 403);
        await env.DB.prepare('UPDATE listings SET status=?2, updated_at=?3 WHERE id=?1').bind(row.id, b.status, new Date().toISOString()).run();
        return json({ ok: true });
      }

      // ----- Mon abonnement et paiements -----
      if (method === 'GET' && p === '/api/my/subscription') {
        const plan = await activePlan(env, user.id);
        const used = await env.DB.prepare(`SELECT COUNT(*) AS n FROM listings WHERE owner_id=?1 AND status IN ('published','hidden')`).bind(user.id).first();
        const { results: pays } = await env.DB.prepare(
          `SELECT p.id,p.amount,p.status,p.reference,p.txn_ref,p.created_at,pl.name AS plan_name FROM payments p JOIN plans pl ON pl.id=p.plan_id
           WHERE p.user_id=?1 ORDER BY p.created_at DESC LIMIT 20`).bind(user.id).all();
        return json({ plan, used: used.n, payments: pays });
      }
      if (method === 'POST' && p === '/api/my/checkout') {
        const b = await readJson(request);
        const plan = b && await env.DB.prepare('SELECT * FROM plans WHERE id=?1 AND active=1').bind(String(b.planId || '')).first();
        if (!plan) return bad('Formule introuvable', 404);
        if (plan.price <= 0) return bad('Cette formule est gratuite');
        const id = uid();
        const reference = 'GS-' + rand(4).toUpperCase();
        await env.DB.prepare(
          `INSERT INTO payments (id,user_id,plan_id,amount,method,provider,reference,status,created_at) VALUES (?1,?2,?3,?4,?5,'manual',?6,'pending',?7)`)
          .bind(id, user.id, plan.id, plan.price, b.method === 'card' ? 'card' : 'airtel_money', reference, new Date().toISOString()).run();
        const online = await startOnlinePayment(env, { id, reference }, plan, user);
        const site = await loadSite(env);
        return json({
          id, reference, amount: plan.price, planName: plan.name,
          redirectUrl: online ? online.redirectUrl : null,
          manual: !online,
          airtelNumber: site.settings.airtel_number, merchantName: site.settings.merchant_name,
          instructions: site.texts.payment_instructions
        }, 201);
      }
      if (method === 'POST' && (m = p.match(/^\/api\/my\/payments\/([a-f0-9]{16})\/proof$/))) {
        const b = await readJson(request);
        const txn = cleanText(b && b.txnRef, 60);
        if (txn.length < 4) return bad('Saisissez la référence de la transaction reçue par SMS');
        const r = await env.DB.prepare(`UPDATE payments SET txn_ref=?3, status='submitted' WHERE id=?1 AND user_id=?2 AND status IN ('pending','submitted')`)
          .bind(m[1], user.id, txn).run();
        return r.meta.changes ? json({ ok: true }) : bad('Paiement introuvable', 404);
      }

      // ===== Administration =====
      if (p.startsWith('/api/admin/')) {
        if (!isAdmin(user)) return bad('Accès réservé à l\'administrateur', 403);

        if (method === 'GET' && p === '/api/admin/overview') {
          const c = async sql => (await env.DB.prepare(sql).first()).n;
          return json({
            users: await c(`SELECT COUNT(*) AS n FROM users WHERE role='owner'`),
            listings: await c(`SELECT COUNT(*) AS n FROM listings WHERE status='published'`),
            hidden: await c(`SELECT COUNT(*) AS n FROM listings WHERE status='hidden'`),
            pendingPayments: await c(`SELECT COUNT(*) AS n FROM payments WHERE status IN ('pending','submitted')`),
            activeSubs: await c(`SELECT COUNT(*) AS n FROM subscriptions WHERE status='active' AND expires_at>${Date.now()}`),
            bookingRequests: await c(`SELECT COUNT(*) AS n FROM requests`)
          });
        }
        if (method === 'GET' && p === '/api/admin/listings') {
          const { results } = await env.DB.prepare(
            `SELECT l.*, u.name AS owner_name, u.email AS owner_email FROM listings l JOIN users u ON u.id=l.owner_id
             WHERE l.status!='removed' ORDER BY l.created_at DESC LIMIT 300`).all();
          const photos = await photosByListing(env, results.map(r => r.id));
          return json(results.map(r => listingOut(r, photos[r.id], true)));
        }
        if (method === 'POST' && (m = p.match(/^\/api\/admin\/listings\/([a-f0-9]{16})\/status$/))) {
          const b = await readJson(request);
          if (!b || !['published', 'hidden', 'removed'].includes(b.status)) return bad('Statut invalide');
          await env.DB.prepare('UPDATE listings SET status=?2, updated_at=?3 WHERE id=?1').bind(m[1], b.status, new Date().toISOString()).run();
          if (b.status === 'removed') await env.DB.prepare('DELETE FROM photos WHERE listing_id=?1').bind(m[1]).run();
          return json({ ok: true });
        }
        if (method === 'GET' && p === '/api/admin/users') {
          const { results } = await env.DB.prepare(
            `SELECT u.id,u.email,u.name,u.phone,u.role,u.status,u.created_at,
             (SELECT COUNT(*) FROM listings l WHERE l.owner_id=u.id AND l.status IN ('published','hidden')) AS listings
             FROM users u ORDER BY u.created_at DESC LIMIT 300`).all();
          return json(results);
        }
        if (method === 'POST' && (m = p.match(/^\/api\/admin\/users\/([a-f0-9]{16})\/status$/))) {
          const b = await readJson(request);
          if (!b || !['active', 'suspended'].includes(b.status)) return bad('Statut invalide');
          if (m[1] === user.id) return bad('Vous ne pouvez pas suspendre votre propre compte');
          await env.DB.prepare('UPDATE users SET status=?2 WHERE id=?1').bind(m[1], b.status).run();
          if (b.status === 'suspended') await env.DB.prepare('DELETE FROM sessions WHERE user_id=?1').bind(m[1]).run();
          return json({ ok: true });
        }
        if (method === 'GET' && p === '/api/admin/subscriptions') {
          const { results } = await env.DB.prepare(
            `SELECT s.id,s.status,s.started_at,s.expires_at,u.name AS user_name,u.email AS user_email,u.phone AS user_phone,
             pl.name AS plan_name,pl.price,pl.max_listings,
             (SELECT COUNT(*) FROM listings l WHERE l.owner_id=u.id AND l.status!='removed') AS listings
             FROM subscriptions s JOIN users u ON u.id=s.user_id JOIN plans pl ON pl.id=s.plan_id
             ORDER BY s.started_at DESC LIMIT 300`).all();
          return json(results);
        }
        if (method === 'GET' && p === '/api/admin/payments') {
          const { results } = await env.DB.prepare(
            `SELECT p.id,p.amount,p.method,p.reference,p.txn_ref,p.status,p.created_at,p.confirmed_at,
             u.name AS user_name,u.email AS user_email,u.phone AS user_phone,pl.name AS plan_name
             FROM payments p JOIN users u ON u.id=p.user_id JOIN plans pl ON pl.id=p.plan_id
             ORDER BY (p.status IN ('pending','submitted')) DESC, p.created_at DESC LIMIT 200`).all();
          return json(results);
        }
        if (method === 'POST' && (m = p.match(/^\/api\/admin\/payments\/([a-f0-9]{16})\/(confirm|reject)$/))) {
          const pay = await env.DB.prepare('SELECT * FROM payments WHERE id=?1').bind(m[1]).first();
          if (!pay) return bad('Paiement introuvable', 404);
          if (m[2] === 'confirm') await confirmPayment(env, pay);
          else await env.DB.prepare(`UPDATE payments SET status='rejected' WHERE id=?1 AND status!='confirmed'`).bind(pay.id).run();
          return json({ ok: true });
        }
        if (method === 'GET' && p === '/api/admin/plans') {
          const { results } = await env.DB.prepare('SELECT * FROM plans ORDER BY sort').all();
          return json(results);
        }
        if (method === 'PUT' && (m = p.match(/^\/api\/admin\/plans\/([\w-]{1,30})$/))) {
          const b = await readJson(request) || {};
          const price = Math.round(Number(b.price)), max = Math.round(Number(b.max_listings));
          const name = cleanText(b.name, 40);
          if (!name || !Number.isFinite(price) || price < 0 || price > 10000000 || !Number.isFinite(max) || max < 1 || max > 9999) return bad('Valeurs invalides');
          await env.DB.prepare('UPDATE plans SET name=?2, price=?3, max_listings=?4, active=?5 WHERE id=?1')
            .bind(m[1], name, price, max, b.active ? 1 : 0).run();
          return json({ ok: true });
        }
        if (method === 'GET' && p === '/api/admin/site') return json(await loadSite(env));
        if (method === 'PUT' && p === '/api/admin/site') {
          const b = await readJson(request);
          if (!b) return bad('Requête invalide');
          const cur = await loadSite(env);
          const texts = { ...cur.texts };
          for (const k of Object.keys(DEFAULT_SITE.texts)) {
            if (b.texts && typeof b.texts[k] === 'string') texts[k] = cleanText(b.texts[k], 400) || DEFAULT_SITE.texts[k];
          }
          let sections = cur.sections;
          if (Array.isArray(b.sections)) {
            const seen = new Set();
            sections = b.sections.filter(s => s && DEFAULT_SITE.sections.some(d => d.id === s.id) && !seen.has(s.id) && seen.add(s.id))
              .map(s => ({ id: s.id, visible: !!s.visible }));
            DEFAULT_SITE.sections.forEach(d => { if (!seen.has(d.id)) sections.push({ ...d }); });
          }
          const settings = { ...cur.settings };
          if (b.settings) {
            if (typeof b.settings.airtel_number === 'string') settings.airtel_number = cleanPhone(b.settings.airtel_number);
            if (typeof b.settings.merchant_name === 'string') settings.merchant_name = cleanText(b.settings.merchant_name, 60) || 'Gabon Séjours';
            if (Array.isArray(b.settings.hero_photos)) {
              settings.hero_photos = b.settings.hero_photos.filter(x => typeof x === 'string' && HEX16.test(x)).slice(0, 6);
              settings.hero_photo_id = '';
            }
            if (b.settings.dest_photos && typeof b.settings.dest_photos === 'object') {
              const dp = {};
              for (const k of ['libreville', 'loango', 'lope', 'pongara', 'mayumba', 'lambarene']) {
                const v = b.settings.dest_photos[k];
                if (typeof v === 'string' && HEX16.test(v)) dp[k] = v;
              }
              settings.dest_photos = dp;
            }
          }
          await saveSite(env, { texts, sections, settings });
          return json({ ok: true });
        }
        if (method === 'GET' && p === '/api/admin/booking-requests') {
          const { results } = await env.DB.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT 200').all();
          return json(results);
        }
      }

      return bad('Route inconnue', 404);
    } catch (e) {
      console.error(e);
      return bad('Erreur du serveur', 500);
    }
  }
};
