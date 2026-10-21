/**
 * training.js — Séances de musculation : programme, semaine, carnet de charges, progression.
 *
 * state.training = {
 *   workouts: [{ id, name, sessionType, collection, slots: [slot] }],
 *   week: { lun: workoutId, ... },             // séance prévue par jour de la semaine
 *   logs: { 'YYYY-MM-DD': { workoutId, done, entries: { slotId: { ex, sets: [{ kg, reps }] } } } },
 *   customExercises: [{ id, name, group, load, muscles, cues }]
 * }
 * slot = { id, ex, alts: [exId], scheme: 'topset' | 'straight', sets: ['4-6', '6-8', '8-10'], rest: 150, group: 'A' | '', note }
 *   topset   : la 1re série est la plus lourde, puis −10 % à chaque série (valeurs proposées automatiquement)
 *   straight : même charge sur toutes les séries
 */
window.FD = window.FD || {};

FD.training = (function () {
  const U = FD.utils;
  const DROP = 0.10;           // −10 % par série après le top set
  const KG_STEP = 0.5;         // arrondi des charges proposées

  function ensure(state) {
    const t = state.training = state.training || {};
    t.workouts = t.workouts || [];
    t.week = t.week || {};
    t.logs = t.logs || {};
    t.customExercises = t.customExercises || [];
    return t;
  }

  /* ---------------- Exercices ---------------- */
  function library(state) {
    return (window.FD_EXERCISES || []).map((e) => Object.assign({ images: true }, e)).concat(ensure(state).customExercises);
  }
  function exercise(state, id) {
    return library(state).find((e) => e.id === id) || { id, name: id, group: 'complet', load: 'charge', muscles: '', cues: [], images: false };
  }
  function imageSrc(ex, frame) { return ex && ex.images ? 'img/exercices/' + ex.id + '-' + frame + '.jpg' : null; }
  function searchExercises(state, q) {
    const n = U.norm(q || '').trim();
    const lib = library(state);
    if (!n) return lib;
    const words = n.split(/\s+/);
    return lib.filter((e) => { const h = U.norm(e.name + ' ' + (e.muscles || '') + ' ' + e.group); return words.every((w) => h.includes(w)); });
  }
  function addCustomExercise(state, data) {
    const e = { id: 'perso-' + U.uid(), name: String(data.name || '').trim() || 'Exercice', group: data.group || 'complet', load: data.load || 'charge', muscles: data.muscles || '', cues: [], images: false };
    ensure(state).customExercises.push(e);
    return e;
  }

  /* ---------------- Séances (modèles) ---------------- */
  function workouts(state) { return ensure(state).workouts; }
  function workout(state, id) { return workouts(state).find((w) => w.id === id) || null; }

  function newWorkout(state, name) {
    const w = { id: 'w-' + U.uid(), name: name || 'Nouvelle séance', sessionType: 'full', slots: [] };
    workouts(state).push(w);
    return w;
  }
  function duplicate(state, id) {
    const src = workout(state, id);
    if (!src) return null;
    const w = JSON.parse(JSON.stringify(src));
    w.id = 'w-' + U.uid(); w.name = src.name + ' (copie)'; delete w.collection;
    w.slots.forEach((s) => { s.id = 's-' + U.uid(); });
    workouts(state).push(w);
    return w;
  }
  function removeWorkout(state, id) {
    const t = ensure(state);
    t.workouts = t.workouts.filter((w) => w.id !== id);
    Object.keys(t.week).forEach((k) => { if (t.week[k] === id) delete t.week[k]; });
  }
  function addSlot(state, wid, exId) {
    const w = workout(state, wid);
    if (!w) return null;
    const s = { id: 's-' + U.uid(), ex: exId, alts: [], scheme: 'straight', sets: ['8-12', '8-12', '8-12'], rest: 90, group: '', note: '' };
    w.slots.push(s);
    return s;
  }
  function moveSlot(state, wid, slotId, dir) {
    const w = workout(state, wid); if (!w) return;
    const i = w.slots.findIndex((s) => s.id === slotId), j = i + dir;
    if (i < 0 || j < 0 || j >= w.slots.length) return;
    const tmp = w.slots[i]; w.slots[i] = w.slots[j]; w.slots[j] = tmp;
  }
  function removeSlot(state, wid, slotId) {
    const w = workout(state, wid); if (w) w.slots = w.slots.filter((s) => s.id !== slotId);
  }
  /** "4-6, 6-8, 8-10" ou "3x8-12" → ['4-6', '6-8', '8-10'] / ['8-12', '8-12', '8-12'] */
  function parseSets(text) {
    const t = String(text || '').trim();
    const m = t.match(/^(\d+)\s*[x×]\s*(.+)$/i);
    if (m) return Array.from({ length: Math.min(+m[1], 12) }, () => m[2].trim());
    return t.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 12);
  }
  function setsText(sets) {
    return sets.length > 1 && sets.every((x) => x === sets[0]) ? sets.length + 'x' + sets[0] : sets.join(', ');
  }

  /* ---------------- Semaine ---------------- */
  /** Associe une séance à un jour ; le type nutritionnel du jour suit (cibles, glucides). */
  function setDay(state, dayKey, wid) {
    const t = ensure(state);
    if (!wid) { delete t.week[dayKey]; return; }
    t.week[dayKey] = wid;
    const w = workout(state, wid);
    if (w && w.sessionType && (state.sessionTypes || []).some((x) => x.id === w.sessionType)) state.weekPlan[dayKey] = w.sessionType;
  }
  function plannedFor(state, iso) { return workout(state, ensure(state).week[U.weekdayKey(iso)]) || null; }
  /** Séance du jour : celle choisie pour cette date, sinon celle de la semaine type. */
  function workoutFor(state, iso) {
    const lg = ensure(state).logs[iso];
    if (lg && lg.workoutId !== undefined) return lg.workoutId ? workout(state, lg.workoutId) : null;
    return plannedFor(state, iso);
  }
  function chooseForDate(state, iso, wid) {
    const t = ensure(state);
    const planned = plannedFor(state, iso);
    const lg = t.logs[iso] = t.logs[iso] || { entries: {} };
    if ((planned ? planned.id : '') === (wid || '')) delete lg.workoutId; else lg.workoutId = wid || '';
    // Le type de journée (cibles caloriques) suit la séance choisie pour cette date
    const w = workout(state, wid);
    if (w && w.sessionType && (state.sessionTypes || []).some((x) => x.id === w.sessionType)) {
      const d = state.days[iso] = state.days[iso] || { foods: [] };
      if (w.sessionType === state.weekPlan[U.weekdayKey(iso)]) delete d.session; else d.session = w.sessionType;
    }
    if (!Object.keys(lg.entries).length && lg.workoutId === undefined && !lg.done) delete t.logs[iso];
  }

  /* ---------------- Carnet ---------------- */
  function log(state, iso) { return ensure(state).logs[iso] || null; }
  function entry(state, iso, slot) {
    const lg = log(state, iso);
    return lg && lg.entries[slot.id] ? lg.entries[slot.id] : null;
  }
  function currentEx(state, iso, slot) { const e = entry(state, iso, slot); return (e && e.ex) || slot.ex; }

  function setValue(state, iso, slot, idx, field, value) {
    const t = ensure(state);
    const lg = t.logs[iso] = t.logs[iso] || { entries: {} };
    const e = lg.entries[slot.id] = lg.entries[slot.id] || { ex: slot.ex, sets: [] };
    while (e.sets.length <= idx) e.sets.push({});
    if (value === null || value === '' || isNaN(value)) delete e.sets[idx][field]; else e.sets[idx][field] = value;
  }
  function chooseVariant(state, iso, slot, exId) {
    const t = ensure(state);
    const lg = t.logs[iso] = t.logs[iso] || { entries: {} };
    const e = lg.entries[slot.id] = lg.entries[slot.id] || { ex: slot.ex, sets: [] };
    e.ex = exId;
  }

  const filled = (s) => s && (typeof s.kg === 'number' || typeof s.reps === 'number');

  /** Dernière séance (avant iso) où l'exercice a été noté. */
  function lastPerf(state, exId, beforeIso) {
    const logs = ensure(state).logs;
    const dates = Object.keys(logs).filter((d) => d < beforeIso).sort().reverse();
    for (const d of dates) {
      const es = Object.values(logs[d].entries || {}).filter((e) => e.ex === exId && (e.sets || []).some(filled));
      if (es.length) return { iso: d, sets: es[0].sets.filter(filled) };
    }
    return null;
  }
  function history(state, exId, limit) {
    const logs = ensure(state).logs, out = [];
    Object.keys(logs).sort().reverse().forEach((d) => {
      Object.values(logs[d].entries || {}).forEach((e) => {
        if (e.ex === exId && (e.sets || []).some(filled)) out.push({ iso: d, sets: e.sets.filter(filled), best: bestE1rm(e.sets) });
      });
    });
    return out.slice(0, limit || 50);
  }
  /** 1RM estimé (Epley), utile pour comparer des séries de reps différentes. */
  function e1rm(kg, reps) { return kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0; }
  function bestE1rm(sets) { return Math.max.apply(null, [0].concat((sets || []).map((s) => e1rm(s.kg, s.reps)))); }

  function range(txt) {
    const m = String(txt || '').match(/(\d+)\s*(?:-|à|–)\s*(\d+)/);
    if (m) return { min: +m[1], max: +m[2] };
    const n = String(txt || '').match(/(\d+)/);
    return n ? { min: +n[1], max: +n[1] } : null;
  }
  const roundKg = (x) => Math.round(x / KG_STEP) * KG_STEP;
  /** Palier de progression : +1 kg sous 20 kg (haltères, isolation), +2,5 kg au-delà (barre, machine). */
  const step = (kg) => (kg < 20 ? 1 : 2.5);
  const stepText = (kg) => (kg < 20 ? '+1 kg' : '+2,5 kg');

  /**
   * Charges proposées pour chaque série.
   * - top set : série 1 = charge saisie (sinon dernière charge, +2,5 kg si le haut de la fourchette a été atteint),
   *   séries suivantes = −10 % de la précédente.
   * - séries fixes : la charge de la dernière fois, +2,5 kg si toutes les séries ont atteint le haut de la fourchette.
   */
  function suggestions(state, iso, slot) {
    const exId = currentEx(state, iso, slot);
    const e = entry(state, iso, slot);
    const last = lastPerf(state, exId, iso);
    const n = slot.sets.length;
    const out = Array.from({ length: n }, () => null);
    const ex = exercise(state, exId);
    if (ex.load === 'pdc') return out;
    const lastTop = last && last.sets[0] && last.sets[0].kg;
    const hitTop = (sets) => sets.length >= n && sets.every((s, i) => { const r = range(slot.sets[i]); return r && s.reps >= r.max; });
    if (slot.scheme === 'topset') {
      let top = e && e.sets[0] && typeof e.sets[0].kg === 'number' ? e.sets[0].kg : null;
      if (top === null && typeof lastTop === 'number') {
        const r0 = range(slot.sets[0]);
        top = r0 && last.sets[0].reps >= r0.max ? lastTop + step(lastTop) : lastTop;
      }
      if (top === null) return out;
      out[0] = top;
      for (let i = 1; i < n; i++) {
        const prev = e && e.sets[i - 1] && typeof e.sets[i - 1].kg === 'number' ? e.sets[i - 1].kg : out[i - 1];
        out[i] = roundKg(prev * (1 - DROP));
      }
      return out;
    }
    if (!last) return out;
    const base = last.sets[0].kg;
    if (typeof base !== 'number') return out;
    const up = hitTop(last.sets);
    for (let i = 0; i < n; i++) out[i] = up ? base + step(base) : (last.sets[i] && typeof last.sets[i].kg === 'number' ? last.sets[i].kg : base);
    return out;
  }

  /** Conseil de progression à partir de la dernière séance. */
  function hint(state, iso, slot) {
    const exId = currentEx(state, iso, slot);
    const last = lastPerf(state, exId, iso);
    if (!last) return null;
    const checks = last.sets.map((s, i) => { const r = range(slot.sets[i]); return r && typeof s.reps === 'number' ? s.reps >= r.max : null; }).filter((x) => x !== null);
    if (!checks.length) return null;
    const ex = exercise(state, exId);
    if (slot.scheme === 'topset') {
      return checks[0] ? (ex.load === 'pdc' ? 'Top set au maximum de la fourchette : ajoute du lest.' : 'Top set au maximum de la fourchette : ' + stepText(last.sets[0].kg || 0) + ' aujourd\'hui.') : 'Garde la charge du top set et vise une répétition de plus.';
    }
    if (checks.length >= slot.sets.length && checks.every(Boolean)) return ex.load === 'pdc' ? 'Toutes les séries au maximum : passe à une variante plus dure ou ajoute du lest.' : 'Toutes les séries au maximum : ' + stepText(last.sets[0].kg || 0) + ' aujourd\'hui.';
    return 'Même charge, vise une répétition de plus sur les séries incomplètes.';
  }

  function volume(state, iso) {
    const lg = log(state, iso);
    let tonnage = 0, sets = 0;
    if (lg) Object.values(lg.entries).forEach((e) => (e.sets || []).forEach((s) => { if (typeof s.reps === 'number') { sets++; tonnage += (s.kg || 0) * s.reps; } }));
    return { tonnage: Math.round(tonnage), sets };
  }

  /** Marque la séance comme faite : le suivi et les cibles du jour en tiennent compte. */
  function finish(state, iso, done) {
    const t = ensure(state);
    const lg = t.logs[iso] = t.logs[iso] || { entries: {} };
    lg.done = !!done;
    const d = state.days[iso] = state.days[iso] || { foods: [] };
    d.trainingDone = done ? true : null;
    const w = workoutFor(state, iso);
    if (done && w && w.sessionType && (state.sessionTypes || []).some((x) => x.id === w.sessionType)) {
      const planned = state.weekPlan[U.weekdayKey(iso)];
      if (w.sessionType !== planned) d.session = w.sessionType;
    }
    if (d.trainingDone === null) delete d.trainingDone;
  }

  /** Importe les séances d'un fichier de programme (même fichier que les recettes). */
  function importWorkouts(state, data) {
    if (!data || !Array.isArray(data.workouts)) return { workouts: 0, days: 0 };
    const t = ensure(state);
    const ids = new Set(data.workouts.map((w) => w.id));
    t.workouts = t.workouts.filter((w) => !ids.has(w.id)).concat(JSON.parse(JSON.stringify(data.workouts)));
    let days = 0;
    if (data.week) Object.keys(data.week).forEach((k) => { if (ids.has(data.week[k])) { setDay(state, k, data.week[k]); days++; } });
    return { workouts: data.workouts.length, days };
  }

  return {
    DROP, ensure, library, exercise, imageSrc, searchExercises, addCustomExercise,
    workouts, workout, newWorkout, duplicate, removeWorkout, addSlot, moveSlot, removeSlot, parseSets, setsText,
    setDay, plannedFor, workoutFor, chooseForDate, log, entry, currentEx, setValue, chooseVariant,
    lastPerf, history, e1rm, bestE1rm, range, suggestions, hint, volume, finish, importWorkouts
  };
})();
