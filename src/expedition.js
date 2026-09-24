// ============================================================================
// PARTY HELPERS: what's left of the old auto-resolved delve now that the Rift
// is played on real floors (floors.js). Stances, class XP, the potion belt,
// and the power readouts the UI and autoplay compare parties with.
// ============================================================================
import { ROOM_TRAITS } from './biomes.js';
import { gainLevelXp, autoAllocate } from './classes.js';
import { powerOf, refresh } from './npc.js';

export const STANCES = {
  cautious: { name: 'Cautious', retreatAt: 0.62, lootMult: 0.85, riskMult: 0.7 },
  balanced: { name: 'Balanced', retreatAt: 0.40, lootMult: 1.00, riskMult: 1.0 },
  reckless: { name: 'Reckless', retreatAt: 0.18, lootMult: 1.25, riskMult: 1.4 },
};

// Combat itself lives in combat.js; re-exported here for older callers.
export { simulateCombat } from './combat.js';

/** Two flasks on a belt; a bandolier charm makes three. */
export function beltSize(npc) { return npc.combat && (npc.combat.passives || []).includes('bandolier') ? 3 : 2; }

/**
 * Class XP. Levels grant skill points; when the camp is on autopilot (or for
 * anyone not under the player's hand) they are spent at once.
 */
export function awardXp(game, npc, xp) {
  const gained = gainLevelXp(npc, Math.round(xp * (game.xpRate || 1)));
  if (!gained) return 0;
  if (game.autoSkills) autoAllocate(npc, game.rng.fork('lvl' + npc.id + ':' + npc.level));
  refresh(npc);
  game.log(`${npc.name.short} is now level ${npc.level}${npc.tree && !game.autoSkills ? ' — a skill point to spend' : ''}.`, 'good', npc.id);
  return gained;
}

/** The fight rules a room imposes: its trait, and the biome's environment. */
export function roomContext(dungeon, room) {
  const env = { ...(dungeon.env || {}) };
  const T = ROOM_TRAITS[room.trait] || {};
  if (T.dark) env.dark = true;
  if (room.kind !== 'lair') delete env.lairAction;
  return { env, frontSlots: T.frontSlots || 3, cover: !!T.cover };
}

// Party power readout for the UI and for offer difficulty colouring.
export function partyPower(members) {
  return members.reduce((s, m) => s + powerOf(m), 0);
}
export function dungeonPower(dungeon) {
  let worst = 0;
  for (const r of dungeon.rooms) {
    if (!r.encounter) continue;
    const e = r.encounter;
    const est = e.size * (10 + e.tier * 7) * (e.boss ? 1.5 : 1);
    worst = Math.max(worst, est);
  }
  return Math.round(worst);
}
