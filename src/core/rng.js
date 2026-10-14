/*
 * Seeded pseudo-random numbers, ported from bassettijonathan-rgb/evodevo (src/core/rng.ts).
 *
 * sfc32 with a cyrb128 string hash for seeding. 32-bit integer ops only, so it is
 * bit-identical in every JS engine. fork(label) derives an independent stream
 * without consuming draws from the parent: tectonics, climate, events and life
 * each get their own stream, so tuning one subsystem does not reshuffle the others.
 */
(function (SE) {
  'use strict';
  const { log, exp } = SE.math;

  function hash128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
      const k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }

  class Rng {
    constructor(seed) {
      this.seed = String(seed);
      [this.a, this.b, this.c, this.d] = hash128(this.seed);
      this.spare = null;
      for (let i = 0; i < 15; i++) this.u32();
    }
    fork(label) { return new Rng(this.seed + '/' + label); }
    u32() {
      const t = (((this.a + this.b) | 0) + this.d) | 0;
      this.d = (this.d + 1) | 0;
      this.a = this.b ^ (this.b >>> 9);
      this.b = (this.c + (this.c << 3)) | 0;
      this.c = (this.c << 21) | (this.c >>> 11);
      this.c = (this.c + t) | 0;
      return t >>> 0;
    }
    float() {
      const hi = this.u32() >>> 5, lo = this.u32() >>> 6;
      return (hi * 67108864 + lo) / 9007199254740992;
    }
    range(lo, hi) { return lo + (hi - lo) * this.float(); }
    int(n) { return Math.floor(this.float() * n); }
    chance(p) { return this.float() < p; }
    pick(arr) { return arr[this.int(arr.length)]; }
    normal() {
      if (this.spare !== null) { const s = this.spare; this.spare = null; return s; }
      let u, v, s;
      do { u = 2 * this.float() - 1; v = 2 * this.float() - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
      const f = Math.sqrt((-2 * log(s)) / s);
      this.spare = v * f;
      return u * f;
    }
    poisson(mean) {
      if (mean <= 0) return 0;
      let k = 0, p = 1;
      const limit = exp(-mean);
      do { k++; p *= this.float(); } while (p > limit);
      return k - 1;
    }
    state() { return [this.a, this.b, this.c, this.d, this.spare]; }
    setState(s) { [this.a, this.b, this.c, this.d, this.spare] = s; }
  }

  SE.Rng = Rng;
  SE.hash128 = hash128;
})(globalThis.SE || (globalThis.SE = {}));
