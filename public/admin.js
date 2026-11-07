const app = $('#app');
let me = null;
let tab = 'overview';
const TABS = [
  ['overview', 'Tableau de bord'], ['listings', 'Annonces'], ['users', 'Utilisateurs'], ['payments', 'Paiements'],
  ['plans', 'Abonnements'], ['site', 'Textes, structure et photos'], ['bookings', 'Demandes de réservation']
];
const STATUS = { published: 'Publiée', hidden: 'Masquée', pending: 'À payer', submitted: 'À vérifier', confirmed: 'Confirmé', rejected: 'Refusé', active: 'Actif', suspended: 'Suspendu' };
const badge = s => `<span class="badge ${esc(s)}">${esc(STATUS[s] || s)}</span>`;
const date = d => d ? new Date(d).toLocaleDateString('fr-FR') : '';

// ---------- Connexion admin / première configuration ----------
async function renderLogin() {
  let setup = { needed: false, configured: true };
  try { setup = await api('/api/admin/setup'); } catch { /* ignoré */ }
  app.innerHTML = `
    <div class="card-box narrow-box">
      <h1>Administration</h1>
      <form id="login" class="stack">
        <label>Adresse e-mail<input name="email" type="email" autocomplete="email" required></label>
        <label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
        <button type="submit">Se connecter</button>
        <div id="fb"></div>
      </form>
      ${setup.needed ? `
      <hr>
      <h2>Première installation</h2>
      <p class="loc">Aucun administrateur n'existe encore. Créez-le avec le code secret <code>ADMIN_SETUP_CODE</code> défini dans Cloudflare (Settings &gt; Variables and Secrets).
        ${setup.configured ? '' : '<strong>Ce code n\'est pas encore défini.</strong>'}</p>
      <form id="setup" class="stack">
        <label>Votre nom<input name="name" required minlength="2"></label>
        <label>E-mail administrateur<input name="email" type="email" required></label>
        <label>Mot de passe (8 caractères minimum)<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
        <label>Code secret d'installation<input name="code" type="password" required autocomplete="off"></label>
        <button type="submit">Créer l'administrateur</button>
        <div id="sfb"></div>
      </form>` : ''}
    </div>`;
  $('#login').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('/api/auth/login', { json: Object.fromEntries(new FormData(e.target)) }); await start(); }
    catch (err) { flash($('#fb'), err.message, 'err'); }
  });
  const s = $('#setup');
  if (s) s.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('/api/admin/setup', { json: Object.fromEntries(new FormData(e.target)) }); await start(); }
    catch (err) { flash($('#sfb'), err.message, 'err'); }
  });
}

// ---------- Coque de l'espace admin ----------
function renderShell() {
  app.innerHTML = `
    <div class="head-row"><h1>Administration</h1>
      <div class="row-gap"><a class="btn alt small" href="/compte.html">Publier une annonce avec photos</a>
      <button type="button" id="logout" class="ghost dark small">Se déconnecter</button></div></div>
    <div class="tabs" role="tablist">${TABS.map(([id, t]) => `<button type="button" role="tab" data-tab="${id}" class="${id === tab ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
    <section id="panel" class="card-box"></section>`;
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; renderShell(); }));
  $('#logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); me = null; start(); });
  const fn = { overview, listings, users, payments, plans, site, bookings }[tab];
  fn($('#panel')).catch(err => { $('#panel').innerHTML = `<div class="msg err">${esc(err.message)}</div>`; });
}

async function overview(el) {
  const o = await api('/api/admin/overview');
  const tiles = [
    ['Annonces publiées', o.listings], ['Annonces masquées', o.hidden], ['Propriétaires inscrits', o.users],
    ['Abonnements actifs', o.activeSubs], ['Paiements à traiter', o.pendingPayments], ['Demandes de réservation', o.bookingRequests]
  ];
  el.innerHTML = `<div class="tiles">${tiles.map(([l, n]) => `<div class="tile"><strong>${n}</strong><span>${esc(l)}</span></div>`).join('')}</div>
    ${o.pendingPayments ? '<p class="msg err">Des paiements attendent votre vérification (onglet Paiements).</p>' : ''}`;
}

async function listings(el) {
  const list = await api('/api/admin/listings');
  el.innerHTML = `<h2>Annonces (${list.length})</h2>` + (list.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Photo</th><th>Annonce</th><th>Quartier</th><th>Prix</th><th>Propriétaire</th><th>État</th><th>Actions</th></tr></thead><tbody>
    ${list.map(l => `<tr>
      <td>${l.photos[0] ? `<img class="mini" src="/api/photos/${esc(l.photos[0])}" alt="">` : '–'}</td>
      <td><a href="/annonce.html?id=${esc(l.id)}">${esc(l.title)}</a><br><small>${esc(CATEGORY_LABELS[l.category] || l.category)} · ${date(l.createdAt)}</small></td>
      <td>${esc(l.area)}</td><td>${fcfa(l.price)} / ${esc(l.period)}</td>
      <td>${esc(l.ownerName)}<br><small>${esc(l.ownerEmail)}</small></td><td>${badge(l.status)}</td>
      <td class="acts">
        <button type="button" class="small ghost dark" data-s="${l.status === 'published' ? 'hidden' : 'published'}" data-id="${esc(l.id)}">${l.status === 'published' ? 'Masquer' : 'Publier'}</button>
        <button type="button" class="small danger" data-s="removed" data-id="${esc(l.id)}">Supprimer</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="loc">Aucune annonce.</p>');
  $$('[data-s]', el).forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.s === 'removed' && !confirm('Supprimer cette annonce et ses photos ?')) return;
    await api(`/api/admin/listings/${b.dataset.id}/status`, { json: { status: b.dataset.s } }); listings(el);
  }));
}

async function users(el) {
  const list = await api('/api/admin/users');
  el.innerHTML = `<h2>Utilisateurs (${list.length})</h2><div class="table-wrap"><table>
    <thead><tr><th>Nom</th><th>E-mail</th><th>Téléphone</th><th>Rôle</th><th>Annonces</th><th>Inscrit le</th><th>État</th><th></th></tr></thead><tbody>
    ${list.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.phone)}</td><td>${esc(u.role === 'admin' ? 'Admin' : 'Propriétaire')}</td>
      <td>${u.listings}</td><td>${date(u.created_at)}</td><td>${badge(u.status)}</td>
      <td>${u.role === 'admin' ? '' : `<button type="button" class="small ${u.status === 'active' ? 'danger' : ''}" data-u="${esc(u.id)}" data-s="${u.status === 'active' ? 'suspended' : 'active'}">${u.status === 'active' ? 'Suspendre' : 'Réactiver'}</button>`}</td></tr>`).join('')}
    </tbody></table></div>`;
  $$('[data-u]', el).forEach(b => b.addEventListener('click', async () => {
    await api(`/api/admin/users/${b.dataset.u}/status`, { json: { status: b.dataset.s } }); users(el);
  }));
}

async function payments(el) {
  const list = await api('/api/admin/payments');
  el.innerHTML = `<h2>Paiements d'abonnement</h2>
    <p class="loc">Vérifiez la réception du paiement Airtel Money (référence de transaction), puis confirmez : la formule du propriétaire est activée 30 jours.</p>
    ${list.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Propriétaire</th><th>Formule</th><th>Montant</th><th>Réf. GS</th><th>Réf. transaction</th><th>État</th><th>Actions</th></tr></thead><tbody>
    ${list.map(p => `<tr><td>${date(p.created_at)}</td><td>${esc(p.user_name)}<br><small>${esc(p.user_email)} ${esc(p.user_phone || '')}</small></td>
      <td>${esc(p.plan_name)}</td><td>${fcfa(p.amount)}</td><td>${esc(p.reference)}</td><td>${esc(p.txn_ref || '–')}</td><td>${badge(p.status)}</td>
      <td class="acts">${p.status === 'pending' || p.status === 'submitted'
        ? `<button type="button" class="small" data-c="confirm" data-id="${esc(p.id)}">Confirmer</button><button type="button" class="small danger" data-c="reject" data-id="${esc(p.id)}">Refuser</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="loc">Aucun paiement pour le moment.</p>'}`;
  $$('[data-c]', el).forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.c === 'confirm' && !confirm('Confirmer la réception du paiement et activer la formule ?')) return;
    await api(`/api/admin/payments/${b.dataset.id}/${b.dataset.c}`, { method: 'POST' }); payments(el);
  }));
}

async function plans(el) {
  const list = await api('/api/admin/plans');
  el.innerHTML = `<h2>Formules d'abonnement</h2>
    <p class="loc">Fixez ici le nom, le prix mensuel (FCFA) et le nombre d'annonces de chaque formule. Les prix par défaut sont des exemples à modifier.</p>
    <div class="plans">${list.map(p => `
      <form class="plan stack" data-plan="${esc(p.id)}">
        <label>Nom<input name="name" value="${esc(p.name)}" required maxlength="40"></label>
        <label>Prix par mois (FCFA)<input name="price" type="number" min="0" step="500" value="${p.price}" required></label>
        <label>Annonces autorisées<input name="max_listings" type="number" min="1" max="9999" value="${p.max_listings}" required></label>
        <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Formule proposée aux clients</label>
        <button type="submit">Enregistrer</button><div class="fb"></div>
      </form>`).join('')}</div>`;
  $$('form[data-plan]', el).forEach(f => f.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(f);
    try {
      await api(`/api/admin/plans/${f.dataset.plan}`, { method: 'PUT', json: { name: fd.get('name'), price: fd.get('price'), max_listings: fd.get('max_listings'), active: fd.get('active') === 'on' } });
      flash($('.fb', f), 'Enregistré');
    } catch (err) { flash($('.fb', f), err.message, 'err'); }
  }));
}

async function site(el) {
  const s = await api('/api/admin/site');
  let sections = s.sections.map(x => ({ ...x }));
  let heroId = s.settings.hero_photo_id || '';
  const draw = () => {
    el.innerHTML = `
      <h2>Textes, structure et photos</h2>
      <p class="loc">Modifiez les textes affichés sur le site (texte simple, sans mise en forme) et l'ordre des blocs de la page d'accueil.</p>
      <form id="site-form" class="stack">
        <h3>Photo du bandeau d'accueil</h3>
        <div class="hero-pick">
          ${heroId ? `<img class="hero-prev" src="/api/photos/${esc(heroId)}" alt="Photo du bandeau">` : '<div class="noimg">Aucune photo (fond vert uni)</div>'}
          <div><input type="file" id="hero-file" accept="image/jpeg,image/png,image/webp">
          ${heroId ? '<button type="button" class="small danger" id="hero-rm">Retirer la photo</button>' : ''}</div>
        </div>

        <h3>Structure de la page d'accueil</h3>
        <p class="loc">Utilisez les flèches pour changer l'ordre et la case pour afficher ou masquer un bloc.</p>
        <ol class="sections">${sections.map((x, i) => `
          <li><label class="check"><input type="checkbox" data-vis="${i}" ${x.visible ? 'checked' : ''}> ${esc(s.section_labels[x.id])}</label>
          <span><button type="button" class="small" data-up="${i}" aria-label="Monter" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="small" data-down="${i}" aria-label="Descendre" ${i === sections.length - 1 ? 'disabled' : ''}>▼</button></span></li>`).join('')}</ol>

        <h3>Textes du site</h3>
        ${Object.keys(s.texts).map(k => `<label>${esc(s.text_labels[k] || k)}<textarea name="t_${esc(k)}" rows="2" maxlength="400">${esc(s.texts[k])}</textarea></label>`).join('')}

        <h3>Paiement des abonnements</h3>
        <div class="two-col">
          <label>Numéro Airtel Money de réception<input name="airtel_number" value="${esc(s.settings.airtel_number)}" placeholder="+241 …"></label>
          <label>Nom affiché du bénéficiaire<input name="merchant_name" value="${esc(s.settings.merchant_name)}" maxlength="60"></label>
        </div>
        <button type="submit">Enregistrer les modifications</button>
        <div id="sfb"></div>
      </form>`;
    $$('[data-up]', el).forEach(b => b.addEventListener('click', () => { keepTexts(); const i = +b.dataset.up; [sections[i - 1], sections[i]] = [sections[i], sections[i - 1]]; draw(); }));
    $$('[data-down]', el).forEach(b => b.addEventListener('click', () => { keepTexts(); const i = +b.dataset.down; [sections[i + 1], sections[i]] = [sections[i], sections[i + 1]]; draw(); }));
    $$('[data-vis]', el).forEach(c => c.addEventListener('change', () => { sections[+c.dataset.vis].visible = c.checked; }));
    $('#hero-file').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      try { flash($('#sfb'), 'Envoi de la photo…'); keepTexts(); heroId = await uploadPhotoFile(f); draw(); }
      catch (err) { flash($('#sfb'), err.message, 'err'); }
    });
    const rm = $('#hero-rm');
    if (rm) rm.addEventListener('click', () => { keepTexts(); heroId = ''; draw(); });
    $('#site-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const texts = {};
      Object.keys(s.texts).forEach(k => { texts[k] = fd.get('t_' + k); });
      try {
        await api('/api/admin/site', { method: 'PUT', json: {
          texts, sections, settings: { airtel_number: fd.get('airtel_number'), merchant_name: fd.get('merchant_name'), hero_photo_id: heroId } } });
        flash($('#sfb'), 'Modifications enregistrées. Rechargez la page d\'accueil pour les voir.');
      } catch (err) { flash($('#sfb'), err.message, 'err'); }
    });
  };
  // conserve les textes saisis quand on réordonne ou change la photo
  const keepTexts = () => {
    const f = $('#site-form');
    if (!f) return;
    const fd = new FormData(f);
    Object.keys(s.texts).forEach(k => { s.texts[k] = fd.get('t_' + k); });
    s.settings.airtel_number = fd.get('airtel_number'); s.settings.merchant_name = fd.get('merchant_name');
  };
  draw();
}

async function bookings(el) {
  const list = await api('/api/admin/booking-requests');
  el.innerHTML = `<h2>Demandes de réservation (hôtels et lodges)</h2>` + (list.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Client</th><th>Téléphone</th><th>Hébergement</th><th>Séjour</th><th>Total</th></tr></thead><tbody>
    ${list.map(r => `<tr><td>${date(r.created_at)}</td><td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${esc(r.stay_id)}</td>
      <td>${esc(r.check_in)} → ${esc(r.check_out)} (${r.nights} nuit(s), ${r.guests} pers.)</td><td>${fcfa(r.total)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="loc">Aucune demande.</p>');
}

async function start() {
  me = await initNav('/admin.html');
  if (!me || me.role !== 'admin') {
    if (me) { app.innerHTML = '<div class="card-box"><h1>Accès refusé</h1><p>Ce compte n\'est pas administrateur.</p></div>'; return; }
    await renderLogin(); return;
  }
  renderShell();
}
start();
