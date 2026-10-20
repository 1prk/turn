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

  Sim.sample = function (v, Rx, Ry, th, d, s) {
    return { s: s, Rx: Rx, Ry: Ry, th: th, d: d, Fx: Rx + v.wb * Math.cos(th), Fy: Ry + v.wb * Math.sin(th) };
  };

  /* Start state: the front axle center is at F. The vehicle points in direction th. */
  Sim.startState = function (v, F, th) {
    return Sim.sample(v, F.x - v.wb * Math.cos(th), F.y - v.wb * Math.sin(th), th, 0, 0);
  };

  /* Limits for the drive simulation. Return null if the vehicle data are not valid.
   * rFront = smallest radius for the center of the front axle (the vehicle is at full lock).
   * rMax = largest radius that is used for an arc of the guide line. */
  Sim.driveOpts = function (v) {
    const lim = Sim.steerLimit(v);
    if (!lim) return null;
    return { step: 0.05, dMax: lim.delta, rFront: lim.rFront, rMax: 200 };
  };

  /* Driving style 1. The guide line is made of straight lines and circular arcs.
   * The center of the front axle moves along the guide line. The arcs touch the straight
   * lines (tangential), so the guide line has no kink. The steering angle changes quickly
   * while the vehicle moves, so the transition curves are very small and the model does not
   * use them. The steering angle follows from the motion of the rear axle: it increases
   * steadily when the vehicle enters an arc and decreases steadily when it leaves the arc.
   * The radius of an arc is never smaller than rFront. This is the minimum turning circle
   * of the vehicle, with the steering at full lock.
   *
   * Build the route from the corner points pts (the first point is the start of the front axle).
   * The vehicle starts in the direction of the first line. At each corner point, an arc with
   * a radius R replaces the corner. The radius is as large as the lines allow, so the
   * curves are larger when the points are further away. A line gives one half of its free
   * length to each of its two arcs. A line that is not next to another arc gives all of it.
   * Return:
   *   smp  = samples of the route (the first one is the start),
   *   fail = null, or the reason why the route cannot be driven:
   *          { kind: 'length', leg, need, have } a line is too short for the arcs at its two ends
   *          (leg = index of the line, need and have in meters), or
   *          { kind: 'steer', maxD } the steering angle is more than the limit,
   *   arcs = for each corner point: { R, t, delta } or null if there is no arc.
   * The samples are also made when the route cannot be driven, so that the vehicle is always shown. */
  Sim.buildRoute = function (pts, v, o) {
    const P = [];
    for (const p of pts) if (!P.length || hyp(p.x - P[P.length - 1].x, p.y - P[P.length - 1].y) > 1e-6) P.push(p);
    if (P.length < 2) return { smp: [Sim.startState(v, P[0], 0)], fail: null, arcs: [] };
    const n = P.length - 1, th = [], len = [];
    for (let j = 0; j < n; j++) {
      th.push(Math.atan2(P[j + 1].y - P[j].y, P[j + 1].x - P[j].x));
      len.push(hyp(P[j + 1].x - P[j].x, P[j + 1].y - P[j].y));
    }
    // Corner j is at point P[j] (j = 1 .. n-1). tMin = length of the tangent for the smallest radius.
    const cor = [];
    for (let j = 1; j < n; j++) {
      const dl = normAngle(th[j] - th[j - 1]), half = Math.abs(dl) / 2;
      const active = Math.abs(dl) >= 1e-3;
      cor[j] = { active: active, dl: dl, half: half, tMin: active ? o.rFront * Math.tan(half) : 0 };
      if (active && Math.PI - Math.abs(dl) < 0.02) cor[j].tMin = Infinity;   // nearly a reversal
    }
    const tMinAt = (j) => (j >= 1 && j < n ? cor[j].tMin : 0);
    const activeAt = (j) => j >= 1 && j < n && cor[j].active;
    let fail = null;
    for (let j = 0; j < n && !fail; j++) {
      const need = tMinAt(j) + tMinAt(j + 1);
      if (len[j] + 1e-6 < need) fail = { kind: 'length', leg: j, need: need, have: len[j] };
    }
    // Free length of the lines goes to the arcs, so that the radii are as large as possible.
    const arcs = [null];
    for (let j = 1; j < n; j++) {
      const c = cor[j];
      if (!c.active) { arcs[j] = null; continue; }
      const free = (leg, other) => Math.max(0, len[leg] - c.tMin - tMinAt(other)) * (activeAt(other) ? 0.5 : 1);
      let t = c.tMin + Math.min(free(j - 1, j - 1), free(j, j + 1));
      t = Math.min(t, o.rMax * Math.tan(c.half));
      if (!isFinite(t)) t = c.tMin;
      t = Math.max(t, Math.min(c.tMin, len[j - 1]), 0);
      arcs[j] = { R: isFinite(c.tMin) ? t / Math.tan(c.half) : 0, t: t, delta: c.dl };
    }
    // Sample the guide line (front axle center), then move the vehicle along it.
    const path = [{ x: P[0].x, y: P[0].y }];
    const line = (T) => {
      const last = path[path.length - 1], l = hyp(T.x - last.x, T.y - last.y), m = Math.ceil(l / o.step);
      if (l < 1e-6) return;     // the point is already on the path
      for (let i = 1; i <= m; i++) path.push({ x: last.x + (T.x - last.x) * i / m, y: last.y + (T.y - last.y) * i / m });
    };
    for (let j = 1; j < n; j++) {
      const a = arcs[j];
      if (!a || !(a.R > 0)) continue;
      const ux = Math.cos(th[j - 1]), uy = Math.sin(th[j - 1]), sign = a.delta > 0 ? 1 : -1;
      const A = { x: P[j].x - a.t * ux, y: P[j].y - a.t * uy };               // start of the arc
      const C = { x: A.x - sign * a.R * uy, y: A.y + sign * a.R * ux };         // center of the arc
      line(A);
      const phi0 = Math.atan2(A.y - C.y, A.x - C.x), m = Math.max(1, Math.ceil(a.R * Math.abs(a.delta) / o.step));
      for (let i = 1; i <= m; i++) {
        const phi = phi0 + a.delta * i / m;
        path.push({ x: C.x + a.R * Math.cos(phi), y: C.y + a.R * Math.sin(phi) });
      }
    }
    line(P[n]);
    const smp = Sim.run(path, v);
    let maxD = 0;
    for (const q of smp) maxD = Math.max(maxD, Math.abs(q.d));
    if (!fail && maxD > o.dMax + 0.01) fail = { kind: 'steer', maxD: maxD };
    return { smp: smp, fail: fail, arcs: arcs };
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

    // Route tests (driving style 1)
    const o = Sim.driveOpts(v), pt = (x, y) => ({ x: x, y: y });
    const front = (smp) => smp.map((q) => ({ x: q.Fx, y: q.Fy }));
    const stRoute = Sim.buildRoute([pt(0, 0), pt(10, 0)], v, o);
    add('Fahrweise 1: Gerade, Lenkwinkel 0', !stRoute.fail && stRoute.smp.every((q) => Math.abs(q.d) < 1e-9), '');

    const corner = Sim.buildRoute([pt(0, 0), pt(20, 0), pt(20, 20)], v, o);
    const cEnd = corner.smp[corner.smp.length - 1];
    add('Fahrweise 1: 90°-Ecke fahrbar, Ziel auf 1 mm genau', !corner.fail && hyp(cEnd.Fx - 20, cEnd.Fy - 20) < 0.001,
      (hyp(cEnd.Fx - 20, cEnd.Fy - 20) * 1000).toFixed(2) + ' mm');

    // The guide line has no kink: the change of direction per step is small everywhere,
    // and the radius is never below the minimum radius of the front axle.
    let maxTurn = 0, minR = Infinity;
    const gl = front(corner.smp);
    for (let i = 2; i < gl.length; i++) {
      const a = Math.atan2(gl[i - 1].y - gl[i - 2].y, gl[i - 1].x - gl[i - 2].x), b = Math.atan2(gl[i].y - gl[i - 1].y, gl[i].x - gl[i - 1].x);
      const dth = Math.abs(normAngle(b - a)), ds = hyp(gl[i].x - gl[i - 1].x, gl[i].y - gl[i - 1].y);
      maxTurn = Math.max(maxTurn, dth);
      if (dth > 1e-6) minR = Math.min(minR, ds / dth);
    }
    add('Fahrweise 1: Leitlinie ohne Knick', maxTurn < 0.02, 'max. Richtungsänderung ' + (maxTurn * 180 / Math.PI).toFixed(2) + '° pro 5 cm');
    add('Fahrweise 1: Radius nie unter Mindestradius', minR >= o.rFront - 0.01, 'kleinster Radius ' + minR.toFixed(2) + ' m, Grenze ' + o.rFront.toFixed(2) + ' m');

    const near = Sim.buildRoute([pt(0, 0), pt(20, 0), pt(20, 20)], v, o), far = Sim.buildRoute([pt(0, 0), pt(60, 0), pt(60, 60)], v, o);
    add('Fahrweise 1: je weiter die Punkte, desto größer die Kurve', far.arcs[1].R > near.arcs[1].R * 2 && near.arcs[1].R > o.rFront,
      'R = ' + near.arcs[1].R.toFixed(1) + ' m bei 20 m, ' + far.arcs[1].R.toFixed(1) + ' m bei 60 m');
    const tight = Sim.buildRoute([pt(0, 0), pt(3, 0), pt(3, 3)], v, o);
    add('Fahrweise 1: zu kurze Strecken werden erkannt', tight.fail && tight.fail.kind === 'length',
      tight.fail && tight.fail.need ? 'nötig ' + tight.fail.need.toFixed(1) + ' m, vorhanden ' + tight.fail.have.toFixed(1) + ' m' : '');

    // Smallest possible curve: the lines are only as long as the minimum radius needs.
    const small = Sim.buildRoute([pt(0, 0), pt(o.rFront + 0.001, 0), pt(o.rFront + 0.001, o.rFront + 0.001)], v, o);
    let smallD = 0, smallOuter = 0;
    small.smp.forEach((q) => { smallD = Math.max(smallD, Math.abs(q.d)); for (const k of Sim.bodyPoly(q, v)) smallOuter = Math.max(smallOuter, hyp(k.x - (o.rFront + 0.001 - 0), k.y - 0)); });
    add('Fahrweise 1: kleinste Kurve fahrbar, Lenkwinkel nicht über dem Limit', !small.fail && smallD <= o.dMax + 0.01,
      (smallD * 180 / Math.PI).toFixed(1) + '° von ' + (o.dMax * 180 / Math.PI).toFixed(1) + '°');

    const multi = Sim.buildRoute([pt(0, 0), pt(20, 0), pt(40, 15), pt(45, 40), pt(20, 60), pt(20, 90)], v, o);
    let worstD = 0, jump = 0;
    multi.smp.forEach((q, i) => {
      worstD = Math.max(worstD, Math.abs(q.d));
      if (i) jump = Math.max(jump, hyp(q.Rx - multi.smp[i - 1].Rx, q.Ry - multi.smp[i - 1].Ry));
    });
    add('Fahrweise 1: Mehrfach-Route fahrbar', !multi.fail, multi.fail ? 'Fehler: ' + multi.fail.kind : '');
    add('Fahrweise 1: Lenkwinkel nie über Limit', worstD <= o.dMax + 0.01, (worstD * 180 / Math.PI).toFixed(2) + '°');
    add('Fahrweise 1: Weg ohne Sprünge', jump < 0.0501, 'max. Schritt ' + (jump * 1000).toFixed(1) + ' mm');
    // Two arcs in opposite directions, one after the other: the steering must still stay in the limit.
    const zig = Sim.buildRoute([pt(0, 0), pt(12, 0), pt(12 + 8.5, 8.5), pt(12 + 8.5 + 12, 8.5)], v, o);
    let zigD = 0;
    zig.smp.forEach((q) => { zigD = Math.max(zigD, Math.abs(q.d)); });
    add('Fahrweise 1: S-Kurve, Lenkwinkel im Limit', !zig.fail && zigD <= o.dMax + 0.01, (zigD * 180 / Math.PI).toFixed(1) + '°');

    // Smallest curve: the guide line has the minimum radius, and the body never goes outside the turning circle.
    // The center of the arc is at (0, rFront). The outer body corner is on the right side of the vehicle.
    let minRG = Infinity, outer = 0;
    const g2 = front(small.smp);
    for (let i = 2; i < g2.length; i++) {
      const a = Math.atan2(g2[i - 1].y - g2[i - 2].y, g2[i - 1].x - g2[i - 2].x), b = Math.atan2(g2[i].y - g2[i - 1].y, g2[i].x - g2[i - 1].x);
      const dth = Math.abs(normAngle(b - a));
      if (dth > 1e-6) minRG = Math.min(minRG, hyp(g2[i].x - g2[i - 1].x, g2[i].y - g2[i - 1].y) / dth);
    }
    // Only the samples in the turn count. Before it, the vehicle is on the straight line.
    for (const q of small.smp) if (q.th > 0.5) for (const k of Sim.bodyPoly(q, v)) outer = Math.max(outer, hyp(k.x - 0, k.y - (o.rFront + 0.001)));
    add('Fahrweise 1: kleinste Kurve hat den Mindestradius ' + o.rFront.toFixed(2) + ' m', Math.abs(minRG - o.rFront) < 0.02, 'gemessen ' + minRG.toFixed(2) + ' m');
    add('Fahrweise 1: Karosserie bleibt innerhalb des Wendekreises ' + v.rOuter + ' m', outer <= v.rOuter + 0.02 && outer > 5, 'größter Abstand ' + outer.toFixed(2) + ' m');
    return res;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
  else root.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
