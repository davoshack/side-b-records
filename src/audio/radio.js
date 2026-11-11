// FM tuner. The dial is continuous: between stations there is only static, and a station fades up
// out of it as the needle comes onto its frequency.
//
// The dial ships empty. A listener adds the stream address of a station they are allowed to play
// and picks where on the band it sits; the list is kept in their browser and nowhere else.
export const BAND = [87.5, 108];
const STORE = 'side-b.stations', SPACING = 0.4;      // MHz: closer than this and two stations bleed together
const round = (f) => Math.round(f * 10) / 10;

export function loadStations() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(list) ? list.filter((s) => s && typeof s.name === 'string' && /^https?:\/\//.test(s.url) && s.f >= BAND[0] && s.f <= BAND[1]).sort((a, b) => a.f - b.f) : [];
  } catch { return []; }
}
export function saveStations(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* private window: keep it for this visit only */ } }

// Returns the cleaned-up station, or throws an Error whose message can be shown to the listener.
export function makeStation(list, { name, url, f }) {
  name = String(name || '').trim().slice(0, 24); url = String(url || '').trim(); f = round(Number(f));
  if (!name) throw new Error('Give the station a name');
  let u; try { u = new URL(url); } catch { throw new Error('That is not a web address'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('The address must start with https://');
  if (!(f >= BAND[0] && f <= BAND[1])) throw new Error(`Pick a frequency between ${BAND[0]} and ${BAND[1]} MHz`);
  const near = list.find((s) => Math.abs(s.f - f) < SPACING);
  if (near) throw new Error(`Too close to ${near.name} at ${near.f.toFixed(1)}: leave ${SPACING} MHz between stations`);
  return { name, url: u.href, f };
}

const CAPTURE = 0.22;                 // MHz either side of a station where it can be heard at all
const LOCK = 0.06;                    // ... and where it is clean

export class Radio {
  constructor(ctx, dest) {
    this.ctx = ctx; this.stations = []; this.freq = 94.7; this.on = false; this.state = 'off'; this.station = null; this.strength = 0;
    this.onchange = () => {};
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(dest);
    // station path: a little bandwidth-limited, like a broadcast
    this.stGain = ctx.createGain(); this.stGain.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 45;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 14500;
    this.stGain.connect(hp).connect(lp).connect(this.out);
    // static: band-limited noise with slow fades and the odd crackle
    const n = ctx.sampleRate * 4, buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let a = 0, env = 1;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1; a += 0.5 * (w - a);
        if (i % 2048 === 0) env = 0.7 + 0.3 * Math.random();
        d[i] = (w - 0.6 * a) * 0.6 * env + (Math.random() < 0.0004 ? (Math.random() - 0.5) * 1.5 : 0);
      }
    }
    this.noise = ctx.createBufferSource(); this.noise.buffer = buf; this.noise.loop = true;
    this.nzGain = ctx.createGain(); this.nzGain.gain.value = 0;
    this.noise.connect(this.nzGain).connect(this.out); this.noise.start();
    this.el = null; this.src = null; this.plain = null; this.timer = 0; this.loaded = null; this.failed = new Set();
  }

  nearest(f = this.freq) {
    let best = null, d = 1e9;
    for (const s of this.stations) { const k = Math.abs(s.f - f); if (k < d) { d = k; best = s; } }
    return { station: best, d };
  }

  setOn(on) {
    this.on = on;
    this.out.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.04);
    if (!on) { this.stop(); this.state = 'off'; this.onchange(); } else this.tune(this.freq);
  }

  tune(f) {
    this.freq = Math.max(BAND[0], Math.min(BAND[1], Math.round(f * 20) / 20));
    const { station, d } = this.nearest();
    const s = d >= CAPTURE ? 0 : d <= LOCK ? 1 : 1 - (d - LOCK) / (CAPTURE - LOCK);
    this.strength = s; this.station = s > 0 ? station : null;
    if (!this.on) return;
    this.apply();
    clearTimeout(this.timer);
    if (s > 0 && this.loaded !== station) this.timer = setTimeout(() => this.load(station), 280);   // let the dial settle
    else if (s === 0 && this.loaded) this.timer = setTimeout(() => this.stop(), 1500);
    if (s === 0) this.state = 'static'; else if (this.loaded !== station) this.state = 'tuning';
    this.onchange();
  }

  apply() {
    const t = this.ctx.currentTime, live = this.state === 'live' && this.loaded === this.station, s = live ? this.strength : 0;
    this.stGain.gain.setTargetAtTime(s * s, t, 0.05);
    this.nzGain.gain.setTargetAtTime(0.16 * (1 - s) ** 0.7 + 0.004, t, 0.05);
    if (this.plain) this.plain.volume = live ? s * s * (this.volume ?? 0.8) : 0;
  }

  load(station) {
    this.stop();
    this.loaded = station; this.state = 'buffering'; this.onchange();
    const viaGraph = !this.failed.has(station.url);
    const el = new Audio();
    el.preload = 'none';
    if (viaGraph) el.crossOrigin = 'anonymous';
    el.src = station.url;
    el.addEventListener('playing', () => { if (this.loaded === station) { this.state = 'live'; this.apply(); this.onchange(); } });
    el.addEventListener('waiting', () => { if (this.loaded === station && this.state === 'live') { this.state = 'buffering'; this.apply(); this.onchange(); } });
    el.addEventListener('error', () => {
      if (this.loaded !== station) return;
      if (viaGraph) { this.failed.add(station.url); this.load(station); return; }   // no CORS: play it straight
      this.state = 'error'; this.apply(); this.onchange();
    });
    if (viaGraph) { this.el = el; this.src = this.ctx.createMediaElementSource(el); this.src.connect(this.stGain); }
    else { this.plain = el; el.volume = 0; }
    el.play().catch(() => {});
  }

  stop() {
    clearTimeout(this.timer);
    for (const el of [this.el, this.plain]) if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    if (this.src) this.src.disconnect();
    this.el = this.src = this.plain = this.loaded = null;
    this.stGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    if (this.on) this.nzGain.gain.setTargetAtTime(0.16, this.ctx.currentTime, 0.05);
  }

  // the listener changed what is on the dial
  setStations(list) {
    this.stations = [...list].sort((a, b) => a.f - b.f);
    if (this.loaded && !this.stations.some((s) => s.url === this.loaded.url && s.f === this.loaded.f)) this.stop();
    this.tune(this.freq);
  }

  // step to the next station up or down the dial; null when the dial is empty
  seek(dir) {
    const all = this.stations; if (!all.length) return null;
    const list = all.filter((s) => (dir > 0 ? s.f > this.freq + 0.01 : s.f < this.freq - 0.01));
    const s = dir > 0 ? list[0] || all[0] : list[list.length - 1] || all[all.length - 1];
    this.tune(s.f);
    return s;
  }
}
