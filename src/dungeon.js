// ============================================================================
// DUNGEON GENERATION
// Every delve is a fresh graph of rooms with a theme, a garrison drawn from the
// universal NPC generator, traps, treasure and a lair. Depth tiers gate reward
// and danger so that progression paces itself across runs.
// ============================================================================
import { RNG, clamp } from './rng.js';
import { DUNGEON_THEMES, THEME_IDS, RESOURCES, FACTIONS } from './data.js';
import { generateNPC, generateGroup, powerOf } from './npc.js';
import { generateLoot } from './items.js';
import { buildEncounter, ENCOUNTERS, tierRank } from './monsters.js';
import { BIOMES_RIFT, THEME_BIOME, ROOM_LAYOUTS, rollBiome, layoutFor } from './biomes.js';

const PREFIX = ['Sunken', 'Hollow', 'Black', 'Weeping', 'Broken', 'Old', 'Drowned', 'Rattling', 'Ashen', 'Gilded', 'Silent', 'Thousand'];
const NOUN = ['Vaults', 'Halls', 'Warren', 'Stair', 'Reliquary', 'Cistern', 'Barrow', 'Deep', 'Gallery', 'Kiln', 'Choir', 'Shelf'];

/** The Rift goes twenty levels deep; SSS monsters live past tier 14. */
export const MAX_DEPTH = 20;

export function dungeonName(rng, theme) {
  return `${rng.pick(PREFIX)} ${rng.pick(NOUN)}`;
}

export function generateDungeon(seed, { tier = 1, themeId = null, biome = null, rng: outer = null } = {}) {
  const rng = outer || new RNG(seed);
  const depth = clamp(tier, 1, MAX_DEPTH);
  // A biome decides everything; the old themes map onto biomes.
  const biomeId = biome || (themeId && THEME_BIOME[themeId]) || rollBiome(rng, tierRank(depth)).id;
  const B = BIOMES_RIFT[biomeId];
  const legacy = themeId && DUNGEON_THEMES[themeId];
  const themeDef = {
    name: B.name, color: B.color, desc: B.desc, hazard: biomeId,
    factions: B.npcFactions && B.npcFactions.length ? B.npcFactions : (legacy ? legacy.factions : ['wild']),
    loot: B.loot,
  };
  const roomCount = clamp(4 + Math.round(depth * 1.3) + rng.int(-1, 2), 4, 22);
  const rooms = buildLayout(rng, B.layout, roomCount);
  for (const room of rooms) room.name = roomName(rng, room.kind, themeDef);

  // Populate rooms.
  const kindWeights = Object.entries(B.rooms);
  for (const room of rooms) {
    if (room.kind !== 'entry' && room.kind !== 'lair') {
      room.kind = rng.weighted(kindWeights);
      room.name = roomName(rng, room.kind, themeDef);
    }
    room.encounter = null; room.loot = null; room.trap = null; room.structures = [];
    const distance = graphDistance(rooms, 0, room.id);
    const localTier = clamp(depth + Math.floor(distance / 3) - 1, 0, MAX_DEPTH);
    const faction = rng.pick(themeDef.factions);
    switch (room.kind) {
      case 'fight': {
        const size = clamp(1 + Math.round(depth * 0.32) + rng.int(0, 1), 1, 5);
        room.encounter = rollGarrison(rng, biomeId, faction, localTier, size, false);
        break;
      }
      case 'lair': {
        const lairSize = clamp(1 + Math.round(depth * 0.38), 2, 5);
        room.encounter = rollGarrison(rng, biomeId, faction, localTier + 1, lairSize, true, B.lairTemplate);
        room.loot = rollLoot(rng, themeDef, localTier + 2, 2.4);
        if (biomeId === 'dragons_lair') room.structures.push({ type: 'hoard' });
        break;
      }
      case 'treasure': room.loot = rollLoot(rng, themeDef, localTier, 1.5); room.locked = rng.chance(0.4); room.structures.push({ type: 'chest', mimic: rng.chance(0.08) }); break;
      case 'vault': {
        const n = rng.int(2, 3);
        for (let k = 0; k < n; k++) room.structures.push({ type: rng.pick(B.structures), mimic: rng.chance(0.06) });
        if (rng.chance(0.5)) room.encounter = rollGarrison(rng, biomeId, faction, localTier, clamp(1 + Math.round(depth * 0.2), 1, 3), false);
        break;
      }
      case 'node': {
        const [name, res, skill] = rng.pick(B.nodes);
        room.node = { name, res, skill, wander: B.env && B.env.spores ? 0.05 : 0 };
        if (rng.chance(0.45)) room.encounter = rollGarrison(rng, biomeId, faction, localTier, clamp(1 + Math.round(depth * 0.2), 1, 3), false);
        break;
      }
      case 'prison': room.structures.push({ type: B.structures.includes('cocoon') ? 'cocoon' : 'cage' }); if (rng.chance(0.6)) room.encounter = rollGarrison(rng, biomeId, faction, localTier, clamp(1 + Math.round(depth * 0.25), 1, 3), false); break;
      case 'nest': room.structures.push({ type: 'nest' }); if (rng.chance(0.7)) room.encounter = rollGarrison(rng, biomeId, faction, localTier, clamp(1 + Math.round(depth * 0.25), 1, 3), false); break;
      case 'trap': room.trap = rollTrap(rng, themeDef, localTier); break;
      case 'shrine': room.shrine = rng.pick(['heal', 'bless', 'curse', 'insight']); if (B.structures.includes('altar') && rng.chance(0.5)) room.structures.push({ type: 'altar' }); break;
      case 'puzzle': room.puzzle = { dc: 9 + localTier, skill: rng.pick(['research', 'arcana', 'stealth', 'social']), reward: rollLoot(rng, themeDef, localTier, 1.0) }; break;
      case 'rest': room.rest = true; break;
      default: if (rng.chance(0.3)) room.loot = rollLoot(rng, themeDef, localTier, 0.5);
    }
    if (room.kind !== 'entry' && !room.trap && rng.chance(0.18)) room.trap = rollTrap(rng, themeDef, localTier);
    room.layout = layoutFor(rng, room.kind, biomeId);
    room.trait = ROOM_LAYOUTS[room.layout].trait;
  }
  // A lich keeps its life somewhere else. Find it first, or it gets back up.
  const lair = rooms.find(r => r.kind === 'lair');
  if (lair && lair.encounter && lair.encounter.template === 'lich_sanctum') {
    const hide = rng.pick(rooms.filter(r => r.kind !== 'lair' && r.kind !== 'entry')) || rooms[0];
    hide.structures.push({ type: 'phylactery' });
    hide.name = 'Hidden Reliquary';
  }

  const dungeon = {
    seed: typeof seed === 'string' ? seed : String(seed),
    id: 'd' + (rng.int(100000, 999999)),
    name: dungeonName(rng, biomeId),
    theme: biomeId, themeName: B.name, color: B.color, blurb: B.desc, icon: B.icon,
    biome: biomeId, rule: B.rule, env: { ...(B.env || {}) }, loot: B.loot, ritual: !!B.ritual,
    tier: depth, rooms, roomCount,
    hazard: biomeId,
    cleared: false, explored: 0,
  };
  dungeon.danger = estimateDanger(dungeon);
  dungeon.rewardHint = estimateReward(dungeon);
  return dungeon;
}

/**
 * Lay out a room graph in one of the biome styles. Every room gets a map
 * position (for the Rift map) and links; room 0 is the entry, the last the lair.
 */
export function buildLayout(rng, style, n) {
  const rooms = [];
  const mk = (x, y) => { const r = { id: rooms.length, kind: 'empty', x, y, links: [], cleared: false, visited: false }; rooms.push(r); return r; };
  const link = (a, b, extra) => { if (a === b || rooms[a].links.includes(b)) return; rooms[a].links.push(b); rooms[b].links.push(a); if (extra) (rooms[a].flooded || (rooms[a].flooded = [])).push(b); };
  switch (style) {
    case 'spine': {
      // A long processional; side niches hang off it.
      const main = Math.max(3, Math.ceil(n * 0.6));
      for (let i = 0; i < main; i++) { mk(i * 3, 3); if (i) link(i - 1, i); }
      while (rooms.length < n) { const at = rng.int(1, main - 2); const side = rng.chance(0.5) ? 0 : 6; mk(at * 3 + rng.int(-1, 1), side); link(at, rooms.length - 1); }
      return finish(rooms, main - 1);
    }
    case 'hub': {
      mk(6, 6);
      const spokes = clamp(Math.round(n / 3), 3, 6);
      let made = 1, s = 0;
      const tips = [];
      while (made < n) {
        const ang = (s % spokes) / spokes * Math.PI * 2 + 0.3;
        const len = Math.floor(s / spokes) + 1;
        const prev = len === 1 ? 0 : tips[s % spokes];
        mk(6 + Math.round(Math.cos(ang) * len * 3), 6 + Math.round(Math.sin(ang) * len * 3));
        link(prev, rooms.length - 1);
        tips[s % spokes] = rooms.length - 1;
        made++; s++;
      }
      return finish(rooms, farthest(rooms, 0));
    }
    case 'islands': {
      for (let i = 0; i < n; i++) { mk(i * 3, 3 + (i % 2 ? rng.int(1, 3) : rng.int(-3, -1))); if (i) link(i - 1, i, rng.chance(0.6)); }
      for (let k = 0; k < Math.floor(n / 5); k++) { const a = rng.int(0, n - 3); link(a, a + 2, true); }
      return finish(rooms, n - 1);
    }
    case 'shafts': {
      const levels = 3, per = Math.ceil(n / levels);
      for (let l = 0; l < levels; l++) for (let i = 0; i < per && rooms.length < n; i++) {
        const r = mk(i * 3 + (l % 2) * 1, l * 4);
        if (i) link(r.id - 1, r.id);
        else if (l) link(rooms.findIndex(x => x.y === (l - 1) * 4 && x.x === Math.max(...rooms.filter(z => z.y === (l - 1) * 4).map(z => z.x))), r.id);
      }
      return finish(rooms, rooms.length - 1);
    }
    case 'rings': {
      const outer = Math.ceil(n * 0.6), inner = n - outer;
      for (let i = 0; i < outer; i++) { const a = i / outer * Math.PI * 2; mk(8 + Math.round(Math.cos(a) * 7), 6 + Math.round(Math.sin(a) * 5)); if (i) link(i - 1, i); }
      link(outer - 1, 0);
      for (let i = 0; i < inner; i++) { const a = i / Math.max(1, inner) * Math.PI * 2; mk(8 + Math.round(Math.cos(a) * 3), 6 + Math.round(Math.sin(a) * 2)); link(outer + i, rng.int(0, outer - 1)); if (i) link(outer + i - 1, outer + i); }
      return finish(rooms, rooms.length - 1);
    }
    case 'gated': case 'gauntlet': case 'fortress': case 'circle': case 'chain': {
      // Linear spines with a style of their own: gauntlets are straight,
      // fortresses fan into yards, circles close into a loop, chains wander.
      const yards = style === 'fortress';
      for (let i = 0; i < n; i++) {
        const y = style === 'gauntlet' ? 3 : style === 'circle' ? 3 + Math.round(Math.sin(i / n * Math.PI * 2) * 3) : 3 + rng.int(-2, 2);
        const x = style === 'circle' ? 8 + Math.round(Math.cos(i / n * Math.PI * 2) * 8) : i * 3;
        mk(x, yards && i > 0 && i < n - 1 ? y + (i % 2 ? -2 : 2) : y);
        if (i) link(yards && i > 1 && i < n - 1 && i % 2 === 0 ? i - 2 : i - 1, i);
      }
      if (style === 'circle') link(n - 1, 0);
      if (style === 'chain' || style === 'gated') for (let k = 0; k < Math.floor(n / 5); k++) { const a = rng.int(0, n - 4); link(a, a + rng.int(2, 3)); }
      if (yards) for (let i = 1; i < n - 1; i++) if (!rooms[i].links.includes(n - 1) && i >= n - 3) link(i, n - 1);
      return finish(rooms, n - 1);
    }
    default: {
      // warren: a grid scatter, a spanning tree, then plenty of loops.
      const cols = Math.ceil(Math.sqrt(n * 1.4));
      const cells = [];
      for (let i = 0; i < n; i++) cells.push({ cx: i % cols, cy: Math.floor(i / cols) });
      rng.shuffle(cells);
      for (let i = 0; i < n; i++) mk(cells[i].cx * 3 + rng.int(0, 1), cells[i].cy * 3 + rng.int(0, 1));
      const connected = [0], remaining = rooms.slice(1).map(r => r.id);
      while (remaining.length) {
        let bi = 0, bj = 0, bd = Infinity;
        for (const a of connected) for (let k = 0; k < remaining.length; k++) {
          const d = Math.hypot(rooms[a].x - rooms[remaining[k]].x, rooms[a].y - rooms[remaining[k]].y);
          if (d < bd) { bd = d; bi = a; bj = k; }
        }
        const b2 = remaining.splice(bj, 1)[0];
        link(bi, b2); connected.push(b2);
      }
      const loops = style === 'warren' ? Math.max(1, Math.floor(n / 3)) : rng.int(0, Math.max(1, Math.floor(n / 4)));
      for (let k = 0; k < loops; k++) { const a = rng.int(0, n - 1), b2 = rng.int(0, n - 1); if (Math.hypot(rooms[a].x - rooms[b2].x, rooms[a].y - rooms[b2].y) < 6) link(a, b2); }
      return finish(rooms, farthest(rooms, 0));
    }
  }
}
function farthest(rooms, from) {
  let best = from, bd = -1;
  for (const r of rooms) { const d = graphDistance(rooms, from, r.id); if (d < 99 && d > bd) { bd = d; best = r.id; } }
  return best;
}
/** Mark the entry and the lair, and make sure the lair is the last room id. */
function finish(rooms, lairId) {
  rooms[0].kind = 'entry';
  const last = rooms.length - 1;
  if (lairId !== last) {
    // Swap ids so the lair is last: route-building relies on it.
    const a = rooms[lairId], b = rooms[last];
    const remap = (id) => id === lairId ? last : id === last ? lairId : id;
    for (const r of rooms) { r.links = r.links.map(remap); if (r.flooded) r.flooded = r.flooded.map(remap); }
    rooms[lairId] = b; rooms[last] = a; b.id = lairId; a.id = last;
  }
  rooms[last].kind = 'lair';
  return rooms;
}

function roomName(rng, kind, theme) {
  const byKind = {
    entry: ['Threshold', 'Broken Gate', 'Antechamber', 'Stairhead'],
    fight: ['Pillared Hall', 'Flooded Row', 'Guard Post', 'Bone Gallery', 'Collapsed Span', 'Long Gallery'],
    trap: ['Narrow Walk', 'Pressure Floor', 'Needle Corridor', 'Thin Bridge'],
    treasure: ['Strongroom', 'Cache', 'Sealed Niche', 'Hoard Pit'],
    shrine: ['Old Altar', 'Cracked Font', 'Idol Room'],
    puzzle: ['Mechanism Room', 'Locked Orrery', 'Riddle Door'],
    rest: ['Dry Alcove', 'Quiet Cell', 'Abandoned Camp'],
    lair: ['The Deep Seat', 'Throne of Bone', 'The Last Room', 'Nest'],
    empty: ['Empty Chamber', 'Dust Hall', 'Rubble Room', 'Silent Walk'],
    node: ['Rich Seam', 'Overgrown Gallery', 'Glittering Grotto', 'Harvest Hall'],
    vault: ['Burial Vault', 'Hoard Chamber', 'Locked Archive', 'Treasury'],
    prison: ['Holding Pens', 'Larder', 'Cells', 'Web Gallery'],
    nest: ['Nesting Hall', 'Brood Chamber', 'Roost'],
  };
  return rng.pick(byKind[kind] || byKind.empty);
}

// Factions that are really monster families; the rest are classed NPCs.
const MONSTER_FACTIONS = new Set(['wild', 'dead']);

/**
 * A room's garrison: a monster template from the biome's list (most of the
 * time), or a classed NPC band for biomes that are someone's stronghold.
 */
export function rollGarrison(rng, biomeId, faction, tier, size, boss, forceTemplate = null) {
  const B = BIOMES_RIFT[biomeId] || BIOMES_RIFT[THEME_BIOME[biomeId]] || BIOMES_RIFT.goblin_warrens;
  const npc = !forceTemplate && B.npcFactions && rng.chance(B.npcShare || 0);
  if (!npc) {
    const generated = buildEncounter(rng, { tier, size, boss, templates: forceTemplate ? [forceTemplate] : B.templates, affix: B.affix });
    const T = ENCOUNTERS[generated.template];
    return { faction, tier, size: generated.length, bossChance: boss ? 1 : 0, boss: !!boss, monster: true,
      template: generated.template, templateName: T.name, twist: T.twist, answer: T.answer, generated };
  }
  const fac = rng.pick(B.npcFactions);
  const generated = generateGroup(rng, { faction: fac, tier, size, bossChance: boss ? 1 : 0.08 });
  return { faction: fac, tier, size, bossChance: boss ? 1 : 0.08, boss: !!boss, generated };
}

export function graphDistance(rooms, from, to) {
  const dist = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    if (c === to) return dist.get(c);
    for (const n of rooms[c].links) if (!dist.has(n)) { dist.set(n, dist.get(c) + 1); q.push(n); }
  }
  return dist.get(to) ?? 99;
}

const TRAPS = [
  { id: 'dart',    name: 'Dart Line',      dmg: [3, 9],   save: 'dex', inj: 'cut' },
  { id: 'pit',     name: 'Spiked Pit',     dmg: [5, 14],  save: 'dex', inj: 'fracture' },
  { id: 'gas',     name: 'Rot Gas',        dmg: [2, 7],   save: 'con', inj: 'plague', party: true },
  { id: 'flame',   name: 'Flame Jet',      dmg: [6, 16],  save: 'dex', inj: 'burn' },
  { id: 'ward',    name: 'Ward Discharge', dmg: [4, 12],  save: 'wis', inj: 'curse', party: true },
  { id: 'collapse',name: 'Ceiling Fall',   dmg: [7, 18],  save: 'dex', inj: 'fracture', party: true },
];
export function rollTrap(rng, theme, tier) {
  const t = rng.pick(TRAPS);
  return { ...t, dc: 9 + Math.round(tier * 0.9), tier, dmg: [t.dmg[0] + tier, t.dmg[1] + tier * 2], disarmed: false, sprung: false };
}

export function rollLoot(rng, theme, tier, scale = 1) {
  const out = { resources: {}, items: [] };
  const weights = Object.entries(theme.loot);
  const picks = 1 + rng.int(0, 2) + Math.floor(tier / 4);
  for (let i = 0; i < picks; i++) {
    const res = rng.weighted(weights.map(([k, v]) => [k, v]));
    const qty = Math.max(1, Math.round((3 + tier * 2.2) * scale * rng.float(0.6, 1.5)));
    out.resources[res] = (out.resources[res] || 0) + qty;
  }
  // Baseline gold everywhere so a run always pays something.
  out.resources.gold = (out.resources.gold || 0) + Math.round((4 + tier * 3) * scale * rng.float(0.5, 1.4));
  if (rng.chance(0.26 * scale)) out.items.push(generateLoot(rng, tier));
  if (rng.chance(0.22 * scale)) out.items.push(generateLoot(rng, tier, scale >= 2 ? 1 : 0));
  return out;
}

export function materializeEncounter(dungeon, room, rng) {
  if (!room.encounter) return [];
  if (room.encounter.generated) return room.encounter.generated;
  const e = room.encounter;
  const foes = e.monster ? buildEncounter(rng, { tier: e.tier, size: e.size, boss: e.boss, template: e.template })
    : generateGroup(rng, { faction: e.faction, tier: e.tier, size: e.size, bossChance: e.bossChance });
  e.generated = foes;
  return foes;
}

// Danger is measured in exactly the same units as partyPower(), so the UI and
// the AI can compare a party against a dungeon directly instead of guessing.
export function estimateDanger(dungeon) {
  let hardest = 0, total = 0;
  for (const r of dungeon.rooms) {
    const foes = r.encounter && r.encounter.generated;
    if (!foes) continue;
    const p = foes.reduce((s, f) => s + powerOf(f), 0);
    total += p;
    if (p > hardest) hardest = p;
  }
  dungeon.totalDanger = Math.round(total);
  dungeon.fights = dungeon.rooms.filter(r => r.encounter).length;
  return Math.round(hardest);
}
export function estimateReward(dungeon) {
  let v = 0;
  for (const r of dungeon.rooms) {
    if (r.loot) for (const k in r.loot.resources) v += r.loot.resources[k] * (RESOURCES[k]?.cat === 'wealth' ? 2 : RESOURCES[k]?.cat === 'arcane' ? 3 : 1);
    if (r.loot) v += r.loot.items.length * 25;
  }
  return Math.round(v);
}

// Offers refresh over time; each is a distinct generated dungeon.
// The offer board is calibrated against the party the player can actually
// field, not an abstract colony tier: each slot searches for the dungeon tier
// whose hardest room lands near a target fraction of party power. That keeps
// every board readable — one safe run, one fair run, one stretch run.
const OFFER_TARGETS = [0.35, 0.58, 0.88, 1.25];
export function generateOffers(rng, partyPower, count = 3, maxDepthBonus = 0) {
  const offers = [];
  const power = Math.max(30, partyPower || 30);
  for (let i = 0; i < count; i++) {
    const target = power * (OFFER_TARGETS[i] ?? 0.9) * (i === count - 1 ? 1 + maxDepthBonus * 0.12 : 1);
    let best = null, bestErr = Infinity;
    for (let tier = 1; tier <= 14; tier++) {
      const d = generateDungeon(rng.int(1, 1e9), { tier, rng: rng.fork(`offer${i}:${tier}:${Math.round(power)}`) });
      const err = Math.abs(d.danger - target) / target;
      if (err < bestErr) { bestErr = err; best = d; }
      if (d.danger > target * 1.9) break;
    }
    if (best) { best.targetRatio = +(power / Math.max(1, best.danger)).toFixed(2); offers.push(best); }
  }
  return offers;
}
