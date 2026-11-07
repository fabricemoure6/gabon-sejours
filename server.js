const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
const REQUESTS_FILE = path.join(DATA, 'requests.json');

app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const readJson = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const loadRequests = () => {
  try { return JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8')); } catch { return []; }
};

// Distance à vol d'oiseau en km
function km(a, b) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Enrichit chaque hébergement avec quartier, zone, coordonnées et distance au centre
function loadStays() {
  const geo = readJson('neighborhoods.json');
  const byId = Object.fromEntries(geo.neighborhoods.map(n => [n.id, n]));
  const zones = Object.fromEntries(geo.zones.map(z => [z.id, z]));
  return readJson('stays.json').map(s => {
    const n = s.neighborhood && byId[s.neighborhood];
    const out = { ...s };
    if (n) {
      out.area = n.name;
      out.lat = n.lat;
      out.lng = n.lng;
      out.zone = n.zone;
      out.zoneName = zones[n.zone].name;
      out.arrondissement = n.arrondissement;
    }
    if (typeof out.lat === 'number') {
      out.kmFromCenter = Math.round(km(geo.center, out) * 10) / 10;
    }
    return out;
  });
}

app.get('/api/neighborhoods', (req, res) => {
  const geo = readJson('neighborhoods.json');
  res.json({
    center: geo.center,
    zones: geo.zones.map(z => ({ ...z, neighborhoods: geo.neighborhoods.filter(n => n.zone === z.id) }))
  });
});

// Recherche avec filtres, y compris par quartier, zone et proximité (near=lat,lng)
app.get('/api/stays', (req, res) => {
  const { q, city, type, guests, maxPrice, sort, neighborhood, zone, near } = req.query;
  let list = loadStays();
  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter(x => [x.name, x.city, x.area, x.zoneName].join(' ').toLowerCase().includes(s));
  }
  if (city) list = list.filter(x => x.city === city);
  if (type) list = list.filter(x => x.type === type);
  if (guests) list = list.filter(x => x.guests >= Number(guests));
  if (maxPrice) list = list.filter(x => x.price <= Number(maxPrice));
  if (neighborhood) list = list.filter(x => x.neighborhood === neighborhood);
  if (zone) list = list.filter(x => x.zone === zone);

  let sortKey = sort;
  if (near) {
    const [lat, lng] = String(near).split(',').map(Number);
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
  res.json(list);
});

app.get('/api/stays/:id', (req, res) => {
  const stay = loadStays().find(x => x.id === req.params.id);
  if (!stay) return res.status(404).json({ error: 'Hébergement introuvable' });
  res.json(stay);
});

// Demande de réservation : enregistrée + lien WhatsApp
app.post('/api/requests', (req, res) => {
  const { stayId, name, phone, checkIn, checkOut, guests, message } = req.body || {};
  const stay = loadStays().find(x => x.id === stayId);
  if (!stay) return res.status(400).json({ error: 'Hébergement invalide' });
  if (!name || !phone || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'Nom, téléphone et dates sont obligatoires' });
  }
  const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
  if (isNaN(nights) || nights < 1) return res.status(400).json({ error: 'Dates invalides' });

  const clean = v => String(v || '').slice(0, 500);
  const request = {
    id: Date.now().toString(36),
    createdAt: new Date().toISOString(),
    stayId, name: clean(name), phone: clean(phone), checkIn, checkOut,
    guests: Number(guests) || 1, message: clean(message), nights,
    total: nights * stay.price
  };
  const all = loadRequests();
  all.push(request);
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(all, null, 2));

  const where = [stay.area, stay.city].filter(Boolean).join(', ');
  const text =
    `Bonjour, je souhaite réserver : ${stay.name} (${where}).\n` +
    `Du ${checkIn} au ${checkOut} (${nights} nuit(s)), ${request.guests} personne(s).\n` +
    `Total estimé : ${request.total.toLocaleString('fr-FR')} FCFA.\n` +
    `Nom : ${request.name} - Tél : ${request.phone}` +
    (request.message ? `\nMessage : ${request.message}` : '');
  res.status(201).json({
    ok: true, request,
    whatsappUrl: `https://wa.me/${stay.whatsapp}?text=${encodeURIComponent(text)}`
  });
});

app.listen(PORT, () => console.log(`Gabon Séjours : http://localhost:${PORT}`));
