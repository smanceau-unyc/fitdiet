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

  return { cfg, setCfg, clearCfg, enabled, connect, push, pull, seal, open };
})();
