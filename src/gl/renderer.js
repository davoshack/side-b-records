// Frame pipeline: shadow map for the counter -> the scene in HDR with MSAA -> depth of field for the
// shop behind -> bloom for the tubes, the neon and the LCD -> tone map.
import * as G from './gl.js';
import { STD_VS, STD_FS, REC_FS, DEPTH_FS, POST_VS, DOWN_FS, BLUR_FS, FINAL_FS, KEY } from './shaders.js';
import { mul, ortho, perspective, lookAt, ident, lerp } from './math.js';
import { TAU } from '../audio/dsp.js';
import { thetaForRadius, R_LOCK, R_LEADIN } from '../audio/geometry.js';

const SHADOW = 2048, FOV = 40 * Math.PI / 180;

export class Renderer {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('This needs WebGL2.');
    this.canvas = canvas;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.fmt = this.hdr ? gl.RGBA16F : gl.RGBA8;
    this.std = G.program(gl, STD_VS, STD_FS); this.rec = G.program(gl, STD_VS, REC_FS); this.dep = G.program(gl, STD_VS, DEPTH_FS);
    this.down = G.program(gl, POST_VS, DOWN_FS); this.blur = G.program(gl, POST_VS, BLUR_FS); this.fin = G.program(gl, POST_VS, FINAL_FS);
    this.items = []; this.w = 0; this.h = 0; this.cam = null; this.neon = 1; this.exposure = 1.15;
    this.foot = new Float32Array(16);

    // shadow map
    this.shadowTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW, SHADOW, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE], [gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.shadowFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const c = [0, 0.1, 0.03], eye = c.map((v, i) => v + KEY[i] * 3);
    this.lvp = mul(ortho(-1.15, 1.15, -0.9, 0.9, 0.5, 6), lookAt(eye, c).m);

    // record textures
    this.recTex = { lut: gl.createTexture(), vis: gl.createTexture(), label: gl.createTexture() };
    this.recInfo = null;
    this.clearRecord();
    this.white = G.canvasTexture(gl, Object.assign(document.createElement('canvas'), { width: 2, height: 2 }));
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  }

  texture(canvas, tex) { return G.canvasTexture(this.gl, canvas, { tex }); }
  mesh(geo) { return G.mesh(this.gl, geo); }
  // item: { mesh, m, mode, tex, rough, tint, emis, uv, shadow, kind: 'std' | 'rec' | 'glass', visible }
  add(item) {
    const it = { m: ident(), mode: 0, tex: null, rough: 0.6, tint: [1, 1, 1, 1], emis: 1, uv: [0, 0, 1, 1], shadow: false, kind: 'std', visible: true, ...item };
    this.items.push(it); return it;
  }

  clearRecord() {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.recTex.lut); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 2048, 1, 0, gl.RED, gl.FLOAT, new Float32Array(2048));
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, this.recTex.vis); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1));
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
    this.recInfo = { has: 0, rLo: R_LOCK - 0.002, rHi: R_LEADIN + 0.002, rows: 1, revEnd: 0, scr: new Float32Array(40), nScr: 0, dust: 0 };
  }
  // meta comes from the pressing plant; vis is its modulation map; label is a canvas
  setRecord(meta, vis, label) {
    const gl = this.gl, lut = new Float32Array(2048), rLo = R_LOCK - 0.002, rHi = R_LEADIN + 0.002;
    for (let i = 0; i < 2048; i++) lut[i] = thetaForRadius(meta.rTab, rLo + (rHi - rLo) * i / 2047) / TAU;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.recTex.lut); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 2048, 1, 0, gl.RED, gl.FLOAT, lut);
    gl.bindTexture(gl.TEXTURE_2D, this.recTex.vis); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, vis.cols, vis.rows, 0, gl.RED, gl.UNSIGNED_BYTE, vis.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const scr = new Float32Array(40);
    (meta.scratches || []).slice(0, 10).forEach((s, i) => scr.set([s.r0, s.r1, s.phi0, s.phi1], i * 4));
    this.recInfo = { has: 1, rLo, rHi, rows: vis.rows, revEnd: meta.thetaEnd / TAU, scr, nScr: Math.min(10, (meta.scratches || []).length), dust: meta.condition?.dust ?? 0 };
    this.texture(label, this.recTex.label);
  }

  resize() {
    const gl = this.gl, c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(c.clientWidth * dpr)), h = Math.max(2, Math.round(c.clientHeight * dpr));
    if (w === this.w && h === this.h) return;
    this.w = c.width = w; this.h = c.height = h;
    for (const t of this.targets || []) t.dispose();
    if (this.msaa) { gl.deleteFramebuffer(this.msaa.fbo); gl.deleteRenderbuffer(this.msaa.col); gl.deleteRenderbuffer(this.msaa.dep); }
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    const col = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, col); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, this.fmt, w, h);
    const dep = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, dep); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, col); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, dep);
    this.msaa = { fbo, col, dep };
    const t = (k) => G.target(gl, Math.max(1, w >> k), Math.max(1, h >> k), this.fmt);
    this.scene = t(0); this.farA = t(1); this.farB = t(1); this.q = t(2); this.q2 = t(2); this.e = t(3); this.e2 = t(3);
    this.targets = [this.scene, this.farA, this.farB, this.q, this.q2, this.e, this.e2];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Orbit the listening station. `frame` raises the aim point so the shop fills the top of the picture.
  camera({ az, el, dist, pivot, frame = 0 }) {
    const asp = this.w / this.h, ce = Math.cos(el);
    const eye = [pivot[0] + dist * ce * Math.sin(az), pivot[1] + dist * Math.sin(el), pivot[2] + dist * ce * Math.cos(az)];
    const at = [pivot[0], pivot[1] + frame, pivot[2]];
    const fov = asp < 1 ? lerp(FOV, 62 * Math.PI / 180, Math.min(1, 1 / asp - 1)) : FOV;
    const v = lookAt(eye, at);
    this.cam = { eye, asp, fov, dist, ...v, vp: mul(perspective(fov, asp, 0.03, 60), v.m) };
    return this.cam;
  }
  ray(clientX, clientY) {
    const cam = this.cam, b = this.canvas.getBoundingClientRect(), t = Math.tan(cam.fov / 2);
    const nx = ((clientX - b.left) / b.width * 2 - 1) * t * cam.asp, ny = (1 - (clientY - b.top) / b.height * 2) * t;
    const d = [0, 1, 2].map((i) => cam.fwd[i] + nx * cam.right[i] + ny * cam.up[i]), l = Math.hypot(...d);
    return { o: cam.eye, d: d.map((x) => x / l) };
  }

  bind(p, vp, time) {
    const gl = this.gl;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u('uVP'), false, vp);
    gl.uniformMatrix4fv(p.u('uLVP'), false, this.lvp);
    gl.uniform3fv(p.u('uEye'), this.cam.eye);
    gl.uniform4f(p.u('uFocus'), this.cam.dist + 1.1, 6.0, 1.0, 0);
    gl.uniform1f(p.u('uTime'), time); gl.uniform1f(p.u('uNeon'), this.neon);
    gl.uniform1i(p.u('uShadow'), 7);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
  }

  render(time) {
    const gl = this.gl, cam = this.cam, items = this.items;
    // 1. shadows cast on and around the counter
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo); gl.viewport(0, 0, SHADOW, SHADOW);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.dep.p); gl.uniformMatrix4fv(this.dep.u('uVP'), false, this.lvp); gl.uniform4f(this.dep.u('uUV'), 0, 0, 1, 1);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
    for (const it of items) if (it.visible && it.shadow) { gl.uniformMatrix4fv(this.dep.u('uM'), false, it.m); G.draw(gl, it.mesh); }
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // 2. the scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa.fbo); gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0.02, 0.02, 0.02, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const std = this.std; this.bind(std, cam.vp, time);
    gl.uniform1i(std.u('uTex'), 0); gl.uniform4fv(std.u('uFoot'), this.foot);
    const drawStd = (it) => {
      gl.uniformMatrix4fv(std.u('uM'), false, it.m); gl.uniform1i(std.u('uMode'), it.mode); gl.uniform4fv(std.u('uTint'), it.tint);
      gl.uniform1f(std.u('uRough'), it.rough); gl.uniform1f(std.u('uEmis'), it.emis); gl.uniform4fv(std.u('uUV'), it.uv);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, it.tex || this.white);
      G.draw(gl, it.mesh);
    };
    for (const it of items) if (it.visible && it.kind === 'std') drawStd(it);
    const rec = this.rec, ri = this.recInfo; this.bind(rec, cam.vp, time);
    gl.uniform1i(rec.u('uLut'), 1); gl.uniform1i(rec.u('uVis'), 2); gl.uniform1i(rec.u('uLabel'), 3); gl.uniform4f(rec.u('uUV'), 0, 0, 1, 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.recTex.lut);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.recTex.vis);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.recTex.label);
    gl.uniform1f(rec.u('uRLo'), ri.rLo); gl.uniform1f(rec.u('uRHi'), ri.rHi); gl.uniform1f(rec.u('uRows'), ri.rows); gl.uniform1f(rec.u('uRevEnd'), ri.revEnd);
    gl.uniform1f(rec.u('uDust'), ri.dust); gl.uniform1f(rec.u('uHasRec'), ri.has); gl.uniform4fv(rec.u('uScr'), ri.scr); gl.uniform1i(rec.u('uNScr'), ri.nScr);
    for (const it of items) if (it.visible && it.kind === 'rec') { gl.uniformMatrix4fv(rec.u('uM'), false, it.m); G.draw(gl, it.mesh); }
    // glass last: blended over the colour, leaving the focus channel alone
    gl.useProgram(std.p); gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); gl.depthMask(false);
    for (const it of items) if (it.visible && it.kind === 'glass') drawStd(it);
    gl.depthMask(true); gl.disable(gl.BLEND);

    // 3. resolve
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaa.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.scene.fbo);
    gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    // 4. post
    gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(null);
    const pass = (prog, dst, src, set) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null); gl.viewport(0, 0, dst ? dst.w : this.w, dst ? dst.h : this.h);
      gl.useProgram(prog.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(prog.u('uTex'), 0);
      set && set(); gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const downTo = (dst, src, kind) => pass(this.down, dst, src, () => { gl.uniform2f(this.down.u('uPx'), 1 / src.w, 1 / src.h); gl.uniform1i(this.down.u('uKind'), kind); });
    const blurPair = (a, b, k) => {
      pass(this.blur, b, a, () => gl.uniform2f(this.blur.u('uDir'), k / a.w, 0));
      pass(this.blur, a, b, () => gl.uniform2f(this.blur.u('uDir'), 0, k / a.h));
    };
    downTo(this.farA, this.scene, 0); blurPair(this.farA, this.farB, 1.0); blurPair(this.farA, this.farB, 1.5);
    downTo(this.q, this.scene, 1); blurPair(this.q, this.q2, 1.0);
    downTo(this.e, this.q, 2); blurPair(this.e, this.e2, 1.6);
    const f = this.fin;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.w, this.h); gl.useProgram(f.p);
    [[this.scene, 'uScene'], [this.farA, 'uFar'], [this.q, 'uBloomA'], [this.e, 'uBloomB']].forEach(([t, name], i) => {
      gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.uniform1i(f.u(name), i);
    });
    gl.uniform1f(f.u('uTime'), time); gl.uniform1f(f.u('uExposure'), this.exposure);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
  }
}
