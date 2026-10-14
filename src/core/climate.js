/*
 * Climate from geography. Annual means only, no seasons, no atmosphere model.
 *
 *  temperature = latitude curve + CO2 forcing (3 °C per doubling, amplified at the
 *                poles) + event anomalies + ice-albedo feedback - lapse rate
 *                + ocean-current term (warm western boundary currents, cold
 *                upwelling off subtropical west coasts) + maritime moderation
 *  precipitation = latitude bands (ITCZ, subtropical highs, storm tracks) scaled by
 *                how far moist air travels from the upwind ocean, with rain shadows
 *                behind mountains
 *  biome = a Whittaker-style lookup on temperature and precipitation
 *  sea level = set so continents keep a steady freeboard; ice ages expose more
 *                land and hothouses drown the margins.
 */
(function (SE) {
  'use strict';
  const { exp, log2 } = SE.math;

  const B = { DEEP: 0, SHELF: 1, REEF: 2, SEAICE: 3, ICE: 4, TUNDRA: 5, TAIGA: 6, TEMPERATE: 7, GRASS: 8, DESERT: 9, SAVANNA: 10, RAINFOREST: 11, ALPINE: 12 };
  const BIOME_NAMES = ['deep ocean', 'shelf sea', 'reef', 'sea ice', 'ice sheet', 'tundra', 'taiga', 'temperate forest', 'grassland', 'desert', 'savanna', 'rainforest', 'alpine'];
  const NPP = [0.3, 0.7, 1.0, 0.15, 0.02, 0.25, 0.5, 0.8, 0.6, 0.12, 0.7, 1.0, 0.2];
  const isLandBiome = b => b >= 4;
  // Zonal mean surface temperature at sea level; s2 = sin^2(latitude).
  function baseT(s2, dT) { const s4 = s2 * s2, s12 = s4 * s4 * s4; return 26 - 30 * s2 - 25 * s12 + dT * (1 + 1.2 * s2); }

  class Climate {
    constructor(grid, coarse) {
      this.grid = grid;
      this.coarse = coarse;
      const n = grid.n, nc = coarse.n;
      this.temp = new Float32Array(n);
      this.precip = new Float32Array(n);
      this.biome = new Uint8Array(n);
      this.coastDist = new Int32Array(n);
      this.seaLevel = 0;
      this.landFrac0 = -1;
      this.polar0 = -1;
      this.dT = 0;
      // Coarse aggregates for the life model.
      this.c = {
        land: new Float32Array(nc), Tl: new Float32Array(nc), Ts: new Float32Array(nc), P: new Float32Array(nc),
        forest: new Float32Array(nc), open: new Float32Array(nc), desert: new Float32Array(nc), ice: new Float32Array(nc),
        reef: new Float32Array(nc), shelf: new Float32Array(nc), deep: new Float32Array(nc), seaice: new Float32Array(nc),
        nppL: new Float32Array(nc), nppS: new Float32Array(nc), elevMax: new Float32Array(nc), young: new Float32Array(nc),
        domL: new Uint8Array(nc), domS: new Uint8Array(nc),
      };
    }

    update(tec, co2, anomaly, iceAge) {
      const grid = this.grid, n = grid.n, pos = grid.pos, as = grid.adjStart, adj = grid.adj;
      const elev = tec.elev;
      // Sea level from a target land fraction.
      // Elevation histogram in 10 m bins for the sea-level quantile.
      const HB = 2000, H0 = -10000;
      const hist = new Int32Array(HB);
      for (let i = 0; i < n; i++) { let b = Math.floor((elev[i] - H0) / 10); hist[b < 0 ? 0 : b >= HB ? HB - 1 : b]++; }
      if (this.landFrac0 < 0) {
        let l = 0; for (let i = 0; i < n; i++) if (elev[i] > 0) l++;
        this.landFrac0 = l / n;
      }
      const warm = Math.max(0, this.dT);
      const target = Math.min(0.45, Math.max(0.15, this.landFrac0 + 0.025 * iceAge - 0.004 * warm));
      const want = Math.floor((1 - target) * (n - 1));
      let acc = 0, hb = 0;
      for (; hb < HB; hb++) { acc += hist[hb]; if (acc > want) break; }
      this.seaLevel = H0 + hb * 10 + 5;
      const sea = this.seaLevel;
      const land = new Uint8Array(n);
      for (let i = 0; i < n; i++) land[i] = elev[i] > sea ? 1 : 0;
      // Ice-albedo: high-latitude land, relative to today.
      let polar = 0, pn = 0;
      for (let i = 0; i < n; i++) { const z = pos[i * 3 + 2]; if (z > 0.9 || z < -0.9) { pn++; if (land[i]) polar++; } }
      polar /= pn;
      if (this.polar0 < 0) this.polar0 = polar;
      this.dT = 3 * log2(co2 / 280) + anomaly - 9 * (polar - this.polar0);
      const dT = this.dT;
      // Distance to the sea (cells).
      const cd = this.coastDist;
      cd.fill(-1);
      let fr = [];
      for (let i = 0; i < n; i++) if (!land[i]) { cd[i] = 0; fr.push(i); }
      while (fr.length) {
        const nx = [];
        for (const c of fr) for (let k = as[c]; k < as[c + 1]; k++) { const j = adj[k]; if (cd[j] < 0) { cd[j] = cd[c] + 1; nx.push(j); } }
        fr = nx;
      }
      const T = this.temp, P = this.precip, latArr = grid.lat;
      // Ocean temperatures first.
      for (let i = 0; i < n; i++) {
        const z = pos[i * 3 + 2], s2 = z * z;
        const base = baseT(s2, dT);
        if (land[i]) { T[i] = base; continue; }
        let cur = 3.5 * s2; // poleward ocean heat transport
        const az = Math.abs(z);
        if (az > 0.3 && az < 0.85) { let j = i; for (let k = 0; k < 6; k++) { j = grid.west[j]; if (land[j]) { cur += 2.5; break; } } }
        if (az > 0.22 && az < 0.6) { let j = i; for (let k = 0; k < 4; k++) { j = grid.east[j]; if (land[j]) { cur -= 3; break; } } }
        T[i] = base + cur;
      }
      for (let i = 0; i < n; i++) {
        if (!land[i]) continue;
        const z = pos[i * 3 + 2], s2 = z * z;
        const latD = Math.abs(latArr[i]) * 57.29577951308232;
        const e = elev[i] - sea;
        let t = T[i] - 0.0065 * e - 0.7 * Math.min(cd[i], 8) * s2;
        // Upwind direction: trades (from the east) in the tropics, westerlies in mid-latitudes.
        const fromEast = latD < 30 || latD > 65;
        let j = i, k = 1, m = 0.04, shadow = 1;
        for (; k <= 24; k++) {
          j = fromEast ? grid.east[j] : grid.west[j];
          if (!land[j]) {
            m = exp(-k / 11) * shadow;
            if (k <= 3) t = 0.7 * t + 0.3 * (T[j] - 0.0065 * e);
            if (T[j] < baseT(s2, dT) + 3.5 * s2 - 1) m *= 0.5;
            break;
          }
          if (elev[j] - sea > 1800) shadow *= 0.45;
        }
        if (k > 24) m = 0.06 * shadow;
        // Monsoons and sea breezes: moisture from any nearby coast, strongest in the warm belt.
        m = Math.max(m, (latD < 35 ? 0.75 : 0.55) * exp(-cd[i] / (latD < 35 ? 5 : 3)));
        let p = 2300 * exp(-(latD / 11) * (latD / 11)) + 1000 * exp(-((latD - 50) / 13) * ((latD - 50) / 13)) + 220;
        p *= (0.2 + 0.8 * m) * Math.max(0.4, 1 + 0.05 * dT);
        if (latD < 35 && t > 14) p += 900 * exp(-cd[i] / 4); // summer monsoon off warm seas
        if (e > 1000) p *= 1.2;
        T[i] = t;
        P[i] = Math.max(20, p);
      }
      // Biomes.
      const bi = this.biome;
      for (let i = 0; i < n; i++) {
        const t = T[i], e = elev[i] - sea;
        if (!land[i]) {
          if (t < -1.8) bi[i] = B.SEAICE;
          else if (e > -220 && t >= 19) bi[i] = B.REEF;
          else if (e > -1200) bi[i] = B.SHELF;
          else bi[i] = B.DEEP;
          P[i] = 0;
          continue;
        }
        const p = P[i];
        if (t < -9) bi[i] = B.ICE;
        else if (e > 3200 && t < 6) bi[i] = B.ALPINE;
        else if (t < -2) bi[i] = B.TUNDRA;
        else if (p < 230 + 11 * Math.max(t, 0)) bi[i] = t < 3 ? B.TUNDRA : B.DESERT;
        else if (t < 3) bi[i] = p > 350 ? B.TAIGA : B.TUNDRA;
        else if (t >= 20) bi[i] = p > 1500 ? B.RAINFOREST : B.SAVANNA;
        else bi[i] = p > 750 ? B.TEMPERATE : B.GRASS;
      }
      this.aggregate(tec, land);
    }

    aggregate(tec, land) {
      const C = this.c, nc = this.coarse.n, own = this.coarse.owner, n = this.grid.n;
      for (const k in C) C[k].fill(0);
      const cnt = new Float32Array(nc), lc = new Float32Array(nc), hl = new Float32Array(nc * 13);
      for (let i = 0; i < n; i++) {
        const c = own[i], b = this.biome[i];
        cnt[c]++;
        hl[c * 13 + b]++;
        if (land[i]) {
          lc[c]++; C.Tl[c] += this.temp[i]; C.P[c] += this.precip[i]; C.nppL[c] += NPP[b];
          const e = tec.elev[i] - this.seaLevel;
          if (e > C.elevMax[c]) C.elevMax[c] = e;
        } else {
          C.Ts[c] += this.temp[i]; C.nppS[c] += NPP[b];
          if (tec.ctype[i] === 1 && tec.age[i] < 15) C.young[c]++;
        }
      }
      for (let c = 0; c < nc; c++) {
        const L = lc[c], S = cnt[c] - L;
        C.land[c] = L / cnt[c];
        if (L) { C.Tl[c] /= L; C.P[c] /= L; C.nppL[c] /= L; }
        if (S) { C.Ts[c] /= S; C.nppS[c] /= S; C.young[c] /= S; }
        if (!L) C.Tl[c] = C.Ts[c];
        if (!S) C.Ts[c] = C.Tl[c];
        const h = (b) => hl[c * 13 + b];
        if (L) {
          C.forest[c] = (h(B.TAIGA) + h(B.TEMPERATE) + h(B.RAINFOREST) + 0.4 * h(B.SAVANNA)) / L;
          C.open[c] = (h(B.TUNDRA) + h(B.GRASS) + h(B.DESERT) + h(B.SAVANNA) * 0.8 + h(B.ALPINE)) / L;
          C.desert[c] = h(B.DESERT) / L;
          C.ice[c] = h(B.ICE) / L;
        }
        if (S) {
          C.reef[c] = h(B.REEF) / S; C.shelf[c] = (h(B.SHELF) + h(B.REEF)) / S; C.deep[c] = h(B.DEEP) / S; C.seaice[c] = h(B.SEAICE) / S;
        }
        let bl = 255, bs = 255, ml = 0, ms = 0;
        for (let b = 0; b < 13; b++) { const v = h(b); if (isLandBiome(b)) { if (v > ml) { ml = v; bl = b; } } else if (v > ms) { ms = v; bs = b; } }
        C.domL[c] = bl; C.domS[c] = bs;
      }
    }
  }

  SE.Climate = Climate;
  SE.BIOME = B;
  SE.BIOME_NAMES = BIOME_NAMES;
  SE.NPP = NPP;
})(globalThis.SE || (globalThis.SE = {}));
