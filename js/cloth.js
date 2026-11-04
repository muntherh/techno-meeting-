/*
 * TECHNO logo cloth (opening scene): a square holographic banner printed with the TECHNO logo, pinned by its two top
 * corners and simulated in real time (Verlet + distance constraints, WebGL 1, no libraries). Grab it anywhere with
 * the mouse or a finger and drag it in 3D; on release it falls back and settles.
 * If WebGL, the shaders or the texture fail, the section gets "no-cloth" and the static logo is shown instead.
 */
(function () {
  'use strict';
  var canvas = document.getElementById('cloth');
  var host = canvas && canvas.closest('.scene');
  if (!canvas || !host) return;
  function fail() { host.classList.add('no-cloth'); host.classList.remove('has-cloth'); document.documentElement.classList.remove('has-cloth'); running = false; window.dispatchEvent(new Event('resize')); }

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CFG = {
    size: 0.6, aspect: 1.0, spread: 0.98, pinRoll: 5.5, flutter: 0.35, damping: 0.30, stiffness: 0.60, crumple: 0.55,
    grabRadius: 0.12, carryRadius: 0.20, gravity: 2.6, tilt: -10, turn: -12, perspective: 0.45, maxSpeed: 12, steps: 8
  };
  var COLS = 46, ROWS = 42, NP = COLS * ROWS;
  var CH = CFG.size, CW = CFG.size * CFG.aspect;
  var DEG = Math.PI / 180;

  // ───────── camera
  var t0 = CFG.tilt * DEG, r0 = CFG.turn * DEG;
  var R0 = [Math.cos(r0), 0, Math.sin(r0)];
  var R1 = [Math.sin(t0) * Math.sin(r0), Math.cos(t0), -Math.sin(t0) * Math.cos(r0)];
  var R2 = [-Math.cos(t0) * Math.sin(r0), Math.sin(t0), Math.cos(t0) * Math.cos(r0)];
  var CAM = Math.exp(Math.log(18) * (1 - CFG.perspective) + Math.log(1.7) * CFG.perspective);
  var view = { cx: 0.5, cy: 0.43, zoom: 1, ar: 16 / 9, w: 1, h: 1 };

  function toView(x, y, z, o) { o[0] = R0[0] * x + R0[1] * y + R0[2] * z; o[1] = R1[0] * x + R1[1] * y + R1[2] * z; o[2] = R2[0] * x + R2[1] * y + R2[2] * z; return o; }
  function toWorld(x, y, z, o) { o[0] = R0[0] * x + R1[0] * y + R2[0] * z; o[1] = R0[1] * x + R1[1] * y + R2[1] * z; o[2] = R0[2] * x + R1[2] * y + R2[2] * z; return o; }

  // ───────── simulation state
  var pos = new Float32Array(NP * 3), prev = new Float32Array(NP * 3), rest = new Float32Array(NP * 3), flat = new Float32Array(NP * 2);
  var invM = new Float32Array(NP), weight = new Float32Array(NP), fixedNow = new Uint8Array(NP);
  function I(c, r) { return r * COLS + c; }
  var PL = I(0, ROWS - 1), PR = I(COLS - 1, ROWS - 1);
  function ridge(x) { var s = Math.sin(x); return Math.sqrt(s * s + 0.03) - 0.64; }
  function crease(u, v) {
    return CFG.crumple * 0.045 * CH * (ridge(2.7 * u + 2.9 * v + 0.7) + 0.8 * ridge(-2.6 * u + 3.3 * v + 2.1) + 0.5 * Math.sin(4.9 * u - 1.4 * v + 2.2) +
      0.55 * ridge(1.1 * u + 6.4 * v + 1.3) + 0.4 * ridge(8.3 * u + 3.9 * v + 0.2) + 0.3 * ridge(-5.7 * u + 9.1 * v + 1.6));
  }
  var roll = CFG.pinRoll * DEG, half = 0.5 * CW * CFG.spread, top = 0.5 * CH;
  var pinL = [-half * Math.cos(roll), top + half * Math.sin(roll), 0], pinR = [half * Math.cos(roll), top - half * Math.sin(roll), 0];
  var flatPinL = [-CW / 2, CH / 2], flatPinR = [CW / 2, CH / 2];
  var tetherL = new Float32Array(NP), tetherR = new Float32Array(NP);

  for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
    var i = I(c, r), u = c / (COLS - 1), v = r / (ROWS - 1);
    var fx = (u - 0.5) * CW, fy = (v - 0.5) * CH;
    flat[i * 2] = fx; flat[i * 2 + 1] = fy;
    rest[i * 3] = fx; rest[i * 3 + 1] = fy; rest[i * 3 + 2] = crease(u, v);
    tetherL[i] = 1.02 * Math.hypot(fx - flatPinL[0], fy - flatPinL[1]);
    tetherR[i] = 1.02 * Math.hypot(fx - flatPinR[0], fy - flatPinR[1]);
    invM[i] = 1;
    // starting pose: bottom slightly wider, whole sheet rotated with the pins
    var sx = fx * (CFG.spread + (1 - CFG.spread) * Math.pow(1 - v, 2)), sy = fy, th = -roll;
    var px = sx * Math.cos(th) - (sy - top) * Math.sin(th), py = top + sx * Math.sin(th) + (sy - top) * Math.cos(th);
    pos[i * 3] = prev[i * 3] = px; pos[i * 3 + 1] = prev[i * 3 + 1] = py; pos[i * 3 + 2] = prev[i * 3 + 2] = rest[i * 3 + 2];
  }
  invM[PL] = invM[PR] = 0;
  pos.set(pinL, PL * 3); prev.set(pinL, PL * 3); pos.set(pinR, PR * 3); prev.set(pinR, PR * 3);

  // links
  var LA = [], LB = [], LR = [], LK = [];
  var bend = 0.02 + (0.60 - 0.02) * CFG.stiffness;
  function link(a, b, k) {
    LA.push(a); LB.push(b); LK.push(k);
    LR.push(Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]));
  }
  for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
    var a = I(c, r);
    if (c + 1 < COLS) link(a, I(c + 1, r), 1);
    if (r + 1 < ROWS) link(a, I(c, r + 1), 1);
    if (c + 1 < COLS && r + 1 < ROWS) { link(a, I(c + 1, r + 1), 0.5); link(I(c + 1, r), I(c, r + 1), 0.5); }
    if (c + 2 < COLS) link(a, I(c + 2, r), bend);
    if (r + 2 < ROWS) link(a, I(c, r + 2), bend);
    if (c + 5 < COLS) link(a, I(c + 5, r), bend * 0.5);
    if (r + 5 < ROWS) link(a, I(c, r + 5), bend * 0.5);
  }
  LA = Int32Array.from(LA); LB = Int32Array.from(LB); LR = Float32Array.from(LR); LK = Float32Array.from(LK);
  var NL = LA.length;

  var T = 0, sweep = 0, damping = CFG.damping;
  var held = -1, grab = { depth: 0, ox: 0, oy: 0, px: 0, py: 0 }, lastRelease = 0;
  var tmp = [0, 0, 0], tmp2 = [0, 0, 0];

  function tether(i, p, out) {
    var x = p[0], y = p[1], z = p[2];
    [[pinL, tetherL[i]], [pinR, tetherR[i]]].forEach(function (pp) {
      var P = pp[0], m = pp[1], dx = x - P[0], dy = y - P[1], dz = z - P[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > m) { var k = m / d; x = P[0] + dx * k; y = P[1] + dy * k; z = P[2] + dz * k; }
    });
    out[0] = x; out[1] = y; out[2] = z; return out;
  }

  function step(h) {
    T += h;
    var damp = Math.exp(-(0.15 + 5.85 * damping) * h);
    var gust = 0.6 + 0.4 * Math.sin(0.37 * T) * Math.sin(0.23 * T + 1.0);
    var wind = reduced ? 0 : CFG.flutter * 2.4 * gust * (CFG.gravity / 2.6);
    var cap = CFG.maxSpeed * h, h2 = h * h;
    fixedNow.fill(0);
    // carry the held region towards the pointer
    if (held >= 0) {
      var sx = grab.px + grab.ox, sy = grab.py + grab.oy;
      var sc = CAM / Math.max(CAM - grab.depth, 0.001);
      toWorld(sx / sc, sy / sc, grab.depth, tmp);
      tether(held, tmp, tmp);
      var dx = tmp[0] - pos[held * 3], dy = tmp[1] - pos[held * 3 + 1], dz = tmp[2] - pos[held * 3 + 2];
      for (var j = 0; j < NP; j++) {
        var w = weight[j]; if (w <= 0) continue;
        var k3 = j * 3;
        if (w >= 0.98) { pos[k3] += dx; pos[k3 + 1] += dy; pos[k3 + 2] += dz; prev[k3] += dx; prev[k3 + 1] += dy; prev[k3 + 2] += dz; fixedNow[j] = 1; }
        else { pos[k3] += w * dx; pos[k3 + 1] += w * dy; pos[k3 + 2] += w * dz; prev[k3] += w * dx; prev[k3 + 1] += w * dy; prev[k3 + 2] += w * dz; }
      }
    }
    // Verlet
    for (var r = 0; r < ROWS; r++) {
      var v = r / (ROWS - 1);
      for (var c = 0; c < COLS; c++) {
        var i = r * COLS + c; if (invM[i] === 0 || fixedNow[i]) continue;
        var u = c / (COLS - 1), k = i * 3;
        var s1 = Math.sin(9.1 * u - 3.7 * v + 3.1 * T), s2 = Math.sin(6.3 * u + 7.9 * v - 2.3 * T + 1.3);
        var s3 = Math.sin(2.9 * u + 1.7 * T + 0.8 * Math.sin(0.5 * T)) * Math.cos(2.3 * v - 0.9 * T);
        var ax = wind * 0.25 * Math.sin(3.3 * v + 1.1 * T + u), ay = wind * 0.1 * s2 - CFG.gravity, az = wind * (0.45 * s1 + 0.35 * s2 + 0.3 * s3);
        var vx = (pos[k] - prev[k]) * damp + ax * h2, vy = (pos[k + 1] - prev[k + 1]) * damp + ay * h2, vz = (pos[k + 2] - prev[k + 2]) * damp + az * h2;
        var sp = Math.sqrt(vx * vx + vy * vy + vz * vz); if (sp > cap) { var f = cap / sp; vx *= f; vy *= f; vz *= f; }
        prev[k] = pos[k]; prev[k + 1] = pos[k + 1]; prev[k + 2] = pos[k + 2];
        pos[k] += vx; pos[k + 1] += vy; pos[k + 2] += vz;
      }
    }
    // constraints, alternating sweep direction
    var fwd = (sweep++ & 1) === 0;
    for (var n = 0; n < NL; n++) {
      var L = fwd ? n : NL - 1 - n, A = LA[L], B = LB[L];
      var wa = fixedNow[A] ? 0 : invM[A], wb = fixedNow[B] ? 0 : invM[B], ws = wa + wb; if (!ws) continue;
      var a3 = A * 3, b3 = B * 3;
      var ex = pos[b3] - pos[a3], ey = pos[b3 + 1] - pos[a3 + 1], ez = pos[b3 + 2] - pos[a3 + 2];
      var d = Math.sqrt(ex * ex + ey * ey + ez * ez); if (d < 1e-9) continue;
      var diff = (d - LR[L]) / d * LK[L];
      var fa = diff * wa / ws, fb = diff * wb / ws;
      pos[a3] += ex * fa; pos[a3 + 1] += ey * fa; pos[a3 + 2] += ez * fa;
      pos[b3] -= ex * fb; pos[b3 + 1] -= ey * fb; pos[b3 + 2] -= ez * fb;
    }
    // tethers
    for (var q = 0; q < NP; q++) {
      if (invM[q] === 0) continue;
      var q3 = q * 3; tmp2[0] = pos[q3]; tmp2[1] = pos[q3 + 1]; tmp2[2] = pos[q3 + 2];
      tether(q, tmp2, tmp2); pos[q3] = tmp2[0]; pos[q3 + 1] = tmp2[1]; pos[q3 + 2] = tmp2[2];
    }
  }
  // settle before the first frame, so the cloth already hangs
  damping = 1; for (var s0 = 0; s0 < 360; s0++) step(1 / 240); damping = CFG.damping;

  // ───────── WebGL
  var gl = null;
  try { gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) { fail(); return; }

  var VS = 'attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv;' +
    'uniform vec3 uR0, uR1, uR2; uniform float uCam, uZoom, uCx, uCy, uAr; uniform vec2 uShift;' +
    'varying vec3 vN; varying vec3 vQ; varying vec2 vUv;' +
    'void main(){ vec3 q = vec3(dot(uR0,aPos), dot(uR1,aPos), dot(uR2,aPos));' +
    ' float s = uCam / max(uCam - q.z, 0.001); vec2 sc = q.xy * s * uZoom;' +
    ' vN = vec3(dot(uR0,aNor), dot(uR1,aNor), dot(uR2,aNor)); vQ = q; vUv = aUv;' +
    ' gl_Position = vec4(2.0*(uCx + sc.x/uAr) - 1.0 + uShift.x, 1.0 - 2.0*(uCy - sc.y) + uShift.y, -q.z*0.5, 1.0); }';
  var FS = 'precision highp float; varying vec3 vN; varying vec3 vQ; varying vec2 vUv;' +
    'uniform sampler2D uTex; uniform float uHasTex, uCam;' +
    'float box(vec3 d, vec3 c, vec2 hs, float soft){ vec3 up = abs(c.y) > 0.99 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0);' +
    ' vec3 xa = normalize(cross(up, c)); vec3 ya = cross(c, xa); float f = dot(d, c); if (f <= 0.0) return 0.0;' +
    ' vec2 p = vec2(dot(d, xa), dot(d, ya)) / f; vec2 e = (hs - abs(p)) / soft;' +
    ' return smoothstep(-0.5, 0.5, e.x) * smoothstep(-0.5, 0.5, e.y); }' +
    'vec3 rainbow(float p){ return clamp(vec3(0.62,0.66,0.96) + vec3(0.36,0.24,0.10) * cos(6.2831853 * (p + vec3(0.0,0.30,0.62))), 0.0, 1.0); }' +
    'void main(){ vec3 n = normalize(vN); bool back = n.z < 0.0; if (back) n = -n;' +
    ' vec3 V = normalize(vec3(0.0,0.0,uCam) - vQ); vec3 Rf = reflect(-V, n); vec3 KEY = normalize(vec3(-0.42,0.45,0.79));' +
    ' float nv = clamp(dot(n,V), 0.0, 1.0); float nl = max(dot(n,KEY), 0.0);' +
    ' vec3 print = uHasTex > 0.5 ? pow(texture2D(uTex, vUv).rgb, vec3(2.2)) : vec3(0.02,0.03,0.10);' +
    ' float shade = 0.46 + 0.68*nl + 0.08*n.y; float key = pow(max(dot(Rf,KEY),0.0), 26.0);' +
    ' float strip = box(Rf, normalize(vec3(0.08,0.93,0.36)), vec2(1.1,0.07), 0.22);' +
    ' float side = box(Rf, normalize(vec3(0.86,0.12,0.50)), vec2(0.06,0.85), 0.20);' +
    ' float fill = box(Rf, KEY, vec2(0.42,0.30), 0.35);' +
    ' float phase = 3.0*(0.85*dot(n.xy, vec2(0.6,0.8)) + 0.75*(1.0-nv) + 0.3*dot(Rf.xy, vec2(-0.8,0.6))) + 0.4*sin(5.0*vUv.x + 7.0*vUv.y);' +
    ' vec3 holo = mix(vec3(1.0), pow(rainbow(phase), vec3(2.2)), 0.8);' +
    ' float lum = dot(print, vec3(0.2126,0.7152,0.0722)); float gloss = mix(1.0, 0.45, smoothstep(0.55, 0.9, lum));' +
    ' vec3 spec = holo * gloss * mix(vec3(1.0), print*2.4 + 0.08, 0.65) * (0.34*key + 0.11*strip + 0.07*side + 0.02*fill);' +
    ' vec3 col = print*shade + spec + holo*print*0.6*pow(1.0-nv, 3.0);' +
    ' if (back) { vec3 foil = vec3(0.10,0.14,0.36)*(0.35 + 0.9*nl) + spec*1.3; col = mix(foil, print*shade, 0.38); }' +
    ' col = min(col, vec3(0.8)) + 0.2*(1.0 - exp(-max(col - 0.8, vec3(0.0))/0.2));' +
    ' gl_FragColor = vec4(pow(col, vec3(1.0/2.2)), 1.0); }';
  var FS_SOLID = 'precision mediump float; void main(){ gl_FragColor = vec4(1.0); }';
  var VS_FULL = 'attribute vec2 aP; varying vec2 vT; void main(){ vT = aP*0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }';
  var FS_BLUR = 'precision mediump float; varying vec2 vT; uniform sampler2D uS; uniform vec2 uStep; uniform vec2 uOff;' +
    'void main(){ float a = 0.0, wsum = 0.0; for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {' +
    ' float d2 = float(i*i + j*j); float w = exp(-d2/6.0); a += w * texture2D(uS, vT - uOff + vec2(float(i), float(j))*uStep).r; wsum += w; }' +
    ' a = a / wsum * 0.42; gl_FragColor = vec4(vec3(0.0,0.01,0.04)*a, a); }';

  function prog(vs, fs) {
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  var P, PS, PB;
  try { P = prog(VS, FS); PS = prog(VS, FS_SOLID); PB = prog(VS_FULL, FS_BLUR); } catch (e) { console.warn('[cloth]', e.message); fail(); return; }

  var bPos = gl.createBuffer(), bNor = gl.createBuffer(), bUv = gl.createBuffer(), bIdx = gl.createBuffer(), bFull = gl.createBuffer();
  var uv = new Float32Array(NP * 2), nor = new Float32Array(NP * 3), idx = [];
  for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) { var ii = I(c, r); uv[ii * 2] = c / (COLS - 1); uv[ii * 2 + 1] = 1 - r / (ROWS - 1); }
  for (r = 0; r < ROWS - 1; r++) for (c = 0; c < COLS - 1; c++) { var a0 = I(c, r), b0 = I(c + 1, r), c0 = I(c, r + 1), d0 = I(c + 1, r + 1); idx.push(a0, b0, d0, a0, d0, c0); }
  idx = new Uint16Array(idx);
  gl.bindBuffer(gl.ARRAY_BUFFER, bUv); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, bFull); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  function loc(p) {
    var o = { p: p }, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS), k;
    for (k = 0; k < n; k++) { var u = gl.getActiveUniform(p, k).name; o[u] = gl.getUniformLocation(p, u); }
    n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (k = 0; k < n; k++) { var a = gl.getActiveAttrib(p, k).name; o[a] = gl.getAttribLocation(p, a); }
    return o;
  }
  P = loc(P); PS = loc(PS); PB = loc(PB);

  // texture: the logo printed on a dark navy fabric with faint circuit lines
  var tex = gl.createTexture(), hasTex = 0;
  function makePrint(img) {
    var S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
    var x = cv.getContext('2d');
    var g = x.createRadialGradient(S * 0.45, S * 0.4, 0, S / 2, S / 2, S * 0.75);
    g.addColorStop(0, '#121b46'); g.addColorStop(0.6, '#080d26'); g.addColorStop(1, '#03050f');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.strokeStyle = 'rgba(90,130,255,.16)'; x.lineWidth = 2;
    var rr = 7;
    for (var k = 0; k < 26; k++) {
      var sx = (Math.sin(rr++ * 12.9898) * 43758.5453 % 1 + 1) % 1 * S, sy = (Math.sin(rr++ * 78.233) * 43758.5453 % 1 + 1) % 1 * S;
      var len = 60 + ((Math.sin(rr++) + 1) / 2) * 160, dir = k % 2 ? 1 : -1;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + dir * len, sy); x.lineTo(sx + dir * (len + 30), sy + 30); x.lineTo(sx + dir * (len + 90), sy + 30); x.stroke();
      x.fillStyle = 'rgba(255,138,61,.35)'; x.beginPath(); x.arc(sx + dir * (len + 90), sy + 30, 5, 0, 6.283); x.fill();
    }
    x.strokeStyle = 'rgba(143,180,255,.25)'; x.lineWidth = 3; x.strokeRect(28, 28, S - 56, S - 56);
    var L = S * 0.84; x.drawImage(img, (S - L) / 2, (S - L) / 2, L, L);
    return cv;
  }
  var img = new Image();
  img.onload = function () {
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, makePrint(img));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      var an = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      hasTex = 1; host.classList.add('has-cloth'); document.documentElement.classList.add('has-cloth'); draw();
      window.dispatchEvent(new Event('resize')); // the deck re-measures where the data stream starts
    } catch (e) { console.warn('[cloth]', e); fail(); }
  };
  img.onerror = fail;
  img.src = window.TECHNO_LOGO_DATA || 'assets/img/techno-logo.png';

  // shadow target (1/8 size)
  var sTex = gl.createTexture(), sFb = gl.createFramebuffer(), sw = 1, sh = 1;
  function sizeShadow() {
    sw = Math.max(8, Math.round(canvas.width / 8)); sh = Math.max(8, Math.round(canvas.height / 8));
    gl.bindTexture(gl.TEXTURE_2D, sTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ───────── view / resize
  function resize() {
    var rc = host.getBoundingClientRect(), w = host.clientWidth || rc.width, h = host.clientHeight || rc.height;
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    view.w = w; view.h = h; view.ar = w / h;
    if (w >= 900 && view.ar >= 1.25) { // wide: cloth on the left, title on the right (reading start in Arabic)
      view.cx = 0.32; view.cy = 0.49;
      view.zoom = Math.min(1, 0.58 * view.ar / (CW * 1.12));
    } else { // stacked: cloth above the title
      view.cx = 0.5; view.cy = view.ar < 0.75 ? 0.42 : 0.4;
      view.zoom = Math.min(1, 0.92 * view.ar / (CW * 1.12), (view.ar < 0.75 ? 0.44 : 0.5) / CH);
    }
    sizeShadow(); draw();
  }

  // ───────── draw
  function normals() {
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var i = I(c, r), l = I(Math.max(c - 1, 0), r), rt = I(Math.min(c + 1, COLS - 1), r), dn = I(c, Math.max(r - 1, 0)), up = I(c, Math.min(r + 1, ROWS - 1));
      var hx = pos[rt * 3] - pos[l * 3], hy = pos[rt * 3 + 1] - pos[l * 3 + 1], hz = pos[rt * 3 + 2] - pos[l * 3 + 2];
      var vx = pos[up * 3] - pos[dn * 3], vy = pos[up * 3 + 1] - pos[dn * 3 + 1], vz = pos[up * 3 + 2] - pos[dn * 3 + 2];
      var nx = hy * vz - hz * vy, ny = hz * vx - hx * vz, nz = hx * vy - hy * vx, m = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nor[i * 3] = nx / m; nor[i * 3 + 1] = ny / m; nor[i * 3 + 2] = nz / m;
    }
  }
  function bindCloth(L) {
    gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.enableVertexAttribArray(L.aPos); gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, 0, 0);
    if (L.aNor != null && L.aNor >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bNor); gl.enableVertexAttribArray(L.aNor); gl.vertexAttribPointer(L.aNor, 3, gl.FLOAT, false, 0, 0); }
    if (L.aUv != null && L.aUv >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bUv); gl.enableVertexAttribArray(L.aUv); gl.vertexAttribPointer(L.aUv, 2, gl.FLOAT, false, 0, 0); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
    gl.uniform3fv(L.uR0, R0); gl.uniform3fv(L.uR1, R1); gl.uniform3fv(L.uR2, R2);
    gl.uniform1f(L.uCam, CAM); gl.uniform1f(L.uZoom, view.zoom); gl.uniform1f(L.uCx, view.cx); gl.uniform1f(L.uCy, view.cy); gl.uniform1f(L.uAr, view.ar);
    gl.uniform2f(L.uShift, 0, 0);
  }
  function unbindAttribs() { for (var k = 0; k < 4; k++) gl.disableVertexAttribArray(k); }
  function draw() {
    if (!gl || gl.isContextLost()) return;
    normals();
    gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bNor); gl.bufferData(gl.ARRAY_BUFFER, nor, gl.DYNAMIC_DRAW);
    // 1. shadow mask
    gl.bindFramebuffer(gl.FRAMEBUFFER, sFb); gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.useProgram(PS.p); bindCloth(PS); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0); unbindAttribs();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // 2. blurred shadow, offset down-left
    gl.useProgram(PB.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, bFull); gl.enableVertexAttribArray(PB.aP); gl.vertexAttribPointer(PB.aP, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sTex); gl.uniform1i(PB.uS, 0);
    var tap = 0.9 + 1.5 * view.zoom * view.h / 724;
    gl.uniform2f(PB.uStep, tap / sw, tap / sh);
    gl.uniform2f(PB.uOff, -0.012 * view.zoom / view.ar, -0.045 * view.zoom);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3); unbindAttribs(); gl.disable(gl.BLEND);
    // 3. cloth
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    gl.useProgram(P.p); bindCloth(P);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(P.uTex, 0); gl.uniform1f(P.uHasTex, hasTex);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0); unbindAttribs();
  }

  // ───────── grabbing
  function pointer(e) {
    var rc = canvas.getBoundingClientRect();
    return [((e.clientX - rc.left) / rc.width - view.cx) * view.ar / view.zoom, (view.cy - (e.clientY - rc.top) / rc.height) / view.zoom];
  }
  function pick(px, py) {
    var best = -1, bestScore = 1e9, lim = CFG.grabRadius / view.zoom, q = [0, 0, 0];
    for (var i = 0; i < NP; i++) {
      toView(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], q);
      var s = CAM / Math.max(CAM - q[2], 0.001), d = Math.hypot(q[0] * s - px, q[1] * s - py);
      if (d > lim) continue;
      var score = d - 0.08 * q[2];
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }
  function startGrab(i, px, py) {
    var q = toView(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], [0, 0, 0]), s = CAM / Math.max(CAM - q[2], 0.001);
    held = i; grab.depth = q[2]; grab.px = px; grab.py = py; grab.ox = q[0] * s - px; grab.oy = q[1] * s - py;
    var fx = flat[i * 2], fy = flat[i * 2 + 1], R = CFG.carryRadius * CH;
    for (var j = 0; j < NP; j++) {
      var d = Math.hypot(flat[j * 2] - fx, flat[j * 2 + 1] - fy) / R;
      weight[j] = invM[j] === 0 ? 0 : (d < 1 ? Math.pow(1 - d * d, 2) : 0);
    }
    weight[i] = 1;
    canvas.classList.add('is-held'); dragged = false;
    wake();
  }
  function release() {
    if (held < 0) return;
    held = -1; weight.fill(0); canvas.classList.remove('is-held'); lastRelease = performance.now();
  }
  var dragged = false, downAt = null;
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var p = pointer(e), i = pick(p[0], p[1]);
    if (i < 0) return;
    e.preventDefault(); e.stopPropagation();
    downAt = [e.clientX, e.clientY];
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    startGrab(i, p[0], p[1]);
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointer(e);
    if (held >= 0) {
      grab.px = p[0]; grab.py = p[1];
      if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) dragged = true;
      return;
    }
    if (e.pointerType === 'mouse') canvas.classList.toggle('is-over', pick(p[0], p[1]) >= 0);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { canvas.addEventListener(ev, release); });
  // a press that grabbed the cloth must not also advance the presentation
  canvas.addEventListener('click', function (e) { if (performance.now() - lastRelease < 400) { e.stopPropagation(); } });
  canvas.addEventListener('touchstart', function (e) {
    var t = e.touches[0]; if (!t) return;
    var p = pointer(t); if (pick(p[0], p[1]) >= 0) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) { if (held >= 0) e.preventDefault(); }, { passive: false });

  // ───────── loop (only while on screen and the tab is visible)
  var running = true, onScreen = true, rafId = 0, last = 0;
  function frame(now) {
    rafId = 0;
    if (!running || !onScreen || document.hidden) { last = 0; return; }
    var dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60; last = now;
    var h = dt / CFG.steps;
    for (var k = 0; k < CFG.steps; k++) step(h);
    draw();
    rafId = requestAnimationFrame(frame);
  }
  function wake() { if (!rafId && running) { last = 0; rafId = requestAnimationFrame(frame); } }
  new IntersectionObserver(function (en) { onScreen = en[0].isIntersecting; if (onScreen) wake(); }).observe(canvas);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); fail(); });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
  addEventListener('resize', resize);
  resize(); wake();

  window.TMCloth = { busy: function () { return held >= 0 || performance.now() - lastRelease < 350; }, state: function () { return { held: held, hasTex: hasTex, view: view }; } };
})();
