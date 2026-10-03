/**
 * ciqual.js — Import de la table Ciqual (ANSES) depuis un fichier CSV.
 *
 * Mode d'emploi : télécharger la table sur https://ciqual.anses.fr/ (fichier Excel),
 * l'ouvrir dans un tableur puis « Enregistrer sous » CSV (séparateur point-virgule).
 * Les colonnes sont reconnues par leur intitulé (alim_nom_fr, Energie … kcal/100 g, Protéines…).
 *
 * Valeurs Ciqual particulières : « - » = non renseigné, « traces » = 0, « < 0,5 » = moitié du seuil
 * (la valeur est alors marquée approximative).
 */
window.FD = window.FD || {};

FD.ciqual = (function () {
  const U = FD.utils;

  /** Parseur CSV tolérant (guillemets, séparateur ; , ou tabulation). */
  function parseCSV(text) {
    const first = text.split(/\r?\n/, 1)[0] || '';
    const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }

  const COLS = {
    code: [/^alim_code$/],
    name: [/^alim_nom_fr$/],
    group: [/^alim_ssgrp_nom_fr$/, /^alim_grp_nom_fr$/],
    kcal: [/energie.*1169.*kcal/, /energie.*kcal/],
    p: [/proteines.*jones/, /proteines.*6[.,]25/, /^proteines/],
    g: [/^glucides/],
    l: [/^lipides/],
    fib: [/fibres/],
    sug: [/^sucres/],
    salt: [/^sel/]
  };

  function findCols(header) {
    const h = header.map((x) => U.norm(x).trim());
    const idx = {};
    Object.keys(COLS).forEach((k) => {
      for (const re of COLS[k]) {
        const i = h.findIndex((x) => re.test(x));
        if (i >= 0) { idx[k] = i; break; }
      }
    });
    return idx;
  }

  function val(s) {
    const t = String(s || '').trim().toLowerCase();
    if (!t || t === '-') return { v: null };
    if (t.startsWith('traces')) return { v: 0, approx: true };
    const lt = t.match(/^<\s*([\d.,]+)/);
    if (lt) return { v: parseFloat(lt[1].replace(',', '.')) / 2, approx: true };
    const n = parseFloat(t.replace(',', '.'));
    return isNaN(n) ? { v: null } : { v: n };
  }

  function catFromGroup(g, name) {
    const s = U.norm(g + ' ' + name);
    if (/poisson|crustace|mollusque/.test(s)) return 'poissons';
    if (/viande|volaille|charcuterie|abats/.test(s)) return 'viandes';
    if (/lait|fromage|yaourt|oeuf|creme|beurre/.test(s)) return 'laitiers';
    if (/legumineuse|lentille|pois chiche|haricot sec/.test(s)) return 'feculents';
    if (/legume/.test(s)) return 'legumes';
    if (/fruit/.test(s)) return 'fruits';
    if (/pate|riz|cereale|pain|pomme de terre|feculent|semoule/.test(s)) return 'feculents';
    if (/boisson|eau|jus|vin|biere/.test(s)) return 'boissons';
    if (/huile|matiere grasse|sucre|condiment|sauce|epice|noix|amande/.test(s)) return 'epicerie';
    return 'autres';
  }

  function stateFromName(name) {
    const n = U.norm(name);
    if (/\bcru(e|es|s)?\b/.test(n)) return 'cru';
    if (/\bcuit|bouilli|a l'eau|vapeur|grille|roti|poele|frit\b/.test(n)) return 'cuit';
    return null;
  }

  /**
   * Convertit un fichier CSV en aliments internes.
   * @returns {{ foods: object[], skipped: number, missingCols: string[] }}
   */
  function parse(text, versionLabel) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('Fichier vide ou illisible.');
    const idx = findCols(rows[0]);
    const required = ['name', 'kcal', 'p', 'g', 'l'];
    const missingCols = required.filter((k) => idx[k] === undefined);
    if (missingCols.length) throw new Error('Colonnes Ciqual introuvables : ' + missingCols.join(', ') + '. Vérifie que le fichier est bien l\'export Ciqual enregistré en CSV.');
    const label = versionLabel || 'CIQUAL';
    const foods = [];
    let skipped = 0;
    const now = new Date().toISOString();
    rows.slice(1).forEach((r, i) => {
      const name = (r[idx.name] || '').trim();
      const k = val(r[idx.kcal]), p = val(r[idx.p]), g = val(r[idx.g]), l = val(r[idx.l]);
      if (!name || k.v === null || p.v === null || g.v === null || l.v === null) { skipped++; return; }
      const fib = idx.fib !== undefined ? val(r[idx.fib]) : { v: null };
      const sug = idx.sug !== undefined ? val(r[idx.sug]) : { v: null };
      const salt = idx.salt !== undefined ? val(r[idx.salt]) : { v: null };
      const code = idx.code !== undefined ? (r[idx.code] || '').trim() : String(i);
      const group = idx.group !== undefined ? r[idx.group] || '' : '';
      foods.push({
        id: 'ciq-' + code, base: name, brand: null, state: stateFromName(name), cat: catFromGroup(group, name), basis: '100g',
        kcal: k.v, p: p.v, g: g.v, l: l.v, fib: fib.v || 0, sug: sug.v || 0, salt: salt.v || 0,
        source: 'ciqual', ciqualCode: code, ciqualVersion: label, importedAt: now,
        approx: !!(k.approx || p.approx || g.approx || l.approx), missingFiber: fib.v === null
      });
    });
    return { foods, skipped };
  }

  /** Enregistre les aliments Ciqual (remplace un import précédent). */
  function store(state, foods) {
    state.customFoods = (state.customFoods || []).filter((f) => f.source !== 'ciqual').concat(foods);
    state.meta.ciqual = { count: foods.length, version: foods[0] ? foods[0].ciqualVersion : null, importedAt: new Date().toISOString() };
  }

  /** Mots-clés de correspondance pour les aliments de démo au nom ambigu. */
  const MATCH = {
    'poulet-cru': 'poulet filet', 'poulet-cuit': 'poulet filet', 'dinde-crue': 'dinde escalope', 'dinde-cuite': 'dinde escalope',
    'steak5-cru': 'steak hache 5', 'steak5-cuit': 'steak hache 5', 'steak15-cru': 'steak hache 15', 'oeuf': 'oeuf entier',
    'fromage-blanc-0': 'fromage blanc 0', 'pdt-crue': 'pomme de terre', 'pdt-cuite': 'pomme de terre', 'pates-crues': 'pates',
    'pates-cuites': 'pates', 'lentilles-crues': 'lentille', 'lentilles-cuites': 'lentille', 'huile-olive': 'huile olive',
    'noix': 'noix cerneau', 'avoine': 'avoine flocon', 'thon-naturel': 'thon naturel', 'lait-demi': 'lait demi-ecreme'
  };

  /**
   * Propose, pour chaque aliment de démo, l'aliment Ciqual dont l'intitulé contient TOUS ses mots-clés
   * (et le même état cru/cuit quand il est connu). Sans correspondance sûre, rien n'est proposé :
   * l'utilisateur choisit lui-même.
   */
  /** Aliments Ciqual disponibles : import de l'utilisateur s'il existe, sinon table intégrée. */
  function pool(state) {
    const imported = (state.customFoods || []).filter((f) => f.source === 'ciqual');
    return imported.length ? imported : FD.foods.ciqualBuiltin();
  }

  function suggestLinks(state) {
    const ciq = pool(state);
    if (!ciq.length) return [];
    return (window.FD_FOODS || []).map((d) => {
      const words = U.norm(MATCH[d.id] || d.base).replace(/[%(),]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 || /^\d+$/.test(w));
      let best = null, bestScore = -Infinity;
      ciq.forEach((c) => {
        const n = U.norm(c.base);
        if (!words.every((w) => n.includes(w))) return;
        if (d.state && c.state && c.state !== d.state) return;
        let sc = 0;
        if (d.state && c.state === d.state) sc += 1;
        sc -= n.length / 100; // préférer l'intitulé le plus générique
        if (sc > bestScore) { bestScore = sc; best = c; }
      });
      const eff = FD.foods.byId(state, d.id);
      return { demo: d, suggestion: best, effective: eff && eff.source === 'ciqual' ? eff : null, userSet: Object.prototype.hasOwnProperty.call(state.foodLinks || {}, d.id) };
    });
  }

  /** Recherche dans les aliments Ciqual importés (pour une liaison manuelle). */
  function search(state, q, n) {
    const t = U.norm(q).split(/\s+/).filter(Boolean);
    if (!t.length) return [];
    return pool(state).filter((f) => t.every((w) => U.norm(f.base).includes(w))).sort((a, b) => a.base.length - b.base.length).slice(0, n || 20);
  }

  return { parseCSV, parse, store, suggestLinks, search, pool, findCols, catFromGroup, stateFromName };
})();
