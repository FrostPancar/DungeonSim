// ============================================================================
// SAVE / LOAD: a whole run to a string and back, exactly.
//
// The game state is a graph, not a tree — the same colonist is in the roster,
// in someone's task, in a delve's member list — so this is a graph encoder:
// anything reachable twice is written once and referred to after, class
// instances (Game, World, Overworld, RNG) come back with their prototypes,
// and Maps, Sets and typed arrays survive the trip. What can be rebuilt is
// not saved: per-map views, fights in progress (the field re-forms the next
// tick), occupancy and the world's lookup caches.
//
// A save also carries the module-level id counters, so a loaded run hands out
// the same ids — and so plays out the same — as one that was never saved.
// ============================================================================
import { Game } from './game.js';
import { World } from './world.js';
import { Overworld } from './overworld.js';
import { RNG } from './rng.js';
import { npcIdCounter, resetIds } from './npc.js';
import { beastIdCounter, resetBeastIds } from './husbandry.js';
import { monsterIdCounter, resetMonsterIds } from './monsters.js';
import { itemIdCounter, resetItemIds } from './items.js';
import { livePotions, packPotions } from './realtime.js';

export const SAVE_VERSION = 1;
const SAVE_CLASSES = { Game, World, Overworld, RNG };
// Derived or transient: rebuilt after loading rather than stored.
const SKIP_KEYS = new Set(['view', 'occ', 'fxAct', 'fxSt', 'fxCharging', '_bc', '_bcAll', '_open', 'spatial', 'aoeFocus']);
const TYPED = { Uint8Array, Int32Array, Float32Array, Uint16Array, Int16Array, Float64Array, Uint32Array, Int8Array };

function classOf(o) {
  const p = Object.getPrototypeOf(o);
  if (p === Object.prototype || p === null || p === Array.prototype) return null;
  for (const [name, C] of Object.entries(SAVE_CLASSES)) if (p === C.prototype) return name;
  return undefined;   // something we don't know how to rebuild
}

/** Encode a Game as a JSON string. */
export function encodeGame(game) {
  // Pass 1: count how often each object is reached, so only shared ones pay for an id.
  const seen = new Map();
  const count = (v) => {
    if (!v || typeof v !== 'object') return;
    const n = seen.get(v) || 0;
    seen.set(v, n + 1);
    if (n) return;
    if (ArrayBuffer.isView(v)) return;
    if (v instanceof Map) { for (const [k, x] of v) { count(k); count(x); } return; }
    if (v instanceof Set) { for (const x of v) count(x); return; }
    if (Array.isArray(v)) { for (const x of v) count(x); return; }
    for (const k of Object.keys(v)) if (!SKIP_KEYS.has(k)) count(v[k]);
  };
  count(game);
  const ids = new Map();
  let next = 0;
  const enc = (v) => {
    if (v === undefined) return { $$u: 1 };
    if (typeof v === 'number') return Number.isFinite(v) ? v : { $$n: String(v) };
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? null : v;
    if (ids.has(v)) return { $$r: ids.get(v) };
    const shared = seen.get(v) > 1;
    const id = shared ? next++ : -1;
    if (shared) ids.set(v, id);
    let out;
    if (ArrayBuffer.isView(v)) out = { $$t: v.constructor.name, d: Array.from(v) };
    else if (v instanceof Map) out = { $$m: [...v].map(([k, x]) => [enc(k), enc(x)]) };
    else if (v instanceof Set) out = { $$s: [...v].map(enc) };
    else if (Array.isArray(v)) out = shared ? { $$a: v.map(enc) } : v.map(enc);
    else {
      const cls = classOf(v);
      if (cls === undefined) return null;
      const o = {};
      for (const k of Object.keys(v)) {
        if (SKIP_KEYS.has(k)) continue;
        const x = v[k];
        if (typeof x === 'function') continue;
        o[k] = enc(x);
      }
      out = cls || shared ? { $$o: o } : o;
      if (cls) out.$$c = cls;
    }
    if (shared && !Array.isArray(out)) out.$$id = id;
    return out;
  };
  return JSON.stringify(enc(game));
}

/** Rebuild a Game from encodeGame()'s output. */
export function decodeGame(text) {
  const root = JSON.parse(text);
  const byId = new Map();
  const dec = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(dec);
    if ('$$r' in v) return byId.get(v.$$r);
    if ('$$u' in v) return undefined;
    if ('$$n' in v) return Number(v.$$n);
    let out;
    const reg = (o) => { if ('$$id' in v) byId.set(v.$$id, o); return o; };
    if ('$$t' in v) return reg(new TYPED[v.$$t](v.d));
    if ('$$m' in v) { out = reg(new Map()); for (const [k, x] of v.$$m) out.set(dec(k), dec(x)); return out; }
    if ('$$s' in v) { out = reg(new Set()); for (const x of v.$$s) out.add(dec(x)); return out; }
    if ('$$a' in v) { out = reg([]); for (const x of v.$$a) out.push(dec(x)); return out; }
    const src = '$$o' in v ? v.$$o : v;
    out = reg(v.$$c ? Object.create(SAVE_CLASSES[v.$$c].prototype) : {});
    for (const k of Object.keys(src)) out[k] = dec(src[k]);
    return out;
  };
  // Objects can be referenced before they finish decoding (a colonist in its
  // own relations); registering each one before its fields handles that.
  return dec(root);
}

/** Everything a slot needs: the game, the id counters, and a little UI state. */
export function saveState(game, ui = {}) {
  const payload = {
    v: SAVE_VERSION,
    counters: { npc: npcIdCounter(), beast: beastIdCounter(), monster: monsterIdCounter(), item: itemIdCounter() },
    ui,
    game: encodeGame(game),
  };
  return JSON.stringify(payload);
}

/** The inverse of saveState. Returns { game, ui }. */
export function loadState(text) {
  const p = JSON.parse(text);
  if (!p || p.v !== SAVE_VERSION) throw new Error('This save is from a different version of the game.');
  const game = decodeGame(p.game);
  // Put back what was left out as derived.
  for (const m of game.maps) {
    m.view = m.kind === 'camp' ? game : null;
    m.occ = null; m.jobsDirty = true;
    // A fight in progress comes back mid-swing; only its live potion link needs rewiring.
    if (m.field) m.field.S.ctx.potions = m.kind === 'floor' ? packPotions(game.viewOf(m)) : livePotions(game);
    const w = m.world;
    w._bc = {}; w._bcAll = []; w._bcBuilt = -1; w._regDirty = true;
  }
  game._m = game.maps[0];
  game.root = game;
  const c = p.counters || {};
  resetIds(c.npc || 1); resetBeastIds(c.beast || 1); resetMonsterIds(c.monster || 900000); resetItemIds(c.item || 1);
  return { game, ui: p.ui || {} };
}

/** A one-line summary for the slot list. */
export function saveSummary(game, extra = {}) {
  return {
    v: SAVE_VERSION,
    seed: game.seedString,
    day: game.day, year: game.year, season: game.season,
    pop: game.colonists.length,
    level: game.rift.level, rank: game.riftRank,
    biome: game.biome,
    savedAt: Date.now(),
    ...extra,
  };
}
