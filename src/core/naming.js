/*
 * Names. Genus names change when a lineage crosses a big threshold (losing
 * flight, leaving the sea...): a Greek or Latin prefix for the change joined to
 * the founding clade's stem, e.g. Apter- + nycteris = Apteronycteris. Species
 * epithets describe how the species differs: gigas, ferox, ambulans, borealis.
 */
(function (SE) {
  'use strict';

  const PREFIX = {
    flightless: ['Apter', 'Chamae', 'Pedo'],
    predator: ['Thero', 'Lyco', 'Harpago', 'Dino'],
    giant: ['Mega', 'Megalo', 'Gigant'],
    dwarf: ['Nano', 'Micro'],
    shore: ['Amphi', 'Litho', 'Psepho'],
    landfall: ['Geo', 'Pedo', 'Cherso'],
    tosea: ['Hydro', 'Thalasso', 'Enhydro'],
    burrow: ['Orycto', 'Geo', 'Spalaco'],
    glide: ['Petauro', 'Pteno'],
    climb: ['Dendro', 'Hylo'],
    grazer: ['Dromo', 'Hippo'],
    social: ['Syn', 'Coeno'],
    cold: ['Cryo', 'Chiono'],
    desert: ['Psammo', 'Xero'],
    walkfish: ['Pedo', 'Amphi'],
  };
  const ADJ = {
    flightless: 'Walking', predator: 'Hunting', giant: 'Giant', dwarf: 'Pygmy', shore: 'Shore', landfall: 'Land', tosea: 'Sea',
    burrow: 'Burrowing', glide: 'Gliding', climb: 'Tree', grazer: 'Running', social: 'Colonial', cold: 'Snow', desert: 'Desert', walkfish: 'Walking',
  };
  const FALLBACK = ['fuscus', 'rufus', 'pallidus', 'niger', 'albus', 'varius', 'maculatus', 'striatus', 'obscurus', 'elegans', 'robustus', 'gracilis',
    'cristatus', 'longicaudus', 'brevipes', 'macrotis', 'occidentalis', 'orientalis', 'australis', 'septentrionalis', 'lateralis', 'cinereus',
    'flavus', 'viridis', 'aurantius', 'ornatus', 'modestus', 'insignis', 'simplex', 'tenebrosus', 'velox', 'tardus', 'latifrons', 'crassus',
    'longipes', 'brevirostris', 'longirostris', 'nudus', 'hirsutus', 'barbatus', 'nobilis', 'humilis', 'vagans', 'errans', 'cursor'];
  const PLACE_A = ['Var', 'Keth', 'Ost', 'Mal', 'Tor', 'Bren', 'Sil', 'Cal', 'Dun', 'Fer', 'Hal', 'Ister', 'Lun', 'Mor', 'Nar', 'Pel', 'Quor', 'Ruv', 'Tal', 'Ul'];
  const PLACE_B = ['a', 'i', 'o', 'e', 'u'];
  const PLACE_C = ['n', 'r', 'l', 'th', 's', 'm', 'nd', 'rk'];

  function joinGenus(prefix, stem) {
    const v = /[aeiouy]$/i, sv = /^[aeiouy]/i;
    let p = prefix;
    if (v.test(p) && sv.test(stem)) p = p.slice(0, -1);
    else if (!v.test(p) && !sv.test(stem)) p = p + 'o';
    const g = p + stem.toLowerCase();
    return g[0].toUpperCase() + g.slice(1);
  }

  class Namer {
    constructor(rng) { this.rng = rng; this.used = new Set(); this.genera = new Map(); }

    reserve(genus, epithet) { this.used.add(genus + ' ' + epithet); }

    genusFor(transition, clade, parentGenus) {
      const opts = PREFIX[transition];
      if (!opts) return parentGenus;
      for (const p of opts) {
        const g = joinGenus(p, clade.stem);
        const owner = this.genera.get(g);
        if (!owner) { this.genera.set(g, clade.key); return g; }
      }
      // All taken: stack the new prefix on the parent genus.
      const g = joinGenus(this.rng.pick(opts), parentGenus);
      this.genera.set(g, clade.key);
      return g;
    }

    epithet(genus, sp, parent, env) {
      const g = sp.g, pg = parent ? parent.g : g;
      const groups = [];
      const last = sp.trans.length && sp.trans[sp.trans.length - 1].id === sp.id ? sp.trans[sp.trans.length - 1].k : null;
      const dm = g.mass - pg.mass;
      if (last === 'flightless') groups.push(['ambulans', 'pedestris', 'apterus', 'cursor']);
      if (last === 'predator') groups.push(['ferox', 'rapax', 'venator', 'lupinus', 'tyrannus']);
      if (last === 'landfall') groups.push(['terrestris', 'ambulator', 'sylvicola', 'pedestris']);
      if (last === 'shore') groups.push(['litoralis', 'amphibius', 'littoreus', 'saxicola']);
      if (last === 'tosea') groups.push(['marinus', 'natans', 'pelagius', 'thalassinus']);
      if (last === 'burrow') groups.push(['fossor', 'cunicularius', 'talpinus', 'subterraneus']);
      if (last === 'glide') groups.push(['volitans', 'petaurus', 'velivolans']);
      if (last === 'climb') groups.push(['scandens', 'arboreus', 'dendrophilus']);
      if (last === 'grazer') groups.push(['cursor', 'velox', 'pratensis', 'gregarius']);
      if (last === 'social') groups.push(['socialis', 'colonialis', 'gregarius']);
      if (last === 'walkfish') groups.push(['ambulans', 'reptans', 'amphibius']);
      if (last === 'giant' || dm > 0.8) groups.push(['gigas', 'ingens', 'maximus', 'titan', 'colossus', 'grandis']);
      if (dm < -0.5) groups.push(['minor', 'minimus', 'nanus', 'pusillus']);
      if (g.Topt < -2) groups.push(['glacialis', 'nivalis', 'polaris']);
      else if (g.Topt < 6) groups.push(['borealis', 'frigidus', 'hiemalis']);
      else if (g.Topt > 25) groups.push(['tropicus', 'aestivus', 'calidus']);
      if (g.arid > 0.75 && pg.arid <= 0.75) groups.push(['deserti', 'arenarius', 'xericus']);
      const habWords = [[], ['sylvaticus', 'nemoralis', 'silvestris'], ['campestris', 'pratensis', 'steppicus'], ['corallinus', 'recifalis'],
        ['litoralis', 'costalis'], ['pelagicus', 'oceanicus', 'abyssalis'], ['polaris', 'arcticus'], ['paludosus', 'palustris', 'rivalis']];
      if (g.hab !== pg.hab && habWords[g.hab].length) groups.push(habWords[g.hab]);
      if (env && env.montane) groups.push(['montanus', 'alpinus']);
      groups.push(FALLBACK);
      for (const grp of groups) {
        for (const e of this.shuffled(grp)) if (!this.used.has(genus + ' ' + e)) { this.used.add(genus + ' ' + e); return e; }
      }
      for (;;) {
        const e = (this.rng.pick(PLACE_A) + this.rng.pick(PLACE_B) + this.rng.pick(PLACE_C)).toLowerCase() + 'ensis';
        if (!this.used.has(genus + ' ' + e)) { this.used.add(genus + ' ' + e); return e; }
      }
    }

    shuffled(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = this.rng.int(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }

    common(sp, clade) {
      const adj = [];
      for (let i = sp.trans.length - 1; i >= 0 && adj.length < 2; i--) {
        const a = ADJ[sp.trans[i].k];
        if (a && !adj.includes(a)) adj.push(a);
      }
      if (adj.length < 2 && sp.g.troph >= 2.6 && clade.g.troph < 2.4 && !adj.includes('Hunting')) adj.push('Hunting');
      if (adj.length < 2) {
        const g = sp.g;
        let h = null;
        if (g.Topt < -2) h = 'Tundra';
        else if (g.arid > 0.75) h = 'Desert';
        else if (g.hab === 1 && g.Topt > 22) h = 'Jungle';
        else if (g.hab === 1) h = 'Forest';
        else if (g.hab === 2) h = 'Steppe';
        else if (g.hab === 3) h = 'Reef';
        else if (g.hab === 5) h = 'Ocean';
        else if (g.hab === 7) h = 'Marsh';
        if (h && !adj.includes(h) && !(clade.common.toLowerCase().includes(h.toLowerCase()))) adj.push(h);
      }
      if (adj.includes('Land')) { const i = adj.indexOf('Shore'); if (i >= 0) adj.splice(i, 1); }
      if (adj.includes('Sea')) { const i = adj.indexOf('Shore'); if (i >= 0) adj.splice(i, 1); }
      let noun = clade.noun;
      if (sp.g.realm === 0 && clade.key === 'squid') noun = 'squid';
      return (adj.reverse().join(' ') + ' ' + noun).trim().toLowerCase().replace(/^./, s => s.toUpperCase());
    }
  }

  SE.Namer = Namer;
  SE.NAMING = { PREFIX, ADJ };
})(globalThis.SE || (globalThis.SE = {}));
