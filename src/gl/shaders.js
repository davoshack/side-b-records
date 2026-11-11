// GLSL. The shop is lit the way the photographs are: rows of fluorescent tubes overhead, a warm
// key light over the counter, and the neon sign washing the back wall. Shiny things (vinyl, chrome,
// the dust cover) reflect a procedural ceiling, so the tubes show up as streaks in them.

const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
export const KEY = unit([-0.42, 1.0, 0.5]);            // direction to the key light over the counter
export const SIGN = [0, 1.42, -9.2];                    // where the neon hangs

const COMMON = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
uniform vec3 uEye; uniform mat4 uLVP; uniform sampler2DShadow uShadow; uniform vec4 uFocus; uniform float uTime, uNeon;
const vec3 KEY = vec3(${KEY.map((x) => x.toFixed(5)).join(', ')});
const vec3 KEYC = vec3(2.9, 2.55, 2.05);
const vec3 SIGN = vec3(${SIGN.map((x) => x.toFixed(3)).join(', ')});
const float CEIL = 2.1;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.2 * vnoise(p * 4.11 + 3.7); }
// fluorescent tubes on the ceiling: 1.2 m tubes, end to end every 2.4 m, in rows 1.6 m apart
float tubes(vec3 P, vec3 R, float rough) {
  if (R.y <= 0.03) return 0.0;
  float t = (CEIL - P.y) / R.y; vec2 h = P.xz + R.xz * t;
  if (t <= 0.0 || h.y < -10.0 || h.y > 3.5 || abs(h.x) > 4.4) return 0.0;     // nothing above the ceiling
  float w = (0.012 + 1.1 * rough * rough) * (0.4 + t);
  float dx = abs(fract(h.x / 1.6) - 0.5) * 1.6, dz = abs(fract(h.y / 2.4) - 0.5) * 2.4;
  float a = 1.0 - smoothstep(0.045 - min(w, 0.04), 0.045 + w, dx), b = 1.0 - smoothstep(0.6 - min(w, 0.5), 0.6 + w, dz);
  return a * b * 0.045 / (0.045 + w) / (1.0 + 0.012 * t * t);
}
vec3 env(vec3 P, vec3 R, float rough) {
  vec3 c = mix(vec3(0.030, 0.026, 0.022), vec3(0.050, 0.047, 0.046), R.y * 0.5 + 0.5);
  c += tubes(P, R, rough) * vec3(10.0, 10.6, 11.0);
  vec3 s = normalize(SIGN - P);
  c += pow(max(dot(R, s), 0.0), 40.0 / (0.04 + rough)) * vec3(5.0, 1.3, 0.4) * uNeon / (1.0 + 3.0 * rough);
  return c;
}
float shadow(vec3 P, vec3 N) {
  vec4 q = uLVP * vec4(P + N * 0.002, 1.0); vec3 s = q.xyz / q.w * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  float a = 0.0, t = 1.5 / 2048.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) a += texture(uShadow, vec3(s.xy + vec2(float(i), float(j)) * t, s.z - 0.0012));
  return a / 9.0;
}
vec3 brdf(vec3 N, vec3 V, vec3 L, vec3 F0, vec3 diff, float rough) {
  float nl = max(dot(N, L), 0.0); if (nl <= 0.0) return vec3(0.0);
  vec3 H = normalize(L + V); float nh = max(dot(N, H), 0.0), nv = max(dot(N, V), 1e-3), a = rough * rough, a2 = a * a;
  float d = nh * nh * (a2 - 1.0) + 1.0, D = min(a2 / (3.14159 * d * d), 30.0), k = (rough + 1.0) * (rough + 1.0) / 8.0;
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  return (diff / 3.14159 + D * F / (4.0 * (nl * (1.0 - k) + k) * (nv * (1.0 - k) + k))) * nl;
}
float pool(vec3 P) { return smoothstep(3.0, 0.9, length(P.xz - vec2(0.0, 0.1))) * smoothstep(-0.9, -0.3, P.y); }
vec3 shade(vec3 P, vec3 N, vec3 V, vec3 alb, float rough, float metal, float ao) {
  vec3 F0 = mix(vec3(0.04), alb, metal), diff = alb * (1.0 - metal);
  float up = N.y * 0.5 + 0.5, nv = max(dot(N, V), 1e-3);
  vec3 c = diff * mix(vec3(0.055, 0.048, 0.042), vec3(0.50, 0.52, 0.53), up * up) * ao;      // the tubes, as a field
  c += brdf(N, V, KEY, F0, diff, rough) * KEYC * shadow(P, N) * pool(P);
  vec3 ln = SIGN - P; float dn = length(ln);
  c += diff * vec3(1.0, 0.30, 0.09) * max(dot(N, ln / dn), 0.0) * uNeon * 5.0 / (1.0 + dn * dn);
  vec3 F = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - nv, 5.0);
  return c + env(P, reflect(-V, N), rough) * F * ao;
}
// colour goes out with haze; alpha carries how far out of focus this pixel is
vec4 finish(vec3 c, vec3 P) {
  float d = length(P - uEye);
  c = mix(vec3(0.030, 0.026, 0.024), c, exp(-max(d - 2.0, 0.0) * 0.022));
  return vec4(c, clamp((d - uFocus.x) / uFocus.y, 0.0, 1.0) * uFocus.z);
}
`;

export const STD_VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aUV; layout(location=3) in vec4 aCol;
uniform mat4 uVP, uM; uniform vec4 uUV;
out vec3 vP, vN, vO; out vec2 vUV; out vec4 vCol;
void main() {
  vec4 w = uM * vec4(aP, 1.0);
  vP = w.xyz; vN = mat3(uM) * aN; vO = aP; vUV = aUV * uUV.zw + uUV.xy; vCol = aCol;
  gl_Position = uVP * w;
}`;

export const DEPTH_FS = `#version 300 es
precision mediump float;
void main() {}`;

// uMode: 0 plain, 1 textured, 2 wood, 3 carpet, 4 emissive texture, 5 emissive colour, 6 glass, 7 turned metal
export const STD_FS = COMMON + `
in vec3 vP, vN, vO; in vec2 vUV; in vec4 vCol; out vec4 o;
uniform mat4 uM; uniform sampler2D uTex; uniform int uMode; uniform vec4 uTint; uniform float uRough, uEmis; uniform vec4 uFoot[4];
vec3 wood(vec3 p, vec3 n, vec3 tone) {
  vec2 q = abs(n.y) > 0.6 ? p.xz : (abs(n.x) > 0.6 ? p.zy : p.xy);
  float g = fbm(vec2(q.x * 1.3, q.y * 24.0)), rings = sin(q.y * 46.0 + fbm(q * vec2(2.0, 7.0)) * 7.0) * 0.5 + 0.5;
  float px = fwidth(q.x) + fwidth(q.y), fibre = mix(hash(floor(vec2(q.x * 70.0, q.y * 1100.0))), 0.5, smoothstep(2e-4, 1.5e-3, px));
  return tone * (0.70 + 0.38 * g) * (0.88 + 0.14 * rings) * (0.95 + 0.10 * fibre);
}
void main() {
  vec3 N = normalize(vN), V = normalize(uEye - vP);
  if (dot(N, V) < 0.0) N = -N;
  vec3 alb = vCol.rgb * uTint.rgb; float rough = uRough, metal = 0.0, ao = 1.0;
  if (uMode == 5) { o = finish(vCol.rgb * uEmis, vP); return; }
  if (uMode == 0) metal = vCol.a;
  else if (uMode == 1) { vec4 t = texture(uTex, vUV); alb = mix(alb, t.rgb * alb, vCol.a); }
  else if (uMode == 2) { alb = wood(vP, N, alb); }
  else if (uMode == 3) {
    vec2 tile = floor(vP.xz / 0.61), f = fract(vP.xz / 0.61);
    float px = fwidth(vP.x) + fwidth(vP.z), speck = mix(vnoise(vP.xz * 420.0), 0.5, smoothstep(1e-3, 6e-3, px));
    float seam = smoothstep(0.0, 0.012, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    alb *= (0.82 + 0.3 * hash(tile)) * (0.75 + 0.5 * speck) * mix(0.75, 1.0, seam);
  }
  else if (uMode == 7) {
    float r = length(vO.xz), px = fwidth(vO.x) + fwidth(vO.z), b = (hash(vec2(floor(r * 6000.0), 3.0)) - 0.5) * (1.0 - smoothstep(1e-4, 7e-4, px));
    metal = vCol.a; rough = clamp(rough + b * 0.12, 0.05, 1.0);
    if (abs(N.y) > 0.5) N = normalize(N + mat3(uM) * vec3(vO.x, 0.0, vO.z) / max(r, 1e-4) * b * 0.12);
  }
  // soft contact shadow where things stand on the counter
  if (N.y > 0.9 && abs(vP.y) < 0.004) for (int i = 0; i < 4; i++) {
    vec2 q = abs(vP.xz - uFoot[i].xy) - uFoot[i].zw;
    ao *= mix(0.25, 1.0, smoothstep(-0.006, 0.075, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0)));
  }
  if (uMode == 6) {                                    // smoked acrylic: a tint over what is behind, plus reflections on top
    float fr = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0), a = clamp(uTint.a + vCol.a, 0.0, 1.0);
    vec3 c = env(vP, reflect(-V, N), 0.03 + 0.3 * vCol.a) * fr + brdf(N, V, KEY, vec3(0.04), vec3(0.0), 0.1) * KEYC * pool(vP);
    o = vec4(min(c, vec3(4.0)) + uTint.rgb * 0.09 * a, a); return;       // premultiplied
  }
  vec3 c = shade(vP, N, V, alb, rough, metal, ao);
  if (uMode == 4) { vec3 t = texture(uTex, vUV).rgb; c = c * 0.3 + t * uEmis; }
  o = finish(c, vP);
}`;

// The disc. vUV carries the point's position on the record (metres, x right, y away) in the
// record's own frame, so everything drawn here turns with it.
export const REC_FS = COMMON + `
in vec3 vP, vN, vO; in vec2 vUV; in vec4 vCol; out vec4 o;
uniform mat4 uM; uniform sampler2D uLut, uVis, uLabel;
uniform float uRLo, uRHi, uRows, uRevEnd, uDust, uHasRec; uniform vec4 uScr[10]; uniform int uNScr;
float lut(float r) {
  float x = clamp((r - uRLo) / (uRHi - uRLo), 0.0, 1.0) * 2047.0; int i = int(floor(x));
  return mix(texelFetch(uLut, ivec2(i, 0), 0).r, texelFetch(uLut, ivec2(min(i + 1, 2047), 0), 0).r, x - float(i));
}
void main() {
  vec2 q = vUV; float r = length(q), phi = atan(q.y, q.x), ph = phi / 6.28318531;
  vec3 N = normalize(vN), V = normalize(uEye - vP);
  // tangent of the groove at this point, in the world
  vec3 Tw = normalize(mat3(uM) * vec3(-sin(phi), 0.0, -cos(phi)));
  float px = fwidth(q.x) + fwidth(q.y), sh = shadow(vP, N), key = sh * pool(vP);
  vec3 c;
  if (r < 0.0500) {
    vec3 lab = texture(uLabel, q / 0.1 + 0.5).rgb;
    c = shade(vP, N, V, lab, 0.8, 0.0, 1.0);
  } else {
    float revs = lut(r), pitch = 2e-4 / max(1e-5, abs(lut(r - 1e-4) - lut(r + 1e-4)));
    float g = revs - ph, n = floor(g + 0.5);
    float inside = uHasRec * step(0.01, revs) * step(revs, uRevEnd - 0.01) * step(r, 0.1492);
    float dist = abs(fract(g + 0.5) - 0.5) * pitch, W = 30e-6;
    float sharp = clamp((W - dist) / max(px, 1e-7) + 0.5, 0.0, 1.0);
    float cover = inside * mix(sharp, min(1.0, 2.0 * W / pitch), smoothstep(0.25, 0.9, px / pitch));
    float vis = texture(uVis, vec2(fract(ph), (n + floor(ph) + 0.5) / uRows)).r;
    // Groove walls are a fan of tiny 45-degree mirrors: each light becomes a streak across the
    // disc, and the louder the music in that turn, the wider the streak.
    float sig = 0.016 + 0.09 * vis; vec3 groove = vec3(0.0020) + vis * 0.004;
    for (int i = 0; i < 5; i++) {
      vec3 L, lc;
      if (i == 0) { L = KEY; lc = KEYC * key; }
      else if (i == 4) { L = normalize(SIGN - vP); lc = vec3(1.6, 0.45, 0.14) * uNeon; }
      else { vec3 tp = vec3(i == 1 ? -0.8 : 0.8, CEIL, i == 3 ? -3.0 : (i == 2 ? 1.2 : -1.2)); L = normalize(tp - vP); lc = vec3(0.50, 0.53, 0.56); }
      vec3 H = normalize(L + V);
      float th = dot(Tw, H), s = exp(-th * th / (2.0 * sig * sig)) * 0.0085 / sig * (0.3 + 0.7 * max(dot(N, H), 0.0));
      groove += s * lc * (vec3(0.72, 0.70, 0.67) + 0.28 * cos(6.2832 * (th * 9.0 + r * 55.0 + vec3(0.0, 0.33, 0.67))));
    }
    float fr = pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 land = vec3(0.0014) + env(vP, reflect(-V, N), 0.06) * (0.045 + 0.955 * fr) * (0.55 + 0.45 * sh)
      + brdf(N, V, KEY, vec3(0.045), vec3(0.002), 0.12) * KEYC * key;
    c = mix(land, groove, cover);
    for (int i = 0; i < uNScr; i++) {                    // scratches catch the light
      vec4 s = uScr[i];
      if (r > s.x && r < s.y) {
        float d = abs(mod(phi - mix(s.z, s.w, (r - s.x) / (s.y - s.x)) + 3.14159265, 6.28318531) - 3.14159265) * r;
        c += 0.035 * (0.4 + key) * (1.0 - smoothstep(0.0, 45e-6 + px, d));
      }
    }
    vec2 cell = floor(q / 4e-4);                         // dust
    if (hash(cell) < uDust * 0.0018) c += 0.05 * (0.4 + key) * (1.0 - smoothstep(0.0, 6e-5 + px, length(q / 4e-4 - cell - 0.5) * 4e-4));
  }
  o = finish(c, vP);
}`;

// ---- post ----
export const POST_VS = `#version 300 es
out vec2 vUV;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUV = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

// half-res far field, premultiplied by how blurred it should be, plus the bright parts for bloom
export const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform vec2 uPx; uniform int uKind;
void main() {
  vec4 s = vec4(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 t = texture(uTex, vUV + uPx * vec2(i < 2 ? -0.5 : 0.5, (i & 1) == 0 ? -0.5 : 0.5));
    if (uKind == 0) s += vec4(t.rgb * t.a, t.a);
    else if (uKind == 1) { float l = max(t.r, max(t.g, t.b)); s += vec4(t.rgb * smoothstep(0.9, 2.2, l), 1.0); }
    else s += t;
  }
  o = s * 0.25;
}`;
export const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform vec2 uDir;
void main() {
  o = texture(uTex, vUV) * 0.227027
    + (texture(uTex, vUV + uDir * 1.3846) + texture(uTex, vUV - uDir * 1.3846)) * 0.316216
    + (texture(uTex, vUV + uDir * 3.2308) + texture(uTex, vUV - uDir * 3.2308)) * 0.070270;
}`;
export const FINAL_FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o; uniform sampler2D uScene, uFar, uBloomA, uBloomB; uniform float uTime, uExposure;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec4 s = texture(uScene, vUV), f = texture(uFar, vUV);
  vec3 c = mix(s.rgb, f.rgb / max(f.a, 1e-3), smoothstep(0.0, 1.0, s.a) * step(1e-3, f.a));
  c += texture(uBloomA, vUV).rgb * 0.22 + texture(uBloomB, vUV).rgb * 0.34;
  c *= uExposure;
  vec2 v = vUV - 0.5; c *= 1.0 - 0.55 * dot(v, v);
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
  c = pow(c, vec3(1.0 / 2.2)) + (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) / 160.0;
  o = vec4(c, 1.0);
}`;
