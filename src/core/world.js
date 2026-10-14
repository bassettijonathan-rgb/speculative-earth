/*
 * One world: tectonics -> climate -> events -> life, one million years per tick.
 * Everything random comes from forks of a single seeded generator, and the tick
 * is always 1 My, so a seed (plus the player's CO2 settings) always grows the
 * same world no matter how the player steps through time.
 */
(function (SE) {
  'use strict';
  let GRID = null, COARSE = null;
  function grids() {
    if (!GRID) { GRID = new SE.Grid(5); COARSE = GRID.coarse(4); }
    return { grid: GRID, coarse: COARSE };
  }

  const EVO_TITLES = {
    flightless: (c) => c.group === 'bat' ? 'Bats come down to earth' : 'Birds give up the sky',
    landfall: (c) => c.key === 'squid' ? 'Squid walk on land' : 'Octopuses walk on land',
    shore: (c) => c.key === 'squid' ? 'Squid on the shore' : 'Octopuses leave the water',
    tosea: (c) => `${cap(c.noun)}s return to the sea`,
    predator: (c) => `${cap(c.noun)}s turn hunter`,
    giant: (c) => `Giant ${c.noun}s`,
    walkfish: () => 'Fish crawl ashore',
    glide: (c) => `Gliding ${c.noun}s`,
  };
  function cap(s) { return s[0].toUpperCase() + s.slice(1); }

  class World {
    constructor(seed, co2Log) {
      const { grid, coarse } = grids();
      this.grid = grid; this.coarse = coarse;
      this.seed = String(seed);
      this.co2Log = (co2Log && co2Log.length ? co2Log : [[0, 280]]).map(x => x.slice());
      const rng = new SE.Rng('speculative-earth/' + this.seed);
      this.tec = new SE.Tectonics(grid, rng.fork('tectonics'));
      this.climate = new SE.Climate(grid, coarse);
      this.events = new SE.Events(rng.fork('events'));
      this.life = new SE.Life(coarse, this.climate, rng.fork('life'));
      this.t = 0;
      const pd = SE.earth.presentDay(grid, rng.fork('present-day'));
      this.tec.initPresent(pd);
      this.climate.update(this.tec, this.co2At(0), 0, 0);
      this.life.init(0);
    }

    co2At(t) {
      let v = 280;
      for (const [tt, val] of this.co2Log) if (tt <= t) v = val;
      return v;
    }
    setCO2(t, v) {
      this.co2Log = this.co2Log.filter(x => x[0] < t);
      this.co2Log.push([t, v]);
    }

    raise(cell, rings, amount) {
      const grid = this.grid, tec = this.tec;
      let fr = [cell];
      const seen = new Set(fr);
      for (let r = 0; r <= rings; r++) {
        const nx = [];
        for (const g of fr) {
          const add = amount * (1 - r / (rings + 1));
          const P = tec.plates[tec.owner[g]], l = tec.loc[g];
          P.elev[l] += add; tec.elev[g] += add;
          if (P.ctype[l] === 1 && P.elev[l] > this.climate.seaLevel) { P.ctype[l] = 2; tec.ctype[g] = 2; }
          for (let k = grid.adjStart[g]; k < grid.adjStart[g + 1]; k++) { const j = grid.adj[k]; if (!seen.has(j)) { seen.add(j); nx.push(j); } }
        }
        fr = nx;
      }
    }

    step() {
      const t = this.t + 1;
      const cards = [];
      for (const e of this.tec.step(1, t)) cards.push(e);
      this.climate.update(this.tec, this.co2At(t) * this.events.co2Mult(t), this.events.anomaly(t), this.events.iceFactor(t));
      for (const e of this.events.step(t, 1, this)) cards.push(e);
      const notes = this.life.step(t, 1);
      for (const n of notes) {
        const sp = this.life.species[n.id], cl = SE.CLADES[sp.clade];
        cards.push({ kind: 'evo', title: EVO_TITLES[n.k](cl), id: n.id, cell: -1, coarseCell: n.cell,
          text: `${sp.genus} ${sp.epithet}, the ${sp.common.toLowerCase()}. ${sp.cause}` });
      }
      this.t = t;
      for (const c of cards) c.t = t;
      return cards;
    }

    stats() {
      let plates = 0;
      for (const P of this.tec.plates) if (P.active) plates++;
      return { t: this.t, alive: this.life.alive.length, speciations: this.life.speciations, extinctions: this.life.extinctions, plates,
        co2: Math.round(this.co2At(this.t) * this.events.co2Mult(this.t)), dT: this.climate.dT, seaLevel: this.climate.seaLevel };
    }

    /** Arrays for drawing the map at this moment. */
    frame() {
      const n = this.grid.n, sea = this.climate.seaLevel;
      const elev = new Int16Array(n), temp = new Int8Array(n);
      for (let i = 0; i < n; i++) {
        elev[i] = Math.max(-32000, Math.min(32000, Math.round(this.tec.elev[i] - sea)));
        temp[i] = Math.max(-100, Math.min(100, Math.round(this.climate.temp[i])));
      }
      return { t: this.t, biome: this.climate.biome.slice(), temp, elev, plate: this.tec.owner.slice(), rich: this.life.richness.slice(), stats: this.stats() };
    }

    /** Coarse environment summary kept in history for the field guide. */
    envSnapshot() {
      const C = this.climate.c, nc = this.coarse.n;
      const Tl = new Int8Array(nc), Ts = new Int8Array(nc), land = new Uint8Array(nc);
      for (let c = 0; c < nc; c++) { Tl[c] = Math.round(C.Tl[c]); Ts[c] = Math.round(C.Ts[c]); land[c] = Math.round(C.land[c] * 255); }
      return { domL: C.domL.slice(), domS: C.domS.slice(), Tl, Ts, land };
    }

    serialize() {
      const C = this.climate;
      return { t: this.t, seed: this.seed, co2Log: this.co2Log.map(x => x.slice()), tec: this.tec.serialize(), life: this.life.serialize(), events: this.events.serialize(),
        climate: { seaLevel: C.seaLevel, landFrac0: C.landFrac0, polar0: C.polar0, dT: C.dT } };
    }
    restore(s) {
      this.t = s.t; this.co2Log = s.co2Log.map(x => x.slice());
      this.tec.restore(s.tec); this.events.restore(s.events);
      Object.assign(this.climate, s.climate);
      this.climate.update(this.tec, this.co2At(this.t) * this.events.co2Mult(this.t), this.events.anomaly(this.t), this.events.iceFactor(this.t));
      // update() recomputes dT from the restored inputs; keep the restored value so the next tick matches exactly.
      this.climate.dT = s.climate.dT; this.climate.seaLevel = s.climate.seaLevel;
      this.life.restore(s.life);
    }
  }

  SE.World = World;
  SE.grids = grids;
})(globalThis.SE || (globalThis.SE = {}));
