# Rift Gate — Progression & Teaching Roadmap

*Status: **mostly built** (2026-09-24). Built: P0-1 (Militia, cheaper Combat School, starting Class Tome, graduates stop being peasants), P0-2 (dummy drilling toward a Combat class), P0-3 (lair goal card, reward card, first-lair Class Tome, "Stash" for spare items, loot in packs shown), P0-4 (where-from / what-for on every resource, gold leads the resource bar with a per-day net, first caravan guaranteed by day 3, Library costs no gold), P1-1 in part (leather → bigger packs), P1-2 in part (class techs labelled by outcome), P1-3 (Gather / Search / Pilgrimage / Survey / Clear errands, ! on the map). Not yet: relic shrine, the Rift-shard choice, early gem/dust crafts, regrouping the tree by purpose, P2. Companion docs: `docs/tutorial-roadmap.md` (the guided first hours) and `docs/ui-roadmap.md` (how it all looks).*

This doc is the "what the player should be doing, and when" plan. It covers:
- the five problems players report;
- the data behind each one;
- a new progression spine;
- fixes, ranked by how much they matter.

---

## 0. How the numbers were gathered

- **Static audit:** a script walked `BUILDINGS`, `FLOORS`, `RECIPES` and `RESEARCH` in `src/data.js`. It counted every place each resource is spent, and the insight needed to reach each tech including all its prerequisites.
- **Simulation:** headless runs with `autoplayStep` on seeds `demo1` and `seedB`, 24–28 days each. A proxy on `game.resources` recorded every gold, leather and shard change and the function that made it.
  - The auto-player is a near-perfect player: it picks research instantly, sells to every caravan and never idles. **Real players will be slower than every day count below.** Read these as best-case figures.

---

## 1. The findings

### 1.1 Classing sits late, and looks later than it is

| Class route | Needs | Insight to reach it (incl. prerequisites) | Tech-tree column (of 5) |
|---|---|---|---|
| Temple (Cleric, Druid, Paladin) | Devotion | 260 | 1 |
| Mage School (Wizard, Warlock, Bard, Artificer) | Letters → Arcane Theory | 500 | 2 |
| **Combat School** (Fighter, Barbarian, Rogue, Ranger, Monk) | Masonry → Smelting → **Drill Corps** | **800** | 3 |
| Knight Academy (tiers 3–4, **Knight** prestige) | … → Martial Doctrine | 1,800 | 4 |

- The start is **1 Fighter and 5 peasants** (`demo1`). Any class change needs a school or a Class Tome, and the player starts with neither.
- In the sim, the peasant count went **4 → 3 by day 8, 2 by day 16, and 1 by day 28**. Even the auto-player classes one person about every 8 days.
- The route players expect for martial classes, the Combat School, is the deepest of the three. Its gate is named "Drill Corps", which doesn't say "classes".
- A school costs wood 60, stone 40 and iron 10. In the sim, iron fell from 120 to **3 by day 8** and stayed under 10 for the rest of the run. So even after the research is done, iron blocks the build.
- To enrol, the player goes to the colonist's portrait → **Skills** tab → the "Fighter tree ›" button → **Class** tab → enrol buttons. That's four clicks, and the buttons don't render at all until a school exists (`ui.js` `classChangeHtml`).

### 1.2 The Training Dummy doesn't connect to anything

- It's in `START_UNLOCKED` **and** in Drill Corps' `unlock` list, so the research unlocks something the player already has.
- Its job raises the **Melee** or **Marksman** *skill* (`colony.js:1037`). Class eligibility checks only the class's primary *attribute* ≥ 12 (`classes.js` `classRequirement`), so training never moves anyone closer to a class.
- Its tooltip says "Raises Melee and Marksman". "Knight" is a Fighter *prestige* at level 20 that needs the Knight Academy (1,800 insight). A new player sees a dummy on day 1 and no way to make fighters until much later.

### 1.3 Gold: where it comes from is hidden

Gold flow over 24 days on `demo1` (auto-player):

| Gold in | Share | | Gold out | Share |
|---|---|---|---|---|
| Selling to the caravan (`tradeSell`) | **66%** (745) | | Livestock (`buyLivestock`) | 26% (265) |
| Rift packs carried home (`unloadPack`) | 24% (274) | | Construction (`completeTask`) | 24% (248) |
| Work tasks (gold veins, props) | 10% (117) | | Potions (`buyPotion`) | 20% (207) |
| | | | Recruits at the gate (`acceptArrival`) | 20% (201) |
| | | | Forge tiers, daily wages and upkeep | 10% (104) |

- **Two-thirds of all gold comes from selling to a visiting caravan.** To do that, a player has to find the World tab → **Market** sub-tab while a caravan happens to be in town. Nothing in the game tells them selling is the main gold source.
- The balance swings hard: 51 gold on day 16, **465 on day 20**, then **5 on day 28**. For a player, this reads as "gold appears at random".
- 13 buildings cost gold, including the **Library**, which is unlocked from the start (5 gold) and which research can't run without.

### 1.4 Resources that pile up

How many buildings and floors spend each resource, and the auto-player's stock on day 28:

| Resource | Buildings/floors that use it | Other uses | Stock on day 28 | Verdict |
|---|---|---|---|---|
| Leather | **1** (Training Dummy) | Forge tiers | **168**, rising (183 in, 27 out) | Starved of uses |
| Food | 1 (Tavern) | Meals, animals | fine | OK: eating is its use |
| Gems | 7, all mid/late game | — | 116, rising | Idle through the early game |
| Arcane dust | 8, all mid/late game | Potions (1 each) | 130, rising | Idle through the early game |
| Relics | 4, all ≥ 1,400 insight away | Selling | 25 | Idle until late |
| Cloth | 6 | Worked Goods output | fine | OK |
| Rift shards | 0 (turned into insight automatically) | — | — | Invisible; the player never makes a choice about them |

- Wood (51 users) and stone (41) carry everything.
- Iron (10 users) runs out. It's the real bottleneck, and nothing says so.

### 1.5 Loot and "finishing" a dungeon

- **Loot** means two different things in the code, and both are invisible:
  - resources in each delver's `pack`, which only count once carried back up (`unloadPack`);
  - items pushed into `game.armory`, which is named the same as the **Armory** shop building.
- **Finishing** means killing the lair boss on the **last floor**. There are always as many floors as the **Rift level**, and the Rift gains a level every **4 days** (`RIFT_DAYS_PER_LEVEL`). So the finish line moves, and no screen says where it is today.
- The reward for breaking the lair is big, and the only notice is a line in the log:
  - a 3× loot hoard;
  - 2 pieces of gear;
  - 4 + depth Rift shards;
  - **two nights with no wave** (`lairReward`).
- In the sim, the **first full clear came on day 16** (after 10 delves). A real player may never know it's possible.
- For days 1–4 the Rift has **one floor**, so the lair is only one floor down. That's the cheapest, safest window to teach the goal, and today nothing points the player at it.

### 1.6 The world map offers nothing to go and get

- 17 site kinds. Only the **4 settlement kinds** can be visited, through five errands (Trade, Recruit, Heal, Tribute, Fund walls).
- **All five errands cost gold**, so the only reason to leave home is to spend money.
- Resource sites (`quarry`, `lode`, `grove`, `herbfield`, `leyspring`) get `richness` and `reserve` values when generated (`overworld.js:536`), but **no code reads them**.
- Delves, ruins, barrows, wayshrines, landmarks, lairs and war camps have **no interaction at all**. They're scenery with a hover card.

---

## 2. The progression spine

One sentence per stage. Each stage has a visible **goal** (shown by the tutorial and objective tracker), a **reward** the player feels, and a **new verb** it unlocks.

| Stage | Days (target) | Goal shown to the player | Reward | New verb |
|---|---|---|---|---|
| **1. Make camp** | 1 | Beds, food, walls before dusk | Survive night 1 | Build, designate |
| **2. First delve** | 2–4 | Break the lair on floor 1 *before the Rift deepens* | Hoard, first gear, **2 quiet nights** | Delve, pack/loot |
| **3. First class** | 3–5 | Turn a peasant into a class | A second real fighter | Enrol, skill tree |
| **4. Trade** | 4–6 | Sell the haul to a caravan | The first big gold | Sell, buy, shop buildings |
| **5. Go out** | 6–10 | Visit a site on the world map | Resources, a Class Tome, a relic | Journeys |
| **6. Specialise** | 8–16 | Build a second school, and upgrade a shop | Mixed party, tier-2 gear | Schools, forge tiers |
| **7. Prestige** | 16+ | A level-20 hero takes a prestige path (e.g. Knight) | Prestige class | Academies |

The Rift deepens every 4 days, which already gives a natural clock. Stages 2–4 should fit inside the first two Rift levels.

---

## 3. Fixes, ranked by importance

**P0** = blocks understanding of the core loop. **P1** = makes a system worth using. **P2** = depth and polish.

### P0-1 Move classing to the early game
- **New tier-0 research, "Militia"** (≈100 insight, no prerequisite). It unlocks the **Combat School** and the **Training Dummy**. Drill Corps keeps the Watchpost and the +12% combat bonus, and moves to requiring Militia.
  - Target: the first classed peasant by **day 4–5** in the sim, down from about day 8.
- **Cheaper first school.** Either cut the Combat School to wood 40 / stone 30 / iron 4, or add a 1-tile "Drill Yard" starter school that holds one student. Iron is the resource that ran out (§1.4).
- **Start with 1 Class Tome.** The reagent and `readTome` already exist. It makes stage 3 possible on day 1–2 and teaches the concept before any school is built.
- **Class Tomes as rewards:** a guaranteed Class Tome in the floor-1 lair hoard the first time it's broken, and occasionally at ruins (see P1-4).
- **Balance check:** the harness's clear-rate band (25–95%) and 60-day survival must stay green. Earlier classes raise power, so re-check the `riftTargetDanger` curve.

### P0-2 Give the Training Dummy a clear job
- Take it out of Drill Corps' `unlock` (it's in `START_UNLOCKED` twice over) and gate it with Militia, next to the school it feeds.
- **Tie it to classing.** Drilling at the dummy grants "drill" XP toward the primary attribute of a Combat class, capped so it can only lift an attribute to 12. A peasant with STR 10 can *earn* Fighter eligibility.
  - The class tab then shows: "Needs STR 12 (has 10) — train at a Training Dummy."
- **Tooltip rewrite:** "Peasants drill here toward a Combat class. Classed fighters sharpen Melee."
- In the class tab, show the path to prestige: `Fighter → (level 20, Knight Academy) → Knight / Warlord`. That answers "why can't I make knights?"

### P0-3 Make "finish the Rift" a visible goal
- **Lair card on the Rift tab:**
  - "Lair: floor N";
  - rewards, with icons: hoard, 2 gear, shards, 2 quiet nights;
  - "The Rift deepens in X days (N+1 floors)".
  - The data is already there: `floorCount`, `rift.level`, `lairReward`, and `rift.level * RIFT_DAYS_PER_LEVEL + 1 - day`.
- **A reward moment when the lair breaks:** a modal or banner that lists the hoard (the data is in `delve.loot`), not just a log line.
- **Define loot once.** "Loot is what your delvers carry. It only counts once they walk it back out." Rename the item stash from `armory` (the player-facing label only) to **Stash**, so it stops colliding with the Armory shop.
- Show each delver's pack fill in the party panel, and a **"Loot waiting below"** marker on floors where a delver fell with a full pack.

### P0-4 Make gold legible
- **"Where from / what for" on every resource tooltip,** generated from data:
  - costs come from `BUILDINGS` and `RECIPES`;
  - sources come from a small table in `data.js`, e.g. `gold: ['Sell to caravans', 'Rift loot', 'Gold veins']`.
- **A gold ledger in the resource bar:** "+X / −Y per day (last 3 days)". The in and out calls are already central (`addResource`, `pay`), so it's cheap to record.
- **A guaranteed first caravan on day 3.** Its arrival alert reads "Caravan in town — sell your spare goods for gold." That's the source of two-thirds of gold, so the player should meet it on purpose.
- **Surface gold veins.** `gold` is already in `FEATURE_PRIZE`. Put a "💰 vein" highlight on the map and a one-time alert the first time one is revealed.
- **Take the Library's gold cost off,** or cover it from the starting 40 gold with a tooltip. Research must never be blocked by gold on day 1.

### P1-1 Give idle resources a job
Target: **every resource has ≥ 2 uses reachable before 500 insight.**

| Resource | New or moved uses |
|---|---|
| Leather | Bedroll and Bed (swap cloth → leather option), **Pack upgrade** (+pack capacity per delver: turns leather directly into more loot per delve), Stable saddles (pack beasts carry more), Forge tier "Leather" armour already exists: surface it |
| Gems / dust | Early "Ward Charm" craft at the Carpenter or Alchemy table (one-night buff to walls); the Crystal floor (gems + dust) surfaced in the build menu early; potions already use 1 dust |
| Relics | A **Relic Shrine** (small, early) that burns a relic for a week of a colony bonus; the Reliquary stays as the permanent late-game version |
| Rift shards | Make them a *choice*: turn in for insight (today's behaviour) **or** spend at the Rift gate to "attune" a party (+loot for one delve) |
| Iron | Flag it as the bottleneck: resource tooltip "Scarce — mine Iron veins, buy from caravans, or loot a Collapsed Mine" |

### P1-2 Research tree readability
- Group columns by **purpose** instead of dependency depth: **Classes · Defence · Economy · Farming · Arcane**.
- Put the class line first, and label its nodes by outcome ("Combat classes", "Knight prestige") with the flavour name underneath.
- Give every research node an **outcome line** built from `unlock` and `bonus` ("Unlocks Combat School — train Fighters, Rogues, Rangers…").

### P1-3 Give the world map rewards
Turn existing scenery into things worth a trip. All of these reuse `sendJourney` and `journeyDays`.

| Site | New errand | Reward |
|---|---|---|
| Quarry / Lode / Grove / Herb Meadow / Ley Spring | **Gather** | Brings back a share of `site.reserve` (the field already exists and is unused); iron from lodes answers §1.4 |
| Ruin / Barrow / Delve | **Search** (one-time, risky: combat roll with `simulateCombat`) | Relic, Class Tome, a named item |
| Wayshrine | **Pilgrimage** | A week-long blessing (mood, healing or ward) |
| Landmark (tower, keep) | **Survey** | Insight, and it charts nearby sites |
| War camp / Beast lair | **Clear** | A gold bounty, and that site stops raiding (`raidTimer`) |

- **Show the reward before the trip.** Every charted site's card lists its reward icon, and the map marks sites with a reward waiting (a "!" pip).
- **First-visit bonus:** the first Gather or Search at each site is doubled. That pays the player for exploring, not just for grinding the nearest site.

### P2 Later
- Class Tome drops scaling with Rift rank.
- A "Rumours" service at the Tavern that marks a site's reward on the map (a gold sink that feeds exploration).
- A Knight fantasy step before level 20: a "Squire" title at Fighter level 10 in the Combat School, with a visible bar toward Knight.

---

## 4. How we'll know it worked

Add these to the harness as soft metrics printed by the `--bench` run. Assert only the ones marked (A).

| Metric | Today (auto-player) | Target |
|---|---|---|
| Day the first peasant is classed | ~8 | ≤ 5 (A) |
| Day of the first lair break | 16 | ≤ 6 |
| Gold from the caravan / all gold | 66% | 35–50% (more from loot, sites and veins) |
| Leather stock on day 28 | 168, rising | < 80 |
| Resources with < 2 early uses | 4 (leather, gems, dust, relics) | 0 (A) |
| Journeys to non-settlement sites by day 20 | impossible | ≥ 2 |
| Research left orphaned or with no outcome line | — | 0 (A) |

---

## 5. Order of work

1. P0-1 and P0-2 together (research and data changes, tests, rebalance). This is the biggest change to how the game feels.
2. P0-3 and P0-4 (UI plus small data). They depend on the keyword and tooltip system in `docs/ui-roadmap.md` §3.
3. The tutorial (`docs/tutorial-roadmap.md`), written against the new spine.
4. P1-1, P1-3, P1-2.
5. P2.
