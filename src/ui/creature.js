/*
 * Procedural creature portraits from a species' body plan.
 *
 * Tetrapods are built from regions along the body axis, as in the evodevo
 * project: head, fore zone, trunk, hind zone, tail. Each zone's appendage type
 * is a single switch (leg, feathered wing, membrane wing, flipper, grasping arm,
 * wing-leg, vestigial), so a homeotic change in the simulation redraws the
 * animal correctly. Fish, cephalopods, arthropods, plants and corals have their
 * own simpler builders. Everything is drawn side-on, facing right.
 */
(function (SE) {
  'use strict';
  const hsl = (h, s, l, a) => `hsla(${h.toFixed(0)},${s.toFixed(0)}%,${Math.max(0, Math.min(100, l)).toFixed(0)}%,${a === undefined ? 1 : a})`;

  function palette(bp) {
    const h = bp.hue || 30, s = bp.sat || 20, l = bp.lit || 40;
    return { body: hsl(h, s, l), dark: hsl(h, s * 0.9, l * 0.45), light: hsl(h, s * 0.6, Math.min(92, l + 22)), pat: hsl(bp.phue === undefined ? h : bp.phue, Math.min(90, s + 10), l * 0.55), line: hsl(h, s * 0.6, l * 0.28) };
  }

  function stroke(ctx, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }

  function limb(ctx, x0, y0, pts, w0, w1, col, line) {
    // A tapered limb through a list of joints.
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    stroke(ctx, line, w0 + 2);
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    stroke(ctx, col, w0);
    const [ex, ey] = pts[pts.length - 1];
    ctx.beginPath(); ctx.arc(ex, ey, w1 / 2, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
  }

  function ellipse(ctx, x, y, rx, ry, rot, fill, line, lw) {
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot || 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (line) stroke(ctx, line, lw || 1.5);
  }

  function tetra(ctx, bp, W, H, rng) {
    const P = palette(bp);
    const flies = bp.fore === 'mwing' || bp.fore === 'wing';
    const swim = bp.fore === 'flipper' && (bp.hind === 'flipper' || bp.hind === 'vestigial');
    const U = Math.min(W * 0.5 / (bp.len * 0.5 + 0.38 + bp.tail * 0.42 + bp.neck * 0.5), H * 0.42 / (bp.girth + bp.leg * 1.1 + 0.15));
    const tilt = -(bp.posture || 0) * 0.75;
    const ry = U * bp.girth / 2, rx = U * bp.len / 2;
    const legLen = swim ? 0 : bp.leg * U * 1.15;
    const ground = H * 0.86;
    const cx = W * 0.47 - (bp.neck * U * 0.2) + bp.tail * U * 0.12, cy = swim ? H * 0.52 : ground - legLen - ry * 0.75;
    const rot = (x, y) => [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)];
    // Ground shadow.
    if (!swim) ellipse(ctx, cx, ground + 2, rx * 1.1, 4, 0, 'rgba(0,0,0,0.12)');
    const shoulder = rot(rx * 0.55, ry * 0.25), hip = rot(-rx * 0.55, ry * 0.25);
    // Tail.
    if (bp.tail > 0.05) {
      const tl = bp.tail * U * 0.85, tw = Math.max(1.5, bp.tailW * U * 0.7);
      const base = rot(-rx * 0.85, -ry * 0.05);
      const bushy = bp.tailW > 0.2 && bp.cover === 0;
      const up = bushy ? -0.9 : bp.fore === 'arm' || (bp.posture > 0.6 && !flies) ? 0.5 : bp.cover === 1 ? -0.1 : 0.15;
      const ex = base[0] - tl * Math.cos(up), ey = base[1] + tl * Math.sin(up) * (bp.fore === 'arm' ? 1.3 : 1) - (bp.cover === 1 ? tl * 0.15 : 0);
      if (bushy) {
        // A plume: thin at the base, full in the middle, curling forward at the tip.
        const mx = base[0] - tl * 0.55, my = base[1] - tl * 0.35;
        ctx.beginPath(); ctx.moveTo(base[0], base[1] - 2);
        ctx.bezierCurveTo(mx - tw * 1.2, my + tw, mx - tw * 1.4, ey - tw * 0.2, ex + tw * 0.8, ey - tw * 0.6);
        ctx.bezierCurveTo(mx + tw * 0.4, ey - tw * 0.2, mx + tw * 0.6, my + tw * 0.2, base[0], base[1] + 3);
        ctx.closePath(); ctx.fillStyle = P.body; ctx.fill(); stroke(ctx, P.line, 1.4);
        if (bp.pattern === 1) { ctx.save(); ctx.clip(); for (let i = 1; i < 5; i++) ellipse(ctx, base[0] - tl * 0.22 * i, base[1] - tl * 0.18 * i, tw, tw * 0.3, 0.8, P.pat); ctx.restore(); }
      } else {
        ctx.beginPath(); ctx.moveTo(base[0], base[1] - tw); ctx.quadraticCurveTo((base[0] + ex) / 2, (base[1] + ey) / 2 - tw * 0.5 - tl * 0.1, ex, ey);
        ctx.quadraticCurveTo((base[0] + ex) / 2, (base[1] + ey) / 2 + tw * 0.4 - tl * 0.04, base[0], base[1] + tw);
        ctx.closePath(); ctx.fillStyle = P.body; ctx.fill(); stroke(ctx, P.line, 1.4);
      }
      if (bp.fluke) { ctx.beginPath(); ctx.moveTo(ex + 2, ey); ctx.quadraticCurveTo(ex - U * 0.12, ey - U * 0.18, ex - U * 0.22, ey - U * 0.16); ctx.quadraticCurveTo(ex - U * 0.08, ey, ex - U * 0.22, ey + U * 0.16); ctx.quadraticCurveTo(ex - U * 0.12, ey + U * 0.18, ex + 2, ey); ctx.fillStyle = P.dark; ctx.fill(); }
      if (bp.cover === 1) { // tail feathers
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(ex - 4, ey + i * tw * 0.5); stroke(ctx, P.dark, 1); }
      }
    }
    // Far-side limbs (darker), then body, then near-side limbs.
    const legPts = (x, y, len, fwd, knee) => [[x + len * 0.12 * knee, y + len * 0.5], [x - len * 0.05 * knee + fwd, y + len], [x + fwd + len * 0.18, y + len]];
    const drawHind = (dx, col) => {
      const [x, y] = hip;
      if (bp.hind === 'vestigial') return;
      if (bp.hind === 'flipper') { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - U * 0.25, y + U * 0.15, x - U * 0.42 + dx, y + U * 0.05); ctx.quadraticCurveTo(x - U * 0.2, y - U * 0.02, x, y - 2); ctx.fillStyle = col; ctx.fill(); stroke(ctx, P.line, 1.2); return; }
      const L = ground - y;
      if (bp.hind === 'hop') {
        ellipse(ctx, x + dx, y + L * 0.15, U * 0.18, U * 0.22, 0.3, col, P.line, 1.2);
        limb(ctx, x + dx, y + L * 0.3, [[x + dx - L * 0.25, y + L * 0.75], [x + dx + L * 0.45, ground]], Math.max(2, U * 0.06), 3, col, P.line);
        return;
      }
      limb(ctx, x + dx, y, legPts(x + dx, y, L, 0, 1), Math.max(2, U * 0.07 * (0.6 + bp.girth)), Math.max(2, U * 0.05), col, P.line);
    };
    const drawFore = (dx, col, near) => {
      const [x, y] = shoulder;
      const L = ground - y;
      switch (bp.fore) {
        case 'leg': limb(ctx, x + dx, y, legPts(x + dx, y, L, 0, -1), Math.max(2, U * 0.065 * (0.6 + bp.girth)), Math.max(2, U * 0.05), col, P.line); break;
        case 'arm': limb(ctx, x + dx, y, [[x + dx + U * 0.12, y + U * 0.18], [x + dx + U * 0.22, y + U * 0.12]], Math.max(2, U * 0.045), 3, col, P.line); break;
        case 'vestigial': if (near) ellipse(ctx, x - U * 0.02, y - ry * 0.1, U * 0.06, U * 0.03, 0.4, P.dark, P.line, 1); break;
        case 'flipper': ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.quadraticCurveTo(x + dx + U * 0.05, y + U * 0.25, x + dx - U * 0.12, y + U * 0.38); ctx.quadraticCurveTo(x + dx - U * 0.1, y + U * 0.12, x + dx - U * 0.08, y - 2); ctx.fillStyle = col; ctx.fill(); stroke(ctx, P.line, 1.2); break;
        case 'wingleg': {
          // Walks on the folded wing: a long-fingered knuckle-walking limb with membrane remnants.
          // The elbow rises above the shoulder like a folded wing; the long fingers are bundled into a foot.
          const ex2 = x + dx + U * 0.05, ey2 = y - U * 0.28, kx = x + dx + U * 0.3, ky = ground - U * 0.04;
          if (near) { ctx.beginPath(); ctx.moveTo(ex2, ey2); ctx.lineTo(kx, ky); ctx.lineTo(x + dx - U * 0.45, y + ry * 0.4); ctx.quadraticCurveTo(x + dx - U * 0.25, y - U * 0.1, ex2, ey2); ctx.fillStyle = hsl(bp.hue, bp.sat, bp.lit * 0.55, 0.75); ctx.fill(); stroke(ctx, P.line, 1); }
          limb(ctx, x + dx, y, [[ex2, ey2], [kx, ky]], Math.max(2.5, U * 0.075), Math.max(3, U * 0.06), col, P.line);
          ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + U * 0.14, ground); ctx.moveTo(kx, ky); ctx.lineTo(kx + U * 0.1, ground + 1); stroke(ctx, P.line, 2);
          break;
        }
        default: break;
      }
    };
    if (!flies || bp.fore === 'mwing') { drawHind(-U * 0.06, P.dark); drawFore(-U * 0.05, P.dark, false); }
    else drawHind(-U * 0.06, P.dark);
    if (bp.patag) { const f = rot(rx * 0.75, ry * 0.2), h = rot(-rx * 0.75, ry * 0.2); ctx.beginPath(); ctx.moveTo(f[0] + U * 0.1, ground - legLen * 0.3); ctx.lineTo(f[0], f[1]); ctx.lineTo(h[0], h[1]); ctx.lineTo(h[0] - U * 0.05, ground - legLen * 0.3); ctx.quadraticCurveTo(cx, cy + ry * 1.6, f[0] + U * 0.1, ground - legLen * 0.3); ctx.fillStyle = hsl(bp.hue, bp.sat, bp.lit * 0.8, 0.8); ctx.fill(); stroke(ctx, P.line, 1); }
    if (bp.fore === 'mwing') {
      // Spread membrane wing above the body.
      const [x, y] = shoulder;
      const span = U * 1.05;
      const tips = [[x - span * 0.2, y - span * 0.75], [x - span * 0.55, y - span * 0.55], [x - span * 0.75, y - span * 0.2], [x - span * 0.6, y + span * 0.05]];
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + span * 0.15, y - span * 0.45);
      for (const [tx, ty] of tips) ctx.quadraticCurveTo((x + tx) / 2 + span * 0.05, (y + ty) / 2, tx, ty);
      ctx.lineTo(hip[0], hip[1]); ctx.closePath();
      ctx.fillStyle = hsl(bp.hue, bp.sat, bp.lit * 0.65, 0.85); ctx.fill(); stroke(ctx, P.line, 1.2);
      for (const [tx, ty] of tips) { ctx.beginPath(); ctx.moveTo(x + span * 0.15, y - span * 0.45); ctx.lineTo(tx, ty); stroke(ctx, P.line, 1); }
    }
    // Body.
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    const grd = ctx.createLinearGradient(0, -ry, 0, ry); grd.addColorStop(0, P.body); grd.addColorStop(0.65, P.body); grd.addColorStop(1, P.light);
    ctx.fillStyle = grd; ctx.fill();
    ctx.save(); ctx.clip();
    if (bp.pattern === 1) for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * rx * 0.22, -ry); ctx.lineTo(i * rx * 0.22 - rx * 0.06, ry * 0.4); stroke(ctx, P.pat, Math.max(1.5, rx * 0.06)); }
    if (bp.pattern === 2) for (let i = 0; i < 14; i++) { ellipse(ctx, (rng.float() - 0.5) * rx * 1.8, (rng.float() - 0.7) * ry * 1.2, ry * 0.12, ry * 0.1, 0, P.pat); }
    if (bp.pattern === 3) for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.rect(i * rx * 0.55 - rx * 0.1, -ry, rx * 0.2, ry * 2); ctx.fillStyle = P.pat; ctx.fill(); }
    if (bp.cover === 0) for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(i * rx * 0.14, -ry * 0.92); ctx.lineTo(i * rx * 0.14 - 3, -ry * 0.78); stroke(ctx, P.dark, 0.8); }
    if (bp.cover === 2) for (let i = 0; i < 30; i++) { ellipse(ctx, (rng.float() - 0.5) * rx * 2, (rng.float() - 0.5) * ry * 2, 1.4, 1, 0, P.dark); }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); stroke(ctx, P.line, 1.6);
    if (bp.shell) { ctx.beginPath(); ctx.ellipse(0, -ry * 0.1, rx * 1.02, ry * 1.15, 0, Math.PI, Math.PI * 2); ctx.fillStyle = P.dark; ctx.fill(); stroke(ctx, P.line, 1.5); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * rx * 0.35, -ry * 0.1); ctx.lineTo(i * rx * 0.3, -ry * 1.05); stroke(ctx, P.body, 1); } }
    ctx.restore();
    if (bp.fore === 'wing') {
      // Folded feathered wing on the flank.
      const [x, y] = rot(rx * 0.45, -ry * 0.25);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - rx * 0.6, y - ry * 0.4, x - rx * 1.45, y + ry * 0.35); ctx.quadraticCurveTo(x - rx * 0.6, y + ry * 0.9, x, y + ry * 0.4); ctx.closePath();
      ctx.fillStyle = P.dark; ctx.fill(); stroke(ctx, P.line, 1.2);
      for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(x - rx * 0.3 * i, y + ry * 0.1 * i); ctx.lineTo(x - rx * 0.3 * i - rx * 0.25, y + ry * 0.2 + ry * 0.1 * i); stroke(ctx, P.light, 0.8); }
    }
    drawHind(U * 0.04, P.body);
    if (bp.fore !== 'mwing' && bp.fore !== 'wing') drawFore(U * 0.05, P.body, true);
    if (bp.fore === 'mwing') { const [x, y] = shoulder; limb(ctx, x, y, [[x + U * 0.05, y + (ground - y) * 0.6], [x + U * 0.1, ground]], Math.max(1.5, U * 0.03), 2, P.body, P.line); }
    // Neck and head.
    const nb = rot(rx * 0.8, -ry * 0.35);
    const nAng = -0.35 - (bp.posture || 0) * 0.5 - bp.neck * 0.8 + (swim ? 0.3 : 0);
    const nl = bp.neck * U + U * 0.05;
    const hx = nb[0] + Math.cos(nAng) * nl + U * 0.06, hy = nb[1] + Math.sin(nAng) * nl;
    const hr = bp.head * U * 0.5;
    if (bp.neck > 0.04) { ctx.beginPath(); ctx.moveTo(nb[0] - U * 0.05, nb[1] - U * 0.02); ctx.lineTo(hx, hy); stroke(ctx, P.line, Math.max(3, U * (0.1 + bp.girth * 0.12)) + 2); ctx.beginPath(); ctx.moveTo(nb[0] - U * 0.05, nb[1] - U * 0.02); ctx.lineTo(hx, hy); stroke(ctx, P.body, Math.max(3, U * (0.1 + bp.girth * 0.12))); }
    // Ears behind the head.
    if (bp.ears > 0.05) {
      const el = bp.ears * hr * 2.2;
      for (const off of [-0.25, 0.05]) { ctx.beginPath(); ctx.moveTo(hx - hr * 0.5 + off * hr, hy - hr * 0.6); ctx.quadraticCurveTo(hx - hr * 0.9 + off * hr, hy - hr * 0.6 - el * 0.7, hx - hr * 0.55 + off * hr - el * 0.25, hy - hr * 0.5 - el * (bp.earUp ? 1 : 0.4)); ctx.quadraticCurveTo(hx - hr * 0.1 + off * hr, hy - hr - el * 0.4, hx - hr * 0.05 + off * hr, hy - hr * 0.7); ctx.closePath(); ctx.fillStyle = off < 0 ? P.dark : P.body; ctx.fill(); stroke(ctx, P.line, 1.2); }
    }
    if (bp.horn > 0.2) { ctx.beginPath(); ctx.moveTo(hx - hr * 0.1, hy - hr * 0.6); ctx.quadraticCurveTo(hx - hr * 1.0, hy - hr * (1.6 + bp.horn * 1.6), hx - hr * (1.8 + bp.horn * 1.4), hy - hr * (0.2 - bp.horn * 0.3)); stroke(ctx, P.line, Math.max(3, hr * 0.38) + 2); ctx.stroke(); ctx.strokeStyle = hsl(40, 18, 52); ctx.lineWidth = Math.max(3, hr * 0.38); ctx.stroke(); }
    if (bp.crest > 0.3) { ctx.beginPath(); ctx.moveTo(hx - hr * 0.8, hy - hr * 0.5); ctx.quadraticCurveTo(hx - hr * 0.2, hy - hr * (1.3 + bp.crest), hx + hr * 0.3, hy - hr * 0.8); ctx.closePath(); ctx.fillStyle = hsl((bp.hue + 180) % 360, 55, 50); ctx.fill(); stroke(ctx, P.line, 1); }
    // Snout or beak.
    const sl = bp.snout * hr * 1.6 + hr * 0.3;
    if (bp.beak) {
      ctx.beginPath(); ctx.moveTo(hx + hr * 0.6, hy - hr * 0.3); ctx.lineTo(hx + hr * 0.6 + sl, hy + hr * 0.05); ctx.lineTo(hx + hr * 0.6, hy + hr * 0.35); ctx.closePath();
      ctx.fillStyle = hsl(40, 45, 45); ctx.fill(); stroke(ctx, P.line, 1.1);
    } else {
      ctx.beginPath(); ctx.moveTo(hx, hy - hr * 0.55); ctx.quadraticCurveTo(hx + sl * 0.8, hy - hr * 0.4, hx + hr * 0.4 + sl, hy + hr * 0.1); ctx.quadraticCurveTo(hx + sl * 0.6, hy + hr * 0.6, hx, hy + hr * 0.6); ctx.closePath();
      ctx.fillStyle = P.body; ctx.fill(); stroke(ctx, P.line, 1.3);
      ellipse(ctx, hx + hr * 0.4 + sl - 1, hy + hr * 0.05, Math.max(1.2, hr * 0.12), Math.max(1, hr * 0.1), 0, P.line);
      if (bp.teeth > 0.4) for (let i = 0; i < 3; i++) { const tx = hx + hr * 0.3 + sl * (0.35 + i * 0.22); ctx.beginPath(); ctx.moveTo(tx, hy + hr * 0.32); ctx.lineTo(tx + 1.5, hy + hr * 0.32 + hr * 0.25 * bp.teeth * (i === 0 ? 1.6 : 1)); ctx.lineTo(tx + 3, hy + hr * 0.32); ctx.fillStyle = '#f4f1e8'; ctx.fill(); }
    }
    ellipse(ctx, hx, hy, hr, hr * 0.8, 0, P.body, P.line, 1.4);
    const er = Math.max(1.4, hr * 0.18 * (0.6 + (bp.eye === undefined ? 0.5 : bp.eye)));
    ellipse(ctx, hx + hr * 0.35, hy - hr * 0.2, er, er, 0, '#15130f');
    ellipse(ctx, hx + hr * 0.35 + er * 0.3, hy - hr * 0.2 - er * 0.3, er * 0.3, er * 0.3, 0, 'rgba(255,255,255,0.8)');
  }

  function fish(ctx, bp, W, H, rng) {
    const P = palette(bp);
    const L = W * 0.78 * Math.min(1, 0.7 + bp.len * 0.25), Hh = L * bp.girth;
    const x0 = W / 2 - L / 2, y0 = H * 0.5;
    if (bp.lobe) ellipse(ctx, W / 2, H * 0.86, L * 0.4, 4, 0, 'rgba(0,0,0,0.12)');
    // Tail.
    const tf = bp.tailFork || 0.3;
    ctx.beginPath(); ctx.moveTo(x0 + L * 0.12, y0); ctx.lineTo(x0 - L * 0.08, y0 - Hh * (0.7 + tf * 0.5)); ctx.quadraticCurveTo(x0 + tf * L * 0.08, y0, x0 - L * 0.08, y0 + Hh * (0.7 + tf * 0.4)); ctx.closePath();
    ctx.fillStyle = P.dark; ctx.fill(); stroke(ctx, P.line, 1.2);
    // Dorsal fin.
    const dh = Hh * (0.3 + (bp.dorsal || 0.5) * (bp.shark ? 0.9 : 0.5));
    ctx.beginPath(); ctx.moveTo(x0 + L * 0.42, y0 - Hh * 0.45); ctx.lineTo(x0 + L * (bp.shark ? 0.5 : 0.4), y0 - Hh * 0.45 - dh); ctx.lineTo(x0 + L * 0.62, y0 - Hh * 0.42); ctx.closePath(); ctx.fillStyle = P.dark; ctx.fill(); stroke(ctx, P.line, 1.1);
    // Lobe fins (walking fish).
    if (bp.lobe) for (const fx of [0.62, 0.38]) limb(ctx, x0 + L * fx, y0 + Hh * 0.35, [[x0 + L * fx + 6, y0 + Hh * 0.8], [x0 + L * fx + 2, H * 0.86]], 4, 5, P.dark, P.line);
    // Body.
    ctx.beginPath(); ctx.moveTo(x0 + L, y0 + (bp.shark ? Hh * 0.05 : 0));
    ctx.bezierCurveTo(x0 + L * 0.85, y0 - Hh * 0.7, x0 + L * 0.3, y0 - Hh * 0.55, x0 + L * 0.1, y0 - Hh * 0.12);
    ctx.lineTo(x0 + L * 0.1, y0 + Hh * 0.12);
    ctx.bezierCurveTo(x0 + L * 0.3, y0 + Hh * 0.55, x0 + L * 0.85, y0 + Hh * 0.6, x0 + L, y0 + (bp.shark ? Hh * 0.05 : 0));
    const grd = ctx.createLinearGradient(0, y0 - Hh / 2, 0, y0 + Hh / 2); grd.addColorStop(0, P.dark); grd.addColorStop(0.45, P.body); grd.addColorStop(1, P.light);
    ctx.fillStyle = grd; ctx.fill();
    ctx.save(); ctx.clip();
    if (bp.pattern === 2) for (let i = 0; i < 18; i++) ellipse(ctx, x0 + L * (0.15 + rng.float() * 0.7), y0 + (rng.float() - 0.7) * Hh * 0.6, 2, 1.6, 0, P.pat);
    if (bp.pattern === 1 || bp.pattern === 3) for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x0 + L * i * 0.15, y0 - Hh); ctx.lineTo(x0 + L * i * 0.15 - 4, y0 + Hh * 0.2); stroke(ctx, P.pat, 3); }
    ctx.restore();
    stroke(ctx, P.line, 1.5);
    // Pectoral fin, gill, eye, barbel.
    ctx.beginPath(); ctx.moveTo(x0 + L * 0.72, y0 + Hh * 0.15); ctx.lineTo(x0 + L * 0.58, y0 + Hh * (bp.shark ? 0.7 : 0.45)); ctx.lineTo(x0 + L * 0.66, y0 + Hh * 0.15); ctx.fillStyle = P.dark; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x0 + L * 0.78, y0 - Hh * 0.25); ctx.quadraticCurveTo(x0 + L * 0.75, y0, x0 + L * 0.78, y0 + Hh * 0.25); stroke(ctx, P.line, 1);
    ellipse(ctx, x0 + L * 0.88, y0 - Hh * 0.12, Math.max(2, Hh * 0.08), Math.max(2, Hh * 0.08), 0, '#15130f');
    if (bp.barbel) { ctx.beginPath(); ctx.moveTo(x0 + L * 0.93, y0 + Hh * 0.18); ctx.quadraticCurveTo(x0 + L * 0.94, y0 + Hh * 0.4, x0 + L * 0.9, y0 + Hh * 0.45); stroke(ctx, P.line, 1); }
  }

  function ceph(ctx, bp, W, H, rng) {
    const P = palette(bp);
    const up = bp.upright || 0;
    const S = Math.min(W, H) * 0.42;
    const arms = bp.arms || 8;
    if (up > 0.3) {
      // Walking cephalopod: mantle on top, arms as legs.
      const ground = H * 0.88, ml = S * 0.55 * bp.mantle, mw = S * 0.32 * (bp.mw + 0.3);
      const headY = ground - S * 0.75 * bp.armLen * (up > 0.8 ? 1 : 0.6) - S * 0.1, headX = W * 0.5;
      ellipse(ctx, headX, ground + 2, S * 0.7, 4, 0, 'rgba(0,0,0,0.12)');
      for (let i = 0; i < arms; i++) {
        const f = (i / (arms - 1)) * 2 - 1;
        const fx = headX + f * S * 0.75, back = i % 2 === 0;
        ctx.beginPath(); ctx.moveTo(headX + f * mw * 0.4, headY + S * 0.12);
        ctx.quadraticCurveTo(headX + f * S * 0.5, headY + S * 0.1, fx, ground - 2);
        ctx.quadraticCurveTo(fx + f * S * 0.1 + 4, ground + 1, fx + f * S * 0.16, ground - S * 0.07);
        stroke(ctx, P.line, Math.max(2, S * bp.armW * 0.9) + 2);
        ctx.beginPath(); ctx.moveTo(headX + f * mw * 0.4, headY + S * 0.12);
        ctx.quadraticCurveTo(headX + f * S * 0.5, headY + S * 0.1, fx, ground - 2);
        ctx.quadraticCurveTo(fx + f * S * 0.1 + 4, ground + 1, fx + f * S * 0.16, ground - S * 0.07);
        stroke(ctx, back ? P.dark : P.body, Math.max(2, S * bp.armW * 0.9));
      }
      ellipse(ctx, headX, headY, mw * 0.85, S * 0.17, 0, P.body, P.line, 1.4);
      // Mantle rising above, tilted back.
      ctx.save(); ctx.translate(headX - S * 0.06, headY - S * 0.1); ctx.rotate(-0.25);
      ctx.beginPath(); ctx.ellipse(0, -ml * 0.5, mw, ml * 0.55, 0, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(-mw, 0, mw, 0); g.addColorStop(0, P.dark); g.addColorStop(0.6, P.body); g.addColorStop(1, P.light);
      ctx.fillStyle = g; ctx.fill(); stroke(ctx, P.line, 1.5);
      if (bp.pattern) for (let i = 0; i < 10; i++) ellipse(ctx, (rng.float() - 0.5) * mw * 1.4, -ml * (0.2 + rng.float() * 0.6), 2.4, 2, 0, P.pat);
      if (bp.fins) { ctx.beginPath(); ctx.moveTo(-mw, -ml * 0.9); ctx.lineTo(-mw * 1.5, -ml * 1.05); ctx.lineTo(-mw * 0.3, -ml * 1.05); ctx.fillStyle = P.dark; ctx.fill(); }
      ctx.restore();
      ellipse(ctx, headX + mw * 0.45, headY - S * 0.02, S * 0.07 * (0.6 + bp.eye), S * 0.06 * (0.6 + bp.eye), 0, '#efe7c9', P.line, 1);
      ellipse(ctx, headX + mw * 0.47, headY - S * 0.02, S * 0.06, S * 0.018, 0, '#15130f');
      return;
    }
    // Swimming: mantle trails behind (left), arms ahead (right).
    const y = H * 0.5, ml = S * 0.9 * bp.mantle * 0.6, mw = S * 0.38 * bp.mw;
    const hx = W * 0.45 + ml * 0.2;
    for (let i = 0; i < arms; i++) {
      const f = (i / (arms - 1)) - 0.5;
      const len = S * bp.armLen * (i === 0 && arms === 10 ? 1.4 : 1);
      ctx.beginPath(); ctx.moveTo(hx + S * 0.12, y + f * mw * 0.6);
      ctx.bezierCurveTo(hx + len * 0.4, y + f * mw * 1.2, hx + len * 0.7, y + f * mw * 2.2 + Math.sin(i) * 6, hx + len, y + f * mw * 2.6 + Math.cos(i * 1.7) * 8);
      stroke(ctx, i % 2 ? P.dark : P.body, Math.max(1.5, S * bp.armW * 0.6));
    }
    ellipse(ctx, hx + S * 0.08, y, S * 0.13, S * 0.12, 0, P.body, P.line, 1.3);
    if (bp.fins) { ctx.beginPath(); ctx.moveTo(hx - ml * 1.5, y); ctx.lineTo(hx - ml * 1.15, y - mw * 1.3); ctx.lineTo(hx - ml * 0.9, y); ctx.lineTo(hx - ml * 1.15, y + mw * 1.3); ctx.closePath(); ctx.fillStyle = P.dark; ctx.fill(); stroke(ctx, P.line, 1); }
    ctx.beginPath(); ctx.ellipse(hx - ml * 0.55, y, ml * 0.85 + S * 0.05, mw, 0, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(0, y - mw, 0, y + mw); g.addColorStop(0, P.dark); g.addColorStop(0.5, P.body); g.addColorStop(1, P.light);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    if (bp.pattern) for (let i = 0; i < 14; i++) ellipse(ctx, hx - ml * (0.1 + rng.float() * 1.1), y + (rng.float() - 0.5) * mw * 1.6, 2.2, 1.8, 0, P.pat);
    ctx.restore(); stroke(ctx, P.line, 1.5);
    ellipse(ctx, hx + S * 0.1, y - S * 0.04, S * 0.05 * (0.6 + bp.eye), S * 0.05 * (0.6 + bp.eye), 0, '#15130f');
  }

  function arthro(ctx, bp, W, H, rng) {
    const P = palette(bp);
    const segs = Math.max(2, Math.round(bp.segs));
    const ground = H * 0.82;
    if (bp.swim) {
      // Krill-like: curved segmented body with swimming legs.
      const L = W * 0.7, x0 = W * 0.15, y = H * 0.45;
      for (let i = 0; i < 7; i++) { const x = x0 + L * (0.45 + i * 0.05); ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x - 4, y + H * 0.22); stroke(ctx, P.dark, 1.2); }
      for (let i = segs; i >= 0; i--) {
        const f = i / segs;
        ellipse(ctx, x0 + L * (0.15 + f * 0.65), y + Math.sin(f * 2.4 + 0.5) * -H * 0.06 + H * 0.06, L * 0.08, H * 0.09 * (0.6 + f * 0.6), 0.2, i % 2 ? P.body : P.light, P.line, 1);
      }
      ellipse(ctx, x0 + L * 0.85, y - 2, L * 0.07, H * 0.1, 0, P.body, P.line, 1.2);
      ellipse(ctx, x0 + L * 0.88, y - H * 0.04, 4, 4, 0, '#15130f');
      ctx.beginPath(); ctx.moveTo(x0 + L * 0.9, y - 6); ctx.quadraticCurveTo(x0 + L * 1.1, y - H * 0.3, x0 + L * 1.15, y - H * 0.05); stroke(ctx, P.line, 1);
      ctx.beginPath(); ctx.moveTo(x0 + L * 0.15, y + H * 0.08); ctx.lineTo(x0, y + H * 0.02); ctx.lineTo(x0 + 2, y + H * 0.15); ctx.fillStyle = P.dark; ctx.fill();
      return;
    }
    const L = W * 0.68 * Math.min(1.3, 0.8 + segs * 0.03), x0 = W * 0.5 - L * 0.42;
    const bodyH = H * 0.16 * (0.6 + bp.girth);
    const y = ground - H * 0.24 - bodyH * 0.5;
    ellipse(ctx, W / 2, ground + 2, L * 0.45, 4, 0, 'rgba(0,0,0,0.12)');
    // Legs from the thorax (or along the body for many-legged forms).
    const legs = bp.legs || 3;
    const many = legs > 3;
    for (let side = 0; side < 2; side++) for (let i = 0; i < legs; i++) {
      const lx = many ? x0 + L * (0.15 + 0.6 * i / (legs - 1)) : x0 + L * (0.58 + i * 0.07);
      const spread = many ? 0 : (i - 1) * L * 0.14;
      limb(ctx, lx, y + bodyH * 0.2, [[lx + spread * 0.6 + (side ? 3 : -3), y - bodyH * 0.6], [lx + spread * 1.2 + (side ? 4 : -2), ground]], 1.6, 1.5, side ? P.dark : P.line, P.line);
    }
    // Abdomen segments.
    const ab = bp.waist ? L * 0.4 : L * 0.55;
    for (let i = 0; i < segs; i++) {
      const f = i / Math.max(1, segs - 1);
      const sx = x0 + ab * f * 0.9;
      ellipse(ctx, x0 + ab * 0.45 + (sx - x0 - ab * 0.45) * 0.0 + (f - 0.5) * ab * 0.85, y, ab / segs * 0.85 + ab * 0.08, bodyH * (0.9 - Math.abs(f - 0.55) * 0.5), 0, bp.stripes && i % 2 ? hsl(0, 0, 12) : P.body, P.line, 1);
    }
    if (bp.wings) {
      if (bp.elytra) { ctx.beginPath(); ctx.ellipse(x0 + L * 0.42, y - bodyH * 0.3, L * 0.33, bodyH * 0.75, 0.05, 0, Math.PI * 2); ctx.fillStyle = P.dark; ctx.fill(); stroke(ctx, P.line, 1.2); }
      else for (const a of [-0.5, -0.25]) { ctx.beginPath(); ctx.ellipse(x0 + L * 0.42, y - bodyH * 1.2, L * 0.3, bodyH * 0.6, a, 0, Math.PI * 2); ctx.fillStyle = 'rgba(220,235,240,0.45)'; ctx.fill(); stroke(ctx, P.line, 0.8); }
    }
    // Thorax and head.
    ellipse(ctx, x0 + L * 0.68, y - bodyH * 0.1, L * 0.1, bodyH * 0.65, 0, P.body, P.line, 1.2);
    ellipse(ctx, x0 + L * 0.84, y - bodyH * 0.25, L * 0.075, bodyH * 0.6, 0, P.body, P.line, 1.2);
    ellipse(ctx, x0 + L * 0.87, y - bodyH * 0.4, bodyH * 0.22, bodyH * 0.25, 0, '#15130f');
    if (bp.mandible > 0.15) { ctx.beginPath(); ctx.moveTo(x0 + L * 0.9, y); ctx.quadraticCurveTo(x0 + L * (0.95 + bp.mandible * 0.08), y + bodyH * 0.2, x0 + L * 0.9 + bp.mandible * L * 0.06, y + bodyH * 0.55); stroke(ctx, P.line, 2); }
    for (const s of [0, 1]) { ctx.beginPath(); ctx.moveTo(x0 + L * 0.88, y - bodyH * 0.7); ctx.quadraticCurveTo(x0 + L * (0.95 + s * 0.03), y - bodyH * (1.4 + bp.antenna), x0 + L * (1.0 + bp.antenna * 0.12 + s * 0.04), y - bodyH * (1.0 + bp.antenna * 0.8)); stroke(ctx, P.line, 1.1); }
  }

  function plant(ctx, bp, W, H, rng) {
    const ground = H * 0.9;
    const leaf = (l, a) => hsl(bp.leafHue, 38, l, a);
    ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(W, ground); stroke(ctx, 'rgba(90,70,50,0.35)', 2);
    if (bp.kind === 'grass') {
      for (let c = 0; c < 3; c++) {
        const bx = W * (0.3 + c * 0.2) + (rng.float() - 0.5) * 10;
        for (let i = 0; i < 14; i++) {
          const a = -Math.PI / 2 + (rng.float() - 0.5) * 1.3, len = H * 0.55 * bp.height * (0.6 + rng.float() * 0.6) + H * 0.15;
          ctx.beginPath(); ctx.moveTo(bx, ground); ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.5, ground + Math.sin(a) * len * 0.7, bx + Math.cos(a) * len, ground + Math.sin(a) * len * 0.9);
          stroke(ctx, leaf(25 + rng.float() * 25), 1.6);
        }
        if (bp.height > 0.3) { ctx.beginPath(); ctx.moveTo(bx, ground); ctx.lineTo(bx + 4, ground - H * 0.75 * bp.height - H * 0.1); stroke(ctx, leaf(55), 1); ellipse(ctx, bx + 4, ground - H * 0.75 * bp.height - H * 0.12, 3, 8, 0.1, hsl(45, 35, 60)); }
      }
      return;
    }
    const h = H * 0.78 * Math.min(1.1, bp.height * 0.75 + 0.2);
    const tx = W * 0.5;
    const trunkW = Math.max(3, W * 0.035 * (bp.kind === 'fig' ? 1.6 : 1));
    if (bp.succulent) {
      ctx.beginPath(); ctx.roundRect(tx - W * 0.06, ground - h * 0.8, W * 0.12, h * 0.8, W * 0.06); ctx.fillStyle = leaf(35); ctx.fill(); stroke(ctx, leaf(18), 1.5);
      ctx.beginPath(); ctx.roundRect(tx + W * 0.08, ground - h * 0.6, W * 0.07, h * 0.35, W * 0.035); ctx.fillStyle = leaf(38); ctx.fill(); stroke(ctx, leaf(18), 1.2);
      return;
    }
    ctx.beginPath(); ctx.moveTo(tx - trunkW, ground); ctx.lineTo(tx - trunkW * 0.5, ground - h * 0.55); ctx.lineTo(tx + trunkW * 0.5, ground - h * 0.55); ctx.lineTo(tx + trunkW, ground); ctx.fillStyle = hsl(28, 30, 28); ctx.fill();
    if (bp.kind === 'conifer') {
      for (let i = 0; i < 4; i++) {
        const yb = ground - h * (0.18 + i * 0.2), wd = W * 0.32 * bp.crown * (1 - i * 0.2) + W * 0.06;
        ctx.beginPath(); ctx.moveTo(tx - wd, yb); ctx.lineTo(tx, yb - h * 0.32); ctx.lineTo(tx + wd, yb); ctx.closePath(); ctx.fillStyle = leaf(22 + i * 4); ctx.fill(); stroke(ctx, leaf(14), 1);
      }
      return;
    }
    if (bp.kind === 'fig') for (let i = 0; i < 5; i++) { const rx = tx + (i - 2) * W * 0.12 * bp.crown; ctx.beginPath(); ctx.moveTo(rx, ground - h * 0.6); ctx.lineTo(rx + (rng.float() - 0.5) * 6, ground); stroke(ctx, hsl(28, 25, 32), 1.4); }
    const cw = W * 0.3 * bp.crown + W * 0.08;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ellipse(ctx, tx + Math.cos(a) * cw * 0.55, ground - h * 0.72 + Math.sin(a) * h * 0.16, cw * 0.45, h * 0.18, 0, leaf(24 + rng.float() * 14), leaf(14), 1);
    }
    ellipse(ctx, tx, ground - h * 0.74, cw * 0.6, h * 0.2, 0, leaf(34));
  }

  function coral(ctx, bp, W, H, rng) {
    const col = hsl(bp.hue, bp.sat, bp.lit), dk = hsl(bp.hue, bp.sat, bp.lit * 0.6);
    const ground = H * 0.9;
    ellipse(ctx, W / 2, ground, W * 0.35, 6, 0, 'rgba(200,190,160,0.5)');
    function branch(x, y, a, len, w, d) {
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); stroke(ctx, dk, w + 1.5); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); stroke(ctx, col, w);
      if (d > 0) { const k = 1 + (rng.float() < bp.branch ? 1 : 0); for (let i = 0; i <= k; i++) branch(ex, ey, a + (i - k / 2) * 0.55 + (rng.float() - 0.5) * 0.3, len * 0.72, w * 0.75, d - 1); }
      else ellipse(ctx, ex, ey, w * 0.7, w * 0.7, 0, hsl(bp.hue, bp.sat, Math.min(90, bp.lit + 20)));
    }
    for (let i = 0; i < 3; i++) branch(W * (0.38 + i * 0.12), ground, -Math.PI / 2 + (i - 1) * 0.35, H * 0.2 * (bp.height || 1), 5, 4);
  }

  /** Draw species `sp` (with .bp and .id) into a 2D context of size W x H (CSS px). */
  function draw(ctx, sp, W, H) {
    const rng = new SE.Rng('creature/' + sp.id);
    ctx.save();
    const bp = sp.bp;
    if (bp.arch === 'tetra') tetra(ctx, bp, W, H, rng);
    else if (bp.arch === 'fish') fish(ctx, bp, W, H, rng);
    else if (bp.arch === 'ceph') ceph(ctx, bp, W, H, rng);
    else if (bp.arch === 'arthro') arthro(ctx, bp, W, H, rng);
    else if (bp.arch === 'plant') plant(ctx, bp, W, H, rng);
    else if (bp.arch === 'coral') coral(ctx, bp, W, H, rng);
    ctx.restore();
  }

  SE.creature = { draw };
})(globalThis.SE || (globalThis.SE = {}));
