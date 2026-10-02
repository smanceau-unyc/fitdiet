/**
 * foods.js — Accès à la base d'aliments (démo + aliments personnels / Open Food Facts),
 * recherche, gestion du cru/cuit et calcul des valeurs pour une quantité donnée.
 */
window.FD = window.FD || {};

FD.foods = (function () {
  const U = FD.utils;

  const SOURCES = {
    demo: { label: 'Démo — valeur indicative à vérifier', short: 'Démo' },
    ciqual: { label: 'CIQUAL / ANSES', short: 'Ciqual' },
    off: { label: 'Open Food Facts', short: 'OFF' },
    user: { label: 'Saisie utilisateur', short: 'Perso' }
  };

  const CATS = {
    viandes: 'Viandes', poissons: 'Poissons', laitiers: 'Œufs et produits laitiers', feculents: 'Féculents',
    legumes: 'Légumes', fruits: 'Fruits', conserves: 'Conserves', epicerie: 'Épicerie', boissons: 'Boissons', autres: 'Autres'
  };

  /**
   * Tous les aliments. Un aliment de démo « lié » à une entrée Ciqual prend les valeurs
   * nutritionnelles Ciqual (son identifiant, son nom et ses unités restent ceux de la démo,
   * pour que recettes et repas types continuent de fonctionner).
   */
  function all(state) {
    const custom = state.customFoods || [];
    const links = state.foodLinks || {};
    const byCustomId = {};
    custom.forEach((c) => { byCustomId[c.id] = c; });
    const base = (window.FD_FOODS || []).map((f) => {
      const linked = links[f.id] && byCustomId[links[f.id]];
      if (!linked) return Object.assign({ source: 'demo' }, f);
      return Object.assign({}, f, {
        kcal: linked.kcal, p: linked.p, g: linked.g, l: linked.l, fib: linked.fib, sug: linked.sug, salt: linked.salt,
        source: 'ciqual', ciqualCode: linked.ciqualCode, ciqualName: linked.base, ciqualVersion: linked.ciqualVersion, variable: !!f.variable
      });
    });
    return base.concat(custom);
  }

  function byId(state, id) { return all(state).find((f) => f.id === id) || null; }

  function displayName(f) {
    let n = f.base;
    if (f.brand) n += ' (' + f.brand + ')';
    if (f.state) n += ' — ' + f.state;
    return n;
  }

  function sourceLabel(f) {
    const s = SOURCES[f.source] || SOURCES.demo;
    let txt = 'Source : ' + s.label;
    if (f.source === 'ciqual') txt = 'Source : ' + (f.ciqualVersion || 'CIQUAL') + (f.ciqualName && f.ciqualName !== f.base ? ' — « ' + f.ciqualName + ' »' : '') + (f.ciqualCode ? ' (code ' + f.ciqualCode + ')' : '');
    if (f.source === 'off' && f.barcode) txt += ' — produit identifié par code-barres ' + f.barcode;
    return txt;
  }

  /**
   * Recherche groupée : les variantes cru/cuit d'un même aliment sont regroupées
   * pour que l'interface demande explicitement l'état avant l'ajout.
   */
  function search(state, query, limit) {
    const q = U.norm(query).trim();
    if (!q) return [];
    const terms = q.split(/\s+/);
    const groups = {};
    all(state).forEach((f) => {
      const hay = U.norm(f.base + ' ' + (f.brand || '') + ' ' + (f.barcode || ''));
      if (!terms.every((t) => hay.includes(t))) return;
      const key = U.norm(f.base) + '|' + U.norm(f.brand || '') + '|' + f.source;
      if (!groups[key]) groups[key] = { key, name: f.base + (f.brand ? ' (' + f.brand + ')' : ''), variants: [] };
      groups[key].variants.push(f);
    });
    return Object.values(groups)
      .sort((a, b) => U.norm(a.name).indexOf(terms[0]) - U.norm(b.name).indexOf(terms[0]) || a.name.localeCompare(b.name))
      .slice(0, limit || 12);
  }

  /** Calibres pour les fruits et légumes vendus à la pièce (facteur appliqué au poids moyen). */
  const SIZES = { unite_p: { factor: 0.75, label: 'petit calibre' }, unite: { factor: 1, label: 'calibre moyen' }, unite_g: { factor: 1.3, label: 'gros calibre' } };
  const hasSizes = (f) => !!f.unitG && (f.cat === 'fruits' || f.cat === 'legumes') && f.unitG >= 30;

  /** Unités possibles pour un aliment, avec l'équivalent en grammes pour les mesures ménagères. */
  function unitsFor(f) {
    const u = [];
    const w = f.basis === '100ml' ? ' ml' : ' g';
    if (f.unitG) {
      if (hasSizes(f)) Object.keys(SIZES).forEach((k) => u.push({ id: k, label: (f.unitLabel || 'unité') + ' — ' + SIZES[k].label + ' (≈ ' + Math.round(f.unitG * SIZES[k].factor) + w + ')' }));
      else u.push({ id: 'unite', label: (f.unitLabel || 'unité') + ' (≈ ' + f.unitG + w + ')' });
    }
    if (f.portionG) u.push({ id: 'portion', label: (f.portionLabel || 'portion') + ' (≈ ' + f.portionG + w + ')' });
    u.push({ id: 'g', label: 'g' }, { id: 'kg', label: 'kg' });
    if (f.basis === '100ml') u.push({ id: 'ml', label: 'ml' });
    return u;
  }

  /** Unité proposée par défaut : la pièce ou la mesure ménagère quand elle existe. */
  function defaultUnit(f) {
    if (f.unitG && (f.cat === 'fruits' || f.cat === 'legumes' || f.id === 'oeuf' || f.unitLabel)) return { unit: 'unite', qty: '1' };
    if (f.portionG && (f.cat === 'fruits' || f.cat === 'legumes')) return { unit: 'portion', qty: '1' };
    return { unit: f.basis === '100ml' ? 'ml' : 'g', qty: '100' };
  }

  /** Convertit une quantité saisie en grammes (ou ml) de référence. Renvoie null si impossible. */
  function toBaseQty(f, qty, unit) {
    switch (unit) {
      case 'g': return qty;
      case 'kg': return qty * 1000;
      case 'ml': return qty; // pour un aliment en 100 ml : même base
      case 'unite': case 'unite_p': case 'unite_g': return f.unitG ? qty * f.unitG * SIZES[unit].factor : null;
      case 'portion': return f.portionG ? qty * f.portionG : null;
      default: return null;
    }
  }

  /** Valeurs nutritionnelles pour une quantité : somme exacte à partir des valeurs /100. */
  function compute(f, qty, unit) {
    const base = toBaseQty(f, qty, unit);
    if (base === null) return null;
    const r = base / 100;
    return {
      grams: base,
      kcal: f.kcal * r, p: f.p * r, g: f.g * r, l: f.l * r,
      fib: (f.fib || 0) * r, sug: (f.sug || 0) * r, salt: (f.salt || 0) * r
    };
  }

  /** Libellé lisible d'une quantité : "150 g", "3 × œuf moyen", "1 × portion (30 g)". */
  function qtyLabel(f, qty, unit) {
    const q = U.num(qty, qty % 1 ? 1 : 0);
    if (unit === 'unite' || unit === 'unite_p' || unit === 'unite_g') {
      const size = f && hasSizes(f) && unit !== 'unite' ? ', ' + SIZES[unit].label : '';
      return q + ' × ' + ((f && f.unitLabel) || 'unité') + size;
    }
    if (unit === 'portion') return q + ' × ' + ((f && f.portionLabel) || 'portion');
    return q + ' ' + unit;
  }

  const isPiece = (unit) => unit === 'unite' || unit === 'unite_p' || unit === 'unite_g';

  return { SOURCES, CATS, all, byId, displayName, sourceLabel, search, unitsFor, defaultUnit, toBaseQty, compute, qtyLabel, isPiece };
})();
