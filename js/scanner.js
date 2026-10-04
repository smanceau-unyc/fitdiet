/**
 * scanner.js — Lecture de codes-barres (EAN-13, EAN-8, UPC) par la caméra ou une photo.
 *
 * Moteur : BarcodeDetector natif quand le navigateur le propose (Chrome Android, Edge…),
 * sinon ZXing (bibliothèque MIT embarquée dans js/vendor, chargée à la demande).
 * La caméra exige un contexte sécurisé : https, localhost, ou fichier local sur ordinateur.
 */
window.FD = window.FD || {};

FD.scanner = (function () {
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
  let stream = null, timer = null, detector = null, zx = null, engineName = null;

  function cameraAvailable() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext !== false; }

  function loadZXing() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/zxing.min.js?v=3.12';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Décodeur de code-barres introuvable (js/vendor/zxing.min.js).'));
      document.head.appendChild(s);
    });
  }

  async function engine() {
    if (engineName) return engineName;
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const f = FORMATS.filter((x) => supported.includes(x));
        if (f.includes('ean_13')) { detector = new window.BarcodeDetector({ formats: f }); engineName = 'natif'; return engineName; }
      } catch (e) { /* on passe à ZXing */ }
    }
    await loadZXing();
    const Z = window.ZXing;
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    zx = new Z.MultiFormatReader();
    zx.setHints(hints);
    engineName = 'zxing';
    return engineName;
  }

  async function decodeCanvas(canvas) {
    if (detector) {
      const r = await detector.detect(canvas);
      return r && r[0] ? r[0].rawValue : null;
    }
    try {
      const Z = window.ZXing;
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
      return zx.decode(bmp).getText();
    } catch (e) { return null; }
  }

  const valid = (c) => /^\d{8,14}$/.test(String(c || ''));

  /** Démarre la caméra dans videoEl et appelle onCode(code) à la première lecture valide. */
  async function start(videoEl, onCode) {
    stop();
    await engine();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    videoEl.srcObject = stream;
    videoEl.setAttribute('playsinline', '');
    videoEl.muted = true;
    await videoEl.play();
    const canvas = document.createElement('canvas');
    const loop = async () => {
      if (!stream) return;
      if (videoEl.videoWidth) {
        // on ne lit que la bande centrale : plus rapide et plus fiable
        const w = videoEl.videoWidth, h = videoEl.videoHeight, bandH = Math.round(h * 0.5);
        canvas.width = w; canvas.height = bandH;
        canvas.getContext('2d').drawImage(videoEl, 0, (h - bandH) / 2, w, bandH, 0, 0, w, bandH);
        const code = await decodeCanvas(canvas);
        if (valid(code)) { stop(); onCode(code); return; }
      }
      timer = setTimeout(loop, 220);
    };
    loop();
  }

  function stop() {
    clearTimeout(timer);
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  }

  /** Décode un code-barres à partir d'une photo (repli quand la caméra en direct n'est pas disponible). */
  async function decodeFile(file) {
    await engine();
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Image illisible.')); i.src = url; });
      for (const max of [1600, 1000, 2400]) {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const code = await decodeCanvas(c);
        if (valid(code)) return code;
      }
      return null;
    } finally { URL.revokeObjectURL(url); }
  }

  return { cameraAvailable, start, stop, decodeFile, isActive: () => !!stream, engine: () => engineName };
})();
