/**
 * charts.js — Graphiques canvas sans dépendance (ligne + barres), adaptés au thème et au HiDPI.
 */
window.FD = window.FD || {};

FD.charts = (function () {
  const U = FD.utils;

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function niceRange(min, max, pad) {
    if (min === max) { min -= 1; max += 1; }
    const p = (max - min) * (pad || 0.12);
    return [min - p, max + p];
  }

  function axes(ctx, w, h, m, yMin, yMax, labels, yDec) {
    ctx.font = '12px "IBM Plex Sans", system-ui, sans-serif';
    ctx.fillStyle = css('--muted');
    ctx.strokeStyle = css('--line');
    ctx.lineWidth = 1;
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = yMin + (yMax - yMin) * i / steps;
      const y = m.t + (h - m.t - m.b) * (1 - i / steps);
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(U.num(v, yDec), m.l - 8, y);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const n = labels.length;
    const every = Math.max(1, Math.ceil(n / 6));
    labels.forEach((lab, i) => {
      if (i % every !== 0 && i !== n - 1) return;
      const x = m.l + (w - m.l - m.r) * (n === 1 ? 0.5 : i / (n - 1));
      ctx.fillText(lab, x, h - m.b + 8);
    });
  }

  /**
   * Graphique en lignes.
   * series : [{ values:[nombre|null], color, width, dots, dash }]
   * opts : { labels, yDec, target (ligne horizontale), empty (texte si aucune donnée) }
   */
  function line(canvas, series, opts) {
    const { ctx, w, h } = setup(canvas);
    const all = [].concat.apply([], series.map((s) => s.values)).filter((v) => v !== null && v !== undefined);
    if (opts.target !== undefined && opts.target !== null) all.push(opts.target);
    if (!all.length) return empty(ctx, w, h, opts.empty);
    const [yMin, yMax] = niceRange(Math.min.apply(null, all), Math.max.apply(null, all));
    const m = { l: 48, r: 12, t: 12, b: 28 };
    axes(ctx, w, h, m, yMin, yMax, opts.labels, opts.yDec || 0);
    const n = opts.labels.length;
    const X = (i) => m.l + (w - m.l - m.r) * (n === 1 ? 0.5 : i / (n - 1));
    const Y = (v) => m.t + (h - m.t - m.b) * (1 - (v - yMin) / (yMax - yMin));
    if (opts.target !== undefined && opts.target !== null) {
      ctx.setLineDash([5, 5]); ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(m.l, Y(opts.target)); ctx.lineTo(w - m.r, Y(opts.target)); ctx.stroke();
      ctx.setLineDash([]);
    }
    series.forEach((s) => {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width || 2;
      ctx.setLineDash(s.dash || []);
      if (!s.dotsOnly) {
        ctx.beginPath();
        let started = false;
        s.values.forEach((v, i) => {
          if (v === null || v === undefined) { started = false; return; }
          if (!started) { ctx.moveTo(X(i), Y(v)); started = true; } else ctx.lineTo(X(i), Y(v));
        });
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (s.dots) s.values.forEach((v, i) => {
        if (v === null || v === undefined) return;
        ctx.beginPath(); ctx.arc(X(i), Y(v), s.dotSize || 3, 0, Math.PI * 2); ctx.fill();
      });
    });
  }

  /** Barres verticales avec ligne de cible optionnelle (par barre ou globale). */
  function bars(canvas, values, opts) {
    const { ctx, w, h } = setup(canvas);
    const targets = opts.targets || [];
    const all = values.filter((v) => v !== null).concat(targets.filter((v) => v !== null));
    if (!values.some((v) => v !== null)) return empty(ctx, w, h, opts.empty);
    const yMax = Math.max.apply(null, all) * 1.12, yMin = 0;
    const m = { l: 48, r: 12, t: 12, b: 28 };
    axes(ctx, w, h, m, yMin, yMax, opts.labels, 0);
    const n = values.length;
    const slot = (w - m.l - m.r) / n;
    const bw = Math.max(3, slot * 0.6);
    const Y = (v) => m.t + (h - m.t - m.b) * (1 - (v - yMin) / (yMax - yMin));
    values.forEach((v, i) => {
      const x = m.l + slot * i + (slot - bw) / 2;
      if (v !== null) {
        ctx.fillStyle = opts.colorFn ? opts.colorFn(v, i) : css('--accent');
        ctx.fillRect(x, Y(v), bw, Y(0) - Y(v));
      }
      if (targets[i] !== undefined && targets[i] !== null) {
        ctx.strokeStyle = css('--text'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 2, Y(targets[i])); ctx.lineTo(x + bw + 2, Y(targets[i])); ctx.stroke();
      }
    });
  }

  function empty(ctx, w, h, text) {
    ctx.fillStyle = css('--muted');
    ctx.font = '14px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text || 'Pas encore de données', w / 2, h / 2);
  }

  return { line, bars, css };
})();
