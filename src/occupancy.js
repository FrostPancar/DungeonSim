// ============================================================================
// OCCUPANCY. A tile holds one body.
//
// Colonists, Rift spawn, raiders and animals all stand on integer tiles, and
// before this nothing stopped five of them standing on the same one — a squad
// order piled everyone into a single token and a wave read as one monster.
//
// `game.occ` maps a tile index to the unit standing there. Movers ask it before
// they step and keep it current as they go; `separateUnits` runs at both ends
// of a tick and nudges anything that arrived without walking (a wave, a calf,
// a party back from the Rift) onto the nearest free tile.
//
// No randomness in here: collisions resolve the same way every run, so a seed
// still replays exactly.
// ============================================================================

/** Every body that currently stands on the colony map, in a fixed order. */
export function mapUnits(game) {
  const out = [];
  // Someone being carried rides on their carrier's tile, not one of their own.
  for (const c of game.here) if (!c.away && !c.dead && c.hp > 0 && !c.carriedBy) out.push(c);
  for (const r of game.raiders) if (r.hp > 0) out.push(r);
  for (const b of game.beasts) if (!b.dead && !b.away) out.push(b);
  return out;
}

/** The unit on (x, y), if any. */
export function occupantAt(game, x, y) {
  const w = game.world;
  if (!game.occ || !w.inside(x, y)) return null;
  return game.occ.get(w.idx(x, y)) || null;
}

/** True if `u` may stand on (x, y): nobody else is there. */
export function tileFree(game, x, y, u = null) {
  const o = occupantAt(game, x, y);
  return !o || o === u;
}

/**
 * Step `u` onto (x, y) if the tile is free. Keeps `game.occ` current so the
 * next mover this tick sees the new position. Returns false when blocked.
 */
export function occupyMove(game, u, x, y) {
  const w = game.world;
  if (!game.occ) rebuildOccupancy(game);
  const to = w.idx(x, y);
  const o = game.occ.get(to);
  if (o && o !== u) return false;
  const from = w.idx(u.x, u.y);
  if (game.occ.get(from) === u) game.occ.delete(from);
  u.x = x; u.y = y;
  game.occ.set(to, u);
  return true;
}

/** Two units trade tiles — how two people meeting in a corridor get past. */
export function swapUnits(game, a, b) {
  const w = game.world;
  const ax = a.x, ay = a.y;
  a.x = b.x; a.y = b.y; b.x = ax; b.y = ay;
  game.occ.set(w.idx(a.x, a.y), a);
  game.occ.set(w.idx(b.x, b.y), b);
  a.path = null; b.path = null;
}

export function rebuildOccupancy(game) {
  const w = game.world;
  const m = new Map();
  for (const u of mapUnits(game)) {
    const i = w.idx(u.x, u.y);
    if (!m.has(i)) m.set(i, u);
  }
  game.occ = m;
  return m;
}

/**
 * The nearest walkable, unoccupied tile to (x, y), by breadth-first rings over
 * walkable ground (so it never hops a wall). Null if none within `maxR`.
 */
export function freeTileNear(game, x, y, u = null, maxR = 12) {
  const w = game.world;
  if (w.inside(x, y) && w.walkable(x, y) && tileFree(game, x, y, u)) return [x, y];
  const seen = new Set([w.idx(x, y)]);
  let ring = [[x, y]];
  for (let r = 0; r < maxR && ring.length; r++) {
    const next = [];
    for (const [cx, cy] of ring) {
      for (const [dx, dy] of OCC_DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!w.inside(nx, ny)) continue;
        const i = w.idx(nx, ny);
        if (seen.has(i)) continue;
        seen.add(i);
        if (!w.walkable(nx, ny)) continue;
        if (tileFree(game, nx, ny, u)) return [nx, ny];
        next.push([nx, ny]);
      }
    }
    ring = next;
  }
  return null;
}
// Orthogonals first, so a nudge prefers the obvious neighbour.
const OCC_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/**
 * Enforce one body per tile. The first unit on a tile keeps it (colonists win,
 * then raiders, then animals — the order of `mapUnits`); everyone else is moved
 * to the nearest free tile and drops its path so it re-plans from there.
 */
export function separateUnits(game) {
  const w = game.world;
  const m = new Map();
  game.occ = m;
  const losers = [];
  for (const u of mapUnits(game)) {
    const i = w.idx(u.x, u.y);
    if (m.has(i)) losers.push(u); else m.set(i, u);
  }
  for (const u of losers) {
    const spot = freeTileNear(game, u.x, u.y, u, 24);
    if (!spot) continue;   // boxed in completely; try again next tick
    u.x = spot[0]; u.y = spot[1];
    u.path = null;
    m.set(w.idx(u.x, u.y), u);
  }
  return losers.length;
}

/**
 * `n` distinct walkable tiles around (x, y), nearest first, for a group order:
 * a squad sent to one tile forms up around it. Tiles held by anyone outside
 * `group` are skipped; tiles held by the group itself are fine (they'll move).
 */
export function formationTiles(game, x, y, n, group = new Set()) {
  const w = game.world;
  const out = [];
  if (!w.inside(x, y)) return out;
  const usable = (tx, ty) => {
    if (!w.walkable(tx, ty)) return false;
    const o = occupantAt(game, tx, ty);
    return !o || group.has(o);
  };
  const seen = new Set([w.idx(x, y)]);
  let ring = [[x, y]];
  if (usable(x, y)) out.push([x, y]);
  for (let r = 0; r < 10 && ring.length && out.length < n; r++) {
    const next = [];
    for (const [cx, cy] of ring) for (const [dx, dy] of OCC_DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!w.inside(nx, ny)) continue;
      const i = w.idx(nx, ny);
      if (seen.has(i)) continue;
      seen.add(i);
      if (!w.walkable(nx, ny)) continue;
      next.push([nx, ny]);
      if (usable(nx, ny) && out.length < n) out.push([nx, ny]);
    }
    ring = next;
  }
  return out;
}
