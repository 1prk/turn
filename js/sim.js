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
   * so the outer radius is equal to the minimum turning circle of the vehicle.
   * The steering angle changes by "rate" per meter of travel.
   *
   * Description of one turn for a heading change "delta" (radians, positive):
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

  /* Drive one turn from state st. sign is +1 or -1 (turn direction). Push the samples to out. */
  function simulateTurn(st, sign, delta, v, o, out) {
    if (delta < 1e-9) return st;
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

  /* Drive from state st to target T (center of the front axle) in driving style 1:
   * first one turn (steering in, arc, steering out), then straight to T.
   * The smallest heading change is used, so that T is on the line of the final heading.
   * Only forward travel is possible. If T is not reachable (for example, T is inside the
   * turning circle), the result has reached = false and no samples. */
  Sim.driveTo = function (st, T, v, o) {
    const wb = v.wb, dx = T.x - st.Fx, dy = T.y - st.Fy;
    if (hyp(dx, dy) < o.tol) return { samples: [], reached: true };
    const c = Math.cos(st.th), sn = Math.sin(st.th);
    const f0 = c * dy - sn * dx, ahead = c * dx + sn * dy;
    const out = [];
    let end = st;
    if (!(Math.abs(f0) < 1e-6 && ahead > 0)) {
      const sign = f0 >= 0 ? 1 : -1;
      // g > 0: T is on the turn side of the final heading. g = 0: T is on the line of the final heading.
      const g = (delta) => {
        const e = simulateTurn(st, sign, delta, v, o, null);
        const wx = T.x - e.Fx, wy = T.y - e.Fy, ce = Math.cos(e.th), se = Math.sin(e.th);
        return { g: sign * (ce * wy - se * wx), dot: ce * wx + se * wy };
      };
      const dStep = Math.PI / 180, dMaxTurn = 3 * Math.PI;
      let lo = 0, hi = -1, prev = g(0);
      for (let delta = dStep; delta <= dMaxTurn; delta += dStep) {
        const cur = g(delta);
        if (prev.g >= 0 && cur.g <= 0 && cur.dot > 0) { hi = delta; break; }
        prev = cur; lo = delta;
      }
      if (hi < 0) return { samples: [], reached: false };
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (g(mid).g > 0) lo = mid; else hi = mid;
      }
      end = simulateTurn(st, sign, hi, v, o, out);
    }
    // Straight part to the target
    const wx = T.x - end.Fx, wy = T.y - end.Fy;
    const len = Math.cos(end.th) * wx + Math.sin(end.th) * wy;
    const n = Math.max(0, Math.ceil(len / o.step));
    for (let i = 1; i <= n; i++) {
      const ds = len * i / n;
      out.push(Sim.sample(v, end.Rx + ds * Math.cos(end.th), end.Ry + ds * Math.sin(end.th), end.th, 0, end.s + ds));
    }
    return { samples: out, reached: true };
  };

  /* Drive through all targets in order. Stop at the first target that is not reachable.
   * Return: smp (all samples, the first one is the start), wpIdx (sample index of each
   * reached target) and fail (the target that is not reachable, with the partial samples). */
  Sim.driveAll = function (st, targets, v, o) {
    const smp = [st], wpIdx = [];
    let cur = st, fail = null;
    for (let i = 0; i < targets.length; i++) {
      const r = Sim.driveTo(cur, targets[i], v, o);
      if (!r.reached) { fail = { index: i, samples: r.samples }; break; }
      for (const q of r.samples) smp.push(q);
      cur = smp[smp.length - 1];
      wpIdx.push(smp.length - 1);
    }
    return { smp: smp, wpIdx: wpIdx, fail: fail };
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

    // Drive tests for driving style 1: limits for the steering angle and for its rate must hold.
    const o = Sim.driveOpts(v), st0 = Sim.startState(v, { x: 0, y: 0 }, 0);
    const ahead = Sim.driveTo(st0, { x: 10, y: 0 }, v, o);
    add('Fahrweise 1: Ziel geradeaus erreichbar, Lenkwinkel 0',
      ahead.reached && ahead.samples.every((q) => Math.abs(q.d) < 1e-9), '');
    const inside = Sim.driveTo(st0, { x: 1, y: 3 }, v, o);
    add('Fahrweise 1: Ziel innerhalb des Wendekreises ist nicht erreichbar', !inside.reached, '');

    const T1 = { x: 14, y: 12 };
    const turn = Sim.driveTo(st0, T1, v, o);
    const tEnd = turn.samples[turn.samples.length - 1];
    add('Fahrweise 1: Ziel wird auf 1 mm genau erreicht', turn.reached && hyp(tEnd.Fx - T1.x, tEnd.Fy - T1.y) < 0.001,
      turn.reached ? (hyp(tEnd.Fx - T1.x, tEnd.Fy - T1.y) * 1000).toFixed(2) + ' mm' : '');
    const run2 = Sim.driveAll(st0, [{ x: 8, y: 0 }, { x: 18, y: 12 }, { x: 18, y: 30 }, { x: 6, y: 40 }], v, o);
    let worstD = 0, worstRate = 0, jump = 0;
    run2.smp.forEach((q, i) => {
      worstD = Math.max(worstD, Math.abs(q.d));
      if (i) { worstRate = Math.max(worstRate, Math.abs(q.d - run2.smp[i - 1].d) / (q.s - run2.smp[i - 1].s)); }
      if (i) jump = Math.max(jump, hyp(q.Rx - run2.smp[i - 1].Rx, q.Ry - run2.smp[i - 1].Ry));
    });
    add('Fahrweise 1: Mehrpunkt-Fahrt erreicht alle Ziele', !run2.fail && run2.wpIdx.length === 4, '');
    add('Fahrweise 1: Lenkwinkel nie über Limit', worstD <= o.dMax + 1e-9, (worstD * 180 / Math.PI).toFixed(2) + '°');
    add('Fahrweise 1: Lenkgeschwindigkeit nie über Limit', worstRate <= o.rate + 1e-6, (worstRate * 180 / Math.PI).toFixed(1) + '°/m');
    add('Fahrweise 1: Weg ohne Sprünge', jump < 0.0501, 'max. Schritt ' + (jump * 1000).toFixed(1) + ' mm');
    // In a large turn, the arc is at full lock and the outer body corner is on the turning circle.
    let outer = 0;
    const big = Sim.driveTo(st0, { x: -4, y: 12 }, v, o);   // heading change of more than 90 degrees
    const arc = big.samples.filter((q) => Math.abs(q.d) >= o.dMax - 1e-9);
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
