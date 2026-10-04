/**
 * app.js — Interface : routeur, vues et gestion des événements.
 * Les calculs vivent dans les autres modules ; ce fichier ne fait qu'afficher et relayer.
 */
(function () {
  const U = FD.utils, C = FD.calc, T = FD.tracking, N = FD.nutrition, F = FD.foods;
  const esc = U.esc;

  let S = FD.storage.load();

  const today = () => U.todayISO();
  function defaultMeal() {
    const h = new Date().getHours();
    return h < 10 ? 'petitdej' : h < 15 ? 'dejeuner' : h < 18 ? 'collation' : 'diner';
  }

  // État d'interface (non persisté)
  const ui = {
    route: 'tableau', jDate: today(), query: '', results: [], pick: null, variantId: null, qty: '100', unit: 'g', meal: defaultMeal(),
    tab: 'recettes', off: { query: '', loading: false, results: [], error: null }, subEntry: null, trackDate: today(),
    sug: [], recipe: null, rIngs: null, rIngsFor: null, rServings: 1, rMeal: null, rQuery: '', rFilterMeal: '', editor: null, edQuery: '', edResults: [],
    rCollection: '', rCat: '', recipePhotoUrls: [],
    ciqLabel: 'CIQUAL', ciqManual: null, ciqQuery: '', scan: { msg: null, error: null, loading: false }, photoView: 'face', photoUrls: []
  };

  /* ------------------------------------------------------------------ */
  /* Utilitaires d'affichage                                              */
  /* ------------------------------------------------------------------ */

  /** Enregistre localement ; chaque modification est horodatée et programmée pour la synchro. */
  function save(opts) {
    if (!(opts && opts.keepStamp)) S.meta.updatedAt = new Date().toISOString();
    if (!FD.storage.save(S)) toast('Enregistrement impossible : le stockage du navigateur est plein ou bloqué.');
    if (!(opts && opts.keepStamp)) schedulePush();
  }
  function commit(msg) { save(); render(); if (msg) toast(msg); }

  /* ---------------- Synchronisation entre appareils ---------------- */
  const syncOK = () => FD.sync && FD.sync.enabled() && !(FD.api && FD.api.blocked());
  let pushTimer = null, syncing = false, lastPullAt = 0;
  function schedulePush() {
    if (!syncOK()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      FD.sync.push(S).then(() => { if (ui.route === 'parametres') render(); })
        .catch((e) => { FD.sync.setCfg({ lastError: e.message }); });
    }, 3000);
  }

  /** Compare avec la version en ligne et applique la plus récente (demande en cas de conflit). */
  async function syncNow(manual) {
    if (!syncOK() || syncing) return;
    syncing = true;
    try {
      const remote = await FD.sync.pull();
      const c = FD.sync.cfg();
      const localAt = S.meta.updatedAt || '', remoteAt = remote && remote.meta && remote.meta.updatedAt || '';
      const lastSync = c.lastSync || '';
      if (!remote || !remoteAt) { await FD.sync.push(S); if (manual) toast('Données envoyées.'); }
      else if (remoteAt === localAt) { FD.sync.setCfg({ lastSync: localAt, lastSyncAt: new Date().toISOString(), lastError: null }); if (manual) toast('Déjà à jour.'); }
      else if (remoteAt > localAt && localAt <= lastSync) adoptRemote(remote, 'Données mises à jour depuis ton autre appareil.');
      else if (localAt > remoteAt && remoteAt <= lastSync) { await FD.sync.push(S); if (manual) toast('Données envoyées.'); }
      else {
        const takeRemote = confirm('Tes deux appareils ont été modifiés depuis la dernière synchronisation.\n\nOK : garder la version de l\'autre appareil (modifiée le ' + new Date(remoteAt).toLocaleString('fr-FR') + ').\nAnnuler : garder celle de cet appareil (modifiée le ' + new Date(localAt).toLocaleString('fr-FR') + ').');
        if (takeRemote) adoptRemote(remote, 'Version de l\'autre appareil récupérée.');
        else { await FD.sync.push(S); toast('Version de cet appareil envoyée.'); }
      }
      lastPullAt = Date.now();
    } catch (e) {
      FD.sync.setCfg({ lastError: e.message });
      if (manual) toast(e.message);
    } finally { syncing = false; if (ui.route === 'parametres') render(); schedulePhotoSync(1500); }
  }

  /* ---- Photos ---- */
  let photoTimer = null, photoSyncing = false;
  function tombstone(key) { S.meta.photoTombstones = S.meta.photoTombstones || {}; S.meta.photoTombstones[key] = new Date().toISOString(); save(); }
  function schedulePhotoSync(delay) { if (!syncOK()) return; clearTimeout(photoTimer); photoTimer = setTimeout(() => syncPhotosNow(false), delay || 5000); }
  async function syncPhotosNow(manual) {
    if (!syncOK() || photoSyncing) return;
    photoSyncing = true;
    const status = (t) => { ui.photoSyncMsg = t; const el = document.getElementById('photo-sync-status'); if (el) el.textContent = t; };
    try {
      const r = await FD.sync.syncPhotos(S.meta.photoTombstones || {}, status);
      if (r.down || r.del) { if (ui.route === 'recettes' || ui.route === 'journal' || ui.route === 'tableau') fillRecipePhotos(); if (ui.route === 'suivi') fillPhotos(); }
      status(r.up || r.down || r.del ? 'Photos : ' + r.up + ' envoyée(s), ' + r.down + ' reçue(s)' + (r.del ? ', ' + r.del + ' supprimée(s)' : '') + '.' : 'Photos à jour.');
      if (manual) toast(ui.photoSyncMsg);
    } catch (e) { status('Photos : ' + e.message); if (manual) toast(e.message); }
    finally { photoSyncing = false; }
  }

  function adoptRemote(remote, msg) {
    S = FD.storage.parseImport(JSON.stringify(remote));
    save({ keepStamp: true });
    FD.sync.setCfg({ lastSync: S.meta.updatedAt, lastSyncAt: new Date().toISOString(), lastError: null });
    applyTheme(); render(); toast(msg);
  }

  function syncHTML() {
    const c = FD.sync.cfg();
    let h = '<section class="card"><h2>Synchronisation entre appareils</h2>';
    if (FD.api.blocked()) return h + '<div class="alert warn">Cette version en ligne ne peut pas se connecter à GitHub. Active la synchronisation depuis ton site GitHub Pages (ou la version téléchargée).</div></section>';
    if (FD.sync.enabled()) {
      h += '<p>Synchronisation <strong>active</strong> sur cet appareil. Tes données sont chiffrées avec ta phrase secrète avant d\'être envoyées dans un gist privé de ton compte GitHub.</p>' +
        '<p class="small muted">Dernière synchro : ' + (c.lastSyncAt ? esc(new Date(c.lastSyncAt).toLocaleString('fr-FR')) : 'jamais') + (c.lastError ? ' · <span style="color:var(--warn)">' + esc(c.lastError) + '</span>' : '') + '</p>' +
        '<div class="inline"><button class="btn primary" data-action="sync-now">Synchroniser maintenant</button><button class="btn" data-action="sync-photos">Synchroniser les photos</button><button class="btn ghost danger" data-action="sync-off">Désactiver sur cet appareil</button></div>' +
        '<p class="small" id="photo-sync-status">' + esc(ui.photoSyncMsg || (c.lastPhotoSyncAt ? 'Photos synchronisées le ' + new Date(c.lastPhotoSyncAt).toLocaleString('fr-FR') + '.' : 'Photos pas encore synchronisées.')) + '</p>' +
        '<p class="small muted">Les données partent automatiquement quelques secondes après chaque saisie ; l\'app vérifie l\'autre appareil à l\'ouverture et quand tu y reviens. Les photos (recettes et progression) suivent aussi, chiffrées, dans un second gist ; la première synchro des photos peut prendre une minute.</p>';
    } else {
      h += '<p>Pour retrouver les mêmes données sur ton Mac et ton téléphone, l\'app peut les stocker <strong>chiffrées</strong> dans un gist privé de ton compte GitHub.</p>' +
        '<ol class="small" style="margin:0;padding-left:20px"><li>Crée un jeton GitHub limité aux gists : <a href="https://github.com/settings/tokens/new?scopes=gist&description=FitDiet%20Coach" target="_blank" rel="noopener">ouvrir la page GitHub</a> (case « gist » déjà cochée, choisis une expiration), puis « Generate token » et copie-le.</li>' +
        '<li>Choisis une phrase secrète (8 caractères minimum) : elle chiffre tes données. <strong>Note-la</strong>, elle n\'est récupérable nulle part.</li>' +
        '<li>Fais la même chose sur ton autre appareil avec <strong>le même jeton et la même phrase</strong>.</li></ol>' +
        '<form class="form-grid" data-form="sync" style="margin-top:8px"><label>Jeton GitHub<input type="password" name="token" autocomplete="off" placeholder="ghp_…" required></label>' +
        '<label>Phrase secrète<input type="password" name="pass" autocomplete="new-password" minlength="8" required></label>' +
        '<div style="align-self:end"><button class="btn primary" type="submit">Activer la synchronisation</button></div></form>';
    }
    return h + '</section>';
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function applyTheme() {
    if (S.settings.theme === 'clair') document.documentElement.setAttribute('data-theme', 'clair');
    else document.documentElement.removeAttribute('data-theme');
  }

  function meter(label, val, target, unit, cls, dec) {
    const pct = target ? (val / target) * 100 : 0;
    const over = pct > 110 && cls !== 'p';
    return '<div class="meter"><div class="between"><span>' + label + '</span><span><strong>' + U.num(val, dec || 0) + '</strong> / ' + U.num(target, dec || 0) + ' ' + unit + '</span></div>' +
      '<div class="track" role="progressbar" aria-label="' + esc(label) + '" aria-valuemin="0" aria-valuemax="' + Math.round(target) + '" aria-valuenow="' + Math.round(val) + '">' +
      '<div class="fill ' + (cls || '') + (over ? ' over' : '') + '" style="width:' + Math.min(100, pct).toFixed(1) + '%"></div></div></div>';
  }

  function sessionOptions(selected) {
    return S.sessionTypes.map((t) => '<option value="' + esc(t.id) + '"' + (t.id === selected ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('');
  }

  function opts(list, selected) {
    return list.map((o) => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(selected) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('');
  }

  function signed(n, dec, unit) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : n < 0 ? '−' : '') + U.num(Math.abs(n), dec) + (unit ? ' ' + unit : '');
  }

  function alertsHTML(list) {
    return list.map((a) => '<div class="alert ' + (a.level === 'danger' ? 'danger' : a.level === 'warn' ? 'warn' : '') + '">' + esc(a.text) + '</div>').join('');
  }

  const legal = '<footer class="legal">Les calculs et recommandations sont des estimations générales et ne constituent pas un diagnostic médical. Cette application ne remplace pas un médecin, un diététicien ou un nutritionniste.</footer>';

  /* ------------------------------------------------------------------ */
  /* Tableau de bord                                                      */
  /* ------------------------------------------------------------------ */

  function vTableau() {
    const iso = today();
    const d = S.days[iso] || {};
    const tg = C.dayTarget(S, iso);
    const tot = T.dayTotals(S, iso);
    const remK = tg.kcal - tot.kcal, remP = tg.p - tot.p;
    let status;
    if (!tot.tracked) status = 'Rien de saisi pour l\'instant. Cible du jour : environ ' + U.kcal(tg.kcal) + ' kcal et ' + tg.p + ' g de protéines.';
    else if (Math.abs(remK) / tg.kcal <= 0.05 && tot.p >= tg.p * 0.95) status = 'Objectif atteint. Journée conforme.';
    else if (remK > 0) status = 'Il te reste environ ' + U.kcal(remK) + ' kcal' + (remP > 0 ? ' et ' + Math.round(remP) + ' g de protéines.' : ', protéines atteintes.');
    else status = 'Environ ' + U.kcal(-remK) + ' kcal au-dessus de la cible du jour. C\'est la moyenne de la semaine qui compte.';

    const wt = FD.trends.weightTrend(S, iso);
    const waist = FD.trends.waistTrend(S, iso);
    const lastW = FD.trends.lastValue(S, 'weight', iso);
    const lastWaist = FD.trends.lastValue(S, 'waist', iso);
    const adh = FD.adherence.stats(S, FD.adherence.windowEnd(S, iso), 7);
    const r = FD.coach.evaluateUserState(S, iso);
    const wb = FD.adherence.weekBudget(S, iso);
    const planned = S.weekPlan[U.weekdayKey(iso)];
    const comp = adh.components;
    const compRow = (lab, v) => v === null ? '' : '<div class="between small"><span>' + lab + '</span><span>' + v + ' %</span></div>';

    return '<div class="container">' +
      '<div class="page-head"><div><h1>Aujourd\'hui</h1><p class="sub">' + esc(U.frDate(iso)) + '</p></div>' +
      '<label style="min-width:220px">Séance du jour<select data-change="day-session" data-date="' + iso + '">' + sessionOptions(d.session || planned) + '</select></label></div>' +

      '<div class="row">' +
        '<section class="card" aria-label="Cible du jour"><div class="card-head"><h2>Cible</h2><span class="badge">' + esc(tg.type.label) + (d.session && d.session !== planned ? ' · modifiée' : '') + '</span></div>' +
          '<div class="inline" style="align-items:baseline"><span class="big-num accent">' + U.num(Math.round(tot.kcal)) + '</span><span class="muted">/ ' + U.kcal(tg.kcal) + ' kcal</span></div>' +
          '<p>' + esc(status) + '</p>' + (function () { let r = null; try { r = (d.foods || []).length && FD.planner.completeDay ? FD.planner.completeDay(S, iso, { top: 1 }) : null; } catch (e) { console.error(e); } return r && r.options.length && r.slots.length >= 1 ? '<p class="small">Idée pour finir la journée : <strong>' + esc(r.options[0].meals.map((m) => m.recipe.name).join(' + ')) + '</strong>.</p><a class="btn" href="#/journal">Voir les combinaisons</a>' : ''; })() +
          '<a class="btn primary" href="#/journal">Ajouter un repas</a></section>' +
        '<section class="card wide" aria-label="Macronutriments">' +
          meter('Protéines', tot.p, tg.p, 'g', 'p') + meter('Glucides', tot.g, tg.g, 'g') + meter('Lipides', tot.l, tg.l, 'g', 'l') + meter('Fibres', tot.fib, tg.fib, 'g', 'p') +
          '<div class="divider grid-2">' + meter('Pas', d.steps || 0, S.profile.stepsGoal, '') + meter('Eau (repère)', d.water || 0, tg.water, 'L', 'p', 1) + '</div>' +
        '</section>' +
      '</div>' +

      '<form class="card" data-form="quick" aria-label="Saisie rapide"><div class="card-head"><h2>Saisie rapide</h2><span class="muted small">Pèse-toi le matin, à jeun, après être passé aux toilettes.</span></div>' +
        '<div class="form-grid"><label>Poids (kg)<input type="text" inputmode="decimal" name="weight" value="' + (d.weight !== undefined ? U.num(d.weight, 1) : '') + '"></label>' +
        '<label>Pas<input type="number" inputmode="numeric" name="steps" value="' + (d.steps !== undefined ? d.steps : '') + '"></label>' +
        '<label>Eau (L)<input type="text" inputmode="decimal" name="water" value="' + (d.water !== undefined ? U.num(d.water, 1) : '') + '"></label>' +
        '<label class="check" style="align-self:end"><input type="checkbox" name="trainingDone"' + (d.trainingDone ? ' checked' : '') + '>Séance faite</label></div>' +
        '<div><button class="btn primary" type="submit">Enregistrer</button></div></form>' +

      '<div class="row">' +
        '<section class="card" aria-label="Poids"><div class="card-head"><h2>Poids</h2><span class="badge">' + esc(wt.label) + '</span></div>' +
          '<div class="inline" style="align-items:baseline"><span class="big-num">' + (lastW ? U.num(lastW.v, 1) : '—') + '</span><span class="muted">→ ' + U.num(S.profile.targetWeight, 1) + ' kg</span></div>' +
          '<p class="small muted">Moyenne 7 jours : ' + (wt.avg7.avg !== null ? U.num(wt.avg7.avg, 1) + ' kg' : 'pas encore assez de pesées') + (wt.change !== null ? ' · ' + signed(wt.change, 1, 'kg') + ' vs semaine précédente' : '') + '</p></section>' +
        '<section class="card" aria-label="Tour de taille"><div class="card-head"><h2>Tour de taille</h2><span class="badge">' + esc(waist.status === 'inconnu' ? 'tendance à venir' : waist.status) + '</span></div>' +
          '<div class="inline" style="align-items:baseline"><span class="big-num">' + (lastWaist ? U.num(lastWaist.v, 1) : U.num(S.profile.waist, 1)) + '</span><span class="muted">→ ' + U.num(S.profile.targetWaist, 1) + ' cm</span></div>' +
          '<p class="small muted">' + (waist.delta !== null ? signed(waist.delta, 1, 'cm') + ' en ' + waist.days + ' jours' : 'Mesure une fois par semaine, mêmes conditions.') + '</p></section>' +
        '<section class="card" aria-label="Adhérence"><div class="card-head"><h2>Adhérence</h2><span class="muted small">7 jours</span></div>' +
          '<span class="big-num">' + (adh.score !== null ? adh.score + ' %' : '—') + '</span>' +
          '<div class="stack">' + compRow('Calories', comp.calories) + compRow('Protéines', comp.proteines) + compRow('Pas', comp.pas) + compRow('Entraînement', comp.entrainement) + compRow('Pesées', comp.pesees) + compRow('Sommeil', comp.sommeil) + '</div>' +
          '<p class="small muted">Indicateur de suivi, pas une mesure médicale.</p></section>' +
      '</div>' +

      '<div class="row">' +
        '<section class="card wide" aria-label="Coach"><div class="card-head"><h2>Mon coach</h2><span class="badge ' + (r.confidence.level === 'faible' ? 'warn' : '') + '">Confiance ' + esc(r.confidence.label.toLowerCase()) + '</span></div>' +
          '<p class="mid-num">' + esc(r.title) + '</p><p>' + esc(r.summary) + '</p><div><a class="btn" href="#/coach">Voir l\'analyse</a></div></section>' +
        '<section class="card" aria-label="Budget de la semaine"><div class="card-head"><h2>Semaine</h2><span class="muted small">depuis lundi</span></div>' +
          '<span class="mid-num">' + U.kcal(wb.budget) + ' kcal</span>' +
          '<p class="small">' + (wb.balance >= 0 ? 'Marge accumulée ≈ ' + U.kcal(wb.balance) + ' kcal sur les jours suivis.' : 'Environ ' + U.kcal(-wb.balance) + ' kcal au-dessus du budget sur les jours suivis : à étaler sur le reste de la semaine si tu veux.') + '</p>' +
          '<div><a class="btn" href="#/semaine">Organiser la semaine</a></div></section>' +
      '</div>' + legal + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Journal                                                              */
  /* ------------------------------------------------------------------ */

  function entryHTML(e) {
    const v = N.entryValues(e);
    const f = e.food;
    let sub = '';
    if (e.free) sub = '<span class="small muted">' + esc(N.FREE_KINDS[e.kind] || 'Saisie libre') + ' · estimation</span>';
    else {
      sub = '<span class="small muted">' + esc(F.qtyLabel(f, e.qty, e.unit)) + (F.isPiece(e.unit) || e.unit === 'portion' ? ' (' + U.num(v.grams) + (f.basis === '100ml' ? ' ml' : ' g') + ')' : '') + ' · ' + esc((F.SOURCES[f.source] || F.SOURCES.demo).short) + '</span>';
      if (f.variable) sub += '<span class="small" style="color:var(--warn)">Valeur indicative — vérifier l\'étiquette du produit</span>';
      if (f.alcohol) sub += '<span class="small muted">Calories incluant l\'alcool (non couvert par les macros)</span>';
    }
    let html = '<div class="entry"><div class="name"><span>' + esc(e.free ? e.name : F.displayName(f)) + '</span>' + sub + '</div>';
    html += e.free ? '<span></span>' : '<label class="sr-only" for="q-' + e.id + '">Quantité</label><input id="q-' + e.id + '" type="text" inputmode="decimal" value="' + (F.isPiece(e.unit) || e.unit === 'portion' ? U.frac(e.qty) : U.num(e.qty, e.qty % 1 ? 1 : 0)) + '" data-change="entry-qty" data-id="' + e.id + '">';
    html += '<span class="vals">' + U.num(v.kcal) + ' kcal · P ' + U.num(v.p) + ' · G ' + U.num(v.g) + ' · L ' + U.num(v.l) + '</span>';
    html += '<span class="inline" style="gap:4px;justify-content:flex-end">' +
      (e.free ? '' : '<button class="btn sm ghost" data-action="entry-sub" data-id="' + e.id + '">Remplacer</button>') +
      '<button class="btn sm ghost danger" data-action="entry-del" data-id="' + e.id + '" aria-label="Supprimer ' + esc(e.free ? e.name : f.base) + '">Supprimer</button></span></div>';
    if (ui.subEntry === e.id && !e.free) {
      const cands = F.all(S).filter((x) => x.cat === f.cat && x.id !== f.id);
      html += '<div class="inline" style="padding:8px 0 12px"><label style="flex:1 1 260px">Remplacer par (même quantité, macros recalculées)<select data-change="entry-sub-select" data-id="' + e.id + '"><option value="">Choisir un aliment…</option>' +
        cands.map((x) => '<option value="' + esc(x.id) + '">' + esc(F.displayName(x)) + ' — ' + U.num(x.kcal) + ' kcal, P ' + U.num(x.p, 1) + ' g /100</option>').join('') + '</select></label>' +
        '<button class="btn sm" data-action="entry-sub" data-id="">Annuler</button></div>';
    }
    return html;
  }

  /** Entrées d'un repas : les recettes ajoutées en une fois sont regroupées (photo, nom, total). */
  function entriesHTML(entries) {
    const done = {};
    return entries.map((e) => {
      if (!e.group) return entryHTML(e);
      const gid = e.group.id;
      if (done[gid]) return '';
      done[gid] = true;
      const items = entries.filter((x) => x.group && x.group.id === gid);
      const tot = N.totals(items);
      const r = e.group.recipeId ? R.byId(S, e.group.recipeId) : null;
      const open = ui.openGroups && ui.openGroups[gid];
      const scale = e.group.scale || 1;
      return '<div class="entry-group"><div class="group-row">' +
        (r ? '<div class="recipe-thumb small-thumb" data-photo="' + esc(r.id) + '" aria-hidden="true">' + FD.recipeArt.svg(S, r) + '</div>' : '<div class="recipe-thumb small-thumb group-icon" aria-hidden="true">≡</div>') +
        '<div class="stack" style="gap:2px;min-width:0;flex:1"><strong>' + esc(e.group.name) + '</strong><span class="small muted">' + esc(e.group.label || '') + ' · ' + items.length + ' ingrédient' + (items.length > 1 ? 's' : '') + '</span>' +
        '<span class="small"><strong>' + U.num(tot.kcal) + ' kcal</strong> · P ' + U.num(tot.p) + ' g · G ' + U.num(tot.g) + ' g · L ' + U.num(tot.l) + ' g</span></div>' +
        '<div class="inline" style="gap:4px;justify-content:flex-end"><label class="sr-only" for="gs-' + gid + '">Portions</label><select id="gs-' + gid + '" data-change="grp-scale" data-id="' + gid + '" style="width:auto;min-height:36px" title="Multiplier la portion">' +
          opts([[0.5, '× ½'], [0.75, '× ¾'], [1, '× 1'], [1.25, '× 1 ¼'], [1.5, '× 1 ½'], [2, '× 2']], [0.5, 0.75, 1, 1.25, 1.5, 2].includes(scale) ? scale : 1) + '</select>' +
          '<button class="btn sm ghost" data-action="grp-toggle" data-id="' + gid + '" aria-expanded="' + !!open + '">' + (open ? 'Masquer' : 'Détail') + '</button>' +
          '<button class="btn sm ghost danger" data-action="grp-del" data-id="' + gid + '" aria-label="Supprimer ' + esc(e.group.name) + '">Supprimer</button></div></div>' +
        (open ? '<div class="group-items">' + items.map(entryHTML).join('') + '</div>' : '') + '</div>';
    }).join('');
  }

  function resultsHTML() {
    if (!ui.query.trim()) return '<p class="small muted">Tape le nom d\'un aliment (ex. riz, poulet, skyr).</p>';
    ui.results = F.search(S, ui.query, 12);
    if (!ui.results.length) return '<p class="small muted">Aucun aliment trouvé. Essaie Open Food Facts ou la saisie libre.</p>';
    return '<div class="results">' + ui.results.map((g, i) => {
      const states = g.variants.map((v) => v.state).filter(Boolean);
      return '<button type="button" data-action="pick" data-idx="' + i + '" aria-pressed="' + (ui.pick && ui.pick.key === g.key) + '"><span>' + esc(g.name) + '</span><span class="small muted">' +
        (states.length > 1 ? 'cru / cuit' : esc(states[0] || '')) + ' · ' + esc((F.SOURCES[g.variants[0].source] || F.SOURCES.demo).short) + '</span></button>';
    }).join('') + '</div>';
  }

  function pickHTML() {
    if (!ui.pick) return '';
    const variants = ui.pick.variants;
    const f = ui.variantId ? variants.find((v) => v.id === ui.variantId) : null;
    let html = '<div class="card tight" style="background:var(--surface-2)"><div class="between"><h3>' + esc(ui.pick.name) + '</h3><button class="btn sm ghost" data-action="cancel-pick">Fermer</button></div>';
    if (variants.length > 1) {
      html += '<div class="stack"><span>' + (ui.unit === 'g' ? esc(U.num(U.parseNum(ui.qty) || 100)) + ' g cru' : 'Cru') + ' ou cuit ?</span><div class="seg" role="group" aria-label="État de l\'aliment">' +
        variants.map((v) => '<button type="button" data-action="variant" data-id="' + esc(v.id) + '" aria-pressed="' + (ui.variantId === v.id) + '">' + esc(v.state || 'standard') + '</button>').join('') + '</div></div>';
    }
    const unitsSrc = f || variants[0];
    html += '<div class="form-grid"><label>Quantité<input type="text" inputmode="decimal" id="pick-qty" value="' + esc(ui.qty) + '" data-change="pick-qty"></label>' +
      '<label>Unité<select data-change="pick-unit">' + opts(F.unitsFor(unitsSrc).map((u) => [u.id, u.label]), ui.unit) + '</select></label>' +
      '<label>Repas<select data-change="pick-meal">' + opts(N.MEALS.map((m) => [m.id, m.label]), ui.meal) + '</select></label></div>';
    if (F.isPiece(ui.unit) || ui.unit === 'portion') {
      const cur = U.parseNum(ui.qty);
      html += '<div class="inline" style="gap:6px" role="group" aria-label="Quantité rapide">' + [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1, '1'], [1.5, '1 ½'], [2, '2']].map((c) =>
        '<button type="button" class="btn sm' + (cur !== null && Math.abs(cur - c[0]) < 0.01 ? ' primary' : '') + '" data-action="qty-chip" data-v="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' +
        '<p class="small muted">Tu peux aussi écrire 1/2, ½ ou 1 1/2 dans la quantité.</p>';
    }
    if (f) {
      const v = F.compute(f, U.parseNum(ui.qty) || 0, ui.unit);
      html += v ? '<p class="small">' + (ui.unit !== 'g' && ui.unit !== 'ml' ? '≈ ' + U.num(v.grams) + (f.basis === '100ml' ? ' ml' : ' g') + ' · ' : '') + '≈ ' + U.num(v.kcal) + ' kcal · P ' + U.num(v.p, 1) + ' g · G ' + U.num(v.g, 1) + ' g · L ' + U.num(v.l, 1) + ' g · fibres ' + U.num(v.fib, 1) + ' g</p>' : '<p class="small" style="color:var(--warn)">Cette unité n\'est pas disponible pour cet aliment.</p>';
      if (f.portionNote && (F.isPiece(ui.unit) || ui.unit === 'portion')) html += '<p class="small muted">Portion type indicative : ajuste en grammes si tu connais le poids.</p>';
      if (f.unitsFrom) html += '<p class="small muted">Poids par pièce : moyenne de la base (« ' + esc(f.unitsFrom) + ' »), l\'étiquette n\'en donne pas.</p>';
      html += '<p class="small muted">' + esc(F.sourceLabel(f)) + ' · valeurs pour ' + (f.basis === '100ml' ? '100 ml' : '100 g') + (f.variable ? ' · valeur indicative — vérifier l\'étiquette du produit' : '') + '</p>';
    } else html += '<p class="small" style="color:var(--warn)">Précise l\'état de l\'aliment : les valeurs crues et cuites sont très différentes.</p>';
    html += '<div><button class="btn primary" data-action="add-food"' + (f ? '' : ' disabled') + '>Ajouter au journal</button></div></div>';
    return html;
  }

  function vJournal() {
    const iso = ui.jDate;
    const d = S.days[iso] || { foods: [] };
    const tg = C.dayTarget(S, iso);
    const tot = T.dayTotals(S, iso);
    const mt = N.mealTargets(tg, S.profile.trainingTime, tg.type.cat !== 'repos');
    const byMeal = N.totalsByMeal(d.foods);
    const planned = S.weekPlan[U.weekdayKey(iso)];

    let meals = N.MEALS.map((m) => {
      const entries = (d.foods || []).filter((e) => e.meal === m.id);
      return '<div class="meal"><div class="meal-head"><h3>' + m.label + '</h3><span class="small muted">' + U.num(byMeal[m.id].kcal) + ' / ≈ ' + U.kcal(mt[m.id].kcal) + ' kcal</span></div>' +
        (mt[m.id].note ? '<span class="small teal">' + esc(mt[m.id].note) + '</span>' : '') +
        (entries.length ? entriesHTML(entries) : '<p class="small muted" style="padding:6px 0">Rien pour l\'instant.</p>') + '</div>';
    }).join('');

    const tabs = [['recettes', 'Recettes'], ['base', 'Base d\'aliments'], ['scan', 'Scanner'], ['off', 'Open Food Facts'], ['libre', 'Saisie libre'], ['types', 'Repas types']];
    let panel = '';
    if (ui.tab === 'base') {
      panel = '<label>Rechercher un aliment<input type="search" id="food-q" autocomplete="off" value="' + esc(ui.query) + '" data-input="q" placeholder="riz, poulet, skyr…"></label><div id="food-results">' + resultsHTML() + '</div>' + pickHTML();
    } else if (ui.tab === 'scan') {
      const cam = FD.scanner.cameraAvailable();
      panel = '<div class="stack">' + (FD.api.blocked() ? '<div class="alert warn"><strong>Indisponible dans cette version en ligne</strong>Cette page hébergée bloque les connexions vers Open Food Facts. Pour chercher ou scanner des produits, utilise la version téléchargée (ouvre index.html) ou héberge l\'app sur ton propre site. En attendant : base d\'aliments, repas types et saisie libre.</div>' : '') +
        (cam ? '<div class="inline"><button class="btn primary" data-action="scan-start">Activer la caméra</button><button class="btn" data-action="scan-stop">Arrêter</button></div>' +
          '<div class="scan-box" id="scan-box" hidden><video id="scan-video" playsinline muted></video><div class="scan-line" aria-hidden="true"></div></div>'
          : '<p class="small muted">Caméra en direct indisponible ici : elle demande une page en https (ou un fichier ouvert sur ordinateur). Photographie le code ou saisis-le.</p>') +
        '<div class="inline"><label class="btn" style="flex-direction:row">Photographier le code-barres<input type="file" accept="image/*" capture="environment" data-change="scan-file" class="sr-only"></label></div>' +
        '<form class="inline" data-form="barcode" style="align-items:flex-end"><label style="flex:1 1 200px">Code-barres<input type="text" name="code" inputmode="numeric" pattern="[0-9]*" placeholder="3017620422003"></label><button class="btn" type="submit">Rechercher</button></form>' +
        (ui.scan.loading ? '<p>Recherche du produit…</p>' : '') + (ui.scan.msg ? '<div class="alert">' + esc(ui.scan.msg) + '</div>' : '') + (ui.scan.error ? '<div class="alert warn">' + esc(ui.scan.error) + '</div>' : '') +
        '<p class="small muted">Le produit est recherché dans Open Food Facts (connexion nécessaire). Vérifie toujours le nom et l\'étiquette avant de confirmer.</p></div>' + pickHTML();
    } else if (ui.tab === 'off') {
      panel = (FD.api.blocked() ? '<div class="alert warn"><strong>Indisponible dans cette version en ligne</strong>Cette page hébergée bloque les connexions vers Open Food Facts. Pour chercher ou scanner des produits, utilise la version téléchargée (ouvre index.html) ou héberge l\'app sur ton propre site. En attendant : base d\'aliments, repas types et saisie libre.</div>' : '') + '<form class="inline" data-form="off" style="align-items:flex-end"><label style="flex:1 1 240px">Nom, marque ou code-barres<input type="search" name="q" value="' + esc(ui.off.query) + '" placeholder="ex. skyr siggi, 3017620422003"></label><button class="btn primary" type="submit">Rechercher</button></form>' +
        '<p class="small muted">Recherche dans Open Food Facts, produits vendus en France en priorité. Vérifie toujours le produit et l\'étiquette : les fiches sont saisies par la communauté.</p>' +
        (ui.off.loading ? '<p>Recherche en cours…</p>' : '') + (ui.off.error ? '<div class="alert warn">' + esc(ui.off.error) + '</div>' : '') +
        (ui.off.results.length ? '<div class="results">' + ui.off.results.map((p, i) => '<button type="button" data-action="off-pick" data-idx="' + i + '"><span>' + esc(p.base) + (p.brand ? ' <span class="muted">(' + esc(p.brand) + ')</span>' : '') + '</span><span class="small muted">' + U.num(p.kcal) + ' kcal · P ' + U.num(p.p, 1) + ' g /100 g</span></button>').join('') + '</div>' : '') +
        pickHTML();
    } else if (ui.tab === 'recettes') {
      const cats = R.CATEGORIES.filter((c) => R.all(S).some((r) => R.category(r) === c.id));
      panel = '<div class="form-grid"><label>Rechercher une recette<input type="search" id="jr-q" autocomplete="off" value="' + esc(ui.jrQuery || '') + '" data-input="jrq" placeholder="poulet, overnight, smoothie…"></label>' +
        '<label>Repas<select data-change="pick-meal">' + opts(N.MEALS.map((m) => [m.id, m.label]), ui.meal) + '</select></label></div>' +
        '<div class="chips" role="group" aria-label="Catégorie">' + [['', 'Toutes']].concat(Object.keys(S.favorites || {}).length ? [['fav', '★ Favoris']] : []).concat(cats.map((c) => [c.id, c.label])).map((c) => '<button type="button" class="chip" data-action="jr-cat" data-c="' + c[0] + '" aria-pressed="' + ((ui.jrCat || '') === c[0]) + '">' + esc(c[1]) + '</button>').join('') + '</div>' +
        '<div id="jr-list" class="stack" style="gap:0">' + journalRecipesHTML(iso) + '</div>' +
        '<p class="small muted">« Ajuster » calcule une portion qui colle à ce qu\'il te reste pour ce repas. Les macros sont recalculées à partir des ingrédients.</p>';
    } else if (ui.tab === 'libre') {
      panel = '<form class="stack" data-form="free"><p class="small muted">Pour un restaurant, un dessert, un verre : estime large, c\'est intégré à ta journée et à ta semaine, sans jugement.</p>' +
        '<div class="form-grid"><label>Nom<input type="text" name="name" required placeholder="Pizza, verre de vin…"></label>' +
        '<label>Type<select name="kind">' + opts(Object.entries(N.FREE_KINDS), 'libre') + '</select></label>' +
        '<label>Repas<select name="meal">' + opts(N.MEALS.map((m) => [m.id, m.label]), ui.meal) + '</select></label>' +
        '<label>Calories (kcal)<input type="number" name="kcal" required min="0"></label><label>Protéines (g)<input type="number" name="p" min="0"></label>' +
        '<label>Glucides (g)<input type="number" name="g" min="0"></label><label>Lipides (g)<input type="number" name="l" min="0"></label></div>' +
        '<div><button class="btn primary" type="submit">Ajouter au journal</button></div></form>';
    } else {
      panel = '<div class="stack">' + S.templates.map((t) => {
        const tmp = t.items.map((it) => { const f = F.byId(S, it.foodId); return f ? F.compute(f, it.qty, it.unit) : null; }).filter(Boolean).reduce((a, b) => N.add(a, b), N.zero());
        return '<div class="between" style="border-bottom:1px solid var(--line);padding:8px 0"><div class="stack" style="gap:2px"><strong>' + esc(t.name) + '</strong><span class="small muted">' +
          t.items.map((it) => { const f = F.byId(S, it.foodId); return f ? esc(F.qtyLabel(f, it.qty, it.unit) + ' ' + F.displayName(f).toLowerCase()) : ''; }).join(', ') +
          '</span><span class="small">≈ ' + U.num(tmp.kcal) + ' kcal · P ' + U.num(tmp.p) + ' g</span></div><button class="btn sm" data-action="add-tpl" data-id="' + esc(t.id) + '">Ajouter</button></div>';
      }).join('') + '</div>';
    }

    return '<div class="container">' +
      '<div class="page-head"><div><h1>Journal</h1><p class="sub">' + esc(U.frDate(iso)) + '</p></div>' +
        '<div class="inline"><button class="btn icon-btn" data-action="jprev" aria-label="Jour précédent">‹</button>' +
        '<label class="sr-only" for="jdate">Date</label><input type="date" id="jdate" value="' + iso + '" data-change="jdate" style="width:auto">' +
        '<button class="btn icon-btn" data-action="jnext" aria-label="Jour suivant">›</button>' + (iso !== today() ? '<button class="btn" data-action="jtoday">Aujourd\'hui</button>' : '') + '</div></div>' +
      '<div class="row">' +
        '<section class="card" aria-label="Totaux du jour"><div class="card-head"><h2>Totaux</h2>' +
          '<label class="sr-only" for="jsession">Séance</label><select id="jsession" data-change="day-session" data-date="' + iso + '" style="width:auto">' + sessionOptions(d.session || planned) + '</select></div>' +
          meter('Calories', tot.kcal, tg.kcal, 'kcal') + meter('Protéines', tot.p, tg.p, 'g', 'p') + meter('Glucides', tot.g, tg.g, 'g') + meter('Lipides', tot.l, tg.l, 'g', 'l') + meter('Fibres', tot.fib, tg.fib, 'g', 'p') +
          (tot.tracked ? '<p class="small">Restant : ≈ ' + U.kcal(Math.max(0, tg.kcal - tot.kcal)) + ' kcal · ' + U.num(Math.max(0, tg.p - tot.p)) + ' g de protéines.</p>' : '') +
        '</section>' +
        '<section class="card wide" aria-label="Ajouter"><div class="tabs" role="tablist">' + tabs.map((t) => '<button type="button" role="tab" aria-selected="' + (ui.tab === t[0]) + '" data-action="tab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' + panel + '</section>' +
      '</div>' +
      completeDayHTML(iso) + '<section class="card" aria-label="Repas du jour">' + meals + '</section>' + (ui.cdShown ? '' : suggestionsHTML(iso)) + legal + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Semaine                                                              */
  /* ------------------------------------------------------------------ */

  function vSemaine() {
    const iso = today();
    const wb = FD.adherence.weekBudget(S, iso);
    const p = S.profile;
    const days = wb.rows.map((row, i) => {
      const key = U.WEEK_ORDER[i];
      const h = Math.round(50 + ((row.target.kcal - 1800) / 300) * 90);
      const sel = (S.days[row.iso] && S.days[row.iso].session) || S.weekPlan[key];
      return '<div class="day' + (row.iso === iso ? ' today' : '') + '"><span class="small">' + U.kcal(row.target.kcal) + '</span>' +
        '<div class="bar" style="height:' + Math.max(20, h) + 'px"></div><strong>' + U.WEEKDAY_SHORT[key] + ' ' + U.parseISO(row.iso).getDate() + '</strong>' +
        '<label class="sr-only" for="plan-' + key + '">Séance du ' + U.WEEKDAY_SHORT[key] + '</label><select id="plan-' + key + '" data-change="week-session" data-date="' + row.iso + '" data-day="' + key + '">' + sessionOptions(sel) + '</select>' +
        '<span class="small muted">G ≈ ' + U.roundTo(row.target.g, 5) + ' g</span>' +
        '<span class="small">' + (row.totals.tracked ? U.num(row.totals.kcal) + ' kcal' : '—') + '</span></div>';
    }).join('');

    const typeRows = S.sessionTypes.map((t) => {
      const m = C.macrosFor(S, t.kcal + p.kcalOffset, C.fatFor(S, t));
      const fixedFat = p.fatG > 0;
      return '<tr><td><input type="text" value="' + esc(t.label) + '" data-change="type-field" data-id="' + esc(t.id) + '" data-field="label" aria-label="Nom"></td>' +
        '<td><select data-change="type-field" data-id="' + esc(t.id) + '" data-field="cat" aria-label="Catégorie">' + opts([['force', 'Force'], ['run_hard', 'Course intense/longue'], ['cardio', 'Cardio modéré'], ['repos', 'Repos / récup']], t.cat) + '</select></td>' +
        '<td class="num"><input type="number" step="10" value="' + t.kcal + '" data-change="type-field" data-id="' + esc(t.id) + '" data-field="kcal" aria-label="Calories" style="width:90px"></td>' +
        '<td class="num">' + (fixedFat ? p.fatG + ' <span class="small muted">(profil)</span>' : '<input type="number" value="' + t.fat + '" data-change="type-field" data-id="' + esc(t.id) + '" data-field="fat" aria-label="Lipides" style="width:72px">') + '</td>' +
        '<td class="num">' + p.proteinG + '</td><td class="num">≈ ' + U.roundTo(m.g, 5) + ((t.kcal + p.kcalOffset) > p.kcalMax ? '<br><span class="small" style="color:var(--warn)">plafonné à ' + U.num(p.kcalMax) + ' kcal</span>' : '') + '</td></tr>';
    }).join('');

    return '<div class="container">' +
      '<div class="page-head"><div><h1>Semaine</h1><p class="sub">Change la séance de n\'importe quel jour : cibles, glucides et budget se recalculent.</p></div></div>' +
      '<section class="card"><div class="card-head"><h2>Budget de la semaine</h2><span>' + U.kcal(wb.budget) + ' kcal · ≈ ' + U.kcal(wb.budget / 7) + '/j</span></div>' +
        '<div class="week">' + days + '</div>' +
        '<p class="small">' + (wb.balance >= 0 ? 'Sur les jours déjà suivis, tu as ≈ ' + U.kcal(wb.balance) + ' kcal de marge : de quoi intégrer un repas plus copieux sans dépasser la semaine.' : 'Les jours suivis dépassent leur cible d\'environ ' + U.kcal(-wb.balance) + ' kcal. Tu peux l\'absorber sur la semaine ou simplement continuer normalement.') + '</p>' +
        '<p class="small muted">La séance choisie ici remplace la séance prévue pour ce jour précis. Ta semaine type se modifie juste en dessous.</p></section>' +
      '<section class="card"><div class="card-head"><h2>Semaine type</h2><span class="muted small">appliquée aux semaines suivantes</span></div>' +
        '<div class="form-grid">' + U.WEEK_ORDER.map((k) => '<label>' + U.WEEKDAY_SHORT[k] + '<select data-change="plan" data-day="' + k + '">' + sessionOptions(S.weekPlan[k]) + '</select></label>').join('') + '</div></section>' +
      '<section class="card"><div class="card-head"><h2>Types de séance</h2><button class="btn sm ghost" data-action="restore-types">Valeurs par défaut</button></div>' +
        (p.kcalOffset ? '<div class="alert warn">Ajustement du coach en cours : ' + signed(p.kcalOffset, 0, 'kcal') + ' sur toutes les cibles. <button class="btn sm" data-action="reset-offset">Annuler l\'ajustement</button></div>' : '') +
        '<div class="table-wrap"><table><thead><tr><th>Séance</th><th>Catégorie</th><th class="num">kcal</th><th class="num">Lipides g</th><th class="num">Protéines g</th><th class="num">Glucides g</th></tr></thead><tbody>' + typeRows + '</tbody></table></div>' +
        '<p class="small muted">Les glucides prennent les calories restantes après protéines et lipides.' + (p.fatG > 0 ? ' Lipides fixés à ' + p.fatG + ' g/jour dans ton profil : vide ce champ pour les régler séance par séance.' : '') + ' Les catégories orientent les conseils (pré/post-séance) et l\'estimation de dépense.</p></section>' +
      legal + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Suivi (poids, taille, pas, activité)                                 */
  /* ------------------------------------------------------------------ */

  function vSuivi() {
    const iso = ui.trackDate;
    const d = S.days[iso] || {};
    const planned = S.weekPlan[U.weekdayKey(iso)];
    const ae = T.activityEstimate(S, iso);
    const end = today();
    const wt = FD.trends.weightTrend(S, end);
    const avgPrev30 = FD.trends.windowAvg(S, 'weight', U.addDays(end, -30), 7);
    const firstW = FD.trends.firstValue(S, 'weight'), firstWaist = FD.trends.firstValue(S, 'waist');
    const lastW = FD.trends.lastValue(S, 'weight', end), lastWaist = FD.trends.lastValue(S, 'waist', end);
    const v = (x, dec) => (x !== undefined && x !== null ? U.num(x, dec) : '');

    const hist = Object.keys(S.days).filter((k) => { const x = S.days[k]; return ['weight', 'waist', 'steps', 'sleep', 'hunger'].some((m) => typeof x[m] === 'number') || x.trainingDone; })
      .sort().reverse().slice(0, 30).map((k) => {
        const x = S.days[k];
        return '<tr><td>' + esc(U.frShort(k)) + '</td><td class="num">' + v(x.weight, 1) + '</td><td class="num">' + v(x.waist, 1) + '</td><td class="num">' + v(x.steps) + '</td><td class="num">' + v(x.sleep, 1) + '</td><td class="num">' + v(x.hunger) + '</td>' +
          '<td>' + (x.trainingDone ? esc(C.sessionFor(S, k).label) : '') + '</td><td class="num"><button class="btn sm ghost" data-action="track-edit" data-date="' + k + '">Modifier</button><button class="btn sm ghost danger" data-action="track-clear" data-date="' + k + '">Effacer</button></td></tr>';
      }).join('');

    return '<div class="container">' +
      '<div class="page-head"><div><h1>Suivi</h1><p class="sub">Poids, tour de taille, pas, sommeil et activité.</p></div></div>' +
      '<div class="row">' +
      '<form class="card wide" data-form="track"><div class="card-head"><h2>Saisie du jour</h2>' +
        '<label style="width:auto">Date<input type="date" name="date" value="' + iso + '" data-change="track-date"></label></div>' +
        '<fieldset><legend>Corps</legend><div class="form-grid">' +
          '<label>Poids (kg)<input type="text" inputmode="decimal" name="weight" value="' + v(d.weight, 1) + '"></label>' +
          '<label>Tour de taille (cm)<input type="text" inputmode="decimal" name="waist" value="' + v(d.waist, 1) + '"></label>' +
          '<label>Conditions de mesure<select name="waistConditions">' + opts([['', '—'], ['matin', 'Matin, à jeun'], ['autre', 'Autre moment']], d.waistConditions || '') + '</select></label>' +
          '<label>Sommeil (h)<input type="text" inputmode="decimal" name="sleep" value="' + v(d.sleep, 1) + '"></label>' +
          '<label>Faim (1 à 10)<select name="hunger">' + opts([['', '—']].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, n])), d.hunger || '') + '</select></label>' +
        '</div><p class="small muted">Tour de taille : au niveau du nombril, debout, relâché, en fin d\'expiration, idéalement le matin avant de manger.</p></fieldset>' +
        '<fieldset><legend>Activité</legend><div class="form-grid">' +
          '<label>Pas<input type="number" inputmode="numeric" name="steps" value="' + v(d.steps) + '"></label>' +
          '<label>Séance<select name="session">' + sessionOptions(d.session || planned) + '</select></label>' +
          '<label class="check"><input type="checkbox" name="trainingDone"' + (d.trainingDone ? ' checked' : '') + '>Séance faite</label>' +
          '<label>Durée (min)<input type="number" name="minutes" value="' + v(d.minutes) + '"></label>' +
          '<label>Performances<select name="perf">' + opts([['', '—'], ['hausse', 'En progrès'], ['stable', 'Stables'], ['baisse', 'En baisse']], d.perf || '') + '</select></label>' +
          '<label>Autre activité<select name="otherActivity">' + opts([['', '—'], ['marche', 'Marche'], ['velo', 'Vélo'], ['autre', 'Autre']], d.otherActivity || '') + '</select></label>' +
          '<label>Durée autre (min)<input type="number" name="otherMinutes" value="' + v(d.otherMinutes) + '"></label>' +
          '<label>Eau (L)<input type="text" inputmode="decimal" name="water" value="' + v(d.water, 1) + '"></label>' +
        '</div>' + (ae.parts.length ? '<p class="small">Dépense estimée : environ ' + U.kcal(ae.low) + '–' + U.kcal(ae.high) + ' kcal (' + ae.parts.map((x) => esc(x.label)).join(', ') + '). Estimation, pas une mesure.</p>' : '') + '</fieldset>' +
        '<fieldset><legend>Sans journal alimentaire</legend><div class="form-grid">' +
          '<label>Calories (kcal)<input type="number" name="manualKcal" value="' + v(d.manualKcal) + '"></label>' +
          '<label>Protéines (g)<input type="number" name="manualProtein" value="' + v(d.manualProtein) + '"></label></div>' +
          '<p class="small muted">À remplir seulement si tu n\'as pas utilisé le journal ce jour-là. Le journal est prioritaire s\'il contient des aliments.</p></fieldset>' +
        '<div><button class="btn primary" type="submit">Enregistrer</button></div></form>' +
      '<section class="card"><h2>Évolution</h2><dl class="kv">' +
        '<dt>Poids du jour</dt><dd>' + (lastW ? U.num(lastW.v, 1) + ' kg (' + esc(U.frShort(lastW.iso)) + ')' : '—') + '</dd>' +
        '<dt>Moyenne 7 j</dt><dd>' + (wt.avg7.avg !== null ? U.num(wt.avg7.avg, 1) + ' kg' : '—') + '</dd>' +
        '<dt>Évolution 7 j</dt><dd>' + signed(wt.change, 1, 'kg') + '</dd>' +
        '<dt>Évolution 30 j</dt><dd>' + (wt.avg7.avg !== null && avgPrev30.count >= 3 ? signed(wt.avg7.avg - avgPrev30.avg, 1, 'kg') : '—') + '</dd>' +
        '<dt>Tendance</dt><dd>' + esc(wt.label) + '</dd>' +
        '<dt>Tour de taille</dt><dd>' + (lastWaist ? U.num(lastWaist.v, 1) + ' cm' : '—') + '</dd>' +
        '<dt>Depuis le début</dt><dd>' + (firstW && lastW ? signed(lastW.v - firstW.v, 1, 'kg') : '—') + (firstWaist && lastWaist ? ' · ' + signed(lastWaist.v - firstWaist.v, 1, 'cm') : '') + '</dd>' +
      '</dl><p class="small muted">Les variations d\'un jour à l\'autre reflètent surtout l\'eau et le contenu digestif. Fie-toi à la moyenne.</p></section>' +
      '</div>' +
      '<div class="row"><section class="card"><div class="card-head"><h2>Poids</h2><span class="small muted">points : pesées · ligne : moyenne 7 j · tirets : objectif</span></div><canvas class="chart" id="ch-weight" role="img" aria-label="Graphique du poids sur 30 jours"></canvas></section>' +
        '<section class="card"><div class="card-head"><h2>Tour de taille</h2><span class="small muted">30 jours</span></div><canvas class="chart" id="ch-waist" role="img" aria-label="Graphique du tour de taille"></canvas></section></div>' +
      '<div class="row"><section class="card"><div class="card-head"><h2>Pas</h2><span class="small muted">trait : objectif</span></div><canvas class="chart" id="ch-steps" role="img" aria-label="Graphique des pas"></canvas></section>' +
        '<section class="card"><div class="card-head"><h2>Calories</h2><span class="small muted">trait : cible du jour</span></div><canvas class="chart" id="ch-kcal" role="img" aria-label="Graphique des calories"></canvas></section></div>' +
      '<section class="card" aria-label="Photos de progression"><div class="card-head"><h2>Photos de progression</h2><span class="small muted">stockées uniquement sur cet appareil</span></div>' +
        '<form class="inline" data-form="photo" style="align-items:flex-end"><label style="flex:0 1 170px">Date<input type="date" name="date" value="' + today() + '"></label>' +
        '<label style="flex:0 1 140px">Vue<select name="view">' + opts(Object.entries(FD.photos.VIEWS), ui.photoView) + '</select></label>' +
        '<label style="flex:1 1 220px">Photo<input type="file" name="file" accept="image/*" required></label><button class="btn primary" type="submit">Ajouter la photo</button></form>' +
        '<div class="seg" role="group" aria-label="Vue comparée">' + Object.entries(FD.photos.VIEWS).map((v) => '<button type="button" data-action="photo-view" data-v="' + v[0] + '" aria-pressed="' + (ui.photoView === v[0]) + '">' + v[1] + '</button>').join('') + '</div>' +
        '<div id="photo-compare" class="photo-grid"><p class="small muted">Chargement des photos…</p></div>' +
        '<p class="small muted">Compare dans les mêmes conditions : même lumière, même heure, même posture. Les photos montrent l\'évolution ; elles ne servent pas à estimer un pourcentage de masse grasse.</p>' +
        '<details><summary>Toutes les photos</summary><div id="photo-list" class="photo-grid"></div></details></section>' +
      '<section class="card"><h2>Historique</h2>' + (hist ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Poids</th><th class="num">Taille</th><th class="num">Pas</th><th class="num">Sommeil</th><th class="num">Faim</th><th>Séance</th><th></th></tr></thead><tbody>' + hist + '</tbody></table></div>' : '<p class="muted">Ta première pesée apparaîtra ici.</p>') + '</section>' +
      legal + '</div>';
  }

  /** Remplit la comparaison de photos (asynchrone : IndexedDB). */
  function fillPhotos() {
    const box = document.getElementById('photo-compare');
    if (!box) return;
    ui.photoUrls.forEach((u) => URL.revokeObjectURL(u));
    ui.photoUrls = [];
    const url = (blob) => { const u = URL.createObjectURL(blob); ui.photoUrls.push(u); return u; };
    FD.photos.list().then((all) => {
      if (!document.getElementById('photo-compare')) return;
      const rows = FD.photos.comparison(all, ui.photoView);
      box.innerHTML = rows.length ? rows.map((r) => r.photo
        ? '<figure><img src="' + url(r.photo.blob) + '" alt="Photo ' + esc(FD.photos.VIEWS[r.photo.view]) + ' du ' + esc(U.frShort(r.photo.date)) + '"><figcaption><strong>' + esc(r.label) + '</strong><br>' + esc(U.frDate(r.photo.date, { day: 'numeric', month: 'long', year: 'numeric' })) + '</figcaption></figure>'
        : '<figure class="empty"><div>Pas de photo vers le ' + esc(U.frShort(r.target)) + '</div><figcaption><strong>' + esc(r.label) + '</strong></figcaption></figure>').join('')
        : '<p class="muted">Aucune photo « ' + esc(FD.photos.VIEWS[ui.photoView].toLowerCase()) + ' » pour l\'instant.</p>';
      const list = document.getElementById('photo-list');
      if (list) list.innerHTML = all.length ? all.slice().reverse().map((p) => '<figure><img src="' + url(p.blob) + '" alt="Photo ' + esc(FD.photos.VIEWS[p.view]) + ' du ' + esc(U.frShort(p.date)) + '"><figcaption>' + esc(FD.photos.VIEWS[p.view]) + ' · ' + esc(U.frShort(p.date)) + ' <button class="btn sm ghost danger" data-action="photo-del" data-id="' + esc(p.id) + '">Supprimer</button></figcaption></figure>').join('') : '<p class="small muted">Aucune photo.</p>';
    }).catch((e) => { box.innerHTML = '<div class="alert warn">' + esc(e.message) + '</div>'; });
  }

  function drawSuivi() {
    const end = today();
    const n = 30;
    const labels = [];
    for (let i = n - 1; i >= 0; i--) labels.push(U.frShort(U.addDays(end, -i)));
    const css = FD.charts.css;
    const w = FD.trends.dailySeries(S, 'weight', end, n);
    const el = (id) => document.getElementById(id);
    if (!el('ch-weight')) return;
    FD.charts.line(el('ch-weight'), [
      { values: w.map((x) => x.raw), color: css('--muted'), dots: true, dotsOnly: true },
      { values: w.map((x) => x.ma7), color: css('--accent'), width: 2.5 }
    ], { labels, yDec: 1, target: S.profile.targetWeight, empty: 'Ajoute tes pesées pour voir la courbe' });
    const wa = FD.trends.dailySeries(S, 'waist', end, n);
    FD.charts.line(el('ch-waist'), [{ values: wa.map((x) => x.raw), color: css('--accent-2'), dots: true, dotSize: 4 }], { labels, yDec: 1, empty: 'Mesure ton tour de taille chaque semaine' });
    const days = []; for (let i = n - 1; i >= 0; i--) days.push(U.addDays(end, -i));
    FD.charts.bars(el('ch-steps'), days.map((x) => (S.days[x] && typeof S.days[x].steps === 'number' ? S.days[x].steps : null)),
      { labels, targets: days.map(() => S.profile.stepsGoal), empty: 'Aucun pas saisi', colorFn: (v) => (v >= S.profile.stepsGoal ? css('--accent-2') : css('--line-strong')) });
    FD.charts.bars(el('ch-kcal'), days.map((x) => { const t = T.dayTotals(S, x); return t.tracked ? t.kcal : null; }),
      { labels, targets: days.map((x) => C.dayTarget(S, x).kcal), empty: 'Aucune journée suivie', colorFn: () => css('--accent') });
  }

  /* ------------------------------------------------------------------ */
  /* Coach                                                                */
  /* ------------------------------------------------------------------ */

  function vCoach() {
    const iso = today();
    const r = FD.coach.evaluateUserState(S, iso);
    const week = U.isoWeekKey(iso);
    let current = S.decisions.find((d) => d.week === week);
    if (!current) { current = FD.history.record(S, r); save(); }
    const appliedThisWeek = current && current.applied;
    const rep = FD.coach.weeklyReport(S, iso);
    const ck = S.checkins[week] || {};
    const num1 = (x, d) => (x !== null && x !== undefined ? U.num(x, d) : '—');

    const options = r.options.map((o, i) => '<div class="option' + (o.recommended ? ' recommended' : '') + '"><div class="between"><strong>' + esc(o.label) + '</strong>' + (o.recommended ? '<span class="badge ok">Recommandée</span>' : '') + '</div>' +
      '<p class="small">' + esc(o.consequence || '') + '</p>' +
      (o.apply ? '<div><button class="btn sm' + (o.recommended || r.options.length === 1 ? ' primary' : '') + '" data-action="apply-option" data-idx="' + i + '"' + (appliedThisWeek ? ' disabled' : '') + '>Appliquer : ' + esc(o.applyLabel) + '</button></div>' : '') + '</div>').join('');

    const hist = FD.history.list(S).map((h) => '<div class="history-item"><div class="between"><strong>' + esc(U.frDate(h.date, { day: 'numeric', month: 'long', year: 'numeric' })) + '</strong><span class="badge">' + esc(h.title) + '</span></div>' +
      '<span class="small muted">Poids moyen ' + num1(h.avgWeight, 1) + ' kg · taille ' + num1(h.waist, 1) + ' cm · pas ' + (h.avgSteps ? U.num(U.roundTo(h.avgSteps, 100)) : '—') + ' · objectif pas ' + U.num(h.stepsGoal) + ' · ajustement kcal ' + signed(h.kcalOffset || 0, 0) + '</span>' +
      '<span class="small">' + esc(h.recommend) + '</span>' + (h.applied ? '<span class="small accent">Appliqué : ' + esc(h.applied) + '</span>' : '') + '</div>').join('');

    const comp = rep.components;
    return '<div class="container">' +
      '<div class="page-head"><div><h1>Mon coach</h1><p class="sub">Analyse au ' + esc(U.frDate(iso)) + ' · prochaine réévaluation le ' + esc(U.frDate(r.reevaluate, { day: 'numeric', month: 'long' })) + '</p></div>' +
        '<div class="inline"><span class="badge ' + (r.confidence.level === 'faible' ? 'warn' : r.confidence.level === 'eleve' ? 'ok' : '') + '">Confiance ' + esc(r.confidence.label.toLowerCase()) + '</span><button class="btn" data-action="reeval">Réévaluer</button></div></div>' +
      (r.code === 'securite' ? '<div class="alert danger"><strong>Avis professionnel recommandé</strong>' + esc(r.recommend) + '</div>' : '') +
      '<section class="card"><p class="kicker">Décision</p><p class="decision">' + esc(r.title) + '</p><p>' + esc(r.summary) + '</p><p class="small muted">' + esc(r.confidence.reason) + '</p></section>' +
      '<section class="card"><div class="grid-2">' +
        '<div class="stack"><p class="kicker">Ce que j\'observe</p><ul style="margin:0;padding-left:18px">' + r.observe.map((o) => '<li>' + esc(o) + '</li>').join('') + '</ul></div>' +
        '<div class="stack"><p class="kicker">Ce que cela signifie</p><p>' + esc(r.meaning) + '</p>' +
          '<p class="kicker">Ce que je recommande</p><p>' + esc(r.recommend) + '</p>' +
          '<p class="kicker">Pourquoi</p><p>' + esc(r.why) + '</p>' +
          '<p class="kicker">Quand réévaluer</p><p>Le ' + esc(U.frDate(r.reevaluate)) + '.</p></div>' +
      '</div></section>' +
      (r.options.length ? '<section class="card"><div class="card-head"><h2>Options</h2>' + (r.code === 'plateau' ? '<span class="small muted">Une seule à la fois, jamais les deux.</span>' : '') + '</div>' +
        (appliedThisWeek ? '<div class="alert">Déjà appliqué cette semaine : ' + esc(current.applied) + '. On laisse le temps de voir l\'effet avant de changer autre chose.</div>' : '') + options + '</section>' : '') +
      (r.notes.length || r.tips.length ? '<section class="card"><h2>À noter</h2>' + r.notes.map((nn) => '<div class="alert">' + esc(nn.text) + '</div>').join('') + r.tips.map((t) => '<div class="alert">' + esc(t) + '</div>').join('') + '</section>' : '') +
      (r.eta ? '<section class="card tight"><p>Objectif ' + U.num(S.profile.targetWeight, 1) + ' kg : au ' + esc(r.eta.basis) + ', cela pourrait nécessiter environ ' + r.eta.min + ' à ' + r.eta.max + ' semaines. Aucune date n\'est garantie.</p></section>' : '') +
      '<details class="card"><summary>Afficher les détails</summary><dl class="kv">' + Object.entries(r.details.data).map((e) => '<dt>' + esc(e[0]) + '</dt><dd>' + esc(e[1]) + '</dd>').join('') + '</dl>' +
        '<p class="kicker">Calculs</p><ul style="margin:0;padding-left:18px">' + r.details.calc.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
        '<p class="kicker">Hypothèses</p><ul style="margin:0;padding-left:18px">' + r.details.hypotheses.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
        '<p class="small">Incertitude : ' + esc(r.details.uncertainty) + '. Décision : <code>' + esc(r.code) + '</code></p></details>' +

      '<section class="card"><div class="card-head"><h2>Rapport de la semaine</h2><span class="small muted">' + esc(U.frShort(rep.period[0])) + ' → ' + esc(U.frShort(rep.period[1])) + '</span></div>' +
        '<dl class="kv"><dt>Poids moyen</dt><dd>' + num1(rep.weight, 1) + ' kg</dd><dt>Semaine précédente</dt><dd>' + num1(rep.prevWeight, 1) + ' kg</dd><dt>Évolution</dt><dd>' + signed(rep.delta, 1, 'kg') + '</dd>' +
        '<dt>Tour de taille</dt><dd>' + (rep.waistFrom !== null ? U.num(rep.waistFrom, 1) + ' → ' : '') + num1(rep.waistTo, 1) + ' cm</dd>' +
        '<dt>Calories moyennes</dt><dd>' + (rep.kcal !== null ? '≈ ' + U.kcal(rep.kcal) + ' kcal' : '—') + '</dd><dt>Protéines</dt><dd>' + num1(rep.protein) + ' g/j</dd>' +
        '<dt>Pas</dt><dd>' + (rep.steps !== null ? U.num(U.roundTo(rep.steps, 100)) + '/j' : '—') + '</dd><dt>Adhérence</dt><dd>' + (rep.adherence !== null ? rep.adherence + ' %' : '—') +
        (comp.calories !== null ? ' (calories ' + comp.calories + ' %, protéines ' + comp.proteines + ' %' + (comp.pas !== null ? ', pas ' + comp.pas + ' %' : '') + (comp.entrainement !== null ? ', entraînement ' + comp.entrainement + ' %' : '') + ')' : '') + '</dd></dl>' +
        '<p class="kicker">Analyse</p><p>' + esc(rep.analysis) + '</p><p class="kicker">Action</p><p>' + esc(rep.action) + '</p></section>' +

      '<form class="card" data-form="checkin"><div class="card-head"><h2>Questions de la semaine</h2><span class="small muted">' + (S.checkins[week] ? 'Réponses enregistrées' : 'Tes réponses affinent la recommandation') + '</span></div>' +
        '<div class="form-grid">' +
          '<label>As-tu eu faim ? (1 à 10)<select name="hunger">' + opts([['', '—']].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, n])), ck.hunger || '') + '</select></label>' +
          '<label>Énergie (1 à 10)<select name="energy">' + opts([['', '—']].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, n])), ck.energy || '') + '</select></label>' +
          '<label>Performances<select name="performance">' + opts([['', '—'], ['hausse', 'En progrès'], ['stable', 'Stables'], ['baisse', 'En baisse']], ck.performance || '') + '</select></label>' +
          '<label>Sommeil (1 à 10)<select name="sleep">' + opts([['', '—']].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, n])), ck.sleep || '') + '</select></label>' +
          '<label>Fringales le soir<select name="cravings">' + opts([['', '—'], ['jamais', 'Jamais'], ['parfois', 'Parfois'], ['souvent', 'Souvent']], ck.cravings || '') + '</select></label>' +
          '<label>Stress<select name="stress">' + opts([['', '—'], ['normal', 'Habituel'], ['eleve', 'Inhabituellement élevé']], ck.stress || '') + '</select></label>' +
        '</div>' +
        '<label>Des repas difficiles à suivre ?<textarea name="hardMeals" placeholder="Ex. déjeuners pro, apéro du samedi…">' + esc(ck.hardMeals || '') + '</textarea></label>' +
        '<label class="check"><input type="checkbox" name="cannotMoveMore"' + (ck.cannotMoveMore ? ' checked' : '') + '>Je ne peux pas augmenter mon activité en ce moment</label>' +
        '<label class="check"><input type="checkbox" name="symptoms"' + (ck.symptoms ? ' checked' : '') + '>Symptômes inhabituels (vertiges, malaises, fatigue anormale)</label>' +
        '<label class="check"><input type="checkbox" name="foodConcern"' + (ck.foodConcern ? ' checked' : '') + '>Ma relation à la nourriture me préoccupe</label>' +
        '<div><button class="btn primary" type="submit">Enregistrer mes réponses</button></div></form>' +

      '<section class="card"><h2>Historique des décisions</h2>' + (hist || '<p class="muted">Aucune décision enregistrée.</p>') + '</section>' +
      legal + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Profil                                                               */
  /* ------------------------------------------------------------------ */

  function vProfil() {
    const p = S.profile;
    const b = C.bmr(p), t = C.tdee(p), g = C.goalKcal(p);
    const alerts = C.profileAlerts(S);
    const field = (lab, name, val, type, extra) => '<label>' + lab + '<input type="' + (type || 'text') + '" name="' + name + '" value="' + esc(val === null || val === undefined ? '' : val) + '"' + (extra || '') + '></label>';
    const sel = (lab, name, list, val) => '<label>' + lab + '<select name="' + name + '">' + opts(list, val) + '</select></label>';
    const equip = [['four', 'Four'], ['micro-ondes', 'Micro-ondes'], ['air-fryer', 'Air fryer'], ['plaque', 'Plaque'], ['robot', 'Robot'], ['blender', 'Blender'], ['cuiseur-riz', 'Cuiseur à riz']];
    const examples = ['force', 'cardio', 'repos'].map((cat) => S.sessionTypes.find((x) => x.cat === cat)).filter(Boolean);

    return '<div class="container">' +
      '<div class="page-head"><div><h1>Profil</h1><p class="sub">Toutes les valeurs sont modifiables. Les cibles se recalculent à l\'enregistrement.</p></div></div>' +
      alertsHTML(alerts) +
      '<div class="row">' +
      '<form class="card wide" data-form="profile">' +
        '<fieldset><legend>Toi</legend><div class="form-grid">' +
          field('Prénom', 'name', p.name) + sel('Sexe', 'sex', [['homme', 'Homme'], ['femme', 'Femme']], p.sex) + field('Âge', 'age', p.age, 'number') +
          field('Taille (cm)', 'height', p.height, 'number') + field('Poids actuel (kg)', 'weight', U.num(p.weight, 1), 'text', ' inputmode="decimal"') + field('Poids cible (kg)', 'targetWeight', U.num(p.targetWeight, 1), 'text', ' inputmode="decimal"') +
          field('Tour de taille (cm)', 'waist', U.num(p.waist, 1), 'text', ' inputmode="decimal"') + field('Tour de taille intermédiaire (cm)', 'targetWaist', U.num(p.targetWaist, 1), 'text', ' inputmode="decimal"') +
        '</div></fieldset>' +
        '<fieldset><legend>Activité</legend><div class="form-grid">' +
          sel('Activité hors sport', 'job', [['sedentaire', 'Assis la plupart du temps'], ['debout', 'Souvent debout'], ['physique', 'Travail physique']], p.job) +
          field('Pas moyens / jour', 'steps', p.steps, 'number') + field('Objectif de pas', 'stepsGoal', p.stepsGoal, 'number') +
          field('Séances de musculation / sem.', 'strengthPerWeek', p.strengthPerWeek, 'number') + field('Séances de course / sem.', 'runPerWeek', p.runPerWeek, 'number') +
          field('Durée moyenne (min)', 'sessionMinutes', p.sessionMinutes, 'number') + field('Heure habituelle d\'entraînement', 'trainingTime', p.trainingTime, 'time') +
        '</div></fieldset>' +
        '<fieldset><legend>Objectif</legend><div class="form-grid">' +
          sel('Objectif', 'goal', [['perte', 'Perte de graisse'], ['maintien', 'Maintien'], ['prise', 'Prise de masse'], ['recompo', 'Recomposition']], p.goal) +
          sel('Rythme', 'pace', [['lent', 'Lent (≈ −10 %)'], ['modere', 'Modéré (≈ −15 %)'], ['rapide', 'Rapide (≈ −20 %)']], p.pace) +
          field('Plancher calorique (kcal)', 'kcalMin', p.kcalMin, 'number') + field('Plafond calorique (kcal)', 'kcalMax', p.kcalMax, 'number') +
          field('Protéines (g/jour)', 'proteinG', p.proteinG, 'number') +
          field('Lipides (g/jour)', 'fatG', p.fatG > 0 ? p.fatG : '', 'number', ' placeholder="selon la séance"') +
          field('Fibres (g/jour)', 'fiberG', p.fiberG, 'number') +
          sel('Repas par jour', 'mealsPerDay', [[3, '3'], [4, '4'], [5, '5']], p.mealsPerDay) +
        '</div><p class="small muted">Les calories par type de séance se règlent dans Semaine. Protéines et lipides sont fixes chaque jour ; les glucides prennent le reste et varient avec la séance. Laisse les lipides vides pour les régler séance par séance. Le plancher et le plafond encadrent toutes les cibles du jour (plan, journal, coach).</p></fieldset>' +
        '<fieldset><legend>Alimentation</legend><div class="form-grid">' +
          sel('Régime', 'diet', [['omnivore', 'Omnivore'], ['pescetarien', 'Pescétarien'], ['vegetarien', 'Végétarien'], ['vegetalien', 'Végétalien'], ['sans-porc', 'Sans porc']], p.diet) +
          field('Allergies', 'allergies', p.allergies) + field('Intolérances', 'intolerances', p.intolerances) + field('Aliments exclus', 'excluded', p.excluded) + field('Aliments préférés', 'preferred', p.preferred) +
          field('Budget hebdo (€)', 'budget', p.budget, 'number') + field('Temps pour cuisiner (min)', 'cookTime', p.cookTime, 'number') +
        '</div><div class="inline">' + equip.map((e) => '<label class="check"><input type="checkbox" name="equipment" value="' + e[0] + '"' + (p.equipment.includes(e[0]) ? ' checked' : '') + '>' + e[1] + '</label>').join('') + '</div></fieldset>' +
        '<fieldset><legend>Santé</legend><p class="small muted">Si l\'une de ces situations s\'applique, le coach n\'ajuste rien automatiquement et recommande un avis professionnel.</p>' +
          '<label class="check"><input type="checkbox" name="pregnancy"' + (p.pregnancy ? ' checked' : '') + '>Grossesse ou allaitement</label>' +
          '<label class="check"><input type="checkbox" name="medicalCondition"' + (p.medicalCondition ? ' checked' : '') + '>Pathologie nécessitant un suivi médical</label>' +
          '<label class="check"><input type="checkbox" name="medication"' + (p.medication ? ' checked' : '') + '>Traitement pouvant affecter le poids ou l\'appétit</label></fieldset>' +
        '<div><button class="btn primary" type="submit">Enregistrer le profil</button></div></form>' +
      '<div class="stack" style="gap:20px">' +
        '<section class="card"><h2>Métabolisme de base</h2><p class="small muted">Mifflin-St Jeor (' + (p.sex === 'femme' ? 'femme' : 'homme') + ')</p><p><code>' + esc(b.formula) + '</code></p><span class="mid-num">≈ ' + U.kcal(b.value) + ' kcal</span></section>' +
        '<section class="card"><h2>Dépense totale</h2><span class="mid-num">≈ ' + U.kcal(t.low) + '–' + U.kcal(t.high) + ' kcal</span>' +
          '<p class="small">Estimation initiale — elle sera recalibrée selon l\'évolution réelle du poids et du tour de taille.</p>' +
          '<p class="small muted">BMR × ' + U.num(t.factor, 2) + ' (quotidien + pas) + ≈ ' + U.kcal(t.sportPerDay) + ' kcal/j de sport en moyenne.</p></section>' +
        '<section class="card"><h2>Cible calorique</h2>' +
          '<p>Selon l\'objectif seul : ≈ ' + U.kcal(g.low) + '–' + U.kcal(g.high) + ' kcal (' + (g.pct ? signed(Math.round(g.pct * 100), 0) + ' %' : 'maintenance') + ').</p>' +
          '<p>Ta fourchette choisie : <strong>' + U.num(p.kcalMin) + '–' + U.num(p.kcalMax) + ' kcal</strong>, soit un écart estimé de ' + Math.round((1 - p.kcalMax / t.mid) * 100) + ' à ' + Math.round((1 - p.kcalMin / t.mid) * 100) + ' % sous la dépense.</p>' +
          '<div class="table-wrap"><table><thead><tr><th>Exemple</th><th class="num">kcal</th><th class="num">P</th><th class="num">G</th><th class="num">L</th></tr></thead><tbody>' +
          examples.map((ty) => { const m = C.macrosFor(S, ty.kcal + p.kcalOffset, C.fatFor(S, ty)); return '<tr><td>' + esc(ty.label) + '</td><td class="num">' + U.kcal(m.kcal) + '</td><td class="num">' + m.p + ' g · ' + Math.round(m.pct.p) + ' %</td><td class="num">' + U.roundTo(m.g, 5) + ' g · ' + Math.round(m.pct.g) + ' %</td><td class="num">' + m.l + ' g · ' + Math.round(m.pct.l) + ' %</td></tr>'; }).join('') +
          '</tbody></table></div><p class="small muted">Protéines ' + U.num(p.proteinG / p.weight, 1) + ' g/kg (plage 1,6–2,2) · lipides ' + (p.fatG > 0 ? U.num(p.fatG / p.weight, 2) + ' g/kg (' + p.fatG + ' g/jour) · plage conseillée ' : '') + U.num(p.fatPerKgMin, 1) + '–' + U.num(p.fatPerKgMax, 1) + ' g/kg.</p></section>' +
      '</div></div>' + legal + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Paramètres                                                           */
  /* ------------------------------------------------------------------ */

  function vParametres() {
    const c = S.settings.coach;
    const nDays = Object.keys(S.days).length;
    return '<div class="container">' +
      '<div class="page-head"><div><h1>Paramètres</h1></div></div>' +
      '<div class="row">' +
        '<section class="card"><h2>Apparence</h2><div class="seg" role="group" aria-label="Thème">' +
          '<button type="button" data-action="theme" data-v="sombre" aria-pressed="' + (S.settings.theme !== 'clair') + '">Sombre</button>' +
          '<button type="button" data-action="theme" data-v="clair" aria-pressed="' + (S.settings.theme === 'clair') + '">Clair</button></div></section>' +
        '<section class="card"><h2>Mes données</h2><p class="small muted">' + nDays + ' jour(s) enregistré(s), stockés uniquement dans ce navigateur.</p>' +
          '<div class="inline"><button class="btn primary" data-action="export">Exporter mes données</button>' +
          '<label class="btn" style="flex-direction:row">Importer mes données<input type="file" accept="application/json,.json" data-change="import" class="sr-only"></label></div>' +
          '<p class="small muted">L\'import remplace l\'intégralité des données actuelles par celles du fichier.</p>' +
          '<div class="inline"><button class="btn" data-action="photos-export">Exporter mes photos</button><label class="btn" style="flex-direction:row">Importer des photos<input type="file" accept="application/json,.json" data-change="photos-import" class="sr-only"></label></div>' +
          '<p class="small muted">Photos de progression et photos de recettes, exportées à part (fichier volumineux). Pour les avoir sur ton téléphone : exporte ici, puis importe le fichier sur le téléphone.</p></section>' +
      '</div>' +
      syncHTML() +
      '<section class="card"><h2>Données de démonstration</h2><p>Génère 4 semaines d\'historique fictif (poids stable, tour de taille en baisse, ≈ 6 700 pas) pour explorer les graphiques et le coach.</p>' +
        '<div class="inline"><button class="btn" data-action="demo">Charger la démo</button>' + (S.meta.demoData ? '<button class="btn danger" data-action="clear-days">Effacer l\'historique</button>' : '') + '</div>' +
        '<p class="small muted">Attention : la démo remplace ton historique (profil et réglages conservés).' + (S.meta.demoData ? ' Des données de démo sont actuellement chargées.' : '') + '</p></section>' +
      '<form class="card" data-form="coachcfg"><h2>Réglages du coach</h2><div class="form-grid">' +
        '<label>Seuil « poids stable » (% / semaine)<input type="text" inputmode="decimal" name="stableWeekPct" value="' + U.num(c.stableWeekPct, 2) + '"></label>' +
        '<label>Seuil « taille stable » (cm)<input type="text" inputmode="decimal" name="waistStableCm" value="' + U.num(c.waistStableCm, 1) + '"></label>' +
        '<label>Adhérence minimale (%)<input type="number" name="adherenceMin" value="' + c.adherenceMin + '"></label>' +
        '<label>Protéines minimales (% objectif)<input type="number" name="proteinMin" value="' + c.proteinMin + '"></label>' +
      '</div><div><button class="btn primary" type="submit">Enregistrer les réglages</button></div></form>' +
      '<section class="card"><h2>Sources des données</h2>' +
        '<dl class="kv"><dt>Valeurs indicatives</dt><dd>Les quelques aliments de base sans équivalent Ciqual (skyr, whey, crème de riz) gardent des ordres de grandeur saisis à la main, marqués « Démo ».</dd>' +
        '<dt>CIQUAL / ANSES</dt><dd>Table de composition des aliments génériques français (<a href="https://ciqual.anses.fr/" target="_blank" rel="noopener">ciqual.anses.fr</a>). ' + (S.meta.ciqual ? U.num(S.meta.ciqual.count) + ' aliments importés depuis ton fichier (' + esc(S.meta.ciqual.version || 'CIQUAL') + ').' : (window.FD_CIQUAL ? esc(window.FD_CIQUAL.version) + ' intégrée hors ligne (' + U.num(window.FD_CIQUAL.rows.length) + ' aliments), Licence Ouverte Etalab 2.0. Données converties depuis l\'export public github.com/OlivierFitter/ciqual_2025_complete.' : 'Non chargée.')) + '</dd>' +
        '<dt>Recettes</dt><dd>Recettes créées par l\'application ou saisies par toi (avec auteur et URL si elles viennent d\'ailleurs). Aucune recette n\'est récupérée automatiquement sur des sites tiers.</dd>' +
        '<dt>Open Food Facts</dt><dd>Produits de marque, recherche par nom ou code-barres (<a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener">openfoodfacts.org</a>). Chaque produit importé garde son code-barres comme référence.</dd>' +
        '<dt>Saisie utilisateur</dt><dd>Repas libres et estimations saisies à la main.</dd></dl></section>' +
      ciqualHTML() +
      '<section class="card"><h2>Vérification</h2><p>Le moteur de décision est testé sur des scénarios fixes (perte, stagnation, recomposition, adhérence faible, hausse brutale, sécurité).</p><div><a class="btn" href="tests.html">Lancer les tests du moteur</a></div></section>' +
      '<section class="card"><h2>Réinitialiser</h2><p class="small">Supprime profil, journal et historique de ce navigateur. Exporte tes données avant si tu veux les garder.</p><div><button class="btn danger" data-action="reset">Tout réinitialiser</button></div></section>' +
      legal + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Recettes                                                             */
  /* ------------------------------------------------------------------ */

  const R = FD.recipes;
  const MEAL_LABEL = { petitdej: 'Petit-déjeuner', dejeuner: 'Déjeuner', collation: 'Collation', diner: 'Dîner' };

  function macroLine(v, withFib) {
    return '≈ ' + U.num(v.kcal) + ' kcal · P ' + U.num(v.p) + ' g · G ' + U.num(v.g) + ' g · L ' + U.num(v.l) + ' g' + (withFib ? ' · fibres ' + U.num(v.fib, 1) + ' g' : '');
  }

  function ingLabel(ing) {
    const f = F.byId(S, ing.foodId);
    if (!f) return esc(ing.foodId) + ' (introuvable)';
    const eq = R.cookEquivalent(S, ing);
    const q = F.qtyLabel(f, ing.qty, ing.unit), name = F.displayName(f).toLowerCase();
    // « 1 × tomate » plutôt que « 1 × tomate tomate — cru »
    const first = (t) => U.norm(t).split(/[\s(,—-]+/).filter(Boolean)[0] || '';
    const label = F.isPiece(ing.unit) && f.unitLabel && first(f.unitLabel) === first(name) ? q : q + ' ' + name;
    return esc(label + (eq ? ' (≈ ' + U.num(eq.grams) + ' g ' + eq.state + ')' : ''));
  }

  /** Prochain repas sans entrée aujourd'hui, et sa cible. */
  function nextMealTarget(iso) {
    const d = S.days[iso] || { foods: [] };
    const tg = C.dayTarget(S, iso);
    const mt = N.mealTargets(tg, S.profile.trainingTime, tg.type.cat !== 'repos');
    const order = ['petitdej', 'dejeuner', 'collation', 'diner'];
    const h = new Date().getHours();
    const startIdx = iso === today() ? (h < 10 ? 0 : h < 15 ? 1 : h < 18 ? 2 : 3) : 0;
    let meal = order.slice(startIdx).find((m) => !(d.foods || []).some((e) => e.meal === m)) || order[startIdx];
    return { meal, target: mt[meal] };
  }

  /** Liste des recettes de l'onglet Recettes du journal (filtrée, 40 max). */
  function journalRecipesHTML(iso) {
    const q = U.norm(ui.jrQuery || '');
    const list = R.all(S).filter((r) => (!ui.jrCat || (ui.jrCat === 'fav' ? R.isFav(S, r.id) : R.category(r) === ui.jrCat)) && (!q || U.norm(r.name).includes(q)))
      .sort((a, b) => (R.isFav(S, b.id) - R.isFav(S, a.id)) || (a.meals.includes(ui.meal) ? 0 : 1) - (b.meals.includes(ui.meal) ? 0 : 1) || a.name.localeCompare(b.name));
    if (!list.length) return '<p class="small muted">Aucune recette ne correspond.</p>';
    return list.slice(0, 40).map((r) => {
      const per = R.compute(S, r).per;
      const qid = 'jrq-' + r.id;
      return '<div class="jr-row"><div class="recipe-thumb small-thumb" data-photo="' + esc(r.id) + '" aria-hidden="true">' + FD.recipeArt.svg(S, r) + '</div>' +
        '<div class="stack" style="gap:2px;min-width:0;flex:1"><div class="inline" style="gap:6px;flex-wrap:nowrap">' + '<button type="button" class="fav-btn" data-action="fav" data-id="' + esc(r.id) + '" aria-pressed="' + R.isFav(S, r.id) + '" aria-label="' + (R.isFav(S, r.id) ? 'Retirer des favoris' : 'Ajouter aux favoris') + '" title="' + (R.isFav(S, r.id) ? 'Retirer des favoris' : 'Ajouter aux favoris') + '">' + (R.isFav(S, r.id) ? '★' : '☆') + '</button>' + '<strong>' + esc(r.name) + '</strong></div><span class="small muted">1 portion : ' + macroLine(per) + '</span></div>' +
        '<div class="inline" style="gap:6px;justify-content:flex-end"><label class="sr-only" for="' + esc(qid) + '">Portions</label><select id="' + esc(qid) + '" style="width:auto;min-height:36px">' + opts([[0.5, '½'], [1, '1'], [1.5, '1 ½'], [2, '2']], 1) + '</select>' +
        '<button class="btn sm" data-action="jr-add" data-id="' + esc(r.id) + '">Ajouter</button><button class="btn sm ghost" data-action="jr-fit" data-id="' + esc(r.id) + '">Ajuster</button></div></div>';
    }).join('') + (list.length > 40 ? '<p class="small muted">' + (list.length - 40) + ' autres recettes : affine la recherche.</p>' : '');
  }

  /** Cible d'un repas pour une recette « ajustée » : sa part de la journée, sans dépasser ce qu'il reste. */
  function mealFitTarget(iso, meal) {
    const tg = C.dayTarget(S, iso);
    const tot = T.dayTotals(S, iso);
    const mt = N.mealTargets(tg, S.profile.trainingTime, tg.type.cat !== 'repos')[meal];
    const rem = { kcal: tg.kcal - tot.kcal, p: tg.p - tot.p };
    const d = S.days[iso] || { foods: [] };
    const left = ['petitdej', 'dejeuner', 'collation', 'diner'].filter((m) => m !== meal && !(d.foods || []).some((e) => e.meal === m));
    const lastOne = !left.some((m) => ['dejeuner', 'diner'].includes(m)) && meal !== 'petitdej' && meal !== 'collation';
    if (lastOne) return { kcal: Math.max(150, rem.kcal), p: Math.max(10, rem.p) };
    return { kcal: Math.max(120, Math.min(mt.kcal * 1.15, rem.kcal)), p: Math.max(8, Math.min(mt.p * 1.3, rem.p)) };
  }

  /** « Compléter ma journée » : combinaisons de recettes pour les repas restants. */
  function completeDayHTML(iso) {
    ui.cdShown = false;
    const d = S.days[iso];
    if (!d || !(d.foods || []).length || !FD.planner.completeDay || !FD.recipeArt) return '';
    let res;
    try { res = FD.planner.completeDay(S, iso); } catch (e) { console.error(e); return ''; }
    ui.cd = res;
    if (!res.slots.length || !res.options.length) return '';
    ui.cdShown = true;
    const T = res.target;
    const row = (lab, v, t, u) => '<span>' + lab + ' <strong>' + U.num(v) + '</strong>/' + U.num(t) + (u || '') + '</span>';
    return '<section class="card" aria-label="Compléter ma journée"><div class="card-head"><h2>Compléter ma journée</h2><span class="small muted">' + res.slots.map((m) => MEAL_LABEL[m]).join(' + ') + '</span></div>' +
      '<p>Il te reste environ <strong>' + U.kcal(res.remaining.kcal) + ' kcal</strong>, ' + U.num(Math.max(0, res.remaining.p)) + ' g de protéines, ' + U.num(Math.max(0, res.remaining.g)) + ' g de glucides et ' + U.num(Math.max(0, res.remaining.l)) + ' g de lipides. Voici les combinaisons qui bouclent le mieux ta journée :</p>' +
      res.options.map((o, i) => '<div class="option' + (i === 0 ? ' recommended' : '') + '"><div class="between"><strong>Option ' + (i + 1) + '</strong>' + (i === 0 ? '<span class="badge ok">La plus proche</span>' : '') + '</div>' +
        o.meals.map((m) => '<div class="cd-meal"><div class="recipe-thumb small-thumb" data-photo="' + esc(m.recipe.id) + '" aria-hidden="true">' + FD.recipeArt.svg(S, m.recipe) + '</div><div class="stack" style="gap:2px;min-width:0;flex:1"><span class="small muted">' + esc(MEAL_LABEL[m.meal]) + '</span><strong>' + esc(m.recipe.name) + '</strong><span class="small muted">' + m.fit.ingredients.map(ingLabel).join(', ') + '</span><span class="small">' + macroLine(m.fit.totals) + '</span>' +
          (o.meals.length > 1 ? '<div><button class="btn sm ghost" data-action="cd-add-one" data-idx="' + i + '" data-m="' + o.meals.indexOf(m) + '">Ajouter seulement ce ' + esc(MEAL_LABEL[m.meal].toLowerCase()) + '</button></div>' : '') + '</div></div>').join('') +
        '<div class="inline small" style="gap:14px;padding-top:6px;border-top:1px solid var(--line)"><span class="muted">Journée :</span>' + row('kcal', o.totals.kcal, T.kcal) + row('P', o.totals.p, T.p, ' g') + row('G', o.totals.g, T.g, ' g') + row('L', o.totals.l, T.l, ' g') + '</div>' +
        '<div class="inline"><button class="btn sm' + (i === 0 ? ' primary' : '') + '" data-action="cd-add" data-idx="' + i + '">' + (o.meals.length > 1 ? 'Ajouter ces ' + o.meals.length + ' repas au journal' : 'Ajouter ce repas au journal') + '</button></div></div>').join('') +
      '<p class="small muted">Portions recalculées à partir des ingrédients ; le dîner est recalé sur ce qu\'il reste après le déjeuner et la collation. Les recettes sans photo affichent leur illustration.</p></section>';
  }

  /** Bloc de suggestions « il te reste… » (journal et recettes). */
  function suggestionsHTML(iso) {
    try { return suggestionsInner(iso); } catch (e) { console.error(e); return ''; }
  }

  function suggestionsInner(iso) {
    const tg = C.dayTarget(S, iso);
    const tot = T.dayTotals(S, iso);
    const nm = nextMealTarget(iso);
    let remaining, intro;
    if (tot.tracked) {
      remaining = { kcal: tg.kcal - tot.kcal, p: Math.max(0, tg.p - tot.p) };
      if (remaining.kcal < 200) { ui.sug = []; return ''; }
      // si plusieurs repas restent, viser la cible du prochain repas plutôt que tout le reste
      const restMeals = ['petitdej', 'dejeuner', 'collation', 'diner'].filter((m) => !(S.days[iso].foods || []).some((e) => e.meal === m));
      const target = restMeals.length > 1 ? { kcal: Math.min(remaining.kcal, nm.target.kcal * 1.15), p: Math.min(remaining.p, Math.max(nm.target.p, remaining.p / restMeals.length)) } : remaining;
      intro = 'Il te reste environ ' + U.kcal(remaining.kcal) + ' kcal et ' + U.num(remaining.p) + ' g de protéines.' + (restMeals.length > 1 ? ' Idées pour ton ' + MEAL_LABEL[nm.meal].toLowerCase() + ', portions ajustées :' : ' Idées pour finir la journée :');
      remaining = target;
    } else {
      remaining = { kcal: nm.target.kcal, p: nm.target.p };
      intro = 'Idées pour ton ' + MEAL_LABEL[nm.meal].toLowerCase() + ' (cible ≈ ' + U.kcal(remaining.kcal) + ' kcal, ' + U.num(remaining.p) + ' g de protéines) :';
    }
    ui.sug = R.suggest(S, nm.meal, remaining, 4).map((x) => Object.assign(x, { meal: nm.meal, iso }));
    if (!ui.sug.length) return '';
    return '<section class="card" aria-label="Suggestions"><div class="card-head"><h2>Suggestions</h2></div><p>' + esc(intro) + '</p><div class="cards">' +
      ui.sug.map((x, i) => '<div class="option"><strong>' + esc(x.recipe.name) + '</strong><span class="small muted">' + x.fit.ingredients.map(ingLabel).join(', ') + '</span>' +
        '<span class="small">' + macroLine(x.fit.totals) + '</span><div><button class="btn sm" data-action="sug-add" data-idx="' + i + '">Ajouter au ' + esc(MEAL_LABEL[x.meal].toLowerCase()) + '</button></div></div>').join('') +
      '</div><p class="small muted">Portions recalculées à partir des ingrédients pour approcher la cible : ce sont des estimations.</p></section>';
  }

  function recipeCard(r) {
    const c = R.compute(S, r);
    const allowed = R.recipeAllowed(S, r);
    return '<article class="recipe-card"><div class="recipe-thumb" data-photo="' + esc(r.id) + '" aria-hidden="true">' + FD.recipeArt.svg(S, r) + '</div><div class="stack" style="gap:4px">' +
      '<div class="between" style="align-items:flex-start"><strong>' + esc(r.name) + '</strong>' + '<button type="button" class="fav-btn" data-action="fav" data-id="' + esc(r.id) + '" aria-pressed="' + R.isFav(S, r.id) + '" aria-label="' + (R.isFav(S, r.id) ? 'Retirer des favoris' : 'Ajouter aux favoris') + '" title="' + (R.isFav(S, r.id) ? 'Retirer des favoris' : 'Ajouter aux favoris') + '">' + (R.isFav(S, r.id) ? '★' : '☆') + '</button>' + '</div><span class="small muted">' + r.meals.map((m) => MEAL_LABEL[m]).join(', ') + ' · ' + ((r.prep || 0) + (r.cook || 0)) + ' min · ' + r.servings + ' portion' + (r.servings > 1 ? 's' : '') + '</span>' +
      '<span class="small">' + macroLine(c.per) + ' / portion</span>' +
      (allowed.ok ? '' : '<span class="small" style="color:var(--warn)">Exclue : ' + esc(allowed.reason) + '</span>') +
      '<div class="inline" style="gap:6px"><button class="btn sm" data-action="r-open" data-id="' + esc(r.id) + '">Voir la recette</button><span class="badge">' + esc(r.source && r.source.collection ? r.source.collection + (r.source.ref ? ' · ' + r.source.ref.replace('page ', 'p. ') : '') : r.source && r.source.type === 'user' ? 'Ma recette' : r.source && r.source.type === 'external' ? 'Externe' : 'App') + '</span></div></div></article>';
  }

  function recipeDetail(r) {
    if (!ui.rIngs || ui.rIngsFor !== r.id) { ui.rIngs = r.ingredients.map((i) => Object.assign({}, i)); ui.rIngsFor = r.id; ui.rServings = r.servings; }
    const ratio = ui.rServings / r.servings;
    const ings = ui.rIngs.map((i) => Object.assign({}, i, { qty: R.roundQty(i.qty * ratio, i.unit, F.byId(S, i.foodId)) }));
    const c = R.compute(S, { servings: ui.rServings }, ings);
    const changed = JSON.stringify(ui.rIngs.map((i) => [i.foodId, i.qty])) !== JSON.stringify(r.ingredients.map((i) => [i.foodId, i.qty]));
    const isUser = r.source && r.source.type === 'user';
    const rows = c.lines.map((l, idx) => {
      const subs = R.substitutesFor(S, l.ing.foodId);
      return '<tr><td>' + esc(F.displayName(l.food)) + (l.ing.note ? '<br><span class="small muted">' + esc(l.ing.note) + '</span>' : '') + (l.food.variable ? '<br><span class="small" style="color:var(--warn)">valeur indicative</span>' : '') + '<br><span class="small muted">' + esc((F.SOURCES[l.food.source] || F.SOURCES.demo).short) + '</span></td>' +
        '<td class="num">' + esc(F.qtyLabel(l.food, l.ing.qty, l.ing.unit)) + (function () { const eq = R.cookEquivalent(S, l.ing); return eq ? '<br><span class="small teal">≈ ' + U.num(eq.grams) + ' g ' + esc(eq.state) + '</span>' : ''; })() + '</td><td class="num">' + U.num(l.v.kcal) + '</td><td class="num">' + U.num(l.v.p, 1) + '</td><td class="num">' + U.num(l.v.g, 1) + '</td><td class="num">' + U.num(l.v.l, 1) + '</td><td class="num">' + U.num(l.v.fib, 1) + '</td>' +
        '<td>' + (subs.length ? '<label class="sr-only" for="rs-' + idx + '">Remplacer</label><select id="rs-' + idx + '" data-change="r-sub" data-idx="' + idx + '" style="min-width:140px"><option value="">Remplacer…</option>' + subs.map((s) => '<option value="' + esc(s.id) + '">' + esc(F.displayName(s)) + '</option>').join('') + '</select>' : '') + '</td></tr>';
    }).join('');
    return '<section class="card" aria-label="Recette"><div class="card-head"><h2>' + esc(r.name) + '</h2><div class="inline" style="gap:6px">' + '<button type="button" class="fav-btn" data-action="fav" data-id="' + esc(r.id) + '" aria-pressed="' + R.isFav(S, r.id) + '" aria-label="' + (R.isFav(S, r.id) ? 'Retirer des favoris' : 'Ajouter aux favoris') + '" title="' + (R.isFav(S, r.id) ? 'Retirer des favoris' : 'Ajouter aux favoris') + '">' + (R.isFav(S, r.id) ? '★' : '☆') + '</button>' + '<button class="btn sm ghost" data-action="r-close">Fermer</button></div></div>' +
      '<div class="recipe-photo" id="recipe-photo" data-id="' + esc(r.id) + '">' + FD.recipeArt.svg(S, r) + '</div>' +
      '<p class="small muted" id="recipe-art-note">Illustration générée à partir des ingrédients. Ajoute ta photo pour la remplacer — en lot : nomme le fichier <code>' + esc(r.id) + '.jpg</code> et utilise « Importer des photos ».</p>' +
      '<div class="inline"><label class="btn sm" style="flex-direction:row">' + 'Ajouter / changer la photo<input type="file" accept="image/*" data-change="r-photo" data-id="' + esc(r.id) + '" class="sr-only"></label><button class="btn sm ghost" data-action="r-photo-del" data-id="' + esc(r.id) + '">Retirer la photo</button><span class="small muted">Ta photo reste sur cet appareil.</span></div>' +
      '<div class="inline small muted"><span>Préparation ' + (r.prep || 0) + ' min</span><span>Cuisson ' + (r.cook || 0) + ' min</span><span>Difficulté : ' + esc(r.difficulty || 'facile') + '</span>' + (r.keep ? '<span>Conservation : ' + esc(r.keep) + '</span>' : '') +
      '<label style="flex-direction:row;align-items:center;gap:8px">Portions<input type="number" min="1" max="12" value="' + ui.rServings + '" data-change="r-servings" style="width:72px"></label></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Ingrédient</th><th class="num">Quantité</th><th class="num">kcal</th><th class="num">P</th><th class="num">G</th><th class="num">L</th><th class="num">Fibres</th><th></th></tr></thead><tbody>' + rows +
      '<tr><td><strong>Total</strong></td><td></td><td class="num"><strong>' + U.num(c.total.kcal) + '</strong></td><td class="num">' + U.num(c.total.p) + '</td><td class="num">' + U.num(c.total.g) + '</td><td class="num">' + U.num(c.total.l) + '</td><td class="num">' + U.num(c.total.fib, 1) + '</td><td></td></tr>' +
      '<tr><td><strong>Par portion</strong></td><td></td><td class="num"><strong>' + U.num(c.per.kcal) + '</strong></td><td class="num">' + U.num(c.per.p) + '</td><td class="num">' + U.num(c.per.g) + '</td><td class="num">' + U.num(c.per.l) + '</td><td class="num">' + U.num(c.per.fib, 1) + '</td><td></td></tr></tbody></table></div>' +
      (c.missing.length ? '<div class="alert warn">Ingrédients introuvables, non comptés : ' + esc(c.missing.join(', ')) + '</div>' : '') +
      '<p class="small muted">Macros calculées en additionnant chaque ingrédient puis en divisant par ' + ui.rServings + ' portion' + (ui.rServings > 1 ? 's' : '') + '.' + (c.variable ? ' Certaines valeurs dépendent de la marque : vérifier l\'étiquette.' : '') + (c.sources.includes('demo') ? ' Valeurs de démonstration, indicatives.' : '') + ' Une substitution conserve l\'apport principal de l\'ingrédient (protéines ou glucides). Les équivalences cru ↔ cuit (en vert) sont estimées à partir des valeurs Ciqual : elles varient selon la cuisson et l\'eau absorbée.</p>' +
      (r.bookMacros ? '<p class="small muted">Valeurs annoncées par la source pour 1 portion : ' + U.num(r.bookMacros[0]) + ' kcal, P ' + U.num(r.bookMacros[1]) + ' g' + (r.bookMacros.length > 2 ? ', G ' + U.num(r.bookMacros[2]) + ' g, L ' + U.num(r.bookMacros[3], 1) + ' g' : '') + '. L\'app recalcule à partir des ingrédients (Ciqual), d\'où d\'éventuels écarts.</p>' : '') +
      (r.note ? '<p class="small muted">' + esc(r.note) + '</p>' : '') +
      '<div><p class="kicker">Préparation</p><ol style="margin:6px 0 0;padding-left:20px">' + (r.steps || []).map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol></div>' +
      '<p class="small muted">Source : ' + esc(R.sourceLabel(r)) + (r.source && r.source.collection ? ' — étapes résumées ; explications détaillées et photos dans le livre.' : '') + '</p>' +
      '<div class="inline"><label style="flex-direction:row;align-items:center;gap:8px">Repas<select data-change="r-meal" style="width:auto">' + opts(N.MEALS.map((m) => [m.id, m.label]), ui.rMeal || r.meals[0]) + '</select></label>' +
        '<button class="btn primary" data-action="r-log">Ajouter 1 portion au journal</button>' +
        '<button class="btn" data-action="r-log-fit">Ajouter une portion ajustée à ma cible</button>' +
        (changed ? '<button class="btn" data-action="r-save-copy">Enregistrer comme ma recette</button><button class="btn ghost" data-action="r-reset">Annuler les remplacements</button>' : '') +
        (isUser ? '<button class="btn ghost" data-action="r-edit" data-id="' + esc(r.id) + '">Modifier</button><button class="btn ghost danger" data-action="r-delete" data-id="' + esc(r.id) + '">Supprimer</button>' : '') + '</div></section>';
  }

  function editorHTML() {
    const e = ui.editor;
    const c = R.compute(S, { servings: e.servings || 1 }, e.ingredients);
    const rows = e.ingredients.map((i, idx) => {
      const f = F.byId(S, i.foodId);
      return '<tr><td>' + esc(f ? F.displayName(f) : i.foodId) + '</td><td><input type="text" inputmode="decimal" value="' + (F.isPiece(i.unit) || i.unit === 'portion' ? U.frac(i.qty) : U.num(i.qty, i.qty % 1 ? 1 : 0)) + '" data-change="ed-qty" data-idx="' + idx + '" style="width:80px" aria-label="Quantité"></td>' +
        '<td><select data-change="ed-unit" data-idx="' + idx + '" aria-label="Unité">' + opts(F.unitsFor(f || { basis: '100g' }).map((u) => [u.id, u.label]), i.unit) + '</select></td>' +
        '<td><select data-change="ed-role" data-idx="' + idx + '" aria-label="Rôle">' + opts([['prot', 'Protéines'], ['carb', 'Féculent / fruit'], ['fat', 'Matière grasse'], ['veg', 'Légumes'], ['other', 'Autre']], i.role) + '</select></td>' +
        '<td><button class="btn sm ghost danger" data-action="ed-remove" data-idx="' + idx + '">Retirer</button></td></tr>';
    }).join('');
    const results = ui.edQuery ? F.search(S, ui.edQuery, 8).reduce((a, g) => a.concat(g.variants), []).slice(0, 12) : [];
    return '<form class="card" data-form="recipe" aria-label="Éditeur de recette"><div class="card-head"><h2>' + (e.id ? 'Modifier la recette' : 'Nouvelle recette') + '</h2><button type="button" class="btn sm ghost" data-action="ed-cancel">Annuler</button></div>' +
      '<div class="form-grid"><label>Nom<input type="text" name="name" required value="' + esc(e.name) + '"></label>' +
      '<label>Portions<input type="number" name="servings" min="1" value="' + (e.servings || 1) + '" data-change="ed-servings"></label>' +
      '<label>Préparation (min)<input type="number" name="prep" value="' + (e.prep || '') + '"></label><label>Cuisson (min)<input type="number" name="cook" value="' + (e.cook || '') + '"></label>' +
      '<label>Difficulté<select name="difficulty">' + opts([['facile', 'Facile'], ['moyen', 'Moyenne'], ['difficile', 'Difficile']], e.difficulty) + '</select></label></div>' +
      '<div class="inline">' + N.MEALS.map((m) => '<label class="check"><input type="checkbox" name="meals" value="' + m.id + '"' + (e.meals.includes(m.id) ? ' checked' : '') + '>' + m.label + '</label>').join('') + '</div>' +
      '<p class="kicker">Ingrédients</p>' + (rows ? '<div class="table-wrap"><table><tbody>' + rows + '</tbody></table></div>' : '<p class="small muted">Ajoute au moins un ingrédient.</p>') +
      '<label>Ajouter un ingrédient<input type="search" id="ed-q" autocomplete="off" value="' + esc(ui.edQuery || '') + '" data-input="edq" placeholder="riz, poulet…"></label>' +
      '<div id="ed-results">' + edResultsHTML(results) + '</div>' +
      '<p class="small">Par portion : ' + macroLine(c.per, true) + '</p>' +
      '<label>Étapes (une par ligne)<textarea name="steps">' + esc((e.steps || []).join('\n')) + '</textarea></label>' +
      '<div class="form-grid"><label>Auteur (si recette externe)<input type="text" name="author" value="' + esc(e.author || '') + '"></label><label>URL de la source<input type="text" name="url" value="' + esc(e.url || '') + '"></label></div>' +
      '<p class="small muted">Pour une recette trouvée ailleurs, indique la source : elle sera affichée avec la recette. Les macros restent calculées à partir de tes ingrédients.</p>' +
      '<div><button class="btn primary" type="submit">Enregistrer la recette</button></div></form>';
  }

  function edResultsHTML(list) {
    if (!list || !list.length) return ui.edQuery ? '<p class="small muted">Aucun aliment trouvé.</p>' : '';
    ui.edResults = list;
    return '<div class="results">' + list.map((f, i) => '<button type="button" data-action="ed-add" data-idx="' + i + '"><span>' + esc(F.displayName(f)) + '</span><span class="small muted">' + U.num(f.kcal) + ' kcal /100</span></button>').join('') + '</div>';
  }

  function vRecettes() {
    const list = filteredRecipes();
    const open = ui.recipe && R.byId(S, ui.recipe);
    const cols = R.collections(S);
    return '<div class="container">' +
      '<div class="page-head"><div><h1>Recettes</h1><p class="sub">' + R.all(S).length + ' recettes · macros calculées à partir des ingrédients, jamais saisies à la main.</p></div><div class="inline"><label class="btn" style="flex-direction:row">Importer des recettes<input type="file" accept="application/json,.json" data-change="r-import" class="sr-only"></label><label class="btn" style="flex-direction:row">Importer des photos<input type="file" accept="image/*" multiple data-change="r-photos-bulk" class="sr-only"></label><button class="btn primary" data-action="r-new">Nouvelle recette</button></div></div>' +
      (ui.editor ? editorHTML() : '') + (open && !ui.editor ? recipeDetail(open) : '') +
      (!ui.editor && !open ? suggestionsHTML(today()) : '') +
      '<section class="card"><div class="inline"><label style="flex:1 1 220px">Rechercher<input type="search" value="' + esc(ui.rQuery || '') + '" data-input="rq" placeholder="poulet, pâtes…"></label>' +
        '<label style="flex:0 1 200px">Repas<select data-change="r-filter">' + opts([['', 'Tous']].concat(N.MEALS.map((m) => [m.id, m.label])), ui.rFilterMeal || '') + '</select></label>' +
        '<label style="flex:0 1 220px">Collection<select data-change="r-collection">' + opts([['', 'Toutes'], ['app', 'Recettes de l\'app'], ['user', 'Mes recettes']].concat(Object.keys(cols).map((c) => [c, c + ' (' + cols[c] + ')'])), ui.rCollection || '') + '</select></label></div>' +
        (ui.rCollection && cols[ui.rCollection] ? '<div><button class="btn sm ghost danger" data-action="r-col-remove" data-c="' + esc(ui.rCollection) + '">Retirer la collection « ' + esc(ui.rCollection) + ' »</button></div>' : '') +
        '<div class="chips" role="group" aria-label="Catégorie">' + [['', 'Toutes'], ['fav', '★ Favoris']].concat(R.CATEGORIES.map((c) => [c.id, c.label])).map((c) => { const n = c[0] === 'fav' ? R.all(S).filter((r) => R.isFav(S, r.id)).length : c[0] ? R.all(S).filter((r) => R.category(r) === c[0]).length : R.all(S).length; return n ? '<button type="button" class="chip" data-action="r-cat" data-c="' + c[0] + '" aria-pressed="' + ((ui.rCat || '') === c[0]) + '">' + esc(c[1]) + ' <span class="muted">' + n + '</span></button>' : ''; }).join('') + '</div>' +
        '<div id="recipe-list">' + recipeListHTML(list) + '</div></section>' +
      legal + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Plan alimentaire                                                     */
  /* ------------------------------------------------------------------ */

  function vPlan() {
    const st = S.planSettings || FD.planner.defaultSettings(S);
    const recOpts = (meal) => [['', 'Varier']].concat(R.all(S).filter((r) => r.meals.includes(meal)).map((r) => [r.id, r.name]));
    const plan = S.plan;
    let body = '';
    if (plan) {
      body = plan.days.map((d, di) => {
        const t = FD.planner.dayTotals(d);
        const meals = d.meals.map((m, mi) => {
          const r = m.recipeId && R.byId(S, m.recipeId);
          return '<div class="plan-meal"><div class="between"><span><strong>' + esc(m.label) + '</strong>' + (m.tag ? ' <span class="badge">' + esc(m.tag) + '</span>' : '') + '</span><span class="small muted">' + U.num(m.totals.kcal) + ' / ≈ ' + U.kcal(m.target.kcal) + ' kcal · P ' + U.num(m.totals.p) + ' g</span></div>' +
            '<span>' + esc(r ? r.name : 'Aucune recette compatible') + (m.batched ? ' <span class="badge">batch · déjà préparé</span>' : '') + (r && r.source && r.source.collection ? ' <span class="badge">' + esc(r.source.collection) + '</span>' : '') + '</span>' +
            '<details' + (ui.planOpen === di + '-' + mi ? ' open' : '') + '><summary class="small">Ingrédients et remplacements</summary><div class="stack" style="gap:6px">' + m.ingredients.map((ing, ii) => {
              const subs = R.substitutesFor(S, ing.foodId);
              return '<div class="between small"><span>' + ingLabel(ing) + '</span>' + (subs.length ? '<select data-change="plan-sub" data-d="' + di + '" data-m="' + mi + '" data-i="' + ii + '" style="width:auto;min-height:36px" aria-label="Remplacer"><option value="">Remplacer…</option>' + subs.map((s) => '<option value="' + esc(s.id) + '">' + esc(F.displayName(s)) + '</option>').join('') + '</select>' : '') + '</div>';
            }).join('') + '</div></details>' +
            '<div class="inline" style="gap:6px"><button class="btn sm" data-action="plan-alt" data-d="' + di + '" data-m="' + mi + '">Autre idée</button><button class="btn sm ghost" data-action="plan-log" data-d="' + di + '" data-m="' + mi + '">Ajouter au journal</button>' + (r ? '<button class="btn sm ghost" data-action="r-open" data-id="' + esc(r.id) + '" data-go="recettes">Recette</button>' : '') + '</div></div>';
        }).join('');
        const dev = (t.kcal - d.target.kcal) / d.target.kcal * 100;
        const dayCost = d.meals.reduce((a, m) => a + FD.prices.mealCost(S, m.ingredients).total, 0);
        return '<section class="card"><div class="card-head"><h2>' + esc(U.frDate(d.iso, { weekday: 'long', day: 'numeric', month: 'short' })) + '</h2><span class="badge">' + esc(d.type) + '</span></div>' +
          '<p class="small">' + macroLine(t, true) + ' — cible ' + U.kcal(d.target.kcal) + ' kcal, P ' + d.target.p + ' g (' + (Math.abs(dev) < 5 ? 'dans la cible' : signed(Math.round(dev), 0, '%')) + ') · ≈ ' + U.num(dayCost, 2) + ' €</p>' +
          meals + '<div><button class="btn sm" data-action="plan-log-day" data-d="' + di + '">Ajouter la journée au journal</button></div></section>';
      }).join('');
    }
    return '<div class="container">' +
      '<div class="page-head"><div><h1>Plan alimentaire</h1><p class="sub">Cibles par repas selon la séance du jour, portions ajustées, ingrédients réutilisés d\'un repas à l\'autre.</p></div>' + (plan ? '<a class="btn" href="#/courses">Liste de courses</a>' : '') + '</div>' +
      '<form class="card" data-form="plan"><div class="form-grid">' +
        '<label>Durée<select name="days">' + opts([[1, '1 jour'], [3, '3 jours'], [7, '7 jours']], st.days) + '</select></label>' +
        '<label>À partir du<input type="date" name="start" value="' + (plan ? plan.start : today()) + '"></label>' +
        '<label>Repas par jour<select name="mealsPerDay">' + opts([[3, '3'], [4, '4'], [5, '5']], st.mealsPerDay) + '</select></label>' +
        '<label>Budget<select name="budget">' + opts([['eco', 'Économique'], ['moyen', 'Moyen'], ['premium', 'Premium']], st.budget) + '</select></label>' +
        '<label>Petit-déjeuner<select name="fixPetitdej">' + opts(recOpts('petitdej'), st.fixed.petitdej || '') + '</select></label>' +
        '<label>Dîner<select name="fixDiner">' + opts(recOpts('diner'), st.fixed.diner || '') + '</select></label>' +
        '<label>Recettes<select name="pool">' + opts([['all', 'Toutes'], ['fav', 'Privilégier mes favoris']].concat(Object.keys(R.collections(S)).reduce((a, c) => a.concat([['prefer:' + c, 'Privilégier ' + c], ['only:' + c, 'Uniquement ' + c]]), [])).concat([['app', 'Recettes de l\'app'], ['user', 'Mes recettes']]), st.pool || 'all') + '</select></label>' +
        '<label>Batch cooking<select name="batch">' + opts([[0, 'Non : repas variés chaque jour'], [2, 'Déjeuner identique 2 jours'], [3, 'Déjeuner identique 3 jours'], [4, 'Déjeuner identique 4 jours']], st.batch === true ? 2 : (parseInt(st.batch, 10) || 0)) + '</select></label>' +
      '</div><p class="small muted">Chaque journée respecte ton plafond de ' + U.num(S.profile.kcalMax) + ' kcal et vise la cible de sa séance ; le dernier repas est recalé sur ce qu\'il reste. Exclusions, allergies et régime du profil sont respectés. Un budget serré écarte d\'abord les ingrédients premium, jamais les protéines.</p>' +
      '<div class="inline"><button class="btn primary" type="submit">' + (plan ? 'Régénérer le plan' : 'Générer le plan') + '</button>' + (plan ? '<button type="button" class="btn ghost danger" data-action="plan-clear">Supprimer le plan</button>' : '') + '</div></form>' +
      (plan ? (function () { const pc = FD.prices.planCost(S, plan); const wb = FD.prices.weeklyBudget(S); const b = wb ? wb * plan.days.length / 7 : null;
        return '<section class="card tight"><p>Coût estimé du plan : <strong>≈ ' + U.num(pc.total, 2) + ' €</strong>' + (b ? ' pour un budget de ' + U.num(b, 0) + ' € sur ' + plan.days.length + ' jour(s)' + (pc.total > b * 1.05 ? ' — au-dessus : passe le budget sur « Économique » ou ajuste tes prix.' : ' — dans le budget.') : ' (renseigne un budget hebdomadaire dans ton profil pour le comparer).') + '</p><p class="small muted">Coût proratisé à la quantité consommée, à partir de tes prix ou de prix indicatifs.</p></section>'; })() : '') +
      (body || '<section class="card dashed"><p>Choisis une durée puis génère ton plan : chaque repas sera calibré sur la cible de ta séance du jour.</p></section>') +
      legal + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Courses                                                              */
  /* ------------------------------------------------------------------ */

  function vCourses() {
    if (!S.plan) return '<div class="container"><div class="page-head"><div><h1>Courses</h1></div></div><section class="card dashed"><p>La liste se construit à partir de ton plan alimentaire.</p><div><a class="btn primary" href="#/plan">Générer un plan</a></div></section></div>';
    const list = FD.shopping.build(S, S.plan);
    const checked = S.shopping.checked || {};
    const done = list.groups.reduce((a, g) => a + g.items.filter((i) => checked[i.id]).length, 0);
    return '<div class="container">' +
      '<div class="page-head"><div><h1>Courses</h1><p class="sub">Plan de ' + S.plan.days.length + ' jour' + (S.plan.days.length > 1 ? 's' : '') + ' à partir du ' + esc(U.frDate(S.plan.start, { day: 'numeric', month: 'long' })) + ' · ' + done + '/' + list.count + ' cochés</p></div>' +
        '<div class="inline"><button class="btn" data-action="shop-copy">Copier la liste</button><button class="btn" data-action="shop-dl">Télécharger</button><button class="btn ghost" data-action="shop-reset">Tout décocher</button></div></div>' +
      (function () {
        const wb = FD.prices.weeklyBudget(S);
        const budget = wb ? wb * S.plan.days.length / 7 : null;
        return '<section class="card tight"><div class="between"><span class="mid-num">≈ ' + U.num(list.cost, 2) + ' €</span>' + (budget ? '<span class="badge ' + (list.cost > budget * 1.05 ? 'warn' : 'ok') + '">budget ' + U.num(budget, 0) + ' € sur ' + S.plan.days.length + ' j</span>' : '') + '</div>' +
          '<p class="small muted">Coût estimé au poids : ' + list.costUser + ' prix saisis par toi, ' + (list.count - list.costMissing - list.costUser) + ' prix indicatifs, ' + list.costMissing + ' sans prix. Les conditionnements du magasin peuvent faire varier le total.</p></section>';
      })() +
      '<section class="card tight"><p class="small">' + list.count + ' articles · ' + list.reused + ' réutilisés dans au moins 3 repas · ' + list.tiers.eco + ' économiques, ' + list.tiers.moyen + ' moyens, ' + list.tiers.premium + ' premium. Les féculents et viandes notés cuits dans le plan sont convertis en poids cru à acheter.</p></section>' +
      list.groups.map((g) => '<section class="card"><h2>' + esc(g.label) + '</h2><div class="stack" style="gap:0">' + g.items.map((i) =>
        '<label class="check shop-item"><input type="checkbox" data-change="shop-check" data-id="' + esc(i.id) + '"' + (checked[i.id] ? ' checked' : '') + '><span class="between" style="flex:1"><span' + (checked[i.id] ? ' class="muted" style="text-decoration:line-through"' : '') + '>' + esc(i.name) + (i.note ? ' <span class="small muted">(' + esc(i.note) + ')</span>' : '') + '</span><span class="inline" style="gap:10px"><span class="small muted">' + (i.cost !== null ? '≈ ' + U.num(i.cost, 2) + ' €' : 'sans prix') + '</span><strong>' + esc(i.qty) + '</strong></span></span></label>').join('') + '</div></section>').join('') +
      '<details class="card"><summary>Mes prix</summary><p class="small muted">Saisis tes prix réels : ils remplacent les prix indicatifs et affinent le coût du plan et de la liste.</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Article</th><th class="num">Prix (€)</th><th>Par</th><th>Source</th></tr></thead><tbody>' +
        list.groups.reduce((a, g) => a.concat(g.items), []).map((i) => {
          const pr = i.priceInfo || { price: '', per: 'kg', source: '—' };
          const pers = [['kg', 'kg'], ['L', 'litre']].concat(i.food.unitG ? [['unite', i.food.unitLabel || 'unité']] : []);
          return '<tr><td>' + esc(i.name) + '</td><td class="num"><input type="text" inputmode="decimal" value="' + (pr.price !== '' ? U.num(pr.price, 2) : '') + '" data-change="price-edit" data-id="' + esc(i.id) + '" data-field="price" style="width:90px" aria-label="Prix de ' + esc(i.name) + '"></td>' +
            '<td><select data-change="price-edit" data-id="' + esc(i.id) + '" data-field="per" aria-label="Unité de prix">' + opts(pers, pr.per) + '</select></td><td class="small">' + (pr.source === 'utilisateur' ? 'toi' + (pr.date ? ', ' + esc(U.frShort(pr.date)) : '') : pr.source === 'indicatif' ? '<span class="muted">indicatif</span>' : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div></details>' +
      legal + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Ciqual (dans Paramètres)                                             */
  /* ------------------------------------------------------------------ */

  function ciqualHTML() {
    const meta = S.meta.ciqual;
    const C = window.FD_CIQUAL;
    const sugg = FD.ciqual.suggestLinks(S);
    const linkedCount = sugg.filter((x) => x.effective).length;
    let html = '<section class="card"><h2>Table Ciqual</h2>' +
      (meta ? '<p>Table importée : ' + U.num(meta.count) + ' aliments (' + esc(meta.version || 'CIQUAL') + ', le ' + esc(U.frShort(meta.importedAt.slice(0, 10))) + '). Elle remplace la table intégrée.</p>'
        : (C ? '<p><strong>' + esc(C.version) + '</strong> est intégrée à l\'app : ' + U.num(C.rows.length) + ' aliments disponibles hors ligne, dont des centaines de plats composés, sandwichs, soupes, pizzas et desserts.</p>' : '')) +
      '<p class="small muted">' + linkedCount + ' aliments de base utilisent les valeurs Ciqual ; les autres gardent des valeurs indicatives. Une table plus récente peut être importée en CSV depuis <a href="https://ciqual.anses.fr/" target="_blank" rel="noopener">ciqual.anses.fr</a> (Excel → enregistrer en CSV, séparateur point-virgule).</p>' +
      '<div class="inline" style="align-items:flex-end"><label style="flex:0 1 220px">Nom de la version<input type="text" id="ciq-label" value="' + esc(ui.ciqLabel || 'CIQUAL') + '" data-change="ciq-label" placeholder="ex. CIQUAL 2026"></label>' +
      '<label class="btn" style="flex-direction:row">Importer un CSV Ciqual<input type="file" accept=".csv,text/csv" data-change="ciqual-file" class="sr-only"></label>' +
      (meta ? '<button class="btn ghost danger" data-action="ciq-remove">Revenir à la table intégrée</button>' : '') + '</div>' +
      '<details' + (ui.ciqOpen ? ' open' : '') + '><summary>Correspondances des aliments de base</summary>' +
      '<div class="table-wrap"><table><thead><tr><th>Aliment de base</th><th>Valeurs utilisées</th><th></th></tr></thead><tbody>' +
      sugg.map((x) => '<tr><td>' + esc(F.displayName(x.demo)) + '</td><td class="small">' + (x.effective ? 'Ciqual : ' + esc(x.effective.ciqualName) : '<span class="muted">Valeur indicative de l\'app</span>' + (x.suggestion ? '<br><span class="muted">proposé : ' + esc(x.suggestion.base) + '</span>' : '')) + '</td>' +
        '<td class="num">' + (x.effective ? '<button class="btn sm ghost" data-action="ciq-unlink" data-id="' + esc(x.demo.id) + '">Délier</button>' : x.suggestion ? '<button class="btn sm" data-action="ciq-link" data-id="' + esc(x.demo.id) + '" data-cid="' + esc(x.suggestion.id) + '">Lier</button>' : '') +
        '<button class="btn sm ghost" data-action="ciq-manual" data-id="' + esc(x.demo.id) + '">Choisir…</button></td></tr>' +
        (ui.ciqManual === x.demo.id ? '<tr><td colspan="3"><label>Rechercher dans Ciqual<input type="search" id="ciq-q" value="' + esc(ui.ciqQuery || '') + '" data-input="ciqq" autocomplete="off"></label><div id="ciq-results">' + ciqResultsHTML() + '</div></td></tr>' : '')).join('') +
      '</tbody></table></div></details>';
    return html + '</section>';
  }

  function ciqResultsHTML() {
    const res = ui.ciqQuery ? FD.ciqual.search(S, ui.ciqQuery, 15) : [];
    if (!ui.ciqQuery) return '';
    if (!res.length) return '<p class="small muted">Aucun aliment Ciqual trouvé.</p>';
    return '<div class="results">' + res.map((c) => '<button type="button" data-action="ciq-link" data-id="' + esc(ui.ciqManual) + '" data-cid="' + esc(c.id) + '"><span>' + esc(c.base) + '</span><span class="small muted">' + U.num(c.kcal) + ' kcal · P ' + U.num(c.p, 1) + ' /100 g</span></button>').join('') + '</div>';
  }

  /** Ajoute une liste d'ingrédients au journal d'une date. */
  function logIngredients(iso, meal, ings, recipe, label) {
    let n = 0;
    const group = recipe ? { id: U.uid(), recipeId: recipe.id, name: recipe.name, label: label || '1 portion', scale: 1 } : null;
    ings.forEach((i) => { const f = F.byId(S, i.foodId); if (f) { T.addFood(S, iso, f, i.qty, i.unit, meal, group); n++; } });
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Routeur                                                              */
  /* ------------------------------------------------------------------ */

  const VIEWS = { tableau: vTableau, journal: vJournal, plan: vPlan, recettes: vRecettes, courses: vCourses, semaine: vSemaine, suivi: vSuivi, coach: vCoach, profil: vProfil, parametres: vParametres };

  function currentRoute() {
    const r = (location.hash || '#/tableau').replace('#/', '');
    return VIEWS[r] ? r : 'tableau';
  }

  function render() {
    if (FD.scanner && FD.scanner.isActive()) FD.scanner.stop();
    ui.route = currentRoute();
    const view = document.getElementById('view');
    try {
      view.innerHTML = VIEWS[ui.route]();
    } catch (e) {
      console.error(e);
      view.innerHTML = '<div class="container"><div class="alert danger"><strong>Cette page n\'a pas pu s\'afficher</strong>' +
        'Cause probable : des fichiers de versions différentes (mise à jour incomplète ou ancien fichier gardé en cache par le navigateur). ' +
        'Recharge la page en forçant (ordinateur : Cmd + Maj + R ; iPhone : fermer l\'onglet puis rouvrir), et vérifie que tous les fichiers du dossier ont bien été remplacés sur GitHub.' +
        '<br><br><span class="small">Détail technique : ' + esc(e && e.message ? e.message : String(e)) + '</span></div></div>';
      return;
    }
    document.querySelectorAll('.nav a').forEach((a) => {
      if (a.getAttribute('href') === '#/' + ui.route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (ui.route === 'suivi') { drawSuivi(); fillPhotos(); }
    if (ui.route === 'recettes' || ui.route === 'journal' || ui.route === 'tableau') fillRecipePhotos();
  }

  /* ------------------------------------------------------------------ */
  /* Événements                                                           */
  /* ------------------------------------------------------------------ */

  const view = document.getElementById('view');

  function formValues(form) {
    const fd = new FormData(form);
    const o = {};
    for (const [k, v] of fd.entries()) {
      if (o[k] !== undefined) o[k] = [].concat(o[k], v); else o[k] = v;
    }
    return o;
  }

  function pickFood(group) {
    group = Object.assign({}, group, { variants: group.variants.map((v) => F.inheritUnits(S, v)) });
    ui.pick = group;
    ui.variantId = group.variants.length === 1 ? group.variants[0].id : null;
    const f = group.variants[0];
    const du = F.defaultUnit(f); ui.unit = du.unit; ui.qty = du.qty;
  }

  view.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    switch (a) {
      case 'jprev': ui.jDate = U.addDays(ui.jDate, -1); ui.subEntry = null; render(); break;
      case 'jnext': ui.jDate = U.addDays(ui.jDate, 1); ui.subEntry = null; render(); break;
      case 'jtoday': ui.jDate = today(); render(); break;
      case 'tab': ui.tab = el.dataset.tab; ui.pick = null; render(); break;
      case 'pick': pickFood(ui.results[+el.dataset.idx]); render(); focusSoon('#pick-qty'); break;
      case 'qty-chip': ui.qty = U.frac(+el.dataset.v); render(); break;
      case 'variant': {
        ui.variantId = el.dataset.id;
        const fv = ui.pick && ui.pick.variants.find((x) => x.id === ui.variantId);
        if (fv && F.toBaseQty(fv, 1, ui.unit) === null) { const du = F.defaultUnit(fv); ui.unit = du.unit; ui.qty = du.qty; }
        render(); break;
      }
      case 'cancel-pick': ui.pick = null; ui.variantId = null; render(); break;
      case 'add-food': {
        const f = ui.pick && ui.pick.variants.find((v) => v.id === ui.variantId);
        const qty = U.parseNum(ui.qty);
        if (!f || !qty || qty <= 0) { toast('Indique une quantité valide.'); break; }
        if (F.toBaseQty(f, qty, ui.unit) === null) { toast('Cette unité n\'est pas disponible pour cet aliment.'); break; }
        if (f.source === 'off' && !S.customFoods.some((x) => x.id === f.id)) S.customFoods.push(f);
        T.addFood(S, ui.jDate, f, qty, ui.unit, ui.meal);
        ui.pick = null; ui.variantId = null;
        commit(F.displayName(f) + ' ajouté.');
        break;
      }
      case 'off-pick': pickFood({ key: 'off', name: ui.off.results[+el.dataset.idx].base, variants: [ui.off.results[+el.dataset.idx]] }); render(); break;
      case 'add-tpl': {
        const t = S.templates.find((x) => x.id === el.dataset.id);
        if (t) { T.addTemplate(S, ui.jDate, t); commit(t.name + ' ajouté.'); }
        break;
      }
      case 'grp-toggle': ui.openGroups = ui.openGroups || {}; ui.openGroups[el.dataset.id] = !ui.openGroups[el.dataset.id]; render(); break;
      case 'grp-del': T.removeGroup(S, ui.jDate, el.dataset.id); commit('Repas supprimé.'); break;
      case 'entry-del': T.removeFood(S, ui.jDate, el.dataset.id); commit('Supprimé.'); break;
      case 'entry-sub': ui.subEntry = el.dataset.id || null; render(); break;
      case 'apply-option': {
        const r = FD.coach.evaluateUserState(S, today());
        const o = r.options[+el.dataset.idx];
        if (o && o.apply) { FD.history.apply(S, r, o); commit('Appliqué : ' + o.applyLabel); }
        break;
      }
      case 'reeval': FD.history.record(S, FD.coach.evaluateUserState(S, today())); commit('Analyse mise à jour.'); break;
      case 'theme': S.settings.theme = el.dataset.v; applyTheme(); commit(); break;
      case 'export': FD.storage.exportJSON(S); toast('Export téléchargé.'); break;
      case 'sync-now': syncNow(true); break;
      case 'sync-photos': syncPhotosNow(true); break;
      case 'sync-off':
        if (!confirm('Désactiver la synchronisation sur cet appareil ? Tes données locales et celles en ligne sont conservées.')) break;
        FD.sync.clearCfg(); render(); toast('Synchronisation désactivée sur cet appareil.'); break;
      case 'demo':
        if (Object.keys(S.days).length && !confirm('Remplacer ton historique par des données de démonstration ?')) break;
        T.loadDemo(S, today()); S.decisions = []; S.checkins = {}; commit('Données de démo chargées.'); break;
      case 'clear-days':
        if (!confirm('Effacer tout l\'historique (journal, mesures, décisions) ? Le profil est conservé.')) break;
        S.days = {}; S.decisions = []; S.checkins = {}; S.meta.demoData = false; commit('Historique effacé.'); break;
      case 'reset':
        if (!confirm('Tout réinitialiser ? Cette action est définitive.')) break;
        S = FD.storage.reset(); applyTheme(); commit('Application réinitialisée.'); break;
      case 'restore-types': S.sessionTypes = FD.storage.defaultSessionTypes(); commit('Types de séance restaurés.'); break;
      case 'reset-offset': S.profile.kcalOffset = 0; commit('Ajustement annulé.'); break;
      case 'track-edit': ui.trackDate = el.dataset.date; render(); window.scrollTo({ top: 0 }); break;
      case 'track-clear':
        if (!confirm('Effacer les mesures de ce jour ? (le journal alimentaire est conservé)')) break;
        T.clearMetrics(S, el.dataset.date); commit('Mesures effacées.'); break;

      // --- Recettes ---
      case 'cd-add-one': {
        const o = ui.cd && ui.cd.options[+el.dataset.idx];
        const m = o && o.meals[+el.dataset.m];
        if (!m) break;
        logIngredients(ui.jDate, m.meal, m.fit.ingredients, m.recipe, 'portion ajustée');
        commit('« ' + m.recipe.name + ' » ajouté. Les suggestions se recalculent pour le repas suivant.');
        break;
      }
      case 'cd-add': {
        const o = ui.cd && ui.cd.options[+el.dataset.idx];
        if (!o) break;
        o.meals.forEach((m) => logIngredients(ui.jDate, m.meal, m.fit.ingredients, m.recipe, 'portion ajustée'));
        commit(o.meals.map((m) => m.recipe.name).join(' + ') + ' ajoutés au journal.');
        break;
      }
      case 'jr-cat': ui.jrCat = el.dataset.c; render(); break;
      case 'jr-add':
      case 'jr-fit': {
        const r = R.byId(S, el.dataset.id);
        if (!r) break;
        let ings;
        if (a === 'jr-fit') ings = R.fit(S, r, mealFitTarget(ui.jDate, ui.meal)).ingredients;
        else {
          const sel = document.getElementById('jrq-' + r.id);
          const k = sel ? parseFloat(sel.value) || 1 : 1;
          ings = R.perServing(r).map((i) => Object.assign({}, i, { qty: R.roundQty(i.qty * k, i.unit, F.byId(S, i.foodId)) }));
        }
        const sel2 = document.getElementById('jrq-' + r.id);
        logIngredients(ui.jDate, ui.meal, ings, r, a === 'jr-fit' ? 'portion ajustée' : (U.frac(sel2 ? parseFloat(sel2.value) || 1 : 1) + ' portion' + ((sel2 && parseFloat(sel2.value) > 1) ? 's' : '')));
        commit('« ' + r.name + ' » ajouté au ' + N.MEALS.find((m) => m.id === ui.meal).label.toLowerCase() + '.');
        break;
      }
      case 'sug-add': {
        const x = ui.sug[+el.dataset.idx];
        if (x) { logIngredients(x.iso, x.meal, x.fit.ingredients, x.recipe, 'portion ajustée'); commit(x.recipe.name + ' ajouté au journal.'); }
        break;
      }
      case 'r-open': ui.recipe = el.dataset.id; ui.rIngsFor = null; ui.editor = null; if (el.dataset.go) location.hash = '#/' + el.dataset.go; else { render(); window.scrollTo({ top: 0 }); } break;
      case 'r-close': ui.recipe = null; ui.rIngsFor = null; render(); break;
      case 'r-cat': ui.rCat = el.dataset.c; render(); break;
      case 'fav': { const on = R.toggleFav(S, el.dataset.id); const r = R.byId(S, el.dataset.id); commit((on ? '★ Ajouté aux favoris' : 'Retiré des favoris') + (r ? ' : ' + r.name : '') + '.'); break; }
      case 'r-photo-del': tombstone('r:' + el.dataset.id); FD.photos.removeRecipePhoto(el.dataset.id).then(() => { schedulePhotoSync(); toast('Photo retirée : illustration rétablie.'); render(); }); break;
      case 'r-col-remove': {
        const c = el.dataset.c;
        if (!confirm('Retirer toutes les recettes de la collection « ' + c + ' » ?')) break;
        S.recipes = S.recipes.filter((r) => !(r.source && r.source.collection === c)); ui.rCollection = ''; ui.recipe = null;
        commit('Collection retirée.');
        break;
      }
      case 'r-reset': ui.rIngsFor = null; render(); break;
      case 'r-log':
      case 'r-log-fit': {
        const r = R.byId(S, ui.recipe);
        if (!r) break;
        const meal = ui.rMeal || r.meals[0];
        const base = ui.rIngs.map((i) => Object.assign({}, i, { qty: i.qty / r.servings }));
        let ings;
        if (a === 'r-log-fit') {
          const tg = C.dayTarget(S, today());
          const mt = N.mealTargets(tg, S.profile.trainingTime, tg.type.cat !== 'repos')[meal];
          ings = R.fit(S, r, mt, base).ingredients;
        } else ings = base.map((i) => Object.assign({}, i, { qty: R.roundQty(i.qty, i.unit, F.byId(S, i.foodId)) }));
        logIngredients(today(), meal, ings, r, a === 'r-log-fit' ? 'portion ajustée' : '1 portion');
        commit('1 portion de « ' + r.name + ' » ajoutée au journal.');
        break;
      }
      case 'r-save-copy': {
        const r = R.byId(S, ui.recipe);
        if (!r) break;
        const copy = Object.assign(JSON.parse(JSON.stringify(r)), { id: 'u-' + U.uid(), name: r.name + ' (ma version)', ingredients: ui.rIngs.map((i) => Object.assign({}, i)), source: { type: 'user', label: 'Saisie utilisateur', date: today() } });
        S.recipes.push(copy); ui.recipe = copy.id; ui.rIngsFor = null;
        commit('Recette enregistrée dans tes recettes.');
        break;
      }
      case 'r-new': ui.editor = { name: '', servings: 1, prep: 10, cook: 10, difficulty: 'facile', meals: ['dejeuner'], ingredients: [], steps: [] }; ui.edQuery = ''; ui.recipe = null; render(); window.scrollTo({ top: 0 }); break;
      case 'r-edit': { const r = R.byId(S, el.dataset.id); if (r) { ui.editor = JSON.parse(JSON.stringify(Object.assign({}, r, { author: r.source && r.source.author, url: r.source && r.source.url }))); ui.recipe = null; render(); window.scrollTo({ top: 0 }); } break; }
      case 'r-delete':
        if (!confirm('Supprimer cette recette ?')) break;
        S.recipes = S.recipes.filter((r) => r.id !== el.dataset.id); ui.recipe = null; commit('Recette supprimée.'); break;
      case 'ed-cancel': ui.editor = null; render(); break;
      case 'ed-add': {
        const f = ui.edResults[+el.dataset.idx];
        if (!f) break;
        const role = ['viandes', 'poissons'].includes(f.cat) || f.p >= 10 ? 'prot' : f.cat === 'feculents' || f.cat === 'fruits' ? 'carb' : f.l >= 50 ? 'fat' : f.cat === 'legumes' ? 'veg' : 'other';
        syncEditorFields();
        { const du = F.defaultUnit(f); ui.editor.ingredients.push({ foodId: f.id, qty: +du.qty, unit: du.unit, role }); }
        if (f.source === 'off' && !S.customFoods.some((x) => x.id === f.id)) S.customFoods.push(f);
        ui.edQuery = ''; render(); focusSoon('#ed-q');
        break;
      }
      case 'ed-remove': syncEditorFields(); ui.editor.ingredients.splice(+el.dataset.idx, 1); render(); break;

      // --- Plan ---
      case 'plan-alt': { FD.planner.alternative(S, S.plan, +el.dataset.d, +el.dataset.m); commit('Nouvelle idée proposée.'); break; }
      case 'plan-log': {
        const d = S.plan.days[+el.dataset.d], m = d.meals[+el.dataset.m];
        logIngredients(d.iso, m.meal, m.ingredients, R.byId(S, m.recipeId), 'portion du plan'); commit(m.label + ' du ' + U.frShort(d.iso) + ' ajouté au journal.');
        break;
      }
      case 'plan-log-day': {
        const d = S.plan.days[+el.dataset.d];
        d.meals.forEach((m) => logIngredients(d.iso, m.meal, m.ingredients, R.byId(S, m.recipeId), 'portion du plan')); commit('Journée du ' + U.frShort(d.iso) + ' ajoutée au journal.');
        break;
      }
      case 'plan-clear': if (!confirm('Supprimer le plan ?')) break; S.plan = null; S.shopping.checked = {}; commit('Plan supprimé.'); break;

      // --- Courses ---
      case 'shop-copy': {
        const txt = FD.shopping.asText(FD.shopping.build(S, S.plan));
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Liste copiée.'), () => toast('Copie impossible : utilise « Télécharger ».'));
        else toast('Copie impossible : utilise « Télécharger ».');
        break;
      }
      case 'shop-dl': {
        const blob = new Blob([FD.shopping.asText(FD.shopping.build(S, S.plan))], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'courses-' + S.plan.start + '.txt';
        document.body.appendChild(link); link.click(); setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 500);
        break;
      }
      case 'shop-reset': S.shopping.checked = {}; commit(); break;

      // --- Scanner ---
      case 'scan-start': {
        const box = document.getElementById('scan-box'), video = document.getElementById('scan-video');
        if (!video) break;
        box.hidden = false; ui.scan = { msg: 'Vise le code-barres, bien éclairé, à 10–15 cm.', error: null, loading: false };
        FD.scanner.start(video, (code) => { box.hidden = true; lookupBarcode(code); }).catch((e) => {
          box.hidden = true;
          ui.scan = { msg: null, loading: false, error: e && e.name === 'NotAllowedError' ? 'Accès à la caméra refusé. Autorise-le dans le navigateur, ou photographie le code.' : 'Caméra indisponible (' + (e && e.message ? e.message : 'erreur') + '). Photographie le code ou saisis-le.' };
          render();
        });
        break;
      }
      case 'scan-stop': FD.scanner.stop(); { const box = document.getElementById('scan-box'); if (box) box.hidden = true; } break;

      // --- Photos ---
      case 'photo-view': ui.photoView = el.dataset.v; document.querySelectorAll('[data-action="photo-view"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === ui.photoView))); fillPhotos(); break;
      case 'photo-del':
        if (!confirm('Supprimer cette photo ?')) break;
        tombstone('p:' + el.dataset.id); FD.photos.remove(el.dataset.id).then(() => { toast('Photo supprimée.'); fillPhotos(); schedulePhotoSync(); });
        break;
      case 'photos-export':
        FD.photos.exportAll().then((data) => {
          if (!data.photos.length && !(data.recipes || []).length) { toast('Aucune photo à exporter.'); return; }
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'fitdiet-photos-' + today() + '.json';
          document.body.appendChild(link); link.click(); setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 500);
        }).catch((e) => toast(e.message));
        break;

      // --- Ciqual ---
      case 'ciq-link': ui.ciqOpen = true; S.foodLinks[el.dataset.id] = el.dataset.cid; ui.ciqManual = null; ui.ciqQuery = ''; commit('Aliment lié à Ciqual.'); break;
      case 'ciq-unlink': ui.ciqOpen = true; S.foodLinks[el.dataset.id] = null; commit('Aliment délié : valeurs indicatives de l\'app rétablies.'); break;
      case 'ciq-manual': ui.ciqOpen = true; ui.ciqManual = ui.ciqManual === el.dataset.id ? null : el.dataset.id; ui.ciqQuery = ''; render(); focusSoon('#ciq-q'); break;
      case 'ciq-link-all': {
        let n = 0;
        FD.ciqual.suggestLinks(S).forEach((x) => { if (x.suggestion && !x.effective) { S.foodLinks[x.demo.id] = x.suggestion.id; n++; } });
        commit(n + ' aliment(s) liés à Ciqual.');
        break;
      }
      case 'ciq-remove':
        if (!confirm('Retirer la table importée et revenir à la table Ciqual intégrée ?')) break;
        S.customFoods = S.customFoods.filter((f) => f.source !== 'ciqual'); S.foodLinks = {}; delete S.meta.ciqual; commit('Table Ciqual intégrée rétablie.'); break;
      default: break;
    }
  });

  view.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-change]');
    if (!el) return;
    const c = el.dataset.change;
    switch (c) {
      case 'jdate': if (el.value) { ui.jDate = el.value; render(); } break;
      case 'day-session':
      case 'week-session': {
        const iso = el.dataset.date;
        const planned = S.weekPlan[U.weekdayKey(iso)];
        const d = T.ensureDay(S, iso);
        if (el.value === planned) delete d.session; else d.session = el.value;
        commit('Séance mise à jour : ' + C.sessionType(S, el.value).label + '.');
        break;
      }
      case 'plan': S.weekPlan[el.dataset.day] = el.value; commit('Semaine type mise à jour.'); break;
      case 'type-field': {
        const t = S.sessionTypes.find((x) => x.id === el.dataset.id);
        if (!t) break;
        const f = el.dataset.field;
        if (f === 'label') t.label = el.value.trim() || t.label;
        else if (f === 'cat') t.cat = el.value;
        else { const n = U.parseNum(el.value); if (n !== null && n > 0) t[f] = Math.round(n); }
        commit();
        break;
      }
      case 'grp-scale': { const k = parseFloat(el.value); if (k > 0) { T.scaleGroup(S, ui.jDate, el.dataset.id, k); commit('Portion mise à jour, macros recalculées.'); } break; }
      case 'entry-qty': {
        const n = U.parseNum(el.value);
        if (n && n > 0) { T.updateFood(S, ui.jDate, el.dataset.id, { qty: n }); commit(); } else render();
        break;
      }
      case 'entry-sub-select': {
        const f = F.byId(S, el.value);
        if (f) { T.substitute(S, ui.jDate, el.dataset.id, f); ui.subEntry = null; commit('Remplacé par ' + F.displayName(f) + ', macros recalculées.'); }
        break;
      }
      case 'pick-qty': ui.qty = el.value; render(); break;
      case 'pick-unit': ui.unit = el.value; render(); break;
      case 'pick-meal': ui.meal = el.value; render(); break;
      case 'track-date': if (el.value) { ui.trackDate = el.value; render(); } break;
      case 'import': {
        const file = el.files && el.files[0];
        if (!file) break;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = FD.storage.parseImport(reader.result);
            if (!confirm('Remplacer toutes les données actuelles par celles du fichier ?')) return;
            S = data; applyTheme(); commit('Données importées.');
          } catch (e) { toast(e.message); }
        };
        reader.readAsText(file);
        break;
      }

      case 'r-servings': { const n = parseInt(el.value, 10); if (n > 0) { ui.rServings = n; render(); } break; }
      case 'r-meal': ui.rMeal = el.value; break;
      case 'r-filter': ui.rFilterMeal = el.value; render(); break;
      case 'r-collection': ui.rCollection = el.value; render(); break;
      case 'r-photo': {
        const file = el.files && el.files[0];
        if (!file) break;
        FD.photos.setRecipePhoto(el.dataset.id, file).then(() => { toast(syncOK() ? 'Photo enregistrée (synchronisation dans quelques secondes).' : 'Photo enregistrée sur cet appareil.'); fillRecipePhotos(); schedulePhotoSync(); }).catch((e) => toast(e.message));
        break;
      }
      case 'r-photos-bulk': {
        const files = Array.from(el.files || []);
        if (!files.length) break;
        const recipes = R.all(S);
        const byId = {}, byName = {};
        recipes.forEach((r) => { byId[U.norm(r.id)] = r; byName[U.norm(r.name).replace(/[^a-z0-9]+/g, '')] = r; });
        let ok = 0; const miss = [];
        (async () => {
          for (const f of files) {
            const stem = U.norm(f.name.replace(/\.[^.]+$/, ''));
            const r = byId[stem] || byName[stem.replace(/[^a-z0-9]+/g, '')];
            if (!r) { miss.push(f.name); continue; }
            try { await FD.photos.setRecipePhoto(r.id, f); ok++; } catch (e) { miss.push(f.name); }
          }
          schedulePhotoSync(3000);
          toast(ok + ' photo(s) associée(s)' + (miss.length ? ' · ' + miss.length + ' non reconnue(s) : ' + miss.slice(0, 3).join(', ') + (miss.length > 3 ? '…' : '') : '') + '.');
          render();
        })();
        break;
      }
      case 'r-import': {
        const file = el.files && el.files[0];
        if (!file) break;
        file.text().then((t) => {
          const res = R.importCollection(S, JSON.parse(t));
          if (res.collection) ui.rCollection = res.collection;
          commit(res.recipes + ' recettes importées' + (res.missing.length ? ' (' + res.missing.length + ' ingrédient(s) introuvable(s))' : '') + '.');
        }).catch((e) => toast(e.message || 'Import impossible.'));
        break;
      }
      case 'r-sub': {
        if (!el.value) break;
        const idx = +el.dataset.idx;
        ui.rIngs[idx] = FD.recipes.substitute(S, ui.rIngs[idx], el.value);
        render(); toast('Ingrédient remplacé, macros recalculées.');
        break;
      }
      case 'ed-qty': { const n = U.parseNum(el.value); syncEditorFields(); if (n > 0) ui.editor.ingredients[+el.dataset.idx].qty = n; render(); break; }
      case 'ed-unit': syncEditorFields(); ui.editor.ingredients[+el.dataset.idx].unit = el.value; render(); break;
      case 'ed-role': syncEditorFields(); ui.editor.ingredients[+el.dataset.idx].role = el.value; break;
      case 'ed-servings': { syncEditorFields(); render(); break; }
      case 'plan-sub': {
        if (!el.value) break;
        const m = S.plan.days[+el.dataset.d].meals[+el.dataset.m];
        ui.planOpen = el.dataset.d + '-' + el.dataset.m;
        m.ingredients[+el.dataset.i] = FD.recipes.substitute(S, m.ingredients[+el.dataset.i], el.value);
        FD.planner.recompute(S, m);
        commit('Ingrédient remplacé, macros recalculées.');
        break;
      }
      case 'shop-check': S.shopping.checked[el.dataset.id] = el.checked; if (!el.checked) delete S.shopping.checked[el.dataset.id]; commit(); break;
      case 'scan-file': {
        const file = el.files && el.files[0];
        if (!file) break;
        ui.scan = { msg: 'Lecture du code…', error: null, loading: false }; render();
        FD.scanner.decodeFile(file).then((code) => {
          if (code) lookupBarcode(code);
          else { ui.scan = { msg: null, loading: false, error: 'Aucun code-barres lisible sur la photo. Recadre au plus près, sans reflet, ou saisis les chiffres.' }; render(); }
        }).catch((e) => { ui.scan = { msg: null, loading: false, error: e.message }; render(); });
        break;
      }
      case 'price-edit': {
        const id = el.dataset.id;
        const cur = FD.prices.get(S, id) || { price: null, per: 'kg' };
        const next = { price: cur.price, per: cur.per, date: today() };
        if (el.dataset.field === 'price') { const n = U.parseNum(el.value); if (n === null) { delete S.prices[id]; commit('Prix retiré : retour au prix indicatif.'); break; } next.price = n; }
        else next.per = el.value;
        if (!(next.price > 0)) { toast('Indique un prix positif.'); break; }
        S.prices[id] = next;
        commit('Prix enregistré.');
        break;
      }
      case 'photos-import': {
        const file = el.files && el.files[0];
        if (!file) break;
        file.text().then((t) => FD.photos.importAll(JSON.parse(t))).then((n) => { toast(n + ' photo(s) importée(s).'); schedulePhotoSync(3000); }).catch((e) => toast(e.message || 'Import impossible.'));
        break;
      }
      case 'ciq-label': ui.ciqLabel = el.value.trim() || 'CIQUAL'; break;
      case 'ciqual-file': {
        const file = el.files && el.files[0];
        if (!file) break;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const res = FD.ciqual.parse(reader.result, ui.ciqLabel);
            if (!res.foods.length) throw new Error('Aucun aliment exploitable dans ce fichier.');
            FD.ciqual.store(S, res.foods);
            commit(U.num(res.foods.length) + ' aliments Ciqual importés' + (res.skipped ? ' (' + res.skipped + ' lignes ignorées, valeurs manquantes)' : '') + '.');
          } catch (e) { toast(e.message); }
        };
        reader.readAsText(file, 'utf-8');
        break;
      }
      default: break;
    }
  });

  view.addEventListener('input', (ev) => {
    const el = ev.target.closest('[data-input]');
    if (!el) return;
    if (el.dataset.input === 'q') {
      ui.query = el.value;
      const box = document.getElementById('food-results');
      if (box) box.innerHTML = resultsHTML();
    }
    if (el.dataset.input === 'jrq') {
      ui.jrQuery = el.value;
      const box = document.getElementById('jr-list');
      if (box) { box.innerHTML = journalRecipesHTML(ui.jDate); fillRecipePhotos(); }
    }
    if (el.dataset.input === 'rq') {
      ui.rQuery = el.value;
      const list = filteredRecipes();
      const box = document.getElementById('recipe-list');
      if (box) { box.innerHTML = recipeListHTML(list); fillRecipePhotos(); }
    }
    if (el.dataset.input === 'edq') {
      ui.edQuery = el.value;
      const box = document.getElementById('ed-results');
      if (box) box.innerHTML = edResultsHTML(ui.edQuery ? F.search(S, ui.edQuery, 8).reduce((a, g) => a.concat(g.variants), []).slice(0, 12) : []);
    }
    if (el.dataset.input === 'ciqq') {
      ui.ciqQuery = el.value;
      const box = document.getElementById('ciq-results');
      if (box) box.innerHTML = ciqResultsHTML();
    }
  });

  view.addEventListener('submit', (ev) => {
    const form = ev.target.closest('form[data-form]');
    if (!form) return;
    ev.preventDefault();
    const v = formValues(form);
    const num = U.parseNum;
    switch (form.dataset.form) {
      case 'quick': {
        const iso = today();
        T.setMetrics(S, iso, { weight: num(v.weight), steps: num(v.steps) !== null ? Math.round(num(v.steps)) : null, water: num(v.water), trainingDone: !!v.trainingDone || null });
        if (num(v.weight) !== null) S.profile.weight = num(v.weight);
        commit('Enregistré.');
        break;
      }
      case 'track': {
        const iso = v.date || ui.trackDate;
        const planned = S.weekPlan[U.weekdayKey(iso)];
        T.setMetrics(S, iso, {
          weight: num(v.weight), waist: num(v.waist), waistConditions: v.waistConditions || null, sleep: num(v.sleep),
          hunger: num(v.hunger), steps: num(v.steps) !== null ? Math.round(num(v.steps)) : null,
          session: v.session && v.session !== planned ? v.session : null, trainingDone: !!v.trainingDone || null,
          minutes: num(v.minutes), perf: v.perf || null, otherActivity: v.otherActivity || null, otherMinutes: num(v.otherMinutes),
          water: num(v.water), manualKcal: num(v.manualKcal), manualProtein: num(v.manualProtein)
        });
        const last = FD.trends.lastValue(S, 'weight');
        if (last) S.profile.weight = last.v;
        commit('Journée du ' + U.frShort(iso) + ' enregistrée.');
        break;
      }
      case 'free': {
        if (!v.name || num(v.kcal) === null) { toast('Indique au moins un nom et les calories.'); break; }
        T.addFree(S, ui.jDate, { name: v.name.trim(), kind: v.kind, meal: v.meal, kcal: num(v.kcal), p: num(v.p) || 0, g: num(v.g) || 0, l: num(v.l) || 0 });
        commit('Ajouté à ta journée.');
        break;
      }
      case 'off': {
        ui.off.query = v.q || '';
        ui.off.loading = true; ui.off.error = null; ui.off.results = []; ui.pick = null;
        render();
        FD.api.searchOFF(ui.off.query).then((res) => {
          ui.off.results = res;
          if (!res.length) ui.off.error = 'Aucun produit avec des valeurs nutritionnelles complètes pour cette recherche.';
        }).catch((e) => {
          ui.off.error = FD.api.errorText(e);
        }).finally(() => { ui.off.loading = false; if (ui.route === 'journal') render(); });
        break;
      }
      case 'checkin': {
        const week = U.isoWeekKey(today());
        S.checkins[week] = {
          hunger: num(v.hunger), energy: num(v.energy), performance: v.performance || null, sleep: num(v.sleep), cravings: v.cravings || null,
          stress: v.stress || null, hardMeals: (v.hardMeals || '').trim(), cannotMoveMore: !!v.cannotMoveMore, symptoms: !!v.symptoms, foodConcern: !!v.foodConcern,
          date: today()
        };
        FD.history.record(S, FD.coach.evaluateUserState(S, today()));
        commit('Réponses enregistrées, analyse mise à jour.');
        break;
      }
      case 'profile': {
        const p = S.profile;
        const n = (k, dec) => { const x = num(v[k]); return x === null ? p[k] : (dec ? x : Math.round(x)); };
        Object.assign(p, {
          name: (v.name || '').trim(), sex: v.sex, age: n('age'), height: n('height'), weight: n('weight', true), targetWeight: n('targetWeight', true),
          waist: n('waist', true), targetWaist: n('targetWaist', true), job: v.job, steps: n('steps'), stepsGoal: n('stepsGoal'),
          strengthPerWeek: n('strengthPerWeek'), runPerWeek: n('runPerWeek'), sessionMinutes: n('sessionMinutes'), trainingTime: v.trainingTime || p.trainingTime,
          goal: v.goal, pace: v.pace, kcalMin: n('kcalMin'), kcalMax: n('kcalMax'), proteinG: n('proteinG'), fatG: num(v.fatG) > 0 ? Math.round(num(v.fatG)) : null, fiberG: n('fiberG'), mealsPerDay: n('mealsPerDay'),
          diet: v.diet, allergies: v.allergies || '', intolerances: v.intolerances || '', excluded: v.excluded || '', preferred: v.preferred || '',
          budget: v.budget || '', cookTime: v.cookTime || '', equipment: [].concat(v.equipment || []),
          pregnancy: !!v.pregnancy, medicalCondition: !!v.medicalCondition, medication: !!v.medication
        });
        if (p.kcalMin > p.kcalMax) { const x = p.kcalMin; p.kcalMin = p.kcalMax; p.kcalMax = x; }
        commit('Profil enregistré.');
        break;
      }
      case 'coachcfg': {
        const c = S.settings.coach;
        c.stableWeekPct = num(v.stableWeekPct) || c.stableWeekPct;
        c.waistStableCm = num(v.waistStableCm) || c.waistStableCm;
        c.adherenceMin = num(v.adherenceMin) || c.adherenceMin;
        c.proteinMin = num(v.proteinMin) || c.proteinMin;
        commit('Réglages enregistrés.');
        break;
      }

      case 'sync': {
        const btn = form.querySelector('button[type=submit]');
        if (btn) { btn.disabled = true; btn.textContent = 'Connexion…'; }
        FD.sync.connect((v.token || '').trim(), v.pass || '').then(async (res) => {
          if (res.remote && res.remote.data) {
            const remote = await FD.sync.pull();
            const when = remote && remote.meta && remote.meta.updatedAt ? new Date(remote.meta.updatedAt).toLocaleString('fr-FR') : '?';
            if (confirm('Des données existent déjà en ligne (modifiées le ' + when + ').\n\nOK : les récupérer sur cet appareil (remplace les données actuelles de cet appareil).\nAnnuler : envoyer les données de cet appareil à la place.')) adoptRemote(remote, 'Synchronisation activée : données récupérées.');
            else { await FD.sync.push(S); render(); toast('Synchronisation activée : données de cet appareil envoyées.'); }
          } else { await FD.sync.push(S); render(); toast('Synchronisation activée : données envoyées.'); }
        }).then(() => schedulePhotoSync(1500)).catch((e) => { FD.sync.clearCfg(); toast(e.message); render(); });
        break;
      }
      case 'barcode': {
        const code = String(v.code || '').replace(/\D/g, '');
        if (!/^\d{8,14}$/.test(code)) { toast('Un code-barres compte 8 à 14 chiffres.'); break; }
        lookupBarcode(code);
        break;
      }
      case 'photo': {
        const file = form.elements.file.files[0];
        if (!file) { toast('Choisis une photo.'); break; }
        ui.photoView = v.view;
        FD.photos.add(file, v.date || today(), v.view).then(() => { toast('Photo ajoutée.'); form.reset(); fillPhotos(); schedulePhotoSync(); }).catch((e) => toast(e.message));
        break;
      }
      case 'recipe': {
        syncEditorFields(form);
        const e = ui.editor;
        if (!e.name.trim()) { toast('Donne un nom à la recette.'); break; }
        if (!e.ingredients.length) { toast('Ajoute au moins un ingrédient.'); break; }
        if (!e.meals.length) e.meals = ['dejeuner'];
        const ext = e.author || e.url;
        const rec = { id: e.id && e.id.startsWith('u-') ? e.id : 'u-' + U.uid(), name: e.name.trim(), meals: e.meals, servings: Math.max(1, e.servings || 1), prep: e.prep || 0, cook: e.cook || 0,
          difficulty: e.difficulty || 'facile', tags: e.tags || [], ingredients: e.ingredients, steps: e.steps,
          source: ext ? { type: 'external', label: 'Recette externe saisie par l\'utilisateur', author: e.author || null, url: e.url || null, date: today() } : { type: 'user', label: 'Saisie utilisateur', date: today() } };
        const i = S.recipes.findIndex((r) => r.id === rec.id);
        if (i >= 0) S.recipes[i] = rec; else S.recipes.push(rec);
        ui.editor = null; ui.recipe = rec.id; ui.rIngsFor = null;
        commit('Recette enregistrée.');
        break;
      }
      case 'plan': {
        const settings = {
          days: parseInt(v.days, 10) || 7, mealsPerDay: parseInt(v.mealsPerDay, 10) || 4, budget: v.budget || 'moyen',
          fixed: { petitdej: v.fixPetitdej || '', diner: v.fixDiner || '' }, seed: Math.floor(Math.random() * 100000), pool: v.pool || 'all', batch: parseInt(v.batch, 10) || 0
        };
        S.planSettings = settings;
        S.plan = FD.planner.generate(S, settings, v.start || today());
        S.shopping.checked = {};
        commit('Plan de ' + settings.days + ' jour' + (settings.days > 1 ? 's' : '') + ' généré.');
        break;
      }
      default: break;
    }
  });

  /** Liste des recettes regroupée par catégorie. */
  function recipeListHTML(list) {
    if (!list.length) return '<p class="muted">Aucune recette ne correspond.</p>';
    return R.CATEGORIES.map((c) => {
      const items = list.filter((r) => R.category(r) === c.id);
      return items.length ? '<h3 class="cat-title">' + esc(c.label) + ' <span class="muted small">' + items.length + '</span></h3><div class="cards">' + items.map(recipeCard).join('') + '</div>' : '';
    }).join('');
  }

  function filteredRecipes() {
    return R.all(S).filter((r) => {
      if (ui.rCat === 'fav') { if (!R.isFav(S, r.id)) return false; } else if (ui.rCat && R.category(r) !== ui.rCat) return false;
      if (ui.rFilterMeal && !r.meals.includes(ui.rFilterMeal)) return false;
      if (ui.rQuery && !U.norm(r.name).includes(U.norm(ui.rQuery))) return false;
      const src = r.source || {};
      if (ui.rCollection === 'app' && src.type && src.type !== 'app') return false;
      if (ui.rCollection === 'user' && (src.type !== 'user')) return false;
      if (ui.rCollection && !['app', 'user'].includes(ui.rCollection) && src.collection !== ui.rCollection) return false;
      return true;
    });
  }

  /** Affiche les photos de recettes (IndexedDB) dans les vignettes et la fiche ouverte. */
  function fillRecipePhotos() {
    if (!FD.photos || !document.querySelector('[data-photo], #recipe-photo')) return;
    FD.photos.recipePhotos().then((all) => {
      ui.recipePhotoUrls.forEach((u) => URL.revokeObjectURL(u));
      ui.recipePhotoUrls = [];
      const map = {};
      all.forEach((p) => { map[p.id] = p.blob; });
      const url = (b) => { const u = URL.createObjectURL(b); ui.recipePhotoUrls.push(u); return u; };
      document.querySelectorAll('[data-photo]').forEach((el) => {
        const b = map[el.dataset.photo];
        if (b) { el.style.backgroundImage = 'url(' + url(b) + ')'; el.classList.add('has-photo'); el.innerHTML = ''; }
      });
      const big = document.getElementById('recipe-photo');
      if (big) {
        const b = map[big.dataset.id];
        if (b) { big.innerHTML = '<img src="' + url(b) + '" alt="Photo de la recette">'; const note = document.getElementById('recipe-art-note'); if (note) note.hidden = true; }
      }
    }).catch(() => {});
  }

  /** Recherche un code-barres : produits déjà connus d'abord, puis Open Food Facts. */
  function lookupBarcode(code) {
    const known = (S.customFoods || []).find((f) => f.barcode === code);
    if (known) {
      pickFood({ key: 'off-' + code, name: known.base, variants: [known] });
      ui.scan = { msg: 'Produit déjà connu (code ' + code + ') : ' + F.displayName(known) + '. Vérifie la quantité puis confirme.', error: null, loading: false };
      render(); return;
    }
    ui.scan = { msg: null, error: null, loading: true }; ui.pick = null; render();
    FD.api.byBarcode(code).then((p) => {
      if (p) {
        pickFood({ key: 'off-' + code, name: p.base, variants: [p] });
        ui.scan = { msg: 'Produit identifié : ' + F.displayName(p) + ' (code ' + code + '). Vérifie que c\'est bien le bon produit, puis confirme.', error: null, loading: false };
      } else ui.scan = { msg: null, loading: false, error: 'Code ' + code + ' introuvable dans Open Food Facts, ou fiche sans valeurs nutritionnelles complètes. Utilise la saisie libre avec les valeurs de l\'étiquette.' };
    }).catch((e) => {
      ui.scan = { msg: null, loading: false, error: FD.api.errorText(e) };
    }).finally(() => { if (ui.route === 'journal') render(); });
  }

  /** Recopie les champs du formulaire d'édition dans ui.editor (avant un re-rendu). */
  function syncEditorFields(form) {
    const f = form || document.querySelector('form[data-form="recipe"]');
    if (!f || !ui.editor) return;
    const v = formValues(f);
    Object.assign(ui.editor, {
      name: v.name || '', servings: parseInt(v.servings, 10) || 1, prep: parseInt(v.prep, 10) || 0, cook: parseInt(v.cook, 10) || 0,
      difficulty: v.difficulty || 'facile', meals: [].concat(v.meals || []), steps: String(v.steps || '').split('\n').map((x) => x.trim()).filter(Boolean),
      author: (v.author || '').trim(), url: (v.url || '').trim()
    });
  }

  function focusSoon(sel) { setTimeout(() => { const e = document.querySelector(sel); if (e) e.focus(); }, 30); }

  window.addEventListener('hashchange', () => { render(); document.getElementById('view').focus({ preventScroll: true }); window.scrollTo({ top: 0 }); });
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (ui.route === 'suivi') drawSuivi(); }, 150); });

  applyTheme();
  render();
  if (syncOK()) syncNow(false);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && syncOK() && Date.now() - lastPullAt > 20000) syncNow(false); });
})();
