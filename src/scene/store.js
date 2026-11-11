// The shop: one long room. The counter with the listening station is at the front; an aisle runs
// away from it between two islands of record bins, more bins line the side walls, and the back wall
// is face-out sleeves under a neon sign. All of it is static and built once into four meshes.
import { Geo } from '../gl/gl.js';
import { rng } from '../audio/dsp.js';
import { SIGN as SIGN_ID } from './art.js';

export const FLOOR = -0.92, CEIL = 2.1, HALF_W = 4.4, Z_BACK = -9.5, Z_FRONT = 3.5;

// sRGB hex -> linear rgb (+ the material knob in alpha)
export const hex = (h, a = 0) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255) ** 2.2).concat(a); };
const dim = (c, k) => [c[0] * k, c[1] * k, c[2] * k, c[3]];
const OAK = hex('#c9a468'), OAK_D = hex('#8d6a3c'), WALNUT = hex('#5b3d26'), WALL = hex('#2b2c30'), EDGE = hex('#e9e4d6');

export function buildStore(atlas) {
  const A = new Geo(), W = new Geo(), F = new Geo(), L = new Geo(), N = new Geo();
  const R = rng(1977);
  const cover = () => atlas.cover(R.int(atlas.covers));

  // ---- shell ----
  F.quad([-HALF_W, FLOOR, Z_FRONT], [HALF_W, FLOOR, Z_FRONT], [HALF_W, FLOOR, Z_BACK], [-HALF_W, FLOOR, Z_BACK], hex('#3a3d44'));
  A.quad([-HALF_W, CEIL + 0.1, Z_BACK], [HALF_W, CEIL + 0.1, Z_BACK], [HALF_W, CEIL + 0.1, Z_FRONT], [-HALF_W, CEIL + 0.1, Z_FRONT], hex('#1c1210'));
  A.quad([-HALF_W, FLOOR, Z_BACK], [HALF_W, FLOOR, Z_BACK], [HALF_W, CEIL + 0.1, Z_BACK], [-HALF_W, CEIL + 0.1, Z_BACK], WALL);
  A.quad([-HALF_W, FLOOR, Z_FRONT], [-HALF_W, FLOOR, Z_BACK], [-HALF_W, CEIL + 0.1, Z_BACK], [-HALF_W, CEIL + 0.1, Z_FRONT], WALL);
  A.quad([HALF_W, FLOOR, Z_BACK], [HALF_W, FLOOR, Z_FRONT], [HALF_W, CEIL + 0.1, Z_FRONT], [HALF_W, CEIL + 0.1, Z_BACK], WALL);
  A.quad([HALF_W, FLOOR, Z_FRONT], [-HALF_W, FLOOR, Z_FRONT], [-HALF_W, CEIL + 0.1, Z_FRONT], [HALF_W, CEIL + 0.1, Z_FRONT], WALL);

  // ---- lights: the positions match the reflections the shaders draw ----
  for (let kx = -3; kx < 3; kx++) for (let kz = -4; kz <= 0; kz++) {
    const x = (kx + 0.5) * 1.6, z = (kz + 0.5) * 2.4;
    A.box(x - 0.11, CEIL - 0.015, z - 0.66, x + 0.11, CEIL + 0.06, z + 0.66, hex('#2e2e2e'));
    L.box(x - 0.045, CEIL - 0.05, z - 0.6, x + 0.045, CEIL - 0.015, z + 0.6, [1, 1.04, 1.08, 0]);
  }

  // ---- a sleeve standing in a bin, leaning back against the ones behind it ----
  const sleeve = (xbot, ybot, zz, s, lean, h = 0.315) => {
    const w = 0.315, xt = xbot - s * Math.sin(lean) * h, yt = ybot + Math.cos(lean) * h;
    const zA = s > 0 ? zz : zz - w, zB = s > 0 ? zz - w : zz, k = 0.8 + 0.25 * R();
    A.quad([xbot, ybot, zA], [xbot, ybot, zB], [xt, yt, zB], [xt, yt, zA], [k, k, k, 1], cover());
    A.quad([xt, yt, zA], [xt, yt, zB], [xt - s * 0.006, yt - 0.001, zB], [xt - s * 0.006, yt - 0.001, zA], dim(EDGE, 0.7 + 0.3 * R()));
    return [xt, yt, zA, zB];
  };

  // ---- one side of a bin: a trough of sleeves facing the aisle (s = +1 faces +x) ----
  const binSide = (xb, s, z0, z1, tone = OAK) => {
    const xf = xb + s * 0.56, lo = Math.min(xb, xf), hi = Math.max(xb, xf), top = FLOOR + 0.70;
    W.box(lo, FLOOR + 0.09, z1, hi, top, z0, dim(tone, 0.8));
    A.box(lo + 0.03, FLOOR, z1 + 0.02, hi - 0.03, FLOOR + 0.09, z0 - 0.02, hex('#121212'));
    W.box(Math.min(xf, xf - s * 0.022), top, z1, Math.max(xf, xf - s * 0.022), top + 0.105, z0, tone);            // front lip
    W.box(Math.min(xb, xb + s * 0.02), top, z1, Math.max(xb, xb + s * 0.02), top + 0.40, z0, dim(tone, 0.85));     // back board
    for (const z of [z0, z1]) W.box(lo, top, z - 0.012, hi, top + 0.26, z + 0.012, tone);                           // end caps
    let stack = 0;
    for (let z = z0 - 0.03; z - 0.33 > z1; z -= 0.345, stack++) {
      const n = 6 + R.int(8), card = R() < 0.55 ? 2 + R.int(3) : -1;
      for (let k = 0; k < n; k++) {
        const lean = (9 + k * 0.6 + R() * 2.5) * Math.PI / 180, xbot = xb + s * (0.05 + k * 0.035 + R() * 0.005);
        const [xt, yt, zA, zB] = sleeve(xbot, top + 0.012, z - 0.006 - R() * 0.014, s, lean, R() < 0.12 ? 0.305 : 0.315);
        if (k === card) {                                                                                           // genre divider
          const up = 0.075, dx = -s * Math.sin(lean) * up, dy = Math.cos(lean) * up, e = s * 0.004;
          const id = R() < 0.18 ? SIGN_ID.SALE + R.int(2) : R.int(SIGN_ID.GENRES);
          A.quad([xt + e, yt, zA], [xt + e, yt, zB], [xt + e + dx, yt + dy, zB], [xt + e + dx, yt + dy, zA], [1, 1, 1, 1], atlas.sign(id));
        }
      }
      W.box(lo + 0.02, top, z - 0.342, hi - 0.02, top + 0.2, z - 0.336, dim(tone, 0.9));                             // divider between stacks
    }
  };
  for (const cx of [-1.3, 1.3]) { binSide(cx + 0.012, 1, -1.6, -8.4); binSide(cx - 0.012, -1, -1.6, -8.4); }
  binSide(-HALF_W + 0.03, 1, -0.6, -9.0, OAK_D); binSide(HALF_W - 0.03, -1, -0.6, -9.0, OAK_D);

  // ---- back wall: face-out sleeves on ledges, a low cabinet, and the sign ----
  W.box(-3.7, FLOOR, Z_BACK, 3.7, -0.36, Z_BACK + 0.42, dim(WALNUT, 0.9));
  for (let row = 0; row < 4; row++) {
    const y0 = -0.30 + row * 0.365, z = Z_BACK + 0.05;
    W.box(-3.75, y0 - 0.022, Z_BACK, 3.75, y0, Z_BACK + 0.085, OAK_D);
    for (let x = -3.7; x < 3.4; x += 0.342) {
      if (row === 3 && Math.abs(x + 0.16) < 2.15) continue;                                                         // leave room for the sign
      const k = 0.85 + 0.2 * R();
      A.quad([x, y0 + 0.002, z + 0.02], [x + 0.315, y0 + 0.002, z + 0.02], [x + 0.315, y0 + 0.315, z], [x, y0 + 0.315, z], [k, k, k, 1], cover());
    }
  }
  W.box(-1.95, 1.07, Z_BACK, 1.95, 1.79, Z_BACK + 0.06, dim(WALNUT, 0.55));
  N.quad([-1.8, 1.12, Z_BACK + 0.07], [1.8, 1.12, Z_BACK + 0.07], [1.8, 1.74, Z_BACK + 0.07], [-1.8, 1.74, Z_BACK + 0.07], [0.03, 0.02, 0.02, 0], [0.06, 0.1, 0.94, 0.9]);

  // ---- side walls: posters, and a rail of sleeves above the bins ----
  for (const s of [-1, 1]) {
    const x = s * (HALF_W - 0.012);
    for (let z = -0.8; z > -9.0; z -= 0.342) {
      const k = 0.8 + 0.25 * R(), zA = s < 0 ? z : z - 0.315, zB = s < 0 ? z - 0.315 : z;
      A.quad([x, 0.62, zA], [x, 0.62, zB], [x, 0.935, zB], [x, 0.935, zA], [k, k, k, 1], cover());
    }
    W.box(Math.min(x, x - s * 0.07), 0.595, -9.1, Math.max(x, x - s * 0.07), 0.62, -0.7, OAK_D);
    for (let z = -1.3; z > -8.6; z -= 1.25) {
      const sz = 0.75 + 0.3 * R(), y = 1.12 + 0.1 * R(), zA = s < 0 ? z : z - sz, zB = s < 0 ? z - sz : z;
      A.quad([x - s * 0.004, y, zA], [x - s * 0.004, y, zB], [x - s * 0.004, y + sz, zB], [x - s * 0.004, y + sz, zA], [0.9, 0.9, 0.9, 1], cover());
    }
  }

  // ---- the counter ----
  W.box(-1.5, -0.05, -0.47, 1.5, 0, 0.55, hex('#b98a52'));
  W.box(-1.46, FLOOR, -0.43, 1.46, -0.05, 0.50, dim(WALNUT, 0.8));
  // a pile of sleeves someone has been through, and a sale card
  for (let k = 0; k < 7; k++) {
    const y = k * 0.0045, a = (R() - 0.5) * 0.35, c = Math.cos(a), sn = Math.sin(a), cx = 1.02 + (R() - 0.5) * 0.02, cz = -0.16 + (R() - 0.5) * 0.02, h = 0.1575;
    const p = (u, v) => [cx + u * c - v * sn, y + 0.0045, cz + u * sn + v * c];
    A.quad(p(-h, h), p(h, h), p(h, -h), p(-h, -h), [1, 1, 1, 1], cover());
    for (const [u0, v0, u1, v1] of [[-h, h, h, h], [h, h, h, -h], [h, -h, -h, -h], [-h, -h, -h, h]]) {
      const a0 = p(u0, v0), a1 = p(u1, v1);
      A.quad([a0[0], y, a0[2]], [a1[0], y, a1[2]], a1, a0, dim(EDGE, 0.8));
    }
  }
  return { atlas: A, wood: W, floor: F, lights: L, neon: N };
}
