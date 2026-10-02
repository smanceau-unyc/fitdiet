/**
 * trends.js — Tendances du poids et du tour de taille.
 * Principe : une pesée isolée ne signifie rien ; on raisonne sur des moyennes.
 */
window.FD = window.FD || {};

FD.trends = (function () {
  const U = FD.utils;

  function valuesBetween(state, key, startIso, endIso) {
    const out = [];
    for (let iso = startIso; iso <= endIso; iso = U.addDays(iso, 1)) {
      const d = state.days[iso];
      if (d && typeof d[key] === 'number') out.push({ iso, v: d[key] });
    }
    return out;
  }

  /** Moyenne des valeurs disponibles sur les n jours se terminant à endIso. */
  function windowAvg(state, key, endIso, n) {
    const v = valuesBetween(state, key, U.addDays(endIso, -(n - 1)), endIso);
    return { avg: U.mean(v.map((x) => x.v)), count: v.length };
  }

  /** Moyennes par blocs de 7 jours : index 0 = 7 derniers jours, 1 = semaine précédente… */
  function weeklyBlocks(state, endIso, nWeeks) {
    const blocks = [];
    for (let i = 0; i < nWeeks; i++) {
      const end = U.addDays(endIso, -7 * i);
      const w = windowAvg(state, 'weight', end, 7);
      blocks.push({ end, start: U.addDays(end, -6), avg: w.avg, count: w.count });
    }
    return blocks;
  }

  function classify(pct, stable) {
    if (pct === null) return 'inconnu';
    if (pct <= -1) return 'perte_tres_elevee';
    if (pct <= -0.75) return 'perte_elevee';
    if (pct <= -0.25) return 'perte_moderee';
    if (pct < -stable) return 'perte_faible';
    if (pct <= stable) return 'stable';
    return 'hausse';
  }

  const CLASS_LABEL = {
    perte_tres_elevee: 'perte très élevée (> 1 %/sem.)',
    perte_elevee: 'perte élevée (0,75–1 %/sem.)',
    perte_moderee: 'perte modérée (0,25–0,75 %/sem.)',
    perte_faible: 'perte très faible (< 0,25 %/sem.)',
    stable: 'stable',
    hausse: 'en hausse',
    inconnu: 'données insuffisantes'
  };

  /** Tendance complète du poids à la date endIso. */
  function weightTrend(state, endIso) {
    const cfg = state.settings.coach;
    const blocks = weeklyBlocks(state, endIso, 5);
    const valid = (b) => b && b.count >= 3;
    let change = null, pct = null;
    if (valid(blocks[0]) && valid(blocks[1])) {
      change = blocks[0].avg - blocks[1].avg;
      pct = change / blocks[0].avg * 100;
    }
    // Nombre de semaines consécutives sans perte significative (stagnation ou hausse)
    let flatWeeks = 0;
    for (let i = 0; i < 4; i++) {
      if (!valid(blocks[i]) || !valid(blocks[i + 1])) break;
      const p = (blocks[i].avg - blocks[i + 1].avg) / blocks[i].avg * 100;
      if (p > -cfg.stableWeekPct) flatWeeks++; else break;
    }
    let change28 = null;
    if (valid(blocks[0]) && valid(blocks[3])) change28 = blocks[0].avg - blocks[3].avg;
    const cls = classify(pct, cfg.stableWeekPct);
    return {
      blocks, change, pct, cls, label: CLASS_LABEL[cls], flatWeeks, change28,
      avg7: windowAvg(state, 'weight', endIso, 7),
      avg14: windowAvg(state, 'weight', endIso, 14),
      avg28: windowAvg(state, 'weight', endIso, 28)
    };
  }

  /** Détection des variations rapides (eau, glycogène, sodium, contenu digestif). */
  function fluctuations(state, endIso) {
    const pts = valuesBetween(state, 'weight', U.addDays(endIso, -6), endIso);
    const notes = [];
    if (pts.length >= 3) {
      const vals = pts.map((x) => x.v);
      const range = Math.max.apply(null, vals) - Math.min.apply(null, vals);
      if (range >= 1) notes.push({ code: 'fluctuation', text: 'Ton poids a varié de ' + U.num(range, 1) + ' kg sur 7 jours. La variation à court terme peut être liée à l\'eau, au glycogène, au sodium ou au contenu digestif. La moyenne hebdomadaire est plus informative.' });
    }
    const last = pts[pts.length - 1];
    if (last) {
      const ref = valuesBetween(state, 'weight', U.addDays(last.iso, -3), U.addDays(last.iso, -2));
      if (ref.length) {
        const minRef = Math.min.apply(null, ref.map((x) => x.v));
        if (last.v - minRef >= 1) notes.push({ code: 'hausse_rapide', text: 'Une hausse de ' + U.num(last.v - minRef, 1) + ' kg en 2 jours est très probablement liée à l\'eau et au contenu digestif, pas à de la graisse. Observe la tendance sur plusieurs jours.' });
      }
    }
    return notes;
  }

  /** Tendance du tour de taille : dernière mesure vs mesure de 10 à 28 jours avant. */
  function waistTrend(state, endIso) {
    const cfg = state.settings.coach;
    const pts = valuesBetween(state, 'waist', U.addDays(endIso, -42), endIso);
    if (pts.length < 2) return { status: 'inconnu', delta: null, now: pts[0] || null, prev: null, caution: false };
    const now = pts[pts.length - 1];
    if (U.diffDays(now.iso, endIso) > 10) return { status: 'inconnu', delta: null, now, prev: null, caution: false };
    // Référence : la mesure la plus ancienne entre 10 et 28 jours avant la dernière (tendance sur 2 à 4 semaines)
    const candidates = pts.filter((p) => { const g = U.diffDays(p.iso, now.iso); return g >= 10 && g <= 28; });
    if (!candidates.length) return { status: 'inconnu', delta: null, now, prev: null, caution: false };
    const prev = candidates[0];
    const delta = now.v - prev.v;
    const status = delta <= -cfg.waistStableCm ? 'baisse' : delta >= cfg.waistStableCm ? 'hausse' : 'stable';
    const c1 = (state.days[now.iso] || {}).waistConditions, c2 = (state.days[prev.iso] || {}).waistConditions;
    return { status, delta, now, prev, days: U.diffDays(prev.iso, now.iso), caution: !!(c1 && c2 && c1 !== c2) };
  }

  /** Série journalière pour les graphiques : valeur brute + moyenne mobile 7 jours. */
  function dailySeries(state, key, endIso, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const iso = U.addDays(endIso, -i);
      const d = state.days[iso];
      const raw = d && typeof d[key] === 'number' ? d[key] : null;
      const w = windowAvg(state, key, iso, 7);
      out.push({ iso, raw, ma7: w.count >= 3 ? w.avg : null });
    }
    return out;
  }

  /** Premier relevé de l'historique (pour "évolution depuis le début"). */
  function firstValue(state, key) {
    const keys = Object.keys(state.days).sort();
    for (const k of keys) if (typeof state.days[k][key] === 'number') return { iso: k, v: state.days[k][key] };
    return null;
  }

  function lastValue(state, key, endIso) {
    const keys = Object.keys(state.days).filter((k) => !endIso || k <= endIso).sort().reverse();
    for (const k of keys) if (typeof state.days[k][key] === 'number') return { iso: k, v: state.days[k][key] };
    return null;
  }

  return { valuesBetween, windowAvg, weeklyBlocks, classify, CLASS_LABEL, weightTrend, fluctuations, waistTrend, dailySeries, firstValue, lastValue };
})();
