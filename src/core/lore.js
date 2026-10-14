/*
 * Field-guide entries, written from the simulation's own records: the lineage,
 * the event that created the species, its range and neighbours at the moment
 * the player is looking.
 */
(function (SE) {
  'use strict';
  const CELL_KM2 = 510e6 / 2562;

  function fmtMass(m) {
    const kg = Math.pow(10, m);
    if (kg < 0.001) return `${(kg * 1e6).toFixed(kg < 1e-5 ? 1 : 0)} mg`;
    if (kg < 1) return `${(kg * 1000).toFixed(kg < 0.01 ? 1 : 0)} g`;
    if (kg < 1000) return `${kg < 10 ? kg.toFixed(1) : Math.round(kg)} kg`;
    return `${(kg / 1000).toFixed(1)} tonnes`;
  }
  function fmtLen(sp) {
    const kg = Math.pow(10, sp.g.mass);
    const k = sp.bp.arch === 'arthro' ? 0.5 : sp.bp.arch === 'ceph' ? 0.6 : sp.bp.arch === 'fish' ? 0.42 : 0.38;
    const m = k * Math.cbrt(kg) * (sp.bp.len || 1) * (sp.bp.tail ? 1 + 0.4 * sp.bp.tail : 1);
    if (m < 0.01) return `${(m * 1000).toFixed(0)} mm`;
    if (m < 1) return `${(m * 100).toFixed(0)} cm`;
    return `${m.toFixed(1)} m`;
  }
  function dietWord(g) {
    if (g.troph < 0.3) return 'plant';
    if (g.troph < 0.8) return 'reef-building colony';
    if (g.troph < 1.3) return g.realm === 2 && g.mass < -1 ? 'plankton grazer' : 'plant-eater';
    if (g.troph < 1.7) return 'omnivore';
    if (g.troph < 2.4) return g.mass < -0.5 ? 'insect-eater' : 'small-game hunter';
    if (g.troph < 2.9) return 'predator';
    return 'apex predator';
  }
  const LOCO = ['ground-dwelling', 'flying', 'tree-climbing', 'burrowing', 'swimming', 'rooted', 'gliding'];
  function socialPhrase(sp) {
    const s = sp.g.social, a = sp.bp.arch;
    if (sp.g.troph < 0.8) return '';
    if (s < 0.2) return 'It lives alone outside the breeding season.';
    if (s < 0.5) return 'It lives in pairs or small family groups.';
    if (s < 0.8) return a === 'fish' || a === 'ceph' ? 'It moves in schools.' : sp.g.loco === 1 ? 'It roosts and forages in flocks.' : 'It lives in herds or loose troops.';
    return 'It lives in large colonies where a few individuals breed and the rest work.';
  }
  function bodyText(sp) {
    const b = sp.bp, out = [];
    if (b.arch === 'tetra') {
      const fore = { leg: 'four walking limbs', wing: 'feathered wings', mwing: 'membrane wings stretched over long fingers', flipper: 'paddle-shaped flippers',
        arm: 'grasping forelimbs', vestigial: 'tiny vestigial wings', wingleg: 'forelimbs that walk on folded wing-fingers, with loose skin where the flight membrane used to be' }[b.fore];
      out.push(`It has ${fore}`);
      if (b.hind === 'hop') out.push('long hopping hind legs');
      if (b.hind === 'flipper' && b.fore !== 'flipper') out.push('flipper-like hind feet');
      if (b.hind === 'vestigial') out.push('no hind limbs to speak of');
      if (b.fluke) out.push('a horizontal tail fluke');
      if (b.patag) out.push('gliding membranes between its limbs');
      if (b.horn > 0.4) out.push('horns');
      if (b.crest > 0.4) out.push('a crest on the head');
      if (b.teeth > 0.6) out.push('long stabbing teeth');
      if (b.claws > 0.6) out.push('heavy claws');
      const cov = ['fur', 'feathers', 'scales', 'bare skin'][b.cover];
      return out.join(', ') + `, and is covered in ${cov}.`;
    }
    if (b.arch === 'ceph') {
      if (b.upright > 0.8) return `Its ${b.arms} muscular arms are thickened into walking limbs, and it carries its mantle upright like a head. Mucus keeps the skin from drying out.`;
      if (b.upright > 0.3) return `It hauls itself across rocks on ${b.arms} stout arms, keeping water in its mantle to breathe.`;
      return `A soft-bodied swimmer with ${b.arms} arms${b.fins ? ' and fins along the mantle' : ''}.`;
    }
    if (b.arch === 'fish') return b.lobe ? 'Its paired fins are fleshy and jointed, strong enough to walk on, and it can gulp air.' : b.shark ? 'A cartilaginous fish with a tall dorsal fin and rows of replaceable teeth.' : 'A bony fish with a forked tail.';
    if (b.arch === 'arthro') return `It has ${Math.round(b.segs)} body segments and ${b.legs} pairs of legs${b.wings ? (b.elytra ? ', with hardened wing cases' : ', with two pairs of wings') : ''}.`;
    if (b.arch === 'plant') return { grass: 'A clumping grass that regrows from the base when grazed.', broad: 'A broad-leaved tree with a spreading crown.', fig: 'A sprawling tree that drops aerial roots to the ground.', conifer: 'A needle-leaved conifer.' }[b.kind];
    if (b.arch === 'coral') return 'A colony of tiny polyps that builds branching limestone skeletons and hosts algae.';
    return '';
  }

  function rangeAt(hist, id) {
    if (!hist) return null;
    for (let i = 0; i < hist.ids.length; i++) if (hist.ids[i] === id) return hist.cells.subarray(hist.offs[i], hist.offs[i + 1]);
    return null;
  }

  function entry(world, histAt, envAt, id, t) {
    const L = world.life, sp = L.species[id], cl = SE.CLADES[sp.clade];
    const binom = (s) => `${s.genus} ${s.epithet}`;
    const alive = sp.born <= t && (sp.died === null || sp.died > t);
    const H = histAt(t), E = envAt(t);
    const cells = alive ? rangeAt(H, id) : null;
    const paras = [];
    const g = sp.g;
    const where = g.realm === 2 ? 'the sea' : g.realm === 1 ? 'the shore' : 'the land';
    paras.push({ h: 'Overview', text: `A ${LOCO[g.loco]} ${dietWord(g)} of ${where}, about ${fmtLen(sp)} long and weighing around ${fmtMass(g.mass)}. ${bodyText(sp)} ${socialPhrase(sp)}`.trim() });
    // Ancestry.
    const chain = [];
    for (let s = sp; s; s = s.parent >= 0 ? L.species[s.parent] : null) chain.push(s.id);
    chain.reverse();
    const founder = L.species[chain[0]];
    let anc = id === chain[0]
      ? `${binom(sp)} is one of the survivors from the age of humans, the starting point of the ${cl.common} lineage in this world.`
      : `It descends from the ${founder.common.toLowerCase()} (${binom(founder)}) through ${chain.length - 1} speciation event${chain.length > 2 ? 's' : ''}. Its parent species was ${binom(L.species[sp.parent])}.`;
    const steps = sp.trans.filter(x => x.id !== id).map(x => `${SE.NAMING.ADJ[x.k].toLowerCase()} forms by ${x.t} My (${binom(L.species[x.id])})`);
    if (steps.length) anc += ` Along the way the line produced ${steps.join(', then ')}.`;
    paras.push({ h: 'Ancestry', text: anc });
    if (sp.parent >= 0) paras.push({ h: 'How it got here', text: `It appeared ${sp.born} million years after present. ${sp.cause}` });
    // Range and niche.
    if (cells && cells.length && E) {
      const counts = {};
      for (const c of cells) { const b = g.realm === 2 ? E.domS[c] : E.domL[c]; if (b < 13) counts[b] = (counts[b] || 0) + 1; }
      const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 2).map(b => SE.BIOME_NAMES[b]);
      let tm = 0;
      for (const c of cells) tm += g.realm === 2 ? E.Ts[c] : E.Tl[c];
      tm /= cells.length;
      const area = cells.length * CELL_KM2;
      paras.push({ h: 'Range', text: `${t} million years after present it covers about ${area >= 1e6 ? (area / 1e6).toFixed(1) + ' million' : Math.round(area / 1000) + ' thousand'} km², mostly ${top.join(' and ') || 'mixed country'}, where the average temperature is ${Math.round(tm)} °C.` });
      // Neighbours: predators, prey, competitors.
      const set = new Set(cells);
      const preds = [], prey = [], rivals = [];
      const key = SE.LIFE.nicheKey(g);
      for (let i = 0; i < H.ids.length; i++) {
        const oid = H.ids[i];
        if (oid === id) continue;
        let ov = 0;
        for (let k = H.offs[i]; k < H.offs[i + 1]; k++) if (set.has(H.cells[k])) ov++;
        if (!ov) continue;
        const o = L.species[oid], og = o.g;
        const sameWorld = (og.realm === 2) === (g.realm === 2) || og.realm === 1 || g.realm === 1;
        if (!sameWorld) continue;
        if (og.troph >= Math.max(2.4, g.troph + 0.4) && og.mass >= g.mass - 0.3 && og.mass <= g.mass + 3.5 && g.troph >= 0.8) preds.push([ov, oid]);
        else if (g.troph >= 1.7 && og.troph >= 0.8 && og.troph < g.troph && og.mass >= g.mass - 3.5 && og.mass <= g.mass + 0.3) prey.push([ov, oid]);
        else if (SE.LIFE.nicheKey(og) === key) rivals.push([ov, oid]);
      }
      const name = ([, oid]) => { const o = L.species[oid]; return `the ${o.common.toLowerCase()} (${binom(o)})`; };
      const sortTop = (a) => a.sort((x, y) => y[0] - x[0] || x[1] - y[1]).slice(0, 3);
      const P = sortTop(preds), Q = sortTop(prey), R = sortTop(rivals);
      let eco = '';
      if (g.troph < 0.8) eco = 'It feeds the plant-eaters of its range.';
      else if (P.length) eco = `Its main predators are ${P.map(name).join(', ')}.`;
      else eco = 'Nothing in its range hunts it once it is grown.';
      if (Q.length) eco += ` It hunts ${Q.map(name).join(', ')}.`;
      if (R.length) eco += ` It competes for the same niche with ${R.map(name).join(' and ')}.`;
      paras.push({ h: 'Niche', text: `It does best at around ${Math.round(g.Topt)} °C. ${eco}` });
      return { id, binomial: binom(sp), common: sp.common, alive, born: sp.born, died: sp.died, paragraphs: paras, predators: P.map(x => x[1]), prey: Q.map(x => x[1]), ancestry: chain, cells: cells.length };
    }
    if (sp.died !== null && sp.died <= t) paras.push({ h: 'Fate', text: `It died out ${sp.died} million years after present. ${sp.xcause}` });
    else if (sp.born > t) paras.push({ h: 'Status', text: `At ${t} My it has not evolved yet.` });
    return { id, binomial: binom(sp), common: sp.common, alive, born: sp.born, died: sp.died, paragraphs: paras, predators: [], prey: [], ancestry: chain, cells: 0 };
  }

  SE.lore = { entry, fmtMass, fmtLen, dietWord };
})(globalThis.SE || (globalThis.SE = {}));
