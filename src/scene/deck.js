// The listening station: a three-in-one "music centre" in a cherry cabinet. Turntable on top under
// a smoked lid, and on the front a speaker grille, a blue LCD, a backlit tuning scale and two fat
// knobs. Beside it, a crate of sleeves to flip through and a stand for the one that is playing.
import { Geo } from '../gl/gl.js';
import { T, RX, RY, RZ, mul, tp } from '../gl/math.js';
import { ARM_LE as LE, ARM_BETA, ALPHA_REST, R_DISC } from '../audio/geometry.js';
import { Z_UP } from '../audio/engine-core.js';
import { PANEL, FASCIA } from './art.js';
import { hex } from './store.js';
import { UNIT, PIVOT, LID, CRATE, STAND, SLEEVE } from './layout.js';

const CHERRY = hex('#8a4526'), PINE = hex('#c8a36a'), BLACK = [0.012, 0.012, 0.013, 0], CHROME = [0.80, 0.81, 0.83, 1], ALU = [0.55, 0.56, 0.58, 1];
const PLASTIC = [0.035, 0.035, 0.038, 0], CREAM = hex('#e9e4d6'), RED = hex('#b3201a');
const CB = Math.cos(ARM_BETA), SB = Math.sin(ARM_BETA);
// where the arm tube meets the headshell, in the arm's frame (+x runs from the pivot to the stylus)
const P3 = [LE - 0.040 * CB, -0.0125, -0.040 * SB];

export const armMatrix = (alpha, lift) => mul(T(...PIVOT), RY(alpha), RZ(lift / LE));
export const lidMatrix = (angle) => mul(T(...LID.hinge), RX(-angle));
export const sleeveInCrate = (i, lift = 0, lean = 0) => mul(T(CRATE.x, 0.014 + lift, CRATE.z + CRATE.front - i * CRATE.step), RX(-CRATE.tilt + lean));
export const sleeveOnStand = () => mul(T(STAND.x, 0, STAND.z), RY(STAND.yaw), T(0, 0.014, 0.034), RX(-STAND.tilt));

export function buildDeck() {
  const { W, D, H, FEET, PLATE, SX, SZ } = UNIT, hw = W / 2, hd = D / 2;
  const wood = new Geo(), dark = new Geo(), platter = new Geo(), arm = new Geo(), lid = new Geo(), panel = new Geo();

  // ---- cabinet ----
  wood.box(-hw, FEET, -hd, hw, PLATE, hd, CHERRY, { py: false });
  const rim = 0.013;
  wood.box(-hw, PLATE, -hd, hw, H, -hd + rim, CHERRY).box(-hw, PLATE, hd - rim, hw, H, hd, CHERRY)
    .box(-hw, PLATE, -hd + rim, -hw + rim, H, hd - rim, CHERRY).box(hw - rim, PLATE, -hd + rim, hw, H, hd - rim, CHERRY);
  dark.quad([-hw + rim, PLATE, hd - rim], [hw - rim, PLATE, hd - rim], [hw - rim, PLATE, -hd + rim], [-hw + rim, PLATE, -hd + rim], [0.02, 0.02, 0.022, 0]);
  for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) dark.at(T(x, 0, z), (g) => g.lathe([[0.02, 0], [0.02, FEET], [0, FEET]], 20, PLASTIC));
  for (const x of [-0.17, 0.17]) dark.box(x - 0.02, H, -hd, x + 0.02, H + 0.006, -hd + 0.012, PLASTIC);          // hinges
  // side speaker grilles, as on the real things
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) dark.box(s * hw - 0.0008, 0.045 + i * 0.009, -0.06, s * hw + 0.0008, 0.050 + i * 0.009, 0.06, BLACK);

  // ---- platter, mat, spindle (authored around the spindle axis) ----
  platter.lathe([[0.150, PLATE], [0.1525, PLATE + 0.002], [0.1525, 0.1745], [0.1505, 0.1765], [0.1475, 0.1765]], 128, ALU);
  platter.lathe([[0.0036, 0.1785], [0.0036, 0.1905], [0.0026, 0.1930], [0, 0.1930]], 24, CHROME);
  dark.at(T(SX, 0, SZ), (g) => g.lathe([[0.1475, 0.1765], [0.1475, 0.1785], [0, 0.1785]], 96, [0.012, 0.012, 0.012, 0]));

  // ---- tonearm tower and rest (fixed) ----
  dark.at(T(PIVOT[0], 0, PIVOT[2]), (g) => g.lathe([[0.027, PLATE], [0.027, PLATE + 0.006], [0.017, PLATE + 0.009], [0.017, PIVOT[1] - 0.013], [0, PIVOT[1] - 0.013]], 40, [0.10, 0.10, 0.105, 1]));
  const rest = tp(armMatrix(ALPHA_REST, Z_UP), [P3[0] * 0.66, P3[1] * 0.66, P3[2] * 0.66]);
  dark.at(T(rest[0], 0, rest[2]), (g) => {
    g.lathe([[0.0045, PLATE], [0.0045, rest[1] - 0.006], [0.0085, rest[1] - 0.006], [0.0085, rest[1] - 0.0042], [0, rest[1] - 0.0042]], 20, PLASTIC);
  });

  // ---- tonearm (arm frame) ----
  arm.lathe([[0.0125, -0.012], [0.0125, 0.010], [0.0105, 0.0125], [0, 0.0125]], 28, [0.12, 0.12, 0.125, 1]);
  arm.tube([[-0.075, 0, 0], [0, 0, 0], P3], 0.0038, 16, CHROME);
  arm.at(mul(T(-0.060, 0, 0), RZ(Math.PI / 2)), (g) => g.lathe([[0, -0.021], [0.0160, -0.021], [0.0172, -0.019], [0.0172, 0.019], [0.0160, 0.021], [0, 0.021]], 32, [0.20, 0.20, 0.21, 1]));
  arm.at(mul(T(LE, 0, 0), RY(-ARM_BETA)), (g) => {
    g.at(mul(T(-0.040, -0.0125, 0), RZ(Math.PI / 2)), (c) => c.lathe([[0, -0.006], [0.0056, -0.006], [0.0056, 0.006], [0, 0.006]], 16, ALU));      // collar
    g.box(-0.040, -0.0135, -0.0092, 0.011, -0.0117, 0.0092, ALU);                                                                               // headshell
    g.box(-0.025, -0.0252, -0.0070, 0.002, -0.0135, 0.0070, PLASTIC);                                                                            // cartridge
    g.box(-0.004, -0.0272, -0.0060, 0.007, -0.0212, 0.0060, RED);                                                                                // stylus carrier
    g.tube([[-0.006, -0.0262, 0], [0, -0.0300, 0]], 0.0004, 6, CHROME);                                                                           // cantilever
    g.tube([[0.004, -0.0126, 0.009], [0.006, -0.0126, 0.022], [0.009, -0.0070, 0.031]], 0.0012, 8, CHROME);                                       // finger lift
  });

  // ---- lid (hinge frame): five panes of smoked acrylic, with the polished edges catching more light ----
  const lc = [1, 1, 1, 0], le = [0.028, 0.022, 0.018, 0], lh = LID.h, e = 0.0035, lidFrame = new Geo();
  lid.quad([-hw, lh, D], [hw, lh, D], [hw, lh, 0], [-hw, lh, 0], lc)
    .quad([-hw, 0, D], [hw, 0, D], [hw, lh, D], [-hw, lh, D], lc).quad([hw, 0, 0], [-hw, 0, 0], [-hw, lh, 0], [hw, lh, 0], lc)
    .quad([-hw, 0, 0], [-hw, 0, D], [-hw, lh, D], [-hw, lh, 0], lc).quad([hw, 0, D], [hw, 0, 0], [hw, lh, 0], [hw, lh, D], lc);
  lidFrame.box(-hw, lh - e, D - e, hw, lh, D, le).box(-hw, lh - e, 0, hw, lh, e, le).box(-hw, lh - e, e, -hw + e, lh, D - e, le).box(hw - e, lh - e, e, hw, lh, D - e, le)
    .box(-hw, 0, D - e, hw, e, D, le).box(-hw, 0, e, -hw + e, e, D - e, le).box(hw - e, 0, e, hw, e, D - e, le);
  for (const x of [-hw, hw - e]) lidFrame.box(x, e, D - e, x + e, lh - e, D, le).box(x, e, 0, x + e, lh - e, e, le);

  // ---- front panel ----
  const zf = hd + 0.0006;
  panel.quad([FASCIA.x0, FASCIA.y0, zf], [FASCIA.x1, FASCIA.y0, zf], [FASCIA.x1, FASCIA.y1, zf], [FASCIA.x0, FASCIA.y1, zf], [1, 1, 1, 1]);
  const win = (w) => new Geo().quad([w.x0, w.y0, zf + 0.0004], [w.x1, w.y0, zf + 0.0004], [w.x1, w.y1, zf + 0.0004], [w.x0, w.y1, zf + 0.0004], [0.02, 0.02, 0.02, 0]);
  const knob = new Geo().at(RX(Math.PI / 2), (g) => g.lathe([[0.0245, 0], [0.0245, 0.003], [0.0225, 0.0045], [0.0225, 0.015], [0.0205, 0.017], [0, 0.017]], 48, [0.62, 0.63, 0.65, 1]));
  knob.box(-0.0013, 0.009, 0.0171, 0.0013, 0.0205, 0.0176, CREAM);
  for (let i = 0; i < 24; i++) knob.at(RZ(i * Math.PI / 12), (g) => g.box(-0.0008, 0.0224, 0.005, 0.0008, 0.0232, 0.0148, [0.25, 0.25, 0.26, 1]));   // grip ribs
  const b0 = PANEL.buttons[0], button = new Geo().box(-b0.w / 2, -b0.h / 2, 0, b0.w / 2, b0.h / 2, 0.0045, [0.42, 0.43, 0.45, 1]);
  const needle = new Geo().box(-0.0007, PANEL.dial.y0, zf + 0.0006, 0.0007, PANEL.dial.y1, zf + 0.0012, [1, 0.12, 0.06, 0]);

  // ---- the crate ----
  const { x: cx, z: cz, w: cw, d: cd, h: ch } = CRATE, x0 = cx - cw / 2, x1 = cx + cw / 2, z0 = cz - cd / 2, z1 = cz + cd / 2, t = 0.011;
  wood.box(x0, 0, z0, x1, 0.012, z1, PINE);
  for (const [px, pz] of [[x0, z0], [x1 - 0.022, z0], [x0, z1 - 0.022], [x1 - 0.022, z1 - 0.022]]) wood.box(px, 0.012, pz, px + 0.022, ch, pz + 0.022, PINE);
  for (let i = 0; i < 3; i++) {
    const y0 = 0.022 + i * 0.06, y1 = y0 + 0.044, k = [PINE[0] * (0.9 + 0.08 * i), PINE[1] * (0.9 + 0.08 * i), PINE[2] * (0.9 + 0.08 * i), 0];
    wood.box(x0 + 0.004, y0, z1 - t, x1 - 0.004, y1, z1, k).box(x0 + 0.004, y0, z0, x1 - 0.004, y1, z0 + t, k)
      .box(x0, y0, z0 + 0.004, x0 + t, y1, z1 - 0.004, k).box(x1 - t, y0, z0 + 0.004, x1, y1, z1 - 0.004, k);
  }
  // ---- the stand ----
  wood.at(mul(T(STAND.x, 0, STAND.z), RY(STAND.yaw)), (g) => {
    g.box(-0.17, 0, -0.07, 0.17, 0.014, 0.06, PINE).box(-0.17, 0.014, 0.046, 0.17, 0.034, 0.058, PINE);
    g.at(mul(T(0, 0.014, -0.02), RX(-STAND.tilt)), (s) => s.box(-0.02, 0, -0.012, 0.02, 0.27, -0.003, PINE));
  });

  // ---- a sleeve: cover on the front, plain card everywhere else ----
  const hs = SLEEVE / 2;
  const sleeve = new Geo().box(-hs, 0, -0.0022, hs, SLEEVE, 0.0022, CREAM, { pz: { col: [1, 1, 1, 1], uv: [0, 0, 1, 1] }, nz: { col: hex('#cfc8b6') } });
  // ---- the record: playing surface, and the rim ----
  const disc = new Geo().annulus(0.0036, R_DISC, 0, 40, 180);
  const edge = new Geo().lathe([[R_DISC - 0.0004, -0.0022], [R_DISC, -0.0016], [R_DISC, -0.0004], [R_DISC - 0.0004, 0]], 128, [0.008, 0.008, 0.008, 0]);

  return { wood, dark, platter, arm, lid, lidFrame, panel, lcd: win(PANEL.lcd), dial: win(PANEL.dial), knob, button, needle, sleeve, disc, edge };
}
