/**
 * trainingView.js — Interface de l'onglet Séances (séance du jour, programme, exercices)
 * et minuteur de repos. S'appuie sur FD.training pour toute la logique.
 * Les actions sont préfixées « tr- » et écoutées sur #view ; app.js fournit FD.app (état, enregistrement, rendu).
 */
window.FD = window.FD || {};

FD.trainingView = (function () {
  const U = FD.utils, T = FD.training, esc = U.esc;
  const A = () => FD.app;
  const S = () => FD.app.state();

  const tv = { tab: 'jour', date: U.todayISO(), editId: null, addQuery: '', addTarget: null, libQuery: '', libGroup: '', exDetail: null };

  const SCHEMES = { topset: 'Top set puis −10 %', straight: 'Séries à charge fixe' };
  const LOAD_LABEL = { charge: 'kg', lest: 'lest kg', pdc: 'kg' };

  function restText(sec) {
    sec = +sec || 0;
    const m = Math.floor(sec / 60), s = sec % 60;
    return m ? m + '\u2019' + (s ? String(s).padStart(2, '0') + '\u2019\u2019' : '') : s + '\u2019\u2019';
  }
  function kgText(n) { return U.num(n, n % 1 ? 1 : 0); }
  function setsLine(sets) {
    return sets.map((s) => (typeof s.kg === 'number' ? kgText(s.kg) + ' kg' : 'PDC') + (typeof s.reps === 'number' ? ' × ' + s.reps : '')).join(' · ');
  }
  function sessionLabel(id) { const t = (S().sessionTypes || []).find((x) => x.id === id); return t ? t.label : '—'; }

  /** Photo animée : départ et arrivée du mouvement alternés. */
  function anim(ex, cls) {
    const a = T.imageSrc(ex, 0), b = T.imageSrc(ex, 1);
    if (!a) return '<div class="tr-anim ' + (cls || '') + ' tr-noimg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg></div>';
    return '<div class="tr-anim ' + (cls || '') + '" role="img" aria-label="' + esc(ex.name) + ' : position de départ puis d\'arrivée"><img src="' + a + '" alt="" loading="lazy"><img class="tr-f2" src="' + b + '" alt="" loading="lazy"></div>';
  }
  function thumb(ex) {
    const a = T.imageSrc(ex, 1);
    return a ? '<img class="tr-thumb" src="' + a + '" alt="" loading="lazy">' : '<span class="tr-thumb tr-noimg"></span>';
  }

  /* ------------------------------------------------------------------ */
  /* Vue principale                                                       */
  /* ------------------------------------------------------------------ */
  function view() {
    const st = S();
    T.ensure(st);
    const tabs = [['jour', 'Séance du jour'], ['mobilite', 'Mobilité'], ['programme', 'Programme'], ['exercices', 'Exercices']];
    let body;
    if (tv.tab === 'programme') body = tv.editId && T.workout(st, tv.editId) ? vEdit() : vProgramme();
    else if (tv.tab === 'exercices') body = tv.exDetail ? vExercise() : vLibrary();
    else if (tv.tab === 'mobilite') body = vMobility();
    else body = vDay();
    return '<div class="container">' +
      '<div class="page-head"><div><h1>Séances</h1><p class="sub">Ton programme, tes charges série par série, et ce qu\'il faut viser la prochaine fois.</p></div></div>' +
      '<div class="tabs" role="tablist">' + tabs.map((t) => '<button type="button" role="tab" aria-selected="' + (tv.tab === t[0]) + '" data-action="tr-tab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      body + '</div>';
  }

  /* ---------------- Séance du jour ---------------- */
  function workoutOptions(selected, emptyLabel) {
    return '<option value="">' + esc(emptyLabel || 'Aucune séance') + '</option>' + T.workouts(S()).map((w) => '<option value="' + esc(w.id) + '"' + (w.id === selected ? ' selected' : '') + '>' + esc(w.name) + '</option>').join('');
  }

  function vDay() {
    const st = S(), iso = tv.date;
    const w = T.workoutFor(st, iso), planned = T.plannedFor(st, iso);
    const lg = T.log(st, iso);
    const head = '<section class="card tight"><div class="between" style="align-items:center;flex-wrap:wrap">' +
      '<div class="inline"><button class="btn icon-btn" data-action="tr-prev" aria-label="Jour précédent">‹</button>' +
      '<strong style="min-width:150px;text-align:center">' + esc(U.frDate(iso, { weekday: 'long', day: 'numeric', month: 'long' })) + '</strong>' +
      '<button class="btn icon-btn" data-action="tr-next" aria-label="Jour suivant">›</button>' + (iso !== U.todayISO() ? '<button class="btn sm" data-action="tr-today">Aujourd\'hui</button>' : '') + '</div>' +
      '<label class="inline small" style="gap:8px">Séance<select data-change="tr-day-workout" style="width:auto">' + workoutOptions(w ? w.id : '', 'Repos / aucune') + '</select></label></div>' +
      (w && planned && planned.id !== w.id ? '<p class="small muted">Prévu ce jour : ' + esc(planned.name) + '. Remplacé pour cette date seulement.</p>' : '') + '</section>';

    if (!T.workouts(st).length) {
      return head + '<section class="card dashed"><h2>Aucune séance enregistrée</h2><p>Importe ton fichier de programme (le même que pour les recettes) ou crée ta première séance dans « Programme ».</p>' +
        '<div class="inline"><label class="btn primary" style="flex-direction:row">Importer un programme<input type="file" accept="application/json,.json" data-change="tr-import" class="sr-only"></label><button class="btn" data-action="tr-new">Créer une séance</button></div></section>';
    }
    if (!w) return head + '<section class="card dashed"><p>Pas de séance de musculation ce jour. Choisis-en une au-dessus si tu t\'entraînes quand même.</p></section>';

    const vol = T.volume(st, iso);
    const summary = '<section class="card"><div class="card-head"><h2>' + esc(w.name) + '</h2><div class="inline" style="gap:6px"><span class="badge">' + esc(sessionLabel(w.sessionType)) + '</span>' + (lg && lg.done ? '<span class="badge ok">Faite</span>' : '') + '</div></div>' +
      '<p class="small muted">' + w.slots.length + ' exercices · ' + w.slots.reduce((a, s) => a + s.sets.length, 0) + ' séries' + (vol.sets ? ' · ' + vol.sets + ' séries notées · ' + U.num(vol.tonnage) + ' kg soulevés' : '') + '</p>' +
      '<p class="small muted">Tape tes charges et tes répétitions : les champs vides montrent ce qui est proposé. Une série notée sans charge reprend la charge proposée.</p></section>';

    const groups = {};
    w.slots.forEach((s) => { if (s.group) groups[s.group] = (groups[s.group] || 0) + 1; });
    const seen = {};
    const cards = w.slots.map((slot) => {
      let tag = '';
      if (slot.group && groups[slot.group] > 1) { seen[slot.group] = (seen[slot.group] || 0) + 1; tag = slot.group + seen[slot.group]; }
      return slotCard(slot, tag);
    }).join('');

    const foot = '<section class="card tight"><div class="inline">' +
      (lg && lg.done ? '<button class="btn" data-action="tr-finish" data-v="0">Marquer comme non faite</button>' : '<button class="btn primary" data-action="tr-finish" data-v="1">Séance terminée</button>') +
      '<span class="small muted">« Terminée » coche la séance dans ton suivi et règle la cible du jour sur ' + esc(sessionLabel(w.sessionType)) + '.</span></div></section>';
    return head + summary + '<div class="stack" style="gap:16px">' + cards + '</div>' + foot;
  }

  function slotCard(slot, tag) {
    const st = S(), iso = tv.date;
    const exId = T.currentEx(st, iso, slot), ex = T.exercise(st, exId);
    const e = T.entry(st, iso, slot);
    const sug = T.suggestions(st, iso, slot);
    const last = T.lastPerf(st, exId, iso), hint = T.hint(st, iso, slot);
    const variants = [slot.ex].concat(slot.alts || []);
    const unit = LOAD_LABEL[ex.load] || 'kg';
    const rows = slot.sets.map((target, i) => {
      const s = (e && e.sets[i]) || {};
      return '<tr><td class="muted">' + (i + 1) + '</td><td>' + esc(target) + '</td>' +
        '<td><input type="text" inputmode="decimal" class="tr-in" aria-label="Série ' + (i + 1) + ', charge" data-change="tr-set" data-slot="' + esc(slot.id) + '" data-i="' + i + '" data-f="kg" value="' + (typeof s.kg === 'number' ? kgText(s.kg) : '') + '" placeholder="' + (sug[i] !== null ? kgText(sug[i]) : ex.load === 'pdc' ? 'PDC' : '—') + '"></td>' +
        '<td><input type="text" inputmode="numeric" class="tr-in" aria-label="Série ' + (i + 1) + ', répétitions" data-change="tr-set" data-slot="' + esc(slot.id) + '" data-i="' + i + '" data-f="reps" value="' + (typeof s.reps === 'number' ? s.reps : '') + '" placeholder="' + esc((T.range(target) || {}).max || '') + '"></td></tr>';
    }).join('');
    return '<article class="card tr-ex" id="slot-' + esc(slot.id) + '">' +
      '<div class="tr-ex-top">' + anim(ex) +
        '<div class="stack" style="gap:6px;min-width:0;flex:1">' +
          '<div class="inline" style="gap:8px">' + (tag ? '<span class="badge warn">' + esc(tag) + '</span>' : '') + '<h3>' + esc(ex.name) + '</h3></div>' +
          (variants.length > 1 ? '<label class="small inline" style="gap:6px">Variante<select data-change="tr-variant" data-slot="' + esc(slot.id) + '" style="width:auto">' + variants.map((v) => '<option value="' + esc(v) + '"' + (v === exId ? ' selected' : '') + '>' + esc(T.exercise(st, v).name) + '</option>').join('') + '</select></label>' : '') +
          '<p class="small muted">' + esc(ex.muscles || '') + '</p>' +
          '<p class="small"><strong>' + slot.sets.length + ' séries</strong> · ' + esc(slot.sets.join(' / ')) + ' reps · repos ' + restText(slot.rest) + (slot.scheme === 'topset' ? ' · <span class="accent">top set puis −10 %</span>' : '') + '</p>' +
          (slot.note ? '<p class="small tr-note">' + esc(slot.note) + '</p>' : '') +
          (last ? '<p class="small">Dernière fois (' + esc(U.frShort(last.iso)) + ') : ' + esc(setsLine(last.sets)) + '</p>' : '<p class="small muted">Première fois : trouve une charge qui laisse 1 à 2 répétitions en réserve.</p>') +
          (hint ? '<p class="small teal">' + esc(hint) + '</p>' : '') +
        '</div></div>' +
      '<div class="table-wrap"><table class="tr-sets"><thead><tr><th>Série</th><th>Objectif</th><th>' + unit + '</th><th>Reps</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="inline"><button class="btn sm" data-action="tr-rest" data-s="' + (+slot.rest || 90) + '" data-l="' + esc(ex.name) + '">Repos ' + restText(slot.rest) + '</button>' +
        (ex.cues && ex.cues.length ? '<details class="tr-cues"><summary class="small">Consignes</summary><ul class="small">' + ex.cues.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul></details>' : '') +
        '<button class="btn sm ghost" data-action="tr-ex-open" data-id="' + esc(exId) + '">Historique</button></div>' +
      '</article>';
  }

  /* ---------------- Mobilité ---------------- */
  function vMobility() {
    const st = S(), Mo = FD.mobility, iso = tv.date, m = Mo.ensure(st);
    const s = Mo.sessionFor(st, iso), planned = Mo.session(m.week[U.weekdayKey(iso)]);
    const opts = (sel, empty) => '<option value="">' + esc(empty) + '</option>' + Mo.sessions().map((x) => '<option value="' + x.id + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(x.name) + ' · ' + x.minutes + ' min</option>').join('');
    const head = '<section class="card tight"><div class="between" style="align-items:center;flex-wrap:wrap">' +
      '<div class="inline"><button class="btn icon-btn" data-action="tr-prev" aria-label="Jour précédent">‹</button>' +
      '<strong style="min-width:150px;text-align:center">' + esc(U.frDate(iso, { weekday: 'long', day: 'numeric', month: 'long' })) + '</strong>' +
      '<button class="btn icon-btn" data-action="tr-next" aria-label="Jour suivant">›</button>' + (iso !== U.todayISO() ? '<button class="btn sm" data-action="tr-today">Aujourd\'hui</button>' : '') + '</div>' +
      '<label class="inline small" style="gap:8px">Mobilité<select data-change="tr-mob-day" style="width:auto">' + opts(s ? s.id : '', 'Aucune') + '</select></label></div>' +
      (s && planned && planned.id !== s.id ? '<p class="small muted">Prévu ce jour : ' + esc(planned.name) + '. Remplacé pour cette date seulement.</p>' : '') + '</section>';
    let body = '';
    if (!s) body = '<section class="card dashed"><p>Pas de mobilité prévue ce jour.</p></section>';
    else {
      const p = Mo.progress(st, iso), list = Mo.items(s);
      let part = null;
      const rows = list.map((it) => {
        let sub = '';
        if (it.part !== part) { part = it.part; sub = it.part === 'base' ? '<h3 class="mob-sub">Routine de base · 10 min, sans pause</h3>' : it.part === 'bloc' ? '<h3 class="mob-sub">Bloc ciblé · 5 min</h3>' : ''; }
        const ex = Mo.exercise(it.n), done = Mo.isDone(st, iso, it.key), sec = Mo.seconds(it.dose);
        return sub + '<article class="mob-item' + (done ? ' done' : '') + '"><img src="' + Mo.imageSrc(it.n) + '" alt="Illustration : ' + esc(ex.name) + '" loading="lazy">' +
          '<div class="stack" style="gap:6px;min-width:0;flex:1"><div class="inline" style="gap:8px"><span class="mob-n">' + it.n + '</span><h3>' + esc(ex.name) + '</h3></div>' +
          '<p class="mob-dose">' + esc(it.dose) + '</p>' +
          '<details><summary class="small">Comment et pourquoi</summary><p class="small">' + esc(ex.how || '') + '</p><p class="small muted"><strong>Pourquoi :</strong> ' + esc(ex.why || '') + '</p></details>' +
          '<div class="inline"><label class="check"><input type="checkbox" data-change="tr-mob-check" data-k="' + it.key + '"' + (done ? ' checked' : '') + '>Fait</label>' +
          (sec ? '<button class="btn sm" data-action="tr-rest" data-s="' + sec + '" data-l="' + esc(ex.name) + '">Minuteur ' + restText(sec) + '</button>' : '') + '</div></div></article>';
      }).join('');
      body = '<section class="card"><div class="card-head"><h2>' + esc(s.name) + '</h2><span id="mob-badge" class="badge' + (p.done === p.total ? ' ok' : '') + '">' + p.done + ' / ' + p.total + '</span></div>' +
        '<div class="track" aria-hidden="true"><div id="mob-fill" class="fill p" style="width:' + Math.round(p.done / Math.max(1, p.total) * 100) + '%"></div></div>' +
        '<p class="small muted">≈ ' + s.minutes + ' min · ' + esc(s.when || '') + ' Intensité 6-7/10, jamais de douleur vive.</p></section>' +
        '<div class="stack" style="gap:12px">' + rows + '</div>';
    }
    const week = '<section class="card"><div class="card-head"><h2>Ma semaine mobilité</h2><span class="small muted">' + Mo.weekCount(st, U.todayISO()) + ' séance(s) faite(s) sur 7 jours</span></div><div class="tr-week">' +
      U.WEEK_ORDER.map((k) => '<label>' + U.WEEKDAY_SHORT[k] + '<select data-change="tr-mob-week" data-day="' + k + '">' + opts(m.week[k] || '', '—') + '</select></label>').join('') + '</div>' +
      '<p class="small muted">' + esc(Mo.data().intro) + '</p></section>' +
      '<section class="card"><h2>Points importants</h2>' + Mo.data().notes.map((n) => '<details><summary><strong>' + esc(n[0]) + '</strong></summary><p class="small">' + esc(n[1]) + '</p></details>').join('') + '</section>';
    return head + body + week;
  }

  /* ---------------- Programme ---------------- */
  function vProgramme() {
    const st = S(), t = T.ensure(st);
    const week = '<section class="card"><div class="card-head"><h2>Ma semaine</h2></div>' +
      '<div class="tr-week">' + U.WEEK_ORDER.map((k) => '<label>' + U.WEEKDAY_SHORT[k] + '<select data-change="tr-week" data-day="' + k + '">' + workoutOptions(t.week[k] || '', '—') + '</select></label>').join('') + '</div>' +
      '<p class="small muted">Associer une séance à un jour règle aussi le type de journée (cibles caloriques, glucides) dans Semaine. Les jours « — » gardent le type choisi dans Semaine (course, repos…).</p></section>';
    const list = t.workouts.length ? t.workouts.map((w) => {
      const days = U.WEEK_ORDER.filter((k) => t.week[k] === w.id).map((k) => U.WEEKDAY_SHORT[k]);
      return '<section class="card tight"><div class="card-head"><h3>' + esc(w.name) + '</h3><div class="inline" style="gap:6px">' + (days.length ? '<span class="badge ok">' + esc(days.join(', ')) + '</span>' : '') + '<span class="badge">' + esc(sessionLabel(w.sessionType)) + '</span>' + (w.collection ? '<span class="badge">' + esc(w.collection) + '</span>' : '') + '</div></div>' +
        '<div class="tr-mini">' + w.slots.map((s) => { const ex = T.exercise(st, s.ex); return '<div class="tr-mini-row">' + thumb(ex) + '<span>' + esc(ex.name) + (s.alts && s.alts.length ? ' <span class="muted">ou ' + esc(s.alts.map((a) => T.exercise(st, a).name).join(', ')) + '</span>' : '') + '</span><span class="small muted">' + esc(T.setsText(s.sets)) + '</span></div>'; }).join('') + '</div>' +
        '<div class="inline"><button class="btn sm" data-action="tr-edit" data-id="' + esc(w.id) + '">Modifier</button><button class="btn sm ghost" data-action="tr-dup" data-id="' + esc(w.id) + '">Dupliquer</button><button class="btn sm ghost danger" data-action="tr-del" data-id="' + esc(w.id) + '">Supprimer</button></div></section>';
    }).join('') : '<section class="card dashed"><p>Aucune séance pour l\'instant.</p></section>';
    return week + '<div class="between" style="align-items:center"><h2>Mes séances</h2><div class="inline"><label class="btn" style="flex-direction:row">Importer un programme<input type="file" accept="application/json,.json" data-change="tr-import" class="sr-only"></label><button class="btn primary" data-action="tr-new">Nouvelle séance</button></div></div>' + list;
  }

  function vEdit() {
    const st = S(), w = T.workout(st, tv.editId);
    const typeOpts = (st.sessionTypes || []).map((t) => '<option value="' + esc(t.id) + '"' + (t.id === w.sessionType ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('');
    const slots = w.slots.map((s, i) => {
      const ex = T.exercise(st, s.ex);
      return '<div class="tr-edit-row">' + thumb(ex) +
        '<div class="stack" style="gap:8px;flex:1;min-width:0">' +
          '<div class="between" style="align-items:center"><strong>' + esc(ex.name) + '</strong><div class="inline" style="gap:4px">' +
            '<button class="btn sm ghost" data-action="tr-up" data-slot="' + esc(s.id) + '"' + (i ? '' : ' disabled') + ' aria-label="Monter">↑</button>' +
            '<button class="btn sm ghost" data-action="tr-down" data-slot="' + esc(s.id) + '"' + (i < w.slots.length - 1 ? '' : ' disabled') + ' aria-label="Descendre">↓</button>' +
            '<button class="btn sm ghost danger" data-action="tr-rm" data-slot="' + esc(s.id) + '" aria-label="Retirer">✕</button></div></div>' +
          '<div class="tr-edit-grid">' +
            '<label>Séries (reps)<input type="text" value="' + esc(T.setsText(s.sets)) + '" data-change="tr-s" data-slot="' + esc(s.id) + '" data-f="sets" placeholder="4-6, 6-8, 8-10 ou 3x8-12"></label>' +
            '<label>Méthode<select data-change="tr-s" data-slot="' + esc(s.id) + '" data-f="scheme">' + Object.keys(SCHEMES).map((k) => '<option value="' + k + '"' + (k === s.scheme ? ' selected' : '') + '>' + SCHEMES[k] + '</option>').join('') + '</select></label>' +
            '<label>Repos (s)<input type="number" min="0" step="15" value="' + (+s.rest || 0) + '" data-change="tr-s" data-slot="' + esc(s.id) + '" data-f="rest"></label>' +
            '<label>Superset<input type="text" maxlength="2" value="' + esc(s.group || '') + '" data-change="tr-s" data-slot="' + esc(s.id) + '" data-f="group" placeholder="A, B…"></label>' +
          '</div>' +
          '<label class="small">Note<input type="text" value="' + esc(s.note || '') + '" data-change="tr-s" data-slot="' + esc(s.id) + '" data-f="note" placeholder="Tempo, technique d\'intensité…"></label>' +
          '<div class="inline small" style="gap:6px">Variantes :' + (s.alts || []).map((a) => '<span class="chip tr-alt">' + esc(T.exercise(st, a).name) + ' <button class="btn sm ghost" data-action="tr-alt-rm" data-slot="' + esc(s.id) + '" data-id="' + esc(a) + '" aria-label="Retirer la variante">✕</button></span>').join('') +
            '<button class="btn sm ghost" data-action="tr-alt-add" data-slot="' + esc(s.id) + '">+ variante</button></div>' +
        '</div></div>';
    }).join('');
    const target = tv.addTarget ? w.slots.find((s) => s.id === tv.addTarget) : null;
    return '<section class="card"><div class="card-head"><h2>Modifier la séance</h2><button class="btn sm primary" data-action="tr-edit-done">Terminé</button></div>' +
      '<div class="grid-2"><label>Nom<input type="text" value="' + esc(w.name) + '" data-change="tr-w" data-f="name"></label>' +
      '<label>Type de journée (cibles)<select data-change="tr-w" data-f="sessionType">' + typeOpts + '</select></label></div>' +
      '<div class="stack" style="gap:14px">' + (slots || '<p class="small muted">Ajoute des exercices ci-dessous.</p>') + '</div></section>' +
      '<section class="card" id="tr-add"><div class="card-head"><h2>' + (target ? 'Variante pour « ' + esc(T.exercise(st, target.ex).name) + ' »' : 'Ajouter un exercice') + '</h2>' + (target ? '<button class="btn sm ghost" data-action="tr-alt-cancel">Annuler</button>' : '') + '</div>' +
      '<input type="search" placeholder="Rechercher : squat, épaules, tractions…" value="' + esc(tv.addQuery) + '" data-input="tr-addq" aria-label="Rechercher un exercice">' +
      '<div class="tr-grid" id="tr-add-results">' + addResults() + '</div></section>';
  }
  function addResults() {
    return T.searchExercises(S(), tv.addQuery).slice(0, 24).map((ex) => '<button type="button" class="tr-pick" data-action="tr-add" data-id="' + esc(ex.id) + '">' + thumb(ex) + '<span>' + esc(ex.name) + '</span></button>').join('') || '<p class="small muted">Aucun exercice trouvé.</p>';
  }

  /* ---------------- Exercices ---------------- */
  function vLibrary() {
    const st = S();
    const list = T.searchExercises(st, tv.libQuery).filter((e) => !tv.libGroup || e.group === tv.libGroup);
    return '<section class="card"><input type="search" placeholder="Rechercher un exercice ou un muscle" value="' + esc(tv.libQuery) + '" data-input="tr-libq" aria-label="Rechercher">' +
      '<div class="chips" role="group" aria-label="Groupe musculaire">' + [['', 'Tous']].concat(window.FD_EXERCISE_GROUPS || []).map((g) => '<button type="button" class="chip" data-action="tr-group" data-g="' + g[0] + '" aria-pressed="' + (tv.libGroup === g[0]) + '">' + esc(g[1]) + '</button>').join('') + '</div></section>' +
      '<div class="tr-lib" id="tr-lib">' + libCards(list) + '</div>' +
      '<form class="card tight" data-form="tr-custom"><h3>Ajouter un exercice perso</h3><div class="grid-2"><label>Nom<input name="name" required></label><label>Muscles<input name="muscles"></label>' +
      '<label>Groupe<select name="group">' + (window.FD_EXERCISE_GROUPS || []).map((g) => '<option value="' + g[0] + '">' + g[1] + '</option>').join('') + '</select></label>' +
      '<label>Charge<select name="load"><option value="charge">Charge (kg)</option><option value="lest">Lest ajouté</option><option value="pdc">Poids du corps</option></select></label></div><div><button class="btn" type="submit">Ajouter</button></div></form>' +
      '<p class="small muted">Photos : Free Exercise DB, domaine public.</p>';
  }
  function libCards(list) {
    return list.map((ex) => '<button type="button" class="tr-lib-card" data-action="tr-ex-open" data-id="' + esc(ex.id) + '">' + anim(ex, 'sm') + '<strong>' + esc(ex.name) + '</strong><span class="small muted">' + esc(ex.muscles || '') + '</span></button>').join('') || '<p class="small muted">Aucun exercice.</p>';
  }
  function vExercise() {
    const st = S(), ex = T.exercise(st, tv.exDetail);
    const h = T.history(st, ex.id, 20);
    const a = T.imageSrc(ex, 0), b = T.imageSrc(ex, 1);
    return '<section class="card"><div class="card-head"><h2>' + esc(ex.name) + '</h2><button class="btn sm ghost" data-action="tr-ex-close">Retour</button></div>' +
      (a ? '<div class="tr-duo"><figure><img src="' + a + '" alt="' + esc(ex.name) + ', départ"><figcaption class="small muted">Départ</figcaption></figure><figure><img src="' + b + '" alt="' + esc(ex.name) + ', arrivée"><figcaption class="small muted">Arrivée</figcaption></figure></div>' : '') +
      '<p class="small muted">' + esc(ex.muscles || '') + '</p>' +
      (ex.cues && ex.cues.length ? '<ul>' + ex.cues.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' : '') + '</section>' +
      '<section class="card"><h2>Historique</h2>' + (h.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Séries</th><th class="num">1RM estimé</th></tr></thead><tbody>' +
        h.map((x) => '<tr><td>' + esc(U.frShort(x.iso)) + '</td><td>' + esc(setsLine(x.sets)) + '</td><td class="num">' + (x.best ? kgText(Math.round(x.best * 2) / 2) + ' kg' : '—') + '</td></tr>').join('') + '</tbody></table></div>' +
        '<p class="small muted">1RM estimé (formule d\'Epley) : sert à comparer des séances aux répétitions différentes, pas à tester un maximum.</p>'
        : '<p class="small muted">Pas encore de série notée pour cet exercice.</p>') + '</section>';
  }

  /** Carte « Séance du jour » pour le tableau de bord. */
  function mobilityLine() {
    const st = S(), iso = U.todayISO(), s = FD.mobility && FD.mobility.sessionFor(st, iso);
    if (!s) return '';
    const p = FD.mobility.progress(st, iso);
    return '<div class="between divider" style="align-items:center"><span><strong>Mobilité</strong> · ' + esc(s.name) + ' · ' + s.minutes + ' min <span class="badge' + (p.done === p.total ? ' ok' : '') + '">' + p.done + ' / ' + p.total + '</span></span><a class="btn sm" href="#/seances" data-action="tr-goto-mob">Ouvrir</a></div>';
  }
  function todayCard() {
    const st = S(), iso = U.todayISO();
    if (!T.workouts(st).length) { const ml = mobilityLine(); return ml ? '<section class="card" aria-label="Mobilité du jour">' + ml + '</section>' : ''; }
    const w = T.workoutFor(st, iso), lg = T.log(st, iso);
    if (!w) return '<section class="card" aria-label="Séance du jour"><div class="card-head"><h2>Séance</h2><span class="badge">Pas de muscu</span></div><p class="small muted">Aucune séance de musculation prévue aujourd\'hui.</p><a class="btn" href="#/seances">Voir le programme</a>' + mobilityLine() + '</section>';
    return '<section class="card" aria-label="Séance du jour"><div class="card-head"><h2>' + esc(w.name) + '</h2>' + (lg && lg.done ? '<span class="badge ok">Faite</span>' : '<span class="badge">Aujourd\'hui</span>') + '</div>' +
      '<div class="tr-mini">' + w.slots.slice(0, 6).map((s) => { const ex = T.exercise(st, s.ex); return '<div class="tr-mini-row">' + thumb(ex) + '<span>' + esc(ex.name) + '</span><span class="small muted">' + esc(T.setsText(s.sets)) + '</span></div>'; }).join('') + '</div>' +
      '<a class="btn primary" href="#/seances" data-action="tr-goto-today">Ouvrir la séance</a>' + mobilityLine() + '</section>';
  }

  /* ------------------------------------------------------------------ */
  /* Minuteur de repos (hors de #view pour survivre aux rendus)           */
  /* ------------------------------------------------------------------ */
  let timer = null;
  function timerEl() {
    let el = document.getElementById('tr-timer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tr-timer'; el.className = 'tr-timer'; el.hidden = true; el.setAttribute('role', 'timer'); el.setAttribute('aria-live', 'off');
      el.innerHTML = '<span class="tr-timer-label small"></span><strong class="tr-timer-time">0:00</strong><button type="button" class="btn sm" data-t="add">+15 s</button><button type="button" class="btn sm ghost" data-t="stop">Arrêter</button>';
      document.body.appendChild(el);
      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-t]'); if (!b || !timer) return;
        if (b.dataset.t === 'add') timer.end += 15000; else stopTimer();
        tick();
      });
    }
    return el;
  }
  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      const c = new Ctx(), o = c.createOscillator(), g = c.createGain();
      o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.35);
    } catch (e) { /* son indisponible */ }
  }
  function startTimer(sec, label) {
    stopTimer();
    timer = { end: Date.now() + sec * 1000, label, id: setInterval(tick, 250) };
    const el = timerEl(); el.hidden = false; el.classList.remove('done');
    el.querySelector('.tr-timer-label').textContent = (tv.tab === 'mobilite' ? 'Maintien · ' : 'Repos · ') + label;
    tick();
  }
  function stopTimer() { if (timer) clearInterval(timer.id); timer = null; const el = document.getElementById('tr-timer'); if (el) el.hidden = true; }
  function tick() {
    if (!timer) return;
    const el = timerEl(), left = Math.max(0, Math.round((timer.end - Date.now()) / 1000));
    el.querySelector('.tr-timer-time').textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    if (left === 0 && !el.classList.contains('done')) {
      el.classList.add('done'); el.querySelector('.tr-timer-label').textContent = tv.tab === 'mobilite' ? 'Temps écoulé : côté ou exercice suivant' : 'Repos terminé : série suivante';
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      beep();
      clearInterval(timer.id); setTimeout(() => { if (timer && Date.now() > timer.end) stopTimer(); }, 6000);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Événements                                                           */
  /* ------------------------------------------------------------------ */
  function slotById(id) { const w = T.workoutFor(S(), tv.date); return w ? w.slots.find((s) => s.id === id) : null; }
  function editSlot(id) { const w = T.workout(S(), tv.editId); return w ? w.slots.find((s) => s.id === id) : null; }

  /** Met à jour les valeurs proposées d'un exercice sans re-rendre la page (le focus reste en place). */
  function refreshSlot(slot) {
    const st = S(), sug = T.suggestions(st, tv.date, slot), e = T.entry(st, tv.date, slot);
    document.querySelectorAll('#slot-' + CSS.escape(slot.id) + ' input[data-f="kg"]').forEach((inp) => {
      const i = +inp.dataset.i, s = (e && e.sets[i]) || {};
      if (sug[i] !== null) inp.placeholder = kgText(sug[i]);
      inp.value = typeof s.kg === 'number' ? kgText(s.kg) : '';
    });
  }

  function importFile(file) {
    file.text().then((t) => {
      const data = JSON.parse(t);
      const st = S();
      let msg = [];
      if (data.type === 'fitdiet-coach-recipes' && Array.isArray(data.recipes)) { const r = FD.recipes.importCollection(st, data); msg.push(r.recipes + ' recettes'); }
      if (FD.app.importMenus) { const m = FD.app.importMenus(data); if (m) msg.push(m + ' menus'); }
      const w = T.importWorkouts(st, data);
      if (w.workouts) msg.push(w.workouts + ' séances' + (w.days ? ' (' + w.days + ' jours planifiés)' : ''));
      if (!msg.length) throw new Error('Aucune séance ni recette dans ce fichier.');
      A().commit('Importé : ' + msg.join(', ') + '.');
    }).catch((e) => A().toast(e.message || 'Import impossible.'));
  }

  function bind(view) {
    view.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-action^="tr-"]');
      if (!el) return;
      const a = el.dataset.action, st = S();
      switch (a) {
        case 'tr-tab': tv.tab = el.dataset.tab; tv.exDetail = null; A().render(); break;
        case 'tr-prev': tv.date = U.addDays(tv.date, -1); A().render(); break;
        case 'tr-next': tv.date = U.addDays(tv.date, 1); A().render(); break;
        case 'tr-today': tv.date = U.todayISO(); A().render(); break;
        case 'tr-goto-today': tv.tab = 'jour'; tv.date = U.todayISO(); break;
        case 'tr-goto-mob': tv.tab = 'mobilite'; tv.date = U.todayISO(); break;
        case 'tr-rest': startTimer(+el.dataset.s, el.dataset.l || ''); break;
        case 'tr-finish': T.finish(st, tv.date, el.dataset.v === '1'); A().commit(el.dataset.v === '1' ? 'Séance enregistrée. Bien joué.' : 'Séance marquée non faite.'); if (el.dataset.v === '1') stopTimer(); break;
        case 'tr-new': { const w = T.newWorkout(st); tv.tab = 'programme'; tv.editId = w.id; tv.addTarget = null; A().commit('Séance créée : ajoute tes exercices.'); window.scrollTo({ top: 0 }); break; }
        case 'tr-edit': tv.editId = el.dataset.id; tv.addTarget = null; tv.addQuery = ''; A().render(); window.scrollTo({ top: 0 }); break;
        case 'tr-edit-done': tv.editId = null; tv.addTarget = null; A().render(); break;
        case 'tr-dup': { const w = T.duplicate(st, el.dataset.id); if (w) A().commit('Séance dupliquée.'); break; }
        case 'tr-del': { const w = T.workout(st, el.dataset.id); if (w && confirm('Supprimer la séance « ' + w.name + ' » ? Tes charges déjà notées sont conservées.')) { T.removeWorkout(st, w.id); A().commit('Séance supprimée.'); } break; }
        case 'tr-up': T.moveSlot(st, tv.editId, el.dataset.slot, -1); A().commit(); break;
        case 'tr-down': T.moveSlot(st, tv.editId, el.dataset.slot, 1); A().commit(); break;
        case 'tr-rm': T.removeSlot(st, tv.editId, el.dataset.slot); A().commit('Exercice retiré.'); break;
        case 'tr-alt-add': tv.addTarget = el.dataset.slot; tv.addQuery = ''; A().render(); { const t = document.getElementById('tr-add'); if (t) t.scrollIntoView({ behavior: 'smooth' }); } break;
        case 'tr-alt-cancel': tv.addTarget = null; A().render(); break;
        case 'tr-alt-rm': { const s = editSlot(el.dataset.slot); if (s) { s.alts = (s.alts || []).filter((x) => x !== el.dataset.id); A().commit(); } break; }
        case 'tr-add': {
          const s = tv.addTarget ? editSlot(tv.addTarget) : null;
          if (s) { s.alts = s.alts || []; if (s.ex !== el.dataset.id && !s.alts.includes(el.dataset.id)) s.alts.push(el.dataset.id); tv.addTarget = null; A().commit('Variante ajoutée.'); }
          else { T.addSlot(st, tv.editId, el.dataset.id); A().commit(T.exercise(st, el.dataset.id).name + ' ajouté.'); }
          break;
        }
        case 'tr-group': tv.libGroup = el.dataset.g; A().render(); break;
        case 'tr-ex-open': tv.exDetail = el.dataset.id; tv.tab = 'exercices'; A().render(); window.scrollTo({ top: 0 }); break;
        case 'tr-ex-close': tv.exDetail = null; A().render(); break;
        default: break;
      }
    });

    view.addEventListener('change', (ev) => {
      const el = ev.target.closest('[data-change^="tr-"]');
      if (!el) return;
      const c = el.dataset.change, st = S();
      switch (c) {
        case 'tr-set': {
          const slot = slotById(el.dataset.slot); if (!slot) break;
          const i = +el.dataset.i, f = el.dataset.f, v = U.parseNum(el.value);
          T.setValue(st, tv.date, slot, i, f, v === null ? null : (f === 'reps' ? Math.round(v) : v));
          // Répétitions notées sans charge : on reprend la charge proposée
          if (f === 'reps' && v !== null) {
            const e = T.entry(st, tv.date, slot), sug = T.suggestions(st, tv.date, slot);
            if (e && typeof e.sets[i].kg !== 'number' && sug[i] !== null) T.setValue(st, tv.date, slot, i, 'kg', sug[i]);
          }
          A().save(); refreshSlot(slot);
          break;
        }
        case 'tr-variant': { const slot = slotById(el.dataset.slot); if (slot) { T.chooseVariant(st, tv.date, slot, el.value); A().commit(); } break; }
        case 'tr-day-workout': T.chooseForDate(st, tv.date, el.value); A().commit(); break;
        case 'tr-week': T.setDay(st, el.dataset.day, el.value); A().commit('Semaine mise à jour.'); break;
        case 'tr-w': { const w = T.workout(st, tv.editId); if (w) { w[el.dataset.f] = el.value.trim() || w[el.dataset.f]; A().save(); if (el.dataset.f === 'sessionType') A().commit(); } break; }
        case 'tr-s': {
          const s = editSlot(el.dataset.slot); if (!s) break;
          const f = el.dataset.f;
          if (f === 'sets') { const p = T.parseSets(el.value); if (p.length) s.sets = p; A().commit(); }
          else if (f === 'rest') { s.rest = Math.max(0, parseInt(el.value, 10) || 0); A().save(); }
          else if (f === 'group') { s.group = el.value.trim().toUpperCase(); A().save(); }
          else { s[f] = el.value; A().save(); }
          break;
        }
        case 'tr-import': { const file = el.files && el.files[0]; if (file) importFile(file); break; }
        case 'tr-mob-check': {
          FD.mobility.toggle(st, tv.date, el.dataset.k, el.checked); A().save();
          const art = el.closest('.mob-item'); if (art) art.classList.toggle('done', el.checked);
          const p = FD.mobility.progress(st, tv.date), badge = document.getElementById('mob-badge'), fill = document.getElementById('mob-fill');
          if (badge) { badge.textContent = p.done + ' / ' + p.total; badge.classList.toggle('ok', p.done === p.total); }
          if (fill) fill.style.width = Math.round(p.done / Math.max(1, p.total) * 100) + '%';
          if (p.total && p.done === p.total) A().toast('Mobilité du jour terminée.');
          break;
        }
        case 'tr-mob-day': FD.mobility.chooseForDate(st, tv.date, el.value); A().commit(); break;
        case 'tr-mob-week': FD.mobility.setWeek(st, el.dataset.day, el.value); A().commit('Semaine mobilité mise à jour.'); break;

        default: break;
      }
    });

    view.addEventListener('input', (ev) => {
      const el = ev.target.closest('[data-input^="tr-"]');
      if (!el) return;
      if (el.dataset.input === 'tr-addq') { tv.addQuery = el.value; const b = document.getElementById('tr-add-results'); if (b) b.innerHTML = addResults(); }
      if (el.dataset.input === 'tr-libq') { tv.libQuery = el.value; const b = document.getElementById('tr-lib'); if (b) b.innerHTML = libCards(T.searchExercises(S(), tv.libQuery).filter((e) => !tv.libGroup || e.group === tv.libGroup)); }
    });

    view.addEventListener('submit', (ev) => {
      const form = ev.target.closest('form[data-form="tr-custom"]');
      if (!form) return;
      ev.preventDefault();
      const fd = new FormData(form);
      const e = T.addCustomExercise(S(), { name: fd.get('name'), muscles: fd.get('muscles'), group: fd.get('group'), load: fd.get('load') });
      A().commit('Exercice « ' + e.name + ' » ajouté.');
    });
  }

  return { view, todayCard, bind, importFile, tv };
})();
