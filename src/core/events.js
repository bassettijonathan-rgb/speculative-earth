/*
 * Random catastrophes: asteroid impacts, flood basalts (large igneous provinces)
 * and ice ages. Each one perturbs the climate for a few million years and may
 * trigger an extinction pulse. They are drawn from the seed, so the same seed
 * gets the same disasters.
 */
(function (SE) {
  'use strict';
  const { exp, clamp, DEG } = SE.math;

  function where(grid, cell) {
    const la = grid.lat[cell] / DEG, lo = grid.lon[cell] / DEG;
    return `${Math.abs(la).toFixed(0)}°${la >= 0 ? 'N' : 'S'}, ${Math.abs(lo).toFixed(0)}°${lo >= 0 ? 'E' : 'W'}`;
  }

  class Events {
    constructor(rng) {
      this.rng = rng;
      this.impacts = [];   // {t, cool}
      this.basalts = [];   // {t, mult}
      this.ice = null;     // {t0, len, depth}
      this.iceCooldown = 0;
    }

    anomaly(t) {
      let a = 0;
      for (const i of this.impacts) if (t >= i.t) a -= i.cool * exp(-(t - i.t) / 1.2);
      a += this.iceAnomaly(t);
      return a;
    }
    iceAnomaly(t) {
      const I = this.ice;
      if (!I || t < I.t0 || t > I.t0 + I.len) return 0;
      const x = (t - I.t0) / I.len;
      return -I.depth * Math.min(1, x * 4, (1 - x) * 3);
    }
    iceFactor(t) { const I = this.ice; return I ? clamp(-this.iceAnomaly(t) / 3, 0, 1) : 0; }
    co2Mult(t) {
      let m = 1;
      for (const b of this.basalts) if (t >= b.t) m *= 1 + (b.mult - 1) * exp(-(t - b.t) / 3);
      return m;
    }

    /** Roll for new events at time t (after the tick's geology). */
    step(t, dt, world) {
      const rng = this.rng, out = [];
      const grid = world.grid, tec = world.tec, life = world.life;
      this.impacts = this.impacts.filter(i => t - i.t < 12);
      this.basalts = this.basalts.filter(b => t - b.t < 20);
      if (this.ice && t > this.ice.t0 + this.ice.len) {
        out.push({ kind: 'thaw', title: 'The ice retreats', text: 'The ice age is over. Glaciers melt back toward the poles and the seas rise over the continental shelves again.' });
        this.ice = null; this.iceCooldown = t + 6;
      }
      if (t < 3) return out; // let the player see today's world settle first

      if (rng.chance(dt / 65)) {
        const D = 2 + 13 * rng.float() * rng.float();
        const cell = rng.int(grid.n);
        const onLand = tec.elev[cell] > world.climate.seaLevel;
        const cool = 1.5 + D * 0.55;
        this.impacts.push({ t, cool });
        const cc = world.coarse.owner[cell];
        const near = new Set([cc]);
        for (let k = world.coarse.adjStart[cc]; k < world.coarse.adjStart[cc + 1]; k++) near.add(world.coarse.adj[k]);
        const sev = clamp(D / 14, 0.15, 1);
        const n = life.pulse(t, (sp) => {
          let p = 0.03 + 0.12 * sev;
          if (sp.g.mass > 1.5) p += 0.45 * sev; else if (sp.g.mass > 0.5) p += 0.2 * sev;
          if (sp.g.realm === 2 && sp.g.troph < 1.3) p += 0.25 * sev;
          if (sp.g.loco === 3) p -= 0.08;
          if (sp.g.troph < 0.3) p *= 0.5;
          for (const c of sp.cells) if (near.has(c)) { p += 0.3; break; }
          return clamp(p, 0, 0.95);
        }, `Killed off in the aftermath of the asteroid impact ${t} My after present.`);
        out.push({ kind: 'impact', title: 'Asteroid impact', cell, deaths: n,
          text: `A ${D.toFixed(0)} km asteroid struck ${onLand ? 'land' : 'the sea'} near ${where(grid, cell)}. Soot and dust blocked the sun for years and the world cooled by about ${cool.toFixed(0)} °C. Large animals and plankton were hit hardest. ${n} species died out.` });
      }

      if (rng.chance(dt / 50)) {
        // Pick a continental cell for the eruption.
        let cell = -1;
        for (let tries = 0; tries < 60 && cell < 0; tries++) { const c = rng.int(grid.n); if (tec.ctype[c] === 2 && tec.elev[c] > world.climate.seaLevel) cell = c; }
        if (cell >= 0) {
          const mult = rng.range(1.8, 3.2);
          this.basalts.push({ t, mult });
          world.raise(cell, 3, 700);
          const n = life.pulse(t, (sp) => {
            let p = 0.04;
            if (sp.g.realm === 2) p += 0.12 + (sp.g.hab === 3 ? 0.25 : 0);
            if (sp.g.Topt < 5) p += 0.08;
            return p;
          }, `Lost in the greenhouse crisis after the flood basalt eruptions ${t} My after present.`);
          out.push({ kind: 'basalt', title: 'Flood basalts', cell, deaths: n,
            text: `For thousands of years, fissures near ${where(grid, cell)} poured out lava, burying a region the size of a small country. Carbon dioxide rose about ${mult.toFixed(1)}-fold, the world warmed and the oceans lost oxygen. Reefs collapsed. ${n} species died out.` });
        }
      }

      const cold = world.climate.dT < -2.5;
      if (!this.ice && t > this.iceCooldown && rng.chance(dt * (cold ? 1 / 6 : 1 / 30))) {
        this.ice = { t0: t, len: 2 + rng.int(5), depth: rng.range(3, 6) };
        out.push({ kind: 'ice', title: 'An ice age begins', cell: -1,
          text: `${cold ? 'With the world already cool, small wobbles in Earth\'s orbit were enough to tip it into glaciation.' : 'A shift in ocean circulation and Earth\'s orbit tipped the planet into glaciation.'} Ice sheets spread from the poles and sea level fell, joining islands to the mainland and opening land bridges.` });
      }
      return out;
    }

    serialize() { return { impacts: this.impacts.map(x => Object.assign({}, x)), basalts: this.basalts.map(x => Object.assign({}, x)), ice: this.ice && Object.assign({}, this.ice), iceCooldown: this.iceCooldown, rng: this.rng.state() }; }
    restore(s) { this.impacts = s.impacts.map(x => Object.assign({}, x)); this.basalts = s.basalts.map(x => Object.assign({}, x)); this.ice = s.ice && Object.assign({}, s.ice); this.iceCooldown = s.iceCooldown; this.rng.setState(s.rng); }
  }

  SE.Events = Events;
  SE.where = where;
})(globalThis.SE || (globalThis.SE = {}));
