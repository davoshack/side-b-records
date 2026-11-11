// Everything printed: sleeves, labels, shop signs, the neon, the fascia, the LCD. All drawn with
// canvas 2D at load time; there are no image files.
import { rng } from '../audio/dsp.js';
import { BAND } from '../audio/radio.js';

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const ROUND = '"Arial Rounded MT Bold", "Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"SF Mono", Menlo, Consolas, "Courier New", monospace';

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// [u0, v0, u1, v1] for a pixel rect, with v up (textures are uploaded flipped)
const uvRect = (W, H, x, y, w, h) => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];

const PALETTES = [
  ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557'], ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
  ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#e0e1dd'], ['#f72585', '#7209b7', '#3a0ca3', '#4361ee', '#4cc9f0'],
  ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'], ['#fefae0', '#dda15e', '#bc6c25', '#606c38', '#283618'],
  ['#f8f9fa', '#dee2e6', '#adb5bd', '#495057', '#212529'], ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#d90429'],
  ['#132a13', '#31572c', '#4f772d', '#90a955', '#ecf39e'], ['#3d348b', '#7678ed', '#f7b801', '#f18701', '#f35b04'],
  ['#fdf0d5', '#c1121f', '#780000', '#003049', '#669bbc'], ['#000000', '#14213d', '#fca311', '#e5e5e5', '#ffffff'],
];

function fakeText(ctx, R, x, y, w, col, lines = 2, h = 5) {
  ctx.fillStyle = col;
  for (let i = 0; i < lines; i++) ctx.fillRect(x, y + i * h * 2, w * (0.45 + 0.55 * R()), h);
}

// An anonymous sleeve: one of a handful of period layouts in a random palette.
export function drawCover(ctx, x, y, s, seed) {
  const R = rng(seed * 7919 + 13), pal = [...R.pick(PALETTES)].sort(() => R() - 0.5), style = R.int(9);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip(); ctx.translate(x, y);
  ctx.fillStyle = pal[0]; ctx.fillRect(0, 0, s, s);
  const cx = s * (0.35 + 0.3 * R()), cy = s * (0.4 + 0.25 * R());
  if (style === 0) {                                             // rings
    for (let i = 8; i > 0; i--) { ctx.fillStyle = pal[i % pal.length]; ctx.beginPath(); ctx.arc(cx, cy, s * 0.07 * i, 0, 7); ctx.fill(); }
  } else if (style === 1) {                                      // stripes
    const n = 5 + R.int(8), rot = R.pick([0, Math.PI / 4, Math.PI / 2, -Math.PI / 6]);
    ctx.translate(s / 2, s / 2); ctx.rotate(rot);
    for (let i = 0; i < n * 2; i++) { ctx.fillStyle = pal[i % pal.length]; ctx.fillRect(-s, -s + i * (2 * s / (n * 2)), 2 * s, s / n + 1); }
    ctx.rotate(-rot); ctx.translate(-s / 2, -s / 2);
  } else if (style === 2) {                                      // sun over a block
    ctx.fillStyle = pal[1]; ctx.beginPath(); ctx.arc(cx, cy, s * (0.2 + 0.15 * R()), 0, 7); ctx.fill();
    ctx.fillStyle = pal[2]; ctx.fillRect(0, s * 0.62, s, s * 0.38);
  } else if (style === 3) {                                      // dots
    const n = 4 + R.int(5), d = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = pal[1 + ((i * 3 + j * 5 + R.int(2)) % 4)]; ctx.beginPath(); ctx.arc((i + 0.5) * d, (j + 0.5) * d, d * (0.25 + 0.18 * R()), 0, 7); ctx.fill(); }
  } else if (style === 4) {                                      // sky and hills
    const g = ctx.createLinearGradient(0, 0, 0, s); g.addColorStop(0, pal[1]); g.addColorStop(0.6, pal[2]); g.addColorStop(1, pal[0]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = pal[(3 + k) % 5]; ctx.beginPath(); ctx.moveTo(0, s);
      for (let i = 0; i <= 8; i++) ctx.lineTo(i * s / 8, s * (0.55 + 0.12 * k) + s * 0.1 * Math.sin(i * 1.3 + k * 2 + seed) * R());
      ctx.lineTo(s, s); ctx.fill();
    }
  } else if (style === 5) {                                      // the portrait: every bin has a hundred of these
    const g = ctx.createRadialGradient(cx, cy, s * 0.05, cx, cy, s * 0.8); g.addColorStop(0, pal[1]); g.addColorStop(1, pal[0]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    const skin = R.pick(['#e8c4a0', '#c99a6e', '#8d5a3b', '#f1d3b8', '#6f4530']);
    ctx.fillStyle = pal[3]; ctx.beginPath(); ctx.ellipse(s * 0.5, s * 1.02, s * 0.36, s * 0.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.5, s * 0.15, s * 0.19, 0, 0, 7); ctx.fill();
    ctx.fillStyle = R.pick(['#1b1410', '#3a2618', '#6b4a2a', '#111']); ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.41, s * 0.18, s * 0.15, 0, Math.PI, 0); ctx.fill();
  } else if (style === 6) {                                      // shards
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = pal[i % 5]; ctx.globalAlpha = 0.85; ctx.beginPath();
      ctx.moveTo(R() * s, R() * s); ctx.lineTo(R() * s, R() * s); ctx.lineTo(R() * s, R() * s); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (style === 7) {                                      // type only, framed
    ctx.strokeStyle = pal[2]; ctx.lineWidth = s * 0.02; ctx.strokeRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84);
    fakeText(ctx, R, s * 0.16, s * 0.3, s * 0.6, pal[3], 4, s * 0.035);
  } else {                                                       // half and half
    ctx.fillStyle = pal[1]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.fill();
    ctx.fillStyle = pal[4]; ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.16, 0, 7); ctx.fill();
  }
  if (R() < 0.8) {                                               // title block
    const top = R() < 0.6;
    fakeText(ctx, R, s * 0.07, top ? s * 0.07 : s * 0.84, s * (0.3 + 0.4 * R()), R() < 0.5 ? '#f6f1e4' : '#15120f', 1 + R.int(2), s * 0.03);
  }
  const v = ctx.createLinearGradient(0, 0, s, s); v.addColorStop(0, 'rgba(255,255,255,0.06)'); v.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, s, s);
  ctx.restore();
}

const SIGNS = [
  ['BAROQUE', '#c9252d'], ['ROMANTIC', '#c9252d'], ['OPERA', '#c9252d'], ['PIANO', '#c9252d'], ['SYMPHONY', '#c9252d'], ['CHAMBER', '#c9252d'],
  ['CHORAL', '#c9252d'], ['STRINGS', '#c9252d'], ['CONCERTO', '#c9252d'], ['BALLET', '#c9252d'], ['EARLY MUSIC', '#c9252d'], ['MODERN', '#c9252d'],
  ['SALE 5.99', '#1f7a4d'], ['2 FOR 10', '#1f7a4d'], ['NOW PLAYING', '#f4efe2'], ['NEW ARRIVALS', '#f2c230'],
];
export const SIGN = { GENRES: 12, SALE: 12, TWOFOR: 13, NOW_PLAYING: 14, NEW: 15 };

// One texture for the whole shop: 56 anonymous sleeves and 16 signs.
export function makeAtlas() {
  const W = 2048, c = canvas(W, W), ctx = c.getContext('2d'), S = 256;
  for (let i = 0; i < 56; i++) drawCover(ctx, (i % 8) * S, Math.floor(i / 8) * S, S, i + 1);
  SIGNS.forEach(([text, bg], i) => {
    const x = (i % 8) * S, y = 7 * S + Math.floor(i / 8) * 128, light = bg === '#f4efe2' || bg === '#f2c230';
    ctx.fillStyle = bg; ctx.fillRect(x, y, S, 128);
    ctx.strokeStyle = light ? '#1a1a1a' : 'rgba(255,255,255,0.85)'; ctx.lineWidth = 5; ctx.strokeRect(x + 9, y + 9, S - 18, 110);
    ctx.fillStyle = light ? '#1a1a1a' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = 64; ctx.font = `800 ${size}px ${SANS}`;
    while (ctx.measureText(text).width > S - 44) { size -= 2; ctx.font = `800 ${size}px ${SANS}`; }
    ctx.fillText(text, x + S / 2, y + 66);
  });
  return {
    canvas: c, covers: 56,
    cover: (i) => uvRect(W, W, (i % 8) * S + 1, Math.floor(i / 8) * S + 1, S - 2, S - 2),
    sign: (i) => uvRect(W, W, (i % 8) * S + 1, 7 * S + Math.floor(i / 8) * 128 + 1, S - 2, 126),
  };
}

// ------------------------------------------------------------------ the playable records

function heroArt(ctx, s, rec) {
  const { style, bg, ink, accent } = rec.art, R = rng(rec.seed * 31 + 7);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, s, s);
  let titleInk = ink, serif = false, upper = false;
  if (style === 'horizon') {              // a moon over water, in bands
    for (let i = 0; i < 22; i++) {
      const t = i / 22; ctx.fillStyle = i % 2 ? accent : ink; ctx.globalAlpha = 0.12 + 0.6 * t * t;
      ctx.beginPath(); ctx.moveTo(0, s * (0.46 + 0.54 * t));
      for (let k = 0; k <= 16; k++) ctx.lineTo(k * s / 16, s * (0.46 + 0.54 * t) + s * 0.012 * (1 + 3 * t) * Math.sin(k * 0.9 + i * 1.7));
      ctx.lineTo(s, s); ctx.lineTo(0, s); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(s * 0.7, s * 0.36, s * 0.085, 0, 7); ctx.fill();
    serif = true;
  } else if (style === 'peaks') {         // sunrise behind the mountain
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(s * 0.5, s * 0.62, s * 0.2, 0, 7); ctx.fill();
    for (let i = 0; i < 9; i++) { ctx.strokeStyle = accent; ctx.globalAlpha = 0.35; ctx.lineWidth = s * 0.006; ctx.beginPath(); ctx.arc(s * 0.5, s * 0.62, s * (0.23 + i * 0.035), Math.PI, 2 * Math.PI); ctx.stroke(); }
    ctx.globalAlpha = 1;
    const ridge = (y0, amp, col, seed) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, s);
      for (let k = 0; k <= 12; k++) ctx.lineTo(k * s / 12, s * y0 - s * amp * Math.abs(Math.sin(k * 1.9 + seed)) * (0.5 + 0.5 * Math.sin(k * 0.7 + seed * 2)));
      ctx.lineTo(s, s); ctx.fill();
    };
    ridge(0.74, 0.3, '#5d6b7a', 1.3); ridge(0.84, 0.22, ink, 4.1);
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(s * 0.44, s); ctx.lineTo(s * 0.5, s * 0.86); ctx.lineTo(s * 0.56, s); ctx.fill();   // the hall's doorway
    serif = true;
  } else if (style === 'stars') {         // nocturnes: a night sky over the lid of a piano
    for (let i = 0; i < 130; i++) { const r = s * (0.0015 + 0.004 * R() * R()); ctx.fillStyle = ink; ctx.globalAlpha = 0.35 + 0.65 * R(); ctx.beginPath(); ctx.arc(R() * s, s * (0.26 + 0.52 * R()), r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(s * 0.68, s * 0.42, s * 0.1, 0, 7); ctx.fill();
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(s * 0.715, s * 0.395, s * 0.09, 0, 7); ctx.fill();
    ctx.fillStyle = '#07080f'; ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(0, s * 0.8); ctx.bezierCurveTo(s * 0.3, s * 0.7, s * 0.45, s * 0.92, s * 0.7, s * 0.84); ctx.bezierCurveTo(s * 0.85, s * 0.8, s * 0.95, s * 0.86, s, s * 0.9); ctx.lineTo(s, s); ctx.fill();
    serif = true;
  } else if (style === 'pipes') {         // baroque: organ pipes
    const n = 15;
    for (let i = 0; i < n; i++) {
      const t = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2), h = s * (0.26 + 0.3 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2))), w = s * 0.046, x = s * 0.09 + i * s * 0.0553, y0 = s * 0.9;
      ctx.fillStyle = i % 2 ? accent : ink; ctx.beginPath(); ctx.roundRect(x, y0 - h, w, h, [w / 2, w / 2, 0, 0]); ctx.fill();
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(x + w * 0.2, y0 - s * 0.07); ctx.lineTo(x + w * 0.8, y0 - s * 0.07); ctx.lineTo(x + w * 0.5, y0 - s * 0.045); ctx.fill();
    }
    ctx.fillStyle = ink; ctx.fillRect(s * 0.07, s * 0.9, s * 0.86, s * 0.014);
    serif = true;
  } else if (style === 'petals') {        // ballet: a flower, turning
    ctx.translate(s * 0.5, s * 0.64);
    for (let ring = 3; ring > 0; ring--) for (let i = 0; i < 12; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 6 + ring * 0.26); ctx.fillStyle = ring % 2 ? accent : ink; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.ellipse(0, -s * 0.058 * ring, s * 0.021 * ring, s * 0.058 * ring, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(0, 0, s * 0.035, 0, 7); ctx.fill();
    ctx.translate(-s * 0.5, -s * 0.64);
    serif = true;
  } else if (style === 'burst') {         // a sunburst, for something bright
    ctx.translate(s * 0.5, s * 0.6);
    for (let i = 0; i < 28; i++) { ctx.fillStyle = i % 2 ? accent : ink; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s, i * Math.PI / 14, (i + 1) * Math.PI / 14); ctx.fill(); }
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, s * 0.27, 0, 7); ctx.fill();
    for (let i = 5; i > 0; i--) { ctx.fillStyle = i % 2 ? ink : '#e0a52e'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.045 * i, s * 0.04 * i, 0, 0, 7); ctx.fill(); }
    ctx.translate(-s * 0.5, -s * 0.6);
    ctx.fillStyle = bg; ctx.fillRect(0, s * 0.05, s, s * 0.21);
    upper = true;
  } else if (style === 'rings') {         // sound rising off a keyboard
    for (let i = 14; i > 0; i--) {
      ctx.strokeStyle = i % 3 === 0 ? accent : ink; ctx.lineWidth = s * 0.012;
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.64, s * 0.03 * i, Math.PI * (1 + (i % 4) * 0.04), Math.PI * (2 - (i % 5) * 0.03)); ctx.stroke();
    }
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(s * 0.5, s * 0.64, s * 0.02, 0, 7); ctx.fill();
    for (let i = 0; i < 24; i++) { const black = i % 5 === 1 || i % 5 === 3; ctx.fillStyle = black ? ink : accent; ctx.fillRect(s * (0.08 + i * 0.035), s * 0.7, s * 0.028, s * (black ? 0.07 : 0.11)); }
    serif = true;
  } else if (style === 'bolt') {          // fate knocking: one loud shape
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(s * 0.2, s); ctx.lineTo(s, s * 0.34); ctx.lineTo(s, s); ctx.fill();
    ctx.fillStyle = ink; ctx.beginPath();
    for (const [x, y] of [[0.62, 0.27], [0.33, 0.62], [0.49, 0.62], [0.36, 0.95], [0.72, 0.52], [0.55, 0.52], [0.7, 0.27]]) ctx.lineTo(s * x, s * y);
    ctx.fill();
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(255,255,255,${0.05 * R()})`; ctx.fillRect(R() * s, R() * s, 1.5, 1.5); }   // photocopy grain
    upper = true;
  } else {                                // dub plate: black sleeve, a strip of tape
    ctx.fillStyle = '#e9e2cf'; ctx.save(); ctx.translate(s * 0.5, s * 0.5); ctx.rotate(-0.04); ctx.fillRect(-s * 0.33, -s * 0.08, s * 0.66, s * 0.16);
    ctx.fillStyle = '#1a1a1a'; ctx.font = `italic 600 ${s * 0.07}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('your record here', 0, 0); ctx.restore();
    ctx.fillStyle = accent; ctx.font = `700 ${s * 0.04}px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText('CUT TO ORDER  ·  DROP AN AUDIO FILE', s * 0.5, s * 0.9);
    return;
  }
  // title block
  ctx.fillStyle = titleInk; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const title = upper ? rec.title.toUpperCase() : rec.title, face = serif ? SERIF : SANS;
  let size = s * 0.105; ctx.font = `800 ${size}px ${face}`;
  while (ctx.measureText(title).width > s * 0.84) { size *= 0.95; ctx.font = `800 ${size}px ${face}`; }
  const ty = 0.17;
  ctx.fillText(title, s * 0.08, s * ty);
  let as = s * 0.04; ctx.font = `600 ${as}px ${SANS}`; const artist = rec.artist.toUpperCase();
  while (ctx.measureText(artist).width > s * 0.84) { as *= 0.95; ctx.font = `600 ${as}px ${SANS}`; }
  ctx.fillStyle = style === 'burst' ? ink : accent; ctx.fillText(artist, s * 0.083, s * (ty + 0.06));
  const n = parseInt(bg.slice(1), 16), dark = 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255) < 110;
  ctx.font = `500 ${s * 0.026}px ${SANS}`; ctx.fillStyle = dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.6)'; ctx.textAlign = 'left';
  ctx.fillText(`${rec.cat}  ·  SIDE B RECORDS`, s * 0.08, s * 0.955);
  // the shop's sticker: genre and price
  ctx.save(); ctx.translate(s * 0.865, s * 0.865); ctx.rotate(-0.12);
  ctx.fillStyle = '#f6d32d'; ctx.beginPath(); ctx.arc(0, 0, s * 0.082, 0, 7); ctx.fill();
  ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let gs = s * 0.034; ctx.font = `800 ${gs}px ${SANS}`; const g = rec.genre.toUpperCase();
  while (ctx.measureText(g).width > s * 0.14) { gs *= 0.94; ctx.font = `800 ${gs}px ${SANS}`; }
  ctx.fillText(g, 0, -s * 0.018); ctx.font = `800 ${s * 0.042}px ${SANS}`; ctx.fillText('5.99', 0, s * 0.028);
  ctx.restore();
}

// The playable records' sleeves, four to a row in one texture.
export function makeHeroAtlas(records) {
  const S = 512, rows = Math.ceil(records.length / 4), W = 4 * S, H = rows * S, c = canvas(W, H), ctx = c.getContext('2d');
  records.forEach((rec, i) => {
    ctx.save(); ctx.translate((i % 4) * S, Math.floor(i / 4) * S); ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.clip();
    heroArt(ctx, S, rec);
    ctx.restore();
  });
  return { canvas: c, uv: (i) => uvRect(W, H, (i % 4) * S + 1, Math.floor(i / 4) * S + 1, S - 2, S - 2) };
}

// The paper label in the middle of the disc. The canvas spans the label's full diameter.
export function drawLabel(rec, tracks) {
  const s = 512, c = canvas(s, s), ctx = c.getContext('2d'), { paper, ink } = rec.label, m = s / 2;
  ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = paper; ctx.beginPath(); ctx.arc(m, m, m - 4, 0, 7); ctx.fill();
  ctx.strokeStyle = ink; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
  for (const r of [m - 14, m - 20]) { ctx.beginPath(); ctx.arc(m, m, r, 0, 7); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 44px ${SANS}`; ctx.fillText('SIDE B', m, 92);
  ctx.font = `600 13px ${SANS}`; ctx.fillText('R  E  C  O  R  D  S', m, 122);
  ctx.fillRect(m - 60, 136, 120, 2);
  let size = 30; ctx.font = `700 ${size}px ${SERIF}`;
  while (ctx.measureText(rec.title).width > 250) { size -= 1; ctx.font = `700 ${size}px ${SERIF}`; }
  ctx.fillText(rec.title, m, 338);
  ctx.font = `500 16px ${SANS}`; ctx.fillText(rec.artist, m, 366);
  ctx.font = `500 13px ${SANS}`;
  (tracks || []).slice(0, 5).forEach((t, i) => { let name = `${i + 1}. ${t.title}`; if (name.length > 34) name = name.slice(0, 33) + '…'; ctx.fillText(name, m, 392 + i * 17); });
  ctx.font = `700 15px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('STEREO', 62, 250); ctx.fillText('33⅓ RPM', 62, 270);
  ctx.textAlign = 'right'; ctx.fillText(rec.cat, s - 62, 250); ctx.fillText(`℗ ${rec.year}`, s - 62, 270);
  ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.arc(m, m, 19, 0, 7); ctx.fill();
  return c;
}

// The sign on the back wall. Black is "off": the shader treats this texture as emitted light.
export function makeNeon() {
  const c = canvas(2048, 512), ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 2048, 512);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.font = `700 330px ${ROUND}`;
  const text = 'RECORDS'; let x = 1024 - (ctx.measureText(text).width + 6 * 26) / 2;
  const each = (fn) => { let cx = x; for (const ch of text) { const w = ctx.measureText(ch).width; fn(ch, cx + w / 2); cx += w + 26; } };
  ctx.shadowColor = '#ff3b12'; ctx.shadowBlur = 70; ctx.fillStyle = '#b3260a'; each((ch, cx) => ctx.fillText(ch, cx, 268));
  ctx.shadowBlur = 24; ctx.fillStyle = '#ff5a26'; each((ch, cx) => ctx.fillText(ch, cx, 268));
  ctx.shadowBlur = 0; ctx.strokeStyle = '#ffd9b8'; ctx.lineWidth = 9; each((ch, cx) => ctx.strokeText(ch, cx, 268));
  return c;
}

// ------------------------------------------------------------------ the unit's front panel

export const FASCIA = { x0: -0.235, x1: 0.235, y0: 0.020, y1: 0.148, W: 2048, H: 558 };
const fx = (x) => (x - FASCIA.x0) / (FASCIA.x1 - FASCIA.x0) * FASCIA.W;
const fy = (y) => (FASCIA.y1 - y) / (FASCIA.y1 - FASCIA.y0) * FASCIA.H;
export const PANEL = {
  lcd: { x0: -0.088, x1: 0.046, y0: 0.094, y1: 0.139 },
  dial: { x0: -0.088, x1: 0.046, y0: 0.058, y1: 0.086 },
  grille: { x0: -0.224, x1: -0.106, y0: 0.030, y1: 0.139 },
  tune: { x: 0.104, y: 0.097, r: 0.024 }, vol: { x: 0.184, y: 0.097, r: 0.024 },
  buttons: [
    { id: 'phono', label: 'PHONO', x: -0.074 }, { id: 'radio', label: 'FM', x: -0.045 }, { id: 'speed', label: '33 / 45', x: -0.016 },
    { id: 'play', label: 'START · STOP', x: 0.013 }, { id: 'cue', label: 'CUE', x: 0.042 },
  ].map((b) => ({ ...b, y: 0.036, w: 0.023, h: 0.012 })),
};

export function makeFascia() {
  const c = canvas(FASCIA.W, FASCIA.H), ctx = c.getContext('2d'), R = rng(5);
  ctx.fillStyle = '#17181a'; ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(255,255,255,${0.012 + 0.025 * R()})`; ctx.fillRect(0, R() * c.height, c.width, 1); }   // brushing
  const g = PANEL.grille; ctx.fillStyle = '#0b0b0c'; ctx.beginPath(); ctx.roundRect(fx(g.x0), fy(g.y1), fx(g.x1) - fx(g.x0), fy(g.y0) - fy(g.y1), 14); ctx.fill();
  ctx.fillStyle = '#26282b';
  for (let y = fy(g.y1) + 14, row = 0; y < fy(g.y0) - 8; y += 11, row++) for (let x = fx(g.x0) + 14 + (row % 2) * 6.5; x < fx(g.x1) - 8; x += 13) { ctx.beginPath(); ctx.arc(x, y, 3.6, 0, 7); ctx.fill(); }
  for (const w of [PANEL.lcd, PANEL.dial]) {                      // recessed windows
    ctx.fillStyle = '#050506'; ctx.beginPath(); ctx.roundRect(fx(w.x0) - 12, fy(w.y1) - 12, fx(w.x1) - fx(w.x0) + 24, fy(w.y0) - fy(w.y1) + 24, 10); ctx.fill();
  }
  ctx.fillStyle = '#c9c6bd'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 17px ${SANS}`;
  for (const b of PANEL.buttons) ctx.fillText(b.label, fx(b.x), fy(b.y + 0.0125));
  ctx.font = `600 21px ${SANS}`;
  ctx.fillText('TUNING', fx(PANEL.tune.x), fy(PANEL.tune.y - 0.036)); ctx.fillText('VOLUME', fx(PANEL.vol.x), fy(PANEL.vol.y - 0.036));
  ctx.strokeStyle = '#8c8a84'; ctx.lineWidth = 2.5;
  for (const k of [PANEL.tune, PANEL.vol]) for (let i = 0; i <= 10; i++) {   // scale marks round the knobs
    const a = Math.PI * (0.75 + 1.5 * i / 10), r0 = k.r * 1.18, r1 = k.r * (i % 5 === 0 ? 1.4 : 1.3);
    ctx.beginPath(); ctx.moveTo(fx(k.x + r0 * Math.cos(a)), fy(k.y - r0 * Math.sin(a))); ctx.lineTo(fx(k.x + r1 * Math.cos(a)), fy(k.y - r1 * Math.sin(a))); ctx.stroke();
  }
  ctx.fillStyle = '#e8e4d8'; ctx.font = `800 30px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('HALCYON', fx(0.076), fy(0.137));
  ctx.fillStyle = '#8c8a84'; ctx.font = `500 15px ${SANS}`; ctx.fillText('MC-33  STEREO MUSIC CENTRE', fx(0.116), fy(0.1365));
  ctx.textAlign = 'center'; ctx.fillText('PHONES', fx(0.144), fy(0.028));
  ctx.fillStyle = '#060606'; ctx.beginPath(); ctx.arc(fx(0.144), fy(0.040), 11, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6d6b66'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(fx(0.144), fy(0.040), 13, 0, 7); ctx.stroke();
  return c;
}

// The tuning scale behind the red needle: backlit, so the shader treats it as emitted light.
export function makeDial(stations = []) {
  const W = 1024, H = 214, c = canvas(W, H), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f3d892'); g.addColorStop(0.5, '#ffe9b0'); g.addColorStop(1, '#e2bd6a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const X = (f) => 40 + (f - BAND[0]) / (BAND[1] - BAND[0]) * (W - 80);
  ctx.fillStyle = '#2a1d0a'; ctx.strokeStyle = '#2a1d0a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let f = 88; f <= 108; f += 0.5) {
    const major = f % 2 === 0; ctx.fillRect(X(f) - (major ? 1.5 : 1), 78, major ? 3 : 2, major ? 34 : f % 1 === 0 ? 24 : 14);
    if (major) { ctx.font = `700 30px ${SANS}`; ctx.fillText(String(f), X(f), 48); }
  }
  ctx.font = `700 15px ${SANS}`; ctx.fillStyle = '#8a2a12';
  stations.forEach((s, i) => { ctx.beginPath(); ctx.arc(X(s.f), 128, 5, 0, 7); ctx.fill(); ctx.fillText(s.name.toUpperCase().slice(0, 9), X(s.f), i % 2 ? 176 : 152); });
  ctx.fillStyle = '#2a1d0a'; ctx.font = `700 16px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('FM', 8, 18); ctx.textAlign = 'right'; ctx.fillText('MHz', W - 8, 18);
  return { canvas: c, x: (f) => X(f) / W };
}

// The blue LCD. s = { tags: [..], big, unit, line, level, bars }
export function drawLCD(c, s) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  const g = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.62); g.addColorStop(0, '#6fd0ff'); g.addColorStop(1, '#2787e6');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const on = 'rgba(6,22,48,0.93)', off = 'rgba(6,22,48,0.10)';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = `700 21px ${SANS}`;
  let x = 18;
  for (const [name, lit] of s.tags) { ctx.fillStyle = lit ? on : off; ctx.fillText(name, x, 24); x += ctx.measureText(name).width + 18; }
  ctx.fillStyle = on; ctx.font = `700 88px ${MONO}`;
  let big = s.big; const maxW = W - 36 - (s.unit ? 76 : 0);
  let size = 88; while (ctx.measureText(big).width > maxW && size > 30) { size -= 4; ctx.font = `700 ${size}px ${MONO}`; }
  const bigW = ctx.measureText(big).width;
  ctx.fillText(big, 16, 88);
  if (s.unit) { ctx.font = `700 26px ${SANS}`; ctx.fillText(s.unit, 28 + bigW, 106); }
  ctx.font = `600 25px ${SANS}`;
  let line = s.line || ''; while (ctx.measureText(line).width > W - 150 && line.length > 4) line = line.slice(0, -2) + '…';
  ctx.fillText(line, 18, 153);
  for (let i = 0; i < 12; i++) { ctx.fillStyle = i < Math.round((s.level || 0) * 12) ? on : off; ctx.fillRect(W - 124 + i * 9, 162 - 6 - i * 1.6, 6, 6 + i * 1.6); }
  if (s.bars !== undefined) for (let i = 0; i < 5; i++) { ctx.fillStyle = i < s.bars ? on : off; ctx.fillRect(W - 78 + i * 12, 34 - 5 - i * 4, 8, 5 + i * 4); }
}
export const lcdCanvas = () => canvas(512, 172);
