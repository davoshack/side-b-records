// Mastering room, off the main thread: take the decoded recordings, cut the lacquer, press the disc.
import { cut } from './cut.js';
import { press, modulationMap, CONDITIONS } from './press.js';

onmessage = (e) => {
  const { job, record, audio } = e.data;
  const say = (stage, p) => postMessage({ job, progress: p, stage });
  try {
    say('Cutting the lacquer', 0.55);
    // Each track is levelled on its own, so a quiet transfer and a loud modern master sit together,
    // and the dead air most files carry at either end is trimmed: the lathe adds its own gaps.
    for (const t of audio.tracks) {
      let pk = 1e-4;
      for (let i = 0; i < t.L.length; i++) { const a = Math.abs(t.L[i]), b = Math.abs(t.R[i]); if (a > pk) pk = a; if (b > pk) pk = b; }
      const floor = pk * 0.004, n = t.L.length;
      let i0 = 0, i1 = n - 1;
      while (i0 < n && Math.abs(t.L[i0]) < floor && Math.abs(t.R[i0]) < floor) i0++;
      while (i1 > i0 && Math.abs(t.L[i1]) < floor && Math.abs(t.R[i1]) < floor) i1--;
      i0 = Math.max(0, i0 - Math.round(0.25 * audio.fs)); i1 = Math.min(n, i1 + Math.round(1.0 * audio.fs));
      if (i1 > i0 + audio.fs) { t.L = t.L.subarray(i0, i1); t.R = t.R.subarray(i0, i1); }
      const g = 0.95 / pk;
      for (let i = 0; i < t.L.length; i++) { t.L[i] *= g; t.R[i] *= g; }
    }
    const rec = cut(audio.tracks, audio.fs);
    audio.tracks.length = 0;                        // let the source audio go before pressing
    say('Pressing', 0.82);
    press(rec, CONDITIONS[record.condition] || CONDITIONS.good, record.seed || 1);
    const vis = modulationMap(rec);
    postMessage({
      job, done: true, A: rec.A, B: rec.B, vis,
      meta: {
        id: record.id, fs: rec.fs, spr: rec.spr, n: rec.n, rTab: rec.rTab, thetaEnd: rec.thetaEnd, thetaLock: rec.thetaLock,
        Vfs: rec.Vfs, ecc: rec.ecc, warp: rec.warp, scratches: rec.scratches, condition: rec.condition, tracks: rec.tracks, truncated: rec.truncated,
      },
    }, [rec.A.buffer, rec.B.buffer, vis.data.buffer]);
  } catch (err) {
    postMessage({ job, error: String(err && err.message || err) });
  }
};
