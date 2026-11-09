const app = $('#app');
let me = null, options = null, geoLoaded = false;
let photoIds = [], originalPhotoIds = [], editingId = null;

// ---------- Connexion / inscription ----------
function renderAuth(mode = 'login') {
  app.innerHTML = `
    <div class="card-box">
      <div class="switch two" role="tablist">
        <button type="button" data-mode="login" class="${mode === 'login' ? 'on' : ''}" role="tab">Connexion</button>
        <button type="button" data-mode="register" class="${mode === 'register' ? 'on' : ''}" role="tab">Créer un compte</button>
      </div>
      <h1>${mode === 'login' ? 'Connexion' : 'Créer un compte propriétaire'}</h1>
      <p class="loc">${mode === 'login' ? 'Accédez à vos annonces et à votre abonnement.' : 'Publiez vos maisons, studios et chambres à louer. La formule gratuite permet une annonce.'}</p>
      <form id="auth" class="stack">
        ${mode === 'register' ? `
          <label>Nom complet<input name="name" autocomplete="name" required minlength="2"></label>
          <label>Téléphone<input name="phone" type="tel" autocomplete="tel" placeholder="+241 …"></label>` : ''}
        <label>Adresse e-mail<input name="email" type="email" autocomplete="email" required></label>
        <label>Mot de passe${mode === 'register' ? ' (8 caractères minimum)' : ''}
          <input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required minlength="${mode === 'register' ? 8 : 1}"></label>
        <button type="submit">${mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
        <div id="fb"></div>
        ${mode === 'login' ? '<p class="loc"><a href="/contact.html?sujet=mdp">Mot de passe oublié ?</a></p>' : ''}
      </form>
    </div>`;
  $$('[data-mode]').forEach(b => b.addEventListener('click', () => renderAuth(b.dataset.mode)));
  $('#auth').addEventListener('submit', async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      await api(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { json: body });
      await start();
    } catch (err) { flash($('#fb'), err.message, 'err'); }
  });
}

// ---------- Nouveau mot de passe (lien fourni par l'administrateur) ----------
function renderReset(token) {
  app.innerHTML = `
    <div class="card-box">
      <h1>Nouveau mot de passe</h1>
      <p class="loc">Choisissez un nouveau mot de passe (8 caractères minimum). Ce lien ne sert qu'une fois.</p>
      <form id="reset" class="stack">
        <label>Nouveau mot de passe<input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
        <button type="submit">Enregistrer</button>
        <div id="fb"></div>
      </form>
    </div>`;
  $('#reset').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/auth/reset', { json: { token, password: e.target.password.value } });
      history.replaceState(null, '', '/compte.html');
      renderAuth('login');
      flash($('#fb'), 'Mot de passe modifié. Vous pouvez vous connecter.', 'ok');
    } catch (err) { flash($('#fb'), err.message, 'err'); }
  });
}

// ---------- Tableau de bord ----------
// Bandeau de message visible en haut de page (succès ou erreur)
let pending = null;
function notice(msg, kind = 'ok') {
  let el = document.getElementById('notice');
  if (!el) {
    el = document.createElement('div'); el.id = 'notice'; el.className = 'notice'; el.setAttribute('role', 'alert');
    document.body.appendChild(el);
  }
  el.className = 'notice ' + kind;
  el.innerHTML = `<span>${msg}</span><button type="button" aria-label="Fermer">✕</button>`;
  el.querySelector('button').onclick = () => el.remove();
  clearTimeout(el._t); el._t = setTimeout(() => el.remove(), kind === 'ok' ? 8000 : 15000);
}
const safe = fn => async (...a) => { try { await fn(...a); } catch (err) { notice(esc(err.message || 'Une erreur est survenue. Réessayez.'), 'err'); } };

async function renderDashboard() {
  const [sub, listings, plans] = await Promise.all([
    api('/api/my/subscription'), api('/api/my/listings'), api('/api/plans')
  ]);
  const p = sub.plan;
  app.innerHTML = `
    <div class="head-row">
      <div><h1>Bonjour ${esc(me.name)}</h1><p class="loc">${esc(me.email)}</p></div>
      <button type="button" id="logout" class="ghost dark">Se déconnecter</button>
    </div>

    <section class="card-box" id="sub-box">
      <h2>Mon abonnement</h2>
      <p>Formule actuelle : <strong>${esc(p.name)}</strong> · ${sub.used} / ${p.maxListings >= 999 ? 'illimité' : p.maxListings} annonce(s) utilisée(s)
        ${p.expiresAt ? `· valable jusqu'au ${new Date(p.expiresAt).toLocaleDateString('fr-FR')}` : ''}</p>
      <div class="plans">
        ${plans.map(pl => `
          <div class="plan ${pl.id === p.planId ? 'current' : ''}">
            <h3>${esc(pl.name)}</h3>
            <div class="price big">${pl.price ? fcfa(pl.price) + '<small> / mois</small>' : 'Gratuit'}</div>
            <p class="loc">${pl.max_listings >= 999 ? 'Annonces illimitées' : pl.max_listings + ' annonce' + (pl.max_listings > 1 ? 's' : '')}</p>
            ${pl.id === p.planId ? '<span class="badge">Formule actuelle</span>'
              : pl.price > 0 ? `<button type="button" data-plan="${esc(pl.id)}">Choisir</button>` : ''}
          </div>`).join('')}
      </div>
      <div id="pay-panel"></div>
      ${sub.payments.length ? `<h3>Mes paiements</h3>
        <div class="table-wrap"><table><thead><tr><th>Date</th><th>Formule</th><th>Montant</th><th>Référence</th><th>État</th><th></th></tr></thead><tbody>
        ${sub.payments.map(x => `<tr><td>${new Date(x.created_at).toLocaleDateString('fr-FR')}</td><td>${esc(x.plan_name)}</td><td>${fcfa(x.amount)}</td><td>${esc(x.reference)}</td>
          <td><span class="badge ${esc(x.status)}">${{ pending: 'À payer', submitted: 'En vérification', confirmed: 'Confirmé', rejected: 'Refusé' }[x.status] || esc(x.status)}</span></td>
          <td>${x.status === 'pending' ? `<button type="button" class="small" data-pay="${esc(x.id)}" data-ref="${esc(x.reference)}" data-amount="${x.amount}">Saisir la référence</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
    </section>

    <section class="card-box">
      <div class="head-row" id="mine"><h2>Mes annonces</h2><button type="button" id="new-listing">Nouvelle annonce</button></div>
      <div id="form-zone"></div>
      ${listings.length ? `<div class="my-list">${listings.map(l => `
        <div class="my-item">
          <div class="my-thumb">${l.photos[0] ? `<img src="/api/photos/${esc(l.photos[0])}" alt="">` : '<span>Pas de photo</span>'}</div>
          <div class="my-info">
            <strong>${esc(l.title)}</strong>
            <span class="loc">${esc(CATEGORY_LABELS[l.category] || l.category)} · ${esc(l.area)} · ${fcfa(l.price)} / ${esc(l.period)}</span>
            <span class="badge ${l.status}">${l.status === 'published' ? 'Publiée' : 'Masquée'}</span>
          </div>
          <div class="my-actions">
            <a class="btn small alt" href="/annonce.html?id=${esc(l.id)}">Voir</a>
            <button type="button" class="small" data-edit="${esc(l.id)}">Modifier</button>
            <button type="button" class="small ghost dark" data-toggle="${esc(l.id)}" data-status="${l.status === 'published' ? 'hidden' : 'published'}">${l.status === 'published' ? 'Masquer' : 'Publier'}</button>
            <button type="button" class="small danger" data-del="${esc(l.id)}">Supprimer</button>
          </div>
        </div>`).join('')}</div>` : '<p class="loc">Vous n\'avez pas encore d\'annonce.</p>'}
    </section>`;

  $('#logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); me = null; await start(); });
  $('#new-listing').addEventListener('click', () => openForm(null));
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => openForm(listings.find(l => l.id === b.dataset.edit))));
  $$('[data-toggle]').forEach(b => b.addEventListener('click', safe(async () => {
    b.disabled = true;
    await api(`/api/my/listings/${b.dataset.toggle}/status`, { json: { status: b.dataset.status } });
    await renderDashboard();
    notice(b.dataset.status === 'published' ? '✅ Annonce publiée : elle est visible sur le site.' : 'Annonce masquée : elle n\'est plus visible sur le site.');
  })));
  $$('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer définitivement cette annonce et ses photos ?')) return;
    try { await api(`/api/my/listings/${b.dataset.del}`, { method: 'DELETE' }); await renderDashboard(); notice('Annonce supprimée.'); }
    catch (err) { notice(esc(err.message), 'err'); }
  }));
  $$('[data-plan]').forEach(b => b.addEventListener('click', () => checkout(b.dataset.plan)));
  $$('[data-pay]').forEach(b => b.addEventListener('click', () => showPayPanel({ id: b.dataset.pay, reference: b.dataset.ref, amount: Number(b.dataset.amount), manual: true })));
}

// ---------- Paiement ----------
async function checkout(planId) {
  const panel = $('#pay-panel');
  try {
    const r = await api('/api/my/checkout', { json: { planId, method: 'airtel_money' } });
    if (r.redirectUrl) { location.href = r.redirectUrl; return; }
    showPayPanel(r);
  } catch (err) { flash(panel, err.message, 'err'); }
}

async function showPayPanel(r) {
  let site = null;
  try { site = await api('/api/site'); } catch { /* ignoré */ }
  const panel = $('#pay-panel');
  panel.innerHTML = `
    <div class="pay-box">
      <h3>Payer ${fcfa(r.amount)}</h3>
      <fieldset class="methods"><legend>Moyen de paiement</legend>
        <label><input type="radio" name="m" checked> Airtel Money</label>
        <label class="off"><input type="radio" name="m" disabled> Carte bancaire <small>(bientôt disponible)</small></label>
      </fieldset>
      <ol>
        <li>${r.airtelNumber ? `Envoyez <strong>${fcfa(r.amount)}</strong> par Airtel Money au <strong>${esc(r.airtelNumber)}</strong> (${esc(r.merchantName || '')}).`
          : 'Le numéro Airtel Money de paiement vous sera communiqué par l\'administrateur du site.'}</li>
        <li>Indiquez <strong>${esc(r.reference)}</strong> comme motif si possible.</li>
        <li>Saisissez ci-dessous la référence de la transaction reçue par SMS.</li>
      </ol>
      <p class="loc">${esc(r.instructions || (site && site.texts.payment_instructions) || '')}</p>
      <form id="proof" class="stack">
        <label>Référence de la transaction<input name="txnRef" required minlength="4" maxlength="60" placeholder="Ex. MP240101.1234.A12345"></label>
        <button type="submit">J'ai payé</button>
        <div id="pfb"></div>
      </form>
    </div>`;
  panel.scrollIntoView({ behavior: 'smooth' });
  $('#proof').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api(`/api/my/payments/${r.id}/proof`, { json: { txnRef: new FormData(e.target).get('txnRef') } });
      flash($('#pfb'), 'Merci ! Votre paiement est en cours de vérification. Votre formule sera activée dès sa confirmation.');
      setTimeout(renderDashboard, 2500);
    } catch (err) { flash($('#pfb'), err.message, 'err'); }
  });
}

// ---------- Formulaire d'annonce + photos ----------
async function openForm(l) {
  editingId = l ? l.id : null;
  photoIds = l ? [...l.photos] : [];
  originalPhotoIds = [...photoIds];
  if (!options) options = await api('/api/options');
  const zone = $('#form-zone');
  zone.innerHTML = `
    <form id="listing" class="stack form-box" novalidate>
      <h3>${l ? 'Modifier l\'annonce' : 'Nouvelle annonce'}</h3>
      <label>Titre de l'annonce<input name="title" required minlength="5" maxlength="120" placeholder="Ex. Studio meublé climatisé à Glass"></label>
      <div class="two-col">
        <label>Type de bien<select name="category" required>${options.categories.map(c => `<option value="${c}">${esc(CATEGORY_LABELS[c] || c)}</option>`).join('')}</select></label>
        <label>Quartier<select name="neighborhood" id="f-nb" required></select></label>
      </div>
      <div class="two-col">
        <label>Prix (FCFA)<input name="price" type="number" min="0" step="500" inputmode="numeric" required></label>
        <label>Par<select name="period"><option value="mois">mois</option><option value="nuit">nuit</option></select></label>
      </div>
      <div class="two-col">
        <label>Chambres<input name="bedrooms" type="number" min="0" max="20" value="1" inputmode="numeric"></label>
        <label>Salles de bain<input name="bathrooms" type="number" min="0" max="20" value="1" inputmode="numeric"></label>
      </div>
      <label>Description<textarea name="description" rows="4" maxlength="2000" placeholder="État du logement, étage, proximité, conditions de location…"></textarea></label>
      <fieldset class="methods"><legend>Équipements</legend>
        ${options.amenities.map(a => `<label><input type="checkbox" name="amenities" value="${esc(a)}"> ${esc(a)}</label>`).join('')}
      </fieldset>
      <div class="two-col">
        <label>Téléphone <small>(obligatoire si pas de WhatsApp)</small><input name="phone" type="tel" placeholder="+241 …"></label>
        <label>WhatsApp avec l'indicatif <small>(obligatoire si pas de téléphone)</small><input name="whatsapp" type="tel" placeholder="24106…"></label>
      </div>
      <div>
        <label>Photos (8 maximum)
          <input type="file" id="files" accept="image/jpeg,image/png,image/webp" multiple></label>
        <p class="loc">La première photo est la photo principale. Les photos sont réduites automatiquement.</p>
        <div id="photo-grid" class="photo-grid"></div>
      </div>
      <div class="actions">
        <button type="submit">${l ? 'Enregistrer' : 'Publier l\'annonce'}</button>
        <button type="button" class="ghost dark" id="cancel">Annuler</button>
      </div>
      <div id="lfb"></div>
    </form>`;
  const f = $('#listing');
  await fillNeighborhoods($('#f-nb'), 'Choisir un quartier');
  if (l) {
    f.title.value = l.title; f.category.value = l.category; f.neighborhood.value = l.neighborhood;
    f.price.value = l.price; f.period.value = l.period; f.bedrooms.value = l.bedrooms; f.bathrooms.value = l.bathrooms;
    f.description.value = l.description || ''; f.phone.value = l.phone || ''; f.whatsapp.value = l.whatsapp || '';
    $$('input[name=amenities]', f).forEach(c => { c.checked = l.amenities.includes(c.value); });
  } else {
    f.phone.value = me.phone || '';
  }
  renderPhotos();
  zone.scrollIntoView({ behavior: 'smooth' });

  $('#cancel').addEventListener('click', cleanupAndClose);
  $('#files').addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const file of files) {
      if (photoIds.length >= 8) { flash($('#lfb'), 'Maximum 8 photos', 'err'); break; }
      try {
        flash($('#lfb'), 'Envoi de la photo…');
        photoIds.push(await uploadPhotoFile(file));
        renderPhotos(); flash($('#lfb'), '');
      } catch (err) { flash($('#lfb'), err.message, 'err'); }
    }
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]');
    if (!f.checkValidity()) {
      const bad = [...f.querySelectorAll(':invalid')].map(x => (x.closest('label') ? x.closest('label').firstChild.textContent : x.name).trim()).filter(Boolean);
      const first = f.querySelector(':invalid');
      notice('Complétez ces champs avant de publier : <strong>' + esc(bad.join(', ')) + '</strong>.', 'err');
      flash($('#lfb'), 'Champs à compléter : ' + bad.join(', '), 'err');
      if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.focus(); }
      return;
    }
    if (!f.phone.value.trim() && !f.whatsapp.value.trim()) {
      notice('Indiquez <strong>un numéro de téléphone ou de WhatsApp</strong> : les visiteurs en ont besoin pour vous contacter.', 'err');
      flash($('#lfb'), 'Indiquez un téléphone ou un numéro WhatsApp', 'err');
      f.phone.scrollIntoView({ behavior: 'smooth', block: 'center' }); f.phone.focus();
      return;
    }
    const fd = new FormData(f);
    const body = Object.fromEntries(fd);
    body.amenities = fd.getAll('amenities');
    body.photoIds = photoIds;
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Publication en cours…';
    try {
      const wasEdit = !!editingId;
      if (editingId) await api(`/api/my/listings/${editingId}`, { method: 'PUT', json: body });
      else await api('/api/my/listings', { json: body });
      await renderDashboard();
      notice(wasEdit ? '✅ Annonce enregistrée.' : '✅ Annonce publiée ! Elle est visible tout de suite sur le site (voir « Mes annonces »).');
      const lst = document.getElementById('mine'); if (lst) lst.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      btn.disabled = false; btn.textContent = label;
      flash($('#lfb'), err.message, 'err');
      notice(esc(err.message), 'err');
      if (err.data && err.data.code === 'limit') $('#sub-box').scrollIntoView({ behavior: 'smooth' });
    }
  });
}

function renderPhotos() {
  const grid = $('#photo-grid');
  if (!grid) return;
  grid.innerHTML = photoIds.map((id, i) => `
    <div class="ph">
      <img src="/api/photos/${esc(id)}" alt="Photo ${i + 1}">
      ${i === 0 ? '<span class="main-tag">Principale</span>' : ''}
      <div class="ph-actions">
        <button type="button" class="small" data-left="${i}" aria-label="Déplacer vers la gauche" ${i === 0 ? 'disabled' : ''}>◀</button>
        <button type="button" class="small" data-right="${i}" aria-label="Déplacer vers la droite" ${i === photoIds.length - 1 ? 'disabled' : ''}>▶</button>
        <button type="button" class="small danger" data-rm="${i}" aria-label="Retirer la photo">✕</button>
      </div>
    </div>`).join('');
  $$('[data-left]', grid).forEach(b => b.addEventListener('click', () => { const i = +b.dataset.left; [photoIds[i - 1], photoIds[i]] = [photoIds[i], photoIds[i - 1]]; renderPhotos(); }));
  $$('[data-right]', grid).forEach(b => b.addEventListener('click', () => { const i = +b.dataset.right; [photoIds[i + 1], photoIds[i]] = [photoIds[i], photoIds[i + 1]]; renderPhotos(); }));
  $$('[data-rm]', grid).forEach(b => b.addEventListener('click', async () => {
    const id = photoIds.splice(+b.dataset.rm, 1)[0];
    if (!originalPhotoIds.includes(id)) { try { await api('/api/photos/' + id, { method: 'DELETE' }); } catch { /* ignoré */ } }
    renderPhotos();
  }));
}

async function cleanupAndClose() {
  // supprime les photos envoyées mais non enregistrées
  for (const id of photoIds.filter(x => !originalPhotoIds.includes(x))) { try { await api('/api/photos/' + id, { method: 'DELETE' }); } catch { /* ignoré */ } }
  $('#form-zone').innerHTML = '';
}

async function start() {
  me = await initNav('/compte.html');
  applySite();
  const qs = new URLSearchParams(location.search);
  const rt = qs.get('reset');
  if (rt && !me) { renderReset(rt); return; }
  if (!me) { renderAuth('login'); return; }
  await renderDashboard();
  const ref = qs.get('ref');
  if (qs.get('paiement') && /^GS-[A-F0-9]{8}$/.test(ref || '')) {
    history.replaceState(null, '', '/compte.html');
    notice('Vérification de votre paiement…', 'ok');
    for (let i = 0; i < 6; i++) {
      try {
        const r = await api('/api/my/payments/' + ref + '/check');
        if (r.status === 'confirmed') { notice('Paiement reçu : votre formule est activée. Merci !', 'ok'); await renderDashboard(); return; }
        if (r.status === 'rejected') { notice('Le paiement a échoué ou a été annulé. Vous pouvez réessayer.', 'err'); await renderDashboard(); return; }
      } catch { /* on réessaie */ }
      await new Promise(r => setTimeout(r, 4000));
    }
    notice('Paiement en attente de confirmation. Votre formule sera activée dès réception.', 'ok');
  }
}
start();
