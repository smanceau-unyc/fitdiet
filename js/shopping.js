/**
 * shopping.js — Liste de courses générée à partir du plan.
 * Les quantités cuites sont reconverties en poids cru à acheter (conservation de l'énergie :
 * cru = cuit × kcal(cuit) / kcal(cru)), puis regroupées par rayon.
 */
window.FD = window.FD || {};

FD.shopping = (function () {
  const U = FD.utils;

  const CAT_ORDER = ['fruits', 'legumes', 'viandes', 'poissons', 'laitiers', 'feculents', 'conserves', 'epicerie', 'boissons', 'autres'];

  /** Variante crue d'un aliment cuit (même nom de base), si elle existe. */
  function rawVariant(state, f) {
    if (f.state !== 'cuit') return null;
    return FD.foods.all(state).find((x) => x.base === f.base && x.state === 'cru' && x.source === f.source) || null;
  }

  function build(state, plan) {
    const items = {};
    if (!plan) return { groups: [], count: 0 };
    plan.days.forEach((d) => d.meals.forEach((m) => m.ingredients.forEach((ing) => {
      let f = FD.foods.byId(state, ing.foodId);
      if (!f) return;
      let grams = FD.foods.toBaseQty(f, ing.qty, ing.unit) || 0;
      const raw = rawVariant(state, f);
      if (raw) { grams = grams * f.kcal / raw.kcal; f = raw; }
      const key = f.id;
      if (!items[key]) items[key] = { food: f, grams: 0, cookedGrams: 0, units: 0, uses: 0, cooked: false };
      items[key].grams += grams;
      items[key].uses++;
      if (raw) { items[key].cooked = true; items[key].cookedGrams += FD.foods.toBaseQty(FD.foods.byId(state, ing.foodId), ing.qty, ing.unit); }
      if (ing.unit === 'unite') items[key].units += ing.qty;
    })));
    const groups = {};
    Object.values(items).forEach((it) => {
      const f = it.food;
      let qty;
      if (f.unitG && (f.cat === 'fruits' || f.id === 'oeuf' || it.units)) {
        const n = Math.ceil(it.grams / f.unitG - 0.05);
        qty = n + ' × ' + (f.unitLabel || 'unité');
      } else {
        const g = it.grams;
        const unit = f.basis === '100ml' ? 'ml' : 'g';
        qty = g >= 1000 ? U.num(Math.ceil(g / 50) * 50 / 1000, 2).replace(/,?0+$/, '') + (unit === 'ml' ? ' L' : ' kg') : U.num(Math.ceil(g / 10) * 10) + ' ' + unit;
      }
      const cat = f.cat || 'autres';
      const cost = FD.prices ? FD.prices.costOf(state, f, it.grams) : null;
      const pr = FD.prices ? FD.prices.get(state, f.id) : null;
      (groups[cat] = groups[cat] || []).push({ id: f.id, name: f.base + (f.brand ? ' (' + f.brand + ')' : ''), qty, uses: it.uses, price: f.price || 'moyen',
        grams: it.grams, cost, priceInfo: pr, food: f,
        note: it.cooked ? 'inclut ≈ ' + U.num(U.roundTo(it.cookedGrams, 10)) + ' g notés cuits dans le plan' : '' });
    });
    const out = CAT_ORDER.filter((c) => groups[c]).map((c) => ({ cat: c, label: FD.foods.CATS[c] || c, items: groups[c].sort((a, b) => a.name.localeCompare(b.name)) }));
    const all = out.reduce((a, g) => a.concat(g.items), []);
    const priced = all.filter((i) => i.cost !== null);
    return {
      groups: out, count: all.length,
      cost: priced.reduce((a, i) => a + i.cost, 0), costMissing: all.length - priced.length,
      costUser: priced.filter((i) => i.priceInfo && i.priceInfo.source === 'utilisateur').length,
      tiers: { eco: all.filter((i) => i.price === 'eco').length, moyen: all.filter((i) => i.price === 'moyen').length, premium: all.filter((i) => i.price === 'premium').length },
      reused: all.filter((i) => i.uses >= 3).length
    };
  }

  function asText(list) {
    const body = list.groups.map((g) => g.label.toUpperCase() + '\n' + g.items.map((i) => '- ' + i.name + ' : ' + i.qty + (i.cost !== null ? ' (≈ ' + U.num(i.cost, 2) + ' €)' : '')).join('\n')).join('\n\n');
    return body + (list.cost ? '\n\nTotal estimé : ≈ ' + U.num(list.cost, 2) + ' €' : '');
  }

  return { build, asText, rawVariant };
})();
