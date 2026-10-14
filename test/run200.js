// Headless check: grow worlds for 200 million years and report how life fared.
//   node test/run200.js [seed ...]
// Fails (exit code 1) on a crash, a total wipeout, a runaway explosion of species,
// or if the same seed does not reproduce the same world.
const SE = require('./load.js');

const SEEDS = process.argv.slice(2).length ? process.argv.slice(2) : ['alpha', 'beta', 'gamma'];
const T = 200;
const MIN_ALIVE = 25, MAX_ALIVE = 1500;
let failed = false;
const fail = (msg) => { failed = true; console.log('FAIL ' + msg); };

function fingerprint(w) {
  // FNV-1a over the species record and the rounded height field.
  let h = 0x811c9dc5;
  const add = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
  for (const s of w.life.species) add(`${s.genus} ${s.epithet}|${s.born}|${s.died}|${s.g.mass.toFixed(6)};`);
  for (let i = 0; i < w.grid.n; i += 7) add(String(Math.round(w.tec.elev[i])));
  add(String(w.climate.seaLevel.toFixed(6)));
  return h.toString(16).padStart(8, '0');
}

function afterMan(w, t) {
  const sp = w.life.species.filter(s => s.born <= t);
  const bat = sp.filter(s => SE.CLADES[s.clade].group === 'bat' && s.g.loco !== 1 && s.g.troph >= 2.4);
  const ceph = sp.filter(s => SE.CLADES[s.clade].group === 'cephalopod' && s.g.realm === 0);
  const bird = sp.filter(s => SE.CLADES[s.clade].group === 'bird' && s.g.loco !== 1);
  const giantRodent = sp.filter(s => SE.CLADES[s.clade].group === 'rodent' && s.g.mass > 1.3);
  return { bat, ceph, bird, giantRodent };
}

for (const seed of SEEDS) {
  console.log(`\nWorld "${seed}"`);
  console.log('   My  alive  +spec  -ext  plates    dT  events');
  const w = new SE.World(seed);
  const t0 = Date.now();
  let t50 = 0, prevS = 0, prevE = 0, minAlive = 1e9, maxAlive = 0, events = {}, window = [];
  let snapshot50 = null;
  try {
    for (let t = 1; t <= T; t++) {
      const cards = w.step();
      for (const c of cards) { events[c.kind] = (events[c.kind] || 0) + 1; if (c.kind !== 'evo') window.push(c.kind[0]); }
      const a = w.life.alive.length;
      minAlive = Math.min(minAlive, a); maxAlive = Math.max(maxAlive, a);
      if (t === 50) { t50 = Date.now() - t0; snapshot50 = afterMan(w, 50); }
      if (t % 10 === 0) {
        const s = w.stats();
        console.log(`${String(t).padStart(5)} ${String(a).padStart(6)} ${String(s.speciations - prevS).padStart(6)} ${String(s.extinctions - prevE).padStart(5)} ${String(s.plates).padStart(7)} ${s.dT.toFixed(1).padStart(5)}  ${window.join('')}`);
        prevS = s.speciations; prevE = s.extinctions; window = [];
      }
    }
  } catch (e) {
    fail(`"${seed}" crashed at ${w.t} My: ${e.stack}`);
    continue;
  }
  const s = w.stats(), ms = Date.now() - t0;
  console.log(`   total: ${s.speciations} speciations, ${s.extinctions} extinctions, ${s.alive} species alive at 200 My (range ${minAlive}–${maxAlive})`);
  console.log(`   events: ${Object.entries(events).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`   time: 50 My in ${(t50 / 1000).toFixed(2)} s, 200 My in ${(ms / 1000).toFixed(2)} s`);
  const am = snapshot50;
  const show = (arr) => arr.slice(0, 2).map(x => `${x.genus} ${x.epithet} (${x.common})`).join(', ') || 'none';
  console.log(`   by 50 My: ${am.bat.length} flightless/predatory bats [${show(am.bat)}]; ${am.ceph.length} land cephalopods [${show(am.ceph)}]; ${am.bird.length} flightless birds; ${am.giantRodent.length} rodents over 20 kg`);
  const groupsAlive = new Set(w.life.alive.map(id => SE.CLADES[w.life.species[id].clade].group));
  console.log(`   groups still alive at 200 My: ${groupsAlive.size} of ${new Set(SE.CLADES.map(c => c.group)).size}`);
  if (minAlive < MIN_ALIVE) fail(`"${seed}" fell to ${minAlive} species (wipeout threshold ${MIN_ALIVE})`);
  if (maxAlive > MAX_ALIVE) fail(`"${seed}" reached ${maxAlive} species (explosion threshold ${MAX_ALIVE})`);
  if (s.speciations < 200) fail(`"${seed}" only had ${s.speciations} speciations`);
  if (s.extinctions < 100) fail(`"${seed}" only had ${s.extinctions} extinctions`);
}

// Determinism: same seed, same world; a different seed, a different world; and a
// world restored from a checkpoint carries on exactly as if it never stopped.
console.log('\nDeterminism');
const grow = (seed, t, co2) => { const w = new SE.World(seed, co2); for (let i = 0; i < t; i++) w.step(); return w; };
const a = fingerprint(grow('alpha', 60)), b = fingerprint(grow('alpha', 60)), c = fingerprint(grow('beta', 60));
console.log(`   alpha ${a}, alpha again ${b}, beta ${c}`);
if (a !== b) fail('same seed produced different worlds');
if (a === c) fail('different seeds produced the same world');
// The worker keeps checkpoints exactly like this: serialize() and carry on.
const w1 = new SE.World('alpha');
for (let i = 0; i < 25; i++) w1.step();
const cp = w1.serialize();
for (let i = 0; i < 35; i++) w1.step();
const w2 = new SE.World('alpha');
w2.restore(structuredClone(cp));
for (let i = 0; i < 35; i++) w2.step();
const r = fingerprint(w2);
console.log(`   restored from 25 My checkpoint and run to 60 My: ${r}`);
if (r !== a) fail('restoring a checkpoint changed the outcome');
const co2a = fingerprint(grow('alpha', 40, [[0, 280], [10, 1120]])), co2b = fingerprint(grow('alpha', 40, [[0, 280], [10, 1120]]));
console.log(`   alpha with CO2 raised to 1120 ppm at 10 My: ${co2a} (repeat ${co2b})`);
if (co2a !== co2b) fail('same seed and CO2 history produced different worlds');

console.log(failed ? '\nFAILED' : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
