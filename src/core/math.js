/*
 * Portable math, ported from bassettijonathan-rgb/evodevo (src/core/math.ts, design D13).
 *
 * IEEE-754 guarantees correctly rounded +, -, *, / and sqrt, but NOT Math.exp,
 * Math.log, Math.sin... Engines may differ in the last bit, and a 200-million-year
 * run is chaotic enough to amplify that. Everything in the simulation that needs
 * exp/log/sin/cos goes through these, so a seed regrows the same world in any browser.
 */
(function (SE) {
  'use strict';
  const f64 = new Float64Array(1);
  const u32 = new Uint32Array(f64.buffer);

  function pow2(k) {
    u32[0] = 0;
    u32[1] = (k + 1023) << 20;
    return f64[0];
  }

  const LN2_HI = 6.93147180369123816490e-1;
  const LN2_LO = 1.90821492927058770002e-10;
  const INV_LN2 = 1.44269504088896338700;

  function expReference(x) {
    const k = x >= 0 ? Math.floor(x * INV_LN2 + 0.5) : -Math.floor(-x * INV_LN2 + 0.5);
    const r = x - k * LN2_HI - k * LN2_LO;
    let p = 1 / 6227020800;
    for (const c of [479001600, 39916800, 3628800, 362880, 40320, 5040, 720, 120, 24, 6, 2, 1, 1]) p = p * r + 1 / c;
    return p * pow2(k);
  }

  // Table-driven exp (Tang 1989), tables built from exactly rounded ops only.
  const EXP_N = 64;
  const TWO_POW_J_N = new Float64Array(EXP_N);
  for (let j = 0; j < EXP_N; j++) TWO_POW_J_N[j] = expReference((j * (LN2_HI + LN2_LO)) / EXP_N);
  const POW2_MIN = -1023;
  const POW2 = new Float64Array(2048 + 2);
  for (let m = POW2_MIN; m <= 1024; m++) POW2[m - POW2_MIN] = m >= -1022 && m <= 1023 ? pow2(m) : m < 0 ? pow2(-1022) / 2 : Infinity;
  const N_INV_LN2 = EXP_N * INV_LN2;
  const ROUND_SHIFT = 6755399441055744;
  const LN2_HI_N = LN2_HI / EXP_N;
  const LN2_LO_N = LN2_LO / EXP_N;

  function exp(x) {
    if (x !== x) return NaN;
    if (x > 709.7) return Infinity;
    if (x < -708.3) return 0;
    const k = x * N_INV_LN2 + ROUND_SHIFT - ROUND_SHIFT;
    const r = x - k * LN2_HI_N - k * LN2_LO_N;
    const j = k & (EXP_N - 1);
    const m = (k - j) / EXP_N;
    const p = 1 + r * (1 + r * (0.5 + r * (1 / 6 + r * (1 / 24 + r * (1 / 120 + r * (1 / 720))))));
    return POW2[m - POW2_MIN] * TWO_POW_J_N[j] * p;
  }

  const SQRT1_2 = 0.70710678118654752440;
  const LN2 = 0.69314718055994530942;

  function log(x) {
    if (!(x > 0)) return x === 0 ? -Infinity : NaN;
    if (x === Infinity) return Infinity;
    f64[0] = x;
    let e = ((u32[1] >>> 20) & 0x7ff) - 1023;
    if (e === -1023) {
      f64[0] = x * 18014398509481984;
      e = ((u32[1] >>> 20) & 0x7ff) - 1023 - 54;
    }
    u32[1] = (u32[1] & 0x800fffff) | 0x3ff00000;
    let m = f64[0];
    if (m > 2 * SQRT1_2) { m *= 0.5; e += 1; }
    const s = (m - 1) / (m + 1);
    const s2 = s * s;
    let p = 1 / 21;
    p = p * s2 + 1 / 19; p = p * s2 + 1 / 17; p = p * s2 + 1 / 15; p = p * s2 + 1 / 13;
    p = p * s2 + 1 / 11; p = p * s2 + 1 / 9; p = p * s2 + 1 / 7; p = p * s2 + 1 / 5;
    p = p * s2 + 1 / 3; p = p * s2 + 1;
    return e * LN2 + 2 * s * p;
  }

  const TWO_PI = 6.283185307179586;
  const PI = 3.141592653589793;

  function sin(x) {
    let r = x - TWO_PI * Math.floor((x + PI) / TWO_PI);
    if (r > PI) r -= TWO_PI;
    const r2 = r * r;
    let term = r, sum = r;
    for (let k = 1; k <= 13; k++) { term *= -r2 / ((2 * k) * (2 * k + 1)); sum += term; }
    return sum;
  }
  function cos(x) { return sin(x + PI / 2); }

  // atan by two half-angle reductions then an odd series; only +,-,*,/,sqrt.
  function atan(x) {
    let neg = false;
    if (x < 0) { neg = true; x = -x; }
    let inv = false;
    if (x > 1) { inv = true; x = 1 / x; }
    x = x / (1 + Math.sqrt(1 + x * x));
    x = x / (1 + Math.sqrt(1 + x * x));
    const x2 = x * x;
    let term = x, sum = x;
    for (let k = 1; k < 14; k++) { term *= -x2; sum += term / (2 * k + 1); }
    let r = 4 * sum;
    if (inv) r = PI / 2 - r;
    return neg ? -r : r;
  }
  function atan2(y, x) {
    if (x > 0) return atan(y / x);
    if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
    return y > 0 ? PI / 2 : y < 0 ? -PI / 2 : 0;
  }
  function asin(z) { return atan2(z, Math.sqrt(Math.max(0, 1 - z * z))); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function log2(x) { return log(x) / LN2; }
  const DEG = PI / 180;

  SE.math = { exp, log, log2, sin, cos, atan, atan2, asin, clamp, PI, DEG };
})(globalThis.SE || (globalThis.SE = {}));
