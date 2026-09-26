// ============================================================================
// ELEMENTS, STATUSES AND CREATURE TAGS
// Pure data for the combat core. Damage types decide which defence applies
// (ARM for physical, RES for everything else); statuses are declarative so the
// resolver can treat all of them with the same few hooks; tags bundle the
// immunities and resistances that make a skeleton different from a troll.
// ============================================================================

/** Damage types. Physical types are soaked by ARM; the rest by RES. */
export const DAMAGE_TYPES = {
  slash:  { name: 'Slash',  icon: '🗡️', physical: true,  status: 'bleed' },
  pierce: { name: 'Pierce', icon: '🏹', physical: true,  status: null },
  crush:  { name: 'Crush',  icon: '🔨', physical: true,  status: 'stun' },
  fire:   { name: 'Fire',   icon: '🔥', physical: false, status: 'burn' },
  frost:  { name: 'Frost',  icon: '❄️', physical: false, status: 'chill' },
  storm:  { name: 'Storm',  icon: '⚡', physical: false, status: 'shock' },
  nature: { name: 'Nature', icon: '☠️', physical: false, status: 'poison' },
  holy:   { name: 'Holy',   icon: '✨', physical: false, status: 'blind' },
  shadow: { name: 'Shadow', icon: '🌑', physical: false, status: 'weaken' },
  arcane: { name: 'Arcane', icon: '🔮', physical: false, status: 'sunder' },
};
export const DAMAGE_IDS = Object.keys(DAMAGE_TYPES);
export const ELEMENT_IDS = DAMAGE_IDS.filter(d => !DAMAGE_TYPES[d].physical);
export const isPhysical = (type) => !!(DAMAGE_TYPES[type] && DAMAGE_TYPES[type].physical);

/** What a weapon family hits with. Unarmed is crush. */
export const WEAPON_DAMAGE = {
  sword: 'slash', axe: 'slash', maul: 'crush', spear: 'pierce', dagger: 'pierce',
  bow: 'pierce', sling: 'crush', staff: 'arcane', focus: 'arcane', relic: 'holy', claws: 'slash',
};
/** Weapon families that let melee reach the back row. */
export const REACH_WEAPONS = new Set(['spear']);

/**
 * Statuses. Fields the resolver understands:
 *  debuff / buff  - which side of the ledger it sits on (cleanse, dispel)
 *  dur            - default rounds; counted down at the end of the bearer's turn
 *  max            - stack cap (1 = refresh only)
 *  hard           - takes the turn away; gated by Poise on big creatures
 *  mind           - blocked by Mindless
 *  breaks         - ends when the bearer takes damage
 *  skip           - the bearer loses its action while this is on
 */
export const STATUSES = {
  // damage over time
  burn:     { name: 'Burn',      icon: '🔥', debuff: true, dur: 3, max: 1, desc: 'Fire damage each round; halves healing received.' },
  poison:   { name: 'Poison',    icon: '☠️', debuff: true, dur: 4, max: 5, desc: 'Loses 3% max HP per stack each round, through armour.' },
  bleed:    { name: 'Bleed',     icon: '🩸', debuff: true, dur: 4, max: 5, desc: 'Bleeds each time it acts. Healing staunches it.' },
  doom:     { name: 'Doom',      icon: '💀', debuff: true, dur: 4, max: 1, desc: 'Shadow damage that grows every round.' },
  // control
  stun:     { name: 'Stunned',   icon: '💫', debuff: true, dur: 1, max: 1, hard: true, skip: true, desc: 'Loses its next action.' },
  stagger:  { name: 'Staggered', icon: '💥', debuff: true, dur: 1, max: 1, skip: true, desc: 'Poise broken: loses its next action and takes +25% damage.' },
  chill:    { name: 'Chilled',   icon: '❄️', debuff: true, dur: 2, max: 3, desc: 'Slower and clumsier per stack. Three stacks freeze.' },
  frozen:   { name: 'Frozen',    icon: '🧊', debuff: true, dur: 1, max: 1, hard: true, skip: true, desc: 'Frozen solid. Crush shatters it.' },
  sleep:    { name: 'Asleep',    icon: '💤', debuff: true, dur: 3, max: 1, hard: true, skip: true, mind: true, breaks: true, desc: 'Sleeps until struck.' },
  charm:    { name: 'Charmed',   icon: '💞', debuff: true, dur: 1, max: 1, hard: true, mind: true, breaks: true, desc: 'Attacks its own side.' },
  fear:     { name: 'Afraid',    icon: '😱', debuff: true, dur: 2, max: 1, mind: true, desc: 'Half the time too afraid to act.' },
  confuse:  { name: 'Confused',  icon: '😵', debuff: true, dur: 2, max: 1, mind: true, desc: 'Strikes at random, friend or foe.' },
  root:     { name: 'Rooted',    icon: '🌿', debuff: true, dur: 2, max: 1, desc: 'Held in place: easier to hit, fliers pulled down.' },
  petrify:  { name: 'Petrifying',icon: '🗿', debuff: true, dur: 3, max: 2, desc: 'Turning to stone. At two stacks, petrified.' },
  silence:  { name: 'Silenced',  icon: '🤐', debuff: true, dur: 2, max: 1, desc: 'Cannot cast spells.' },
  engulfed: { name: 'Engulfed',  icon: '🫧', debuff: true, dur: 99, max: 1, hard: true, skip: true, desc: 'Inside something. Burst it to get out.' },
  shock:    { name: 'Shocked',   icon: '⚡', debuff: true, dur: 2, max: 1, desc: 'Charged: the next storm hit arcs onward.' },
  // weakening
  slow:     { name: 'Slowed',    icon: '🐌', debuff: true, dur: 2, max: 1, desc: 'Acts last, and only every other round.' },
  weaken:   { name: 'Weakened',  icon: '🥀', debuff: true, dur: 2, max: 1, desc: 'Deals 25% less damage.' },
  vulnerable:{name: 'Vulnerable',icon: '🎯', debuff: true, dur: 3, max: 1, desc: 'Takes 25% more damage and is easier to hit.' },
  sunder:   { name: 'Sundered',  icon: '🪓', debuff: true, dur: 3, max: 1, desc: 'Armour halved.' },
  blind:    { name: 'Blinded',   icon: '🙈', debuff: true, dur: 2, max: 1, desc: 'Badly reduced accuracy.' },
  drained:  { name: 'Drained',   icon: '🩶', debuff: true, dur: 99, max: 5, desc: 'Max HP down 10% per stack until rest.' },
  grounded: { name: 'Grounded',  icon: '⬇️', debuff: true, dur: 2, max: 1, desc: 'Cannot fly.' },
  wet:      { name: 'Wet',       icon: '💧', debuff: true, dur: 3, max: 1, desc: 'Storm hurts more, fire less.' },
  oiled:    { name: 'Oiled',     icon: '🛢️', debuff: true, dur: 3, max: 1, desc: 'The next fire hit ignites.' },
  // buffs
  regen:    { name: 'Regenerating', icon: '💚', buff: true, dur: 3, max: 1, desc: 'Heals each round.' },
  haste:    { name: 'Hasted',    icon: '⏩', buff: true, dur: 3, max: 1, desc: 'Extra action every other round.' },
  empower:  { name: 'Empowered', icon: '💪', buff: true, dur: 3, max: 1, desc: '+25% power.' },
  fortify:  { name: 'Fortified', icon: '🛡️', buff: true, dur: 3, max: 1, desc: 'More armour.' },
  evasive:  { name: 'Evasive',   icon: '💨', buff: true, dur: 2, max: 1, desc: 'Harder to hit.' },
  stealth:  { name: 'Hidden',    icon: '👤', buff: true, dur: 2, max: 1, desc: 'Untargetable until it strikes; that strike crits.' },
  ward:     { name: 'Warded',    icon: '🔰', buff: true, dur: 4, max: 1, desc: '+50% resistance to one element.' },
  inspired: { name: 'Inspired',  icon: '🎶', buff: true, dur: 3, max: 1, desc: 'Better accuracy and damage.' },
  thorns:   { name: 'Thorns',    icon: '🌵', buff: true, dur: 3, max: 1, desc: 'Melee attackers are hurt in return.' },
  taunting: { name: 'Taunting',  icon: '📣', buff: true, dur: 2, max: 1, desc: 'Enemies must attack this unit.' },
  physres:  { name: 'Raging',    icon: '😤', buff: true, dur: 3, max: 1, desc: 'Shrugs off 25% of physical damage.' },
  guarding: { name: 'Guarding',  icon: '🛡️', buff: true, dur: 2, max: 1, desc: 'Takes half the damage meant for allies.' },
  resolute: { name: 'Resolute',  icon: '🗿', buff: true, dur: 2, max: 1, desc: 'Cannot be stunned, frozen, charmed or put to sleep.' },
  brave:    { name: 'Brave',     icon: '🦁', buff: true, dur: 3, max: 1, desc: 'Cannot be frightened.' },
  deathward:{ name: 'Death Ward',icon: '😇', buff: true, dur: 10, max: 1, desc: 'The next killing blow leaves it at 1 HP instead.' },
  infused:  { name: 'Infused',   icon: '✨', buff: true, dur: 3, max: 1, desc: 'Weapon strikes carry an element.' },
  keen:     { name: 'Eagle-eyed',icon: '🔭', buff: true, dur: 3, max: 1, desc: 'Melee can reach fliers.' },
  frostarmor:{ name: 'Frost Armor', icon: '🧊', buff: true, dur: 3, max: 1, desc: 'Melee attackers are chilled.' },
  guardians:{ name: 'Spirit Guardians', icon: '👼', buff: true, dur: 3, max: 1, desc: 'Holy spirits burn the enemy front line each round.' },
};
export const STATUS_IDS = Object.keys(STATUSES);
export const HARD_CC = new Set(STATUS_IDS.filter(s => STATUSES[s].hard));

/**
 * Tags. Each can carry immunities (statuses), resistances (type → fraction;
 * negative is a weakness, 1 is immunity, above 1 absorbs) and flags the
 * resolver reads directly (flying, mindless, ...).
 */
export const TAGS = {
  // size
  small:      { name: 'Small',      icon: '🐭', def: 1 },
  large:      { name: 'Large',      icon: '🐘', poise: 2, slots: 2 },
  huge:       { name: 'Huge',       icon: '🏔️', poise: 3, slots: 2, immune: ['root'] },
  gargantuan: { name: 'Gargantuan', icon: '🌋', poise: 4, slots: 3, immune: ['root'] },
  // movement
  flying:     { name: 'Flying',     icon: '🪽', desc: 'Melee cannot reach it unless it swoops in, is grounded, or the attacker has reach.' },
  burrower:   { name: 'Burrower',   icon: '🕳️', desc: 'Surfaces among the back row in the first round.' },
  swimmer:    { name: 'Swimmer',    icon: '🐟', desc: 'No penalty in flooded rooms.' },
  climber:    { name: 'Wall-climber', icon: '🕷️', desc: 'Its melee reaches any row.' },
  incorporeal:{ name: 'Incorporeal',icon: '👻', res: { slash: 0.5, pierce: 0.5, crush: 0.5 }, desc: 'Half physical damage; passes through the front line.' },
  // senses
  darkvision: { name: 'Darkvision', icon: '👁️', desc: 'Ignores darkness.' },
  blindsight: { name: 'Blindsight', icon: '🦇', immune: ['blind'], desc: 'Cannot be blinded; sees the hidden.' },
  allaround:  { name: 'All-around vision', icon: '🔭', desc: 'No flanking or backstab crits against it.' },
  // nature
  undead:     { name: 'Undead',     icon: '💀', immune: ['poison', 'bleed', 'fear'], res: { nature: 1, holy: -0.5, shadow: 0.5 } },
  construct:  { name: 'Construct',  icon: '⚙️', immune: ['poison', 'bleed', 'charm', 'fear', 'sleep'], res: { nature: 1, storm: -0.5, crush: -0.25 } },
  ooze:       { name: 'Ooze',       icon: '🫠', immune: ['blind', 'bleed'], nocrit: true },
  plant:      { name: 'Plant',      icon: '🌱', res: { fire: -0.5 } },
  fiend:      { name: 'Fiend',      icon: '😈', res: { fire: 0.5, nature: 0.5, holy: -0.5 } },
  elemental:  { name: 'Elemental',  icon: '🌀', immune: ['poison', 'bleed'] },
  fey:        { name: 'Fey',        icon: '🧚', res: { arcane: 0.25 } },
  aberration: { name: 'Aberration', icon: '👁️‍🗨️', res: { arcane: 0.25 } },
  beast:      { name: 'Beast',      icon: '🐾' },
  dragon:     { name: 'Dragon',     icon: '🐉' },
  giant:      { name: 'Giant',      icon: '🗿' },
  humanoid:   { name: 'Humanoid',   icon: '🧑' },
  mindless:   { name: 'Mindless',   icon: '🫥', immune: ['charm', 'fear', 'sleep', 'confuse'], desc: 'Ignores taunts half the time.' },
  // defence
  armored:    { name: 'Armored',    icon: '🛡️', arm: 3 },
  evasive:    { name: 'Evasive',    icon: '💨', def: 1 },
  regenerating:{ name: 'Regenerating', icon: '💚', desc: 'Heals each round unless its bane struck it.' },
  magicres:   { name: 'Magic Resistant', icon: '🔰', desc: 'Half spell damage; resists spell statuses.' },
  undying:    { name: 'Undying',    icon: '⚰️', desc: 'May rise again at 1 HP unless finished by holy, fire or a critical.' },
  splits:     { name: 'Splits',     icon: '🧫', desc: 'Slashing or storm damage divides it in two.' },
  // behaviour
  leader:     { name: 'Leader',     icon: '👑', desc: 'Its kin fight better while it lives.' },
  pack:       { name: 'Pack Tactics', icon: '🐺', desc: 'More accurate for each packmate still standing.' },
  ambusher:   { name: 'Ambusher',   icon: '🗡️', desc: 'Strikes first, at the back row.' },
  caster:     { name: 'Caster',     icon: '✨', desc: 'Its spells can be silenced and interrupted.' },
  coward:     { name: 'Coward',     icon: '🏃' },
  enrage:     { name: 'Enrage',     icon: '😡', desc: '+50% damage below 30% HP.' },
  alarm:      { name: 'Alarm',      icon: '📢', desc: 'Calls reinforcements while it lives.' },
  shieldwall: { name: 'Shield Wall', icon: '🛡️', desc: '+3 Defence while two or more of its kind hold the front.' },
  displacement:{ name: 'Displacement', icon: '🌫️', desc: 'The first attack against it each round misses (blindsight sees through it).' },
  swarm:      { name: 'Swarm',      icon: '🐜', desc: 'Half damage from single strikes, double from area attacks.' },
  guardian:   { name: 'Guardian',   icon: '🛡️', desc: 'Takes half the damage meant for its allies.' },
  hydra:      { name: 'Many Heads', icon: '🐍', desc: 'Heavy cuts sever a head; two grow back unless fire seals the wound.' },
  bloodfrenzy:{ name: 'Blood Frenzy', icon: '🩸', desc: 'More accurate against the wounded.' },
  coven:      { name: 'Coven',      icon: '🌒', desc: 'Shares great magic while all three hags stand.' },
  // legendary
  boss:       { name: 'Boss',       icon: '👑', poise: 1 },
  frightful:  { name: 'Frightful Presence', icon: '😨', desc: 'Frightens the other side when the fight begins.' },
  phylactery: { name: 'Phylactery', icon: '💠', desc: 'Its life is kept elsewhere; it rises again unless that is broken.' },
  deaththroes:{ name: 'Death Throes', icon: '💥', desc: 'Explodes when it dies.' },
  // ancestry
  relentless: { name: 'Relentless', icon: '🩸', desc: 'Once per fight, drops to 1 HP instead of falling.' },
  lucky:      { name: 'Lucky',      icon: '🍀', desc: 'Once per fight, rerolls a miss.' },
};

/**
 * Ancestry in combat. Resistances here stack with tag resistances. Dragonkin
 * take their lineage element at generation time (deterministically from id).
 */
export const RACE_COMBAT = {
  human:     { tags: ['humanoid'] },
  dwarf:     { tags: ['humanoid', 'darkvision'], res: { nature: 0.5 } },
  elf:       { tags: ['humanoid', 'darkvision'], immune: ['sleep'], resist: { charm: 0.5 } },
  halfling:  { tags: ['humanoid', 'small', 'lucky'], resist: { fear: 0.5 } },
  gnome:     { tags: ['humanoid', 'small'], res: { arcane: 0.25 }, resist: { charm: 0.25, sleep: 0.25, confuse: 0.25, silence: 0.25 } },
  orc:       { tags: ['humanoid', 'relentless', 'darkvision'] },
  goblin:    { tags: ['humanoid', 'small', 'evasive', 'pack', 'darkvision'] },
  kobold:    { tags: ['humanoid', 'small', 'pack', 'darkvision'] },
  tiefling:  { tags: ['humanoid', 'darkvision'], res: { fire: 0.5 } },
  dragonkin: { tags: ['humanoid'], lineage: ['fire', 'frost', 'storm', 'nature'] },
  undead:    { tags: ['undead', 'mindless', 'darkvision'] },
  aberrant:  { tags: ['aberration', 'mindless', 'darkvision'] },
  beast:     { tags: ['beast', 'mindless'] },
  construct: { tags: ['construct', 'mindless'] },
};

/** Classes whose abilities are spells — silenceable, interruptible casters. */
export const CASTER_CLASSES = new Set(['wizard', 'warlock', 'cleric', 'druid', 'bard', 'artificer', 'shaman', 'scholar']);

/** Merge tag, race and extra resistances into one table. */
export function resistTable(tags, extra = []) {
  const res = {};
  const add = (r) => { if (r) for (const k in r) res[k] = (res[k] || 0) + r[k]; };
  for (const t of tags) add(TAGS[t] && TAGS[t].res);
  for (const r of extra) add(r);
  return res;
}
/** Every status a set of tags makes a creature immune to. */
export function immunitySet(tags, extra = []) {
  const s = new Set(extra);
  for (const t of tags) for (const i of (TAGS[t] && TAGS[t].immune) || []) s.add(i);
  return s;
}
/** A resistance fraction as a damage multiplier: weak ×1.5 … immune ×0 … absorb < 0. */
export function resMult(r) { return 1 - (r || 0); }
