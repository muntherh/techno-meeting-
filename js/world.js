/*
 * The world: one continuous descent drawn in code.
 *  - #bg  (canvas, fixed)  depth-tinted sky/cavern colour, aurora, stars, world glows, drifting motes (3 depths)
 *  - #far (DOM, parallax)  distant cavern walls with crystals
 *  - #back (DOM, 1:1)      each scene's art + the seams (rock/cloud bands) between scenes
 *  - #fx  (canvas, fixed)  the data waterfall that runs through every scene, spill, lake splash, rising lights
 *  - #near (DOM, parallax) foreground shards that sweep past during camera moves
 * World coordinates are CSS px from the top of the first scene. The deck moves a camera (cam = world y at the top
 * of the viewport) and calls TMWorld.frame() every animation frame.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var C = {
    mint: '#3a74ff', teal: '#2d5ef0', blue: '#2f6bff', royal: '#1d3fae', sky: '#ff8a3d',
    ice: '#e6eeff', aqua: '#8fb4ff'
  };
  var FAR_F = 0.55, NEAR_F = 1.32;

  function rngOf(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function rgb(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')'; }
  function f1(n) { return Math.round(n * 10) / 10; }
  function pts(arr) { var s = ''; for (var i = 0; i < arr.length; i++) s += f1(arr[i][0]) + ',' + f1(arr[i][1]) + ' '; return s; }
  function svgEl(w, h, cls) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 ' + Math.round(w) + ' ' + Math.round(h));
    s.setAttribute('width', Math.round(w));
    s.setAttribute('height', Math.round(h));
    s.setAttribute('preserveAspectRatio', 'none');
    if (cls) s.setAttribute('class', cls);
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  // ───────────────────────────────── state
  var S = {
    scenes: [], arts: [], back: null, far: null, near: null, bg: null, fx: null, bgc: null, fxc: null,
    W: 0, H: 0, deck: true, tops: [], hs: [], xs: [], total: 0, bh: 0,
    spill: { x: 0, y: 0 }, lakeY: 0, endY: 0, glows: [], motes: [], streaks: [], lights: [],
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    dprBg: 1, dprFx: 1, lastNow: 0
  };

  // Depth palette keyed by scene position p (0 = first scene).
  var DEPTH = [
    [0, '#05081a', '#0b1236'],
    [1, '#060a1f', '#101a44'],
    [2, '#03040b', '#070a1a'],
    [5, '#03040b', '#080b1e'],
    [6, '#040510', '#0b0d24'],
    [10, '#040510', '#0b0d22'],
    [11, '#030409', '#0a0f2a'],
    [14, '#030409', '#0a0e26'],
    [15, '#04060f', '#0d1434']
  ].map(function (d) { return [d[0], hex(d[1]), hex(d[2])]; });

  function depthColors(p) {
    for (var i = 0; i < DEPTH.length - 1; i++) {
      var a = DEPTH[i], b = DEPTH[i + 1];
      if (p <= b[0]) { var t = smooth((p - a[0]) / (b[0] - a[0])); return [mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
    }
    var l = DEPTH[DEPTH.length - 1];
    return [l[1], l[2]];
  }

  // ───────────────────────────────── stream path
  function xAt(y) {
    var n = S.tops.length, bh = S.bh;
    // scene index containing y
    var i = 0;
    while (i < n - 1 && y >= S.tops[i + 1]) i++;
    var top = S.tops[i], bot = top + S.hs[i];
    if (i > 0 && y < top + bh) return lerp(S.xs[i - 1], S.xs[i], smooth((y - (top - bh)) / (2 * bh)));
    if (i < n - 1 && y > bot - bh) return lerp(S.xs[i], S.xs[i + 1], smooth((y - (bot - bh)) / (2 * bh)));
    return S.xs[i];
  }

  // ───────────────────────────────── seams
  function seamSVG(idx, W, B, xa, xb, kind, deco, seed) {
    var r = rngOf(seed), m = B / 2, svg = svgEl(W, B, 'seam-svg seam-' + kind), id = 'sm' + idx;
    var g = Math.max(46, W * 0.034); // stream width
    var html = '<defs>' +
      '<linearGradient id="' + id + 'rim" x1="0" x2="1"><stop offset="0" stop-color="' + C.mint + '" stop-opacity=".5"/><stop offset=".45" stop-color="' + C.aqua + '"/><stop offset=".7" stop-color="' + C.sky + '" stop-opacity=".8"/><stop offset="1" stop-color="' + C.mint + '" stop-opacity=".5"/></linearGradient>' +
      '<linearGradient id="' + id + 'top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141c3e"/><stop offset="1" stop-color="#0a0f26"/></linearGradient>' +
      '<linearGradient id="' + id + 'scr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.aqua + '" stop-opacity=".35"/><stop offset="1" stop-color="' + C.mint + '" stop-opacity=".04"/></linearGradient>' +
      '<radialGradient id="' + id + 'glow"><stop offset="0" stop-color="' + C.mint + '" stop-opacity=".5"/><stop offset="1" stop-color="' + C.mint + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + id + 'grid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.aqua + '" stop-opacity="0"/><stop offset=".5" stop-color="' + C.aqua + '" stop-opacity=".22"/><stop offset="1" stop-color="' + C.aqua + '" stop-opacity="0"/></linearGradient>' +
      '</defs>';

    if (kind === 'cloud') { // a stack of translucent holographic data planes
      for (var L = 0; L < 4; L++) {
        var y0 = m + (L - 1.5) * B * 0.1, hh = B * (0.035 + r() * 0.03);
        html += '<g class="cloud c' + L + '"><rect x="' + f1(-W * 0.1) + '" y="' + f1(y0) + '" width="' + f1(W * 1.2) + '" height="' + f1(hh) + '" fill="url(#' + id + 'grid)" opacity="' + (0.5 + L * 0.12).toFixed(2) + '"/>';
        var ln = '';
        for (var gx = -W * 0.1; gx < W * 1.1; gx += 46) ln += 'M' + f1(gx) + ' ' + f1(y0) + 'v' + f1(hh);
        html += '<path d="' + ln + '" stroke="' + C.aqua + '" stroke-opacity=".12" stroke-width="1"/>';
        html += '<path d="M' + f1(-W * 0.1) + ' ' + f1(y0) + 'H' + f1(W * 1.1) + '" stroke="' + C.ice + '" stroke-opacity="' + (0.1 + L * 0.06).toFixed(2) + '" stroke-width="1" stroke-dasharray="' + (6 + L * 4) + ' ' + (10 + L * 6) + '"/></g>';
      }
      svg.innerHTML = html;
      return svg;
    }

    // Chamfered board profile: flat runs joined by 45° steps (circuit-board / architectural edges).
    function profile(base, amp, up) {
      var p = [], x = -30, lvl = base - (up ? 1 : -1) * amp * r();
      p.push([x, lvl]);
      while (x < W + 30) {
        var run = W * (0.04 + r() * 0.09);
        x += run; p.push([x, lvl]);
        var nl = base - (up ? 1 : -1) * amp * r(), d = Math.abs(nl - lvl);
        x += d; p.push([x, nl]); lvl = nl;
      }
      return p;
    }
    var surf = profile(m - B * 0.12, B * (kind === 'surface' ? 0.06 : 0.12), true);
    var ceil = profile(m + B * 0.12, B * 0.08, false);
    function band(a, b) { return a.concat(b.slice().reverse()); }
    var mass = band(surf, ceil);
    html += '<clipPath id="' + id + 'clip"><polygon points="' + pts(mass) + '"/></clipPath>';
    html += '<polygon points="' + pts(mass) + '" fill="#05070f"/>';
    html += '<polygon points="' + pts(band(surf, [[-30, m - B * 0.05], [W + 30, m - B * 0.05]])) + '" fill="url(#' + id + 'top)" clip-path="url(#' + id + 'clip)"/>';
    html += '<rect x="0" y="' + f1(m + B * 0.05) + '" width="' + W + '" height="' + f1(B * 0.2) + '" fill="#0a0e22" clip-path="url(#' + id + 'clip)"/>';
    // layer lines (board laminations)
    html += '<g clip-path="url(#' + id + 'clip)" stroke="' + C.mint + '" stroke-opacity=".22" stroke-width="1"><path d="M0 ' + f1(m - B * 0.05) + 'H' + W + 'M0 ' + f1(m + B * 0.05) + 'H' + W + '"/></g>';

    // the channel the data stream runs through
    var chL = [], chR = [];
    for (var cyy = 0; cyy <= B; cyy += B / 16) {
      var cx = lerp(xa, xb, smooth(cyy / B));
      chL.push([cx - g * 0.75, cyy]); chR.push([cx + g * 0.75, cyy]);
    }
    html += '<g clip-path="url(#' + id + 'clip)"><polygon points="' + pts(chL.concat(chR.slice().reverse())) + '" fill="#010204"/>' +
      '<polyline points="' + pts(chL) + '" fill="none" stroke="' + C.aqua + '" stroke-opacity=".5" stroke-width="1.4"/>' +
      '<polyline points="' + pts(chR) + '" fill="none" stroke="' + C.aqua + '" stroke-opacity=".5" stroke-width="1.4"/></g>';
    function nearChannel(x, y) { var cx2 = lerp(xa, xb, smooth(y / B)); return Math.abs(x - cx2) < g * 1.6; }

    // circuit traces with vias; a few carry an orange signal node
    var tr = '', nodes = '';
    var nT = Math.round(W / 170);
    for (var t = 0; t < nT; t++) {
      var x0 = r() * W, y0 = m + (r() - 0.5) * B * 0.08, dir = r() < 0.5 ? -1 : 1;
      var l1 = 40 + r() * 160, d = (10 + r() * 14) * (r() < 0.5 ? -1 : 1), l2 = 30 + r() * 120;
      var p1 = [x0 + dir * l1, y0], p2 = [p1[0] + dir * Math.abs(d), y0 + d], p3 = [p2[0] + dir * l2, p2[1]];
      if (nearChannel(x0, y0) || nearChannel(p1[0], y0) || nearChannel(p3[0], p3[1]) || nearChannel(p2[0], p2[1])) continue;
      tr += '<polyline points="' + pts([[x0, y0], p1, p2, p3]) + '"/>';
      var hot = r() < 0.3;
      nodes += '<circle class="' + (hot ? 'node' : '') + '" cx="' + f1(p3[0]) + '" cy="' + f1(p3[1]) + '" r="' + (hot ? 3 : 2.4) + '" fill="' + (hot ? C.sky : C.aqua) + '" style="animation-delay:' + (r() * 3).toFixed(2) + 's"/>' +
        '<circle cx="' + f1(x0) + '" cy="' + f1(y0) + '" r="2.2" fill="#05070f" stroke="' + C.mint + '" stroke-width="1"/>';
    }
    html += '<g clip-path="url(#' + id + 'clip)"><g fill="none" stroke="' + C.mint + '" stroke-opacity=".5" stroke-width="1.2">' + tr + '</g>' + nodes + '</g>';

    // luminous edges
    html += '<polyline points="' + pts(surf) + '" fill="none" stroke="url(#' + id + 'rim)" stroke-width="6" stroke-opacity=".14" stroke-linejoin="miter"/>';
    html += '<polyline points="' + pts(surf) + '" fill="none" stroke="url(#' + id + 'rim)" stroke-width="1.6" stroke-linejoin="miter"/>';
    html += '<polyline points="' + pts(ceil) + '" fill="none" stroke="' + C.mint + '" stroke-opacity=".45" stroke-width="1.2" stroke-linejoin="miter"/>';

    function yOn(line, x) {
      for (var q = 0; q < line.length - 1; q++) if (x >= line[q][0] && x <= line[q + 1][0]) return lerp(line[q][1], line[q + 1][1], (x - line[q][0]) / ((line[q + 1][0] - line[q][0]) || 1));
      return line[0][1];
    }

    // structures standing on the board: chips, server racks, data towers, holographic panels
    var dec = '';
    var nD = Math.round(W / (kind === 'surface' ? 70 : 260));
    for (var dI = 0; dI < nD; dI++) {
      var dx = (dI + 0.15 + r() * 0.7) * (W / nD), dy = yOn(surf, dx) + 1;
      if (nearChannel(dx, dy)) continue;
      var pick = r();
      if (kind === 'surface') { // skyline: towers with lit windows
        var tw = 14 + r() * 26, th = B * (0.06 + r() * 0.2), win = '';
        for (var wy = dy - th + 6; wy < dy - 4; wy += 7) for (var wx = dx - tw / 2 + 4; wx < dx + tw / 2 - 3; wx += 6) if (r() < 0.32) win += '<rect x="' + f1(wx) + '" y="' + f1(wy) + '" width="2" height="2"/>';
        dec += '<rect x="' + f1(dx - tw / 2) + '" y="' + f1(dy - th) + '" width="' + f1(tw) + '" height="' + f1(th) + '" fill="#0a0f24" stroke="' + C.mint + '" stroke-opacity=".35" stroke-width="1"/>' +
          '<g fill="' + (r() < 0.25 ? C.sky : C.aqua) + '" fill-opacity=".75">' + win + '</g>';
        if (r() < 0.25) dec += '<path d="M' + f1(dx) + ' ' + f1(dy - th) + 'v' + f1(-B * 0.05) + '" stroke="' + C.mint + '" stroke-opacity=".6"/><circle class="blink" cx="' + f1(dx) + '" cy="' + f1(dy - th - B * 0.05) + '" r="2" fill="' + C.sky + '" style="animation-delay:' + (r() * 2).toFixed(2) + 's"/>';
      } else if (deco === 'plants') { // holographic panels (community zone)
        var pw = 30 + r() * 40, ph = pw * (0.55 + r() * 0.3), py = dy - ph - 8 - r() * 10, lines = '';
        for (var k = 0; k < 3; k++) lines += 'M' + f1(dx - pw / 2 + 6) + ' ' + f1(py + 8 + k * ph * 0.22) + 'h' + f1(pw * (0.35 + r() * 0.45));
        dec += '<g class="holo" style="animation-delay:' + (r() * 4).toFixed(2) + 's"><path d="M' + f1(dx) + ' ' + f1(dy) + 'V' + f1(py + ph) + '" stroke="' + C.mint + '" stroke-opacity=".5"/>' +
          '<rect x="' + f1(dx - pw / 2) + '" y="' + f1(py) + '" width="' + f1(pw) + '" height="' + f1(ph) + '" rx="2" fill="url(#' + id + 'scr)" stroke="' + C.aqua + '" stroke-opacity=".55" stroke-width="1"/>' +
          '<path d="' + lines + '" stroke="' + C.ice + '" stroke-opacity=".5" stroke-width="1.4"/></g>';
      } else if (pick < 0.45) { // chip with pins
        var cw = 26 + r() * 30, ch = 12 + r() * 10, pins = '';
        for (var px = dx - cw / 2 + 4; px < dx + cw / 2 - 2; px += 6) pins += 'M' + f1(px) + ' ' + f1(dy) + 'v-3M' + f1(px) + ' ' + f1(dy - ch - 3) + 'v-3';
        dec += '<ellipse cx="' + f1(dx) + '" cy="' + f1(dy) + '" rx="' + f1(cw) + '" ry="' + f1(ch * 0.6) + '" fill="url(#' + id + 'glow)"/>' +
          '<path d="' + pins + '" stroke="' + C.aqua + '" stroke-opacity=".7"/>' +
          '<rect x="' + f1(dx - cw / 2) + '" y="' + f1(dy - ch - 3) + '" width="' + f1(cw) + '" height="' + f1(ch) + '" rx="2" fill="#0e1430" stroke="' + C.mint + '" stroke-opacity=".8"/>' +
          '<circle cx="' + f1(dx - cw / 2 + 5) + '" cy="' + f1(dy - ch + 1) + '" r="1.5" fill="' + C.sky + '"/>';
      } else { // server rack with status LEDs
        var rw = 20 + r() * 14, rh = B * (0.08 + r() * 0.1), leds = '';
        for (var ly = dy - rh + 5; ly < dy - 4; ly += 6) leds += '<rect class="' + (r() < 0.2 ? 'blink' : '') + '" x="' + f1(dx - rw / 2 + 4) + '" y="' + f1(ly) + '" width="' + f1(rw * (0.3 + r() * 0.4)) + '" height="1.6" fill="' + (r() < 0.2 ? C.sky : C.aqua) + '" fill-opacity=".8" style="animation-delay:' + (r() * 2).toFixed(2) + 's"/>';
        dec += '<rect x="' + f1(dx - rw / 2) + '" y="' + f1(dy - rh) + '" width="' + f1(rw) + '" height="' + f1(rh) + '" fill="#0a0f24" stroke="' + C.mint + '" stroke-opacity=".5"/>' + leds;
      }
    }
    // the ceiling of the scene below: hanging cable bundles and LED strips
    var nH = Math.round(W / 300);
    for (var hI = 0; hI < nH; hI++) {
      var hx = (hI + 0.5 + (r() - 0.5) * 0.6) * (W / nH), hy = yOn(ceil, hx) - 1;
      if (nearChannel(hx, hy)) continue;
      if (r() < 0.5) {
        var sag = B * (0.06 + r() * 0.08), span = 40 + r() * 80;
        dec += '<path d="M' + f1(hx - span / 2) + ' ' + f1(hy) + 'Q' + f1(hx) + ' ' + f1(hy + sag * 2) + ' ' + f1(hx + span / 2) + ' ' + f1(hy) + '" fill="none" stroke="#1a2346" stroke-width="3"/>' +
          '<path d="M' + f1(hx - span / 2 + 6) + ' ' + f1(hy) + 'Q' + f1(hx) + ' ' + f1(hy + sag * 1.6) + ' ' + f1(hx + span / 2 - 6) + ' ' + f1(hy) + '" fill="none" stroke="' + C.mint + '" stroke-opacity=".35" stroke-width="1.2"/>';
      } else {
        var sl = 30 + r() * 60;
        dec += '<rect x="' + f1(hx - sl / 2) + '" y="' + f1(hy) + '" width="' + f1(sl) + '" height="3" fill="' + C.aqua + '" fill-opacity=".75"/>' +
          '<ellipse cx="' + f1(hx) + '" cy="' + f1(hy + 10) + '" rx="' + f1(sl) + '" ry="14" fill="url(#' + id + 'glow)"/>';
      }
    }
    html += dec;
    svg.innerHTML = html;
    return svg;
  }

  // ───────────────────────────────── far walls
  function buildFar() {
    var far = S.far; far.innerHTML = '';
    if (S.tops.length < 3) return;
    var W = S.W, H = S.H, startY = S.tops[2] * FAR_F + H * 0.05, endY = S.total * FAR_F + H * 1.2;
    var h = endY - startY, r = rngOf(77);
    var svg = svgEl(W, h, 'far-svg');
    svg.style.top = startY + 'px';
    var wl = S.deck ? 0.13 : 0.05, html = '<defs><linearGradient id="farG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#0a0f26"/><stop offset=".35" stop-color="#0b0c22"/><stop offset=".62" stop-color="#0a1030"/><stop offset="1" stop-color="#0b1230"/></linearGradient>' +
      '<linearGradient id="farC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.aqua + '" stop-opacity=".6"/><stop offset="1" stop-color="' + C.teal + '" stop-opacity="0"/></linearGradient></defs>';
    ['L', 'R'].forEach(function (side) { // stepped walls of server racks
      var y = -40, edge = [], leds = '', x = W * (0.02 + r() * wl);
      edge.push([x, y]);
      while (y < h + 40) {
        var seg = H * (0.06 + r() * 0.12);
        edge.push([x, y + seg]); y += seg;
        x = W * (0.02 + r() * wl); edge.push([x, y]);
        for (var ly = y - seg + 10; ly < y - 6; ly += 9) if (r() < 0.55) {
          var lx = 6 + r() * Math.max(10, edge[edge.length - 2][0] - 26);
          leds += '<rect x="' + f1(side === 'L' ? lx : W - lx - 12) + '" y="' + f1(ly) + '" width="' + f1(6 + r() * 14) + '" height="1.6"/>';
        }
      }
      var pts2 = edge.map(function (e) { return [side === 'L' ? e[0] : W - e[0], e[1]]; });
      var poly = side === 'L' ? [[-10, -40]].concat(pts2, [[-10, h + 40]]) : [[W + 10, -40]].concat(pts2, [[W + 10, h + 40]]);
      html += '<polygon points="' + pts(poly) + '" fill="url(#farG)" opacity=".92"/>';
      html += '<polyline points="' + pts(pts2) + '" fill="none" stroke="' + C.mint + '" stroke-opacity=".28" stroke-width="1.2"/>';
      html += '<g fill="' + C.aqua + '" fill-opacity=".35">' + leds + '</g>';
    });
    // distant pillars and floating interface panels
    for (var c = 0; c < Math.round(h / H) * 2; c++) {
      var cx = W * (0.2 + r() * 0.6), cy = r() * h, cw = 8 + r() * 18, ch = H * (0.12 + r() * 0.3);
      if (r() < 0.6) html += '<rect x="' + f1(cx) + '" y="' + f1(cy) + '" width="' + f1(cw) + '" height="' + f1(ch) + '" fill="#0c1230" opacity=".45"/>';
      else html += '<rect x="' + f1(cx) + '" y="' + f1(cy) + '" width="' + f1(cw * 5) + '" height="' + f1(cw * 3) + '" rx="3" fill="none" stroke="' + C.mint + '" stroke-opacity=".14"/>';
    }
    svg.innerHTML = html;
    far.appendChild(svg);
  }

  // ───────────────────────────────── near shards
  function buildNear() {
    var near = S.near; near.innerHTML = '';
    if (!S.deck) return;
    var W = S.W, H = S.H, r = rngOf(991), html = '';
    var top = S.tops[2] * NEAR_F, h = S.total * NEAR_F + H;
    var svg = svgEl(W, h, 'near-svg');
    for (var i = 2; i < S.tops.length; i++) {
      var b = S.tops[i];
      var cy = H / 2 + NEAR_F * (b - H / 2) - top;
      ['L', 'R'].forEach(function (side) {
        if (r() < 0.25) return;
        var w = W * (0.04 + r() * 0.06), hh = H * (0.22 + r() * 0.14), x = side === 'L' ? 0 : W, d = side === 'L' ? 1 : -1;
        var poly = [[x - d * 10, cy - hh / 2], [x + d * w * (0.5 + r() * 0.5), cy - hh * 0.3], [x + d * w, cy + (r() - 0.5) * hh * 0.2], [x + d * w * 0.6, cy + hh * 0.35], [x - d * 10, cy + hh / 2]];
        html += '<polygon points="' + pts(poly) + '" fill="#02040e"/>';
        html += '<polyline points="' + pts(poly.slice(1, 4)) + '" fill="none" stroke="' + C.teal + '" stroke-opacity=".35" stroke-width="1.5"/>';
      });
    }
    svg.innerHTML = html;
    svg.style.top = top + 'px';
    near.appendChild(svg);
  }

  // ───────────────────────────────── per-scene generated art
  function genArt(i, wrap) {
    var old = wrap.querySelector('.gen'); if (old) old.remove();
    var art = S.arts[i], W = S.W, h = S.hs[i], r = rngOf(1000 + i * 31);
    var svg = svgEl(W, h, 'gen'), html = '';
    var x = S.xs[i];
    if (art.classList.contains('art-dusk')) { // city of data towers over a perspective grid
      var hz = h * 0.66;
      html += '<defs><linearGradient id="hz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.mint + '" stop-opacity="0"/><stop offset="1" stop-color="' + C.mint + '" stop-opacity=".18"/></linearGradient></defs>';
      html += '<rect x="0" y="' + f1(h * 0.4) + '" width="' + W + '" height="' + f1(hz - h * 0.4) + '" fill="url(#hz)"/>';
      var gl = '';
      for (var gx = -12; gx <= 12; gx++) gl += 'M' + f1(W / 2 + gx * W * 0.04) + ' ' + f1(hz) + 'L' + f1(W / 2 + gx * W * 0.22) + ' ' + f1(h);
      for (var gy = 0; gy < 9; gy++) { var yy = hz + (h - hz) * Math.pow(gy / 8, 1.8); gl += 'M0 ' + f1(yy) + 'H' + W; }
      html += '<path d="' + gl + '" stroke="' + C.mint + '" stroke-opacity=".22" stroke-width="1" fill="none"/>';
      html += '<path d="M0 ' + f1(hz) + 'H' + W + '" stroke="' + C.aqua + '" stroke-opacity=".6" stroke-width="1.5"/>';
      var cols = ['#0d1434', '#0a0f28', '#070a1c'];
      for (var L = 0; L < 3; L++) {
        var xx = -10, tw2, th2, win = '';
        while (xx < W + 10) {
          tw2 = W * (0.018 + r() * 0.03); th2 = h * (0.06 + r() * (0.22 - L * 0.05));
          if (Math.abs(xx - x) > W * 0.05) {
            html += '<rect x="' + f1(xx) + '" y="' + f1(hz - th2) + '" width="' + f1(tw2) + '" height="' + f1(th2) + '" fill="' + cols[L] + '" stroke="' + C.mint + '" stroke-opacity="' + (0.35 - L * 0.1).toFixed(2) + '"/>';
            for (var wy = hz - th2 + 6; wy < hz - 4; wy += 9) if (r() < 0.25) win += '<rect x="' + f1(xx + 3 + r() * (tw2 - 8)) + '" y="' + f1(wy) + '" width="3" height="2"/>';
          }
          xx += tw2 + W * (0.004 + r() * 0.02);
        }
        html += '<g fill="' + (L === 0 ? C.aqua : C.sky) + '" fill-opacity="' + (L === 0 ? '.55' : '.35') + '">' + win + '</g>';
      }
    } else if (art.classList.contains('art-time')) {
      var t = '';
      for (var y = h * 0.18; y < h * 0.95; y += h * 0.022) {
        var big = Math.round((y / h) * 100) % 11 === 0;
        t += '<path d="M' + f1(x - (big ? 34 : 18) - 30) + ' ' + f1(y) + 'h' + (big ? 34 : 18) + 'M' + f1(x + 30) + ' ' + f1(y) + 'h' + (big ? 34 : 18) + '"/>';
      }
      html += '<g stroke="' + C.aqua + '" stroke-opacity=".28" stroke-width="1.2">' + t + '</g>';
    } else if (art.classList.contains('art-paths')) {
      var g = '', nd = '';
      for (var b = 0; b < 15; b++) {
        var y0 = h * (0.2 + r() * 0.62), main = b < 4, len1 = W * (0.05 + r() * 0.12), dir = 1;
        var p1 = [x + dir * len1, y0], dd = (r() - 0.5) * h * 0.16, p2 = [p1[0] + Math.abs(dd), y0 + dd], p3 = [p2[0] + W * (0.03 + r() * (main ? 0.16 : 0.08)), p2[1]];
        g += '<polyline class="' + (main ? 'main' : '') + '" points="' + pts([[x, y0], p1, p2, p3]) + '"/>';
        nd += '<circle class="node" cx="' + f1(p3[0]) + '" cy="' + f1(p3[1]) + '" r="' + (main ? 5 : 3) + '" style="animation-delay:' + (r() * 3).toFixed(2) + 's"/>';
      }
      html += '<g class="branches" fill="none" stroke="' + C.teal + '" stroke-width="1.6">' + g + '</g><g fill="' + C.aqua + '">' + nd + '</g>';
    } else if (art.classList.contains('art-crystal') || art.classList.contains('art-garden')) {
      for (var k = 0; k < 9; k++) {
        var cx = W * (0.05 + r() * 0.9), cy = h * (0.2 + r() * 0.6), cr = 2 + r() * 3;
        html += '<rect class="spore" x="' + f1(cx) + '" y="' + f1(cy) + '" width="' + f1(cr * 1.6) + '" height="' + f1(cr * 1.6) + '" fill="' + (k % 3 ? C.aqua : C.sky) + '" style="animation-delay:' + (r() * 6).toFixed(2) + 's;animation-duration:' + (6 + r() * 6).toFixed(1) + 's"/>';
      }
    } else if (art.classList.contains('art-join')) {
      var cx0 = W * 0.5, y1 = h * 0.47, y2 = h * 0.6, targets = [0.36, 0.5, 0.64];
      var jl = '';
      targets.forEach(function (tx) { jl += '<path d="M' + f1(cx0) + ' ' + f1(y1) + 'C' + f1(cx0) + ' ' + f1(y2) + ' ' + f1(W * tx) + ' ' + f1(y1 + h * 0.04) + ' ' + f1(W * tx) + ' ' + f1(y2 + h * 0.05) + '"/>'; });
      html += '<g fill="none" stroke="' + C.aqua + '" stroke-opacity=".35" stroke-width="2" stroke-dasharray="6 8" class="join-lines">' + jl + '</g>';
    } else if (art.classList.contains('art-portrait')) {
      html += '<defs><linearGradient id="cone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6eeff" stop-opacity=".16"/><stop offset="1" stop-color="#e6eeff" stop-opacity="0"/></linearGradient></defs>';
      html += '<polygon points="' + pts([[W * 0.02, -10], [W * 0.1, -10], [W * 0.38, h * 0.9], [W * 0.02, h * 0.9]]) + '" fill="url(#cone)"/>';
    }
    svg.innerHTML = html;
    wrap.insertBefore(svg, wrap.firstChild);
  }

  // ───────────────────────────────── layout
  function layout(o) {
    S.W = o.W; S.H = o.H; S.deck = o.deck; S.tops = o.tops; S.hs = o.hs;
    S.total = o.tops[o.tops.length - 1] + o.hs[o.hs.length - 1];
    S.bh = Math.min(S.H * 0.15, 150 + S.H * 0.05);
    var W = S.W;
    S.xs = S.scenes.map(function (sc, i) {
      if (!S.deck) return i === S.scenes.length - 1 ? W * 0.5 : W * 0.06;
      return W * parseFloat(sc.getAttribute('data-fall') || '0.5');
    });

    // art wrappers
    S.back.style.height = S.total + 'px';
    S.arts.forEach(function (art, i) {
      var wrap = art.parentNode;
      wrap.style.top = S.tops[i] + 'px';
      wrap.style.height = S.hs[i] + 'px';
    });

    // spill point (top of the waterfall) from the planet ring, measured
    var spill = S.back.querySelector('[data-spill]');
    if (spill) {
      var rb = S.back.getBoundingClientRect(), rs = spill.getBoundingClientRect();
      var sc = rb.height ? S.total / rb.height : 1;
      S.spill = { x: (rs.left + rs.width / 2 - rb.left) * sc, y: (rs.top + rs.height / 2 - rb.top) * sc };
      S.xs[0] = S.spill.x;
    } else S.spill = { x: S.xs[0], y: S.tops[0] + S.hs[0] * 0.5 };
    var last = S.tops.length - 1;
    S.lakeY = S.tops[last] + S.hs[last] * 0.84;
    S.endY = S.lakeY + 6;

    S.arts.forEach(function (art, i) { genArt(i, art.parentNode); });

    // seams
    var old = S.back.querySelectorAll('.seam'); for (var k = 0; k < old.length; k++) old[k].remove();
    var B = S.bh * 2.2;
    for (var i = 0; i < S.tops.length - 1; i++) {
      var b = S.tops[i + 1];
      var kind = i === 0 ? 'cloud' : i === 1 ? 'surface' : 'rock';
      var zone = S.scenes[i].getAttribute('data-zone');
      var deco = kind === 'surface' ? 'antennas' : zone === 'garden' ? 'plants' : 'crystals';
      var wrap = document.createElement('div');
      wrap.className = 'seam seam-' + kind;
      wrap.style.top = (b - B / 2) + 'px';
      wrap.style.height = B + 'px';
      wrap.appendChild(seamSVG(i, W, B, xAt(b - B / 2), xAt(b + B / 2), kind, deco, 4242 + i * 97));
      S.back.appendChild(wrap);
    }
    buildFar();
    buildNear();
    sizeCanvases();
    seedParticles();
  }

  function sizeCanvases() {
    var dpr = window.devicePixelRatio || 1;
    S.dprBg = Math.min(dpr, 1);
    S.dprFx = Math.min(dpr, 1.5);
    [[S.bg, S.dprBg], [S.fx, S.dprFx]].forEach(function (p) {
      p[0].width = Math.round(S.W * p[1]); p[0].height = Math.round(S.H * p[1]);
      p[0].style.width = S.W + 'px'; p[0].style.height = S.H + 'px';
    });
  }

  function seedParticles() {
    var r = rngOf(5150), i;
    S.motes = [];
    for (i = 0; i < 110; i++) {
      var layer = i % 3;
      S.motes.push({ u: r(), v: r(), l: layer, f: [0.18, 0.4, 0.7][layer], s: [0.8, 1.3, 2.1][layer] * (0.7 + r() * 0.6), ph: r() * 6.28, sp: 0.3 + r() * 0.7 });
    }
    S.stars = [];
    for (i = 0; i < 140; i++) S.stars.push({ u: r(), v: r() * 0.9, s: 0.4 + r() * 1.3, ph: r() * 6.28 });
    S.streaks = [];
    var n = S.deck ? 150 : 80;
    for (i = 0; i < n; i++) {
      S.streaks.push({ u: (r() - 0.5) * 0.9, len: 40 + r() * 170, v: 520 + r() * 520, ph: r() * 100000, w: 0.8 + r() * 2.6, a: 0.25 + r() * 0.55, c: r() < 0.5 ? 0 : 1 });
    }
    S.packets = [];
    for (i = 0; i < 26; i++) S.packets.push({ u: (r() - 0.5) * 0.5, v: 240 + r() * 260, ph: r() * 100000, len: 8 + r() * 12 });
    S.lights = [];
    for (i = 0; i < 60; i++) S.lights.push({ u: r(), ph: r(), sp: 0.04 + r() * 0.06, s: 1.4 + r() * 2.8, sw: r() * 6.28 });
    // big world glows: one on the stream and one on the content side of every scene
    S.glows = [];
    S.scenes.forEach(function (sc, i) {
      var zone = sc.getAttribute('data-zone');
      var col = zone === 'garden' ? hex(C.mint) : zone === 'core' ? hex(C.sky) : zone === 'lake' ? hex(C.aqua) : hex(C.teal);
      S.glows.push({ x: S.xs[i], y: S.tops[i] + S.hs[i] * 0.55, r: S.H * 0.55, c: col, a: 0.16 });
      S.glows.push({ x: S.W * (S.xs[i] < S.W * 0.5 ? 0.72 : 0.28), y: S.tops[i] + S.hs[i] * 0.4, r: S.H * 0.7, c: hex(C.royal), a: 0.18 });
    });
  }

  // ───────────────────────────────── frame
  function frame(now, cam, travel) {
    var t = S.reduced ? 0 : now / 1000;
    drawBg(t, cam, travel);
    drawFx(t, cam, travel);
    // parallax layers
    var sc = 1 - 0.03 * travel;
    S.far.style.transform = 'translate3d(0,' + (-cam * FAR_F).toFixed(2) + 'px,0) scale(' + (1 - 0.012 * travel).toFixed(4) + ')';
    S.far.style.transformOrigin = '50% ' + (cam * FAR_F + S.H / 2).toFixed(1) + 'px';
    S.near.style.transform = 'translate3d(0,' + (-cam * NEAR_F).toFixed(2) + 'px,0) scale(' + (1 + 0.04 * travel).toFixed(4) + ')';
    S.near.style.transformOrigin = '50% ' + (cam * NEAR_F + S.H / 2).toFixed(1) + 'px';
    return sc;
  }

  function drawBg(t, cam, travel) {
    var c = S.bgc, W = S.W, H = S.H, d = S.dprBg;
    c.setTransform(d, 0, 0, d, 0, 0);
    var avgH = S.total / S.tops.length;
    var p = (cam + H * 0.5) / avgH - 0.5;
    var cols = depthColors(p);
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(cols[0])); g.addColorStop(1, rgb(cols[1]));
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    c.globalCompositeOperation = 'lighter';
    // aurora + stars near the top of the world
    var sky = clamp(1 - p / 1.4, 0, 1);
    if (sky > 0) {
      for (var b = 0; b < 3; b++) {
        var baseY = H * (0.18 + b * 0.09) - cam * 0.25, amp = H * 0.05;
        c.beginPath();
        for (var x = 0; x <= W + 40; x += 40) {
          var y = baseY + Math.sin(x / (W * 0.18) + t * 0.25 + b * 1.7) * amp + Math.sin(x / (W * 0.07) - t * 0.4 + b) * amp * 0.25;
          if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.lineTo(W, baseY + H * 0.3); c.lineTo(0, baseY + H * 0.3); c.closePath();
        var ag = c.createLinearGradient(0, baseY - amp, 0, baseY + H * 0.3);
        var ac = b === 1 ? hex(C.royal) : hex(C.mint);
        ag.addColorStop(0, rgb(ac, 0)); ag.addColorStop(0.15, rgb(ac, 0.13 * sky)); ag.addColorStop(1, rgb(ac, 0));
        c.fillStyle = ag; c.fill();
      }
      for (var s = 0; s < S.stars.length; s++) {
        var st = S.stars[s], sy = st.v * H * 1.4 - cam * 0.12;
        if (sy < -4 || sy > H) continue;
        var tw = 0.5 + 0.5 * Math.sin(t * 1.6 + st.ph);
        c.fillStyle = 'rgba(225,232,255,' + (0.25 + 0.6 * tw) * sky + ')';
        c.fillRect(st.u * W, sy, st.s, st.s);
      }
    }
    // world glows (parallax 0.7 of the camera so they drift slower than content)
    for (var i = 0; i < S.glows.length; i++) {
      var gl = S.glows[i], gy = lerp(gl.y - cam, H * 0.5, 0.15); // anchored to the world, softened towards the centre
      if (gy < -gl.r || gy > H + gl.r) continue;
      var rg = c.createRadialGradient(gl.x, gy, 0, gl.x, gy, gl.r);
      rg.addColorStop(0, rgb(gl.c, gl.a)); rg.addColorStop(1, rgb(gl.c, 0));
      c.fillStyle = rg; c.fillRect(gl.x - gl.r, gy - gl.r, gl.r * 2, gl.r * 2);
    }
    // drifting motes, three depths
    for (var m = 0; m < S.motes.length; m += (S.lite ? 3 : 1)) {
      var mo = S.motes[m];
      var my = ((mo.v * H - cam * mo.f - t * 12 * mo.sp) % H + H) % H;
      var mx = mo.u * W + Math.sin(t * 0.4 * mo.sp + mo.ph) * 18;
      var a = (0.18 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.2 + mo.ph))) * (mo.l === 2 ? 1 : 0.7);
      c.fillStyle = mo.l === 1 ? 'rgba(255,150,80,' + a + ')' : 'rgba(150,180,255,' + a + ')';
      c.beginPath(); c.arc(mx, my, mo.s * (1 + travel * (mo.l === 2 ? 1.5 : 0.4)), 0, 6.283); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  }

  var SPR = null;
  function sprites() {
    if (SPR) return SPR;
    function mk(stops) {
      var cv = document.createElement('canvas'); cv.width = 8; cv.height = 160;
      var x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 160);
      stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
      x.fillStyle = g; x.fillRect(0, 0, 8, 160); return cv;
    }
    SPR = [
      mk([[0, 'rgba(230,238,255,0)'], [0.4, 'rgba(236,242,255,.95)'], [1, 'rgba(143,180,255,0)']]),
      mk([[0, 'rgba(70,120,255,0)'], [0.5, 'rgba(120,160,255,.85)'], [1, 'rgba(255,138,61,0)']])
    ];
    return SPR;
  }

  function drawFx(t, cam, travel) {
    var c = S.fxc, W = S.W, H = S.H, d = S.dprFx;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, W, H);
    var g = Math.max(46, W * 0.034);
    var y0 = Math.max(S.spill.y, cam - 60), y1 = Math.min(S.endY, cam + H + 60);
    c.globalCompositeOperation = 'lighter';
    if (y1 > y0) {
      // glow ribbon
      c.lineJoin = 'round'; c.lineCap = 'round';
      var passes = [[g * 2.4, 'rgba(45,94,240,.08)'], [g * 1.1, 'rgba(58,116,255,.16)'], [g * 0.55, 'rgba(120,160,255,.22)'], [g * 0.16, 'rgba(236,242,255,.55)']];
      for (var pI = 0; pI < passes.length; pI++) {
        c.beginPath();
        for (var y = y0; y <= y1; y += 14) {
          var x = xAt(y), sy = y - cam;
          if (y === y0) c.moveTo(x, sy); else c.lineTo(x, sy);
        }
        c.lineTo(xAt(y1), y1 - cam);
        c.strokeStyle = passes[pI][1]; c.lineWidth = passes[pI][0]; c.stroke();
      }
      // flowing streaks (world-anchored, so they rush past during camera moves)
      var spr = sprites(), P = H + 500, base = cam - 250;
      for (var i = 0; i < S.streaks.length; i += (S.lite ? 2 : 1)) {
        var s = S.streaks[i];
        var yy = base + ((((t * s.v + s.ph) % P) + P) % P);
        var ye = yy + s.len;
        if (ye < S.spill.y || yy > S.endY) continue;
        var ya = Math.max(yy, S.spill.y), yb = Math.min(ye, S.endY);
        var xa = xAt(ya) + s.u * g, xb = xAt(yb) + s.u * g;
        var edge = 1 - Math.pow(Math.abs(s.u) * 2, 2) * 0.6;
        var fadeIn = clamp((ya - S.spill.y) / 120, 0, 1);
        c.globalAlpha = s.a * edge * fadeIn;
        if (Math.abs(xb - xa) < 2) c.drawImage(spr[s.c], xa - s.w / 2, ya - cam, s.w, yb - ya);
        else {
          c.strokeStyle = s.c ? 'rgba(120,160,255,.8)' : 'rgba(236,242,255,.9)'; c.lineWidth = s.w;
          c.beginPath(); c.moveTo(xa, ya - cam); c.lineTo(xb, yb - cam); c.stroke();
        }
      }
      c.globalAlpha = 1;
      // data packets: small orange pulses travelling down the stream (TECHNO accent)
      var P2 = H + 400, base2 = cam - 200;
      for (var q = 0; q < S.packets.length; q += (S.lite ? 2 : 1)) {
        var pk = S.packets[q];
        var py = base2 + ((((t * pk.v + pk.ph) % P2) + P2) % P2);
        if (py < S.spill.y + 40 || py > S.endY - 10) continue;
        var px = xAt(py) + pk.u * g, sy2 = py - cam;
        radial(c, px, sy2, 16, [255, 138, 61], 0.35);
        c.fillStyle = 'rgba(255,196,150,.95)';
        c.fillRect(px - 1.5, sy2 - pk.len / 2, 3, pk.len);
      }
    }
    // spill glow
    var sp = S.spill.y - cam;
    if (sp > -200 && sp < H + 200) radial(c, S.spill.x, sp, g * 2.2, [143, 180, 255], 0.55 + 0.1 * Math.sin(t * 2));
    // lake: splash, mist, rising lights
    var ly = S.lakeY - cam;
    if (ly > -300 && ly < H + 400) {
      var lx = xAt(S.lakeY);
      radial(c, lx, ly, g * 3.2, [191, 252, 241], 0.5 + 0.12 * Math.sin(t * 3));
      for (var k = 0; k < 26; k++) {
        var life = ((t * (0.6 + (k % 5) * 0.12) + k * 0.137) % 1 + 1) % 1;
        var ang = (k / 26) * Math.PI - Math.PI;
        var px = lx + Math.cos(ang) * g * (0.4 + life * 1.6), py = ly - Math.sin(-ang) * 0 - (life - life * life) * g * 2.2;
        c.fillStyle = 'rgba(230,238,255,' + (1 - life) * 0.7 + ')';
        c.beginPath(); c.arc(px, py, 1.2 + (1 - life) * 1.6, 0, 6.283); c.fill();
      }
      for (var j = 0; j < S.lights.length; j++) {
        var L = S.lights[j], life2 = (((t * L.sp + L.ph) % 1) + 1) % 1;
        var lyy = ly - life2 * H * 0.75, lxx = W * (0.08 + L.u * 0.84) + Math.sin(t * 0.8 + L.sw) * 14;
        var a2 = Math.sin(life2 * Math.PI) * 0.8;
        radial(c, lxx, lyy, L.s * 5, [120, 255, 220], a2 * 0.35);
        c.fillStyle = 'rgba(240,244,255,' + a2 + ')';
        c.beginPath(); c.arc(lxx, lyy, L.s * 0.6, 0, 6.283); c.fill();
      }
    }
    c.globalCompositeOperation = 'source-over';
  }

  function radial(c, x, y, r, col, a) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgb(col, a)); g.addColorStop(1, rgb(col, 0));
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // ───────────────────────────────── init
  function init(o) {
    S.scenes = o.scenes; S.back = o.back; S.far = o.far; S.near = o.near; S.bg = o.bg; S.fx = o.fx;
    S.bgc = S.bg.getContext('2d', { alpha: false });
    S.fxc = S.fx.getContext('2d');
    // move every scene's art into the back layer (so the waterfall canvas can sit between art and content)
    S.arts = S.scenes.map(function (sc, i) {
      var art = sc.querySelector('.art') || document.createElement('div');
      var wrap = document.createElement('div');
      wrap.className = 'scene-art';
      wrap.setAttribute('data-for', sc.id);
      wrap.appendChild(art);
      S.back.appendChild(wrap);
      return art;
    });
  }

  window.TMWorld = { init: init, layout: layout, frame: frame, xAt: xAt, state: S };
})();
