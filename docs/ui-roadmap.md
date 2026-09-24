# Rift Gate — UI Revamp & QoL Roadmap

*Status: **mostly built** (2026-09-24). Built: §3 keywords (`src/keywords.js`, traits everywhere, resource costs), §4 inspector (bare ground closes it; tile survey folded), §5 (People › Classes, Class tab, R/T/N keys, urgency rings, alert stack capped at three with a gold "decision" kind, Rift goal card, gold-first resource bar), §6 in part (colonist overview leads with mood and its reasons; skills and attributes folded), §7 in part (Esc closes a thing's panel before the window behind it). Not yet: the action popover, a 📌 pin, the resource bar's "More" fold, phone drag handle, §8. Companion docs: `docs/progression-roadmap.md` and `docs/tutorial-roadmap.md`.*

## 1. What the code shows

The four reported problems, each traced to where it happens.

### 1.1 Important things are buried or look unimportant

| Action | How many steps today | Where |
|---|---|---|
| **Change a colonist's class** | portrait → **Skills** tab → "*Class* tree ›" button → **Class** tab → enrol | `ui.js` `classChangeHtml`; the enrol buttons don't render at all until a school or tome exists |
| **Sell for gold** (66% of gold income, see the progression doc §1.3) | **World** tab → **Market** sub-tab, and only while a caravan is here | `UI.GROUPS.region` |
| **Know how to finish the Rift** | nowhere | — |
| **Research, Rift, World tabs** | no hotkey (only Build, People and Colony have B/W/C) | `UI.RAIL` |
| **Fields & Animals, Workshop, Chronicle** | Colony tab → a sub-tab | `UI.GROUPS.colony` |

- **The rail treats every tab the same.** It's "RimWorld's main-tab bar: a flat row of equal buttons": same size, same colour. The only urgency cue is a small dot. It shows for 3 of 6 tabs, and Research only shows "!".
- **Alerts don't rank.** The stack lists up to 17 kinds in one column, each with a severity stripe. "Caravan in town" (a gold opportunity) and "Idle colonists: 2" get the same `warn` style.

### 1.2 Keywords look different in every panel

| Keyword | Rendered as |
|---|---|
| Colonist traits | a `.tag` chip in the inspector, the roster and the recruit card (3 places); plain comma text in hover tooltips (`tips.js:153`); **never coloured good or bad**, even though the data carries the sign (`mood: +8` / `-8`) |
| Beast traits | a `.tag` chip in the beast inspector; comma text in the Fields & Animals list (`ui.js:2750`) and in tooltips (`tips.js:203`) |
| Resources | an emoji from `RESOURCE_ICON` in some places, plain names in others (e.g. the storage-full alert uses `RESOURCES[k].name`, with no icon) |
| Status words | `.badge good/bad/warn/info` (≈10 uses), inline `style="color:var(--good)"` (dozens), and `.chip` (3 uses): three systems for one idea |
| Thoughts | rows coloured by their sign, with inline styles |

The result: the same trait reads as a grey pill in one panel and as bare text in the next. Nothing tells the player that Pessimist is bad.

### 1.3 The inspector opens when it isn't wanted

- In `selectAt()`, any left-click that doesn't hit a colonist, visitor, raider, beast or the gate **opens the tile inspector** (`this.sel = { kind: 'tile', x, y }`).
- That means **every click on empty ground** opens a panel.
- On a phone (`placeInspector`), the panel is a full-width sheet that covers the map.
- The tile panel itself leads with low-value rows: `tile x,y` as the subtitle, "Terrain: Grass", and Integrity as a raw number.

### 1.4 Too much low-value data (the list in the request was cut off)

The panels most likely meant, by how much data they show at once:

- **Colonist overview:**
  - 3 need bars;
  - injuries;
  - traits;
  - 4 thoughts;
  - 4 bonds;
  - background and faction.
- **The Skills tab:** all skills, sorted, including skills at 0.
- **Region drawer header:** 5 stat counts (Charted, Settlements, Hostile, Resources, Landmarks). None of them lead to anything to do.
- **The tile inspector** (§1.3).

**Please send the rest of that list,** and this section will be updated to cover exactly those panels.

---

## 2. Principles

1. **Three levels of importance, used everywhere.**
   - **Primary:** a decision is waiting, and ignoring it costs something. Gold/amber accent, larger, animated once.
   - **Secondary:** useful now. Normal weight, with an icon.
   - **Tertiary:** reference only. Dim, collapsed, or shown on hover.
2. **One keyword system.** A thing that's the same in the game looks the same on screen: icon + name + sentiment colour + the same tooltip, whichever panel it's in.
3. **Click to act, hover to read.** A left-click on the map commands or selects. Information comes from hover (it already exists: `mapTipKey`), or from an explicit click on *something*.
4. **Show outcomes, not internals.** "Works 25% faster", not "`work: 0.25`". "Rift deepens in 2 days", not "RIFT_DAYS_PER_LEVEL".
5. **Progressive disclosure.** Every panel leads with ≤ 5 lines. The rest goes behind a "Details ▾" fold that remembers its state (`localStorage`, try/catch as elsewhere).

---

## 3. P0: the keyword system

A single helper, `kw(type, id, opts)`, in a new `src/keywords.js` (UI-only). It returns
`<span class="kw kw-{type} kw-{sentiment}" data-tip="{type}:{id}">{icon} {name}</span>`.

| Type | Icon source | Sentiment |
|---|---|---|
| `trait` | a new `TRAIT_ICON` (or its first emoji) | the sum of `mods` signs: positive → good, negative → bad, mixed → neutral. Override per trait where the sum misleads (e.g. Pyromaniac) |
| `btrait` | as above, for `BEAST_TRAITS` | as above |
| `res` | `RESOURCE_ICON` | neutral; `scarce` when stock is under a day's need |
| `skill` | a new `SKILL_ICON` | by passion (★ burning, ✦ minor) |
| `class` | `CLASS_ICON` / the role colour | neutral |
| `status` / `injury` / `thought` | existing icons | by sign or severity |
| `bld` | `BUILDING_ICON` | neutral; `locked` shows 🔒 and the research that unlocks it |

- **Replace all trait, resource and status call sites.** There are 6 trait sites and 3 beast-trait sites (§1.2), the `.badge` / `.chip` uses, and the inline `color:var(--good)` styles.
  - Add a harness check that greps `ui.js` and `tips.js` for `TRAITS[t].name` outside `keywords.js`, so the drift can't come back.
- **Costs and rewards** are always drawn as `kw('res', …)` with the amount in front: "12 🪵 Wood". Where there's room, anything the player can't afford is in the `bad` colour.
- **Tooltips:** every `kw` shares one tooltip route (`tipHtml`). A trait's tooltip is the same everywhere. A resource's tooltip gains the "Where from / What for" block (progression P0-4).

## 4. P0: stop the inspector opening when it isn't wanted

| Click on… | Today | Proposed |
|---|---|---|
| Empty ground / plain terrain | opens the tile inspector | **closes** the inspector and clears the selection. With colonists selected, it's a move order (the right-click behaviour stays) |
| A tree, rock or vein | tile inspector | a **small action popover** at the cursor: Harvest / Mine / Cancel. No full panel |
| A building | tile inspector | building inspector (unchanged), minus the coordinates and raw Integrity (show a health bar only when damaged) |
| A colonist | selects them for orders (no inspector) | unchanged; a **double-click** or the portrait opens the inspector |
| A raider or beast | inspector | unchanged |

- Take `tile x,y` out of the subtitle. Keep it behind a debug flag.
- The inspector **doesn't reopen by itself** after a drawer closes, or after Esc.
- Remember a "pinned" state: a 📌 button keeps the inspector open and following the selection. Unpinned, it closes on the next map click.

## 5. P0: bring important actions to the surface

1. **A Classes view.**
   - Add a third sub-tab under **People**: `Duties · Roster · Classes`.
   - It's one row per peasant or classed colonist, showing: eligible classes (as `kw('class')` chips, greyed with the reason when not eligible), the training in progress, free skill points, and prestige readiness.
   - Enrol with one click.
   - This also puts a **Class** tab directly in the colonist inspector (`overview · skills · class · gear`), in place of the button hidden in Skills.
2. **Rail importance.**
   - Hotkeys for every tab: **R** Research, **T** Rift, **N** World. These are currently free; **M** is already bound, and so are A, B, C, F, G, H, O, W and X.
   - A tab whose group has a **primary** item (a caravan here, skill points to spend, peasants eligible for a class, a lair reachable) gets an amber ring and a numbered badge.
   - Informational counts stay as the small blue dot.
   - The Rift tab shows a tiny "floors / days to deepen" readout under its label.
3. **Priority alert stack.**
   - At most **3 alerts shown**; the rest fold into "+N more".
   - The order is fixed: critical → decisions that make gold, power or progress → warnings → info.
   - "Caravan in town" becomes primary, with a wagon icon and a "Sell" button that opens Market with sell already selected.
   - The tutorial tracker (see the tutorial roadmap §3) is pinned above the stack.
4. **The Rift tab leads with the goal:**
   - a lair card: floors, the reward icons, and the deepening countdown (progression P0-3);
   - then the party;
   - then the floor list.
5. **The resource bar:**
   - gold always shows first, with its per-day ledger ("+34 −30");
   - resources under a day's need turn `scarce`;
   - resources with no current use are hidden into a "More ▾" fold, so leather at 168 stops competing with food for attention.

## 6. P1: trim and fold panels

| Panel | Lead with (always shown) | Fold into "Details ▾" |
|---|---|---|
| Colonist overview | mood bar with its top 2 reasons; needs **only when < 50%**; injuries; traits (as `kw`) | all thoughts, bonds, background and faction |
| Skills tab | the class tree button with its point count; the top 5 skills | the other skills; any skill at 0 is hidden unless it has a passion |
| Building | what it does (outcome line), its keeper, its level and upgrade | integrity (shown when damaged), work stats |
| Region drawer | "Sites with rewards: N" (a primary action), and the nearest 3 | the 5 kind counts |
| Colony overview | food days, gold ledger, threat tonight, mood | the charts |

Mood becomes the headline of the colonist overview, since it drives work speed, breaks and hostility (see the mood breakdown in `colony.js:407`). Show it as "Mood 42 — Hungry −10, A friend died −26".

## 7. P1: QoL

- **Esc** closes things in order: popover → inspector → drawer → build tool. Today several of these share one level.
- A **"Why is this locked?"** line on every greyed build or research item, naming the missing research or cost (with `kw`).
- **Hover a cost to see the stock:** "12 🪵 (you have 160)".
- **Drawer memory:** reopening a tab restores its last sub-tab (`lastSub` already exists) **and its scroll position**.
- **Shift-queue research** from any locked building's tooltip ("Research Militia →"). This uses the existing `queueResearch`.
- **Notifications fold:** repeated log lines collapse, e.g. "×3 Rift shards reach the research bench".
- **Phones:**
  - the inspector sheet gets a drag handle and opens at half height;
  - the rail labels hide below 420 px, leaving the icons and badges.

## 8. P2: visual consistency pass

- **One accent scale:**
  - `--primary` (amber, decisions);
  - `--good`, `--bad` and `--warn` (state);
  - `--info` (news);
  - all as `:root` tokens.
  - Remove the inline `style="color:…"` uses and replace them with sentiment classes.
- **One icon source per thing type.** Buildings, resources and techs already have icon tables. Add icons for traits, skills and classes, so no keyword is ever text-only.
- **Spacing and type scale:** section headings (`.sect`) at one size, and numbers in tabular figures, so columns line up.

---

## 9. Order of work

1. §4 (inspector behaviour). It's the smallest change with the most visible effect, and the whole change is in `selectAt`.
2. §3 (the keyword system), because §5, §6 and the progression and tutorial docs all render through it.
3. §5.1 (the Classes view) and §5.3 (the alert stack), together with progression P0-1.
4. §5.2, §5.4 and §5.5.
5. §6, then §7, then §8.

## 10. Success measures

- Clicks to enrol a class: **4+ → 1** (from the Classes view) or **2** (from the portrait).
- Inspector opens that are closed again within 1 s without any other input. Measure with a UI-only counter; target down 80%.
- Keyword call sites that don't go through `kw()`: **0**, enforced by the harness grep.
- Playtest: a new player names three of their colonists' traits as good or bad without reading a tooltip.
