// ============================================================================
// RIFT FLOORS: the inside of the Rift as maps you play on, not a room list.
// Each floor is a World of its own — carved from the day's biome, dressed with
// its seams, plants and props, and stocked with monsters when it is made —
// and it runs on exactly the colony code the camp does (see Game.tickMap).
// This file owns what only floors have: the carving, the guards that wake
// when they see you, the skirmishes they start, and what props give up.
// ============================================================================
import { RIFT_MERCHANTS } from './economy.js';
import { RNG, clamp } from './rng.js';
import { World, T, TERRAIN, FEATURES, findPath, lineOfSight } from './world.js';
import { BIOMES_RIFT } from './biomes.js';
import { rollGarrison, rollLoot, rollTrap } from './dungeon.js';
import { rollMonsterDrops, noteBestiary } from './monsters.js';
import { simulateCombat } from './combat.js';
import { killXp } from './classes.js';
import { awardXp } from './expedition.js';
import { createBeast, ANIMALS } from './husbandry.js';
import { generateNPC } from './npc.js';
import { dropItems, killColonist, addThought, gainXp } from './colony.js';
import { occupyMove } from './occupancy.js';
import { huntStep, inStrike } from './realtime.js';

/** How a biome's `layout` carves: five families of shape. */
const FLOOR_STYLE = {
  warren: 'warren', hub: 'hub', circle: 'hub', rings: 'hub', fortress: 'rooms', gated: 'rooms',
  chain: 'linear', spine: 'linear', gauntlet: 'linear', shafts: 'linear', islands: 'caves',
};

/** What lives down there besides the garrison. Species come from the camp's animal book. */
const FLOOR_FAUNA = {
  goblin_warrens: ['chitinbug'], beast_hollows: ['direwolf', 'boar'], bandit_stronghold: ['warhound'],
  fungal_depths: ['duskmoth', 'chitinbug'], sunken_crypt: ['duskmoth'], collapsed_mine: ['cavegoat', 'packlizard'],
  web_hive: ['chitinbug'], drowned_grotto: ['fowl'], ember_forge: ['packlizard'], rime_caverns: ['direwolf', 'cavegoat'],
  feywild_hollow: ['duskmoth', 'woolback'], arcane_sanctum: ['duskmoth'], infernal_breach: ['packlizard'],
  aberrant_deep: ['chitinbug'], dragons_lair: ['packlizard'],
};

// A biome's harvest nodes, as things on the map: mined ones become veins in
// the walls, the rest grow or lie on the floor.
const NODE_VEIN = { iron: 'iron', gold: 'gold', gems: 'gems', dust: 'crystal' };
const NODE_GROWTH = { food: 'fungus', herbs: 'herb', wood: 'tree', dust: 'glowcap', relics: 'bones', leather: 'nest', cloth: 'cocoon', knowledge: 'bookcase', gold: 'chest', gems: 'glowcap' };

export const SIGHT = 6;           // tiles a sleeping guard can see you from
const LEASH = 22;                 // how far a hunt runs before it gives up

/** Floor size grows with depth, but a floor is always smaller than the camp. */
export function floorSize(depth) {
  const k = Math.min(1.6, 1 + (depth - 1) * 0.1);
  return [Math.min(64, Math.round(40 * k)), Math.min(44, Math.round(30 * k))];
}

/**
 * The difficulty tier of a floor. The bottom floor (depth = level) is the
 * Rift at full strength; the floors above ramp up to it from about a third,
 * so the shallows stay worth visiting at any level and depth is the risk.
 */
export function floorTier(level, depth) {
  const span = Math.max(1, level - 1);
  return clamp(Math.round((level - 1) * (0.35 + 0.65 * (depth - 1) / span)), 0, 16);
}

// --------------------------------------------------------------- carving --
function carveRect(w, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x < 2 || y < 2 || x > w.w - 3 || y > w.h - 3) continue;
    w.terrain[w.idx(x, y)] = T.DIRT;
  }
}

/** A corridor that wanders a little instead of running ruler-straight. */
function carveTunnel(w, rng, x0, y0, x1, y1, width) {
  let x = x0, y = y0, guard = 0;
  while ((x !== x1 || y !== y1) && guard++ < 600) {
    if (rng.chance(0.18)) { if (rng.chance(0.5)) x += rng.int(-1, 1); else y += rng.int(-1, 1); }
    else if (x !== x1 && (y === y1 || rng.chance(0.5))) x += Math.sign(x1 - x);
    else y += Math.sign(y1 - y);
    x = clamp(x, 2, w.w - 3); y = clamp(y, 2, w.h - 3);
    for (let dy = 0; dy <= width; dy++) for (let dx = 0; dx <= width; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 2 || ny < 2 || nx > w.w - 3 || ny > w.h - 3) continue;
      w.terrain[w.idx(nx, ny)] = T.DIRT;
    }
  }
}

/** Chamber centres spread over the map, never too close together. */
function scatterChambers(w, rng, n, minGap, rMin, rMax) {
  const out = [];
  for (let tries = 0; tries < n * 40 && out.length < n; tries++) {
    const r = rng.int(rMin, rMax);
    const x = rng.int(r + 3, w.w - r - 4), y = rng.int(r + 3, w.h - r - 4);
    if (out.some(c => Math.hypot(c.x - x, c.y - y) < c.r + r + minGap)) continue;
    out.push({ x, y, r });
  }
  return out;
}

/** Link chambers into one network: a minimum spanning tree, plus a loop or two. */
function linkChambers(rooms, rng, extra) {
  const links = [];
  const inTree = new Set([0]);
  while (inTree.size < rooms.length) {
    let best = null;
    for (const a of inTree) for (let b = 0; b < rooms.length; b++) {
      if (inTree.has(b)) continue;
      const d = Math.hypot(rooms[a].x - rooms[b].x, rooms[a].y - rooms[b].y);
      if (!best || d < best[2]) best = [a, b, d];
    }
    if (!best) break;
    links.push([best[0], best[1]]); inTree.add(best[1]);
  }
  for (let k = 0; k < extra && rooms.length > 3; k++) {
    const a = rng.int(0, rooms.length - 1), b = rng.int(0, rooms.length - 1);
    if (a !== b && !links.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) links.push([a, b]);
  }
  return links;
}

function carveStyle(w, rng, style, depth) {
  const area = w.w * w.h;
  let rooms = [];
  if (style === 'hub') {
    const hub = { x: w.w >> 1, y: w.h >> 1, r: rng.int(6, 8) };
    rooms = [hub, ...scatterChambers(w, rng, Math.round(area / 90), 2, 2, 4).filter(c => Math.hypot(c.x - hub.x, c.y - hub.y) > hub.r + c.r + 2)];
    for (const c of rooms) w.carveBlob(c.x, c.y, c.r, 1.2);
    for (let k = 1; k < rooms.length; k++) carveTunnel(w, rng, rooms[k].x, rooms[k].y, hub.x, hub.y, rng.int(0, 1));
    // A ring road round the hub for the circle and ring layouts.
    const ring = rooms.slice(1).sort((a, b) => Math.atan2(a.y - hub.y, a.x - hub.x) - Math.atan2(b.y - hub.y, b.x - hub.x));
    for (let k = 0; k + 1 < ring.length; k += 2) carveTunnel(w, rng, ring[k].x, ring[k].y, ring[k + 1].x, ring[k + 1].y, 0);
  } else if (style === 'warren') {
    rooms = scatterChambers(w, rng, Math.round(area / 110), 2, 2, 3);
    for (const c of rooms) w.carveBlob(c.x, c.y, c.r, 0.8);
    for (const [a, b] of linkChambers(rooms, rng, Math.ceil(rooms.length / 3))) carveTunnel(w, rng, rooms[a].x, rooms[a].y, rooms[b].x, rooms[b].y, 0);
  } else if (style === 'rooms') {
    rooms = scatterChambers(w, rng, Math.round(area / 170), 3, 3, 4);
    for (const c of rooms) { c.hw = c.r + rng.int(0, 2); c.hh = c.r - rng.int(0, 1); carveRect(w, c.x - c.hw, c.y - c.hh, c.x + c.hw, c.y + c.hh); }
    for (const [a, b] of linkChambers(rooms, rng, 2)) {
      // L-shaped corridors, the way built places are.
      const A = rooms[a], B = rooms[b];
      carveRect(w, Math.min(A.x, B.x), A.y, Math.max(A.x, B.x), A.y);
      carveRect(w, B.x, Math.min(A.y, B.y), B.x, Math.max(A.y, B.y));
    }
  } else if (style === 'linear') {
    // One long way through, west to east, with pockets off it.
    const n = Math.max(5, Math.round(w.w / 7));
    let y = rng.int(6, w.h - 7);
    for (let k = 0; k < n; k++) {
      const x = Math.round(5 + (w.w - 11) * k / (n - 1));
      y = clamp(y + rng.int(-6, 6), 5, w.h - 6);
      rooms.push({ x, y, r: rng.int(2, 4) });
    }
    for (const c of rooms) w.carveBlob(c.x, c.y, c.r, 1);
    for (let k = 0; k + 1 < rooms.length; k++) carveTunnel(w, rng, rooms[k].x, rooms[k].y, rooms[k + 1].x, rooms[k + 1].y, rng.int(0, 1));
    const pockets = scatterChambers(w, rng, Math.round(n / 2), 2, 2, 3).filter(p => !rooms.some(c => Math.hypot(c.x - p.x, c.y - p.y) < c.r + p.r + 2));
    for (const p of pockets) {
      w.carveBlob(p.x, p.y, p.r, 0.8);
      const near = rooms.reduce((b, c) => Math.hypot(c.x - p.x, c.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? c : b);
      carveTunnel(w, rng, p.x, p.y, near.x, near.y, 0);
    }
    rooms.push(...pockets);
  } else {
    // Caves: blobs and tunnels, then a cellular pass roughs the walls up.
    rooms = scatterChambers(w, rng, Math.round(area / 150), 3, 3, 5);
    for (const c of rooms) w.carveBlob(c.x, c.y, c.r, 1.6);
    for (const [a, b] of linkChambers(rooms, rng, 2)) carveTunnel(w, rng, rooms[a].x, rooms[a].y, rooms[b].x, rooms[b].y, 1);
    for (let pass = 0; pass < 2; pass++) {
      const next = w.terrain.slice();
      for (let y = 2; y < w.h - 2; y++) for (let x = 2; x < w.w - 2; x++) {
        let rock = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.terrain[w.idx(x + dx, y + dy)] === T.ROCK) rock++;
        const i = w.idx(x, y);
        if (w.terrain[i] === T.ROCK && rock <= 3) next[i] = T.DIRT;
        else if (w.terrain[i] !== T.ROCK && rock >= 7) next[i] = T.ROCK;
      }
      w.terrain.set(next);
    }
  }
  return rooms;
}

/** Tiles reachable on foot from (x, y), as a Set of indices. */
function reach(w, x, y) {
  const seen = new Set([w.idx(x, y)]);
  const q = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!w.inside(nx, ny) || !w.walkable(nx, ny)) continue;
      const i = w.idx(nx, ny);
      if (seen.has(i)) continue;
      seen.add(i); q.push([nx, ny]);
    }
  }
  return seen;
}

/** Walk distance from (x, y) to every reachable tile. */
function distances(w, x, y) {
  const d = new Int32Array(w.w * w.h).fill(-1);
  d[w.idx(x, y)] = 0;
  const q = [[x, y]];
  for (let h = 0; h < q.length; h++) {
    const [cx, cy] = q[h];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!w.inside(nx, ny) || !w.walkable(nx, ny)) continue;
      const i = w.idx(nx, ny);
      if (d[i] >= 0) continue;
      d[i] = d[w.idx(cx, cy)] + 1; q.push([nx, ny]);
    }
  }
  return d;
}

/** Nearest open, feature-free tile to (x, y) — where to put stairs or a body. */
function openNear(w, x, y, taken, maxR = 8) {
  for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const nx = x + dx, ny = y + dy;
    if (!w.inside(nx, ny) || !w.walkable(nx, ny)) continue;
    const i = w.idx(nx, ny);
    if (w.feature[i] || (taken && taken.has(i))) continue;
    return [nx, ny];
  }
  return null;
}

/** True when all eight neighbours are open ground — a solid prop here can't wall anything off. */
function interior(w, x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    if (!w.walkable(x + dx, y + dy)) return false;
  }
  return true;
}

// ------------------------------------------------------------- generation --
/**
 * Build one Rift floor. Returns `{ world, monsters, beasts }`; the caller
 * makes it a map. `last` floors end in a lair instead of stairs down.
 */
export function generateFloor(seed, { biomeId, depth = 1, level = 1, last = false }) {
  const rng = new RNG(seed);
  const B = BIOMES_RIFT[biomeId] || BIOMES_RIFT.goblin_warrens;
  const [W, H] = floorSize(depth);
  const w = new World(rng.int(1, 1e9), W, H, { blank: true });
  w.biome = null;
  w.riftBiome = biomeId;
  w.depth = depth;
  w.dark = true;
  const style = FLOOR_STYLE[B.layout] || 'caves';
  let rooms = carveStyle(w, rng, style, depth);
  if (rooms.length < 2) rooms = [{ x: 8, y: H >> 1, r: 3 }, { x: W - 9, y: H >> 1, r: 3 }];

  // Ground cover: moss where it's damp, gravel where it isn't.
  for (let i = 0; i < w.terrain.length; i++) {
    if (w.terrain[i] !== T.DIRT) continue;
    const r = rng.float();
    if (r < 0.22) w.terrain[i] = T.GRASS; else if (r < 0.34) w.terrain[i] = T.SAND;
  }

  // Up-stairs in the first chamber; everything cut off from them goes back to rock.
  const up = openNear(w, rooms[0].x, rooms[0].y) || [rooms[0].x, rooms[0].y];
  w.terrain[w.idx(up[0], up[1])] = T.DIRT;
  const ok = reach(w, up[0], up[1]);
  for (let i = 0; i < w.terrain.length; i++) if (!TERRAIN[w.terrain[i]].solid && !ok.has(i)) w.terrain[i] = T.ROCK;
  rooms = rooms.filter(c => ok.has(w.idx(c.x, c.y)) || openNear(w, c.x, c.y, null, c.r));

  // Down-stairs (or the lair) as far from the way in as the floor allows.
  const dist = distances(w, up[0], up[1]);
  let far = 0;
  for (let i = 1; i < rooms.length; i++) {
    const a = dist[w.idx(rooms[i].x, rooms[i].y)], b = dist[w.idx(rooms[far].x, rooms[far].y)];
    if (a > b) far = i;
  }
  if (far === 0) far = rooms.length - 1;
  const downRoom = rooms[far];
  const down = openNear(w, downRoom.x, downRoom.y) || [downRoom.x, downRoom.y];
  w.stairsUp = { x: up[0], y: up[1] };
  w.stairsDown = last ? null : { x: down[0], y: down[1] };
  w.lair = last ? { x: down[0], y: down[1] } : null;
  w.start = { x: up[0], y: up[1] };
  const keepClear = new Set();
  for (const s of [w.stairsUp, w.stairsDown || w.lair]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = s.x + dx, y = s.y + dy;
    if (w.inside(x, y)) keepClear.add(w.idx(x, y));
  }

  // Fortresses have built walls and doors round their rooms, not raw rock.
  if (style === 'rooms') {
    for (const c of rooms) {
      if (!c.hw) continue;
      for (let y = c.y - c.hh - 1; y <= c.y + c.hh + 1; y++) for (let x = c.x - c.hw - 1; x <= c.x + c.hw + 1; x++) {
        if (!w.inside(x, y) || x < 1 || y < 1 || x > W - 2 || y > H - 2) continue;
        const edge = y === c.y - c.hh - 1 || y === c.y + c.hh + 1 || x === c.x - c.hw - 1 || x === c.x + c.hw + 1;
        if (!edge) continue;
        const i = w.idx(x, y);
        if (w.building[i]) continue;
        if (w.terrain[i] === T.ROCK) {
          if (!ok.has(i) && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.inside(x + dx, y + dy) && ok.has(w.idx(x + dx, y + dy)))) continue;
          w.terrain[i] = T.DIRT; w.building[i] = { id: 'wall', done: true, workLeft: 0, hp: 200, growth: 0, progress: 0, reservedBy: 0, rift: true };
        } else if (ok.has(i)) {
          w.building[i] = { id: 'door', done: true, workLeft: 0, hp: 160, growth: 0, progress: 0, reservedBy: 0, rift: true };
        }
      }
    }
    w.touch();
  }

  // Water, chasms: only where the way from the stairs down still stands.
  const pools = B.env && (B.env.flooded || B.env.wet) ? 4 : style === 'caves' ? 2 : B.env && B.env.unstable ? 2 : 0;
  for (let k = 0; k < pools; k++) {
    const c = rooms[rng.int(1, rooms.length - 1)];
    if (!c || c === downRoom) continue;
    const liquid = B.env && B.env.unstable ? T.CHASM : T.WATER;
    const changed = [];
    const r = Math.max(1, (c.r || 3) - 1);
    for (let y = c.y - r; y <= c.y + r; y++) for (let x = c.x - r; x <= c.x + r; x++) {
      if (!w.inside(x, y) || Math.hypot(x - c.x, y - c.y) + rng.float(-0.6, 0.6) > r) continue;
      const i = w.idx(x, y);
      if (TERRAIN[w.terrain[i]].solid || keepClear.has(i) || w.building[i]) continue;
      changed.push([i, w.terrain[i]]); w.terrain[i] = liquid;
    }
    const s = w.stairsDown || w.lair;
    w._regDirty = true;
    if (!findPath(w, up[0], up[1], s.x, s.y, true, 20000)) for (const [i, t] of changed) w.terrain[i] = t;
  }

  // Seams in the walls, from the biome's mined nodes.
  const veins = (B.nodes || []).map(n => NODE_VEIN[n[1]] && n[2] === 'mining' ? NODE_VEIN[n[1]] : null).filter(Boolean);
  const veinChance = (veins.length ? 0.07 : 0.02) * (1 + depth * 0.12);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = w.idx(x, y);
    if (w.terrain[i] !== T.ROCK) continue;
    const exposed = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.walkable(x + dx, y + dy));
    if (!exposed || !rng.chance(veinChance)) continue;
    w.feature[i] = veins.length ? rng.pick(veins) : rng.chance(0.8) ? 'iron' : 'gems';
  }

  // Rift shards: only below the first floor, and more the deeper you go.
  if (depth >= 2) {
    const exposed = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = w.idx(x, y);
      if (w.terrain[i] === T.ROCK && !w.feature[i] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.walkable(x + dx, y + dy))) exposed.push(i);
    }
    for (let k = (depth - 1) * 3 + rng.int(0, 2); k > 0 && exposed.length; k--) w.feature[exposed.splice(rng.int(0, exposed.length - 1), 1)[0]] = 'riftvein';
  }

  // What grows and what lies about, from the rest of the nodes.
  const growths = (B.nodes || []).map(n => n[2] !== 'mining' ? NODE_GROWTH[n[1]] : null).filter(Boolean);
  const taken = new Set(keepClear);
  for (let i = 0; i < w.terrain.length; i++) {
    if (TERRAIN[w.terrain[i]].solid || taken.has(i) || w.building[i]) continue;
    const x = i % W, y = (i / W) | 0;
    if (growths.length && rng.chance(0.05)) {
      const f = rng.pick(growths);
      if (FEATURES[f].solid && !interior(w, x, y)) continue;
      w.feature[i] = f; taken.add(i);
    } else if (rng.chance(0.008)) { w.feature[i] = rng.chance(0.6) ? 'bones' : 'remains'; taken.add(i); }
  }

  // Props, a few per chamber, from the biome's structure list.
  const props = B.structures || ['chest'];
  for (let k = 1; k < rooms.length; k++) {
    const c = rooms[k];
    const n = rng.int(0, 2) + (c === downRoom ? 1 : 0);
    for (let j = 0; j < n; j++) {
      const pick = rng.pick(props), f = FEATURES[pick] ? pick : 'chest';
      for (let tries = 0; tries < 12; tries++) {
        const x = c.x + rng.int(-(c.r || 3), c.r || 3), y = c.y + rng.int(-(c.r || 3), c.r || 3);
        if (!w.inside(x, y) || !w.walkable(x, y)) continue;
        const i = w.idx(x, y);
        if (w.feature[i] || taken.has(i) || w.building[i]) continue;
        if (FEATURES[f].solid && !interior(w, x, y)) continue;
        w.feature[i] = f; taken.add(i);
        break;
      }
    }
  }
  if (last && B.structures && B.structures.includes('hoard')) {
    const spot = openNear(w, downRoom.x + 2, downRoom.y, taken, 4);
    if (spot && interior(w, spot[0], spot[1])) w.feature[w.idx(spot[0], spot[1])] = 'hoard';
  }
  w.touch();
  w.recomputeLight();

  // Traps, hidden in the narrow places — the corridors everyone has to use.
  const tierT = floorTier(level, depth);
  w.traps = new Map();
  const narrow = [];
  for (let i = 0; i < w.terrain.length; i++) {
    const x = i % W, y = (i / W) | 0;
    if (!w.walkable(x, y) || taken.has(i) || w.feature[i] || w.building[i]) continue;
    const open4 = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => w.walkable(x + dx, y + dy)).length;
    if (open4 <= 2 && Math.hypot(x - up[0], y - up[1]) > 5) narrow.push(i);
  }
  for (let k = clamp(1 + depth + Math.floor(tierT / 2), 1, 8); k > 0 && narrow.length; k--) {
    const i = narrow.splice(rng.int(0, narrow.length - 1), 1)[0];
    w.traps.set(i, { ...rollTrap(rng, null, tierT), revealed: false });
  }

  // The garrison: groups asleep in their chambers, the lair's boss at the end.
  const tier = floorTier(level, depth);
  const monsters = [];
  const occupied = new Set(taken);
  let group = 0;
  const placeGroup = (units, c, boss) => {
    group++;
    for (const u of units) {
      const spot = openNear(w, c.x, c.y, occupied, 6);
      if (!spot) continue;
      occupied.add(w.idx(spot[0], spot[1]));
      u.x = spot[0]; u.y = spot[1];
      u.home = { x: spot[0], y: spot[1] };
      u.group = group; u.awake = false; u.floorSpawn = true; u.tier = u.tier || tier;
      if (boss) u.lairBoss = true;
      monsters.push(u);
    }
  };
  const factions = B.npcFactions && B.npcFactions.length ? B.npcFactions : ['wild'];
  // A budget of groups, not one per chamber: a warren has many more chambers
  // than a hub, and shouldn't be many times as deadly for it.
  let budget = clamp(2 + Math.round(tier * 0.5) + depth, 3, 7);
  const order = rooms.map((c, k) => k).slice(1).sort(() => rng.float() - 0.5);
  if (last) { const k = rooms.indexOf(downRoom); order.splice(order.indexOf(k), 1); order.unshift(k); }
  for (const k of order) {
    const c = rooms[k];
    if (budget <= 0) break;
    const dFrac = dist[w.idx(c.x, c.y)] > 0 ? dist[w.idx(c.x, c.y)] / Math.max(1, dist[w.idx(down[0], down[1])]) : 0.5;
    if (c === downRoom && last) {
      const size = clamp(1 + Math.round(tier * 0.38), 2, 5);
      placeGroup(rollGarrison(rng, biomeId, rng.pick(factions), tier + 1, size, true, B.lairTemplate).generated, c, true);
      continue;
    }
    if (!rng.chance(0.45 + dFrac * 0.35)) continue;
    budget--;
    const size = clamp(1 + Math.round(tier * 0.32) + rng.int(0, 1), 1, 5);
    placeGroup(rollGarrison(rng, biomeId, rng.pick(factions), clamp(tier + (dFrac > 0.66 ? 1 : 0), 0, 12), size, false).generated, c, false);
  }

  // Wildlife that isn't part of any garrison.
  const beasts = [];
  const fauna = (FLOOR_FAUNA[biomeId] || []).filter(s => ANIMALS[s]);
  if (fauna.length) {
    const herds = rng.int(0, 2);
    for (let k = 0; k < herds; k++) {
      const c = rooms[rng.int(1, rooms.length - 1)];
      const sp = rng.pick(fauna);
      for (let j = rng.int(1, 3); j > 0; j--) {
        const spot = openNear(w, c.x, c.y, occupied, 5);
        if (!spot) break;
        occupied.add(w.idx(spot[0], spot[1]));
        const b = createBeast(rng, sp);
        b.x = spot[0]; b.y = spot[1];
        beasts.push(b);
      }
    }
  }
  return { world: w, monsters, beasts, rooms: rooms.length, roomList: rooms, style };
}

// ---------------------------------------------------------------- guards --
function wakeGroup(v, group, who) {
  let n = 0;
  for (const r of v.raiders) if (r.group === group && r.hp > 0 && !r.awake) { r.awake = true; r.lostTicks = 0; n++; }
  if (n) {
    v.log(`F${v._m.depth}: ${n > 1 ? `${n} things` : 'Something'} in the dark ${n > 1 ? 'have' : 'has'} seen ${who.name.short}.`, 'danger', who.id);
    v.root.alert = { text: `F${v._m.depth}: ENEMIES AWAKE`, until: v.tick + 200 };
  }
}

/**
 * Monsters on a floor: asleep at their post until someone walks into view,
 * then they hunt the nearest colonist, and when they reach one a skirmish
 * breaks out. A hunt that loses everyone for long enough walks back home.
 */
export function tickFloorMonsters(v) {
  const w = v.world, rs = v.raiders;
  if (!rs.length) return;
  const rng = v._m.rng;
  const cols = v.here.filter(c => !c.dead && c.hp > 0 && !c.downed);
  for (const r of rs) {
    if (r.hp <= 0 || r.neutral) continue;   // a merchant minds its stall
    if (r.stamina == null) r.stamina = 100;
    // Asleep they get their wind back; hunting spends it, and a spent hunter gives up.
    if (!r.awake) r.stamina = Math.min(100, r.stamina + 0.4);
    else if (!r.fleeing) {
      r.stamina = Math.max(0, r.stamina - 0.2);
      if (r.stamina <= 0) { r.fleeing = v.tick + 600; v.log(`F${v._m.depth}: ${r.name.short} is spent and slinks back to its lair.`, 'info'); }
    }
    r.moveCd = (r.moveCd || 0) - 1;
    if (!r.awake) {
      // Looking round is quick; shuffling about the post is not.
      r.lookCd = (r.lookCd || 0) - 1;
      if (r.lookCd <= 0) {
        r.lookCd = 3;
        for (const c of cols) {
          if (Math.hypot(c.x - r.x, c.y - r.y) <= SIGHT && lineOfSight(w, r.x, r.y, c.x, c.y)) { wakeGroup(v, r.group, c); break; }
        }
      }
      if (!r.awake) {
        if (r.moveCd > 0) continue;
        // Idle at the post: a step here and there, never far.
        r.moveCd = rng.int(8, 20);
        const home = r.home || r;
        const nx = r.x + rng.int(-1, 1), ny = r.y + rng.int(-1, 1);
        if (Math.hypot(nx - home.x, ny - home.y) <= 2.5 && w.walkable(nx, ny)) occupyMove(v, r, nx, ny);
        continue;
      }
    }
    if (r.moveCd > 0) continue;
    r.moveCd += 2.6;   // fractions carry over, so the pace is even
    // Broke and ran: back to the post, and settle down again once there.
    if (r.fleeing) {
      if (!r.home || (r.x === r.home.x && r.y === r.home.y) || v.tick > r.fleeing) { r.fleeing = 0; r.awake = false; continue; }
      huntStep(v, r, r.home.x, r.home.y, false);
      continue;
    }
    let target = null, td = Infinity;
    for (const c of cols) { const d = Math.hypot(c.x - r.x, c.y - r.y); if (d < td) { td = d; target = c; } }
    if (!target || td > LEASH) {
      // Lost them: drift back to the post and settle.
      r.lostTicks = (r.lostTicks || 0) + 1;
      if (r.lostTicks > 40 && r.home) {
        if (r.x === r.home.x && r.y === r.home.y) { r.awake = false; continue; }
        huntStep(v, r, r.home.x, r.home.y, false);
      }
      continue;
    }
    r.lostTicks = 0;
    if (inStrike(v, r, target)) continue;   // in reach: realtime.js does the swinging
    huntStep(v, r, target.x, target.y, true);
  }
}

// ----------------------------------------------------------------- props --
/**
 * What a prop gives up besides its fixed yield (colony.js drops that): a
 * loot roll on the ground, gear into the armoury, a prisoner freed, a
 * blessing, a bit of lore for the research bench.
 */
export function openProp(v, npc, f, x, y) {
  const F = FEATURES[f];
  const m = v._m;
  const rng = m.rng || v.rng.fork('prop' + v.tick);
  const B = BIOMES_RIFT[m.biome] || BIOMES_RIFT.goblin_warrens;
  const tier = floorTier(v.rift.level, m.depth || 1);
  if (F.loot) {
    const l = rollLoot(rng, { loot: B.loot }, tier, F.loot * depthMult(m.depth));
    dropItems(v, x, y, l.resources);
    v.armory.push(...l.items);
  }
  if (F.gear && rng.chance(F.gear)) {
    const l = rollLoot(rng, { loot: B.loot }, tier, 2);
    if (l.items.length) v.armory.push(l.items[0]);
  }
  if (F.prisoner && rng.chance(F.prisoner === true ? 1 : F.prisoner)) {
    const p = generateNPC(rng, { faction: 'wanderers', tier: clamp(tier, 0, 10) });
    p.arrivedTick = v.tick;
    p.hostility = Math.min(p.hostility, 30);
    v.pendingArrivals.push({ npc: p, expires: v.tick + 1800, fee: 0 });
    v.log(`${npc.name.short} breaks open the ${F.name.toLowerCase()}: ${p.name.full} was held here, and asks to come back with you.`, 'good', p.id);
  }
  if (F.blessing) {
    for (const c of v.here) { c.hp = Math.min(c.maxHp, c.hp + Math.round(c.maxHp * 0.35)); addThought(c, 'joy'); }
    v.log(`F${m.depth}: the altar answers ${npc.name.short}. Wounds close.`, 'good', npc.id);
  }
  if (F.insight) v.root.pendingInsight += F.insight;
  if (F.locked) { v.root.keys = Math.max(0, (v.root.keys || 0) - 1); v.log(`F${m.depth}: a Rift key turns in the vault's lock.`, 'good', npc.id); }
}

/**
 * Place a Rift merchant (and on deeper floors, now and then a sealed vault)
 * on a newly made floor. A merchant whose kind the colony has robbed before
 * is here as a guard now, and it remembers.
 */
export function placeMerchant(root, m, f, rng) {
  const w = m.world, up = w.stairsUp;
  const occupied = new Set(m.raiders.map(r => w.idx(r.x, r.y)));
  if (m.depth >= 2 && rng.chance(0.4)) {
    for (let k = 0; k < 200; k++) {
      const x = rng.int(2, w.w - 3), y = rng.int(2, w.h - 3), i = w.idx(x, y);
      if (!w.walkable(x, y) || w.feature[i] || occupied.has(i) || Math.hypot(x - up.x, y - up.y) < 14) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => w.walkable(x + dx, y + dy)).length < 3) continue;
      w.feature[i] = 'vault'; w.touch();
      break;
    }
  }
  if (!rng.chance(0.32)) return null;
  const kinds = Object.keys(RIFT_MERCHANTS).filter(k => RIFT_MERCHANTS[k].minDepth <= m.depth);
  const kind = rng.pick(kinds);
  const M = RIFT_MERCHANTS[kind];
  // Somewhere quiet: the room nearest the stairs up that no garrison sleeps in.
  const rooms = (f.roomList || []).slice(1).filter(c => !m.raiders.some(r => Math.hypot(r.x - c.x, r.y - c.y) < 7));
  rooms.sort((a, b) => Math.hypot(a.x - up.x, a.y - up.y) - Math.hypot(b.x - up.x, b.y - up.y));
  const c = rooms[0];
  if (!c) return null;
  const spot = [c.x, c.y];
  if (!w.walkable(spot[0], spot[1]) || occupied.has(w.idx(spot[0], spot[1]))) return null;
  const tier = floorTier(m.level || 1, m.depth || 1);
  const npc = generateNPC(rng, { faction: 'merchants', raceHint: M.race, tier: clamp(tier + 4, 2, 14) });
  npc.x = spot[0]; npc.y = spot[1]; npc.home = { x: spot[0], y: spot[1] };
  npc.merchant = kind; npc.title = M.name; npc.group = -1; npc.tier = tier + 2;
  npc.hp = npc.maxHp = Math.round(npc.maxHp * 1.6);
  if (root.robbed && root.robbed[kind]) { npc.floorSpawn = true; npc.awake = false; npc.neutral = false; }
  else { npc.neutral = true; npc.awake = false; npc.floorSpawn = true; }
  m.raiders.push(npc);
  return npc;
}

/**
 * Traps: stepping on a hidden one springs it (a save for half), and anyone
 * walking a floor keeps an eye out — a sharp-eyed survivor spots them a few
 * tiles off, and a spotted trap is stepped around carefully and never springs.
 */
export function tickFloorTraps(v) {
  const w = v.world;
  if (!w.traps || !w.traps.size) return;
  const rng = v._m.rng;
  const mod = (c, a) => Math.floor((((c.attributes && c.attributes[a]) || 10) - 10) / 2);
  for (const c of v.here) {
    if (c.dead || c.hp <= 0) continue;
    const t = w.traps.get(w.idx(c.x, c.y));
    if (t && !t.sprung && !t.revealed) {
      t.sprung = true;
      const saved = rng.int(1, 20) + mod(c, t.save) >= t.dc;
      const dmg = Math.round(rng.int(t.dmg[0], t.dmg[1]) * (saved ? 0.5 : 1));
      c.hp = Math.max(1, c.hp - dmg);
      if (!saved && rng.chance(0.4)) c.injuries.push({ id: 'cut', name: t.name + ' wound', sev: 2, heal: 1800, mods: { work: -0.1 }, left: 1800, treated: false });
      v.log(`F${v._m.depth}: ${c.name.short} springs a ${t.name.toLowerCase()}${saved ? ' but twists clear of the worst' : ''} (−${dmg} hp).`, 'danger', c.id);
    }
    if ((v.tick + c.id) % 20 !== 0) continue;
    const eye = 0.12 + ((c.skills && c.skills.survival) || 0) * 0.03 + mod(c, 'wis') * 0.03;
    for (const [i, tr] of w.traps) {
      if (tr.revealed || tr.sprung) continue;
      const tx = i % w.w, ty = (i / w.w) | 0;
      if (Math.hypot(tx - c.x, ty - c.y) > 3) continue;
      if (rng.chance(eye)) {
        tr.revealed = true;
        v.log(`F${v._m.depth}: ${c.name.short} spots a ${tr.name.toLowerCase()} and marks it.`, 'info', c.id);
      }
    }
  }
}

/** Everything found deeper is worth more: +40% per floor below the first. */
export function depthMult(depth) { return 1 + 0.4 * Math.max(0, (depth || 1) - 1); }

/**
 * The lair's master is dead. Its hoard spills out where it fell, two pieces
 * of real gear with it, and the Rift is left reeling: no wave for two nights.
 */
export function lairReward(v, boss) {
  const m = v._m, rng = m.rng || v.rng;
  const B = BIOMES_RIFT[m.biome] || BIOMES_RIFT.goblin_warrens;
  const tier = floorTier(v.rift.level, m.depth || 1) + 2;
  const l = rollLoot(rng, { loot: B.loot }, tier, 3 * depthMult(m.depth));
  dropItems(v, boss.x, boss.y, { ...l.resources, riftshard: 4 + (m.depth || 1) });
  v.armory.push(...l.items, ...rollLoot(rng, { loot: B.loot }, tier, 3).items.slice(0, 1));
  if (l.items.length < 2) v.armory.push(...rollLoot(rng, { loot: B.loot }, tier + 1, 4).items.slice(0, 2 - l.items.length));
  v.rift.quietNights = 2;
  v.log(`F${m.depth}: the lair is broken. Its hoard spills out, and the Rift reels — no wave for two nights.`, 'major');
}

/** Everyone out of a pack and into the stores — they made it back to camp. */
export function unloadPack(game, npc, addResource) {
  if (!npc.pack) return 0;
  let n = 0;
  const dv = game.root.delve;
  for (const [k, q] of Object.entries(npc.pack)) {
    if (q <= 0) continue;
    addResource(game, k, q); n += q;
    if (dv) dv.loot.resources[k] = (dv.loot.resources[k] || 0) + q;
    // Shards teach whoever studies them: each one carried out is research done.
    if (k === 'riftshard') { game.root.pendingInsight += q * 6; game.log(`${q} Rift shard${q > 1 ? 's' : ''} reach the research bench.`, 'good', npc.id); }
  }
  npc.pack = {};
  return n;
}

export { FLOOR_FAUNA, FLOOR_STYLE, lineOfSight };
