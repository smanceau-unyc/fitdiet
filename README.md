# FitDiet Coach — version 3.12

Application de suivi nutritionnel sportif en HTML/CSS/JavaScript vanilla.
Ouvre simplement `index.html` dans un navigateur : aucune installation, aucun serveur.

## Contenu de la V1

- **Profil** : Mifflin-St Jeor (formule affichée), dépense totale en fourchette, plancher/plafond calorique, protéines, fibres, préférences, équipements, situations médicales.
- **Semaine modulable** : 9 types de séance (force haut/bas, full body, hybride, course intense/longue/facile, récup, repos) avec calories et lipides éditables ; glucides = calories restantes. Semaine type + séance réelle par jour. Budget calorique hebdomadaire.
- **Journal** : recherche avec distinction obligatoire cru/cuit, unités g/kg/ml/unité/portion, repas types en un clic, saisie libre (restaurant, dessert, alcool), modification, suppression, substitution avec macros recalculées, recherche Open Food Facts (nom, marque, code-barres).
- **Suivi** : poids, tour de taille (+ conditions de mesure), pas, sommeil, faim, séance, durée, performances, autres activités, dépense estimée en fourchette, 4 graphiques, historique.
- **Coach** : moteur déterministe (`evaluateUserState`), décision expliquée (observation, interprétation, recommandation, raison, réévaluation), options à appliquer une à la fois, niveau de confiance, détails experts, rapport hebdomadaire, questions de la semaine, historique des décisions, garde-fous de sécurité.
- **Paramètres** : thème sombre/clair, export/import JSON, données de démo, seuils du coach, sources, réinitialisation.
- **Recettes** (V2) : 22 recettes dont les macros sont calculées depuis les ingrédients, portions ajustables, substitutions qui conservent l'apport principal (protéines ou glucides), éditeur de recettes perso ou externes (auteur, URL), ajout au journal (portion standard ou ajustée à la cible du repas), suggestions « il te reste X kcal ».
- **Plan alimentaire** (V2) : 1, 3 ou 7 jours, 3 à 5 repas, cibles par repas selon la séance du jour, repas fixes optionnels, budget, exclusions et régime, anti-gaspillage, « autre idée », substitution, ajout au journal.
- **Courses** (V2) : agrégation par rayon, cuit converti en cru à acheter, unités (œufs, fruits, tranches), cases à cocher, copie et téléchargement.
- **Import Ciqual** (V2) : CSV de la table officielle, liaison des aliments de démo (suggestions + choix manuel).
- **Scanner code-barres** (V3) : caméra en direct (BarcodeDetector natif ou ZXing embarqué), photo du code, ou saisie des chiffres ; recherche Open Food Facts, confirmation avant ajout ; produits déjà scannés retrouvés hors ligne.
- **Photos de progression** (V3) : face / profil / dos, datées, stockées uniquement dans le navigateur (IndexedDB), comparaison dernière / 1 semaine / 1 mois / 3 mois, export/import séparé.
- **Fruits et légumes à la pièce** (V3.1) : 1 banane, 1 tomate, 1 poignée de salade… avec calibre petit / moyen / gros et l'équivalent en grammes affiché ; 30 fruits et légumes ajoutés.
- **Ciqual 2025 intégrée hors ligne** (V3.3) : 3 385 aliments de la table ANSES, dont environ 400 plats composés (lasagnes, couscous, hachis parmentier, quiches, pizzas, soupes, salades composées), 66 sandwichs, viennoiseries, desserts et boissons, avec portions types (assiette, part, bol, sandwich, verre). Les aliments de base sont liés à Ciqual (sauf skyr, whey, crème de riz). Licence Ouverte Etalab 2.0 ; données converties depuis github.com/OlivierFitter/ciqual_2025_complete.
- **Photos synchronisées** (V3.12) : photos de recettes et de progression envoyées chiffrées dans un second gist (un fichier par photo, 640 px), téléchargées sur l'autre appareil ; suppressions propagées.
- **Synchronisation Mac ↔ téléphone** (V3.11) : données chiffrées dans le navigateur (AES-GCM, clé dérivée d'une phrase secrète) puis stockées dans un gist secret de ton compte GitHub (jeton limité au droit « gist ») ; envoi automatique après chaque saisie, vérification à l'ouverture et au retour sur l'app, choix en cas de conflit.
- **Favoris** (V3.10) : étoile sur les cartes, la fiche recette et l'onglet Recettes du journal ; filtre « ★ Favoris » ; favoris en tête de liste dans le journal ; option de plan « Privilégier mes favoris » ; léger avantage aux favoris dans les suggestions.
- **Compléter ma journée, affiné** (V3.9.4) : tient compte du nombre de repas par jour du profil (repas déjà saisis décomptés) ; bouton « Ajouter seulement ce déjeuner / dîner » dans chaque option ; propositions aussi quand il ne reste qu'un repas.
- **Journal regroupé** (V3.9.3) : une recette ou un repas type ajouté s'affiche sur une seule ligne (photo, nom, portion, calories et macros totales), avec multiplicateur de portion, détail des ingrédients dépliable et suppression en un clic.
- **Recettes dans le journal** (V3.9.2) : onglet « Recettes » (par défaut) avec recherche, catégories, photos ; ajout de ½, 1, 1 ½ ou 2 portions, ou portion ajustée à ce qu'il reste pour le repas.
- **Variété** (V3.9.1) : batch cooking désactivé par défaut et limité au déjeuner (2, 3 ou 4 jours) ; jamais le même plat que la veille au même repas ; environ 21 plats différents par semaine.
- **Plan corrigé** (V3.9) : plafond et plancher du profil appliqués à toutes les cibles ; dernier repas de chaque journée recalé sur ce qu'il reste (calories, protéines, glucides, lipides) ; garde-fou qui empêche tout dépassement du plafond ; choix des recettes (toutes, privilégier ou uniquement une collection, recettes de l'app, mes recettes) ; batch cooking (un prep'meal de 4 portions sert plusieurs jours) ; temps de préparation compté par portion ; petites quantités (huile, miel) non gonflées par l'arrondi.
- **Robustesse** (V3.8.1) : numéro de version sur les fichiers (le navigateur recharge toujours les bons), page d'erreur explicite au lieu d'un écran vide, suggestions désactivées proprement en cas de problème. Version affichée sous le menu.
- **Compléter ma journée** (V3.8) : dès qu'un repas est saisi, le journal propose 3 combinaisons de recettes (déjeuner, collation, dîner) aux portions ajustées pour boucler calories, protéines, glucides et lipides ; ajout en un clic.
- **Photos en lot** (V3.7) : Recettes → « Importer des photos » ; chaque image est associée à sa recette par son nom de fichier (identifiant de recette, ex. `cfz1-p75.jpg`, ou nom de la recette).
- **Classement, cru/cuit et illustrations** (V3.6) : recettes classées (overnight oats, petits-déjeuners, prep'meals, repas, snacks, smoothies, jus) avec filtres ; équivalence cru ↔ cuit affichée pour féculents, viandes et poissons ; illustration générée pour chaque recette à partir de ses ingrédients (js/recipeArt.js), remplaçable par une photo personnelle.
- **Import de recettes et photos** (V3.5) : import d'un fichier de recettes JSON (type `fitdiet-coach-recipes`), filtre par collection, retrait d'une collection, photo personnelle par recette stockée localement (IndexedDB), notes par ingrédient, valeurs annoncées par la source affichées à titre de comparaison. Les fichiers de recettes issus de livres achetés restent privés : ne pas les déposer dans le dépôt GitHub.
- **Lipides quotidiens** (V3.4) : objectif de lipides en g/jour dans le profil (65 g par défaut), appliqué à toutes les séances ; les glucides prennent le reste. Champ vide = lipides réglés séance par séance.
- **Fractions** (V3.3) : « 1/2 », « ½ », « 1 1/2 » acceptés, boutons ¼ ½ ¾ 1 1½ 2, affichage « ½ × avocat ».
- **Prix** (V3) : prix indicatifs modifiables, coût estimé par jour, par plan et pour la liste de courses, budget hebdomadaire du profil pris en compte par le générateur (sans sacrifier les protéines).
- **Tests** : `tests.html` (navigateur) ou `node js/run-tests-node.js` — 26 scénarios.

## Architecture

```
index.html        tests.html
css/style.css
data/foods.js     base d'aliments de démo + repas types
js/utils.js       dates, formats, échappement
js/storage.js     localStorage, état par défaut, export/import
js/calculations.js BMR, TDEE, cibles, macros, dépense d'activité
js/foods.js       recherche, cru/cuit, unités, calcul par quantité
js/nutrition.js   repas, totaux, répartition pré/post-séance
js/tracking.js    mesures, journal, substitutions, démo
js/trends.js      moyennes 7/14/28 j, classification, tour de taille
js/adherence.js   adhérence, week-end, budget hebdomadaire
js/coachEngine.js moteur de décision + rapport hebdo
js/decisionHistory.js historique et application des options
js/recipes.js     calcul, ajustement de portions, substitutions, filtres, catégories, cru/cuit
js/recipeArt.js   illustrations SVG des recettes
js/planner.js     générateur de plan
js/shopping.js    liste de courses
js/ciqual.js      import CSV Ciqual et liaisons
js/prices.js      prix et coûts
js/scanner.js     lecture de codes-barres
js/photos.js      photos de progression et de recettes (IndexedDB)
js/sync.js        synchronisation chiffrée via gist GitHub
js/vendor/zxing.min.js  ZXing 0.21.3 (licence MIT, voir ZXING-LICENSE)
data/prices.js    prix indicatifs
data/ciqual.js    table CIQUAL 2025 compacte (hors ligne)
data/ciqual-links.js  correspondances aliments de base → codes Ciqual
data/recipes.js   recettes et groupes de substitution
js/charts.js      graphiques canvas
js/api.js         Open Food Facts, point d'extension IA
js/app.js         interface et routeur
js/tests.js       scénarios de test
```

Les données sont chargées en scripts classiques (pas de `fetch` ni de modules ES) pour fonctionner en `file://`.

## Limites connues

- Les aliments de base sans équivalent Ciqual (skyr, whey, crème de riz) gardent des valeurs indicatives marquées « Démo ». Les portions types des plats Ciqual sont indicatives.
- Open Food Facts nécessite une connexion internet.
- Pas de photos de recettes (vignette par initiale).
- La caméra exige https (ou un fichier ouvert sur ordinateur). Sur téléphone, héberge le dossier (GitHub Pages, Netlify…) pour scanner en direct ; sinon, utilise « Photographier le code-barres ».
- Les prix fournis sont indicatifs : remplace-les par les tiens dans Courses → Mes prix.
- Les calculs sont des estimations générales et ne constituent pas un diagnostic médical.
