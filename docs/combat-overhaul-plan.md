# Rift Gate — Combat Overhaul Plan

*Status: approved 2026-09-22 · **Phases 1–6 built** (combat core, monsters, classes & trees incl. prestige tiers 3–4, gear & potions, Rift biomes, schools & magic economy) · Phase 7 (balance pass) not started.*

> **Decisions (these override anything below that disagrees):**
> 1. **Level cap 40**, four tiers.
> 2. **4 active slots.** A class **starts with 1 base ability**; every other active (including the rest of tier 1) is **bought with skill points**.
> 3. **Third school line:** **Temple → Cathedral** teaches the divine classes (Cleric, Druid, Paladin). The Combat School keeps Fighter, Barbarian, Rogue, Ranger, Monk; the Mage School keeps Wizard, Warlock, Bard, Artificer.
> 4. **No hard armor penalties.** Armor weight is a stat trade (ARM up, INIT/DEF down), and each class has an *armor training* multiplier, so heavy classes get more out of heavy armor than light classes do.
> 5. **Shields are class-locked**, like weapons.
> 6. **Two prestige paths per class** from the start.
> 7. **Charm slot added** (6 gear slots).
> 8. **Combat stays auto-resolved**, with tactics presets.
> 9. **Build order 1 → 6** as listed in §17.

---

## Contents

1. [The short version](#1-the-short-version)
2. [Where we are today](#2-where-we-are-today)
3. [Combat core: the rules everything else plugs into](#3-combat-core)
4. [Elements, statuses and combos](#4-elements-statuses-and-combos)
5. [Creature attributes (tags)](#5-creature-attributes-tags)
6. [Classes](#6-classes)
7. [Skill trees and abilities](#7-skill-trees-and-abilities)
8. [Class schools, academies and class books](#8-class-schools-academies-and-class-books)
9. [Magic economy: merchants, Spellmason, Magic Lab](#9-magic-economy)
10. [Gear](#10-gear)
11. [Potions and consumables](#11-potions-and-consumables)
12. [Monster library](#12-monster-library)
13. [Encounter templates: monsters that fight together](#13-encounter-templates)
14. [Spawning, scaling and drops](#14-spawning-scaling-and-drops)
15. [Rift biomes](#15-rift-biomes)
16. [UI changes](#16-ui-changes)
17. [Build phases](#17-build-phases)
18. [Decisions I need from you](#18-decisions-i-need-from-you)

---

## 1. The short version

**The core loop this plan builds:** at dawn the Rift shows **today's biome**, for example *"Sunken Crypt, undead, weak to Holy and Crush"*. You pick a party whose classes, gear, elements and potions answer it. You send them in. Tonight's wave comes out of the **same** biome, so the camp prepares for it too.

What changes:

| Area | Today | After |
|---|---|---|
| **Combat** | Everyone hits everyone; armor is one number | Front and back **rows**, **8 damage types**, **resistances and weaknesses**, **25 status effects**, **combos**, **telegraphed** big attacks you can interrupt, and a stagger meter on bosses |
| **Classes** | 12 classes with 2 fixed abilities each | 12 classes, each with a **skill tree**: 4 tiers × (4 actives + 16 specializations), 1 point per level, you can afford about half. Classes decide weapons and stat growth |
| **Changing class** | Fixed at birth | Converted at a **Combat School** or **Mage School**, later upgraded to a **Knight Academy** or **Wizardry Academy** (which unlocks tiers 3–4), or instantly with a rare **Class Tome** |
| **Getting new abilities** | None | Bought from **magic merchants** and a **Spellmason** shop, or designed in a **Magic Lab** and written into books |
| **Gear** | Weapon + armor, quality grade | **Head, Body, Feet, Main hand, Off hand (shield/focus), Charm**. **5 rarities**, elemental affinities, armor passives, gear that grants or boosts abilities. **Only weapons and shields are class-locked** |
| **Potions** | One generic "potion" | About 16 potions: healing tiers, cures, elemental wards, throwables, battle tonics |
| **Enemies** | Every enemy is a humanoid NPC with a class | **~110 D&D-style monsters** in 12 families, each with stats, tags, weaknesses, abilities and drop tables. Humanoid factions stay as classed NPCs |
| **Enemy groups** | Random group from a faction | **28 encounter templates** (leader + minions + a twist), each pointing to a counter-strategy |
| **Rift interior** | 6 themes, abstract room graph | **15 biomes**. Each has its own layout style, environment rule, monsters, harvest nodes, loot structures and night wave. One is rolled each dawn and scales with the day |

**Suggested level cap: 40** (tiers at 1–10, 11–20, 21–30, 31–40), to match the Rift's 20 levels. Monster level ≈ 2 × Rift level, so a colonist should be around 2 × the current Rift level to be on par.

---

## 2. Where we are today

This is what already exists and what each part becomes. None of it is thrown away; most of it gets extended.

| Existing piece | File | What happens to it |
|---|---|---|
| `simulateCombat()`: rounds, initiative, d20 vs armor, abilities on cooldowns, flee, retreat, potion triage | `expedition.js` | Moves to a new `combat.js`. Gains rows, damage types, statuses, telegraphs and tags. **Still the single resolver** for delves and night waves |
| `ABILITIES` (28), `CLASSES` (17 incl. commoners) | `data.js` | The 28 abilities become the tier-1 nodes of the trees. Commoner classes stay treeless until converted |
| Skills (melee, arcana, faith…) | `data.js`, `npc.js` | **Kept.** A skill still scales the power of abilities that use it. Level decides *what* you can do; skill decides *how well* |
| `generateWeapon/Armor`, `QUALITY`, `ITEM_AFFIXES` | `npc.js`, `data.js` | Replaced by the item system in §10. Old quality grades map onto rarities |
| Factions (`wild`, `dead`, `cult`…) generating enemies | `data.js`, `npc.js` | Humanoid factions stay classed NPCs. `wild`/`dead` become **monster families** from the bestiary |
| `DUNGEON_THEMES` (6) + room graph generator | `data.js`, `dungeon.js` | The themes become 6 of the 15 biomes. The generator gains per-biome layout styles, room layouts and node/loot structures |
| Rift reroll at dawn and after each entry; danger calibration `riftTargetDanger()` | `game.js` | Kept. The biome is rolled at dawn and **held all day**; the layout still reshapes after each entry. Calibration keeps working because `powerOf()` learns about the new stats |
| Night waves from `riftFaction()` | `events.js` | Waves are drawn from **today's biome** wave table |
| Level-ups from `delveXp` (cap 24, slow) | `expedition.js` | New XP curve to level 40, with XP from kills, clears, defended waves and school training |

**New modules** (bundler order in parentheses): `elements.js` (after data), `items.js`, `monsters.js`, `classes.js`, `combat.js`, `biomes.js`, `magic.js`. All plain data plus pure functions, so they stay headlessly testable like everything else.

---

## 3. Combat core

Combat stays **auto-resolved**: you choose the party, loadout, stance and supplies; the dice do the rest. Depth comes from the matchup, the rules and the AI's use of them, not from micromanagement. (A tactics-preset layer is in §7.6.)

### 3.1 Unit sheet

Every combatant (colonist, monster, beast) resolves to the same sheet:

| Stat | Meaning | Comes from |
|---|---|---|
| **HP** | Hit points | Class hit die, CON, level; monster HP multiplier |
| **ACC** | Added to d20 to hit | Weapon skill, attribute, level, buffs |
| **DEF** | Target number to be hit (10 + DEF) | DEX, armor weight, shield, evasion buffs |
| **ARM** | Flat reduction of **physical** damage | Armor pieces, shield, natural armor |
| **RES** | Per-element multiplier: −50% weak · 0 · +25/50% resist · immune · absorb | Race, gear, tags, buffs |
| **INIT** | Turn order | DEX, armor weight, haste/slow |
| **POWER** | Multiplier on ability power | Governing skill, class passives, gear |
| **POISE** | Stagger meter that gates hard crowd control on big things | Size, boss flag |
| **ROW** | Front or Back | Class role; monster row |
| **TAGS** | Flying, Undead, Swarm… | Race, monster entry, gear |

Today, armor does both jobs (to-hit DC and damage reduction). Splitting it into **DEF** (avoid) and **ARM** (soak) is what makes evasive rogues and plated knights feel different.

### 3.2 Rows

- Each side has a **Front row** (max 3 slots; a Large creature takes 2) and a **Back row**.
- **Melee** can only target the enemy front row. The back row is only exposed once the front row is empty.
- **Reach** (spears, whips, some monsters) lets melee hit the back row.
- **Ranged and spells** can target anyone.
- **Flankers** (rogue, monk) have abilities that dive the back row.
- **Room shape** changes the rules (§15.4). A *Chokepoint* allows only 2 front slots; an *Open Hall* allows 4, and flankers can reach the back row freely.

Classes default to rows: Fighter/Barbarian/Paladin front; Wizard/Warlock/Ranger/Artificer back; Cleric/Druid/Bard back; Rogue/Monk flank. The party screen lets you drag members between rows.

### 3.3 Damage pipeline

```
raw     = weapon roll + attribute bonus
        × ability power × (1 + skill × 3.5%)      ← existing skill scaling kept
        × crit (×1.75 on natural 20 or crit effects)
split   → physical part (slash / pierce / crush) + elemental parts
physical: − ARM   (pierce ignores 30% of ARM; Sunder halves ARM)
element:  × (1 − RES)   (weak −50% → ×1.5 · resist 50% → ×0.5 · immune ×0 · absorb heals)
then:   Barrier absorbs first → HP
```

A weapon or ability can deal mixed damage. A Flaming Longsword does 80% slash and 20% fire, and its fire portion can apply **Burn**.

### 3.4 Turn structure

1. **Round start:** statuses tick (burn, poison, bleed, regen), auras pulse, **lair actions** fire.
2. **Initiative order.** Each unit gets one action: ability, basic attack, potion or item.
3. **Legendary actions:** bosses take 1–3 small extra actions per round, spaced between party turns.
4. **Round end:** cooldowns, durations, telegraph countdowns.

### 3.5 Telegraphs and interrupts (the core of the strategy)

Big enemy attacks are **announced one round ahead**: *"The dragon draws a deep breath…"*, *"The necromancer begins a raising chant…"*

- A **Stun, Silence, Freeze or Interrupt** landed on the caster before it acts cancels the attack.
- The party AI reacts on its own. Interrupters prioritise the charging enemy, healers pre-shield, and a **ward potion** of the right element gets drunk.
- This is where the Fighter's *Shield Bash → Interrupt* spec and the Wizard's *Counterspell* become valuable.

### 3.6 Poise (so bosses aren't stun-locked)

- Normal-sized non-bosses take hard CC (Stun, Freeze, Sleep, Charm, Petrify, Knockdown) normally.
- **Large, Huge and Boss** creatures have a **Poise** bar. Hard CC fills it instead of applying: Large needs 2 hits, Huge 3, Boss 4. When it fills, the creature is **Staggered** (loses its next action, takes +25% damage), then is immune to hard CC for 2 rounds.
- Soft CC (Slow, Weaken, Blind, Vulnerable) always applies, at half duration on bosses.

### 3.7 Threat and targeting

Today, targets are chosen by weighted random (front-line bias, marked, wounded). That stays, plus a **threat** value:

- Damage and healing done add threat. **Taunts** force targeting for 1–2 rounds.
- Mindless creatures ignore taunts 50% of the time. Clever ones (casters, leaders) **target healers and casters** more.
- Assassin-style enemies (Bugbear, Quasit, Intellect Devourer) prefer the back row.

### 3.8 What stays

Stances (Cautious/Balanced/Reckless), party-wide retreat, morale breaks, permadeath with drag-clear survival rolls, injuries, war beasts fighting through the same resolver, and the 30-round cap.

---

## 4. Elements, statuses and combos

### 4.1 Damage types

Eight types, kept to eight so the icons stay learnable.

| Type | Icon | Signature status | Usually strong against | Usually resisted by |
|---|---|---|---|---|
| **Physical: Slash** | 🗡 | Bleed | Beasts, unarmored | Skeletons, oozes (split!), constructs |
| **Physical: Pierce** | 🏹 | Armor-pierce 30% | Armored, flying (grounds on crit) | Skeletons, swarms |
| **Physical: Crush** | 🔨 | Stun, Shatter | Skeletons, constructs, frozen targets | Oozes, swarms |
| **Fire** | 🔥 | Burn | Undead, plants, trolls, ice things, webs | Fiends, fire elementals, red dragons |
| **Frost** | ❄️ | Chill → Freeze | Fire things, flyers (grounds), fast things | Undead, frost giants, white dragons |
| **Storm** (lightning + thunder) | ⚡ | Shock | Wet targets, constructs, water creatures | Air elementals, blue dragons, grells |
| **Nature** (poison + acid) | ☠️ | Poison | Beasts, giants, humanoids | Undead, constructs, oozes, fiends |
| **Holy** (radiant) | ✨ | Blind; bonus vs undead/fiends | Undead, fiends, shadows, vampires | Celestial-ish, some fey |
| **Shadow** (necrotic) | 🌑 | Weaken, Drain | Living humanoids, beasts, fey | Undead (immune), fiends |
| **Arcane** (force + psychic) | 🔮 | Sunder resists, Confuse | Constructs (force), incorporeal | Aberrations, gnomes, mages |

(Ten rows because physical is split into its three sub-types. There are 7 elements plus physical.)

### 4.2 Statuses

Unless noted, a status lasts **2 rounds**, and reapplying it refreshes the duration.

**Damage over time**
| Status | Effect | Stacks | Notes / counter |
|---|---|---|---|
| **Burn** | 20% of the applying hit per round, 3 rounds; **−50% healing received** | refresh | Removed by Wet or Frost. Spreads on death with the *Ember Echo* spec |
| **Poison** | 3% max HP per round per stack, **ignores ARM**, 4 rounds | up to 5 | Undead, constructs and oozes are immune. Antidote cures |
| **Bleed** | Damage each time the victim acts | up to 5 | Any heal removes 2 stacks. Constructs and oozes are immune |
| **Doom** | Shadow damage over time that grows each round | 1 | Only Cleanse or Holy removes it |

**Control (hard CC is gated by Poise, §3.6)**
| Status | Effect | Notes |
|---|---|---|
| **Stun** | Loses its next action | Crush crits, Shock on Wet, shield bash |
| **Chill** | −15% INIT and −1 ACC per stack; **3 stacks → Frozen** | Frost's build-up |
| **Frozen** | Skips 1 round; +50% crush damage taken (**Shatter** consumes it); immune to Burn | Flyers that freeze fall (Grounded) |
| **Sleep** | Skips turns until damaged | Elves and mindless immune |
| **Charm** | Attacks its own side for 1 round; breaks on damage | Countercharm, elves resist, mindless immune |
| **Fear** | 50% chance to skip its action; cannot taunt; may flee at low HP | Paladin aura, Fearless trait; mindless immune |
| **Confuse** | Random target, allies included | WIS reduces duration |
| **Root** | Can't change rows; flyers are Grounded; −3 DEF | Fire burns webs away |
| **Petrify** | Two-step: Slowed → Petrified (out of the fight). After the fight they're "Stone-stiff" until cured with a Stone Salve | Mirror shields reflect gazes; blind attackers are immune |
| **Silence** | Can't use spells (arcane or divine) | Counters casters; the Beholder's antimagic does this |
| **Engulfed** | Inside a cube or worm: takes acid each round, can't act; freed when the engulfer dies or takes 25% max HP | Burst the engulfer |

**Weakening**
| Status | Effect |
|---|---|
| **Slow** | Acts last; −1 action every 2nd round; −2 DEF |
| **Weaken** | −25% damage dealt |
| **Vulnerable** | +25% damage taken (Hunter's Mark, Expose Weakness) |
| **Sunder** | ARM halved (acid, rust, sunder attacks) |
| **Blind** | −40% ACC for melee, −60% for ranged; can't target Stealthed units |
| **Drained** | −10% max HP per stack until a long rest (shadow, undead) |
| **Grounded** | Loses Flying |
| **Wet** | +50% Storm taken, −50% Fire taken, removes Burn. Everyone is Wet in the Drowned Grotto |
| **Oiled** | The next Fire hit adds 2 Burn stacks (flask of oil) |

**Buffs:** Barrier (absorb shield) · Regen · Haste (extra action every other round) · Empower (+25% power) · Fortify (+ARM) · Evasive (+DEF) · Stealth (untargetable until it acts; its first hit crits) · Ward:*element* (+50% RES) · Inspired (+ACC/+damage) · Thorns (reflect melee) · Taunting.

### 4.3 Combos

Combos are what make party composition matter.

| Combo | Trigger | Result |
|---|---|---|
| **Electrocute** | Storm hits a **Wet** target | Stun + the shock chains to 1 more Wet target |
| **Shatter** | Crush hits a **Frozen** target | +100% damage; Frozen ends |
| **Steam** | Fire on a Chilled/Frozen target, or Frost on a Burning one | Both cancel; Blind on that row for 1 round |
| **Ignite** | Fire hits an **Oiled** target | 2 Burn stacks and a splash of Burn to neighbours |
| **Helpless** | Any attack on a Stunned, Asleep, Frozen or Rooted target | Auto-crit for Stealth and Backstab abilities |
| **Grounding** | Frost Freeze, Root, Pinning Shot or Storm crit on a flyer | Grounded 2 rounds: melee can reach it |
| **Consecration** | Holy on Undead or Fiend | Stops regeneration and Undying; adds Fear |
| **Spore Burst** | Fire in a spore room (Fungal Depths) | AoE Nature damage to **both** sides; a trade-off |

---

## 5. Creature attributes (tags)

Everything that fights carries tags. They are shown as icons in the inspector and the bestiary.

| Group | Tags |
|---|---|
| **Size** | Small (+1 DEF, −HP) · Medium · Large (2 front slots, Poise 2, cleave hits it twice) · Huge (Poise 3, immune to Root) · Gargantuan (Poise 4) |
| **Movement** | **Flying** (melee can't reach it unless it has Reach or the flyer is Grounded; it can dive the back row) · **Burrower** (emerges in the back row in round 1) · **Swimmer** (no penalty in flooded rooms) · **Wall-climber** (moves between rows freely) · **Incorporeal** (−50% physical; walks through rows) |
| **Senses** | Darkvision (ignores darkness penalties) · Blindsight (immune to Blind; sees Stealth) · Tremorsense · All-around vision (no flanking or backstab crits) |
| **Nature** | Undead (immune to Poison/Bleed/Fear; weak to Holy) · Construct (immune to Poison/Bleed/Charm/Fear/Sleep; weak to Storm and Crush) · Ooze (no crits against it; immune to Blind) · Elemental · Plant · Fiend · Fey · Aberration · Beast · Dragon · Giant · Humanoid · **Mindless** (immune to Charm/Fear/Sleep/Confuse; ignores taunts 50%) |
| **Defence** | Armored (+ARM) · Evasive · **Regenerating** (heals each round unless hit by its stopper element) · **Magic Resistant** (−50% spell damage and statuses) · **Undying** (may stand back up at 1 HP) · **Splits** (slash/storm divides it in two) |
| **Behaviour** | **Leader** (buffs its kind; killing it removes the buff) · **Pack Tactics** (+ACC per ally of its kind) · **Ambusher** (acts first, targets the back row) · **Summoner** · **Caster** (can be Silenced and interrupted) · Guardian (redirects damage from its master) · Coward · **Enrage** (below 30% HP: +50% damage) · **Alarm** (calls reinforcements) |
| **Legendary** | **Legendary Actions (N)** · **Lair Actions** (only in its own lair room) · **Phylactery or Revive** · **Multi-phase** · **Frightful Presence** · **Death Throes** (explodes when killed) |

**Races get tags too**, which makes ancestry matter in combat:

| Race | Combat identity |
|---|---|
| Human | +10% XP (existing *Adaptable*), +1 skill point at level 1 |
| Dwarf | Poison RES 50%, Darkvision |
| Elf | **Immune to Sleep, resists Charm**, Darkvision |
| Halfling | Resists Fear; *Lucky* rerolls a missed attack once per fight |
| Gnome | Arcane RES 25%, resists magic statuses |
| Orc | *Relentless*: drops to 1 HP instead of 0 once per fight |
| Tiefling | **Fire RES 50%**, Darkvision |
| Dragonkin | RES 50% to its **lineage element** (rolled: fire/frost/storm/nature), plus one breath ability |
| Goblin, Kobold | Small, Evasive, Pack Tactics |
| Risen (undead) | Undead tag |
| Construct | Construct tag |

---

## 6. Classes

A class decides four things:

1. **Which weapons (and shields) the character can use.** This is the only hard gear lock.
2. **Stat focus:** which attributes grow on level-up (primary +1 every 3 levels, secondary +1 every 5).
3. **Its skill tree** (§7).
4. **Its default row and role.**

### 6.1 The twelve classes

| Class | School | Row / role | Stat focus | Weapons (hard lock) | Shield | Comfortable armor | Elements / identity |
|---|---|---|---|---|---|---|---|
| **Fighter** | Combat | Front · tank or damage | STR / CON | Swords, axes, maces, spears, great weapons, bows, crossbows | ✅ | Heavy | Physical, taunts, interrupts |
| **Barbarian** | Combat | Front · bruiser | STR / CON | Axes, great weapons, hammers, throwing | ❌ | Medium | Physical, Rage, self-sustain, fear |
| **Paladin** | Combat | Front · holy tank | STR / CHA | Swords, maces, hammers, spears, great weapons | ✅ | Heavy | **Holy**, auras, protection |
| **Rogue** | Combat | Flank · assassin | DEX / INT | Daggers, short swords, hand crossbows, throwing | ❌ | Light | Physical + **Nature** (poison), stealth, crits |
| **Ranger** | Combat | Back · marksman | DEX / WIS | Bows, crossbows, spears, short swords, axes | ❌ | Medium | Physical, **anti-flyer**, elemental arrows, beasts |
| **Monk** | Combat | Flank · skirmisher | DEX / WIS | Fist weapons, staves, spears | ❌ | None (*Unarmored Defense*: DEF from WIS) | Physical + **Storm** (ki), stuns, dodges |
| **Wizard** | Mage | Back · blaster | INT / WIS | Staves, wands, daggers, orbs/tomes (off hand) | ❌ | Light | **Fire, Frost, Arcane, Storm** |
| **Warlock** | Mage | Back · curser | CHA / CON | Wands, rods, pact blades (swords), tomes | ❌ | Light | **Shadow, Arcane**, drains, curses |
| **Cleric** | Mage (divine) | Back · healer | WIS / CON | Maces, hammers, holy symbols (off hand) | ✅ | Medium–Heavy | **Holy**, heals, cleanse, anti-undead |
| **Druid** | Mage (divine) | Back · controller | WIS / INT | Staves, sickles, spears, totems (off hand) | ❌ | Light–Medium | **Nature, Storm**, roots, shapeshift |
| **Bard** | Mage | Back · support | CHA / DEX | Rapiers, short swords, hand crossbows, instruments (off hand) | ❌ | Light | **Arcane** (psychic), buffs, charm, sleep |
| **Artificer** | Mage | Back · engineer | INT / CON | Hammers, crossbows, wands, gadgets | ✅ | Medium | **Storm, Fire**, turrets, infusions |

**Commoners** (Laborer, Artisan, Scholar, Brute, Shaman) keep one basic ability and **no tree**. They're the pool you convert at the schools (§8).

**Humanoid enemies** (bandits, cultists, drow) use the **same trees** with auto-allocated points. A bandit mage at Rift rank B really does cast Fireball.

### 6.2 Armor comfort (soft, not a lock)

Anyone can wear anything. Armor **heavier than the class's comfort level** costs −2 INIT and −2 DEF per step, and **casters lose 15% spell power per step**. A plated wizard is allowed, just not optimal. *(Decision point: see §18.)*

### 6.3 Prestige (Academy tiers)

Tiers 3–4 (levels 21–40) are taught only at an **Academy** (§8), and each class gets a **prestige title** there:

| Class | Prestige title (v1) | Tier 3–4 direction |
|---|---|---|
| Fighter | **Knight** | Guardian stances, party-wide protection, charge |
| Barbarian | **Berserker** | Frenzy chains, rage at low HP, execute |
| Paladin | **Templar** | Holy ground, resurrection, anti-fiend |
| Rogue | **Assassin** | Executions, invisibility loops, poison mastery |
| Ranger | **Beastmaster** | Companion commands, multi-shot, trap mastery |
| Monk | **Grandmaster** | Quivering Palm, reflect, perfect evasion |
| Wizard | **Archmage** | Meteor, Time Stop, element mastery |
| Warlock | **Pactlord** | Summoned patron aspect, soul harvest |
| Cleric | **High Priest** | Mass resurrection, holy nova, divine intervention |
| Druid | **Archdruid** | Elemental shape, earthquake, storm call |
| Bard | **Maestro** | Party-wide haste, mass charm, encore (repeat last ability) |
| Artificer | **Battlesmith** | Iron Defender golem, cannon, mass infusion |

*Later:* two prestige paths per class (e.g. Fighter → Knight **or** Warlord). The data format supports it, but I'd ship one per class first.

---

## 7. Skill trees and abilities

### 7.1 Shape of a tree

```
TIER 1  (levels 1–10)         TIER 2 (11–20)         TIER 3 (21–30)*        TIER 4 (31–40)*
┌─────────┬─────────┬─────────┬─────────┐
│Active A │Active B │Active C │Active D │   ← 4 actives per tier
├─────────┼─────────┼─────────┼─────────┤
│ spec A1 │ spec B1 │ spec C1 │ spec D1 │
│ spec A2 │ spec B2 │ spec C2 │ spec D2 │   ← 4 specializations under each
│ spec A3 │ spec B3 │ spec C3 │ spec D3 │
│ spec A4 │ spec B4 │ spec C4 │ spec D4 │
└─────────┴─────────┴─────────┴─────────┘
  20 nodes per tier · 10 points earned per tier  →  you pick HALF
  * tiers 3–4 require the Academy for the class's school
```

- **1 skill point per level** (40 total at cap). Points earned in a lower tier can be spent in any **unlocked** tier. Tier 2 opens at level 10, tier 3 at 20, tier 4 at 30.
- A **specialization requires its parent active.**
- With 10 points per tier, a typical build is either *2 actives fully specialized* (2 × 5 = 10), *3 actives with 7 specs*, or *4 actives with 6 specs*. That's a real choice each tier.
- **Free milestone passive** at levels 1, 10, 20 and 30: the class's stat-focus bonus (e.g. Fighter: +10% HP / +1 ARM; Wizard: +10% spell power / −1 cooldown on one element).
- **Respec:** a *Tome of Clear Thought* (merchant or Magic Lab) or a paid respec at a Shrine.

### 7.2 Loadout

A level-40 character has access to up to 16 actives, which is too many for an auto-battler to use sensibly. So:

- **4 equipped active slots**, +1 at level 20 and +1 at level 30. The rest are known but benched.
- **Gear-granted actives** use their own slot (max 1 per item, 2 total).
- **Book-learned abilities** (§9) share the class slots.
- Default: auto-equip the highest-value actives. You can override this in the colonist's Class tab.

### 7.3 The four kinds of specialization

Every active's four specs follow the same four archetypes. That keeps 400+ nodes readable and gives the AI a known shape:

| Archetype | What it does | Examples |
|---|---|---|
| **Potency** | Numbers | +35% power, +1 hit, +crit chance |
| **Rider** | Adds or strengthens a status or element | "also applies 2 Bleed", "Burn chance 60%" |
| **Reach** | Changes the shape | single → row, chains to +1, can hit the back row |
| **Tempo / Synergy** | Cooldown, trigger or combo hook | "−1 cooldown", "resets on kill", "+50% vs Frozen" |

### 7.4 Full example trees (tier 1)

**Fighter, Tier 1**

| Active | Base effect | Spec 1 · Potency | Spec 2 · Rider | Spec 3 · Reach | Spec 4 · Tempo/Synergy |
|---|---|---|---|---|---|
| **Cleave** (cd 3) | 70% weapon damage to the whole enemy front row | *Heavy Arc*: +35% power; great weapons add 20% Stun | *Rending Cleave*: 2 Bleed | *Wide Arc*: also hits the back row at 50% | *Momentum*: a kill resets the cooldown |
| **Shield Bash** (cd 4, needs a shield) | 80% crush, 40% Stun | *Concussive*: Stun 70% | *Staggering*: fills 2 Poise instead of 1 | *Ricochet*: bounces to a second target | ***Interrupt***: always cancels a telegraphed attack |
| **Second Wind** (cd 6) | Heal self 30% max HP | *Deep Reserves*: 45% | *Resolve*: also cleanses 1 debuff | *Rally*: heals the adjacent front-liner for half | *Last Stand*: fires automatically under 25% HP, once per fight |
| **Challenge** (cd 5) | Taunt all enemies for 2 rounds | *Iron Hide*: +3 ARM while taunting | *Commanding*: taunted enemies are Weakened | *Stand Together*: allies gain +2 DEF while you taunt | *Punishing*: attackers take 30% of their hit back |

**Wizard, Tier 1**

| Active | Base effect | Potency | Rider | Reach | Tempo/Synergy |
|---|---|---|---|---|---|
| **Firebolt** (cd 1) | 120% fire, Burn 25% | *Searing*: +35% | *Kindling*: Burn 60% | *Twin Bolt*: two bolts at 60% each | *Ember Echo*: a kill spreads its Burn to neighbours |
| **Ray of Frost** (cd 2) | 100% frost, 1 Chill | *Bitter*: +35% | *Deep Cold*: 2 Chill | *Frost Lance*: pierces into the back-row target behind | ***Grounding Ray***: a hit flyer is Grounded 2 rounds |
| **Magic Missile** (cd 2) | 3 × 45% arcane, **never misses** | *Extra Dart*: 4 darts | *Arcane Sunder*: each dart −5% RES | *Seeking*: darts split onto the lowest-HP enemies | *Overload*: +1 dart per Silenced or Stunned enemy |
| **Shield** (cd 4) | Barrier on self = 25% max HP | *Thick Ward*: 40% | *Reactive*: when it breaks, the attacker is Chilled ×2 | *Ward Ally*: cast on the most endangered ally | ***Elemental Ward***: also +50% RES to the last element that hit you |

The pattern shows in these two tables: Fighter specs lean into **Poise and Interrupt**, which is what answers dragons and necromancers. Wizard specs lean into **Grounding and combos**, which is what answers flyers and frozen targets.

### 7.5 All classes, tiers 1–2 (actives)

Specs for these follow §7.3 and get written per class when that class is built (Phase 3).

| Class | Tier 1 actives | Tier 2 actives |
|---|---|---|
| **Fighter** | Cleave · Shield Bash · Second Wind · Challenge | Action Surge (extra action now) · Sunder Armor (Sunder) · Rallying Cry (party barrier) · Bulwark (redirect 50% of an ally's damage to you) |
| **Barbarian** | Rage (+damage, physical RES 25%) · Reckless Blow · Frenzied Strikes (3 hits, Bleed) · Intimidating Shout (Fear on the front row) | Earthshaker (crush the front row, Stun) · Unstoppable (cleanse CC, CC-immune 2 rounds) · Blood Price (spend HP for power) · Primal Totem (Bear: RES / Wolf: party ACC / Eagle: hit flyers) |
| **Paladin** | Divine Smite (Holy burst, ×2 vs undead/fiend) · Lay on Hands · Shield of Faith (barrier ally) · Aura of Courage (party Fear-immune 3 rounds) | Consecrate (holy ground: damage-over-time and Consecration on the row) · Judgment (Holy + Blind) · Holy Charge (dive the back row) · Divine Guardian (prevents one ally death per fight) |
| **Rogue** | Backstab (prefers the back row; crits the Helpless) · Vanish (Stealth) · Poison Blade (3 Poison) · Cheap Shot (Stun, needs Stealth or Flank) | Shadowstep (strike any target and crit) · Smoke Bomb (party Evasive, enemies Blind) · Eviscerate (consumes Poison/Bleed stacks for burst) · Expose Weakness (Vulnerable + Sunder) |
| **Ranger** | Volley (row) · Hunter's Mark (Vulnerable) · **Pinning Shot** (Root + Ground a flyer) · Aimed Shot (+crit) | Elemental Quiver (fire/frost/storm arrows for 3 rounds) · Beast Command (war beast gets an extra action) · Rain of Arrows (all enemies) · Trap Line (enemies starting in the front row take damage and are Slowed) |
| **Monk** | Flurry of Blows · Stunning Strike · Stillness (Evasive + Regen) · Deflect Missiles (reflect ranged attacks) | Quivering Palm (delayed burst in 2 rounds) · Wind Step (reach the back row, hit flyers) · Pressure Points (Weaken + Slow) · Ki Surge (storm-infused hits, Shock) |
| **Wizard** | Firebolt · Ray of Frost · Magic Missile · Shield | Fireball (row, Burn) · Lightning Bolt (piercing line, Shock) · **Counterspell** (Silence a caster + interrupt) · Blink (untargetable 1 round) |
| **Warlock** | Eldritch Blast (arcane beams: 2, then 3 at level 11) · Hex (Weaken + Vulnerable) · Life Drain · Armor of Frost (barrier; attackers Chilled) | Summon Imp (flying minion) · Hunger of Hadar (Shadow + Frost field, Blind) · Curse of Doom (Doom) · Dark Pact (spend HP to reset a cooldown) |
| **Cleric** | Mend Wounds · Bless · Sacred Flame (Holy, ignores DEF) · Turn Undead (Fear undead/fiends) | Mass Heal · Spirit Guardians (holy aura damage) · **Cleanse** (remove 2 debuffs party-wide) · Revivify (raise a downed ally once per delve) |
| **Druid** | Regrowth · Thornwhip (Nature + Poison; **pulls a flyer down**) · Entangle (Root the row) · Call Lightning (Storm, stronger on Wet) | Wild Shape: Bear (big HP, front-row melee) · Insect Plague (Nature damage-over-time on all) · Barkskin (Fortify ally) · Moonbeam (Holy, Consecration vs shapechangers) |
| **Bard** | Inspire · Vicious Mockery (Arcane + Weaken) · Discord (enemies −ACC) · Song of Rest (heal after the fight) | Hypnotic Pattern (Sleep the row) · Countercharm (cleanse Charm/Fear, party resist) · Dissonant Whispers (Fear + Arcane) · Heroism (party temp HP + Fear-immune) |
| **Artificer** | Spark Turret · Overcharge · Alchemical Flask (random element + its status) · Infuse Weapon (ally's hits gain an element) | Iron Defender (summon a front-row construct) · Tesla Coil (Storm chain) · Flash Repair (heal constructs/beasts, barrier ally) · Thunder Cannon (big Storm hit, Stun) |

All 28 existing abilities appear in tier 1 or tier 2, so nothing a player already knows disappears.

### 7.6 Tactics presets (light AI control)

Per colonist: **Aggressive** (damage first) · **Defensive** (protect, heal, interrupt first) · **Support** (buff and cleanse first) · **Auto** (class default). One dropdown; the AI's ability priorities read it. A full "gambit" rule editor is out of scope.

### 7.7 Levelling pace

Target: a colonist who delves regularly sits at about **2 × Rift level**.

| Rift rank (level) | Day (roughly) | Target colonist level | Tier unlocked |
|---|---|---|---|
| E (1) | 1–4 | 1–3 | 1 |
| D (2) | 5–8 | 3–5 | 1 |
| C (3–4) | 9–16 | 5–9 | 1 |
| B (5–6) | 17–24 | 9–13 | 2 |
| A (7–8) | 25–32 | 13–17 | 2 |
| S (9–11) | 33–44 | 17–23 | 3 (Academy) |
| SS (12–14) | 45–56 | 23–29 | 3 |
| SSS (15–20) | 57+ | 29–40 | 4 |

**XP sources:** kills (monster XP = level × threat multiplier, shared by the party), room and delve clears, **surviving a night wave** (defenders gain XP, so homebodies still level), and **school training** (slow, capped at level 10 for a School and 20 for an Academy).

---

## 8. Class schools, academies and class books

### 8.1 Structures

| Structure | Research | Cost (rough) | Teaches | What it does |
|---|---|---|---|---|
| **Combat School** | *Drill Corps* (existing) | 60 wood, 40 stone, 10 iron | Fighter, Barbarian, Paladin, Rogue, Ranger, Monk | Converts a commoner into a combat class. Trains XP up to level 10 |
| **Mage School** | *Letters* → new *Arcane Theory* | 40 wood, 30 stone, 15 dust, 5 gems | Wizard, Warlock, Cleric, Druid, Bard, Artificer | Same, for magic classes |
| **Knight Academy** (upgrade) | new *Martial Doctrine* | +120 stone, 40 iron, 20 gold | same as the Combat School | **Unlocks tiers 3–4** and the prestige title. Trains XP up to level 20 |
| **Wizardry Academy** (upgrade) | new *High Arcana* | +80 stone, 40 dust, 15 gems, 10 relics | same as the Mage School | **Unlocks tiers 3–4** and the prestige title. Trains XP up to level 20 |

Schools are multi-tile structures, so they get the new structure rendering (name plate, floor, walls). Their size sets capacity: **1 student per 4 tiles**.

### 8.2 How conversion works

1. **Pick a student and a target class** in the school's panel. The student needs the class's **primary attribute ≥ 12** (or ≥ 10 with a burning passion in its main skill).
2. **An instructor is optional but matters.** A colonist of that class at level ≥ 5 halves the training time. Without one it's *self-study*: slow, and only for tier-1 classes.
3. **Training takes 2–4 game days** (Mage slower than Combat). The student works a "Study" duty on the new *Study* labour row.
4. **On graduation:** new class, **keeps level and attributes**, gets the class's skill seed (like today's generator), and has its tree points **refunded to spend in the new tree**. Weapons it can no longer use go back to the armory.

**Re-classing an adventurer** works the same way but costs a morale hit (*"Starting over"*, −6 for 3 days). A colonist can't re-class more than once per 10 levels.

### 8.3 Class Tomes (rare)

- One tome per class. Reading one takes **1 day** at any bed or library and needs no school or instructor, but the primary attribute ≥ 12 rule still applies.
- **Sources:** Arcane Sanctum bookcases (~2%), boss drops (~5%), rare magic-merchant stock (a tome shows up about once a season), Drow Priestesses and Liches.
- **Prestige Tomes** (even rarer) grant tiers 3–4 access without an Academy, for that one colonist.

---

## 9. Magic economy

### 9.1 Kinds of book

| Item | What it does | Who can use it |
|---|---|---|
| **Scroll** | Single use: casts one spell once in a delve or wave, then crumbles | Anyone with INT or WIS ≥ 12 |
| **Spellbook / Technique Manual** | Permanently teaches one **off-tree ability** (takes a loadout slot, **costs no skill points**) | School match: arcane books need INT ≥ 13, divine WIS ≥ 13, martial manuals STR or DEX ≥ 13 |
| **Tome of Clear Thought** | Full respec of one colonist's tree | Anyone |
| **Class Tome** | Class conversion (§8.3) | Primary attribute ≥ 12 |

Off-tree abilities come from a shared **General pool** of about 30, e.g. *Misty Step, Haste, Hold Person, Web, Cure Wounds, Feather Fall (immune to Grounding), Detect Magic (reveals mimics), Darkvision, Parry, Whirlwind, Second Breath, Mark for Death*. This lets a Fighter carry one utility spell without breaking class identity.

### 9.2 Magic merchants

- **Travelling Arcane Peddler:** a new caravan kind. It comes from towns and ley-springs on the region map, about every 6–8 days once *Arcane Theory* is researched. Stock: 3–5 scrolls, 1–2 spellbooks, reagents (essences), potions, a small chance of a Class Tome. Prices rise with Rift rank.
- **Spellmason** (camp structure, after *High Arcana*, or earlier with a 5th-level Wizard in camp):
  - A permanent shop whose stock rotates weekly (scrolls, spellbooks from the General pool).
  - It **copies** any spellbook the colony owns: pay dust and cloth, get a second copy.
  - It **buys** books and scrolls you don't want.

### 9.3 Magic Lab: research and spellcrafting

The Magic Lab is an upgrade of the Alchemy Table *or* a standalone structure, after *High Arcana*. It lets you **design** spells from parts, then **write them into books** for any compatible caster.

```
SPELL = FORM + ELEMENT + up to 2 MODIFIERS       (power budget must stay ≤ 100)

FORM (base)          budget  ELEMENT            MODIFIERS                         budget
Bolt   (1 target)      30    Fire  → Burn        Empowered   (+35% power)            25
Burst  (a row)         45    Frost → Chill       Lingering   (status +1 round)       15
Wave   (all enemies)   60    Storm → Shock       Chain       (+1 target)             20
Ward   (barrier)       35    Nature → Poison     Quickened   (−1 cooldown)           25
Hex    (debuff)        30    Holy  → Blind       Piercing    (reaches the back row)  15
Mend   (heal)          40    Shadow → Weaken     Grounding   (Grounds flyers)        15
                             Arcane → Sunder     Interrupting (cancels telegraphs)   30
```

- **Researching** a Form, Element or Modifier is a one-off Insight cost. They unlock through the existing tech tree (new *Spellcraft* branch).
- **Writing a book** costs dust + cloth + the element's **essence** (from monster drops, §14.4) + lab work time, scaled by the spell's budget.
- The spell's **cooldown** comes from its budget (≤50 → cd 2, ≤75 → cd 3, ≤100 → cd 4).
- Example: *Frost + Burst + Grounding + Lingering* = 45 + 15 + 15 = **75**. A row-wide chill that knocks down a harpy flock, cooldown 3.

---

## 10. Gear

### 10.1 Slots

| Slot | Takes | Class-locked? |
|---|---|---|
| **Head** | Helmets, hoods, circlets | No |
| **Body** | Light / medium / heavy armor | No (soft comfort penalty, §6.2) |
| **Feet** | Boots, greaves | No |
| **Main hand** | Weapons | **Yes, by weapon family** |
| **Off hand** | **Shield** (defensive classes only) · second light weapon · focus (orb/tome/holy symbol/instrument/totem) | **Shields and weapons yes**; foci are locked to their caster classes |
| **Charm** *(optional, see §18)* | Amulet or ring | No |

Two-handed weapons take both hands.

### 10.2 Weapon families

| Family | Hands | Damage | Special | Classes |
|---|---|---|---|---|
| Swords | 1 | Slash | +parry (DEF) | Fighter, Paladin, Rogue (short), Ranger (short), Bard (rapier), Warlock (pact) |
| Axes | 1 | Slash | +Bleed chance | Fighter, Barbarian, Ranger |
| Maces & hammers | 1 | Crush | +Stun vs Armored | Fighter, Paladin, Cleric, Artificer, Barbarian |
| Great weapons | 2 | Slash/Crush | Cleave hits +1 | Fighter, Barbarian, Paladin |
| Spears & polearms | 1–2 | Pierce | **Reach** (hit the back row) | Fighter, Paladin, Ranger, Monk, Druid |
| Daggers | 1 | Pierce | +crit, dual-wield | Rogue, Bard, Wizard, Warlock |
| Bows | 2 | Pierce | Any row; +vs flyers | Ranger, Fighter, Rogue (short) |
| Crossbows | 1–2 | Pierce | Ignores 30% more ARM | Fighter, Ranger, Rogue (hand), Bard (hand), Artificer |
| Throwing | 1 | Pierce/Crush | Any row, low damage | Barbarian, Rogue |
| Fist weapons | 1 | Crush | Hits twice | Monk |
| Staves | 2 | Crush + spell | +spell power | Wizard, Druid, Monk |
| Wands & rods | 1 | Element | +cast speed (−cd on one element) | Wizard, Warlock, Artificer |
| Gadgets | 1 | Storm/Fire | Turret power | Artificer |

### 10.3 Rarity

| Rarity | Colour | Affixes | Extras | Drop weight at rank E → SSS |
|---|---|---|---|---|
| **Common** | white | 0 | — | 70% → 10% |
| **Uncommon** | green | 1 | — | 25% → 30% |
| **Rare** | blue | 2 | — | 5% → 35% |
| **Epic** | purple | 2 | **1 passive** (§10.5) | 0% → 20% |
| **Legendary** | orange | fixed | **Named item:** unique passive **and** a granted active | 0% → 5% |

- **Item level** = the source's Rift level. Base stats scale with it. Rarity decides the extras.
- Old quality grades map to rarity: crude/plain → common, fine → uncommon, superior → rare, masterwork → epic, legendary → legendary.
- **Gear Kits** (existing resource) still *Reinforce* an item: +1 level, up to +5.

### 10.4 Affixes (elemental affinity lives here)

**Prefixes (numbers):** Keen (+ACC) · Heavy (+damage −ACC) · Swift (+INIT) · Warded (+ARM) · Sturdy (+HP) · Arcane (+spell power) · Blessed (+ACC +ARM) · Vampiric (lifesteal)

**Suffixes (elements):**
- **Weapons:** *of Embers* (20% becomes Fire, Burn 15%) · *of Rime* (Frost, Chill) · *of Storms* (Storm, Shock) · *of Venom* (Nature, Poison) · *of Dawn* (Holy, Blind) · *of Dusk* (Shadow, Weaken) · *of the Veil* (Arcane, Sunder)
- **Armor:** the same names give **+25% RES** to that element (+40% on Epic and up)

### 10.5 Armor passives (Epic items; also crafted with trophies)

| Passive | Slot | Effect |
|---|---|---|
| Thornmail | Body | Reflect 15% of melee damage |
| Bulwark | Body/Off hand | +2 ARM per ally in the front row |
| Everburning | Body | Immune to Burn; your fire hits +1 Burn stack |
| Frostbound | Body | Attackers gain Chill |
| Stormcaller | Head | Your Shock chains to +1 |
| Clarity | Head | Immune to Confuse and Charm |
| Iron Will | Head | Fear duration halved |
| Mirror Visor | Head | Reflects gaze attacks (Petrify, Beholder rays) |
| Striders | Feet | +3 INIT; immune to Slow |
| Anchors | Feet | Immune to Root and knockback; +1 Poise |
| Featherfall | Feet | Can't be Grounded; immune to Burrower ambush |
| Shadowstep Boots | Feet | Starts each fight in Stealth |
| Regenerator (Troll Heart) | Charm | Regen 3% max HP per round |

### 10.6 Gear that grants or synergises with actives (examples)

| Item | Rarity | Grants | Synergy |
|---|---|---|---|
| **Emberheart Gauntlets** | Epic | — | Your Burns also Weaken. *(Great on a Fire Wizard or Fireball Warlock)* |
| **Stormcaller's Crown** | Epic | *Chain Lightning* (active) | Electrocute stuns last +1 round |
| **Frostbrand** (sword) | Legendary | *Glacial Strike* (Freeze the front row) | Your Shatters heal you 10% |
| **Shield of the Unbroken** | Legendary | *Last Bastion* (party Barrier) | Shield Bash always Interrupts |
| **Dragonscale Mail** (crafted: dragon trophy) | Legendary | *Dragon's Breath* (element of the scale) | Immune to that element |
| **Mirror of Perseus** (Medusa trophy) | Legendary shield | — | Reflects all gazes; a reflected Petrify hits the caster |
| **Beholder's Eye** | Legendary charm | *Eye Ray* (random status) | Antimagic immunity |
| **Phylactery Shard** | Legendary charm | *Undying* (once per delve, stand at 1 HP) | +50% Shadow RES |
| **Whisperwind Bow** | Epic | *Pinning Volley* | Grounded targets take +30% |
| **Boots of the Hunt** | Rare | — | +25% damage vs Rooted |

### 10.7 Crafting

| Where | What it makes |
|---|---|
| **Smithy** | Common/Uncommon weapons and armor (a *bill* per item). Smithing skill rolls the rarity bump: skill 15+ gives a Rare chance |
| **Carpenter** | Bows, staves, shields |
| **Magic Lab** | **Enchant**: add or replace an elemental suffix (costs the matching essence) |
| **Forge anvils** in the Ember Forge biome | A delving party may **upgrade one item** in the field |
| **Trophies** | Named boss parts (Troll Heart, Medusa Head, dragon scale) unlock **Legendary recipes** at the Smithy or Lab |

---

## 11. Potions and consumables

Potions are brewed at the Alchemy Table (existing recipe, extended) or bought. Each party member has a **potion belt of 2 slots** (3 with a *Bandolier* charm). The AI uses them by rule; the belt is set on the party screen.

| Potion | Effect | Use rule |
|---|---|---|
| Healing (Minor / Greater / Superior) | 25 / 45 / 70% max HP | Below 30% HP (existing triage) |
| Antidote | Cures Poison; Poison-immune 3 rounds | 2+ Poison stacks |
| Burn Salve | Cures Burn and Bleed | Burning or 3+ Bleed |
| Stone Salve | Cures Slowed/Petrified (also after the fight) | Petrify step 1 |
| Ward: Fire / Frost / Storm / Nature / Shadow | +50% RES for the fight | **When a matching telegraph is announced**, or at the start in a matching biome |
| Holy Water (throwable) | Holy damage; stops Undying and Regen | Vs undead and vampires |
| Alchemist's Fire (throwable) | Fire + 2 Burn | Vs trolls, webs, plants |
| Flask of Oil (throwable) | Oiled | Before a Fire caster acts |
| Potion of Haste | Haste 3 rounds | Boss fight start |
| Giant's Strength | +50% physical damage 3 rounds | Front-liner, boss fight |
| Invisibility | Stealth | Low HP, to escape focus fire |
| Smoke Bomb | Guaranteed retreat from this fight | When retreat triggers |
| Elixir of Clarity | Cleanse Charm, Fear, Confuse | When the party is controlled |

The existing generic `potion` resource becomes **Minor Healing**, so nothing breaks.

---

## 12. Monster library

### How to read the tables

- **Rank:** the guild ranks where it natively appears. **Lv:** its native level range (≈ 2 × Rift level).
- **Row:** F front · B back · Fl flank · ✈ flying.
- **HP / DMG:** multipliers on the monster baseline at its level:
  - **HP = 20 + 10 × Lv**, **hit damage = 4 + 1.5 × Lv**, **ARM = 1 + Lv/3**, **ACC = 3 + 0.8 × Lv**, **DEF = Lv/2**
  - Example: a Lv 10 Troll with HP 2.0 has 240 HP. For comparison, a level-10 Fighter has ~100–130 HP, so it's a fight for a full party.
- **W / R / I / A:** weak / resist / immune / absorb.
- **Drops:** resource bias; ⚗ = element essence; 🏆 = trophy; 🗡 n% = gear chance.

> **A note on names.** Most of these are open SRD monsters. *Beholder, Mind Flayer, Displacer Beast* and a few others are Wizards of the Coast product identity. That's fine for a personal project; if you ever publish, rename them (e.g. *Gaze Tyrant, Mind Reaver, Phase Panther*).

### 12.1 Goblinoids & kobolds (E–C)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Kobold | E | 1–3 | F | 0.5 | 0.6 | — | Small, Pack Tactics, Coward | Sling | food, iron |
| Kobold Trapper | E–D | 2–5 | B | 0.5 | 0.7 | — | Small | Snare (Root), Caltrops (Slow row) | iron, gold |
| Kobold Scale Sorcerer | D–C | 4–8 | B | 0.6 | 1.0 | R: its dragon's element | Small, Caster | Dragon Spark (element bolt), Scale Ward (barrier ally) | dust, ⚗ |
| Goblin | E | 1–3 | F | 0.6 | 0.8 | — | Small, Evasive | Scimitar | gold, leather |
| Goblin Archer | E–D | 1–4 | B | 0.5 | 0.9 | — | Small | Aimed Arrow; Fire Arrow from D | gold, 🗡 5% |
| Goblin Shaman | E–D | 2–5 | B | 0.6 | 0.8 | — | Caster | Mend Kin, Hex | herbs, dust |
| Goblin Boss | E–D | 3–6 | F | 1.1 | 1.1 | — | **Leader** (+2 ACC goblinoids) | Redirect Attack (swap with a goblin), Rally | gold ×2, 🗡 12% |
| Worg | E–D | 2–5 | F | 0.9 | 1.0 | — | Beast, Pack Tactics | Trip (Stun 30%) | leather, food |
| Hobgoblin Soldier | D–C | 4–8 | F | 1.0 | 1.0 | +2 ARM | **Shield Wall** (+3 DEF while ≥2 hobgoblins are in front) | Spear Thrust (Reach) | iron, 🗡 8% |
| Hobgoblin Captain | C–B | 6–10 | F | 1.4 | 1.2 | +3 ARM | Leader, Tactician (its side acts first in round 1) | Warcry (+damage aura) | gold, 🗡 15% |
| Bugbear | D–C | 3–7 | Fl | 1.2 | 1.5 | — | **Ambusher**, Brute | Surprise Attack (×2 first hit, back row) | leather, 🗡 8% |

### 12.2 Beasts (E–A)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Rat Swarm | E | 1–3 | F | 0.8 | 0.6 | W: Fire | **Swarm** (single-target −50%, AoE ×2) | Gnaw (Bleed) | food |
| Wolf | E | 1–3 | F | 0.7 | 0.8 | — | Pack Tactics | Trip | leather, food |
| Dire Wolf | D | 3–6 | F | 1.2 | 1.1 | — | Pack Tactics, **Leader** (wolves) | Howl (Fear) | leather ×2, 🏆 Dire Pelt |
| Giant Bat | E–D | 2–5 | ✈ | 0.6 | 0.7 | — | Flying, Blindsight | Screech (Silence 1) | leather |
| Giant Spider | D–C | 3–7 | F/B | 0.9 | 0.9 | W: Fire · R: Nature | Wall-climber | Web (Root), Venom Bite (2 Poison) | cloth, ⚗ Venom |
| Ankheg | D–C | 4–8 | F | 1.2 | 1.1 | W: Frost | **Burrower**, Armored | Acid Spray (Sunder row) | leather, ⚗ Venom |
| Owlbear | C | 5–9 | F | 1.8 | 1.4 | — | Large, Brute | Rending Hug (Root + Bleed) | leather ×2, 🏆 Owlbear Plume |
| Displacer Beast | C–B | 6–10 | Fl | 1.2 | 1.2 | — | **Displacement** (first attack on it each round misses; Blindsight ignores this) | Tentacle Lash ×2 | 🏆 Displacer Hide |
| Griffon | C–B | 5–9 | ✈ | 1.3 | 1.2 | — | Flying, Large | Dive (hits the back row) | leather, 🏆 Feather |
| Manticore | B–A | 8–13 | ✈ | 1.6 | 1.3 | — | Flying, Large | Tail Spikes (3 ranged hits), Pounce | leather, 🗡 6% |
| Wyvern | A | 12–16 | ✈ | 1.8 | 1.5 | R: Nature | Flying, Large | Venom Stinger (3 Poison) | ⚗ Venom, 🏆 Stinger |

### 12.3 Undead (E–SSS)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Skeleton | E–D | 1–5 | F | 0.7 | 0.9 | **W: Crush, Holy** · R: Slash, Pierce | Undead, Mindless | — | dust, 🗡 6% |
| Skeleton Archer | D | 2–6 | B | 0.6 | 1.0 | as Skeleton | Undead, Mindless | Bone Volley | dust, 🗡 6% |
| Zombie | E–D | 1–5 | F | 1.3 | 0.9 | W: Holy, Fire | Undead, Slow, **Undying** (50% to rise at 1 HP unless finished by Holy, Fire or a crit) | Grasp (Root) | dust |
| Ghoul | D–C | 3–7 | F | 0.9 | 1.0 | W: Holy | Undead | **Paralyzing Claws** (Stun 35%; elves immune) | relics, ⚗ Umbral |
| Shadow | C | 5–9 | Fl | 0.7 | 1.0 | W: Holy · R: physical 50% · I: Frost | Incorporeal, Stealthy | Strength Drain (stacking Weaken) | ⚗ Umbral |
| Wight | C–B | 6–10 | F | 1.3 | 1.2 | W: Holy · R: Shadow | Undead, Leader, Summoner | Life Drain, **Raise Dead** (telegraphed: a fallen body stands as a Zombie) | relics, 🗡 10% |
| Wraith | B | 8–12 | Fl | 1.1 | 1.3 | W: Holy · R: physical 50% · I: Shadow | Incorporeal | Life Drain (Drained) | ⚗ Umbral |
| Banshee | B–A | 9–13 | B | 0.9 | 1.0 | W: Holy · I: Frost, Shadow | Incorporeal | **Wail** (telegraphed: all Fear + 20% max HP Arcane) | relics |
| Mummy | B | 8–12 | F | 1.6 | 1.2 | **W: Fire (×2)**, Holy | Undead | Dreadful Glare (Fear), Rotting Fist (no healing 3 rounds, injury *Mummy Rot*) | relics ×2, cloth |
| Vampire Spawn | A | 12–15 | Fl | 1.2 | 1.3 | W: Holy · R: Shadow | Undead, **Regenerating** (stopped by Holy) | Bite (drain) | gold, relics |
| Vampire | S | 17–22 | Fl | 2.2 | 1.5 | W: Holy · R: Shadow, physical 25% | Legendary 2, Regenerating, **Mist Form** (at 0 HP escapes unless the killing blow is Holy, and returns in a later room) | Charm, Bat Swarm, Bite | 🏆 Vampire Fang, 🗡 30% |
| Death Knight | SS | 23–28 | F | 2.5 | 1.8 | W: Holy · R: Fire, Shadow, Frost | Undead, Leader, Magic Resistant | **Hellfire Orb** (telegraphed Fire + Shadow AoE), Parry | 🗡 35%, relics |
| Lich | SSS | 30–40 | B | 3.0 | 2.0 | W: Holy (25% only) · I: Nature, Frost, Shadow | Legendary 3, Caster, **Phylactery** | Power Word Stun, Finger of Death (execute below 25%), Summon Undead, Counterspell | 🏆 Phylactery Shard, Legendary 15% |

### 12.4 Oozes & fungi (E–B)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Myconid Sprout | E–D | 1–4 | F | 0.5 | 0.5 | W: Fire | Plant | Spore Puff (Confuse 15%) | herbs, food |
| Shrieker | D | any | B | 0.4 | — | W: Fire | Plant, **Alarm** (each 2 rounds alive: a wandering monster joins) | — | herbs |
| Violet Fungus | D–C | 3–7 | F | 0.8 | 0.9 | W: Fire | Plant, Reach | Rotting Touch (Poison + Drained) | herbs |
| Myconid Sovereign | D–C | 4–8 | B | 1.3 | 0.9 | W: Fire | Plant, Leader, Summoner | Hallucination Spores (Confuse row), Animate Spores (a fallen body rises) | herbs ×2, ⚗ Venom |
| Gray Ooze | D | 3–6 | F | 1.0 | 0.9 | R: Fire, Frost · I: Nature, crits | Ooze | **Corrode** (melee attackers are Sundered) | dust, ⚗ Venom |
| Carrion Crawler | C | 5–9 | F | 1.3 | 0.8 | — | Wall-climber | Paralytic Tentacles (Stun 40%) | leather, ⚗ Venom |
| Ochre Jelly | C | 5–9 | F | 1.4 | 1.0 | I: Storm, Slash → **Splits** | Ooze | Acid Pseudopod (Sunder) | dust |
| Gelatinous Cube | C–B | 6–10 | F | 2.0 | 0.9 | I: Nature, Blind, Fear | Ooze, Large, Ambusher (transparent) | **Engulf** (one front-liner) | **undigested gear 25%** |
| Black Pudding | B | 8–12 | F | 2.2 | 1.2 | W: Frost, Fire · I: Slash, Storm (**Splits**) | Ooze | Corrode | ⚗ Venom, dust |

### 12.5 Elementals & heat-dwellers (C–S)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Magma Mephit | C | 5–8 | ✈ | 0.6 | 0.8 | I: Fire · W: Frost | Flying, Elemental, **Death Throes** (Fire burst on its row) | Fire Breath | ⚗ Ember |
| Ice Mephit | C | 5–8 | ✈ | 0.6 | 0.8 | I: Frost · W: Fire | Flying, Death Throes (Chill burst) | Frost Breath | ⚗ Rime |
| Steam Mephit | C | 5–8 | ✈ | 0.6 | 0.7 | I: Fire | Flying, Blurred (Blind aura) | Scald | ⚗ Ember |
| Azer | C–B | 7–11 | F | 1.2 | 1.1 | I: Fire, Nature | Armored, Heated Body (melee attackers take Fire) | Warhammer | iron, 🗡 10% |
| Fire Elemental | B | 9–13 | F | 1.6 | 1.3 | I: Fire, Nature · **W: Frost, Wet** | Elemental, **Burning Aura** (melee attackers Burn), can't be Rooted | Touch (2 Burn), Ignite Row | ⚗ Ember ×2, gems |
| Water Elemental | B | 9–13 | F | 1.8 | 1.1 | R: Fire, physical 25% · Frost freezes it ×2 duration | Elemental | Whelm (Wet the row), Drown (Root) | ⚗ Storm, gems |
| Earth Elemental | B | 9–13 | F | 2.2 | 1.3 | R: physical 25% · **W: Storm** | Burrower, Armored | Slam (Stun) | stone, iron, gems |
| Air Elemental | B | 9–13 | ✈ | 1.4 | 1.2 | R: physical 25% · I: Nature | Flying, Evasive | Whirlwind (all enemies; Grounded allies are thrown back) | ⚗ Storm |
| Salamander | B–A | 10–14 | F | 1.4 | 1.3 | I: Fire · W: Frost | Reach, Heated Body | Constrict (Root + Burn) | ⚗ Ember, gold |
| Hell Hound | B–A | 9–14 | F | 1.2 | 1.2 | I: Fire | Fiend, Pack Tactics | **Fire Breath** (telegraphed row Burn) | ⚗ Ember, 🏆 |

### 12.6 Giants & trolls (D–S)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Ogre | D–C | 4–8 | F | 2.0 | 1.5 | — | Large, Brute (−2 ACC) | Greatclub (Stun 20%) | food, gold, 🗡 8% |
| Troll | C–B | 6–11 | F | 2.0 | 1.3 | **W: Fire, Nature** | Large, **Regenerating** 15%/round; at 0 HP it only dies if it took Fire or Nature that round | Rend (Bleed) | leather, 🏆 **Troll Heart** |
| Hill Giant | B | 9–13 | F | 2.6 | 1.6 | — | Huge | Rock Throw (back row) | food, gold, stone |
| Ettin | B–A | 10–15 | F | 2.6 | 1.4 | — | Large, **Two Heads** (2 actions; immune to Sleep and Ambush) | Morningstar + Battleaxe | gold, 🗡 10% |
| Stone Giant | A | 12–16 | F | 2.8 | 1.6 | R: physical 25% | Huge, Armored | Boulder (back row, Stun), Catch (deflect ranged 30%) | stone, gems |
| Frost Giant | A | 13–17 | F | 3.0 | 1.8 | I: Frost · W: Fire | Huge | Greataxe Cleave (front row), Ice Shatter (×2 vs Frozen) | ⚗ Rime, 🗡 15% |
| Fire Giant | S | 16–20 | F | 3.2 | 2.0 | I: Fire · W: Frost | Huge, Armored | Forged Sword (Burn), **Molten Rock** (telegraphed AoE) | ⚗ Ember ×2, iron, 🗡 20% |

### 12.7 Constructs (C–S)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Animated Armor | C | 5–9 | F | 1.2 | 1.0 | **W: Storm, Crush** | Construct, Armored | Parry | iron, **🗡 15% (armor)** |
| Flying Sword | C | 5–9 | ✈ | 0.5 | 1.0 | W: Storm, Crush | Construct, Flying, Evasive | Slash (Bleed) | iron, 🗡 10% (sword) |
| Mimic | any | scales | F | 1.5 | 1.3 | — | **Ambusher (disguised as a chest)**, Adhesive (melee attackers Rooted) | Bite | gold, 🗡 30%, 🏆 Mimic Tongue |
| Clay Golem | B | 9–13 | F | 2.2 | 1.3 | I: Nature (**acid heals it**) | Construct, Large, Magic Resistant, Berserk (below 50%: random targets) | Haste Self, Slam (Drained) | stone, dust, gems |
| Shield Guardian | A | 12–16 | F | 2.4 | 0.8 | I: Nature | Construct, **Guardian** (takes 50% of its master's damage), Regenerating | Stored Spell | ⚗ Arcane, 🏆 Guardian Amulet |
| Stone Golem | A | 13–17 | F | 2.8 | 1.5 | R: physical 50% (Sunder removes it) | Construct, Large, Magic Resistant | **Slow Aura** (telegraphed: party Slow), Slam | stone, gems, ⚗ Arcane |
| Iron Golem | S | 17–22 | F | 3.2 | 1.8 | **A: Fire** (heals) · W: Storm (Slows it) | Construct, Large, Magic Resistant | **Poison Breath** (telegraphed AoE, 3 Poison) | iron ×3, 🏆 Golem Core |

### 12.8 Aberrations (B–SSS)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Gibbering Mouther | B | 8–12 | F | 1.6 | 1.0 | — | Aberration | Gibbering (Confuse aura 20%), Blinding Spittle | dust, knowledge |
| Nothic | B–A | 10–14 | B | 1.1 | 1.1 | — | Aberration | Rotting Gaze (Drained), Weird Insight (strips a Stealth or buff) | knowledge |
| Intellect Devourer | A | 12–15 | Fl | 0.7 | 1.0 | R: Arcane | Small, targets casters | Devour Intellect (Stun 2 + temporary skill drain) | knowledge, dust |
| Grell | A | 12–16 | ✈ | 1.2 | 1.2 | I: Storm | Flying, Blindsight | **Snatch** (Stun, pulls a back-liner to the front) | dust |
| Chuul | A | 12–16 | F | 2.0 | 1.4 | I: Nature | Armored, Swimmer | Pincer (Root), Paralyzing Tentacles (Stun) | gems (pearls), ⚗ Storm |
| Mind Flayer | S | 17–22 | B | 1.4 | 1.2 | R: Arcane 50% | Caster, Magic Resistant, **Leader of thralls** | **Mind Blast** (telegraphed cone: Stun 2; WIS resists), Dominate (Charm 2), Extract Brain (execute a Stunned target) | knowledge ×2, ⚗ Arcane |
| Beholder | SS | 23–30 | ✈ | 3.0 | 1.6 | R: Arcane 50% | Flying, Legendary 3, **Antimagic Cone** (Silences 1–2 casters each round), All-around vision | **Eye Rays** ×3 random: Charm, Fear, Slow, Sleep, Petrify, Disintegrate, Enervation | gems ×3, 🏆 **Beholder Eye** |
| Aboleth | SSS | 30–38 | F | 3.5 | 1.7 | — | Swimmer, Legendary 3 | **Enslave** (telegraphed Charm 3), Mucus Cloud (Poison), Tentacle | 🏆 Aboleth Mucus, knowledge, Legendary 10% |

### 12.9 Fiends (C–SSS)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Imp | C | 5–9 | ✈ | 0.5 | 0.8 | I: Fire, Nature · R: physical 25% | Flying, **Invisible** (Stealth until it acts) | Sting (Poison) | ⚗ Ember, relics |
| Quasit | C | 5–9 | Fl | 0.5 | 0.8 | I: Nature · R: Fire, Frost | Invisible, Shapechanger | Scare (Fear) | ⚗ Umbral |
| Bearded Devil | B | 8–12 | F | 1.4 | 1.1 | I: Fire, Nature | Fearless | Glaive (**Infernal Wound**: Bleed that ignores the stack cap) | relics |
| Barbed Devil | A | 12–16 | F | 1.8 | 1.3 | I: Fire, Nature · R: Frost | Barbed Hide (melee attackers take Pierce) | Hurl Flame (Burn) | ⚗ Ember, relics |
| Chain Devil | A | 13–17 | F | 2.0 | 1.3 | I: Fire, Nature | Reach | Animate Chains (Root 2), Unnerving Mask (Fear) | iron, relics |
| Vrock | A | 12–16 | ✈ | 2.0 | 1.3 | R: Fire, Frost, Storm · I: Nature | Flying, Demon | **Stunning Screech** (telegraphed AoE Stun), Spores (Poison) | relics, 🏆 |
| Succubus / Incubus | A–S | 14–18 | Fl | 1.3 | 1.0 | R: Fire, Frost, Storm · I: Nature | Shapechanger | Charm, Draining Kiss (Drained) | relics, gold |
| Hezrou | S | 16–20 | F | 2.6 | 1.5 | R: elements · I: Nature | Demon, **Stench Aura** (1 Poison per round on the front row; CON resists) | Claws | relics, ⚗ Venom |
| Balor | SSS | 30–36 | F | 3.4 | 2.0 | I: Fire, Nature · R: Frost, Storm | Huge, Legendary 2, Fire Aura, **Death Throes** (huge Fire AoE when it dies: have a Barrier or Fire Ward ready) | Lightning Whip (pulls a back-liner forward), Flame Sword | relics ×3, 🏆 Balor's Whip, Legendary 12% |
| Pit Fiend | SSS | 32–40 | F | 3.6 | 2.0 | I: Fire, Nature · R: Frost, Storm, physical 25% | Huge, Legendary 3, Magic Resistant, Fear Aura | **Meteor** (telegraphed 2 rounds ahead), Poison Bite, Wall of Fire | relics ×3, Legendary 15% |

### 12.10 Dragons & kin (C–SSS)

**Every dragon:** Flying · **Frightful Presence** (Fear at fight start; WIS resists) · **Breath** (telegraphed; its element + status on a row or all) · Wing Buffet (knocks the front row back: Slow) · immune to its own element.

| Colour | Element / status | Weak to |
|---|---|---|
| Red | Fire / Burn | Frost |
| White | Frost / Freeze | Fire |
| Blue | Storm / Shock | Nature |
| Green | Nature / Poison | Fire |
| Black | Shadow (acid-dark) / Weaken | Holy |

| Stage | Rank | Lv | HP | DMG | Extra | Drops |
|---|---|---|---|---|---|---|
| Wyrmling | C–B | 6–11 | 1.4 | 1.2 | Medium | gold ×3, gems, ⚗ colour, 🗡 20% |
| Young Dragon | A–S | 13–20 | 2.4 | 1.5 | Large, Legendary 1 | gold ×6, gems ×2, 🏆 Dragon Scale, 🗡 30% (+1 rarity) |
| Adult Dragon | SS | 22–30 | 3.4 | 1.8 | Huge, Legendary 2, **Lair Actions** | gold ×10, 🏆, 🗡 40% (+1), Legendary 8% |
| Ancient Dragon | SSS | 32–40 | 4.5 | 2.1 | Gargantuan, Legendary 3, Lair Actions | hoard, 🏆, Legendary 20% |

**Kin:** Kobolds (§12.1) · **Dragonborn Cultist** (humanoid, classed, R: the dragon's element) · **Drake** (flightless, Large, C–B, breath).

### 12.11 Fey (C–S)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Pixie | C | 5–8 | ✈ | 0.3 | 0.4 | R: Arcane | Flying, Invisible | **Sleep Dust**, Polymorph (Silence + Weaken 2 rounds: "turned into a toad") | dust, herbs |
| Sprite | C | 5–8 | ✈ | 0.3 | 0.8 | — | Flying, Invisible | Sleep Arrow | dust |
| Satyr | C | 5–9 | F | 1.0 | 0.9 | R: Arcane | Magic Resistant | Panpipes (random: Sleep, Fear or Charm on a row) | food, gold |
| Redcap | C–B | 6–10 | F | 1.1 | 1.3 | — | Slow (iron boots), **Bloodlust** (heals when it causes Bleed) | Wicked Sickle (2 Bleed) | leather, 🗡 8% |
| Dryad | C–B | 6–10 | B | 0.9 | 0.8 | W: Fire · R: Nature | Tree Stride (moves rows) | Fey Charm, Entangle (Root row) | herbs, wood, ⚗ Venom |
| Green Hag | B | 8–12 | B | 1.4 | 1.1 | — | **Coven** | Illusory Lure (Evasive round 1), Claws | herbs, dust |
| Sea Hag | B | 8–12 | B | 1.3 | 1.0 | — | Swimmer, **Coven**, Horrific Appearance (Fear) | Death Glare (execute a Feared target below 25%) | gems, ⚗ Storm |
| Night Hag | A | 13–17 | B | 1.6 | 1.2 | R: Fire, Frost, physical 25% | Fiend-touched, **Coven** | Nightmare Haunting (Sleep + Drained), Etherealness | relics, 🏆 Heartstone |

**Coven:** while all three hags are alive they share *Lightning Bolt, Hold Person and Counterspell*. Killing one breaks the coven.

### 12.12 Underdark folk (D–A)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Troglodyte | D | 3–6 | F | 1.0 | 0.9 | — | **Stench** (−ACC aura), Stealthy | Club | leather, food |
| Kuo-toa | C | 5–9 | F | 0.9 | 0.9 | — | Swimmer, **Sticky Shield** (a blocked attacker is Weakened) | Spear | gems (pearls), food |
| Rust Monster | C | 5–9 | F | 1.0 | 0.4 | — | **Rust** (hitting it with metal Sunders you) | Antennae (Sunder) | iron ×2 |
| Sahuagin | C–B | 6–10 | F | 1.0 | 1.1 | — | Swimmer, Blood Frenzy (+ACC vs targets below 50% HP) | Trident | gems (pearls) |
| Duergar | B | 8–12 | F | 1.2 | 1.1 | R: Nature · I: Charm | **Enlarge** (×1.5 damage for 2 rounds), Invisibility | Warpick | iron, 🗡 12% |
| Drow Warrior | B | 8–12 | F | 1.0 | 1.1 | I: Sleep · R: Charm | Darkvision, **Sunlight Sensitivity** (−ACC when Holy/light is present) | Poisoned Crossbow (Sleep chance), Darkness | gold, 🗡 12% |
| Kuo-toa Whip | B | 8–12 | B | 1.1 | 1.0 | — | Swimmer, Leader, Caster | Shocking Grasp (Storm; Stun on Wet), Bless | pearls, ⚗ Storm |
| Hook Horror | B | 8–12 | F | 1.6 | 1.3 | — | Blindsight, **Echolocation** (Storm/thunder hits Stun it) | Hooks (Bleed) | leather, 🏆 |
| Drow Priestess | A | 12–16 | B | 1.3 | 1.1 | I: Sleep | Leader, Caster | Summon Spider, **Darkness** (Blind a row), Heal allies | relics, 🗡 15%, **Class Tome 2%** |
| Drider | A | 12–16 | F | 1.8 | 1.3 | — | Large, Wall-climber | Web (Root), Longbow Volley | cloth, 🗡 10% |
| Umber Hulk | A | 12–16 | F | 2.2 | 1.4 | — | Large, **Burrower** | Confusing Gaze (Confuse), Claws | stone, gems |

### 12.13 Monstrosities (C–SS)

| Monster | Rank | Lv | Row | HP | DMG | W / R / I | Tags | Abilities | Drops |
|---|---|---|---|---|---|---|---|---|---|
| Cockatrice | C | 5–8 | ✈ | 0.6 | 0.6 | — | Flying | Petrifying Bite (Slow → Petrify) | food, leather |
| Harpy | C | 5–9 | ✈ | 0.8 | 0.9 | — | Flying | **Luring Song** (Charm one target per round; elves resist), Talons | leather, gold |
| Basilisk | B | 8–12 | F | 1.6 | 1.1 | — | **Petrifying Gaze** (Blind attackers immune; mirror shields reflect it) | Bite (Poison) | 🏆 Basilisk Eye |
| Bulette | B | 8–12 | F | 1.8 | 1.4 | — | Burrower, Armored | Deadly Leap (front-row Stun) | leather, stone |
| Roper | A | 12–16 | F | 2.2 | 1.2 | — | Ambusher, Reach | **Reel** (pulls a back-liner to the front + Root), Weakening Tendril | gems, stone |
| Chimera | A | 12–16 | ✈ | 2.0 | 1.4 | — | Flying, Large, **Three Heads** (3 attacks) | Fire Breath (telegraphed) | leather, ⚗ Ember |
| Gorgon | A | 13–17 | F | 2.4 | 1.4 | — | Large, Armored | **Petrifying Breath** (telegraphed row), Trample | iron, 🏆 |
| Medusa | A | 13–17 | B | 1.6 | 1.2 | — | **Petrifying Gaze aura**, Snake Hair (Poison) | Longbow | gold, gems, 🏆 **Medusa Head** |
| Hydra | A–S | 14–20 | F | 3.0 | 1.0 per head | — | Huge, **Heads** (starts with 5 = 5 attacks; each 20% max HP of slash in a round cuts off a head, and 2 grow back next round **unless Fire hit it that round**) | Bites | 🏆 Hydra Blood |
| Remorhaz | S | 16–20 | F | 2.6 | 1.6 | I: Fire, Frost | Huge, Burrower, Heated Body | Swallow (Engulf) | ⚗ Rime/Ember, 🏆 |
| Purple Worm | SS | 22–28 | F | 4.0 | 1.8 | — | Gargantuan, Burrower | Swallow (Engulf), Tail Stinger (Poison) | gems ×3, 🏆 |

### 12.14 Humanoid factions (classed NPCs)

These stay on the **existing NPC generator**, now with class trees and gear, so they drop the most equipment. Each gets a race + class package:

| Group | Members | Tags / twist | Where |
|---|---|---|---|
| **Bandits** (Ash Company) | Thug (Fighter), Cutpurse (Rogue), Hedge Mage (Wizard), Captain (Fighter + Leader) | Gear drops ×2 | Bandit Stronghold, raids |
| **Orc Warband** (Gorehand) | Orc (Barbarian), Eye of Gruumsh (Cleric + Leader), Orog (Fighter) | *Relentless* | Warrens, surface raids |
| **Gnoll Pack** | Gnoll, Pack Lord (Leader), Fang of Yeenoghu (A) | **Rampage** (extra attack after a kill) | Beast Hollows |
| **Lizardfolk** | Lizardfolk, Shaman (Druid) | Swimmer, Hold Breath | Drowned Grotto |
| **Cult of the Rift** (Sunken Choir) | Fanatic (Warlock), Cult Priest (Cleric + **Summoner** of fiends) | **Ritual clock** (§13) | Infernal Breach, Crypt |
| **Yuan-ti** | Pureblood (Rogue/Warlock), Abomination (A, Large) | Magic Resistant, Poison immune | Fungal Depths, Drowned Grotto |

---

## 13. Encounter templates

An **encounter template** says *who comes together and why*. Each one points to a strategy, and that's the answer to "complex parties that suggest strategic approaches". The generator fills templates to the room's power budget (§14.1).

| # | Template | Rank | Composition (leader **bold**) | The twist | The answer |
|---|---|---|---|---|---|
| 1 | **Goblin Ambush** | E | **Bugbear**, 3 Goblins, 2 Goblin Archers | Bugbear strikes the back row in round 1 | Tank with *Challenge*; don't leave a fragile healer alone in the back; AoE |
| 2 | **Kobold Trapline** | E–D | **Kobold Scale Sorcerer**, 4 Kobolds, Trapper | Room traps before the fight; pack tactics | A trapwise scout / Rogue; AoE; kill the Sorcerer |
| 3 | **Rat Nest** | E | 3 Rat Swarms | Swarms shrug off single-target hits | **Bring AoE** (Cleave, Fireball, Volley) |
| 4 | **Wolf Pack** | E–D | **Dire Wolf**, 3 Wolves | Pack Tactics while the alpha lives; Trip | Focus the alpha; Stun resistance |
| 5 | **Hobgoblin Phalanx** | D–C | **Hobgoblin Captain**, 3 Soldiers, 2 Goblin Archers | Shield Wall front is very hard to hit | Go *over* it: magic, Reach, Rain of Arrows; Sunder; kill the Captain |
| 6 | **Spider Nest** | D–C | **Drider** (C+) or Giant Spider ×3, Ettercap | Web Roots the party round 1; Poison | **Fire** (burns webs), Antidotes, Cleanse |
| 7 | **Myconid Circle** | D–C | **Myconid Sovereign**, 3 Sprouts, **Shrieker** | The Shrieker calls reinforcements | **Kill the Shrieker first** (ranged); Clarity vs Confuse |
| 8 | **Shambling Dead** | D | 5 Zombies, 2 Skeleton Archers | Undying zombies keep standing | **Holy/Fire finishers**, Crush for skeletons |
| 9 | **Necromancer's Court** | C–B | **Wight** or Cult Necromancer, 2 Skeleton Warriors, Ghoul | Telegraphed *Raise Dead* every 3 rounds; Ghoul paralysis | **Interrupt or Silence the caster**; elves vs paralysis; Holy AoE |
| 10 | **Ooze Pit** | C | **Gelatinous Cube**, Gray Ooze, Black Pudding (B) | Slashing splits the pudding; the cube Engulfs; corrosion | **Crush, Fire, Frost**. Leave the axes at home |
| 11 | **Troll Bridge** | C–B | **Troll** ×1–2, Ogre | Regenerates unless Fire or Nature | **Fire finishers**: Alchemist's Fire, Fire Wizard, *of Embers* weapons |
| 12 | **Harpy Roost** | C–B | 4–6 Harpies | Flying; Luring Song Charms | **Ranged, Grounding**, Countercharm; elves resist |
| 13 | **Mephit Storm** | B | **Fire Elemental**, 4 Magma Mephits | Mephits explode on death; burning aura | Fire Wards; **Frost** ranged; don't melee the elemental |
| 14 | **Frost Giant Hunt** | A | **Frost Giant**, 2 Winter Wolves, 2 Ice Mephits | Telegraphed frost breaths; Freeze + Shatter on *you* | **Interrupt breaths**, Frost Wards, Fire |
| 15 | **Drow Patrol** | B–A | **Drow Priestess**, 2 Drow Warriors, Giant Spider | Darkness blinds a row; sleep poison | **Holy/light**; elves immune to Sleep; Cleanse |
| 16 | **Kuo-toa Congregation** | B | **Kuo-toa Whip**, 4 Kuo-toa (Archpriest in the lair) | Everyone is **Wet**: their lightning Electrocutes you | **Storm Ward** potions; your own Storm is huge on them too |
| 17 | **The Ritual** | B–S | **Cult Priest**, 3 Fanatics, Imp | **After 5 rounds a Vrock is summoned** | **Burst fast**: Haste potions, focus the Priest |
| 18 | **Golem Vault** | A | **Hedge Archmage** (classed), Shield Guardian, 2 Animated Armors, Flying Swords | The Guardian soaks the mage's damage | Silence the mage or kill the Guardian first; **Storm + Crush** |
| 19 | **Mimic Hoard** | any | A treasure room where one chest is a Mimic | Surprise round | *Detect Magic*, the Scholar's *Analyze*, or accept the hit |
| 20 | **Hydra Pool** | A–S | **Hydra** | Cutting heads grows more | **Fire every round**, or crush it down |
| 21 | **Hag Coven** | A–S | **Night Hag**, Green Hag, Sea Hag | Shared spells while all three live | **Focus one hag**; Counterspell |
| 22 | **Gaze Garden** | A | **Medusa**, Basilisk, Cockatrices | Petrify stacks everywhere | **Mirror Visor / Mirror Shield**, Blind yourself (Smoke Bomb), Stone Salve |
| 23 | **Vampire's Court** | S | **Vampire**, 2 Vampire Spawn, Bat Swarms | Regenerates; Mist Form escape | **Holy killing blow**; Holy Water; Paladins and Clerics |
| 24 | **Mind Flayer Colony** | S–SS | **Mind Flayer** ×2, Intellect Devourers, 2 charmed thralls (humanoids) | Mind Blast stuns, then Extract Brain executes | **Interrupt Mind Blast**, high-WIS party (Monk, Cleric), Clarity helms |
| 25 | **Beholder's Lair** | SS | **Beholder**, 2 Nothics | Antimagic silences casters; random rays | **Martial-heavy party**; status resistance; Cleansers outside the cone |
| 26 | **Dragon's Lair** | S–SSS | **Dragon**, Dragonborn Cultists, Kobolds or Wyrmlings | Frightful Presence, telegraphed breath, lair actions | **Matching Ward potions**, Fear immunity (Aura of Courage), **Grounding**, interrupt the breath |
| 27 | **Lich's Sanctum** | SSS | **Lich**, 2 Death Knights | The Lich **returns at 50% HP after 3 rounds** unless its **phylactery room** was found and broken earlier in the delve | **Explore the side rooms first**; a delve-level plan |
| 28 | **Infernal Warlord** | SSS | **Balor** or **Pit Fiend**, Barbed Devils, Hell Hounds | Death Throes explosion; Meteor | Fire immunity (**tieflings shine**), Barrier timed for the kill |

**Leaders and minions:** templates list a leader plus a pool of allowed minions per rank. At higher ranks the same template fills with bigger minions (a Goblin Ambush at rank B has Hobgoblins and a Bugbear Chief).

---

## 14. Spawning, scaling and drops

### 14.1 Encounter budget

- Every combat room gets a **threat budget** = `riftTargetDanger(level)` (existing) × biome difficulty × room factor (fight 0.6–0.8, lair 1.0) × **day factor** (+5% for each day already spent at this Rift level).
- The generator picks a **template** weighted by biome, rank and room shape, places the leader, then fills minions until the budget is met. Each monster's cost is its `powerOf()`, which now includes HP/DMG multipliers, tags (Flying ×1.15, Regenerating ×1.2, Legendary ×1.3 per action…) and abilities.
- **Wandering monsters:** harvesting in a node room, and Shriekers, pull a small template (~25% budget) from the biome.

### 14.2 Elites and champions (keeping low-rank biomes relevant)

Past a biome's native rank, its monsters get **affixes** instead of disappearing:

| Affix | Effect |
|---|---|
| **Elite** | +50% HP, +20% damage |
| **Champion** | ×2 HP, one extra ability, Poise +1 |
| *Fire-touched / Frost-touched / Storm-touched* | Attacks gain that element; RES to it |
| *Vampiric* | Heals 25% of its damage |
| *Shielded* | Starts with a 30% Barrier |
| *Frenzied* | Haste below 50% HP |
| *Teleporting* | Swaps rows each round |
| *Warded* | Magic Resistant |

Chance: 5% per rank above native, up to 40%. Bosses get one affix per rank above native.

### 14.3 Night waves

- Each biome has a **wave table**: the subset of its monsters that can crawl out (e.g. Crypt → zombies, skeletons, ghouls, wights; Ember Forge → mephits, hell hounds, azers).
- Waves use the existing `waveForecast()` sizing against defender power. The Party screen's forecast now says **what** is coming, not just how many.
- Waves pick **siege templates**: fliers that bypass barricades, burrowers that surface inside the walls, and so on. That sets up future camp-defence structures (towers vs fliers, spikes vs burrowers).

### 14.4 Drop tables

**Every kill** rolls its family table, scaled by monster level. **Gear** rolls are separate and rarer. **Essences** are a new reagent stash (kept off the top bar) that feeds enchanting, spellcraft and ward potions.

| Family | Resources (weight) | Essence | Gear chance · type | Trophy examples |
|---|---|---|---|---|
| Goblinoid | gold 3, iron 2, leather 2, food 1 | — | 6% · martial weapons, light armor | — |
| Beast | leather 4, food 4 | Venom (spiders) | 1% | Dire Pelt, Owlbear Plume, Displacer Hide, Griffon Feather |
| Undead | relics 2, dust 3, cloth 1 | Umbral, Radiant (rare) | 5% · old armor/weapons | Vampire Fang, Phylactery Shard |
| Ooze / Fungus | dust 2, herbs 3 | Venom | **25% for cubes** (undigested) | — |
| Elemental | gems 2, stone 2 | **its element (100%)** | 3% | — |
| Giant | food 3, gold 3, stone 2, iron 2 | Ember/Rime (fire/frost giants) | 10% · great weapons | **Troll Heart** |
| Construct | iron 4, gems 1, dust 2 | Arcane | **15% · armor** (animated armor) | Golem Core, Guardian Amulet |
| Aberration | knowledge 3, dust 3, gems 1 | Arcane | 4% · **cursed epics** | Beholder Eye, Aboleth Mucus |
| Fiend | relics 3, gold 2 | Ember, Umbral | 8% | Balor's Whip, Heartstone |
| Dragon | **gold 8**, gems 4 | its colour | 20–60%, **+1–2 rarity** | **Dragon Scale** (Dragonscale Mail) |
| Fey | herbs 3, dust 3, cloth 1 | Radiant, Arcane | 4% · charms | — |
| Underdark | iron 3, gold 2, gems 1 (pearls) | Storm (kuo-toa) | 12% · rapiers, crossbows, chain | Class Tome 2% (Priestess) |
| Humanoid factions | as today | — | **their own equipment** (18%/14%, as today) | — |

**Rarity roll:** rank table from §10.3; bosses roll +1 step; Reckless stance and the *greedy* trait add a little (existing loot bonuses stay).

---

## 15. Rift biomes

### 15.1 Daily roll

- At **dawn** the Rift rolls today's biome, weighted by the current rank. **The biome holds all day**; the room layout still reshapes after each party entry (as now).
- **Eligible:** biomes whose native range includes the current rank, plus lower-rank biomes (with elite affixes, weight tapering off).
- **Rift Surge (10%):** a biome **one rank above**. Danger ×1.25, loot ×1.5, flagged in red on the Party screen. *Risky days are opt-in, because delving is.*
- **Rare biomes:** Dragon's Lair and Feywild Hollow, ~4% each once eligible.
- The **forecast** on the Party tab shows the biome, its environment rule, **known** weaknesses (from the bestiary, §16) and tonight's wave type.

### 15.2 The fifteen biomes

| Biome | Ranks | Layout style | Environment rule | Monsters | Harvest nodes | Loot structures | Signature rewards |
|---|---|---|---|---|---|---|---|
| **Goblin Warrens** | E–C | *Warren*: many branches and loops, small rooms | **Cramped**: Large creatures −2 DEF; ambush +10% | Goblinoids, kobolds, worgs, rats | Scrap heaps (iron), mushroom patches (food) | Stolen stashes, **prisoner cages** (recruits!) | Martial gear, recruits |
| **Beast Hollows** | E–B | *Glade hub*: open clearings around a centre | **Overgrown**: Nature +25%; Fire spreads Burn to neighbours on both sides | Wolves, owlbears, displacer beasts, griffons, gnolls | Timber stands (wood), game trails (food, leather), herb beds | **Nests with eggs** (tameable beasts come home) | Tameables, leather |
| **Bandit Stronghold** | E–A | *Fortress*: gatehouse → yards → keep | **Fortified**: defenders +3 DEF behind barricades until Sundered or hit by AoE | Humanoid factions (classed), war dogs | Stolen goods piles | Strongboxes (locked), **armory racks** | **Most gear**, gold |
| **Fungal Depths** | D–B | *Cave chain* with spore pockets | **Spores**: Nature +25%; **Fire triggers Spore Burst** (hits both sides) | Myconids, oozes, violet fungus, shriekers, carrion crawlers, yuan-ti | Mushroom forests (food, herbs), glowcaps (dust) | Digested remains (gear), spore sacs | Herbs, ⚗ Venom, potions |
| **Sunken Crypt** | D–A | *Crypt spine*: long corridor with side niches and sealed doors | **Hallowed dark**: Holy +25%, healing −20%, Darkness (no Darkvision: −ACC) | Skeletons, zombies, ghouls, wights, wraiths, mummies, banshees | Ossuaries (relics), grave-dust (dust) | **Sarcophagi** (loot; 30% a mummy/wight rises), reliquaries | Relics, ⚗ Umbral/Radiant, old armor |
| **Collapsed Mine** | D–A | *Shafts*: descending levels | **Unstable**: a Crush crit may trigger a Cave-in (damage to both front rows) | Duergar, kobolds, umber hulks, rust monsters, earth elementals, hook horrors | **Ore seams (iron, gold), gem geodes**: the richest nodes | Ore carts, foreman's lockbox | Iron, gold, gems |
| **Web Hive** | D–A | *Hive*: radial around a brood chamber | **Webs**: party Rooted round 1 unless Fire is used or *Freedom* | Giant spiders, ettercaps, phase spiders, driders, ankhegs, swarms | Silk (cloth), chitin (leather) | **Cocoons** (loot, or a living victim to rescue), egg sacs | Cloth, ⚗ Venom |
| **Drowned Grotto** | C–A | *Island chain*: rooms joined by flooded passages (swim checks; failing costs HP) | **Flooded**: everyone Wet; non-Swimmers −2 ACC; Storm ×1.5 | Kuo-toa, sahuagin, lizardfolk, water elementals, chuuls, sea hags, hydras | Pearl beds (gems), kelp (food, herbs) | **Shipwreck chests**, tide shrines | Gems, ⚗ Storm |
| **Ember Forge** | C–S | *Hub*: central forge with spokes | **Scorching**: Fire +25%, Frost −25%; no Fire RES = −3% HP per round | Salamanders, azers, magmins, mephits, fire elementals, hell hounds, fire giants, red dragons | Obsidian and ore veins, **magma vents (⚗ Ember)** | **Forge anvils** (upgrade one item in the field), smelter caches | Iron, gold, ⚗ Ember, weapons |
| **Rime Caverns** | C–S | *Ice labyrinth*: slippery bridges (DEX checks) | **Frigid**: Frost +25%; everyone starts each fight with 1 Chill unless Warded | Ice mephits, winter wolves, yetis, remorhaz, frost giants, white dragons | Frozen ore, ice crystals (⚗ Rime) | **Frozen adventurers** (their gear, sometimes a thawed recruit), cold vaults | ⚗ Rime, armor |
| **Feywild Hollow** *(rare)* | C–S | *Circle*: looping paths that reshuffle after each fight | **Enchanted**: Charm/Sleep last +1 round; healing +20% | Pixies, sprites, dryads, satyrs, redcaps, hags, displacer beasts | Moonflowers (herbs, dust), fairy rings (⚗ Radiant/Arcane) | **Fey bargains** (gold for a boon, or a curse), hidden glades | Herbs, potions, charms |
| **Arcane Sanctum** | B–SS | *Gated*: rooms locked behind puzzles and keys | **Ley-charged**: Arcane +25%, spell cooldowns −1; **Wild Magic** (10% per round, a random effect) | Golems, animated armor, flying swords, mimics, shield guardians, spectators, classed mages | Ley crystals (dust), **libraries (knowledge)** | **Bookcases (scrolls, spellbooks, Class Tomes)**, orreries (puzzle → Insight) | Books, ⚗ Arcane |
| **Infernal Breach** | A–SSS | *Gauntlet* with a **ritual clock** (every 3 rooms a stronger fiend joins the lair) | **Hellfire**: Fire can't be fully resisted (immune → 50%); Fear +1 round | Imps, quasits, hell hounds, devils, demons, cultists, balor/pit fiend | Brimstone (⚗ Ember), soul gems (gems) | **Infernal altars** (bargain: power now, curse later) | Relics, gold, trophies |
| **Aberrant Deep** | S–SSS | *Rings*: layered, and **rooms re-link after a fight** | **Maddening**: 5% per round a party member is Confused (WIS resists) | Beholders, mind flayers, aboleths, mouthers, intellect devourers, grells, nothics | Psionic crystals (dust, gems) | **Alien cysts** (cursed Epics: strong, with a drawback) | Knowledge, ⚗ Arcane, cursed legendaries |
| **Dragon's Lair** *(rare)* | any (scaled), native S+ | *Gauntlet → hoard* | **Lair actions** by colour (Red: magma eruptions, White: freezing fog, Blue: lightning, Green: poison mist, Black: darkness) | A dragon + kobolds / dragonborn / wyrmlings | Hoard piles | **The Hoard** | Gold, gems, **Legendary chance** |

### 15.3 How a biome generates

Each biome is data: `{ layout, roomWeights, nodeTypes, lootTypes, envRule, templates, waveTable, palette }`. The generator:

1. **Layout** (room graph shape):
   - `warren`: dense spanning tree + many loops
   - `spine`: a long main path with 1-room side niches
   - `hub`: a central room with spokes
   - `islands`: chain + flooded links
   - `shafts`: 3 levels, each linked down
   - `rings`: concentric, with relinking
   - `gated`: keys in side rooms open the main path
   - `gauntlet`: linear toward the lair
   - `fortress`: gate → yards → keep
   - `circle`: a loop that reshuffles
2. **Room kinds**, from the biome's weights. New kinds join the existing ones (fight, trap, treasure, shrine, puzzle, rest, lair):
   - **Node**: harvestable
   - **Vault**: loot structures
   - **Prison**: cages or cocoons, with recruit chances
   - **Nest**: eggs to tame
   - **Key**: for gated layouts
   - **Phylactery**: Lich only
3. **Room size and shape** from a small template library (§15.4). Shape gives the room its **combat trait**.
4. **Encounters** from templates and the budget (§14.1).
5. **Scaling to the day:** budget × day factor; loot × the same factor, so staying longer at a level pays.

### 15.4 Simple room layouts

Each room is a small tile map. It's used for the new **Rift Map** view and gives the room its combat trait. Biomes reskin the same templates (Crypt: `S` sarcophagi; Forge: `~` lava; Grotto: `≈` water).

Legend: `#` wall · `.` floor · `D` door · `o` brazier/light · `x` pillar · `%` ore/node · `$` chest · `S` sarcophagus · `B` boss dais · `~` hazard · `c` cage · `e` nest

```
PILLARED HALL (9×7)        CHOKEPOINT (9×5)          NODE CHAMBER (8×7)
#########                  #########                 ########
#.x...x.#                  ####.####                 #%%...%#
#.......#                  D...o...D                 #%.....#
D...o...D                  ####.####                 D..o...#
#.......#                  #########                 #.....%#
#.x...x.#                                            #%%..%%#
#########                                            ########
trait: Pillared            trait: Chokepoint          trait: Open
(ranged −2 ACC vs          (2 front slots max)        (harvest here: each round
 back row; cover)                                      rolls a wandering monster)

VAULT (7×6)                CRYPT NICHE (9×5)          LAIR (11×9)
#######                    #########                  ###########
#$...$#                    #S.S.S.S#                  #.x.....x.#
#.....#                    D.......#                  #.........#
D..o..#                    #S.S.S.S#                  D....B....D
#$...$#                    #########                  #.........#
#######                                               #~~.....~~#
trait: Treasure            trait: Dark, Narrow        #.x.....x.#
(1 chest may be a Mimic)   (sarcophagi may rise)      ###########
                                                      trait: Open Hall + lair actions
```

**Room traits:**
- **Open Hall**: 4 front slots; flankers reach the back row freely.
- **Chokepoint**: 2 front slots.
- **Pillared**: cover for the back row.
- **Dark**: −ACC without Darkvision or a light source (braziers, the *Light* spell, a torch charm).
- **Elevated**: ranged +2.
- **Hazard**: lava or water knockback into the hazard.

### 15.5 Harvesting and loot structures

- **Harvesting:** after a node room is cleared, the party may spend **harvest rounds**. Stance sets the default: Cautious 1, Balanced 2, Reckless 4 (overridable on the party screen). Each round yields resources × the best relevant skill (mining, survival, woodcutting, farming) and has a **15% + biome** chance to pull a wandering encounter. Pack beasts raise the carry cap (existing).
- **Loot structures:**

| Structure | Opened with | What it does |
|---|---|---|
| Chest | lockpick = stealth (existing) | May be trapped; may be a **Mimic** |
| Sarcophagus | — | Loot, with a chance an undead rises |
| Armory rack | — | Gear roll |
| Bookcase | Research | Scrolls, spellbooks, rarely a Class Tome |
| Cage / Cocoon | — | A prisoner; the existing recruit path |
| Nest | Animals skill | An egg becomes a **tameable juvenile** (links to husbandry) |
| Altar | — | A bargain: a buff now, a curse later |
| Hoard | — | Big gold and gems |
| Forge anvil | Smithing | Upgrade one carried item |
| Frozen corpse | — | Gear, or a thawed recruit |

---

## 16. UI changes

| Where | What |
|---|---|
| **Colonist inspector → new *Class* tab** | The skill tree: tier columns, actives with their 4 specs below, points left, loadout slots, tactics preset, respec |
| **Colonist inspector → *Gear* tab** | A paper doll with 6 slots and a potion belt. Rarity colours, element badges, resist summary ("🔥 +50% ❄️ −0% ⚡ +25%") |
| **Party tab** | Today's **biome card** (environment rule, known weaknesses, surge warning). A **matchup readout**: the elements your party deals vs what's known to hurt today's monsters. Front/back **row slots** (drag to arrange). Harvest-rounds setting |
| **New *Rift Map* view** (inside Party) | The room graph drawn with the tile templates in the new renderer style. Visited, cleared and current rooms; icons for node, vault, lair and phylactery |
| **Lore tab → new *Bestiary*** | Monsters met. **Knowledge grows with kills**: 1 kill shows stats and tags, 3 kills show weaknesses, 10 kills give +5% damage against it. The Scholar's *Analyze*, Library research and some books reveal entries early |
| **Delve report** | Per fight: round-by-round log with element and status icons, damage by colonist, *"what hurt us"* (top incoming damage type), telegraphs interrupted |
| **Schools** | Structure panel: students, instructor, progress, target class |
| **Spellmason / Magic Lab** | Shop grid; spell designer (Form / Element / Modifiers with a live budget bar) |
| **Map** | Night waves show monster silhouettes and family colours; fliers drawn with a shadow offset |

---

## 17. Build phases

Each phase ships on its own: tests green, autoplay still playing, the game still fun.

| Phase | Content | Depends on | Size (rough) |
|---|---|---|---|
| **1. Combat core** | `combat.js`: rows, damage types, RES, 25 statuses, combos, telegraphs, Poise, threat, tags. Race tags. Existing abilities re-expressed (elements + statuses). Night siege uses it | — | ~900 lines + tests |
| **2. Monster library** | `monsters.js`: 12 families, ~110 monsters, 28 templates, budget spawner, elite affixes, drop tables, essences stash. Existing theme dungeons use monsters instead of generic factions. Bestiary v1 | 1 | ~1,400 lines (mostly data) |
| **3. Classes and trees (tiers 1–2)** | `classes.js`: 12 classes × 8 actives × 4 specs (~400 nodes), milestone passives, loadout, tactics presets, weapon locks, stat focus, new XP curve to 40. Class tab UI. Autoplay allocates points | 1 | ~1,600 lines (mostly data) + UI |
| **4. Gear and potions** | `items.js`: 6 slots, weapon families, 5 rarities, affixes and elemental affinities, Epic passives, ~12 legendaries, crafting bills, potion belt and ~16 potions. Gear tab UI | 1, 3 | ~900 lines + UI |
| **5. Rift biomes** | `biomes.js`: 15 biomes, 10 layout styles, room templates and traits, harvest nodes, loot structures, daily roll + surge + forecast, wave tables. Rift Map view | 2 | ~1,100 lines + renderer work |
| **6. Schools and magic economy** | Combat/Mage School → Academies, conversion flow, Class Tomes, tiers 3–4 + prestige for all 12 classes (~400 more nodes), Arcane Peddler caravan, Spellmason, Magic Lab spellcraft + book writing, General ability pool | 3, 4 | ~1,500 lines + UI |
| **7. Balance pass** | Bench: survival and death rates by rank, level-vs-Rift curve, economy of essences and gear. Tune multipliers | all | tuning |

**Testing** is added in each phase:
- **Unit tests:** damage pipeline, each status, each combo, Poise, telegraph interrupts.
- **Data validation:** every tree has 4×4 per tier and all IDs resolve; every template references real monsters; every biome has templates for each of its ranks.
- **Determinism:** same seed gives the same biome and layout.
- **Calibration:** Rift danger still tracks `riftTargetDanger()`.
- **Bench:** 120-day autoplay survival doesn't collapse.

---

## 18. Decisions I need from you

1. **Level cap 40** (4 tiers; tiers 3–4 through Academies)? The alternative is 30 with 3 tiers.
2. **Loadout:** 4 active slots (+1 at 20, +1 at 30), or every learned active usable?
3. **Divine classes** (Cleric, Druid, Paladin): taught at the Mage/Combat Schools as proposed, or a third **Temple → Cathedral** line?
4. **Armor comfort penalties** (soft) as in §6.2, or no penalties at all?
5. **Shields class-locked** like weapons (my reading of "shields for defensive classes")?
6. **Prestige:** one title per class to start, or two branching paths from day one?
7. **Charm slot**: add a 6th slot (amulet/ring for trophies like Troll Heart), or keep 5?
8. **Combat stays auto-resolved** with tactics presets? Hands-on turn-by-turn control would be a separate, much larger project.
9. **Build order:** I'd go 1 → 2 → 3 → 4 → 5 → 6. If you'd rather *see* biomes sooner, 5 can move ahead of 3 and 4 (it only needs 1 and 2).
