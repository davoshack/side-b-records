// The pressing plant, and then a life on the shelf. Every flaw here is a change to the shape of the
// groove walls or of the disc. None of it is an audio effect: the stylus has to ride over it.
import { TAU, rng } from './dsp.js';
import { grooveRadius, thetaForRadius, R_DISC, R_LOCK } from './geometry.js';

export const CONDITIONS = {
  mint:   { noise: 0.7, dust: 0.04, scratches: 0,    warp: 0.10, offCenter: 0.05 },
  good:   { noise: 1.1, dust: 0.25, scratches: 0.15, warp: 0.30, offCenter: 0.15 },
  played: { noise: 1.6, dust: 0.60, scratches: 0.45, warp: 0.50, offCenter: 0.25 },
  thrift: { noise: 2.6, dust: 1.40, scratches: 1.00, warp: 0.90, offCenter: 0.40 },
};

// Wall roughness (metres). "White" is the grain of the vinyl; "red" is the slow waviness left by
// plating and pressing. Together a silent groove of a good pressing sits near -60 dB re 5 cm/s.
const ROUGH_WHITE = 0.7e-9, ROUGH_RED = 1.3e-9;

export function press(rec, cond = CONDITIONS.good, seed = 7) {
  const { A, B, n, spr, rTab, thetaEnd } = rec;
  const R = rng(seed);
  const metresPerSample = (i) => TAU * grooveRadius(rTab, i * TAU / spr) / spr;

  // 1. roughness, independent on each wall
  const q = cond.noise ?? 1;
  if (q > 0) {
    let s = (Math.imul(seed, 2654435761) >>> 0) || 1;
    const K = Math.sqrt(6) / 65536, leak = Math.exp(-TAU * 12 / rec.fs), w = ROUGH_WHITE * q * K, r = ROUGH_RED * q * K;
    let ra = 0, rb = 0;
    for (let i = 0; i < n; i++) {     // xorshift32; two 16-bit halves summed give a triangular sample
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; ra = ra * leak + r * ((s & 65535) + (s >>> 16) - 65535);
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; rb = rb * leak + r * ((s & 65535) + (s >>> 16) - 65535);
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; A[i] += ra + w * ((s & 65535) + (s >>> 16) - 65535);
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; B[i] += rb + w * ((s & 65535) + (s >>> 16) - 65535);
    }
  }

  // 2. dust: a grain sitting on one wall (sometimes wedged across both)
  const bump = (arr, i, h, hl) => {
    for (let j = -hl; j <= hl; j++) { const k = i + j; if (k >= 0 && k < n) arr[k] += h * 0.5 * (1 + Math.cos(Math.PI * j / hl)); }
  };
  const nDust = Math.round((cond.dust ?? 0) * 5 * n / spr);
  for (let d = 0; d < nDust; d++) {
    const i = R.int(n), size = Math.min(40e-6, 5e-6 * Math.exp(0.7 * R.gauss()));
    const hl = Math.max(2, Math.round(size / metresPerSample(i))), h = size * (0.15 + 0.3 * R()), w = R();
    if (w < 0.8) bump(w < 0.4 ? A : B, i, h, hl); else { bump(A, i, h, hl); bump(B, i, h, hl); }
  }

  // 3. scratches: a line across the disc. Each groove it crosses gets a dent with raised lips,
  //    so the stylus ticks once per turn for as long as the scratch is wide.
  const scratches = [];
  const nScr = Math.round((cond.scratches ?? 0) * 10);
  for (let k = 0; k < nScr; k++) {
    const r0 = 0.062 + R() * 0.07, len = 0.003 + R() * 0.02, phi0 = R() * TAU, slant = (R() - 0.5) * 0.3;
    const depth = (1.2 + 3.5 * R()) * 1e-6, sig = (15 + 25 * R()) * 1e-6;
    scratches.push({ r0, r1: r0 + len, phi0, phi1: phi0 + slant });
    const m0 = Math.floor(thetaForRadius(rTab, r0 + len) / TAU), m1 = Math.ceil(thetaForRadius(rTab, r0) / TAU);
    for (let m = m0; m <= m1; m++) {
      let theta = TAU * m + phi0;
      const rr = grooveRadius(rTab, theta);
      if (rr < r0 || rr > r0 + len) continue;
      theta += slant * (rr - r0) / len;
      if (theta <= 0 || theta >= thetaEnd) continue;
      const i = Math.round(theta * spr / TAU), ds = metresPerSample(i), hl = Math.ceil(4 * sig / ds);
      for (let j = -hl; j <= hl; j++) {
        const kk = i + j; if (kk < 0 || kk >= n) continue;
        const x = j * ds, lip = (Math.abs(x) - 2.2 * sig) / (0.6 * sig);
        const p = depth * (-Math.exp(-x * x / (2 * sig * sig)) + 0.6 * Math.exp(-0.5 * lip * lip));
        A[kk] += p; B[kk] += p;
      }
    }
  }

  // 4. the disc itself: an off-centre spindle hole, and warp that grows toward the rim
  const ecc = (cond.offCenter ?? 0) * 1e-3, ea = R() * TAU, wp = (cond.warp ?? 0) * 1e-3;
  rec.ecc = [ecc * Math.cos(ea), ecc * Math.sin(ea)];
  rec.warp = wp > 0 ? [
    { k: 1, amp: wp * 0.7, ph: R() * TAU }, { k: 2, amp: wp * 0.35, ph: R() * TAU }, { k: 3, amp: wp * 0.12, ph: R() * TAU },
  ] : [];
  rec.scratches = scratches;
  rec.condition = { ...cond };
  return rec;
}

// Height of the disc surface at radius r and disc angle phi.
export function warpHeight(warp, r, phi) {
  let z = 0;
  const t = Math.max(0, (r - R_LOCK) / (R_DISC - R_LOCK));
  for (let i = 0; i < warp.length; i++) z += warp[i].amp * t * t * Math.cos(warp[i].k * phi + warp[i].ph);
  return z;
}

// What the eye sees: for each revolution and each slice of angle, how steeply the walls wiggle.
// Loud passages scatter light differently from quiet ones, which is why you can see the music.
export function modulationMap(rec, cols = 128) {
  const { A, B, n, spr, rTab, thetaEnd } = rec;
  const rows = Math.ceil(thetaEnd / TAU) + 1, per = spr / cols;
  const acc = new Float32Array(rows * cols), data = new Uint8Array(rows * cols);
  for (let i = 0; i + 1 < n; i++) {
    const da = A[i + 1] - A[i], db = B[i + 1] - B[i];
    const rev = (i / spr) | 0, c = ((i - rev * spr) / per) | 0;
    acc[rev * cols + c] += da * da + db * db;
  }
  for (let rw = 0; rw < rows; rw++) {
    const ds = TAU * grooveRadius(rTab, (rw + 0.5) * TAU) / spr;
    for (let c = 0; c < cols; c++) {
      const slope = Math.sqrt(acc[rw * cols + c] / (2 * per)) / ds;
      data[rw * cols + c] = Math.min(255, Math.round(255 * Math.sqrt(slope / 0.45)));
    }
  }
  return { data, cols, rows };
}
