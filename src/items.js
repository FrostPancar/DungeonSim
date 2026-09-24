// ============================================================================
// ITEMS: gear, rarity, affixes, legendaries, potions.
//
// Six slots: main hand, off hand, head, body, feet, charm. Only weapons and
// shields are locked to classes; armour is open to anyone, but its weight is a
// trade (armour up, speed and evasion down) and each class's armour training
// decides how much of the benefit it keeps — a knight wears plate better than a
// wizard does, without the wizard being forbidden it.
// ============================================================================
import { clamp } from './rng.js';
import { ABILITIES } from './data.js';
import { CLASS_INFO } from './classes.js';

let ITEM_UID = 1;
export function resetItemIds(n = 1) { ITEM_UID = n; }
export function itemIdCounter() { return ITEM_UID; }

export const SLOTS = ['weapon', 'offhand', 'head', 'armor', 'feet', 'charm'];
export const SLOT_NAMES = { weapon: 'Main hand', offhand: 'Off hand', head: 'Head', armor: 'Body', feet: 'Feet', charm: 'Charm' };
export const SLOT_ICONS = { weapon: '⚔️', offhand: '🛡️', head: '⛑️', armor: '🥋', feet: '🥾', charm: '📿' };

// --- rarity --------------------------------------------------------------------
export const RARITIES = {
  common:    { name: 'Common',    color: '#c8c8c8', mult: 1.00, affixes: 0 },
  uncommon:  { name: 'Uncommon',  color: '#6fcf97', mult: 1.10, affixes: 1 },
  rare:      { name: 'Rare',      color: '#5aa8e0', mult: 1.22, affixes: 2 },
  epic:      { name: 'Epic',      color: '#b07ae0', mult: 1.36, affixes: 2, passive: true },
  legendary: { name: 'Legendary', color: '#e2a03c', mult: 1.55, affixes: 0 },
};
export const RARITY_IDS = Object.keys(RARITIES);
/** Drop weights by guild rank index (E … SSS). */
const RARITY_TABLE = [
  [70, 25, 5, 0, 0], [60, 30, 9, 1, 0], [48, 34, 15, 3, 0], [36, 36, 21, 6, 1],
  [26, 36, 26, 10, 2], [18, 34, 30, 15, 3], [13, 32, 33, 18, 4], [10, 30, 35, 20, 5],
];
function tierRankIdx(t) { return t <= 1 ? 0 : t <= 2 ? 1 : t <= 4 ? 2 : t <= 6 ? 3 : t <= 8 ? 4 : t <= 11 ? 5 : t <= 14 ? 6 : 7; }
export function rollRarity(rng, tier, bonus = 0) {
  const row = RARITY_TABLE[clamp(tierRankIdx(tier), 0, 7)];
  let i = rng.weighted(RARITY_IDS.map((r, k) => [k, row[k]]));
  i = clamp(i + bonus, 0, 4);
  return RARITY_IDS[i];
}

// --- bases -----------------------------------------------------------------------
// Weapon families. stat is the skill that wields it; type sets its damage type.
export const WEAPON_FAMILIES = {
  sword:    { name: 'Sword',     names: ['Shortsword', 'Longsword', 'Broadsword', 'Rapier'], stat: 'melee', type: 'slash', dmg: [2, 8], hands: 1 },
  axe:      { name: 'Axe',       names: ['Hand Axe', 'Battleaxe', 'Bearded Axe'],           stat: 'melee', type: 'slash', dmg: [3, 9], hands: 1 },
  maul:     { name: 'Great Weapon', names: ['Greatsword', 'Greataxe', 'Maul', 'Warhammer'], stat: 'melee', type: 'crush', dmg: [4, 12], hands: 2 },
  hammer:   { name: 'Mace',      names: ['Mace', 'Flail', 'Hammer', 'Morningstar'],         stat: 'melee', type: 'crush', dmg: [3, 8], hands: 1 },
  spear:    { name: 'Spear',     names: ['Spear', 'Glaive', 'Halberd', 'Pike'],              stat: 'melee', type: 'pierce', dmg: [2, 9], hands: 2, reach: true },
  dagger:   { name: 'Dagger',    names: ['Dagger', 'Stiletto', 'Kris', 'Sickle'],            stat: 'stealth', type: 'pierce', dmg: [1, 6], hands: 1 },
  bow:      { name: 'Bow',       names: ['Shortbow', 'Longbow', 'Recurve Bow'],              stat: 'ranged', type: 'pierce', dmg: [2, 9], hands: 2 },
  crossbow: { name: 'Crossbow',  names: ['Hand Crossbow', 'Crossbow', 'Arbalest'],           stat: 'ranged', type: 'pierce', dmg: [3, 9], hands: 2 },
  throwing: { name: 'Throwing',  names: ['Javelins', 'Throwing Axes', 'Knives'],             stat: 'ranged', type: 'pierce', dmg: [1, 7], hands: 1 },
  sling:    { name: 'Sling',     names: ['Sling', 'Staff-sling'],                            stat: 'ranged', type: 'crush', dmg: [1, 6], hands: 1 },
  claws:    { name: 'Fist Weapon', names: ['Knuckles', 'Cestus', 'Tiger Claws'],             stat: 'melee', type: 'crush', dmg: [2, 6], hands: 1, twin: true },
  staff:    { name: 'Staff',     names: ['Quarterstaff', 'Runed Staff', 'Oak Staff'],        stat: 'arcana', type: 'arcane', dmg: [2, 7], hands: 2, spell: 0.15 },
  wand:     { name: 'Wand',      names: ['Wand', 'Rod', 'Sceptre'],                          stat: 'arcana', type: 'arcane', dmg: [1, 7], hands: 1, spell: 0.1 },
  focus:    { name: 'Focus',     names: ['Orb', 'Crystal Focus', 'Grimoire'],                stat: 'arcana', type: 'arcane', dmg: [1, 8], hands: 1, spell: 0.08 },
  relic:    { name: 'Relic',     names: ['Holy Mace', 'Reliquary Rod', 'Censer'],            stat: 'faith', type: 'holy', dmg: [2, 8], hands: 1, spell: 0.08 },
};
export const WEAPON_FAMILY_IDS = Object.keys(WEAPON_FAMILIES);
/** What commoners (no class) may pick up. */
const COMMON_WEAPONS = ['sword', 'axe', 'maul', 'hammer', 'spear', 'dagger', 'bow', 'sling', 'throwing', 'staff'];

export const WEIGHTS = {
  none:   { name: 'Unarmoured', arm: 0,   def: 0,  init: 0 },
  light:  { name: 'Light',  arm: 1,   def: 0,  init: 0 },
  medium: { name: 'Medium', arm: 1.8, def: -1, init: -1 },
  heavy:  { name: 'Heavy',  arm: 2.8, def: -2, init: -2 },
};
export const ARMOR_BASES = {
  // body
  robes:     { slot: 'armor', weight: 'light',  name: 'Robes',        arm: 2 },
  leather:   { slot: 'armor', weight: 'light',  name: 'Leather Armor',arm: 3 },
  hide:      { slot: 'armor', weight: 'medium', name: 'Hide Armor',   arm: 4 },
  chain:     { slot: 'armor', weight: 'medium', name: 'Chainmail',    arm: 5 },
  scale:     { slot: 'armor', weight: 'heavy',  name: 'Scalemail',    arm: 6 },
  plate:     { slot: 'armor', weight: 'heavy',  name: 'Plate',        arm: 8 },
  // head
  hood:      { slot: 'head', weight: 'light',  name: 'Hood',          arm: 0.5, res: { arcane: 0.1 } },
  helm:      { slot: 'head', weight: 'medium', name: 'Helm',          arm: 1 },
  greathelm: { slot: 'head', weight: 'heavy',  name: 'Great Helm',    arm: 2 },
  circlet:   { slot: 'head', weight: 'light',  name: 'Circlet',       arm: 0, spell: 0.05 },
  // feet
  sandals:   { slot: 'feet', weight: 'light',  name: 'Soft Boots',    arm: 0.5, init: 2 },
  boots:     { slot: 'feet', weight: 'medium', name: 'Boots',         arm: 1, init: 1 },
  greaves:   { slot: 'feet', weight: 'heavy',  name: 'Greaves',       arm: 2 },
  // off hand
  buckler:   { slot: 'offhand', kind: 'shield', name: 'Buckler',     arm: 1, def: 1 },
  kite:      { slot: 'offhand', kind: 'shield', name: 'Kite Shield', arm: 2, def: 2 },
  tower:     { slot: 'offhand', kind: 'shield', name: 'Tower Shield',arm: 3, def: 2, init: -1 },
  orb:       { slot: 'offhand', kind: 'focus', focus: 'arcane', name: 'Orb',          spell: 0.12, classes: ['wizard', 'warlock', 'artificer'] },
  tome:      { slot: 'offhand', kind: 'focus', focus: 'arcane', name: 'Tome',         spell: 0.1, acc: 1, classes: ['wizard', 'warlock', 'bard'] },
  symbol:    { slot: 'offhand', kind: 'focus', focus: 'divine', name: 'Holy Symbol',  spell: 0.12, classes: ['cleric', 'paladin', 'druid'] },
  instrument:{ slot: 'offhand', kind: 'focus', focus: 'arcane', name: 'Lute',         spell: 0.1, classes: ['bard'] },
  totem:     { slot: 'offhand', kind: 'focus', focus: 'divine', name: 'Totem',        spell: 0.1, classes: ['druid', 'barbarian'] },
  // charm
  amulet:    { slot: 'charm', name: 'Amulet', hp: 0.05 },
  ring:      { slot: 'charm', name: 'Ring', acc: 1 },
};

// --- affixes -----------------------------------------------------------------------
// Prefixes are numbers; suffixes carry an element — on a weapon it adds that
// damage and its status, on armour it resists it.
export const PREFIXES = {
  keen:     { name: 'Keen',     slots: ['weapon'], mods: { acc: 2 } },
  heavy:    { name: 'Heavy',    slots: ['weapon'], mods: { dmg: 3, acc: -1 } },
  swift:    { name: 'Swift',    slots: ['weapon', 'feet', 'charm'], mods: { init: 3 } },
  vampiric: { name: 'Vampiric', slots: ['weapon', 'charm'], mods: { leech: 0.12 } },
  arcane:   { name: 'Arcane',   slots: ['weapon', 'offhand', 'head', 'charm'], mods: { spell: 0.1 } },
  warded:   { name: 'Warded',   slots: ['armor', 'head', 'offhand', 'feet'], mods: { armor: 2 } },
  sturdy:   { name: 'Sturdy',   slots: ['armor', 'head', 'feet', 'charm'], mods: { hp: 0.08 } },
  nimble:   { name: 'Nimble',   slots: ['armor', 'feet', 'head'], mods: { def: 2 } },
  blessed:  { name: 'Blessed',  slots: ['weapon', 'armor', 'charm', 'offhand'], mods: { acc: 1, armor: 1 } },
  brutal:   { name: 'Brutal',   slots: ['weapon'], mods: { dmg: 2 } },
};
export const SUFFIXES = {
  embers: { name: 'of Embers', element: 'fire' },
  rime:   { name: 'of Rime',   element: 'frost' },
  storms: { name: 'of Storms', element: 'storm' },
  venom:  { name: 'of Venom',  element: 'nature' },
  dawn:   { name: 'of Dawn',   element: 'holy' },
  dusk:   { name: 'of Dusk',   element: 'shadow' },
  veil:   { name: 'of the Veil', element: 'arcane' },
};

/** Epic passives. Each is a flag the combat profile turns into rules. */
export const PASSIVES = {
  thornmail:  { name: 'Thornmail',    slots: ['armor'], desc: 'Reflects part of every melee blow.' },
  bulwark:    { name: 'Bulwark',      slots: ['armor', 'offhand'], desc: '+2 armour for each ally in the front row.' },
  everburning:{ name: 'Everburning',  slots: ['armor'], desc: 'Immune to burn; your fire burns hotter.' },
  frostbound: { name: 'Frostbound',   slots: ['armor'], desc: 'Melee attackers are chilled.' },
  stormcaller:{ name: 'Stormcaller',  slots: ['head'], desc: 'Your storm damage arcs to one more foe.' },
  clarity:    { name: 'Clarity',      slots: ['head'], desc: 'Immune to confusion and charm.' },
  ironwill:   { name: 'Iron Will',    slots: ['head'], desc: 'Immune to fear.' },
  mirror:     { name: 'Mirror Visor', slots: ['head', 'offhand'], desc: 'Immune to petrifying gazes.' },
  striders:   { name: 'Striders',     slots: ['feet'], desc: '+3 initiative; cannot be slowed.' },
  anchors:    { name: 'Anchors',      slots: ['feet'], desc: 'Cannot be rooted; harder to stagger.' },
  featherfall:{ name: 'Featherfall',  slots: ['feet'], desc: 'Cannot be grounded; walks on air.' },
  shadowstep: { name: 'Shadowstep',   slots: ['feet'], desc: 'Starts every fight hidden.' },
  regenerator:{ name: 'Regenerator',  slots: ['charm'], desc: 'Regenerates 3% HP every round.' },
  bandolier:  { name: 'Bandolier',    slots: ['charm'], desc: 'A third potion on the belt.' },
};
export const PASSIVE_IDS = Object.keys(PASSIVES);

// --- gear-granted abilities ------------------------------------------------------------
export const GEAR_ABILITIES = {
  glacial_strike: { name: 'Glacial Strike', kind: 'aoe', shape: 'front', range: 'melee', dmg: 'frost', cd: 4, power: 0.9, stat: 'melee', apply: [['chill', 1, 2]], desc: 'Freezes the enemy front line.' },
  chain_lightning:{ name: 'Chain Lightning',kind: 'attack', shape: 'single', range: 'ranged', dmg: 'storm', cd: 3, power: 1.2, stat: 'arcana', chain: 2, apply: [['shock', 0.5, 2]], desc: 'Arcs through three foes.' },
  last_bastion:   { name: 'Last Bastion',   kind: 'buff', shape: 'party', cd: 7, power: 0.5, stat: 'melee', barrier: 0.2, desc: 'A barrier over the whole party.' },
  dragons_breath: { name: "Dragon's Breath",kind: 'aoe', shape: 'front', range: 'ranged', dmg: 'fire', cd: 5, power: 1.2, stat: 'melee', apply: [['burn', 0.7, 3]], desc: 'Breathe the fire of the scale.' },
  eye_ray:        { name: 'Eye Ray',        kind: 'attack', shape: 'single', range: 'ranged', dmg: 'arcane', cd: 3, power: 1.0, stat: 'arcana', randomApply: [['fear', 0.6, 2], ['slow', 0.6, 2], ['charm', 0.4, 1], ['sleep', 0.4, 2]], desc: 'A borrowed ray and a random curse.' },
  pinning_volley: { name: 'Pinning Volley', kind: 'aoe', shape: 'all', range: 'ranged', dmg: 'pierce', cd: 4, power: 0.7, stat: 'ranged', grounds: true, apply: [['root', 0.4, 1]], desc: 'Nails everything to the ground.' },
  arcane_torrent: { name: 'Arcane Torrent', kind: 'aoe', shape: 'all', range: 'ranged', dmg: 'arcane', cd: 4, power: 1.1, stat: 'arcana', spell: 'arcane', desc: 'Raw magic poured over the enemy.' },
  holy_aura:      { name: 'Holy Aura',      kind: 'buff', shape: 'party', cd: 6, power: 0.4, stat: 'faith', apply: [['brave', 1, 3], ['regen', 1, 3]], desc: 'The avenger\'s light shelters the party.' },
};
Object.assign(ABILITIES, GEAR_ABILITIES);

/** Named legendaries. Fixed stats, a unique passive, often a granted ability. */
export const LEGENDARIES = {
  frostbrand:      { name: 'Frostbrand',            slot: 'weapon', family: 'sword',  element: 'frost', grants: 'glacial_strike', passive: 'frostbrand', desc: 'Your shatters heal you.' },
  holy_avenger:    { name: 'Holy Avenger',          slot: 'weapon', family: 'sword',  element: 'holy',  grants: 'holy_aura', desc: 'A paladin\'s blade of light.' },
  whisperwind:     { name: 'Whisperwind Bow',       slot: 'weapon', family: 'bow',    element: 'storm', grants: 'pinning_volley', passive: 'windwhisper', desc: 'Grounded foes take 30% more damage.' },
  staff_of_magi:   { name: 'Staff of the Magi',     slot: 'weapon', family: 'staff',  element: 'arcane', grants: 'arcane_torrent', mods: { spell: 0.25 }, desc: 'Power, and more power.' },
  vorpal_dagger:   { name: 'Vorpal Dagger',         slot: 'weapon', family: 'dagger', passive: 'vorpal', desc: 'Critical hits behead the weakened.' },
  stormcrown:      { name: "Stormcaller's Crown",   slot: 'head',   base: 'circlet', element: 'storm', grants: 'chain_lightning', passive: 'stormcaller', desc: 'Electrocutions stun longer.' },
  unbroken_shield: { name: 'Shield of the Unbroken',slot: 'offhand',base: 'tower',   grants: 'last_bastion', passive: 'unbroken', desc: 'Shield Bash always interrupts.' },
  mirror_perseus:  { name: 'Mirror of Perseus',     slot: 'offhand',base: 'kite',    passive: 'mirror', desc: 'Gazes are turned back on their owner.' },
  dragonscale:     { name: 'Dragonscale Mail',      slot: 'armor',  base: 'scale',   element: 'fire', grants: 'dragons_breath', desc: 'Immune to the fire of its dragon.' },
  emberheart:      { name: 'Emberheart',            slot: 'charm',  base: 'amulet',  passive: 'emberheart', desc: 'Your burns also weaken.' },
  troll_heart:     { name: 'Troll Heart',           slot: 'charm',  base: 'amulet',  passive: 'regenerator', mods: { hp: 0.1 }, desc: 'It still beats.' },
  phylactery_shard:{ name: 'Phylactery Shard',      slot: 'charm',  base: 'amulet',  passive: 'undying', res: { shadow: 0.5 }, desc: 'Once a fight, you do not die.' },
  beholder_eye:    { name: "Beholder's Eye",        slot: 'charm',  base: 'ring',    grants: 'eye_ray', passive: 'clarity', desc: 'It still looks around.' },
  boots_of_hunt:   { name: 'Boots of the Hunt',     slot: 'feet',   base: 'boots',   passive: 'striders', mods: { dmg: 3 }, desc: 'You run your prey down.' },
};
export const LEGENDARY_IDS = Object.keys(LEGENDARIES);
/** Trophy → legendary recipes, crafted at the smithy. */
export const LEGENDARY_RECIPES = {
  dragonscale:      { trophy: 'dragon_scale',   cost: { iron: 30, gold: 40 } },
  mirror_perseus:   { trophy: 'medusa_head',    cost: { iron: 20, gems: 4 } },
  troll_heart:      { trophy: 'troll_heart',    cost: { gems: 5, herbs: 10 } },
  phylactery_shard: { trophy: 'phylactery',     cost: { dust: 20, gold: 30 } },
  beholder_eye:     { trophy: 'beholder_eye',   cost: { gems: 10 } },
  unbroken_shield:  { trophy: 'golem_core',     cost: { iron: 40 } },
  vorpal_dagger:    { trophy: 'wyvern_stinger', cost: { iron: 15, gems: 3 } },
  boots_of_hunt:    { trophy: 'displacer_hide', cost: { leather: 12 } },
  whisperwind:      { trophy: 'griffon_feather',cost: { wood: 30, gems: 2 } },
  emberheart:       { trophy: 'hellhound_fang', cost: { gold: 25, dust: 6 } },
};

// --- generation --------------------------------------------------------------------------
const pickW = (rng, list) => rng.pick(list);

/**
 * Make an item. o: { slot, tier, family (weapon), base (armor base id),
 * rarity, rarityBonus, prefStat, roleHint, legendary }
 */
export function generateItem(rng, o = {}) {
  const tier = clamp(o.tier ?? 1, 0, 20);
  const rarity = o.legendary ? 'legendary' : o.rarity || rollRarity(rng, tier, o.rarityBonus || 0);
  if (rarity === 'legendary' && !o.legendary) {
    const pool = LEGENDARY_IDS.filter(id => !o.slot || LEGENDARIES[id].slot === o.slot);
    if (pool.length) return makeLegendary(rng, rng.pick(pool), tier);
  }
  if (o.legendary) return makeLegendary(rng, o.legendary, tier);
  const slot = o.slot || 'weapon';
  const R = RARITIES[rarity];
  let item;
  if (slot === 'weapon') {
    let fams = WEAPON_FAMILY_IDS;
    if (o.family) fams = [o.family];
    else if (o.prefStat) { const f = fams.filter(k => WEAPON_FAMILIES[k].stat === o.prefStat); if (f.length) fams = f; }
    const famId = pickW(rng, fams);
    const F = WEAPON_FAMILIES[famId];
    const dmgMin = Math.max(1, Math.round(F.dmg[0] * R.mult + tier * 0.7));
    const dmgMax = Math.max(dmgMin + 1, Math.round(F.dmg[1] * R.mult + tier * 1.5));
    item = {
      kind: 'weapon', slot, family: famId, type: famId, stat: F.stat, hands: F.hands,
      base: rng.pick(F.names), dmg: [dmgMin, dmgMax], mods: {}, element: null,
    };
    if (F.spell) item.mods.spell = F.spell;
  } else {
    let bases = Object.keys(ARMOR_BASES).filter(b => ARMOR_BASES[b].slot === slot);
    if (o.base) bases = [o.base];
    else if (slot === 'armor' && o.roleHint) {
      const want = o.roleHint === 'front' ? ['chain', 'scale', 'plate', 'hide'] : o.roleHint === 'back' ? ['robes', 'leather', 'hide'] : ['leather', 'hide', 'chain'];
      bases = bases.filter(b => want.includes(b));
    }
    const bid = rng.pick(bases);
    const B = ARMOR_BASES[bid];
    const arm = B.arm ? Math.round((B.arm + tier * (slot === 'armor' ? 0.6 : 0.25)) * R.mult) : 0;
    item = {
      kind: B.kind || (slot === 'armor' ? 'armor' : slot), slot, family: bid, type: bid, base: B.name,
      weight: B.weight || null, armor: arm, mods: {}, element: null, classes: B.classes || null,
    };
    for (const k of ['def', 'init', 'spell', 'acc', 'hp']) if (B[k]) item.mods[k] = B[k];
    if (B.res) item.mods.res = { ...B.res };
    if (B.focus) item.focus = B.focus;
  }
  item.rarity = rarity;
  item.tier = tier;
  item.affixes = [];
  // Affixes: prefixes are numbers, a suffix is an element.
  const n = R.affixes;
  const prefs = Object.keys(PREFIXES).filter(p => PREFIXES[p].slots.includes(slot));
  let suffix = null;
  for (let k = 0; k < n; k++) {
    if (k === n - 1 && rng.chance(0.55)) { suffix = rng.pick(Object.keys(SUFFIXES)); break; }
    const p = rng.pick(prefs);
    if (!p || item.affixes.includes(p)) continue;
    item.affixes.push(p);
    for (const [mk, mv] of Object.entries(PREFIXES[p].mods)) item.mods[mk] = (item.mods[mk] || 0) + mv * (1 + tier * 0.04);
  }
  if (suffix) {
    item.suffix = suffix;
    const el = SUFFIXES[suffix].element;
    if (slot === 'weapon') item.element = el;
    else item.mods.res = { ...(item.mods.res || {}), [el]: rarity === 'epic' ? 0.4 : 0.25 };
  }
  if (R.passive) {
    const pool = PASSIVE_IDS.filter(p => PASSIVES[p].slots.includes(slot));
    if (pool.length) item.passive = rng.pick(pool);
  }
  roundMods(item);
  item.name = `${item.affixes.length ? PREFIXES[item.affixes[0]].name + ' ' : ''}${item.base}${suffix ? ' ' + SUFFIXES[suffix].name : ''}`;
  item.affix = item.affixes[0] || suffix || null;
  item.quality = rarity;       // legacy field some readouts still show
  item.value = Math.round((8 + tier * 6) * R.mult * (1 + item.affixes.length * 0.4 + (item.passive ? 0.8 : 0)));
  item.uid = ITEM_UID++;
  return item;
}

function roundMods(item) {
  for (const k of Object.keys(item.mods)) {
    if (k === 'res') continue;
    const v = item.mods[k];
    item.mods[k] = Math.abs(v) < 1 ? Math.round(v * 100) / 100 : Math.round(v);
  }
}

function makeLegendary(rng, id, tier) {
  const L = LEGENDARIES[id];
  let item;
  if (L.slot === 'weapon') item = generateItem(rng, { slot: 'weapon', tier, family: L.family, rarity: 'rare' });
  else item = generateItem(rng, { slot: L.slot, tier, base: L.base, rarity: 'rare' });
  const R = RARITIES.legendary;
  if (item.dmg) item.dmg = [Math.round(item.dmg[0] * 1.25), Math.round(item.dmg[1] * 1.25)];
  if (item.armor) item.armor = Math.round(item.armor * 1.25);
  item.mods = { ...item.mods, ...(L.mods || {}) };
  if (L.res) item.mods.res = { ...(item.mods.res || {}), ...L.res };
  item.affixes = []; item.suffix = null;
  if (L.element) {
    if (L.slot === 'weapon') item.element = L.element;
    else item.mods.res = { ...(item.mods.res || {}), [L.element]: L.slot === 'armor' ? 1 : 0.5 };
  }
  item.rarity = 'legendary'; item.quality = 'legendary';
  item.legendary = id; item.name = L.name; item.affix = null;
  item.passive = L.passive || null; item.grants = L.grants || null; item.desc = L.desc;
  item.value = Math.round((40 + tier * 20) * R.mult);
  return item;
}

/** Compatibility wrappers used by the NPC generator and loot tables. */
export function generateWeaponItem(rng, tier = 1, prefStat = null, rarityBonus = 0) {
  return generateItem(rng, { slot: 'weapon', tier, prefStat, rarityBonus });
}
export function generateArmorItem(rng, tier = 1, roleHint = 'front', rarityBonus = 0) {
  return generateItem(rng, { slot: 'armor', tier, roleHint, rarityBonus });
}
/** Any random piece of gear (loot). */
export function generateLoot(rng, tier, rarityBonus = 0) {
  const slot = rng.weighted([['weapon', 4], ['armor', 3], ['head', 2], ['feet', 2], ['offhand', 2], ['charm', 1]]);
  return generateItem(rng, { slot, tier, rarityBonus });
}

// --- who may wear what -------------------------------------------------------------------
/** '' if this character may equip the item, else why not. */
export function canEquip(npc, item) {
  const info = CLASS_INFO[npc.klass];
  const slot = item.slot || (item.kind === 'weapon' ? 'weapon' : 'armor');
  if (slot === 'weapon') {
    const allowed = info ? info.weapons : COMMON_WEAPONS;
    if (!allowed.includes(item.family || item.type)) return `${cap(npc.klass)}s cannot wield a ${WEAPON_FAMILIES[item.family || item.type] ? WEAPON_FAMILIES[item.family || item.type].name.toLowerCase() : 'weapon like that'}.`;
    const off = npc.equipment && npc.equipment.offhand;
    if (item.hands === 2 && off) return 'Two-handed: clear the off hand first.';
  }
  if (slot === 'offhand') {
    if (item.kind === 'shield' && !(info && info.shield)) return `${cap(npc.klass)}s are not trained with shields.`;
    if (item.kind === 'focus' && item.classes && !item.classes.includes(npc.klass)) return `Only ${item.classes.join(', ')} can use a ${item.base.toLowerCase()}.`;
    const main = npc.equipment && npc.equipment.weapon;
    if (main && main.hands === 2) return 'The main-hand weapon needs both hands.';
  }
  return '';
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Everything the gear adds up to, for the combat profile. Armour weight is
 * scaled by the class's armour training: a trained wearer keeps more of the
 * protection and pays less of the speed.
 */
export function gearProfile(npc) {
  const eq = npc.equipment || {};
  const info = CLASS_INFO[npc.klass];
  const training = info ? info.armorTraining : 0.7;
  const out = { armor: 0, def: 0, init: 0, acc: 0, dmg: 0, spell: 0, hp: 0, leech: 0, res: {}, passives: [], grants: [], shield: false, weight: 'none' };
  for (const slot of SLOTS) {
    const it = eq[slot];
    if (!it) continue;
    const m = it.mods || {};
    let arm = it.armor || 0;
    if (it.weight && it.weight !== 'none' && (slot === 'armor' || slot === 'head' || slot === 'feet')) {
      const W = WEIGHTS[it.weight];
      // Heavy armour pays off for the trained: up to +20% over its rating for
      // a knight, down to 60% of it for a wizard; penalties shrink with training.
      const heavyness = it.weight === 'heavy' ? 1 : it.weight === 'medium' ? 0.5 : 0;
      arm *= 0.6 + training * (0.4 + 0.2 * heavyness);
      if (slot === 'armor') {
        out.def += Math.round(W.def * (1.6 - training));
        out.init += Math.round(W.init * (1.6 - training));
        out.weight = it.weight;
      }
    }
    out.armor += arm;
    out.def += m.def || 0;
    out.init += m.init || 0;
    out.acc += m.acc || 0;
    out.dmg += m.dmg || 0;
    out.spell += m.spell || 0;
    out.hp += m.hp || 0;
    out.leech += m.leech || 0;
    out.armor += m.armor || 0;
    for (const [k, v] of Object.entries(m.res || {})) out.res[k] = (out.res[k] || 0) + v;
    if (it.passive) out.passives.push(it.passive);
    if (it.grants && ABILITIES[it.grants]) out.grants.push(it.grants);
    if (slot === 'offhand' && it.kind === 'shield') out.shield = true;
  }
  // Monks fight best unarmoured: wisdom becomes defence.
  if (npc.klass === 'monk' && !eq.armor) out.def += Math.max(0, Math.floor(((npc.attributes.wis || 10) - 10) / 2)) + 2;
  out.armor = Math.round(out.armor);
  out.grants = out.grants.slice(0, 2);
  return out;
}

/** A rough "is this better for them" score, for autoplay and the equip hints. */
export function itemScore(npc, item) {
  if (!item) return 0;
  const info = CLASS_INFO[npc.klass];
  const training = info ? info.armorTraining : 0.7;
  const R = RARITIES[item.rarity] || RARITIES.common;
  let s = 0;
  if (item.slot === 'weapon' || item.kind === 'weapon') {
    const skill = (npc.skills && npc.skills[item.stat]) || 0;
    s += (item.dmg[0] + item.dmg[1]) / 2 * (1 + skill * 0.06);
    if (item.hands === 2) s *= 1.1;
  } else {
    let arm = item.armor || 0;
    if (item.weight === 'heavy') arm *= 0.6 + training * 0.6;
    else if (item.weight === 'medium') arm *= 0.6 + training * 0.5;
    s += arm * 2;
    if (item.slot === 'armor' && item.weight === 'heavy') s -= (1.6 - training) * 3;
  }
  const m = item.mods || {};
  s += (m.acc || 0) * 1.5 + (m.dmg || 0) * 1.5 + (m.def || 0) * 1.5 + (m.init || 0) * 0.5 + (m.spell || 0) * 30 + (m.hp || 0) * 40 + (m.leech || 0) * 20 + (m.armor || 0) * 2;
  s += Object.values(m.res || {}).reduce((a, v) => a + v * 8, 0);
  if (item.element) s += 3;
  if (item.passive) s += 6;
  if (item.grants) s += 10;
  return s * R.mult;
}

// --- forging ------------------------------------------------------------------------------
/** Gear kits become a piece of gear; a better smith rolls better rarity. */
export function forgeItem(rng, slot, tier, smithSkill = 0) {
  const bonus = smithSkill >= 15 ? 1 : 0;
  const item = generateItem(rng, { slot, tier, rarityBonus: bonus });
  item.forged = true;
  return item;
}

// --- the forge's tiers ----------------------------------------------------------------------
// Crafted gear is the same every time: a tier fixes the base and the numbers,
// with no rolls. Rarity, affixes and legendaries are what shops and the Rift
// are for. See docs/economy-plan.md §4.
export const FORGE_TIERS = {
  leather: { name: 'Leather', rank: 0, power: 1,  mult: 1.0,  armor: { armor: 'leather', head: 'hood', feet: 'sandals', offhand: 'buckler' } },
  iron:    { name: 'Iron',    rank: 1, power: 3,  mult: 1.12, armor: { armor: 'chain', head: 'helm', feet: 'boots', offhand: 'kite' } },
  steel:   { name: 'Steel',   rank: 2, power: 6,  mult: 1.25, armor: { armor: 'scale', head: 'helm', feet: 'greaves', offhand: 'kite' } },
  runed:   { name: 'Runed',   rank: 3, power: 10, mult: 1.42, armor: { armor: 'plate', head: 'greathelm', feet: 'greaves', offhand: 'tower' } },
};
export const FORGE_TIER_IDS = Object.keys(FORGE_TIERS);
export const FORGE_SLOTS = ['weapon', 'armor', 'head', 'feet', 'offhand'];

/** A forged piece: `slot` at tier `tierId`; weapons take a family (sword, bow…). */
export function makeTierItem(slot, tierId, family = 'sword') {
  const T = FORGE_TIERS[tierId];
  let item;
  if (slot === 'weapon') {
    const F = WEAPON_FAMILIES[family] || WEAPON_FAMILIES.sword;
    const lo = Math.max(1, Math.round(F.dmg[0] * T.mult + T.power * 0.6));
    const hi = Math.max(lo + 1, Math.round(F.dmg[1] * T.mult + T.power * 1.3));
    item = { kind: 'weapon', slot, family, type: family, stat: F.stat, hands: F.hands, base: `${T.name} ${F.names[0]}`, dmg: [lo, hi], mods: {}, element: null };
    if (F.spell) item.mods.spell = F.spell;
  } else {
    const bid = T.armor[slot];
    const B = ARMOR_BASES[bid];
    const arm = B.arm ? Math.round((B.arm + T.power * (slot === 'armor' ? 0.6 : 0.25)) * T.mult) : 0;
    item = { kind: B.kind || (slot === 'armor' ? 'armor' : slot), slot, family: bid, type: bid, base: `${T.name} ${B.name.replace(/^(Leather|Soft) /, '')}`,
      weight: B.weight || null, armor: arm, mods: {}, element: null, classes: B.classes || null };
    for (const k of ['def', 'init', 'spell', 'acc', 'hp']) if (B[k]) item.mods[k] = B[k];
  }
  if (T.rank >= 3) item.mods.acc = (item.mods.acc || 0) + 1;   // runes: a truer edge
  item.rarity = 'common'; item.quality = 'common'; item.tier = T.power; item.affixes = []; item.affix = null;
  item.forged = true; item.forgeTier = tierId;
  item.name = item.base;
  item.value = Math.round((8 + T.power * 6) * T.mult);
  item.uid = ITEM_UID++;
  return item;
}

// --- potions ------------------------------------------------------------------------------
// Minor healing is the old generic `potion` resource; the rest live in their own
// stash. use: when the AI drinks (or throws) it. cost: what brewing takes.
export const POTIONS = {
  minor_healing:  { name: 'Minor Healing',   icon: '🧪', heal: 0.25, use: 'hurt',    cost: { herbs: 6, dust: 1 }, desc: 'Restores a quarter of health.' },
  greater_healing:{ name: 'Greater Healing', icon: '❤️‍🩹', heal: 0.45, use: 'hurt',    cost: { herbs: 10, dust: 2 }, desc: 'Restores nearly half of health.' },
  superior_healing:{ name: 'Superior Healing', icon: '💖', heal: 0.7, use: 'hurt',    cost: { herbs: 14, dust: 3, gems: 1 }, desc: 'Restores most of health.' },
  antidote:       { name: 'Antidote',        icon: '🟢', cure: ['poison'], grant: [['ward', 3, 'nature']], use: 'poisoned', cost: { herbs: 6 }, desc: 'Cures poison and wards against it.' },
  burn_salve:     { name: 'Burn Salve',      icon: '🧴', cure: ['burn', 'bleed'], use: 'burning', cost: { herbs: 5, cloth: 1 }, desc: 'Cures burns and bleeding.' },
  stone_salve:    { name: 'Stone Salve',     icon: '🗿', cure: ['petrify', 'slow'], use: 'petrifying', cost: { herbs: 6, gems: 1 }, desc: 'Reverses petrification.' },
  clarity:        { name: 'Elixir of Clarity', icon: '💠', cure: ['charm', 'fear', 'confuse', 'sleep'], use: 'mind', cost: { herbs: 6, dust: 2 }, desc: 'Clears charm, fear and confusion.' },
  ward_fire:      { name: 'Fire Ward',       icon: '🔥', grant: [['ward', 5, 'fire']], use: 'ward:fire', cost: { herbs: 4, ember: 1 }, desc: '+50% fire resistance for the fight.' },
  ward_frost:     { name: 'Frost Ward',      icon: '❄️', grant: [['ward', 5, 'frost']], use: 'ward:frost', cost: { herbs: 4, rime: 1 }, desc: '+50% frost resistance for the fight.' },
  ward_storm:     { name: 'Storm Ward',      icon: '⚡', grant: [['ward', 5, 'storm']], use: 'ward:storm', cost: { herbs: 4, storm: 1 }, desc: '+50% storm resistance for the fight.' },
  ward_shadow:    { name: 'Shadow Ward',     icon: '🌑', grant: [['ward', 5, 'shadow']], use: 'ward:shadow', cost: { herbs: 4, umbral: 1 }, desc: '+50% shadow resistance for the fight.' },
  holy_water:     { name: 'Holy Water',      icon: '💧', throw: { type: 'holy', power: 0.25 }, use: 'unholy', cost: { herbs: 3, radiant: 1 }, desc: 'Thrown: sears the dead and stops their regeneration.' },
  alchemists_fire:{ name: "Alchemist's Fire",icon: '🔥', throw: { type: 'fire', power: 0.2, status: 'burn' }, use: 'regenerator', cost: { herbs: 3, ember: 1 }, desc: 'Thrown: sets a foe alight — the answer to trolls.' },
  oil_flask:      { name: 'Flask of Oil',    icon: '🛢️', throw: { status: 'oiled' }, use: 'oil', cost: { food: 4 }, desc: 'Thrown: the next fire ignites.' },
  haste:          { name: 'Potion of Haste', icon: '⏩', grant: [['haste', 3]], use: 'boss', cost: { herbs: 6, dust: 3 }, desc: 'An extra action every other round.' },
  giants_strength:{ name: "Giant's Strength",icon: '💪', grant: [['empower', 3]], use: 'boss', cost: { herbs: 6, iron: 2 }, desc: '+25% damage for three rounds.' },
  invisibility:   { name: 'Invisibility',    icon: '👻', grant: [['stealth', 2]], use: 'dying', cost: { herbs: 6, dust: 4 }, desc: 'Unseen until the next strike.' },
};
export const POTION_IDS = Object.keys(POTIONS);
/** Stash ingredients that are essences rather than resources. */
export const ESSENCE_INGREDIENTS = new Set(['ember', 'rime', 'storm', 'venom', 'radiant', 'umbral', 'arcane']);
