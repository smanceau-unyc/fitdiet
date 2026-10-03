/**
 * photos.js — Photos de progression, stockées UNIQUEMENT dans le navigateur (IndexedDB).
 * Elles ne sont jamais envoyées ailleurs ; l'export JSON des données ne les inclut pas
 * (export séparé disponible). Les photos sont redimensionnées (1080 px max) avant stockage.
 * Aucune estimation de masse grasse n'est tirée des photos.
 */
window.FD = window.FD || {};

FD.photos = (function () {
  const DB = 'fitdiet-coach-photos', STORE = 'photos', RSTORE = 'recipes';
  const VIEWS = { face: 'Face', profil: 'Profil', dos: 'Dos' };
  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('Ce navigateur ne permet pas le stockage local des photos.'));
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) { const s = d.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('date', 'date'); }
        if (!d.objectStoreNames.contains(RSTORE)) d.createObjectStore(RSTORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Stockage des photos indisponible.'));
    });
    return dbp;
  }

  function tx(mode, fn, store) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(store || STORE, mode);
      const s = t.objectStore(store || STORE);
      const out = fn(s);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
    }));
  }

  /** Redimensionne et compresse une image en JPEG. */
  function shrink(file, max) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, (max || 1080) / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible.'))), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
      img.src = url;
    });
  }

  async function add(file, date, view) {
    const blob = await shrink(file, 1080);
    const rec = { id: date + '-' + view + '-' + Date.now().toString(36), date, view, blob, addedAt: new Date().toISOString() };
    await tx('readwrite', (s) => s.put(rec));
    return rec;
  }

  function list() {
    return tx('readonly', (s) => s.getAll()).then((r) => (r || []).sort((a, b) => a.date.localeCompare(b.date)));
  }

  function remove(id) { return tx('readwrite', (s) => s.delete(id)); }

  /**
   * Photo la plus proche d'une date cible pour une vue, dans une tolérance (jours).
   * Renvoie null si rien d'assez proche : on ne compare pas des dates trop éloignées.
   */
  function closest(photos, view, iso, tolerance) {
    let best = null, bestGap = Infinity;
    photos.filter((p) => p.view === view).forEach((p) => {
      const gap = Math.abs(FD.utils.diffDays(p.date, iso));
      if (gap <= tolerance && gap < bestGap) { best = p; bestGap = gap; }
    });
    return best;
  }

  /** Jeu de comparaison : dernière photo, puis ~1 semaine, ~1 mois et ~3 mois avant. */
  function comparison(photos, view) {
    const own = photos.filter((p) => p.view === view);
    if (!own.length) return [];
    const last = own[own.length - 1];
    const U = FD.utils;
    const rows = [{ label: 'Dernière', photo: last }];
    [['Il y a 1 semaine', 7, 3], ['Il y a 1 mois', 30, 8], ['Il y a 3 mois', 91, 20]].forEach(([label, d, tol]) => {
      const p = closest(own.filter((x) => x.id !== last.id), view, U.addDays(last.date, -d), tol);
      rows.push({ label, photo: p, target: U.addDays(last.date, -d) });
    });
    return rows;
  }

  function blobToDataURL(blob) {
    return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
  }

  async function exportAll() {
    const all = await list();
    const out = [];
    for (const p of all) out.push({ id: p.id, date: p.date, view: p.view, data: await blobToDataURL(p.blob) });
    return { type: 'fitdiet-coach-photos', version: 1, photos: out };
  }

  async function importAll(json) {
    if (!json || json.type !== 'fitdiet-coach-photos' || !Array.isArray(json.photos)) throw new Error('Ce fichier n\'est pas un export de photos FitDiet Coach.');
    let n = 0;
    for (const p of json.photos) {
      const blob = await (await fetch(p.data)).blob();
      await tx('readwrite', (s) => s.put({ id: p.id, date: p.date, view: p.view, blob, addedAt: new Date().toISOString() }));
      n++;
    }
    return n;
  }

  /* ---- Photos de recettes (une par recette, stockée localement) ---- */
  async function setRecipePhoto(recipeId, file) {
    const blob = await shrink(file, 900);
    await tx('readwrite', (s) => s.put({ id: recipeId, blob, addedAt: new Date().toISOString() }), RSTORE);
  }
  function recipePhotos() { return tx('readonly', (s) => s.getAll(), RSTORE).then((r) => r || []); }
  function removeRecipePhoto(recipeId) { return tx('readwrite', (s) => s.delete(recipeId), RSTORE); }

  return { VIEWS, add, list, remove, comparison, exportAll, importAll, setRecipePhoto, recipePhotos, removeRecipePhoto };
})();
