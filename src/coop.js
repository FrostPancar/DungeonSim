// ============================================================================
// CO-OP: several players, one colony, kept in step by deterministic lockstep.
//
// Every client runs the whole simulation. What travels is the host's clock
// ("you may run to tick T") and the players' commands, each stamped with the
// tick it runs on. Same seed + same commands on the same ticks = same colony.
//
// Nothing here touches the DOM or the network: the host and guest classes talk
// through a `send` function, so the harness can wire two of them together in
// one process, with delays and reordering, and prove they never drift.
//
// The fail-safe (docs/coop-plan.md §7): the host stamps a cheap signature every
// SIG_EVERY ticks and a full-state hash every HASH_EVERY ticks. A guest checks
// its own numbers at the same tick, before that tick's commands run. On any
// mismatch it stops and asks for the host's save, reloads it and carries on
// from the host's numbers. Seed, build and protocol are checked when joining.
// ============================================================================
import { encodeGame, saveState, loadState } from './save.js';
import { npcIdCounter, resetIds } from './npc.js';
import { beastIdCounter, resetBeastIds } from './husbandry.js';
import { monsterIdCounter, resetMonsterIds } from './monsters.js';
import { itemIdCounter, resetItemIds } from './items.js';

export const COOP_PROTOCOL = 1;
// The bundle stamps a hash of src/ in here (build.mjs), so two different builds refuse each other.
export const COOP_BUILD = 'dev';
export const COOP_MAX_PLAYERS = 4;
export const COOP_SIG_EVERY = 60;      // one in-game hour: a cheap signature
export const COOP_HASH_EVERY = 720;    // half a day: a hash of the whole game
const COOP_FAR_BEHIND = 2880;          // two days behind: fetch a snapshot rather than replay

/**
 * The game methods a player may call, and what the issuing guest is told the
 * call returned while it is still on its way to the host. Everything is plain
 * data: ids, coordinates and strings, never object references.
 */
export const COOP_OPS = {
  build: true, designate: true, rush: true,
  orderMove: true, orderWork: true, orderTravel: true, orderAttack: true,
  orderTame: true, orderRescue: true, orderHunt: true, markButcher: true,
  setPriority: true, setHandler: true, setCrop: true, cancelTraining: true,
  setResearch: true, unqueueResearch: true, queueResearch: true, researchPart: null,
  launchExpedition: { ok: true, ids: [] }, choosePrestige: null,
  equip: null, unequip: true, upgradeGear: true, forge: null, craftLegendary: null, brew: null,
  enroll: null, readTome: null, learnBook: null, copyBook: null, designSpell: null, buildFloor: true,
  buy: true, sell: true, buyLivestock: true, buyMagic: null, sellBook: null,
  acceptArrival: true, rejectArrival: true,
};

// ------------------------------------------------------------- numbers --
/** 32-bit FNV-1a over a string: the same function the seeded RNG hashes with. */
export function coopFnv(str, h = 2166136261) {
  h >>>= 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The module-level id counters. They are part of the state: a colony that hands out a different next id has drifted. */
export function coopCounters() {
  return [npcIdCounter(), beastIdCounter(), monsterIdCounter(), itemIdCounter()];
}
export function coopSetCounters(c) {
  resetIds(c[0]); resetBeastIds(c[1]); resetMonsterIds(c[2]); resetItemIds(c[3]);
}

/**
 * Cheap, every hour: the clock, the RNG, the id counters, where everyone is
 * and how hurt, what's in the stores, and how long the log is. Most drift
 * shows up here within the hour it starts.
 */
export function coopQuickSig(g) {
  const parts = [g.tick_, g.rng.s, coopCounters().join('.'), g.maps.length, g.logs.length];
  for (const c of g.colonists) parts.push(c.id, c.x, c.y, Math.round((c.hp || 0) * 100), c.mapId || 0, c.dead ? 1 : 0);
  for (const m of g.maps) { parts.push('m' + m.id); for (const r of m.raiders || []) parts.push(r.id, r.x, r.y, Math.round((r.hp || 0) * 100)); }
  for (const k of Object.keys(g.resources)) parts.push(k, Math.round(g.resources[k] * 100));
  return coopFnv(parts.join(','));
}

/**
 * Thorough, twice a day: a hash of the whole save. The tutorial is left out —
 * it lives on the game but follows each player's own clicks.
 */
export function coopFullHash(g) {
  const tut = g.tutorial;
  if (tut !== undefined) g.tutorial = undefined;
  try { return coopFnv(coopCounters().join('.') + '|' + encodeGame(g)); }
  finally { if (tut !== undefined) g.tutorial = tut; }
}

// ------------------------------------------------------------ commands --
/** Run one player command on a game. Returns what the method returned, or an error string. */
export function applyCoopCommand(game, cmd) {
  if (!Object.prototype.hasOwnProperty.call(COOP_OPS, cmd.op)) return 'Unknown order: ' + cmd.op;
  const m = game.mapById(cmd.mapId || 0);
  if (!m) return 'That map is gone.';
  const v = game.viewOf(m);
  if (typeof v[cmd.op] !== 'function') return 'Unknown order: ' + cmd.op;
  try { return v[cmd.op](...(cmd.args || [])); }
  catch (e) { return 'That order failed: ' + (e && e.message ? e.message : e); }
}

/** Turn a method's return value into a message for the player who asked — or null when it worked. */
export function coopResultMessage(op, r) {
  if (typeof r === 'string') return r || null;
  if (r && typeof r === 'object' && r.ok === false) return r.why || r.msg || r.reason || 'That could not be done.';
  if (r === false && ['build', 'orderWork', 'buy', 'sell', 'buyLivestock', 'acceptArrival'].includes(op)) return 'That could not be done.';
  return null;
}

/** Four digits. A code is only a meeting point, not a secret. */
export function coopNewCode(rand = Math.random) {
  return String(Math.floor(rand() * 10000)).padStart(4, '0');
}

// --------------------------------------------------------------- host --
/**
 * The host owns the clock and the order of commands. `send(peer, msg)` goes to
 * one guest, peer null means everyone. The host's game is the canonical one.
 */
export class CoopHost {
  constructor(game, { code, send, name = 'Host', onEvent = () => {} }) {
    this.game = game;
    this.code = code;
    this.send = send;
    this.onEvent = onEvent;
    this.players = [{ id: 0, peer: null, name }];
    this.nextPlayer = 1;
    this.seq = 0;
    this.out = [];              // commands run since the last turn went out
    this.sigs = [];             // [tick, quickSig, fullHash|null] since the last turn
    this.lastTurnTick = -1;
    this.speed = 1; this.paused = false;
  }

  get guests() { return this.players.filter(p => p.peer != null); }

  /** Run a command now, at the current tick, and queue it for everyone else. */
  issue(player, op, mapId, args) {
    const g = this.game;
    const cmd = { at: g.tick_, seq: ++this.seq, player, op, mapId: mapId || 0, args: args || [] };
    const r = applyCoopCommand(g, cmd);
    this.out.push(cmd);
    return r;
  }

  /** Call after every game.step(), before anything else runs at the new tick. */
  afterStep() {
    const t = this.game.tick_;
    if (t % COOP_SIG_EVERY === 0) this.sigs.push([t, coopQuickSig(this.game), t % COOP_HASH_EVERY === 0 ? coopFullHash(this.game) : null]);
  }

  /** Send what happened since the last turn. Cheap to call every frame. */
  flush(force = false) {
    const t = this.game.tick_;
    if (!force && t === this.lastTurnTick && !this.out.length && !this.sigs.length && !this.clockDirty) return;
    if (!this.guests.length) { this.out.length = 0; this.sigs.length = 0; this.lastTurnTick = t; this.clockDirty = false; return; }
    this.send(null, { t: 'turn', upTo: t, speed: this.speed, paused: this.paused, cmds: this.out, sigs: this.sigs, players: this.roster() });
    this.out = []; this.sigs = []; this.lastTurnTick = t; this.clockDirty = false;
  }

  setClock(speed, paused) {
    if (speed !== this.speed || paused !== this.paused) this.clockDirty = true;
    this.speed = speed; this.paused = paused;
  }

  roster() { return this.players.map(p => ({ id: p.id, name: p.name })); }

  /** Everything a guest needs to become this colony: the save, and where the command stream picks up. */
  snapshot(player) {
    // Anything already run is inside the save, so the guest skips seq ≤ this.
    this.flush(true);
    return {
      t: 'snapshot', player, code: this.code, seed: this.game.seedString, tick: this.game.tick_,
      seq: this.seq, speed: this.speed, paused: this.paused, save: saveState(this.game, {}), players: this.roster(),
    };
  }

  receive(peer, msg) {
    if (!msg || typeof msg !== 'object') return;
    const p = this.players.find(x => x.peer === peer);
    if (msg.t === 'hello') {
      const why = msg.proto !== COOP_PROTOCOL ? 'The host is on a different version of co-op. Reload the page.'
        : msg.build !== COOP_BUILD ? 'The host is running a different build of the game. Reload the page (both of you).'
        : this.players.length >= COOP_MAX_PLAYERS && !p ? `This world is full (${COOP_MAX_PLAYERS} players).`
        : this.game.gameOver ? 'That colony has fallen.' : null;
      if (why) { this.send(peer, { t: 'refuse', why }); return; }
      const me = p || { id: this.nextPlayer++, peer, name: String(msg.name || '').slice(0, 20) || 'Player' };
      // Snapshot first: its flush goes to the guests already in, not to this one.
      const snap = this.snapshot(me.id);
      if (!p) { this.players.push(me); snap.players = this.roster(); }
      this.send(peer, snap);
      this.onEvent({ kind: 'join', player: me });
      this.clockDirty = true;
    } else if (!p) {
      return;
    } else if (msg.t === 'cmd') {
      if (!Object.prototype.hasOwnProperty.call(COOP_OPS, msg.op) || !Array.isArray(msg.args)) return;
      const r = this.issue(p.id, msg.op, msg.mapId, msg.args);
      const why = coopResultMessage(msg.op, r);
      if (why) this.send(peer, { t: 'result', seq: msg.seq, msg: why });
    } else if (msg.t === 'resync') {
      // The fail-safe: whatever the guest thinks, the host's numbers win.
      this.onEvent({ kind: 'resync', player: p, reason: msg.reason, tick: msg.tick });
      this.send(peer, this.snapshot(p.id));
    } else if (msg.t === 'ask') {
      this.onEvent({ kind: 'ask', player: p, what: msg.what });
    }
  }

  drop(peer) {
    const i = this.players.findIndex(x => x.peer === peer);
    if (i < 0) return;
    const [p] = this.players.splice(i, 1);
    this.onEvent({ kind: 'leave', player: p });
    this.clockDirty = true;
  }
}

// -------------------------------------------------------------- guest --
/**
 * A guest never runs ahead of the host: it steps up to the last tick the host
 * announced, running each command on its tick, and checks the host's numbers
 * as it passes them. `load(saveText)` must return the loaded Game.
 */
export class CoopGuest {
  constructor({ send, load, onEvent = () => {} }) {
    this.send = send;
    this.load = load;
    this.onEvent = onEvent;
    this.game = null;
    this.player = null;
    this.upTo = -1;
    this.queue = [];            // commands not yet run, in (at, seq) order
    this.hostSigs = new Map();  // tick -> [quick, full|null]
    this.minSeq = 0;            // commands up to here are already in the snapshot
    this.mySeq = 0;
    this.waiting = true;        // no game yet, or a resync in flight
    this.speed = 1; this.paused = false;
    this.players = [];
    this.checks = { quick: 0, full: 0, resyncs: 0 };
  }

  hello(name) { this.send({ t: 'hello', proto: COOP_PROTOCOL, build: COOP_BUILD, name }); }

  /** Ask the host to run something. The answer arrives as a turn; a failure also as a message. */
  issue(op, mapId, args) {
    if (this.waiting) return false;
    this.send({ t: 'cmd', seq: ++this.mySeq, op, mapId: mapId || 0, args: args || [] });
    return true;
  }

  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'snapshot') {
      const g = this.load(msg.save);
      if (g.seedString !== msg.seed || g.tick_ !== msg.tick) { this.resync('the host save did not load to the host tick'); return; }
      this.game = g;
      this.player = msg.player;
      this.upTo = msg.tick;
      this.minSeq = msg.seq;
      this.queue = this.queue.filter(c => c.seq > msg.seq);
      this.hostSigs.clear();
      this.speed = msg.speed; this.paused = msg.paused; this.players = msg.players || [];
      this.waiting = false;
      this.onEvent({ kind: 'loaded', game: g });
    } else if (msg.t === 'turn') {
      for (const c of msg.cmds) if (c.seq > this.minSeq) this.queue.push(c);
      this.queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
      for (const [t, q, f] of msg.sigs) this.hostSigs.set(t, [q, f]);
      this.upTo = Math.max(this.upTo, msg.upTo);
      this.speed = msg.speed; this.paused = msg.paused;
      if (msg.players) this.players = msg.players;
    } else if (msg.t === 'result') {
      this.onEvent({ kind: 'result', msg: msg.msg });
    } else if (msg.t === 'refuse') {
      this.onEvent({ kind: 'refused', why: msg.why });
    }
  }

  get behind() { return this.game ? this.upTo - this.game.tick_ : 0; }

  /** Commands that run at the current tick, before the next step. */
  runDue() {
    const g = this.game;
    while (this.queue.length && this.queue[0].at <= g.tick_) {
      const c = this.queue.shift();
      if (c.at < g.tick_) { this.resync(`an order for tick ${c.at} arrived after tick ${g.tick_}`); return false; }
      applyCoopCommand(g, c);
    }
    return true;
  }

  /**
   * Catch up towards the host: at most `maxSteps` ticks. `beforeStep` lets the
   * caller keep per-tick UI work in line (it is not allowed to touch the game).
   * Returns how many ticks ran.
   */
  advance(maxSteps = Infinity, stepFn = (g) => g.step()) {
    if (this.waiting || !this.game) return 0;
    const g = this.game;
    if (this.behind > COOP_FAR_BEHIND) { this.resync('fell more than two days behind'); return 0; }
    if (!this.runDue()) return 0;
    let n = 0;
    while (g.tick_ < this.upTo && n < maxSteps && !this.waiting) {
      stepFn(g); n++;
      if (!this.check()) break;
      if (!this.runDue()) break;
    }
    return n;
  }

  /** Compare with the host's numbers for this tick, if it sent any. */
  check() {
    const g = this.game, t = g.tick_;
    const hs = this.hostSigs.get(t);
    if (!hs) return true;
    this.hostSigs.delete(t);
    const q = coopQuickSig(g);
    this.checks.quick++;
    if (q !== hs[0]) { this.resync(`signature mismatch at tick ${t}`); return false; }
    if (hs[1] != null) {
      this.checks.full++;
      if (coopFullHash(g) !== hs[1]) { this.resync(`full hash mismatch at tick ${t}`); return false; }
    }
    return true;
  }

  resync(reason) {
    if (this.waiting && this.game) return;
    this.waiting = true;
    this.checks.resyncs++;
    this.onEvent({ kind: 'desync', reason, tick: this.game ? this.game.tick_ : -1 });
    this.send({ t: 'resync', reason, tick: this.game ? this.game.tick_ : -1 });
  }
}

/** Load a host save text and hand back the Game (the id counters come with it). */
export function coopLoad(text) { return loadState(text).game; }
