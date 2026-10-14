/*
 * Rigid plates on the sphere.
 *
 * Each plate keeps its own crust map in its own frame (same grid, rotated by the
 * plate's accumulated rotation q). Every tick the plates rotate about their Euler
 * poles; each global cell then asks the nearby plates "what crust do you have
 * here now?" Where two plates answer, they collide: oceanic crust subducts under
 * continental (raising a volcanic arc), older ocean subducts under younger, and
 * continent against continent stacks into mountains. Where nobody answers, the
 * plates have pulled apart and new ocean floor is made at a ridge.
 *
 * Shapes are preserved because a plate's crust never moves within its own frame;
 * only the lookup rotates. Plates occasionally rift in two, and plates whose
 * continents keep colliding eventually weld together.
 */
(function (SE) {
  'use strict';
  const { sin, cos, DEG, clamp } = SE.math;
  const MAX_PLATES = 20;
  const MAX_OMEGA = 1.3 * DEG; // rad per My

  function qmul(a, b) {
    return [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
    ];
  }
  function qnorm(q) { const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]); return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
  function qaxis(w, dt) {
    const ang = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]) * dt;
    if (ang < 1e-12) return [1, 0, 0, 0];
    const s = sin(ang / 2) / (ang / dt);
    return [cos(ang / 2), w[0] * s, w[1] * s, w[2] * s];
  }
  // Rotation matrix (row-major) of q; the transpose is the inverse.
  function qmat(q) {
    const [w, x, y, z] = q;
    return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm3(a) { const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  class Tectonics {
    constructor(grid, rng) {
      this.grid = grid;
      this.rng = rng;
      const n = grid.n;
      this.owner = new Int8Array(n);
      this.loc = new Int32Array(n);
      this.ctype = new Int8Array(n);
      this.elev = new Float32Array(n);
      this.age = new Float32Array(n);
      this.plates = [];
      this.hotspotCells = [];
      this.nextName = 0;
    }

    initPresent(pd) {
      const n = this.grid.n;
      SE.earth.PLATES.forEach((P, i) => {
        const v = SE.earth.vec(P.pole[0], P.pole[1]);
        const r = P.pole[2] * DEG;
        this.plates.push(this.newPlate(P.name, [1, 0, 0, 0], [v[0] * r, v[1] * r, v[2] * r]));
      });
      for (let g = 0; g < n; g++) {
        const p = this.plates[pd.plate[g]];
        p.ctype[g] = pd.ctype[g]; p.elev[g] = pd.elev[g]; p.age[g] = pd.age[g];
        this.owner[g] = pd.plate[g]; this.loc[g] = g;
        this.ctype[g] = pd.ctype[g]; this.elev[g] = pd.elev[g]; this.age[g] = pd.age[g];
      }
      for (const [la, lo] of SE.earth.HOTSPOTS) {
        const v = SE.earth.vec(la, lo);
        this.hotspotCells.push(this.grid.nearestAny(v[0], v[1], v[2]));
      }
    }

    newPlate(name, q, omega) {
      const n = this.grid.n;
      const cache = new Int32Array(n);
      for (let i = 0; i < n; i++) cache[i] = i;
      return { name, active: true, q, omega, ctype: new Int8Array(n), elev: new Float32Array(n), age: new Float32Array(n), cache, collide: {} };
    }

    /** Advance dt My. Returns notable tectonic events. */
    step(dt, t) {
      const grid = this.grid, n = grid.n, pos = grid.pos, plates = this.plates, rng = this.rng;
      const events = [];
      const mats = [];
      for (let pi = 0; pi < plates.length; pi++) {
        const P = plates[pi];
        if (!P.active) { mats.push(null); continue; }
        P.q = qnorm(qmul(qaxis(P.omega, dt), P.q));
        mats.push(qmat(P.q));
        const ct = P.ctype, ag = P.age;
        for (let i = 0; i < n; i++) if (ct[i]) ag[i] += dt;
      }
      const prev = this.owner.slice(), prevC = this.ctype.slice(), prevE = this.elev.slice();
      const owner = this.owner, loc = this.loc, ctype = this.ctype, elev = this.elev, age = this.age;
      const cand = new Int32Array(8), candL = new Int32Array(8);
      const as = grid.adjStart, adj = grid.adj;
      for (let g = 0; g < n; g++) {
        // Candidate plates: whoever owned this cell or its neighbours last tick.
        let nc = 0;
        const addC = (p) => { for (let k = 0; k < nc; k++) if (cand[k] === p) return; if (plates[p].active) cand[nc++] = p; };
        addC(prev[g]);
        for (let k = as[g]; k < as[g + 1]; k++) addC(prev[adj[k]]);
        const x = pos[g * 3], y = pos[g * 3 + 1], z = pos[g * 3 + 2];
        let win = -1, winL = -1;
        let nPresent = 0;
        for (let k = 0; k < nc; k++) {
          const p = cand[k], M = mats[p], P = plates[p];
          // Global -> plate frame: multiply by the transpose.
          const lx = M[0] * x + M[3] * y + M[6] * z, ly = M[1] * x + M[4] * y + M[7] * z, lz = M[2] * x + M[5] * y + M[8] * z;
          const l = grid.nearest(lx, ly, lz, P.cache[g]);
          P.cache[g] = l;
          candL[k] = l;
          if (!P.ctype[l]) continue;
          nPresent++;
          if (win < 0) { win = p; winL = l; continue; }
          const W = plates[win];
          const wc = W.ctype[winL], cc = P.ctype[l];
          let challengerWins;
          if (cc !== wc) challengerWins = cc === 2;
          else if (cc === 2) challengerWins = p === prev[g] && win !== prev[g];
          else challengerWins = P.age[l] < W.age[winL];
          let loserP, loserL, winnerP, winnerL;
          if (challengerWins) { loserP = win; loserL = winL; winnerP = p; winnerL = l; win = p; winL = l; }
          else { loserP = p; loserL = l; winnerP = win; winnerL = winL; }
          const Lp = plates[loserP], Wp = plates[winnerP];
          if (Lp.ctype[loserL] === 2 && Wp.ctype[winnerL] === 2) {
            // Continental collision: crust stacks, mountains rise.
            Wp.elev[winnerL] = Math.min(7500, Math.max(Wp.elev[winnerL], Lp.elev[loserL]) + 280 * dt);
            Wp.collide[loserP] = (Wp.collide[loserP] || 0) + 1;
          } else if (Wp.ctype[winnerL] === 2) {
            // Ocean dives under a continent: volcanic arc.
            if (Wp.elev[winnerL] < 4500) Wp.elev[winnerL] += 90 * dt;
          } else {
            // Ocean under ocean: island arc.
            Wp.elev[winnerL] += 70 * dt;
          }
          Lp.ctype[loserL] = 0;
        }
        if (win < 0) {
          // Gap: the plates pulled apart here. New ocean floor at a ridge.
          let p = prev[g], pk = -1;
          for (let k = 0; k < nc; k++) if (cand[k] === p) pk = k;
          if (pk < 0 && nc > 0) { pk = 0; p = cand[0]; }
          if (nc === 0) p = this.firstActive();
          const P = plates[p];
          const l = pk >= 0 ? candL[pk] : grid.nearestAny(x, y, z);
          // A hole inside one plate is a resampling artefact, not a rift: heal it
          // from the neighbours. Only gaps between plates open new ocean.
          let cc = 0, ce = 0, cn = 0;
          if (nc === 1) for (let k = as[g]; k < as[g + 1]; k++) { const j = adj[k]; cn++; if (prevC[j] === 2) { cc++; ce += prevE[j]; } }
          if (nc === 1 && cc * 2 > cn) { P.ctype[l] = 2; P.age[l] = 100; P.elev[l] = ce / cc; }
          else if (nc === 1 && prevC[g] === 1) { P.ctype[l] = 1; P.age[l] = 50; P.elev[l] = prevE[g]; }
          else { P.ctype[l] = 1; P.age[l] = 0; P.elev[l] = SE.earth.oceanDepth(0); }
          win = p; winL = l;
        }
        owner[g] = win; loc[g] = winL;
        const W = plates[win];
        ctype[g] = W.ctype[winL]; elev[g] = W.elev[winL]; age[g] = W.age[winL];
      }

      // Surface processes on the global map.
      const e2 = elev.slice();
      for (let g = 0; g < n; g++) {
        if (ctype[g] === 1) {
          const a = age[g];
          e2[g] = elev[g] + (SE.earth.oceanDepth(a) - SE.earth.oceanDepth(Math.max(0, a - dt)));
          if (elev[g] > -1500) e2[g] -= 40 * dt; // seamounts and arcs erode and sink
        } else {
          let s = 0, c = 0;
          for (let k = as[g]; k < as[g + 1]; k++) { const j = adj[k]; if (ctype[j] === 2) { s += elev[j]; c++; } }
          let e = elev[g];
          if (c) e += 0.12 * dt * (s / c - e);
          if (e > 300) e += (300 - e) * 0.022 * dt;
          else if (e < -200) e += (-200 - e) * 0.05 * dt; // drowned margins silt up
          e2[g] = e;
        }
      }
      for (const h of this.hotspotCells) {
        e2[h] = Math.min(e2[h] + 600 * dt, ctype[h] === 2 ? 3500 : 1800);
        if (ctype[h] === 1 && e2[h] > 0) ctype[h] = 2;
      }
      for (let g = 0; g < n; g++) {
        // Island arcs that reach the surface become new continental crust.
        if (ctype[g] === 1 && e2[g] > 50 && age[g] > 2) ctype[g] = 2;
        elev[g] = e2[g];
        const P = plates[owner[g]], l = loc[g];
        P.elev[l] = e2[g]; P.ctype[l] = ctype[g];
      }

      // Plate reorganisations, rifts and sutures.
      this.bookkeeping(dt, t, events);
      return events;
    }

    firstActive() { for (let i = 0; i < this.plates.length; i++) if (this.plates[i].active) return i; return 0; }

    plateStats() {
      const st = this.plates.map(() => ({ cells: 0, cont: 0, cx: 0, cy: 0, cz: 0 }));
      const pos = this.grid.pos;
      for (let g = 0; g < this.grid.n; g++) {
        const s = st[this.owner[g]]; s.cells++;
        if (this.ctype[g] === 2 && this.elev[g] > -200) { s.cont++; s.cx += pos[g * 3]; s.cy += pos[g * 3 + 1]; s.cz += pos[g * 3 + 2]; }
      }
      return st;
    }

    bookkeeping(dt, t, events) {
      const rng = this.rng, plates = this.plates;
      const st = this.plateStats();
      let nActive = 0;
      plates.forEach((P, i) => {
        if (!P.active) return;
        if (st[i].cells === 0) {
          P.active = false;
          events.push({ kind: 'vanish', title: 'A plate is consumed', text: `The last of the ${P.name} plate slid into the mantle. Its ocean floor is gone for good.` });
        } else nActive++;
      });
      // Sutures: continents that keep colliding weld into one plate.
      for (let a = 0; a < plates.length; a++) {
        const A = plates[a];
        if (!A.active) continue;
        for (const bk of Object.keys(A.collide)) {
          const b = +bk, B = plates[b];
          if (!B.active || b === a) continue;
          const total = (A.collide[b] || 0) + (B.collide[a] || 0);
          if (total > 70) {
            const big = st[a].cells >= st[b].cells ? a : b, small = big === a ? b : a;
            this.merge(big, small);
            nActive--;
            events.push({ kind: 'suture', title: 'Continents collide', text: `The ${plates[small].name} and ${plates[big].name} plates have welded together. A mountain belt marks the seam, and land animals can now walk between them.`, cell: this.centroidCell(st[small]) });
          }
        }
      }
      // Slow plate reorganisation.
      if (rng.chance(dt / 45)) {
        const k = 1 + rng.int(3);
        for (let i = 0; i < k; i++) {
          const p = this.randomActive();
          const P = plates[p];
          const d = [rng.normal(), rng.normal(), rng.normal()];
          const s = 0.25 * DEG;
          P.omega = this.capOmega([P.omega[0] + d[0] * s, P.omega[1] + d[1] * s, P.omega[2] + d[2] * s]);
        }
      }
      // Rifting: a big plate splits.
      const rate = nActive < 8 ? dt / 12 : nActive < 13 ? dt / 30 : nActive < MAX_PLATES - 1 ? dt / 70 : 0;
      if (rng.chance(rate)) {
        let total = 0;
        const w = st.map((s, i) => (plates[i].active ? s.cont * 2 + s.cells * 0.3 : 0) ** 1.5);
        for (const x of w) total += x;
        let r = rng.float() * total, p = 0;
        for (; p < w.length - 1; p++) { r -= w[p]; if (r <= 0) break; }
        if (plates[p].active && st[p].cells > 500) {
          const ev = this.rift(p, st[p]);
          if (ev) events.push(ev);
        }
      }
    }

    randomActive() {
      const act = [];
      this.plates.forEach((P, i) => { if (P.active) act.push(i); });
      return this.rng.pick(act);
    }

    capOmega(w) {
      const l = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]);
      if (l > MAX_OMEGA) return [w[0] * MAX_OMEGA / l, w[1] * MAX_OMEGA / l, w[2] * MAX_OMEGA / l];
      return w;
    }

    centroidCell(s) {
      if (!s.cont) return -1;
      const c = norm3([s.cx, s.cy, s.cz]);
      return this.grid.nearestAny(c[0], c[1], c[2]);
    }

    merge(big, small) {
      const B = this.plates[big], S = this.plates[small], grid = this.grid, pos = grid.pos;
      const M = qmat(B.q);
      for (let g = 0; g < grid.n; g++) {
        if (this.owner[g] !== small) continue;
        const x = pos[g * 3], y = pos[g * 3 + 1], z = pos[g * 3 + 2];
        const l = grid.nearest(M[0] * x + M[3] * y + M[6] * z, M[1] * x + M[4] * y + M[7] * z, M[2] * x + M[5] * y + M[8] * z, B.cache[g]);
        B.cache[g] = l;
        const sl = this.loc[g];
        if (!B.ctype[l] || S.ctype[sl] === 2) { B.ctype[l] = S.ctype[sl]; B.elev[l] = S.elev[sl]; B.age[l] = S.age[sl]; }
        this.owner[g] = big; this.loc[g] = l;
      }
      S.active = false;
      for (const P of this.plates) { delete P.collide[small]; }
      B.collide = {};
    }

    rift(p, s) {
      const rng = this.rng, plates = this.plates, grid = this.grid, pos = grid.pos;
      const P = plates[p];
      // Rift through the continental centroid (or the plate's middle).
      let c;
      if (s.cont > 50) c = norm3([s.cx, s.cy, s.cz]);
      else {
        let x = 0, y = 0, z = 0;
        for (let g = 0; g < grid.n; g++) if (this.owner[g] === p) { x += pos[g * 3]; y += pos[g * 3 + 1]; z += pos[g * 3 + 2]; }
        c = norm3([x, y, z]);
      }
      // Random plane through c and the planet's centre.
      const rnd = norm3([rng.normal(), rng.normal(), rng.normal()]);
      const nrm = norm3(cross(c, rnd));
      let slot = plates.findIndex(Q => !Q.active);
      if (slot < 0) { if (plates.length >= MAX_PLATES) return null; slot = plates.length; plates.push(null); }
      const dir = this.compass(c, nrm);
      const base = P.name.replace(/^(North|South|East|West|Northeast|Northwest|Southeast|Southwest) /, '');
      const Q = this.newPlate(`${dir} ${base}`, P.q.slice(), P.omega.slice());
      Q.cache.set(P.cache);
      plates[slot] = Q;
      let moved = 0, kept = 0;
      for (let g = 0; g < grid.n; g++) {
        if (this.owner[g] !== p) continue;
        const d = pos[g * 3] * nrm[0] + pos[g * 3 + 1] * nrm[1] + pos[g * 3 + 2] * nrm[2];
        if (d > 0) {
          const l = this.loc[g];
          Q.ctype[l] = P.ctype[l]; Q.elev[l] = P.elev[l]; Q.age[l] = P.age[l];
          P.ctype[l] = 0;
          this.owner[g] = slot; moved++;
        } else kept++;
      }
      if (moved < 80 || kept < 80) {
        // Too lopsided; undo.
        for (let g = 0; g < grid.n; g++) if (this.owner[g] === slot) { const l = this.loc[g]; P.ctype[l] = Q.ctype[l]; this.owner[g] = p; }
        Q.active = false;
        return null;
      }
      // Push the halves apart: rotation about c x n moves c along n.
      const ax = cross(c, nrm), sp = rng.range(0.35, 0.6) * DEG;
      Q.omega = this.capOmega([P.omega[0] + ax[0] * sp, P.omega[1] + ax[1] * sp, P.omega[2] + ax[2] * sp]);
      P.omega = this.capOmega([P.omega[0] - ax[0] * sp * 0.5, P.omega[1] - ax[1] * sp * 0.5, P.omega[2] - ax[2] * sp * 0.5]);
      const onLand = s.cont > 50;
      return {
        kind: 'rift', title: onLand ? 'A continent splits' : 'A plate breaks apart',
        text: onLand
          ? `A rift has opened through the ${P.name} plate. The ${Q.name} block is pulling away, and a new sea will flood the gap.`
          : `The ${P.name} plate has cracked along a new spreading ridge. The ${Q.name} plate now moves on its own.`,
        cell: grid.nearestAny(c[0], c[1], c[2]),
      };
    }

    compass(c, nrm) {
      // Which way the new half lies from the centroid, in words.
      const x = c[0], y = c[1];
      const l = Math.sqrt(x * x + y * y) || 1;
      const east = [-y / l, x / l, 0];
      const north = cross(c, east);
      const e = nrm[0] * east[0] + nrm[1] * east[1] + nrm[2] * east[2];
      const nn = nrm[0] * north[0] + nrm[1] * north[1] + nrm[2] * north[2];
      if (Math.abs(e) > Math.abs(nn) * 2) return e > 0 ? 'East' : 'West';
      if (Math.abs(nn) > Math.abs(e) * 2) return nn > 0 ? 'North' : 'South';
      return (nn > 0 ? 'North' : 'South') + (e > 0 ? 'east' : 'west');
    }

    serialize() {
      return {
        owner: this.owner.slice(), loc: this.loc.slice(), ctype: this.ctype.slice(), elev: this.elev.slice(), age: this.age.slice(),
        plates: this.plates.map(P => ({ name: P.name, active: P.active, q: P.q.slice(), omega: P.omega.slice(), ctype: P.ctype.slice(), elev: P.elev.slice(), age: P.age.slice(), cache: P.cache.slice(), collide: Object.assign({}, P.collide) })),
        rng: this.rng.state(),
      };
    }
    restore(s) {
      this.owner = s.owner.slice(); this.loc = s.loc.slice(); this.ctype = s.ctype.slice(); this.elev = s.elev.slice(); this.age = s.age.slice();
      this.plates = s.plates.map(P => ({ name: P.name, active: P.active, q: P.q.slice(), omega: P.omega.slice(), ctype: P.ctype.slice(), elev: P.elev.slice(), age: P.age.slice(), cache: P.cache.slice(), collide: Object.assign({}, P.collide) }));
      this.rng.setState(s.rng);
    }
  }

  SE.Tectonics = Tectonics;
})(globalThis.SE || (globalThis.SE = {}));
