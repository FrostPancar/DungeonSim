# Co-op play plan

Up to four players run **one colony together**. They share one treasury and stockpile, they can all
order the colony's units, and they can all build, research and trade at the same time. This
document covers the architecture, the refactor it needs, how to host it, and what could break it.

> **Status (2026-09-25).** A first playable version is built: see **§0**. The rest of this document
> is the full plan; §0 says which parts exist and which are still to do.

---

## 0. What's built

| Piece | Where | Notes |
|---|---|---|
| **Open to Co-op** in the in-game menu (☰) | `ui.js` `openCoop`, `showGameMenu` | Shows a **4-digit code** and who's in. *Close co-op* ends it. Up to 4 players. |
| **Join World** on the title screen, top right | `ui.js` `showTitle`, `titleJoin`, `joinCoop` | Digits only, Enter joins. Errors (no such world, full, wrong build) show under the box. |
| Co-op chip at the top of the screen | `#coopbadge`, `renderCoopBadge` | Code, player count, and for guests *in step* / *catching up* / *resyncing*. |
| Lockstep host and guest | `src/coop.js` `CoopHost`, `CoopGuest` | Host-clocked turns, orders stamped with the tick they run on (§2). No DOM, no network: the harness drives it directly. |
| Command layer (first cut) | `COOP_OPS` in `coop.js`, `UI.act()` | 40 game methods: building, designating, orders, priorities, research, arrivals, delves, trade, gear, crafting, spells. See the gaps below. |
| Transport | `src/net.js` | **Option A for now** (PeerJS over WebRTC, see §6): the site is static and nothing else is deployed yet. The code maps to the peer id `riftgate-coop-v1-<code>`. Big messages (saves) are gzipped and sent in 16 KB pieces. |
| **Desync fail-safe** | `coop.js`, **§7a** | Seed, build and protocol checked at join. A quick signature every in-game hour, a full-state hash twice a day, and an automatic resync from the host's save on any mismatch. |
| Tests | `test/harness.mjs` › *Co-op lockstep and the desync fail-safe* | A host and 3 guests over delayed links, random orders from all four for 3 days, a late joiner, and a guest knocked out of step on purpose. All end on the host's hash. |

**Not done yet, in order of how likely they are to bite:**
1. **Orders that don't go through `act()` yet.** These are the shop, merchant, blessing, upgrade and
   errand calls in `economy.js`, skill-tree buys and loadouts (`classes.js`), and direct writes
   such as `c.hold` (`ui.js:1542`), `c.belt` (`ui.js:3679`) and `bd.autoCrop`. When a *guest* uses
   one, only their screen changes. The next check notices within an in-game hour and resyncs, so
   the action is undone. When the *host* uses one, every guest resyncs to include it. Nothing is
   lost, but it isn't smooth either. These need the stable-id work (R6) before they can be
   commands.
2. **The host is the clock**, so a hidden host tab slows everyone (§5). The relay (option B) fixes this.
3. **Cross-browser floating point (R1)** isn't fixed yet. When it strikes, the fail-safe catches
   it and resyncs, but a resync every hour would be a bad experience. `dmath.js` is still Phase 0 work.
4. The time rules in §5 are simplified. Only the host sets speed and pause. A guest pressing them
   sends the host a "Player 2 asks you to pause" toast. Pause-on-fight is ignored on guests. The
   Steward (🤖 autoplay) is off in co-op, because its orders would only happen on one screen.
5. There are no roles, claims, player colours or undo log yet (§4).

---

## 1. What the code gives us today

These facts drive every decision below. They were measured on `main` @ `319242f`.

| Fact | Where | Consequence |
|---|---|---|
| The simulation is **deterministic**: one seeded `RNG`, fixed ticks, and optional systems use `rng.fork`. The harness checks that "same seed ⇒ same run". | `src/rng.js`, `Game.step()` | We can send **inputs** instead of **state** (lockstep). |
| A tick is cheap: about 0.2–0.6 ms late game. | `--bench` | Clients can re-simulate and catch up quickly. |
| The tick rate is 2.4 ticks/s × speed `{1, 3, 8, 20}`, so 2.4–48 ticks/s. | `ui.js` main loop | At 1× one tick is about 400 ms, which hides a lot of latency. At 20× one tick is about 21 ms. |
| A full save is about **1.4 MB JSON, ~140 KB gzipped** (day 20). | `save.js` `saveState` | A snapshot for joining is cheap to send once, but far too big to send every tick. |
| The UI **changes game state directly**: about 45 mutating `Game` methods, about 50 mutating `economy.js` exports, plus field writes such as `c.hold = …` and `c.belt = …` in `ui.js`. | `ui.js` | This is **the main refactor**. Every change must become a command (see §3). |
| `Math.random` appears only in cosmetic UI code (visitor sprites). | `ui.js:1168` | Fine, but it must stay cosmetic. |
| The simulation uses `Math.hypot` (66 calls outside `render.js`/`ui.js`), plus `sin`, `cos`, `pow`, `atan2` and `log`. **The seeded RNG itself uses two of them:** `rng.gauss()` calls `Math.log` and `Math.cos` (`src/rng.js:43`), and NPC level, hostility and social rolls draw from it (`npc.js:131/139/153`, `social.js:43`). | `src/*.js` | ECMAScript doesn't require these to give identical results in every engine, so Chrome, Firefox and Safari **may disagree** (see risk R1). A last-bit difference in `gauss` can round to a different whole number, and then the runs split for good. |
| Hosting is **static only**. Netlify serves `index.html` plus ES modules. (The repo has no Vercel config; if Vercel also serves the site, it's set up on Vercel's side.) | `netlify.toml` | A static host can't hold a WebSocket room. Networking needs something extra (see §6). |
| Save → load is already tested to **play on identically** (`test/harness.mjs` › *Saving and loading*: saved on day 6, and mid-fight on day 10). | `save.js` | Most of R3 was already in place. What it lacked was a hash of the whole state: one derived cache (`world._bcBuilt`) came back different after a load. It's no longer saved, so a game and its reload now hash the same. |

---

## 2. Architecture: host-clocked deterministic lockstep

Every client runs the full simulation. The only things sent over the network are **commands**
("build a smithy at 40,22", "move colonists 3 and 7 to 12,9"). One authority, the **sequencer**,
decides which tick each command runs on. Every client applies the same commands on the same tick,
so every client computes the same world.

```
player A ─cmd─┐                      ┌─► A: runs ticks ≤ T, applying batch
player B ─cmd─┼─► SEQUENCER ─ turn ──┼─► B
player C ─cmd─┘  (stamps tick T,     └─► C
                  broadcasts         (hash every 300 ticks ─► sequencer compares)
                  {T, cmds[], speed})
```

**Why not send state instead?** A diff of a 1.4 MB world at up to 48 ticks/s is expensive and
complicated. Lockstep costs a few hundred bytes per second, and the determinism it depends on is
already tested.

### The turn protocol
- The sequencer runs the clock. Each **turn** covers `k` ticks, sized to about 100 ms of wall time
  (1 tick at 1×, about 5 ticks at 20×). It broadcasts
  `{turn, firstTick, lastTick, speed, paused, cmds: [{tick, player, seq, op, args}]}`.
- A client may simulate up to `lastTick` of the newest turn it has received, and no further. A slow
  client falls behind but **doesn't stall anyone else**. Because ticks are cheap, it catches up by
  running several ticks per frame.
- **Input delay:** a command sent at local tick `t` is scheduled for the next turn the sequencer
  hasn't sent yet. At 1× that is effectively instant (under 1 tick). At 20× it is about 5 ticks
  (about 100 ms). The issuing client shows the order at once as a *ghost* (a dotted path or a
  translucent building), so the game feels responsive.
- **Ordering:** commands are sorted by `(tick, player, seq)`, and that order is part of the turn
  packet. Clients never reorder them.

### Desync detection and recovery
- Every 300 ticks (about 2 in-game hours), each client sends `hash(gameState)`. A 32-bit FNV hash
  over a canonical walk of `encodeGame(game)` is enough, and it's cheap at that interval.
- If one client's hash disagrees with the host's: pause that client, ask the host for a gzipped
  snapshot, reload it, and replay the queued turns. Keep a **desync log**: the tick, the first
  differing top-level key found by diffing `encodeGame` output in dev builds, and the last 50
  commands. Silent drift is the worst failure a lockstep game can have, so it must be loud in
  development.

---

## 3. The command layer (the main refactor)

Every change a player can make has to go through **one function**:

```js
// src/commands.js
export const COMMANDS = {
  build:        (g, p, { x, y, id, mapId }) => g.viewOf(g.mapById(mapId)).build(x, y, id),
  orderMove:    (g, p, { ids, x, y, mapId }) => g.orderMove(ids, x, y),
  buyPotion:    (g, p, { shop, id }) => ECON.buyPotion(g, ECON.shopsOf(g)[shop], id),
  setHold:      (g, p, { ids, on }) => setHold(g, ids, on),     // was a direct write in ui.js:1542
  setBelt:      (g, p, { id, belt }) => setBelt(g, id, belt),   // was a direct write in ui.js:3679
  // …about 100 entries in total
};
export function applyCommand(game, cmd) { … validate, run, return {ok, msg} }
```

Rules:
1. **Arguments are plain data only**: ids, coordinates and strings. Object references aren't
   allowed, because `S.apothecary` on one client isn't the same object on another. Items are
   referred to by stable id, not by array index. Today `buyItem(i)` and `equip(idx)` use indexes,
   which is a double-click race in multiplayer (see R6).
2. **Checks run when the command executes, not when it's issued.** Two players spending the same
   gold is resolved by order: the first command succeeds, the second fails with "Costs 85 gold",
   and that message goes **only to the player who issued it**.
3. **Single-player uses the same path**: `ui → applyCommand` locally with no delay. This removes
   "works in solo, desyncs in co-op" bugs and makes every session replayable (seed plus command
   log). That also helps with bug reports.
4. **Enforce it.** Add a harness test that runs the UI smoke test with the `Game` object frozen
   through a proxy that throws on any write outside `applyCommand` or `step`. That catches the
   next `c.hold = on` before it ships.
5. `autoplayStep` becomes a command source for one seat ("AI player"), or is turned off in co-op.

This refactor is worth doing **even if co-op never ships**: it gives replays, undo for build
orders, and deterministic bug repros.

---

## 4. Players, control and conflicts

**What players share:** the world, resources, research, buildings, colonists, the Rift, and time.

**What each player keeps locally:** camera, which map they're viewing (the Surface or a Rift floor),
selection and squad, open panels, the tutorial, alert filters and hotkeys.

### Controlling friendly units
- Any player can order any colonist, beast or mercenary. That is the fun, low-friction default.
- **Soft claims:** ordering a unit marks it with that player's colour for 60 s ("Mira: Player 2").
  If another player orders a unit someone else claimed, both players get a toast. The order still
  goes through, and the newest order wins. Nothing is ever locked, because locks deadlock when
  someone goes AFK.
- **Squads:** a player can *pin* up to 6 colonists as "my squad" (the colour persists). Idle-job AI
  still uses pinned colonists; only direct orders are affected by the pin.
- Expedition parties and delves record who launched them, so the Rift tab can show "Player 3's
  delve on F4".

### Building simultaneously
- There is one shared job queue (`designate`, `build`, priorities). Ghost blueprints show the
  author's colour.
- Placement is checked at execution. If two players place on overlapping tiles in the same turn,
  the first command wins and the second gets a "blocked" toast.
- Research: one shared current project and queue. Changing the current project shows "Player 2
  switched research to Militia" to everyone.

### Decisions only one player can make
Arrivals (accept or reject), prestige paths, class choices, caravan orders and rift gate choices.
- **Default: first-come.** Every player sees the prompt, and the first answer wins and is announced.
- **Optional host setting "vote on big decisions"** for prestige and permadeath-level choices, with a
  30 s timer where silence counts as abstain.

### Permissions (host setting)
| Role | Can do |
|---|---|
| Host | Everything, plus kick, roles, save and load |
| Builder (default) | Everything except deleting or selling buildings, dismissing colonists and selling from the Stash above N gold |
| Guest | Order units, designate, and chat. No spending. |

Griefing isn't a big concern among friends, but *accidents* are. With four people clicking, someone
will sell the smithy. Record destructive commands in a **shared "last 10 actions" log with undo**
where undo is safe (building removal refunds, market sales within 30 s).

---

## 5. Time: the biggest design conflict

Pausing and speed are shared, so one player's preference affects all the others.

- **Speed:** the host controls it. Other players can *request* a speed, which shows a chip; the host
  clicks to accept.
- **Pause:** any player can pause (for an emergency). A pause lasts at most 20 s unless others agree,
  and a player gets at most 3 pauses per in-game day. After that it becomes a "request pause". The
  UI shows who paused the game.
- **Pause-on-fight** (`opts.pauseOnFight`) becomes a **host setting**, not a per-player one.
  Otherwise the first player who sees a fight freezes everyone. A friendlier default in co-op is
  "slow to 1× on fight" instead of pausing.
- **Tabbed-out players:** a background tab throttles `requestAnimationFrame`. A guest simply falls
  behind and catches up on return. The host tab must **not** be the clock (see §6); if it is, keep
  it alive with a `Worker` timer or the whole room stalls.

---

## 6. Hosting options

Netlify and Vercel stay as the static CDN for the game files. Multiplayer needs a meeting point in
addition.

| Option | How | Cost | Pros | Cons |
|---|---|---|---|---|
| **A. Peer-to-peer WebRTC, host is a player** | The host's browser is the sequencer. Signaling goes through PeerJS's free cloud or a tiny Netlify Function for room codes. | $0 | No server to run, and the lowest latency on a LAN. | About 10–20% of NAT pairs need a TURN relay (paid, or the connection fails). If the host closes the tab the room is gone. The host tab gets throttled in the background. |
| **B. Tiny relay on Cloudflare Workers + Durable Objects** (or PartyKit, which runs on the same platform) ⭐ | One Durable Object per room. It holds the WebSocket connections, **is the sequencer** (it stamps turns), and stores the latest snapshot and the command log since then. It never simulates. | Free tier likely covers a hobby game. Well under $5/mo for thousands of sessions. | No NAT problems. The room survives the host leaving and rejoining. Joining is a URL (`/play?room=K7QZ`). The clock isn't a browser tab. | One small server to write (about 300 lines) and deploy. |
| **C. Authoritative headless server** | Node runs `Game` (the harness proves it runs headless) and streams state or validates commands. | A VPS or container per room: $5–20/mo and up | Makes cheating impossible, and a server-side autosave is the real save. | Overkill for co-op among friends. Needs a state-sync bandwidth plan. It also runs the simulation *twice* on every client. |

**Recommendation:** use **B**. It's cheap, needs no NAT handling, and moves the clock off a
browser tab. Keep the transport behind an interface (`send`, `onTurn`, `onSnapshot`) so **A** can
be added later for LAN or offline play without touching the game code.

### Room lifecycle (option B)
1. The host clicks **Host co-op**, and the relay creates room `K7QZ`. The host uploads a gzipped
   snapshot (140 KB) from a new or loaded game.
2. A friend opens `…/?room=K7QZ` and sends a handshake `{buildHash, name}`. If `buildHash` doesn't
   match, the friend gets "Host is on a different version, reload". *This has already happened
   once: two hosts ended up serving different commits.* After a successful
   handshake the friend receives the snapshot and the turns since then, catches up and starts
   playing.
3. The relay asks a client for a fresh snapshot every in-game day and drops older turns. That keeps
   joining fast and the command log small.
4. If everyone leaves, the room stays for 24 h and then expires. The host also has the regular
   local save.

`buildHash`: **done** as `COOP_BUILD`. `build.mjs` stamps a hash of the bundled source into
`riftgate.html`.

---

## 7. Risks that could break the game

| # | Issue | Impact | Mitigation |
|---|---|---|---|
| R1 | **Floating-point differences between browsers.** `Math.hypot`, `sin`, `cos`, `pow`, `atan2`, `log` and `exp` aren't guaranteed to give identical bits in V8, SpiderMonkey and JavaScriptCore. | Chrome and Safari players slowly desync. That breaks the whole design. | Add `src/dmath.js`. **Start with `rng.gauss()`**: it sits under every gaussian roll, so either give it a `log`/`cos`-free method (e.g. the sum of 12 uniforms minus 6, or a table-based inverse CDF) or route it through `dmath`. `hypot(a,b)` becomes `Math.sqrt(a*a+b*b)` (sqrt is exactly rounded by IEEE). Use table-based or polynomial `sin`/`cos` and integer `pow` where possible. Ban raw `Math.*` transcendentals in simulation files with a lint grep in the harness (`render.js` and `ui.js` are exempt: the camera zoom's `Math.exp` at `ui.js:456` is cosmetic). **World generation needs this too:** a joining player gets the starting map in the snapshot, but `dungeon.js`, `world.js` (`sin`/`cos`) and `floors.js` (`atan2`) run on *every* client whenever a new Rift floor is made. Run a **cross-engine CI check**: the same seed on Node (V8), plus Firefox and WebKit through Playwright, comparing hashes at day 10, **with at least one new floor made during the run**. Until then, the fail-safe (§7a) turns a drift into a resync instead of a broken game. |
| R2 | **A direct state write left in the UI** (like today's `c.hold`) | Instant desync the first time it's used. | Command-only rule plus the frozen-proxy test (§3). |
| R3 | **Save/load isn't perfectly lossless.** Derived caches (`jobsDirty`, path caches, occupancy) or RNG state rebuild differently after `decodeGame`. | A joining player desyncs straight away. | **Mostly already covered:** the *Saving and loading* suite checks that a reloaded run plays on identically, using a signature every 90 ticks. **Done now:** the co-op suite checks that a game and its reload have the same *full* hash. That caught `world._bcBuilt` (a cache), which is no longer saved. |
| R4 | Iteration order in `Map`/`Set`/object keys depends on insertion history. If the load path inserts in a different order, behaviour diverges. | Subtle desync after a rejoin. | Covered by R3's test. Iterate by sorted id in hot spots if needed. |
| R5 | **Autoplay-style infinite loops** (like the day-30 Apothecary loop) | In co-op, everyone's tab freezes on the same tick, and the room dies. | Use a tick watchdog in the sim's `while` loops, or a harness "max iterations" guard. Show a crash screen with a "report" button that attaches the seed and command log. |
| R6 | **Stale indexes in commands** (`buyItem(i)`, `equip(armoryIdx)`) | Player 1 buys item 2, the list shifts, and Player 2 buys the wrong item. | Give items, beasts and mercs stable ids. Commands refer to ids only. |
| R7 | Players fighting over a shared-state UI: research, speed, pause, pause-on-fight. | A frustrating session rather than a crash, but the most likely complaint. | §5 rules, visible "who did it" toasts, and host arbitration. |
| R8 | Destructive accidents or griefing: selling the smithy, dismissing colonists, spending the treasury. | The run is ruined. | Roles, the action log with undo, and a spend cap for non-hosts (host setting). |
| R9 | One-off decisions answered twice (two players accept the same arrival). | Double effects if a check is missing. | Each decision gets an id, and the command checks it's still pending when it executes. |
| R10 | **Host (sequencer) disappears**. | The room freezes. | Option B: the relay is the sequencer, so it's a non-issue. Option A: elect the next host and hand over the latest snapshot plus turns. |
| R11 | **Different game versions** between peers (two hosts serving different commits, a cached old bundle). | A certain desync that is hard to diagnose. | **Done:** `build.mjs` stamps a hash of the bundled source into `COOP_BUILD`, and the host refuses a guest whose build differs. The dev page (`index.html`, unbundled) reports `dev`. |
| R12 | Performance divergence at 20× on a weak client. | A laggy player is always behind and their commands arrive late. | Clients report how far behind they are. The host UI suggests lowering the speed, and above 30 s behind a client stops sending commands until caught up. |
| R13 | Local-only UI state leaking into the simulation. The tutorial's `noteTutorialEvent` and per-player alerts must not write to `game`. | Desync. | For now the full hash skips `game.tutorial`. Later, move tutorial state to `ui` or `localStorage`, keyed per player. |
| R14 | **Rift floors with 4 players:** players split across the Surface and F1–F9, so more maps are active at once. | Simulation cost grows with active maps, not with players. It's already handled, but watch it. | Keep `--bench` lines for four active floors. |
| R15 | Save ownership: whose save is the canonical one? | Arguments over a lost run. | The host's local save is canonical, and the relay keeps the latest daily snapshot as a backup. Guests can "export snapshot" for bug reports. |
| R16 | Bad-actor clients (a modded client sending illegal commands). | Low for co-op among friends. | Validation at execution already rejects illegal commands. Real anti-cheat is out of scope unless there is PvP. |

---

## 7a. The fail-safe: keeping every client on the host's numbers

Lockstep only works while every client computes exactly the same thing. This is the check that
proves they do, and the recovery for when they don't. **The host's numbers always win.**

### At the door: same seed, same build, same starting point
1. The guest says `hello {proto, build, name}`. The host refuses a guest with a different protocol or
   build ("reload the page, both of you"), when the room is full (4 players), or when the colony has
   fallen.
2. The host flushes its pending turn and sends a **snapshot**: `saveState(game)` (the whole game,
   **including the module-level id counters**), its `seed`, its `tick`, and `seq`, the last command
   already inside the save.
3. The guest loads it and checks that the seed and tick match what the host said. If they don't,
   it asks again. It drops any queued command with `seq ≤` the snapshot's.

So the seed isn't re-derived: the guest takes the host's whole state, RNG position included. Two
clients can't start from different numbers.

### While playing: two tiers of checks
| Check | Every | Covers | Cost |
|---|---|---|---|
| **Quick signature** | 60 ticks (1 in-game hour) | tick, RNG state, id counters, map count, log length, every colonist's position, HP and map, every raider, and every resource | ≈ 0.05 ms |
| **Full hash** | 720 ticks (½ day) | FNV-1a over `encodeGame(game)` plus the id counters: *everything that's saved*. The tutorial is left out (see R13). | ≈ 45 ms on day 3. Grows with the save. |

The host works out both **right after the step that reaches the tick**, before any command at that
tick runs, and sends them with the turn. A guest can't run past the last tick the host announced,
so it always has the host's numbers by the time it reaches that tick. It checks them at the same
moment: after the step, before that tick's commands.

### When a check fails
1. The guest stops stepping at once and sends `resync {reason, tick}`.
2. The host logs it (a toast names the player and the reason), flushes, and sends a fresh snapshot.
3. The guest loads it, keeps its camera, and carries on from the host's tick. It's back in step
   straight away, because nothing it did on its own survives the reload.

It also resyncs, without waiting for a check, when:
- a command arrives for a tick it has already passed (it can't happen on an ordered channel, so
  something is wrong), or
- it has fallen more than two in-game days behind. Loading a snapshot is faster than replaying.

### Why it is safe to be this blunt
- A snapshot is about 140 KB once gzipped late in a run (`net.js` gzips anything big), and it's sent in 16 KB pieces, so a resync takes
  well under a second on a normal connection.
- Resyncs never happen in solo play. In co-op they are rare, *unless* something is feeding them,
  and the chip and the host's toasts make that visible.

### Still to add
- A **desync report** in dev builds: the first differing top-level key (from diffing the two
  `encodeGame` outputs) plus the last 50 commands. A dev server should log it rather than silently
  heal it.
- The **same checks on the host's side**: have guests report their signature too, so the host can
  tell which guests are drifting.
- **Rate-limit resyncs.** More than 3 in 10 minutes should tell the player something is wrong
  (for example a browser engine difference, R1) instead of quietly fixing it again.

---

## 8. Balance with 4 players

The simulation is the same colony, so its cost and pace don't change. What changes is attention:
four players can micro four squads and four build sites at once, so progress speeds up.
- **Start without balance changes.** Playtest first.
- If it's too easy, add threat scaling by *active players*: `threat × (1 + 0.15·(players−1))` for
  raids and night waves, drawn with `rng.fork('coop')` so it stays deterministic.
- Features that suit co-op: parallel delves on different floors, a raid at the Surface while a
  party is below, and one player running the economy while the others fight.

---

## 9. Phased plan

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Foundations** (solo, no networking) | ✅ Full-hash save/load round-trip test. ⬜ `dmath.js` replacing transcendentals (the `rng.gauss` first), with the harness lint rule. ⬜ Stable ids for items, beasts and mercs. | The harness is green, and the cross-engine hash matches on Chromium, Firefox and WebKit through Playwright. |
| **1. Command layer** | 🟨 `COOP_OPS` + `UI.act()` cover the 40 game methods the UI calls. ⬜ `economy.js`, `classes.js` and direct writes. ⬜ The frozen-proxy test. ⬜ Command log plus seed ⇒ replay. | The UI smoke test passes with the game frozen through the proxy. A replay of a recorded session produces the same final hash. |
| **2. Local fake multiplayer** | ✅ Harness test: a host and 3 guests with random delay, random orders from all four, a late joiner through a snapshot, and a forced desync that heals. | Four simulated clients running random commands for 30 in-game days never desync (the test runs 3 days; lengthen it under `--bench`). |
| **3. Networking** | ✅ Option A (PeerJS) with the 4-digit code, the build check, turns, snapshots and hash checks. ✅ The Open to Co-op and Join World UI. ⬜ The option B relay. | Two browsers on different networks play a 1-hour session. *(Checked so far with two browser tabs over a stand-in transport; the real PeerJS service couldn't be reached from the build sandbox.)* |
| **4. Co-op UX** | Player colours, claims, ghosts, toasts, time rules, roles, action log with undo, decision prompts. | Playtest with 3–4 people, and fix the friction list. |
| **5. Polish** | Reconnect, host migration (if option A is used), co-op balance knobs, and crash reports with the command log. | — |

Phases 0 and 1 are worth doing even without co-op: they give replays, reproducible bug reports and
cross-browser correctness.

## 10. Open questions
1. Should co-op keep the permadeath and save-scum rules, or should the relay keep daily snapshots
   that anyone can roll back to?
2. Should a solo save be convertible into a co-op room and back? The format is identical, so this is
   probably yes.
3. Voice and text chat: build it in (cheap over the same socket) or leave it to Discord?
4. Mobile and touch players in the same room? The UI is keyboard-centric (keys-only orders).
