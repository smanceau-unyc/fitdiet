# FitDiet Coach — version 3

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
- **Prix** (V3) : prix indicatifs modifiables, coût estimé par jour, par plan et pour la liste de courses, budget hebdomadaire du profil pris en compte par le générateur (sans sacrifier les protéines).
- **Tests** : `tests.html` (navigateur) ou `node js/run-tests-node.js` — 18 scénarios.

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
js/recipes.js     calcul, ajustement de portions, substitutions, filtres
js/planner.js     générateur de plan
js/shopping.js    liste de courses
js/ciqual.js      import CSV Ciqual et liaisons
js/prices.js      prix et coûts
js/scanner.js     lecture de codes-barres
js/photos.js      photos de progression (IndexedDB)
js/vendor/zxing.min.js  ZXing 0.21.3 (licence MIT, voir ZXING-LICENSE)
data/prices.js    prix indicatifs
data/recipes.js   recettes et groupes de substitution
js/charts.js      graphiques canvas
js/api.js         Open Food Facts, point d'extension IA
js/app.js         interface et routeur
js/tests.js       scénarios de test
```

Les données sont chargées en scripts classiques (pas de `fetch` ni de modules ES) pour fonctionner en `file://`.

## Limites connues

- Les valeurs de `data/foods.js` sont des **ordres de grandeur de démonstration**, marqués « Démo », tant qu'ils ne sont pas liés à un import Ciqual.
- Open Food Facts nécessite une connexion internet.
- Pas de photos de recettes (vignette par initiale).
- La caméra exige https (ou un fichier ouvert sur ordinateur). Sur téléphone, héberge le dossier (GitHub Pages, Netlify…) pour scanner en direct ; sinon, utilise « Photographier le code-barres ».
- Les prix fournis sont indicatifs : remplace-les par les tiens dans Courses → Mes prix.
- Les calculs sont des estimations générales et ne constituent pas un diagnostic médical.
