/**
 * api.js — Sources de données externes.
 *
 * - Open Food Facts : recherche par nom / marque / code-barres (API publique, appelée
 *   directement depuis le navigateur ; nécessite une connexion).
 * - Ciqual : import prévu à partir de l'export officiel (fichier téléchargé sur
 *   ciqual.anses.fr) — non inclus dans cette version.
 * - IA : point d'extension. Le moteur de décision reste dans coachEngine.js ; une IA
 *   ne pourra qu'expliquer ou reformuler, à partir des données structurées.
 *
 * Chaque fournisseur renvoie des aliments au format interne (voir data/foods.js),
 * ce qui permet de remplacer une source par une autre sans toucher à l'interface.
 */
window.FD = window.FD || {};

FD.api = (function () {
  const OFF = 'https://world.openfoodfacts.org';
  const FIELDS = 'code,product_name,product_name_fr,brands,nutriments,quantity,serving_size,serving_quantity';

  function timeout(ms) {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  }

  /** Convertit un produit Open Food Facts au format interne. Renvoie null si les valeurs /100 g manquent. */
  function fromOFF(p) {
    const n = p.nutriments || {};
    const kcal = n['energy-kcal_100g'] !== undefined ? n['energy-kcal_100g'] : (n['energy_100g'] !== undefined ? n['energy_100g'] / 4.184 : undefined);
    if (kcal === undefined || n.proteins_100g === undefined || n.carbohydrates_100g === undefined || n.fat_100g === undefined) return null;
    const name = p.product_name_fr || p.product_name;
    if (!name) return null;
    const serving = parseFloat(p.serving_quantity);
    return {
      id: 'off-' + p.code,
      base: name,
      brand: (p.brands || '').split(',')[0].trim() || null,
      state: null,
      cat: 'autres',
      basis: '100g',
      kcal: +kcal, p: +n.proteins_100g, g: +n.carbohydrates_100g, l: +n.fat_100g,
      fib: n.fiber_100g !== undefined ? +n.fiber_100g : 0,
      sug: n.sugars_100g !== undefined ? +n.sugars_100g : 0,
      salt: n.salt_100g !== undefined ? +n.salt_100g : 0,
      portionG: serving > 0 ? serving : undefined,
      source: 'off', barcode: p.code, variable: false,
      importedAt: new Date().toISOString()
    };
  }

  async function searchOFF(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    if (/^\d{8,14}$/.test(q)) {
      const p = await byBarcode(q);
      return p ? [p] : [];
    }
    // Produits vendus en France d'abord (noms en français, triés par popularité) ;
    // si rien ne correspond, on élargit à la base mondiale.
    const fr = await searchQuery(q, '&tagtype_0=countries&tag_contains_0=contains&tag_0=france&lc=fr&sort_by=unique_scans_n');
    if (fr.length) return fr;
    return searchQuery(q, '&lc=fr');
  }

  async function searchQuery(q, extra) {
    const url = OFF + '/cgi/search.pl?search_terms=' + encodeURIComponent(q) + '&search_simple=1&action=process&json=1&page_size=20' + extra + '&fields=' + FIELDS;
    const res = await fetch(url, { signal: timeout(12000) });
    if (!res.ok) throw new Error('Open Food Facts a répondu ' + res.status);
    const data = await res.json();
    return (data.products || []).map(fromOFF).filter(Boolean);
  }

  /**
   * Vrai quand l'app tourne dans une page hébergée qui interdit les appels vers d'autres sites
   * (version publiée sur Claude). Le drapeau est posé par la version mono-fichier.
   */
  function blocked() { return !!window.FD_SANDBOX; }

  /** Message d'erreur lisible pour un échec de requête. */
  function errorText(e) {
    if (e && e.name === 'AbortError') return 'Open Food Facts n\'a pas répondu à temps. Réessaie dans un instant.';
    if (blocked()) return 'Cette version en ligne bloque les connexions vers les autres sites, dont Open Food Facts. Utilise la version téléchargée (index.html) ou une copie hébergée sur ton propre site.';
    if (e instanceof TypeError || /network|fetch/i.test(String(e && e.message))) return 'Connexion à Open Food Facts impossible. Vérifie ta connexion internet.';
    return 'Recherche impossible : ' + (e && e.message ? e.message : 'erreur inconnue') + '.';
  }

  async function byBarcode(code) {
    const res = await fetch(OFF + '/api/v2/product/' + encodeURIComponent(code) + '.json?fields=' + FIELDS, { signal: timeout(12000) });
    if (!res.ok) throw new Error('Open Food Facts a répondu ' + res.status);
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    return fromOFF(Object.assign({ code }, data.product));
  }

  /** Point d'extension IA : non configuré dans cette version. */
  const ai = {
    configured: false,
    explain: function () { return Promise.reject(new Error('Aucun fournisseur d\'IA configuré.')); }
  };

  return { searchOFF, byBarcode, fromOFF, ai, blocked, errorText };
})();
