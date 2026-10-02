/**
 * utils.js — Fonctions utilitaires partagées (dates, nombres, échappement HTML).
 * Toutes les dates sont manipulées au format ISO local "YYYY-MM-DD".
 */
window.FD = window.FD || {};

FD.utils = (function () {
  const WEEKDAY_KEYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const WEEKDAY_SHORT = { lun: 'Lun', mar: 'Mar', mer: 'Mer', jeu: 'Jeu', ven: 'Ven', sam: 'Sam', dim: 'Dim' };
  const WEEK_ORDER = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

  function pad(n) { return String(n).padStart(2, '0'); }

  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function parseISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0); // midi : évite les soucis de changement d'heure
  }

  function todayISO() { return toISO(new Date()); }

  function addDays(iso, n) {
    const d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function diffDays(a, b) { // b - a en jours
    return Math.round((parseISO(b) - parseISO(a)) / 86400000);
  }

  function weekdayKey(iso) { return WEEKDAY_KEYS[parseISO(iso).getDay()]; }

  function mondayOf(iso) {
    const day = parseISO(iso).getDay(); // 0 = dimanche
    const offset = day === 0 ? -6 : 1 - day;
    return addDays(iso, offset);
  }

  function isoWeekKey(iso) {
    const d = parseISO(iso);
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const week = 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
    return target.getFullYear() + '-S' + pad(week);
  }

  function frDate(iso, opts) {
    return parseISO(iso).toLocaleDateString('fr-FR', opts || { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function frShort(iso) { return parseISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }

  /** Formate un nombre à la française (virgule, espace pour les milliers). */
  function num(n, dec) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }

  function roundTo(n, step) { return Math.round(n / step) * step; }

  /** Arrondi "honnête" des calories : pas de fausse précision. */
  function kcal(n) { return num(roundTo(n, 10)); }

  function mean(arr) {
    const v = arr.filter((x) => typeof x === 'number' && !isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function parseNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  return {
    WEEK_ORDER, WEEKDAY_SHORT, toISO, parseISO, todayISO, addDays, diffDays, weekdayKey, mondayOf,
    isoWeekKey, frDate, frShort, num, roundTo, kcal, mean, clamp, esc, norm, uid, parseNum
  };
})();
