/**
 * data/recipes.js — Recettes de démonstration créées pour l'application.
 *
 * Aucune valeur nutritionnelle n'est saisie ici : les macros sont TOUJOURS calculées
 * à partir des ingrédients (js/recipes.js), puis divisées par le nombre de portions.
 *
 * role : rôle de l'ingrédient pour l'ajustement des portions
 *   prot = source de protéines, carb = féculent/fruit, fat = matière grasse,
 *   veg = légumes (non ajustés), other = assaisonnement (non ajusté)
 * meals : repas où la recette est proposée (petitdej, dejeuner, collation, diner)
 */
window.FD_RECIPES = [
  { id: 'r-skyr-bowl', name: 'Bol skyr, noix et crème de riz', meals: ['petitdej'], servings: 1, prep: 3, cook: 3, difficulty: 'facile', tags: ['pre-seance'],
    ingredients: [{ foodId: 'skyr', qty: 200, unit: 'g', role: 'prot' }, { foodId: 'creme-riz', qty: 40, unit: 'g', role: 'carb' }, { foodId: 'noix', qty: 30, unit: 'g', role: 'fat' }],
    steps: ['Cuire la crème de riz 2 à 3 minutes dans un peu d\'eau en remuant.', 'Laisser tiédir, ajouter le skyr et mélanger.', 'Parsemer de noix concassées.'] },
  { id: 'r-porridge', name: 'Porridge avoine, whey et banane', meals: ['petitdej'], servings: 1, prep: 3, cook: 4, difficulty: 'facile', tags: ['pre-seance'],
    ingredients: [{ foodId: 'avoine', qty: 60, unit: 'g', role: 'carb' }, { foodId: 'lait-demi', qty: 200, unit: 'ml', role: 'other' }, { foodId: 'whey', qty: 30, unit: 'g', role: 'prot' }, { foodId: 'banane', qty: 1, unit: 'unite', role: 'carb' }],
    steps: ['Chauffer les flocons avec le lait 3 à 4 minutes.', 'Hors du feu, incorporer la whey (elle grumelle si elle cuit).', 'Ajouter la banane en rondelles.'] },
  { id: 'r-omelette', name: 'Omelette jambon-emmental et tartines', meals: ['petitdej', 'diner'], servings: 1, prep: 5, cook: 6, difficulty: 'facile', tags: [],
    ingredients: [{ foodId: 'oeuf', qty: 3, unit: 'unite', role: 'prot' }, { foodId: 'jambon', qty: 1, unit: 'unite', role: 'prot' }, { foodId: 'emmental', qty: 20, unit: 'g', role: 'fat' }, { foodId: 'pain-mie-complet', qty: 2, unit: 'unite', role: 'carb' }, { foodId: 'tomate', qty: 1, unit: 'unite', role: 'veg' }],
    steps: ['Battre les œufs, ajouter le jambon coupé et l\'emmental.', 'Cuire à feu moyen dans une poêle antiadhésive.', 'Servir avec le pain grillé et la tomate.'] },
  { id: 'r-fromage-blanc', name: 'Fromage blanc, fruits rouges et amandes', meals: ['petitdej', 'collation'], servings: 1, prep: 3, cook: 0, difficulty: 'facile', tags: [],
    ingredients: [{ foodId: 'fromage-blanc-0', qty: 250, unit: 'g', role: 'prot' }, { foodId: 'fruits-rouges', qty: 125, unit: 'g', role: 'carb' }, { foodId: 'amandes', qty: 15, unit: 'g', role: 'fat' }, { foodId: 'miel', qty: 10, unit: 'g', role: 'other' }],
    steps: ['Verser le fromage blanc dans un bol.', 'Ajouter les fruits rouges, les amandes et le miel.'] },
  { id: 'r-poulet-riz', name: 'Poulet, riz et légumes', meals: ['dejeuner', 'diner'], servings: 1, prep: 5, cook: 15, difficulty: 'facile', tags: ['post-seance'],
    ingredients: [{ foodId: 'poulet-cru', qty: 150, unit: 'g', role: 'prot' }, { foodId: 'riz-cru', qty: 100, unit: 'g', role: 'carb' }, { foodId: 'legumes-mix', qty: 150, unit: 'g', role: 'veg' }, { foodId: 'huile-olive', qty: 10, unit: 'g', role: 'fat' }],
    steps: ['Cuire le riz (environ 2,5 à 3 fois son poids une fois cuit).', 'Saisir le poulet en morceaux avec l\'huile, 8 à 10 minutes.', 'Ajouter les légumes en fin de cuisson.'] },
  { id: 'r-dinde-pates', name: 'Pâtes à la dinde, sauce tomate', meals: ['dejeuner', 'diner'], servings: 1, prep: 5, cook: 12, difficulty: 'facile', tags: ['post-seance'],
    ingredients: [{ foodId: 'dinde-crue', qty: 150, unit: 'g', role: 'prot' }, { foodId: 'pates-crues', qty: 90, unit: 'g', role: 'carb' }, { foodId: 'coulis-tomate', qty: 150, unit: 'g', role: 'veg' }, { foodId: 'oignon', qty: 50, unit: 'g', role: 'veg' }, { foodId: 'huile-olive', qty: 8, unit: 'g', role: 'fat' }, { foodId: 'parmesan', qty: 10, unit: 'g', role: 'other' }],
    steps: ['Cuire les pâtes.', 'Faire revenir l\'oignon et la dinde en dés dans l\'huile.', 'Ajouter le coulis, mijoter 5 minutes, servir avec le parmesan.'] },
  { id: 'r-steak-pdt', name: 'Steak 5 %, pommes de terre et haricots verts', meals: ['dejeuner', 'diner'], servings: 1, prep: 5, cook: 20, difficulty: 'facile', tags: [],
    ingredients: [{ foodId: 'steak5-cru', qty: 150, unit: 'g', role: 'prot' }, { foodId: 'pdt-crue', qty: 350, unit: 'g', role: 'carb' }, { foodId: 'haricots-verts', qty: 200, unit: 'g', role: 'veg' }, { foodId: 'beurre', qty: 10, unit: 'g', role: 'fat' }],
    steps: ['Cuire les pommes de terre à l\'eau ou à la vapeur, 15 à 20 minutes.', 'Cuire le steak à la poêle.', 'Servir avec les haricots verts et une noisette de beurre.'] },
  { id: 'r-oeufs-steak', name: 'Œufs, steak 5 % et légumes', meals: ['diner'], servings: 1, prep: 5, cook: 10, difficulty: 'facile', tags: [],
    ingredients: [{ foodId: 'oeuf', qty: 3, unit: 'unite', role: 'prot' }, { foodId: 'steak5-cru', qty: 160, unit: 'g', role: 'prot' }, { foodId: 'legumes-mix', qty: 250, unit: 'g', role: 'veg' }, { foodId: 'beurre', qty: 10, unit: 'g', role: 'fat' }],
    steps: ['Cuire les légumes à la poêle ou à la vapeur.', 'Cuire le steak puis les œufs au plat avec le beurre.'] },
  { id: 'r-saumon-pd', name: 'Saumon, patate douce et brocoli', meals: ['dejeuner', 'diner'], servings: 1, prep: 5, cook: 25, difficulty: 'facile', tags: ['four'],
    ingredients: [{ foodId: 'saumon-cru', qty: 130, unit: 'g', role: 'prot' }, { foodId: 'patate-douce-cuite', qty: 250, unit: 'g', role: 'carb' }, { foodId: 'brocoli-cuit', qty: 200, unit: 'g', role: 'veg' }, { foodId: 'citron', qty: 1, unit: 'unite', role: 'other' }],
    steps: ['Rôtir la patate douce en cubes au four à 200 °C, 25 minutes.', 'Ajouter le saumon les 12 dernières minutes.', 'Servir avec le brocoli vapeur et le jus de citron.'] },
  { id: 'r-cabillaud-riz', name: 'Cabillaud, riz et courgettes', meals: ['dejeuner', 'diner'], servings: 1, prep: 5, cook: 15, difficulty: 'facile', tags: [],
    ingredients: [{ foodId: 'cabillaud-cru', qty: 180, unit: 'g', role: 'prot' }, { foodId: 'riz-cru', qty: 80, unit: 'g', role: 'carb' }, { foodId: 'courgette-cuite', qty: 200, unit: 'g', role: 'veg' }, { foodId: 'huile-olive', qty: 10, unit: 'g', role: 'fat' }, { foodId: 'citron', qty: 1, unit: 'unite', role: 'other' }],
    steps: ['Cuire le riz.', 'Poêler les courgettes avec la moitié de l\'huile.', 'Cuire le cabillaud à feu doux 4 minutes par face, arroser de citron.'] },
  { id: 'r-taboule-thon', name: 'Taboulé au thon', meals: ['dejeuner'], servings: 1, prep: 10, cook: 0, difficulty: 'facile', tags: ['froid'],
    ingredients: [{ foodId: 'semoule-crue', qty: 70, unit: 'g', role: 'carb' }, { foodId: 'thon-naturel', qty: 1, unit: 'portion', role: 'prot' }, { foodId: 'tomate', qty: 1, unit: 'unite', role: 'veg' }, { foodId: 'poivron', qty: 80, unit: 'g', role: 'veg' }, { foodId: 'huile-olive', qty: 10, unit: 'g', role: 'fat' }, { foodId: 'citron', qty: 1, unit: 'unite', role: 'other' }],
    steps: ['Réhydrater la semoule avec le même volume d\'eau bouillante, 5 minutes.', 'Égrainer, ajouter tomate et poivron en dés, le thon émietté.', 'Assaisonner avec l\'huile et le citron.'] },
  { id: 'r-chili', name: 'Chili de bœuf 5 % aux haricots rouges', meals: ['dejeuner', 'diner'], servings: 4, prep: 15, cook: 35, difficulty: 'moyen', tags: ['batch'],
    ingredients: [{ foodId: 'steak5-cru', qty: 500, unit: 'g', role: 'prot' }, { foodId: 'haricots-rouges', qty: 400, unit: 'g', role: 'carb' }, { foodId: 'riz-cru', qty: 280, unit: 'g', role: 'carb' }, { foodId: 'coulis-tomate', qty: 400, unit: 'g', role: 'veg' }, { foodId: 'oignon', qty: 150, unit: 'g', role: 'veg' }, { foodId: 'poivron', qty: 200, unit: 'g', role: 'veg' }, { foodId: 'huile-olive', qty: 15, unit: 'g', role: 'fat' }],
    steps: ['Faire revenir oignon et poivron dans l\'huile.', 'Ajouter la viande hachée, la colorer.', 'Ajouter coulis, haricots et épices (cumin, paprika), mijoter 25 minutes.', 'Servir avec le riz. Se conserve 3 jours au frais.'] },
  { id: 'r-lentilles-poulet', name: 'Lentilles, poulet et carottes', meals: ['dejeuner', 'diner'], servings: 1, prep: 10, cook: 25, difficulty: 'facile', tags: [],
    ingredients: [{ foodId: 'poulet-cru', qty: 130, unit: 'g', role: 'prot' }, { foodId: 'lentilles-crues', qty: 70, unit: 'g', role: 'carb' }, { foodId: 'carotte', qty: 150, unit: 'g', role: 'veg' }, { foodId: 'oignon', qty: 50, unit: 'g', role: 'veg' }, { foodId: 'huile-olive', qty: 8, unit: 'g', role: 'fat' }],
    steps: ['Cuire les lentilles 20 à 25 minutes avec les carottes en rondelles et l\'oignon.', 'Poêler le poulet avec l\'huile.', 'Mélanger et assaisonner.'] },
  { id: 'r-wrap-poulet', name: 'Wraps poulet-crudités', meals: ['dejeuner'], servings: 1, prep: 10, cook: 0, difficulty: 'facile', tags: ['froid', 'rapide'],
    ingredients: [{ foodId: 'tortilla', qty: 2, unit: 'unite', role: 'carb' }, { foodId: 'poulet-cuit', qty: 120, unit: 'g', role: 'prot' }, { foodId: 'salade', qty: 40, unit: 'g', role: 'veg' }, { foodId: 'tomate', qty: 1, unit: 'unite', role: 'veg' }, { foodId: 'fromage-blanc-0', qty: 50, unit: 'g', role: 'other' }, { foodId: 'moutarde', qty: 10, unit: 'g', role: 'other' }],
    steps: ['Mélanger fromage blanc et moutarde pour la sauce.', 'Garnir les tortillas de poulet, salade, tomate et sauce.', 'Rouler serré.'] },
  { id: 'r-sandwich', name: 'Sandwich poulet-emmental', meals: ['dejeuner'], servings: 1, prep: 5, cook: 0, difficulty: 'facile', tags: ['froid', 'rapide'],
    ingredients: [{ foodId: 'pain-mie-complet', qty: 4, unit: 'unite', role: 'carb' }, { foodId: 'poulet-cuit', qty: 120, unit: 'g', role: 'prot' }, { foodId: 'emmental', qty: 20, unit: 'g', role: 'fat' }, { foodId: 'moutarde', qty: 10, unit: 'g', role: 'other' }],
    steps: ['Tartiner la moutarde.', 'Garnir de poulet et d\'emmental.'] },
  { id: 'r-tofu-riz', name: 'Tofu sauté, riz et légumes', meals: ['dejeuner', 'diner'], servings: 1, prep: 10, cook: 15, difficulty: 'facile', tags: ['vegetarien'],
    ingredients: [{ foodId: 'tofu', qty: 200, unit: 'g', role: 'prot' }, { foodId: 'riz-cru', qty: 75, unit: 'g', role: 'carb' }, { foodId: 'legumes-mix', qty: 200, unit: 'g', role: 'veg' }, { foodId: 'sauce-soja', qty: 15, unit: 'ml', role: 'other' }, { foodId: 'huile-olive', qty: 10, unit: 'g', role: 'fat' }],
    steps: ['Cuire le riz.', 'Faire dorer le tofu en cubes dans l\'huile.', 'Ajouter les légumes et la sauce soja, sauter 5 minutes.'] },
  { id: 'r-salade-pois-chiches', name: 'Salade pois chiches et œufs durs', meals: ['dejeuner'], servings: 1, prep: 10, cook: 10, difficulty: 'facile', tags: ['vegetarien', 'froid'],
    ingredients: [{ foodId: 'pois-chiches', qty: 200, unit: 'g', role: 'carb' }, { foodId: 'oeuf', qty: 3, unit: 'unite', role: 'prot' }, { foodId: 'tomate', qty: 1, unit: 'unite', role: 'veg' }, { foodId: 'salade', qty: 50, unit: 'g', role: 'veg' }, { foodId: 'huile-olive', qty: 10, unit: 'g', role: 'fat' }],
    steps: ['Cuire les œufs 9 minutes, les écaler.', 'Mélanger pois chiches, tomate, salade, œufs en quartiers.', 'Assaisonner avec l\'huile.'] },
  { id: 'r-pates-thon', name: 'Pâtes au thon et à la tomate', meals: ['dejeuner', 'diner'], servings: 1, prep: 5, cook: 12, difficulty: 'facile', tags: ['rapide'],
    ingredients: [{ foodId: 'pates-crues', qty: 90, unit: 'g', role: 'carb' }, { foodId: 'thon-naturel', qty: 1, unit: 'portion', role: 'prot' }, { foodId: 'coulis-tomate', qty: 150, unit: 'g', role: 'veg' }, { foodId: 'oignon', qty: 40, unit: 'g', role: 'veg' }, { foodId: 'parmesan', qty: 10, unit: 'g', role: 'fat' }],
    steps: ['Cuire les pâtes.', 'Chauffer coulis et oignon émincé, ajouter le thon.', 'Mélanger, parsemer de parmesan.'] },
  { id: 'r-dinde-pdt-rotie', name: 'Dinde et pommes de terre rôties', meals: ['dejeuner', 'diner'], servings: 1, prep: 10, cook: 25, difficulty: 'facile', tags: ['four', 'air-fryer'],
    ingredients: [{ foodId: 'dinde-crue', qty: 160, unit: 'g', role: 'prot' }, { foodId: 'pdt-crue', qty: 350, unit: 'g', role: 'carb' }, { foodId: 'haricots-verts', qty: 150, unit: 'g', role: 'veg' }, { foodId: 'huile-olive', qty: 10, unit: 'g', role: 'fat' }],
    steps: ['Couper les pommes de terre en quartiers, enrober d\'huile.', 'Cuire 20 à 25 minutes à 200 °C (four ou air fryer).', 'Cuire la dinde à la poêle, servir avec les haricots.'] },
  { id: 'r-skyr-banane', name: 'Skyr et banane', meals: ['collation'], servings: 1, prep: 2, cook: 0, difficulty: 'facile', tags: ['rapide'],
    ingredients: [{ foodId: 'skyr', qty: 150, unit: 'g', role: 'prot' }, { foodId: 'banane', qty: 1, unit: 'unite', role: 'carb' }],
    steps: ['Servir le skyr avec la banane en rondelles.'] },
  { id: 'r-deux-fruits', name: 'Deux fruits', meals: ['collation'], servings: 1, prep: 1, cook: 0, difficulty: 'facile', tags: ['rapide'],
    ingredients: [{ foodId: 'banane', qty: 1, unit: 'unite', role: 'carb' }, { foodId: 'pomme', qty: 1, unit: 'unite', role: 'carb' }],
    steps: ['À emporter.'] },
  { id: 'r-pre-seance', name: 'Tartines miel et skyr (pré-séance)', meals: ['collation', 'petitdej'], servings: 1, prep: 3, cook: 0, difficulty: 'facile', tags: ['pre-seance'],
    ingredients: [{ foodId: 'baguette', qty: 60, unit: 'g', role: 'carb' }, { foodId: 'miel', qty: 15, unit: 'g', role: 'other' }, { foodId: 'skyr', qty: 150, unit: 'g', role: 'prot' }],
    steps: ['Tartiner le miel sur le pain.', 'Accompagner du skyr. Digeste, environ 1 h avant la séance.'] }
];

/** Groupes de substitution : on remplace un aliment par un autre du même groupe. */
window.FD_SUBSTITUTES = [
  ['poulet-cru', 'dinde-crue', 'steak5-cru', 'cabillaud-cru', 'saumon-cru', 'tofu'],
  ['poulet-cuit', 'dinde-cuite', 'steak5-cuit', 'cabillaud-cuit', 'thon-naturel'],
  ['riz-cru', 'pates-crues', 'semoule-crue', 'quinoa-cru', 'pdt-crue', 'lentilles-crues'],
  ['riz-cuit', 'pates-cuites', 'semoule-cuite', 'quinoa-cuit', 'pdt-cuite', 'patate-douce-cuite', 'lentilles-cuites'],
  ['skyr', 'fromage-blanc-0', 'yaourt-grec'],
  ['huile-olive', 'beurre'],
  ['noix', 'amandes', 'beurre-cacahuete'],
  ['legumes-mix', 'brocoli-cuit', 'haricots-verts', 'courgette-cuite', 'epinards-cuits'],
  ['banane', 'pomme', 'orange', 'kiwi', 'fruits-rouges'],
  ['pain-mie-complet', 'baguette', 'tortilla'],
  ['haricots-rouges', 'pois-chiches', 'lentilles-cuites']
];
