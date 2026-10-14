/*
 * The 36 starting lineages: real clades that are widespread, fast-breeding or
 * tough enough to be plausible survivors of the human age.
 *
 * Ecological genome (g):
 *   mass   log10 kg            troph  0 plant, 1 herbivore, 1.5 omnivore, 2 small predator, 3 apex
 *   realm  0 land, 1 shore (amphibious), 2 sea
 *   loco   0 walk, 1 fly, 2 climb, 3 burrow, 4 swim, 5 sessile, 6 glide
 *   hab    0 any, 1 forest, 2 open country, 3 reef, 4 shelf/coast, 5 open ocean, 6 polar, 7 wetland
 *   arid   0..1 drought tolerance       social 0..1 solitary..eusocial
 *   Topt/Ttol are set from each clade's starting range at t = 0.
 *
 * Body plan (bp) follows the evo-devo idea of regional identity along the body
 * axis: a tetrapod has a head, a fore zone and a hind zone, and each zone's
 * appendage type (leg, feathered wing, membrane wing, flipper, arm...) is one
 * switch. Evolution flips those switches (homeotic change) and tunes
 * proportions, so a bat's wing zone can revert to walking limbs.
 */
(function (SE) {
  'use strict';
  const T = (o) => Object.assign({ arch: 'tetra', cover: 0, len: 1, girth: 0.42, neck: 0.12, head: 0.32, snout: 0.45, beak: 0, ears: 0.25, earUp: 1, tail: 0.6, tailW: 0.1, leg: 0.4,
    fore: 'leg', hind: 'leg', posture: 0, horn: 0, crest: 0, teeth: 0, fluke: 0, patag: 0, claws: 0, eye: 0.5, hue: 30, sat: 25, lit: 40, pattern: 0, phue: 30 }, o);

  const CLADES = [
    { key: 'rat', genus: 'Rattus', sp: 'norvegicus', common: 'brown rat', noun: 'rat', stem: 'mys', group: 'rodent',
      g: { mass: -0.5, troph: 1.5, realm: 0, loco: 0, hab: 0, arid: 0.35, social: 0.4 }, home: ['NA', 'SA', 'EU', 'AF', 'AS', 'AU'],
      bp: T({ len: 1, girth: 0.38, head: 0.3, snout: 0.6, ears: 0.22, tail: 1.1, tailW: 0.05, leg: 0.22, hue: 28, sat: 20, lit: 38 }) },
    { key: 'squirrel', genus: 'Sciurus', sp: 'vulgaris', common: 'red squirrel', noun: 'squirrel', stem: 'sciurus', group: 'rodent',
      g: { mass: -0.5, troph: 1.2, realm: 0, loco: 2, hab: 1, arid: 0.2, social: 0.1 }, home: ['EU', 'AS', 'NA'],
      bp: T({ len: 0.9, girth: 0.4, head: 0.32, snout: 0.35, ears: 0.3, tail: 1.0, tailW: 0.35, leg: 0.28, hue: 18, sat: 55, lit: 42 }) },
    { key: 'hare', genus: 'Lepus', sp: 'europaeus', common: 'brown hare', noun: 'hare', stem: 'lagus', group: 'lagomorph',
      g: { mass: 0.55, troph: 1.0, realm: 0, loco: 0, hab: 2, arid: 0.5, social: 0.1 }, home: ['EU', 'AF', 'AS', 'NA'],
      bp: T({ len: 1, girth: 0.45, head: 0.3, snout: 0.35, ears: 0.75, tail: 0.1, tailW: 0.1, leg: 0.42, hind: 'hop', hue: 32, sat: 30, lit: 45 }) },
    { key: 'bat', genus: 'Myotis', sp: 'myotis', common: 'mouse-eared bat', noun: 'bat', stem: 'nycteris', group: 'bat',
      g: { mass: -1.5, troph: 2.0, realm: 0, loco: 1, hab: 0, arid: 0.3, social: 0.6 }, home: ['NA', 'SA', 'EU', 'AF', 'AS', 'AU'],
      bp: T({ len: 0.8, girth: 0.45, head: 0.32, snout: 0.35, ears: 0.55, tail: 0.4, tailW: 0.04, leg: 0.2, fore: 'mwing', posture: 0.4, teeth: 0.3, hue: 25, sat: 18, lit: 28 }) },
    { key: 'flyingfox', genus: 'Pteropus', sp: 'vampyrus', common: 'flying fox', noun: 'fruit bat', stem: 'pteropus', group: 'bat',
      g: { mass: 0.0, troph: 1.1, realm: 0, loco: 1, hab: 1, arid: 0.1, social: 0.7 }, home: ['AS', 'AU'],
      bp: T({ len: 0.9, girth: 0.45, head: 0.36, snout: 0.55, ears: 0.3, tail: 0, leg: 0.22, fore: 'mwing', posture: 0.4, hue: 20, sat: 45, lit: 30 }) },
    { key: 'fox', genus: 'Vulpes', sp: 'vulpes', common: 'red fox', noun: 'fox', stem: 'alopex', group: 'carnivoran',
      g: { mass: 0.8, troph: 2.4, realm: 0, loco: 0, hab: 0, arid: 0.4, social: 0.2 }, home: ['NA', 'EU', 'AS', 'AF', 'AU'],
      bp: T({ len: 1.1, girth: 0.36, head: 0.34, snout: 0.7, ears: 0.45, tail: 0.8, tailW: 0.25, leg: 0.42, teeth: 0.3, hue: 20, sat: 70, lit: 45 }) },
    { key: 'cat', genus: 'Felis', sp: 'silvestris', common: 'wildcat', noun: 'cat', stem: 'ailurus', group: 'carnivoran',
      g: { mass: 0.7, troph: 2.8, realm: 0, loco: 0, hab: 0, arid: 0.5, social: 0.1 }, home: ['EU', 'AF', 'AS'],
      bp: T({ len: 1.1, girth: 0.38, head: 0.32, snout: 0.3, ears: 0.3, tail: 0.85, tailW: 0.12, leg: 0.4, teeth: 0.45, claws: 0.4, pattern: 1, hue: 35, sat: 20, lit: 45, phue: 30 }) },
    { key: 'boar', genus: 'Sus', sp: 'scrofa', common: 'wild boar', noun: 'boar', stem: 'choerus', group: 'ungulate',
      g: { mass: 1.9, troph: 1.5, realm: 0, loco: 0, hab: 1, arid: 0.3, social: 0.5 }, home: ['EU', 'AS', 'AF'],
      bp: T({ len: 1.1, girth: 0.58, head: 0.42, snout: 0.6, ears: 0.2, tail: 0.15, leg: 0.32, teeth: 0.35, hue: 25, sat: 18, lit: 25 }) },
    { key: 'ibex', genus: 'Capra', sp: 'ibex', common: 'ibex', noun: 'goat', stem: 'capra', group: 'ungulate',
      g: { mass: 1.9, troph: 1.0, realm: 0, loco: 0, hab: 2, arid: 0.6, social: 0.6 }, home: ['EU', 'AS'],
      bp: T({ len: 1.05, girth: 0.5, neck: 0.2, head: 0.3, snout: 0.5, ears: 0.2, tail: 0.1, leg: 0.5, horn: 0.8, hue: 30, sat: 22, lit: 48 }) },
    { key: 'stoat', genus: 'Mustela', sp: 'erminea', common: 'stoat', noun: 'weasel', stem: 'galea', group: 'carnivoran',
      g: { mass: -0.7, troph: 2.8, realm: 0, loco: 0, hab: 0, arid: 0.2, social: 0.0 }, home: ['NA', 'EU', 'AS'],
      bp: T({ len: 1.4, girth: 0.24, head: 0.26, snout: 0.45, ears: 0.15, tail: 0.6, tailW: 0.08, leg: 0.18, teeth: 0.35, hue: 28, sat: 45, lit: 40 }) },
    { key: 'seal', genus: 'Phoca', sp: 'vitulina', common: 'harbour seal', noun: 'seal', stem: 'phoca', group: 'carnivoran',
      g: { mass: 1.95, troph: 2.8, realm: 1, loco: 4, hab: 4, arid: 0, social: 0.5 }, home: ['AT', 'PA', 'AR'],
      bp: T({ len: 1.3, girth: 0.42, head: 0.3, snout: 0.35, ears: 0, tail: 0.2, leg: 0.12, fore: 'flipper', hind: 'flipper', cover: 3, hue: 210, sat: 8, lit: 45, pattern: 2, phue: 210 }) },
    { key: 'opossum', genus: 'Didelphis', sp: 'virginiana', common: 'Virginia opossum', noun: 'opossum', stem: 'didelphis', group: 'marsupial',
      g: { mass: 0.5, troph: 1.6, realm: 0, loco: 2, hab: 0, arid: 0.3, social: 0.0 }, home: ['NA', 'SA'],
      bp: T({ len: 1, girth: 0.42, head: 0.32, snout: 0.7, ears: 0.25, tail: 0.95, tailW: 0.05, leg: 0.25, hue: 40, sat: 5, lit: 60 }) },
    { key: 'roo', genus: 'Macropus', sp: 'rufus', common: 'red kangaroo', noun: 'kangaroo', stem: 'macropus', group: 'marsupial',
      g: { mass: 1.7, troph: 1.0, realm: 0, loco: 0, hab: 2, arid: 0.8, social: 0.5 }, home: ['AU'],
      bp: T({ len: 1, girth: 0.48, neck: 0.15, head: 0.26, snout: 0.5, ears: 0.4, tail: 1.0, tailW: 0.2, leg: 0.55, hind: 'hop', fore: 'arm', posture: 0.8, hue: 15, sat: 45, lit: 45 }) },
    { key: 'raven', genus: 'Corvus', sp: 'corax', common: 'common raven', noun: 'raven', stem: 'corax', group: 'bird',
      g: { mass: 0.1, troph: 1.8, realm: 0, loco: 1, hab: 0, arid: 0.5, social: 0.4 }, home: ['NA', 'EU', 'AS', 'AF'],
      bp: T({ cover: 1, len: 0.8, girth: 0.45, neck: 0.12, head: 0.3, snout: 0.55, beak: 1, ears: 0, tail: 0.6, tailW: 0.2, leg: 0.32, fore: 'wing', posture: 1, hue: 240, sat: 10, lit: 12 }) },
    { key: 'pigeon', genus: 'Columba', sp: 'livia', common: 'rock dove', noun: 'pigeon', stem: 'peristera', group: 'bird',
      g: { mass: -0.45, troph: 1.1, realm: 0, loco: 1, hab: 0, arid: 0.5, social: 0.6 }, home: ['NA', 'SA', 'EU', 'AF', 'AS', 'AU'],
      bp: T({ cover: 1, len: 0.8, girth: 0.5, neck: 0.1, head: 0.26, snout: 0.25, beak: 1, ears: 0, tail: 0.5, tailW: 0.2, leg: 0.22, fore: 'wing', posture: 1, hue: 220, sat: 12, lit: 55 }) },
    { key: 'sparrow', genus: 'Passer', sp: 'domesticus', common: 'house sparrow', noun: 'sparrow', stem: 'passer', group: 'bird',
      g: { mass: -1.5, troph: 1.3, realm: 0, loco: 1, hab: 0, arid: 0.5, social: 0.6 }, home: ['NA', 'SA', 'EU', 'AF', 'AS', 'AU'],
      bp: T({ cover: 1, len: 0.7, girth: 0.5, neck: 0.08, head: 0.3, snout: 0.25, beak: 1, ears: 0, tail: 0.5, tailW: 0.15, leg: 0.22, fore: 'wing', posture: 1, hue: 28, sat: 35, lit: 40, pattern: 1, phue: 20 }) },
    { key: 'gull', genus: 'Larus', sp: 'argentatus', common: 'herring gull', noun: 'gull', stem: 'larus', group: 'bird',
      g: { mass: 0.0, troph: 2.2, realm: 1, loco: 1, hab: 4, arid: 0.4, social: 0.6 }, home: ['AT', 'PA', 'IN', 'AR'],
      bp: T({ cover: 1, len: 0.85, girth: 0.45, neck: 0.12, head: 0.28, snout: 0.5, beak: 1, ears: 0, tail: 0.4, tailW: 0.2, leg: 0.25, fore: 'wing', posture: 1, hue: 210, sat: 5, lit: 85 }) },
    { key: 'duck', genus: 'Anas', sp: 'platyrhynchos', common: 'mallard', noun: 'duck', stem: 'anas', group: 'bird',
      g: { mass: 0.05, troph: 1.3, realm: 0, loco: 1, hab: 7, arid: 0.1, social: 0.6 }, home: ['NA', 'EU', 'AS', 'AF'],
      bp: T({ cover: 1, len: 0.9, girth: 0.5, neck: 0.18, head: 0.26, snout: 0.5, beak: 1, ears: 0, tail: 0.3, tailW: 0.15, leg: 0.15, fore: 'wing', posture: 0.6, hue: 30, sat: 30, lit: 40, crest: 0 }) },
    { key: 'parrot', genus: 'Psittacus', sp: 'erithacus', common: 'grey parrot', noun: 'parrot', stem: 'psittacus', group: 'bird',
      g: { mass: -0.4, troph: 1.1, realm: 0, loco: 1, hab: 1, arid: 0.1, social: 0.6 }, home: ['AF', 'SA', 'AU'],
      bp: T({ cover: 1, len: 0.8, girth: 0.5, neck: 0.08, head: 0.34, snout: 0.35, beak: 1, ears: 0, tail: 0.6, tailW: 0.15, leg: 0.22, fore: 'wing', posture: 1, hue: 200, sat: 8, lit: 55, phue: 0 }) },
    { key: 'monitor', genus: 'Varanus', sp: 'varius', common: 'lace monitor', noun: 'monitor lizard', stem: 'varanus', group: 'reptile',
      g: { mass: 0.85, troph: 2.6, realm: 0, loco: 0, hab: 0, arid: 0.6, social: 0.0 }, home: ['AU', 'AS', 'AF'],
      bp: T({ cover: 2, len: 1.3, girth: 0.28, neck: 0.15, head: 0.26, snout: 0.6, ears: 0, tail: 1.3, tailW: 0.12, leg: 0.18, teeth: 0.2, claws: 0.4, hue: 70, sat: 15, lit: 30, pattern: 2, phue: 50 }) },
    { key: 'croc', genus: 'Crocodylus', sp: 'niloticus', common: 'Nile crocodile', noun: 'crocodile', stem: 'suchus', group: 'reptile',
      g: { mass: 2.5, troph: 3.0, realm: 1, loco: 4, hab: 7, arid: 0.2, social: 0.2 }, home: ['AF', 'AS', 'AU', 'SA'],
      bp: T({ cover: 2, len: 1.4, girth: 0.28, neck: 0.1, head: 0.3, snout: 0.9, ears: 0, tail: 1.2, tailW: 0.18, leg: 0.14, teeth: 0.6, hue: 80, sat: 20, lit: 28 }) },
    { key: 'frog', genus: 'Rana', sp: 'temporaria', common: 'common frog', noun: 'frog', stem: 'batrachus', group: 'amphibian',
      g: { mass: -1.6, troph: 2.0, realm: 0, loco: 0, hab: 7, arid: 0.0, social: 0.0 }, home: ['EU', 'AS', 'NA'],
      bp: T({ cover: 3, len: 0.75, girth: 0.5, neck: 0, head: 0.38, snout: 0.3, ears: 0, tail: 0, leg: 0.35, hind: 'hop', eye: 0.8, hue: 85, sat: 35, lit: 38, pattern: 2, phue: 60 }) },
    { key: 'turtle', genus: 'Chelonia', sp: 'mydas', common: 'green turtle', noun: 'turtle', stem: 'chelys', group: 'reptile',
      g: { mass: 2.2, troph: 1.2, realm: 2, loco: 4, hab: 4, arid: 0, social: 0.0 }, home: ['AT', 'PA', 'IN'],
      bp: T({ cover: 2, len: 1, girth: 0.4, neck: 0.12, head: 0.22, snout: 0.3, beak: 1, ears: 0, tail: 0.1, leg: 0.2, fore: 'flipper', hind: 'flipper', shell: 1, hue: 90, sat: 25, lit: 30 }) },
    { key: 'cod', genus: 'Gadus', sp: 'morhua', common: 'Atlantic cod', noun: 'cod', stem: 'gadus', group: 'fish',
      g: { mass: 1.0, troph: 2.4, realm: 2, loco: 4, hab: 4, arid: 0, social: 0.6 }, home: ['AT', 'AR'],
      bp: { arch: 'fish', len: 1, girth: 0.28, tailFork: 0.3, dorsal: 0.5, shark: 0, lobe: 0, barbel: 1, hue: 50, sat: 25, lit: 45, pattern: 2, phue: 40 } },
    { key: 'shark', genus: 'Carcharhinus', sp: 'leucas', common: 'bull shark', noun: 'shark', stem: 'carcharias', group: 'fish',
      g: { mass: 2.1, troph: 3.2, realm: 2, loco: 4, hab: 0, arid: 0, social: 0.0 }, home: ['AT', 'PA', 'IN'],
      bp: { arch: 'fish', len: 1.2, girth: 0.25, tailFork: 0.6, dorsal: 0.8, shark: 1, lobe: 0, barbel: 0, hue: 210, sat: 12, lit: 45, pattern: 0, phue: 0 } },
    { key: 'octopus', genus: 'Octopus', sp: 'vulgaris', common: 'common octopus', noun: 'octopus', stem: 'polypus', group: 'cephalopod',
      g: { mass: 0.5, troph: 2.6, realm: 2, loco: 4, hab: 4, arid: 0, social: 0.0 }, home: ['AT', 'PA', 'IN'],
      bp: { arch: 'ceph', mantle: 1, mw: 0.7, arms: 8, armLen: 1.2, armW: 0.12, fins: 0, upright: 0, eye: 0.6, hue: 15, sat: 45, lit: 45, pattern: 2, phue: 10 } },
    { key: 'squid', genus: 'Loligo', sp: 'vulgaris', common: 'European squid', noun: 'squid', stem: 'teuthis', group: 'cephalopod',
      g: { mass: -0.3, troph: 2.6, realm: 2, loco: 4, hab: 5, arid: 0, social: 0.5 }, home: ['AT', 'IN', 'PA'],
      bp: { arch: 'ceph', mantle: 1.6, mw: 0.35, arms: 10, armLen: 0.6, armW: 0.06, fins: 1, upright: 0, eye: 0.7, hue: 330, sat: 30, lit: 70, pattern: 2, phue: 0 } },
    { key: 'krill', genus: 'Euphausia', sp: 'superba', common: 'Antarctic krill', noun: 'krill', stem: 'euphausia', group: 'crustacean',
      g: { mass: -2.7, troph: 1.1, realm: 2, loco: 4, hab: 5, arid: 0, social: 0.9 }, home: ['SO', 'PA', 'AT'],
      bp: { arch: 'arthro', segs: 6, legs: 5, wings: 0, elytra: 0, antenna: 0.8, mandible: 0.1, len: 1, girth: 0.25, swim: 1, hue: 10, sat: 60, lit: 60 } },
    { key: 'coral', genus: 'Acropora', sp: 'cervicornis', common: 'staghorn coral', noun: 'coral', stem: 'acropora', group: 'cnidarian',
      g: { mass: 0, troph: 0.5, realm: 2, loco: 5, hab: 3, arid: 0, social: 1 }, home: ['AT', 'PA', 'IN'],
      bp: { arch: 'coral', branch: 0.6, height: 1, hue: 35, sat: 40, lit: 65 } },
    { key: 'ant', genus: 'Formica', sp: 'rufa', common: 'red wood ant', noun: 'ant', stem: 'myrmex', group: 'insect',
      g: { mass: -5, troph: 1.6, realm: 0, loco: 0, hab: 1, arid: 0.4, social: 1 }, home: ['EU', 'AS', 'NA'],
      bp: { arch: 'arthro', segs: 3, legs: 3, wings: 0, elytra: 0, antenna: 0.8, mandible: 0.5, len: 1, girth: 0.3, swim: 0, waist: 1, hue: 10, sat: 55, lit: 30 } },
    { key: 'roach', genus: 'Periplaneta', sp: 'americana', common: 'American cockroach', noun: 'cockroach', stem: 'blatta', group: 'insect',
      g: { mass: -3, troph: 1.5, realm: 0, loco: 0, hab: 0, arid: 0.5, social: 0.3 }, home: ['NA', 'SA', 'AF', 'AS', 'AU'],
      bp: { arch: 'arthro', segs: 6, legs: 3, wings: 2, elytra: 1, antenna: 1.3, mandible: 0.2, len: 1, girth: 0.4, swim: 0, waist: 0, hue: 22, sat: 50, lit: 28 } },
    { key: 'bee', genus: 'Apis', sp: 'mellifera', common: 'honey bee', noun: 'bee', stem: 'apis', group: 'insect',
      g: { mass: -4, troph: 1.0, realm: 0, loco: 1, hab: 0, arid: 0.4, social: 1 }, home: ['EU', 'AF', 'AS', 'NA', 'SA', 'AU'],
      bp: { arch: 'arthro', segs: 5, legs: 3, wings: 2, elytra: 0, antenna: 0.5, mandible: 0.2, len: 1, girth: 0.45, swim: 0, waist: 1, stripes: 1, hue: 42, sat: 75, lit: 45 } },
    { key: 'grass', genus: 'Poa', sp: 'pratensis', common: 'meadow grass', noun: 'grass', stem: 'poa', group: 'plant',
      g: { mass: -2, troph: 0, realm: 0, loco: 5, hab: 2, arid: 0.5, social: 1 }, home: ['NA', 'SA', 'EU', 'AF', 'AS', 'AU'],
      bp: { arch: 'plant', kind: 'grass', height: 0.4, crown: 0.6, leafHue: 85, succulent: 0 } },
    { key: 'oak', genus: 'Quercus', sp: 'robur', common: 'English oak', noun: 'oak', stem: 'quercus', group: 'plant',
      g: { mass: 3.5, troph: 0, realm: 0, loco: 5, hab: 1, arid: 0.2, social: 1 }, home: ['EU', 'AS', 'NA'],
      bp: { arch: 'plant', kind: 'broad', height: 1, crown: 0.9, leafHue: 100, succulent: 0 } },
    { key: 'fig', genus: 'Ficus', sp: 'benghalensis', common: 'banyan', noun: 'fig', stem: 'ficus', group: 'plant',
      g: { mass: 3.8, troph: 0, realm: 0, loco: 5, hab: 1, arid: 0.1, social: 1 }, home: ['AS', 'AF', 'AU', 'SA'],
      bp: { arch: 'plant', kind: 'fig', height: 1, crown: 1.2, leafHue: 120, succulent: 0 } },
    { key: 'pine', genus: 'Pinus', sp: 'sylvestris', common: 'Scots pine', noun: 'pine', stem: 'pinus', group: 'plant',
      g: { mass: 3.3, troph: 0, realm: 0, loco: 5, hab: 1, arid: 0.4, social: 1 }, home: ['EU', 'AS', 'NA'],
      bp: { arch: 'plant', kind: 'conifer', height: 1.2, crown: 0.5, leafHue: 140, succulent: 0 } },
  ];

  SE.CLADES = CLADES;
})(globalThis.SE || (globalThis.SE = {}));
