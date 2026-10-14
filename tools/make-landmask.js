const topo = require(process.argv[2] + '/topojson-client-3.1.0/package/dist/topojson-client.js');
const land = require(process.argv[2] + '/world-atlas-2.0.2/package/land-110m.json');
const gj = topo.feature(land, land.objects.land);
const polys = [];
for (const f of gj.features) { const g = f.geometry; const ps = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (const p of ps) { const xs = p[0].map(c => c[0]), ys = p[0].map(c => c[1]); if (Math.max(...xs) - Math.min(...xs) > 300 && Math.max(...ys) - Math.min(...ys) < 10) continue; polys.push(p); } } // small islands that wrap the antimeridian (Fiji) break the ray test; drop them
// Edges that jump across the antimeridian are skipped in the ray test.
function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (Math.abs(xi - xj) < 180 && (yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
function isLand(lon, lat) { for (const p of polys) { if (inRing(lon, lat, p[0])) { let hole = false; for (let k = 1; k < p.length; k++) if (inRing(lon, lat, p[k])) hole = true; if (!hole) return true; } } return false; }
const W = 360, H = 180; let bits = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const lat = 90 - (y + 0.5) * 180 / H, lon = -180 + (x + 0.5) * 360 / W; bits.push(isLand(lon, lat) ? 1 : 0); }
// RLE: alternating run lengths starting with water, encoded base-36 runs separated... use compact: each run as char codes in base 90
let runs = [], cur = 0, n = 0; for (const b of bits) { if (b === cur) n++; else { runs.push(n); cur = b; n = 1; } } runs.push(n);
const enc = runs.map(r => r.toString(36)).join(',');
console.log('runs', runs.length, 'len', enc.length, 'land frac', bits.reduce((a, b) => a + b) / bits.length);
require('fs').writeFileSync(process.argv[3] /* writes the run-length string; paste into src/core/landmask.js */, enc);
let s=''; for (let y=0;y<H;y+=4){ let row=''; for(let x=0;x<W;x+=2) row+=bits[y*W+x]?'#':'.'; s+=row+'\n'} console.log(s);
