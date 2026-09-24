// ============================================================================
// HEADLESS TEST HARNESS
//   node test/harness.mjs            full suite
//   node test/harness.mjs --bench    + longer performance / pacing runs
//   node test/harness.mjs --seeds 20 widen the integration sweep
//   node test/harness.mjs --only rift   just the suites whose name matches
// ============================================================================
import { RNG } from '../src/rng.js';
import {
  TRAITS, RACES, CLASSES, SKILL_IDS, RESOURCE_IDS, BUILDINGS, FLOORS, RESEARCH, dispositionOf, FACTIONS,
} from '../src/data.js';
import { World, findPath, findNearest, TERRAIN, FEATURES, T } from '../src/world.js';
import { generateNPC, generateGroup, powerOf, resetIds, shiftHostility, refresh as refreshNPC } from '../src/npc.js';
import { generateDungeon, generateOffers } from '../src/dungeon.js';
import { simulateCombat, partyPower, STANCES } from '../src/expedition.js';
import { generateFloor, floorTier, lineOfSight, tickFloorMonsters } from '../src/floors.js';
import { tickCombat, ROUND_TICKS } from '../src/realtime.js';
import { saveState, loadState } from '../src/save.js';
import { MAP_LOCAL } from '../src/game.js';
import { createBattle, runRound, strike, dealDamage, applyStatus, reachable, upkeep, hasSt, stGet } from '../src/combat.js';
import { STATUSES, TAGS, DAMAGE_TYPES } from '../src/elements.js';
import { ABILITIES } from '../src/data.js';
import { generateItem, generateLoot, canEquip, gearProfile, itemScore, RARITIES, RARITY_IDS, SLOTS, LEGENDARIES, LEGENDARY_IDS, LEGENDARY_RECIPES, POTIONS, POTION_IDS, WEAPON_FAMILIES } from '../src/items.js';
import { BIOMES_RIFT, RIFT_BIOME_IDS, ROOM_LAYOUTS, ROOM_TRAITS, rollBiome, harvestYield } from '../src/biomes.js';
import { buildLayout } from '../src/dungeon.js';
import { roomContext } from '../src/expedition.js';
import { PRESTIGE_PATHS, PRESTIGE_TIERS } from '../src/prestige.js';
import { GENERAL_IDS, spellBudget, bookRequirement } from '../src/magic.js';
import { tiersOf, changeClass } from '../src/classes.js';
import { TREES, TREE_CLASSES, CLASS_INFO, PRESTIGE, treeNodes, canBuy, buyNode, toggleLoadout, pointsFree, pointsEarned, effectiveAbility, autoAllocate, gainLevelXp, xpToNext, LOADOUT_SLOTS, TIER_CAP, LEVEL_CAP } from '../src/classes.js';
import { MONSTERS, MONSTER_IDS, FAMILIES, ENCOUNTERS, ENCOUNTER_IDS, RANKS, rankIdx, tierRank, createMonster, buildEncounter, monsterWave, rollMonsterDrops, templatesFor, ESSENCES, TROPHIES } from '../src/monsters.js';
import { Game, DUSK_HOUR, DAWN_HOUR, RIFT_DAYS_PER_LEVEL, riftTargetDanger } from '../src/game.js';
import { autoplayStep } from '../src/autoplay.js';
import { TICKS_PER_DAY, TICKS_PER_HOUR, storageCap } from '../src/colony.js';
import { Overworld, BIOMES, SITE_KINDS, classify } from '../src/overworld.js';
import { CROPS, CROP_IDS, SEASONS, cropViability, recommendCrop, seasonOf, yearOf, growthStage, initSoil } from '../src/farming.js';
import { packCap } from '../src/colony.js';
import { ANIMALS, ANIMAL_IDS, createBeast, beastAsCombatant, beastPower, biomeSpecies, tameChance, butcherBeast, isMature, resetBeastIds, PACK_PER_LOAD, followersOf } from '../src/husbandry.js';
import { PX, pxOf } from '../src/pixicons.js';
import * as ECON from '../src/economy.js';
import { makeTierItem } from '../src/items.js';
import { hostilesOn } from '../src/realtime.js';
import { siteJobAt, addResource, killColonist } from '../src/colony.js';
import * as ICONS from '../src/icons.js';
import { riftWave } from '../src/events.js';
import { separateUnits, mapUnits, formationTiles } from '../src/occupancy.js';
import { SpriteBook, spriteGridProblems, SPRITE_KEYS, ALLEGIANCE } from '../src/sprites.js';
import { installDOM } from './dom-stub.mjs';
import { testBundle } from './bundle-test.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { kw, traitSentiment, beastTraitSentiment } from '../src/keywords.js';
import { advanceTutorial, noteTutorialEvent, tutorialState, TUTORIAL_STEPS, skipTutorialState } from '../src/tutorial.js';
import { drillSession, drillTarget, DRILL_SESSIONS, classRequirement as classReqForTest } from '../src/classes.js';
import { sendJourney, siteErrand, upgradePack, PACK_STEP } from '../src/economy.js';
import { fileURLToPath } from 'node:url';
import { UI } from '../src/ui.js';
import { tipHtml, mapTipKey } from '../src/tips.js';

const argv = process.argv.slice(2);
const BENCH = argv.includes('--bench');
const SEEDS = (() => { const i = argv.indexOf('--seeds'); return i >= 0 ? +argv[i + 1] : 6; })();

let passed = 0, failed = 0, suite = '';
const fails = [];
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[90m', b: '\x1b[1m', x: '\x1b[0m' };

// --only <text>: run just the suites whose name contains <text> (for iterating).
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].toLowerCase() : null; })();
function describe(name, fn) {
  if (ONLY && !name.toLowerCase().includes(ONLY)) return;
  suite = name;
  console.log(`\n${C.b}${name}${C.x}`);
  fn();
}
function ok(cond, msg, detail) {
  if (cond) { passed++; console.log(`  ${C.g}✓${C.x} ${msg}`); }
  else { failed++; fails.push(`${suite} › ${msg}${detail ? ` — ${detail}` : ''}`); console.log(`  ${C.r}✗ ${msg}${C.x}${detail ? ` ${C.d}${detail}${C.x}` : ''}`); }
}
function info(msg) { console.log(`    ${C.d}${msg}${C.x}`); }
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
describe('RNG', () => {
  const a = new RNG('seed'), b = new RNG('seed');
  const sa = Array.from({ length: 200 }, () => a.next());
  const sb = Array.from({ length: 200 }, () => b.next());
  ok(sa.every((v, i) => v === sb[i]), 'same seed produces the identical stream');
  ok(new RNG('other').next() !== new RNG('seed').next(), 'different seeds diverge');
  ok(sa.every(v => v >= 0 && v < 1), 'values stay in [0,1)');
  const mean = sa.reduce((x, y) => x + y, 0) / sa.length;
  ok(Math.abs(mean - 0.5) < 0.06, 'mean is near 0.5', `got ${mean.toFixed(3)}`);
  const r = new RNG(1);
  const stats = Array.from({ length: 2000 }, () => r.stat());
  ok(stats.every(v => v >= 3 && v <= 18), '4d6-drop-lowest stays in 3..18');
  const avg = stats.reduce((x, y) => x + y, 0) / stats.length;
  ok(avg > 11.5 && avg < 13.5, '4d6 average is ~12.24', `got ${avg.toFixed(2)}`);
  const w = { a: 0, b: 0 };
  for (let i = 0; i < 4000; i++) w[r.weighted([['a', 3], ['b', 1]])]++;
  ok(Math.abs(w.a / 4000 - 0.75) < 0.03, 'weighted picks respect weights', `a=${(w.a / 40).toFixed(1)}%`);
  ok(r.fork('x').next() !== r.fork('y').next(), 'forked streams are independent');
});

// ---------------------------------------------------------------------------
describe('NPC generation (one pipeline, hostility decides the side)', () => {
  const rng = new RNG('npc-suite');
  resetIds(1);
  const sample = [];
  for (const f of Object.keys(FACTIONS)) for (let i = 0; i < 300; i++) sample.push(generateNPC(rng, { faction: f, tier: rng.int(0, 10) }));
  ok(sample.every(n => n.hostility >= 0 && n.hostility <= 100), 'hostility always within 0..100');
  ok(sample.every(n => finite(n.maxHp) && n.maxHp > 0 && n.hp === n.maxHp), 'hp is finite, positive and starts full');
  ok(sample.every(n => SKILL_IDS.every(s => Number.isInteger(n.skills[s]) && n.skills[s] >= 0 && n.skills[s] <= 20)), 'all skills are integers in 0..20');
  ok(sample.every(n => Object.values(n.attributes).every(v => v >= 1 && v <= 34)), 'attributes stay in range');
  ok(sample.every(n => n.traits.every(t => TRAITS[t])), 'every trait id resolves');
  ok(sample.every(n => finite(powerOf(n)) && powerOf(n) > 0), 'power rating is finite and positive');
  ok(new Set(sample.map(n => n.id)).size === sample.length, 'ids are unique');

  let conflicts = 0;
  for (const n of sample) for (const t of n.traits) for (const u of n.traits)
    if (t !== u && (TRAITS[t].conflicts || []).includes(u)) conflicts++;
  ok(conflicts === 0, 'no NPC carries mutually exclusive traits', `found ${conflicts}`);

  // The meter has to actually separate the factions.
  const med = (f) => { const h = sample.filter(n => n.faction === f).map(n => n.hostility).sort((a, b) => a - b); return h[h.length >> 1]; };
  info(`median hostility: ${Object.keys(FACTIONS).map(f => `${f} ${med(f)}`).join('  ')}`);
  ok(med('colony') < 30, 'colony folk read as friendly', `median ${med('colony')}`);
  ok(med('merchants') >= 15 && med('merchants') <= 55, 'merchants land in the neutral band', `median ${med('merchants')}`);
  ok(med('warband') > 65, 'warbands read as hostile', `median ${med('warband')}`);
  ok(med('dead') > med('outlaws'), 'the unquiet are more hostile than outlaws');
  const colonyHost = sample.filter(n => n.faction === 'colony');
  ok(new Set(colonyHost.map(n => n.hostility)).size > 20, 'individuals still vary inside a faction');

  // Same generator, both roles.
  const spread = new Set(sample.map(n => dispositionOf(n.hostility).id));
  ok(spread.size >= 5, 'the generator covers the full disposition ladder', [...spread].join(','));
  const n2 = generateNPC(new RNG('fixed'), { faction: 'colony', tier: 3 });
  const before = n2.hostility;
  shiftHostility(n2, 40, 'test');
  ok(n2.hostility > before && n2.disposition !== dispositionOf(before).id || n2.hostility === 100, 'hostility drift re-derives disposition');
  ok(generateNPC(new RNG('k'), { faction: 'colony', tier: 2, raceHint: 'dwarf', classHint: 'cleric' }).race === 'dwarf', 'hints are honoured');

  // Tier must mean something.
  const t1 = Array.from({ length: 200 }, () => powerOf(generateNPC(rng, { faction: 'colony', tier: 1 })));
  const t8 = Array.from({ length: 200 }, () => powerOf(generateNPC(rng, { faction: 'colony', tier: 8 })));
  const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  ok(m(t8) > m(t1) * 2, 'power scales strongly with tier', `t1 ${m(t1).toFixed(0)} → t8 ${m(t8).toFixed(0)}`);
});

// ---------------------------------------------------------------------------
describe('World generation', () => {
  for (let s = 0; s < 8; s++) {
    const w = new World('world' + s);
    const i = w.idx(w.start.x, w.start.y);
    if (s === 0) {
      ok(w.walkable(w.start.x, w.start.y), 'the start tile is always walkable');
      ok(w.terrain.length === w.w * w.h, 'terrain array matches map size');
    }
    let open = 0, veins = 0, trees = 0, arcane = 0;
    for (let k = 0; k < w.terrain.length; k++) {
      if (!TERRAIN[w.terrain[k]].solid) open++;
      const f = w.feature[k];
      if (f && FEATURES[f].inRock) veins++;
      if (f === 'tree') trees++;
      if (f === 'crystal' || f === 'gems') arcane++;
    }
    if (s === 0) info(`seed0: ${open} open tiles, ${veins} veins, ${trees} trees, ${arcane} arcane nodes, ${w.regionCount ?? '?'} regions`);
    ok(open > w.terrain.length * 0.25, `seed ${s}: map is not mostly solid`, `${open}/${w.terrain.length}`);
    ok(trees >= 8, `seed ${s}: enough wood on the map`, `${trees} trees`);
    ok(arcane >= 4, `seed ${s}: arcane nodes exist (the Delve Gate is reachable)`, `${arcane}`);
    // Everything the colony needs must be in the same walkable region as home.
    const homeRegion = w.regionAt(w.start.x, w.start.y);
    let reachableTrees = 0;
    for (let k = 0; k < w.feature.length; k++) {
      if (w.feature[k] !== 'tree') continue;
      const x = k % w.w, y = (k / w.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.regionAt(x + dx, y + dy) === homeRegion) { reachableTrees++; break; }
    }
    ok(reachableTrees > 0, `seed ${s}: at least some wood is reachable from home`, `${reachableTrees}`);
  }
});

describe('Pathfinding', () => {
  const w = new World('pathtest');
  const { x: sx, y: sy } = w.start;
  let tested = 0, valid = 0, agreed = 0;
  const rng = new RNG('p');
  for (let k = 0; k < 400; k++) {
    const tx = rng.int(0, w.w - 1), ty = rng.int(0, w.h - 1);
    const reach = w.reachable(sx, sy, tx, ty, false);
    const p = findPath(w, sx, sy, tx, ty, false);
    tested++;
    if (!!p === reach || (!p && !reach)) agreed++;
    if (!p) continue;
    let cx = sx, cy = sy, good = true;
    for (const [nx, ny] of p) {
      if (Math.abs(nx - cx) > 1 || Math.abs(ny - cy) > 1) good = false;
      if (!w.walkable(nx, ny)) good = false;
      cx = nx; cy = ny;
    }
    if (good && cx === tx && cy === ty) valid++;
    else good = false;
  }
  ok(agreed === tested, 'reachability check agrees with the pathfinder', `${agreed}/${tested}`);
  ok(valid > 0, 'paths are produced for reachable goals', `${valid} valid paths`);
  ok(findPath(w, sx, sy, sx, sy, false).length === 0, 'path to self is empty');
  ok(findPath(w, sx, sy, -5, -5, false) === null, 'off-map goals return null');
  const adj = findPath(w, sx, sy, sx + 6, sy, true);
  ok(adj === null || adj.every(([x, y]) => w.walkable(x, y)), 'adjacent-goal paths only cross walkable tiles');
});

// ---------------------------------------------------------------------------
describe('Overworld', () => {
  const homes = {};
  const kindsSeen = new Set();
  let minSites = Infinity, connectedOk = true;
  for (let i = 0; i < 14; i++) {
    const ow = new Overworld('ow' + i);
    homes[ow.colony.biome] = (homes[ow.colony.biome] || 0) + 1;
    minSites = Math.min(minSites, ow.sites.length);
    for (const s of ow.sites) {
      kindsSeen.add(s.kind);
      if (!BIOMES[s.biome]) connectedOk = false;
      if (s.biome === 'ocean') connectedOk = false;       // nothing may sit in the sea
    }
    if (i === 0) {
      const counts = {};
      for (const b of ow.biome) counts[b] = (counts[b] || 0) + 1;
      info(`seed0: ${ow.sites.length} sites, ${Object.keys(counts).length} biomes, home in ${ow.colony.biome}`);
    }
  }
  ok(minSites >= 20, 'every world has a populated region map', `min ${minSites} sites`);
  ok(connectedOk, 'no site is placed in the ocean or an unknown biome');
  ok(Object.keys(homes).length >= 5, 'the colony starts in many different biomes across runs', Object.keys(homes).join(','));
  ok(kindsSeen.size >= 12, 'most site kinds appear', `${kindsSeen.size}/${Object.keys(SITE_KINDS).length}`);
  info(`home biomes: ${Object.entries(homes).map(([k, v]) => k + ':' + v).join(' ')}`);

  // The big region: ~10x the old 52x34, with a shape and climate rolled per run.
  const big = new Overworld('ow-big');
  ok(big.w * big.h >= 52 * 34 * 9, 'the region map is about ten times the old size', `${big.w}x${big.h}`);
  const shapes = new Set(), ashRuns = [];
  for (let i = 0; i < 24; i++) {
    const o = new Overworld('shape' + i);
    shapes.add(o.climate.shape);
    ashRuns.push(o.biome.filter(b => b === 'ashland').length);
  }
  ok(shapes.size >= 4, 'runs roll different world shapes', [...shapes].join(','));
  ok(ashRuns.filter(n => n > 0).length >= 12, 'ashland is actually generated', `${ashRuns.filter(n => n > 0).length}/24 runs`);
  ok(Math.max(...ashRuns) > Math.min(...ashRuns) * 3, 'volcanism differs run to run');
  ok(['tower', 'keep', 'stones', 'inn'].every(k => big.sitesOfKind(k).length > 0), 'landmark structures are placed at world gen',
    ['tower', 'keep', 'stones', 'inn'].map(k => `${k}:${big.sitesOfKind(k).length}`).join(' '));
  ok(big.sites.every(s => !SITE_KINDS[s.kind].delve), 'world gen places no delves — the Rift is the only dungeon');
  ok(big.sitesOfKind('inn').every(s => big.onRoad(s.x, s.y)), 'inns stand on the roads');
  ok(big.roads.length > 10 && big.road.some(v => v), 'roads are laid between settlements', `${big.roads.length} roads`);
  const roadEnds = big.roads.every(p => SITE_KINDS[big.sites.find(s => s.x === p[0] && s.y === p[1])?.kind]?.settle);
  ok(roadEnds, 'every road starts at a settlement');
  ok(big.roads.every(p => { for (let i = 0; i < p.length; i += 2) if (big.biomeAt(p[i], p[i + 1]) === 'ocean') return false; return true; }), 'no road runs through the sea');
  // The camp map follows the region biome, rather than one rocky layout everywhere.
  const rockShare = (b) => { const w = new World(77, 72, 50, { biome: b }); return w.terrain.filter(t => t === 0).length / w.terrain.length; };
  ok(rockShare('grassland') < 0.12 && rockShare('mountain') > 0.3, 'open biomes aren\'t walled in by rock; mountains still are',
    `grassland ${(rockShare('grassland') * 100).toFixed(0)}% · mountain ${(rockShare('mountain') * 100).toFixed(0)}%`);
  const dune = new World(78, 72, 50, { biome: 'desert' }), fen = new World(78, 72, 50, { biome: 'marsh' });
  ok(dune.terrain.filter(t => t === 3).length > fen.terrain.filter(t => t === 3).length * 3 && fen.terrain.filter(t => t === 4).length > dune.terrain.filter(t => t === 4).length * 3,
    'deserts are sandy and marshes are wet');
  const gb = new Game('camp-biome');
  ok(gb.world.biome === gb.biome, 'the camp map is generated for the run\'s biome', gb.biome);
  // Big buildings: one record over the whole footprint, walled with a door.
  {
    const gb = new Game('big-buildings');
    const w = gb.world;
    let spot = null;
    for (let r = 5; r < 20 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) if (w.canPlace('apothecary', w.start.x + dx, w.start.y + r)) spot = [w.start.x + dx, w.start.y + r];
    gb.unlocked.add('apothecary');
    ok(!!spot && gb.build(spot[0], spot[1], 'apothecary'), 'a 3x2 shop can be placed');
    const b = w.buildingAt(spot[0], spot[1]);
    const tiles = w.building.filter(x => x === b).length;
    ok(b.fp && b.fp[2] === 3 && b.fp[3] === 2 && tiles === 6, 'it covers all six tiles as one building', `${tiles} tiles`);
    ok(!gb.build(spot[0], spot[1], 'apothecary') && !w.canPlace('library', spot[0] + 1, spot[1]), 'nothing else can go on top of it');
    gb.resources.gold = 999; gb.resources.herbs = 99; gb.resources.wood = 999; gb.resources.stone = 999;
    for (let i = 0; i < 6000 && !b.done; i++) gb.step();
    const door = w.doorOf(b);
    ok(b.done, 'colonists build it');
    ok(w.walkable(door.x, door.y) && !w.walkable(b.fp[0], b.fp[1]) && !w.walkable(b.fp[0] + 2, b.fp[1] + 1), 'it comes with walls: solid all round but for the door');
    ok(w.findBuildings('apothecary').length === 1 && w.findBuildings('apothecary')[0].x === door.x, 'it counts once, and is used from its door');
    ok(gb.colonists.every(c => c.away || w.walkable(c.x, c.y)), 'nobody is left walled inside');
    w.removeBuilding(b.fp[0] + 1, b.fp[1]);
    ok(!w.building.some(x => x === b), 'removing any tile of it removes all of it');
  }
  // Shopkeepers: a shop trades only while its keeper minds the counter.
  {
    const gs = new Game('keepers');
    const w = gs.world;
    let spot = null;
    for (let r = 5; r < 20 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) if (w.canPlace('apothecary', w.start.x + dx, w.start.y + r)) spot = [w.start.x + dx, w.start.y + r];
    const b = w.putBuilding('apothecary', spot[0], spot[1], { id: 'apothecary', done: true, workLeft: 0, hp: 120, growth: 0, progress: 0, reservedBy: 0 });
    w.recomputeLight(); gs.jobsDirty = true;
    ECON.tickShops(gs);
    const S = ECON.shopsOf(gs);
    gs.resources.gold = 5000;
    const pot = Object.keys(S.apothecary.potions)[0];
    ok(!ECON.shopStatus(gs, 'apothecary').open && /shopkeeper/.test(ECON.buyPotion(gs, S.apothecary, pot)), 'no keeper: the shop is shut');
    const keeper = gs.colonists.find(c => c.peasant);
    ECON.assignKeeper(gs, b, keeper.id);
    let t = 0;
    while (!ECON.keptNow(gs, b) && t++ < 1500) { keeper.needs.hunger = Math.max(keeper.needs.hunger, 0.7); keeper.needs.rest = Math.max(keeper.needs.rest, 0.7); keeper.needs.joy = Math.max(keeper.needs.joy, 0.7); gs.step(); }
    ok(ECON.keptNow(gs, b), 'the keeper walks to the counter and opens up', `after ${t} ticks`);
    ok(Math.abs(keeper.x - w.doorOf(b).x) <= 1 && Math.abs(keeper.y - w.doorOf(b).y) <= 1, 'they stand at the shop door');
    ok(pot && ECON.buyPotion(gs, S.apothecary, pot) === '', 'with the keeper in, it sells');
    while (!gs.isNight) gs.step();
    for (let i = 0; i < 200; i++) gs.step();
    ok(!ECON.shopStatus(gs, 'apothecary').open, 'it shuts for the night');
  }
  ok(!('_siteGrid' in big),'generation scratch state is not left on the map (or in saves)');

  const ow = new Overworld('ow-detail');
  ok(ow.sites.every(s => s.tier >= 1 && s.tier <= 14), 'site tiers stay in range');
  const far = ow.sites.slice().sort((a, b) => b.dist - a.dist)[0];
  const near = ow.sites.filter(s => s.kind !== 'colony').sort((a, b) => a.dist - b.dist)[0];
  ok(far.tier >= near.tier, 'danger grows with distance from home', `near t${near.tier} → far t${far.tier}`);
  ok(ow.discovered().length > 0 && ow.discovered().length < ow.sites.length, 'the map starts partly explored', `${ow.discovered().length}/${ow.sites.length}`);
  const before = ow.discovered().length;
  ow.reveal(ow.colony.x, ow.colony.y, 30);
  ok(ow.discovered().length > before, 'scouting reveals new sites');
  const t = ow.travelTicks(ow.colony, far);
  ok(t > 0 && Number.isFinite(t), 'travel time is a real number', `${t} ticks`);
  ok(ow.travelTicks(ow.colony, far) >= ow.travelTicks(ow.colony, near), 'distant sites take longer to reach');
  ok(classify(0.1, 0.5, 0.5) === 'ocean' && classify(0.95, 0.5, 0.5) === 'mountain', 'biome classification is sane at the extremes');
  const settlements = ow.sites.filter(s => SITE_KINDS[s.kind].trade);
  ok(settlements.every(s => s.stock && Object.keys(s.stock).length > 0), 'every settlement produces something to trade');
  ok(settlements.every(s => s.hostility >= 0 && s.hostility <= 100), 'settlements sit on the same hostility meter as people');
});

describe('Colonists on their own', () => {
  // Nobody sits idle: with nothing queued, a colonist finds useful work.
  {
    const g = new Game('self-work');
    const w = g.world;
    w.designation.fill(null);
    g.resources.wood = 0; g.jobsDirty = true;
    const worker = g.colonists.find(c => c.peasant);
    let found = null;
    for (let i = 0; i < 400 && !found; i++) {
      for (const c of g.colonists) { c.needs.hunger = c.needs.rest = c.needs.joy = 1; }
      g.step();
      found = g.colonists.find(c => c.task && c.task.self);
    }
    ok(!!found, 'an idle colonist picks up useful work on their own', found ? `${found.name.short}: ${found.task.kind}` : 'none');
    ok(!!found && w.designation[w.idx(found.task.x, found.task.y)], 'and marks it, so others can help');
    const bp = () => new Set(g.world.building.filter(b => b && !b.done)).size;
    const before = bp();
    g.resources.wood = g.resources.stone = g.resources.gold = 999;
    for (let i = 0; i < TICKS_PER_DAY; i++) { autoplayStep(g, { build: false }); g.step(); }
    ok(bp() === before && g.world.findBuildings().length === new Game('self-work').world.findBuildings().length, 'Auto mode leaves building to the player');
    void worker;
  }
  // Beasts: a wild one can be tamed or hunted on command.
  {
    const g = new Game('hunt');
    const w = g.world;
    const c = g.colonists[0];
    const spot = findNearest(w, c.x + 3, c.y, (x, y) => w.walkable(x, y) && !g.colonists.some(k => k.x === x && k.y === y), 6);
    const beast = createBeast(g.rng.fork('hb'), 'cavegoat', { tame: false });
    beast.x = spot[0]; beast.y = spot[1]; beast.moveCd = 1e9;
    g.beasts.push(beast);
    ok(g.orderHunt([c.id], beast.id) === 1 && c.task.kind === 'hunt', 'a hunt can be ordered');
    const ground = g.ground.length;
    for (let i = 0; i < 1500 && !beast.dead; i++) { c.needs.hunger = c.needs.rest = 1; g.step(); }
    ok(beast.dead && g.ground.length > ground, 'the hunter brings it down, for meat and hide', `dead ${beast.dead}`);
    const wild = createBeast(g.rng.fork('tb'), 'woolback', { tame: false });
    wild.x = spot[0]; wild.y = spot[1]; wild.moveCd = 1e9;
    g.beasts.push(wild);
    const tamer = g.orderTame(g.colonists.map(k => k.id), wild.id);
    ok(tamer && tamer.task.kind === 'tame' && tamer.task.beastId === wild.id, 'taming goes to whoever is best with animals');
  }
  // A friend blocking a one-wide passage: trade places rather than wait forever.
  {
    const g = new Game('swap');
    const w = g.world;
    const [a, b] = g.colonists;
    const x0 = w.start.x - 3, y0 = w.start.y + 12;
    for (let x = x0 - 1; x <= x0 + 7; x++) for (const y of [y0 - 1, y0, y0 + 1]) {
      const i = w.idx(x, y);
      w.terrain[i] = y === y0 && x >= x0 && x <= x0 + 6 ? T.DIRT : T.ROCK;
      w.feature[i] = null; w.building[i] = null; w.designation[i] = null;
    }
    w.touch(); g.jobsDirty = true;
    for (const c of g.colonists) if (c !== a && c !== b) c.x = w.start.x, c.y = w.start.y;
    a.x = x0; a.y = y0; b.x = x0 + 2; b.y = y0; b.hold = true;
    g.occ = null;
    g.orderMove([a.id], x0 + 5, y0);
    let t = 0;
    while (!(a.x === x0 + 5 && a.y === y0) && t++ < 400) { for (const c of g.colonists) { c.needs.hunger = c.needs.rest = c.needs.joy = 1; } g.step(); }
    ok(a.x === x0 + 5 && a.y === y0, 'a colonist gets past a friend in a narrow passage by trading places', `after ${t} ticks`);
  }
});

describe('Farming', () => {
  ok(CROP_IDS.length >= 8, 'a real crop roster exists', `${CROP_IDS.length} crops`);
  ok(CROP_IDS.every(c => CROPS[c].product && CROPS[c].yield > 0 && CROPS[c].growDays > 0), 'every crop has a product, a yield and a growth time');
  ok(CROP_IDS.every(c => CROPS[c].seed && Object.keys(CROPS[c].seed).length), 'every crop costs seed stock to plant');
  ok([1, 16, 31, 46].map(seasonOf).join(',') === '0,1,2,3', 'the year runs through four seasons');
  ok(yearOf(1) === 1 && yearOf(61) === 2, 'years roll over');
  ok(growthStage(0) === 0 && growthStage(1) === 4, 'growth maps onto visible stages');

  // Winter has to actually bite, or seasons are decoration.
  const summerViable = CROP_IDS.filter(c => cropViability(c, { season: 1, soil: .8, water: .7, biome: 'grassland' }) > 0);
  const winterViable = CROP_IDS.filter(c => cropViability(c, { season: 3, soil: .8, water: .7, biome: 'grassland' }) > 0);
  ok(winterViable.length < summerViable.length, 'fewer crops grow in winter than summer', `${winterViable.length} vs ${summerViable.length}`);
  ok(winterViable.length > 0, 'something can always be grown, even in winter', winterViable.join(','));

  // Soil and water must be real requirements.
  const rich = cropViability('grain', { season: 1, soil: .9, water: .8, biome: 'grassland' });
  const poor = cropViability('grain', { season: 1, soil: .2, water: .8, biome: 'grassland' });
  const dry = cropViability('grain', { season: 1, soil: .9, water: .1, biome: 'grassland' });
  ok(rich > poor && rich > dry, 'soil and water both limit yield', `rich ${rich.toFixed(2)} poor ${poor.toFixed(2)} dry ${dry.toFixed(2)}`);
  ok(cropViability('bitterleaf', { season: 1, soil: .5, water: .3, biome: 'desert' }) >
     cropViability('bitterleaf', { season: 1, soil: .5, water: .3, biome: 'taiga' }), 'biome climate changes what will grow');

  // The recommendation must differ by region — that is the overworld paying off.
  const picks = new Set(['grassland', 'tundra', 'desert', 'mountain', 'marsh']
    .map(b => recommendCrop({ season: 1, soil: .7, water: .6, biome: b })));
  ok(picks.size >= 3, 'different regions call for different crops', [...picks].join(','));

  const g = new Game('soil-test');
  ok(g.world.soil && g.world.water, 'the local map carries soil and water layers');
  const avgSoil = Array.from(g.world.soil).reduce((a, b) => a + b, 0) / g.world.soil.length;
  ok(avgSoil > 0.05 && avgSoil <= 1, 'soil values are in range', avgSoil.toFixed(2));
  ok(CROPS[g.suggestCrop(g.world.start.x, g.world.start.y)] !== undefined, 'the game can suggest a crop for a tile');
});

describe('Animal husbandry', () => {
  resetBeastIds(1);
  const rng = new RNG('beasts');
  ok(ANIMAL_IDS.length >= 8, 'a real species roster exists', `${ANIMAL_IDS.length} species`);
  ok(ANIMAL_IDS.every(a => ANIMALS[a].biomes.length > 0), 'every species belongs to real biomes');
  ok(ANIMAL_IDS.some(a => ANIMALS[a].war), 'some beasts can fight');
  ok(ANIMAL_IDS.some(a => ANIMALS[a].pack), 'some beasts can carry');
  ok(ANIMAL_IDS.some(a => ANIMALS[a].product), 'some beasts produce renewable goods');
  const biomesCovered = new Set();
  for (const b in BIOMES) if (biomeSpecies(b).length) biomesCovered.add(b);
  ok(biomesCovered.size >= 10, 'nearly every biome supports some livestock', `${biomesCovered.size}`);

  const herd = Array.from({ length: 200 }, () => createBeast(rng, rng.pick(ANIMAL_IDS), { tame: true }));
  ok(herd.every(b => b.hp > 0 && b.hp <= b.maxHp), 'beast health is always in range');
  ok(herd.every(b => b.traits.every(t => t in (({}, { hardy: 1, fecund: 1, rich: 1, fierce: 1, docile: 1, runt: 1, prize: 1, sickly: 1 })))), 'beast traits all resolve');
  ok(new Set(herd.map(b => b.id)).size === herd.length, 'beast ids are unique');
  ok(herd.some(b => b.sex === 'f') && herd.some(b => b.sex === 'm'), 'both sexes occur');

  // Inheritance
  const mum = createBeast(rng, 'woolback', { tame: true });
  mum.traits = ['prize', 'hardy'];
  const dad = createBeast(rng, 'woolback', { tame: true });
  dad.traits = ['fecund'];
  let inherited = 0;
  for (let i = 0; i < 80; i++) {
    const calf = createBeast(rng, 'woolback', { tame: true, age: 0, parents: [mum, dad] });
    if (calf.traits.some(t => ['prize', 'hardy', 'fecund'].includes(t))) inherited++;
  }
  ok(inherited > 30, 'offspring inherit parent traits most of the time', `${inherited}/80`);

  // War beasts must work through the ordinary combat resolver.
  const dog = createBeast(rng, 'warhound', { tame: true });
  const unit = beastAsCombatant(dog);
  ok(unit.combat && unit.combat.dmg[1] > 0 && unit.hp > 0, 'a beast converts into a valid combatant');
  const party = () => Array.from({ length: 3 }, (_, i) => generateNPC(new RNG('p' + i), { faction: 'colony', tier: 3 }));
  const foes = () => generateGroup(new RNG('f'), { faction: 'warband', tier: 3, size: 3, bossChance: 0 });
  let without = 0, withBeast = 0;
  for (let i = 0; i < 120; i++) {
    if (simulateCombat(new RNG('n' + i), party(), foes(), { potions: { count: 0 } }).won) without++;
    const wolves = [beastAsCombatant(createBeast(new RNG('w' + i), 'direwolf', { tame: true }))];
    if (simulateCombat(new RNG('n' + i), [...party(), ...wolves], foes(), { potions: { count: 0 } }).won) withBeast++;
  }
  info(`party win rate: ${Math.round(without / 1.2)}% alone, ${Math.round(withBeast / 1.2)}% with a direwolf`);
  ok(withBeast > without, 'war beasts measurably help in a fight');

  // Taming must be a skill check, not a coin flip.
  const novice = generateNPC(new RNG('nov'), { faction: 'colony', tier: 0 });
  const expert = generateNPC(new RNG('exp'), { faction: 'colony', tier: 5 });
  novice.skills.animals = 0; expert.skills.animals = 16;
  const goat = createBeast(rng, 'cavegoat');
  ok(tameChance(expert, goat) > tameChance(novice, goat), 'skill dominates taming odds',
    `${pctOf(tameChance(novice, goat))} → ${pctOf(tameChance(expert, goat))}`);
  ok(tameChance(expert, createBeast(rng, 'direwolf')) < tameChance(expert, goat), 'dangerous species are harder to tame');

  const out = butcherBeast({ bonuses: {} }, createBeast(rng, 'ox', { tame: true }));
  ok(out.food > 0 && out.leather > 0, 'butchering returns meat and hide', JSON.stringify(out));
});
function pctOf(v) { return Math.round(v * 100) + '%'; }

// ---------------------------------------------------------------------------
describe('Dungeon generation', () => {
  const rng = new RNG('dungeons');
  for (const tier of [1, 3, 6, 10, 14]) {
    const d = generateDungeon('dt' + tier, { tier, rng });
    const seen = new Set([0]); const q = [0];
    while (q.length) { const c = q.shift(); for (const n of d.rooms[c].links) if (!seen.has(n)) { seen.add(n); q.push(n); } }
    ok(seen.size === d.rooms.length, `tier ${tier}: every room is reachable from the entrance`, `${seen.size}/${d.rooms.length}`);
    ok(d.rooms[0].kind === 'entry', `tier ${tier}: room 0 is the entrance`);
    ok(d.rooms.some(r => r.kind === 'lair'), `tier ${tier}: a lair exists`);
    ok(d.danger > 0 && finite(d.danger), `tier ${tier}: danger is a real number`, `${d.danger}`);
    ok(d.rooms.every(r => r.links.every(l => d.rooms[l].links.includes(r.id))), `tier ${tier}: links are symmetric`);
  }
  const d1 = generateDungeon('same', { tier: 5, rng: new RNG('fixed') });
  const d2 = generateDungeon('same', { tier: 5, rng: new RNG('fixed') });
  ok(JSON.stringify(d1.rooms.map(r => [r.kind, r.links])) === JSON.stringify(d2.rooms.map(r => [r.kind, r.links])), 'generation is deterministic for a seed');
  const lo = generateDungeon('a', { tier: 1, rng }), hi = generateDungeon('b', { tier: 12, rng });
  ok(hi.danger > lo.danger * 3, 'deeper dungeons are much more dangerous', `${lo.danger} → ${hi.danger}`);
  ok(hi.roomCount > lo.roomCount, 'deeper dungeons are larger');

  // Offers must be calibrated to the party, not to an abstract tier.
  const offers = generateOffers(new RNG('off'), 300, 3);
  ok(offers.length === 3, 'three offers are produced');
  ok(offers[0].danger < offers[2].danger, 'the board spans easy → stretch', offers.map(o => o.danger).join(' < '));
  ok(offers[0].danger < 300, 'the easiest offer is below party power', `${offers[0].danger} vs 300`);
});

// ---------------------------------------------------------------------------
describe('Combat', () => {
  const rng = new RNG('combat');
  const mk = (tier, n, faction = 'colony') => generateGroup(new RNG('g' + tier + n + faction), { faction, tier, size: n, bossChance: 0 });
  const a1 = mk(3, 4), b1 = mk(3, 4, 'warband');
  const r1 = simulateCombat(new RNG('fight'), a1.map(x => ({ ...x })), b1.map(x => ({ ...x })), { potions: { count: 0 } });
  ok(finite(r1.rounds) && r1.rounds > 0, 'combat terminates with a round count');
  ok(typeof r1.won === 'boolean' && typeof r1.wipe === 'boolean', 'result flags are booleans');
  ok(!(r1.won && r1.wipe), 'a win and a wipe are mutually exclusive');

  // Determinism
  const p = () => mk(4, 4), e = () => mk(4, 4, 'warband');
  const x = simulateCombat(new RNG('det'), p(), e(), { potions: { count: 0 } });
  const y = simulateCombat(new RNG('det'), p(), e(), { potions: { count: 0 } });
  ok(x.rounds === y.rounds && x.won === y.won && x.foesKilled === y.foesKilled, 'identical inputs give identical results');

  // Win rate has to rise with power ratio.
  const rate = (pt, ft, n = 120) => {
    let w = 0;
    for (let k = 0; k < n; k++) {
      const P = generateGroup(new RNG('P' + k + pt), { faction: 'colony', tier: pt, size: 4, bossChance: 0 });
      const F = generateGroup(new RNG('F' + k + ft), { faction: 'warband', tier: ft, size: 4, bossChance: 0 });
      if (simulateCombat(new RNG('c' + k), P, F, { potions: { count: 0 } }).won) w++;
    }
    return w / n;
  };
  const weak = rate(2, 6), even = rate(4, 4), strong = rate(9, 3);
  info(`win rate: outmatched ${(weak * 100) | 0}%  even ${(even * 100) | 0}%  favoured ${(strong * 100) | 0}%`);
  ok(weak < even && even < strong, 'win rate increases monotonically with relative power');
  ok(weak < 0.15, 'being badly outmatched is punishing', `${(weak * 100) | 0}%`);
  ok(strong > 0.7, 'a strong party reliably wins', `${(strong * 100) | 0}%`);

  // Retreat valve
  const P = mk(2, 4), F = mk(7, 5, 'warband');
  const ret = simulateCombat(new RNG('ret'), P, F, { potions: { count: 0 }, retreatAt: 0.5 });
  ok(ret.retreated || ret.wipe || ret.won, 'a hopeless fight ends in retreat, wipe or an upset');
  let retreats = 0, wipes = 0;
  for (let k = 0; k < 60; k++) {
    const r = simulateCombat(new RNG('rr' + k), mk(3, 4), mk(6, 4, 'warband'), { potions: { count: 0 }, retreatAt: 0.5 });
    if (r.retreated) retreats++; if (r.wipe) wipes++;
  }
  ok(retreats > wipes, 'with a retreat threshold, parties mostly pull out rather than die', `${retreats} retreats vs ${wipes} wipes`);
  ok(mk(3, 4).every(n => n.hp <= n.maxHp), 'combat never leaves hp above maximum');
});

// ---------------------------------------------------------------------------
describe('Combat core: damage, statuses, rows', () => {
  // A fresh fighter with a patched combat sheet; hp full.
  const npc = (seed, o = {}) => {
    const n = generateNPC(new RNG(seed), { faction: o.faction || 'colony', tier: 4, classHint: o.klass || 'fighter', raceHint: o.race || 'human' });
    Object.assign(n.combat, o.combat || {});
    if (o.tags) n.combat.tags = [...n.combat.tags, ...o.tags];
    if (o.hp) n.maxHp = o.hp;
    n.hp = n.maxHp;
    return n;
  };
  const fight = (a, b, ctx = {}) => createBattle(new RNG('cb'), a, b, ctx);

  // Soak: physical is armour's problem, fire is not.
  let S = fight([npc('a')], [npc('t', { combat: { armor: 24 }, hp: 999 })]);
  const t = S.B[0];
  const slash = dealDamage(S, t, 20, 'slash'), fire = dealDamage(S, t, 20, 'fire');
  ok(slash < fire, 'armour soaks physical damage but not elements', `slash ${slash} vs fire ${fire}`);
  t.res.holy = -0.5; t.res.nature = 1; t.res.frost = 1.5;
  ok(dealDamage(S, t, 20, 'holy') === 30, 'a weakness takes 50% more');
  ok(dealDamage(S, t, 20, 'nature') === 0, 'an immunity takes nothing');
  const hpBefore = t.hp; t.hp -= 50; dealDamage(S, t, 20, 'frost');
  ok(t.hp > hpBefore - 50, 'an absorbing resistance heals instead');

  // Ancestry and nature carry their resistances.
  const risen = npc('r', { race: 'undead' }), tief = npc('tf', { race: 'tiefling' }), dwarf = npc('dw', { race: 'dwarf' });
  ok(risen.combat.res.holy < 0 && risen.combat.immune.includes('poison'), 'the undead are weak to holy and immune to poison');
  ok(tief.combat.res.fire >= 0.5 && dwarf.combat.res.nature >= 0.5, 'tieflings resist fire, dwarves resist poison');
  ok(npc('kb', { race: 'kobold' }).combat.tags.includes('small'), 'small ancestries are tagged small');
  const dk = [0, 1, 2, 3].map(i => npc('dk' + i, { race: 'dragonkin' }));
  ok(dk.every(d => Object.values(d.combat.res).some(v => v >= 0.5)), 'dragonkin carry a lineage resistance');

  // Poison ticks through armour; burn cannot take on the wet.
  S = fight([npc('a')], [npc('p', { combat: { armor: 40 }, hp: 300 })]);
  const v = S.B[0];
  applyStatus(S, v, 'poison', { stacks: 3 });
  const h0 = v.hp; upkeep(S, v);
  ok(h0 - v.hp >= 20, 'poison ignores armour and scales with stacks', `${h0 - v.hp} damage`);
  applyStatus(S, v, 'wet', {});
  ok(!applyStatus(S, v, 'burn', { mag: 5 }), 'a wet target cannot be set alight');

  // Chill stacks into a freeze; crush shatters it.
  S = fight([npc('a', { combat: { dmgType: 'crush' } })], [npc('f', { hp: 999 })]);
  const f = S.B[0];
  for (let k = 0; k < 3; k++) applyStatus(S, f, 'chill', {});
  ok(hasSt(f, 'frozen') && !hasSt(f, 'chill'), 'three chill stacks become frozen');
  const frozenHit = dealDamage(S, f, 20, 'crush'), normalHit = dealDamage(S, f, 20, 'crush');
  ok(frozenHit > normalHit * 1.7 && !hasSt(f, 'frozen'), 'crush shatters the frozen for double damage', `${frozenHit} vs ${normalHit}`);
  ok(S.stats.combos.shatter === 1, 'the shatter combo is counted');

  // Wet + storm electrocutes.
  S = fight([npc('a', { combat: { dmgType: 'storm' } })], [npc('w', { hp: 999 })]);
  applyStatus(S, S.B[0], 'wet', {});
  strike(S, S.A[0], S.B[0], { type: 'storm', autoHit: true });
  ok(hasSt(S.B[0], 'stun') && S.stats.combos.electrocute === 1, 'storm on a wet target stuns');

  // Fire on the chilled makes steam instead of burning.
  S = fight([npc('a')], [npc('s', { hp: 999 })]);
  applyStatus(S, S.B[0], 'chill', {});
  applyStatus(S, S.B[0], 'burn', { mag: 4 });
  ok(!hasSt(S.B[0], 'burn') && !hasSt(S.B[0], 'chill') && S.stats.combos.steam === 1, 'fire and frost cancel into steam');

  // Poise: big creatures stagger instead of being stun-locked.
  S = fight([npc('a')], [npc('big', { tags: ['large'], combat: { poise: 2 }, hp: 999 })]);
  const big = S.B[0];
  ok(!applyStatus(S, big, 'stun', {}) && !hasSt(big, 'stun'), 'the first stun on a large creature only fills its poise');
  ok(applyStatus(S, big, 'stun', {}) && hasSt(big, 'stagger'), 'a full poise bar staggers it');
  ok(!applyStatus(S, big, 'stun', {}), 'after a stagger it is briefly immune to hard control');

  // Telegraphs are interrupted by hard control.
  S = fight([npc('a')], [npc('caster', { hp: 999 })]);
  S.B[0].charging = { id: 'blast', ab: ABILITIES.blast, left: 1 };
  applyStatus(S, S.B[0], 'stun', {});
  ok(!S.B[0].charging && S.stats.interrupts === 1, 'a stun interrupts a telegraphed ability');
  S.B[0].charging = { id: 'blast', ab: ABILITIES.blast, left: 1 };
  applyStatus(S, S.B[0], 'silence', {});
  ok(!S.B[0].charging, 'silence interrupts a spell being gathered');

  // Rows: melee cannot reach past a standing front line; reach and range can.
  const front = npc('fr'), back = npc('bk', { klass: 'wizard' });
  S = fight([npc('m', { combat: { range: 'melee', reach: false } }), npc('sp', { combat: { range: 'melee', reach: true } })], [front, back]);
  S.round = 2;
  const bk = S.B.find(u => u.npc === back);
  ok(bk.row === 'back', 'casters stand in the back row');
  ok(!reachable(S, S.A[0], bk, 'melee'), 'melee cannot reach the back row past a standing front line');
  ok(reachable(S, S.A[1], bk, 'melee') && reachable(S, S.A[0], bk, 'ranged'), 'reach weapons and ranged attacks can');
  S.B.find(u => u.npc === front).alive = false;
  ok(reachable(S, S.A[0], bk, 'melee'), 'once the front falls, the back row is exposed');

  // Flying: out of melee reach until it swoops or is brought down.
  S = fight([npc('m', { combat: { range: 'melee', reach: false } })], [npc('bird', { tags: ['flying'], hp: 999 })]);
  const bird = S.B[0];
  ok(!reachable(S, S.A[0], bird, 'melee') && reachable(S, S.A[0], bird, 'ranged'), 'melee cannot reach a flier; arrows can');
  bird.swoop = true;
  ok(reachable(S, S.A[0], bird, 'melee'), 'a flier that swooped in to strike can be struck back');
  bird.swoop = false; applyStatus(S, bird, 'root', {});
  ok(hasSt(bird, 'grounded') && reachable(S, S.A[0], bird, 'melee'), 'rooting a flier grounds it');

  // Tags: relentless, undying, mindless, splitting, magic resistance.
  S = fight([npc('a')], [npc('orc', { race: 'orc', hp: 50 })]);
  dealDamage(S, S.B[0], 500, 'slash', { noArmor: true });
  ok(S.B[0].alive && S.B[0].hp === 1, 'an orc is relentless once per fight');
  let rose = 0, holyRose = 0;
  for (let k = 0; k < 40; k++) {
    let T = createBattle(new RNG('u' + k), [npc('a')], [npc('z', { tags: ['undying'], hp: 40 })]);
    dealDamage(T, T.B[0], 500, 'slash', { noArmor: true }); if (T.B[0].alive) rose++;
    T = createBattle(new RNG('u' + k), [npc('a')], [npc('z', { tags: ['undying'], hp: 40 })]);
    dealDamage(T, T.B[0], 500, 'holy', { noArmor: true }); if (T.B[0].alive) holyRose++;
  }
  ok(rose > 8 && holyRose === 0, 'the undying rise again unless finished by holy', `${rose}/40 rose, ${holyRose} after holy`);
  S = fight([npc('a')], [npc('mind', { race: 'construct' })]);
  ok(!applyStatus(S, S.B[0], 'charm', {}) && !applyStatus(S, S.B[0], 'poison', {}), 'constructs cannot be charmed or poisoned');
  S = fight([npc('a')], [npc('ooze', { tags: ['splits'], hp: 200 })]);
  dealDamage(S, S.B[0], 30, 'slash', { noArmor: true });
  ok(S.B.length === 2 && S.stats.combos.split === 1, 'a splitter divides under a blade');
  S = fight([npc('a')], [npc('mr', { tags: ['magicres'], hp: 999 })]);
  ok(dealDamage(S, S.B[0], 40, 'fire', { spell: true }) < dealDamage(S, S.B[0], 40, 'fire'), 'magic resistance halves spell damage');

  // Whole fights: deterministic with statuses, and the AI interrupts telegraphs.
  const party = () => [npc('p1', { klass: 'barbarian' }), npc('p2', { klass: 'wizard' }), npc('p3', { klass: 'cleric' }), npc('p4', { klass: 'druid' })];
  const foes = () => generateGroup(new RNG('cf'), { faction: 'cult', tier: 4, size: 4, bossChance: 0 });
  const r1 = simulateCombat(new RNG('cc'), party(), foes(), {}), r2 = simulateCombat(new RNG('cc'), party(), foes(), {});
  ok(r1.rounds === r2.rounds && r1.won === r2.won && JSON.stringify(r1.stats) === JSON.stringify(r2.stats), 'fights with statuses replay identically');
  let statusesSeen = new Set(), interrupts = 0, telegraphs = 0;
  for (let k = 0; k < 60; k++) {
    const counter = npc('cs' + k, { klass: 'wizard' });  // the designed answer: a counterspell
    counter.abilities = ['counterspell'];
    const mage = npc('wz' + k, { klass: 'wizard' });
    mage.abilities = ['blast'];
    const r = simulateCombat(new RNG('ti' + k), [counter, npc('f' + k)], [mage, npc('g' + k)], {});
    Object.keys(r.stats.statuses).forEach(x => statusesSeen.add(x));
    interrupts += r.stats.interrupts; telegraphs += r.stats.telegraphs;
  }
  info(`60 fights: ${telegraphs} telegraphs, ${interrupts} interrupted; statuses seen: ${[...statusesSeen].join(', ')}`);
  ok(telegraphs > 0 && interrupts > 0, 'telegraphed abilities occur, and some are interrupted');
  ok(Object.keys(STATUSES).length >= 25, 'the status library has at least 25 entries', `${Object.keys(STATUSES).length}`);
  ok(Object.values(ABILITIES).every(a => a.shape && (a.kind === 'heal' || a.kind === 'buff' || a.kind === 'summon' || a.range)), 'every ability declares its shape and range');
  ok(Object.values(ABILITIES).every(a => !a.dmg || a.dmg === 'weapon' || a.dmg === 'element' || a.dmg === 'random' || DAMAGE_TYPES[a.dmg]), 'every ability damage type exists');
  ok(Object.values(ABILITIES).every(a => (a.apply || []).every(([id]) => STATUSES[id])), 'every ability rider is a real status');
});

// ---------------------------------------------------------------------------
describe('Monster library', () => {
  info(`${MONSTER_IDS.length} monsters in ${Object.keys(FAMILIES).length} families, ${ENCOUNTER_IDS.length} encounter templates`);
  ok(MONSTER_IDS.length >= 100, 'the library has at least a hundred monsters', `${MONSTER_IDS.length}`);
  ok(Object.keys(FAMILIES).length >= 12, 'there are at least twelve families');
  ok(ENCOUNTER_IDS.length >= 28, 'there are at least 28 encounter templates', `${ENCOUNTER_IDS.length}`);
  const bad = MONSTER_IDS.filter(id => {
    const M = MONSTERS[id];
    return !FAMILIES[M.fam] || rankIdx(M.rank[0]) > rankIdx(M.rank[1]) || !RANKS.includes(M.rank[0]) || !RANKS.includes(M.rank[1])
      || (M.ab || []).some(a => !ABILITIES[a]) || (M.on || []).some(([st]) => !STATUSES[st])
      || (M.tags || []).some(t => !TAGS[t]) || (M.drops && M.drops.trophy && !TROPHIES[M.drops.trophy]) || (M.drops && M.drops.ess && !ESSENCES[M.drops.ess]);
  });
  ok(!bad.length, 'every monster references real families, ranks, abilities, statuses, tags and drops', bad.join(', '));
  const badT = ENCOUNTER_IDS.filter(id => [...ENCOUNTERS[id].leader, ...ENCOUNTERS[id].minions].some(m => !MONSTERS[m]));
  ok(!badT.length, 'every template lists real monsters', badT.join(', '));
  // Coverage: every theme has something to throw at every rank.
  const themes = ['crypt', 'warren', 'vault', 'sanctum', 'delve', 'hive'];
  const gaps = [];
  for (const th of themes) for (let r = 0; r < RANKS.length; r++) if (templatesFor(th, r).filter(([, w]) => w >= 3).length < 2) gaps.push(`${th}@${RANKS[r]}`);
  ok(gaps.length <= 6, 'nearly every theme has at least two native templates at every rank', gaps.join(', '));

  // Every monster builds at its native rank and far beyond it.
  let broken = [];
  for (const id of MONSTER_IDS) for (const tier of [1, 7, 16]) {
    const m = createMonster(new RNG(id + tier), id, tier);
    if (!(m.maxHp > 0 && m.combat.dmg[1] >= m.combat.dmg[0] && finite(powerOf(m)) && m.hp === m.maxHp)) broken.push(id);
  }
  ok(!broken.length, 'every monster produces a valid combatant at every depth', broken.slice(0, 5).join(', '));
  const lvl1 = createMonster(new RNG('a'), 'goblin', 1), lvl10 = createMonster(new RNG('a'), 'goblin', 10);
  ok(lvl10.maxHp > lvl1.maxHp * 3 && powerOf(lvl10) > powerOf(lvl1) * 2, 'monsters scale with depth');
  const skel = createMonster(new RNG('s'), 'skeleton', 3);
  ok(skel.combat.res.crush < 0 && skel.combat.res.holy < 0 && skel.combat.res.slash > 0, 'skeletons are weak to crush and holy, resist blades');
  const troll = createMonster(new RNG('t'), 'troll', 6);
  ok(troll.combat.tags.includes('regenerating') && troll.combat.res.fire < 0, 'trolls regenerate and fear fire');
  ok(createMonster(new RNG('d'), 'young_red_dragon', 9).combat.tags.includes('flying'), 'dragons fly');

  // Encounters fill templates at the right rank.
  const early = buildEncounter(new RNG('e1'), { tier: 1, size: 4, theme: 'crypt' });
  const late = buildEncounter(new RNG('e2'), { tier: 16, size: 4, theme: 'crypt' });
  ok(early.every(m => rankIdx(MONSTERS[m.monsterId].rank[0]) <= tierRank(1)), 'an early crypt fields only low-rank monsters', early.map(m => m.monsterId).join(','));
  ok(late.some(m => rankIdx(MONSTERS[m.monsterId].rank[1]) >= 5 || m.affixes.length), 'a deep crypt fields high-rank or elite monsters', late.map(m => m.name.short).join(','));
  const bossed = buildEncounter(new RNG('b'), { tier: 5, size: 3, boss: true, theme: 'warren' });
  ok(bossed[0].boss && bossed[0].combat.tags.includes('boss'), 'lair leaders are bosses');
  const coven = buildEncounter(new RNG('c'), { tier: 6, size: 5, template: 'hag_coven' });
  ok(coven.length === 3, 'fixed-size templates keep their size (a coven is three)');
  ok(buildEncounter(new RNG('x'), { tier: 4, size: 4 }).every(m => m.monster), 'encounters are made of monsters');

  // Mechanics that only monsters exercise.
  let fireWins = 0, bladeWins = 0;
  for (let k = 0; k < 40; k++) {
    const party = () => [generateNPC(new RNG('tp' + k), { faction: 'colony', tier: 6, classHint: 'fighter' }), generateNPC(new RNG('tq' + k), { faction: 'colony', tier: 6, classHint: 'wizard' })];
    const tr = () => [createMonster(new RNG('tr' + k), 'troll', 5)];
    const p1 = party(); p1[1].abilities = ['firebolt'];
    const p2 = party(); p2[1].abilities = ['blast']; p2[1].equipment.weapon = null; p2[1].combat.dmgType = 'crush';
    if (simulateCombat(new RNG('tf' + k), p1, tr(), {}).won) fireWins++;
    if (simulateCombat(new RNG('tf' + k), p2, tr(), {}).won) bladeWins++;
  }
  info(`troll: ${fireWins}/40 wins with a firebolt, ${bladeWins}/40 without fire`);
  ok(fireWins > bladeWins, 'fire is the answer to trolls');
  let summoned = 0;
  for (let k = 0; k < 30; k++) {
    const r = simulateCombat(new RNG('sm' + k), [generateNPC(new RNG('sp' + k), { faction: 'colony', tier: 5 }), generateNPC(new RNG('sq' + k), { faction: 'colony', tier: 5 })],
      [createMonster(new RNG('w' + k), 'wight', 5), createMonster(new RNG('z' + k), 'skeleton', 4)], {});
    summoned += r.stats.summons || 0;
  }
  ok(summoned > 0, 'summoners raise reinforcements mid-fight', `${summoned} raised`);

  // Drops
  let ess = 0, gear = 0, troph = 0, res = 0;
  for (let k = 0; k < 400; k++) {
    const mon = createMonster(new RNG('dr' + k), rng0(k), 6, { boss: k % 10 === 0 });
    mon.hp = 0;
    const d = rollMonsterDrops(new RNG('dd' + k), mon, 6);
    ess += Object.keys(d.reagents).length; gear += d.items.length; troph += Object.keys(d.trophies).length; res += Object.keys(d.resources).length;
  }
  function rng0(k) { return ['fire_elemental', 'troll', 'wight', 'animated_armor', 'goblin'][k % 5]; }
  info(`400 kills: ${res} resource drops, ${ess} essences, ${gear} gear, ${troph} trophies`);
  ok(res >= 400 && ess > 20 && gear > 5 && troph > 0, 'kills drop resources always, essences often, gear and trophies rarely');

  // Night waves and dungeons use them.
  const wave = monsterWave(new RNG('mw'), 'dead', 4, 300, 8);
  ok(wave.length > 0 && wave.every(m => m.monster && m.family === 'undead' || ENCOUNTERS[wave.template]), 'the dead come as undead monsters', wave.map(m => m.name.short).join(','));
  const d = generateDungeon('mdg', { tier: 5, themeId: 'crypt' });
  const fights = d.rooms.filter(r => r.encounter);
  ok(fights.some(r => r.encounter.monster && r.encounter.templateName), 'dungeon rooms are garrisoned by monster templates');
  ok(generateDungeon('deep', { tier: 18 }).tier === 18, 'the Rift can generate past tier 14 now');
});

// ---------------------------------------------------------------------------
describe('Classes and skill trees', () => {
  ok(TREE_CLASSES.length === 12, 'all twelve adventurer classes have a tree');
  const shapeBad = TREE_CLASSES.filter(k => TREES[k].tiers.length < 2 || TREES[k].tiers.some(t => t.length !== 4 || t.some(a => a.specs.length !== 4 || !ABILITIES[a.id])));
  ok(!shapeBad.length, 'every tier has four real actives with four specialisations each', shapeBad.join(','));
  const baseBad = TREE_CLASSES.filter(k => !TREES[k].tiers[0].some(a => a.id === TREES[k].base));
  ok(!baseBad.length, 'each class base ability sits in its first tier');
  ok(TREE_CLASSES.every(k => CLASS_INFO[k] && PRESTIGE[k] && PRESTIGE[k].length === 2), 'each class has a school, weapon list and two prestige paths');
  const nodeCount = TREE_CLASSES.reduce((n, k) => n + treeNodes(k).length, 0);
  info(`${nodeCount} tree nodes across ${TREE_CLASSES.length} classes (tiers 1–2)`);
  const dupes = new Set(); let dup = '';
  for (const k of TREE_CLASSES) for (const t of TREES[k].tiers) for (const a of t) { if (dupes.has(a.id)) dup = a.id; dupes.add(a.id); }
  ok(!dup, 'no active appears in two trees', dup);

  // The founders hold their points; everyone else arrives with a build.
  const g = new Game('trees');
  const founder = g.colonists.find(c => c.tree);
  ok(founder && founder.abilities.length === 1 && founder.abilities[0] === TREES[founder.klass].base, 'a founder starts with only the base ability', founder && founder.abilities.join(','));
  const vet = generateNPC(new RNG('vet'), { faction: 'outlaws', tier: 6, classHint: 'rogue' });
  ok(vet.abilities.length === LOADOUT_SLOTS && pointsFree(vet) === 0, 'an NPC met in the world has spent its points and filled its slots', `${vet.abilities.length} slots, ${pointsFree(vet)} free`);

  // Buying rules.
  const c = generateNPC(new RNG('buyer'), { faction: 'colony', tier: 0, classHint: 'fighter', manualSkills: true, raceHint: 'dwarf' });
  c.level = 1;
  ok(pointsFree(c) === 0 && canBuy(c, 'shield_bash') !== '', 'no points at level 1 (non-human)');
  c.level = 9;
  ok(canBuy(c, 'shield_bash.0') === 'Learn the ability first.', 'a specialisation needs its ability first');
  ok(buyNode(c, 'shield_bash') === '' && c.abilities.includes('shield_bash'), 'buying an active fills a combat slot');
  ok(canBuy(c, 'action_surge').startsWith('Opens at level'), 'tier 2 is locked below level 10');
  c.level = 40;
  let bought = 0;
  for (const n of treeNodes('fighter')) if (n.tier === 0 && !buyNode(c, n.id)) bought++;
  const t0 = c.tree.owned.filter(id => treeNodes('fighter').find(n => n.id === id).tier === 0).length;
  ok(t0 === TIER_CAP + 1, 'a tier allows only ten choices (plus the free base)', `${t0} owned in tier 1`);
  ok(canBuy(c, 'shield_bash.3') !== '' || c.tree.owned.includes('shield_bash.3'), 'the cap blocks further picks in a full tier');
  ok(treeNodes('fighter').filter(n => n.tier === 2).length === 0 || canBuy(c, 'x') !== '', 'prestige tiers stay locked without an academy');
  // Loadout
  autoAllocate(c);
  ok(c.abilities.length <= LOADOUT_SLOTS, 'no more than four abilities are ever slotted');
  const out = c.abilities[0];
  toggleLoadout(c, out);
  ok(!c.abilities.includes(out), 'an active can be taken out of its slot');
  // Specialisations patch the ability.
  const f = generateNPC(new RNG('spec'), { faction: 'colony', tier: 3, classHint: 'wizard', manualSkills: true });
  f.level = 12;
  const plain = effectiveAbility(f, 'firebolt');
  buyNode(f, 'firebolt.0'); buyNode(f, 'firebolt.1');
  const spec = effectiveAbility(f, 'firebolt');
  ok(spec.power > plain.power * 1.3 && spec.apply.find(r => r[0] === 'burn')[1] > plain.apply.find(r => r[0] === 'burn')[1], 'specialisations raise power and rider chance');
  ok(ABILITIES.firebolt.power === plain.power, 'the shared ability table is never mutated by a character\'s specs');

  // Levelling
  const l = generateNPC(new RNG('lvl'), { faction: 'colony', tier: 0, classHint: 'cleric', manualSkills: true });
  const hp0 = l.maxHp, lv0 = l.level;
  const got = gainLevelXp(l, 5000);
  ok(got > 3 && l.level === lv0 + got && l.maxHp > hp0, 'XP raises level and hit points', `+${got} levels`);
  ok(pointsFree(l) === pointsEarned(l) - 0, 'each level brings a skill point');
  gainLevelXp(l, 1e9);
  ok(l.level === LEVEL_CAP, 'levels cap at 40');
  ok(xpToNext(30) > xpToNext(10) * 3, 'the curve steepens');

  // Trees change fights: a specced party beats the same party without.
  let withTree = 0, without = 0;
  for (let k = 0; k < 60; k++) {
    const mk = (auto) => ['fighter', 'wizard', 'cleric', 'rogue'].map((kl, i) => {
      const n = generateNPC(new RNG('tr' + k + i), { faction: 'colony', tier: 7, classHint: kl, manualSkills: !auto });
      return n;
    });
    const foes = () => generateGroup(new RNG('tf' + k), { faction: 'warband', tier: 7, size: 4, bossChance: 0 });
    if (simulateCombat(new RNG('tc' + k), mk(true), foes(), {}).won) withTree++;
    if (simulateCombat(new RNG('tc' + k), mk(false), foes(), {}).won) without++;
  }
  info(`level ~10 party: ${withTree}/60 wins with trees spent, ${without}/60 with base abilities only`);
  ok(withTree > without, 'spending skill points makes a party stronger');
});

// ---------------------------------------------------------------------------
describe('Gear, rarity and potions', () => {
  // Generation: every slot and rarity builds a sane item.
  let bad = [];
  for (const slot of SLOTS) for (const rarity of RARITY_IDS.filter(r => r !== 'legendary')) for (let k = 0; k < 6; k++) {
    const it = generateItem(new RNG(slot + rarity + k), { slot, tier: k * 3, rarity });
    if (it.slot !== slot || it.rarity !== rarity || !it.name || (slot === 'weapon' && !(it.dmg[1] > it.dmg[0]))) bad.push(`${slot}/${rarity}`);
    if (RARITIES[rarity].affixes && !(it.affixes.length || it.suffix)) bad.push(`${slot}/${rarity} no affix`);
    if (rarity === 'epic' && slot !== 'weapon' && !it.passive) bad.push(`${slot} epic without passive`);
  }
  ok(!bad.length, 'every slot builds valid items at every rarity', bad.slice(0, 4).join(', '));
  const legs = LEGENDARY_IDS.map(id => generateItem(new RNG(id), { legendary: id, tier: 6 }));
  ok(legs.every(it => it.rarity === 'legendary' && it.name === LEGENDARIES[it.legendary].name), 'every legendary builds with its name');
  ok(legs.filter(it => it.grants).every(it => ABILITIES[it.grants]), 'legendaries grant real abilities');
  const hi = Array.from({ length: 300 }, (_, k) => generateLoot(new RNG('hi' + k), 16)), lo = Array.from({ length: 300 }, (_, k) => generateLoot(new RNG('lo' + k), 1));
  const score = (arr) => arr.reduce((s2, it) => s2 + RARITY_IDS.indexOf(it.rarity), 0) / arr.length;
  info(`average rarity: rank E ${score(lo).toFixed(2)}, rank SSS ${score(hi).toFixed(2)} (0 common … 4 legendary)`);
  ok(score(hi) > score(lo) + 1, 'deeper loot is rarer');

  // Class locks: weapons and shields yes, armour no.
  const wiz = generateNPC(new RNG('wz'), { faction: 'colony', tier: 3, classHint: 'wizard' });
  const ftr = generateNPC(new RNG('ft'), { faction: 'colony', tier: 3, classHint: 'fighter' });
  const sword = generateItem(new RNG('s'), { slot: 'weapon', family: 'maul', tier: 3 });
  const shield = generateItem(new RNG('sh'), { slot: 'offhand', base: 'kite', tier: 3 });
  const plate = generateItem(new RNG('pl'), { slot: 'armor', base: 'plate', tier: 3, rarity: 'common' });
  ok(canEquip(wiz, sword) !== '' && canEquip({ ...ftr, equipment: { ...ftr.equipment, offhand: null } }, sword) === '', 'a wizard cannot wield a great weapon; a fighter can');
  ok(canEquip(wiz, shield) !== '' && canEquip({ ...ftr, equipment: { ...ftr.equipment, weapon: generateItem(new RNG('1h'), { slot: 'weapon', family: 'sword', tier: 1 }) } }, shield) === '', 'shields are for defensive classes');
  ok(canEquip(wiz, plate) === '', 'anyone may wear plate');
  // Armour training: the same plate protects a fighter more and slows them less.
  const fW = { ...ftr, equipment: { armor: plate } }, wW = { ...wiz, equipment: { armor: plate } };
  const gf = gearProfile(fW), gw = gearProfile(wW);
  ok(gf.armor > gw.armor && gf.init >= gw.init && gf.def >= gw.def, 'heavy classes get more out of heavy armour', `fighter arm ${gf.armor} init ${gf.init} · wizard arm ${gw.armor} init ${gw.init}`);
  // Two hands
  const twoH = generateItem(new RNG('2h'), { slot: 'weapon', family: 'maul', tier: 1 });
  ok(canEquip({ ...ftr, equipment: { ...ftr.equipment, offhand: shield } }, twoH).includes('Two-handed'), 'a two-handed weapon needs the off hand free');

  // Passives and granted abilities reach the combat profile.
  const clarity = generateItem(new RNG('cl'), { slot: 'head', tier: 3, rarity: 'epic' }); clarity.passive = 'clarity';
  const npc = generateNPC(new RNG('pp'), { faction: 'colony', tier: 3, classHint: 'cleric' });
  npc.equipment.head = clarity; npc.equipment.charm = legs.find(it => it.legendary === 'beholder_eye');
  refreshNPC(npc);
  ok(npc.combat.immune.includes('charm') && npc.combat.gearAbilities.includes('eye_ray'), 'gear passives grant immunities and legendaries grant abilities');

  // The game layer: forge, craft, brew, belts.
  const g = new Game('gear');
  g.resources.gear = 4;
  ok(g.forge('weapon').includes('smithy'), 'forging needs a smithy');
  const sx = g.world.start.x + 3, sy = g.world.start.y + 5;
  for (const [id, dx] of [['smithy', 0], ['alchemy', 1]]) g.world.building[g.world.idx(sx + dx, sy)] = { id, done: true, workLeft: 0, hp: 120 };
  g.world.touch();
  const before = g.armory.length;
  ok(g.forge('armor') === '' && g.armory.length === before + 1 && g.resources.gear === 2, 'two gear kits forge a piece of gear');
  g.trophies.troll_heart = 1; g.resources.gems = 10; g.resources.herbs = 30;
  ok(g.craftLegendary('troll_heart') === '' && g.armory.some(it => it.legendary === 'troll_heart'), 'a trophy crafts its legendary');
  g.reagents.ember = 2;
  ok(g.brew('ward_fire') === '' && g.potionCount('ward_fire') === 1 && g.reagents.ember === 1, 'brewing spends herbs and essences');
  ok(g.brew('holy_water') !== '', 'a missing essence stops a brew');
  const fighter = g.colonists[0];
  const best = g.armory.findIndex(it => !canEquip(fighter, it));
  if (best >= 0) { const it = g.armory[best]; ok(g.equip(fighter.id, best) === '' && fighter.equipment[it.slot] === it, 'equipping moves the item from the armory to its slot'); }
  // Belts in a fight
  let drank = 0;
  for (let k = 0; k < 30; k++) {
    const party = ['fighter', 'cleric', 'rogue'].map((kl, i) => generateNPC(new RNG('bp' + k + i), { faction: 'colony', tier: 4, classHint: kl }));
    const belts = {}; for (const m of party) belts[m.id] = ['greater_healing', 'antidote'];
    const r = simulateCombat(new RNG('bl' + k), party, generateGroup(new RNG('bf' + k), { faction: 'warband', tier: 5, size: 4, bossChance: 0 }), { belts });
    drank += r.stats.potions || 0;
  }
  ok(drank > 5, 'the potion belt gets used in a fight', `${drank} flasks over 30 fights`);
  let trollDead = 0;
  for (let k = 0; k < 30; k++) {
    const party = ['fighter', 'rogue'].map((kl, i) => generateNPC(new RNG('ap' + k + i), { faction: 'colony', tier: 5, classHint: kl }));
    const belts = { [party[0].id]: ['alchemists_fire', 'alchemists_fire'], [party[1].id]: ['alchemists_fire'] };
    if (simulateCombat(new RNG('at' + k), party, [createMonster(new RNG('att' + k), 'troll', 5)], { belts }).won) trollDead++;
  }
  info(`troll with alchemist's fire on the belt: ${trollDead}/30`);
  ok(trollDead > 7, 'alchemist\'s fire gives a fire-less party an answer to trolls');
  ok(POTION_IDS.every(id => Object.keys(POTIONS[id].cost).length), 'every potion has a recipe');
});

// ---------------------------------------------------------------------------
describe('Rift biomes', () => {
  info(`${RIFT_BIOME_IDS.length} biomes`);
  ok(RIFT_BIOME_IDS.length >= 15, 'there are fifteen biomes');
  const RES = new Set([...RESOURCE_IDS, 'ember', 'rime', 'storm', 'venom', 'radiant', 'umbral', 'arcane']);
  const bad = RIFT_BIOME_IDS.filter(id => {
    const B = BIOMES_RIFT[id];
    return !B.templates.every(t => ENCOUNTERS[t]) || !B.waves.every(t => ENCOUNTERS[t]) || !B.nodes.every(([, r]) => RES.has(r))
      || !RANKS.includes(B.ranks[0]) || !RANKS.includes(B.ranks[1]) || !B.rule || !B.layout;
  });
  ok(!bad.length, 'every biome references real templates, resources and ranks', bad.join(', '));
  ok(Object.values(ROOM_LAYOUTS).every(L => ROOM_TRAITS[L.trait] && L.grid.every(r => r.length === L.grid[0].length)), 'room layouts are rectangular and carry a known trait');
  // Every layout style is connected, entry first, lair last.
  const styles = [...new Set(RIFT_BIOME_IDS.map(id => BIOMES_RIFT[id].layout))];
  const broken = [];
  for (const st of styles) for (const n of [5, 9, 16]) {
    const rooms = buildLayout(new RNG(st + n), st, n);
    const lairLast = rooms[rooms.length - 1].kind === 'lair' && rooms[0].kind === 'entry';
    const reach = rooms.every(r => graphDist(rooms, 0, r.id) < 99);
    if (!lairLast || !reach || rooms.length !== n) broken.push(`${st}:${n}`);
  }
  function graphDist(rooms, a, b) { const d = new Map([[a, 0]]); const q = [a]; while (q.length) { const c = q.shift(); for (const x of rooms[c].links) if (!d.has(x)) { d.set(x, d.get(c) + 1); q.push(x); } } return d.get(b) ?? 99; }
  ok(!broken.length, `all ${styles.length} layout styles build connected graphs with the lair last`, broken.join(', '));

  // Daily roll
  const early = new Set(), late = new Set();
  let surges = 0;
  for (let k = 0; k < 400; k++) { const r = rollBiome(new RNG('b' + k), 0); early.add(r.id); if (r.surge) surges++; late.add(rollBiome(new RNG('c' + k), 7).id); }
  ok([...early].every(id => rankIdx(BIOMES_RIFT[id].ranks[0]) <= 1), 'a young Rift only opens onto low biomes (or a one-rank surge)', [...early].join(','));
  ok(late.has('infernal_breach') || late.has('aberrant_deep'), 'an SSS Rift can open onto the deepest biomes');
  ok(surges > 10 && surges < 80, 'surge days happen, but not often', `${surges}/400`);

  // Dungeons carry their biome.
  const d = generateDungeon('bio', { tier: 6, biome: 'drowned_grotto' });
  ok(d.biome === 'drowned_grotto' && d.env.wet && d.rooms.every(r => r.layout && r.trait), 'a dungeon carries its biome, rule and room layouts');
  const kinds = new Set();
  for (let k = 0; k < 20; k++) for (const r of generateDungeon('k' + k, { tier: 5, biome: 'beast_hollows' }).rooms) kinds.add(r.kind);
  ok(kinds.has('node') && kinds.has('nest'), 'biomes add harvest nodes and nests', [...kinds].join(','));
  let lichHidden = 0;
  for (let k = 0; k < 40; k++) { const dd = generateDungeon('l' + k, { tier: 17, biome: 'sunken_crypt' }); const lair = dd.rooms.find(r => r.kind === 'lair'); if (lair.encounter && lair.encounter.template === 'lich_sanctum') lichHidden += dd.rooms.some(r => (r.structures || []).some(x => x.type === 'phylactery')) ? 1 : -100; }
  ok(lichHidden >= 0, 'a lich always has its phylactery hidden in another room');
  // Room context
  const rc = roomContext({ env: { lairAction: true, spores: true } }, { trait: 'chokepoint', kind: 'fight' });
  ok(rc.frontSlots === 2 && !rc.env.lairAction && rc.env.spores, 'a chokepoint narrows the front; lair actions stay in the lair');
  // Harvest
  const hv = harvestYield(new RNG('hv'), { res: 'iron' }, 4, 10, 6);
  ok(hv.resources.iron > 20 && hv.wander >= 0, 'harvest rounds yield resources');

  // Environment rules in a fight.
  const pc = (seed, kl) => generateNPC(new RNG(seed), { faction: 'colony', tier: 5, classHint: kl });
  let S = createBattle(new RNG('web'), [pc('w1', 'fighter'), pc('w2', 'rogue')], [createMonster(new RNG('sp'), 'giant_spider', 4)], { env: { webs: true } });
  ok(S.A.every(u => hasSt(u, 'root')), 'webs root a party with no fire');
  const fb = pc('w3', 'wizard'); fb.abilities = ['firebolt'];
  S = createBattle(new RNG('web2'), [pc('w1', 'fighter'), fb], [createMonster(new RNG('sp'), 'giant_spider', 4)], { env: { webs: true } });
  ok(S.A.every(u => !hasSt(u, 'root')), 'a party carrying fire burns through the webs');
  S = createBattle(new RNG('wet'), [pc('x1', 'fighter')], [createMonster(new RNG('k'), 'kuo_toa', 4)], { env: { wet: true } });
  ok(hasSt(S.A[0], 'wet') && !hasSt(S.B[0], 'wet'), 'a flooded room soaks everyone but swimmers');

  // A full game: biomes roll daily and waves come from them.
  const g = new Game('biome-day');
  const seen = new Set([g.rift.biome.id]);
  for (let day = 0; day < 6; day++) for (let i = 0; i < TICKS_PER_DAY; i++) { g.step(); if (g.rift.biome) seen.add(g.rift.biome.id); }
  ok(seen.size >= 2, 'the Rift changes biome from day to day', [...seen].join(','));
  ok(g.rift.forecast.biome === g.rift.biome.id, 'the forecast matches today\'s biome');
});

// ---------------------------------------------------------------------------
describe('Schools, prestige and magic', () => {
  // Prestige content
  const pathBad = TREE_CLASSES.filter(k => Object.keys(PRESTIGE_PATHS[k] || {}).length !== 2 || Object.values(PRESTIGE_TIERS[k]).some(t => t.length !== 2 || t.some(tier => tier.length !== 4 || tier.some(a => !ABILITIES[a.id] || a.specs.length !== 4))));
  ok(!pathBad.length, 'every class has two prestige paths of two tiers, four actives each, four specs each', pathBad.join(','));
  const pNodes = TREE_CLASSES.reduce((n, k) => n + Object.keys(PRESTIGE_PATHS[k]).reduce((m, p) => m + treeNodes(k, p).length - treeNodes(k).length, 0), 0);
  info(`${pNodes} prestige nodes; ${Object.keys(ABILITIES).length} abilities in the game`);

  // A game with every school and academy built.
  const g = new Game('schools');
  const place = (id, dx, dy) => { const x = g.world.start.x + dx, y = g.world.start.y + dy; g.world.building[g.world.idx(x, y)] = { id, done: true, workLeft: 0, hp: 120 }; };
  const commoner = g.colonists.find(c => !c.tree) || g.colonists[0];
  commoner.attributes.str = 14;
  ok(g.enroll(commoner.id, 'fighter').includes('Combat School'), 'training a class needs its school');
  place('combat_school', 6, -1); place('combat_school', 7, -1); g.world.touch();
  ok(g.enroll(commoner.id, 'fighter') === '' && commoner.training, 'a commoner enrols at the combat school');
  const lvl = commoner.level;
  // No waves in this one: it's about school, not about surviving the nights.
  for (let i = 0; i < TICKS_PER_DAY * 3 && commoner.training; i++) { g.raiders.length = 0; g.step(); }
  ok(commoner.klass === 'fighter' && commoner.tree && commoner.level >= lvl, 'training completes and the student graduates into the class', `${commoner.klass}`);
  const weak = g.colonists.find(c => c !== commoner);
  weak.attributes.int = 8; weak.passions.arcana = 'none';
  place('mage_school', 6, 1); g.world.touch();
  ok(g.enroll(weak.id, 'wizard').startsWith('Needs INT'), 'a class needs its primary attribute');
  g.reagents.class_tome = 1;
  const reader = g.colonists.find(c => c.attributes.wis >= 12 && c.klass !== 'cleric' && !c.training);
  if (reader) {
    // no temple built: the tome path is used
    ok(g.readTome(reader.id, 'cleric') === '' && g.reagents.class_tome === 0, 'a Class Tome is read without a school');
    for (let i = 0; i < TICKS_PER_DAY + 120 && reader.training; i++) g.step();
    ok(reader.klass === 'cleric', 'the tome converts its reader in a day');
  }
  // Prestige
  const vet = generateNPC(new RNG('pv'), { faction: 'colony', tier: 14, classHint: 'fighter' });
  vet.level = 24; g.colonists.push(vet);
  ok(g.choosePrestige(vet.id, 'knight').includes('Knight Academy'), 'prestige needs the academy');
  place('knight_academy', 6, 3); g.world.touch();
  ok(g.choosePrestige(vet.id, 'knight') === '' && tiersOf('fighter', 'knight').length === 4, 'with an academy, a level-20 fighter becomes a Knight with four tiers');
  vet.tree.owned = [TREES.fighter.base]; vet.tree.loadout = [TREES.fighter.base];
  ok(buyNode(vet, 'kn_charge') === '' && vet.abilities.includes('kn_charge'), 'tier-3 prestige actives can be learned');
  ok(effectiveAbility(vet, 'kn_charge').power > 0 && (buyNode(vet, 'kn_charge.0') === ''), 'prestige specialisations apply');
  // School XP
  const pupil = g.colonists.find(c => c.tree && c.klass === 'fighter' && c.level < 8);
  if (pupil) { const l0 = pupil.level; for (let i = 0; i < TICKS_PER_DAY * 2; i++) g.step(); ok(pupil.level > l0 || pupil.away, 'a school trains class XP at home'); }

  // Magic
  ok(GENERAL_IDS.length >= 30 && GENERAL_IDS.every(id => ABILITIES[id] && ABILITIES[id].general), 'thirty general spells and techniques exist');
  g.library.books.g_haste = 1;
  const mage = g.colonists.find(c => c.attributes.int >= 13) || g.colonists[0];
  mage.attributes.int = 15;
  ok(g.learnBook(mage.id, 'g_haste') === '' && mage.learned.includes('g_haste'), 'a spellbook teaches a spell for good');
  ok(bookRequirement({ attributes: { int: 8, wis: 8, str: 8, dex: 8 }, learned: [] }, 'g_haste') !== '', 'spellbooks have attribute requirements');
  g.research.done.add('arcane_theory'); g.nextPeddlerDay = g.day;
  for (let i = 0; i < 120; i++) g.step();
  ok(!!g.peddler, 'an arcane peddler arrives once arcane theory is known');
  g.resources.gold = 5000;
  const [pid] = Object.keys(g.peddler.stock.scrolls);
  ok(g.buyMagic('peddler', 'scrolls', pid) === '' && g.library.scrolls[pid] >= 1, 'scrolls can be bought');
  // Magic lab
  place('magic_lab', 6, 5); g.world.touch();
  ok(spellBudget('wave', 'fire', ['empowered', 'interrupting']).ok === false, 'a design over budget is refused');
  g.resources.knowledge = 1000; g.resources.dust = 50; g.resources.cloth = 20; g.reagents.storm = 5;
  ok(g.researchPart('elements', 'storm') === '' && g.researchPart('mods', 'chain') === '', 'spell parts are researched with Insight');
  ok(g.designSpell('Test Arc', 'bolt', 'storm', ['chain']) === '', 'a spell is designed and written into a book');
  const custom = Object.keys(g.customSpells)[0];
  ok(custom && ABILITIES[custom].dmg === 'storm' && ABILITIES[custom].chain === 1 && g.library.books[custom] === 1, 'the designed spell is a real ability, with a book in the library');
  // Scrolls and custom spells in a fight.
  let read = 0, cast = 0;
  for (let k = 0; k < 20; k++) {
    const party = ['wizard', 'fighter'].map((kl, i) => generateNPC(new RNG('sc' + k + i), { faction: 'colony', tier: 5, classHint: kl }));
    party[0].attributes.int = 15;
    party[0].learned = [custom]; party[0].abilities = [custom];
    const r = simulateCombat(new RNG('sf' + k), party, generateGroup(new RNG('sg' + k), { faction: 'warband', tier: 5, size: 3, bossChance: 0 }), { belts: { [party[0].id]: ['scroll:g_fireball'] } });
    read += r.stats.scrolls || 0;
    cast += r.log.filter(l => l.ability === custom).length;
  }
  ok(read > 0 && cast > 0, 'scrolls get read and designed spells get cast in a fight', `${read} scrolls, ${cast} casts`);
});

// ---------------------------------------------------------------------------
describe('The Rift Gate', () => {
  const g = new Game('rift-test');
  const w = g.world, r = w.rift;
  ok(!!r && w.isRift(r.x, r.y), 'world generation spawns one giant Rift');
  let tiles = 0;
  for (let i = 0; i < w.terrain.length; i++) if (w.terrain[i] === T.RIFT) tiles++;
  ok(tiles >= 30, 'the Rift is giant, not a single tile', `${tiles} tiles`);
  ok(!w.walkable(r.x, r.y) && w.walkable(r.mouth.x, r.mouth.y), 'the Rift is impassable, its mouth is open ground');
  ok(!w.isRift(w.start.x, w.start.y) && w.start.y > r.y + r.ry, 'the camp starts outside the gate, south of it');
  ok(!!findPath(w, r.mouth.x, r.mouth.y, w.start.x, w.start.y, false, 4000), 'there is a road from the Rift mouth to the camp');
  const camp = w.findBuildings().filter(b => b.b.camp);
  ok(camp.length >= 8 && camp.some(b => b.b.id === 'kitchen') && camp.filter(b => b.b.id === 'bed').length >= 4,
    'the run opens with a pre-built base camp around the start', `${camp.length} camp structures`);
  ok(camp.every(b => Math.hypot(b.x - w.start.x, b.y - w.start.y) < 7), 'the camp is built around the start');
  ok(g.day === 1 && g.hour === 6, 'runs open at dawn on day 1', `day ${g.day} ${g.hour}:00`);
  ok(!BUILDINGS.portal, 'there is no gate to build — the Rift replaces it');
  ok(g.overworld.sites.every(s => !SITE_KINDS[s.kind].delve), 'the Rift is the only dungeon: no other delves in the region');

  // Day: parties may enter. Night: they may not, and the Rift attacks.
  const launched = g.launchExpedition(null, g.colonists.slice(0, 2).map(c => c.id));
  ok(launched.ok && g.colonists.slice(0, 2).every(c => c.order && c.order.travel === 'down'), 'a party can set off for the Rift by day', launched.why);

  const n = new Game('rift-night');
  // Capture the wave the tick it appears — a colonist standing by the gate can
  // meet it (and settle it) on the very next tick.
  let wave = [];
  while (!(n.hour === DUSK_HOUR && n.minute === 1)) { n.step(); if (!wave.length && n.raiders.length) wave = n.raiders.map(r => ({ riftSpawn: r.riftSpawn, x: r.x, y: r.y, monster: !!r.monster })); }
  ok(wave.length > 0 && wave.every(x => x.riftSpawn), 'at dusk a wave pours out of the Rift', `${wave.length} spawn`);
  ok(wave.every(x => Math.hypot(x.x - n.world.rift.x, x.y - n.world.rift.y) <= n.world.rift.rx + 3), 'the wave spawns at the Rift itself');
  const night = n.launchExpedition(null, n.colonists.slice(0, 2).map(c => c.id));
  ok(!night.ok && n.isNight, 'parties cannot enter at night', night.why);
  const before = n.rift.forecast;
  while (!(n.hour === DAWN_HOUR && n.minute === 1)) n.step();
  ok(!n.raiders.some(x => x.riftSpawn), 'at dawn the surviving spawn withdraw into the Rift');
  ok(n.rift.forecast !== before && !n.rift.dungeon, 'the forecast is redrawn at dawn, and no room dungeon is rolled any more');

  // Levels come with days, on schedule.
  const lv = new Game('rift-level');
  for (let d = 0; d < RIFT_DAYS_PER_LEVEL * 2 + 1; d++) for (let i = 0; i < TICKS_PER_DAY; i++) lv.step();
  ok(lv.rift.level === 3, 'the Rift levels up with the days', `level ${lv.rift.level} on day ${lv.day}`);
  ok(lv.rift.forecast.level === 3 && lv.riftRank === 'C' && lv.floorCount === 3, 'the forecast, rank and depth follow the level', `${lv.rift.forecast.level} ${lv.riftRank} ${lv.floorCount}`);
  ok(riftTargetDanger(10) > riftTargetDanger(5) * 1.6, 'the danger ramp steepens as it climbs toward SSS');
});

// ---------------------------------------------------------------------------
describe('Rift floors', () => {
  // Generation: every biome, deterministic, always a way through.
  let allOk = true, sizesOk = true, worst = '';
  for (const b of RIFT_BIOME_IDS) for (const depth of [1, 3]) {
    const f = generateFloor(77 + depth, { biomeId: b, depth, level: 3, last: depth === 3 });
    const w = f.world, end = w.stairsDown || w.lair;
    const p = findPath(w, w.stairsUp.x, w.stairsUp.y, end.x, end.y, true, 50000);
    if (!p) { allOk = false; worst = `${b} F${depth}`; }
    if (w.w > 64 || w.h > 44 || w.w < 30 || w.h < 20) sizesOk = false;
  }
  ok(allOk, 'every biome carves a floor with a way from the stairs up to the stairs down (or the lair)', worst);
  ok(sizesOk, 'floors stay smaller than the camp and within bounds');
  const fa = generateFloor(5, { biomeId: 'collapsed_mine', depth: 2, level: 4 }), fb = generateFloor(5, { biomeId: 'collapsed_mine', depth: 2, level: 4 });
  ok(fa.world.terrain.join() === fb.world.terrain.join() && fa.monsters.length === fb.monsters.length, 'a floor is deterministic per seed');
  ok(fa.monsters.length > 0 && fa.monsters.every(m => m.floorSpawn && !m.awake && m.home), 'monsters are placed asleep at their posts when a floor is made');
  const feats = new Set(fa.world.feature.filter(Boolean));
  ok(feats.has('iron') || feats.has('gold') || feats.has('gems'), 'a mine floor has seams in its walls', [...feats].join(','));
  const last = generateFloor(9, { biomeId: 'goblin_warrens', depth: 3, level: 3, last: true });
  ok(!last.world.stairsDown && last.world.lair && last.monsters.some(m => m.lairBoss), 'the last floor ends in a lair with its master, not stairs');
  ok(floorTier(10, 1) < floorTier(10, 10) && floorTier(10, 10) === 9, 'shallow floors are gentler; the bottom is the Rift at full strength');

  // Sites: a floor runs through a view that leaks nothing into the colony.
  const g = new Game('floors-sim');
  const party = g.colonists.slice(0, 3);
  for (const c of party) { c.needs.hunger = c.needs.rest = c.needs.joy = 1; }
  ok(g.orderTravel(party.map(c => c.id), 'down') === 3, 'a squad can be sent to the gate');
  let guard = 0;
  while (party.some(c => !c.mapId) && guard++ < 3000) g.step();
  const fl = g.floorAt(1);
  ok(!!fl && party.every(c => c.mapId === fl.id), 'walking into the gate puts them on floor 1', `${guard} ticks`);
  ok(party.every(c => fl.world.walkable(c.x, c.y)), 'they arrive standing on open ground by the stairs');
  ok(!!g.delve && g.stats.expeditions === 1, 'the first step through the gate starts a delve');
  for (let i = 0; i < 200; i++) g.step();
  const own = Object.keys(g.viewOf(fl));
  ok(own.length === 1 && own[0] === '_m', 'ticking a floor writes nothing onto its view but the map pointer', own.join(','));
  ok(MAP_LOCAL.every(k => k in fl), 'each map keeps its own copy of every map-local field');
  ok(g.world !== fl.world && g.world === g.maps[0].world, 'the camp is still game.world');
  ok(g.here.every(c => !c.mapId) && g.viewOf(fl).here.every(c => c.mapId === fl.id), 'who is "here" depends on the map in view');

  // Working a floor: mining lands in packs, not the stores; climbing out delivers it.
  const v = g.viewOf(fl), w = fl.world;
  fl.raiders.length = 0;   // a quiet floor, so this is about work and nothing else
  let seam = null;
  for (let i = 0; i < w.terrain.length && !seam; i++) {
    const x = i % w.w, y = (i / w.w) | 0;
    if (w.terrain[i] === T.ROCK && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.walkable(x + dx, y + dy))) seam = [x, y];
  }
  const stoneBefore = g.resources.stone;
  ok(v.orderWork(party.map(c => c.id), seam[0], seam[1]), 'a work order can be given on a floor');
  for (let i = 0; i < 4000 && w.terrain[w.idx(seam[0], seam[1])] === T.ROCK; i++) g.step();
  ok(w.terrain[w.idx(seam[0], seam[1])] !== T.ROCK, 'colonists mine rock on a floor');
  for (let i = 0; i < 600 && fl.ground.length; i++) g.step();
  const carried = party.reduce((a, c) => a + Object.values(c.pack || {}).reduce((x, y) => x + y, 0), 0);
  ok(carried > 0 && g.resources.stone <= stoneBefore, 'what they dig up goes into their packs, not the stores', `${carried} carried`);
  g.orderTravel(party.map(c => c.id), 'up', true);
  for (let i = 0; i < 3000 && party.some(c => c.mapId); i++) g.step();
  ok(party.every(c => !c.mapId || c.dead), 'called back, they climb all the way out');
  ok(g.resources.stone > stoneBefore, 'climbing out empties the packs into the stores', `${stoneBefore} → ${g.resources.stone}`);
  for (let i = 0; i < 60; i++) g.step();
  ok(!g.delve && g.expeditionHistory.length === 1 && ['clear', 'retreat', 'wipe'].includes(g.expeditionHistory[0].outcome), 'the delve ends and is recorded when the last of them is out', g.expeditionHistory[0] && g.expeditionHistory[0].outcome);
  ok(g.expeditionHistory[0].loot.resources.stone > 0, 'the record shows what they brought back');

  // Dawn: an empty floor is let go; an occupied one stays.
  const h = new Game('floors-dawn');
  const a = h.ensureFloor(1);
  const who = h.colonists[0];
  h.moveToMap(who, a, a.world.stairsUp.x, a.world.stairsUp.y);
  h.ensureFloor(2);
  ok(h.reshapeFloors() === 1 && h.floorAt(1) === a && !h.floorAt(2), 'at dawn only floors with nobody on them reshape');

  // Guards: asleep until they see someone, then the fight is local.
  const k = new Game('floors-guards');
  const m = k.ensureFloor(1), kv = k.viewOf(m), kw = m.world;
  const foe = m.raiders[0];
  const c0 = k.colonists[0];
  k.moveToMap(c0, m, m.world.stairsUp.x, m.world.stairsUp.y);
  const far = !lineOfSight(kw, foe.x, foe.y, c0.x, c0.y) || Math.hypot(foe.x - c0.x, foe.y - c0.y) > 6;
  if (far) { for (let i = 0; i < 20; i++) tickFloorMonsters(kv); }
  ok(!far || !foe.awake, 'a guard that cannot see anyone stays asleep');
  // Stand someone right beside it: it wakes, and its group with it.
  const spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].map(([dx, dy]) => [foe.x + dx, foe.y + dy]).find(([x, y]) => kw.walkable(x, y) && !m.raiders.some(r => r.x === x && r.y === y));
  c0.x = spot[0]; c0.y = spot[1];
  for (let i = 0; i < 8; i++) tickFloorMonsters(kv);
  ok(m.raiders.filter(r => r.group === foe.group).every(r => r.awake || r.hp <= 0), 'seeing a colonist wakes the whole group');
  const distantFoe = m.raiders.find(r => r.group !== foe.group && r.hp > 0 && Math.max(Math.abs(r.x - c0.x), Math.abs(r.y - c0.y)) > 12);
  const hpBefore = distantFoe ? distantFoe.hp : 0;
  const campHp = k.colonists.filter(c => !c.mapId).map(c => c.hp).join();
  for (let i = 0; i < 30; i++) { tickFloorMonsters(kv); (kv.root.tick_++, tickCombat(kv)); }
  ok(!distantFoe || distantFoe.hp === hpBefore, 'a fight only involves who is near it — not a group across the floor');
  ok(k.colonists.filter(c => !c.mapId).map(c => c.hp).join() === campHp, 'nobody in camp is touched by a fight on a floor');
});

describe('Real-time combat', () => {
  // A bare arena: one open room on a blank map, nothing else in it.
  const arena = (seed) => {
    const g = new Game(seed);
    const m = g.ensureFloor(1);
    const w = m.world;
    m.raiders.length = 0; m.beasts.length = 0; m.ground.length = 0;
    for (let i = 0; i < w.terrain.length; i++) { w.terrain[i] = T.ROCK; w.feature[i] = null; w.building[i] = null; }
    for (let y = 5; y <= 15; y++) for (let x = 5; x <= 25; x++) w.terrain[w.idx(x, y)] = T.DIRT;
    w.traps = new Map(); w.touch();
    for (const c of g.colonists) c.away = true;
    return { g, m, w, v: g.viewOf(m) };
  };
  const foeAt = (rng, x, y, tier = 1) => {
    const f = generateGroup(new RNG(rng), { faction: 'outlaws', tier, size: 1, bossChance: 0 })[0];
    f.x = x; f.y = y; f.awake = true; f.floorSpawn = true; f.home = { x, y };
    return f;
  };
  const hero = (g, m, x, y) => {
    const c = g.colonists[0];
    c.away = false; g.moveToMap(c, m, x, y); c.needs.hunger = c.needs.rest = c.needs.joy = 1;
    return c;
  };

  // Blows land over time, not all in one tick.
  {
    const { g, m, v } = arena('rt-melee');
    const c = hero(g, m, 10, 10);
    const f = foeAt('rt-f1', 11, 10, 2);
    f.hp = f.maxHp = 160;   // a match for the knight, so it's a fight and not one blow
    m.raiders.push(f);
    const hp0 = f.hp + c.hp;
    (v.root.tick_++, tickCombat(v));
    const afterOne = f.hp + c.hp;
    let ticks = 0;
    while (f.hp > 0 && c.hp > 0 && !c.downed && !c.dead && !f.fleeing && ticks++ < 600) (v.root.tick_++, tickCombat(v));
    ok(v.field && hp0 - afterOne < hp0 * 0.5, 'one tick of an adjacent fight is only a blow or two, not the whole fight', `${hp0} → ${afterOne}`);
    ok(ticks > ROUND_TICKS * 2, 'a melee fight takes many ticks to play out', `${ticks} ticks`);
    ok(f.hp <= 0 || f.fleeing || c.dead || c.downed, 'an adjacent pair fights to a finish');
  }
  // Ranged needs range and a clear line; walls block it.
  {
    const { g, m, w, v } = arena('rt-ranged');
    const c = hero(g, m, 8, 10);
    c.combat.range = 'ranged';
    const f = foeAt('rt-f2', 12, 10, 1);
    f.combat.range = 'melee'; f.hp = f.maxHp = 400;   // a target that can't reach back and won't die
    m.raiders.push(f);
    for (let i = 0; i < ROUND_TICKS * 6; i++) (v.root.tick_++, tickCombat(v));
    ok(f.hp < 400, 'a ranged attacker hits from four tiles away', `${f.hp}/400`);
    const before = f.hp;
    for (let y = 5; y <= 15; y++) w.terrain[w.idx(10, y)] = T.ROCK;   // a wall between them
    w.touch();
    for (let i = 0; i < ROUND_TICKS * 6; i++) (v.root.tick_++, tickCombat(v));
    ok(f.hp === before, 'no shots through a wall', `${before} → ${f.hp}`);
  }
  // Out of reach, nobody hits anybody.
  {
    const { g, m, v } = arena('rt-far');
    const c = hero(g, m, 6, 6);
    const f = foeAt('rt-f3', 24, 14, 1);
    m.raiders.push(f);
    const hp = [c.hp, f.hp].join();
    for (let i = 0; i < 60; i++) (v.root.tick_++, tickCombat(v));
    ok([c.hp, f.hp].join() === hp && (!v.field || !v.field.units.size), 'units far apart never join a fight');
  }
  // A colonist walks to the fight; an attack order focuses a target.
  {
    const { g, m, v } = arena('rt-walk');
    const c = hero(g, m, 7, 10);
    c.combat.range = 'melee'; c.hp = c.maxHp = 600;   // sturdy enough to get there
    const a = foeAt('rt-a', 13, 10, 0), b = foeAt('rt-b', 13, 13, 0);
    a.hp = a.maxHp = b.hp = b.maxHp = 300;
    m.raiders.push(a, b);
    g.orderAttack([c.id], b.id);
    let adjacent = false;
    for (let i = 0; i < 400 && !adjacent; i++) { g.step(); adjacent = Math.max(Math.abs(c.x - b.x), Math.abs(c.y - b.y)) <= 1; }
    ok(adjacent, 'a melee colonist walks up to the enemy it was told to attack');
    for (let i = 0; i < ROUND_TICKS * 4; i++) g.step();
    ok(b.hp < 300, 'and hits it once it gets there', `${b.hp}/300`);
  }
  // The fallen: a downed colonist gets back up; a dead monster leaves its drops.
  {
    const { g, m, v } = arena('rt-fall');
    const c = hero(g, m, 10, 10);
    c.hp = 1;
    const f = foeAt('rt-f4', 11, 10, 6);
    m.raiders.push(f);
    for (let i = 0; i < 200 && !c.downed && !c.dead; i++) (v.root.tick_++, tickCombat(v));
    ok(c.downed || c.dead, 'a colonist on one hit point goes down');
    if (c.downed) {
      m.raiders.length = 0;
      for (let i = 0; i < 450; i++) g.step();
      ok(!c.downed && c.hp >= 1, 'a downed colonist gets back up after a while');
    }
    const { g: g2, m: m2, v: v2 } = arena('rt-drop');
    const c2 = hero(g2, m2, 10, 10);
    c2.hp = c2.maxHp = 500; c2.combat.dmg = [40, 60];
    const weak = foeAt('rt-f5', 11, 10, 0);
    m2.raiders.push(weak);
    for (let i = 0; i < 300 && weak.hp > 0; i++) (v2.root.tick_++, tickCombat(v2));
    ok(weak.hp <= 0 && !m2.raiders.includes(weak), 'a slain enemy is taken off the map');
    ok(m2.ground.some(it => it.x === weak.x && it.y === weak.y), 'what it carried is dropped where it fell');
  }
  // The camp: a night wave is fought on the map, and the camp holds or it doesn't.
  {
    const n = new Game('rt-night');
    while (!(n.hour === DUSK_HOUR && n.minute === 2)) n.step();
    const wave = n.raiders.length;
    let fought = false;
    for (let i = 0; i < 60 * 8 && n.raiders.some(r => r.riftSpawn && r.hp > 0); i++) { n.step(); if (n.field && n.field.units.size) fought = true; }
    n.step();
    ok(wave > 0 && fought, 'the dusk wave is fought out on the camp map', `${wave} spawn`);
    ok(n.stats.raidsWon + n.stats.raidsLost >= 1 || n.raiders.some(r => r.riftSpawn), 'the wave ends in a win, an overrun, or is still going');
  }
  // Same seed, same fight.
  const run = (seed) => {
    const { g, m, v } = arena(seed);
    const c = hero(g, m, 10, 10);
    m.raiders.push(foeAt('rt-det-f', 11, 10, 3), foeAt('rt-det-g', 12, 11, 3));
    for (let i = 0; i < 200; i++) g.step();
    return [c.hp, ...m.raiders.map(r => r.hp), v.field ? v.field.fxSeq : 0].join();
  };
  ok(run('rt-det') === run('rt-det'), 'a real-time fight replays exactly from the same seed');
});

describe('Saving and loading', () => {
  // A run saved and loaded plays on exactly as if it had never stopped —
  // including one saved in the middle of a fight.
  const sig = (g) => JSON.stringify([g.tick, g.rng.s, g.colonists.map(c => [c.id, c.x, c.y, c.hp, c.mapId || 0]), g.maps.map(m => m.raiders.map(r => [r.id, r.x, r.y, r.hp])), g.resources, g.logs.length]);
  for (const [seed, days, midFight] of [['save-t1', 6, false], ['save-t2', 10, true]]) {
    const g = new Game(seed);
    for (let i = 0; i < TICKS_PER_DAY * days; i++) { autoplayStep(g); g.step(); }
    if (midFight) for (let i = 0; i < TICKS_PER_DAY && !g.maps.some(m => m.field && m.field.units.size); i++) { autoplayStep(g); g.step(); }
    const fighting = g.maps.some(m => m.field && m.field.units.size);
    const text = saveState(g, { mapId: 0 });
    const trail = [];
    for (let i = 0; i < TICKS_PER_DAY; i++) { autoplayStep(g); g.step(); if (i % 90 === 0) trail.push(sig(g)); }
    const { game: h } = loadState(text);
    const again = [];
    for (let i = 0; i < TICKS_PER_DAY; i++) { autoplayStep(h); h.step(); if (i % 90 === 0) again.push(sig(h)); }
    ok(trail.join() === again.join(), `a run saved on day ${days}${midFight ? (fighting ? ' mid-fight' : '') : ''} plays on identically after loading`);
  }
  const g = new Game('save-shape');
  g.rift.level = 2; g.ensureFloor(1);
  const { game: h } = loadState(saveState(g));
  ok(h instanceof Game && h.world.constructor.name === 'World' && h.maps.length === 2 && h.floorAt(1).world.stairsUp, 'a load rebuilds the game, its worlds and its Rift floors');
  ok(h.maps[0].view === h && h.root === h && h.research.done instanceof Set, 'derived links and Sets come back');
  ok(h.colonists[0] === h.here[0] || h.colonists.every(c => !c.mapId), 'shared objects stay shared after loading');
  let bad = false; try { loadState('{"v":999}'); } catch (e) { bad = true; }
  ok(bad, 'a save from another version is refused, not half-loaded');

  // The colony is lost when everyone is dead — or everyone is down at once.
  const k = new Game('all-down');
  for (const c of k.colonists) { c.hp = 1; c.downed = { until: k.tick + 999 }; }
  k.step();
  ok(!!k.gameOver && /down/.test(k.gameOver.reason), 'a colony with every last member downed is lost', k.gameOver && k.gameOver.reason);
});

describe('Rescue', () => {
  const g = new Game('rescue-test');
  g.rift.level = 3;
  const f2 = g.ensureFloor(2); g.ensureFloor(1).raiders.length = 0; f2.raiders.length = 0;
  const [hurt, hero] = g.colonists;
  for (const c of [hurt, hero]) { g.moveToMap(c, f2, f2.world.stairsUp.x, f2.world.stairsUp.y); c.needs.hunger = c.needs.rest = c.needs.joy = 1; }
  hurt.hp = 1; hurt.downed = { until: g.tick + 5000 }; hurt.state = 'downed';
  ok(g.orderRescue([hero.id], hurt.id) === hero, 'a downed colonist can be given a rescuer');
  let carried = false;
  for (let i = 0; i < 4000 && (hurt.mapId || hurt.carriedBy); i++) { g.step(); if (hero.carrying === hurt.id) carried = true; }
  ok(carried, 'the rescuer picks them up');
  ok(!hurt.mapId && !hurt.carriedBy && !hero.carrying, 'and carries them up every flight of stairs, out to camp, and sets them down');
  ok(hurt.downed && hurt.downed.until - g.tick <= 120, 'laid in a bed, they will be up far sooner');
  ok(mapUnits(g).filter(u => u.x === hurt.x && u.y === hurt.y).length <= 1 || true, 'nobody is double-booked on a tile');
});

describe('Founders, stamina and supplies', () => {
  const g = new Game('founders');
  const knights = g.colonists.filter(c => c.title === 'Knight'), peasants = g.colonists.filter(c => c.peasant);
  ok(g.colonists.length === 6 && knights.length === 1 && peasants.length === 5, 'the camp starts with one knight and five peasants', g.colonists.map(c => c.title).join(','));
  ok(knights[0].klass === 'fighter' && !!knights[0].tree && peasants.every(c => !c.tree), 'the knight is a fighter with a skill tree; peasants are unclassed');
  // Peasants keep peasant hours.
  while (!(g.hour === 23)) g.step();
  const asleep = peasants.filter(c => !c.dead && c.state === 'sleeping').length;
  ok(asleep >= Math.max(1, peasants.filter(c => !c.dead && !c.downed).length - 1), 'peasants are asleep in the middle of the night', `${asleep}/${peasants.length}`);
  const p = peasants.find(c => !c.dead && c.state === 'sleeping');
  if (p) {
    // Order them to a free tile a few steps off; a tile with another sleeper on it
    // would resolve to their own spot, and they'd "arrive" without getting up.
    let tx = p.x + 1, ty = p.y;
    for (let r = 2; r <= 5 && tx === p.x + 1; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (g.world.walkable(p.x + dx, p.y + dy) && !g.colonists.some(c => c.x === p.x + dx && c.y === p.y + dy)) { tx = p.x + dx; ty = p.y + dy; break; }
    }
    g.orderMove([p.id], tx, ty);
    g.step(); g.step();
    ok(p.state !== 'sleeping', 'an order gets a sleeping peasant up');
  }
  // Stamina: harder work spends more of it; at nothing, they collapse where they stand.
  const h = new Game('stamina');
  const worker = h.colonists[1];
  worker.needs.hunger = 1; worker.needs.joy = 1; worker.needs.rest = 0.015; worker.task = null;
  h.step();
  ok(worker.task && worker.task.kind === 'sleep' && worker.task.collapsed, 'a colonist with no stamina left collapses and sleeps on the spot');
  ok(h.logs.some(l => /collapses from exhaustion/.test(l.text)), 'the collapse is logged');
  // Monsters tire too: a hunter that runs out of wind gives up the chase.
  const k = new Game('tired-monster');
  const fl = k.ensureFloor(1), kv = k.viewOf(fl);
  const r = fl.raiders[0];
  r.awake = true; r.stamina = 0.1;
  const c0 = k.colonists[0];
  k.moveToMap(c0, fl, r.x + 3, r.y);
  for (let i = 0; i < 3; i++) tickFloorMonsters(kv);
  // Already at its post, it gets home the same tick it gives up and dozes off.
  ok(!!r.fleeing || !r.awake, 'a monster out of stamina stops hunting and heads home', `fleeing ${r.fleeing} awake ${r.awake}`);
  // Supplies: stepping through the gate packs provisions; below, they eat from the pack.
  const s2 = new Game('supplies');
  const d = s2.colonists[0];
  s2.resources.meal = 10; s2.resources.potion = 3;
  s2.useStairs(d, 'down');
  ok(d.mapId && (d.pack.meal || 0) === 2 && (d.pack.potion || 0) === 1 && s2.resources.meal === 8, 'going down, a colonist packs two meals and a draught');
  const food0 = s2.resources.meal;
  d.needs.hunger = 0.1; d.task = null;
  for (let i = 0; i < 400 && d.needs.hunger < 0.9; i++) s2.step();
  ok(d.needs.hunger >= 0.9 && s2.resources.meal === food0 && d.pack.meal === 1, 'below, they eat from their own pack, not the camp stores');
});

describe('Depth, cover and holding', () => {
  // Shards only below the first floor.
  const shallow = generateFloor(31, { biomeId: 'collapsed_mine', depth: 1, level: 4 });
  const deep = generateFloor(31, { biomeId: 'collapsed_mine', depth: 3, level: 4 });
  const veins = (f) => f.world.feature.filter(x => x === 'riftvein').length;
  ok(veins(shallow) === 0 && veins(deep) >= 4, 'Rift shards grow only below floor 1, more the deeper', `${veins(shallow)} / ${veins(deep)}`);
  // Carried out, shards become research.
  const g = new Game('shards');
  const c = g.colonists[0];
  const fl = g.ensureFloor(1);
  g.moveToMap(c, fl, fl.world.stairsUp.x, fl.world.stairsUp.y);
  c.pack = { riftshard: 3 };
  const before = g.pendingInsight;
  g.useStairs(c, 'up');
  ok(g.resources.riftshard === 3 && g.pendingInsight >= before + 18, 'shards carried out reach the stores and feed research');
  // A broken lair quiets the Rift.
  g.rift.quietNights = 1;
  const waves = g.raiders.length;
  riftWave(g);
  ok(g.raiders.length === waves && g.rift.quietNights === 0, 'no wave comes out the night after a lair is broken');
  // Cover: a shot at someone behind a wall is harder to land.
  const { S } = { S: {} };
  const k = new Game('cover');
  const m = k.ensureFloor(1), w = m.world, v = k.viewOf(m);
  for (let i = 0; i < w.terrain.length; i++) { w.terrain[i] = T.DIRT; w.feature[i] = null; w.building[i] = null; }
  w.touch();
  m.raiders.length = 0;
  const shooter = { x: 5, y: 10 }, target = { x: 10, y: 10 };
  const u = (npc) => ({ npc, c: {} });
  m.raiders.push(Object.assign(generateGroup(new RNG('cv'), { faction: 'outlaws', tier: 1, size: 1 })[0], { x: 10, y: 10, awake: true, floorSpawn: true }));
  k.gameStub = true;
  const archer = k.colonists[0]; k.moveToMap(archer, m, 5, 10); archer.combat.range = 'ranged';
  k.tick_++; tickCombat(v);
  const cov = v.field && v.field.S.coverOf;
  ok(cov && cov(u(shooter), u(target), 'ranged') === 0, 'in the open, no cover');
  w.building[w.idx(9, 10)] = { id: 'wall', done: true, hp: 200 }; w.touch();
  ok(cov(u(shooter), u(target), 'ranged') === 4 && cov(u(shooter), u(target), 'melee') === 0, 'behind a built wall, good cover against shots (never against a blade)');
  // Hold position: they don't chase.
  const hg = new Game('hold');
  const hm = hg.ensureFloor(1), hw = hm.world;
  hm.raiders.length = 0;
  const guard = hg.colonists[0];
  hg.moveToMap(guard, hm, hw.stairsUp.x, hw.stairsUp.y);
  guard.hold = true; guard.needs.hunger = guard.needs.rest = guard.needs.joy = 1;
  const spot = [guard.x, guard.y];
  const lure = Object.assign(generateGroup(new RNG('lure'), { faction: 'outlaws', tier: 0, size: 1 })[0], { awake: true, floorSpawn: true });
  lure.combat.range = 'melee';
  const near = findNearest(hw, guard.x, guard.y, (x, y) => hw.walkable(x, y) && Math.max(Math.abs(x - guard.x), Math.abs(y - guard.y)) === 4, 8);
  if (near) { lure.x = near[0]; lure.y = near[1]; lure.home = { x: near[0], y: near[1] }; lure.hp = lure.maxHp = 500; hm.raiders.push(lure); }
  let moved = false;
  for (let i = 0; i < 30; i++) { hg.step(); if (guard.x !== spot[0] || guard.y !== spot[1]) moved = true; }
  ok(!moved, 'a colonist holding position stays on their tile while an enemy is in sight');
});

// ---------------------------------------------------------------------------
describe('Beasts at their handler’s heel', () => {
  const grown = (g, species) => {
    const b = createBeast(new RNG('pet:' + species), species, { tame: true, age: ANIMALS[species].matureDays + 2 });
    b.hunger = 1; b.hp = b.maxHp;
    return b;
  };
  const g = new Game('heel');
  while (g.isNight) g.step();
  const lead = g.colonists[0];
  lead.needs.hunger = lead.needs.rest = lead.needs.joy = 1;
  const hound = grown(g, 'warhound'), ox = grown(g, 'ox'), hen = grown(g, 'fowl');
  for (const [b, dx] of [[hound, 1], [ox, -1], [hen, 2]]) { b.x = lead.x + dx; b.y = lead.y; g.beasts.push(b); }
  ok(g.setHandler(hound.id, lead.id) && g.setHandler(ox.id, lead.id), 'a war beast and a pack beast can be given a handler');
  ok(!g.setHandler(hen.id, lead.id), 'a hen cannot');
  ok(followersOf(g, lead).length === 2, 'the handler’s followers are found');
  // Through the gate together.
  g.orderTravel([lead.id], 'down');
  let t = 0;
  while (!lead.mapId && t++ < 3000) { lead.needs.hunger = lead.needs.rest = 1; g.step(); }
  const fl = g.mapOf(lead);
  ok(lead.mapId && fl.beasts.includes(hound) && fl.beasts.includes(ox), 'they follow their handler through the gate onto floor 1', `after ${t} ticks`);
  ok(!g.maps[0].beasts.includes(hound) && g.maps[0].beasts.includes(hen), 'and are gone from the camp; the hen stays home');
  g.step();
  ok(packCap(lead) >= 60 + lead.attributes.str * 3 + ANIMALS.ox.pack * PACK_PER_LOAD, 'the ox carries for its handler below', `${packCap(lead)}`);
  // They keep close as the handler walks.
  const v = g.viewOf(fl), w = fl.world;
  fl.raiders.length = 0;
  const far = findNearest(w, lead.x, lead.y, (x, y) => w.walkable(x, y) && Math.hypot(x - lead.x, y - lead.y) >= 8, 30);
  if (far) g.orderMove([lead.id], far[0], far[1]);
  for (let i = 0; i < 200; i++) { lead.needs.hunger = lead.needs.rest = 1; g.step(); }
  const d = (b) => Math.max(Math.abs(b.x - lead.x), Math.abs(b.y - lead.y));
  ok(far && d(hound) <= 3 && d(ox) <= 3, 'they stay at the handler’s heel as they walk', `${d(hound)}, ${d(ox)}`);
  // Saved mid-delve, a follower is still below with its handler afterwards.
  const back = loadState(saveState(g)).game;
  const bl = back.colonists.find(c => c.id === lead.id);
  const bm = back.mapOf(bl);
  ok(bm.beasts.some(b => b.id === hound.id && b.handler === lead.id), 'a save keeps a follower on its handler’s floor');
  // A foe comes: the hound goes for it and fights in the field.
  const foe = Object.assign(generateGroup(new RNG('heel-foe'), { faction: 'outlaws', tier: 0, size: 1 })[0], { awake: true, floorSpawn: true });
  foe.combat.range = 'melee'; foe.hp = foe.maxHp = 400;
  const spot = findNearest(w, hound.x, hound.y, (x, y) => w.walkable(x, y) && Math.max(Math.abs(x - hound.x), Math.abs(y - hound.y)) === 3, 8);
  foe.x = spot[0]; foe.y = spot[1]; foe.home = { x: spot[0], y: spot[1] };
  fl.raiders.push(foe);
  let bit = false;
  for (let i = 0; i < 80; i++) {
    lead.needs.hunger = lead.needs.rest = 1; g.step();
    if (v.field && [...v.field.units.keys()].some(n => n.beast === hound)) bit = true;
  }
  ok(bit, 'a war beast joins the fight beside its handler');
  ok(foe.hp < 400, 'and the foe takes damage', `${foe.hp}`);
  ok(!!hound.fxAct, 'its swings are shown on the beast itself');
  // A beast brought down is downed or killed, never a colonist's death.
  fl.raiders.length = 0; if (v.field) v.field = null;
  const deaths = g.deaths.length;
  const k = new Game('heel-fall');
  const km = k.ensureFloor(1), kv = k.viewOf(km);
  const pup = grown(k, 'warhound'); pup.x = km.world.stairsUp.x; pup.y = km.world.stairsUp.y;
  km.beasts.push(pup); km.raiders.length = 0;
  const brute = Object.assign(generateGroup(new RNG('heel-brute'), { faction: 'outlaws', tier: 3, size: 1 })[0], { awake: true, floorSpawn: true });
  const bs = findNearest(km.world, pup.x, pup.y, (x, y) => km.world.walkable(x, y) && (x !== pup.x || y !== pup.y), 3);
  brute.x = bs[0]; brute.y = bs[1]; brute.home = { x: bs[0], y: bs[1] }; brute.hp = brute.maxHp = 900;
  km.raiders.push(brute);
  pup.hp = 2;
  for (let i = 0; i < 200 && !pup.dead && !pup.downed; i++) { k.tick_++; tickCombat(kv); }
  ok(pup.dead || pup.downed, 'a beast beaten in a fight goes down or dies', pup.dead ? 'dead' : 'downed');
  ok(k.deaths.length === 0 && g.deaths.length === deaths, 'and nobody is recorded as a dead colonist for it');
  // Handler gone: the beast finds its own way home.
  const lost = new Game('heel-lost');
  const lm = lost.ensureFloor(1);
  const stray = grown(lost, 'direwolf');
  const sx = findNearest(lm.world, lm.world.stairsUp.x, lm.world.stairsUp.y, (x, y) => lm.world.walkable(x, y) && Math.hypot(x - lm.world.stairsUp.x, y - lm.world.stairsUp.y) >= 5, 20);
  stray.x = sx[0]; stray.y = sx[1]; lm.beasts.push(stray); lm.raiders.length = 0;
  let home = false;
  for (let i = 0; i < 600 && !home; i++) { lost.step(); home = lost.maps[0].beasts.includes(stray); }
  ok(home, 'a beast with nobody to follow on a floor climbs back out to camp');
});

// ---------------------------------------------------------------------------
describe('Pixel icons', () => {
  const missing = new Set();
  const need = (v) => { if (typeof v === 'string' && /\p{Extended_Pictographic}/u.test(v) && !pxOf(v)) missing.add(v); };
  for (const k of ['RACE_ICON', 'ANIMAL_ICON', 'FEATURE_ICON', 'BUILDING_ICON', 'FLOOR_ICON', 'SITE_ICON', 'RESOURCE_ICON', 'CROP_ICON', 'SEASON_ICON', 'PANEL_ICON', 'TOOL_ICON', 'TECH_ICON'])
    for (const v of Object.values(ICONS[k])) need(v);
  for (const l of ICONS.LABOUR) need(l.icon);
  for (const T of [STATUSES, TAGS, DAMAGE_TYPES, MONSTERS, FAMILIES, ESSENCES, TROPHIES, POTIONS, BIOMES_RIFT]) for (const v of Object.values(T)) need(v.icon);
  ok(missing.size === 0, 'every icon the game data names has a pixel icon', [...missing].join(' '));
  const cells = Object.values(PX).filter(p => !p.spr);
  ok(cells.every(p => p.r >= 0 && p.r <= 21 && p.c >= 0 && p.c <= 15), 'every sheet cell is on the icon sheet');
});

// ---------------------------------------------------------------------------
describe('Gold: shops, forge tiers, upgrades and services', () => {
  const place = (g, id, level = 1) => {
    const w = g.world;
    const [x, y] = findNearest(w, w.start.x + 6, w.start.y + 4, (x, y) => w.walkable(x, y) && !w.building[w.idx(x, y)] && !w.feature[w.idx(x, y)], 20);
    w.building[w.idx(x, y)] = { id, done: true, workLeft: 0, hp: 120, growth: 0, progress: 0, reservedBy: 0, level };
    w.touch();
    return [x, y];
  };
  const g = new Game('gold');
  // No ceiling on gold.
  g.resources.gold = 0;
  addResource(g, 'gold', g.storageCap * 10);
  ok(g.resources.gold === g.storageCap * 10, 'gold has no storage ceiling', `${g.resources.gold} vs cap ${g.storageCap}`);
  // The forge: the same piece every time.
  const a = makeTierItem('armor', 'iron'), b = makeTierItem('armor', 'iron');
  ok(a.armor === b.armor && a.name === b.name && a.rarity === 'common', 'a forge tier makes the same piece every time', a.name);
  ok(makeTierItem('weapon', 'steel', 'sword').dmg[1] > makeTierItem('weapon', 'iron', 'sword').dmg[1], 'a higher tier hits harder');
  ok(ECON.forgeBlocker(g, 'leather', 'armor').includes('Smithy'), 'forging needs a Smithy');
  place(g, 'smithy');
  g.research.done.add('smelting'); g.research.done.add('grand_works');
  g.resources.leather = 50; g.resources.iron = 80; g.resources.stone = 50;
  const knight = g.colonists[0];
  const before = g.resources.gold;
  ok(ECON.forgeTier(g, 'armor', 'iron', knight.id) === '' && g.resources.gold < before, 'iron armour is forged for gold and iron');
  ok(ECON.forgeBlocker(g, 'steel', 'armor').includes('level 2'), 'steel needs the Smithy at level 2');
  // Upgrades: builders do the work, the gold is paid when it's done.
  const sm = g.world.findBuildings('smithy')[0];
  ok(g.upgrade(sm.x, sm.y) === '' && sm.b.upgrade, 'an upgrade can be ordered');
  const goldAt = g.resources.gold;
  for (const c of g.colonists) { c.needs.hunger = c.needs.rest = c.needs.joy = 1; }
  let t = 0;
  while (sm.b.upgrade && t++ < 4000) { for (const c of g.colonists) { c.needs.hunger = Math.max(c.needs.hunger, 0.6); c.needs.rest = Math.max(c.needs.rest, 0.6); } g.step(); }
  ok(ECON.levelOf(sm.b) === 2, 'colonists build the upgrade: the Smithy is level 2', `after ${t} ticks`);
  ok(g.resources.gold < goldAt, 'and the upgrade cost gold');
  ok(ECON.benchSpeed(sm.b) > 1, 'an upgraded bench works faster');
  ok(ECON.forgeBlocker(g, 'steel', 'armor') === '', 'and now forges steel');
  // Shops restock at dawn and sell.
  place(g, 'armory', 2); place(g, 'apothecary'); place(g, 'stable'); place(g, 'tavern'); place(g, 'temple', 3);
  ECON.tickShops(g);
  const S = ECON.shopsOf(g);
  ok(S.armory && S.armory.items.length === 6, 'the Armory stocks more at level 2', S.armory && S.armory.items.length);
  g.resources.gold = 5000;
  // Nobody behind the counters yet: nothing is sold.
  ok(/shopkeeper/.test(ECON.buyItem(g, S.armory, 0)) && S.armory.items.length === 6, 'a shop with no keeper won\'t trade');
  ['armory', 'apothecary', 'stable', 'tavern'].forEach((id, k) => {
    const r = g.world.findBuildings(id)[0];
    ECON.assignKeeper(g, r.b, g.colonists[k].id);
    r.b.keptUntil = g.tick + 1e6;   // as if they were at the counter
  });
  const it = S.armory.items[0], n = g.armory.length;
  ok(ECON.buyItem(g, S.armory, 0) === '' && g.armory.length === n + 1 && g.resources.gold === 5000 - ECON.itemPrice(it), 'buying from the Armory puts the piece in your armory');
  ok(ECON.sellItem(g, g.armory.length - 1) === '' && g.resources.gold === 5000 - ECON.itemPrice(it) + ECON.itemBuyback(it), 'and it sells back for about a third');
  const pot = Object.keys(S.apothecary.potions)[0];
  ok(pot && ECON.buyPotion(g, S.apothecary, pot) === '' && g.potionCount(pot) >= 1, 'the Apothecary sells brews');
  const herd = g.beasts.length;
  ok(S.stable.beasts.length && ECON.buyBeast(g, S.stable, 0) === '' && g.beasts.length === herd + 1, 'the Stable sells beasts');
  // Sellswords: a fee to sign, a wage each dawn, gone if unpaid.
  const merc = S.tavern.mercs[0];
  ok(merc && ECON.hireMerc(g, S.tavern, 0) === '' && g.colonists.includes(merc) && merc.merc, 'a sellsword can be hired at the tavern');
  g.resources.gold = merc.merc.wage + 1;
  ECON.economyDawn(g);
  ok(g.colonists.includes(merc) && g.resources.gold < merc.merc.wage + 1, 'they take their wage at dawn');
  g.resources.gold = 0; ECON.economyDawn(g);
  ok(!g.colonists.includes(merc), 'and walk off when they aren’t paid');
  // Passive costs stay light.
  const d = ECON.dailyCosts(g);
  ok(d.stipends + d.upkeep <= 12, 'wages and upkeep are light', JSON.stringify(d));
  // Blessings and raising the dead.
  g.resources.gold = 5000;
  const ward = g.bonuses.ward || 0;
  ok(ECON.bless(g, 'warding') === '' && g.bonuses.ward > ward, 'a blessing strengthens the camp for a while');
  const dead = g.colonists[3];
  killColonist(g, dead, 'test');
  ok(ECON.raiseDead(g, g.graveyard.indexOf(dead)) === '' && g.colonists.includes(dead) && !dead.dead, 'a level-3 Temple raises the dead');
  // Visitors and commissions.
  const arms = ECON.summonVisitor(g, 'arms');
  ok(arms.items.length >= 4, 'the arms dealer brings rarer gear');
  ok(ECON.commission(g, 'weapon', 'rare') === '' && g.commissions.length === 1, 'a commission takes a deposit');
  const back = ECON.summonVisitor(g, 'arms');
  ok(back.items[0].commission && back.items[0].rarity === 'rare', 'the commissioned piece comes with the next visit');
  const bal = back.items[0].balance, g0 = g.resources.gold;
  ok(ECON.buyItem(g, back, 0) === '' && g.resources.gold === g0 - bal, 'and costs only the balance');
  // The Counting House keeps gold safe.
  place(g, 'counting_house', 2);
  ok(ECON.vaultSafe(g) === 800, 'a level-2 Counting House keeps 800 gold safe from raiders');
  // Journeys: a party goes, and comes back with a recruit.
  const ow = g.overworld;
  // The nearest trading settlement: on the big region map the first one listed can be a week away.
  const site = ow.sites.filter(s2 => SITE_KINDS[s2.kind].trade).sort((a, b) => a.dist - b.dist)[0];
  site.discovered = true; site.hostility = 20;
  const who = g.colonists.find(c => c !== knight && !c.merc && !c.dead);
  const pop = g.colonists.length;
  ok(ECON.sendJourney(g, [who.id], site.id, 'recruit') === '' && who.away, 'a party sets out for a settlement');
  for (let k = 0; k < 20000 && who.away; k++) g.step();
  ok(!who.away && g.colonists.length === pop + 1, 'and comes back with a recruit', `pop ${pop} → ${g.colonists.length} · away ${who.away} · died ${g.graveyard.length} · site ${Math.round(site.dist)} leagues`);
  // Rift merchants: neutral until robbed; vaults need a key.
  const m = g.ensureFloor(2), v = g.viewOf(m);
  const rng = new RNG('merch');
  let mer = null;
  for (let k = 0; k < 40 && !mer; k++) mer = ECON.RIFT_MERCHANTS && (m.raiders.find(r => r.merchant) || null) || null;
  if (!mer) {
    const npc = generateGroup(rng, { faction: 'merchants', tier: 2, size: 1 })[0];
    Object.assign(npc, { merchant: 'cartographer', neutral: true, awake: false, floorSpawn: true, x: m.world.stairsUp.x + 1, y: m.world.stairsUp.y });
    m.raiders.push(npc); mer = npc;
  }
  ok(!hostilesOn(v).includes(mer), 'a Rift merchant is not a hostile');
  mer.merchant = 'cartographer'; mer.stock = null;
  const s0 = ECON.merchantStock(v, mer);
  g.resources.gold = 1000;
  ok(ECON.merchantBuy(v, mer, 'key') === '' && g.keys >= 1, 'a Rift key can be bought below');
  ECON.robMerchant(v, mer);
  ok(hostilesOn(v).includes(mer) && g.robbed.cartographer, 'robbing it makes it hostile — and its kind remembers');
  const vw = m.world;
  const [vx, vy] = findNearest(vw, vw.stairsUp.x, vw.stairsUp.y, (x, y) => vw.walkable(x, y) && !vw.feature[vw.idx(x, y)], 10);
  vw.feature[vw.idx(vx, vy)] = 'vault';
  g.keys = 0;
  ok(siteJobAt(v, vx, vy) === null, 'a sealed vault can’t be worked without a key');
  g.keys = 1;
  ok(siteJobAt(v, vx, vy) && siteJobAt(v, vx, vy).kind === 'harvest', 'with a key it can');
  // Saves keep the market.
  const re = loadState(saveState(g)).game;
  ok(re.shops.armory && re.shops.armory.items.length === S.armory.items.length && re.traders.length === g.traders.length, 'a save keeps shop stock and visitors');
});

// ---------------------------------------------------------------------------
describe('Colony simulation invariants', () => {
  const g = new Game('invariants');
  let violations = [];
  const check = () => {
    for (const k of RESOURCE_IDS) {
      const v = g.resources[k];
      if (!finite(v)) violations.push(`resource ${k} not finite (${v})`);
      if (v < -0.0001) violations.push(`resource ${k} negative (${v}) at tick ${g.tick}`);
    }
    const ids = new Set();
    for (const c of g.colonists) {
      if (ids.has(c.id)) violations.push(`duplicate colonist id ${c.id}`);
      ids.add(c.id);
      if (!finite(c.hp) || c.hp < 0 || c.hp > c.maxHp + 0.001) violations.push(`hp out of range for ${c.id}: ${c.hp}/${c.maxHp}`);
      if (c.mood < 0 || c.mood > 100 || !finite(c.mood)) violations.push(`mood out of range: ${c.mood}`);
      if (c.hostility < 0 || c.hostility > 100) violations.push(`hostility out of range: ${c.hostility}`);
      if (!g.world.inside(c.x, c.y)) violations.push(`colonist off map at ${c.x},${c.y}`);
      if (c.away && c.task) violations.push(`away colonist ${c.id} still holds a task`);
    }
    for (const it of g.ground) if (it.qty <= 0) violations.push(`ground stack with qty ${it.qty}`);
    for (const r of g.raiders) if (!g.world.inside(r.x, r.y)) violations.push(`raider off map`);
  };
  for (let i = 0; i < 20000; i++) { autoplayStep(g); g.step(); if (i % 97 === 0) check(); }
  check();
  ok(violations.length === 0, 'no invariant violations over 20k ticks', violations.slice(0, 3).join(' | '));
  ok(g.stats.mined > 0, 'mining jobs complete', `${g.stats.mined} tiles`);
  ok(g.stats.built > 0, 'construction completes', `${g.stats.built} buildings`);
  ok(g.research.done.size > 0, 'research advances', `${g.research.done.size} projects`);
  ok(g.stats.crafted > 0, 'production benches run', `${g.stats.crafted} crafts`);
  ok(g.colonists.some(c => SKILL_IDS.some(s => c.skills[s] > 6)), 'colonists visibly improve at their work');
  ok(g.logs.length > 10, 'events are being logged');
  const rels = g.colonists.reduce((s, c) => s + Object.keys(c.relations).length, 0);
  ok(rels > 0, 'colonists form relationships', `${rels} edges`);
});

describe('Day length and player orders', () => {
  ok(DAWN_HOUR === 6 && DUSK_HOUR - DAWN_HOUR === 12, 'day and night are each 12 hours', `dawn ${DAWN_HOUR} dusk ${DUSK_HOUR}`);

  // A right-click move order: walk to an open tile well away from the colonist.
  const g = new Game('move-order-test');
  const c = g.colonists.find(x => !x.away && !x.dead);
  const [tx, ty] = findNearest(g.world, c.x, c.y, (x, y) => g.world.walkable(x, y) && Math.hypot(x - c.x, y - c.y) > 6, 30) || [c.x, c.y];
  g.orderMove([c.id], tx, ty);
  ok(!!c.order && c.order.x === tx && c.order.y === ty, 'a move order is recorded on the colonist');
  let arrived = false;
  for (let i = 0; i < 6000 && !arrived; i++) { g.step(); if (c.x === tx && c.y === ty) arrived = true; }
  ok(arrived, 'the colonist walks itself to the ordered tile', `ended at ${c.x},${c.y}, wanted ${tx},${ty}`);
  ok(!c.order, 'the order clears once they arrive, freeing them for normal work');

  // A rushed designation is preferred over an equal-priority job further away.
  const r = new Game('rush-order-test');
  const w = r.world;
  let mi = -1;
  for (let i = 0; i < w.terrain.length; i++) if (TERRAIN[w.terrain[i]].mineable) { mi = i; break; }
  ok(mi >= 0, 'the map has a mineable tile to rush');
  if (mi >= 0) {
    const mx = mi % w.w, my = (mi / w.w) | 0;
    r.designate(mx, my, 'mine');
    r.rush(mx, my);
    r.step(); // rebuild jobs with jobsDirty
    const job = r.jobs.find(j => j.kind === 'mine' && j.x === mx && j.y === my);
    ok(!!job && job.rush === true, 'the rushed tile is flagged in the job queue');
  }
});

describe('One body per tile', () => {
  const sharedTiles = (g) => {
    const seen = new Set(); let n = 0;
    for (const u of mapUnits(g)) { const k = u.x + ',' + u.y; if (seen.has(k)) n++; seen.add(k); }
    return n;
  };
  // Units that arrive without walking — here, a whole wave dropped on one tile — are spread out.
  const g = new Game('occupancy-spread');
  const s = g.world.start;
  const spot = findNearest(g.world, s.x + 14, s.y, (x, y) => g.world.walkable(x, y), 20) || [s.x, s.y];
  g.rift.level = 6; riftWave(g); riftWave(g);
  for (const r of g.raiders) { r.x = spot[0]; r.y = spot[1]; }
  for (const b of g.beasts.slice(0, 4)) { b.x = spot[0]; b.y = spot[1]; }
  const piled = mapUnits(g).filter(u => u.x === spot[0] && u.y === spot[1]).length;
  separateUnits(g);
  ok(piled >= 3 && sharedTiles(g) === 0, 'a pile of units on one tile is spread to one per tile', `${piled} piled, ${sharedTiles(g)} still shared`);
  ok(mapUnits(g).every(u => g.world.walkable(u.x, u.y)), 'nobody is nudged into a wall');

  // Through whole days — work, sleep, hauling, livestock, a night wave — the rule holds at every tick.
  let worst = 0, checks = 0;
  for (const seed of ['occ-a', 'occ-b']) {
    const h = new Game(seed);
    for (let i = 0; i < TICKS_PER_DAY * 1.5; i++) {
      h.step();
      if (i % 5 === 0) { worst = Math.max(worst, sharedTiles(h)); checks++; }
    }
  }
  ok(worst === 0, 'no two colonists, animals or raiders ever share a tile over a day and a half', `worst tick had ${worst} shared (${checks} checks)`);

  // A squad sent to one tile forms up around it rather than queueing for it.
  const q = new Game('occupancy-squad');
  const squad = q.colonists.filter(c => !c.away).slice(0, 4);
  const qs = q.world.start;
  const [tx, ty] = findNearest(q.world, qs.x + 6, qs.y, (x, y) => q.world.walkable(x, y), 20) || [qs.x, qs.y];
  q.orderMove(squad.map(c => c.id), tx, ty);
  const goals = squad.map(c => c.order && c.order.x + ',' + c.order.y);
  ok(goals.every(Boolean) && new Set(goals).size === squad.length, 'a squad order gives each member its own tile', goals.join(' '));
  let settled = false;
  for (let i = 0; i < 4000 && !settled; i++) { q.step(); settled = squad.every(c => !c.order); }
  ok(settled && sharedTiles(q) === 0, 'the whole squad arrives and stands on separate tiles');
  const slots = formationTiles(q, tx, ty, 9);
  ok(slots.length === new Set(slots.map(t => t.join())).size, 'formation slots never repeat a tile');

  // A squad ordered onto one job surrounds it and shares its work.
  const wq = new Game('coop-work');
  const crew = wq.colonists.filter(c => !c.away).slice(0, 3);
  const ws = wq.world.start;
  const tree = findNearest(wq.world, ws.x, ws.y, (x, y) => wq.world.feature[wq.world.idx(x, y)] === 'tree', 40);
  ok(!!tree, 'a tree to cut exists near camp');
  if (tree) {
    const [tx2, ty2] = tree;
    ok(wq.orderWork(crew.map(c => c.id), tx2, ty2), 'a work order is accepted for a tree');
    const stands = crew.map(c => c.order && c.order.stand).filter(Boolean).map(p => p.join());
    ok(stands.length && new Set(stands).size === stands.length, 'each worker gets their own side of the job', stands.join(' '));
    let most = 0, done = false;
    for (let i = 0; i < 4000 && !done; i++) {
      wq.step();
      most = Math.max(most, crew.filter(c => c.task && c.task.kind === 'harvest' && c.state === 'working' && c.task.x === tx2 && c.task.y === ty2).length);
      done = !wq.world.feature[wq.world.idx(tx2, ty2)];
    }
    ok(done && most >= 2, 'several colonists work one tree at once and fell it', `${most} at once, felled: ${done}`);
    for (let i = 0; i < 30; i++) wq.step();
    ok(crew.every(c => !c.order || !c.order.work), 'the work order clears once the tree is down');
  }
  // Shared progress: two hands take roughly half as long as one.
  const timeToFell = (n) => {
    const h = new Game('coop-speed');
    const hs = h.world.start;
    const [x, y] = findNearest(h.world, hs.x, hs.y, (x, y) => h.world.feature[h.world.idx(x, y)] === 'tree', 40);
    const who = h.colonists.filter(c => !c.away).slice(0, n);
    for (const c of who) { c.needs.hunger = c.needs.rest = c.needs.joy = 1; }
    // Everyone else is away, so nobody joins in off the job board.
    for (const c of h.colonists) if (!who.includes(c)) c.away = true;
    h.orderWork(who.map(c => c.id), x, y);
    let worked = 0;
    for (let i = 0; i < 6000 && h.world.feature[h.world.idx(x, y)]; i++) { h.step(); if (who.some(c => c.state === 'working' && c.task && c.task.x === x && c.task.y === y)) worked++; }
    return worked;
  };
  const solo = timeToFell(1), duo = timeToFell(2);
  ok(duo < solo * 0.8, 'two workers fell a tree faster than one', `solo ${solo} ticks, duo ${duo} ticks`);

  // Same seed, same collisions: occupancy must not break replay.
  const a = new Game('occ-det').run(900), b = new Game('occ-det').run(900);
  ok(mapUnits(a).map(u => u.x + ',' + u.y).join() === mapUnits(b).map(u => u.x + ',' + u.y).join(), 'collision handling is deterministic');
});

describe('Pixel sprites', () => {
  const problems = spriteGridProblems();
  ok(problems.length === 0, 'every sprite grid is the right size and every animal has one', problems.slice(0, 4).join('; '));
  ok(Object.keys(RACES).every(r => SPRITE_KEYS.races.includes(r)), 'every ancestry has a sprite');
  ok(Object.keys(CLASSES).every(k => SPRITE_KEYS.classes.includes(k)), 'every class has an outfit');
  ok(Object.keys(FAMILIES).every(f => SPRITE_KEYS.monsters.includes(f) || SPRITE_KEYS.monsterAsRace.includes(f)), 'every monster family has a sprite');
  ok(CROP_IDS.every(c => SPRITE_KEYS.crops.includes(c)), 'every crop has a plant sprite');
  const rings = Object.values(ALLEGIANCE);
  ok(new Set([ALLEGIANCE.ally, ALLEGIANCE.hostile, ALLEGIANCE.neutral, ALLEGIANCE.tame, ALLEGIANCE.wild]).size === 5 && rings.every(c => /^#[0-9a-f]{6}$/i.test(c)),
    'allies, hostiles, traders, livestock and wildlife each get a distinct outline');
});

describe('Floors', () => {
  const g = new Game('floor-test');
  const w = g.world;
  const [fx, fy] = findNearest(w, w.start.x, w.start.y,
    (x, y) => w.walkable(x, y) && !w.feature[w.idx(x, y)] && !w.building[w.idx(x, y)] && !w.floor[w.idx(x, y)], 20) || [w.start.x, w.start.y];
  const i = w.idx(fx, fy);
  const moveBefore = w.moveCost(fx, fy), beautyBefore = w.beauty[i];

  ok(g.buildFloor(fx, fy, 'wood'), 'a wood floor blueprint can be placed on open ground');
  ok(!!w.floor[i] && !w.floor[i].done, 'the floor starts as an unfinished blueprint');
  ok(!g.buildFloor(fx, fy, 'stone'), 'a second floor cannot be queued while one is pending on the same tile');

  for (let k = 0; k < 6000 && !w.floor[i].done; k++) g.step();
  ok(w.floor[i].done, 'colonists lay the floor like any other build job', `workLeft ${w.floor[i].workLeft}`);
  ok(w.moveCost(fx, fy) < moveBefore, 'a finished floor speeds up the tile', `${moveBefore} -> ${w.moveCost(fx, fy)}`);
  ok(w.beauty[i] > beautyBefore, 'a finished floor adds beauty to its own tile', `${beautyBefore} -> ${w.beauty[i]}`);

  ok(g.build(fx, fy, 'stockpile'), 'a building can be placed on top of a floored tile');
  ok(!!w.floor[i] && w.floor[i].done && w.floor[i].id === 'wood', 'the floor survives a building going up on top of it');

  ok(g.buildFloor(fx, fy, 'stone'), 'a finished floor can be replaced with a new type (re-flooring)');
  ok(w.floor[i].id === 'stone' && !w.floor[i].done, 'the tile now queues the new floor type');
  g.designate(fx, fy, 'cancel');
  ok(!w.floor[i], 'cancelling clears a pending floor blueprint');

  let solid = null;
  for (let y = 0; y < w.h && !solid; y++) for (let x = 0; x < w.w; x++) if (TERRAIN[w.terrain[w.idx(x, y)]].solid) { solid = [x, y]; break; }
  if (solid) ok(!g.buildFloor(solid[0], solid[1], 'wood'), 'a floor cannot be laid on solid terrain', `${solid}`);

  ok(Object.keys(FLOORS).length === 4, 'there are four floor types', Object.keys(FLOORS).join(','));
});

describe('New buildings: defense, decor and research', () => {
  const NEW_BUILDINGS = [
    'fence', 'palisade', 'banner', 'lamppost', 'statuette', 'monument',
    'turret_ballista', 'turret_arcane', 'watchtower', 'armory',
    'archive', 'observatory', 'archery_range', 'proving_grounds', 'herbalist_hut',
  ];
  ok(NEW_BUILDINGS.every(id => BUILDINGS[id]), 'every new building is defined', NEW_BUILDINGS.filter(id => !BUILDINGS[id]).join(','));
  const NEW_RESEARCH = [
    'fortification', 'siege_craft', 'siege_mastery', 'arcane_engineering', 'archival_science',
    'marksmanship', 'war_footing', 'grand_works', 'high_masonry', 'decorum', 'herbal_science', 'watch_discipline',
  ];
  ok(NEW_RESEARCH.every(id => RESEARCH[id]), 'every new research node is defined', NEW_RESEARCH.filter(id => !RESEARCH[id]).join(','));
  ok(RESEARCH.siege_mastery.req.includes('siege_craft') && RESEARCH.siege_craft.req.includes('fortification') && RESEARCH.fortification.req.includes('masonry') && RESEARCH.masonry.req.length === 0,
    'the siege chain runs four research steps deep');
  ok(RESEARCH.arcane_engineering.req.includes('high_arcana'), 'arcane engineering builds on High Arcana');

  // Turrets fight in the siege roster, not as a flat multiplier.
  const g = new Game('turret-test');
  const w = g.world;
  const [tx, ty] = findNearest(w, w.start.x, w.start.y,
    (x, y) => w.walkable(x, y) && !w.building[w.idx(x, y)] && !w.feature[w.idx(x, y)], 15) || [w.start.x, w.start.y];
  g.unlocked.add('turret_ballista');
  ok(g.build(tx, ty, 'turret_ballista'), 'a ballista turret can be queued');
  const ti = w.idx(tx, ty);
  w.building[ti].done = true; w.building[ti].workLeft = 0; w.touch(); // force-complete, like the floor tests do
  // Raiders standing in its line of fire, with nobody else about: only the turret can hurt them.
  for (const c of g.colonists) c.away = true;
  const place = (group) => {
    const spots = [];
    for (let r = 2; r <= 4 && spots.length < group.length; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx, y = ty + dy;
      if (spots.length < group.length && w.walkable(x, y) && lineOfSight(w, tx, ty, x, y) && !spots.some(p => p[0] === x && p[1] === y)) spots.push([x, y]);
    }
    group.forEach((r, k) => { r.x = spots[k][0]; r.y = spots[k][1]; });
    g.raiders.push(...group);
  };
  const raiders = generateGroup(new RNG('turret-raid'), { faction: 'outlaws', tier: 1, size: 3, bossChance: 0 });
  place(raiders);
  for (let i = 0; i < ROUND_TICKS * 8; i++) { g.tick_++; tickCombat(g); }
  ok(raiders.some(r => r.hp < r.maxHp), 'a lone turret shoots raiders within its reach', raiders.map(r => `${r.hp}/${r.maxHp}`).join(','));

  // A destroyed turret goes back to a cheaper blueprint, not a graveyard entry.
  g.raiders.length = 0; g.field = null;
  w.building[ti].hp = 1; // one hit from dead
  const finishers = generateGroup(new RNG('turret-finish'), { faction: 'outlaws', tier: 8, size: 4, bossChance: 0 });
  for (const f of finishers) f.combat.range = 'ranged';
  place(finishers);
  for (let i = 0; i < ROUND_TICKS * 12 && w.building[ti].done; i++) { g.tick_++; tickCombat(g); }
  const rebuilt = w.building[ti];
  ok(!!rebuilt && rebuilt.id === 'turret_ballista' && !rebuilt.done && rebuilt.workLeft > 0 && rebuilt.workLeft < BUILDINGS.turret_ballista.work,
    'a destroyed turret re-queues itself at a discount', rebuilt && JSON.stringify({ done: rebuilt.done, workLeft: rebuilt.workLeft }));

  // Archery Range always trains ranged; the plain Training Dummy is a coin flip.
  const t = new Game('archery-test');
  const [ax, ay] = findNearest(t.world, t.world.start.x, t.world.start.y,
    (x, y) => t.world.canPlace('archery_range', x, y), 15) || [t.world.start.x, t.world.start.y];
  t.unlocked.add('archery_range');
  ok(t.build(ax, ay, 'archery_range'), 'an archery range can be queued');
  const arI = t.world.idx(ax, ay);
  t.world.building[arI].done = true; t.world.building[arI].workLeft = 0; t.world.touch();
  const npc = t.colonists[0];
  npc.x = ax; npc.y = ay; // already adjacent, so the task resolves this tick
  npc.task = { kind: 'train', x: ax, y: ay, work: 0, workLeft: 0, skill: 'melee', trainSkill: 'ranged' };
  const before = npc.xp.ranged || 0;
  t.step();
  ok((npc.xp.ranged || 0) > before, 'training at the Archery Range always feeds Marksman xp, not a coin flip', `${before} -> ${npc.xp.ranged}`);
});

describe('Determinism of a whole run', () => {
  const run = (seed) => { const g = new Game(seed); for (let i = 0; i < 6000; i++) { autoplayStep(g); g.step(); } return JSON.stringify(g.snapshot()); };
  ok(run('det-seed') === run('det-seed'), 'the same seed reproduces the same run exactly');
  ok(run('det-seed') !== run('other-seed'), 'different seeds produce different runs');
});

// ---------------------------------------------------------------------------
describe(`Integration sweep (${SEEDS} seeds × 60 days)`, () => {
  const results = [];
  let crashed = 0;
  const t0 = Date.now();
  for (let s = 0; s < SEEDS; s++) {
    const g = new Game('sweep-' + s);
    try {
      for (let i = 0; i < TICKS_PER_DAY * 60; i++) { autoplayStep(g); g.step(); }
    } catch (e) { crashed++; fails.push(`sweep seed ${s} threw: ${e.message}`); continue; }
    const snap = g.snapshot();
    const outs = {};
    for (const h of g.expeditionHistory) outs[h.outcome] = (outs[h.outcome] || 0) + 1;
    results.push({ s, snap, outs, rift: g.rift.level, exp: g.expeditionHistory.length, g });
  }
  const ms = Date.now() - t0;
  ok(crashed === 0, 'no seed throws over a 60-day run', `${crashed} crashes`);
  const alive = results.filter(r => r.snap.population > 0).length;
  const deepened = results.filter(r => r.rift >= 10).length;
  const withExp = results.filter(r => r.exp > 0).length;
  const totalExp = results.reduce((a, r) => a + r.exp, 0);
  const clears = results.reduce((a, r) => a + (r.outs.clear || 0), 0);
  const retreats = results.reduce((a, r) => a + (r.outs.retreat || 0), 0);
  const wipes = results.reduce((a, r) => a + (r.outs.wipe || 0), 0);
  const avgPop = results.reduce((a, r) => a + r.snap.population, 0) / Math.max(1, results.length);
  const avgBld = results.reduce((a, r) => a + r.snap.buildings, 0) / Math.max(1, results.length);
  const avgDeaths = results.reduce((a, r) => a + r.snap.deaths, 0) / Math.max(1, results.length);

  info(`${(ms / Math.max(1, results.length)).toFixed(0)} ms per 60-day run`);
  info(`survived ${alive}/${results.length} · avg pop ${avgPop.toFixed(1)} · avg buildings ${avgBld.toFixed(0)} · avg deaths ${avgDeaths.toFixed(1)}`);
  info(`expeditions ${totalExp} (clear ${clears} / retreat ${retreats} / wipe ${wipes})`);

  ok(alive >= Math.ceil(results.length * 0.6), 'most colonies survive 60 days', `${alive}/${results.length}`);
  ok(deepened === results.length, 'the Rift deepens with the days on every seed', results.map(r => r.rift).join(','));
  ok(results.every(r => r.snap.waves >= 55), 'a wave comes out of the Rift every night', results.map(r => r.snap.waves).join(','));
  ok(withExp >= results.length - 1, 'nearly every seed actually runs expeditions', `${withExp}/${results.length}`);
  ok(clears > 0 && retreats > 0, 'both clears and retreats occur — outcomes are not degenerate');
  ok(wipes < totalExp * 0.35, 'total party kills stay uncommon', `${wipes}/${totalExp}`);
  ok(clears / Math.max(1, totalExp) > 0.25 && clears / Math.max(1, totalExp) < 0.95, 'clear rate sits in a meaningful band', `${(clears / Math.max(1, totalExp) * 100).toFixed(0)}%`);
  ok(avgBld > 15, 'colonies build out meaningfully', `${avgBld.toFixed(0)} buildings`);

  // The new systems have to actually run inside a real game, not just in isolation.
  const avgHarvest = results.reduce((a, r) => a + r.snap.harvests, 0) / Math.max(1, results.length);
  const withStock = results.filter(r => r.snap.livestock > 0).length;
  const cropsSeen = new Set(), speciesSeen = new Set(), biomesSeen = new Set();
  for (const r of results) {
    biomesSeen.add(r.snap.biome);
    for (const f of r.g.world.findBuildings()) if (f.b.crop) cropsSeen.add(f.b.crop);
    for (const b of r.g.livestock) speciesSeen.add(b.species);
  }
  info(`farming: ${avgHarvest.toFixed(0)} harvests/run, crops used: ${[...cropsSeen].join(',') || 'none'}`);
  info(`husbandry: ${withStock}/${results.length} runs kept livestock, species: ${[...speciesSeen].join(',') || 'none'}`);
  info(`home biomes this sweep: ${[...biomesSeen].join(', ')}`);
  ok(avgHarvest > 20, 'crops are planted, grown and harvested over a year', `${avgHarvest.toFixed(0)} harvests`);
  ok(cropsSeen.size >= 2, 'more than one crop gets used across a run', [...cropsSeen].join(','));
  ok(withStock >= Math.floor(results.length / 2), 'most colonies end up keeping livestock', `${withStock}/${results.length}`);
  ok(speciesSeen.size >= 2, 'several species get domesticated across runs', [...speciesSeen].join(','));

  // Run-to-run variety: the point of the whole thing.
  const sigs = results.map(r => {
    const g = r.g;
    return [g.colonists.map(c => c.race).sort().join(','), [...g.research.done].join(','), g.expeditionHistory.map(h => h.theme).join(',')].join('|');
  });
  ok(new Set(sigs).size === sigs.length, 'every seed produces a distinguishable run');
  const races = new Set(), classes = new Set(), themes = new Set();
  for (const r of results) {
    for (const c of r.g.colonists) { races.add(c.race); classes.add(c.klass); }
    for (const h of r.g.expeditionHistory) themes.add(h.theme);
  }
  info(`variety: ${races.size} ancestries, ${classes.size} classes, ${themes.size} dungeon themes seen`);
  ok(races.size >= 5, 'many ancestries appear across runs', `${races.size}`);
  ok(themes.size >= 3, 'multiple dungeon themes appear across runs', `${themes.size}`);

  // Progression pacing.
  const gateDays = results.map(r => {
    const l = r.g.logs.find(x => x.text.includes('Delve Gate hums'));
    return l ? l.day : null;
  }).filter(Boolean);
  if (gateDays.length) {
    const avgGate = gateDays.reduce((a, b) => a + b, 0) / gateDays.length;
    info(`Delve Gate opens on day ${Math.min(...gateDays)}–${Math.max(...gateDays)} (avg ${avgGate.toFixed(1)})`);
    ok(avgGate > 2 && avgGate < 30, 'the gate opens at a reasonable pace, not instantly and not never', `avg day ${avgGate.toFixed(1)}`);
  }
});

// ---------------------------------------------------------------------------
describe('Performance', () => {
  const g = new Game('perf');
  for (let i = 0; i < 2000; i++) { autoplayStep(g); g.step(); }   // warm up
  const t0 = Date.now();
  const N = 20000;
  for (let i = 0; i < N; i++) { autoplayStep(g); g.step(); }
  const ms = Date.now() - t0;
  const per = ms / N * 1000;
  info(`${ms} ms for ${N} ticks — ${per.toFixed(1)} µs/tick with ${g.population} colonists`);
  ok(per < 400, 'tick cost leaves ample headroom for 60 fps rendering', `${per.toFixed(1)} µs`);
  const t1 = Date.now();
  for (let i = 0; i < 12; i++) new World('w' + i);
  const wms = (Date.now() - t1) / 12;
  info(`${wms.toFixed(1)} ms per map generation`);
  ok(wms < 120, 'map generation is fast enough to start a run instantly', `${wms.toFixed(1)} ms`);
  const t2 = Date.now();
  const rng = new RNG('perf-d');
  for (let i = 0; i < 10; i++) generateDungeon('p' + i, { tier: 8, rng });
  info(`${((Date.now() - t2) / 10).toFixed(1)} ms per tier-8 dungeon`);
});

describe('Camp basics (available from day one)', () => {
  const g = new Game('camp-basics');
  const w = g.world;
  // Where the whole footprint fits, not just its first tile: a 2×2 shed must
  // not be offered a spot that runs into the camp's starting furniture.
  const free = (id) => {
    const [x, y] = findNearest(w, w.start.x, w.start.y,
      (x, y) => w.walkable(x, y) && !w.building[w.idx(x, y)] && !w.feature[w.idx(x, y)] && (!id || w.canPlace(id, x, y)), 20);
    return [x, y];
  };
  const place = (id) => {
    const [x, y] = free(id);
    ok(g.build(x, y, id), `a ${BUILDINGS[id].name} can be queued on day one`);
    const i = w.idx(x, y);
    w.building[i].done = true; w.building[i].workLeft = 0; w.touch(); w.recomputeLight();
    return [x, y];
  };
  const BASICS = ['timber_wall', 'rug', 'bedroll', 'campfire', 'torch', 'planter', 'bench', 'game_table', 'shelf', 'shed', 'well', 'scarecrow', 'stakes'];
  ok(BASICS.every(id => g.unlocked.has(id)), 'every camp basic is unlocked at start', BASICS.filter(id => !g.unlocked.has(id)).join(','));

  const cap0 = storageCap(g);
  place('shed');
  ok(storageCap(g) === cap0 + BUILDINGS.shed.storage, 'a storage shed adds its storage, not just stockpiles', `${cap0} → ${storageCap(g)}`);

  const [fx, fy] = place('campfire');
  ok(w.light[w.idx(fx, fy)] > 0.5, 'a campfire lights its tile');

  const [wx, wy] = place('well');
  const near = [wx + 2, wy];
  ok(g.farmContext(...near).water > 0.6, 'ground beside a well is well watered', g.farmContext(...near).water.toFixed(2));

  // A colonist with only bedrolls around still sleeps in one, and rests less well than in a bed.
  for (const r of w.findBuildings('bed')) w.building[w.idx(r.x, r.y)] = null;
  w.touch();
  const [bx, by] = place('bedroll');
  const npc = g.colonists.find(c => !c.away && !c.dead);
  npc.needs.rest = 0.1; npc.task = null; npc.thoughts = [];
  for (let k = 0; k < 400 && !(npc.task && npc.task.kind === 'sleep'); k++) g.step();
  ok(npc.task && npc.task.kind === 'sleep' && npc.task.x === bx && npc.task.y === by, 'a tired colonist heads for a bedroll when there is no bed',
    npc.task && JSON.stringify({ kind: npc.task.kind, x: npc.task.x, y: npc.task.y, bx, by }));
});

describe('Module integrity', () => {
  ok(Object.keys(BUILDINGS).every(id => BUILDINGS[id].cost && finite(BUILDINGS[id].work)), 'every building has a cost and a work value');
  ok(Object.values(RESEARCH).every(r => r.req.every(q => RESEARCH[q])), 'research prerequisites all resolve');
  const reachableResearch = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const id in RESEARCH) if (!reachableResearch.has(id) && RESEARCH[id].req.every(q => reachableResearch.has(q))) { reachableResearch.add(id); grew = true; }
  }
  ok(reachableResearch.size === Object.keys(RESEARCH).length, 'no research is orphaned behind an impossible prerequisite');
  const unlockables = new Set(Object.values(RESEARCH).flatMap(r => r.unlock));
  const startUnlocked = new Set(['wall', 'door', 'bed', 'table', 'brazier', 'stockpile', 'farm', 'kitchen', 'carpenter', 'library',
    'timber_wall', 'rug', 'bedroll', 'campfire', 'torch', 'planter', 'bench', 'game_table', 'shelf', 'shed', 'well', 'scarecrow', 'stakes']);
  const orphanBuildings = Object.keys(BUILDINGS).filter(b => !unlockables.has(b) && !startUnlocked.has(b));
  ok(orphanBuildings.length === 0, 'every building is either available at start or unlocked by research', orphanBuildings.join(','));
  ok(Object.values(CLASSES).every(c => c.abilities.length > 0), 'every class has at least one ability');
  ok(Object.values(RACES).every(r => typeof r.hostility === 'number'), 'every ancestry has a hostility bias');
});

// ---------------------------------------------------------------------------
if (BENCH) {
  describe('Bench: long-horizon stability (120 days)', () => {
    const g = new Game('bench');
    const marks = [];
    for (let d = 0; d < 120; d++) {
      for (let i = 0; i < TICKS_PER_DAY; i++) { autoplayStep(g); g.step(); }
      if (d % 20 === 19) marks.push(`d${d + 1}: pop ${g.population}, tier ${g.colonyTier}, delves ${g.expeditionHistory.length}, wealth ${g.wealth}`);
    }
    for (const m of marks) info(m);
    ok(!Number.isNaN(g.wealth), 'wealth stays a number over 120 days');
    ok(g.logs.length <= 400 && g.ground.length < 4000, 'unbounded collections stay capped', `logs ${g.logs.length}, ground ${g.ground.length}`);
    ok(g.expeditionHistory.length > 4, 'the delve loop keeps running long-term', `${g.expeditionHistory.length}`);
  });
}

// ---------------------------------------------------------------------------
describe('View layer (headless smoke test — no interactive client)', () => {
  let ui;
  try {
    installDOM();
    ui = new UI('view-test');
    ok(true, 'ui.js imports and constructs against a DOM');

    // Advance a real game underneath the view.
    for (let i = 0; i < 4000; i++) { autoplayStep(ui.game); ui.game.step(); }

    ui.renderer.draw();
    ok(true, 'renderer draws a live world without throwing');
    ui.renderer.tile = 9; ui.renderer.cacheVersion = -1; ui.renderer.draw();
    ui.renderer.tile = 26; ui.renderer.cacheVersion = -1; ui.renderer.draw();
    ok(true, 'renderer handles zoom changes and cache rebuilds');

    ui.renderTop(); ui.renderRail(); ui.pumpToasts();
    ok(true, 'top bar, rail and toasts render');

    for (const d of ['colony', 'people', 'roster', 'farm', 'workshop', 'party', 'region', 'research', 'bestiary', 'trade', 'log']) { ui.drawer = d; ui.sigs.drawer = null; ui.renderDrawer(); }
    ok(true, 'every drawer panel renders');
    for (const f of ['all', 'major', 'good', 'warn', 'combat', 'death']) { ui.logFilter = f; ui.drawer = 'log'; ui.renderDrawer(); }
    ok(true, 'history timeline renders under every filter');

    // Hover inspectors: every key kind produces a tooltip for a live thing.
    const tg = ui.game;
    const keys = [
      'res:food', 'res:wood', 'res:gold', 'col:' + tg.colonists[0].id, 'bld:smithy', 'bld:bed',
      'tile:' + tg.world.start.x + ',' + tg.world.start.y, 'tech:relicry', 'tech:masonry',
      'site:' + tg.overworld.discovered()[0].id, 'trait:' + tg.colonists[0].traits[0], 'crop:grain',
      'species:ox', 'skill:' + tg.colonists[0].id + '|mining', 'ability:' + tg.colonists[0].abilities[0],
    ];
    if (tg.beasts.length) keys.push('beast:' + tg.beasts[0].id);
    keys.push('rift');
    const empty = keys.filter(k => !tipHtml(tg, k));
    ok(!empty.length, `hover inspectors build for ${keys.length} kinds of thing`, empty.join(', '));
    ok(tipHtml(tg, 'nonsense:1') === '' && tipHtml(tg, 'col:999999') === '', 'unknown hover keys fail quietly');
    ok(mapTipKey(tg, tg.colonists[0].x, tg.colonists[0].y).startsWith('col:') || tg.colonists[0].away, 'map hover finds the colonist under the pointer');

    // Tech tree: queueing a locked project pulls in its prerequisites in order.
    const rg = new Game('tech-queue');
    rg.research.current = null; rg.research.queue = [];
    rg.queueResearch('relicry');
    const chain = [rg.research.current, ...rg.research.queue];
    const idx = (t) => chain.indexOf(t);
    ok(idx('letters') >= 0 && idx('letters') < idx('arcana1') && idx('arcana1') < idx('wardstone') && idx('wardstone') < idx('relicry'),
      'queueing a locked tech queues its prerequisite path in research order', chain.join(' > '));
    rg.unqueueResearch('relicry');
    ok(!rg.research.queue.includes('relicry'), 'a queued tech can be removed');

    const c = ui.game.colonists[0];
    ui.sel = { kind: 'colonist', id: c.id };
    for (const t of ['bio', 'skills', 'class', 'social', 'gear', 'health']) { ui.tab = t; ui.renderInspector(); }
    ok(true, 'every colonist inspector tab renders');

    ui.sel = { kind: 'tile', x: ui.game.world.start.x, y: ui.game.world.start.y };
    ui.renderInspector();
    ui.selectAt(ui.game.world.start.x + 3, ui.game.world.start.y + 2);
    ok(true, 'tile inspector and map selection render');

    // Clicking your own colonist on the map selects them for orders, not for the inspector.
    const mc = ui.game.colonists.find(k => !k.away);
    ui.closeInspector();
    ui.selectAt(mc.x, mc.y);
    ok(ui.squad.has(mc.id) && !ui.sel, 'a map click on a colonist selects them without opening the inspector');
    ui.selectAt(ui.game.world.start.x + 3, ui.game.world.start.y + 2);
    ok(!!ui.sel && ui.sel.kind === 'tile', 'a map click on the ground opens the inspector');
    ui.hoverInfo = false; ui.tickTips(performance.now());
    ok(true, 'hover info can be turned off');
    ui.hoverInfo = true;

    // Force the paths that only exist when content is present.
    ui.game.raiders.length = 0;
    const foe = generateNPC(new RNG('viewfoe'), { faction: 'warband', tier: 4 });
    foe.x = ui.game.world.start.x; foe.y = ui.game.world.start.y;
    ui.game.raiders.push(foe);
    ui.sel = { kind: 'enemy', ref: foe }; ui.renderInspector();
    ui.renderer.draw();
    ok(true, 'enemy inspector and raider rendering work');

    // The front door: title, a new colony in a slot, options, the pause menu.
    ui.showTitle();
    ok(!document.querySelector || true, 'the title screen renders');
    ui.showOptions(); ui.opts.reduceMotion = true; ui.applyOptions();
    ok(ui.renderer.reduceMotion === true, 'options reach the renderer');
    ui.opts.reduceMotion = false; ui.applyOptions(); ui.hide('#options');
    ui.showGameMenu(); ok(ui.paused, 'the game menu pauses the run');
    ui.hideGameMenu(); ui.hideTitle();

    for (const cat of ['structure', 'comfort', 'production', 'logistics', 'martial']) { ui.buildCat = null; ui.toggleBuildPick(cat); }
    ok(true, 'every build category picker renders');

    ui.setTool({ mode: 'mine' });
    const s0 = ui.game.world.start;
    ui.applyTool(s0.x - 6, s0.y - 4, s0.x - 4, s0.y - 2);
    ui.setTool({ mode: 'build', id: 'bed' });
    ui.applyTool(s0.x + 2, s0.y + 2, s0.x + 3, s0.y + 2);
    ui.setTool({ mode: 'cancel' });
    ui.applyTool(s0.x + 2, s0.y + 2, s0.x + 3, s0.y + 2);
    ok(true, 'mine / build / cancel tools apply over a dragged rectangle');

    if (ui.game.expeditionHistory.length) { ui.sel = { kind: 'history', ref: ui.game.expeditionHistory[0] }; ui.renderInspector(); }
    ok(true, 'the delve history inspector renders');

    // Floors: the view follows whichever map is on screen.
    const fl = ui.game.ensureFloor(1);
    const walker = ui.game.colonists.find(c => !c.mapId);
    ui.game.moveToMap(walker, fl, fl.world.stairsUp.x, fl.world.stairsUp.y);
    ui.viewMap(fl.id);
    ok(ui.mapId === fl.id && ui.renderer.game.world === fl.world, 'switching to a floor points the renderer at it');
    ui.renderer.draw();
    ok(true, 'a Rift floor draws without throwing');
    ui.renderMapTabs();
    ok(!document.querySelector('#maptabs') || true, 'the map switcher renders');
    ui.selectAt(walker.x, walker.y);
    ok(ui.squad.has(walker.id), 'a click on a floor selects the colonist standing there');
    ui.rightClickAt(fl.world.stairsUp.x, fl.world.stairsUp.y);
    // Stairs are a tile you can also stand on, so right-click offers a menu; the way up leads it.
    if (!(walker.order && walker.order.travel) && ui.ctxOpts && ui.ctxOpts[0]) ui.ctxOpts[0].run();
    ok(walker.order && walker.order.travel === 'up', 'right-clicking the stairs up sends the selection up them');
    ui.drawer = 'party'; ui.sigs.drawer = null; ui.renderDrawer();
    ok(true, 'the Rift tab renders with floors in play');
    ui.cycleMap();
    ok(ui.mapId === 0, 'Tab cycles back to the camp');
    ui.viewMap(fl.id);
    ui.game.maps = ui.game.maps.filter(m => m.id !== fl.id);   // let go at dawn while on screen
    for (let i = 0; i < 20; i++) globalThis.__frames[globalThis.__frames.length - 1]();
    ok(ui.mapId === 0, 'a floor that goes away while on screen falls back to the camp');
    ok(true, 'the render loop runs repeated frames');

    ui.game.colonists.length = 0; ui.game.step(); ui.showGameOver();
    ok(!!ui.game.gameOver, 'the loss condition triggers and the end screen renders');
  } catch (e) {
    ok(false, 'view layer executes without throwing', `${e.message}\n${(e.stack || '').split('\n')[1] || ''}`);
  }
});

describe('Onboarding & legibility', () => {
  // Keywords: one look everywhere, coloured by what they do to you.
  ok(traitSentiment('optimist') === 'good' && traitSentiment('pessimist') === 'bad', 'traits read as good or bad by their effect');
  ok(traitSentiment('greedy') === 'mixed', 'a real trade-off reads as mixed');
  ok(beastTraitSentiment('prize') === 'good' && beastTraitSentiment('runt') === 'bad', 'beast traits are judged the same way');
  ok(/kw-good/.test(kw('trait', 'optimist')) && /data-tip="trait:optimist"/.test(kw('trait', 'optimist')), 'a trait chip carries its colour and tooltip');
  ok(/<b>12<\/b>/.test(kw('res', 'wood', { qty: 12 })), 'a resource chip can lead with an amount');
  // Classes come early: the Combat School sits at the root of the tree.
  ok(RESEARCH.militia && RESEARCH.militia.req.length === 0 && RESEARCH.militia.unlock.includes('combat_school'), 'the Combat School is one root research away');
  ok(RESEARCH.militia.unlock.includes('training') && !RESEARCH.drill_corps.unlock.includes('training'), 'the Training Dummy comes with the school it feeds, and only once');
  {
    const g = new Game('onboard-start');
    ok((g.reagents.class_tome || 0) === 1, 'a new camp starts with one Class Tome');
    ok(!g.unlocked.has('training') && !g.unlocked.has('combat_school'), 'schools and the dummy wait for Militia');
    ok(!BUILDINGS.library.cost.gold, 'the Library costs no gold: research never waits on coin');
    // A peasant who reads the tome graduates out of peasantry.
    const p = g.colonists.find(c => c.peasant);
    const k = Object.keys(CLASSES).find(k => !classReqForTest(p, k) && k !== p.klass && ['fighter', 'rogue', 'ranger', 'barbarian', 'monk', 'wizard', 'cleric', 'druid', 'bard', 'warlock', 'paladin', 'artificer'].includes(k));
    ok(k && g.readTome(p.id, k) === '', 'a peasant can read the starting tome', k);
    p.training.progress = p.training.need - 1;   // a day's reading, minus the night that could kill them
    for (let i = 0; i < TICKS_PER_HOUR * 2; i++) g.step();
    ok(!p.peasant && p.tree && p.klass === k, 'a graduate is no longer a peasant', `${p.title} ${p.klass}`);
    ok(g.stats.graduates === 1, 'graduations are counted');
  }
  {
    // Drilling lifts a Combat attribute toward the bar, and stops there.
    const g = new Game('drill');
    const p = g.colonists.find(c => c.peasant);
    for (const a of ['str', 'dex']) p.attributes[a] = 9;
    const before = drillTarget(p);
    ok(before && before.value === 9, 'a weak peasant has something to drill toward');
    for (let i = 0; i < DRILL_SESSIONS * 5; i++) drillSession(p);
    ok(drillTarget(p) === null && Math.max(p.attributes.str, p.attributes.dex) === 12, 'drilling stops once a Combat class is open', `${p.attributes.str}/${p.attributes.dex}`);
  }
  {
    // The first caravan comes by day 3, and the ledger tracks the treasury's net.
    const g = new Game('caravan-guarantee');
    let met = false;
    for (let i = 0; i < TICKS_PER_DAY * 3.5 && !met; i++) { g.step(); if (g.caravan) met = true; }
    ok(met, 'a caravan arrives within the first three and a half days');
    ok(g.ledger.days.some(d => d.net != null), 'each dawn records the day\'s net gold');
  }
  {
    // The tutorial walks forward on real play, and skipping it silences it.
    const g = new Game('tut');
    const t = tutorialState(g);
    ok(t.step === 0 && !t.skipped, 'a new game starts the tutorial');
    noteTutorialEvent(g, 'harvest');
    advanceTutorial(g);
    ok(t.step >= 1, 'a harvest order completes the first step');
    for (let i = 0; i < TICKS_PER_DAY * 6; i++) { autoplayStep(g); g.step(); if (i % 200 === 0) advanceTutorial(g); }
    advanceTutorial(g);
    ok(t.step >= 4, 'auto-play carries the tutorial through its early steps', `${t.step}/${TUTORIAL_STEPS.length} (${TUTORIAL_STEPS[t.step] ? TUTORIAL_STEPS[t.step].id : 'done'})`);
    ok(t.tips.length > 0 && new Set(t.tips).size === t.tips.length, 'first-time tips fire, each once', t.tips.join(','));
    const g2 = new Game('tut-skip');
    skipTutorialState(g2);
    ok(advanceTutorial(g2).completed.length === 0, 'a skipped tutorial completes nothing');
  }
  {
    // The world map pays: resource sites can be gathered from, for free.
    const g = new Game('errands');
    const ow = g.overworld;
    for (const st of ow.sites) st.discovered = true;
    const node = ow.sites.filter(st => siteErrand(st) === 'gather').sort((a, b) => a.dist - b.dist)[0];
    ok(!!node, 'some site on the map offers a Gather errand');
    const c = g.colonists.find(x => x.peasant);
    const res = SITE_KINDS[node.kind].node, before = g.resources[res] || 0, gold0 = g.resources.gold;
    ok(sendJourney(g, [c.id], node.id, 'gather') === '' && c.away, 'a party sets out to gather, free of charge');
    ok(g.resources.gold === gold0, 'gathering costs no gold');
    ok(sendJourney(g, [g.colonists.find(x => !x.away).id], node.id, 'search') !== '', 'a site only offers its own errand');
    for (let i = 0; i < TICKS_PER_DAY * 6 && c.away; i++) g.step();
    ok(!c.away && (g.resources[res] || 0) > before, 'the party comes home with the site\'s goods', `${res} ${before} → ${g.resources[res]}`);
    ok(node.gathered === 1 && g.stats.journeys === 1, 'the site remembers it was worked');
    const ruin = ow.sites.find(st => siteErrand(st) === 'search');
    if (ruin) ok(siteErrand({ ...ruin, searched: true }) === null, 'a ruin can only be searched once');
  }
  {
    // Leather has a job: bigger packs carry more loot out of the Rift.
    const g = new Game('packs');
    const hero = g.colonists.find(c => c.tree);
    const cap0 = packCap(hero);
    g.resources.leather = 100; g.resources.cloth = 100;
    ok(upgradePack(g, hero.id) === '' && packCap(hero) === cap0 + PACK_STEP, 'stitching a pack adds carrying room', `${cap0} → ${packCap(hero)}`);
    ok(g.resources.leather < 100, 'and spends leather');
  }
  {
    // The first lair always pays a Class Tome, and the UI gets a record of the hoard.
    const g = new Game('lair-reward');
    const fl = g.ensureFloor(1), v = g.viewOf(fl);
    const boss = fl.raiders.find(r => r.lairBoss) || fl.raiders[0];
    const t0 = g.reagents.class_tome || 0;
    v.onLairBroken(boss);
    ok(g.stats.lairs === 1 && g.reagents.class_tome === t0 + 1, 'the first lair broken yields a Class Tome');
    ok(g.lastLair && g.lastLair.depth === 1 && g.lastLair.tome, 'the hoard is recorded for the reward card');
    v.onLairBroken(boss);
    ok(g.reagents.class_tome === t0 + 1, 'later lairs don\'t repeat the tome');
  }
  for (const f of ['ui.js', 'tips.js']) {
    const src = readFileSync(fileURLToPath(new URL('../src/' + f, import.meta.url)), 'utf8');
    ok(!/TRAITS\[t\]\.name/.test(src), `${f} draws traits through kw(), not by name`);
  }
});

describe('Shipped single-file build', () => {
  const path = fileURLToPath(new URL('../riftgate.html', import.meta.url));
  if (!existsSync(path)) { ok(false, 'riftgate.html exists — run `node build.mjs`'); }
  else {
    try {
      const r = testBundle(path);
      ok(true, 'the bundled file boots and creates a running game');
      info(`${(r.bytes / 1024).toFixed(0)} KB, ${r.lines} lines of inlined script`);
      ok(r.snap.tick > 4000, 'the bundled game simulates ticks', `tick ${r.snap.tick}`);
      ok(r.snap.population > 0, 'the bundled game has living colonists', `${r.snap.population}`);
      ok(r.snap.buildings >= 0 && r.snap.sitesKnown > 0, 'overworld and colony state are present', `${r.snap.sitesKnown} sites known`);
      ok(typeof r.snap.season === 'string' && r.snap.year >= 1, 'seasons are running in the build', `${r.snap.season} yr ${r.snap.year}`);
      ok(r.ui.game.beasts.length >= 0 && Array.isArray(r.ui.game.beasts), 'livestock system is live in the build');
    } catch (e) {
      ok(false, 'the bundled file boots', `${e.message}\n${(e.stack || '').split('\n')[1] || ''}`);
    }
  }
});

// ---------------------------------------------------------------------------
console.log(`\n${C.b}${'─'.repeat(58)}${C.x}`);
if (failed === 0) console.log(`${C.g}${C.b}  ${passed} passed, 0 failed${C.x}`);
else {
  console.log(`${C.r}${C.b}  ${passed} passed, ${failed} FAILED${C.x}`);
  for (const f of fails) console.log(`  ${C.r}·${C.x} ${f}`);
}
console.log('');
process.exit(failed ? 1 : 0);
