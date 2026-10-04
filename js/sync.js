/**
 * sync.js — Synchronisation entre appareils via un Gist GitHub secret, chiffré.
 *
 * - Les données sont chiffrées dans le navigateur (AES-GCM 256, clé dérivée de ta phrase secrète
 *   par PBKDF2-SHA256) AVANT l'envoi : GitHub ne stocke qu'un bloc illisible.
 * - Le jeton GitHub (droit « gist » uniquement) et la phrase secrète restent sur l'appareil ;
 *   ils ne sont jamais inclus dans les données synchronisées.
 * - Règle : la version la plus récente gagne ; si les deux appareils ont changé depuis la
 *   dernière synchro, l'app demande laquelle garder.
 * - Les photos (IndexedDB) ne sont pas synchronisées : export/import séparé.
 */
window.FD = window.FD || {};

FD.sync = (function () {
  const API = 'https://api.github.com';
  const FILE = 'fitdiet-coach.json';
  const DESC = 'FitDiet Coach — données chiffrées (ne pas modifier)';
  const LOCAL_KEY = 'fitdiet-coach.sync'; // réglages de synchro, propres à l'appareil

  /* ---------- Réglages locaux (jamais synchronisés) ---------- */
  function cfg() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch (e) { return {}; }
  }
  function setCfg(patch) {
    const c = Object.assign(cfg(), patch);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(c));
    return c;
  }
  function clearCfg() { localStorage.removeItem(LOCAL_KEY); }
  function enabled() { const c = cfg(); return !!(c.token && c.passphrase && c.gistId); }

  /* ---------- Chiffrement ---------- */
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function key(pass, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function seal(obj, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const k = await key(pass, salt);
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(obj)));
    return { app: 'fitdiet-coach', format: 1, updatedAt: obj.meta && obj.meta.updatedAt, salt: b64(salt), iv: b64(iv), data: b64(data) };
  }

  async function open(box, pass) {
    try {
      const k = await key(pass, unb64(box.salt));
      const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, k, unb64(box.data));
      return JSON.parse(dec.decode(data));
    } catch (e) {
      throw new Error('Phrase secrète incorrecte (ou données abîmées) : impossible de déchiffrer.');
    }
  }

  /* ---------- API GitHub ---------- */
  async function gh(path, opts, token) {
    const res = await fetch(API + path, Object.assign({}, opts, {
      headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token }, opts && opts.body ? { 'Content-Type': 'application/json' } : {})
    }));
    if (res.status === 401) throw new Error('Jeton GitHub refusé : vérifie-le (droit « gist » nécessaire).');
    if (res.status === 404) throw new Error('Gist introuvable.');
    if (!res.ok) throw new Error('GitHub a répondu ' + res.status + '.');
    return res.json();
  }

  async function readGist(token, id) {
    const g = await gh('/gists/' + id, { method: 'GET' }, token);
    const f = g.files && g.files[FILE];
    if (!f) throw new Error('Le gist ne contient pas de données FitDiet Coach.');
    const content = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
    return JSON.parse(content);
  }

  /**
   * Connexion : vérifie le jeton, retrouve le gist existant (2e appareil) ou en crée un.
   * Renvoie { created, remote } : remote = boîte chiffrée existante (ou null).
   */
  async function connect(token, passphrase) {
    if (!token || !passphrase) throw new Error('Jeton et phrase secrète requis.');
    if (passphrase.length < 8) throw new Error('Choisis une phrase secrète d\'au moins 8 caractères.');
    const list = await gh('/gists?per_page=100', { method: 'GET' }, token);
    const found = list.find((g) => g.files && g.files[FILE] && g.description === DESC);
    if (found) {
      setCfg({ token, passphrase, gistId: found.id });
      const box = await readGist(token, found.id);
      await open(box, passphrase); // vérifie la phrase secrète
      return { created: false, remote: box };
    }
    const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content: '{}' } } }) }, token);
    setCfg({ token, passphrase, gistId: g.id });
    return { created: true, remote: null };
  }

  /** Données envoyées : tout l'état, sauf ce qui est propre à l'appareil. */
  function payload(state) {
    const copy = JSON.parse(JSON.stringify(state));
    return copy;
  }

  async function push(state) {
    const c = cfg();
    if (!enabled()) throw new Error('Synchronisation non configurée.');
    state.meta.updatedAt = state.meta.updatedAt || new Date().toISOString();
    const box = await seal(payload(state), c.passphrase);
    await gh('/gists/' + c.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(box) } } }) }, c.token);
    setCfg({ lastSync: state.meta.updatedAt, lastSyncAt: new Date().toISOString(), lastError: null });
    return true;
  }

  /** Récupère l'état distant déchiffré (ou null s'il n'y en a pas encore). */
  async function pull() {
    const c = cfg();
    if (!enabled()) throw new Error('Synchronisation non configurée.');
    const box = await readGist(c.token, c.gistId);
    if (!box || !box.data) return null;
    const state = await open(box, c.passphrase);
    return state;
  }

  /* ================== Photos (gist séparé, un fichier chiffré par photo) ================== */
  const PHOTO_DESC = 'FitDiet Coach — photos chiffrées (ne pas modifier)';
  const stampOf = (iso) => String(iso || '0').replace(/\D/g, '').slice(0, 17) || '0';
  const fileName = (key, stamp) => key.replace(':', '_').replace(/[^a-zA-Z0-9_-]/g, (c) => '~' + c.charCodeAt(0).toString(16)) + '__' + stamp + '.json';
  function parseName(name) {
    const m = name.match(/^([rp])_(.+)__(\d+)\.json$/);
    if (!m) return null;
    const id = m[2].replace(/~([0-9a-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16)));
    return { key: m[1] + ':' + id, kind: m[1], id, stamp: m[3] };
  }

  /** Requête sans lire la réponse (les réponses de gist contiennent tous les fichiers : on les ignore). */
  async function ghQuiet(path, opts, token) {
    const res = await fetch(API + path, Object.assign({}, opts, { headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } }));
    if (!res.ok) throw new Error('GitHub a répondu ' + res.status + ' (photos).');
    try { if (res.body && res.body.cancel) res.body.cancel(); } catch (e) { /* rien */ }
    return true;
  }

  /** Gist des photos : retrouvé par sa description, sinon créé. Renvoie { id, files: { nom: raw_url } }. */
  async function photoGist(token) {
    const list = await gh('/gists?per_page=100', { method: 'GET' }, token);
    let g = list.find((x) => x.description === PHOTO_DESC);
    if (!g) {
      const res = await fetch(API + '/gists', { method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ description: PHOTO_DESC, public: false, files: { 'LISEZMOI.txt': { content: 'Photos FitDiet Coach chiffrées. Ne pas modifier.' } } }) });
      if (!res.ok) throw new Error('Création du stockage des photos impossible (' + res.status + ').');
      g = await res.json();
    }
    const files = {};
    Object.keys(g.files || {}).forEach((n) => { files[n] = g.files[n].raw_url; });
    return { id: g.id, files };
  }

  /**
   * Synchronise les photos (progression + recettes) dans les deux sens.
   * tombstones : { 'r:<id>': date } des photos supprimées (synchronisées avec les données).
   * onProgress(texte) facultatif.
   */
  async function syncPhotos(tombstones, onProgress) {
    const c = cfg();
    if (!enabled()) throw new Error('Synchronisation non configurée.');
    const say = (t) => { if (onProgress) onProgress(t); };
    const pg = await photoGist(c.token);
    const remote = {};
    Object.keys(pg.files).forEach((n) => { const p = parseName(n); if (p && (!remote[p.key] || remote[p.key].stamp < p.stamp)) remote[p.key] = Object.assign(p, { name: n, url: pg.files[n] }); });
    const localAll = await FD.photos.allRecords();
    const local = {};
    localAll.forEach((x) => { local[x.key] = Object.assign(x, { stamp: stampOf(x.rec.addedAt) }); });
    const dead = tombstones || {};
    let up = 0, down = 0, del = 0;

    // 1) suppressions : photos supprimées sur un appareil
    for (const key of Object.keys(local)) if (dead[key] && stampOf(dead[key]) >= local[key].stamp) { await FD.photos.deleteRaw(local[key].kind, local[key].rec.id); delete local[key]; del++; }
    const remoteDeletes = {};
    Object.keys(pg.files).forEach((n) => { const p = parseName(n); if (p && dead[p.key] && stampOf(dead[p.key]) >= p.stamp) remoteDeletes[n] = null; });

    // 2) envois : photos locales absentes ou plus récentes que la copie en ligne (par lots)
    const toUpload = Object.values(local).filter((x) => !remote[x.key] || remote[x.key].stamp < x.stamp);
    let batch = Object.assign({}, remoteDeletes), size = 0;
    const flush = async () => { if (Object.keys(batch).length) { await ghQuiet('/gists/' + pg.id, { method: 'PATCH', body: JSON.stringify({ files: batch }) }, c.token); } batch = {}; size = 0; };
    for (const x of toUpload) {
      say('Envoi des photos… ' + (up + 1) + '/' + toUpload.length);
      const small = await FD.photos.shrink(x.rec.blob, 640, 0.78);
      const dataUrl = await FD.photos.blobToDataURL(small);
      const meta = x.kind === 'p' ? { date: x.rec.date, view: x.rec.view } : {};
      const box = await seal({ meta: { updatedAt: x.rec.addedAt }, kind: x.kind, id: x.rec.id, addedAt: x.rec.addedAt, info: meta, image: dataUrl }, c.passphrase);
      const content = JSON.stringify(box);
      batch[fileName(x.key, x.stamp)] = { content };
      if (remote[x.key]) batch[remote[x.key].name] = null; // ancienne version
      size += content.length; up++;
      if (size > 2500000 || Object.keys(batch).length >= 12) await flush();
    }
    await flush();

    // 3) téléchargements : photos en ligne absentes ou plus récentes ici
    const toDownload = Object.values(remote).filter((r) => !dead[r.key] && (!local[r.key] || local[r.key].stamp < r.stamp));
    for (const r of toDownload) {
      say('Réception des photos… ' + (down + 1) + '/' + toDownload.length);
      const res = await fetch(r.url);
      if (!res.ok) continue;
      const obj = await open(await res.json(), c.passphrase);
      const blob = await (await fetch(obj.image)).blob();
      const rec = obj.kind === 'p' ? { id: obj.id, date: obj.info.date, view: obj.info.view, blob, addedAt: obj.addedAt } : { id: obj.id, blob, addedAt: obj.addedAt };
      await FD.photos.putRaw(obj.kind, rec);
      down++;
    }
    setCfg({ lastPhotoSyncAt: new Date().toISOString() });
    say('');
    return { up, down, del };
  }

  return { cfg, setCfg, clearCfg, enabled, connect, push, pull, seal, open, syncPhotos };
})();
