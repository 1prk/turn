/* User interface. Plan coordinates are in PDF points (pt), y points down.
 * The scale (mpp = meters per pt) converts plan coordinates to meters.
 * The user draws in plan coordinates. All calculations use meters. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const STEP = 0.05;            // distance between path samples [m]
  const SNAP_PX = 9;            // pick radius for path points [px]

  const S = {
    pageImg: null, pw: 1200, ph: 850,   // page image and page size [pt]
    hasPage: false,
    mpp: null,                          // meters per pt
    scalePts: [], scaleDone: false,
    path: [],                           // control points of the front axle path
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
    S.path = []; S.obst = []; S.cur = []; S.pos = 0; S.playing = false;
    $('pos').value = 0;
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
    fitView(); recompute(); setTool('path');
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
    S.res = null;
    const lim = Sim.steerLimit(veh);
    if (S.mpp && S.path.length >= 2 && lim) {
      const m = S.mpp;
      const dense = Sim.smooth(S.path.map((p) => ({ x: p.x * m, y: p.y * m })), STEP);
      const smp = Sim.run(dense, veh);
      const obs = S.obst.map((poly) => {
        const pts = poly.map((p) => ({ x: p.x * m, y: p.y * m }));
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        return { pts: pts, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      });
      const R = { smp: smp, lim: lim, sweep: new Path2D(), hit: new Path2D(), viol: new Path2D(),
                  front: new Path2D(), rear: new Path2D(), trails: new Path2D(), sil: new Path2D(),
                  maxD: 0, violLen: 0, firstHit: null, length: smp[smp.length - 1].s };
      const trail = [[], [], [], []];
      const silStep = Math.max(0.5, parseFloat($('silStep').value) || 2);
      let nextSil = 0;
      smp.forEach((p, i) => {
        const poly = Sim.bodyPoly(p, veh);
        poly.forEach((c, k) => trail[k].push(c));
        if (i % 2 === 0 || i === smp.length - 1) addPoly(R.sweep, poly);
        if (p.s >= nextSil) { addPoly(R.sil, poly); nextSil += silStep; }
        const over = Math.abs(p.d) > lim.delta + 1e-4;
        R.maxD = Math.max(R.maxD, Math.abs(p.d));
        if (over) {
          R.violLen += i > 0 ? p.s - smp[i - 1].s : 0;
          R.viol.moveTo(p.Fx, p.Fy); R.viol.lineTo(p.Fx + 1e-4, p.Fy);
        }
        // Test the body against each obstacle. Test the bounding box first.
        const xs = poly.map((c) => c.x), ys = poly.map((c) => c.y);
        const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
        for (const o of obs) {
          if (bx1 < o.x0 || bx0 > o.x1 || by1 < o.y0 || by0 > o.y1) continue;
          if (Sim.polysIntersect(poly, o.pts)) {
            addPoly(R.hit, poly);
            if (R.firstHit == null) R.firstHit = p.s;
            break;
          }
        }
      });
      trail.forEach((t) => polyline(R.trails, t));
      polyline(R.front, smp.map((p) => ({ x: p.Fx, y: p.Fy })));
      polyline(R.rear, smp.map((p) => ({ x: p.Rx, y: p.Ry })));
      // Build the red parts of the front path from the samples above the limit.
      R.violSeg = new Path2D();
      for (let i = 1; i < smp.length; i++) {
        if (Math.abs(smp[i].d) > lim.delta + 1e-4) { R.violSeg.moveTo(smp[i - 1].Fx, smp[i - 1].Fy); R.violSeg.lineTo(smp[i].Fx, smp[i].Fy); }
      }
      S.res = R;
    }
    updateInfo();
    requestDraw();
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
    const R = S.res, rows = [];
    if (!S.mpp) rows.push(['Status', '<span class="warn">Maßstab fehlt</span>']);
    else if (!R) rows.push(['Status', '<span class="mute">Fahrweg mit ≥ 2 Punkten zeichnen</span>']);
    else {
      rows.push(['Weglänge', f(R.length, 1) + ' m']);
      rows.push(['Max. Lenkwinkel erforderlich', f(deg(R.maxD), 1) + '° von ' + f(deg(R.lim.delta), 1) + '°']);
      rows.push(['Lenkung', R.violLen > 0.01 || R.maxD > R.lim.delta + 1e-4
        ? '<span class="bad">überschritten (' + f(R.violLen, 1) + ' m)</span>' : '<span class="good">ok</span>']);
      rows.push(['Hindernisse', S.obst.length === 0 ? '<span class="mute">keine</span>'
        : R.firstHit == null ? '<span class="good">keine Kollision</span>'
        : '<span class="bad">Kollision ab ' + f(R.firstHit, 1) + ' m</span>']);
      const i = sampleIndex();
      rows.push(['Position ' + f(R.smp[i].s, 1) + ' m', 'Lenkwinkel ' + f(deg(R.smp[i].d), 1) + '°']);
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
    drawPathPoints(px);
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
    const R = S.res;
    if (!R) return;
    const k = 1 / S.mpp, um = px * S.mpp;        // meters -> pt, and one pixel in meters
    ctx.save();
    ctx.scale(k, k);
    if ($('oSweep').checked) { ctx.fillStyle = 'rgba(40,110,220,.22)'; ctx.fill(R.sweep); }
    if (S.obst.length) { ctx.fillStyle = 'rgba(230,30,30,.40)'; ctx.fill(R.hit); }
    ctx.lineWidth = um; ctx.strokeStyle = 'rgba(20,70,170,.9)'; ctx.stroke(R.trails);
    if ($('oSil').checked) { ctx.strokeStyle = 'rgba(30,40,60,.55)'; ctx.stroke(R.sil); }
    ctx.strokeStyle = '#6b7280'; ctx.setLineDash([4 * um, 3 * um]); ctx.stroke(R.rear);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5 * um; ctx.setLineDash([]); ctx.stroke(R.front);
    ctx.strokeStyle = '#e11d1d'; ctx.lineWidth = 4 * um; ctx.stroke(R.violSeg);
    drawVehicle(R.smp[sampleIndex()], um);
    ctx.restore();
  }

  function drawVehicle(p, um) {
    const L = veh.front + veh.wb + veh.rear, hw = veh.width / 2, wl = 0.65, ww = 0.22;
    ctx.save();
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

  function drawPathPoints(px) {
    S.path.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 5 * px, 0, 7);
      ctx.fillStyle = i === 0 ? '#16a34a' : i === S.path.length - 1 ? '#d97706' : '#fff';
      ctx.fill(); ctx.lineWidth = 1.5 * px; ctx.strokeStyle = '#111'; ctx.stroke();
    });
    if (S.tool === 'path' && S.path.length === 0 && S.mpp) {
      ctx.fillStyle = '#111'; ctx.font = 13 * px + 'px system-ui,sans-serif';
      ctx.fillText('Startpunkt der Vorderachsmitte anklicken', 20 * px, 30 * px);
    }
  }

  /* ---------- tools and input ---------- */
  const HINTS = {
    pan: 'Verschieben: Ziehen mit der Maus. Mausrad zoomt. Mit Leertaste oder mittlerer Taste kann man in jedem Werkzeug verschieben.',
    scale: 'Maßstab: Klicke auf einen Linienzug mit bekannter Länge (z. B. Bemaßung oder Fahrbahnbreite). Doppelklick oder Enter beendet und fragt die Länge in m ab. Esc bricht ab.',
    path: 'Fahrweg: Klicke die Bahn der Vorderachsmitte als Punkte. Punkte ziehen = verschieben, Rechtsklick = Punkt löschen, Rückschritt = letzten Punkt löschen.',
    obst: 'Hindernis: Klicke die Ecken eines Polygons (Bordstein, Mast, Gebäude). Doppelklick oder Enter schließt es. Esc bricht ab.'
  };

  function setTool(t) {
    S.tool = t;
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    $('hint').textContent = HINTS[t];
    cv.style.cursor = t === 'pan' ? 'grab' : 'crosshair';
    updateInfo(); requestDraw();
  }

  function hitPath(sp) {
    for (let i = S.path.length - 1; i >= 0; i--) {
      const q = p2s(S.path[i]);
      if (Math.hypot(q.x - sp.x, q.y - sp.y) <= SNAP_PX) return i;
    }
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
      if (S.tool === 'path') { const i = hitPath(sp); if (i >= 0) { S.path.splice(i, 1); recompute(); } }
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
    } else if (S.tool === 'path') {
      const i = hitPath(sp);
      if (i >= 0) drag = { type: 'pt', i: i };
      else { S.path.push(p); recompute(); }
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
    } else if (drag && drag.type === 'pt') {
      S.path[drag.i] = S.mouse; recompute();
    }
    requestDraw();
  });

  cv.addEventListener('pointerup', () => { drag = null; });

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
      S.cur = []; if (!S.scaleDone) S.scalePts = [];
      requestDraw();
    } else if (e.key === 'Backspace') {
      if (S.tool === 'obst') S.cur.pop();
      else if (S.tool === 'scale' && !S.scaleDone) S.scalePts.pop();
      else if (S.tool === 'path') { S.path.pop(); recompute(); }
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
  $('pathClear').addEventListener('click', () => { S.path = []; recompute(); });
  $('pathReverse').addEventListener('click', () => { S.path.reverse(); recompute(); });
  $('obstUndo').addEventListener('click', () => { S.obst.pop(); recompute(); });
  $('fit').addEventListener('click', fitView);
  ['oSweep', 'oSil'].forEach((id) => $(id).addEventListener('change', requestDraw));
  $('silStep').addEventListener('change', recompute);

  const FIELDS = { v_wb: 'wb', v_front: 'front', v_rear: 'rear', v_width: 'width', v_rout: 'rOuter', v_track: 'track' };
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
  window.Turn = { S: S, veh: veh, recompute: recompute, finishScale: finishScale, setTool: setTool };
  resize(); setTool('pan'); updateInfo();
})();
