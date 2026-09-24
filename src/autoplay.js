// ============================================================================
// AUTOPLAY: a competent-but-simple governor. Used as the headless test driver
// and as the in-game "Auto" mode so a run is never stuck waiting on the player.
// ============================================================================
import { clamp } from './rng.js';
import { BUILDINGS, RESEARCH } from './data.js';
import { TERRAIN, FEATURES } from './world.js';
import { storageCap, packRoom } from './colony.js';
import { STANCES } from './expedition.js';
import { partyPower } from './expedition.js';
import { powerOf, refresh } from './npc.js';
import { autoAllocate, pointsFree } from './classes.js';
import { canEquip, itemScore } from './items.js';
import { PRICES } from './events.js';
import { ANIMALS, isMature, herdCap } from './husbandry.js';
import { CROPS } from './farming.js';
import { makeTierItem } from './items.js';
import {
  forgeBlocker, forgeCost, forgeTier, familyFor, shopsOf, itemPrice, buyItem, potionPrice, buyPotion,
  levelOf, MAX_LEVEL, upgradeCost, orderUpgrade, bless, festival,
} from './economy.js';

const RESEARCH_ORDER = ['masonry', 'husbandry', 'agriculture', 'letters', 'smelting', 'commerce', 'ranching', 'logistics', 'arcana1', 'herbalism', 'grand_works', 'cartography', 'drill_corps', 'coinage', 'stockbreed', 'drilling', 'devotion', 'wardstone', 'deepmaps', 'relicry'];

// Target counts of each building, as a function of population.
function wants(game) {
  const pop = Math.max(1, game.colonists.length);
  return [
    ['stockpile', 2 + Math.floor(pop / 3)],
    ['bed', pop],
    ['table', 1],
    ['farm', game.unlocked.has('field') ? 2 : Math.max(4, pop)],
    ['field', game.unlocked.has('field') ? Math.max(6, pop + 2) : 0],
    ['compost', game.unlocked.has('compost') ? 2 : 0],
    ['pasture', game.unlocked.has('pasture') ? 2 : 0],
    ['trough', game.unlocked.has('trough') ? 1 : 0],
    ['butchery', game.unlocked.has('butchery') ? 1 : 0],
    ['barn', game.unlocked.has('barn') ? 1 : 0],
    ['kitchen', 1],
    ['brazier', 3],
    ['library', 1],
    ['carpenter', 1],
    ['mushroom', game.unlocked.has('mushroom') ? Math.max(2, Math.floor(pop / 2)) : 0],
    ['smithy', game.unlocked.has('smithy') ? 1 : 0],
    ['alchemy', game.unlocked.has('alchemy') ? 1 : 0],
    ['infirmary', game.unlocked.has('infirmary') ? 1 : 0],
    ['training', 1],
    ['watchpost', game.unlocked.has('watchpost') ? 2 : 0],
    ['shrine', game.unlocked.has('shrine') ? 1 : 0],
    ['reliquary', game.unlocked.has('reliquary') ? 1 : 0],
    ['armory', game.unlocked.has('armory') ? 1 : 0],
    ['trading_post', game.unlocked.has('trading_post') ? 1 : 0],
    ['apothecary', game.unlocked.has('apothecary') ? 1 : 0],
    ['stable', game.unlocked.has('stable') ? 1 : 0],
    ['counting_house', game.unlocked.has('counting_house') ? 1 : 0],
    ['temple', game.unlocked.has('temple') ? 1 : 0],
    ['tavern', game.unlocked.has('tavern') ? 1 : 0],
  ];
}

function freeSpot(game, prefer) {
  const w = game.world;
  for (let r = 2; r < 16; r++) {
    const candidates = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = w.start.x + dx, y = w.start.y + dy;
      if (!w.inside(x, y)) continue;
      const i = w.idx(x, y);
      if (TERRAIN[w.terrain[i]].solid) continue;
      if (w.feature[i]) continue;
      if (w.building[i]) continue;
      if (prefer && !w.canPlace(prefer, x, y)) continue;
      // Keep a walkable ring: never fully box a tile in with structures.
      let openNbrs = 0;
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.walkable(x + ddx, y + ddy)) openNbrs++;
      if (openNbrs < 3) continue;
      candidates.push([x, y]);
    }
    if (candidates.length) return candidates[game.rng.int(0, candidates.length - 1)];
  }
  return null;
}

function countPlanned(game, id) {
  const w = game.world;
  let n = 0;
  for (const b of new Set(w.building)) if (b && b.id === id) n++;
  return n;
}

export function autoplayStep(game) {
  if (game.tick % 40 !== 0) return;
  const w = game.world;
  const rng = game.rng;
  const res = game.resources;

  // --- skill trees: the autopilot spends every point as it comes ---
  game.autoSkills = true;
  for (const c of game.colonists) if (c.tree && pointsFree(c) > 0) { autoAllocate(c, game.rng.fork('ap' + c.id)); refresh(c); }

  // --- research ---
  if (!game.research.current) {
    for (const id of RESEARCH_ORDER) {
      if (game.research.done.has(id)) continue;
      if (!RESEARCH[id].req.every(q => game.research.done.has(q))) continue;
      game.setResearch(id); break;
    }
  }

  // --- gathering designations ---
  const activeMine = game.jobs.filter(j => j.kind === 'mine').length;
  const activeChop = game.jobs.filter(j => j.kind === 'harvest').length;
  const cap = storageCap(game);
  if (activeMine < 6) {
    // Prefer ore veins, then plain rock adjacent to open floor.
    const targets = [];
    for (let r = 3; r < 22 && targets.length < 8; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = w.start.x + dx, y = w.start.y + dy;
        if (!w.inside(x, y)) continue;
        const i = w.idx(x, y);
        if (w.designation[i]) continue;
        const f = w.feature[i];
        const isVein = f && FEATURES[f].inRock;
        const isRock = TERRAIN[w.terrain[i]].mineable;
        if (!isVein && !isRock) continue;
        let exposed = false;
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.walkable(x + ddx, y + ddy)) exposed = true;
        if (!exposed) continue;
        if (isVein) targets.unshift([x, y]); else if (res.stone < cap * 0.5) targets.push([x, y]);
      }
    }
    for (const [x, y] of targets.slice(0, 6)) game.designate(x, y, 'mine');
  }
  if (activeChop < 6) {
    let treeCount = 0;
    for (const f of w.feature) if (f === 'tree') treeCount++;
    const sparing = treeCount < 14 && (res.wood || 0) > 40;
    for (let r = 2; r < 20; r++) {
      let found = 0;
      for (let dy = -r; dy <= r && found < 4; dy++) for (let dx = -r; dx <= r && found < 4; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = w.start.x + dx, y = w.start.y + dy;
        if (!w.inside(x, y)) continue;
        const i = w.idx(x, y);
        if (w.designation[i]) continue;
        const f = w.feature[i];
        if (!f || FEATURES[f].inRock) continue;
        if (f === 'tree' && (sparing || res.wood > cap * 0.75)) continue;
        if ((f === 'fungus' || f === 'herb') && res.food > cap * 0.8) continue;
        game.designate(x, y, 'harvest'); found++;
      }
      if (found) break;
    }
  }

  // --- tunnelling: cut a shaft to the nearest arcane vein when we need one ---
  const needArcane = (res.dust || 0) < 8;
  if (needArcane && game.tick % 200 === 0) {
    let best = null, bd = Infinity;
    for (let i = 0; i < w.feature.length; i++) {
      const f = w.feature[i];
      if (f !== 'crystal' && f !== 'gems') continue;
      const x = i % w.w, y = (i / w.w) | 0;
      const d = Math.hypot(x - w.start.x, y - w.start.y);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) {
      // Designate a straight shaft from the colony edge out to the vein.
      let x = w.start.x, y = w.start.y;
      let guard = 0;
      while ((x !== best[0] || y !== best[1]) && guard++ < 60) {
        if (x !== best[0]) x += Math.sign(best[0] - x);
        else if (y !== best[1]) y += Math.sign(best[1] - y);
        const i = w.idx(x, y);
        if (TERRAIN[w.terrain[i]].mineable || (w.feature[i] && FEATURES[w.feature[i]].inRock)) game.designate(x, y, 'mine');
      }
    }
  }

  // --- construction ---
  for (const [id, target] of wants(game)) {
    if (!target) continue;
    if (!game.unlocked.has(id)) continue;
    if (countPlanned(game, id) >= target) continue;
    const def = BUILDINGS[id];
    // Only queue what we can afford soon, and never more than 3 blueprints out.
    const pending = new Set(w.building.filter(b => b && !b.done)).size;
    if (pending >= 4) break;
    let affordable = true;
    for (const k in def.cost) if ((res[k] || 0) < def.cost[k] * 1.1) affordable = false;
    if (!affordable) continue;
    const spot = freeSpot(game, id);
    if (spot) game.build(spot[0], spot[1], id);
    break;
  }

  // --- arrivals ---
  for (let i = game.pendingArrivals.length - 1; i >= 0; i--) {
    const a = game.pendingArrivals[i];
    const good = a.npc.hostility < 48 && game.colonists.length < 20 && (res.gold || 0) >= a.fee;
    if (good) game.acceptArrival(i); else if (a.npc.hostility >= 55) game.rejectArrival(i);
  }

  // --- trade ---
  if (game.caravan && game.tick % 200 === 0) {
    for (const surplus of ['stone', 'wood', 'relics', 'gems']) {
      const keep = surplus === 'relics' ? 0 : cap * 0.55;
      const extra = Math.floor((res[surplus] || 0) - keep);
      if (extra > 10) game.sell(surplus, Math.min(extra, 40));
    }
    if ((res.food || 0) < 40 && game.caravan.stock.food) game.buy('food', Math.min(game.caravan.stock.food, 30));
    if ((res.potion || 0) < 4 && game.caravan.stock.potion) game.buy('potion', Math.min(game.caravan.stock.potion, 4));
    if ((res.iron || 0) < 20 && game.caravan.stock.iron) game.buy('iron', Math.min(game.caravan.stock.iron, 20));
    if ((res.dust || 0) < 10 && game.caravan.stock.dust) game.buy('dust', Math.min(game.caravan.stock.dust, 10));
  }

  // --- gear ---
  if ((res.gear || 0) > 0 && game.tick % 200 === 0) {
    const fighter = game.colonists.filter(c => !c.away).sort((a, b) => b.skills.melee - a.skills.melee)[0];
    if (fighter) game.upgradeGear(fighter.id);
  }
  // Equip anything strictly better sitting in the armory, slot by slot.
  if (game.armory.length && game.tick % 120 === 0) {
    for (let i = game.armory.length - 1; i >= 0; i--) {
      const item = game.armory[i];
      if (!item) continue;
      const slot = item.slot || (item.kind === 'weapon' ? 'weapon' : 'armor');
      let bestC = null, bestGain = 0;
      for (const c of game.colonists) {
        if (c.away || canEquip(c, item)) continue;
        const gain = itemScore(c, item) - itemScore(c, c.equipment[slot]);
        if (gain > bestGain) { bestGain = gain; bestC = c; }
      }
      if (bestC && bestGain > 1) game.equip(bestC.id, i);
    }
  }
  // Forge with spare kits, brew a few wards and fill belts before delves.
  if (game.tick % 400 === 0) {
    for (const c of game.colonists) if (!c.away) c.belt = ['greater_healing', 'antidote'].filter(id => game.potionCount(id) > 0);
    if ((res.gear || 0) >= 4 && game.world.findBuildings('smithy').length) game.forge(rng.pick(['weapon', 'armor', 'head', 'feet', 'offhand']));
    if (game.world.findBuildings('alchemy').length) for (const id of ['antidote', 'greater_healing', 'burn_salve']) if (game.potionCount(id) < 3) game.brew(id);
  }

  // --- livestock management ---
  if (game.tick % 120 === 0 && game.beasts.length) {
    const tame = game.beasts.filter(b => b.tame && !b.dead);
    const cap = herdCap(game);
    // Keep breeding stock; cull the surplus for meat and hide.
    const bySpecies = {};
    for (const b of tame) (bySpecies[b.species] || (bySpecies[b.species] = [])).push(b);
    for (const sp in bySpecies) {
      const herd = bySpecies[sp].sort((a, b2) => b2.age - a.age);
      const A = ANIMALS[sp];
      const keep = A.war || A.pack ? 6 : 4;
      const mature = herd.filter(b => isMature(b) && !b.markedButcher);
      const over = tame.length > cap * 0.9 || mature.length > keep;
      if (over && A.butcher) {
        const cull = mature.filter(b => b.sex === 'm').slice(1).concat(mature.slice(keep));
        const victim = cull.find(b => !b.markedButcher && !b.handler);
        if (victim) game.markButcher(victim.id);
      }
    }
    // War and pack beasts each go with one of the classed fighters, spread
    // across them — the handlers take them down into the Rift.
    const handlers = game.colonists.filter(c => !c.dead && !c.peasant && c.tree).sort((a, b) => a.id - b.id);
    if (handlers.length) {
      for (const b of tame) {
        const A = ANIMALS[b.species];
        if (!(A.war || A.pack) || !isMature(b) || b.markedButcher || b.handler) continue;
        const load = (c) => tame.filter(x => x.handler === c.id).length;
        const c = handlers.slice().sort((x, y) => load(x) - load(y) || (y.skills.animals || 0) - (x.skills.animals || 0))[0];
        game.setHandler(b.id, c.id);
      }
    }
  }
  // Buy livestock when the pasture has room.
  if (game.caravan && game.caravan.livestock && game.tick % 200 === 0) {
    if (game.beasts.filter(b => b.tame && !b.dead).length < herdCap(game) - 1 && (res.gold || 0) > 90) game.buyLivestock(1);
  }

  if (game.tick % 240 === 0) autoSpend(game);

  // --- the Rift ---
  // Delving is played on the floors like a player would: go in by morning,
  // clear what the party can beat, break open what's lying about, go down
  // while everyone's healthy, and climb out when hurt or before dusk.
  if (game.tick % 15 === 0) autoDelve(game);
}

/** Everyone of ours on a Rift floor, grouped by floor. */
function partyByFloor(game) {
  const out = new Map();
  for (const c of game.colonists) {
    if (c.dead || !c.mapId) continue;
    const m = game.mapById(c.mapId);
    if (!m) continue;
    if (!out.has(m)) out.set(m, []);
    out.get(m).push(c);
  }
  return out;
}

function autoDelve(game) {
  const below = partyByFloor(game);
  if (!below.size) {
    // Nobody inside: send a party if the day, the wounds and the odds allow.
    const lastEnd = game.expeditionHistory.length ? game.expeditionHistory[game.expeditionHistory.length - 1].tick : -9999;
    const rested = game.tick - lastEnd > 700;
    if (!game.canEnterRift || game.hour < 6 || game.hour > 11 || !rested) return;
    const home = game.colonists.filter(c => !c.dead && !c.away && !c.mapId);
    if (home.some(c => c.order && c.order.travel)) return;   // already on their way
    // Peasants dig and farm; they don't delve. Only the classed go down, and
    // one of them always stays to hold the camp through the night.
    const fighters = home.filter(c => !c.peasant && c.tree);
    const available = fighters.filter(c => c.hp >= c.maxHp * 0.75 && c.injuries.filter(i => i.sev >= 3).length === 0);
    if (available.length < 3 || fighters.length - 2 < 1) return;
    // The strongest go; the weakest of the classed stays back with the peasants.
    const party = available.sort((a, b) => powerOf(b) - powerOf(a)).slice(0, Math.min(fighters.length - 1, 8));
    if (party.length < 2) return;
    game.orderTravel(party.map(p => p.id), 'down');
    return;
  }
  for (const [m, party] of below) {
    // Nobody is left behind: a downed member is carried out before anything else.
    const down = party.find(c => c.downed && !c.carriedBy);
    if (down) {
      const carrier = party.filter(c => !c.downed && !c.carrying && !(c.order && c.order.rescue)).sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0];
      if (carrier && !party.some(c => c.order && c.order.rescue === down.id)) game.orderRescue([carrier.id], down.id);
    }
    const idle = party.filter(c => !c.order && !c.downed && !c.carrying);
    if (!idle.length) continue;
    const v = game.viewOf(m);
    const hp = party.reduce((s, c) => s + c.hp, 0) / Math.max(1, party.reduce((s, c) => s + c.maxHp, 0));
    const hurt = party.some(c => c.hp < c.maxHp * 0.35);
    // Out before dusk: each floor down is a longer climb home.
    const late = game.hour >= 16 - m.depth || game.isNight;
    const full = party.every(c => packRoom(c) < 20);
    const starving = party.some(c => c.needs.hunger < 0.25 && !(((c.pack || {}).meal || 0) > 0 || ((c.pack || {}).food || 0) >= 2));
    if (hp < 0.5 || hurt || late || full || starving) { game.orderTravel(party.filter(c => !c.downed && !c.carrying && !(c.order && c.order.rescue)).map(c => c.id), 'up', true); continue; }
    const ids = idle.map(c => c.id);
    const cx = party.reduce((s, c) => s + c.x, 0) / party.length, cy = party.reduce((s, c) => s + c.y, 0) / party.length;
    const near = (u) => Math.hypot(u.x - cx, u.y - cy);
    const live = v.raiders.filter(r => r.hp > 0 && !r.neutral);
    // Anything already hunting us gets met head-on.
    const hunting = live.filter(r => r.awake).sort((a, b) => near(a) - near(b))[0];
    if (hunting) { game.orderAttack(ids, hunting.id); continue; }
    // A sleeping group we can beat, nearest first.
    const pw = partyPower(party);
    const groups = new Map();
    for (const r of live) { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group).push(r); }
    const beatable = [...groups.values()].filter(g => partyPower(g) * 1.25 < pw * hp).sort((a, b) => near(a[0]) - near(b[0]));
    // Loot and props first if they're closer than the next fight.
    const w = v.world;
    let prop = null, pd = Infinity;
    for (let i = 0; i < w.feature.length; i++) {
      const f = w.feature[i];
      if (!f || !FEATURES[f].prop) continue;
      const x = i % w.w, y = (i / w.w) | 0;
      const dd = Math.hypot(x - cx, y - cy);
      if (dd < pd) { pd = dd; prop = [x, y]; }
    }
    const fight = beatable[0];
    // Props on the way are opened; a floor isn't searched end to end while
    // the stairs down are waiting.
    const canDescend = w.stairsDown && m.depth < game.floorCount && hp > 0.75 && game.hour < 14;
    if (prop && (!fight || pd < near(fight[0])) && (pd < 6 || !canDescend)) {
      if (!party.some(c => c.task && c.task.kind === 'harvest')) v.orderWork(ids, prop[0], prop[1]);
      continue;
    }
    if (fight) { game.orderAttack(ids, fight[0].id); continue; }
    if (v.ground.length && party.some(c => c.task && c.task.kind === 'haul')) continue;   // let them finish picking it up
    // Nothing left here we can take: deeper while it's early and they're whole, else home.
    // What's left asleep here is more than they can take — leave it be.
    game.orderTravel(party.map(c => c.id), canDescend ? 'down' : 'up');
  }
}


/**
 * Spending, the way a careful steward would: gear the fighters from the forge
 * and the armory counter, keep healing draughts stocked, grow the buildings
 * that matter, and bless the camp before a hard night. Always keeps a reserve.
 */
function autoSpend(game) {
  const res = game.resources;
  // Enough kept back to welcome a newcomer who asks a fee, and to feed a caravan's order.
  const reserve = 220;
  const gold = () => res.gold || 0;
  const fighters = game.colonists.filter(c => !c.dead && !c.away && !c.peasant && c.tree).sort((a, b) => powerOf(b) - powerOf(a));
  // The forge: the best tier the smithy can make, for anyone wearing less.
  const tiers = ['runed', 'steel', 'iron', 'leather'];
  for (const c of fighters.slice(0, 5)) {
    for (const slot of ['weapon', 'armor', 'head', 'feet']) {
      const cur = c.equipment[slot];
      for (const tid of tiers) {
        if (forgeBlocker(game, tid, slot)) continue;
        const cost = forgeCost(tid, slot);
        if (gold() < (cost.gold || 0) + reserve) continue;
        const probe = makeTierItem(slot, tid, slot === 'weapon' ? familyFor(c) : undefined);
        if (canEquip(c, probe)) continue;
        if (cur && itemScore(c, probe) <= itemScore(c, cur) * 1.1) break;
        forgeTier(game, slot, tid, c.id);
        break;
      }
    }
  }
  // The armory counter: a clear upgrade for a fighter, if the treasury is healthy.
  const S = shopsOf(game);
  if (S.armory && gold() > reserve + 200) {
    for (let i = S.armory.items.length - 1; i >= 0; i--) {
      const it = S.armory.items[i];
      if (gold() < itemPrice(it) + reserve + 150) continue;
      const who = fighters.find(c => !canEquip(c, it) && itemScore(c, it) > (c.equipment[it.slot] ? itemScore(c, c.equipment[it.slot]) * 1.2 : 0));
      if (!who) continue;
      if (!buyItem(game, S.armory, i)) game.equip(who.id, game.armory.indexOf(it));
    }
  }
  // Healing draughts on the shelf.
  if (S.apothecary && S.apothecary.potions) {
    for (const id of ['greater_healing', 'minor_healing', 'antidote']) {
      while (game.potionCount(id) < 3 && S.apothecary.potions[id] > 0 && gold() > potionPrice(id) + reserve) buyPotion(game, S.apothecary, id);
    }
  }
  // Grow a building: workshops that feed research and gear first, then the shops.
  const busy = game.world.findBuildings().some(r => r.b.upgrade);
  if (!busy && gold() > reserve + 150) {
    const order = ['smithy', 'library', 'armory', 'apothecary', 'kitchen', 'trading_post', 'counting_house', 'alchemy', 'temple', 'stable', 'tavern', 'infirmary', 'carpenter'];
    let best = null;
    for (const id of order) for (const rec of game.world.findBuildings(id)) {
      if (!rec.b.done || levelOf(rec.b) >= MAX_LEVEL) continue;
      const cost = upgradeCost(id, levelOf(rec.b) + 1);
      if (gold() < (cost.gold || 0) + reserve) continue;
      if (!best || levelOf(rec.b) < levelOf(best.b)) best = rec;
    }
    if (best) orderUpgrade(game, best.x, best.y);
  }
  // A hard night coming: bless the camp.
  if (game.threat > 4 && gold() > 500 && (game.world.findBuildings('temple').length || game.world.findBuildings('shrine').length)) bless(game, 'warding');
  // Spirits low: a feast.
  if (game.morale < 40 && gold() > 150) festival(game);
}
