// Version Cloudflare Workers de l'API (mêmes routes que server.js).
// Les pages statiques (dossier public/) sont servies par Cloudflare ; ce code ne gère que /api/*.
import staysData from '../data/stays.json';
import geo from '../data/neighborhoods.json';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });

function km(a, b) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const byId = Object.fromEntries(geo.neighborhoods.map(n => [n.id, n]));
const zonesById = Object.fromEntries(geo.zones.map(z => [z.id, z]));

function loadStays() {
  return staysData.map(s => {
    const n = s.neighborhood && byId[s.neighborhood];
    const out = { ...s };
    if (n) {
      out.area = n.name; out.lat = n.lat; out.lng = n.lng;
      out.zone = n.zone; out.zoneName = zonesById[n.zone].name; out.arrondissement = n.arrondissement;
    }
    if (typeof out.lat === 'number') out.kmFromCenter = Math.round(km(geo.center, out) * 10) / 10;
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

async function createRequest(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Requête invalide' }, 400); }
  const { stayId, name, phone, checkIn, checkOut, guests, message } = body || {};
  const stay = loadStays().find(x => x.id === stayId);
  if (!stay) return json({ error: 'Hébergement invalide' }, 400);
  if (!name || !phone || !checkIn || !checkOut) {
    return json({ error: 'Nom, téléphone et dates sont obligatoires' }, 400);
  }
  const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
  if (isNaN(nights) || nights < 1) return json({ error: 'Dates invalides' }, 400);

  const clean = v => String(v || '').slice(0, 500);
  const rec = {
    id: Date.now().toString(36),
    createdAt: new Date().toISOString(),
    stayId, name: clean(name), phone: clean(phone), checkIn, checkOut,
    guests: Number(guests) || 1, message: clean(message), nights,
    total: nights * stay.price
  };

  // Enregistrement dans D1 si la base est reliée (binding "DB"). Sinon, la demande part seulement par WhatsApp.
  let saved = false;
  if (env.DB) {
    try {
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS requests (
           id TEXT PRIMARY KEY, created_at TEXT, stay_id TEXT, name TEXT, phone TEXT,
           check_in TEXT, check_out TEXT, guests INTEGER, message TEXT, nights INTEGER, total INTEGER)`
      ).run();
      await env.DB.prepare(
        `INSERT INTO requests VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`
      ).bind(rec.id, rec.createdAt, rec.stayId, rec.name, rec.phone, rec.checkIn, rec.checkOut,
        rec.guests, rec.message, rec.nights, rec.total).run();
      saved = true;
    } catch (e) { console.error('D1', e); }
  }

  const where = [stay.area, stay.city].filter(Boolean).join(', ');
  const text =
    `Bonjour, je souhaite réserver : ${stay.name} (${where}).\n` +
    `Du ${checkIn} au ${checkOut} (${nights} nuit(s)), ${rec.guests} personne(s).\n` +
    `Total estimé : ${rec.total.toLocaleString('fr-FR')} FCFA.\n` +
    `Nom : ${rec.name} - Tél : ${rec.phone}` +
    (rec.message ? `\nMessage : ${rec.message}` : '');
  return json({
    ok: true, saved, request: rec,
    whatsappUrl: `https://wa.me/${stay.whatsapp}?text=${encodeURIComponent(text)}`
  }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === '/api/neighborhoods' && request.method === 'GET') {
      return json({
        center: geo.center,
        zones: geo.zones.map(z => ({ ...z, neighborhoods: geo.neighborhoods.filter(n => n.zone === z.id) }))
      });
    }
    if (p === '/api/stays' && request.method === 'GET') return json(searchStays(url.searchParams));
    if (p.startsWith('/api/stays/') && request.method === 'GET') {
      const id = decodeURIComponent(p.slice('/api/stays/'.length));
      const stay = loadStays().find(x => x.id === id);
      return stay ? json(stay) : json({ error: 'Hébergement introuvable' }, 404);
    }
    if (p === '/api/requests' && request.method === 'POST') return createRequest(request, env);
    if (p.startsWith('/api/')) return json({ error: 'Route inconnue' }, 404);

    // Tout le reste : fichiers statiques
    return env.ASSETS.fetch(request);
  }
};
