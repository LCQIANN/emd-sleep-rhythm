"use strict";
const L = EMDLib;
const COLORS = ["#7cc4ff", "#ffb86b", "#8be28b", "#ff8fa3", "#c3a6ff", "#5ee7d9", "#ffd166", "#f4a261", "#9aa5b8"];
const $ = id => document.getElementById(id);

// ---------- 畫圖工具 ----------
function setup(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || cv.width, h = (cv.height / cv.width) * w;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function line(ctx, y, x0, x1, y0, y1, color, lw = 1.4, n = y.length) {
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw;
  for (let i = 0; i < n; i++) {
    const px = x0 + (x1 - x0) * i / (n - 1), py = y0 + (y1 - y0) * i / (n - 1);
    ctx[i ? "lineTo" : "moveTo"](px, py(y[i]));
  }
  ctx.stroke();
}
function plotRows(cv, rows) {
  // rows: [{y:[...] , color, label, extra:[{y,color}], points:[{idx,color}]}]
  const { ctx, w, h } = setup(cv);
  const rh = h / rows.length;
  ctx.font = "12px sans-serif";
  rows.forEach((r, k) => {
    const top = k * rh, mid = top + rh / 2;
    let a = Infinity, b = -Infinity;
    const all = [r.y, ...(r.extra || []).map(e => e.y)];
    all.forEach(arr => { for (const v of arr) { if (v < a) a = v; if (v > b) b = v; } });
    if (b - a < 1e-9) { a -= 1; b += 1; }
    const pad = (b - a) * 0.1; a -= pad; b += pad;
    const sy = v => top + rh - (v - a) / (b - a) * rh;
    const px = i => 8 + (w - 16) * i / (r.y.length - 1);
    ctx.strokeStyle = "#26304a"; ctx.beginPath(); ctx.moveTo(0, top + rh); ctx.lineTo(w, top + rh); ctx.stroke();
    ctx.strokeStyle = "#1f2840"; ctx.beginPath(); ctx.moveTo(0, sy(0)); ctx.lineTo(w, sy(0)); ctx.stroke();
    const draw = (arr, color, lw) => { ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw; for (let i = 0; i < arr.length; i++) ctx[i ? "lineTo" : "moveTo"](px(i), sy(arr[i])); ctx.stroke(); };
    (r.extra || []).forEach(e => draw(e.y, e.color, e.lw || 1.2));
    draw(r.y, r.color, r.lw || 1.4);
    (r.points || []).forEach(p => { ctx.fillStyle = p.color; p.idx.forEach(i => { ctx.beginPath(); ctx.arc(px(i), sy(r.y[i]), 2.5, 0, 7); ctx.fill(); }); });
    if (r.label) { ctx.fillStyle = "#e8ecf4"; ctx.fillText(r.label, 10, top + 14); }
    if (r.right) { ctx.fillStyle = r.rightColor || "#9aa5b8"; ctx.textAlign = "right"; ctx.fillText(r.right, w - 10, top + 14); ctx.textAlign = "left"; }
  });
}
const bandOf = f => f < 0.5 ? "殘餘 / 極慢趨勢" : f < 4 ? "δ 慢波" : f < 8 ? "θ 波" : f < 12 ? "α 波" : f < 16 ? "σ 紡錘波" : f < 30 ? "β 波" : "γ / 肌電";

// ---------- 實驗 1：手繪 ----------
const pad = $("pad"); let padPts = [], padSignal = null, drawing = false;
function padDraw() {
  const { ctx, w, h } = setup(pad);
  ctx.strokeStyle = "#26304a"; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  if (padSignal) {
    ctx.beginPath(); ctx.strokeStyle = "#7cc4ff"; ctx.lineWidth = 2;
    let a = Math.min(...padSignal), b = Math.max(...padSignal); if (b - a < 1e-9) { a--; b++; }
    padSignal.forEach((v, i) => ctx[i ? "lineTo" : "moveTo"](w * i / (padSignal.length - 1), h - 10 - (v - a) / (b - a) * (h - 20)));
    ctx.stroke();
  } else if (padPts.length) {
    ctx.beginPath(); ctx.strokeStyle = "#7cc4ff"; ctx.lineWidth = 2;
    padPts.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x * w, p.y * h)); ctx.stroke();
  }
}
function padPos(e) { const r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
pad.addEventListener("pointerdown", e => { drawing = true; padPts = [padPos(e)]; padSignal = null; padDraw(); });
pad.addEventListener("pointermove", e => { if (!drawing) return; const p = padPos(e); if (p.x > padPts[padPts.length - 1].x) padPts.push(p); padDraw(); });
const finish = () => { if (!drawing) return; drawing = false; if (padPts.length > 5) { const N = 600, s = new Float64Array(N); let j = 0; for (let i = 0; i < N; i++) { const x = padPts[0].x + (padPts[padPts.length - 1].x - padPts[0].x) * i / (N - 1); while (j < padPts.length - 2 && padPts[j + 1].x < x) j++; const p0 = padPts[j], p1 = padPts[j + 1]; const t = (x - p0.x) / Math.max(1e-9, p1.x - p0.x); s[i] = -(p0.y + (p1.y - p0.y) * t) + 0.5; } setPadSignal(s, "你畫的曲線"); } };
pad.addEventListener("pointerup", finish); pad.addEventListener("pointerleave", finish);
function setPadSignal(s, name) {
  padSignal = s; padDraw(); siftReset();
  const { imfs, residue } = L.emd(s, { maxImf: 6 });
  const rows = imfs.map((imf, k) => ({ y: imf, color: COLORS[k % COLORS.length], label: `IMF ${k + 1}`, right: `平均瞬時頻率 ≈ ${(L.meanFreq(imf, 600 / 6).toFixed(2))} 週 / 秒（設訊號長 6 秒）` }));
  rows.push({ y: residue, color: "#9aa5b8", label: "殘餘趨勢" });
  plotRows($("padImfs"), rows);
  $("padHint").textContent = `${name}：拆成 ${imfs.length} 個 IMF 加 1 個殘餘趨勢。IMF 從最快排到最慢，全部相加會精確還原原訊號。`;
}
function demo(kind) {
  const N = 600, s = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / 100;
    if (kind === 1) s[i] = Math.sin(2 * Math.PI * 0.5 * t) + 0.4 * Math.sin(2 * Math.PI * 4 * t);
    if (kind === 2) s[i] = Math.sin(2 * Math.PI * (1.5 * t + 0.5 * t * t / 6)) + 0.5 * Math.sin(2 * Math.PI * 0.3 * t);
    if (kind === 3) { const g = Math.exp(-((t - 1.5) / 0.35) ** 2) + Math.exp(-((t - 4.2) / 0.4) ** 2); s[i] = 0.8 * Math.sin(2 * Math.PI * 0.6 * t) + g * Math.sin(2 * Math.PI * 7 * t) + 0.1 * L.gauss(); }
  }
  setPadSignal(s, ["", "快波疊慢波", "忽快忽慢（調頻）", "陣發性紡錘波"][kind]);
}
$("padClear").onclick = () => { padPts = []; padSignal = null; padDraw(); setup($("padImfs")); $("padHint").textContent = "畫板已清除。"; siftReset(); };
$("padDemo1").onclick = () => demo(1); $("padDemo2").onclick = () => demo(2); $("padDemo3").onclick = () => demo(3);

// ---------- 實驗 2：篩選步進 ----------
let siftH = null, siftK = 0, siftIter = 0, siftLast = null, siftImfCount = 0;
function siftReset() { siftH = padSignal ? Float64Array.from(padSignal) : null; siftIter = 0; siftLast = null; siftImfCount = 0; siftRender(); }
function siftRender() {
  if (!siftH) { setup($("sift")); $("siftInfo").textContent = "先在第 1 節產生一條訊號。"; return; }
  const s = siftLast || L.siftOnce(siftH);
  if (!s) { plotRows($("sift"), [{ y: siftH, color: "#9aa5b8", label: "殘量已無足夠極值，分解結束" }]); $("siftInfo").textContent = "殘量幾乎單調，EMD 結束。"; return; }
  plotRows($("sift"), [
    { y: siftH, color: "#2b6cb0", label: `第 ${siftImfCount + 1} 個 IMF 的第 ${siftIter} 次篩選前 h`, extra: [{ y: s.up, color: "#e53e3e" }, { y: s.lo, color: "#38a169" }, { y: s.mean, color: "#805ad5", lw: 2 }], points: [{ idx: s.max, color: "#e53e3e" }, { idx: s.min, color: "#38a169" }] },
    { y: s.next, color: "#dd6b20", label: "減去包絡平均後 h − m" }
  ]);
  const ok = s.sd < 0.2 && Math.abs(s.nExt - s.nZc) <= 1;
  $("siftInfo").textContent = `極大值 ${s.max.length} 個、極小值 ${s.min.length} 個；減去平均後零交越 ${s.nZc} 次、極值 ${s.nExt} 個；SD = ${s.sd.toFixed(4)} ${ok ? "→ 已符合 IMF 條件，可抽出 IMF" : "→ 尚未達到 SD < 0.2，繼續篩選"}`;
}
$("siftStep").onclick = () => { if (!siftH) return; const s = L.siftOnce(siftH); if (!s) return; siftH = s.next; siftIter++; siftLast = null; siftRender(); };
$("siftFinish").onclick = () => { if (!siftH) return; for (let i = 0; i < 50; i++) { const s = L.siftOnce(siftH); if (!s) break; siftH = s.next; siftIter++; if (s.sd < 0.2 && Math.abs(s.nExt - s.nZc) <= 1) break; } siftLast = null; siftRender(); };
$("siftNext").onclick = () => { if (!siftH || !padSignal) return; /* 目前 h 就是 IMF；殘量 = 上一殘量 − IMF */ const prev = siftResidue || padSignal; const r = new Float64Array(prev.length); for (let i = 0; i < r.length; i++) r[i] = prev[i] - siftH[i]; siftResidue = r; siftH = Float64Array.from(r); siftImfCount++; siftIter = 0; siftLast = null; siftRender(); };
let siftResidue = null;
$("siftReset").onclick = () => { siftResidue = null; siftReset(); };

// ---------- 實驗 3：連續睡眠深度 ----------
const FS = 100, T = 20, N = FS * T;
let seedBase = 7;
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function synth(d, rem) {
  L.setSeed(seedBase);
  const s = new Float64Array(N);
  const ph = Array.from({ length: 8 }, () => L.rand() * 6.283);
  const alphaA = rem ? 0 : 22 * smooth(0.35, 0.05, d);
  const betaA = 6 * (1 - d) + (rem ? 4 : 0);
  const thetaA = 14 * Math.exp(-((d - 0.3) / 0.15) ** 2) + (rem ? 16 : 0);
  const spinA = rem ? 0 : 30 * Math.exp(-((d - 0.55) / 0.2) ** 2);
  const deltaA = rem ? 8 : 90 * smooth(0.4, 1, d);
  const noiseA = 5 + 6 * (1 - d);
  // 紡錘波陣發門控（每 3–5 秒一陣，長 0.8–1.5 秒）
  const bursts = []; let t0 = 1 + L.rand() * 2; while (t0 < T) { bursts.push([t0, 0.8 + L.rand() * 0.7]); t0 += 3 + L.rand() * 2; }
  const blinks = []; if (d < 0.25 && !rem) { let tb = 1 + L.rand() * 3; while (tb < T) { blinks.push(tb); tb += 3 + L.rand() * 4; } }
  const soF = 0.8;
  for (let i = 0; i < N; i++) {
    const t = i / FS;
    let v = alphaA * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.3 * t + ph[0])) * Math.sin(2 * Math.PI * 10 * t + ph[1]);
    v += betaA * Math.sin(2 * Math.PI * 21 * t + ph[2]) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.7 * t));
    v += thetaA * Math.sin(2 * Math.PI * 6 * t + ph[3] + (rem ? 0.6 * Math.sin(2 * Math.PI * 0.4 * t) : 0));
    let gate = 0; for (const [b0, len] of bursts) if (t >= b0 && t < b0 + len) gate = Math.sin(Math.PI * (t - b0) / len) ** 2;
    const so = 0.5 * (1 + Math.cos(2 * Math.PI * soF * t + ph[4]));
    v += spinA * gate * (0.3 + 0.7 * so) * Math.sin(2 * Math.PI * 13 * t + ph[5]);
    v += deltaA * (0.7 * Math.cos(2 * Math.PI * soF * t + ph[4]) + 0.4 * Math.sin(2 * Math.PI * 1.6 * t + ph[6]));
    for (const tb of blinks) v += 70 * (1 - d / 0.25) * Math.exp(-((t - tb) / 0.12) ** 2);
    v += noiseA * L.gauss();
    s[i] = v;
  }
  return s;
}
let lastImfs = null;
function stageName(d, rem) { return rem ? "REM" : d < 0.15 ? "Wake 清醒" : d < 0.35 ? "N1 淺睡" : d < 0.65 ? "N2" : "N3 深睡"; }
function runSleep() {
  const d = +$("depth").value / 100, rem = $("rem").checked, useE = $("useEemd").checked;
  $("depthLabel").textContent = `${Math.round(d * 100)}（約 ${stageName(d, rem)}）`;
  const x = synth(d, rem);
  const res = useE ? L.eemd(x, 8, 0.2, { maxImf: 8 }) : L.emd(x, { maxImf: 8 });
  const imfs = res.imfs; lastImfs = imfs;
  plotRows($("eegRaw"), [{ y: x, color: "#e8ecf4", label: `合成睡眠腦波（${T} 秒、${FS} Hz、μV）—— ${stageName(d, rem)}` }]);
  const freqs = imfs.map(imf => L.meanFreq(imf, FS));
  const Etot = L.energy(x);
  const rows = imfs.map((imf, k) => ({ y: imf, color: COLORS[k % COLORS.length], label: `IMF ${k + 1}`, right: `${freqs[k].toFixed(1)} Hz · ${bandOf(freqs[k])} · 能量 ${(100 * L.energy(imf) / Etot).toFixed(0)}%`, rightColor: COLORS[k % COLORS.length] }));
  rows.push({ y: res.residue, color: "#9aa5b8", label: "殘餘" });
  plotRows($("eegImfs"), rows);
  // iPDF
  const kurts = imfs.map(L.kurtosis);
  drawKurt(kurts, freqs);
  const fast = new Float64Array(N); imfs.slice(0, 3).forEach(imf => { for (let i = 0; i < N; i++) fast[i] += imf[i]; });
  drawHist(fast);
  const kf = L.kurtosis(fast);
  $("kurtInfo").textContent = `前三個（最快）IMF 相加後的峰度 = ${kf.toFixed(2)}（高斯 = 3）。${kf > 4 ? "明顯超高斯：快尺度活動是陣發、間歇的，這是清醒 / 活躍腦的特徵。" : kf > 3.3 ? "略為超高斯。" : "接近高斯：各尺度活動變得平穩、同步，對應深睡或麻醉。"}`;
  // SWA
  let Esw = 0, delta = new Float64Array(N);
  imfs.forEach((imf, k) => { if (freqs[k] >= 0.5 && freqs[k] < 4) { Esw += L.energy(imf); for (let i = 0; i < N; i++) delta[i] += imf[i]; } });
  const swa = Esw / Etot;
  const { amp } = L.hilbert(delta, FS); let cnt = 0; for (let i = 0; i < N; i++) if (amp[i] > 37.5) cnt++;
  const fracBig = cnt / N; const isN3 = fracBig > 0.2 && !rem;
  drawSwa(swa, fracBig, isN3);
  $("swaInfo").textContent = `EMD 慢波能量比 = ${(100 * swa).toFixed(1)}%（連續）。AASM 式判準：慢波幅度 > 75 μV 的時間佔 ${(100 * fracBig).toFixed(0)}% ${isN3 ? "> 20% → 貼上 N3" : "≤ 20% → 不是 N3"}（二元）。拖動滑桿會發現：標籤在某一點突然翻轉，而慢波量是平滑變化的。`;
  runHhsa(imfs, freqs, d, rem);
}
function drawKurt(kurts, freqs) {
  const cv = $("kurt"), { ctx, w, h } = setup(cv);
  const n = kurts.length, bw = (w - 60) / n, maxK = Math.max(8, ...kurts);
  const sy = v => h - 28 - (Math.min(v, maxK) / maxK) * (h - 50);
  ctx.strokeStyle = "#ffb86b"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(40, sy(3)); ctx.lineTo(w - 10, sy(3)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "#ffb86b"; ctx.font = "11px sans-serif"; ctx.fillText("高斯 = 3", 42, sy(3) - 4);
  kurts.forEach((k, i) => { ctx.fillStyle = COLORS[i % COLORS.length]; const x = 45 + i * bw; ctx.fillRect(x, sy(k), bw * 0.6, h - 28 - sy(k)); ctx.fillStyle = "#e8ecf4"; ctx.fillText(k.toFixed(1), x, sy(k) - 4); ctx.fillStyle = "#9aa5b8"; ctx.fillText(`IMF${i + 1}`, x, h - 14); ctx.fillText(`${freqs[i].toFixed(0)}Hz`, x, h - 3); });
  ctx.fillStyle = "#e8ecf4"; ctx.font = "12px sans-serif"; ctx.fillText("每個 IMF 的峰度（尺度相依 iPDF 的形狀指標）", 10, 14);
}
function drawHist(x) {
  const cv = $("hist"), { ctx, w, h } = setup(cv);
  const { centers, h: hh, gauss } = L.histogram(x, 41, 4);
  const m = Math.max(...hh, ...gauss) * 1.1, bw = (w - 40) / hh.length;
  const sy = v => h - 24 - v / m * (h - 44);
  ctx.fillStyle = "#7cc4ff88"; hh.forEach((v, i) => ctx.fillRect(20 + i * bw, sy(v), bw - 1, h - 24 - sy(v)));
  ctx.beginPath(); ctx.strokeStyle = "#ffb86b"; ctx.lineWidth = 2; gauss.forEach((v, i) => ctx[i ? "lineTo" : "moveTo"](20 + (i + 0.5) * bw, sy(v))); ctx.stroke();
  ctx.fillStyle = "#e8ecf4"; ctx.font = "12px sans-serif"; ctx.fillText("快尺度 IMF（1–3）合成值的機率密度（藍）vs. 同變異數的高斯（橘）", 10, 14);
  ctx.fillStyle = "#9aa5b8"; ctx.font = "11px sans-serif"; [-4, -2, 0, 2, 4].forEach(z => ctx.fillText(`${z}σ`, 20 + (z + 4) / 8 * (w - 40) - 8, h - 8));
}
function drawSwa(swa, frac, isN3) {
  const cv = $("swa"), { ctx, w, h } = setup(cv);
  ctx.font = "12px sans-serif"; ctx.fillStyle = "#e8ecf4";
  ctx.fillText("EMD 慢波能量比（連續）", 10, 22);
  ctx.fillStyle = "#26304a"; ctx.fillRect(10, 30, w - 20, 26);
  ctx.fillStyle = "#7cc4ff"; ctx.fillRect(10, 30, (w - 20) * Math.min(1, swa), 26);
  ctx.fillStyle = "#08131f"; ctx.fillText(`${(100 * swa).toFixed(1)}%`, 16, 48);
  ctx.fillStyle = "#e8ecf4"; ctx.fillText("傳統分期：慢波 > 75 μV 的時間比，門檻 20%（二元）", 10, 90);
  ctx.fillStyle = "#26304a"; ctx.fillRect(10, 98, w - 20, 26);
  ctx.fillStyle = isN3 ? "#ffb86b" : "#9aa5b8"; ctx.fillRect(10, 98, (w - 20) * Math.min(1, frac), 26);
  ctx.strokeStyle = "#ff8fa3"; ctx.beginPath(); ctx.moveTo(10 + (w - 20) * 0.2, 92); ctx.lineTo(10 + (w - 20) * 0.2, 130); ctx.stroke();
  ctx.fillStyle = "#e8ecf4"; ctx.font = "bold 16px sans-serif"; ctx.fillText(isN3 ? "標籤：N3 ✔" : "標籤：非 N3", 10, 165);
  ctx.font = "12px sans-serif"; ctx.fillStyle = "#9aa5b8"; ctx.fillText("同一段腦波，一個給連續數值，一個只給是 / 否。", 10, 188);
}
// ---------- 實驗 4：HHSA ----------
function runHhsa(imfs, freqs, d, rem) {
  let k = -1, best = -1;
  imfs.forEach((imf, i) => { if (freqs[i] >= 10 && freqs[i] <= 17) { const e = L.energy(imf); if (e > best) { best = e; k = i; } } });
  const cv = $("hhsa");
  if (k < 0 || rem || d < 0.3) { plotRows(cv, [{ y: new Float64Array(N), color: "#9aa5b8", label: "目前深度沒有明顯的紡錘波 IMF。把滑桿拉到 N2–N3（約 45–75）並取消 REM。" }]); $("hhsaInfo").textContent = ""; return; }
  const carrier = imfs[k];
  const { amp } = L.hilbert(carrier, FS);
  // 包絡線去均值後做第二層 EMD
  let m = 0; for (const v of amp) m += v; m /= N;
  const env = Float64Array.from(amp);
  const layer2 = L.emd(env, { maxImf: 5 });
  const amFreqs = layer2.imfs.map(im => L.meanFreq(im, FS));
  const rows = [
    { y: carrier, color: COLORS[k % COLORS.length], label: `第一層：IMF ${k + 1}（載波 ${freqs[k].toFixed(1)} Hz，紡錘波）與其 Hilbert 振幅包絡`, extra: [{ y: amp, color: "#ffb86b", lw: 2 }] },
    ...layer2.imfs.map((im, j) => ({ y: im, color: COLORS[(j + 3) % COLORS.length], label: `第二層 IMF ${j + 1}（對包絡線再做 EMD）`, right: `調幅頻率 ≈ ${amFreqs[j].toFixed(2)} Hz`, rightColor: "#ffb86b" }))
  ];
  plotRows(cv, rows);
  let so = -1, soE = -1; layer2.imfs.forEach((im, j) => { if (amFreqs[j] > 0.4 && amFreqs[j] < 1.5) { const e = L.energy(im); if (e > soE) { soE = e; so = j; } } });
  $("hhsaInfo").textContent = so >= 0 ? `HHSA 讀法：載波 ${freqs[k].toFixed(1)} Hz 的紡錘波，其振幅被第二層 IMF ${so + 1}（${amFreqs[so].toFixed(2)} Hz）調控——這就是慢振盪對紡錘波的相位—振幅耦合，在 Holo-Hilbert 譜上是（${freqs[k].toFixed(0)} Hz, ${amFreqs[so].toFixed(1)} Hz）這一點。更慢的第二層 IMF 則反映紡錘波每幾秒一陣的門控。` : "第二層 IMF 中沒有落在 0.4–1.5 Hz 的調幅分量，試著加深睡眠深度。";
}
["depth", "rem", "useEemd"].forEach(id => $(id).addEventListener("input", runSleep));
$("reseed").onclick = () => { seedBase = (seedBase * 31 + 17) % 100000; runSleep(); };

// ---------- 啟動 ----------
window.addEventListener("resize", () => { padDraw(); if (padSignal) setPadSignal(padSignal, "重新繪製"); runSleep(); });
padDraw(); demo(3); runSleep();
