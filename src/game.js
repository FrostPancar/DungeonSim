// ============================================================================
// GAME: state container and master tick. Headless — no DOM references.
// ============================================================================
import { economyDawn, economyHour, forgeTier, orderUpgrade, shopStatus } from './economy.js';
import { RNG, clamp } from './rng.js';
import { RESEARCH, BUILDINGS, RACES, CLASSES, RESOURCE_IDS, SKILL_IDS, dispositionOf, ABILITIES } from './data.js';
import { World, findPath } from './world.js';
import { separateUnits } from './occupancy.js';
import { tickCombat } from './realtime.js';
import { generateFloor, tickFloorMonsters, tickFloorTraps, openProp, unloadPack, lairReward, placeMerchant } from './floors.js';
import { Overworld, BIOMES, SITE_KINDS } from './overworld.js';
import { SEASONS, DAYS_PER_SEASON, DAYS_PER_YEAR, seasonOf, yearOf, initSoil, CROPS, recommendCrop } from './farming.js';
import { tickBeasts, spawnWildHerd, createBeast, herdCap, resetBeastIds, ANIMALS, tickFollowers, bringFollowers, moveBeastTo, canFollow } from './husbandry.js';
import { generateNPC, generateGroup, resetIds, powerOf, refresh, shiftHostility } from './npc.js';
import {
  tickColonist, tickFarms, tickForest, rebuildJobs, addResource, designate, placeBlueprint, placeFloorBlueprint,
  advanceResearch, pickNextResearch, addThought, TICKS_PER_DAY, TICKS_PER_HOUR, storageCap,
  rushJob, orderMove, orderWork, siteJobAt, siteWorkLeft, carryAlong,
} from './colony.js';
import { tickSocial, resolveSocializeTask } from './social.js';
import { generateDungeon, estimateDanger, estimateReward, MAX_DEPTH } from './dungeon.js';
import { buildEncounter, rankIdx, resetMonsterIds } from './monsters.js';
import { BIOMES_RIFT, rollBiome } from './biomes.js';
import { CLASS_INFO, SCHOOLS, PRESTIGE, classRequirement, changeClass, choosePrestigePath, autoAllocate, toggleLoadout, LOADOUT_SLOTS } from './classes.js';
import { bookRequirement, rollMagicStock, bookPrice, scrollPrice, partCost, spellBudget, writeCost, buildSpell, STARTING_PARTS } from './magic.js';
import { canEquip, forgeItem, generateItem, LEGENDARY_RECIPES, POTIONS, ESSENCE_INGREDIENTS } from './items.js';
import { partyPower, dungeonPower, STANCES, awardXp, beltSize } from './expedition.js';
import { maybeIncident, tickRaiders, threatLevel, colonyWealth, acceptArrival, rejectArrival, tradeBuy, tradeSell, buyLivestock, riftWave, riftDawn, waveForecast } from './events.js';

// --- the Rift -----------------------------------------------------------------
// The one dungeon. It deepens a level every RIFT_DAYS_PER_LEVEL days, its
// interior reshapes at every dawn and after every party goes in, and each dusk
// it disgorges a wave of monsters at the camp.
export const RIFT_DAYS_PER_LEVEL = 4;
/** How hard the Rift's worst room should be at each level — a ramp the party
 *  can grow into by delving, not a wall. */
export function riftTargetDanger(lv) { return 76 + (lv - 1) * 46 + Math.max(0, lv - 6) ** 2 * 10; }
/** The Rift's guild rank. It is an SSS-class gate; it just does not start as one. */
export const RIFT_RANKS = [[1, 'E'], [2, 'D'], [3, 'C'], [5, 'B'], [7, 'A'], [9, 'S'], [12, 'SS'], [15, 'SSS']];
export function riftRank(lv) { let r = 'E'; for (const [at, name] of RIFT_RANKS) if (lv >= at) r = name; return r; }
export const RIFT_MAX_LEVEL = 20;
export const DUSK_HOUR = 18, DAWN_HOUR = 6;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

// What the camp starts with: tents, a fire, a store and some light.
const CAMP_LAYOUT = [
  ['kitchen', 0, 0], ['table', 1, 0], ['stockpile', -3, 2], ['stockpile', -2, 2],
  // One 1×5 barracks rather than loose bedrolls.
  ['bed', -2, 4], ['bed', -1, 4], ['bed', 0, 4], ['bed', 1, 4], ['bed', 2, 4],
  ['brazier', -4, 0], ['brazier', 4, 0], ['brazier', 0, -3],
];

export const START_UNLOCKED = ['wall', 'door', 'bed', 'table', 'brazier', 'stockpile', 'farm', 'kitchen', 'carpenter', 'library', 'training',
  'timber_wall', 'rug', 'bedroll', 'campfire', 'torch', 'planter', 'bench', 'game_table', 'shelf', 'shed', 'well', 'scarecrow', 'stakes'];

// --- telemetry --------------------------------------------------------------
// Sampled every two game-hours and kept for the last 120 samples (ten days), so
// a chart can answer "is this getting better or worse?" — the one question a
// live number cannot. Cheap: seven scalars on a fixed clock, ring-buffered.
export const HISTORY_INTERVAL = TICKS_PER_HOUR * 2;
export const HISTORY_WINDOW = 120;
const HISTORY_SERIES = ['pop', 'food', 'meal', 'morale', 'mood', 'threat', 'wealth', 'stock', 'deaths'];

function newHistory() {
  const h = { tick: [], nextTick: 0 };
  for (const k of HISTORY_SERIES) h[k] = [];
  return h;
}

function sampleHistory(game) {
  const h = game.history;
  if (game.tick_ < h.nextTick) return;
  h.nextTick = game.tick_ + HISTORY_INTERVAL;
  const cs = game.colonists;
  const push = (k, v) => { const a = h[k]; a.push(v); if (a.length > HISTORY_WINDOW) a.shift(); };
  push('tick', game.tick_);
  push('pop', cs.length);
  push('food', Math.round(game.resources.food || 0));
  push('meal', Math.round(game.resources.meal || 0));
  push('morale', Math.round(game.morale));
  push('mood', cs.length ? Math.round(cs.reduce((s, c) => s + c.mood, 0) / cs.length) : 0);
  push('threat', +game.threat.toFixed(2));
  push('wealth', Math.round(game.wealth));
  push('stock', game.livestock.length);
  push('deaths', game.graveyard.length);
}

/** Day number a history sample was taken on, for chart hover labels. */
export function historyDay(game, i) {
  const t = game.history.tick[i];
  return t == null ? 0 : Math.floor(t / TICKS_PER_DAY) + 1;
}

// ---------------------------------------------------------------- maps --
// The colony plays on more than one map: the camp, and every Rift floor a
// squad has gone down to. Each map keeps its own copy of the fields below.
// On a Game they are accessors onto `this._m` (the map in scope), so the same
// colony code runs on any map when handed a *view*: Object.create(game) with
// its own `_m`. Everything not listed here — resources, research, the log,
// the roster — is colony-wide and falls through to the real game.
export const MAP_LOCAL = ['world', 'raiders', 'beasts', 'ground', 'jobs', 'jobsDirty', 'unreachable', 'occ', 'siteWork', 'rushed', 'field'];

/** A fresh map record. `kind` is 'camp' or 'floor'. */
export function newMapState(id, kind, extra = {}) {
  return { id, kind, world: null, raiders: [], beasts: [], ground: [], jobs: [], jobsDirty: true, unreachable: new Map(), occ: null, siteWork: null, rushed: null, field: null, view: null, ...extra };
}

export class Game {
  constructor(seed = 'default', opts = {}) {
    // Maps first: the map-local accessors below need somewhere to write.
    this.root = this;
    this._m = newMapState(0, 'camp', { view: this });
    this.maps = [this._m];
    this.nextMapId = 1;
    this.seedString = String(seed);
    this.rng = new RNG(seed);
    resetIds(1);
    resetBeastIds(1);
    resetMonsterIds();
    // The region comes first: the colony's biome decides local terrain, which
    // crops will grow, which animals live nearby and who the neighbours are.
    this.overworld = new Overworld(this.rng.int(1, 1e9));
    this.site = this.overworld.colony;
    this.biome = opts.biome || this.site.biome;
    // The camp map is shaped by its region biome: open grassland, dense forest, dunes, cliffs...
    this.world = new World(this.rng.int(1, 1e9), opts.width || 72, opts.height || 50, { biome: this.biome });
    initSoil(this.world, this.biome);
    this.tick_ = 0;
    this.speed = 1;
    this.paused = false;
    this.xpRate = opts.xpRate ?? 1;
    this.autoSkills = opts.autoSkills ?? false;   // spend skill points automatically on level-up

    this.resources = {};
    for (const r of RESOURCE_IDS) this.resources[r] = 0;
    Object.assign(this.resources, { wood: 160, stone: 140, food: 90, cloth: 24, leather: 12, iron: 24, gold: 40, herbs: 10, meal: 12, ...(opts.resources || {}) });

    this.armory = [];
    this.reagents = {};   // essences and rare finds: the magic economy's raw stuff
    this.potions = {};    // brewed potions beyond minor healing (which is resources.potion)
    this.library = { scrolls: {}, books: {} };   // single-use scrolls and teachable spellbooks
    this.spellParts = { forms: [...STARTING_PARTS.forms], elements: [...STARTING_PARTS.elements], mods: [...STARTING_PARTS.mods] };
    this.customSpells = {};   // designed in the Magic Lab: id → ability definition
    this.peddler = null; this.nextPeddlerDay = 6;
    // Where gold goes (economy.js): shop stock, visiting traders, commissions,
    // standing orders, parties on the road, blessings, and Rift keys.
    this.shops = {}; this.traders = []; this.commissions = []; this.orders = {}; this.journeys = [];
    this.blessings = {}; this.keys = 0; this.truces = {};
    this.ledger = { spent: {}, earned: {}, today: {}, days: [] };
    this.spellmasonStock = null; this.spellmasonDay = 0;
    this.trophies = {};   // named boss parts, for legendary crafting
    this.bestiary = {};   // monster id → { seen, kills }
    this.researchDefs = RESEARCH;
    this.research = { done: new Set(), current: null, progress: 0, queue: [] };
    this.unlocked = new Set(START_UNLOCKED);
    this.bonuses = {};
    this.pendingInsight = 0;

    this.colonists = [];
    this.graveyard = [];
    this.defectors = [];
    this.deaths = [];
    this.expeditionHistory = [];
    this.delve = null;   // the trip in progress: from the first step through the gate to the last one out
    this.nextExpeditionId = 1;
    this.pendingArrivals = [];
    this.caravan = null;
    this.alert = null;
    this.morale = 50;
    this.overflow = 0;
    this.nextIncidentTick = 2400;
    this.logs = [];
    this.stats = { mined: 0, built: 0, crafted: 0, expeditions: 0, cleared: 0, raidsWon: 0, raidsLost: 0 };
    this.nextHerdTick = 1200;
    this.harvests = 0;
    this.raceSpeed = {};
    for (const r in RACES) this.raceSpeed[r] = RACES[r].speed;

    // Telemetry. The colony's own record of itself, sampled on a fixed clock so
    // the client can chart a trend instead of only ever showing "right now".
    this.history = newHistory();

    // Runs open at dawn: the first day is for settling in, the first dusk is
    // the first wave.
    this.tick_ = TICKS_PER_HOUR * DAWN_HOUR;
    this.rift = { level: 1, dungeon: null, entries: 0, lastWaveDay: 0, lastDawnDay: 1, waves: 0 };
    this.rift.biome = rollBiome(this.rng.fork('biome1'), 0);
    this.pitchCamp();
    this.spawnStartingColonists(opts.startColonists ?? 6);
    this.seedWildlife(opts.startHerds ?? 3);
    pickNextResearch(this);
    this.rerollRift();
    this.log('Camp is pitched outside the Rift Gate. At dusk, it opens.', 'major');
  }

  /** The colonists standing on the map in scope — the roster is `colonists`. */
  get here() { const id = this._m.id; return this.colonists.filter(c => (c.mapId || 0) === id); }
  /** The camp's map record. */
  get camp() { return this.maps[0]; }
  /** A view of the game scoped to one map; the camp's view is the game itself. */
  viewOf(m) {
    if (!m.view) { m.view = Object.create(this.root); m.view._m = m; }
    return m.view;
  }
  mapById(id) { return this.maps.find(m => m.id === id) || null; }
  /** The map a colonist (or anything with a mapId) is on. */
  mapOf(u) { return this.mapById((u && u.mapId) || 0) || this.maps[0]; }

  get tick() { return this.tick_; }
  get day() { return Math.floor(this.tick_ / TICKS_PER_DAY) + 1; }
  get hour() { return Math.floor((this.tick_ % TICKS_PER_DAY) / TICKS_PER_HOUR); }
  get minute() { return this.tick_ % TICKS_PER_HOUR; }
  get isNight() { return this.hour < DAWN_HOUR || this.hour >= DUSK_HOUR; }
  get seasonIndex() { return seasonOf(this.day); }
  get seasonDef() { return SEASONS[this.seasonIndex]; }
  get season() { return SEASONS[this.seasonIndex].name; }
  get year() { return yearOf(this.day); }
  get dayOfSeason() { return ((this.day - 1) % DAYS_PER_SEASON) + 1; }
  get biomeDef() { return BIOMES[this.biome]; }
  get herdCap() { return herdCap(this); }
  get livestock() { return this.beasts.filter(b => b.tame && !b.dead); }
  get wildlife() { return this.beasts.filter(b => !b.tame && !b.dead); }
  /** Context object the farming model needs for a given tile. */
  farmContext(x, y) {
    const i = this.world.idx(x, y);
    return {
      season: this.seasonIndex,
      soil: this.world.soil ? this.world.soil[i] : 0.5,
      water: this.irrigated(x, y, this.world.water ? this.world.water[i] : 0.5),
      biome: this.biome,
    };
  }
  /** A well waters the ground around it, like a river does. */
  irrigated(x, y, water) {
    for (const r of this.world.findBuildings('well')) {
      const d = Math.hypot(r.x - x, r.y - y), R = BUILDINGS.well.irrigate;
      if (d <= R) water = Math.max(water, 1 - d / (R + 1.5));
    }
    return water;
  }
  get population() { return this.colonists.length; }
  get wealth() { return colonyWealth(this); }
  get threat() { return threatLevel(this); }
  get colonyTier() {
    // Earned mostly by successful delves and by how strong the best delvers are,
    // so the offer table never outruns the party the player actually has.
    const bestLevel = this.colonists.reduce((m, c) => Math.max(m, c.level), 1);
    return clamp(
      1 + Math.floor(this.stats.cleared * 0.7) + Math.floor(bestLevel / 4) + Math.floor(this.research.done.size / 5),
      1, 14);
  }
  /** The Rift is the gate: there is always one, and nothing to build. */
  /** Level the Rift should be at on the current day. */
  get riftLevelNow() {
    return clamp(1 + Math.floor((this.day - 1) / RIFT_DAYS_PER_LEVEL), 1, RIFT_MAX_LEVEL);
  }
  get riftLevel() { return this.rift.level; }
  get riftRank() { return riftRank(this.rift.level); }
  /** Days until the Rift deepens again (0 at the cap). */
  get riftNextLevelIn() {
    if (this.rift.level >= RIFT_MAX_LEVEL) return 0;
    return this.rift.level * RIFT_DAYS_PER_LEVEL + 1 - this.day;
  }
  /** Hours until the next dusk (or dawn, at night). */
  get hoursToDusk() { return (DUSK_HOUR - this.hour + 24) % 24; }
  get hoursToDawn() { return (DAWN_HOUR - this.hour + 24) % 24; }
  get canEnterRift() { return !this.isNight; }
  /** The one dungeon on offer: the Rift's current interior. Kept as a list so
   *  older callers that iterate "offers" still work. */
  get waveForecast() { return waveForecast(this); }
  get storageCap() { return storageCap(this); }

  log(text, kind = 'info', npcId = null) {
    this.logs.push({ tick: this.tick_, text, kind, npcId, day: this.day, hour: this.hour });
    if (this.logs.length > 400) this.logs.shift();
  }

  seedWildlife(n) {
    for (let i = 0; i < n; i++) {
      const herd = spawnWildHerd(this.rng, this.biome, this.world);
      this.beasts.push(...herd);
    }
  }

  /**
   * The founders: one knight, sworn to hold the camp, and the peasants who
   * followed them out here — unclassed labourers who work by day and sleep by
   * night unless someone tells them otherwise. Anyone else has to be found,
   * recruited or trained.
   */
  spawnStartingColonists(n) {
    const w = this.world;
    for (let i = 0; i < n; i++) {
      const knight = i === 0;
      const npc = generateNPC(this.rng, {
        faction: 'colony', tier: knight ? 3 : 0,
        classHint: knight ? 'fighter' : 'laborer',
        manualSkills: true,   // the founders' skill points are the player's to spend
      });
      if (knight) npc.title = 'Knight';
      else { npc.peasant = true; npc.title = 'Peasant'; }
      let placed = false;
      for (let k = 0; k < 200 && !placed; k++) {
        const x = w.start.x + this.rng.int(-4, 4), y = w.start.y + this.rng.int(-3, 3);
        if (w.walkable(x, y)) { npc.x = x; npc.y = y; placed = true; }
      }
      if (!placed) { npc.x = w.start.x; npc.y = w.start.y; }
      this.colonists.push(npc);
    }
  }

  // --- offers ---------------------------------------------------------------
  /** Power of the best party the colony could send right now. */
  expeditionPower() {
    const avail = this.colonists.filter(c => !c.away && !c.dead)
      .sort((a, b) => powerOf(b) - powerOf(a)).slice(0, 4);
    return avail.reduce((s, c) => s + powerOf(c), 0);
  }
  /**
   * What the Rift holds today, for the forecast: its biome, the groups that
   * live there, what it's worth. The floors themselves are made when someone
   * first goes down to them (ensureFloor); this is only the view from outside.
   */
  rerollRift() {
    const bio = this.rift.biome || { id: 'goblin_warrens', surge: false };
    const B = BIOMES_RIFT[bio.id] || BIOMES_RIFT.goblin_warrens;
    this.rift.forecast = {
      biome: bio.id, surge: !!bio.surge, name: B.name, color: B.color, level: this.rift.level,
      templates: [...(B.templates || [])], lair: B.lairTemplate || null, loot: { ...(B.loot || {}) },
    };
    delete this.rift.dungeon;
    return this.rift.forecast;
  }

  /** Pre-build the camp around the start: nobody arrives at a Rift empty-handed. */
  pitchCamp() {
    const w = this.world;
    for (const [id, dx, dy] of CAMP_LAYOUT) {
      const x = w.start.x + dx, y = w.start.y + dy;
      if (!w.inside(x, y) || w.solidAt(x, y) || w.building[w.idx(x, y)]) continue;
      const def = BUILDINGS[id];
      if (!w.canPlace(id, x, y)) continue;
      w.putBuilding(id, x, y, { id, done: true, workLeft: 0, hp: def.hp || 120, growth: 0, progress: 0, reservedBy: 0, camp: true });
    }
    w.touch();
    w.recomputeLight();
  }

  // --- main tick ------------------------------------------------------------
  step() {
    this.tick_++;

    if (this.pendingInsight > 0) {
      const chunk = Math.min(this.pendingInsight, 3);
      advanceResearch(this, chunk);
      this.pendingInsight -= chunk;
    }
    this.tickMapCore(this);
    tickFarms(this);
    tickForest(this);
    tickBeasts(this);
    tickFollowers(this);
    tickRaiders(this);
    tickCombat(this);
    // Every other map — the Rift floors — runs the same systems in its own scope.
    for (let k = 1; k < this.maps.length; k++) this.tickMap(this.maps[k]);
    carryAlong(this);
    if (this.delve && this.tick_ % 30 === 0) this.checkDelve();

    // Wild herds drift in over time so taming stock stays possible all run.
    if (this.tick_ >= this.nextHerdTick) {
      this.nextHerdTick = this.tick_ + this.rng.int(3000, 7000);
      if (this.wildlife.length < 14) this.beasts.push(...spawnWildHerd(this.rng, this.biome, this.world));
    }
    // Soil slowly recovers everywhere; compost and beans do the heavy lifting.
    if (this.tick_ % 240 === 0 && this.world.soil) {
      const soil = this.world.soil;
      for (let i = 0; i < soil.length; i++) if (soil[i] < 0.92) soil[i] = Math.min(0.92, soil[i] + 0.0018);
    }
    // Season turnover is a real event the colony has to plan around.
    const sIdx = this.seasonIndex;
    if (this.lastSeason === undefined) this.lastSeason = sIdx;
    if (sIdx !== this.lastSeason) {
      this.lastSeason = sIdx;
      this.log(`${this.season} begins (year ${this.year}).`, 'major');
      if (sIdx === 3) this.log('Winter. Outdoor crops will not grow and grazing is thin.', 'warn');
    }


    maybeIncident(this);

    // Expire timed content.
    for (let i = this.pendingArrivals.length - 1; i >= 0; i--) {
      if (this.tick_ > this.pendingArrivals[i].expires) {
        const a = this.pendingArrivals.splice(i, 1)[0];
        shiftHostility(a.npc, 8, 'ignored at the gate');
        this.log(`${a.npc.name.short} gave up waiting and left.`, 'info');
      }
    }
    if (this.caravan && this.tick_ > this.caravan.expires) { this.log('The caravan moves on.', 'info'); this.caravan = null; }
    if (this.alert && this.tick_ > this.alert.until) this.alert = null;
    // The Rift's clock: waves at dusk, retreat and reshaping at dawn.
    if (this.minute === 0) {
      economyHour(this);
      this.tickSchools();
      this.tickMagic();
      if (this.hour === DUSK_HOUR && this.rift.lastWaveDay !== this.day) {
        this.rift.lastWaveDay = this.day;
        this.rift.waves++;
        riftWave(this);
      } else if (this.hour === DAWN_HOUR && this.rift.lastDawnDay !== this.day) {
        this.rift.lastDawnDay = this.day;
        riftDawn(this);
        this.reshapeFloors();
        economyDawn(this);
        const lv = this.riftLevelNow;
        if (lv > this.rift.level) {
          const was = riftRank(this.rift.level);
          this.rift.level = lv;
          const now = riftRank(lv);
          this.log(now !== was
            ? `The Rift is now rank ${now} (level ${lv}). The guilds would evacuate. You are the guild.`
            : `The Rift deepens to level ${lv}. What comes out tonight will be worse — and so is what waits inside.`, 'major');
        }
        // The Rift chooses what it is today.
        this.rift.biome = rollBiome(this.rng.fork('biome' + this.day), rankIdx(riftRank(this.rift.level)));
        const B = BIOMES_RIFT[this.rift.biome.id];
        this.log(`Dawn: the Rift opens onto ${B.name}${this.rift.biome.surge ? ' — a SURGE, a rank above its own' : ''}. ${B.rule}`, this.rift.biome.surge ? 'danger' : 'major');
        this.rerollRift();
      }
    }
    if (this.tick_ % 600 === 0 && this.unreachable.size) {
      for (const [k, v] of this.unreachable) if (v <= this.tick_) this.unreachable.delete(k);
    }

    // Morale drifts back to a baseline set by average colonist mood.
    if (this.tick_ % 60 === 0) {
      const avg = this.colonists.length ? this.colonists.reduce((s, c) => s + c.mood, 0) / this.colonists.length : 50;
      this.morale += clamp(avg - this.morale, -1.5, 1.5) * 0.4;
      this.morale = clamp(this.morale, 0, 100);
    }

    sampleHistory(this);
    separateUnits(this);   // whatever spawned this tick gets its own tile before anyone draws it

    // Loss: everyone dead — or everyone down at once, with nobody left
    // standing to carry them. (Anyone off-map on the road doesn't count.)
    if (!this.gameOver) {
      const here = this.colonists.filter(c => !c.dead && !c.away);
      if (this.colonists.length === 0) {
        this.gameOver = { tick: this.tick_, day: this.day, reason: 'The hold is empty.' };
        this.log('The hold is empty. The run is over.', 'danger');
      } else if (here.length && here.every(c => c.downed)) {
        this.gameOver = { tick: this.tick_, day: this.day, reason: 'Every last one of them is down.' };
        this.log('The last of them falls. Nobody is left standing. The run is over.', 'danger');
      }
    }
    return this;
  }

  run(ticks) { for (let i = 0; i < ticks && !this.gameOver; i++) this.step(); return this; }

  /** Jobs, occupancy, colonists and chatter on one map, through its view. */
  tickMapCore(v) {
    if (v.jobsDirty || this.tick_ % 30 === 0) rebuildJobs(v);
    // One body per tile. Anything that arrived without walking last tick — a
    // wave, a litter, a party home from the Rift — is nudged aside here, and
    // the occupancy map is fresh for everyone who moves this tick.
    separateUnits(v);
    const id = v._m.id;
    for (let i = this.colonists.length - 1; i >= 0; i--) {
      const c = this.colonists[i];
      if (!c || (c.mapId || 0) !== id) continue;
      tickColonist(v, c);
      if (c.task && c.task.kind === 'socialize' && (c.task.workLeft ?? c.task.work) <= 0) {
        resolveSocializeTask(v, c, c.task.targetId);
        c.task = null;
      }
    }
    tickSocial(v);
  }

  // --- Rift floors -----------------------------------------------------------
  // The inside of the Rift is a stack of floors, each a map of its own (see
  // floors.js). Floor n exists once someone has gone down to it; a floor
  // nobody is standing on is let go at dawn and comes back reshaped.
  /** How deep the Rift goes today: one floor per level. */
  get floorCount() { return Math.max(1, this.rift.level); }
  get floors() { return this.maps.filter(m => m.kind === 'floor').sort((a, b) => a.depth - b.depth); }
  floorAt(depth) { return this.maps.find(m => m.kind === 'floor' && m.depth === depth) || null; }
  ensureFloor(depth) {
    const have = this.floorAt(depth);
    if (have) return have;
    const level = this.rift.level;
    const biomeId = this.rift.biome ? this.rift.biome.id : 'goblin_warrens';
    const id = this.nextMapId++;
    const rng = this.rng.fork(`floor:${level}:${depth}:${this.day}:${id}`);
    const f = generateFloor(rng.int(1, 1e9), { biomeId, depth, level, last: depth >= this.floorCount });
    const m = newMapState(id, 'floor', {
      depth, biome: biomeId, level, bornDay: this.day, rng: rng.fork('life'),
      world: f.world, raiders: f.monsters, beasts: f.beasts, visited: false, lairCleared: false,
    });
    placeMerchant(this, m, f, rng.fork('merchant'));
    this.maps.push(m);
    return m;
  }

  /** The walkable tile at the Rift's mouth nearest the camp: the camp's way down. */
  gateMouth() {
    const w = this.maps[0].world, r = w.rift;
    const ring = (r && r.ring || []).filter(([x, y]) => w.walkable(x, y));
    ring.sort((a, b) => Math.hypot(a[0] - w.start.x, a[1] - w.start.y) - Math.hypot(b[0] - w.start.x, b[1] - w.start.y));
    return ring.length ? { x: ring[0][0], y: ring[0][1] } : { x: w.start.x, y: w.start.y - 4 };
  }

  /** Where on map `m` the way `dir` ('up' | 'down') is, or null if there isn't one. */
  stairsOn(m, dir) {
    if (m.kind === 'camp') return dir === 'down' ? this.gateMouth() : null;
    return dir === 'up' ? m.world.stairsUp : m.world.stairsDown;
  }

  /** Send colonists to the stairs (or the gate); they change maps when they get there. */
  orderTravel(ids, dir, recall = false) {
    let n = 0;
    for (const id of ids) {
      const c = this.colonists.find(k => k.id === id && !k.away && !k.dead);
      if (!c) continue;
      const s = this.stairsOn(this.mapOf(c), dir);
      if (!s) continue;
      c.order = { x: s.x, y: s.y, travel: dir, recall }; c.task = null; c.path = null;
      n++;
    }
    return n;
  }

  /** Put a colonist on another map at (x, y). Occupancy sorts out a crowded arrival next tick. */
  moveToMap(npc, to, x, y) {
    const from = this.mapOf(npc);
    if (from && from.occ) from.occ = null;
    npc.mapId = to.id;
    npc.x = x; npc.y = y;
    npc.path = null; npc.pathGoal = null; npc.task = null; npc.order = null; npc.state = 'idle';
    to.occ = null;
    to.jobsDirty = true;
  }

  /** Take the stairs `dir` from wherever `npc` stands. Returns whether they went. */
  useStairs(npc, dir, recall = false) {
    const from = this.mapOf(npc);
    let to, at;
    if (dir === 'down') {
      if (from.kind === 'camp') {
        if (this.isNight) { this.log(`${npc.name.short} won't go in — the Rift is open and spewing until dawn.`, 'warn', npc.id); return false; }
        to = this.ensureFloor(1);
      } else {
        if (!from.world.stairsDown || from.depth >= this.floorCount) return false;
        to = this.ensureFloor(from.depth + 1);
      }
      at = to.world.stairsUp;
    } else {
      if (from.kind === 'camp') return false;
      if (from.depth === 1) { to = this.maps[0]; at = this.gateMouth(); }
      else { to = this.ensureFloor(from.depth - 1); at = to.world.stairsDown || to.world.stairsUp; }
    }
    if (from.kind === 'camp' && !this.delve) this.startDelve();
    if (from.kind === 'camp') this.provision(npc);
    if (this.delve) { this.delve.members.add(npc.id); this.delve.maxDepth = Math.max(this.delve.maxDepth, to.depth || 0); }
    const ox = npc.x, oy = npc.y;
    this.moveToMap(npc, to, at.x, at.y);
    bringFollowers(this, npc, from, to, ox, oy, at);
    // Called home: keep climbing until they're out.
    if (recall && dir === 'up' && to.kind === 'floor' && to.world.stairsUp) npc.order = { x: to.world.stairsUp.x, y: to.world.stairsUp.y, travel: 'up', recall: true };
    if (to.kind === 'camp') {
      // Unused flasks go back on the shelf; the pack goes into the stores.
      for (const id of npc.beltLoaded || []) this.givePotion(id);
      npc.beltLoaded = null;
      const n = unloadPack(this, npc, addResource);
      this.log(`${npc.name.short} climbs out of the Rift${n ? ` with ${n} goods in the pack` : ''}.`, 'info', npc.id);
    } else if (!to.visited && dir === 'down') {
      to.visited = true;
      const B = BIOMES_RIFT[to.biome];
      this.log(`${npc.name.short} reaches floor ${to.depth} of the Rift — ${B ? B.name : 'the dark'}.${to.depth >= this.floorCount ? ' The lair is somewhere on this one.' : ''}`, 'major', npc.id);
    }
    return true;
  }

  /** The first step through the gate starts a delve: its record fills in as it goes. */
  startDelve() {
    const B = BIOMES_RIFT[this.rift.biome ? this.rift.biome.id : 'goblin_warrens'];
    this.delve = {
      id: this.nextExpeditionId++, startTick: this.tick_, logFrom: this.logs.length,
      theme: B ? B.name : 'the Rift', level: this.rift.level, members: new Set(),
      maxDepth: 0, kills: 0, cleared: 0, lair: false,
      loot: { resources: {}, items: [], reagents: {}, trophies: {} },
    };
    this.stats.expeditions++;
  }

  /**
   * A delve is over when nobody who went down is still on a floor. Its outcome:
   * lost if none of them came back, cleared if a floor (or the lair) was
   * emptied on the way, withdrawn otherwise.
   */
  checkDelve() {
    const d = this.delve;
    if (!d) return;
    // Still going on while anyone is below — or still walking to the gate to join them.
    const below = this.colonists.some(c => !c.dead && ((c.mapId || 0) !== 0 || (c.order && c.order.travel === 'down')));
    if (below) return;
    const back = [...d.members].filter(id => this.colonists.some(c => c.id === id && !c.dead)).length;
    const outcome = back === 0 ? 'wipe' : (d.cleared > 0 || d.lair) ? 'clear' : 'retreat';
    if (outcome === 'clear') this.stats.cleared++;
    const log = this.logs.slice(d.logFrom).filter(l => /^F\d|Rift/.test(l.text)).slice(-120).map((l, i) => ({ tick: i, text: l.text, kind: l.kind, room: null }));
    this.expeditionHistory.push({
      id: d.id, dungeon: `${d.theme}, ${d.maxDepth ? 'to floor ' + d.maxDepth : 'the threshold'}`, theme: d.theme, tier: d.level,
      outcome, kills: d.kills, rooms: d.cleared, loot: d.loot, log, combatStats: null,
      members: [...d.members], tick: this.tick_, depth: d.maxDepth, lair: d.lair,
    });
    this.log(outcome === 'wipe' ? `Nobody comes back up out of the Rift.` : outcome === 'clear'
      ? `The delve is over: ${back} home, ${d.kills} kills, ${d.cleared} floor${d.cleared === 1 ? '' : 's'} cleared${d.lair ? ' — and the lair broken' : ''}.`
      : `The delve is over: ${back} home, ${d.kills} kills, deepest floor ${d.maxDepth}.`, outcome === 'wipe' ? 'danger' : 'major');
    this.delve = null;
  }

  /**
   * Going through the gate: two meals and a healing draught in the pack if
   * the stores can spare them, and their potion belt filled from the shelf.
   */
  provision(npc) {
    const pack = npc.pack || (npc.pack = {});
    const meals = Math.min(2, Math.floor(this.resources.meal || 0));
    if (meals) { this.resources.meal -= meals; pack.meal = (pack.meal || 0) + meals; }
    else {
      const food = Math.min(4, Math.floor(this.resources.food || 0));
      if (food) { this.resources.food -= food; pack.food = (pack.food || 0) + food; }
    }
    if ((this.resources.potion || 0) >= 1) { this.resources.potion--; pack.potion = (pack.potion || 0) + 1; }
    const want = (npc.belt || []).slice(0, beltSize(npc));
    npc.beltLoaded = want.filter(id => this.takePotion(id));
  }

  /** A Rift prop broke open on the map in scope (`this` is that map's view). */
  onPropOpened(npc, f, x, y) { openProp(this, npc, f, x, y); }
  /** The lair's master fell (`this` is the floor's view). */
  onLairBroken(boss) { lairReward(this, boss); }

  /** Dawn: floors nobody stands on are let go, to come back reshaped. */
  reshapeFloors() {
    const occupied = new Set(this.colonists.filter(c => !c.dead).map(c => c.mapId || 0));
    const before = this.maps.length;
    // A beast left alone on a floor that's going finds its own way home.
    for (const m of this.maps) {
      if (m.kind === 'camp' || occupied.has(m.id)) continue;
      const gate = this.gateMouth();
      for (const b of [...m.beasts]) if (b.tame && !b.dead) moveBeastTo(m, this.maps[0], b, gate.x, gate.y);
    }
    this.maps = this.maps.filter(m => m.kind === 'camp' || occupied.has(m.id));
    return before - this.maps.length;
  }

  /** One tick of a non-camp map. */
  tickMap(m) {
    const v = this.viewOf(m);
    this.tickMapCore(v);
    tickBeasts(v);
    tickFollowers(v);
    if (m.kind === 'floor') { tickFloorMonsters(v); tickFloorTraps(v); } else tickRaiders(v);
    tickCombat(v);
    separateUnits(v);
    if (this.tick_ % 600 === 0 && m.unreachable.size) {
      for (const [k, t] of m.unreachable) if (t <= this.tick_) m.unreachable.delete(k);
    }
  }

  // --- player commands ------------------------------------------------------
  designate(x, y, kind) { return designate(this, x, y, kind); }
  build(x, y, id) { return placeBlueprint(this, x, y, id); }
  buildFloor(x, y, id) { return placeFloorBlueprint(this, x, y, id); }
  rush(x, y) { return rushJob(this, x, y); }
  orderMove(ids, x, y) { return orderMove(this, ids, x, y); }
  orderWork(ids, x, y) { return orderWork(this, ids, x, y); }
  /**
   * Someone is down: the nearest able member of the selection goes to pick
   * them up and carry them to safety. Returns the rescuer, or null.
   */
  orderRescue(ids, patientId) {
    const p = this.colonists.find(c => c.id === patientId && c.downed && !c.dead);
    if (!p || p.carriedBy) return null;
    const able = ids.map(id => this.colonists.find(c => c.id === id)).filter(c => c && c !== p && !c.dead && !c.downed && !c.carrying && (c.mapId || 0) === (p.mapId || 0));
    if (!able.length) return null;
    able.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const r = able[0];
    r.order = { rescue: p.id }; r.task = null; r.path = null;
    return r;
  }

  /** Focus a squad on one enemy: they close on it and fight it until it falls. */
  orderAttack(ids, targetId) {
    let n = 0;
    for (const id of ids) {
      const c = this.colonists.find(k => k.id === id && !k.dead && !k.downed);
      if (!c) continue;
      c.order = { attack: targetId }; c.task = null; c.path = null;
      n++;
    }
    return n;
  }
  siteJobAt(x, y) { return siteJobAt(this, x, y); }
  /** 0–1 done on a mine/harvest/build/floor site, or null if nothing's there. */
  siteProgress(x, y) {
    const job = siteJobAt(this, x, y);
    if (!job) return null;
    return 1 - siteWorkLeft(this, job.kind, x, y, job.work) / job.work;
  }
  designateRect(x0, y0, x1, y1, kind) {
    let n = 0;
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        if (kind.build ? this.build(x, y, kind.build) : this.designate(x, y, kind)) n++;
    return n;
  }
  setPriority(npcId, job, value) {
    const c = this.colonists.find(x => x.id === npcId);
    if (!c) return false;
    c.priorities[job] = clamp(value, 0, 4);
    this.jobsDirty = true;
    return true;
  }
  setResearch(id) {
    if (!this.researchDefs[id]) return false;
    if (this.research.done.has(id)) return false;
    if (!this.researchDefs[id].req.every(q => this.research.done.has(q))) return false;
    this.research.current = id;
    this.research.progress = 0;
    return true;
  }
  /**
   * Queue a project and every unfinished prerequisite it needs, in an order
   * that can actually be researched. The colony works through the queue as
   * each project completes.
   */
  queueResearch(id) {
    const defs = this.researchDefs;
    if (!defs[id] || this.research.done.has(id)) return false;
    const order = [];
    const visit = (t) => {
      if (this.research.done.has(t) || order.includes(t)) return;
      for (const r of defs[t].req) visit(r);
      if (t !== this.research.current) order.push(t);
    };
    visit(id);
    this.research.queue = [...this.research.queue.filter(x => !order.includes(x)), ...order];
    if (!this.research.current) pickNextResearch(this);
    return true;
  }
  unqueueResearch(id) {
    this.research.queue = this.research.queue.filter(x => x !== id);
  }
  // --- schools and classes ---------------------------------------------------
  /** Is a school (or its academy) for this line built? */
  hasSchool(school, academyOnly = false) {
    const S = SCHOOLS[school];
    if (!S) return false;
    if (this.world.findBuildings(S.academy).length) return true;
    return !academyOnly && this.world.findBuildings(S.building).length > 0;
  }
  /** Students a school line can hold: one per four tiles of school building. */
  schoolCapacity(school) {
    const S = SCHOOLS[school];
    const tiles = this.world.findBuildings(S.building).length + this.world.findBuildings(S.academy).length;
    return Math.max(tiles ? 1 : 0, Math.ceil(tiles / 4));
  }
  /** Enrol a colonist to train into a class at its school. */
  enroll(npcId, klass) {
    const c = this.colonists.find(x => x.id === npcId);
    if (!c) return 'No such colonist.';
    const info = CLASS_INFO[klass];
    if (!info) return 'Not a trainable class.';
    if (!this.hasSchool(info.school)) return `Needs a ${SCHOOLS[info.school].name}.`;
    if (c.training) return 'Already training.';
    const why = classRequirement(c, klass);
    if (why) return why;
    const students = this.colonists.filter(x => x.training && !x.training.tome && CLASS_INFO[x.training.klass].school === info.school).length;
    if (students >= this.schoolCapacity(info.school)) return 'The school is full — build more of it.';
    c.training = { klass, progress: 0, need: SCHOOLS[info.school].days * TICKS_PER_DAY };
    this.log(`${c.name.short} enrols to train as a ${CLASSES[klass].name}.`, 'info', c.id);
    return '';
  }
  cancelTraining(npcId) { const c = this.colonists.find(x => x.id === npcId); if (c) c.training = null; }
  /** Read a Class Tome: a day's study, no school needed. */
  readTome(npcId, klass) {
    const c = this.colonists.find(x => x.id === npcId);
    if (!c) return 'No such colonist.';
    if ((this.reagents.class_tome || 0) < 1) return 'No Class Tome in the stash.';
    if (c.training) return 'Already training.';
    const why = classRequirement(c, klass);
    if (why) return why;
    this.reagents.class_tome--;
    c.training = { klass, progress: 0, need: TICKS_PER_DAY, tome: true };
    this.log(`${c.name.short} opens a Class Tome: ${CLASSES[klass].name}.`, 'good', c.id);
    return '';
  }
  /** Take a prestige path — needs the line's academy. */
  choosePrestige(npcId, pathId) {
    const c = this.colonists.find(x => x.id === npcId);
    if (!c || !CLASS_INFO[c.klass]) return 'No such colonist.';
    const school = CLASS_INFO[c.klass].school;
    if (!this.hasSchool(school, true)) return `Needs a ${SCHOOLS[school].upgrade}.`;
    const why = choosePrestigePath(c, pathId);
    if (!why) this.log(`${c.name.short} takes the path of the ${PRESTIGE[c.klass].find(p => p.id === pathId).name}.`, 'major', c.id);
    return why;
  }
  /** Hourly: students study, and schools train class XP up to their cap. */
  tickSchools() {
    for (const c of this.colonists) {
      if (c.away || c.dead) continue;
      const t = c.training;
      if (t) {
        const info = CLASS_INFO[t.klass];
        // An instructor of the class, level 5 or better, doubles the pace.
        const teacher = this.colonists.some(x => x !== c && !x.away && x.klass === t.klass && x.level >= 5);
        t.progress += TICKS_PER_HOUR * (teacher && !t.tome ? 2 : 1);
        t.teacher = teacher;
        if (t.progress >= t.need) {
          const wasAdventurer = !!c.tree;
          changeClass(c, t.klass);
          for (const sl of ['weapon', 'offhand']) {
            const it = c.equipment[sl];
            if (it && canEquip(c, it)) { this.armory.push(it); c.equipment[sl] = null; }
          }
          if (this.autoSkills) autoAllocate(c, this.rng.fork('grad' + c.id));
          refresh(c);
          addThought(c, wasAdventurer ? 'starting_over' : 'graduated');
          this.log(`${c.name.short} is now a ${CLASSES[t.klass].name}!`, 'major', c.id);
          c.training = null;
        }
        continue;
      }
      if (!c.tree || !CLASS_INFO[c.klass]) continue;
      const school = CLASS_INFO[c.klass].school;
      const cap = this.hasSchool(school, true) ? 20 : this.hasSchool(school) ? 10 : 0;
      if (c.level < cap) awardXp(this, c, 6);
    }
  }

  // --- the magic economy -------------------------------------------------------
  /** Teach a colonist a spellbook from the library. */
  learnBook(npcId, id) {
    const c = this.colonists.find(x => x.id === npcId);
    if (!c) return 'No such colonist.';
    if (!(this.library.books[id] > 0)) return 'No such book in the library.';
    const why = bookRequirement(c, id);
    if (why) return why;
    this.library.books[id]--;
    c.learned = [...(c.learned || []), id];
    if (c.tree && c.tree.loadout.length < LOADOUT_SLOTS) toggleLoadout(c, id);
    refresh(c);
    this.log(`${c.name.short} learns ${ABILITIES[id].name}.`, 'good', c.id);
    return '';
  }
  /** Hourly: the arcane peddler comes and goes; the spellmason restocks weekly. */
  tickMagic() {
    if (this.peddler && this.tick_ > this.peddler.expires) { this.log('The arcane peddler packs up and leaves.', 'info'); this.peddler = null; }
    if (!this.peddler && this.research.done.has('arcane_theory') && this.day >= this.nextPeddlerDay) {
      this.peddler = { stock: rollMagicStock(this.rng.fork('ped' + this.day), rankIdx(riftRank(this.rift.level))), expires: this.tick_ + TICKS_PER_DAY * 2 };
      this.nextPeddlerDay = this.day + this.rng.fork('pednext' + this.day).int(6, 8);
      this.log('An arcane peddler sets up at the edge of camp: scrolls, spellbooks, reagents.', 'good');
    }
    if (this.world.findBuildings('spellmason').length && (!this.spellmasonStock || this.day - this.spellmasonDay >= 7)) {
      this.spellmasonStock = rollMagicStock(this.rng.fork('sm' + this.day), rankIdx(riftRank(this.rift.level)), true);
      this.spellmasonDay = this.day;
    }
  }
  /** Buy from the peddler ('peddler') or the spellmason ('spellmason'). kind: scrolls|books|potions|reagents */
  buyMagic(from, kind, id) {
    const shop = from === 'peddler' ? this.peddler && this.peddler.stock : this.spellmasonStock;
    if (from === 'spellmason') { const st = shopStatus(this, 'spellmason'); if (!st.open) return st.why; }
    if (!shop || !(shop[kind][id] > 0)) return 'Not in stock.';
    const price = kind === 'books' ? bookPrice(id) : kind === 'scrolls' ? scrollPrice(id) : kind === 'reagents' ? (id === 'class_tome' ? 400 : 25) : 30;
    const cost = Math.round(price * (from === 'spellmason' ? 1.1 : 1));
    if ((this.resources.gold || 0) < cost) return `Costs ${cost} gold.`;
    this.resources.gold -= cost;
    shop[kind][id]--;
    if (kind === 'books') this.library.books[id] = (this.library.books[id] || 0) + 1;
    else if (kind === 'scrolls') this.library.scrolls[id] = (this.library.scrolls[id] || 0) + 1;
    else if (kind === 'potions') this.givePotion(id);
    else this.reagents[id] = (this.reagents[id] || 0) + 1;
    return '';
  }
  /** The spellmason copies a book you own. */
  copyBook(id) {
    { const st = shopStatus(this, 'spellmason'); if (!st.open) return st.why; }
    if (!(this.library.books[id] > 0)) return 'You need a copy to copy.';
    const cost = { dust: 5, cloth: 3, gold: Math.round(bookPrice(id) * 0.3) };
    for (const [k, v] of Object.entries(cost)) if ((this.resources[k] || 0) < v) return `Needs ${v} ${k}.`;
    for (const [k, v] of Object.entries(cost)) this.resources[k] -= v;
    this.library.books[id]++;
    return '';
  }
  sellBook(id) {
    { const st = shopStatus(this, 'spellmason'); if (!st.open) return st.why; }
    if (!(this.library.books[id] > 0)) return 'Nothing to sell.';
    this.library.books[id]--;
    this.resources.gold = (this.resources.gold || 0) + Math.round(bookPrice(id) * 0.4);
    return '';
  }
  /** Research a spell part at the Magic Lab, paid in Insight. */
  researchPart(kind, id) {
    if (!this.world.findBuildings('magic_lab').length) return 'Needs a Magic Lab.';
    if (this.spellParts[kind].includes(id)) return 'Already known.';
    const cost = partCost(kind, id);
    if ((this.resources.knowledge || 0) < cost) return `Needs ${cost} Insight.`;
    this.resources.knowledge -= cost;
    this.spellParts[kind].push(id);
    return '';
  }
  /** Design a spell and write it into a book. */
  designSpell(name, form, element, mods, school = 'arcane') {
    if (!this.world.findBuildings('magic_lab').length) return 'Needs a Magic Lab.';
    if (!this.spellParts.forms.includes(form) || !this.spellParts.elements.includes(element) || mods.some(m => !this.spellParts.mods.includes(m))) return 'Research those parts first.';
    const b = spellBudget(form, element, mods);
    if (!b.ok) return b.why;
    const cost = writeCost(form, element, mods);
    for (const [k, v] of Object.entries(cost)) { const have = ESSENCE_INGREDIENTS.has(k) ? (this.reagents[k] || 0) : (this.resources[k] || 0); if (have < v) return `Needs ${v} ${k}.`; }
    for (const [k, v] of Object.entries(cost)) { if (ESSENCE_INGREDIENTS.has(k)) this.reagents[k] -= v; else this.resources[k] -= v; }
    const id = 'spell_' + this.seedString.replace(/\W/g, '').slice(0, 6) + '_' + (Object.keys(this.customSpells).length + 1);
    const ab = buildSpell(name || 'Unnamed Spell', form, element, mods, school);
    this.customSpells[id] = ab;
    ABILITIES[id] = ab;
    this.library.books[id] = (this.library.books[id] || 0) + 1;
    this.log(`The Magic Lab writes a new spell: ${ab.name}.`, 'major');
    return '';
  }

  /** Equip an armory item. Returns '' on success or the reason it cannot be worn. */
  equip(npcId, itemIndex) {
    const c = this.colonists.find(x => x.id === npcId);
    const item = this.armory[itemIndex];
    if (!c || !item) return 'Nothing to equip.';
    const slot = item.slot || (item.kind === 'weapon' ? 'weapon' : 'armor');
    // A two-hander frees the off hand first; an off-hand item frees a two-hander.
    if (slot === 'weapon' && item.hands === 2 && c.equipment.offhand) { this.armory.push(c.equipment.offhand); c.equipment.offhand = null; }
    if (slot === 'offhand' && c.equipment.weapon && c.equipment.weapon.hands === 2) return 'The main-hand weapon needs both hands.';
    const why = canEquip(c, item);
    if (why) return why;
    const old = c.equipment[slot];
    c.equipment[slot] = item;
    this.armory.splice(this.armory.indexOf(item), 1);
    if (old) this.armory.push(old);
    refresh(c);
    return '';
  }
  unequip(npcId, slot) {
    const c = this.colonists.find(x => x.id === npcId);
    if (!c || !c.equipment[slot]) return false;
    this.armory.push(c.equipment[slot]);
    c.equipment[slot] = null;
    refresh(c);
    return true;
  }
  /** Two gear kits at a smithy become a new piece of gear for the chosen slot. */
  forge(slot) {
    if (!this.world.findBuildings('smithy').length) return 'Needs a smithy.';
    if ((this.resources.gear || 0) < 2) return 'Needs 2 gear kits.';
    this.resources.gear -= 2;
    const smith = Math.max(0, ...this.colonists.filter(c => !c.away).map(c => c.skills.smithing || 0));
    const tier = Math.max(1, (this.rift ? this.rift.level : 1));
    const item = forgeItem(this.rng, slot, tier, smith);
    this.armory.push(item);
    this.log(`The smithy forges ${item.name} (${item.rarity}).`, 'good');
    return '';
  }
  /** Forge a consistent-tier piece (economy.js). */
  forgeTier(slot, tierId, npcId = null) { return forgeTier(this, slot, tierId, npcId); }
  /** Queue an upgrade on the building at (x, y). */
  upgrade(x, y) { return orderUpgrade(this, x, y); }

  /** A trophy and materials become a named legendary. */
  craftLegendary(id) {
    const R = LEGENDARY_RECIPES[id];
    if (!R) return 'Unknown recipe.';
    if (!this.world.findBuildings('smithy').length) return 'Needs a smithy.';
    if (!(this.trophies[R.trophy] > 0)) return 'Missing the trophy.';
    for (const [k, v] of Object.entries(R.cost)) if ((this.resources[k] || 0) < v) return `Needs ${v} ${k}.`;
    for (const [k, v] of Object.entries(R.cost)) this.resources[k] -= v;
    this.trophies[R.trophy]--;
    const item = generateItem(this.rng, { legendary: id, tier: Math.max(3, this.rift ? this.rift.level : 3) });
    this.armory.push(item);
    this.log(`A legendary is forged: ${item.name}!`, 'major');
    return '';
  }
  /** Brew one potion at an alchemy table. Essences come from the reagent stash. */
  brew(id) {
    const P = POTIONS[id];
    if (!P) return 'Unknown potion.';
    if (!this.world.findBuildings('alchemy').length) return 'Needs an alchemy table.';
    for (const [k, v] of Object.entries(P.cost)) {
      const have = ESSENCE_INGREDIENTS.has(k) ? (this.reagents[k] || 0) : (this.resources[k] || 0);
      if (have < v) return `Needs ${v} ${k}.`;
    }
    for (const [k, v] of Object.entries(P.cost)) {
      if (ESSENCE_INGREDIENTS.has(k)) this.reagents[k] -= v; else this.resources[k] -= v;
    }
    if (id === 'minor_healing') this.resources.potion = (this.resources.potion || 0) + 1;
    else this.potions[id] = (this.potions[id] || 0) + 1;
    return '';
  }
  potionCount(id) { if (id.startsWith('scroll:')) return this.library.scrolls[id.slice(7)] || 0; return id === 'minor_healing' ? Math.floor(this.resources.potion || 0) : (this.potions[id] || 0); }
  takePotion(id) {
    if (this.potionCount(id) <= 0) return false;
    if (id.startsWith('scroll:')) this.library.scrolls[id.slice(7)]--;
    else if (id === 'minor_healing') this.resources.potion--; else this.potions[id]--;
    return true;
  }
  givePotion(id, n = 1) { if (id.startsWith('scroll:')) { const k = id.slice(7); this.library.scrolls[k] = (this.library.scrolls[k] || 0) + n; return; } if (id === 'minor_healing') this.resources.potion = (this.resources.potion || 0) + n; else this.potions[id] = (this.potions[id] || 0) + n; }
  upgradeGear(npcId) {
    // Spend a gear kit to reinforce one equipped piece (up to +5).
    const c = this.colonists.find(x => x.id === npcId);
    if (!c || (this.resources.gear || 0) < 1) return false;
    const pieces = ['weapon', 'armor', 'offhand', 'head', 'feet'].map(k => c.equipment[k]).filter(it => it && (it.reinforced || 0) < 5);
    if (!pieces.length) return false;
    this.resources.gear--;
    const it = this.rng.pick(pieces);
    it.reinforced = (it.reinforced || 0) + 1;
    if (it.dmg) it.dmg = [it.dmg[0] + 1, it.dmg[1] + 2];
    else it.armor = (it.armor || 0) + 1;
    it.name = it.name.replace(/ \+\d$/, '') + ' +' + it.reinforced;
    refresh(c);
    this.log(`${c.name.short}'s ${it.name} is reinforced.`, 'good', c.id);
    return true;
  }

  /**
   * Send a party into the Rift: they walk to the gate and step through onto
   * floor 1, and from there they are played like anyone in camp. (The first
   * argument is kept so older callers still line up; the Rift has one way in.)
   */
  launchExpedition(_dungeon, memberIds, stance = 'balanced') {
    if (this.isNight) return { ok: false, why: 'The Rift is open and spewing — parties can only go in by day.' };
    const members = this.colonists.filter(c => memberIds.includes(c.id) && !c.away && !c.dead && !c.mapId);
    if (!members.length) return { ok: false, why: 'No available party members.' };
    const n = this.orderTravel(members.map(c => c.id), 'down');
    this.rift.entries++;
    this.log(`${n} head${n === 1 ? 's' : ''} for the Rift Gate.`, 'major');
    return { ok: true, ids: members.map(c => c.id), stance };
  }
  /** Choose what a field grows. Returns false if the crop cannot grow there. */
  setCrop(x, y, cropId) {
    const b = this.world.buildingAt(x, y);
    if (!b || !b.done) return false;
    if (BUILDINGS[b.id].job !== 'farm') return false;
    if (!CROPS[cropId]) return false;
    b.crop = cropId;
    b.growth = 0;
    b.planted = false;
    this.jobsDirty = true;
    return true;
  }
  /** Best crop for this tile right now, for the UI's suggestion. */
  suggestCrop(x, y) { return recommendCrop(this.farmContext(x, y)); }

  /** Mark a tamed beast for slaughter. */
  /** Send the best animal-handler of a selection to tame a wild beast now. Returns who went. */
  orderTame(ids, beastId) {
    const b = this.beasts.find(k => k.id === beastId && !k.dead && !k.tame);
    if (!b) return null;
    const able = ids.map(id => this.colonists.find(c => c.id === id && !c.dead && !c.downed && !c.away)).filter(Boolean);
    if (!able.length) return null;
    able.sort((p, q) => (q.skills.animals || 0) - (p.skills.animals || 0) || Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y));
    const c = able[0], work = ANIMALS[b.species].wildAggressive ? 110 : 70;
    c.order = null; c.path = null;
    c.task = { kind: 'tame', x: b.x, y: b.y, work, workLeft: work, skill: 'animals', beastId: b.id, claim: c.id, ordered: true };
    return c;
  }
  /** Hunt a beast: everyone selected closes on it and strikes until it drops. */
  orderHunt(ids, beastId) {
    const b = this.beasts.find(k => k.id === beastId && !k.dead);
    if (!b) return 0;
    let n = 0;
    for (const id of ids) {
      const c = this.colonists.find(k => k.id === id && !k.dead && !k.downed && !k.away);
      if (!c) continue;
      c.order = null; c.path = null;
      c.task = { kind: 'hunt', x: b.x, y: b.y, work: 16, workLeft: 16, skill: 'melee', beastId: b.id, ordered: true };
      n++;
    }
    return n;
  }
  markButcher(beastId) {
    const b = this.beasts.find(x => x.id === beastId);
    if (!b || !b.tame) return false;
    b.markedButcher = !b.markedButcher;
    this.jobsDirty = true;
    return b.markedButcher;
  }
  /**
   * Give a war or pack beast a handler (a colonist id), or none. It follows
   * them into the Rift and back, fights beside them and carries for them.
   */
  setHandler(beastId, colonistId) {
    let b = null;
    for (const m of this.maps) { b = m.beasts.find(x => x.id === beastId); if (b) break; }
    if (!b || !canFollow(b)) return false;
    const c = colonistId == null ? null : this.colonists.find(x => x.id === colonistId && !x.dead);
    b.handler = c ? c.id : null;
    return true;
  }

  acceptArrival(i) { return acceptArrival(this, i); }
  rejectArrival(i) { return rejectArrival(this, i); }
  buy(res, qty) { return tradeBuy(this, res, qty); }
  buyLivestock(n = 1) { return buyLivestock(this, n); }
  sell(res, qty) { return tradeSell(this, res, qty); }

  // --- readouts for UI / tests ---------------------------------------------
  snapshot() {
    return {
      seed: this.seedString, tick: this.tick_, day: this.day, hour: this.hour,
      population: this.population, wealth: this.wealth, threat: +this.threat.toFixed(2),
      morale: Math.round(this.morale), tier: this.colonyTier, riftLevel: this.rift.level, waves: this.rift.waves,
      resources: { ...this.resources },
      research: { done: [...this.research.done], current: this.research.current, progress: Math.round(this.research.progress) },
      avgMood: this.colonists.length ? Math.round(this.colonists.reduce((s, c) => s + c.mood, 0) / this.colonists.length) : 0,
      avgHostility: this.colonists.length ? Math.round(this.colonists.reduce((s, c) => s + c.hostility, 0) / this.colonists.length) : 0,
      season: this.season, year: this.year, biome: this.biome,
      livestock: this.livestock.length, wildlife: this.wildlife.length, herdCap: this.herdCap,
      harvests: this.harvests, sitesKnown: this.overworld.discovered().length,
      expeditions: this.expeditionHistory.length, below: this.colonists.filter(c => c.mapId).length, cleared: this.stats.cleared,
      deaths: this.graveyard.length, buildings: this.world.findBuildings().length,
      stats: { ...this.stats }, gameOver: !!this.gameOver,
    };
  }
  colonistSummary(c) {
    return {
      id: c.id, name: c.name.full, race: c.race, klass: c.klass, level: c.level,
      hp: Math.round(c.hp), maxHp: c.maxHp, mood: c.mood, hostility: c.hostility,
      disposition: dispositionOf(c.hostility).name, power: powerOf(c),
      state: c.state, task: c.task ? c.task.kind : null, away: c.away,
      traits: c.traits, topSkills: SKILL_IDS.map(s => [s, c.skills[s]]).sort((a, b) => b[1] - a[1]).slice(0, 4),
    };
  }
}

for (const k of MAP_LOCAL) {
  Object.defineProperty(Game.prototype, k, {
    get() { return this._m[k]; },
    set(v) { this._m[k] = v; },
    configurable: true,
  });
}

export { STANCES, TICKS_PER_DAY, TICKS_PER_HOUR, findPath, dungeonPower, partyPower, generateDungeon, SEASONS, BIOMES, SITE_KINDS };
