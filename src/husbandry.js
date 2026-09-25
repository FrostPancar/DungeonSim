// ============================================================================
// ANIMAL HUSBANDRY
// Wild herds spawn from the local biome. Colonists tame, pasture, feed and
// breed them. Livestock produce renewable goods, pack beasts raise expedition
// haul capacity, and war beasts join the party in combat — reusing the same
// combat resolver as every NPC.
// ============================================================================
import { clamp, RNG } from './rng.js';
import { ATTRS, mod } from './data.js';
import { BIOMES } from './overworld.js';
import { occupyMove } from './occupancy.js';
import { huntStep, nearestHostile, ENGAGE } from './realtime.js';

// power/armor feed combat; pack raises expedition haul; forage is food/day.
export const ANIMALS = {
  fowl:      { name: 'Cragfowl',    glyph: 'v', color: '#d8b46a', hp: 9,   power: 1,  armor: 0, tameDC: 6,  forage: 0.35, matureDays: 4,  gestDays: 3,  litter: [2, 4],
               product: { res: 'food', amount: 3, days: 1.2, label: 'eggs' }, butcher: { food: 5, leather: 1 },
               biomes: ['grassland', 'hills', 'coast', 'forest', 'marsh', 'desert', 'taiga'], desc: 'Small, fast-breeding. Eggs every day or so.' },
  cavegoat:  { name: 'Cave Goat',   glyph: 'g', color: '#b9a87a', hp: 22,  power: 3,  armor: 1, tameDC: 9,  forage: 0.9,  matureDays: 8,  gestDays: 6,  litter: [1, 2],
               product: { res: 'food', amount: 7, days: 2, label: 'milk' }, butcher: { food: 16, leather: 5 },
               biomes: ['mountain', 'hills', 'highland', 'tundra', 'badlands'], desc: 'Eats almost anything. Milk in poor country.' },
  woolback:  { name: 'Woolback',    glyph: 'w', color: '#ded4c0', hp: 26,  power: 2,  armor: 1, tameDC: 8,  forage: 1.1,  matureDays: 9,  gestDays: 7,  litter: [1, 2],
               product: { res: 'cloth', amount: 6, days: 3.5, label: 'wool' }, butcher: { food: 18, leather: 6 },
               biomes: ['grassland', 'hills', 'taiga', 'highland'], desc: 'The hold’s cloth supply on four legs.' },
  boar:      { name: 'Tusk Boar',   glyph: 'b', color: '#8a6a4a', hp: 38,  power: 8,  armor: 2, tameDC: 14, forage: 1.3,  matureDays: 10, gestDays: 8,  litter: [2, 5],
               product: null, butcher: { food: 34, leather: 9 },
               biomes: ['forest', 'deepwood', 'marsh', 'taiga'], desc: 'Bad tempered, but the best meat per head.' },
  ox:        { name: 'Deep Ox',     glyph: 'O', color: '#9a8468', hp: 60,  power: 7,  armor: 3, tameDC: 12, forage: 2.0,  matureDays: 16, gestDays: 14, litter: [1, 1],
               product: { res: 'food', amount: 10, days: 2.5, label: 'milk' }, butcher: { food: 52, leather: 18 },
               pack: 3, biomes: ['grassland', 'hills', 'marsh', 'coast'], desc: 'Hauls three extra loads on a delve.' },
  packlizard:{ name: 'Pack Lizard', glyph: 'l', color: '#9ab06a', hp: 44,  power: 6,  armor: 4, tameDC: 13, forage: 0.7,  matureDays: 14, gestDays: 12, litter: [1, 2],
               product: null, butcher: { food: 26, leather: 14 },
               pack: 4, biomes: ['desert', 'badlands', 'ashland', 'highland'], desc: 'Barely eats. Carries more than an ox.' },
  warhound:  { name: 'War Hound',   glyph: 'd', color: '#a8886a', hp: 30,  power: 12, armor: 2, tameDC: 15, forage: 1.2,  matureDays: 9,  gestDays: 7,  litter: [2, 4],
               product: null, butcher: { food: 12, leather: 5 },
               war: true, biomes: ['grassland', 'forest', 'hills', 'taiga'], desc: 'Fights alongside the party.' },
  direwolf:  { name: 'Direwolf',    glyph: 'W', color: '#8a9aa8', hp: 52,  power: 20, armor: 3, tameDC: 19, forage: 1.8,  matureDays: 14, gestDays: 11, litter: [1, 3],
               product: null, butcher: { food: 22, leather: 12 },
               war: true, wildAggressive: true, biomes: ['deepwood', 'taiga', 'tundra', 'mountain'], desc: 'Very hard to tame. Worth it.' },
  chitinbug: { name: 'Chitin Beetle',glyph: 'c', color: '#9a7ab0', hp: 34,  power: 5,  armor: 6, tameDC: 11, forage: 0.5,  matureDays: 11, gestDays: 9,  litter: [1, 3],
               product: { res: 'leather', amount: 5, days: 3, label: 'shed chitin' }, butcher: { food: 8, leather: 20 },
               eatsFungus: true, biomes: ['deepwood', 'mountain', 'ashland', 'marsh'], desc: 'Eats fungus. Sheds usable chitin.' },
  duskmoth:  { name: 'Dusk Moth',   glyph: 'm', color: '#b07ae0', hp: 18,  power: 3,  armor: 1, tameDC: 16, forage: 0.4,  matureDays: 12, gestDays: 10, litter: [1, 2],
               product: { res: 'dust', amount: 3, days: 4, label: 'wing dust' }, butcher: { food: 4, leather: 2 },
               eatsFungus: true, biomes: ['ashland', 'deepwood', 'marsh', 'badlands', 'desert'], desc: 'A living, renewable source of arcane dust.' },
};
export const ANIMAL_IDS = Object.keys(ANIMALS);

// Livestock inherit a small trait set — the same idea as colonist traits.
export const BEAST_TRAITS = {
  hardy:    { name: 'Hardy',    mods: { hp: 0.25, forage: -0.15 } },
  fecund:   { name: 'Fecund',   mods: { breed: 0.4 } },
  rich:     { name: 'Rich',     mods: { product: 0.35 } },
  fierce:   { name: 'Fierce',   mods: { power: 0.4, tame: 4 } },
  docile:   { name: 'Docile',   mods: { tame: -4, power: -0.2 } },
  runt:     { name: 'Runt',     mods: { hp: -0.25, product: -0.25, forage: -0.2 } },
  prize:    { name: 'Prize',    mods: { hp: 0.2, product: 0.5, breed: 0.2 } },
  sickly:   { name: 'Sickly',   mods: { hp: -0.3, product: -0.3, breed: -0.3 } },
};
const TRAIT_POOL = Object.keys(BEAST_TRAITS);

let NEXT_BEAST = 1;
export function resetBeastIds(n = 1) { NEXT_BEAST = n; }
export function beastIdCounter() { return NEXT_BEAST; }

const BEAST_NAMES = ['Ash', 'Bell', 'Cinder', 'Dun', 'Ember', 'Flint', 'Grit', 'Hazel', 'Juniper', 'Kettle', 'Loam', 'Moss', 'Nettle', 'Onyx', 'Pebble', 'Quill', 'Rust', 'Slate', 'Thistle', 'Umber', 'Vetch', 'Willow'];

// --- stat lines ------------------------------------------------------------------
// Beasts carry a person's six attributes too, read the same way in a fight
// (see beastAsCombatant): Strength to hit and damage, Dexterity to act first and
// dodge, Constitution to health, Wisdom to keep its nerve. Each species has a
// build — offsets from an ordinary 10 — and each animal rolls a little either
// side of it. Young inherit the average of their parents.
export const ANIMAL_BUILDS = {
  fowl:       { str: -6, dex: 4,  con: -4, int: -8, wis: 2,  cha: -4 },
  cavegoat:   { str: 1,  dex: 3,  con: 2,  int: -7, wis: 2,  cha: -5 },
  woolback:   { str: 0,  dex: -1, con: 3,  int: -8, wis: 0,  cha: -4 },
  boar:       { str: 4,  dex: 0,  con: 4,  int: -8, wis: 0,  cha: -6 },
  ox:         { str: 6,  dex: -3, con: 6,  int: -8, wis: 0,  cha: -5 },
  packlizard: { str: 4,  dex: -2, con: 5,  int: -8, wis: 0,  cha: -6 },
  warhound:   { str: 3,  dex: 4,  con: 2,  int: -6, wis: 3,  cha: -2 },
  direwolf:   { str: 6,  dex: 4,  con: 4,  int: -5, wis: 3,  cha: -3 },
  chitinbug:  { str: 2,  dex: -2, con: 5,  int: -9, wis: -2, cha: -8 },
  duskmoth:   { str: -4, dex: 5,  con: -2, int: -6, wis: 3,  cha: 0 },
};

function rollBeastAttributes(r, species, parents) {
  const B = ANIMAL_BUILDS[species] || {};
  const a = {};
  for (const k of ATTRS) {
    const base = parents && parents[0].attributes && parents[1].attributes
      ? Math.round((parents[0].attributes[k] + parents[1].attributes[k]) / 2) + r.int(-1, 1)
      : 10 + (B[k] || 0) + r.int(-2, 2);
    a[k] = clamp(base, 1, 30);
  }
  return a;
}

/** A beast's attributes. A beast from an older save gets its species' build, rolled from its id. */
export function beastAttributes(b) {
  if (!b.attributes) b.attributes = rollBeastAttributes(new RNG('attrs:' + b.id), b.species, null);
  return b.attributes;
}

/** Full-grown health for this beast at its age: its species, traits and Constitution. */
function beastHpTarget(b) {
  const A = ANIMALS[b.species];
  return Math.max(3, Math.round(A.hp * (1 + beastMod(b, 'hp')) * (1 + 0.05 * mod(beastAttributes(b).con)) * clamp(b.age / A.matureDays, 0.4, 1)));
}

export function beastMod(beast, key) {
  let v = 0;
  for (const t of beast.traits) { const m = BEAST_TRAITS[t]?.mods?.[key]; if (m) v += m; }
  return v;
}

export function createBeast(rng, species, { tame = false, age = null, parents = null } = {}) {
  const A = ANIMALS[species];
  const traits = [];
  if (parents) {
    // Offspring inherit from both parents, with a chance to mutate.
    const pool = [...new Set([...parents[0].traits, ...parents[1].traits])];
    for (const t of pool) if (rng.chance(0.45)) traits.push(t);
    if (rng.chance(0.18)) { const t = rng.pick(TRAIT_POOL); if (!traits.includes(t)) traits.push(t); }
  } else if (rng.chance(0.55)) {
    traits.push(rng.pick(TRAIT_POOL));
    if (rng.chance(0.2)) { const t = rng.pick(TRAIT_POOL); if (!traits.includes(t)) traits.push(t); }
  }
  const beast = {
    id: 'b' + (NEXT_BEAST++),
    species, name: rng.pick(BEAST_NAMES),
    sex: rng.chance(0.5) ? 'f' : 'm',
    age: age != null ? age : (tame ? A.matureDays + rng.int(0, 6) : rng.int(0, A.matureDays * 2)),
    traits, tame,
    hp: 0, maxHp: 0,
    hunger: rng.float(0.5, 1),
    productTimer: rng.float(0, A.product ? A.product.days : 1),
    pregnant: 0, bonded: null,
    x: 0, y: 0, moveCd: 0, dead: false, away: false,
  };
  // Its own stream, so rolling stats never shifts the world's.
  beast.attributes = rollBeastAttributes(rng.fork('attrs:' + beast.id), species, parents);
  beast.maxHp = beastHpTarget(beast);
  beast.hp = beast.maxHp;
  return beast;
}

export function isMature(b) { return b.age >= ANIMALS[b.species].matureDays; }
export function beastPower(b) {
  const A = ANIMALS[b.species];
  return Math.round(A.power * (1 + beastMod(b, 'power')) * clamp(b.age / A.matureDays, 0.3, 1));
}
export function tameDC(b) { return ANIMALS[b.species].tameDC + beastMod(b, 'tame'); }

/**
 * A tamed war beast shaped like an NPC so simulateCombat can use it unchanged.
 * This is why livestock can meaningfully join an expedition.
 */
export function beastAsCombatant(b) {
  const A = ANIMALS[b.species];
  const pw = beastPower(b);
  const at = beastAttributes(b), str = mod(at.str), dex = mod(at.dex);
  return {
    id: b.id, beast: b,
    name: { short: b.name, full: `${b.name} the ${A.name}` },
    race: 'beast', klass: 'brute', level: Math.max(1, Math.round(b.age / 4)),
    hp: b.hp, maxHp: b.maxHp, traits: [], injuries: [], skills: {}, abilities: [],
    attributes: { ...at },
    equipment: { weapon: null, armor: null },
    hostility: 20, thoughts: [], relations: {}, xp: {}, passions: {},
    combat: {
      stat: 'melee', acc: 3 + Math.round(pw * 0.45) + str, dmg: [Math.max(1, Math.round(pw * 0.55)), Math.max(2, Math.round(pw * 1.25))],
      dmgBonus: Math.round(pw * 0.25) + str, armor: A.armor + Math.round(beastMod(b, 'hp') * 2),
      init: 3 + dex, mult: 1, leech: 0, role: 'front', flee: clamp(0.22 - mod(at.wis) * 0.03, 0.02, 0.5),
      row: 'front', range: 'melee', dmgType: 'slash', tags: ['beast'], res: {}, immune: [], resist: {}, poise: 0,
      def: Math.round((A.armor + Math.round(beastMod(b, 'hp') * 2)) * 0.7) + Math.floor(dex / 2),
    },
  };
}

// --- herd maintenance -------------------------------------------------------
export function biomeSpecies(biome) {
  return ANIMAL_IDS.filter(id => ANIMALS[id].biomes.includes(biome));
}

/** Spawn a wild herd appropriate to the surrounding region. */
export function spawnWildHerd(rng, biome, world, count = null) {
  const pool = biomeSpecies(biome);
  if (!pool.length) return [];
  const species = rng.pick(pool);
  const A = ANIMALS[species];
  const n = count ?? rng.int(2, A.war ? 3 : 5);
  const herd = [];
  // Find one open pocket and drop the herd around it.
  let cx = world.start.x, cy = world.start.y, found = false;
  for (let k = 0; k < 250 && !found; k++) {
    const x = rng.int(2, world.w - 3), y = rng.int(2, world.h - 3);
    if (!world.walkable(x, y)) continue;
    if (Math.hypot(x - world.start.x, y - world.start.y) < 9) continue;
    if (world.regionAt(x, y) !== world.regionAt(world.start.x, world.start.y)) continue;
    cx = x; cy = y; found = true;
  }
  if (!found) return [];
  for (let i = 0; i < n; i++) {
    const b = createBeast(rng, species, { tame: false });
    let placed = false;
    for (let k = 0; k < 40 && !placed; k++) {
      const x = clamp(cx + rng.int(-3, 3), 1, world.w - 2), y = clamp(cy + rng.int(-3, 3), 1, world.h - 2);
      if (world.walkable(x, y)) { b.x = x; b.y = y; placed = true; }
    }
    if (!placed) { b.x = cx; b.y = cy; }
    herd.push(b);
  }
  return herd;
}

export const BEAST_TICK = 30;          // beasts update on a slower cadence
const DAY = 1440;

/**
 * One husbandry step. Handles hunger, grazing, growth, products, breeding,
 * wandering and starvation. `ctx` supplies the colony hooks.
 */
export function tickBeasts(game) {
  if (game.tick % BEAST_TICK !== 0) return;
  const dt = BEAST_TICK / DAY;                 // fraction of a day elapsed
  const world = game.world;
  const rng = game.rng;
  const season = game.seasonIndex;
  const forageScale = (game.seasonDef ? game.seasonDef.forage : 1) * (BIOMES[game.biome] ? BIOMES[game.biome].forage : 0.8);
  const pastures = world.findBuildings('pasture');
  const troughs = world.findBuildings('trough');
  const pens = livePens(world);
  const headcount = new Map();
  for (const b of game.beasts) if (b.tame && !b.dead && b.pen != null) headcount.set(b.pen, (headcount.get(b.pen) || 0) + 1);

  for (let i = game.beasts.length - 1; i >= 0; i--) {
    const b = game.beasts[i];
    if (b.dead) { game.beasts.splice(i, 1); continue; }
    if (b.away) continue;
    const A = ANIMALS[b.species];
    b.age += dt;

    // Growth toward adult size.
    const target = beastHpTarget(b);
    if (target > b.maxHp) { b.maxHp = target; b.hp = Math.min(target, b.hp + (target - b.maxHp) + 1); }

    // Feeding. Wild animals forage freely; tame ones need pasture or a trough.
    const need = A.forage * (1 + beastMod(b, 'forage')) * dt * 0.5;
    if (!b.tame) {
      b.hunger = clamp(b.hunger + forageScale * dt * 0.6 - need, 0, 1);
    } else {
      let fed = false;
      const grazed = grazeAt(world, b.x, b.y, forageScale);
      // Below, there's no trough: what moss and fungus the floor grows, thin as it is.
      if (game._m && game._m.kind === 'floor') { b.hunger = clamp(b.hunger + Math.max(0.3, grazed) * dt * 0.8 - need, 0, 1); fed = true; }
      const penned = b.pen != null && pens.some(p => p.id === b.pen && penInside(p, b.x, b.y));
      if (!fed && grazed > 0.15 && (pastures.length || penned)) { b.hunger = clamp(b.hunger + grazed * dt * 0.8 - need, 0, 1); fed = true; }
      if (!fed || b.hunger < 0.55) {
        // Eat from the stores — fungus-eaters are cheap to keep.
        const src = A.eatsFungus ? 'food' : 'food';
        const cost = need * 6;
        if ((game.resources[src] || 0) >= cost && troughs.length) {
          game.resources[src] -= cost;
          b.hunger = clamp(b.hunger + need * 2.2, 0, 1);
        } else if (!fed) {
          b.hunger = clamp(b.hunger - need, 0, 1);
        }
      }
    }
    if (b.hunger <= 0) {
      b.hp -= A.hp * 0.02;
      if (b.hp <= 0) {
        b.dead = true;
        if (b.tame) game.log(`${b.name} the ${A.name} starved.`, 'warn');
        continue;
      }
    } else if (b.hp < b.maxHp && b.hunger > 0.5) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.01);

    // Products: only from fed, mature, tame stock.
    if (b.tame && A.product && isMature(b) && b.hunger > 0.4) {
      b.productTimer -= dt;
      if (b.productTimer <= 0) {
        b.productTimer = A.product.days;
        b.readyProduct = Math.max(1, Math.round(A.product.amount * (1 + beastMod(b, 'product')) * (1 + (game.bonuses.husbandry || 0))));
      }
    }

    // Breeding: two fed, mature, tame adults of opposite sex in the same pen.
    if (b.tame && b.pregnant > 0) {
      b.pregnant -= dt;
      if (b.pregnant <= 0) {
        b.pregnant = 0;
        const mate = game.beasts.find(o => o.id === b.bonded) || b;
        const n = rng.int(A.litter[0], A.litter[1]);
        for (let k = 0; k < n; k++) {
          const calf = createBeast(rng, b.species, { tame: true, age: 0, parents: [b, mate] });
          calf.x = b.x; calf.y = b.y;
          game.beasts.push(calf);
        }
        game.log(`${b.name} the ${A.name} birthed ${n}.`, 'good');
        b.bonded = null;
      }
    } else if (b.tame && b.sex === 'f' && isMature(b) && b.hunger > 0.6 && !b.pregnant) {
      const cap = herdCap(game);
      if (game.beasts.filter(x => x.tame && !x.dead).length < cap * 0.85 && rng.chance(0.02 * (1 + beastMod(b, 'breed')))) {
        const mate = game.beasts.find(o => o !== b && o.tame && !o.dead && o.species === b.species && o.sex === 'm' && isMature(o) && o.hunger > 0.5
          && Math.hypot(o.x - b.x, o.y - b.y) < 12);
        if (mate) { b.pregnant = A.gestDays; b.bonded = mate.id; }
      }
    }

    // Movement: tame stock drifts around its pasture, wild herds roam. A beast
    // at its handler's heel (or down) is moved by tickFollowers instead.
    if (b.heeling || b.downed) continue;
    b.moveCd -= 1;
    // Penned stock: walk home through the gate, then keep to the ground inside.
    const pen = b.tame && pens.length && (!game._m || game._m.kind === 'camp') ? penOf(world, b, pens, headcount) : null;
    if (pen && b.moveCd <= 0) {
      if (penInside(pen, b.x, b.y)) {
        b.moveCd = rng.int(2, 5);
        const ax = b.x + rng.int(-1, 1), ay = b.y + rng.int(-1, 1);
        if (penInside(pen, ax, ay) && world.walkable(ax, ay)) occupyMove(game, b, ax, ay);
      } else {
        // Beasts think every BEAST_TICK ticks, so a walk home takes a few strides at once.
        b.moveCd = 1;
        for (let k = 0; k < 4 && !penInside(pen, b.x, b.y); k++) {
          if (!huntStep(game, b, (pen.x0 + pen.x1) >> 1, (pen.y0 + pen.y1) >> 1, false)) { b.moveCd = 3; break; }
        }
      }
      continue;
    }
    if (pen) continue;
    if (b.moveCd <= 0) {
      b.moveCd = rng.int(2, 5);
      let ax = b.x, ay = b.y;
      if (b.tame && pastures.length) {
        const home = pastures.reduce((best, p) => {
          const d = Math.hypot(p.x - b.x, p.y - b.y);
          return d < best.d ? { p, d } : best;
        }, { p: pastures[0], d: Infinity });
        if (home.d > 5) { ax += Math.sign(home.p.x - b.x); ay += Math.sign(home.p.y - b.y); }
        else { ax += rng.int(-1, 1); ay += rng.int(-1, 1); }
      } else { ax += rng.int(-1, 1); ay += rng.int(-1, 1); }
      if (world.inside(ax, ay) && world.walkable(ax, ay)) occupyMove(game, b, ax, ay);
    }
  }
}

/** How much grazing a tile offers — moss and fungus feed stock, stone does not. */
export function grazeAt(world, x, y, scale) {
  if (!world.inside(x, y)) return 0;
  const i = world.idx(x, y);
  const t = world.terrain[i];
  let g = t === 2 ? 1 : t === 1 ? 0.45 : t === 3 ? 0.2 : 0.05;
  if (world.feature[i] === 'fungus') g += 0.6;
  return g * scale;
}

export function herdCap(game) {
  const posts = game.world.findBuildings('pasture').length;
  const barns = game.world.findBuildings('barn').length;
  let penRoom = 0;
  for (const p of livePens(game.world)) if (penReady(game.world, p)) penRoom += penCapacity(p);
  return posts * 4 + barns * 8 + penRoom;
}

// --- pens ---------------------------------------------------------------------
// A pen is a fenced rectangle the player drags out: fence round the edge and one
// gate. Its record lives on the world (`world.pens`), so it saves with the map.
// Tame stock with no one to follow is given a pen with room, walks in through
// the gate, and then wanders only inside it — the gate lets people and led
// beasts through, but loose stock never picks its way out.
export const PEN_MIN = 3, PEN_MAX = 24;

/** Is (x, y) inside pen `p`, not on its fence? */
export const penInside = (p, x, y) => x > p.x0 && x < p.x1 && y > p.y0 && y < p.y1;
/** How many head a pen holds: one per three tiles of ground inside, at least two. */
export function penCapacity(p) { return Math.max(2, Math.floor((p.x1 - p.x0 - 1) * (p.y1 - p.y0 - 1) / 3)); }

/**
 * The fence and gate for the rectangle (x0, y0)–(x1, y1), in either corner
 * order. The gate goes in the middle of the side nearest camp, or the next
 * nearest side if something's in the way. `canPlace(id, x, y)` is the world's.
 */
export function penLayout(world, x0, y0, x1, y1) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const w = bx - ax + 1, h = by - ay + 1;
  const out = { ok: false, x0: ax, y0: ay, x1: bx, y1: by, w, h, fence: [], gate: null, why: '' };
  if (w < PEN_MIN || h < PEN_MIN) { out.why = `A pen needs at least ${PEN_MIN}×${PEN_MIN} tiles.`; return out; }
  if (w > PEN_MAX || h > PEN_MAX) { out.why = `A pen can be at most ${PEN_MAX}×${PEN_MAX} tiles.`; return out; }
  const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
  const st = world.start || { x: mx, y: by + 5 };
  const sides = [[mx, by], [mx, ay], [ax, my], [bx, my]]
    .map(([x, y], k) => ({ x, y, k, d: Math.hypot(x - st.x, y - st.y) }))
    .sort((a, b) => a.d - b.d || a.k - b.k);
  const gate = sides.find(g => world.canPlace('pen_gate', g.x, g.y)) || sides[0];
  out.gate = [gate.x, gate.y];
  for (let x = ax; x <= bx; x++) for (const y of [ay, by]) if (!(x === gate.x && y === gate.y)) out.fence.push([x, y]);
  for (let y = ay + 1; y < by; y++) for (const x of [ax, bx]) if (!(x === gate.x && y === gate.y)) out.fence.push([x, y]);
  out.ok = true;
  return out;
}

/** The pens still standing: a pen whose gate is gone is forgotten. */
export function livePens(world) {
  const ps = world.pens;
  if (!ps || !ps.length) return [];
  const gone = (p) => { const b = world.buildingAt(p.gate[0], p.gate[1]); return !b || b.id !== 'pen_gate'; };
  if (ps.some(gone)) world.pens = ps.filter(p => !gone(p));
  return world.pens;
}
/** A pen can take stock once its gate is built. */
export function penReady(world, p) { const b = world.buildingAt(p.gate[0], p.gate[1]); return !!(b && b.done && b.id === 'pen_gate'); }

/** The pen a tame beast lives in: its own if it still stands, else the nearest with room. */
function penOf(world, b, pens, headcount) {
  let p = b.pen != null ? pens.find(q => q.id === b.pen) : null;
  if (p && penReady(world, p)) return p;
  if (p) headcount.set(p.id, (headcount.get(p.id) || 1) - 1);
  b.pen = null;
  let best = null, bd = Infinity;
  for (const q of pens) {
    if (!penReady(world, q) || (headcount.get(q.id) || 0) >= penCapacity(q)) continue;
    const d = Math.hypot((q.x0 + q.x1) / 2 - b.x, (q.y0 + q.y1) / 2 - b.y);
    if (d < bd) { bd = d; best = q; }
  }
  if (best) { b.pen = best.id; headcount.set(best.id, (headcount.get(best.id) || 0) + 1); }
  return best;
}

export function tameChance(colonist, beast) {
  const skill = colonist.skills.animals || 0;
  const wis = Math.floor((colonist.attributes.wis - 10) / 2);
  return clamp(0.10 + (skill * 0.8 + wis * 1.5 + 10 - tameDC(beast)) * 0.06, 0.03, 0.95);
}

export function butcherBeast(game, beast) {
  const A = ANIMALS[beast.species];
  const scale = clamp(beast.age / A.matureDays, 0.35, 1) * (1 + (game.bonuses.husbandry || 0));
  const out = {};
  for (const k in A.butcher) out[k] = Math.max(1, Math.round(A.butcher[k] * scale));
  beast.dead = true;
  return out;
}

export function packCapacity(beasts) {
  return beasts.reduce((s, b) => s + (ANIMALS[b.species].pack || 0), 0);
}

// --- beasts at a handler's heel --------------------------------------------
// A war or pack beast can be given a handler. While the handler is in the
// Rift (or on the way to the gate) the beast walks at their heel, takes the
// stairs when they do, fights beside them and carries for them. At home it
// goes back to the pasture. War beasts at home also turn out when something
// hostile comes near the camp.
//
// Any tame beast can also be told to follow someone (`b.follow`): it then keeps
// to their heel wherever they walk on its map, camp included, until told to
// stop. Only a war or pack beast whose handler it is follows them down the stairs.

/** Extra pack room a pack beast gives the handler it follows, per load. */
export const PACK_PER_LOAD = 25;
const HEEL = 2;                 // how close a follower keeps to its handler
const CROSS_WITH = 5;           // followers this close take the stairs together

/** Is this colonist somewhere their beasts should follow them? */
export function leading(c) {
  return !!c && !c.dead && ((c.mapId || 0) !== 0 || !!(c.order && c.order.travel));
}

/** The beasts that follow `c`, on whatever map they are. */
export function followersOf(game, c) {
  const out = [];
  for (const m of game.maps) for (const b of m.beasts) if (b.tame && !b.dead && (b.handler === c.id || b.follow === c.id)) out.push(b);
  return out;
}

/** Can this beast be told to follow someone around? Any tame one can. */
export function canHeel(b) { return !!(b && b.tame && !b.dead); }

/** Can this beast be given a handler at all? */
export function canFollow(b) {
  const A = ANIMALS[b.species];
  return !!(b && b.tame && (A.war || A.pack));
}

/** Move a beast from one map record onto another at (x, y). */
export function moveBeastTo(from, to, b, x, y) {
  const i = from.beasts.indexOf(b);
  if (i >= 0) from.beasts.splice(i, 1);
  to.beasts.push(b);
  b.x = x; b.y = y; b.path = null; b.pathGoal = null;
  from.occ = null; to.occ = null;
}

/** The stairs `dir` from map `from`, taken by a beast. Returns whether it went. */
function beastCrosses(root, b, from, dir, home) {
  let to, at;
  if (dir === 'down') {
    to = root.ensureFloor(from.kind === 'camp' ? 1 : from.depth + 1);
    at = to.world.stairsUp;
  } else {
    if (from.kind === 'camp') return false;
    // Nobody to follow: it finds its own way out, all the way up.
    to = home || from.depth === 1 ? root.maps[0] : root.ensureFloor(from.depth - 1);
    at = to.kind === 'camp' ? root.gateMouth() : (to.world.stairsDown || to.world.stairsUp);
  }
  if (!to || !at) return false;
  moveBeastTo(from, to, b, at.x, at.y);
  return true;
}

/** A handler took the stairs: the beasts close behind them come too. */
export function bringFollowers(root, npc, from, to, ox, oy, at) {
  for (const b of [...from.beasts]) {
    if (!b.tame || b.dead || b.downed || b.handler !== npc.id) continue;
    if (Math.max(Math.abs(b.x - ox), Math.abs(b.y - oy)) > CROSS_WITH) continue;
    moveBeastTo(from, to, b, at.x, at.y);
  }
}

const depthOf = (m) => (m && m.kind === 'floor' ? m.depth : 0);

/**
 * One tick of every tame beast with somewhere to be on the map in scope:
 * heeling, crossing, and — for war beasts — going for whatever's hostile.
 */
export function tickFollowers(v) {
  const m = v._m, root = v.root, tick = v.tick;
  for (const c of v.here) c.packBonus = 0;
  if (!v.beasts.length) return;
  const hostileNear = v.raiders.length > 0;
  for (const b of [...v.beasts]) {
    if (!b.tame || b.dead) continue;
    if (b.downed) {
      if (tick < b.downed.until) { b.heeling = true; continue; }
      b.downed = null;
    }
    const A = ANIMALS[b.species];
    let leader = null;
    const leadId = b.follow || b.handler;
    if (leadId) {
      leader = root.colonists.find(c => c.id === leadId) || null;
      if (!leader || leader.dead) {
        b.handler = null; b.follow = null; leader = null;
        root.log(`${b.name} the ${A.name} has lost the one it followed.`, 'warn');
      }
    }
    const lm = leader ? (leader.mapId || 0) : 0;
    // Told to follow: at their heel wherever they are on this map. A handler
    // alone: only once they're heading out.
    const follow = !!leader && lm === m.id && (b.follow === leader.id || leading(leader));
    // Somewhere else to be: its handler went on without it, or it's alone below.
    // Only a handler's beast takes the stairs after them.
    const crosses = !!leader && b.handler === leader.id;
    const astray = crosses ? lm !== m.id && (leading(leader) || m.kind === 'floor') : m.kind === 'floor';
    if (follow && A.pack) leader.packBonus = (leader.packBonus || 0) + A.pack * PACK_PER_LOAD;

    // What it's going for, if anything.
    let goal = null;
    if (A.war && isMature(b) && hostileNear && b.hp > b.maxHp * 0.3 && !(b.shaken > tick) && (follow || !astray)) {
      const h = nearestHostile(v, b.x, b.y, ENGAGE) || (follow ? nearestHostile(v, leader.x, leader.y, ENGAGE) : null);
      // Holding with its handler: it takes what comes, and chases nothing.
      if (h && !(follow && leader.hold)) goal = { x: h.x, y: h.y, fight: true };
    }
    if (!goal && astray) {
      const dir = leader && depthOf(root.mapById(lm)) > depthOf(m) ? 'down' : 'up';
      const s = root.stairsOn(m, dir);
      if (s) goal = { x: s.x, y: s.y, cross: dir };
    }
    if (!goal && follow && Math.max(Math.abs(b.x - leader.x), Math.abs(b.y - leader.y)) > HEEL) goal = { x: leader.x, y: leader.y };
    b.heeling = follow || astray || !!goal;
    if (!goal) continue;
    const d = Math.max(Math.abs(b.x - goal.x), Math.abs(b.y - goal.y));
    if (goal.cross && d <= 1) { beastCrosses(root, b, m, goal.cross, !leader); continue; }
    if (goal.fight && d <= 1) continue;   // in reach: the combat field does the biting
    b.heelCd = (b.heelCd || 0) - 1;
    if (b.heelCd > 0) continue;
    if (huntStep(v, b, goal.x, goal.y, true)) b.heelCd += 2.1 * v.world.moveCost(b.x, b.y);
    else b.heelCd = 3;   // blocked: wait a moment before planning again
  }
}
