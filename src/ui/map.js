/*
 * The map: an equirectangular raster of the icosphere. Each raster pixel stores
 * the triangle of grid cells it falls in and its barycentric weights, so
 * elevation is interpolated smoothly and the coastline is drawn where the
 * interpolated height crosses sea level instead of along hex edges.
 */
(function (SE) {
  'use strict';
  const RW = 1024, RH = 512;

  const LAND = {
    4: [226, 233, 234], 5: [158, 157, 128], 6: [78, 104, 74], 7: [96, 126, 72], 8: [170, 166, 104], 9: [206, 178, 124],
    10: [184, 156, 88], 11: [44, 102, 60], 12: [140, 136, 126],
  };
  const SEA_DEEP = [14, 40, 62], SEA_SHELF = [42, 104, 122], REEF = [64, 162, 156], SEA_ICE = [196, 214, 220];
  // A muted thermal ramp from ice blue through sand to rust.
  const TEMP_STOPS = [[-40, [222, 236, 244]], [-15, [128, 170, 205]], [0, [74, 118, 152]], [10, [96, 140, 110]], [18, [196, 182, 110]], [26, [210, 140, 74]], [36, [158, 58, 40]]];
  const RICH_STOPS = [[0, [24, 34, 44]], [0.15, [38, 72, 92]], [0.4, [52, 128, 124]], [0.7, [150, 184, 110]], [1, [240, 222, 140]]];

  function ramp(stops, v) {
    if (v <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const [a, ca] = stops[i - 1], [b, cb] = stops[i];
        const f = (v - a) / (b - a);
        return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f];
      }
    }
    return stops[stops.length - 1][1];
  }

  function plateColor(p) {
    const h = (p * 137.508) % 360, s = 0.32, l = 0.42;
    const f = (n) => { const k = (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
    return [f(0), f(8), f(4)];
  }

  /** Separable box blur, wrapping east-west and clamped at the poles. */
  function blur(A, T, r) {
    const k = 1 / (2 * r + 1);
    for (let y = 0; y < RH; y++) {
      const row = y * RW;
      let acc = 0;
      for (let d = -r; d <= r; d++) acc += A[row + ((d + RW) % RW)];
      for (let x = 0; x < RW; x++) {
        T[row + x] = acc * k;
        acc += A[row + (x + r + 1) % RW] - A[row + (x - r + RW) % RW];
      }
    }
    for (let x = 0; x < RW; x++) {
      let acc = 0;
      for (let d = -r; d <= r; d++) acc += T[Math.min(RH - 1, Math.max(0, d)) * RW + x];
      for (let y = 0; y < RH; y++) {
        A[y * RW + x] = acc * k;
        acc += T[Math.min(RH - 1, y + r + 1) * RW + x] - T[Math.max(0, y - r) * RW + x];
      }
    }
  }

  /** Pixel -> (three cells, three weights) for the whole raster. */
  function buildLookup(grid) {
    const n = grid.n, F = grid.faces, P = grid.pos;
    const fcount = new Int32Array(n + 1);
    for (let i = 0; i < F.length; i++) fcount[F[i] + 1]++;
    for (let i = 0; i < n; i++) fcount[i + 1] += fcount[i];
    const fl = new Int32Array(F.length), fill = fcount.slice(0, n);
    for (let f = 0; f < F.length / 3; f++) for (let k = 0; k < 3; k++) fl[fill[F[f * 3 + k]]++] = f;
    const idx = new Int32Array(RW * RH * 3), wt = new Float32Array(RW * RH * 3);
    let cur = 0;
    for (let y = 0; y < RH; y++) {
      const lat = Math.PI / 2 - (y + 0.5) / RH * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
      for (let x = 0; x < RW; x++) {
        const lon = -Math.PI + (x + 0.5) / RW * 2 * Math.PI;
        const px = cl * Math.cos(lon), py = cl * Math.sin(lon), pz = sl;
        cur = x === 0 ? grid.nearestAny(px, py, pz) : grid.nearest(px, py, pz, cur);
        if (x === 0 && y > 0) cur = grid.nearest(px, py, pz, cur);
        let done = false;
        const o = (y * RW + x) * 3;
        for (let k = fcount[cur]; k < fcount[cur + 1] && !done; k++) {
          const f = fl[k], a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
          const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
          const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
          const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
          const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
          const den = nx * px + ny * py + nz * pz;
          if (Math.abs(den) < 1e-12) continue;
          const s = (nx * ax + ny * ay + nz * az) / den;
          const qx = px * s - ax, qy = py * s - ay, qz = pz * s - az;
          const d00 = e1x * e1x + e1y * e1y + e1z * e1z, d01 = e1x * e2x + e1y * e2y + e1z * e2z, d11 = e2x * e2x + e2y * e2y + e2z * e2z;
          const d20 = qx * e1x + qy * e1y + qz * e1z, d21 = qx * e2x + qy * e2y + qz * e2z;
          const dn = d00 * d11 - d01 * d01;
          const v = (d11 * d20 - d01 * d21) / dn, w = (d00 * d21 - d01 * d20) / dn, u = 1 - v - w;
          if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) {
            idx[o] = a; idx[o + 1] = b; idx[o + 2] = c; wt[o] = u; wt[o + 1] = v; wt[o + 2] = w; done = true;
          }
        }
        if (!done) { idx[o] = idx[o + 1] = idx[o + 2] = cur; wt[o] = 1; wt[o + 1] = wt[o + 2] = 0; }
      }
    }
    return { idx, wt };
  }

  class MapView {
    constructor(canvas, grid, coarse) {
      this.canvas = canvas; this.grid = grid; this.coarse = coarse;
      this.ctx = canvas.getContext('2d');
      this.raster = document.createElement('canvas');
      this.raster.width = RW; this.raster.height = RH;
      this.rctx = this.raster.getContext('2d');
      this.img = this.rctx.createImageData(RW, RH);
      this.E = new Float32Array(RW * RH); this.S = new Float32Array(RW * RH); this.tmp = new Float32Array(RW * RH); this.sv = new Float32Array(grid.n);
      const L = buildLookup(grid);
      this.idx = L.idx; this.wt = L.wt;
      this.mode = 'biome';
      this.frame = null; this.range = null; this.marker = null; this.pulses = [];
      this.zoom = 1; this.panX = 0; this.panY = 0;
      this.dirty = true; this.rasterDirty = true;
      this.onTap = null;
      this.vc = new Float32Array(grid.n * 3); this.vs = new Float32Array(grid.n * 3);
      this.inRange = new Uint8Array(grid.n);
      this.bindInput();
      this.resize();
      this.center();
      const loop = () => { this.draw(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }

    setFrame(f) { this.frame = f; this.rasterDirty = true; this.dirty = true; }
    setMode(m) { this.mode = m; this.rasterDirty = true; this.dirty = true; }
    setRange(cells) {
      this.range = cells && cells.length ? cells : null;
      if (this.range) {
        const set = new Uint8Array(this.coarse.n);
        for (const c of cells) set[c] = 1;
        const own = this.coarse.owner;
        for (let v = 0; v < this.grid.n; v++) this.inRange[v] = set[own[v]];
      }
      this.rasterDirty = true; this.dirty = true;
    }
    setMarker(cell) { this.marker = cell; this.dirty = true; }
    pulse(cell) { if (cell >= 0) { this.pulses.push({ cell, t0: performance.now() }); this.dirty = true; } }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      this.cw = r.width; this.ch = r.height;
      this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.dpr = dpr;
      if (!this.userMoved) this.center(); else this.clampPan();
      this.dirty = true;
    }

    center() { this.zoom = this.minZoom(); this.panX = this.cw / 2 - RW * this.scale() / 2; this.clampPan(); this.dirty = true; }
    scale() { return this.cw / RW * this.zoom; }
    minZoom() { return Math.max(1, this.ch / (RH * this.cw / RW)); }
    clampPan() {
      if (this.zoom < this.minZoom()) this.zoom = this.minZoom();
      const s = this.scale(), h = RH * s;
      if (h <= this.ch) this.panY = (this.ch - h) / 2;
      else this.panY = Math.min(0, Math.max(this.ch - h, this.panY));
      const w = RW * s;
      this.panX = ((this.panX % w) + w) % w;
    }

    cellToXY(cell) {
      const lat = this.grid.lat[cell], lon = this.grid.lon[cell];
      return [(lon + Math.PI) / (2 * Math.PI) * RW, (Math.PI / 2 - lat) / Math.PI * RH];
    }

    paintRaster() {
      const f = this.frame; if (!f) return;
      const n = this.grid.n, vc = this.vc, vs = this.vs, mode = this.mode;
      const elev = f.elev, biome = f.biome;
      // Per-cell colours: land colour and sea colour (or the overlay value).
      let rich = null, rmax = 1;
      if (mode === 'rich') {
        rich = new Float32Array(n);
        for (let c = 0; c < this.coarse.n; c++) if (f.rich[c] > rmax) rmax = f.rich[c];
        const own = this.coarse.owner;
        for (let v = 0; v < n; v++) rich[v] = f.rich[own[v]] / rmax;
      }
      for (let v = 0; v < n; v++) {
        const b = biome[v], e = elev[v];
        let lc, sc;
        if (mode === 'temp') { lc = sc = ramp(TEMP_STOPS, f.temp[v]); }
        else if (mode === 'rich') { lc = sc = ramp(RICH_STOPS, Math.sqrt(rich[v])); }
        else if (mode === 'plate') { const p = plateColor(f.plate[v]); lc = [p[0] + 40, p[1] + 40, p[2] + 40]; sc = p; }
        else {
          lc = LAND[b] || LAND[e > 2500 ? 12 : 8];
          if (b !== 4 && e > 1500) { const k = Math.min(1, (e - 1500) / 3500) * 0.55; lc = [lc[0] + (150 - lc[0]) * k, lc[1] + (144 - lc[1]) * k, lc[2] + (134 - lc[2]) * k]; }
          if (b === 3) sc = SEA_ICE;
          else if (b === 2) sc = REEF;
          else {
            const d = Math.min(1, Math.max(0, -e / 4500));
            sc = [SEA_SHELF[0] + (SEA_DEEP[0] - SEA_SHELF[0]) * Math.sqrt(d), SEA_SHELF[1] + (SEA_DEEP[1] - SEA_SHELF[1]) * Math.sqrt(d), SEA_SHELF[2] + (SEA_DEEP[2] - SEA_SHELF[2]) * Math.sqrt(d)];
          }
        }
        vc[v * 3] = lc[0]; vc[v * 3 + 1] = lc[1]; vc[v * 3 + 2] = lc[2];
        vs[v * 3] = sc[0]; vs[v * 3 + 1] = sc[1]; vs[v * 3 + 2] = sc[2];
      }
      const idx = this.idx, wt = this.wt, E = this.E, S = this.S, N = RW * RH;
      // Land/sea is decided on a squashed height so the coast runs midway between
      // a land cell and a sea cell, rather than hugging the land cell because the
      // ocean floor is kilometres deep.
      const sv = this.sv;
      for (let v = 0; v < n; v++) { const e = elev[v]; sv[v] = e > 0 ? Math.min(1, 0.5 + e / 800) : Math.max(-1, -0.5 + e / 800); }
      for (let p = 0, o = 0; p < N; p++, o += 3) {
        const a = idx[o], b = idx[o + 1], c = idx[o + 2];
        E[p] = elev[a] * wt[o] + elev[b] * wt[o + 1] + elev[c] * wt[o + 2];
        S[p] = sv[a] * wt[o] + sv[b] * wt[o + 1] + sv[c] * wt[o + 2];
      }
      // Soften the triangle facets so coastlines curve instead of zigzagging.
      blur(S, this.tmp, 3); blur(S, this.tmp, 2);
      const D = this.img.data, plateMode = mode === 'plate', ovl = mode === 'temp' || mode === 'rich';
      const range = this.range, inR = this.inRange;
      for (let y = 0; y < RH; y++) {
        for (let x = 0; x < RW; x++) {
          const p = y * RW + x, o = p * 3;
          const land = S[p] > 0;
          const src = land ? vc : vs;
          let r = 0, g = 0, b = 0, ws = 0;
          if (plateMode) {
            let k = o; if (wt[o + 1] > wt[k]) k = o + 1; if (wt[o + 2] > wt[k]) k = o + 2;
            const c = idx[k]; r = src[c * 3]; g = src[c * 3 + 1]; b = src[c * 3 + 2]; ws = 1;
            if (f.plate[idx[o]] !== f.plate[idx[o + 1]] || f.plate[idx[o]] !== f.plate[idx[o + 2]]) { r *= 0.7; g *= 0.7; b *= 0.7; }
          } else {
            for (let k = 0; k < 3; k++) {
              const c = idx[o + k];
              // Blend only cells on the same side of the coast, so colours stay crisp there.
              if (!ovl && (elev[c] > 0) !== land) continue;
              const w = wt[o + k] + 1e-4;
              r += src[c * 3] * w; g += src[c * 3 + 1] * w; b += src[c * 3 + 2] * w; ws += w;
            }
            if (ws === 0) { const c = idx[o]; r = src[c * 3]; g = src[c * 3 + 1]; b = src[c * 3 + 2]; ws = 1; }
          }
          r /= ws; g /= ws; b /= ws;
          // Hillshade from the interpolated height field, lit from the north-west.
          const xl = x > 0 ? p - 1 : p + RW - 1, xr = x < RW - 1 ? p + 1 : p - RW + 1;
          const yu = y > 0 ? p - RW : p, yd = y < RH - 1 ? p + RW : p;
          let sh;
          if (land) sh = 1 + Math.max(-0.45, Math.min(0.45, (Math.max(0, E[xl]) - Math.max(0, E[xr]) + Math.max(0, E[yu]) - Math.max(0, E[yd])) / 2600));
          else sh = 1 + Math.max(-0.12, Math.min(0.12, (E[xl] - E[xr] + E[yu] - E[yd]) / 9000));
          // A thin dark coastline.
          if (land && (S[xl] <= 0 || S[xr] <= 0 || S[yu] <= 0 || S[yd] <= 0)) sh *= ovl ? 0.55 : 0.72;
          if (ovl && !land) sh *= 0.82;
          r *= sh; g *= sh; b *= sh;
          if (range) {
            const inside = inR[idx[o]] * wt[o] + inR[idx[o + 1]] * wt[o + 1] + inR[idx[o + 2]] * wt[o + 2];
            if (inside < 0.5) { const m = 0.28; r = r * m + 8; g = g * m + 14; b = b * m + 20; }
            else if (inside < 0.62) { r = 236; g = 206; b = 140; }
          }
          const d = p * 4;
          D[d] = r; D[d + 1] = g; D[d + 2] = b; D[d + 3] = 255;
        }
      }
      this.rctx.putImageData(this.img, 0, 0);
    }

    draw() {
      const now = performance.now();
      this.pulses = this.pulses.filter(p => now - p.t0 < 2600);
      if (!this.dirty && !this.pulses.length) return;
      if (this.rasterDirty) { this.paintRaster(); this.rasterDirty = false; }
      this.dirty = false;
      const ctx = this.ctx, dpr = this.dpr, s = this.scale();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = getComputedStyle(this.canvas).getPropertyValue('--map-bg') || '#0b1a24';
      ctx.fillRect(0, 0, this.cw, this.ch);
      if (!this.frame) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const w = RW * s, h = RH * s;
      for (let x0 = this.panX - w; x0 < this.cw; x0 += w) {
        ctx.drawImage(this.raster, x0, this.panY, w, h);
        // Graticule every 30 degrees.
        ctx.strokeStyle = 'rgba(220,235,235,0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let lo = 0; lo <= 12; lo++) { const xx = Math.round(x0 + lo / 12 * w) + 0.5; ctx.moveTo(xx, this.panY); ctx.lineTo(xx, this.panY + h); }
        for (let la = 1; la < 6; la++) { const yy = Math.round(this.panY + la / 6 * h) + 0.5; ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); }
        ctx.stroke();
        const mark = (cell, r, color, lw) => {
          const [mx, my] = this.cellToXY(cell);
          ctx.strokeStyle = color; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.arc(x0 + mx * s, this.panY + my * s, r, 0, Math.PI * 2); ctx.stroke();
        };
        if (this.marker !== null && this.marker >= 0) { mark(this.marker, 9, 'rgba(10,20,26,0.8)', 4); mark(this.marker, 9, '#f2e6c4', 2); }
        for (const p of this.pulses) {
          const a = (now - p.t0) / 2600;
          for (let k = 0; k < 2; k++) {
            const aa = (a * 2 + k * 0.5) % 1;
            mark(p.cell, 6 + aa * 34, `rgba(240,200,140,${(1 - aa) * 0.9})`, 2);
          }
        }
      }
    }

    bindInput() {
      const c = this.canvas, pts = new Map();
      let start = null, moved = 0, pinch0 = null;
      c.addEventListener('pointerdown', (e) => {
        c.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, [e.offsetX, e.offsetY]);
        if (pts.size === 1) { start = [e.offsetX, e.offsetY, this.panX, this.panY]; moved = 0; }
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.zoom, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; moved = 99; }
      });
      c.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, [e.offsetX, e.offsetY]);
        if (pts.size === 2 && pinch0) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          this.zoomAt(pinch0.mx, pinch0.my, pinch0.z * d / pinch0.d);
        } else if (pts.size === 1 && start) {
          const dx = e.offsetX - start[0], dy = e.offsetY - start[1];
          moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
          if (moved > 6) { this.userMoved = true; this.panX = start[2] + dx; this.panY = start[3] + dy; this.clampPan(); this.dirty = true; }
        }
      });
      const up = (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (pts.size === 0) {
          if (moved <= 6 && this.onTap) {
            const cell = this.pick(e.offsetX, e.offsetY);
            if (cell >= 0) this.onTap(cell);
          }
          start = null; pinch0 = null;
        } else if (pts.size === 1) {
          const [p] = [...pts.values()];
          start = [p[0], p[1], this.panX, this.panY]; pinch0 = null;
        }
      };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); start = null; pinch0 = null; });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.zoomAt(e.offsetX, e.offsetY, this.zoom * Math.exp(-e.deltaY * 0.0015));
      }, { passive: false });
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(c);
      else window.addEventListener('resize', () => this.resize());
    }

    zoomAt(mx, my, z) {
      this.userMoved = true;
      z = Math.max(this.minZoom(), Math.min(8, z));
      const s0 = this.scale();
      const rx = (mx - this.panX) / s0, ry = (my - this.panY) / s0;
      this.zoom = z;
      const s1 = this.scale();
      this.panX = mx - rx * s1; this.panY = my - ry * s1;
      this.clampPan(); this.dirty = true;
    }
    zoomBy(f) { this.zoomAt(this.cw / 2, this.ch / 2, this.zoom * f); }

    pick(cx, cy) {
      const s = this.scale();
      let rx = (cx - this.panX) / s, ry = (cy - this.panY) / s;
      if (ry < 0 || ry >= RH) return -1;
      rx = ((rx % RW) + RW) % RW;
      const lon = -Math.PI + rx / RW * 2 * Math.PI, lat = Math.PI / 2 - ry / RH * Math.PI;
      const cl = Math.cos(lat);
      return this.grid.nearestAny(cl * Math.cos(lon), cl * Math.sin(lon), Math.sin(lat));
    }
  }

  SE.MapView = MapView;
  SE.MAP_COLORS = { LAND, SEA_DEEP, SEA_SHELF, REEF, SEA_ICE, TEMP_STOPS, RICH_STOPS, ramp };
})(globalThis.SE || (globalThis.SE = {}));
