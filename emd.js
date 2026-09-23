/* emd.js — 純 JavaScript 實作：EMD / EEMD / Hilbert / 統計工具（無外部相依） */
"use strict";
const EMDLib = (() => {
  // ---------- 極值 ----------
  function findExtrema(x) {
    const max = [], min = [];
    for (let i = 1; i < x.length - 1; i++) {
      if (x[i] > x[i - 1] && x[i] >= x[i + 1]) max.push(i);
      else if (x[i] < x[i - 1] && x[i] <= x[i + 1]) min.push(i);
    }
    return { max, min };
  }
  function zeroCrossings(x) {
    let c = 0;
    for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0 && x[i] >= 0) || (x[i - 1] > 0 && x[i] <= 0)) c++;
    return c;
  }
  // ---------- 自然三次樣條 ----------
  function splineEval(xs, ys, n) {
    const m = xs.length;
    const out = new Float64Array(n);
    if (m < 2) return null;
    if (m === 2) {
      const s = (ys[1] - ys[0]) / (xs[1] - xs[0]);
      for (let i = 0; i < n; i++) out[i] = ys[0] + s * (i - xs[0]);
      return out;
    }
    const h = new Float64Array(m - 1), alpha = new Float64Array(m);
    for (let i = 0; i < m - 1; i++) h[i] = xs[i + 1] - xs[i];
    for (let i = 1; i < m - 1; i++) alpha[i] = 3 / h[i] * (ys[i + 1] - ys[i]) - 3 / h[i - 1] * (ys[i] - ys[i - 1]);
    const l = new Float64Array(m), mu = new Float64Array(m), z = new Float64Array(m);
    l[0] = 1;
    for (let i = 1; i < m - 1; i++) {
      l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }
    const c = new Float64Array(m), b = new Float64Array(m), d = new Float64Array(m);
    for (let j = m - 2; j >= 0; j--) {
      c[j] = z[j] - mu[j] * c[j + 1];
      b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
      d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
    }
    let seg = 0;
    for (let i = 0; i < n; i++) {
      while (seg < m - 2 && i > xs[seg + 1]) seg++;
      const dx = i - xs[seg];
      out[i] = ys[seg] + b[seg] * dx + c[seg] * dx * dx + d[seg] * dx * dx * dx;
    }
    return out;
  }
  // 邊界鏡射延伸後求包絡線
  function envelope(x, idx) {
    const n = x.length;
    if (idx.length < 2) return null;
    const xs = [], ys = [];
    const m = idx.length;
    xs.push(-idx[1]); ys.push(x[idx[1]]);
    xs.push(-idx[0]); ys.push(x[idx[0]]);
    for (let i = 0; i < m; i++) { xs.push(idx[i]); ys.push(x[idx[i]]); }
    xs.push(2 * (n - 1) - idx[m - 1]); ys.push(x[idx[m - 1]]);
    xs.push(2 * (n - 1) - idx[m - 2]); ys.push(x[idx[m - 2]]);
    const ux = [], uy = [];
    for (let i = 0; i < xs.length; i++) if (i === 0 || xs[i] > ux[ux.length - 1]) { ux.push(xs[i]); uy.push(ys[i]); }
    return splineEval(ux, uy, n);
  }
  // ---------- 單次篩選 ----------
  function siftOnce(h) {
    const { max, min } = findExtrema(h);
    if (max.length < 2 || min.length < 2) return null;
    const up = envelope(h, max), lo = envelope(h, min);
    if (!up || !lo) return null;
    const mean = new Float64Array(h.length), next = new Float64Array(h.length);
    for (let i = 0; i < h.length; i++) { mean[i] = 0.5 * (up[i] + lo[i]); next[i] = h[i] - mean[i]; }
    let num = 0, den = 0;
    for (let i = 0; i < h.length; i++) { const d = h[i] - next[i]; num += d * d; den += h[i] * h[i] + 1e-12; }
    return { max, min, up, lo, mean, next, sd: num / den, nExt: max.length + min.length, nZc: zeroCrossings(next) };
  }
  function extractIMF(x, opts = {}) {
    const maxIter = opts.maxIter || 50, sdThresh = opts.sd || 0.2;
    let h = Float64Array.from(x);
    const steps = [];
    for (let it = 0; it < maxIter; it++) {
      const s = siftOnce(h);
      if (!s) break;
      if (opts.record) steps.push({ h: Float64Array.from(h), ...s });
      h = s.next;
      if (s.sd < sdThresh && Math.abs(s.nExt - s.nZc) <= 1) break;
    }
    return { imf: h, steps };
  }
  function emd(x, opts = {}) {
    const maxImf = opts.maxImf || 9;
    let r = Float64Array.from(x);
    const imfs = [];
    for (let k = 0; k < maxImf; k++) {
      const { max, min } = findExtrema(r);
      if (max.length + min.length < 3) break;
      const { imf } = extractIMF(r, opts);
      imfs.push(imf);
      const nr = new Float64Array(r.length);
      for (let i = 0; i < r.length; i++) nr[i] = r[i] - imf[i];
      r = nr;
    }
    return { imfs, residue: r };
  }
  // ---------- EEMD ----------
  let seed = 12345;
  function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function gauss() { const u = rand() || 1e-9, v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function std(x) { let m = 0; for (const v of x) m += v; m /= x.length; let s = 0; for (const v of x) s += (v - m) ** 2; return Math.sqrt(s / x.length); }
  function eemd(x, nEns = 10, noiseRatio = 0.2, opts = {}) {
    const n = x.length, sx = std(x) * noiseRatio;
    const maxImf = opts.maxImf || 9;
    const acc = Array.from({ length: maxImf + 1 }, () => new Float64Array(n));
    let maxK = 0;
    for (let e = 0; e < nEns; e++) {
      const y = new Float64Array(n);
      for (let i = 0; i < n; i++) y[i] = x[i] + sx * gauss();
      const { imfs, residue } = emd(y, opts);
      imfs.forEach((imf, k) => { for (let i = 0; i < n; i++) acc[k][i] += imf[i] / nEns; });
      const k = imfs.length; for (let i = 0; i < n; i++) acc[k][i] += residue[i] / nEns;
      maxK = Math.max(maxK, k);
    }
    return { imfs: acc.slice(0, maxK), residue: acc[maxK] };
  }
  // ---------- FFT / Hilbert ----------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const ur = re[i + j], ui = im[i + j];
          const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
          const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
          re[i + j] = ur + vr; im[i + j] = ui + vi;
          re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  function ifft(re, im) { for (let i = 0; i < im.length; i++) im[i] = -im[i]; fft(re, im); const n = re.length; for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; } }
  function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }
  function hilbert(x, fs) {
    const n = x.length, N = nextPow2(n);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < n; i++) re[i] = x[i];
    fft(re, im);
    for (let k = 0; k < N; k++) { const g = k === 0 || k === N / 2 ? 1 : (k < N / 2 ? 2 : 0); re[k] *= g; im[k] *= g; }
    ifft(re, im);
    const amp = new Float64Array(n), ph = new Float64Array(n), freq = new Float64Array(n);
    for (let i = 0; i < n; i++) { amp[i] = Math.hypot(re[i], im[i]); ph[i] = Math.atan2(im[i], re[i]); }
    let prev = ph[0], acc = 0;
    const uph = new Float64Array(n); uph[0] = ph[0];
    for (let i = 1; i < n; i++) { let d = ph[i] - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; acc += d; uph[i] = ph[0] + acc; prev = ph[i]; }
    for (let i = 1; i < n - 1; i++) freq[i] = (uph[i + 1] - uph[i - 1]) / 2 * fs / (2 * Math.PI);
    freq[0] = freq[1]; freq[n - 1] = freq[n - 2];
    return { amp, freq, phase: ph };
  }
  function meanFreq(x, fs) {
    const { amp, freq } = hilbert(x, fs);
    let num = 0, den = 0;
    for (let i = 5; i < x.length - 5; i++) { const w = amp[i] * amp[i]; if (freq[i] > 0) { num += w * freq[i]; den += w; } }
    return den > 0 ? num / den : 0;
  }
  function powerSpectrum(x, fs) {
    const N = nextPow2(x.length), re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < x.length; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (x.length - 1)));
    fft(re, im);
    const half = N / 2, p = new Float64Array(half), f = new Float64Array(half);
    for (let k = 0; k < half; k++) { p[k] = (re[k] ** 2 + im[k] ** 2) / N; f[k] = k * fs / N; }
    return { f, p };
  }
  // ---------- 統計 ----------
  function kurtosis(x) {
    let m = 0; for (const v of x) m += v; m /= x.length;
    let m2 = 0, m4 = 0; for (const v of x) { const d = v - m; m2 += d * d; m4 += d ** 4; }
    m2 /= x.length; m4 /= x.length;
    return m2 > 0 ? m4 / (m2 * m2) : 3;
  }
  function energy(x) { let s = 0; for (const v of x) s += v * v; return s; }
  function histogram(x, bins = 41, range = 4) {
    const s = std(x) || 1, h = new Float64Array(bins), centers = new Float64Array(bins);
    let m = 0; for (const v of x) m += v; m /= x.length;
    for (let i = 0; i < bins; i++) centers[i] = -range + (2 * range) * (i + 0.5) / bins;
    for (const v of x) { const z = (v - m) / s; const b = Math.floor((z + range) / (2 * range) * bins); if (b >= 0 && b < bins) h[b]++; }
    const w = 2 * range / bins; for (let i = 0; i < bins; i++) h[i] /= x.length * w;
    return { centers, h, gauss: centers.map(z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI)) };
  }
  return { findExtrema, envelope, siftOnce, extractIMF, emd, eemd, hilbert, meanFreq, powerSpectrum, kurtosis, energy, histogram, std, gauss, rand, setSeed: s => { seed = s >>> 0; } };
})();
