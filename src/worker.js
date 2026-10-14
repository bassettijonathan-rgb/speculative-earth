/*
 * The simulation thread. Owns the World, its per-million-year history (for
 * scrubbing back and for the field guide at past times) and checkpoints every
 * 25 My (for rewinding). The page talks to it with small messages.
 */
(function () {
  'use strict';
  const SE = globalThis.SE;
  const CHECK_EVERY = 25;
  let world = null, hist = [], env = [], checkpoints = new Map(), running = false, target = 0, gen = 0;

  function meta(sp) {
    return { id: sp.id, parent: sp.parent, clade: sp.clade, genus: sp.genus, epithet: sp.epithet, common: sp.common, born: sp.born, died: sp.died,
      g: Object.assign({}, sp.g), bp: Object.assign({}, sp.bp), causeKind: sp.causeKind, trans: sp.trans.map(x => x.k) };
  }

  function record() {
    hist[world.t] = world.life.snapshot();
    env[world.t] = world.envSnapshot();
    if (world.t % CHECK_EVERY === 0) checkpoints.set(world.t, world.serialize());
  }

  function postFrame(cards, newIds, deaths) {
    const f = world.frame();
    postMessage({ type: 'frame', frame: f, cards, species: newIds.map(id => meta(world.life.species[id])), deaths }, [f.biome.buffer, f.temp.buffer, f.elev.buffer, f.plate.buffer, f.rich.buffer]);
  }

  function tick() {
    const before = world.life.species.length;
    const aliveBefore = new Set(world.life.alive);
    const cards = world.step();
    record();
    const newIds = [];
    for (let i = before; i < world.life.species.length; i++) newIds.push(i);
    const deaths = [];
    for (const id of aliveBefore) { const sp = world.life.species[id]; if (sp.died !== null) deaths.push([id, sp.died, sp.xcause]); }
    for (const id of newIds) { const sp = world.life.species[id]; if (sp.died !== null) deaths.push([id, sp.died, sp.xcause]); }
    postFrame(cards, newIds, deaths);
  }

  function loop(myGen) {
    if (myGen !== gen || !running) return;
    if (world.t >= target) { running = false; postMessage({ type: 'idle', t: world.t }); return; }
    // Several ticks per macrotask keeps messages flowing without slowing the run.
    const until = Date.now() + 40;
    do { tick(); } while (world.t < target && Date.now() < until);
    setTimeout(() => loop(myGen), 0);
  }

  function fullMeta() { return world.life.species.map(meta); }

  function newWorld(seed, co2Log, to) {
    gen++;
    world = new SE.World(seed, co2Log);
    hist = []; env = []; checkpoints = new Map();
    record();
    postMessage({ type: 'reset', seed: world.seed, co2Log: world.co2Log, species: fullMeta(), events: [] });
    postFrame([], [], []);
    if (to > 0) { target = to; running = true; loop(gen); }
    else postMessage({ type: 'idle', t: 0 });
  }

  function rewind(t) {
    gen++;
    running = false;
    let best = 0;
    for (const k of checkpoints.keys()) if (k <= t && k > best) best = k;
    world.restore(checkpoints.get(best));
    for (const k of [...checkpoints.keys()]) if (k > best) checkpoints.delete(k);
    hist.length = best + 1; env.length = best + 1;
    while (world.t < t) { world.step(); record(); }
    postMessage({ type: 'rewound', t: world.t, species: fullMeta(), co2Log: world.co2Log });
    postFrame([], [], []);
    postMessage({ type: 'idle', t: world.t });
  }

  function region(t, cell) {
    const H = hist[t], E = env[t];
    if (!H) return { t, cell, list: [] };
    const coarse = world.coarse;
    const c0 = coarse.owner[cell];
    const set = new Set([c0]);
    for (let k = coarse.adjStart[c0]; k < coarse.adjStart[c0 + 1]; k++) set.add(coarse.adj[k]);
    const list = [];
    for (let i = 0; i < H.ids.length; i++) {
      let n = 0;
      for (let k = H.offs[i]; k < H.offs[i + 1]; k++) if (set.has(H.cells[k])) n++;
      if (n) list.push({ id: H.ids[i], n });
    }
    const land = E.land[c0] / 255;
    return { t, cell, coarse: c0, land, biomeL: E.domL[c0], biomeS: E.domS[c0], Tl: E.Tl[c0], Ts: E.Ts[c0], list };
  }

  function rangeOf(t, id) {
    const H = hist[t];
    if (!H) return [];
    for (let i = 0; i < H.ids.length; i++) if (H.ids[i] === id) return Array.from(H.cells.subarray(H.offs[i], H.offs[i + 1]));
    return [];
  }

  onmessage = (e) => {
    const m = e.data;
    try {
      switch (m.cmd) {
        case 'new': newWorld(m.seed, m.co2Log, m.to || 0); break;
        case 'run': if (!world) return; target = Math.max(world.t, m.to); if (!running) { running = true; loop(gen); } break;
        case 'pause': running = false; target = world.t; postMessage({ type: 'idle', t: world.t }); break;
        case 'co2': world.setCO2(world.t, m.value); postMessage({ type: 'co2', co2Log: world.co2Log }); break;
        case 'rewind': rewind(m.t); break;
        case 'region': postMessage({ type: 'reply', reqId: m.reqId, data: region(m.t, m.cell) }); break;
        case 'entry': postMessage({ type: 'reply', reqId: m.reqId, data: Object.assign(SE.lore.entry(world, (t) => hist[t], (t) => env[t], m.id, m.t), { range: rangeOf(m.t, m.id) }) }); break;
        case 'range': postMessage({ type: 'reply', reqId: m.reqId, data: rangeOf(m.t, m.id) }); break;
      }
    } catch (err) {
      postMessage({ type: 'error', message: String(err && err.stack || err) });
    }
  };
})();
