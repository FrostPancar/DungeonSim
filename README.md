# Rift Gate — SSS Class Dungeon Colony Sim

A giant Rift has torn open in the world. You pitch a camp outside it.

**By day** the Rift is quiet: send a party of up to five through it. Its
interior is a different place every time — it reshapes at every dawn and after
every party goes in — and what they bring back builds the camp.

**By night** the Rift opens. Every dusk a wave of spawn pours out and walks on
the camp; at dawn whatever survives crawls back in.

**Every 4 days** the Rift deepens a level. Both what waits inside and what comes
out at night get worse, and it climbs the guild ranks as it goes — E, D, C, B,
A, S, SS — until it is what it always was: an SSS-class gate.

Every run generates a new region, a new Rift, new people and new livestock. One
NPC generator produces colonists, traders and Rift spawn alike; the only thing
that decides whose side someone is on is the **hostility meter**.

## Play it

Open **`riftgate.html`**. That is the whole game: one self-contained file, no
server, no network, no install.

- **Mac** — double-click it, or drag it onto Safari/Chrome.
- **iPad** — put it in Files (AirDrop/iCloud Drive) and tap it, or open it in
  Safari and *Share → Add to Home Screen* to run it fullscreen like an app.

It opens on a title screen with **three save slots**. Pick an empty one to
found a colony (a name and, optionally, a seed), or **Continue** a saved one.
Runs **autosave at every dawn** and whenever you leave the tab; `Esc` (or ⚙️)
opens the pause menu: save now, options, controls, save & quit. **When the
colony falls** (everyone dead, or everyone down at once) **its save is
deleted**: there's no loading past a wipe. Options: autosave, hover cards,
pause when a fight starts, damage numbers, reduce motion, edge fog.

`?seed=yourseed` in the URL skips the title and starts that exact run, unsaved.

### Controls
The screen is laid out like a war-table: resources top-left, colonist bar top-centre,
alerts down the right edge, date and speed bottom-right, and six main tabs along
the bottom — **Build · People · Colony · Research · Rift · World**. Related
panels are sub-tabs of one window (People: Duties, Roster · Colony: Overview,
Fields & Animals, Workshop, Chronicle · Research: Tech tree, Bestiary · World:
Map, Caravans). Hovering shows a small card for whatever is under the pointer
(💬 beside the speed controls turns these off); clicking something grows that
card into the full inspector, which always sits bottom-right. Clicking one of
your own people on the map selects them for orders instead — a yellow outline
marks the selection.

Everything on the map is a pixel sprite, outlined by allegiance: **blue** your
people, **red** hostile, **gold** traders, **green** your livestock, **pale**
wild animals, **amber** a colonist whose loyalty is slipping. Units slide between
tiles, and a tile holds one body — squads form up around a move order.

| | Mouse / trackpad | Touch |
|---|---|---|
| Pan | left-drag (in Select), middle-drag or space-drag · arrow keys | one-finger drag |
| Zoom | scroll wheel | pinch |
| Select for orders | click a colonist (yellow outline) | tap |
| Inspect | click a building, tree, rock or creature, or a portrait in the colonist bar (bare ground closes the panel) | tap |
| Select several | right-drag a box · shift to add · ⌘/ctrl-A for everyone | Squad tool, then drag |
| Move / interact | right-click a tile: sends the selection there (a dashed line shows the way). On rock, a tree or a blueprint the selection surrounds it and works it together, each extra hand adding speed; on an enemy they close in to fight; on a bed or bedroll they go to sleep there (each to their own bed) | — |
| Beast follows | select a tame beast, then right-click one of your people: it follows them around (right-click them again to stop) | — |
| Animal pen | Build › Farm › Animal Pen, then drag a rectangle: fence goes round the edge with a gate facing camp (each post costs the same as a timber wall) | — |
| Area order | pick it in Build, then left-drag | same |

Keys: `space` pause · `1-4` speed · `M` mine · `H` harvest · `X` cancel (orders
are keys only — then left-drag the area) · `B` build window · `G` squad ·
`W` people · `C` colony · `R` research · `T` Rift · `N` world · `O` soil/water overlay · `?` help and legend ·
`Esc` closes the innermost thing.

You start with **one knight and five peasants**. The knight is a fighter with a
skill tree; the peasants are unclassed labourers who work by day and **sleep
from dusk to dawn unless you order them to do something**. Classes come from
schools, tomes and recruits: the camp starts with **one Class Tome**, the
**Militia** research (a root of the tree) opens the Combat School, and peasants
who drill at a Training Dummy grow strong or quick enough for a Combat class.
**People › Classes** shows who can become what, with one click to enrol.

A **Getting started** tracker at the top of the alerts walks through the first
days, one line at a time. Skip it from its card, and replay it from the `?` help.
The Rift tab leads with the **goal**: break the lair on the bottom floor before
the Rift deepens, and what that pays. Places marked **!** on the World map have
something to go and get (resources to gather, ruins to search, camps to clear). Everyone has **stamina**: it drains while they're
awake, faster when they work, walk or fight. Low stamina slows work, movement
and swings, and at zero they collapse and sleep where they stand. Monsters tire
too: a hunter that chases long enough gives up and goes home.

Going through the gate, each colonist packs **two meals and a healing draught**
(if the stores have them) and fills their potion belt. Below, they eat only
from their packs, and leftovers come home with them. Deeper floors pay more.
Loot scales with depth, **Rift shards** grow only from floor 2 down (carried out,
each one is research done), and breaking a **lair** spills a hoard and two
pieces of real gear, and leaves the Rift too stunned to send a wave for two
nights.

The build menu shows what you haven't researched yet, greyed out with a lock.
Hover one to see which research it needs, and click it to queue that research.

Fights happen where people meet, blow by blow. Colonists who see something
hostile close in and fight on their own; right-click an enemy to focus it (a
red line shows who is after what), or give a plain move order to pull someone
out. `F` makes the selection **hold position** (⚓): they fight what comes into
reach and chase nothing. Shots at someone behind a wall, rock or tree are harder
to land (**cover**), and a **fight log** under the resources shows each blow. A colonist brought down lies where they fell for a few hours with a timer
over them, unless the wound kills them outright. Right-click a downed colonist
with someone selected and the nearest one **carries them to safety**: up every
flight of stairs if they're in the Rift, then to a bed in camp, where they
recover far sooner (a doctor's treatment helps too).

Hover almost anything — map tiles, colonists, animals, resources, portraits,
buildings, techs, notices, chart marks — for a live inspector with its stats.
An hourglass floats over anyone busy at a bench, a seam or a blueprint, and a
bar over the tile shows how far the job has got.

Research is a tech tree (click a locked tech to queue its whole prerequisite
path). The Rift is played, not auto-resolved. Its inside is a stack of
**floors**, one per Rift level. Each floor is a map of its own, carved for the
day's biome and dressed with seams, plants, chests, cages and altars, and its
monsters sleep at their posts until they see you. Select people and right-click
the Rift Gate (or pick a party in the Rift tab and press **Enter the Rift**).
They walk in and step onto floor 1, and from there you command them exactly as
in camp: move, mine, cut, open props, fight. Right-click stairs to go deeper or
back up. What they pick up goes in their packs and reaches the stores when they
climb out. A switcher under the colonist bar (or `Tab`) hops between the camp
and each floor, and the Rift tab lists the floors, who is on each and what's
left there, with a **Call back** button. A floor nobody stands on reshapes at
dawn, and the bottom floor holds the lair. The tab also shows tonight's wave and
the climb to SSS.
World › Map is a clickable region map and World › Caravans a two-sided market
for arrivals and traders. Colony › Fields & Animals shows fields as growing
plots and livestock in a pen, Colony › Workshop holds the forge, apothecary,
magic, reagents and armory, and Colony › Chronicle is a filterable timeline.
Research › Bestiary lists every monster met and what killing them has taught.

In People › Duties, 1 is done first and 4 last; click a cell to make it more
urgent, right-click for less. Clicking an alert selects the colonists it is
about or opens the tab that fixes it.

## Co-op

Up to four players can run one colony together.

- **Host:** open the menu (☰) and choose **🤝 Open to Co-op**. The menu shows a 4-digit code.
- **Join:** on the title screen, type the code into **Join World** (top right) and press Join.
  You get the host's colony as it is now, and you play it alongside them.

Everyone can build, designate and give orders. The host controls speed and pause; a guest who
presses them sends the host a request instead. The chip at the top of the screen shows the code,
who's in, and whether a guest is in step with the host. If a guest drifts out of step, it notices
within an in-game hour and reloads the host's colony automatically.

Players meet through PeerJS's public service and then connect browser-to-browser, so both need
to be online. Both must also be on the same build of the game. Shop, merchant and skill-tree
actions aren't synced for guests yet: they're undone at the next check. The design, what's built
and what's left are in [`docs/coop-plan.md`](docs/coop-plan.md).

## Development

```bash
node test/harness.mjs          # full suite (638 assertions)
node test/harness.mjs --bench  # + 120-day stability run
node build.mjs                 # rebuild riftgate.html from src/
```

`src/` holds ES modules that run unchanged in Node and the browser, so the whole
simulation is testable headlessly. `build.mjs` inlines them into the single file
and fails the build on any top-level symbol collision.

## Systems

| System | Notes |
|---|---|
| **NPC generation** | 14 ancestries, 17 classes, 45 traits, 12 backgrounds, 18 skills with passions, 6 attributes, generated gear |
| **Hostility meter** | One 0–100 scale for people *and* settlements; gates parley, recruitment, defection, trade standing |
| **The Rift** | One giant gate generated with the world; camp pre-built outside its mouth. Level rises every 4 days (rank E → SSS); a wave spawns at every dusk and withdraws at dawn; parties go in by day, as many as you like |
| **Rift floors** | One floor per level, each its own map (`src/floors.js`): 5 carve styles by biome (warrens, hubs, fortresses with built walls, long linear runs, caves), biome seams, plants and 16 kinds of prop, hidden traps, wildlife, and garrisons that sleep until they see you, then hunt. Contact starts a skirmish between the units nearby, resolved by the combat core. Floor 1 sits at about a third of the Rift's strength and the bottom lair at full strength; empty floors reshape at dawn |
| **Overworld** | Whittaker biomes from elevation/moisture/temperature; villages, towns, hostile camps, lairs, resource nodes — traders and wanderers come from here. The Rift is the only dungeon |
| **Camp basics** | 13 buildings open from day one: timber walls, stake lines, bedrolls, campfires, torches, rugs, planters, benches, a gaming table, shelves, a storage shed, wells (irrigate fields within 5 tiles) and scarecrows (+15% yield within 4) |
| **Colony** | 16 task kinds, job priorities, A* + reachability regions, needs, 25 mood thoughts, hauling, storage caps, mental breaks |
| **Farming** | 11 crops, 4 seasons, soil fertility that depletes and recovers, water, growth stages, crop failure out of season |
| **Husbandry** | 10 species, taming by skill check, pasture/trough/barn, grazing, breeding with inherited traits, products, butchery |
| **Delves** | Anyone can go down; packs carry loot out; hurt colonists break for the stairs; every trip is recorded (deepest floor, floors cleared, kills, haul). Permadeath |
| **Real-time combat** | Fights play out on the map (`src/realtime.js`). Each map keeps a combat field, and every unit acts on its own 6-tick clock through the combat core's own turn. Melee needs an adjacent enemy; bows and spells need 6 tiles and a clear line of sight; rows follow from who stands next to whom; blasts hit within 2 tiles of their target. Colonists close in, focus whatever you right-click, and break for safety under 25% HP. The fallen are downed (they get up later) or die. Turrets shoot from their tiles, a camp alarm rouses everyone when a wave hits, and camp is overrun only if nobody is standing to stop it. You see lunges, shots, floating numbers, telegraph rings and status icons |
| **Stat lines** | Monsters and beasts roll the same six attributes as people, from a build per family or species (giants strong, goblins quick, oozes slow; direwolves strong, hens not). The attribute a unit strikes with adds to its to-hit and damage, Dexterity to its initiative and defence, Constitution to its health. The inspector shows the line, the combat numbers it adds up to, and a difficulty rating against your strongest fighter |
| **Pens** | A dragged-out fenced rectangle with one gate. Tame stock with nobody to follow is given a pen with room (a head per 3 tiles inside), walks in through the gate and stays in; beasts following someone leave with them |
| **Beasts at war** | Give a war or pack beast a handler (inspector, or select someone and right-click the beast): it follows them through the gate and down the stairs, fights beside them, and pack beasts carry for them. War beasts at home turn out against waves |
| **Combat core** | Front/back rows, 8 damage types with resistances, 40+ statuses, combos, telegraphs and interrupts, poise, creature tags |
| **Monsters** | 127 monsters in 13 families, 41 encounter templates, elite affixes, drop tables, essences, trophies, a bestiary |
| **Classes** | 12 skill trees (4 tiers, 20 nodes each, take half), 2 prestige paths per class, level cap 40, schools and academies, Class Tomes |
| **Gear** | 6 slots, class-locked weapons/shields, armour weight and training, 5 rarities, elemental affixes, passives, 14 legendaries, forging, 17 potions, belts |
| **Rift biomes** | 15 biomes rolled daily (with surges), layout styles, room traits, harvest nodes, loot structures, biome waves, a Rift map |
| **Magic** | 30 general spells, scrolls and spellbooks, arcane peddler, Spellmason, Magic Lab spell designer |
| **Progression** | 16 research projects (Rift Lore and Rift Cartography weaken the waves), a Rift that levels with the days, nightly waves sized against *actual defender power* |

---

## Gold

Gold has no storage ceiling, and almost all of it goes on shops and on building and upgrading structures (see `docs/economy-plan.md`).

- **Forge tiers:** the Smithy makes the same Leather → Iron → Steel → Runed pieces every time. Steel needs the Smithy at level 2, and Runed at level 3.
- **Shops you build:** the Armory buys and sells rarer gear, the Apothecary potions, the Stable beasts, and the Tavern hires sellswords.
- **Upgrades:** shops and workshops grow to level 3, built by colonists and paid for when finished.
- **Visitors:** a drover, an arms dealer (who takes commissions), a curio dealer (Rift keys, relics), sellswords and pilgrims. A Trading Post brings them more often and fills standing orders from the caravan.
- **Services:** blessings, and raising the dead at a level-3 Temple. Also feasts, rumours, paid training, and journeys to settlements to recruit, heal, pay tribute or fund their walls.
- **Rift merchants:** neutral traders on some floors — a fence, a mimic, a bone broker, a cartographer, a deep smith, a fey hawker. Rob one and its kind stays hostile. Sealed vaults need a Rift key.
- **Counting House:** keeps gold safe from raiders and pays interest after a quiet week.

## Credits

Icons: [Shikashi's Fantasy Icons Pack](https://shikashipx.itch.io/shikashis-fantasy-icons-pack) by Shikashi (CC BY 4.0), based on designs from [game-icons.net](https://game-icons.net) (CC BY 3.0). The sheet is `assets/icons.png`; `src/pixicons.js` maps every emoji the game writes to a cell of it, or to one of the game's own sprites for creatures.

## What's left to do

### Balance (deliberately paused)
- [ ] Colonies still average ~16 deaths per 60-day year; survival is 5–6 of 6 seeds. Wants a gentler mid-game.
- [ ] Autoplay delves aggressively; a human pace would differ. Autoplay is a test driver, not a difficulty target.
- [ ] Livestock can exceed herd cap slightly when several litters land at once.
- [ ] Gold still has weak sinks now that livestock is buyable but little else is.

### Harmony gaps still open (from the audit)
- [ ] **Base building (6/10)** — no room recognition, no furniture quality, no multi-tile structures. Beauty feeds only one thought.
- [ ] **Economy (5/10)** — only 4 recipes; no crafted quality, no bills/quotas, no stockpile filters.
- [ ] **Social (6/10)** — no colony factions, leadership, feasts or families.
- [x] **Beasts in the Rift** — war and pack beasts follow their handlers down, fight and carry.
- [ ] **Hostility** — the player can't *act* on it: no gifts, prisoners, tribute or formal diplomacy.

### New systems not yet wired through
- [ ] **Scouting as an action** — sites are revealed by returning parties and an auto-reveal fallback; there is no dedicated scout mission.
- [ ] **Attacking hostile sites** — camps and lairs launch raids and can be seen, but cannot yet be assaulted to remove them.
- [ ] **Village quests / alliances** — settlements track standing and hostility but offer no contracts yet.
- [ ] **Overworld caravan routes** — caravans originate from real settlements but travel is abstract.
- [ ] **Animal products in recipes** — wool/milk/hide map onto existing resources rather than a dedicated chain.
- [ ] **Seasonal pressure on the colony** — winter cuts crops and grazing, but there is no temperature/heating system.

### Client
- [ ] Touch is implemented but **untested on real hardware** — verified only in a headless fake DOM.
- [ ] Overworld map is a small panel, not a full screen you can plan on.
- [ ] No audio.
