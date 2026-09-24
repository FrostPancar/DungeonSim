// ============================================================================
// COMBAT CORE — the one resolver for delves, night waves and beast fights.
//
// A fight is two sides of units in two rows. Each round every unit acts in
// initiative order. What makes it a fight rather than a dice average:
//   rows       melee reaches the front row only (reach, dives and climbers
//              excepted); fliers are out of melee reach unless they swoop in
//   damage     physical is soaked by ARM, elements by per-type RES; a weakness
//              is a negative resistance, an immunity is 1, an absorb is > 1
//   statuses   burn, poison, chill→freeze, stun, sleep, charm... declarative,
//              ticking on the bearer's own turn
//   combos     wet+storm electrocutes, frozen+crush shatters, fire+oil ignites
//   telegraphs big abilities announce themselves a round early and can be
//              interrupted by any hard control, or silenced if they are spells
//   poise      large things and bosses stagger instead of being stun-locked
// Everything draws from the rng it is given, so a fight replays exactly.
// ============================================================================
import { ABILITIES } from './data.js';
import { STATUSES, TAGS, DAMAGE_TYPES, isPhysical, resMult } from './elements.js';
import { createMonster } from './monsters.js';
import { effectiveAbility } from './classes.js';
import { POTIONS } from './items.js';

const CRIT_MULT = 1.8;
const MAX_ROUNDS = 30;
const HELPLESS = ['stun', 'sleep', 'frozen', 'root', 'stagger', 'engulfed'];
const SKIP = ['stun', 'stagger', 'frozen', 'sleep', 'engulfed'];

// --- units -------------------------------------------------------------------
export function makeUnit(npc, side) {
  const c = npc.combat;
  const tags = new Set(c.tags || []);
  let slots = 1;
  for (const t of tags) slots = Math.max(slots, (TAGS[t] && TAGS[t].slots) || 1);
  // Gear hit points are fight-only padding over the body's own.
  const bonus = Math.round(npc.maxHp * (c.hpBonus || 0));
  return {
    npc, side, name: npc.name.short, hp: npc.hp + (npc.hp > 0 ? bonus : 0), maxHp: npc.maxHp + bonus, baseMaxHp: npc.maxHp + bonus,
    passives: new Set(c.passives || []),
    c, tags, res: { ...(c.res || {}) }, immune: new Set(c.immune || []), resist: c.resist || {},
    row: c.row || (c.role === 'front' || c.role === 'flank' ? 'front' : 'back'), slots,
    cds: {}, st: [], alive: npc.hp > 0, fled: false, downed: false,
    poiseMax: c.poise || 0, poise: 0, poiseImmune: 0,
    threat: 0, charging: null, turret: 0, barrier: 0, swoop: false,
    legendary: c.legendary || 0, legendaryLeft: 0, once: {}, regenStop: false,
    boss: !!npc.boss || tags.has('boss'), dealt: 0,
    heads: c.multiattack || 1, headsCut: 0, engulfDmg: 0, dispRound: 0,
  };
}

// --- status helpers ----------------------------------------------------------
export const stGet = (u, id) => u.st.find(s => s.id === id);
export const hasSt = (u, id) => u.st.some(s => s.id === id);
const stRemove = (u, id) => { u.st = u.st.filter(s => s.id !== id); };
const petrified = (u) => { const p = stGet(u, 'petrify'); return !!p && p.stacks >= 2; };
const standing = (u) => u.alive && !u.fled;

function say(S, t, text, side, extra) { S.log.push({ t, text, side, ...extra }); }
function combo(S, name, text, side) { S.stats.combos[name] = (S.stats.combos[name] || 0) + 1; say(S, 'combo', text, side, { combo: name }); }

function interrupt(S, t, by) {
  if (!t.charging) return;
  say(S, 'interrupt', `${t.name}'s ${t.charging.ab.name} is interrupted${by ? ' by ' + by : ''}!`, t.side);
  t.charging = null;
  S.stats.interrupts++;
}

/**
 * Apply a status. Returns true if it took. Handles immunity, mindlessness,
 * magic resistance, Poise, boss half-durations, stacking and conversions.
 */
export function applyStatus(S, t, id, o = {}) {
  const def = STATUSES[id];
  if (!def || !t.alive) return false;
  if (!o.force && t.immune.has(id)) return false;
  if (!o.force && def.mind && t.tags.has('mindless')) return false;
  if (def.hard && hasSt(t, 'resolute')) return false;
  if (id === 'fear' && hasSt(t, 'brave')) return false;
  if (def.debuff && o.spell && t.tags.has('magicres') && S.rng.chance(0.5)) return false;
  const r = t.resist[id];
  if (r && S.rng.chance(r)) return false;
  let dur = o.dur ?? def.dur;
  // Poise: hard control fills a bar on big creatures and bosses instead of landing.
  if (def.hard && id !== 'engulfed' && t.poiseMax > 0) {
    if (t.poiseImmune > 0) return false;
    t.poise += o.poise || 1;
    if (t.poise < t.poiseMax) { say(S, 'poise', `${t.name} reels (${t.poise}/${t.poiseMax}).`, t.side); return false; }
    t.poise = 0; t.poiseImmune = 3;
    t.st.push({ id: 'stagger', dur: 1, stacks: 1, mag: 0 });
    say(S, 'stagger', `${t.name} is staggered!`, t.side);
    S.stats.statuses.stagger = (S.stats.statuses.stagger || 0) + 1;
    interrupt(S, t);
    return true;
  }
  const env0 = S.ctx.env || {};
  if (def.mind && env0.mindBonus) dur += env0.mindBonus;
  if (id === 'fear' && env0.fearBonus) dur += env0.fearBonus;
  if (def.debuff && t.boss && dur < 90) dur = Math.max(1, Math.floor(dur / 2));
  // Steam: fire and frost cancel each other out, and the cloud blinds.
  if ((id === 'burn' && (hasSt(t, 'chill') || hasSt(t, 'frozen'))) || (id === 'chill' && hasSt(t, 'burn'))) {
    stRemove(t, 'burn'); stRemove(t, 'chill'); stRemove(t, 'frozen');
    for (const u of sideOf(S, t.side)) if (standing(u) && u.row === t.row) applyStatus(S, u, 'blind', { dur: 1 });
    combo(S, 'steam', `Steam erupts around ${t.name}!`, t.side);
    return false;
  }
  if (id === 'burn' && hasSt(t, 'wet')) return false;
  if (id === 'wet') stRemove(t, 'burn');
  let s = stGet(t, id);
  if (s) {
    s.dur = Math.max(s.dur, dur);
    s.stacks = Math.min(def.max, s.stacks + (o.stacks || 1));
    if (o.mag != null) s.mag = Math.max(s.mag || 0, o.mag);
    if (o.mag2 != null) s.mag2 = Math.max(s.mag2 || 0, o.mag2);
  } else {
    s = { id, dur, stacks: Math.min(def.max, o.stacks || 1), mag: o.mag || 0, mag2: o.mag2 || 0, src: o.src || null, elem: o.elem || null };
    t.st.push(s);
  }
  S.stats.statuses[id] = (S.stats.statuses[id] || 0) + 1;
  if (id === 'burn' && o.src && o.src.passives && o.src.passives.has('emberheart') && !hasSt(t, 'weaken')) applyStatus(S, t, 'weaken', { dur: 2, mag: 1 });
  if (id === 'burn' && env0.fireSpread && !o.spread && S.rng.chance(0.3)) {
    const near = sideOf(S, t.side).find(u => u !== t && standing(u) && u.row === t.row && !hasSt(u, 'burn'));
    if (near) { applyStatus(S, near, 'burn', { ...o, spread: true }); combo(S, 'wildfire', `The fire spreads to ${near.name}.`, t.side); }
  }
  if (id === 'burn' && o.src && o.src.passives && o.src.passives.has('everburning')) s.mag = Math.round((s.mag || 3) * 1.4);
  // Conversions
  if (id === 'chill' && s.stacks >= 3) {
    stRemove(t, 'chill');
    applyStatus(S, t, 'frozen', { src: o.src });
    return true;
  }
  if ((id === 'frozen' || id === 'root') && t.tags.has('flying') && !hasSt(t, 'grounded')) {
    applyStatus(S, t, 'grounded', { dur: 2 });
    combo(S, 'grounding', `${t.name} is brought down out of the air!`, t.side);
  }
  if (id === 'drained') {
    t.maxHp = Math.max(1, Math.round(t.baseMaxHp * (1 - 0.1 * s.stacks)));
    t.hp = Math.min(t.hp, t.maxHp);
  }
  if (id === 'petrify' && s.stacks >= 2) { s.dur = 99; say(S, 'status', `${t.name} turns to stone.`, t.side); interrupt(S, t); }
  if (def.hard) interrupt(S, t, o.src && o.src.name);
  if (id === 'silence' && t.charging && t.charging.ab.spell) interrupt(S, t, o.src && o.src.name);
  return true;
}

// --- rows and reach ----------------------------------------------------------
function sideOf(S, side) { return side === 'party' ? S.A : S.B; }
function foesOf(S, side) { return side === 'party' ? S.B : S.A; }
const flyingNow = (u) => u.tags.has('flying') && !hasSt(u, 'grounded');

/** A front row that actually blocks: standing, and on the ground. */
function frontHolds(S, side) {
  return sideOf(S, side).some(u => standing(u) && u.row === 'front' && !flyingNow(u) && !petrified(u) && !hasSt(u, 'engulfed'));
}

/** Can attacker `a` reach target `t` with this kind of attack? */
export function reachable(S, a, t, range, o = {}) {
  if (!standing(t) || t === a) return false;
  // On the map (realtime.js) reach is a matter of tiles and sight lines.
  if (S.spatial && !S.spatial(a, t, range, o)) return false;
  if (hasSt(t, 'stealth') && !a.tags.has('blindsight')) return false;
  if (hasSt(t, 'engulfed')) return false;
  if (range !== 'melee') return true;
  if (flyingNow(t) && !t.swoop && !a.c.reach && !o.reachFlyers && !hasSt(a, 'keen')) return false;
  if (t.row === 'back' && frontHolds(S, t.side)) {
    const opener = S.round === 1 && (a.tags.has('ambusher') || a.tags.has('burrower'));
    if (!(a.c.reach || o.dive || a.tags.has('climber') || a.tags.has('incorporeal') || flyingNow(a) || opener)) return false;
  }
  return true;
}

/** Arrange a side into rows: front-liners fill the front up to its slots. */
function formRows(units, frontSlots) {
  let used = 0;
  for (const u of units) {
    if (u.row !== 'front') continue;
    if (used + u.slots <= frontSlots) used += u.slots;
    else u.row = 'back';
  }
  // Nobody volunteered for the front: the hardiest step up.
  if (!used && units.length > 1) {
    const hardy = [...units].sort((a, b) => b.maxHp - a.maxHp)[0];
    hardy.row = 'front';
  }
}

// --- targeting ---------------------------------------------------------------
function kinOf(u) { return u.npc.family || u.npc.faction || u.side; }

export function pickTarget(S, a, enemies, range, o = {}) {
  const rng = S.rng;
  let pool = enemies.filter(e => reachable(S, a, e, range, o));
  if (!pool.length) return null;
  const taunters = pool.filter(e => hasSt(e, 'taunting'));
  if (taunters.length && !(a.tags.has('mindless') && rng.chance(0.5))) return rng.pick(taunters);
  if (o.preferCasters) {
    const cast = pool.filter(e => e.charging || e.tags.has('caster'));
    if (cast.length) pool = cast;
  }
  if (o.prefer === 'back' || (S.round === 1 && (a.tags.has('ambusher') || a.tags.has('burrower')))) {
    const back = pool.filter(e => e.row === 'back');
    if (back.length) pool = back;
  }
  const clever = a.tags.has('caster') || a.tags.has('leader') || ((a.npc.attributes && a.npc.attributes.int) || 0) >= 14;
  return rng.weighted(pool.map(e => {
    let w = 1;
    if (e.c.role === 'front') w += 2.2;
    if (e.c.role === 'support') w += 0.5;
    if (hasSt(e, 'vulnerable')) w += 2;
    if (e.hp / e.maxHp < 0.3) w += 1.2;           // finish the wounded
    w += Math.min(1.5, e.threat / (e.maxHp + 10));  // punish whoever is doing the damage
    if (clever && (e.c.role === 'support' || e.tags.has('caster'))) w += 1.5;
    return [e, w];
  }));
}

// --- modifiers ---------------------------------------------------------------
function accMods(S, a, range) {
  let m = 0;
  const ins = stGet(a, 'inspired'); if (ins) m += ins.mag || 2;
  const ch = stGet(a, 'chill'); if (ch) m -= ch.stacks;
  if (hasSt(a, 'blind')) m -= range === 'melee' ? 4 : 6;
  if (hasSt(a, 'weaken')) m -= stGet(a, 'weaken').mag || 0;
  if (S.ctx.env && S.ctx.env.dark && !a.tags.has('darkvision') && !a.tags.has('blindsight')) m -= 2;
  if (S.ctx.env && S.ctx.env.flooded && !a.tags.has('swimmer') && !flyingNow(a)) m -= 2;
  if (a.tags.has('pack')) {
    let mates = 0;
    for (const u of sideOf(S, a.side)) if (u !== a && standing(u) && u.tags.has('pack')) mates++;
    m += Math.min(3, mates);
  }
  if (!a.tags.has('leader') && sideOf(S, a.side).some(u => u !== a && standing(u) && u.tags.has('leader') && kinOf(u) === kinOf(a))) m += 2;
  return m;
}
function defMods(S, t) {
  let m = 0;
  const env = S.ctx.env || {};
  if (env.cramped && (t.tags.has('large') || t.tags.has('huge') || t.tags.has('gargantuan'))) m -= 2;
  if (env.fortified && t.side === 'foe' && !hasSt(t, 'sunder')) m += 3;
  if (t.tags.has('shieldwall') && t.row === 'front' && sideOf(S, t.side).filter(u => standing(u) && u.row === 'front' && u.tags.has('shieldwall')).length >= 2) m += 3;
  const ev = stGet(t, 'evasive'); if (ev) m += ev.mag || 3;
  if (hasSt(t, 'root')) m -= 3;
  if (hasSt(t, 'slow')) m -= 2;
  const vu = stGet(t, 'vulnerable'); if (vu) m -= vu.mag || 2;
  return m;
}
function armorOf(t, S) {
  let arm = t.c.armor;
  if (S && t.passives && t.passives.has('bulwark')) arm += 2 * sideOf(S, t.side).filter(u => standing(u) && u.row === 'front' && u !== t).length;
  for (const g of t.tags) arm += (TAGS[g] && TAGS[g].arm) || 0;
  const f = stGet(t, 'fortify'); if (f) arm += f.mag || 3;
  if (hasSt(t, 'sunder')) arm *= 0.5;
  return arm;
}

// --- damage ------------------------------------------------------------------
/**
 * Everything that removes HP goes through here: hits, damage over time,
 * auras, explosions. `o.src` is the unit to credit, `o.noArmor` skips ARM.
 */
export function dealDamage(S, t, amount, type, o = {}) {
  if (!t.alive || amount <= 0) return 0;
  const env = S.ctx.env || {};
  let dmg = amount;
  if (isPhysical(type) && !o.noArmor) {
    let arm = armorOf(t, S);
    if (type === 'pierce') arm *= 0.7;
    dmg -= Math.floor(arm / 3);
    if (hasSt(t, 'physres')) dmg *= 0.75;
  }
  let res = t.res[type] || 0;
  const ward = stGet(t, 'ward'); if (ward && ward.elem === type) res += 0.5;
  if (type === 'fire' && env.fireFloor != null) res = Math.min(res, env.fireFloor);
  if (o.spell && t.tags.has('magicres')) dmg *= 0.5;
  if (type === 'storm' && hasSt(t, 'wet')) dmg *= 1.5;
  if (type === 'fire' && hasSt(t, 'wet')) dmg *= 0.5;
  if (env.elemMult && env.elemMult[type]) dmg *= 1 + env.elemMult[type];
  if (hasSt(t, 'vulnerable')) dmg *= 1.25;
  if (hasSt(t, 'stagger')) dmg *= 1.25;
  if (type === 'crush' && hasSt(t, 'frozen')) {
    dmg *= 2; stRemove(t, 'frozen');
    combo(S, 'shatter', `${t.name} shatters!`, t.side);
    if (o.src && o.src.passives && o.src.passives.has('frostbrand')) o.src.hp = Math.min(o.src.maxHp, o.src.hp + Math.round(o.src.maxHp * 0.1));
  }
  dmg *= resMult(res);
  if (res > 1) {
    // Absorbed: the blow heals it.
    const heal = Math.round(-dmg);
    t.hp = Math.min(t.maxHp, t.hp + heal);
    say(S, 'absorb', `${t.name} drinks in the ${DAMAGE_TYPES[type].name.toLowerCase()} (+${heal}).`, t.side);
    return 0;
  }
  if (res >= 1) return 0;
  dmg = Math.max(1, Math.round(dmg));
  // A guardian takes half the blow meant for its charge.
  if (!o.guarded && !t.tags.has('guardian') && !hasSt(t, 'guarding')) {
    const g = sideOf(S, t.side).find(u => u !== t && standing(u) && (u.tags.has('guardian') || hasSt(u, 'guarding')));
    if (g) { const half = Math.round(dmg / 2); dmg -= half; dealDamage(S, g, half, type, { ...o, noArmor: true, guarded: true }); }
  }
  if (t.barrier > 0) {
    const soak = Math.min(t.barrier, dmg);
    t.barrier -= soak; dmg -= soak;
    if (!dmg) return 0;
  }
  t.hp -= dmg;
  S.stats.dmgByType[type] = (S.stats.dmgByType[type] || 0) + dmg;
  // Swallowed victims burst out once the swallower is hurt badly enough.
  t.engulfDmg += dmg;
  if (t.engulfDmg >= t.maxHp * 0.25) {
    for (const u of [...S.A, ...S.B]) { const e = stGet(u, 'engulfed'); if (e && e.src === t) { stRemove(u, 'engulfed'); say(S, 'status', `${u.name} cuts free of ${t.name}!`, u.side); } }
    t.engulfDmg = 0;
  }
  if (t.tags.has('hydra') && type === 'slash' && dmg >= t.maxHp * 0.12 && t.heads > 1) {
    t.heads--; t.headsCut++;
    say(S, 'status', `One of ${t.name}'s heads is severed.`, t.side);
  }
  if (o.src) { o.src.threat += dmg; o.src.dealt += dmg; }
  if (type === 'fire' || type === 'nature' || (type === 'holy' && (t.tags.has('undead') || t.tags.has('fiend')))) t.regenStop = true;
  // Struck sleepers wake; the charmed come to their senses.
  for (const s of t.st) if (STATUSES[s.id] && STATUSES[s.id].breaks) s.dur = 0;
  t.st = t.st.filter(s => s.dur > 0);
  // Spore rooms go up when fire touches them — for both sides.
  if (type === 'fire' && env.spores && !o.spore && S.rng.chance(0.25)) {
    combo(S, 'spore_burst', 'The spores ignite!', t.side);
    for (const u of [...S.A, ...S.B]) if (standing(u) && u.row === 'front') dealDamage(S, u, Math.max(2, u.maxHp * 0.06), 'nature', { noArmor: true, spore: true });
  }
  // Splitters divide under blades and lightning.
  if (t.tags.has('splits') && (type === 'slash' || type === 'storm') && t.hp > 8 && sideOf(S, t.side).length < 10) splitUnit(S, t);
  if (t.hp <= 0) onZero(S, t, { type, crit: o.crit, src: o.src });
  return dmg;
}

function splitUnit(S, t) {
  const half = Math.floor(t.hp / 2);
  if (half < 4) return;
  const npc = { ...t.npc, name: { ...t.npc.name, short: t.npc.name.short + '′' }, hp: half };
  const u = makeUnit(npc, t.side);
  u.hp = half; u.maxHp = Math.max(half, Math.round(t.maxHp / 2)); u.row = t.row;
  t.hp -= half;
  sideOf(S, t.side).push(u);
  combo(S, 'split', `${t.name} splits in two!`, t.side);
}

function onZero(S, t, o) {
  if (hasSt(t, 'deathward')) {
    stRemove(t, 'deathward'); t.hp = 1;
    say(S, 'status', `A divine ward keeps ${t.name} standing.`, t.side);
    return;
  }
  if (t.tags.has('phylactery') && !t.once.phylactery && !S.ctx.phylacteryBroken) {
    t.once.phylactery = true; t.hp = Math.round(t.maxHp * 0.5);
    combo(S, 'phylactery', `${t.name} reforms from its phylactery!`, t.side);
    return;
  }
  if (t.tags.has('relentless') && !t.once.relentless) {
    t.once.relentless = true; t.hp = 1;
    say(S, 'status', `${t.name} refuses to fall.`, t.side);
    return;
  }
  if (t.tags.has('undying') && !t.once.consecrated && !o.crit && o.type !== 'holy' && o.type !== 'fire' && S.rng.chance(0.5)) {
    t.hp = 1;
    say(S, 'status', `${t.name} lurches back up.`, t.side);
    return;
  }
  t.hp = 0; t.alive = false; t.downed = true; t.charging = null;
  say(S, 'down', `${t.name} goes down.`, t.side);
  // Anything it had swallowed comes out.
  for (const u of [...S.A, ...S.B]) {
    const e = stGet(u, 'engulfed');
    if (e && e.src === t) { stRemove(u, 'engulfed'); say(S, 'status', `${u.name} is freed.`, u.side); }
  }
  const dt = t.c.deathThroes;
  if (dt) {
    combo(S, 'death_throes', `${t.name} explodes as it dies!`, t.side);
    for (const u of foesOf(S, t.side)) if (standing(u) && (dt.all || u.row === 'front')) dealDamage(S, u, t.maxHp * (dt.power || 0.15), dt.type || 'fire', { noArmor: true });
  }
}

/** One weapon or ability strike: roll to hit, then damage, riders and combos. */
export function strike(S, a, t, o = {}) {
  const rng = S.rng;
  const range = o.range || a.c.range || 'melee';
  const d20 = rng.int(1, 20);
  const acc = a.c.acc + accMods(S, a, range);
  const dc = 10 + t.c.def + defMods(S, t) + (S.ctx.cover && range !== 'melee' && t.row === 'back' ? 2 : 0)
    + (S.coverOf ? S.coverOf(a, t, range) : 0);   // on the map: what the target is standing behind
  const frenzy = a.tags.has('bloodfrenzy') && t.hp < t.maxHp * 0.5 ? 3 : 0;
  let hit = !!o.autoHit || (d20 !== 1 && (d20 === 20 || d20 + acc + frenzy >= dc));
  // Displacement: the first blow each round finds only an image.
  if (hit && t.tags.has('displacement') && t.dispRound !== S.round && !a.tags.has('blindsight')) { t.dispRound = S.round; hit = false; }
  if (!hit && a.tags.has('lucky') && !a.once.lucky) {
    a.once.lucky = true;
    const r2 = rng.int(1, 20);
    hit = r2 !== 1 && (r2 === 20 || r2 + acc >= dc);
  }
  if (!hit) return { hit: false, crit: false, dmg: 0 };
  let crit = d20 === 20;
  if (hasSt(a, 'stealth')) { crit = true; stRemove(a, 'stealth'); }
  if (o.helpless && HELPLESS.some(id => hasSt(t, id)) && !t.tags.has('allaround')) {
    crit = true;
    combo(S, 'helpless', `${a.name} finds ${t.name} helpless.`, a.side);
  }
  if (t.tags.has('ooze')) crit = false;
  let raw = rng.int(a.c.dmg[0], a.c.dmg[1]) + a.c.dmgBonus;
  const ins = stGet(a, 'inspired'); if (ins) raw += ins.mag2 || 0;
  raw *= a.c.mult * (o.power ?? 1) * (crit ? CRIT_MULT : 1);
  if (a.side === 'party') raw *= S.ctx.partyDamageMult || 1;
  if (hasSt(a, 'weaken')) raw *= 0.75;
  if (hasSt(a, 'empower')) raw *= 1.25;
  if (a.tags.has('enrage') && a.hp < a.maxHp * 0.3) raw *= 1.5;
  if (o.bonusVs) for (const tag in o.bonusVs) if (t.tags.has(tag)) raw *= o.bonusVs[tag];
  if (S.round === 1 && a.tags.has('ambusher')) raw *= 1.5;
  if (a.passives && a.passives.has('windwhisper') && hasSt(t, 'grounded')) raw *= 1.3;
  if (o.consume) for (const id of o.consume) { const cs = stGet(t, id); if (cs) { raw *= 1 + 0.25 * cs.stacks; stRemove(t, id); } }
  if (t.tags.has('swarm')) raw *= o.aoe ? 2 : 0.5;
  const type = !o.type || o.type === 'weapon' ? a.c.dmgType || 'crush' : o.type === 'element' ? a.c.element || 'arcane' : o.type === 'random' ? rng.pick(['fire', 'frost', 'storm', 'nature', 'arcane']) : o.type;
  let dealt = 0;
  const inf = stGet(a, 'infused');
  const weaponElement = inf && inf.elem ? inf.elem : a.c.dmgElement;
  if ((!o.type || o.type === 'weapon') && weaponElement) {
    // An elemental weapon: most of the blow is steel, the rest is its element.
    const share = inf ? 0.5 : 0.2;
    dealt += dealDamage(S, t, raw * (1 - share), type, { src: a, crit });
    if (t.alive) {
      dealt += dealDamage(S, t, raw * share, weaponElement, { src: a, crit });
      const sig = DAMAGE_TYPES[weaponElement].status;
      if (sig && t.alive && rng.chance(inf ? 0.25 : 0.15)) riderStatus(S, a, t, sig, raw);
    }
  } else {
    dealt = dealDamage(S, t, raw, type, { src: a, crit, spell: o.spell });
  }
  // Combos keyed off the damage type.
  if (t.alive && type === 'storm') {
    if (hasSt(t, 'wet')) {
      combo(S, 'electrocute', `${t.name} is electrocuted!`, t.side);
      applyStatus(S, t, 'stun', { src: a });
      const wets = sideOf(S, t.side).filter(u => u !== t && standing(u) && hasSt(u, 'wet'));
      const reach = a.passives && a.passives.has('stormcaller') ? 2 : 1;
      for (const next of wets.slice(0, reach)) dealDamage(S, next, raw * 0.5, 'storm', { src: a, noArmor: true });
    }
    if (hasSt(t, 'shock')) {
      stRemove(t, 'shock');
      const arc = sideOf(S, t.side).find(u => u !== t && standing(u));
      if (arc) { dealDamage(S, arc, raw * 0.5, 'storm', { src: a }); combo(S, 'arc', `Lightning arcs from ${t.name} to ${arc.name}.`, t.side); }
    }
  }
  if (t.alive && type === 'fire' && hasSt(t, 'oiled')) {
    stRemove(t, 'oiled');
    applyStatus(S, t, 'burn', { src: a, mag: Math.max(3, Math.round(raw * 0.4)) });
    const near = sideOf(S, t.side).find(u => u !== t && standing(u) && u.row === t.row);
    if (near) applyStatus(S, near, 'burn', { src: a, mag: Math.max(2, Math.round(raw * 0.2)) });
    combo(S, 'ignite', `${t.name} goes up in flames!`, t.side);
  }
  if (t.alive && type === 'holy' && (t.tags.has('undead') || t.tags.has('fiend')) && !t.once.consecrated) {
    t.once.consecrated = true;
    combo(S, 'consecration', `Holy light sears ${t.name}.`, t.side);
    if (rng.chance(0.3)) applyStatus(S, t, 'fear', { src: a });
  }
  if (crit && t.alive && a.passives && a.passives.has('vorpal') && t.hp < t.maxHp * 0.25 && !t.boss) {
    combo(S, 'vorpal', `${a.name}'s vorpal blade takes ${t.name}'s head!`, a.side);
    t.hp = 0; onZero(S, t, { type, crit: true, src: a });
  }
  // Signature riders on a critical.
  if (crit && t.alive) {
    if (type === 'slash') applyStatus(S, t, 'bleed', { src: a });
    if (type === 'crush' && rng.chance(0.3)) applyStatus(S, t, 'stun', { src: a });
    if (type === 'crush' && S.ctx.env && S.ctx.env.unstable && rng.chance(0.35)) {
      combo(S, 'cave_in', 'The ceiling comes down!', t.side);
      for (const u of [...S.A, ...S.B]) if (standing(u) && u.row === 'front') dealDamage(S, u, Math.max(2, u.maxHp * 0.06), 'crush', { noArmor: true });
    }
    if (type === 'pierce' && flyingNow(t)) applyStatus(S, t, 'grounded', { dur: 1 });
  }
  if (o.apply && t.alive) {
    for (const [id, chance, n, who] of o.apply) {
      if (who) continue;
      if (rng.chance(chance)) riderStatus(S, a, t, id, raw, n, o.spell, { poise: o.poise, force: o.force });
    }
  }
  if (o.randomApply && t.alive) {
    const [id, chance, n] = rng.pick(o.randomApply);
    if (rng.chance(chance)) riderStatus(S, a, t, id, raw, n, o.spell);
  }
  if (o.elementRider && t.alive) {
    const sig = DAMAGE_TYPES[type] && DAMAGE_TYPES[type].status;
    if (sig && rng.chance(0.5)) riderStatus(S, a, t, sig, raw, sig === 'chill' ? 2 : sig === 'poison' ? 2 : undefined, o.spell);
  }
  if (o.execute && t.alive && t.hp / t.maxHp < o.execute) {
    combo(S, 'execute', `${a.name} finishes ${t.name}.`, a.side);
    t.hp = 0; onZero(S, t, { type, crit: true, src: a });
  }
  if (o.pull && t.alive && t.row === 'back') { t.row = 'front'; say(S, 'status', `${t.name} is dragged into the front line.`, t.side); }
  if (o.grounds && t.alive && flyingNow(t)) {
    applyStatus(S, t, 'grounded', { dur: 2, src: a });
    combo(S, 'grounding', `${t.name} is dragged out of the air!`, t.side);
  }
  // Retaliation: thorns and heated bodies punish melee.
  if (range === 'melee') {
    const th = stGet(t, 'thorns');
    if (th && a.alive) dealDamage(S, a, Math.max(1, dealt * 0.3), 'pierce', { noArmor: true, src: t });
    if (hasSt(t, 'frostarmor') && a.alive) applyStatus(S, a, 'chill', { src: t });
    const heat = t.c.heated;
    if (heat && a.alive) {
      dealDamage(S, a, Math.max(1, t.maxHp * 0.03), heat, { noArmor: true, src: t });
      if (heat === 'fire' && a.alive && rng.chance(0.3)) applyStatus(S, a, 'burn', { mag: Math.max(2, Math.round(t.maxHp * 0.02)), src: t });
    }
    const ret = t.c.retaliate;
    if (ret && a.alive && t.alive !== undefined) {
      if (ret.type) dealDamage(S, a, Math.max(1, t.maxHp * (ret.frac || 0.03)), ret.type, { noArmor: true, src: t });
      if (ret.status && rng.chance(ret.chance ?? 0.6)) applyStatus(S, a, ret.status, { src: t, dur: 2 });
    }
    if (a.tags.has('flying')) a.swoop = true;   // it came down to strike, so it can be struck
  }
  const leech = (a.c.leech || 0) + (o.leech || 0);
  if (leech && dealt) a.hp = Math.min(a.maxHp, a.hp + Math.round(dealt * leech));
  return { hit: true, crit, dmg: dealt };
}

/** Apply a status rider, with sensible magnitudes for the ones that need them. */
function riderStatus(S, a, t, id, raw, n, spell, extra) {
  const o = { src: a, spell, ...(extra || {}) };
  if (id === 'burn') o.mag = Math.max(2, Math.round(raw * 0.2));
  else if (id === 'doom') o.mag = Math.max(2, Math.round(raw * 0.15));
  else if (id === 'poison' || id === 'bleed' || id === 'chill' || id === 'drained' || id === 'petrify') o.stacks = n || 1;
  else if (id === 'vulnerable') o.mag = 2;
  else if (id === 'weaken') o.mag = 1;
  else if (n) o.dur = n;
  return applyStatus(S, t, id, o);
}

// --- abilities -----------------------------------------------------------------
/** The ability as this unit casts it: class specialisations merged in. */
function abilOf(u, id) { return effectiveAbility(u.npc, id); }

function abilityPower(u, ab) {
  const lvl = (u.npc.skills && u.npc.skills[ab.stat]) || 0;
  return ab.power * (1 + lvl * 0.035) * (ab.spell ? 1 + (u.c.spellPower || 0) : 1);
}

/** Apply an ability's rider list to friendly targets, with magnitudes. */
function applyRiders(S, u, riders, p, targets, onlyTags) {
  for (const t of targets) {
    if (!t || !standing(t)) continue;
    if (onlyTags && !onlyTags.some(tag => t.tags.has(tag))) continue;
    for (const [id, chance, n, who] of riders || []) {
      if (who === 'party' && targets.length === 1 && t === u) { /* party rider on a self cast */ }
      if (!S.rng.chance(chance)) continue;
      const o = { dur: n, src: u };
      if (id === 'inspired') { o.mag = Math.round(2 + p * 4); o.mag2 = Math.round(p * 5); }
      if (id === 'fortify') o.mag = 2 + Math.round(p * 3);
      if (id === 'evasive') o.mag = 2 + Math.round(p * 2);
      if (id === 'regen') o.mag = 0.04 + p * 0.04;
      applyStatus(S, t, id, o);
    }
  }
}
function cleanseUnit(u, n, mindOnly) {
  let removed = 0;
  u.st = u.st.filter(s => {
    const def = STATUSES[s.id];
    if (removed >= n || !def || !def.debuff || s.id === 'engulfed' || (mindOnly && !def.mind)) return true;
    removed++; return false;
  });
  return removed;
}
function friendlyTargets(S, u, ab) {
  const live = sideOf(S, u.side).filter(standing);
  if (ab.shape === 'party') return live;
  if (ab.shape === 'self') return [u];
  if (ab.allyStrongest) return [live.filter(x => x.c.range === 'melee').sort((x, y) => y.dealt - x.dealt)[0] || u];
  // 'ally': whoever needs it most
  return [live.sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0]];
}

/** Resolve an ability that has already been paid for. */
function resolveAbility(S, u, id, ab, forced) {
  const rng = S.rng;
  if (id === 'shield_bash' && u.passives && u.passives.has('unbroken')) ab = { ...ab, interrupt: true };
  const allies = sideOf(S, u.side), enemies = foesOf(S, u.side);
  const p = abilityPower(u, ab);
  const range = ab.range || 'ranged';
  const hitOpts = { power: p, type: ab.dmg || 'weapon', range, apply: ab.apply, spell: ab.pierceMagic ? null : ab.spell, bonusVs: ab.bonusVs, helpless: ab.helpless, grounds: ab.grounds, autoHit: ab.autoHit, randomApply: ab.randomApply, elementRider: ab.elementRider, execute: ab.execute, pull: ab.pull, poise: ab.poise, consume: ab.consume, reachFlyers: ab.reachFlyers };
  const reachOpts = { dive: ab.dive, reachFlyers: ab.reachFlyers, prefer: ab.prefer, preferCasters: ab.preferCasters };
  if (ab.selfDamage) u.hp = Math.max(1, u.hp - Math.round(u.maxHp * ab.selfDamage));
  let text = null;

  if (ab.kind === 'summon') {
    const [mid, n] = ab.summon;
    const side = sideOf(S, u.side);
    let made = 0;
    const tier = u.npc.monster ? Math.max(0, (u.npc.tier || 1) - 2) : Math.max(0, Math.round((u.npc.level - 1) / 1.4) - 1);
    for (let k = 0; k < n && side.filter(standing).length < 8; k++) {
      const mon = createMonster(rng, mid, tier);
      const nu = makeUnit(mon, u.side);
      nu.row = mon.combat.row;
      side.push(nu); made++;
    }
    S.stats.summons = (S.stats.summons || 0) + made;
    text = `${u.name} uses ${ab.name} — ${made} join the fight.`;
  } else if (ab.engulf) {
    const t = forced || pickTarget(S, u, enemies, 'melee');
    if (t && applyStatus(S, t, 'engulfed', { src: u })) { u.engulfDmg = 0; text = `${u.name} engulfs ${t.name}!`; }
  } else if (ab.kind === 'heal') {
    let targets = friendlyTargets(S, u, ab);
    if (ab.revive) {
      const fallen = allies.filter(x => x.downed && !x.fled && !x.npc.monster)[0];
      if (fallen) {
        fallen.alive = true; fallen.downed = false; fallen.hp = Math.round(fallen.maxHp * ab.revive);
        if (ab.barrier) fallen.barrier = Math.round(fallen.maxHp * ab.barrier);
        combo(S, 'revive', `${fallen.name} is raised by ${u.name}!`, u.side);
        targets = [fallen];
      }
    } else {
      for (const t of targets) {
        if (!t) continue;
        let heal = Math.max(2, Math.round((6 + ((u.npc.skills && u.npc.skills[ab.stat]) || 0) * 1.5 + u.npc.level) * p * (ab.healMult || 1) * ((S.ctx.env && S.ctx.env.healMult) || 1)));
        if (hasSt(t, 'burn')) heal = Math.round(heal * 0.5);
        t.hp = Math.min(t.maxHp, t.hp + heal);
        u.threat += heal * 0.5;
        const bl = stGet(t, 'bleed'); if (bl) { bl.stacks -= 2; if (bl.stacks <= 0) stRemove(t, 'bleed'); }
        if (ab.barrier) t.barrier = Math.max(t.barrier, Math.round(t.maxHp * ab.barrier));
      }
    }
    if (ab.cleanse) for (const t of targets) if (t) cleanseUnit(t, ab.cleanse);
    applyRiders(S, u, ab.apply, p, targets);
    text = `${u.name} uses ${ab.name}.`;
  } else if (ab.kind === 'buff') {
    const targets = friendlyTargets(S, u, ab);
    applyRiders(S, u, ab.apply, p, targets, ab.onlyTags);
    for (const t of targets) {
      if (!t || (ab.onlyTags && !ab.onlyTags.some(tag => t.tags.has(tag)))) continue;
      if (ab.barrier) t.barrier = Math.max(t.barrier, Math.round(t.maxHp * ab.barrier * (1 + p * 0.5)));
      if (ab.cleanse) cleanseUnit(t, ab.cleanse);
      if (ab.cleanseMind) cleanseUnit(t, 9, true);
      if (ab.infuse) { const inf = stGet(t, 'infused'); if (inf) inf.elem = ab.infuse; }
      if (ab.infuseWard) { const w = stGet(t, 'ward'); if (w) w.elem = ab.infuseWard; }
    }
    if (ab.turret) { u.turret = Math.max(u.turret, (2 + ((u.npc.skills && u.npc.skills[ab.stat]) || 0) * 0.4) * (ab.power / 0.55)); u.turretStatus = ab.turretStatus || null; }
    if (ab.taunt) applyStatus(S, u, 'taunting', { dur: 2 });
    if (ab.toFront && u.row !== 'front') { u.row = 'front'; }
    if (ab.resetCds) for (const k in u.cds) if (k !== id) u.cds[k] = 0;
    text = `${u.name} uses ${ab.name}.`;
  } else if (ab.kind === 'debuff') {
    let targets = ab.shape === 'all' ? enemies.filter(e => reachable(S, u, e, range, reachOpts)) : [forced || pickTarget(S, u, enemies, range, reachOpts)];
    if (ab.onlyTags) targets = targets.filter(t => t && ab.onlyTags.some(tag => t.tags.has(tag)));
    for (const t of targets) {
      if (!t) continue;
      for (const [sid, chance, dur] of ab.apply || []) if (rng.chance(chance)) riderStatus(S, u, t, sid, p * 8, dur, ab.spell, { poise: ab.poise, force: ab.ignoreMindless });
      if (sid0(ab) === 'vulnerable') { const v = stGet(t, 'vulnerable'); if (v) v.mag = Math.max(v.mag, Math.round(p * 4)); }
      if (ab.interrupt && t.charging) interrupt(S, t, u.name);
    }
    text = `${u.name} uses ${ab.name}${targets.length === 1 && targets[0] ? ' on ' + targets[0].name : ''}.`;
  } else if (ab.kind === 'aoe') {
    let targets = enemies.filter(e => reachable(S, u, e, range, reachOpts));
    if (ab.shape === 'front') {
      const front = targets.filter(e => e.row === 'front');
      targets = front.length ? front : targets;
    }
    if (ab.onlyTags) targets = targets.filter(t => ab.onlyTags.some(tag => t.tags.has(tag)));
    if (S.aoeFocus) targets = S.aoeFocus(u, targets);
    let total = 0, killed = 0;
    for (const t of targets) {
      const r = strike(S, u, t, { ...hitOpts, aoe: true, force: ab.ignoreMindless });
      if (r.hit) total += r.dmg;
      if (!t.alive) killed++;
      if (ab.interrupt && t.charging) interrupt(S, t, u.name);
    }
    if (killed && ab.killReset) u.cds[id] = 0;
    text = `${u.name} uses ${ab.name} — ${total} damage across ${targets.length}.`;
  } else {
    // Single-target attack, possibly several hits, possibly chaining.
    const hits = ab.hits || 1;
    let total = 0, first = null;
    for (let k = 0; k < hits; k++) {
      const t = (k === 0 && forced && reachable(S, u, forced, range, reachOpts)) ? forced : pickTarget(S, u, enemies, range, reachOpts);
      if (!t) break;
      if (!first) first = t;
      const hadBurn = hasSt(t, 'burn');
      const r = strike(S, u, t, { ...hitOpts, power: p / hits * (hits > 1 ? 1.3 : 1), leech: ab.leech });
      if (r.hit) total += r.dmg;
      if (ab.interrupt && t.charging) interrupt(S, t, u.name);
      if (!t.alive) {
        if (ab.killReset) u.cds[id] = 0;
        if (ab.killSpread === 'burn' && hadBurn) {
          const next = enemies.find(e => standing(e));
          if (next) { applyStatus(S, next, 'burn', { mag: Math.max(3, Math.round(total * 0.2)), src: u }); combo(S, 'ember_echo', `The flames leap from ${t.name} to ${next.name}.`, u.side); }
        }
      }
    }
    for (let c = 0; c < (ab.chain || 0); c++) {
      const t2 = enemies.find(e => e !== first && reachable(S, u, e, 'ranged'));
      if (!t2) break;
      const r = strike(S, u, t2, { ...hitOpts, power: p * 0.5, leech: ab.leech });
      if (r.hit) total += r.dmg;
    }
    if (ab.risky) applyStatus(S, u, 'vulnerable', { dur: 1, mag: 2 });
    text = `${u.name} uses ${ab.name} — ${total} damage.`;
  }
  // Riders every kind can carry, from specialisations.
  if (ab.selfApply) applyRiders(S, u, ab.selfApply, p, [u]);
  if (ab.partyApply) applyRiders(S, u, ab.partyApply, p, allies.filter(standing), ab.onlyTags);
  if (ab.enemyApply) for (const e of enemies.filter(standing)) for (const [sid, chance, dur] of ab.enemyApply) if (rng.chance(chance)) riderStatus(S, u, e, sid, p * 8, dur, ab.spell);
  if (text) say(S, ab.kind === 'heal' ? 'heal' : ab.kind === 'buff' ? 'buff' : ab.kind === 'debuff' ? 'debuff' : 'ability', text, u.side, { ability: id });
}
const sid0 = (ab) => ab.apply && ab.apply[0] && ab.apply[0][0];

function hasShieldReq(u, ab) {
  if (ab.needs !== 'shield') return true;
  const eq = u.npc.equipment;
  // Before the off-hand slot exists every fighter counts as carrying one.
  if (!eq || !('offhand' in eq)) return true;
  return !!(eq.offhand && eq.offhand.kind === 'shield');
}

/** Can this ability do something useful right now? */
function usable(S, u, id, ab, allies, enemies) {
  if ((u.cds[id] || 0) > 0) return false;
  if (ab.spell && hasSt(u, 'silence')) return false;
  if (!hasShieldReq(u, ab)) return false;
  if (ab.coven && sideOf(S, u.side).filter(x => standing(x) && x.tags.has('coven')).length < 3) return false;
  if (ab.kind === 'summon') return sideOf(S, u.side).filter(standing).length < 7;
  if (ab.engulf) return ![...S.A, ...S.B].some(x => { const e = stGet(x, 'engulfed'); return e && e.src === u; }) && enemies.some(e => reachable(S, u, e, 'melee'));
  const range = ab.range || 'ranged';
  const ro = { dive: ab.dive, reachFlyers: ab.reachFlyers };
  switch (ab.kind) {
    case 'heal':
      if (ab.revive) return allies.some(a => a.downed && !a.fled && !a.npc.monster);
      return allies.some(a => standing(a) && a.hp / a.maxHp < 0.6) || (ab.shape === 'self' && u.hp / u.maxHp < 0.6);
    case 'buff': {
      if (ab.resetCds) return Object.values(u.cds).filter(v => v > 1).length >= 2 && u.hp / u.maxHp > 0.4;
      if (ab.taunt) return allies.filter(standing).length > 1 && !hasSt(u, 'taunting');
      if (ab.cleanse && !ab.apply) return allies.some(a => standing(a) && a.st.some(s => STATUSES[s.id] && STATUSES[s.id].debuff));
      if (ab.onlyTags) return allies.some(a => standing(a) && ab.onlyTags.some(tag => a.tags.has(tag)));
      if (ab.barrier && !ab.apply) return friendlyTargets(S, u, ab).some(t => t && t.barrier < t.maxHp * 0.05 && t.hp / t.maxHp < 0.85);
      const main = sid0(ab);
      if (ab.shape === 'party') return !main || allies.filter(standing).some(a => !hasSt(a, main));
      if (ab.turret) return u.turret <= 0;
      if (ab.shape === 'ally') return !main || friendlyTargets(S, u, ab).some(t => t && !hasSt(t, main));
      return !main || !hasSt(u, main);
    }
    case 'aoe': {
      const n = enemies.filter(e => reachable(S, u, e, range, ro) && (!ab.onlyTags || ab.onlyTags.some(tag => e.tags.has(tag)))).length;
      return n >= 2 || (n >= 1 && ab.shape === 'all' && enemies.filter(standing).length === 1);
    }
    case 'debuff': {
      const pool = enemies.filter(e => reachable(S, u, e, range, ro) && (!ab.onlyTags || ab.onlyTags.some(tag => e.tags.has(tag))));
      if (!pool.length) return false;
      const main = sid0(ab);
      if (ab.preferCasters) return pool.some(e => e.charging || e.tags.has('caster'));
      return !main || pool.some(e => !hasSt(e, main));
    }
    default: return enemies.some(e => reachable(S, u, e, range, ro));
  }
}

function chooseAction(S, u, allies, enemies) {
  const known = [...(u.npc.abilities || []), ...(u.c.gearAbilities || [])].map(id => [id, abilOf(u, id)]).filter(([, ab]) => ab);
  // A telegraphed attack on the other side trumps everything: stop it.
  const charging = enemies.filter(e => standing(e) && e.charging);
  if (charging.length) {
    for (const [id, ab] of known) {
      if (!usable(S, u, id, ab, allies, enemies)) continue;
      const stops = ab.interrupt || (ab.apply || []).some(([sid, ch]) => ch >= 0.3 && STATUSES[sid] && (STATUSES[sid].hard || sid === 'silence'));
      if (!stops) continue;
      const tgt = charging.find(e => reachable(S, u, e, ab.range || 'ranged', { dive: ab.dive, reachFlyers: ab.reachFlyers }));
      if (tgt) return { id, ab, target: tgt };
    }
  }
  const tactic = (u.npc.tactics || 'auto');
  const order = tactic === 'auto' ? known : [...known].sort((a, b) => tacticScore(tactic, b[1]) - tacticScore(tactic, a[1]));
  for (const [id, ab] of order) {
    if (!usable(S, u, id, ab, allies, enemies)) continue;
    if (S.rng.chance(0.72)) return { id, ab };
  }
  return null;
}
/** Tactics presets reorder what a character reaches for first. */
function tacticScore(tactic, ab) {
  const k = ab.kind;
  if (tactic === 'aggressive') return k === 'attack' || k === 'aoe' ? 2 : k === 'debuff' ? 1 : 0;
  if (tactic === 'defensive') return ab.interrupt || ab.taunt || ab.barrier ? 3 : k === 'heal' ? 2 : k === 'buff' ? 1 : 0;
  if (tactic === 'support') return k === 'heal' || k === 'buff' ? 2 : k === 'debuff' ? 1 : 0;
  return 0;
}

function useAbility(S, u, id, ab, target) {
  u.cds[id] = ab.spell && S.ctx.env && S.ctx.env.spellHaste ? Math.max(1, ab.cd - 1) : ab.cd;
  if (ab.windup) {
    u.charging = { id, ab, left: ab.windup, target };
    say(S, 'telegraph', `${u.name} begins ${ab.name}…`, u.side, { ability: id });
    S.stats.telegraphs++;
    return;
  }
  resolveAbility(S, u, id, ab, target);
}

// --- turns ---------------------------------------------------------------------
function basicAttack(S, u, enemies, power = 1) {
  const range = u.c.range || 'melee';
  const t = pickTarget(S, u, enemies, range);
  if (!t) return false;
  const r = strike(S, u, t, { power, range, apply: u.c.onHit || undefined });
  if (r.hit) say(S, 'hit', `${u.name} hits ${t.name} for ${r.dmg}${r.crit ? ' (critical)' : ''}.`, u.side);
  else say(S, 'miss', `${u.name} misses ${t.name}.`, u.side);
  return true;
}

/** Start-of-turn upkeep: damage over time, regeneration, environment. */
export function upkeep(S, u) {
  const env = S.ctx.env || {};
  for (const s of [...u.st]) {
    if (!u.alive) return;
    if (s.id === 'burn') dealDamage(S, u, s.mag || 3, 'fire', { noArmor: true, src: s.src });
    else if (s.id === 'poison') dealDamage(S, u, Math.max(1, u.maxHp * 0.03 * s.stacks), 'nature', { noArmor: true, src: s.src });
    else if (s.id === 'doom') { dealDamage(S, u, s.mag || 3, 'shadow', { noArmor: true, src: s.src }); s.mag = Math.round((s.mag || 3) * 1.3); }
    else if (s.id === 'engulfed') dealDamage(S, u, Math.max(2, u.maxHp * 0.05), 'nature', { noArmor: true, src: s.src });
    else if (s.id === 'regen') u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.round(u.maxHp * (s.mag || 0.05))));
  }
  if (!u.alive) return;
  if (u.tags.has('regenerating') && !u.regenStop && u.hp < u.maxHp) {
    const r = u.c.regen || 0.1;
    u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.round(u.maxHp * r)));
  }
  if (env.hpDrain && !(u.res[env.hpDrain.type] >= 0.5)) dealDamage(S, u, Math.max(1, u.maxHp * env.hpDrain.pct), env.hpDrain.type, { noArmor: true });
}

export function endTurn(u) {
  for (const s of u.st) if (s.dur < 90) s.dur--;
  u.st = u.st.filter(s => s.dur > 0 || (s.dur >= 90));
}

function cannotAct(S, u) {
  if (SKIP.some(id => hasSt(u, id)) || petrified(u)) return true;
  if (hasSt(u, 'slow') && S.round % 2 === 0) return true;
  return false;
}

export function takeTurn(S, u) {
  if (!standing(u)) return;
  const rng = S.rng;
  const allies = sideOf(S, u.side), enemies = foesOf(S, u.side);
  u.swoop = false;
  upkeep(S, u);
  if (!u.alive) return;
  if (cannotAct(S, u)) { endTurn(u); return; }
  // Bleeding hurts when it moves.
  const bl = stGet(u, 'bleed');
  if (bl) { dealDamage(S, u, Math.max(1, u.maxHp * 0.025 * bl.stacks), 'slash', { noArmor: true, src: bl.src }); if (!u.alive) return; }
  // Morale: badly hurt units may break, cowards more often. The mindless never do.
  if (!u.tags.has('mindless') && u.hp / u.maxHp < 0.3 && rng.chance(u.c.flee * 0.22 * (S.ctx.riskMult || 1) * (u.tags.has('coward') ? 1.6 : 1))) {
    u.fled = true;
    say(S, 'flee', `${u.name} breaks and flees.`, u.side);
    return;
  }
  if (hasSt(u, 'fear') && rng.chance(0.5)) { say(S, 'status', `${u.name} cowers.`, u.side); endTurn(u); return; }
  if (u.turret > 0) {
    const t = pickTarget(S, u, enemies, 'ranged');
    if (t) {
      dealDamage(S, t, Math.max(1, Math.round(u.turret)), 'storm', { noArmor: true, src: u });
      if (u.turretStatus && S.rng.chance(0.35)) riderStatus(S, u, t, u.turretStatus, u.turret * 4, 1);
    }
  }
  // Last stand: a specialised heal fires on its own when it matters most.
  if (!u.once.lastStand && u.hp / u.maxHp < 0.3) {
    for (const id of u.npc.abilities || []) {
      const ab = abilOf(u, id);
      if (ab && ab.lastStand && u.hp / u.maxHp < ab.lastStand) {
        u.once.lastStand = true;
        say(S, 'combo', `${u.name}'s last stand!`, u.side, { combo: 'last_stand' });
        resolveAbility(S, u, id, { ...ab, shape: 'self' }, null);
        break;
      }
    }
  }
  if (hasSt(u, 'charm')) {
    const t = pickTarget(S, u, allies, 'ranged');
    if (t) { const r = strike(S, u, t, { range: 'ranged' }); say(S, 'charm', `${u.name}, charmed, strikes ${t.name}${r.hit ? ` for ${r.dmg}` : ' and misses'}.`, u.side); }
    endTurn(u); return;
  }
  if (hasSt(u, 'confuse')) {
    const all = [...allies, ...enemies].filter(x => x !== u && standing(x));
    const t = all.length ? rng.pick(all) : null;
    if (t) { strike(S, u, t, { range: 'ranged' }); say(S, 'confuse', `${u.name} lashes out wildly at ${t.name}.`, u.side); }
    endTurn(u); return;
  }
  if (u.charging) {
    const ch = u.charging;
    if (--ch.left <= 0) { u.charging = null; resolveAbility(S, u, ch.id, ch.ab, ch.target); }
    else say(S, 'telegraph', `${u.name} is still gathering ${ch.ab.name}…`, u.side);
    endTurn(u); return;
  }
  const action = chooseAction(S, u, allies, enemies);
  if (action) useAbility(S, u, action.id, action.ab, action.target);
  else if (!basicAttack(S, u, enemies)) say(S, 'wait', `${u.name} cannot reach anyone.`, u.side);
  for (let k = 1; k < (u.heads || 1) && u.alive; k++) basicAttack(S, u, enemies);
  useBelt(S, u, allies, enemies);
  // Party potion use: automatic triage.
  if (u.side === 'party' && S.ctx.potions && S.ctx.potions.count > 0) {
    const crit = S.A.filter(a => standing(a) && a.hp / a.maxHp < 0.28);
    if (crit.length && rng.chance(0.6)) {
      const t = crit[0];
      t.hp = Math.min(t.maxHp, t.hp + 14 + (S.ctx.tier || 1) * 3);
      S.ctx.potions.count--;
      say(S, 'potion', `${t.name} drinks a potion.`, 'party');
    }
  }
  endTurn(u);
}

/**
 * The potion belt: each character carries up to three flasks and drinks (or
 * throws) one a turn when its rule says so. Unused flasks go home.
 */
function useBelt(S, u, allies, enemies) {
  const belt = S.ctx.belts && S.ctx.belts[u.npc.id];
  if (!belt || !belt.length || !standing(u)) return;
  const bossHere = enemies.some(e => standing(e) && e.boss);
  const charging = enemies.find(e => standing(e) && e.charging);
  const chargeType = charging && (charging.charging.ab.dmg === 'element' ? charging.c.element : charging.charging.ab.dmg);
  for (let i = 0; i < belt.length; i++) {
    if (belt[i].startsWith('scroll:')) {
      const id = belt[i].slice(7), ab = ABILITIES[id];
      const reader = ((u.npc.attributes && u.npc.attributes.int) || 0) >= 12 || ((u.npc.attributes && u.npc.attributes.wis) || 0) >= 12;
      if (!ab || !reader || !usable(S, u, '__scroll', ab, allies, enemies)) continue;
      if (ab.kind === 'heal' && !allies.some(a => standing(a) && a.hp / a.maxHp < 0.4) && !ab.revive) continue;
      belt.splice(i, 1);
      S.stats.scrolls = (S.stats.scrolls || 0) + 1;
      say(S, 'potion', `${u.name} reads a scroll of ${ab.name}.`, u.side);
      resolveAbility(S, u, id, ab, null);
      return;
    }
    const P = POTIONS[belt[i]];
    if (!P) continue;
    let target = null, drink = false;
    switch (P.use) {
      case 'hurt': drink = u.hp / u.maxHp < 0.3; break;
      case 'poisoned': { const p = stGet(u, 'poison'); drink = !!p && p.stacks >= 2; break; }
      case 'burning': { const b = stGet(u, 'bleed'); drink = hasSt(u, 'burn') || (!!b && b.stacks >= 3); break; }
      case 'petrifying': drink = hasSt(u, 'petrify'); break;
      case 'mind': drink = ['fear', 'confuse'].some(id => hasSt(u, id)); break;
      case 'boss': drink = bossHere && S.round <= 2; break;
      case 'dying': drink = u.hp / u.maxHp < 0.2 && !hasSt(u, 'stealth'); break;
      default:
        if (P.use.startsWith('ward:')) drink = chargeType === P.use.slice(5) && !hasSt(u, 'ward');
        else if (P.use === 'unholy') target = enemies.find(e => standing(e) && (e.tags.has('undead') || e.tags.has('fiend')) && (e.tags.has('regenerating') || e.tags.has('undying') || e.boss));
        else if (P.use === 'regenerator') target = enemies.find(e => standing(e) && (e.tags.has('regenerating') || e.tags.has('hydra')));
        else if (P.use === 'oil') target = allies.some(a => a !== u && standing(a) && (a.npc.abilities || []).some(id => { const ab = ABILITIES[id]; return ab && ab.dmg === 'fire'; })) ? enemies.find(e => standing(e) && e.boss) : null;
    }
    if (!drink && !target) continue;
    belt.splice(i, 1);
    S.stats.potions = (S.stats.potions || 0) + 1;
    if (target) {
      const th = P.throw;
      if (th.type) dealDamage(S, target, Math.max(3, target.maxHp * th.power), th.type, { noArmor: true, src: u });
      if (th.status) applyStatus(S, target, th.status, { src: u, mag: Math.max(3, Math.round(target.maxHp * 0.03)) });
      say(S, 'potion', `${u.name} throws ${P.name} at ${target.name}.`, u.side);
    } else {
      if (P.heal) u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * P.heal));
      for (const id of P.cure || []) stRemove(u, id);
      for (const [id, dur, elem] of P.grant || []) applyStatus(S, u, id, { dur, elem, mag: id === 'regen' ? 0.05 : undefined });
      say(S, 'potion', `${u.name} drinks ${P.name}.`, u.side);
    }
    return;
  }
}

/** Bosses act a little between the other side's turns. */
function legendaryBeat(S, after) {
  for (const x of foesOf(S, after.side)) {
    if (!standing(x) || x.legendaryLeft <= 0 || cannotAct(S, x)) continue;
    const opp = foesOf(S, x.side).filter(standing).length || 1;
    if (!S.rng.chance(x.legendary / opp)) continue;
    x.legendaryLeft--;
    say(S, 'legendary', `${x.name} strikes again.`, x.side);
    basicAttack(S, x, foesOf(S, x.side), 0.6);
  }
}

// --- the fight -------------------------------------------------------------------
export function createBattle(rng, party, foes, ctx = {}) {
  const S = {
    rng, ctx, round: 0, log: [],
    A: party.map(n => makeUnit(n, 'party')),
    B: foes.map(n => makeUnit(n, 'foe')),
    stats: { combos: {}, statuses: {}, dmgByType: {}, interrupts: 0, telegraphs: 0 },
  };
  const slots = ctx.frontSlots || 3;
  formRows(S.A, slots); formRows(S.B, slots);
  const env = ctx.env || {};
  for (const u of [...S.A, ...S.B]) {
    for (const [id, dur] of u.c.startStatus || []) applyStatus(S, u, id, { dur, mag: id === 'evasive' ? 3 : id === 'regen' ? 0.03 : id === 'thorns' ? 1 : undefined });
    if (u.c.barrier) u.barrier = Math.round(u.maxHp * u.c.barrier);
    if (env.wet && !u.tags.has('swimmer')) applyStatus(S, u, 'wet', { dur: 99 });
    for (const [id, n] of env.startStatus || []) applyStatus(S, u, id, { stacks: n });
  }
  // Openers: abilities specialised to fire before the first blow.
  for (const u of [...S.A, ...S.B]) {
    for (const id of u.npc.abilities || []) {
      const ab = abilOf(u, id);
      if (ab && ab.opener) { resolveAbility(S, u, id, ab, null); u.cds[id] = ab.cd; }
    }
  }
  // Webs hold the party in place — unless someone brought fire.
  if (env.webs) {
    const fire = S.A.some(u => (u.npc.abilities || []).some(id => { const ab = ABILITIES[id]; return ab && ab.dmg === 'fire'; }) || u.c.dmgElement === 'fire');
    if (!fire) for (const u of S.A) applyStatus(S, u, 'root', { dur: 1 });
    else say(S, 'status', 'The party burns through the webs.', 'party');
  }
  // Frightful presence lands before anyone moves.
  for (const u of [...S.A, ...S.B]) {
    if (!u.tags.has('frightful')) continue;
    for (const e of foesOf(S, u.side)) {
      const wis = e.npc.attributes ? Math.floor(((e.npc.attributes.wis || 10) - 10) / 2) : 0;
      if (rng.int(1, 20) + wis < 13) applyStatus(S, e, 'fear', { src: u, dur: 2 });
    }
    say(S, 'status', `${u.name}'s presence is terrifying.`, u.side);
  }
  return S;
}

/** One round. Returns false when the fight is over. */
export function runRound(S) {
  if (S.round >= MAX_ROUNDS) return false;
  if (!S.A.some(standing) || !S.B.some(standing)) return false;
  if (!roundStart(S)) return false;
  const { rng } = S;
  const order = [...S.A, ...S.B].filter(standing).map(u => {
    let init = u.c.init + rng.int(1, 20);
    if (S.round === 1 && u.tags.has('ambusher')) init += 20;
    const ch = stGet(u, 'chill'); if (ch) init -= ch.stacks * 2;
    if (hasSt(u, 'slow')) init -= 6;
    return [u, init];
  }).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  for (const u of order) {
    if (!S.A.some(standing) || !S.B.some(standing)) break;
    takeTurn(S, u);
    if (hasSt(u, 'haste') && S.round % 2 === 1 && standing(u)) takeTurn(S, u);
    legendaryBeat(S, u);
  }
  roundEnd(S);
  return true;
}

/**
 * Everything a round does before anyone acts: the retreat check, regrowing
 * heads, the place itself, guardians, auras, alarms. Returns false if the
 * party broke off. Split out so a real-time field can run it on its own clock.
 */
export function roundStart(S) {
  const { rng, ctx } = S;
  S.round++;
  // Party-wide disengage. Without this a party always fights to the last body
  // and every marginal delve ends in a wipe instead of a retreat.
  if (ctx.retreatAt && S.round > 1) {
    let hp = 0, max = 0;
    for (const u of S.A) { hp += Math.max(0, u.hp); max += u.maxHp; }
    if (max > 0 && hp / max < ctx.retreatAt) {
      for (const u of S.A) if (u.alive) u.fled = true;
      S.retreated = true;
      say(S, 'retreat', 'The party breaks off and pulls back.', 'party');
      return false;
    }
  }
  const all = [...S.A, ...S.B];
  for (const u of all) {
    if (u.headsCut && standing(u)) {
      if (!u.regenStop) { u.heads = Math.min(9, u.heads + u.headsCut * 2); say(S, 'status', `${u.name} grows ${u.headsCut * 2} new heads!`, u.side); }
      else say(S, 'status', `Fire seals ${u.name}'s wounds.`, u.side);
      u.headsCut = 0;
    }
    u.regenStop = false; u.legendaryLeft = u.legendary;
  }
  // The place itself takes a turn.
  const env = ctx.env || {};
  if (env.wildMagic && rng.chance(env.wildMagic)) {
    const who = rng.pick(all.filter(standing));
    const eff = rng.pick([['haste', 2], ['slow', 2], ['empower', 2], ['weaken', 2], ['confuse', 1], ['regen', 2]]);
    if (who) { applyStatus(S, who, eff[0], { dur: eff[1], mag: eff[0] === 'regen' ? 0.05 : 1, force: true }); combo(S, 'wild_magic', `Wild magic surges around ${who.name}.`, who.side); }
  }
  if (env.madness) for (const u of S.A) if (standing(u) && rng.chance(env.madness)) {
    const wis = Math.floor((((u.npc.attributes && u.npc.attributes.wis) || 10) - 10) / 2);
    if (rng.int(1, 20) + wis < 14) applyStatus(S, u, 'confuse', { dur: 1 });
  }
  if (env.lairAction) {
    const boss = S.B.find(u => standing(u) && u.boss);
    const victim = rng.pick(S.A.filter(standing));
    if (boss && victim) {
      const el = boss.c.element || 'fire';
      dealDamage(S, victim, Math.max(3, victim.maxHp * 0.06), el, { noArmor: true });
      if (DAMAGE_TYPES[el] && DAMAGE_TYPES[el].status) applyStatus(S, victim, DAMAGE_TYPES[el].status, { mag: 3, stacks: 1 });
      say(S, 'lair', `The lair lashes out at ${victim.name}.`, 'foe');
    }
  }
  // Spirit guardians burn whatever stands in front of their keeper.
  for (const u of all) {
    const g = standing(u) && stGet(u, 'guardians');
    if (!g) continue;
    const p = 0.35 + ((u.npc.skills && u.npc.skills.faith) || 0) * 0.02;
    for (const e of foesOf(S, u.side)) if (standing(e) && e.row === 'front') dealDamage(S, e, Math.max(2, (u.c.dmg[1] + u.c.dmgBonus) * p), 'holy', { noArmor: true, src: u });
  }
  // Auras pulse: gazes, stenches, antimagic.
  for (const u of all) {
    const au = standing(u) && u.c.aura;
    if (!au || cannotAct(S, u)) continue;
    let pool = foesOf(S, u.side).filter(e => standing(e) && (!au.front || e.row === 'front'));
    if (au.casters) pool = pool.filter(e => e.tags.has('caster'));
    if (au.gaze) pool = pool.filter(e => !hasSt(e, 'blind') && !e.tags.has('blindsight'));
    if (au.pick) pool = rng.shuffle([...pool]).slice(0, au.pick);
    for (const e of pool) if (rng.chance(au.chance)) applyStatus(S, e, au.status, { src: u, dur: 2 });
  }
  if (ctx.onRound) ctx.onRound(S);
  // Alarms call for help every other round.
  if (ctx.reinforce && S.round % 2 === 0) {
    for (const u of all) if (standing(u) && u.tags.has('alarm')) {
      const extra = ctx.reinforce(u.side) || [];
      for (const n of extra) { const nu = makeUnit(n, u.side); nu.row = 'front'; sideOf(S, u.side).push(nu); }
      if (extra.length) say(S, 'alarm', `${u.name} shrieks — ${extra.length} more arrive.`, u.side);
    }
  }
  return true;
}

/** End of a round: cooldowns and poise immunity tick down. */
export function roundEnd(S) {
  for (const u of [...S.A, ...S.B]) {
    for (const k in u.cds) if (u.cds[k] > 0) u.cds[k]--;
    if (u.poiseImmune > 0) u.poiseImmune--;
  }
}

export { legendaryBeat, standing };

export function simulateCombat(rng, party, foes, ctx = {}) {
  const S = createBattle(rng, party, foes, ctx);
  while (runRound(S)) { /* next round */ }
  // Write hp back to the real NPCs.
  for (const u of S.A) u.npc.hp = Math.max(0, Math.min(u.npc.maxHp, Math.round(u.hp)));
  for (const u of S.B) u.npc.hp = Math.max(0, Math.min(u.npc.maxHp, Math.round(u.hp)));
  // A unit that fled is still alive — only an empty standing roster is a wipe.
  const partyStanding = S.A.filter(u => u.alive);
  const partyHolding = S.A.filter(standing);
  const foeHolding = S.B.filter(standing);
  return {
    log: S.log, rounds: S.round, retreated: !!S.retreated,
    wipe: partyStanding.length === 0,
    won: partyHolding.length > 0 && foeHolding.length === 0,
    draw: partyHolding.length > 0 && foeHolding.length > 0,
    downed: S.A.filter(u => u.downed).map(u => u.npc),
    foesKilled: S.B.filter(u => u.downed).length,
    partyUnits: S.A, foeUnits: S.B, stats: S.stats,
  };
}
