// Side B Records: a listening station on the counter of a record shop.
// This file wires the three parts together: the scene (gl/, scene/), the sound (audio/), and hands.
import { Renderer } from './gl/renderer.js';
import { T, RX, RZ, RY, mul, invert, rayBox, lerp } from './gl/math.js';
import { buildStore } from './scene/store.js';
import { buildDeck, armMatrix, lidMatrix, sleeveInCrate, sleeveOnStand } from './scene/deck.js';
import * as Art from './scene/art.js';
import { UNIT, SPINDLE, PIVOT, LID, CRATE, STAND, SLEEVE, worldToPlane } from './scene/layout.js';
import { AudioRig } from './audio/engine.js';
import { RECORDS, CUSTOM } from './audio/records.js';
import { BAND, loadStations, saveStations, makeStation } from './audio/radio.js';
import { ARM_LE, PIVOT_X, PIVOT_Y, ALPHA_REST, ALPHA_MIN, R_DISC, R_LEADIN, R_LOCK, alphaForRadius, radiusForAlpha, grooveRadius } from './audio/geometry.js';
import { Z_UP } from './audio/engine-core.js';
import { TAU, clamp } from './audio/dsp.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#gl');
let R;
try { R = new Renderer(canvas); } catch (e) { $('#fatal').textContent = e.message; $('#fatal').hidden = false; throw e; }
const rig = new AudioRig();
const SHELF = [...RECORDS, CUSTOM];

// ------------------------------------------------------------------ state
const S = {
  source: 'phono', rpm: 33, volume: 0.7, freq: 94.7,
  record: -1, meta: null, loading: null, playing: false, stopping: false, lockSince: 0, track: -1,
  cam: { az: 0.3, el: 0.34, dist: 1.1, taz: 0.3, tel: 0.34, tdist: 1.1 },
  lid: LID.open, lidT: LID.open, hover: null, drag: null, discDrop: 1, lift: SHELF.map(() => 0),
  custom: null, radioState: 'off', station: null, strength: 0, level: 0, stations: loadStations(),
};
const VIEWS = { counter: [0.3, 0.34, 1.1], deck: [0.02, 1.02, 0.8], shop: [-0.5, 0.15, 2.4] };
const CAM_PIVOT = [-0.02, 0.15, 0.0];

// ------------------------------------------------------------------ scene
const atlas = Art.makeAtlas(), heroes = Art.makeHeroAtlas(SHELF), lcd = Art.lcdCanvas();
let dialArt = Art.makeDial(S.stations);
const tex = {
  atlas: R.texture(atlas.canvas), hero: R.texture(heroes.canvas), neon: R.texture(Art.makeNeon()),
  fascia: R.texture(Art.makeFascia()), dial: R.texture(dialArt.canvas), lcd: R.texture(lcd),
};
const store = buildStore(atlas), deck = buildDeck();
R.add({ mesh: R.mesh(store.floor), mode: 3, rough: 0.95 });
R.add({ mesh: R.mesh(store.atlas), mode: 1, tex: tex.atlas, rough: 0.7, shadow: true });
R.add({ mesh: R.mesh(store.wood), mode: 2, rough: 0.55, shadow: true });
R.add({ mesh: R.mesh(store.lights), mode: 5, emis: 6 });
const neon = R.add({ mesh: R.mesh(store.neon), mode: 4, tex: tex.neon, emis: 7, rough: 0.8 });

R.add({ mesh: R.mesh(deck.wood), mode: 2, rough: 0.34, shadow: true });
R.add({ mesh: R.mesh(deck.dark), mode: 0, rough: 0.5, shadow: true });
R.add({ mesh: R.mesh(deck.platter), mode: 7, rough: 0.32, m: T(UNIT.SX, 0, UNIT.SZ), shadow: true });
R.add({ mesh: R.mesh(deck.panel), mode: 1, tex: tex.fascia, rough: 0.45 });
const lcdItem = R.add({ mesh: R.mesh(deck.lcd), mode: 4, tex: tex.lcd, emis: 1.5, rough: 0.3 });
R.add({ mesh: R.mesh(deck.dial), mode: 4, tex: tex.dial, emis: 0.9, rough: 0.3 });
const needle = R.add({ mesh: R.mesh(deck.needle), mode: 5, emis: 2.4 });
const knobMesh = R.mesh(deck.knob), btnMesh = R.mesh(deck.button), sleeveMesh = R.mesh(deck.sleeve);
const knobTune = R.add({ mesh: knobMesh, mode: 0, rough: 0.32, shadow: true }), knobVol = R.add({ mesh: knobMesh, mode: 0, rough: 0.32, shadow: true });
const buttons = Art.PANEL.buttons.map((b) => ({ ...b, item: R.add({ mesh: btnMesh, mode: 0, rough: 0.4 }), press: 0 }));
const arm = R.add({ mesh: R.mesh(deck.arm), mode: 0, rough: 0.38, shadow: true });
const disc = R.add({ mesh: R.mesh(deck.disc), kind: 'rec', shadow: true, visible: false });
const discEdge = R.add({ mesh: R.mesh(deck.edge), mode: 0, rough: 0.2, visible: false });
const uvt = (i) => { const u = heroes.uv(i); return [u[0], u[1], u[2] - u[0], u[3] - u[1]]; };
const sleeves = SHELF.map((_, i) => R.add({ mesh: sleeveMesh, mode: 1, tex: tex.hero, rough: 0.6, uv: uvt(i), shadow: true }));
const standSleeve = R.add({ mesh: sleeveMesh, mode: 1, tex: tex.hero, rough: 0.6, m: sleeveOnStand(), shadow: true, visible: false });
const lid = R.add({ mesh: R.mesh(deck.lid), kind: 'glass', mode: 6, tint: [0.3, 0.2, 0.13, 0.66] });
const lidFrame = R.add({ mesh: R.mesh(deck.lidFrame), mode: 0, rough: 0.6 });
R.foot.set([0, 0, 0.25, 0.19, CRATE.x, CRATE.z, CRATE.w / 2, CRATE.d / 2, STAND.x, STAND.z, 0.17, 0.07, 1.02, -0.16, 0.16, 0.16]);

// ------------------------------------------------------------------ what the deck is doing
const REST = { thp: 0, wp: 0, al: ALPHA_REST, zc: Z_UP, down: false, theta: 0, r: 0, auto: 0, cueUp: true, peak: 0, skips: 0 };
function telemetry() {
  const t = rig.tel; if (!t) return REST;
  const dt = Math.min(0.06, (performance.now() - rig.telAt) / 1000);
  return { ...t, thp: t.thp + t.wp * dt };
}
const overRecord = (al) => { const r = radiusForAlpha(al); return S.meta && r < R_DISC - 0.001 && r > R_LOCK - 0.002; };

// ------------------------------------------------------------------ actions
function wake() { rig.wake(); $('#start').classList.add('gone'); }
function toast(msg, ms = 2600) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms); }

function setSource(src) {
  if (S.source === src) return;
  S.source = src; rig.setSource(src);
  if (src === 'radio') rig.radio?.tune(S.freq);
  syncHud();
}
function setSpeed(rpm) { S.rpm = rpm; rig.post({ type: 'speed', rpm }); syncHud(); }
function setVolume(v) { S.volume = clamp(v, 0, 1); rig.setVolume(S.volume); $('#vol').value = S.volume; }
function tune(f) { S.freq = clamp(Math.round(f * 20) / 20, BAND[0], BAND[1]); rig.radio?.tune(S.freq); if (S.source !== 'radio') { const n = rig.radio?.nearest(S.freq); S.station = n && n.d < 0.22 ? n.station : null; } }
function seek(dir) {
  if (S.source !== 'radio') setSource('radio');
  const s = rig.radio?.seek(dir);
  if (s) S.freq = s.f; else toast('Nothing on the dial yet. Add a station with "Stations…"');
}

// ---- the listener's own stations ----
function setStations(list) {
  S.stations = [...list].sort((a, b) => a.f - b.f);
  saveStations(S.stations);
  dialArt = Art.makeDial(S.stations); R.texture(dialArt.canvas, tex.dial);     // reprint the tuning scale
  rig.radio?.setStations(S.stations);
  drawStationList(); syncHud();
}
function drawStationList() {
  const ul = $('#station-list'); ul.textContent = '';
  if (!S.stations.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'The dial is empty.'; ul.append(li); return; }
  for (const st of S.stations) {
    const li = document.createElement('li'), go = document.createElement('button'), del = document.createElement('button');
    go.type = del.type = 'button'; go.className = 'go'; del.className = 'del';
    go.textContent = `${st.f.toFixed(1)}  ${st.name}`; go.title = st.url; del.textContent = 'Remove'; del.setAttribute('aria-label', `Remove ${st.name}`);
    go.onclick = () => { wake(); setSource('radio'); tune(st.f); };
    del.onclick = () => setStations(S.stations.filter((k) => k !== st));
    li.append(go, del); ul.append(li);
  }
}
function openStations() {
  $('#st-freq').value = S.freq.toFixed(1); $('#st-error').textContent = '';
  drawStationList(); $('#stations').showModal();
}

function play() {
  if (!S.meta) { toast(S.loading ? 'Still cutting that one…' : 'Pick a record from the crate first'); return; }
  if (S.source !== 'phono') setSource('phono');
  S.playing = true; S.stopping = false; S.lockSince = 0;
  rig.post({ type: 'motor', on: true });
  rig.post({ type: 'auto', alpha: alphaForRadius(R_LEADIN - 0.0006), down: true });
  syncHud();
}
function stop() {
  S.playing = false; S.stopping = true;
  rig.post({ type: 'auto', alpha: ALPHA_REST, down: false });
  syncHud();
}
function toggleCue() {
  const t = telemetry();
  if (t.down || !t.cueUp) rig.post({ type: 'cue', up: true });
  else if (overRecord(t.al)) { rig.post({ type: 'motor', on: true }); rig.post({ type: 'cue', up: false }); S.playing = true; }
  else toast('Move the arm over the record first');
  syncHud();
}
function gotoTrack(i) {
  if (!S.meta || !S.meta.tracks[i]) return;
  if (S.source !== 'phono') setSource('phono');
  const th = Math.max(0, S.meta.tracks[i].theta0 - TAU * 0.8);
  S.playing = true; S.stopping = false; S.lockSince = 0;
  rig.post({ type: 'motor', on: true });
  rig.post({ type: 'auto', alpha: alphaForRadius(grooveRadius(S.meta.rTab, th)), down: true });
}

async function selectRecord(i) {
  const rec = SHELF[i];
  if (rec.id === 'custom' && (!S.custom || S.customCut) && S.record !== i) { $('#file').click(); return; }
  if (S.loading) { if (S.loading.i !== i) toast('One at a time: still cutting'); return; }
  if (S.record === i) { play(); return; }
  if (S.playing || telemetry().al < ALPHA_REST - 0.01) stop();
  if (S.source !== 'phono') setSource('phono');
  S.loading = { i, stage: 'Fetching', p: 0 }; syncHud();
  try {
    const progress = (stage, p) => { if (S.loading) { S.loading.stage = stage; S.loading.p = p; } };
    const audio = rec.id === 'custom' ? S.custom : await rig.fetchTracks(rec, progress);
    if (rec.id === 'custom') S.customCut = true;                    // its samples move into the worker
    const pressed = await rig.master_(rec, audio, progress);
    // wait for the arm to be parked before swapping the disc
    for (let k = 0; k < 80 && telemetry().al < ALPHA_REST - 0.01; k++) await new Promise((r) => setTimeout(r, 50));
    R.setRecord(pressed.meta, pressed.vis, Art.drawLabel(rec, pressed.meta.tracks));
    rig.post({ type: 'motor', on: false });
    rig.load(pressed);                                              // the walls move to the audio thread
    S.record = i; S.meta = pressed.meta; S.discDrop = 0; S.track = -1; S.loading = null;
    disc.visible = discEdge.visible = true; standSleeve.visible = true; standSleeve.uv = uvt(i);
    if (pressed.meta.truncated) toast('That was longer than one side holds, so the cut stops early');
    syncHud();
    if (rig.running) setTimeout(play, 750);
  } catch (err) {
    S.loading = null; toast(`Could not cut that record: ${err.message}`); syncHud();
  }
}

async function cutFile(file) {
  if (!file) return;
  wake();
  try {
    toast(`Decoding ${file.name}…`, 6000);
    const a = await rig.decodeFile(file), name = a.tracks[0].title;
    S.custom = a; S.customCut = false; CUSTOM.title = name.slice(0, 40); CUSTOM.tracks = [{ title: name, by: 'Cut from your file' }];
    if (S.record === SHELF.length - 1) S.record = -1;
    if (a.clipped) toast('Only the first 12 minutes fit on a side');
    selectRecord(SHELF.length - 1);
  } catch { toast('That file could not be decoded as audio'); }
}

// ------------------------------------------------------------------ picking
function hitTargets() {
  const t = [], tel = telemetry(), P = Art.PANEL, zf = UNIT.D / 2;
  const add = (id, m, h, extra) => t.push({ id, inv: invert(m), h, ...extra });
  add('arm', mul(armMatrix(tel.al, tel.zc), T(ARM_LE * 0.6, -0.008, -0.012)), [ARM_LE * 0.46, 0.02, 0.03]);
  add('disc', T(SPINDLE[0], UNIT.REC_Y - 0.003, SPINDLE[2]), [R_DISC, 0.004, R_DISC], { round: R_DISC });
  add('tune', T(P.tune.x, P.tune.y, zf + 0.009), [0.027, 0.027, 0.01]);
  add('vol', T(P.vol.x, P.vol.y, zf + 0.009), [0.027, 0.027, 0.01]);
  add('dial', T((P.dial.x0 + P.dial.x1) / 2, (P.dial.y0 + P.dial.y1) / 2, zf), [(P.dial.x1 - P.dial.x0) / 2, (P.dial.y1 - P.dial.y0) / 2, 0.003]);
  for (const b of P.buttons) add(`btn:${b.id}`, T(b.x, b.y, zf + 0.002), [b.w / 2, b.h / 2 + 0.002, 0.004]);
  SHELF.forEach((_, i) => { if (i !== S.record) add(`sleeve:${i}`, mul(sleeves[i].m, T(0, SLEEVE / 2, 0)), [SLEEVE / 2, SLEEVE / 2, 0.006]); });
  add('lid', mul(lidMatrix(S.lid), T(0, LID.h, UNIT.D / 2)), [UNIT.W / 2, 0.004, UNIT.D / 2]);
  add('body', T(0, 0.086, 0), [UNIT.W / 2, 0.074, UNIT.D / 2]);
  return t;
}
function pick(x, y) {
  const ray = R.ray(x, y); let best = null, bt = Infinity;
  for (const k of hitTargets()) {
    const d = rayBox(ray.o, ray.d, k.inv, k.h);
    if (d >= bt) continue;
    if (k.round) { const hx = ray.o[0] + ray.d[0] * d - SPINDLE[0], hz = ray.o[2] + ray.d[2] * d - SPINDLE[2]; if (Math.hypot(hx, hz) > k.round) continue; }
    bt = d; best = k;
  }
  return best ? { id: best.id, ray, t: bt } : { id: null, ray };
}
// where a pointer ray meets a horizontal plane, in deck-plane coordinates
function onPlane(ray, y) { const k = (y - ray.o[1]) / ray.d[1]; return k > 0 ? worldToPlane(ray.o[0] + ray.d[0] * k, ray.o[2] + ray.d[2] * k) : null; }
function onFront(ray) { const k = (UNIT.D / 2 - ray.o[2]) / ray.d[2]; return k > 0 ? [ray.o[0] + ray.d[0] * k, ray.o[1] + ray.d[1] * k] : null; }
const armAngleAt = (p) => Math.atan2(p[1] - PIVOT_Y, p[0] - PIVOT_X);
const wrap = (a) => a - TAU * Math.round(a / TAU);
const dialFreq = (x) => BAND[0] + ((x - Art.PANEL.dial.x0) / (Art.PANEL.dial.x1 - Art.PANEL.dial.x0) * 1024 - 40) / (1024 - 80) * (BAND[1] - BAND[0]);

const TIPS = {
  arm: 'Tonearm: drag it over the record and let go', disc: 'Record: drag to spin it by hand', tune: 'Tuning: drag or scroll', vol: 'Volume: drag or scroll',
  dial: 'Tuning scale: click a frequency', lid: 'Dust cover: click to open or close', body: 'Double-click to knock the cabinet',
};
function tipFor(id) {
  if (!id) return '';
  if (id.startsWith('sleeve:')) { const r = SHELF[+id.slice(7)]; return r.id === 'custom' && !S.custom ? 'Your Record: cut one from an audio file' : `${r.genre}: ${r.title} · ${r.artist}`; }
  if (id.startsWith('btn:')) return Art.PANEL.buttons.find((b) => b.id === id.slice(4)).label;
  return TIPS[id] || '';
}

canvas.addEventListener('pointerdown', (e) => {
  wake();
  const p = pick(e.clientX, e.clientY), tel = telemetry();
  canvas.setPointerCapture(e.pointerId);
  S.drag = { id: p.id, x: e.clientX, y: e.clientY, moved: 0 };
  if (p.id === 'arm') {
    const q = onPlane(p.ray, PIVOT[1] - 0.012);
    S.drag.off = q ? wrap(tel.al - armAngleAt(q)) : 0; S.drag.al = tel.al;
    rig.post({ type: 'hold', alpha: tel.al });
  } else if (p.id === 'disc') {
    const q = onPlane(p.ray, UNIT.REC_Y);
    S.drag.phi = Math.atan2(q[1], q[0]); S.drag.theta = tel.thp;
    rig.post({ type: 'hand', on: true, theta: tel.thp });
  } else if (p.id === 'dial') { const q = onFront(p.ray); if (q) { setSource('radio'); tune(dialFreq(q[0])); } }
  else if (p.id?.startsWith('btn:')) { const b = buttons.find((k) => k.id === p.id.slice(4)); b.press = 1; }
  canvas.style.cursor = p.id === 'arm' || p.id === 'disc' ? 'grabbing' : canvas.style.cursor;
});
canvas.addEventListener('pointermove', (e) => {
  const d = S.drag;
  if (!d) {
    const p = pick(e.clientX, e.clientY); S.hover = p.id;
    canvas.style.cursor = !p.id || p.id === 'body' ? 'default' : p.id === 'arm' || p.id === 'disc' ? 'grab' : p.id === 'tune' || p.id === 'vol' ? 'ns-resize' : 'pointer';
    const tip = $('#tip'), text = tipFor(p.id);
    tip.textContent = text; tip.classList.toggle('on', !!text); tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY + 16}px`;
    return;
  }
  const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
  const ray = R.ray(e.clientX, e.clientY);
  if (d.id === 'arm') {
    const q = onPlane(ray, PIVOT[1] - 0.012); if (!q) return;
    let a = armAngleAt(q) + d.off; a = d.al + wrap(a - d.al); d.al = clamp(a, ALPHA_MIN, ALPHA_REST);
    rig.post({ type: 'hold', alpha: d.al });
    if (d.al < ALPHA_REST - 0.04 && S.meta) rig.post({ type: 'motor', on: true });       // swinging the arm in starts the platter
  } else if (d.id === 'disc') {
    const q = onPlane(ray, UNIT.REC_Y); if (!q) return;
    const phi = Math.atan2(q[1], q[0]); d.theta -= wrap(phi - d.phi); d.phi = phi;
    rig.post({ type: 'hand', on: true, theta: d.theta });
  } else if (d.id === 'tune') { if (S.source !== 'radio') setSource('radio'); tune(S.freq + (dx - dy) * 0.02); }
  else if (d.id === 'vol') setVolume(S.volume + (dx - dy) / 240);
  else if (d.id === 'dial') { const q = onFront(ray); if (q) tune(dialFreq(q[0])); }
  else if (!d.id || d.id === 'body' || d.id === 'lid' || d.id.startsWith('sleeve')) {
    if (d.moved > 4) { S.cam.taz = clamp(S.cam.taz - dx * 0.005, -1.25, 1.25); S.cam.tel = clamp(S.cam.tel + dy * 0.004, 0.06, 1.35); $('.views .on')?.classList.remove('on'); }
  }
});
canvas.addEventListener('pointerup', (e) => {
  const d = S.drag; S.drag = null; if (!d) return;
  canvas.style.cursor = 'default';
  if (d.id === 'arm') {
    const lower = overRecord(d.al);
    if (lower) { S.playing = true; S.stopping = false; S.lockSince = 0; rig.post({ type: 'motor', on: true }); rig.post({ type: 'release', lower: true }); if (S.source !== 'phono') setSource('phono'); }
    else if (d.al > ALPHA_REST - 0.07) stop();
    else rig.post({ type: 'release', lower: false });
    syncHud();
  } else if (d.id === 'disc') rig.post({ type: 'hand', on: false });
  else if (d.moved < 5) {
    if (d.id?.startsWith('sleeve:')) selectRecord(+d.id.slice(7));
    else if (d.id?.startsWith('btn:')) pressButton(d.id.slice(4));
    else if (d.id === 'lid') S.lidT = S.lidT > 0.3 ? 0 : LID.open;
  }
});
canvas.addEventListener('pointerleave', () => { S.hover = null; $('#tip').classList.remove('on'); });
canvas.addEventListener('dblclick', (e) => { const p = pick(e.clientX, e.clientY); if (p.id === 'body' || p.id === null) knock(); });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const id = pick(e.clientX, e.clientY).id, k = -Math.sign(e.deltaY);
  if (id === 'tune' || id === 'dial') { wake(); if (S.source !== 'radio') setSource('radio'); tune(S.freq + k * 0.1); }
  else if (id === 'vol') setVolume(S.volume + k * 0.04);
  else { S.cam.tdist = clamp(S.cam.tdist * Math.exp(e.deltaY * 0.0012), 0.5, 3.4); $('.views .on')?.classList.remove('on'); }
}, { passive: false });

function knock() { rig.post({ type: 'knock', strength: 1.3 }); S.shake = 1; }
function pressButton(id) {
  if (id === 'phono') setSource('phono');
  else if (id === 'radio') setSource('radio');
  else if (id === 'speed') setSpeed(S.rpm === 33 ? 45 : 33);
  else if (id === 'play') (S.playing || telemetry().down ? stop : play)();
  else if (id === 'cue') toggleCue();
}

// ------------------------------------------------------------------ HUD
$('#src-phono').onclick = () => { wake(); setSource('phono'); };
$('#src-radio').onclick = () => { wake(); setSource('radio'); };
$('#play').onclick = () => { wake(); pressButton('play'); };
$('#cue').onclick = () => { wake(); toggleCue(); };
$('#speed').onclick = () => { wake(); setSpeed(S.rpm === 33 ? 45 : 33); };
$('#seek-down').onclick = () => { wake(); seek(-1); };
$('#seek-up').onclick = () => { wake(); seek(1); };
$('#stations-btn').onclick = () => { wake(); openStations(); };
$('#st-close').onclick = () => $('#stations').close();
$('#station-form').onsubmit = (e) => {
  e.preventDefault();
  try {
    const st = makeStation(S.stations, { name: $('#st-name').value, url: $('#st-url').value, f: $('#st-freq').value });
    setStations([...S.stations, st]);
    $('#st-name').value = ''; $('#st-url').value = ''; $('#st-error').textContent = '';
    setSource('radio'); tune(st.f);
  } catch (err) { $('#st-error').textContent = err.message; }
};
$('#knock').onclick = () => { wake(); knock(); };
$('#cut').onclick = () => $('#file').click();
$('#vol').oninput = (e) => { wake(); setVolume(+e.target.value); };
$('#file').onchange = (e) => { cutFile(e.target.files[0]); e.target.value = ''; };
$('#start').onclick = wake;
for (const b of document.querySelectorAll('.views button')) b.onclick = () => {
  const [az, el, dist] = VIEWS[b.dataset.view]; Object.assign(S.cam, { taz: az, tel: el, tdist: dist });
  document.querySelectorAll('.views button').forEach((k) => k.classList.toggle('on', k === b));
};
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find((k) => k.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(k.name)); if (f) cutFile(f); });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || $('#stations').open) return;
  const k = e.key.toLowerCase(); wake();
  if (k === ' ') { e.preventDefault(); pressButton('play'); }
  else if (k === 'arrowright') (e.shiftKey ? seek(1) : (setSource('radio'), tune(S.freq + 0.1)));
  else if (k === 'arrowleft') (e.shiftKey ? seek(-1) : (setSource('radio'), tune(S.freq - 0.1)));
  else if (k === 'arrowup') setVolume(S.volume + 0.05);
  else if (k === 'arrowdown') setVolume(S.volume - 0.05);
  else if (k === 'p') setSource('phono'); else if (k === 'f' || k === 'r') setSource('radio');
  else if (k === 'c') toggleCue(); else if (k === 's') setSpeed(S.rpm === 33 ? 45 : 33); else if (k === 'k') knock();
  else if (k === 'l') S.lidT = S.lidT > 0.3 ? 0 : LID.open;
  else if (k >= '1' && k <= '9' && +k <= SHELF.length) selectRecord(+k - 1);
});

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let hudKey = '';
function syncHud() {
  const tel = telemetry(), radio = S.source === 'radio', rec = S.record >= 0 ? SHELF[S.record] : null;
  $('#src-phono').classList.toggle('on', !radio); $('#src-radio').classList.toggle('on', radio);
  $('#speed').textContent = S.rpm === 33 ? '33⅓' : '45';
  $('#play').textContent = S.playing || tel.down ? 'Stop' : 'Start';
  document.body.dataset.source = S.source;
  let kicker, title, sub, tracks = '';
  if (radio) {
    kicker = `FM ${S.freq.toFixed(2)} MHz`;
    title = S.station ? S.station.name : S.stations.length ? 'Static' : 'No stations yet';
    sub = S.station ? ({ live: 'On air', buffering: 'Tuning in…', tuning: 'Tuning in…', error: 'No signal from that address', static: '' }[S.radioState] || '')
      : S.stations.length ? 'Turn the tuning knob to find a station' : 'The dial ships empty. Add a stream with "Stations…"';
  } else if (S.loading) {
    kicker = 'In the cutting room'; title = SHELF[S.loading.i].title; sub = `${S.loading.stage}… ${Math.round(S.loading.p * 100)}%`;
  } else if (rec) {
    const now = tel.down && S.track >= 0 ? rec.tracks[S.track] : null;
    kicker = `${rec.genre} · ${tel.down ? 'now playing' : 'on the platter'}`; title = rec.title;
    sub = now ? `${now.by}${now.licence ? ` · ${now.licence}` : ''}` : `${rec.artist} · ${conditionName(rec)} copy`;
    tracks = S.meta.tracks.map((t, i) => `<button data-track="${i}" class="${i === S.track ? 'on' : ''}">${i + 1}. ${escapeHtml(t.title)}</button>`).join('');
  } else { kicker = 'Listening station'; title = 'Pick a record'; sub = 'Flip through the crate on the left, or tune the radio'; }
  const key = [kicker, title, sub, tracks].join('|');
  if (key !== hudKey) {
    hudKey = key; $('#np-kicker').textContent = kicker; $('#np-title').textContent = title; $('#np-sub').textContent = sub; $('#np-tracks').innerHTML = tracks;
    for (const b of document.querySelectorAll('#np-tracks button')) b.onclick = () => { wake(); gotoTrack(+b.dataset.track); };
  }
}
const conditionName = (rec) => ({ mint: 'a mint', good: 'a very good', played: 'a well played', thrift: 'a thrift-store' }[rec.condition] || 'a');
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let lcdKey = '';
function drawLcd(tel) {
  const radio = S.source === 'radio', level = Math.min(1, Math.sqrt(S.level) * 2.2);
  const st = { tags: [['PHONO', !radio], ['FM', radio], ['33', S.rpm === 33], ['45', S.rpm === 45], ['STEREO', radio ? S.radioState === 'live' : tel.down]], level };
  if (radio) {
    st.big = S.freq.toFixed(2); st.unit = 'MHz'; st.bars = Math.round(S.strength * 5);
    st.line = S.station ? `${S.station.name}${S.radioState === 'live' ? '' : S.radioState === 'error' ? '  NO SIGNAL' : '  ...'}` : S.stations.length ? '- - -' : 'NO STATIONS';
  } else if (S.loading) { st.big = `CUT ${String(Math.round(S.loading.p * 100)).padStart(2, ' ')}%`; st.line = S.loading.stage; }
  else if (!S.meta) { st.big = 'NO DISC'; st.line = 'PICK A RECORD'; }
  else if (tel.down && S.track >= 0) {
    const t = S.meta.tracks[S.track]; st.big = `${S.track + 1} ${fmt((tel.theta - t.theta0) / TAU * 1.8)}`; st.line = t.title;
  } else if (tel.down) { st.big = tel.theta > S.meta.thetaLock - 1 ? 'END' : '- -:- -'; st.line = SHELF[S.record].title; }
  else { st.big = S.playing ? 'CUE' : 'READY'; st.line = SHELF[S.record].title; }
  const key = JSON.stringify([st.tags, st.big, st.unit, st.line, Math.round(level * 12), st.bars]);
  if (key === lcdKey) return;
  lcdKey = key; Art.drawLCD(lcd, st); R.texture(lcd, tex.lcd);
}

// ------------------------------------------------------------------ frame
let last = performance.now(), hudAt = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  R.resize();
  const tel = telemetry(), c = S.cam, ease = 1 - Math.exp(-dt * 7);
  c.az += (c.taz - c.az) * ease; c.el += (c.tel - c.el) * ease; c.dist += (c.tdist - c.dist) * ease;
  const shake = S.shake ? (S.shake = Math.max(0, S.shake - dt * 6), Math.sin(now * 0.09) * 0.004 * S.shake) : 0;
  R.camera({ az: c.az + shake, el: c.el, dist: c.dist, pivot: CAM_PIVOT, frame: Math.max(0, 0.2 * c.dist * (1 - c.el / 0.85)) });

  // deck logic that follows the audio thread
  if (S.stopping && tel.al > ALPHA_REST - 0.012 && tel.auto === 0) { S.stopping = false; rig.post({ type: 'motor', on: false }); }
  if (S.meta) {
    S.track = tel.down ? S.meta.tracks.findIndex((t) => tel.theta >= t.theta0 - 0.5 && tel.theta < t.theta1 + 2) : -1;
    if (tel.down && tel.theta > S.meta.thetaLock - 0.3) { S.lockSince ||= now; if (now - S.lockSince > 7000 && !S.drag) { S.lockSince = 0; stop(); } } else S.lockSince = 0;
  }
  if (rig.radio) { S.radioState = rig.radio.state; S.strength = rig.radio.strength; if (S.source === 'radio') S.station = rig.radio.station; }
  S.level += (rig.level() - S.level) * (1 - Math.exp(-dt * 12));

  // move things
  S.discDrop = Math.min(1, S.discDrop + dt * 1.5);
  const drop = (1 - S.discDrop) ** 2 * 0.22;
  disc.m = discEdge.m = mul(T(SPINDLE[0], SPINDLE[1] + drop, SPINDLE[2]), RY(-tel.thp), RX(drop * 0.6));
  arm.m = armMatrix(tel.al, tel.zc);
  S.lid += (S.lidT - S.lid) * (1 - Math.exp(-dt * 6)); lid.m = lidFrame.m = lidMatrix(S.lid);
  const P = Art.PANEL, zf = UNIT.D / 2;
  knobTune.m = mul(T(P.tune.x, P.tune.y, zf), RZ(-((S.freq - BAND[0]) / (BAND[1] - BAND[0]) * 4.7 - 2.35)));
  knobVol.m = mul(T(P.vol.x, P.vol.y, zf), RZ(-(S.volume * 4.7 - 2.35)));
  needle.m = T(P.dial.x0 + dialArt.x(S.freq) * (P.dial.x1 - P.dial.x0), 0, 0);
  for (const b of buttons) {
    const lit = (b.id === 'phono' && S.source === 'phono') || (b.id === 'radio' && S.source === 'radio');
    b.press = Math.max(0, b.press - dt * 5);
    b.item.m = T(b.x, b.y, zf - 0.0028 * Math.max(b.press, lit ? 0.6 : 0));
  }
  SHELF.forEach((_, i) => {
    const want = S.hover === `sleeve:${i}` ? 0.105 : S.loading?.i === i ? 0.14 : 0;
    S.lift[i] += (want - S.lift[i]) * (1 - Math.exp(-dt * 12));
    sleeves[i].visible = i !== S.record;
    sleeves[i].m = sleeveInCrate(i, S.lift[i] + i * CRATE.rise, S.lift[i] * 0.5);
  });
  R.neon = 0.93 + 0.07 * Math.sin(now * 0.021) * Math.sin(now * 0.0013); neon.emis = 7 * R.neon;
  drawLcd(tel);
  if (now - hudAt > 200) { hudAt = now; syncHud(); }
  R.render(now / 1000);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ go
rig.init().then(() => {
  rig.setVolume(S.volume); rig.post({ type: 'speed', rpm: S.rpm });
  rig.radio.setStations(S.stations);
  if (rig.running) $('#start').classList.add('gone');
}).catch((e) => toast(`Audio could not start: ${e.message}`, 8000));
syncHud();
requestAnimationFrame(frame);
selectRecord(0);                       // have something on the platter when the listener arrives
window.__sideB = { S, R, rig, telemetry, play, stop, selectRecord, setSource, tune };   // for poking at from the console
