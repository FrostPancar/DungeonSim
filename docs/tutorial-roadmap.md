# Rift Gate — Tutorial Roadmap

*Status: **built** (2026-09-24) in `src/tutorial.js`: the ten-step tracker, first-time tips, skip and replay. The research step became "Build a Library", because research can't start without one. It follows the progression spine in `docs/progression-roadmap.md` §2, and uses the UI pieces in `docs/ui-roadmap.md`.*

## 1. What exists today

- **No tutorial.** The only guidance is:
  - the alert stack (`ui.js` `alerts()`): 17 kinds of state warning, such as "Need research project" and "Caravan in town";
  - the tool hint strip (`renderHint`);
  - the `?` help overlay (controls and legend).
- The alerts are **reactive**: they say something is wrong, never what to do next.
  - Nothing mentions classes, loot, the lair, selling for gold, or the world map. Those are exactly the five areas players report as confusing.
- **What already works:** alerts are clickable, and they open the right drawer or select the right people. The tutorial should reuse that component, not add a new one.

## 2. Principles

1. **Do, don't read.** Every step is an action the player takes in the real game, on their real colony. There's no separate tutorial map.
2. **One line, ≤ 12 words.** The step's text is an instruction, never an explanation. Explanation goes in the *completion* line, which appears only after the player has done the thing, when they care.
3. **Point, don't describe.** The target button or tile pulses (a CSS ring). The text never says "click the third tab from the left".
4. **Detect, don't confirm.** Each step completes itself by watching game state. There are no "Next" buttons.
5. **Pause-free.** Night 1 is the only real danger, so step 1 keeps the clock at ×1 and nothing else stops time.
6. **Skippable and resumable.** A "Skip tutorial" button in the tracker header. State lives in the save file, so it survives reloads.
7. **Just-in-time over up-front.** Systems not needed in the first hour get a one-time **first-encounter tip** when they first appear (§4), not a tutorial step.

## 3. The guided path: 10 steps, about the first 5 days

The tracker is a pinned card at the top of the alert stack: an icon, one line of instruction, and a progress pip row (●●●○○○○○○○). Each completion shows a toast with the "why" line and a small reward, so the tutorial pays for itself.

| # | Instruction (≤ 12 words) | Pulses | Completes when | "Why" line on completion | Reward |
|---|---|---|---|---|---|
| 1 | Mark trees to cut — drag over them. | Build → 🌿 Harvest tool | ≥ 5 `harvest` designations | Wood builds almost everything. | — |
| 2 | Place beds for everyone before dusk. | Build → Furniture → Bedroll | beds/bedrolls ≥ colonists | Sleeping on the ground sours the mood. | +10 cloth |
| 3 | Survive the night. The Rift spawns at dusk. | Clock / threat meter | first dawn after a wave | Every night a wave comes. Walls and fighters hold it. | — |
| 4 | Build a Library (Build › Production): research needs one. | Build tab | a Library stands or is queued | Research unlocks buildings and schools. Try Militia. | — |
| 5 | Send a party into the Rift. | The Rift Gate on the map | the first colonist reaches floor 1 | Delvers carry loot home in their packs. | — |
| 6 | Break the lair before the Rift deepens. | The lair card (Rift tab) | the first `lairReward` | Lairs give a hoard and two quiet nights. | Guaranteed Class Tome |
| 7 | Read the Class Tome — make a peasant a hero. | That peasant's portrait → the Class action | the first `training` starts | Classes give skills, a tree, and better gear. | — |
| 8 | Sell spare goods to the caravan. | The caravan wagon / Market tab | the first `tradeSell` | Selling is your main source of gold. | — |
| 9 | Spend a skill point. | The ⭐ alert | the first `pointsFree` decrease | Every level gives a point. Pick a direction. | — |
| 10 | Send someone to a site on the world map. | World tab → a nearby site with a reward | the first non-settlement journey | The world is full of resources, relics and tomes. | First-visit bonus (progression P1-3) |

- **Steps 6 and 10 need progression work first:**
  - step 6 needs the lair card (progression P0-3);
  - step 10 needs site rewards (progression P1-3).
- **Until then, ship steps 1–5, 7 and 9**, with step 7 using a starting Class Tome (progression P0-1).
- **Timing guard:** if step 6 isn't done by the time the Rift reaches level 2 (day 5), the text changes to "Break the lair — now 2 floors down." The step stays, and the goal is simply harder. That also teaches the deepening clock.

## 4. First-encounter tips (just-in-time)

These are one-line toasts with a "More" link to the help page. Each shows **once per save** and never while a tutorial step is being worked.

| Trigger | Tip |
|---|---|
| The first colonist hits Hungry | Colonists eat meals from a Cookfire. Raw food works, but it's worse. |
| The first mood < 30 | Low mood slows work. Below 16, people break. Check "On their mind". |
| The first injury | Wounds heal faster in beds, and fastest in an Infirmary. |
| The first iron < 10 | Iron is scarce. Mine iron veins, loot a mine, or buy it. |
| The first gold vein revealed | 💰 Gold vein — mine it for coin. |
| Storage full (the existing alert) | Build a stockpile or shed. Full stores stop hauling. |
| The first school built | Enrol peasants from their portrait → Class. |
| The first level 10 | New tier open in the skill tree. |
| The first colonist lost below | Their pack is still down there. Send someone for it. |
| The first world site charted | Sites marked ! have rewards. Send a party. |
| The first shop built | Shops need a keeper. Assign one from the building. |
| The first research with no school | Classes come from schools. Research "Militia" to build one. |

## 5. Tone and copy rules

- Second person, present tense, a verb first: "Mark trees…", "Send a party…".
- Name UI elements exactly as they're labelled, **bolded in the tracker's keyword style** (see `docs/ui-roadmap.md` §3). The player then learns the words the game uses.
- No lore in steps. Lore lives in item and building descriptions.
- Numbers only when they're a goal ("2 floors down"), never as a lesson ("each floor adds 40% loot").

## 6. Build plan

1. **Data:** a `TUTORIAL_STEPS` array in a new `src/tutorial.js`: `{ id, text, why, target: selector | () => screen point, done: (game) => bool, reward }`. It's pure logic, so the harness can test that every `done` predicate can fire in an auto-play run.
2. **State:** `game.tutorial = { step, skipped, seenTips: Set }`, saved and loaded in `save.js`.
   - The simulation never reads it. It's UI-only, so determinism is untouched.
   - Rewards go through `addResource` / `reagents` on completion. That's the one sim-side effect, applied from the UI the same way the trade buttons are.
3. **UI:** the tracker card renders as the first entry of `renderAlerts()`, using the same markup with a new `tut` kind. A `.pulse` class goes on the target selector. The tip queue reuses `paintToasts()`.
4. **Tests:**
   - running an auto-play game completes steps 1–9 by day 12;
   - skipping stops all tutorial toasts;
   - tips never fire twice in one save.
5. **Help overlay:** add a "Replay tutorial" button, and a list of the tips already seen.

## 7. Success measures

- Watch someone play for 30 minutes (playtest):
  - they reach step 7 without asking what to do;
  - they can say where gold comes from;
  - they can say how to finish a dungeon.
- Instrument a local-only counter of how many steps are done and how long each took. Keep it in the save's stats so we can read it from shared saves.
