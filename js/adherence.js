/**
 * adherence.js — Régularité du suivi sur une fenêtre de jours.
 * Le score n'est pas une mesure médicale : il sert à savoir si les données sont fiables
 * avant de modifier quoi que ce soit.
 */
window.FD = window.FD || {};

FD.adherence = (function () {
  const U = FD.utils;

  function stats(state, endIso, n) {
    n = n || 7;
    const cfg = state.settings.coach;
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
      const iso = U.addDays(endIso, -i);
      const d = state.days[iso] || {};
      const t = FD.tracking.dayTotals(state, iso);
      const target = FD.calc.dayTarget(state, iso);
      const wd = U.weekdayKey(iso);
      days.push({
        iso, wd, weekend: wd === 'sam' || wd === 'dim', d, t, target,
        kcalOk: t.tracked && Math.abs(t.kcal - target.kcal) / target.kcal <= 0.10,
        protOk: t.tracked && !t.partial && t.p >= target.p * cfg.proteinMin / 100,
        stepsOk: typeof d.steps === 'number' && d.steps >= state.profile.stepsGoal,
        planned: target.type.cat !== 'repos',
        trained: !!d.trainingDone,
        weighed: typeof d.weight === 'number',
        sleepOk: typeof d.sleep === 'number' ? d.sleep >= 7 : null
      });
    }
    const tracked = days.filter((x) => x.t.tracked);
    const pct = (a, b) => (b ? Math.round(a / b * 100) : null);
    const planned = days.filter((x) => x.planned).length;
    const sleepDays = days.filter((x) => x.sleepOk !== null);

    const components = {
      calories: pct(days.filter((x) => x.kcalOk).length, n),
      proteines: pct(days.filter((x) => x.protOk).length, n),
      pas: days.some((x) => typeof x.d.steps === 'number') ? pct(days.filter((x) => x.stepsOk).length, n) : null,
      entrainement: planned ? Math.min(100, pct(days.filter((x) => x.trained).length, planned)) : null,
      pesees: Math.min(100, pct(days.filter((x) => x.weighed).length, 5)), // 5 pesées/semaine suffisent
      sommeil: sleepDays.length ? pct(sleepDays.filter((x) => x.sleepOk).length, sleepDays.length) : null
    };
    const vals = Object.values(components).filter((v) => v !== null);
    const anyData = days.some((x) => x.t.tracked || x.weighed || typeof x.d.steps === 'number');
    const score = vals.length && anyData ? Math.round(U.mean(vals)) : null;

    const avg = (arr) => U.mean(arr);
    const weekdayKcal = avg(tracked.filter((x) => !x.weekend).map((x) => x.t.kcal));
    const weekendKcal = avg(tracked.filter((x) => x.weekend).map((x) => x.t.kcal));
    const avgTarget = avg(days.map((x) => x.target.kcal));

    return {
      n, days, components, score,
      trackedDays: tracked.length,
      trackedPct: pct(tracked.length, n),
      // L'adhérence calorique est mesurée sur la semaine entière : un jour non suivi n'est pas "conforme"
      kcalAdherence: components.calories,
      proteinAdherence: components.proteines,
      avgKcal: avg(tracked.map((x) => x.t.kcal)),
      avgProtein: avg(tracked.filter((x) => !x.t.partial).map((x) => x.t.p)),
      avgFiber: avg(tracked.filter((x) => x.t.mode === 'journal').map((x) => x.t.fib)),
      avgSteps: avg(days.map((x) => x.d.steps)),
      avgSleep: avg(days.map((x) => x.d.sleep)),
      avgHunger: avg(days.map((x) => x.d.hunger)),
      avgTarget,
      weekdayKcal, weekendKcal,
      weekendGap: weekdayKcal !== null && weekendKcal !== null ? weekendKcal - weekdayKcal : null,
      freeMeals: tracked.reduce((acc, x) => acc + (x.d.foods || []).filter((e) => e.free).length, 0),
      perfDown: days.filter((x) => x.d.perf === 'baisse').length,
      perfUp: days.filter((x) => x.d.perf === 'hausse').length,
      perfLogged: days.filter((x) => x.d.perf).length
    };
  }

  /** Budget calorique de la semaine (lundi → dimanche) contenant iso. */
  function weekBudget(state, iso) {
    const monday = U.mondayOf(iso);
    const rows = [];
    let budget = 0, consumed = 0, remainingBudget = 0;
    for (let i = 0; i < 7; i++) {
      const day = U.addDays(monday, i);
      const target = FD.calc.dayTarget(state, day);
      const t = FD.tracking.dayTotals(state, day);
      budget += target.kcal;
      if (t.tracked) consumed += t.kcal; else remainingBudget += target.kcal;
      rows.push({ iso: day, target, totals: t });
    }
    return { monday, rows, budget, consumed, plannedRest: remainingBudget, balance: budget - consumed - remainingBudget };
  }

  /** Fin de fenêtre pertinente : hier si la journée en cours n'est pas encore suivie (évite de pénaliser une journée en cours). */
  function windowEnd(state, iso) {
    return FD.tracking.dayTotals(state, iso).tracked ? iso : U.addDays(iso, -1);
  }

  return { stats, weekBudget, windowEnd };
})();
