/*
 * The tree of life: one row per species, time running left to right. Each
 * species is a horizontal line from its birth to its death (or to now), joined
 * to its parent by a short vertical tick. Extinct lines are rust; living ones
 * take their group's colour. Pinch or wheel to zoom, drag to pan, tap a line.
 */
(function (SE) {
  'use strict';
  const GROUP_COLORS = {
    rodent: '#c9a46a', lagomorph: '#d8bf8a', bat: '#b58fd0', carnivoran: '#e0866a', ungulate: '#c8b27a', marsupial: '#d99a7a',
    bird: '#86b8d8', reptile: '#9cbf72', amphibian: '#7fc8a2', fish: '#6aa6c8', cephalopod: '#e48aa6', crustacean: '#e8a07a',
    cnidarian: '#f0b8a0', insect: '#d4c86a', plant: '#78b070',
  };
  const LABEL_W = 92;

  class TreeView {
    constructor(canvas, opts) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.onPick = opts.onPick;
      this.metas = []; this.T = 0; this.hide = false; this.sel = -1;
      this.rows = []; this.rowOf = new Map(); this.clades = [];
      this.zoom = 1; this.panX = 0; this.panY = 0;
      this.dirty = true; this.layoutDirty = true;
      this.bind();
      this.resize();
      const loop = () => { if (this.dirty) this.draw(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }

    setData(metas, T) { this.metas = metas; this.T = T; this.layoutDirty = true; this.dirty = true; }
    setHideExtinct(h) { this.hide = h; this.layoutDirty = true; this.dirty = true; }
    highlight(id) {
      this.sel = id; this.dirty = true;
      if (this.layoutDirty) this.layout();
      const r = this.rowOf.get(id);
      if (r !== undefined) {
        const y = r * this.rowH();
        if (this.zoom < 3 && this.rows.length * this.baseRow < this.ch) return;
        if (this.panY + y < 20 || this.panY + y > this.ch - 40) this.panY = this.ch / 2 - y;
        this.clampPan();
      }
    }

    resize() {
      const r = this.canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
      this.cw = r.width; this.ch = r.height; this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.layoutDirty = true; this.dirty = true;
    }

    alive(m) { return m.born <= this.T && (m.died === null || m.died > this.T); }

    layout() {
      this.layoutDirty = false;
      const ms = this.metas, T = this.T;
      const kids = new Map();
      const roots = [];
      for (const m of ms) {
        if (!m || m.born > T) continue;
        if (m.parent < 0) roots.push(m);
        else { let a = kids.get(m.parent); if (!a) kids.set(m.parent, a = []); a.push(m); }
      }
      // Which species have a living descendant (or are alive) at T.
      const keep = new Map();
      const live = (m) => {
        if (keep.has(m.id)) return keep.get(m.id);
        let k = this.alive(m);
        for (const c of kids.get(m.id) || []) if (live(c)) k = true;
        keep.set(m.id, k); return k;
      };
      const rows = [], clades = [];
      const visit = (m) => {
        if (this.hide && !live(m)) return;
        rows.push(m);
        const cs = (kids.get(m.id) || []).slice().sort((a, b) => a.born - b.born || a.id - b.id);
        for (const c of cs) visit(c);
      };
      // An explicit stack would be safer for very deep trees; depth here stays in the hundreds.
      for (const r of roots) {
        const start = rows.length;
        visit(r);
        if (rows.length > start) clades.push({ clade: r.clade, from: start, to: rows.length, name: SE.CLADES[r.clade].common });
      }
      this.rows = rows; this.clades = clades;
      this.rowOf = new Map(rows.map((m, i) => [m.id, i]));
      this.baseRow = Math.max(0.35, (this.ch - 34) / Math.max(1, rows.length));
      this.clampPan();
    }

    rowH() { return this.baseRow * this.zoom; }
    xOf(t) { const W = this.cw - LABEL_W - 14; return LABEL_W + this.panX + (t / Math.max(1, this.T)) * W * this.zoom; }
    clampPan() {
      const H = this.rows.length * this.rowH() + 34;
      this.panY = H <= this.ch ? 0 : Math.min(0, Math.max(this.ch - H, this.panY));
      const W = (this.cw - LABEL_W - 14) * this.zoom;
      this.panX = Math.min(0, Math.max((this.cw - LABEL_W - 14) - W, this.panX));
    }

    draw() {
      this.dirty = false;
      if (this.layoutDirty) this.layout();
      const ctx = this.ctx, css = getComputedStyle(this.canvas);
      const bg = css.getPropertyValue('--tree-bg').trim() || '#0f1d26', fg = css.getPropertyValue('--fg-dim').trim() || '#9fb3b8';
      const rust = css.getPropertyValue('--rust').trim() || '#b5573a', hi = css.getPropertyValue('--accent').trim() || '#8fd4c4';
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, this.cw, this.ch);
      const rows = this.rows, rh = this.rowH(), T = this.T, py = this.panY + 4;
      if (!rows.length) return;
      // Selected lineage.
      const lineage = new Set();
      if (this.sel >= 0 && this.metas[this.sel]) for (let m = this.metas[this.sel]; m; m = m.parent >= 0 ? this.metas[m.parent] : null) lineage.add(m.id);
      const first = Math.max(0, Math.floor(-py / rh) - 1), last = Math.min(rows.length - 1, Math.ceil((this.ch - py) / rh) + 1);
      // Clade bands.
      ctx.font = '600 11px "IBM Plex Sans", system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < this.clades.length; i++) {
        const c = this.clades[i];
        const y0 = py + c.from * rh, y1 = py + c.to * rh;
        if (y1 < 0 || y0 > this.ch) continue;
        if (i % 2 === 0) { ctx.fillStyle = 'rgba(160,190,190,0.045)'; ctx.fillRect(0, y0, this.cw, y1 - y0); }
        if (y1 - y0 >= 9) {
          ctx.fillStyle = GROUP_COLORS[SE.CLADES[c.clade].group] || fg;
          const yy = Math.max(Math.min((y0 + y1) / 2, y1 - 6), Math.min(y0 + 6, this.ch - 26));
          ctx.fillText(c.name.length > 14 ? c.name.slice(0, 13) + '…' : c.name, 6, Math.max(8, Math.min(yy, this.ch - 30)));
        }
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(LABEL_W - 4, 0, this.cw - LABEL_W + 4, this.ch - 26); ctx.clip();
      const lw = Math.max(0.6, Math.min(3, rh * 0.55));
      // Connectors first, then lines.
      ctx.lineWidth = Math.max(0.5, lw * 0.6);
      ctx.strokeStyle = 'rgba(160,185,190,0.35)';
      ctx.beginPath();
      for (let i = first; i <= last; i++) {
        const m = rows[i]; if (m.parent < 0) continue;
        const pr = this.rowOf.get(m.parent); if (pr === undefined) continue;
        const x = this.xOf(m.born);
        ctx.moveTo(x, py + (pr + 0.5) * rh); ctx.lineTo(x, py + (i + 0.5) * rh);
      }
      // Also draw connectors whose child is below the view but parent above it.
      ctx.stroke();
      for (let pass = 0; pass < 2; pass++) {
        for (let i = first; i <= last; i++) {
          const m = rows[i], al = this.alive(m), inL = lineage.has(m.id);
          if ((pass === 1) !== inL) continue;
          const end = al ? T : Math.min(m.died, T);
          const y = py + (i + 0.5) * rh;
          ctx.strokeStyle = inL ? hi : al ? (GROUP_COLORS[SE.CLADES[m.clade].group] || fg) : rust;
          ctx.globalAlpha = inL || al ? 1 : 0.6;
          ctx.lineWidth = inL ? Math.max(2, lw) : lw;
          ctx.beginPath(); ctx.moveTo(this.xOf(m.born), y); ctx.lineTo(Math.max(this.xOf(end), this.xOf(m.born) + 1.5), y); ctx.stroke();
          if (!al && rh >= 7) { ctx.fillStyle = rust; ctx.font = '10px "IBM Plex Sans", system-ui, sans-serif'; ctx.fillText('†', this.xOf(end) + 2, y); }
        }
      }
      ctx.globalAlpha = 1;
      if (rh >= 10) {
        ctx.font = `italic ${Math.min(14, rh * 0.9)}px "Cormorant Garamond", Georgia, serif`;
        for (let i = first; i <= last; i++) {
          const m = rows[i];
          const al = this.alive(m);
          const end = al ? T : Math.min(m.died, T);
          const x = Math.min(this.xOf(end) + (al ? 4 : 12), this.cw - 4);
          ctx.fillStyle = lineage.has(m.id) ? hi : al ? fg : rust;
          const txt = `${m.genus} ${m.epithet}`;
          const w = ctx.measureText(txt).width;
          ctx.fillText(txt, Math.min(x, this.cw - w - 4), py + (i + 0.5) * rh);
        }
      }
      ctx.restore();
      // Time axis.
      ctx.fillStyle = bg; ctx.fillRect(0, this.ch - 26, this.cw, 26);
      ctx.strokeStyle = 'rgba(160,185,190,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(LABEL_W, this.ch - 24.5); ctx.lineTo(this.cw - 8, this.ch - 24.5); ctx.stroke();
      ctx.fillStyle = fg; ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace'; ctx.textBaseline = 'top';
      const span = T / this.zoom, stepOpts = [1, 2, 5, 10, 20, 25, 50, 100];
      const step = stepOpts.find(s => span / s <= 6) || 100;
      for (let t = 0; t <= T; t += step) {
        const x = this.xOf(t);
        if (x < LABEL_W - 1 || x > this.cw - 6) continue;
        ctx.fillRect(x, this.ch - 24, 1, 4);
        ctx.fillText(String(t), x - (t ? 6 : 0), this.ch - 18);
      }
      ctx.fillText('My', 6, this.ch - 18);
    }

    bind() {
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
          this.zoomAt(pinch0.mx, pinch0.my, pinch0.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0.d);
        } else if (pts.size === 1 && start) {
          const dx = e.offsetX - start[0], dy = e.offsetY - start[1];
          moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
          if (moved > 6) { this.panX = start[2] + dx; this.panY = start[3] + dy; this.clampPan(); this.dirty = true; }
        }
      });
      const up = (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (pts.size === 0) {
          if (moved <= 6) this.tap(e.offsetX, e.offsetY);
          start = null; pinch0 = null;
        } else { const [p] = [...pts.values()]; start = [p[0], p[1], this.panX, this.panY]; pinch0 = null; }
      };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); start = null; pinch0 = null; });
      c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, this.zoom * Math.exp(-e.deltaY * 0.002)); }, { passive: false });
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(c);
    }

    zoomAt(mx, my, z) {
      z = Math.max(1, Math.min(60, z));
      const rh0 = this.rowH(), W0 = (this.cw - LABEL_W - 14) * this.zoom;
      const ry = (my - this.panY - 4) / rh0, rx = (mx - LABEL_W - this.panX) / W0;
      this.zoom = z;
      this.panY = my - 4 - ry * this.rowH();
      this.panX = mx - LABEL_W - rx * (this.cw - LABEL_W - 14) * z;
      this.clampPan(); this.dirty = true;
    }
    zoomBy(f) { this.zoomAt(this.cw / 2, this.ch / 2, this.zoom * f); }

    tap(x, y) {
      const rh = this.rowH(), i = Math.floor((y - this.panY - 4) / rh);
      if (y > this.ch - 26) return;
      // On a dense tree, pick the nearest row whose line passes under the finger.
      const t = (x - LABEL_W - this.panX) / ((this.cw - LABEL_W - 14) * this.zoom) * this.T;
      const reach = Math.max(1, Math.ceil(8 / rh));
      let best = -1, bd = 1e9;
      for (let k = Math.max(0, i - reach); k <= Math.min(this.rows.length - 1, i + reach); k++) {
        const m = this.rows[k], end = this.alive(m) ? this.T : Math.min(m.died, this.T);
        const dt = t < m.born ? m.born - t : t > end ? t - end : 0;
        const d = Math.abs(k - i) * rh + dt * 3;
        if (d < bd) { bd = d; best = m.id; }
      }
      if (best >= 0 && this.onPick) this.onPick(best);
    }
  }

  SE.TreeView = TreeView;
  SE.GROUP_COLORS = GROUP_COLORS;
})(globalThis.SE || (globalThis.SE = {}));
