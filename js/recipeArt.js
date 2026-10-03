/**
 * recipeArt.js — Illustrations de recettes générées à partir des ingrédients (SVG).
 *
 * Ce ne sont pas des photos : chaque image est dessinée par le code à partir de la recette
 * (catégorie → contenant ; ingrédients → couleurs, couches et garnitures). Elle reste donc
 * cohérente avec ce que contient la recette. Une photo personnelle, si elle existe, la remplace.
 */
window.FD = window.FD || {};

FD.recipeArt = (function () {
  const U = FD.utils;

  /* ---------- Couleurs par ingrédient (mots-clés sur le nom de l'aliment) ---------- */
  const PALETTE = [
    [/myrtille|bleuet/, '#5A3F8C', 'berry'], [/framboise|fraise|fruits rouges|cerise|grenade/, '#D4434F', 'fruit'],
    [/spiruline/, '#2F8FD8', 'blue'], [/patate douce/, '#E98A3C', 'potato'], [/concombre|celeri/, '#B9D58C', 'pale'], [/banane/, '#F2D46B', 'fruit'], [/mangue|abricot|peche|ananas/, '#F5A93B', 'fruit'],
    [/pomme(?! de terre)|kiwi|poire/, '#9CC54A', 'fruit'], [/citron|lime/, '#F2E35C', 'fruit'], [/orange|clementine/, '#F08A2E', 'fruit'],
    [/betterave/, '#9A2650', 'veg'], [/carotte|patate douce|potiron/, '#EC8433', 'veg'], [/tomate|poivron rouge|salsa|sauce tomate|coulis|concentre/, '#D9452F', 'veg'],
    [/avocat/, '#7DA845', 'veg'], [/brocoli|epinard|courgette|concombre|salade|laitue|romaine|haricot vert|celeri|menthe|basilic|persil|coriandre|chou(?!-fleur)|matcha|poivron|petits pois/, '#5E9E45', 'veg'],
    [/chou-fleur|oignon|endive|champignon/, '#E9E0CF', 'veg'],
    [/chocolat blanc|coco/, '#F4ECDD', 'top'], [/chocolat|cacao|brownie/, '#5B3826', 'choco'],
    [/pistache/, '#9DBF5C', 'nut'], [/noix|amande|noisette|cacahuete|pecan|cajou|beurre de cacahuete|granola/, '#B57A45', 'nut'],
    [/avoine|flocon|farine|muesli/, '#D8B98A', 'oat'], [/riz souffle|galette de riz|cereale/, '#E8D2A2', 'oat'],
    [/fromage blanc|skyr|yaourt|cottage|cream cheese|fromage frais|mozzarella|feta|creme/, '#F7F3EC', 'dairy'],
    [/lait/, '#F2EDE4', 'liquid'], [/eau de coco/, '#F4F1E8', 'liquid'], [/jus d'orange/, '#F4A23B', 'liquid'],
    [/riz/, '#FBF8F1', 'grain'], [/pate|penne|spaghetti/, '#EBCB7E', 'pasta'], [/quinoa|semoule|lentille|pois chiche|haricot rouge/, '#D9C08F', 'grain'],
    [/pomme de terre/, '#E9C77A', 'potato'],
    [/poulet|dinde/, '#E0AC72', 'meat'], [/steak|boeuf|viande hachee|chorizo|jambon/, '#7D4636', 'meat'],
    [/saumon/, '#EF8B6A', 'fish'], [/cabillaud|thon|poisson/, '#EDE5D8', 'fish'], [/oeuf/, '#F6C445', 'egg'], [/tofu/, '#EEE3C9', 'meat'],
    [/pain|bun|bagel|tortilla|naan/, '#D29A5B', 'bread'], [/miel|sirop|agave/, '#E2A33B', 'syrup'], [/gingembre|curcuma/, '#E7BE5C', 'spice']
  ];

  const nrm = (t) => U.norm(String(t || '').replace(/œ/g, 'oe').replace(/Œ/g, 'Oe'));

  function classify(food) {
    const n = nrm(food && (food.ciqualName || food.base));
    for (const p of PALETTE) if (p[0].test(n)) return { color: p[1], kind: p[2] };
    return null;
  }

  function rng(seedStr) {
    let s = 0;
    for (let i = 0; i < seedStr.length; i++) s = (s * 31 + seedStr.charCodeAt(i)) % 2147483647;
    s = s || 1;
    return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  }

  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function rgb2hex(r) { return '#' + r.map((x) => Math.round(x).toString(16).padStart(2, '0')).join(''); }
  function mix(colors) {
    const tot = colors.reduce((a, c) => a + c.w, 0);
    if (!tot) return '#E8DCC8';
    const acc = [0, 0, 0];
    colors.forEach((c) => { const r = hex2rgb(c.color); acc[0] += r[0] * c.w; acc[1] += r[1] * c.w; acc[2] += r[2] * c.w; });
    return rgb2hex(acc.map((x) => x / tot));
  }
  function shade(h, k) { return rgb2hex(hex2rgb(h).map((x) => Math.max(0, Math.min(255, x * k)))); }

  /** Ingrédients classés (avec leur poids) d'une recette. */
  function analyse(state, recipe) {
    const items = [];
    recipe.ingredients.forEach((ing) => {
      const f = FD.foods.byId(state, ing.foodId);
      const c = classify(f);
      if (!c) return;
      const g = (f && FD.foods.toBaseQty(f, ing.qty, ing.unit)) || 0;
      items.push(Object.assign({ grams: g, name: f.base }, c));
    });
    const by = (kinds) => items.filter((i) => kinds.includes(i.kind));
    const main = (kinds) => by(kinds).sort((a, b) => b.grams - a.grams)[0] || null;
    return { items, by, main };
  }

  /* ---------- Éléments de dessin ---------- */
  const dots = (rand, n, x0, y0, w, h, color, r) => {
    let s = '';
    for (let i = 0; i < n; i++) s += '<circle cx="' + (x0 + rand() * w).toFixed(1) + '" cy="' + (y0 + rand() * h).toFixed(1) + '" r="' + (r * (0.7 + rand() * 0.6)).toFixed(1) + '" fill="' + color + '"/>';
    return s;
  };
  const cubes = (rand, n, x0, y0, w, h, color, size) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = x0 + rand() * (w - size), y = y0 + rand() * (h - size), a = (rand() * 30 - 15).toFixed(0);
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + size + '" height="' + (size * 0.8).toFixed(1) + '" rx="3" fill="' + color + '" stroke="' + shade(color, 0.8) + '" stroke-width="1" transform="rotate(' + a + ' ' + (x + size / 2).toFixed(1) + ' ' + (y + size / 2).toFixed(1) + ')"/>';
    }
    return s;
  };
  const grains = (rand, n, x0, y0, w, h, color) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = x0 + rand() * w, y = y0 + rand() * h, a = (rand() * 180).toFixed(0);
      s += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="3.2" ry="1.4" fill="' + shade(color, 0.92) + '" transform="rotate(' + a + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"/>';
    }
    return s;
  };
  const drizzle = (x0, y, w, color) => '<path d="M' + x0 + ' ' + y + ' q ' + w / 8 + ' 10 ' + w / 4 + ' 0 t ' + w / 4 + ' 0 t ' + w / 4 + ' 0 t ' + w / 4 + ' 0" fill="none" stroke="' + color + '" stroke-width="4" stroke-linecap="round"/>';

  const BG = { overnight: '#3B3128', petitdej: '#3A3227', prepmeal: '#2E3330', repas: '#33302B', snack: '#382D2A', smoothie: '#2D3135', jus: '#2B3330' };

  function frame(cat, inner) {
    const bg = BG[cat] || '#33302B';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img">' +
      '<defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="' + shade(bg, 1.45) + '"/><stop offset="1" stop-color="' + bg + '"/></radialGradient></defs>' +
      '<rect width="400" height="300" fill="url(#g)"/><ellipse cx="200" cy="268" rx="150" ry="16" fill="#000" opacity=".18"/>' + inner + '</svg>';
  }

  /* ---------- Gabarits par catégorie ---------- */
  function jar(a, rand) {
    const oat = a.main(['oat']) ? '#D8B98A' : '#E8D2A2';
    const blend = a.by(['fruit', 'berry', 'blue', 'choco']).filter((i) => i.grams >= 20 || i.kind === 'blue');
    const base = mix([{ color: oat, w: 3 }].concat(blend.map((b) => ({ color: b.color, w: b.kind === 'choco' ? 2.5 : b.kind === 'blue' ? 6 : b.kind === 'berry' ? 2 : 1 }))));
    const dairy = a.by(['dairy']).length;
    const tops = a.by(['berry', 'fruit', 'nut', 'top']);
    const choco = a.main(['choco']);
    let s = '<rect x="130" y="70" width="140" height="190" rx="22" fill="#FFFFFF" opacity=".12" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="3"/>';
    s += '<rect x="136" y="150" width="128" height="104" rx="16" fill="' + base + '"/>' + grains(rand, 40, 142, 158, 116, 90, shade(base, 0.85));
    if (dairy) s += '<rect x="136" y="104" width="128" height="52" fill="#F7F3EC"/>';
    const topY = dairy ? 104 : 150;
    if (choco && choco.grams <= 60) s += drizzle(146, topY + 4, 108, choco.color);
    tops.slice(0, 3).forEach((t) => { s += dots(rand, t.kind === 'nut' ? 5 : 6, 146, topY - 8, 108, 12, t.color, t.kind === 'nut' ? 4 : 6); });
    s += '<rect x="124" y="58" width="152" height="18" rx="6" fill="#C9A86A"/>';
    return s;
  }

  function glass(a, rand) {
    const W = { fruit: 2.5, berry: 7, blue: 120, choco: 3, dairy: 0.5, liquid: 0.25, nut: 1, oat: 0.6, veg: 1.5, pale: 0.4, spice: 0.2 };
    const parts = a.items.filter((i) => W[i.kind]);
    const color = mix(parts.map((p) => ({ color: p.color, w: W[p.kind] * Math.max(10, p.grams) })));
    const fruit = a.main(['berry', 'fruit']) || a.main(['blue']);
    let s = '<path d="M150 70 L250 70 L238 255 Q200 266 162 255 Z" fill="#FFFFFF" opacity=".12" stroke="#FFF" stroke-opacity=".5" stroke-width="3"/>';
    s += '<path d="M155 100 L245 100 L235 250 Q200 260 165 250 Z" fill="' + color + '"/>';
    s += '<path d="M160 100 L240 100" stroke="' + shade(color, 1.15) + '" stroke-width="6" stroke-linecap="round"/>';
    s += '<line x1="215" y1="40" x2="200" y2="200" stroke="#E9E3D8" stroke-width="7" stroke-linecap="round"/>';
    if (fruit) s += dots(rand, 4, 168, 88, 64, 10, fruit.color, 7);
    return s;
  }

  function bottle(a, rand) {
    const W = { fruit: 2, berry: 6, blue: 120, veg: 1.6, pale: 0.35, liquid: 0.3, spice: 0.2, potato: 1 };
    const parts = a.items.filter((i) => W[i.kind]);
    const color = mix(parts.map((p) => ({ color: p.color, w: W[p.kind] * Math.max(15, p.grams) })));
    let s = '<path d="M180 60 h40 v30 q30 15 30 50 v110 q0 10 -10 10 h-80 q-10 0 -10 -10 v-110 q0 -35 30 -50 z" fill="#FFF" opacity=".12" stroke="#FFF" stroke-opacity=".5" stroke-width="3"/>';
    s += '<path d="M156 150 q0 -20 20 -35 h48 q20 15 20 35 v105 q0 6 -6 6 h-76 q-6 0 -6 -6 z" fill="' + color + '"/>';
    s += '<rect x="176" y="46" width="48" height="18" rx="4" fill="#C9A86A"/>';
    const fruits = a.by(['berry', 'fruit', 'veg', 'blue', 'pale']).sort((x, y) => y.grams - x.grams).slice(0, 2);
    fruits.forEach((f, i) => { const cx = i ? 300 : 100, cy = 236; s += '<circle cx="' + cx + '" cy="' + cy + '" r="28" fill="' + f.color + '"/><circle cx="' + cx + '" cy="' + cy + '" r="20" fill="' + shade(f.color, 1.18) + '"/>' + dots(rand, 5, cx - 12, cy - 12, 24, 24, shade(f.color, 0.8), 2); });
    return s;
  }

  function box(a, rand) {
    const carb = a.main(['grain', 'pasta', 'potato', 'bread']);
    const prot = a.main(['meat', 'fish', 'egg']) || a.main(['dairy']);
    const veg = a.by(['veg', 'pale']).sort((x, y) => y.grams - x.grams).slice(0, 2);
    const sauce = a.main(['syrup']) || a.items.find((i) => /tomate|salsa|coulis/.test(U.norm(i.name)));
    let s = '<rect x="70" y="80" width="260" height="180" rx="22" fill="#F2EEE6" opacity=".95"/><rect x="82" y="92" width="236" height="156" rx="16" fill="#2A2621"/>';
    // compartiment féculent (gauche)
    if (carb) {
      s += '<rect x="90" y="100" width="120" height="140" rx="12" fill="' + carb.color + '"/>';
      if (carb.kind === 'grain') s += grains(rand, 90, 96, 106, 108, 128, carb.color);
      else if (carb.kind === 'pasta') for (let i = 0; i < 14; i++) { const x = 98 + rand() * 96, y = 108 + rand() * 116; s += '<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) + ' q 8 -6 16 0" stroke="' + shade(carb.color, 0.85) + '" stroke-width="5" fill="none" stroke-linecap="round"/>'; }
      else s += cubes(rand, 9, 96, 106, 108, 128, carb.color, 22);
    } else {
      const big = a.by(['veg', 'pale', 'potato']).sort((x, y) => y.grams - x.grams)[0];
      s += '<rect x="90" y="100" width="120" height="140" rx="12" fill="' + shade(big ? big.color : '#5E9E45', 0.75) + '"/>' + (big && big.kind === 'potato' ? cubes(rand, 9, 96, 106, 108, 128, big.color, 22) : dots(rand, 26, 96, 106, 108, 128, big ? big.color : '#6EA84A', 10));
    }
    // protéine (haut droite)
    if (prot) {
      s += '<rect x="216" y="100" width="94" height="72" rx="12" fill="#3A342D"/>';
      s += prot.kind === 'egg' ? '<ellipse cx="248" cy="136" rx="22" ry="17" fill="#FBF7EF"/><circle cx="250" cy="137" r="9" fill="' + prot.color + '"/><ellipse cx="282" cy="140" rx="18" ry="14" fill="#FBF7EF"/><circle cx="283" cy="141" r="7" fill="' + prot.color + '"/>'
        : cubes(rand, 7, 220, 104, 86, 64, prot.color, 20);
      if (sauce) s += drizzle(224, 128, 78, shade(sauce.color, 0.9));
    }
    // légumes (bas droite)
    s += '<rect x="216" y="178" width="94" height="62" rx="12" fill="#3A342D"/>';
    veg.forEach((v, i) => { s += dots(rand, 9, 222 + i * 40, 184, 42, 50, v.color, 7); });
    if (!veg.length) s += dots(rand, 8, 222, 184, 82, 50, '#5E9E45', 6);
    return s;
  }

  function plate(a, rand, recipe) {
    const n = nrm(recipe.name);
    let s = '<ellipse cx="200" cy="200" rx="150" ry="62" fill="#F2EEE6"/><ellipse cx="200" cy="196" rx="120" ry="48" fill="#E6E0D5"/>';
    const fruit = a.main(['berry', 'fruit']), choco = a.main(['choco']);
    if (/pancake|toast/.test(n)) {
      const c = /tiramisu|brownie|choco/.test(n) ? '#B07A4A' : '#D9A766';
      for (let i = 0; i < 4; i++) s += '<ellipse cx="200" cy="' + (200 - i * 16) + '" rx="78" ry="22" fill="' + c + '" stroke="' + shade(c, 0.8) + '" stroke-width="2"/>';
      s += '<ellipse cx="200" cy="142" rx="60" ry="14" fill="' + (/tiramisu/.test(n) ? '#F7F3EC' : '#E2A33B') + '" opacity=".9"/>';
      if (fruit) s += dots(rand, 6, 150, 132, 100, 16, fruit.color, 6);
      if (/tiramisu/.test(n)) s += dots(rand, 40, 150, 134, 100, 16, '#5B3826', 1.2);
    } else if (/cookie|tartelette|coeur/.test(n)) {
      const c = /choco|coeur/.test(n) ? '#6B4430' : '#C99558';
      [[140, 190], [220, 178], [270, 206]].forEach((p) => { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="40" fill="' + c + '" stroke="' + shade(c, 0.8) + '" stroke-width="3"/>' + dots(rand, 6, p[0] - 25, p[1] - 25, 50, 50, choco ? choco.color : '#5B3826', 4); });
    } else if (/bread|cake|pain|banana|brownie/.test(n)) {
      const c = /brownie|choco/.test(n) ? '#6B4430' : /brocoli/.test(n) ? '#8FAE5A' : '#C99558';
      s += '<rect x="110" y="120" width="180" height="90" rx="22" fill="' + c + '" stroke="' + shade(c, 0.8) + '" stroke-width="3"/><path d="M118 132 q82 -34 164 0" fill="' + shade(c, 0.85) + '"/>';
      if (fruit) s += dots(rand, 10, 125, 140, 150, 60, fruit.color, 5);
      if (/pistache/.test(n)) s += dots(rand, 8, 130, 118, 140, 14, '#9DBF5C', 4);
    } else if (/pizza/.test(n)) {
      [[150, 190], [250, 190]].forEach((p) => { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="50" fill="#D9A766"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="42" fill="#D9452F"/>' + dots(rand, 7, p[0] - 30, p[1] - 30, 60, 60, '#F7F3EC', 7) + (/chorizo/.test(a.items.map((i) => U.norm(i.name)).join(' ')) ? dots(rand, 6, p[0] - 30, p[1] - 30, 60, 60, '#9E3B2E', 6) : ''); });
    } else if (/burger|bagel/.test(n)) {
      const prot = a.main(['meat', 'fish']);
      s += '<path d="M120 170 q80 -80 160 0 z" fill="#D29A5B"/>' + dots(rand, 10, 140, 120, 120, 30, '#F4E7C9', 2) +
        '<rect x="118" y="168" width="164" height="12" rx="6" fill="#6EA84A"/><rect x="122" y="180" width="156" height="22" rx="10" fill="' + (prot ? prot.color : '#E0AC72') + '"/>' +
        '<rect x="118" y="202" width="164" height="8" rx="4" fill="#F7F3EC"/><path d="M122 210 h156 q0 22 -78 22 q-78 0 -78 -22 z" fill="#C88A4C"/>';
    } else if (/tartine/.test(n)) {
      s += [[155, 188], [245, 190]].map((p) => '<rect x="' + (p[0] - 50) + '" y="' + (p[1] - 22) + '" width="100" height="44" rx="16" fill="#D29A5B"/><rect x="' + (p[0] - 42) + '" y="' + (p[1] - 16) + '" width="84" height="30" rx="10" fill="#E2A33B" opacity=".85"/>').join('') + '<ellipse cx="200" cy="150" rx="34" ry="14" fill="#F7F3EC"/>';
    } else if (/granola|cereale|cookie dough/.test(n)) {
      s += '<path d="M120 170 q80 70 160 0 z" fill="#F2EEE6" stroke="#D8D0C2" stroke-width="3"/>' + cubes(rand, 18, 132, 150, 136, 30, '#C99558', 14) + (choco ? dots(rand, 8, 140, 150, 120, 24, choco.color, 4) : '');
    } else if (/naan|wrap|tortilla|sandwich/.test(n)) {
      const prot = a.main(['meat', 'fish']);
      [[150, 190, -12], [235, 192, 10]].forEach((p) => { s += '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="62" ry="30" fill="#E2B57A" stroke="#C8924F" stroke-width="2" transform="rotate(' + p[2] + ' ' + p[0] + ' ' + p[1] + ')"/>' + dots(rand, 8, p[0] - 40, p[1] - 16, 80, 30, '#B9803F', 3); });
      if (prot) s += cubes(rand, 6, 200, 160, 70, 30, prot.color, 16) + dots(rand, 6, 200, 160, 70, 30, '#6EA84A', 5);
    } else if (/oeuf|mollet/.test(n)) {
      s += '<ellipse cx="200" cy="196" rx="90" ry="34" fill="#F7F3EC"/>' + [[170, 190], [210, 200], [245, 186]].map((p) => '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="20" ry="15" fill="#FBF7EF" stroke="#E8DFCF"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="8" fill="#F6B830"/>').join('') + drizzle(140, 214, 120, '#C8452E');
    } else if (/creme brulee/.test(n)) {
      s += '<ellipse cx="200" cy="190" rx="80" ry="30" fill="#F2EEE6" stroke="#D8D0C2" stroke-width="4"/><ellipse cx="200" cy="186" rx="66" ry="22" fill="#E3A44A"/>';
    } else {
      const main = a.main(['meat', 'fish', 'egg', 'dairy']) || a.main(['fruit']) || { color: '#D8B98A' };
      s += cubes(rand, 10, 130, 160, 140, 60, main.color, 22);
      a.by(['veg', 'fruit']).slice(0, 2).forEach((v) => { s += dots(rand, 8, 130, 160, 140, 60, v.color, 6); });
    }
    return s;
  }

  /** SVG d'une recette (chaîne). */
  function svg(state, recipe) {
    const cat = FD.recipes.category(recipe);
    const a = analyse(state, recipe);
    const rand = rng(recipe.id || recipe.name);
    let inner;
    if (cat === 'overnight') inner = jar(a, rand);
    else if (cat === 'smoothie') inner = glass(a, rand);
    else if (cat === 'jus') inner = bottle(a, rand);
    else if ((cat === 'prepmeal' || cat === 'repas') && (a.main(['grain', 'pasta', 'potato']) || cat === 'prepmeal') && !/burger|bagel|pizza|oeuf|mollet|naan|tender|wrap|sandwich/.test(nrm(recipe.name))) inner = box(a, rand);
    else if (/bowl|bol |porridge|skyr|fromage blanc/.test(nrm(recipe.name)) && !/oeuf|tartine/.test(nrm(recipe.name)) && a.by(['dairy', 'oat']).length) inner = jar(a, rand);
    else inner = plate(a, rand, recipe);
    return frame(cat, inner);
  }

  return { svg, classify };
})();
