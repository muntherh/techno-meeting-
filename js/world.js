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
    mint: '#1fd4a0', teal: '#03aea9', blue: '#007db9', royal: '#0144bb', sky: '#2a6fe0',
    ice: '#bffcf1', aqua: '#5ff0d2'
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
    [0, '#081a4a', '#0c3b6c'],
    [1, '#0a2a5c', '#0f5a78'],
    [2, '#050d29', '#071a3e'],
    [5, '#050c26', '#08183c'],
    [6, '#04122a', '#06283a'],
    [10, '#05132b', '#062636'],
    [11, '#060b29', '#0a1a50'],
    [15, '#050a26', '#0a184a'],
    [16, '#03112a', '#063244']
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
    var defs = '<defs>' +
      '<linearGradient id="' + id + 'rim" x1="0" x2="1"><stop offset="0" stop-color="' + C.mint + '"/><stop offset=".35" stop-color="' + C.teal + '"/><stop offset=".7" stop-color="' + C.sky + '"/><stop offset="1" stop-color="' + C.mint + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10285c"/><stop offset="1" stop-color="#0a1a44"/></linearGradient>' +
      '<linearGradient id="' + id + 'cry" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.ice + '" stop-opacity=".95"/><stop offset=".45" stop-color="' + C.aqua + '" stop-opacity=".7"/><stop offset="1" stop-color="' + C.teal + '" stop-opacity=".1"/></linearGradient>' +
      '<linearGradient id="' + id + 'ice" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#9fd0ff" stop-opacity=".9"/><stop offset=".5" stop-color="' + C.sky + '" stop-opacity=".6"/><stop offset="1" stop-color="' + C.royal + '" stop-opacity=".05"/></linearGradient>' +
      '<linearGradient id="' + id + 'leaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9dffe2"/><stop offset=".5" stop-color="' + C.mint + '" stop-opacity=".75"/><stop offset="1" stop-color="' + C.teal + '" stop-opacity=".15"/></linearGradient>' +
      '<radialGradient id="' + id + 'glow"><stop offset="0" stop-color="' + C.aqua + '" stop-opacity=".55"/><stop offset="1" stop-color="' + C.aqua + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + id + 'cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9fffb" stop-opacity=".5"/><stop offset=".5" stop-color="#9ef3e3" stop-opacity=".16"/><stop offset="1" stop-color="#5aa8ff" stop-opacity="0"/></linearGradient>' +
      '</defs>';
    var html = defs;

    if (kind === 'cloud') {
      for (var L = 0; L < 5; L++) {
        var off = m + (L - 2) * B * 0.085, top = [], bottom = [];
        var x = -W * 0.12;
        while (x < W * 1.12) {
          top.push([x, off - B * (0.03 + r() * 0.09)]);
          x += W * (0.025 + r() * 0.05);
        }
        for (var k = top.length - 1; k >= 0; k--) bottom.push([top[k][0] + (r() - 0.5) * 30, off + B * (0.05 + r() * 0.05)]);
        var poly = top.concat(bottom);
        html += '<g class="cloud c' + L + '"><polygon points="' + pts(poly) + '" fill="url(#' + id + 'cloud)" opacity="' + (0.35 + L * 0.13).toFixed(2) + '"/>' +
          '<polyline points="' + pts(top) + '" fill="none" stroke="#f1fffc" stroke-opacity="' + (0.12 + L * 0.05).toFixed(2) + '" stroke-width="1.2"/></g>';
      }
      svg.innerHTML = html;
      return svg;
    }

    // Rock mass: jagged ground surface (top) and cave ceiling with stalactites (bottom).
    var surf = [], ceil = [], s1 = [], s2 = [], s3 = [];
    var step = W / (22 + r() * 8), xx = -20;
    var amp = kind === 'surface' ? 0.07 : 0.12;
    while (xx <= W + 20) {
      var sy = m - B * (0.12 + r() * amp);
      if (kind !== 'surface' && r() < 0.11) { surf.push([xx - step * 0.25, sy]); surf.push([xx, m - B * (0.3 + r() * 0.1)]); surf.push([xx + step * 0.25, sy]); }
      else surf.push([xx, sy]);
      var cy = m + B * (0.1 + r() * 0.08);
      if (r() < 0.32) { ceil.push([xx - step * 0.2, cy]); ceil.push([xx, m + B * (0.27 + r() * 0.17)]); ceil.push([xx + step * 0.2, cy]); }
      else ceil.push([xx, cy]);
      s1.push([xx, m - B * (0.06 + r() * 0.04)]);
      s2.push([xx, m + B * (0.0 + r() * 0.04)]);
      s3.push([xx, m + B * (0.06 + r() * 0.03)]);
      xx += step * (0.7 + r() * 0.6);
    }
    function band(a, b) { return a.concat(b.slice().reverse()); }
    var mass = band(surf, ceil);
    html += '<clipPath id="' + id + 'clip"><polygon points="' + pts(mass) + '"/></clipPath>';
    html += '<polygon points="' + pts(mass) + '" fill="#050b24"/>';
    html += '<polygon points="' + pts(band(surf, s1)) + '" fill="url(#' + id + 'top)"/>';
    html += '<polygon points="' + pts(band(s1, s2)) + '" fill="#08163b" clip-path="url(#' + id + 'clip)"/>';
    html += '<polygon points="' + pts(band(s3, ceil)) + '" fill="#0a1a46" clip-path="url(#' + id + 'clip)"/>';
    // shard facets on the top layer
    var facets = '';
    for (var fI = 1; fI < surf.length - 1; fI++) {
      if (r() < 0.55) {
        var a1 = surf[fI], b1 = surf[fI + 1], cpt = [lerp(a1[0], b1[0], 0.5 + (r() - 0.5) * 0.4), m - B * (0.04 + r() * 0.03)];
        facets += '<polygon points="' + pts([a1, b1, cpt]) + '" fill="' + (r() < 0.5 ? '#1b3f7a' : '#0f2a5c') + '" opacity="' + (0.35 + r() * 0.35).toFixed(2) + '"/>';
      }
    }
    html += '<g clip-path="url(#' + id + 'clip)">' + facets + '</g>';

    // the channel the waterfall pours through
    var chL = [], chR = [];
    for (var cyy = 0; cyy <= B; cyy += B / 16) {
      var cx = lerp(xa, xb, smooth(cyy / B));
      chL.push([cx - g * 0.75, cyy]); chR.push([cx + g * 0.75, cyy]);
    }
    html += '<g clip-path="url(#' + id + 'clip)"><polygon points="' + pts(chL.concat(chR.slice().reverse())) + '" fill="#020617"/>' +
      '<polyline points="' + pts(chL) + '" fill="none" stroke="' + C.aqua + '" stroke-opacity=".55" stroke-width="1.6"/>' +
      '<polyline points="' + pts(chR) + '" fill="none" stroke="' + C.aqua + '" stroke-opacity=".55" stroke-width="1.6"/></g>';
    function nearChannel(x, y) { var cx2 = lerp(xa, xb, smooth(y / B)); return Math.abs(x - cx2) < g * 1.6; }

    // circuit traces inside the strata
    var tr = '', nodes = '';
    var nT = Math.round(W / 230);
    for (var t = 0; t < nT; t++) {
      var x0 = r() * W, y0 = m + (r() - 0.45) * B * 0.11, dir = r() < 0.5 ? -1 : 1;
      var l1 = 50 + r() * 170, d = (14 + r() * 16) * (r() < 0.5 ? -1 : 1), l2 = 40 + r() * 130;
      var p1 = [x0 + dir * l1, y0], p2 = [p1[0] + dir * Math.abs(d), y0 + d * 0.6], p3 = [p2[0] + dir * l2, p2[1]];
      if (nearChannel(x0, y0) || nearChannel(p1[0], y0) || nearChannel(p3[0], p3[1]) || nearChannel(p2[0], p2[1])) continue;
      tr += '<polyline points="' + pts([[x0, y0], p1, p2, p3]) + '"/>';
      nodes += '<circle class="node" cx="' + f1(p3[0]) + '" cy="' + f1(p3[1]) + '" r="3.2" style="animation-delay:' + (r() * 3).toFixed(2) + 's"/>' +
        '<circle cx="' + f1(x0) + '" cy="' + f1(y0) + '" r="2" fill="#0b2a5c" stroke="' + C.teal + '" stroke-width="1"/>';
    }
    html += '<g clip-path="url(#' + id + 'clip)"><g fill="none" stroke="' + C.teal + '" stroke-opacity=".45" stroke-width="1.3">' + tr + '</g><g fill="' + C.aqua + '">' + nodes + '</g></g>';

    // rim light on the surface and the ceiling
    html += '<polyline points="' + pts(surf) + '" fill="none" stroke="url(#' + id + 'rim)" stroke-width="7" stroke-opacity=".16" stroke-linejoin="round"/>';
    html += '<polyline points="' + pts(surf) + '" fill="none" stroke="url(#' + id + 'rim)" stroke-width="2" stroke-linejoin="round"/>';
    html += '<polyline points="' + pts(ceil) + '" fill="none" stroke="' + C.sky + '" stroke-opacity=".5" stroke-width="1.5" stroke-linejoin="round"/>';

    function surfY(x) {
      for (var q = 0; q < surf.length - 1; q++) if (x >= surf[q][0] && x <= surf[q + 1][0]) return lerp(surf[q][1], surf[q + 1][1], (x - surf[q][0]) / (surf[q + 1][0] - surf[q][0]));
      return m - B * 0.15;
    }
    function ceilY(x) {
      for (var q = 0; q < s3.length - 1; q++) if (x >= s3[q][0] && x <= s3[q + 1][0]) return m + B * 0.12;
      return m + B * 0.12;
    }

    // decoration on the ground surface: crystals (caves), luminous plants (community), antennas (surface)
    var dec = '';
    var nD = Math.round(W / (deco === 'plants' ? 120 : 300));
    for (var dI = 0; dI < nD; dI++) {
      var dx = (dI + 0.2 + r() * 0.6) * (W / nD), dy = surfY(dx) + 3;
      if (nearChannel(dx, dy)) continue;
      if (deco === 'plants') {
        var blades = 3 + Math.floor(r() * 4), hMax = B * (0.07 + r() * 0.1);
        dec += '<ellipse cx="' + f1(dx) + '" cy="' + f1(dy) + '" rx="' + f1(hMax * 0.9) + '" ry="' + f1(hMax * 0.35) + '" fill="url(#' + id + 'glow)" opacity=".7"/>';
        for (var bI = 0; bI < blades; bI++) {
          var ang = (r() - 0.5) * 1.1, hh = hMax * (0.45 + r() * 0.55), ww = 3 + r() * 6;
          var tip = [dx + Math.sin(ang) * hh, dy - Math.cos(ang) * hh];
          dec += '<polygon class="leaf" style="animation-delay:' + (r() * 4).toFixed(2) + 's;transform-origin:' + f1(dx) + 'px ' + f1(dy) + 'px" points="' + pts([[dx - ww, dy], [lerp(dx, tip[0], 0.6) - ww * 0.6, lerp(dy, tip[1], 0.6)], tip, [lerp(dx, tip[0], 0.6) + ww * 0.6, lerp(dy, tip[1], 0.6)], [dx + ww, dy]]) + '" fill="url(#' + id + 'leaf)"/>';
          if (r() < 0.5) dec += '<circle class="node" cx="' + f1(tip[0]) + '" cy="' + f1(tip[1]) + '" r="2.4" fill="#d9fff4" style="animation-delay:' + (r() * 3).toFixed(2) + 's"/>';
        }
      } else if (deco === 'antennas') {
        if (r() < 0.6) continue;
        var ah = B * (0.08 + r() * 0.12);
        dec += '<path d="M' + f1(dx) + ' ' + f1(dy) + 'V' + f1(dy - ah) + 'M' + f1(dx - 6) + ' ' + f1(dy) + 'L' + f1(dx) + ' ' + f1(dy - ah * 0.6) + 'L' + f1(dx + 6) + ' ' + f1(dy) + '" stroke="#163a72" stroke-width="2" fill="none"/>' +
          '<circle class="blink" cx="' + f1(dx) + '" cy="' + f1(dy - ah) + '" r="2.6" fill="' + C.aqua + '" style="animation-delay:' + (r() * 2).toFixed(2) + 's"/>';
      } else {
        var n = 2 + Math.floor(r() * 3), base = 8 + r() * 10;
        dec += '<ellipse cx="' + f1(dx) + '" cy="' + f1(dy) + '" rx="' + f1(base * 4) + '" ry="' + f1(base * 1.3) + '" fill="url(#' + id + 'glow)"/>';
        for (var cI = 0; cI < n; cI++) {
          var ca = (r() - 0.5) * 0.9, ch = B * (0.06 + r() * 0.12), cw = base * (0.4 + r() * 0.5), ox = (cI - n / 2) * cw * 1.1;
          var bx = dx + ox, tipx = bx + Math.sin(ca) * ch, tipy = dy - Math.cos(ca) * ch;
          dec += '<polygon points="' + pts([[bx - cw, dy + 2], [lerp(bx, tipx, 0.72) - cw * 0.8, lerp(dy, tipy, 0.72)], [tipx, tipy], [lerp(bx, tipx, 0.72) + cw * 0.8, lerp(dy, tipy, 0.72)], [bx + cw, dy + 2]]) + '" fill="url(#' + id + 'cry)" stroke="' + C.ice + '" stroke-opacity=".45" stroke-width=".8"/>';
        }
      }
    }
    // hanging crystals on the ceiling
    if (kind !== 'surface') {
      var nH = Math.round(W / 420);
      for (var hI = 0; hI < nH; hI++) {
        var hx = (hI + 0.5 + (r() - 0.5) * 0.6) * (W / nH), hy = ceilY(hx) - 4;
        if (nearChannel(hx, hy)) continue;
        var hn = 1 + Math.floor(r() * 3);
        for (var q = 0; q < hn; q++) {
          var hw = 4 + r() * 6, hl = B * (0.05 + r() * 0.1), hxx = hx + (q - hn / 2) * hw * 2.2;
          dec += '<polygon points="' + pts([[hxx - hw, hy], [hxx - hw * 0.7, hy + hl * 0.7], [hxx, hy + hl], [hxx + hw * 0.7, hy + hl * 0.7], [hxx + hw, hy]]) + '" fill="url(#' + id + 'ice)"/>';
        }
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
      '<stop offset="0" stop-color="#0a1a44"/><stop offset=".35" stop-color="#08283c"/><stop offset=".62" stop-color="#0a1a52"/><stop offset="1" stop-color="#072a3c"/></linearGradient>' +
      '<linearGradient id="farC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.aqua + '" stop-opacity=".6"/><stop offset="1" stop-color="' + C.teal + '" stop-opacity="0"/></linearGradient></defs>';
    ['L', 'R'].forEach(function (side) {
      var p = [], y = -40, edge = [];
      while (y < h + 40) { var x = W * (0.015 + r() * wl); edge.push([side === 'L' ? x : W - x, y]); y += H * (0.04 + r() * 0.07); }
      p = side === 'L' ? [[-10, -40]].concat(edge, [[-10, h + 40]]) : [[W + 10, -40]].concat(edge, [[W + 10, h + 40]]);
      html += '<polygon points="' + pts(p) + '" fill="url(#farG)" opacity=".9"/>';
      html += '<polyline points="' + pts(edge) + '" fill="none" stroke="' + C.sky + '" stroke-opacity=".3" stroke-width="1.4"/>';
      for (var i = 0; i < edge.length; i += 3) {
        if (r() < 0.45) continue;
        var e = edge[i], dir = side === 'L' ? 1 : -1, len = 18 + r() * 40;
        html += '<polygon points="' + pts([[e[0], e[1] - 6], [e[0] + dir * len, e[1] - 2 - r() * 10], [e[0], e[1] + 6]]) + '" fill="url(#farC)" opacity=".7"/>';
      }
    });
    // distant hanging columns
    for (var c = 0; c < Math.round(h / H) * 2; c++) {
      var cx = W * (0.2 + r() * 0.6), cy = r() * h, cw = 10 + r() * 26, ch = H * (0.1 + r() * 0.25);
      html += '<polygon points="' + pts([[cx - cw, cy], [cx, cy + ch], [cx + cw, cy]]) + '" fill="#0b1d4c" opacity=".35"/>';
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
    if (art.classList.contains('art-dusk')) {
      html += '<defs><linearGradient id="hz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.teal + '" stop-opacity="0"/><stop offset="1" stop-color="' + C.aqua + '" stop-opacity=".22"/></linearGradient></defs>';
      html += '<rect x="0" y="' + f1(h * 0.45) + '" width="' + W + '" height="' + f1(h * 0.55) + '" fill="url(#hz)"/>';
      var cols = ['#14457a', '#0d3061', '#091f48'];
      for (var L = 0; L < 3; L++) {
        var base = h * (0.62 + L * 0.1), p = [[-10, h + 10]], xx = -10;
        while (xx < W + 20) { p.push([xx, base - h * (0.04 + r() * (0.16 - L * 0.03))]); xx += W * (0.03 + r() * 0.06); }
        p.push([W + 10, h + 10]);
        html += '<polygon points="' + pts(p) + '" fill="' + cols[L] + '"/>';
        html += '<polyline points="' + pts(p.slice(1, -1)) + '" fill="none" stroke="' + C.aqua + '" stroke-opacity="' + (0.25 - L * 0.06).toFixed(2) + '" stroke-width="1.2"/>';
      }
      for (var s = 0; s < 22; s++) html += '<circle class="blink" cx="' + f1(W * (0.25 + r() * 0.7)) + '" cy="' + f1(h * (0.66 + r() * 0.2)) + '" r="' + f1(1 + r() * 1.6) + '" fill="#bffcf1" style="animation-delay:' + (r() * 3).toFixed(2) + 's"/>';
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
        html += '<circle class="spore" cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + f1(cr) + '" fill="' + C.aqua + '" style="animation-delay:' + (r() * 6).toFixed(2) + 's;animation-duration:' + (6 + r() * 6).toFixed(1) + 's"/>';
      }
    } else if (art.classList.contains('art-join')) {
      var cx0 = W * 0.5, y1 = h * 0.47, y2 = h * 0.6, targets = [0.36, 0.5, 0.64];
      var jl = '';
      targets.forEach(function (tx) { jl += '<path d="M' + f1(cx0) + ' ' + f1(y1) + 'C' + f1(cx0) + ' ' + f1(y2) + ' ' + f1(W * tx) + ' ' + f1(y1 + h * 0.04) + ' ' + f1(W * tx) + ' ' + f1(y2 + h * 0.05) + '"/>'; });
      html += '<g fill="none" stroke="' + C.aqua + '" stroke-opacity=".35" stroke-width="2" stroke-dasharray="6 8" class="join-lines">' + jl + '</g>';
    } else if (art.classList.contains('art-portrait')) {
      html += '<defs><linearGradient id="cone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bffcf1" stop-opacity=".16"/><stop offset="1" stop-color="#bffcf1" stop-opacity="0"/></linearGradient></defs>';
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
        var ac = b === 1 ? hex(C.sky) : hex(C.mint);
        ag.addColorStop(0, rgb(ac, 0)); ag.addColorStop(0.15, rgb(ac, 0.13 * sky)); ag.addColorStop(1, rgb(ac, 0));
        c.fillStyle = ag; c.fill();
      }
      for (var s = 0; s < S.stars.length; s++) {
        var st = S.stars[s], sy = st.v * H * 1.4 - cam * 0.12;
        if (sy < -4 || sy > H) continue;
        var tw = 0.5 + 0.5 * Math.sin(t * 1.6 + st.ph);
        c.fillStyle = 'rgba(220,250,255,' + (0.25 + 0.6 * tw) * sky + ')';
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
      c.fillStyle = mo.l === 1 ? 'rgba(120,190,255,' + a + ')' : 'rgba(150,255,226,' + a + ')';
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
      mk([[0, 'rgba(191,252,241,0)'], [0.4, 'rgba(225,255,250,.95)'], [1, 'rgba(95,240,210,0)']]),
      mk([[0, 'rgba(90,170,255,0)'], [0.5, 'rgba(140,215,255,.85)'], [1, 'rgba(42,111,224,0)']])
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
      var passes = [[g * 2.4, 'rgba(3,174,169,.08)'], [g * 1.1, 'rgba(31,212,160,.16)'], [g * 0.55, 'rgba(120,240,220,.22)'], [g * 0.16, 'rgba(225,255,250,.55)']];
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
          c.strokeStyle = s.c ? 'rgba(140,215,255,.8)' : 'rgba(225,255,250,.9)'; c.lineWidth = s.w;
          c.beginPath(); c.moveTo(xa, ya - cam); c.lineTo(xb, yb - cam); c.stroke();
        }
      }
      c.globalAlpha = 1;
    }
    // spill glow
    var sp = S.spill.y - cam;
    if (sp > -200 && sp < H + 200) radial(c, S.spill.x, sp, g * 2.2, [95, 240, 210], 0.55 + 0.1 * Math.sin(t * 2));
    // lake: splash, mist, rising lights
    var ly = S.lakeY - cam;
    if (ly > -300 && ly < H + 400) {
      var lx = xAt(S.lakeY);
      radial(c, lx, ly, g * 3.2, [191, 252, 241], 0.5 + 0.12 * Math.sin(t * 3));
      for (var k = 0; k < 26; k++) {
        var life = ((t * (0.6 + (k % 5) * 0.12) + k * 0.137) % 1 + 1) % 1;
        var ang = (k / 26) * Math.PI - Math.PI;
        var px = lx + Math.cos(ang) * g * (0.4 + life * 1.6), py = ly - Math.sin(-ang) * 0 - (life - life * life) * g * 2.2;
        c.fillStyle = 'rgba(210,255,246,' + (1 - life) * 0.7 + ')';
        c.beginPath(); c.arc(px, py, 1.2 + (1 - life) * 1.6, 0, 6.283); c.fill();
      }
      for (var j = 0; j < S.lights.length; j++) {
        var L = S.lights[j], life2 = (((t * L.sp + L.ph) % 1) + 1) % 1;
        var lyy = ly - life2 * H * 0.75, lxx = W * (0.08 + L.u * 0.84) + Math.sin(t * 0.8 + L.sw) * 14;
        var a2 = Math.sin(life2 * Math.PI) * 0.8;
        radial(c, lxx, lyy, L.s * 5, [120, 255, 220], a2 * 0.35);
        c.fillStyle = 'rgba(230,255,250,' + a2 + ')';
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
