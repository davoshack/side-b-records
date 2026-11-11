// Thin WebGL2 helpers: programs, a geometry builder, meshes, textures, render targets.
import { tp, td, norm, sub, cross, ident } from './math.js';

export function program(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s), line = Number((/ERROR: \d+:(\d+)/.exec(log) || [])[1]);
      throw new Error(`shader: ${log}\n${src.split('\n').slice(Math.max(0, line - 3), line + 2).join('\n')}`);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  for (const [i, n] of ['aP', 'aN', 'aUV', 'aCol'].entries()) gl.bindAttribLocation(p, i, n);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  const cache = new Map();
  return { p, u: (name) => { if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name)); return cache.get(name); } };
}

// Geometry builder. Vertex = position(3) normal(3) uv(2) colour(4).
// Colour alpha is a per-vertex material knob: how much of the texture to use on textured surfaces,
// how metallic the surface is on plain ones.
export class Geo {
  constructor() { this.v = []; this.i = []; this.n = 0; this.m = null; }
  // run fn with every vertex transformed by matrix m
  at(m, fn) { const prev = this.m; this.m = prev ? mulM(prev, m) : m; fn(this); this.m = prev; return this; }
  vert(p, n, u, v, c) {
    if (this.m) { p = tp(this.m, p); n = norm(td(this.m, n)); }
    this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], u, v, c[0], c[1], c[2], c[3] ?? 0);
    return this.n++;
  }
  // a, b, c, d counter-clockwise seen from the front; uv = [u0, v0, u1, v1] with (u0, v0) at a
  quad(a, b, c, d, col = [1, 1, 1, 0], uv = [0, 0, 1, 1]) {
    const n = norm(cross(sub(b, a), sub(d, a)));
    const i = this.vert(a, n, uv[0], uv[1], col); this.vert(b, n, uv[2], uv[1], col); this.vert(c, n, uv[2], uv[3], col); this.vert(d, n, uv[0], uv[3], col);
    this.i.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return this;
  }
  // Axis-aligned box. `faces` can give a face its own { col, uv }; faces are named px nx py ny pz nz.
  box(x0, y0, z0, x1, y1, z1, col = [1, 1, 1, 0], faces = {}) {
    const f = (name, a, b, c, d) => { const o = faces[name]; if (o === false) return; this.quad(a, b, c, d, o?.col || col, o?.uv); };
    f('pz', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    f('nz', [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    f('px', [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    f('nx', [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    f('py', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    f('ny', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    return this;
  }
  // Solid of revolution about the y axis. profile = [[r, y], ...] going up the outside and in over the top.
  lathe(profile, segs = 32, col = [1, 1, 1, 0]) {
    for (let j = 0; j + 1 < profile.length; j++) {
      const [r0, y0] = profile[j], [r1, y1] = profile[j + 1];
      const l = Math.hypot(r1 - r0, y1 - y0) || 1, nr = (y1 - y0) / l, ny = -(r1 - r0) / l;
      const base = this.n;
      for (let k = 0; k <= segs; k++) {
        const a = k / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        this.vert([r0 * c, y0, r0 * s], [nr * c, ny, nr * s], k / segs, 0, col);
        this.vert([r1 * c, y1, r1 * s], [nr * c, ny, nr * s], k / segs, 1, col);
      }
      for (let k = 0; k < segs; k++) { const i = base + 2 * k; this.i.push(i, i + 1, i + 3, i, i + 3, i + 2); }
    }
    return this;
  }
  // Round tube along a polyline.
  tube(path, radius, segs = 12, col = [1, 1, 1, 0]) {
    const base = this.n, n = path.length;
    for (let j = 0; j < n; j++) {
      const t = norm(sub(path[Math.min(n - 1, j + 1)], path[Math.max(0, j - 1)]));
      const u = norm(cross(t, Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), w = cross(t, u);
      for (let k = 0; k <= segs; k++) {
        const a = k / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const nn = [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s];
        this.vert([path[j][0] + nn[0] * radius, path[j][1] + nn[1] * radius, path[j][2] + nn[2] * radius], nn, k / segs, j / (n - 1), col);
      }
    }
    for (let j = 0; j + 1 < n; j++) for (let k = 0; k < segs; k++) {
      const i = base + j * (segs + 1) + k; this.i.push(i, i + 1, i + segs + 2, i, i + segs + 2, i + segs + 1);
    }
    return this;
  }
  // Flat ring in the xz plane at height y, facing up. uv carries the local (x, -z) in metres.
  annulus(r0, r1, y, rings = 24, segs = 128, col = [1, 1, 1, 0]) {
    const base = this.n;
    for (let j = 0; j <= rings; j++) for (let k = 0; k <= segs; k++) {
      const r = r0 + (r1 - r0) * j / rings, a = k / segs * Math.PI * 2, x = r * Math.cos(a), z = r * Math.sin(a);
      this.vert([x, y, z], [0, 1, 0], x, -z, col);
    }
    for (let j = 0; j < rings; j++) for (let k = 0; k < segs; k++) {
      const i = base + j * (segs + 1) + k; this.i.push(i, i + segs + 1, i + segs + 2, i, i + segs + 2, i + 1);
    }
    return this;
  }
}
function mulM(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

export function mesh(gl, geo) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.v), gl.STATIC_DRAW);
  const st = 48;
  for (const [loc, size, off] of [[0, 3, 0], [1, 3, 12], [2, 2, 24], [3, 4, 32]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, st, off); }
  const idx = geo.n > 65535 ? new Uint32Array(geo.i) : new Uint16Array(geo.i);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: geo.i.length, type: geo.n > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
}
export function draw(gl, m) { gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, m.type, 0); }

// Colour texture from a canvas (sRGB, mipmapped, anisotropic where available). Canvas top = v 1.
export function canvasTexture(gl, canvas, { tex = gl.createTexture(), repeat = false, srgb = true } = {}) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  const an = gl.getExtension('EXT_texture_filter_anisotropic');
  if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return tex;
}

// Colour render target (linear-filtered texture).
export function target(gl, w, h, fmt) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h, dispose() { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); } };
}
export { ident };
