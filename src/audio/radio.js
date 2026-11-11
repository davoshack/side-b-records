// FM tuner. The dial is continuous: between stations there is only static, and a station fades up
// out of it as the needle comes onto its frequency. The stations are real internet streams.
export const BAND = [87.5, 108];
export const STATIONS = [
  { f: 88.5, name: 'FIP', city: 'Paris', tag: 'Eclectic', url: 'https://icecast.radiofrance.fr/fip-midfi.mp3' },
  { f: 90.3, name: 'KEXP', city: 'Seattle', tag: 'Indie', url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' },
  { f: 92.1, name: 'FIP Jazz', city: 'Paris', tag: 'Jazz', url: 'https://icecast.radiofrance.fr/fipjazz-midfi.mp3' },
  { f: 94.7, name: 'Radio Paradise', city: 'California', tag: 'Free-form', url: 'https://stream.radioparadise.com/mp3-128' },
  { f: 96.9, name: 'FIP Groove', city: 'Paris', tag: 'Funk & soul', url: 'https://icecast.radiofrance.fr/fipgroove-midfi.mp3' },
  { f: 98.5, name: 'RP Mellow', city: 'California', tag: 'Mellow', url: 'https://stream.radioparadise.com/mellow-128' },
  { f: 100.7, name: 'NTS 1', city: 'London', tag: 'Underground', url: 'https://stream-relay-geo.ntslive.net/stream' },
  { f: 102.3, name: 'France Musique', city: 'Paris', tag: 'Classical', url: 'https://icecast.radiofrance.fr/francemusique-midfi.mp3' },
  { f: 104.5, name: 'RP Rock', city: 'California', tag: 'Rock', url: 'https://stream.radioparadise.com/rock-128' },
  { f: 106.1, name: 'FIP World', city: 'Paris', tag: 'World', url: 'https://icecast.radiofrance.fr/fipworld-midfi.mp3' },
  { f: 107.3, name: 'JZR Swing', city: 'Geneva', tag: 'Electro swing', url: 'https://jazz-wr04.ice.infomaniak.ch/jazz-wr04-128.mp3' },
];
const CAPTURE = 0.22;                 // MHz either side of a station where it can be heard at all
const LOCK = 0.06;                    // ... and where it is clean

export class Radio {
  constructor(ctx, dest) {
    this.ctx = ctx; this.freq = 94.7; this.on = false; this.state = 'off'; this.station = null; this.strength = 0;
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
    for (const s of STATIONS) { const k = Math.abs(s.f - f); if (k < d) { d = k; best = s; } }
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

  // step to the next station up or down the dial
  seek(dir) {
    const list = STATIONS.filter((s) => (dir > 0 ? s.f > this.freq + 0.01 : s.f < this.freq - 0.01));
    const s = dir > 0 ? list[0] || STATIONS[0] : list[list.length - 1] || STATIONS[STATIONS.length - 1];
    this.tune(s.f);
    return s;
  }
}
