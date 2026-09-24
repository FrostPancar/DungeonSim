// ============================================================================
// COLONY SIMULATION: jobs, needs, work, production, hauling, mental state.
// Operates on the Game object; no rendering, no DOM.
// ============================================================================
import { pay, benchSpeed } from './economy.js';
import { clamp } from './rng.js';
import {
  BUILDINGS, FLOORS, RECIPES, SKILLS, PASSION_XP, THOUGHTS, RESOURCES,
} from './data.js';
import { World, T, TERRAIN, FEATURES, findPath, findNearest, lineOfSight } from './world.js';
import { occupyMove, occupantAt, freeTileNear, swapUnits, formationTiles, rebuildOccupancy } from './occupancy.js';
import { traitMod, refresh, shiftHostility } from './npc.js';
import { CROPS, cropViability, recommendCrop, SOIL_DRAIN, growthStage } from './farming.js';
import { ANIMALS, tameChance, butcherBeast, isMature, beastMod, herdCap } from './husbandry.js';
import { nearestHostile, tickDowned, sendToSafety, ENGAGE, RANGED_R } from './realtime.js';

export const TICKS_PER_HOUR = 60;
export const TICKS_PER_DAY = TICKS_PER_HOUR * 24;

// Work speed from a skill level: level 0 is painfully slow, 20 is expert.
export function skillFactor(level) { return 0.35 + level * 0.115; }

export function workRate(game, npc, skillId) {
  const lvl = npc.skills[skillId] || 0;
  let r = skillFactor(lvl) * (1 + traitMod(npc, 'work'));
  const hour = Math.floor((game.tick % TICKS_PER_DAY) / TICKS_PER_HOUR);
  const night = hour < 6 || hour >= 20;
  r *= 1 + (night ? traitMod(npc, 'nightWork') : traitMod(npc, 'dayWork'));
  r *= clamp(0.45 + npc.mood / 100, 0.45, 1.35);       // misery slows work
  r *= clamp(0.3 + npc.needs.rest * 1.1, 0.3, 1.1);    // tiredness slows work
  return Math.max(0.05, r);
}

export function gainXp(game, npc, skillId, amount) {
  const pass = npc.passions[skillId] || 'none';
  const learnMod = 1 + traitMod(npc, 'learn');
  npc.xp[skillId] = (npc.xp[skillId] || 0) + amount * PASSION_XP[pass] * learnMod * game.xpRate;
  const lvl = npc.skills[skillId] || 0;
  const need = 110 + lvl * lvl * 5.5;
  if (npc.xp[skillId] >= need && lvl < 20) {
    npc.xp[skillId] -= need;
    npc.skills[skillId] = lvl + 1;
    refresh(npc);
    game.log(`${npc.name.short} reached ${SKILLS[skillId].name} ${lvl + 1}.`, 'skill', npc.id);
  }
}

// --- resources --------------------------------------------------------------
export function storageCap(game) {
  game = game.root;   // storage is the camp's, wherever the goods were found
  const v = game.world._bcVersion;
  if (game._capVersion === v && game._capBonus === (game.bonuses.storage || 0)) return game._capValue;
  let cap = 120 + (game.bonuses.storage || 0);
  for (const rec of game.world.findBuildings()) cap += BUILDINGS[rec.b.id].storage || 0;
  game._capVersion = v; game._capBonus = (game.bonuses.storage || 0); game._capValue = cap;
  return cap;
}
export function addResource(game, res, qty) {
  if (qty <= 0) return 0;
  const cap = storageCap(game);
  const cat = RESOURCES[res]?.cat;
  // Gold has no ceiling: it's coin in a chest, not goods on a shelf.
  const limit = res === 'gold' ? Infinity : (cat === 'basic' || cat === 'refined' || cat === 'goods') ? cap : cap * 4;
  const cur = game.resources[res] || 0;
  const added = Math.min(qty, Math.max(0, limit - cur));
  game.resources[res] = cur + added;
  if (added < qty) game.root.overflow += qty - added;
  return added;
}
export function hasResources(game, cost) {
  for (const k in cost) if ((game.resources[k] || 0) < cost[k]) return false;
  return true;
}
export function spend(game, cost) {
  for (const k in cost) game.resources[k] = (game.resources[k] || 0) - cost[k];
}

// --- designations & blueprints ---------------------------------------------
export function designate(game, x, y, kind) {
  const w = game.world;
  if (!w.inside(x, y)) return false;
  const i = w.idx(x, y);
  if (kind === 'cancel') {
    w.designation[i] = null;
    if (w.building[i] && !w.building[i].done) w.removeBuilding(x, y);
    if (w.floor[i] && !w.floor[i].done) { w.floor[i] = null; w.touch(); }
    game.jobsDirty = true;
    return true;
  }
  if (kind === 'mine') {
    if (!TERRAIN[w.terrain[i]].mineable && !(w.feature[i] && FEATURES[w.feature[i]].inRock)) return false;
    w.designation[i] = 'mine';
  } else if (kind === 'harvest') {
    const f = w.feature[i];
    if (!f || FEATURES[f].inRock) return false;
    w.designation[i] = 'harvest';
  }
  game.jobsDirty = true;
  return true;
}

/** Bump the job at (x, y) to the front of the queue — a right-click order. Expires
 *  on its own so a completed or re-cleared tile doesn't linger in the set. */
export function rushJob(game, x, y) {
  if (!game.rushed) game.rushed = new Map();
  game.rushed.set(`${x},${y}`, game.tick + 3000);
  game.jobsDirty = true;
}

/** A right-click move order: walk there and stand, overriding idle wandering
 *  and open-ended work (but not survival needs) until they arrive. */
export function orderMove(game, ids, x, y) {
  const squad = ids.map(id => game.colonists.find(c => c.id === id && !c.away && !c.dead)).filter(Boolean);
  if (!squad.length) return;
  if (!game.occ) rebuildOccupancy(game);
  // One body per tile: the squad forms up around the spot, nearest-first, and
  // whoever is already closest to a slot takes it.
  const slots = formationTiles(game, x, y, squad.length, new Set(squad));
  const left = [...squad];
  for (const [sx, sy] of slots) {
    let bi = 0, bd = Infinity;
    for (let k = 0; k < left.length; k++) {
      const d = Math.hypot(left[k].x - sx, left[k].y - sy);
      if (d < bd) { bd = d; bi = k; }
    }
    const npc = left.splice(bi, 1)[0];
    npc.order = { x: sx, y: sy }; npc.task = null;
  }
  for (const npc of left) { npc.order = { x, y }; npc.task = null; }   // no room: blockedStep will find one
}

// --- shared work sites --------------------------------------------------------
// Mining, cutting and building keep their progress on the tile rather than on
// whoever is swinging the pick, so two people on one seam finish it twice as
// fast, and a job put down for a meal is picked up where it was left.
const WORK_SITE_KINDS = { mine: 1, harvest: 1, build: 1, floor: 1 };

/** Who's good at clearing a feature: woodcutters fell trees, a prop names its own skill. */
function harvestSkill(f) { return FEATURES[f].skill || (f === 'tree' ? 'woodcutting' : 'farming'); }

/** What working the tile at (x, y) would mean right now, or null if nothing. */
export function siteJobAt(game, x, y) {
  const w = game.world;
  if (!w.inside(x, y)) return null;
  const i = w.idx(x, y);
  const b = w.building[i];
  if (b && !b.done) return { kind: 'build', work: BUILDINGS[b.id].work, skill: 'construction' };
  if (b && b.upgrade) return { kind: 'build', work: b.upgrade.workLeft, skill: 'construction' };
  const fl = w.floor[i];
  if (fl && !fl.done) return { kind: 'floor', work: FLOORS[fl.id].work, skill: 'construction' };
  const f = w.feature[i];
  if (TERRAIN[w.terrain[i]].mineable || (f && FEATURES[f].inRock)) {
    return { kind: 'mine', work: f && FEATURES[f].inRock ? FEATURES[f].work : TERRAIN[w.terrain[i]].work || 100, skill: 'mining' };
  }
  if (f && FEATURES[f].locked && !(game.root.keys > 0)) return null;   // a sealed vault needs a Rift key
  if (f) return { kind: 'harvest', work: FEATURES[f].work, skill: harvestSkill(f) };
  return null;
}

/** Work still owed on a site task's tile — the shared number every worker on it spends. */
export function siteWorkLeft(game, kind, x, y, full) {
  const w = game.world, i = w.idx(x, y);
  if (kind === 'build') { const b = w.building[i]; return b && !b.done ? b.workLeft : b && b.upgrade ? b.upgrade.workLeft : 0; }
  if (kind === 'floor') { const f = w.floor[i]; return f && !f.done ? f.workLeft : 0; }
  const left = game.siteWork && game.siteWork.get(i);
  return left == null ? full : left;
}

/** Is the thing this site task was working still there to be worked? */
function siteLive(game, t) {
  const w = game.world, i = w.idx(t.x, t.y);
  if (t.kind === 'mine') return w.designation[i] === 'mine';
  if (t.kind === 'harvest') return w.designation[i] === 'harvest' && !!w.feature[i];
  if (t.kind === 'build') return !!w.building[i] && (!w.building[i].done || !!w.building[i].upgrade);
  if (t.kind === 'floor') return !!w.floor[i] && !w.floor[i].done;
  return true;
}

/**
 * A right-click on something workable with a squad selected: everyone takes a
 * side of the tile and works it together. Each gets their own adjacent tile to
 * stand on, nearest first, so they surround the job instead of queueing for
 * the one square the pathfinder would have sent them all to.
 */
export function orderWork(game, ids, x, y) {
  const job = siteJobAt(game, x, y);
  if (!job) return false;
  const squad = ids.map(id => game.colonists.find(c => c.id === id && !c.away && !c.dead)).filter(Boolean);
  if (!squad.length) return false;
  const w = game.world, i = w.idx(x, y);
  if (job.kind === 'mine') w.designation[i] = 'mine';
  if (job.kind === 'harvest') w.designation[i] = 'harvest';
  if (!game.occ) rebuildOccupancy(game);
  const group = new Set(squad);
  const slots = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const sx = x + dx, sy = y + dy;
    if (!w.inside(sx, sy) || !w.walkable(sx, sy)) continue;
    const o = occupantAt(game, sx, sy);
    if (o && !group.has(o)) continue;
    // Sides before corners: a corner is still in reach, but it's the last pick.
    slots.push([sx, sy, dx && dy ? 1 : 0]);
  }
  slots.sort((a, b) => a[2] - b[2]);
  const left = [...squad];
  for (const [sx, sy] of slots) {
    if (!left.length) break;
    let bi = 0, bd = Infinity;
    for (let k = 0; k < left.length; k++) {
      const d = Math.hypot(left[k].x - sx, left[k].y - sy);
      if (d < bd) { bd = d; bi = k; }
    }
    const npc = left.splice(bi, 1)[0];
    npc.order = { x, y, work: job.kind, stand: [sx, sy] }; npc.task = null; npc.path = null;
  }
  // More hands than sides: the rest still help, from whatever reach they find.
  for (const npc of left) { npc.order = { x, y, work: job.kind, stand: null }; npc.task = null; npc.path = null; }
  game.jobsDirty = true;
  return true;
}

/** A walled building just went up around whoever was standing inside: step them out. */
function ejectFromFootprint(game, b) {
  const w = game.world, [x0, y0, fw, fh] = b.fp;
  const inside = (u) => u.x >= x0 && u.x < x0 + fw && u.y >= y0 && u.y < y0 + fh && !w.walkable(u.x, u.y);
  for (const u of [...game.colonists.filter(c => !c.away && (c.mapId || 0) === (game._m ? game._m.id : 0)), ...(game.beasts || []), ...(game.raiders || [])]) {
    if (u.x == null || !inside(u)) continue;
    const spot = findNearest(w, u.x, u.y, (x, y) => w.walkable(x, y), 8);
    if (spot) { u.x = spot[0]; u.y = spot[1]; u.path = null; }
  }
  game.occ = null;
}

export function placeBlueprint(game, x, y, id) {
  const w = game.world;
  if (!w.inside(x, y)) return false;
  const def = BUILDINGS[id];
  if (!def) return false;
  if (!game.unlocked.has(id)) return false;
  const i = w.idx(x, y);
  if (!w.canPlace(id, x, y)) return false;
  if (def.unique && w.findBuildings(id).length > 0) return false;
  if (def.dark === false && w.light[i] < 0.2) return false;
  w.putBuilding(id, x, y, { id, done: false, workLeft: def.work, hp: def.hp || 120, growth: 0, progress: 0, reservedBy: 0 });
  game.jobsDirty = true;
  return true;
}

/** A floor blueprint. Floors are their own layer under `w.building`, so a
 *  room can be floored and furnished at once — and refloored, since this
 *  happily replaces a finished floor with a new type. */
export function placeFloorBlueprint(game, x, y, id) {
  const w = game.world;
  if (!w.inside(x, y)) return false;
  const def = FLOORS[id];
  if (!def) return false;
  const i = w.idx(x, y);
  if (w.floor[i] && !w.floor[i].done) return false; // a floor job is already queued here
  if (TERRAIN[w.terrain[i]].solid) return false;
  if (w.feature[i] && FEATURES[w.feature[i]].solid) return false;
  w.floor[i] = { id, done: false, workLeft: def.work };
  w.touch();
  game.jobsDirty = true;
  return true;
}

// --- job discovery ----------------------------------------------------------
// Jobs are rebuilt from world state when something changes, then claimed by
// colonists. Cheap enough at this map size and keeps state impossible to desync.
export function rebuildJobs(game) {
  const w = game.world;
  const jobs = [];
  if (game.rushed) for (const [k, exp] of game.rushed) if (exp < game.tick) game.rushed.delete(k);
  const rushed = (x, y) => !!game.rushed && game.rushed.has(`${x},${y}`);
  for (let i = 0; i < w.designation.length; i++) {
    const d = w.designation[i];
    if (!d) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    if (d === 'mine') {
      const f = w.feature[i];
      const work = f && FEATURES[f].inRock ? FEATURES[f].work : TERRAIN[w.terrain[i]].work || 100;
      if (!TERRAIN[w.terrain[i]].mineable && !(f && FEATURES[f].inRock)) { w.designation[i] = null; continue; }
      jobs.push({ kind: 'mine', x, y, work, skill: 'mining', claim: 0, rush: rushed(x, y) });
    } else if (d === 'harvest') {
      const f = w.feature[i];
      if (!f) { w.designation[i] = null; continue; }
      jobs.push({ kind: 'harvest', x, y, work: FEATURES[f].work, skill: harvestSkill(f), claim: 0, rush: rushed(x, y) });
    }
  }
  for (let i = 0; i < w.building.length; i++) {
    const b = w.building[i];
    if (!b || (b.done && !b.upgrade)) continue;
    // A big blueprint takes builders on every tile at once (they share its work);
    // a finished one is upgraded from its door.
    if (b.done && !w.isAnchor(b, i)) continue;
    const { x, y } = b.done ? w.useTile(b, i) : { x: i % w.w, y: (i / w.w) | 0 };
    // An upgrade is built like anything else; it waits for its gold like anything waits for stone.
    if (b.done && !hasResources(game, b.upgrade.cost)) continue;
    jobs.push({ kind: 'build', x, y, work: b.done ? b.upgrade.workLeft : b.workLeft, skill: 'construction', claim: 0, rush: rushed(x, y) });
  }
  for (let i = 0; i < w.floor.length; i++) {
    const f = w.floor[i];
    if (!f || f.done) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    jobs.push({ kind: 'floor', x, y, work: f.workLeft, skill: 'construction', claim: 0, rush: rushed(x, y) });
  }
  for (const it of game.ground) {
    if (it.qty > 0 && !it.claimed) jobs.push({ kind: 'haul', x: it.x, y: it.y, work: 6, skill: 'hauling', claim: 0, ref: it });
  }
  // Workstation jobs
  for (let i = 0; i < w.building.length; i++) {
    const b = w.building[i];
    if (!b || !b.done || !w.isAnchor(b, i)) continue;
    const def = BUILDINGS[b.id];
    if (!def.job) continue;
    const { x, y } = w.useTile(b, i);
    if (def.job === 'farm') {
      // A field with no crop picks the best one for the ground and the season,
      // so farming works untouched but rewards a player who plans.
      if (!b.crop || (b.autoCrop && !b.planted)) {
        const pick = recommendCrop(game.farmContext(x, y));
        if (pick) { b.crop = pick; b.autoCrop = true; }
      }
      const crop = CROPS[b.crop];
      if (crop) {
        if (!b.planted) {
          if (hasResources(game, crop.seed)) jobs.push({ kind: 'plant', x, y, work: 26, skill: 'farming', claim: 0 });
        } else if (b.growth >= 1) {
          jobs.push({ kind: 'farmHarvest', x, y, work: 25, skill: 'farming', claim: 0 });
        } else if ((b.tended || 0) < game.tick) {
          jobs.push({ kind: 'farmTend', x, y, work: 20, skill: 'farming', claim: 0 });
        }
      }
    } else if (def.job === 'compost') {
      if ((b.tended || 0) < game.tick) jobs.push({ kind: 'compost', x, y, work: 70, skill: 'farming', claim: 0 });
    } else if (def.job === 'cook') {
      if ((game.resources.food || 0) >= RECIPES.meal.inputs.food && (game.resources.meal || 0) < 40)
        jobs.push({ kind: 'craft', recipe: 'meal', x, y, work: RECIPES.meal.work, skill: 'cooking', claim: 0 });
    } else if (def.job === 'craft') {
      const rid = def.recipe;
      const rec = RECIPES[rid];
      if (rec && hasResources(game, rec.inputs)) {
        const outKey = Object.keys(rec.outputs)[0];
        if ((game.resources[outKey] || 0) < 60)
          jobs.push({ kind: 'craft', recipe: rid, x, y, work: rec.work, skill: rec.skill, claim: 0 });
      }
    } else if (def.job === 'research') {
      if (game.research.current) jobs.push({ kind: 'research', x, y, work: def.researchWork || 40, skill: 'research', claim: 0 });
    } else if (def.job === 'train') {
      jobs.push({ kind: 'train', x, y, work: def.trainWork || 60, skill: 'melee', claim: 0, low: true, trainSkill: def.trainSkill });
    } else if (def.job === 'pray') {
      jobs.push({ kind: 'pray', x, y, work: 60, skill: 'faith', claim: 0, low: true });
    } else if (def.job === 'heal') {
      const patient = game.here.find(c => !c.away && !c.dead && c.injuries.some(inj => inj.heal > 0 && !inj.treated));
      if (patient) jobs.push({ kind: 'heal', x, y, work: 50, skill: 'medicine', claim: 0, target: patient.id });
    }
  }
  // --- livestock work -------------------------------------------------------
  const hasPasture = w.findBuildings('pasture').length > 0;
  const hasButchery = w.findBuildings('butchery').length > 0;
  const tameCount = game.beasts.filter(b => b.tame && !b.dead).length;
  const cap = herdCap(game);
  for (const beast of game.beasts) {
    if (beast.dead || beast.away) continue;
    if (!beast.tame) {
      // Only try to tame when there is somewhere to keep the animal.
      if (hasPasture && tameCount < cap && !ANIMALS[beast.species].wildAggressive)
        jobs.push({ kind: 'tame', x: beast.x, y: beast.y, work: 70, skill: 'animals', claim: 0, beastId: beast.id, low: true });
      else if (hasPasture && tameCount < cap)
        jobs.push({ kind: 'tame', x: beast.x, y: beast.y, work: 110, skill: 'animals', claim: 0, beastId: beast.id, low: true });
      continue;
    }
    if (beast.markedButcher && hasButchery)
      jobs.push({ kind: 'butcher', x: beast.x, y: beast.y, work: 45, skill: 'animals', claim: 0, beastId: beast.id });
    else if (beast.readyProduct > 0)
      jobs.push({ kind: 'gather', x: beast.x, y: beast.y, work: 22, skill: 'animals', claim: 0, beastId: beast.id });
  }

  game.jobs = jobs;
  game.jobsDirty = false;
}

const JOB_PRIORITY_KEY = {
  mine: 'mine', harvest: 'chop', build: 'build', floor: 'build', haul: 'haul',
  farmTend: 'farm', farmHarvest: 'farm', plant: 'farm', compost: 'farm',
  craft: 'craft', research: 'research', heal: 'heal', train: 'train', pray: 'pray',
  tame: 'animals', gather: 'animals', butcher: 'animals',
};

function jobPriority(npc, job) {
  const key = JOB_PRIORITY_KEY[job.kind];
  if (job.kind === 'craft' && job.recipe === 'meal') return npc.priorities.cook;
  return npc.priorities[key] ?? 2;
}

// --- needs & mood -----------------------------------------------------------
export function addThought(npc, id, mult = 1) {
  const def = THOUGHTS[id];
  if (!def) return;
  const existing = npc.thoughts.find(t => t.id === id);
  if (existing) { existing.left = def.dur; existing.stacks = Math.min(4, existing.stacks + 1); return; }
  npc.thoughts.push({ id, left: def.dur, stacks: 1, mult });
  if (npc.thoughts.length > 14) npc.thoughts.shift();
}

function updateMood(game, npc) {
  let m = 50 + traitMod(npc, 'mood');
  for (const t of npc.thoughts) {
    const def = THOUGHTS[t.id];
    if (def.dur === 0) continue; // transient handled below
    m += def.v * Math.min(2, 0.6 + t.stacks * 0.4) * (t.mult || 1);
  }
  const n = npc.needs;
  if (n.hunger < 0.12) m += THOUGHTS.starving.v;
  else if (n.hunger < 0.3) m += THOUGHTS.hungry.v;
  if (n.rest < 0.15) m += THOUGHTS.exhausted.v;
  if (npc.injuries.length) m += THOUGHTS.wounded.v * Math.min(3, npc.injuries.length) * 0.6;
  const i = game.world.idx(npc.x, npc.y);
  const beauty = game.world.beauty[i];
  if (beauty > 6) m += THOUGHTS.beauty.v;
  else if (beauty < 0.5 && game.world.light[i] < 0.15) m += THOUGHTS.dark.v;
  m += (game.bonuses.moodFlat || 0);
  npc.mood = clamp(Math.round(m), 0, 100);
  npc.moodAvg = npc.moodAvg * 0.995 + npc.mood * 0.005;
}

function tickNeeds(game, npc) {
  const rate = 1 + traitMod(npc, 'needs');
  const n = npc.needs;
  n.hunger = clamp(n.hunger - 0.00055 * rate, 0, 1);
  // Stamina (needs.rest): sleep restores it; being awake spends it, and hard
  // work, walking and fighting spend it faster than standing about.
  const effort = { working: 1.45, moving: 1.2, fighting: 2.2, idle: 0.7 }[npc.state] || 1;
  n.rest = clamp(n.rest - (npc.state === 'sleeping' ? -0.0042 : 0.00042 * rate * effort), 0, 1);
  n.joy = clamp(n.joy - 0.00035 * rate, 0, 1);
  if (n.hunger <= 0) {
    npc.hp -= 0.06;
    if (npc.hp <= 0) killColonist(game, npc, 'starvation');
  }
  for (let i = npc.thoughts.length - 1; i >= 0; i--) {
    const t = npc.thoughts[i];
    if (THOUGHTS[t.id].dur === 0) { npc.thoughts.splice(i, 1); continue; }
    t.left--; if (t.left <= 0) npc.thoughts.splice(i, 1);
  }
}

function tickInjuries(game, npc) {
  const healBoost = 1 + (game.bonuses.healRate || 0);
  for (let i = npc.injuries.length - 1; i >= 0; i--) {
    const inj = npc.injuries[i];
    if (inj.heal < 0) continue; // permanent
    inj.left -= (inj.treated ? 2.2 : 1) * healBoost;
    if (inj.left <= 0) { npc.injuries.splice(i, 1); refresh(npc); }
  }
  if (npc.hp < npc.maxHp) npc.hp = Math.min(npc.maxHp, npc.hp + 0.012 * healBoost * (npc.state === 'sleeping' ? 3 : 1));
}

export function killColonist(game, npc, cause) {
  if (npc.dead) return;
  npc.dead = true; npc.task = null; npc.state = 'dead';
  game.log(`${npc.name.full} died — ${cause}.`, 'death', npc.id);
  game.deaths.push({ npc, tick: game.tick, cause });
  for (const other of game.colonists) {
    if (other === npc || other.dead) continue;
    const rel = other.relations[npc.id];
    if (rel && rel.value > 30) { addThought(other, 'ally_died'); shiftHostility(other, 4, `${npc.name.short} died`); }
    else if (rel && rel.value < -30) addThought(other, 'rival_died');
  }
  const idx = game.colonists.indexOf(npc);
  if (idx >= 0) game.colonists.splice(idx, 1);
  game.graveyard.push(npc);
}

// --- ground items & hauling -------------------------------------------------
export function dropItems(game, x, y, yields, mult = 1) {
  for (const res in yields) {
    const qty = Math.max(1, Math.round(yields[res] * mult));
    const existing = game.ground.find(g => g.x === x && g.y === y && g.res === res);
    if (existing) existing.qty += qty;
    else game.ground.push({ x, y, res, qty, claimed: 0 });
  }
  game.jobsDirty = true;
}

/** How much a colonist can carry out of the Rift: strong backs carry more. */
export function packCap(npc) { return 60 + ((npc.attributes && npc.attributes.str) || 10) * 3 + (npc.packBonus || 0); }
export function packLoad(npc) { let n = 0; for (const k in npc.pack || {}) n += npc.pack[k]; return n; }
export function packRoom(npc) { return Math.max(0, packCap(npc) - packLoad(npc)); }

// --- task assignment --------------------------------------------------------
// Anything with a `rest` value is somewhere to sleep: a bed, a bedroll.
// Your own spot first, then the best one, then the nearest.
function findBed(game, npc) {
  const beds = game.world.findBuildings().filter(r => BUILDINGS[r.b.id].rest && (!r.b.owner || r.b.owner === npc.id));
  if (!beds.length) return null;
  beds.sort((a, b) => (a.b.owner === npc.id ? -1 : 0) - (b.b.owner === npc.id ? -1 : 0)
    || BUILDINGS[b.b.id].rest - BUILDINGS[a.b.id].rest
    || Math.hypot(a.x - npc.x, a.y - npc.y) - Math.hypot(b.x - npc.x, b.y - npc.y));
  return beds[0];
}

// Anything with a `joy` value is somewhere to unwind; better spots are worth
// a longer walk.
function findJoySpot(game, npc) {
  let best = null, bestScore = -Infinity;
  for (const r of game.world.findBuildings()) {
    const joy = BUILDINGS[r.b.id].joy;
    if (!joy) continue;
    const score = joy * 12 - Math.hypot(r.x - npc.x, r.y - npc.y);
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

/** Fields near a scarecrow yield more. */
function scarecrowBonus(game, x, y) {
  for (const r of game.world.findBuildings('scarecrow')) {
    if (Math.hypot(r.x - x, r.y - y) <= BUILDINGS.scarecrow.guard) return 0.15;
  }
  return 0;
}

function assignTask(game, npc) {
  const n = npc.needs;
  // Carrying someone: nothing else until they're safe. Out of the Rift a
  // floor at a time, then to a bed in camp.
  if (npc.carrying) {
    const p = game.colonists.find(c => c.id === npc.carrying);
    if (!p || p.dead || !p.downed) { releaseCarried(game, npc); }
    else if (game._m.kind === 'floor') {
      const s = game.world.stairsUp;
      npc.order = { x: s.x, y: s.y, travel: 'up', recall: true };
      npc.task = { kind: 'travel', x: s.x, y: s.y, work: 0, travel: 'up', recall: true };
      return;
    } else {
      const bed = findBed(game, p);
      const to = bed || { x: game.world.start.x, y: game.world.start.y };
      npc.task = { kind: 'rescue', phase: 'carry', x: to.x, y: to.y, work: 0, targetId: p.id, bed: !!bed };
      return;
    }
  }
  if (npc.order && npc.order.rescue) {
    const p = game.colonists.find(c => c.id === npc.order.rescue);
    if (!p || p.dead || !p.downed || (p.carriedBy && p.carriedBy !== npc.id) || (p.mapId || 0) !== (npc.mapId || 0)) npc.order = null;
    else { npc.task = { kind: 'rescue', phase: 'fetch', x: p.x, y: p.y, work: 0, targetId: p.id }; return; }
  }
  // 0. A fight comes first — nobody finishes a meal with something biting them.
  // A plain move or a trip up the stairs is the player's say, and wins.
  const o = npc.order;
  if (!(o && (o.travel || (!o.work && !o.attack)))) {
    let foe = o && o.attack ? game.raiders.find(r => r.id === o.attack && r.hp > 0) : null;
    if (o && o.attack && !foe) npc.order = null;
    // A wave at the camp is everyone's business, not just whoever is nearest.
    // (Peasants asleep at night only wake for what's actually on top of them.)
    const sleeper = npc.peasant && game.isNight && !o;
    if (!foe) foe = nearestHostile(game, npc.x, npc.y, game._m.kind === 'camp' && game.root.waveActive && !sleeper ? 40 : ENGAGE);
    if (foe) {
      if (npc.hp < npc.maxHp * 0.25) { sendToSafety(game, npc); return; }
      npc.task = { kind: 'fight', x: foe.x, y: foe.y, work: 0, targetId: foe.id };
      return;
    }
  }
  // 1. Survival needs override everything.
  // In the Rift there is only what they carried down (or found): their own pack.
  const larder = game._m.kind === 'floor' ? (npc.pack || {}) : game.resources;
  if (n.hunger < 0.32 && ((larder.meal || 0) > 0 || (larder.food || 0) >= 2)) {
    const table = game.world.findBuildings('table')[0];
    if (table && Math.hypot(table.x - npc.x, table.y - npc.y) < 25) { npc.task = { kind: 'eat', x: table.x, y: table.y, work: 25, atTable: true }; return; }
    npc.task = { kind: 'eat', x: npc.x, y: npc.y, work: 25 }; return;
  }
  // Out on their feet: they drop and sleep right where they are.
  if (n.rest <= 0.02) {
    if (npc.order && !npc.order.rescue) npc.order = null;
    npc.task = { kind: 'sleep', x: npc.x, y: npc.y, work: 0, collapsed: true };
    addThought(npc, 'slept_ground');
    game.log(`${npc.name.short} collapses from exhaustion.`, 'warn', npc.id);
    return;
  }
  // Peasants keep peasant hours: in bed from dusk to dawn unless given an order.
  if (npc.peasant && game.isNight && !npc.order) {
    const bed = findBed(game, npc);
    if (bed) { if (!bed.b.owner) bed.b.owner = npc.id; npc.task = { kind: 'sleep', x: bed.x, y: bed.y, work: 0, bed: BUILDINGS[bed.b.id].rest, night: true }; return; }
    npc.task = { kind: 'sleep', x: npc.x, y: npc.y, work: 0, night: true }; return;
  }
  if (n.rest < 0.26) {
    const bed = findBed(game, npc);
    if (bed) { if (!bed.b.owner) bed.b.owner = npc.id; npc.task = { kind: 'sleep', x: bed.x, y: bed.y, work: 0, bed: BUILDINGS[bed.b.id].rest }; return; }
    npc.task = { kind: 'sleep', x: npc.x, y: npc.y, work: 0 }; return;
  }
  if (n.joy < 0.25) {
    const spot = findJoySpot(game, npc);
    if (spot) { npc.task = { kind: 'joy', x: spot.x, y: spot.y, work: 120 }; return; }
  }
  // 1b. A player move order beats open-ended work, but not survival above.
  // Dropped if the last attempt just marked the spot unreachable, so a bad
  // order doesn't retry its pathfind forever.
  if (npc.order && npc.order.travel) {
    // Stairs (or the Rift's mouth): walk up to them, then change maps.
    const o = npc.order;
    npc.task = { kind: 'travel', x: o.x, y: o.y, work: 0, travel: o.travel, recall: !!o.recall };
    return;
  }
  if (npc.order && npc.order.work) {
    // A work order: the job itself, taken straight from the tile. Dropped as
    // soon as the site is finished — by this colonist or anyone else.
    const o = npc.order, job = siteJobAt(game, o.x, o.y);
    if (!job || job.kind !== o.work) npc.order = null;
    else {
      npc.task = { kind: job.kind, x: o.x, y: o.y, work: job.work, skill: job.skill, stand: o.stand, ordered: true };
      npc.task.workLeft = siteWorkLeft(game, job.kind, o.x, o.y, job.work);
      return;
    }
  }
  if (npc.order) {
    const bad = game.unreachable.get(`${npc.order.x},${npc.order.y}`);
    if (bad && bad > game.tick) npc.order = null;
    else { npc.task = { kind: 'move', x: npc.order.x, y: npc.order.y, work: 0 }; return; }
  }
  // 1c. Holding position: they stay on their spot and keep watch.
  if (npc.hold) { npc.task = { kind: 'wander', x: npc.x, y: npc.y, work: 30, hold: true }; return; }
  // 1d. A shopkeeper minds their counter through the day, at the shop's door.
  if (!game.isNight && game._m.kind === 'camp' && !npc.away) {
    const shop = game.world.findBuildings().find(r => r.b.keeper === npc.id);
    if (shop) { npc.task = { kind: 'shopkeep', x: shop.x, y: shop.y, work: 240, skill: 'social' }; return; }
  }
  // 2. Work jobs, scored by priority then distance.
  let best = null, bestScore = -Infinity;
  for (const job of game.jobs) {
    if (job.claim && job.claim !== npc.id) continue;
    const prio = jobPriority(npc, job);
    if (prio <= 0) continue;
    if (job.low && npc.mood < 40) continue;
    const d = Math.hypot(job.x - npc.x, job.y - npc.y);
    if (d > 45 && !job.rush) continue;
    const bad = game.unreachable.get(`${job.x},${job.y}`);
    if (bad && bad > game.tick) continue;
    const skillLvl = npc.skills[job.skill] || 0;
    let score = prio * 12 + skillLvl * 1.2 - d * 0.55;
    if (job.kind === 'haul' && job.ref?.res !== 'gold' && (game.resources[job.ref?.res] || 0) > storageCap(game) * 0.95) continue;
    if (job.kind === 'haul' && game._m.kind === 'floor' && packRoom(npc) < 1) continue;
    if (job.low) score -= 22;
    if (job.rush) score += 1000;
    if (score > bestScore) { bestScore = score; best = job; }
  }
  if (best) { best.claim = npc.id; npc.task = { ...best, workLeft: best.work }; return; }
  // 2b. Nothing queued: they find something useful on their own.
  if (game._m.kind === 'camp' && selfDirect(game, npc)) return;
  // 3. Nothing to do: socialise or wander.
  if (game.tick % 7 === 0) {
    const others = game.here.filter(c => c !== npc && !c.away && !c.dead && Math.hypot(c.x - npc.x, c.y - npc.y) < 12);
    if (others.length && npc.needs.joy < 0.8) {
      const target = others[game.rng.int(0, others.length - 1)];
      npc.task = { kind: 'socialize', x: target.x, y: target.y, work: 40, targetId: target.id };
      return;
    }
  }
  addThought(npc, 'idle');
  const spot = findNearest(game.world, npc.x, npc.y, (x, y) => game.world.walkable(x, y) && (x + y) % 3 === game.tick % 3, 8);
  npc.task = { kind: 'wander', x: spot ? spot[0] : npc.x, y: spot ? spot[1] : npc.y, work: 12 };
}

// Ticks a colonist spends per tile on plain ground (was 2.4: everyone walks ~15% quicker now).
export const MOVE_TICKS = 2.05;

/**
 * A colonist with no job looks for the most useful thing within reach: what
 * the colony is shortest of (wood, food, stone, ore), nearest first, within
 * what their work priorities allow. They mark it the way a player would, so
 * others can pitch in. Building stays the player's call: nobody starts one.
 */
function selfDirect(game, npc) {
  if ((npc.selfCd || 0) > game.tick) return false;
  npc.selfCd = game.tick + 30;   // an empty search isn't repeated every tick
  const w = game.world, res = game.resources, cap = storageCap(game);
  const pr = (k) => npc.priorities[k] ?? 2;
  const chop = pr('chop') > 0, mine = pr('mine') > 0;
  const eaters = Math.max(1, game.colonists.filter(c => !c.dead).length);
  const want = {
    tree: chop && (res.wood || 0) < cap * 0.7,
    fungus: chop && (res.food || 0) + (res.meal || 0) < eaters * 12,
    herb: chop && (res.herbs || 0) < 30,
    rock: mine && (res.stone || 0) < cap * 0.5,
    vein: mine,
  };
  if (!Object.values(want).some(Boolean)) return false;
  const exposed = (x, y) => w.walkable(x + 1, y) || w.walkable(x - 1, y) || w.walkable(x, y + 1) || w.walkable(x, y - 1);
  const spot = findNearest(w, npc.x, npc.y, (x, y) => {
    const i = w.idx(x, y);
    if (w.designation[i] || w.building[i]) return false;
    const bad = game.unreachable.get(`${x},${y}`);
    if (bad && bad > game.tick) return false;
    const f = w.feature[i];
    if (f && FEATURES[f].inRock) return want.vein && exposed(x, y);
    if (f === 'tree') return want.tree;
    if (f === 'fungus' || f === 'glowcap') return want.fungus;
    if (f === 'herb') return want.herb;
    if (!f && TERRAIN[w.terrain[i]].mineable && w.terrain[i] !== T.RIFT) return want.rock && exposed(x, y);
    return false;
  }, 20);
  if (!spot) return false;
  const [x, y] = spot, i = w.idx(x, y), f = w.feature[i];
  const kind = (f && !FEATURES[f].inRock) ? 'harvest' : 'mine';
  if (!designate(game, x, y, kind)) return false;
  const job = siteJobAt(game, x, y);
  if (!job) return false;
  npc.task = { kind: job.kind, x, y, work: job.work, skill: job.skill, claim: npc.id, self: true };
  npc.task.workLeft = siteWorkLeft(game, job.kind, x, y, job.work);
  return true;
}

// --- movement ---------------------------------------------------------------
function stepToward(game, npc, tx, ty, adjacent) {
  if (adjacent ? (Math.abs(npc.x - tx) <= 1 && Math.abs(npc.y - ty) <= 1) : (npc.x === tx && npc.y === ty)) return true;
  if (!npc.path || npc.pathGoal !== `${tx},${ty},${adjacent ? 1 : 0}` || npc.pathIdx >= npc.path.length) {
    const p = findPath(game.world, npc.x, npc.y, tx, ty, adjacent);
    if (!p) {
      // Remember the failure so the whole colony stops retrying this tile.
      game.unreachable.set(`${tx},${ty}`, game.tick + 900);
      npc.task = null; npc.pathFails = (npc.pathFails || 0) + 1;
      return false;
    }
    npc.path = p; npc.pathIdx = 0; npc.pathGoal = `${tx},${ty},${adjacent ? 1 : 0}`;
    if (p.length === 0) return true;
  }
  const speed = (1 + traitMod(npc, 'move')) * (game.raceSpeed[npc.race] || 1) * clamp(0.5 + npc.needs.rest, 0.5, 1.2) * (npc.carrying ? 0.65 : 1);
  npc.moveCd -= speed;
  if (npc.moveCd > 0) return false;
  const next = npc.path[npc.pathIdx];
  if (!next) return true;
  if (!game.world.walkable(next[0], next[1])) { npc.path = null; return false; }
  if (!occupyMove(game, npc, next[0], next[1])) return blockedStep(game, npc, next, tx, ty, adjacent);
  npc.blocked = 0;
  npc.pathIdx++;
  npc.moveCd += MOVE_TICKS * game.world.moveCost(npc.x, npc.y);
  return npc.pathIdx >= npc.path.length;
}

/**
 * Someone is standing on the next tile. Returns what stepToward should: true
 * if we count as arrived, false to keep waiting. The escalation is: wait a
 * beat (they are probably walking), re-plan around bodies, and finally trade
 * places with a colonist who is in the way.
 */
function blockedStep(game, npc, next, tx, ty, adjacent) {
  npc.moveCd = 0;   // don't bank movement while standing still
  npc.blocked = (npc.blocked || 0) + 1;
  const other = occupantAt(game, next[0], next[1]);
  const lastStep = npc.pathIdx === npc.path.length - 1;
  // The goal itself is taken — a table, a haul pile, another colonist's spot.
  if (lastStep && !adjacent) {
    const t = npc.task;
    if (t && t.stand) {
      // Someone took this worker's side of the job. Within reach is enough;
      // otherwise wait a moment, then fall back to any side that's free.
      if (Math.abs(npc.x - t.x) <= 1 && Math.abs(npc.y - t.y) <= 1) { npc.blocked = 0; t.stand = null; return true; }
      if (npc.blocked > 12) { t.stand = null; if (npc.order) npc.order.stand = null; npc.path = null; npc.blocked = 0; }
      return false;
    }
    if (t && t.kind === 'move') {
      // A squad sent to one tile fans out around it instead of queueing.
      const spot = freeTileNear(game, tx, ty, npc, 6);
      if (spot) { t.x = spot[0]; t.y = spot[1]; if (npc.order) { npc.order.x = spot[0]; npc.order.y = spot[1]; } npc.path = null; }
      return false;
    }
    if (t && t.kind === 'sleep' && t.bed) {
      if (npc.blocked > 40) { npc.task = null; npc.blocked = 0; }   // someone's in it; think again
      return false;
    }
    // Eating, hauling, wandering: arm's length is close enough.
    if (Math.abs(npc.x - tx) <= 1 && Math.abs(npc.y - ty) <= 1) { npc.blocked = 0; return true; }
  }
  // A friend in the way: trade places with them when that's the quicker way
  // through — they're standing still, or walking straight at us — rather than
  // queueing behind them or walking the long way round.
  const friend = other && other !== npc && game.colonists.includes(other) && (other.mapId || 0) === (npc.mapId || 0)
    && !other.dead && !other.downed && !other.carriedBy && !npc.carriedBy && other.state !== 'sleeping' && !(game.field && game.field.units && game.field.units.has(other));
  if (friend && !(lastStep && !adjacent)) {
    const theirNext = other.path && other.path[other.pathIdx];
    const headOn = !!theirNext && theirNext[0] === npc.x && theirNext[1] === npc.y;
    const standing = other.state !== 'moving';
    if (headOn || standing || npc.blocked >= 3) {
      // Is walking round them just as quick? Then go round and leave them be.
      const left = npc.path.length - npc.pathIdx;
      const round = headOn ? null : findPath(game.world, npc.x, npc.y, tx, ty, adjacent, 300, game.occ);
      if (round && round.length && round.length <= left) { npc.path = round; npc.pathIdx = 0; return false; }
      const path = npc.path, idx = npc.pathIdx;
      swapUnits(game, npc, other);
      npc.path = path; npc.pathIdx = idx + 1;   // we carry on; they re-plan from where we were
      npc.blocked = 0;
      npc.moveCd += MOVE_TICKS * game.world.moveCost(npc.x, npc.y);
      return npc.pathIdx >= npc.path.length;
    }
  }
  if (npc.blocked >= 3 && npc.blocked % (adjacent ? 6 : 3) === 0) {
    // A way round the bodies is close by or not worth the search.
    const p = findPath(game.world, npc.x, npc.y, tx, ty, adjacent, adjacent ? 600 : 1500, game.occ);
    if (p && p.length) { npc.path = p; npc.pathIdx = 0; return false; }
    // Every side of the job is taken and staying so: do something else for now.
    if (adjacent && npc.blocked >= 24) { npc.task = null; npc.path = null; npc.blocked = 0; return false; }
  }
  // Deadlock breaker: a colonist in the way steps back past us — and our own
  // animals are simply shouldered past.
  const pet = other && other.tame && !other.dead && game.beasts.includes(other);
  if (pet && npc.blocked >= 2) {
    swapUnits(game, npc, other);
    npc.blocked = 0;
    return !adjacent && npc.x === tx && npc.y === ty;
  }
  if (npc.blocked >= 8 && other && (other.mapId || 0) === (npc.mapId || 0) && game.colonists.includes(other) && other.state !== 'sleeping') {
    swapUnits(game, npc, other);   // both re-plan from their new tiles
    npc.blocked = 0;
    return !adjacent && npc.x === tx && npc.y === ty;
  }
  return false;
}

// --- task execution ---------------------------------------------------------
function completeTask(game, npc) {
  const t = npc.task;
  const w = game.world;
  const i = w.idx(t.x, t.y);
  switch (t.kind) {
    case 'mine': {
      const f = w.feature[i];
      const y = f && FEATURES[f].inRock ? FEATURES[f].yield : TERRAIN[w.terrain[i]].yield;
      const mult = 1 + (game.bonuses.mineYield || 0) + npc.skills.mining * 0.02;
      dropItems(game, t.x, t.y, y, mult);
      w.feature[i] = null;
      w.terrain[i] = T.DIRT;
      w.designation[i] = null;
      w.touch();
      game.stats.mined++;
      break;
    }
    case 'harvest': {
      const f = w.feature[i];
      if (f && FEATURES[f].prop) {
        // A prop breaks open: its fixed take drops here, and floors.js rolls
        // the rest — loot, gear, a prisoner, a blessing.
        dropItems(game, t.x, t.y, FEATURES[f].yield, 1 + (npc.skills[harvestSkill(f)] || 0) * 0.02);
        w.feature[i] = null;
        w.touch();
        if (game.onPropOpened) game.onPropOpened(npc, f, t.x, t.y);
      } else if (f) {
        const mult = 1 + (f === 'tree' ? npc.skills.woodcutting : npc.skills.farming) * 0.022 + (game.bonuses.farmYield || 0)
          + (f === 'herb' ? (game.bonuses.herbYield || 0) : 0);
        dropItems(game, t.x, t.y, FEATURES[f].yield, mult);
        w.feature[i] = null;
        w.touch();
      }
      w.designation[i] = null;
      break;
    }
    case 'build': {
      const b = w.building[i];
      if (b && b.done && b.upgrade) {
        if (hasResources(game, b.upgrade.cost)) {
          const U = b.upgrade;
          pay(game, U.cost.gold || 0, 'building');
          spend(game, Object.fromEntries(Object.entries(U.cost).filter(([k]) => k !== 'gold')));
          b.level = U.to; b.upgrade = null;
          w.touch();
          game.jobsDirty = true;
          game.log(`${BUILDINGS[b.id].name} is now level ${b.level}.`, 'build');
        } else { b.upgrade.workLeft = 1; npc.task = null; return; }
        break;
      }
      if (b && !b.done) {
        const def = BUILDINGS[b.id];
        if (hasResources(game, def.cost)) {
          spend(game, Object.fromEntries(Object.entries(def.cost).filter(([k]) => k !== 'gold')));
          pay(game, def.cost.gold || 0, 'building');
          b.done = true; b.workLeft = 0; b.growth = 0; b.tended = 0;
          w.touch();
          w.recomputeLight();
          if (b.fp) ejectFromFootprint(game, b);
          game.stats.built++;
          game.log(`${def.name} completed.`, 'build');
          if (b.id === 'portal') game.log('The Delve Gate hums. Expeditions can begin.', 'major');
        } else {
          b.workLeft = 1; // wait for materials
          npc.task = null; return;
        }
      }
      break;
    }
    case 'floor': {
      const f = w.floor[i];
      if (f && !f.done) {
        const def = FLOORS[f.id];
        if (hasResources(game, def.cost)) {
          spend(game, def.cost);
          f.done = true; f.workLeft = 0;
          w.touch();
          w.recomputeLight();
        } else {
          f.workLeft = 1; // wait for materials
          npc.task = null; return;
        }
      }
      break;
    }
    case 'haul': {
      const it = t.ref;
      if (it && it.qty > 0 && game._m.kind === 'floor') {
        // Down in the Rift there's no stockpile: it goes in the pack, and the
        // pack is emptied into the stores when its carrier climbs out.
        const room = packRoom(npc);
        const take = Math.min(room, it.qty);
        if (take > 0) {
          npc.pack = npc.pack || {};
          npc.pack[it.res] = (npc.pack[it.res] || 0) + take;
          it.qty -= take;
          if (it.qty <= 0) { const gi = game.ground.indexOf(it); if (gi >= 0) game.ground.splice(gi, 1); }
        }
        it.claimed = 0;
      } else if (it && it.qty > 0) {
        addResource(game, it.res, it.qty);
        const gi = game.ground.indexOf(it);
        if (gi >= 0) game.ground.splice(gi, 1);
      }
      break;
    }
    case 'plant': {
      const b = w.building[i];
      const crop = b && CROPS[b.crop];
      if (b && crop && !b.planted && hasResources(game, crop.seed)) {
        spend(game, crop.seed);
        b.planted = true; b.growth = 0; b.tended = 0;
        b.plantedSeason = game.seasonIndex;
      }
      break;
    }
    case 'farmTend': {
      const b = w.building[i];
      if (b && b.planted && b.growth < 1) {
        // Tending is only worth doing where the crop can actually grow.
        const v = cropViability(b.crop, game.farmContext(t.x, t.y));
        b.growth = clamp(b.growth + 0.05 * Math.max(0.25, v), 0, 1);
        b.tended = game.tick + 560;
      }
      break;
    }
    case 'farmHarvest': {
      const b = w.building[i];
      const crop = CROPS[b && b.crop];
      if (b && crop && b.planted && b.growth >= 1) {
        const def = BUILDINGS[b.id];
        const v = cropViability(b.crop, game.farmContext(t.x, t.y));
        const amount = Math.max(1, Math.round(
          crop.yield * (def.yield || 1) * clamp(v, 0.3, 1.25) *
          (1 + (game.bonuses.farmYield || 0) + npc.skills.farming * 0.03 + scarecrowBonus(game, t.x, t.y))));
        dropItems(game, t.x, t.y, { [crop.product]: amount });
        // Harvest costs fertility; legumes give some back.
        if (w.soil) {
          const drain = SOIL_DRAIN - (crop.fixes || 0);
          w.soil[i] = clamp(w.soil[i] - drain, 0.04, 1);
        }
        b.growth = 0; b.planted = false; b.tended = 0;
        game.root.harvests++;
      }
      break;
    }
    case 'compost': {
      const b = w.building[i];
      if (b && w.soil && (b.tended || 0) <= game.tick) {
        b.tended = game.tick + 900;
        const r = 5;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = t.x + dx, y = t.y + dy;
          if (!w.inside(x, y)) continue;
          if (Math.hypot(dx, dy) > r) continue;
          const si = w.idx(x, y);
          w.soil[si] = clamp(w.soil[si] + 0.11, 0, 1);
        }
      }
      break;
    }
    case 'tame': {
      const beast = game.beasts.find(x => x.id === t.beastId);
      if (beast && !beast.tame && !beast.dead) {
        const chance = tameChance(npc, beast) * (1 + (game.bonuses.tame || 0));
        if (game.rng.chance(chance)) {
          beast.tame = true;
          beast.hunger = Math.max(beast.hunger, 0.7);
          gainXp(game, npc, 'animals', 140);
          game.log(`${npc.name.short} tamed ${beast.name} the ${ANIMALS[beast.species].name}.`, 'good', npc.id);
          addThought(npc, 'joy');
        } else if (ANIMALS[beast.species].wildAggressive && game.rng.chance(0.25)) {
          const dmg = game.rng.int(3, 8 + ANIMALS[beast.species].power);
          npc.hp = Math.max(1, npc.hp - dmg);
          game.log(`${beast.name} turned on ${npc.name.short} (${dmg} damage).`, 'warn', npc.id);
          addThought(npc, 'wounded');
        }
      }
      break;
    }
    case 'gather': {
      const beast = game.beasts.find(x => x.id === t.beastId);
      if (beast && beast.readyProduct > 0) {
        const A = ANIMALS[beast.species];
        const amount = Math.max(1, Math.round(beast.readyProduct * (1 + npc.skills.animals * 0.02)));
        dropItems(game, beast.x, beast.y, { [A.product.res]: amount });
        beast.readyProduct = 0;
      }
      break;
    }
    case 'butcher': {
      const beast = game.beasts.find(x => x.id === t.beastId);
      if (beast && !beast.dead) {
        const out = butcherBeast(game, beast);
        dropItems(game, beast.x, beast.y, out);
        game.log(`${beast.name} the ${ANIMALS[beast.species].name} was butchered.`, 'info');
        // Colonists who like animals take it badly.
        for (const c of game.colonists) if (c.traits.includes('beastfriend')) addThought(c, 'bad_chat');
      }
      break;
    }
    case 'craft': {
      const rec = RECIPES[t.recipe];
      if (rec && hasResources(game, rec.inputs)) {
        spend(game, rec.inputs);
        const q = 1 + (npc.skills[rec.skill] || 0) * 0.05;
        for (const out in rec.outputs) addResource(game, out, Math.max(1, Math.round(rec.outputs[out] * q)));
        game.stats.crafted++;
      }
      break;
    }
    case 'research': {
      if (game.research.current) {
        const gain = 8 * (1 + (game.bonuses.researchRate || 0)) * (1 + npc.skills.research * 0.08);
        advanceResearch(game, gain);
      }
      break;
    }
    case 'train': { gainXp(game, npc, t.trainSkill || (game.rng.chance(0.6) ? 'melee' : 'ranged'), 55); npc.needs.joy = clamp(npc.needs.joy + 0.05, 0, 1); break; }
    case 'pray': { gainXp(game, npc, 'faith', 55); addThought(npc, 'joy'); break; }
    case 'heal': {
      const patient = game.colonists.find(c => c.id === t.target);
      if (patient) {
        const inj = patient.injuries.find(x => x.heal > 0 && !x.treated);
        if (inj) { inj.treated = true; inj.left *= 0.6; }
        patient.hp = Math.min(patient.maxHp, patient.hp + 6 + npc.skills.medicine);
        // Tended where they lie, the downed are back on their feet much sooner.
        if (patient.downed) patient.downed.until = Math.min(patient.downed.until, game.tick + 60);
      }
      break;
    }
    case 'eat': {
      let ate = false;
      const larder = game._m.kind === 'floor' ? (npc.pack || {}) : game.resources;
      if ((larder.meal || 0) >= 1) { larder.meal--; addThought(npc, 'well_fed', 1.5); ate = true; }
      else if ((larder.food || 0) >= 2) { larder.food -= 2; addThought(npc, 'well_fed'); ate = true; }
      if (ate) {
        npc.needs.hunger = 1;
        if (t.atTable) { addThought(npc, 'joy'); npc.needs.joy = clamp(npc.needs.joy + 0.12, 0, 1); }
      }
      break;
    }
    case 'sleep': {
      npc.needs.rest = 1;
      // A bed (rest 1.6) is a full night's sleep; a bedroll only part of one.
      if (t.bed) addThought(npc, 'rested', Math.min(1, t.bed / BUILDINGS.bed.rest));
      else addThought(npc, 'slept_ground');
      break;
    }
    case 'joy': { npc.needs.joy = 1; addThought(npc, 'joy'); break; }
    case 'socialize': break; // resolved in social.js
    case 'wander': break;
    case 'move': npc.order = null; break; // arrived; a player order is a one-shot
    case 'travel': npc.order = null; npc.task = null; game.root.useStairs(npc, t.travel, t.recall); return;
  }
  if (WORK_SITE_KINDS[t.kind]) {
    if (game.siteWork) game.siteWork.delete(i);
    if (npc.order && npc.order.work) npc.order = null;
  }
  npc.task = null;
  game.jobsDirty = true;
}

function doTask(game, npc) {
  const t = npc.task;
  // Livestock move; keep chasing them rather than working an empty tile.
  if (t.beastId) {
    const beast = game.beasts.find(b => b.id === t.beastId);
    if (!beast || beast.dead) { npc.task = null; return; }
    // An animal that won't hold still is let go after a while.
    t.chase = (t.chase || 0) + 1;
    if (t.chase > (t.kind === 'hunt' ? 1500 : 400)) { npc.task = null; return; }
    if (beast.x !== t.x || beast.y !== t.y) { t.x = beast.x; t.y = beast.y; npc.path = null; }
  }
  const adjacentKinds = { travel: 1, mine: 1, harvest: 1, build: 1, floor: 1, plant: 1, farmTend: 1, farmHarvest: 1, compost: 1, craft: 1, research: 1, train: 1, pray: 1, heal: 1, joy: 1, socialize: 1, tame: 1, gather: 1, butcher: 1, shopkeep: 1, hunt: 1 };
  if (t.kind === 'fight') { doFight(game, npc, t); return; }
  if (t.kind === 'rescue') { doRescue(game, npc, t); return; }
  const needAdjacent = !!adjacentKinds[t.kind];
  if (WORK_SITE_KINDS[t.kind] && !siteLive(game, t)) {
    // Finished (or called off) under us — most often by a squadmate.
    if (npc.order && npc.order.work) npc.order = null;
    npc.task = null; npc.state = 'idle';
    return;
  }
  const arrived = t.stand ? stepToward(game, npc, t.stand[0], t.stand[1], false) : stepToward(game, npc, t.x, t.y, needAdjacent);
  if (!npc.task) { if (npc.order && npc.order.work) npc.order = null; return; }   // path failed, task dropped
  if (!arrived) { npc.state = 'moving'; return; }

  if (t.kind === 'sleep') {
    npc.state = 'sleeping';
    // A night's sleep lasts the night; any other sleep ends when they're rested.
    const keepOn = t.night && game.isNight && !npc.order;
    if (npc.needs.rest >= 0.99 && !keepOn) completeTask(game, npc);
    else if (t.night && npc.order) { npc.task = null; }   // woken by an order
    return;
  }
  if (t.kind === 'hunt') {
    // A strike every few beats until it drops; see huntStrike.
    npc.state = 'fighting';
    t.workLeft = (t.workLeft ?? t.work) - 1;
    if (t.workLeft <= 0) { t.workLeft = t.work; huntStrike(game, npc, t); }
    return;
  }
  npc.state = 'working';
  if (t.kind === 'shopkeep') {
    // Open for as long as they stand there, and a little after (a shift change, a step away).
    const b = game.world.inside(t.x, t.y) ? game.world.building[game.world.idx(t.x, t.y)] : null;
    if (!b || !b.done || b.keeper !== npc.id || game.isNight) { npc.task = null; npc.state = 'idle'; return; }
    b.keptUntil = game.tick + 120;
  }
  const skill = t.skill || (t.kind === 'eat' ? 'survival' : 'social');
  const rate = workRate(game, npc, skill);
  if (WORK_SITE_KINDS[t.kind]) {
    // Spend the tile's own work, not a private copy of it, so every hand on
    // the job counts.
    const i = game.world.idx(t.x, t.y);
    t.workLeft = siteWorkLeft(game, t.kind, t.x, t.y, t.work) - rate;
    if (t.kind === 'build') { const b = game.world.building[i]; if (b.done && b.upgrade) b.upgrade.workLeft = Math.max(0, t.workLeft); else b.workLeft = Math.max(0, t.workLeft); }
    else if (t.kind === 'floor') game.world.floor[i].workLeft = Math.max(0, t.workLeft);
    else { if (!game.siteWork) game.siteWork = new Map(); game.siteWork.set(i, Math.max(0, t.workLeft)); }
  } else {
    // A bench that's been upgraded works faster.
    const w = game.world, at = w.inside(t.x, t.y) ? w.building[w.idx(t.x, t.y)] : null;
    t.workLeft = (t.workLeft ?? t.work) - rate * (at && at.done ? benchSpeed(at) : 1);
  }
  if (t.skill) gainXp(game, npc, t.skill, rate * 0.85);
  if (t.workLeft <= 0) completeTask(game, npc);
}

/** One blow at a hunted beast. It dies into meat and hide; a dangerous one hits back. */
function huntStrike(game, npc, t) {
  const b = game.beasts.find(k => k.id === t.beastId);
  if (!b || b.dead) { npc.task = null; return; }
  const A = ANIMALS[b.species], rng = game.rng;
  const dmg = Math.max(1, rng.int(2, 6) + Math.round((npc.skills.melee || 0) * 0.6) - (A.armor || 0));
  b.hp = (b.hp ?? A.hp) - dmg;
  gainXp(game, npc, 'melee', 25);
  if (b.hp <= 0) {
    b.dead = true;
    dropItems(game, b.x, b.y, butcherBeast(game, b));
    game.log(`${npc.name.short} brings down ${b.name} the ${A.name}.`, 'good', npc.id);
    for (const c of game.colonists) if (c.task && c.task.kind === 'hunt' && c.task.beastId === b.id) c.task = null;
    game.jobsDirty = true;
    return;
  }
  if (rng.chance(A.wildAggressive ? 0.5 : 0.15)) {
    const hit = rng.int(1, 3 + A.power);
    npc.hp = Math.max(1, npc.hp - hit);
    if (hit >= 5) addThought(npc, 'wounded');
  }
}

/**
 * Rescue: walk to someone who is down, pick them up, carry them to safety.
 * The carrying itself (they ride on the carrier's tile, stairs and all) is
 * kept in step by carryAlong() every tick.
 */
function doRescue(game, npc, t) {
  const p = game.colonists.find(c => c.id === t.targetId);
  if (!p || p.dead || !p.downed) { releaseCarried(game, npc); npc.task = null; npc.order = null; return; }
  if (t.phase === 'fetch') {
    if ((p.mapId || 0) !== (npc.mapId || 0) || (p.carriedBy && p.carriedBy !== npc.id)) { npc.task = null; npc.order = null; return; }
    t.x = p.x; t.y = p.y;
    const there = stepToward(game, npc, p.x, p.y, true);
    if (!npc.task) return;
    npc.state = 'moving';
    if (!there) return;
    npc.carrying = p.id; p.carriedBy = npc.id;
    npc.order = null; npc.task = null; npc.path = null;
    game.log(`${npc.name.short} picks up ${p.name.short}.`, 'info', npc.id);
    return;
  }
  // Carry: to the bed (or the middle of camp) and lay them down.
  npc.state = 'moving';
  const there = stepToward(game, npc, t.x, t.y, true);
  if (!npc.task || !there) return;
  releaseCarried(game, npc, t.x, t.y);
  if (t.bed) p.downed.until = Math.min(p.downed.until, game.tick + 120);   // rest in a bed and they're up far sooner
  game.log(`${npc.name.short} carries ${p.name.short} ${t.bed ? 'to a bed' : 'back to camp'}.`, 'good', npc.id);
  npc.task = null;
}

/** Put down whoever this colonist is carrying: at (x, y) if it's open ground, else where they stand. */
export function releaseCarried(game, npc, x, y) {
  const p = npc.carrying && game.colonists.find(c => c.id === npc.carrying);
  npc.carrying = null;
  if (!p) return;
  p.carriedBy = null;
  p.mapId = npc.mapId;
  if (x != null && game.world.inside(x, y) && game.world.walkable(x, y)) { p.x = x; p.y = y; }
  else { p.x = npc.x; p.y = npc.y; }
}

/** Every tick: the carried ride with their carrier, and are dropped if the carrier falls. */
export function carryAlong(game) {
  for (const p of game.colonists) {
    if (!p.carriedBy) continue;
    const c = game.colonists.find(k => k.id === p.carriedBy);
    if (!c || c.dead || c.downed || c.carrying !== p.id || !p.downed) {
      if (c && c.carrying === p.id) releaseCarried(game, c);
      else { p.carriedBy = null; }
      continue;
    }
    p.x = c.x; p.y = c.y; p.mapId = c.mapId;
  }
}

/**
 * The fight task: close on the target — to arm's length for a blade, to a
 * clear shot for a bow or a spell — then stand and let realtime.js swing.
 * Hurt past bearing, break off; target gone, think again.
 */
function doFight(game, npc, t) {
  if (npc.hp < npc.maxHp * 0.25) { sendToSafety(game, npc); return; }
  let foe = game.raiders.find(r => r.id === t.targetId && r.hp > 0 && !r.fleeing);
  // Something closer turned up, or ours went down: switch to the nearest.
  const near = nearestHostile(game, npc.x, npc.y, ENGAGE);
  if (!foe || (!(npc.order && npc.order.attack) && near && near !== foe && Math.max(Math.abs(near.x - npc.x), Math.abs(near.y - npc.y)) + 2 < Math.max(Math.abs(foe.x - npc.x), Math.abs(foe.y - npc.y)))) foe = near;
  if (!foe) { npc.task = null; if (npc.order && npc.order.attack) npc.order = null; npc.state = 'idle'; return; }
  t.targetId = foe.id; t.x = foe.x; t.y = foe.y;
  const d = Math.max(Math.abs(foe.x - npc.x), Math.abs(foe.y - npc.y));
  const ranged = npc.combat && npc.combat.range && npc.combat.range !== 'melee';
  const inReach = d <= 1 || (ranged && d <= RANGED_R - 1 && lineOfSight(game.world, npc.x, npc.y, foe.x, foe.y));
  if (inReach) { npc.state = 'fighting'; npc.path = null; return; }
  // Holding position: fight what comes into reach, chase nothing (unless told to).
  if (npc.hold && !(npc.order && npc.order.attack)) { npc.state = 'fighting'; npc.path = null; if (d > ENGAGE + 3) { npc.task = null; if (npc.order && npc.order.attack) npc.order = null; } return; }
  npc.state = 'moving';
  stepToward(game, npc, foe.x, foe.y, true);
  if (!npc.task) npc.task = null;
}

// --- research ---------------------------------------------------------------
export function advanceResearch(game, amount) {
  const r = game.research;
  if (!r.current) return;
  r.progress += amount;
  const def = game.researchDefs[r.current];
  if (r.progress >= def.cost) {
    r.done.add(r.current);
    r.progress = 0;
    for (const u of def.unlock) game.unlocked.add(u);
    if (def.bonus) for (const k in def.bonus) game.bonuses[k] = (game.bonuses[k] || 0) + def.bonus[k];
    game.log(`Research complete: ${def.name}.`, 'major');
    r.current = null;
    pickNextResearch(game);
  }
}
export function pickNextResearch(game) {
  if (game.research.current) return;
  const avail = Object.keys(game.researchDefs).filter(id =>
    !game.research.done.has(id) && game.researchDefs[id].req.every(q => game.research.done.has(q)));
  if (!avail.length) return;
  if (game.research.queue.length) {
    const q = game.research.queue.find(id => avail.includes(id));
    if (q) { game.research.current = q; game.research.queue = game.research.queue.filter(x => x !== q); return; }
  }
  game.research.current = avail[0];
}

// --- per-colonist tick ------------------------------------------------------
export function tickColonist(game, npc) {
  if (npc.dead || npc.away) return;
  // Down on the ground: wounds still mend, but nothing else happens until they get up.
  if (tickDowned(game, npc)) { tickInjuries(game, npc); return; }
  tickNeeds(game, npc);
  tickInjuries(game, npc);
  updateMood(game, npc);
  // Real hunger or exhaustion drops whatever isn't survival, a fight or a trip.
  if (npc.task && (npc.needs.hunger < 0.15 || npc.needs.rest < 0.12) && !['eat', 'sleep', 'fight', 'travel'].includes(npc.task.kind)) {
    const t = npc.task;
    if (t.claim !== undefined) for (const j of game.jobs) if (j.claim === npc.id) j.claim = 0;
    npc.task = null; npc.path = null;
  }

  // Mood breaks: the hostility meter is the colony-side failure mode too.
  if (npc.mood < 16) {
    npc.breakLevel += 1;
    if (npc.breakLevel > 200) {
      npc.breakLevel = 0;
      const roll = game.rng.next();
      if (roll < 0.45) {
        game.log(`${npc.name.short} breaks down and wanders off.`, 'warn', npc.id);
        npc.task = { kind: 'wander', x: npc.x + game.rng.int(-8, 8), y: npc.y + game.rng.int(-8, 8), work: 200 };
        npc.needs.joy = 0.5;
      } else if (roll < 0.8) {
        shiftHostility(npc, 14, 'mental break');
        game.log(`${npc.name.short} lashes out — resentment grows.`, 'warn', npc.id);
        addThought(npc, 'brawl');
      } else {
        shiftHostility(npc, 25, 'severe break');
        game.log(`${npc.name.short} turns on the hold.`, 'danger', npc.id);
      }
      if (npc.hostility > 72) defect(game, npc);
    }
  } else if (npc.breakLevel > 0) npc.breakLevel -= 2;

  // Slow hostility relaxation toward the personal baseline while content.
  if (game.tick % 120 === 0) {
    const target = npc.hostilityBase - (npc.mood - 50) * 0.18;
    shiftHostility(npc, clamp(target - npc.hostility, -1.2, 1.2), null);
  }

  if (!npc.task) assignTask(game, npc);
  if (npc.task) doTask(game, npc);
  else npc.state = 'idle';
}

export function defect(game, npc) {
  game.log(`${npc.name.full} abandons the hold.`, 'danger', npc.id);
  const idx = game.colonists.indexOf(npc);
  if (idx >= 0) game.colonists.splice(idx, 1);
  npc.away = true; npc.faction = 'outlaws';
  game.defectors.push(npc);
  for (const c of game.colonists) {
    const rel = c.relations[npc.id];
    if (rel && rel.value > 40) addThought(c, 'ally_died');
  }
}

// --- farms grow on their own ------------------------------------------------
// Cavern trees regrow near surviving stands, so wood is renewable over a run.
export function tickForest(game) {
  if (game.tick % 400 !== 0) return;
  const w = game.world;
  const rng = game.rng;
  const stands = [];
  for (let i = 0; i < w.feature.length; i++) if (w.feature[i] === 'tree') stands.push(i);
  if (stands.length > 200) return;
  // Spore drift: even a completely stripped map slowly reseeds, so a colony can
  // never be permanently locked out of wood.
  const plantings = stands.length ? Math.max(1, Math.round(stands.length * 0.05)) : 1;
  for (let k = 0; k < plantings; k++) {
    let sx, sy;
    if (stands.length) {
      const src = stands[rng.int(0, stands.length - 1)];
      sx = src % w.w; sy = (src / w.w) | 0;
    } else {
      sx = rng.int(1, w.w - 2); sy = rng.int(1, w.h - 2);
    }
    const x = sx + rng.int(-3, 3), y = sy + rng.int(-3, 3);
    if (!w.inside(x, y)) continue;
    const i = w.idx(x, y);
    if (w.feature[i] || w.building[i] || w.designation[i]) continue;
    if (w.terrain[i] !== T.GRASS && w.terrain[i] !== T.DIRT) continue;
    if (!w.walkable(x, y)) continue;
    w.feature[i] = rng.chance(0.65) ? 'tree' : 'fungus';
    if (FEATURES[w.feature[i]].solid) w.touch();
  }
}

export function tickFarms(game) {
  if (game.tick % 12 !== 0) return;
  const w = game.world;
  const season = game.seasonDef;
  for (let i = 0; i < w.building.length; i++) {
    const b = w.building[i];
    if (!b || !b.done) continue;
    const def = BUILDINGS[b.id];
    if (def.job !== 'farm') continue;
    if (!b.planted || !CROPS[b.crop]) continue;
    const crop = CROPS[b.crop];
    const x = i % w.w, y = (i / w.w) | 0;
    const v = cropViability(b.crop, game.farmContext(x, y));
    if (v <= 0) {
      // Out of season: the crop stalls, then fails outright.
      b.failing = (b.failing || 0) + 12;
      if (b.failing > 2600) {
        b.planted = false; b.growth = 0; b.failing = 0;
        if (!b.reportedLoss) { game.log(`A crop of ${crop.name} was lost to the season.`, 'warn'); b.reportedLoss = true; }
      }
      continue;
    }
    b.failing = 0; b.reportedLoss = false;
    if (b.growth < 1) {
      // growDays is the time to ripen at perfect viability.
      const perTick = 1 / (crop.growDays * TICKS_PER_DAY);
      b.growth = clamp(b.growth + perTick * 12 * v * (1 + (game.bonuses.farmYield || 0) * 0.5) * season.growth, 0, 1);
    }
  }
}
