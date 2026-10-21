/* User interface. Plan coordinates are in PDF points (pt). The y axis points down.
 * The scale (mpp = meters per pt) changes plan coordinates into meters.
 * The user draws in plan coordinates. All calculations use meters. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const SNAP_PX = 9;            // The pick radius for the start point and the other points [px].
  const PLAY_HTML = '▶ Abspielen<kbd>P</kbd>', PAUSE_HTML = '❚❚ Pause<kbd>P</kbd>';

  const S = {
    pageImg: null, pw: 1200, ph: 850,   // The page image and the page size [pt].
    hasPage: false,
    mpp: null,                          // Meters per pt.
    scalePts: [], scaleDone: false,
    start: null,                        // The start: { p: center of the front axle [pt] }.
    pend: null,                         // The start point. It waits for the click of the direction.
    wps: [],                            // The points of the guide line [pt]: { x, y, t }. The value t is 'line' or 'arc'.
    prev: null,                         // The live preview of the next move.
    tool: 'view',                       // The tool follows the step: 'scale' (step 2), 'drive' (step 4), else 'view'.
    step: 1,                            // The step of the guide (1 to 6).
    fileName: null, numPages: 0, pageNo: 1,
    scaleLen: null, scaleBackup: null,  // The length that the user typed. The old scale, while the user measures again.
    note: null,                         // A short message for the user: { text, warn }.
    vehSeen: false, exported: false,
    zoom: 1, ox: 0, oy: 0,              // The view: screen = plan * zoom + offset.
    pos: 0, playing: false,
    valid: 0,                           // The number of points that the vehicle can drive.
    seg: 'line',                        // The type of the next part: 'line' (straight line, corner), 'arc' (arc through the point) or 'turn' (turn by angle).
    turnGon: 200,                       // The change of direction of a turn [gon]. 200 gon is a turn around.
    turnR: 0,                           // The radius of a turn [m]. 0 means the minimum turning circle.
    mouse: null, res: null,
    routes: [], ri: 0                   // The driving lines. ri = the index of the active one. The fields start, wps, pos, res and valid belong to the active line.
  };

  /* ---------- vehicles ---------- */
  const STORE = 'schleppkurve.vehicles.v1';
  const FIELDS = { v_wb: 'wb', v_front: 'front', v_rear: 'rear', v_width: 'width', v_rout: 'rOuter', v_track: 'track', v_ratio: 'ratio', v_gap: 'gap',
                   v_hitch: 'hitch', v_axle2: 'axle2', v_rearOver: 'rearOver', v_knick: 'knickGon',
                   v_tractorRear: 'tractorRear', v_trailerFront: 'trailerFront', v_trailerWidth: 'trailerWidth' };
  let vehicles = Sim.PRESETS.map(Sim.freshPreset), selIdx = 0, presetNote = '';
  try {      // The browser can block the storage. The page also works without it.
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (saved && Array.isArray(saved.list) && saved.list.length) {
      // The preset vehicles get the new preset values, except for the fields that the user changed. New presets are added.
      const m = Sim.mergePresets(saved);
      vehicles = m.list;
      selIdx = Math.min(Math.max(0, saved.sel | 0), vehicles.length - 1);
      const parts = [];
      if (m.updated.length) parts.push('aktualisiert: ' + m.updated.join(', ') + ' (eigene Änderungen bleiben erhalten)');
      if (m.added.length) parts.push('neu: ' + m.added.join(', '));
      if (parts.length) presetNote = 'Voreinstellungen (Version ' + m.from + ' → ' + m.to + ') ' + parts.join(' · ');
    }
  } catch (err) { /* Use the preset vehicles. */ }
  let veh = vehicles[selIdx];
  function saveVehicles() {
    try { localStorage.setItem(STORE, JSON.stringify({ list: vehicles, sel: selIdx, presetVersion: Sim.PRESET_VERSION })); } catch (err) { /* There is no storage. */ }
  }
  if (presetNote) saveVehicles();      // Store the new version. The note is only for this session.
  let pdfDoc = null, spaceDown = false, drag = null, lastClick = { t: 0, x: 0, y: 0 };

  /* ---------- driving lines ---------- */
  // Each driving line has its own points and its own vehicle. The line that the user edits is the active line.
  const ROUTE_COLORS = [null, '#ea580c', '#9333ea', '#0d9488', '#db2777', '#65a30d'];      // The active line has the standard colors.
  function newRoute(name) { return { name: name, veh: veh, start: null, wps: [], pos: 1, res: null, valid: 0 }; }
  S.routes = [newRoute('Fahrkurve 1')];

  /* ---------- view helpers ---------- */
  const s2p = (x, y) => ({ x: (x - S.ox) / S.zoom, y: (y - S.oy) / S.zoom });
  const p2s = (p) => ({ x: p.x * S.zoom + S.ox, y: p.y * S.zoom + S.oy });
  function evPos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  let dirty = false;
  function requestDraw() { if (!dirty) { dirty = true; requestAnimationFrame(draw); } }

  function resize() {
    const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    requestDraw();
  }

  function fitView() {
    const r = cv.getBoundingClientRect();
    S.zoom = Math.min(r.width / S.pw, r.height / S.ph) * 0.95;
    S.ox = (r.width - S.pw * S.zoom) / 2;
    S.oy = (r.height - S.ph * S.zoom) / 2;
    requestDraw();
  }

  /* ---------- load a plan ---------- */
  function resetProject() {
    S.mpp = null; S.scalePts = []; S.scaleDone = false; S.scaleLen = null; S.scaleBackup = null;
    S.exported = false; S.note = null;
    S.start = null; S.pend = null; S.wps = []; S.prev = null;
    S.pos = 1; S.playing = false;
    S.routes = [newRoute('Fahrkurve 1')]; S.ri = 0;
    $('pos').value = 1000;
    renderRoutes();
  }

  async function renderPage(n) {
    const page = await pdfDoc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    // Limit the size of the image. This protects the memory of the browser.
    const rs = Math.min(3, 8192 / Math.max(vp1.width, vp1.height), Math.sqrt(40e6 / (vp1.width * vp1.height)));
    const vp = page.getViewport({ scale: rs });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    resetProject();
    S.pageImg = c; S.pw = vp1.width; S.ph = vp1.height; S.hasPage = true; S.pageNo = n;
    $('empty').style.display = 'none';
    fitView(); recompute();
    goStep(2);
  }

  async function loadPdf(file) {
    if (!window.pdfjsLib) { alert('pdf.js ist nicht geladen (vendor/pdf.min.js fehlt).'); return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    try {
      pdfDoc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    } catch (err) { alert('PDF konnte nicht gelesen werden: ' + err.message); return; }
    S.fileName = file.name; S.numPages = pdfDoc.numPages;
    $('pageRow').style.display = pdfDoc.numPages > 1 ? 'flex' : 'none';
    $('pageNo').value = 1; $('pageNo').max = pdfDoc.numPages;
    $('pageCnt').textContent = 'von ' + pdfDoc.numPages;
    await renderPage(1);
  }

  function loadBlank() {
    resetProject();
    pdfDoc = null; S.fileName = null; S.numPages = 0; S.pageImg = null; S.pw = 2000; S.ph = 1400; S.hasPage = true;
    S.mpp = 0.05;       // The preset scale for tests: 20 pt = 1 m.
    S.scaleDone = true;
    $('pageRow').style.display = 'none';
    $('empty').style.display = 'none';
    fitView(); recompute();
    goStep(3);
  }

  /* ---------- scale ---------- */
  // Two points are set. The user types the real length in the box at the line.
  function finishScale() {
    if (S.scalePts.length < 2) return;
    const input = $('scaleLen');
    input.value = '';
    updateInfo(); requestDraw();
    setTimeout(() => input.focus(), 0);
  }

  function confirmScale() {
    const m = parseFloat(String($('scaleLen').value).replace(',', '.'));
    const mpp = m > 0 ? Sim.scaleFromPolyline(S.scalePts, m) : null;
    if (!mpp) { note('Bitte die Länge der Strecke in Metern eintragen (größer als 0).'); $('scaleLen').focus(); return; }
    S.mpp = mpp; S.scaleDone = true; S.scaleLen = m; S.scaleBackup = null;
    recompute();
    goStep(3);
  }

  // Drop the points that the user did not confirm. A scale that was confirmed before comes back.
  function cancelScale() {
    if (S.scaleBackup) { S.scalePts = S.scaleBackup.pts; S.scaleLen = S.scaleBackup.len; S.scaleDone = true; S.scaleBackup = null; }
    else S.scalePts = [];
    updateInfo(); requestDraw();
  }

  // Measure again. The old scale stays until the user confirms the new one.
  function startMeasure() {
    if (S.scaleDone && S.mpp && !S.scaleBackup) S.scaleBackup = { pts: S.scalePts, len: S.scaleLen };
    S.scalePts = []; S.scaleDone = false;
  }

  /* ---------- calculation ---------- */
  /* Calculate one driving line with its vehicle v.
   * Return { res, valid }: the result for the drawing (or null) and the number of points that the vehicle can drive. */
  function computeRoute(start, wps, v) {
    const lim = Sim.steerLimit(v), o = Sim.driveOpts(v);
    if (!S.mpp || !start || !lim) return { res: null, valid: wps.length };
    // Draw only the part of the route that the vehicle can drive.
    // A point after a line that is too short is not valid.
    const pts = routeMOf(start, wps, null);
    let valid = wps.length;
    for (let k = 2; k <= wps.length; k++) {
      const r = Sim.buildRoute(pts.slice(0, k + 1), v, o, { checkOnly: true });
      if (r.fail) { valid = k - 1; break; }
    }
    const run = Sim.buildRoute(pts.slice(0, valid + 1), v, o);
    const res = analyse(run.smp, lim, v);
    res.lim = lim; res.fail = run.fail; res.arcs = run.arcs; res.lastArc = run.lastArc;
    // A turn has no point of its own. Its marker is at the end of the turn.
    wps.forEach((w, i) => {
      const e = run.ends[i + 1];
      if (w.t === 'turn' && i < valid && e) { w.x = e.x / S.mpp; w.y = e.y / S.mpp; }
    });
    return { res: res, valid: valid };
  }

  function recompute() {
    S.prev = null;
    const c = computeRoute(S.start, S.wps, veh);
    S.res = c.res; S.valid = c.valid;
    // The other driving lines do not change, but their results depend on the scale and on the vehicles.
    S.routes.forEach((r, i) => {
      if (i === S.ri) return;
      const o = computeRoute(r.start, r.wps, r.veh);
      r.res = o.res; r.valid = o.valid;
    });
    updatePreview();
  }

  /* The points of the guide line in meters, with the type of each point ('line', 'arc' or 'turn').
   * extra = one more point (plan units) or null. */
  function routeMOf(start, wps, extra) {
    const pts = [start.p].concat(wps, extra ? [extra] : []);
    return pts.map((q) => ({ x: q.x * S.mpp, y: q.y * S.mpp, t: q.t, sweep: q.sweep, R: q.R }));
  }
  function routeM(extra) { return routeMOf(S.start, S.wps, extra); }

  function routeOk() { return !!S.res && !S.res.fail && S.valid === S.wps.length; }

  /* Calculate the live preview. The mouse is the next point of the guide line.
   * The function limits the mouse point. The vehicle can always drive the route.
   * The preview shows how far the vehicle can go. The user sees the vehicle at all times. */
  function updatePreview() {
    S.prev = null;
    const R = S.res;
    if (R && S.tool === 'drive' && S.mouse && !drag && S.valid === S.wps.length) {
      const m = S.mpp, o = Sim.driveOpts(veh), route = routeM(null), mouse = { x: S.mouse.x * m, y: S.mouse.y * m };
      let run, target, clamped;
      if (S.seg === 'turn') {
        // The side of the mouse (left or right of the vehicle) gives the direction of the turn.
        const V = Sim.buildRoute(route, veh, o, { checkOnly: true }).end;
        const side = Math.cos(V.h) * (mouse.y - V.y) - Math.sin(V.h) * (mouse.x - V.x) >= 0 ? 1 : -1;
        const mt = Sim.makeTurn(route, side, S.turnGon * Math.PI / 200, S.turnR, veh, o);
        run = mt.run; clamped = mt.clamped;
        target = { x: run.end.x / m, y: run.end.y / m, t: 'turn', sweep: mt.el.sweep, R: mt.el.R };
      } else {
        const lt = Sim.limitTarget(route, mouse, S.seg, veh, o);
        run = lt.run; clamped = lt.clamped;
        target = { x: lt.pt.x / m, y: lt.pt.y / m, t: S.seg };
      }
      S.prev = analyse(run.smp, R.lim);
      S.prev.fail = run.fail; S.prev.ok = !run.fail; S.prev.clamped = clamped;
      S.prev.target = target;
      S.prev.lastArc = run.lastArc;
      S.prev.end = run.smp[run.smp.length - 1];
    }
    updateInfo();
    requestDraw();
  }

  function failShort(fl) {
    if (fl.kind === 'steer') return 'Lenkwinkel zu groß';
    if (fl.kind === 'radius') return 'Bogen zu eng';
    if (fl.kind === 'knick') return 'Knickwinkel zu groß';
    return 'Strecke ' + (fl.leg + 1) + ' zu kurz';
  }

  function failText(fl) {
    if (fl.kind === 'steer') return 'Der Lenkwinkel wäre ' + f(gon(fl.maxD), 1) + ' gon und damit über dem Limit.';
    if (fl.kind === 'knick') return 'Der Knickwinkel wäre ' + f(gon(fl.maxPhi), 1) + ' gon und damit über dem Grenzwert von ' + f(gon(fl.limit), 1) + ' gon.';
    if (fl.kind === 'radius') return 'Der Bogen wäre enger als der Wendekreis' + (isFinite(fl.R) ? ' (R = ' + f(fl.R, 1) + ' m, kleinster Radius ' + f(fl.rMin, 1) + ' m).' : '.');
    return isFinite(fl.need)
      ? 'Strecke ' + (fl.leg + 1) + ' ist zu kurz für die Kurven an ihren Enden: nötig ' + f(fl.need, 1) + ' m, vorhanden ' + f(fl.have, 1) + ' m. Für eine Wende „Kurve nach Winkel“ (K oder W) nutzen.'
      : 'Eine Umkehr um fast 200 gon ist mit einer Ecke nicht fahrbar. Für eine Wende „Kurve nach Winkel“ (K oder W) nutzen.';
  }

  /* Make the drawing paths (in meters) and the numbers for a list of samples. */
  function analyse(smp, lim, v) {
    v = v || veh;
    const A = { smp: smp, sweep: new Path2D(), band: new Path2D(), sat: new Path2D(), front: new Path2D(),
                rear: new Path2D(), trails: new Path2D(), sil: new Path2D(),
                maxD: 0, maxPhi: 0, satLen: 0, turn: 0, length: smp[smp.length - 1].s };
    const silStep = Math.max(0.5, parseFloat($('silStep').value) || 2);
    let nextSil = 0;
    smp.forEach((p, i) => {
      const polys = Sim.bodyPolys(p, v);                    // An articulated vehicle has three polygons.
      if (i % 2 === 0 || i === smp.length - 1) polys.forEach((poly) => addPoly(A.sweep, poly));
      if (i % 4 === 0 || i === smp.length - 1) polys.forEach((poly) => addPoly(A.band, poly));      // The band is a stroke: it needs fewer polygons.

      if (p.s >= nextSil) { polys.forEach((poly) => addPoly(A.sil, poly)); nextSil += silStep; }
      A.maxD = Math.max(A.maxD, Math.abs(p.d));
      if (v.artic) A.maxPhi = Math.max(A.maxPhi, Math.abs(p.phi));
      if (i > 0) A.turn += Math.atan2(Math.sin(p.th - smp[i - 1].th), Math.cos(p.th - smp[i - 1].th));    // The change of direction.
      if (i > 0 && Math.abs(p.d) >= lim.delta - 0.0087) {
        A.satLen += p.s - smp[i - 1].s;
        A.sat.moveTo(smp[i - 1].Fx, smp[i - 1].Fy); A.sat.lineTo(p.Fx, p.Fy);
      }
    });
    A.env = Sim.envelopeLines(smp, v);                     // The envelope lines (meters).
    A.env.forEach((t) => polyline(A.trails, t));
    polyline(A.front, smp.map((p) => ({ x: p.Fx, y: p.Fy })));
    polyline(A.rear, smp.map((p) => ({ x: p.Rx, y: p.Ry })));
    return A;
  }

  function addPoly(path, poly) {
    path.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) path.lineTo(poly[i].x, poly[i].y);
    path.closePath();
  }
  function polyline(path, pts) {
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  }

  /* ---------- information panel ---------- */
  const f = (x, d) => x.toFixed(d).replace('.', ',');
  const gon = Sim.gon;        // All angles in the user interface are in gon. 400 gon is a full circle.

  // Set the text only when it changes. The panel updates at each mouse move.
  function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
  function setHtml(el, h) { if (el._html !== h) { el.innerHTML = h; el._html = h; } }
  const kvHtml = (rows) => rows.map((r) => '<span>' + r[0] + '</span><b>' + r[1] + '</b>').join('');

  /* The rows for the articulation angle that the turning circle needs, compared with the limit of the vehicle. */
  function articRows() {
    if (!veh.artic) return [];
    const st = Sim.articSteady(veh);
    if (st == null) return [['Gelenk', '<span class="bad">Maße passen nicht</span>']];
    const ok = veh.knickGon * Math.PI / 200 >= st;
    return [['Knickwinkel im Wendekreis', f(gon(st), 1) + ' gon'],
            ['Grenzwert Knickwinkel', f(veh.knickGon, 1) + ' gon' + (ok ? '' : ' <span class="bad">zu klein</span>')]];
  }

  /* The rows of the result in step 5. */
  function resultRows() {
    const R = S.res, rows = [];
    if (!R || !S.start) return rows;
    rows.push(['Weglänge', f(R.length, 1) + ' m']);
    rows.push(['Richtungsänderung', f(Math.abs(gon(R.turn)), 1) + ' gon ' + (Math.abs(R.turn) < 1e-3 ? '' : R.turn > 0 ? '(rechts)' : '(links)')]);
    rows.push(['Max. Lenkwinkel', f(gon(R.maxD), 1) + ' gon von ' + f(gon(R.lim.delta), 1) + ' gon']);
    rows.push(['Lenkung am Anschlag', R.satLen > 0.01 ? '<span class="warn">' + f(R.satLen, 1) + ' m</span>' : 'nein']);
    if (veh.artic) rows.push(['Knickwinkel max.', f(gon(R.maxPhi), 1) + ' gon von ' + f(veh.knickGon, 1) + ' gon']);
    rows.push(['Wendekreis ⌀ (Platzbedarf einer Wende)', f(2 * veh.rOuter, 2) + ' m']);
    if (R.lastArc && Math.abs(gon(R.lastArc.delta)) >= 150) rows.push(['Querversatz der Leitlinie 2R', f(2 * R.lastArc.R, 2) + ' m (nur die Leitlinie)']);
    rows.push(['Leitlinie', 'Mitte der Vorderachse']);
    if (R.fail) rows.push(['Fahrlinie', '<span class="bad">' + failShort(R.fail) + '</span>']);
    if (S.valid < S.wps.length) rows.push(['Ungültige Punkte', '<span class="bad">ab Punkt ' + (S.valid + 1) + ' (Strecke zu kurz)</span>']);
    return rows;
  }

  function updateInfo() {
    const lim = Sim.steerLimit(veh), R = S.res;
    setHtml($('vInfo'), kvHtml(lim
      ? [['Länge × Breite', f(veh.front + veh.wb + veh.rear, 2) + ' × ' + f(veh.width, 2) + ' m'], ['Wendekreis ⌀ (Platzbedarf)', f(2 * veh.rOuter, 2) + ' m'],
         ['max. Lenkwinkel', f(gon(lim.delta), 1) + ' gon'], ['Radius Hinterachse im Wendekreis', f(lim.rRear, 2) + ' m']].concat(articRows())
      : [['Wendekreis', '<span class="bad">passt nicht zu den Maßen</span>']]));
    if (S.mpp && S.scaleDone) {
      const ratio = 1000 * S.mpp / 0.352778;   // The paper scale 1:x, if the PDF page has the true size.
      setText($('scaleInfo'), '1 m = ' + f(1 / S.mpp, 2) + ' pt · ca. 1:' + Math.round(ratio) + ' (bei Originalgröße)' + (S.scaleLen ? ' · gemessen ' + f(S.scaleLen, 2) + ' m' : ''));
    } else setText($('scaleInfo'), 'Noch nicht gesetzt.');
    setHtml($('res'), kvHtml(resultRows()));
    const q = R && S.start ? R.smp[sampleIndex()] : null;
    setHtml($('dbg'), q ? kvHtml([['Weg s', f(q.s, 1) + ' von ' + f(R.length, 1) + ' m'], ['Lenkwinkel', f(gon(q.d), 1) + ' gon'],
      ['Lenkrad', f(gon(q.d) * veh.ratio, 0) + ' gon (max. ' + f(gon(R.maxD) * veh.ratio, 0) + ' von ' + f(gon(R.lim.delta) * veh.ratio, 0) + ')'],
      ['Fahrzeugwinkel', f(gon(q.th), 1) + ' gon']].concat(veh.artic ? [['Knickwinkel', f(gon(q.phi), 1) + ' gon']] : [])) : '<span class="mute small">Noch keine Fahrlinie.</span>');
    setText($('posInfo'), R && S.start ? f(R.smp[sampleIndex()].s, 1) + ' / ' + f(R.length, 1) + ' m' : '');
    updateGuide();
  }

  /* ---------- guided steps ---------- */
  // A short message for the user. It goes away at the next click, at a change of the step, or after 9 s.
  function note(text, warn) {
    const n = S.note = text ? { text: text, warn: warn !== false } : null;
    if (n) setTimeout(() => { if (S.note === n) { S.note = null; updateGuide(); } }, 9000);
    updateGuide();
  }

  const stepDone = (n) => (n === 1 ? S.hasPage : n === 2 ? !!S.mpp && S.scaleDone : n === 3 ? S.vehSeen
    : n === 4 ? !!S.start && S.wps.length > 0 && routeOk() : n === 5 ? S.exported : false);

  /* What is missing for a step: { title, text, go, btn }, or null. The steps can always be opened. They say what is missing. */
  function gateOf(n) {
    if ((n === 2 || n === 4) && !S.hasPage) return { title: 'Es fehlt noch der Plan', text: 'Lade zuerst einen Lageplan (PDF) oder nutze die leere Fläche zum Testen.', go: 1, btn: 'Zum Lageplan' };
    if (n === 4 && !(S.mpp && S.scaleDone)) return { title: 'Es fehlt noch der Maßstab', text: 'Ohne Maßstab lässt sich keine Fahrlinie rechnen.', go: 2, btn: 'Zum Maßstab' };
    if (n === 5 && !(S.res && S.start && S.wps.length)) {
      const go = !S.hasPage ? 1 : !(S.mpp && S.scaleDone) ? 2 : 4;
      return { title: 'Es gibt noch keine Fahrlinie', text: 'Zeichne zuerst eine Fahrlinie.', go: go, btn: ['', 'Zum Lageplan', 'Zum Maßstab', '', 'Zur Fahrlinie'][go] };
    }
    return null;
  }

  const SEG_HELP = { line: 'Geraden mit einem Bogen an jeder Ecke. Je weiter die Punkte auseinander liegen, desto größer die Kurve.',
    arc: 'Ein Kreisbogen vom Ende der Fahrlinie durch den Punkt an der Maus. Liegt der Punkt gegenüber, entsteht ein Halbkreis.',
    turn: 'Ein Bogen mit der Richtungsänderung in gon (RBSV-Schablone). 200 gon sind eine Wende in einem Zug.' };

  /* What the user can do now: { kind: 'info' | 'ok' | 'warn', title, text, cue }. The cue is the short text at the top of the plan. */
  function promptFor(n) {
    const g = gateOf(n);
    if (g) return { kind: 'warn', title: g.title, text: g.text, cue: '' };
    if (S.note) return { kind: S.note.warn ? 'warn' : 'info', title: S.note.warn ? 'Das geht so nicht' : 'Hinweis', text: S.note.text, cue: S.note.text };
    const R = S.res, P = S.prev, k = S.scalePts.length;
    if (n === 1) return S.hasPage ? { kind: 'ok', title: 'Plan geladen', text: 'Weiter mit dem Maßstab. Ein anderer Plan lässt sich jederzeit laden.', cue: '' }
      : { kind: 'info', title: 'Lageplan als PDF laden', text: 'Datei in das Fenster ziehen oder auswählen. Zum Ausprobieren geht auch die leere Fläche.', cue: '' };
    if (n === 2) {
      if (S.mpp && S.scaleDone) return { kind: 'ok', title: 'Maßstab gesetzt', text: 'Weiter mit dem Fahrzeug. Zum Neumessen „Neu messen“ klicken.', cue: '' };
      if (k === 0) return { kind: 'info', title: 'Zwei Punkte einer bekannten Strecke anklicken', text: 'Zum Beispiel eine Bemaßung, die Fahrbahnbreite oder ein Fahrstreifen im Plan.', cue: 'Klick auf den ersten Punkt der Strecke' };
      if (k === 1) return { kind: 'info', title: 'Jetzt den zweiten Punkt anklicken', text: 'Je länger die Strecke, desto genauer der Maßstab.', cue: 'Klick auf den zweiten Punkt' };
      return { kind: 'info', title: 'Wie lang ist die Strecke in Wirklichkeit?', text: 'Die Länge im Feld am Plan eintragen und mit Enter bestätigen. Esc verwirft die Punkte.', cue: 'Länge der Strecke eintragen, Enter bestätigt' };
    }
    if (n === 3) return { kind: 'info', title: 'Bemessungsfahrzeug wählen', text: 'Gilt für „' + S.routes[S.ri].name + '“. Das Fahrzeug lässt sich später noch wechseln.', cue: '' };
    if (n === 4) {
      if (!S.start) return S.pend ? { kind: 'info', title: 'Richtung der ersten Geraden klicken', text: 'Der zweite Klick legt Fahrtrichtung und erste Gerade fest.', cue: 'Klick: Richtung der ersten Geraden' }
        : { kind: 'info', title: 'Startpunkt klicken', text: 'Setze die Mitte der Vorderachse an den Anfang der Fahrlinie.', cue: 'Klick: Startpunkt der Vorderachsmitte' };
      if (S.valid < S.wps.length) return { kind: 'warn', title: 'Ungültige Punkte ab Punkt ' + (S.valid + 1), text: 'Die Strecken davor sind zu kurz für die Kurven. Mit ⌫ zurücknehmen oder ein anderes Fahrzeug wählen.', cue: 'Ungültige Punkte: mit ⌫ zurücknehmen' };
      if (R && R.fail) return { kind: 'warn', title: 'Die Fahrlinie ist nicht fahrbar', text: failText(R.fail), cue: failShort(R.fail) };
      if (P && !P.ok) return { kind: 'warn', title: 'Dort nicht fahrbar', text: failText(P.fail), cue: 'Dort nicht fahrbar: ' + failShort(P.fail) };
      if (P && P.clamped) return { kind: 'warn', title: 'Weiter geht es dort nicht', text: 'Ein Klick setzt den nächstmöglichen Punkt (orange).', cue: 'Weiter geht es dort nicht: Punkt wird begrenzt' };
      return S.seg === 'arc' ? { kind: 'info', title: 'Punkt für den Bogen klicken', text: 'Der Bogen geht vom Ende der Fahrlinie durch den Punkt an der Maus.', cue: 'Klick: Punkt, durch den der Bogen geht' }
        : S.seg === 'turn' ? { kind: 'info', title: 'Kurve setzen', text: 'Die Maus links oder rechts vom Fahrzeug wählt die Drehrichtung. Richtungsänderung und Radius stehen darunter.', cue: 'Klick: Kurve setzen (Maus links/rechts = Drehrichtung)' }
        : { kind: 'info', title: 'Nächsten Punkt klicken', text: 'An jedem Eckpunkt entsteht ein Bogen. Zurücknehmen mit ⌫.', cue: 'Klick: nächster Punkt' };
    }
    if (n === 5) {
      if (R && R.fail) return { kind: 'warn', title: 'Die Fahrlinie ist nicht fahrbar', text: failText(R.fail), cue: '' };
      if (S.valid < S.wps.length) return { kind: 'warn', title: 'Ungültige Punkte ab Punkt ' + (S.valid + 1), text: 'Zurück zur Fahrlinie und die Punkte prüfen.', cue: '' };
      return { kind: 'ok', title: 'Fahrlinie ist fahrbar', text: 'Fahrzeug abspielen, Anzeige wählen, Ergebnis exportieren.', cue: '' };
    }
    return { kind: 'info', title: 'Nur für die Entwicklung', text: 'Prüft die Kinematik und zeigt Hilfslinien. Für die normale Arbeit nicht nötig.', cue: '' };
  }

  function stepSummary(n) {
    if (n === 1) return !S.hasPage ? 'noch kein Plan geladen' : S.fileName ? S.fileName + (S.numPages > 1 ? ' · Seite ' + S.pageNo + ' von ' + S.numPages : '') : 'Leere Fläche (Test)';
    if (n === 2) return S.mpp && S.scaleDone ? '1 m = ' + f(1 / S.mpp, 2) + ' pt · ca. 1:' + Math.round(1000 * S.mpp / 0.352778) : 'noch nicht gesetzt';
    if (n === 3) return veh.name + ' · Wendekreis ⌀ ' + f(2 * veh.rOuter, 2) + ' m';
    if (n === 4) return !S.start ? 'noch keine Fahrlinie' : S.routes[S.ri].name + ' · ' + S.wps.length + ' Punkte' + (S.res ? ' · ' + f(S.res.length, 1) + ' m' : '');
    if (n === 5) return S.exported ? 'exportiert' : 'Abspielen, Anzeige, Export';
    return 'Selbsttest, Hilfslinien';
  }

  /* The numbers at the bottom of the plan in the steps 4 and 5. In step 4, they are the numbers of the preview. */
  function statusHtml() {
    const R = S.res, P = S.step === 4 ? S.prev : null, A = P || R;
    if (!A || !R || !S.start || (S.step !== 4 && S.step !== 5)) return '';
    const lim = R.lim, c = [], q = S.step === 5 ? R.smp[sampleIndex()] : null;
    if (P) c.push(!P.ok ? '<span class="bad"><b>' + failShort(P.fail) + '</b></span>' : P.clamped ? '<span class="w">begrenzt</span>' : '<span class="good"><b>fahrbar</b></span>');
    c.push(q ? 'Lenkwinkel jetzt <b>' + f(gon(Math.abs(q.d)), 1) + '</b> / ' + f(gon(lim.delta), 1) + ' gon' : 'Lenkwinkel max. <b>' + f(gon(A.maxD), 1) + '</b> / ' + f(gon(lim.delta), 1) + ' gon');
    c.push('Radius Vorderachse min. <b>' + f(lim.rFront, 1) + ' m</b>');
    c.push('Weg <b>' + f(A.length, 1) + ' m</b>');
    if (veh.artic) c.push('Knick max. <b>' + f(gon(A.maxPhi), 1) + '</b> / ' + f(veh.knickGon, 0) + ' gon');
    if (P && P.lastArc) {
      c.push('Bogen R = <b>' + f(P.lastArc.R, 1) + ' m</b> · ' + f(Math.abs(gon(P.lastArc.delta)), 1) + ' gon');
      if (Math.abs(gon(P.lastArc.delta)) >= 150) c.push('Querversatz 2R = <b>' + f(2 * P.lastArc.R, 2) + ' m</b> (Platzbedarf etwa ⌀ ' + f(2 * veh.rOuter, 2) + ' m)');
    }
    if (A.satLen > 0.01) c.push('<span class="w">⚠ Anschlag ' + f(A.satLen, 1) + ' m</span>');
    return c.map((x) => '<span>' + x + '</span>').join('');
  }

  /* Show the state of the guide: the steps, the progress, the question of the step, the numbers and the buttons. */
  function updateGuide() {
    const cur = S.step, dots = $('dots').children;
    for (let n = 1; n <= 6; n++) {
      const el = $('step' + n), kind = n === cur ? 'active' : stepDone(n) ? 'done' : 'todo';
      el.classList.toggle('active', kind === 'active'); el.classList.toggle('done', kind === 'done'); el.classList.toggle('todo', kind === 'todo');
      setText(el.querySelector('.num'), kind === 'done' ? '✓' : n === 6 ? '·' : String(n));
      setText(el.querySelector('.ttl span'), stepSummary(n));
      dots[n - 1].className = (kind === 'active' ? 'cur ' : kind === 'done' ? 'done ' : '') + (n === 6 ? 'opt' : '');
    }
    const body = $('step' + cur), g = gateOf(cur), pr = promptFor(cur), what = body.querySelector('.what');
    what.className = 'what' + (pr.kind === 'warn' ? ' warn' : pr.kind === 'ok' ? ' ok' : '');
    setText(what.querySelector('b'), pr.title); setText(what.querySelector('small'), pr.text);
    const need = body.querySelector('.need'), work = body.querySelector('.work');
    if (need) { need.hidden = !g; if (g) { const b = need.querySelector('button'); b.dataset.go = g.go; setText(b, g.btn); } }
    if (work) work.hidden = !!g;
    body.querySelectorAll('[data-need]').forEach((b) => {
      const k = b.dataset.need;
      b.disabled = k === 'plan' ? !S.hasPage : k === 'scale' ? !(S.mpp && S.scaleDone) : !stepDone(4);
    });
    // The plan: the question as a short text, the numbers, the box for the length, the buttons.
    const cue = $('cue'), text = S.hasPage ? pr.cue : '';
    cue.hidden = !text; setText(cue, text); cue.classList.toggle('warn', pr.kind === 'warn');
    const st = statusHtml(); $('status').hidden = !st; setHtml($('status'), st);
    $('scalebox').hidden = !(cur === 2 && S.scalePts.length === 2 && !S.scaleDone);
    $('tools').hidden = !S.hasPage;
    $('undoBtn').disabled = !(S.tool === 'drive' ? S.pend || S.start : S.tool === 'scale' && !S.scaleDone && S.scalePts.length);
    document.querySelectorAll('[data-seg]').forEach((b) => b.classList.toggle('on', b.dataset.seg === S.seg));
    setText($('segHelp'), SEG_HELP[S.seg]);
    $('turnRow').hidden = S.seg !== 'turn';
    ['png', 'dxf', 'svg', 'play'].forEach((id) => { $(id).disabled = !(S.res && S.start && S.wps.length); });
  }

  /* Go to a step. The tool of the plan follows the step: step 2 measures, step 4 draws, the other steps only move the view. */
  function goStep(n) {
    n = Math.max(1, Math.min(6, n));
    if (S.step === 2 && n !== 2 && !S.scaleDone && S.scalePts.length) cancelScale();      // A measure that is not confirmed does not stay.
    if (S.step === 3 && n > 3) S.vehSeen = true;       // The user passed the vehicle step.
    if (n >= 4 && !gateOf(4)) S.vehSeen = true;
    if (S.playing) { S.playing = false; $('play').innerHTML = PLAY_HTML; }
    S.step = n; S.note = null;
    setTool(n === 2 ? 'scale' : n === 4 ? 'drive' : 'view');
  }

  function sampleIndex() {
    return S.res ? Math.round(S.pos * (S.res.smp.length - 1)) : 0;
  }

  /* ---------- drawing ---------- */
  /* The box for the length of the scale is at the middle of the measured line. */
  function positionScaleBox() {
    const box = $('scalebox');
    if (box.hidden || S.scalePts.length < 2) return;
    const a = p2s(S.scalePts[0]), b = p2s(S.scalePts[1]);
    box.style.left = (a.x + b.x) / 2 + 'px'; box.style.top = (a.y + b.y) / 2 + 'px';
  }

  function draw() {
    dirty = false;
    positionScaleBox();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#8a8f98';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!S.hasPage) return;
    ctx.setTransform(dpr * S.zoom, 0, 0, dpr * S.zoom, dpr * S.ox, dpr * S.oy);
    const px = 1 / S.zoom;                        // One screen pixel in pt.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, S.pw, S.ph);
    if (S.pageImg) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(S.pageImg, 0, 0, S.pw, S.ph); }
    else drawGrid(px);
    drawScale(px);
    drawOthers(px);
    drawResult(px);
    drawPoints(px);
    drawHud();
  }

  function drawGrid(px) {
    if (!S.mpp) return;
    const g = 1 / S.mpp;                          // One meter in pt.
    ctx.lineWidth = px; ctx.strokeStyle = '#e3e6eb';
    ctx.beginPath();
    for (let x = 0; x <= S.pw; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, S.ph); }
    for (let y = 0; y <= S.ph; y += g) { ctx.moveTo(0, y); ctx.lineTo(S.pw, y); }
    ctx.stroke();
    ctx.strokeStyle = '#c4c9d2'; ctx.beginPath();
    for (let x = 0; x <= S.pw; x += g * 10) { ctx.moveTo(x, 0); ctx.lineTo(x, S.ph); }
    for (let y = 0; y <= S.ph; y += g * 10) { ctx.moveTo(0, y); ctx.lineTo(S.pw, y); }
    ctx.stroke();
  }

  function strokePts(pts, closeIt) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (closeIt) ctx.closePath();
  }

  function drawScale(px) {
    const pts = S.scalePts.slice();
    if (S.tool === 'scale' && !S.scaleDone && S.mouse) pts.push(S.mouse);
    ctx.strokeStyle = '#f97316'; ctx.fillStyle = '#f97316'; ctx.lineWidth = 2.5 * px;
    strokePts(pts); ctx.stroke();
    S.scalePts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 4 * px, 0, 7); ctx.fill(); });
    if (S.tool === 'scale' && !S.scaleDone && S.mouse) {      // A cross at the mouse. It helps to find the points on the plan.
      ctx.lineWidth = px;
      ctx.beginPath();
      ctx.moveTo(S.mouse.x - 10 * px, S.mouse.y); ctx.lineTo(S.mouse.x + 10 * px, S.mouse.y);
      ctx.moveTo(S.mouse.x, S.mouse.y - 10 * px); ctx.lineTo(S.mouse.x, S.mouse.y + 10 * px);
      ctx.stroke();
    }
    if (S.scaleDone && S.scaleLen) {
      const a = S.scalePts[0], b = S.scalePts[S.scalePts.length - 1];
      ctx.font = 13 * px + 'px system-ui,sans-serif';
      ctx.fillText(f(S.scaleLen, 2) + ' m', (a.x + b.x) / 2 + 6 * px, (a.y + b.y) / 2 - 6 * px);
    }
  }

  /* The clearance (Bewegungsspielraum) around the swept area, in meters. 0 = off. */
  function clearance() {
    const c = parseFloat(String($('clearM').value).replace(',', '.'));
    return $('oClear').checked && c > 0 ? Math.min(5, c) : 0;
  }

  /* Draw the band of the clearance below the swept area. The swept area (fill and stroke of 2 * clearance with round joins)
   * is drawn opaque on an offscreen canvas. Then the canvas is drawn with transparency. So the edges of the inner strokes
   * and the overlaps of the polygons do not show through. The offscreen canvas is reused while nothing changes.
   * The path A.band has every 4th polygon. The stroke is the slow part, and the width of the band hides the gaps (less than 7 cm). */
  const clearCache = { cv: null, path: null, zoom: 0, ox: 0, oy: 0, w: 0, h: 0, c: 0, mpp: 0 };
  function drawClearance(A, color, c) {
    const dpr = window.devicePixelRatio || 1, w = cv.width, h = cv.height, cc = clearCache;
    if (!cc.cv) cc.cv = document.createElement('canvas');
    if (cc.path !== A.band || cc.zoom !== S.zoom || cc.ox !== S.ox || cc.oy !== S.oy || cc.w !== w || cc.h !== h || cc.c !== c || cc.mpp !== S.mpp || cc.color !== color) {
      cc.cv.width = w; cc.cv.height = h;           // This also clears the canvas.
      const o = cc.cv.getContext('2d');
      o.setTransform(dpr * S.zoom, 0, 0, dpr * S.zoom, dpr * S.ox, dpr * S.oy);
      o.scale(1 / S.mpp, 1 / S.mpp);
      o.fillStyle = color; o.strokeStyle = color; o.lineWidth = 2 * c; o.lineJoin = 'round'; o.lineCap = 'round';
      o.fill(A.band); o.stroke(A.band);
      Object.assign(cc, { path: A.band, zoom: S.zoom, ox: S.ox, oy: S.oy, w: w, h: h, c: c, mpp: S.mpp, color: color });
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.2;
    ctx.drawImage(cc.cv, 0, 0);
    ctx.restore();
  }

  function drawResult(px) {
    const R = S.res, P = S.prev;
    if (!R && !P) return;
    const k = 1 / S.mpp, um = px * S.mpp;        // k changes meters to pt. um is one pixel in meters.
    // If there is a preview, it shows the whole route. If not, the fixed route is shown.
    const A = P || R, ok = P ? (P.ok && !P.clamped) : !R.fail, clear = clearance();
    if (clear > 0) drawClearance(A, ok ? (P ? '#16a34a' : '#2872e0') : '#d94614', clear);
    ctx.save();
    ctx.scale(k, k);
    if ($('oSweep').checked) { ctx.fillStyle = ok ? (P ? 'rgba(22,163,74,.20)' : 'rgba(40,110,220,.22)') : 'rgba(217,70,20,.25)'; ctx.fill(A.sweep); }
    ctx.lineWidth = um; ctx.strokeStyle = ok ? (P ? 'rgba(21,128,61,.9)' : 'rgba(20,70,170,.9)') : 'rgba(194,65,12,.9)'; ctx.stroke(A.trails);
    if ($('oSil').checked) { ctx.strokeStyle = 'rgba(30,40,60,.5)'; ctx.stroke(A.sil); }
    if ($('oRear').checked) { ctx.strokeStyle = '#6b7280'; ctx.setLineDash([4 * um, 3 * um]); ctx.stroke(A.rear); }
    ctx.strokeStyle = ok ? '#111' : '#c2410c'; ctx.lineWidth = 1.5 * um; ctx.setLineDash([]); ctx.stroke(A.front);
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 4 * um; ctx.stroke(A.sat);   // The steering is at the stop.
    drawVehicle(P ? P.end : R.smp[sampleIndex()], um, P ? 0.75 : 1);
    if ($('oIcr').checked && S.step >= 4) drawIcr(P ? P.end : R.smp[sampleIndex()], um);
    ctx.restore();
  }

  /* Debug: the center of rotation (ICR) of the front body. It is on the line of the model rear axle, at the distance wb / tan(d). */
  function drawIcr(q, um) {
    if (Math.abs(q.d) < 1e-3) return;
    const rr = Sim.modelGeom(veh).wb / Math.tan(q.d), cx = q.Rx - rr * Math.sin(q.th), cy = q.Ry + rr * Math.cos(q.th);
    ctx.save();
    ctx.strokeStyle = '#d92d20'; ctx.fillStyle = '#d92d20'; ctx.lineWidth = um; ctx.setLineDash([5 * um, 4 * um]);
    ctx.beginPath(); ctx.moveTo(q.Rx, q.Ry); ctx.lineTo(cx, cy); ctx.moveTo(q.Fx, q.Fy); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 2 * um;
    ctx.beginPath(); ctx.moveTo(cx - 8 * um, cy); ctx.lineTo(cx + 8 * um, cy); ctx.moveTo(cx, cy - 8 * um); ctx.lineTo(cx, cy + 8 * um); ctx.stroke();
    ctx.font = 12 * um + 'px system-ui,sans-serif'; ctx.fillText('Momentanpol', cx + 10 * um, cy - 8 * um);
    ctx.restore();
  }

  /* Draw the vehicle v at the sample p. The origin is the model rear axle (see Sim.modelGeom).
   * A vehicle with gap > 0 has two rear axles. Normally they are at the distance gap/2 in front of and behind the center
   * of the rear axles, and this center is the origin. With a trailing steered axle, the front rear axle is the rigid axle
   * and the origin. The trailing axle is the distance gap behind it. It steers against the front axle.
   * The front wheels have the steering angle p.d. */
  function drawVehicle(p, um, alpha, v, color) {
    v = v || veh;
    color = color || '#0b3d91';
    const m = Sim.modelGeom(v), L = v.front + m.wb + m.rear, hw = v.width / 2;
    const wl = v.width > 2.2 ? 1.0 : 0.65, ww = v.width > 2.2 ? 0.30 : 0.22;       // A truck has larger wheels.
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.strokeStyle = color; ctx.lineWidth = 1.5 * um;
    if (v.artic) {
      // The front body, the bellows (dark, only a bus) and the rear body. A semitrailer has the tractor and the trailer. The polygons are in the plan frame.
      Sim.bodyPolys(p, v).forEach((poly, i) => {
        ctx.beginPath();
        poly.forEach((c, k) => (k ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
        ctx.closePath();
        ctx.fillStyle = i === 1 && v.kind !== 'semi' ? 'rgba(70,70,70,.55)' : 'rgba(255,255,255,.75)';
        ctx.fill(); ctx.stroke();
      });
    }
    ctx.translate(p.Rx, p.Ry); ctx.rotate(p.th);
    if (!v.artic) { ctx.fillRect(-m.rear, -hw, L, v.width); ctx.strokeRect(-m.rear, -hw, L, v.width); }
    ctx.fillStyle = '#222';
    const wheel = (x, y, a) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillRect(-wl / 2, -ww / 2, wl, ww); ctx.restore();
    };
    const t = v.track / 2, g = v.gap > 0 && !v.artic ? v.gap / 2 : 0;
    const rear = g > 0 ? (m.shift > 0 ? [-v.gap, 0] : [-g, g]) : [0];           // The x positions of the rear axles.
    const trailAngle = Sim.trailAngle(v, p.d);
    rear.forEach((x) => {
      const a = x < 0 ? trailAngle : 0;
      wheel(x, -t, a); wheel(x, t, a);
    });
    wheel(m.wb, -t, p.d); wheel(m.wb, t, p.d);
    ctx.strokeStyle = color; ctx.lineWidth = um;     // The axles and the arrow of the direction.
    ctx.beginPath();
    rear.concat([m.wb]).forEach((x) => { ctx.moveTo(x, -t); ctx.lineTo(x, t); });
    const xf = m.wb + v.front;
    ctx.moveTo(xf - 0.5, -0.25); ctx.lineTo(xf - 0.1, 0); ctx.lineTo(xf - 0.5, 0.25);
    if (v.artic) {                                   // The joint is a circle.
      ctx.moveTo(-v.hitch + 0.25, 0); ctx.arc(-v.hitch, 0, 0.25, 0, 7);
    }
    ctx.stroke();
    ctx.restore();
    if (v.artic) {                                   // The rear axle of the rear body, in the frame of the rear body.
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.Tx, p.Ty); ctx.rotate(p.th2);
      ctx.fillStyle = '#222';
      wheel(0, -t, 0); wheel(0, t, 0);
      ctx.strokeStyle = color; ctx.lineWidth = um;
      ctx.beginPath(); ctx.moveTo(0, -t); ctx.lineTo(0, t); ctx.stroke();
      ctx.restore();
    }
  }

  /* Draw the driving lines that are not active. They are weaker than the active line.
   * Each line has its own color and its own vehicle. */
  function drawOthers(px) {
    if (!S.mpp) return;
    const k = 1 / S.mpp, um = px * S.mpp;
    S.routes.forEach((r, i) => {
      if (i === S.ri || !r.res) return;
      const col = ROUTE_COLORS[i % ROUTE_COLORS.length] || '#0b3d91';
      ctx.save();
      ctx.scale(k, k);
      ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.fill(r.res.sweep);
      ctx.globalAlpha = 0.9; ctx.lineWidth = um; ctx.strokeStyle = col; ctx.stroke(r.res.trails);
      ctx.lineWidth = 1.5 * um; ctx.stroke(r.res.front);
      drawVehicle(r.res.smp[Math.round(r.pos * (r.res.smp.length - 1))], um, 0.8, r.veh, col);
      ctx.restore();
      ctx.fillStyle = col; ctx.font = 12 * px + 'px system-ui,sans-serif';       // The name at the start point.
      ctx.fillText(r.name, r.start.p.x + 8 * px, r.start.p.y - 8 * px);
      ctx.beginPath(); ctx.arc(r.start.p.x, r.start.p.y, 4 * px, 0, 7); ctx.fill();
    });
  }

  /* Draw the start, the points and the mouse marker (plan units). */
  function drawPoints(px) {
    const dot = (p, fill) => {
      ctx.beginPath();
      if (p.t === 'arc') {      // A point of an arc is a diamond. A corner point of lines is a circle. The end of a turn is a square.
        ctx.moveTo(p.x, p.y - 7 * px); ctx.lineTo(p.x + 6 * px, p.y); ctx.lineTo(p.x, p.y + 7 * px); ctx.lineTo(p.x - 6 * px, p.y); ctx.closePath();
      } else if (p.t === 'turn') {
        ctx.rect(p.x - 5 * px, p.y - 5 * px, 10 * px, 10 * px);
      } else ctx.arc(p.x, p.y, 5 * px, 0, 7);
      ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.5 * px; ctx.strokeStyle = '#111'; ctx.stroke();
    };
    if (S.start) {      // The straight lines of the guide line. The arcs are the black line.
      const pts = [S.start.p].concat(S.wps.slice(0, S.valid));
      if (S.prev) pts.push(S.prev.target);
      ctx.save(); ctx.setLineDash([6 * px, 5 * px]); ctx.lineWidth = px; ctx.strokeStyle = '#7c3aed';
      ctx.beginPath();
      for (let i = 1; i < pts.length; i++) if (pts[i].t !== 'arc' && pts[i].t !== 'turn') { ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); }
      ctx.stroke();
      if (S.valid < S.wps.length) {       // Points that are not valid have a grey line and red marks.
        ctx.strokeStyle = '#9ca3af'; strokePts(S.wps.slice(Math.max(0, S.valid - 1))); ctx.stroke();
      }
      ctx.restore();
      dot(S.start.p, '#16a34a');
    }
    S.wps.forEach((p, i) => {
      const bad = i >= S.valid;
      dot(p, bad ? '#fecaca' : '#fff');
      if (bad) {
        ctx.strokeStyle = '#d92d20'; ctx.lineWidth = 2 * px; ctx.beginPath();
        ctx.moveTo(p.x - 4 * px, p.y - 4 * px); ctx.lineTo(p.x + 4 * px, p.y + 4 * px);
        ctx.moveTo(p.x + 4 * px, p.y - 4 * px); ctx.lineTo(p.x - 4 * px, p.y + 4 * px); ctx.stroke();
      }
      ctx.fillStyle = '#111'; ctx.font = 11 * px + 'px system-ui,sans-serif';
      ctx.fillText(String(i + 1), p.x + 7 * px, p.y - 7 * px);
    });
    if (S.tool !== 'drive' || !S.mpp) return;
    if (S.pend) {
      dot(S.pend, '#16a34a');
      if (S.mouse) {
        const ang = Math.atan2(S.mouse.y - S.pend.y, S.mouse.x - S.pend.x);
        const st = Sim.startState(veh, { x: S.pend.x * S.mpp, y: S.pend.y * S.mpp }, ang);
        ctx.save(); ctx.scale(1 / S.mpp, 1 / S.mpp); drawVehicle(st, px * S.mpp, 0.7); ctx.restore();
      }
    } else if (S.mouse) {
      const bad = S.prev && (!S.prev.ok || S.prev.clamped);
      if (S.prev && S.prev.clamped) {      // The mouse point is not possible. Show the limited point.
        ctx.save(); ctx.setLineDash([3 * px, 3 * px]); ctx.strokeStyle = '#c2410c'; ctx.lineWidth = px;
        ctx.beginPath(); ctx.moveTo(S.prev.target.x, S.prev.target.y); ctx.lineTo(S.mouse.x, S.mouse.y); ctx.stroke(); ctx.restore();
      }
      ctx.strokeStyle = bad ? '#c2410c' : '#15803d'; ctx.lineWidth = 2 * px;
      ctx.beginPath();
      if (S.seg === 'arc') {       // In arc mode, the marker is a diamond.
        ctx.moveTo(S.mouse.x, S.mouse.y - 9 * px); ctx.lineTo(S.mouse.x + 8 * px, S.mouse.y);
        ctx.lineTo(S.mouse.x, S.mouse.y + 9 * px); ctx.lineTo(S.mouse.x - 8 * px, S.mouse.y); ctx.closePath();
      } else if (S.seg === 'turn') {       // In turn mode, the marker is a square.
        ctx.rect(S.mouse.x - 7 * px, S.mouse.y - 7 * px, 14 * px, 14 * px);
      } else ctx.arc(S.mouse.x, S.mouse.y, 7 * px, 0, 7);
      ctx.moveTo(S.mouse.x - 11 * px, S.mouse.y); ctx.lineTo(S.mouse.x + 11 * px, S.mouse.y);
      ctx.moveTo(S.mouse.x, S.mouse.y - 11 * px); ctx.lineTo(S.mouse.x, S.mouse.y + 11 * px);
      ctx.stroke();
    }
  }

  /* Draw the steering wheel display in the corner (screen units). */
  function drawHud() {
    if (S.step < 4 || !$('oHud').checked) return;
    const q = S.prev ? S.prev.end : S.res ? S.res.smp[sampleIndex()] : null;
    if (!q || !S.res) return;
    const dpr = window.devicePixelRatio || 1, w = cv.width / dpr;
    const lim = S.res.lim.delta, ang = q.d * veh.ratio;
    const cx = w - 90, cy = 70, r = 38, full = lim * veh.ratio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(cx - 80, cy - 52, 160, 130);
    ctx.strokeStyle = '#d9dde4'; ctx.strokeRect(cx - 80, cy - 52, 160, 130);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.strokeStyle = Math.abs(q.d) >= lim - 0.0087 ? '#d97706' : '#1d2330'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, 0); ctx.lineTo(0, r);
    ctx.stroke();
    ctx.fillStyle = '#d92d20'; ctx.fillRect(-3, -r - 4, 6, 9);       // The mark at the top of the wheel.
    ctx.restore();
    // The bar compares the steering angle with the limit.
    const bx = cx - 52, bw = 104, by = cy + 52;
    ctx.fillStyle = '#e5e7eb'; ctx.fillRect(bx, by, bw, 6);
    ctx.fillStyle = Math.abs(q.d) >= lim - 0.0087 ? '#d97706' : '#1f6feb';
    const u = Math.max(-1, Math.min(1, q.d / lim)) * bw / 2;
    ctx.fillRect(bx + bw / 2 + Math.min(0, u), by, Math.abs(u), 6);
    ctx.fillStyle = '#1d2330'; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(f(gon(q.d), 1) + ' gon · Lenkrad ' + f(gon(ang), 0) + ' gon', cx, by + 20);
    ctx.fillText('Limit ±' + f(gon(lim), 1) + ' / ±' + f(gon(full), 0) + ' gon', cx, by + 33);
    ctx.textAlign = 'start';
  }

  /* ---------- tools and input ---------- */
  /* The tool of the plan: 'scale' measures, 'drive' draws the guide line, 'view' only moves the view. The step sets it (see goStep). */
  function setTool(t) {
    S.tool = t;
    cv.style.cursor = t === 'view' ? 'default' : 'crosshair';
    if (t !== 'drive') { S.mouse = null; S.pend = null; }
    updatePreview();
  }

  /* Set the type of the next part: 'line' (straight line, corner), 'arc' (arc through the point) or 'turn' (turn by angle). */
  function setSeg(t) {
    S.seg = t; S.note = null;
    if (S.step !== 4) goStep(4); else updatePreview();
  }

  /* Find the point under the mouse. Return -2 for the start point and -1 if there is no point. */
  function hitWp(sp) {
    for (let i = S.wps.length - 1; i >= 0; i--) {
      const q = p2s(S.wps[i]);
      if (Math.hypot(q.x - sp.x, q.y - sp.y) <= SNAP_PX) return i;
    }
    if (S.start) { const q = p2s(S.start.p); if (Math.hypot(q.x - sp.x, q.y - sp.y) <= SNAP_PX) return -2; }
    return -1;
  }

  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  /* Remove the point i (or the last point). If no other point is left, remove the start point too. */
  function removeWp(i) {
    S.wps.splice(i == null ? S.wps.length - 1 : i, 1);
    if (!S.wps.length) S.start = null;
    recompute();
  }

  /* A click without movement sets a point. A drag of more than 4 px moves the plan.
   * The middle button and the space key always move the plan. */
  function clickAt(sp, p, button) {
    if (!S.hasPage) return;
    if (button === 2) {
      if (S.tool === 'drive') { const i = hitWp(sp); if (i >= 0) removeWp(i); }
      return;
    }
    if (button !== 0) return;
    // Ignore the second click of a double click.
    const now = performance.now();
    const second = now - lastClick.t < 350 && Math.hypot(sp.x - lastClick.x, sp.y - lastClick.y) < 5;
    lastClick = { t: now, x: sp.x, y: sp.y };
    if (second) return;
    S.note = null;
    if (S.tool === 'scale') {
      if (S.scaleDone || S.scalePts.length >= 2) startMeasure();      // The user measures again. The old scale stays until the new one is confirmed.
      S.scalePts.push(p);
      updateInfo(); requestDraw();
      if (S.scalePts.length === 2) finishScale();     // Two points are enough.
    } else if (S.tool === 'drive') {
      if (!S.mpp) { note('Zuerst den Maßstab setzen.'); return; }
      if (!S.start) {
        if (!S.pend) S.pend = p;
        else if (Math.hypot(p.x - S.pend.x, p.y - S.pend.y) * S.zoom > 3) {
          S.start = { p: S.pend }; S.wps = [{ x: p.x, y: p.y, t: 'line' }];       // The second click is the end of the first line.
          S.pend = null; S.pos = 1; $('pos').value = 1000; recompute();
        }
      } else if (S.prev && S.prev.ok) {
        // Set the point of the preview. It is the mouse point.
        // If the mouse point is not possible, it is the limited point.
        const isTurn = S.prev.target.t === 'turn';
        S.wps.push(S.prev.target); S.pos = 1; $('pos').value = 1000; recompute();
        if (isTurn) setSeg('line');       // After a turn, the vehicle drives straight on.
      } else {
        note(S.prev ? failText(S.prev.fail) : 'Zuerst die ungültigen Punkte entfernen (Rückschritt).');
      }
    }
    requestDraw();
  }

  cv.addEventListener('pointerdown', (e) => {
    const sp = evPos(e), p = s2p(sp.x, sp.y);
    cv.setPointerCapture(e.pointerId);
    const pan = { sx: sp.x, sy: sp.y, ox: S.ox, oy: S.oy };
    if (e.button === 1 || spaceDown) { drag = Object.assign({ type: 'pan' }, pan); return; }
    let i = S.tool === 'drive' && e.button === 0 ? hitWp(sp) : -1;
    if (i >= 0 && S.wps[i].t === 'turn') i = -1;      // The end of a turn does not move. The user changes the turn instead.
    if (i !== -1) {      // Move a point. If the route is then not possible, the point goes back.
      drag = { type: i === -2 ? 'start' : 'wp', i: i, okBefore: routeOk(), orig: i === -2 ? S.start.p : S.wps[i] };
    }
    else drag = Object.assign({ type: 'maybe', button: e.button, p: p }, pan);
  });

  cv.addEventListener('pointermove', (e) => {
    const sp = evPos(e);
    S.mouse = s2p(sp.x, sp.y);
    if (drag && drag.type === 'maybe' && Math.hypot(sp.x - drag.sx, sp.y - drag.sy) > 4) {
      drag.type = 'pan'; cv.style.cursor = 'grabbing';
    }
    if (drag && drag.type === 'pan') {
      S.ox = drag.ox + sp.x - drag.sx; S.oy = drag.oy + sp.y - drag.sy;
    } else if (drag && drag.type === 'wp') {
      S.wps[drag.i] = { x: S.mouse.x, y: S.mouse.y, t: S.wps[drag.i].t }; recompute();
    } else if (drag && drag.type === 'start') {
      S.start.p = S.mouse; recompute();
    } else if (S.tool === 'drive') {
      updatePreview();
    }
    requestDraw();
  });

  cv.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    cv.style.cursor = 'crosshair';
    if (d && d.type === 'maybe') clickAt({ x: d.sx, y: d.sy }, d.p, d.button);
    if (d && (d.type === 'wp' || d.type === 'start') && d.okBefore && !routeOk()) {
      if (d.type === 'wp') S.wps[d.i] = d.orig; else S.start.p = d.orig;
      recompute();
      note('Dieser Punkt ist dort nicht möglich: Die Strecken wären zu kurz für die Kurven. Der Punkt ist zurückgesprungen.');
    }
    updatePreview();
  });
  cv.addEventListener('pointerleave', () => { if (!drag) { S.mouse = null; updatePreview(); } });

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const sp = evPos(e), p = s2p(sp.x, sp.y);
    S.zoom = Math.min(80, Math.max(0.02, S.zoom * Math.pow(1.0015, -e.deltaY)));
    S.ox = sp.x - p.x * S.zoom; S.oy = sp.y - p.y * S.zoom;     // The point under the cursor stays in the same position.
    requestDraw();
  }, { passive: false });

  /* Show or hide the list of the keys. */
  function showKeys(on) { $('keys').hidden = !on; }

  /* Keys. Every key has a button too. The space key (hold) moves the plan. The key ? shows the list. */
  window.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space') { spaceDown = true; if (e.target === document.body) e.preventDefault(); return; }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undoPoint(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === '?') showKeys($('keys').hidden);
    else if (k === 'escape') {
      // Esc only stops an input that is not finished. It never changes the step.
      if (!$('keys').hidden) showKeys(false);
      else if (S.tool === 'drive' && S.pend) S.pend = null;
      else if (S.tool === 'scale' && !S.scaleDone && S.scalePts.length) cancelScale();
      else if (S.note) S.note = null;
      updateInfo(); requestDraw();
    } else if (k === 'backspace' || k === 'delete') { e.preventDefault(); undoPoint(); }
    else if (k === 'g') setSeg('line');
    else if (k === 'b') setSeg('arc');
    else if (k === 'k') setSeg('turn');
    else if (k === 'w') { $('turnGon').value = 200; S.turnGon = 200; setSeg('turn'); }      // A turn around: 200 gon.
    else if (k === 'p') { if (S.step !== 5) goStep(5); $('play').click(); }
    else if (k === '0' || k === 'home') fitView();
    else if (k === '+' || k === '=') zoomBy(1.25);
    else if (k === '-') zoomBy(0.8);
    else if (/^[1-9]$/.test(k) && vehicles[+k - 1]) selectVehicle(+k - 1);
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

  /* Remove the last point of the unfinished input: a point of the scale, the start point or the last point of the guide line. */
  function undoPoint() {
    if (S.tool === 'scale') { if (!S.scaleDone && S.scalePts.length) { S.scalePts.pop(); updateInfo(); requestDraw(); } }
    else if (S.tool === 'drive') {
      if (S.pend) { S.pend = null; updateInfo(); requestDraw(); }
      else if (S.start) removeWp();
    }
  }

  function zoomBy(factor) {
    const r = cv.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2, p = s2p(cx, cy);
    S.zoom = Math.min(80, Math.max(0.02, S.zoom * factor));
    S.ox = cx - p.x * S.zoom; S.oy = cy - p.y * S.zoom;
    requestDraw();
  }

  // A button must not keep the focus. If it keeps the focus, the space key pushes it again.
  document.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') e.target.blur(); });

  /* ---------- controls ---------- */
  document.querySelectorAll('[data-seg]').forEach((b) => b.addEventListener('click', () => setSeg(b.dataset.seg)));
  $('wende').addEventListener('click', () => { $('turnGon').value = 200; S.turnGon = 200; setSeg('turn'); });

  // The steps: a click on a header, on the progress bar or on a button with data-go goes to the step.
  document.addEventListener('click', (e) => {
    const h = e.target.closest('.step > header'), b = e.target.closest('[data-go]');
    if (h) goStep(+h.parentNode.id.slice(4));
    else if (b && !b.disabled) goStep(+b.dataset.go);
  });
  for (let n = 1; n <= 6; n++) { const i = document.createElement('i'); i.dataset.go = n; i.title = $('step' + n).querySelector('b').textContent; $('dots').appendChild(i); }
  $('helpBtn').addEventListener('click', () => showKeys($('keys').hidden));
  $('keysClose').addEventListener('click', () => showKeys(false));
  $('zIn').addEventListener('click', () => zoomBy(1.25));
  $('zOut').addEventListener('click', () => zoomBy(0.8));
  $('undoBtn').addEventListener('click', undoPoint);
  $('scaleOk').addEventListener('click', confirmScale);
  $('scaleCancel').addEventListener('click', cancelScale);
  $('scaleLen').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmScale(); } else if (e.key === 'Escape') { e.preventDefault(); cancelScale(); }
  });
  $('moreRoute').addEventListener('click', addRoute);

  // The fields of the turn: the change of direction in gon, and the radius.
  function readTurnFields() {
    const g = parseFloat($('turnGon').value);
    if (g > 0) S.turnGon = Math.min(390, g);
    $('turnR').disabled = $('turnRmin').checked;
    const r = parseFloat($('turnR').value);
    S.turnR = $('turnRmin').checked || !(r > 0) ? 0 : r;
    updatePreview();
  }
  ['turnGon', 'turnR', 'turnRmin'].forEach((id) => $(id).addEventListener('input', readTurnFields));
  $('turnRmin').addEventListener('change', readTurnFields);
  $('file').addEventListener('change', (e) => { if (e.target.files[0]) loadPdf(e.target.files[0]); e.target.value = ''; });
  $('blank').addEventListener('click', loadBlank);
  $('pageNo').addEventListener('change', () => {
    const n = Math.min(pdfDoc.numPages, Math.max(1, parseInt($('pageNo').value, 10) || 1));
    $('pageNo').value = n; renderPage(n);
  });
  $('scaleReset').addEventListener('click', () => { startMeasure(); goStep(2); });
  $('driveReset').addEventListener('click', () => { S.start = null; S.pend = null; S.wps = []; recompute(); });
  $('driveUndo').addEventListener('click', () => { if (S.start) removeWp(); });
  $('fit').addEventListener('click', fitView);
  ['oSweep', 'oSil', 'oClear', 'oIcr', 'oRear', 'oHud'].forEach((id) => $(id).addEventListener('change', requestDraw));
  $('clearM').addEventListener('input', requestDraw);
  $('silStep').addEventListener('change', recompute);

  /* ---------- vehicle list ---------- */
  // A small top view of the vehicle for its card. The length of the drawing follows the length of the vehicle.
  function vehSvg(v) {
    const L = Math.max(30, Math.min(120, (v.front + v.wb + v.rear) * 6.4)), x = (120 - L) / 2, W = 16;
    const body = v.artic ? '<rect x="' + x + '" y="9" width="' + L * 0.52 + '" height="' + W + '" rx="2"/><rect x="' + (x + L * 0.54) + '" y="9" width="' + L * 0.46 + '" height="' + W + '" rx="2"/>'
      : '<rect x="' + x + '" y="9" width="' + L + '" height="' + W + '" rx="2"/>';
    const wheels = [0.2, 0.85].map((u) => '<circle cx="' + (x + L * u) + '" cy="9" r="2.2"/><circle cx="' + (x + L * u) + '" cy="25" r="2.2"/>').join('');
    return '<svg viewBox="0 0 120 34"><g fill="#fff" stroke="#667085" stroke-width="1.6">' + body + '</g><g fill="#222">' + wheels + '</g></svg>';
  }

  function renderVehicles() {
    const box = $('vehList');
    box.innerHTML = '';
    const heading = (t) => { const h = document.createElement('div'); h.className = 'grp'; h.style.gridColumn = '1 / -1'; h.style.margin = '8px 0 0'; h.textContent = t; box.appendChild(h); };
    const card = (v, i) => {
      const b = document.createElement('button'), name = document.createElement('b'), dim = document.createElement('span');
      b.className = 'card' + (i === selIdx ? ' sel' : '');
      b.title = 'Fahrzeug wählen' + (i < 9 ? ' (Taste ' + (i + 1) + ')' : '');
      name.textContent = v.name; dim.className = 'd'; dim.textContent = f(v.front + v.wb + v.rear, 2) + ' × ' + f(v.width, 2) + ' m';
      b.innerHTML = (i < 9 ? '<span class="key">' + (i + 1) + '</span>' : '') + (v.preset && v.placeholder ? '<span class="badge" title="Die Maße sind Platzhalter, keine RBSV-Werte">Platzhalter</span>' : '') + vehSvg(v);
      b.appendChild(name); b.appendChild(dim);
      b.addEventListener('click', () => selectVehicle(i));
      box.appendChild(b);
    };
    heading('Voreinstellungen');
    vehicles.forEach((v, i) => { if (v.preset) card(v, i); });
    heading('Eigene Fahrzeuge');
    vehicles.forEach((v, i) => { if (!v.preset) card(v, i); });
    const add = document.createElement('button');
    add.className = 'card add'; add.textContent = '＋ Kopie des gewählten Fahrzeugs'; add.title = 'Neues Fahrzeug anlegen (Kopie des gewählten)';
    add.addEventListener('click', addVehicle);
    box.appendChild(add);
    $('vehDel').style.display = veh.preset ? 'none' : '';
    $('vehReset').style.display = veh.preset ? '' : 'none';
    $('presetNote').textContent = presetNote; $('presetNote').style.display = presetNote ? '' : 'none';
    updateGuide();
  }

  // The kind of a vehicle: 'rigid', 'bus' (articulated bus) or 'semi' (semitrailer).
  const kindOf = (v) => (v.kind === 'semi' ? 'semi' : v.artic ? 'bus' : 'rigid');
  const LABELS = {
    bus: ['Mittelachse bis Gelenk [m]', 'Gelenk bis Hinterachse [m]', 'Überhang hinter der Hinterachse [m]', 'Max. Knickwinkel [gon]'],
    semi: ['Hinterachse Zugmaschine bis Sattelzapfen [m] (negativ = davor)', 'Sattelzapfen bis Mitte Achsgruppe Auflieger [m]',
           'Auflieger: Überhang hinter der Achsgruppe [m]', 'Max. Knickwinkel Zugmaschine–Auflieger [gon]']
  };

  function refreshFields() {
    const kind = kindOf(veh);
    $('v_name').value = veh.name;
    Object.keys(FIELDS).forEach((id) => { $(id).value = veh[FIELDS[id]] || 0; });
    $('v_trail').checked = !!veh.trail;
    $('v_kind').value = kind;
    $('articBox').style.display = kind === 'rigid' ? 'none' : '';
    $('semiBox').style.display = kind === 'semi' ? '' : 'none';
    $('semiNote').style.display = kind === 'semi' && veh.preset ? '' : 'none';
    ['l_hitch', 'l_axle2', 'l_rearOver', 'l_knick'].forEach((id, i) => { if (LABELS[kind]) $(id).textContent = LABELS[kind][i]; });
    if (kind === 'semi') $('v_hitch').removeAttribute('min'); else $('v_hitch').setAttribute('min', '0');      // The kingpin of a semitrailer is in front of the axle.
    $('v_rear').disabled = kind !== 'rigid';           // For an articulated vehicle, the rear overhang is the sum of the three values.
    $('v_trail').disabled = kind !== 'rigid';
  }

  /* Choose the vehicle for the active driving line. */
  function selectVehicle(i) {
    selIdx = i; veh = vehicles[i];
    S.routes[S.ri].veh = veh;
    refreshFields(); renderVehicles(); renderRoutes(); saveVehicles(); recompute();
  }

  function addVehicle() {
    const name = prompt('Name des neuen Fahrzeugs (Kopie von „' + veh.name + '“):', 'Fahrzeug ' + (vehicles.length + 1));
    if (name == null || !name.trim()) return;
    const copy = Object.assign({}, veh, { name: name.trim(), preset: false });
    delete copy.base;                  // A copy is a user vehicle. It does not follow the presets.
    vehicles.push(copy);
    selectVehicle(vehicles.length - 1);
  }

  $('presetNote').addEventListener('click', () => { presetNote = ''; renderVehicles(); });      // A click hides the note.
  $('vehDel').addEventListener('click', () => {
    if (veh.preset || !confirm('Fahrzeug „' + veh.name + '“ löschen?')) return;
    const gone = veh;
    vehicles.splice(selIdx, 1);
    S.routes.forEach((r) => { if (r.veh === gone) r.veh = vehicles[0]; });      // A driving line must always have a vehicle.
    selectVehicle(Math.max(0, selIdx - 1));
  });
  $('vehReset').addEventListener('click', () => {
    const base = Sim.PRESETS.find((v) => v.name === (veh.base ? veh.base.name : veh.name));      // A renamed preset keeps the name in base.
    if (base) { Object.assign(veh, base); veh.base = Object.assign({}, base); refreshFields(); renderVehicles(); renderRoutes(); saveVehicles(); recompute(); }
  });
  $('v_name').addEventListener('input', () => { veh.name = $('v_name').value || 'Fahrzeug'; renderVehicles(); renderRoutes(); saveVehicles(); });
  Object.keys(FIELDS).forEach((id) => {
    $(id).addEventListener('input', () => {
      const v = parseFloat($(id).value), fld = FIELDS[id];
      // The distance of the rear axles can be 0 (one rear axle). The hitch of a semitrailer is negative (in front of the rear axle).
      // All other values must be more than 0.
      const ok = fld === 'hitch' ? isFinite(v) && (veh.kind === 'semi' || v >= 0) : fld === 'gap' ? v >= 0 : v > 0;
      if (ok) {
        veh[FIELDS[id]] = v;
        if (veh.artic && ['hitch', 'axle2', 'rearOver'].includes(FIELDS[id])) {
          veh.rear = veh.hitch + veh.axle2 + veh.rearOver;           // The distance from the middle axle to the end.
          $('v_rear').value = Math.round(veh.rear * 1000) / 1000;
        }
        saveVehicles(); recompute();
      }
    });
  });
  // Change the kind of the vehicle: rigid, articulated bus or semitrailer. A new kind gets its default dimensions where they are missing.
  const BUS_DEFAULTS = { hitch: 1.8, axle2: 4.2, rearOver: 3.4, knickGon: 65 };
  $('v_kind').addEventListener('change', () => {
    const was = kindOf(veh), kind = $('v_kind').value;
    veh.artic = kind !== 'rigid';
    if (kind === 'semi') veh.kind = 'semi'; else delete veh.kind;
    if (kind !== was && kind !== 'rigid') {
      // The values of a bus do not fit a semitrailer and the other way round: set all of them. A rigid vehicle has none: set the missing ones.
      const def = kind === 'semi' ? Sim.SEMI_DEFAULTS : BUS_DEFAULTS;
      Object.keys(def).forEach((k) => { if (was !== 'rigid' || !veh[k]) veh[k] = def[k]; });
      if (kind === 'semi' && !veh.trailerWidth) veh.trailerWidth = veh.width;
      veh.rear = veh.hitch + veh.axle2 + veh.rearOver;
    }
    if (kind !== 'rigid') veh.trail = false;           // An articulated vehicle does not use the trailing axle.
    refreshFields(); saveVehicles(); recompute();
  });
  $('v_trail').addEventListener('change', () => { veh.trail = $('v_trail').checked; saveVehicles(); recompute(); });      // The trailing axle changes the kinematics.

  /* ---------- list of driving lines ---------- */
  function renderRoutes() {
    const box = $('routeList');
    box.innerHTML = '';
    S.routes.forEach((r, i) => {
      const b = document.createElement('button');
      b.className = 'chip' + (i === S.ri ? ' on' : '');
      b.textContent = r.name + ' · ' + r.veh.name;
      b.title = 'Fahrkurve wählen';
      const col = ROUTE_COLORS[i % ROUTE_COLORS.length];
      if (col && i !== S.ri) b.style.borderLeft = '5px solid ' + col;
      b.addEventListener('click', () => selectRoute(i));
      box.appendChild(b);
    });
    const add = document.createElement('button');
    add.className = 'chip'; add.textContent = '+'; add.title = 'Neue Fahrkurve anlegen (mit dem gewählten Fahrzeug)';
    add.addEventListener('click', addRoute);
    box.appendChild(add);
    $('routeDel').style.display = S.routes.length > 1 ? '' : 'none';
    updateGuide();
    if ($('r_name').value !== S.routes[S.ri].name) $('r_name').value = S.routes[S.ri].name;      // Do not move the cursor while the user types.
  }

  /* Keep the working fields of the active line in its record. */
  function saveRoute() {
    const r = S.routes[S.ri];
    r.start = S.start; r.wps = S.wps; r.pos = S.pos; r.veh = veh; r.res = S.res; r.valid = S.valid;
  }

  function selectRoute(i) {
    if (i < 0 || i >= S.routes.length) return;
    saveRoute();
    S.ri = i;
    const r = S.routes[i];
    S.start = r.start; S.wps = r.wps; S.pos = r.pos; S.pend = null; S.playing = false;
    veh = r.veh; selIdx = Math.max(0, vehicles.indexOf(veh));
    $('pos').value = Math.round(S.pos * 1000);
    refreshFields(); renderVehicles(); renderRoutes(); recompute();
  }

  function addRoute() {
    const name = prompt('Name der neuen Fahrkurve:', 'Fahrkurve ' + (S.routes.length + 1));
    if (name == null || !name.trim()) return;
    saveRoute();
    S.routes.push(newRoute(name.trim()));
    selectRoute(S.routes.length - 1);
    goStep(4);
  }

  $('routeDel').addEventListener('click', () => {
    if (S.routes.length < 2 || !confirm('Fahrkurve „' + S.routes[S.ri].name + '“ löschen?')) return;
    S.routes.splice(S.ri, 1);
    const i = Math.max(0, S.ri - 1);
    S.ri = i;                                   // The working fields now belong to a line that does not exist.
    const r = S.routes[i];
    S.start = r.start; S.wps = r.wps; S.pos = r.pos; S.pend = null; S.playing = false;
    veh = r.veh; selIdx = Math.max(0, vehicles.indexOf(veh));
    $('pos').value = Math.round(S.pos * 1000);
    refreshFields(); renderVehicles(); renderRoutes(); recompute();
  });
  $('r_name').addEventListener('input', () => { S.routes[S.ri].name = $('r_name').value || 'Fahrkurve'; renderRoutes(); requestDraw(); });

  $('pos').addEventListener('input', () => { S.pos = $('pos').value / 1000; updateInfo(); requestDraw(); });

  // Play. Move the vehicle along the path at 3 m/s.
  let lastT = 0;
  function tick(t) {
    if (!S.playing) return;
    const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    if (S.res) {
      S.pos += 3 * dt / S.res.length;
      if (S.pos >= 1) { S.pos = 1; S.playing = false; $('play').innerHTML = PLAY_HTML; }
      $('pos').value = Math.round(S.pos * 1000);
      updateInfo(); requestDraw();
    }
    requestAnimationFrame(tick);
  }
  $('play').addEventListener('click', () => {
    if (!S.res) return;
    S.playing = !S.playing;
    $('play').innerHTML = S.playing ? PAUSE_HTML : PLAY_HTML;
    if (S.playing) { if (S.pos >= 1) S.pos = 0; lastT = performance.now(); requestAnimationFrame(tick); }
  });

  // Download a blob as a file. The link has a blob URL, and the URL goes away after the click.
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('png').addEventListener('click', () => {
    draw();
    cv.toBlob((b) => download(b, 'schleppkurve.png'));
    S.exported = true; updateGuide();
  });

  /* ---------- vector export (DXF, SVG) ---------- */
  // The smallest radius of the guide line (the path of the center of the front axle) in meters, or Infinity for a straight line.
  function minGuideRadius(smp) {
    let minR = Infinity;
    for (let i = 2; i < smp.length; i++) {
      const a = Math.atan2(smp[i - 1].Fy - smp[i - 2].Fy, smp[i - 1].Fx - smp[i - 2].Fx), b = Math.atan2(smp[i].Fy - smp[i - 1].Fy, smp[i].Fx - smp[i - 1].Fx);
      const dth = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))), ds = Math.hypot(smp[i].Fx - smp[i - 1].Fx, smp[i].Fy - smp[i - 1].Fy);
      if (dth > 1e-6) minR = Math.min(minR, ds / dth);
    }
    return minR;
  }

  /* The text lines of the export: the vehicle, the angles and the radii. */
  function exportTexts(unitPt, clear) {
    const R = S.res, v = veh, lim = R.lim, arcs = [];
    R.arcs.forEach((a, i) => { if (a) arcs.push('Ecke ' + i + ': R = ' + f(a.R, 1) + ' m, ' + f(Math.abs(gon(a.delta)), 1) + ' gon'); });
    if (R.lastArc) arcs.push('letzter Bogen: R = ' + f(R.lastArc.R, 1) + ' m, ' + f(Math.abs(gon(R.lastArc.delta)), 1) + ' gon');
    const minR = minGuideRadius(R.smp), t = [];
    t.push('Schleppkurve ' + S.routes[S.ri].name + ' · Fahrzeug ' + v.name);
    t.push('Fahrweise 1 · Leitlinie = Mitte der Vorderachse (nicht die Karosserie)');
    t.push('Wendekreisradius außen ' + f(v.rOuter, 2) + ' m (Durchmesser ' + f(2 * v.rOuter, 2) + ' m) · Radius Vorderachse min. ' + f(lim.rFront, 2) + ' m · max. Lenkwinkel ' + f(gon(lim.delta), 1) + ' gon');
    t.push('Richtungsänderung ' + f(Math.abs(gon(R.turn)), 1) + ' gon ' + (Math.abs(R.turn) < 1e-3 ? '' : R.turn > 0 ? '(rechts)' : '(links)') + ' · Weglänge ' + f(R.length, 1) + ' m · max. Lenkwinkel ' + f(gon(R.maxD), 1) + ' gon' +
      (isFinite(minR) ? ' · kleinster Radius der Leitlinie ' + f(minR, 1) + ' m' : ''));
    if (v.artic) t.push('Knickwinkel max. ' + f(gon(R.maxPhi), 1) + ' gon (Grenzwert ' + f(v.knickGon, 1) + ' gon)');
    if (arcs.length) t.push('Bögen: ' + arcs.join(' · '));
    if (clear > 0) t.push('Bewegungsspielraum ' + f(clear, 2) + ' m (Kontur ist eine Näherung)');
    t.push(unitPt ? 'Einheit: pt (Planeinheiten), Maßstab 1 m = ' + f(1 / S.mpp, 2) + ' pt, ca. 1:' + Math.round(1000 * S.mpp / 0.352778) + ' bei Originalgröße'
                  : 'Einheit: m (Naturmaß)');
    return t;
  }

  /* The model for Export.dxf and Export.svg (see js/export.js): the lines in meters of the selected driving line. */
  function exportModel() {
    const R = S.res, v = veh, clear = clearance(), unitPt = $('expUnit').value === 'pt', simp = (pts) => Export.simplify(pts, 0.002);
    const lines = [];
    lines.push({ layer: 'LEITLINIE', pts: simp(R.smp.map((q) => ({ x: q.Fx, y: q.Fy }))) });      // The guide line is the path of the front axle.
    lines.push({ layer: 'HINTERACHSE', pts: simp(R.smp.map((q) => ({ x: q.Rx, y: q.Ry }))) });
    R.env.forEach((l) => lines.push({ layer: 'HUELLKURVE', pts: simp(l) }));
    const ends = [R.smp[0], R.smp[R.smp.length - 1]];
    ends.forEach((q) => Sim.bodyPolys(q, v).forEach((poly, i) => { if (!(v.artic && v.kind !== 'semi' && i === 1)) lines.push({ layer: 'FAHRZEUG', pts: poly, closed: true }); }));
    if (clear > 0) {
      const polys = [].concat(...R.smp.filter((q, i) => i % 2 === 0 || i === R.smp.length - 1).map((q) => Sim.bodyPolys(q, v)));
      const caps = [].concat(...ends.map((q) => Sim.bodyPolys(q, v)));
      Export.bandLines(polys, R.env, caps, clear).forEach((l) => lines.push({ layer: 'SPIELRAUM', pts: simp(l) }));
    }
    return { title: S.routes[S.ri].name + ' · ' + v.name, lines: lines, texts: exportTexts(unitPt, clear), k: unitPt ? 1 / S.mpp : 1, pageH: S.ph * S.mpp };
  }

  // A file name from the names of the driving line and the vehicle: ASCII, lower case.
  function fileName(ext) {
    const slug = (S.routes[S.ri].name + ' ' + veh.name).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return 'schleppkurve_' + slug + '.' + ext;
  }

  function exportVector(ext) {
    if (!S.res || !S.mpp || !S.start || !S.res.smp.length) {
      note('Für den Export zuerst Maßstab und eine Fahrlinie setzen.');
      return;
    }
    const model = exportModel();
    const text = ext === 'dxf' ? Export.dxf(model) : Export.svg(model);
    download(new Blob([text], { type: ext === 'dxf' ? 'application/dxf' : 'image/svg+xml' }), fileName(ext));
    S.exported = true; updateGuide();
  }
  $('dxf').addEventListener('click', () => exportVector('dxf'));
  $('svg').addEventListener('click', () => exportVector('svg'));

  // The test takes about 10 s and blocks the page. The text "läuft" is shown first.
  $('selftest').addEventListener('click', () => {
    $('selftest').disabled = true; setText($('testInfo'), 'läuft, bitte warten …'); $('tests').innerHTML = '';
    setTimeout(() => {
      const res = Sim.selfTest(), bad = res.filter((r) => !r.ok).length;
      setHtml($('tests'), res.map((r) => '<div class="' + (r.ok ? 'good' : 'bad') + '">' + (r.ok ? '✔ ' : '✘ ') + r.name +
        (r.detail ? ' <span class="mute">(' + r.detail + ')</span>' : '') + '</div>').join(''));
      setText($('testInfo'), bad ? bad + ' von ' + res.length + ' Tests fehlgeschlagen' : 'alle ' + res.length + ' Tests bestanden');
      $('selftest').disabled = false;
    }, 40);
  });

  // Drag a PDF file onto the page and drop it.
  const drop = $('drop');
  window.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.display = 'flex'; });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.style.display = 'none'; });
  window.addEventListener('drop', (e) => {
    e.preventDefault(); drop.style.display = 'none';
    const file = e.dataTransfer.files[0];
    if (file) loadPdf(file);
  });

  window.addEventListener('resize', resize);
  window.Turn = { S: S, get veh() { return veh; }, vehicles: vehicles, selectVehicle: selectVehicle, selectRoute: selectRoute, addRoute: addRoute, setSeg: setSeg, recompute: recompute, finishScale: finishScale, setTool: setTool, updatePreview: updatePreview, goStep: goStep };
  refreshFields(); renderVehicles(); renderRoutes();
  resize(); goStep(1);
})();
