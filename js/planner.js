/**
 * planner.js — Générateur de plan alimentaire (1, 3 ou 7 jours).
 *
 * Pour chaque repas : cible = répartition de la cible du jour (qui dépend de la séance),
 * puis choix de la recette qui minimise un score combinant :
 *  - l'écart aux calories et aux protéines après ajustement des portions ;
 *  - la variété (pénalité si la recette revient souvent) ;
 *  - l'anti-gaspillage (bonus si les ingrédients sont déjà dans la liste de courses) ;
 *  - le budget (pénalité pour les ingrédients premium si budget serré) ;
 *  - le temps de préparation et les aliments préférés.
 * Les protéines ne sont jamais sacrifiées au prix : leur manque pèse le plus lourd.
 */
window.FD = window.FD || {};

FD.planner = (function () {
  const U = FD.utils;

  const SLOTS = {
    3: [{ meal: 'petitdej', label: 'Petit-déjeuner', share: 0.27 }, { meal: 'dejeuner', label: 'Déjeuner', share: 0.38 }, { meal: 'diner', label: 'Dîner', share: 0.35 }],
    4: [{ meal: 'petitdej', label: 'Petit-déjeuner', share: 0.23 }, { meal: 'dejeuner', label: 'Déjeuner', share: 0.33 }, { meal: 'collation', label: 'Collation', share: 0.12 }, { meal: 'diner', label: 'Dîner', share: 0.32 }],
    5: [{ meal: 'petitdej', label: 'Petit-déjeuner', share: 0.22 }, { meal: 'collation', label: 'Collation matin', share: 0.1 }, { meal: 'dejeuner', label: 'Déjeuner', share: 0.3 }, { meal: 'collation', label: 'Collation', share: 0.1 }, { meal: 'diner', label: 'Dîner', share: 0.28 }]
  };

  function defaultSettings(state) {
    return { days: 7, mealsPerDay: Math.min(5, Math.max(3, state.profile.mealsPerDay || 4)), budget: 'moyen', fixed: { petitdej: 'r-skyr-bowl', diner: '' }, seed: 1, pool: 'all', batch: 0 };
  }

  function rng(seed) { let s = seed * 7919 % 233280 || 1; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

  /** Cibles par repas pour une journée : on part de la répartition, en déplaçant des glucides vers le repas pré/post-séance. */
  function slotTargets(state, iso, nMeals) {
    const tg = FD.calc.dayTarget(state, iso);
    const slots = SLOTS[nMeals] || SLOTS[4];
    const training = tg.type.cat !== 'repos';
    const hour = parseInt((state.profile.trainingTime || '07:00').split(':')[0], 10);
    // repas qui suit la séance : petit-déj si avant 7 h, sinon le repas principal suivant
    let post = hour < 11 ? 'dejeuner' : hour < 16 ? 'dejeuner' : 'diner';
    let pre = hour < 10 ? 'petitdej' : hour < 16 ? 'collation' : 'collation';
    if (!slots.some((s) => s.meal === pre)) pre = hour < 12 ? 'petitdej' : 'dejeuner';
    return { target: tg, slots: slots.map((s) => {
      let shareK = s.share, shareG = s.share;
      if (training && (s.meal === pre || s.meal === post)) shareG += 0.03;
      if (training && s.meal === 'diner' && post !== 'diner') shareG -= 0.04;
      const kcal = tg.kcal * shareK, p = tg.p * s.share;
      return Object.assign({}, s, { target: { kcal, p, g: tg.g * shareG, l: tg.l * s.share }, tag: training ? (s.meal === pre ? 'pré-séance' : s.meal === post ? 'post-séance' : '') : '' });
    }) };
  }

  function ingredientKeys(ings) { return ings.map((i) => i.foodId); }

  function scoreRecipe(state, r, slot, ctx) {
    const fit = FD.recipes.fit(state, r, slot.target);
    let score = FD.recipes.fitError(fit.totals, slot.target);
    const uses = ctx.uses[r.id] || 0;
    score += uses * 0.3;
    if (ctx.yesterday && ctx.yesterday.includes(r.id)) score += 0.6; // pas le même plat que la veille
    if (ctx.today.includes(r.id)) score += 1;
    const reuse = ingredientKeys(fit.ingredients).filter((id) => ctx.basket[id]).length;
    score -= Math.min(0.3, reuse * 0.08);
    const premium = fit.ingredients.filter((i) => { const f = FD.foods.byId(state, i.foodId); return f && f.price === 'premium' && i.role !== 'other'; }).length;
    if (ctx.budget === 'eco') score += premium * 0.25;
    else if (ctx.budget === 'moyen') score += premium * 0.08;
    // Budget en euros (si saisi dans le profil) : pénalité proportionnelle au dépassement par repas.
    // Plafonnée, pour ne jamais l'emporter sur l'écart de protéines.
    if (ctx.mealBudget && FD.prices) {
      const c = FD.prices.mealCost(state, fit.ingredients).total;
      if (c > ctx.mealBudget) score += Math.min(0.35, (c - ctx.mealBudget) / ctx.mealBudget * 0.3);
    }
    // Temps par portion : un prep'meal de 45 min pour 4 repas ne coûte que ~11 min par repas
    const time = ((r.prep || 0) + (r.cook || 0)) / Math.max(1, r.servings >= 3 ? r.servings : 1);
    const maxT = parseInt(state.profile.cookTime, 10) || 30;
    if (time > maxT) score += Math.min(0.15, (time - maxT) / 120);
    if (ctx.prefer && r.source && r.source.collection === ctx.prefer) score -= 0.15;
    if (FD.recipes.isFav(state, r.id)) score -= ctx.favBoost || 0.12; // les favoris passent plus souvent
    const pref = String(state.profile.preferred || '').split(/[,;]/).map((t) => U.norm(t).trim()).filter((t) => t.length >= 3);
    if (pref.some((t) => U.norm(r.name).includes(t))) score -= 0.12;
    if (slot.tag === 'pré-séance' && (r.tags || []).includes('pre-seance')) score -= 0.1;
    if (slot.tag === 'post-séance' && (r.tags || []).includes('post-seance')) score -= 0.05;
    score += ctx.rand() * 0.12; // un peu de variété entre deux générations
    return { recipe: r, fit, score };
  }

  /** Recettes utilisables selon le choix « Recettes » du formulaire. */
  function poolOf(state, pool) {
    const all = FD.recipes.all(state).filter((r) => FD.recipes.recipeAllowed(state, r).ok);
    if (!pool || pool === 'all' || pool.startsWith('prefer:')) return all;
    if (pool === 'app') return all.filter((r) => !r.source || r.source.type === 'app');
    if (pool === 'user') return all.filter((r) => r.source && r.source.type === 'user');
    if (pool === 'fav') return all; // « privilégier » : toutes les recettes, avec un avantage marqué aux favoris
    if (pool.startsWith('only:')) {
      const c = pool.slice(5);
      const only = all.filter((r) => r.source && r.source.collection === c);
      // repas non couverts par la collection (ex. collation) : on complète avec les autres recettes
      return only.concat(all.filter((r) => !(r.source && r.source.collection === c) && !['petitdej', 'dejeuner', 'diner'].some((m) => r.meals.includes(m) && only.some((o) => o.meals.includes(m)))));
    }
    return all;
  }

  /** Écart d'une journée complète à sa cible (calories, protéines, glucides, lipides). */
  function dayError(tot, T) {
    return (tot.kcal > T.kcal ? 1.6 : 1) * Math.abs(tot.kcal - T.kcal) / T.kcal + 1.5 * Math.max(0, T.p - tot.p) / T.p +
      0.3 * Math.max(0, tot.p - T.p * 1.15) / T.p + 0.5 * Math.abs(tot.g - T.g) / Math.max(T.g, 1) + 0.7 * Math.abs(tot.l - T.l) / Math.max(T.l, 1);
  }

  /** Génère un plan complet. */
  function generate(state, settings, startIso) {
    const s = Object.assign(defaultSettings(state), settings || {});
    const rand = rng(s.seed || 1);
    const wb = FD.prices ? FD.prices.weeklyBudget(state) : null;
    const ctx = { uses: {}, basket: {}, budget: s.budget, rand, today: [], mealBudget: wb ? wb / 7 / s.mealsPerDay : null, prefer: s.pool && s.pool.startsWith('prefer:') ? s.pool.slice(7) : null, favBoost: s.pool === 'fav' ? 0.35 : 0.12 };
    const recipes = poolOf(state, s.pool);
    const batch = {}; // déjeuner → { recipe, left } : un prep'meal cuisiné une fois sert plusieurs jours
    const batchDays = s.batch === true ? 2 : Math.max(0, parseInt(s.batch, 10) || 0); // nombre de jours couverts (0 = désactivé)
    const days = [];
    for (let d = 0; d < s.days; d++) {
      const iso = U.addDays(startIso, d);
      const st = slotTargets(state, iso, s.mealsPerDay);
      ctx.yesterday = days.length ? days[days.length - 1].meals.map((m) => m.recipeId) : [];
      ctx.today = [];
      const lastIdx = st.slots.length - 1;
      const eatenSoFar = () => meals.reduce((a, m) => FD.nutrition.add(a, m.totals), FD.nutrition.zero());
      const meals = [];
      st.slots.forEach((slot, idx) => {
        const fixedId = s.fixed && s.fixed[slot.meal];
        const isLast = idx === lastIdx;
        // cible du dernier repas : ce qu'il reste pour boucler la journée
        const target = isLast ? (() => { const so = eatenSoFar(); return { kcal: Math.max(200, st.target.kcal - so.kcal), p: Math.max(10, st.target.p - so.p) }; })() : slot.target;
        const slotT = Object.assign({}, slot, { target });
        let choice = null;
        if (fixedId) {
          const r = recipes.find((x) => x.id === fixedId) || FD.recipes.byId(state, fixedId);
          if (r) choice = { recipe: r, fit: FD.recipes.fit(state, r, target) };
        }
        const key = slot.meal + (slot.label || '');
        if (!choice && batchDays > 1 && slot.meal === 'dejeuner' && batch[key] && batch[key].left > 0 && !ctx.today.includes(batch[key].recipe.id)) {
          batch[key].left--;
          choice = { recipe: batch[key].recipe, fit: FD.recipes.fit(state, batch[key].recipe, target), batched: true };
        }
        if (!choice) {
          let cands = recipes.filter((r) => r.meals.includes(slot.meal)).map((r) => scoreRecipe(state, r, slotT, ctx));
          if (isLast) {
            // dernier repas : on choisit sur l'écart de la journée entière (y compris glucides et lipides)
            const so = eatenSoFar();
            cands.forEach((c) => { c.score = c.score - FD.recipes.fitError(c.fit.totals, target) + 1.2 * dayError(FD.nutrition.add(Object.assign({}, so), c.fit.totals), st.target); });
          }
          cands.sort((a, b) => a.score - b.score);
          choice = cands[0] || null;
          // batch cooking : uniquement au déjeuner, le dîner reste varié
          if (choice && batchDays > 1 && slot.meal === 'dejeuner' && FD.recipes.category(choice.recipe) === 'prepmeal' && choice.recipe.servings >= 2) batch[key] = { recipe: choice.recipe, left: Math.min(batchDays, choice.recipe.servings) - 1 };
        }
        if (!choice) { meals.push({ meal: slot.meal, label: slot.label, tag: slot.tag, target, recipeId: null, ingredients: [], totals: FD.nutrition.zero() }); return; }
        ctx.uses[choice.recipe.id] = (ctx.uses[choice.recipe.id] || 0) + 1;
        ctx.today.push(choice.recipe.id);
        choice.fit.ingredients.forEach((i) => { ctx.basket[i.foodId] = true; });
        meals.push({ meal: slot.meal, label: slot.label, tag: slot.tag, target, recipeId: choice.recipe.id, ingredients: choice.fit.ingredients, totals: choice.fit.totals, batched: !!choice.batched });
      });
      // Garde-fou : la journée ne dépasse jamais le plafond du profil (on réduit le dernier repas ajustable)
      const cap = state.profile.kcalMax > 0 ? state.profile.kcalMax : Infinity;
      const adjustable = meals.slice().reverse().filter((x) => x.recipeId && !(s.fixed && s.fixed[x.meal]));
      for (const m of adjustable) {
        const over = eatenSoFar().kcal - cap;
        if (over <= 0) break;
        const r = FD.recipes.byId(state, m.recipeId);
        // 1) réajuster protéines/féculents du repas ; 2) sinon, réduire légèrement la portion entière
        let f = FD.recipes.fit(state, r, { kcal: Math.max(150, m.totals.kcal - over - 10), p: Math.max(10, m.totals.p - 2) });
        if (f.totals.kcal > m.totals.kcal - over) {
          const ratio = Math.max(0.6, (m.totals.kcal - over - 10) / m.totals.kcal);
          const ings = m.ingredients.map((i) => Object.assign({}, i, { qty: FD.recipes.roundQty(i.qty * ratio, i.unit, FD.foods.byId(state, i.foodId)) }));
          f = { ingredients: ings, totals: FD.recipes.compute(state, { servings: 1 }, ings).total };
        }
        if (f.totals.kcal < m.totals.kcal) Object.assign(m, { ingredients: f.ingredients, totals: f.totals });
      }
      days.push({ iso, type: st.target.type.label, target: st.target, meals });
    }
    return { createdAt: new Date().toISOString(), start: startIso, settings: s, days };
  }

  /** Recalcule les totaux d'un repas après modification de ses ingrédients. */
  function recompute(state, meal) {
    meal.totals = FD.recipes.compute(state, { servings: 1 }, meal.ingredients).total;
    return meal;
  }

  function dayTotals(day) { return day.meals.reduce((a, m) => FD.nutrition.add(a, m.totals), FD.nutrition.zero()); }

  /** Propose une autre recette pour un repas du plan (la meilleure suivante). */
  function alternative(state, plan, dayIdx, mealIdx) {
    const day = plan.days[dayIdx], meal = day.meals[mealIdx];
    const wb = FD.prices ? FD.prices.weeklyBudget(state) : null;
    const ctx = { uses: {}, basket: {}, budget: plan.settings.budget, rand: rng(Date.now() % 1000), today: day.meals.map((m) => m.recipeId), mealBudget: wb ? wb / 7 / day.meals.length : null };
    plan.days.forEach((d) => d.meals.forEach((m) => { if (m.recipeId) ctx.uses[m.recipeId] = (ctx.uses[m.recipeId] || 0) + 1; m.ingredients.forEach((i) => { ctx.basket[i.foodId] = true; }); }));
    const cands = FD.recipes.all(state).filter((r) => r.meals.includes(meal.meal) && r.id !== meal.recipeId && FD.recipes.recipeAllowed(state, r).ok)
      .map((r) => scoreRecipe(state, r, meal, ctx)).sort((a, b) => a.score - b.score);
    if (!cands.length) return false;
    const pick = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
    Object.assign(meal, { recipeId: pick.recipe.id, ingredients: pick.fit.ingredients, totals: pick.fit.totals });
    return true;
  }

  /**
   * « Compléter ma journée » : à partir de ce qui est déjà saisi (ex. le petit-déjeuner),
   * propose les meilleures combinaisons de recettes pour les repas restants, portions ajustées,
   * afin que la journée atteigne au plus près calories, protéines, glucides et lipides.
   * Le dernier repas est recalé sur ce qu'il reste après les précédents.
   */
  function completeDay(state, iso, options) {
    const opts = Object.assign({ top: 3, perSlot: 7 }, options || {});
    const day = state.days[iso] || { foods: [] };
    const target = FD.calc.dayTarget(state, iso);
    const eaten = FD.tracking.dayTotals(state, iso);
    const n = Math.min(5, Math.max(3, state.profile.mealsPerDay || 4));
    const wanted = n >= 4 ? ['dejeuner', 'collation', 'diner'] : ['dejeuner', 'diner'];
    const logged = (m) => (day.foods || []).some((e) => e.meal === m);
    // Nombre de repas restants = repas par jour (profil) − repas déjà saisis, quels qu'ils soient
    const loggedCount = ['petitdej', 'dejeuner', 'collation', 'diner'].filter(logged).length;
    const left = Math.max(0, n - loggedCount);
    let slots = wanted.filter((m) => !logged(m));
    if (slots.length > left) slots = slots.slice(slots.length - left); // on garde les derniers repas de la journée
    if (!slots.length) return { slots, options: [], remaining: null, target, eaten };
    const remaining = { kcal: target.kcal - eaten.kcal, p: target.p - eaten.p, g: target.g - eaten.g, l: target.l - eaten.l };
    if (remaining.kcal < 150) return { slots, options: [], remaining, target, eaten };
    const SHARE = { dejeuner: 0.38, collation: 0.18, diner: 0.38 };
    const totShare = slots.reduce((a, m) => a + SHARE[m], 0);
    const slotTarget = (m, rem) => ({ kcal: Math.max(0, rem.kcal) * SHARE[m] / totShare, p: Math.max(0, rem.p) * SHARE[m] / totShare });
    const recipes = FD.recipes.all(state).filter((r) => FD.recipes.recipeAllowed(state, r).ok);
    // Présélection des meilleures recettes par repas (variété : une recette par catégorie au maximum en tête)
    const cands = {};
    slots.forEach((m) => {
      const t = slotTarget(m, remaining);
      cands[m] = recipes.filter((r) => r.meals.includes(m) && FD.recipes.category(r) !== 'jus')
        .map((r) => { const f = FD.recipes.fit(state, r, t); return { recipe: r, fit: f, err: FD.recipes.fitError(f.totals, t) }; })
        .sort((a, b) => a.err - b.err).slice(0, opts.perSlot);
    });
    const err = (tot) => {
      const T = target;
      return (tot.kcal > T.kcal ? 1.6 : 1) * Math.abs(tot.kcal - T.kcal) / T.kcal + 1.5 * Math.max(0, T.p - tot.p) / T.p + 0.3 * Math.max(0, tot.p - T.p * 1.15) / T.p +
        0.6 * Math.abs(tot.g - T.g) / Math.max(T.g, 1) + 0.8 * Math.abs(tot.l - T.l) / Math.max(T.l, 1);
    };
    const last = slots[slots.length - 1], firsts = slots.slice(0, -1);
    const combos = [];
    const recurse = (i, picked) => {
      if (i < firsts.length) {
        cands[firsts[i]].forEach((c) => { if (!picked.some((p) => p.recipe.id === c.recipe.id)) recurse(i + 1, picked.concat([Object.assign({ meal: firsts[i] }, c)])); });
        return;
      }
      // dernier repas : cible = ce qu'il reste après les repas déjà choisis
      const sofar = picked.reduce((a, p) => FD.nutrition.add(a, p.fit.totals), FD.nutrition.add(FD.nutrition.zero(), eaten));
      const lastT = { kcal: Math.max(150, target.kcal - sofar.kcal), p: Math.max(10, target.p - sofar.p) };
      recipes.filter((r) => r.meals.includes(last) && FD.recipes.category(r) !== 'jus' && !picked.some((p) => p.recipe.id === r.id)).forEach((r) => {
        const f = FD.recipes.fit(state, r, lastT);
        const tot = FD.nutrition.add(Object.assign({}, sofar), f.totals);
        const meals = picked.concat([{ meal: last, recipe: r, fit: f }]);
        let e = err(tot);
        e -= 0.015 * meals.filter((m) => FD.recipes.isFav(state, m.recipe.id)).length; // léger avantage aux favoris
        const cats = meals.map((m) => FD.recipes.category(m.recipe));
        if (new Set(cats).size < cats.length) e += 0.04; // un peu de variété
        combos.push({ meals, totals: tot, error: e });
      });
    };
    recurse(0, []);
    combos.sort((a, b) => a.error - b.error);
    // Options distinctes : pas deux fois le même plat principal
    const out = [], seen = new Set();
    for (const c of combos) {
      const key = c.meals.filter((m) => m.meal !== 'collation').map((m) => m.recipe.id).join('|');
      if (seen.has(key)) continue;
      if (out.some((o) => o.meals.filter((m) => m.meal !== 'collation').some((m) => c.meals.some((x) => x.recipe.id === m.recipe.id)))) continue;
      seen.add(key); out.push(c);
      if (out.length >= opts.top) break;
    }
    return { slots, options: out, remaining, target, eaten };
  }

  return { SLOTS, defaultSettings, slotTargets, poolOf, generate, recompute, dayTotals, alternative, completeDay };
})();
