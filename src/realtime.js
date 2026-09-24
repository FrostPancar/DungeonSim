// ============================================================================
// REAL-TIME COMBAT: fights played out on the map, tile by tile.
//
// Each map keeps a combat *field* — one long-lived battle state from the
// combat core, whose sides grow and shrink as units come into reach of each
// other. Every unit acts on its own clock with the core's own takeTurn, so
// abilities, statuses, combos, telegraphs and poise all work unchanged; what
// is new is *when* a unit acts and *whom it can reach*: melee needs an
// adjacent enemy, ranged needs range and a clear line of sight, and rows
// follow from who is standing next to whom. See docs/realtime-combat-plan.md.
// ============================================================================
import { clamp } from './rng.js';
import { BUILDINGS } from './data.js';
import { lineOfSight, findPath } from './world.js';
import { occupyMove } from './occupancy.js';
import { makeUnit, applyStatus, takeTurn, roundStart, roundEnd, hasSt, stGet, upkeep, endTurn, legendaryBeat, standing } from './combat.js';
import { rollMonsterDrops, noteBestiary } from './monsters.js';
import { killXp } from './classes.js';
import { awardXp } from './expedition.js';
import { dropItems, killColonist, addThought, gainXp } from './colony.js';
import { BIOMES_RIFT } from './biomes.js';
import { ANIMALS, isMature, beastAsCombatant } from './husbandry.js';

export const ROUND_TICKS = 6;    // one combat round of game time
export const ENGAGE = 7;         // tiles apart at which a fight picks you up
const LEAVE_R = 12;              // nothing hostile this close for a while: out of the fight
const LEAVE_TICKS = 40;
const LOCAL_R = 8;               // who counts as "in this fight" for one unit's turn
export const RANGED_R = 6;       // bows and spells
const TURRET_R = 7;
const AOE_R = 2;                 // a blast's radius around its primary target
const DOWNED_TICKS = 400;

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** A turret, shaped into a combatant the way husbandry.js's beastAsCombatant
 *  shapes a beast — furniture with a stat block. It never flees or breaks. */
export function turretAsCombatant(rec, defBonus) {
  const def = BUILDINGS[rec.b.id];
  const arcane = rec.b.id === 'turret_arcane';
  const pw = 8 + Math.round(defBonus * 40);
  return {
    id: 'turret:' + rec.x + ',' + rec.y, turretRec: rec, x: rec.x, y: rec.y,
    name: { short: def.name, full: def.name },
    race: 'construct', klass: 'brute', level: 1,
    hp: rec.b.hp, maxHp: def.hp, traits: [], injuries: [], skills: {}, abilities: [],
    attributes: { str: 10, dex: 10, con: 14, int: 3, wis: 10, cha: 5 },
    equipment: { weapon: null, armor: null },
    hostility: 0, thoughts: [], relations: {}, xp: {}, passions: {},
    combat: {
      stat: 'ranged', acc: 4 + Math.round(pw * 0.4), dmg: [Math.max(1, Math.round(pw * 0.5)), Math.max(2, Math.round(pw * 1.1))],
      dmgBonus: Math.round(pw * 0.3), armor: arcane ? 5 : 9,
      init: 2, mult: 1, leech: 0, role: 'back', flee: 0,
      row: 'back', range: 'ranged', dmgType: arcane ? 'fire' : 'pierce', tags: ['construct'], res: {},
      immune: ['fear', 'charm', 'sleep', 'confuse'], resist: {}, poise: 2,
      def: 5,
    },
  };
}

/** Walls, stakes and barricades: home ground is worth a lot. */
function campFortify(w) {
  let f = 0;
  for (const b of w.findBuildings()) {
    const id = b.b.id;
    f += id === 'wall' || id === 'door' || id === 'timber_wall' ? 0.004 : id === 'fence' ? 0.006 : id === 'stakes' ? 0.012
      : id === 'palisade' ? 0.015 : id === 'barricade' ? 0.02 : id === 'armory' ? 0.03 : 0;
  }
  return clamp(f, 0, 0.35);
}

/** What counts as hostile on the map right now: awake, alive, not running away. */
export function hostilesOn(v) {
  return v.raiders.filter(r => r.hp > 0 && !r.neutral && (!r.floorSpawn || r.awake) && !r.fleeing);
}

/** The nearest hostile within `r` tiles of (x, y), or null. */
export function nearestHostile(v, x, y, r = ENGAGE) {
  let best = null, bd = Infinity;
  for (const h of hostilesOn(v)) {
    const d = Math.max(Math.abs(h.x - x), Math.abs(h.y - y));
    if (d <= r && d < bd) { bd = d; best = h; }
  }
  return best;
}

/**
 * A tame beast's stand-in in the field: husbandry's combatant, kept per beast
 * so the fight sees one body, and synced to where the beast actually stands.
 */
function beastUnit(v, f, b) {
  const bu = f.beasts || (f.beasts = new Map());
  let k = bu.get(b);
  if (!k || !f.units.has(k)) {
    k = beastAsCombatant(b);
    k.id = 'beast:' + b.id;   // never mistaken for a colonist's belt or record
    bu.set(b, k);
  }
  k.x = b.x; k.y = b.y; k.mapId = v._m.id;
  return k;
}

/** Tame beasts that fight: war beasts, and pack beasts at their handler's heel. */
function beastsIn(v, f) {
  const out = [];
  for (const b of v.beasts) {
    if (!b.tame || b.dead || b.downed || b.hp <= 0 || !isMature(b)) continue;
    const A = ANIMALS[b.species];
    if (!A.war && !(A.pack && b.heeling)) continue;
    out.push(beastUnit(v, f, b));
  }
  return out;
}

/** Colonists who can fight: here, alive, on their feet. */
function fightersOn(v) {
  return v.here.filter(c => !c.dead && !c.away && c.hp > 0 && !c.downed);
}

/** The field for the map in scope, made on first use. */
function fieldOf(v) {
  if (v.field) return v.field;
  const m = v._m;
  const B = m.kind === 'floor' ? BIOMES_RIFT[m.biome] : null;
  const root = v.root;
  const f = {
    units: new Map(), turrets: new Map(), nextRound: v.tick + ROUND_TICKS, fx: [], fxSeq: 0, active: false, startTick: 0, kills: 0,
    S: {
      rng: m.rng || root.rng, round: 0, log: [],
      A: [], B: [], stats: { combos: {}, statuses: {}, dmgByType: {}, interrupts: 0, telegraphs: 0 },
      ctx: {
        riskMult: 1, tier: 1, env: { ...((B && B.env) || {}) }, frontSlots: 3, partyDamageMult: 1.05,
        potions: m.kind === 'floor' ? packPotions(v) : livePotions(root),
        belts: {},
      },
    },
  };
  v.field = f;
  return f;
}

/** The shared potion stock, live: a triage draught comes out of the stores. */
export function livePotions(root) {
  return { get count() { return root.resources.potion || 0; }, set count(n) { root.resources.potion = Math.max(0, n); } };
}

/** Down in the Rift the triage draughts are whatever the people there carried. */
export function packPotions(v) {
  const here = () => v.here.filter(c => !c.dead && c.pack && c.pack.potion > 0);
  return {
    get count() { return here().reduce((s, c) => s + c.pack.potion, 0); },
    set count(n) {
      let drop = Math.max(0, this.count - n);
      for (const c of here()) { const d = Math.min(drop, c.pack.potion); c.pack.potion -= d; drop -= d; if (!drop) break; }
    },
  };
}

/** Record something for the renderer to show: a number, a word, an icon. */
function fx(f, x, y, text, color, kind = 'num') {
  f.fx.push({ seq: ++f.fxSeq, x, y, text, color, kind });
  if (f.fx.length > 80) f.fx.shift();
}

/** Put a unit into the field. */
function join(v, f, npc, side, tick) {
  const u = makeUnit(npc, side);
  u.static = !!npc.turretRec;
  const idn = typeof npc.id === 'number' ? npc.id : (npc.x || 0) * 31 + (npc.y || 0);
  u.next = tick + 1 + ((idn * 7 + (u.c.init || 0) * 3) % ROUND_TICKS + ROUND_TICKS) % ROUND_TICKS;
  u.quiet = 0;
  const env = f.S.ctx.env || {};
  for (const [id, dur] of u.c.startStatus || []) applyStatus(f.S, u, id, { dur, mag: id === 'evasive' ? 3 : id === 'regen' ? 0.03 : id === 'thorns' ? 1 : undefined });
  if (u.c.barrier) u.barrier = Math.round(u.maxHp * u.c.barrier);
  if (env.wet && !u.tags.has('swimmer')) applyStatus(f.S, u, 'wet', { dur: 99 });
  for (const [id, n] of env.startStatus || []) applyStatus(f.S, u, id, { stacks: n });
  (side === 'party' ? f.S.A : f.S.B).push(u);
  f.units.set(npc, u);
  // Their loaded belt, for the core's drink-or-throw rules.
  if (side === 'party' && npc.beltLoaded) f.S.ctx.belts[npc.id] = npc.beltLoaded;
  if (side === 'foe') noteBestiary(v, [npc]);
  // Whatever they were doing, they stop: sleep, a meal, a bench.
  if (side === 'party' && !npc.turretRec && npc.task && !['fight', 'travel', 'move'].includes(npc.task.kind)) { npc.task = null; npc.path = null; }
  return u;
}

function leave(f, u) {
  f.units.delete(u.npc);
  const list = u.side === 'party' ? f.S.A : f.S.B;
  const i = list.indexOf(u);
  if (i >= 0) list.splice(i, 1);
  const n = u.npc;
  n.fxSt = null; n.fxCharging = false;
  if (u.alive && !n.turretRec) n.hp = clamp(Math.round(u.hp), 1, n.maxHp);
}

/** Tiles and sight lines decide who can reach whom. */
function spatial(v) {
  const w = v.world;
  return (a, t, range) => {
    const A = a.npc, T = t.npc;
    if (A.x == null || T.x == null) return false;
    const d = Math.max(Math.abs(A.x - T.x), Math.abs(A.y - T.y));
    if (range === 'melee') return d <= (a.c.reach ? 2 : 1);
    const R = a.static ? TURRET_R : RANGED_R;
    return d <= R && (d <= 1 || lineOfSight(w, A.x, A.y, T.x, T.y));
  };
}

/**
 * Cover: a shot at someone with something solid on the tile between them and
 * the shooter — a wall, rock, a tree, a crate — is harder to land. Built
 * walls and barricades are better cover than whatever happened to be there.
 */
function coverOf(v) {
  const w = v.world;
  return (a, t, range) => {
    if (range === 'melee' || !a.npc || !t.npc || a.npc.x == null) return 0;
    const dx = Math.sign(a.npc.x - t.npc.x), dy = Math.sign(a.npc.y - t.npc.y);
    const cx = t.npc.x + dx, cy = t.npc.y + dy;
    if (!w.inside(cx, cy) || (cx === a.npc.x && cy === a.npc.y)) return 0;
    const b = w.building[w.idx(cx, cy)];
    if (b && b.done && ['wall', 'timber_wall', 'barricade', 'palisade', 'stakes'].includes(b.id)) return 4;
    return w.walkable(cx, cy) ? 0 : 3;
  };
}

/** Can this unit do anything useful from where it stands? */
function canReach(S, u, foes) {
  const ranged = u.static || u.c.range !== 'melee' || (u.npc.abilities || []).length > 0;
  for (const e of foes) {
    if (!standing(e)) continue;
    if (S.spatial(u, e, 'melee')) return true;
    if (ranged && S.spatial(u, e, 'ranged')) return true;
  }
  return false;
}

/** A unit's stamina as 0–1: a colonist's is their rest; a monster's is its own meter. */
export function staminaOf(npc) {
  if (npc.needs) return npc.needs.rest;
  return npc.stamina == null ? 1 : npc.stamina / 100;
}
/** Every blow costs breath. */
function spendStamina(npc, amount) {
  if (npc.turretRec) return;
  if (npc.needs) npc.needs.rest = Math.max(0, npc.needs.rest - amount / 100);
  else npc.stamina = Math.max(0, (npc.stamina == null ? 100 : npc.stamina) - amount);
}

/** How many ticks until a unit's next turn. */
function interval(u) {
  let t = ROUND_TICKS;
  // Winded fighters swing slower; the spent barely swing at all.
  const st = u.static ? 1 : staminaOf(u.npc);
  if (st < 0.1) t += 4; else if (st < 0.25) t += 2;
  if (hasSt(u, 'haste')) t = 4;
  if (hasSt(u, 'slow')) t = 9;
  const ch = stGet(u, 'chill'); if (ch) t += ch.stacks;
  return t;
}

/**
 * One tick of combat on the map in scope: pick up anyone newly in reach of
 * something hostile, run the round clock, give every unit whose clock has
 * come round its turn, then settle the fallen.
 */
export function tickCombat(v) {
  const tick = v.tick, m = v._m;
  const hostiles = hostilesOn(v);
  if (!hostiles.length && (!v.field || !v.field.units.size)) return;
  const f = fieldOf(v), S = f.S;
  S.spatial = spatial(v);
  S.coverOf = coverOf(v);
  S.aoeFocus = (u, targets) => {
    if (targets.length < 2) return targets;
    let p = targets[0];
    for (const t of targets) if (cheb(u.npc, t.npc) < cheb(u.npc, p.npc)) p = t;
    return targets.filter(t => cheb(t.npc, p.npc) <= AOE_R);
  };

  // --- who is in it
  const friends = fightersOn(v);
  // Camp alarm: a wave in the camp gets everyone up and out, asleep or not.
  if (m.kind === 'camp' && v.root.waveActive && tick % 20 === 0) {
    const s = v.world.start;
    if (hostiles.some(h => Math.max(Math.abs(h.x - s.x), Math.abs(h.y - s.y)) <= 22)) {
      for (const c of friends) {
        if (c.hp < c.maxHp * 0.4 || (c.order && (c.order.travel || !c.order.work && !c.order.attack))) continue;
        if (c.peasant && c.task && c.task.night) continue;   // peasants sleep through the alarm unless it reaches them
        if (c.task && ['fight', 'travel', 'move'].includes(c.task.kind)) continue;
        c.task = null; c.path = null;
      }
    }
  }
  if (m.kind === 'camp') {
    const defBonus = v.bonuses.defence || 0;
    for (const rec of [...v.world.findBuildings('turret_ballista'), ...v.world.findBuildings('turret_arcane')]) {
      if (!rec.b.done) continue;
      const key = rec.x + ',' + rec.y;
      let t = f.turrets.get(key);
      if (!t || t.turretRec.b !== rec.b) { t = turretAsCombatant(rec, defBonus); f.turrets.set(key, t); }
      friends.push(t);
    }
  }
  // Beasts that already stand in the fight follow their bodies about.
  if (f.beasts) for (const [b, k] of f.beasts) {
    k.x = b.x; k.y = b.y;
    if (b.dead || !v.beasts.includes(b)) k.mapId = -1;
  }
  friends.push(...beastsIn(v, f));
  for (const h of hostiles) {
    for (const c of friends) {
      const d = Math.max(Math.abs(h.x - c.x), Math.abs(h.y - c.y));
      if (d > (c.turretRec ? TURRET_R : ENGAGE)) continue;
      if (!f.units.has(h)) join(v, f, h, 'foe', tick);
      if (!f.units.has(c)) join(v, f, c, 'party', tick);
    }
  }
  if (!f.units.size) return;
  if (!f.active) {
    f.active = true; f.startTick = tick; f.kills = 0;
    const where = m.kind === 'floor' ? `F${m.depth}: ` : '';
    v.log(`${where}Fighting breaks out — ${S.A.filter(u => !u.static).map(u => u.name).join(', ') || 'the turrets'} against ${S.B.length}.`, 'danger');
  }
  // Camp: fortifications and watchposts, re-read each round.
  if (tick >= f.nextRound) {
    if (m.kind === 'camp') {
      const watch = v.world.findBuildings('watchpost').length + v.world.findBuildings('watchtower').length * 1.5;
      S.ctx.partyDamageMult = 1.2 + campFortify(v.world) + (v.bonuses.combat || 0) + (v.bonuses.defence || 0) + watch * 0.08;
      S.ctx.tier = Math.max(1, Math.round((v.rift && v.rift.level) || 1));
    } else {
      S.ctx.partyDamageMult = 1.05 + (v.bonuses.combat || 0);
      S.ctx.tier = Math.max(1, (m.level || 1) + (m.depth || 1) - 1);
    }
    roundEnd(S);
    roundStart(S);
    f.nextRound = tick + ROUND_TICKS;
  }

  // --- turns
  const all = [...S.A, ...S.B];
  const hpBefore = new Map();
  for (const u of all) {
    if (!standing(u) || u.next > tick) continue;
    u.next = tick + interval(u);
    const mine = u.side === 'party' ? S.A : S.B, theirs = u.side === 'party' ? S.B : S.A;
    const allies = mine.filter(x => standing(x) && cheb(x.npc, u.npc) <= LOCAL_R);
    const foes = theirs.filter(x => standing(x) && cheb(x.npc, u.npc) <= LOCAL_R);
    // Rows from positions: anyone with an enemy at arm's length is in the front.
    for (const x of [...allies, ...foes]) {
      const opp = x.side === u.side ? foes : allies;
      x.row = opp.some(o => standing(o) && cheb(o.npc, x.npc) <= 1) ? 'front' : 'back';
    }
    if (!canReach(S, u, foes) && !u.charging) { upkeep(S, u); endTurn(u); continue; }
    const L = { ...S, A: u.side === 'party' ? allies : foes, B: u.side === 'party' ? foes : allies };
    hpBefore.clear();
    for (const x of [...allies, ...foes]) hpBefore.set(x, x.hp);
    const logFrom = S.log.length;
    takeTurn(L, u);
    legendaryBeat(L, u);
    spendStamina(u.npc, u.side === 'party' ? 0.5 : 1.2);
    S.log = L.log;
    // Anything the turn brought into being (summons, splits) joins the field.
    for (const [list, side] of [[L.A, 'party'], [L.B, 'foe']]) for (const x of list) {
      if (f.units.has(x.npc)) continue;
      placeNear(v, x.npc, u.npc);
      f.units.set(x.npc, x); x.next = tick + ROUND_TICKS; x.quiet = 0;
      (side === 'party' ? S.A : S.B).push(x);
      if (side === 'foe' && !v.raiders.includes(x.npc)) { x.npc.awake = true; x.npc.floorSpawn = m.kind === 'floor'; v.raiders.push(x.npc); }
    }
    // What the renderer shows: the swing (or the shot), and what it did.
    let tgt = null, most = 0;
    for (const [x, h0] of hpBefore) {
      const dh = h0 - x.hp;
      if (dh > 0) {
        fx(f, x.npc.x, x.npc.y, String(Math.round(dh)), x.side === 'party' ? '#ff7a6a' : '#ffffff');
        if (x.side !== u.side && dh > most) { most = dh; tgt = x; }
      } else if (dh < 0) fx(f, x.npc.x, x.npc.y, '+' + Math.round(-dh), '#7fe08a');
    }
    const said = S.log.slice(logFrom);
    const feed = m.fightLog || (m.fightLog = []);
    for (const l of said) if (l.text) feed.push({ text: l.text, side: l.side, t: l.t, tick });
    if (feed.length > 60) feed.splice(0, feed.length - 60);
    const missed = said.find(l => l.t === 'miss');
    if (!tgt && missed) {
      const near = foes.find(e => standing(e) && S.spatial(u, e, u.c.range === 'melee' ? 'melee' : 'ranged'));
      if (near) { tgt = near; fx(f, near.npc.x, near.npc.y, 'miss', '#b8c0cc', 'word'); }
    }
    const ab = said.find(l => l.ability && (l.t === 'ability' || l.t === 'debuff' || l.t === 'buff' || l.t === 'heal' || l.t === 'telegraph'));
    if (ab) fx(f, u.npc.x, u.npc.y - 0.4, ab.t === 'telegraph' ? '…' + (ab.text.match(/begins (.+?)…/) || [0, ''])[1] : (ab.text.match(/uses (.+?)(?: —| on|\.|$)/) || [0, ''])[1], '#e6c8ff', 'word');
    if (S.log.length > 300) S.log.splice(0, S.log.length - 100);   // only the recent past is ever read
    if (tgt) {
      const ranged = cheb(u.npc, tgt.npc) > 1;
      u.npc.fxAct = { seq: ++f.fxSeq, tx: tgt.npc.x, ty: tgt.npc.y, ranged, color: u.c.dmgElement || u.c.dmgType || (u.static ? 'pierce' : null) };
    }
  }

  // --- the fallen, the fled, and those the fight has moved away from
  const w = v.world;
  for (const u of [...S.A, ...S.B]) {
    const n = u.npc;
    if (!u.alive) { settleFallen(v, f, u); continue; }
    if (u.fled) { leave(f, u); if (u.side === 'foe') { n.fleeing = tick + 240; n.awake = false; } else if (n.beast) n.beast.shaken = tick + 120; else if (!n.turretRec) sendToSafety(v, n); continue; }
    // Live readouts for the map and the cards.
    if (n.turretRec) { n.turretRec.b.hp = Math.max(1, Math.round(u.hp)); n.hp = u.hp; }
    else n.hp = clamp(Math.round(u.hp), 0, n.maxHp);
    n.fxSt = u.st.filter(s => s.dur > 0 || s.dur >= 90).slice(0, 3).map(s => s.id);
    n.fxCharging = !!u.charging;
    const opp = u.side === 'party' ? S.B : S.A;
    const near = opp.some(o => standing(o) && cheb(o.npc, n) <= LEAVE_R);
    u.quiet = near ? 0 : u.quiet + 1;
    if (u.quiet > LEAVE_TICKS || (u.side === 'party' && !n.turretRec && (n.dead || (n.mapId || 0) !== m.id))) leave(f, u);
    if (u.side === 'foe' && (n.hp <= 0 || !v.raiders.includes(n))) leave(f, u);
  }
  // What the fight did to a beast shows on the beast.
  if (f.beasts) for (const [b, k] of f.beasts) {
    if (!b.dead && k.hp > 0) b.hp = Math.min(b.maxHp, k.hp);
    b.fxAct = k.fxAct; b.fxSt = k.fxSt; b.fxCharging = k.fxCharging;
    if (!f.units.has(k)) f.beasts.delete(b);
  }
  if (f.active && !f.units.size) {
    f.active = false;
    const where = m.kind === 'floor' ? `F${m.depth}: ` : '';
    v.log(`${where}The fighting dies down${f.kills ? ` — ${f.kills} enemies dead` : ''}.`, f.kills ? 'good' : 'info');
  }
  // A finished fight leaves nothing behind: the next one starts its own clock.
  if (!f.units.size) v.field = null;
  if (w && m.kind === 'floor' && !v.raiders.some(r => r.hp > 0 && !r.neutral) && !m.clearedMarked) {
    m.clearedMarked = true;
    const dv = v.root.delve;
    if (dv) dv.cleared++;
    v.log(`F${m.depth}: nothing hostile is left on this floor.`, 'good');
  }
}

/** A summoned or split unit needs somewhere to stand: beside whoever made it. */
function placeNear(v, npc, maker) {
  const w = v.world;
  for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = maker.x + dx, y = maker.y + dy;
    if (!w.inside(x, y) || !w.walkable(x, y)) continue;
    if (v.raiders.some(o => o.hp > 0 && o.x === x && o.y === y) || v.here.some(c => c.x === x && c.y === y)) continue;
    npc.x = x; npc.y = y; return;
  }
  npc.x = maker.x; npc.y = maker.y;
}

/** Hurt past bearing: off to safety — the stairs up on a floor, the middle of camp at home. */
export function sendToSafety(v, c) {
  const m = v._m;
  if (m.kind === 'floor' && v.world.stairsUp) c.order = { x: v.world.stairsUp.x, y: v.world.stairsUp.y, travel: 'up', recall: true };
  else c.order = { x: v.world.start.x, y: v.world.start.y };
  c.task = null; c.path = null;
}

/** Someone went down. A monster dies where it stands; a colonist might live. */
function settleFallen(v, f, u) {
  const n = u.npc, m = v._m, rng = f.S.rng;
  leave(f, u);
  if (n.turretRec) {
    const rec = n.turretRec, def = BUILDINGS[rec.b.id];
    v.world.building[v.world.idx(rec.x, rec.y)] = { id: rec.b.id, done: false, workLeft: Math.round(def.work * 0.4), hp: def.hp, growth: 0, progress: 0, reservedBy: 0 };
    v.world.touch(); v.jobsDirty = true;
    f.turrets.delete(rec.x + ',' + rec.y);
    v.log(`The ${def.name} is smashed to pieces.`, 'danger');
    return;
  }
  if (u.side === 'foe') {
    n.hp = 0;
    f.kills++;
    if (n.monster) {
      const d = rollMonsterDrops(rng, n, n.tier || 1);
      // Deeper floors, richer bodies.
      if (m.kind === 'floor' && m.depth > 1) for (const k in d.resources) d.resources[k] = Math.round(d.resources[k] * (1 + 0.4 * (m.depth - 1)));
      dropItems(v, n.x, n.y, d.resources);
      for (const [k, q] of Object.entries(d.reagents)) v.reagents[k] = (v.reagents[k] || 0) + q;
      for (const [k, q] of Object.entries(d.trophies)) v.trophies[k] = (v.trophies[k] || 0) + q;
      v.armory.push(...d.items);
    } else {
      if (n.equipment && n.equipment.weapon && rng.chance(0.3)) v.armory.push(n.equipment.weapon);
      if (n.equipment && n.equipment.armor && rng.chance(0.25)) v.armory.push(n.equipment.armor);
      dropItems(v, n.x, n.y, { gold: rng.int(1, 4 + (n.level || 1)) });
    }
    // A robbed merchant's stock is the party's now.
    if (n.merchant && n.stock) { v.armory.push(...(n.stock.items || [])); for (const [id, q] of Object.entries(n.stock.potions || {})) if (q > 0) v.givePotion(id, q); n.stock = null; }
    fx(f, n.x, n.y, '✖', '#ff5a4a', 'word');
    // Everyone of ours close by shares what it was worth.
    const near = f.S.A.filter(a => standing(a) && !a.static && !a.npc.beast && cheb(a.npc, n) <= LOCAL_R);
    const share = Math.round(killXp(n) / Math.max(1, near.length));
    for (const a of near) { awardXp(v, a.npc, 5 + share); if (a.c.stat) gainXp(v, a.npc, a.c.stat, 12); }
    const dv = v.root.delve;
    if (dv && m.kind === 'floor') dv.kills++;
    if (n.boss || n.lairBoss) v.log(`${m.kind === 'floor' ? `F${m.depth}: ` : ''}${n.name.full} falls!`, 'major');
    if (n.lairBoss) { m.lairCleared = true; v.stats.cleared++; if (dv) dv.lair = true; if (v.onLairBroken) v.onLairBroken(n); }
    v.raiders = v.raiders.filter(r => r !== n);
    return;
  }
  // A beast: knocked flat more often than not, and up again later.
  if (n.beast) {
    const b = n.beast, A = ANIMALS[b.species], where = m.kind === 'floor' ? `F${m.depth}: ` : '';
    if (f.beasts) f.beasts.delete(b);
    b.fxSt = null; b.fxCharging = false;
    if (rng.chance(0.55)) {
      b.hp = 1; b.downed = { until: v.tick + DOWNED_TICKS }; b.path = null;
      fx(f, b.x, b.y, 'down', '#ff7a6a', 'word');
      v.log(`${where}${b.name} the ${A.name} goes down.`, 'warn');
    } else {
      b.dead = true; b.hp = 0;
      v.log(`${where}${b.name} the ${A.name} is killed.`, 'danger');
    }
    return;
  }
  // One of ours.
  const infirmary = m.kind === 'camp' && v.world.findBuildings('infirmary').length ? 0.12 : 0;
  if (rng.chance(0.7 + infirmary)) {
    n.hp = 1;
    n.downed = { until: v.tick + DOWNED_TICKS };
    n.task = null; n.path = null; n.order = null; n.state = 'downed';
    n.injuries.push({ ...rng.pick([{ id: 'fracture', name: 'Fracture', sev: 3, heal: 5200, mods: { move: -0.3, work: -0.25 } }, { id: 'cut', name: 'Deep Cut', sev: 2, heal: 2200, mods: { work: -0.1 } }]), left: 3000, treated: false });
    fx(f, n.x, n.y, 'down', '#ff7a6a', 'word');
    v.log(`${m.kind === 'floor' ? `F${m.depth}: ` : ''}${n.name.short} goes down.`, 'danger', n.id);
  } else {
    killColonist(v, n, m.kind === 'floor' ? `killed on floor ${m.depth} of the Rift` : 'killed defending the camp');
  }
}

/** Downed colonists lie still, then get back up with one hit point and a wound. */
export function tickDowned(game, c) {
  if (!c.downed) return false;
  if (game.tick >= c.downed.until) { c.downed = null; c.state = 'idle'; return false; }
  c.state = 'downed'; c.task = null;
  return true;
}

/** One step of a hostile along a path to (tx, ty), re-planned as the target moves. */
export function huntStep(v, r, tx, ty, adjacent) {
  const goal = `${tx},${ty}`;
  if (!r.path || r.pathGoal !== goal || r.pathIdx >= r.path.length || (v.tick + (r.id || 0)) % 30 === 0) {
    r.path = findPath(v.world, r.x, r.y, tx, ty, adjacent, 2500, v.occ);
    r.pathIdx = 0; r.pathGoal = goal;
    if (!r.path) return false;
  }
  const next = r.path[r.pathIdx];
  if (!next) return false;
  if (occupyMove(v, r, next[0], next[1])) { r.pathIdx++; return true; }
  r.path = null;
  return false;
}

/** Is `h` close enough to hit `t` from where it stands, by its own weapon? */
export function inStrike(v, h, t) {
  const d = Math.max(Math.abs(h.x - t.x), Math.abs(h.y - t.y));
  if (d <= 1) return true;
  const ranged = h.combat && h.combat.range && h.combat.range !== 'melee';
  return !!ranged && d <= RANGED_R - 1 && lineOfSight(v.world, h.x, h.y, t.x, t.y);
}

/** Everything on this map that's fighting — for the UI. */
export function inFight(v, npc) { return !!(v.field && v.field.units.has(npc)); }
