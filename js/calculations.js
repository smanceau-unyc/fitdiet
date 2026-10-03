/**
 * calculations.js — Métabolisme, dépense, cibles caloriques et macros.
 * Toutes les dépenses sont des ESTIMATIONS et sont renvoyées sous forme de fourchettes.
 */
window.FD = window.FD || {};

FD.calc = (function () {
  const U = FD.utils;

  /** Mifflin-St Jeor. Renvoie la valeur et la formule lisible. */
  function bmr(p) {
    const s = p.sex === 'femme' ? -161 : 5;
    const value = 10 * p.weight + 6.25 * p.height - 5 * p.age + s;
    const formula = '10 × ' + U.num(p.weight, 1) + ' + 6,25 × ' + U.num(p.height) + ' − 5 × ' + p.age + (s > 0 ? ' + 5' : ' − 161');
    return { value, formula };
  }

  const JOB_ADD = { sedentaire: 0, debout: 0.05, physique: 0.12 };
  const MET = { // fourchettes de MET par type d'activité
    force: [3.5, 6], run_hard: [9, 11.5], run_long: [8, 10], cardio: [7, 9], repos: [0, 0], recup: [2.5, 3.5],
    velo: [5, 8], marche: [3, 4], autre: [3, 6]
  };

  /** kcal/min pour un MET donné : MET × 3,5 × poids / 200. */
  function kcalPerMin(met, kg) { return (met * 3.5 * kg) / 200; }

  /**
   * TDEE estimé = BMR × (1,2 + activité pro + pas) + sport moyen/jour.
   * Le résultat est une fourchette ±7 % : la dépense individuelle varie réellement.
   */
  function tdee(p) {
    const b = bmr(p).value;
    const steps = p.steps || 0;
    const stepsAdd = Math.min(steps, 15000) / 10000 * 0.2;
    const factor = 1.2 + (JOB_ADD[p.job] || 0) + stepsAdd;
    const strengthDay = (p.strengthPerWeek || 0) * (p.sessionMinutes || 60) * kcalPerMin(4.5, p.weight) / 7;
    const runDay = (p.runPerWeek || 0) * 45 * kcalPerMin(9, p.weight) / 7;
    const mid = b * factor + strengthDay + runDay;
    return { mid, low: mid * 0.93, high: mid * 1.07, factor, sportPerDay: strengthDay + runDay, bmr: b };
  }

  const DEFICIT = { lent: 0.10, modere: 0.15, rapide: 0.20 };

  /** Cible calorique théorique selon l'objectif (avant le plafond choisi par l'utilisateur). */
  function goalKcal(p) {
    const t = tdee(p);
    let pct = 0;
    if (p.goal === 'perte') pct = -(DEFICIT[p.pace] || 0.15);
    else if (p.goal === 'recompo') pct = -0.08;
    else if (p.goal === 'prise') pct = 0.08;
    return { pct, low: t.low * (1 + pct), high: t.high * (1 + pct), mid: t.mid * (1 + pct) };
  }

  function floorKcal(state) {
    const f = state.settings.coach.lowKcalFloor;
    return state.profile.sex === 'femme' ? f.femme : f.homme;
  }

  function sessionType(state, id) {
    return state.sessionTypes.find((t) => t.id === id) || state.sessionTypes.find((t) => t.cat === 'repos') || state.sessionTypes[0];
  }

  /** Séance du jour : séance réelle saisie, sinon séance prévue dans la semaine type. */
  function sessionFor(state, iso) {
    const d = state.days[iso];
    const id = (d && d.session) || state.weekPlan[U.weekdayKey(iso)];
    return sessionType(state, id);
  }

  /** Lipides du jour : objectif quotidien du profil s'il est renseigné, sinon valeur du type de séance. */
  function fatFor(state, type) {
    const f = state.profile.fatG;
    return typeof f === 'number' && f > 0 ? f : type.fat;
  }

  /** Macros pour une cible kcal + lipides donnés. Glucides = calories restantes. */
  function macrosFor(state, kcal, fatG) {
    const p = state.profile.proteinG;
    const fat = fatG;
    const carbs = Math.max(0, (kcal - p * 4 - fat * 9) / 4);
    return {
      kcal, p, l: fat, g: carbs, fib: state.profile.fiberG,
      pct: { p: (p * 4) / kcal * 100, l: (fat * 9) / kcal * 100, g: (carbs * 4) / kcal * 100 }
    };
  }

  /** Cible complète d'une journée donnée. */
  function dayTarget(state, iso) {
    const type = sessionFor(state, iso);
    const p = state.profile;
    const raw = type.kcal + (p.kcalOffset || 0);
    // Le plancher et le plafond du profil encadrent toujours la cible du jour
    const max = p.kcalMax > 0 ? p.kcalMax : Infinity, min = p.kcalMin > 0 ? Math.min(p.kcalMin, max) : 0;
    const kcal = Math.min(max, Math.max(min, raw));
    const m = macrosFor(state, kcal, fatFor(state, type));
    return Object.assign(m, { type, water: hydration(p, type.cat !== 'repos'), capped: kcal !== raw ? (kcal < raw ? 'max' : 'min') : null, rawKcal: raw });
  }

  /** Repère d'hydratation (pas une valeur médicale) : ~33 ml/kg + 0,5 L les jours d'entraînement. */
  function hydration(p, training) { return U.roundTo(p.weight * 0.033 + (training ? 0.5 : 0), 0.1); }

  /** Dépense estimée d'une activité : fourchette, jamais une valeur exacte. */
  function activityRange(kind, minutes, kg) {
    const m = MET[kind] || MET.autre;
    return [kcalPerMin(m[0], kg) * minutes, kcalPerMin(m[1], kg) * minutes];
  }

  function stepsRange(steps, kg) { return [steps * 0.035 * kg / 70, steps * 0.05 * kg / 70]; }

  /** Alertes liées au profil et aux cibles. */
  function profileAlerts(state) {
    const p = state.profile;
    const alerts = [];
    const floor = floorKcal(state);
    const minTarget = Math.min.apply(null, state.sessionTypes.map((t) => t.kcal + (p.kcalOffset || 0)));
    if (minTarget < floor) alerts.push({ level: 'danger', text: 'Une cible descend sous ' + U.num(floor) + ' kcal/jour. Un apport aussi bas mérite l\'avis d\'un professionnel de santé.' });
    const t = tdee(p);
    const deficit = 1 - minTarget / t.mid;
    if (p.goal === 'perte' && deficit > 0.25) alerts.push({ level: 'warn', text: 'Le déficit estimé dépasse 25 % les jours les plus bas. La dépense est une estimation : la tendance des prochaines semaines dira si c\'est trop.' });
    if (p.fatG > 0 && p.fatG / p.weight < 0.6) alerts.push({ level: 'warn', text: 'Lipides à ' + U.num(p.fatG / p.weight, 2) + ' g/kg : sous la plage conseillée de 0,7–1,0 g/kg (au moins ' + Math.round(p.weight * 0.7) + ' g/jour pour toi).' });
    const ppk = p.proteinG / p.weight;
    if (ppk < 1.6) alerts.push({ level: 'warn', text: 'Protéines à ' + U.num(ppk, 1) + ' g/kg : en dessous de la plage conseillée (1,6–2,2 g/kg) pour préserver le muscle en déficit.' });
    if (ppk > 2.4) alerts.push({ level: 'info', text: 'Protéines à ' + U.num(ppk, 1) + ' g/kg : au-delà de 2,2 g/kg, le bénéfice supplémentaire est peu documenté.' });
    state.sessionTypes.forEach((ty) => {
      const fpk = fatFor(state, ty) / p.weight;
      if (fpk < 0.6 && !(p.fatG > 0)) alerts.push({ level: 'warn', text: 'Lipides de « ' + ty.label + ' » à ' + U.num(fpk, 2) + ' g/kg : sous la plage 0,7–1,0 g/kg.' });
      const m = macrosFor(state, ty.kcal + (p.kcalOffset || 0), fatFor(state, ty));
      if (m.g < 100) alerts.push({ level: 'warn', text: 'Glucides de « ' + ty.label + ' » sous 100 g : peu adapté à un entraînement régulier.' });
    });
    if (p.pregnancy || p.medicalCondition || p.medication) alerts.push({ level: 'danger', text: 'Situation médicale déclarée : le coach ne modifiera pas automatiquement tes objectifs. Fais valider tes cibles par un professionnel de santé.' });
    return alerts;
  }

  /** Durée indicative vers l'objectif pour une plage de perte en % du poids/semaine. */
  function timeToGoal(p, pctLow, pctHigh) {
    const toLose = p.weight - p.targetWeight;
    if (toLose <= 0) return null;
    const fast = p.weight * pctHigh / 100, slow = p.weight * pctLow / 100;
    return { min: Math.ceil(toLose / fast), max: Math.ceil(toLose / slow) };
  }

  return { bmr, tdee, goalKcal, floorKcal, sessionType, sessionFor, fatFor, macrosFor, dayTarget, hydration, activityRange, stepsRange, profileAlerts, timeToGoal, MET };
})();
