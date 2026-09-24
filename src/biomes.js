// ============================================================================
// RIFT BIOMES
// At every dawn the Rift chooses what it is today. A biome decides the shape of
// the interior (its layout style), a rule that bends every fight inside it,
// which encounter templates live there, what can be harvested, what can be
// looted, and what crawls out of it at night. Biomes above the colony's rank can
// surge in; biomes below it keep appearing, with their monsters come back harder.
// ============================================================================
import { clamp } from './rng.js';
import { rankIdx } from './monsters.js';

export const BIOMES_RIFT = {
  goblin_warrens: {
    name: 'Goblin Warrens', ranks: ['E', 'C'], layout: 'warren', color: '#8fa05a', icon: '👺',
    desc: 'Tunnels chewed, not cut. Everything is small, and everything is behind you.',
    rule: 'Cramped: large creatures fight clumsily (−2 defence).', env: { cramped: true },
    templates: ['goblin_ambush', 'kobold_trapline', 'rat_nest', 'hobgoblin_phalanx', 'wolf_pack'],
    npcFactions: ['warband'], npcShare: 0.2,
    rooms: { fight: 5, trap: 2, treasure: 1, node: 2, prison: 2, rest: 1, empty: 1 },
    nodes: [['scrap', 'iron', 'mining'], ['mushrooms', 'food', 'farming']],
    structures: ['chest', 'cage', 'cage', 'rack'], loot: { gold: 1.6, iron: 1.4, leather: 1.4, food: 1.2 },
    waves: ['goblin_ambush', 'wolf_pack', 'rat_nest'],
  },
  beast_hollows: {
    name: 'Beast Hollows', ranks: ['E', 'B'], layout: 'hub', color: '#6f9a4a', icon: '🐺',
    desc: 'Overgrown clearings around one great trunk. Something is always watching.',
    rule: 'Overgrown: nature damage +25%; fire spreads to neighbours — on both sides.', env: { elemMult: { nature: 0.25 }, fireSpread: true },
    templates: ['wolf_pack', 'beast_hunt', 'harpy_roost', 'troll_bridge', 'giant_warband'],
    rooms: { fight: 5, node: 3, nest: 2, rest: 1, shrine: 1, empty: 1 },
    nodes: [['timber', 'wood', 'woodcutting'], ['game trail', 'leather', 'survival'], ['herb bed', 'herbs', 'farming']],
    structures: ['nest', 'nest', 'chest'], loot: { leather: 2, food: 1.6, wood: 1.4, herbs: 1.2 },
    waves: ['wolf_pack', 'beast_hunt'],
  },
  bandit_stronghold: {
    name: 'Bandit Stronghold', ranks: ['E', 'A'], layout: 'fortress', color: '#b09060', icon: '🏰',
    desc: 'Someone built walls in here. They are still manning them.',
    rule: 'Fortified: defenders get +3 defence until their armour is sundered.', env: { fortified: true },
    templates: ['mimic_hoard', 'golem_vault'], npcFactions: ['outlaws', 'warband'], npcShare: 0.8,
    rooms: { fight: 6, vault: 2, treasure: 2, prison: 1, trap: 1 },
    nodes: [['stolen goods', 'gold', 'social']],
    structures: ['rack', 'rack', 'chest', 'chest', 'cage'], loot: { gold: 2.2, iron: 1.4, gems: 1.2 },
    waves: [], npcWave: 'outlaws',
  },
  fungal_depths: {
    name: 'Fungal Depths', ranks: ['D', 'B'], layout: 'chain', color: '#7ab08a', icon: '🍄',
    desc: 'A cave chain lit by glowing caps. The air is thick enough to chew.',
    rule: 'Spores: nature +25%; fire can set off a spore burst that hits both front lines.', env: { elemMult: { nature: 0.25 }, spores: true },
    templates: ['myconid_circle', 'ooze_pit', 'spider_nest', 'fungal_crawlers'],
    rooms: { fight: 5, node: 3, trap: 1, treasure: 1, rest: 1, empty: 1 },
    nodes: [['mushroom forest', 'food', 'farming'], ['glowcaps', 'dust', 'farming'], ['herb bed', 'herbs', 'farming']],
    structures: ['remains', 'remains', 'chest'], loot: { herbs: 2, food: 1.6, dust: 1.2 },
    waves: ['myconid_circle', 'ooze_pit'],
  },
  sunken_crypt: {
    name: 'Sunken Crypt', ranks: ['D', 'A'], layout: 'spine', color: '#8f7ab0', icon: '⚰️',
    desc: 'A long processional with the dead laid out on either side.',
    rule: 'Hallowed dark: holy +25%, healing −20%, and darkness without darkvision.', env: { elemMult: { holy: 0.25 }, healMult: 0.8, dark: true },
    templates: ['shambling_dead', 'necromancer_court', 'haunting', 'vampire_court', 'lich_sanctum'],
    rooms: { fight: 5, vault: 3, shrine: 2, trap: 1, rest: 1 },
    nodes: [['ossuary', 'relics', 'faith'], ['grave dust', 'dust', 'arcana']],
    structures: ['sarcophagus', 'sarcophagus', 'sarcophagus', 'altar'], loot: { relics: 2, dust: 1.4, gold: 1.4 },
    waves: ['shambling_dead', 'necromancer_court', 'haunting'],
  },
  collapsed_mine: {
    name: 'Collapsed Mine', ranks: ['D', 'A'], layout: 'shafts', color: '#a08a6a', icon: '⛏️',
    desc: 'Old shafts going down in levels, re-occupied by things that dig.',
    rule: 'Unstable: a crushing critical can bring the ceiling down on both front lines.', env: { unstable: true, dark: true },
    templates: ['underdark_miners', 'kobold_trapline', 'ooze_pit', 'elemental_rift', 'troll_bridge'],
    rooms: { fight: 5, node: 4, trap: 2, treasure: 1 },
    nodes: [['ore seam', 'iron', 'mining'], ['gold vein', 'gold', 'mining'], ['gem geode', 'gems', 'mining'], ['ore seam', 'stone', 'mining']],
    structures: ['cart', 'chest'], loot: { iron: 2.2, stone: 2, gems: 1.4 },
    waves: ['underdark_miners', 'kobold_trapline'],
  },
  web_hive: {
    name: 'Web Hive', ranks: ['D', 'A'], layout: 'hub', color: '#b06ad0', icon: '🕸️',
    desc: 'Everything leads to the brood chamber. Everything is sticky.',
    rule: 'Webs: the party starts every fight rooted — unless it carries fire.', env: { webs: true },
    templates: ['spider_nest', 'drow_patrol', 'insect_swarm'],
    rooms: { fight: 5, prison: 2, node: 2, trap: 2, treasure: 1 },
    nodes: [['silk nest', 'cloth', 'survival'], ['chitin pile', 'leather', 'survival']],
    structures: ['cocoon', 'cocoon', 'nest'], loot: { cloth: 2, leather: 1.4, dust: 1.2 },
    waves: ['spider_nest', 'insect_swarm'],
  },
  drowned_grotto: {
    name: 'Drowned Grotto', ranks: ['C', 'A'], layout: 'islands', color: '#4a8ab0', icon: '🌊',
    desc: 'Islands of rock joined by black water.',
    rule: 'Flooded: everyone is wet, storm +50%, non-swimmers −2 accuracy; swims cost blood.', env: { wet: true, elemMult: { storm: 0.5 }, flooded: true },
    templates: ['kuo_toa_congregation', 'hydra_pool', 'hag_coven', 'drowned_patrol'],
    rooms: { fight: 5, node: 2, treasure: 2, shrine: 1, rest: 1 },
    nodes: [['pearl bed', 'gems', 'survival'], ['kelp', 'food', 'farming']],
    structures: ['wreck', 'wreck', 'altar'], loot: { gems: 1.8, food: 1.2, gold: 1.2 },
    waves: ['kuo_toa_congregation', 'drowned_patrol'],
  },
  ember_forge: {
    name: 'Ember Forge', ranks: ['C', 'S'], layout: 'hub', color: '#e07a4a', icon: '🔥',
    desc: 'A great forge at the centre, still burning, still worked.',
    rule: 'Scorching: fire +25%, frost −25%; without fire resistance you lose 3% health a round.', env: { elemMult: { fire: 0.25, frost: -0.25 }, hpDrain: { type: 'fire', pct: 0.03 } },
    templates: ['mephit_storm', 'forge_guard', 'elemental_rift', 'dragon_lair'], affix: 'fiery',
    rooms: { fight: 5, node: 3, vault: 1, trap: 1, treasure: 1 },
    nodes: [['obsidian vein', 'iron', 'mining'], ['magma vent', 'ember', 'arcana'], ['ore seam', 'gold', 'mining']],
    structures: ['anvil', 'anvil', 'chest'], loot: { iron: 2, gold: 1.6, gems: 1.2 },
    waves: ['mephit_storm', 'forge_guard'],
  },
  rime_caverns: {
    name: 'Rime Caverns', ranks: ['C', 'S'], layout: 'warren', color: '#8fd0f0', icon: '❄️',
    desc: 'An ice labyrinth over black water. The cold gets in.',
    rule: 'Frigid: frost +25%; everyone begins each fight chilled.', env: { elemMult: { frost: 0.25 }, startStatus: [['chill', 1]] },
    templates: ['frost_hunt', 'frozen_horde', 'elemental_rift'], affix: 'frosty',
    rooms: { fight: 5, node: 2, vault: 2, rest: 1, trap: 1 },
    nodes: [['frozen ore', 'iron', 'mining'], ['ice crystal', 'rime', 'arcana']],
    structures: ['frozen', 'frozen', 'chest'], loot: { iron: 1.4, gems: 1.4, gold: 1.2 },
    waves: ['frost_hunt', 'frozen_horde'],
  },
  feywild_hollow: {
    name: 'Feywild Hollow', ranks: ['C', 'S'], layout: 'circle', rare: true, color: '#9fd6b0', icon: '🧚',
    desc: 'Paths that loop back on themselves under a sky that is not there.',
    rule: 'Enchanted: charm, sleep, fear and confusion last a round longer; healing +20%.', env: { mindBonus: 1, healMult: 1.2 },
    templates: ['fey_revel', 'hag_coven', 'beast_hunt'],
    rooms: { fight: 5, node: 2, shrine: 2, treasure: 1, rest: 1 },
    nodes: [['moonflowers', 'herbs', 'farming'], ['fairy ring', 'radiant', 'faith']],
    structures: ['altar', 'altar', 'chest'], loot: { herbs: 2, dust: 1.8, cloth: 1.2 },
    waves: ['fey_revel'],
  },
  arcane_sanctum: {
    name: 'Arcane Sanctum', ranks: ['B', 'SS'], layout: 'gated', color: '#7a9ad0', icon: '🔮',
    desc: 'Geometry that argues. Doors that ask questions.',
    rule: 'Ley-charged: arcane +25%, spell cooldowns −1; wild magic may strike anyone.', env: { elemMult: { arcane: 0.25 }, spellHaste: true, wildMagic: 0.1 },
    templates: ['golem_vault', 'mimic_hoard', 'gaze_garden', 'elemental_rift', 'the_ritual'],
    npcFactions: ['cult'], npcShare: 0.25,
    rooms: { fight: 5, puzzle: 3, vault: 2, node: 2 },
    nodes: [['ley crystal', 'dust', 'arcana'], ['old library', 'knowledge', 'research']],
    structures: ['bookcase', 'bookcase', 'bookcase', 'chest'], loot: { dust: 2.2, knowledge: 2, relics: 1.2 },
    waves: ['golem_vault', 'elemental_rift'],
  },
  infernal_breach: {
    name: 'Infernal Breach', ranks: ['A', 'SSS'], layout: 'gauntlet', color: '#d1607a', icon: '😈',
    desc: 'A straight road into hell. The ritual at the end is not finished yet.',
    rule: 'Hellfire: fire resistance is capped at half; fear lasts longer. The ritual grows with every room.', env: { fireFloor: 0.5, fearBonus: 1 },
    templates: ['the_ritual', 'devil_patrol', 'infernal_warlord'], ritual: true,
    npcFactions: ['cult'], npcShare: 0.2,
    rooms: { fight: 6, shrine: 2, vault: 1, trap: 1 },
    nodes: [['brimstone', 'ember', 'arcana'], ['soul gems', 'gems', 'arcana']],
    structures: ['altar', 'altar', 'chest'], loot: { relics: 2, gold: 2, gems: 1.2 },
    waves: ['the_ritual', 'devil_patrol'],
  },
  aberrant_deep: {
    name: 'Aberrant Deep', ranks: ['S', 'SSS'], layout: 'rings', color: '#b06ad0', icon: '👁️',
    desc: 'Rings within rings. The rooms are not where you left them.',
    rule: 'Maddening: each round someone may lose their mind for a moment (Wisdom resists).', env: { madness: 0.05 },
    templates: ['mind_flayer_colony', 'beholder_lair', 'aberrant_horde'],
    rooms: { fight: 6, node: 2, vault: 2, puzzle: 1 },
    nodes: [['psionic crystal', 'dust', 'arcana'], ['psionic crystal', 'gems', 'mining']],
    structures: ['cyst', 'cyst', 'bookcase'], loot: { knowledge: 2, dust: 2, gems: 1.4 },
    waves: ['aberrant_horde', 'mind_flayer_colony'],
  },
  dragons_lair: {
    name: "Dragon's Lair", ranks: ['C', 'SSS'], layout: 'gauntlet', rare: true, color: '#dba14a', icon: '🐉',
    desc: 'A road of bones to a hill of gold, and what sleeps on it.',
    rule: 'The dragon\'s lair fights for it: every round in the hoard room, the lair strikes.', env: { lairAction: true },
    templates: ['dragon_lair', 'kobold_trapline'], lairTemplate: 'dragon_lair',
    rooms: { fight: 5, trap: 2, treasure: 2 },
    nodes: [['gold drift', 'gold', 'mining']],
    structures: ['hoard', 'chest'], loot: { gold: 3, gems: 2 },
    waves: ['kobold_trapline', 'dragon_lair'],
  },
};
export const RIFT_BIOME_IDS = Object.keys(BIOMES_RIFT);
/** The old dungeon themes, read as biomes. */
export const THEME_BIOME = { crypt: 'sunken_crypt', warren: 'goblin_warrens', vault: 'bandit_stronghold', sanctum: 'arcane_sanctum', delve: 'collapsed_mine', hive: 'web_hive' };

// --- room layouts ---------------------------------------------------------------
// # wall · . floor · D door · o light · x pillar · % node · $ chest · S coffin
// B dais · ~ hazard · c cage · e nest · a anvil · b bookcase · h hoard · k altar
export const ROOM_LAYOUTS = {
  hall:     { trait: 'pillared', grid: ['#########', '#.x...x.#', '#.......#', 'D...o...D', '#.......#', '#.x...x.#', '#########'] },
  open:     { trait: 'open',     grid: ['###########', '#.........#', '#.........#', 'D....o....D', '#.........#', '#.........#', '###########'] },
  choke:    { trait: 'chokepoint', grid: ['#########', '####.####', 'D...o...D', '####.####', '#########'] },
  node:     { trait: 'open',     grid: ['########', '#%%...%#', '#%.....#', 'D..o...#', '#.....%#', '#%%..%%#', '########'] },
  vault:    { trait: 'chokepoint', grid: ['#######', '#$...$#', '#.....#', 'D..o..#', '#$...$#', '#######'] },
  niche:    { trait: 'dark',     grid: ['#########', '#S.S.S.S#', 'D.......#', '#S.S.S.S#', '#########'] },
  prison:   { trait: 'chokepoint', grid: ['#########', '#c.c.c.c#', 'D.......D', '#c.c.c.c#', '#########'] },
  nest:     { trait: 'open',     grid: ['#########', '#e.....e#', '#...e...#', 'D.......D', '#e.....e#', '#########'] },
  library:  { trait: 'pillared', grid: ['#########', '#bbb.bbb#', '#.......#', 'D..x.x..D', '#.......#', '#bbb.bbb#', '#########'] },
  forge:    { trait: 'open',     grid: ['#########', '#~~...~~#', '#..a.a..#', 'D...o...D', '#..a.a..#', '#~~...~~#', '#########'] },
  lair:     { trait: 'open',     grid: ['###########', '#.x.....x.#', '#.........#', 'D....B....D', '#.........#', '#~~.....~~#', '#.x.....x.#', '###########'] },
  hoard:    { trait: 'open',     grid: ['###########', '#hhh...hhh#', '#h.......h#', 'D....B....#', '#h.......h#', '#hhh...hhh#', '###########'] },
  shrine:   { trait: 'open',     grid: ['#######', '#.....#', '#..k..#', 'D.....D', '#.....#', '#######'] },
};
/** Room kind → the layouts it may use. */
const KIND_LAYOUTS = {
  entry: ['open', 'hall'], fight: ['hall', 'open', 'choke', 'hall'], lair: ['lair'], treasure: ['vault'], vault: ['vault', 'library', 'niche'],
  node: ['node', 'forge'], prison: ['prison'], nest: ['nest'], shrine: ['shrine'], puzzle: ['library', 'hall'], rest: ['open'], trap: ['choke', 'hall'], empty: ['hall', 'open'],
};
/** What each room trait does to a fight in it. */
export const ROOM_TRAITS = {
  open:       { name: 'Open hall',  desc: 'Room for four in the front line; flankers roam free.', frontSlots: 4 },
  chokepoint: { name: 'Chokepoint', desc: 'Only two can stand in the front line.', frontSlots: 2 },
  pillared:   { name: 'Pillared',   desc: 'Pillars shelter the back rows from missiles (+2 defence vs ranged).', cover: true },
  dark:       { name: 'Dark',       desc: 'Without darkvision, −2 accuracy.', dark: true },
};

/** Pick a layout for a room: biome-flavoured where it matters. */
export function layoutFor(rng, kind, biomeId) {
  if (kind === 'lair' && biomeId === 'dragons_lair') return 'hoard';
  if (kind === 'node' && biomeId === 'ember_forge') return 'forge';
  if (kind === 'vault' && biomeId === 'sunken_crypt') return 'niche';
  if (kind === 'vault' && (biomeId === 'arcane_sanctum' || biomeId === 'aberrant_deep')) return 'library';
  return rng.pick(KIND_LAYOUTS[kind] || KIND_LAYOUTS.empty);
}

// --- the daily roll --------------------------------------------------------------
/**
 * Choose today's biome for a Rift rank. Native biomes are favoured; older ones
 * linger with elite monsters; one rank above can surge in; rare ones sometimes.
 */
export function rollBiome(rng, rank) {
  const surge = rng.chance(0.1) && rank < 7;
  const at = surge ? rank + 1 : rank;
  const pool = [];
  for (const id of RIFT_BIOME_IDS) {
    const B = BIOMES_RIFT[id];
    const lo = rankIdx(B.ranks[0]), hi = rankIdx(B.ranks[1]);
    if (lo > at) continue;
    let w = at <= hi ? 3 : Math.max(0.4, 2 - (at - hi) * 0.5);
    if (B.rare) w = 0.35;
    pool.push([id, w]);
  }
  const id = pool.length ? rng.weighted(pool) : 'goblin_warrens';
  return { id, surge: surge && rankIdx(BIOMES_RIFT[id].ranks[0]) > rank };
}

/** Harvest a node room for some rounds; returns resources and wandering fights rolled. */
export function harvestYield(rng, node, rounds, skillLevel, tier) {
  const out = {};
  let wander = 0;
  for (let r = 0; r < rounds; r++) {
    const amt = Math.round((3 + tier * 1.4) * (0.6 + skillLevel * 0.05) * rng.float(0.8, 1.25));
    out[node.res] = (out[node.res] || 0) + amt;
    if (rng.chance(0.15 + (node.wander || 0))) wander++;
  }
  return { resources: out, wander };
}
export const HARVEST_ROUNDS = { cautious: 1, balanced: 2, reckless: 4 };
export const clampRank = (r) => clamp(r, 0, 7);
