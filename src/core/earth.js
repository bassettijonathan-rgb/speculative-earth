/*
 * Today's Earth, coarsely: a 1-degree land mask (rasterised from Natural Earth
 * 110m land via world-atlas, see tools/make-landmask.js), hand-placed mountain
 * belts, 12 plates with present-day Euler poles, and mantle hotspots.
 */
(function (SE) {
  'use strict';
  const { DEG, sin, cos } = SE.math;

  let maskBits = null;
  function mask() {
    if (maskBits) return maskBits;
    maskBits = new Uint8Array(360 * 180);
    let i = 0, v = 0;
    for (const r of SE.LANDMASK.split(',')) { const n = parseInt(r, 36); maskBits.fill(v, i, i + n); i += n; v ^= 1; }
    return maskBits;
  }
  function isLandLL(latD, lonD) {
    if (latD < -78) return true; // interior Antarctica (the mask's polar row is unreliable)
    const m = mask();
    let y = Math.floor(90 - latD); if (y < 0) y = 0; if (y > 179) y = 179;
    let x = Math.floor(lonD + 180); x = ((x % 360) + 360) % 360;
    return m[y * 360 + x] === 1;
  }

  // Plates: id, name, Euler pole (lat, lon, deg/My), roughly NNR-NUVEL-1A.
  const PLATES = [
    { name: 'Pacific', pole: [-63.0, 107.4, 0.64] },
    { name: 'North American', pole: [-2.4, -83.2, 0.21] },
    { name: 'South American', pole: [-25.4, -124.6, 0.12] },
    { name: 'Eurasian', pole: [50.6, -112.3, 0.23] },
    { name: 'African', pole: [50.6, -74.0, 0.29] },
    { name: 'Antarctic', pole: [62.9, -116.0, 0.24] },
    { name: 'Indian', pole: [45.5, 0.3, 0.55] },
    { name: 'Australian', pole: [33.9, 33.2, 0.65] },
    { name: 'Nazca', pole: [47.8, -100.2, 0.74] },
    { name: 'Cocos', pole: [24.5, -115.8, 1.2] },
    { name: 'Philippine Sea', pole: [-46.0, -31.4, 0.9] },
    { name: 'Arabian', pole: [45.2, -4.4, 0.55] },
  ];

  // Which plate a piece of today's land sits on (lat/lon in degrees).
  function landPlate(lat, lon) {
    if (lat < -60) return 5;
    if (lat > 59 && lon > -75 && lon < -10) return 1; // Greenland
    if (lon >= -170 && lon <= -50 && lat > 8.5) return 1;
    if (lon > 160 && lat > 50) return 1; // far east Siberia rides with North America
    if (lon >= -82 && lon <= -34 && lat <= 12.5) return 2;
    if (lon >= 66 && lon <= 92 && lat >= 5 && lat <= 28) return 6;
    if (lon >= 110 && lat <= -9) return 7;
    if (lon >= 130 && lon <= 152 && lat <= 0 && lat >= -12) return 7;
    if (lon >= 165 && lat <= -30) return 7;
    if (lon >= 120 && lon <= 128 && lat >= 5 && lat <= 19) return 10;
    if (lat >= 12 && lat <= 32 && lon >= 36 && lon <= 60 && (lon >= 39 || lat > 28)) return 11;
    if (lon >= -20 && lon <= 52 && lat >= -36 && lat <= 37.5) return 4;
    return 3;
  }
  const OCEAN_SEEDS = [
    [0, -150, 0], [30, -170, 0], [-30, -140, 0], [20, 170, 0], [-15, -170, 0], [40, -160, 0], [-50, -150, 0],
    [-20, -95, 8], [-35, -100, 8], [8, -95, 9], [15, 135, 10], [25, 140, 10],
  ];

  // Mountain belts: polyline (lat, lon), peak height (m), half-width (degrees).
  const RANGES = [
    { pts: [[35, 72], [30, 80], [29, 87], [29, 96]], h: 5200, w: 2.2 },
    { pts: [[34, 80], [35, 90], [33, 100]], h: 4400, w: 3.5 },
    { pts: [[42, 72], [43, 82], [44, 92]], h: 3000, w: 3 },
    { pts: [[49, 88], [50, 100], [47, 107]], h: 1800, w: 4 },
    { pts: [[10, -73], [0, -78], [-15, -72], [-30, -69], [-45, -72], [-53, -72]], h: 4200, w: 2.5 },
    { pts: [[62, -150], [60, -138], [52, -120], [45, -112], [38, -107], [32, -107], [20, -101]], h: 2600, w: 4 },
    { pts: [[44, 5], [46, 9], [47, 14]], h: 2600, w: 1.5 },
    { pts: [[43, 40], [42, 48]], h: 3000, w: 1.5 },
    { pts: [[38, 44], [33, 48], [28, 56]], h: 2200, w: 2.5 },
    { pts: [[67, 65], [52, 59]], h: 1000, w: 2 },
    { pts: [[14, 38], [8, 38], [-3, 36], [-10, 34]], h: 2000, w: 3 },
    { pts: [[33, -6], [36, 3]], h: 2000, w: 1.5 },
    { pts: [[47, -70], [40, -78], [34, -84]], h: 900, w: 2 },
    { pts: [[69, 18], [62, 9]], h: 1100, w: 2 },
    { pts: [[-15, 145], [-28, 152], [-37, 147]], h: 900, w: 2 },
    { pts: [[-15, -45], [-22, -44]], h: 900, w: 4 },
    { pts: [[-80, -60], [-85, 40], [-80, 120]], h: 2600, w: 12 },
    { pts: [[72, -40], [66, -40]], h: 2400, w: 6 },
    { pts: [[60, 150], [66, 135]], h: 1300, w: 3 },
  ];

  // Mantle hotspots fixed in the deep frame (lat, lon): Hawaii, Iceland, Yellowstone,
  // Reunion, Galapagos, Afar, Tristan, Kerguelen, Samoa.
  const HOTSPOTS = [[19, -155], [64, -18], [44, -110], [-21, 55], [0, -91], [11, 41], [-37, -12], [-49, 69], [-14, -170]];

  function vec(lat, lon) {
    const la = lat * DEG, lo = lon * DEG;
    return [cos(la) * cos(lo), cos(la) * sin(lo), sin(la)];
  }

  function distToPolyline(p, pts) {
    // Angular distance in degrees from unit vector p to a polyline of lat/lon points.
    let best = 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = vec(pts[i][0], pts[i][1]), b = vec(pts[i + 1][0], pts[i + 1][1]);
      for (let s = 0; s <= 8; s++) {
        const f = s / 8;
        let x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
        const l = Math.sqrt(x * x + y * y + z * z); x /= l; y /= l; z /= l;
        const d = Math.sqrt((p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2) / DEG;
        if (d < best) best = d;
      }
    }
    return best;
  }

  /** Build today's crust on the grid: plate id, crust type, elevation, age. */
  function presentDay(grid, rng) {
    const n = grid.n;
    const land = new Uint8Array(n);
    for (let i = 0; i < n; i++) land[i] = isLandLL(grid.lat[i] / DEG, grid.lon[i] / DEG) ? 1 : 0;
    const plate = new Int8Array(n).fill(-1);
    // Seed plates from land and ocean seed points, then grow outwards breadth-first.
    let frontier = [];
    for (let i = 0; i < n; i++) if (land[i]) { plate[i] = landPlate(grid.lat[i] / DEG, grid.lon[i] / DEG); frontier.push(i); }
    for (const [la, lo, p] of OCEAN_SEEDS) {
      const v = vec(la, lo); const c = grid.nearestAny(v[0], v[1], v[2]);
      if (plate[c] < 0) { plate[c] = p; frontier.push(c); }
    }
    while (frontier.length) {
      const next = [];
      // Shuffle deterministically so boundaries are not grid-aligned.
      for (let i = frontier.length - 1; i > 0; i--) { const j = rng.int(i + 1); const t = frontier[i]; frontier[i] = frontier[j]; frontier[j] = t; }
      for (const c of frontier) {
        for (let k = grid.adjStart[c]; k < grid.adjStart[c + 1]; k++) {
          const j = grid.adj[k];
          if (plate[j] < 0) { plate[j] = plate[c]; next.push(j); }
        }
      }
      frontier = next;
    }
    // Ocean age: distance from the nearest oceanic plate boundary (a ridge), ~12 My per cell.
    const dist = new Int32Array(n).fill(-1);
    frontier = [];
    for (let i = 0; i < n; i++) {
      if (land[i]) continue;
      for (let k = grid.adjStart[i]; k < grid.adjStart[i + 1]; k++) {
        const j = grid.adj[k];
        if (plate[j] !== plate[i] && !land[j]) { dist[i] = 0; frontier.push(i); break; }
      }
    }
    while (frontier.length) {
      const next = [];
      for (const c of frontier) for (let k = grid.adjStart[c]; k < grid.adjStart[c + 1]; k++) {
        const j = grid.adj[k];
        if (dist[j] < 0 && !land[j]) { dist[j] = dist[c] + 1; next.push(j); }
      }
      frontier = next;
    }
    // Distance to coast (cells), for continental interiors and shelves.
    const coast = new Int32Array(n).fill(-1);
    frontier = [];
    for (let i = 0; i < n; i++) {
      for (let k = grid.adjStart[i]; k < grid.adjStart[i + 1]; k++) if (land[grid.adj[k]] !== land[i]) { coast[i] = 0; frontier.push(i); break; }
    }
    while (frontier.length) {
      const next = [];
      for (const c of frontier) for (let k = grid.adjStart[c]; k < grid.adjStart[c + 1]; k++) {
        const j = grid.adj[k];
        if (coast[j] < 0 && land[j] === land[c]) { coast[j] = coast[c] + 1; next.push(j); }
      }
      frontier = next;
    }
    const ctype = new Int8Array(n), elev = new Float32Array(n), age = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = [grid.pos[i * 3], grid.pos[i * 3 + 1], grid.pos[i * 3 + 2]];
      if (land[i]) {
        ctype[i] = 2;
        let e = 90 + Math.min(coast[i], 6) * 40 + rng.range(-40, 40);
        for (const r of RANGES) {
          const d = distToPolyline(p, r.pts);
          if (d < r.w * 2) { const f = Math.max(0, 1 - d / (r.w * 2)); e = Math.max(e, 200 + r.h * f * f * (0.85 + 0.3 * rng.float())); }
        }
        elev[i] = e;
        age[i] = 500;
      } else if (coast[i] === 0) {
        // Continental shelf: drowned continental crust.
        ctype[i] = 2; elev[i] = -140 - rng.range(0, 60); age[i] = 500;
      } else {
        ctype[i] = 1;
        const a = Math.min(180, (dist[i] < 0 ? 15 : dist[i]) * 12 + rng.range(0, 6));
        age[i] = a;
        elev[i] = oceanDepth(a);
      }
    }
    return { plate, ctype, elev, age };
  }

  function oceanDepth(age) { return Math.max(-6200, -2600 - 330 * Math.sqrt(Math.max(0, age))); }

  // Continent tags for today's land, used to place starting species.
  function continentOf(lat, lon) {
    if (lat < -60) return 'AN';
    if (lat > 59 && lon > -75 && lon < -10) return 'NA';
    if (lon >= -170 && lon <= -50 && lat > 8.5) return 'NA';
    if (lon >= -82 && lon <= -34 && lat <= 12.5) return 'SA';
    if (lon >= 110 && lat <= -9) return 'AU';
    if (lon >= 130 && lon <= 152 && lat <= 0 && lat >= -12) return 'AU';
    if (lon >= 165 && lat <= -30) return 'AU';
    if (lon >= -20 && lon <= 52 && lat >= -36 && lat <= 37.5 && !(lat > 12 && lon > 36)) return 'AF';
    if (lat > 36 && lon > -25 && lon < 45) return 'EU';
    if (lat > 48 && lon >= 45 && lon < 60) return 'EU';
    return 'AS';
  }
  function oceanOf(lat, lon) {
    if (lat < -55) return 'SO';
    if (lat > 66) return 'AR';
    if (lon > -70 && lon < 20 && lat > -55) return 'AT';
    if (lon >= 20 && lon < 120 && lat < 30) return 'IN';
    if (lon > -100 && lon <= -70 && lat > 8) return 'AT';
    return 'PA';
  }

  SE.earth = { PLATES, HOTSPOTS, presentDay, oceanDepth, continentOf, oceanOf, vec, isLandLL };
})(globalThis.SE || (globalThis.SE = {}));
