/**
 * mobility.js — Programme mobilité : séance du jour, semaine type, cases cochées.
 * state.mobility = { week: { lun: sessionId, ... }, logs: { 'YYYY-MM-DD': { sessionId?, done: { key: true } } } }
 */
window.FD = window.FD || {};

FD.mobility = (function () {
  const U = FD.utils;
  const M = () => window.FD_MOBILITY || { exercises: [], sessions: [], base: [], week: {}, notes: [] };

  function ensure(state) {
    const m = state.mobility = state.mobility || {};
    m.week = m.week || Object.assign({}, M().week);
    m.logs = m.logs || {};
    return m;
  }
  function sessions() { return M().sessions; }
  function session(id) { return M().sessions.find((s) => s.id === id) || null; }
  function exercise(n) { return M().exercises.find((e) => e.n === n) || { n, name: 'Exercice ' + n }; }
  function imageSrc(n) { return 'img/mobilite/m' + n + '.png'; }

  function sessionFor(state, iso) {
    const m = ensure(state), lg = m.logs[iso];
    const id = lg && lg.sessionId !== undefined ? lg.sessionId : m.week[U.weekdayKey(iso)];
    return id ? session(id) : null;
  }
  function chooseForDate(state, iso, id) {
    const m = ensure(state), planned = m.week[U.weekdayKey(iso)] || '';
    const lg = m.logs[iso] = m.logs[iso] || { done: {} };
    if ((id || '') === planned) delete lg.sessionId; else lg.sessionId = id || '';
  }
  function setWeek(state, day, id) { const m = ensure(state); if (id) m.week[day] = id; else delete m.week[day]; }

  /** Liste à faire : routine de base (si la séance la contient) puis bloc ciblé. */
  function items(s) {
    if (!s) return [];
    const out = [];
    if (s.base) M().base.forEach((b, i) => out.push({ key: 'b' + i, n: b.n, dose: b.dose, part: 'base' }));
    s.items.forEach((it, i) => out.push({ key: 'i' + i, n: it.n, dose: it.dose, part: s.base ? 'bloc' : 'seance' }));
    return out;
  }
  function isDone(state, iso, key) { const lg = ensure(state).logs[iso]; return !!(lg && lg.done && lg.done[key]); }
  function toggle(state, iso, key, on) {
    const m = ensure(state), lg = m.logs[iso] = m.logs[iso] || { done: {} };
    lg.done = lg.done || {};
    if (on) lg.done[key] = true; else delete lg.done[key];
  }
  function progress(state, iso) {
    const list = items(sessionFor(state, iso));
    const done = list.filter((x) => isDone(state, iso, x.key)).length;
    return { done, total: list.length };
  }
  /** Durée d'un maintien en secondes (« 1 min 30 », « 45 s », « 2 min ») pour le minuteur ; null si ce sont des répétitions. */
  function seconds(dose) {
    const d = String(dose || '').replace(/G : |D : /g, '');
    let m = d.match(/(\d+)\s*min(?:\s*(\d+))?/);
    if (m) return +m[1] * 60 + (m[2] ? +m[2] : 0);
    m = d.match(/(\d+)\s*s\b/);
    return m ? +m[1] : null;
  }
  /** Séances de mobilité faites (au moins 80 % cochées) sur les 7 derniers jours. */
  function weekCount(state, iso) {
    let n = 0;
    for (let i = 0; i < 7; i++) { const d = U.addDays(iso, -i), p = progress(state, d); if (p.total && p.done / p.total >= 0.8) n++; }
    return n;
  }

  return { data: M, ensure, sessions, session, exercise, imageSrc, sessionFor, chooseForDate, setWeek, items, isDone, toggle, progress, seconds, weekCount };
})();
