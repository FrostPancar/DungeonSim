// ============================================================================
// MONSTER LIBRARY
// D&D-style monsters in twelve families. A monster is an NPC-shaped object
// (so waves, the map, parley and salvage all treat it like any enemy) whose
// combat sheet comes from its entry here instead of from a class:
//   HP  = (20 + 10·L) × hp      hit = (4 + 1.6·L) × dmg per swing
//   ARM = 2 + 0.75·L            ACC = 5 + 1.15·L      DEF = 0.7·ARM
// Encounter templates group monsters the way they would actually live, each
// with a twist that asks the player for a particular answer.
// ============================================================================
import { clamp } from './rng.js';
import { ABILITIES, SKILL_IDS, ATTRS, mod } from './data.js';
import { resistTable, immunitySet, TAGS } from './elements.js';
import { powerOf } from './npc.js';
import { generateItem, generateLoot } from './items.js';

export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
export const rankIdx = (r) => Math.max(0, RANKS.indexOf(r));
/** Dungeon tier → guild rank index. Matches the Rift's own rank ladder. */
export function tierRank(t) {
  return t <= 1 ? 0 : t <= 2 ? 1 : t <= 4 ? 2 : t <= 6 ? 3 : t <= 8 ? 4 : t <= 11 ? 5 : t <= 14 ? 6 : 7;
}
export function monsterLevel(tier) { return clamp(1 + Math.round(tier * 1.4), 1, 40); }

// --- essences and trophies ---------------------------------------------------
export const ESSENCES = {
  ember:   { name: 'Ember Essence',   element: 'fire',   icon: '🔥', color: '#e07a4a' },
  rime:    { name: 'Rime Essence',    element: 'frost',  icon: '❄️', color: '#8fd0f0' },
  storm:   { name: 'Storm Essence',   element: 'storm',  icon: '⚡', color: '#e2d23c' },
  venom:   { name: 'Venom Essence',   element: 'nature', icon: '☠️', color: '#8fbf5a' },
  radiant: { name: 'Radiant Essence', element: 'holy',   icon: '✨', color: '#f0e0a0' },
  umbral:  { name: 'Umbral Essence',  element: 'shadow', icon: '🌑', color: '#8a7ab0' },
  arcane:  { name: 'Arcane Essence',  element: 'arcane', icon: '🔮', color: '#b07ae0' },
};
export const ESSENCE_IDS = Object.keys(ESSENCES);
export const ESSENCE_OF = { fire: 'ember', frost: 'rime', storm: 'storm', nature: 'venom', holy: 'radiant', shadow: 'umbral', arcane: 'arcane' };

export const TROPHIES = {
  dire_pelt:      { name: 'Dire Pelt',          icon: '🐺' },
  owlbear_plume:  { name: 'Owlbear Plume',      icon: '🪶' },
  displacer_hide: { name: 'Displacer Hide',     icon: '🐆' },
  griffon_feather:{ name: 'Griffon Feather',    icon: '🪶' },
  wyvern_stinger: { name: 'Wyvern Stinger',     icon: '🦂' },
  vampire_fang:   { name: 'Vampire Fang',       icon: '🧛' },
  phylactery:     { name: 'Phylactery Shard',   icon: '💠' },
  troll_heart:    { name: 'Troll Heart',        icon: '💚' },
  mimic_tongue:   { name: 'Mimic Tongue',       icon: '👅' },
  golem_core:     { name: 'Golem Core',         icon: '⚙️' },
  guardian_amulet:{ name: 'Guardian Amulet',    icon: '📿' },
  beholder_eye:   { name: 'Beholder Eye',       icon: '👁️' },
  aboleth_mucus:  { name: 'Aboleth Mucus',      icon: '🫧' },
  balor_whip:     { name: "Balor's Whip",       icon: '🔥' },
  heartstone:     { name: 'Heartstone',         icon: '💎' },
  dragon_scale:   { name: 'Dragon Scale',       icon: '🐉' },
  basilisk_eye:   { name: 'Basilisk Eye',       icon: '🦎' },
  medusa_head:    { name: 'Medusa Head',        icon: '🐍' },
  hydra_blood:    { name: 'Hydra Blood',        icon: '🩸' },
  hook_horror_hook:{ name: 'Hook Horror Hook',  icon: '🪝' },
  hellhound_fang: { name: 'Hellhound Fang',     icon: '🦷' },
  vrock_feather:  { name: 'Vrock Feather',      icon: '🪶' },
  gorgon_plate:   { name: 'Gorgon Plate',       icon: '🛡️' },
  remorhaz_spine: { name: 'Remorhaz Spine',     icon: '🦴' },
  worm_tooth:     { name: 'Purple Worm Tooth',  icon: '🦷' },
};

// --- families ------------------------------------------------------------------
// race: the ancestry used for colour and portrait fallbacks on the map.
// drops: resource weights rolled on every kill; ess: likely essences; gear: base chance.
export const FAMILIES = {
  goblinoid: { name: 'Goblinoids',  race: 'goblin',    faction: 'wild', color: '#8fbf5a', icon: '👺', hostility: 74, tags: ['humanoid', 'darkvision'], drops: { gold: 3, iron: 2, leather: 2, food: 1 }, ess: [], gear: 0.06 },
  beast:     { name: 'Beasts',      race: 'beast',     faction: 'wild', color: '#a08060', icon: '🐾', hostility: 70, tags: ['beast', 'mindless'], drops: { leather: 4, food: 4 }, ess: ['venom'], gear: 0.01 },
  undead:    { name: 'Undead',      race: 'undead',    faction: 'dead', color: '#9aa8b5', icon: '💀', hostility: 96, tags: ['undead', 'mindless', 'darkvision'], drops: { relics: 1, dust: 3, cloth: 1 }, ess: ['umbral', 'umbral', 'radiant'], gear: 0.05 },
  ooze:      { name: 'Oozes & Fungi', race: 'aberrant', faction: 'wild', color: '#7ab08a', icon: '🫠', hostility: 90, tags: ['mindless'], drops: { dust: 2, herbs: 3 }, ess: ['venom'], gear: 0.02 },
  elemental: { name: 'Elementals',  race: 'construct', faction: 'wild', color: '#e0904a', icon: '🌀', hostility: 88, tags: ['elemental'], drops: { gems: 2, stone: 2 }, ess: [], gear: 0.03 },
  giant:     { name: 'Giants & Trolls', race: 'orc',   faction: 'warband', color: '#9a8a6a', icon: '🗿', hostility: 84, tags: ['giant'], drops: { food: 3, gold: 3, stone: 2, iron: 2 }, ess: [], gear: 0.1 },
  construct: { name: 'Constructs',  race: 'construct', faction: 'dead', color: '#8f9aa8', icon: '⚙️', hostility: 95, tags: ['construct', 'mindless'], drops: { iron: 4, gems: 1, dust: 2 }, ess: ['arcane'], gear: 0.12 },
  aberration:{ name: 'Aberrations', race: 'aberrant',  faction: 'cult', color: '#b06ad0', icon: '👁️', hostility: 94, tags: ['aberration', 'darkvision'], drops: { knowledge: 3, dust: 3, gems: 1 }, ess: ['arcane'], gear: 0.04 },
  fiend:     { name: 'Fiends',      race: 'tiefling',  faction: 'cult', color: '#d1607a', icon: '😈', hostility: 92, tags: ['fiend', 'darkvision'], drops: { relics: 3, gold: 2 }, ess: ['ember', 'umbral'], gear: 0.08 },
  dragon:    { name: 'Dragons',     race: 'dragonkin', faction: 'wild', color: '#dba14a', icon: '🐉', hostility: 90, tags: ['dragon', 'darkvision'], drops: { gold: 8, gems: 4 }, ess: [], gear: 0.2 },
  fey:       { name: 'Fey',         race: 'elf',       faction: 'wild', color: '#9fd6b0', icon: '🧚', hostility: 58, tags: ['fey'], drops: { herbs: 3, dust: 3, cloth: 1 }, ess: ['radiant', 'arcane'], gear: 0.04 },
  underdark: { name: 'Underdark Folk', race: 'kobold', faction: 'warband', color: '#8a7ab0', icon: '🦑', hostility: 78, tags: ['humanoid', 'darkvision'], drops: { iron: 3, gold: 2, gems: 1 }, ess: ['storm'], gear: 0.12 },
  monstrosity:{ name: 'Monstrosities', race: 'beast',  faction: 'wild', color: '#b08a5a', icon: '🐍', hostility: 86, tags: [], drops: { leather: 3, food: 2, gems: 1 }, ess: [], gear: 0.04 },
};
export const FAMILY_IDS = Object.keys(FAMILIES);

// --- stat lines ------------------------------------------------------------------
// Monsters carry the same six attributes people do, and they are read the same
// way: Strength or Dexterity (whichever it strikes with) adds to its to-hit and
// damage, Dexterity to how early it acts and how hard it is to hit, Constitution
// to its health, and Intellect and Wisdom to how cleverly it fights and how well
// it shrugs off minds games. Each family has a build — offsets from an ordinary 10
// — and each monster rolls a little either side of it, so two goblins differ.
export const FAMILY_BUILDS = {
  goblinoid:   { str: 0,  dex: 3,  con: 0,  int: 0,  wis: -1, cha: -2 },
  beast:       { str: 3,  dex: 2,  con: 2,  int: -7, wis: 2,  cha: -5 },
  undead:      { str: 2,  dex: -2, con: 3,  int: -5, wis: -2, cha: -6 },
  ooze:        { str: 1,  dex: -5, con: 5,  int: -9, wis: -4, cha: -9 },
  elemental:   { str: 2,  dex: 1,  con: 3,  int: -5, wis: 0,  cha: -4 },
  giant:       { str: 6,  dex: -3, con: 5,  int: -3, wis: -1, cha: -2 },
  construct:   { str: 4,  dex: -3, con: 5,  int: -8, wis: -4, cha: -9 },
  aberration:  { str: -1, dex: 0,  con: 2,  int: 6,  wis: 4,  cha: 2 },
  fiend:       { str: 2,  dex: 2,  con: 1,  int: 3,  wis: 1,  cha: 5 },
  dragon:      { str: 5,  dex: 0,  con: 4,  int: 3,  wis: 2,  cha: 4 },
  fey:         { str: -2, dex: 4,  con: -1, int: 2,  wis: 2,  cha: 6 },
  underdark:   { str: 1,  dex: 2,  con: 1,  int: 1,  wis: 1,  cha: -1 },
  monstrosity: { str: 3,  dex: 1,  con: 3,  int: -6, wis: 1,  cha: -5 },
};

/** Which attribute a monster strikes with. */
export function monsterStrikeAttr(M) { return M.range === 'ranged' || M.row === 'B' ? 'dex' : 'str'; }

/**
 * A monster's six attributes: its family's build, its role, its level and a
 * small roll. `r` is an RNG of its own, so rolling stats never shifts the
 * dungeon's stream.
 */
export function monsterAttributes(r, M, L, tags) {
  const B = FAMILY_BUILDS[M.fam] || {};
  const a = {};
  for (const k of ATTRS) a[k] = 10 + (B[k] || 0) + r.int(-2, 2);
  if (M.row === 'B' || M.range === 'ranged') a.dex += 2;
  if (tags.has('caster')) { a.int += 3; a.wis += 1; }
  if (tags.has('leader')) { a.cha += 3; a.int += 1; }
  if (tags.has('boss')) { a.str += 2; a.con += 3; }
  // Deeper monsters have grown into their bodies: a point in their striking
  // attribute and in Constitution every six levels.
  a[monsterStrikeAttr(M)] += Math.floor(L / 6);
  a.con += Math.floor(L / 6);
  for (const k of ATTRS) a[k] = clamp(a[k], 1, 30);
  return a;
}

// --- monster abilities -----------------------------------------------------------
// Same schema as class abilities (see data.js). 'element' as dmg means the
// monster's own element (dragons, sorcerers). summon: [monster id, count].
export const MONSTER_ABILITIES = {
  m_snare:        { name: 'Snare',            kind: 'debuff', shape: 'single', range: 'ranged', cd: 3, power: 0.4, stat: 'stealth', apply: [['root', 0.8, 2]], desc: 'A noose on the ground.' },
  m_caltrops:     { name: 'Caltrops',         kind: 'debuff', shape: 'all',    range: 'ranged', cd: 4, power: 0.4, stat: 'stealth', apply: [['slow', 0.5, 2]], desc: 'Spikes scattered across the floor.' },
  m_spark:        { name: 'Dragon Spark',     kind: 'attack', shape: 'single', range: 'ranged', dmg: 'element', cd: 2, power: 1.2, stat: 'arcana', spell: 'arcane', desc: 'A bolt of its dragon master\'s element.' },
  m_rally:        { name: 'Warcry',           kind: 'buff',   shape: 'party',  cd: 5, power: 0.4, stat: 'melee', apply: [['inspired', 1, 3]], desc: 'Rouses its kin.' },
  m_trip:         { name: 'Trip',             kind: 'attack', shape: 'single', range: 'melee', dmg: 'weapon', cd: 3, power: 0.9, stat: 'melee', apply: [['stun', 0.35, 1]], desc: 'Drags a foe off its feet.' },
  m_howl:         { name: 'Howl',             kind: 'debuff', shape: 'all',    range: 'ranged', cd: 5, power: 0.4, stat: 'melee', apply: [['fear', 0.35, 2]], desc: 'A howl that loosens bowels.' },
  m_web:          { name: 'Web',              kind: 'debuff', shape: 'single', range: 'ranged', cd: 3, power: 0.4, stat: 'stealth', apply: [['root', 0.85, 2]], desc: 'Sticky silk that pins its prey.' },
  m_screech:      { name: 'Screech',          kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 0.4, stat: 'melee', apply: [['silence', 0.7, 1]], desc: 'A shriek that drowns out spellcraft.' },
  m_acid_spray:   { name: 'Acid Spray',       kind: 'aoe',    shape: 'front',  range: 'ranged', dmg: 'nature', cd: 4, power: 0.7, stat: 'melee', apply: [['sunder', 0.7, 3]], desc: 'Acid that eats armour.' },
  m_dive:         { name: 'Dive',             kind: 'attack', shape: 'single', range: 'melee', dmg: 'weapon', cd: 3, power: 1.4, stat: 'melee', prefer: 'back', dive: true, desc: 'Drops out of the sky onto the back line.' },
  m_tail_spikes:  { name: 'Tail Spikes',      kind: 'attack', shape: 'single', range: 'ranged', dmg: 'pierce', cd: 3, power: 1.4, stat: 'ranged', hits: 3, desc: 'A volley of tail spikes.' },
  m_bone_volley:  { name: 'Bone Volley',      kind: 'aoe',    shape: 'all',    range: 'ranged', dmg: 'pierce', cd: 4, power: 0.55, stat: 'ranged', desc: 'Arrows from every archer at once.' },
  m_raise_dead:   { name: 'Raise Dead',       kind: 'summon', shape: 'self',   cd: 3, power: 1, stat: 'faith', spell: 'divine', windup: 1, summon: ['zombie', 1], desc: 'A chant that stands the dead back up.' },
  m_life_drain:   { name: 'Life Drain',       kind: 'attack', shape: 'single', range: 'melee', dmg: 'shadow', cd: 2, power: 1.2, stat: 'melee', leech: 0.5, apply: [['drained', 0.5, 1]], desc: 'Drinks the life out of a foe.' },
  m_wail:         { name: 'Wail',             kind: 'aoe',    shape: 'all',    range: 'ranged', dmg: 'arcane', cd: 5, power: 0.9, stat: 'arcana', windup: 1, apply: [['fear', 0.6, 2]], desc: 'A scream that stops hearts.' },
  m_glare:        { name: 'Dreadful Glare',   kind: 'debuff', shape: 'single', range: 'ranged', cd: 3, power: 0.4, stat: 'faith', apply: [['fear', 0.8, 2]], desc: 'Eyes that promise the grave.' },
  m_charm:        { name: 'Charm',            kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 0.4, stat: 'social', spell: 'arcane', apply: [['charm', 0.7, 1]], desc: 'A voice you want to obey.' },
  m_bats:         { name: 'Bat Swarm',        kind: 'summon', shape: 'self',   cd: 6, power: 1, stat: 'faith', summon: ['rat_swarm', 1], desc: 'Calls the swarm.' },
  m_hellfire:     { name: 'Hellfire Orb',     kind: 'aoe',    shape: 'all',    range: 'ranged', dmg: 'fire', cd: 5, power: 1.3, stat: 'faith', spell: 'divine', windup: 1, apply: [['burn', 0.5, 3]], desc: 'A sphere of black fire.' },
  m_power_word:   { name: 'Power Word Stun',  kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 0.5, stat: 'arcana', spell: 'arcane', apply: [['stun', 0.9, 1]], desc: 'One word, and you stop.' },
  m_finger:       { name: 'Finger of Death',  kind: 'attack', shape: 'single', range: 'ranged', dmg: 'shadow', cd: 5, power: 1.8, stat: 'arcana', spell: 'arcane', windup: 1, execute: 0.25, desc: 'Kills outright below a quarter health.' },
  m_summon_undead:{ name: 'Summon Undead',    kind: 'summon', shape: 'self',   cd: 5, power: 1, stat: 'arcana', spell: 'arcane', windup: 1, summon: ['skeleton', 2], desc: 'The floor opens and the dead climb out.' },
  m_counterspell: { name: 'Counterspell',     kind: 'debuff', shape: 'single', range: 'ranged', cd: 3, power: 0.5, stat: 'arcana', spell: 'arcane', interrupt: true, apply: [['silence', 0.9, 2]], desc: 'Unmakes a spell mid-cast.' },
  m_hallucinate:  { name: 'Hallucination Spores', kind: 'debuff', shape: 'all', range: 'ranged', cd: 4, power: 0.4, stat: 'faith', apply: [['confuse', 0.4, 2]], desc: 'The room swims.' },
  m_animate_spores:{ name: 'Animate Spores',  kind: 'summon', shape: 'self',   cd: 5, power: 1, stat: 'faith', windup: 1, summon: ['myconid_sprout', 2], desc: 'The fallen sprout again.' },
  m_engulf:       { name: 'Engulf',           kind: 'debuff', shape: 'single', range: 'melee', cd: 4, power: 0.5, stat: 'melee', engulf: true, desc: 'Swallows a foe whole.' },
  m_breath_fire:  { name: 'Fire Breath',      kind: 'aoe',    shape: 'front',  range: 'ranged', dmg: 'fire', cd: 4, power: 1.1, stat: 'melee', windup: 1, apply: [['burn', 0.6, 3]], desc: 'A gout of flame across the front line.' },
  m_breath_frost: { name: 'Frost Breath',     kind: 'aoe',    shape: 'front',  range: 'ranged', dmg: 'frost', cd: 4, power: 1.0, stat: 'melee', windup: 1, apply: [['chill', 0.9, 2]], desc: 'Freezing breath.' },
  m_scald:        { name: 'Scald',            kind: 'aoe',    shape: 'front',  range: 'ranged', dmg: 'fire', cd: 3, power: 0.8, stat: 'melee', apply: [['blind', 0.4, 1]], desc: 'Boiling steam.' },
  m_ignite_row:   { name: 'Ignite',           kind: 'aoe',    shape: 'front',  range: 'ranged', dmg: 'fire', cd: 4, power: 0.9, stat: 'melee', apply: [['burn', 0.7, 3]], desc: 'Sets the front line alight.' },
  m_whelm:        { name: 'Whelm',            kind: 'aoe',    shape: 'front',  range: 'ranged', dmg: 'crush', cd: 4, power: 0.8, stat: 'melee', apply: [['wet', 1, 3], ['root', 0.3, 1]], desc: 'A crushing wave.' },
  m_whirlwind:    { name: 'Whirlwind',        kind: 'aoe',    shape: 'all',    range: 'ranged', dmg: 'crush', cd: 4, power: 0.8, stat: 'melee', desc: 'A howling vortex.' },
  m_rock_throw:   { name: 'Rock Throw',       kind: 'attack', shape: 'single', range: 'ranged', dmg: 'crush', cd: 2, power: 1.3, stat: 'melee', prefer: 'back', apply: [['stun', 0.25, 1]], desc: 'A boulder, hurled at the back line.' },
  m_cleave:       { name: 'Great Cleave',     kind: 'aoe',    shape: 'front',  range: 'melee', dmg: 'weapon', cd: 3, power: 0.9, stat: 'melee', desc: 'A swing through the whole front line.' },
  m_molten_rock:  { name: 'Molten Rock',      kind: 'aoe',    shape: 'all',    range: 'ranged', dmg: 'fire', cd: 5, power: 1.2, stat: 'melee', windup: 1, apply: [['burn', 0.5, 3]], desc: 'Lava rains on everyone.' },
  m_haste:        { name: 'Haste',            kind: 'buff',   shape: 'self',   cd: 6, power: 0.5, stat: 'melee', apply: [['haste', 1, 3]], desc: 'Moves too fast.' },
  m_slow_aura:    { name: 'Slow',             kind: 'debuff', shape: 'all',    range: 'ranged', cd: 5, power: 0.5, stat: 'arcana', windup: 1, apply: [['slow', 0.7, 2]], desc: 'The air thickens around the party.' },
  m_poison_breath:{ name: 'Poison Breath',    kind: 'aoe',    shape: 'all',    range: 'ranged', dmg: 'nature', cd: 5, power: 1.0, stat: 'melee', windup: 1, apply: [['poison', 0.9, 3]], desc: 'A green cloud.' },
  m_spittle:      { name: 'Blinding Spittle', kind: 'debuff', shape: 'single', range: 'ranged', cd: 3, power: 0.4, stat: 'melee', apply: [['blind', 0.8, 2]], desc: 'Spit in the eyes.' },
  m_rot_gaze:     { name: 'Rotting Gaze',     kind: 'attack', shape: 'single', range: 'ranged', dmg: 'shadow', cd: 3, power: 1.0, stat: 'arcana', apply: [['drained', 0.6, 1]], desc: 'Flesh sloughs under its eye.' },
  m_devour:       { name: 'Devour Intellect', kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 0.5, stat: 'arcana', apply: [['stun', 0.7, 2], ['confuse', 0.5, 2]], desc: 'Eats a mind.' },
  m_snatch:       { name: 'Snatch',           kind: 'attack', shape: 'single', range: 'melee', dmg: 'weapon', cd: 3, power: 1.0, stat: 'melee', prefer: 'back', dive: true, pull: true, apply: [['stun', 0.3, 1]], desc: 'Plucks a back-liner into the fray.' },
  m_mind_blast:   { name: 'Mind Blast',       kind: 'aoe',    shape: 'all',    range: 'ranged', dmg: 'arcane', cd: 5, power: 0.8, stat: 'arcana', spell: 'arcane', windup: 1, apply: [['stun', 0.55, 2]], desc: 'A wave of psychic force.' },
  m_dominate:     { name: 'Dominate',         kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 0.5, stat: 'arcana', spell: 'arcane', apply: [['charm', 0.7, 2]], desc: 'Takes a mind for its own.' },
  m_extract:      { name: 'Extract Brain',    kind: 'attack', shape: 'single', range: 'melee', dmg: 'slash', cd: 3, power: 1.2, stat: 'melee', execute: 0.35, helpless: true, desc: 'Kills the helpless.' },
  m_eye_rays:     { name: 'Eye Rays',         kind: 'attack', shape: 'single', range: 'ranged', dmg: 'arcane', cd: 2, power: 1.2, stat: 'arcana', hits: 3, randomApply: [['charm', 0.6, 1], ['fear', 0.7, 2], ['slow', 0.7, 2], ['sleep', 0.6, 2], ['petrify', 0.6, 1], ['drained', 0.7, 1]], desc: 'Three rays, three curses.' },
  m_enslave:      { name: 'Enslave',          kind: 'debuff', shape: 'single', range: 'ranged', cd: 5, power: 0.5, stat: 'arcana', spell: 'arcane', windup: 1, apply: [['charm', 0.9, 3]], desc: 'Makes a slave of a mind.' },
  m_mucus:        { name: 'Mucus Cloud',      kind: 'debuff', shape: 'all',    range: 'ranged', cd: 4, power: 0.5, stat: 'melee', apply: [['poison', 0.7, 2]], desc: 'Slime that chokes.' },
  m_hurl_flame:   { name: 'Hurl Flame',       kind: 'attack', shape: 'single', range: 'ranged', dmg: 'fire', cd: 2, power: 1.2, stat: 'arcana', apply: [['burn', 0.5, 3]], desc: 'A fistful of hellfire.' },
  m_chains:       { name: 'Animate Chains',   kind: 'debuff', shape: 'all',    range: 'ranged', cd: 4, power: 0.5, stat: 'melee', apply: [['root', 0.5, 2]], desc: 'Chains lash out and bind.' },
  m_stun_screech: { name: 'Stunning Screech', kind: 'aoe',    shape: 'all',    range: 'ranged', dmg: 'storm', cd: 5, power: 0.6, stat: 'melee', windup: 1, apply: [['stun', 0.45, 1]], desc: 'A sound like breaking glass.' },
  m_kiss:         { name: 'Draining Kiss',    kind: 'attack', shape: 'single', range: 'melee', dmg: 'shadow', cd: 3, power: 1.3, stat: 'social', leech: 0.5, apply: [['drained', 0.8, 1]], desc: 'A kiss that takes.' },
  m_whip:         { name: 'Lightning Whip',   kind: 'attack', shape: 'single', range: 'ranged', dmg: 'storm', cd: 3, power: 1.3, stat: 'melee', prefer: 'back', pull: true, desc: 'Drags a back-liner to the front.' },
  m_meteor:       { name: 'Meteor',           kind: 'aoe',    shape: 'all',    range: 'ranged', dmg: 'fire', cd: 6, power: 1.8, stat: 'arcana', spell: 'arcane', windup: 2, apply: [['burn', 0.7, 3]], desc: 'Two rounds of warning. Then the sky falls.' },
  m_fire_wall:    { name: 'Wall of Fire',     kind: 'aoe',    shape: 'front',  range: 'ranged', dmg: 'fire', cd: 4, power: 1.0, stat: 'arcana', spell: 'arcane', apply: [['burn', 0.8, 3]], desc: 'A curtain of flame.' },
  m_breath:       { name: 'Breath',           kind: 'aoe',    shape: 'all',    range: 'ranged', dmg: 'element', cd: 5, power: 1.3, stat: 'melee', windup: 1, elementRider: true, desc: 'The dragon draws a deep breath…' },
  m_wing_buffet:  { name: 'Wing Buffet',      kind: 'aoe',    shape: 'front',  range: 'melee', dmg: 'crush', cd: 3, power: 0.7, stat: 'melee', apply: [['slow', 0.6, 1]], desc: 'Wings like a storm.' },
  m_sleep_dust:   { name: 'Sleep Dust',       kind: 'debuff', shape: 'all',    range: 'ranged', cd: 4, power: 0.4, stat: 'arcana', spell: 'arcane', apply: [['sleep', 0.35, 2]], desc: 'Glittering, drowsy dust.' },
  m_polymorph:    { name: 'Polymorph',        kind: 'debuff', shape: 'single', range: 'ranged', cd: 5, power: 0.5, stat: 'arcana', spell: 'arcane', apply: [['silence', 0.8, 2], ['weaken', 0.8, 2]], desc: 'Turns a foe into a toad.' },
  m_panpipes:     { name: 'Panpipes',         kind: 'debuff', shape: 'all',    range: 'ranged', cd: 4, power: 0.4, stat: 'social', randomApply: [['sleep', 0.3, 2], ['fear', 0.3, 2], ['charm', 0.3, 1]], desc: 'A tune that does something different to everyone.' },
  m_entangle:     { name: 'Entangle',         kind: 'debuff', shape: 'all',    range: 'ranged', cd: 4, power: 0.4, stat: 'faith', spell: 'divine', apply: [['root', 0.5, 2]], desc: 'Roots burst from the floor.' },
  m_nightmare:    { name: 'Nightmare Haunting', kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 0.5, stat: 'arcana', spell: 'arcane', apply: [['sleep', 0.8, 2], ['drained', 0.8, 1]], desc: 'Sleep, and dream badly.' },
  m_death_glare:  { name: 'Death Glare',      kind: 'attack', shape: 'single', range: 'ranged', dmg: 'shadow', cd: 4, power: 1.2, stat: 'arcana', execute: 0.25, desc: 'Kills the frightened.' },
  m_darkness:     { name: 'Darkness',         kind: 'debuff', shape: 'all',    range: 'ranged', cd: 5, power: 0.4, stat: 'faith', spell: 'divine', apply: [['blind', 0.5, 2]], desc: 'Magical darkness swallows the light.' },
  m_summon_spider:{ name: 'Summon Spider',    kind: 'summon', shape: 'self',   cd: 6, power: 1, stat: 'faith', spell: 'divine', windup: 1, summon: ['giant_spider', 1], desc: 'Calls on the Spider Queen.' },
  m_heal_kin:     { name: 'Mend Kin',         kind: 'heal',   shape: 'ally',   cd: 3, power: 0.7, stat: 'faith', spell: 'divine', desc: 'Heals an ally.' },
  m_enlarge:      { name: 'Enlarge',          kind: 'buff',   shape: 'self',   cd: 8, power: 0.5, stat: 'melee', apply: [['empower', 1, 3]], desc: 'Grows to twice its size.' },
  m_confuse_gaze: { name: 'Confusing Gaze',   kind: 'debuff', shape: 'single', range: 'ranged', cd: 3, power: 0.5, stat: 'arcana', apply: [['confuse', 0.7, 2]], desc: 'Eyes that scramble thought.' },
  m_shock_grasp:  { name: 'Shocking Grasp',   kind: 'attack', shape: 'single', range: 'ranged', dmg: 'storm', cd: 2, power: 1.2, stat: 'arcana', spell: 'arcane', desc: 'Lightning — deadly on the wet.' },
  m_luring_song:  { name: 'Luring Song',      kind: 'debuff', shape: 'single', range: 'ranged', cd: 2, power: 0.4, stat: 'social', apply: [['charm', 0.6, 1]], desc: 'A song you walk toward.' },
  m_leap:         { name: 'Deadly Leap',      kind: 'aoe',    shape: 'front',  range: 'melee', dmg: 'crush', cd: 4, power: 1.0, stat: 'melee', apply: [['stun', 0.4, 1]], desc: 'Lands on the front line.' },
  m_reel:         { name: 'Reel',             kind: 'attack', shape: 'single', range: 'ranged', dmg: 'crush', cd: 3, power: 0.9, stat: 'melee', prefer: 'back', pull: true, apply: [['root', 0.8, 2]], desc: 'Tendrils drag a back-liner in.' },
  m_petrify_breath:{ name: 'Petrifying Breath', kind: 'aoe',  shape: 'front',  range: 'ranged', dmg: 'arcane', cd: 5, power: 0.6, stat: 'melee', windup: 1, apply: [['petrify', 0.7, 1]], desc: 'Breath that turns flesh to stone.' },
  m_swallow:      { name: 'Swallow',          kind: 'debuff', shape: 'single', range: 'melee', cd: 4, power: 0.5, stat: 'melee', engulf: true, desc: 'Swallows a foe.' },
  // Coven magic: only while all three hags stand.
  m_coven_bolt:   { name: 'Coven Lightning',  kind: 'aoe',    shape: 'all',    range: 'ranged', dmg: 'storm', cd: 4, power: 1.2, stat: 'arcana', spell: 'arcane', coven: true, desc: 'Three voices, one bolt.' },
  m_coven_hold:   { name: 'Hold Person',      kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 0.5, stat: 'arcana', spell: 'arcane', coven: true, apply: [['stun', 0.8, 2]], desc: 'Paralysis, shared by the coven.' },
};
Object.assign(ABILITIES, MONSTER_ABILITIES);

// --- monsters ------------------------------------------------------------------
// rank: [min, max] guild rank · row: F front · B back · Fl flank · Y flying
// hp / dmg: multipliers on the level baseline · type: basic attack damage type
// on: [[status, chance, stacks|rounds]] riders on basic hits · ab: abilities
// res / immune / tags: on top of the family's · drops: { gear, trophy, ess }
const m = (o) => o;
export const MONSTERS = {
  // Goblinoids & kobolds ------------------------------------------------------
  kobold:          m({ name: 'Kobold', fam: 'goblinoid', rank: ['E', 'D'], row: 'F', hp: 0.5, dmg: 0.6, type: 'crush', range: 'ranged', tags: ['small', 'pack', 'coward'], icon: '🦎' }),
  kobold_trapper:  m({ name: 'Kobold Trapper', fam: 'goblinoid', rank: ['E', 'D'], row: 'B', hp: 0.5, dmg: 0.7, type: 'pierce', range: 'ranged', tags: ['small'], ab: ['m_snare', 'm_caltrops'], icon: '🦎' }),
  kobold_sorcerer: m({ name: 'Kobold Scale Sorcerer', fam: 'goblinoid', rank: ['D', 'C'], row: 'B', hp: 0.6, dmg: 1.0, type: 'arcane', range: 'ranged', tags: ['small', 'caster'], element: 'fire', ab: ['m_spark'], icon: '🦎', drops: { ess: 'ember' } }),
  goblin:          m({ name: 'Goblin', fam: 'goblinoid', rank: ['E', 'D'], row: 'F', hp: 0.6, dmg: 0.8, type: 'slash', tags: ['small', 'evasive', 'pack'], icon: '👺' }),
  goblin_archer:   m({ name: 'Goblin Archer', fam: 'goblinoid', rank: ['E', 'D'], row: 'B', hp: 0.5, dmg: 0.9, type: 'pierce', range: 'ranged', tags: ['small'], icon: '👺', drops: { gear: 0.05 } }),
  goblin_shaman:   m({ name: 'Goblin Shaman', fam: 'goblinoid', rank: ['E', 'D'], row: 'B', hp: 0.6, dmg: 0.8, type: 'arcane', range: 'ranged', tags: ['small', 'caster'], ab: ['m_heal_kin', 'hex'], icon: '👺' }),
  goblin_boss:     m({ name: 'Goblin Boss', fam: 'goblinoid', rank: ['E', 'D'], row: 'F', hp: 1.1, dmg: 1.1, type: 'slash', tags: ['leader'], ab: ['m_rally'], icon: '👺', drops: { gear: 0.12 } }),
  worg:            m({ name: 'Worg', fam: 'goblinoid', rank: ['E', 'D'], row: 'F', hp: 0.9, dmg: 1.0, type: 'pierce', tags: ['beast', 'pack'], ab: ['m_trip'], icon: '🐺' }),
  hobgoblin:       m({ name: 'Hobgoblin Soldier', fam: 'goblinoid', rank: ['D', 'C'], row: 'F', hp: 1.0, dmg: 1.0, type: 'pierce', reach: true, arm: 2, tags: ['shieldwall'], icon: '👹', drops: { gear: 0.08 } }),
  hobgoblin_captain:m({ name: 'Hobgoblin Captain', fam: 'goblinoid', rank: ['C', 'B'], row: 'F', hp: 1.4, dmg: 1.2, type: 'slash', arm: 3, tags: ['leader', 'shieldwall'], ab: ['m_rally'], init: 6, icon: '👹', drops: { gear: 0.15 } }),
  bugbear:         m({ name: 'Bugbear', fam: 'goblinoid', rank: ['D', 'C'], row: 'F', hp: 1.2, dmg: 1.5, type: 'crush', tags: ['ambusher'], icon: '👹', drops: { gear: 0.08 } }),
  // Beasts ---------------------------------------------------------------------
  rat_swarm:       m({ name: 'Rat Swarm', fam: 'beast', rank: ['E', 'E'], row: 'F', hp: 0.8, dmg: 0.6, type: 'pierce', tags: ['swarm'], res: { fire: -0.5 }, on: [['bleed', 0.3, 1]], icon: '🐀' }),
  wolf:            m({ name: 'Wolf', fam: 'beast', rank: ['E', 'E'], row: 'F', hp: 0.7, dmg: 0.8, type: 'pierce', tags: ['pack'], ab: ['m_trip'], icon: '🐺' }),
  dire_wolf:       m({ name: 'Dire Wolf', fam: 'beast', rank: ['D', 'D'], row: 'F', hp: 1.2, dmg: 1.1, type: 'pierce', tags: ['pack', 'leader'], ab: ['m_howl', 'm_trip'], icon: '🐺', drops: { trophy: 'dire_pelt' } }),
  giant_bat:       m({ name: 'Giant Bat', fam: 'beast', rank: ['E', 'D'], row: 'Y', hp: 0.6, dmg: 0.7, type: 'pierce', tags: ['flying', 'blindsight'], ab: ['m_screech'], icon: '🦇' }),
  giant_spider:    m({ name: 'Giant Spider', fam: 'beast', rank: ['D', 'C'], row: 'F', hp: 0.9, dmg: 0.9, type: 'pierce', tags: ['climber'], res: { fire: -0.5, nature: 0.5 }, on: [['poison', 0.5, 2]], ab: ['m_web'], icon: '🕷️', drops: { ess: 'venom' } }),
  ankheg:          m({ name: 'Ankheg', fam: 'beast', rank: ['D', 'C'], row: 'F', hp: 1.2, dmg: 1.1, type: 'slash', tags: ['burrower', 'armored'], res: { frost: -0.5 }, ab: ['m_acid_spray'], icon: '🪲', drops: { ess: 'venom' } }),
  owlbear:         m({ name: 'Owlbear', fam: 'beast', rank: ['C', 'C'], row: 'F', hp: 1.8, dmg: 1.4, type: 'slash', tags: ['large'], on: [['root', 0.3, 1], ['bleed', 0.3, 1]], icon: '🦉', drops: { trophy: 'owlbear_plume' } }),
  displacer_beast: m({ name: 'Displacer Beast', fam: 'beast', rank: ['C', 'B'], row: 'F', hp: 1.2, dmg: 1.2, type: 'slash', tags: ['displacement', 'pack'], multi: 2, icon: '🐆', drops: { trophy: 'displacer_hide' } }),
  griffon:         m({ name: 'Griffon', fam: 'beast', rank: ['C', 'B'], row: 'Y', hp: 1.3, dmg: 1.2, type: 'slash', tags: ['flying', 'large'], ab: ['m_dive'], icon: '🦅', drops: { trophy: 'griffon_feather' } }),
  manticore:       m({ name: 'Manticore', fam: 'beast', rank: ['B', 'A'], row: 'Y', hp: 1.6, dmg: 1.3, type: 'pierce', tags: ['flying', 'large'], ab: ['m_tail_spikes', 'm_dive'], icon: '🦁', drops: { gear: 0.06 } }),
  wyvern:          m({ name: 'Wyvern', fam: 'beast', rank: ['A', 'A'], row: 'Y', hp: 1.8, dmg: 1.5, type: 'pierce', tags: ['flying', 'large'], res: { nature: 0.5 }, on: [['poison', 0.6, 3]], ab: ['m_dive'], icon: '🐉', drops: { trophy: 'wyvern_stinger', ess: 'venom' } }),
  // Undead ---------------------------------------------------------------------
  skeleton:        m({ name: 'Skeleton', fam: 'undead', rank: ['E', 'D'], row: 'F', hp: 0.7, dmg: 0.9, type: 'slash', res: { crush: -0.5, slash: 0.5, pierce: 0.5 }, icon: '💀', drops: { gear: 0.06 } }),
  skeleton_archer: m({ name: 'Skeleton Archer', fam: 'undead', rank: ['D', 'D'], row: 'B', hp: 0.6, dmg: 1.0, type: 'pierce', range: 'ranged', res: { crush: -0.5, slash: 0.5, pierce: 0.5 }, ab: ['m_bone_volley'], icon: '💀', drops: { gear: 0.06 } }),
  zombie:          m({ name: 'Zombie', fam: 'undead', rank: ['E', 'D'], row: 'F', hp: 1.3, dmg: 0.9, type: 'crush', tags: ['undying'], res: { fire: -0.5 }, on: [['root', 0.25, 1]], init: -3, icon: '🧟' }),
  ghoul:           m({ name: 'Ghoul', fam: 'undead', rank: ['D', 'C'], row: 'F', hp: 0.9, dmg: 1.0, type: 'slash', on: [['stun', 0.3, 1]], icon: '🧟', drops: { ess: 'umbral' } }),
  shadow:          m({ name: 'Shadow', fam: 'undead', rank: ['C', 'C'], row: 'F', hp: 0.7, dmg: 1.0, type: 'shadow', tags: ['incorporeal'], immune: ['chill', 'frozen'], on: [['weaken', 0.5, 2]], icon: '👤', drops: { ess: 'umbral' } }),
  wight:           m({ name: 'Wight', fam: 'undead', rank: ['C', 'B'], row: 'F', hp: 1.3, dmg: 1.2, type: 'slash', tags: ['leader', 'caster'], ab: ['m_life_drain', 'm_raise_dead'], icon: '🧟', drops: { gear: 0.1 } }),
  wraith:          m({ name: 'Wraith', fam: 'undead', rank: ['B', 'B'], row: 'F', hp: 1.1, dmg: 1.3, type: 'shadow', tags: ['incorporeal'], ab: ['m_life_drain'], icon: '👻', drops: { ess: 'umbral' } }),
  banshee:         m({ name: 'Banshee', fam: 'undead', rank: ['B', 'A'], row: 'B', hp: 0.9, dmg: 1.0, type: 'arcane', range: 'ranged', tags: ['incorporeal'], immune: ['chill', 'frozen'], ab: ['m_wail'], icon: '👻' }),
  mummy:           m({ name: 'Mummy', fam: 'undead', rank: ['B', 'B'], row: 'F', hp: 1.6, dmg: 1.2, type: 'crush', res: { fire: -1 }, on: [['drained', 0.4, 1]], ab: ['m_glare'], icon: '🧟', drops: { res: { cloth: 3 } } }),
  vampire_spawn:   m({ name: 'Vampire Spawn', fam: 'undead', rank: ['A', 'A'], row: 'F', hp: 1.2, dmg: 1.3, type: 'pierce', tags: ['regenerating'], regen: 0.08, leech: 0.3, icon: '🧛' }),
  vampire:         m({ name: 'Vampire', fam: 'undead', rank: ['S', 'S'], row: 'F', hp: 2.2, dmg: 1.5, type: 'pierce', tags: ['regenerating', 'leader'], regen: 0.08, leech: 0.3, legendary: 2, res: { slash: 0.25, pierce: 0.25, crush: 0.25 }, ab: ['m_charm', 'm_bats'], icon: '🧛', drops: { trophy: 'vampire_fang', gear: 0.3 } }),
  death_knight:    m({ name: 'Death Knight', fam: 'undead', rank: ['SS', 'SS'], row: 'F', hp: 2.5, dmg: 1.8, type: 'slash', arm: 4, tags: ['leader', 'magicres'], res: { fire: 0.5, frost: 0.5 }, ab: ['m_hellfire'], icon: '💀', drops: { gear: 0.35 } }),
  lich:            m({ name: 'Lich', fam: 'undead', rank: ['SSS', 'SSS'], row: 'B', hp: 3.0, dmg: 2.0, type: 'arcane', range: 'ranged', tags: ['caster', 'leader', 'magicres', 'phylactery'], legendary: 3, res: { holy: 0.25, frost: 1 }, ab: ['m_power_word', 'm_finger', 'm_summon_undead', 'm_counterspell'], icon: '☠️', drops: { trophy: 'phylactery', gear: 0.4, rarity: 2 } }),
  // Oozes & fungi --------------------------------------------------------------
  myconid_sprout:  m({ name: 'Myconid Sprout', fam: 'ooze', rank: ['E', 'D'], row: 'F', hp: 0.5, dmg: 0.5, type: 'crush', tags: ['plant'], on: [['confuse', 0.15, 1]], icon: '🍄' }),
  shrieker:        m({ name: 'Shrieker', fam: 'ooze', rank: ['D', 'B'], row: 'B', hp: 0.4, dmg: 0.1, type: 'crush', tags: ['plant', 'alarm'], icon: '🍄' }),
  violet_fungus:   m({ name: 'Violet Fungus', fam: 'ooze', rank: ['D', 'C'], row: 'F', hp: 0.8, dmg: 0.9, type: 'nature', reach: true, tags: ['plant'], on: [['poison', 0.5, 1], ['drained', 0.2, 1]], icon: '🍄' }),
  myconid_sovereign:m({ name: 'Myconid Sovereign', fam: 'ooze', rank: ['D', 'C'], row: 'B', hp: 1.3, dmg: 0.9, type: 'nature', range: 'ranged', tags: ['plant', 'leader'], ab: ['m_hallucinate', 'm_animate_spores'], icon: '🍄', drops: { ess: 'venom' } }),
  gray_ooze:       m({ name: 'Gray Ooze', fam: 'ooze', rank: ['D', 'D'], row: 'F', hp: 1.0, dmg: 0.9, type: 'nature', tags: ['ooze'], res: { fire: 0.5, frost: 0.5, nature: 1 }, retaliate: { status: 'sunder' }, icon: '🫠' }),
  carrion_crawler: m({ name: 'Carrion Crawler', fam: 'ooze', rank: ['C', 'C'], row: 'F', hp: 1.3, dmg: 0.8, type: 'crush', tags: ['climber'], on: [['stun', 0.35, 1]], icon: '🐛', drops: { ess: 'venom' } }),
  ochre_jelly:     m({ name: 'Ochre Jelly', fam: 'ooze', rank: ['C', 'C'], row: 'F', hp: 1.4, dmg: 1.0, type: 'nature', tags: ['ooze', 'splits'], on: [['sunder', 0.4, 2]], icon: '🫠' }),
  gelatinous_cube: m({ name: 'Gelatinous Cube', fam: 'ooze', rank: ['C', 'B'], row: 'F', hp: 2.0, dmg: 0.9, type: 'nature', tags: ['ooze', 'large', 'ambusher'], res: { nature: 1 }, ab: ['m_engulf'], icon: '🧊', drops: { gear: 0.25 } }),
  black_pudding:   m({ name: 'Black Pudding', fam: 'ooze', rank: ['B', 'B'], row: 'F', hp: 2.2, dmg: 1.2, type: 'nature', tags: ['ooze', 'splits'], res: { frost: -0.5, fire: -0.25, nature: 1 }, retaliate: { status: 'sunder' }, icon: '🫠', drops: { ess: 'venom' } }),
  // Elementals & heat-dwellers ---------------------------------------------------
  magma_mephit:    m({ name: 'Magma Mephit', fam: 'elemental', rank: ['C', 'C'], row: 'Y', hp: 0.6, dmg: 0.8, type: 'fire', tags: ['flying'], res: { fire: 1, frost: -0.5 }, death: { type: 'fire', power: 0.2 }, ab: ['m_breath_fire'], icon: '🔥', drops: { ess: 'ember' } }),
  ice_mephit:      m({ name: 'Ice Mephit', fam: 'elemental', rank: ['C', 'C'], row: 'Y', hp: 0.6, dmg: 0.8, type: 'frost', tags: ['flying'], res: { frost: 1, fire: -0.5 }, death: { type: 'frost', power: 0.2 }, ab: ['m_breath_frost'], icon: '❄️', drops: { ess: 'rime' } }),
  steam_mephit:    m({ name: 'Steam Mephit', fam: 'elemental', rank: ['C', 'C'], row: 'Y', hp: 0.6, dmg: 0.7, type: 'fire', tags: ['flying'], res: { fire: 1 }, ab: ['m_scald'], icon: '💨', drops: { ess: 'ember' } }),
  azer:            m({ name: 'Azer', fam: 'elemental', rank: ['C', 'B'], row: 'F', hp: 1.2, dmg: 1.1, type: 'crush', tags: ['armored'], res: { fire: 1 }, heated: 'fire', icon: '🔨', drops: { gear: 0.1, res: { iron: 3 } } }),
  fire_elemental:  m({ name: 'Fire Elemental', fam: 'elemental', rank: ['B', 'B'], row: 'F', hp: 1.6, dmg: 1.3, type: 'fire', res: { fire: 1, frost: -0.5 }, immune: ['root'], heated: 'fire', on: [['burn', 0.5, 3]], ab: ['m_ignite_row'], icon: '🔥', drops: { ess: 'ember', ess2: true } }),
  water_elemental: m({ name: 'Water Elemental', fam: 'elemental', rank: ['B', 'B'], row: 'F', hp: 1.8, dmg: 1.1, type: 'crush', tags: ['swimmer'], res: { fire: 0.5, slash: 0.25, pierce: 0.25, crush: 0.25 }, ab: ['m_whelm'], icon: '🌊', drops: { ess: 'storm' } }),
  earth_elemental: m({ name: 'Earth Elemental', fam: 'elemental', rank: ['B', 'B'], row: 'F', hp: 2.2, dmg: 1.3, type: 'crush', tags: ['burrower', 'armored'], res: { slash: 0.25, pierce: 0.25, storm: -0.5 }, on: [['stun', 0.25, 1]], icon: '🪨', drops: { res: { stone: 4, iron: 2 } } }),
  air_elemental:   m({ name: 'Air Elemental', fam: 'elemental', rank: ['B', 'B'], row: 'Y', hp: 1.4, dmg: 1.2, type: 'crush', tags: ['flying', 'evasive'], res: { slash: 0.25, pierce: 0.25, crush: 0.25 }, ab: ['m_whirlwind'], icon: '🌪️', drops: { ess: 'storm' } }),
  salamander:      m({ name: 'Salamander', fam: 'elemental', rank: ['B', 'A'], row: 'F', hp: 1.4, dmg: 1.3, type: 'fire', reach: true, res: { fire: 1, frost: -0.5 }, heated: 'fire', on: [['root', 0.3, 1], ['burn', 0.4, 3]], icon: '🦎', drops: { ess: 'ember' } }),
  hell_hound:      m({ name: 'Hell Hound', fam: 'fiend', rank: ['B', 'A'], row: 'F', hp: 1.2, dmg: 1.2, type: 'pierce', tags: ['pack'], res: { fire: 1 }, ab: ['m_breath_fire'], icon: '🐕', drops: { ess: 'ember', trophy: 'hellhound_fang' } }),
  // Giants & trolls ------------------------------------------------------------
  ogre:            m({ name: 'Ogre', fam: 'giant', rank: ['D', 'C'], row: 'F', hp: 2.0, dmg: 1.5, type: 'crush', tags: ['large'], acc: -2, on: [['stun', 0.2, 1]], icon: '👹', drops: { gear: 0.08 } }),
  troll:           m({ name: 'Troll', fam: 'giant', rank: ['C', 'B'], row: 'F', hp: 2.0, dmg: 1.3, type: 'slash', tags: ['large', 'regenerating', 'undying'], regen: 0.15, res: { fire: -0.5, nature: -0.5 }, on: [['bleed', 0.4, 1]], icon: '🧌', drops: { trophy: 'troll_heart' } }),
  hill_giant:      m({ name: 'Hill Giant', fam: 'giant', rank: ['B', 'B'], row: 'F', hp: 2.6, dmg: 1.6, type: 'crush', tags: ['huge'], ab: ['m_rock_throw'], icon: '🗿' }),
  ettin:           m({ name: 'Ettin', fam: 'giant', rank: ['B', 'A'], row: 'F', hp: 2.6, dmg: 1.4, type: 'crush', tags: ['large'], immune: ['sleep'], multi: 2, icon: '🗿', drops: { gear: 0.1 } }),
  stone_giant:     m({ name: 'Stone Giant', fam: 'giant', rank: ['A', 'A'], row: 'F', hp: 2.8, dmg: 1.6, type: 'crush', tags: ['huge', 'armored'], res: { slash: 0.25, pierce: 0.25 }, ab: ['m_rock_throw'], icon: '🗿', drops: { res: { stone: 6, gems: 2 } } }),
  frost_giant:     m({ name: 'Frost Giant', fam: 'giant', rank: ['A', 'A'], row: 'F', hp: 3.0, dmg: 1.8, type: 'slash', tags: ['huge'], res: { frost: 1, fire: -0.5 }, ab: ['m_cleave'], icon: '🧊', drops: { ess: 'rime', gear: 0.15 } }),
  fire_giant:      m({ name: 'Fire Giant', fam: 'giant', rank: ['S', 'S'], row: 'F', hp: 3.2, dmg: 2.0, type: 'slash', tags: ['huge', 'armored'], res: { fire: 1, frost: -0.5 }, on: [['burn', 0.4, 3]], ab: ['m_molten_rock', 'm_cleave'], icon: '🔥', drops: { ess: 'ember', ess2: true, gear: 0.2 } }),
  // Constructs -----------------------------------------------------------------
  animated_armor:  m({ name: 'Animated Armor', fam: 'construct', rank: ['C', 'C'], row: 'F', hp: 1.2, dmg: 1.0, type: 'slash', tags: ['armored', 'evasive'], icon: '🛡️', drops: { gear: 0.15, armorOnly: true } }),
  flying_sword:    m({ name: 'Flying Sword', fam: 'construct', rank: ['C', 'C'], row: 'Y', hp: 0.5, dmg: 1.0, type: 'slash', tags: ['flying', 'evasive'], on: [['bleed', 0.35, 1]], icon: '🗡️', drops: { gear: 0.1 } }),
  mimic:           m({ name: 'Mimic', fam: 'construct', rank: ['D', 'SS'], row: 'F', hp: 1.5, dmg: 1.3, type: 'pierce', tags: ['ambusher'], retaliate: { status: 'root' }, icon: '📦', drops: { gear: 0.3, trophy: 'mimic_tongue', res: { gold: 6 } } }),
  clay_golem:      m({ name: 'Clay Golem', fam: 'construct', rank: ['B', 'B'], row: 'F', hp: 2.2, dmg: 1.3, type: 'crush', tags: ['large', 'magicres', 'enrage'], res: { nature: 1.5 }, on: [['drained', 0.3, 1]], ab: ['m_haste'], icon: '🗿' }),
  shield_guardian: m({ name: 'Shield Guardian', fam: 'construct', rank: ['A', 'A'], row: 'F', hp: 2.4, dmg: 0.8, type: 'crush', tags: ['guardian', 'regenerating'], regen: 0.05, icon: '🛡️', drops: { trophy: 'guardian_amulet', ess: 'arcane' } }),
  stone_golem:     m({ name: 'Stone Golem', fam: 'construct', rank: ['A', 'A'], row: 'F', hp: 2.8, dmg: 1.5, type: 'crush', tags: ['large', 'magicres'], res: { slash: 0.5, pierce: 0.5, crush: 0.25 }, ab: ['m_slow_aura'], icon: '🗿', drops: { ess: 'arcane', res: { stone: 6 } } }),
  iron_golem:      m({ name: 'Iron Golem', fam: 'construct', rank: ['S', 'S'], row: 'F', hp: 3.2, dmg: 1.8, type: 'crush', tags: ['large', 'magicres', 'armored'], res: { fire: 1.5 }, ab: ['m_poison_breath'], icon: '🤖', drops: { trophy: 'golem_core', res: { iron: 12 } } }),
  // Aberrations ----------------------------------------------------------------
  gibbering_mouther:m({ name: 'Gibbering Mouther', fam: 'aberration', rank: ['B', 'B'], row: 'F', hp: 1.6, dmg: 1.0, type: 'pierce', aura: { status: 'confuse', chance: 0.2 }, ab: ['m_spittle'], icon: '👄' }),
  nothic:          m({ name: 'Nothic', fam: 'aberration', rank: ['B', 'A'], row: 'B', hp: 1.1, dmg: 1.1, type: 'shadow', range: 'ranged', ab: ['m_rot_gaze'], icon: '👁️' }),
  intellect_devourer:m({ name: 'Intellect Devourer', fam: 'aberration', rank: ['A', 'A'], row: 'F', hp: 0.7, dmg: 1.0, type: 'arcane', tags: ['small'], res: { arcane: 0.5 }, ab: ['m_devour'], icon: '🧠', drops: { res: { knowledge: 4 } } }),
  grell:           m({ name: 'Grell', fam: 'aberration', rank: ['A', 'A'], row: 'Y', hp: 1.2, dmg: 1.2, type: 'pierce', tags: ['flying', 'blindsight'], res: { storm: 1 }, ab: ['m_snatch'], icon: '🦑' }),
  chuul:           m({ name: 'Chuul', fam: 'aberration', rank: ['A', 'A'], row: 'F', hp: 2.0, dmg: 1.4, type: 'crush', tags: ['armored', 'swimmer'], res: { nature: 1 }, on: [['root', 0.4, 1], ['stun', 0.25, 1]], icon: '🦞', drops: { ess: 'storm', res: { gems: 3 } } }),
  mind_flayer:     m({ name: 'Mind Flayer', fam: 'aberration', rank: ['S', 'S'], row: 'B', hp: 1.4, dmg: 1.2, type: 'arcane', range: 'ranged', tags: ['caster', 'magicres', 'leader'], res: { arcane: 0.5 }, ab: ['m_mind_blast', 'm_dominate', 'm_extract'], icon: '🦑', drops: { ess: 'arcane', res: { knowledge: 8 } } }),
  beholder:        m({ name: 'Beholder', fam: 'aberration', rank: ['SS', 'SS'], row: 'Y', hp: 3.0, dmg: 1.6, type: 'arcane', range: 'ranged', tags: ['flying', 'allaround', 'large'], legendary: 3, res: { arcane: 0.5 }, aura: { status: 'silence', chance: 0.6, casters: true, pick: 2 }, ab: ['m_eye_rays'], icon: '👁️', drops: { trophy: 'beholder_eye', res: { gems: 8 }, rarity: 1 } }),
  aboleth:         m({ name: 'Aboleth', fam: 'aberration', rank: ['SSS', 'SSS'], row: 'F', hp: 3.5, dmg: 1.7, type: 'crush', tags: ['swimmer', 'huge', 'leader'], legendary: 3, ab: ['m_enslave', 'm_mucus'], icon: '🐟', drops: { trophy: 'aboleth_mucus', gear: 0.4, rarity: 2 } }),
  // Fiends ---------------------------------------------------------------------
  imp:             m({ name: 'Imp', fam: 'fiend', rank: ['C', 'C'], row: 'Y', hp: 0.5, dmg: 0.8, type: 'pierce', tags: ['flying'], res: { slash: 0.25, pierce: 0.25, crush: 0.25 }, start: [['stealth', 2]], on: [['poison', 0.5, 1]], icon: '😈', drops: { ess: 'ember' } }),
  quasit:          m({ name: 'Quasit', fam: 'fiend', rank: ['C', 'C'], row: 'F', hp: 0.5, dmg: 0.8, type: 'slash', res: { frost: 0.5 }, start: [['stealth', 2]], ab: ['m_glare'], icon: '👿', drops: { ess: 'umbral' } }),
  bearded_devil:   m({ name: 'Bearded Devil', fam: 'fiend', rank: ['B', 'B'], row: 'F', hp: 1.4, dmg: 1.1, type: 'slash', reach: true, immune: ['fear'], on: [['bleed', 0.5, 2]], icon: '👹' }),
  barbed_devil:    m({ name: 'Barbed Devil', fam: 'fiend', rank: ['A', 'A'], row: 'F', hp: 1.8, dmg: 1.3, type: 'pierce', res: { frost: 0.5 }, retaliate: { type: 'pierce', frac: 0.04 }, ab: ['m_hurl_flame'], icon: '👹', drops: { ess: 'ember' } }),
  chain_devil:     m({ name: 'Chain Devil', fam: 'fiend', rank: ['A', 'A'], row: 'F', hp: 2.0, dmg: 1.3, type: 'slash', reach: true, ab: ['m_chains', 'm_glare'], icon: '⛓️', drops: { res: { iron: 5 } } }),
  vrock:           m({ name: 'Vrock', fam: 'fiend', rank: ['A', 'A'], row: 'Y', hp: 2.0, dmg: 1.3, type: 'slash', tags: ['flying', 'large'], res: { frost: 0.5, storm: 0.5 }, ab: ['m_stun_screech', 'm_mucus'], icon: '🦅', drops: { trophy: 'vrock_feather' } }),
  succubus:        m({ name: 'Succubus', fam: 'fiend', rank: ['A', 'S'], row: 'F', hp: 1.3, dmg: 1.0, type: 'slash', res: { frost: 0.5, storm: 0.5 }, ab: ['m_charm', 'm_kiss'], icon: '💋', drops: { res: { gold: 8 } } }),
  hezrou:          m({ name: 'Hezrou', fam: 'fiend', rank: ['S', 'S'], row: 'F', hp: 2.6, dmg: 1.5, type: 'slash', tags: ['large'], res: { frost: 0.5, storm: 0.5 }, aura: { status: 'poison', chance: 0.6, front: true }, icon: '🐸', drops: { ess: 'venom' } }),
  balor:           m({ name: 'Balor', fam: 'fiend', rank: ['SSS', 'SSS'], row: 'F', hp: 3.4, dmg: 2.0, type: 'fire', tags: ['huge', 'leader'], legendary: 2, res: { fire: 1, frost: 0.5, storm: 0.5 }, heated: 'fire', death: { type: 'fire', power: 0.35, all: true }, ab: ['m_whip'], icon: '👿', drops: { trophy: 'balor_whip', gear: 0.4, rarity: 2 } }),
  pit_fiend:       m({ name: 'Pit Fiend', fam: 'fiend', rank: ['SSS', 'SSS'], row: 'F', hp: 3.6, dmg: 2.0, type: 'slash', tags: ['huge', 'magicres', 'frightful', 'leader'], legendary: 3, res: { frost: 0.5, storm: 0.5, slash: 0.25, pierce: 0.25, crush: 0.25 }, on: [['poison', 0.5, 2]], ab: ['m_meteor', 'm_fire_wall'], icon: '😈', drops: { gear: 0.45, rarity: 2 } }),
  // Dragons --------------------------------------------------------------------
  red_wyrmling:    m({ name: 'Red Wyrmling', fam: 'dragon', rank: ['C', 'B'], row: 'Y', hp: 1.4, dmg: 1.2, type: 'slash', element: 'fire', tags: ['flying'], res: { fire: 1, frost: -0.5 }, ab: ['m_breath'], icon: '🐉', drops: { ess: 'ember', gear: 0.2 } }),
  white_wyrmling:  m({ name: 'White Wyrmling', fam: 'dragon', rank: ['C', 'B'], row: 'Y', hp: 1.4, dmg: 1.2, type: 'slash', element: 'frost', tags: ['flying'], res: { frost: 1, fire: -0.5 }, ab: ['m_breath'], icon: '🐉', drops: { ess: 'rime', gear: 0.2 } }),
  blue_wyrmling:   m({ name: 'Blue Wyrmling', fam: 'dragon', rank: ['C', 'B'], row: 'Y', hp: 1.4, dmg: 1.2, type: 'slash', element: 'storm', tags: ['flying'], res: { storm: 1, nature: -0.5 }, ab: ['m_breath'], icon: '🐉', drops: { ess: 'storm', gear: 0.2 } }),
  green_wyrmling:  m({ name: 'Green Wyrmling', fam: 'dragon', rank: ['C', 'B'], row: 'Y', hp: 1.4, dmg: 1.2, type: 'slash', element: 'nature', tags: ['flying'], res: { nature: 1, fire: -0.5 }, ab: ['m_breath'], icon: '🐉', drops: { ess: 'venom', gear: 0.2 } }),
  young_red_dragon:m({ name: 'Young Red Dragon', fam: 'dragon', rank: ['A', 'S'], row: 'Y', hp: 2.4, dmg: 1.5, type: 'slash', element: 'fire', tags: ['flying', 'large', 'frightful'], legendary: 1, res: { fire: 1, frost: -0.5 }, ab: ['m_breath', 'm_wing_buffet'], icon: '🐲', drops: { trophy: 'dragon_scale', ess: 'ember', gear: 0.3, rarity: 1 } }),
  young_white_dragon:m({ name: 'Young White Dragon', fam: 'dragon', rank: ['A', 'S'], row: 'Y', hp: 2.4, dmg: 1.5, type: 'slash', element: 'frost', tags: ['flying', 'large', 'frightful'], legendary: 1, res: { frost: 1, fire: -0.5 }, ab: ['m_breath', 'm_wing_buffet'], icon: '🐲', drops: { trophy: 'dragon_scale', ess: 'rime', gear: 0.3, rarity: 1 } }),
  young_black_dragon:m({ name: 'Young Black Dragon', fam: 'dragon', rank: ['A', 'S'], row: 'Y', hp: 2.4, dmg: 1.5, type: 'slash', element: 'shadow', tags: ['flying', 'large', 'frightful'], legendary: 1, res: { shadow: 1, holy: -0.5 }, ab: ['m_breath', 'm_wing_buffet'], icon: '🐲', drops: { trophy: 'dragon_scale', ess: 'umbral', gear: 0.3, rarity: 1 } }),
  adult_blue_dragon:m({ name: 'Adult Blue Dragon', fam: 'dragon', rank: ['SS', 'SS'], row: 'Y', hp: 3.4, dmg: 1.8, type: 'slash', element: 'storm', tags: ['flying', 'huge', 'frightful', 'leader'], legendary: 2, res: { storm: 1, nature: -0.5 }, ab: ['m_breath', 'm_wing_buffet'], icon: '🐲', drops: { trophy: 'dragon_scale', ess: 'storm', gear: 0.4, rarity: 1, res: { gold: 40 } } }),
  adult_green_dragon:m({ name: 'Adult Green Dragon', fam: 'dragon', rank: ['SS', 'SS'], row: 'Y', hp: 3.4, dmg: 1.8, type: 'slash', element: 'nature', tags: ['flying', 'huge', 'frightful', 'leader'], legendary: 2, res: { nature: 1, fire: -0.5 }, ab: ['m_breath', 'm_wing_buffet'], icon: '🐲', drops: { trophy: 'dragon_scale', ess: 'venom', gear: 0.4, rarity: 1, res: { gold: 40 } } }),
  ancient_red_dragon:m({ name: 'Ancient Red Dragon', fam: 'dragon', rank: ['SSS', 'SSS'], row: 'Y', hp: 4.5, dmg: 2.1, type: 'slash', element: 'fire', tags: ['flying', 'gargantuan', 'frightful', 'leader'], legendary: 3, res: { fire: 1, frost: -0.5 }, ab: ['m_breath', 'm_wing_buffet'], icon: '🐲', drops: { trophy: 'dragon_scale', ess: 'ember', gear: 0.6, rarity: 2, res: { gold: 120, gems: 20 } } }),
  drake:           m({ name: 'Fire Drake', fam: 'dragon', rank: ['C', 'B'], row: 'F', hp: 1.5, dmg: 1.2, type: 'pierce', element: 'fire', tags: ['large'], res: { fire: 1 }, ab: ['m_breath'], icon: '🦖', drops: { ess: 'ember' } }),
  // Fey --------------------------------------------------------------------------
  pixie:           m({ name: 'Pixie', fam: 'fey', rank: ['C', 'C'], row: 'Y', hp: 0.3, dmg: 0.4, type: 'arcane', range: 'ranged', tags: ['flying', 'small', 'caster'], start: [['stealth', 2]], ab: ['m_sleep_dust', 'm_polymorph'], icon: '🧚' }),
  sprite:          m({ name: 'Sprite', fam: 'fey', rank: ['C', 'C'], row: 'Y', hp: 0.3, dmg: 0.8, type: 'pierce', range: 'ranged', tags: ['flying', 'small'], start: [['stealth', 2]], on: [['sleep', 0.3, 2]], icon: '🧚' }),
  satyr:           m({ name: 'Satyr', fam: 'fey', rank: ['C', 'C'], row: 'F', hp: 1.0, dmg: 0.9, type: 'crush', tags: ['magicres'], ab: ['m_panpipes'], icon: '🐐', drops: { res: { food: 6 } } }),
  redcap:          m({ name: 'Redcap', fam: 'fey', rank: ['C', 'B'], row: 'F', hp: 1.1, dmg: 1.3, type: 'slash', init: -2, leech: 0.25, on: [['bleed', 0.6, 2]], icon: '🧙', drops: { gear: 0.08 } }),
  dryad:           m({ name: 'Dryad', fam: 'fey', rank: ['C', 'B'], row: 'B', hp: 0.9, dmg: 0.8, type: 'nature', range: 'ranged', tags: ['caster', 'plant'], res: { nature: 0.5 }, ab: ['m_charm', 'm_entangle'], icon: '🌳', drops: { res: { wood: 8 }, ess: 'venom' } }),
  green_hag:       m({ name: 'Green Hag', fam: 'fey', rank: ['B', 'B'], row: 'B', hp: 1.4, dmg: 1.1, type: 'slash', tags: ['coven', 'caster'], start: [['evasive', 1]], ab: ['m_coven_bolt', 'm_coven_hold'], icon: '🧙‍♀️' }),
  sea_hag:         m({ name: 'Sea Hag', fam: 'fey', rank: ['B', 'B'], row: 'B', hp: 1.3, dmg: 1.0, type: 'slash', tags: ['coven', 'caster', 'swimmer'], ab: ['m_glare', 'm_death_glare', 'm_coven_bolt'], icon: '🧙‍♀️', drops: { ess: 'storm' } }),
  night_hag:       m({ name: 'Night Hag', fam: 'fey', rank: ['A', 'A'], row: 'B', hp: 1.6, dmg: 1.2, type: 'slash', tags: ['coven', 'caster', 'leader'], res: { fire: 0.5, frost: 0.5, slash: 0.25, pierce: 0.25, crush: 0.25 }, ab: ['m_nightmare', 'm_coven_hold', 'm_coven_bolt'], icon: '🧙‍♀️', drops: { trophy: 'heartstone' } }),
  // Underdark folk -------------------------------------------------------------
  troglodyte:      m({ name: 'Troglodyte', fam: 'underdark', rank: ['D', 'D'], row: 'F', hp: 1.0, dmg: 0.9, type: 'crush', aura: { status: 'weaken', chance: 0.25, front: true }, icon: '🦎' }),
  kuo_toa:         m({ name: 'Kuo-toa', fam: 'underdark', rank: ['C', 'C'], row: 'F', hp: 0.9, dmg: 0.9, type: 'pierce', tags: ['swimmer'], retaliate: { status: 'weaken', chance: 0.3 }, icon: '🐟', drops: { res: { gems: 1, food: 2 } } }),
  rust_monster:    m({ name: 'Rust Monster', fam: 'underdark', rank: ['C', 'C'], row: 'F', hp: 1.0, dmg: 0.4, type: 'crush', retaliate: { status: 'sunder' }, on: [['sunder', 0.7, 3]], icon: '🐜', drops: { res: { iron: 6 } } }),
  sahuagin:        m({ name: 'Sahuagin', fam: 'underdark', rank: ['C', 'B'], row: 'F', hp: 1.0, dmg: 1.1, type: 'pierce', tags: ['swimmer', 'bloodfrenzy'], icon: '🦈', drops: { res: { gems: 1 } } }),
  duergar:         m({ name: 'Duergar', fam: 'underdark', rank: ['B', 'B'], row: 'F', hp: 1.2, dmg: 1.1, type: 'crush', res: { nature: 0.5 }, immune: ['charm'], ab: ['m_enlarge'], icon: '⛏️', drops: { gear: 0.12 } }),
  drow_warrior:    m({ name: 'Drow Warrior', fam: 'underdark', rank: ['B', 'B'], row: 'F', hp: 1.0, dmg: 1.1, type: 'slash', immune: ['sleep'], resist: { charm: 0.5 }, on: [['sleep', 0.15, 2]], icon: '🧝', drops: { gear: 0.12 } }),
  drow_priestess:  m({ name: 'Drow Priestess', fam: 'underdark', rank: ['A', 'A'], row: 'B', hp: 1.3, dmg: 1.1, type: 'shadow', range: 'ranged', tags: ['caster', 'leader'], immune: ['sleep'], ab: ['m_darkness', 'm_summon_spider', 'm_heal_kin'], icon: '🧝‍♀️', drops: { gear: 0.15, tome: 0.02 } }),
  drider:          m({ name: 'Drider', fam: 'underdark', rank: ['A', 'A'], row: 'F', hp: 1.8, dmg: 1.3, type: 'pierce', tags: ['large', 'climber'], ab: ['m_web', 'm_bone_volley'], icon: '🕷️', drops: { gear: 0.1, res: { cloth: 5 } } }),
  kuo_toa_whip:    m({ name: 'Kuo-toa Whip', fam: 'underdark', rank: ['B', 'B'], row: 'B', hp: 1.1, dmg: 1.0, type: 'storm', range: 'ranged', tags: ['swimmer', 'leader', 'caster'], ab: ['m_shock_grasp', 'bless'], icon: '🐟', drops: { ess: 'storm' } }),
  hook_horror:     m({ name: 'Hook Horror', fam: 'underdark', rank: ['B', 'B'], row: 'F', hp: 1.6, dmg: 1.3, type: 'slash', tags: ['blindsight'], res: { storm: -0.5 }, on: [['bleed', 0.4, 1]], icon: '🦂', drops: { trophy: 'hook_horror_hook' } }),
  umber_hulk:      m({ name: 'Umber Hulk', fam: 'underdark', rank: ['A', 'A'], row: 'F', hp: 2.2, dmg: 1.4, type: 'slash', tags: ['large', 'burrower'], ab: ['m_confuse_gaze'], icon: '🪲', drops: { res: { stone: 5, gems: 2 } } }),
  // Monstrosities --------------------------------------------------------------
  cockatrice:      m({ name: 'Cockatrice', fam: 'monstrosity', rank: ['C', 'C'], row: 'Y', hp: 0.6, dmg: 0.6, type: 'pierce', tags: ['flying'], on: [['petrify', 0.3, 1]], icon: '🐓' }),
  harpy:           m({ name: 'Harpy', fam: 'monstrosity', rank: ['C', 'C'], row: 'Y', hp: 0.8, dmg: 0.9, type: 'slash', tags: ['flying'], ab: ['m_luring_song'], icon: '🦅', drops: { res: { gold: 3 } } }),
  basilisk:        m({ name: 'Basilisk', fam: 'monstrosity', rank: ['B', 'B'], row: 'F', hp: 1.6, dmg: 1.1, type: 'pierce', aura: { status: 'petrify', chance: 0.45, pick: 1, gaze: true }, on: [['poison', 0.4, 1]], icon: '🦎', drops: { trophy: 'basilisk_eye' } }),
  bulette:         m({ name: 'Bulette', fam: 'monstrosity', rank: ['B', 'B'], row: 'F', hp: 1.8, dmg: 1.4, type: 'slash', tags: ['burrower', 'armored'], ab: ['m_leap'], icon: '🦈' }),
  roper:           m({ name: 'Roper', fam: 'monstrosity', rank: ['A', 'A'], row: 'F', hp: 2.2, dmg: 1.2, type: 'crush', reach: true, tags: ['ambusher'], on: [['weaken', 0.4, 2]], ab: ['m_reel'], icon: '🪨', drops: { res: { gems: 3 } } }),
  chimera:         m({ name: 'Chimera', fam: 'monstrosity', rank: ['A', 'A'], row: 'Y', hp: 2.0, dmg: 1.4, type: 'slash', tags: ['flying', 'large'], multi: 3, ab: ['m_breath_fire'], icon: '🦁', drops: { ess: 'ember' } }),
  gorgon:          m({ name: 'Gorgon', fam: 'monstrosity', rank: ['A', 'A'], row: 'F', hp: 2.4, dmg: 1.4, type: 'crush', tags: ['large', 'armored'], ab: ['m_petrify_breath'], icon: '🐂', drops: { trophy: 'gorgon_plate', res: { iron: 5 } } }),
  medusa:          m({ name: 'Medusa', fam: 'monstrosity', rank: ['A', 'A'], row: 'B', hp: 1.6, dmg: 1.2, type: 'pierce', range: 'ranged', tags: ['leader'], aura: { status: 'petrify', chance: 0.5, pick: 1, gaze: true }, on: [['poison', 0.4, 1]], icon: '🐍', drops: { trophy: 'medusa_head', res: { gold: 10 } } }),
  hydra:           m({ name: 'Hydra', fam: 'monstrosity', rank: ['A', 'S'], row: 'F', hp: 3.0, dmg: 0.8, type: 'pierce', tags: ['huge', 'hydra'], multi: 5, icon: '🐍', drops: { trophy: 'hydra_blood' } }),
  remorhaz:        m({ name: 'Remorhaz', fam: 'monstrosity', rank: ['S', 'S'], row: 'F', hp: 2.6, dmg: 1.6, type: 'fire', tags: ['huge', 'burrower'], res: { fire: 1, frost: 1 }, heated: 'fire', ab: ['m_swallow'], icon: '🐛', drops: { trophy: 'remorhaz_spine', ess: 'ember' } }),
  purple_worm:     m({ name: 'Purple Worm', fam: 'monstrosity', rank: ['SS', 'SS'], row: 'F', hp: 4.0, dmg: 1.8, type: 'pierce', tags: ['gargantuan', 'burrower'], on: [['poison', 0.4, 2]], ab: ['m_swallow'], icon: '🪱', drops: { trophy: 'worm_tooth', res: { gems: 10 } } }),
};
export const MONSTER_IDS = Object.keys(MONSTERS);

// --- elite affixes -------------------------------------------------------------
// A monster past its native rank does not disappear; it comes back harder.
export const AFFIXES = {
  elite:     { name: 'Elite',     hp: 1.5, dmg: 1.2 },
  champion:  { name: 'Champion',  hp: 2.0, dmg: 1.1, poise: 1 },
  fiery:     { name: 'Fire-touched',  element: 'fire',   res: { fire: 0.5 } },
  frosty:    { name: 'Frost-touched', element: 'frost',  res: { frost: 0.5 } },
  stormy:    { name: 'Storm-touched', element: 'storm',  res: { storm: 0.5 } },
  vampiric:  { name: 'Vampiric',  leech: 0.25 },
  shielded:  { name: 'Shielded',  barrier: 0.3 },
  frenzied:  { name: 'Frenzied',  tags: ['enrage'] },
  warded:    { name: 'Warded',    tags: ['magicres'] },
};
export const AFFIX_IDS = Object.keys(AFFIXES);

// --- construction --------------------------------------------------------------
let MON_ID = 900000;
/** Monster ids restart with every run, so the same seed replays the same fights. */
export function resetMonsterIds(n = 900000) { MON_ID = n; }
export function monsterIdCounter() { return MON_ID; }

/** Build one monster at a dungeon tier. o.boss, o.affixes: [ids] */
export function createMonster(rng, id, tier, o = {}) {
  const M = MONSTERS[id];
  if (!M) throw new Error('unknown monster ' + id);
  const F = FAMILIES[M.fam];
  const L = o.level || monsterLevel(tier + (o.boss ? 1 : 0));
  const affixes = o.affixes || [];
  let hpM = M.hp, dmgM = M.dmg, poise = 0, leech = M.leech || 0, barrier = 0, element = M.element || null;
  const tags = new Set([...F.tags, ...(M.tags || [])]);
  const resExtra = [M.res];
  for (const a of affixes) {
    const A = AFFIXES[a];
    if (A.hp) hpM *= A.hp;
    if (A.dmg) dmgM *= A.dmg;
    if (A.poise) poise += A.poise;
    if (A.leech) leech += A.leech;
    if (A.barrier) barrier = A.barrier;
    if (A.res) resExtra.push(A.res);
    for (const t of A.tags || []) tags.add(t);
  }
  if (o.boss) { hpM *= 1.6; dmgM *= 1.15; tags.add('boss'); }
  const tagList = [...tags];
  for (const t of tagList) poise += (TAGS[t] && TAGS[t].poise) || 0;
  const hit = 4 + 1.6 * L;
  const attributes = monsterAttributes(rng.fork('attrs:' + MON_ID), M, L, tags);
  const strike = mod(attributes[monsterStrikeAttr(M)]), quick = mod(attributes.dex);
  const maxHp = Math.max(6, Math.round((20 + 10 * L) * hpM * (1 + 0.05 * mod(attributes.con))));
  const affixElement = affixes.map(a => AFFIXES[a].element).find(Boolean) || null;
  const row = M.row === 'B' ? 'back' : 'front';
  const skill = clamp(Math.round(L * 0.7), 0, 20);
  const skills = {};
  for (const s of SKILL_IDS) skills[s] = skill;
  const title = (affixes.length ? AFFIXES[affixes[0]].name + ' ' : '') + M.name;
  const combat = {
    stat: 'melee',
    acc: Math.round(5 + 1.15 * L) + (M.acc || 0) + strike,
    dmg: [Math.max(1, Math.round(hit * 0.7 * dmgM)), Math.max(2, Math.round(hit * 1.3 * dmgM))],
    dmgType: M.type || 'slash', dmgElement: affixElement,
    dmgBonus: strike,
    armor: Math.round(2 + L * 0.75) + (M.arm || 0),
    def: Math.round((2 + L * 0.75) * 0.7) + tagList.reduce((s, t) => s + ((TAGS[t] && TAGS[t].def) || 0), 0) + Math.floor(quick / 2),
    init: (M.init ?? 1) + quick,
    mult: 1, leech,
    role: M.row === 'B' ? 'back' : 'front',
    row, range: M.range || 'melee', reach: !!M.reach,
    tags: tagList, res: resistTable(tagList, resExtra), immune: [...immunitySet(tagList, M.immune || [])],
    resist: { ...(M.resist || {}) }, poise,
    flee: tags.has('coward') ? 0.35 : 0.05,
    onHit: M.on || null, multiattack: M.multi || 1, regen: M.regen || 0,
    deathThroes: M.death || null, aura: M.aura || null, retaliate: M.retaliate || null,
    heated: M.heated || null, startStatus: M.start || null, legendary: M.legendary || 0,
    element, barrier,
  };
  return {
    id: MON_ID++, monster: true, monsterId: id, family: M.fam, icon: M.icon || F.icon, color: F.color,
    name: { short: title, full: title, first: title },
    race: F.race, klass: 'brute', background: 'none', faction: F.faction,
    level: L, tier, boss: !!o.boss, affixes,
    attributes,
    traits: [], skills, passions: {}, hostility: F.hostility, hostilityBase: F.hostility,
    maxHp, hp: maxHp, injuries: [], thoughts: [], relations: {},
    equipment: { weapon: null, armor: null },
    abilities: [...(M.ab || [])].filter(a => ABILITIES[a]),
    x: 0, y: 0, task: null, path: null, pathIdx: 0, moveCd: 0, log: [],
    disposition: 'feral_h', combat,
  };
}

// --- encounter templates ---------------------------------------------------------
// themes: the Rift layers (dungeon themes) the template lives in. leader and
// minions list monster ids; the builder picks the ones that suit the rank.
// twist / answer are shown in the bestiary and the delve report.
export const ENCOUNTERS = {
  goblin_ambush:     { name: 'Goblin Ambush',       ranks: ['E', 'C'], themes: ['warren', 'delve'], leader: ['bugbear', 'goblin_boss', 'hobgoblin_captain'], minions: ['goblin', 'goblin', 'goblin_archer', 'hobgoblin'], twist: 'The bugbear hits the back row first.', answer: 'A tank who draws aggro; AoE on the goblins.' },
  kobold_trapline:   { name: 'Kobold Trapline',     ranks: ['E', 'C'], themes: ['warren', 'delve', 'vault'], leader: ['kobold_sorcerer', 'kobold_trapper'], minions: ['kobold', 'kobold', 'kobold', 'kobold_trapper'], twist: 'Snares and pack tactics.', answer: 'AoE, and kill the sorcerer.' },
  rat_nest:          { name: 'Rat Nest',            ranks: ['E', 'D'], themes: ['warren', 'hive', 'crypt'], leader: ['rat_swarm'], minions: ['rat_swarm', 'giant_bat'], twist: 'Swarms shrug off single blows.', answer: 'Bring area damage — and fire.' },
  wolf_pack:         { name: 'Wolf Pack',           ranks: ['E', 'C'], themes: ['warren', 'hive'], leader: ['dire_wolf', 'worg'], minions: ['wolf', 'wolf', 'worg'], twist: 'Pack tactics while the alpha lives.', answer: 'Kill the alpha first.' },
  hobgoblin_phalanx: { name: 'Hobgoblin Phalanx',   ranks: ['D', 'B'], themes: ['warren', 'vault', 'delve'], leader: ['hobgoblin_captain'], minions: ['hobgoblin', 'hobgoblin', 'goblin_archer', 'bugbear'], twist: 'A shield wall that is hard to hit.', answer: 'Go over it: magic, reach and volleys; sunder armour.' },
  spider_nest:       { name: 'Spider Nest',         ranks: ['D', 'A'], themes: ['hive'], leader: ['drider', 'giant_spider'], minions: ['giant_spider', 'giant_spider', 'ankheg'], twist: 'Webs root the party; venom stacks.', answer: 'Fire burns webs; cleanse the poison.' },
  myconid_circle:    { name: 'Myconid Circle',      ranks: ['D', 'B'], themes: ['hive', 'delve'], leader: ['myconid_sovereign'], minions: ['myconid_sprout', 'myconid_sprout', 'shrieker', 'violet_fungus'], twist: 'The shrieker calls for help.', answer: 'Shoot the shrieker first; fire on the fungus.' },
  shambling_dead:    { name: 'Shambling Dead',      ranks: ['E', 'C'], themes: ['crypt', 'sanctum'], leader: ['zombie', 'ghoul'], minions: ['zombie', 'zombie', 'skeleton', 'skeleton_archer'], twist: 'The undying keep standing up.', answer: 'Holy or fire finishers; crush for skeletons.' },
  necromancer_court: { name: "Necromancer's Court", ranks: ['C', 'A'], themes: ['crypt', 'sanctum'], leader: ['wight'], minions: ['skeleton', 'ghoul', 'skeleton_archer', 'shadow'], twist: 'The wight raises the fallen.', answer: 'Interrupt or silence the caster; holy area damage.' },
  haunting:          { name: 'The Haunting',        ranks: ['B', 'S'], themes: ['crypt', 'sanctum'], leader: ['banshee', 'wraith', 'mummy'], minions: ['wraith', 'shadow', 'ghoul'], twist: 'Incorporeal foes shrug off steel; the wail terrifies.', answer: 'Holy and magic damage; fear resistance.' },
  ooze_pit:          { name: 'Ooze Pit',            ranks: ['D', 'B'], themes: ['hive', 'delve', 'vault'], leader: ['gelatinous_cube', 'black_pudding'], minions: ['gray_ooze', 'ochre_jelly', 'carrion_crawler'], twist: 'Blades split them; the cube engulfs.', answer: 'Crush, fire and frost — leave the axes home.' },
  troll_bridge:      { name: 'Troll Bridge',        ranks: ['C', 'A'], themes: ['warren', 'delve'], leader: ['troll'], minions: ['troll', 'ogre'], max: 3, twist: 'Trolls regenerate and get back up.', answer: 'Fire or acid stops the regeneration.' },
  harpy_roost:       { name: 'Harpy Roost',         ranks: ['C', 'B'], themes: ['warren', 'hive'], leader: ['harpy'], minions: ['harpy', 'harpy', 'cockatrice'], twist: 'Fliers out of reach; the song charms.', answer: 'Archers, grounding, and charm resistance.' },
  mephit_storm:      { name: 'Mephit Storm',        ranks: ['C', 'A'], themes: ['delve', 'sanctum'], leader: ['fire_elemental', 'azer'], minions: ['magma_mephit', 'magma_mephit', 'steam_mephit'], twist: 'Mephits explode; the elemental burns attackers.', answer: 'Frost from range; fire wards.' },
  frost_hunt:        { name: 'Frost Giant Hunt',    ranks: ['A', 'S'], themes: ['delve', 'warren'], leader: ['frost_giant'], minions: ['ice_mephit', 'ice_mephit', 'white_wyrmling'], twist: 'Freezing breath, then shattering blows.', answer: 'Interrupt the breaths; fire damage.' },
  drow_patrol:       { name: 'Drow Patrol',         ranks: ['B', 'S'], themes: ['hive', 'delve', 'vault'], leader: ['drow_priestess'], minions: ['drow_warrior', 'drow_warrior', 'giant_spider', 'drider'], twist: 'Darkness and sleep poison.', answer: 'Holy light; elves resist sleep; cleanse.' },
  kuo_toa_congregation:{ name: 'Kuo-toa Congregation', ranks: ['C', 'A'], themes: ['delve', 'hive'], leader: ['kuo_toa_whip'], minions: ['kuo_toa', 'kuo_toa', 'sahuagin', 'chuul'], twist: 'Their lightning thrives on the wet.', answer: 'Storm wards; strike them with storm too.' },
  underdark_miners:  { name: 'Duergar Dig',         ranks: ['C', 'A'], themes: ['delve'], leader: ['duergar', 'umber_hulk'], minions: ['duergar', 'rust_monster', 'hook_horror', 'troglodyte'], twist: 'Rust eats your armour; hulks burrow into the back line.', answer: 'Magic and leather; guard the back row.' },
  the_ritual:        { name: 'The Ritual',          ranks: ['C', 'S'], themes: ['sanctum', 'crypt'], leader: ['night_hag', 'succubus', 'barbed_devil'], minions: ['imp', 'quasit', 'bearded_devil', 'hell_hound'], twist: 'Fiends resist fire and hide in plain sight.', answer: 'Holy damage; burst them down fast.' },
  golem_vault:       { name: 'Golem Vault',         ranks: ['B', 'SS'], themes: ['vault', 'sanctum'], leader: ['stone_golem', 'clay_golem', 'iron_golem'], minions: ['animated_armor', 'flying_sword', 'shield_guardian'], twist: 'Magic-resistant constructs; the guardian soaks damage.', answer: 'Storm and crush; sunder armour.' },
  mimic_hoard:       { name: 'Mimic Hoard',         ranks: ['D', 'SS'], themes: ['vault', 'sanctum'], leader: ['mimic'], minions: ['animated_armor', 'flying_sword'], max: 3, twist: 'The chest bites.', answer: 'Detect it, or take the first hit.' },
  hydra_pool:        { name: 'Hydra Pool',          ranks: ['A', 'S'], themes: ['hive', 'delve'], leader: ['hydra'], minions: ['sahuagin', 'kuo_toa'], max: 3, twist: 'Every severed head grows back two.', answer: 'Fire every round.' },
  hag_coven:         { name: 'Hag Coven',           ranks: ['B', 'S'], themes: ['sanctum', 'hive', 'crypt'], leader: ['night_hag'], minions: ['green_hag', 'sea_hag'], min: 3, max: 3, twist: 'Shared magic while all three live.', answer: 'Focus one hag to break the coven.' },
  gaze_garden:       { name: 'Gaze Garden',         ranks: ['B', 'S'], themes: ['vault', 'sanctum', 'warren'], leader: ['medusa', 'basilisk', 'gorgon'], minions: ['cockatrice', 'basilisk', 'harpy'], twist: 'Petrifying gazes everywhere.', answer: 'Mirrors, blindness, stone salves.' },
  mind_flayer_colony:{ name: 'Mind Flayer Colony',  ranks: ['S', 'SS'], themes: ['sanctum', 'delve'], leader: ['mind_flayer'], minions: ['intellect_devourer', 'grell', 'nothic', 'gibbering_mouther'], twist: 'Mind blasts stun, then they eat the stunned.', answer: 'Interrupt the blast; high-Wisdom party.' },
  beholder_lair:     { name: "Beholder's Lair",     ranks: ['SS', 'SSS'], themes: ['sanctum', 'vault'], leader: ['beholder'], minions: ['nothic', 'gibbering_mouther'], max: 3, twist: 'Antimagic silences casters; rays curse at random.', answer: 'A martial party; cleansers.' },
  dragon_lair:       { name: "Dragon's Lair",       ranks: ['C', 'SSS'], themes: ['vault', 'delve', 'warren'], leader: ['red_wyrmling', 'white_wyrmling', 'blue_wyrmling', 'green_wyrmling', 'young_red_dragon', 'young_white_dragon', 'young_black_dragon', 'adult_blue_dragon', 'adult_green_dragon', 'ancient_red_dragon'], minions: ['kobold', 'kobold_sorcerer', 'drake', 'kobold_trapper'], twist: 'Terror, breath and a flier out of reach.', answer: 'Element wards, fear immunity, grounding, interrupt the breath.' },
  vampire_court:     { name: "Vampire's Court",     ranks: ['A', 'S'], themes: ['crypt'], leader: ['vampire', 'vampire_spawn'], minions: ['vampire_spawn', 'rat_swarm', 'ghoul'], twist: 'Regenerates unless burned by holy light.', answer: 'Holy damage — paladins and clerics.' },
  lich_sanctum:      { name: "Lich's Sanctum",      ranks: ['SS', 'SSS'], themes: ['crypt', 'sanctum'], leader: ['lich'], minions: ['death_knight', 'wraith', 'banshee'], twist: 'Power words and death from a caster at the back.', answer: 'Silence and interrupt; reach the back row.' },
  infernal_warlord:  { name: 'Infernal Warlord',    ranks: ['SS', 'SSS'], themes: ['sanctum', 'crypt'], leader: ['balor', 'pit_fiend'], minions: ['barbed_devil', 'hell_hound', 'vrock', 'hezrou'], twist: 'It explodes when it dies; meteors fall.', answer: 'Fire wards and a barrier for the killing blow.' },
  giant_warband:     { name: 'Giant Warband',       ranks: ['B', 'SS'], themes: ['warren', 'delve'], leader: ['fire_giant', 'stone_giant', 'hill_giant', 'ettin'], minions: ['ogre', 'hill_giant', 'troll', 'dire_wolf'], twist: 'Boulders on the back line.', answer: 'Stagger them; keep the healer safe.' },
  beast_hunt:        { name: 'Beast Hunt',          ranks: ['C', 'A'], themes: ['warren', 'hive'], leader: ['owlbear', 'displacer_beast', 'manticore', 'wyvern', 'griffon'], minions: ['wolf', 'dire_wolf', 'giant_bat'], twist: 'Big predators; fliers dive the back.', answer: 'Hold the front; archers for the fliers.' },
  fey_revel:         { name: 'Fey Revel',           ranks: ['C', 'B'], themes: ['hive', 'sanctum'], leader: ['dryad', 'satyr', 'redcap'], minions: ['pixie', 'sprite', 'satyr', 'redcap'], twist: 'Sleep, charm and confusion.', answer: 'Elves, cleansers and archers.' },
  fungal_crawlers:   { name: 'Fungal Crawlers',     ranks: ['D', 'B'], themes: ['hive', 'delve'], leader: ['carrion_crawler', 'violet_fungus', 'black_pudding'], minions: ['myconid_sprout', 'violet_fungus', 'gray_ooze'], twist: 'Paralysing tentacles and rot.', answer: 'Fire; keep a cleanser handy.' },
  insect_swarm:      { name: 'Insect Swarm',        ranks: ['D', 'A'], themes: ['hive'], leader: ['ankheg', 'drider', 'giant_spider'], minions: ['rat_swarm', 'giant_spider', 'giant_bat'], twist: 'Burrowers and swarms from every side.', answer: 'Area damage and a guarded back row.' },
  drowned_patrol:    { name: 'Drowned Patrol',      ranks: ['C', 'A'], themes: ['delve', 'hive'], leader: ['water_elemental', 'chuul', 'sea_hag'], minions: ['sahuagin', 'kuo_toa', 'kuo_toa'], twist: 'Everyone is wet — lightning cuts both ways.', answer: 'Storm wards; strike first with storm.' },
  forge_guard:       { name: 'Forge Guard',         ranks: ['C', 'S'], themes: ['delve', 'sanctum'], leader: ['fire_giant', 'salamander', 'azer', 'fire_elemental'], minions: ['azer', 'magma_mephit', 'hell_hound'], twist: 'Heated bodies burn whoever strikes them.', answer: 'Frost from range; fire wards.' },
  frozen_horde:      { name: 'Frozen Horde',        ranks: ['C', 'S'], themes: ['delve', 'warren'], leader: ['remorhaz', 'young_white_dragon', 'white_wyrmling', 'frost_giant'], minions: ['ice_mephit', 'wolf', 'dire_wolf'], twist: 'Chill stacks into a freeze, and the freeze shatters.', answer: 'Fire, frost wards, and keep moving.' },
  devil_patrol:      { name: 'Devil Patrol',        ranks: ['A', 'SS'], themes: ['sanctum', 'crypt'], leader: ['barbed_devil', 'chain_devil', 'vrock', 'hezrou'], minions: ['imp', 'bearded_devil', 'hell_hound', 'quasit'], twist: 'Fiends shrug off fire and poison.', answer: 'Holy damage; cold iron; burst.' },
  aberrant_horde:    { name: 'Aberrant Horde',      ranks: ['A', 'SSS'], themes: ['sanctum', 'delve'], leader: ['chuul', 'grell', 'gibbering_mouther', 'aboleth'], minions: ['intellect_devourer', 'nothic', 'gibbering_mouther'], twist: 'Minds break before bodies do.', answer: 'Wisdom, clarity, and interrupts.' },
  elemental_rift:    { name: 'Elemental Rift',      ranks: ['B', 'A'], themes: ['sanctum', 'delve'], leader: ['earth_elemental', 'water_elemental', 'air_elemental', 'salamander'], minions: ['magma_mephit', 'ice_mephit', 'steam_mephit'], twist: 'Elements you must answer with their opposite.', answer: 'Mixed damage types.' },
};
export const ENCOUNTER_IDS = Object.keys(ENCOUNTERS);

const mRank = (id) => [rankIdx(MONSTERS[id].rank[0]), rankIdx(MONSTERS[id].rank[1])];

/** Monsters from a list suited to a rank; too-strong ones excluded. */
function suited(list, rank) {
  const ok = list.filter(id => mRank(id)[0] <= rank);
  if (!ok.length) {
    // Nothing weak enough: the lowest-ranked ones anyway.
    const lo = Math.min(...list.map(id => mRank(id)[0]));
    return list.filter(id => mRank(id)[0] === lo);
  }
  const native = ok.filter(id => mRank(id)[1] >= rank);
  return native.length ? native : ok;
}

function affixesFor(rng, id, rank, bonus = 0) {
  const over = rank - mRank(id)[1] + bonus;
  const out = [];
  if (over <= 0) return out;
  if (rng.chance(Math.min(0.9, 0.35 + over * 0.15))) out.push(over >= 2 ? 'champion' : 'elite');
  if (over >= 2 && rng.chance(0.4)) out.push(rng.pick(AFFIX_IDS.filter(a => a !== 'elite' && a !== 'champion')));
  return out;
}

/** An explicit template list, weighted toward the ones native to this rank. */
export function weightedTemplates(list, rank) {
  const out = [];
  for (const id of list) {
    const e = ENCOUNTERS[id];
    if (!e) continue;
    const lo = rankIdx(e.ranks[0]), hi = rankIdx(e.ranks[1]);
    if (lo > rank + 1) continue;
    out.push([id, lo > rank ? 0.4 : rank <= hi ? 3 : Math.max(0.3, 1.5 - (rank - hi) * 0.4)]);
  }
  return out;
}

/** Templates that fit a theme and rank, weighted toward their native range. */
export function templatesFor(theme, rank) {
  return ENCOUNTER_IDS.filter(id => {
    const e = ENCOUNTERS[id];
    return (!theme || e.themes.includes(theme)) && rankIdx(e.ranks[0]) <= rank;
  }).map(id => {
    const e = ENCOUNTERS[id];
    const hi = rankIdx(e.ranks[1]);
    return [id, rank <= hi ? 3 : Math.max(0.3, 1.5 - (rank - hi) * 0.4)];
  });
}

/**
 * Fill a template into a group of monsters.
 * o: { tier, size, boss, theme, template }
 */
export function buildEncounter(rng, o) {
  const tier = o.tier ?? 1;
  const rank = tierRank(tier);
  let tid = o.template;
  if (!tid) {
    const pool = o.templates ? weightedTemplates(o.templates, rank) : templatesFor(o.theme, rank);
    tid = pool.length ? rng.weighted(pool) : 'goblin_ambush';
  }
  const E = ENCOUNTERS[tid];
  const size = clamp(o.size || 3, E.min || 1, E.max || 6);
  const out = [];
  const leaderId = rng.pick(suited(E.leader, rank));
  const withBiome = (list) => o.affix && rng.chance(0.3) && !list.includes(o.affix) ? [...list, o.affix] : list;
  out.push(createMonster(rng, leaderId, tier, { boss: !!o.boss, affixes: withBiome(affixesFor(rng, leaderId, rank)) }));
  const minions = suited(E.minions, rank);
  for (let i = 1; i < size; i++) {
    const mid = rng.pick(minions);
    out.push(createMonster(rng, mid, Math.max(0, tier - 1), { affixes: withBiome(affixesFor(rng, mid, rank)) }));
  }
  // Tell twins apart in the log.
  const seen = {};
  for (const x of out) {
    const n = x.name.short;
    seen[n] = (seen[n] || 0) + 1;
    if (seen[n] > 1) x.name = { ...x.name, short: `${n} ${seen[n]}`, full: `${n} ${seen[n]}` };
  }
  out.template = tid;
  return out;
}

/** A night wave of monsters sized to a power target. */
export function monsterWave(rng, faction, tier, target, maxSize, templates = null) {
  const theme = faction === 'dead' ? 'crypt' : faction === 'cult' ? 'sanctum' : 'warren';
  const rank = tierRank(tier);
  const pool = templates && templates.length ? weightedTemplates(templates, rank) : templatesFor(theme, rank);
  const tid = pool.length ? rng.weighted(pool) : 'goblin_ambush';
  const force = [];
  let power = 0;
  const E = ENCOUNTERS[tid];
  for (let i = 0; i < maxSize; i++) {
    const list = i === 0 ? E.leader : E.minions;
    const id = rng.pick(suited(list, rank));
    const mon = createMonster(rng, id, i === 0 ? tier : Math.max(0, tier - 1), { affixes: affixesFor(rng, id, rank) });
    force.push(mon);
    power += powerOf(mon);
    if (power >= target) break;
  }
  force.template = tid;
  return force;
}

// --- drops -----------------------------------------------------------------------
/**
 * What a slain monster leaves. Every kill rolls its family's resources; gear,
 * essences and trophies are rarer. Returns a loot bundle in expedition shape.
 */
export function rollMonsterDrops(rng, mon, tier) {
  const M = MONSTERS[mon.monsterId], F = FAMILIES[mon.family];
  const out = { resources: {}, items: [], reagents: {}, trophies: {} };
  if (!M) return out;
  const D = M.drops || {};
  const weights = Object.entries(F.drops);
  const picks = 1 + (rng.chance(0.4) ? 1 : 0);
  for (let i = 0; i < picks; i++) {
    const res = rng.weighted(weights);
    const qty = Math.max(1, Math.round((1 + tier * 0.6) * rng.float(0.6, 1.4) * (mon.boss ? 2 : 1)));
    out.resources[res] = (out.resources[res] || 0) + qty;
  }
  for (const [k, v] of Object.entries(D.res || {})) out.resources[k] = (out.resources[k] || 0) + Math.round(v * (1 + tier * 0.15));
  // Essences: the monster's own, its element's, or its family's.
  const ess = D.ess || (M.element && ESSENCE_OF[M.element]) || (F.ess.length ? rng.pick(F.ess) : null);
  const essChance = mon.family === 'elemental' || D.ess ? 0.6 : 0.2;
  if (ess && rng.chance(essChance)) out.reagents[ess] = (out.reagents[ess] || 0) + (D.ess2 ? 2 : 1) * (mon.boss ? 2 : 1);
  if (D.trophy && rng.chance(mon.boss ? 0.6 : 0.08)) out.trophies[D.trophy] = (out.trophies[D.trophy] || 0) + 1;
  const gearChance = (D.gear ?? F.gear) * (mon.boss ? 2 : 1);
  if (rng.chance(gearChance)) {
    const bonus = (D.rarity || 0) + (mon.boss ? 1 : 0);
    out.items.push(D.armorOnly ? generateItem(rng, { slot: rng.pick(['armor', 'head', 'feet', 'offhand']), tier, rarityBonus: bonus }) : generateLoot(rng, tier, bonus));
  }
  if (D.tome && rng.chance(D.tome)) out.reagents.class_tome = (out.reagents.class_tome || 0) + 1;
  return out;
}

/** Record who was met and who was killed. Knowledge grows with kills. */
export function noteBestiary(game, foes) {
  if (!game.bestiary) game.bestiary = {};
  for (const f of foes) {
    if (!f.monster) continue;
    const b = game.bestiary[f.monsterId] || (game.bestiary[f.monsterId] = { seen: 0, kills: 0, first: game.day });
    b.seen++;
    if (f.hp <= 0) b.kills++;
  }
}
/** How much the colony knows: 0 nothing, 1 stats (1 kill), 2 weaknesses (3 kills), 3 mastery (10 kills). */
export function bestiaryKnowledge(game, id) {
  const b = game.bestiary && game.bestiary[id];
  if (!b) return 0;
  return b.kills >= 10 ? 3 : b.kills >= 3 ? 2 : b.kills >= 1 || b.seen >= 3 ? 1 : 0.5;
}
