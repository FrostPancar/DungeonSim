// ============================================================================
// ICONS. Every emoji the client draws lives here and nowhere else, keyed by the
// same ids the simulation uses. Keeping presentation out of the data tables
// means the model never has to know it is being looked at, and one file answers
// "what does this thing look like?".
//
// The rule the map follows: a coloured chip carries identity at any zoom, the
// emoji rides on top of it. Identity is therefore never emoji-alone — it
// survives a tiny tile, a screenshot at 50%, and a reader who cannot tell the
// two beige animals apart.
// ============================================================================

// Emoji need their own font stack or they fall back to tofu on some systems.
export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",' +
  '"Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif';

/** Ancestries. Colonists and raiders share the generator, so they share icons. */
export const RACE_ICON = {
  human: '🧑', dwarf: '🧔', elf: '🧝', halfling: '🧒', gnome: '🎩',
  orc: '👹', goblin: '👺', kobold: '🦎', tiefling: '😈', dragonkin: '🐲',
  undead: '💀', aberrant: '👁️', beast: '🐾', construct: '🗿',
};

/** Livestock and wildlife. */
export const ANIMAL_ICON = {
  fowl: '🐔', cavegoat: '🐐', woolback: '🐑', boar: '🐗', ox: '🐂',
  packlizard: '🦕', warhound: '🐕', direwolf: '🐺', chitinbug: '🪲', duskmoth: '🦋',
};

/** Map features. Only the ones worth walking across the map for get an icon. */
export const FEATURE_ICON = {
  tree: '🌲', fungus: '🍄', herb: '🌿',
  iron: '⚙️', gold: '🪙', gems: '💎', crystal: '🔮', ruin: '🏛️', bones: '🦴',
};
/** Features that read as "go here" — drawn bigger, and listed in the legend. */
export const FEATURE_PRIZE = new Set(['gold', 'gems', 'crystal', 'iron', 'ruin']);

/**
 * Buildings. Structural tiles (wall, floor) are deliberately absent: they are
 * scenery, and icon-ing them would bury the rooms that matter in noise.
 */
export const BUILDING_ICON = {
  door: '🚪', barricade: '🚧',
  bed: '🛏️', table: '🍽️', brazier: '🔥', statue: '🗿', tavern: '🍺',
  stockpile: '📦',
  farm: '🌱', mushroom: '🍄', field: '🌾', pasture: '🐾', barn: '🏚️',
  trough: '🥣', butchery: '🔪', compost: '♻️',
  kitchen: '🍳', carpenter: '🪚', smithy: '⚒️', alchemy: '⚗️',
  library: '📚', infirmary: '⚕️',
  training: '🎯', shrine: '🛐', watchpost: '🔭',
  portal: '🌀', reliquary: '✨',
  combat_school: '🤺', mage_school: '🎓', temple: '⛪', knight_academy: '🏰', wizardry_academy: '🔮', cathedral: '🕍', spellmason: '📜', magic_lab: '⚗️',
  banner: '🚩', lamppost: '💡', statuette: '🗿', monument: '🏛️',
  turret_ballista: '🏹', turret_arcane: '🔮', watchtower: '🏯', armory: '🛡️',
  archive: '📖', observatory: '🔭', archery_range: '🎯', proving_grounds: '⚔️', herbalist_hut: '🌿',
  rug: '🧶', bedroll: '🛌', campfire: '🏕️', torch: '🕯️', planter: '🌼', bench: '🪑', game_table: '🎲',
  shelf: '🗄️', shed: '🛖', well: '🪣', scarecrow: '🌾', stakes: '🪵',
  apothecary: '🧪', trading_post: '⚖️', counting_house: '🪙', stable: '🐫',
};
/** Floors, for the Architect picker only — the map itself draws the pattern,
 *  not an icon, same as walls always have. */
export const FLOOR_ICON = { wood: '🪵', stone: '🧱', pebble: '🪨', crystal: '💎' };

/** The handful of buildings a player hunts for on a crowded map. */
export const BUILDING_LANDMARK = new Set([
  'portal', 'library', 'smithy', 'infirmary', 'shrine', 'reliquary', 'tavern', 'barn', 'watchpost',
  'combat_school', 'mage_school', 'temple', 'knight_academy', 'wizardry_academy', 'cathedral', 'spellmason', 'magic_lab',
  'monument', 'watchtower', 'archive', 'observatory',
]);

/** Overworld sites. */
export const SITE_ICON = {
  colony: '🌀', village: '🏘️', town: '🏙️', freehold: '🏡',
  camp: '⚔️', lair: '🐉',
  dungeon: '🕳️', ruin: '🏛️', barrow: '⚰️',
  quarry: '🪨', lode: '⛏️', grove: '🌳', herbfield: '🌸', leyspring: '💫',
  tower: '🏯', keep: '🏰', stones: '🗿', inn: '🍺',
};

/** Resources, for the top bar and every stock readout. */
export const RESOURCE_ICON = {
  food: '🍖', wood: '🪵', stone: '🪨', iron: '⚙️', leather: '🦬', cloth: '🧵',
  herbs: '🌿', gold: '🪙', gems: '💎', dust: '✨', relics: '🏺', riftshard: '💠',
  knowledge: '📖', meal: '🍲', gear: '🛡️', potion: '🧪',
};

export const CROP_ICON = {
  cavecap: '🍄', tubers: '🥔', grain: '🌾', beans: '🫘', greens: '🥬',
  cotton: '☁️', flax: '🪢', healroot: '🌿', glowspore: '✨', bitterleaf: '🌵',
};

export const SEASON_ICON = { Spring: '🌱', Summer: '☀️', Autumn: '🍂', Winter: '❄️' };

/** Left rail. Label text ships with the icon — an icon alone was the old bug. */
export const PANEL_ICON = {
  colony: '📊', people: '🧑‍🤝‍🧑', region: '🗺️', party: '⚔️',
  farm: '🌾', research: '🔬', trade: '⚖️', log: '📜',
};

export const TOOL_ICON = {
  select: '🖐', mine: '⛏️', harvest: '🌿', cancel: '🚫',
  structure: '🧱', comfort: '🛏️', production: '⚒️', logistics: '📦', martial: '⚔️', farm: '🌾',
};

// ---------------------------------------------------------------------------
// LABOUR CATEGORIES
// Sixteen task kinds are too many to read at a glance, so they fold into six
// work categories plus an off-duty bucket. The colours are the validated
// categorical order (blue, orange, aqua, yellow, magenta, violet) — assigned by
// slot and never cycled. Off duty is neutral grey on purpose: it is the "other"
// bucket, not a seventh category competing for a hue.
// ---------------------------------------------------------------------------
export const LABOUR = [
  { id: 'mine',  name: 'Mining',   icon: '⛏️', color: '#3987e5' },
  { id: 'haul',  name: 'Hauling',  icon: '📦', color: '#d95926' },
  { id: 'build', name: 'Building', icon: '🔨', color: '#199e70' },
  { id: 'farm',  name: 'Farm',     icon: '🌾', color: '#c98500' },
  { id: 'craft', name: 'Crafting', icon: '⚒️', color: '#d55181' },
  { id: 'study', name: 'Study',    icon: '📖', color: '#9085e9' },
  { id: 'off',   name: 'Off duty', icon: '💤', color: '#5b6374' },
];
export const LABOUR_BY_ID = Object.fromEntries(LABOUR.map(l => [l.id, l]));

const TASK_LABOUR = {
  mine: 'mine', haul: 'haul', build: 'build',
  harvest: 'farm', plant: 'farm', farmTend: 'farm', farmHarvest: 'farm', compost: 'farm',
  tame: 'farm', gather: 'farm', butcher: 'farm',
  craft: 'craft',
  research: 'study', train: 'study', pray: 'study', heal: 'study',
  eat: 'off', sleep: 'off', joy: 'off', socialize: 'off', wander: 'off',
};

/** Which of the seven buckets a colonist is in right now. */
export function labourOf(colonist) {
  if (colonist.away) return 'off';
  const k = colonist.task && colonist.task.kind;
  return (k && TASK_LABOUR[k]) || 'off';
}

/** Icon for whatever a colonist is doing, for task readouts. */
export function taskIcon(colonist) {
  if (colonist.away) return '🗺️';
  if (colonist.downed) return colonist.carriedBy ? '🫳' : '🩸';
  if (colonist.carrying) return '🫳';
  const k = colonist.task && colonist.task.kind;
  if (!k) return '💤';
  const special = { eat: '🍽️', sleep: '😴', joy: '🎲', socialize: '💬', wander: '🚶', fight: '⚔️', travel: '🌀' };
  if (special[k]) return special[k];
  return LABOUR_BY_ID[TASK_LABOUR[k] || 'off'].icon;
}

// ---------------------------------------------------------------------------
// STATUS COLOURS
// Reserved for state, never reused as a series colour. Every use ships with a
// word or an icon beside it so state is not colour-alone.
// ---------------------------------------------------------------------------
export const STATUS = {
  good: '#6fcf97', warn: '#e2b23c', bad: '#e07a4a', critical: '#e04a4a', calm: '#7aa8e0',
};
/** A 0..1 fraction to a status colour, low = bad. Used by needs and stock bars. */
export function levelStatus(frac) {
  return frac >= 0.6 ? STATUS.good : frac >= 0.3 ? STATUS.warn : STATUS.critical;
}
/** A 0..100 mood to a status colour and a face, so mood is never colour-alone. */
export function moodStatus(mood) {
  if (mood > 65) return { color: STATUS.good, icon: '🙂', name: 'content' };
  if (mood > 35) return { color: STATUS.warn, icon: '😐', name: 'strained' };
  return { color: STATUS.critical, icon: '😣', name: 'breaking' };
}

/** Research projects, for the tech tree and its tooltips. */
export const TECH_ICON = {
  masonry: '🧱', husbandry: '🍄', smelting: '🔥', herbalism: '🌿', letters: '📜',
  drilling: '⛏️', arcana1: '🌀', drill_corps: '🛡️', wardstone: '🔮', relicry: '🏺',
  deepmaps: '🗺️', agriculture: '🌾', ranching: '🐄', stockbreed: '🐑', cartography: '🧭',
  logistics: '📦', arcane_theory: '🎓', devotion: '🙏', martial_doctrine: '🏰', high_arcana: '🔮', theology: '🕍',
  fortification: '🚧', siege_craft: '🏹', siege_mastery: '🎯', arcane_engineering: '🪄', archival_science: '📚',
  marksmanship: '🎯', war_footing: '⚔️', grand_works: '🏛️', high_masonry: '🗿', decorum: '🕯️', herbal_science: '🌿',
  watch_discipline: '🔭', commerce: '⚖️', coinage: '🪙',
};
