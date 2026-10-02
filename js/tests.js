/**
 * tests.js — Scénarios de test du moteur de coaching (exécutés par tests.html,
 * ou en ligne de commande avec Node : node js/run-tests-node.js).
 */
window.FD = window.FD || {};

FD.tests = (function () {
  const U = FD.utils;
  const TODAY = '2026-10-02';

  /**
   * Construit un état synthétique sur 28 jours.
   * opts.weight(i) : poids au jour i (0 = il y a 27 jours, 27 = aujourd'hui) ou null
   * opts.waist : [début, fin] mesuré tous les 7 jours
   * opts.kcalFactor(i) : apport / cible, ou null pour un jour non suivi
   */
  function scenario(opts) {
    const s = FD.storage.defaultState();
    s.templates = [];
    Object.assign(s.profile, opts.profile || {});
    for (let i = 0; i < 28; i++) {
      const iso = U.addDays(TODAY, i - 27);
      const d = { foods: [] };
      s.days[iso] = d;
      const w = opts.weight(i);
      if (w !== null) d.weight = Math.round(w * 10) / 10;
      if (opts.waist && i % 7 === 6) d.waist = opts.waist[0] + (opts.waist[1] - opts.waist[0]) * (i / 27);
      const f = opts.kcalFactor ? opts.kcalFactor(i) : 1;
      if (f !== null) {
        const t = FD.calc.dayTarget(s, iso);
        d.manualKcal = Math.round(t.kcal * f);
        d.manualProtein = Math.round(t.p * (opts.proteinFactor || 1));
      }
      d.steps = opts.steps || 9000;
      if (opts.perf) d.perf = opts.perf;
      if (opts.hunger) d.hunger = opts.hunger;
    }
    if (opts.checkin) s.checkins[U.isoWeekKey(TODAY)] = opts.checkin;
    return s;
  }

  const noise = (i) => [0.2, -0.15, 0.1, -0.2, 0.15, -0.1, 0][i % 7];

  const CASES = [
    {
      name: 'Test 1 — poids ↓, taille ↓, performances stables → maintien',
      build: () => scenario({ weight: (i) => 74.8 - i * 0.05 + noise(i), waist: [86.5, 85.2], perf: 'stable' }),
      check: (r) => r.code === 'maintenir'
    },
    {
      name: 'Test 2 — poids stable, taille ↓ → maintien (recomposition)',
      build: () => scenario({ weight: (i) => 73.5 + noise(i), waist: [86.5, 85.3], perf: 'stable' }),
      check: (r) => r.code === 'maintenir_recompo'
    },
    {
      name: 'Test 3 — poids stable, taille stable, adhérence ≥ 85 % → +pas OU −kcal, jamais les deux',
      build: () => scenario({ weight: (i) => 73.5 + noise(i), waist: [85.5, 85.4], perf: 'stable' }),
      check: (r) => r.code === 'plateau' && r.options.length === 2 && r.options.some((o) => o.id === 'pas') && r.options.some((o) => o.id === 'kcal') && !r.applyNow
    },
    {
      name: 'Test 4 — perte > 1 %/sem., performances ↓, faim élevée → remonter les calories',
      build: () => scenario({ weight: (i) => 76 - i * 0.115 + noise(i) * 0.3, waist: [87, 85], perf: 'baisse', hunger: 8 }),
      check: (r) => r.code === 'augmenter_kcal' && r.options[0].apply.value > 0
    },
    {
      name: 'Test 5 — poids stable, adhérence 55 % → améliorer le suivi avant tout',
      build: () => scenario({ weight: (i) => 73.5 + noise(i), waist: [85.5, 85.4], kcalFactor: (i) => ([0, 2, 4].includes(i % 7) ? null : 1) }),
      check: (r) => r.code === 'ameliorer_adherence'
    },
    {
      name: 'Test 6 — +1 kg en 2 jours → pas de conclusion de prise de graisse',
      build: () => scenario({ weight: (i) => (i >= 26 ? 74.8 : 73.5 + noise(i) * 0.3), waist: [85.5, 85.4] }),
      check: (r) => r.notes.some((n) => n.code === 'hausse_rapide') && r.code !== 'plateau' && !r.options.some((o) => o.id === 'kcal')
    },
    {
      name: 'Test 7 — pas insuffisants, calories correctes, stagnation → priorité aux pas',
      build: () => scenario({ weight: (i) => 73.5 + noise(i), waist: [85.5, 85.4], steps: 5500, perf: 'stable' }),
      check: (r) => r.code === 'plateau' && r.options[0].id === 'pas'
    },
    {
      name: 'Profil de test (§39) — poids stable, taille ↓, 6 700 pas → calories inchangées, ~8 000 pas',
      build: () => scenario({ weight: (i) => 73.5 + noise(i), waist: [86.3, 85.5], steps: 6700, perf: 'stable' }),
      check: (r) => r.code === 'maintenir_recompo' && r.options[0] && r.options[0].apply.type === 'stepsGoal' && r.options[0].apply.value === 8000
    },
    {
      name: 'Sécurité — apport moyen très bas → aucun ajustement automatique',
      build: () => scenario({ weight: (i) => 74 - i * 0.03 + noise(i), waist: [86, 85], kcalFactor: () => 0.65 }),
      check: (r) => r.code === 'securite'
    },
    {
      name: 'Données insuffisantes — 5 pesées → pas de conclusion',
      build: () => scenario({ weight: (i) => (i >= 23 ? 73.5 + noise(i) : null) }),
      check: (r) => r.code === 'donnees_insuffisantes'
    },
    {
      name: 'Stagnation avec protéines à 80 % → protéines d\'abord, calories inchangées',
      build: () => Object.assign(scenario({ weight: (i) => 73.5 + noise(i), waist: [85.5, 85.4], proteinFactor: 0.8 })),
      check: (r) => r.code === 'ameliorer_proteines'
    }
  ];

  /* Tests de la livraison 2 (recettes, plan, substitutions) — n'utilisent pas le moteur coach. */
  const EXTRA = [
    {
      name: 'Recette — macros = somme exacte des ingrédients ÷ portions',
      run: () => {
        const s = FD.storage.defaultState();
        const r = FD.recipes.byId(s, 'r-chili');
        const c = FD.recipes.compute(s, r);
        let k = 0;
        r.ingredients.forEach((i) => { k += FD.foods.compute(FD.foods.byId(s, i.foodId), i.qty, i.unit).kcal; });
        return { ok: Math.abs(c.per.kcal - k / r.servings) < 0.01, title: U.num(c.per.kcal) + ' kcal/portion' };
      }
    },
    {
      name: 'Substitution poulet → cabillaud : protéines conservées (±10 %)',
      run: () => {
        const s = FD.storage.defaultState();
        const ing = { foodId: 'poulet-cru', qty: 150, unit: 'g', role: 'prot' };
        const sub = FD.recipes.substitute(s, ing, 'cabillaud-cru');
        const p1 = FD.foods.compute(FD.foods.byId(s, 'poulet-cru'), 150, 'g').p;
        const p2 = FD.foods.compute(FD.foods.byId(s, 'cabillaud-cru'), sub.qty, sub.unit).p;
        return { ok: Math.abs(p2 - p1) / p1 <= 0.1, title: sub.qty + ' g de cabillaud' };
      }
    },
    {
      name: 'Plan 7 jours — chaque journée à ±10 % des calories et ≥ 90 % des protéines',
      run: () => {
        const s = FD.storage.defaultState();
        const plan = FD.planner.generate(s, { days: 7, seed: 3 }, TODAY);
        const bad = plan.days.filter((d) => { const t = FD.planner.dayTotals(d); return Math.abs(t.kcal - d.target.kcal) / d.target.kcal > 0.1 || t.p < d.target.p * 0.9; });
        return { ok: !bad.length, title: bad.length ? bad.length + ' jour(s) hors cible' : '7 jours dans la cible' };
      }
    },
    {
      name: 'Plan — exclusion du profil respectée (« saumon »)',
      run: () => {
        const s = FD.storage.defaultState();
        s.profile.excluded = 'saumon';
        const plan = FD.planner.generate(s, { days: 7, seed: 5 }, TODAY);
        const found = plan.days.some((d) => d.meals.some((m) => m.ingredients.some((i) => i.foodId.startsWith('saumon'))));
        return { ok: !found, title: found ? 'saumon présent' : 'aucun saumon' };
      }
    },
    {
      name: 'Courses — le riz cuit du plan est converti en riz cru à acheter',
      run: () => {
        const s = FD.storage.defaultState();
        const plan = { start: TODAY, settings: {}, days: [{ iso: TODAY, meals: [{ ingredients: [{ foodId: 'riz-cuit', qty: 290, unit: 'g' }] }] }] };
        const list = FD.shopping.build(s, plan);
        const item = list.groups[0].items[0];
        return { ok: item.id === 'riz-cru' && /^1[01]0 g$/.test(item.qty), title: item.name + ' ' + item.qty };
      }
    }
    ,
    {
      name: 'Fruits et légumes à la pièce — 1 banane par défaut, calibres et poignée convertis en grammes',
      run: () => {
        const s = FD.storage.defaultState();
        const ban = FD.foods.byId(s, 'banane'), sal = FD.foods.byId(s, 'salade'), tom = FD.foods.byId(s, 'tomate');
        const du = FD.foods.defaultUnit(ban);
        const ok = du.unit === 'unite' && du.qty === '1' && FD.foods.toBaseQty(ban, 1, 'unite_g') === 156 &&
          FD.foods.toBaseQty(sal, 1, 'portion') === 30 && FD.foods.defaultUnit(tom).unit === 'unite' && FD.foods.defaultUnit(sal).unit === 'portion';
        return { ok, title: '1 grosse banane ≈ ' + FD.foods.toBaseQty(ban, 1, 'unite_g') + ' g' };
      }
    },
    {
      name: 'Prix — un prix saisi remplace le prix indicatif ; coût proratisé au poids',
      run: () => {
        const s = FD.storage.defaultState();
        const c1 = FD.prices.ingredientCost(s, { foodId: 'poulet-cru', qty: 150, unit: 'g' });
        s.prices['poulet-cru'] = { price: 9, per: 'kg' };
        const c2 = FD.prices.ingredientCost(s, { foodId: 'poulet-cru', qty: 150, unit: 'g' });
        return { ok: Math.abs(c1 - 1.8) < 0.001 && Math.abs(c2 - 1.35) < 0.001, title: U.num(c1, 2) + ' € → ' + U.num(c2, 2) + ' €' };
      }
    },
    {
      name: 'Photos — comparaison à 1 semaine / 1 mois / 3 mois, sans photo trop éloignée',
      run: () => {
        const ph = [['2026-07-03'], ['2026-09-01'], ['2026-10-02']].map((d, i) => ({ id: 'p' + i, date: d[0], view: 'face' }));
        const rows = FD.photos.comparison(ph, 'face');
        const ok = rows[0].photo.date === '2026-10-02' && rows[1].photo === null && rows[2].photo.date === '2026-09-01' && rows[3].photo.date === '2026-07-03';
        return { ok, title: rows.map((r) => r.photo ? r.photo.date : '—').join(' / ') };
      }
    }
  ];

  function run() {
    const extra = (FD.recipes && FD.planner && FD.shopping && FD.prices && FD.photos) ? EXTRA.map((c) => {
      try { const r = c.run(); return { name: c.name, ok: r.ok, code: 'calcul', title: r.title, recommend: '' }; }
      catch (e) { return { name: c.name, ok: false, err: e.message }; }
    }) : [];
    return CASES.map((c) => {
      let r, ok = false, err = null;
      try { r = FD.coach.evaluateUserState(c.build(), TODAY); ok = !!c.check(r); } catch (e) { err = e.message; }
      return { name: c.name, ok, code: r ? r.code : null, title: r ? r.title : null, recommend: r ? r.recommend : null, err };
    }).concat(extra);
  }

  return { run, scenario, TODAY };
})();
