// Exécution des tests du moteur hors navigateur : node js/run-tests-node.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
['js/utils.js', 'data/foods.js', 'data/recipes.js', 'data/prices.js', 'js/storage.js', 'js/calculations.js', 'js/foods.js', 'js/nutrition.js', 'js/tracking.js',
 'js/trends.js', 'js/adherence.js', 'js/coachEngine.js', 'js/decisionHistory.js', 'js/recipes.js', 'js/planner.js', 'js/shopping.js', 'js/prices.js', 'js/photos.js', 'js/tests.js']
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }));
const res = ctx.FD.tests.run();
res.forEach((r) => console.log((r.ok ? 'OK  ' : 'ÉCHEC') + '  ' + r.name + '  → ' + r.code + (r.err ? '  [' + r.err + ']' : '')));
console.log('\n' + res.filter((r) => r.ok).length + '/' + res.length + ' scénarios conformes');
process.exit(res.every((r) => r.ok) ? 0 : 1);
