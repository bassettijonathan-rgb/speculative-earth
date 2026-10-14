/*
 * The page: talks to the simulation worker, keeps every frame it has seen so
 * the player can scrub back through time, and drives the map, the tree of
 * life, the field guide and the bestiary.
 */
(function (SE) {
  'use strict';
  const MAX_T = 500;
  const LS_BEST = 'se-bestiary-v1', LS_LAST = 'se-last-v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  // ---------------------------------------------------------------- state
  const S = {
    seed: '', co2Log: [[0, 280]], metas: [], frames: [], head: 0, view: 0, follow: true,
    cards: [], running: false, fast: false, playing: false, step: 5, mode: 'biome',
    region: null, sheetId: -1, rangeId: -1, best: store.get(LS_BEST, []), after: null, toastQ: [], seenToast: new Set(),
  };
  const { grid, coarse } = SE.grids();

  // ---------------------------------------------------------------- worker
  const src = $('#se-core').textContent + '\n' + $('#se-worker').textContent;
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  let reqId = 0;
  const pending = new Map();
  function ask(cmd, data) {
    return new Promise((res) => { const id = ++reqId; pending.set(id, res); worker.postMessage(Object.assign({ cmd, reqId: id }, data)); });
  }
  worker.onmessage = (e) => {
    const m = e.data;
    switch (m.type) {
      case 'reset':
        S.seed = m.seed; S.co2Log = m.co2Log; S.metas = m.species; S.frames = []; S.cards = []; S.head = 0; S.view = 0; S.follow = true;
        S.region = null; S.rangeId = -1; map.setRange(null); map.setMarker(null); S.seenToast = new Set();
        $('#seed-input').value = S.seed;
        renderGuide(); renderChronicle();
        break;
      case 'frame': onFrame(m); break;
      case 'idle':
        S.running = false;
        if (S.fast) { S.fast = false; setBusy(false); }
        saveLast();
        if (S.playing) setTimeout(beat, 420);
        updateControls();
        checkAfter();
        break;
      case 'rewound':
        S.metas = m.species; S.co2Log = m.co2Log; S.frames.length = m.t + 1; S.head = m.t; S.view = m.t; S.follow = true;
        S.cards = S.cards.filter(c => c.t <= m.t);
        setBusy(false);
        refreshAll();
        break;
      case 'co2': S.co2Log = m.co2Log; saveLast(); break;
      case 'reply': { const r = pending.get(m.reqId); if (r) { pending.delete(m.reqId); r(m.data); } break; }
      case 'error': console.error(m.message); toast({ kind: 'error', title: 'Something went wrong', text: m.message.split('\n')[0], t: S.head }); break;
    }
  };

  function onFrame(m) {
    const f = m.frame;
    S.frames[f.t] = f;
    for (const sp of m.species) S.metas[sp.id] = sp;
    for (const [id, died] of m.deaths) if (S.metas[id]) S.metas[id].died = died;
    for (const c of m.cards) {
      S.cards.push(c);
      if (!S.fast && S.follow) toast(c);
      else if (c.kind !== 'rift' && c.kind !== 'vanish') S.toastQ.push(c);
    }
    S.head = Math.max(S.head, f.t);
    if (S.follow) { S.view = f.t; showView(); }
    else updateTimebar();
    if (S.fast) setBusy(true, `Simulating… ${f.t} My`);
    checkAfter();
  }

  function checkAfter() {
    if (S.after && S.head >= S.after.t && !S.running) {
      const a = S.after; S.after = null;
      a.fn();
    }
  }

  function newWorld(seed, co2Log, to) {
    S.playing = false; S.running = to > 0; S.fast = to > 0;
    if (to > 0) setBusy(true, 'Growing the world…');
    S.frames = []; S.head = 0; S.view = 0;
    worker.postMessage({ cmd: 'new', seed, co2Log: co2Log || [[0, 280]], to: to || 0 });
    updateControls();
  }
  function run(to, fast) {
    to = Math.min(MAX_T, to);
    if (to <= S.head) return;
    S.running = true; S.fast = !!fast; S.follow = true;
    if (fast) setBusy(true, `Simulating… ${S.head} My`);
    worker.postMessage({ cmd: 'run', to });
    updateControls();
  }

  // ---------------------------------------------------------------- map
  const map = new SE.MapView($('#map'), grid, coarse);
  map.onTap = (cell) => selectRegion(cell);

  function showView() {
    const f = S.frames[S.view];
    if (f) map.setFrame(f);
    updateReadouts();
    updateTimebar();
    updateControls();
    tree.setData(S.metas, S.view);
    scheduleGuide();
    if (S.rangeId >= 0) scheduleRange();
    renderChronicleSoon();
  }
  function refreshAll() { showView(); renderGuide(); renderChronicle(); renderBestiary(); }

  // ---------------------------------------------------------------- readouts
  function updateReadouts() {
    const f = S.frames[S.view];
    $('#t-num').textContent = S.view;
    $('#t-label').textContent = S.view === 0 ? 'today, the first day without us' : 'million years after present';
    if (!f) return;
    const st = f.stats;
    $('#st-alive').textContent = st.alive;
    $('#st-spec').textContent = st.speciations;
    $('#st-ext').textContent = st.extinctions;
    $('#st-co2').textContent = st.co2;
    $('#st-dt').textContent = (st.dT >= 0 ? '+' : '−') + Math.abs(st.dT).toFixed(1);
    $('#st-plates').textContent = st.plates;
    const co2 = co2At(S.view);
    const slider = $('#co2');
    if (document.activeElement !== slider) slider.value = Math.log2(co2 / 280).toFixed(2);
    $('#co2-val').textContent = `${Math.round(co2)} ppm`;
  }
  function co2At(t) { let v = 280; for (const [tt, val] of S.co2Log) if (tt <= t) v = val; return v; }

  // ---------------------------------------------------------------- timebar
  const spark = $('#spark'), sctx = spark.getContext('2d');
  function updateTimebar() {
    const r = $('#time');
    r.max = Math.max(1, S.head);
    r.value = S.view;
    r.disabled = S.head === 0;
    $('#t-head').textContent = `${S.head} My simulated`;
    drawSpark();
  }
  function drawSpark() {
    const dpr = Math.min(3, window.devicePixelRatio || 1), W = spark.clientWidth, H = spark.clientHeight;
    if (!W) return;
    if (spark.width !== Math.round(W * dpr)) { spark.width = Math.round(W * dpr); spark.height = Math.round(H * dpr); }
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, W, H);
    const css = getComputedStyle(spark), acc = css.getPropertyValue('--accent').trim(), rust = css.getPropertyValue('--rust').trim(), dim = css.getPropertyValue('--fg-dim').trim();
    const n = Math.max(1, S.head);
    // The slider thumb travels inside its own width; keep the chart aligned with the thumb centre.
    const pad = 9, X = (t) => pad + t / n * (W - 2 * pad);
    let mx = 1;
    for (let t = 0; t <= S.head; t++) if (S.frames[t] && S.frames[t].stats.alive > mx) mx = S.frames[t].stats.alive;
    sctx.beginPath();
    for (let t = 0; t <= S.head; t++) {
      const f = S.frames[t]; if (!f) continue;
      const y = H - 3 - f.stats.alive / mx * (H - 8);
      if (t === 0) sctx.moveTo(X(t), y); else sctx.lineTo(X(t), y);
    }
    sctx.lineTo(X(S.head), H); sctx.lineTo(X(0), H); sctx.closePath();
    sctx.globalAlpha = 0.22; sctx.fillStyle = acc; sctx.fill(); sctx.globalAlpha = 1;
    sctx.strokeStyle = acc; sctx.lineWidth = 1.2;
    sctx.beginPath();
    for (let t = 0; t <= S.head; t++) {
      const f = S.frames[t]; if (!f) continue;
      const y = H - 3 - f.stats.alive / mx * (H - 8);
      if (t === 0) sctx.moveTo(X(t), y); else sctx.lineTo(X(t), y);
    }
    sctx.stroke();
    for (const c of S.cards) {
      if (c.kind === 'impact' || c.kind === 'basalt' || c.kind === 'ice') {
        sctx.fillStyle = c.kind === 'ice' ? dim : rust;
        sctx.fillRect(Math.round(X(c.t)) - 1, 0, 2, 6);
      }
    }
  }
  $('#time').addEventListener('input', (e) => {
    S.view = +e.target.value;
    S.follow = S.view >= S.head;
    showView();
  });

  // ---------------------------------------------------------------- controls
  function updateControls() {
    const back = S.view < S.head;
    $('#co2').disabled = back || S.fast;
    $('#branch').hidden = !back || S.running;
    $('#to-present').hidden = !back;
    $('#co2-note').textContent = back ? 'You are looking at the past. Branch from here to change it.' : 'Carbon dioxide from now on. More CO₂, warmer world.';
    $('#play').textContent = S.playing ? 'Pause' : 'Play';
    $('#play').setAttribute('aria-pressed', S.playing ? 'true' : 'false');
    $('#advance').textContent = back ? `Forward ${S.step} My` : `Advance ${S.step} My`;
    $('#ff').disabled = S.head >= MAX_T || S.fast;
    $('#advance').disabled = S.fast || (!back && S.head >= MAX_T);
  }
  for (const b of document.querySelectorAll('[data-step]')) {
    b.addEventListener('click', () => {
      S.step = +b.dataset.step;
      for (const o of document.querySelectorAll('[data-step]')) o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
      updateControls();
    });
  }
  $('#advance').addEventListener('click', () => {
    if (S.view < S.head) { S.view = Math.min(S.head, S.view + S.step); S.follow = S.view >= S.head; showView(); return; }
    run(S.head + S.step, false);
  });
  function beat() {
    if (!S.playing) return;
    if (S.view < S.head) {
      S.view = Math.min(S.head, S.view + S.step); S.follow = S.view >= S.head; showView();
      setTimeout(beat, 420); return;
    }
    if (S.head >= MAX_T) { S.playing = false; updateControls(); return; }
    if (!S.running) run(S.head + S.step, false);
  }
  $('#play').addEventListener('click', () => {
    S.playing = !S.playing;
    if (S.playing) { flushToasts(); beat(); }
    else if (S.running && !S.fast) worker.postMessage({ cmd: 'pause' });
    updateControls();
  });
  $('#ff').addEventListener('click', () => {
    S.playing = false;
    S.toastQ = [];
    run(S.head + 50, true);
  });
  $('#to-present').addEventListener('click', () => { S.view = S.head; S.follow = true; showView(); });
  $('#branch').addEventListener('click', () => {
    setBusy(true, `Rewinding to ${S.view} My…`);
    S.playing = false;
    worker.postMessage({ cmd: 'rewind', t: S.view });
  });
  $('#co2').addEventListener('input', (e) => { $('#co2-val').textContent = `${Math.round(280 * Math.pow(2, +e.target.value))} ppm`; });
  $('#co2').addEventListener('change', (e) => {
    const v = Math.round(280 * Math.pow(2, +e.target.value));
    worker.postMessage({ cmd: 'co2', value: v });
  });
  for (const b of document.querySelectorAll('[data-mode]')) {
    b.addEventListener('click', () => {
      S.mode = b.dataset.mode; map.setMode(S.mode);
      for (const o of document.querySelectorAll('[data-mode]')) o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
      renderLegend();
    });
  }
  $('#zoom-in').addEventListener('click', () => map.zoomBy(1.6));
  $('#zoom-out').addEventListener('click', () => map.zoomBy(1 / 1.6));

  function setBusy(on, text) {
    const b = $('#busy');
    b.hidden = !on;
    if (text) $('#busy-text').textContent = text;
  }

  // ---------------------------------------------------------------- legend
  function renderLegend() {
    const L = $('#legend');
    L.textContent = '';
    const C = SE.MAP_COLORS;
    const sw = (rgb, label) => { const s = el('span', 'sw'); const d = el('i'); d.style.background = `rgb(${rgb.map(Math.round).join(',')})`; s.append(d, label); L.append(s); };
    if (S.mode === 'biome') {
      [[11, 'rainforest'], [10, 'savanna'], [9, 'desert'], [8, 'grassland'], [7, 'temperate forest'], [6, 'taiga'], [5, 'tundra'], [4, 'ice sheet'], [12, 'alpine']].forEach(([b, n]) => sw(C.LAND[b], n));
      sw(C.REEF, 'reef'); sw(C.SEA_SHELF, 'shelf sea'); sw(C.SEA_DEEP, 'deep ocean'); sw(C.SEA_ICE, 'sea ice');
    } else if (S.mode === 'temp') {
      const bar = el('span', 'ramp');
      bar.style.background = `linear-gradient(90deg, ${C.TEMP_STOPS.map(([v, c]) => `rgb(${c.join(',')}) ${((v + 40) / 76 * 100).toFixed(0)}%`).join(',')})`;
      L.append(el('span', 'rl', '−40 °C'), bar, el('span', 'rl', '36 °C'));
    } else if (S.mode === 'rich') {
      const bar = el('span', 'ramp');
      bar.style.background = `linear-gradient(90deg, ${C.RICH_STOPS.map(([v, c]) => `rgb(${c.join(',')}) ${(v * 100).toFixed(0)}%`).join(',')})`;
      L.append(el('span', 'rl', 'few species'), bar, el('span', 'rl', 'most'));
    } else {
      L.append(el('span', 'rl', 'Each colour is one tectonic plate. Dark seams are plate boundaries.'));
    }
  }

  // ---------------------------------------------------------------- tabs
  for (const b of document.querySelectorAll('[role=tab]')) {
    b.addEventListener('click', () => openTab(b.dataset.tab));
  }
  function openTab(name) {
    for (const b of document.querySelectorAll('[role=tab]')) b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false');
    for (const p of document.querySelectorAll('[role=tabpanel]')) p.hidden = p.id !== 'pane-' + name;
    if (name === 'tree') { tree.resize(); tree.setData(S.metas, S.view); }
    store.set('se-tab', name);
  }

  // ---------------------------------------------------------------- thumbnails
  const thumbCache = new Map();
  function thumb(meta, W, H) {
    const key = meta.id + ':' + W + 'x' + H;
    let src = thumbCache.get(key);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!src) {
      src = document.createElement('canvas');
      src.width = W * dpr; src.height = H * dpr;
      const c = src.getContext('2d'); c.scale(dpr, dpr);
      try { SE.creature.draw(c, meta, W, H); } catch (e) { /* a missing drawing is not fatal */ }
      thumbCache.set(key, src);
    }
    const out = document.createElement('canvas');
    out.width = W * dpr; out.height = H * dpr; out.style.width = W + 'px'; out.style.height = H + 'px';
    out.getContext('2d').drawImage(src, 0, 0);
    out.className = 'thumb';
    return out;
  }
  const binom = (m) => `${m.genus} ${m.epithet}`;
  const REALM = ['On land', 'Along the shore', 'In the sea'];

  // ---------------------------------------------------------------- field guide
  let guideTimer = 0;
  function scheduleGuide() { if (S.region) { clearTimeout(guideTimer); guideTimer = setTimeout(() => selectRegion(S.region.cell, true), 160); } }
  async function selectRegion(cell, quiet) {
    map.setMarker(cell);
    const t = S.view;
    const data = await ask('region', { t, cell });
    if (t !== S.view && quiet) return;
    S.region = data;
    if (!quiet) openTab('guide');
    renderGuide();
    if (!quiet && window.matchMedia('(max-width: 979px)').matches) $('#panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function latlon(cell) {
    const la = grid.lat[cell] * 180 / Math.PI, lo = grid.lon[cell] * 180 / Math.PI;
    return `${Math.abs(la).toFixed(0)}° ${la >= 0 ? 'N' : 'S'}, ${Math.abs(lo).toFixed(0)}° ${lo >= 0 ? 'E' : 'W'}`;
  }
  function renderGuide() {
    const P = $('#guide-body');
    P.textContent = '';
    const R = S.region;
    if (!R) {
      P.append(el('p', 'hint', 'Tap anywhere on the map to see what lives there. The field guide lists every species whose range covers that spot and its surroundings.'));
      return;
    }
    const head = el('div', 'region-head');
    const isLand = R.land > 0.5;
    const biome = SE.BIOME_NAMES[isLand ? R.biomeL : R.biomeS] || '';
    head.append(el('h3', '', `${latlon(R.cell)}`));
    head.append(el('p', 'meta', `${isLand ? 'Mostly land' : R.land > 0.05 ? 'Mostly sea, with some land' : 'Open sea'} · ${biome} · ${isLand ? R.Tl : R.Ts} °C average · ${R.t} My`));
    P.append(head);
    if (!R.list.length) { P.append(el('p', 'hint', 'Nothing in the simulation lives here right now.')); return; }
    const groups = [[], [], []];
    for (const it of R.list) { const m = S.metas[it.id]; if (m) groups[m.g.realm].push([it.n, m]); }
    const order = isLand ? [0, 1, 2] : [2, 1, 0];
    for (const gi of order) {
      const g = groups[gi];
      if (!g.length) continue;
      g.sort((a, b) => b[0] - a[0] || a[1].id - b[1].id);
      const sec = el('section', 'realm');
      sec.append(el('h4', 'eyebrow', `${REALM[gi]} · ${g.length}`));
      const ul = el('ul', 'species-list');
      for (const [, m] of g) ul.append(speciesRow(m));
      sec.append(ul);
      P.append(sec);
    }
  }
  function speciesRow(m, extra) {
    const li = el('li');
    const b = el('button', 'sp-row');
    b.type = 'button';
    b.append(thumb(m, 76, 54));
    const txt = el('span', 'sp-txt');
    txt.append(el('span', 'binomial', binom(m)), el('span', 'common', m.common));
    const facts = el('span', 'facts', extra || `${SE.lore.dietWord(m.g)} · ${SE.lore.fmtMass(m.g.mass)}`);
    txt.append(facts);
    b.append(txt);
    b.addEventListener('click', () => openSheet(m.id));
    li.append(b);
    return li;
  }

  // ---------------------------------------------------------------- species sheet
  const LOCO = ['walks', 'flies', 'climbs', 'burrows', 'swims', 'rooted', 'glides'];
  function habitat(g) {
    if (g.realm === 2) return { 3: 'reefs', 4: 'coastal seas', 5: 'open ocean', 6: 'polar seas' }[g.hab] || 'seas';
    if (g.realm === 1) return g.hab === 7 ? 'marsh and shore' : 'shorelines';
    return { 1: 'forest', 2: 'grassland', 6: 'polar land', 7: 'wetland', 4: 'coasts' }[g.hab] || (g.arid > 0.7 ? 'dry country' : 'open country');
  }
  async function openSheet(id, t) {
    const m = S.metas[id]; if (!m) return;
    if (t === undefined) t = S.view;
    S.sheetId = id;
    const sh = $('#sheet');
    sh.hidden = false;
    document.body.classList.add('sheet-open');
    const plate = $('#sheet-plate');
    plate.textContent = '';
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.min(520, ($('.plate').clientWidth || 360) - 24), H = Math.round(W * 0.62);
    const c = document.createElement('canvas');
    c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    const cx = c.getContext('2d'); cx.scale(dpr, dpr);
    try { SE.creature.draw(cx, m, W, H); } catch (e) { /* ignore */ }
    plate.append(c);
    $('#sheet-binomial').textContent = binom(m);
    $('#sheet-common').textContent = m.common;
    const alive = m.born <= t && (m.died === null || m.died > t);
    const status = $('#sheet-status');
    status.className = 'status ' + (alive ? 'alive' : 'extinct');
    status.textContent = m.born > t ? `Evolves at ${m.born} My` : alive ? (m.parent < 0 ? `Living at ${t} My · survivor from today` : `Living at ${t} My · appeared at ${m.born} My`) : `† Extinct · ${m.born}–${m.died} My`;
    const facts = $('#sheet-facts');
    facts.textContent = '';
    const fact = (k, v) => { const d = el('div'); d.append(el('dt', '', k), el('dd', '', v)); facts.append(d); };
    fact('Length', SE.lore.fmtLen(m));
    fact('Mass', SE.lore.fmtMass(m.g.mass));
    fact('Diet', SE.lore.dietWord(m.g));
    fact('Moves', LOCO[m.g.loco]);
    fact('Habitat', habitat(m.g));
    fact('Lineage', SE.CLADES[m.clade].common);
    $('#sheet-text').textContent = '';
    $('#sheet-text').append(el('p', 'hint', 'Reading the field notes…'));
    updateSaveBtn();
    $('#sheet-range').disabled = !alive;
    const e = await ask('entry', { t, id });
    if (S.sheetId !== id) return;
    const T = $('#sheet-text');
    T.textContent = '';
    for (const p of e.paragraphs) {
      const s = el('section');
      s.append(el('h4', 'eyebrow', p.h), el('p', '', p.text));
      T.append(s);
    }
    const links = (title, ids) => {
      if (!ids.length) return;
      const s = el('section'); s.append(el('h4', 'eyebrow', title));
      const row = el('div', 'chips');
      for (const oid of ids) {
        const om = S.metas[oid]; if (!om) continue;
        const b = el('button', 'chip link'); b.type = 'button';
        b.append(el('i', '', binom(om)));
        b.addEventListener('click', () => openSheet(oid, t));
        row.append(b);
      }
      s.append(row); T.append(s);
    };
    links('Eaten by', e.predators);
    links('Eats', e.prey);
    links('Line of descent', e.ancestry.filter(x => x !== id));
    S.sheetRange = e.range;
    S.sheetT = t;
  }
  function closeSheet() {
    $('#sheet').hidden = true; S.sheetId = -1;
    document.body.classList.remove('sheet-open');
  }
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
  $('#sheet-range').addEventListener('click', () => {
    S.rangeId = S.sheetId;
    map.setRange(S.sheetRange || []);
    showRangeBanner();
    closeSheet();
    $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#sheet-tree').addEventListener('click', () => {
    const id = S.sheetId;
    closeSheet(); openTab('tree'); tree.highlight(id);
    $('#panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  let rangeTimer = 0;
  function scheduleRange() {
    clearTimeout(rangeTimer);
    rangeTimer = setTimeout(async () => {
      const id = S.rangeId; if (id < 0) return;
      const cells = await ask('range', { t: S.view, id });
      if (S.rangeId === id) { map.setRange(cells); showRangeBanner(cells.length === 0); }
    }, 120);
  }
  function showRangeBanner(gone) {
    const m = S.metas[S.rangeId];
    const b = $('#range-banner');
    if (!m) { b.hidden = true; return; }
    b.hidden = false;
    $('#range-name').textContent = binom(m);
    $('#range-note').textContent = gone ? 'not alive at this time' : 'range';
  }
  $('#range-clear').addEventListener('click', () => { S.rangeId = -1; map.setRange(null); $('#range-banner').hidden = true; });

  // ---------------------------------------------------------------- share codes & bestiary
  function code(t, id, seed, co2Log) {
    seed = seed || S.seed; co2Log = co2Log || S.co2Log;
    let s = `SE1:${seed}:${t}`;
    if (id !== undefined && id >= 0) s += `:${id}`;
    const co2 = co2Log.filter(x => x[0] <= t && !(x[0] === 0 && x[1] === 280));
    if (co2.length) s += (id !== undefined && id >= 0 ? '' : ':') + ':co2=' + co2.map(x => `${x[0]}-${x[1]}`).join('_');
    return s;
  }
  function parseCode(str) {
    const p = String(str).trim().split(':');
    if (p[0] !== 'SE1' || p.length < 3) return null;
    const seed = p[1].replace(/[^A-Za-z0-9_-]/g, '');
    const t = Math.max(0, Math.min(MAX_T, parseInt(p[2], 10) || 0));
    const id = p[3] !== undefined && p[3] !== '' ? parseInt(p[3], 10) : -1;
    let co2Log = [[0, 280]];
    const c = p.find(x => x.startsWith('co2='));
    if (c) for (const kv of c.slice(4).split('_')) { const [a, b] = kv.split('-').map(Number); if (isFinite(a) && isFinite(b) && b > 0) co2Log.push([a, b]); }
    co2Log = co2Log.sort((a, b) => a[0] - b[0]).filter((x, i, arr) => i === arr.length - 1 || arr[i + 1][0] !== x[0]);
    return seed ? { seed, t, id: isNaN(id) ? -1 : id, co2Log } : null;
  }
  function sameWorld(seed, co2Log, t) {
    if (seed !== S.seed) return false;
    const a = JSON.stringify(co2Log.filter(x => x[0] <= t && !(x[0] === 0 && x[1] === 280)));
    const b = JSON.stringify(S.co2Log.filter(x => x[0] <= t && !(x[0] === 0 && x[1] === 280)));
    return a === b;
  }
  function openCode(c) {
    const go = () => { S.view = c.t; S.follow = S.view >= S.head; showView(); if (c.id >= 0) setTimeout(() => openSheet(c.id, c.t), 50); };
    if (sameWorld(c.seed, c.co2Log, c.t) && (S.head >= c.t)) { go(); return; }
    if (sameWorld(c.seed, c.co2Log, c.t) && !S.fast) { S.after = { t: c.t, fn: go }; run(c.t, true); return; }
    S.after = { t: c.t, fn: go };
    newWorld(c.seed, c.co2Log, c.t);
  }
  async function copy(text, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; }
    if (btn) { const o = btn.textContent; btn.textContent = ok ? 'Copied' : 'Select and copy below'; setTimeout(() => { btn.textContent = o; }, 1600); }
    if (!ok) { const box = $('#share-out'); box.value = text; box.hidden = false; box.focus(); box.select(); }
  }
  function isSaved(id) { return S.best.some(b => b.seed === S.seed && b.id === id && sameWorld(b.seed, b.co2Log, b.t)); }
  function updateSaveBtn() {
    const b = $('#sheet-save');
    const saved = isSaved(S.sheetId);
    b.textContent = saved ? 'In your bestiary' : 'Add to bestiary';
    b.setAttribute('aria-pressed', saved ? 'true' : 'false');
  }
  $('#sheet-save').addEventListener('click', () => {
    const id = S.sheetId, m = S.metas[id]; if (!m) return;
    if (isSaved(id)) { S.best = S.best.filter(b => !(b.seed === S.seed && b.id === id)); }
    else {
      const t = S.sheetT !== undefined ? S.sheetT : S.view;
      S.best.unshift({ seed: S.seed, co2Log: S.co2Log.filter(x => x[0] <= t), t, id, binomial: binom(m), common: m.common, bp: m.bp, g: m.g, born: m.born, died: m.died, clade: m.clade, saved: Date.now() });
    }
    store.set(LS_BEST, S.best);
    updateSaveBtn(); renderBestiary();
  });
  $('#sheet-share').addEventListener('click', (e) => copy(code(S.sheetT !== undefined ? S.sheetT : S.view, S.sheetId), e.currentTarget));

  function renderBestiary() {
    const P = $('#best-body');
    P.textContent = '';
    $('#best-count').textContent = S.best.length ? `${S.best.length} saved` : '';
    if (!S.best.length) {
      P.append(el('p', 'hint', 'Species you add from the field guide are kept here, in this browser. Each one carries its world’s seed and the moment you saw it, so a share code reopens the same animal in the same world.'));
      return;
    }
    const ul = el('ul', 'species-list');
    for (const b of S.best) {
      const meta = { id: b.id, bp: b.bp, g: b.g, genus: b.binomial.split(' ')[0], epithet: b.binomial.split(' ').slice(1).join(' '), common: b.common };
      const li = speciesRow(meta, `world “${b.seed}” · seen at ${b.t} My`);
      const btn = li.querySelector('button');
      btn.replaceWith(btn.cloneNode(true));
      const nb = li.querySelector('button');
      nb.addEventListener('click', () => openCode({ seed: b.seed, t: b.t, id: b.id, co2Log: b.co2Log }));
      nb.querySelector('canvas.thumb').replaceWith(thumb(meta, 76, 54));
      const tools = el('div', 'row-tools');
      const share = el('button', 'mini', 'Copy code'); share.type = 'button';
      share.addEventListener('click', () => copy(code(b.t, b.id, b.seed, b.co2Log), share));
      const rm = el('button', 'mini quiet', 'Remove'); rm.type = 'button';
      rm.addEventListener('click', () => { S.best = S.best.filter(x => x !== b); store.set(LS_BEST, S.best); renderBestiary(); if (S.sheetId >= 0) updateSaveBtn(); });
      tools.append(share, rm);
      li.append(tools);
      ul.append(li);
    }
    P.append(ul);
  }

  // ---------------------------------------------------------------- chronicle & event cards
  let chronTimer = 0;
  function renderChronicleSoon() { clearTimeout(chronTimer); chronTimer = setTimeout(renderChronicle, 200); }
  const KIND = { impact: 'Impact', basalt: 'Eruption', ice: 'Climate', thaw: 'Climate', rift: 'Tectonics', suture: 'Tectonics', vanish: 'Tectonics', evo: 'Evolution', error: 'Error' };
  function renderChronicle() {
    const P = $('#chron-body');
    P.textContent = '';
    const list = S.cards.filter(c => c.t <= S.view);
    if (!list.length) { P.append(el('p', 'hint', 'Nothing has happened yet. Advance time and the planet’s history will be written here: impacts, eruptions, ice ages, continents splitting and colliding, and the first time a lineage tries something new.')); return; }
    const ul = el('ol', 'chron');
    for (let i = list.length - 1; i >= 0 && ul.children.length < 200; i--) {
      const c = list[i];
      const li = el('li', 'ev ev-' + c.kind);
      const b = el('button', 'ev-btn'); b.type = 'button';
      b.append(el('span', 'ev-t', `${c.t} My`), el('span', 'ev-k', KIND[c.kind] || ''), el('strong', 'ev-title', c.title), el('span', 'ev-text', c.text));
      b.addEventListener('click', () => focusCard(c));
      li.append(b);
      ul.append(li);
    }
    P.append(ul);
  }
  function cardCell(c) {
    if (c.cell >= 0) return c.cell;
    if (c.coarseCell >= 0) return c.coarseCell; // coarse cells share indices with the fine grid
    return -1;
  }
  function focusCard(c) {
    S.view = c.t; S.follow = S.view >= S.head; showView();
    const cell = cardCell(c);
    if (cell >= 0) map.pulse(cell);
    if (c.kind === 'evo' && c.id >= 0) openSheet(c.id, c.t);
    else $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  let toastTimer = 0;
  function toast(c) {
    const box = $('#toast');
    $('#toast-kind').textContent = `${KIND[c.kind] || ''} · ${c.t} My`;
    $('#toast-title').textContent = c.title;
    $('#toast-text').textContent = c.text;
    box.className = 'toast k-' + c.kind;
    box.hidden = false;
    S.toastCard = c;
    const cell = cardCell(c);
    if (cell >= 0) map.pulse(cell);
    $('#toast-go').hidden = !(c.kind === 'evo' && c.id >= 0);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 9000);
  }
  function flushToasts() {
    // After a fast-forward, show the latest big event so the player sees what they skipped.
    const q = S.toastQ; S.toastQ = [];
    const big = q.filter(c => c.kind !== 'thaw');
    if (big.length) toast(big[big.length - 1]);
  }
  $('#toast-close').addEventListener('click', () => { $('#toast').hidden = true; });
  $('#toast-go').addEventListener('click', () => { const c = S.toastCard; if (c) openSheet(c.id, c.t); });

  // ---------------------------------------------------------------- world tab
  const W1 = ['amber', 'basalt', 'cedar', 'delta', 'ember', 'fjord', 'granite', 'heron', 'indigo', 'juniper', 'kelp', 'lichen', 'moraine', 'nautilus', 'obsidian', 'pumice', 'quartz', 'reef', 'sedge', 'tundra', 'umber', 'vole', 'willow', 'zephyr'];
  const W2 = ['coast', 'drift', 'shelf', 'basin', 'ridge', 'atoll', 'steppe', 'mire', 'gyre', 'rift', 'dune', 'karst'];
  function randomSeed() { return `${W1[Math.floor(Math.random() * W1.length)]}-${W2[Math.floor(Math.random() * W2.length)]}-${Math.floor(Math.random() * 90 + 10)}`; }
  $('#new-world').addEventListener('click', () => {
    const s = ($('#seed-input').value || '').trim().replace(/[^A-Za-z0-9_-]/g, '') || randomSeed();
    newWorld(s, [[0, 280]], 0);
  });
  $('#random-world').addEventListener('click', () => { const s = randomSeed(); $('#seed-input').value = s; newWorld(s, [[0, 280]], 0); });
  $('#copy-world').addEventListener('click', (e) => copy(code(S.view), e.currentTarget));
  $('#open-code').addEventListener('click', () => {
    const c = parseCode($('#code-input').value);
    const msg = $('#code-msg');
    if (!c) { msg.textContent = 'That doesn’t look like a share code. Codes start with SE1.'; return; }
    msg.textContent = c.seed === S.seed ? '' : `Growing world “${c.seed}” to ${c.t} My…`;
    openCode(c);
  });

  function saveLast() { store.set(LS_LAST, { seed: S.seed, co2Log: S.co2Log, t: S.head }); }

  // ---------------------------------------------------------------- tree
  const tree = new SE.TreeView($('#tree'), { onPick: (id) => openSheet(id) });
  $('#hide-extinct').addEventListener('change', (e) => tree.setHideExtinct(e.target.checked));
  $('#tree-in').addEventListener('click', () => tree.zoomBy(1.8));
  $('#tree-out').addEventListener('click', () => tree.zoomBy(1 / 1.8));

  // ---------------------------------------------------------------- start
  window.addEventListener('resize', drawSpark);
  renderLegend(); renderBestiary(); renderGuide(); renderChronicle();
  openTab(store.get('se-tab', 'guide'));
  const last = store.get(LS_LAST, null);
  if (last && last.seed) newWorld(String(last.seed), last.co2Log, Math.min(MAX_T, last.t | 0));
  else newWorld(randomSeed(), [[0, 280]], 0);
  updateControls();
  SE.app = { S, map, tree, run, newWorld, openSheet, selectRegion, parseCode, code };
})(globalThis.SE);
