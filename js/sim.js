/* Swept-path kinematics. This file does not use the DOM.
 * Lengths are in meters. Angles are in radians.
 * Vehicle axes: the origin is the center of the rear axle,
 * x points forward, y points to the side. */
(function (root) {
  'use strict';
  const Sim = {};
  const hyp = Math.hypot;

  Sim.DEFAULT_VEHICLE = {
    name: 'PKW',
    wb: 2.86,      // wheelbase
    front: 0.92,   // front overhang
    rear: 1.10,    // rear overhang
    width: 1.89,   // width without mirrors
    rOuter: 5.85,  // outer turning radius: outermost body corner at full lock
    track: 1.60,   // track width: used only to draw the wheels
    rateDeg: 20,   // maximum change of the steering angle per meter of travel [deg/m]
    ratio: 13      // steering ratio: steering wheel angle divided by road wheel angle
  };

  /* Find the maximum steering angle from the turning circle.
   * At full lock, the outer front corner is on the circle of radius rOuter.
   * The circle center is on the line of the rear axle. */
  Sim.steerLimit = function (v) {
    const reach = v.wb + v.front;
    const d = v.rOuter * v.rOuter - reach * reach;
    if (d <= 0) return null;
    const rRear = Math.sqrt(d) - v.width / 2;
    if (rRear <= 0) return null;
    return { delta: Math.atan(v.wb / rRear), rRear: rRear, rFront: hyp(rRear, v.wb) };
  };

  function mix(a, b, ta, tb, t) {
    const u = (tb - t) / (tb - ta), w = (t - ta) / (tb - ta);
    return { x: a.x * u + b.x * w, y: a.y * u + b.y * w };
  }

  // Centripetal Catmull-Rom spline (Barry-Goldman). u is between 0 and 1, from p1 to p2.
  function cr(p0, p1, p2, p3, u) {
    const t0 = 0;
    const t1 = t0 + Math.sqrt(hyp(p1.x - p0.x, p1.y - p0.y));
    const t2 = t1 + Math.sqrt(hyp(p2.x - p1.x, p2.y - p1.y));
    const t3 = t2 + Math.sqrt(hyp(p3.x - p2.x, p3.y - p2.y));
    const t = t1 + (t2 - t1) * u;
    const A1 = mix(p0, p1, t0, t1, t), A2 = mix(p1, p2, t1, t2, t), A3 = mix(p2, p3, t2, t3, t);
    const B1 = mix(A1, A2, t0, t2, t), B2 = mix(A2, A3, t1, t3, t);
    return mix(B1, B2, t1, t2, t);
  }

  Sim.resample = function (pts, step) {
    if (pts.length < 2) return pts.slice();
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hyp(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = cum[cum.length - 1];
    const out = [];
    let j = 1;
    for (let s = 0; s < total; s += step) {
      while (j < pts.length - 1 && cum[j] < s) j++;
      const seg = cum[j] - cum[j - 1];
      const u = seg > 0 ? (s - cum[j - 1]) / seg : 0;
      out.push({ x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * u, y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * u });
    }
    out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    return out;
  };

  /* Change the control points to a smooth curve. The points on the curve are step apart. */
  Sim.smooth = function (ctrl, step) {
    const pts = [];
    for (const p of ctrl) {
      const l = pts[pts.length - 1];
      if (!l || hyp(p.x - l.x, p.y - l.y) > 1e-6) pts.push({ x: p.x, y: p.y });
    }
    if (pts.length < 2) return pts;
    const n = pts.length;
    const ext = [{ x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y }].concat(pts,
      [{ x: 2 * pts[n - 1].x - pts[n - 2].x, y: 2 * pts[n - 1].y - pts[n - 2].y }]);
    const dense = [pts[0]];
    for (let i = 1; i < ext.length - 2; i++) {
      const len = hyp(ext[i + 1].x - ext[i].x, ext[i + 1].y - ext[i].y);
      const m = Math.max(4, Math.ceil(len / (step * 0.5)));
      for (let k = 1; k <= m; k++) dense.push(cr(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / m));
    }
    return Sim.resample(dense, step);
  };

  function normAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  /* The center of the front axle follows the path.
   * The rear axle follows because of the rigid wheelbase.
   * Each result has: s (distance along the path), F (front axle), R (rear axle),
   * th (vehicle angle), d (steering angle = path tangent minus vehicle angle). */
  Sim.run = function (path, v) {
    const n = path.length;
    if (n < 2) return null;
    const tan = [];
    for (let i = 0; i < n; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      tan.push(Math.atan2(b.y - a.y, b.x - a.x));
    }
    const out = [];
    let Rx, Ry, th, s = 0;
    for (let i = 0; i < n; i++) {
      const F = path[i];
      if (i === 0) {
        th = tan[0];
      } else {
        s += hyp(F.x - path[i - 1].x, F.y - path[i - 1].y);
        // The rear axle moves along the mean vehicle angle (second order). The distance |F - R| stays equal to the wheelbase.
        const wx = F.x - Rx, wy = F.y - Ry, th0 = th;
        let thN = Math.atan2(wy, wx), nx = Rx, ny = Ry;
        for (let it = 0; it < 3; it++) {
          const am = th0 + normAngle(thN - th0) / 2, ux = Math.cos(am), uy = Math.sin(am);
          const wu = wx * ux + wy * uy, disc = wu * wu - (wx * wx + wy * wy) + v.wb * v.wb;
          const t = wu - Math.sqrt(Math.max(0, disc));
          nx = Rx + t * ux; ny = Ry + t * uy;
          thN = Math.atan2(F.y - ny, F.x - nx);
        }
        th = thN; Rx = nx; Ry = ny;
        out.push({ s: s, Fx: F.x, Fy: F.y, Rx: Rx, Ry: Ry, th: th, d: normAngle(tan[i] - th) });
        continue;
      }
      Rx = F.x - v.wb * Math.cos(th);
      Ry = F.y - v.wb * Math.sin(th);
      out.push({ s: s, Fx: F.x, Fy: F.y, Rx: Rx, Ry: Ry, th: th, d: normAngle(tan[i] - th) });
    }
    return out;
  };

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  Sim.sample = function (v, Rx, Ry, th, d, s) {
    return { s: s, Rx: Rx, Ry: Ry, th: th, d: d, Fx: Rx + v.wb * Math.cos(th), Fy: Ry + v.wb * Math.sin(th) };
  };

  /* Start state: the front axle center is at F. The vehicle points in direction th. */
  Sim.startState = function (v, F, th) {
    return Sim.sample(v, F.x - v.wb * Math.cos(th), F.y - v.wb * Math.sin(th), th, 0, 0);
  };

  /* Limits for the drive simulation. Return null if the vehicle data are not valid. */
  Sim.driveOpts = function (v) {
    const lim = Sim.steerLimit(v);
    if (!lim) return null;
    return { step: 0.05, dMax: lim.delta, rate: v.rateDeg * Math.PI / 180, tol: 0.1 };
  };

  /* Driving style 1: the driver changes the steering angle while the vehicle moves slowly.
   * He enters the circular arc with a steadily increasing steering angle and leaves it
   * with a steadily decreasing steering angle. In the arc, the steering is at full lock,
   * so the radius is the minimum turning radius of the vehicle.
   * The steering angle changes by "rate" per meter of travel.
   *
   * One turn for a heading change "delta" (radians, positive):
   *   ramp = travel length of one steering ramp, arc = travel length at full lock,
   *   peak = highest steering angle. If delta is too small for full lock, peak is smaller
   *   and there is no arc. */
  function turnProfile(o, wb, delta) {
    // Heading change of one full ramp: integral of tan(rate * s) / wb
    const hr = -Math.log(Math.cos(o.dMax)) / (o.rate * wb);
    if (delta >= 2 * hr) return { peak: o.dMax, ramp: o.dMax / o.rate, arc: (delta - 2 * hr) * wb / Math.tan(o.dMax) };
    const peak = Math.acos(Math.exp(-delta * o.rate * wb / 2));
    return { peak: peak, ramp: peak / o.rate, arc: 0 };
  }

  function turnSteer(p, s) {
    const len = 2 * p.ramp + p.arc;
    if (s <= 0 || s >= len) return 0;
    if (s < p.ramp) return p.peak * s / p.ramp;
    if (s < p.ramp + p.arc) return p.peak;
    return p.peak * (len - s) / p.ramp;
  }

  /* Drive one turn from state st. sign is +1 or -1 (turn direction). Push the samples to out.
   * Return the end state (steering angle 0). */
  function simulateTurn(st, sign, delta, v, o, out) {
    const p = turnProfile(o, v.wb, delta), len = 2 * p.ramp + p.arc;
    const n = Math.max(1, Math.ceil(len / o.step)), ds = len / n;
    let Rx = st.Rx, Ry = st.Ry, th = st.th;
    for (let i = 0; i < n; i++) {
      const dth = Math.tan(sign * turnSteer(p, (i + 0.5) * ds)) / v.wb * ds, am = th + dth / 2;
      Rx += ds * Math.cos(am); Ry += ds * Math.sin(am); th += dth;
      if (out) out.push(Sim.sample(v, Rx, Ry, th, sign * turnSteer(p, (i + 1) * ds), st.s + (i + 1) * ds));
    }
    return Sim.sample(v, Rx, Ry, th, 0, st.s + len);
  }

  /* Build the route from a guide line. The guide line is made of straight lines and circular
   * arcs. The center of the front axle moves along it.
   * pts = corner points of the straight lines (the first point is the start of the front axle).
   * The vehicle starts in the direction of the first line.
   * At each corner point, a turn replaces the corner: the vehicle starts to turn before the
   * corner point, and it is on the next straight line after the turn. The radius is never
   * smaller than the minimum turning radius, because the steering limits apply.
   * Return:
   *   smp  = all samples (the first one is the start),
   *   fail = null, or { leg, need, have } for the first straight line that is too short
   *          for the turns at its two ends (need and have are lengths in meters).
   * The samples are also made when a line is too short. The route is then not usable. */
  Sim.buildRoute = function (pts, v, o) {
    const P = [];
    for (const p of pts) if (!P.length || hyp(p.x - P[P.length - 1].x, p.y - P[P.length - 1].y) > 1e-6) P.push(p);
    if (P.length < 2) return { smp: [Sim.startState(v, P[0], 0)], fail: null };
    const n = P.length - 1, th = [], len = [];
    for (let j = 0; j < n; j++) {
      th.push(Math.atan2(P[j + 1].y - P[j].y, P[j + 1].x - P[j].x));
      len.push(hyp(P[j + 1].x - P[j].x, P[j + 1].y - P[j].y));
    }
    // Space that each corner needs: a before the corner point, b after it.
    // A value below zero is possible: the front axle goes past the corner point before the steering starts,
    // or the turn ends before the corner point.
    const cor = [];
    for (let j = 1; j < n; j++) {
      const dl = normAngle(th[j] - th[j - 1]);
      if (Math.abs(dl) < 1e-3) { cor[j] = { turn: false, a: 0, b: 0 }; continue; }
      if (Math.PI - Math.abs(dl) < 0.02) { cor[j] = { turn: false, a: Infinity, b: Infinity }; continue; }
      const sign = dl > 0 ? 1 : -1;
      const e = simulateTurn(Sim.startState(v, { x: 0, y: 0 }, 0), sign, Math.abs(dl), v, o, null);
      const c = Math.cos(th[j - 1]), sn = Math.sin(th[j - 1]);
      const w = { x: e.Fx * c - e.Fy * sn, y: e.Fx * sn + e.Fy * c };     // front axle move of the turn
      const u2 = { x: Math.cos(th[j]), y: Math.sin(th[j]) };
      const a = -(u2.x * w.y - u2.y * w.x) / Math.sin(dl);                 // the end of the turn is on line j
      const b = u2.x * (w.x - a * c) + u2.y * (w.y - a * sn);
      cor[j] = { turn: true, sign: sign, delta: Math.abs(dl), a: a, b: b };
    }
    let fail = null;
    for (let j = 0; j < n && !fail; j++) {
      const need = (j >= 1 ? cor[j].b : 0) + (j + 1 < n ? cor[j + 1].a : 0);
      if (len[j] + 1e-6 < need) fail = { leg: j, need: need, have: len[j] };
    }
    let cur = Sim.startState(v, P[0], th[0]);
    const smp = [cur];
    const straight = (T) => {      // drive straight (steering angle 0) until the front axle is at T
      const ux = Math.cos(cur.th), uy = Math.sin(cur.th);
      const l = Math.max(0, ux * (T.x - cur.Fx) + uy * (T.y - cur.Fy));
      const m = Math.ceil(l / o.step);
      const base = cur;
      for (let i = 1; i <= m; i++) {
        const ds = l * i / m;
        smp.push(Sim.sample(v, base.Rx + ds * ux, base.Ry + ds * uy, base.th, 0, base.s + ds));
      }
      cur = smp[smp.length - 1];
    };
    for (let j = 0; j < n; j++) {
      const k = j + 1, turns = k < n && cor[k].turn;
      if (turns) {
        straight({ x: P[k].x - cor[k].a * Math.cos(th[j]), y: P[k].y - cor[k].a * Math.sin(th[j]) });
        cur = simulateTurn(cur, cor[k].sign, cor[k].delta, v, o, smp);
      } else {
        straight(P[k]);
      }
    }
    return { smp: smp, fail: fail, cor: cor };
  };

  Sim.local = function (smp, x, y) {
    const c = Math.cos(smp.th), sn = Math.sin(smp.th);
    return { x: smp.Rx + x * c - y * sn, y: smp.Ry + x * sn + y * c };
  };

  /* Body polygon. Corner order: front left, front right, rear right, rear left. */
  Sim.bodyPoly = function (smp, v) {
    const hw = v.width / 2, xf = v.wb + v.front, xr = -v.rear;
    return [Sim.local(smp, xf, -hw), Sim.local(smp, xf, hw), Sim.local(smp, xr, hw), Sim.local(smp, xr, -hw)];
  };

  /* Find the scale (meters per unit u) from a polyline in unit u and its real length in meters. */
  Sim.scaleFromPolyline = function (pts, meters) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += hyp(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L > 0 ? meters / L : null;
  };

  Sim.selfTest = function () {
    const v = Sim.DEFAULT_VEHICLE, res = [];
    const add = (name, ok, detail) => res.push({ name: name, ok: !!ok, detail: detail });
    const lim = Sim.steerLimit(v);
    add('Lenkwinkel aus Wendekreis berechenbar', lim, lim ? 'δmax = ' + (lim.delta * 180 / Math.PI).toFixed(1) + '°, R Hinterachse = ' + lim.rRear.toFixed(2) + ' m' : '');

    // Circle test: the front axle drives on radius rFront. In steady state, the rear axle must be on radius rRear.
    const step = 0.05, N = Math.round(2 * 2 * Math.PI * lim.rFront / step);
    const circ = [];
    for (let i = 0; i <= N; i++) { const a = i * step / lim.rFront; circ.push({ x: lim.rFront * Math.cos(a), y: lim.rFront * Math.sin(a) }); }
    const run = Sim.run(circ, v), last = run.slice(Math.floor(run.length * 0.75));
    let dev = 0, maxCorner = 0, dMax = 0;
    for (const p of last) {
      dev = Math.max(dev, Math.abs(hyp(p.Rx, p.Ry) - lim.rRear));
      dMax = Math.max(dMax, Math.abs(p.d));
      for (const c of Sim.bodyPoly(p, v)) maxCorner = Math.max(maxCorner, hyp(c.x, c.y));
    }
    add('Kreisfahrt: Hinterachsradius = √(R² − Radstand²)', dev < 0.01, 'max. Abweichung ' + (dev * 1000).toFixed(1) + ' mm');
    add('Vollausschlag: äußere Ecke auf Wendekreis ' + v.rOuter + ' m', Math.abs(maxCorner - v.rOuter) < 0.02, 'gemessen ' + maxCorner.toFixed(3) + ' m');
    add('Vollausschlag: Lenkwinkel stationär = δmax', Math.abs(dMax - lim.delta) < 0.005, (dMax * 180 / Math.PI).toFixed(2) + '°');

    const line = [];
    for (let i = 0; i <= 400; i++) line.push({ x: i * 0.05, y: 0 });
    const lr = Sim.run(line, v);
    let off = 0;
    for (const p of lr) off = Math.max(off, Math.abs(p.Ry), Math.abs(p.d));
    add('Geradeausfahrt: keine Abweichung', off < 1e-9, '');

    const m = Sim.scaleFromPolyline([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }], 10);
    add('Maßstab: Linienzug 70 pt = 10 m', Math.abs(m - 10 / 70) < 1e-12, (1 / m).toFixed(2) + ' pt/m');

    // Route tests (driving style 1): limits for the steering angle and for its rate must hold.
    const o = Sim.driveOpts(v);
    const pt = (x, y) => ({ x: x, y: y });
    const stRoute = Sim.buildRoute([pt(0, 0), pt(10, 0)], v, o);
    add('Fahrweise 1: Gerade, Lenkwinkel 0', !stRoute.fail && stRoute.smp.every((q) => Math.abs(q.d) < 1e-9), '');

    const corner = Sim.buildRoute([pt(0, 0), pt(20, 0), pt(20, 20)], v, o);
    const cEnd = corner.smp[corner.smp.length - 1];
    add('Fahrweise 1: 90°-Ecke fahrbar, Ziel auf 1 mm genau', !corner.fail && hyp(cEnd.Fx - 20, cEnd.Fy - 20) < 0.001,
      (hyp(cEnd.Fx - 20, cEnd.Fy - 20) * 1000).toFixed(2) + ' mm');
    const early = corner.smp.find((q) => Math.abs(q.d) > 1e-6);
    add('Fahrweise 1: Kurve beginnt vor dem Eckpunkt', early && early.Fx < 20 - 1, early ? 'Beginn bei x = ' + early.Fx.toFixed(1) + ' m' : '');
    const tight = Sim.buildRoute([pt(0, 0), pt(5, 0), pt(5, 5)], v, o);
    add('Fahrweise 1: zu kurze Strecken für 90°-Kurve werden erkannt', !!tight.fail,
      tight.fail ? 'nötig ' + tight.fail.need.toFixed(1) + ' m, vorhanden ' + tight.fail.have.toFixed(1) + ' m' : '');

    const multi = Sim.buildRoute([pt(0, 0), pt(20, 0), pt(40, 15), pt(45, 40), pt(20, 60), pt(20, 90)], v, o);
    let worstD = 0, worstRate = 0, jump = 0;
    multi.smp.forEach((q, i) => {
      worstD = Math.max(worstD, Math.abs(q.d));
      if (i) {
        worstRate = Math.max(worstRate, Math.abs(q.d - multi.smp[i - 1].d) / (q.s - multi.smp[i - 1].s));
        jump = Math.max(jump, hyp(q.Rx - multi.smp[i - 1].Rx, q.Ry - multi.smp[i - 1].Ry));
      }
    });
    add('Fahrweise 1: Mehrfach-Route fahrbar', !multi.fail, multi.fail ? 'Strecke ' + (multi.fail.leg + 1) + ' zu kurz' : '');
    add('Fahrweise 1: Lenkwinkel nie über Limit', worstD <= o.dMax + 1e-9, (worstD * 180 / Math.PI).toFixed(2) + '°');
    add('Fahrweise 1: Lenkgeschwindigkeit nie über Limit', worstRate <= o.rate + 1e-6, (worstRate * 180 / Math.PI).toFixed(1) + '°/m');
    add('Fahrweise 1: Weg ohne Sprünge', jump < 0.0501, 'max. Schritt ' + (jump * 1000).toFixed(1) + ' mm');

    // In a large turn, the arc is at full lock and the outer body corner is on the turning circle.
    let outer = 0;
    const arc = corner.smp.filter((q) => Math.abs(q.d) >= o.dMax - 1e-9);
    if (arc.length) {
      const q = arc[Math.floor(arc.length / 2)];
      const rr = lim.rRear, cx = q.Rx - rr * Math.sin(q.th), cy = q.Ry + rr * Math.cos(q.th);   // circle center (left turn)
      for (const a of arc) for (const k of Sim.bodyPoly(a, v)) outer = Math.max(outer, hyp(k.x - cx, k.y - cy));
    }
    add('Fahrweise 1: Bogen bei Vollausschlag, Außenradius = Wendekreis ' + v.rOuter + ' m',
      arc.length > 20 && Math.abs(outer - v.rOuter) < 0.02, 'gemessen ' + outer.toFixed(3) + ' m, ' + (arc.length * o.step).toFixed(1) + ' m Bogen');
    return res;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
  else root.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
