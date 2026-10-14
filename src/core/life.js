/*
 * Life on the coarse grid (2562 cells, ~480 km).
 *
 * A species is a genome plus a range (the set of coarse cells it occupies). Each
 * million years:
 *   1. every species scores each cell of its range for suitability: temperature
 *      against its optimum, habitat, drought, ice, and food (plant productivity
 *      for herbivores, prey of the right size for predators);
 *   2. species that share a niche in a cell compete, and the weaker one is
 *      penalised there, so it tends to lose that cell;
 *   3. cells that score badly are lost; good cells spread into neighbours
 *      (fliers and swimmers spread further, land animals cannot cross sea);
 *   4. a range broken into separate pieces speciates (vicariance); a range with
 *      many marginal cells can bud off a daughter adapted to them; and rarer
 *      "macro" transitions (losing flight, leaving the sea, turning predator,
 *      giantism...) create new genera when their ecological door is open;
 *   5. small or stressed species go extinct.
 * Speciation slows as the world fills up (diversity dependence), which keeps
 * species counts from exploding.
 */
(function (SE) {
  'use strict';
  const { exp, clamp } = SE.math;
  const SCAP = 420;
  const NB = 11; // mass bins: log10 kg from -6 to +4

  function massBin(m) { const b = Math.floor(m + 6); return b < 0 ? 0 : b > NB - 1 ? NB - 1 : b; }
  function locoClass(g) { return g.loco === 1 || g.loco === 6 ? 1 : g.loco === 5 ? 5 + (g.hab === 1 ? 1 : 0) : g.loco; }
  function nicheKey(g) { return g.realm * 1000 + locoClass(g) * 100 + Math.round(g.troph * 2) * 10 + massBin(g.mass); }
  const isAnimal = g => g.troph >= 0.8;
  const isPlant = g => g.troph < 0.3;

  // Macro transitions. `when` checks the lineage can make the change; `site`
  // checks a cell for the ecological opening; `apply` edits the daughter.
  const MACRO = [
    {
      k: 'flightless', rate: 0.025,
      when: (s) => s.g.loco === 1 && s.g.realm === 0 && s.bp.arch === 'tetra' && s.g.mass < 1.5,
      site: (L, c, s) => L.env.land[c] > 0.3 && L.groundHunters(c, s.g.mass) === 0,
      apply: (d, rng) => {
        d.g.loco = 0; d.g.mass += rng.range(0.5, 1.1);
        if (d.bp.fore === 'mwing') {
          d.bp.fore = 'wingleg'; d.bp.posture = 0; d.bp.leg += 0.12;
          // Insect-hunting bats that come down to earth tend to take bigger prey.
          if (d.g.troph >= 1.8 && rng.chance(0.6)) { d.g.troph = Math.min(3, d.g.troph + 0.7); d.bp.teeth += 0.3; d.g.mass += 0.4; }
        }
        else { d.bp.fore = 'vestigial'; d.bp.leg += 0.15; d.bp.neck += 0.08; }
      },
      text: (d, p) => d.bp.fore === 'wingleg'
        ? `With no ground hunters where it lived, flying stopped paying for itself. The wing fingers of its bat ancestors folded into stout walking limbs.`
        : `On land with no ground predators, its ancestors stopped flying. The wings shrank to stubs while the legs grew long and strong.`,
    },
    {
      k: 'predator', rate: 0.012,
      // Lineages that just lost flight are already eating whatever they meet on the ground.
      when: (s) => isAnimal(s.g) && s.g.troph >= (s.trans.some(x => x.k === 'flightless') ? 0.9 : 1.4) && s.g.troph < 2.5 && s.g.mass > -2.5 && s.g.mass < 2.8,
      site: (L, c, s) => (s.g.realm === 0 && s.trans.some(x => x.k === 'flightless') ? L.groundHunters(c, s.g.mass) === 0 : L.bigHunters(c, s.g.realm === 2 ? 1 : 0, s.g.mass + 0.3) === 0) && L.prey(c, s.g.realm === 2 ? 1 : 0, s.g.mass + 0.6, false) > 1,
      apply: (d, rng) => {
        d.g.troph = rng.range(2.75, 3.05); d.g.mass += rng.range(0.4, 0.9); d.g.social = clamp(d.g.social + rng.range(-0.2, 0.3), 0, 1);
        if (d.bp.arch === 'tetra') { d.bp.teeth = Math.max(d.bp.teeth, 0.5) + 0.2; d.bp.claws = (d.bp.claws || 0) + 0.3; d.bp.snout = clamp(d.bp.snout + 0.1, 0.2, 1); }
        if (d.bp.arch === 'ceph') { d.bp.armW += 0.03; }
      },
      text: () => `Its ancestors took whatever they found. Here the big hunters were gone and prey was plentiful, so this line became a hunter itself.`,
    },
    {
      k: 'giant', rate: 0.010,
      when: (s) => isAnimal(s.g) && s.g.mass < 2.6 && s.g.mass > -3.2 && s.g.troph < 2.0 && s.g.loco !== 1,
      site: (L, c, s) => L.bigGrazers(c, s.g.realm === 2 ? 1 : 0, s.g.mass + 1) === 0,
      apply: (d, rng) => {
        d.g.mass += rng.range(0.7, 1.3); d.g.troph = Math.min(d.g.troph, 1.2);
        if (d.bp.arch === 'tetra') { d.bp.leg += 0.08; d.bp.girth = clamp(d.bp.girth + 0.06, 0.2, 0.7); d.bp.tail *= 0.8; d.bp.ears *= 0.85; }
      },
      text: () => `The large plant-eaters of its region were gone. Bigger bodies reach more food and survive lean seasons, so the lineage grew.`,
    },
    {
      k: 'shore', rate: 0.03,
      when: (s) => s.bp.arch === 'ceph' && s.g.realm === 2,
      site: (L, c) => L.env.land[c] > 0.1 && L.env.land[c] < 0.9 && L.env.Ts[c] > 16,
      apply: (d, rng) => { d.g.realm = 1; d.g.hab = 4; d.bp.upright = 0.4; d.bp.armW += 0.03; d.bp.mw += 0.1; d.g.mass += rng.range(0, 0.4); },
      text: () => `Warm tidal flats full of crabs and stranded fish drew its ancestors out of the water at low tide. It breathes through a mantle it keeps wet.`,
    },
    {
      k: 'landfall', rate: 0.05,
      when: (s) => s.bp.arch === 'ceph' && s.g.realm === 1,
      site: (L, c) => L.env.land[c] > 0.25 && L.env.P[c] > 700,
      apply: (d, rng) => {
        d.g.realm = 0; d.g.loco = 0; d.g.hab = rng.chance(0.5) ? 1 : 0; d.g.mass += rng.range(0.2, 0.8);
        d.bp.upright = 1; d.bp.armW += 0.05; d.bp.armLen *= 0.85; d.bp.lit = Math.max(25, d.bp.lit - 10);
      },
      text: () => `A thick mucus skin and a mantle that holds water let this line leave the shore for humid forests. Its arms now carry it like legs.`,
    },
    {
      k: 'tosea', rate: 0.006,
      when: (s) => s.bp.arch === 'tetra' && s.g.realm === 0 && s.g.troph >= 1.4 && s.g.loco !== 1 && s.bp.fore !== 'flipper',
      site: (L, c) => L.env.land[c] > 0.1 && L.env.land[c] < 0.7 && L.env.nppS[c] > 0.4,
      apply: (d, rng) => { d.g.realm = 1; d.g.loco = 4; d.g.hab = 4; d.g.mass += rng.range(0.2, 0.7); d.bp.fore = 'flipper'; d.bp.hind = 'flipper'; d.bp.ears *= 0.3; d.bp.tail = Math.max(d.bp.tail, 0.4); d.bp.leg *= 0.6; },
      text: () => `Rich coastal waters were an open larder. Its ancestors hunted ever further from shore until their feet became paddles.`,
    },
    {
      k: 'tosea', rate: 0.005,
      when: (s) => s.bp.arch === 'tetra' && s.g.realm === 1 && s.bp.fore === 'flipper' && !s.bp.fluke,
      site: (L, c) => L.env.land[c] < 0.5 && L.env.nppS[c] > 0.3,
      apply: (d, rng) => { d.g.realm = 2; d.g.hab = 5; d.g.mass += rng.range(0.3, 0.9); d.bp.fluke = 1; d.bp.hind = 'vestigial'; d.bp.tail = 1; d.bp.tailW = 0.18; d.bp.cover = 3; d.bp.ears = 0; },
      text: () => `This line no longer comes ashore at all. The hind limbs are gone, and a tail fluke drives it through open water.`,
    },
    {
      k: 'burrow', rate: 0.005,
      when: (s) => s.bp.arch === 'tetra' && s.g.loco === 0 && s.g.mass < 0.6 && s.g.realm === 0,
      site: (L, c) => L.env.desert[c] + L.env.open[c] * 0.5 > 0.5,
      apply: (d, rng) => { d.g.loco = 3; d.g.arid = clamp(d.g.arid + 0.3, 0, 1); d.g.social = clamp(d.g.social + rng.range(0.1, 0.5), 0, 1); d.bp.ears *= 0.3; d.bp.eye = 0.2; d.bp.claws = 0.8; d.bp.tail *= 0.4; d.bp.leg *= 0.7; d.bp.cover = rng.chance(0.4) ? 3 : d.bp.cover; },
      text: () => `In open, dry country it went underground, digging with heavy front claws. Its eyes and ears shrank in the dark.`,
    },
    {
      k: 'glide', rate: 0.005,
      when: (s) => s.bp.arch === 'tetra' && (s.g.loco === 2 || s.g.loco === 0) && s.g.mass < 0.8 && s.bp.cover !== 1 && s.g.realm === 0,
      site: (L, c) => L.env.forest[c] > 0.6,
      apply: (d) => { d.g.loco = 6; d.g.hab = 1; d.bp.patag = 1; d.bp.tailW += 0.1; },
      text: () => `Life in tall forest favoured those who could leap between trees. Flaps of skin between its limbs now carry it in long glides.`,
    },
    {
      k: 'climb', rate: 0.005,
      when: (s) => s.bp.arch === 'tetra' && s.g.loco === 0 && s.g.mass < 1.5 && s.g.realm === 0,
      site: (L, c) => L.env.forest[c] > 0.6,
      apply: (d) => { d.g.loco = 2; d.g.hab = 1; d.bp.tail += 0.3; d.bp.claws = (d.bp.claws || 0) + 0.3; d.bp.fore = d.bp.fore === 'leg' ? 'arm' : d.bp.fore; },
      text: () => `Its ancestors took to the trees, where grasping hands and a long balancing tail beat speed on the ground.`,
    },
    {
      k: 'grazer', rate: 0.007,
      when: (s) => s.bp.arch === 'tetra' && s.g.loco === 0 && s.g.troph < 1.6 && s.g.mass > -0.8 && s.g.realm === 0 && s.bp.leg < 0.75,
      site: (L, c) => L.env.open[c] > 0.6 && L.env.nppL[c] > 0.4,
      apply: (d, rng) => { d.g.troph = 1.0; d.g.hab = 2; d.g.mass += rng.range(0.2, 0.6); d.g.social = clamp(d.g.social + 0.25, 0, 1); d.bp.leg += 0.18; d.bp.neck += 0.08; d.bp.snout += 0.08; d.bp.tail *= 0.6; },
      text: () => `Spreading grasslands rewarded speed and a gut for grass. Its legs lengthened for running in herds.`,
    },
    {
      k: 'social', rate: 0.003,
      when: (s) => isAnimal(s.g) && s.g.social < 0.6 && s.g.mass < 1.5 && s.g.mass > -2,
      site: (L, c) => L.env.desert[c] > 0.3 || L.env.ice[c] > 0.2,
      apply: (d, rng) => { d.g.social = clamp(d.g.social + rng.range(0.35, 0.55), 0, 1); },
      text: () => `In a harsh land, families that stayed together and shared burrows and food outlived loners. It now lives in large colonies with a few breeders.`,
    },
    {
      k: 'walkfish', rate: 0.002,
      when: (s) => s.bp.arch === 'fish' && !s.bp.shark && s.g.realm === 2 && s.g.mass < 1.5,
      site: (L, c) => L.env.land[c] > 0.15 && L.env.land[c] < 0.85 && L.env.Ts[c] > 20,
      apply: (d) => { d.g.realm = 1; d.g.hab = 7; d.bp.lobe = 1; },
      text: () => `In warm, oxygen-poor shallows, fish that could gulp air and prop themselves on their fins survived. This one now crawls between pools.`,
    },
  ];
  const NOTABLE = { flightless: 1, landfall: 1, shore: 1, tosea: 1, predator: 1, giant: 1, walkfish: 1, glide: 1 };

  class Life {
    constructor(coarse, climate, rng) {
      this.grid = coarse;
      this.climate = climate;
      this.env = climate.c;
      this.rng = rng;
      this.namer = new SE.Namer(rng.fork('names'));
      this.species = [];
      this.alive = [];
      this.speciations = 0;
      this.extinctions = 0;
      this.hist = new Uint16Array(coarse.n * 2 * 2 * NB);
      this.hunt = new Uint16Array(coarse.n * 2 * NB); // non-flying hunters (troph >= 2.4) by realm and mass
      this.richness = new Uint16Array(coarse.n);
      this.firsts = {};
    }

    // ---- occupancy queries (from the previous tick) ----
    hidx(c, sea, high, b) { return ((c * 2 + sea) * 2 + high) * NB + b; }
    prey(c, sea, mass, includeHigh) {
      let n = 0;
      const lo = Math.max(0, massBin(mass - 3.5)), hi = massBin(mass + 0.3);
      for (let b = lo; b <= hi; b++) { n += this.hist[this.hidx(c, sea, 0, b)]; if (includeHigh) n += this.hist[this.hidx(c, sea, 1, b)]; }
      return n;
    }
    groundHunters(c, mass) { const n = this.bigHunters(c, 0, mass + 1); return n <= 1 ? 0 : n; }
    bigHunters(c, sea, mass) { let n = 0; for (let b = massBin(mass); b < NB; b++) n += this.hunt[(c * 2 + sea) * NB + b]; return n; }
    bigGrazers(c, sea, mass) { let n = 0; for (let b = massBin(mass); b < NB; b++) n += this.hist[this.hidx(c, sea, 0, b)]; return n; }

    // ---- setup ----
    init(t) {
      const grid = this.grid, env = this.env, DEG = SE.math.DEG;
      const tags = [];
      for (let c = 0; c < grid.n; c++) {
        const la = grid.lat[c] / DEG, lo = grid.lon[c] / DEG;
        tags.push({ cont: env.land[c] > 0.2 ? SE.earth.continentOf(la, lo) : null, ocean: env.land[c] < 0.8 ? SE.earth.oceanOf(la, lo) : null });
      }
      // Producers and plant-eaters first, then predators once their prey is on the map.
      const order = SE.CLADES.map((cl, ci) => ci).sort((a, b) => (SE.CLADES[a].g.troph >= 1.7) - (SE.CLADES[b].g.troph >= 1.7) || a - b);
      const ranges = [];
      for (const ci of order) {
        const cl = SE.CLADES[ci];
        const g = Object.assign({ Topt: 15, Ttol: 10 }, cl.g);
        const sp = { clade: ci, g };
        // Starting range: the clade's home regions, where the habitat fits.
        const home = new Set(cl.home);
        const cand = [];
        for (let c = 0; c < grid.n; c++) {
          const tg = tags[c];
          if (g.realm === 2 ? (tg.ocean && home.has(tg.ocean)) : g.realm === 1 ? (tg.ocean && home.has(tg.ocean) && env.land[c] > 0.05) || (tg.cont && home.has(tg.cont) && env.land[c] < 0.95) : (tg.cont && home.has(tg.cont))) cand.push(c);
        }
        // Calibrate the thermal niche on the habitat-matched part of the home range.
        g.Ttol = 30;
        let good = cand.filter(c => this.habFit(g, c) > 0.45);
        if (good.length < 5) good = cand;
        const temps = good.map(c => this.cellT(g, c)).sort((a, b) => a - b);
        const q = (f) => temps[Math.floor(f * (temps.length - 1))];
        g.Topt = (q(0.15) + q(0.85)) / 2;
        g.Ttol = clamp((q(0.85) - q(0.15)) / 2 + 4, 4, 14);
        const range = new Uint8Array(grid.n);
        for (const c of good) if (this.suit(sp, c) > 0.25) range[c] = 1;
        ranges[ci] = { g, range };
        this.tmpRanges = ranges;
        this.placedSoFar = (this.placedSoFar || []).concat([ci]);
        this.rebuildOccupancyInit();
      }
      // Species ids follow the clade list order.
      SE.CLADES.forEach((cl, ci) => {
        const sp = this.newSpecies({ parent: -1, clade: ci, genus: cl.genus, epithet: cl.sp, g: ranges[ci].g, bp: Object.assign({}, cl.bp), born: t, cause: 'A survivor from the age of humans.', causeKind: 'founder', trans: [] });
        sp.common = cl.common[0].toUpperCase() + cl.common.slice(1);
        this.namer.reserve(cl.genus, cl.sp);
        this.namer.genera.set(cl.genus, cl.key);
        sp.range = ranges[ci].range;
        this.rebuildCells(sp);
      });
      delete this.tmpRanges; delete this.placedSoFar;
      this.rebuildOccupancy();
    }

    rebuildOccupancyInit() {
      // Occupancy from the clades placed so far (used only while seeding t = 0).
      this.hist.fill(0);
      for (const ci of this.placedSoFar || []) {
        const { g, range } = this.tmpRanges[ci];
        if (!isAnimal(g)) continue;
        const sea = g.realm === 2 ? 1 : 0, high = g.troph >= 1.7 ? 1 : 0, b = massBin(g.mass);
        for (let c = 0; c < range.length; c++) if (range[c]) { this.hist[this.hidx(c, sea, high, b)]++; if (g.realm === 1) this.hist[this.hidx(c, 1 - sea, high, b)]++; }
      }
    }

    newSpecies(o) {
      const sp = Object.assign({ id: this.species.length, died: null, xcause: null, common: '', range: null, cells: [], maxRange: 0, depth: 0 }, o);
      this.species.push(sp);
      this.alive.push(sp.id);
      return sp;
    }

    rebuildCells(sp) {
      const cells = [];
      const r = sp.range;
      for (let c = 0; c < r.length; c++) if (r[c]) cells.push(c);
      sp.cells = cells;
      if (cells.length > sp.maxRange) sp.maxRange = cells.length;
    }

    // ---- suitability ----
    cellT(g, c) { const e = this.env; return g.realm === 0 ? e.Tl[c] : g.realm === 2 ? e.Ts[c] : (e.Tl[c] + e.Ts[c]) / 2; }

    habFit(g, c) {
      const e = this.env, L = e.land[c];
      let av;
      if (g.realm === 0) { if (L < 0.12) return 0; av = Math.min(1, L * 2.2); }
      else if (g.realm === 2) { const W = 1 - L; if (W < 0.12) return 0; av = Math.min(1, W * 2.2); }
      else { if (L < 0.06 || L > 0.94) return 0; av = Math.min(1, 6 * L * (1 - L)); }
      let h = 1;
      if (g.realm !== 2) {
        switch (g.hab) {
          case 1: h = 0.08 + 0.92 * e.forest[c]; break;
          case 2: h = 0.08 + 0.92 * e.open[c]; break;
          case 6: h = e.Tl[c] < 2 ? 1 : 0.4; break;
          case 7: h = Math.min(1, 0.25 + e.P[c] / 1200); break;
          case 4: h = 1; break;
        }
        const P = e.P[c];
        if (g.realm === 0) {
          if (P < 350) h *= g.arid + (1 - g.arid) * Math.pow(P / 350, 1.5);
          else if (g.arid > 0.7 && P > 1300) h *= 0.6;
        }
        h *= g.hab === 6 ? 1 - 0.4 * e.ice[c] : 1 - 0.95 * e.ice[c];
      } else {
        switch (g.hab) {
          case 3: h = e.reef[c] > 0 ? 0.3 + 0.7 * Math.min(1, e.reef[c] * 3) : 0.02; break;
          case 4: h = 0.15 + 0.85 * Math.min(1, e.shelf[c] * 2 + (L > 0.05 ? 0.4 : 0)); break;
          case 5: h = 0.35 + 0.65 * Math.min(1, e.deep[c] + 0.5 * e.shelf[c]); break;
          case 6: h = e.seaice[c] > 0 ? 1 : 0.5; break;
        }
      }
      return av * h;
    }

    food(g, c) {
      const e = this.env;
      if (g.troph < 0.8) return g.realm === 2 ? 1 : (e.nppL[c] > 0.05 ? 1 : 0.1);
      const sea = g.realm === 2 ? 1 : 0;
      const npp = sea ? e.nppS[c] : g.realm === 1 ? Math.max(e.nppL[c], e.nppS[c]) : e.nppL[c];
      if (g.troph < 1.7) {
        let f = Math.sqrt(npp);
        if (g.troph > 1.3) f = Math.max(f, Math.min(1, 0.4 + this.prey(c, sea, g.mass, false) / 8));
        return f;
      }
      let p = this.prey(c, sea, g.mass, g.troph >= 2.6);
      if (g.realm === 1) p += this.prey(c, 1, g.mass, g.troph >= 2.6);
      return p === 0 ? 0.04 : Math.min(1, 0.3 + p / 4);
    }

    suit(sp, c) {
      const g = sp.g;
      const hf = this.habFit(g, c);
      if (hf <= 0) return 0;
      const d = (this.cellT(g, c) - g.Topt) / g.Ttol;
      return hf * exp(-d * d) * this.food(g, c);
    }

    // ---- the yearly (million-yearly) step ----
    step(t, dt) {
      const rng = this.rng, grid = this.grid, nc = grid.n, as = grid.adjStart, adj = grid.adj;
      const notes = [];
      const S = this.alive.length;
      const D = Math.max(0, 1 - S / SCAP);
      const ids = this.alive.slice();
      // 1+2. Suitability and competition. Best suitability per (cell, niche).
      const kIdx = new Map();
      for (const id of ids) { const key = nicheKey(this.species[id].g); if (!kIdx.has(key)) kIdx.set(key, kIdx.size); }
      const K = kIdx.size;
      if (!this.bestS || this.bestS.length < nc * K) { this.bestS = new Float32Array(nc * K * 2); this.bestId = new Int32Array(nc * K * 2); }
      const bestS = this.bestS, bestId = this.bestId;
      bestS.fill(-1, 0, nc * K);
      const suits = new Map();
      for (const id of ids) {
        const sp = this.species[id];
        const ki = kIdx.get(nicheKey(sp.g));
        const arr = new Float32Array(sp.cells.length);
        for (let i = 0; i < sp.cells.length; i++) {
          const c = sp.cells[i];
          const s = this.suit(sp, c);
          arr[i] = s;
          const k = c * K + ki;
          if (s > bestS[k]) { bestS[k] = s; bestId[k] = id; }
        }
        suits.set(id, arr);
      }
      // 3. Range dynamics.
      for (const id of ids) {
        const sp = this.species[id];
        const ki = kIdx.get(nicheKey(sp.g));
        const arr = suits.get(id);
        const r = sp.range;
        let lostComp = 0, lostEnv = 0, rival = -1, sum = 0;
        const disp = this.dispersal(sp.g);
        const adds = [];
        for (let i = 0; i < sp.cells.length; i++) {
          const c = sp.cells[i];
          let s = arr[i];
          const bk = c * K + ki;
          let comp = false;
          if (bestId[bk] !== id && bestS[bk] >= s) { s *= 0.5; comp = true; }
          sum += s;
          if (s < 0.12 || (s < 0.25 && rng.chance(0.35))) {
            r[c] = 0;
            if (comp) { lostComp++; rival = bestId[bk]; } else lostEnv++;
            continue;
          }
          if (s > 0.35) {
            for (let k = as[c]; k < as[c + 1]; k++) {
              const j = adj[k];
              if (r[j] || !rng.chance(disp)) continue;
              adds.push(j);
              if (sp.g.loco === 1 || sp.g.realm === 2) {
                // Long-distance: one more hop, across a strait or open sea.
                const k2 = as[j] + rng.int(as[j + 1] - as[j]);
                const j2 = adj[k2];
                if (!r[j2] && rng.chance(0.35)) adds.push(j2);
              }
            }
          }
        }
        for (const j of adds) {
          if (r[j]) continue;
          const s = this.suit(sp, j);
          if (s < 0.3) continue;
          const bk = j * K + ki;
          if (bestS[bk] > s && rng.chance(0.8)) continue;
          r[j] = 1;
        }
        sp.meanSuit = sp.cells.length ? sum / sp.cells.length : 0;
        sp.lastLoss = lostComp > lostEnv ? { kind: 'comp', rival } : { kind: 'env' };
        this.rebuildCells(sp);
        // Slow adaptation of the thermal optimum toward the conditions it lives in.
        if (sp.cells.length) {
          let tm = 0;
          for (const c of sp.cells) tm += this.cellT(sp.g, c);
          tm /= sp.cells.length;
          const dT = clamp((tm - sp.g.Topt) * 0.12, -0.4, 0.4) * dt;
          sp.g.Topt += dT;
        }
      }
      // 4. Speciation.
      for (const id of ids) {
        const sp = this.species[id];
        if (sp.cells.length < 2) continue;
        this.vicariance(sp, t, D, notes);
        if (sp.cells.length >= 8 && rng.chance(0.05 * D * dt)) this.ecological(sp, t, notes);
        if (sp.cells.length >= 3) this.macro(sp, t, D, dt, notes);
      }
      // 5. Extinction.
      const nowS = this.alive.length;
      for (const id of this.alive.slice()) {
        const sp = this.species[id];
        if (sp.born === t) continue;
        const n = sp.cells.length;
        if (n === 0) { this.kill(sp, t, sp.lastLoss && sp.lastLoss.kind === 'comp' && sp.lastLoss.rival >= 0 ? `Outcompeted by ${this.binomial(this.species[sp.lastLoss.rival])}.` : 'Its habitat disappeared as the climate and coastlines shifted.'); continue; }
        const mu = (0.003 + 0.09 / (n + 1) + 0.02 * (1 - (sp.meanSuit || 0))) * (0.5 + nowS / SCAP) * dt;
        if (rng.chance(mu)) this.kill(sp, t, n < 4 ? 'Its last small population dwindled away.' : 'A run of bad luck and lean years finished it off.');
      }
      this.rebuildOccupancy();
      return notes;
    }

    dispersal(g) {
      const base = [0.3, 0.5, 0.22, 0.12, 0.45, 0.22, 0.35][g.loco];
      return clamp(base * (1 + 0.08 * g.mass), 0.06, 0.7);
    }

    binomial(sp) { return sp.genus + ' ' + sp.epithet; }

    kill(sp, t, cause) {
      sp.died = t; sp.xcause = cause; sp.range = null; sp.lastCells = sp.cells; sp.cells = [];
      const i = this.alive.indexOf(sp.id);
      if (i >= 0) this.alive.splice(i, 1);
      this.extinctions++;
    }

    components(sp) {
      const grid = this.grid, as = grid.adjStart, adj = grid.adj, r = sp.range;
      if (!this.stampArr) { this.stampArr = new Int32Array(grid.n); this.stamp = 0; }
      const st = this.stampArr, mark = ++this.stamp;
      const comps = [];
      const far = sp.g.loco === 1;
      for (const c of sp.cells) {
        if (st[c] === mark) continue;
        const comp = [c];
        st[c] = mark;
        for (let q = 0; q < comp.length; q++) {
          const x = comp[q];
          for (let k = as[x]; k < as[x + 1]; k++) {
            const j = adj[k];
            if (r[j] && st[j] !== mark) { st[j] = mark; comp.push(j); }
            if (far) for (let k2 = as[j]; k2 < as[j + 1]; k2++) { const j2 = adj[k2]; if (r[j2] && st[j2] !== mark) { st[j2] = mark; comp.push(j2); } }
          }
        }
        comps.push(comp);
      }
      return comps;
    }

    vicariance(sp, t, D, notes) {
      const comps = this.components(sp);
      if (comps.length < 2) return;
      comps.sort((a, b) => b.length - a.length || a[0] - b[0]);
      for (let i = 1; i < comps.length; i++) {
        const comp = comps[i];
        if (comp.length < 3) continue;
        if (!this.rng.chance(0.2 * D)) continue;
        const why = this.barrier(sp, comp);
        this.daughter(sp, comp, t, null, why.text, 'vicariance', notes);
      }
    }

    barrier(sp, comp) {
      const grid = this.grid, as = grid.adjStart, adj = grid.adj, e = this.env, r = sp.range;
      const votes = { rift: 0, sea: 0, mountain: 0, desert: 0, ice: 0, land: 0, climate: 0 };
      const inComp = new Set(comp);
      for (const c of comp) for (let k = as[c]; k < as[c + 1]; k++) {
        const j = adj[k];
        if (inComp.has(j) || r[j]) continue;
        if (sp.g.realm === 2) { if (e.land[j] > 0.85) votes.land++; else votes.climate++; continue; }
        if (e.land[j] < 0.12) { if (e.young[j] > 0.3) votes.rift++; else votes.sea++; }
        else if (e.elevMax[j] > 2500) votes.mountain++;
        else if (e.ice[j] > 0.4) votes.ice++;
        else if (e.desert[j] > 0.4) votes.desert++;
        else votes.climate++;
      }
      let k = 'climate', v = -1;
      for (const x in votes) if (votes[x] > v) { v = votes[x]; k = x; }
      const text = {
        rift: 'A new seaway, opened by a continental rift, cut its ancestors\' range in two.',
        sea: 'Drifting land and shifting coastlines left a population stranded across open water.',
        mountain: 'A rising mountain range divided its ancestors\' range.',
        desert: 'A spreading desert split its ancestors\' range.',
        ice: 'Advancing ice split its ancestors\' range.',
        land: 'Colliding continents closed a seaway and divided its ancestors\' waters.',
        climate: 'A changing climate broke its ancestors\' range into isolated pockets.',
      }[k];
      return { k, text };
    }

    ecological(sp, t, notes) {
      const marg = [];
      for (const c of sp.cells) { const s = this.suit(sp, c); if (s > 0.1 && s < 0.35) marg.push(c); }
      if (marg.length < 4 || marg.length < sp.cells.length * 0.25 || marg.length > sp.cells.length - 2) return;
      // Adapt to the most common habitat among the marginal cells.
      const e = this.env;
      let f = 0, o = 0, P = 0, reef = 0, deep = 0;
      for (const c of marg) { f += e.forest[c]; o += e.open[c]; P += e.P[c]; reef += e.reef[c]; deep += e.deep[c]; }
      P /= marg.length;
      const d = this.daughter(sp, marg, t, null, null, 'ecological', notes, true);
      if (d.g.realm !== 2 && d.g.troph >= 0) { if (d.g.hab === 1 || d.g.hab === 2 || d.g.hab === 0) d.g.hab = f > o * 1.3 ? 1 : o > f * 1.3 ? 2 : 0; d.g.arid = clamp(d.g.arid + (P < 400 ? 0.25 : P > 1200 ? -0.15 : 0), 0, 1); }
      else if (d.g.realm === 2 && d.g.hab !== 6) d.g.hab = reef > marg.length * 0.3 ? 3 : deep > marg.length * 0.5 ? 5 : 4;
      const B = SE.BIOME_NAMES;
      const counts = {};
      for (const c of marg) { const b = d.g.realm === 2 ? e.domS[c] : e.domL[c]; if (b < 13) counts[b] = (counts[b] || 0) + 1; }
      let bb = -1, bv = 0;
      for (const b in counts) if (counts[b] > bv) { bv = counts[b]; bb = +b; }
      d.cause = `It budded off on the edge of its parent's range, adapting to ${bb >= 0 ? B[bb] : 'new ground'} its ancestors could barely use.`;
      d.epithet = this.namer.epithet(d.genus, d, sp, null);
      d.common = this.namer.common(d, SE.CLADES[d.clade]);
    }

    macro(sp, t, D, dt, notes) {
      const rng = this.rng;
      for (const M of MACRO) {
        if (!M.when(sp)) continue;
        if (!rng.chance(M.rate * dt * (0.3 + 0.7 * D))) continue;
        const sites = sp.cells.filter(c => M.site(this, c, sp));
        if (sites.length < 2) continue;
        // The daughter takes a connected patch of qualifying cells.
        const pick = sites[rng.int(sites.length)];
        const ok = new Set(sites);
        const patch = [pick];
        const seen = new Set(patch);
        const maxN = Math.max(3, Math.floor(sp.cells.length * 0.4));
        for (let q = 0; q < patch.length && patch.length < maxN; q++) {
          const x = patch[q];
          for (let k = this.grid.adjStart[x]; k < this.grid.adjStart[x + 1]; k++) {
            const j = this.grid.adj[k];
            if (ok.has(j) && !seen.has(j)) { seen.add(j); patch.push(j); }
          }
        }
        if (patch.length < 2) continue;
        this.daughter(sp, patch, t, M, null, 'macro', notes);
        return;
      }
    }

    daughter(sp, cells, t, M, causeText, kind, notes, skipName) {
      const rng = this.rng;
      const g = Object.assign({}, sp.g);
      const bp = Object.assign({}, sp.bp);
      // Small heritable drift in every trait.
      g.mass += rng.normal() * 0.12;
      if (g.troph >= 0.8) g.troph = clamp(g.troph + rng.normal() * 0.07, 0.8, 3.3);
      g.Ttol = clamp(g.Ttol * exp(rng.normal() * 0.08), 3.5, 15);
      g.social = clamp(g.social + rng.normal() * 0.05, 0, 1);
      g.arid = clamp(g.arid + rng.normal() * 0.05, 0, 1);
      let tm = 0;
      for (const c of cells) tm += this.cellT(g, c);
      tm /= cells.length;
      g.Topt += 0.6 * (tm - g.Topt) + rng.normal() * 0.8;
      this.driftBody(bp, rng);
      const d = this.newSpecies({ parent: sp.id, clade: sp.clade, genus: sp.genus, epithet: '', g, bp, born: t, cause: causeText, causeKind: kind, trans: sp.trans.slice(), depth: sp.depth + 1 });
      if (M) {
        M.apply(d, rng);
        d.trans.push({ k: M.k, t, id: d.id });
        d.genus = this.namer.genusFor(M.k, SE.CLADES[sp.clade], sp.genus);
        d.cause = M.text(d, sp);
      }
      d.range = new Uint8Array(this.grid.n);
      for (const c of cells) { d.range[c] = 1; sp.range[c] = 0; }
      this.rebuildCells(d);
      this.rebuildCells(sp);
      if (!skipName) {
        d.epithet = this.namer.epithet(d.genus, d, sp, null);
        d.common = this.namer.common(d, SE.CLADES[d.clade]);
      }
      this.speciations++;
      if (M && NOTABLE[M.k]) {
        const fk = M.k + ':' + SE.CLADES[sp.clade].key;
        if (!this.firsts[fk]) { this.firsts[fk] = t; notes.push({ kind: 'evo', k: M.k, id: d.id, cell: cells[0] }); }
      }
      return d;
    }

    driftBody(bp, rng) {
      const j = (k, s, lo, hi) => { if (typeof bp[k] === 'number') bp[k] = clamp(bp[k] + rng.normal() * s, lo, hi); };
      j('len', 0.05, 0.5, 2); j('girth', 0.03, 0.15, 0.75); j('neck', 0.02, 0, 0.6); j('head', 0.02, 0.15, 0.55); j('snout', 0.04, 0.1, 1);
      j('ears', 0.04, 0, 1); j('tail', 0.06, 0, 1.6); j('leg', 0.03, 0.08, 0.9); j('horn', 0.04, 0, 1); j('crest', 0.03, 0, 1);
      j('mantle', 0.05, 0.5, 2.2); j('mw', 0.03, 0.2, 1); j('armLen', 0.05, 0.3, 2); j('armW', 0.01, 0.03, 0.3);
      j('segs', 0.3, 2, 14); j('antenna', 0.05, 0, 2); j('mandible', 0.04, 0, 1); j('dorsal', 0.04, 0, 1); j('tailFork', 0.04, 0, 1);
      j('height', 0.05, 0.2, 2); j('crown', 0.05, 0.2, 1.6); j('branch', 0.05, 0.1, 1);
      if (typeof bp.hue === 'number') { bp.hue = (bp.hue + rng.normal() * 6 + 360) % 360; bp.sat = clamp(bp.sat + rng.normal() * 4, 0, 90); bp.lit = clamp(bp.lit + rng.normal() * 4, 8, 90); }
      if (typeof bp.leafHue === 'number') bp.leafHue = clamp(bp.leafHue + rng.normal() * 4, 40, 160);
      if (typeof bp.pattern === 'number' && rng.chance(0.05)) bp.pattern = rng.int(4);
      if (bp.arch === 'arthro' && rng.chance(0.03)) { bp.segs = clamp(Math.round(bp.segs) + 2, 2, 14); if (!bp.swim && bp.segs > 8) bp.legs = Math.min(10, bp.legs + 1); }
      if (bp.arch === 'tetra' && rng.chance(0.04)) bp.crest = clamp((bp.crest || 0) + 0.3, 0, 1);
    }

    rebuildOccupancy() {
      const h = this.hist, rich = this.richness, hu = this.hunt;
      h.fill(0); rich.fill(0); hu.fill(0);
      for (const id of this.alive) {
        const sp = this.species[id], g = sp.g;
        const animal = isAnimal(g);
        const sea = g.realm === 2 ? 1 : 0, high = g.troph >= 1.7 ? 1 : 0, b = massBin(g.mass);
        for (const c of sp.cells) {
          rich[c]++;
          if (!animal) continue;
          h[this.hidx(c, sea, high, b)]++;
          if (g.realm === 1) h[this.hidx(c, 1 - sea, high, b)]++;
          if (g.troph >= 2.4 && g.loco !== 1) { hu[(c * 2 + sea) * NB + b]++; if (g.realm === 1) hu[(c * 2 + 1 - sea) * NB + b]++; }
        }
      }
    }

    snapshot() {
      let total = 0;
      for (const id of this.alive) total += this.species[id].cells.length;
      const ids = new Int32Array(this.alive.length), offs = new Int32Array(this.alive.length + 1), cells = new Int16Array(total);
      let k = 0;
      this.alive.forEach((id, i) => { ids[i] = id; offs[i] = k; for (const c of this.species[id].cells) cells[k++] = c; });
      offs[this.alive.length] = k;
      return { ids, offs, cells };
    }

    /** Mass extinction pulse: kill(sp) returns a death probability. */
    pulse(t, killFn, cause) {
      let n = 0;
      for (const id of this.alive.slice()) {
        const sp = this.species[id];
        const p = killFn(sp);
        if (this.rng.chance(p)) { this.kill(sp, t, cause); n++; }
        else if (p > 0.15) {
          // Survivors lose part of their range.
          for (const c of sp.cells) if (this.rng.chance(p * 0.6)) sp.range[c] = 0;
          this.rebuildCells(sp);
          if (!sp.cells.length) { this.kill(sp, t, cause); n++; }
        }
      }
      this.rebuildOccupancy();
      return n;
    }

    serialize() {
      return {
        species: this.species.map(s => Object.assign({}, s, { g: Object.assign({}, s.g), bp: Object.assign({}, s.bp), trans: s.trans.slice(), range: s.range ? s.range.slice() : null, cells: s.cells.slice() })),
        alive: this.alive.slice(), speciations: this.speciations, extinctions: this.extinctions, firsts: Object.assign({}, this.firsts),
        rng: this.rng.state(), names: { used: [...this.namer.used], genera: [...this.namer.genera], rng: this.namer.rng.state() },
      };
    }
    restore(s) {
      this.species = s.species.map(x => Object.assign({}, x, { g: Object.assign({}, x.g), bp: Object.assign({}, x.bp), trans: x.trans.slice(), range: x.range ? x.range.slice() : null, cells: x.cells.slice() }));
      this.alive = s.alive.slice(); this.speciations = s.speciations; this.extinctions = s.extinctions; this.firsts = Object.assign({}, s.firsts);
      this.rng.setState(s.rng);
      this.namer.used = new Set(s.names.used); this.namer.genera = new Map(s.names.genera); this.namer.rng.setState(s.names.rng);
      this.rebuildOccupancy();
    }
  }

  SE.Life = Life;
  SE.LIFE = { MACRO, SCAP, isAnimal, isPlant, nicheKey };
})(globalThis.SE || (globalThis.SE = {}));
