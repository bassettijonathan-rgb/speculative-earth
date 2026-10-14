/*
 * The planet's grid: a subdivided icosahedron. Its vertices are the cells; their
 * Voronoi regions form a hex grid with 12 pentagons (a Goldberg polyhedron).
 *
 * Subdivision keeps vertex indices, so the first 2562 vertices of the level-5
 * grid (10242 cells, ~240 km apart) are exactly the level-4 grid (~480 km). The
 * planet runs on level 5; life runs on level 4, and every fine cell belongs to
 * one coarse cell.
 */
(function (SE) {
  'use strict';
  const { asin, atan2 } = SE.math;

  function buildIcosphere(levels) {
    const t = (1 + Math.sqrt(5)) / 2;
    const pos = [];
    const add = (x, y, z) => { const l = Math.sqrt(x * x + y * y + z * z); pos.push(x / l, y / l, z / l); return pos.length / 3 - 1; };
    [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .forEach(v => add(v[0], v[1], v[2]));
    let faces = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
      3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
    const parent = [];
    for (let i = 0; i < 12; i++) parent.push(i);
    const levelStart = [0, 12];
    for (let lv = 0; lv < levels; lv++) {
      const cache = new Map();
      const mid = (a, b) => {
        const key = a < b ? a * 1e6 + b : b * 1e6 + a;
        let m = cache.get(key);
        if (m === undefined) {
          m = add(pos[a * 3] + pos[b * 3], pos[a * 3 + 1] + pos[b * 3 + 1], pos[a * 3 + 2] + pos[b * 3 + 2]);
          // A new vertex sits halfway between two old ones; give it to one of them,
          // alternating by index parity so coarse cells get balanced shares.
          parent.push(((a + b) & 1) ? Math.max(a, b) : Math.min(a, b));
          cache.set(key, m);
        }
        return m;
      };
      const nf = [];
      for (let i = 0; i < faces.length; i += 3) {
        const a = faces[i], b = faces[i + 1], c = faces[i + 2];
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        nf.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
      }
      faces = nf;
      levelStart.push(pos.length / 3);
    }
    const n = pos.length / 3;
    // Adjacency in CSR form.
    const sets = Array.from({ length: n }, () => new Set());
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2];
      sets[a].add(b); sets[a].add(c); sets[b].add(a); sets[b].add(c); sets[c].add(a); sets[c].add(b);
    }
    const adjStart = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) adjStart[i + 1] = adjStart[i] + sets[i].size;
    const adj = new Int32Array(adjStart[n]);
    for (let i = 0; i < n; i++) { let k = adjStart[i]; for (const j of [...sets[i]].sort((x, y) => x - y)) adj[k++] = j; }
    return { n, pos: new Float64Array(pos), faces: new Int32Array(faces), adjStart, adj, parent: new Int32Array(parent), levelStart };
  }

  class Grid {
    constructor(levels) {
      const g = buildIcosphere(levels);
      Object.assign(this, g);
      const n = this.n;
      this.lat = new Float64Array(n); this.lon = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        this.lat[i] = asin(this.pos[i * 3 + 2]);
        this.lon[i] = atan2(this.pos[i * 3 + 1], this.pos[i * 3]);
      }
      // East and west neighbours: the neighbour best aligned with the local east vector.
      this.east = new Int32Array(n); this.west = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        const x = this.pos[i * 3], y = this.pos[i * 3 + 1];
        const l = Math.sqrt(x * x + y * y) || 1;
        const ex = -y / l, ey = x / l;
        let best = -2, worst = 2, bi = i, wi = i;
        for (let k = this.adjStart[i]; k < this.adjStart[i + 1]; k++) {
          const j = this.adj[k];
          const d = (this.pos[j * 3] - x) * ex + (this.pos[j * 3 + 1] - y) * ey;
          if (d > best) { best = d; bi = j; }
          if (d < worst) { worst = d; wi = j; }
        }
        this.east[i] = bi; this.west[i] = wi;
      }
    }
    /** Greedy walk to the cell nearest to unit vector (x,y,z), starting at `start`. */
    nearest(x, y, z, start) {
      const p = this.pos, as = this.adjStart, adj = this.adj;
      let cur = start, best = p[cur * 3] * x + p[cur * 3 + 1] * y + p[cur * 3 + 2] * z;
      for (;;) {
        let moved = false;
        for (let k = as[cur], e = as[cur + 1]; k < e; k++) {
          const j = adj[k];
          const d = p[j * 3] * x + p[j * 3 + 1] * y + p[j * 3 + 2] * z;
          if (d > best) { best = d; cur = j; moved = true; }
        }
        if (!moved) return cur;
      }
    }
    /** Nearest cell from scratch: check the 12 base vertices then walk. */
    nearestAny(x, y, z) {
      let bi = 0, bd = -2;
      for (let i = 0; i < 12; i++) {
        const d = this.pos[i * 3] * x + this.pos[i * 3 + 1] * y + this.pos[i * 3 + 2] * z;
        if (d > bd) { bd = d; bi = i; }
      }
      return this.nearest(x, y, z, bi);
    }
    /** Coarse-grid view: the first `levelStart[k]` vertices with their own adjacency. */
    coarse(level) {
      const nc = this.levelStart[level + 1];
      const g = buildIcosphere(level);
      if (g.n !== nc) throw new Error('grid mismatch');
      // Map each fine cell to the coarse cell it descends from.
      const owner = new Int32Array(this.n);
      for (let i = 0; i < this.n; i++) {
        let j = i;
        while (j >= nc) j = this.parent[j];
        owner[i] = j;
      }
      return { n: nc, pos: g.pos, adjStart: g.adjStart, adj: g.adj, owner, lat: this.lat.subarray(0, nc), lon: this.lon.subarray(0, nc) };
    }
  }

  SE.Grid = Grid;
})(globalThis.SE || (globalThis.SE = {}));
