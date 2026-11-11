// Where things stand on the counter. World origin is the counter top under the middle of the unit;
// x right, y up, z toward the listener.
import { PIVOT_X, PIVOT_Y } from '../audio/geometry.js';

export const UNIT = { W: 0.50, D: 0.38, H: 0.160, FEET: 0.012, PLATE: 0.157, SX: -0.045, SZ: 0.005, REC_Y: 0.1805, PIVOT_H: 0.030 };
export const SPINDLE = [UNIT.SX, UNIT.REC_Y, UNIT.SZ];
export const PIVOT = [UNIT.SX + PIVOT_X, UNIT.REC_Y + UNIT.PIVOT_H, UNIT.SZ - PIVOT_Y];
export const LID = { hinge: [0, 0.162, -0.19], open: 66 * Math.PI / 180, h: 0.085 };

// deck plane (origin at the spindle, x right, y away from the listener) <-> world
export const planeToWorld = (px, py, y = UNIT.REC_Y) => [UNIT.SX + px, y, UNIT.SZ - py];
export const worldToPlane = (x, z) => [x - UNIT.SX, UNIT.SZ - z];

// `step` is the gap between sleeves, `rise` how much higher each one behind sits (so every top edge can be grabbed)
export const CRATE = { x: -0.565, z: 0.0, w: 0.37, d: 0.31, h: 0.19, tilt: 9 * Math.PI / 180, step: 0.03, front: 0.12, rise: 0.015 };
export const STAND = { x: 0.535, z: -0.05, yaw: -0.32, tilt: 0.2 };
export const SLEEVE = 0.315;
