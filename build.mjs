// Builds one self-contained page. The simulation core is inlined once: the page
// runs it (for the grid, names and drawings) and the worker is started from a
// Blob made of the same text plus the worker loop.
//   dist/index.html     a normal web page (open it from disk or any static host)
//   dist/artifact.html  the same page without <html>/<head>/<body>, for claude.ai Artifacts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
export const CORE = ['math', 'rng', 'sphere', 'landmask', 'earth', 'tectonics', 'climate', 'clades', 'naming', 'life', 'events', 'world', 'lore'];
const UI = ['creature', 'map', 'tree', 'app'];

const core = CORE.map(f => read(`src/core/${f}.js`)).join('\n');
const worker = read('src/worker.js');
const ui = UI.map(f => read(`src/ui/${f}.js`)).join('\n');
for (const [name, text] of [['core', core], ['worker', worker], ['ui', ui]]) {
  if (/<\/script/i.test(text)) throw new Error(`${name} contains </script>`);
}
const body = read('src/index.html')
  .replace('/*@CORE@*/', () => core)
  .replace('/*@WORKER@*/', () => worker)
  .replace('/*@UI@*/', () => ui);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/artifact.html'), body);
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
writeFileSync(join(root, 'dist/index.html'), full);
console.log(`dist/index.html ${(full.length / 1024).toFixed(0)} KB`);
