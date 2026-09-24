# Rift Gate — Real-Time Combat Plan

*Status: **built** (2026-09-23). This replaced the one-shot fight resolution on the camp and on Rift floors with fights played out tile by tile on the map.*

**What differed from the plan:**
- A **camp alarm** was added. With a wave in camp, everyone at home above 40% HP drops what they're doing and joins, because colonists asleep out of range used to sleep through their friends dying.
- Waves are now sized only against colonists **in camp**, not those down a floor.
- Downed colonists' needs pause while they lie there, and animal chases give up after 400 ticks. These fixed starvation deaths that the longer fights exposed.
- Monster ids reset with every new game, so a seed replays the same fights.

---

## Contents

1. [The short version](#1-the-short-version)
2. [Where we are today](#2-where-we-are-today)
3. [The combat field](#3-the-combat-field)
4. [Reach, rows and targets in space](#4-reach-rows-and-targets-in-space)
5. [Time: turns on a clock](#5-time-turns-on-a-clock)
6. [Who moves where](#6-who-moves-where)
7. [Falling, fleeing and dying](#7-falling-fleeing-and-dying)
8. [Camp sieges and turrets](#8-camp-sieges-and-turrets)
9. [What you see](#9-what-you-see)
10. [What changes in the combat core](#10-what-changes-in-the-combat-core)
11. [Tests and balance](#11-tests-and-balance)
12. [Build order](#12-build-order)
13. [Left for later](#13-left-for-later)

---

## 1. The short version

Today, when a hostile touches a colonist, `resolveSiege` (camp) or `resolveSkirmish` (floors) runs `simulateCombat`. The whole fight is decided in that one tick and the result is written back. On the map, nothing visibly fights: people stand next to monsters, and a moment later half of them are dead.

After this change a fight **happens on the map**:

| | Today | After |
|---|---|---|
| **When** | Resolved in one tick on contact | Plays out over seconds; every unit acts on its own clock |
| **Where** | Positions ignored; abstract front/back rows | Melee needs an adjacent enemy; ranged needs range and line of sight; rows follow from where you stand |
| **Control** | None once contact is made | Right-click an enemy to focus it, pull a wounded colonist back, bring more people in mid-fight |
| **Scope** | The whole group vs everyone within 6 tiles | Whoever is near enough is in it; more arrive and join as they get there |
| **Rules** | The combat core | **The same combat core**: abilities, statuses, combos, telegraphs, poise, potions, per-type resistances. Only *when* and *who can reach whom* change |

---

## 2. Where we are today

| Piece | File | Notes |
|---|---|---|
| `createBattle` / `runRound` / `takeTurn` / `simulateCombat` | `combat.js` | `takeTurn(S, u)` is one unit's whole action: upkeep (burn, poison, regen), morale break, charm and confusion, telegraph resolution, ability choice, basic attack, extra heads, potion belt. **This is the unit of real time** |
| Targeting | `combat.js` `reachable()` / `pickTarget()` | Every attack and ability picks targets through these. Melee is gated by rows (`frontHolds`) |
| Side lists | `S.A` / `S.B` | AoE, party-wide buffs, auras, heals and `friendlyTargets` all read these lists |
| Camp fights | `events.js` `tickRaiders` → `resolveSiege` | The wave walks to the camp; contact within 5 tiles resolves the whole thing. Turrets fight via `turretAsCombatant` |
| Floor fights | `floors.js` `tickFloorMonsters` → `resolveSkirmish` | Sleeping guards wake on sight and hunt; contact resolves the local skirmish |
| Colonist AI | `colony.js` `assignTask` | No notion of fighting at all; colonists keep working next to a monster |

## 3. The combat field

A new `src/realtime.js` gives each map a **field**: `m.field`, a map-local field like `world` and `raiders`. The field holds a persistent battle state `S` (the same shape `createBattle` makes) whose side lists grow and shrink as units join and leave.

- **Joining.** Every tick, anyone of ours and anything hostile within **7 tiles** of each other are engaged. Each gets a unit (`makeUnit`) the first time, with the biome's start statuses. Awake floor monsters, Rift spawn and raiders are hostile. Sleeping guards are not, until they wake.
- **Leaving.** A unit with nothing hostile within 12 tiles for 40 ticks leaves the field. Its HP is written back and its statuses fade.
- **HP.** While in the field, the unit's HP is the source of truth. It's written back to the NPC every tick, so bars and cards stay live.
- **Rng.** Floors use their own `m.rng`; the camp uses `game.rng`. Fights replay exactly from a seed.

## 4. Reach, rows and targets in space

Two small hooks in the core, both off by default so `simulateCombat` behaves exactly as before:

- **`S.spatial(a, t, range)`** is checked first in `reachable()`. For the field:
  - melee needs the target within 1 tile (2 with a `reach` weapon);
  - ranged and spells need 6 tiles and a clear line of sight (`lineOfSight`, moved into `world.js`);
  - fliers can be hit in melee from anywhere adjacent.
- **Rows are recomputed before every action from positions.** A unit with an enemy adjacent is `front`; anyone else is `back`. The row rules keep meaning something without special-casing: shieldwall and bulwark only count when engaged, and spores and guardians hit whoever is in the melee.
- **Local sides.** A turn runs against a *local* copy of `S`: the same log, rng, round and ctx, but `A`/`B` hold only the units within 8 tiles of the actor. AoE, party buffs, heals, auras and `friendlyTargets` therefore stay local. Anything the turn adds (summons, splits) is merged back into the field and placed on free tiles beside its maker.
- **`S.aoeFocus(u, targets)`** narrows an AoE to the enemies within 2 tiles of its primary target, so a fireball is a blast, not a screen wipe.

## 5. Time: turns on a clock

- **One round is 6 ticks.** The field keeps a round clock. Every 6 ticks it runs the core's round-start work (environment effects, lair actions, guardian and aura pulses, head regrowth, legendary charges) and round-end work (cooldowns tick down), taken out of `runRound` as `roundStart(S)` and `roundEnd(S)`. `runRound` becomes those two plus the initiative loop, so `simulateCombat` is unchanged.
- **Each unit acts every 6 ticks**, offset by its initiative so a fight doesn't pulse in lockstep. Haste makes it every 4, slow every 9, and chill adds a tick per stack. Stun, sleep and freeze still cost the turn through `takeTurn`'s own checks.
- A unit only takes its turn when it **can reach something**. Otherwise it spends the time moving (§6), and its turn waits until it's in reach. Upkeep (burn, poison, regen) still ticks every round whether it reaches or not, so walking away doesn't dodge a burn.

## 6. Who moves where

- **Colonists** get a new task, `fight`, ahead of everything but a player's move or travel order:
  - If something hostile is within 7 tiles and they're above 25% HP, they engage the nearest.
  - Melee closes to an adjacent tile. Ranged closes to within 5 tiles with line of sight, then holds.
  - Right-clicking an enemy gives an **attack order** (`order.attack`) that focuses that target until it falls.
  - Under 25% HP they break off: on a floor for the stairs up, in camp for the middle of camp.
  - A sleeping colonist wakes if the fight is on top of them.
- **Hostiles**, both floor monsters and Rift spawn, hunt the nearest colonist in reach. Rift spawn walk to camp until something is within 8 tiles. Ranged hostiles stop at range. The existing pathing and occupancy (one body per tile) do the rest.
- A player **move order still wins**. That's how you pull someone out of a fight.

## 7. Falling, fleeing and dying

- **A colonist brought to 0** rolls to survive (70%, +12% with an infirmary at camp), the same odds as today:
  - survivors are **downed**: they lie where they fell with 1 HP and an injury, can't be targeted, and get up after 400 ticks;
  - the others die.
- **A hostile brought to 0** dies where it stands. Its drops land on the ground at its tile to be hauled (or packed, on a floor). Bestiary and delve kills are credited, and XP is shared among our units in the field.
- **A unit that flees** (the core's morale break) leaves the field. A monster runs for home, or back to the Rift at camp. A colonist heads for safety as above.

## 8. Camp sieges and turrets

- The dusk wave walks out of the Rift, and fights happen wherever it meets people. The old camp-wide siege resolver goes away.
- **Turrets** become **static field units** at their tiles, built with `turretAsCombatant`. They reach 7 tiles with line of sight and never move. Their damage writes back to the building, and a destroyed turret goes back to a blueprint as today.
- **Fortifications** keep their camp damage bonus (walls, stakes, barricades, watchposts), now as the camp field's `partyDamageMult`.
- **Won:** when the last of the wave dies, the camp gets the existing "beaten off" thought, morale and stat.
- **Overrun:** Rift spawn that reach the camp centre with nobody of ours standing within 10 tiles loot the stores (the existing 35% theft) and go back into the Rift.

## 9. What you see

- **Attacks.** A melee attacker lunges toward its target. A ranged attack draws a streak (an arrow, or a coloured bolt for spells, tinted by damage type).
- **Floating numbers.** Damage floats up in white (yellow for crits); heals float up in green. Misses show "miss", and status hits show the status icon.
- **Casting.** Telegraphed abilities show a pulsing ring under the caster, so there's time to interrupt.
- **Status icons.** Up to three sit over each unit in a fight (burning, poisoned, stunned, and so on).
- **Downed colonists** lie on their side with a timer ring.
- **Hover card and inspector.** They show "fighting X" and the unit's live combat statuses.
- **The log** only records fights starting and ending, downs, deaths and kills of bosses or named enemies, so the chronicle isn't swamped.

## 10. What changes in the combat core

It stays a pure, deterministic resolver. Only additions:

1. `reachable()` checks `S.spatial` first, if present.
2. The AoE branch passes its targets through `S.aoeFocus`, if present.
3. `runRound` is split into exported `roundStart` / `roundEnd`, and `takeTurn` is exported. `runRound` still calls them in the same order, so `simulateCombat` gives identical results for the same rng.

## 11. Tests and balance

- **Reach and timing:**
  - An adjacent pair trades blows over many ticks, not all in one.
  - A ranged attacker hits from 5 tiles and can't shoot through a wall.
- **Movement and orders:**
  - A melee colonist walks to an enemy before hitting it.
  - An attack order focuses its target.
- **Casualties:** a downed colonist gets up; a killed monster's drops are on the ground.
- **Camp:** a night wave is fought on the camp map, and the wave-won bookkeeping happens. Turrets deal damage.
- **Replay:** two runs of the same seed match.
- **Balance:** the integration sweep keeps its current bands (most colonies survive 60 days, a wave every night, delves clear and retreat). Balance is tuned through ROUND_TICKS, engagement range and the camp damage multiplier until the sweep sits where it does today.

## 12. Build order

1. Core hooks and the round split. `simulateCombat` tests must stay green.
2. `realtime.js`: the field, join and leave, the clock, local turns, spatial reach, writeback, deaths and drops.
3. Colonist `fight` task, attack orders, break-off; hostile movement on floors and camp. Delete `resolveSkirmish` and the siege resolver's contact path.
4. Turrets, wave won or overrun.
5. Visuals: lunges, streaks, floating numbers, telegraph rings, status icons, downed pose.
6. Tests, sweep, balance, README and help.

## 13. Left for later

- Formation and stance controls (hold position, fire at will).
- Cover from walls and furniture.
- Pack beasts and war beasts fighting beside their handlers.
- Potion belts. For now the shared potion stock is used by the core's triage rule.
