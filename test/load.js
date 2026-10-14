// Loads the simulation core into Node (the same files the browser and worker run).
const path = require('path');
const ORDER = ['math', 'rng', 'sphere', 'landmask', 'earth', 'tectonics', 'climate', 'clades', 'naming', 'life', 'events', 'world', 'lore'];
for (const f of ORDER) {
  try { require(path.join(__dirname, '..', 'src', 'core', f + '.js')); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
}
module.exports = globalThis.SE;
