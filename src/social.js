// ============================================================================
// SOCIAL LAYER: opinions, relationships, conversations, rivalries, romance.
// Relationships feed mood, mood feeds work and the hostility meter.
// ============================================================================
import { clamp } from './rng.js';
import { REL_KINDS, TRAITS, mod } from './data.js';
import { traitMod, shiftHostility } from './npc.js';
import { addThought } from './colony.js';

export function relKind(v) {
  let k = REL_KINDS[0];
  for (const r of REL_KINDS) if (v >= r.min) k = r;
  return k;
}

export function getRel(a, b) {
  if (!a.relations[b.id]) a.relations[b.id] = { value: 0, n: 0, romance: 0, kind: 'neutral' };
  return a.relations[b.id];
}

// Compatibility from traits, ancestry and charisma — the seed of every opinion.
export function compatibility(a, b) {
  let c = 0;
  c += mod(a.attributes.cha) * 1.5 + mod(b.attributes.cha) * 1.5;
  c += traitMod(a, 'social') * 12 + traitMod(b, 'social') * 12;
  const shared = a.traits.filter(t => b.traits.includes(t)).length;
  c += shared * 6;
  for (const t of a.traits) {
    const conf = TRAITS[t].conflicts || [];
    for (const u of b.traits) if (conf.includes(u)) c -= 9;
  }
  if (a.race === b.race) c += 4;
  if (a.faction !== b.faction) c -= 6;
  c -= Math.abs(a.hostility - b.hostility) * 0.12;
  return c;
}

export function interact(game, a, b) {
  const ra = getRel(a, b), rb = getRel(b, a);
  const rng = game.rng;
  const base = compatibility(a, b);
  const moodFactor = ((a.mood - 50) + (b.mood - 50)) * 0.12;
  const roll = rng.gauss(0, 12) + base + moodFactor;
  const delta = clamp(roll * 0.28, -22, 22);
  ra.value = clamp(ra.value + delta, -100, 100);
  rb.value = clamp(rb.value + delta * rng.float(0.7, 1.15), -100, 100);
  ra.n++; rb.n++;
  ra.kind = relKind(ra.value).id; rb.kind = relKind(rb.value).id;

  if (delta > 6) { addThought(a, 'good_chat'); addThought(b, 'good_chat'); a.needs.joy = clamp(a.needs.joy + 0.08, 0, 1); b.needs.joy = clamp(b.needs.joy + 0.08, 0, 1); }
  else if (delta < -6) {
    addThought(a, 'bad_chat'); addThought(b, 'bad_chat');
    shiftHostility(a, 1.5, `argument with ${b.name.short}`);
    shiftHostility(b, 1.5, `argument with ${a.name.short}`);
  }

  // Brawls: hostile, angry, brawler-flavoured people escalate.
  const brawlChance = clamp((-ra.value / 500) + (a.hostility + b.hostility) / 1600
    + (a.traits.includes('brawler') ? 0.03 : 0) + (b.traits.includes('brawler') ? 0.03 : 0)
    - (a.traits.includes('gentle') || b.traits.includes('gentle') ? 0.04 : 0), 0, 0.14);
  if (ra.value < -35 && rng.chance(brawlChance)) {
    const dmg = rng.int(2, 8);
    a.hp = Math.max(1, a.hp - dmg); b.hp = Math.max(1, b.hp - dmg);
    addThought(a, 'brawl'); addThought(b, 'brawl');
    ra.value -= 12; rb.value -= 12;
    shiftHostility(a, 5, 'brawl'); shiftHostility(b, 5, 'brawl');
    game.log(`${a.name.short} and ${b.name.short} came to blows.`, 'warn', a.id);
    return 'brawl';
  }

  // Romance: needs high opinion, mutual, and compatible temperament.
  if (ra.value > 62 && rb.value > 62 && !a.partner && !b.partner && rng.chance(0.05)) {
    ra.romance = rb.romance = 1;
    a.partner = b.id; b.partner = a.id;
    addThought(a, 'romance'); addThought(b, 'romance');
    shiftHostility(a, -6, `bonded with ${b.name.short}`);
    shiftHostility(b, -6, `bonded with ${a.name.short}`);
    game.log(`${a.name.short} and ${b.name.short} are now together.`, 'good', a.id);
    return 'romance';
  }
  if (a.partner === b.id && ra.value < -20 && rng.chance(0.15)) {
    a.partner = null; b.partner = null; ra.romance = rb.romance = 0;
    addThought(a, 'heartbreak'); addThought(b, 'heartbreak');
    game.log(`${a.name.short} and ${b.name.short} have split.`, 'warn', a.id);
    return 'breakup';
  }
  return delta > 6 ? 'good' : delta < -6 ? 'bad' : 'neutral';
}

// Ambient socialising: nearby colonists occasionally talk without a task.
export function tickSocial(game) {
  if (game.tick % 40 !== 0) return;
  const pool = game.here.filter(c => !c.away && !c.dead);
  for (const a of pool) {
    if (a.state === 'sleeping') continue;
    if (!game.rng.chance(0.09)) continue;
    let best = null, bd = 6;
    for (const b of pool) {
      if (b === a || b.state === 'sleeping') continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) interact(game, a, best);
  }
}

// Resolve an explicit socialize task target.
export function resolveSocializeTask(game, npc, targetId) {
  const other = game.colonists.find(c => c.id === targetId);
  if (!other || other.dead || other.away) return;
  interact(game, npc, other);
  npc.needs.joy = clamp(npc.needs.joy + 0.2, 0, 1);
}

// Party cohesion: average pairwise opinion. Drives expedition combat bonuses.
export function cohesion(members) {
  if (members.length < 2) return 0;
  let sum = 0, n = 0;
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++) {
      const r = members[i].relations[members[j].id];
      sum += r ? r.value : 0; n++;
    }
  return n ? sum / n : 0;
}
