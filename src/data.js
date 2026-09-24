// ============================================================================
// CONTENT DATABASE
// All gameplay content lives here as plain data so generation stays procedural
// and systems stay generic. Nothing here imports anything.
// ============================================================================

export const ATTRS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ATTR_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intellect', wis: 'Wisdom', cha: 'Charisma' };
export const mod = (score) => Math.floor((score - 10) / 2);

// --- Skills -----------------------------------------------------------------
// Every skill maps to a governing attribute and a work domain.
export const SKILLS = {
  mining:      { name: 'Mining',       attr: 'str', domain: 'labor' },
  woodcutting: { name: 'Woodcutting',  attr: 'str', domain: 'labor' },
  construction:{ name: 'Construction', attr: 'dex', domain: 'labor' },
  hauling:     { name: 'Hauling',      attr: 'con', domain: 'labor' },
  farming:     { name: 'Farming',      attr: 'wis', domain: 'craft' },
  cooking:     { name: 'Cooking',      attr: 'dex', domain: 'craft' },
  smithing:    { name: 'Smithing',     attr: 'str', domain: 'craft' },
  alchemy:     { name: 'Alchemy',      attr: 'int', domain: 'craft' },
  medicine:    { name: 'Medicine',     attr: 'int', domain: 'craft' },
  research:    { name: 'Research',     attr: 'int', domain: 'craft' },
  melee:       { name: 'Melee',        attr: 'str', domain: 'martial' },
  ranged:      { name: 'Marksman',     attr: 'dex', domain: 'martial' },
  arcana:      { name: 'Arcana',       attr: 'int', domain: 'martial' },
  faith:       { name: 'Faith',        attr: 'wis', domain: 'martial' },
  stealth:     { name: 'Stealth',      attr: 'dex', domain: 'martial' },
  social:      { name: 'Social',       attr: 'cha', domain: 'social' },
  survival:    { name: 'Survival',     attr: 'wis', domain: 'social' },
  animals:     { name: 'Animals',      attr: 'wis', domain: 'craft' },
};
export const SKILL_IDS = Object.keys(SKILLS);
export const PASSIONS = ['none', 'none', 'none', 'minor', 'minor', 'burning'];
export const PASSION_XP = { none: 0.55, minor: 1.1, burning: 1.9 };
export const PASSION_MOOD = { none: 0, minor: 2, burning: 5 };

// --- Ancestries -------------------------------------------------------------
// hostility is a bias added to the universal hostility meter, not a hard flag.
export const RACES = {
  human:    { name: 'Human',     attr: {},                                  hostility: 0,  speed: 1.00, hp: 0, traits: ['adaptable'],      tags: ['civil'],   glyph: '@', color: '#d9c3a0' },
  dwarf:    { name: 'Dwarf',     attr: { con: 2, str: 1, dex: -1 },         hostility: 2,  speed: 0.92, hp: 4, traits: ['stoneborn'],      tags: ['civil'],   glyph: 'D', color: '#c98f5a' },
  elf:      { name: 'Elf',       attr: { dex: 2, int: 1, con: -1 },         hostility: -2, speed: 1.08, hp: -2, traits: ['keen_senses'],   tags: ['civil'],   glyph: 'E', color: '#9fd6b0' },
  halfling: { name: 'Halfling',  attr: { dex: 2, cha: 1, str: -2 },         hostility: -6, speed: 1.02, hp: -3, traits: ['lucky'],         tags: ['civil'],   glyph: 'h', color: '#e6d27a' },
  gnome:    { name: 'Gnome',     attr: { int: 2, dex: 1, str: -2 },         hostility: -4, speed: 0.96, hp: -3, traits: ['tinkerer'],      tags: ['civil'],   glyph: 'g', color: '#b7a7e0' },
  orc:      { name: 'Orc',       attr: { str: 3, con: 1, int: -1, cha: -1 },hostility: 14, speed: 1.02, hp: 5, traits: ['bloodthirst'],    tags: ['civil','raider'], glyph: 'O', color: '#7fa05a' },
  goblin:   { name: 'Goblin',    attr: { dex: 2, con: -1, cha: -2 },        hostility: 22, speed: 1.10, hp: -3, traits: ['skulker'],       tags: ['raider','vermin'], glyph: 'k', color: '#8fbf5a' },
  kobold:   { name: 'Kobold',    attr: { dex: 3, str: -2, con: -1 },        hostility: 18, speed: 1.12, hp: -4, traits: ['trapwise'],      tags: ['raider','vermin'], glyph: 'r', color: '#c47a4a' },
  tiefling: { name: 'Tiefling',  attr: { cha: 2, int: 1, wis: -1 },         hostility: 8,  speed: 1.00, hp: 0, traits: ['infernal_blood'], tags: ['civil','fiend'], glyph: 'T', color: '#d1607a' },
  dragonkin:{ name: 'Dragonkin', attr: { str: 2, cha: 2, dex: -1 },         hostility: 10, speed: 0.98, hp: 3, traits: ['scaled_hide'],    tags: ['civil','draconic'], glyph: 'Y', color: '#dba14a' },
  undead:   { name: 'Risen',     attr: { con: 2, str: 1, cha: -4, wis: -2 },hostility: 42, speed: 0.80, hp: 6, traits: ['deathless'],      tags: ['undead','mindless'], glyph: 'z', color: '#9aa8b5' },
  aberrant: { name: 'Aberrant',  attr: { int: 2, con: 2, cha: -3 },         hostility: 46, speed: 0.90, hp: 8, traits: ['alien_mind'],     tags: ['aberration','mindless'], glyph: 'Q', color: '#b06ad0' },
  beast:    { name: 'Beast',     attr: { str: 2, dex: 2, int: -5, cha: -3 },hostility: 34, speed: 1.16, hp: 2, traits: ['feral'],          tags: ['beast','mindless'], glyph: 'w', color: '#a08060' },
  construct:{ name: 'Construct', attr: { str: 3, con: 4, dex: -2, cha: -4, wis: -2 }, hostility: 38, speed: 0.78, hp: 12, traits: ['unliving'], tags: ['construct','mindless'], glyph: '&', color: '#8f9aa8' },
};
export const RACE_IDS = Object.keys(RACES);
export const PLAYABLE_RACES = RACE_IDS.filter(r => RACES[r].tags.includes('civil'));

// --- Classes ----------------------------------------------------------------
// role drives targeting/aggro in expedition combat; skills seed starting levels.
export const CLASSES = {
  fighter:   { name: 'Fighter',    hitDie: 10, primary: 'str', role: 'front',  skills: { melee: 4, construction: 1, survival: 1 }, abilities: ['cleave', 'second_wind'], hostility: 2 },
  barbarian: { name: 'Barbarian',  hitDie: 12, primary: 'str', role: 'front',  skills: { melee: 4, mining: 2, survival: 2 },       abilities: ['rage', 'reckless'],      hostility: 10 },
  paladin:   { name: 'Paladin',    hitDie: 10, primary: 'cha', role: 'front',  skills: { melee: 3, faith: 3, social: 1 },          abilities: ['smite', 'lay_hands'],    hostility: -6 },
  rogue:     { name: 'Rogue',      hitDie: 8,  primary: 'dex', role: 'flank',  skills: { stealth: 4, melee: 2, ranged: 2 },        abilities: ['backstab', 'vanish'],    hostility: 6 },
  ranger:    { name: 'Ranger',     hitDie: 10, primary: 'dex', role: 'back',   skills: { ranged: 4, survival: 3, stealth: 2, animals: 3 },     abilities: ['volley', 'mark'],        hostility: 0 },
  monk:      { name: 'Monk',       hitDie: 8,  primary: 'dex', role: 'flank',  skills: { melee: 3, stealth: 2, faith: 2 },         abilities: ['flurry', 'stillness'],   hostility: -4 },
  wizard:    { name: 'Wizard',     hitDie: 6,  primary: 'int', role: 'back',   skills: { arcana: 5, research: 3, alchemy: 1 },     abilities: ['firebolt', 'blast'],     hostility: 0 },
  warlock:   { name: 'Warlock',    hitDie: 8,  primary: 'cha', role: 'back',   skills: { arcana: 4, social: 2, stealth: 1 },       abilities: ['hex', 'drain'],          hostility: 12 },
  cleric:    { name: 'Cleric',     hitDie: 8,  primary: 'wis', role: 'support',skills: { faith: 4, medicine: 3, social: 1 },       abilities: ['mend', 'bless'],         hostility: -8 },
  druid:     { name: 'Druid',      hitDie: 8,  primary: 'wis', role: 'support',skills: { faith: 3, farming: 3, survival: 3, animals: 4 },      abilities: ['regrowth', 'thorns'],    hostility: -2 },
  bard:      { name: 'Bard',       hitDie: 8,  primary: 'cha', role: 'support',skills: { social: 5, arcana: 2, stealth: 1 },       abilities: ['inspire', 'discord'],    hostility: -4 },
  artificer: { name: 'Artificer',  hitDie: 8,  primary: 'int', role: 'back',   skills: { smithing: 4, research: 3, alchemy: 2 },   abilities: ['turret', 'overcharge'],  hostility: 0 },
  // Non-adventurer archetypes: common folk. Still full NPCs.
  laborer:   { name: 'Laborer',    hitDie: 8,  primary: 'con', role: 'front',  skills: { mining: 3, hauling: 3, construction: 2, animals: 1 }, abilities: ['dig_in'],                hostility: 0 },
  artisan:   { name: 'Artisan',    hitDie: 6,  primary: 'dex', role: 'back',   skills: { smithing: 3, construction: 3, cooking: 2 }, abilities: ['improvise'],           hostility: -2 },
  scholar:   { name: 'Scholar',    hitDie: 6,  primary: 'int', role: 'back',   skills: { research: 4, medicine: 2, arcana: 2 },    abilities: ['analyze'],               hostility: -2 },
  brute:     { name: 'Brute',      hitDie: 10, primary: 'str', role: 'front',  skills: { melee: 3, hauling: 2 },                   abilities: ['slam'],                  hostility: 16 },
  shaman:    { name: 'Shaman',     hitDie: 8,  primary: 'wis', role: 'support',skills: { faith: 3, alchemy: 2, survival: 2 },      abilities: ['mend', 'hex'],           hostility: 8 },
};
export const CLASS_IDS = Object.keys(CLASSES);
export const ADVENTURER_CLASSES = ['fighter','barbarian','paladin','rogue','ranger','monk','wizard','warlock','cleric','druid','bard','artificer'];
export const COMMONER_CLASSES = ['laborer','artisan','scholar','brute','shaman'];

// --- Abilities --------------------------------------------------------------
// kind:  attack | aoe | heal | buff | debuff
// shape: single | front (the enemy front row) | all | self | ally | party
// range: melee (front row only, unless reach/dive) | ranged (any row)
// dmg:   'weapon' uses the wielded weapon's damage type, else a DAMAGE_TYPES id
// spell: 'arcane' | 'divine' — can be silenced, and interrupted mid-windup
// apply: [[status, chance, stacks|rounds, target?]] riders; target 'self' | 'party'
// windup: rounds of telegraph before it lands (interruptible)
export const ABILITIES = {
  cleave:     { name: 'Cleave',       kind: 'aoe',    shape: 'front', range: 'melee',  dmg: 'weapon', cd: 3, power: 0.70, stat: 'melee',  desc: 'Strikes the whole enemy front row.' },
  second_wind:{ name: 'Second Wind',  kind: 'heal',   shape: 'self',  cd: 6, power: 0.50, stat: 'melee',  desc: 'Recover own wounds.' },
  rage:       { name: 'Rage',         kind: 'buff',   shape: 'self',  cd: 6, power: 0.45, stat: 'melee',  apply: [['empower', 1, 3], ['physres', 1, 3]], desc: 'More damage; shrug off physical blows.' },
  reckless:   { name: 'Reckless Blow',kind: 'attack', shape: 'single',range: 'melee',  dmg: 'weapon', cd: 2, power: 1.55, stat: 'melee',  risky: true, desc: 'Huge hit, opens guard.' },
  smite:      { name: 'Divine Smite', kind: 'attack', shape: 'single',range: 'melee',  dmg: 'holy',   cd: 4, power: 1.60, stat: 'faith',  spell: 'divine', bonusVs: { undead: 1.5, fiend: 1.5 }, desc: 'Radiant burst on one foe; brutal against the dead and the damned.' },
  lay_hands:  { name: 'Lay on Hands', kind: 'heal',   shape: 'ally',  cd: 5, power: 0.75, stat: 'faith',  spell: 'divine', desc: 'Heal the most wounded ally.' },
  backstab:   { name: 'Backstab',     kind: 'attack', shape: 'single',range: 'melee',  dmg: 'weapon', cd: 3, power: 1.85, stat: 'stealth',prefer: 'back', dive: true, helpless: true, desc: 'Slips past the line to the back row. Crits the helpless.' },
  vanish:     { name: 'Vanish',       kind: 'buff',   shape: 'self',  cd: 7, power: 0.60, stat: 'stealth',apply: [['stealth', 1, 2]], desc: 'Become untargetable; the next strike crits.' },
  volley:     { name: 'Volley',       kind: 'aoe',    shape: 'all',   range: 'ranged', dmg: 'pierce', cd: 4, power: 0.65, stat: 'ranged', desc: 'Arrows across the whole enemy side.' },
  mark:       { name: 'Hunter\'s Mark',kind:'debuff', shape: 'single',range: 'ranged', cd: 5, power: 0.40, stat: 'ranged', apply: [['vulnerable', 1, 3]], desc: 'Target takes more damage and is easier to hit.' },
  flurry:     { name: 'Flurry',       kind: 'attack', shape: 'single',range: 'melee',  dmg: 'crush',  cd: 2, power: 1.35, stat: 'melee',  hits: 3, desc: 'Three fast strikes.' },
  stillness:  { name: 'Stillness',    kind: 'buff',   shape: 'self',  cd: 6, power: 0.50, stat: 'faith',  apply: [['evasive', 1, 2], ['regen', 1, 3]], desc: 'Dodge and recover.' },
  firebolt:   { name: 'Firebolt',     kind: 'attack', shape: 'single',range: 'ranged', dmg: 'fire',   cd: 1, power: 1.20, stat: 'arcana', spell: 'arcane', apply: [['burn', 0.25, 3]], desc: 'Reliable fire; may set the target alight.' },
  blast:      { name: 'Arcane Blast', kind: 'aoe',    shape: 'all',   range: 'ranged', dmg: 'arcane', cd: 5, power: 1.05, stat: 'arcana', spell: 'arcane', windup: 1, desc: 'Gathers for a round, then detonates across the room.' },
  hex:        { name: 'Hex',          kind: 'debuff', shape: 'single',range: 'ranged', cd: 4, power: 0.55, stat: 'arcana', spell: 'arcane', apply: [['weaken', 1, 3], ['vulnerable', 1, 3]], desc: 'Weakens a foe badly.' },
  drain:      { name: 'Life Drain',   kind: 'attack', shape: 'single',range: 'ranged', dmg: 'shadow', cd: 3, power: 1.10, stat: 'arcana', spell: 'arcane', leech: 0.6, desc: 'Shadow damage that heals the caster.' },
  mend:       { name: 'Mend Wounds',  kind: 'heal',   shape: 'ally',  cd: 2, power: 0.60, stat: 'faith',  spell: 'divine', desc: 'Heal the most wounded ally.' },
  bless:      { name: 'Bless',        kind: 'buff',   shape: 'party', cd: 6, power: 0.35, stat: 'faith',  spell: 'divine', apply: [['inspired', 1, 3]], desc: 'Party accuracy and damage up.' },
  regrowth:   { name: 'Regrowth',     kind: 'heal',   shape: 'party', cd: 4, power: 0.45, stat: 'faith',  spell: 'divine', apply: [['regen', 1, 3, 'party']], desc: 'Heals the whole party, and keeps healing.' },
  thorns:     { name: 'Thornwhip',    kind: 'attack', shape: 'single',range: 'ranged', dmg: 'nature', cd: 2, power: 1.15, stat: 'faith',  spell: 'divine', apply: [['poison', 0.6, 2]], grounds: true, desc: 'Lashing vine: poisons, and drags fliers down.' },
  inspire:    { name: 'Inspire',      kind: 'buff',   shape: 'party', cd: 5, power: 0.40, stat: 'social', spell: 'arcane', apply: [['inspired', 1, 3]], desc: 'Party morale and damage up.' },
  discord:    { name: 'Discord',      kind: 'debuff', shape: 'all',   range: 'ranged', cd: 4, power: 0.50, stat: 'social', spell: 'arcane', apply: [['weaken', 0.6, 2]], desc: 'Enemies fight poorly.' },
  turret:     { name: 'Spark Turret', kind: 'buff',   shape: 'self',  cd: 6, power: 0.55, stat: 'smithing', spell: 'arcane', turret: 'storm', desc: 'A turret zaps a foe every round.' },
  overcharge: { name: 'Overcharge',   kind: 'attack', shape: 'single',range: 'ranged', dmg: 'storm',  cd: 4, power: 1.50, stat: 'smithing', spell: 'arcane', risky: true, apply: [['shock', 0.5, 2]], desc: 'Unstable heavy storm damage.' },
  dig_in:     { name: 'Dig In',       kind: 'buff',   shape: 'self',  cd: 5, power: 0.40, stat: 'hauling', apply: [['fortify', 1, 3]], desc: 'Brace for punishment.' },
  improvise:  { name: 'Improvise',    kind: 'attack', shape: 'single',range: 'melee',  dmg: 'weapon', cd: 2, power: 1.00, stat: 'smithing', desc: 'Swing whatever is at hand.' },
  analyze:    { name: 'Analyze',      kind: 'debuff', shape: 'single',range: 'ranged', cd: 4, power: 0.45, stat: 'research', apply: [['sunder', 1, 3], ['vulnerable', 0.5, 2]], desc: 'Exposes a weak point.' },
  slam:       { name: 'Slam',         kind: 'attack', shape: 'single',range: 'melee',  dmg: 'crush',  cd: 2, power: 1.30, stat: 'melee',  apply: [['stun', 0.3, 1]], desc: 'Crushing overhead blow; may stun.' },
};

// --- Traits -----------------------------------------------------------------
// mods: work, mood, social, combat, hostility, move, learn, and skill.<id>
export const TRAITS = {
  adaptable:     { name: 'Adaptable',      mods: { learn: 0.12 }, desc: 'Learns any trade quickly.' },
  stoneborn:     { name: 'Stoneborn',      mods: { 'skill.mining': 3, 'skill.construction': 2, mood: 2 }, desc: 'At home under stone.' },
  keen_senses:   { name: 'Keen Senses',    mods: { 'skill.ranged': 2, combat: 0.05 }, desc: 'Nothing gets close unseen.' },
  lucky:         { name: 'Lucky',          mods: { combat: 0.08, luck: 0.15 }, desc: 'Fate keeps missing.' },
  tinkerer:      { name: 'Tinkerer',       mods: { 'skill.smithing': 2, 'skill.research': 2 }, desc: 'Always improving something.' },
  bloodthirst:   { name: 'Bloodthirsty',   mods: { combat: 0.12, hostility: 10, social: -0.1 }, desc: 'Calm only after a fight.' },
  skulker:       { name: 'Skulker',        mods: { 'skill.stealth': 3, combat: -0.05, hostility: 6 }, desc: 'Prefers the dark and the back.' },
  trapwise:      { name: 'Trapwise',       mods: { 'skill.stealth': 2, trap: 0.35 }, desc: 'Reads a corridor before entering.' },
  infernal_blood:{ name: 'Infernal Blood', mods: { 'skill.arcana': 2, hostility: 6, mood: -2 }, desc: 'Something old whispers.' },
  scaled_hide:   { name: 'Scaled Hide',    mods: { armor: 2, combat: 0.05 }, desc: 'Natural plating.' },
  deathless:     { name: 'Deathless',      mods: { armor: 1, mood: 0, hostility: 12, work: -0.2 }, desc: 'Does not tire, does not care.' },
  alien_mind:    { name: 'Alien Mind',     mods: { 'skill.arcana': 4, social: -0.5, hostility: 14 }, desc: 'Thinks in wrong directions.' },
  feral:         { name: 'Feral',          mods: { combat: 0.15, social: -0.6, work: -0.5, hostility: 12 }, desc: 'Untamed.' },
  unliving:      { name: 'Unliving',       mods: { armor: 3, work: -0.1, social: -0.7, hostility: 10 }, desc: 'Runs until broken.' },
  // Personality traits (procedural pool)
  industrious:   { name: 'Industrious',    mods: { work: 0.25, mood: -1 }, conflicts: ['slothful'], desc: 'Works through the bell.' },
  slothful:      { name: 'Slothful',       mods: { work: -0.25, mood: 3 }, conflicts: ['industrious'], desc: 'Paces itself. Generously.' },
  optimist:      { name: 'Optimist',       mods: { mood: 8 }, conflicts: ['pessimist','nihilist'], desc: 'Takes bad news lightly.' },
  pessimist:     { name: 'Pessimist',      mods: { mood: -8 }, conflicts: ['optimist'], desc: 'Expects the collapse.' },
  nihilist:      { name: 'Nihilist',       mods: { mood: -4, hostility: 6, social: -0.2 }, conflicts: ['optimist','devout'], desc: 'None of it matters.' },
  devout:        { name: 'Devout',         mods: { 'skill.faith': 3, mood: 4, hostility: -4 }, conflicts: ['nihilist'], desc: 'Prays, and means it.' },
  greedy:        { name: 'Greedy',         mods: { hostility: 8, loot: 0.2, social: -0.15 }, conflicts: ['ascetic'], desc: 'Counts the shares twice.' },
  ascetic:       { name: 'Ascetic',        mods: { mood: 5, loot: -0.15, needs: -0.3 }, conflicts: ['greedy'], desc: 'Needs almost nothing.' },
  brawler:       { name: 'Brawler',        mods: { 'skill.melee': 3, social: -0.2, hostility: 6 }, desc: 'Settles things directly.' },
  gentle:        { name: 'Gentle',         mods: { combat: -0.15, social: 0.3, hostility: -10 }, conflicts: ['brawler','bloodthirst'], desc: 'Would rather talk.' },
  charismatic:   { name: 'Charismatic',    mods: { social: 0.4, 'skill.social': 3 }, conflicts: ['abrasive'], desc: 'People want to agree.' },
  abrasive:      { name: 'Abrasive',       mods: { social: -0.4, hostility: 5 }, conflicts: ['charismatic'], desc: 'People want distance.' },
  night_owl:     { name: 'Night Owl',      mods: { nightWork: 0.3, dayWork: -0.1 }, conflicts: ['early_riser'], desc: 'Sharpest after dusk.' },
  early_riser:   { name: 'Early Riser',    mods: { dayWork: 0.2, nightWork: -0.2 }, conflicts: ['night_owl'], desc: 'Up before the torches.' },
  iron_gut:      { name: 'Iron Gut',       mods: { needs: -0.2, mood: 2 }, desc: 'Eats anything, twice.' },
  delicate:      { name: 'Delicate',       mods: { needs: 0.25, mood: -3, work: 0.1 }, conflicts: ['iron_gut'], desc: 'Fussy, but precise.' },
  scarred:       { name: 'Scarred',        mods: { armor: 1, mood: -2, hostility: 4 }, desc: 'Carries the last war.' },
  quick:         { name: 'Quick',          mods: { move: 0.25, combat: 0.05 }, conflicts: ['lumbering'], desc: 'Covers ground fast.' },
  lumbering:     { name: 'Lumbering',      mods: { move: -0.25, armor: 1 }, conflicts: ['quick'], desc: 'Slow, hard to move.' },
  scholarly:     { name: 'Scholarly',      mods: { 'skill.research': 4, 'skill.arcana': 2, work: -0.1 }, desc: 'Reads instead of resting.' },
  green_thumb:   { name: 'Green Thumb',    mods: { 'skill.farming': 4, mood: 2 }, desc: 'Things grow for them.' },
  beastfriend:   { name: 'Beast-friend',  mods: { 'skill.animals': 5, mood: 2, social: -0.05 }, desc: 'Animals settle around them.' },
  beastwary:     { name: 'Beast-wary',    mods: { 'skill.animals': -4 }, conflicts: ['beastfriend'], desc: 'Does not trust anything with teeth.' },
  butcher:       { name: 'Butcher',        mods: { 'skill.cooking': 3, combat: 0.08, social: -0.1 }, desc: 'Good with a blade, either use.' },
  pyromaniac:    { name: 'Pyromaniac',     mods: { 'skill.arcana': 2, hostility: 8, mood: 2, incident: 0.3 }, desc: 'Fire is a friend.' },
  coward:        { name: 'Coward',         mods: { combat: -0.2, flee: 0.4, mood: -2 }, conflicts: ['fearless'], desc: 'Leaves early, lives long.' },
  fearless:      { name: 'Fearless',       mods: { combat: 0.1, flee: -0.5 }, conflicts: ['coward'], desc: 'Will not break.' },
  vengeful:      { name: 'Vengeful',       mods: { hostility: 12, combat: 0.1, social: -0.25 }, desc: 'Keeps a ledger.' },
  loyal:         { name: 'Loyal',          mods: { hostility: -12, social: 0.2, mood: 2 }, conflicts: ['vengeful'], desc: 'Stays when it is bad.' },
  claustrophobe: { name: 'Claustrophobe',  mods: { mood: -4, dungeonMood: -8 }, desc: 'Hates the deep.' },
  delver:        { name: 'Delver',         mods: { dungeonMood: 8, 'skill.survival': 2, loot: 0.1 }, conflicts: ['claustrophobe'], desc: 'Only alive underground.' },
};
export const TRAIT_IDS = Object.keys(TRAITS);
export const PERSONALITY_TRAITS = ['beastfriend','beastwary','industrious','slothful','optimist','pessimist','nihilist','devout','greedy','ascetic','brawler','gentle','charismatic','abrasive','night_owl','early_riser','iron_gut','delicate','scarred','quick','lumbering','scholarly','green_thumb','butcher','pyromaniac','coward','fearless','vengeful','loyal','claustrophobe','delver','tinkerer','lucky','trapwise'];

// --- Backgrounds ------------------------------------------------------------
export const BACKGROUNDS = {
  street:    { name: 'Gutter-born',   skills: { stealth: 2, social: 1 }, hostility: 6 },
  guild:     { name: 'Guild Trained', skills: { smithing: 2, construction: 1 }, hostility: -2 },
  farmstead: { name: 'Farmstead',     skills: { farming: 3, survival: 1, animals: 3 }, hostility: -4 },
  temple:    { size: [3, 3], walled: true, name: 'Temple Ward',   skills: { faith: 2, medicine: 2 }, hostility: -6 },
  academy:   { name: 'Academy',       skills: { research: 3, arcana: 2 }, hostility: -2 },
  mercenary: { name: 'Mercenary',     skills: { melee: 3, ranged: 1 }, hostility: 8 },
  exile:     { name: 'Exile',         skills: { survival: 3, stealth: 1 }, hostility: 10 },
  noble:     { name: 'Fallen Noble',  skills: { social: 3, melee: 1 }, hostility: 0 },
  miner:     { name: 'Deep Miner',    skills: { mining: 3, hauling: 2 }, hostility: 0 },
  cultist:   { name: 'Cult Remnant',  skills: { arcana: 2, faith: 2 }, hostility: 18 },
  feral_born:{ name: 'Beast-raised',  skills: { survival: 3, melee: 2, animals: 4 }, hostility: 14 },
  none:      { name: 'Unremembered',  skills: {}, hostility: 4 },
};
export const BACKGROUND_IDS = Object.keys(BACKGROUNDS);

// --- Factions ---------------------------------------------------------------
// Faction sets the base of the hostility meter; the same generator produces
// colonists, traders, raiders and dungeon denizens from these.
export const FACTIONS = {
  colony:     { name: 'Rift Camp',        base: 4,  spread: 6,  races: ['human','dwarf','elf','halfling','gnome','tiefling','dragonkin','orc'], classes: null },
  wanderers:  { name: 'Wanderers',       base: 28, spread: 18, races: ['human','elf','halfling','gnome','tiefling'], classes: null },
  merchants:  { name: 'Coin Circuit',    base: 24, spread: 12, races: ['human','dwarf','halfling','gnome'], classes: ['artisan','scholar','bard','rogue'] },
  outlaws:    { name: 'Ash Company',     base: 62, spread: 16, races: ['human','orc','goblin','tiefling'], classes: ['rogue','fighter','brute','warlock','ranger'] },
  warband:    { name: 'Gorehand Warband',base: 76, spread: 12, races: ['orc','goblin','kobold','human'], classes: ['barbarian','brute','shaman','fighter'] },
  cult:       { name: 'The Sunken Choir', base: 82, spread: 10, races: ['human','tiefling','undead','aberrant'], classes: ['warlock','cleric','shaman','scholar'] },
  wild:       { name: 'Deep Wild',       base: 70, spread: 20, races: ['beast','goblin','kobold'], classes: ['brute','ranger','laborer'] },
  dead:       { name: 'The Unquiet',     base: 90, spread: 8,  races: ['undead','aberrant','construct'], classes: ['brute','warlock','fighter','shaman'] },
};
export const FACTION_IDS = Object.keys(FACTIONS);

// --- Resources --------------------------------------------------------------
export const RESOURCES = {
  food:     { name: 'Food',      color: '#8fbf5a', cat: 'basic' },
  wood:     { name: 'Wood',      color: '#a87c4a', cat: 'basic' },
  stone:    { name: 'Stone',     color: '#9aa3ad', cat: 'basic' },
  iron:     { name: 'Iron',      color: '#c0c6cc', cat: 'refined' },
  leather:  { name: 'Leather',   color: '#b4794a', cat: 'refined' },
  cloth:    { name: 'Cloth',     color: '#d8c7b0', cat: 'refined' },
  herbs:    { name: 'Herbs',     color: '#6fcf97', cat: 'refined' },
  gold:     { name: 'Gold',      color: '#e2b23c', cat: 'wealth' },
  gems:     { name: 'Gems',      color: '#6ad0e0', cat: 'wealth' },
  dust:     { name: 'Arcane Dust', color: '#b07ae0', cat: 'arcane' },
  relics:   { name: 'Relics',    color: '#e07a9a', cat: 'arcane' },
  riftshard: { name: 'Rift Shards', color: '#d25a9a', cat: 'arcane' },   // only below floor 1: carried out, they feed research
  knowledge:{ name: 'Insight',   color: '#7aa8e0', cat: 'arcane' },
  meal:     { name: 'Meals',     color: '#e0a86a', cat: 'goods' },
  gear:     { name: 'Gear Kits', color: '#b0b8c0', cat: 'goods' },
  potion:   { name: 'Potions',   color: '#e06ab0', cat: 'goods' },
};
export const RESOURCE_IDS = Object.keys(RESOURCES);
// Where a resource comes from and what spends it, beyond what the data already
// says (veins, recipes, crops and building costs are read off their tables).
// Shown on every resource tooltip so "where does gold come from?" has an answer.
export const RESOURCE_SOURCES = {
  gold: ['🐫 Selling to caravans (World › Market) — most of a young camp\'s gold', '🌀 Rift loot, carried home', '🪙 Gold veins, mined', '🏪 Your own shops, once built'],
  iron: ['⛏️ Iron veins', '🌀 Rift loot (mines and forges below)', '🐫 Caravans'],
  gems: ['⛏️ Gem seams', '🌀 Rift loot'],
  dust: ['⛏️ Crystal seams', '🌀 Rift loot (sanctums, hives)'],
  relics: ['🌀 Rift loot and lair hoards'],
  riftshard: ['🌀 Only below floor 1, and from lairs'],
  leather: ['🔪 Butchering livestock', '🌀 Rift loot (warrens, hollows)', '⚒️ Worked Goods'],
  knowledge: ['📚 Researchers at a Library', '💠 Rift shards carried home'],
  potion: ['⚗️ An Alchemy Table', '🏪 The Apothecary'],
};
export const RESOURCE_USES = {
  gold: ['🏗️ Shops and big buildings', '🧪 Potions and gear from shops', '🚪 Recruits at the gate', '📅 Wages for classed colonists and sellswords'],
  leather: ['⚒️ Forge tiers (leather armour)', '🎒 Packs: more loot carried per delver'],
  riftshard: ['📖 Turned into research when carried home'],
  knowledge: ['🔬 Research'],
  relics: ['🐫 Sold to caravans', '🏛️ Late wonders (Reliquary, Monument)'],
  potion: ['🌀 Carried into the Rift: healing mid-fight'],
  meal: ['🍽️ Eating — worth more than raw food'],
  gear: ['⚒️ Forging and upgrading equipment'],
};

// --- Buildings --------------------------------------------------------------
// cat groups them in the build bar. work = build effort in work-units.
// size: [w, h] tiles (default 1x1). walled: the footprint is a house — solid
// walls all round with one door in the middle of its front (south) wall, so a
// shop or hall needs no walls of its own. Work happens at the door.
export const BUILDINGS = {
  wall:      { name: 'Wall',            cat: 'structure', cost: { stone: 5 },              work: 30,  solid: true,  glyph: '#', desc: 'Blocks movement. Encloses rooms.' },
  door:      { name: 'Door',            cat: 'structure', cost: { wood: 5 },               work: 25,  solid: false, glyph: '+', desc: 'Passable, keeps a room sealed.' },
  bed:       { name: 'Bed',             cat: 'comfort',   cost: { wood: 12, cloth: 4 },    work: 40,  solid: false, glyph: 'b', rest: 1.6, desc: 'Restores rest far faster.' },
  table:     { name: 'Table',           cat: 'comfort',   cost: { wood: 15 },              work: 35,  solid: false, glyph: 'T', joy: 1.0, desc: 'Eating here lifts mood.' },
  brazier:   { name: 'Brazier',         cat: 'comfort',   cost: { stone: 6, wood: 4 },     work: 20,  solid: false, glyph: 'i', light: 6, beauty: 2, desc: 'Light and warmth.' },
  statue:    { name: 'Statue',          cat: 'comfort',   cost: { stone: 25, gold: 5 },    work: 70,  solid: true,  glyph: 'S', beauty: 12, desc: 'Big beauty radius.' },
  tavern:    { size: [3, 2], walled: true, name: 'Tavern',    cat: 'comfort',   cost: { wood: 30, food: 10 },    work: 80,  solid: false, glyph: 'U', joy: 2.2, social: 1.5, desc: 'Drives socialising and joy.' },
  stockpile: { name: 'Stockpile',       cat: 'logistics', cost: { wood: 3 },               work: 10,  solid: false, glyph: '=', storage: 60, desc: 'Adds storage capacity.' },
  farm:      { name: 'Farm Plot',       cat: 'farm',      cost: { wood: 4 },               work: 22,  solid: false, glyph: '"', job: 'farm', desc: 'Grows food over time.' },
  mushroom:  { name: 'Fungus Bed',      cat: 'farm',      cost: { wood: 6, herbs: 2 },     work: 30,  solid: false, glyph: ',', job: 'farm', yield: 1.35, dark: true, desc: 'Food that grows in the dark.' },
  kitchen:   { name: 'Cookfire',        cat: 'production',cost: { stone: 12, wood: 8 },    work: 45,  solid: false, glyph: 'c', job: 'cook', desc: 'Turns raw food into meals.' },
  carpenter: { name: 'Carpenter Bench', cat: 'production',cost: { wood: 20, stone: 5 },    work: 50,  solid: false, glyph: 'n', job: 'craft', recipe: 'planks', desc: 'Makes cloth and worked goods.' },
  smithy:    { size: [2, 2], walled: true, name: 'Smithy',          cat: 'production',cost: { stone: 25, iron: 8 },    work: 80,  solid: false, glyph: 'm', job: 'craft', recipe: 'gear', desc: 'Forges weapons and armour.' },
  alchemy:   { name: 'Alchemy Table',   cat: 'production',cost: { wood: 15, gems: 3, herbs: 5 }, work: 70, solid: false, glyph: 'a', job: 'craft', recipe: 'potion', desc: 'Brews potions from herbs.' },
  library:   { size: [3, 2], walled: true, name: 'Library',         cat: 'production',cost: { wood: 30, stone: 10 }, work: 90, solid: false, glyph: 'L', job: 'research', desc: 'Generates Insight for research.' },
  infirmary: { size: [3, 2], walled: true, name: 'Infirmary',       cat: 'production',cost: { wood: 18, cloth: 8, herbs: 4 }, work: 60, solid: false, glyph: 'h', job: 'heal', desc: 'Treats wounds much faster.' },
  training:  { name: 'Training Dummy',  cat: 'martial',   cost: { wood: 12, leather: 4 },  work: 40,  solid: false, glyph: 'x', job: 'train', desc: 'Peasants drill here until they are strong or quick enough for a Combat class. Classed fighters sharpen Melee and Marksman.' },
  shrine:    { name: 'Shrine',          cat: 'martial',   cost: { stone: 20, gold: 8 },    work: 65,  solid: false, glyph: 'A', job: 'pray', beauty: 6, desc: 'Faith training, mood buffer.' },
  barricade: { name: 'Barricade',       cat: 'martial',   cost: { wood: 8, stone: 4 },     work: 25,  solid: true,  glyph: 'X', hp: 240, desc: 'Cheap defensive block.' },
  watchpost: { name: 'Watchpost',       cat: 'martial',   cost: { wood: 15, stone: 10 },   work: 55,  solid: false, glyph: 'V', watch: 1, desc: 'Earlier raid warning, defence bonus.' },
  pasture:   { name: 'Pasture Post',    cat: 'farm',      cost: { wood: 10 },              work: 30,  solid: false, glyph: 'п', desc: 'Marks grazing ground. Holds 4 head of stock.' },
  barn:      { size: [3, 3], walled: true, name: 'Barn',            cat: 'farm',      cost: { wood: 35, stone: 10 },   work: 90,  solid: false, glyph: 'B', desc: 'Shelter for 8 more head, and better yields.' },
  trough:    { name: 'Feed Trough',     cat: 'farm',      cost: { wood: 12, stone: 4 },    work: 30,  solid: false, glyph: 'u', desc: 'Lets stock eat from stores when grazing is thin.' },
  butchery:  { name: 'Butcher Block',   cat: 'farm',      cost: { wood: 15, iron: 4 },     work: 45,  solid: false, glyph: 'Ϟ', job: 'butcher', desc: 'Slaughter stock for meat and hide.' },
  compost:   { name: 'Compost Heap',    cat: 'farm',      cost: { wood: 8 },               work: 25,  solid: false, glyph: 'o', job: 'compost', desc: 'Restores fertility to nearby fields.' },
  field:     { name: 'Field',           cat: 'farm',      cost: { wood: 4 },               work: 22,  solid: false, glyph: '\u2261', job: 'farm', desc: 'Plant a crop. Yield depends on soil, water and season.' },
  combat_school:    { size: [3, 3], walled: true, name: 'Combat School',    cat: 'martial',    cost: { wood: 40, stone: 30, iron: 4 },            work: 140, solid: false, glyph: 'C', school: 'combat', desc: 'Trains commoners into Fighters, Barbarians, Rogues, Rangers and Monks. Class XP up to level 10.' },
  mage_school:      { size: [3, 3], walled: true, name: 'Mage School',      cat: 'martial',    cost: { wood: 40, stone: 30, dust: 15, gems: 5 },   work: 150, solid: false, glyph: 'M', school: 'mage', desc: 'Trains Wizards, Warlocks, Bards and Artificers. Class XP up to level 10.' },
  temple:           { name: 'Temple',           cat: 'martial',    cost: { stone: 50, wood: 20, gold: 15 },            work: 150, solid: false, glyph: 'T', school: 'temple', beauty: 4, desc: 'Trains Clerics, Druids and Paladins. Class XP up to level 10.' },
  knight_academy:   { size: [4, 3], walled: true, name: 'Knight Academy',   cat: 'martial',    cost: { stone: 120, iron: 40, gold: 20 },           work: 260, solid: false, glyph: 'K', school: 'combat', academy: true, desc: 'Opens tiers 3–4 and prestige paths for combat classes. Class XP up to level 20.' },
  wizardry_academy: { size: [4, 3], walled: true, name: 'Wizardry Academy', cat: 'martial',    cost: { stone: 80, dust: 40, gems: 15, relics: 10 }, work: 280, solid: false, glyph: 'W', school: 'mage', academy: true, desc: 'Opens tiers 3–4 and prestige paths for arcane classes. Class XP up to level 20.' },
  cathedral:        { size: [4, 3], walled: true, name: 'Cathedral',        cat: 'martial',    cost: { stone: 140, gold: 40, relics: 8 },          work: 280, solid: false, glyph: 'H', school: 'temple', academy: true, beauty: 10, desc: 'Opens tiers 3–4 and prestige paths for divine classes. Class XP up to level 20.' },
  spellmason:       { size: [3, 2], walled: true, name: 'Spellmason',       cat: 'production', cost: { wood: 30, stone: 20, dust: 20 },            work: 120, solid: false, glyph: 'S', desc: 'A shop for scrolls and spellbooks. Copies any spellbook you own.' },
  magic_lab:        { size: [3, 2], walled: true, name: 'Magic Lab',        cat: 'production', cost: { stone: 40, gems: 10, dust: 30 },            work: 180, solid: false, glyph: 'L', desc: 'Design your own spells from researched parts and write them into books.' },
  reliquary: { size: [2, 2], walled: true, name: 'Reliquary',       cat: 'martial',   cost: { stone: 30, relics: 3, gold: 20 }, work: 120, solid: false, glyph: 'R', beauty: 10, relicPower: 1, desc: 'Converts relics into lasting power.' },

  // --- defense and decor -----------------------------------------------------
  fence:      { name: 'Fence',           cat: 'structure', cost: { wood: 3 },                       work: 15,  solid: true,  hp: 80,  glyph: '|', beauty: 0.5, desc: 'A cheap timber line. Blocks like a wall, costs a fraction as much.' },
  palisade:   { name: 'Palisade',        cat: 'structure', cost: { wood: 4, stone: 3 },              work: 35,  solid: true,  hp: 200, glyph: ']', beauty: 1,   desc: 'Stone-braced fence. Sturdier than a wall, cheaper than one.' },
  banner:     { name: 'Banner',          cat: 'comfort',   cost: { cloth: 4, wood: 2 },              work: 12,  solid: false, glyph: '!', beauty: 2,   desc: 'The cheapest beauty there is.' },
  lamppost:   { name: 'Lamppost',        cat: 'comfort',   cost: { iron: 4, stone: 2 },              work: 15,  solid: false, glyph: '`', light: 3, beauty: 0.5, desc: 'Light without a fire — for corridors and yards.' },
  statuette:  { name: 'Statuette',       cat: 'comfort',   cost: { stone: 10 },                      work: 30,  solid: false, glyph: 's', beauty: 4,   desc: 'A small statue, for when the big one isn’t affordable yet.' },
  monument:   { size: [2, 2], name: 'Monument',        cat: 'comfort',   cost: { stone: 60, gold: 25, relics: 5 }, work: 220, solid: true,  unique: true, glyph: 'M', beauty: 20, desc: 'The centrepiece the whole camp is built around. One per hold.' },
  turret_ballista: { name: 'Ballista Turret', cat: 'martial', cost: { wood: 20, iron: 15 },           work: 90,  solid: true, hp: 180, glyph: 't', desc: 'A physical ranged defender. Fights in night sieges.' },
  turret_arcane:   { name: 'Arcane Turret',   cat: 'martial', cost: { stone: 15, dust: 20, gems: 5 }, work: 130, solid: true, hp: 150, glyph: 'y', desc: 'A magic ranged defender — answers what the ballista resists.' },
  watchtower: { size: [2, 2], name: 'Watchtower',      cat: 'martial',   cost: { stone: 40, wood: 20, iron: 10 },  work: 160, solid: true,  glyph: '^', light: 2, beauty: 1, desc: 'A proper tower over the camp. Earlier raid warning, like the Watchpost.' },
  armory:     { size: [3, 2], walled: true, name: 'Armory',          cat: 'martial',   cost: { wood: 20, iron: 15, gold: 30 },   work: 80,  solid: false, glyph: 'a', shop: 'armory', desc: 'Racked weapons and spare armor near the fight. Strengthens the camp’s defence, and its counter buys and sells rarer gear.' },
  archive:    { size: [3, 2], walled: true, name: 'Archive',         cat: 'production',cost: { wood: 25, stone: 15, dust: 10 },  work: 100, solid: false, glyph: 'r', job: 'research', researchWork: 32, desc: 'A second desk for Insight — proper shelves, not a reading nook.' },
  observatory:{ size: [2, 2], walled: true, name: 'Observatory',     cat: 'production',cost: { stone: 30, dust: 15, gems: 5 },   work: 140, solid: false, glyph: 'O', job: 'research', researchWork: 26, desc: 'The best place in the hold to generate Insight.' },
  archery_range:{ size: [3, 2], name: 'Archery Range', cat: 'martial',   cost: { wood: 15, stone: 5 },             work: 60,  solid: false, glyph: 'b', job: 'train', trainSkill: 'ranged', desc: 'Always trains Marksman, unlike the Training Dummy’s coin flip.' },
  proving_grounds:{ size: [3, 3], name: 'Proving Grounds', cat: 'martial', cost: { stone: 30, iron: 15 },          work: 120, solid: false, glyph: 'P', job: 'train', trainWork: 40, desc: 'The Training Dummy’s upgrade: faster reps, faster levels.' },
  herbalist_hut:{ size: [2, 2], walled: true, name: 'Herbalist’s Hut', cat: 'production', cost: { wood: 10, herbs: 5 },      work: 50,  solid: false, glyph: 'h', beauty: 1.5, desc: 'Comes with Herbal Science’s +30% herb yield.' },

  // --- shops: where gold goes (docs/economy-plan.md) --------------------------
  apothecary:   { size: [3, 2], walled: true, name: 'Apothecary',     cat: 'production', cost: { wood: 20, stone: 10, herbs: 8, gold: 40 }, work: 70, solid: false, glyph: 'q', shop: 'apothecary', beauty: 1, desc: 'Buys and sells potions and rarer brews. Restocks every other day.' },
  trading_post: { size: [3, 2], walled: true, name: 'Trading Post',   cat: 'logistics',  cost: { wood: 30, stone: 10, gold: 50 },           work: 80, solid: false, glyph: '$', shop: 'trading_post', desc: 'Caravans come more often and pay better. Post standing orders for them to fill.' },
  counting_house:{ size: [3, 2], walled: true, name: 'Counting House', cat: 'logistics', cost: { stone: 40, iron: 10, gold: 80 },           work: 110, solid: false, glyph: '¢', shop: 'counting_house', desc: 'A strongroom: gold kept here is safe from raiders, and earns a little each week of peace.' },
  stable:       { size: [3, 3], walled: true, name: 'Stable',         cat: 'farm',       cost: { wood: 40, stone: 10, gold: 40 },           work: 90, solid: false, glyph: 'Ş', shop: 'stable', desc: 'Sells trained war and pack beasts, and livestock with good blood.' },

  // --- camp basics, available from the first day --------------------------
  timber_wall:{ name: 'Timber Wall',     cat: 'structure', cost: { wood: 4 },                      work: 20,  solid: true,  hp: 90,  glyph: '#', desc: 'A plank wall for before there is stone to spare. Joins stone walls and doors.' },
  rug:        { name: 'Rug',             cat: 'comfort',   cost: { cloth: 5 },                     work: 12,  solid: false, glyph: '~', beauty: 2.5, desc: 'Woven colour underfoot. Makes a bare room feel lived in.' },
  bedroll:    { name: 'Bedroll',         cat: 'comfort',   cost: { wood: 2, cloth: 3 },            work: 14,  solid: false, glyph: 'r', rest: 1.1, desc: 'A pallet on the ground. Better than the dirt, not as good as a bed.' },
  campfire:   { name: 'Campfire',        cat: 'comfort',   cost: { wood: 6, stone: 3 },            work: 16,  solid: false, glyph: '*', light: 5, beauty: 1, joy: 0.9, desc: 'Light, and somewhere to sit and swap stories when spirits are low.' },
  torch:      { name: 'Standing Torch',  cat: 'comfort',   cost: { wood: 2 },                      work: 8,   solid: false, glyph: 'j', light: 4, desc: 'The cheapest light there is. Keeps the dark off a path.' },
  planter:    { name: 'Flower Planter',  cat: 'comfort',   cost: { wood: 4, herbs: 1 },            work: 14,  solid: false, glyph: 'p', beauty: 3, desc: 'A box of wildflowers. Cheap beauty that doesn’t need a mason.' },
  bench:      { name: 'Bench',           cat: 'comfort',   cost: { wood: 6 },                      work: 14,  solid: false, glyph: '_', joy: 0.5, beauty: 0.5, desc: 'Somewhere to sit and do nothing for a while.' },
  game_table: { name: 'Gaming Table',    cat: 'comfort',   cost: { wood: 14, stone: 2 },           work: 40,  solid: false, glyph: 'g', joy: 1.4, beauty: 1, desc: 'Dice, cards and grudges. A better place to unwind than the dinner table.' },
  shelf:      { name: 'Storage Shelf',   cat: 'logistics', cost: { wood: 8 },                      work: 18,  solid: false, glyph: 'E', storage: 25, desc: 'Racks along a wall. A little storage in a little space.' },
  shed:       { size: [2, 2], walled: true, name: 'Storage Shed',    cat: 'logistics', cost: { wood: 24, stone: 8 },           work: 60,  solid: false, glyph: 'D', storage: 90, desc: 'A roofed store. Holds more than a stockpile, for more timber up front.' },
  well:       { name: 'Well',            cat: 'farm',      cost: { stone: 12, wood: 4 },           work: 50,  solid: true,  glyph: 'w', beauty: 1, irrigate: 5, desc: 'Waters the ground around it — fields within 5 tiles never go thirsty.' },
  scarecrow:  { name: 'Scarecrow',       cat: 'farm',      cost: { wood: 4, cloth: 2 },            work: 12,  solid: false, glyph: 'Y', guard: 4, desc: 'Keeps the birds off. Fields within 4 tiles yield 15% more.' },
  stakes:     { name: 'Stake Line',      cat: 'martial',   cost: { wood: 5 },                      work: 18,  solid: true,  hp: 110, glyph: 'v', desc: 'Sharpened stakes, angled outward. Slows a night wave at the line.' },
};
export const BUILDING_IDS = Object.keys(BUILDINGS);

// --- Floors -------------------------------------------------------------
// A separate layer from BUILDINGS: floors sit under a building rather than
// occupying the tile, so a room can be floored and furnished at once. `kind`
// names the render.js floor pattern; `speed` and `beauty` apply per tile, no
// radius falloff — it is what you are standing on, not a room's decor.
export const FLOORS = {
  wood:    { name: 'Wood Floor',    cost: { wood: 3 },            work: 10, speed: 0.15, beauty: 1,   kind: 'planks',  desc: 'Warm and cheap. A little kinder underfoot than bare dirt.' },
  stone:   { name: 'Flagstone',     cost: { stone: 2 },           work: 12, speed: 0.2,  beauty: 1,   kind: 'flags',   desc: 'Cleaner, faster floor.' },
  pebble:  { name: 'Pebble Floor',  cost: { stone: 1 },           work: 6,  speed: 0.08, beauty: 0.4, kind: 'pebble',  desc: 'Loose gravel, tamped down. The cheapest floor there is.' },
  crystal: { name: 'Crystal Floor', cost: { gems: 2, dust: 2 },   work: 20, speed: 0.3,  beauty: 4,   kind: 'crystal', desc: 'Polished arcane crystal. Glows faintly underfoot.' },
};
export const FLOOR_IDS = Object.keys(FLOORS);

// --- Recipes ----------------------------------------------------------------
export const RECIPES = {
  planks:  { name: 'Worked Goods', skill: 'construction', work: 60,  inputs: { wood: 8 },            outputs: { cloth: 4, leather: 2 } },
  gear:    { name: 'Forge Gear',   skill: 'smithing',     work: 110, inputs: { iron: 6, wood: 2 },   outputs: { gear: 1 } },
  potion:  { name: 'Brew Potions', skill: 'alchemy',      work: 90,  inputs: { herbs: 6, dust: 1 },  outputs: { potion: 2 } },
  meal:    { name: 'Cook Meals',   skill: 'cooking',      work: 45,  inputs: { food: 6 },            outputs: { meal: 4 } },
};

// --- Research ---------------------------------------------------------------
export const RESEARCH = {
  masonry:    { name: 'Masonry',          cost: 60,   req: [],             unlock: ['statue','barricade'],  desc: 'Better stonework.' },
  husbandry:  { name: 'Husbandry',        cost: 90,   req: [],             unlock: ['mushroom','tavern'],            bonus: { farmYield: 0.25 }, desc: 'Fungus farming, +25% crop yield.' },
  smelting:   { name: 'Smelting',         cost: 220,  req: ['masonry'],    unlock: ['smithy'],              desc: 'Iron becomes usable.' },
  herbalism:  { name: 'Herbalism',        cost: 320,  req: ['husbandry'],  unlock: ['alchemy','infirmary','apothecary'], bonus: { healRate: 0.4 }, desc: 'Potions and better medicine.' },
  letters:    { name: 'Letters',          cost: 180,  req: [],             unlock: ['library'],             bonus: { researchRate: 0.2 }, desc: 'Insight generation.' },
  drilling:   { name: 'Deep Drilling',    cost: 600,  req: ['smelting'],   unlock: [],                      bonus: { mineYield: 0.4 }, desc: '+40% mining yield.' },
  arcana1:    { name: 'Rift Lore',        cost: 420,  req: ['letters'],    unlock: [],                      bonus: { loot: 0.1, ward: 0.1 }, desc: 'Read the Rift: +10% loot, nightly waves 10% weaker.' },
  // Classes are the heart of the game, so the first school sits at the root of
  // the tree, one cheap project in (docs/progression-roadmap.md P0-1).
  militia:    { name: 'Militia',          cost: 100,  req: [],             unlock: ['training','combat_school'], desc: 'Combat classes: a Combat School to train Fighters, Barbarians, Rogues, Rangers and Monks, and a Training Dummy to drill peasants toward them.' },
  drill_corps:{ name: 'Drill Corps',      cost: 520,  req: ['militia', 'smelting'], unlock: ['watchpost'], bonus: { combat: 0.12 }, desc: 'Drilled militia: +12% combat, and watchposts to warn of raids.' },
  arcane_theory:{ name: 'Arcane Theory',  cost: 320,  req: ['letters'],    unlock: ['mage_school'],         desc: 'Magic can be taught. Opens the Mage School and the arcane peddlers.' },
  devotion:   { name: 'Devotion',         cost: 260,  req: [],             unlock: ['temple'],              desc: 'Faith, organised. Opens the Temple.' },
  martial_doctrine:{ name: 'Martial Doctrine', cost: 1000, req: ['drill_corps'], unlock: ['knight_academy'], desc: 'Knightly orders: tiers 3–4 for combat classes.' },
  high_arcana:{ name: 'High Arcana',      cost: 1100, req: ['arcane_theory', 'arcana1'], unlock: ['wizardry_academy', 'spellmason', 'magic_lab'], desc: 'The Wizardry Academy, the Spellmason and the Magic Lab.' },
  theology:   { name: 'Theology',         cost: 1000, req: ['devotion', 'wardstone'], unlock: ['cathedral'], desc: 'The Cathedral: tiers 3–4 for divine classes.' },
  wardstone:  { name: 'Wardstone',        cost: 800,  req: ['arcana1'],    unlock: ['shrine'],              bonus: { defence: 0.2 }, desc: 'Hold defence wards.' },
  relicry:    { name: 'Relic Binding',    cost: 1400,  req: ['wardstone'],  unlock: ['reliquary'],           bonus: { loot: 0.2 }, desc: 'Relics grant permanent power.' },
  deepmaps:   { name: 'Rift Cartography', cost: 1100,  req: ['arcana1'],    unlock: [],                      bonus: { loot: 0.15, ward: 0.1 }, desc: 'Map the shifting layers: +15% loot, waves 10% weaker.' },
  agriculture:{ name: 'Agriculture',      cost: 150,  req: ['husbandry'],  unlock: ['field','compost'],     bonus: { farmYield: 0.2 }, desc: 'Proper fields, crop rotation, compost.' },
  ranching:   { name: 'Ranching',         cost: 240,  req: ['husbandry'],  unlock: ['pasture','trough','butchery','stable'], bonus: { husbandry: 0.15 }, desc: 'Tame and keep livestock.' },
  stockbreed: { name: 'Stockbreeding',    cost: 460,  req: ['ranching'],   unlock: ['barn'],                bonus: { husbandry: 0.35, tame: 0.2 }, desc: 'Bigger herds, richer yields, easier taming.' },
  cartography:{ name: 'Cartography',      cost: 280,  req: ['letters'],    unlock: [],                      bonus: { scout: 1 }, desc: 'Scouts chart more of the region at every dawn.' },
  logistics:  { name: 'Logistics',        cost: 300,  req: ['letters'],    unlock: [],                      bonus: { haul: 0.35, storage: 40 }, desc: 'Faster hauling, more storage.' },

  commerce:   { name: 'Commerce',         cost: 260,  req: ['letters'],    unlock: ['trading_post', 'armory'], desc: 'Trade networks: a Trading Post, and an Armory counter for rarer gear.' },
  coinage:    { name: 'Coinage',          cost: 450,  req: ['commerce'],   unlock: ['counting_house'],      desc: 'A Counting House keeps gold safe, and makes it grow.' },

  // --- defense, decor and training ------------------------------------------
  fortification:  { name: 'Fortification',   cost: 200,  req: ['masonry'],                        unlock: ['fence', 'palisade'],                desc: 'Perimeter works, cheaper than a full wall.' },
  siege_craft:    { name: 'Siege Craft',      cost: 500,  req: ['fortification', 'smelting'],       unlock: ['turret_ballista'],                  desc: 'Bolt-throwers that fight back.' },
  siege_mastery:  { name: 'Siege Mastery',    cost: 1000, req: ['siege_craft'],                     unlock: [],                                    bonus: { defence: 0.08 }, desc: 'Better crews, better aim: turrets hit harder.' },
  arcane_engineering:{ name: 'Arcane Engineering', cost: 1300, req: ['high_arcana'],                unlock: ['turret_arcane', 'observatory'],     desc: 'Wards that throw fire, and a proper place to study them.' },
  archival_science:{ name: 'Archival Science', cost: 250,  req: ['letters', 'masonry'],             unlock: ['archive'],                          desc: 'Shelves and stacks, not just a reading nook.' },
  marksmanship:   { name: 'Marksmanship',     cost: 600,  req: ['drill_corps'],                     unlock: ['archery_range'],                    desc: 'Drilled archery, on purpose rather than by chance.' },
  war_footing:    { name: 'War Footing',      cost: 900,  req: ['marksmanship', 'siege_craft'],     unlock: ['proving_grounds'],        desc: 'A standing garrison, properly armed and drilled.' },
  grand_works:    { name: 'Grand Works',      cost: 300,  req: ['masonry', 'smelting'],             unlock: ['statuette', 'lamppost'],            desc: 'Stonework and ironwork worth showing off.' },
  high_masonry:   { name: 'High Masonry',     cost: 600,  req: ['grand_works'],                     unlock: ['monument'],                         desc: 'A centrepiece the whole camp is built around.' },
  decorum:        { name: 'Decorum',          cost: 150,  req: ['husbandry'],                       unlock: ['banner'],                           desc: 'Small comforts that cost almost nothing.' },
  herbal_science: { name: 'Herbal Science',   cost: 450,  req: ['herbalism'],                       unlock: ['herbalist_hut'],                    bonus: { herbYield: 0.3 }, desc: '+30% herb yield, and a hut to work it in.' },
  watch_discipline:{ name: 'Watch Discipline', cost: 350,  req: ['drill_corps'],                     unlock: ['watchtower'],                       desc: 'A proper tower, not just a post.' },
};
export const RESEARCH_IDS = Object.keys(RESEARCH);

// --- Dungeon themes ---------------------------------------------------------
export const DUNGEON_THEMES = {
  crypt:   { name: 'Crypt',        factions: ['dead','cult'],       loot: { relics: 2.0, gold: 1.4, dust: 1.2 }, hazard: 'curse',  color: '#8f7ab0', desc: 'Still air, older things.' },
  warren:  { name: 'Warren',       factions: ['wild','warband'],    loot: { food: 1.8, leather: 2.0, wood: 1.2 },hazard: 'ambush', color: '#8fa05a', desc: 'Tunnels chewed, not cut.' },
  vault:   { name: 'Vault',        factions: ['outlaws','merchants'],loot:{ gold: 2.4, gems: 1.8, iron: 1.4 },  hazard: 'trap',   color: '#d0a83c', desc: 'Someone locked this for a reason.' },
  sanctum: { name: 'Sanctum',      factions: ['cult','dead'],       loot: { dust: 2.2, knowledge: 2.0, relics: 1.4 }, hazard: 'ward', color: '#7a9ad0', desc: 'Geometry that argues.' },
  delve:   { name: 'Collapsed Mine',factions: ['warband','wild'],   loot: { iron: 2.2, stone: 2.0, gems: 1.5 },  hazard: 'cavein', color: '#a08a6a', desc: 'The old shafts, re-occupied.' },
  hive:    { name: 'Hive',         factions: ['wild','dead'],       loot: { herbs: 2.0, leather: 1.6, dust: 1.3 },hazard: 'swarm', color: '#b06ad0', desc: 'It is breathing.' },
};
export const THEME_IDS = Object.keys(DUNGEON_THEMES);

export const ROOM_KINDS = ['empty','fight','fight','fight','trap','treasure','shrine','puzzle','rest','lair'];

// --- Items ------------------------------------------------------------------
export const WEAPON_TYPES = [
  { id: 'sword',  name: 'Sword',    stat: 'melee',  dmg: [2, 8],  hands: 1 },
  { id: 'axe',    name: 'Axe',      stat: 'melee',  dmg: [3, 9],  hands: 1 },
  { id: 'maul',   name: 'Maul',     stat: 'melee',  dmg: [4, 12], hands: 2 },
  { id: 'spear',  name: 'Spear',    stat: 'melee',  dmg: [2, 9],  hands: 1 },
  { id: 'dagger', name: 'Dagger',   stat: 'stealth',dmg: [1, 6],  hands: 1 },
  { id: 'bow',    name: 'Bow',      stat: 'ranged', dmg: [2, 9],  hands: 2 },
  { id: 'sling',  name: 'Sling',    stat: 'ranged', dmg: [1, 6],  hands: 1 },
  { id: 'staff',  name: 'Staff',    stat: 'arcana', dmg: [2, 7],  hands: 2 },
  { id: 'focus',  name: 'Focus',    stat: 'arcana', dmg: [1, 8],  hands: 1 },
  { id: 'relic',  name: 'Relic',    stat: 'faith',  dmg: [2, 8],  hands: 1 },
  { id: 'claws',  name: 'Claws',    stat: 'melee',  dmg: [2, 6],  hands: 0 },
];
export const ARMOR_TYPES = [
  { id: 'rags',   name: 'Rags',        armor: 0 },
  { id: 'hide',   name: 'Hide',        armor: 2 },
  { id: 'leather',name: 'Leather',     armor: 3 },
  { id: 'chain',  name: 'Chainmail',   armor: 5 },
  { id: 'scale',  name: 'Scalemail',   armor: 6 },
  { id: 'plate',  name: 'Plate',       armor: 8 },
  { id: 'robes',  name: 'Warded Robes',armor: 3 },
];
export const QUALITY = [
  { id: 'crude',     name: 'Crude',     mult: 0.75, w: 22, color: '#8d8d8d' },
  { id: 'plain',     name: 'Plain',     mult: 1.00, w: 38, color: '#c8c8c8' },
  { id: 'fine',      name: 'Fine',      mult: 1.25, w: 22, color: '#6fcf97' },
  { id: 'superior',  name: 'Superior',  mult: 1.55, w: 11, color: '#5aa8e0' },
  { id: 'masterwork',name: 'Masterwork',mult: 1.95, w: 5,  color: '#b07ae0' },
  { id: 'legendary', name: 'Legendary', mult: 2.60, w: 1,  color: '#e2a03c' },
];
export const ITEM_AFFIXES = [
  { id: 'keen',    name: 'Keen',     mods: { acc: 2 } },
  { id: 'heavy',   name: 'Heavy',    mods: { dmg: 2, acc: -1 } },
  { id: 'swift',   name: 'Swift',    mods: { init: 3 } },
  { id: 'warded',  name: 'Warded',   mods: { armor: 2 } },
  { id: 'vampiric',name: 'Vampiric', mods: { leech: 0.25 } },
  { id: 'blessed', name: 'Blessed',  mods: { acc: 1, armor: 1 } },
  { id: 'cursed',  name: 'Cursed',   mods: { dmg: 3, mood: -6 } },
  { id: 'burning', name: 'Burning',  mods: { dmg: 1 }, element: 'fire' },
];

// --- Body / health ----------------------------------------------------------
export const INJURIES = [
  { id: 'bruise',   name: 'Bruising',       sev: 1, heal: 900,   mods: {} },
  { id: 'cut',      name: 'Deep Cut',       sev: 2, heal: 2200,  mods: { work: -0.1 } },
  { id: 'fracture', name: 'Fracture',       sev: 3, heal: 5200,  mods: { move: -0.3, work: -0.25, combat: -0.2 } },
  { id: 'burn',     name: 'Burn',           sev: 3, heal: 4200,  mods: { work: -0.2, mood: -4 } },
  { id: 'lost_eye', name: 'Lost Eye',       sev: 4, heal: -1,    mods: { 'skill.ranged': -4, combat: -0.1, mood: -3 } },
  { id: 'lost_hand',name: 'Lost Hand',      sev: 4, heal: -1,    mods: { work: -0.35, combat: -0.2, mood: -5 } },
  { id: 'scar',     name: 'Bad Scar',       sev: 2, heal: -1,    mods: { social: -0.1, mood: -1 } },
  { id: 'curse',    name: 'Lingering Curse',sev: 3, heal: 6000,  mods: { mood: -8, combat: -0.15, luck: -0.2 } },
  { id: 'plague',   name: 'Deep Rot',       sev: 4, heal: 7000,  mods: { work: -0.3, combat: -0.25, mood: -6 } },
];

// --- Mood thoughts ----------------------------------------------------------
export const THOUGHTS = {
  well_fed:     { name: 'Well fed',            v: 6,   dur: 600 },
  hungry:       { name: 'Hungry',              v: -10, dur: 0 },
  starving:     { name: 'Starving',            v: -30, dur: 0 },
  rested:       { name: 'Slept well',          v: 8,   dur: 800 },
  exhausted:    { name: 'Exhausted',           v: -18, dur: 0 },
  slept_ground: { name: 'Slept on the ground', v: -6,  dur: 600 },
  beauty:       { name: 'Fine surroundings',   v: 7,   dur: 300 },
  ugly:         { name: 'Grim surroundings',   v: -5,  dur: 300 },
  dark:         { name: 'In the dark',         v: -4,  dur: 200 },
  good_chat:    { name: 'Pleasant conversation',v: 6,  dur: 900 },
  bad_chat:     { name: 'Harsh words',         v: -8,  dur: 1200 },
  brawl:        { name: 'Was in a brawl',      v: -14, dur: 2400 },
  romance:      { name: 'Growing affection',   v: 14,  dur: 2400 },
  heartbreak:   { name: 'Heartbreak',          v: -22, dur: 6000 },
  ally_died:    { name: 'A friend died',       v: -26, dur: 9000 },
  rival_died:   { name: 'A rival died',        v: 6,   dur: 3000 },
  victory:      { name: 'We came back rich',   v: 16,  dur: 4000 },
  defeat:       { name: 'The delve went badly',v: -18, dur: 4000 },
  wounded:      { name: 'In pain',             v: -9,  dur: 0 },
  idle:         { name: 'Nothing to do',       v: -3,  dur: 300 },
  joy:          { name: 'Good company',        v: 9,   dur: 700 },
  cramped:      { name: 'Cramped quarters',    v: -6,  dur: 400 },
  relic_awe:    { name: 'Relic in the hold',   v: 8,   dur: 2000 },
  raid_won:     { name: 'We held the walls',   v: 14,  dur: 3000 },
  raid_lost:    { name: 'The walls were breached', v: -20, dur: 5000 },
  starting_over:{ name: 'Starting over in a new class', v: -6, dur: 4320 },
  graduated:    { name: 'Graduated',           v: 10,  dur: 3000 },
};

// --- Relationship kinds -----------------------------------------------------
export const REL_KINDS = [
  { id: 'nemesis', min: -100, name: 'Nemesis' },
  { id: 'rival',   min: -45,  name: 'Rival' },
  { id: 'cold',    min: -15,  name: 'Cold' },
  { id: 'neutral', min: 15,   name: 'Acquaintance' },
  { id: 'friend',  min: 45,   name: 'Friend' },
  { id: 'close',   min: 75,   name: 'Close Friend' },
  { id: 'bonded',  min: 92,   name: 'Bonded' },
];

// --- Disposition bands on the universal hostility meter ---------------------
export const DISPOSITIONS = [
  { id: 'devoted',  max: 12,  name: 'Devoted',  color: '#6fcf97' },
  { id: 'friendly', max: 28,  name: 'Friendly', color: '#8fbf5a' },
  { id: 'neutral',  max: 46,  name: 'Neutral',  color: '#c8c8c8' },
  { id: 'wary',     max: 60,  name: 'Wary',     color: '#e2b23c' },
  { id: 'hostile',  max: 80,  name: 'Hostile',  color: '#e07a4a' },
  { id: 'feral_h',  max: 101, name: 'Murderous',color: '#e04a4a' },
];
export function dispositionOf(h) {
  for (const d of DISPOSITIONS) if (h < d.max) return d;
  return DISPOSITIONS[DISPOSITIONS.length - 1];
}
