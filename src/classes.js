// ============================================================================
// CLASSES AND SKILL TREES
//
// A class decides what a character can wield, which attributes grow, and its
// skill tree. Trees have four tiers (levels 1–10, 11–20, 21–30, 31–40); each
// tier holds four actives with four specialisations under each — twenty nodes,
// and ten points to spend there, so every character is half of what it could
// be. A class starts knowing one base ability; everything else is bought.
//
// Specialisations are declarative patches merged onto the ability at combat
// time (see effectiveAbility), so the resolver never needs to know a tree exists.
// ============================================================================
import { ABILITIES, CLASSES } from './data.js';
import { PRESTIGE_TIERS } from './prestige.js';

export const LEVEL_CAP = 40;
export const TIER_LEVELS = [1, 10, 20, 30];     // level at which each tier opens
export const TIER_CAP = 10;                     // nodes you may own per tier
export const LOADOUT_SLOTS = 4;

/** Level-up XP: steep enough that levels slow down late, but the early ones
 *  come within a delve or two — watching a colonist grow is the point. */
export function xpToNext(level) { return Math.round(55 + level * 28 + level * level * 2); }

// --- class identity ----------------------------------------------------------
// school: which structure teaches it. weapons: families it may wield (the one
// hard gear lock). armorTraining: how much of heavy armour's benefit it keeps.
export const CLASS_INFO = {
  fighter:   { school: 'combat', secondary: 'con', weapons: ['sword', 'axe', 'maul', 'spear', 'bow', 'crossbow'], shield: true,  armor: 'heavy',  armorTraining: 1.0 },
  barbarian: { school: 'combat', secondary: 'con', weapons: ['axe', 'maul', 'hammer', 'throwing'],                 shield: false, armor: 'medium', armorTraining: 0.8 },
  paladin:   { school: 'temple', secondary: 'str', weapons: ['sword', 'maul', 'hammer', 'spear'],                  shield: true,  armor: 'heavy',  armorTraining: 1.0 },
  rogue:     { school: 'combat', secondary: 'int', weapons: ['dagger', 'sword', 'crossbow', 'throwing', 'bow'],    shield: false, armor: 'light',  armorTraining: 0.5 },
  ranger:    { school: 'combat', secondary: 'wis', weapons: ['bow', 'crossbow', 'spear', 'sword', 'axe'],          shield: false, armor: 'medium', armorTraining: 0.7 },
  monk:      { school: 'combat', secondary: 'wis', weapons: ['claws', 'staff', 'spear'],                           shield: false, armor: 'none',   armorTraining: 0.3 },
  wizard:    { school: 'mage',   secondary: 'wis', weapons: ['staff', 'focus', 'dagger', 'wand'],                  shield: false, armor: 'light',  armorTraining: 0.4 },
  warlock:   { school: 'mage',   secondary: 'con', weapons: ['focus', 'wand', 'sword'],                            shield: false, armor: 'light',  armorTraining: 0.5 },
  cleric:    { school: 'temple', secondary: 'con', weapons: ['maul', 'hammer', 'relic'],                           shield: true,  armor: 'medium', armorTraining: 0.8 },
  druid:     { school: 'temple', secondary: 'int', weapons: ['staff', 'spear', 'relic'],                           shield: false, armor: 'medium', armorTraining: 0.6 },
  bard:      { school: 'mage',   secondary: 'dex', weapons: ['sword', 'dagger', 'crossbow', 'focus'],              shield: false, armor: 'light',  armorTraining: 0.5 },
  artificer: { school: 'mage',   secondary: 'con', weapons: ['maul', 'hammer', 'crossbow', 'wand', 'sling'],       shield: true,  armor: 'medium', armorTraining: 0.8 },
};
export const SCHOOLS = {
  combat: { name: 'Combat School', upgrade: 'Knight Academy', building: 'combat_school', academy: 'knight_academy', days: 1 },
  mage:   { name: 'Mage School',   upgrade: 'Wizardry Academy', building: 'mage_school', academy: 'wizardry_academy', days: 1.5 },
  temple: { name: 'Temple',        upgrade: 'Cathedral', building: 'temple', academy: 'cathedral', days: 1.5 },
};
/** Two prestige paths per class, opened at level 20 by the school's upgrade. */
export const PRESTIGE = {
  fighter:   [{ id: 'knight', name: 'Knight', desc: 'Guardian stances and a charge that breaks lines.' }, { id: 'warlord', name: 'Warlord', desc: 'Commands the party; every order is an attack.' }],
  barbarian: [{ id: 'berserker', name: 'Berserker', desc: 'Frenzy that feeds on its own wounds.' }, { id: 'totem', name: 'Totem Warrior', desc: 'Spirit animals that shield and hunt.' }],
  paladin:   [{ id: 'templar', name: 'Templar', desc: 'Holy ground and the power to raise the fallen.' }, { id: 'vengeance', name: 'Oathbreaker', desc: 'Dark vows; smites that curse.' }],
  rogue:     [{ id: 'assassin', name: 'Assassin', desc: 'Executions and poison mastery.' }, { id: 'trickster', name: 'Arcane Trickster', desc: 'Illusions and stolen spells.' }],
  ranger:    [{ id: 'beastmaster', name: 'Beastmaster', desc: 'A companion that fights as a second body.' }, { id: 'sharpshooter', name: 'Sharpshooter', desc: 'Every arrow a critical.' }],
  monk:      [{ id: 'grandmaster', name: 'Grandmaster', desc: 'Perfect evasion and the quivering palm.' }, { id: 'elements', name: 'Way of Elements', desc: 'Ki that burns, freezes and thunders.' }],
  wizard:    [{ id: 'archmage', name: 'Archmage', desc: 'Meteor, time stop, raw power.' }, { id: 'chronomancer', name: 'Chronomancer', desc: 'Haste the party, slow the world.' }],
  warlock:   [{ id: 'pactlord', name: 'Pactlord', desc: 'The patron walks beside you.' }, { id: 'hexblade', name: 'Hexblade', desc: 'A cursed blade in the front line.' }],
  cleric:    [{ id: 'highpriest', name: 'High Priest', desc: 'Mass resurrection and holy nova.' }, { id: 'warpriest', name: 'War Priest', desc: 'Divine strikes in heavy armour.' }],
  druid:     [{ id: 'archdruid', name: 'Archdruid', desc: 'Earthquake and elemental shape.' }, { id: 'stormcaller', name: 'Stormcaller', desc: 'Lightning that never stops.' }],
  bard:      [{ id: 'maestro', name: 'Maestro', desc: 'Party-wide haste and the encore.' }, { id: 'skald', name: 'Skald', desc: 'War songs in the front row.' }],
  artificer: [{ id: 'battlesmith', name: 'Battlesmith', desc: 'An iron defender and a cannon.' }, { id: 'alchemist', name: 'Alchemist', desc: 'Elixirs that heal and explode.' }],
};

// --- class abilities -----------------------------------------------------------
// New actives. Existing ones in data.js are reused by id where they fit.
export const CLASS_ABILITIES = {
  // Fighter
  shield_bash:   { name: 'Shield Bash',   kind: 'attack', shape: 'single', range: 'melee', dmg: 'crush', cd: 4, power: 0.8, stat: 'melee', apply: [['stun', 0.4, 1]], needs: 'shield', desc: 'Crushes a foe with a shield; may stun.' },
  challenge:     { name: 'Challenge',     kind: 'buff',   shape: 'self', cd: 5, power: 0.4, stat: 'melee', taunt: true, apply: [['fortify', 1, 2]], desc: 'Every enemy must attack you for two rounds.' },
  action_surge:  { name: 'Action Surge',  kind: 'buff',   shape: 'self', cd: 7, power: 0.5, stat: 'melee', apply: [['haste', 1, 2]], desc: 'A burst of speed: an extra action.' },
  sunder_armor:  { name: 'Sunder Armor',  kind: 'attack', shape: 'single', range: 'melee', dmg: 'weapon', cd: 3, power: 1.0, stat: 'melee', apply: [['sunder', 1, 3]], desc: 'Breaks a foe\'s armour.' },
  rallying_cry:  { name: 'Rallying Cry',  kind: 'buff',   shape: 'party', cd: 6, power: 0.4, stat: 'melee', barrier: 0.12, desc: 'The whole party gains a barrier.' },
  bulwark:       { name: 'Bulwark',       kind: 'buff',   shape: 'self', cd: 6, power: 0.4, stat: 'melee', apply: [['guarding', 1, 2]], desc: 'Takes half the damage meant for allies.' },
  // Barbarian
  frenzied_strikes:{ name: 'Frenzied Strikes', kind: 'attack', shape: 'single', range: 'melee', dmg: 'weapon', cd: 3, power: 1.4, stat: 'melee', hits: 3, apply: [['bleed', 0.35, 1]], desc: 'Three savage blows.' },
  intimidating_shout:{ name: 'Intimidating Shout', kind: 'debuff', shape: 'all', range: 'ranged', cd: 5, power: 0.4, stat: 'melee', apply: [['fear', 0.4, 2]], desc: 'Terrifies the enemy.' },
  earthshaker:   { name: 'Earthshaker',   kind: 'aoe',    shape: 'front', range: 'melee', dmg: 'crush', cd: 4, power: 0.8, stat: 'melee', apply: [['stun', 0.35, 1]], desc: 'Smashes the ground under the front line.' },
  unstoppable:   { name: 'Unstoppable',   kind: 'buff',   shape: 'self', cd: 7, power: 0.4, stat: 'melee', cleanse: 3, apply: [['resolute', 1, 2]], desc: 'Shakes off control and cannot be stopped.' },
  blood_price:   { name: 'Blood Price',   kind: 'attack', shape: 'single', range: 'melee', dmg: 'weapon', cd: 3, power: 2.0, stat: 'melee', selfDamage: 0.1, desc: 'Pays in blood for a devastating blow.' },
  primal_totem:  { name: 'Primal Totem',  kind: 'buff',   shape: 'party', cd: 6, power: 0.35, stat: 'survival', apply: [['inspired', 1, 3], ['physres', 1, 2]], desc: 'A spirit totem that hardens the party.' },
  // Paladin
  shield_of_faith:{ name: 'Shield of Faith', kind: 'buff', shape: 'ally', cd: 4, power: 0.5, stat: 'faith', spell: 'divine', barrier: 0.25, desc: 'A barrier on the most endangered ally.' },
  aura_of_courage:{ name: 'Aura of Courage', kind: 'buff', shape: 'party', cd: 6, power: 0.3, stat: 'faith', spell: 'divine', apply: [['brave', 1, 3]], cleanseMind: true, desc: 'The party cannot be frightened.' },
  consecrate:    { name: 'Consecrate',    kind: 'aoe',    shape: 'front', range: 'ranged', dmg: 'holy', cd: 4, power: 0.8, stat: 'faith', spell: 'divine', apply: [['blind', 0.3, 1]], bonusVs: { undead: 1.5, fiend: 1.5 }, desc: 'Holy ground under the enemy front line.' },
  judgment:      { name: 'Judgment',      kind: 'attack', shape: 'single', range: 'ranged', dmg: 'holy', cd: 3, power: 1.2, stat: 'faith', spell: 'divine', apply: [['blind', 0.8, 2]], desc: 'A verdict of light.' },
  holy_charge:   { name: 'Holy Charge',   kind: 'attack', shape: 'single', range: 'melee', dmg: 'holy', cd: 4, power: 1.3, stat: 'faith', dive: true, prefer: 'back', desc: 'Charges through the line to the back row.' },
  divine_guardian:{ name: 'Divine Guardian', kind: 'buff', shape: 'party', cd: 99, power: 0.3, stat: 'faith', spell: 'divine', apply: [['deathward', 1, 10]], desc: 'Once a fight: the first ally to fall stands back up.' },
  // Rogue
  poison_blade:  { name: 'Poison Blade',  kind: 'attack', shape: 'single', range: 'melee', dmg: 'weapon', cd: 3, power: 0.9, stat: 'stealth', apply: [['poison', 0.9, 3]], desc: 'A coated edge.' },
  cheap_shot:    { name: 'Cheap Shot',    kind: 'attack', shape: 'single', range: 'melee', dmg: 'crush', cd: 4, power: 0.7, stat: 'stealth', apply: [['stun', 0.55, 1]], desc: 'A blow where it hurts.' },
  shadowstep:    { name: 'Shadowstep',    kind: 'attack', shape: 'single', range: 'melee', dmg: 'weapon', cd: 4, power: 1.6, stat: 'stealth', dive: true, prefer: 'back', helpless: true, desc: 'Steps out of the dark behind any foe.' },
  smoke_bomb:    { name: 'Smoke Bomb',    kind: 'buff',   shape: 'party', cd: 6, power: 0.4, stat: 'stealth', apply: [['evasive', 1, 2]], enemyApply: [['blind', 0.4, 1]], desc: 'The party vanishes into smoke.' },
  eviscerate:    { name: 'Eviscerate',    kind: 'attack', shape: 'single', range: 'melee', dmg: 'weapon', cd: 4, power: 1.1, stat: 'stealth', consume: ['poison', 'bleed'], desc: 'Tears open every wound — stronger for each stack.' },
  expose_weakness:{ name: 'Expose Weakness', kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 0.5, stat: 'stealth', apply: [['vulnerable', 1, 3], ['sunder', 1, 3]], desc: 'Shows the party where to strike.' },
  // Ranger
  aimed_shot:    { name: 'Aimed Shot',    kind: 'attack', shape: 'single', range: 'ranged', dmg: 'pierce', cd: 2, power: 1.4, stat: 'ranged', desc: 'A careful, heavy shot.' },
  pinning_shot:  { name: 'Pinning Shot',  kind: 'attack', shape: 'single', range: 'ranged', dmg: 'pierce', cd: 3, power: 0.9, stat: 'ranged', apply: [['root', 0.8, 2]], grounds: true, desc: 'Pins a foe — and drags fliers down.' },
  elemental_quiver:{ name: 'Elemental Quiver', kind: 'buff', shape: 'self', cd: 6, power: 0.4, stat: 'ranged', infuse: 'fire', apply: [['infused', 1, 3]], desc: 'Arrows burn for three rounds.' },
  beast_command: { name: 'Beast Command', kind: 'buff',   shape: 'party', cd: 5, power: 0.4, stat: 'animals', onlyTags: ['beast'], apply: [['haste', 1, 2], ['empower', 1, 2]], desc: 'Your beasts strike faster and harder.' },
  rain_of_arrows:{ name: 'Rain of Arrows',kind: 'aoe',    shape: 'all', range: 'ranged', dmg: 'pierce', cd: 5, power: 0.85, stat: 'ranged', desc: 'Arrows on everything.' },
  trap_line:     { name: 'Trap Line',     kind: 'aoe',    shape: 'front', range: 'ranged', dmg: 'pierce', cd: 5, power: 0.5, stat: 'survival', apply: [['slow', 0.7, 2], ['root', 0.3, 1]], desc: 'Snares across the enemy front.' },
  // Monk
  stunning_strike:{ name: 'Stunning Strike', kind: 'attack', shape: 'single', range: 'melee', dmg: 'crush', cd: 3, power: 1.0, stat: 'melee', apply: [['stun', 0.5, 1]], desc: 'A ki-charged blow that stops a foe.' },
  deflect:       { name: 'Deflect Missiles', kind: 'buff', shape: 'self', cd: 4, power: 0.4, stat: 'melee', apply: [['evasive', 1, 2], ['thorns', 1, 2]], desc: 'Catches blows and returns them.' },
  quivering_palm:{ name: 'Quivering Palm', kind: 'debuff', shape: 'single', range: 'melee', cd: 5, power: 1.2, stat: 'melee', apply: [['doom', 1, 4]], desc: 'Vibrations that tear from inside.' },
  wind_step:     { name: 'Wind Step',     kind: 'attack', shape: 'single', range: 'melee', dmg: 'crush', cd: 3, power: 1.2, stat: 'melee', dive: true, reachFlyers: true, desc: 'Runs on the air to any foe, fliers included.' },
  pressure_points:{ name: 'Pressure Points', kind: 'debuff', shape: 'single', range: 'melee', cd: 3, power: 0.5, stat: 'melee', apply: [['weaken', 1, 2], ['slow', 0.8, 2]], desc: 'Numbs and slows.' },
  ki_surge:      { name: 'Ki Surge',      kind: 'buff',   shape: 'self', cd: 6, power: 0.4, stat: 'faith', infuse: 'storm', apply: [['infused', 1, 3], ['empower', 1, 2]], desc: 'Fists crackle with storm.' },
  // Wizard
  ray_of_frost:  { name: 'Ray of Frost',  kind: 'attack', shape: 'single', range: 'ranged', dmg: 'frost', cd: 2, power: 1.0, stat: 'arcana', spell: 'arcane', apply: [['chill', 1, 1]], desc: 'Chills a foe; three chills freeze.' },
  magic_missile: { name: 'Magic Missile', kind: 'attack', shape: 'single', range: 'ranged', dmg: 'arcane', cd: 2, power: 1.35, stat: 'arcana', spell: 'arcane', hits: 3, autoHit: true, desc: 'Three darts that never miss.' },
  mage_shield:   { name: 'Shield',        kind: 'buff',   shape: 'self', cd: 4, power: 0.4, stat: 'arcana', spell: 'arcane', barrier: 0.25, desc: 'A barrier of force.' },
  fireball:      { name: 'Fireball',      kind: 'aoe',    shape: 'front', range: 'ranged', dmg: 'fire', cd: 4, power: 1.0, stat: 'arcana', spell: 'arcane', apply: [['burn', 0.5, 3]], desc: 'Engulfs the enemy front line.' },
  lightning_bolt:{ name: 'Lightning Bolt',kind: 'aoe',    shape: 'front', range: 'ranged', dmg: 'storm', cd: 4, power: 1.0, stat: 'arcana', spell: 'arcane', apply: [['shock', 0.6, 2]], desc: 'A line of lightning.' },
  counterspell:  { name: 'Counterspell',  kind: 'debuff', shape: 'single', range: 'ranged', cd: 3, power: 0.5, stat: 'arcana', spell: 'arcane', interrupt: true, preferCasters: true, apply: [['silence', 0.9, 2]], desc: 'Silences a caster and breaks its spell.' },
  blink:         { name: 'Blink',         kind: 'buff',   shape: 'self', cd: 5, power: 0.4, stat: 'arcana', spell: 'arcane', apply: [['stealth', 1, 1]], desc: 'Vanishes for a moment.' },
  // Warlock
  eldritch_blast:{ name: 'Eldritch Blast',kind: 'attack', shape: 'single', range: 'ranged', dmg: 'arcane', cd: 1, power: 1.3, stat: 'arcana', spell: 'arcane', hits: 2, desc: 'Beams of raw force.' },
  armor_of_frost:{ name: 'Armor of Frost',kind: 'buff',   shape: 'self', cd: 5, power: 0.4, stat: 'arcana', spell: 'arcane', barrier: 0.2, apply: [['frostarmor', 1, 3]], desc: 'A barrier that chills attackers.' },
  summon_imp:    { name: 'Summon Imp',    kind: 'summon', shape: 'self', cd: 7, power: 1, stat: 'arcana', spell: 'arcane', summon: ['imp', 1], desc: 'Calls a patron\'s imp to fight for you.' },
  hunger_of_hadar:{ name: 'Hunger of Hadar', kind: 'aoe', shape: 'all', range: 'ranged', dmg: 'shadow', cd: 5, power: 0.7, stat: 'arcana', spell: 'arcane', apply: [['blind', 0.5, 1], ['chill', 0.4, 1]], desc: 'A void that blinds and freezes.' },
  curse_of_doom: { name: 'Curse of Doom', kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 1.0, stat: 'arcana', spell: 'arcane', apply: [['doom', 1, 4]], desc: 'Damage that grows each round.' },
  dark_pact:     { name: 'Dark Pact',     kind: 'buff',   shape: 'self', cd: 8, power: 0.3, stat: 'arcana', selfDamage: 0.15, resetCds: true, desc: 'Pays in blood to recover every other spell.' },
  // Cleric
  sacred_flame:  { name: 'Sacred Flame',  kind: 'attack', shape: 'single', range: 'ranged', dmg: 'holy', cd: 2, power: 1.1, stat: 'faith', spell: 'divine', autoHit: true, desc: 'Holy fire that cannot be dodged.' },
  turn_undead:   { name: 'Turn Undead',   kind: 'debuff', shape: 'all', range: 'ranged', cd: 5, power: 0.5, stat: 'faith', spell: 'divine', onlyTags: ['undead', 'fiend'], ignoreMindless: true, apply: [['fear', 0.8, 2]], desc: 'The dead and the damned flee.' },
  mass_heal:     { name: 'Mass Heal',     kind: 'heal',   shape: 'party', cd: 5, power: 0.6, stat: 'faith', spell: 'divine', desc: 'Heals the whole party.' },
  spirit_guardians:{ name: 'Spirit Guardians', kind: 'buff', shape: 'self', cd: 6, power: 0.5, stat: 'faith', spell: 'divine', apply: [['guardians', 1, 3]], desc: 'Spirits burn the enemy front line every round.' },
  cleanse:       { name: 'Cleanse',       kind: 'buff',   shape: 'party', cd: 4, power: 0.3, stat: 'faith', spell: 'divine', cleanse: 2, desc: 'Removes two afflictions from every ally.' },
  revivify:      { name: 'Revivify',      kind: 'heal',   shape: 'ally', cd: 99, power: 0.5, stat: 'faith', spell: 'divine', revive: 0.3, desc: 'Once a fight: a fallen ally rises.' },
  // Druid
  entangle:      { name: 'Entangle',      kind: 'debuff', shape: 'all', range: 'ranged', cd: 4, power: 0.4, stat: 'faith', spell: 'divine', apply: [['root', 0.55, 2]], desc: 'Roots burst up and hold.' },
  call_lightning:{ name: 'Call Lightning',kind: 'attack', shape: 'single', range: 'ranged', dmg: 'storm', cd: 2, power: 1.2, stat: 'faith', spell: 'divine', apply: [['shock', 0.4, 2]], desc: 'A bolt from above — deadly on the wet.' },
  wild_shape:    { name: 'Wild Shape: Bear', kind: 'buff', shape: 'self', cd: 8, power: 0.5, stat: 'survival', barrier: 0.4, toFront: true, apply: [['empower', 1, 4], ['fortify', 1, 4]], desc: 'Becomes a bear and holds the front.' },
  insect_plague: { name: 'Insect Plague', kind: 'debuff', shape: 'all', range: 'ranged', cd: 5, power: 0.5, stat: 'faith', spell: 'divine', apply: [['poison', 0.8, 2]], desc: 'A biting swarm.' },
  barkskin:      { name: 'Barkskin',      kind: 'buff',   shape: 'ally', cd: 4, power: 0.5, stat: 'faith', spell: 'divine', apply: [['fortify', 1, 3]], desc: 'Bark armour on an ally.' },
  moonbeam:      { name: 'Moonbeam',      kind: 'attack', shape: 'single', range: 'ranged', dmg: 'holy', cd: 3, power: 1.2, stat: 'faith', spell: 'divine', bonusVs: { undead: 1.3, fiend: 1.3, fey: 1.3 }, desc: 'Silver light that burns the unnatural.' },
  // Bard
  vicious_mockery:{ name: 'Vicious Mockery', kind: 'attack', shape: 'single', range: 'ranged', dmg: 'arcane', cd: 2, power: 0.9, stat: 'social', spell: 'arcane', autoHit: true, apply: [['weaken', 0.8, 2]], desc: 'Words that wound and sap.' },
  song_of_rest:  { name: 'Song of Rest',  kind: 'heal',   shape: 'party', cd: 5, power: 0.35, stat: 'social', spell: 'arcane', apply: [['regen', 1, 3, 'party']], desc: 'A song that mends.' },
  hypnotic_pattern:{ name: 'Hypnotic Pattern', kind: 'debuff', shape: 'all', range: 'ranged', cd: 5, power: 0.4, stat: 'social', spell: 'arcane', apply: [['sleep', 0.4, 2]], desc: 'Colours that put the enemy to sleep.' },
  countercharm:  { name: 'Countercharm',  kind: 'buff',   shape: 'party', cd: 5, power: 0.3, stat: 'social', spell: 'arcane', cleanseMind: true, apply: [['brave', 1, 3]], desc: 'Frees minds and hardens them.' },
  dissonant_whispers:{ name: 'Dissonant Whispers', kind: 'attack', shape: 'single', range: 'ranged', dmg: 'arcane', cd: 3, power: 1.1, stat: 'social', spell: 'arcane', apply: [['fear', 0.7, 2]], desc: 'A whisper that drives a foe mad with fear.' },
  heroism:       { name: 'Heroism',       kind: 'buff',   shape: 'party', cd: 6, power: 0.4, stat: 'social', spell: 'arcane', barrier: 0.1, apply: [['brave', 1, 3]], desc: 'The party becomes heroes.' },
  // Artificer
  alchemical_flask:{ name: 'Alchemical Flask', kind: 'attack', shape: 'single', range: 'ranged', dmg: 'random', cd: 2, power: 1.1, stat: 'alchemy', elementRider: true, desc: 'A random element — and its status.' },
  infuse_weapon: { name: 'Infuse Weapon', kind: 'buff',   shape: 'ally', cd: 5, power: 0.4, stat: 'smithing', spell: 'arcane', infuse: 'storm', allyStrongest: true, apply: [['infused', 1, 4]], desc: 'An ally\'s blows crackle with storm.' },
  iron_defender: { name: 'Iron Defender', kind: 'summon', shape: 'self', cd: 99, power: 1, stat: 'smithing', summon: ['animated_armor', 1], desc: 'Deploys a construct to hold the line.' },
  tesla_coil:    { name: 'Tesla Coil',    kind: 'aoe',    shape: 'all', range: 'ranged', dmg: 'storm', cd: 5, power: 0.8, stat: 'smithing', spell: 'arcane', apply: [['shock', 0.5, 2]], desc: 'Arcs between every enemy.' },
  flash_repair:  { name: 'Flash Repair',  kind: 'heal',   shape: 'ally', cd: 3, power: 0.6, stat: 'smithing', barrier: 0.1, desc: 'Patches an ally and plates them.' },
  thunder_cannon:{ name: 'Thunder Cannon',kind: 'attack', shape: 'single', range: 'ranged', dmg: 'storm', cd: 4, power: 1.8, stat: 'smithing', apply: [['stun', 0.4, 1]], desc: 'A hand cannon of pure thunder.' },
};
Object.assign(ABILITIES, CLASS_ABILITIES);

// --- trees -----------------------------------------------------------------------
// Spec effects (merged onto the ability at combat time):
//  p: +power  cd: ±cooldown  hits: +hits  add: extra riders  up: {status: +chance}
//  st: {status: +stacks}  shape  dive  reachFlyers  interrupt  grounds  autoHit
//  leech  self/party: riders on self/allies  heal: +heal  barrier: +barrier
//  killReset  lastStand: hp fraction  chain: extra targets at half  vs: bonusVs
//  poise: extra poise damage  execute  cleanse: +n  dur: +rounds on riders
const mkSpec = (name, desc, fx) => ({ name, desc, fx });
const mkActive = (id, specs) => ({ id, specs });

export const TREES = {
  fighter: { base: 'cleave', tiers: [
    [mkActive('cleave', [mkSpec('Heavy Arc', '+35% power.', { p: 0.35 }), mkSpec('Rending Cleave', 'Adds 2 bleed.', { add: [['bleed', 0.7, 2]] }), mkSpec('Wide Arc', 'Hits every enemy.', { shape: 'all', p: -0.15 }), mkSpec('Momentum', 'A kill resets the cooldown.', { killReset: true })]),
     mkActive('shield_bash', [mkSpec('Concussive', 'Stun 70%.', { up: { stun: 0.3 } }), mkSpec('Staggering', 'Double poise damage.', { poise: 1 }), mkSpec('Ricochet', 'Bounces to a second foe.', { chain: 1 }), mkSpec('Interrupt', 'Always breaks a telegraph.', { interrupt: true })]),
     mkActive('second_wind', [mkSpec('Deep Reserves', '+45% healing.', { heal: 0.45 }), mkSpec('Resolve', 'Also cleanses a debuff.', { cleanse: 1 }), mkSpec('Rally', 'Heals the party a little.', { party: [['regen', 1, 2]] }), mkSpec('Last Stand', 'Fires on its own below 25% HP.', { lastStand: 0.25 })]),
     mkActive('challenge', [mkSpec('Iron Hide', 'More armour while taunting.', { self: [['fortify', 1, 3]] }), mkSpec('Commanding', 'Taunted foes are weakened.', { enemy: [['weaken', 0.8, 2]] }), mkSpec('Stand Together', 'Allies gain evasion.', { party: [['evasive', 1, 2]] }), mkSpec('Punishing', 'Attackers are hurt in return.', { self: [['thorns', 1, 2]] })])],
    [mkActive('action_surge', [mkSpec('Second Surge', '−2 cooldown.', { cd: -2 }), mkSpec('Adrenaline', 'Also empowers.', { self: [['empower', 1, 2]] }), mkSpec('Rallying Surge', 'Hastes an ally too.', { party: [['inspired', 1, 2]] }), mkSpec('Relentless', 'Cleanses control.', { cleanse: 2 })]),
     mkActive('sunder_armor', [mkSpec('Shatterstrike', '+40% power.', { p: 0.4 }), mkSpec('Exposing', 'Also vulnerable.', { add: [['vulnerable', 1, 2]] }), mkSpec('Sweeping Sunder', 'Hits the front row.', { shape: 'front', p: -0.3 }), mkSpec('Quick Sunder', '−1 cooldown.', { cd: -1 })]),
     mkActive('rallying_cry', [mkSpec('Iron Will', '+60% barrier.', { barrier: 0.07 }), mkSpec('Warcry', 'Party inspired.', { party: [['inspired', 1, 2]] }), mkSpec('Fearless', 'Party brave.', { party: [['brave', 1, 3]] }), mkSpec('Second Wind', 'Party regenerates.', { party: [['regen', 1, 2]] })]),
     mkActive('bulwark', [mkSpec('Bastion', 'More armour while guarding.', { self: [['fortify', 1, 3]] }), mkSpec('Longer Watch', '+1 round.', { dur: 1 }), mkSpec('Retribution', 'Guard reflects damage.', { self: [['thorns', 1, 2]] }), mkSpec('Unbroken', 'Cannot be controlled while guarding.', { self: [['resolute', 1, 2]] })])],
  ] },
  barbarian: { base: 'rage', tiers: [
    [mkActive('rage', [mkSpec('Fury', '+25% more damage.', { self: [['inspired', 1, 3]] }), mkSpec('Thick Skin', 'More armour too.', { self: [['fortify', 1, 3]] }), mkSpec('Bloodlust', 'Heals on hits while raging.', { leech: 0.15 }), mkSpec('Endless Rage', '+2 rounds.', { dur: 2 })]),
     mkActive('reckless', [mkSpec('Brutal', '+40% power.', { p: 0.4 }), mkSpec('Crippling', 'Slows the target.', { add: [['slow', 0.6, 2]] }), mkSpec('Wild Swing', 'Hits the front row.', { shape: 'front', p: -0.5 }), mkSpec('Frenzy', 'A kill resets the cooldown.', { killReset: true })]),
     mkActive('frenzied_strikes', [mkSpec('Savage', '+30% power.', { p: 0.3 }), mkSpec('Rending', 'Bleed chance 70%.', { up: { bleed: 0.35 } }), mkSpec('Four Blows', '+1 hit.', { hits: 1 }), mkSpec('Feeding Frenzy', 'Heals from damage.', { leech: 0.2 })]),
     mkActive('intimidating_shout', [mkSpec('Terror', 'Fear 70%.', { up: { fear: 0.3 } }), mkSpec('Cowing', 'Also weakens.', { add: [['weaken', 0.6, 2]] }), mkSpec('Deafening', 'Silences casters.', { add: [['silence', 0.3, 1]] }), mkSpec('War Voice', '−1 cooldown.', { cd: -1 })])],
    [mkActive('earthshaker', [mkSpec('Tremor', '+35% power.', { p: 0.35 }), mkSpec('Quake', 'Stun 60%.', { up: { stun: 0.25 } }), mkSpec('Fissure', 'Hits every enemy.', { shape: 'all', p: -0.2 }), mkSpec('Aftershock', 'Slows survivors.', { add: [['slow', 0.6, 2]] })]),
     mkActive('unstoppable', [mkSpec('Juggernaut', 'Also empowered.', { self: [['empower', 1, 2]] }), mkSpec('Iron Body', 'Also fortified.', { self: [['fortify', 1, 2]] }), mkSpec('Longer', '+1 round.', { dur: 1 }), mkSpec('Quick Recovery', '−2 cooldown.', { cd: -2 })]),
     mkActive('blood_price', [mkSpec('Worth It', '+40% power.', { p: 0.4 }), mkSpec('Cheaper', 'Costs half the blood.', { selfDamage: -0.05 }), mkSpec('Blood Drinker', 'Heals from the blow.', { leech: 0.3 }), mkSpec('Executioner', 'Kills below 20% HP.', { execute: 0.2 })]),
     mkActive('primal_totem', [mkSpec('Bear Spirit', 'Party fortified.', { party: [['fortify', 1, 3]] }), mkSpec('Wolf Spirit', 'Party more accurate.', { p: 0.3 }), mkSpec('Eagle Spirit', 'Party can strike fliers.', { party: [['keen', 1, 3]] }), mkSpec('Enduring Spirit', '+2 rounds.', { dur: 2 })])],
  ] },
  paladin: { base: 'smite', tiers: [
    [mkActive('smite', [mkSpec('Radiant', '+35% power.', { p: 0.35 }), mkSpec('Blinding', 'Blinds the target.', { add: [['blind', 0.6, 2]] }), mkSpec('Searing', 'Burns the dead and damned harder.', { vs: { undead: 1.3, fiend: 1.3 } }), mkSpec('Staggering', 'Adds poise damage and stun.', { add: [['stun', 0.3, 1]], poise: 1 })]),
     mkActive('lay_hands', [mkSpec('Deep Mercy', '+45% healing.', { heal: 0.45 }), mkSpec('Purify', 'Cleanses two debuffs.', { cleanse: 2 }), mkSpec('Mercy for All', 'Heals the party.', { shape: 'party', heal: -0.4 }), mkSpec('Martyr', 'Fires on its own below 25%.', { lastStand: 0.25 })]),
     mkActive('shield_of_faith', [mkSpec('Stalwart', '+60% barrier.', { barrier: 0.15 }), mkSpec('Blessed Ward', 'Also warded.', { party: [['brave', 1, 2]] }), mkSpec('Aegis', 'Shields the whole party.', { shape: 'party', barrier: -0.12 }), mkSpec('Swift Faith', '−1 cooldown.', { cd: -1 })]),
     mkActive('aura_of_courage', [mkSpec('Aura of Protection', 'Party fortified.', { party: [['fortify', 1, 3]] }), mkSpec('Aura of Vigour', 'Party regenerates.', { party: [['regen', 1, 3]] }), mkSpec('Aura of Wrath', 'Party inspired.', { party: [['inspired', 1, 3]] }), mkSpec('Enduring Aura', '+2 rounds.', { dur: 2 })])],
    [mkActive('consecrate', [mkSpec('Hallowed', '+35% power.', { p: 0.35 }), mkSpec('Blinding Light', 'Blind 60%.', { up: { blind: 0.3 } }), mkSpec('Holy Field', 'Hits every enemy.', { shape: 'all', p: -0.2 }), mkSpec('Sanctuary', 'Party regenerates.', { party: [['regen', 1, 2]] })]),
     mkActive('judgment', [mkSpec('Verdict', '+35% power.', { p: 0.35 }), mkSpec('Sentence', 'Stuns.', { add: [['stun', 0.35, 1]] }), mkSpec('Condemn', 'Kills below 20%.', { execute: 0.2 }), mkSpec('Swift Justice', '−1 cooldown.', { cd: -1 })]),
     mkActive('holy_charge', [mkSpec('Crusade', '+35% power.', { p: 0.35 }), mkSpec('Trample', 'Hits the whole row.', { shape: 'front', p: -0.3 }), mkSpec('Rallying Charge', 'Party inspired.', { party: [['inspired', 1, 2]] }), mkSpec('Skybreaker', 'Reaches fliers.', { reachFlyers: true })]),
     mkActive('divine_guardian', [mkSpec('Twice Blessed', 'Also heals the party.', { party: [['regen', 1, 3]] }), mkSpec('Holy Shelter', 'Party barrier.', { barrier: 0.1 }), mkSpec('Righteous', 'Party brave.', { party: [['brave', 1, 4]] }), mkSpec('Early Grace', 'Cast at the start of the fight.', { opener: true })])],
  ] },
  rogue: { base: 'backstab', tiers: [
    [mkActive('backstab', [mkSpec('Deep Cut', '+35% power.', { p: 0.35 }), mkSpec('Serrated', 'Adds 2 bleed.', { add: [['bleed', 0.8, 2]] }), mkSpec('Assassinate', 'Kills below 20%.', { execute: 0.2 }), mkSpec('Opportunist', 'A kill resets the cooldown.', { killReset: true })]),
     mkActive('vanish', [mkSpec('Smoke and Mirrors', 'Also evasive after.', { self: [['evasive', 1, 3]] }), mkSpec('Longer Shadow', '+1 round.', { dur: 1 }), mkSpec('Shadow Veil', 'Cleanses as it fades.', { cleanse: 2 }), mkSpec('Quick Fade', '−2 cooldown.', { cd: -2 })]),
     mkActive('poison_blade', [mkSpec('Virulent', '+2 poison stacks.', { st: { poison: 2 } }), mkSpec('Crippling Poison', 'Also slows.', { add: [['slow', 0.6, 2]] }), mkSpec('Fan of Knives', 'Hits every enemy.', { shape: 'all', range: 'ranged', p: -0.4 }), mkSpec('Quick Coat', '−1 cooldown.', { cd: -1 })]),
     mkActive('cheap_shot', [mkSpec('Low Blow', 'Stun 80%.', { up: { stun: 0.25 } }), mkSpec('Kidney Shot', 'Adds poise damage.', { poise: 1 }), mkSpec('Dirty Fighting', 'Also blinds.', { add: [['blind', 0.6, 1]] }), mkSpec('Interrupt', 'Breaks telegraphs.', { interrupt: true })])],
    [mkActive('shadowstep', [mkSpec('Death Mark', '+35% power.', { p: 0.35 }), mkSpec('Ambush', 'Stuns.', { add: [['stun', 0.4, 1]] }), mkSpec('Skywalk', 'Reaches fliers.', { reachFlyers: true }), mkSpec('Fade Out', 'Hidden afterwards.', { self: [['stealth', 1, 1]] })]),
     mkActive('smoke_bomb', [mkSpec('Thick Smoke', 'Blind 70%.', { up: { blind: 0.3 } }), mkSpec('Choking', 'Enemies poisoned.', { enemy: [['poison', 0.6, 1]] }), mkSpec('Escape Artist', 'Party hidden.', { party: [['stealth', 0.5, 1]] }), mkSpec('Pocket Bombs', '−2 cooldown.', { cd: -2 })]),
     mkActive('eviscerate', [mkSpec('Butcher', '+35% power.', { p: 0.35 }), mkSpec('Keep Bleeding', 'Leaves a bleed.', { add: [['bleed', 1, 2]] }), mkSpec('Finisher', 'Kills below 25%.', { execute: 0.25 }), mkSpec('Relentless', 'A kill resets the cooldown.', { killReset: true })]),
     mkActive('expose_weakness', [mkSpec('Glaring Flaw', 'Also weakens.', { add: [['weaken', 0.8, 2]] }), mkSpec('Longer', '+1 round.', { dur: 1 }), mkSpec('Called Shot', 'Also stuns.', { add: [['stun', 0.3, 1]] }), mkSpec('Share Intel', 'Party inspired.', { party: [['inspired', 1, 2]] })])],
  ] },
  ranger: { base: 'aimed_shot', tiers: [
    [mkActive('aimed_shot', [mkSpec('Longbowman', '+35% power.', { p: 0.35 }), mkSpec('Barbed Head', 'Adds bleed.', { add: [['bleed', 0.6, 1]] }), mkSpec('Piercing Shot', 'Passes through to a second foe.', { chain: 1 }), mkSpec('Headshot', 'Kills below 15%.', { execute: 0.15 })]),
     mkActive('volley', [mkSpec('Heavy Volley', '+35% power.', { p: 0.35 }), mkSpec('Fire Arrows', 'Sets foes alight.', { add: [['burn', 0.35, 3]] }), mkSpec('Suppressing', 'Slows.', { add: [['slow', 0.35, 1]] }), mkSpec('Quick Draw', '−1 cooldown.', { cd: -1 })]),
     mkActive('mark', [mkSpec('Hunter\'s Focus', 'Also sunders.', { add: [['sunder', 1, 3]] }), mkSpec('Longer Hunt', '+2 rounds.', { dur: 2 }), mkSpec('Pack Hunt', 'Party inspired.', { party: [['inspired', 1, 2]] }), mkSpec('Quarry', '−2 cooldown.', { cd: -2 })]),
     mkActive('pinning_shot', [mkSpec('Heavy Pin', '+35% power.', { p: 0.35 }), mkSpec('Net Shot', 'Root 100%, longer.', { up: { root: 0.2 }, dur: 1 }), mkSpec('Crippling', 'Also slows.', { add: [['slow', 0.7, 2]] }), mkSpec('Quick Pin', '−1 cooldown.', { cd: -1 })])],
    [mkActive('elemental_quiver', [mkSpec('Frost Arrows', 'Arrows freeze instead.', { infuse: 'frost' }), mkSpec('Storm Arrows', 'Arrows shock instead.', { infuse: 'storm' }), mkSpec('Deep Quiver', '+2 rounds.', { dur: 2 }), mkSpec('Empowered Quiver', 'Also empowered.', { self: [['empower', 1, 3]] })]),
     mkActive('beast_command', [mkSpec('Alpha', 'Beasts fortified.', { party: [['fortify', 1, 2]] }), mkSpec('Sic \'Em', 'Beasts inspired.', { party: [['inspired', 1, 2]] }), mkSpec('Pack Leader', '+2 rounds.', { dur: 2 }), mkSpec('Quick Command', '−2 cooldown.', { cd: -2 })]),
     mkActive('rain_of_arrows', [mkSpec('Downpour', '+35% power.', { p: 0.35 }), mkSpec('Barbed Rain', 'Bleeds.', { add: [['bleed', 0.4, 1]] }), mkSpec('Grounding Rain', 'Drags fliers down.', { grounds: true }), mkSpec('Quick Rain', '−1 cooldown.', { cd: -1 })]),
     mkActive('trap_line', [mkSpec('Spiked', '+60% power.', { p: 0.6 }), mkSpec('Bear Traps', 'Root 70%.', { up: { root: 0.4 } }), mkSpec('Firetraps', 'Burns.', { add: [['burn', 0.6, 3]] }), mkSpec('Everywhere', 'Hits every enemy.', { shape: 'all' })])],
  ] },
  monk: { base: 'flurry', tiers: [
    [mkActive('flurry', [mkSpec('Iron Fist', '+35% power.', { p: 0.35 }), mkSpec('Fourth Strike', '+1 hit.', { hits: 1 }), mkSpec('Open Hand', 'Knocks prone (stun).', { add: [['stun', 0.25, 1]] }), mkSpec('Quick Hands', '−1 cooldown.', { cd: -1 })]),
     mkActive('stunning_strike', [mkSpec('Nerve Strike', 'Stun 80%.', { up: { stun: 0.3 } }), mkSpec('Deep Stun', 'Poise damage.', { poise: 1 }), mkSpec('Chain Palm', 'Also strikes a second foe.', { chain: 1 }), mkSpec('Interrupt', 'Breaks telegraphs.', { interrupt: true })]),
     mkActive('stillness', [mkSpec('Deep Calm', 'Also cleanses.', { cleanse: 2 }), mkSpec('Inner Peace', 'More healing.', { self: [['regen', 1, 4]] }), mkSpec('Diamond Soul', 'Cannot be controlled.', { self: [['resolute', 1, 2]] }), mkSpec('Quick Breath', '−2 cooldown.', { cd: -2 })]),
     mkActive('deflect', [mkSpec('Catch Arrows', 'Longer.', { dur: 1 }), mkSpec('Return to Sender', 'Stronger reflection.', { self: [['thorns', 1, 3]] }), mkSpec('Slippery', 'More evasion.', { self: [['evasive', 1, 3]] }), mkSpec('Flowing', '−2 cooldown.', { cd: -2 })])],
    [mkActive('quivering_palm', [mkSpec('Resonance', '+50% power.', { p: 0.5 }), mkSpec('Shatter Spirit', 'Also stuns.', { add: [['stun', 0.4, 1]] }), mkSpec('Deathtouch', 'Kills below 20%.', { execute: 0.2 }), mkSpec('Quick Palm', '−1 cooldown.', { cd: -1 })]),
     mkActive('wind_step', [mkSpec('Gale', '+35% power.', { p: 0.35 }), mkSpec('Grounding Kick', 'Drags fliers down.', { grounds: true }), mkSpec('Cyclone', 'Hits every enemy.', { shape: 'all', p: -0.4 }), mkSpec('Afterimage', 'Evasive after.', { self: [['evasive', 1, 2]] })]),
     mkActive('pressure_points', [mkSpec('Paralysis', 'Stuns.', { add: [['stun', 0.35, 1]] }), mkSpec('Longer', '+1 round.', { dur: 1 }), mkSpec('Dim Mak', 'Adds doom.', { add: [['doom', 0.6, 3]] }), mkSpec('Quick Touch', '−1 cooldown.', { cd: -1 })]),
     mkActive('ki_surge', [mkSpec('Flame Fist', 'Fire instead of storm.', { infuse: 'fire' }), mkSpec('Frost Fist', 'Frost instead of storm.', { infuse: 'frost' }), mkSpec('Deep Ki', '+2 rounds.', { dur: 2 }), mkSpec('Quick Ki', '−2 cooldown.', { cd: -2 })])],
  ] },
  wizard: { base: 'firebolt', tiers: [
    [mkActive('firebolt', [mkSpec('Searing', '+35% power.', { p: 0.35 }), mkSpec('Kindling', 'Burn 60%.', { up: { burn: 0.35 } }), mkSpec('Twin Bolt', 'Also hits a second foe.', { chain: 1 }), mkSpec('Ember Echo', 'A kill spreads its burn.', { killSpread: 'burn' })]),
     mkActive('ray_of_frost', [mkSpec('Bitter', '+35% power.', { p: 0.35 }), mkSpec('Deep Cold', '+1 chill.', { st: { chill: 1 } }), mkSpec('Frost Lance', 'Also pierces a second foe.', { chain: 1 }), mkSpec('Grounding Ray', 'Drags fliers down.', { grounds: true })]),
     mkActive('magic_missile', [mkSpec('Extra Dart', '+1 dart.', { hits: 1 }), mkSpec('Arcane Sunder', 'Sunders.', { add: [['sunder', 0.5, 2]] }), mkSpec('Seeking', 'Darts finish the weakest.', { execute: 0.1 }), mkSpec('Overload', '+35% power.', { p: 0.35 })]),
     mkActive('mage_shield', [mkSpec('Thick Ward', '+60% barrier.', { barrier: 0.15 }), mkSpec('Reactive', 'Chills attackers.', { self: [['frostarmor', 1, 3]] }), mkSpec('Ward Ally', 'Shields the most endangered ally.', { shape: 'ally' }), mkSpec('Quick Ward', '−1 cooldown.', { cd: -1 })])],
    [mkActive('fireball', [mkSpec('Inferno', '+35% power.', { p: 0.35 }), mkSpec('Conflagration', 'Burn 85%.', { up: { burn: 0.35 } }), mkSpec('Big Bang', 'Hits every enemy.', { shape: 'all', p: -0.1 }), mkSpec('Quickened', '−1 cooldown.', { cd: -1 })]),
     mkActive('lightning_bolt', [mkSpec('Thunderclap', '+35% power.', { p: 0.35 }), mkSpec('Paralysing', 'Stuns.', { add: [['stun', 0.25, 1]] }), mkSpec('Forked', 'Hits every enemy.', { shape: 'all', p: -0.1 }), mkSpec('Grounding', 'Drags fliers down.', { grounds: true })]),
     mkActive('counterspell', [mkSpec('Spell Break', 'Also sunders resistances.', { add: [['vulnerable', 0.8, 2]] }), mkSpec('Long Silence', '+1 round.', { dur: 1 }), mkSpec('Feedback', 'Deals arcane damage.', { dmg: 'arcane', kind: 'attack', p: 0.6 }), mkSpec('Quick Counter', '−1 cooldown.', { cd: -1 })]),
     mkActive('blink', [mkSpec('Mirror Image', 'Evasive afterwards.', { self: [['evasive', 1, 3]] }), mkSpec('Longer', '+1 round.', { dur: 1 }), mkSpec('Arcane Recovery', 'Cleanses.', { cleanse: 2 }), mkSpec('Quick Blink', '−2 cooldown.', { cd: -2 })])],
  ] },
  warlock: { base: 'eldritch_blast', tiers: [
    [mkActive('eldritch_blast', [mkSpec('Agonizing', '+35% power.', { p: 0.35 }), mkSpec('Repelling', 'Slows.', { add: [['slow', 0.4, 1]] }), mkSpec('Third Beam', '+1 beam.', { hits: 1 }), mkSpec('Grasp of Hadar', 'Pulls back-liners forward.', { pull: true })]),
     mkActive('hex', [mkSpec('Malediction', '+1 round.', { dur: 1 }), mkSpec('Withering', 'Adds doom.', { add: [['doom', 0.5, 3]] }), mkSpec('Spread Hex', 'Hexes every enemy.', { shape: 'all' }), mkSpec('Quick Hex', '−1 cooldown.', { cd: -1 })]),
     mkActive('drain', [mkSpec('Vampiric Touch', '+35% power.', { p: 0.35 }), mkSpec('Soul Siphon', 'Heals more.', { leech: 0.3 }), mkSpec('Enervate', 'Drains max HP.', { add: [['drained', 0.6, 1]] }), mkSpec('Quick Drain', '−1 cooldown.', { cd: -1 })]),
     mkActive('armor_of_frost', [mkSpec('Glacial', '+60% barrier.', { barrier: 0.12 }), mkSpec('Deep Freeze', 'Longer.', { dur: 2 }), mkSpec('Frost Nova', 'Chills every enemy.', { enemy: [['chill', 0.7, 1]] }), mkSpec('Quick Armor', '−1 cooldown.', { cd: -1 })])],
    [mkActive('summon_imp', [mkSpec('Two Imps', 'Summons two.', { summonN: 1 }), mkSpec('Pact Bond', 'Heals you a little.', { self: [['regen', 1, 3]] }), mkSpec('Quasit', 'A quasit instead.', { summonId: 'quasit' }), mkSpec('Quick Call', '−2 cooldown.', { cd: -2 })]),
     mkActive('hunger_of_hadar', [mkSpec('Void', '+35% power.', { p: 0.35 }), mkSpec('Deep Dark', 'Blind 80%.', { up: { blind: 0.3 } }), mkSpec('Frozen Void', 'More chill.', { up: { chill: 0.4 } }), mkSpec('Quick Void', '−1 cooldown.', { cd: -1 })]),
     mkActive('curse_of_doom', [mkSpec('Inevitable', '+50% power.', { p: 0.5 }), mkSpec('Weakening Curse', 'Also weakens.', { add: [['weaken', 1, 3]] }), mkSpec('Plague of Doom', 'Curses every enemy.', { shape: 'all', p: -0.4 }), mkSpec('Quick Curse', '−1 cooldown.', { cd: -1 })]),
     mkActive('dark_pact', [mkSpec('Cheaper Pact', 'Costs less blood.', { selfDamage: -0.08 }), mkSpec('Dark Power', 'Also empowered.', { self: [['empower', 1, 3]] }), mkSpec('Shadow Shield', 'A barrier too.', { barrier: 0.15 }), mkSpec('Frequent Pacts', '−3 cooldown.', { cd: -3 })])],
  ] },
  cleric: { base: 'mend', tiers: [
    [mkActive('mend', [mkSpec('Greater Mend', '+45% healing.', { heal: 0.45 }), mkSpec('Purifying Touch', 'Cleanses a debuff.', { cleanse: 1 }), mkSpec('Healing Word', '−1 cooldown.', { cd: -1 }), mkSpec('Guardian Angel', 'Fires on its own below 25%.', { lastStand: 0.25 })]),
     mkActive('bless', [mkSpec('Greater Blessing', 'Party fortified too.', { party: [['fortify', 1, 3]] }), mkSpec('Long Blessing', '+2 rounds.', { dur: 2 }), mkSpec('Divine Favour', 'Party empowered.', { party: [['empower', 1, 2]] }), mkSpec('Swift Blessing', '−2 cooldown.', { cd: -2 })]),
     mkActive('sacred_flame', [mkSpec('Burning Light', '+35% power.', { p: 0.35 }), mkSpec('Blinding', 'Blinds.', { add: [['blind', 0.6, 2]] }), mkSpec('Twin Flames', 'Also hits a second foe.', { chain: 1 }), mkSpec('Purge', 'Brutal on undead and fiends.', { vs: { undead: 1.4, fiend: 1.4 } })]),
     mkActive('turn_undead', [mkSpec('Destroy Undead', 'Deals holy damage too.', { dmg: 'holy', kind: 'aoe', p: 0.4 }), mkSpec('Longer', '+1 round.', { dur: 1 }), mkSpec('Holy Terror', 'Fear 100%.', { up: { fear: 0.2 } }), mkSpec('Quick Turn', '−1 cooldown.', { cd: -1 })])],
    [mkActive('mass_heal', [mkSpec('Greater Mass Heal', '+40% healing.', { heal: 0.4 }), mkSpec('Mass Purify', 'Cleanses the party.', { cleanse: 1 }), mkSpec('Lingering', 'Party regenerates.', { party: [['regen', 1, 3]] }), mkSpec('Quick Prayer', '−1 cooldown.', { cd: -1 })]),
     mkActive('spirit_guardians', [mkSpec('Wrathful Spirits', '+35% power.', { p: 0.35 }), mkSpec('Warding Spirits', 'Also fortified.', { self: [['fortify', 1, 3]] }), mkSpec('Lasting', '+2 rounds.', { dur: 2 }), mkSpec('Quick Spirits', '−2 cooldown.', { cd: -2 })]),
     mkActive('cleanse', [mkSpec('Deep Cleanse', '+2 cleansed.', { cleanse: 2 }), mkSpec('Warding Cleanse', 'Party brave.', { party: [['brave', 1, 3]] }), mkSpec('Healing Cleanse', 'Heals too.', { party: [['regen', 1, 2]] }), mkSpec('Quick Cleanse', '−2 cooldown.', { cd: -2 })]),
     mkActive('revivify', [mkSpec('Full Revival', 'Rises at 60% HP.', { revive: 0.3 }), mkSpec('Twice Blessed', 'Can be cast twice.', { cd: -95 }), mkSpec('Shelter', 'The risen are shielded.', { barrier: 0.2 }), mkSpec('Rise Angry', 'The risen are empowered.', { party: [['empower', 1, 2]] })])],
  ] },
  druid: { base: 'regrowth', tiers: [
    [mkActive('regrowth', [mkSpec('Lush', '+45% healing.', { heal: 0.45 }), mkSpec('Blossom', 'Longer regeneration.', { dur: 2 }), mkSpec('Nature\'s Cure', 'Cleanses a debuff.', { cleanse: 1 }), mkSpec('Quick Growth', '−1 cooldown.', { cd: -1 })]),
     mkActive('thorns', [mkSpec('Barbed Vines', '+35% power.', { p: 0.35 }), mkSpec('Toxic Thorns', '+2 poison.', { st: { poison: 2 } }), mkSpec('Vine Lash', 'Also hits a second foe.', { chain: 1 }), mkSpec('Quick Whip', '−1 cooldown.', { cd: -1 })]),
     mkActive('entangle', [mkSpec('Strangling', 'Deals damage too.', { dmg: 'nature', kind: 'aoe', p: 0.3 }), mkSpec('Deep Roots', 'Root 85%.', { up: { root: 0.3 } }), mkSpec('Thorny', 'Poisons too.', { add: [['poison', 0.5, 1]] }), mkSpec('Longer', '+1 round.', { dur: 1 })]),
     mkActive('call_lightning', [mkSpec('Storm Call', '+35% power.', { p: 0.35 }), mkSpec('Thunderstruck', 'Stuns.', { add: [['stun', 0.25, 1]] }), mkSpec('Chain Lightning', 'Arcs to a second foe.', { chain: 1 }), mkSpec('Rainfall', 'Soaks the target (wet).', { add: [['wet', 1, 3]] })])],
    [mkActive('wild_shape', [mkSpec('Dire Bear', 'Thicker hide.', { barrier: 0.2 }), mkSpec('Mauling', 'Stronger claws.', { self: [['inspired', 1, 4]] }), mkSpec('Long Shape', '+2 rounds.', { dur: 2 }), mkSpec('Quick Shift', '−3 cooldown.', { cd: -3 })]),
     mkActive('insect_plague', [mkSpec('Locusts', '+1 poison.', { st: { poison: 1 } }), mkSpec('Blinding Swarm', 'Blinds.', { add: [['blind', 0.4, 1]] }), mkSpec('Long Plague', '+1 round.', { dur: 1 }), mkSpec('Quick Swarm', '−1 cooldown.', { cd: -1 })]),
     mkActive('barkskin', [mkSpec('Ironbark', 'Longer.', { dur: 2 }), mkSpec('Thornskin', 'Reflects damage.', { self: [['thorns', 1, 3]] }), mkSpec('Grove', 'The whole party.', { shape: 'party' }), mkSpec('Quick Bark', '−1 cooldown.', { cd: -1 })]),
     mkActive('moonbeam', [mkSpec('Full Moon', '+35% power.', { p: 0.35 }), mkSpec('Silver Burn', 'Blinds.', { add: [['blind', 0.5, 2]] }), mkSpec('Moonfall', 'Hits the whole row.', { shape: 'front', p: -0.3 }), mkSpec('Quick Beam', '−1 cooldown.', { cd: -1 })])],
  ] },
  bard: { base: 'inspire', tiers: [
    [mkActive('inspire', [mkSpec('Rousing', 'Party empowered.', { party: [['empower', 1, 2]] }), mkSpec('Long Song', '+2 rounds.', { dur: 2 }), mkSpec('Brave Song', 'Party brave.', { party: [['brave', 1, 3]] }), mkSpec('Quick Verse', '−2 cooldown.', { cd: -2 })]),
     mkActive('vicious_mockery', [mkSpec('Cutting Words', '+35% power.', { p: 0.35 }), mkSpec('Humiliate', 'Also vulnerable.', { add: [['vulnerable', 0.8, 2]] }), mkSpec('Heckle', 'Also confuses.', { add: [['confuse', 0.3, 1]] }), mkSpec('Quick Wit', '−1 cooldown.', { cd: -1 })]),
     mkActive('discord', [mkSpec('Cacophony', 'Weaken 90%.', { up: { weaken: 0.3 } }), mkSpec('Dissonance', 'Also confuses.', { add: [['confuse', 0.25, 1]] }), mkSpec('Longer', '+1 round.', { dur: 1 }), mkSpec('Quick Discord', '−1 cooldown.', { cd: -1 })]),
     mkActive('song_of_rest', [mkSpec('Lullaby', '+45% healing.', { heal: 0.45 }), mkSpec('Soothing', 'Cleanses.', { cleanse: 1 }), mkSpec('Long Rest', 'Longer regeneration.', { dur: 2 }), mkSpec('Quick Song', '−1 cooldown.', { cd: -1 })])],
    [mkActive('hypnotic_pattern', [mkSpec('Mesmerize', 'Sleep 60%.', { up: { sleep: 0.2 } }), mkSpec('Deep Trance', '+1 round.', { dur: 1 }), mkSpec('Fascinate', 'Also charms.', { add: [['charm', 0.2, 1]] }), mkSpec('Quick Pattern', '−1 cooldown.', { cd: -1 })]),
     mkActive('countercharm', [mkSpec('Resolute Song', 'Party resolute.', { party: [['resolute', 1, 2]] }), mkSpec('Long Chorus', '+2 rounds.', { dur: 2 }), mkSpec('Cleansing Chorus', 'Cleanses more.', { cleanse: 2 }), mkSpec('Quick Chorus', '−2 cooldown.', { cd: -2 })]),
     mkActive('dissonant_whispers', [mkSpec('Maddening', '+35% power.', { p: 0.35 }), mkSpec('Terrifying', 'Fear 90%.', { up: { fear: 0.2 } }), mkSpec('Mind Rot', 'Also doom.', { add: [['doom', 0.5, 3]] }), mkSpec('Quick Whisper', '−1 cooldown.', { cd: -1 })]),
     mkActive('heroism', [mkSpec('Legendary', '+100% barrier.', { barrier: 0.1 }), mkSpec('Epic', 'Party inspired.', { party: [['inspired', 1, 3]] }), mkSpec('Saga', 'Party regenerates.', { party: [['regen', 1, 3]] }), mkSpec('Quick Heroics', '−2 cooldown.', { cd: -2 })])],
  ] },
  artificer: { base: 'turret', tiers: [
    [mkActive('turret', [mkSpec('Heavy Turret', '+50% turret damage.', { p: 0.5 }), mkSpec('Flame Turret', 'Burns targets.', { turretStatus: 'burn' }), mkSpec('Frost Turret', 'Chills targets.', { turretStatus: 'chill' }), mkSpec('Quick Deploy', '−2 cooldown.', { cd: -2 })]),
     mkActive('overcharge', [mkSpec('Supercharge', '+35% power.', { p: 0.35 }), mkSpec('Arc Flash', 'Blinds.', { add: [['blind', 0.4, 1]] }), mkSpec('Chain Surge', 'Arcs to a second foe.', { chain: 1 }), mkSpec('Stable Core', 'No longer risky.', { risky: false })]),
     mkActive('alchemical_flask', [mkSpec('Potent Mix', '+35% power.', { p: 0.35 }), mkSpec('Splash', 'Hits the front row.', { shape: 'front', p: -0.3, kind: 'aoe' }), mkSpec('Sticky', 'Also oils the target.', { add: [['oiled', 1, 3]] }), mkSpec('Quick Mix', '−1 cooldown.', { cd: -1 })]),
     mkActive('infuse_weapon', [mkSpec('Fire Infusion', 'Fire instead.', { infuse: 'fire' }), mkSpec('Frost Infusion', 'Frost instead.', { infuse: 'frost' }), mkSpec('Long Infusion', '+2 rounds.', { dur: 2 }), mkSpec('Power Infusion', 'Also empowers.', { party: [['empower', 1, 2]] })])],
    [mkActive('iron_defender', [mkSpec('Heavier Plating', 'A stronger construct.', { summonId: 'shield_guardian' }), mkSpec('Twin Defenders', 'Deploys two.', { summonN: 1 }), mkSpec('Repair Kit', 'You regenerate.', { self: [['regen', 1, 3]] }), mkSpec('Redeploy', 'Can deploy again.', { cd: -94 })]),
     mkActive('tesla_coil', [mkSpec('High Voltage', '+35% power.', { p: 0.35 }), mkSpec('Paralysing', 'Stuns.', { add: [['stun', 0.2, 1]] }), mkSpec('Grounding Field', 'Drags fliers down.', { grounds: true }), mkSpec('Quick Coil', '−1 cooldown.', { cd: -1 })]),
     mkActive('flash_repair', [mkSpec('Overhaul', '+45% healing.', { heal: 0.45 }), mkSpec('Plating', '+100% barrier.', { barrier: 0.1 }), mkSpec('Field Repair', 'The whole party.', { shape: 'party', heal: -0.3 }), mkSpec('Quick Fix', '−1 cooldown.', { cd: -1 })]),
     mkActive('thunder_cannon', [mkSpec('Big Bore', '+35% power.', { p: 0.35 }), mkSpec('Concussive', 'Stun 70%.', { up: { stun: 0.3 } }), mkSpec('Scattershot', 'Hits the front row.', { shape: 'front', kind: 'aoe', p: -0.4 }), mkSpec('Quick Reload', '−1 cooldown.', { cd: -1 })])],
  ] },
};
export const TREE_CLASSES = Object.keys(TREES);

// --- tree queries --------------------------------------------------------------
/** A class's tiers: the base two, plus the two of its prestige path if chosen. */
export function tiersOf(klass, prestige = null) {
  const tree = TREES[klass];
  if (!tree) return [];
  const extra = prestige && PRESTIGE_TIERS[klass] && PRESTIGE_TIERS[klass][prestige];
  return extra ? [...tree.tiers, ...extra] : tree.tiers;
}
/** Every node in a class tree: { id, tier, active, parent?, spec? }. Cached. */
const NODE_CACHE = {};
export function treeNodes(klass, prestige = null) {
  const key = klass + ':' + (prestige || '');
  if (NODE_CACHE[key]) return NODE_CACHE[key].list;
  if (!TREES[klass]) return [];
  const list = [];
  tiersOf(klass, prestige).forEach((tier, ti) => {
    for (const a of tier) {
      list.push({ id: a.id, tier: ti, active: true });
      a.specs.forEach((sp, k) => list.push({ id: `${a.id}.${k}`, tier: ti, active: false, parent: a.id, spec: sp }));
    }
  });
  NODE_CACHE[key] = { list, byId: new Map(list.map(n => [n.id, n])) };
  return list;
}
function nodeById(klass, id, prestige = null) { treeNodes(klass, prestige); const c = NODE_CACHE[klass + ':' + (prestige || '')]; return c ? c.byId.get(id) : undefined; }
export function nodeTier(klass, nodeId, prestige = null) { const n = nodeById(klass, nodeId, prestige); return n ? n.tier : -1; }

/** A fresh tree state for a character of this class at this level. */
export function newTree(npc) {
  const tree = TREES[npc.klass];
  if (!tree) return null;
  return { owned: [tree.base], loadout: [tree.base], version: 1, prestige: null };
}
export function pointsEarned(npc) { return Math.max(0, npc.level - 1) + (npc.race === 'human' ? 1 : 0); }
export function pointsSpent(npc) { return npc.tree ? npc.tree.owned.length - 1 : 0; }
export function pointsFree(npc) { return npc.tree ? pointsEarned(npc) - pointsSpent(npc) : 0; }
export function tierOpen(npc, tier) {
  if (npc.level < TIER_LEVELS[tier]) return false;
  // Tiers 3–4 are taught only by a school's upgrade, through a prestige path.
  if (tier >= 2 && !(npc.tree && npc.tree.prestige)) return false;
  return !!tiersOf(npc.klass, npc.tree && npc.tree.prestige)[tier];
}

/** Can this node be bought right now? Returns '' or a reason. */
export function canBuy(npc, nodeId) {
  if (!npc.tree) return 'This class has no tree.';
  if (npc.tree.owned.includes(nodeId)) return 'Already learned.';
  const pr = npc.tree.prestige;
  const node = nodeById(npc.klass, nodeId, pr);
  if (!node) return 'Not in this tree.';
  if (!tierOpen(npc, node.tier)) return node.tier >= 2 ? `Tier ${node.tier + 1} needs a prestige path (academy) and level ${TIER_LEVELS[node.tier]}.` : `Opens at level ${TIER_LEVELS[node.tier]}.`;
  if (pointsFree(npc) <= 0) return 'No skill points left.';
  if (node.parent && !npc.tree.owned.includes(node.parent)) return 'Learn the ability first.';
  const inTier = npc.tree.owned.filter(id => nodeTier(npc.klass, id, pr) === node.tier).length;
  const baseHere = nodeTier(npc.klass, TREES[npc.klass].base) === node.tier ? 1 : 0;
  if (inTier - baseHere >= TIER_CAP) return `Only ${TIER_CAP} choices per tier — half of what it offers.`;
  return '';
}
export function buyNode(npc, nodeId) {
  const why = canBuy(npc, nodeId);
  if (why) return why;
  npc.tree.owned.push(nodeId);
  npc.tree.version++;
  if (!nodeId.includes('.') && npc.tree.loadout.length < LOADOUT_SLOTS) npc.tree.loadout.push(nodeId);
  syncAbilities(npc);
  return '';
}
/** Put an owned active in or out of the four combat slots. */
export function toggleLoadout(npc, id) {
  const t = npc.tree;
  if (!t || !(t.owned.includes(id) || (npc.learned || []).includes(id)) || id.includes('.')) return false;
  if (t.loadout.includes(id)) t.loadout = t.loadout.filter(x => x !== id);
  else if (t.loadout.length < LOADOUT_SLOTS) t.loadout.push(id);
  else return false;
  t.version++;
  syncAbilities(npc);
  return true;
}
export function resetTree(npc) {
  if (!npc.tree) return;
  const prestige = npc.tree.prestige;
  npc.tree = newTree(npc);
  npc.tree.prestige = prestige;
  syncAbilities(npc);
}
/** The abilities combat sees are the loadout. */
export function syncAbilities(npc) {
  if (npc.tree) npc.abilities = npc.tree.loadout.filter(a => ABILITIES[a]);
}

/**
 * Spend free points by a sensible default build: actives in tree order,
 * then their specialisations, keeping the loadout full.
 */
export function autoAllocate(npc, rng) {
  if (!npc.tree) return;
  const nodes = treeNodes(npc.klass, npc.tree.prestige);
  let guard = 0;
  while (pointsFree(npc) > 0 && guard++ < 80) {
    const open = nodes.filter(n => !canBuy(npc, n.id));
    if (!open.length) break;
    // Prefer an active while the loadout has room, then specs of loadout actives.
    const actives = open.filter(n => n.active);
    const specs = open.filter(n => !n.active && npc.tree.loadout.includes(n.parent));
    const pool = npc.tree.loadout.length < LOADOUT_SLOTS && actives.length ? actives : specs.length ? specs : open;
    const pick = rng ? pool[Math.floor(rng.next() * Math.min(pool.length, 3))] : pool[0];
    buyNode(npc, pick.id);
  }
}

// --- merged ability definitions --------------------------------------------------
/** An ability as this character casts it, with owned specialisations applied. */
export function effectiveAbility(npc, id) {
  const base = ABILITIES[id];
  if (!base || !npc.tree) return base;
  const specs = npc.tree.owned.filter(n => n.startsWith(id + '.'));
  if (!specs.length) return base;
  const key = id + '@' + npc.tree.version;
  const cache = npc._abil || (npc._abil = {});
  if (cache[key]) return cache[key];
  let entry = null;
  for (const tier of tiersOf(npc.klass, npc.tree.prestige)) for (const a of tier) if (a.id === id) entry = a;
  const ab = { ...base, apply: [...(base.apply || [])].map(r => [...r]) };
  let pAdd = 0;
  for (const n of specs) {
    const k = +n.split('.')[1];
    const fx = entry && entry.specs[k] && entry.specs[k].fx;
    if (!fx) continue;
    if (fx.p) pAdd += fx.p;
    if (fx.cd) ab.cd = Math.max(1, ab.cd + fx.cd);
    if (fx.hits) ab.hits = (ab.hits || 1) + fx.hits;
    if (fx.add) ab.apply.push(...fx.add.map(r => [...r]));
    if (fx.up) for (const [st, v] of Object.entries(fx.up)) for (const r of ab.apply) if (r[0] === st) r[1] = Math.min(1, r[1] + v);
    if (fx.st) for (const [st, v] of Object.entries(fx.st)) for (const r of ab.apply) if (r[0] === st) r[2] = (r[2] || 1) + v;
    if (fx.dur) for (const r of ab.apply) r[2] = (r[2] || 1) + fx.dur;
    for (const f of ['shape', 'dive', 'reachFlyers', 'interrupt', 'grounds', 'autoHit', 'killReset', 'lastStand', 'execute', 'killSpread', 'infuse', 'turretStatus', 'pull', 'opener', 'summonId', 'range', 'kind', 'dmg']) if (fx[f] !== undefined) ab[f] = fx[f];
    if (fx.risky === false) ab.risky = false;
    if (fx.leech) ab.leech = (ab.leech || 0) + fx.leech;
    if (fx.heal) ab.healMult = (ab.healMult || 1) + fx.heal;
    if (fx.barrier) ab.barrier = (ab.barrier || 0) + fx.barrier;
    if (fx.revive) ab.revive = (ab.revive || 0) + fx.revive;
    if (fx.chain) ab.chain = (ab.chain || 0) + fx.chain;
    if (fx.poise) ab.poise = (ab.poise || 1) + fx.poise;
    if (fx.cleanse) ab.cleanse = (ab.cleanse || 0) + fx.cleanse;
    if (fx.selfDamage) ab.selfDamage = Math.max(0, (ab.selfDamage || 0) + fx.selfDamage);
    if (fx.summonN) ab.summon = [ab.summon[0], ab.summon[1] + fx.summonN];
    if (fx.vs) ab.bonusVs = { ...(ab.bonusVs || {}), ...fx.vs };
    if (fx.self) ab.selfApply = [...(ab.selfApply || []), ...fx.self];
    if (fx.party) ab.partyApply = [...(ab.partyApply || []), ...fx.party];
    if (fx.enemy) ab.enemyApply = [...(ab.enemyApply || []), ...fx.enemy];
  }
  if (ab.summonId && ab.summon) ab.summon = [ab.summonId, ab.summon[1]];
  if (ab.kind === 'aoe' && !ab.range) ab.range = 'ranged';
  if (ab.kind === 'aoe' && ab.shape === 'single') ab.shape = 'front';
  ab.power = base.power * (1 + pAdd);
  cache[key] = ab;
  return ab;
}

// --- levelling -------------------------------------------------------------------
/**
 * Add class XP; returns levels gained. Stat focus grows the class's primary
 * attribute every third level and its secondary every fifth.
 */
export function gainLevelXp(npc, xp) {
  npc.delveXp = (npc.delveXp || 0) + xp;
  let gained = 0;
  while (npc.level < LEVEL_CAP && npc.delveXp >= xpToNext(npc.level)) {
    npc.delveXp -= xpToNext(npc.level);
    npc.level++;
    gained++;
    const C = CLASSES[npc.klass];
    const info = CLASS_INFO[npc.klass];
    if (C && npc.level % 3 === 0) npc.attributes[C.primary] = Math.min(30, npc.attributes[C.primary] + 1);
    if (info && npc.level % 5 === 0) npc.attributes[info.secondary] = Math.min(30, npc.attributes[info.secondary] + 1);
    const conMod = Math.floor((npc.attributes.con - 10) / 2);
    const hd = C ? C.hitDie : 8;
    const add = Math.max(2, Math.round((hd * 0.5 + conMod) * 1.2));
    npc.maxHp += add;
    npc.hp = Math.min(npc.maxHp, npc.hp + add);
  }
  if (npc.level >= LEVEL_CAP) npc.delveXp = 0;
  return gained;
}
/** XP a fight's kills are worth, split among the survivors. */
export function killXp(foe) { return Math.round((16 + (foe.level || 1) * 8) * (foe.boss ? 3 : 1)); }

// --- prestige and changing class -------------------------------------------------
/** Take a prestige path. The caller checks the academy; this checks the rest. */
export function choosePrestigePath(npc, pathId) {
  if (!npc.tree) return 'This class has no tree.';
  if (npc.tree.prestige) return 'A path is already chosen.';
  if (npc.level < TIER_LEVELS[2]) return `Prestige opens at level ${TIER_LEVELS[2]}.`;
  if (!(PRESTIGE_TIERS[npc.klass] && PRESTIGE_TIERS[npc.klass][pathId])) return 'No such path.';
  npc.tree.prestige = pathId;
  npc.tree.version++;
  return '';
}

// The primary attribute a class asks for. Kept low enough that a founding
// peasant can reach it in a few days: recruits walk in already classed, and a
// camp that can't promote its own falls behind them.
export const CLASS_ATTR_BAR = 11;
/** Can this character learn that class at all? */
export function classRequirement(npc, klass) {
  const C = CLASSES[klass];
  if (!C || !TREES[klass]) return 'Not a trainable class.';
  if (npc.klass === klass) return 'Already that class.';
  const attr = npc.attributes[C.primary] || 0;
  const mainSkill = Object.entries(C.skills).sort((a, b) => b[1] - a[1])[0][0];
  const burning = npc.passions && npc.passions[mainSkill] === 'burning';
  if (attr < CLASS_ATTR_BAR && !(burning && attr >= CLASS_ATTR_BAR - 2)) {
    const drill = CLASS_INFO[klass] && CLASS_INFO[klass].school === 'combat' ? ' Drill at a Training Dummy to raise it.' : '';
    return `Needs ${C.primary.toUpperCase()} ${CLASS_ATTR_BAR} (has ${attr}).${drill}`;
  }
  return '';
}

// --- drilling: the Training Dummy's way into a Combat class --------------------
// A peasant too weak or slow for any Combat class can drill until they aren't:
// every DRILL_SESSIONS sessions at a dummy lift the most promising Combat
// attribute by one, and it stops at the bar, not a way past it.
export const DRILL_SESSIONS = 3;
export const DRILL_CAP = CLASS_ATTR_BAR;
/** The attribute drilling would raise, or null once any Combat class is open to them. */
export function drillTarget(npc) {
  if (CLASS_INFO[npc.klass] && CLASS_INFO[npc.klass].school === 'combat') return null;
  let best = null;
  for (const [k, info] of Object.entries(CLASS_INFO)) {
    if (info.school !== 'combat') continue;
    const attr = CLASSES[k].primary, v = npc.attributes[attr] || 0;
    if (!classRequirement(npc, k)) return null;
    if (v < DRILL_CAP && (!best || v > best.value)) best = { attr, value: v, klass: k };
  }
  return best;
}
/** One session at the dummy. Returns the attribute raised this session, if any. */
export function drillSession(npc) {
  const t = drillTarget(npc);
  if (!t) return null;
  npc.drill = (npc.drill || 0) + 1;
  if (npc.drill < DRILL_SESSIONS) return null;
  npc.drill = 0;
  npc.attributes[t.attr] = Math.min(DRILL_CAP, (npc.attributes[t.attr] || 0) + 1);
  return t.attr;
}

/**
 * Become another class: keep level and attributes, pick up the class's skill
 * seed, and start its tree fresh with every point refunded.
 */
export function changeClass(npc, klass) {
  const C = CLASSES[klass];
  npc.klass = klass;
  for (const [sk, v] of Object.entries(C.skills)) npc.skills[sk] = Math.max(npc.skills[sk] || 0, Math.min(20, Math.round(v * 1.6 + npc.level * 0.3)));
  npc.tree = newTree(npc);
  npc._abil = null;
  syncAbilities(npc);
  return npc;
}
