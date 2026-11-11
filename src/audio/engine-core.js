// The deck: a platter with inertia, a tonearm on a pivot, and a stylus tip that rides the groove.
//
// Nothing here plays an audio file. Each output sample is the voltage a magnetic cartridge would
// produce: the velocity of the tip relative to the cartridge body, on two axes 45 degrees apart,
// followed by the preamp's RIAA curve. The tip goes where the pressed walls put it; the body hangs
// from the tip on the cantilever's spring and has the whole arm's mass behind it. So speed changes
// bend the pitch, a warp pumps the arm at its 10 Hz resonance, a scratch ticks once a turn, a hard
// knock throws the tip into the next groove, and a hand on the record plays it backwards.
import { TAU, onePole, riaa, rng } from './dsp.js';
import {
  ARM_LE as LE, PIVOT_X as PX, PIVOT_Y as PY, ALPHA_REST, ALPHA_MIN, R_DISC, R_LOCK,
  grooveRadius, thetaForRadius, omega, SPEEDS,
} from './geometry.js';
import { warpHeight } from './press.js';

const IS2 = Math.SQRT1_2;
export const Z_UP = 6e-3;                         // how far the cue lever lifts the tip
const V_UP = 0.03, V_DOWN = 0.006;                // cue lever speeds (m/s)
const KC = 83, CC = 0.42, M_EFF = 0.018;          // cantilever stiffness (N/m) and damping, arm effective mass (kg)
const VTF = 0.02;                                 // tracking force (N): about 2 grams
const HOLD = VTF / KC;                            // deflection at which the groove can no longer hold the tip
const IH = M_EFF * LE * LE;
const WH = 45;                                    // stiffness of a hand (or the auto mechanism) on the arm
const SLEW = 0.7;                                 // fastest the tip can move relative to the body (m/s)
const CATCH = 45e-6;                              // how close a groove must be before the tip drops into it
const A_SCAN = 3.5e-6;                            // length of the tip's contact patch along the groove

// 4-point Hermite read of a wall: value in hv, slope per index step in hs.
let hv = 0, hs = 0;
function wall(a, n, pos) {
  const i = Math.floor(pos);
  if (i < 1 || i + 2 >= n) { hv = 0; hs = 0; return; }
  const f = pos - i, y0 = a[i - 1], y1 = a[i], y2 = a[i + 1], y3 = a[i + 2];
  const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  hv = ((c3 * f + c2) * f + c1) * f + y1;
  hs = (3 * c3 * f + 2 * c2) * f + c1;
}

// Where the centre of a round tip of radius R sits when it rests on the wall at `pos`. It touches the
// wall uphill of its own centre, so it reads the wall slightly early going up and slightly late going
// down. That is tracing distortion, and it grows toward the label, where the same music is packed
// into less vinyl. h is metres of groove per index step.
function trace(a, n, pos, h, R) {
  wall(a, n, pos);
  let s = hs / h;
  wall(a, n, pos + R * s / Math.sqrt(1 + s * s) / h);
  s = hs / h;
  const c = 1 / Math.sqrt(1 + s * s);
  wall(a, n, pos + R * s * c / h);
  return hv - R * (1 - c);
}

export class Deck {
  constructor(fs, seed = 1) {
    this.fs = fs;
    this.rand = rng(seed);
    this.rec = null;
    this.tipR = 8e-6;                              // scanning radius of the stylus (elliptical); 16e-6 is a conical
    this.gain = 1;
    // platter
    this.thp = 0; this.wp = 0; this.motor = false; this.wSet = omega(SPEEDS[33]); this.drift = 0; this.t = 0;
    this.handOn = false; this.handT = 0;
    // arm
    this.al = ALPHA_REST; this.ald = 0; this.armHeld = false; this.armT = ALPHA_REST;
    this.auto = 0; this.autoAl = ALPHA_REST; this.autoDown = false;
    this.cueUp = true; this.zc = Z_UP;
    // stylus
    this.down = false; this.air = false; this.inG = false; this.lastGn = null; this.gn = 0; this.seat = 0; this.theta = 0; this.r = 0;
    this.xi = 0; this.ze = 0; this.zb = 0; this.zbd = 0; this.fA = 0; this.fB = 0;
    this.kickV = 0; this.kickL = 0;
    // preamp
    const k = riaa(fs);
    this.rg = k.g; this.rz = k.z2; this.ra1 = k.p1 + k.p3; this.ra2 = k.p1 * k.p3;
    this.f = new Float64Array(12);
    this.ru = new Float64Array(6);
    this.peak = 0; this.skips = 0;
  }

  setRecord(rec) {
    this.rec = rec; this.down = false; this.air = false; this.inG = false; this.lastGn = null; this.seat = 0; this.fA = this.fB = 0;
    if (rec) rec.kD = rec.spr / TAU;
  }
  setSpeed(rpm) { this.wSet = omega(SPEEDS[rpm] || rpm); }
  // Lift, swing to alpha, and (optionally) lower again: what the auto mechanism or a careful hand does.
  autoTo(alpha, thenDown) { this.autoAl = Math.max(ALPHA_MIN, Math.min(ALPHA_REST, alpha)); this.autoDown = thenDown; this.cueUp = true; this.armHeld = false; this.auto = 1; }
  hold(alpha) { this.armHeld = true; this.auto = 0; this.cueUp = true; this.armT = Math.max(ALPHA_MIN, Math.min(ALPHA_REST, alpha)); }
  release(lower) { this.armHeld = false; this.cueUp = !lower; }
  knock(s = 1) { this.kickV += 0.035 * s; this.kickL += (this.rand() - 0.5) * 0.06 * s; }

  land(r, th0) {
    const rec = this.rec;
    let gn = Math.round((thetaForRadius(rec.rTab, r) - th0) / TAU);
    if (th0 + TAU * gn < 0) gn++;
    if (th0 + TAU * gn >= rec.thetaEnd) gn--;
    this.gn = gn; this.down = true; this.air = false; this.inG = false; this.seat = 0;
  }

  process(outL, outR, N) {
    const fs = this.fs, dt = 1 / fs, rec = this.rec, rand = this.rand, f = this.f, ru = this.ru;
    const rTab = rec ? rec.rTab : null, A = rec ? rec.A : null, B = rec ? rec.B : null, nW = rec ? rec.n : 0;
    const kD = rec ? rec.kD : 0, thetaEnd = rec ? rec.thetaEnd : 0, warp = rec ? rec.warp || [] : [];
    const ex = rec && rec.ecc ? rec.ecc[0] : 0, ey = rec && rec.ecc ? rec.ecc[1] : 0;
    const R = this.tipR, rg = this.rg, rz = this.rz, ra1 = this.ra1, ra2 = this.ra2;
    const kdr = onePole(1.5, fs), kr1 = onePole(30, fs), kr2 = onePole(6, fs), khp = onePole(16, fs), kseat = onePole(250, fs);
    const gain = this.gain / (rec ? rec.Vfs : 0.12), slew = SLEW * dt;
    let { thp, wp, al, ald, zc, xi, ze, zb, zbd, fA, fB, drift, t, seat, gn, down, air, inG } = this;
    let theta = this.theta, r = this.r, peak = this.peak;

    for (let i = 0; i < N; i++) {
      t += dt;
      // ---- platter: a motor that pulls toward its set speed, bearing drag, maybe a hand ----
      drift += kdr * ((rand() - 0.5) * 0.05 - drift);
      let acc;
      if (this.motor) {
        acc = (this.wSet * (1 + 2.5e-4 * Math.sin(TAU * 4.6 * t) + drift * 0.02) - wp) * 9;
        if (acc > 6) acc = 6; else if (acc < -6) acc = -6;
      } else acc = -0.55 * wp - 0.5 * wp / (Math.abs(wp) + 0.05);
      if (this.handOn) acc += 14400 * (this.handT - thp) - 240 * wp;
      wp += acc * dt; thp += wp * dt;

      // ---- cue lever and the auto mechanism ----
      const zt = this.cueUp ? Z_UP : 0;
      zc += Math.max(-V_DOWN * dt, Math.min(V_UP * dt, zt - zc));
      if (this.auto === 1) { if (zc > Z_UP - 3e-4) { this.auto = 2; this.armT = al; } }
      else if (this.auto === 2) {
        this.armT += Math.max(-0.9 * dt, Math.min(0.9 * dt, this.autoAl - this.armT));
        if (Math.abs(this.autoAl - al) < 4e-4 && Math.abs(ald) < 4e-3) { this.auto = 0; this.cueUp = !this.autoDown; }
      }

      // ---- where the cartridge is over the turning, slightly off-centre disc ----
      const ca = Math.cos(al), sa = Math.sin(al), cp = Math.cos(thp), sp = Math.sin(thp);
      const qx = PX + LE * ca - (ex * cp + ey * sp), qy = PY + LE * sa - (-ex * sp + ey * cp);
      r = Math.hypot(qx, qy);
      const th0 = Math.atan2(qy, qx) + thp, cSr = LE * (-sa * qx + ca * qy) / r;
      const onDisc = rec !== null && r < R_DISC - 6e-4 && r > R_LOCK - 2.5e-3;

      if (zc > 4e-4) { down = false; air = false; inG = false; }
      else if (!down && !air && zc <= 0) { if (onDisc) { this.land(r, th0); gn = this.gn; down = true; inG = false; seat = 0; zbd -= V_DOWN; this.lastGn = null; } else this.cueUp = true; }

      // rumble: the bearing, heard through the disc
      ru[0] += kr1 * (rand() - 0.5 - ru[0]); ru[1] += kr1 * (ru[0] - ru[1]); ru[2] += kr2 * (ru[1] - ru[2]);
      ru[3] += kr1 * (rand() - 0.5 - ru[3]); ru[4] += kr1 * (ru[3] - ru[4]); ru[5] += kr2 * (ru[4] - ru[5]);
      const rumZ = 2.2e-6 * (ru[1] - ru[2]), rumX = 1.1e-6 * (ru[4] - ru[5]);

      let xiT = 0, zeT = 0, Fx = 0, Fz = 0;
      if (down) {
        theta = th0 + TAU * gn;
        if (theta >= thetaEnd) { gn--; theta -= TAU; }            // the locked groove: round and round
        else if (theta < 0) { gn++; theta += TAU; }
        const h = TAU * r / rec.spr, pos = theta * kD;
        const yA = trace(A, nW, pos, h, R), yB = trace(B, nW, pos, h, R);
        const ks = 1 - Math.exp(-Math.abs(wp) * r / (A_SCAN * fs));   // slower vinyl, duller treble
        fA += ks * (yA - fA); fB += ks * (yB - fB);
        const rG = grooveRadius(rTab, theta), off = rG + (fA + fB) * IS2 + rumX - r;
        if (inG) {
          // The groove holds the tip only as hard as the tracking force presses it in. Pulled
          // further than that, the tip climbs out onto the land.
          if (off > HOLD || off < -HOLD) inG = false;
        } else {
          // On the land between grooves the tip just slides, until a groove comes under it.
          if (off > 0 && theta + TAU < thetaEnd && rG - grooveRadius(rTab, theta + TAU) < 2 * off) gn++;
          else if (off < 0 && theta - TAU >= 0 && grooveRadius(rTab, theta - TAU) - rG < -2 * off) gn--;
          else if (off < CATCH && off > -CATCH) { inG = true; seat = 0; if (this.lastGn !== null && gn !== this.lastGn) this.skips++; this.lastGn = gn; }
        }
        seat += kseat * (1 - seat);
        if (inG) xiT = seat * off;
        zeT = (inG ? seat * (fA - fB) * IS2 : 0) + warpHeight(warp, r, theta) + rumZ - zb;
      } else if (air) {
        zeT = -HOLD;
      }
      // the tip can only move so fast against the cantilever
      const dx = xiT - xi, dz = zeT - ze;
      const vx = (dx > slew ? slew : dx < -slew ? -slew : dx) * fs, vz = (dz > slew ? slew : dz < -slew ? -slew : dz) * fs;
      xi += vx * dt; ze += vz * dt;

      if (down) {
        if (ze < -HOLD) { down = false; air = true; }               // bounced clean out
        if (inG) Fx = KC * xi + CC * vx;
        Fz = KC * ze + CC * vz;
      }

      // ---- the arm ----
      if (this.kickV !== 0) { zbd += this.kickV; ald += this.kickL / LE; this.kickV = 0; this.kickL = 0; }
      if (this.armHeld || this.auto === 2) {
        ald += (WH * WH * (this.armT - al) - 2 * WH * ald) * dt;
      } else if (down) {
        ald += (Fx * cSr / IH - (inG ? 1.5 : 9) * ald) * dt;          // sliding on the land drags
      } else ald -= 60 * ald * dt;                                  // sitting on the lift
      al += ald * dt;
      if (al > ALPHA_REST) { al = ALPHA_REST; if (ald > 0) ald = 0; } else if (al < ALPHA_MIN) { al = ALPHA_MIN; if (ald < 0) ald = 0; }
      if (down) { zbd += (Fz / M_EFF) * dt; zb += zbd * dt; }
      else if (air) {
        zbd -= (VTF / M_EFF) * dt; zb += zbd * dt;
        if (zb <= 0 && zbd < 0) { if (onDisc) { this.land(r, th0); gn = this.gn; down = true; air = false; inG = false; seat = 0; } else { air = false; this.cueUp = true; } }
      } else { zb -= 40 * zb * dt; zbd -= 40 * zbd * dt; }

      // ---- cartridge: tip velocity on the two 45-degree axes; then the preamp ----
      const eL = (vx + vz) * IS2, eR = (vx - vz) * IS2;
      let yl = rg * (eL - rz * f[0]) + ra1 * f[1] - ra2 * f[2]; f[0] = eL; f[2] = f[1]; f[1] = yl;
      let yr = rg * (eR - rz * f[3]) + ra1 * f[4] - ra2 * f[5]; f[3] = eR; f[5] = f[4]; f[4] = yr;
      f[6] += khp * (yl - f[6]); yl -= f[6]; f[7] += khp * (yl - f[7]); yl -= f[7];      // subsonic filter
      f[8] += khp * (yr - f[8]); yr -= f[8]; f[9] += khp * (yr - f[9]); yr -= f[9];
      const hum = 4e-6 * Math.sin(TAU * 60 * t) + 1.5e-6 * Math.sin(TAU * 180 * t + 1);
      let oL = (yl + hum + 6e-6 * (rand() - 0.5)) * gain, oR = (yr + 0.8 * hum + 6e-6 * (rand() - 0.5)) * gain;
      if (oL > 0.9 || oL < -0.9) oL = Math.sign(oL) * (0.9 + 0.1 * Math.tanh((Math.abs(oL) - 0.9) * 10));
      if (oR > 0.9 || oR < -0.9) oR = Math.sign(oR) * (0.9 + 0.1 * Math.tanh((Math.abs(oR) - 0.9) * 10));
      outL[i] = oL; outR[i] = oR;
      const pk = oL < 0 ? -oL : oL; if (pk > peak) peak = pk;
    }

    if (!(Math.abs(xi) < 1e-2) || !(Math.abs(zb) < 0.05) || !(al === al) || !(Math.abs(wp) < 80)) {   // blow-up guard
      xi = ze = zb = zbd = ald = 0; down = false; air = false; inG = false; this.cueUp = true; f.fill(0);
      if (!(al === al)) al = ALPHA_REST;
      if (!(Math.abs(wp) < 80)) { wp = 0; thp = 0; }
    }
    Object.assign(this, { thp, wp, al, ald, zc, xi, ze, zb, zbd, fA, fB, drift, t, seat, gn, down, air, inG, theta, r, peak });
  }
}
