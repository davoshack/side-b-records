// Offline checks of the groove chain: cut a signal, press it, play it back through the deck engine,
// and measure what comes out. Run with `npm test`.
import { cut } from '../src/audio/cut.js';
import { press, CONDITIONS } from '../src/audio/press.js';
import { Deck } from '../src/audio/engine-core.js';
import { alphaForRadius, grooveRadius, omega, SPEEDS, R_LEADIN } from '../src/audio/geometry.js';
import { TAU } from '../src/audio/dsp.js';

const fs = 44100;
const CLEAN = { noise: 0, dust: 0, scratches: 0, warp: 0, offCenter: 0 };
const sine = (f, secs, amp = 0.5) => Float32Array.from({ length: Math.round(secs * fs) }, (_, i) => amp * Math.sin(TAU * f * i / fs));
const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  ${detail}`); if (!ok) failed++; };

// Put the needle straight into the groove at a given angle with the platter already at speed.
function play(rec, { theta = TAU * 3, secs = 3, rpm = 33, settle = 1.5 } = {}) {
  const d = new Deck(fs);
  d.setRecord(rec); d.setSpeed(rpm); d.motor = true; d.wp = omega(SPEEDS[rpm]);
  d.al = alphaForRadius(grooveRadius(rec.rTab, theta)); d.cueUp = false; d.zc = 0;
  const n = Math.round((secs + settle) * fs), L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i += 128) d.process(L.subarray(i, Math.min(n, i + 128)), R.subarray(i, Math.min(n, i + 128)), Math.min(128, n - i));
  const s = Math.round(settle * fs);
  return { L: L.subarray(s), R: R.subarray(s), deck: d };
}
const rms = (x) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
function freq(x) { let c = 0; for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) c++; return c * fs / x.length; }
function tone(x, f) {            // amplitude of the component at f, and what is left over
  // Fitted in short windows: the platter's speed wanders by a few hundredths of a percent, as a real
  // one does, which is enough to smear a seconds-long correlation.
  const W = Math.round(0.04 * fs); let a2 = 0, r2 = 0, k = 0;
  for (let o = 0; o + W <= x.length; o += W) {
    let s = 0, c = 0, e = 0;
    for (let i = 0; i < W; i++) { const v = x[o + i]; s += v * Math.sin(TAU * f * i / fs); c += v * Math.cos(TAU * f * i / fs); e += v * v; }
    const amp2 = 4 * (s * s + c * c) / (W * W);
    a2 += amp2; r2 += Math.max(0, e / W - amp2 / 2); k++;
  }
  return { amp: Math.sqrt(a2 / k), rest: Math.sqrt(r2 / k) };
}

// 1. a 1 kHz tone comes back as a 1 kHz tone at the level it went in
{
  const rec = press(cut([{ L: sine(1000, 12), title: '1k' }], fs), CLEAN, 1);
  const { L, R } = play(rec, { theta: TAU * 4 });
  const f = freq(L), t = tone(L, 1000);
  check('1 kHz frequency', Math.abs(f - 1000) < 3, `${f.toFixed(1)} Hz`);
  check('1 kHz level', Math.abs(db(t.amp / 0.9)) < 1, `${db(t.amp / 0.9).toFixed(2)} dB re cut level`);
  check('1 kHz distortion+noise', db(t.rest / (t.amp / Math.SQRT2)) < -30, `${db(t.rest / (t.amp / Math.SQRT2)).toFixed(1)} dB`);
  check('channel balance', Math.abs(db(rms(L) / rms(R))) < 0.5, `${db(rms(L) / rms(R)).toFixed(2)} dB`);
}

// 2. frequency response through cut + play is flat
{
  const out = [];
  for (const fq of [50, 200, 1000, 5000, 10000]) {
    const rec = press(cut([{ L: sine(fq, 10, 0.1), title: 't' }], fs, { level: 0.1 }), CLEAN, 1);
    const { L } = play(rec, { theta: TAU * 4 });
    out.push([fq, db(tone(L, fq).amp / 0.1)]);
  }
  const worst = Math.max(...out.map(([, d]) => Math.abs(d)));
  check('response 50 Hz - 10 kHz', worst < 2.5, out.map(([fq, d]) => `${fq}:${d.toFixed(1)}`).join('  ') + ' dB');
}

// 3. stereo separation: left only stays left
{
  const n = Math.round(10 * fs), rec = press(cut([{ L: sine(1000, 10), R: new Float32Array(n), title: 'L' }], fs), CLEAN, 1);
  const { L, R } = play(rec, { theta: TAU * 4 });
  check('separation', db(rms(R) / rms(L)) < -20, `${db(rms(R) / rms(L)).toFixed(1)} dB`);
}

// 4. 45 rpm plays a 33 cut 1.35x sharp
{
  const rec = press(cut([{ L: sine(1000, 12), title: '1k' }], fs), CLEAN, 1);
  const f = freq(play(rec, { theta: TAU * 4, rpm: 45, secs: 2 }).L);
  check('45 rpm pitch', Math.abs(f - 1350) < 6, `${f.toFixed(1)} Hz`);
}

// 5. a silent groove is not silent: surface noise sits where a real pressing's does
{
  const rec = press(cut([{ L: new Float32Array(12 * fs), title: 'silence' }], fs, { level: 0.9 }), CONDITIONS.good, 3);
  const { L } = play(rec, { theta: TAU * 4 });
  const ref = 0.9 * (0.05 * Math.SQRT2 / rec.Vfs) / Math.SQRT2;       // rms of a 5 cm/s rms tone at the output
  check('surface noise', db(rms(L) / ref) > -75 && db(rms(L) / ref) < -40, `${db(rms(L) / ref).toFixed(1)} dB re 5 cm/s`);
  const peak = L.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
  console.log(`     (noise rms ${db(rms(L)).toFixed(1)} dBFS, loudest tick ${db(peak).toFixed(1)} dBFS)`);
}

// 6. cue from rest: the auto mechanism finds the lead-in and the music starts; the arm follows the spiral
{
  const rec = press(cut([{ L: sine(440, 20), title: 'a' }], fs), CONDITIONS.good, 5);
  const d = new Deck(fs); d.setRecord(rec); d.motor = true;
  d.autoTo(alphaForRadius(R_LEADIN - 0.0006), true);
  const n = 14 * fs, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i += 128) d.process(L.subarray(i, i + 128), R.subarray(i, i + 128), Math.min(128, n - i));
  const tail = L.subarray(n - 2 * fs), f = freq(tail);
  check('cue + play', d.down && Math.abs(f - 440) < 4 && d.skips === 0, `down=${d.down} f=${f.toFixed(1)} Hz skips=${d.skips} r=${(d.r * 1000).toFixed(1)} mm`);
  const track = Math.abs(d.r - grooveRadius(rec.rTab, d.theta));
  check('arm tracks the groove', track < 60e-6, `${(track * 1e6).toFixed(1)} um off centreline`);
  // 7. knock it: the needle jumps
  d.knock(3);
  for (let i = 0; i < fs; i += 128) d.process(L.subarray(i, i + 128), R.subarray(i, i + 128), 128);
  check('knock skips', d.skips > 0 && d.skips < 12, `skips=${d.skips}`);
  // 8. run-out: the locked groove loops forever
  d.al = alphaForRadius(grooveRadius(rec.rTab, rec.thetaLock + 1)); d.cueUp = false; d.zc = 0; d.down = false; d.ald = 0;
  for (let k = 0; k < 6; k++) for (let i = 0; i < fs; i += 128) d.process(L.subarray(i, i + 128), R.subarray(i, i + 128), 128);
  check('locked groove', d.down && d.theta >= rec.thetaLock - 0.1 && d.theta < rec.thetaEnd, `theta-lock=${(d.theta - rec.thetaLock).toFixed(2)} rad`);
}

// 9. the lead-in is wide: wherever the needle comes down on it, it must find the groove and stay in
{
  const rec = press(cut([{ L: sine(440, 14), title: 'a' }], fs), CONDITIONS.played, 23);
  let worst = 0, bad = 0;
  for (let k = 0; k < 12; k++) {
    const d = new Deck(fs, k + 1); d.setRecord(rec); d.motor = true; d.wp = omega(SPEEDS[33]); d.thp = k * 0.9;
    d.al = alphaForRadius(R_LEADIN - 0.0002 - k * 0.00021); d.cueUp = false; d.zc = 0.001;
    const o = new Float32Array(128);
    for (let i = 0; i < 6 * fs; i += 128) d.process(o, o, 128);
    worst = Math.max(worst, d.skips); if (!d.down) bad++;
  }
  check('lead-in landings', bad === 0 && worst <= 3, `${12 - bad}/12 tracking, most skips ${worst}`);
}

// 10. the roughest copy in the crate (warped, off-centre, scratched) still plays through
{
  const rec = press(cut([{ L: sine(440, 30, 0.4), title: 'a' }], fs), CONDITIONS.thrift, 5);
  const d = new Deck(fs, 3); d.setRecord(rec); d.motor = true;
  d.autoTo(alphaForRadius(R_LEADIN - 0.0006), true);
  const n = 24 * fs, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i += 128) d.process(L.subarray(i, i + 128), R.subarray(i, i + 128), Math.min(128, n - i));
  const f = freq(L.subarray(n - 2 * fs));
  check('thrift-store copy', d.down && d.skips <= 2 && Math.abs(f - 440) < 8, `down=${d.down} skips=${d.skips} f=${f.toFixed(1)} Hz (wow included)`);
}

// 11. cost
{
  const rec = press(cut([{ L: sine(1000, 12), title: '1k' }], fs), CONDITIONS.good, 1);
  const t0 = performance.now(); play(rec, { secs: 8, settle: 0 });
  const ms = (performance.now() - t0) / 8;
  check('real-time cost', ms < 400, `${ms.toFixed(0)} ms of CPU per second of audio`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
