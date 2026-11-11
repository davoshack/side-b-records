// The deck engine, on the audio thread.
import { Deck } from './engine-core.js';

class DeckProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.deck = new Deck(sampleRate, 7);
    this.count = 0;
    this.lockT = 0;
    this.port.onmessage = (e) => this.on(e.data);
  }
  on(m) {
    const d = this.deck;
    switch (m.type) {
      case 'record': d.setRecord(m.rec ? { ...m.rec, A: m.A, B: m.B } : null); d.skips = 0; break;
      case 'motor': d.motor = m.on; break;
      case 'speed': d.setSpeed(m.rpm); break;
      case 'auto': d.autoTo(m.alpha, m.down); break;
      case 'hold': d.hold(m.alpha); break;
      case 'release': d.release(m.lower); break;
      case 'cue': d.cueUp = m.up; d.auto = 0; break;
      case 'hand': d.handOn = m.on; if (m.on) d.handT = m.theta; break;
      case 'knock': d.knock(m.strength); break;
      case 'stylus': d.tipR = m.radius; break;
    }
  }
  process(_, outputs) {
    const out = outputs[0], d = this.deck;
    d.process(out[0], out[1] || out[0], out[0].length);
    if (++this.count >= 5) {
      this.count = 0;
      this.port.postMessage({
        thp: d.thp, wp: d.wp, al: d.al, zc: d.zc, down: d.down, air: d.air, theta: d.theta, r: d.r,
        auto: d.auto, cueUp: d.cueUp, peak: d.peak, skips: d.skips, t: currentTime,
      });
      d.peak = 0;
    }
    return true;
  }
}
registerProcessor('deck', DeckProcessor);
