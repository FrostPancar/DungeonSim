// ============================================================================
// INCIDENTS: wanderers, caravans, windfalls, blights — and the Rift's nightly
// waves, which replace random raids entirely. The danger comes from one place,
// on a clock the player can plan around: every dusk, from the Rift.
// ============================================================================
import { vaultSafe, tradingPostLevel, fillOrders, pay } from './economy.js';
import { clamp } from './rng.js';
import { FACTIONS, RESOURCES, BUILDINGS, dispositionOf } from './data.js';
import { generateNPC, generateGroup, powerOf, shiftHostility } from './npc.js';
import { ANIMALS, createBeast } from './husbandry.js';
import { simulateCombat } from './combat.js';
import { monsterWave, rollMonsterDrops, noteBestiary, ENCOUNTERS } from './monsters.js';
import { BIOMES_RIFT } from './biomes.js';
import { killXp } from './classes.js';
import { awardXp } from './expedition.js';
import { addResource, addThought, killColonist, storageCap } from './colony.js';
import { TICKS_PER_DAY } from './colony.js';
import { findPath } from './world.js';
import { occupyMove } from './occupancy.js';
import { huntStep, inStrike } from './realtime.js';
import { SITE_KINDS, BIOMES } from './overworld.js';

export function colonyWealth(game) {
  let w = 0;
  for (const k in game.resources) {
    const cat = RESOURCES[k]?.cat;
    w += game.resources[k] * (cat === 'wealth' ? 3 : cat === 'arcane' ? 4 : cat === 'goods' ? 2 : 1);
  }
  w += game.colonists.reduce((s, c) => s + powerOf(c) * 2, 0);
  w += game.world.findBuildings().length * 4;
  w += game.armory.reduce((s, i) => s + i.value, 0);
  return Math.round(w);
}

export function threatLevel(game) {
  const day = game.tick / TICKS_PER_DAY;
  return clamp(0.5 + day * 0.075 + colonyWealth(game) / 3800 + game.stats.cleared * 0.25, 0.4, 14);
}

const INCIDENTS = [
  { id: 'wanderer',   w: (g, t) => 22 + Math.max(0, 8 - g.colonists.length) * 4 },
  { id: 'caravan',    w: (g, t) => (12 + t) * (1 + 0.35 * tradingPostLevel(g)) },
  { id: 'windfall',   w: (g, t) => 7 },
  { id: 'blight',     w: (g, t) => 3 + t * 0.8 },
  { id: 'wanderer',   w: (g, t) => 14 },
];

export function maybeIncident(game) {
  if (game.tick < 600) return;
  if (game.tick < game.nextIncidentTick) return;
  const t = threatLevel(game);
  const gap = clamp(1350 - t * 55, 430, 1350);
  game.root.nextIncidentTick = game.tick + Math.round(gap * game.rng.float(0.7, 1.35));
  const id = game.rng.weighted(INCIDENTS.map(i => [i.id, i.w(game, t)]));
  runIncident(game, id, t);
}

export function runIncident(game, id, t = threatLevel(game)) {
  switch (id) {
    case 'wanderer':    return incWanderer(game, t);
    case 'caravan':     return incCaravan(game, t);
    case 'raid':        return incRaid(game, t);
    case 'infestation': return incInfestation(game, t);
    case 'windfall':    return incWindfall(game, t);
    case 'blight':      return incBlight(game, t);
  }
}

function incWanderer(game, t) {
  const rng = game.rng;
  const faction = rng.weighted([['wanderers', 5], ['merchants', 2], ['outlaws', 1]]);
  const npc = generateNPC(rng, { faction, tier: clamp(Math.round(t * 0.7) + rng.int(0, 1), 0, 10) });
  npc.arrivedTick = game.tick;
  const disp = dispositionOf(npc.hostility);
  if (npc.hostility >= 62) {
    // Not a visitor. A scout for something worse.
    game.log(`A ${npc.race} ${npc.klass} was seen watching the hold. (${disp.name})`, 'warn');
    game.root.nextIncidentTick = Math.min(game.nextIncidentTick, game.tick + 400);
    return;
  }
  game.pendingArrivals.push({
    npc, expires: game.tick + 900,
    fee: npc.hostility > 34 ? Math.round(18 + npc.level * 7 + npc.hostility * 0.6) : 0,
  });
  game.log(`${npc.name.full} (${disp.name}) asks to join the hold.`, 'good', npc.id);
  return npc;
}

function incCaravan(game, t) {
  const rng = game.rng;
  const ow = game.overworld;
  // Caravans ride in from a settlement you know about, carrying what it produces.
  const settlements = ow ? ow.sites.filter(s => SITE_KINDS[s.kind].trade && s.discovered && (s.hostility ?? 50) < 65) : [];
  const from = settlements.length ? rng.pick(settlements) : null;
  let stock, wants, faction, name;
  if (from) {
    if (game.tick > (from.restock || 0)) { from.stock = ow.rollStock(rng, from); from.restock = game.tick + 4000; }
    stock = {};
    for (const k in from.stock) stock[k] = Math.max(1, Math.round(from.stock[k] * rng.float(0.25, 0.5)));
    wants = from.wants;
    faction = from.faction;
    name = from.name;
    from.lastVisit = game.tick;
  } else {
    stock = {};
    const pool = ['food', 'wood', 'stone', 'iron', 'cloth', 'leather', 'herbs', 'dust', 'gems', 'potion', 'meal'];
    for (const res of rng.pickMany(pool, rng.int(3, 5))) stock[res] = Math.round((14 + t * 9) * rng.float(0.6, 1.6));
    wants = rng.pickMany(['gold', 'gems', 'relics', 'dust', 'iron'], 2);
    faction = 'merchants'; name = FACTIONS.merchants.name;
  }
  // Settlements sometimes bring livestock to sell.
  const ANIMAL_OFFER = ['fowl', 'cavegoat', 'woolback', 'ox'];
  const livestock = from && rng.chance(0.55)
    ? { species: rng.pick(ANIMAL_OFFER.filter(a => ANIMALS[a].biomes.includes(from.biome)) .concat(['fowl'])), count: rng.int(1, 3) }
    : null;
  game.root.caravan = {
    faction, name, site: from || null, stock, wants, livestock,
    priceMult: rng.float(0.85, 1.3) * (from ? 1 - clamp((from.standing || 0) / 400, 0, 0.2) : 1) * (1 - 0.06 * tradingPostLevel(game)),
    expires: game.tick + 1400,
    trader: generateNPC(rng, { faction, tier: Math.round(t) }),
  };
  game.log(`A caravan from ${name} arrives to trade.`, 'good');
  fillOrders(game);
}

// Attacking forces are built to a fraction of what the colony can actually
// field, so a weakened hold is pressured but not simply deleted.
export function defenderPower(game) {
  // Only who is actually home: anyone down a Rift floor isn't holding the camp.
  return game.colonists.filter(c => !c.away && !c.dead && !c.mapId)
    .reduce((s, c) => s + powerOf(c), 0);
}
function raidForce(game, faction, t, ratio, maxSize, templates = null) {
  const rng = game.rng;
  const tier = clamp(Math.round(t * 0.7), 0, 12);
  const target = Math.max(28, defenderPower(game) * ratio);
  // Beasts and the dead come as monsters; the rest are classed warbands.
  if (templates || faction === 'wild' || faction === 'dead') return monsterWave(rng, faction, tier, target, maxSize, templates);
  const roles = ['front', 'front', 'back', 'support', 'flank'];
  const force = [];
  let power = 0;
  for (let i = 0; i < maxSize; i++) {
    const boss = i === 0 && t > 5 && rng.chance(0.3);
    const npc = generateNPC(rng, { faction, tier: tier + (boss ? 2 : 0), roleHint: roles[i % roles.length], boss });
    force.push(npc);
    power += powerOf(npc);
    if (power >= target) break;
  }
  return force;
}

function edgeSpawn(game) {
  const w = game.world;
  const rng = game.rng;
  for (let tries = 0; tries < 200; tries++) {
    const side = rng.int(0, 3);
    let x, y;
    if (side === 0) { x = rng.int(1, w.w - 2); y = 1; }
    else if (side === 1) { x = rng.int(1, w.w - 2); y = w.h - 2; }
    else if (side === 2) { x = 1; y = rng.int(1, w.h - 2); }
    else { x = w.w - 2; y = rng.int(1, w.h - 2); }
    if (w.walkable(x, y)) return { x, y };
  }
  return { x: w.start.x, y: w.start.y };
}

function incRaid(game, t) {
  const rng = game.rng;
  // Raids come from a real place: the nearest hostile site that still stands.
  const ow = game.overworld;
  const source = ow ? ow.nearest(s => SITE_KINDS[s.kind].hostileSite && !s.cleared, ow.colony.x, ow.colony.y) : null;
  const faction = source ? source.faction
    : rng.weighted([['outlaws', 4], ['warband', 3 + t * 0.3], ['wild', 2], ['cult', t > 4 ? 2 : 0], ['dead', t > 6 ? 2 : 0]]);
  // Tribute bought a truce: they keep it.
  const truce = game.root.truces && game.root.truces[faction];
  if (truce && truce > game.day) { game.log(`${FACTIONS[faction].name} ride past the hold — the truce holds.`, 'good'); return; }
  if (source) { source.discovered = true; source.raidsLaunched = (source.raidsLaunched || 0) + 1; }
  const raiders = raidForce(game, faction, t, clamp(0.30 + t * 0.038, 0.30, 0.82), 9);
  const size = raiders.length;
  const tier = clamp(Math.round(t * 0.7), 0, 12);
  const spawn = edgeSpawn(game);
  for (const r of raiders) {
    r.x = clamp(spawn.x + rng.int(-2, 2), 1, game.world.w - 2);
    r.y = clamp(spawn.y + rng.int(-2, 2), 1, game.world.h - 2);
    if (!game.world.walkable(r.x, r.y)) { r.x = spawn.x; r.y = spawn.y; }
    r.raid = true;
  }
  game.raiders.push(...raiders);
  const warn = game.world.findBuildings('watchpost').length > 0;
  const from = source ? ` out of ${source.name}` : '';
  game.log(`${FACTIONS[faction].name} raid${from}! ${size} hostiles approaching${warn ? ' — watchpost gives early warning.' : '.'}`, 'danger');
  game.root.alert = { text: `RAID: ${size} ${FACTIONS[faction].name}`, until: game.tick + 400 };
}

function incInfestation(game, t) {
  const rng = game.rng;
  const foes = raidForce(game, 'wild', t, clamp(0.22 + t * 0.03, 0.22, 0.62), 6);
  const size = foes.length;
  const w = game.world;
  for (const f of foes) {
    let placed = false;
    for (let k = 0; k < 120 && !placed; k++) {
      const x = clamp(w.start.x + rng.int(-22, 22), 1, w.w - 2);
      const y = clamp(w.start.y + rng.int(-16, 16), 1, w.h - 2);
      if (w.walkable(x, y) && Math.hypot(x - w.start.x, y - w.start.y) > 8) { f.x = x; f.y = y; placed = true; }
    }
    if (!placed) { f.x = w.start.x + 6; f.y = w.start.y; }
    f.raid = true;
  }
  game.raiders.push(...foes);
  game.log(`Something has broken through from below — ${size} creatures in the tunnels.`, 'danger');
  game.root.alert = { text: `INFESTATION: ${size} creatures`, until: game.tick + 400 };
}

function incWindfall(game, t) {
  const rng = game.rng;
  const res = rng.weighted([['food', 4], ['wood', 3], ['stone', 3], ['iron', 2], ['herbs', 2], ['gold', 2], ['dust', 1], ['gems', 1]]);
  const qty = Math.round((25 + t * 12) * rng.float(0.7, 1.4));
  addResource(game, res, qty);
  game.log(`A collapse exposes a cache: +${qty} ${RESOURCES[res].name}.`, 'good');
  for (const c of game.colonists) addThought(c, 'joy');
}

function incBlight(game, t) {
  const rng = game.rng;
  const kind = rng.weighted([['food', 3], ['sick', 2], ['gloom', 2]]);
  if (kind === 'food') {
    const loss = Math.round((game.resources.food || 0) * rng.float(0.2, 0.45));
    game.resources.food = Math.max(0, (game.resources.food || 0) - loss);
    game.log(`Rot takes ${loss} food from the stores.`, 'warn');
  } else if (kind === 'sick') {
    const victims = game.rng.pickMany(game.colonists.filter(c => !c.away), Math.max(1, Math.round(game.colonists.length * 0.3)));
    for (const v of victims) {
      v.injuries.push({ id: 'plague', name: 'Deep Rot', sev: 3, heal: 4000, left: 4000, treated: false, mods: { work: -0.3, mood: -6 } });
      addThought(v, 'wounded');
    }
    game.log(`Deep rot spreads — ${victims.length} denizens fall ill.`, 'danger');
  } else {
    for (const c of game.colonists) { addThought(c, 'cramped'); shiftHostility(c, 3, 'a bad season'); }
    game.log(`A long gloom settles over the hold. Tempers fray.`, 'warn');
  }
}

// --- the Rift's nightly waves ------------------------------------------------
// What pours out depends on how deep the Rift has grown: beasts at first, then
// the dead, then the things that worship what is on the other side.
function riftFaction(rng, lv) {
  return rng.weighted([
    ['wild', Math.max(1, 6 - lv * 0.6)],
    ['warband', lv >= 2 ? 2 : 0],
    ['dead', lv >= 3 ? lv * 0.8 : 0],
    ['cult', lv >= 5 ? lv * 0.6 : 0],
  ]);
}

/** Tonight's wave, before it happens: used by the wave itself and by the UI. */
export function waveForecast(game) {
  const lv = game.rift ? game.rift.level : 1;
  const firstNight = game.day <= 1 ? 0.6 : 1;
  const ward = clamp((game.bonuses.ward || 0) + (game.bonuses.defence || 0) * 0.5, 0, 0.5);
  const ratio = clamp(0.16 + lv * 0.026, 0.16, 0.55) * (1 - ward) * firstNight;
  const t = lv * 0.9 + game.day * 0.04;
  const power = Math.max(24, Math.round(defenderPower(game) * ratio));
  const tier = clamp(Math.round(t * 0.7), 0, 12);
  const size = clamp(Math.round(power / (14 + tier * 6)), 1, clamp(3 + lv, 3, 10));
  return { lv, ratio, t, power, size, maxSize: clamp(3 + lv, 3, 10) };
}

export function riftWave(game) {
  // A broken lair leaves the Rift too stunned to send anything out.
  if (game.rift.quietNights > 0) {
    game.rift.quietNights--;
    game.log('Dusk. The Rift stirs, but it is still reeling from its broken lair — nothing comes out tonight.', 'good');
    return;
  }
  const rng = game.rng;
  const f = waveForecast(game);
  // Tonight's wave comes out of today's biome.
  const bio = game.rift && game.rift.biome ? BIOMES_RIFT[game.rift.biome.id] : null;
  const faction = bio && bio.npcWave ? bio.npcWave : riftFaction(rng, f.lv);
  const foes = bio && !bio.npcWave && bio.waves.length
    ? raidForce(game, 'wild', f.t, f.ratio, f.maxSize, bio.waves)
    : raidForce(game, faction, f.t, f.ratio, f.maxSize);
  const w = game.world;
  const ring = (w.rift && w.rift.ring || []).filter(([x, y]) => w.walkable(x, y));
  // Spawn crowds the side of the Rift that faces the camp.
  ring.sort((a, b) => Math.hypot(a[0] - w.start.x, a[1] - w.start.y) - Math.hypot(b[0] - w.start.x, b[1] - w.start.y));
  const mouth = ring.slice(0, Math.max(6, Math.ceil(ring.length / 2)));
  for (const m of foes) {
    const spot = mouth.length ? mouth[rng.int(0, mouth.length - 1)] : [w.start.x, w.start.y - 6];
    m.x = spot[0]; m.y = spot[1];
    m.raid = true; m.riftSpawn = true;
  }
  // A tavern rumour warned you: some of tonight's wave finds the camp ready and never makes it out.
  if (game.root.intelDay === game.day && foes.length > 2) foes.splice(foes.length - Math.max(1, Math.round(foes.length * 0.12)));
  game.raiders.push(...foes);
  const what = foes.template && ENCOUNTERS[foes.template] ? ENCOUNTERS[foes.template].name : FACTIONS[faction].name;
  game.log(`Dusk. The Rift tears wide — ${foes.length} pour out of ${bio ? bio.name : 'the dark'} (${what}) toward the camp!`, 'danger');
  game.root.alert = { text: `RIFT WAVE: ${foes.length} · ${what}`, until: game.tick + 400 };
  game.root.waveActive = true;
}

/** Dawn: whatever still stands crawls back into the Rift, and scouts ride out. */
export function riftDawn(game) {
  const fled = game.raiders.filter(r => r.riftSpawn && r.hp > 0 && !r.fleeing).length;
  game.raiders = game.raiders.filter(r => !r.riftSpawn);
  if (fled) game.log(`Dawn. ${fled} surviving spawn crawl back into the Rift.`, 'warn');
  else if (game.rift && game.rift.waves && game.root.waveActive) {
    game.log('Dawn. The camp held through the night.', 'good');
    for (const c of game.colonists) if (!c.away) addThought(c, 'raid_won');
  }
  game.root.waveActive = false;
  if (game.bonuses.scout && game.overworld) {
    const ow = game.overworld;
    const found = ow.reveal(ow.colony.x, ow.colony.y, 6 + game.bonuses.scout * 2 + Math.floor(game.day / 5));
    if (found.length) game.log(`Scouts chart ${found.length} new place${found.length > 1 ? 's' : ''} at first light.`, 'good');
  }
}

// --- raiders on the camp map ---------------------------------------------------
// Rift spawn and raiders walk on the camp. Anyone of ours they can see close
// by is who they go for; otherwise they make for the heart of the camp. The
// fighting itself happens in realtime.js, blow by blow, wherever they meet.
export function tickRaiders(game) {
  if (!game.raiders.length) { settleWave(game); return; }
  const w = game.world;
  const target = w.start;
  const cols = game.here.filter(c => !c.dead && !c.away && c.hp > 0 && !c.downed);
  const mouth = w.rift ? game.gateMouth() : null;
  for (const r of game.raiders) {
    if (r.hp <= 0) continue;
    if (r.stamina == null) r.stamina = 100;
    r.stamina = Math.max(0, r.stamina - 0.05);   // a night of marching and killing wears even these down
    r.moveCd = (r.moveCd || 0) - 1;
    if (r.moveCd > 0) continue;
    r.moveCd = r.stamina < 20 ? 5 : 3;
    // Beaten and running: back into the Rift (or off the map), and gone.
    if (r.fleeing) {
      const home = r.riftSpawn && mouth ? mouth : edgeSpawn(game);
      if (Math.abs(r.x - home.x) <= 1 && Math.abs(r.y - home.y) <= 1 || game.tick > r.fleeing) { r.hp = 0; r.gone = true; continue; }
      huntStep(game, r, home.x, home.y, true);
      continue;
    }
    let foe = null, fd = Infinity;
    for (const c of cols) {
      const d = Math.max(Math.abs(c.x - r.x), Math.abs(c.y - r.y));
      if (d <= 8 && d < fd) { fd = d; foe = c; }
    }
    if (foe) {
      if (inStrike(game, r, foe)) continue;   // in reach: the field does the rest
      huntStep(game, r, foe.x, foe.y, true);
      continue;
    }
    if (!r.path || r.pathIdx >= r.path.length || r.pathGoal !== 'camp' || game.tick % 90 === 0) {
      r.path = findPath(w, r.x, r.y, target.x, target.y, false, 4000);
      r.pathIdx = 0; r.pathGoal = 'camp';
      if (!r.path) {
        // Blocked: chew through the nearest obstruction.
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = r.x + dx, ny = r.y + dy;
          if (!w.inside(nx, ny)) continue;
          const b = w.building[w.idx(nx, ny)];
          if (b && b.done) {
            b.hp -= 6;
            if (b.hp <= 0) { w.removeBuilding(nx, ny); w.recomputeLight(); game.log('Something from the Rift smashes through a structure.', 'danger'); }
            break;
          }
        }
        continue;
      }
    }
    const next = r.path[r.pathIdx];
    if (!next || !w.walkable(next[0], next[1])) { r.path = null; continue; }
    if (occupyMove(game, r, next[0], next[1])) { r.pathIdx++; r.blocked = 0; continue; }
    // Someone's in the way: hold a beat, then flow around the crowd.
    r.moveCd = 1;
    r.blocked = (r.blocked || 0) + 1;
    if (r.blocked % 2 === 0) {
      const p = findPath(w, r.x, r.y, target.x, target.y, false, 1500, game.occ);
      if (p && p.length) { r.path = p; r.pathIdx = 0; }
    }
  }
  // Overrun: spawn at the heart of the camp, and nobody of ours on their feet to stop them.
  if (game.tick % 30 === 0) {
    const atHeart = game.raiders.filter(r => r.hp > 0 && !r.fleeing && Math.max(Math.abs(r.x - target.x), Math.abs(r.y - target.y)) <= 3);
    if (atHeart.length && !cols.some(c => Math.max(Math.abs(c.x - target.x), Math.abs(c.y - target.y)) <= 10)) overrun(game);
  }
  game.raiders = game.raiders.filter(r => !r.gone);
  settleWave(game);
}

/** The camp is lost for the night: they loot the stores and go back where they came from. */
function overrun(game) {
  for (const c of game.colonists) addThought(c, 'raid_lost');
  game.root.morale -= 14;
  const stolen = {};
  for (const k of ['food', 'gold', 'iron', 'gems', 'meal']) {
    // The Counting House's strongroom keeps some gold where they can't reach it.
    const safe = k === 'gold' ? vaultSafe(game) : 0;
    const amt = Math.round(Math.max(0, (game.resources[k] || 0) - safe) * 0.35);
    if (amt > 0) { game.resources[k] -= amt; stolen[k] = amt; }
  }
  game.log(`The camp is overrun. The spawn drag off ${Object.entries(stolen).map(([k, v]) => `${v} ${k}`).join(', ') || 'what they can'} into the Rift.`, 'danger');
  for (const r of game.raiders) if (r.hp > 0) r.fleeing = game.tick + 300;
  game.stats.raidsLost++;
  game.root.waveActive = false;
}

/** The last of tonight's wave is dead: the camp held. */
function settleWave(game) {
  if (!game.root.waveActive) return;
  if (game.raiders.some(r => r.hp > 0 && r.riftSpawn && !r.fleeing)) return;
  game.root.waveActive = false;
  for (const c of game.colonists) addThought(c, 'raid_won');
  game.root.morale += 8;
  game.stats.raidsWon++;
  game.log('The wave is beaten off.', 'good');
}

// --- arrivals & trade -------------------------------------------------------
export function acceptArrival(game, arrivalIdx) {
  const a = game.pendingArrivals[arrivalIdx];
  if (!a) return false;
  if (a.fee > (game.resources.gold || 0)) return false;
  game.resources.gold = (game.resources.gold || 0) - a.fee;
  const npc = a.npc;
  npc.faction = 'colony';
  npc.x = game.world.start.x + game.rng.int(-2, 2);
  npc.y = game.world.start.y + game.rng.int(-2, 2);
  if (!game.world.walkable(npc.x, npc.y)) { npc.x = game.world.start.x; npc.y = game.world.start.y; }
  shiftHostility(npc, -8, 'welcomed into the hold');
  game.colonists.push(npc);
  game.pendingArrivals.splice(arrivalIdx, 1);
  game.log(`${npc.name.full} joins the hold.`, 'good', npc.id);
  return true;
}
export function rejectArrival(game, arrivalIdx) {
  const a = game.pendingArrivals[arrivalIdx];
  if (!a) return false;
  shiftHostility(a.npc, 12, 'turned away');
  game.pendingArrivals.splice(arrivalIdx, 1);
  game.log(`${a.npc.name.short} is turned away.`, 'info');
  return true;
}

export const PRICES = { food: 1.2, wood: 1, stone: 0.8, iron: 3, cloth: 2.2, leather: 2.4, herbs: 3, dust: 9, gems: 12, gold: 1, relics: 40, riftshard: 30, potion: 14, meal: 4, gear: 18, knowledge: 6 };
export function tradeBuy(game, res, qty) {
  const c = game.caravan;
  if (!c || !c.stock[res] || c.stock[res] < qty) return false;
  const cost = Math.ceil(PRICES[res] * qty * c.priceMult);
  if (!pay(game, cost, 'trade')) return false;
  c.stock[res] -= qty;
  addResource(game, res, qty);
  game.log(`Bought ${qty} ${RESOURCES[res].name} for ${cost} gold.`, 'info');
  gainStanding(game, cost * 0.04);
  return true;
}
export function tradeSell(game, res, qty) {
  const c = game.caravan;
  if (!c) return false;
  if ((game.resources[res] || 0) < qty) return false;
  const value = Math.floor(PRICES[res] * qty * 0.6 * (c.wants.includes(res) ? 1.5 : 1));
  game.resources[res] -= qty;
  addResource(game, 'gold', value);
  game.log(`Sold ${qty} ${RESOURCES[res].name} for ${value} gold.`, 'info');
  gainStanding(game, value * 0.05);
  return true;
}

/** Trade builds goodwill with the settlement that sent the caravan. */
export function gainStanding(game, amount) {
  const c = game.caravan;
  if (!c || !c.site) return;
  c.site.standing = (c.site.standing || 0) + amount;
  const before = c.site.hostility;
  c.site.hostility = clamp(c.site.hostility - amount * 0.35, 0, 100);
  if (before >= 50 && c.site.hostility < 50) game.log(`${c.site.name} now counts the hold a friend.`, 'good');
}

/** Buy livestock from a visiting caravan. */
export function buyLivestock(game, count = 1) {
  const c = game.caravan;
  if (!c || !c.livestock || c.livestock.count < count) return false;
  const A = ANIMALS[c.livestock.species];
  const price = Math.ceil((22 + A.hp * 0.9 + A.power * 2.5) * count * c.priceMult);
  if (!pay(game, price, 'shops')) return false;
  c.livestock.count -= count;
  for (let i = 0; i < count; i++) {
    const b = createBeast(game.rng, c.livestock.species, { tame: true });
    b.x = game.world.start.x; b.y = game.world.start.y;
    game.beasts.push(b);
  }
  game.log(`Bought ${count} ${A.name} for ${price} gold.`, 'good');
  gainStanding(game, price * 0.05);
  return true;
}
