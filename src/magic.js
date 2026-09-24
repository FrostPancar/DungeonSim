// ============================================================================
// THE MAGIC ECONOMY
// Abilities outside the class trees, and where they come from:
//   scrolls     one cast in a delve, carried on the potion belt
//   spellbooks  teach an ability for good; it takes a combat slot, not a point
//   the Arcane Peddler (a travelling caravan), the Spellmason (a shop in camp)
//   the Magic Lab, where spells are designed from parts and written into books
// ============================================================================
import { ABILITIES } from './data.js';

/**
 * The general pool. school decides who may learn it from a book: arcane needs
 * INT 13, divine WIS 13, martial STR or DEX 13. Scrolls need INT or WIS 12.
 */
export const GENERAL_SPELLS = {
  g_misty_step:   { name: 'Misty Step',      school: 'arcane',  kind: 'buff',   shape: 'self', cd: 4, power: 0.4, stat: 'arcana', spell: 'arcane', apply: [['stealth', 1, 1], ['evasive', 1, 2]], desc: 'Teleports out of harm\'s way.' },
  g_haste:        { name: 'Haste',           school: 'arcane',  kind: 'buff',   shape: 'ally', cd: 6, power: 0.5, stat: 'arcana', spell: 'arcane', allyStrongest: true, apply: [['haste', 1, 3]], desc: 'An ally acts twice as often.' },
  g_hold_person:  { name: 'Hold Person',     school: 'arcane',  kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 0.5, stat: 'arcana', spell: 'arcane', apply: [['stun', 0.7, 2]], desc: 'Paralyses a humanoid.' },
  g_web:          { name: 'Web',             school: 'arcane',  kind: 'debuff', shape: 'all', range: 'ranged', cd: 5, power: 0.4, stat: 'arcana', spell: 'arcane', apply: [['root', 0.6, 2]], desc: 'Sticky strands everywhere.' },
  g_fireball:     { name: 'Fireball (scroll)', school: 'arcane', kind: 'aoe',   shape: 'all', range: 'ranged', dmg: 'fire', cd: 5, power: 1.1, stat: 'arcana', spell: 'arcane', apply: [['burn', 0.5, 3]], desc: 'The classic.' },
  g_ice_storm:    { name: 'Ice Storm',       school: 'arcane',  kind: 'aoe',    shape: 'all', range: 'ranged', dmg: 'frost', cd: 5, power: 1.0, stat: 'arcana', spell: 'arcane', apply: [['chill', 0.8, 1]], desc: 'Hail on everything.' },
  g_lightning:    { name: 'Lightning Arc',   school: 'arcane',  kind: 'attack', shape: 'single', range: 'ranged', dmg: 'storm', cd: 3, power: 1.3, stat: 'arcana', spell: 'arcane', chain: 1, apply: [['shock', 0.5, 2]], desc: 'Jumps to a second target.' },
  g_detect_magic: { name: 'Detect Magic',    school: 'arcane',  kind: 'debuff', shape: 'all', range: 'ranged', cd: 6, power: 0.4, stat: 'arcana', spell: 'arcane', apply: [['vulnerable', 0.5, 2]], desc: 'Reveals weak points — and mimics.' },
  g_darkvision:   { name: 'Darkvision',      school: 'arcane',  kind: 'buff',   shape: 'party', cd: 8, power: 0.3, stat: 'arcana', spell: 'arcane', apply: [['keen', 1, 4]], desc: 'The party sees in the dark, and sees fliers.' },
  g_counterspell: { name: 'Counterspell (scroll)', school: 'arcane', kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 0.5, stat: 'arcana', spell: 'arcane', interrupt: true, preferCasters: true, apply: [['silence', 0.9, 2]], desc: 'Breaks a spell.' },
  g_featherfall:  { name: 'Feather Fall',    school: 'arcane',  kind: 'buff',   shape: 'party', cd: 8, power: 0.3, stat: 'arcana', spell: 'arcane', apply: [['evasive', 1, 2]], desc: 'Nobody falls; everybody dodges.' },
  g_stoneskin:    { name: 'Stoneskin',       school: 'arcane',  kind: 'buff',   shape: 'ally', cd: 5, power: 0.5, stat: 'arcana', spell: 'arcane', apply: [['physres', 1, 3], ['fortify', 1, 3]], desc: 'Skin like rock.' },
  g_cure_wounds:  { name: 'Cure Wounds',     school: 'divine',  kind: 'heal',   shape: 'ally', cd: 3, power: 0.6, stat: 'faith', spell: 'divine', desc: 'A simple heal anyone faithful can learn.' },
  g_bless:        { name: 'Minor Blessing',  school: 'divine',  kind: 'buff',   shape: 'party', cd: 6, power: 0.3, stat: 'faith', spell: 'divine', apply: [['inspired', 1, 3]], desc: 'A little luck for everyone.' },
  g_sanctuary:    { name: 'Sanctuary',       school: 'divine',  kind: 'buff',   shape: 'ally', cd: 5, power: 0.4, stat: 'faith', spell: 'divine', barrier: 0.2, desc: 'A ward on one ally.' },
  g_protection:   { name: 'Protection from Evil', school: 'divine', kind: 'buff', shape: 'party', cd: 7, power: 0.4, stat: 'faith', spell: 'divine', apply: [['brave', 1, 3]], cleanseMind: true, desc: 'Fear and charm slide off.' },
  g_daylight:     { name: 'Daylight',        school: 'divine',  kind: 'debuff', shape: 'all', range: 'ranged', cd: 6, power: 0.4, stat: 'faith', spell: 'divine', apply: [['blind', 0.5, 1]], bonusVs: { undead: 1.3 }, desc: 'Sunlight in the dark; the dead flinch.' },
  g_restoration:  { name: 'Lesser Restoration', school: 'divine', kind: 'buff', shape: 'party', cd: 5, power: 0.3, stat: 'faith', spell: 'divine', cleanse: 2, desc: 'Poison, blindness and worse, removed.' },
  g_spirit_weapon:{ name: 'Spiritual Weapon',school: 'divine',  kind: 'attack', shape: 'single', range: 'ranged', dmg: 'holy', cd: 2, power: 1.1, stat: 'faith', spell: 'divine', autoHit: true, desc: 'A floating weapon of light.' },
  g_revive:       { name: 'Revivify (scroll)', school: 'divine', kind: 'heal',  shape: 'ally', cd: 99, power: 0.5, stat: 'faith', spell: 'divine', revive: 0.3, desc: 'Brings back the newly fallen.' },
  g_parry:        { name: 'Parry',           school: 'martial', kind: 'buff',   shape: 'self', cd: 4, power: 0.4, stat: 'melee', apply: [['evasive', 1, 2], ['thorns', 1, 2]], desc: 'Turns a blow and returns it.' },
  g_whirlwind:    { name: 'Whirlwind',       school: 'martial', kind: 'aoe',    shape: 'front', range: 'melee', dmg: 'weapon', cd: 4, power: 0.8, stat: 'melee', desc: 'A spinning strike.' },
  g_second_breath:{ name: 'Second Breath',   school: 'martial', kind: 'heal',   shape: 'self', cd: 6, power: 0.5, stat: 'melee', cleanse: 1, desc: 'Catch your breath mid-fight.' },
  g_mark_death:   { name: 'Mark for Death',  school: 'martial', kind: 'debuff', shape: 'single', range: 'ranged', cd: 5, power: 0.6, stat: 'ranged', apply: [['vulnerable', 1, 3]], desc: 'Points out the target.' },
  g_disarm:       { name: 'Disarm',          school: 'martial', kind: 'attack', shape: 'single', range: 'melee', dmg: 'weapon', cd: 4, power: 0.7, stat: 'melee', apply: [['weaken', 0.9, 3]], desc: 'Strikes the weapon away.' },
  g_net:          { name: 'Throw Net',       school: 'martial', kind: 'debuff', shape: 'single', range: 'ranged', cd: 4, power: 0.5, stat: 'ranged', grounds: true, apply: [['root', 0.9, 2]], desc: 'Brings down a flier.' },
  g_rally:        { name: 'Rally',           school: 'martial', kind: 'buff',   shape: 'party', cd: 6, power: 0.4, stat: 'social', barrier: 0.08, apply: [['brave', 1, 2]], desc: 'A shout that steadies everyone.' },
  g_sprint:       { name: 'Sprint',          school: 'martial', kind: 'buff',   shape: 'self', cd: 5, power: 0.4, stat: 'melee', apply: [['haste', 1, 2]], desc: 'A burst of speed.' },
  g_trip:         { name: 'Trip',            school: 'martial', kind: 'attack', shape: 'single', range: 'melee', dmg: 'crush', cd: 3, power: 0.8, stat: 'melee', apply: [['stun', 0.35, 1]], desc: 'Takes the legs out.' },
  g_shield_block: { name: 'Shield Block',    school: 'martial', kind: 'buff',   shape: 'self', cd: 4, power: 0.4, stat: 'melee', barrier: 0.2, desc: 'Braces behind the shield.' },
};
export const GENERAL_IDS = Object.keys(GENERAL_SPELLS);
for (const [id, a] of Object.entries(GENERAL_SPELLS)) ABILITIES[id] = { ...a, general: true };

/** Who may learn a spellbook (permanently). '' or a reason. */
export function bookRequirement(npc, id) {
  const a = ABILITIES[id];
  if (!a) return 'Unknown spell.';
  if ((npc.learned || []).includes(id) || (npc.tree && npc.tree.owned.includes(id))) return 'Already known.';
  const at = npc.attributes;
  const school = a.school || (a.spell === 'divine' ? 'divine' : a.spell ? 'arcane' : 'martial');
  if (school === 'arcane' && at.int < 13) return 'Needs INT 13.';
  if (school === 'divine' && at.wis < 13) return 'Needs WIS 13.';
  if (school === 'martial' && at.str < 13 && at.dex < 13) return 'Needs STR or DEX 13.';
  return '';
}
/** Scrolls are easier: any reader. */
export function canReadScroll(npc) { return (npc.attributes.int || 0) >= 12 || (npc.attributes.wis || 0) >= 12; }

// --- prices ----------------------------------------------------------------------
export function bookPrice(id) { const a = ABILITIES[id]; return Math.round(40 + (a ? a.power : 1) * 60 + (a && a.cd >= 99 ? 60 : 0)); }
export function scrollPrice(id) { return Math.round(bookPrice(id) * 0.3); }

/** A peddler's or a shop's stock: a few scrolls and books from the pool. */
export function rollMagicStock(rng, rank, big = false) {
  const n = big ? 6 : 4;
  const stock = { scrolls: {}, books: {}, potions: {}, reagents: {} };
  for (let k = 0; k < n; k++) { const id = rng.pick(GENERAL_IDS); stock.scrolls[id] = (stock.scrolls[id] || 0) + rng.int(1, 2); }
  for (let k = 0; k < (big ? 3 : 2); k++) stock.books[rng.pick(GENERAL_IDS)] = 1;
  for (const p of rng.pickMany(['greater_healing', 'antidote', 'ward_fire', 'ward_frost', 'ward_storm', 'clarity', 'holy_water'], 3)) stock.potions[p] = rng.int(1, 3);
  for (const e of rng.pickMany(['ember', 'rime', 'storm', 'venom', 'radiant', 'umbral', 'arcane'], 2)) stock.reagents[e] = rng.int(1, 3);
  if (rng.chance(0.08 + rank * 0.02)) stock.reagents.class_tome = 1;
  return stock;
}

// --- the Magic Lab: spellcraft ------------------------------------------------------
export const SPELL_FORMS = {
  bolt:  { name: 'Bolt',  budget: 30, kind: 'attack', shape: 'single', power: 1.2, desc: 'One target.' },
  burst: { name: 'Burst', budget: 45, kind: 'aoe',    shape: 'front',  power: 0.9, desc: 'The enemy front row.' },
  wave:  { name: 'Wave',  budget: 60, kind: 'aoe',    shape: 'all',    power: 0.8, desc: 'Every enemy.' },
  ward:  { name: 'Ward',  budget: 35, kind: 'buff',   shape: 'ally',   power: 0.5, barrier: 0.2, desc: 'A barrier on an ally.' },
  hex:   { name: 'Hex',   budget: 30, kind: 'debuff', shape: 'single', power: 0.5, desc: 'A curse on one foe.' },
  mend:  { name: 'Mend',  budget: 40, kind: 'heal',   shape: 'ally',   power: 0.6, desc: 'Heals an ally.' },
};
export const SPELL_ELEMENTS = {
  fire:   { name: 'Fire',   status: 'burn',   essence: 'ember' },
  frost:  { name: 'Frost',  status: 'chill',  essence: 'rime' },
  storm:  { name: 'Storm',  status: 'shock',  essence: 'storm' },
  nature: { name: 'Nature', status: 'poison', essence: 'venom' },
  holy:   { name: 'Holy',   status: 'blind',  essence: 'radiant' },
  shadow: { name: 'Shadow', status: 'weaken', essence: 'umbral' },
  arcane: { name: 'Arcane', status: 'sunder', essence: 'arcane' },
};
export const SPELL_MODS = {
  empowered:    { name: 'Empowered',    budget: 25, desc: '+35% power.' },
  lingering:    { name: 'Lingering',    budget: 15, desc: 'Its status lasts a round longer.' },
  chain:        { name: 'Chain',        budget: 20, desc: 'Arcs to one more target.' },
  quickened:    { name: 'Quickened',    budget: 25, desc: '−1 cooldown.' },
  piercing:     { name: 'Piercing',     budget: 15, desc: 'Ignores magic resistance.' },
  grounding:    { name: 'Grounding',    budget: 15, desc: 'Drags fliers down.' },
  interrupting: { name: 'Interrupting', budget: 30, desc: 'Breaks a telegraphed attack.' },
};
/** Parts known without research; the rest cost Insight. */
export const STARTING_PARTS = { forms: ['bolt', 'ward'], elements: ['fire', 'frost'], mods: ['empowered'] };
export function partCost(kind, id) {
  if (kind === 'forms') return 40 + SPELL_FORMS[id].budget * 3;
  if (kind === 'elements') return 90;
  return 60 + SPELL_MODS[id].budget * 3;
}

/** Budget and validity of a design. */
export function spellBudget(form, element, mods) {
  const F = SPELL_FORMS[form];
  if (!F || !SPELL_ELEMENTS[element]) return { total: 999, ok: false, why: 'Pick a form and an element.' };
  if (mods.length > 2) return { total: 999, ok: false, why: 'At most two modifiers.' };
  const total = F.budget + mods.reduce((s, m) => s + (SPELL_MODS[m] ? SPELL_MODS[m].budget : 99), 0);
  return { total, ok: total <= 100, why: total > 100 ? `Over budget (${total}/100).` : '' };
}

/** Turn a design into an ability definition. */
export function buildSpell(name, form, element, mods, school = 'arcane') {
  const F = SPELL_FORMS[form], E = SPELL_ELEMENTS[element];
  const b = spellBudget(form, element, mods);
  const ab = {
    name, kind: F.kind, shape: F.shape, cd: b.total <= 50 ? 2 : b.total <= 75 ? 3 : 4, power: F.power, stat: school === 'divine' ? 'faith' : 'arcana',
    spell: school, custom: true, school, desc: `${F.name} of ${E.name}${mods.length ? ' — ' + mods.map(m => SPELL_MODS[m].name).join(', ') : ''}.`,
    apply: [], design: { form, element, mods },
  };
  if (F.kind === 'attack' || F.kind === 'aoe') { ab.range = 'ranged'; ab.dmg = element; ab.apply.push([E.status, 0.4, E.status === 'chill' ? 1 : 2]); }
  if (F.kind === 'debuff') { ab.range = 'ranged'; ab.apply.push([E.status, 0.9, 3], ['vulnerable', 0.5, 2]); }
  if (F.kind === 'buff') { ab.barrier = F.barrier; ab.apply.push(['ward', 1, 4]); ab.infuseWard = element; }
  if (F.kind === 'heal' && element === 'holy') ab.cleanse = 1;
  for (const m of mods) {
    if (m === 'empowered') ab.power *= 1.35;
    if (m === 'lingering') for (const r of ab.apply) r[2] = (r[2] || 1) + 1;
    if (m === 'chain') ab.chain = (ab.chain || 0) + 1;
    if (m === 'quickened') ab.cd = Math.max(1, ab.cd - 1);
    if (m === 'piercing') ab.pierceMagic = true;
    if (m === 'grounding') ab.grounds = true;
    if (m === 'interrupting') ab.interrupt = true;
  }
  return ab;
}
/** What writing a design into a book costs. */
export function writeCost(form, element, mods) {
  const b = spellBudget(form, element, mods).total;
  return { dust: Math.ceil(b / 10), cloth: 3, [SPELL_ELEMENTS[element].essence]: Math.max(1, Math.ceil(b / 40)) };
}
