// ============================================================================
// UNIVERSAL NPC GENERATOR
// A single pipeline makes every living thing in the game: colonists, traders,
// wanderers, raiders, dungeon denizens and bosses. The only thing that decides
// which side someone is on is the HOSTILITY METER (0-100), which is assembled
// from faction base + ancestry bias + class bias + background + traits, and
// which then drifts at runtime in response to events.
// ============================================================================
import { RNG, clamp } from './rng.js';
import { generateName } from './names.js';
import {
  ATTRS, mod, SKILLS, SKILL_IDS, PASSIONS, PASSION_XP, RACES, CLASSES,
  TRAITS, PERSONALITY_TRAITS, BACKGROUNDS, BACKGROUND_IDS, FACTIONS,
  ADVENTURER_CLASSES, COMMONER_CLASSES, dispositionOf, ABILITIES,
} from './data.js';
import { RACE_COMBAT, TAGS, CASTER_CLASSES, WEAPON_DAMAGE, REACH_WEAPONS, resistTable, immunitySet } from './elements.js';
import { TREES, newTree, syncAbilities, autoAllocate, pointsSpent, LEVEL_CAP, CLASS_INFO } from './classes.js';
import { generateItem, generateWeaponItem, generateArmorItem, gearProfile, WEAPON_FAMILIES, SLOTS } from './items.js';

let NEXT_ID = 1;
export function resetIds(n = 1) { NEXT_ID = n; }
export function npcIdCounter() { return NEXT_ID; }

// --- item generation --------------------------------------------------------
// Gear lives in items.js; these wrappers keep the old call sites working.
export function generateWeapon(rng, tier = 1, prefStat = null) { return generateWeaponItem(rng, tier, prefStat); }
export function generateArmor(rng, tier = 1, roleHint = 'front') { return generateArmorItem(rng, tier, roleHint); }

/** Outfit a generated character for its class: a legal weapon, armour of its comfort, sometimes more. */
function outfit(rng, klass, tier, role, boss) {
  const info = CLASS_INFO[klass];
  const t = tier + (boss ? 3 : 0);
  const eq = { weapon: null, offhand: null, head: null, armor: null, feet: null, charm: null };
  const fams = info ? info.weapons.filter(f => WEAPON_FAMILIES[f]) : ['sword', 'axe', 'hammer', 'spear', 'dagger', 'bow', 'sling'];
  // Signature weapons first: a class's list is ordered by how typical each family is.
  const fam = rng.chance(0.75) ? fams[Math.min(fams.length - 1, rng.int(0, 1))] : rng.pick(fams);
  eq.weapon = generateItem(rng, { slot: 'weapon', tier: t, family: fam, rarityBonus: boss ? 1 : 0 });
  const comfort = info ? info.armor : 'light';
  const bases = comfort === 'heavy' ? ['chain', 'scale', 'plate'] : comfort === 'medium' ? ['leather', 'hide', 'chain'] : comfort === 'none' ? [] : ['robes', 'leather'];
  if (bases.length) eq.armor = generateItem(rng, { slot: 'armor', tier: t, base: rng.pick(bases) });
  if (info && info.shield && eq.weapon.hands === 1 && rng.chance(0.55)) eq.offhand = generateItem(rng, { slot: 'offhand', tier: t, base: rng.pick(['buckler', 'kite', 'tower']) });
  if (rng.chance(0.2 + tier * 0.05)) eq.head = generateItem(rng, { slot: 'head', tier: t });
  if (rng.chance(0.2 + tier * 0.05)) eq.feet = generateItem(rng, { slot: 'feet', tier: t });
  return eq;
}

// --- trait selection --------------------------------------------------------
function rollTraits(rng, race, klass, count) {
  const picked = [];
  const taken = new Set();
  for (const t of RACES[race].traits) { picked.push(t); taken.add(t); }
  const pool = PERSONALITY_TRAITS.filter(t => !taken.has(t));
  let guard = 0;
  while (picked.length < count + RACES[race].traits.length && guard++ < 60) {
    const cand = rng.pick(pool);
    if (taken.has(cand)) continue;
    const def = TRAITS[cand];
    const conflicts = (def.conflicts || []).some(c => taken.has(c));
    const inverse = picked.some(p => (TRAITS[p].conflicts || []).includes(cand));
    if (conflicts || inverse) continue;
    picked.push(cand); taken.add(cand);
  }
  return picked;
}

export function traitMod(npc, key) {
  let v = 0;
  for (const t of npc.traits) { const m = TRAITS[t]?.mods?.[key]; if (m) v += m; }
  for (const inj of npc.injuries) { const m = inj.mods?.[key]; if (m) v += m; }
  if (npc.equipment && key !== 'armor' && key !== 'acc' && key !== 'dmg' && key !== 'init' && key !== 'leech') {
    // Combat numbers from gear are summed by gearProfile; this keeps the rest (mood etc.).
    for (const slot of SLOTS) {
      const it = npc.equipment[slot];
      const m = it && it.mods && it.mods[key];
      if (typeof m === 'number') v += m;
    }
  }
  return v;
}

// --- main generator ---------------------------------------------------------
/**
 * @param {RNG} rng
 * @param {object} o
 *  faction  - key of FACTIONS (drives hostility base + race/class pools)
 *  tier     - power tier 0..12; scales level, gear, hp
 *  raceHint / classHint - force an ancestry/class
 *  roleHint - 'front'|'back'|'support'|'flank' preference
 *  boss     - bump stats & gear substantially
 *  hostilityOverride - set the meter directly
 */
export function generateNPC(rng, o = {}) {
  const factionId = o.faction || 'colony';
  const faction = FACTIONS[factionId] || FACTIONS.colony;
  const tier = clamp(o.tier ?? 1, 0, 14);

  const race = o.raceHint || rng.pick(faction.races);
  const raceDef = RACES[race];

  let classPool = o.classHint ? [o.classHint]
    : faction.classes ? faction.classes
    : (rng.chance(0.55) ? ADVENTURER_CLASSES : COMMONER_CLASSES);
  if (o.roleHint) {
    const filtered = classPool.filter(c => CLASSES[c].role === o.roleHint);
    if (filtered.length) classPool = filtered;
  }
  const klass = rng.pick(classPool);
  const classDef = CLASSES[klass];

  const mindless = raceDef.tags.includes('mindless');
  const bg = mindless ? 'none' : rng.pick(BACKGROUND_IDS);
  const bgDef = BACKGROUNDS[bg];

  // Attributes: 4d6 drop lowest + ancestry + tier growth
  const attributes = {};
  for (const a of ATTRS) {
    let v = rng.stat() + (raceDef.attr[a] || 0);
    if (a === classDef.primary) v += 2 + Math.floor(tier / 3);
    v += Math.floor(tier / 5);
    attributes[a] = clamp(v, 1, 30);
  }
  if (o.boss) { attributes[classDef.primary] = clamp(attributes[classDef.primary] + 4, 1, 34); attributes.con = clamp(attributes.con + 3, 1, 34); }

  const traits = rollTraits(rng, race, klass, mindless ? rng.int(0, 1) : rng.int(2, 4));

  // Skills: class seed + background + attribute + tier, with passions
  const skills = {}, passions = {};
  for (const id of SKILL_IDS) {
    const seed = (classDef.skills[id] || 0) * 1.6 + (bgDef.skills[id] || 0) * 1.2;
    const attrBonus = mod(attributes[SKILLS[id].attr]) * 0.5;
    const noise = rng.gauss(0, 1.4);
    const growth = seed > 0 ? tier * 0.85 : tier * 0.25;
    let lvl = seed + attrBonus + noise + growth;
    for (const t of traits) { const m = TRAITS[t].mods?.['skill.' + id]; if (m) lvl += m; }
    skills[id] = clamp(Math.round(lvl), 0, 20);
    passions[id] = mindless ? 'none' : rng.pick(PASSIONS);
  }

  const level = clamp(1 + Math.round(tier * 1.4 + rng.gauss(0, 0.8)) + (o.boss ? 3 : 0), 1, LEVEL_CAP);

  // --- HOSTILITY METER ------------------------------------------------------
  // Personal modifiers are applied at half weight and compressed toward the
  // faction base, so that a faction reads clearly while individuals still vary.
  let personal = 0;
  personal += raceDef.hostility;
  personal += classDef.hostility;
  personal += bgDef.hostility;
  for (const t of traits) { const m = TRAITS[t].mods?.hostility; if (m) personal += m; }
  personal -= mod(attributes.cha) * 1.6;      // charming folk read as safer
  personal -= mod(attributes.wis) * 0.9;      // wisdom tempers aggression
  // Headroom compression: pushing toward an extreme gets progressively harder.
  const headroom = personal > 0 ? (100 - faction.base) / 100 : faction.base / 100;
  let hostility = faction.base + rng.gauss(0, faction.spread * 0.55) + personal * 0.62 * (0.35 + headroom);
  if (o.hostilityOverride != null) hostility = o.hostilityOverride;
  hostility = clamp(Math.round(hostility), 0, 100);

  // Derived body
  const conMod = mod(attributes.con);
  const maxHp = Math.max(8, Math.round((
    classDef.hitDie + raceDef.hp + conMod * 2 +
    (level - 1) * (classDef.hitDie * 0.5 + conMod) * 0.85 +
    (o.boss ? classDef.hitDie * 3 : 0)
  ) * 1.4));

  const equipment = o.noGear ? { weapon: null, offhand: null, head: null, armor: null, feet: null, charm: null } : outfit(rng, klass, tier, classDef.role, o.boss);

  const name = generateName(rng, race);
  const abilities = classDef.abilities.filter(a => ABILITIES[a]);

  const npc = {
    id: NEXT_ID++,
    name, race, klass, background: bg, faction: factionId,
    level, tier, boss: !!o.boss,
    attributes, traits, skills, passions,
    hostility, hostilityBase: hostility,
    maxHp, hp: maxHp,
    injuries: [], thoughts: [], relations: {},
    equipment,
    abilities,
    // Colony-side runtime state (unused for pure enemies but always present so
    // that a captured raider can simply be moved into the colony roster).
    x: 0, y: 0, px: 0, py: 0,
    task: null, path: null, pathIdx: 0, moveCd: 0,
    needs: { hunger: rng.float(0.55, 0.95), rest: rng.float(0.55, 0.95), joy: rng.float(0.4, 0.8) },
    mood: 65, moodAvg: 65, breakLevel: 0,
    xp: {}, inventory: [], carrying: null,
    priorities: null, state: 'idle', away: false, dead: false,
    log: [],
  };
  npc.priorities = defaultPriorities(rng, npc);
  npc.disposition = dispositionOf(npc.hostility).id;
  // Adventurers carry a skill tree. Anyone met in the world arrives with a build
  // from their past; the founding camp starts with its points in hand.
  npc.tree = TREES[klass] ? newTree(npc) : null;
  npc.tactics = 'auto';
  if (npc.tree) {
    if (!o.manualSkills) autoAllocate(npc, rng.fork('tree'));
    syncAbilities(npc);
  }
  npc.combat = combatProfile(npc);
  return npc;
}

// Work priorities 0 (never) .. 4 (urgent), biased by skills and traits.
export function defaultPriorities(rng, npc) {
  const p = {};
  const jobs = ['mine', 'chop', 'build', 'haul', 'farm', 'cook', 'craft', 'research', 'heal', 'train', 'pray'];
  const jobSkill = { mine: 'mining', chop: 'woodcutting', build: 'construction', haul: 'hauling', farm: 'farming', cook: 'cooking', craft: 'smithing', research: 'research', heal: 'medicine', train: 'melee', pray: 'faith' };
  for (const j of jobs) {
    const s = npc.skills[jobSkill[j]] || 0;
    const pass = npc.passions[jobSkill[j]];
    let v = 2;
    if (s >= 8) v = 3;
    if (pass === 'burning') v = 4;
    if (s <= 2 && pass === 'none') v = 1;
    p[j] = v;
  }
  return p;
}

// Combat numbers derived once and refreshed when gear/injuries change. This is
// the unit sheet the resolver reads: to-hit (ACC vs DEF), soak (ARM for
// physical, RES per element), row, tags and immunities.
export function combatProfile(npc) {
  const w = npc.equipment.weapon;
  const gp = gearProfile(npc);
  const statId = w ? w.stat : 'melee';
  const skill = npc.skills[statId] || 0;
  const attrId = SKILLS[statId].attr;
  const attrM = mod(npc.attributes[attrId]);
  const cm = traitMod(npc, 'combat');
  const armor = gp.armor + traitMod(npc, 'armor') + Math.floor(npc.level * 0.25);
  const role = CLASSES[npc.klass].role;
  const rc = RACE_COMBAT[npc.race] || { tags: [] };
  const tags = [...rc.tags];
  if (CASTER_CLASSES.has(npc.klass)) tags.push('caster');
  if (npc.boss) tags.push('boss');
  if (npc.traits.includes('coward')) tags.push('coward');
  const res = resistTable(tags, [rc.res, gp.res]);
  // Dragonkin carry one lineage element, fixed by name so generation stays
  // deterministic without spending a random draw.
  if (rc.lineage) {
    let h = 0; for (const ch of npc.name.full) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const el = rc.lineage[h % rc.lineage.length]; res[el] = (res[el] || 0) + 0.5;
  }
  const ranged = statId === 'ranged' || statId === 'arcana' || statId === 'faith';
  let poise = 0;
  for (const t of tags) poise += (TAGS[t] && TAGS[t].poise) || 0;
  // Gear passives become rules: immunities, opening statuses, retaliation.
  const P = new Set(gp.passives);
  const immuneExtra = [...(rc.immune || [])];
  const PASS_IMMUNE = { everburning: ['burn'], clarity: ['confuse', 'charm'], ironwill: ['fear'], mirror: ['petrify'], striders: ['slow'], anchors: ['root'], featherfall: ['grounded'] };
  for (const p of P) immuneExtra.push(...(PASS_IMMUNE[p] || []));
  const startStatus = [];
  if (P.has('shadowstep')) startStatus.push(['stealth', 2]);
  if (P.has('thornmail')) startStatus.push(['thorns', 99]);
  if (P.has('regenerator')) startStatus.push(['regen', 99]);
  if (P.has('undying')) startStatus.push(['deathward', 99]);
  const fam = w && WEAPON_FAMILIES[w.family || w.type];
  const twin = !!(fam && fam.twin);
  return {
    stat: statId,
    acc: 2 + attrM + Math.round(skill * 0.55) + traitMod(npc, 'acc') + Math.round(npc.level * 0.35) + gp.acc,
    dmg: w ? w.dmg : [1, 4],
    dmgType: w ? ((fam && fam.type) || WEAPON_DAMAGE[w.type] || 'crush') : 'crush',
    dmgElement: w && w.element ? w.element : null,
    dmgBonus: attrM + Math.round(skill * 0.35) + traitMod(npc, 'dmg') + gp.dmg,
    armor,
    def: Math.round(armor * 0.7) + tags.reduce((s, t) => s + ((TAGS[t] && TAGS[t].def) || 0), 0) + gp.def,
    init: mod(npc.attributes.dex) + traitMod(npc, 'init') + gp.init + (P.has('striders') ? 3 : 0),
    mult: (1 + cm) * (twin ? 0.7 : 1),
    multiattack: twin ? 2 : 1,
    leech: traitMod(npc, 'leech') + gp.leech,
    spellPower: gp.spell, hpBonus: gp.hp, shield: gp.shield, weight: gp.weight,
    passives: [...P], gearAbilities: gp.grants,
    startStatus, retaliate: P.has('frostbound') ? { status: 'chill', chance: 0.6 } : null,
    role,
    row: role === 'front' || role === 'flank' ? 'front' : 'back',
    range: ranged ? 'ranged' : 'melee',
    reach: !!(w && (REACH_WEAPONS.has(w.type) || (fam && fam.reach))),
    tags, res,
    immune: [...immunitySet(tags, immuneExtra)],
    resist: { ...(rc.resist || {}) },
    poise: poise + (P.has('anchors') ? 1 : 0),
    flee: clamp(0.18 + traitMod(npc, 'flee') - npc.level * 0.004, 0.0, 0.9),
  };
}

export function refresh(npc) { npc.combat = combatProfile(npc); npc.disposition = dispositionOf(npc.hostility).id; return npc; }

// Hostility drift. Everything that happens to an NPC nudges this one number,
// and this one number decides whether they work for you or hunt you.
export function shiftHostility(npc, delta, reason) {
  const before = npc.hostility;
  const loyalty = npc.traits.includes('loyal') ? 0.5 : npc.traits.includes('vengeful') ? 1.5 : 1;
  npc.hostility = clamp(npc.hostility + delta * (delta > 0 ? loyalty : 1 / loyalty), 0, 100);
  npc.disposition = dispositionOf(npc.hostility).id;
  if (reason && Math.abs(npc.hostility - before) >= 1) {
    npc.log.push({ t: 'host', d: Math.round(npc.hostility - before), reason });
    if (npc.log.length > 40) npc.log.shift();
  }
  return npc.hostility;
}

// Power rating: used by threat scaling, party strength readouts and the AI.
export function powerOf(npc) {
  const c = npc.combat || combatProfile(npc);
  const dps = ((c.dmg[0] + c.dmg[1]) / 2 + c.dmgBonus) * c.mult;
  const survive = npc.maxHp * (1 + c.armor / 14);
  // Every learned node is worth a little: more tools, better tools.
  const tree = npc.tree ? 1 + pointsSpent(npc) * 0.02 + Math.max(0, (npc.abilities || []).length - 1) * 0.03 : 1;
  return Math.round(Math.sqrt(Math.max(1, dps * survive)) * (1 + npc.level * 0.05) * tagPower(c) * ratingOf(npc) * tree);
}
/** How much a unit's tags are worth in a fight, as a multiplier on raw power. */
const TAG_POWER = { flying: 1.15, regenerating: 1.2, undying: 1.1, incorporeal: 1.15, splits: 1.1, magicres: 1.1, frightful: 1.05, leader: 1.05, ambusher: 1.05 };
export function tagPower(c) {
  let m = 1;
  for (const t of c.tags || []) if (TAG_POWER[t]) m *= TAG_POWER[t];
  if (c.legendary) m *= 1 + c.legendary * 0.15;
  return m;
}
/** Monsters carry fewer tricks than classed NPCs of the same raw numbers;
 *  measured against equal-rated NPC fights, they play about 12% softer. */
const MONSTER_RATING = 0.88;
export function ratingOf(npc) {
  return npc.monster ? MONSTER_RATING : 1;
}

// Roster helper: generate a coherent group (a raid, a caravan, a dungeon floor).
export function generateGroup(rng, { faction, tier, size, bossChance = 0 }) {
  const out = [];
  const roles = ['front', 'front', 'back', 'support', 'flank'];
  for (let i = 0; i < size; i++) {
    const boss = i === 0 && rng.chance(bossChance);
    out.push(generateNPC(rng, { faction, tier: tier + (boss ? 2 : 0), roleHint: roles[i % roles.length], boss }));
  }
  return out;
}
