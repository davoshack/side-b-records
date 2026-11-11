// FM tuner. The dial is continuous: between stations there is only static, and a station fades up
// out of it as the needle comes onto its frequency.
//
// The dial comes with a handful of stations already on it. A listener can take any of them off and
// add their own: a stream address and a place on the band. Their dial is kept in their browser.
export const BAND = [87.5, 108];
const STORE = 'side-b.dial', SPACING = 0.4;          // MHz: closer than this and two stations bleed together
const round = (f) => Math.round(f * 10) / 10;

// The streams belong to the stations. The listener's browser connects to them directly.
// `dial` is the short name printed on the tuning scale, when the full one is too long for it.
export const PRESETS = [
  { f: 88.5, name: 'FIP', city: 'Paris', tag: 'Eclectic', url: 'https://icecast.radiofrance.fr/fip-midfi.mp3' },
  { f: 90.3, name: 'KEXP', city: 'Seattle', tag: 'Indie', url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' },
  { f: 92.1, name: 'FIP Jazz', city: 'Paris', tag: 'Jazz', url: 'https://icecast.radiofrance.fr/fipjazz-midfi.mp3' },
  { f: 94.7, name: 'Radio Paradise', dial: 'R. PARADISE', city: 'California', tag: 'Free-form', url: 'https://stream.radioparadise.com/mp3-128' },
  { f: 96.9, name: 'FIP Groove', city: 'Paris', tag: 'Funk & soul', url: 'https://icecast.radiofrance.fr/fipgroove-midfi.mp3' },
  { f: 98.5, name: 'RP Mellow', dial: 'RP MELLOW', city: 'California', tag: 'Mellow', url: 'https://stream.radioparadise.com/mellow-128' },
  { f: 100.7, name: 'NTS 1', city: 'London', tag: 'Underground', url: 'https://stream-relay-geo.ntslive.net/stream' },
  { f: 102.3, name: 'France Musique', dial: 'F. MUSIQUE', city: 'Paris', tag: 'Classical', url: 'https://icecast.radiofrance.fr/francemusique-midfi.mp3' },
  { f: 104.5, name: 'RP Rock', city: 'California', tag: 'Rock', url: 'https://stream.radioparadise.com/rock-128' },
  { f: 106.1, name: 'FIP World', city: 'Paris', tag: 'World', url: 'https://icecast.radiofrance.fr/fipworld-midfi.mp3' },
  { f: 107.3, name: 'JZR Swing', dial: 'JZR SWING', city: 'Geneva', tag: 'Electro swing', url: 'https://jazz-wr04.ice.infomaniak.ch/jazz-wr04-128.mp3' },
  // Colombia. Where the band has room, a station sits on its real Bogotá (or Cali) frequency.
  { f: 91.3, name: 'Javeriana Estéreo', dial: 'JAVERIANA', city: 'Bogotá', tag: 'Culture & classical', url: 'https://radio06.cehis.net/proxy/javerian?mp=%2Fstream' },
  { f: 93.5, name: 'La Kalle', city: 'Bogotá', tag: 'Vallenato & popular', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LA_KALLE.mp3' },
  { f: 95.9, name: 'Radio Nacional', dial: 'R. NACIONAL', city: 'Bogotá', tag: 'Public radio (RTVC)', url: 'http://shoutcast.rtvc.gov.co:8000/;' },
  { f: 97.7, name: 'Caracol Radio', dial: 'CARACOL', city: 'Bogotá', tag: 'News & talk', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CARACOL_RADIO.mp3' },
  { f: 99.1, name: 'Radiónica', city: 'Bogotá', tag: 'Alternative (RTVC)', url: 'http://shoutcast.rtvc.gov.co:8010/;' },
  { f: 102.9, name: 'Tropicana', city: 'Bogotá', tag: 'Tropical & salsa', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TROPICANA.mp3' },
  { f: 105.3, name: 'Univalle Estéreo', dial: 'UNIVALLE', city: 'Cali', tag: 'University & culture', url: 'https://uv-stereo.univalle.edu.co:8000/envivo.mp3' },
];
const presets = () => PRESETS.map((s) => ({ ...s }));

// The listener's dial, or the presets if they have never changed it.
export function loadStations() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw === null) return presets();
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((s) => s && typeof s.name === 'string' && /^https?:\/\//.test(s.url) && s.f >= BAND[0] && s.f <= BAND[1]).sort((a, b) => a.f - b.f) : presets();
  } catch { return presets(); }
}
// Put back every preset that is missing and still has room on the band.
export function withPresets(list) {
  const out = [...list];
  for (const p of PRESETS) if (!out.some((s) => s.url === p.url || Math.abs(s.f - p.f) < SPACING)) out.push({ ...p });
  return out.sort((a, b) => a.f - b.f);
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
    if (location.protocol === 'https:' && station.url.startsWith('http:')) { this.state = 'error'; this.apply(); this.onchange(); return; }   // blocked as mixed content
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
