// ============================================================================
// TUTORIAL: ten things to do in the first days, one line each.
//
// The steps are actions on the player's own colony, not a separate lesson:
// each one names a thing to do, points at where to do it, and completes itself
// when the game sees it done. The "why" only appears once it's done, when the
// player has a reason to care (docs/tutorial-roadmap.md).
//
// Tips are the other half: one line, once per save, the first time something
// happens that the player hasn't met before.
//
// Pure logic on game state — the UI draws it. It never touches game.rng, so a
// run plays out the same with the tutorial on, off or skipped.
// ============================================================================
import { TICKS_PER_DAY } from './colony.js';

/** Where a step points: a CSS selector the UI rings with a pulse. */
const TAB = (k) => `.mt[data-drawer="${k}"]`;
const BUILD_TAB = '.mt[data-act="architect"]';

function countBuilt(game, ids) {
  const w = game.root.world, seen = new Set();
  for (const b of w.building) if (b && ids.includes(b.id) && !seen.has(b)) seen.add(b);
  return seen.size;
}
function ownedNodes(game) {
  return game.root.colonists.reduce((s, c) => s + (c.tree ? c.tree.owned.length : 0), 0);
}

export const TUTORIAL_STEPS = [
  { id: 'harvest', icon: '🌿', text: 'Mark trees to cut: press H, then drag over them.', why: 'Wood builds almost everything.',
    target: BUILD_TAB, done: (g, t) => t.events.harvest },
  { id: 'beds', icon: '🛏️', text: 'Place a bed for everyone before dusk (Build › Furniture).', why: 'Sleeping on the ground sours the mood. Here are 10 cloth for more.',
    target: BUILD_TAB, reward: { cloth: 10 },
    done: (g) => countBuilt(g, ['bed', 'bedroll']) >= g.root.colonists.filter(c => !c.dead).length },
  { id: 'research', icon: '📚', text: 'Build a Library (Build › Production): research needs one.', why: 'Research unlocks buildings and schools. Try Militia: it opens the Combat School.',
    target: BUILD_TAB, done: (g, t) => countBuilt(g, ['library', 'archive']) > 0 || t.events['build:library'] || g.research.done.size > 0 },
  { id: 'class', icon: '🎓', text: 'Make a peasant a hero: People › Classes, read the Class Tome.', why: 'Classes bring a skill tree, abilities and better gear.',
    target: TAB('people'), drawer: 'classes', done: (g) => g.root.colonists.some(c => c.training) || g.stats.graduates > 0 },
  { id: 'night', icon: '🌙', text: 'Survive the night. The Rift spawns at dusk; keep fighters home.', why: 'A wave comes every night, and it grows as the Rift deepens.',
    target: '#threat', done: (g) => g.day >= 2 && g.hour >= 6 },
  { id: 'delve', icon: '🌀', text: 'Send a party into the Rift: Rift tab › Enter the Rift.', why: 'Delvers carry loot home in their packs. It counts once they walk out.',
    target: TAB('party'), drawer: 'party', done: (g) => g.stats.expeditions > 0 || g.root.colonists.some(c => c.mapId) },
  { id: 'lair', icon: '🎯', text: (g) => g.floorCount > 1 ? `Break the lair, now ${g.floorCount} floors down.` : 'Break the lair on floor 1 before the Rift deepens.',
    why: 'Lairs pay a hoard, gear and two quiet nights.', target: TAB('party'), drawer: 'party', done: (g) => g.stats.lairs > 0 },
  { id: 'sell', icon: '🐫', text: (g) => g.caravan ? 'Sell spare goods to the caravan: World › Market.' : 'When a caravan comes, sell it your spare goods.',
    why: 'Selling is where most of a young camp’s gold comes from.', target: TAB('region'), drawer: 'trade', done: (g) => g.stats.sold > 0 },
  { id: 'skill', icon: '⭐', text: 'Spend a skill point in a hero’s Class tab.', why: 'Every level gives a point. Pick a direction and slot the ability.',
    target: TAB('people'), drawer: 'classes', start: (g, t) => { t.base = ownedNodes(g); }, done: (g, t) => ownedNodes(g) > (t.base ?? Infinity) },
  { id: 'world', icon: '🗺️', text: 'Send someone on a journey from the World map.', why: 'The land holds resources, relics and tomes. Sites marked ! pay out.',
    target: TAB('region'), drawer: 'region', done: (g) => g.stats.journeys > 0 },
];

/** One-line tips, once per save, the first time each thing happens. */
export const TUTORIAL_TIPS = [
  { id: 'hungry', when: (g) => g.colonists.some(c => !c.away && c.needs.hunger < 0.3), text: 'Colonists eat meals from a Cookfire. Raw food works, but worse.' },
  { id: 'mood', when: (g) => g.colonists.some(c => !c.away && c.mood < 30), text: 'Low mood slows work, and below 16 people break. See "On their mind" in their card.' },
  { id: 'hurt', when: (g) => g.colonists.some(c => c.injuries.length), text: 'Wounds heal faster in a bed, and fastest in an Infirmary.' },
  { id: 'iron', when: (g) => g.day >= 2 && (g.resources.iron || 0) < 10, text: 'Iron is running out. Mine iron veins, loot a Collapsed Mine, or buy it from a caravan.' },
  { id: 'goldvein', when: (g) => g.hour >= 8 && g.world.feature.includes('gold'), text: '🪙 There are gold veins nearby. Mine them (M) for coin.' },
  { id: 'school', when: (g) => ['combat_school', 'mage_school', 'temple'].some(b => g.world.findBuildings(b).length), text: 'A school stands. Enrol peasants from People › Classes.' },
  { id: 'lv10', when: (g) => g.colonists.some(c => c.tree && c.level >= 10), text: 'A hero reached level 10: a new tier of their skill tree is open.' },
  { id: 'keeper', when: (g) => g.world.findBuildings().some(r => r.b.done && ['apothecary', 'armory', 'stable', 'trading_post', 'counting_house'].includes(r.b.id) && r.b.keeper == null), text: 'Shops need a keeper at the counter. Click the building to assign one.' },
  { id: 'dummy', when: (g) => g.world.findBuildings('training').length > 0, text: 'Peasants who drill at the Training Dummy get strong or quick enough for a Combat class.' },
  { id: 'deepen', when: (g) => g.rift.level >= 2, text: 'The Rift deepened: one more floor, a stronger lair, and bigger waves.' },
];

/** The tutorial's state lives on the game so it saves with the run. */
export function tutorialState(game) {
  const root = game.root;
  if (!root.tutorial) {
    // A save from before the tutorial existed, well past the first days, starts it skipped.
    root.tutorial = { step: 0, skipped: root.tick > TICKS_PER_DAY * 2, events: {}, tips: [], started: -1 };
  }
  return root.tutorial;
}

/** Something the player did that a step listens for (a harvest drag, a build). */
export function noteTutorialEvent(game, ev) {
  const t = tutorialState(game);
  t.events[ev] = true;
}

export function currentStep(game) {
  const t = tutorialState(game);
  return t.skipped ? null : TUTORIAL_STEPS[t.step] || null;
}
export function stepText(game, step) { return typeof step.text === 'function' ? step.text(game) : step.text; }

/**
 * Advance: finish any steps that are done (several can finish at once if the
 * player got ahead), pay their rewards, and return what just happened so the
 * UI can say so.
 */
export function advanceTutorial(game) {
  const root = game.root, t = tutorialState(game);
  const completed = [], tips = [];
  if (!t.skipped) {
    for (let guard = 0; guard < TUTORIAL_STEPS.length; guard++) {
      const s = TUTORIAL_STEPS[t.step];
      if (!s) break;
      if (t.started !== t.step) { t.started = t.step; if (s.start) s.start(root, t); }
      if (!s.done(root, t)) break;
      for (const [k, v] of Object.entries(s.reward || {})) root.resources[k] = (root.resources[k] || 0) + v;
      completed.push(s);
      t.step++;
    }
  }
  for (const tip of TUTORIAL_TIPS) {
    if (t.tips.includes(tip.id)) continue;
    if (tip.when(root)) { t.tips.push(tip.id); tips.push(tip); }
  }
  return { completed, tips, finished: !t.skipped && t.step >= TUTORIAL_STEPS.length && completed.length > 0 };
}

export function skipTutorialState(game) { tutorialState(game).skipped = true; }
export function restartTutorialState(game) { const t = tutorialState(game); t.skipped = false; t.step = 0; t.started = -1; }
