// Main-thread side of the audio: the context, the deck worklet, the tuner, the mastering worker.
import { Radio } from './radio.js';

const LATHE_FS = 44100;

export class AudioRig {
  constructor() {
    this.ctx = null; this.node = null; this.radio = null; this.tel = null; this.telAt = 0;
    this.source = 'phono'; this.volume = 0.7; this.ready = false; this.pending = [];
    this.worker = new Worker(new URL('./master-worker.js', import.meta.url), { type: 'module' });
    this.job = 0; this.jobs = new Map();
    this.worker.onmessage = (e) => {
      const j = this.jobs.get(e.data.job); if (!j) return;
      if (e.data.progress !== undefined) j.onprogress?.(e.data.stage, e.data.progress);
      else { this.jobs.delete(e.data.job); e.data.error ? j.reject(new Error(e.data.error)) : j.resolve(e.data); }
    };
  }

  async init() {
    const ctx = this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
    this.node = new AudioWorkletNode(ctx, 'deck', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    this.node.port.onmessage = (e) => { this.tel = e.data; this.telAt = performance.now(); };
    this.master = ctx.createGain(); this.master.gain.value = this.gainFor(this.volume);
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024; this.meter = new Float32Array(1024);
    this.phono = ctx.createGain();
    this.node.connect(this.phono).connect(this.master);
    this.master.connect(this.analyser).connect(ctx.destination);
    this.radio = new Radio(ctx, this.master);
    this.ready = true;
    for (const m of this.pending) this.node.port.postMessage(m.msg, m.transfer);
    this.pending.length = 0;
  }

  gainFor(v) { return v * v * 1.6; }
  wake() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  get running() { return !!this.ctx && this.ctx.state === 'running'; }
  post(msg, transfer = []) { if (this.ready) this.node.port.postMessage(msg, transfer); else this.pending.push({ msg, transfer }); }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(this.gainFor(this.volume), this.ctx.currentTime, 0.03);
    if (this.radio) { this.radio.volume = this.volume; this.radio.apply(); }
  }
  setSource(src) {
    this.source = src;
    if (!this.ready) return;
    this.phono.gain.setTargetAtTime(src === 'phono' ? 1 : 0, this.ctx.currentTime, 0.03);
    this.radio.setOn(src === 'radio');
  }
  level() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.meter);
    let s = 0; for (let i = 0; i < this.meter.length; i++) s += this.meter[i] * this.meter[i];
    return Math.sqrt(s / this.meter.length);
  }

  // Cut + press a record in the worker. audio = { fs, tracks: [{ L, R, title }] }. Resolves with { A, B, meta, vis }.
  master_(record, audio, onprogress) {
    const job = ++this.job;
    return new Promise((resolve, reject) => {
      this.jobs.set(job, { resolve, reject, onprogress });
      this.worker.postMessage({ job, record: { id: record.id, condition: record.condition, seed: record.seed }, audio }, audio.tracks.flatMap((t) => [t.L.buffer, t.R.buffer]));
    });
  }
  load(pressed) {
    const { A, B, meta } = pressed;
    this.post({ type: 'record', rec: meta, A, B }, [A.buffer, B.buffer]);
  }
  // Compressed audio -> samples at the lathe's rate. `max` (seconds) trims anything too long for a side.
  async decodeBytes(bytes, title, max = 12 * 60) {
    const buf = await new OfflineAudioContext(2, 1, LATHE_FS).decodeAudioData(bytes);
    const n = Math.min(buf.length, Math.round(max * buf.sampleRate));
    const L = buf.getChannelData(0).slice(0, n), R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice(0, n);
    return { L, R, title, clipped: buf.length > n };
  }
  async decodeFile(file) {
    const t = await this.decodeBytes(await file.arrayBuffer(), file.name.replace(/\.[^.]+$/, ''));
    return { fs: LATHE_FS, tracks: [t], clipped: t.clipped };
  }
  // Fetch and decode a shelf record's tracks from records/.
  async fetchTracks(record, onprogress) {
    const tracks = [];
    for (const [i, t] of record.tracks.entries()) {
      onprogress?.(`Fetching ${i + 1} of ${record.tracks.length}`, 0.05 + 0.45 * i / record.tracks.length);
      const res = await fetch(new URL(`../../records/${t.file}`, import.meta.url));
      if (!res.ok) throw new Error(`records/${t.file} is missing`);
      tracks.push(await this.decodeBytes(await res.arrayBuffer(), t.title));
    }
    return { fs: LATHE_FS, tracks };
  }
}
