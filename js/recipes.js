/**
 * recipes.js — Recettes : calcul des macros à partir des ingrédients, portions ajustées
 * aux besoins, substitutions équivalentes, filtres (exclusions, régime), suggestions.
 *
 * Règle : aucune macro de recette n'est saisie à la main. Tout vient de la somme des
 * ingrédients, divisée par le nombre de portions.
 */
window.FD = window.FD || {};

FD.recipes = (function () {
  const U = FD.utils;

  const SOURCE_APP = { type: 'app', label: 'Recette créée par l\'application', date: '2026-10-02' };

  function all(state) {
    const base = (window.FD_RECIPES || []).map((r) => Object.assign({ source: SOURCE_APP }, r));
    return base.concat(state.recipes || []);
  }

  function byId(state, id) { return all(state).find((r) => r.id === id) || null; }

  function sourceLabel(r) {
    const s = r.source || SOURCE_APP;
    let t = s.label || 'Source inconnue';
    if (s.author) t += ' — ' + s.author;
    if (s.ref) t += ', ' + s.ref;
    if (s.url) t += ' — ' + s.url;
    if (s.date) t += ' (' + U.frShort(s.date.slice(0, 10)) + ')';
    return t;
  }

  /** Valeurs de chaque ligne + totaux + par portion. */
  function compute(state, recipe, ingredients) {
    const ings = ingredients || recipe.ingredients;
    const total = FD.nutrition.zero();
    const lines = [];
    const missing = [];
    let variable = false;
    const sources = {};
    ings.forEach((ing) => {
      const f = FD.foods.byId(state, ing.foodId);
      if (!f) { missing.push(ing.foodId); return; }
      const v = FD.foods.compute(f, ing.qty, ing.unit);
      if (!v) { missing.push(ing.foodId); return; }
      FD.nutrition.add(total, v);
      if (f.variable) variable = true;
      sources[f.source || 'demo'] = true;
      lines.push({ ing, food: f, v });
    });
    const n = recipe.servings || 1;
    const per = {};
    Object.keys(total).forEach((k) => { per[k] = total[k] / n; });
    return { total, per, lines, missing, variable, sources: Object.keys(sources) };
  }

  /** Arrondi d'une quantité selon l'unité (pas de fausse précision). */
  function roundQty(qty, unit, food) {
    if (FD.foods.isPiece(unit)) {
      // Les grosses pièces (avocat, mangue, courgette…) peuvent se couper en deux ; pas les œufs.
      if (food && food.unitG >= 100) return Math.max(0.5, Math.round(qty * 2) / 2);
      return Math.max(1, Math.round(qty));
    }
    if (unit === 'portion') return Math.max(0.5, Math.round(qty * 2) / 2);
    if (qty < 10) return Math.max(0.5, Math.round(qty * 2) / 2); // petites quantités (huile, miel…) : au demi-gramme
    const step = qty < 30 ? 1 : qty < 100 ? 5 : qty < 300 ? 10 : 25;
    return Math.max(step, Math.round(qty / step) * step);
  }

  /** Ingrédients d'UNE portion. */
  function perServing(recipe) {
    const n = recipe.servings || 1;
    return recipe.ingredients.map((i) => Object.assign({}, i, { qty: i.qty / n }));
  }

  /**
   * Ajuste une portion pour viser kcal et protéines d'un repas.
   * On résout un système 2×2 sur deux facteurs : a (sources de protéines) et c (féculents/fruits).
   * Légumes et assaisonnements ne bougent pas. Les facteurs sont bornés (0,6 – 1,8)
   * pour garder une assiette réaliste.
   */
  function fit(state, recipe, target, baseIngredients) {
    const ings = baseIngredients || perServing(recipe);
    const groupVal = (role) => {
      const sub = ings.filter((i) => (role === 'other' ? !['prot', 'carb'].includes(i.role) : i.role === role));
      return compute(state, { servings: 1 }, sub).total;
    };
    const P = groupVal('prot'), Cb = groupVal('carb'), O = groupVal('other');
    let a = 1, c = 1;
    if (target && target.kcal) {
      const tp = target.p, tk = target.kcal;
      const det = P.p * Cb.kcal - Cb.p * P.kcal;
      if (Math.abs(det) > 1e-6 && P.kcal + Cb.kcal > 0) {
        a = ((tp - O.p) * Cb.kcal - Cb.p * (tk - O.kcal)) / det;
        c = (P.p * (tk - O.kcal) - P.kcal * (tp - O.p)) / det;
      } else {
        const base = P.kcal + Cb.kcal + O.kcal;
        a = c = base > 0 ? tk / base : 1;
      }
      if (!(a > 0)) a = 0.6;
      if (!(c > 0)) c = 0.6;
      a = U.clamp(a, 0.6, 1.8); c = U.clamp(c, 0.6, 1.8);
      if (!Cb.kcal) c = 1;
      if (!P.kcal) a = 1;
    }
    const scaled = ings.map((i) => {
      const k = i.role === 'prot' ? a : i.role === 'carb' ? c : 1;
      // les ingrédients non ajustés gardent leur quantité (au dixième), seuls protéines et féculents sont arrondis
      const qty = k === 1 && !FD.foods.isPiece(i.unit) && i.unit !== 'portion' ? Math.round(i.qty * 10) / 10 : roundQty(i.qty * k, i.unit, FD.foods.byId(state, i.foodId));
      return Object.assign({ foodId: i.foodId, unit: i.unit, role: i.role, qty }, i.note ? { note: i.note } : {});
    });
    const res = compute(state, { servings: 1 }, scaled);
    return { ingredients: scaled, totals: res.total, factors: { prot: a, carb: c }, variable: res.variable };
  }

  /** Écart entre un repas et sa cible (0 = parfait). Les protéines manquantes pèsent plus lourd. */
  function fitError(totals, target) {
    if (!target || !target.kcal) return 0;
    const ek = Math.abs(totals.kcal - target.kcal) / target.kcal;
    const short = Math.max(0, target.p - totals.p) / Math.max(target.p, 1);
    const excess = Math.max(0, totals.p - target.p * 1.35) / Math.max(target.p, 1);
    return ek + 1.5 * short + 0.4 * excess;
  }

  /** Groupe de substitution d'un aliment (aliments existants uniquement). */
  function substitutesFor(state, foodId) {
    const groups = window.FD_SUBSTITUTES || [];
    const g = groups.find((x) => x.includes(foodId));
    let ids = g ? g.filter((x) => x !== foodId) : [];
    const f = FD.foods.byId(state, foodId);
    if (!ids.length && f) ids = FD.foods.all(state).filter((x) => x.cat === f.cat && x.id !== foodId && x.state === f.state).map((x) => x.id);
    return ids.map((id) => FD.foods.byId(state, id)).filter((x) => x && foodAllowed(state, x).ok);
  }

  /**
   * Remplace un ingrédient par un équivalent : la quantité est recalculée pour conserver
   * l'apport principal du rôle (protéines pour une source de protéines, glucides pour un féculent,
   * calories sinon).
   */
  function substitute(state, ing, newFoodId) {
    const oldF = FD.foods.byId(state, ing.foodId), newF = FD.foods.byId(state, newFoodId);
    if (!oldF || !newF) return ing;
    const key = ing.role === 'prot' ? 'p' : ing.role === 'carb' ? 'g' : 'kcal';
    const old = FD.foods.compute(oldF, ing.qty, ing.unit);
    let unit = ing.unit;
    if (FD.foods.toBaseQty(newF, 1, unit) === null) unit = newF.basis === '100ml' ? 'ml' : 'g';
    const perUnit = FD.foods.compute(newF, 1, unit);
    let qty = ing.qty;
    if (old && perUnit && perUnit[key] > 0.01) qty = old[key] / perUnit[key];
    else if (old && perUnit && perUnit.kcal > 0) qty = old.kcal / perUnit.kcal;
    // garde-fou : pas plus de 5× le poids d'origine (ex. légume remplacé par un féculent)
    const oldBase = FD.foods.toBaseQty(oldF, ing.qty, ing.unit) || 0;
    const newBase = FD.foods.toBaseQty(newF, qty, unit) || 0;
    if (oldBase && newBase > oldBase * 5) qty = qty * (oldBase * 5) / newBase;
    return { foodId: newFoodId, unit, role: ing.role, qty: roundQty(qty, unit, newF) };
  }

  /* ---------------- Filtres : exclusions, allergies, régime ---------------- */

  function terms(str) { return String(str || '').split(/[,;\n]/).map((t) => U.norm(t).trim()).filter((t) => t.length >= 3); }

  function foodAllowed(state, f) {
    const p = state.profile;
    const name = U.norm(f.base + ' ' + (f.brand || ''));
    const bad = terms(p.excluded).concat(terms(p.allergies)).concat(terms(p.intolerances));
    const hit = bad.find((t) => name.includes(t));
    if (hit) return { ok: false, reason: 'contient « ' + hit + ' »' };
    const meat = f.cat === 'viandes', fish = f.cat === 'poissons' || f.id === 'thon-naturel';
    const animal = meat || fish || f.cat === 'laitiers' || f.id === 'whey' || f.id === 'miel';
    if (p.diet === 'vegetarien' && (meat || fish)) return { ok: false, reason: 'régime végétarien' };
    if (p.diet === 'pescetarien' && meat) return { ok: false, reason: 'régime pescétarien' };
    if (p.diet === 'vegetalien' && animal) return { ok: false, reason: 'régime végétalien' };
    if (p.diet === 'sans-porc' && f.pork) return { ok: false, reason: 'sans porc' };
    return { ok: true };
  }

  function recipeAllowed(state, r) {
    for (const ing of r.ingredients) {
      const f = FD.foods.byId(state, ing.foodId);
      if (!f) return { ok: false, reason: 'ingrédient introuvable' };
      const a = foodAllowed(state, f);
      if (!a.ok) return a;
    }
    return { ok: true };
  }

  /**
   * Suggestions pour le reste de la journée : recettes ajustées pour approcher
   * les calories et protéines restantes. Renvoie les n meilleures.
   */
  function suggest(state, mealId, remaining, n) {
    const out = [];
    all(state).forEach((r) => {
      if (mealId && !r.meals.includes(mealId)) return;
      if (!recipeAllowed(state, r).ok) return;
      const f = fit(state, r, remaining);
      out.push({ recipe: r, fit: f, error: fitError(f.totals, remaining) });
    });
    return out.sort((a, b) => a.error - b.error).slice(0, n || 4);
  }

  /**
   * Importe un fichier de recettes ({ type: 'fitdiet-coach-recipes', foods, recipes }).
   * Les aliments et recettes de même identifiant sont remplacés (réimport sans doublon).
   */
  function importCollection(state, data) {
    if (!data || data.type !== 'fitdiet-coach-recipes' || !Array.isArray(data.recipes)) throw new Error('Ce fichier n\'est pas un fichier de recettes FitDiet Coach.');
    const foods = Array.isArray(data.foods) ? data.foods : [];
    const fIds = new Set(foods.map((f) => f.id));
    state.customFoods = (state.customFoods || []).filter((f) => !fIds.has(f.id)).concat(foods);
    const rIds = new Set(data.recipes.map((r) => r.id));
    state.recipes = (state.recipes || []).filter((r) => !rIds.has(r.id)).concat(data.recipes);
    const missing = [];
    data.recipes.forEach((r) => r.ingredients.forEach((i) => { if (!FD.foods.byId(state, i.foodId) && !missing.includes(i.foodId)) missing.push(i.foodId); }));
    return { recipes: data.recipes.length, foods: foods.length, collection: data.collection || null, missing };
  }

  /* ---------------- Catégories ---------------- */
  const CATEGORIES = [
    { id: 'overnight', label: 'Overnight oats' },
    { id: 'petitdej', label: 'Petits-déjeuners' },
    { id: 'prepmeal', label: 'Prep\'meals' },
    { id: 'repas', label: 'Repas' },
    { id: 'snack', label: 'Snacks, desserts et en-cas' },
    { id: 'smoothie', label: 'Smoothies' },
    { id: 'jus', label: 'Jus et potions' }
  ];

  /** Catégorie d'une recette : champ « category » s'il existe, sinon déduite du nom, des tags et des repas. */
  function category(r) {
    if (r.category) return r.category;
    const n = U.norm(r.name), tags = r.tags || [];
    if (tags.includes('jus') || /^(jus|potion)|juice|potion/.test(n)) return 'jus';
    if (/smoothie/.test(n)) return 'smoothie';
    if (/overnight/.test(n)) return 'overnight';
    const meal = r.meals.some((m) => m === 'dejeuner' || m === 'diner');
    if (meal && !r.meals.includes('collation') && (r.servings >= 3 || tags.includes('batch') || /prepmeal|prep meal/.test(n))) return 'prepmeal';
    if (meal && !r.meals.includes('collation')) return 'repas';
    if (r.meals.length === 1 && r.meals[0] === 'petitdej') return 'petitdej';
    if (r.meals.includes('petitdej') && !/cookie|cake|bread|brownie|tartelette|creme|coeur|granola|pain/.test(n)) return 'petitdej';
    return 'snack';
  }

  /* ---------------- Correspondance cru / cuit ---------------- */
  // Paires Ciqual intégrées utilisées par les recettes (en plus des paires de la base cru/cuit)
  const CIQ_PAIRS = { 'cq-9870': 'cq-9871', 'cq-9871': 'cq-9870', 'cq-4101': 'cq-4102', 'cq-4102': 'cq-4101', 'saumon-cru': 'cq-26230' };

  /**
   * Équivalent cru ↔ cuit d'un ingrédient (féculents, viandes, poissons), par conservation de l'énergie :
   * poids_autre = poids × kcal(état) / kcal(autre état). Renvoie null si pas de correspondance.
   */
  function cookEquivalent(state, ing) {
    const f = FD.foods.byId(state, ing.foodId);
    if (!f || !['feculents', 'viandes', 'poissons'].includes(f.cat) && !CIQ_PAIRS[f.id]) return null;
    let other = null;
    if (CIQ_PAIRS[f.id]) other = FD.foods.byId(state, CIQ_PAIRS[f.id]);
    else if (f.isBase && f.state) other = FD.foods.all(state).find((x) => x.isBase && x.base === f.base && x.state && x.state !== f.state) || null;
    if (!other || !other.kcal) return null;
    const grams = FD.foods.toBaseQty(f, ing.qty, ing.unit);
    if (!grams) return null;
    const st = other.state || (/cuit|roti|grill/.test(U.norm(other.base)) ? 'cuit' : 'cru');
    return { state: st, grams: Math.round(grams * f.kcal / other.kcal / 5) * 5, food: other };
  }

  function collections(state) {
    const c = {};
    (state.recipes || []).forEach((r) => { const k = r.source && r.source.collection; if (k) c[k] = (c[k] || 0) + 1; });
    return c;
  }

  return { CATEGORIES, category, cookEquivalent, importCollection, collections, all, byId, sourceLabel, compute, roundQty, perServing, fit, fitError, substitutesFor, substitute, foodAllowed, recipeAllowed, suggest, SOURCE_APP };
})();
