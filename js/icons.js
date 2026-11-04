/* Line icons (24×24, stroke = currentColor). <i data-icon="name"></i> is replaced at start-up. */
(function () {
  'use strict';
  var P = {
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/><circle cx="12" cy="12" r="2.2"/>',
    handshake: '<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2l-3.9-3.9a2.8 2.8 0 0 0-4 0l-.9.9a1.4 1.4 0 1 1-2-2l2.8-2.8a4.6 4.6 0 0 1 5.6-.7l.5.3a4 4 0 0 0 2.4.6H21"/><path d="m21 15-1 1M3 4h8M3 15l6.5 6.5a1.4 1.4 0 0 0 2-2"/><path d="M3 4v11"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    camera: '<path d="M4 7.5h3l1.6-2.5h6.8L17 7.5h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.8"/>',
    video: '<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/>',
    recycle: '<path d="M7 19H4.8a1.8 1.8 0 0 1-1.6-2.7L5.4 12.5"/><path d="m11 19h8.2a1.8 1.8 0 0 0 1.6-2.7l-1.2-2"/><path d="m14 16-3 3 3 3"/><path d="M8.3 13.2 5.4 12.5 4.6 15.4"/><path d="m9.3 5.4 1.1-1.9a1.8 1.8 0 0 1 3.2 0l3.9 6.8"/><path d="m14.4 9.3 3.5.9.9-3.5"/>',
    store: '<path d="M3 9.5 4.6 4h14.8L21 9.5"/><path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8M10 20v-5h4v5"/>',
    board: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 21l4-1 4 1M7 8h6M7 11h9"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18"/>',
    flask: '<path d="M9.5 3h5M10 3v6L4.6 18.2A1.9 1.9 0 0 0 6.3 21h11.4a1.9 1.9 0 0 0 1.7-2.8L14 9V3"/><path d="M7 15h10"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    pin: '<path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    cable: '<path d="M7 3v4M11 3v4M5.5 7h7v3a3.5 3.5 0 0 1-7 0z"/><path d="M9 13.5V16a4 4 0 0 0 8 0V9a3 3 0 0 1 6 0"/>',
    box: '<path d="M3 8.5 12 4l9 4.5v8L12 21l-9-4.5z"/><path d="m3 8.5 9 4.5 9-4.5M12 13v8"/>',
    megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h3l9 5V4L7 9H4a1 1 0 0 0-1 1z"/><path d="M7 15v4.5a1.5 1.5 0 0 0 3 0V16M19.5 9a4 4 0 0 1 0 6"/>',
    menu: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h5M8 12h5M8 16h5M16 8h.01M16 12h.01M16 16h.01"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/><path d="M16 7h4v4"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-1.3-1-1.6-1-2.7 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15.5" cy="7.5" r="1.2"/>',
    shield: '<path d="M12 21s8-3.5 8-10V5l-8-2.5L4 5v6c0 6.5 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    leaf: '<path d="M5 19c-1-7 3-13.5 15-14-.4 11.5-6.5 15.6-13 14z"/><path d="M5 19c3-4.5 6-7 10-9"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    arrowL: '<path d="M20 12H4M10 6l-6 6 6 6"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 11l2 2 4-4M8.5 17h7"/>',
    truck: '<path d="M2.5 6h11v10h-11zM13.5 9.5H18l3.5 3.5v3h-8"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
    building: '<path d="M4 21V5l8-2.5V21M12 8h8v13M2.5 21h19"/><path d="M7.5 8.5h1.5M7.5 12h1.5M7.5 15.5h1.5M15 12h2M15 15.5h2"/>',
    heart: '<path d="M12 20s-8-4.6-8-10.4A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.6C20 15.4 12 20 12 20z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>',
    note: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8.5 12h7M8.5 16h5"/>',
    screen: '<rect x="2.5" y="4" width="19" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    key: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'
  };
  function svg(name) {
    var p = P[name];
    if (!p) return '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + p + '</svg>';
  }
  window.TMIcons = {
    svg: svg,
    hydrate: function (root) {
      var els = (root || document).querySelectorAll('i[data-icon]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.firstChild) continue;
        el.classList.add('ic');
        el.innerHTML = svg(el.getAttribute('data-icon'));
      }
    }
  };
})();
