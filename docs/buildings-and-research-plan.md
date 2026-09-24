# Rift Gate — Buildings & Research Plan

*Status: draft, awaiting approval. Nothing in this document is built. Floors (§2) already shipped separately and are described here only for context — everything from §3 onward is proposed.*

---

## Contents

1. [The short version](#1-the-short-version)
2. [Where we are today](#2-where-we-are-today)
3. [New buildings: structure and decor](#3-new-buildings-structure-and-decor)
4. [New buildings: defense and turrets](#4-new-buildings-defense-and-turrets)
5. [New buildings: research and training](#5-new-buildings-research-and-training)
6. [Turret combat integration](#6-turret-combat-integration)
7. [The deeper tech tree](#7-the-deeper-tech-tree)
8. [Multi-tile structures and rendering](#8-multi-tile-structures-and-rendering)
9. [UI changes](#9-ui-changes)
10. [Build phases](#10-build-phases)
11. [Decisions I need from you](#11-decisions-i-need-from-you)

---

## 1. The short version

Today the colony has 35 buildings behind 21 research nodes, and the tree is shallow — almost everything is one or two steps from the start (`masonry → smelting → smithy`, the longest chain, is three). Beauty and defense are afterthoughts: one `statue`, one `barricade`, and siege strength is a flat multiplier from counting walls and doors, not anything the player builds toward.

This plan adds three things:

| Area | Today | After |
|---|---|---|
| **Decor** | One `statue`. Floors (shipped) give a tile its own beauty | Fences, banners, lamps, a small and a grand statue — cheap ways to make a room nicer, not just one endgame beauty building |
| **Defense** | Walls/doors/barricades are a flat `fortify` bonus in `resolveSiege`; nothing shoots back | **Turrets**: NPC-shaped defenders (built the way `beastAsCombatant` builds a beast) that fight in the siege roster, not just raise a multiplier |
| **Research** | 21 nodes, mostly 1–2 deep, few real choices | ~14 new nodes, chains up to 4 deep (`masonry → fortification → siege_craft → siege_mastery`), so there's a tech tree to climb, not a checklist |

Nothing here touches combat resolution, classes, or the Rift itself — it's additive to what exists, in the same `BUILDINGS` / `RESEARCH` tables and the same `STRUCTURE_CLASS` rendering pattern floors just extended.

---

## 2. Where we are today

| Piece | File | State |
|---|---|---|
| `BUILDINGS` (35), `cat` groups: structure, comfort, logistics, farm, production, martial | `data.js` | Flat table: `cost`, `work`, `solid`, `glyph`, and optional `light`/`beauty`/`job`/`hp`/`school`/`academy` |
| `RESEARCH` (21) | `data.js` | Flat table: `cost`, `req` (prereq ids), `unlock` (building ids), optional `bonus` |
| `FLOORS` (4: wood, stone, pebble, crystal) | `data.js` | **Shipped this session.** A layer under `BUILDINGS`, not gated by research — always available. Buildings can now sit on a floored tile |
| `STRUCTURE_CLASS` / `STRUCTURE_STYLE` | `render.js` | Adjacent buildings of one class read as one structure (a floor pattern, walls, a name plate) — 5 beds become a barracks, not 5 icons |
| `resolveSiege(game, defenders, raiders)` | `events.js` | `defenders = game.colonists.filter(...)`, a plain combatant array. Walls/doors/barricades only ever raise `ctx.partyDamageMult` (capped +0.35) — they are never combatants |
| `beastAsCombatant(b)` | `husbandry.js` | The pattern for shaping something that isn't an NPC into a `simulateCombat` combatant: `id`, `name`, `attributes`, `combat: {acc, dmg, armor, row, ...}`. This is what turrets will copy |
| Test coverage for buildings | `test/harness.mjs` | "every building has a cost and a work value", "every building is either available at start or unlocked by research", "no research is orphaned behind an impossible prerequisite" — new buildings and research must keep passing these unchanged |

**Why the tree is shallow today:** almost every node only gates 1–2 buildings and has 0–1 prerequisites. `masonry`, `husbandry`, `letters` and `devotion` all start with no prerequisites and fan out one level. There is no node that exists purely to gate a *later* node — every node is a leaf. That's the gap this plan closes.

---

## 3. New buildings: structure and decor

Cheap, early, and about making a base look and feel lived-in — the same job floors just started doing per-tile.

| Building | Cat | Cost | Work | Solid | Beauty / Light | Desc |
|---|---|---|---|---|---|---|
| `fence` | structure | wood 3 | 15 | ✅ | beauty 0.5 | A cheap timber line. Blocks like a wall but costs a third as much and has a third the HP — an early perimeter, not a fortress |
| `palisade` | structure | wood 4, stone 3 | 35 | ✅ | beauty 1 | Stone-braced fence. More HP than `wall`, less than nothing — a defensible line that isn't the full masonry cost |
| `banner` | comfort | cloth 4, wood 2 | 12 | ❌ | beauty 2 | Wall-hung, no footprint of its own beyond the tile. The cheapest beauty in the game, so a bedroom doesn't need a `statue` to stop being grim |
| `lamppost` | comfort | iron 4, stone 2 | 15 | ❌ | light 3, beauty 0.5 | A `brazier` without the warmth-adjacent gameplay text — pure light, cheaper, for lighting corridors and yards without also implying a cook-adjacent fire |
| `statuette` | comfort | stone 10 | 30 | ❌ | beauty 4 | A small statue. Where `statue` (beauty 12, cost 25 stone + 5 gold) is the endgame centrepiece, this is the one you can afford in week one |
| `monument` | comfort, unique | stone 60, gold 25, relics 5 | 220 | ✅ | beauty 20 | The late-game beauty building `statue` currently has to be. Unique (one per colony, like `portal` conceptually was) |

None of these need a behaviour hook — `light`/`beauty` are automatic (`world.recomputeLight()` already sums them the way it sums every other building). `fence` and `palisade` need nothing beyond `solid: true` and a wall-like `ART` entry (reuse `drawWall`'s technique with a thinner, wood-toned art rather than stone).

---

## 4. New buildings: defense and turrets

| Building | Cat | Cost | Work | Solid | Desc |
|---|---|---|---|---|---|
| `turret_ballista` | martial | wood 20, iron 15 | 90 | ✅ | A physical ranged defender. Fights in night sieges (§6) |
| `turret_arcane` | martial | stone 15, dust 20, gems 5 | 130 | ✅ | A magic ranged defender — resists what the ballista doesn't, so a wall of one turret type is a mistake |
| `watchtower` | martial, 2×2 | stone 40, wood 20, iron 10 | 160 | ✅ | Upgrade of `watchpost` (which stays as the cheap 1-tile version). Bigger early-warning radius (§7), and — once turrets exist — a natural place to *put* one, though turrets don't require it |
| `armory` | martial | wood 20, iron 15 | 80 | ❌ | Racked weapons and spare armor near the fight. Passive: defenders in a siege get a small `defenceBonus` while one exists, the way `watchpost` already grants "early warning gives a defensive edge" — same shape of bonus, different number |

### Why two turret types

A siege with only ballistas trains the player to always answer with ballistas; the arcane turret exists so `RES`-style match-ups (already the language `combat.js` speaks for colonists and monsters, per `docs/combat-overhaul-plan.md` §4) matter for base defense too, not just delving. Concretely: `turret_ballista` deals slash/pierce; `turret_arcane` deals a rolled element (fire/frost/storm), so a raider faction resistant to one is still open to the other.

---

## 5. New buildings: research and training

| Building | Cat | Cost | Work | Job | Desc |
|---|---|---|---|---|---|
| `archive` | production | wood 25, stone 15, dust 10 | 100 | — | Library upgrade. While one stands, `bonuses.researchRate` gets a flat add (stacks are unnecessary — `unique: true`), representing a proper stacks-and-shelves room rather than a reading nook |
| `observatory` | production | stone 30, dust 15, gems 5 | 140 | `research` | A second research workstation, for when one Scholar at the Library isn't the bottleneck anymore. Same `job: 'research'` hook `library`-adjacent buildings already use — `rebuildJobs()` needs no new branch, just another building with `def.job === 'research'` |
| `archery_range` | martial | wood 15, stone 5 | 60 | `train` | `training` currently rolls melee or ranged XP 60/40 (`game.rng.chance(0.6) ? 'melee' : 'ranged'` in `colony.js`). This is a second `job: 'train'` building that always rolls ranged — for a camp leaning Ranger/Artificer that doesn't want its trainees spending half their reps on melee |
| `proving_grounds` | martial | stone 30, iron 15 | 120 | `train` | The `training` yard's late-game upgrade: same job, higher `work` yield per tick (read: colonists doing the `train` job here gain XP faster). Not unique — a big colony can afford two |
| `herbalist_hut` | production | wood 10, herbs 5 | 50 | — | A small `bonuses.farmYield`-style add scoped to herbs specifically (a new `bonuses.herbYield`), so herb-heavy plays (Druid, Alchemy, potions) have a building to chase besides general farming tech |

None of these are new *systems* — `research`, `train` and yield-bonus jobs already exist (`kitchen`, `alchemy`, `training`, `herbalism`'s `bonus: {farmYield}` are the precedents). This section is "more of what's already there," which is exactly what a shallow-tree fix should be: new leaves on a taller tree, not new mechanics.

---

## 6. Turret combat integration

The brief for this section is `events.js`'s `resolveSiege`: turrets should "take part in night sieges... as NPC-shaped units the same way `husbandry.js`'s `beastAsCombatant` does." Concretely:

```js
// events.js, new — shaped like beastAsCombatant, not like a colonist
function turretAsCombatant(rec) {           // rec = {b, x, y} from world.findBuildings('turret_ballista' | 'turret_arcane')
  const arcane = rec.b.id === 'turret_arcane';
  return {
    id: 'turret' + rec.x + ',' + rec.y, x: rec.x, y: rec.y,
    name: { short: 'Turret', full: arcane ? 'Arcane Turret' : 'Ballista Turret' },
    race: 'construct', klass: 'brute', level: 1, traits: [], injuries: [],
    hp: rec.b.hp, maxHp: rec.b.hp, skills: {}, abilities: [],
    attributes: { str: 10, dex: 10, con: 14, int: 3, wis: 10, cha: 5 },
    hostility: 0, thoughts: [], relations: {}, xp: {}, passions: {},
    combat: {
      stat: 'ranged', acc: 6, dmg: [4, 9], dmgBonus: 2, armor: 8, init: 2, mult: 1, leech: 0,
      role: 'back', flee: 0,                 // never routs — it's bolted down
      row: 'back', range: 'ranged', dmgType: arcane ? 'fire' : 'pierce',
      tags: ['construct'], res: {}, immune: ['fear', 'charm', 'sleep', 'poison', 'bleed'], resist: {}, poise: 2,
      def: 6,
    },
  };
}
```

- `flee: 0` and the CC immunities matter: a turret is furniture with a stat block, not a person — it shouldn't retreat or panic, and (per `docs/combat-overhaul-plan.md`'s tag table, once that lands) a `construct` tag already implies most of this. Until then, listing the immunities explicitly is the "cheapest route."
- `resolveSiege`'s `defenders` becomes `[...game.colonists.filter(...), ...turretCombatants]`. Turrets are never removed from `defenders` by the "someone must stay behind" rule expeditions use — they're not colonists, they don't leave.
- If a turret's `hp` hits 0, don't route it through `killColonist` (that's colonist-shaped death logging, relations, graveyard). Instead: `rec.b.hp = 0; rec.b.done = false; rec.b.workLeft = def.work * 0.4;` — a destroyed turret becomes a fresh blueprint (cheaper than the first build, since the foundation survives), which a colonist can queue up again. No separate "destroyed" state needed; `workLeft > 0 && !done` already means "needs building" everywhere else in the codebase.
- `fortify` in `resolveSiege` keeps counting walls/palisades/fences the way it already counts walls/doors/barricades — the flat multiplier and the turret-as-combatant approach aren't in tension, they answer different questions ("how hard is it to reach the fight" vs. "what's in the fight").

---

## 7. The deeper tech tree

Fourteen new nodes. The goal is chains, not just more leaves — three of these are four deep from an empty tech list.

| Node | Req | Cost | Unlocks | Bonus |
|---|---|---|---|---|
| `fortification` | `masonry` | 140 | `fence`, `palisade` | — |
| `siege_craft` | `fortification`, `smelting` | 260 | `turret_ballista` | — |
| `siege_mastery` | `siege_craft` | 380 | — | `{ defence: 0.08 }` — turret `acc`/`dmg` read this the way `combat.js` already reads `bonuses.combat` for colonists |
| `arcane_engineering` | `high_arcana` | 320 | `turret_arcane`, `observatory` | — |
| `archival_science` | `letters`, `masonry` | 200 | `archive` | — |
| `marksmanship` | `drill_corps` | 150 | `archery_range` | — |
| `war_footing` | `marksmanship`, `siege_craft` | 300 | `proving_grounds`, `armory` | — |
| `grand_works` | `masonry`, `smelting` | 220 | `statuette`, `lamppost` | — |
| `high_masonry` | `grand_works` | 340 | `monument` | — |
| `decorum` | `husbandry` | 120 | `banner` | — |
| `herbal_science` | `herbalism` | 180 | `herbalist_hut` | — |
| `watch_discipline` | `drill_corps` | 200 | `watchtower` | — |

**The two four-deep chains:**
```
masonry → fortification → siege_craft → siege_mastery      (defense)
letters → arcane_theory → high_arcana → arcane_engineering (magic defense/research)
```
Everything else stays 2–3 deep, so the tree gains real shape (a defense branch, a decor branch, a research branch hanging off existing roots) without turning the early game into a slog — `fence`, `banner` and `decorum` are all cheap and close to the start on purpose.

**Test impact:** `test/harness.mjs`'s "Module integrity" describe block already walks `RESEARCH` for orphaned prerequisites and walks `BUILDINGS` for "available at start or unlocked by research" — every building above ships with exactly one `unlock` entry pointing at it, so both checks stay green with no test changes needed. The one new list to extend is the `startUnlocked` set in that same test file — nothing here should join it; everything is meant to be researched.

---

## 8. Multi-tile structures and rendering

Only `watchtower` is multi-tile (2×2); everything else is the existing one-building-one-tile shape.

- **`STRUCTURE_CLASS`** gets one new entry: `watchtower: 'tower'`.
- **`STRUCTURE_STYLE.tower`**: `{ floor: 'flags', walls: true, name: () => 'Watchtower' }` — same shape as every other entry in that table (§`render.js`, the table floors just added four new `FLOOR` entries next to).
- **Turrets are not structures.** A `turret_ballista` doesn't cluster with its neighbours into one named room — each is its own emplacement, drawn like `statue` or `brazier` (a single-tile `ART` entry), not routed through `computeStructures`.
- **`ART` entries needed:** `fence`, `palisade` (reuse `drawWall`'s silhouette technique at lower height/different tone — the same relationship `wall` and `barricade` already have), `banner`, `lamppost`, `statuette`, `monument`, `turret_ballista`, `turret_arcane`, `watchtower` (drawn as its structure base, like `barracks`/`library` are, plus a small platform/ladder glyph on its own tile), `armory`, `archive`, `observatory`, `archery_range`, `proving_grounds`, `herbalist_hut`. Fifteen small canvas functions, same size and shape as the ~35 already in `ART` — no new drawing *technique*, just more entries.
- **`BUILDING_ICON`** entries for every one of these except `fence`/`palisade` (walls stay iconless, per the existing rule that structural tiles are "scenery" — see `icons.js`'s comment on `BUILDING_ICON`).

---

## 9. UI changes

| Where | What |
|---|---|
| **Architect → Structure tab** | `fence`, `palisade`, `banner`, `lamppost` join `wall`/`door` and the floor gizmos (already there from §floors) |
| **Architect → Furniture tab** | `statuette`, `monument` join `statue` |
| **Architect → Production tab** | `archive`, `observatory`, `herbalist_hut` |
| **Architect → Security tab** | `turret_ballista`, `turret_arcane`, `watchtower`, `armory`, `archery_range`, `proving_grounds` — this tab goes from 7 buildings to 13, so it's the one that most needs the research tree to actually gate things, or it becomes an unreadable wall of gizmos on day one |
| **Tile inspector** | Turrets show a `Range`/`Damage type` row instead of the generic building block, the way a farm plot already gets a bespoke crop picker instead of the generic block (`ui.js` `inspTile`) |
| **Lore tab (tech tree)** | No new tab — just more nodes. Might be worth a "Defense" and "Beauty" grouping if the existing tree view doesn't already cluster by `cat`; that's implementation detail, not a decision this doc needs to make |

---

## 10. Build phases

| Phase | Content | Depends on |
|---|---|---|
| **1. Decor** | `fence`, `banner`, `lamppost`, `statuette`, `monument`, `palisade` + `fortification`, `decorum`, `grand_works`, `high_masonry` research. Lowest risk, no combat surface | — |
| **2. Research & training buildings** | `archive`, `observatory`, `archery_range`, `proving_grounds`, `herbalist_hut` + `archival_science`, `marksmanship`, `herbal_science` research | 1 (shares `grand_works`-adjacent research work) |
| **3. Turrets** | `turret_ballista`, `turret_arcane`, `watchtower`, `armory` + `siege_craft`, `siege_mastery`, `arcane_engineering`, `war_footing`, `watch_discipline` research. `turretAsCombatant`, `resolveSiege` wiring, the destroyed-turret-becomes-blueprint behaviour | 1, 2 (needs the tree to already be a bit deeper so turrets don't feel like the *only* new thing) |

**Testing**, same shape as the floors work this session: `Module integrity` (buildings have cost/work, unlocked, no orphaned research) needs no new tests, just stays green. New tests: a siege with turrets present beats the same siege without them (`resolveSiege` outcome comparison, same pattern as `test/harness.mjs`'s existing reckless-vs-cautious loot/death comparisons), and a destroyed turret re-enters `rebuildJobs()` as a `build` job.

---

## 11. Decisions I need from you

1. **Two turret types, or one?** The arcane/ballista split (§4, §6) is the "cheapest route" version of match-ups mattering for base defense; a single generic `turret` is simpler and still an improvement over zero.
2. **`monument` as a unique building** (one per colony) — worth it, or should late-game beauty just stack more `statue`s?
3. **Destroyed turrets rebuild from a discount, cheaper than new** — or should losing a turret in a wave mean paying full price again, which is harsher but simpler (no new "half-cost rebuild" cost math)?
4. **Security tab getting crowded** (§9): gate more aggressively behind research so it grows in step with the tree, or ship all six security buildings and let research availability alone control pacing?
5. **Build order**: I'd go 1 → 2 → 3 as listed (decor and research buildings are low-risk and ship fast; turrets touch combat and should land once there's already a deeper tree around them). Turrets first would show off the flashiest new thing soonest, at the cost of shipping the riskiest piece first.
