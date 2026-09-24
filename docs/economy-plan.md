# Rift Gate — Gold & Economy Direction

*Status: **built** (2026-09-23), in `src/economy.js`. This covers what gold is for, and the library of places to spend it.*

**What differed from the plan:**
- **Gold has no storage ceiling.**
- **Passive costs are light:**
  - classed colonists take 1 gold a day from level 6 and 2 from level 12;
  - each shop level above 1 costs 1 gold a day;
  - sellswords are paid their own wage.
  - A mid-game camp pays under 10 gold a day. Almost all gold goes on shops and on building and upgrading structures.
- **Upgrades are construction:** ordering one queues a build job, and the gold and materials are paid when it's finished. Shops, the Smithy, the Tavern, the Temple and the workshops (+20% work speed a level) all go to level 3.
- **Research:** a new **Commerce** opens the Armory counter and Trading Post (the Armory moved off War Footing). **Coinage** opens the Counting House. The Apothecary comes with Herbalism, and the Stable with Ranching.
- **Rift merchants** trade from the treasury back home. Maps light a whole floor, and robbing a merchant loots its stock when it dies.
- **Deferred:** ransom for captured colonists, expedition insurance, training beasts at the Stable, settlements growing from trade, and grand feasts raising standing everywhere.

---

## 1. The problem

Gold comes in steadily and has almost nowhere to go.

| | Today |
|---|---|
| **Comes in** | Selling to the caravan (`tradeSell`), monster drops, Rift props and lair hoards, windfall incidents, raiders' purses |
| **Goes out** | Caravan goods (`tradeBuy`), livestock (`buyLivestock`), the arcane peddler and the Spellmason (`buyMagic`), class-tree respecs |
| **Result** | By mid-game the colony sits on hundreds of gold. It makes nearly everything it needs itself, and the only shops are two visitors who come now and then. |

Gold should be the resource you **turn into what the colony can't make itself**: time, certainty, rarity, people and favours. Every outlet below is one of those five.

## 2. Principles

1. **Every outlet has a place, a rhythm and a limit.**
   - *Place:* someone or something sells it: a caravan, a village, a Rift merchant, a building you own.
   - *Rhythm:* when it's available: stock rotates daily or weekly, and visitors come and go.
   - *Limit:* stock runs out, prices rise with demand, and wages recur.

   No bottomless "buy power" button.
2. **Crafting is consistent; buying is rare.**
   - The **Forge** turns materials and a little gold into the *same* basic tiers every time, so it's predictable and plannable.
   - **Shops and merchants** are where the *rolls* live: rarer items, affixes, legendaries, curiosities.
3. **Buying and selling have a spread.** Shops buy for less than they sell (about 60% of the price). Standing narrows the spread; hostility widens it or shuts the door.
4. **Some sinks recur.** Wages, upkeep and tithes keep gold moving after the colony is built. They're never a death spiral: unpaid wages cost morale or loyalty, not lives.
5. **Gold never replaces the Rift.** The best items still come from delving. Gold buys the second-best reliably, or the best at a steep premium.

## 3. The outlet library

### A. Travelling traders (who comes to you)

Today there is one caravan type and the arcane peddler. They become a roster of visitors, each with their own stock table and arrival odds that the colony can influence.

| Visitor | Sells | Buys | Notes |
|---|---|---|---|
| **Bulk caravan** (today's caravan) | Food, wood, stone, iron, cloth, leather | Same, plus gear and meals | The steady baseline. A Trading Post makes it come more often |
| **Drover** | Livestock, including breeds with good traits (Prize, Hardy) | Animals, leather, wool | Replaces the buy-livestock button with a real visitor |
| **Arms dealer** | Uncommon/rare weapons and armour; ammunition and tier upgrades | Gear, trophies | Stock scales with Rift rank |
| **Curio dealer** | Relics, runestones, maps to Rift vaults, odd reagents | Relics, rift shards, trophies | Rare; pays well for trophies |
| **Arcane peddler** (existing) | Scrolls, books, potions, reagents | Dust, gems | Unchanged |
| **Sellsword band** | Mercenaries for hire (see E) | Nothing | Arrives more often when the threat is high |
| **Pilgrims** | Blessings (temporary buffs), shrine offerings | Food, meals | Arrive after a Temple or Shrine is built |

**Commissions:** pay a deposit (about 30%) to any visitor for a named item or animal. It arrives with that visitor's next trip, or the deposit comes back.

### B. Overworld settlements (where you go)

The World map already has villages, towns, freeholds and a standing with each. They become places a party can **travel to** (off-map, gone for days, like an expedition across the region).

- **Specialities by kind and biome.** Every settlement has a sales list: a hill town sells steel, a coastal village fish and salt, a freehold horses. Prices follow local scarcity.
- **Services only a settlement offers:**
  - **Hire and recruit:** buy out a volunteer's contract, so a new colonist joins, class and all. Expensive, and much more likely with good standing.
  - **Training:** pay a master to lift one skill quickly (days away, gold per level).
  - **Healing:** a temple cures permanent injuries for a large fee.
  - **Ransom:** buy back a colonist captured in a raid (a new raid outcome).
- **Diplomacy with gold:**
  - **Gifts** raise standing.
  - **Tribute** buys a season without raids from a hostile faction.
  - **Funding** a village's walls turns it into an ally that sends help when you're overrun.
- **Settlement growth.** Enough trade grows a village into a town, and a bigger place stocks better goods.

### C. Rift merchants (who waits below)

Some Rift floors generate a **neutral merchant**: a unit that doesn't fight unless attacked, set in a small camp or a vault room. They sell things only the Rift has, and pay in gold for what the party carries.

| Merchant | Found on | Sells | Buys |
|---|---|---|---|
| **Goblin fence** | Goblin warrens, early floors | Cheap potions, lockpicks, "slightly used" gear | Anything, at a bad price |
| **Mimic trader** | Any floor, rare | A chest of unknown contents at a fixed price, which might be a legendary | Gold only |
| **Bone broker** (lich) | Undead biomes, deep floors | Cursed gear (strong, with a downside), phylactery shards | Trophies, relics, at a premium |
| **Lost cartographer** | Any floor | Maps: reveal this floor's layout, lair and vault | Rift shards |
| **Deep smith** (dwarf ghost) | Mines and forges below | Rune tier upgrades that only work below floor 3 | Ore, gems |
| **Fey hawker** | Fey circles | Luck charms, charm-immunity, glamour dyes | Food, honey, flowers (odd tastes) |

- **Vaults:** locked rooms on some floors whose key is bought from a Rift merchant or a caravan curio dealer.
- **Risk and choice:** a merchant can be robbed. It fights, drops its stock, and that merchant kind is hostile on later floors for the rest of the run.
- **Pack space:** anything bought below goes into packs, so pack beasts (now following their handlers) matter more.

### D. Shop buildings (what you build)

Buildings that turn gold into things on your own ground. Each has a **stock or queue**, a **restock rhythm** and usually a **keeper**, a colonist assigned to it (skill improves prices or speed).

| Building | Role | What it does with gold |
|---|---|---|
| **Forge** (the Smithy grown up) | Craft: *consistent tiers* | Crafts the basic armour and weapon ladder the same way every time: **Leather → Iron → Steel → Runed** (see §4). Each tier costs materials plus a fixed gold fee. Reinforcing continues to exist |
| **Armory** (exists, gains a counter) | Shop: *rare gear* | Buys and sells uncommon-to-epic gear through a dealer network; stock rotates weekly and scales with Rift rank. Also sells tier upgrades cheaper than the Forge, but only in stock |
| **Apothecary** | Shop: *rare consumables* | Buys and sells potions, reagents and rarer brews (greater healing, antidotes, elixirs); restocks daily from herbs you deliver; the keeper's medicine skill lowers prices |
| **Trading Post** | Draws visitors | More frequent caravans, better prices; lets you post **standing orders** ("buy iron under 3", "sell food above 60 stock") the caravan fills automatically |
| **Tavern** (exists) | People and rumours | Hire sellswords by the day; buy **rumours** (tonight's wave, a floor's lair, the next visitor); recruiting board for volunteers |
| **Stable / Menagerie** | Animals | Buy trained war and pack beasts; pay to train a beast (skills: guard, carry, track) |
| **Counting House** | Keeps gold safe | Holds gold safe from raiders when overrun; a small weekly interest while the colony is at peace |
| **Temple / Shrine** (exist) | Favours | Tithes for colony-wide blessings (a week of +morale, +healing or wards); in the late game, **raise the dead** for a very large fee |
| **Spellmason** (exists) | Magic | Unchanged; copying books and inscribing scrolls cost gold |

### E. Services and upkeep (recurring)

These keep gold flowing after the build-out.

- **Mercenaries:**
  - hired from the Tavern, a sellsword band or a town;
  - fight like colonists, with no needs beyond food, and leave when unpaid;
  - wage per day scales with their level.
- **Wages:**
  - classed colonists above tier 2 expect a small daily wage;
  - unpaid, loyalty drifts down (the existing hostility system) — never desertion straight away.
- **Upkeep:**
  - shop buildings cost a little per week;
  - a shop that isn't paid for closes its counter until it is.
- **Training fees:** pay at the Combat School, Mage School or a town to speed up class XP.
- **Respec** (exists), **healer fees** at a town, **expedition insurance** (pay before a delve; the family of anyone lost gets compensated, softening the morale hit).
- **Festivals:** spend gold and food for a day off that lifts morale and ends breaks.

### F. Prestige and vanity

Gold spent for the colony's standing rather than power:
- **Monuments and statues** (exist) cost gold as well as stone.
- **Commissioned portraits and banners** raise beauty.
- **Grand feasts** raise standing with every settlement.

## 4. Items: consistent tiers vs rare finds

| Tier | Where it comes from | How it behaves |
|---|---|---|
| **Leather** | Forge (no research) | Fixed stats; cheap; everyone starts here |
| **Iron** | Forge (Smelting) | Fixed stats, +1 step; iron and a small gold fee |
| **Steel** | Forge (Grand Works) | Fixed stats, +2; iron, coal-equivalent and gold |
| **Runed** | Forge (High Arcana), or the Deep smith below | Fixed stats, +3; dust and gems |
| **Uncommon → Epic** | Armory, arms dealer, Rift merchants, drops | Rolled affixes (today's `generateItem`) |
| **Legendary** | Rift only (lairs, mimics), or a curio commission at a huge price | Named, unique |

The Forge answers "I need six people in decent armour by the next wave". The shops and the Rift answer "I want something special".

## 5. Pricing model

```
price = base (PRICES) × rarity × rank scaling × scarcity (settlement/biome) × standing modifier
sell-to-shop = price × 0.6 × standing modifier
```

- **Standing** moves the price by up to ±25%, and trading raises standing (`gainStanding` exists).
- **Stock:** each outlet has a stock table and a restock cadence (daily, weekly, per visit). Buying the last one raises the price of the next restock a little, for about a week.
- **Rift rank scales** the rarity of rare stock, not the price of basics.

## 6. Balance targets

- **Early game (days 1–15):** gold is scarce; the Forge's Leather/Iron tiers and the caravan are the main uses.
- **Mid game (15–40):** income of roughly 60–120 gold a day; spending on shops, mercenaries and training should use **70–90%** of it.
- **Late game:** big sinks: raise the dead, legendary commissions, Counting House interest balanced against wages.
- **Sweep metrics to add:** average gold at day 30 and day 60, and gold spent by category. The target is that no seed ends with more than about 3 days of income sitting unused.

## 7. Build order

1. **Forge tiers.** Deterministic basic armour and weapons. Gold fees on crafting.
2. **Armory and Apothecary counters.** Shop UI (one shared shop panel: stock, buy, sell, restock timer, keeper). Stock tables.
3. **Visitor roster.** Drover, arms dealer, curio dealer, sellsword band; commissions.
4. **Services.** Mercenaries, wages and upkeep, festivals, training fees.
5. **Rift merchants.** A neutral merchant unit on floors; vaults and keys; robbery consequences.
6. **Settlement travel.** Trade trips across the region; recruit, heal, ransom, tribute, funding.
7. **Counting House, temple favours, raise the dead.**
8. **Balance.** The sweep's gold metrics, and tuning the spreads and wages.

## 8. Open questions

- Should wages apply to peasants? (Suggestion: no, since peasants work for keep; classed colonists and mercenaries are paid.)
- Can a robbed Rift merchant's hostility carry across runs? (Suggestion: no; keep it per run.)
- Are settlement trips a party leaving the map (like the old expeditions) or a timer? (Suggestion: a party leaving, so it costs people, not just gold.)
