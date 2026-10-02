/**
 * data/foods.js — Base d'aliments de démonstration.
 *
 * IMPORTANT : ces valeurs sont des ordres de grandeur saisis manuellement pour la démo.
 * Elles NE proviennent PAS d'un export Ciqual ou Open Food Facts et sont donc marquées
 * source "demo". Elles doivent être remplacées par les données Ciqual (import prévu)
 * ou par des produits Open Food Facts (recherche intégrée au journal).
 *
 * Chargé comme script classique (et non en JSON via fetch) pour que l'application
 * fonctionne en ouvrant simplement index.html (fetch est bloqué en file://).
 *
 * Champs :
 *  id, base (nom générique), state ('cru' | 'cuit' | null), cat (rayon), basis ('100g' | '100ml'),
 *  kcal, p, g, l, fib, sug, salt  -> valeurs pour 100 g ou 100 ml selon basis
 *  unitG / unitLabel -> poids d'une unité (œuf, fruit, tranche) ; portionG -> portion type
 *  variable -> true si la valeur dépend fortement de la marque / du produit
 *  price -> 'eco' | 'moyen' | 'premium' (utilisé plus tard pour le budget)
 */
window.FD_FOODS = [
  // --- Viandes ---
  { id: 'poulet-cru', base: 'Blanc de poulet', state: 'cru', cat: 'viandes', basis: '100g', kcal: 114, p: 23.8, g: 0, l: 1.8, fib: 0, sug: 0, salt: 0.15, price: 'moyen' },
  { id: 'poulet-cuit', base: 'Blanc de poulet', state: 'cuit', cat: 'viandes', basis: '100g', kcal: 150, p: 30.5, g: 0, l: 3, fib: 0, sug: 0, salt: 0.2, price: 'moyen' },
  { id: 'dinde-crue', base: 'Escalope de dinde', state: 'cru', cat: 'viandes', basis: '100g', kcal: 107, p: 24, g: 0, l: 1.2, fib: 0, sug: 0, salt: 0.15, price: 'eco' },
  { id: 'dinde-cuite', base: 'Escalope de dinde', state: 'cuit', cat: 'viandes', basis: '100g', kcal: 145, p: 31, g: 0, l: 2, fib: 0, sug: 0, salt: 0.2, price: 'eco' },
  { id: 'steak5-cru', base: 'Steak haché 5 % MG', state: 'cru', cat: 'viandes', basis: '100g', kcal: 125, p: 21, g: 0, l: 5, fib: 0, sug: 0, salt: 0.2, unitG: 125, unitLabel: 'steak', price: 'moyen' },
  { id: 'steak5-cuit', base: 'Steak haché 5 % MG', state: 'cuit', cat: 'viandes', basis: '100g', kcal: 165, p: 27.5, g: 0, l: 6, fib: 0, sug: 0, salt: 0.25, price: 'moyen' },
  { id: 'steak15-cru', base: 'Steak haché 15 % MG', state: 'cru', cat: 'viandes', basis: '100g', kcal: 210, p: 18.5, g: 0, l: 15, fib: 0, sug: 0, salt: 0.2, unitG: 125, unitLabel: 'steak', price: 'eco' },
  { id: 'jambon', base: 'Jambon blanc découenné', state: null, cat: 'viandes', basis: '100g', kcal: 110, p: 21, g: 1, l: 2.5, fib: 0, sug: 0.8, salt: 1.9, unitG: 40, unitLabel: 'tranche', variable: true, pork: true, price: 'moyen' },

  // --- Poissons ---
  { id: 'cabillaud-cru', base: 'Cabillaud', state: 'cru', cat: 'poissons', basis: '100g', kcal: 79, p: 18, g: 0, l: 0.7, fib: 0, sug: 0, salt: 0.2, price: 'premium' },
  { id: 'cabillaud-cuit', base: 'Cabillaud', state: 'cuit', cat: 'poissons', basis: '100g', kcal: 105, p: 23.5, g: 0, l: 0.9, fib: 0, sug: 0, salt: 0.3, price: 'premium' },
  { id: 'saumon-cru', base: 'Saumon (pavé)', state: 'cru', cat: 'poissons', basis: '100g', kcal: 200, p: 20, g: 0, l: 13.5, fib: 0, sug: 0, salt: 0.15, variable: true, price: 'premium' },
  { id: 'thon-naturel', base: 'Thon au naturel égoutté', state: null, cat: 'conserves', basis: '100g', kcal: 116, p: 26.5, g: 0, l: 1, fib: 0, sug: 0, salt: 0.9, portionG: 112, price: 'eco' },

  // --- Œufs, laitiers ---
  { id: 'oeuf', base: 'Œuf entier', state: null, cat: 'laitiers', basis: '100g', kcal: 143, p: 12.6, g: 0.7, l: 9.9, fib: 0, sug: 0.4, salt: 0.35, unitG: 50, unitLabel: 'œuf moyen', price: 'eco' },
  { id: 'skyr', base: 'Skyr nature', state: null, cat: 'laitiers', basis: '100g', kcal: 60, p: 10.5, g: 3.9, l: 0.2, fib: 0, sug: 3.9, salt: 0.1, variable: true, price: 'moyen' },
  { id: 'fromage-blanc-0', base: 'Fromage blanc 0 %', state: null, cat: 'laitiers', basis: '100g', kcal: 46, p: 7.5, g: 3.8, l: 0.2, fib: 0, sug: 3.8, salt: 0.1, variable: true, price: 'eco' },
  { id: 'yaourt-grec', base: 'Yaourt à la grecque nature', state: null, cat: 'laitiers', basis: '100g', kcal: 118, p: 4.2, g: 4.5, l: 9, fib: 0, sug: 4.5, salt: 0.1, unitG: 150, unitLabel: 'pot', variable: true, price: 'moyen' },
  { id: 'lait-demi', base: 'Lait demi-écrémé', state: null, cat: 'laitiers', basis: '100ml', kcal: 46, p: 3.3, g: 4.8, l: 1.6, fib: 0, sug: 4.8, salt: 0.1, price: 'eco' },
  { id: 'emmental', base: 'Emmental', state: null, cat: 'laitiers', basis: '100g', kcal: 380, p: 28.5, g: 0, l: 29.5, fib: 0, sug: 0, salt: 0.7, unitG: 20, unitLabel: 'tranche', price: 'moyen' },
  { id: 'beurre', base: 'Beurre doux', state: null, cat: 'laitiers', basis: '100g', kcal: 745, p: 0.7, g: 0.7, l: 82, fib: 0, sug: 0.7, salt: 0.05, price: 'moyen' },
  { id: 'whey', base: 'Whey protéine (poudre)', state: null, cat: 'epicerie', basis: '100g', kcal: 380, p: 78, g: 6, l: 6, fib: 0, sug: 4, salt: 0.5, portionG: 30, variable: true, price: 'premium' },

  // --- Féculents ---
  { id: 'riz-cru', base: 'Riz blanc', state: 'cru', cat: 'feculents', basis: '100g', kcal: 354, p: 7.2, g: 78.5, l: 0.7, fib: 1.4, sug: 0.2, salt: 0, price: 'eco' },
  { id: 'riz-cuit', base: 'Riz blanc', state: 'cuit', cat: 'feculents', basis: '100g', kcal: 130, p: 2.7, g: 28.5, l: 0.3, fib: 0.5, sug: 0.1, salt: 0, price: 'eco' },
  { id: 'pates-crues', base: 'Pâtes', state: 'cru', cat: 'feculents', basis: '100g', kcal: 357, p: 12.5, g: 70, l: 1.5, fib: 3, sug: 3, salt: 0, price: 'eco' },
  { id: 'pates-cuites', base: 'Pâtes', state: 'cuit', cat: 'feculents', basis: '100g', kcal: 131, p: 4.6, g: 26, l: 0.6, fib: 1.7, sug: 0.6, salt: 0, price: 'eco' },
  { id: 'pdt-crue', base: 'Pomme de terre', state: 'cru', cat: 'feculents', basis: '100g', kcal: 81, p: 2, g: 16.5, l: 0.1, fib: 2, sug: 0.7, salt: 0, price: 'eco' },
  { id: 'pdt-cuite', base: 'Pomme de terre', state: 'cuit', cat: 'feculents', basis: '100g', kcal: 80, p: 2, g: 17, l: 0.1, fib: 1.8, sug: 0.7, salt: 0, price: 'eco' },
  { id: 'patate-douce-cuite', base: 'Patate douce', state: 'cuit', cat: 'feculents', basis: '100g', kcal: 90, p: 2, g: 17.5, l: 0.2, fib: 3, sug: 6.5, salt: 0.1, price: 'moyen' },
  { id: 'semoule-crue', base: 'Semoule', state: 'cru', cat: 'feculents', basis: '100g', kcal: 360, p: 12.5, g: 72, l: 1.2, fib: 3.5, sug: 1, salt: 0, price: 'eco' },
  { id: 'semoule-cuite', base: 'Semoule', state: 'cuit', cat: 'feculents', basis: '100g', kcal: 112, p: 3.8, g: 23, l: 0.2, fib: 1.2, sug: 0.2, salt: 0, price: 'eco' },
  { id: 'quinoa-cru', base: 'Quinoa', state: 'cru', cat: 'feculents', basis: '100g', kcal: 368, p: 14, g: 57, l: 6, fib: 7, sug: 1, salt: 0, price: 'premium' },
  { id: 'quinoa-cuit', base: 'Quinoa', state: 'cuit', cat: 'feculents', basis: '100g', kcal: 120, p: 4.4, g: 19, l: 1.9, fib: 2.8, sug: 0.5, salt: 0, price: 'premium' },
  { id: 'lentilles-crues', base: 'Lentilles vertes', state: 'cru', cat: 'feculents', basis: '100g', kcal: 318, p: 24, g: 46, l: 1.5, fib: 17, sug: 1.5, salt: 0, price: 'eco' },
  { id: 'lentilles-cuites', base: 'Lentilles vertes', state: 'cuit', cat: 'feculents', basis: '100g', kcal: 115, p: 9, g: 16.5, l: 0.6, fib: 7.9, sug: 0.5, salt: 0, price: 'eco' },
  { id: 'pois-chiches', base: 'Pois chiches égouttés', state: null, cat: 'conserves', basis: '100g', kcal: 140, p: 7.5, g: 18, l: 2.5, fib: 6, sug: 1, salt: 0.6, price: 'eco' },
  { id: 'avoine', base: "Flocons d'avoine", state: null, cat: 'feculents', basis: '100g', kcal: 372, p: 13.5, g: 58.7, l: 7, fib: 10, sug: 1, salt: 0, price: 'eco' },
  { id: 'creme-riz', base: 'Crème de riz', state: null, cat: 'feculents', basis: '100g', kcal: 370, p: 7, g: 80.5, l: 1, fib: 1.5, sug: 0.5, salt: 0, variable: true, price: 'moyen' },
  { id: 'pain-mie-complet', base: 'Pain de mie complet', state: null, cat: 'feculents', basis: '100g', kcal: 250, p: 9, g: 41, l: 4, fib: 6, sug: 5, salt: 1.1, unitG: 28, unitLabel: 'tranche', variable: true, price: 'eco' },
  { id: 'baguette', base: 'Baguette', state: null, cat: 'feculents', basis: '100g', kcal: 270, p: 9, g: 55, l: 1.2, fib: 2.7, sug: 2, salt: 1.4, price: 'eco' },
  { id: 'tofu', base: 'Tofu nature ferme', state: null, cat: 'autres', basis: '100g', kcal: 130, p: 13, g: 1.5, l: 7.5, fib: 1, sug: 0.5, salt: 0, variable: true, price: 'moyen' },

  // --- Légumes ---
  { id: 'legumes-mix', base: 'Légumes (mélange)', state: 'cuit', cat: 'legumes', basis: '100g', kcal: 35, p: 1.8, g: 5, l: 0.3, fib: 3, sug: 3, salt: 0.05, variable: true, price: 'eco' },
  { id: 'brocoli-cuit', base: 'Brocoli', state: 'cuit', cat: 'legumes', basis: '100g', kcal: 30, p: 2.5, g: 3, l: 0.4, fib: 2.6, sug: 1.5, salt: 0.05, price: 'eco' },
  { id: 'haricots-verts', base: 'Haricots verts', state: 'cuit', cat: 'legumes', basis: '100g', kcal: 30, p: 1.8, g: 3.8, l: 0.2, fib: 3.2, sug: 1.5, salt: 0.05, price: 'eco' },
  { id: 'courgette-cuite', base: 'Courgette', state: 'cuit', cat: 'legumes', basis: '100g', kcal: 18, p: 1, g: 2.3, l: 0.2, fib: 1.2, sug: 1.8, salt: 0, price: 'eco' },
  { id: 'epinards-cuits', base: 'Épinards', state: 'cuit', cat: 'legumes', basis: '100g', kcal: 24, p: 3, g: 1.3, l: 0.5, fib: 2.5, sug: 0.4, salt: 0.15, price: 'eco' },
  { id: 'tomate', base: 'Tomate', state: 'cru', cat: 'legumes', basis: '100g', kcal: 19, p: 0.9, g: 3, l: 0.3, fib: 1.2, sug: 2.6, salt: 0, unitG: 120, unitLabel: 'tomate', price: 'eco' },
  { id: 'carotte', base: 'Carotte', state: 'cru', cat: 'legumes', basis: '100g', kcal: 36, p: 0.8, g: 7.5, l: 0.3, fib: 2.7, sug: 5, salt: 0.1, unitG: 100, unitLabel: 'carotte', price: 'eco' },
  { id: 'salade', base: 'Salade verte', state: 'cru', cat: 'legumes', basis: '100g', kcal: 15, p: 1.2, g: 1.5, l: 0.2, fib: 1.3, sug: 1, salt: 0, price: 'eco' },

  // --- Fruits ---
  { id: 'banane', base: 'Banane', state: null, cat: 'fruits', basis: '100g', kcal: 90, p: 1.1, g: 20, l: 0.3, fib: 2.7, sug: 15, salt: 0, unitG: 120, unitLabel: 'banane (sans peau)', price: 'eco' },
  { id: 'pomme', base: 'Pomme', state: null, cat: 'fruits', basis: '100g', kcal: 53, p: 0.3, g: 11.5, l: 0.2, fib: 2.4, sug: 10, salt: 0, unitG: 150, unitLabel: 'pomme', price: 'eco' },
  { id: 'orange', base: 'Orange', state: null, cat: 'fruits', basis: '100g', kcal: 47, p: 0.9, g: 9, l: 0.2, fib: 2.2, sug: 8.5, salt: 0, unitG: 150, unitLabel: 'orange (sans peau)', price: 'eco' },
  { id: 'kiwi', base: 'Kiwi', state: null, cat: 'fruits', basis: '100g', kcal: 60, p: 1.1, g: 11, l: 0.6, fib: 3, sug: 9, salt: 0, unitG: 75, unitLabel: 'kiwi', price: 'eco' },
  { id: 'fruits-rouges', base: 'Fruits rouges (mélange)', state: null, cat: 'fruits', basis: '100g', kcal: 45, p: 1, g: 8, l: 0.4, fib: 4, sug: 6, salt: 0, variable: true, price: 'moyen' },

  // --- Matières grasses, oléagineux, épicerie ---
  { id: 'huile-olive', base: "Huile d'olive", state: null, cat: 'epicerie', basis: '100g', kcal: 900, p: 0, g: 0, l: 100, fib: 0, sug: 0, salt: 0, price: 'moyen' },
  { id: 'noix', base: 'Noix (cerneaux)', state: null, cat: 'epicerie', basis: '100g', kcal: 690, p: 15, g: 7, l: 65.5, fib: 6.7, sug: 2.6, salt: 0, price: 'premium' },
  { id: 'amandes', base: 'Amandes', state: null, cat: 'epicerie', basis: '100g', kcal: 620, p: 25, g: 6, l: 52, fib: 12, sug: 4, salt: 0, price: 'premium' },
  { id: 'beurre-cacahuete', base: 'Beurre de cacahuète', state: null, cat: 'epicerie', basis: '100g', kcal: 620, p: 25, g: 14, l: 50, fib: 6, sug: 6, salt: 0.5, variable: true, price: 'moyen' },
  { id: 'moutarde', base: 'Moutarde', state: null, cat: 'epicerie', basis: '100g', kcal: 150, p: 7, g: 5, l: 11, fib: 3, sug: 2, salt: 6, variable: true, price: 'eco' },
  { id: 'miel', base: 'Miel', state: null, cat: 'epicerie', basis: '100g', kcal: 320, p: 0.4, g: 80, l: 0, fib: 0, sug: 80, salt: 0, price: 'moyen' },
  { id: 'chocolat-noir', base: 'Chocolat noir 70 %', state: null, cat: 'epicerie', basis: '100g', kcal: 580, p: 8, g: 33, l: 42, fib: 11, sug: 28, salt: 0, unitG: 10, unitLabel: 'carré', variable: true, price: 'moyen' },

  // --- Boissons (les kcal incluent l'alcool, non couvert par les macros) ---
  { id: 'biere', base: 'Bière blonde 5 %', state: null, cat: 'boissons', basis: '100ml', kcal: 42, p: 0.4, g: 3.3, l: 0, fib: 0, sug: 0.2, salt: 0, portionG: 250, alcohol: true, variable: true, price: 'moyen' },
  { id: 'vin-rouge', base: 'Vin rouge', state: null, cat: 'boissons', basis: '100ml', kcal: 85, p: 0.1, g: 2.6, l: 0, fib: 0, sug: 0.6, salt: 0, portionG: 125, alcohol: true, variable: true, price: 'moyen' },  // --- Ajouts livraison 2 (recettes) ---
  { id: 'oignon', base: 'Oignon', state: 'cru', cat: 'legumes', basis: '100g', kcal: 40, p: 1.2, g: 7.5, l: 0.2, fib: 1.8, sug: 5, salt: 0, unitG: 100, unitLabel: 'oignon', price: 'eco' },
  { id: 'poivron', base: 'Poivron', state: 'cru', cat: 'legumes', basis: '100g', kcal: 30, p: 1, g: 5, l: 0.3, fib: 1.8, sug: 4, salt: 0, unitG: 150, unitLabel: 'poivron', price: 'eco' },
  { id: 'champignons', base: 'Champignons de Paris', state: 'cru', cat: 'legumes', basis: '100g', kcal: 25, p: 3, g: 0.5, l: 0.3, fib: 1.5, sug: 0.2, salt: 0, price: 'eco' },
  { id: 'coulis-tomate', base: 'Coulis de tomate', state: null, cat: 'conserves', basis: '100g', kcal: 35, p: 1.5, g: 5.5, l: 0.2, fib: 1.5, sug: 4.5, salt: 0.5, variable: true, price: 'eco' },
  { id: 'haricots-rouges', base: 'Haricots rouges égouttés', state: null, cat: 'conserves', basis: '100g', kcal: 115, p: 8, g: 14, l: 0.5, fib: 7, sug: 0.5, salt: 0.6, price: 'eco' },
  { id: 'parmesan', base: 'Parmesan', state: null, cat: 'laitiers', basis: '100g', kcal: 390, p: 33, g: 0, l: 28, fib: 0, sug: 0, salt: 1.6, price: 'premium' },
  { id: 'citron', base: 'Citron', state: null, cat: 'fruits', basis: '100g', kcal: 30, p: 0.8, g: 3, l: 0.3, fib: 2, sug: 2.5, salt: 0, unitG: 60, unitLabel: 'citron (jus)', price: 'eco' },
  { id: 'tortilla', base: 'Tortilla de blé', state: null, cat: 'feculents', basis: '100g', kcal: 300, p: 8, g: 50, l: 7, fib: 3, sug: 3, salt: 1.2, unitG: 60, unitLabel: 'tortilla', variable: true, price: 'moyen' },
  { id: 'sauce-soja', base: 'Sauce soja', state: null, cat: 'epicerie', basis: '100ml', kcal: 60, p: 8, g: 5, l: 0, fib: 0, sug: 1, salt: 14, variable: true, price: 'moyen' }
];

/**
 * Repas types de l'utilisateur (modifiables plus tard dans l'app).
 * Ce sont des raccourcis d'ajout : les macros sont recalculées à partir des aliments.
 */
window.FD_DEFAULT_TEMPLATES = [
  { id: 'tpl-pdj', name: 'Petit-déj type', meal: 'petitdej', items: [{ foodId: 'skyr', qty: 200, unit: 'g' }, { foodId: 'noix', qty: 30, unit: 'g' }, { foodId: 'creme-riz', qty: 40, unit: 'g' }] },
  { id: 'tpl-dej', name: 'Déjeuner poulet-riz', meal: 'dejeuner', items: [{ foodId: 'poulet-cru', qty: 150, unit: 'g' }, { foodId: 'riz-cuit', qty: 290, unit: 'g' }, { foodId: 'legumes-mix', qty: 150, unit: 'g' }, { foodId: 'huile-olive', qty: 10, unit: 'g' }] },
  { id: 'tpl-din', name: 'Dîner œufs-steak', meal: 'diner', items: [{ foodId: 'oeuf', qty: 3, unit: 'unite' }, { foodId: 'steak5-cru', qty: 160, unit: 'g' }, { foodId: 'legumes-mix', qty: 250, unit: 'g' }, { foodId: 'beurre', qty: 10, unit: 'g' }] },
  { id: 'tpl-fruits', name: '2 fruits', meal: 'collation', items: [{ foodId: 'banane', qty: 1, unit: 'unite' }, { foodId: 'pomme', qty: 1, unit: 'unite' }] }
];
