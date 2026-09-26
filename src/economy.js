// ============================================================================
// ECONOMY: where gold goes. See docs/economy-plan.md.
//
// Gold turns into what the colony can't make for itself. Almost all of it
// goes on two things: buying from shops (the ones you build, the traders who
// visit, the merchants waiting in the Rift) and building and upgrading
// structures. The passive drain — wages and upkeep — is kept deliberately
// light.
//
//   · Levels: shops and workshops grow to level 3 with gold and materials,
//     built by colonists like any construction.
//   · The Forge (the smithy) makes the same basic gear tiers every time.
//   · Shops — Arms Shop, Apothecary, Stable, Tavern, Temple, Trading Post,
//     Counting House — each have stock that rotates on its own rhythm.
//   · Visitors: a drover, an arms dealer, a curio dealer, sellswords, pilgrims.
//   · Rift merchants: neutral traders on some floors (floors.js places them).
//   · Journeys: parties that walk to a settlement and back.
//
// Everything random here draws from forks of game.rng keyed by day and shop,
// so buying something never changes what happens elsewhere in a seed.
// ============================================================================
import { clamp } from './rng.js';
import { BUILDINGS, RESOURCES } from './data.js';
import {
  makeTierItem, FORGE_TIERS, generateItem, POTIONS, WEAPON_FAMILIES, canEquip, itemScore,
} from './items.js';
import { PRICES } from './events.js';
import { generateNPC, shiftHostility, refresh } from './npc.js';
import { createBeast, ANIMALS, beastPower } from './husbandry.js';
import { addResource, addThought, TICKS_PER_DAY } from './colony.js';
import { awardXp } from './expedition.js';
import { xpToNext } from './classes.js';
import { SITE_KINDS } from './overworld.js';

// --- the ledger ---------------------------------------------------------------
/** Pay `amount` gold for `cat` (a readout category). False if it can't be afforded. */
export function pay(game, amount, cat = 'shops') {
  const root = game.root;
  amount = Math.round(amount);
  if (amount <= 0) return true;
  if ((root.resources.gold || 0) < amount) return false;
  root.resources.gold -= amount;
  const L = ledger(root);
  L.spent[cat] = (L.spent[cat] || 0) + amount;
  L.today[cat] = (L.today[cat] || 0) + amount;
  return true;
}
/** Gold coming in from a sale (for the readouts). */
export function earn(game, amount, cat = 'sales') {
  const root = game.root;
  amount = Math.round(amount);
  if (amount <= 0) return 0;
  root.resources.gold = (root.resources.gold || 0) + amount;
  const L = ledger(root);
  L.earned[cat] = (L.earned[cat] || 0) + amount;
  return amount;
}
export function ledger(root) {
  return root.ledger || (root.ledger = { spent: {}, earned: {}, today: {}, days: [] });
}
const rngFor = (game, key) => game.root.rng.fork(`econ:${key}:${game.root.day}`);

// --- building levels ----------------------------------------------------------
export const MAX_LEVEL = 3;
/** What gold does to each building that can grow. */
export const UPGRADES = {
  smithy:         { kind: 'forge',    per: 'Level 2 forges Steel, level 3 Runed. Its bench works 20% faster a level.' },
  armory:         { kind: 'shop',     per: 'A bigger dealer network: more stock, and rarer.' },
  apothecary:     { kind: 'shop',     per: 'Rarer brews on the shelf, and more of them.' },
  stable:         { kind: 'shop',     per: 'Better blood: rarer beasts and better traits.' },
  trading_post:   { kind: 'shop',     per: 'Caravans come more often and give better prices.' },
  counting_house: { kind: 'shop',     per: 'A bigger strongroom, and more interest each week.' },
  tavern:         { kind: 'service',  per: 'Better sellswords come asking for work.' },
  temple:         { kind: 'service',  per: 'Stronger blessings. At level 3, the dead can be raised.' },
  kitchen:        { kind: 'workshop', per: 'Works 20% faster a level.' },
  carpenter:      { kind: 'workshop', per: 'Works 20% faster a level.' },
  alchemy:        { kind: 'workshop', per: 'Works 20% faster a level.' },
  library:        { kind: 'workshop', per: 'Works 20% faster a level.' },
  archive:        { kind: 'workshop', per: 'Works 20% faster a level.' },
  observatory:    { kind: 'workshop', per: 'Works 20% faster a level.' },
  infirmary:      { kind: 'workshop', per: 'Works 20% faster a level.' },
};
export function levelOf(b) { return (b && b.level) || 1; }

/** Gold and materials to take a building to level `to`. */
export function upgradeCost(id, to) {
  const def = BUILDINGS[id], U = UPGRADES[id];
  const cost = {};
  for (const k in def.cost) if (k !== 'gold') cost[k] = Math.ceil(def.cost[k] * 0.5 * (to - 1));
  const base = U.kind === 'workshop' ? 45 : U.kind === 'forge' ? 80 : 70;
  cost.gold = Math.round(base * Math.pow(to - 1, 1.6) + (def.cost.gold || 0) * (to - 1));
  return cost;
}
export function upgradeWork(id, to) { return Math.round(BUILDINGS[id].work * 0.7 * (to - 1)); }

/** Why this building can't be upgraded now, or '' if it can. */
export function upgradeBlocker(game, b) {
  if (!b || !b.done) return 'Not built yet.';
  if (!UPGRADES[b.id]) return 'This doesn’t grow.';
  if (b.upgrade) return 'Already being upgraded.';
  if (levelOf(b) >= MAX_LEVEL) return 'At its best already.';
  return '';
}
/** Queue an upgrade: builders come and do it; the cost is paid when it's done. */
export function orderUpgrade(game, x, y) {
  const w = game.world;
  if (!w.inside(x, y)) return 'Nothing there.';
  const b = w.building[w.idx(x, y)];
  const why = upgradeBlocker(game, b);
  if (why) return why;
  const to = levelOf(b) + 1;
  b.upgrade = { to, workLeft: upgradeWork(b.id, to), cost: upgradeCost(b.id, to) };
  game.jobsDirty = true;
  return '';
}
export function cancelUpgrade(game, x, y) {
  const w = game.world, b = w.building[w.idx(x, y)];
  if (!b || !b.upgrade) return false;
  b.upgrade = null; game.jobsDirty = true;
  return true;
}
/** How much faster a bench works for its level. */
export function benchSpeed(b) {
  if (!b || !UPGRADES[b.id]) return 1;
  const k = UPGRADES[b.id].kind;
  return k === 'workshop' || k === 'forge' ? 1 + 0.2 * (levelOf(b) - 1) : 1;
}
/** The best level among the finished buildings with this id (0: none built). */
export function builtLevel(game, id) {
  let best = 0;
  for (const rec of game.root.world.findBuildings(id)) if (rec.b.done) best = Math.max(best, levelOf(rec.b));
  return best;
}

// --- the Forge: consistent tiers --------------------------------------------------
export const FORGE_COST = {
  leather: { level: 1, research: null,          cost: { leather: 6, gold: 12 } },
  iron:    { level: 1, research: 'smelting',    cost: { iron: 8, gold: 30 } },
  steel:   { level: 2, research: 'grand_works', cost: { iron: 14, stone: 6, gold: 70 } },
  runed:   { level: 3, research: 'high_arcana', cost: { iron: 10, dust: 8, gems: 3, gold: 160 } },
};
const SLOT_SCALE = { weapon: 1, armor: 1.2, head: 0.6, feet: 0.6, offhand: 0.7 };
export function forgeCost(tierId, slot) {
  const out = {};
  for (const [k, v] of Object.entries(FORGE_COST[tierId].cost)) out[k] = Math.max(1, Math.round(v * (SLOT_SCALE[slot] || 1)));
  return out;
}
export function forgeBlocker(game, tierId, slot) {
  const F = FORGE_COST[tierId];
  const lv = builtLevel(game, 'smithy');
  if (!lv) return 'Needs a Smithy.';
  if (F.research && !game.root.research.done.has(F.research)) return `Needs ${F.research.replace(/_/g, ' ')} researched.`;
  if (lv < F.level) return `Needs the Smithy at level ${F.level}.`;
  for (const [k, v] of Object.entries(forgeCost(tierId, slot))) if ((game.root.resources[k] || 0) < v) return `Needs ${v} ${RESOURCES[k] ? RESOURCES[k].name.toLowerCase() : k}.`;
  return '';
}
/** The weapon family a colonist fights with. */
export function familyFor(npc) {
  const w = npc && npc.equipment && npc.equipment.weapon;
  if (w && WEAPON_FAMILIES[w.family]) return w.family;
  const stat = npc && npc.combat && npc.combat.stat;
  return stat === 'ranged' ? 'bow' : stat === 'arcana' ? 'staff' : stat === 'faith' ? 'relic' : 'sword';
}
/**
 * Forge one piece. `for` a colonist: made in their weapon family and put on
 * them if it's better than what they wear; otherwise it goes to the armory.
 */
export function forgeTier(game, slot, tierId, npcId = null) {
  const root = game.root;
  const why = forgeBlocker(game, tierId, slot);
  if (why) return why;
  const c = npcId != null ? root.colonists.find(x => x.id === npcId) : null;
  const cost = forgeCost(tierId, slot);
  pay(root, cost.gold || 0, 'forge');
  for (const [k, v] of Object.entries(cost)) if (k !== 'gold') root.resources[k] -= v;
  const item = makeTierItem(slot, tierId, slot === 'weapon' ? familyFor(c) : undefined);
  root.armory.push(item);
  root.stats.forged = (root.stats.forged || 0) + 1;
  if (c && !canEquip(c, item) && itemScore(c, item) > (c.equipment[slot] ? itemScore(c, c.equipment[slot]) : 0)) root.equip(c.id, root.armory.indexOf(item));
  root.log(`The forge turns out ${item.name}${c ? ` for ${c.name.short}` : ''}.`, 'good');
  return '';
}

// --- shops you build --------------------------------------------------------------
export const SHOPS = {
  armory:     { name: 'Arms Shop',  building: 'armory',     every: 5, icon: '🛡️' },
  apothecary: { name: 'Apothecary', building: 'apothecary', every: 2, icon: '🧪' },
  stable:     { name: 'Stable',     building: 'stable',     every: 6, icon: '🐫' },
  tavern:     { name: 'Tavern',     building: 'tavern',     every: 5, icon: '🍺' },
};
export function shopsOf(root) { return root.shops || (root.shops = {}); }

// --- shopkeepers ------------------------------------------------------------------
// A shop you build only trades while someone is behind its counter: assign a
// colonist as its keeper (from the building) and they mind it through the day.
// Night, a keeper off eating or sleeping, or no keeper at all: the shop is shut.
export const KEPT_SHOPS = new Set(['armory', 'apothecary', 'stable', 'tavern', 'spellmason']);
/** Is someone minding this counter right now? Kept for a moment after they step away. */
export function keptNow(root, b) { return (b.keptUntil || 0) >= root.tick; }
/** Whether a shop building of this id is open, and if not, why not. */
export function shopStatus(game, bid) {
  const root = game.root, name = BUILDINGS[bid].name;
  const recs = root.world.findBuildings(bid).filter(r => r.b.done);
  if (!recs.length) return { open: false, why: `Needs a${/^[AEIOU]/.test(name) ? 'n' : ''} ${name}.` };
  if (!KEPT_SHOPS.has(bid)) return { open: true };
  for (const r of recs) if (keptNow(root, r.b)) return { open: true, keeper: root.colonists.find(c => c.id === r.b.keeper) || null };
  const r = recs.find(r => keeperOf(root, r.b));
  if (r) return { open: false, why: `The ${name} is shut: ${keeperOf(root, r.b).name.short} isn't at the counter${root.isNight ? ' at night' : ' yet'}.` };
  return { open: false, why: `The ${name} has no shopkeeper. Click it and assign someone to mind the counter.` };
}
/** The living colonist assigned to keep this building's counter, if any. */
export function keeperOf(root, b) {
  if (b.keeper == null) return null;
  const c = root.colonists.find(k => k.id === b.keeper && !k.dead);
  return c || null;
}
/** Put a colonist behind a shop's counter (null to relieve whoever is there). One shop each. */
export function assignKeeper(game, b, npcId) {
  const root = game.root;
  if (npcId != null) for (const r of root.world.findBuildings()) if (r.b !== b && r.b.keeper === npcId) r.b.keeper = null;
  b.keeper = npcId;
  b.keptUntil = 0;
  const c = npcId != null ? root.colonists.find(k => k.id === npcId) : null;
  if (c) { c.task = null; c.path = null; root.log(`${c.name.short} now keeps the ${BUILDINGS[b.id].name}.`, 'info', c.id); }
  return c;
}
/** A counter's stock object, if `from` is one of the shops you built: '' if open, else why not. */
function counterShut(game, from) {
  const S = shopsOf(game.root);
  for (const id in SHOPS) if (S[id] && S[id] === from) { const st = shopStatus(game, SHOPS[id].building); return st.open ? '' : st.why; }
  return '';
}

/** What an item sells for at a counter, and what the counter pays for it. */
export function itemPrice(item) { return Math.max(10, Math.round((item.value || 10) * 3.2)); }
export function itemBuyback(item) { return Math.max(2, Math.round(itemPrice(item) * 0.35)); }
/** A potion's shelf price: its ingredients' worth, and the brewer's time. */
export function potionPrice(id) {
  const P = POTIONS[id];
  let v = 0;
  for (const [k, q] of Object.entries(P.cost || {})) v += (PRICES[k] || 20) * q;
  return Math.max(12, Math.round(v * 1.6 + 8));
}
const POTION_SHELF = [
  ['minor_healing', 'greater_healing', 'antidote', 'burn_salve', 'oil_flask'],
  ['superior_healing', 'clarity', 'ward_fire', 'ward_frost', 'haste', 'stone_salve'],
  ['giants_strength', 'invisibility', 'alchemists_fire', 'holy_water', 'ward_storm', 'ward_shadow'],
];
export function beastPrice(b) {
  const A = ANIMALS[b.species];
  const traits = (b.traits || []).reduce((s, t) => s + (t === 'prize' || t === 'hardy' || t === 'fierce' ? 0.25 : t === 'sickly' || t === 'runt' ? -0.2 : 0), 0);
  return Math.round((22 + A.hp * 0.9 + A.power * 2.5) * 1.35 * (1 + traits));
}
/** A sellsword's daily wage, and what it costs to sign one on. */
export function mercWage(npc) { return Math.round(4 + npc.level * 1.5); }
export function mercFee(npc) { return mercWage(npc) * 5; }

function rollShop(game, id, level) {
  const root = game.root, rng = rngFor(game, id);
  const tier = Math.max(1, root.rift ? root.rift.level : 1);
  if (id === 'armory') {
    const items = [];
    for (let k = 0; k < 2 + level * 2; k++) {
      const slot = rng.weighted([['weapon', 4], ['armor', 3], ['head', 2], ['feet', 2], ['offhand', 2], ['charm', 2]]);
      items.push(generateItem(rng, { slot, tier, rarityBonus: level }));
    }
    return { items };
  }
  if (id === 'apothecary') {
    const potions = {};
    for (let L = 0; L < level; L++) for (const p of POTION_SHELF[L]) if (rng.chance(0.75)) potions[p] = rng.int(1, 4 - L);
    return { potions };
  }
  if (id === 'stable') {
    const pool = [['fowl', 2], ['cavegoat', 2], ['woolback', 2], ['ox', 2], ['warhound', 2]];
    if (level >= 2) pool.push(['packlizard', 2], ['boar', 1]);
    if (level >= 3) pool.push(['direwolf', 1]);
    const beasts = [];
    for (let k = 0; k < 1 + level; k++) {
      const sp = rng.weighted(pool);
      const b = createBeast(rng, sp, { tame: true, age: ANIMALS[sp].matureDays + rng.int(0, 3) });
      if (level >= 2 && rng.chance(0.4 + level * 0.1) && !b.traits.includes('prize')) b.traits = [...b.traits.filter(t => t !== 'sickly' && t !== 'runt'), rng.pick(['hardy', 'prize', 'fierce'])];
      beasts.push(b);
    }
    return { beasts };
  }
  if (id === 'tavern') {
    const mercs = [];
    for (let k = 0; k < level; k++) mercs.push(sellsword(rng, tier + level));
    return { mercs };
  }
  return {};
}
function sellsword(rng, tier) {
  const npc = generateNPC(rng, { faction: 'wanderers', tier: clamp(tier, 1, 10), roleHint: 'front' });
  npc.hostility = Math.min(npc.hostility, 35);
  return npc;
}

/** Restock whatever's due. Called at dawn. */
export function tickShops(game) {
  const root = game.root, S = shopsOf(root);
  for (const id in SHOPS) {
    const lv = builtLevel(root, SHOPS[id].building);
    if (!lv) { delete S[id]; continue; }
    const cur = S[id];
    if (cur && cur.level === lv && root.day - cur.day < SHOPS[id].every) continue;
    S[id] = { day: root.day, level: lv, ...rollShop(root, id, lv) };
  }
}

/** Buy the `i`th item off a counter or a trader's table. `from`: a stock object with `.items`. */
export function buyItem(game, from, i, cat = 'shops') {
  const shut = counterShut(game, from); if (shut) return shut;
  const it = from && from.items && from.items[i];
  if (!it) return 'Not in stock.';
  const price = it.commission ? it.balance : itemPrice(it);
  if (!pay(game, price, cat)) return `Costs ${price} gold.`;
  from.items.splice(i, 1);
  delete it.commission; delete it.balance;
  game.root.armory.push(it);
  game.root.log(`Bought ${it.name} for ${price} gold.`, 'info');
  return '';
}
/** Sell an armory item to a counter. */
export function sellItem(game, armoryIdx) {
  const root = game.root, it = root.armory[armoryIdx];
  if (!it) return 'Nothing to sell.';
  if (!builtLevel(root, 'armory') && !root.traders.some(t => t.kind === 'arms')) return 'Needs an Arms Shop, or the arms dealer in camp.';
  root.armory.splice(armoryIdx, 1);
  const got = earn(root, itemBuyback(it));
  root.log(`Sold ${it.name} for ${got} gold.`, 'info');
  return '';
}
export function buyPotion(game, from, id, cat = 'shops') {
  const shut = counterShut(game, from); if (shut) return shut;
  if (!from || !(from.potions && from.potions[id] > 0)) return 'Not in stock.';
  const price = Math.round(potionPrice(id) * (from.mult || 1));
  if (!pay(game, price, cat)) return `Costs ${price} gold.`;
  from.potions[id]--;
  game.root.givePotion(id);
  return '';
}
export function sellPotion(game, id) {
  const root = game.root;
  if (!builtLevel(root, 'apothecary')) return 'Needs an Apothecary.';
  if (root.potionCount(id) <= 0) return 'None to sell.';
  root.takePotion(id);
  earn(root, Math.round(potionPrice(id) * 0.4));
  return '';
}
export function buyBeast(game, from, i, cat = 'shops') {
  const shut = counterShut(game, from); if (shut) return shut;
  const b = from && from.beasts && from.beasts[i];
  if (!b) return 'Not in stock.';
  const price = beastPrice(b);
  if (!pay(game, price, cat)) return `Costs ${price} gold.`;
  from.beasts.splice(i, 1);
  const root = game.root;
  b.x = root.world.start.x; b.y = root.world.start.y;
  root.maps[0].beasts.push(b);
  root.log(`${b.name} the ${ANIMALS[b.species].name} joins the herd.`, 'good');
  return '';
}
/** Sign on a sellsword: they fight like anyone of ours, for a daily wage. */
export function hireMerc(game, from, i, cat = 'mercs') {
  const shut = counterShut(game, from); if (shut) return shut;
  const npc = from && from.mercs && from.mercs[i];
  if (!npc) return 'Nobody to hire.';
  const fee = mercFee(npc);
  if (!pay(game, fee, cat)) return `Signing costs ${fee} gold.`;
  from.mercs.splice(i, 1);
  const root = game.root;
  npc.faction = 'colony';
  npc.merc = { wage: mercWage(npc), since: root.day };
  npc.title = 'Sellsword';
  npc.x = root.world.start.x; npc.y = root.world.start.y; npc.mapId = 0;
  root.colonists.push(npc);
  root.log(`${npc.name.full} signs on as a sellsword, for ${npc.merc.wage} gold a day.`, 'good', npc.id);
  return '';
}
export function dismissMerc(game, npcId) {
  const root = game.root, c = root.colonists.find(x => x.id === npcId && x.merc);
  if (!c) return false;
  root.colonists.splice(root.colonists.indexOf(c), 1);
  root.log(`${c.name.short} takes their pay and leaves.`, 'info');
  return true;
}

// --- temple, tavern and training: services -------------------------------------------
export const BLESSINGS = {
  vigil:   { name: 'Vigil',          cost: 60, days: 3, desc: 'Everyone’s spirits lift; morale holds high for three days.' },
  mending: { name: 'Mending Rite',   cost: 70, days: 3, desc: 'Wounds close half again as fast for three days.', bonus: ['healRate', 0.5] },
  warding: { name: 'Warding Litany', cost: 90, days: 2, desc: 'The next two nights’ waves come out 15% weaker.', bonus: ['ward', 0.15] },
};
export function blessingCost(game, id) {
  const lv = builtLevel(game, 'temple') || builtLevel(game, 'shrine') || 1;
  const pilgrims = game.root.traders.some(t => t.kind === 'pilgrims');
  return Math.round(BLESSINGS[id].cost * (1 + (lv - 1) * 0.25) * (pilgrims ? 0.7 : 1));
}
export function bless(game, id) {
  const root = game.root, B = BLESSINGS[id];
  if (!builtLevel(root, 'temple') && !builtLevel(root, 'shrine') && !root.traders.some(t => t.kind === 'pilgrims')) return 'Needs a Temple, a Shrine, or pilgrims in camp.';
  const act = root.blessings || (root.blessings = {});
  if (act[id]) return 'Already blessed.';
  const cost = blessingCost(root, id);
  if (!pay(root, cost, 'blessings')) return `Costs ${cost} gold.`;
  const lv = builtLevel(root, 'temple') || 1;
  const mag = B.bonus ? B.bonus[1] * (1 + (lv - 1) * 0.25) : 0;
  act[id] = { until: root.day + B.days, mag };
  if (B.bonus) root.bonuses[B.bonus[0]] = (root.bonuses[B.bonus[0]] || 0) + mag;
  if (id === 'vigil') { root.morale = clamp(root.morale + 12, 0, 100); for (const c of root.colonists) addThought(c, 'joy'); }
  root.log(`${B.name}: the gods take the offering.`, 'good');
  return '';
}
function tickBlessings(root) {
  const act = root.blessings || {};
  for (const id in act) {
    const B = BLESSINGS[id];
    if (id === 'vigil') root.morale = clamp(root.morale + 4, 0, 100);
    if (root.day < act[id].until) continue;
    if (B.bonus) root.bonuses[B.bonus[0]] = (root.bonuses[B.bonus[0]] || 0) - act[id].mag;
    delete act[id];
  }
}
/** Raise the dead: a Temple at level 3 and a great deal of gold. */
export function raiseCost(npc) { return 400 + (npc.level || 1) * 60; }
export function raiseDead(game, graveIdx) {
  const root = game.root, npc = root.graveyard[graveIdx];
  if (!npc) return 'Nobody there.';
  if (builtLevel(root, 'temple') < 3) return 'Needs a Temple at level 3.';
  const cost = raiseCost(npc);
  if (!pay(root, cost, 'blessings')) return `Costs ${cost} gold.`;
  root.graveyard.splice(graveIdx, 1);
  npc.dead = false; npc.state = 'idle'; npc.task = null; npc.order = null; npc.downed = null; npc.mapId = 0; npc.away = false;
  npc.hp = Math.round(npc.maxHp * 0.5);
  npc.injuries = npc.injuries.filter(i => i.heal < 0);
  for (const k in npc.needs) npc.needs[k] = Math.max(npc.needs[k], 0.6);
  const t = root.world.findBuildings('temple')[0];
  npc.x = t ? t.x : root.world.start.x; npc.y = t ? t.y + 1 : root.world.start.y;
  root.colonists.push(npc);
  root.log(`${npc.name.full} draws breath again.`, 'major', npc.id);
  return '';
}
/** A day off: gold and food for a feast, and morale for everyone. */
export function festivalCost(game) {
  const n = game.root.colonists.length;
  return { gold: 30 + n * 3, food: n * 2 };
}
export function festival(game) {
  const root = game.root;
  if ((root.lastFestival || -99) > root.day - 5) return 'The last feast was too recent.';
  const cost = festivalCost(root);
  if ((root.resources.food || 0) < cost.food) return `Needs ${cost.food} food.`;
  if (!pay(root, cost.gold, 'festivals')) return `Costs ${cost.gold} gold.`;
  root.resources.food -= cost.food;
  root.lastFestival = root.day;
  const tav = builtLevel(root, 'tavern');
  root.morale = clamp(root.morale + 12 + tav * 3, 0, 100);
  for (const c of root.colonists) { addThought(c, 'joy', 1.5); c.needs.joy = Math.min(1, c.needs.joy + 0.4); }
  root.log('A feast: the camp eats, drinks and forgets the Rift for a night.', 'good');
  return '';
}
/** Paid drill: a master's time turns straight into experience. */
export function trainCost(npc) { return 30 + (npc.level || 1) * 12; }
export function paidTraining(game, npcId) {
  const root = game.root, c = root.colonists.find(x => x.id === npcId);
  if (!c) return 'Nobody to train.';
  if (!builtLevel(root, 'combat_school') && !builtLevel(root, 'mage_school') && !builtLevel(root, 'temple') && !builtLevel(root, 'proving_grounds')) return 'Needs a school or the Proving Grounds.';
  if ((c.lastTrained || -99) >= root.day) return 'Already trained today.';
  const cost = trainCost(c);
  if (!pay(root, cost, 'training')) return `Costs ${cost} gold.`;
  c.lastTrained = root.day;
  awardXp(root, c, Math.round(xpToNext(c.level) * 0.35));
  return '';
}
/** Rumours at the tavern: tonight's wave, scouted ahead. */
export const RUMOUR_COST = 25;
export function buyRumour(game) {
  const root = game.root;
  if (!builtLevel(root, 'tavern')) return 'Needs a Tavern.';
  if (root.intelDay === root.day) return 'You already know what’s coming tonight.';
  if (!pay(root, RUMOUR_COST, 'services')) return `Costs ${RUMOUR_COST} gold.`;
  root.intelDay = root.day;
  root.log('A drinker who’s seen the Rift at dusk tells you what to expect. Tonight’s wave will find you ready (12% weaker).', 'good');
  return '';
}

// --- visitors ---------------------------------------------------------------------------
export const VISITORS = {
  drover:     { name: 'Drover',         icon: '🐫', days: 2, odds: 0.10, desc: 'Livestock and trained beasts, some of good blood.' },
  arms:       { name: 'Arms dealer',    icon: '⚔️', days: 2, odds: 0.09, desc: 'Rarer weapons and armour. Takes commissions.' },
  curio:      { name: 'Curio dealer',   icon: '🏺', days: 2, odds: 0.05, desc: 'Relics, Rift keys and odd reagents. Pays well for trophies.' },
  sellswords: { name: 'Sellsword band', icon: '🗡️', days: 2, odds: 0.06, desc: 'Fighters for hire, by the day.' },
  pilgrims:   { name: 'Pilgrims',       icon: '🙏', days: 2, odds: 0.07, desc: 'Blessings for less, and they buy food at a good price.' },
};
const ESSENCE_IDS_ECON = ['ember', 'rime', 'storm', 'venom', 'radiant', 'umbral', 'arcane'];
function visitorStock(game, kind) {
  const root = game.root, rng = rngFor(game, 'v' + kind);
  const tier = Math.max(1, root.rift ? root.rift.level : 1);
  if (kind === 'drover') return rollShop(root, 'stable', 2);
  if (kind === 'arms') {
    const items = [];
    for (let k = 0; k < 4; k++) items.push(generateItem(rng, { slot: rng.pick(['weapon', 'armor', 'head', 'feet', 'offhand', 'charm']), tier, rarityBonus: 1 }));
    // Commissions paid for on an earlier visit arrive now.
    for (const c of root.commissions || []) {
      if (c.arrived) continue;
      const it = generateItem(rng, { slot: c.slot, tier, rarity: c.rarity });
      it.commission = true; it.balance = c.price - c.deposit;
      c.arrived = true;
      items.unshift(it);
    }
    root.commissions = (root.commissions || []).filter(c => !c.arrived);
    return { items };
  }
  if (kind === 'curio') {
    const reagents = {};
    for (const e of rng.pickMany(ESSENCE_IDS_ECON, 3)) reagents[e] = rng.int(1, 3);
    return { relics: rng.int(1, 3), keys: rng.int(1, 2), reagents };
  }
  if (kind === 'sellswords') return { mercs: [sellsword(rng, tier + 1), sellsword(rng, tier + 2), sellsword(rng, tier)] };
  if (kind === 'pilgrims') return {};
  return {};
}
export function tradingPostLevel(game) { return builtLevel(game, 'trading_post'); }
/** Dawn: some leave, some arrive. */
export function tickVisitors(game) {
  const root = game.root;
  root.traders = (root.traders || []).filter(t => root.tick < t.expires || (root.log(`The ${VISITORS[t.kind].name.toLowerCase()} moves on.`, 'info'), false));
  if (root.day < 4) return;
  const rng = rngFor(root, 'arrive');
  const post = tradingPostLevel(root);
  for (const kind in VISITORS) {
    if (root.traders.some(t => t.kind === kind)) continue;
    const V = VISITORS[kind];
    let odds = V.odds * (1 + post * 0.35);
    if (kind === 'sellswords') odds *= 1 + Math.min(1.5, (root.threat || 0) * 0.15);
    if (kind === 'pilgrims' && !builtLevel(root, 'temple') && !builtLevel(root, 'shrine')) odds *= 0.3;
    if (kind === 'arms' && (root.commissions || []).length) odds *= 2.5;
    if (!rng.chance(odds)) continue;
    root.traders.push({ kind, name: V.name, expires: root.tick + TICKS_PER_DAY * V.days, ...visitorStock(root, kind) });
    root.log(`A ${V.name.toLowerCase()} comes to camp: ${V.desc.charAt(0).toLowerCase() + V.desc.slice(1)}`, 'good');
  }
}
/** Bring a visitor to camp now (events, tests, and the debug console). */
export function summonVisitor(game, kind) {
  const root = game.root, V = VISITORS[kind];
  root.traders = (root.traders || []).filter(t => t.kind !== kind);
  const t = { kind, name: V.name, expires: root.tick + TICKS_PER_DAY * V.days, ...visitorStock(root, kind) };
  root.traders.push(t);
  return t;
}
export function traderOf(game, kind) { return (game.root.traders || []).find(t => t.kind === kind) || null; }

/** Pay a deposit now for a named piece; the arms dealer brings it next time. */
export function commissionPrice(game, rarity) {
  const tier = Math.max(1, game.root.rift ? game.root.rift.level : 1);
  const base = (8 + tier * 6) * (rarity === 'epic' ? 1.36 * 2.6 : 1.22 * 1.8);
  return Math.round(base * 3.2 * 1.15);
}
export function commission(game, slot, rarity) {
  const root = game.root;
  if (!traderOf(root, 'arms')) return 'Only the arms dealer takes commissions.';
  if ((root.commissions || []).length >= 2) return 'Two commissions already on order.';
  const price = commissionPrice(root, rarity), deposit = Math.round(price * 0.3);
  if (!pay(root, deposit, 'shops')) return `The deposit is ${deposit} gold.`;
  (root.commissions || (root.commissions = [])).push({ slot, rarity, price, deposit });
  root.log(`Commissioned a ${rarity} ${slot} piece: ${deposit} gold down, ${price - deposit} on delivery.`, 'info');
  return '';
}
export const CURIO_PRICES = { relic: 70, key: 60, reagent: 30 };
export function buyCurio(game, what, id = null) {
  const t = traderOf(game, 'curio');
  if (!t) return 'The curio dealer isn’t here.';
  const root = game.root;
  if (what === 'relic' && t.relics > 0) { if (!pay(root, CURIO_PRICES.relic)) return `Costs ${CURIO_PRICES.relic} gold.`; t.relics--; addResource(root, 'relics', 1); return ''; }
  if (what === 'key' && t.keys > 0) { if (!pay(root, CURIO_PRICES.key)) return `Costs ${CURIO_PRICES.key} gold.`; t.keys--; root.keys = (root.keys || 0) + 1; return ''; }
  if (what === 'reagent' && t.reagents[id] > 0) { if (!pay(root, CURIO_PRICES.reagent)) return `Costs ${CURIO_PRICES.reagent} gold.`; t.reagents[id]--; root.reagents[id] = (root.reagents[id] || 0) + 1; return ''; }
  return 'Not in stock.';
}
/** The curio dealer pays well for trophies. */
export const TROPHY_PRICE = 90;
export function sellTrophy(game, id) {
  const root = game.root;
  if (!traderOf(root, 'curio')) return 'The curio dealer isn’t here.';
  if (!(root.trophies[id] > 0)) return 'None to sell.';
  root.trophies[id]--;
  earn(root, TROPHY_PRICE);
  return '';
}
/** Pilgrims buy food and meals at half again the price. */
export function sellToPilgrims(game, res, qty) {
  const root = game.root;
  if (!traderOf(root, 'pilgrims')) return 'No pilgrims in camp.';
  if ((root.resources[res] || 0) < qty) return 'Not enough.';
  root.resources[res] -= qty;
  earn(root, Math.floor(PRICES[res] * qty * 0.6 * 1.5));
  return '';
}

// --- the Trading Post: standing orders ------------------------------------------------------
/** Standing orders the caravan fills: keep at least `min` of a resource, sell above `max`. */
export function setOrder(game, res, min = null, max = null) {
  const root = game.root;
  const orders = root.orders || (root.orders = {});
  if (min == null && max == null) delete orders[res];
  else orders[res] = { min, max };
}
/** A caravan arrived: fill what the orders ask for, at its prices. */
export function fillOrders(game) {
  const root = game.root, c = root.caravan;
  if (!c || !root.orders || !tradingPostLevel(root)) return;
  for (const [res, o] of Object.entries(root.orders)) {
    const have = root.resources[res] || 0;
    if (o.min != null && have < o.min && c.stock[res] > 0) {
      const qty = Math.min(c.stock[res], Math.ceil(o.min - have));
      const cost = Math.ceil(PRICES[res] * qty * c.priceMult);
      if (pay(root, cost, 'trade')) { c.stock[res] -= qty; addResource(root, res, qty); root.log(`Standing order: bought ${qty} ${RESOURCES[res].name} for ${cost} gold.`, 'info'); }
    }
    if (o.max != null && have > o.max) {
      const qty = Math.floor(have - o.max);
      root.resources[res] -= qty;
      const got = earn(root, Math.floor(PRICES[res] * qty * 0.6 * (c.wants.includes(res) ? 1.5 : 1)), 'trade');
      root.log(`Standing order: sold ${qty} ${RESOURCES[res].name} for ${got} gold.`, 'info');
    }
  }
}

// --- the Counting House --------------------------------------------------------------------
/** Gold kept safe from raiders. */
export function vaultSafe(game) { return builtLevel(game, 'counting_house') * 400; }
function interest(root) {
  const lv = builtLevel(root, 'counting_house');
  if (!lv || root.day % 7 !== 0) return;
  if ((root.stats.raidsLost || 0) > (root.lastInterestLosses || 0)) { root.lastInterestLosses = root.stats.raidsLost; return; }
  const got = earn(root, Math.min(Math.round((root.resources.gold || 0) * 0.02), 15 * lv), 'interest');
  if (got) root.log(`The Counting House: ${got} gold in interest from a quiet week.`, 'good');
}

// --- wages and upkeep: kept light ----------------------------------------------------------
/** Seasoned classed colonists take a small stipend: 1 gold a day from level 6, 2 from level 12. */
export function stipendOf(c) { return c.peasant || c.merc || !c.tree ? 0 : c.level >= 12 ? 2 : c.level >= 6 ? 1 : 0; }
/** What the colony pays each day: sellswords, stipends for the high-tier classed, shop upkeep. */
export function dailyCosts(game) {
  const root = game.root;
  const out = { mercs: 0, stipends: 0, upkeep: 0 };
  for (const c of root.colonists) {
    if (c.dead) continue;
    if (c.merc) out.mercs += c.merc.wage;
    else out.stipends += stipendOf(c);
  }
  for (const rec of root.world.findBuildings()) if (rec.b.done && UPGRADES[rec.b.id] && UPGRADES[rec.b.id].kind !== 'workshop') out.upkeep += levelOf(rec.b) - 1;
  return out;
}
function payDaily(root) {
  const costs = dailyCosts(root);
  for (const c of [...root.colonists]) {
    if (!c.merc || c.dead) continue;
    if (pay(root, c.merc.wage, 'mercs')) continue;
    root.colonists.splice(root.colonists.indexOf(c), 1);
    root.log(`${c.name.short} wasn’t paid and walks off with their kit.`, 'warn');
  }
  if (costs.stipends && !pay(root, costs.stipends, 'wages')) {
    for (const c of root.colonists) if (stipendOf(c)) shiftHostility(c, 1.5, 'unpaid');
  }
  if (costs.upkeep) pay(root, costs.upkeep, 'upkeep');
}

// --- journeys: parties that walk to a settlement and back ------------------------------------
export const ERRANDS = {
  // Settlements: places to spend gold.
  trade:   { name: 'Trade',   desc: 'Buy what the settlement makes, at its own prices.' },
  recruit: { name: 'Recruit', desc: 'Buy out a volunteer’s contract. They come back with the party.' },
  heal:    { name: 'Healing', desc: 'The temple there mends wounds nobody here can: permanent injuries.' },
  tribute: { name: 'Tribute', desc: 'Pay for peace: their raiders leave you alone for a season.' },
  fund:    { name: 'Fund walls', desc: 'Pay for their defences. An ally makes the camp stronger.' },
  // Everywhere else: places to go and get something (docs/progression-roadmap.md P1-3).
  gather:  { name: 'Gather',  desc: 'Work the site and carry back what it holds. The first haul from anywhere is doubled.' },
  search:  { name: 'Search',  desc: 'Go through the old place once. It may be guarded: relics, gold, sometimes a Class Tome.' },
  pilgrim: { name: 'Pilgrimage', desc: 'Pray at the shrine. The whole camp takes heart for a while.' },
  survey:  { name: 'Survey',  desc: 'Climb it and look around: insight, and the land around it charted.' },
  clear:   { name: 'Clear',   desc: 'Break the camp or lair. A bounty in gold, and no more raids from it. Send your strongest.' },
};
/** Which errand a site offers a party, if any, beyond the settlement ones. */
export function siteErrand(site) {
  const K = SITE_KINDS[site.kind] || {};
  if (K.node) return (site.reserve || 0) > 0 ? 'gather' : null;
  if (K.delve) return site.searched ? null : 'search';
  if (K.shrine) return 'pilgrim';
  if (K.landmark) return site.surveyed ? null : 'survey';
  if (K.hostileSite) return site.cleared ? null : 'clear';
  return null;
}
/** What a site's errand would bring home, for the card that offers it. */
export function siteRewardPreview(root, site, n = 2) {
  const e = siteErrand(site);
  if (!e) return null;
  const K = SITE_KINDS[site.kind];
  if (e === 'gather') return { errand: e, res: { [K.node]: gatherAmount(site, n) }, first: !site.gathered };
  if (e === 'search') return { errand: e, text: 'relics, gold, maybe a Class Tome', risk: 0.25 + site.tier * 0.05 };
  if (e === 'pilgrim') return { errand: e, text: 'the whole camp in better spirits', ready: !(site.pilgrimDay > root.day - 10) };
  if (e === 'survey') return { errand: e, text: `${60 + site.tier * 20} insight, and nearby sites charted` };
  if (e === 'clear') return { errand: e, res: { gold: clearBounty(site) }, text: 'and no more raids from it', risk: 0.5 };
  return null;
}
function gatherAmount(site, n) {
  const per = Math.round(18 * (site.richness || 1));
  return Math.max(1, Math.min(site.reserve || 0, per * Math.max(1, n) * (site.gathered ? 1 : 2)));
}
function clearBounty(site) { return 40 + (site.tier || 1) * 25; }
/** A hostile site's odds against this party: power over the site's strength. */
export function clearOdds(party, site) {
  const pw = party.reduce((s, c) => s + powerOfLite(c), 0);
  return clamp(pw / ((site.strength || 8) * 9), 0.1, 0.95);
}
function powerOfLite(c) { return c.combat && c.combat.power ? c.combat.power : 10 + c.level * 3; }
export function journeyDays(game, site) {
  const ow = game.root.overworld;
  const ticks = ow ? ow.travelTicks(ow.colony, site) : TICKS_PER_DAY;
  return Math.max(1, Math.round((ticks * 2) / TICKS_PER_DAY + 0.5));
}
export function errandCost(game, site, errand, ids = []) {
  const root = game.root;
  const standing = clamp((site.standing || 0) / 400, 0, 0.25);
  if (errand === 'recruit') return Math.round((160 + (site.tier || 1) * 30) * (1 - standing));
  if (errand === 'heal') {
    const n = ids.reduce((s, id) => { const c = root.colonists.find(x => x.id === id); return s + (c ? c.injuries.filter(i => i.heal < 0).length : 0); }, 0);
    return Math.max(1, n) * 110;
  }
  if (errand === 'tribute') return Math.round(80 + (site.hostility || 50) * 3);
  if (errand === 'fund') return 300;
  return 0;
}
/** Send `ids` to `site` on `errand` (for trade: `goods` is { res: qty } to buy). */
export function sendJourney(game, ids, siteId, errand, goods = null) {
  const root = game.root, ow = root.overworld;
  const site = ow && ow.sites.find(s => s.id === siteId);
  if (!site) return 'No such place.';
  if (!ERRANDS[errand]) return 'No such errand.';
  const party = ids.map(id => root.colonists.find(c => c.id === id && !c.dead && !c.away && !(c.mapId || 0))).filter(Boolean);
  if (!party.length) return 'Choose who goes.';
  const settle = SITE_KINDS[site.kind] && SITE_KINDS[site.kind].trade;
  if (settle && (site.hostility ?? 50) >= 75 && errand !== 'tribute') return `${site.name} won’t deal with you.`;
  if (!settle && errand !== siteErrand(site)) return `Nothing to ${ERRANDS[errand].name.toLowerCase()} at ${site.name}.`;
  if (errand === 'pilgrim' && site.pilgrimDay > root.day - 10) return `The pilgrims were at ${site.name} lately. Wait ${site.pilgrimDay + 10 - root.day} days.`;
  if ((root.journeys || []).some(j => j.site === site.id && !settle)) return `Someone is already on the way to ${site.name}.`;
  let cost = settle ? errandCost(root, site, errand, ids) : 0;
  if (errand === 'trade') {
    cost = 0;
    if (!site.stock && ow.rollStock) site.stock = ow.rollStock(rngFor(root, 'site' + site.id), site);
    const stock = site.stock || {};
    for (const [res, q] of Object.entries(goods || {})) {
      if (!(stock[res] >= q)) return `${site.name} doesn’t have ${q} ${res}.`;
      cost += Math.ceil(PRICES[res] * q * 0.9);
    }
    if (!cost) return 'Choose what to buy.';
  }
  if (!pay(root, cost, 'journeys')) return `Costs ${cost} gold.`;
  const days = journeyDays(root, site);
  for (const c of party) { c.away = true; c.task = null; c.order = null; c.path = null; }
  (root.journeys || (root.journeys = [])).push({ ids: party.map(c => c.id), site: site.id, errand, goods, back: root.tick + days * TICKS_PER_DAY, paid: cost });
  root.stats.journeys = (root.stats.journeys || 0) + 1;
  root.log(`${party.map(c => c.name.short).join(', ')} set out for ${site.name} (${ERRANDS[errand].name.toLowerCase()}), back in ${days} day${days === 1 ? '' : 's'}.`, 'info');
  return '';
}
function tickJourneys(root) {
  const js = root.journeys || [];
  for (let i = js.length - 1; i >= 0; i--) {
    const j = js[i];
    if (root.tick < j.back) continue;
    js.splice(i, 1);
    const site = root.overworld.sites.find(s => s.id === j.site);
    const party = j.ids.map(id => root.colonists.find(c => c.id === id)).filter(Boolean);
    for (const c of party) {
      c.away = false; c.mapId = 0;
      c.x = root.world.start.x; c.y = root.world.start.y;
      c.needs.hunger = Math.max(c.needs.hunger, 0.5);
    }
    const rng = rngFor(root, 'journey' + i);
    let what = '';
    if (j.errand === 'trade') {
      for (const [res, q] of Object.entries(j.goods || {})) { addResource(root, res, q); if (site && site.stock) site.stock[res] = Math.max(0, (site.stock[res] || 0) - q); }
      what = `with ${Object.entries(j.goods || {}).map(([r, q]) => `${q} ${RESOURCES[r].name.toLowerCase()}`).join(', ')}`;
    } else if (j.errand === 'recruit') {
      const n = generateNPC(rng, { faction: 'wanderers', tier: clamp((site ? site.tier : 1) + 1, 1, 8) });
      n.faction = 'colony'; n.hostility = Math.min(n.hostility, 25);
      n.x = root.world.start.x; n.y = root.world.start.y;
      root.colonists.push(n);
      what = `and ${n.name.full}, who has joined the hold`;
    } else if (j.errand === 'heal') {
      let k = 0;
      for (const c of party) { const before = c.injuries.length; c.injuries = c.injuries.filter(inj => inj.heal >= 0); k += before - c.injuries.length; refresh(c); }
      what = k ? `with ${k} old wound${k === 1 ? '' : 's'} mended` : 'none the worse';
    } else if (j.errand === 'tribute' && site) {
      site.hostility = clamp((site.hostility || 50) - 30, 0, 100);
      (root.truces || (root.truces = {}))[site.faction] = root.day + 15;
      what = `with a truce: ${site.name}’s people won’t raid for a season`;
    } else if (j.errand === 'fund' && site) {
      if (!site.allied) { site.allied = true; root.bonuses.defence = (root.bonuses.defence || 0) + 0.05; }
      site.hostility = clamp((site.hostility || 50) - 20, 0, 100);
      what = `— ${site.name} is an ally now`;
    }
    else if (site && ['gather', 'search', 'pilgrim', 'survey', 'clear'].includes(j.errand)) what = resolveSiteErrand(root, site, j, party, rng);
    if (site) site.standing = (site.standing || 0) + j.paid * 0.08;
    root.log(`${party.map(c => c.name.short).join(', ')} come${party.length === 1 ? 's' : ''} back from ${site ? site.name : 'the road'} ${what}.`, 'good');
  }
}

/** A party is home from a non-settlement site: what they found, as the log's tail. */
function resolveSiteErrand(root, site, j, party, rng) {
  const hurt = (p) => { for (const c of party) if (rng.chance(p)) c.hp = Math.max(1, Math.round(c.hp * rng.float(0.35, 0.7))); };
  if (j.errand === 'gather') {
    const res = SITE_KINDS[site.kind].node;
    const q = gatherAmount(site, party.length);
    site.reserve = Math.max(0, (site.reserve || 0) - q);
    site.gathered = (site.gathered || 0) + 1;
    addResource(root, res, q);
    return `with ${q} ${RESOURCES[res].name.toLowerCase()}${site.reserve ? '' : ' — the site is worked out'}`;
  }
  if (j.errand === 'search') {
    site.searched = true;
    if (rng.chance(0.25 + site.tier * 0.05)) hurt(0.5);
    const got = [];
    const gold = rng.int(15, 35) * (site.tier || 1);
    addResource(root, 'gold', gold); got.push(`${gold} gold`);
    const relics = rng.int(1, 2 + Math.floor((site.tier || 1) / 3));
    addResource(root, 'relics', relics); got.push(`${relics} relic${relics > 1 ? 's' : ''}`);
    if (rng.chance(0.3)) { root.reagents.class_tome = (root.reagents.class_tome || 0) + 1; got.push('a Class Tome'); }
    else if (rng.chance(0.6)) { const it = generateItem(rng, { tier: clamp((site.tier || 1) + 1, 1, 10), slot: rng.pick(['weapon', 'armor', 'head', 'feet', 'charm']) }); root.armory.push(it); got.push(it.name); }
    return `with ${got.join(', ')}`;
  }
  if (j.errand === 'pilgrim') {
    site.pilgrimDay = root.day;
    for (const c of root.colonists) if (!c.dead) addThought(c, 'relic_awe');
    return 'and stories that lift the whole camp';
  }
  if (j.errand === 'survey') {
    site.surveyed = true;
    root.pendingInsight += 60 + site.tier * 20;
    const found = root.overworld.reveal(site.x, site.y, 12);
    return `with ${60 + site.tier * 20} insight${found.length ? ` and ${found.length} new site${found.length > 1 ? 's' : ''} charted` : ''}`;
  }
  if (j.errand === 'clear') {
    if (rng.chance(clearOdds(party, site))) {
      site.cleared = true; site.hostility = 0;
      const b = clearBounty(site);
      addResource(root, 'gold', b);
      hurt(0.3);
      return `victorious: ${site.name} is broken, and its hoard pays ${b} gold`;
    }
    hurt(0.8);
    return `beaten back from ${site.name}, bloodied`;
  }
  return '';
}

// --- packs: leather turned into loot-carrying room ------------------------------------------
export const PACK_STEP = 30, PACK_MAX = 3;
export function packUpgradeCost(npc) { const lv = Math.round((npc.packUpgrade || 0) / PACK_STEP); return { leather: 12 + lv * 10, cloth: 4 + lv * 3 }; }
/** Stitch a bigger pack for a delver: more loot carried out of the Rift per trip. */
export function upgradePack(game, id) {
  const root = game.root, c = root.colonists.find(x => x.id === id && !x.dead);
  if (!c) return 'No such colonist.';
  if ((c.packUpgrade || 0) >= PACK_STEP * PACK_MAX) return 'That pack is as big as a back can carry.';
  const cost = packUpgradeCost(c);
  for (const [k, v] of Object.entries(cost)) if ((root.resources[k] || 0) < v) return `Needs ${v} ${RESOURCES[k].name.toLowerCase()}.`;
  for (const [k, v] of Object.entries(cost)) root.resources[k] -= v;
  c.packUpgrade = (c.packUpgrade || 0) + PACK_STEP;
  root.log(`${c.name.short}'s pack is stitched bigger: +${PACK_STEP} carrying room.`, 'good', c.id);
  return '';
}

// --- Rift merchants (placed on floors by floors.js) ------------------------------------------
export const RIFT_MERCHANTS = {
  fence:        { name: 'Goblin fence',      icon: '👺', race: 'goblin', minDepth: 1, desc: 'Cheap potions and “slightly used” gear. Buys anything the party carries — badly.' },
  mimic:        { name: 'Mimic trader',      icon: '📦', race: 'construct', minDepth: 1, desc: 'One chest, one price. It might hold anything.' },
  bone_broker:  { name: 'Bone broker',       icon: '💀', race: 'undead', minDepth: 2, desc: 'Cursed gear: strong, with a price. Pays best for trophies and relics.' },
  cartographer: { name: 'Lost cartographer', icon: '🗺️', race: 'human', minDepth: 1, desc: 'Maps of this floor, and Rift keys for its vaults.' },
  deep_smith:   { name: 'Deep smith',        icon: '⚒️', race: 'dwarf', minDepth: 3, desc: 'Reforges a forged piece one tier up — only down here.' },
  fey_hawker:   { name: 'Fey hawker',        icon: '🧚', race: 'elf', minDepth: 2, desc: 'Charms and trinkets. Pays twice over for food and herbs.' },
};
/** A merchant's stock, made the first time anyone asks. */
export function merchantStock(v, r) {
  if (r.stock) return r.stock;
  const m = v._m, rng = (m.rng || v.root.rng).fork('merchant:' + r.id);
  const tier = Math.max(1, (v.root.rift.level || 1) + (m.depth || 1) - 1);
  const s = { items: [], potions: {}, mult: 1 };
  if (r.merchant === 'fence') {
    for (const p of rng.pickMany(['minor_healing', 'greater_healing', 'antidote', 'burn_salve'], 3)) s.potions[p] = rng.int(1, 3);
    s.mult = 0.8;
    for (let k = 0; k < 2; k++) s.items.push(generateItem(rng, { slot: rng.pick(['weapon', 'armor', 'head', 'feet']), tier, rarity: rng.chance(0.6) ? 'common' : 'uncommon' }));
  } else if (r.merchant === 'mimic') {
    s.chest = 1; s.chestPrice = 150 + (m.depth || 1) * 60;
  } else if (r.merchant === 'bone_broker') {
    for (let k = 0; k < 2; k++) {
      const it = generateItem(rng, { slot: rng.pick(['weapon', 'armor', 'charm', 'offhand']), tier: tier + 2, rarity: 'epic' });
      it.cursed = true; it.mods.hp = (it.mods.hp || 0) - 0.1; it.name = 'Cursed ' + it.name; it.value = Math.round(it.value * 0.8);
      s.items.push(it);
    }
  } else if (r.merchant === 'cartographer') {
    s.map = 1; s.keys = 2;
  } else if (r.merchant === 'deep_smith') {
    s.reforge = true;
  } else if (r.merchant === 'fey_hawker') {
    for (let k = 0; k < 3; k++) s.items.push(generateItem(rng, { slot: 'charm', tier, rarity: rng.pick(['uncommon', 'rare']) }));
  }
  r.stock = s;
  return s;
}
export const MAP_PRICE = 40, KEY_PRICE = 60;
/** The party trades from the treasury back home: a Rift merchant takes a note of hand. */
export function merchantBuy(v, r, what, arg = null) {
  const s = merchantStock(v, r), root = v.root;
  if (what === 'item') return buyItem(root, s, arg, 'rift');
  if (what === 'potion') return buyPotion(root, s, arg, 'rift');
  if (what === 'map' && s.map > 0) {
    if (!pay(root, MAP_PRICE, 'rift')) return `Costs ${MAP_PRICE} gold.`;
    s.map--; v._m.revealed = true;
    root.log(`F${v._m.depth}: the cartographer’s map shows the whole floor.`, 'good');
    return '';
  }
  if (what === 'key' && s.keys > 0) {
    if (!pay(root, KEY_PRICE, 'rift')) return `Costs ${KEY_PRICE} gold.`;
    s.keys--; root.keys = (root.keys || 0) + 1;
    return '';
  }
  if (what === 'chest' && s.chest > 0) {
    if (!pay(root, s.chestPrice, 'rift')) return `Costs ${s.chestPrice} gold.`;
    s.chest--;
    const rng = (v._m.rng || root.rng).fork('mimic:' + r.id);
    const tier = Math.max(1, (root.rift.level || 1) + (v._m.depth || 1));
    const roll = rng.float();
    if (roll < 0.15) { const it = generateItem(rng, { tier, rarity: 'legendary', slot: rng.pick(['weapon', 'armor', 'charm']) }); root.armory.push(it); root.log(`The mimic opens its mouth: ${it.name}!`, 'major'); }
    else if (roll < 0.75) { const it = generateItem(rng, { tier, slot: rng.pick(['weapon', 'armor', 'head', 'feet', 'offhand', 'charm']), rarity: rng.pick(['rare', 'epic']) }); root.armory.push(it); root.log(`The mimic coughs up ${it.name}.`, 'good'); }
    else { const g = earn(root, Math.round(s.chestPrice * rng.float(0.4, 1.6)), 'rift'); root.log(`The mimic spits out ${g} gold.`, 'info'); }
    return '';
  }
  return 'Not for sale.';
}
/** Sell a party member's pack to a merchant (fence: anything; fey: food and herbs, twice over). */
export function merchantSellPacks(v, r) {
  const root = v.root;
  let got = 0;
  for (const c of v.here) {
    if (c.dead || !c.pack) continue;
    for (const [res, q] of Object.entries(c.pack)) {
      if (!q || res === 'potion' || res === 'meal' && r.merchant !== 'fey_hawker') continue;
      let k = 0;
      if (r.merchant === 'fence') k = 0.5;
      else if (r.merchant === 'fey_hawker' && ['food', 'herbs', 'meal'].includes(res)) k = 1.2;
      else if (r.merchant === 'bone_broker' && res === 'relics') k = 0.9;
      if (!k) continue;
      got += Math.floor((PRICES[res] || 1) * q * k);
      delete c.pack[res];
    }
  }
  if (r.merchant === 'bone_broker') for (const id of Object.keys(root.trophies)) { while (root.trophies[id] > 0) { root.trophies[id]--; got += Math.round(TROPHY_PRICE * 1.3); } }
  if (!got) return 'Nothing they want.';
  earn(root, got, 'rift');
  root.log(`F${v._m.depth}: the ${RIFT_MERCHANTS[r.merchant].name.toLowerCase()} pays ${got} gold.`, 'info');
  return '';
}
export function reforgeCost(item) { const T = FORGE_TIERS[item.forgeTier]; return 90 + (T ? T.rank : 0) * 60; }
/** The deep smith takes a forged piece one tier up. */
export function merchantReforge(v, r, npcId, slot) {
  const root = v.root, c = root.colonists.find(x => x.id === npcId);
  const it = c && c.equipment[slot];
  if (!it || !it.forgeTier) return 'Only forged pieces.';
  const order = ['leather', 'iron', 'steel', 'runed'];
  const next = order[order.indexOf(it.forgeTier) + 1];
  if (!next) return 'Already runed.';
  const cost = reforgeCost(it);
  if (!pay(root, cost, 'rift')) return `Costs ${cost} gold.`;
  const n = makeTierItem(slot, next, it.family);
  c.equipment[slot] = n; refresh(c);
  root.log(`The deep smith reforges ${c.name.short}’s ${it.name} into ${n.name}.`, 'good', c.id);
  return '';
}
/** Rob a merchant: it fights; that kind of merchant is hostile for the rest of the run. */
export function robMerchant(v, r) {
  r.neutral = false; r.awake = true; r.floorSpawn = true; r.robbed = true;
  (v.root.robbed || (v.root.robbed = {}))[r.merchant] = true;
  v.log(`F${v._m.depth}: the ${RIFT_MERCHANTS[r.merchant].name.toLowerCase()} won’t go quietly.`, 'danger');
}

// --- the daily clock ------------------------------------------------------------------------
/** Dawn: wages, upkeep, restocks, visitors, blessings, interest. */
export function economyDawn(game) {
  const root = game.root;
  const L = ledger(root);
  // Net gold over the day, from the treasury itself: sales, loot and veins
  // arrive by many roads that don't all pass through earn(), but they all
  // land in resources.gold.
  const gold = Math.round(root.resources.gold || 0);
  L.days.push({ day: root.day - 1, spent: L.today, net: L.goldAtDawn != null ? gold - L.goldAtDawn : null });
  L.goldAtDawn = gold;
  if (L.days.length > 14) L.days.shift();
  L.today = {};
  payDaily(root);
  tickShops(root);
  tickVisitors(root);
  tickBlessings(root);
  interest(root);
}
/** Every hour: parties coming home. */
export function economyHour(game) { tickJourneys(game.root); }
