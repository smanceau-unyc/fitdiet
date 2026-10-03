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

  /* ---------------- Ciqual intégrée (data/ciqual.js) ---------------- */

  /** Portions types indicatives par sous-groupe Ciqual (pour saisir « 1 assiette », « 1 bol »…). */
  const SUB_PORTIONS = {
    'plats composés': { portionG: 300, portionLabel: 'assiette', def: true },
    'pizzas, tartes et crêpes salées': { portionG: 150, portionLabel: 'part', def: true },
    'sandwichs': { unitG: 200, unitLabel: 'sandwich', def: true },
    'soupes': { portionG: 250, portionLabel: 'bol', def: true },
    'salades composées et crudités': { portionG: 250, portionLabel: 'assiette', def: true },
    'feuilletées et autres entrées': { portionG: 120, portionLabel: 'part', def: true },
    'viennoiseries': { unitG: 60, unitLabel: 'pièce', def: true },
    'gâteaux et pâtisseries': { portionG: 100, portionLabel: 'part', def: true },
    'biscuits sucrés': { portionG: 30, portionLabel: 'portion' },
    'céréales de petit-déjeuner': { portionG: 40, portionLabel: 'bol', def: true },
    'barres céréalières': { unitG: 25, unitLabel: 'barre', def: true },
    'produits laitiers frais et alternatives végétales': { portionG: 125, portionLabel: 'pot', def: true },
    'fromages et alternatives végétales': { portionG: 30, portionLabel: 'portion', def: true },
    'laits': { portionG: 200, portionLabel: 'verre', def: true },
    'boissons sans alcool': { portionG: 200, portionLabel: 'verre', def: true },
    'boisson alcoolisées': { portionG: 125, portionLabel: 'verre', def: true },
    'glaces': { portionG: 50, portionLabel: 'boule', def: true },
    'sorbets': { portionG: 50, portionLabel: 'boule', def: true },
    'desserts glacés': { portionG: 100, portionLabel: 'portion', def: true },
    'confitures et assimilés': { portionG: 20, portionLabel: 'cuillère à soupe' },
    'chocolats et produits à base de chocolat': { portionG: 20, portionLabel: 'portion' },
    'confiseries non chocolatées': { portionG: 30, portionLabel: 'portion' },
    'sauces': { portionG: 15, portionLabel: 'cuillère à soupe' },
    'huiles et graisses végétales': { portionG: 10, portionLabel: 'cuillère à soupe' },
    'beurres': { portionG: 10, portionLabel: 'noisette' },
    'margarines': { portionG: 10, portionLabel: 'noisette' },
    'fruits à coque et graines oléagineuses': { portionG: 30, portionLabel: 'poignée' },
    'biscuits apéritifs': { portionG: 30, portionLabel: 'poignée' },
    'crèmes et spécialités à base de crème': { portionG: 15, portionLabel: 'cuillère à soupe' },
    'pains et assimilés': { portionG: 50, portionLabel: 'part' }
  };

  let ciqRows = null;
  /** Aliments Ciqual intégrés, construits une seule fois. */
  function ciqualBuiltin() {
    if (ciqRows) return ciqRows;
    const C = window.FD_CIQUAL;
    if (!C || !FD.ciqual) { ciqRows = []; return ciqRows; }
    ciqRows = C.rows.map((r) => {
      const g = C.groups[r[2]] || '', sg = C.subgroups[r[3]] || '';
      let portion = SUB_PORTIONS[sg] || {};
      if (sg === 'boisson alcoolisées' && /biere|cidre/.test(U.norm(r[1]))) portion = { portionG: 250, portionLabel: 'verre', def: true };
      const drink = g === 'eaux et autres boissons' || sg === 'laits';
      return Object.assign({
        id: 'cq-' + r[0], base: r[1], brand: null, state: FD.ciqual.stateFromName(r[1]), cat: FD.ciqual.catFromGroup(g + ' ' + sg, r[1]),
        basis: drink ? '100ml' : '100g', kcal: r[4], p: r[5], g: r[6], l: r[7], fib: r[8] || 0, sug: r[9] || 0, salt: r[10] || 0,
        source: 'ciqual', ciqualCode: String(r[0]), ciqualVersion: C.version, ciqualGroup: sg || g, approx: !!(r[11] & 1), alcohol: !!(r[11] & 4),
        builtin: true, _n: U.norm(r[1])
      }, portion.unitG ? { unitG: portion.unitG, unitLabel: portion.unitLabel } : {}, portion.portionG ? { portionG: portion.portionG, portionLabel: portion.portionLabel } : {},
      portion.def ? { portionDefault: true, portionNote: true } : (portion.portionG || portion.unitG ? { portionNote: true } : {}));
    });
    return ciqRows;
  }

  // Cache de la liste complète, recalculé quand les aliments personnels ou les liaisons changent
  let cache = { sig: null, list: null, index: null };

  /**
   * Tous les aliments : base de l'app (liée à Ciqual quand une correspondance existe),
   * Ciqual intégrée, puis aliments personnels (Open Food Facts, import Ciqual, saisie).
   * Un aliment de base lié garde son identifiant, son nom et ses unités (recettes et repas types
   * continuent de fonctionner) mais prend les valeurs nutritionnelles Ciqual.
   */
  function all(state) {
    const custom = state.customFoods || [];
    const userLinks = state.foodLinks || {};
    const sig = custom.length + '|' + (custom.length ? custom[custom.length - 1].id : '') + '|' + JSON.stringify(userLinks);
    if (cache.sig === sig && cache.state === state) return cache.list;
    const imported = custom.some((c) => c.source === 'ciqual');
    const builtin = imported ? [] : ciqualBuiltin(); // un import Ciqual plus récent remplace la table intégrée
    const index = {};
    builtin.forEach((c) => { index[c.id] = c; });
    custom.forEach((c) => { index[c.id] = c; });
    const resolve = (target) => target && (index[target] || index[String(target).replace(/^cq-/, 'ciq-')] || index[String(target).replace(/^ciq-/, 'cq-')]);
    const builtinLinks = window.FD_CIQUAL_LINKS || {};
    const used = {};
    const base = (window.FD_FOODS || []).map((f) => {
      let target = null;
      if (Object.prototype.hasOwnProperty.call(userLinks, f.id)) target = userLinks[f.id]; // null = garder les valeurs de l'app
      else if (builtinLinks[f.id]) target = 'cq-' + builtinLinks[f.id];
      const linked = resolve(target);
      if (!linked) return Object.assign({ source: 'demo', isBase: true }, f);
      used[linked.id] = true;
      return Object.assign({}, f, {
        kcal: linked.kcal, p: linked.p, g: linked.g, l: linked.l, fib: linked.fib, sug: linked.sug, salt: linked.salt,
        source: 'ciqual', ciqualCode: linked.ciqualCode, ciqualName: linked.base, ciqualVersion: linked.ciqualVersion, variable: !!f.variable, isBase: true
      });
    });
    // Les entrées Ciqual déjà représentées par un aliment de base ne sont pas dupliquées
    const list = base.concat(builtin.filter((c) => !used[c.id])).concat(custom.filter((c) => !used[c.id]));
    const idx = {};
    list.forEach((f) => { idx[f.id] = f; });
    Object.keys(index).forEach((k) => { if (!idx[k]) idx[k] = index[k]; }); // les cibles de liaison restent accessibles par id
    cache = { sig, state, list, index: idx };
    return list;
  }

  function byId(state, id) { all(state); return cache.index[id] || null; }

  function displayName(f) {
    let n = f.base;
    if (f.brand) n += ' (' + f.brand + ')';
    if (f.state && !f.builtin) n += ' — ' + f.state; // les intitulés Ciqual précisent déjà cru / cuit
    return n;
  }

  function sourceLabel(f) {
    const s = SOURCES[f.source] || SOURCES.demo;
    let txt = 'Source : ' + s.label;
    if (f.source === 'ciqual') txt = 'Source : ' + (f.ciqualVersion || 'CIQUAL') + ' (ANSES)' + (f.ciqualName && f.ciqualName !== f.base ? ' — « ' + f.ciqualName + ' »' : '') + (f.ciqualCode ? ' (code ' + f.ciqualCode + ')' : '') + (f.approx ? ' — certaines valeurs sont des traces ou des seuils' : '');
    if (f.source === 'off' && f.barcode) txt += ' — produit identifié par code-barres ' + f.barcode;
    return txt;
  }

  /**
   * Recherche groupée : les variantes cru/cuit d'un même aliment sont regroupées
   * pour que l'interface demande explicitement l'état avant l'ajout.
   * Classement : aliments de base, puis tes produits, puis Ciqual ; nom qui commence par le mot cherché ;
   * nom le plus court (le plus générique).
   */
  function search(state, query, limit) {
    const q = U.norm(query).trim();
    if (!q) return [];
    const terms = q.split(/\s+/).map((t) => (t.length > 3 ? t.replace(/s$/, '') : t));
    const groups = {};
    all(state).forEach((f) => {
      const hay = f._n ? f._n : U.norm(f.base + ' ' + (f.brand || '') + ' ' + (f.barcode || ''));
      if (!terms.every((t) => hay.includes(t))) return;
      const key = U.norm(f.base) + '|' + U.norm(f.brand || '') + '|' + (f.isBase ? 'base' : f.source);
      if (!groups[key]) {
        const tier = f.isBase ? 0 : f.builtin ? 2 : 1;
        const starts = hay.startsWith(terms[0]) ? 0 : (' ' + hay).includes(' ' + terms[0]) ? 1 : 2;
        groups[key] = { key, name: f.base + (f.brand ? ' (' + f.brand + ')' : ''), variants: [], score: tier * 1000 + starts * 200 + Math.min(150, hay.length) };
      }
      groups[key].variants.push(f);
    });
    return Object.values(groups).sort((a, b) => a.score - b.score).slice(0, limit || 12);
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
    if (f.portionG && (f.cat === 'fruits' || f.cat === 'legumes' || f.portionDefault)) return { unit: 'portion', qty: '1' };
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
    const q = (unit === 'portion' || isPiece(unit)) ? U.frac(qty) : U.num(qty, qty % 1 ? 1 : 0);
    if (unit === 'unite' || unit === 'unite_p' || unit === 'unite_g') {
      const size = f && hasSizes(f) && unit !== 'unite' ? ', ' + SIZES[unit].label : '';
      return q + ' × ' + ((f && f.unitLabel) || 'unité') + size;
    }
    if (unit === 'portion') return q + ' × ' + ((f && f.portionLabel) || 'portion');
    return q + ' ' + unit;
  }

  /**
   * Un produit Open Food Facts n'a pas de poids « à la pièce ». S'il correspond clairement à un
   * fruit ou légume de la base (même nom, densité calorique proche : l'huile d'avocat ne prend
   * pas le poids d'un avocat), il en reprend le poids moyen par pièce et les mesures de cuisine.
   */
  function inheritUnits(state, f) {
    if (!f || f.isBase || f.unitG || !(f.source === 'off' || f.builtin)) return f;
    const sing = (t) => U.norm(t).replace(/[(),']/g, ' ').split(/\s+/).filter(Boolean).map((w) => w.replace(/s$/, '')).join(' ');
    const name = sing(f.base);
    // Un nom plus précis de la base l'emporte : « pommes de terre » n'est pas une pomme.
    const precise = all(state).filter((b) => b.isBase && sing(b.base).includes(' ') && (' ' + name + ' ').includes(' ' + sing(b.base) + ' '))
      .sort((a, b) => sing(b.base).length - sing(a.base).length)[0];
    if (precise && precise.cat !== 'fruits' && precise.cat !== 'legumes') return f;
    const cands = [];
    all(state).filter((b) => b.isBase && (b.cat === 'fruits' || b.cat === 'legumes') && (b.unitG || b.portionG)).forEach((b) => {
      const full = sing(b.base), key = full.split(' ')[0];
      if (key.length < 4) return;
      const pos = (' ' + name + ' ').indexOf(' ' + key + ' ');
      if (pos < 0) return;
      const ratio = f.kcal / b.kcal;
      if (!(ratio > 0.6 && ratio < 1.6)) return;
      cands.push({ b, pos, included: (' ' + name + ' ').includes(' ' + full + ' '), len: full.length });
    });
    // Mot-clé le plus tôt dans le nom, puis nom complet présent (le plus précis), sinon le plus générique ; pièce avant portion.
    cands.sort((x, y) => x.pos - y.pos || (y.included - x.included) || (x.included ? y.len - x.len : x.len - y.len) || (!!y.b.unitG - !!x.b.unitG));
    const best = cands.length ? cands[0].b : null;
    if (!best) return f;
    return Object.assign({}, f, {
      cat: best.cat, unitG: best.unitG, unitLabel: best.unitLabel, portionG: f.portionG || best.portionG,
      portionLabel: f.portionG ? f.portionLabel : best.portionLabel, unitsFrom: best.base
    });
  }

  const isPiece = (unit) => unit === 'unite' || unit === 'unite_p' || unit === 'unite_g';

  return { SOURCES, CATS, all, byId, displayName, sourceLabel, search, unitsFor, defaultUnit, toBaseQty, compute, qtyLabel, isPiece, inheritUnits, ciqualBuiltin };
})();
