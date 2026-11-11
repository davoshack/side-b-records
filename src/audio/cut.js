// The lathe. Audio goes in; the shape of a groove comes out.
//
// A[i] and B[i] are the displacements (metres) of the two walls of a 45/45 stereo groove, one sample
// per step of groove angle: index i sits at unwrapped angle 2*pi*i/spr. Left lives on wall A, right on
// wall B; the stylus sees (A+B)/sqrt2 as sideways motion and (A-B)/sqrt2 as up-and-down motion.
// Alongside the walls comes the spiral itself: a table of centreline radius against angle.
import { TAU, onePole, riaa } from './dsp.js';
import { REV_SECONDS, R_LEADIN, R_PROGRAM, R_PROGRAM_MIN, R_LOCK, TAB_PER_REV } from './geometry.js';

const IS2 = Math.SQRT1_2;

// Cutting curve (inverse RIAA) then integration: sample values -> wall velocity -> wall displacement.
// Above ~2.5 kHz the cutter's acceleration is limited, as a real lathe's is, so that no stylus is asked
// to trace a wall that curves tighter than its own tip.
function emphasise(x, fs, Vfs, aMax) {
  const n = x.length, { g, z2, p1, p3 } = riaa(fs);
  const a1 = p1 + p3, a2 = p1 * p3;
  let x1 = 0, x2 = 0, u = 0;
  for (let i = 0; i < n; i++) {                    // x becomes wall velocity (m/s)
    const v = x[i];
    u = (v - a1 * x1 + a2 * x2) / g + z2 * u;
    x2 = x1; x1 = v; x[i] = Vfs * u;
  }
  const hi = new Float32Array(n), gain = new Float32Array(n), k = onePole(2500, fs);
  let lo = 0, hp = 0, limited = false;
  for (let i = 0; i < n; i++) {
    lo += k * (x[i] - lo);
    const h = x[i] - lo, acc = Math.abs(h - hp) * fs;
    hi[i] = h; hp = h;
    gain[i] = acc > aMax ? aMax / acc : 1;
    if (acc > aMax) limited = true;
  }
  if (limited) {
    const ka = onePole(1 / 0.0006, fs), kr = onePole(1 / 0.025, fs);
    let s = 1;
    for (let i = n - 1; i >= 0; i--) { s = Math.min(gain[i], s + (1 - s) * ka); gain[i] = s; }   // look-ahead
    s = 1;
    for (let i = 0; i < n; i++) { s = Math.min(gain[i], s + (1 - s) * kr); x[i] -= hi[i] * (1 - s); }
  }
  const leak = Math.exp(-TAU * 4 / fs);
  let d = 0;
  for (let i = 0; i < n; i++) { d = leak * d + x[i] / fs; x[i] = d; }
}

// tracks: [{ L, R?, title }] at sample rate fs.
export function cut(tracks, fs, o = {}) {
  const spr = Math.round(fs * REV_SECONDS);
  const cutPeak = o.cutPeak ?? 0.12;               // wall velocity (m/s) of a full-scale 1 kHz tone
  const lead = Math.round(2.5 * spr), gap = Math.round(1.6 * spr), tail = Math.round(1.2 * spr);
  let P = lead + tail + gap * Math.max(0, tracks.length - 1);
  for (const t of tracks) P += t.L.length;
  const alloc = P + Math.ceil(34 * spr);            // room for the lead-out spiral and the locked groove
  const A = new Float32Array(alloc), B = new Float32Array(alloc);
  const marks = [];
  let pos = lead, peak = 1e-4;
  for (const t of tracks) {
    const R = t.R || t.L;
    A.set(t.L, pos); B.set(R, pos);
    for (let i = 0; i < t.L.length; i++) { const a = Math.abs(t.L[i]), b = Math.abs(R[i]); if (a > peak) peak = a; if (b > peak) peak = b; }
    marks.push({ title: t.title || '', i0: pos, i1: pos + t.L.length });
    pos += t.L.length + gap;
  }
  const xa = A.subarray(0, P), xb = B.subarray(0, P), norm = (o.level ?? 0.9) / peak;

  // Subsonic filter, and the "elliptical equaliser": bass is summed to mono so it cuts sideways,
  // where there is room, and not vertically, where a loud bass note would lift the cutter out.
  const k8 = onePole(8, fs), ke = onePole(o.ellipticalHz ?? 140, fs);
  let la = 0, lb = 0, ls = 0;
  for (let i = 0; i < P; i++) {
    const a = xa[i] * norm, b = xb[i] * norm;
    la += k8 * (a - la); lb += k8 * (b - lb);
    const l = a - la, r = b - lb, m = (l + r) * 0.5;
    let s = (l - r) * 0.5; ls += ke * (s - ls); s -= ls;
    xa[i] = m + s; xb[i] = m - s;
  }
  emphasise(xa, fs, cutPeak, o.aMax ?? 5000);
  emphasise(xb, fs, cutPeak, o.aMax ?? 5000);

  // Variable pitch: each turn sits as close to the last as the two can stand, loud passages get
  // more land, the gaps between tracks get a visible band, and a short side is spread out.
  const revs = Math.ceil(P / spr);
  const exc = new Float64Array(revs + 2);
  for (let i = 0; i < P; i++) {
    const e = Math.abs(xa[i] + xb[i]) * IS2, n = (i / spr) | 0;
    if (e > exc[n]) exc[n] = e;
  }
  const pitch = new Float64Array(revs), gapRev = new Uint8Array(revs + 1);
  for (let m = 0; m + 1 < marks.length; m++) gapRev[Math.floor((marks[m].i1 + gap * 0.3) / spr)] = 1;
  let need = 0;
  for (let n = 0; n < revs; n++) {
    if (n < 2) { pitch[n] = (R_LEADIN - R_PROGRAM) / 2; continue; }
    pitch[n] = 78e-6 + exc[n] + exc[n + 1] + (gapRev[n] ? 0.7e-3 : 0);
    need += pitch[n];
  }
  const room = R_PROGRAM - R_PROGRAM_MIN;
  const extra = Math.max(0, Math.min(o.maxExtra ?? 420e-6, (room * (o.fill ?? 0.9) - need) / Math.max(1, revs - 2)));
  let used = revs, acc = 0, truncated = false;
  for (let n = 2; n < revs; n++) {
    pitch[n] += extra; acc += pitch[n];
    if (acc > room) { used = n; truncated = true; break; }
  }
  if (truncated) P = Math.floor(used * spr);

  // Radius table: programme, a fast lead-out spiral, then the locked groove (a closed circle).
  let rEnd = R_LEADIN;
  for (let n = 0; n < used; n++) rEnd -= pitch[n];
  const loRevs = Math.max(2, Math.ceil((rEnd - R_LOCK) / 5e-3));
  const progKnots = Math.ceil(P / spr * TAB_PER_REV), loKnots = loRevs * TAB_PER_REV, lockKnots = Math.round(1.5 * TAB_PER_REV);
  const nK = progKnots + loKnots + lockKnots + 1;
  const pk = new Float64Array(nK), tmp = new Float64Array(nK), rTab = new Float64Array(nK);
  let loPitch = (rEnd - R_LOCK) / loRevs;
  for (let iter = 0; iter < 3; iter++) {
    for (let k = 0; k < nK; k++) {
      pk[k] = k < progKnots ? pitch[Math.min(used - 1, (k / TAB_PER_REV) | 0)] : k < progKnots + loKnots ? loPitch : 0;
    }
    for (let pass = 0; pass < 2; pass++) {          // soften the corners where the pitch changes
      const s = pass ? tmp : pk, d = pass ? pk : tmp, h = 8;
      for (let k = 0; k < nK; k++) {
        let a = 0;
        for (let j = -h; j <= h; j++) { const q = k + j; a += q < 0 ? s[0] : q >= nK ? 0 : s[q]; }
        d[k] = a / (2 * h + 1);
      }
    }
    let r = R_LEADIN;
    for (let k = 0; k < nK; k++) { rTab[k] = r; r -= pk[k] / TAB_PER_REV; }
    loPitch += (rTab[nK - 1] - R_LOCK) / loRevs;
  }
  const thetaEnd = (nK - 1) * TAU / TAB_PER_REV;
  const n = Math.min(alloc, Math.ceil(thetaEnd * spr / TAU));
  if (truncated) { A.fill(0, P, n); B.fill(0, P, n); }
  return {
    fs, spr, n, A: A.subarray(0, n), B: B.subarray(0, n), rTab, thetaEnd, thetaLock: thetaEnd - TAU,
    Vfs: cutPeak, truncated,
    tracks: marks.filter((m) => m.i0 < P).map((m) => ({
      title: m.title, theta0: m.i0 * TAU / spr, theta1: Math.min(m.i1, P) * TAU / spr,
    })),
  };
}
