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
    return { days: 7, mealsPerDay: Math.min(5, Math.max(3, state.profile.mealsPerDay || 4)), budget: 'moyen', fixed: { petitdej: 'r-skyr-bowl', diner: '' }, seed: 1 };
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
    score += uses * 0.25;
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
    const time = (r.prep || 0) + (r.cook || 0);
    const maxT = parseInt(state.profile.cookTime, 10) || 30;
    if (time > maxT) score += Math.min(0.4, (time - maxT) / 60);
    const pref = String(state.profile.preferred || '').split(/[,;]/).map((t) => U.norm(t).trim()).filter((t) => t.length >= 3);
    if (pref.some((t) => U.norm(r.name).includes(t))) score -= 0.12;
    if (slot.tag === 'pré-séance' && (r.tags || []).includes('pre-seance')) score -= 0.1;
    if (slot.tag === 'post-séance' && (r.tags || []).includes('post-seance')) score -= 0.05;
    score += ctx.rand() * 0.12; // un peu de variété entre deux générations
    return { recipe: r, fit, score };
  }

  /** Génère un plan complet. */
  function generate(state, settings, startIso) {
    const s = Object.assign(defaultSettings(state), settings || {});
    const rand = rng(s.seed || 1);
    const wb = FD.prices ? FD.prices.weeklyBudget(state) : null;
    const ctx = { uses: {}, basket: {}, budget: s.budget, rand, today: [], mealBudget: wb ? wb / 7 / s.mealsPerDay : null };
    const recipes = FD.recipes.all(state).filter((r) => FD.recipes.recipeAllowed(state, r).ok);
    const days = [];
    for (let d = 0; d < s.days; d++) {
      const iso = U.addDays(startIso, d);
      const st = slotTargets(state, iso, s.mealsPerDay);
      ctx.today = [];
      const meals = st.slots.map((slot) => {
        const fixedId = s.fixed && s.fixed[slot.meal];
        let choice = null;
        if (fixedId) {
          const r = recipes.find((x) => x.id === fixedId);
          if (r) choice = { recipe: r, fit: FD.recipes.fit(state, r, slot.target) };
        }
        if (!choice) {
          const cands = recipes.filter((r) => r.meals.includes(slot.meal)).map((r) => scoreRecipe(state, r, slot, ctx)).sort((a, b) => a.score - b.score);
          choice = cands[0] || null;
        }
        if (!choice) return { meal: slot.meal, label: slot.label, tag: slot.tag, target: slot.target, recipeId: null, ingredients: [], totals: FD.nutrition.zero() };
        ctx.uses[choice.recipe.id] = (ctx.uses[choice.recipe.id] || 0) + 1;
        ctx.today.push(choice.recipe.id);
        choice.fit.ingredients.forEach((i) => { ctx.basket[i.foodId] = true; });
        return { meal: slot.meal, label: slot.label, tag: slot.tag, target: slot.target, recipeId: choice.recipe.id, ingredients: choice.fit.ingredients, totals: choice.fit.totals };
      });
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

  return { SLOTS, defaultSettings, slotTargets, generate, recompute, dayTotals, alternative };
})();
