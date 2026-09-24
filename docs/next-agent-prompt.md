# Handoff prompt: Rift Gate, next round of changes

You're working on **Rift Gate**, a single-file browser colony sim. Everything you need to start is below, so you don't need to explore the codebase to get oriented. Read only the files named for each task.

## Ground rules
- **Source** lives in `src/*.js`: ES modules that run unchanged in Node and the browser.
- **Build** with `node build.mjs`, which writes `riftgate.html`. The build **fails on duplicate top-level names across modules**, so give new top-level functions and consts distinctive names. New modules must be added to `MODULES` in `build.mjs` in dependency order.
- **Test** with `node test/harness.mjs`: 384 assertions, about 70 s (macOS has no `timeout` command). Keep it green. The integration sweep asserts a clear rate between 25% and 95%, most colonies surviving 60 days, and a wave every night. Add tests for anything new, in the harness's `describe(...)` / `ok(...)` style.
- **Preview** with `preview_start {name: "deephold"}`, then open `http://localhost:8099/riftgate.html?seed=demo1`. `ui` (the UI) and `ui.game` (the game) are globals in the page. The inspector and drawer panels re-render every 400 ms, so click by screen coordinates rather than stale element refs.
- **Determinism** is tested. Never draw from `game.rng` in UI code or in optional systems; use `game.rng.fork('tag')`. The simulation (`game.js`, `colony.js`, `events.js`, …) must not touch the DOM.
- **Style:** comments explain *why*, in the existing voice; match the surrounding code.
- There's **no git**. `docs/combat-overhaul-plan.md` holds the design of the combat systems that were just built; don't redo that work.

## Code map (only what these tasks touch)
| Concern | Where |
|---|---|
| Frame loop and speed | `src/ui.js` `loop()` (~line 608): `steps = [0, 1, 3, 8, 20][this.speed]` ticks per animation frame. Speed buttons ~line 276; keys 1–4 ~line 239 |
| Time constants | `src/colony.js`: `TICKS_PER_HOUR = 60`, `TICKS_PER_DAY = 1440`. `src/game.js`: `DUSK_HOUR = 21`, `DAWN_HOUR = 6`, `get isNight()` (line ~175, **hardcodes 6 and 21**; switch it to the constants). The Rift clock (waves at dusk, biome roll at dawn) is in `Game.step()` under `if (this.minute === 0)` |
| Mouse and touch input | `src/ui.js` ~lines 100–210: `mousedown` (right/middle button = pan), `mouseup`, `contextmenu` (prevented), wheel zoom via `renderer.zoomAt`, touch handlers. Tool modes live in `this.tool.mode` ('select', 'mine', 'harvest', 'cancel', 'build', 'squad'). Area orders are in `applyArea`/`commitDrag` around line 450 (`g.designate`, `g.build`) |
| Selection and moving colonists | `ui.selectAt(x, y)`, `this.squad` (a Set of ids), `commitSquad()`. Check whether a move order exists: search `colony.js` for a player-issued task before adding one |
| Map rendering | `src/render.js` `Renderer`: a terrain cache (`TerrainPainter`), then `drawBuildings` → `drawGround` → `drawLighting` → `drawRift` → labels → `drawBeasts` → `drawRaiders` → `drawColonists`. Art is drawn in tile units via `tileSpace(sx, sy)` and the `ART` table. Adjacent buildings of one class form a structure: add to `STRUCTURE_CLASS` / `STRUCTURE_STYLE` to get floors, walls and a name plate |
| Buildings | `src/data.js` `BUILDINGS` (with `cat`, `cost`, `work`, `solid`, `light`, `beauty`, `job`, …) and `RESEARCH` (`req`, `unlock`, `bonus`). `src/icons.js` `BUILDING_ICON`, `TECH_ICON`. Tests require every building to be unlocked by some research or by `START_UNLOCKED` (`game.js`), and no research to be orphaned |
| Placement | `src/colony.js` `placeBlueprint()` (~line 91): **one building per tile** (`w.building[i]`). Floor is the building `floor` (Flagstone), so today nothing can go on top of a floor |
| Caravans | `src/events.js` `incCaravan()` sets `game.caravan = {name, site, stock, wants, livestock, trader, expires}`; it's purely abstract, with no map presence. The arcane peddler is `game.peddler` (`game.js` `tickMagic`) |
| Delves | `src/expedition.js`: `createExpedition`, `tickExpedition` (a room every 26 ticks), `resolveRoom`. Dungeon rooms carry `x, y, links, kind, layout` (`ROOM_LAYOUTS` in `src/biomes.js`, as ASCII grids) and `trait`. The Party tab already draws an SVG room map (`ui.riftMapSvg`, `ui.roomDetailHtml`) |

## Tasks, with the cheapest route for each

1. **Slow the game down: a 10-minute day, 5 minutes of day and 5 of night.**
   - Make the day/night split 12h/12h (e.g. `DAWN_HOUR = 6`, `DUSK_HOUR = 18`) and fix `isNight`/`canEnterRift` to use the constants.
   - Speed 1 should advance 1440 ticks in 600 s = **2.4 ticks per second**. In `loop()`, replace ticks-per-frame with a time accumulator: `acc += dt * 2.4 * mult[speed]`, then step while `acc >= 1`. Keep the existing fast-forward buttons as multipliers (e.g. ×1, ×3, ×8, ×20).
   - Leave the simulation's ticks-per-day alone, so tests and balance stay valid.
   - Colonist movement will look jumpy at this rate. Interpolate positions in the renderer only if it looks bad (`c.x/c.y` are tile ints; a `px/py` field exists on NPCs).

2. **Campaign view while a party is inside the Rift.**
   - Treat it as a render/UI mode, not a new simulation. Add `renderer.mode = 'colony' | 'campaign'`; enter it on launch, and leave it when `game.expeditions` is empty.
   - In campaign mode, draw the active expedition's dungeon: rooms placed at `room.x * K, room.y * K`, each drawn from its `ROOM_LAYOUTS[room.layout].grid` with the existing tile art. Draw corridors along `links`, and put the party token in room `exp.route[exp.routeIdx - 1]`. Visited and cleared state is on the room objects.
   - Reuse `TerrainPainter`'s techniques rather than inventing new art.
   - Add a button to peek back at the colony. Night waves still happen at home, so give the colony a way to alert the player.

3. **Merchants visible on the map.**
   - When `game.caravan` (or `game.peddler`) exists, spawn a purely visual sprite group: a wagon plus 2–3 people. Have them walk in from the map edge (`edgeSpawn` in `events.js`) to near `world.start`, and leave when they expire.
   - Keep them out of the simulation, i.e. no rng. Store their positions on the UI or renderer, or on a `game.visitors` list that nothing in the simulation reads.
   - Clicking them opens the Caravans drawer (`ui.drawer = 'trade'`).

4. **New mouse controls.**
   - **Left-drag:** pan the map in select mode. With a build or order tool, left-drag paints the area, as it does now.
   - **Right-button hold-and-drag:** marquee-select colonists (the current `dragMode = 'marquee'`).
   - **Right-click tap:** send the selected colonists to that tile. If the tile has a mineable rock or vein, a tree or plant, or a blueprint, issue that interaction instead (designate mine or harvest and prioritise it, or build).
   - Rewrite the three handlers around line 100. Update the help overlay (`?` key) and `README.md`'s controls table. Touch stays as it is.

5. **A new doc: `docs/buildings-and-research-plan.md`.** Write the plan first, in the same format as `docs/combat-overhaul-plan.md`, covering building structures and a deeper tech tree. **Don't implement anything from the doc until the user approves it.**

6. **Build on top of floors, and add wood, stone, pebble and crystal floors.**
   - Add a separate `world.floor` layer (a string id per tile, or a Uint8Array into a `FLOORS` table) instead of floors being buildings.
   - Migrate the existing `floor` building to a floor type, making sure placement, blueprints (floors need a build job too; check how `colony.js` creates build jobs from blueprints), `moveCost` speed bonus and beauty all read the new layer.
   - Render floors in `drawBuildings` step 1.
   - Add the four types with costs (wood, stone, stone/gravel, gems + dust) and different speed and beauty values.

7. **A library of new buildings.** Statues, fences, walls, turrets, research and training buildings, and so on.
   - Hold off until task 5's doc is approved; it defines the list.
   - Each building needs `BUILDINGS`, `BUILDING_ICON`, a research unlock, `ART` (and a `STRUCTURE_CLASS` entry if it's multi-tile), plus a behaviour hook where one exists: `light`/`beauty` are automatic, and jobs come from `job:`.
   - Turrets should take part in night sieges: `events.js` `resolveSiege` builds the defender list; add turrets as NPC-shaped units the same way `husbandry.js` `beastAsCombatant` does.

**Suggested order:** 1 → 4 → 3 → 6 → 2 → 5 → 7.

**When you finish, report:**
- what changed
- test results
- screenshots of the campaign view, merchants and floors
