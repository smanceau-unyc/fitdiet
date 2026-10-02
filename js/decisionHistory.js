/**
 * decisionHistory.js — Historique des décisions du coach.
 * Une décision par semaine ISO : une réévaluation dans la même semaine remplace la précédente.
 */
window.FD = window.FD || {};

FD.history = (function () {
  const U = FD.utils;

  function record(state, result, applied) {
    const p = state.profile;
    const entry = {
      date: result.date,
      week: U.isoWeekKey(result.date),
      code: result.code,
      title: result.title,
      avgWeight: result.metrics.avgWeight,
      waist: result.metrics.waist,
      kcalOffset: p.kcalOffset,
      stepsGoal: p.stepsGoal,
      avgSteps: result.metrics.avgSteps,
      avgKcal: result.metrics.avgKcal,
      recommend: result.recommend,
      why: result.meaning,
      confidence: result.confidence.label,
      reevaluate: result.reevaluate,
      applied: applied || null
    };
    const i = state.decisions.findIndex((d) => d.week === entry.week);
    if (i >= 0) {
      // conserver une action appliquée plus tôt dans la semaine
      if (!entry.applied && state.decisions[i].applied) entry.applied = state.decisions[i].applied;
      state.decisions[i] = entry;
    } else state.decisions.push(entry);
    state.decisions.sort((a, b) => a.date.localeCompare(b.date));
    return entry;
  }

  /** Applique une option proposée (une seule variable) et l'inscrit dans l'historique. */
  function apply(state, result, option) {
    const p = state.profile;
    let text;
    if (option.apply.type === 'stepsGoal') {
      text = 'Objectif de pas : ' + U.num(p.stepsGoal) + ' → ' + U.num(option.apply.value);
      p.stepsGoal = option.apply.value;
    } else if (option.apply.type === 'kcalOffset') {
      const delta = option.apply.value - p.kcalOffset;
      text = 'Cibles caloriques ' + (delta > 0 ? '+' : '') + delta + ' kcal/jour';
      p.kcalOffset = option.apply.value;
    }
    return record(state, result, text);
  }

  function list(state) { return state.decisions.slice().reverse(); }

  return { record, apply, list };
})();
