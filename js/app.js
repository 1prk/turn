/* User interface. Plan coordinates are in PDF points (pt), y points down.
 * The scale (mpp = meters per pt) converts plan coordinates to meters.
 * The user draws in plan coordinates. All calculations use meters. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const SNAP_PX = 9;            // pick radius for start and target points [px]

  const S = {
    pageImg: null, pw: 1200, ph: 850,   // page image and page size [pt]
    hasPage: false,
    mpp: null,                          // meters per pt
    scalePts: [], scaleDone: false,
    start: null,                        // start pose: { p: front axle center [pt], ang: angle [rad] }
    pend: null,                         // start point that waits for the direction click
    wps: [],                            // targets for the center of the front axle [pt]
    prev: null,                         // live preview of the next move
    obsM: [],                           // obstacles in meters, with bounding boxes
    obst: [], cur: [],                  // finished obstacles and the one in progress
    tool: 'pan',
    zoom: 1, ox: 0, oy: 0,              // view: screen = plan * zoom + offset
    pos: 0, playing: false,
    mouse: null, res: null
  };
  const veh = Object.assign({}, Sim.DEFAULT_VEHICLE);
  let pdfDoc = null, spaceDown = false, drag = null, lastDown = { t: 0, x: 0, y: 0 };

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
    S.mpp = null; S.scalePts = []; S.scaleDone = false;
    S.start = null; S.pend = null; S.wps = []; S.prev = null;
    S.obst = []; S.cur = []; S.pos = 1; S.playing = false;
    $('pos').value = 1000;
  }

  async function renderPage(n) {
    const page = await pdfDoc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    // Limit the image size to protect the memory of the browser.
    const rs = Math.min(3, 8192 / Math.max(vp1.width, vp1.height), Math.sqrt(40e6 / (vp1.width * vp1.height)));
    const vp = page.getViewport({ scale: rs });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    resetProject();
    S.pageImg = c; S.pw = vp1.width; S.ph = vp1.height; S.hasPage = true;
    $('empty').style.display = 'none';
    fitView(); recompute();
    setTool('scale');
  }

  async function loadPdf(file) {
    if (!window.pdfjsLib) { alert('pdf.js ist nicht geladen (vendor/pdf.min.js fehlt).'); return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    try {
      pdfDoc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    } catch (err) { alert('PDF konnte nicht gelesen werden: ' + err.message); return; }
    $('pageRow').style.display = pdfDoc.numPages > 1 ? 'flex' : 'none';
    $('pageNo').value = 1; $('pageNo').max = pdfDoc.numPages;
    $('pageCnt').textContent = 'von ' + pdfDoc.numPages;
    await renderPage(1);
  }

  function loadBlank() {
    resetProject();
    pdfDoc = null; S.pageImg = null; S.pw = 2000; S.ph = 1400; S.hasPage = true;
    S.mpp = 0.05;       // preset scale for tests: 20 pt = 1 m
    S.scaleDone = true;
    $('pageRow').style.display = 'none';
    $('empty').style.display = 'none';
    fitView(); recompute(); setTool('drive');
  }

  /* ---------- scale ---------- */
  function finishScale() {
    const pts = S.scalePts;
    if (pts.length < 2) return;
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const ans = prompt('Länge des Linienzugs in m (' + (pts.length - 1) + ' Segment(e)):', '');
    const m = ans == null ? NaN : parseFloat(String(ans).replace(',', '.'));
    if (!(m > 0)) { S.scalePts = []; requestDraw(); return; }
    S.mpp = Sim.scaleFromPolyline(pts, m);
    S.scaleDone = true;
    S.scaleLen = m;
    recompute();
  }

  /* ---------- obstacles ---------- */
  function finishObst() {
    if (S.cur.length >= 3) S.obst.push(S.cur);
    S.cur = [];
    recompute();
  }

  /* ---------- calculation ---------- */
  function recompute() {
    S.res = null; S.prev = null;
    const lim = Sim.steerLimit(veh), o = Sim.driveOpts(veh);
    if (S.mpp && S.start && lim) {
      const m = S.mpp;
      S.obsM = S.obst.map((poly) => {
        const pts = poly.map((p) => ({ x: p.x * m, y: p.y * m }));
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        return { pts: pts, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      });
      const st = Sim.startState(veh, { x: S.start.p.x * m, y: S.start.p.y * m }, S.start.ang);
      const run = Sim.driveAll(st, S.wps.map((p) => ({ x: p.x * m, y: p.y * m })), veh, o);
      S.res = analyse(run.smp, lim);
      S.res.lim = lim; S.res.fail = run.fail; S.res.wpIdx = run.wpIdx;
      if (run.fail) S.res.failPath = polyPath(run.fail.samples);
    }
    updatePreview();
  }

  /* Calculate the live preview: drive from the end of the path to the mouse. */
  function updatePreview() {
    S.prev = null;
    const R = S.res;
    if (R && !R.fail && S.tool === 'drive' && S.mouse && !(drag && drag.type === 'wp')) {
      const m = S.mpp, end = R.smp[R.smp.length - 1];
      const r = Sim.driveTo(end, { x: S.mouse.x * m, y: S.mouse.y * m }, veh, Sim.driveOpts(veh));
      const smp = [end].concat(r.samples);
      S.prev = analyse(smp, R.lim);
      S.prev.reached = r.reached; S.prev.end = smp[smp.length - 1];
      // Show the normal hint again after an error message.
      if (r.reached && $('hint').dataset.err) { $('hint').textContent = HINTS[S.tool]; delete $('hint').dataset.err; }
    }
    updateInfo();
    requestDraw();
  }

  /* Build drawing paths (in meters) and numbers for a list of samples. */
  function analyse(smp, lim) {
    const A = { smp: smp, sweep: new Path2D(), hit: new Path2D(), sat: new Path2D(), front: new Path2D(),
                rear: new Path2D(), trails: new Path2D(), sil: new Path2D(),
                maxD: 0, satLen: 0, firstHit: null, length: smp[smp.length - 1].s };
    const trail = [[], [], [], []];
    const silStep = Math.max(0.5, parseFloat($('silStep').value) || 2);
    let nextSil = 0;
    smp.forEach((p, i) => {
      const poly = Sim.bodyPoly(p, veh);
      poly.forEach((c, k) => trail[k].push(c));
      if (i % 2 === 0 || i === smp.length - 1) addPoly(A.sweep, poly);
      if (p.s >= nextSil) { addPoly(A.sil, poly); nextSil += silStep; }
      A.maxD = Math.max(A.maxD, Math.abs(p.d));
      if (i > 0 && Math.abs(p.d) >= lim.delta - 1e-3) {
        A.satLen += p.s - smp[i - 1].s;
        A.sat.moveTo(smp[i - 1].Fx, smp[i - 1].Fy); A.sat.lineTo(p.Fx, p.Fy);
      }
      // Test the body against each obstacle. Test the bounding box first.
      const xs = poly.map((c) => c.x), ys = poly.map((c) => c.y);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      for (const o of S.obsM) {
        if (bx1 < o.x0 || bx0 > o.x1 || by1 < o.y0 || by0 > o.y1) continue;
        if (Sim.polysIntersect(poly, o.pts)) {
          addPoly(A.hit, poly);
          if (A.firstHit == null) A.firstHit = p.s;
          break;
        }
      }
    });
    trail.forEach((t) => polyline(A.trails, t));
    polyline(A.front, smp.map((p) => ({ x: p.Fx, y: p.Fy })));
    polyline(A.rear, smp.map((p) => ({ x: p.Rx, y: p.Ry })));
    return A;
  }

  function polyPath(smp) {
    const path = new Path2D();
    if (smp.length) polyline(path, smp.map((p) => ({ x: p.Fx, y: p.Fy })));
    return path;
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
  const deg = (r) => r * 180 / Math.PI;

  function updateInfo() {
    const lim = Sim.steerLimit(veh);
    $('vInfo').innerHTML = 'Länge gesamt ' + f(veh.front + veh.wb + veh.rear, 2) + ' m · ' + (lim
      ? 'max. Lenkwinkel ' + f(deg(lim.delta), 1) + '° · Radius Hinterachse ' + f(lim.rRear, 2) + ' m'
      : '<span class="bad">Wendekreis passt nicht zu den Maßen</span>');
    if (S.mpp) {
      const ratio = 1000 * S.mpp / 0.352778;   // paper scale 1:x if the PDF page is true size
      $('scaleInfo').innerHTML = '1 m = ' + f(1 / S.mpp, 2) + ' pt · ca. 1:' + Math.round(ratio) + ' (bei Originalgröße)';
    } else {
      $('scaleInfo').textContent = S.tool === 'scale'
        ? 'Klicke eine bekannte Strecke an. Doppelklick oder Enter beendet.' : 'nicht gesetzt';
    }
    const R = S.res, P = S.prev, rows = [];
    if (!S.mpp) rows.push(['Status', '<span class="warn">Maßstab fehlt</span>']);
    else if (!S.start) rows.push(['Status', '<span class="mute">Startpunkt und Richtung setzen</span>']);
    else if (R) {
      rows.push(['Weglänge', f(R.length, 1) + ' m']);
      rows.push(['Max. Lenkwinkel', f(deg(R.maxD), 1) + '° von ' + f(deg(R.lim.delta), 1) + '°']);
      rows.push(['Lenkrad max.', f(deg(R.maxD) * veh.ratio, 0) + '° von ' + f(deg(R.lim.delta) * veh.ratio, 0) + '°']);
      rows.push(['Lenkung am Anschlag', R.satLen > 0.01 ? '<span class="warn">' + f(R.satLen, 1) + ' m</span>' : 'nein']);
      if (R.fail) rows.push(['Ziel ' + (R.fail.index + 1), '<span class="bad">nicht erreichbar</span>']);
      rows.push(['Hindernisse', S.obst.length === 0 ? '<span class="mute">keine</span>'
        : R.firstHit == null ? '<span class="good">keine Kollision</span>'
        : '<span class="bad">Kollision ab ' + f(R.firstHit, 1) + ' m</span>']);
      const q = R.smp[sampleIndex()];
      rows.push(['Position ' + f(q.s, 1) + ' m', 'Lenkwinkel ' + f(deg(q.d), 1) + '°']);
    }
    if (P) {
      rows.push(['Vorschau', P.reached ? '<span class="good">Ziel erreichbar</span>'
        : '<span class="bad">Ziel nicht erreichbar</span>']);
      rows.push(['Vorschau: Lenkwinkel max.', f(deg(P.maxD), 1) + '° (Lenkrad ' + f(deg(P.maxD) * veh.ratio, 0) + '°)']);
      if (S.obst.length) rows.push(['Vorschau: Hindernis', P.firstHit == null ? '<span class="good">frei</span>'
        : '<span class="bad">Kollision</span>']);
    }
    $('res').innerHTML = rows.map((r) => '<span>' + r[0] + '</span><b>' + r[1] + '</b>').join('');
    $('posInfo').textContent = R ? f(R.smp[sampleIndex()].s, 1) + ' / ' + f(R.length, 1) + ' m' : '';
  }

  function sampleIndex() {
    return S.res ? Math.round(S.pos * (S.res.smp.length - 1)) : 0;
  }

  /* ---------- drawing ---------- */
  function draw() {
    dirty = false;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#8a8f98';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!S.hasPage) return;
    ctx.setTransform(dpr * S.zoom, 0, 0, dpr * S.zoom, dpr * S.ox, dpr * S.oy);
    const px = 1 / S.zoom;                        // one screen pixel in pt
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, S.pw, S.ph);
    if (S.pageImg) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(S.pageImg, 0, 0, S.pw, S.ph); }
    else drawGrid(px);
    drawObstacles(px);
    drawScale(px);
    drawResult(px);
    drawPoints(px);
    drawHud();
  }

  function drawGrid(px) {
    if (!S.mpp) return;
    const g = 1 / S.mpp;                          // one meter in pt
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
    if (!pts.length) return;
    if (S.tool === 'scale' && !S.scaleDone && S.mouse) pts.push(S.mouse);
    ctx.strokeStyle = '#f97316'; ctx.fillStyle = '#f97316'; ctx.lineWidth = 2.5 * px;
    strokePts(pts); ctx.stroke();
    S.scalePts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 4 * px, 0, 7); ctx.fill(); });
    if (S.scaleDone && S.scaleLen) {
      const a = S.scalePts[0], b = S.scalePts[S.scalePts.length - 1];
      ctx.font = 13 * px + 'px system-ui,sans-serif';
      ctx.fillText(f(S.scaleLen, 2) + ' m', (a.x + b.x) / 2 + 6 * px, (a.y + b.y) / 2 - 6 * px);
    }
  }

  function drawObstacles(px) {
    ctx.lineWidth = 1.5 * px;
    ctx.fillStyle = 'rgba(220,50,50,.30)'; ctx.strokeStyle = '#c0392b';
    S.obst.forEach((o) => { strokePts(o, true); ctx.fill(); ctx.stroke(); });
    if (S.cur.length) {
      const pts = S.cur.slice();
      if (S.tool === 'obst' && S.mouse) pts.push(S.mouse);
      ctx.setLineDash([5 * px, 4 * px]); strokePts(pts); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  function drawResult(px) {
    const R = S.res, P = S.prev;
    if (!R && !P) return;
    const k = 1 / S.mpp, um = px * S.mpp;        // meters -> pt, and one pixel in meters
    ctx.save();
    ctx.scale(k, k);
    if (R) {
      if ($('oSweep').checked) { ctx.fillStyle = 'rgba(40,110,220,.22)'; ctx.fill(R.sweep); }
      if (S.obst.length) { ctx.fillStyle = 'rgba(230,30,30,.40)'; ctx.fill(R.hit); }
      ctx.lineWidth = um; ctx.strokeStyle = 'rgba(20,70,170,.9)'; ctx.stroke(R.trails);
      if ($('oSil').checked) { ctx.strokeStyle = 'rgba(30,40,60,.55)'; ctx.stroke(R.sil); }
      ctx.strokeStyle = '#6b7280'; ctx.setLineDash([4 * um, 3 * um]); ctx.stroke(R.rear);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5 * um; ctx.setLineDash([]); ctx.stroke(R.front);
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 4 * um; ctx.stroke(R.sat);   // steering at the stop
      if (R.failPath) { ctx.strokeStyle = '#e11d1d'; ctx.setLineDash([6 * um, 4 * um]); ctx.lineWidth = 2 * um; ctx.stroke(R.failPath); ctx.setLineDash([]); }
      drawVehicle(R.smp[sampleIndex()], um, 1);
    }
    if (P) {
      const ok = P.reached;
      ctx.fillStyle = ok ? 'rgba(22,163,74,.20)' : 'rgba(217,119,6,.24)'; ctx.fill(P.sweep);
      if (S.obst.length) { ctx.fillStyle = 'rgba(230,30,30,.45)'; ctx.fill(P.hit); }
      ctx.lineWidth = um; ctx.strokeStyle = ok ? 'rgba(21,128,61,.9)' : 'rgba(194,65,12,.9)'; ctx.stroke(P.trails);
      ctx.strokeStyle = 'rgba(30,40,60,.45)'; ctx.stroke(P.sil);
      ctx.lineWidth = 2 * um; ctx.strokeStyle = ok ? '#15803d' : '#c2410c'; ctx.stroke(P.front);
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 4 * um; ctx.stroke(P.sat);
      drawVehicle(P.end, um, 0.6);
    }
    ctx.restore();
  }

  function drawVehicle(p, um, alpha) {
    const L = veh.front + veh.wb + veh.rear, hw = veh.width / 2, wl = 0.65, ww = 0.22;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.Rx, p.Ry); ctx.rotate(p.th);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.strokeStyle = '#0b3d91'; ctx.lineWidth = 1.5 * um;
    ctx.fillRect(-veh.rear, -hw, L, veh.width); ctx.strokeRect(-veh.rear, -hw, L, veh.width);
    ctx.fillStyle = '#222';
    const wheel = (x, y, a) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillRect(-wl / 2, -ww / 2, wl, ww); ctx.restore();
    };
    const t = veh.track / 2;
    wheel(0, -t, 0); wheel(0, t, 0);
    wheel(veh.wb, -t, p.d); wheel(veh.wb, t, p.d);
    ctx.strokeStyle = '#0b3d91'; ctx.lineWidth = um;     // axles and direction arrow
    ctx.beginPath(); ctx.moveTo(0, -t); ctx.lineTo(0, t); ctx.moveTo(veh.wb, -t); ctx.lineTo(veh.wb, t);
    const xf = veh.wb + veh.front;
    ctx.moveTo(xf - 0.5, -0.25); ctx.lineTo(xf - 0.1, 0); ctx.lineTo(xf - 0.5, 0.25);
    ctx.stroke();
    ctx.restore();
  }

  /* Draw the start, the targets and the mouse marker (plan units). */
  function drawPoints(px) {
    const dot = (p, fill) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 5 * px, 0, 7);
      ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.5 * px; ctx.strokeStyle = '#111'; ctx.stroke();
    };
    if (S.start) dot(S.start.p, '#16a34a');
    S.wps.forEach((p, i) => {
      dot(p, '#fff');
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
      const bad = S.prev && !S.prev.reached;
      ctx.strokeStyle = bad ? '#c2410c' : '#15803d'; ctx.lineWidth = 2 * px;
      ctx.beginPath(); ctx.arc(S.mouse.x, S.mouse.y, 7 * px, 0, 7);
      ctx.moveTo(S.mouse.x - 11 * px, S.mouse.y); ctx.lineTo(S.mouse.x + 11 * px, S.mouse.y);
      ctx.moveTo(S.mouse.x, S.mouse.y - 11 * px); ctx.lineTo(S.mouse.x, S.mouse.y + 11 * px);
      ctx.stroke();
    }
  }

  /* Draw the steering wheel display in the corner (screen units). */
  function drawHud() {
    const q = S.prev ? S.prev.end : S.res ? S.res.smp[sampleIndex()] : null;
    if (!q || !S.res) return;
    const dpr = window.devicePixelRatio || 1, w = cv.width / dpr;
    const lim = S.res.lim.delta, ang = q.d * veh.ratio;
    const cx = w - 90, cy = 70, r = 38, full = lim * veh.ratio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(cx - 80, cy - 52, 160, 130);
    ctx.strokeStyle = '#d9dde4'; ctx.strokeRect(cx - 80, cy - 52, 160, 130);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.strokeStyle = Math.abs(q.d) >= lim - 1e-3 ? '#d97706' : '#1d2330'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, 0); ctx.lineTo(0, r);
    ctx.stroke();
    ctx.fillStyle = '#d92d20'; ctx.fillRect(-3, -r - 4, 6, 9);       // top mark of the wheel
    ctx.restore();
    // Bar: steering angle compared with the limit.
    const bx = cx - 52, bw = 104, by = cy + 52;
    ctx.fillStyle = '#e5e7eb'; ctx.fillRect(bx, by, bw, 6);
    ctx.fillStyle = Math.abs(q.d) >= lim - 1e-3 ? '#d97706' : '#1f6feb';
    const u = Math.max(-1, Math.min(1, q.d / lim)) * bw / 2;
    ctx.fillRect(bx + bw / 2 + Math.min(0, u), by, Math.abs(u), 6);
    ctx.fillStyle = '#1d2330'; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(f(deg(q.d), 1) + '° · Lenkrad ' + f(deg(ang), 0) + '°', cx, by + 20);
    ctx.fillText('Limit ±' + f(deg(lim), 1) + '° / ±' + f(deg(full), 0) + '°', cx, by + 33);
    ctx.textAlign = 'start';
  }

  /* ---------- tools and input ---------- */
  const HINTS = {
    pan: 'Verschieben: Ziehen mit der Maus. Mausrad zoomt. Mit Leertaste oder mittlerer Taste kann man in jedem Werkzeug verschieben.',
    scale: 'Maßstab: Klicke auf einen Linienzug mit bekannter Länge (z. B. Bemaßung oder Fahrbahnbreite). Doppelklick oder Enter beendet und fragt die Länge in m ab. Esc bricht ab.',
    drive: 'Fahren: 1. Klick = Startpunkt der Vorderachsmitte, 2. Klick = Fahrtrichtung. Danach zeigt die Vorschau live, wie das Fahrzeug mit begrenztem Lenkeinschlag zur Maus fährt. Klick = Ziel übernehmen (nur wenn erreichbar). Ziele ziehen = verschieben, Rechtsklick = löschen, Rückschritt = letztes Ziel zurück.',
    obst: 'Hindernis: Klicke die Ecken eines Polygons (Bordstein, Mast, Gebäude). Doppelklick oder Enter schließt es. Esc bricht ab.'
  };

  function setTool(t) {
    S.tool = t;
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    $('hint').textContent = HINTS[t];
    cv.style.cursor = t === 'pan' ? 'grab' : 'crosshair';
    updateInfo(); requestDraw();
  }

  /* Find the target under the mouse. Return -2 for the start and -1 for no hit. */
  function hitWp(sp) {
    for (let i = S.wps.length - 1; i >= 0; i--) {
      const q = p2s(S.wps[i]);
      if (Math.hypot(q.x - sp.x, q.y - sp.y) <= SNAP_PX) return i;
    }
    if (S.start) { const q = p2s(S.start.p); if (Math.hypot(q.x - sp.x, q.y - sp.y) <= SNAP_PX) return -2; }
    return -1;
  }

  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  cv.addEventListener('pointerdown', (e) => {
    const sp = evPos(e), p = s2p(sp.x, sp.y);
    cv.setPointerCapture(e.pointerId);
    if (e.button === 1 || S.tool === 'pan' || spaceDown) {
      drag = { type: 'pan', sx: sp.x, sy: sp.y, ox: S.ox, oy: S.oy };
      return;
    }
    if (e.button === 2) {
      if (S.tool === 'drive') { const i = hitWp(sp); if (i >= 0) { S.wps.splice(i, 1); recompute(); } }
      return;
    }
    if (e.button !== 0 || !S.hasPage) return;
    // Ignore the second click of a double click.
    const now = performance.now();
    const second = now - lastDown.t < 350 && Math.hypot(sp.x - lastDown.x, sp.y - lastDown.y) < 5;
    lastDown = { t: now, x: sp.x, y: sp.y };
    if (second) return;
    if (S.tool === 'scale') {
      if (S.scaleDone) { S.scalePts = []; S.scaleDone = false; S.mpp = null; recompute(); }
      S.scalePts.push(p);
    } else if (S.tool === 'drive') {
      if (!S.mpp) { $('hint').textContent = 'Zuerst den Maßstab setzen.'; return; }
      const i = hitWp(sp);
      if (S.start && i !== -1) drag = { type: i === -2 ? 'start' : 'wp', i: i };
      else if (!S.start) {
        if (!S.pend) S.pend = p;
        else if (Math.hypot(p.x - S.pend.x, p.y - S.pend.y) * S.zoom > 3) {
          S.start = { p: S.pend, ang: Math.atan2(p.y - S.pend.y, p.x - S.pend.x) };
          S.pend = null; S.pos = 1; $('pos').value = 1000; recompute();
        }
      } else if (S.prev && S.prev.reached) {
        S.wps.push(p); S.pos = 1; $('pos').value = 1000; recompute();
      } else {
        $('hint').textContent = 'Dieses Ziel ist mit dem begrenzten Lenkeinschlag nicht erreichbar. Wähle einen Punkt weiter vorn oder weiter seitlich.';
        $('hint').dataset.err = '1';
      }
    } else if (S.tool === 'obst') {
      S.cur.push(p);
    }
    requestDraw();
  });

  cv.addEventListener('pointermove', (e) => {
    const sp = evPos(e);
    S.mouse = s2p(sp.x, sp.y);
    if (drag && drag.type === 'pan') {
      S.ox = drag.ox + sp.x - drag.sx; S.oy = drag.oy + sp.y - drag.sy;
    } else if (drag && drag.type === 'wp') {
      S.wps[drag.i] = S.mouse; recompute();
    } else if (drag && drag.type === 'start') {
      S.start.p = S.mouse; recompute();
    } else if (S.tool === 'drive') {
      updatePreview();
    }
    requestDraw();
  });

  cv.addEventListener('pointerup', () => { drag = null; updatePreview(); });
  cv.addEventListener('pointerleave', () => { if (!drag) { S.mouse = null; updatePreview(); } });

  cv.addEventListener('dblclick', () => {
    if (S.tool === 'scale') finishScale();
    else if (S.tool === 'obst') finishObst();
  });

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const sp = evPos(e), p = s2p(sp.x, sp.y);
    S.zoom = Math.min(80, Math.max(0.02, S.zoom * Math.pow(1.0015, -e.deltaY)));
    S.ox = sp.x - p.x * S.zoom; S.oy = sp.y - p.y * S.zoom;     // keep the point under the cursor fixed
    requestDraw();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName) && e.key !== 'Enter') return;
    if (e.code === 'Space') { spaceDown = true; if (e.target === document.body) e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (S.tool === 'scale') finishScale(); else if (S.tool === 'obst') finishObst();
    } else if (e.key === 'Escape') {
      S.cur = []; S.pend = null; if (!S.scaleDone) S.scalePts = [];
      requestDraw();
    } else if (e.key === 'Backspace') {
      if (S.tool === 'obst') S.cur.pop();
      else if (S.tool === 'scale' && !S.scaleDone) S.scalePts.pop();
      else if (S.tool === 'drive') { if (S.pend) S.pend = null; else if (S.wps.length) S.wps.pop(); else S.start = null; recompute(); }
      requestDraw();
    }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

  /* ---------- controls ---------- */
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('file').addEventListener('change', (e) => { if (e.target.files[0]) loadPdf(e.target.files[0]); e.target.value = ''; });
  $('blank').addEventListener('click', loadBlank);
  $('pageNo').addEventListener('change', () => {
    const n = Math.min(pdfDoc.numPages, Math.max(1, parseInt($('pageNo').value, 10) || 1));
    $('pageNo').value = n; renderPage(n);
  });
  $('scaleReset').addEventListener('click', () => {
    S.mpp = null; S.scalePts = []; S.scaleDone = false; setTool('scale'); recompute();
  });
  $('driveReset').addEventListener('click', () => { S.start = null; S.pend = null; S.wps = []; recompute(); });
  $('driveUndo').addEventListener('click', () => { if (S.wps.length) S.wps.pop(); else S.start = null; recompute(); });
  $('obstUndo').addEventListener('click', () => { S.obst.pop(); recompute(); });
  $('fit').addEventListener('click', fitView);
  ['oSweep', 'oSil'].forEach((id) => $(id).addEventListener('change', requestDraw));
  $('silStep').addEventListener('change', recompute);

  const FIELDS = { v_wb: 'wb', v_front: 'front', v_rear: 'rear', v_width: 'width', v_rout: 'rOuter', v_track: 'track', v_rate: 'rateDeg', v_ratio: 'ratio' };
  Object.keys(FIELDS).forEach((id) => {
    $(id).value = veh[FIELDS[id]];
    $(id).addEventListener('input', () => {
      const v = parseFloat($(id).value);
      if (v > 0) { veh[FIELDS[id]] = v; recompute(); }
    });
  });

  $('pos').addEventListener('input', () => { S.pos = $('pos').value / 1000; updateInfo(); requestDraw(); });

  // Play: move the vehicle along the path at 3 m/s.
  let lastT = 0;
  function tick(t) {
    if (!S.playing) return;
    const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    if (S.res) {
      S.pos += 3 * dt / S.res.length;
      if (S.pos >= 1) { S.pos = 1; S.playing = false; $('play').textContent = '▶ Abspielen'; }
      $('pos').value = Math.round(S.pos * 1000);
      updateInfo(); requestDraw();
    }
    requestAnimationFrame(tick);
  }
  $('play').addEventListener('click', () => {
    S.playing = !S.playing;
    $('play').textContent = S.playing ? '❚❚ Pause' : '▶ Abspielen';
    if (S.playing) { if (S.pos >= 1) S.pos = 0; lastT = performance.now(); requestAnimationFrame(tick); }
  });

  $('png').addEventListener('click', () => {
    draw();
    cv.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = 'schleppkurve.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  });

  $('selftest').addEventListener('click', () => {
    $('tests').innerHTML = Sim.selfTest().map((r) =>
      '<div class="' + (r.ok ? 'good' : 'bad') + '">' + (r.ok ? '✔ ' : '✘ ') + r.name +
      (r.detail ? ' <span class="mute">(' + r.detail + ')</span>' : '') + '</div>').join('');
  });

  // Drag and drop of a PDF file.
  const drop = $('drop');
  window.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.display = 'flex'; });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.style.display = 'none'; });
  window.addEventListener('drop', (e) => {
    e.preventDefault(); drop.style.display = 'none';
    const file = e.dataTransfer.files[0];
    if (file) loadPdf(file);
  });

  window.addEventListener('resize', resize);
  window.Turn = { S: S, veh: veh, recompute: recompute, finishScale: finishScale, setTool: setTool, updatePreview: updatePreview };
  resize(); setTool('pan'); updateInfo();
})();
