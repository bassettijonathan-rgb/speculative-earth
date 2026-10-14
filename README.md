# Speculative Earth

The humans are gone. Start on today's Earth, push time forward a few million years at a time, and watch the continents drift, the climate swing and the survivors of the human age radiate into new forms. Tap any place on the map to see what lives there, open a species for its field-guide entry, and keep the ones you like in a bestiary you can share.

Plain JavaScript and Canvas, no dependencies and no backend. The simulation runs in a Web Worker; the whole game builds into one self-contained HTML file that works as a claude.ai Artifact and on a phone.

## Playing

- **Restart / New world.** The buttons under the title start the same world over from today, or grow a fresh random one. Once a world has history they ask for a second tap. The game reopens your last world when you come back.
- **Advance / Play / Fast-forward.** Pick a step of 1, 2, 5 or 10 million years (My). *Advance* moves one step, *Play* keeps stepping, *Fast-forward* runs 50 My at full speed.
- **Scrub back.** The slider runs over everything simulated so far. The strip above it is species diversity over time, with impacts and eruptions marked. While you are looking at the past, *Branch from here* rewinds the world to that moment so you can change it.
- **CO₂.** Sets atmospheric carbon dioxide from the current moment on (3 °C per doubling). It is part of the world: share codes carry it.
- **Map overlays.** Biomes, temperature, species richness and tectonic plates. Drag to pan, pinch or scroll to zoom.
- **Field guide.** Tap the map; the guide lists every species whose range covers that spot and its neighbours, by land, shore and sea. Each species has a drawn plate, measurements, and an entry written from the simulation's own record: ancestry, how it came to be, range, what eats it and what it eats, or how it died out.
- **Tree of life.** Every species that has ever lived in this world, one line each, time running left to right. Extinct lines are rust with a †. Tap a line to open the species; *Living lineages only* prunes dead ends.
- **Bestiary.** Saved species live in your browser. Each one has a share code like `SE1:willow-rift-42:57:1312`: seed, time in My, species id, plus any CO₂ changes. Paste it under *World* to regrow that world and open that animal.
- **Chronicle.** Every impact, flood basalt, ice age, rift, collision and first-of-its-kind evolutionary step, newest first. Tap one to jump there.

The same seed with the same CO₂ history always grows the same world, whatever step sizes you use.

## Building and testing

```sh
npm run build   # writes dist/index.html (web page) and dist/artifact.html (Artifact body)
npm test        # grows three worlds to 200 My and checks determinism
```

`npm test` (`test/run200.js`) prints a table per world every 10 My (living species, speciations, extinctions, plates, temperature anomaly, events), the "After Man" check at 50 My (flightless or predatory bats, land cephalopods, flightless birds, giant rodents) and timings. It fails on a crash, if living species ever drop below 25 (a wipeout) or rise above 1,500 (a runaway), or if the same seed, a restored checkpoint, or the same CO₂ history ever produces a different world. Typical results:

| world | speciations | extinctions | alive at 200 My | range over the run | 50 My |
|---|---|---|---|---|---|
| alpha | 1,534 | 1,287 | 283 | 70–342 | 1.4 s |
| beta | 1,724 | 1,421 | 339 | 76–368 | 1.3 s |
| gamma | 1,609 | 1,585 | 60 | 60–344 | 1.4 s |

(Node on a laptop-class CPU. A phone is roughly 3–4× slower, so 50 My takes about 5–6 s there.) Seed gamma ends in a deep ice age at 190–200 My that kills two-thirds of its species; that is the model working as intended.

## Layout

```
src/core/      the simulation (runs in the worker; the page also loads it for the grid, names and drawings)
  math.js        portable exp/log/sin/cos/atan2 so results match across browsers
  rng.js         seeded sfc32 generator with named forks
  sphere.js      icosphere grid (10,242 cells) and its 2,562-cell coarse grid
  landmask.js    today's coastlines, 1° run-length mask (Natural Earth 110m via world-atlas)
  earth.js       present-day plates, Euler poles, hotspots, mountain ranges
  tectonics.js   plate drift, collision, subduction, rifting, suturing, erosion
  climate.js     temperature, rainfall, sea level, biomes
  clades.js      the 36 starting clades and their body plans
  naming.js      genus and species names, common names
  life.js        species, ranges, competition, speciation, extinction, major transitions
  events.js      impacts, flood basalts, ice ages
  world.js       one world: ties it together, one million years per tick
  lore.js        field-guide entries
src/worker.js  simulation thread: history, checkpoints, queries
src/ui/        map, tree of life, creature drawings, the page
src/index.html page template; build.mjs inlines everything into it
test/          headless 200 My run
tools/         land-mask generator and a creature contact sheet
```

## What the model leaves out

It is a game, tuned to be plausible at a glance and fast on a phone. The big simplifications:

**Planet**
- The surface is 10,242 cells about 240 km apart. Anything smaller than that, such as most islands, rivers and lakes, is not there.
- Plates are rigid caps rotating about fixed Euler poles (seeded from today's NNR-NUVEL-1A poles), with random reorganisations every few tens of millions of years. There is no mantle convection, no slab pull, and plate speeds are not derived from forces.
- Collisions just stack crust and raise elevation; subduction sinks the older or denser plate and raises a volcanic arc; gaps fill with new ocean crust that deepens with age. Rifts split a continent along a random plane through its centre. Small plates welded together by long collisions merge.
- Elevation is a single number per cell. Erosion is diffusion. Isostasy, sediment and the continental shelf break are approximations.
- Climate is an annual-mean equilibrium recomputed each million years: temperature from latitude, height and ocean heat transport with warm and cold boundary currents; rainfall from moisture carried along prevailing wind belts with rain shadows and a monsoon term. There are no seasons, no ocean circulation model and no carbon cycle; CO₂ is whatever the player sets, plus brief spikes from flood basalts. Ice ages are scheduled events with an ice-albedo feedback, not orbital cycles.
- Sea level is set to keep the land fraction near today's, not ocean basin volume. It drops during ice ages and rises in warm times.
- Biomes are a Whittaker-style lookup on temperature and rainfall.

**Life**
- Life runs on the coarse grid (2,562 cells, about 480 km). A species is a set of occupied cells and a short genome: body mass, diet (trophic level), realm (land, shore, sea), locomotion, habitat, drought tolerance, sociality, and preferred temperature and tolerance. There are no population sizes, only presence.
- Each cell has a capacity per niche (realm × locomotion × diet × body-size band). When two species share a niche in a cell, the better-suited one wins. Predators need prey of the right size nearby; herbivores need plant productivity.
- Species spread to neighbouring cells they can tolerate (fliers further), and lose cells that stop suiting them.
- Speciation happens when a range splits into separate pieces (vicariance), when a population at the edge adapts to a different habitat or climate, or when a lineage makes a "major transition" where the ecology opens a door: losing flight where there are no ground predators, turning predator where hunters are missing, growing giant where large grazers are missing, going ashore or back to sea, burrowing, gliding, climbing, grazing in herds, colonial living, fish walking out of swamps. These transitions are hand-written rules with rates, which is why After Man–style outcomes appear on the scale of tens of millions of years rather than by gradual drift of every trait.
- Diversification slows as a world fills up (a soft cap of about 420 species), and extinction comes from losing all suitable cells, being outcompeted, or the kill zones of impacts and eruptions.
- Body plans are drawn from a small set of parameters per species, changed by the same transitions. Drawings are illustrations of the genome, not simulated anatomy.

## Reuse from evodevo

The [evodevo](https://github.com/bassettijonathan-rgb/evodevo) repository supplied three things:
- **Portable math** (`src/core/math.ts` there, `math.js` here): `exp`, `log`, `sin`, `cos`, `atan2` and friends written from basic arithmetic so the same seed gives bit-identical worlds on every browser.
- **The seeded RNG** (`rng.ts`): sfc32 with string seeds and named forks, so tectonics, events and life draw from independent streams and adding a draw in one does not shift the others.
- **The body-plan idea**: evodevo builds animals from Hox-like regions along a body axis, and homeotic changes swap what a region grows. Speculative Earth keeps that grammar in a much lighter form (`creature.js`): a tetrapod is head, neck, trunk and tail regions with limb types per girdle, and transitions swap limb identities (wing to walking limb, leg to flipper) rather than redrawing the animal. evodevo's full gene-regulatory-network simulation was too heavy to run for hundreds of species per million years on a phone, so it was not ported.

## Data

The present-day land mask comes from Natural Earth (public domain) via the `world-atlas` 110m TopoJSON, rasterised to 1° by `tools/make-landmask.js`. Plate motions are approximated from NNR-NUVEL-1A.
