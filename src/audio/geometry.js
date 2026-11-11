// Physical dimensions of the disc and the tonearm. SI units.
// The "deck plane" is seen from above: origin at the spindle, +x to the right, +y away from the
// listener. The platter turns clockwise, so the platter angle grows as the record plays.
import { TAU } from './dsp.js';

export const SPEEDS = { 33: 100 / 3, 45: 45, 78: 78 };
export const omega = (rpm) => TAU * rpm / 60;
export const REV_SECONDS = 1.8;             // one revolution at 33 1/3: what the lathe cuts at

// 12" LP
export const R_DISC = 0.1508;
export const R_LEADIN = 0.1490;
export const R_PROGRAM = 0.1463;
export const R_PROGRAM_MIN = 0.0603;
export const R_LOCK = 0.0532;
export const R_LABEL = 0.050;
export const TAB_PER_REV = 64;              // knots per revolution in the spiral's radius table

// Tonearm: 9.3" effective length, Baerwald nulls at 66.0 / 120.9 mm.
export const ARM_LE = 0.237;
export const ARM_D = Math.sqrt(ARM_LE * ARM_LE - 0.066 * 0.1209);      // pivot -> spindle
export const ARM_BETA = Math.asin((0.066 + 0.1209) / (2 * ARM_LE));    // headshell offset angle
export const PIVOT_ANG = 30 * Math.PI / 180;
export const PIVOT_X = ARM_D * Math.cos(PIVOT_ANG);
export const PIVOT_Y = ARM_D * Math.sin(PIVOT_ANG);

// Arm swing angle that puts the stylus at radius r from the spindle.
export function alphaForRadius(r) {
  const c = (ARM_D * ARM_D + ARM_LE * ARM_LE - r * r) / (2 * ARM_D * ARM_LE);
  return PIVOT_ANG + Math.PI + Math.acos(Math.max(-1, Math.min(1, c)));
}
export const stylusXY = (alpha) => [PIVOT_X + ARM_LE * Math.cos(alpha), PIVOT_Y + ARM_LE * Math.sin(alpha)];
export const radiusForAlpha = (alpha) => Math.hypot(...stylusXY(alpha));
export const ALPHA_REST = alphaForRadius(0.178);
export const ALPHA_MIN = alphaForRadius(0.049);

// Groove centreline radius at unwrapped groove angle theta (Catmull-Rom through the lathe's table).
export function grooveRadius(rTab, theta) {
  const x = theta * (TAB_PER_REV / TAU), n = rTab.length;
  if (x <= 0) return rTab[0];
  if (x >= n - 1) return rTab[n - 1];
  const i = Math.floor(x), f = x - i;
  const p1 = rTab[i], p2 = rTab[i + 1];
  const p0 = i > 0 ? rTab[i - 1] : 2 * p1 - p2;
  const p3 = i + 2 < n ? rTab[i + 2] : 2 * p2 - p1;
  return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
}

// Inverse: the unwrapped groove angle whose centreline sits at radius r.
export function thetaForRadius(rTab, r) {
  let lo = 0, hi = rTab.length - 1;
  if (r >= rTab[0]) return 0;
  if (r <= rTab[hi]) return hi * TAU / TAB_PER_REV;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rTab[m] > r) lo = m; else hi = m; }
  const d = rTab[lo] - rTab[hi];
  return (lo + (d > 0 ? (rTab[lo] - r) / d : 0)) * TAU / TAB_PER_REV;
}
