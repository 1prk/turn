/* Vector export of a swept-path result: DXF (R12, ASCII) and SVG. This file does not use the DOM.
 * A model for the export has these values. All coordinates are in meters, the y axis points down (like the plan).
 *   lines  = [{ layer, pts: [{ x, y }], closed }]
 *   texts  = the text lines, as strings
 *   k      = output units per meter (1 = meters, 1 / mpp = plan units in pt)
 *   pageH  = height of the plan in meters. DXF has the y axis up, so the export mirrors y at the top of the plan.
 *            The origin of a DXF is then the lower left corner of the page.
 *   textH  = height of the text in meters (optional: 1/80 of the size of the drawing). */
(function (root) {
  'use strict';
  const Export = {};
  const hyp = Math.hypot;

  /* The layers: DXF color index (ACI), SVG stroke color, SVG line width (relative), SVG dashes (relative). */
  Export.LAYERS = {
    LEITLINIE: { aci: 5, stroke: '#111111', w: 1.6 },
    HINTERACHSE: { aci: 8, stroke: '#6b7280', w: 1, dash: [4, 3] },
    HUELLKURVE: { aci: 1, stroke: '#1446aa', w: 1 },
    FAHRZEUG: { aci: 7, stroke: '#0b3d91', w: 1 },
    SPIELRAUM: { aci: 3, stroke: '#16a34a', w: 1, dash: [6, 3] },
    TEXT: { aci: 7, stroke: '#111111', w: 1 }
  };

  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    return hyp(p.x - a.x - u * dx, p.y - a.y - u * dy);
  }

  /* Remove points of a polyline (Douglas-Peucker). The new line is nearer than tol to all old points. */
  Export.simplify = function (pts, tol) {
    const n = pts.length;
    if (n < 3) return pts.slice();
    const keep = new Uint8Array(n), stack = [[0, n - 1]];
    keep[0] = 1; keep[n - 1] = 1;
    while (stack.length) {
      const ab = stack.pop();
      let dmax = 0, im = -1;
      for (let i = ab[0] + 1; i < ab[1]; i++) {
        const d = segDist(pts[i], pts[ab[0]], pts[ab[1]]);
        if (d > dmax) { dmax = d; im = i; }
      }
      if (dmax > tol) { keep[im] = 1; stack.push([ab[0], im], [im, ab[1]]); }
    }
    return pts.filter((q, i) => keep[i]);
  };

  /* The outline of the clearance band: an approximation of the outline of the swept area, widened by c.
   * polys = the body polygons of the samples (the swept area is their union), lines = the envelope lines,
   * caps = the polygons of the first and the last position (they close the ends). All values are in meters.
   * The lines and the caps contain the outline of the swept area. So the outline of the band is a part of their offset curves:
   * the points at the distance c on both sides of a line, and the arcs of the radius c around the corners of the caps.
   * A point is on the outline of the band when it is not inside a polygon and not nearer than c to any line.
   * This is exact for the lines. The corners of the band at the end of a line are not rounded: small gaps are possible.
   * Return an array of polylines. */
  Export.bandLines = function (polys, lines, caps, c) {
    if (!polys.length || !(c > 0)) return [];
    const tol = Math.max(0.005, c * 0.02);
    // The polygons in a grid by their centers. A polygon can only contain a point if its center is in the 3 x 3 cells around it.
    const info = polys.map((P) => {
      let cx = 0, cy = 0, r = 0;
      P.forEach((q) => { cx += q.x; cy += q.y; });
      cx /= P.length; cy /= P.length;
      P.forEach((q) => { r = Math.max(r, hyp(q.x - cx, q.y - cy)); });
      return { P: P, cx: cx, cy: cy, r: r };
    });
    const cellP = Math.max(1, ...info.map((o) => o.r));
    const pGrid = new Map();
    info.forEach((o) => {
      const key = Math.floor(o.cx / cellP) + ',' + Math.floor(o.cy / cellP);
      if (!pGrid.has(key)) pGrid.set(key, []);
      pGrid.get(key).push(o);
    });
    const inside = (q) => {
      const ix = Math.floor(q.x / cellP), iy = Math.floor(q.y / cellP);
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const list = pGrid.get((ix + a) + ',' + (iy + b));
          if (!list) continue;
          for (const o of list) {
            let odd = false;
            for (let i = 0, j = o.P.length - 1; i < o.P.length; j = i++) {
              const u = o.P[i], w = o.P[j];
              if ((u.y > q.y) !== (w.y > q.y) && q.x < (w.x - u.x) * (q.y - u.y) / (w.y - u.y) + u.x) odd = !odd;
            }
            if (odd) return true;
          }
        }
      }
      return false;
    };
    // The segments of all lines in a grid with the cell size c. A point is too near if a segment in the 3 x 3 cells is nearer than c - tol.
    const sGrid = new Map();
    const addSeg = (a, b) => {
      const x0 = Math.floor(Math.min(a.x, b.x) / c), x1 = Math.floor(Math.max(a.x, b.x) / c);
      const y0 = Math.floor(Math.min(a.y, b.y) / c), y1 = Math.floor(Math.max(a.y, b.y) / c);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iy = y0; iy <= y1; iy++) {
          const key = ix + ',' + iy;
          if (!sGrid.has(key)) sGrid.set(key, []);
          sGrid.get(key).push([a, b]);
        }
      }
    };
    lines.forEach((L) => { for (let i = 1; i < L.length; i++) addSeg(L[i - 1], L[i]); });
    caps.forEach((P) => { for (let i = 0; i < P.length; i++) addSeg(P[i], P[(i + 1) % P.length]); });
    const near = (q) => {
      const ix = Math.floor(q.x / c), iy = Math.floor(q.y / c);
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const list = sGrid.get((ix + a) + ',' + (iy + b));
          if (list) for (const s of list) if (segDist(q, s[0], s[1]) < c - tol) return true;
        }
      }
      return false;
    };
    const ok = (q) => !near(q) && !inside(q);

    const out = [], step = 0.08;
    const walk = (pts, offsets) => {          // offsets = function (point index) -> [{ x, y }, ...] candidates, one run per list entry
      const runs = [];
      pts.forEach((p, i) => offsets(p, i).forEach((q, side) => {
        if (!runs[side]) runs[side] = { run: [] };
        if (ok(q)) runs[side].run.push(q);
        else { if (runs[side].run.length > 1) out.push(runs[side].run); runs[side].run = []; }
      }));
      runs.forEach((r) => { if (r.run.length > 1) out.push(r.run); });
    };
    // The envelope lines: the points at the distance c on both sides.
    lines.forEach((L) => {
      const pts = [];
      L.forEach((q, i) => {
        const last = pts[pts.length - 1];
        if (!last || i === L.length - 1 || hyp(q.x - last.p.x, q.y - last.p.y) >= step) pts.push({ p: q, i: i });
      });
      walk(pts, (e) => {
        const a = L[Math.max(0, e.i - 1)], b = L[Math.min(L.length - 1, e.i + 1)], l = hyp(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
        return [{ x: e.p.x + c * nx, y: e.p.y + c * ny }, { x: e.p.x - c * nx, y: e.p.y - c * ny }];
      });
    });
    // The caps: the offset of each edge on both sides and an arc around each corner.
    caps.forEach((P) => {
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length], l = hyp(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
        const m = Math.max(1, Math.ceil(l / step)), pts = [];
        for (let k = 0; k <= m; k++) pts.push({ x: a.x + (b.x - a.x) * k / m, y: a.y + (b.y - a.y) * k / m });
        walk(pts, (p) => [{ x: p.x + c * nx, y: p.y + c * ny }, { x: p.x - c * nx, y: p.y - c * ny }]);
        const arc = [];
        for (let k = 0; k < 48; k++) arc.push(k);
        walk(arc, (k) => [{ x: a.x + c * Math.cos(k * Math.PI / 24), y: a.y + c * Math.sin(k * Math.PI / 24) }]);
      }
    });
    return out;
  };

  /* ---------- helpers for the files ---------- */
  const num = (n, d) => String(Math.round(n * d) / d).replace(/^-0$/, '0');

  // R12 has no UTF-8. A character that is not ASCII is written as \U+XXXX.
  const dxfText = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, (ch) => '\\U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
  const xmlText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function bounds(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    return pts.length ? { x0: x0, y0: y0, x1: x1, y1: y1 } : { x0: 0, y0: 0, x1: 1, y1: 1 };
  }

  /* DXF release 12, ASCII. Lines are POLYLINE entities, texts are TEXT entities. Return the file as a string. */
  Export.dxf = function (m) {
    const k = m.k, out = [];
    const g = (code, val) => { out.push(String(code).padStart(3, ' '), String(val)); };
    const P = (p) => [p.x * k, (m.pageH - p.y) * k];
    const all = [];
    m.lines.forEach((L) => L.pts.forEach((p) => all.push(P(p))));
    const b = bounds(all), th = m.textH ? m.textH * k : Math.max(b.x1 - b.x0, b.y1 - b.y0, 1e-6) / 80, lh = th * 1.6;
    const textPts = m.texts.map((t, i) => [b.x0, b.y0 - 2 * th - i * lh]);        // The text is below the drawing.
    const e = bounds(all.concat(textPts));
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$EXTMIN'); g(10, num(e.x0, 1e4)); g(20, num(e.y0, 1e4)); g(30, 0);
    g(9, '$EXTMAX'); g(10, num(e.x1, 1e4)); g(20, num(e.y1, 1e4)); g(30, 0);
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, '0.0');
    g(0, 'ENDTAB');
    const names = Object.keys(Export.LAYERS);
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, names.length);
    names.forEach((n) => { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, Export.LAYERS[n].aci); g(6, 'CONTINUOUS'); });
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
    g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, '0.0'); g(41, '1.0'); g(50, '0.0'); g(71, 0); g(42, '0.2'); g(3, 'txt'); g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    m.lines.forEach((L) => {
      g(0, 'POLYLINE'); g(8, L.layer); g(66, 1); g(10, '0.0'); g(20, '0.0'); g(30, '0.0'); g(70, L.closed ? 1 : 0);
      L.pts.forEach((p) => { const q = P(p); g(0, 'VERTEX'); g(8, L.layer); g(10, num(q[0], 1e4)); g(20, num(q[1], 1e4)); g(30, '0.0'); });
      g(0, 'SEQEND'); g(8, L.layer);
    });
    m.texts.forEach((t, i) => {
      g(0, 'TEXT'); g(8, 'TEXT'); g(10, num(textPts[i][0], 1e4)); g(20, num(textPts[i][1], 1e4)); g(30, '0.0'); g(40, num(th, 1e4)); g(1, dxfText(t));
    });
    g(0, 'ENDSEC');
    g(0, 'EOF');
    return out.join('\n') + '\n';
  };

  /* SVG. The coordinates are the plan coordinates (the y axis points down). The view box shows the result and the text below it.
   * Return the file as a string. */
  Export.svg = function (m) {
    const k = m.k, P = (p) => [p.x * k, p.y * k];
    const all = [];
    m.lines.forEach((L) => L.pts.forEach((p) => all.push(P(p))));
    const b = bounds(all), size = Math.max(b.x1 - b.x0, b.y1 - b.y0, 1e-6);
    const th = m.textH ? m.textH * k : size / 80, lh = th * 1.6, sw = size / 900, pad = size * 0.03;
    const textW = Math.max(0, ...m.texts.map((t) => t.length)) * th * 0.55;
    const x0 = b.x0 - pad, y0 = b.y0 - pad;
    const w = Math.max(b.x1 - b.x0, textW) + 2 * pad;
    const h = (b.y1 - b.y0) + 2 * pad + (m.texts.length ? 2 * th + m.texts.length * lh : 0);
    const out = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [x0, y0, w, h].map((n) => num(n, 1e3)).join(' ') + '" width="1000" height="' + num(1000 * h / w, 10) + '">'];
    out.push('<title>' + xmlText(m.title || 'Schleppkurve') + '</title>');
    out.push('<desc>' + xmlText(m.texts.join(' | ')) + '</desc>');
    Object.keys(Export.LAYERS).forEach((name) => {
      const L = Export.LAYERS[name], mine = m.lines.filter((l) => l.layer === name);
      if (!mine.length) return;
      const dash = L.dash ? ' stroke-dasharray="' + L.dash.map((d) => num(d * sw, 1e4)).join(' ') + '"' : '';
      out.push('<g id="' + name + '" fill="none" stroke="' + L.stroke + '" stroke-width="' + num(L.w * sw, 1e4) + '" stroke-linejoin="round"' + dash + '>');
      mine.forEach((l) => {
        const pts = l.pts.map((p) => P(p).map((n) => num(n, 1e3)).join(',')).join(' ');
        out.push('<' + (l.closed ? 'polygon' : 'polyline') + ' points="' + pts + '"/>');
      });
      out.push('</g>');
    });
    out.push('<g id="TEXT" font-family="sans-serif" font-size="' + num(th, 1e4) + '" fill="#111111">');
    m.texts.forEach((t, i) => out.push('<text x="' + num(b.x0, 1e3) + '" y="' + num(b.y1 + 2 * th + i * lh, 1e3) + '">' + xmlText(t) + '</text>'));
    out.push('</g>', '</svg>');
    return out.join('\n') + '\n';
  };

  /* Tests. Sim is the module of the kinematics. Return a list of { name, ok, detail } like Sim.selfTest. */
  Export.selfTest = function (Sim) {
    const res = [], add = (name, ok, detail) => res.push({ name: name, ok: !!ok, detail: detail });
    const pt = (x, y) => ({ x: x, y: y });

    // Simplify: a circle of 5 m with a step of 5 cm.
    const circle = [];
    for (let i = 0; i <= 600; i++) circle.push(pt(5 * Math.cos(i * 0.01), 5 * Math.sin(i * 0.01)));
    const simp = Export.simplify(circle, 0.002);
    let dev = 0;
    circle.forEach((q) => { let d = Infinity; for (let i = 1; i < simp.length; i++) d = Math.min(d, segDist(q, simp[i - 1], simp[i])); dev = Math.max(dev, d); });
    add('Export: Vereinfachen hält die Toleranz ein und spart Punkte', dev <= 0.002 + 1e-9 && simp.length < circle.length / 3 && simp[0] === circle[0] && simp[simp.length - 1] === circle[600],
      circle.length + ' → ' + simp.length + ' Punkte, Abweichung ' + (dev * 1000).toFixed(2) + ' mm');

    // DXF: read the file back as pairs of group code and value.
    const model = { title: 'Test', k: 2, pageH: 10, textH: 0.3, texts: ['Müllfahrzeug · 100,0 gon'],
      lines: [{ layer: 'LEITLINIE', pts: [pt(1, 2), pt(3, 4), pt(5, 4)], closed: false }, { layer: 'FAHRZEUG', pts: [pt(0, 0), pt(1, 0), pt(1, 1)], closed: true }] };
    const dxf = Export.dxf(model), rows = dxf.split('\n');
    const pairs = [];
    for (let i = 0; i + 1 < rows.length; i += 2) pairs.push([parseInt(rows[i], 10), rows[i + 1]]);
    const count = (code, val) => pairs.filter((p) => p[0] === code && p[1] === val).length;
    const verts = pairs.map((p, i) => (p[0] === 0 && p[1] === 'VERTEX' ? [parseFloat(pairs[i + 2][1]), parseFloat(pairs[i + 3][1])] : null)).filter(Boolean);
    add('Export: DXF R12 hat Abschnitte, Layer, Polylinien, Texte und Ende', pairs[0][1] === 'SECTION' && pairs[pairs.length - 1][1] === 'EOF' && count(2, 'ENTITIES') === 1 &&
      count(0, 'POLYLINE') === 2 && count(0, 'SEQEND') === 2 && count(0, 'VERTEX') === 6 && count(0, 'TEXT') === 1 && count(2, 'HUELLKURVE') === 1 && count(1, 'AC1009') === 1,
      pairs.length + ' Zeilenpaare');
    add('Export: DXF Koordinaten in Einheiten, y gespiegelt (Ursprung unten links), Umlaute als \\U+', verts[0][0] === 2 && verts[0][1] === (10 - 2) * 2 && verts[1][0] === 6 && verts[1][1] === 12 &&
      count(1, 'M\\U+00FCllfahrzeug \\U+00B7 100,0 gon') === 1 && count(70, '1') >= 1 && !/[^\x00-\x7f]/.test(dxf), 'erster Punkt (' + verts[0].join('; ') + ')');

    // SVG
    const svg = Export.svg(model);
    add('Export: SVG hat viewBox, Gruppen, Linien, Polygone, maskierten Text', /<svg [^>]*viewBox="[-\d. ]+"/.test(svg) && (svg.match(/<polyline /g) || []).length === 1 && (svg.match(/<polygon /g) || []).length === 1 &&
      /<g id="LEITLINIE"/.test(svg) && /M.llfahrzeug/.test(svg) && svg.trim().endsWith('</svg>') && /<text /.test(svg),
      svg.length + ' Zeichen');
    add('Export: SVG maskiert Sonderzeichen im Text', /&amp;&lt;&gt;/.test(Export.svg({ k: 1, pageH: 1, textH: 0.3, lines: [], texts: ['&<>'] })), '');

    // The clearance band on a straight route: the lines are at the distance hw + c, the ends are round.
    const pkw = Sim.PRESETS[0], o = Sim.driveOpts(pkw), c = 0.5, hw = pkw.width / 2;
    const bandOf = (smp, v) => {
      const polys = [].concat(...smp.filter((q, i) => i % 2 === 0 || i === smp.length - 1).map((q) => Sim.bodyPolys(q, v)));
      const caps = Sim.bodyPolys(smp[0], v).concat(Sim.bodyPolys(smp[smp.length - 1], v));
      return { polys: polys, lines: Sim.envelopeLines(smp, v), caps: caps, band: null };
    };
    const st = Sim.buildRoute([pt(0, 0), pt(20, 0)], pkw, o), S1 = bandOf(st.smp, pkw);
    S1.band = Export.bandLines(S1.polys, S1.lines, S1.caps, c);
    const bb = bounds([].concat(...S1.band).map((q) => [q.x, q.y]));
    add('Export: Bewegungsspielraum einer Geraden: Ausdehnung = Fahrzeug + 0,50 m auf 1 cm genau',
      Math.abs(bb.y0 + hw + c) < 0.01 && Math.abs(bb.y1 - hw - c) < 0.01 && Math.abs(bb.x0 + pkw.wb + pkw.rear + c) < 0.01 && Math.abs(bb.x1 - 20 - pkw.front - c) < 0.01,
      'x ' + bb.x0.toFixed(2) + ' bis ' + bb.x1.toFixed(2) + ' m, y ' + bb.y0.toFixed(2) + ' bis ' + bb.y1.toFixed(2) + ' m');

    // Every point of the band is at the distance c from the swept area. The test uses all samples and the edges of all polygons.
    const dist = (q, polys) => {
      let d = Infinity;
      for (const P of polys) {
        let odd = false;
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
          if ((P[i].y > q.y) !== (P[j].y > q.y) && q.x < (P[j].x - P[i].x) * (q.y - P[i].y) / (P[j].y - P[i].y) + P[i].x) odd = !odd;
          d = Math.min(d, segDist(q, P[j], P[i]));
        }
        if (odd) return 0;
      }
      return d;
    };
    const allPolys = [].concat(...st.smp.map((q) => Sim.bodyPolys(q, pkw)));
    const dists = [].concat(...S1.band).map((q) => dist(q, allPolys));
    add('Export: alle Punkte des Bewegungsspielraums (Gerade) liegen 0,50 m von der überstrichenen Fläche entfernt', Math.min(...dists) > c - 0.01 && Math.max(...dists) < c + 0.01,
      S1.band.length + ' Linien, Abstände ' + Math.min(...dists).toFixed(3) + ' bis ' + Math.max(...dists).toFixed(3) + ' m');

    // A turn at full lock for 2 revolutions: the outline of the band is two circles around the center of rotation.
    const lim = Sim.steerLimit(pkw), nC = Math.round(2 * 2 * Math.PI * lim.rFront / 0.05), circ = [];
    for (let i = 0; i <= nC; i++) { const a = i * 0.05 / lim.rFront; circ.push(pt(lim.rFront * Math.cos(a), lim.rFront * Math.sin(a))); }
    const run = Sim.run(circ, pkw).slice(Math.floor(nC * 0.4)), S2 = bandOf(run, pkw);
    const rOut = pkw.rOuter + c, rIn = lim.rRear - hw - c;
    // The part of the run is a part of the circle, so the ends are not inside the area. Only the points far from the ends are tested.
    const pts2 = [].concat(...Export.bandLines(S2.polys, S2.lines, S2.caps, c)).filter((q) => Math.abs(Math.atan2(q.y, q.x) - Math.atan2(run[0].Fy, run[0].Fx)) > 0.2 &&
      Math.abs(Math.atan2(q.y, q.x) - Math.atan2(run[run.length - 1].Fy, run[run.length - 1].Fx)) > 0.2);
    const off = pts2.map((q) => Math.min(Math.abs(hyp(q.x, q.y) - rOut), Math.abs(hyp(q.x, q.y) - rIn)));
    const nOut = pts2.filter((q) => Math.abs(hyp(q.x, q.y) - rOut) < 0.03).length, nIn = pts2.filter((q) => Math.abs(hyp(q.x, q.y) - rIn) < 0.03).length;
    add('Export: Bewegungsspielraum in der Kurve liegt auf dem Kreis außen (R ' + rOut.toFixed(2) + ' m) und innen (R ' + rIn.toFixed(2) + ' m)',
      pts2.length > 200 && Math.max(...off) < 0.03 && nOut > 50 && nIn > 50, pts2.length + ' Punkte, größte Abweichung ' + (Math.max(...off) * 1000).toFixed(1) + ' mm, außen ' + nOut + ', innen ' + nIn);
    return res;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Export;
  else root.Export = Export;
})(typeof window !== 'undefined' ? window : globalThis);
