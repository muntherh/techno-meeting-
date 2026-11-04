/*
 * The deck: camera, steps, input, HUD, overview, presenter notes/window.
 * Deck mode (≥ 700 × 460): one scene per screen, every click reveals one element, the camera glides down between
 * scenes. Flow mode (phones): the same world scrolls natively and each scene reveals itself when it comes into view.
 */
(function () {
  'use strict';

  var SET = window.TECHNO_SETTINGS || {};
  var doc = document, root = doc.documentElement, body = doc.body;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var world = $('#world'), back = $('#back');
  var scenes = $$('.scene', world);
  var N = scenes.length;
  var maxStep = scenes.map(function (sc) {
    var m = 0; $$('[data-step]', sc).forEach(function (el) { m = Math.max(m, +el.getAttribute('data-step')); }); return m;
  });

  var st = {
    deck: true, W: 0, H: 0, tops: [], hs: [],
    idx: 0, step: 0, cam: 0,
    tween: null, // {from,to,t0,dur,target}
    overlay: null, started: false, lastInput: 0, pointer: { x: -1, y: -1 }
  };

  // ───────────────────────────── content set-up
  function get(path) {
    return path.split('.').reduce(function (o, k) { return o && o[k] != null ? o[k] : ''; }, SET);
  }
  function fillSettings() {
    $$('[data-set]').forEach(function (el) {
      var v = String(get(el.getAttribute('data-set')) || '').trim();
      if (v) { el.textContent = v; el.classList.remove('is-ph'); }
      else { el.innerHTML = '<span class="ph">يُحدَّد لاحقًا</span>'; el.classList.add('is-ph'); }
    });
  }
  function buildQrs() {
    $$('[data-qr]').forEach(function (el) {
      var url = String(get(el.getAttribute('data-qr')) || '').trim();
      el.innerHTML = '';
      if (url && window.qrcode) {
        try {
          var q = window.qrcode(0, 'M'); q.addData(url); q.make();
          var n = q.getModuleCount(), m = 2, d = '';
          for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
          el.innerHTML = '<svg viewBox="0 0 ' + (n + 2 * m) + ' ' + (n + 2 * m) + '" shape-rendering="crispEdges" role="img" aria-label="رمز QR لنموذج الانضمام"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#0a1030"/></svg>';
          el.classList.add('has');
          var link = doc.createElement('small'); link.className = 'qr-url'; link.textContent = url.replace(/^https?:\/\//, '').slice(0, 42);
          el.appendChild(link);
          return;
        } catch (e) { /* fall through to placeholder */ }
      }
      el.innerHTML = '<span class="qr-ph"><i data-icon="form"></i><span>يُضاف رابط النموذج</span></span>';
    });
  }
  function buildTraces() {
    $$('.hd .trace').forEach(function (el) {
      var hd = el.closest('.hd'), t = $('.title .ln > span', hd);
      if (!t) return;
      var w = Math.max(120, Math.min(t.getBoundingClientRect().width, hd.getBoundingClientRect().width || 9999));
      var h = 26, a = w * 0.66, k = 12, b = Math.min(w * 0.92, a + w * 0.24);
      // drawn from the reading start (right edge in RTL) towards the end
      var d = 'M' + w + ' 5H' + (w - a) + 'L' + (w - a - k) + ' ' + (5 + k) + 'H' + (w - b + 8);
      el.innerHTML = '<svg viewBox="0 0 ' + (w + 2) + ' ' + h + '" width="' + (w + 2) + '" height="' + h + '" aria-hidden="true">' +
        '<defs><linearGradient id="tg' + Math.random().toString(36).slice(2, 7) + '" x1="1" x2="0"><stop offset="0" stop-color="#3a74ff"/><stop offset=".6" stop-color="#2d5ef0"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>' +
        '<path class="tr-line" d="' + d + '" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle class="tr-dot" cx="' + (w - 2) + '" cy="5" r="3.2"/>' +
        '<circle class="tr-node" cx="' + (w - b + 3) + '" cy="' + (5 + k) + '" r="5.5"/></svg>';
      var gid = $('linearGradient', el).id;
      $('.tr-line', el).setAttribute('stroke', 'url(#' + gid + ')');
      var len = $('.tr-line', el).getTotalLength ? $('.tr-line', el).getTotalLength() : w * 1.2;
      el.style.setProperty('--len', len.toFixed(1));
      el.style.width = (w + 2) + 'px';
    });
  }
  function decorate() {
    // flowing particles along the front of the planet ring
    var front = $('.ring-front path');
    if (front) {
      var flow = front.cloneNode(); flow.setAttribute('class', 'ring-flow'); flow.removeAttribute('opacity');
      front.parentNode.appendChild(flow);
    }
    // reveal order inside a scene (for staggering automatic reveals)
    scenes.forEach(function (sc) {
      var i = 0;
      $$('.r, .ln', sc).forEach(function (el) { el.style.setProperty('--d', (i++)); });
      $$('[data-step]', sc).forEach(function (el) { el.style.setProperty('--sd', (+el.getAttribute('data-step') - 1)); });
    });
  }

  // ───────────────────────────── layout
  function isDeck() {
    if (/[?&]mode=flow/.test(location.search)) return false;
    if (/[?&]mode=deck/.test(location.search)) return true;
    return innerWidth >= 700 && innerHeight >= 460;
  }
  function layout() {
    st.deck = isDeck();
    root.classList.toggle('deck', st.deck);
    root.classList.toggle('flow', !st.deck);
    st.W = root.clientWidth; st.H = innerHeight;
    root.style.setProperty('--sw', st.W + 'px');
    root.style.setProperty('--sh', st.H + 'px');
    st.tops = scenes.map(function (s) { return s.offsetTop; });
    st.hs = scenes.map(function (s) { return s.offsetHeight; });
    var total = st.tops[N - 1] + st.hs[N - 1];
    body.style.height = st.deck ? '' : total + 'px';
    world.style.height = total + 'px';
    buildTraces();
    // apply current camera before measuring the spill point
    if (st.deck && !st.tween) st.cam = st.tops[st.idx];
    if (!st.deck) st.cam = scrollY;
    applyCam(0);
    TMWorld.layout({ W: st.W, H: st.H, tops: st.tops, hs: st.hs, deck: st.deck });
    gauge();
  }

  // ───────────────────────────── camera
  function ease(t) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; }
  function applyCam(travel) {
    var sc = 1 - 0.035 * travel;
    var tf = 'translate3d(0,' + (-st.cam).toFixed(2) + 'px,0)' + (travel > 0.001 ? ' scale(' + sc.toFixed(4) + ')' : '');
    var org = (st.W / 2) + 'px ' + (st.cam + st.H / 2).toFixed(1) + 'px';
    world.style.transform = tf; world.style.transformOrigin = org;
    back.style.transform = tf; back.style.transformOrigin = org;
    // the planet lags behind as we leave the sky (extra depth)
    var planet = $('.planet');
    if (planet) planet.style.transform = 'translate3d(-50%,' + (Math.min(st.cam, st.H * 1.2) * 0.32).toFixed(1) + 'px,0)';
  }
  function travelTo(i, onArrive) {
    var from = st.cam, to = st.tops[i];
    var dist = Math.abs(i - st.idx) || 1;
    var dur = reduced ? 0 : Math.min(2600, 1500 + 420 * Math.log(dist + 0.0001) / Math.LN2 * (dist > 1 ? 1 : 0));
    st.tween = { from: from, to: to, t0: performance.now(), dur: dur, target: i, done: onArrive, half: false };
    if (!dur) { st.cam = to; st.tween = null; onArrive && onArrive(); }
  }

  // ───────────────────────────── scenes and steps
  function setSteps(i, step, instant) {
    var sc = scenes[i];
    $$('[data-step]', sc).forEach(function (el) {
      var n = +el.getAttribute('data-step');
      el.classList.toggle('on', n <= step);
      el.classList.toggle('now', n === step);
      if (instant) el.classList.add('instant'); else el.classList.remove('instant');
    });
    if (sc.id === 's05') { var vf = $('[data-shutter]'); if (vf) vf.classList.toggle('shot', step >= 3); }
  }
  function arrive(i) {
    scenes.forEach(function (s, k) { if (k !== i) s.classList.remove('is-here'); });
    scenes[i].classList.add('is-here');
    syncUi();
  }
  function go(i, step, opts) {
    opts = opts || {};
    i = Math.max(0, Math.min(N - 1, i));
    step = Math.max(0, Math.min(maxStep[i], step));
    if (!st.deck) { scrollTo({ top: st.tops[i], behavior: reduced ? 'auto' : 'smooth' }); return; }
    if (i === st.idx && !st.tween) {
      st.step = step; setSteps(i, step); arrive(i); return;
    }
    var prev = st.idx;
    st.idx = i; st.step = step;
    setSteps(i, step, true);
    if (opts.instant) {
      st.cam = st.tops[i]; st.tween = null; applyCam(0); arrive(i);
      scenes[prev] && scenes[prev] !== scenes[i] && setSteps(prev, 0, true);
      return;
    }
    travelTo(i, function () { arrive(i); setSteps(prev, prev === i ? step : 0, true); });
    syncUi();
  }
  function next() {
    if (closeOverlay()) return;
    hideHint();
    if (!st.deck) { go(currentFlowIdx() + 1, 0); return; }
    if (st.tween) { // skip to the end of the glide
      finishTween(); return;
    }
    if (st.step < maxStep[st.idx]) { st.step++; setSteps(st.idx, st.step); syncUi(); }
    else if (st.idx < N - 1) go(st.idx + 1, 0);
  }
  function prev() {
    if (closeOverlay()) return;
    if (!st.deck) { go(currentFlowIdx() - 1, 0); return; }
    if (st.tween) { finishTween(); return; }
    if (st.step > 0) { st.step--; setSteps(st.idx, st.step); syncUi(); }
    else if (st.idx > 0) go(st.idx - 1, maxStep[st.idx - 1]);
  }
  function finishTween() {
    var tw = st.tween; if (!tw) return;
    st.tween = null; st.cam = tw.to; applyCam(0);
    if (!tw.half) { tw.half = true; }
    tw.done && tw.done();
  }
  function currentFlowIdx() {
    var y = scrollY + st.H * 0.4, i = 0;
    while (i < N - 1 && st.tops[i + 1] <= y) i++;
    return i;
  }

  // ───────────────────────────── HUD
  var gaugeEl = $('#gauge'), stepsEl = $('#steps'), labelEl = $('#label');
  function gauge() {
    if (gaugeEl.childElementCount === N) return;
    gaugeEl.innerHTML = '';
    scenes.forEach(function (sc, i) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', (i + 1) + ' — ' + sc.getAttribute('data-title'));
      b.setAttribute('data-title', sc.getAttribute('data-title'));
      b.addEventListener('click', function (e) { e.stopPropagation(); go(i, 0); });
      gaugeEl.appendChild(b);
    });
  }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function syncUi() {
    var i = st.deck ? st.idx : currentFlowIdx();
    $$('button', gaugeEl).forEach(function (b, k) { b.classList.toggle('on', k === i); b.classList.toggle('past', k < i); });
    labelEl.innerHTML = '<bdi dir="ltr"><b>' + two(i + 1) + '</b><span> / ' + two(N) + '</span></bdi><em></em>';
    labelEl.querySelector('em').textContent = scenes[i].getAttribute('data-title');
    var m = maxStep[i], h = '';
    if (st.deck && m) for (var k = 1; k <= m; k++) h += '<i class="' + (k <= st.step ? 'on' : '') + '"></i>';
    stepsEl.innerHTML = h;
    // notes
    $('.notes-h', notesEl).textContent = two(i + 1) + ' · ' + scenes[i].getAttribute('data-title') + (m ? '  —  ' + st.step + '/' + m : '');
    $('.notes-t', notesEl).textContent = scenes[i].getAttribute('data-notes') || '';
    if (st.deck) {
      try { history.replaceState(null, '', '#' + (i + 1) + (st.step ? '.' + st.step : '')); } catch (e) { /* file:// may refuse */ }
    }
    presenterSync();
  }
  var ctrl = $('#controls'), hideT = 0;
  function poke() {
    body.classList.add('ui-on');
    clearTimeout(hideT);
    hideT = setTimeout(function () { body.classList.remove('ui-on'); }, 2600);
  }
  function hideHint() { if (!st.started) { st.started = true; body.classList.add('started'); } }

  // ───────────────────────────── overlays
  var notesEl = $('#notes'), ovEl = $('#overview'), lbEl = $('#lightbox'), helpEl = $('#help'), boEl = $('#blackout');
  function closeOverlay() {
    if (!st.overlay) return false;
    st.overlay.hidden = true; st.overlay = null; body.classList.remove('has-overlay');
    return true;
  }
  function openOverlay(el) { closeOverlay(); el.hidden = false; st.overlay = el; body.classList.add('has-overlay'); }
  function overview() {
    if (st.overlay === ovEl) { closeOverlay(); return; }
    var list = $('.ov-grid', ovEl); list.innerHTML = '';
    var cur = st.deck ? st.idx : currentFlowIdx();
    scenes.forEach(function (sc, i) {
      var li = doc.createElement('li');
      var b = doc.createElement('button'); b.type = 'button';
      b.className = 'ov-item z-' + sc.getAttribute('data-zone') + (i === cur ? ' on' : '');
      b.innerHTML = '<span class="ov-n">' + two(i + 1) + '</span><span class="ov-t">' + sc.getAttribute('data-title') + '</span><span class="ov-s">' + (maxStep[i] ? maxStep[i] + ' خطوات' : 'مشهد') + '</span>';
      b.addEventListener('click', function () { closeOverlay(); go(i, 0); });
      li.appendChild(b); list.appendChild(li);
    });
    openOverlay(ovEl);
    var on = $('.ov-item.on', ovEl); on && on.focus();
  }
  function zoom(src) {
    $('img', lbEl).src = src; openOverlay(lbEl);
  }
  function fullscreen() {
    if (!doc.fullscreenElement) (root.requestFullscreen || root.webkitRequestFullscreen || function () {}).call(root);
    else (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
  }
  function toggleNotes() { notesEl.hidden = !notesEl.hidden; body.classList.toggle('notes-on', !notesEl.hidden); }

  // ───────────────────────────── presenter window
  var pw = null, pwT0 = 0;
  function presenter() {
    if (pw && !pw.closed) { pw.focus(); return; }
    pw = window.open('', 'techno-presenter', 'width=980,height=680');
    if (!pw) return;
    pwT0 = Date.now();
    var d = pw.document;
    d.open();
    d.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>نافذة المقدّم · TECHNO</title><style>' +
      '@font-face{font-family:Plex;src:url("' + absUrl('assets/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2') + '")}' +
      '@font-face{font-family:Alex;src:url("' + absUrl('assets/fonts/alexandria-arabic-wght-normal.woff2') + '");font-weight:100 900}' +
      'body{margin:0;background:#04050c;color:#e9eefc;font:20px/1.7 Plex,system-ui,sans-serif;display:grid;grid-template-rows:auto 1fr auto;height:100vh}' +
      'header{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;border-bottom:1px solid #1a2346;font-family:Alex}' +
      '#t{font-size:34px;font-variant-numeric:tabular-nums;color:#8fb4ff}main{padding:18px 26px;overflow:auto}' +
      'h1{font-family:Alex;font-size:34px;margin:.2em 0}.st{color:#9fb0d6}.nx{margin-top:18px;padding:12px 16px;border:1px solid #24356e;border-radius:12px;color:#c4cee8}' +
      '.nx b{color:#8fb4ff}#n{font-size:24px;line-height:1.8;background:#0b1024;border-radius:14px;padding:16px 20px;margin-top:12px}' +
      'footer{display:flex;gap:10px;padding:12px 22px;border-top:1px solid #1a2346}button{font:inherit;font-size:18px;padding:10px 22px;border-radius:10px;border:1px solid #ff8a3d;background:#0e1530;color:#fff;cursor:pointer}' +
      'button.p{background:linear-gradient(90deg,#3a74ff,#ff8a3d);border:0;color:#060912;font-weight:700}</style></head><body>' +
      '<header><span>TECHNO · نافذة المقدّم</span><span id="t">00:00</span></header>' +
      '<main><p class="st" id="s"></p><h1 id="h"></h1><div id="n"></div><div class="nx" id="x"></div></main>' +
      '<footer><button id="bp">السابق</button><button class="p" id="bn">التالي</button><button id="br">إعادة المؤقّت</button></footer></body></html>');
    d.close();
    d.getElementById('bn').onclick = function () { next(); };
    d.getElementById('bp').onclick = function () { prev(); };
    d.getElementById('br').onclick = function () { pwT0 = Date.now(); };
    d.addEventListener('keydown', onKey);
    presenterSync();
  }
  function absUrl(p) { return new URL(p, location.href).href; }
  function describe(el) {
    if (!el) return '';
    var h = el.querySelector('h3, b, span:not(.num):not(.n)');
    return ((h && h.textContent) || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  function presenterSync() {
    if (!pw || pw.closed) return;
    var d = pw.document, i = st.deck ? st.idx : currentFlowIdx(), sc = scenes[i], m = maxStep[i];
    d.getElementById('s').textContent = 'المشهد ' + (i + 1) + ' من ' + N + (m ? ' · الخطوة ' + st.step + ' من ' + m : '');
    d.getElementById('h').textContent = sc.getAttribute('data-title');
    d.getElementById('n').textContent = sc.getAttribute('data-notes') || '';
    var nx = '';
    if (st.step < m) nx = describe($('[data-step="' + (st.step + 1) + '"]', sc));
    else if (i < N - 1) nx = 'الانتقال إلى: ' + scenes[i + 1].getAttribute('data-title');
    else nx = 'نهاية العرض';
    d.getElementById('x').innerHTML = '<b>التالي:</b> ';
    d.getElementById('x').appendChild(d.createTextNode(nx));
  }
  setInterval(function () {
    if (!pw || pw.closed) return;
    var s = Math.floor((Date.now() - pwT0) / 1000);
    pw.document.getElementById('t').textContent = two(Math.floor(s / 60)) + ':' + two(s % 60);
  }, 1000);

  // ───────────────────────────── input
  function onKey(e) {
    var k = e.key;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { if (k === 'Escape') e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (st.overlay === ovEl && /Arrow|Tab|Enter| /.test(k) && k !== 'Escape') {
      if (k === 'Enter' || k === ' ') return; // let the focused tile handle it
      if (/Arrow/.test(k)) { moveOvFocus(k); e.preventDefault(); }
      return;
    }
    switch (k) {
      case ' ': case 'ArrowDown': case 'PageDown': case 'ArrowLeft': case 'Enter':
        e.preventDefault(); next(); break;
      case 'ArrowUp': case 'PageUp': case 'ArrowRight': case 'Backspace':
        e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); closeOverlay(); go(0, 0); break;
      case 'End': e.preventDefault(); closeOverlay(); go(N - 1, 0); break;
      case 'o': case 'O': case 'ش': overview(); break;
      case 'f': case 'F': case 'ب': fullscreen(); break;
      case 'n': case 'N': case 'ى': toggleNotes(); break;
      case 'p': case 'P': case 'ح': presenter(); break;
      case 'z': case 'Z': case 'ئ': {
        var img = $('[data-zoom] img', scenes[st.deck ? st.idx : currentFlowIdx()]);
        if (st.overlay === lbEl) closeOverlay(); else if (img) zoom(img.src);
        break;
      }
      case 'b': case 'B': case 'لا': case '.':
        if (st.overlay === boEl) closeOverlay(); else openOverlay(boEl); break;
      case '?': case '/': case 'h': case 'H':
        if (st.overlay === helpEl) closeOverlay(); else openOverlay(helpEl); break;
      case 'l': case 'L': case 'م': setLite(!root.classList.contains('lite'), false); break;
      case 'Escape': closeOverlay(); break;
      default: return;
    }
    st.lastInput = performance.now();
  }
  function moveOvFocus(k) {
    var items = $$('.ov-item', ovEl), i = items.indexOf(doc.activeElement);
    var cols = Math.round($('.ov-grid', ovEl).clientWidth / (items[0].clientWidth + 12)) || 1;
    var d = k === 'ArrowLeft' ? 1 : k === 'ArrowRight' ? -1 : k === 'ArrowDown' ? cols : -cols;
    var n = Math.max(0, Math.min(items.length - 1, (i < 0 ? 0 : i + d)));
    items[n].focus();
  }
  doc.addEventListener('keydown', onKey);

  var wheelAcc = 0, wheelLock = 0;
  addEventListener('wheel', function (e) {
    if (!st.deck || st.overlay) return;
    e.preventDefault();
    var now = performance.now();
    if (now < wheelLock) return;
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > 50) {
      if (wheelAcc > 0) next(); else prev();
      wheelAcc = 0; wheelLock = now + 650;
    }
  }, { passive: false });

  var ty0 = null;
  addEventListener('touchstart', function (e) { if (st.deck) ty0 = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', function (e) {
    if (!st.deck || ty0 == null) return;
    var dy = ty0 - e.changedTouches[0].clientY; ty0 = null;
    if (Math.abs(dy) > 50) { if (dy > 0) next(); else prev(); }
  }, { passive: true });

  ctrl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cmd]'); if (!b) return;
    e.stopPropagation();
    ({ prev: prev, next: next, overview: overview, notes: toggleNotes, presenter: presenter, fullscreen: fullscreen,
      help: function () { if (st.overlay === helpEl) closeOverlay(); else openOverlay(helpEl); } })[b.getAttribute('data-cmd')]();
  });
  doc.addEventListener('click', function (e) {
    if (e.target.closest('#controls, #gauge, #overview .ov-item, #notes, a, button')) return;
    var z = e.target.closest('[data-zoom]');
    if (z) { zoom($('img', z).src); return; }
    if (st.overlay) { if (st.overlay !== ovEl || e.target === ovEl) closeOverlay(); return; }
    if (st.deck && e.button === 0) next();
  });
  doc.addEventListener('contextmenu', function (e) { if (st.deck && !st.overlay) { e.preventDefault(); prev(); } });
  addEventListener('pointermove', function (e) { st.pointer.x = e.clientX; st.pointer.y = e.clientY; poke(); }, { passive: true });

  var rT = 0;
  addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(layout, 120); });
  addEventListener('scroll', function () { if (!st.deck) { st.cam = scrollY; } }, { passive: true });

  // flow mode: scenes reveal themselves as they come into view
  function flowReveal(sc) {
    var i = scenes.indexOf(sc);
    sc.classList.add('is-here'); setSteps(i, maxStep[i]);
  }
  var io = new IntersectionObserver(function (entries) {
    if (!root.classList.contains('flow')) return;
    entries.forEach(function (en) {
      if (en.isIntersecting) flowReveal(en.target);
    });
    syncUi();
  }, { threshold: 0.2 });
  scenes.forEach(function (s) { io.observe(s); });

  // ───────────────────────────── low-power mode (L, ?lite=1, or automatic on a slow machine)
  var perfS = { t0: 0, n: 0, slow: 0, done: false };
  function setLite(on, auto) {
    root.classList.toggle('lite', on);
    TMWorld.state.lite = on;
    if (auto) toast('وضع الأداء الخفيف مفعّل تلقائيًا (L للتبديل)');
    else toast(on ? 'وضع الأداء الخفيف: مفعّل' : 'وضع الأداء الخفيف: متوقف');
  }
  function perf(now) {
    if (perfS.done || !st.deck || document.hidden) return;
    if (!perfS.t0) { perfS.t0 = now; perfS.last = now; return; }
    var dt = now - perfS.last; perfS.last = now;
    if (now - perfS.t0 < 1500) return; // skip start-up frames
    perfS.n++; if (dt > 40) perfS.slow++;
    if (perfS.n >= 150) {
      perfS.done = true;
      if (perfS.slow / perfS.n > 0.5 && !root.classList.contains('lite')) setLite(true, true);
    }
  }
  var toastEl = null, toastT = 0;
  function toast(msg) {
    if (!toastEl) { toastEl = doc.createElement('div'); toastEl.id = 'toast'; body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2400);
  }

  // ───────────────────────────── loop
  function loop(now) {
    var travel = 0;
    if (st.deck && st.tween) {
      var tw = st.tween, p = Math.min(1, (now - tw.t0) / tw.dur);
      st.cam = tw.from + (tw.to - tw.from) * ease(p);
      travel = Math.sin(Math.PI * p);
      if (p > 0.62 && !tw.half) { tw.half = true; scenes[tw.target].classList.add('is-here'); }
      if (p >= 1) { st.tween = null; st.cam = tw.to; travel = 0; tw.done && tw.done(); }
    }
    if (!st.deck) st.cam = scrollY;
    if (st.cam !== st.lastCam || travel !== st.lastTravel) {
      if (st.deck) applyCam(travel);
      else { world.style.transform = 'translate3d(0,' + (-st.cam) + 'px,0)'; back.style.transform = world.style.transform; }
      st.lastCam = st.cam; st.lastTravel = travel;
    }
    TMWorld.frame(now, st.cam, travel);
    perf(now);
    requestAnimationFrame(loop);
  }

  // ───────────────────────────── start
  function start() {
    TMIcons.hydrate();
    fillSettings();
    buildQrs();
    TMIcons.hydrate();
    decorate();
    TMWorld.init({ scenes: scenes, back: back, far: $('#far'), near: $('#near'), bg: $('#bg'), fx: $('#fx') });
    var h = (location.hash || '').replace('#', '').split('.');
    var i0 = Math.max(0, Math.min(N - 1, (parseInt(h[0], 10) || 1) - 1)), s0 = parseInt(h[1], 10) || 0;
    st.idx = i0; st.step = Math.min(maxStep[i0], s0);
    layout();
    setSteps(st.idx, st.step, true);
    if (st.deck) { st.cam = st.tops[st.idx]; applyCam(0); }
    else scenes.forEach(function (sc) { var r = sc.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) flowReveal(sc); });
    if (/[?&]lite=1/.test(location.search)) setLite(true, false);
    root.classList.add('ready');
    // let the first frame paint, then start the intro
    requestAnimationFrame(function () {
      setTimeout(function () { if (st.deck) arrive(st.idx); if (st.idx > 0) hideHint(); }, 120);
    });
    requestAnimationFrame(loop);
    poke();
  }
  var fontsReady = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
    start();
    // fonts that finish later change text widths: re-measure once
    fontsReady.then(function () { setTimeout(layout, 50); });
  });

  window.__deck = { go: go, next: next, prev: prev, state: st, scenes: scenes, maxStep: maxStep };
})();
