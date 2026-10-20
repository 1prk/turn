/* Swept-path kinematics. This file does not use the DOM.
 * All lengths are in meters. All angles are in radians.
 * Vehicle axes: the origin is the center of the rear axle.
 * The x axis points forward. The y axis points to the side. */
(function (root) {
  'use strict';
  const Sim = {};
  const hyp = Math.hypot;

  /* The code uses radians. The user interface shows gon. 400 gon is a full circle. */
  Sim.gon = function (rad) { return rad * 200 / Math.PI; };

  /* Vehicles that are ready to use. All lengths are in meters.
   * track = track width. The program uses it only to draw the wheels.
   * ratio = steering ratio. It is the steering wheel angle divided by the road wheel angle. */
  Sim.PRESETS = [
    { name: 'PKW', wb: 2.86, front: 0.92, rear: 1.10, width: 1.89, rOuter: 5.85, track: 1.60, ratio: 13, preset: true },
    { name: 'LKW', wb: 5.17, front: 1.36, rear: 2.69, width: 2.30, rOuter: 9.46, track: 1.90, ratio: 20, preset: true }
  ];
  Sim.DEFAULT_VEHICLE = Object.assign({}, Sim.PRESETS[0]);

  /* Calculate the maximum steering angle from the turning circle.
   * At full lock, the outer front corner is on the circle with the radius rOuter.
   * The center of this circle is on the line of the rear axle. */
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

  // Centripetal Catmull-Rom spline (Barry-Goldman). The value u goes from 0 to 1, from p1 to p2.
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

  /* Change the control points into a smooth curve. The points on the curve have the distance "step". */
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
   * The rear axle follows, because the wheelbase is rigid.
   * Each result has these values:
   * s = distance along the path, F = front axle, R = rear axle,
   * th = vehicle angle, d = steering angle (path tangent minus vehicle angle). */
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
        // The rear axle moves along the mean vehicle angle (second order).
        // The distance |F - R| stays equal to the wheelbase.
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

  /* Start state. The center of the front axle is at F. The vehicle points in the direction th. */
  Sim.startState = function (v, F, th) {
    return Sim.sample(v, F.x - v.wb * Math.cos(th), F.y - v.wb * Math.sin(th), th, 0, 0);
  };

  /* Limits for the drive simulation. Return null if the vehicle data are not valid.
   * rFront = smallest radius for the center of the front axle (at full lock).
   * rMax = largest radius for an arc of the guide line. */
  Sim.driveOpts = function (v) {
    const lim = Sim.steerLimit(v);
    if (!lim) return null;
    return { step: 0.05, dMax: lim.delta, rFront: lim.rFront, rMax: 200 };
  };

  /* Driving style 1.
   * The guide line has straight lines and circular arcs.
   * The center of the front axle moves along the guide line.
   * The arcs touch the straight lines (tangential). The guide line has no kink.
   * The driver changes the steering angle quickly while the vehicle moves.
   * The transition curves are very small. The model does not use them.
   * The steering angle comes from the motion of the rear axle.
   * It increases steadily when the vehicle enters an arc.
   * It decreases steadily when the vehicle leaves the arc.
   * The radius of an arc is never smaller than rFront.
   * This is the minimum turning circle of the vehicle at full lock.
   *
   * The route has two kinds of parts:
   *   'line' = a straight line to the point.
   *            At a point between two lines, an arc replaces the corner.
   *            The radius is as large as the lines allow.
   *            When the points are far apart, the curves are large.
   *            A line gives half of its free length to each of its two arcs.
   *            If the other end of the line has no arc, the line gives all of its free length.
   *   'arc'  = a circular arc.
   *            It starts at the last point, tangential to the direction there.
   *            It goes through the new point. The radius comes from the points.
   *            With this arc, the vehicle can turn around in one movement (more than 200 gon).
   *            A line after an arc continues straight in the end direction of the arc.
   *   'turn' = a circular arc with a given radius R and a given change of direction sweep.
   *            It has no point of its own: { t: 'turn', sweep, R }. The sweep is in radians.
   *            It is positive when the vehicle turns toward the positive angle. R = 0 means the minimum turning circle.
   *            The turn starts at the end of the route, tangential to the direction there.
   *            A line after a turn continues straight in the end direction of the turn.
   *
   * Build the route from the points pts.
   * Each point is { x, y, t }. The value t is 'line' or 'arc'.
   * It is the type of the part that ends at the point.
   * The first point is the start of the front axle.
   * The vehicle starts in the direction of the first line.
   * The function returns these values:
   *   smp     = the samples of the route. The first sample is the start.
   *   fail    = null, or the reason why the vehicle cannot drive the route:
   *             { kind: 'length', leg, need, have } = a line is too short for the arcs at its two ends.
   *             The value leg is the index of the line. The values need and have are lengths in meters.
   *             { kind: 'radius', R, rMin } = an arc is smaller than the minimum turning circle.
   *             { kind: 'steer', maxD } = the steering angle is more than the limit.
   *   lastArc = { R, delta } if the last part is an arc through a point. The value delta is the turn in radians.
   *             Otherwise it is null.
   *   arcs    = the arcs at the corner points between two lines.
   *             arcs[index of the point] = { R, t, delta }.
   *   ends    = the end of each part. ends[index in the input] = { x, y }. It is useful for a turn, which has no point.
   *   end     = { x, y, h } = the end of the guide line and its direction.
   * The function also makes samples when the vehicle cannot drive the route.
   * The user sees the vehicle at all times.
   * With opt.checkOnly, the vehicle does not move. The result has no samples. */
  Sim.buildRoute = function (pts, v, o, opt) {
    const P = [];                            // src = the index of the point in the input.
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!P.length) P.push({ x: p.x, y: p.y, t: 'line', src: i });
      else if (p.t === 'turn') P.push({ x: NaN, y: NaN, t: 'turn', sweep: p.sweep, R: p.R, src: i });
      else if (P[P.length - 1].t === 'turn' || hyp(p.x - P[P.length - 1].x, p.y - P[P.length - 1].y) > 1e-6) P.push({ x: p.x, y: p.y, t: p.t === 'arc' ? 'arc' : 'line', src: i });
    }
    while (P.length > 1 && P[1].t === 'turn') P.splice(1, 1);      // The first part must be a line. It gives the direction.
    if (P.length < 2) return { smp: [Sim.startState(v, P[0], 0)], fail: null, lastArc: null, arcs: [], ends: [], end: { x: P[0].x, y: P[0].y, h: 0 } };
    P[1].t = 'line';

    const path = [{ x: P[0].x, y: P[0].y }];      // The guide line of the center of the front axle.
    const line = (T) => {
      const last = path[path.length - 1], l = hyp(T.x - last.x, T.y - last.y), m = Math.ceil(l / o.step);
      if (l < 1e-6) return;     // The point is on the path.
      for (let i = 1; i <= m; i++) path.push({ x: last.x + (T.x - last.x) * i / m, y: last.y + (T.y - last.y) * i / m });
    };
    let pose = { x: P[0].x, y: P[0].y, h: Math.atan2(P[1].y - P[0].y, P[1].x - P[0].x) };
    let forced = false, fail = null, lastArc = null;      // forced = true when an arc before sets the direction.
    const arcs = [];                                      // The arc at each corner point: arcs[index of the point] = { R, t, delta }.
    const ends = [];                                      // The end of each part: ends[index in the input] = { x, y }.
    const setFail = (f) => { if (!fail) fail = f; };

    // Make a turn from the pose. The turn has the radius R and the change of direction sweep (positive or negative).
    // It starts tangential to the direction of the vehicle. The line after it continues in the end direction.
    const doTurn = (j) => {
      const e = P[j], sweep = e.sweep, aa = Math.abs(sweep);
      lastArc = null;
      forced = true;
      if (!(aa > 1e-6)) { ends[e.src] = { x: pose.x, y: pose.y }; return; }
      const R = e.R > 0 ? e.R : o.rFront, sign = sweep > 0 ? 1 : -1;
      if (R < o.rFront - 1e-6) setFail({ kind: 'radius', R: R, rMin: o.rFront });
      const C = { x: pose.x - sign * R * Math.sin(pose.h), y: pose.y + sign * R * Math.cos(pose.h) };
      const phi0 = Math.atan2(pose.y - C.y, pose.x - C.x), m = Math.max(1, Math.ceil(R * aa / o.step));
      for (let i = 1; i <= m; i++) path.push({ x: C.x + R * Math.cos(phi0 + sweep * i / m), y: C.y + R * Math.sin(phi0 + sweep * i / m) });
      const last = path[path.length - 1];
      pose = { x: last.x, y: last.y, h: pose.h + sweep };
      ends[e.src] = { x: last.x, y: last.y };
      lastArc = { R: R, delta: sweep };
    };

    // Make an arc from the pose through the point P[j].
    const doArc = (j) => {
      const M = P[j], dx = M.x - pose.x, dy = M.y - pose.y, c = hyp(dx, dy);
      const alpha = normAngle(Math.atan2(dy, dx) - pose.h), aa = Math.abs(alpha);
      lastArc = null;
      forced = true;
      ends[M.src] = { x: M.x, y: M.y };
      if (aa < 1e-4) { line(M); pose = { x: M.x, y: M.y, h: pose.h }; return; }                   // Straight on.
      if (Math.PI - aa < 0.05) {                                                                  // The point is right behind the vehicle.
        setFail({ kind: 'radius', R: Infinity, rMin: o.rFront });
        line(M); pose = { x: M.x, y: M.y, h: Math.atan2(dy, dx) }; return;
      }
      const R = c / (2 * Math.sin(aa)), sign = alpha > 0 ? 1 : -1, sweep = 2 * alpha;
      if (R < o.rFront - 1e-6) setFail({ kind: 'radius', R: R, rMin: o.rFront });
      const C = { x: pose.x - sign * R * Math.sin(pose.h), y: pose.y + sign * R * Math.cos(pose.h) };
      const phi0 = Math.atan2(pose.y - C.y, pose.x - C.x), m = Math.max(1, Math.ceil(R * Math.abs(sweep) / o.step));
      for (let i = 1; i < m; i++) path.push({ x: C.x + R * Math.cos(phi0 + sweep * i / m), y: C.y + R * Math.sin(phi0 + sweep * i / m) });
      path.push({ x: M.x, y: M.y });
      pose = { x: M.x, y: M.y, h: pose.h + sweep };
      ends[M.src] = { x: M.x, y: M.y };
      lastArc = { R: R, delta: sweep };
    };

    // The lines P[j] to P[k]. They are straight lines with an arc at each corner between two lines.
    const doRun = (j, k) => {
      lastArc = null;
      const Q = [{ x: pose.x, y: pose.y }], idx = [j - 1];
      for (let i = j; i <= k; i++) { Q.push(P[i]); idx.push(i); ends[P[i].src] = { x: P[i].x, y: P[i].y }; }
      if (forced) {          // After an arc, the first line goes in the end direction of the arc.
        const ux = Math.cos(pose.h), uy = Math.sin(pose.h);
        const l = Math.max(0.05, (Q[1].x - Q[0].x) * ux + (Q[1].y - Q[0].y) * uy);
        Q[1] = { x: Q[0].x + l * ux, y: Q[0].y + l * uy };
      }
      forced = false;
      const n = Q.length - 1, th = [], len = [];
      for (let i = 0; i < n; i++) {
        th.push(Math.atan2(Q[i + 1].y - Q[i].y, Q[i + 1].x - Q[i].x));
        len.push(hyp(Q[i + 1].x - Q[i].x, Q[i + 1].y - Q[i].y));
      }
      // Corner i is at the point Q[i] (i = 1 to n-1). tMin = length of the tangent for the smallest radius.
      const cor = [];
      for (let i = 1; i < n; i++) {
        const dl = normAngle(th[i] - th[i - 1]), half = Math.abs(dl) / 2, active = Math.abs(dl) >= 1e-3;
        cor[i] = { active: active, dl: dl, half: half, tMin: active ? o.rFront * Math.tan(half) : 0 };
        if (active && Math.PI - Math.abs(dl) < 0.02) cor[i].tMin = Infinity;   // The corner is almost a reversal.
      }
      const tMinAt = (i) => (i >= 1 && i < n ? cor[i].tMin : 0);
      const activeAt = (i) => i >= 1 && i < n && cor[i].active;
      for (let i = 0; i < n; i++) {
        const need = tMinAt(i) + tMinAt(i + 1);
        if (len[i] + 1e-6 < need) setFail({ kind: 'length', leg: idx[i + 1] - 1, need: need, have: len[i] });
      }
      // The free length of the lines goes to the arcs. This makes the radii as large as possible.
      for (let i = 1; i < n; i++) {
        const c = cor[i];
        if (!c.active || !isFinite(c.tMin)) continue;
        const free = (leg, other) => Math.max(0, len[leg] - c.tMin - tMinAt(other)) * (activeAt(other) ? 0.5 : 1);
        let t = c.tMin + Math.min(free(i - 1, i - 1), free(i, i + 1));
        t = Math.max(Math.min(t, o.rMax * Math.tan(c.half)), c.tMin);
        const ux = Math.cos(th[i - 1]), uy = Math.sin(th[i - 1]), sign = c.dl > 0 ? 1 : -1, R = t / Math.tan(c.half);
        arcs[idx[i]] = { R: R, t: t, delta: c.dl };
        const A = { x: Q[i].x - t * ux, y: Q[i].y - t * uy };                   // The start of the arc.
        const C = { x: A.x - sign * R * uy, y: A.y + sign * R * ux };           // The center of the arc.
        line(A);
        const phi0 = Math.atan2(A.y - C.y, A.x - C.x), m = Math.max(1, Math.ceil(R * Math.abs(c.dl) / o.step));
        for (let q = 1; q <= m; q++) {
          const phi = phi0 + c.dl * q / m;
          path.push({ x: C.x + R * Math.cos(phi), y: C.y + R * Math.sin(phi) });
        }
      }
      line(Q[n]);
      pose = { x: Q[n].x, y: Q[n].y, h: th[n - 1] };
    };

    let j = 1;
    while (j < P.length) {
      if (P[j].t === 'arc') { doArc(j); j++; continue; }
      if (P[j].t === 'turn') { doTurn(j); j++; continue; }
      let k = j;
      while (k + 1 < P.length && P[k + 1].t === 'line') k++;
      doRun(j, k);
      j = k + 1;
    }
    if (opt && opt.checkOnly) return { fail: fail, lastArc: lastArc, arcs: arcs, ends: ends, end: pose };
    const smp = Sim.run(path, v);
    let maxD = 0;
    for (const q of smp) maxD = Math.max(maxD, Math.abs(q.d));
    if (!fail && maxD > o.dMax + 0.01) fail = { kind: 'steer', maxD: maxD };
    return { smp: smp, fail: fail, lastArc: lastArc, arcs: arcs, ends: ends, end: pose };
  };

  /* Make a turn for the end of a route. This is the "turn by angle" of the driving style 1.
   * It is the same as a turn template of the RBSV: the vehicle drives an arc with a radius and a change
   * of direction. A turn with 200 gon is a turn around in one movement.
   * P = the points of the existing route (in meters, with the types as for Sim.buildRoute).
   * side = +1 or -1 (the turn direction). sweepAbs = the change of direction in radians (more than 0).
   * Rreq = the radius in meters, or 0 (use the minimum turning circle).
   * The radius is never smaller than the minimum turning circle. If the steering would be more than the limit,
   * the function makes the radius larger.
   * Return { el, clamped, run }: the new part of the route, a flag, and the route that Sim.buildRoute makes for it. */
  Sim.makeTurn = function (P, side, sweepAbs, Rreq, v, o) {
    let R = Rreq > 0 ? Rreq : o.rFront, clamped = false, grown = false;
    if (R < o.rFront) { R = o.rFront; clamped = true; }
    let el, run;
    for (let k = 0; k < 40; k++) {
      el = { t: 'turn', sweep: side * sweepAbs, R: Rreq > 0 || grown ? R : 0 };
      run = Sim.buildRoute(P.concat([el]), v, o);
      if (!run.fail) break;
      R *= 1.05; clamped = true; grown = true;           // The steering is more than the limit. Make the radius larger.
    }
    return { el: el, clamped: clamped, run: run };
  };

  /* Limit a new point M. The vehicle must be able to drive the route to M.
   * P = the points of the existing route (in meters, with the types as for Sim.buildRoute).
   * mode = the type of the new part: 'line' or 'arc'.
   * If the vehicle cannot drive to M, the function moves M to the nearest point that is possible:
   *   'line' after a line: The turn at the last point needs a minimum length of the line before it.
   *          This length limits the angle of the turn.
   *          The line after the turn needs a minimum length too.
   *          The function turns the direction toward the straight line and makes the distance longer.
   *   'line' after an arc: The vehicle goes straight on.
   *          The function moves M onto the end direction of the arc.
   *   'arc': The radius cannot be smaller than the minimum turning circle.
   *          The function moves M away along its direction until the arc is large enough.
   *          If the direction is right behind the vehicle, the function turns it a little.
   * Return { pt, clamped, run }. These are the new point, a flag, and the route that Sim.buildRoute makes for it. */
  Sim.limitTarget = function (P, M, mode, v, o) {
    const make = (pt) => Sim.buildRoute(P.concat([{ x: pt.x, y: pt.y, t: mode }]), v, o);
    const base = Sim.buildRoute(P, v, o, { checkOnly: true });
    const V = base.end;                                              // The end of the guide line: position and direction.
    const at = (i) => base.ends[i] || P[i];                          // The position of the end of part i.
    const dx = M.x - V.x, dy = M.y - V.y, dist = hyp(dx, dy);
    let clamped = false, pt, run;
    if (mode === 'arc') {
      let alpha = dist < 1e-6 ? 0 : normAngle(Math.atan2(dy, dx) - V.h);
      const aMax = Math.PI - 0.1;
      if (Math.abs(alpha) > aMax) { alpha = (alpha < 0 ? -1 : 1) * aMax; clamped = true; }
      let c = dist;
      for (let k = 0; k < 40; k++) {
        const cMin = 2 * o.rFront * Math.abs(Math.sin(alpha)) * 1.0001 + 1e-4;     // The chord of the smallest arc.
        if (c < cMin) { c = cMin; clamped = true; }
        pt = { x: V.x + c * Math.cos(V.h + alpha), y: V.y + c * Math.sin(V.h + alpha) };
        run = make(pt);
        if (!run.fail) break;
        c *= 1.05; clamped = true;                    // The steering is more than the limit. Make the arc larger.
      }
      return { pt: pt, clamped: clamped, run: run };
    }
    if (P.length >= 3 && (P[P.length - 1].t === 'arc' || P[P.length - 1].t === 'turn')) {
      const ux = Math.cos(V.h), uy = Math.sin(V.h), along = dx * ux + dy * uy;
      if (along < 0 || Math.abs(-dx * uy + dy * ux) > 0.02) clamped = true;
      const l = Math.max(0, along);
      pt = { x: V.x + l * ux, y: V.y + l * uy };
      return { pt: pt, clamped: clamped, run: make(pt) };
    }
    const U = at(P.length - 2), thIn = V.h, lenIn = hyp(V.x - U.x, V.y - U.y);
    let free = lenIn;                                  // The free length of the line before V.
    if (P.length >= 3 && P[P.length - 2].t !== 'arc' && P[P.length - 2].t !== 'turn') {      // There is a corner at U. It needs a part of the line.
      const W = at(P.length - 3), dlU = normAngle(thIn - Math.atan2(U.y - W.y, U.x - W.x));
      if (Math.PI - Math.abs(dlU) < 0.02) free = -Infinity;
      else if (Math.abs(dlU) >= 1e-3) free -= o.rFront * Math.tan(Math.abs(dlU) / 2);
    }
    let dl = dist < 1e-6 ? 0 : normAngle(Math.atan2(dy, dx) - thIn);
    const dlMax = free > 0 ? Math.min(2 * Math.atan(free / o.rFront), Math.PI - 0.03) : 0;
    if (Math.abs(dl) > dlMax) { dl = (dl < 0 ? -1 : 1) * dlMax; clamped = true; }
    for (let k = 0; k < 60; k++) {
      const need = Math.abs(dl) >= 1e-3 ? o.rFront * Math.tan(Math.abs(dl) / 2) * 1.0001 + 1e-4 : 0;
      let d2 = dist;
      if (d2 < need) { d2 = need; clamped = true; }
      pt = { x: V.x + d2 * Math.cos(thIn + dl), y: V.y + d2 * Math.sin(thIn + dl) };
      run = make(pt);
      if (!run.fail || Math.abs(dl) < 1e-3) break;
      dl *= 0.93; clamped = true;                      // The steering is more than the limit. Make the turn smaller.
    }
    return { pt: pt, clamped: clamped, run: run };
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

  /* Calculate the scale (meters per unit u). The inputs are a polyline in unit u and its real length in meters. */
  Sim.scaleFromPolyline = function (pts, meters) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += hyp(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L > 0 ? meters / L : null;
  };

  Sim.selfTest = function () {
    const v = Sim.DEFAULT_VEHICLE, res = [];
    const add = (name, ok, detail) => res.push({ name: name, ok: !!ok, detail: detail });
    const lim = Sim.steerLimit(v);
    add('Lenkwinkel aus Wendekreis berechenbar', lim, lim ? 'δmax = ' + Sim.gon(lim.delta).toFixed(1) + ' gon, R Hinterachse = ' + lim.rRear.toFixed(2) + ' m' : '');

    // Circle test. The front axle drives on the radius rFront. In steady state, the rear axle is on the radius rRear.
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
    add('Vollausschlag: Lenkwinkel stationär = δmax', Math.abs(dMax - lim.delta) < 0.005, Sim.gon(dMax).toFixed(2) + ' gon');

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
    add('Fahrweise 1: 100-gon-Ecke fahrbar, Ziel auf 1 mm genau', !corner.fail && hyp(cEnd.Fx - 20, cEnd.Fy - 20) < 0.001,
      (hyp(cEnd.Fx - 20, cEnd.Fy - 20) * 1000).toFixed(2) + ' mm');

    // The guide line has no kink. The change of direction per step is small everywhere.
    // The radius is never smaller than the minimum radius of the front axle.
    let maxTurn = 0, minR = Infinity;
    const gl = front(corner.smp);
    for (let i = 2; i < gl.length; i++) {
      const a = Math.atan2(gl[i - 1].y - gl[i - 2].y, gl[i - 1].x - gl[i - 2].x), b = Math.atan2(gl[i].y - gl[i - 1].y, gl[i].x - gl[i - 1].x);
      const dth = Math.abs(normAngle(b - a)), ds = hyp(gl[i].x - gl[i - 1].x, gl[i].y - gl[i - 1].y);
      maxTurn = Math.max(maxTurn, dth);
      if (dth > 1e-6) minR = Math.min(minR, ds / dth);
    }
    add('Fahrweise 1: Leitlinie ohne Knick', maxTurn < 0.02, 'max. Richtungsänderung ' + Sim.gon(maxTurn).toFixed(2) + ' gon pro 5 cm');
    add('Fahrweise 1: Radius nie unter Mindestradius', minR >= o.rFront - 0.01, 'kleinster Radius ' + minR.toFixed(2) + ' m, Grenze ' + o.rFront.toFixed(2) + ' m');

    const near = Sim.buildRoute([pt(0, 0), pt(20, 0), pt(20, 20)], v, o), far = Sim.buildRoute([pt(0, 0), pt(60, 0), pt(60, 60)], v, o);
    add('Fahrweise 1: je weiter die Punkte, desto größer die Kurve', far.arcs[1].R > near.arcs[1].R * 2 && near.arcs[1].R > o.rFront,
      'R = ' + near.arcs[1].R.toFixed(1) + ' m bei 20 m, ' + far.arcs[1].R.toFixed(1) + ' m bei 60 m');
    const tight = Sim.buildRoute([pt(0, 0), pt(3, 0), pt(3, 3)], v, o);
    add('Fahrweise 1: zu kurze Strecken werden erkannt', tight.fail && tight.fail.kind === 'length',
      tight.fail && tight.fail.need ? 'nötig ' + tight.fail.need.toFixed(1) + ' m, vorhanden ' + tight.fail.have.toFixed(1) + ' m' : '');

    // Smallest possible curve. The lines have only the length that the minimum radius needs.
    const small = Sim.buildRoute([pt(0, 0), pt(o.rFront + 0.001, 0), pt(o.rFront + 0.001, o.rFront + 0.001)], v, o);
    let smallD = 0, smallOuter = 0;
    small.smp.forEach((q) => { smallD = Math.max(smallD, Math.abs(q.d)); for (const k of Sim.bodyPoly(q, v)) smallOuter = Math.max(smallOuter, hyp(k.x - (o.rFront + 0.001 - 0), k.y - 0)); });
    add('Fahrweise 1: kleinste Kurve fahrbar, Lenkwinkel nicht über dem Limit', !small.fail && smallD <= o.dMax + 0.01,
      Sim.gon(smallD).toFixed(1) + ' gon von ' + Sim.gon(o.dMax).toFixed(1) + ' gon');

    const multi = Sim.buildRoute([pt(0, 0), pt(20, 0), pt(40, 15), pt(45, 40), pt(20, 60), pt(20, 90)], v, o);
    let worstD = 0, jump = 0;
    multi.smp.forEach((q, i) => {
      worstD = Math.max(worstD, Math.abs(q.d));
      if (i) jump = Math.max(jump, hyp(q.Rx - multi.smp[i - 1].Rx, q.Ry - multi.smp[i - 1].Ry));
    });
    add('Fahrweise 1: Mehrfach-Route fahrbar', !multi.fail, multi.fail ? 'Fehler: ' + multi.fail.kind : '');
    add('Fahrweise 1: Lenkwinkel nie über Limit', worstD <= o.dMax + 0.01, Sim.gon(worstD).toFixed(2) + ' gon');
    add('Fahrweise 1: Weg ohne Sprünge', jump < 0.0501, 'max. Schritt ' + (jump * 1000).toFixed(1) + ' mm');
    // Two arcs in opposite directions, one after the other. The steering stays in the limit.
    const zig = Sim.buildRoute([pt(0, 0), pt(12, 0), pt(12 + 8.5, 8.5), pt(12 + 8.5 + 12, 8.5)], v, o);
    let zigD = 0;
    zig.smp.forEach((q) => { zigD = Math.max(zigD, Math.abs(q.d)); });
    add('Fahrweise 1: S-Kurve, Lenkwinkel im Limit', !zig.fail && zigD <= o.dMax + 0.01, Sim.gon(zigD).toFixed(1) + ' gon');

    // Smallest curve. The guide line has the minimum radius. The body stays inside the turning circle.
    // The center of the arc is at (0, rFront). The outer body corner is on the right side of the vehicle.
    let minRG = Infinity, outer = 0;
    const g2 = front(small.smp);
    for (let i = 2; i < g2.length; i++) {
      const a = Math.atan2(g2[i - 1].y - g2[i - 2].y, g2[i - 1].x - g2[i - 2].x), b = Math.atan2(g2[i].y - g2[i - 1].y, g2[i].x - g2[i - 1].x);
      const dth = Math.abs(normAngle(b - a));
      if (dth > 1e-6) minRG = Math.min(minRG, hyp(g2[i].x - g2[i - 1].x, g2[i].y - g2[i - 1].y) / dth);
    }
    // Count only the samples in the turn. Before the turn, the vehicle is on the straight line.
    for (const q of small.smp) if (q.th > 0.5) for (const k of Sim.bodyPoly(q, v)) outer = Math.max(outer, hyp(k.x - 0, k.y - (o.rFront + 0.001)));
    add('Fahrweise 1: kleinste Kurve hat den Mindestradius ' + o.rFront.toFixed(2) + ' m', Math.abs(minRG - o.rFront) < 0.02, 'gemessen ' + minRG.toFixed(2) + ' m');
    add('Fahrweise 1: Karosserie bleibt innerhalb des Wendekreises ' + v.rOuter + ' m', outer <= v.rOuter + 0.02 && outer > 5, 'größter Abstand ' + outer.toFixed(2) + ' m');
    // Limited points. Each point that the user sets gives a route that the vehicle can drive.
    // The test uses both vehicles and many points around a route with two lines.
    let badLimit = 0, clampedN = 0, total = 0, seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const veh2 of Sim.PRESETS) {
      const o2 = Sim.driveOpts(veh2), base = [pt(0, 0), pt(40, 0), pt(60, 25)];
      for (let k = 0; k < 150; k++) {
        const r = Sim.limitTarget(base, pt(rnd() * 200 - 60, rnd() * 200 - 100), 'line', veh2, o2);
        total++; if (r.clamped) clampedN++;
        if (r.run.fail) badLimit++;
      }
    }
    add('Zielpunkt-Begrenzung (Gerade): jeder Punkt ergibt eine fahrbare Route', badLimit === 0, total + ' Punkte, davon ' + clampedN + ' begrenzt, ' + badLimit + ' nicht fahrbar');
    const lkw = Sim.PRESETS[1], oL = Sim.driveOpts(lkw), limL = Sim.steerLimit(lkw);
    add('LKW: Wendekreis passt zu den Maßen', !!limL, limL ? 'δmax = ' + Sim.gon(limL.delta).toFixed(1) + ' gon, R Vorderachse = ' + limL.rFront.toFixed(2) + ' m' : '');
    const lkwRoute = Sim.buildRoute([pt(0, 0), pt(40, 0), pt(40, 40)], lkw, oL);
    let lD = 0;
    lkwRoute.smp.forEach((q) => { lD = Math.max(lD, Math.abs(q.d)); });
    add('LKW: 100-gon-Ecke fahrbar, Lenkwinkel im Limit', !lkwRoute.fail && lD <= oL.dMax + 0.01, Sim.gon(lD).toFixed(1) + ' gon');

    // Turn around in one movement. Use an arc through a point at the end of a line.
    // The point is on the other side of the road. The arc is a half circle (200 gon).
    const arcPt = (x, y) => ({ x: x, y: y, t: 'arc' });
    const uturn = Sim.buildRoute([pt(0, 0), pt(20, 0), arcPt(20, 10)], v, o);
    const uEnd = uturn.smp[uturn.smp.length - 1];
    // At the end, the guide line has the direction 200 gon.
    // The vehicle direction is a little behind. The wheelbase causes this.
    add('Wende: Halbkreis (200 gon) in einem Zug, Ziel auf 1 mm genau', !uturn.fail && hyp(uEnd.Fx - 20, uEnd.Fy - 10) < 0.001 &&
      Math.abs(Math.abs(normAngle(uturn.end.h)) - Math.PI) < 1e-6, 'R = ' + (uturn.lastArc ? uturn.lastArc.R.toFixed(2) : '–') + ' m, Drehung ' + (uturn.lastArc ? Sim.gon(uturn.lastArc.delta).toFixed(1) : '–') + ' gon');
    const uGl = front(uturn.smp);
    let uTurn = 0, uMinR = Infinity;
    for (let i = 2; i < uGl.length; i++) {
      const a = Math.atan2(uGl[i - 1].y - uGl[i - 2].y, uGl[i - 1].x - uGl[i - 2].x), b = Math.atan2(uGl[i].y - uGl[i - 1].y, uGl[i].x - uGl[i - 1].x);
      const dth = Math.abs(normAngle(b - a));
      uTurn = Math.max(uTurn, dth);
      if (dth > 1e-6) uMinR = Math.min(uMinR, hyp(uGl[i].x - uGl[i - 1].x, uGl[i].y - uGl[i - 1].y) / dth);
    }
    add('Wende: Leitlinie ohne Knick, Radius nicht unter Mindestradius', uTurn < 0.02 && uMinR >= o.rFront - 0.01, 'kleinster Radius ' + uMinR.toFixed(2) + ' m');
    // A line after the arc goes straight on in the end direction of the arc.
    const back = Sim.buildRoute([pt(0, 0), pt(20, 0), arcPt(20, 10), pt(0, 10)], v, o);
    const bEnd = back.smp[back.smp.length - 1];
    add('Wende: Gerade nach dem Bogen läuft tangential weiter', !back.fail && hyp(bEnd.Fx - 0, bEnd.Fy - 10) < 0.001, 'Ende bei (' + bEnd.Fx.toFixed(2) + '; ' + bEnd.Fy.toFixed(2) + ')');
    // The arc is too small. The point is inside the minimum turning circle.
    const tiny = Sim.buildRoute([pt(0, 0), pt(20, 0), arcPt(20, 6)], v, o);
    add('Wende: zu enger Bogen (Punkt im Wendekreis) wird erkannt', !!tiny.fail && tiny.fail.kind === 'radius',
      tiny.fail && tiny.fail.R ? 'R = ' + tiny.fail.R.toFixed(2) + ' m < ' + tiny.fail.rMin.toFixed(2) + ' m' : '');
    // More than 200 gon. The point is behind the vehicle and to the side.
    const loop = Sim.buildRoute([pt(0, 0), pt(20, 0), arcPt(10, 12)], v, o);
    add('Wende: mehr als 200 gon in einem Zug', !loop.fail && loop.lastArc && Math.abs(loop.lastArc.delta) > Math.PI, loop.lastArc ? 'Drehung ' + Sim.gon(loop.lastArc.delta).toFixed(1) + ' gon' : '');

    // Turn by angle (the turn template of the RBSV, the corner path of AutoTURN).
    // A turn with 200 gon is a turn around in one movement. The radius is the minimum turning circle.
    for (const veh2 of Sim.PRESETS) {
      const o2 = Sim.driveOpts(veh2);
      const t200 = Sim.makeTurn([pt(0, 0), pt(20, 0)], 1, Math.PI, 0, veh2, o2), e2 = t200.run.end;
      add(veh2.name + ': Wende mit 200 gon in einem Zug, Endpunkt auf 1 mm genau',
        !t200.run.fail && hyp(e2.x - 20, e2.y - 2 * o2.rFront) < 0.001 && Math.abs(e2.h - Math.PI) < 1e-6,
        'Querversatz 2R = ' + (2 * o2.rFront).toFixed(2) + ' m');
      // The center of the arc is at (20, rFront). In the middle of the turn, the outer front corner is on the turning circle.
      let outerT = 0, dT = 0;
      for (const q of t200.run.smp) {
        dT = Math.max(dT, Math.abs(q.d));
        if (q.th > 1.3 && q.th < 2.0) for (const k of Sim.bodyPoly(q, veh2)) outerT = Math.max(outerT, hyp(k.x - 20, k.y - o2.rFront));
      }
      add(veh2.name + ': Wende mit 200 gon, Außenradius = Wendekreis ' + veh2.rOuter + ' m, Lenkung am Anschlag',
        Math.abs(outerT - veh2.rOuter) < 0.03 && dT <= o2.dMax + 0.01 && dT >= o2.dMax - 0.03,
        'gemessen ' + outerT.toFixed(2) + ' m, Lenkwinkel ' + Sim.gon(dT).toFixed(1) + ' gon');
    }
    // A radius that is smaller than the minimum turning circle is not possible. The function makes it equal to the minimum.
    const tSmall = Sim.makeTurn([pt(0, 0), pt(20, 0)], -1, Math.PI / 2, 2, v, o);
    add('Kurve nach Winkel: ein Radius unter dem Wendekreis wird auf den Mindestradius begrenzt',
      tSmall.clamped && !tSmall.run.fail && tSmall.run.lastArc.R >= o.rFront - 1e-9, 'R = ' + tSmall.run.lastArc.R.toFixed(2) + ' m');
    // Random turns: both vehicles, 40 to 390 gon, both sides, minimum radius or a larger radius, with other parts before and after.
    let badT = 0, jumpT = 0, totalT = 0;
    for (const veh2 of Sim.PRESETS) {
      const o2 = Sim.driveOpts(veh2);
      for (let r = 0; r < 40; r++) {
        let route = [pt(0, 0), pt(15 + rnd() * 30, 0)];
        if (rnd() < 0.5) {           // Sometimes there is a corner or an arc before the turn.
          const e0 = Sim.buildRoute(route, veh2, o2, { checkOnly: true }).end;
          const firstMode = rnd() < 0.5 ? 'arc' : 'line';
          const first = Sim.limitTarget(route, pt(e0.x + rnd() * 80 - 20, e0.y + rnd() * 80 - 40), firstMode, veh2, o2);
          route = route.concat([{ x: first.pt.x, y: first.pt.y, t: firstMode }]);
        }
        const sweep = (40 + rnd() * 350) * Math.PI / 200, side = rnd() < 0.5 ? 1 : -1;
        const tt = Sim.makeTurn(route, side, sweep, rnd() < 0.5 ? 0 : o2.rFront * (0.5 + rnd() * 3), veh2, o2);
        const e1 = tt.run.end, after = Sim.buildRoute(route.concat([tt.el, pt(e1.x + 15 * Math.cos(e1.h) + 3, e1.y + 15 * Math.sin(e1.h))]), veh2, o2);
        totalT++;
        if (tt.run.fail || after.fail || tt.run.lastArc.R < o2.rFront - 1e-9) badT++;
        let m = 0, hmax = 0;
        for (let i = 1; i < after.smp.length; i++) {
          m = Math.max(m, hyp(after.smp[i].Rx - after.smp[i - 1].Rx, after.smp[i].Ry - after.smp[i - 1].Ry));
          hmax = Math.max(hmax, Math.abs(normAngle(after.smp[i].th - after.smp[i - 1].th)));
        }
        if (m > 0.0502 || hmax > 0.06) jumpT++;
      }
    }
    add('Kurve nach Winkel (40 bis 390 gon, beide Seiten, beide Fahrzeuge): alle Routen fahrbar, ohne Sprünge', badT === 0 && jumpT === 0,
      totalT + ' Kurven, ' + badT + ' nicht fahrbar, ' + jumpT + ' Sprünge');

    // Limited points of both kinds in random order. The vehicle can drive each route, and the route has no jumps.
    let badMix = 0, jumpMix = 0, clampMix = 0, totalMix = 0, bigTurn = 0;
    for (const veh2 of Sim.PRESETS) {
      const o2 = Sim.driveOpts(veh2);
      for (let r = 0; r < 25; r++) {
        let route = [pt(0, 0), pt(15 + rnd() * 30, 0)];
        for (let s = 0; s < 6; s++) {
          const mode = rnd() < 0.5 ? 'arc' : 'line';
          const e = Sim.buildRoute(route, veh2, o2, { checkOnly: true }).end;
          const target = pt(e.x + rnd() * 120 - 60, e.y + rnd() * 120 - 60);
          const lt = Sim.limitTarget(route, target, mode, veh2, o2);
          totalMix++; if (lt.clamped) clampMix++;
          if (lt.run.fail) badMix++;
          let m = 0, hmax = 0;
          for (let i = 1; i < lt.run.smp.length; i++) {
            m = Math.max(m, hyp(lt.run.smp[i].Rx - lt.run.smp[i - 1].Rx, lt.run.smp[i].Ry - lt.run.smp[i - 1].Ry));
            hmax = Math.max(hmax, Math.abs(normAngle(lt.run.smp[i].th - lt.run.smp[i - 1].th)));
          }
          if (m > 0.0502 || hmax > 0.06) jumpMix++;
          if (lt.run.lastArc && Math.abs(lt.run.lastArc.delta) > Math.PI) bigTurn++;
          route = route.concat([{ x: lt.pt.x, y: lt.pt.y, t: mode }]);
        }
      }
    }
    add('Zielpunkt-Begrenzung (Gerade und Bogen gemischt): alle Routen fahrbar, ohne Sprünge', badMix === 0 && jumpMix === 0,
      totalMix + ' Punkte, davon ' + clampMix + ' begrenzt, ' + bigTurn + ' Wenden über 200 gon, ' + badMix + ' nicht fahrbar, ' + jumpMix + ' Sprünge');
    return res;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
  else root.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
