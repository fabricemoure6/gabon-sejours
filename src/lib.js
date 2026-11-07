// Utilitaires partagés : réponses JSON, mots de passe, sessions, schéma D1, configuration du site.

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
export const bad = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);

const enc = new TextEncoder();
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const rand = n => toHex(crypto.getRandomValues(new Uint8Array(n)));
export const uid = () => rand(8); // 16 caractères hexadécimaux

export async function sha256(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function hashPassword(password, salt) {
  salt = salt || rand(16);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { hash: toHex(bits), salt };
}

// ---------- Sessions (cookie HttpOnly, jeton stocké haché) ----------
const SESSION_DAYS = 30;

function getCookie(request, name) {
  const c = request.headers.get('cookie') || '';
  const m = c.split(/;\s*/).find(x => x.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

export async function createSession(env, userId, secure) {
  const token = rand(32);
  const exp = Date.now() + SESSION_DAYS * 86400000;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1,?2,?3)')
    .bind(await sha256(token), userId, exp).run();
  return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}

export const clearCookie = secure => `sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;

export async function currentUser(request, env) {
  const sid = getCookie(request, 'sid');
  if (!sid) return null;
  const u = await env.DB.prepare(
    `SELECT u.id,u.email,u.name,u.phone,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=?1 AND s.expires_at>?2`).bind(await sha256(sid), Date.now()).first();
  return u && u.status === 'active' ? u : null;
}

export async function destroySession(request, env) {
  const sid = getCookie(request, 'sid');
  if (sid) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?1').bind(await sha256(sid)).run();
}

// ---------- Schéma ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, phone TEXT,
     pass_hash TEXT NOT NULL, salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', status TEXT NOT NULL DEFAULT 'active', created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL DEFAULT 0,
     max_listings INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan_id TEXT NOT NULL,
     status TEXT NOT NULL, started_at TEXT, expires_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan_id TEXT NOT NULL, amount INTEGER NOT NULL,
     method TEXT, provider TEXT DEFAULT 'manual', reference TEXT UNIQUE, txn_ref TEXT, status TEXT NOT NULL DEFAULT 'pending',
     created_at TEXT, confirmed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL,
     neighborhood TEXT NOT NULL, price INTEGER NOT NULL, period TEXT NOT NULL DEFAULT 'mois', bedrooms INTEGER DEFAULT 0,
     bathrooms INTEGER DEFAULT 0, description TEXT, amenities TEXT DEFAULT '[]', phone TEXT, whatsapp TEXT,
     status TEXT NOT NULL DEFAULT 'published', created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, listing_id TEXT, mime TEXT NOT NULL,
     data TEXT NOT NULL, size INTEGER, sort INTEGER DEFAULT 0, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS site_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, created_at TEXT, stay_id TEXT, name TEXT, phone TEXT,
     check_in TEXT, check_out TEXT, guests INTEGER, message TEXT, nights INTEGER, total INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_photos_listing ON photos(listing_id)`
];

let ready = null;
export function ensureSchema(db) {
  if (!ready) {
    ready = (async () => {
      await db.batch(SCHEMA.map(s => db.prepare(s)));
      // Formules par défaut : PRIX À FIXER par l'administrateur (espace admin > Abonnements)
      await db.batch([
        db.prepare(`INSERT OR IGNORE INTO plans (id,name,price,max_listings,sort,active) VALUES ('gratuit','Gratuit',0,1,0,1)`),
        db.prepare(`INSERT OR IGNORE INTO plans (id,name,price,max_listings,sort,active) VALUES ('standard','Standard',5000,5,1,1)`),
        db.prepare(`INSERT OR IGNORE INTO plans (id,name,price,max_listings,sort,active) VALUES ('pro','Pro',15000,999,2,1)`)
      ]);
    })().catch(e => { ready = null; throw e; });
  }
  return ready;
}

// ---------- Configuration du site (textes, ordre des sections, réglages) ----------
export const DEFAULT_SITE = {
  texts: {
    hero_title: 'Trouvez votre hébergement au Gabon',
    hero_subtitle: 'Hôtels, appartements meublés et lodges, de Libreville aux parcs nationaux.',
    rent_promo_title: 'Maisons, studios et chambres à louer',
    rent_promo_text: 'Consultez les annonces par zone et par quartier, ou publiez la vôtre en quelques minutes.',
    zones_title: 'Explorer Libreville par zone',
    discover_title: 'Découvrez le Gabon',
    discover_subtitle: 'Plages, forêts, parcs nationaux et capitale : choisissez votre destination.',
    footer_text: 'Les établissements affichés sont des exemples fictifs. Les positions des quartiers sont approximatives.',
    rent_title: 'Maisons à louer',
    rent_subtitle: 'Maisons, villas, appartements, studios et chambres, par zone et par quartier.',
    payment_instructions: 'Envoyez le montant par Airtel Money au numéro indiqué, puis saisissez la référence de la transaction.'
  },
  text_labels: {
    hero_title: 'Accueil : titre principal',
    hero_subtitle: 'Accueil : sous-titre',
    rent_promo_title: 'Accueil : titre du bloc « À louer »',
    rent_promo_text: 'Accueil : texte du bloc « À louer »',
    zones_title: 'Accueil : titre des zones',
    discover_title: 'Accueil : titre « Découvrez le Gabon »',
    discover_subtitle: 'Accueil : sous-titre « Découvrez le Gabon »',
    footer_text: 'Pied de page',
    rent_title: 'Page Maisons à louer : titre',
    rent_subtitle: 'Page Maisons à louer : sous-titre',
    payment_instructions: 'Abonnement : consigne de paiement'
  },
  sections: [
    { id: 'hero', visible: true },
    { id: 'stats', visible: true },
    { id: 'discover', visible: true },
    { id: 'rentpromo', visible: true },
    { id: 'results', visible: true },
    { id: 'zones', visible: true }
  ],
  section_labels: {
    hero: 'Bandeau et recherche',
    stats: 'Chiffres clés',
    discover: 'Découvrez le Gabon (destinations)',
    rentpromo: 'Bloc « Maisons à louer »',
    results: 'Liste et carte des hébergements',
    zones: 'Explorer par zone'
  },
  settings: { airtel_number: '', merchant_name: 'Gabon Séjours', hero_photo_id: '' }
};

export async function loadSite(env) {
  const row = await env.DB.prepare(`SELECT value FROM site_config WHERE key='site'`).first();
  let saved = {};
  try { saved = row ? JSON.parse(row.value) : {}; } catch { saved = {}; }
  const sections = [...(saved.sections || [])].filter(s => DEFAULT_SITE.sections.some(d => d.id === s.id));
  DEFAULT_SITE.sections.forEach(d => { if (!sections.some(s => s.id === d.id)) sections.push({ ...d }); });
  return {
    texts: { ...DEFAULT_SITE.texts, ...(saved.texts || {}) },
    text_labels: DEFAULT_SITE.text_labels,
    sections,
    section_labels: DEFAULT_SITE.section_labels,
    settings: { ...DEFAULT_SITE.settings, ...(saved.settings || {}) }
  };
}

export async function saveSite(env, site) {
  const value = JSON.stringify({ texts: site.texts, sections: site.sections, settings: site.settings });
  await env.DB.prepare(`INSERT INTO site_config (key,value) VALUES ('site',?1)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(value).run();
}

// ---------- Photos : base64 <-> octets ----------
export function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export function sniffImage(buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  return null;
}
