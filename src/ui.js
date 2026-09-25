// ============================================================================
// UI: minimal chrome, layered panels. Nothing is shown until it is relevant —
// the inspector opens on selection, drawers open on demand, build pickers only
// exist while the build tool is active.
// ============================================================================
import { Game, STANCES, TICKS_PER_DAY, historyDay, RIFT_RANKS, RIFT_DAYS_PER_LEVEL } from './game.js';
import { packCap, moodBreakdown } from './colony.js';
import { clamp } from './rng.js';
import { Renderer, drawOverworld, overworldHit, TILE_MIN, TILE_MAX, tileThumb } from './render.js';
import { DAMAGE_TYPES, TAGS, STATUSES } from './elements.js';
import { MONSTERS, MONSTER_IDS, FAMILIES, FAMILY_IDS, ESSENCES, TROPHIES, ENCOUNTERS, createMonster, bestiaryKnowledge } from './monsters.js';
import { RARITIES, SLOTS, SLOT_NAMES, SLOT_ICONS, POTIONS, POTION_IDS, LEGENDARIES, LEGENDARY_RECIPES, canEquip, itemScore, FORGE_TIERS, FORGE_SLOTS } from './items.js';
import { beltSize } from './expedition.js';
import { BIOMES_RIFT } from './biomes.js';
import { bookRequirement, bookPrice, scrollPrice, partCost, spellBudget, writeCost, SPELL_FORMS, SPELL_ELEMENTS, SPELL_MODS } from './magic.js';
import { PRESTIGE_PATHS } from './prestige.js';
import { tiersOf, classRequirement, drillTarget, TREES, CLASS_INFO, PRESTIGE, SCHOOLS, LOADOUT_SLOTS, TIER_LEVELS, TIER_CAP, LEVEL_CAP, treeNodes, nodeTier, tierOpen, canBuy, buyNode, toggleLoadout, resetTree, pointsFree, xpToNext } from './classes.js';
import { autoplayStep } from './autoplay.js';
import {
  BUILDINGS, FLOORS, RESOURCES, SKILLS, SKILL_IDS, TRAITS, RACES, CLASSES, ATTRS, ATTR_NAMES,
  RESEARCH, dispositionOf, THOUGHTS, ABILITIES, DUNGEON_THEMES,
} from './data.js';
import { TERRAIN, FEATURES, findPath } from './world.js';
import { kw, kwList, kwCost, traitSentiment } from './keywords.js';
import { noteTutorialEvent, currentStep, stepText, advanceTutorial, skipTutorialState, restartTutorialState, tutorialState, TUTORIAL_STEPS } from './tutorial.js';

// Things laid in runs by dragging; placing one of these keeps build mode on.
const LINE_BUILDS = new Set(['wall', 'timber_wall', 'door', 'fence', 'palisade', 'stakes', 'barricade', 'farm', 'field', 'mushroom']);
import { occupantAt } from './occupancy.js';
import { powerOf, traitMod, refresh } from './npc.js';
import { relKind } from './social.js';
import { partyPower } from './expedition.js';
import { floorTier } from './floors.js';
import { PRICES, defenderPower } from './events.js';
import { ANIMALS, isMature, BEAST_TRAITS, beastPower, tameChance, canFollow, followersOf, PACK_PER_LOAD } from './husbandry.js';
import { CROPS, CROP_IDS, SEASONS, cropViability, growthStage, GROWTH_STAGES } from './farming.js';
import { BIOMES, SITE_KINDS, WORLD_SHAPES } from './overworld.js';
import {
  RACE_ICON, ANIMAL_ICON, FEATURE_ICON, BUILDING_ICON, FLOOR_ICON, SITE_ICON, RESOURCE_ICON,
  CROP_ICON, SEASON_ICON, PANEL_ICON, TOOL_ICON, LABOUR, LABOUR_BY_ID, labourOf,
  taskIcon, STATUS, levelStatus, moodStatus, TECH_ICON,
} from './icons.js';
import { meter, spark, stack, legendRow, gauge, statTile, bars, heatStrip, seqStep } from './chart.js';
import { tipHtml, mapTipKey, foodDaysOf, itemTipKey } from './tips.js';
import { saveState, loadState, saveSummary } from './save.js';
import { installPixIcons } from './pixicons.js';
import { CoopHost, CoopGuest, coopLoad, coopNewCode, COOP_OPS } from './coop.js';
import { netHost, netJoin } from './net.js';
import {
  shopsOf, builtLevel, itemPrice, itemBuyback, potionPrice, beastPrice, mercFee, mercWage, VISITORS, traderOf,
  buyItem, sellItem, buyPotion, sellPotion, buyBeast, hireMerc, dismissMerc, buyCurio, CURIO_PRICES, sellTrophy, TROPHY_PRICE,
  sellToPilgrims, commission, commissionPrice, RIFT_MERCHANTS, dailyCosts, ledger, vaultSafe, BLESSINGS, blessingCost, bless,
  raiseCost, raiseDead, festivalCost, festival, trainCost, paidTraining, RUMOUR_COST, buyRumour, ERRANDS, journeyDays, errandCost,
  sendJourney, siteErrand, siteRewardPreview, clearOdds, upgradePack, packUpgradeCost, PACK_STEP, PACK_MAX, tradingPostLevel, setOrder, UPGRADES, levelOf, upgradeCost, upgradeBlocker, orderUpgrade, cancelUpgrade, MAX_LEVEL,
  FORGE_COST, forgeCost, forgeBlocker, forgeTier, merchantStock, merchantBuy, merchantSellPacks, merchantReforge, robMerchant,
  reforgeCost, MAP_PRICE, KEY_PRICE, KEPT_SHOPS, keeperOf, keptNow, assignKeeper, shopStatus,
} from './economy.js';

// ------------------------------------------------------------ save slots --
// Three slots in localStorage. A save is gzipped where the browser can
// (CompressionStream), which takes a run from ~1 MB to ~100 KB; otherwise it
// is stored as it is. Every read and write is guarded: a private window or a
// full disk means no saves, never a crash.
export const SAVE_SLOTS = 3;
const slotDataKey = (n) => 'riftgate.slot.' + n;
const slotMetaKey = (n) => 'riftgate.meta.' + n;
function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function storeDel(k) { try { localStorage.removeItem(k); } catch (e) { /* nothing to do */ } }

async function packSave(text) {
  if (typeof CompressionStream === 'undefined' || typeof Blob === 'undefined') return 'raw:' + text;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return 'gz:' + btoa(bin);
  } catch (e) { return 'raw:' + text; }
}
async function unpackSave(packed) {
  if (packed.startsWith('raw:')) return packed.slice(4);
  const bin = atob(packed.slice(3));
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
/** What a slot holds, for the title screen — or null if it's empty. */
export function slotMeta(n) {
  const raw = storeGet(slotMetaKey(n));
  if (!raw || !storeGet(slotDataKey(n))) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function deleteSlot(n) { storeDel(slotDataKey(n)); storeDel(slotMetaKey(n)); }

/** The research project that unlocks a building, if any. */
function unlockerOf(id) {
  for (const [k, r] of Object.entries(RESEARCH)) if ((r.unlock || []).includes(id)) return k;
  return null;
}

// Player options, kept across runs.
const OPTION_DEFAULTS = { autosave: true, hoverInfo: true, pauseOnFight: false, damageNumbers: true, reduceMotion: false, edgeFog: true };
function loadOptions() {
  const o = { ...OPTION_DEFAULTS };
  try {
    Object.assign(o, JSON.parse(localStorage.getItem('riftgate.options') || '{}'));
    if (localStorage.getItem('riftgate.hoverInfo') === '0') o.hoverInfo = false;   // the old single setting
  } catch (e) { /* defaults */ }
  return o;
}
function storeOptions(o) { storeSet('riftgate.options', JSON.stringify(o)); }

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const pct = (v) => Math.round(v * 100) + '%';

/**
 * A section heading: the name on the left, a quiet count or note on the right.
 * Every panel uses this one shape, so "what is this block" always reads the
 * same way and the numbers never get lost inside a sentence.
 */
/** A cost as icons and numbers: "🪙 70 · 🪵 20". */
const costLine = (cost) => Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `${RESOURCE_ICON[k] || ''} ${v}`).join(' · ');
const hasAllOf = (g, cost) => Object.entries(cost).every(([k, v]) => (g.resources[k] || 0) >= v);

// What a tech is *for*, when that matters more than its flavour name: the
// class line reads as classes, so the way to a Fighter can be found by eye.
const SCHOOL_OUTCOME = { combat_school: 'Combat classes', mage_school: 'Mage classes', temple: 'Divine classes',
  knight_academy: 'Combat prestige', wizardry_academy: 'Mage prestige', cathedral: 'Divine prestige' };
function techOutcome(id) {
  const R = RESEARCH[id];
  const hit = R && R.unlock.find(b => SCHOOL_OUTCOME[b]);
  return hit ? '🎓 ' + SCHOOL_OUTCOME[hit] : '';
}

function sectHtml(title, meta = '') {
  return `<div class="sect"><span>${title}</span>${meta !== '' && meta != null ? `<em>${meta}</em>` : ''}</div>`;
}

/**
 * The header every window shares, laid out like a profile card: a cover strip
 * in the window's own colour, a round avatar over its lower edge, small icon
 * actions top-right, then the name, a one-line summary, a quiet meta line, a
 * row of figures (label over value) and, under a rule, up to two wide
 * buttons. One shape everywhere means the eye always knows where the
 * headline, the numbers and the next action are.
 *
 * Buttons are { label, onClick, tip?, cls?, disabled?, text? }; `text` marks a
 * top-right action that carries a word rather than a lone icon.
 */
function profileCard(o) {
  const card = el('div', 'prof' + (o.slim ? ' slim' : '') + (o.cls ? ' ' + o.cls : ''));
  if (o.tone && card.style && card.style.setProperty) card.style.setProperty('--tone', o.tone);
  const stats = (o.stats || []).filter(Boolean);
  const meta = (o.meta || []).filter(Boolean);
  card.innerHTML = `<div class="prof-cover">${o.cover || ''}</div>
    <div class="prof-top"><div class="prof-av"${o.avTip ? ` data-tipt="${esc(o.avTip)}"` : ''}><span>${o.avatar || ''}</span>${o.badge != null && o.badge !== '' ? `<i class="prof-badge">${o.badge}</i>` : ''}</div>
      <div class="prof-acts"></div></div>
    <div class="prof-name">${o.name || ''}</div>
    ${o.sub ? `<div class="prof-sub">${o.sub}</div>` : ''}
    ${meta.length ? `<div class="prof-meta">${meta.map(([i, t]) => `<span><i>${i}</i>${t}</span>`).join('')}</div>` : ''}
    ${o.extra || ''}
    ${stats.length ? `<div class="prof-stats">${stats.map(s => `<div${s.tip ? ` data-tipt="${esc(s.tip)}"` : ''}><span>${s.label}</span><b${s.color ? ` style="color:${s.color}"` : ''}>${s.value}</b></div>`).join('')}</div>` : ''}
    ${o.foot && o.foot.length ? '<div class="prof-foot"></div>' : ''}`;
  const btn = (b, cls) => {
    const x = el('button', cls + (b.cls ? ' ' + b.cls : ''), b.label);
    if (b.tip) x.dataset.tipt = b.tip;
    if (b.disabled) x.disabled = true;
    x.onclick = (e) => { if (e && e.stopPropagation) e.stopPropagation(); if (b.onClick) b.onClick(); };
    return x;
  };
  const acts = card.querySelector('.prof-acts');
  for (const b of o.acts || []) acts.appendChild(btn(b, 'prof-ib' + (b.text ? ' txt' : '')));
  if (o.foot && o.foot.length) {
    const f = card.querySelector('.prof-foot');
    for (const b of o.foot) f.appendChild(btn(b, 'act'));
  }
  return card;
}

/** Resistances, weaknesses, immunities and tags as a row of chips. */
/** A one-line bar: label, track, reading. The inspect card's workhorse. */
function kbar(label, value, max, color, reading, cls = '') {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return `<div class="kb ${cls}"><span>${label}</span><u><i style="width:${(f * 100).toFixed(1)}%;background:${color}"></i></u><b>${reading}</b></div>`;
}

function combatTraitsHtml(cb) {
  const chips = [];
  for (const [k, v] of Object.entries(cb.res || {})) {
    if (!v || !DAMAGE_TYPES[k]) continue;
    const label = v >= 1 ? 'immune' : v < 0 ? `weak ${Math.round(-v * 100)}%` : `resist ${Math.round(v * 100)}%`;
    chips.push(`<span class="ct-chip ${v < 0 ? 'bad' : 'good'}" data-tipt="${DAMAGE_TYPES[k].name}: ${label}">${DAMAGE_TYPES[k].icon} ${DAMAGE_TYPES[k].name} ${label}</span>`);
  }
  const imm = (cb.immune || []).filter(id => STATUSES[id]);
  if (imm.length) chips.push(`<span class="ct-chip good" data-tipt="Immune to: ${imm.map(id => STATUSES[id].name).join(', ')}">Immune ${imm.map(id => STATUSES[id].icon).join('')}</span>`);
  for (const t of cb.tags || []) if (TAGS[t] && t !== 'humanoid') chips.push(`<span class="ct-chip" data-tipt="${TAGS[t].name}${TAGS[t].desc ? ': ' + TAGS[t].desc : ''}">${TAGS[t].icon} ${TAGS[t].name}</span>`);
  return chips.length ? `<div class="ct-chips">${chips.join('')}</div>` : '';
}

export class UI {
  constructor(seed) {
    // Every emoji the UI writes is shown as a pixel icon (pixicons.js).
    if (typeof document !== 'undefined') installPixIcons(document);
    // The bottom-right card grows with its map tabs; alerts and news keep clear of it.
    if (typeof ResizeObserver !== 'undefined' && typeof document !== 'undefined' && document.querySelector('#datebox')) {
      new ResizeObserver(([e]) => document.documentElement.style.setProperty('--dbh', Math.ceil(e.target.offsetHeight) + 'px'))
        .observe(document.querySelector('#datebox'));
    }
    this.opts = loadOptions();
    this.slot = null;           // which save slot this run lives in (null: an unsaved ?seed= run)
    this.newGame(seed);
    this.tool = { mode: 'select' };
    this.drawer = null;
    this.tab = 'overview';
    this.auto = false;
    this.speed = 1;
    this.paused = false;
    this.toasts = [];
    this.lastLogLen = 0;
    this.buildCat = null;
    this.squad = new Set();     // ids of band-selected colonists
    this.party = { ids: [], set: false };  // who the Rift tab's Enter button sends
    this.bulkJob = 'haul';      // which priority the squad panel is editing
    this.sigs = {};             // last-rendered signature per panel, to stop churn
    this.visitors = [];         // cosmetic caravan/peddler sprites — see updateVisitors()
    this.mapId = 0;             // which map is on screen: 0 is the camp, others are Rift floors
    this.cams = {};             // per-map camera, so hopping between floors keeps your place
    this.hoverInfo = this.opts.hoverInfo;   // map hover cards; the 💬 toggle turns them off
    this.bind();
    this.applyOptions();
    this.renderRail();
    this.renderDrawer();
    this.loop();
    // No seed in the URL: start at the title screen, with a camp idling behind it.
    if (!seed) this.showTitle();
  }

  /** The game as seen from the map on screen: map-local fields are that map's. */
  get mv() {
    const g = this.game;
    return g.viewOf(g.mapById(this.mapId) || g.maps[0]);
  }

  /** Put another map on screen, remembering where the camera was on this one. */
  viewMap(id) {
    const g = this.game, r = this.renderer;
    const m = g.mapById(id) || g.maps[0];
    if (r) this.cams[this.mapId] = { x: r.camX, y: r.camY, tile: r.tile };
    const changed = m.id !== this.mapId;
    this.mapId = m.id;
    if (!r) return;
    r.game = this.mv;
    const cam = this.cams[m.id];
    if (cam) { r.camX = cam.x; r.camY = cam.y; r.tile = cam.tile; }
    else {
      // First look at a floor: centre on whoever of ours is there, else the stairs.
      const c = g.colonists.find(k => (k.mapId || 0) === m.id && !k.dead);
      const at = c || m.world.stairsUp || m.world.start;
      r.camX = at.x; r.camY = at.y;
    }
    if (changed) {
      r.dragRect = null; r.hover = null; this.mapPtr = null;
      if (this.tipSrc === 'map') this.hideTip();
      if (this.sel && ['tile', 'enemy', 'beast'].includes(this.sel.kind)) this.closeInspector(false);
      this.sigs.maptabs = null;
    }
  }

  newGame(seed) {
    this.seed = seed || Math.random().toString(36).slice(2, 9);
    this.game = new Game(this.seed);
    if (this.renderer) { this.renderer.game = this.game; this.renderer.cacheVersion = -1; this.renderer.selection = null; this.renderer.camX = this.game.world.start.x; this.renderer.camY = this.game.world.start.y; }
    this.lastLogLen = 0;
    this.sel = null;
    this.mapId = 0; this.cams = {};
    if (this.squad) this.squad.clear();
    if (this.renderer) this.renderer.selectedIds = this.squad;
    if (this.visitors) this.visitors.length = 0;
    this.sigs = {};
  }

  // ---------------------------------------------------------------- input --
  bind() {
    // <details> toggles don't bubble; catch them on the way down.
    document.addEventListener('toggle', (e) => this.noteFold(e.target), true);
    const cv = $('#map');
    this.renderer = new Renderer(cv, this.game);
    this.renderer.resize();
    addEventListener('resize', () => { this.renderer.resize(); this.placeInspector(); });

    this.renderer.selectedIds = this.squad;
    this.renderer.visitors = this.visitors;
    this.initTips(cv);

    // Left held: pans in Select mode (drag the map, the instinct anyone tries
    // first); with a build or order tool it paints the dragged area instead,
    // same as ever. Right held: always a marquee, whatever the current tool —
    // it is the band-select button now. A right tap too short to be a drag is
    // an order: interact with whatever is on that tile, or send the squad
    // there. Middle button and held space still just pan.
    let dragging = false, dragButton = 0, panning = false, panClickable = false, panStart = null, downAt = null, additive = false;
    const world = (e) => {
      const r = cv.getBoundingClientRect();
      return this.renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    };
    const startPan = (e) => { panning = true; panStart = { mx: e.clientX, my: e.clientY, cx: this.renderer.camX, cy: this.renderer.camY }; };
    const startDrag = (e, wx, wy, mode) => {
      additive = e.shiftKey;
      downAt = { x: wx, y: wy, mx: e.clientX, my: e.clientY };
      dragging = true; dragButton = e.button;
      this.renderer.dragRect = { x0: wx, y0: wy, x1: wx, y1: wy };
      this.renderer.dragMode = mode;
      this.renderer.dragCount = 0;
    };
    cv.addEventListener('mousedown', (e) => {
      this.clickAt = { x: e.clientX, y: e.clientY };
      const [wx, wy] = world(e);
      if (e.button === 1 || this.spaceHeld) { startPan(e); return; }
      if (e.button === 2) { startDrag(e, wx, wy, 'marquee'); return; }
      if (e.button !== 0) return;
      if (this.tool.mode === 'select') {
        // A left-click-select still has to work — this pan doubles as a tap
        // if it never really moved.
        startPan(e); panClickable = true; additive = e.shiftKey;
        downAt = { x: wx, y: wy, mx: e.clientX, my: e.clientY };
        return;
      }
      startDrag(e, wx, wy, this.tool.mode === 'squad' ? 'marquee' : this.tool.mode);
    });
    cv.addEventListener('mousemove', (e) => {
      const [wx, wy] = world(e);
      this.renderer.hover = [wx, wy];
      // The pointing cursor over anything a click would do something with.
      if (this.tool.mode === 'select') {
        const g = this.mv, onUnit = g.here.some(c => !c.away && c.x === wx && c.y === wy)
          || g.raiders.some(r => r.hp > 0 && r.x === wx && r.y === wy) || g.beasts.some(b => !b.dead && !b.away && b.x === wx && b.y === wy);
        const want = panning ? 'var(--cur-grab)' : onUnit ? 'var(--cur-hand)' : '';
        if (cv.style.cursor !== want) cv.style.cursor = want;
      }
      const p = this.mapPtr;
      if (!p || p.wx !== wx || p.wy !== wy) this.mapPtr = { wx, wy, at: p && p.shown ? 0 : performance.now(), shown: p && p.shown };
      this.mapPtr.x = e.clientX; this.mapPtr.y = e.clientY;
      if (panning && panStart) {
        this.renderer.camX = panStart.cx - (e.clientX - panStart.mx) / this.renderer.tile;
        this.renderer.camY = panStart.cy - (e.clientY - panStart.my) / this.renderer.tile;
        if (this.spaceHeld) this.spaceMovedCam = true;
      }
      if (dragging && this.renderer.dragRect) {
        const d = this.renderer.dragRect;
        d.x1 = wx; d.y1 = wy;
        // The band reports its catch live, so you know before you let go.
        if (this.renderer.dragMode === 'marquee') this.renderer.dragCount = this.inBand(d).length;
      }
    });
    addEventListener('mouseup', (e) => {
      const wasPanClick = panning && panClickable;
      panning = false; panClickable = false;
      if (wasPanClick && downAt) {
        const moved = Math.hypot(e.clientX - downAt.mx, e.clientY - downAt.my);
        if (moved < 6) {
          this.selectAt(downAt.x, downAt.y, additive);
        }
      }
      if (dragging && this.renderer.dragRect) {
        const d = this.renderer.dragRect;
        const moved = downAt ? Math.hypot(e.clientX - downAt.mx, e.clientY - downAt.my) : 0;
        if (dragButton === 2) {
          if (moved < 6) this.rightClickAt(d.x0, d.y0);
          else this.selectBand(d, additive);
        } else if (this.renderer.dragMode === 'marquee') {
          if (moved < 6) this.selectAt(d.x0, d.y0, additive);
          else this.selectBand(d, additive);
        } else {
          this.applyTool(d.x0, d.y0, d.x1, d.y1);
        }
        this.renderer.dragRect = null;
        this.renderer.dragMode = null;
      }
      dragging = false; downAt = null; additive = false; dragButton = 0;
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mouseleave', () => { this.mapPtr = null; this.renderer.hover = null; if (this.tipSrc === 'map') this.hideTip(); });

    // ---- touch: one finger pans (or drags a tool rect), two fingers pinch ----
    let touchMode = null, pinchStart = 0, tileStart = 0, tStart = null, moved = 0;
    const touchPos = (t) => { const r = cv.getBoundingClientRect(); return [t.clientX - r.left, t.clientY - r.top]; };
    cv.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        touchMode = 'pinch';
        pinchStart = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        tileStart = this.renderer.tile;
        this.renderer.dragRect = null;
        return;
      }
      if (e.touches.length !== 1) return;
      const [px, py] = touchPos(e.touches[0]);
      this.clickAt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      moved = 0;
      tStart = { px, py, camX: this.renderer.camX, camY: this.renderer.camY };
      const [wx, wy] = this.renderer.screenToWorld(px, py);
      // One finger still pans in Select — it is the only pan a touch screen has.
      // Band-selecting on touch is the explicit Squad tool instead.
      if (this.tool.mode === 'select') touchMode = 'pan';
      else {
        touchMode = 'tool';
        this.renderer.dragRect = { x0: wx, y0: wy, x1: wx, y1: wy };
        this.renderer.dragMode = this.tool.mode === 'squad' ? 'marquee' : this.tool.mode;
        this.renderer.dragCount = 0;
      }
    }, { passive: true });
    cv.addEventListener('touchmove', (e) => {
      if (touchMode === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this.renderer.tile = clamp(tileStart * (d / Math.max(1, pinchStart)), TILE_MIN, TILE_MAX);
        return;
      }
      if (!tStart || e.touches.length !== 1) return;
      e.preventDefault();
      const [px, py] = touchPos(e.touches[0]);
      moved = Math.max(moved, Math.hypot(px - tStart.px, py - tStart.py));
      if (touchMode === 'pan') {
        this.renderer.camX = tStart.camX - (px - tStart.px) / this.renderer.tile;
        this.renderer.camY = tStart.camY - (py - tStart.py) / this.renderer.tile;
      } else if (touchMode === 'tool' && this.renderer.dragRect) {
        const [wx, wy] = this.renderer.screenToWorld(px, py);
        const d = this.renderer.dragRect;
        d.x1 = wx; d.y1 = wy;
        if (this.renderer.dragMode === 'marquee') this.renderer.dragCount = this.inBand(d).length;
      }
    }, { passive: false });
    const endTouch = () => {
      if (touchMode === 'tool' && this.renderer.dragRect) {
        const d = this.renderer.dragRect;
        if (this.renderer.dragMode === 'marquee') this.selectBand(d, false);
        else this.applyTool(d.x0, d.y0, d.x1, d.y1);
        this.renderer.dragRect = null;
        this.renderer.dragMode = null;
      } else if (touchMode === 'pan' && moved < 10 && tStart) {
        // A tap that did not drag is a selection.
        const [wx, wy] = this.renderer.screenToWorld(tStart.px, tStart.py);
        this.selectAt(wx, wy);
      }
      touchMode = null; tStart = null;
    };
    cv.addEventListener('touchend', endTouch, { passive: true });
    cv.addEventListener('touchcancel', endTouch, { passive: true });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Zoom toward the pointer, proportionally, so a trackpad pinch and a
      // mouse wheel both feel continuous at every scale.
      const r = cv.getBoundingClientRect();
      const step = Math.max(-0.5, Math.min(0.5, -e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)));
      this.renderer.zoomAt(Math.exp(step), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        // Space pauses on tap and pans while held, which is why it is tracked.
        e.preventDefault();
        if (!this.spaceHeld) { this.spaceHeld = true; this.spaceMovedCam = false; }
        return;
      }
      if (k >= '1' && k <= '4') { if (this.guestTime('speed ' + k)) return; this.speed = +k; this.paused = false; this.renderTop(); }
      else if (k === 'escape') {
        if (!$('#modal').classList.contains('hidden')) { this.hide('#modal'); return; }
        if (!$('#help').classList.contains('hidden')) { this.hide('#help'); return; }
        if (this.tool.mode !== 'select') { this.setTool({ mode: 'select' }); return; }
        if (!$('#buildpick').classList.contains('hidden')) { this.hide('#buildpick'); this.renderRail(); return; }
        // A panel about a thing (a tile, a site, a foe) goes before the window behind it.
        if (this.sel && !['colonist', 'squad'].includes(this.sel.kind)) { this.closeInspector(false); return; }
        if (this.drawer) { this.drawer = null; this.renderRail(); this.renderDrawer(); return; }
        if (!$('#options').classList.contains('hidden')) { this.hide('#options'); return; }
        if (!$('#gamemenu').classList.contains('hidden')) { this.hideGameMenu(); return; }
        if (!$('#title').classList.contains('hidden')) return;
        if (this.squad.size || this.sel) { this.clearSquad(); this.closeInspector(); return; }
        this.showGameMenu();
      }
      else if (k === 'tab') { e.preventDefault(); this.cycleMap(e.shiftKey ? -1 : 1); }
      else if (k === 'f') this.toggleHold();
      else if (k === 'm') this.setTool({ mode: 'mine' });
      else if (k === 'h') this.setTool({ mode: 'harvest' });
      else if (k === 'x') this.setTool({ mode: 'cancel' });
      else if (k === 'g') this.setTool({ mode: 'squad' });
      else if (k === 'b') this.toggleBuildPick('structure');
      else if (k === 'w') { this.drawer = this.drawer === 'people' ? null : 'people'; this.sigs.drawer = null; this.hide('#buildpick'); this.renderRail(); this.renderDrawer(); }
      else if (k === 'a' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.selectAllColonists(); }
      else if (k === 'o') {
        this.renderer.overlay = this.renderer.overlay === 'soil' ? 'water' : this.renderer.overlay === 'water' ? null : 'soil';
        this.renderTop();
      }
      else if (k === 'c') { this.drawer = this.drawer === 'colony' ? null : 'colony'; this.renderRail(); this.renderDrawer(); }
      else if (k === 'r' || k === 't' || k === 'n') {
        // Every main tab has a key: Research, the Rift (T), the World (N).
        const grp = { r: 'research', t: 'party', n: 'region' }[k];
        this.drawer = UI.groupOf(this.drawer) === grp ? null : (this.lastSub && this.lastSub[grp]) || grp;
        this.sigs.drawer = null; this.hide('#buildpick'); this.renderRail(); this.renderDrawer();
      }
      else if (k === '?' || k === '/') this.toggleHelp();
      else if (k === 'arrowleft') this.renderer.camX -= 4;
      else if (k === 'arrowright') this.renderer.camX += 4;
      else if (k === 'arrowup') this.renderer.camY -= 4;
      else if (k === 'arrowdown') this.renderer.camY += 4;
    });
    addEventListener('keyup', (e) => {
      if (e.key.toLowerCase() !== ' ') return;
      this.spaceHeld = false;
      // A tap of space pauses; a space-drag was a pan and must not also pause.
      if (!this.spaceMovedCam && !this.guestTime(this.paused ? 'resume' : 'pause')) { this.paused = !this.paused; this.renderTop(); }
    });

    $('#datebox .spd').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (this.guestTime(b.dataset.spd === 'p' ? (this.paused ? 'resume' : 'pause') : 'speed ' + b.dataset.spd)) return;
      if (b.dataset.spd === 'p') this.paused = !this.paused;
      else { this.speed = +b.dataset.spd; this.paused = false; }
      this.renderTop();
    });
    $('#rail').addEventListener('click', (e) => {
      const b = e.target.closest('.mt'); if (!b) return;
      if (b.dataset.act === 'architect') {
        if (!$('#buildpick').classList.contains('hidden')) { this.hide('#buildpick'); this.renderRail(); return; }
        this.toggleBuildPick(this.buildCat || 'structure');
        return;
      }
      const grp = b.dataset.drawer;
      if (!this.lastSub) this.lastSub = {};
      this.drawer = this.drawer && UI.groupOf(this.drawer) === grp ? null : (this.lastSub[grp] || grp);
      this.sigs.drawer = null;
      if (this.drawer) this.hide('#buildpick');
      this.renderRail(); this.renderDrawer();
    });
    $('#drawer .d-close').addEventListener('click', () => {
      this.drawer = null; this.renderRail(); this.renderDrawer();
    });
    $('#overlaybtn').addEventListener('click', () => {
      this.renderer.overlay = this.renderer.overlay === 'soil' ? 'water' : this.renderer.overlay === 'water' ? null : 'soil';
      this.renderTop();
    });
    $('#autobtn').addEventListener('click', () => {
      // The steward acts outside the command stream, so in co-op it would pull the players apart.
      if (this.coop) { this.flash('The steward is off in co-op: its orders would only happen on one screen.', 'warn'); return; }
      this.auto = !this.auto; this.renderTop();
    });
    $('#helpbtn').addEventListener('click', () => this.toggleHelp());
    $('#menubtn').addEventListener('click', () => this.showGameMenu());
    const cb = $('#coopbadge');
    if (cb) cb.addEventListener('click', () => this.showGameMenu());
    // Leaving the tab (or closing it) saves, so a run is never lost to a refresh.
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.saveToSlot('auto'); });
    }
    const hb = $('#hoverbtn');
    if (hb) hb.addEventListener('click', () => {
      this.hoverInfo = this.opts.hoverInfo = !this.hoverInfo;
      storeOptions(this.opts);
      if (!this.hoverInfo && this.tipSrc === 'map') this.hideTip();
      this.flash(this.hoverInfo ? 'Hover info on' : 'Hover info off — click things to inspect them', 'info');
      this.renderTop();
    });

    // Colonist bar: click selects, shift-click adds, double-click jumps the camera.
    $('#colbar').addEventListener('click', (e) => {
      // A portrait click anchors the inspect card under the portrait.
      const pt = e.target.closest && e.target.closest('.cb');
      const r = pt && pt.getBoundingClientRect ? pt.getBoundingClientRect() : null;
      this.clickAt = r ? { x: r.left + r.width / 2, y: r.bottom + 4 } : { x: e.clientX, y: e.clientY };
      const b = e.target.closest('.cb'); if (!b) return;
      const id = +b.dataset.id;
      const c = this.game.colonists.find(x => x.id === id);
      if (!c) return;
      if (c.away) { this.drawer = 'party'; this.renderRail(); this.renderDrawer(); return; }
      if ((c.mapId || 0) !== this.mapId) { this.viewMap(c.mapId || 0); this.renderer.camX = c.x; this.renderer.camY = c.y; }
      if (e.shiftKey) { this.toggleInSquad(id); }
      else { this.squad.clear(); this.squad.add(id); this.commitSquad(); }
      this.sigs.colbar = null;
    });
    $('#colbar').addEventListener('dblclick', (e) => {
      const b = e.target.closest('.cb'); if (!b) return;
      const c = this.game.colonists.find(x => x.id === +b.dataset.id);
      if (c && !c.away) { if ((c.mapId || 0) !== this.mapId) this.viewMap(c.mapId || 0); this.renderer.camX = c.x; this.renderer.camY = c.y; }
    });
    $('#maptabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-map]'); if (!b) return;
      this.viewMap(+b.dataset.map);
    });
    // Alerts act on what they describe: people alerts select those people.
    $('#alerts').addEventListener('click', (e) => {
      if (e.target.closest('[data-more]')) { this.alertsOpen = !this.alertsOpen; this.sigs.alerts = null; this.renderAlerts(); return; }
      if (e.target.closest('[data-tut-skip]')) { this.skipTutorial(); return; }
      const b = e.target.closest('.al'); if (!b) return;
      const a = (this.alertList || [])[+b.dataset.i];
      if (!a) return;
      if (a.targets && a.targets.length) {
        this.squad.clear(); for (const id of a.targets) this.squad.add(id);
        this.commitSquad();
        const c = this.game.colonists.find(x => x.id === a.targets[0]);
        if (c && !c.away) { this.renderer.camX = c.x; this.renderer.camY = c.y; }
        if (a.tab) { this.tab = a.tab; this.sigs.insp = null; this.renderInspector(); }
      } else if (a.map) {
        this.viewMap(a.map);
      } else if (a.drawer) {
        this.drawer = a.drawer; this.sigs.drawer = null; this.hide('#buildpick'); this.renderRail(); this.renderDrawer();
      } else if (a.arch) this.toggleBuildPick(a.arch);
    });
    $('#buildpick').addEventListener('click', (e) => {
      const cat = e.target.closest('[data-cat]');
      if (cat) { this.buildCat = cat.dataset.cat; this.renderArchitect(); return; }
      const gz = e.target.closest('.gz'); if (!gz) return;
      if (gz.dataset.locked) {
        const tech = gz.dataset.tech, R = RESEARCH[tech];
        if (this.game.research.done.has(tech)) return;
        this.act(this.game, 'queueResearch', tech);
        this.flash(`${BUILDINGS[gz.dataset.locked].name} needs ${R ? R.name : tech} — queued for research`, 'info');
        this.sigs.drawer = null; this.renderDrawer();
        return;
      }
      if (gz.dataset.tool) this.setTool({ mode: gz.dataset.tool });
      else if (gz.dataset.build) this.setTool({ mode: 'build', id: gz.dataset.build });
      else if (gz.dataset.floor) this.setTool({ mode: 'floor', id: gz.dataset.floor });
    });
    $('#buildpick').addEventListener('mouseover', (e) => {
      const gz = e.target.closest('.gz'); if (!gz) return;
      this.archInfo(gz.dataset.build || gz.dataset.locked || null, gz.dataset.tool || null, gz.dataset.floor || null);
    });
    $('#inspector .close').addEventListener('click', () => this.closeInspector());
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') this.hide('#modal'); });
    for (const sel of ['#inspector', '#drawer', '#buildpick']) {
      $(sel).addEventListener('mouseenter', () => { this.panelHover = true; });
      $(sel).addEventListener('mouseleave', () => { this.panelHover = false; });
    }
  }

  // ------------------------------------------------------- hover inspectors --
  /**
   * One tooltip element for the whole game. Anything carrying data-tip="key"
   * gets a live inspector built by tips.js; anything with a plain title (or a
   * chart mark's data-tipt) is upgraded to the same styled box, so no corner of
   * the UI falls back to the browser's grey native tooltip.
   */
  initTips(cv) {
    this.tipEl = null; this.tipSrc = null; this.tipAt = 0;
    const pick = (t) => (t && t.closest) ? t.closest('[data-tip],[data-tipt],[title]') : null;
    document.addEventListener('mouseover', (e) => {
      if (e.target === cv) return;
      const n = pick(e.target);
      if (!n || n === cv) { if (this.tipSrc === 'dom') this.hideTip(); return; }
      if (n.hasAttribute('title')) { n.setAttribute('data-tipt', n.getAttribute('title')); n.removeAttribute('title'); }
      this.tipEl = n; this.tipSrc = 'dom';
      this.mouse = { x: e.clientX, y: e.clientY };
      this.renderTip();
    });
    document.addEventListener('mousemove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      if (this.tipSrc) this.placeTip();
    });
    document.addEventListener('mouseout', (e) => {
      if (this.tipSrc !== 'dom' || !this.tipEl) return;
      if (e.relatedTarget && this.tipEl.contains && this.tipEl.contains(e.relatedTarget)) return;
      this.hideTip();
    });
    document.addEventListener('mousedown', () => { if (this.tipSrc === 'dom') this.hideTip(); });
  }

  hideTip() {
    this.noteTipRect();
    this.tipSrc = null; this.tipEl = null;
    if (this.mapPtr) this.mapPtr.shown = false;
    const t = $('#tip'); if (t) t.classList.add('hidden');
  }

  renderTip() {
    const t = $('#tip');
    let html = '';
    if (this.tipSrc === 'map') html = this.mapPtr ? tipHtml(this.mv, this.mapPtr.key) : '';
    else if (this.tipEl) {
      if (!this.tipEl.isConnected) { this.hideTip(); return; }
      const key = this.tipEl.getAttribute('data-tip');
      if (key) html = tipHtml(this.game, key);
      if (!html) {
        const txt = this.tipEl.getAttribute('data-tipt');
        if (txt) {
          const lines = esc(txt).split('\n');
          html = lines.length > 1 ? `<div class="tt-h"><span>${lines[0]}</span></div><div class="tt-d" style="font-style:normal">${lines.slice(1).join('<br>')}</div>` : `<div class="tt-t">${lines[0]}</div>`;
        }
      }
    }
    if (!html) { t.classList.add('hidden'); return; }
    t.innerHTML = html;
    t.classList.remove('hidden');
    this.placeTip();
  }

  placeTip() {
    const t = $('#tip');
    if (!t || !this.mouse || t.classList.contains('hidden')) return;
    const w = t.offsetWidth || 260, h = t.offsetHeight || 100;
    let x = this.mouse.x + 16, y = this.mouse.y + 18;
    if (x + w > innerWidth - 4) x = this.mouse.x - w - 12;
    if (y + h > innerHeight - 4) y = Math.max(4, this.mouse.y - h - 12);
    t.style.left = Math.max(4, x) + 'px'; t.style.top = y + 'px';
  }

  /** Map hover: shows after a short dwell, then follows the pointer tile to tile. */
  tickTips(now) {
    const p = this.mapPtr;
    if (p && this.tipSrc !== 'dom') {
      const busy = this.renderer.dragRect || this.spaceHeld || !this.hoverInfo;
      let key = busy ? '' : mapTipKey(this.mv, p.wx, p.wy);
      if (key && key === this.selTipKey() && !$('#inspector').classList.contains('hidden')) key = '';
      if (key.startsWith('tile:')) {
        // Bare ground only earns a tooltip when an overlay makes its numbers matter.
        const mv = this.mv, w = mv.world, i = w.inside(p.wx, p.wy) ? w.idx(p.wx, p.wy) : -1;
        const bare = i < 0 || (!w.building[i] && !w.feature[i] && !w.designation[i] && !mv.ground.some(it => it.x === p.wx && it.y === p.wy));
        if (bare && !this.renderer.overlay) key = '';
      }
      if (!key) { if (this.tipSrc === 'map') this.hideTip(); }
      else if (p.shown || now - p.at > 260) {
        p.key = key; p.shown = true; this.tipSrc = 'map';
        this.mouse = { x: p.x, y: p.y };
        if (!this.tipAt || now - this.tipAt > 200 || p.lastKey !== key) { this.tipAt = now; p.lastKey = key; this.renderTip(); }
        return;
      }
    }
    // Live refresh for keyed DOM tips, so hovering a resource shows it moving.
    if (this.tipSrc === 'dom' && now - this.tipAt > 300) { this.tipAt = now; this.renderTip(); }
  }

  setTool(t) {
    this.tool = t;
    this.renderer.ghostId = t.mode === 'build' && t.id ? t.id : null;
    if (!$('#buildpick').classList.contains('hidden')) this.renderArchitect();
    $('#map').style.cursor = t.mode === 'select' ? '' : 'var(--cur-cross)';
    this.renderHint();
  }

  /**
   * One line under the tool bar saying what a drag will do right now. The old
   * bar showed the tool's name and left the verb to be guessed.
   */
  renderHint() {
    const h = $('#toolhint');
    if (!h) return;
    const m = this.tool.mode;
    const text = m === 'select' ? ''
      : m === 'squad' ? 'Drag a box over people to select them all'
        : m === 'mine' ? 'Drag over rock and seams to mark them for mining'
          : m === 'harvest' ? 'Drag over trees, fungus and herbs to mark them for cutting'
            : m === 'cancel' ? 'Drag over orders and blueprints to call them off'
              : m === 'build' && this.tool.id ? `Drag to place ${BUILDINGS[this.tool.id].name} · Esc to stop`
                : m === 'floor' && this.tool.id ? `Drag to lay ${FLOORS[this.tool.id].name} · Esc to stop`
                  : 'Pick something to build';
    h.textContent = text;
  }
  show(sel) { $(sel).classList.remove('hidden'); if (sel === '#buildpick') this.placeInspector(); }
  hide(sel) { $(sel).classList.add('hidden'); if (sel === '#buildpick') this.placeInspector(); }

  // ------------------------------------------------------- inspect card --
  // The full inspector always lives bottom-right, stacked on the date box, so
  // the eye learns where to look. It opens by growing out of the hover card
  // that was showing when you clicked — the small card becomes the big one.

  placeInspector() {
    const insp = $('#inspector');
    if (!insp || !insp.style || insp.classList.contains('hidden') || typeof innerWidth !== 'number') return;
    const vw = innerWidth, vh = innerHeight;
    if (vw <= 760) {
      // Phones: a full-width sheet. It sits on the bottom bar unless a window
      // already owns the bottom, in which case it takes the space above it.
      const low = ['#drawer', '#buildpick'].map(q => $(q)).filter(e => e && !e.classList.contains('hidden') && e.getBoundingClientRect);
      const top = low.length ? Math.min(...low.map(e => e.getBoundingClientRect().top)) : null;
      insp.style.left = '0px';
      if (top != null) { insp.style.top = '58px'; insp.style.bottom = 'auto'; insp.style.maxHeight = Math.max(160, top - 64) + 'px'; }
      else { insp.style.top = 'auto'; insp.style.bottom = ''; insp.style.maxHeight = ''; }
      return;
    }
    const db = $('#datebox');
    const r = db && db.getBoundingClientRect ? db.getBoundingClientRect() : null;
    const floor = r && r.height ? r.top - 6 : vh - 48;
    insp.style.left = 'auto'; insp.style.top = 'auto';
    insp.style.right = '6px';
    insp.style.bottom = Math.max(6, vh - floor) + 'px';
    insp.style.maxHeight = Math.max(200, floor - 64) + 'px';
  }

  /** Remember the hover card's box as it goes away, so a click right after can grow the inspector out of it. */
  noteTipRect() {
    const t = $('#tip');
    if (!t || !t.getBoundingClientRect || t.classList.contains('hidden')) return;
    const r = t.getBoundingClientRect();
    if (r.width > 0) this.lastTip = { l: r.left, t: r.top, w: r.width, h: r.height, at: performance.now() };
  }

  /**
   * FLIP the inspector from where the hover card was (or, with no card, a
   * small box at the click) to its real place: it starts at the card's size
   * and position and grows into the full panel.
   */
  animateInspectorOpen() {
    const insp = $('#inspector');
    if (!insp || !insp.animate || !insp.getBoundingClientRect) return;
    const to = insp.getBoundingClientRect();
    if (!to.width) return;
    const fresh = this.lastTip && performance.now() - this.lastTip.at < 700 ? this.lastTip : null;
    this.lastTip = null;
    const c = this.clickAt || { x: to.left, y: to.top };
    const from = fresh || { l: c.x - 40, t: c.y - 20, w: 80, h: 40 };
    const sx = from.w / to.width, sy = from.h / to.height;
    insp.animate([
      { transformOrigin: 'top left', transform: `translate(${from.l - to.left}px, ${from.t - to.top}px) scale(${sx}, ${sy})`, opacity: fresh ? 1 : 0.2, borderRadius: '10px' },
      { transformOrigin: 'top left', transform: 'none', opacity: 1 },
    ], { duration: fresh ? 300 : 220, easing: 'cubic-bezier(.2,.9,.25,1)' });
    const body = insp.querySelector && insp.querySelector('.insp-body');
    if (body && body.animate) body.animate([{ opacity: 0 }, { opacity: 0 }, { opacity: 1 }], { duration: 320 });
  }

  applyTool(x0, y0, x1, y1) {
    const g = this.mv;
    const t = this.tool;
    if (this.bandMode()) return 0;
    let n = 0;
    // A building bigger than one tile goes down once, where the drag ended.
    const big = t.mode === 'build' && BUILDINGS[t.id] && BUILDINGS[t.id].size;
    if (big) { x0 = x1; y0 = y1; }
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        if (t.mode === 'mine') n += this.act(g, 'designate', x, y, 'mine') ? 1 : 0;
        else if (t.mode === 'harvest') n += this.act(g, 'designate', x, y, 'harvest') ? 1 : 0;
        else if (t.mode === 'cancel') n += this.act(g, 'designate', x, y, 'cancel') ? 1 : 0;
        else if (t.mode === 'build') n += this.act(g, 'build', x, y, t.id) ? 1 : 0;
        else if (t.mode === 'floor') n += this.act(g, 'buildFloor', x, y, t.id) ? 1 : 0;
      }
    this.renderer.cacheVersion = -1;
    // Say what happened. A drag that ordered nothing used to look identical to
    // one that ordered forty tiles.
    const noun = { mine: 'tile', harvest: 'tile', cancel: 'order', build: BUILDINGS[t.id] ? BUILDINGS[t.id].name : 'tile', floor: FLOORS[t.id] ? FLOORS[t.id].name : 'tile' }[t.mode];
    if (n) this.flash(`${t.mode === 'build' || t.mode === 'floor' ? 'Queued' : t.mode === 'cancel' ? 'Cancelled' : 'Marked'} ${n} ${noun}${n === 1 ? '' : 's'}`, 'good');
    // Placing a building ends build mode. Walls, fences and the like are drawn
    // in runs, so those keep the tool until Esc.
    if (n && t.mode === 'build' && !LINE_BUILDS.has(t.id)) { this.setTool({ mode: 'select' }); this.hide('#buildpick'); }
    if (n) noteTutorialEvent(this.game, t.mode === 'build' ? 'build:' + t.id : t.mode);
    else this.flash(`Nothing there to ${t.mode === 'build' ? 'build on' : t.mode === 'floor' ? 'lay a floor on' : t.mode}`, 'warn');
    return n;
  }

  /** A right-click tap: work whatever's on the tile if anything is, else walk
   *  the selected squad there. */
  rightClickAt(x, y) {
    const g = this.mv, m = g._m, w = g.world;
    // Only people on this map can be sent anywhere on it.
    const ids = [...this.squad].filter(id => { const c = g.colonists.find(k => k.id === id); return c && (c.mapId || 0) === m.id; });
    const n = ids.length;
    if (!n) { this.orderInteract(x, y); return; }
    const who = n === 1 ? g.colonists.find(c => c.id === ids[0]).name.short : `${n} people`;
    const opts = [];
    const add = (icon, label, run, kind = '') => opts.push({ icon, label, run, kind });

    // The way down (the gate, or a floor's stairs) and the way up.
    const way = this.stairsAt(x, y);
    if (way) {
      const where = way === 'up' ? (m.depth === 1 ? 'back to camp' : `up to floor ${m.depth - 1}`) : m.kind === 'camp' ? 'into the Rift' : `down to floor ${m.depth + 1}`;
      add(way === 'up' ? '⬆️' : '🌀', where[0].toUpperCase() + where.slice(1), () => {
        if (way === 'down' && m.kind === 'camp' && !g.canEnterRift) { this.flash('The Rift is open and spewing — nobody goes in until dawn.', 'warn'); return; }
        if (way === 'down' && m.kind === 'floor' && m.depth >= g.floorCount) { this.flash('This is the bottom of the Rift today.', 'warn'); return; }
        this.act(this.game, 'orderTravel', ids, way);
        this.flash(`${who} ${n === 1 ? 'heads' : 'head'} ${where}`, 'good');
      }, 'good');
    }
    // One of ours down on the ground: the nearest of the selection carries them out.
    const hurt = g.here.find(c => c.downed && !c.carriedBy && c.x === x && c.y === y);
    if (hurt) add('🩹', `Carry ${hurt.name.short} to safety`, () => {
      const r = this.act(this.game, 'orderRescue', ids, hurt.id);
      this.flash(r ? `${r.name.short} goes to carry ${hurt.name.short} to safety` : `Nobody selected can carry ${hurt.name.short}`, r ? 'good' : 'warn');
    }, 'good');
    // A friend standing there (not one of the selection): walk over and trade places.
    const friend = g.here.find(c => !c.downed && !c.dead && !ids.includes(c.id) && c.x === x && c.y === y);
    if (friend && n === 1) add('🔄', `Swap places with ${friend.name.short}`, () => { this.act(g, 'orderMove', ids, x, y); this.flash(`${who} swaps places with ${friend.name.short}`, 'info'); });
    // Beasts: ours can be given a handler or slaughtered; wild ones tamed or hunted.
    const beast = g.beasts.find(b => !b.dead && b.x === x && b.y === y);
    if (beast && beast.tame) {
      const lead = g.colonists.find(c => c.id === ids[0]);
      if (canFollow(beast)) {
        const same = beast.handler === lead.id;
        add('🦮', same ? `${beast.name} stops following ${lead.name.short}` : `${beast.name} follows ${lead.name.short}`, () => {
          this.act(this.game, 'setHandler', beast.id, same ? null : lead.id);
          this.flash(same ? `${beast.name} no longer follows ${lead.name.short}` : `${beast.name} now follows ${lead.name.short}`, 'good');
          this.sigs.insp = null;
        });
      }
      add('🔪', beast.markedButcher ? `Spare ${beast.name}` : `Mark ${beast.name} for slaughter`, () => { this.act(this.game, 'markButcher', beast.id); this.sigs.insp = null; }, 'danger');
    } else if (beast) {
      const A = ANIMALS[beast.species];
      add('🤝', `Tame the ${A.name}${A.wildAggressive ? ' (dangerous)' : ''}`, () => {
        const c = this.act(this.game, 'orderTame', ids, beast.id);
        this.flash(c ? `${c.name.short} tries to tame the ${A.name}` : 'Nobody free to do it', c ? 'good' : 'warn');
      }, 'good');
      add('⚔️', `Hunt the ${A.name}`, () => {
        const k = this.act(this.game, 'orderHunt', ids, beast.id);
        this.flash(k ? `${who} ${n === 1 ? 'hunts' : 'hunt'} the ${A.name}` : 'Nobody free to do it', k ? 'warn' : 'info');
      }, 'danger');
    }
    // Someone else's people: talk to the neutral ones, fight anyone.
    const r = g.raiders.find(r => r.hp > 0 && r.x === x && r.y === y);
    if (r && r.neutral) add('💬', `Talk to ${r.name.short}`, () => { this.sel = { kind: 'enemy', id: r.id, ref: r }; this.sigs.insp = null; this.renderInspector(); }, 'good');
    if (r) add('⚔️', `Attack ${r.name.short}${r.neutral ? ' (they are neutral)' : ''}`, () => { this.act(g, 'orderAttack', ids, r.id); this.flash(`${who} ${n === 1 ? 'attacks' : 'attack'} ${r.name.short}`, 'warn'); }, 'danger');
    // Something workable: everyone takes a side of it and works it at once.
    const job = g.siteJobAt(x, y);
    if (job) {
      const f = w.feature[w.idx(x, y)];
      const label = job.kind === 'harvest' && f && FEATURES[f].prop ? `Open the ${FEATURES[f].name.toLowerCase()}`
        : job.kind === 'harvest' ? `${f === 'tree' ? 'Chop' : 'Harvest'} ${f && FEATURES[f] ? FEATURES[f].name.toLowerCase() : ''}`.trim()
          : { mine: 'Mine', build: 'Build', floor: 'Lay the floor' }[job.kind];
      add({ mine: '⛏️', harvest: f === 'tree' ? '🪓' : '🌿', build: '🔨', floor: '🧱' }[job.kind], `${label}${n > 1 ? ` together (×${n})` : ''}`, () => {
        if (!this.act(g, 'orderWork', ids, x, y)) { this.flash('Nobody can get at it', 'warn'); return; }
        this.renderer.cacheVersion = -1;
        this.flash(`${who}: ${label.toLowerCase()}`, 'good');
      }, 'good');
    }
    // A shop with an empty counter: put the selected person behind it.
    const bd = w.inside(x, y) ? w.building[w.idx(x, y)] : null;
    if (bd && bd.done && KEPT_SHOPS.has(bd.id) && n === 1) {
      const c = g.colonists.find(k => k.id === ids[0]);
      if (bd.keeper !== c.id) add('🧑‍💼', `${c.name.short} keeps the ${BUILDINGS[bd.id].name}`, () => { assignKeeper(g, bd, c.id); this.sigs.insp = null; this.renderInspector(); }, 'good');
    }
    if (w.walkable(x, y)) add('👣', `Move ${n === 1 ? who : n + ' people'} here`, () => { this.act(g, 'orderMove', ids, x, y); this.flash(`Moving ${n === 1 ? who : n + ' people'}`, 'info'); });
    else if (!opts.length) add('👣', 'Move as close as they can', () => { this.act(g, 'orderMove', ids, x, y); this.flash(`Moving ${n === 1 ? who : n + ' people'}`, 'info'); });

    // Plain ground is just a move; anything more gets the menu.
    if (opts.length === 1) { opts[0].run(); return; }
    this.showCtxMenu(opts);
  }

  /** The right-click menu: every way the selection can interact with the tile. */
  showCtxMenu(opts) {
    let box = $('#ctxmenu');
    if (!box) {
      box = el('div', 'ctxmenu');
      box.id = 'ctxmenu';
      document.body.appendChild(box);
      const close = (e) => { if (!box.classList.contains('hidden') && !(e.target && e.target.closest && e.target.closest('#ctxmenu'))) box.classList.add('hidden'); };
      addEventListener('mousedown', close, true);
      // Esc closes it; 1-9 picks an option (ahead of the game's own hotkeys).
      addEventListener('keydown', (e) => {
        if (box.classList.contains('hidden')) return;
        const k = +e.key;
        if (e.key === 'Escape') { box.classList.add('hidden'); e.stopPropagation(); return; }
        if (k >= 1 && this.ctxOpts && this.ctxOpts[k - 1]) { e.preventDefault(); e.stopPropagation(); box.classList.add('hidden'); this.ctxOpts[k - 1].run(); }
      }, true);
    }
    box.innerHTML = '';
    opts.forEach((o, i) => {
      const b = el('button', 'cm-it' + (o.kind ? ' ' + o.kind : ''), `<span class="cm-ic">${o.icon}</span><span>${esc(o.label)}</span><kbd>${i + 1}</kbd>`);
      b.onclick = () => { box.classList.add('hidden'); o.run(); };
      box.appendChild(b);
    });
    this.ctxOpts = opts;
    box.classList.remove('hidden');
    if (typeof innerWidth !== 'number') return;   // headless: no viewport to place it in
    const mx = (this.mouse && this.mouse.x) || innerWidth / 2, my = (this.mouse && this.mouse.y) || innerHeight / 2;
    const r = box.getBoundingClientRect();
    box.style.left = `${Math.min(mx + 4, innerWidth - r.width - 8)}px`;
    box.style.top = `${Math.min(my + 4, innerHeight - r.height - 8)}px`;
  }

  /** 'down' on the camp's Rift Gate or a floor's stairs down, 'up' on stairs up, else null. */
  stairsAt(x, y) {
    const g = this.mv, m = g._m, w = g.world;
    if (m.kind === 'camp') return this.onGate(x, y) ? 'down' : null;
    const on = (s) => s && s.x === x && s.y === y;
    if (on(w.stairsUp)) return 'up';
    if (on(w.stairsDown)) return 'down';
    return null;
  }

  /** Designate (if needed) and rush whatever's minable, harvestable or mid-build
   *  on this tile. Returns whether there was anything to do. */
  orderInteract(x, y) {
    const g = this.mv, w = g.world;
    if (!w.inside(x, y)) return false;
    const i = w.idx(x, y);
    const b = w.building[i];
    if (b && !b.done) { this.act(g, 'rush', x, y); this.flash(`Rushing ${BUILDINGS[b.id].name}`, 'good'); return true; }
    const f = w.feature[i];
    if (TERRAIN[w.terrain[i]].mineable || (f && FEATURES[f].inRock)) {
      this.act(g, 'designate', x, y, 'mine'); this.act(g, 'rush', x, y);
      this.renderer.cacheVersion = -1;
      this.flash('Rushing mining', 'good');
      return true;
    }
    if (f && !FEATURES[f].inRock) {
      this.act(g, 'designate', x, y, 'harvest'); this.act(g, 'rush', x, y);
      this.renderer.cacheVersion = -1;
      this.flash('Rushing harvest', 'good');
      return true;
    }
    return false;
  }

  /** A short, self-clearing note in the toast stack for the player's own actions. */
  flash(text, kind = 'info') {
    this.toasts.push({ text, kind, until: performance.now() + 2600 });
    this.paintToasts();
  }

  /** True when a left-drag should band-select rather than paint a designation. */
  bandMode() { return this.tool.mode === 'select' || this.tool.mode === 'squad'; }

  /** Everyone the given band currently encloses. Colonists only — a squad is people. */
  inBand(d) {
    const ax = Math.min(d.x0, d.x1), bx = Math.max(d.x0, d.x1);
    const ay = Math.min(d.y0, d.y1), by = Math.max(d.y0, d.y1);
    return this.mv.here.filter(c => !c.away && c.x >= ax && c.x <= bx && c.y >= ay && c.y <= by);
  }

  selectBand(d, additive) {
    const hit = this.inBand(d);
    if (!additive) this.squad.clear();
    for (const c of hit) this.squad.add(c.id);
    if (!this.squad.size) {
      // An empty band is a request to look at the ground, not a no-op.
      this.selectAt(d.x0, d.y0, false);
      return;
    }
    this.squadChanged();
  }

  /**
   * The order selection changed from the map. It only re-marks the colonist bar
   * and whatever panel lists people; the inspector is left alone unless it was
   * showing people who are no longer the selection.
   */
  squadChanged() {
    if (this.sel && (this.sel.kind === 'colonist' || this.sel.kind === 'squad')) this.closeInspector(false);
    this.sigs.colbar = null;
    this.renderDrawer();
  }

  /** Point the inspector at the squad — or at the one person, if that is all it is. */
  commitSquad() {
    const ids = [...this.squad];
    this.sel = ids.length === 1 ? { kind: 'colonist', id: ids[0] } : { kind: 'squad' };
    if (ids.length === 1 && !['overview', 'skills', 'class', 'gear'].includes(this.tab)) this.tab = 'overview';
    this.renderer.selection = this.sel;
    this.sigs.insp = null;
    this.renderInspector();
    this.renderDrawer();
  }

  selectAllColonists() {
    this.squad.clear();
    for (const c of this.game.colonists) if (!c.away) this.squad.add(c.id);
    if (this.squad.size) this.commitSquad();
  }

  clearSquad() {
    if (!this.squad.size) return;
    this.squad.clear();
    if (this.sel && (this.sel.kind === 'squad' || this.sel.kind === 'colonist')) this.closeInspector();
  }

  toggleInSquad(id) {
    if (this.squad.has(id)) this.squad.delete(id); else this.squad.add(id);
    if (this.squad.size) this.commitSquad(); else this.closeInspector();
  }

  /** True on any tile of the Rift Gate's mouth, with a tile of margin for the ring. */
  onGate(x, y) {
    const r = this.game.maps[0].world.rift;
    if (!r) return false;
    return ((x - r.x) / (r.rx + 1)) ** 2 + ((y - r.y) / (r.ry + 1)) ** 2 <= 1;
  }

  /** "Enter the Rift": the saved party walks to the gate and steps through. */
  openGate() {
    const g = this.game;
    if (!g.canEnterRift) { this.flash('The Rift is open and spewing — parties go in by day.', 'warn'); return; }
    const ids = this.partyIds();
    const r = this.act(g, 'launchExpedition', null, ids);
    if (!r.ok) { this.flash(r.why, 'warn'); return; }
    this.squad.clear(); for (const id of r.ids) this.squad.add(id);
    this.squadChanged();
    this.flash(`${r.ids.length === 1 ? 'One heads' : r.ids.length + ' head'} for the Rift Gate`, 'good');
  }

  /** The saved party: living, home colonists only; if none saved yet, the strongest five bar one. */
  partyIds() {
    const g = this.game;
    const avail = g.colonists.filter(c => !c.away && !c.dead && !c.mapId);
    let ids = this.party.ids.filter(id => avail.some(c => c.id === id));
    if (!ids.length && !this.party.set) {
      ids = [...avail].sort((a, b) => powerOf(b) - powerOf(a)).slice(0, Math.max(1, Math.floor(avail.length / 2))).map(c => c.id);
    }
    return ids;
  }

  selectAt(x, y, additive = false) {
    const g = this.mv;
    const c = g.here.find(c => !c.away && c.x === x && c.y === y);
    if (c) {
      // Clicking one of your own people picks them up for orders — the yellow
      // outline says who. Their card is what hovering is for (or a portrait
      // click); the map click stays about commanding.
      if (additive) { if (this.squad.has(c.id)) this.squad.delete(c.id); else this.squad.add(c.id); }
      else { this.squad.clear(); this.squad.add(c.id); }
      this.squadChanged();
      return;
    } else if (g._m.kind === 'camp' && this.hitVisitor(x, y)) {
      this.drawer = 'trade'; this.renderRail(); this.renderDrawer();
      return;
    } else {
      if (!additive) this.squad.clear();
      const r = g.raiders.find(r => r.hp > 0 && r.x === x && r.y === y);
      const b = g.beasts.find(b => !b.dead && !b.away && b.x === x && b.y === y);
      if (r) this.sel = { kind: 'enemy', ref: r };
      else if (b) this.sel = { kind: 'beast', id: b.id, ref: b };
      else if (g._m.kind === 'camp' && this.onGate(x, y)) { this.drawer = 'party'; this.sigs.drawer = null; this.hide('#buildpick'); this.renderRail(); this.renderDrawer(); return; }
      else if (g.world.inside(x, y) && this.tileWorthInspecting(x, y)) this.sel = { kind: 'tile', x, y };
      else {
        // Bare ground has nothing to read or order: a click there dismisses
        // whatever was open instead of opening a panel about grass.
        this.closeInspector(false);
        return;
      }
    }
    this.renderer.selection = this.sel;
    this.sigs.insp = null;
    this.renderInspector();
  }
  /**
   * A "Details ▾" fold: panels lead with what matters and tuck reference data
   * away. Open/closed is remembered per key, so a reader who wants the numbers
   * only opens it once.
   */
  fold(key, label, html) {
    if (!this.folds) { try { this.folds = JSON.parse(storeGet('riftgate.folds') || '{}'); } catch (e) { this.folds = {}; } }
    return `<details class="fold" data-fold="${key}"${this.folds[key] ? ' open' : ''}><summary>${label}</summary>${html}</details>`;
  }
  noteFold(d) {
    if (!d || !d.dataset || !d.dataset.fold) return;
    if (!this.folds) this.folds = {};
    this.folds[d.dataset.fold] = d.open;
    storeSet('riftgate.folds', JSON.stringify(this.folds));
  }
  /** Does this tile hold anything a panel could say or order? Plain ground doesn't. */
  tileWorthInspecting(x, y) {
    const w = this.mv.world, i = w.idx(x, y);
    if (w.building[i] || w.feature[i] || w.designation[i]) return true;
    if (w.floor && w.floor[i]) return true;
    if (TERRAIN[w.terrain[i]].mineable) return true;
    if (w.isRift && w.isRift(x, y)) return true;
    for (const s of [w.stairsUp, w.stairsDown, w.lair]) if (s && s.x === x && s.y === y) return true;
    return (this.mv.ground || []).some(p => p.x === x && p.y === y);
  }
  closeInspector(dropSquad = true) {
    this.sel = null;
    this.renderer.selection = null;
    if (dropSquad) this.squad.clear();
    this.sigs.insp = null;
    this.hide('#inspector');
  }

  // ------------------------------------------------------------- visitors --
  // The caravan's wagon and its people, and the arcane peddler: purely
  // cosmetic sprites that walk in from the map edge and idle near camp while
  // game.caravan / game.peddler exist. They carry no simulation state and
  // never touch game.rng, so a headless run is unaffected either way.
  /** A walkable point on the map border, picked without touching game.rng. */
  visitorEdgePoint() {
    const w = this.game.world;
    for (let tries = 0; tries < 60; tries++) {
      const side = Math.floor(Math.random() * 4);
      const x = side === 2 ? 1 : side === 3 ? w.w - 2 : 1 + Math.floor(Math.random() * (w.w - 2));
      const y = side === 0 ? 1 : side === 1 ? w.h - 2 : 1 + Math.floor(Math.random() * (w.h - 2));
      if (w.walkable(x, y)) return { x, y };
    }
    return { x: w.start.x, y: w.start.y };
  }

  spawnVisitorGroup(kind, source) {
    const w = this.game.world;
    const edge = this.visitorEdgePoint();
    const near = { x: w.start.x + (Math.random() < 0.5 ? -4 : 4), y: w.start.y + Math.round((Math.random() - 0.5) * 5) };
    const trader = { race: source.trader?.race || 'human', klass: 'merchant' };
    const folk = () => ({ role: 'person', race: Math.random() < 0.7 ? trader.race : 'human', klass: 'merchant' });
    const members = kind === 'caravan'
      ? [{ role: 'wagon' }, { role: 'person', ...trader }, folk(), ...(Math.random() < 0.5 ? [folk()] : [])]
      : [{ role: 'person', race: source.race || 'human', klass: 'wizard' }];
    // Visitors walk the same tiles colonists do, one body to a tile: they
    // file in from the edge on separate squares and form up near camp.
    const taken = new Set();
    for (const [k, m] of members.entries()) {
      m.id = 'visitor:' + kind + ':' + k;
      const at = this.visitorFreeTile(edge.x, edge.y, taken) || [edge.x, edge.y];
      m.x = at[0]; m.y = at[1];
      taken.add(at[0] + ',' + at[1]);
      m.cd = k * 0.45;          // leave in single file
      m.path = null; m.waits = 0;
    }
    return { kind, edge, near, members, state: 'in' };
  }

  /** Nearest walkable tile to (x, y) with no colonist, animal, raider or other
   *  visitor on it. Reads the simulation's occupancy; never writes it. */
  visitorFreeTile(x, y, taken = new Set(), maxR = 8) {
    const g = this.game, w = g.world;
    const others = new Set();
    for (const v of this.visitors) for (const m of v.members) others.add(m.x + ',' + m.y);
    const ok = (tx, ty) => w.inside(tx, ty) && w.walkable(tx, ty) && !occupantAt(g, tx, ty)
      && !taken.has(tx + ',' + ty) && !others.has(tx + ',' + ty);
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (ok(x + dx, y + dy)) return [x + dx, y + dy];
      }
    }
    return null;
  }

  /** Walk each visitor group toward camp (or back out, once its source is
   *  gone), and spawn/retire groups as game.caravan / game.peddler come and go.
   *  Movement is tile by tile, like everyone else's; the renderer slides them. */
  updateVisitors(dt) {
    const g = this.game, w = g.world;
    if (g.caravan && !this.visitors.some(v => v.kind === 'caravan')) this.visitors.push(this.spawnVisitorGroup('caravan', g.caravan));
    if (g.peddler && !this.visitors.some(v => v.kind === 'peddler')) this.visitors.push(this.spawnVisitorGroup('peddler', g.peddler));
    const STEP = 0.32;   // seconds per tile — a brisk, purely cosmetic walk
    const busy = (x, y, self) => occupantAt(g, x, y)
      || this.visitors.some(v => v.members.some(m => m !== self && m.x === x && m.y === y));
    for (const v of this.visitors) {
      if (v.state !== 'out' && (v.kind === 'caravan' ? !g.caravan : !g.peddler)) {
        v.state = 'out';
        for (const m of v.members) { m.goal = null; m.path = null; }
      }
      for (const m of v.members) {
        if (m.gone) continue;
        // Somebody from the hold walked onto this tile: step aside for them.
        if (!m.path && occupantAt(g, m.x, m.y)) {
          const spot = this.visitorFreeTile(m.x, m.y, new Set(), 3);
          if (spot) { m.x = spot[0]; m.y = spot[1]; if (v.state !== 'out') m.goal = spot; }
        }
        if (!m.goal) {
          const taken = new Set(v.members.filter(o => o !== m && o.goal).map(o => o.goal[0] + ',' + o.goal[1]));
          m.goal = v.state === 'out' ? [v.edge.x, v.edge.y] : (this.visitorFreeTile(v.near.x, v.near.y, taken) || [v.near.x, v.near.y]);
          m.path = null;
        }
        m.cd -= dt;
        if (m.cd > 0) continue;
        if (m.x === m.goal[0] && m.y === m.goal[1]) {
          m.path = null; m.cd = 0;   // idling banks no steps
          if (v.state === 'out') m.gone = true;
          continue;
        }
        if (!m.path || m.pathIdx >= m.path.length) {
          m.path = findPath(w, m.x, m.y, m.goal[0], m.goal[1], false, 20000, m.waits > 3 ? g.occ : null);
          m.pathIdx = 0;
          if (!m.path) {
            // No road (walled camp, goal taken): settle wherever is free.
            if (v.state === 'out') m.gone = true;
            else m.goal = [m.x, m.y];
            continue;
          }
        }
        const next = m.path[m.pathIdx];
        if (busy(next[0], next[1], m)) {
          m.waits = (m.waits || 0) + 1;
          m.cd = STEP;
          if (m.waits % 4 === 0) m.path = null;                 // re-plan around the crowd
          if (m.waits > 12 && v.state !== 'out') m.goal = null; // our slot is taken for good
          continue;
        }
        m.x = next[0]; m.y = next[1]; m.pathIdx++;
        m.waits = 0;
        m.cd += STEP * (w.moveCost ? w.moveCost(m.x, m.y) : 1);
      }
      if (v.state === 'in' && v.members.every(m => m.goal && m.x === m.goal[0] && m.y === m.goal[1])) v.state = 'here';
    }
    for (const v of this.visitors) v.members = v.members.filter(m => !m.gone);
    this.visitors = this.visitors.filter(v => v.members.length);
    this.renderer.visitors = this.visitors;
  }

  /** The visitor group (if any) standing on this tile. */
  hitVisitor(x, y) {
    for (const v of this.visitors) for (const m of v.members) if (m.x === x && m.y === y) return v;
    return null;
  }

  // ----------------------------------------------------------------- loop --
  loop() {
    // A 10-minute day (5 min of day, 5 of night) at speed 1: 1440 ticks in
    // 600 s of wall time = 2.4 ticks/s. Fractional ticks accrue in `this.tickAcc`
    // and are stepped off whole; the speed buttons are multipliers on that rate
    // rather than a literal steps-per-frame count, so they stay smooth at any
    // frame rate.
    const TICKS_PER_SEC = 2.4;
    const mult = [0, 1, 3, 8, 20];
    this.tickAcc = 0;
    let last = performance.now();
    const frame = (now) => {
      now = Number.isFinite(now) ? now : last;
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      const g = this.game;
      const co = this.coop;
      if (co && co.role === 'guest') {
        // A guest's clock is the host's: step towards the last tick it announced,
        // quickly when behind, and never past it.
        const G = co.guest;
        this.speed = G.speed; this.paused = G.paused;
        if (G.game === g) {
          // advance() also runs orders due now, so one given while paused lands at once.
          const until = now + 12;
          do G.advance(8); while (G.behind > 0 && !G.waiting && performance.now() < until);
        }
        if (!this.paused) this.updateVisitors(dt);
        this.renderCoopBadge();
      } else if (!this.paused && !g.gameOver) {
        this.tickAcc += dt * TICKS_PER_SEC * (mult[this.speed] ?? 1);
        const host = co && co.role === 'host' ? co.host : null;
        while (this.tickAcc >= 1) { this.tickAcc -= 1; if (this.auto && !host) autoplayStep(g, { build: false }); g.step(); if (host) host.afterStep(); }
        this.updateVisitors(dt);
      }
      if (co && co.role === 'host') {
        co.host.setClock(this.speed, this.paused || !!g.gameOver);
        if (now - (co.lastFlush || 0) > 50) { co.lastFlush = now; co.host.flush(); }
      }
      // Autosave with the sunrise; and, if asked, stop the clock when a fight breaks out.
      if (this.slot && this.opts.autosave && !g.gameOver && g.hour >= 6 && this.lastAutoDay !== g.day) {
        this.lastAutoDay = g.day;
        this.saveToSlot('auto');
      }
      const fighting = g.maps.some(m => m.field && m.field.units.size);
      if (fighting && !this.wasFighting && this.opts.pauseOnFight && !this.paused && !(co && co.role === 'guest')) {
        this.paused = true; this.flash('A fight has broken out — paused (space to resume)', 'warn'); this.renderTop();
      }
      this.wasFighting = fighting;
      // A floor let go at dawn can't stay on screen.
      if (!g.mapById(this.mapId)) this.viewMap(0);
      this.renderer.game = this.mv;
      this.renderer.draw();
      this.renderTop();
      this.pumpToasts();
      // Panels refresh on a wall clock rather than every frame — and not at all
      // while the pointer is inside one. Rebuilding a panel under the cursor
      // cancels the hover that its charts use to show you their numbers.
      if (!this.panelHover && now - (this.lastPanel || 0) > 400) {
        this.lastPanel = now;
        this.renderInspector(); this.renderDrawer(); this.renderRail();
      }
      this.tickTips(now);
      this.checkMoments();
      if (g.gameOver) this.showGameOver();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** The tutorial tracker: pinned above the alerts, a step's words and a row of pips. */
  tutorialCardHtml(a, i) {
    const t = tutorialState(this.game);
    const pips = TUTORIAL_STEPS.map((s, k) => `<i class="${k < t.step ? 'on' : k === t.step ? 'now' : ''}"></i>`).join('');
    return `<div class="al tut" data-i="${i}" title="${a.drawer ? 'Click to open' : ''}">
      <span class="ai">${a.icon}</span><div class="tut-b"><div class="tut-h"><span>Getting started · ${t.step + 1}/${TUTORIAL_STEPS.length}</span><button data-tut-skip="1" title="Skip the tutorial (replay it from the ? help)">Skip</button></div>
      <div class="at">${esc(a.text)}</div><div class="tut-p">${pips}</div></div></div>`;
  }
  skipTutorial() {
    skipTutorialState(this.game); this.sigs.alerts = null; this.renderAlerts(); this.pulseTarget(null);
    this.flash('Tutorial skipped. Replay it any time from the ? help.', 'info');
  }
  /** Ring the thing a tutorial step is about; one ring at a time. */
  pulseTarget(sel) {
    if (this.pulseSel === sel) return;
    for (const e of document.querySelectorAll('.tut-pulse')) e.classList.remove('tut-pulse');
    this.pulseSel = sel;
    if (sel) { const e = document.querySelector(sel); if (e) e.classList.add('tut-pulse'); }
  }

  /** Big moments get a card of their own, not just a log line. */
  checkMoments() {
    const g = this.game;
    const now = performance.now();
    if (now - (this.lastTut || 0) > 500) {
      this.lastTut = now;
      const r = advanceTutorial(g);
      for (const s of r.completed) this.toast(`✓ ${s.why}`, 'good');
      for (const tip of r.tips) this.toast(`💡 ${tip.text}`, 'info');
      if (r.finished) this.toast('🎉 That’s the basics. The rest is yours to find.', 'good');
      if (r.completed.length) this.sigs.alerts = null;
      const step = currentStep(g);
      this.pulseTarget(step && !(step.drawer && this.drawer === step.drawer) ? step.target : null);
    }
    const L = g.lastLair;
    if (L && L.tick !== this.seenLairTick) {
      this.seenLairTick = L.tick;
      if (L.tick < g.tick - TICKS_PER_DAY / 4) return;   // an old one from a loaded save
      const m = $('#modal');
      m.innerHTML = `<div class="mbox lair-win">
        <div class="lw-ic">🏆</div>
        <h2>The lair on floor ${L.depth} is broken</h2>
        <div class="mini">Its hoard lies where the boss fell. Your delvers carry it home: loot counts once it's walked out of the Rift.</div>
        <div class="goal-rw">${Object.entries(L.loot).filter(([, q]) => q > 0).map(([k, q]) => kw('res', k, { qty: Math.round(q) })).join('')}
          <span class="kw kw-good"><i>⚔️</i>${L.items} piece${L.items === 1 ? '' : 's'} of gear to the stash</span>
          <span class="kw kw-good"><i>🌙</i>No wave for 2 nights</span>
          ${L.tome ? '<span class="kw kw-good"><i>📕</i>A Class Tome — turn a peasant into a hero</span>' : ''}</div>
        <div class="mini">The Rift deepens every ${RIFT_DAYS_PER_LEVEL} days, and a new lair waits at the new bottom.</div>
        <div class="ct-row" style="justify-content:flex-end;margin-top:12px">
          ${L.tome ? '<button class="act" data-lw="classes">🎓 Choose who reads it</button>' : ''}<button class="act primary" data-lw="close">Onward</button></div></div>`;
      this.show('#modal');
      m.onclick = (e) => {
        const b = e.target.closest && e.target.closest('[data-lw]');
        if (e.target.id !== 'modal' && !b) return;
        this.hide('#modal'); m.onclick = null;
        if (b && b.dataset.lw === 'classes') this.openDrawer('classes');
      };
    }
  }

  // ------------------------------------------------------------- top bar --
  /**
   * How many days of food the colony is standing on. This is the number the old
   * bar made the player compute in their head from "Food 90 · pop 5".
   */
  foodDays() { return foodDaysOf(this.game); }

  renderTop() {
    const g = this.game;
    const hh = String(g.hour).padStart(2, '0'), mm = String(g.minute).padStart(2, '0');
    // Bottom-right date readout, RimWorld order: time, then date, then place.
    $('#clock').innerHTML = `<div class="ck-row"><span class="ck-t">${hh}:${mm}</span><span class="ck-sky">${g.isNight ? '🌙' : '☀️'}</span></div>
      <div class="ck-s">${SEASON_ICON[g.season] || ''} Day ${g.dayOfSeason} of ${g.season}, Year ${g.year}</div>
      <div class="ck-s dim">${BIOMES[g.biome].name} · day ${g.day}</div>`;
    const mor = Math.round(g.morale);
    $('#threat').innerHTML = `<div class="kv" data-tip="rift"><span class="k">🌀 Rift</span><span class="v${g.isNight ? ' open' : ''}">Lv ${g.rift.level} · <b>${g.riftRank}</b> · ${g.isNight ? `dawn ${g.hoursToDawn}h` : `dusk ${g.hoursToDusk}h`}</span></div>
      <div class="kv"><span class="k">Morale</span><span class="v"><b style="color:${moodStatus(mor).color}">${mor}</b></span></div>`;

    // Top-left resource readout: icon, count, and a sliver of fill against the
    // storage ceiling — the ceiling is what silently throws hauls away.
    const cap = g.storageCap;
    // Gold leads: it's the resource with the least obvious source, so it
    // carries its own trend — the net of the last day at the treasury.
    const keys = ['gold', 'food', 'meal', 'wood', 'stone', 'iron', 'cloth', 'leather', 'herbs', 'gems', 'dust', 'relics', 'gear', 'potion'];
    const lastDay = ((g.ledger && g.ledger.days) || []).filter(d => d.net != null).slice(-1)[0];
    const sig = keys.map(k => Math.floor(g.resources[k] || 0)).join(',') + '|' + cap + '|' + (lastDay ? lastDay.net : '');
    if (this.sigs.res !== sig) {
      this.sigs.res = sig;
      const fd = this.foodDays();
      $('#res').innerHTML = keys.filter(k => ['gold', 'food', 'meal', 'wood', 'stone'].includes(k) || (g.resources[k] || 0) >= 1).map((k, i) => {
        const v = Math.floor(g.resources[k] || 0);
        const frac = Math.max(0, Math.min(1, v / cap));
        const low = (k === 'food' && fd < 2.5) || (k === 'meal' && v < 4);
        const full = v > cap;
        if (k === 'gold') {
          const n = lastDay ? lastDay.net : null;
          return `<div class="rr gold-rr" data-tip="res:gold"><span class="ci">${RESOURCE_ICON.gold}</span><i>${v}</i>${n != null ? `<em class="${n >= 0 ? 'up' : 'dn'}">${n >= 0 ? '+' : ''}${n}/d</em>` : '<em></em>'}</div>`;
        }
        return `<div class="rr${low ? ' low' : ''}${full ? ' full' : ''}${k === 'food' ? ' sep' : ''}" data-tip="res:${k}">
          <span class="ci">${RESOURCE_ICON[k]}</span><i>${v}</i><u><s style="width:${Math.round(frac * 100)}%;background:${RESOURCES[k].color}"></s></u></div>`;
      }).join('');
    }

    this.renderResearchChip();
    this.renderColbar();
    this.renderMapTabs();
    this.renderFightLog();
    this.renderAlerts();

    document.querySelectorAll('.spd button').forEach(b => {
      b.classList.toggle('on', b.dataset.spd === 'p' ? this.paused : (!this.paused && +b.dataset.spd === this.speed));
    });
    const ob = $('#overlaybtn');
    if (ob) {
      const o = this.renderer.overlay;
      ob.classList.toggle('on', !!o);
      ob.textContent = o === 'soil' ? '🟫' : o === 'water' ? '💧' : '🗺️';
      ob.title = `Overlay: ${o || 'off'} — click to cycle soil / water (O)`;
    }
    const ab = $('#autobtn');
    if (ab) ab.classList.toggle('on', this.auto);
    const hb = $('#hoverbtn');
    if (hb) { hb.classList.toggle('on', this.hoverInfo); hb.title = `Hover info: ${this.hoverInfo ? 'on' : 'off'} — the cards that follow the pointer over the map`; }
  }

  /** What's being researched, beside the resources: name, a progress bar, what's queued next. */
  renderResearchChip() {
    const box = $('#rsch');
    if (!box) return;
    const g = this.game, R = g.research, cur = R.current, def = cur && g.researchDefs[cur];
    const pct = def ? Math.min(100, Math.floor((R.progress / def.cost) * 100)) : 0;
    const sig = `${cur}|${pct}|${R.queue.length}`;
    if (this.sigs.rsch !== sig) {
      this.sigs.rsch = sig;
      box.classList.toggle('none', !def);
      box.innerHTML = def
        ? `<div class="rs-h"><span class="rs-i">🔬</span><b>${esc(def.name)}</b><span class="rs-p">${pct}%</span></div>
           <u><s style="width:${pct}%"></s></u>${R.queue.length ? `<div class="rs-q">then ${esc(g.researchDefs[R.queue[0]].name)}${R.queue.length > 1 ? ` +${R.queue.length - 1}` : ''}</div>` : ''}`
        : `<div class="rs-h"><span class="rs-i">🔬</span><b>No research</b></div><div class="rs-q">Click to choose a project</div>`;
      if (!box.onclick) box.onclick = () => this.openDrawer('research');
    }
    // Sit just right of the resource readout, whatever its width.
    const res = $('#res');
    if (res) box.style.left = `${res.offsetLeft + res.offsetWidth + 6}px`;
  }

  /**
   * RimWorld's colonist bar: one portrait per colonist along the top. The box
   * fills from the bottom with mood, a red sliver on the left is lost health,
   * and the corner shows what they are doing. Breaking colonists pulse red.
   */
  renderColbar() {
    const g = this.game;
    const cs = g.colonists;
    const sig = cs.map(c => `${c.id}:${Math.round(c.mood / 4)}:${Math.round(c.hp / c.maxHp * 10)}:${c.away ? 1 : 0}:${labourOf(c)}:${this.squad.has(c.id) ? 1 : 0}:${c.mapId || 0}:${c.hold ? 1 : 0}:${c.downed ? 1 : 0}`).join('|');
    if (this.sigs.colbar === sig) return;
    this.sigs.colbar = sig;
    const bar = $('#colbar');
    if (!bar.dataset.hov) {
      // Hovering a portrait lights that colonist up on the map.
      bar.dataset.hov = '1';
      bar.addEventListener('mouseover', (e) => { const cb = e.target.closest && e.target.closest('.cb'); this.renderer.barHover = cb ? +cb.dataset.id : null; });
      bar.addEventListener('mouseleave', () => { this.renderer.barHover = null; });
    }
    bar.innerHTML = cs.map(c => {
      const m = moodStatus(c.mood);
      const lost = 1 - c.hp / c.maxHp;
      return `<div class="cb${this.squad.has(c.id) ? ' sel' : ''}${c.away ? ' away' : ''}${c.mood < 20 && !c.away ? ' brk' : ''}"
        data-id="${c.id}" data-tip="col:${c.id}">
        ${c.mapId ? `<em class="mp">F${(g.mapById(c.mapId) || {}).depth || '?'}</em>` : ''}${c.hold ? '<em class="hd" data-tipt="Holding position (F to release)">⚓</em>' : ''}
        <div class="pt"><s style="height:${c.mood}%;background:${m.color}"></s><span>${RACE_ICON[c.race] || '🧑'}</span>
          ${lost > 0.02 ? `<em class="hp"><i style="height:${Math.round(lost * 100)}%"></i></em>` : ''}
          <span class="tk">${taskIcon(c)}</span></div>
        <div class="nm">${esc(c.name.short)}</div></div>`;
    }).join('');
  }

  /**
   * The row of maps above the colonist bar: the camp and every Rift floor
   * that exists, each with how many of yours are on it and a pulsing dot when
   * something there is awake and hunting them. Hidden while the camp is all there is.
   */
  renderMapTabs() {
    const g = this.game, box = $('#maptabs');
    if (!box) return;
    const count = (m) => g.colonists.filter(c => !c.dead && (c.mapId || 0) === m.id).length;
    // The overworld, and every Rift floor someone of ours is standing on (or that's on screen).
    const maps = [g.maps[0], ...g.floors.filter(m => count(m) > 0 || m.id === this.mapId)].sort((a, b) => (a.depth || 0) - (b.depth || 0));
    const fight = (m) => m.kind === 'floor' ? m.raiders.some(r => r.hp > 0 && r.awake) : m.raiders.some(r => r.hp > 0);
    const sig = maps.map(m => `${m.id}:${count(m)}:${fight(m) ? 1 : 0}`).join('|') + '|' + this.mapId;
    if (this.sigs.maptabs === sig) return;
    this.sigs.maptabs = sig;
    box.classList.toggle('hidden', maps.length < 2);
    box.innerHTML = maps.map(m => {
      const label = m.kind === 'camp' ? '<span>🏕️ Overworld</span>' : `<span>🌀 Dungeon F${m.depth}</span>`;
      const tip = m.kind === 'camp' ? 'The overworld camp (Tab cycles maps)' : `Floor ${m.depth} of ${g.floorCount}: ${BIOMES_RIFT[m.biome] ? BIOMES_RIFT[m.biome].name : ''}`;
      return `<button data-map="${m.id}" class="${m.id === this.mapId ? 'on' : ''}${fight(m) ? ' fight' : ''}" title="${esc(tip)}">${label}<i>${count(m)}</i></button>`;
    }).join('');
  }

  /** Hold position for everyone selected (F): on if any of them is free to roam, off otherwise. */
  toggleHold(ids = [...this.squad]) {
    const people = ids.map(id => this.game.colonists.find(c => c.id === id)).filter(Boolean);
    if (!people.length) { this.flash('Select people first, then F to hold position.', 'info'); return; }
    const on = people.some(c => !c.hold);
    for (const c of people) { c.hold = on; if (on && c.task && c.task.kind !== 'fight' && c.task.kind !== 'sleep') { c.task = null; c.path = null; } }
    this.flash(on ? `${people.length === 1 ? people[0].name.short + ' holds' : people.length + ' hold'} position` : 'Free to move again', on ? 'good' : 'info');
    this.sigs.colbar = null; this.sigs.drawer = null; this.sigs.insp = null;
  }

  /**
   * The fight log: the last lines of whatever fight is on the map on screen,
   * blow by blow, beneath the resource panel. It fades out a while after the
   * fighting stops.
   */
  renderFightLog() {
    const box = $('#fightlog');
    if (!box) return;
    const m = this.mv._m, feed = m.fightLog || [];
    const last = feed.length ? feed[feed.length - 1].tick : -1e9;
    const live = feed.length && this.game.tick - last < 240;
    const sig = live ? `${m.id}:${feed.length}:${last}` : '';
    if (this.sigs.fightlog === sig) return;
    this.sigs.fightlog = sig;
    box.classList.toggle('hidden', !live);
    if (!live) return;
    const res = $('#res');
    if (res && res.offsetHeight && document.documentElement && document.documentElement.style) document.documentElement.style.setProperty('--res-h', res.offsetHeight + 'px');
    box.innerHTML = `<div class="fl-h">⚔️ ${m.kind === 'floor' ? 'Floor ' + m.depth : 'Camp'} — the fight</div>` + feed.slice(-8).map(l =>
      `<div class="fl-l ${l.side === 'party' ? 'ours' : 'theirs'} fl-${esc(l.t || '')}">${esc(l.text)}</div>`).join('');
  }

  /** Step to the next map in the switcher (Tab). */
  cycleMap(dir = 1) {
    const g = this.game, here = (m) => g.colonists.some(c => !c.dead && (c.mapId || 0) === m.id);
    const maps = [g.maps[0], ...g.floors.filter(m => here(m) || m.id === this.mapId)];
    if (maps.length < 2) return;
    const k = maps.findIndex(m => m.id === this.mapId);
    this.viewMap(maps[(k + dir + maps.length) % maps.length].id);
  }

  /** Everything that wants the player, ranked. Shared by the alert column and the dashboard. */
  alerts() {
    const g = this.game;
    const home = g.colonists.filter(c => !c.away);
    const ids = (arr) => arr.map(c => c.id);
    const hungry = home.filter(c => c.needs.hunger < 0.3);
    const breaking = home.filter(c => c.mood < 30);
    const hurt = home.filter(c => c.hp < c.maxHp * 0.6);
    const tired = home.filter(c => c.needs.rest < 0.25 && c.state !== 'sleeping');
    const idle = home.filter(c => labourOf(c) === 'off' && c.task && c.task.kind === 'wander');
    const fd = this.foodDays();
    const over = ['wood', 'stone', 'food', 'iron'].filter(k => (g.resources[k] || 0) > g.storageCap);
    const step = this.mapId === 0 ? currentStep(g) : null;
    return [
      step && { icon: step.icon, text: stepText(g, step), kind: 'tut', drawer: step.drawer, step },
      g.raiders.some(r => r.hp > 0) && { icon: '👹', text: `Rift spawn! ${g.raiders.filter(r => r.hp > 0).length} in the camp`, kind: 'critical' },
      home.some(c => c.tree && pointsFree(c) > 0) && { icon: '⭐', text: `Skill points to spend: ${home.filter(c => c.tree && pointsFree(c) > 0).map(c => c.name.short).join(', ')}`, kind: 'good', targets: ids(home.filter(c => c.tree && pointsFree(c) > 0)), tab: 'class' },
      !g.isNight && g.hoursToDusk <= 3 && { icon: '🌙', text: `Dusk in ${g.hoursToDusk}h — ~${g.waveForecast.size} spawn tonight`, kind: g.hoursToDusk <= 1 ? 'bad' : 'warn', drawer: 'party' },
      g.isNight && g.colonists.some(c => c.mapId) && { icon: '🌀', text: `${g.colonists.filter(c => c.mapId).length} still down in the Rift after dark`, kind: 'bad', drawer: 'party' },
      ...g.floors.filter(m => m.raiders.some(r => r.hp > 0 && r.awake) && g.colonists.some(c => c.mapId === m.id)).map(m => ({ icon: '⚔️', text: `Fighting on floor ${m.depth}`, kind: 'critical', map: m.id })),
      g.canEnterRift && g.hour < 14 && { icon: '🌀', text: 'The Rift is quiet — send a party in', kind: 'warn', drawer: 'party' },
      fd < 2.5 && { icon: '🍖', text: `Low food (${fd.toFixed(1)} days)`, kind: fd < 1 ? 'critical' : 'bad', drawer: 'farm' },
      hungry.length && { icon: '🍽️', text: `Starving: ${hungry.map(c => c.name.short).slice(0, 2).join(', ')}${hungry.length > 2 ? ` +${hungry.length - 2}` : ''}`, kind: 'critical', targets: ids(hungry) },
      breaking.length && { icon: '😣', text: `Major break risk: ${breaking.map(c => c.name.short).slice(0, 2).join(', ')}${breaking.length > 2 ? ` +${breaking.length - 2}` : ''}`, kind: 'critical', targets: ids(breaking) },
      hurt.length && { icon: '🩸', text: `Badly hurt: ${hurt.length}`, kind: 'bad', targets: ids(hurt) },
      tired.length && { icon: '😴', text: `Exhausted: ${tired.length}`, kind: 'warn', targets: ids(tired) },
      idle.length > 1 && { icon: '🚶', text: `Idle colonists: ${idle.length}`, kind: 'warn', targets: ids(idle) },
      g.pendingArrivals.length && { icon: '🚪', text: `${g.pendingArrivals.length} waiting at the gate`, kind: 'warn', drawer: 'trade' },
      g.caravan && { icon: '🐫', text: 'Caravan in town — sell spare goods for gold', kind: 'decision', drawer: 'trade' },
      !g.research.current && { icon: '🔬', text: 'Need research project', kind: 'warn', drawer: 'research' },
      over.length && { icon: '📦', text: `Storage full: ${over.map(k => `${RESOURCE_ICON[k] || ''} ${RESOURCES[k].name}`).join(', ')}`, kind: 'bad', arch: 'logistics' },
    ].filter(Boolean);
  }

  renderAlerts() {
    // Worst first, then the decisions that make gold, power or progress, then
    // the rest. Three show; the others fold under "+N more" so a busy evening
    // doesn't bury the one thing that matters under nine that don't.
    const RANK = { tut: -1, critical: 0, decision: 1, bad: 2, good: 3, warn: 4 };
    const all = this.alerts().map((a, i) => [a, i]).sort((x, y) => (RANK[x[0].kind] ?? 5) - (RANK[y[0].kind] ?? 5) || x[1] - y[1]).map(([a]) => a);
    const cap = this.alertsOpen ? all.length : 3 + (all[0] && all[0].kind === 'tut' ? 1 : 0);
    const list = all.slice(0, cap);
    const more = all.length - list.length;
    const sig = all.map(a => a.text).join('|') + '|' + cap;
    if (this.sigs.alerts === sig) return;
    this.sigs.alerts = sig;
    this.alertList = list;
    // Icon first, then the words, then a chevron that promises the click does
    // something; the stripe down the left edge is the severity.
    $('#alerts').innerHTML = list.map((a, i) => a.kind === 'tut' ? this.tutorialCardHtml(a, i) :
      `<div class="al ${a.kind}" data-i="${i}" title="${a.targets ? 'Click to select them' : a.drawer ? 'Click to open' : a.arch ? 'Click to build' : ''}">
        <span class="ai">${a.icon}</span><span class="at">${esc(a.text)}</span><span class="ag">›</span></div>`).join('')
      + (more > 0 ? `<div class="al more" data-more="1"><span class="at">+${more} more</span><span class="ag">▾</span></div>`
        : this.alertsOpen && all.length > 3 ? '<div class="al more" data-more="1"><span class="at">Show fewer</span><span class="ag">▴</span></div>' : '');
  }

  paintToasts() {
    const box = $('#toasts');
    box.innerHTML = '';
    const icon = { good: '✅', warn: '⚠️', danger: '🔥', death: '💀', major: '📣', enemy: '⚔️' };
    for (const t of this.toasts.slice(-5)) {
      box.appendChild(el('div', 'toast ' + t.kind,
        `<span class="ti">${icon[t.kind] || 'ℹ️'}</span><span>${esc(t.text)}</span>`));
    }
  }

  /** A one-off message in the toast stack. */
  toast(text, kind = 'info') {
    this.toasts.push({ text, kind, until: performance.now() + 4500 });
    this.paintToasts();
  }

  pumpToasts() {
    const g = this.game;
    let dirty = false;
    if (g.logs.length > this.lastLogLen) {
      const fresh = g.logs.slice(Math.max(this.lastLogLen, g.logs.length - 6));
      for (const l of fresh) {
        if (['info', 'skill'].includes(l.kind)) continue;
        this.toasts.push({ text: l.text, kind: l.kind, until: performance.now() + 6500 });
        dirty = true;
      }
      this.lastLogLen = g.logs.length;
    }
    const now = performance.now();
    const before = this.toasts.length;
    this.toasts = this.toasts.filter(t => t.until > now);
    if (dirty || this.toasts.length !== before) this.paintToasts();
  }

  // RimWorld's main-tab bar: a flat row of equal buttons along the bottom edge.
  // The fifth field is the key that opens the tab, shown on the tab itself.
  static RAIL = [
    ['architect', 'Build', 'Buildings, floors and furniture (B)', '🔨', 'B'],
    ['people', 'People', 'Who does which job, and everyone at a glance (W)', '🧑‍🤝‍🧑', 'W'],
    ['colony', 'Colony', 'How the hold is doing: stocks, fields and animals, the workshop, the chronicle (C)', '🏕️', 'C'],
    ['research', 'Research', 'The tech tree and the bestiary (R)', '🔬', 'R'],
    ['party', 'Rift', 'The Rift: its lair, the floors, and the next party (T)', '🌀', 'T'],
    ['region', 'World', 'The region map, the market and caravans, and journeys (N)', '🗺️', 'N'],
  ];
  // Six main tabs; related panels are sub-tabs of one window rather than
  // separate tabs of their own. The first entry is the group's key and default.
  // Each sub-tab holds one kind of thing: the market only trades, the workshop
  // only makes, the tree only researches.
  static GROUPS = {
    people: [['people', 'Duties'], ['roster', 'Roster'], ['classes', 'Classes']],
    colony: [['colony', 'Overview'], ['farm', 'Fields & Animals'], ['workshop', 'Workshop'], ['log', 'Chronicle']],
    research: [['research', 'Tech tree'], ['bestiary', 'Bestiary']],
    party: [['party', 'Party']],
    region: [['region', 'Map'], ['trade', 'Market'], ['services', 'Services']],
  };
  static groupOf(drawer) {
    for (const k in UI.GROUPS) if (UI.GROUPS[k].some(([d]) => d === drawer)) return k;
    return drawer;
  }


  renderRail() {
    const g = this.game;
    const defs = UI.RAIL;
    const rail = $('#rail');
    if (rail.childElementCount !== defs.length) {
      rail.innerHTML = defs.map(([k, label, t, ic, key]) =>
        `<button class="mt" ${k === 'architect' ? 'data-act="architect"' : `data-drawer="${k}"`} title="${t}">
           <span class="ri">${ic}</span><span class="rl">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`).join('');
    }
    const archOpen = !$('#buildpick').classList.contains('hidden');
    for (const b of rail.children) {
      if (b.dataset.act === 'architect') { b.classList.toggle('on', archOpen); continue; }
      b.classList.toggle('on', !!this.drawer && UI.groupOf(this.drawer) === b.dataset.drawer);
      const k = b.dataset.drawer;
      const urgent = this.railUrgent(k);
      const count = k === 'region' ? g.pendingArrivals.length + (g.caravan ? 1 : 0)
        : k === 'party' ? g.colonists.filter(c => c.mapId).length
          : k === 'research' ? (g.research.current ? 0 : 1)
            : k === 'people' ? urgent
              : 0;
      // A ring says a decision is waiting in there; gold dots count them, blue is only news.
      b.classList.toggle('urgent', urgent > 0 && UI.groupOf(this.drawer) !== k);
      let dot = b.querySelector('.dot');
      if (count > 0) {
        if (!dot) { dot = el('span', 'dot'); b.appendChild(dot); }
        dot.textContent = k === 'research' ? '!' : count > 9 ? '9+' : String(count);
        dot.className = 'dot' + (k === 'party' && !urgent ? ' info' : '');
      } else if (dot) dot.remove();
    }
  }

  /** How many decisions wait behind a main tab — the ones that cost something to ignore. */
  railUrgent(k) {
    const g = this.game;
    if (k === 'people') {
      const home = g.colonists.filter(c => !c.dead && !c.away);
      return home.filter(c => (c.tree && pointsFree(c) > 0) || (!c.tree && !c.training && this.classOptions(c).some(o => o.ready))).length;
    }
    if (k === 'region') return g.caravan ? 1 : 0;
    if (k === 'research') return g.research.current ? 0 : 1;
    if (k === 'party') {
      const m = g.floorAt(g.floorCount);
      return g.canEnterRift && !(m && m.lairCleared) && !g.colonists.some(c => c.mapId) && g.hour < 14 ? 1 : 0;
    }
    return 0;
  }

  toggleHelp() {
    const h = $('#help');
    if (!h.classList.contains('hidden')) { this.hide('#help'); return; }
    h.innerHTML = this.helpHtml();
    this.show('#help');
    const close = () => this.hide('#help');
    h.onclick = (e) => {
      if (e.target.dataset && e.target.dataset.tutReplay) { restartTutorialState(this.game); this.sigs.alerts = null; close(); this.flash('Tutorial restarted — see the top of the alerts.', 'good'); return; }
      if (e.target === h || e.target.dataset.close) close();
    };
  }

  helpHtml() {
    const row = (keys, what) => `<div class="hk"><span class="kk">${keys}</span><span>${what}</span></div>`;
    const leg = (icon, what) => `<div class="lg"><span class="li">${icon}</span><span>${what}</span></div>`;
    return `<div class="mbox">
      <h2>Controls & legend</h2>
      <div class="sub">Everything the colony answers to. Press <b>?</b> any time. <button class="act" data-tut-replay="1">🧭 Replay the tutorial</button></div>
      <div class="hcols">
        <div>
          <div class="sect">Selecting</div>
          ${row('right-drag', 'Band-select every denizen in the box')}
          ${row('shift + right-drag', 'Add to the band selection')}
          ${row('shift-click', 'Add or remove one person from the selection')}
          ${row('⌘/ctrl A', 'Select everyone at home')}
          ${row('click', 'Select one of your people for orders (yellow outline) — or inspect anything else')}
          ${row('hover', 'A quick card for whatever is under the pointer; 💬 turns these off')}
          ${row('G', 'Squad tool — band-select with a left-drag too, for a touch screen')}
          <div class="sect">Camera</div>
          ${row('left-drag', 'Pan, while the Select tool is active')}
          ${row('middle-drag', 'Pan')}
          ${row('space-drag', 'Pan (tap space alone to pause)')}
          ${row('arrows', 'Pan by steps')}
          ${row('scroll / pinch', 'Zoom')}
          <div class="sect">Orders (keys only)</div>
          ${row('right-click', 'Send the selection there. On rock, a tree, a chest or a blueprint they surround it and work it together — each extra hand adds speed. On an enemy they close in to fight')}
          ${row('right-click enemy', 'Attack it: the selection closes in and fights it until it falls (a plain move order pulls them back out)')}
          ${row('right-click downed', 'The nearest of the selection picks them up and carries them to a bed — out of the Rift first if need be')}
          ${row('Esc (nothing open)', 'The pause menu: save, options, controls, quit to title')}
          ${row('F', 'Hold position: the selection stays put and fights only what comes into reach')}
          ${row('right-click gate / stairs', 'Into the Rift, deeper, or back up. Packs are emptied into the stores at the top')}
          ${row('Tab', 'Hop between the camp and each Rift floor anyone is on')}
          ${row('M / H / X', 'Mine · Harvest · Cancel, then left-drag over the area')}
          ${row('B', 'Build window')}
          ${row('G', 'Squad tool: left-drag a box to select people')}
          ${row('1 – 4', 'Speed')}
          ${row('space', 'Pause')}
          ${row('O', 'Cycle the soil and water overlays')}
          ${row('W / C / R / T / N', 'People · Colony · Research · Rift · World windows')}
          ${row('Esc', 'Drop the tool and the selection')}
        </div>
        <div>
          <div class="sect">Who's who — the outline says whose side</div>
          ${leg('<i class="ring" style="--r:#46b4ff"></i>', 'Blue: your people.')}
          ${leg('<i class="ring" style="--r:#ff3d3d"></i>', 'Red: hostile — Rift spawn, raiders, dangerous beasts.')}
          ${leg('<i class="ring" style="--r:#ffd84a"></i>', 'Gold: traders and the peddler. Click them to trade.')}
          ${leg('<i class="ring" style="--r:#6ee07a"></i>', 'Green: your livestock and war beasts.')}
          ${leg('<i class="ring" style="--r:#e9e4d6"></i>', 'Pale: wild animals that will leave you alone. Tameable.')}
          ${leg('<i class="ring" style="--r:#ffb23e"></i>', 'Amber: one of yours whose loyalty is slipping.')}
          ${leg('🔴', 'Corner pip: mood. Green content, amber strained, red breaking.')}
          <div class="sect">Tiles worth walking to</div>
          ${leg('🪙💎🔮⚙️', 'Seams in the rock — gold, gems, arcane, iron. They carry a halo.')}
          ${leg('🌀', 'The Rift Gate: violet by day, red when it opens at night. Hover it for tonight’s wave; click it to send your party in.')}
          ${leg('📚', 'Landmark buildings sit on a lit gold plate: Library, Smithy, Infirmary, Shrine, Tavern, Barn, Watchpost, Reliquary.')}
          ${leg('🌾', 'A field. The inner square is growth; a gold outline means ready to cut.')}
          ${leg('🔶', 'A diamond is loose cargo waiting to be hauled.')}
          <div class="sect">Day and night</div>
          <div class="mini">By day the Rift is quiet: send a party through it from the Rift tab. At dusk (21:00) it opens and a wave of spawn walks on the camp; at dawn (06:00) the survivors crawl back in and the interior reshapes. Every ${RIFT_DAYS_PER_LEVEL} days it deepens a level — from rank E, all the way up to SSS.</div>
          <div class="sect">Hover anything</div>
          <div class="mini">Rest the pointer on a colonist, animal, building, ore seam, resource, portrait, tech, notice or chart mark to see its stats. On the map the inspector appears after a moment and follows the pointer.</div>
          <div class="sect">Lore</div>
          <div class="mini">Click a ready tech to study it. Click a locked one to queue it along with everything it needs; right-click removes it from the queue.</div>
        </div>
      </div>
      <div style="margin-top:12px"><button class="act primary" data-close="1">Close</button></div>
    </div>`;
  }

  // ------------------------------------------------------------- drawers --
  static DRAWER_TITLE = {
    colony: 'Stronghold', people: 'Duties', region: 'World', party: 'Party',
    farm: 'Animals & Fields', research: 'Lore', trade: 'Market', services: 'Services', log: 'Chronicle',
    workshop: 'Workshop', bestiary: 'Bestiary',
  };

  renderDrawer() {
    this.renderDrawerBody();
    this.placeInspector();
  }

  /** Jump to another window or sub-tab; the header cards' buttons use this. */
  openDrawer(d) {
    this.drawer = d; this.sigs.drawer = null;
    this.hide('#buildpick');
    this.renderRail(); this.renderDrawer();
  }

  /** The People windows' shared header: who is home, who is out, who needs you. */
  peopleCard(body) {
    const g = this.game;
    const home = g.colonists.filter(c => !c.away);
    const idle = home.filter(c => labourOf(c) === 'off' && c.task && c.task.kind === 'wander').length;
    const pts = home.filter(c => c.tree && pointsFree(c) > 0).length;
    const avgMood = home.length ? home.reduce((s, c) => s + c.mood, 0) / home.length : 0;
    body.appendChild(profileCard({
      slim: true, tone: '#8fbde6', avatar: '🧑‍🤝‍🧑', badge: g.colonists.length,
      name: `${g.colonists.length} denizen${g.colonists.length === 1 ? '' : 's'}`,
      sub: 'Click a name to inspect them; shift-click to add them to the selection.',
      acts: [
        { label: this.drawer === 'roster' ? '🛠️ Duties' : '📋 Roster', text: true, onClick: () => this.openDrawer(this.drawer === 'roster' ? 'people' : 'roster') },
      ],
      stats: [
        { label: 'At home', value: home.length },
        { label: 'In the Rift', value: g.colonists.length - home.length, color: g.colonists.length - home.length ? 'var(--info)' : '' },
        { label: 'Idle', value: idle, color: idle > 1 ? 'var(--warn)' : '' },
        { label: 'Skill points', value: pts, color: pts ? 'var(--hi)' : '', tip: 'Colonists with points to spend in their class tree' },
        { label: 'Mood', value: Math.round(avgMood), color: moodStatus(avgMood).color },
      ],
    }));
  }

  renderDrawerBody() {
    const d = $('#drawer');
    if (!this.drawer) { d.classList.add('hidden'); return; }
    d.classList.remove('hidden');
    d.classList.toggle('wide', ['people', 'roster', 'classes', 'trade', 'services', 'party', 'farm', 'colony', 'log', 'workshop', 'bestiary'].includes(this.drawer));
    d.classList.toggle('xwide', ['research', 'region'].includes(this.drawer));
    const body = $('#drawer .body');
    const t = $('#drawer .d-title');
    const grp = UI.groupOf(this.drawer);
    if (!this.lastSub) this.lastSub = {};
    this.lastSub[grp] = this.drawer;
    const rail = UI.RAIL.find(r => r[0] === grp);
    const title = rail ? rail[1] : (UI.DRAWER_TITLE[this.drawer] || 'Panel');
    const subs = UI.GROUPS[grp] || [];
    const dt = $('#drawer .dtabs');
    if (dt && dt.classList) {
      const html = subs.length > 1 ? subs.map(([k, n]) => `<button data-sub="${k}" class="${k === this.drawer ? 'on' : ''}">${n}</button>`).join('') : '';
      if (dt.innerHTML !== html) dt.innerHTML = html;
      dt.classList.toggle('hidden', subs.length < 2);
      dt.onclick = (e) => { const b = e.target.closest && e.target.closest('button'); if (!b) return; this.drawer = b.dataset.sub; this.sigs.drawer = null; this.renderRail(); this.renderDrawer(); };
    }
    // The window wears its tab's icon, so it is plain which tab it came from.
    if (t) t.innerHTML = `${rail ? `<span class="ri">${rail[3]}</span>` : ''}${esc(title)}`;
    else $('#drawer h3').firstChild.textContent = title;
    // The dashboard is chart-heavy and its data only moves every two game hours,
    // so rebuilding it five times a second would only fight the reader's cursor.
    const sig = this.drawerSig();
    if (sig != null && this.sigs.drawer === sig) return;
    this.sigs.drawer = sig;
    const scroll = body.scrollTop;
    body.innerHTML = '';
    body.onclick = null;   // the Workshop installs a delegate; no other tab wants it
    if (this.drawer === 'colony') this.drawColony(body);
    else if (this.drawer === 'people') this.drawPeople(body);
    else if (this.drawer === 'region') this.drawRegion(body);
    else if (this.drawer === 'farm') this.drawFarm(body);
    else if (this.drawer === 'party') this.drawParty(body);
    else if (this.drawer === 'research') this.drawResearch(body);
    else if (this.drawer === 'bestiary') this.drawBestiary(body);
    else if (this.drawer === 'trade') this.drawTrade(body);
    else if (this.drawer === 'services') this.drawServices(body);
    else if (this.drawer === 'workshop') this.drawWorkshopTab(body);
    else if (this.drawer === 'log') this.drawLog(body);
    else if (this.drawer === 'roster') this.drawRoster(body);
    else if (this.drawer === 'classes') this.drawClasses(body);
    body.scrollTop = scroll;
  }

  /** A cheap fingerprint of what a drawer is showing; null means "always redraw". */
  drawerSig() {
    const g = this.game;
    if (this.drawer === 'colony') {
      return `${this.drawer}|${g.history.tick.length}|${g.history.nextTick}|${g.colonists.map(c => labourOf(c)).join('')}|${this.squad.size}`;
    }
    if (this.drawer === 'people') {
      return 'people|' + g.colonists.map(c => `${c.id}${Object.values(c.priorities).join('')}${Math.round(c.mood / 5)}${this.squad.has(c.id) ? 's' : ''}`).join('|') + '|' + g.graveyard.length;
    }
    if (this.drawer === 'classes') {
      return 'classes|' + g.colonists.map(c => `${c.id}${c.klass}${c.level}${c.tree ? pointsFree(c) : ''}${c.training ? Math.floor(c.training.progress / c.training.need * 20) : ''}${c.away ? 'a' : ''}${c.drill || 0}${Object.values(c.attributes).join('')}`).join('|')
        + `|${g.reagents.class_tome || 0}|${Object.keys(SCHOOLS).map(k => g.hasSchool(k) ? 1 : 0).join('')}|${g.unlocked.size}`;
    }
    if (this.drawer === 'region') {
      // The region map is ~400 sites; only rebuild when what it shows has changed.
      let h = 0;
      for (const s of g.overworld.sites) if (s.discovered) h = (h * 31 + (s.hostility ?? 0) + (s.cleared ? 7 : 0) + s.x * 3 + s.y) | 0;
      return `region|${h}|${this.selSite ? this.selSite.id : ''}`;
    }
    return null;
  }

  // --------------------------------------------------------- the dashboard --
  /**
   * One panel that answers "how is the colony doing?" without reading anything
   * else. Order is deliberate: the three readings that can end a run, then the
   * trends behind them, then where the labour is going, then the stores.
   */
  drawColony(body) {
    const g = this.game;
    const h = g.history;
    const home = g.colonists.filter(c => !c.away);
    const xl = (i) => `day ${historyDay(g, i)}`;

    // --- headline: the numbers that decide whether there is a colony tomorrow
    const fd = this.foodDays();
    const ow = g.overworld;
    body.appendChild(profileCard({
      tone: '#e2b84c', avatar: '🌀', badge: g.colonyTier,
      avTip: `Hold tier ${g.colonyTier} — rises with cleared delves, strong delvers and research`,
      acts: [
        { label: '📜', tip: 'Chronicle', onClick: () => this.openDrawer('log') },
        { label: '⚒️', tip: 'Workshop', onClick: () => this.openDrawer('workshop') },
      ],
      name: 'Rift Camp',
      sub: `${g.day - 1} night${g.day === 2 ? '' : 's'} survived outside a rank ${g.riftRank} gate.`,
      meta: [
        ['📍', BIOMES[g.biome].name],
        ['⭐', `<span class="co-tier" data-tipt="Hold tier ${g.colonyTier}">${'★'.repeat(Math.min(7, g.colonyTier))}<s>${'★'.repeat(Math.max(0, 7 - g.colonyTier))}</s></span> tier ${g.colonyTier}`],
        ['💀', `${g.graveyard.length} buried`],
      ],
      stats: [
        { label: 'Food', value: fd >= 99 ? '99+ d' : fd.toFixed(1) + ' d', color: fd > 6 ? STATUS.good : fd > 2.5 ? STATUS.warn : STATUS.critical, tip: 'Days of eating left at the current headcount' },
        { label: 'Morale', value: Math.round(g.morale), color: moodStatus(g.morale).color, tip: moodStatus(g.morale).name },
        { label: 'People', value: home.length, tip: 'At home now' },
        { label: 'Wealth', value: Math.round(g.wealth), color: 'var(--hi)', tip: 'Everything the hold owns, valued in gold' },
      ],
      foot: [
        { label: '🛠️ Duties', onClick: () => this.openDrawer('people') },
        { label: '🌾 Fields & Animals', onClick: () => this.openDrawer('farm') },
      ],
    }));

    // --- needs: a ranked bar chart, worst first, because that is the reading
    body.appendChild(el('div', 'sect', 'Needs across the hold'));
    const needRows = ['hunger', 'rest', 'joy'].map(nk => {
      const vals = home.map(c => c.needs[nk]);
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      const worst = vals.length ? Math.min(...vals) : 0;
      return {
        name: nk === 'hunger' ? 'Fed' : nk === 'rest' ? 'Stamina' : 'Joy',
        icon: nk === 'hunger' ? '🍽️' : nk === 'rest' ? '⚡' : '🎲',
        value: Math.round(avg * 100), color: levelStatus(avg),
        note: `worst ${Math.round(worst * 100)}%`,
      };
    }).sort((a, b) => a.value - b.value);
    body.appendChild(el('div', '', bars({ rows: needRows, max: 100, fmt: (v) => v + '%' })));

    // --- stores, each against the one ceiling that actually bites
    const cap = g.storageCap;
    body.appendChild(el('div', '', sectHtml('Stores', `ceiling ${cap} each`)));
    const keys = ['food', 'meal', 'wood', 'stone', 'iron', 'cloth', 'herbs', 'gold', 'dust'];
    body.appendChild(el('div', '', keys.map(k => {
      const v = Math.floor(g.resources[k] || 0);
      return kbar(`${RESOURCE_ICON[k]} ${RESOURCES[k].name}`, v, cap, v >= cap ? STATUS.critical : RESOURCES[k].color,
        v >= cap ? `${v} · full` : `${v}`, 'wide');
    }).join('')));
    body.appendChild(el('div', 'hint', 'Each Stockpile adds 60 to the ceiling. Past it, hauled goods are simply lost.'));

    // --- labour: composition of a whole, so a stacked bar with a full legend
    const census = {};
    for (const l of LABOUR) census[l.id] = 0;
    for (const c of g.colonists) census[labourOf(c)]++;
    const segs = LABOUR.filter(l => census[l.id] > 0)
      .map(l => ({ name: l.name, icon: l.icon, color: l.color, value: census[l.id] }));
    body.appendChild(el('div', '', sectHtml('Who is doing what', `${g.colonists.length} people`)));
    body.appendChild(el('div', '', stack({ segments: segs })));
    body.appendChild(el('div', '', legendRow(segs)));
    body.appendChild(el('div', 'hint', 'Right now. Change who does what in People › Duties.'));

    // --- trends: the same readings over the last ten days
    body.appendChild(el('div', '', sectHtml('Last ten days', 'hover a line for the day')));
    body.appendChild(el('div', 'co-sparks', [
      spark({ label: 'Food in store', icon: '🍖', series: h.food, color: '#3987e5', xlabel: xl, zero: true }),
      spark({ label: 'Population', icon: '🧑‍🤝‍🧑', series: h.pop, color: '#199e70', xlabel: xl, zero: true }),
      spark({ label: 'Average mood', icon: '🙂', series: h.mood, color: '#c98500', xlabel: xl }),
      spark({ label: 'Raid pressure', icon: '⚔️', series: h.threat, color: '#d95926', xlabel: xl, fmt: (v) => v.toFixed(1), zero: true }),
      spark({ label: 'Wealth', icon: '🪙', series: h.wealth, color: '#9085e9', xlabel: xl, zero: true }),
    ].join('')));

    // --- the run so far, as one line: it's a scoreboard, not a reading
    const s = g.stats;
    body.appendChild(el('div', 'sect', 'The run so far'));
    body.appendChild(el('div', 'co-run', [
      ['mined', s.mined], ['built', s.built], ['crafted', s.crafted], ['harvests', g.harvests],
      ['delves cleared', s.cleared], ['raids beaten', s.raidsWon],
    ].map(([k, v]) => `<span><b>${v}</b> ${k}</span>`).join('')));
  }

  /** Everyone at a glance: who they are, what they're doing, how they are. */
  /**
   * People › Classes: everyone's class at a glance, and one click to send a
   * peasant to school. The single place the class loop lives, instead of four
   * clicks deep in each colonist's card.
   */
  drawClasses(body) {
    const g = this.game;
    this.peopleCard(body);
    const tomes = g.reagents.class_tome || 0;
    const schools = Object.entries(SCHOOLS).map(([k, S]) => {
      const has = g.hasSchool(k), open = g.unlocked.has(S.building);
      const tech = unlockerOf(S.building);
      return `<span class="kw kw-${has ? 'good' : 'neutral'}" data-tipt="${esc(has ? `${S.name} built — trains ${Object.keys(CLASS_INFO).filter(c => CLASS_INFO[c].school === k).map(c => CLASSES[c].name).join(', ')}.`
        : open ? `Unlocked — build a ${S.name} (Build › Martial).` : `Research ${RESEARCH[tech] ? RESEARCH[tech].name : '?'} to unlock the ${S.name}.`)}"><i>${has ? '🏫' : open ? '🔨' : '🔒'}</i>${esc(S.name)}</span>`;
    }).join('');
    body.appendChild(el('div', 'cls-intro', `<div class="mini">Peasants work but fight poorly. A <b>class</b> gives them a skill tree, abilities and better gear. Classes are taught at schools, or learned in a day from a 📕 Class Tome.</div>
      <div class="ct-row">${schools}${tomes ? `<span class="kw kw-good"><i>📕</i><b>${tomes}</b> Class Tome${tomes > 1 ? 's' : ''}</span>` : ''}</div>`));
    const home = g.colonists.filter(c => !c.dead);
    const peasants = home.filter(c => !c.tree), heroes = home.filter(c => c.tree);
    const rowFor = (c) => {
      let doing;
      if (c.training) doing = `<span class="badge info">📖 becoming a ${esc(CLASSES[c.training.klass].name)} · ${Math.round(c.training.progress / c.training.need * 100)}%</span>`;
      else if (c.tree) {
        const pts = pointsFree(c);
        doing = `${pts ? `<button class="act primary" data-cls-open="${c.id}">★ ${pts} point${pts > 1 ? 's' : ''} to spend</button>` : '<span class="mini">Skill tree up to date</span>'}`;
      } else {
        const ready = this.classOptions(c).filter(o => o.ready);
        if (ready.length) doing = ready.slice(0, 6).map(o => `<button class="ct-tac ready" data-cls-enroll="${c.id}:${o.k}" data-tipt="${esc(o.how)}">${esc(CLASSES[o.k].name)}${o.via === 'tome' ? ' 📕' : ''}</button>`).join('');
        else {
          const dt = drillTarget(c);
          const anyWay = Object.keys(SCHOOLS).some(k => g.hasSchool(k)) || tomes;
          doing = `<span class="mini">${dt ? `${dt.attr.toUpperCase()} ${dt.value}/12 for ${esc(CLASSES[dt.klass].name)} — ${g.world.findBuildings('training').length ? 'drilling at the Training Dummy raises it' : 'a Training Dummy would raise it'}.` : ''}${!anyWay ? ' No school or tome yet.' : ''}</span>`;
        }
      }
      return `<div class="rrow cls-row" data-cls-pick="${c.id}">
        <span class="rpt">${RACE_ICON[c.race] || '🧑'}</span>
        <div class="rwho"><b>${esc(c.name.short)}</b><span>${esc(c.title || CLASSES[c.klass].name)} · lv ${c.level}${c.away ? ' · in the Rift' : ''}</span></div>
        <div class="cls-do">${doing}</div></div>`;
    };
    body.appendChild(el('div', '', sectHtml('Peasants', `${peasants.length}`)));
    body.appendChild(el('div', 'roster', peasants.map(rowFor).join('') || '<div class="mini">Everyone has a class.</div>'));
    body.appendChild(el('div', '', sectHtml('Heroes', `${heroes.length}`)));
    body.appendChild(el('div', 'roster', heroes.map(rowFor).join('')));
    body.onclick = (e) => {
      const en = e.target.closest && e.target.closest('[data-cls-enroll]');
      const op = e.target.closest && e.target.closest('[data-cls-open]');
      const pick = e.target.closest && e.target.closest('[data-cls-pick]');
      if (en) {
        const [id, k] = en.dataset.clsEnroll.split(':');
        const r = g.hasSchool(CLASS_INFO[k].school) ? this.act(g, 'enroll', +id, k) : this.act(g, 'readTome', +id, k);
        if (r) this.toast(r, 'warn'); else this.flash(`Training begins: ${CLASSES[k].name}.`, 'good');
      } else if (op || pick) {
        const id = +(op ? op.dataset.clsOpen : pick.dataset.clsPick);
        this.squad.clear(); this.squad.add(id); this.commitSquad();
        this.tab = 'class'; this.sigs.insp = null; this.renderInspector();
      } else return;
      this.sigs.drawer = null; this.renderDrawer();
    };
  }

  drawRoster(body) {
    const g = this.game;
    const cs = [...g.colonists].sort((a, b) => (a.away - b.away) || a.name.short.localeCompare(b.name.short));
    if (!cs.length) { body.appendChild(el('div', 'mini', 'No one left.')); return; }
    this.peopleCard(body);
    const list = el('div', 'roster');
    for (const c of cs) {
      const m = moodStatus(c.mood);
      const pts = c.tree ? pointsFree(c) : 0;
      const flags = [
        c.away && '<span class="badge info">in the Rift</span>',
        c.injuries.some(i => !i.treated && i.heal > 0) && '<span class="badge bad">wounded</span>',
        c.hostility > 55 && '<span class="badge warn">wavering</span>',
        pts > 0 && `<span class="badge good">★ ${pts} skill pt${pts > 1 ? 's' : ''}</span>`,
      ].filter(Boolean).join('');
      const row = el('div', 'rrow' + (this.squad.has(c.id) ? ' sel' : ''), `
        <span class="rpt">${RACE_ICON[c.race] || '🧑'}</span>
        <div class="rwho"><b>${esc(c.name.short)}</b><span>${RACES[c.race].name} ${c.title || CLASSES[c.klass].name} · lv ${c.level}</span></div>
        <div class="rdo"><span class="rdo-t">${c.away ? '🌀 away in the Rift' : taskIcon(c) + ' ' + esc(c.state) + (c.task ? ' · ' + esc(c.task.kind) : '')}</span>${flags ? `<div class="rflags">${flags}</div>` : ''}</div>
        <div class="rbars">${kbar('Mood', c.mood, 100, m.color, Math.round(c.mood))}${kbar('Health', c.hp, c.maxHp, levelStatus(c.hp / c.maxHp), Math.round(c.hp))}</div>`);
      row.dataset.tip = 'col:' + c.id;
      row.onclick = (e) => {
        const r = row.getBoundingClientRect ? row.getBoundingClientRect() : null;
        if (r) this.clickAt = { x: r.right, y: r.top + r.height / 2 };
        if (e.shiftKey) this.toggleInSquad(c.id);
        else { this.squad.clear(); this.squad.add(c.id); this.commitSquad(); }
        this.sigs.drawer = null; this.renderDrawer();
      };
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  /**
   * RimWorld's Work tab. Rows are colonists, columns are jobs, each cell is a
   * priority: 1 is done first, 4 last, blank never. The cell's shade is how
   * good they are at the job, and a flame marks a passion — so the grid shows
   * both what you have ordered and what you should have ordered.
   */
  drawPeople(body) {
    const g = this.game;
    const cs = g.colonists;
    if (!cs.length) { body.appendChild(el('div', 'mini', 'No one left.')); return; }
    this.peopleCard(body);
    const jobs = Object.keys(cs[0].priorities);
    const jobSkill = { mine: 'mining', chop: 'woodcutting', build: 'construction', haul: 'hauling', farm: 'farming', cook: 'cooking', craft: 'smithing', research: 'research', heal: 'medicine', train: 'melee', pray: 'faith', animals: 'animals' };
    const jobName = { mine: 'Mining', chop: 'Cutting', build: 'Construct', haul: 'Hauling', farm: 'Growing', cook: 'Cooking', craft: 'Crafting', research: 'Lore', heal: 'Doctor', train: 'Training', pray: 'Worship', animals: 'Handling' };
    const jobIcon = { mine: '⛏️', chop: '🪓', build: '🔨', haul: '📦', farm: '🌾', cook: '🍳', craft: '⚒️', research: '🔬', heal: '⚕️', train: '🎯', pray: '🛐', animals: '🐾' };
    const tbl = el('table', 'work');
    tbl.innerHTML = `<thead><tr><th class="nmh">Denizen</th>${jobs.map(j =>
      `<th data-tipt="${jobName[j] || j} — trained by ${SKILLS[jobSkill[j]] ? SKILLS[jobSkill[j]].name : j}"><div>${jobName[j] || j}</div><span class="wk-ji">${jobIcon[j] || ''}</span></th>`).join('')}</tr></thead>`;
    const tb = el('tbody');
    for (const c of cs) {
      const tr = el('tr', this.squad.has(c.id) ? 'sel' : '');
      const m = moodStatus(c.mood);
      const who = el('td', 'who', `<span class="wk-pt">${RACE_ICON[c.race] || '🧑'}</span><span class="wk-nm">${esc(c.name.short)}${c.away ? ' <span class="mini">(away)</span>' : ''}</span>
        <span class="mb" title="Mood ${c.mood}"><i style="width:${c.mood}%;background:${m.color}"></i></span>`);
      who.dataset.tip = 'col:' + c.id;
      who.onclick = (e) => {
        if (e.shiftKey) this.toggleInSquad(c.id);
        else { this.squad.clear(); this.squad.add(c.id); this.commitSquad(); }
        this.sigs.drawer = null; this.renderDrawer();
      };
      tr.appendChild(who);
      for (const j of jobs) {
        const v = c.priorities[j];
        const sk = c.skills[jobSkill[j]] || 0;
        const pas = c.passions[jobSkill[j]];
        const td = el('td');
        const cell = el('div', 'pc ' + (v ? 'p' + (5 - v) : ''),
          `${v ? 5 - v : ''}${pas === 'burning' ? '<span class="fl" title="Burning passion"></span>' : pas === 'minor' ? '<span class="fl minor" title="Interested"></span>' : ''}`);
        cell.style.background = `rgba(255,255,255,${(0.03 + Math.min(20, sk) / 20 * 0.2).toFixed(3)})`;
        cell.title = `${c.name.short} — ${jobName[j] || j}\nSkill ${sk}${pas && pas !== 'none' ? ` (${pas} passion)` : ''}\nPriority: ${v ? 5 - v : 'never'}\nClick: more urgent · right-click: less urgent`;
        const set = (nv) => { this.act(g, 'setPriority', c.id, j, (nv + 5) % 5); this.sigs.drawer = null; this.renderDrawer(); };
        cell.onclick = () => set(v + 1);
        cell.oncontextmenu = (e) => { e.preventDefault(); set(v - 1); };
        td.appendChild(cell);
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    body.appendChild(tbl);
    body.appendChild(el('div', 'hint', '1 is done first, 4 last, blank never. Brighter cells are better-skilled; an ember in the corner is a passion (bright: burning, dim: interested). Select several denizens to set a job for all of them at once.'));
    if (g.graveyard.length) {
      body.appendChild(el('div', '', sectHtml('The dead', g.graveyard.length)));
      for (const d of g.graveyard.slice(-8).reverse()) {
        body.appendChild(el('div', 'mini', `💀 ${esc(d.name.full)} — ${RACES[d.race].name} ${CLASSES[d.klass].name}`));
      }
    }
  }

  // ------------------------------------------------------------- the squad --
  /**
   * What the band-select is for. Aggregates first — a squad is picked to be
   * acted on as one, so the panel leads with the group's shape and the orders
   * that apply to all of them, then lists the individuals underneath.
   */
  inspSquad() {
    const g = this.game;
    const members = [...this.squad].map(id => g.colonists.find(c => c.id === id)).filter(Boolean);
    if (!members.length) { this.closeInspector(); return; }
    if (members.length === 1) { this.sel = { kind: 'colonist', id: members[0].id }; this.inspColonist(members[0]); return; }

    $('#inspector .insp-title').innerHTML = `⬚ ${members.length} selected`;
    $('#inspector .insp-sub').innerHTML =
      `combined power <b>${partyPower(members)}</b> · avg level ${(members.reduce((s, c) => s + c.level, 0) / members.length).toFixed(1)}
       <br><span style="color:var(--dim2)">Shift-click on the map to add or drop one.</span>`;
    this.setTabs([]);
    const b = $('#inspector .insp-body');
    b.innerHTML = '';

    // Where this group's time actually goes.
    const census = {};
    for (const l of LABOUR) census[l.id] = 0;
    for (const c of members) census[labourOf(c)]++;
    const segs = LABOUR.filter(l => census[l.id] > 0)
      .map(l => ({ name: l.name, icon: l.icon, color: l.color, value: census[l.id] }));
    b.appendChild(el('div', 'sect', 'Doing right now'));
    b.appendChild(el('div', '', stack({ segments: segs }) + legendRow(segs)));

    // Group condition: three status states, and the worst of each need.
    const moodSegs = [
      { name: 'Content', icon: '🙂', color: STATUS.good, value: members.filter(c => c.mood > 65).length },
      { name: 'Strained', icon: '😐', color: STATUS.warn, value: members.filter(c => c.mood > 35 && c.mood <= 65).length },
      { name: 'Breaking', icon: '😣', color: STATUS.critical, value: members.filter(c => c.mood <= 35).length },
    ].filter(s => s.value > 0);
    b.appendChild(el('div', 'sect', 'Condition'));
    b.appendChild(el('div', '', stack({ segments: moodSegs, total: members.length }) + legendRow(moodSegs)));
    const needRows = ['hunger', 'rest', 'joy'].map(nk => {
      const vals = members.map(c => c.needs[nk]);
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      return {
        name: nk === 'hunger' ? 'Fed' : nk === 'rest' ? 'Stamina' : 'Joy',
        icon: nk === 'hunger' ? '🍽️' : nk === 'rest' ? '⚡' : '🎲',
        value: Math.round(avg * 100), color: levelStatus(avg), note: `worst ${Math.round(Math.min(...vals) * 100)}%`,
      };
    }).sort((a, b2) => a.value - b2.value);
    b.appendChild(el('div', '', bars({ rows: needRows, max: 100, fmt: (v) => v + '%' })));

    // Skill coverage: a sequential strip of the group's best hand at each job,
    // so you can see what this squad cannot do before you send it anywhere.
    b.appendChild(el('div', '', sectHtml('Best in the group', 'by skill')));
    b.appendChild(el('div', '', heatStrip({
      max: 20,
      cells: SKILL_IDS.map(s => {
        const best = members.reduce((m, c) => Math.max(m, c.skills[s] || 0), 0);
        const who = members.find(c => (c.skills[s] || 0) === best);
        return { name: SKILLS[s].name, short: SKILLS[s].name.slice(0, 3), value: best, note: who ? who.name.short : '' };
      }),
    })));

    // Orders that only make sense for a group.
    b.appendChild(el('div', 'sect', 'Set a priority for all of them'));
    const jobs = Object.keys(members[0].priorities);
    const picker = el('div', 'seg wrap');
    for (const j of jobs) {
      const btn = el('button', this.bulkJob === j ? 'on' : '', `${LABOUR_BY_ID[j] ? LABOUR_BY_ID[j].icon + ' ' : ''}${j}`);
      btn.onclick = () => { this.bulkJob = j; this.sigs.insp = null; this.renderInspector(); };
      picker.appendChild(btn);
    }
    b.appendChild(picker);
    const spread = members.map(c => c.priorities[this.bulkJob]);
    const lab = (v) => v === 0 ? 'never' : String(5 - v);
    b.appendChild(el('div', 'mini', `Currently ${lab(Math.max(...spread))}–${lab(Math.min(...spread))} across the group. 1 is done first.`));
    const row = el('div', 'seg');
    for (const v of [4, 3, 2, 1, 0]) {
      const btn = el('button', 'p' + (v ? 5 - v : 0), v ? `${lab(v)}${v === 4 ? ' · first' : v === 1 ? ' · last' : ''}` : 'Never');
      btn.onclick = () => {
        for (const c of members) this.act(g, 'setPriority', c.id, this.bulkJob, v);
        this.flash(`${this.bulkJob} set to ${lab(v)} for ${members.length} denizens`, 'good');
        this.sigs.insp = null;
        this.renderInspector();
      };
      row.appendChild(btn);
    }
    b.appendChild(row);

    const holding = members.every(c => c.hold);
    const hb = el('button', 'act' + (holding ? ' primary' : ''), holding ? '⚓ Holding position (F)' : '⚓ Hold position (F)');
    hb.onclick = () => this.toggleHold(members.map(c => c.id));
    b.appendChild(hb);
    b.appendChild(el('div', 'sect', 'Send them somewhere'));
    const inCamp = members.filter(c => !c.mapId);
    const down = el('button', 'act primary', `🌀 Into the Rift (${inCamp.length})`);
    down.disabled = !inCamp.length || !g.canEnterRift;
    down.title = g.canEnterRift ? 'They walk to the gate and step through onto floor 1' : 'Nobody goes in until dawn';
    down.onclick = () => { const r = this.act(g, 'launchExpedition', null, inCamp.map(c => c.id)); if (r.ok) this.flash(`${r.ids.length} head for the Rift Gate`, 'good'); };
    b.appendChild(down);
    const below = members.filter(c => c.mapId);
    if (below.length) {
      const up = el('button', 'act', `🏕️ Call back (${below.length})`);
      up.onclick = () => { this.act(g, 'orderTravel', below.map(c => c.id), 'up', true); this.flash(`${below.length} climbing out of the Rift`, 'info'); };
      b.appendChild(up);
    }

    b.appendChild(el('div', '', sectHtml('Members', members.length)));
    for (const c of members) {
      const mood = moodStatus(c.mood);
      const row2 = el('div', 'card');
      row2.innerHTML = `<div class="t"><span class="n">${RACE_ICON[c.race] || '🧑'} ${esc(c.name.short)}</span>
        <span class="m" style="color:${mood.color}">${mood.icon} ${c.mood}</span></div>
        <div class="m">${taskIcon(c)} ${esc(c.task ? c.task.kind : c.state)} · ❤️ ${Math.round(c.hp)}/${c.maxHp} · ⚔️ ${powerOf(c)}</div>`;
      row2.onclick = () => { this.squad.clear(); this.squad.add(c.id); this.commitSquad(); };
      b.appendChild(row2);
    }
    const clear = el('button', 'act', 'Clear selection');
    clear.onclick = () => this.closeInspector();
    b.appendChild(clear);
  }

  /** Shared force-ratio wording, so the board and the squad panel never disagree. */
  verdict(ratio) {
    return ratio > 2.2 ? ['Favourable', 'var(--good)', '✅']
      : ratio > 1.3 ? ['Even odds', 'var(--warn)', '⚖️']
        : ratio > 0.9 ? ['Dangerous', 'var(--bad)', '⚠️']
          : ['Suicidal', 'var(--danger)', '💀'];
  }

  /**
   * The world: a large region map you can hover and click, then every known
   * site sorted into four kinds of place — who you can trade with, who raids
   * you, where you can delve, and what the land offers.
   */
  drawRegion(body) {
    const g = this.game;
    const ow = g.overworld;
    const known = ow.discovered();
    const kindCount = (test) => known.filter(s => s.kind !== 'colony' && test(SITE_KINDS[s.kind])).length;
    body.appendChild(profileCard({
      tone: '#5aa9e6', avatar: '🗺️', slim: true,
      acts: [{ label: '🐫 Caravans', text: true, onClick: () => this.openDrawer('trade') }],
      name: `The region around Rift Camp`,
      sub: `${BIOMES[g.biome].name}${ow.climate ? ` · ${WORLD_SHAPES[ow.climate.shape] || ''}` : ''} · the Rift is the only living dungeon for leagues. Click a place on the map to inspect it.`,
      extra: `<div class="wd-exp"><u><i style="width:${Math.round(known.length / ow.sites.length * 100)}%"></i></u> ${known.length}/${ow.sites.length} sites charted</div>`,
      stats: [
        { label: 'Charted', value: `${known.length}<small>/${ow.sites.length}</small>` },
        { label: 'Settlements', value: kindCount(K => K.settle && K !== SITE_KINDS.colony) },
        { label: 'Hostile', value: kindCount(K => K.hostileSite), color: 'var(--bad)' },
        { label: 'Resources', value: kindCount(K => K.node) },
        { label: 'Worth a trip', value: known.filter(st => siteErrand(st)).length, color: 'var(--hi)', tip: 'Sites marked ! — resources to gather, ruins to search, camps to clear' },
      ],
    }));
    const frame = el('div', 'wd-map');
    const cv = el('canvas');
    // Match the map's own proportions so no cell is wasted on letterboxing.
    cv.width = 860; cv.height = Math.round(860 * ow.h / ow.w);
    frame.appendChild(cv);
    body.appendChild(frame);
    try { drawOverworld(cv, g, { selected: this.selSite, atlas: this.renderer.atlas }); } catch (e) { console.error('world map', e); }
    const hitAt = (e) => {
      const r = cv.getBoundingClientRect();
      return overworldHit(cv, g, (e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height));
    };
    cv.onmousemove = (e) => {
      const hit = hitAt(e);
      cv.style.cursor = hit ? 'var(--cur-hand)' : '';
      if (hit) { cv.setAttribute('data-tip', 'site:' + hit.id); this.tipEl = cv; this.tipSrc = 'dom'; this.mouse = { x: e.clientX, y: e.clientY }; this.renderTip(); }
      else if (this.tipEl === cv) this.hideTip();
    };
    cv.onclick = (e) => {
      const hit = hitAt(e);
      if (hit) { this.selSite = hit; this.sel = { kind: 'site', ref: hit }; this.sigs.insp = null; this.renderInspector(); this.renderDrawer(); }
    };
    const groups = [
      ['🏘️', 'Settlements', (K) => K.settle && K !== SITE_KINDS.colony],
      ['⚔️', 'Hostile', (K) => K.hostileSite],
      ['🪨', 'Resources', (K) => K.node],
      ['🏚️', 'Ruins & shrines', (K) => K.delve || K.shrine],
      ['🏰', 'Landmarks', (K) => K.landmark],
    ];
    const cols = el('div', 'wd-groups');
    for (const [ic, name, test] of groups) {
      const sites = known.filter(s => s.kind !== 'colony' && test(SITE_KINDS[s.kind])).sort((a, b) => a.dist - b.dist);
      const col = el('div', 'wd-group');
      col.appendChild(el('div', 'wd-gh', `${ic} ${name} <span>${sites.length}</span>`));
      if (!sites.length) col.appendChild(el('div', 'mini', 'None charted yet.'));
      for (const st of sites.slice(0, 10)) {
        const h = st.hostility != null ? dispositionOf(st.hostility) : null;
        const chip = el('div', 'wd-site' + (this.selSite === st ? ' on' : '') + (st.cleared ? ' cleared' : ''));
        chip.dataset.tip = 'site:' + st.id;
        const rw = siteErrand(st);
        chip.innerHTML = `<span class="wd-si">${SITE_ICON[st.kind] || '📍'}</span><span class="wd-sn">${esc(st.name)}${rw ? ' <b class="wd-rw" title="Something to go and get: ' + ERRANDS[rw].name + '">!</b>' : ''}</span>
          ${h ? `<i style="background:${h.color}"></i>` : ''}<span class="wd-sd">${Math.round(st.dist)}</span>`;
        chip.onclick = () => { this.selSite = st; this.sel = { kind: 'site', ref: st }; this.sigs.insp = null; this.renderInspector(); this.renderDrawer(); };
        col.appendChild(chip);
      }
      cols.appendChild(col);
    }
    body.appendChild(cols);
    body.appendChild(el('div', 'hint', 'Places marked <b class="wd-rw">!</b> have something to go and get: resources to gather, ruins to search, camps to clear. Click one, select who goes on the colonist bar, and send them from its card. Cartography charts more at every dawn.'));
  }

  /**
   * Fields and herds. The season card says what the weather is doing to both;
   * each field is a plot tile whose ring fills as the crop grows; each animal
   * is a tile in the pen; wildlife shows what could be tamed and how likely.
   */
  drawFarm(body) {
    const g = this.game;
    const season = g.seasonDef;
    const fields = g.world.findBuildings().filter(b => BUILDINGS[b.b.id].job === 'farm');
    const ready = fields.filter(f => (f.b.growth || 0) >= 1).length;
    const growing = fields.filter(f => f.b.planted && (f.b.growth || 0) < 1).length;
    body.appendChild(profileCard({
      tone: '#7cc66a', avatar: SEASON_ICON[g.season], badge: g.dayOfSeason,
      avTip: `Day ${g.dayOfSeason} of 15 in ${g.season}`,
      name: g.season,
      sub: `Day ${g.dayOfSeason} of 15 · year ${g.year}. The season sets how fast crops grow and how well herds graze.`,
      meta: [['📍', BIOMES[g.biome].name]],
      extra: `<div class="fm-mults">
          <div data-tipt="Crops grow at ${pct(season.growth)} of their normal speed this season"><span>🌱 Growth</span><u><i style="width:${Math.min(100, season.growth / 1.3 * 100)}%;background:${levelStatus(season.growth)}"></i></u><b>${pct(season.growth)}</b></div>
          <div data-tipt="Grazing gives ${pct(season.forage)} of its normal food this season"><span>🐐 Grazing</span><u><i style="width:${Math.min(100, season.forage / 1.3 * 100)}%;background:${levelStatus(season.forage)}"></i></u><b>${pct(season.forage)}</b></div>
        </div>`,
      stats: [
        { label: 'Fields', value: fields.length },
        { label: 'Ready', value: ready, color: ready ? 'var(--hi)' : '' },
        { label: 'Herd', value: `${g.livestock.length}<small>/${g.herdCap}</small>` },
        { label: 'Wildlife', value: g.wildlife.length },
      ],
    }));

    // --- fields as plot tiles
    body.appendChild(el('div', '', sectHtml('Fields', `${fields.length} plots · <b style="color:var(--hi)">${ready} ready</b> · ${growing} growing`)));
    if (!fields.length) body.appendChild(el('div', 'mini', 'No fields yet. Build → 🌾 Farm → Field or Farm Plot.'));
    const plots = el('div', 'fm-plots');
    for (const f of fields.slice(0, 60)) {
      const b = f.b;
      const crop = CROPS[b.crop];
      const gr = Math.min(1, b.growth || 0);
      const failing = !b.planted && b.failing > 600;
      const st = !b.planted ? (failing ? 'fail' : 'fallow') : gr >= 1 ? 'ready' : 'grow';
      const t = el('div', 'fm-plot ' + st);
      t.dataset.tip = `tile:${f.x},${f.y}`;
      t.style.cssText = '--g:' + Math.round(gr * 360) + 'deg';
      t.innerHTML = `<span>${b.planted && crop ? CROP_ICON[b.crop] || '🌱' : failing ? '⚠️' : '·'}</span>`;
      t.onclick = () => { this.squad.clear(); this.sel = { kind: 'tile', x: f.x, y: f.y }; this.renderer.selection = this.sel; this.renderer.camX = f.x; this.renderer.camY = f.y; this.sigs.insp = null; this.renderInspector(); };
      plots.appendChild(t);
    }
    if (fields.length) body.appendChild(plots);

    // --- the pen
    const herd = g.livestock.slice().sort((a, b2) => a.species.localeCompare(b2.species) || b2.age - a.age);
    body.appendChild(el('div', '', sectHtml('Herd', `${g.livestock.length} of ${g.herdCap} head`)));
    if (!g.herdCap) body.appendChild(el('div', 'mini', 'Build a 🐾 Pasture Post to keep animals (needs Ranching).'));
    else body.appendChild(el('div', 'fm-cap', `<u>${Array.from({ length: g.herdCap }, (_, i) => `<i class="${i < g.livestock.length ? 'on' : ''}"></i>`).join('')}</u>
      ${g.livestock.length >= g.herdCap ? '<span style="color:var(--warn)">Full — a 🏚️ Barn holds 8 more</span>' : ''}`));
    const pen = el('div', 'fm-pen');
    for (const b of herd) {
      const A = ANIMALS[b.species];
      const t = el('div', 'fm-beast' + (this.sel && this.sel.kind === 'beast' && this.sel.id === b.id ? ' on' : ''));
      t.dataset.tip = 'beast:' + b.id;
      t.innerHTML = `<div class="fm-bp" style="background:${A.color}33;border-color:${A.color}88">${ANIMAL_ICON[b.species] || '🐾'}
          <span class="fm-badges">${b.readyProduct ? '<i title="product ready">✨</i>' : ''}${b.handler ? '<i title="follows a handler">🦮</i>' : ''}${b.markedButcher ? '<i>🔪</i>' : ''}${b.pregnant > 0 ? '<i>🤰</i>' : ''}</span></div>
        <div class="fm-bn">${esc(b.name)} <span>${b.sex === 'f' ? '♀' : '♂'}</span></div>
        <u><i style="width:${Math.round(b.hunger * 100)}%;background:${levelStatus(b.hunger)}"></i></u>`;
      t.onclick = () => { this.squad.clear(); this.sel = { kind: 'beast', id: b.id, ref: b }; this.renderer.selection = this.sel; this.renderer.camX = b.x; this.renderer.camY = b.y; this.sigs.insp = null; this.renderInspector(); this.renderDrawer(); };
      pen.appendChild(t);
    }
    if (herd.length) body.appendChild(pen);

    // --- wildlife
    const wild = g.wildlife;
    if (wild.length) {
      const counts = {};
      for (const b of wild) counts[b.species] = (counts[b.species] || 0) + 1;
      const best = g.colonists.filter(c => !c.away).sort((x, y) => (y.skills.animals || 0) - (x.skills.animals || 0))[0];
      body.appendChild(el('div', '', sectHtml('Wildlife nearby', wild.length)));
      const wl = el('div', 'fm-wild');
      for (const sp of Object.keys(counts).sort((a, b2) => counts[b2] - counts[a])) {
        const A = ANIMALS[sp];
        const ch = best ? tameChance(best, wild.find(b => b.species === sp)) : 0;
        const t = el('div', 'fm-wt' + (A.wildAggressive ? ' danger' : ''));
        t.dataset.tip = 'species:' + sp;
        t.innerHTML = `<span class="fm-wi">${ANIMAL_ICON[sp]}</span><div><b>${counts[sp]}× ${A.name}</b>
          <div class="mini">${A.wildAggressive ? '⚠️ dangerous · ' : ''}tame ${best ? pct(ch) : '—'}</div></div>`;
        const first = wild.find(b => b.species === sp);
        t.onclick = () => { this.sel = { kind: 'beast', id: first.id, ref: first }; this.renderer.selection = this.sel; this.renderer.camX = first.x; this.renderer.camY = first.y; this.sigs.insp = null; this.renderInspector(); };
        wl.appendChild(t);
      }
      body.appendChild(wl);
      if (!g.world.findBuildings('pasture').length) body.appendChild(el('div', 'hint', 'Nobody will try to tame them until a Pasture Post stands.'));
    }
  }

  /** 1–5 skulls from a force ratio: the board's one-glance danger reading. */
  skulls(ratio) {
    const n = ratio > 2.2 ? 1 : ratio > 1.6 ? 2 : ratio > 1.3 ? 3 : ratio > 0.9 ? 4 : 5;
    return `<span class="skulls" title="Danger ${n} of 5">${'💀'.repeat(n)}<s>${'💀'.repeat(5 - n)}</s></span>`;
  }

  /**
   * The Rift Gate. One dungeon, two faces: by day its current interior waits to
   * be delved; by night it empties onto the camp. The panel shows both — what
   * is inside now, what comes out tonight — then the parties inside, the rank
   * ladder it is climbing, and a ledger of every trip.
   */
  drawParty(body) {
    // Read top to bottom as the questions come: what state is the gate in, is
    // anyone inside, who goes next, what waits for them, what comes out tonight.
    this.drawRiftHero(body);
    this.drawLairGoal(body);
    this.drawRiftParties(body);
    this.drawPartyLayout(body);
    this.drawRiftStatus(body);
  }

  /**
   * The next party: who goes, picked from everyone in camp, and the button that sends them.
   * The saved party is what the Rift Gate's builder opens with.
   */
  drawPartyLayout(body) {
    const g = this.game;
    const avail = g.colonists.filter(c => !c.away && !c.dead && !c.mapId);
    const ids = this.partyIds();
    const picked = new Set(ids);
    const chosen = avail.filter(c => picked.has(c.id));
    const save = (next) => {
      this.party = { ids: next, set: true };
      this.sigs.drawer = null; this.renderDrawer();
    };
    const pw = partyPower(chosen);
    const home = avail.length - chosen.length;
    // 1. The go button first: it is the decision this section exists for.
    const head = el('div', 'pb-head');
    const why = !g.canEnterRift ? 'The Rift is open and spewing — parties go in by day.' : !chosen.length ? 'Pick at least one delver below.' : '';
    head.innerHTML = `<div class="pb-odds">
        <div class="pb-verdict">⚔️ ${pw} power · <span style="color:${home < 2 ? 'var(--warn)' : 'inherit'}">${home} stay${home === 1 ? 's' : ''} home</span></div>
        <div class="mini">${g.floorCount === 1 ? 'Today the Rift is one floor deep, and the lair is on it.' : `Floor 1 is the gentlest; the lair on floor ${g.floorCount} is the Rift at full strength.`}</div></div>
      <div class="pb-go"><button class="act primary big"${why ? ' disabled' : ''}>🌀 Enter the Rift</button>
      ${why ? `<div class="pb-why">${why}</div>` : `<div class="mini">${chosen.length} going</div>`}</div>`;
    const go = head.querySelector('button');
    if (go) go.onclick = () => this.openGate();
    body.appendChild(el('div', '', sectHtml('Next party', 'pick who goes, then enter')));
    body.appendChild(head);
    // 2. One list: tick who goes. Whoever stays holds the camp tonight.
    body.appendChild(el('div', '', sectHtml('Who goes', `<b>${chosen.length}</b> picked · ${home} stay${home === 1 ? 's' : ''} home`)));
    const roster = el('div', 'pb-roster');
    for (const c of avail) {
      const on = picked.has(c.id);
      const m = moodStatus(c.mood);
      const f = c.hp / c.maxHp;
      const t = el('div', 'pb-card' + (on ? ' on' : ''));
      t.dataset.tip = 'col:' + c.id;
      t.innerHTML = `<div class="pb-pt">${RACE_ICON[c.race] || '🧑'}${on ? '<b>✓</b>' : ''}</div>
        <div class="pb-nm">${esc(c.name.short)}</div>
        <div class="pb-cl">${c.title || CLASSES[c.klass].name} L${c.level}</div>
        <div class="pb-st"><span>power ${powerOf(c)}</span><span style="color:${m.color}">${m.icon}</span>${c.injuries.length ? '<span>🩹</span>' : ''}</div>
        <u><i style="width:${Math.round(f * 100)}%;background:${levelStatus(f)}"></i></u>`;
      t.onclick = () => save(on ? ids.filter(id => id !== c.id) : [...ids, c.id]);
      roster.appendChild(t);
    }
    body.appendChild(roster);
  }

  /** The groups that live in today's Rift, with what the bestiary knows about them. */
  threatChips(d) {
    const ids = [...new Set([...(d.templates || []), ...(d.lair ? [d.lair] : [])])].filter(t => ENCOUNTERS[t]);
    if (!ids.length) return '';
    const chips = ids.map(t => {
      const E = ENCOUNTERS[t];
      const members = [...(E.leader || []), ...(E.minions || [])];
      const known = members.some(id => bestiaryKnowledge(this.game, id) >= 2);
      const lair = t === d.lair;
      const icon = (members.map(id => MONSTERS[id]).find(Boolean) || {}).icon || '⚔️';
      const tip = `${E.name}${lair ? ' (the lair)' : ''}\n${E.twist}\n${known ? 'Answer: ' + E.answer : 'Answer: unknown — the bestiary learns it after a few kills.'}`;
      return `<span class="ct-chip${lair ? ' bad' : ''}" data-tipt="${esc(tip)}">${icon} ${esc(E.name)}</span>`;
    });
    return `<div class="rf-ch" style="margin-top:6px">Threats inside</div><div class="ct-chips">${chips.join('')}</div>`;
  }

  /** Lore → Bestiary: every monster met, and what killing them has taught. */
  drawBestiary(body) {
    const g = this.game;
    const met = Object.keys(g.bestiary || {}).filter(id => MONSTERS[id]);
    const slain = met.reduce((s, id) => s + (g.bestiary[id].kills || 0), 0);
    body.appendChild(profileCard({
      slim: true, tone: '#b07ae0', avatar: '📖',
      acts: [{ label: '🔬 Tech tree', text: true, onClick: () => this.openDrawer('research') }],
      name: 'Bestiary',
      sub: 'Every monster met. One kill teaches its stats, three its weaknesses, ten a lasting edge against it.',
      stats: [
        { label: 'Known', value: `${met.length}<small>/${MONSTER_IDS.length}</small>` },
        { label: 'Slain', value: slain },
        { label: 'Weakness known', value: met.filter(id => bestiaryKnowledge(g, id) >= 2).length, color: 'var(--good)' },
        { label: 'Mastered', value: met.filter(id => bestiaryKnowledge(g, id) >= 3).length, color: 'var(--hi)' },
      ],
    }));
    body.appendChild(el('div', '', sectHtml('Monsters', `${met.length} of ${MONSTER_IDS.length} known`)));
    if (!met.length) { body.appendChild(el('div', 'mini', 'Nothing met yet. Monsters are recorded when a party or the camp fights them; their weaknesses are learned by killing a few.')); return; }
    for (const fam of FAMILY_IDS) {
      const ids = met.filter(id => MONSTERS[id].fam === fam);
      if (!ids.length) continue;
      const F = FAMILIES[fam];
      body.appendChild(el('div', 'bs-fam', `<span style="color:${F.color}">${F.icon}</span> ${esc(F.name)}`));
      const grid = el('div', 'bs-grid');
      for (const id of ids) {
        const M = MONSTERS[id], b = g.bestiary[id], k = bestiaryKnowledge(g, id);
        const sample = createMonster(g.rng.fork('bst' + id), id, 4);
        const card = el('div', 'bs-card');
        const tags = k >= 1 ? sample.combat.tags.filter(t => TAGS[t] && !['humanoid', 'darkvision'].includes(t)).map(t => `${TAGS[t].icon} ${TAGS[t].name}`).join(' · ') : '???';
        card.innerHTML = `<div class="bs-h"><span class="bs-ic">${M.icon || F.icon}</span><div><b>${esc(M.name)}</b><em>Rank ${M.rank[0]}${M.rank[1] !== M.rank[0] ? '–' + M.rank[1] : ''} · ${b.kills} slain</em></div>
          <span class="bs-k" data-tipt="Knowledge: ${['glimpsed', 'studied', 'understood', 'mastered'][Math.max(0, Math.floor(k))]}\n1 kill: stats and traits · 3 kills: weaknesses · 10 kills: +5% damage against it">${'◆'.repeat(Math.floor(k))}${'◇'.repeat(3 - Math.floor(k))}</span></div>
          <div class="mini">${esc(tags)}</div>
          ${k >= 2 ? combatTraitsHtml({ res: sample.combat.res, immune: sample.combat.immune, tags: [] }) : '<div class="mini">Weaknesses unknown — slay three to learn them.</div>'}
          ${k >= 1 && (M.ab || []).length ? `<div class="mini">${M.ab.map(a => `<span data-tip="ability:${a}">${esc(ABILITIES[a].name)}</span>`).join(' · ')}</div>` : ''}`;
        grid.appendChild(card);
      }
      body.appendChild(grid);
    }
  }

  /** The gate's state in one strip: open or quiet, level, rank. */
  /**
   * The Rift's finish line, said plainly: where the lair is today, what
   * breaking it pays, and how long before it moves a floor deeper.
   */
  drawLairGoal(body) {
    const g = this.game;
    const depth = g.floorCount, m = g.floorAt(depth);
    const B = BIOMES_RIFT[g.rift.biome ? g.rift.biome.id : 'goblin_warrens'] || {};
    const nextIn = g.riftNextLevelIn;
    const broken = m && m.lairCleared;
    const loot = Object.entries(B.loot || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => kw('res', k)).join('');
    const firstTome = !(g.stats.lairs > 0);
    const carried = {};
    for (const c of g.colonists) if (!c.dead && c.mapId && c.pack) for (const [k, q] of Object.entries(c.pack)) if (q > 0) carried[k] = (carried[k] || 0) + q;
    const carriedHtml = Object.keys(carried).length ? Object.entries(carried).map(([k, q]) => kw('res', k, { qty: Math.round(q), short: true })).join('') : '<span class="mini">nothing yet</span>';
    body.appendChild(el('div', 'goal-card' + (broken ? ' done' : ''), `
      <div class="goal-h"><span class="goal-ic">${broken ? '🏆' : '🎯'}</span>
        <div><div class="goal-t">${broken ? `The lair on floor ${depth} is broken` : `Goal: break the lair on floor ${depth}`}</div>
        <div class="mini">${broken ? 'Come back when the Rift deepens for the next one.' : `The lair boss waits at the bottom of the Rift. ${nextIn > 0 ? `In <b>${nextIn} day${nextIn === 1 ? '' : 's'}</b> the Rift deepens and the lair moves to floor ${depth + 1}.` : ''}`}</div></div></div>
      <div class="goal-rw"><span class="mini">Reward</span>${loot}<span class="kw kw-good"><i>⚔️</i>2 pieces of gear</span><span class="kw kw-good"><i>💠</i>${4 + depth} Rift shards</span><span class="kw kw-good"><i>🌙</i>2 nights with no wave</span>${firstTome ? '<span class="kw kw-good"><i>📕</i>a Class Tome (first lair)</span>' : ''}</div>
      <div class="goal-rw"><span class="mini" data-tipt="Loot is what your delvers carry in their packs. It only counts once they walk it back up and out of the Rift.">Loot in packs below</span>${carriedHtml}</div>`));
  }

  drawRiftHero(body) {
    const g = this.game;
    const R = g.rift;
    const open = g.isNight;
    const rank = g.riftRank;
    const nextIn = g.riftNextLevelIn;
    body.appendChild(profileCard({
      tone: open ? '#ff4d6d' : '#9b6cff', cls: 'rift' + (open ? ' open' : ''),
      avatar: '🌀', badge: `<span class="rk-${rank}">${rank}</span>`,
      avTip: `Rank ${rank}\nThe Rift climbs the guild ranks as it deepens: E up to SSS.`,
      acts: [{ label: '📖', tip: 'Bestiary — what lives inside', onClick: () => this.openDrawer('bestiary') }],
      name: `The Rift Gate <span class="badge ${open ? 'bad' : 'info'}">${open ? 'Open' : 'Quiet'}</span>`,
      sub: open ? `Spawn walk the camp until dawn, in <b>${g.hoursToDawn}h</b>.` : `Parties may enter by day. It opens at dusk, in <b>${g.hoursToDusk}h</b>.`,
      extra: `<div class="rf-lv"><span>Level ${R.level}</span><u><i style="width:${nextIn > 0 ? Math.round((1 - nextIn / RIFT_DAYS_PER_LEVEL) * 100) : 100}%"></i></u>
          <em>${nextIn > 0 ? `deepens in ${nextIn}d` : 'at its deepest'}</em></div>`,
      stats: [
        { label: 'Rank', value: `<span class="rk-${rank}" style="color:var(--rk)">${rank}</span>` },
        { label: 'Level', value: R.level },
        { label: open ? 'Dawn in' : 'Dusk in', value: (open ? g.hoursToDawn : g.hoursToDusk) + 'h', color: !open && g.hoursToDusk <= 3 ? 'var(--warn)' : '' },
        { label: 'Tonight', value: `~${g.waveForecast.size}`, tip: 'Spawn expected at dusk', color: 'var(--danger)' },
      ],
    }));
  }

  /**
   * The floors: one row per floor of today's Rift, top to bottom — who of
   * ours is on it, what's still hostile there, whether it's been cleared —
   * with a button to look at it and one to call everyone on it home.
   */
  drawRiftParties(body) {
    const g = this.game;
    const below = g.colonists.filter(c => !c.dead && c.mapId);
    const B = BIOMES_RIFT[g.rift.biome ? g.rift.biome.id : 'goblin_warrens'];
    body.appendChild(el('div', '', sectHtml('The floors', `${g.floorCount} deep today${B ? ' · ' + esc(B.name) : ''}${below.length ? ` · <b>${below.length}</b> of ours below` : ''}`)));
    const list = el('div', 'rf-floors');
    for (let depth = 1; depth <= g.floorCount; depth++) {
      const m = g.floorAt(depth);
      const here = m ? g.colonists.filter(c => !c.dead && c.mapId === m.id) : [];
      const hostile = m ? m.raiders.filter(r => r.hp > 0 && !r.neutral) : [];
      const awake = hostile.filter(r => r.awake).length;
      const last = depth === g.floorCount;
      const state = !m ? ['unexplored', 'info'] : m.lairCleared ? ['lair broken', 'good'] : !hostile.length ? ['cleared', 'good'] : awake && here.length ? ['fighting', 'bad'] : [`${hostile.length} hostile`, 'warn'];
      const row = el('div', 'rf-floor' + (m && m.id === this.mapId ? ' on' : ''));
      row.innerHTML = `<b class="rf-fd">F${depth}</b>
        <div class="rf-fb"><div>${last ? '👑 the lair' : m ? `${m.world.w}×${m.world.h}` : 'shaped when someone gets there'} <span class="badge ${state[1]}">${state[0]}</span></div>
          <div class="rf-fp">${here.map(c => `<span data-tip="col:${c.id}">${RACE_ICON[c.race] || '🧑'}</span>`).join('') || '<span class="mini">nobody</span>'}</div></div>`;
      const acts = el('div', 'rf-fa');
      if (m) {
        const look = el('button', 'act', 'View');
        look.onclick = () => { this.viewMap(m.id); this.sigs.drawer = null; this.renderDrawer(); };
        acts.appendChild(look);
      }
      if (here.length) {
        const back = el('button', 'act', 'Call back');
        back.title = 'Everyone on this floor climbs all the way out';
        back.onclick = () => { this.act(g, 'orderTravel', here.map(c => c.id), 'up', true); this.flash(`${here.length} climbing out of the Rift`, 'info'); };
        acts.appendChild(back);
      }
      row.appendChild(acts);
      list.appendChild(row);
    }
    body.appendChild(list);
    body.appendChild(el('div', 'hint', 'Select people and right-click the gate (or stairs) to go down; right-click stairs up to come back. Whatever they carry reaches the stores when they climb out. An empty floor reshapes at dawn.'));
  }

  /** What waits inside, what comes out tonight, the climb and the ledger. */
  drawRiftStatus(body) {
    const g = this.game;
    const R = g.rift;
    const d = R.forecast;
    const power = g.expeditionPower();
    const open = g.isNight;

    // --- inside now / tonight
    body.appendChild(el('div', '', sectHtml('Forecast', 'what waits inside · what comes out tonight')));
    const pair = el('div', 'rf-pair');
    const inside = el('div', 'rf-card');
    if (d) {
      const B = BIOMES_RIFT[d.biome];
      inside.innerHTML = `<div class="rf-ch">Inside today</div>
        <div class="rf-band" style="background:${d.color || '#6a4a9a'}">${esc(d.name)} · ${g.floorCount} floor${g.floorCount === 1 ? '' : 's'}</div>
        <div class="dv-row"><span>Floor 1</span><b>tier ${floorTier(R.level, 1)}</b></div>
        <div class="dv-row"><span>The lair (F${g.floorCount})</span><b>tier ${floorTier(R.level, g.floorCount)}</b></div>
        <div class="dv-row"><span>Your party</span><b>${power}</b></div>
        <div class="dv-row"><span>Loot</span><span>${Object.keys(d.loot || {}).map(k => RESOURCE_ICON[k] || '').join(' ')}</span></div>`;
      if (B) inside.appendChild(el('div', 'rf-biome' + (d.surge ? ' surge' : ''), `<div class="rf-bi">${B.icon}</div><div><b>${esc(B.name)}${d.surge ? ' · SURGE' : ''}</b><div class="mini">${esc(B.rule)}</div></div>`));
      const threats = this.threatChips(d);
      if (threats) inside.appendChild(el('div', 'rf-threats', threats));
      inside.appendChild(el('div', 'hint', 'What lives in there, and how it fights. Floors nobody stands on reshape at dawn.'));
    }
    pair.appendChild(inside);

    const f = g.waveForecast;
    const def = defenderPower(g);
    const walls = g.world.findBuildings().filter(b => ['wall', 'door', 'barricade'].includes(b.b.id)).length;
    const watch = g.world.findBuildings('watchpost').length;
    const tonight = el('div', 'rf-card night');
    const top = Math.max(def, f.power, 1);
    tonight.innerHTML = `<div class="rf-ch">${open ? 'Tonight (now)' : 'Tonight'}</div>
      <div class="rf-wave">${'👹'.repeat(Math.min(10, f.size))}</div>
      <div class="rf-nm">~${f.size} spawn</div>
      ${(() => { const Bw = g.rift.biome && BIOMES_RIFT[g.rift.biome.id]; if (!Bw) return ''; const kinds = Bw.npcWave ? 'a raiding band' : Bw.waves.map(t => ENCOUNTERS[t] ? ENCOUNTERS[t].name : t).join(' or '); return `<div class="mini">Out of ${esc(Bw.name)}: ${esc(kinds)}</div>`; })()}
      <div class="pb-bar"><span>🛡️ Defenders</span><u><i style="width:${Math.round(def / top * 100)}%;background:#7fc86b"></i></u><b>${def}</b></div>
      <div class="pb-bar"><span>👹 Wave</span><u><i style="width:${Math.round(f.power / top * 100)}%;background:#c0404a"></i></u><b>${f.power}</b></div>
      <div class="dv-row"><span>Fortifications</span><b>🧱 ${walls}${watch ? ` · 🔭 ${watch}` : ''}</b></div>
      <div class="hint">Waves are sized against whoever is home. A party still inside at dusk leaves the camp thinner — and the wave smaller.</div>`;
    pair.appendChild(tonight);
    body.appendChild(pair);

    // --- rank ladder
    body.appendChild(el('div', '', sectHtml('The climb to SSS', `rank ${g.riftRank} · level ${R.level}`)));
    body.appendChild(el('div', 'rf-ladder', RIFT_RANKS.map(([at, name], i) => {
      const nextAt = RIFT_RANKS[i + 1] ? RIFT_RANKS[i + 1][0] : Infinity;
      const st = R.level >= nextAt ? 'past' : R.level >= at ? 'now' : 'ahead';
      const day = (at - 1) * RIFT_DAYS_PER_LEVEL + 1;
      return `<div class="rf-rung ${st} rk-${name}" data-tipt="Rank ${name}\nFrom level ${at} — around day ${day}"><b>${name}</b><span>Lv ${at}</span></div>`;
    }).join('<i>›</i>')));

    // --- ledger
    if (g.expeditionHistory.length) {
      const hist = g.expeditionHistory;
      const clears = hist.filter(h => h.outcome === 'clear').length;
      const wipes = hist.filter(h => h.outcome === 'wipe').length;
      body.appendChild(el('div', '', sectHtml('Ledger', `${hist.length} trips · <span style="color:var(--good)">${clears} cleared</span> · ${hist.length - clears - wipes} withdrew · <span style="color:var(--danger)">${wipes} lost</span>`)));
      for (const h of hist.slice(-8).reverse()) {
        const mark = h.outcome === 'clear' ? ['Cleared', 'good'] : h.outcome === 'wipe' ? ['Lost', 'bad'] : ['Withdrew', 'warn'];
        const c = el('div', 'dv-led');
        c.innerHTML = `<span class="dv-day">Day ${Math.floor(h.tick / TICKS_PER_DAY) + 1}</span><b>${esc(h.dungeon)}</b>
          <span class="mini">🚪 ${h.rooms} · ⚔️ ${h.kills}</span><span class="badge ${mark[1]}">${mark[0]}</span>`;
        c.onclick = () => { this.sel = { kind: 'history', ref: h }; this.sigs.insp = null; this.renderInspector(); };
        body.appendChild(c);
      }
    }
  }

  /**
   * The tech tree. Columns are depth (how many projects stand in front of a
   * tech), links run from each prerequisite to what it opens, and every node
   * shows its state at a glance: done, being studied, ready, queued or locked.
   * Click a ready tech to study it; click a locked one to queue it together
   * with everything it needs.
   */
  drawResearch(body) {
    const g = this.game;
    const R = RESEARCH;
    const ids = Object.keys(R);
    const cur = g.research.current;

    // --- banner: what is being studied and whether anyone can study it
    const libs = g.world.findBuildings('library').length;
    const f = cur ? g.research.progress / R[cur].cost : 0;
    body.appendChild(profileCard({
      tone: '#e2b84c', avatar: cur ? TECH_ICON[cur] || '🔬' : '🔬', badge: cur ? '⏳' : '!',
      acts: [{ label: '📖 Bestiary', text: true, onClick: () => this.openDrawer('bestiary') }],
      name: cur ? `<span class="prof-kicker">Researching</span>${esc(R[cur].name)}` : '<span style="color:var(--warn)">Pick a project in the tree</span>',
      sub: cur ? esc(R[cur].desc || '') : 'Nobody is studying anything. Click a ready tech below to start.',
      extra: cur ? `<div class="rs-prog"><i style="width:${Math.round(f * 100)}%"></i><span>${Math.round(g.research.progress)} / ${R[cur].cost} insight · ${Math.round(f * 100)}%</span></div>` : '',
      stats: [
        { label: 'Discovered', value: `${g.research.done.size}<small>/${ids.length}</small>` },
        { label: 'Queued', value: g.research.queue.length },
        { label: 'Libraries', value: libs, color: libs ? '' : 'var(--danger)', tip: 'Nobody can study without one' },
      ],
    }));
    if (!libs) body.appendChild(el('div', 'alarm', `<span class="li">📚</span>No Library — nobody can study until one is built.`));
    if (g.research.queue.length) {
      body.appendChild(el('div', 'rs-queue', `<em>Queue</em> ${g.research.queue.map((q, i) =>
        `<span data-tip="tech:${q}">${i + 1}. ${TECH_ICON[q] || ''} ${R[q].name}</span>`).join('<i>›</i>')}`));
    }

    // --- layout: depth columns, rows ordered by their parents to limit crossings
    const depth = {};
    const dep = (t) => depth[t] ?? (depth[t] = R[t].req.length ? 1 + Math.max(...R[t].req.map(dep)) : 0);
    ids.forEach(dep);
    const cols = [];
    for (const t of ids) (cols[depth[t]] = cols[depth[t]] || []).push(t);
    const row = {};
    cols.forEach((col, ci) => {
      if (ci === 0) col.sort((a, b) => R[a].cost - R[b].cost);
      else col.sort((a, b) => {
        const ra = R[a].req.reduce((s, q) => s + row[q], 0) / R[a].req.length;
        const rb = R[b].req.reduce((s, q) => s + row[q], 0) / R[b].req.length;
        return ra - rb || R[a].cost - R[b].cost;
      });
      col.forEach((t, i) => { row[t] = i; });
    });
    const W = 172, H = 60, CG = 44, RG = 10, PAD = 8;
    const tallest = Math.max(...cols.map(c => c.length));
    const pos = {};
    cols.forEach((col, ci) => {
      const off = (tallest - col.length) * (H + RG) / 2;   // centre short columns
      col.forEach((t, i) => { pos[t] = { x: PAD + ci * (W + CG), y: PAD + 22 + off + i * (H + RG) }; });
    });
    const totalW = PAD * 2 + cols.length * W + (cols.length - 1) * CG;
    const totalH = PAD * 2 + 22 + tallest * (H + RG);

    const state = (t) => g.research.done.has(t) ? 'done' : t === cur ? 'cur'
      : g.research.queue.includes(t) ? 'queued' : R[t].req.every(q => g.research.done.has(q)) ? 'open' : 'locked';

    // Links: bezier from the right edge of a prerequisite to the left of its child.
    let links = '';
    for (const t of ids) for (const q of R[t].req) {
      const a = pos[q], b = pos[t];
      const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2;
      const st = g.research.done.has(q) ? (g.research.done.has(t) ? 'done' : 'ready') : 'locked';
      links += `<path class="rl-${st}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
    }
    const heads = ['Foundations', 'Crafts', 'Mastery', 'Legend', 'Beyond'].slice(0, cols.length)
      .map((h, ci) => `<div class="rs-col" style="left:${PAD + ci * (W + CG)}px;width:${W}px">${h}</div>`).join('');

    const nodes = ids.map(t => {
      const st = state(t), T = R[t];
      const f = st === 'done' ? 1 : st === 'cur' ? g.research.progress / T.cost : 0;
      const qi = g.research.queue.indexOf(t);
      const badge = st === 'done' ? '✓' : st === 'cur' ? '⏳' : st === 'queued' ? '#' + (qi + 1) : st === 'locked' ? '🔒' : '';
      const unlocks = (T.unlock || []).map(u => BUILDING_ICON[u] || '').join('');
      return `<div class="tn tn-${st}" data-tech="${t}" data-tip="tech:${t}" style="left:${pos[t].x}px;top:${pos[t].y}px;width:${W}px;height:${H}px">
        <div class="tn-ic">${TECH_ICON[t] || '🔬'}</div>
        <div class="tn-bd"><div class="tn-nm">${T.name}${techOutcome(t) ? `<em class="tn-out">${techOutcome(t)}</em>` : ''}</div>
          <div class="tn-mt"><span>${T.cost}</span><span class="tn-un">${unlocks}${T.bonus ? '⭐' : ''}</span></div>
          <div class="tn-pb"><i style="width:${Math.round(f * 100)}%"></i></div></div>
        ${badge ? `<div class="tn-bg">${badge}</div>` : ''}</div>`;
    }).join('');

    const tree = el('div', 'rs-tree');
    tree.innerHTML = `<div class="rs-canvas" style="width:${totalW}px;height:${totalH}px">${heads}
      <svg class="rs-links" width="${totalW}" height="${totalH}">${links}</svg>${nodes}</div>`;
    tree.onclick = (e) => {
      const n = e.target.closest && e.target.closest('[data-tech]'); if (!n) return;
      const t = n.dataset.tech, st = state(t);
      if (st === 'done' || st === 'cur') return;
      if (st === 'open') { this.act(g, 'setResearch', t); this.act(g, 'unqueueResearch', t); this.flash(`Now researching ${R[t].name}`, 'good'); }
      else { this.act(g, 'queueResearch', t); this.flash(`Queued ${R[t].name} and its prerequisites`, 'good'); }
      this.renderDrawer();
    };
    tree.oncontextmenu = (e) => {
      const n = e.target.closest && e.target.closest('[data-tech]'); if (!n) return;
      e.preventDefault();
      this.act(g, 'unqueueResearch', n.dataset.tech); this.renderDrawer();
    };
    body.appendChild(tree);
    body.appendChild(el('div', 'rs-legend', `<span class="k-done">✓ Researched</span><span class="k-cur">⏳ Studying</span>
      <span class="k-open">Ready</span><span class="k-queued"># Queued</span><span class="k-locked">🔒 Locked</span>
      <span class="k-hint">Click: study / queue path · right-click: unqueue · ⭐ grants a bonus</span>`));
  }

  /**
   * The market: arrivals at the gate as portrait cards, then the caravan as a
   * two-sided exchange — their wagon on the left, your storehouse on the right,
   * each good a tile with its price — and the armory as an item grid.
   */
  drawTrade(body) {
    const g = this.game;
    const gold = Math.floor(g.resources.gold || 0);
    const leaves = g.caravan ? Math.max(0, Math.round((g.caravan.expires - g.tick) / 60)) : 0;
    body.appendChild(profileCard({
      tone: '#e2b84c', avatar: '🐫', badge: g.caravan || g.pendingArrivals.length ? g.pendingArrivals.length + (g.caravan ? 1 : 0) : '',
      acts: [{ label: '🗺️', tip: 'World map', onClick: () => this.openDrawer('region') }],
      name: 'Market',
      sub: g.caravan ? `A caravan from ${esc(g.caravan.name)} is in town.` : g.pendingArrivals.length ? 'Someone is waiting at the gate.' : 'Quiet. Caravans and wanderers arrive over time.',
      stats: [
        { label: 'Gold', value: gold, color: 'var(--hi)' },
        { label: 'At the gate', value: g.pendingArrivals.length, color: g.pendingArrivals.length ? 'var(--warn)' : '' },
        { label: 'Caravan', value: g.caravan ? `${leaves}h left` : '—', color: g.caravan ? 'var(--good)' : '' },
      ],
    }));

    // --- arrivals
    if (g.pendingArrivals.length) {
      body.appendChild(el('div', '', sectHtml('At the gate', `${g.pendingArrivals.length} asking to join`)));
      const row = el('div', 'tr-gate');
      g.pendingArrivals.forEach((a, i) => {
        const n = a.npc, disp = dispositionOf(n.hostility);
        const c = el('div', 'tr-visitor');
        c.innerHTML = `<div class="tr-vp">${RACE_ICON[n.race] || '🧑'}</div>
          <div class="tr-vb"><b>${esc(n.name.full)}</b>
            <div class="mini">${RACES[n.race].name} ${CLASSES[n.klass].name} · L${n.level} · ⚔️ ${powerOf(n)}</div>
            <div class="tr-traits">${kwList('trait', n.traits.slice(0, 3))}</div>
            ${gauge({ label: 'Disposition', frac: n.hostility / 100, verdict: disp.name, color: disp.color, note: n.hostility > 72 ? 'Might turn on the hold.' : '' })}
            <div class="mini">🕓 waits ${Math.max(0, Math.round((a.expires - g.tick) / 60))}h more${a.fee ? ` · asks 🪙 ${a.fee}` : ' · asks nothing'}</div></div>`;
        const acts = el('div', 'tr-va');
        const accept = el('button', 'act primary', a.fee ? `Welcome (🪙${a.fee})` : 'Welcome');
        accept.onclick = (e) => { e.stopPropagation(); this.act(g, 'acceptArrival', i); this.renderDrawer(); };
        if (a.fee > gold) accept.disabled = true;
        const rej = el('button', 'act danger', 'Turn away');
        rej.onclick = (e) => { e.stopPropagation(); this.act(g, 'rejectArrival', i); this.renderDrawer(); };
        acts.appendChild(accept); acts.appendChild(rej);
        c.querySelector('.tr-vb').appendChild(acts);
        row.appendChild(c);
      });
      body.appendChild(row);
    }

    // --- the caravan
    if (g.caravan) {
      const cv = g.caravan;
      const tr = cv.trader;
      body.appendChild(el('div', '', sectHtml('Caravan', `leaves in ${Math.max(0, Math.round((cv.expires - g.tick) / 60))}h`)));
      body.appendChild(el('div', 'tr-merchant', `<div class="tr-mp">${tr ? RACE_ICON[tr.race] || '🧑' : '🐫'}</div>
        <div><b>${tr ? esc(tr.name.full) : 'A trader'}</b><div class="mini">Caravan from ${esc(cv.name)} · prices ×${cv.priceMult.toFixed(2)}</div>
        <div class="tr-wants"><span class="mini">Pays ×1.5 for</span> ${cv.wants.map(w => `<span class="badge warn">${RESOURCE_ICON[w] || ''} ${RESOURCES[w].name}</span>`).join('')}</div></div>`));
      const ex = el('div', 'tr-ex');
      const theirs = el('div', 'tr-side');
      theirs.appendChild(el('div', 'tr-sh', '🐫 Their wagon'));
      const tg = el('div', 'tr-grid');
      for (const res in cv.stock) {
        const qty = cv.stock[res];
        if (qty <= 0) continue;
        const price = Math.ceil(PRICES[res] * 10 * cv.priceMult);
        const can = gold >= price && qty >= 10;
        const t = el('div', 'tr-item' + (can ? '' : ' no'));
        t.dataset.tip = 'res:' + res;
        t.innerHTML = `<div class="tr-ic">${RESOURCE_ICON[res] || '📦'}</div><div class="tr-n">${RESOURCES[res].name}</div>
          <div class="tr-q">${qty} in stock</div><div class="tr-p">10 for 🪙${price}</div>`;
        t.onclick = () => { if (!can) return; this.act(g, 'buy', res, 10); this.flash(`Bought 10 ${RESOURCES[res].name} for ${price}g`, 'good'); this.renderDrawer(); };
        tg.appendChild(t);
      }
      if (cv.livestock && cv.livestock.count > 0) {
        const L = cv.livestock, A = ANIMALS[L.species];
        const price = Math.ceil((22 + A.hp * 0.9 + A.power * 2.5) * cv.priceMult);
        const can = gold >= price;
        const t = el('div', 'tr-item beast' + (can ? '' : ' no'));
        t.dataset.tip = 'species:' + L.species;
        t.innerHTML = `<div class="tr-ic">${ANIMAL_ICON[L.species] || '🐾'}</div><div class="tr-n">${A.name}</div>
          <div class="tr-q">${L.count} head</div><div class="tr-p">1 for 🪙${price}</div>`;
        t.onclick = () => { if (!can) return; this.act(g, 'buyLivestock', 1); this.flash(`Bought a ${A.name}`, 'good'); this.renderDrawer(); };
        tg.appendChild(t);
      }
      theirs.appendChild(tg);
      const ours = el('div', 'tr-side');
      ours.appendChild(el('div', 'tr-sh', '🏰 Your storehouse'));
      const og = el('div', 'tr-grid');
      for (const res of ['stone', 'wood', 'iron', 'gems', 'relics', 'dust', 'herbs']) {
        const have = Math.floor(g.resources[res] || 0);
        const wanted = cv.wants.includes(res);
        const val = Math.floor(PRICES[res] * 10 * 0.6 * (wanted ? 1.5 : 1));
        const can = have >= 10;
        const t = el('div', 'tr-item sell' + (can ? '' : ' no') + (wanted ? ' want' : ''));
        t.dataset.tip = 'res:' + res;
        t.innerHTML = `${wanted ? '<div class="tr-star">⭐</div>' : ''}<div class="tr-ic">${RESOURCE_ICON[res] || '📦'}</div>
          <div class="tr-n">${RESOURCES[res].name}</div><div class="tr-q">you have ${have}</div><div class="tr-p">10 for +🪙${val}</div>`;
        t.onclick = () => { if (!can) return; this.act(g, 'sell', res, 10); this.flash(`Sold 10 ${RESOURCES[res].name} for ${val}g`, 'good'); this.renderDrawer(); };
        og.appendChild(t);
      }
      ours.appendChild(og);
      ex.appendChild(theirs); ex.appendChild(el('div', 'tr-arrow', '⇄')); ex.appendChild(ours);
      body.appendChild(ex);
      body.appendChild(el('div', 'hint', 'Click a tile to trade ten. ⭐ goods fetch half again as much. Trading warms their town toward you.'));
    }
    this.drawShops(body);
    if (!g.caravan && !g.pendingArrivals.length && !body.querySelector('.shop-sect')) {
      body.appendChild(el('div', 'tr-empty', `<div>🐫</div><b>The market square is quiet.</b>
        <span>Caravans, traders and wanderers arrive over time. Build an Armory, Apothecary or Stable for shops of your own.</span>`));
    }
  }

  /**
   * Everything gold buys over a counter: visiting traders, the shops the hold
   * has built, and any Rift merchant a party is standing near. One delegated
   * click handler; every button carries what it does in data attributes.
   */
  drawShops(body) {
    const g = this.game, gold = Math.floor(g.resources.gold || 0);
    const S = shopsOf(g);
    const wrap = el('div', 'shops');
    const sect = (title, meta) => el('div', 'shop-sect', sectHtml(title, meta));
    const grid = () => el('div', 'tr-grid shop-grid');
    const itemTile = (it, price, act, note = '') => `<div class="tr-item shop-it${gold >= price ? '' : ' no'}" ${act} data-tip="${itemTipKey(it)}">
        <div class="tr-ic">${SLOT_ICONS[it.slot] || '⚔️'}</div><div class="tr-n" style="color:${RARITIES[it.rarity].color}">${esc(it.name)}</div>
        <div class="tr-q">${note || RARITIES[it.rarity].name}</div><div class="tr-p">🪙 ${price}</div></div>`;
    const potionTile = (id, n, price, act) => `<div class="tr-item${gold >= price ? '' : ' no'}" ${act} data-tip="potion:${id}">
        <div class="tr-ic">${POTIONS[id].icon}</div><div class="tr-n">${esc(POTIONS[id].name)}</div><div class="tr-q">${n} on the shelf</div><div class="tr-p">🪙 ${price}</div></div>`;
    const beastTile = (b, act) => { const A = ANIMALS[b.species], price = beastPrice(b); return `<div class="tr-item beast${gold >= price ? '' : ' no'}" ${act} data-tip="species:${b.species}">
        <div class="tr-ic">${ANIMAL_ICON[b.species] || '🐾'}</div><div class="tr-n">${A.name}</div><div class="tr-q">${b.traits.length ? kwList('btrait', b.traits) : (b.sex === 'f' ? 'female' : 'male')}</div><div class="tr-p">🪙 ${price}</div></div>`; };
    const mercTile = (n, act) => { const fee = mercFee(n); return `<div class="tr-item merc${gold >= fee ? '' : ' no'}" ${act} data-tipt="${esc(n.name.full)} · ${esc(RACES[n.race].name)} ${esc(CLASSES[n.klass].name)}">
        <div class="tr-ic">${RACE_ICON[n.race] || '🧑'}</div><div class="tr-n">${esc(n.name.short)}</div><div class="tr-q">${CLASSES[n.klass].name} L${n.level} · ⚔️ ${powerOf(n)}</div><div class="tr-p">🪙 ${fee} + ${mercWage(n)}/day</div></div>`; };

    // --- visitors
    for (const t of g.traders || []) {
      const V = VISITORS[t.kind];
      wrap.appendChild(sect(`${V.icon} ${V.name}`, `leaves in ${Math.max(0, Math.round((t.expires - g.tick) / 60))}h`));
      wrap.appendChild(el('div', 'mini shop-desc', esc(V.desc)));
      const gr = grid();
      let h = '';
      (t.items || []).forEach((it, i) => { h += itemTile(it, it.commission ? it.balance : itemPrice(it), `data-tbuy="${t.kind}:${i}"`, it.commission ? 'your commission — balance due' : ''); });
      (t.beasts || []).forEach((b, i) => { h += beastTile(b, `data-tbeast="${t.kind}:${i}"`); });
      (t.mercs || []).forEach((n, i) => { h += mercTile(n, `data-thire="${t.kind}:${i}"`); });
      if (t.kind === 'curio') {
        if (t.relics > 0) h += `<div class="tr-item${gold >= CURIO_PRICES.relic ? '' : ' no'}" data-curio="relic" data-tip="res:relics"><div class="tr-ic">🏺</div><div class="tr-n">Relic</div><div class="tr-q">${t.relics} for sale</div><div class="tr-p">🪙 ${CURIO_PRICES.relic}</div></div>`;
        if (t.keys > 0) h += `<div class="tr-item${gold >= CURIO_PRICES.key ? '' : ' no'}" data-curio="key" data-tipt="Opens one sealed vault in the Rift"><div class="tr-ic">🗝️</div><div class="tr-n">Rift key</div><div class="tr-q">${t.keys} for sale · you hold ${g.keys || 0}</div><div class="tr-p">🪙 ${CURIO_PRICES.key}</div></div>`;
        for (const [id, n] of Object.entries(t.reagents || {})) if (n > 0) h += `<div class="tr-item${gold >= CURIO_PRICES.reagent ? '' : ' no'}" data-curio="reagent:${id}"><div class="tr-ic">✨</div><div class="tr-n">${esc(id[0].toUpperCase() + id.slice(1))} essence</div><div class="tr-q">${n} for sale</div><div class="tr-p">🪙 ${CURIO_PRICES.reagent}</div></div>`;
        for (const [id, n] of Object.entries(g.trophies || {})) if (n > 0) h += `<div class="tr-item sell" data-trophy="${id}"><div class="tr-ic">🦷</div><div class="tr-n">Sell a trophy</div><div class="tr-q">${esc(id.replace(/_/g, ' '))} · ${n} held</div><div class="tr-p">+🪙 ${TROPHY_PRICE}</div></div>`;
      }
      if (t.kind === 'pilgrims') {
        for (const res of ['food', 'meal']) { const have = Math.floor(g.resources[res] || 0), val = Math.floor(PRICES[res] * 10 * 0.6 * 1.5); h += `<div class="tr-item sell${have >= 10 ? '' : ' no'}" data-pilgrim="${res}"><div class="tr-ic">${RESOURCE_ICON[res]}</div><div class="tr-n">Sell ${RESOURCES[res].name}</div><div class="tr-q">you have ${have}</div><div class="tr-p">10 for +🪙${val}</div></div>`; }
      }
      gr.innerHTML = h || '<div class="mini">Nothing left to sell.</div>';
      wrap.appendChild(gr);
      if (t.kind === 'arms') {
        const cm = el('div', 'shop-row');
        cm.innerHTML = `<span class="mini">Commission a piece (30% down, the rest on delivery):</span>`
          + ['rare', 'epic'].map(r => ['weapon', 'armor', 'charm'].map(sl => `<button class="act" data-comm="${sl}:${r}" data-tipt="${esc(RARITIES[r].name + ' ' + SLOT_NAMES[sl].toLowerCase())} · ${commissionPrice(g, r)} gold in all">${SLOT_ICONS[sl]} ${RARITIES[r].name}</button>`).join('')).join('');
        wrap.appendChild(cm);
      }
      if (t.kind === 'pilgrims') wrap.appendChild(el('div', 'hint', 'Blessings cost less while pilgrims are here — see Services.'));
    }

    // --- your shops
    const shopHead = (id, name, icon, every) => {
      const lv = builtLevel(g, id);
      const days = S[id] ? Math.max(0, every - (g.day - S[id].day)) : 0;
      const st = shopStatus(g, id);
      const head = sect(`${icon} ${name} <span class="lvl">L${lv}</span>${st.open ? ' <span class="badge good">Open</span>' : ' <span class="badge bad">Shut</span>'}`,
        S[id] ? `restocks in ${days || 1} day${days === 1 ? '' : 's'}` : 'stocks at dawn');
      if (st.open) return head;
      // A shut counter still shows its shelves, so you know what's waiting.
      const box = el('div');
      box.appendChild(head);
      box.appendChild(el('div', 'mini shop-desc shop-shut', `🔴 ${esc(st.why)}`));
      return box;
    };
    if (builtLevel(g, 'armory')) {
      wrap.appendChild(shopHead('armory', 'Armory', '🛡️', 5));
      const gr = grid();
      gr.innerHTML = ((S.armory && S.armory.items) || []).map((it, i) => itemTile(it, itemPrice(it), `data-sbuy="armory:${i}"`)).join('') || '<div class="mini">Sold out until the next restock.</div>';
      wrap.appendChild(gr);
      // Selling: the least useful of what's racked up, worth the most.
      const spare = g.armory.map((it, i) => [it, i]).sort((a, b) => itemBuyback(b[0]) - itemBuyback(a[0])).slice(0, 8);
      if (spare.length) {
        const sg = grid();
        sg.innerHTML = spare.map(([it, i]) => `<div class="tr-item sell" data-sell="${i}" data-tip="${itemTipKey(it)}"><div class="tr-ic">${SLOT_ICONS[it.slot] || '⚔️'}</div><div class="tr-n" style="color:${RARITIES[it.rarity].color}">${esc(it.name)}</div><div class="tr-q">from your stash</div><div class="tr-p">+🪙 ${itemBuyback(it)}</div></div>`).join('');
        wrap.appendChild(el('div', 'mini shop-desc', 'Sell what the hold doesn’t use:'));
        wrap.appendChild(sg);
      }
    }
    if (builtLevel(g, 'apothecary')) {
      wrap.appendChild(shopHead('apothecary', 'Apothecary', '🧪', 2));
      const gr = grid();
      const pots = (S.apothecary && S.apothecary.potions) || {};
      gr.innerHTML = Object.entries(pots).filter(([, n]) => n > 0).map(([id, n]) => potionTile(id, n, potionPrice(id), `data-spot="apothecary:${id}"`)).join('') || '<div class="mini">The shelves are bare until the next restock.</div>';
      wrap.appendChild(gr);
      const mine = POTION_IDS.filter(id => g.potionCount(id) > 0);
      if (mine.length) {
        const sg = grid();
        sg.innerHTML = mine.map(id => `<div class="tr-item sell" data-sellpot="${id}" data-tip="potion:${id}"><div class="tr-ic">${POTIONS[id].icon}</div><div class="tr-n">${esc(POTIONS[id].name)}</div><div class="tr-q">you hold ${g.potionCount(id)}</div><div class="tr-p">+🪙 ${Math.round(potionPrice(id) * 0.4)}</div></div>`).join('');
        wrap.appendChild(el('div', 'mini shop-desc', 'Sell brews back to the shelf:'));
        wrap.appendChild(sg);
      }
    }
    if (builtLevel(g, 'stable')) {
      wrap.appendChild(shopHead('stable', 'Stable', '🐫', 6));
      const gr = grid();
      gr.innerHTML = ((S.stable && S.stable.beasts) || []).map((b, i) => beastTile(b, `data-sbeast="stable:${i}"`)).join('') || '<div class="mini">No stock until the next restock.</div>';
      wrap.appendChild(gr);
    }

    // --- Rift merchants a party can reach
    for (const m of g.floors) {
      const r = m.raiders.find(x => x.neutral && x.hp > 0);
      if (!r || !g.colonists.some(c => (c.mapId || 0) === m.id)) continue;
      const M = RIFT_MERCHANTS[r.merchant];
      wrap.appendChild(sect(`${M.icon} ${M.name} <span class="lvl">F${m.depth}</span>`, 'a party is on this floor'));
      const row = el('div', 'shop-row');
      row.innerHTML = `<span class="mini">${esc(M.desc)}</span> <button class="act primary" data-merchant="${m.id}:${r.id}">Trade</button>`;
      wrap.appendChild(row);
    }

    wrap.onclick = (e) => {
      const b = e.target.closest && e.target.closest('[data-tbuy],[data-tbeast],[data-thire],[data-curio],[data-trophy],[data-pilgrim],[data-comm],[data-sbuy],[data-sell],[data-spot],[data-sellpot],[data-sbeast],[data-merchant]');
      if (!b) return;
      const d = b.dataset;
      const tr = (k) => traderOf(g, k);
      let r = '';
      if (d.tbuy) { const [k, i] = d.tbuy.split(':'); r = buyItem(g, tr(k), +i); }
      else if (d.tbeast) { const [k, i] = d.tbeast.split(':'); r = buyBeast(g, tr(k), +i); }
      else if (d.thire) { const [k, i] = d.thire.split(':'); r = hireMerc(g, tr(k), +i); }
      else if (d.curio) { const [w, id] = d.curio.split(':'); r = buyCurio(g, w, id); }
      else if (d.trophy) r = sellTrophy(g, d.trophy);
      else if (d.pilgrim) r = sellToPilgrims(g, d.pilgrim, 10);
      else if (d.comm) { const [sl, ra] = d.comm.split(':'); r = commission(g, sl, ra); }
      else if (d.sbuy) r = buyItem(g, S.armory, +d.sbuy.split(':')[1]);
      else if (d.sell) r = sellItem(g, +d.sell);
      else if (d.spot) r = buyPotion(g, S.apothecary, d.spot.split(':')[1]);
      else if (d.sellpot) r = sellPotion(g, d.sellpot);
      else if (d.sbeast) r = buyBeast(g, S.stable, +d.sbeast.split(':')[1]);
      else if (d.merchant) {
        const [mid, rid] = d.merchant.split(':').map(Number);
        const m = g.mapById(mid), rr = m && m.raiders.find(x => x.id === rid);
        if (rr) { this.viewMap(mid); this.sel = { kind: 'enemy', id: rr.id, ref: rr }; this.renderer.camX = rr.x; this.renderer.camY = rr.y; this.sigs.insp = null; this.renderInspector(); }
        return;
      }
      if (r) this.toast(r, 'warn'); else this.flash('Done', 'good');
      this.sigs.drawer = null; this.renderDrawer(); this.renderTop();
    };
    if (wrap.childElementCount) body.appendChild(wrap);
  }

  /**
   * World › Services: gold spent on people and favours — sellswords, feasts,
   * rumours, blessings, training, journeys — plus standing orders, the
   * strongroom, and where the gold has gone.
   */
  drawServices(body) {
    const g = this.game, gold = Math.floor(g.resources.gold || 0);
    const costs = dailyCosts(g), daily = costs.mercs + costs.stipends + costs.upkeep;
    const L = ledger(g);
    const week = {};
    for (const d of L.days.slice(-7)) for (const [k, v] of Object.entries(d.spent || {})) week[k] = (week[k] || 0) + v;
    for (const [k, v] of Object.entries(L.today || {})) week[k] = (week[k] || 0) + v;
    const weekTotal = Object.values(week).reduce((a, b) => a + b, 0);
    body.appendChild(profileCard({
      tone: '#e2b84c', avatar: '🪙', name: 'Services & spending',
      sub: 'Sellswords, feasts, blessings, training and journeys — and where the gold has gone.',
      stats: [
        { label: 'Gold', value: gold, color: 'var(--hi)' },
        { label: 'Daily costs', value: daily, tip: `Sellswords ${costs.mercs} · stipends ${costs.stipends} · shop upkeep ${costs.upkeep}` },
        { label: 'Spent (7 days)', value: weekTotal },
        { label: 'Safe from raids', value: vaultSafe(g), tip: 'Gold the Counting House keeps out of raiders’ reach' },
      ],
    }));
    const wrap = el('div', 'shops');
    const sect = (t, m) => el('div', 'shop-sect', sectHtml(t, m));
    const btn = (label, act, cost, tip = '', ok = true) => `<button class="act${ok && gold >= cost ? '' : ''}" ${act} ${ok && gold >= cost ? '' : 'disabled'} data-tipt="${esc(tip)}">${label}${cost ? ` <span class="cost">🪙${cost}</span>` : ''}</button>`;

    // Where it went
    if (weekTotal) {
      const cats = Object.entries(week).sort((a, b) => b[1] - a[1]);
      wrap.appendChild(sect('📊 Where the gold went', 'last 7 days'));
      wrap.appendChild(el('div', 'ledger', cats.map(([k, v]) => kbar(k[0].toUpperCase() + k.slice(1), v, cats[0][1], '#e2b84c', `${v}`)).join('')));
    }

    // Tavern
    const tav = builtLevel(g, 'tavern');
    wrap.appendChild(sect(`🍺 Tavern${tav ? ` <span class="lvl">L${tav}</span>` : ''}`, tav ? 'sellswords, rumours and feasts' : '<span class="need">needs a Tavern Board</span>'));
    const mercs = g.colonists.filter(c => c.merc);
    const S = shopsOf(g);
    const forHire = (S.tavern && S.tavern.mercs) || [];
    if (forHire.length) {
      const gr = el('div', 'tr-grid shop-grid');
      gr.innerHTML = forHire.map((n, i) => { const fee = mercFee(n); return `<div class="tr-item merc${gold >= fee ? '' : ' no'}" data-hire="${i}"><div class="tr-ic">${RACE_ICON[n.race] || '🧑'}</div><div class="tr-n">${esc(n.name.short)}</div><div class="tr-q">${CLASSES[n.klass].name} L${n.level} · ⚔️ ${powerOf(n)}</div><div class="tr-p">🪙 ${fee} + ${mercWage(n)}/day</div></div>`; }).join('');
      wrap.appendChild(gr);
    }
    const fc = festivalCost(g);
    const row = el('div', 'shop-row');
    row.innerHTML = btn('📣 Buy a rumour', 'data-svc="rumour"', RUMOUR_COST, 'Tonight’s wave comes out 12% smaller.', !!tav)
      + btn(`🎲 Hold a feast (${fc.food} food)`, 'data-svc="feast"', fc.gold, 'A day off: morale and joy for everyone. Once every five days.', true);
    wrap.appendChild(row);
    if (mercs.length) wrap.appendChild(el('div', 'shop-row', mercs.map(c => `<span class="chip">${RACE_ICON[c.race] || '🧑'} ${esc(c.name.short)} · 🪙${c.merc.wage}/day <button class="act danger small" data-dismiss="${c.id}">Dismiss</button></span>`).join('')));

    // Temple
    const tem = builtLevel(g, 'temple'), shr = builtLevel(g, 'shrine');
    wrap.appendChild(sect(`🙏 Temple${tem ? ` <span class="lvl">L${tem}</span>` : ''}`, tem || shr ? 'blessings for the camp' : '<span class="need">needs a Temple or Shrine</span>'));
    const brow = el('div', 'shop-row');
    brow.innerHTML = Object.entries(BLESSINGS).map(([id, B]) => {
      const on = g.blessings && g.blessings[id];
      return on ? `<span class="chip good">✨ ${B.name} · ${Math.max(0, on.until - g.day)}d left</span>` : btn(`✨ ${B.name}`, `data-bless="${id}"`, blessingCost(g, id), B.desc, !!(tem || shr || traderOf(g, 'pilgrims')));
    }).join('');
    wrap.appendChild(brow);
    if (tem >= 3 && g.graveyard.length) {
      const gr = el('div', 'shop-row');
      gr.innerHTML = '<span class="mini">Raise the dead:</span>' + g.graveyard.slice(-6).map((d, k) => { const i = g.graveyard.length - Math.min(6, g.graveyard.length) + k; return btn(`💀 ${esc(d.name.short)}`, `data-raise="${i}"`, raiseCost(d), `${d.name.full}, level ${d.level}`); }).join('');
      wrap.appendChild(gr);
    }

    // Training
    const school = builtLevel(g, 'combat_school') || builtLevel(g, 'mage_school') || tem || builtLevel(g, 'proving_grounds');
    wrap.appendChild(sect('🎯 Paid training', school ? 'a master’s time, once a day each' : '<span class="need">needs a school or the Proving Grounds</span>'));
    if (school) {
      const tr = el('div', 'shop-row');
      tr.innerHTML = g.colonists.filter(c => !c.away && !c.merc).sort((a, b) => b.level - a.level).slice(0, 10)
        .map(c => btn(`${esc(c.name.short)} L${c.level}`, `data-train="${c.id}"`, trainCost(c), 'About a third of a level of experience', (c.lastTrained || -1) < g.day)).join('');
      wrap.appendChild(tr);
    }

    // Packs: leather into loot. The bigger a delver's pack, the more comes out of the Rift per trip.
    wrap.appendChild(sect('🎒 Bigger packs', 'leather and cloth → more loot carried per delve'));
    const pk = el('div', 'shop-row');
    pk.innerHTML = g.colonists.filter(c => !c.dead && c.tree).sort((a, b) => b.level - a.level).slice(0, 10).map(c => {
      const lv = Math.round((c.packUpgrade || 0) / PACK_STEP), cost = packUpgradeCost(c);
      const can = lv < PACK_MAX && Object.entries(cost).every(([k, v]) => (g.resources[k] || 0) >= v);
      return `<button class="act" data-pack="${c.id}"${can ? '' : ' disabled'} data-tipt="${esc(`${c.name.short}'s pack holds ${packCap(c)}. ${lv >= PACK_MAX ? 'As big as it gets.' : `+${PACK_STEP} for ${cost.leather} leather and ${cost.cloth} cloth.`}`)}">🎒 ${esc(c.name.short)} ${'●'.repeat(lv)}${'○'.repeat(PACK_MAX - lv)}${lv < PACK_MAX ? ` · ${cost.leather}${RESOURCE_ICON.leather}` : ''}</button>`;
    }).join('') || '<span class="mini">Heroes carry packs; peasants don\'t delve.</span>';
    wrap.appendChild(pk);

    // Journeys
    const ow = g.overworld;
    const sites = ow ? ow.sites.filter(s => s.discovered && SITE_KINDS[s.kind].trade) : [];
    const party = [...this.squad].map(id => g.colonists.find(c => c.id === id)).filter(c => c && !c.away && !(c.mapId || 0));
    wrap.appendChild(sect('🗺️ Journeys', party.length ? `${party.map(c => esc(c.name.short)).join(', ')} would go` : 'select who goes on the colonist bar'));
    for (const j of g.journeys || []) {
      const site = ow.sites.find(s => s.id === j.site);
      wrap.appendChild(el('div', 'shop-row', `<span class="chip">🚶 ${j.ids.map(id => esc((g.colonists.find(c => c.id === id) || { name: { short: '?' } }).name.short)).join(', ')} → ${esc(site ? site.name : '?')} · ${ERRANDS[j.errand].name} · back in ${Math.max(1, Math.ceil((j.back - g.tick) / 60))}h</span>`));
    }
    for (const site of sites.slice(0, 8)) {
      const days = journeyDays(g, site), hostile = (site.hostility ?? 50) >= 75;
      const r = el('div', 'journey');
      const ids = party.map(c => c.id).join(',');
      const ok = party.length > 0;
      const stock = site.stock ? Object.entries(site.stock).filter(([, q]) => q >= 10).slice(0, 4) : [];
      r.innerHTML = `<div class="jn-h"><b>${SITE_ICON[site.kind] || '📍'} ${esc(site.name)}</b><span class="mini">${days} day${days === 1 ? '' : 's'} there and back · ${dispositionOf(site.hostility ?? 50).name}${site.allied ? ' · ally' : ''}</span></div>
        <div class="jn-a">${hostile ? btn('Tribute', `data-journey="${site.id}:tribute" data-ids="${ids}"`, errandCost(g, site, 'tribute'), ERRANDS.tribute.desc, ok)
          : ['recruit', 'heal', 'tribute', 'fund'].filter(e => e !== 'fund' || !site.allied).map(e => btn(ERRANDS[e].name, `data-journey="${site.id}:${e}" data-ids="${ids}"`, errandCost(g, site, e, party.map(c => c.id)), ERRANDS[e].desc, ok)).join('')
            + stock.map(([res, q]) => btn(`${RESOURCE_ICON[res] || ''} 20 ${RESOURCES[res].name}`, `data-journey="${site.id}:trade" data-goods="${res}" data-ids="${ids}"`, Math.ceil(PRICES[res] * 20 * 0.9), `Buy 20 at ${site.name}'s price (${q} there)`, ok)).join('')}</div>`;
      wrap.appendChild(r);
    }
    if (!sites.length) wrap.appendChild(el('div', 'mini', 'No settlements found yet — scouts chart the region at dawn.'));

    // Trading post orders
    const post = tradingPostLevel(g);
    wrap.appendChild(sect(`⚖️ Standing orders${post ? ` <span class="lvl">L${post}</span>` : ''}`, post ? 'the caravan fills these when it comes' : '<span class="need">needs a Trading Post</span>'));
    if (post) {
      const orders = g.orders || {};
      const tbl = el('div', 'orders');
      tbl.innerHTML = ['food', 'wood', 'stone', 'iron', 'cloth', 'leather', 'herbs'].map(res => {
        const o = orders[res] || {};
        return `<div class="ord"><span>${RESOURCE_ICON[res]} ${RESOURCES[res].name}</span>
          <span class="ord-c">keep ≥ <button class="act small" data-ord="${res}:min:-25">−</button><b>${o.min ?? '—'}</b><button class="act small" data-ord="${res}:min:25">+</button></span>
          <span class="ord-c">sell above <button class="act small" data-ord="${res}:max:-50">−</button><b>${o.max ?? '—'}</b><button class="act small" data-ord="${res}:max:50">+</button></span></div>`;
      }).join('');
      wrap.appendChild(tbl);
    }
    const ch = builtLevel(g, 'counting_house');
    wrap.appendChild(el('div', 'hint', ch ? `The Counting House keeps ${vaultSafe(g)} gold safe from raiders, and pays up to ${15 * ch} gold interest after a week without the camp being overrun.` : 'A Counting House (Coinage) keeps gold safe from raiders and pays interest in quiet weeks.'));

    wrap.onclick = (e) => {
      const b = e.target.closest && e.target.closest('button,[data-hire]');
      if (!b || b.disabled) return;
      const d = b.dataset;
      let r = null;
      if (d.hire != null) r = hireMerc(g, S.tavern, +d.hire);
      else if (d.svc === 'rumour') r = buyRumour(g);
      else if (d.svc === 'feast') r = festival(g);
      else if (d.dismiss) { dismissMerc(g, +d.dismiss); r = ''; }
      else if (d.bless) r = bless(g, d.bless);
      else if (d.raise) r = raiseDead(g, +d.raise);
      else if (d.train) r = paidTraining(g, +d.train);
      else if (d.pack) r = upgradePack(g, +d.pack);
      else if (d.journey) {
        const [sid, errand] = d.journey.split(':');
        const ids = (d.ids || '').split(',').filter(Boolean).map(Number);
        r = sendJourney(g, ids, +sid, errand, d.goods ? { [d.goods]: 20 } : null);
        if (!r) this.squad.clear();
      } else if (d.ord) {
        const [res, k, step] = d.ord.split(':');
        const o = { ...((g.orders || {})[res] || {}) };
        const next = (o[k] ?? (k === 'min' ? 0 : 100)) + +step;
        o[k] = next <= 0 && k === 'min' ? null : next;
        setOrder(g, res, o.min ?? null, o.max ?? null);
        r = '';
      } else return;
      if (r) this.toast(r, 'warn'); else if (r === '') this.flash('Done', 'good');
      this.sigs.drawer = null; this.renderDrawer(); this.renderTop();
    };
    body.appendChild(wrap);
  }

  /**
   * Colony › Workshop: everything the hold makes, and what it makes it from.
   * Making things first (forge, apothecary, magic), then the stores those draw
   * on: reagents and trophies, then the armory the forge fills.
   */
  drawWorkshopTab(body) {
    const g = this.game;
    const has = (id) => g.world.findBuildings(id).length > 0;
    const station = (id, name) => `<span style="color:${has(id) ? 'var(--good)' : 'var(--dim2)'}">${has(id) ? '✓' : '✗'} ${name}</span>`;
    const potions = POTION_IDS.reduce((s, id) => s + g.potionCount(id), 0);
    const reagents = Object.values(g.reagents || {}).reduce((s, v) => s + (v > 0 ? v : 0), 0);
    body.appendChild(profileCard({
      tone: '#c7743e', avatar: '⚒️',
      name: 'Workshop',
      sub: 'Everything the hold makes, and what it makes it from.',
      meta: [['', station('smithy', 'Smithy')], ['', station('alchemy', 'Alchemy Table')], ['', station('magic_lab', 'Magic Lab')], ['', station('spellmason', 'Spellmason')]],
      stats: [
        { label: 'Gear kits', value: Math.floor(g.resources.gear || 0), tip: 'Two forge a piece; one reinforces' },
        { label: 'Potions', value: potions },
        { label: 'Stash', value: g.armory.length, tip: 'Spare weapons and armour: Rift loot, forged pieces and gear taken off colonists' },
        { label: 'Reagents', value: reagents },
      ],
    }));
    this.drawWorkshop(body);
    this.drawMagic(body);
    const reag = Object.entries(g.reagents || {}).filter(([, v]) => v > 0);
    const tro = Object.entries(g.trophies || {}).filter(([, v]) => v > 0);
    body.appendChild(el('div', '', sectHtml('Reagents & trophies', reag.length + tro.length || '')));
    if (!reag.length && !tro.length) body.appendChild(el('div', 'mini', 'None yet. Monsters drop essences of their element; named ones leave trophies.'));
    else body.appendChild(el('div', 'ct-chips', [
      ...reag.map(([k, v]) => ESSENCES[k] ? `<span class="ct-chip" data-tipt="${ESSENCES[k].name}\nDropped by monsters of its element. Used for enchanting, spellcraft and ward potions.">${ESSENCES[k].icon} ${ESSENCES[k].name} <b>×${v}</b></span>` : `<span class="ct-chip">📕 ${k === 'class_tome' ? 'Class Tome' : esc(k)} <b>×${v}</b></span>`),
      ...tro.map(([k, v]) => `<span class="ct-chip good" data-tipt="${TROPHIES[k].name}\nA trophy from a named monster. Used in legendary crafting.">${TROPHIES[k].icon} ${TROPHIES[k].name} <b>×${v}</b></span>`),
    ].join('')));
    body.appendChild(el('div', '', sectHtml('🎒 Stash', `${g.armory.length} piece${g.armory.length === 1 ? '' : 's'}`)));
    if (!g.armory.length) body.appendChild(el('div', 'mini', 'Empty. Loot comes back from delves and beaten raids.'));
    else {
      const ag = el('div', 'tr-arm');
      g.armory.slice(0, 24).forEach((it, i) => {
        const R = RARITIES[it.rarity] || RARITIES.common;
        const t = el('div', 'tr-gear ' + it.kind);
        t.dataset.tip = 'arm:' + i;
        t.style.setProperty && t.style.setProperty('--rar', R.color);
        t.innerHTML = `<div class="tr-ic">${SLOT_ICONS[it.slot] || (it.kind === 'weapon' ? '⚔️' : '🛡️')}</div><div class="tr-n">${esc(it.name)}</div>
          <div class="tr-q">${it.dmg ? `${it.dmg[0]}–${it.dmg[1]} dmg` : it.armor ? `+${it.armor} armour` : esc(R.name || '')}</div>`;
        ag.appendChild(t);
      });
      body.appendChild(ag);
      body.appendChild(el('div', 'hint', 'Equip gear from a denizen’s Gear tab.'));
    }
  }

  /**
   * History as a timeline: days as chapter headings, events as beads on a
   * thread, each with its icon and hour. Filter chips cut it down to what you
   * are looking for.
   */
  drawLog(body) {
    const g = this.game;
    const icon = { good: '✅', warn: '⚠️', danger: '🔥', death: '💀', major: '📣', enemy: '⚔️', skill: '📈', info: '•' };
    const filters = [
      ['all', 'All', () => true], ['major', '📣 Major', (l) => l.kind === 'major'],
      ['good', '✅ Good', (l) => l.kind === 'good'], ['warn', '⚠️ Trouble', (l) => ['warn', 'danger'].includes(l.kind)],
      ['combat', '⚔️ Combat', (l) => l.kind === 'enemy' || /raid|attack|slain|kill|fight/i.test(l.text)],
      ['death', '💀 Deaths', (l) => l.kind === 'death'],
    ];
    const f = this.logFilter || 'all';
    body.appendChild(profileCard({
      slim: true, tone: '#9aa3ad', avatar: '📜',
      name: 'Chronicle',
      sub: `Everything the camp has lived through, newest first — day 1 to day ${g.day}.`,
      stats: [
        { label: 'Entries', value: g.logs.length },
        { label: 'Major', value: g.logs.filter(l => l.kind === 'major').length, color: 'var(--hi)' },
        { label: 'Trouble', value: g.logs.filter(l => ['warn', 'danger'].includes(l.kind)).length, color: 'var(--warn)' },
        { label: 'Deaths', value: g.logs.filter(l => l.kind === 'death').length, color: 'var(--danger)' },
      ],
    }));
    const bar = el('div', 'hs-filters');
    for (const [k, name, test] of filters) {
      const n = g.logs.filter(test).length;
      const b = el('button', k === f ? 'on' : '', `${name} <span>${n}</span>`);
      b.onclick = () => { this.logFilter = k; this.renderDrawer(); };
      bar.appendChild(b);
    }
    body.appendChild(bar);
    const test = (filters.find(x => x[0] === f) || filters[0])[2];
    const logs = g.logs.filter(test).slice(-150).reverse();
    if (!logs.length) { body.appendChild(el('div', 'mini', 'Nothing of that kind has happened yet.')); return; }
    const tl = el('div', 'hs-tl');
    let day = null;
    for (const l of logs) {
      if (l.day !== day) {
        day = l.day;
        const season = ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor(((day - 1) % 60) / 15)] || '';
        tl.appendChild(el('div', 'hs-day', `<span>Day ${day}</span><em>${SEASON_ICON[season] || ''} ${season}</em>`));
      }
      tl.appendChild(el('div', 'hs-ev ' + l.kind,
        `<span class="hs-dot">${icon[l.kind] || '•'}</span><span class="hs-hr">${String(l.hour ?? 0).padStart(2, '0')}:00</span><span class="hs-tx">${esc(l.text)}</span>`));
    }
    body.appendChild(tl);
  }

  // ----------------------------------------------------------- inspector --
  renderInspector() {
    const insp = $('#inspector');
    if (!this.sel) { insp.classList.add('hidden'); this.inspKey = ''; return; }
    // Don't pull a dropdown out from under someone picking from it.
    const act = document.activeElement;
    if (act && act.tagName === 'SELECT' && insp.contains(act)) return;
    const key = this.selTipKey() || this.sel.kind;
    const opening = insp.classList.contains('hidden') || key !== this.inspKey;
    this.inspKey = key;
    if (opening) { this.noteTipRect(); if (this.tipSrc === 'map') this.hideTip(); }
    insp.classList.remove('hidden');
    const g = this.game;
    this.portrait('');
    $('#inspector .insp-body').onclick = null;   // a merchant's delegate mustn't outlive it
    if (this.sel.kind === 'squad') this.inspSquad();
    else if (this.sel.kind === 'colonist') {
      const c = g.colonists.find(x => x.id === this.sel.id);
      if (!c) { this.closeInspector(); return; }
      this.inspColonist(c);
    } else if (this.sel.kind === 'tile') this.inspTile(this.sel.x, this.sel.y);
    else if (this.sel.kind === 'enemy') this.inspEnemy(this.sel.ref);
    else if (this.sel.kind === 'beast') this.inspBeast(this.sel.ref);
    else if (this.sel.kind === 'site') this.inspSite(this.sel.ref);
    else if (this.sel.kind === 'history') this.inspHistory(this.sel.ref);
    this.placeInspector();
    if (opening) this.animateInspectorOpen();
  }

  /** The hover-card key for what the inspector shows, so the two never double up. */
  selTipKey() {
    const s = this.sel;
    if (!s) return '';
    if (s.kind === 'colonist') return 'col:' + s.id;
    if (s.kind === 'enemy') return 'enemy:' + (s.ref && s.ref.id);
    if (s.kind === 'beast') return 'beast:' + s.id;
    if (s.kind === 'tile') { const w = this.mv.world; return w.isRift && w.isRift(s.x, s.y) ? 'rift' : 'tile:' + s.x + ',' + s.y; }
    return '';
  }

  /** The framed portrait in the inspector header; a ring shows the key reading. */
  portrait(icon, color, frac) {
    const head = $('#inspector .insp-head');
    if (!head) return;
    let p = head.querySelector('.insp-pt');
    if (!p || !p.classList) return;
    p.innerHTML = icon ? `<span>${icon}</span>` : '';
    p.style.display = icon ? '' : 'none';
    if (p.style.setProperty) { p.style.setProperty('--c', color || '#6a7077'); p.style.setProperty('--f', Math.round((frac ?? 1) * 360) + 'deg'); }
    // The cover strip over the portrait wears the same colour as its ring.
    if (head.style && head.style.setProperty) head.style.setProperty('--c', icon ? (color || '#6a7077') : '#6a7077');
  }

  setTabs(names) {
    const t = $('#inspector .tabs');
    const label = { overview: 'Overview', skills: 'Skills', gear: 'Gear', class: '🎓 Class' };
    // The Class tab lights up when there's a choice waiting in it.
    const sc = this.sel && this.sel.kind === 'colonist' && this.game.colonists.find(x => x.id === this.sel.id);
    if (sc && names.includes('class') && ((sc.tree && pointsFree(sc) > 0) || (!sc.training && !sc.tree && this.classOptions(sc).some(o => o.ready)))) label.class = '🎓 Class <i class="tab-dot"></i>';
    t.innerHTML = names.map(n => `<button data-tab="${n}" class="${this.tab === n ? 'on' : ''}">${label[n] || n}</button>`).join('');
    t.style.display = names.length ? '' : 'none';
    t.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; this.tab = b.dataset.tab; this.renderInspector(); };
  }

  /** Enrol at a school or read a Class Tome: the ways to change class. */
  classChangeHtml(c) {
    const g = this.game;
    if (c.training) {
      const t = c.training, pct = Math.round(t.progress / t.need * 100);
      return `<div class="sect">Training</div><div class="mini">Becoming a <b>${esc(CLASSES[t.klass].name)}</b> — ${pct}%${t.tome ? ' (reading a Class Tome)' : t.teacher ? ' (with an instructor: double pace)' : ' (self-study: find an instructor of level 5+)'}.</div>
        <div class="ct-row"><button class="ct-tac" data-cancel="1">Stop training</button></div>`;
    }
    const opts = this.classOptions(c);
    const tomes = g.reagents.class_tome || 0;
    // Every class shows, grouped by where it's taught — a locked one says how
    // to open it, so the way to a Fighter is never a mystery.
    const bySchool = {};
    for (const o of opts) (bySchool[o.school] || (bySchool[o.school] = [])).push(o);
    const groups = Object.entries(bySchool).map(([school, list]) => {
      const S = SCHOOLS[school];
      const head = g.hasSchool(school) ? `🏫 ${esc(S.name)}` : tomes ? `📕 Class Tome (no ${esc(S.name)} yet)` : `🔒 ${esc(S.name)}`;
      return `<div class="ct-row"><span class="mini">${head}</span>${list.map(o =>
        `<button class="ct-tac${o.ready ? ' ready' : ''}" data-enroll="${o.k}" ${o.why ? `disabled data-tipt="${esc(o.why)}"` : `data-tipt="${esc(o.how)}"`}>${esc(CLASSES[o.k].name)}${o.via === 'tome' ? ' 📕' : ''}</button>`).join('')}</div>`;
    });
    const readyN = opts.filter(o => o.ready).length;
    const tomeLine = tomes ? `<div class="mini">📕 ${tomes} Class Tome${tomes > 1 ? 's' : ''} in the stash — any class, one day's reading, no school needed.</div>` : '';
    return `<div class="sect">${c.tree ? 'Change class' : 'Become a hero'}${readyN ? ` <em>${readyN} open</em>` : ''}</div>${tomeLine}${groups.join('')}
      ${c.tree ? '<div class="mini">Changing keeps level and refunds skill points, at a mood cost.</div>' : ''}`;
  }
  /**
   * Every class this colonist could take, and how: at a school, from a tome,
   * or why not yet (attribute too low, no school, no tome). Shared by the
   * colonist's Class tab and the People › Classes list.
   */
  classOptions(c) {
    const g = this.game;
    const tomes = g.reagents.class_tome || 0;
    return Object.keys(CLASS_INFO).filter(k => k !== c.klass).map(k => {
      const school = CLASS_INFO[k].school, S = SCHOOLS[school];
      const req = classRequirement(c, k);
      const has = g.hasSchool(school);
      const via = has ? 'school' : tomes ? 'tome' : null;
      const unlockTech = unlockerOf(S.building);
      const noWay = !via ? (g.unlocked.has(S.building) ? `Build a ${S.name} to train this class, or find a Class Tome in the Rift.`
        : `Research ${RESEARCH[unlockTech] ? RESEARCH[unlockTech].name : 'more'}, then build a ${S.name} — or find a Class Tome in the Rift.`) : '';
      const why = req || noWay;
      const how = via === 'school' ? `Train at the ${S.name}: ${S.days} days, halved with an instructor of level 5+.` : 'Read a Class Tome: one day, no school needed.';
      return { k, school, via, why, how, ready: !why };
    });
  }
  classChangeClick(e, c) {
    const en = e.target.closest('[data-enroll]'), cn = e.target.closest('[data-cancel]');
    if (!en && !cn) return false;
    const g = this.game;
    if (cn) this.act(g, 'cancelTraining', c.id);
    else {
      const k = en.dataset.enroll;
      const r = g.hasSchool(CLASS_INFO[k].school) ? this.act(g, 'enroll', c.id, k) : this.act(g, 'readTome', c.id, k);
      if (r) this.toast(r, 'warn');
    }
    this.sigs.insp = null; this.renderInspector();
    return true;
  }

  /** Library, peddler, spellmason and the Magic Lab's spell designer. */
  drawMagic(body) {
    const g = this.game;
    const scrolls = Object.entries(g.library.scrolls).filter(([, n]) => n > 0), books = Object.entries(g.library.books).filter(([, n]) => n > 0);
    const lab = g.world.findBuildings('magic_lab').length > 0, mason = g.world.findBuildings('spellmason').length > 0;
    if (!g.peddler && !mason && !lab && !scrolls.length && !books.length) return;
    body.appendChild(el('div', '', sectHtml('📚 Spell library', `${scrolls.length + books.length} kinds`)));
    body.appendChild(el('div', 'mini', 'Scrolls go on potion belts (one cast each); spellbooks are learned from a colonist’s Class tab.'));
    const lib = el('div', 'ws-row');
    lib.innerHTML =
      (scrolls.map(([id, n]) => `<span class="ct-chip" data-tip="ability:${id}">📜 ${esc(ABILITIES[id].name)} ×${n}</span>`).join('') +
       books.map(([id, n]) => `<span class="ct-chip good" data-tip="ability:${id}">📘 ${esc(ABILITIES[id].name)} ×${n}${mason ? ` <a data-copy="${id}">copy</a> · <a data-sell="${id}">sell</a>` : ''}</span>`).join('') || '<span class="mini">empty</span>');
    body.appendChild(lib);
    const shop = (label, from, stock) => {
      if (!stock) return;
      const items = [];
      for (const [kind, icon] of [['books', '📘'], ['scrolls', '📜'], ['potions', '🧪'], ['reagents', '✨']]) for (const [id, n] of Object.entries(stock[kind])) {
        if (!(n > 0)) continue;
        const nm = kind === 'potions' ? POTIONS[id].name : kind === 'reagents' ? (id === 'class_tome' ? 'Class Tome' : ESSENCES[id].name) : ABILITIES[id].name;
        const price = kind === 'books' ? bookPrice(id) : kind === 'scrolls' ? scrollPrice(id) : kind === 'reagents' ? (id === 'class_tome' ? 400 : 25) : 30;
        items.push(`<button class="ws-pot" data-buy="${from}|${kind}|${id}" ${kind === 'books' || kind === 'scrolls' ? `data-tip="ability:${id}"` : ''}><span>${icon}</span><b>${esc(nm)}</b><em>${Math.round(price * (from === 'spellmason' ? 1.1 : 1))}g</em></button>`);
      }
      body.appendChild(el('div', '', sectHtml(label[0], label[1])));
      body.appendChild(el('div', 'ws-grid', items.join('') || '<span class="mini">sold out</span>'));
    };
    shop(['🧙 Arcane peddler', 'here for a little while'], 'peddler', g.peddler && g.peddler.stock);
    if (mason) shop(['📜 Spellmason', 'restocks weekly'], 'spellmason', g.spellmasonStock);
    if (lab) {
      const d = this.spellDraft || (this.spellDraft = { form: 'bolt', element: 'fire', mods: [], name: '' });
      const b = spellBudget(d.form, d.element, d.mods);
      const opt = (kind, table, cur) => Object.entries(table).map(([id, x]) => {
        const known = g.spellParts[kind].includes(id);
        return `<button class="ct-tac${cur.includes(id) ? ' on' : ''}" data-part="${kind}|${id}" data-tipt="${esc(x.name)}${x.desc ? '\n' + esc(x.desc) : ''}${x.budget ? '\nBudget ' + x.budget : ''}${known ? '' : '\nResearch: ' + partCost(kind, id) + ' Insight'}">${known ? '' : '🔒 '}${esc(x.name)}</button>`;
      }).join('');
      const cost = writeCost(d.form, d.element, d.mods);
      const lab2 = el('div', 'ws-lab');
      body.appendChild(el('div', '', sectHtml('⚗️ Magic Lab', 'design a spellbook')));
      lab2.innerHTML = `<div class="mini">A form, an element, up to two modifiers; budget 100. Locked parts cost Insight to research.</div>
        <div class="ct-row"><span class="mini">Form</span>${opt('forms', SPELL_FORMS, [d.form])}</div>
        <div class="ct-row"><span class="mini">Element</span>${opt('elements', SPELL_ELEMENTS, [d.element])}</div>
        <div class="ct-row"><span class="mini">Modifiers</span>${opt('mods', SPELL_MODS, d.mods)}</div>
        <div class="ct-row"><span class="mini">Budget</span><div class="ct-xp" style="flex:1"><i style="width:${Math.min(100, b.total)}%;background:${b.ok ? '#7aa8e0' : '#e04a4a'}"></i></div><b>${b.total}/100</b></div>
        <div class="ct-row"><button class="act primary" data-write="1" ${b.ok ? '' : 'disabled'}>Write the book — ${Object.entries(cost).map(([k, v]) => v + ' ' + k).join(', ')}</button></div>`;
      body.appendChild(lab2);
    }
    this.magicClick = (e) => {
      const buy = e.target.closest('[data-buy]'), cp = e.target.closest('[data-copy]'), sl = e.target.closest('[data-sell]'), pt = e.target.closest('[data-part]'), wr = e.target.closest('[data-write]');
      let r = null;
      if (buy) { const [from, kind, id] = buy.dataset.buy.split('|'); r = this.act(g, 'buyMagic', from, kind, id); }
      else if (cp) r = this.act(g, 'copyBook', cp.dataset.copy);
      else if (sl) r = this.act(g, 'sellBook', sl.dataset.sell);
      else if (pt) {
        const [kind, id] = pt.dataset.part.split('|');
        if (!g.spellParts[kind].includes(id)) r = this.act(g, 'researchPart', kind, id);
        else {
          const d = this.spellDraft;
          if (kind === 'forms') d.form = id; else if (kind === 'elements') d.element = id;
          else d.mods = d.mods.includes(id) ? d.mods.filter(m => m !== id) : [...d.mods, id].slice(-2);
        }
      } else if (wr) {
        const d = this.spellDraft;
        const name = `${SPELL_ELEMENTS[d.element].name} ${SPELL_FORMS[d.form].name}${d.mods.length ? ' of ' + d.mods.map(m => SPELL_MODS[m].name).join(' ') : ''}`;
        r = this.act(g, 'designSpell', name, d.form, d.element, d.mods);
      } else return false;
      if (r) this.toast(r, 'warn');
      this.sigs.drawer = null; this.renderDrawer();
      return true;
    };
  }

  /** Smithy forging, trophy legendaries and the apothecary, in one place. */
  drawWorkshop(body) {
    const g = this.game;
    const smithy = g.world.findBuildings('smithy').length > 0;
    const lab = g.world.findBuildings('alchemy').length > 0;
    // A station that is not built yet says so in its heading, in warning
    // colour, instead of leaving a grid of mysteriously dead buttons.
    const need = (what) => `<span class="need">needs ${what}</span>`;
    const kits = Math.floor(g.resources.gear || 0);
    // The forge's consistent tiers: the same piece every time, for gold and metal.
    const smLv = builtLevel(g, 'smithy');
    body.appendChild(el('div', '', sectHtml(`⚒️ Forge tiers${smLv ? ` <span class="lvl">L${smLv}</span>` : ''}`, smithy ? 'the same piece every time — pick who it’s for' : need('a Smithy'))));
    if (smithy) {
      const who = this.forgeFor != null ? g.colonists.find(c => c.id === this.forgeFor) : null;
      const pick = el('div', 'ws-row');
      pick.innerHTML = `<label class="mini">For <select data-forgefor><option value="">the stash</option>${g.colonists.filter(c => !c.dead).map(c => `<option value="${c.id}"${who && who.id === c.id ? ' selected' : ''}>${esc(c.name.short)} · ${esc(c.title || CLASSES[c.klass].name)}</option>`).join('')}</select></label>`;
      body.appendChild(pick);
      const tbl = el('div', 'forge-grid');
      tbl.innerHTML = `<span></span>${FORGE_SLOTS.map(sl => `<span class="fg-h">${SLOT_ICONS[sl]} ${SLOT_NAMES[sl]}</span>`).join('')}`
        + Object.keys(FORGE_TIERS).map(tid => `<span class="fg-t">${FORGE_TIERS[tid].name}</span>` + FORGE_SLOTS.map(sl => {
          const why = forgeBlocker(g, tid, sl);
          const cost = forgeCost(tid, sl);
          const mats = Object.entries(cost).filter(([k]) => k !== 'gold').map(([k, v]) => `${v} ${RESOURCES[k] ? RESOURCES[k].name.toLowerCase() : k}`).join(', ');
          return `<button class="act small${why ? '' : ' primary'}" data-ftier="${tid}:${sl}" ${why ? 'disabled' : ''} data-tipt="${esc(`${FORGE_TIERS[tid].name} ${SLOT_NAMES[sl].toLowerCase()} — ${cost.gold} gold and ${mats}` + '\n' + (why || 'Click to forge'))}">🪙 ${cost.gold}</button>`;
        }).join('')).join('');
      body.appendChild(tbl);
      pick.querySelector('select').onchange = (e) => { this.forgeFor = e.target.value ? +e.target.value : null; this.sigs.drawer = null; };
    }
    body.appendChild(el('div', '', sectHtml('🎲 Gear kits', smithy ? `2 kits forge a random piece · you have ${kits}` : need('a Smithy'))));
    const forge = el('div', 'ws-row');
    forge.innerHTML = SLOTS.filter(s2 => s2 !== 'charm').map(s2 => `<button class="act" data-forge="${s2}" ${smithy && kits >= 2 ? '' : 'disabled'} data-tipt="${smithy ? 'Forge a random ' + SLOT_NAMES[s2].toLowerCase() + ' piece. A smith with skill 15+ rolls better rarity.' : 'Needs a smithy.'}">${SLOT_ICONS[s2]} ${SLOT_NAMES[s2]}</button>`).join('');
    body.appendChild(forge);
    const known = Object.entries(LEGENDARY_RECIPES).filter(([, r]) => (g.trophies[r.trophy] || 0) > 0);
    if (known.length) {
      body.appendChild(el('div', '', sectHtml('✨ Legendary', smithy ? 'a trophy plus materials' : need('a Smithy'))));
      const leg = el('div', 'ws-row');
      leg.innerHTML = known.map(([id, r]) => {
        const afford = Object.entries(r.cost).every(([k, v]) => (g.resources[k] || 0) >= v);
        return `<button class="act${afford && smithy ? ' primary' : ''}" data-legend="${id}" ${afford && smithy ? '' : 'disabled'} data-tipt="${esc(LEGENDARIES[id].name)}\n${esc(LEGENDARIES[id].desc)}\nCosts the trophy + ${Object.entries(r.cost).map(([k, v]) => v + ' ' + k).join(', ')}${smithy ? '' : '\nNeeds a smithy.'}">${esc(LEGENDARIES[id].name)}</button>`;
      }).join('');
      body.appendChild(leg);
    }
    body.appendChild(el('div', '', sectHtml('🧪 Brewing', lab ? 'click to brew one · number is how many you hold' : need('an Alchemy Table'))));
    const apo = el('div', 'ws-grid');
    apo.innerHTML = POTION_IDS.map(id => {
      const P = POTIONS[id];
      const n = g.potionCount(id);
      return `<button class="ws-pot" data-brew="${id}" ${lab ? '' : 'disabled'} data-tip="potion:${id}"><span>${P.icon}</span><b>${esc(P.name)}</b><em class="${n ? '' : 'zero'}">${n}</em></button>`;
    }).join('');
    body.appendChild(apo);
    if (lab) body.appendChild(el('div', 'hint', 'Wards and throwables need essences from monsters.'));
    this.magicClick = null;
    body.onclick = (e) => {
      if (this.magicClick && this.magicClick(e)) return;
      const f = e.target.closest('[data-forge]'), l = e.target.closest('[data-legend]'), br = e.target.closest('[data-brew]'), ft = e.target.closest('[data-ftier]');
      let r = null;
      if (ft) { const [tid, sl] = ft.dataset.ftier.split(':'); r = forgeTier(g, sl, tid, this.forgeFor); }
      else if (f) r = this.act(g, 'forge', f.dataset.forge);
      else if (l) r = this.act(g, 'craftLegendary', l.dataset.legend);
      else if (br) r = this.act(g, 'brew', br.dataset.brew);
      else return;
      if (r) this.toast(r, 'warn');
      this.sigs.drawer = null; this.renderDrawer();
    };
  }

  /** The character sheet: six slots, stats, traits, abilities, potion belt, armory. */
  drawGearTab(b, c) {
    const g = this.game;
    const slotHtml = (sl) => {
      const it = c.equipment[sl];
      const R = it ? (RARITIES[it.rarity] || RARITIES.common) : null;
      const line = !it ? '' : it.dmg ? `${it.dmg[0]}–${it.dmg[1]} dmg${it.element ? ' ' + DAMAGE_TYPES[it.element].icon : ''}` : it.armor ? `+${it.armor} armour` : it.mods && it.mods.spell ? `+${Math.round(it.mods.spell * 100)}% spell` : '';
      return `<div class="gs-slot${it ? '' : ' empty'}" ${it ? `data-tip="eq:${c.id}:${sl}" data-unequip="${sl}"` : `data-tipt="${SLOT_NAMES[sl]}: nothing equipped"`} style="${R ? `border-color:${R.color}55` : ''}">
        <div class="gs-ic">${SLOT_ICONS[sl]}</div><div class="gs-b"><em>${SLOT_NAMES[sl]}</em><b style="${R ? `color:${R.color}` : ''}">${it ? esc(it.name) : 'empty'}</b><span>${line}${it && it.passive ? ' ✦' : ''}${it && it.grants ? ' ✨' : ''}</span></div></div>`;
    };
    const size = beltSize(c);
    const belt = (c.belt || []).slice(0, size);
    const scrollIds = Object.keys(g.library.scrolls).filter(id => g.library.scrolls[id] > 0).map(id => 'scroll:' + id);
    const options = (cur) => `<option value="">— empty —</option>` + POTION_IDS.map(id => `<option value="${id}"${cur === id ? ' selected' : ''}>${POTIONS[id].icon} ${POTIONS[id].name} (${g.potionCount(id)})</option>`).join('') + scrollIds.map(id => `<option value="${id}"${cur === id ? ' selected' : ''}>📜 ${ABILITIES[id.slice(7)].name} (${g.potionCount(id)})</option>`).join('');
    b.innerHTML = `<div class="gs-slots six">${SLOTS.map(slotHtml).join('')}</div>
      <div class="hint">Click an equipped item to take it off. Weapons and shields are class-locked; armour is not — its weight costs speed and evasion, less so for classes trained in it (${esc(c.combat.weight || 'none')} worn).</div>
      <div class="gs-stats">
        <div data-tipt="Accuracy — bonus to hit"><span>🎯</span><b>+${c.combat.acc}</b><em>Accuracy</em></div>
        <div data-tipt="Armour — physical damage shrugged off"><span>🛡️</span><b>${c.combat.armor}</b><em>Armour</em></div>
        <div data-tipt="Defence — how hard they are to hit"><span>💨</span><b>${c.combat.def}</b><em>Defence</em></div>
        <div data-tipt="Initiative — who acts first"><span>⚡</span><b>${c.combat.init >= 0 ? '+' : ''}${c.combat.init}</b><em>Initiative</em></div>
        <div data-tipt="Front row holds the line; back row is safe from melee while it holds"><span>🧭</span><b>${c.combat.row === 'front' ? 'Front' : 'Back'}</b><em>${esc(c.combat.role)}</em></div>
        <div data-tipt="Damage type of their basic attack"><span>${DAMAGE_TYPES[c.combat.dmgType] ? DAMAGE_TYPES[c.combat.dmgType].icon : '⚔️'}</span><b>${DAMAGE_TYPES[c.combat.dmgType] ? DAMAGE_TYPES[c.combat.dmgType].name : '—'}${c.combat.dmgElement ? ' + ' + DAMAGE_TYPES[c.combat.dmgElement].icon : ''}</b><em>${c.combat.range === 'melee' ? (c.combat.reach ? 'Melee · reach' : 'Melee') : 'Ranged'}</em></div>
        ${c.combat.spellPower ? `<div data-tipt="Spell power from gear"><span>🔮</span><b>+${Math.round(c.combat.spellPower * 100)}%</b><em>Spells</em></div>` : ''}
        <div data-tipt="Overall combat power"><span>⚔️</span><b>${powerOf(c)}</b><em>Power</em></div>
      </div>
      ${combatTraitsHtml(c.combat)}
      <div class="sect">Abilities</div>
      <div class="gs-abil">${[...c.abilities, ...(c.combat.gearAbilities || [])].map((a, i) => `<div data-tip="ability:${a}"><span>${i >= c.abilities.length ? '💍' : ABILITIES[a].dmg && DAMAGE_TYPES[ABILITIES[a].dmg] ? DAMAGE_TYPES[ABILITIES[a].dmg].icon : '✨'}</span>${esc(ABILITIES[a].name)}</div>`).join('')}</div>
      <div class="sect">Potion belt <span class="mini">— packed from the stash when a delve leaves</span></div>
      <div class="gs-belt">${Array.from({ length: size }, (_, i) => `<select data-belt="${i}">${options(belt[i])}</select>`).join('')}</div>
      <div class="sect">Stash (${g.armory.length})</div><div id="armory"></div>`;
    b.querySelectorAll('[data-belt]').forEach(sel => sel.onchange = () => {
      const nb = [...(c.belt || [])];
      nb[+sel.dataset.belt] = sel.value || undefined;
      c.belt = nb.filter(Boolean);
      this.sigs.insp = null; this.renderInspector();
    });
    b.querySelectorAll('[data-unequip]').forEach(d => d.onclick = () => { this.act(g, 'unequip', c.id, d.dataset.unequip); this.sigs.insp = null; this.renderInspector(); });
    const box = b.querySelector('#armory');
    if (!g.armory.length) box.appendChild(el('div', 'mini', 'Empty. Loot comes back from delves and raids; a smithy forges more.'));
    // Best first: what would help this character most.
    const rows = g.armory.map((it, i) => ({ it, i, why: canEquip(c, it), gain: itemScore(c, it) - itemScore(c, c.equipment[it.slot || (it.kind === 'weapon' ? 'weapon' : 'armor')]) }))
      .sort((x, y) => (x.why ? 1 : 0) - (y.why ? 1 : 0) || y.gain - x.gain);
    for (const { it, i, why, gain } of rows.slice(0, 30)) {
      const R = RARITIES[it.rarity] || RARITIES.common;
      const row = el('div', 'row arm-row' + (why ? ' cant' : ''));
      row.dataset.tip = 'arm:' + i;
      const sl = it.slot || (it.kind === 'weapon' ? 'weapon' : 'armor');
      row.innerHTML = `<span class="k">${SLOT_ICONS[sl]} <b style="color:${R.color}">${esc(it.name)}</b>${!why ? ` <span class="mini" style="color:${gain > 0 ? 'var(--good)' : 'var(--dim2)'}">${gain > 0 ? '▲' : '▼'}${Math.abs(Math.round(gain))}</span>` : ''}</span>`;
      const btn = el('button', 'act', why ? 'Can’t' : 'Equip');
      if (why) { btn.disabled = true; btn.dataset.tipt = why; }
      btn.onclick = () => { const r = this.act(g, 'equip', c.id, i); if (r) this.toast(r, 'warn'); this.sigs.insp = null; this.renderInspector(); };
      row.appendChild(btn);
      box.appendChild(row);
    }
    if ((g.resources.gear || 0) > 0) {
      const up = el('button', 'act primary', `Reinforce a piece (1 gear kit, ${Math.floor(g.resources.gear)} left)`);
      up.onclick = () => { this.act(g, 'upgradeGear', c.id); this.sigs.insp = null; this.renderInspector(); };
      b.appendChild(up);
    }
  }

  /**
   * The class tab: XP, points, the four combat slots, tactics, and the tree —
   * one column per active, its four specialisations beneath it.
   */
  drawClassTab(b, c) {
    const info = CLASS_INFO[c.klass];
    if (!c.tree) {
      // A peasant's Class tab is about one thing: which hero they could become.
      b.innerHTML = `<div class="mini">${esc(c.title || CLASSES[c.klass].name)}s have no skill tree and don't fight well. A class gives them one: skills, abilities and better gear.</div>`
        + this.classChangeHtml(c)
        + this.fold('peasant-abil', 'Current abilities', `<div class="gs-abil">${c.abilities.map(a => `<div data-tip="ability:${a}"><span>✨</span>${esc(ABILITIES[a].name)}</div>`).join('')}</div>`);
      b.onclick = (e) => this.classChangeClick(e, c);
      return;
    }
    const free = pointsFree(c);
    const need = xpToNext(c.level);
    const t = c.tree;
    const nodes = treeNodes(c.klass);
    const tacticNames = { auto: 'Auto', aggressive: 'Aggressive', defensive: 'Defensive', support: 'Support' };
    let html = `<div class="ct-head">
        <div><b>${esc(CLASSES[c.klass].name)}</b> · level ${c.level}${c.level >= LEVEL_CAP ? ' (max)' : ''}
          <div class="ct-xp" data-tipt="${Math.round(c.delveXp || 0)} / ${need} XP to the next level"><i style="width:${Math.min(100, Math.round((c.delveXp || 0) / need * 100))}%"></i></div></div>
        <div class="ct-pts${free ? ' has' : ''}" data-tipt="One point per level. Each tier offers twenty nodes; you may take ten.">${free} point${free === 1 ? '' : 's'}</div>
      </div>
      <div class="ct-row"><span class="mini">Combat slots</span>${Array.from({ length: LOADOUT_SLOTS }, (_, i) => {
        const id = t.loadout[i];
        return id ? `<span class="ct-slot on" data-lo="${id}" data-tip="ability:${id}">${esc(ABILITIES[id].name)}</span>` : '<span class="ct-slot">empty</span>';
      }).join('')}</div>
      <div class="hint">Click an unlearned node to spend a point. Click a learned ability to slot or unslot it — only the four slotted abilities are used in a fight.</div>
      <div class="ct-row"><span class="mini">Tactics</span>${Object.entries(tacticNames).map(([k, v]) => `<button class="ct-tac${(c.tactics || 'auto') === k ? ' on' : ''}" data-tac="${k}">${v}</button>`).join('')}</div>`;
    tiersOf(c.klass, t.prestige).forEach((tier, ti) => {
      const open = tierOpen(c, ti);
      const owned = t.owned.filter(id => nodeTier(c.klass, id, t.prestige) === ti).length - (nodeTier(c.klass, TREES[c.klass].base, t.prestige) === ti ? 1 : 0);
      html += `<div class="ct-tier${open ? '' : ' locked'}"><div class="ct-th">Tier ${ti + 1} · levels ${TIER_LEVELS[ti]}${ti < 3 ? '–' + (TIER_LEVELS[ti + 1] - 1 + (ti === 0 ? 0 : 0)) : '–40'} <span>${owned}/${TIER_CAP} chosen${open ? '' : ' · opens at level ' + TIER_LEVELS[ti]}</span></div><div class="ct-cols">`;
      for (const a of tier) {
        const have = t.owned.includes(a.id), base = TREES[c.klass].base === a.id;
        const why = canBuy(c, a.id);
        const ab = ABILITIES[a.id];
        const dt = ab.dmg && DAMAGE_TYPES[ab.dmg];
        html += `<div class="ct-col"><button class="ct-node act${have ? ' own' : !why ? ' buy' : ''}${t.loadout.includes(a.id) ? ' slot' : ''}" data-node="${a.id}" data-tip="ability:${a.id}">
            <span>${dt ? dt.icon : '✨'}</span>${esc(ab.name)}${base ? ' <em>base</em>' : ''}</button>`;
        a.specs.forEach((sp, k) => {
          const nid = `${a.id}.${k}`, hv = t.owned.includes(nid), w = canBuy(c, nid);
          html += `<button class="ct-node spec${hv ? ' own' : !w ? ' buy' : ''}" data-node="${nid}" data-tipt="${esc(sp.name)}\n${esc(sp.desc)}${hv ? '' : w ? '\n' + esc(w) : '\nClick to learn (1 point).'}">${esc(sp.name)}</button>`;
        });
        html += `</div>`;
      }
      html += `</div></div>`;
    });
    // Prestige: two paths, chosen at level 20 once the school's upgrade stands.
    const pr = PRESTIGE[c.klass] || [];
    if (!t.prestige) {
      const academy = this.game.hasSchool(info.school, true);
      const ready = c.level >= TIER_LEVELS[2] && academy;
      html += `<div class="ct-tier${ready ? '' : ' locked'}"><div class="ct-th">Tiers 3–4 · prestige <span>${academy ? '' : esc(SCHOOLS[info.school].upgrade) + ' required · '}level ${TIER_LEVELS[2]}+</span></div>
        <div class="ct-cols two">${pr.map(p2 => `<button class="ct-node act${ready ? ' buy' : ''}" data-prestige="${p2.id}" data-tipt="${esc(p2.name)}\n${esc(p2.desc)}\n${(PRESTIGE_PATHS[c.klass][p2.id].actives || []).map(a => a.name).join(', ')}">${esc(p2.name)}<em> — ${esc(p2.desc)}</em></button>`).join('')}</div></div>`;
    } else html += `<div class="mini">Prestige: <b>${esc(pr.find(p2 => p2.id === t.prestige).name)}</b></div>`;
    // Learned spells and the library's spellbooks.
    const books = Object.entries(this.game.library.books).filter(([, n]) => n > 0);
    if ((c.learned || []).length || books.length) {
      html += `<div class="sect">Spellbooks</div>`;
      if ((c.learned || []).length) html += `<div class="ct-row"><span class="mini">Learned</span>${c.learned.map(id => `<span class="ct-slot${t.loadout.includes(id) ? ' on' : ''}" data-lo="${id}" data-tip="ability:${id}">${esc(ABILITIES[id].name)}</span>`).join('')}</div>`;
      if (books.length) html += `<div class="ct-row"><span class="mini">In the library</span>${books.map(([id, n]) => { const w = bookRequirement(c, id); return `<button class="ct-tac" data-learn="${id}" ${w ? `disabled data-tipt="${esc(w)}"` : `data-tip="ability:${id}"`}>📘 ${esc(ABILITIES[id].name)} ×${n}</button>`; }).join('')}</div>`;
    }
    html += this.classChangeHtml(c);
    html += `<div class="ct-row"><button class="act" data-respec="1">Respec — ${c.level * 20} gold</button></div>`;
    b.innerHTML = html;
    b.onclick = (e) => {
      const nb = e.target.closest('[data-node]'), lo = e.target.closest('[data-lo]'), tac = e.target.closest('[data-tac]'), rs = e.target.closest('[data-respec]');
      const ps = e.target.closest('[data-prestige]'), ln = e.target.closest('[data-learn]');
      if (this.classChangeClick(e, c)) return;
      if (ps) { const r = this.act(this.game, 'choosePrestige', c.id, ps.dataset.prestige); if (r) { this.toast(r, 'warn'); return; } }
      else if (ln) { const r = this.act(this.game, 'learnBook', c.id, ln.dataset.learn); if (r) { this.toast(r, 'warn'); return; } }
      else if (tac) { c.tactics = tac.dataset.tac; }
      else if (lo) { toggleLoadout(c, lo.dataset.lo); }
      else if (rs) {
        const cost = c.level * 20;
        if ((this.game.resources.gold || 0) < cost) { this.toast(`Respec costs ${cost} gold.`, 'warn'); return; }
        this.game.resources.gold -= cost; resetTree(c);
      } else if (nb) {
        const id = nb.dataset.node;
        if (c.tree.owned.includes(id)) { if (!id.includes('.')) toggleLoadout(c, id); }
        else { const why = buyNode(c, id); if (why) { this.toast(why, 'warn'); return; } }
      } else return;
      refresh(c);
      this.sigs.insp = null;
      this.renderInspector();
    };
  }

  inspColonist(c) {
    const g = this.game;
    const disp = dispositionOf(c.hostility);
    const mood = moodStatus(c.mood);
    this.portrait(RACE_ICON[c.race] || '🧑', mood.color, c.mood / 100);
    $('#inspector .insp-title').innerHTML = esc(c.name.full);
    // The card's head answers "who, doing what, how are they" before any tab.
    const doing = c.away ? 'away in the Rift' : esc(c.state) + (c.task ? ' · ' + esc(c.task.kind) : '');
    const pts = c.tree ? pointsFree(c) : 0;
    $('#inspector .insp-sub').innerHTML =
      `${RACES[c.race].name} ${c.title || CLASSES[c.klass].name}
       <div class="insp-doing">${taskIcon(c)} ${doing}</div>
       <div class="prof-stats">
         <div><span>Level</span><b>${c.level}</b></div>
         <div data-tipt="Overall combat power"><span>Power</span><b>${powerOf(c)}</b></div>
         <div data-tipt="Unspent points in the class tree"><span>Points</span><b style="${pts ? 'color:var(--hi)' : ''}">${pts}</b></div>
       </div>
       ${kbar('Mood', c.mood, 100, mood.color, `${Math.round(c.mood)} · ${mood.name}`)}
       ${kbar('Health', c.hp, c.maxHp, levelStatus(c.hp / c.maxHp), `${Math.round(c.hp)}/${c.maxHp}`)}
       ${c.hostility > 30 ? kbar('Loyalty', 100 - c.hostility, 100, disp.color, disp.name) : ''}`;
    // Old tab names (from alerts and older links) land on their new home.
    const alias = { bio: 'overview', social: 'overview', health: 'overview' };
    if (alias[this.tab]) this.tab = alias[this.tab];
    if (!['overview', 'skills', 'gear', 'class'].includes(this.tab)) this.tab = 'overview';
    this.setTabs(['overview', 'class', 'skills', 'gear']);
    const b = $('#inspector .insp-body');
    b.innerHTML = '';
    if (this.tab === 'overview') {
      const needs = [['hunger', 'Fed'], ['rest', 'Stamina'], ['joy', 'Joy']];
      const rels = Object.entries(c.relations)
        .map(([id, r]) => [g.colonists.find(x => x.id === +id), r])
        .filter(([o]) => o).sort((x, y) => Math.abs(y[1].value) - Math.abs(x[1].value)).slice(0, 4);
      const thoughts = c.thoughts.slice(-4).reverse();
      // Mood leads: it drives work speed, breaks and loyalty. Its two biggest
      // reasons sit right under it; the full list folds away.
      const why = c.away ? [] : moodBreakdown(g, c).sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
      const fmt = (r) => `<span class="${r.v > 0 ? 'kw-good-ink' : 'kw-bad-ink'}">${esc(r.label)} ${r.v > 0 ? '+' : ''}${Math.round(r.v)}</span>`;
      const low = needs.filter(([n]) => c.needs[n] < 0.5);
      b.innerHTML = `
        <div class="mood-why">${why.length ? why.slice(0, 2).map(fmt).join(' · ') : '<span class="mini">Nothing much on their mind.</span>'}</div>
        ${low.length ? `<div class="sect">Needs</div>${low.map(([n, lb]) => kbar(lb, c.needs[n] * 100, 100, levelStatus(c.needs[n]),
          c.needs[n] < 0.25 ? 'critical' : Math.round(c.needs[n] * 100) + '%')).join('')}` : ''}
        ${c.injuries.length ? `<div class="sect">Injuries</div>${c.injuries.map(i => `<div class="row"><span class="k">${esc(i.name)}</span>
          <span class="v" style="color:${i.heal < 0 ? 'var(--danger)' : i.treated ? 'var(--good)' : 'var(--warn)'}">${i.heal < 0 ? 'permanent' : i.treated ? 'treated' : 'untreated'}</span></div>`).join('')}` : ''}
        <div class="sect">Traits</div>
        <div>${kwList('trait', c.traits, '<span class="mini">None of note.</span>')}</div>
        ${this.fold('col-mind', `On their mind (${why.length})`, why.map(r => `<div class="row thought"${THOUGHTS[r.id] ? ` data-tip="thought:${r.id}"` : ''}><span class="k">${esc(r.label)}</span><span class="v ${r.v > 0 ? 'kw-good-ink' : 'kw-bad-ink'}">${r.v > 0 ? '+' : ''}${Math.round(r.v)}</span></div>`).join('') || '<div class="mini">Nothing.</div>')}
        ${this.fold('col-more', 'Needs, bonds and background', `${needs.map(([n, lb]) => kbar(lb, c.needs[n] * 100, 100, levelStatus(c.needs[n]), Math.round(c.needs[n] * 100) + '%')).join('')}
          ${rels.length ? `<div class="sect">Closest bonds</div>${rels.map(([o, r]) => `<div class="row"><span class="k">${esc(o.name.short)}${c.partner === o.id ? ' ♥' : ''}</span>
          <span class="v" style="color:${r.value > 40 ? 'var(--good)' : r.value < -30 ? 'var(--bad)' : 'var(--dim)'}">${relKind(r.value).name}</span></div>`).join('')}` : ''}
          <div class="mini" style="margin-top:8px">${esc(c.background)} · from ${esc(c.faction)}</div>`)}`;
    } else if (this.tab === 'skills') {
      b.innerHTML = `<button class="act wide${pts ? ' primary' : ''}" id="openclass">${CLASSES[c.klass].name} tree${pts ? ` — ${pts} point${pts > 1 ? 's' : ''} to spend` : ''} ›</button>
        <div class="sect">Skills</div>`
        + (() => {
          // The five best, then the rest folded; untouched skills with no passion aren't worth a row.
          const row = (s) => {
            const lv = c.skills[s], p = c.passions[s];
            return `<div class="skill" data-tip="skill:${c.id}|${s}"><span class="nm">${SKILLS[s].name}</span><span class="lv">${lv}</span>
            <span class="tr"><i style="width:${lv / 20 * 100}%;background:${seqStep(lv / 20)}"></i></span>
            <span class="ps">${p === 'burning' ? '★' : p === 'minor' ? '✦' : ''}</span></div>`;
          };
          const all = SKILL_IDS.slice().sort((x, y) => c.skills[y] - c.skills[x]).filter(s => c.skills[s] > 0 || c.passions[s]);
          return all.slice(0, 5).map(row).join('') + (all.length > 5 ? this.fold('col-skills', `${all.length - 5} more skills`, all.slice(5).map(row).join('')) : '');
        })()
        + `<div class="hint">★ burning passion · ✦ some interest. Set who does what in People › Duties.</div>
        ${this.fold('col-attrs', 'Attributes', `<div class="attrs">${ATTRS.map(a => `<div><span>${a.toUpperCase()}</span><b>${c.attributes[a]}</b></div>`).join('')}</div>`)}`;
      const ob = b.querySelector('#openclass');
      if (ob) ob.onclick = () => { this.tab = 'class'; this.renderInspector(); };
    } else if (this.tab === 'gear') {
      this.drawGearTab(b, c);
    } else if (this.tab === 'class') {
      this.drawClassTab(b, c);
    }
  }

  inspTile(x, y) {
    const g = this.mv, w = g.world, i = w.idx(x, y);
    const terr = TERRAIN[w.terrain[i]];
    const f = w.feature[i], bd = w.building[i], fl = w.floor[i];
    const icon = bd ? (BUILDING_ICON[bd.id] || '🧱') : (f ? (FEATURE_ICON[f] || '·') : (terr.mineable ? '🪨' : '·'));
    $('#inspector .insp-title').innerHTML = `${icon} ${esc(bd ? BUILDINGS[bd.id].name : (f ? FEATURES[f].name : terr.name))}`;
    $('#inspector .insp-sub').textContent = bd ? (bd.done ? BUILDINGS[bd.id].cat : 'blueprint') : (f ? terr.name : '');
    this.setTabs([]);
    const b = $('#inspector .insp-body');
    // Lead with what the tile is for; the survey numbers fold away below.
    b.innerHTML = `
      ${f ? `<div class="mini">Yields ${Object.entries(FEATURES[f].yield).map(([k, v]) => kw('res', k, { qty: v })).join('')}</div>` : ''}
      ${bd ? `<div class="row"><span class="k">Building</span><span class="v">${BUILDINGS[bd.id].name}${bd.done ? '' : ' (blueprint)'}</span></div>
        <div class="mini">${esc(BUILDINGS[bd.id].desc)}</div>
        ${bd.done && bd.hp < (BUILDINGS[bd.id].hp || 120) ? meter({ label: 'Damaged', icon: '🧱', value: Math.round(bd.hp), max: BUILDINGS[bd.id].hp || 120, color: levelStatus(bd.hp / (BUILDINGS[bd.id].hp || 120)) }) : ''}
        ${bd.done && UPGRADES[bd.id] ? `<div class="row"><span class="k">Level</span><span class="v lvl-pips">${'●'.repeat(levelOf(bd))}${'○'.repeat(MAX_LEVEL - levelOf(bd))} ${levelOf(bd)}/${MAX_LEVEL}</span></div>
          <div class="mini">${esc(UPGRADES[bd.id].per)}</div>
          ${bd.upgrade ? `<div class="mini" style="color:var(--hi)">Upgrading to level ${bd.upgrade.to}: ${costLine(bd.upgrade.cost)}${hasAllOf(g, bd.upgrade.cost) ? '' : ' — waiting on materials or gold'}</div>` : ''}` : ''}` : ''}
      ${fl ? `<div class="row"><span class="k">Floor</span><span class="v">${FLOOR_ICON[fl.id] || ''} ${FLOORS[fl.id].name}${fl.done ? '' : ' (laying)'}</span></div>` : ''}
      <div class="sect">Actions</div><div id="tileacts"></div>
      ${this.fold('tile-survey', 'Survey', `<div class="mini">${esc(terr.name)}</div>
        ${meter({ label: 'Light', icon: '💡', value: Math.round(w.light[i] * 100), max: 100, color: '#e2b23c' })}
        ${meter({ label: 'Beauty', icon: '✨', value: +w.beauty[i].toFixed(1), max: 20, color: '#9085e9' })}
        ${w.soil ? meter({ label: 'Soil', icon: '🟫', value: Math.round(w.soil[i] * 100), max: 100, color: '#c98500' }) : ''}
        ${w.water ? meter({ label: 'Water', icon: '💧', value: Math.round(w.water[i] * 100), max: 100, color: '#3987e5' }) : ''}`)}`;
    const box = b.querySelector('#tileacts');
    const add = (label, fn, cls) => { const btn = el('button', 'act ' + (cls || ''), label); btn.onclick = () => { fn(); this.renderInspector(); this.renderer.cacheVersion = -1; }; box.appendChild(btn); };
    if (bd && bd.done && BUILDINGS[bd.id].job === 'farm') {
      const ctx2 = g.farmContext(x, y);
      box.appendChild(el('div', 'mini', `🟫 soil ${pct(ctx2.soil)} · 💧 water ${pct(ctx2.water)} · ${SEASON_ICON[g.season]} ${g.season}. The percentage on each crop is how well it would do here, now.`));
      const picker = el('div');
      for (const id of CROP_IDS) {
        const v = cropViability(id, ctx2);
        const btn = el('button', 'act' + (bd.crop === id ? ' primary' : ''), `${CROP_ICON[id] || '🌱'} ${CROPS[id].name} ${v > 0 ? pct(v) : '—'}`);
        btn.dataset.tip = 'crop:' + id;
        btn.disabled = v <= 0;
        btn.onclick = () => { this.act(g, 'setCrop', x, y, id); bd.autoCrop = false; this.renderInspector(); };
        picker.appendChild(btn);
      }
      box.appendChild(el('div', 'sect', 'Plant'));
      box.appendChild(picker);
    }
    if (bd && bd.done && UPGRADES[bd.id]) {
      if (bd.upgrade) add('Cancel upgrade', () => cancelUpgrade(g, x, y), 'danger');
      else if (levelOf(bd) < MAX_LEVEL) {
        const cost = upgradeCost(bd.id, levelOf(bd) + 1);
        const btn = el('button', 'act primary', `⬆️ Upgrade to L${levelOf(bd) + 1} · ${costLine(cost)}`);
        btn.dataset.tipt = 'Builders do the work; the cost is paid when it’s finished.';
        btn.onclick = () => { const r = orderUpgrade(g, x, y); if (r) this.toast(r, 'warn'); this.sigs.insp = null; this.renderInspector(); };
        box.appendChild(btn);
      }
    }
    if (bd && bd.done && KEPT_SHOPS.has(bd.id)) {
      // Nobody behind the counter, no trade: pick who keeps it.
      const keeper = keeperOf(g.root, bd), open = keptNow(g.root, bd);
      box.appendChild(el('div', 'sect', 'Shopkeeper'));
      const row = el('label', 'row handler');
      row.innerHTML = `<span class="k">🧑‍💼 Keeper</span>`;
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="">Nobody — the shop stays shut</option>`
        + g.root.colonists.filter(c => !c.dead).map(c => `<option value="${c.id}"${bd.keeper === c.id ? ' selected' : ''}>${esc(c.name.short)} · ${esc(c.title || CLASSES[c.klass].name)}</option>`).join('');
      sel.onchange = () => { assignKeeper(g, bd, sel.value ? +sel.value : null); this.sigs.insp = null; this.renderInspector(); this.sigs.drawer = null; this.renderDrawer(); };
      row.appendChild(sel);
      box.appendChild(row);
      box.appendChild(el('div', 'mini', !keeper
        ? 'Shut. Assign a keeper and they’ll mind the counter through the day; the shop trades only while they’re there.'
        : open ? `🟢 Open — ${esc(keeper.name.short)} is at the counter.`
          : `🔴 Shut — ${g.root.isNight ? 'closed for the night.' : `waiting for ${esc(keeper.name.short)} to get to the counter.`}`));
    }
    if (bd && bd.done && (BUILDINGS[bd.id].shop || bd.id === 'tavern' || bd.id === 'temple')) {
      add(BUILDINGS[bd.id].shop === 'trading_post' || BUILDINGS[bd.id].shop === 'counting_house' || bd.id === 'tavern' || bd.id === 'temple' ? '🪙 Services' : '🪙 Open the Market',
        () => this.openDrawer(BUILDINGS[bd.id].shop && !['trading_post', 'counting_house'].includes(BUILDINGS[bd.id].shop) ? 'trade' : 'services'));
    }
    if (bd && bd.done && bd.id === 'smithy') add('⚒️ Forge', () => this.openDrawer('workshop'));
    if (terr.mineable || (f && FEATURES[f].inRock)) add('⛏️ Mine here', () => this.act(g, 'designate', x, y, 'mine'));
    if (f && !FEATURES[f].inRock) add('🌿 Harvest', () => this.act(g, 'designate', x, y, 'harvest'));
    if (w.designation[i] || (bd && !bd.done) || (fl && !fl.done)) add('🚫 Cancel', () => this.act(g, 'designate', x, y, 'cancel'), 'danger');
    if (!box.childElementCount) box.appendChild(el('div', 'mini', 'Nothing to order here.'));
  }

  inspMonster(r, best) {
    const k = bestiaryKnowledge(this.game, r.monsterId);
    this.setTabs([]);
    $('#inspector .insp-body').innerHTML =
      meter({ label: 'Health', icon: '❤️', value: Math.round(r.hp), max: r.maxHp, color: levelStatus(r.hp / r.maxHp) })
      + meter({
        label: 'Against your strongest', icon: '⚔️', value: powerOf(r), max: Math.max(powerOf(r), best, 1),
        color: powerOf(r) > best ? STATUS.critical : STATUS.good,
        note: powerOf(r) > best ? 'stronger than anyone at home' : `your best fields ${best}`,
      })
      + (r.affixes && r.affixes.length ? `<div class="sect">Affixes</div><div class="mini">${r.affixes.map(a => esc(a)).join(' · ')}</div>` : '')
      + `<div class="sect">What we know</div>`
      + (k >= 2 ? combatTraitsHtml(r.combat) : k >= 1 ? combatTraitsHtml({ tags: r.combat.tags }) + '<div class="mini">Weaknesses unknown — slay three to learn them.</div>'
        : '<div class="mini">Never studied. Kill one to learn what it is.</div>')
      + (k >= 1 && r.abilities.length ? `<div class="sect">Abilities</div><div class="gs-abil">${r.abilities.map(a => `<div data-tip="ability:${a}"><span>✨</span>${esc(ABILITIES[a].name)}</div>`).join('')}</div>` : '');
  }
  /** A Rift merchant: what it sells, what it buys, and the choice to rob it. */
  inspMerchant(r) {
    const g = this.game, M = RIFT_MERCHANTS[r.merchant];
    const m = g.maps.find(mm => mm.raiders.includes(r));
    const v = m ? g.viewOf(m) : g;
    const s = merchantStock(v, r);
    const gold = Math.floor(g.resources.gold || 0);
    const here = g.colonists.filter(c => !c.dead && (c.mapId || 0) === (m ? m.id : 0));
    this.portrait(RACE_ICON[r.race] || M.icon, '#ffd84a', 1);
    $('#inspector .insp-title').innerHTML = `${M.icon} ${esc(M.name)}`;
    $('#inspector .insp-sub').innerHTML = `${esc(r.name.full)} · floor ${m ? m.depth : '?'} · trades from your treasury back home`;
    this.setTabs([]);
    const b = $('#inspector .insp-body');
    const tile = (inner, act, price, ok = true) => `<div class="tr-item${ok && gold >= price ? '' : ' no'}" ${act}>${inner}<div class="tr-p">🪙 ${price}</div></div>`;
    let h = `<div class="mini insp-desc">${esc(M.desc)}</div>`;
    if (!here.length) h += '<div class="mini" style="color:var(--warn)">Nobody of yours is on this floor to trade with it.</div>';
    let grid = '';
    (s.items || []).forEach((it, i) => { grid += tile(`<div class="tr-ic">${SLOT_ICONS[it.slot] || '⚔️'}</div><div class="tr-n" style="color:${RARITIES[it.rarity].color}">${esc(it.name)}</div><div class="tr-q">${it.cursed ? 'cursed — −10% health' : RARITIES[it.rarity].name}</div>`, `data-mbuy="item:${i}" data-tip="${itemTipKey(it)}"`, itemPrice(it), here.length); });
    for (const [id, n] of Object.entries(s.potions || {})) if (n > 0) { const p = Math.round(potionPrice(id) * (s.mult || 1)); grid += tile(`<div class="tr-ic">${POTIONS[id].icon}</div><div class="tr-n">${esc(POTIONS[id].name)}</div><div class="tr-q">${n} left</div>`, `data-mbuy="potion:${id}" data-tip="potion:${id}"`, p, here.length); }
    if (s.chest > 0) grid += tile(`<div class="tr-ic">📦</div><div class="tr-n">The chest</div><div class="tr-q">could be anything</div>`, 'data-mbuy="chest"', s.chestPrice, here.length);
    if (s.map > 0) grid += tile(`<div class="tr-ic">🗺️</div><div class="tr-n">Map of this floor</div><div class="tr-q">lights every corner</div>`, 'data-mbuy="map"', MAP_PRICE, here.length);
    if (s.keys > 0) grid += tile(`<div class="tr-ic">🗝️</div><div class="tr-n">Rift key</div><div class="tr-q">${s.keys} left · you hold ${g.keys || 0}</div>`, 'data-mbuy="key"', KEY_PRICE, here.length);
    if (grid) h += `<div class="tr-grid shop-grid">${grid}</div>`;
    if (s.reforge) {
      const pieces = [];
      for (const c of here) for (const sl of FORGE_SLOTS) { const it = c.equipment[sl]; if (it && it.forgeTier && it.forgeTier !== 'runed') pieces.push([c, sl, it]); }
      h += `<div class="sect">Reforge a tier up</div>` + (pieces.length ? `<div class="shop-row">${pieces.map(([c, sl, it]) => `<button class="act" data-reforge="${c.id}:${sl}" ${gold >= reforgeCost(it) ? '' : 'disabled'}>${esc(c.name.short)}: ${esc(it.name)} <span class="cost">🪙${reforgeCost(it)}</span></button>`).join('')}</div>` : '<div class="mini">Nobody here wears forged gear to reforge.</div>');
    }
    if (['fence', 'fey_hawker', 'bone_broker'].includes(r.merchant)) h += `<div class="shop-row"><button class="act" data-msell ${here.length ? '' : 'disabled'}>💰 ${r.merchant === 'bone_broker' ? 'Sell relics and trophies' : r.merchant === 'fey_hawker' ? 'Sell food and herbs from packs' : 'Sell what the packs carry'}</button></div>`;
    h += `<div class="sect">Or</div><div class="shop-row"><button class="act danger" data-rob ${here.length ? '' : 'disabled'} data-tipt="It fights — hard. Its stock is yours if you win, and its kind won't deal with you again this run.">🗡️ Rob it</button></div>`;
    b.innerHTML = h;
    b.onclick = (e) => {
      const t = e.target.closest && e.target.closest('[data-mbuy],[data-msell],[data-rob],[data-reforge]');
      if (!t || t.disabled || t.classList.contains('no')) return;
      let res = '';
      if (t.dataset.mbuy) { const [what, arg] = t.dataset.mbuy.split(':'); res = merchantBuy(v, r, what, what === 'item' ? +arg : arg); }
      else if (t.dataset.msell != null) res = merchantSellPacks(v, r);
      else if (t.dataset.reforge) { const [cid, sl] = t.dataset.reforge.split(':'); res = merchantReforge(v, r, +cid, sl); }
      else if (t.dataset.rob != null) {
        robMerchant(v, r);
        this.act(g, 'orderAttack', here.map(c => c.id), r.id);
        b.onclick = null; this.sigs.insp = null; this.renderInspector();
        return;
      }
      if (res) this.toast(res, 'warn'); else this.flash('Done', 'good');
      this.sigs.insp = null; this.renderInspector(); this.renderTop();
    };
  }

  inspEnemy(r) {
    if (r.neutral && r.merchant) { this.inspMerchant(r); return; }
    const disp = dispositionOf(r.hostility);
    const best = this.game.colonists.filter(c => !c.away).reduce((m, c) => Math.max(m, powerOf(c)), 0);
    this.portrait(r.icon || RACE_ICON[r.race] || '👺', STATUS.critical, r.hp / r.maxHp);
    $('#inspector .insp-title').innerHTML = esc(r.name.full);
    $('#inspector .insp-sub').innerHTML = r.monster
      ? `⚔️ ${esc(FAMILIES[r.family].name)} · rank ${MONSTERS[r.monsterId].rank[0]} · level ${r.level} · power ${powerOf(r)}`
      : `⚔️ Marauder · ${RACES[r.race].name} ${CLASSES[r.klass].name} · level ${r.level} · power ${powerOf(r)}`;
    if (r.monster) { this.inspMonster(r, best); return; }
    this.setTabs([]);
    $('#inspector .insp-body').innerHTML =
      gauge({
        label: 'Hostility', icon: '⚠️', frac: r.hostility / 100, verdict: `${disp.name} (${r.hostility})`, color: disp.color,
        note: 'Generated by the same pipeline as your denizens — only this meter differs.',
      })
      + meter({ label: 'Health', icon: '❤️', value: Math.round(r.hp), max: r.maxHp, color: levelStatus(r.hp / r.maxHp) })
      + meter({
        label: 'Against your strongest', icon: '⚔️', value: powerOf(r), max: Math.max(powerOf(r), best, 1),
        color: powerOf(r) > best ? STATUS.critical : STATUS.good,
        note: powerOf(r) > best ? 'stronger than anyone at home' : `your best fields ${best}`,
      })
      + `<div class="sect">Traits</div><div>${kwList('trait', r.traits)}</div>
      <div class="sect">Gear</div>
      <div class="mini">⚔️ ${r.equipment.weapon ? esc(r.equipment.weapon.name) : 'unarmed'} · 🛡️ ${r.equipment.armor ? esc(r.equipment.armor.name) : 'no armour'}</div>`;
  }

  inspBeast(b) {
    const g = this.game;
    const A = ANIMALS[b.species];
    this.portrait(ANIMAL_ICON[b.species] || '🐾', levelStatus(b.hunger), b.hunger);
    $('#inspector .insp-title').innerHTML = `${esc(b.name)} the ${A.name}`;
    $('#inspector .insp-sub').innerHTML = `${b.tame ? '🏠 livestock' : A.wildAggressive ? '⚠️ wild and dangerous' : '🌿 wild'} · ${b.sex === 'f' ? '♀ female' : '♂ male'} · ${isMature(b) ? 'adult' : 'young'}`;
    this.setTabs([]);
    const best = g.colonists.filter(c => !c.away).sort((x, y) => (y.skills.animals || 0) - (x.skills.animals || 0))[0];
    const body = $('#inspector .insp-body');
    body.innerHTML = `<div class="mini insp-desc">${esc(A.desc)}</div>`
      + kbar('Health', b.hp, b.maxHp, levelStatus(b.hp / b.maxHp), `${Math.round(b.hp)}/${b.maxHp}`)
      + kbar('Fed', b.hunger * 100, 100, levelStatus(b.hunger), b.hunger < 0.3 ? 'starving' : Math.round(b.hunger * 100) + '%')
      + kbar('Grown', Math.min(b.age, A.matureDays), A.matureDays, '#3987e5', isMature(b) ? 'adult' : `${b.age.toFixed(1)}/${A.matureDays} d`)
      + (b.tame && b.hunger < 0.3 ? '<div class="mini" style="color:var(--warn)">Grazing is thin — build a Feed Trough.</div>' : '')
      + (!b.tame && best ? gauge({
        label: 'Tame chance', icon: '🤝', frac: tameChance(best, b), color: levelStatus(tameChance(best, b)),
        verdict: pct(tameChance(best, b)), note: `best hand is ${esc(best.name.short)}, Animals ${best.skills.animals || 0}`,
      }) : '')
      + `<div class="row"><span class="k">⚔️ Combat power</span><span class="v">${beastPower(b)}</span></div>
      ${A.product ? `<div class="row"><span class="k">🥛 ${A.product.label}</span><span class="v">every ${A.product.days}d</span></div>` : ''}
      ${A.pack ? `<div class="row"><span class="k">🎒 Pack capacity</span><span class="v">+${A.pack}</span></div>` : ''}
      ${b.pregnant > 0 ? `<div class="row"><span class="k">🤰 Pregnant</span><span class="v">${b.pregnant.toFixed(1)}d left</span></div>` : ''}
      <div class="sect">Traits</div>
      <div>${kwList('btrait', b.traits, '<span class="mini">Unremarkable.</span>')}</div>
      <div class="sect">Orders</div><div id="beastacts"></div>`;
    const box = body.querySelector('#beastacts');
    if (b.tame) {
      if (canFollow(b)) {
        // A handler: whoever it follows into the Rift, fights beside and carries for.
        const row = el('label', 'row handler');
        row.innerHTML = `<span class="k">🦮 Handler</span>`;
        const sel = document.createElement('select');
        sel.innerHTML = `<option value="">Nobody — stays at the pasture</option>`
          + g.colonists.filter(c => !c.dead).map(c => `<option value="${c.id}"${b.handler === c.id ? ' selected' : ''}>${esc(c.name.short)} · ${esc(c.title || CLASSES[c.klass].name)}</option>`).join('');
        sel.onchange = () => { this.act(g, 'setHandler', b.id, sel.value ? +sel.value : null); this.sigs.insp = null; this.renderInspector(); };
        row.appendChild(sel);
        box.appendChild(row);
        box.appendChild(el('div', 'mini', A.war
          ? 'Follows its handler into the Rift and fights beside them. At home it guards the camp. Tip: select someone and right-click the beast.'
          : `Follows its handler into the Rift and carries ${A.pack * PACK_PER_LOAD} more for them. Tip: select someone and right-click the beast.`));
      }
      const bt = el('button', 'act danger', b.markedButcher ? 'Cancel slaughter' : '🔪 Slaughter');
      bt.onclick = () => { this.act(g, 'markButcher', b.id); this.sigs.insp = null; this.renderInspector(); };
      box.appendChild(bt);
    } else {
      box.appendChild(el('div', 'mini', g.world.findBuildings('pasture').length
        ? 'A denizen with Animals work enabled will try to tame this.'
        : 'Build a Pasture Post before anyone will try to tame it.'));
    }
  }

  inspSite(s) {
    const g = this.game;
    const K = SITE_KINDS[s.kind];
    $('#inspector .insp-title').innerHTML = `${SITE_ICON[s.kind] || '📍'} ${esc(s.name)}`;
    $('#inspector .insp-sub').innerHTML = `${K.name} · ${BIOMES[s.biome].name} · tier ${s.tier}${K.hostileSite ? ' · ⚠️ hostile' : ''}`;
    this.setTabs([]);
    const host = s.hostility != null ? dispositionOf(s.hostility) : null;
    $('#inspector .insp-body').innerHTML = `
      <div class="row"><span class="k">Distance</span><span class="v">${Math.round(s.dist)} · ${Math.round(g.overworld.travelTicks(g.overworld.colony, s) / 60)}h</span></div>
      ${s.pop ? `<div class="row"><span class="k">Population</span><span class="v">${s.pop}</span></div>` : ''}
      ${host ? gauge({
        label: 'Standing', icon: s.hostility > 60 ? '⚠️' : s.hostility > 30 ? '😐' : '🤝',
        frac: s.hostility / 100, verdict: `${host.name} (${s.hostility})`, color: host.color,
        note: 'Trading with their caravans cools this over time.',
      }) : ''}
      ${s.faction ? `<div class="row"><span class="k">Faction</span><span class="v">${esc(s.faction)}</span></div>` : ''}
      ${s.stock ? `<div class="sect">Produces</div>${Object.entries(s.stock).map(([k, v]) => `<div class="row"><span class="k">${RESOURCE_ICON[k] || ''} ${RESOURCES[k]?.name || k}</span><span class="v">${v}</span></div>`).join('')}` : ''}
      ${s.raidsLaunched ? `<div class="sect">Threat</div><div class="mini">${s.raidsLaunched} raid(s) have come from here.</div>` : ''}
      ${s.cleared ? '<div class="mini" style="color:var(--good)">Cleared.</div>' : ''}
      ${this.siteJourneyHtml(s)}`;
    const box = $('#inspector .insp-body');
    box.onclick = (e) => {
      const b = e.target.closest && e.target.closest('[data-site-go]');
      if (!b || b.disabled) return;
      const ids = [...this.squad].filter(id => { const c = g.colonists.find(x => x.id === id); return c && !c.away && !(c.mapId || 0); });
      const r = sendJourney(g, ids, s.id, b.dataset.siteGo);
      if (r) this.toast(r, 'warn'); else { this.flash(`${ERRANDS[b.dataset.siteGo].name}: they set out for ${s.name}.`, 'good'); this.squad.clear(); }
      this.sigs.insp = null; this.renderInspector(); this.sigs.drawer = null; this.renderDrawer();
    };
  }
  /** A site's offer to a party: what's there to get, how far, and the button that sends them. */
  siteJourneyHtml(s) {
    const g = this.game;
    const pv = siteRewardPreview(g, s, Math.max(1, this.squad.size));
    if (!pv) return '';
    const party = [...this.squad].map(id => g.colonists.find(c => c.id === id)).filter(c => c && !c.away && !(c.mapId || 0));
    const days = journeyDays(g, s);
    const E = ERRANDS[pv.errand];
    const reward = [...Object.entries(pv.res || {}).map(([k, q]) => kw('res', k, { qty: q })), pv.text ? `<span class="mini">${esc(pv.text)}</span>` : ''].join(' ');
    const odds = pv.errand === 'clear' && party.length ? clearOdds(party, s) : null;
    const why = !party.length ? 'Select who goes on the colonist bar first.' : pv.ready === false ? 'Pilgrims went lately — wait a few days.' : '';
    return `<div class="sect">🧭 Journey <em>${days} day${days === 1 ? '' : 's'} there and back</em></div>
      <div class="mini">${esc(E.desc)}</div>
      <div class="goal-rw"><span class="mini">Brings back</span>${reward}${pv.first ? '<span class="kw kw-good"><i>✨</i>first haul doubled</span>' : ''}</div>
      ${pv.risk ? `<div class="mini" style="color:var(--warn)">⚠️ ${odds != null ? `${Math.round(odds * 100)}% chance this party wins.` : 'It may be guarded.'} Send fighters.</div>` : ''}
      <div class="ct-row"><button class="act primary" data-site-go="${pv.errand}"${why ? ` disabled data-tipt="${esc(why)}"` : ''}>🧭 ${esc(E.name)}${party.length ? ` — send ${party.map(c => esc(c.name.short)).join(', ')}` : ''}</button></div>`;
  }

  inspHistory(h) {
    const mark = h.outcome === 'clear' ? '✅' : h.outcome === 'wipe' ? '💀' : '↩️';
    $('#inspector .insp-title').innerHTML = `${mark} ${esc(h.dungeon)}`;
    $('#inspector .insp-sub').textContent = `${h.theme} · tier ${h.tier} · ${h.outcome}`;
    this.setTabs([]);
    const haul = Object.entries(h.loot.resources);
    $('#inspector .insp-body').innerHTML = `
      <div class="row"><span class="k">🌀 Deepest floor</span><span class="v">${h.depth ?? '—'}</span></div>
      <div class="row"><span class="k">🧹 Floors cleared</span><span class="v">${h.rooms}${h.lair ? ' · lair broken' : ''}</span></div>
      <div class="row"><span class="k">⚔️ Kills</span><span class="v">${h.kills}</span></div>
      <div class="sect">Haul</div>
      ${haul.length ? bars({
        rows: haul.map(([k, v]) => ({ name: RESOURCES[k]?.name || k, icon: RESOURCE_ICON[k], value: v, color: RESOURCES[k]?.color })),
      }) : '<div class="mini">Nothing.</div>'}
      ${h.loot.items.length ? '<div class="sect">Items</div>' + h.loot.items.map(i => `<div class="mini">${i.kind === 'weapon' ? '⚔️' : '🛡️'} ${esc(i.name)}</div>`).join('') : ''}
      <div class="sect">Field Report</div>
      ${h.log.slice(-60).map(l => `<div class="logline ${l.kind}">${l.room ? `<b>${esc(l.room)}</b> · ` : ''}${esc(l.text)}</div>`).join('')}`;
  }

  // ----------------------------------------------------------- architect --
  static ARCH_CATS = [
    ['structure', 'Structure', '🧱'], ['comfort', 'Furniture', '🛏️'],
    ['production', 'Production', '⚒️'], ['farm', 'Farm', '🌾'], ['logistics', 'Storage', '📦'],
    ['martial', 'Security', '⚔️'],
  ];
  // Orders live on keys (and the help sheet), not in the Build picker.
  static ORDERS = [
    ['select', 'Select', '🖐', 'Esc', 'Click to inspect, drag to band-select denizens.'],
    ['squad', 'Party', '⬚', 'G', 'Drag a box to select every denizen inside it — the touch-screen way.'],
    ['mine', 'Mine', '⛏️', 'M', 'Drag over rock and ore seams to have them dug out.'],
    ['harvest', 'Cut / harvest', '🌿', 'H', 'Drag over trees, fungus and herbs to have them gathered.'],
    ['cancel', 'Cancel', '🚫', 'X', 'Drag over orders and blueprints to call them off.'],
  ];

  /** RimWorld's Architect: categories down the left, square gizmos to the right. */
  toggleBuildPick(cat) {
    const pick = $('#buildpick');
    if (this.buildCat === cat && !pick.classList.contains('hidden')) { this.hide('#buildpick'); this.renderRail(); return; }
    this.buildCat = cat;
    if (this.drawer) { this.drawer = null; this.renderDrawer(); }
    this.show('#buildpick');
    this.renderArchitect();
    this.renderRail();
  }

  renderArchitect() {
    // Each gizmo shows the thing as the map will draw it; an icon only when it has no tile art.
    const gzPic = (kind, id) => {
      const url = tileThumb(kind, id, 72);
      return url ? `<img class="gz-img" src="${url}" alt="">` : (kind === 'floor' ? FLOOR_ICON[id] : BUILDING_ICON[id]) || '🧱';
    };
    const g = this.game;
    const cat = this.buildCat || 'structure';
    const pick = $('#buildpick');
    const cats = UI.ARCH_CATS.map(([k, name, ic]) =>
      `<button data-cat="${k}" class="${k === cat ? 'on' : ''}"><span>${ic}</span>${name}</button>`).join('');
    let gizmos = '';
    {
      for (const id in BUILDINGS) {
        const def = BUILDINGS[id];
        if (def.cat !== cat || !g.unlocked.has(id)) continue;
        const can = Object.entries(def.cost).every(([k, v]) => (g.resources[k] || 0) >= v);
        gizmos += `<div class="gz${can ? '' : ' cant'}${this.tool.mode === 'build' && this.tool.id === id ? ' on' : ''}" data-build="${id}" data-tip="bld:${id}">
          <span class="gi">${gzPic('build', id)}</span><span class="gl">${esc(def.name)}</span></div>`;
      }
      // Floors are a separate layer from buildings, but they live in the same
      // Structure tab a player already looks in for walls and doors.
      // Not researched yet: shown greyed at the end, so the category says
      // what it will hold. Clicking one queues the research that unlocks it.
      for (const id in BUILDINGS) {
        const def = BUILDINGS[id];
        if (def.cat !== cat || g.unlocked.has(id)) continue;
        const tech = unlockerOf(id);
        if (!tech) continue;
        gizmos += `<div class="gz locked" data-locked="${id}" data-tech="${tech}">
          <span class="gi">${gzPic('build', id)}<b class="gz-lock">🔒</b></span><span class="gl">${esc(def.name)}</span></div>`;
      }
      if (cat === 'structure') for (const id in FLOORS) {
        const def = FLOORS[id];
        const can = Object.entries(def.cost).every(([k, v]) => (g.resources[k] || 0) >= v);
        gizmos += `<div class="gz${can ? '' : ' cant'}${this.tool.mode === 'floor' && this.tool.id === id ? ' on' : ''}" data-floor="${id}">
          <span class="gi">${gzPic('floor', id)}</span><span class="gl">${esc(def.name)}</span></div>`;
      }
      if (!gizmos) gizmos = '<div class="mini" style="grid-column:1/-1;padding:8px">🔒 Nothing here yet — research unlocks more.</div>';
    }
    pick.innerHTML = `<div class="arch-cats">${cats}</div>
      <div class="arch-main"><div class="arch-grid">${gizmos}</div><div class="arch-info"></div></div>`;
    const cur = this.tool.mode === 'build' ? this.tool.id : null;
    const curFloor = this.tool.mode === 'floor' ? this.tool.id : null;
    this.archInfo(cur, null, curFloor);
  }

  /** The description box under the gizmos: what it is, what it costs, what you lack. */
  archInfo(id, tool, floorId) {
    const box = $('#buildpick .arch-info');
    if (!box) return;
    const g = this.game;
    if (tool) {
      const o = UI.ORDERS.find(x => x[0] === tool);
      box.innerHTML = o ? `<div class="an">${o[2]} ${o[1]} <span class="mini">(${o[3]})</span></div><div class="ad">${o[4]}</div>` : '';
      return;
    }
    if (floorId) {
      const def = FLOORS[floorId];
      const short = Object.entries(def.cost).filter(([k, v]) => (g.resources[k] || 0) < v);
      box.innerHTML = `<div class="an">${FLOOR_ICON[floorId] || ''} ${esc(def.name)}</div>
        <div class="ad">${esc(def.desc)}</div>
        <div class="ad">Cost: ${Object.entries(def.cost).map(([k, v]) =>
          kw('res', k, { qty: v, state: (g.resources[k] || 0) >= v ? undefined : 'bad' })).join('')}
          · Work ${Math.round(def.work)}</div>
        ${short.length ? `<div class="ad" style="color:var(--danger)">Short of ${short.map(([k, v]) => `${Math.ceil(v - (g.resources[k] || 0))} ${RESOURCES[k].name}`).join(' and ')}</div>` : ''}`;
      return;
    }
    if (!id) { box.innerHTML = '<div class="ad">Hover a gizmo to see what it does. Click one, then drag on the map.</div>'; return; }
    const def = BUILDINGS[id];
    const short = Object.entries(def.cost).filter(([k, v]) => (g.resources[k] || 0) < v);
    box.innerHTML = `<div class="an">${BUILDING_ICON[id] || ''} ${esc(def.name)}</div>
      <div class="ad">${esc(def.desc)}</div>
      <div class="ad">Cost: ${Object.entries(def.cost).map(([k, v]) =>
        kw('res', k, { qty: v, state: (g.resources[k] || 0) >= v ? undefined : 'bad' })).join('')}
        · Work ${Math.round(def.work)}</div>
      ${!g.unlocked.has(id) ? (() => { const tech = unlockerOf(id), R = RESEARCH[tech]; const q = g.research.current === tech || g.research.queue.includes(tech);
        return `<div class="ad" style="color:var(--warn)">🔒 Needs research: <b>${esc(R ? R.name : tech)}</b>${q ? ' — queued' : ' — click to queue it'}</div>`; })()
        : short.length ? `<div class="ad" style="color:var(--danger)">Short of ${short.map(([k, v]) => `${Math.ceil(v - (g.resources[k] || 0))} ${RESOURCES[k].name}`).join(' and ')}</div>` : ''}`;
  }

  showGameOver() {
    const g = $('#gameover');
    if (!g.classList.contains('hidden')) return;
    g.classList.remove('hidden');
    // The colony fell, and its save falls with it: no reloading past a wipe.
    const lostSlot = this.slot;
    if (lostSlot) { deleteSlot(lostSlot); this.slot = null; }
    const s = this.game.snapshot();
    g.innerHTML = `<h2 style="margin:0;font-size:20px">💀 The camp has fallen. The Rift remains.</h2>
      <div class="gostats">${bars({
        rows: [
          { name: 'Nights survived', icon: '🌙', value: s.day - 1, color: '#3987e5' },
          { name: 'Rift level', icon: '🌀', value: s.riftLevel, color: '#9085e9' },
          { name: 'Rift trips', icon: '🗝️', value: s.stats.expeditions, color: '#9085e9' },
          { name: 'Floors cleared', icon: '✅', value: s.cleared, color: '#199e70' },
          { name: 'Waves beaten', icon: '🛡️', value: s.stats.raidsWon, color: '#d95926' },
          { name: 'Buried', icon: '💀', value: s.deaths, color: '#e04a4a' },
        ],
      })}</div>
      ${lostSlot ? `<div class="mini" style="color:var(--danger)">Slot ${lostSlot}'s save is gone with them.</div>` : ''}
      <div class="mini">${esc(this.game.gameOver.reason || '')} seed <b>${esc(this.seed)}</b> — put <code>?seed=${esc(this.seed)}</code> in the URL to replay this start</div>`;
    const b = el('button', 'act primary', 'Back to the title');
    b.onclick = () => { this.hide('#gameover'); this.showTitle(); };
    g.appendChild(b);
  }

  // ------------------------------------------------------------ co-op --
  /**
   * Every order a player gives goes through here. Solo it is a plain call. The
   * co-op host runs it now and stamps it into the command stream; a guest sends
   * it to the host and gets back a stand-in answer, because the real one comes
   * with the tick the host runs it on (and a refusal comes back as a toast).
   */
  act(target, op, ...args) {
    const c = this.coop;
    if (!c) return target[op](...args);
    const mapId = target && target._m ? target._m.id : 0;
    if (c.role === 'host') return c.host.issue(0, op, mapId, args);
    if (!c.guest.issue(op, mapId, args)) { this.flash('Still syncing with the host…', 'warn'); return null; }
    if (op === 'launchExpedition') return { ok: true, ids: args[1] || [] };
    if (op === 'orderRescue' || op === 'orderTame') return this.game.colonists.find(k => (args[0] || []).includes(k.id)) || null;
    const p = COOP_OPS[op];
    return p && typeof p === 'object' ? { ...p } : p;
  }

  /** A guest touching the clock: the host's clock rules, so ask instead. True means "stop here". */
  guestTime(what) {
    const c = this.coop;
    if (!c || c.role !== 'guest') return false;
    c.net.send({ t: 'ask', what });
    this.flash(`The host controls time. Asked them to ${what}.`, 'info');
    return true;
  }

  /** Open this colony to friends: a 4-digit code they type into Join World. */
  async openCoop() {
    if (this.coop || this.coopBusy) return;
    if (this.game.gameOver) { this.flash('This colony has fallen.', 'warn'); return; }
    this.coopBusy = true;
    this.flash('Opening the world to co-op…', 'info');
    try {
      let host = null;
      const net = await netHost({
        makeCode: () => coopNewCode(),
        onMessage: (peer, msg) => host && host.receive(peer, msg),
        onJoin: () => {},
        onLeave: (peer) => host && host.drop(peer),
        onError: (why) => this.flash('Co-op: ' + why, 'warn'),
      });
      host = new CoopHost(this.game, {
        code: net.code, name: 'Host', send: (peer, msg) => net.send(peer, msg),
        onEvent: (e) => this.coopEvent(e),
      });
      // The steward's orders don't go through the command stream.
      this.auto = false;
      this.coop = { role: 'host', host, net, code: net.code };
      this.flash(`Co-op open — code ${net.code}`, 'good');
    } catch (e) {
      this.flash('Could not open co-op: ' + (e && e.message ? e.message : e), 'warn');
    } finally {
      this.coopBusy = false;
      this.renderCoopBadge();
      if (!$('#gamemenu').classList.contains('hidden')) this.showGameMenu(true);
    }
  }

  /** Join a friend's world by its code. `status(text, kind)` reports progress to the title screen. */
  async joinCoop(code, status = () => {}) {
    if (this.coop || this.coopBusy) return;
    if (!/^\d{4}$/.test(code)) { status('A world code is four digits.', 'warn'); return; }
    this.coopBusy = true;
    status(`Looking for world ${code}…`, 'info');
    let guest = null, net = null, done = false;
    const fail = (why) => {
      if (done) return; done = true;
      status(why, 'warn');
      if (net) net.close();
      if (this.coop && this.coop.guest === guest) { this.coop = null; this.renderCoopBadge(); }
    };
    try {
      net = await netJoin(code, {
        onMessage: (msg) => guest && guest.receive(msg),
        onClose: () => {
          if (!done) { fail('The host closed the connection.'); return; }
          if (this.coop && this.coop.guest === guest) this.leaveCoop('The host closed the world.');
        },
        onError: (why) => this.flash('Co-op: ' + why, 'warn'),
      });
      guest = new CoopGuest({
        send: (msg) => net.send(msg),
        load: (text) => coopLoad(text),
        onEvent: (e) => {
          if (e.kind === 'loaded') {
            const first = !this.coop || this.coop.guest !== guest || !this.coop.live;
            if (first) {
              done = true;
              this.slot = null; this.auto = false;
              this.colonyName = `Co-op world ${code}`;
              this.coop = { role: 'guest', guest, net, code, live: true };
              this.installGame(e.game);
              this.hideTitle();
              this.flash(`Joined world ${code} as player ${guest.player + 1}`, 'good');
            } else {
              // A resync: keep the camera where it was.
              const r = this.renderer;
              this.installGame(e.game, { mapId: this.mapId, cams: { ...this.cams, [this.mapId]: { x: r.camX, y: r.camY, tile: r.tile } } });
              this.flash('Back in step with the host.', 'good');
            }
            this.renderCoopBadge();
          } else if (e.kind === 'refused') fail(e.why);
          else if (e.kind === 'result') this.flash(e.msg, 'warn');
          else if (e.kind === 'desync') { this.flash('Out of step with the host — fetching their world…', 'warn'); this.renderCoopBadge(); }
        },
      });
      this.coop = { role: 'guest', guest, net, code, live: false };
      guest.hello('Player');
      setTimeout(() => { if (!done) fail('The host did not answer. Check the code and try again.'); }, 20000);
    } catch (e) {
      fail(e && e.message ? e.message : String(e));
    } finally {
      this.coopBusy = false;
    }
  }

  /** Host: close the world. Guest: leave it, back to the title. */
  leaveCoop(why) {
    const c = this.coop;
    if (!c) return;
    this.coop = null;
    try { c.net.close(); } catch (e) { /* already gone */ }
    this.renderCoopBadge();
    if (c.role === 'guest') {
      this.flash(why || 'Left the co-op world.', why ? 'warn' : 'info');
      this.showTitle();
    } else this.flash(why || 'Co-op closed. The colony is yours alone again.', 'info');
  }

  coopEvent(e) {
    const who = e.player ? `${e.player.name} ${e.player.id + 1}` : 'A player';
    if (e.kind === 'join') this.flash(`${who} joined the world`, 'good');
    else if (e.kind === 'leave') this.flash(`${who} left the world`, 'info');
    else if (e.kind === 'resync') this.flash(`${who} drifted out of step and was resynced (${e.reason})`, 'warn');
    else if (e.kind === 'ask') this.flash(`${who} asks you to ${e.what}`, 'info');
    this.renderCoopBadge();
  }

  /** The chip in the corner: the code, who's in, and (for a guest) whether we're in step. */
  renderCoopBadge() {
    const b = typeof document !== 'undefined' && $('#coopbadge');
    if (!b) return;
    const c = this.coop;
    if (!c || (c.role === 'guest' && !c.live)) { b.classList.add('hidden'); this.coopBadgeSig = null; return; }
    let n, state = '';
    if (c.role === 'host') n = c.host.players.length;
    else {
      const G = c.guest;
      n = G.players.length || 2;
      state = G.waiting ? ' · <em class="warn">resyncing…</em>' : G.behind > 30 ? ` · <em>catching up ${G.behind}</em>` : ' · <em class="good">in step</em>';
    }
    const sig = `${c.code}|${n}|${state}`;
    if (sig === this.coopBadgeSig) return;
    this.coopBadgeSig = sig;
    b.classList.remove('hidden');
    b.innerHTML = `🤝 <b>${c.code}</b> · ${n} player${n === 1 ? '' : 's'}${c.role === 'guest' ? ' · guest' : ''}${state}`;
  }

  // ---------------------------------------------------------- saving --
  /** The UI bits worth keeping with a save: which map was on screen, the cameras, the party. */
  uiSnapshot() {
    const r = this.renderer;
    const cams = { ...this.cams, [this.mapId]: { x: r.camX, y: r.camY, tile: r.tile } };
    return { mapId: this.mapId, cams, party: this.party, speed: this.speed };
  }

  /** Write this run to its slot. `why` is 'auto' (quiet) or 'manual' (says so). */
  async saveToSlot(why = 'manual') {
    if (!this.slot || this.saving || !this.game || this.game.gameOver) return false;
    this.saving = true;
    try {
      const g = this.game, n = this.slot;
      const packed = await packSave(saveState(g, this.uiSnapshot()));
      const ok = storeSet(slotDataKey(n), packed) && storeSet(slotMetaKey(n), JSON.stringify(saveSummary(g, { name: this.colonyName || null, bytes: packed.length })));
      if (!ok) this.flash('Could not save — the browser refused (storage full or private window).', 'warn');
      else if (why === 'manual') this.flash(`Saved to slot ${n}`, 'good');
      else this.flash('Autosaved', 'info');
      return ok;
    } catch (e) {
      this.flash('Saving failed: ' + (e && e.message ? e.message : e), 'warn');
      return false;
    } finally { this.saving = false; }
  }

  /** Swap a game in: a loaded one, or a fresh one. Resets everything the old run left on screen. */
  installGame(game, ui = {}) {
    // Another colony replacing the hosted one closes the world first.
    if (this.coop && this.coop.role === 'host' && this.coop.host.game !== game) this.leaveCoop();
    this.game = game;
    this.seed = game.seedString;
    const r = this.renderer;
    this.lastLogLen = game.logs.length;
    this.sel = null; this.squad.clear(); this.visitors.length = 0; this.sigs = {};
    this.mapId = 0; this.cams = ui.cams || {};
    this.party = ui.party || { ids: [], set: false };
    this.lastAutoDay = game.day;
    r.game = game; r.selection = null; r.cacheVersion = -1; r.floaters = [];
    r.camX = game.world.start.x; r.camY = game.world.start.y;
    this.hide('#inspector'); this.hide('#gameover');
    this.drawer = null; this.renderRail(); this.renderDrawer();
    this.viewMap(ui.mapId && game.mapById(ui.mapId) ? ui.mapId : 0);
    if (ui.speed) this.speed = ui.speed;
  }

  async loadFromSlot(n) {
    const packed = storeGet(slotDataKey(n));
    if (!packed) { this.flash('That slot is empty.', 'warn'); return false; }
    try {
      const { game, ui } = loadState(await unpackSave(packed));
      const meta = slotMeta(n);
      this.colonyName = meta && meta.name;
      this.installGame(game, ui);
      this.slot = n;
      this.flash(`Loaded slot ${n} — day ${game.day}`, 'good');
      return true;
    } catch (e) {
      this.flash('This save could not be read: ' + (e && e.message ? e.message : e), 'warn');
      return false;
    }
  }

  /** A new colony in slot n: generate, save straight away so the slot is claimed. */
  startNewInSlot(n, seed, name) {
    this.newGame(seed || undefined);
    this.installGame(this.game);
    this.slot = n;
    this.colonyName = name || null;
    this.saveToSlot('auto');
  }

  // ------------------------------------------------------------ title --
  /**
   * The title screen: three save slots and the options. The last camp keeps
   * idling behind it, paused, so the game is the backdrop.
   */
  showTitle() {
    // Back at the title, a hosted world closes and a guest leaves.
    if (this.coop && (this.coop.role === 'host' || this.coop.live)) this.leaveCoop();
    this.paused = true;
    this.hideGameMenu(); this.hide('#options'); this.hide('#modal');
    const box = $('#title');
    box.classList.remove('hidden');
    const ago = (t) => {
      const m = Math.round((Date.now() - t) / 60000);
      return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
    };
    const slots = [];
    for (let n = 1; n <= SAVE_SLOTS; n++) {
      const meta = slotMeta(n);
      slots.push(meta ? `<div class="ts-slot full" data-slot="${n}">
          <div class="ts-n">Slot ${n}</div>
          <div class="ts-name">${esc(meta.name || (BIOMES[meta.biome] ? BIOMES[meta.biome].name + ' camp' : 'A camp'))}</div>
          <div class="ts-sub">Day ${meta.day} · ${esc(meta.season || '')}, year ${meta.year || 1}</div>
          <div class="ts-stats"><span>👥 ${meta.pop}</span><span class="rk-${esc(meta.rank || 'E')}">🌀 Rift ${esc(meta.rank || 'E')} · Lv ${meta.level}</span></div>
          <div class="ts-when">saved ${ago(meta.savedAt)} · seed ${esc(meta.seed)}</div>
          <div class="ts-acts"><button class="act primary" data-act="load">Continue</button><button class="act" data-act="del" title="Delete this save">🗑</button></div>
        </div>` : `<div class="ts-slot empty" data-slot="${n}">
          <div class="ts-n">Slot ${n}</div>
          <div class="ts-name dim">Empty</div>
          <div class="ts-sub">A new camp at a new Rift.</div>
          <div class="ts-acts"><button class="act primary" data-act="new">New colony</button></div>
        </div>`);
    }
    box.innerHTML = `<div class="ts-join">
        <label for="ts-code">Join World</label>
        <div class="ts-join-row"><input id="ts-code" maxlength="4" inputmode="numeric" autocomplete="off" placeholder="0000" aria-label="4-digit world code"><button class="act primary" data-act="join">Join</button></div>
        <div class="ts-join-msg mini"></div>
      </div>
      <div class="ts-wrap">
        <div class="ts-logo">RIFT GATE</div>
        <div class="ts-tag">SSS Class Dungeon Colony Sim</div>
        <div class="ts-slots">${slots.join('')}</div>
        <div class="ts-foot"><button class="act" data-act="options">🛠️ Options</button></div>
        <div class="ts-note">Runs autosave every dawn. When the colony falls, its save is gone.</div>
      </div>`;
    box.onclick = async (e) => {
      const b = e.target.closest && e.target.closest('button'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'options') { this.showOptions(); return; }
      if (act === 'join') { this.titleJoin(); return; }
      const n = +b.closest('[data-slot]').dataset.slot;
      if (act === 'load') { if (await this.loadFromSlot(n)) this.hideTitle(); }
      else if (act === 'new') this.showNewColony(n);
      else if (act === 'del') {
        if (b.dataset.armed) { deleteSlot(n); this.showTitle(); }
        else { b.dataset.armed = '1'; b.textContent = 'Delete?'; b.classList.add('danger'); }
      }
    };
    const code = $('#ts-code');
    if (code) {
      code.oninput = () => { code.value = code.value.replace(/\D/g, '').slice(0, 4); };
      code.onkeydown = (e) => { if (e.key === 'Enter') this.titleJoin(); };
    }
  }

  /** The Join World box on the title screen. */
  titleJoin() {
    const inp = $('#ts-code'), msg = $('#title .ts-join-msg');
    const code = (inp && inp.value || '').trim();
    const status = (text, kind) => { if (msg) { msg.textContent = text; msg.className = 'ts-join-msg mini ' + (kind || ''); } };
    this.joinCoop(code, status);
  }

  hideTitle() {
    $('#title').classList.add('hidden');
    this.paused = false;
    this.renderTop();
  }

  /** New colony: a name and, for the curious, a seed. */
  showNewColony(n) {
    const box = $('#title');
    box.innerHTML = `<div class="ts-wrap">
        <div class="ts-logo small">New colony</div>
        <div class="ts-tag">Slot ${n}</div>
        <div class="ts-form">
          <label>Name <input id="nc-name" maxlength="28" placeholder="The Camp at the Gate"></label>
          <label>Seed <input id="nc-seed" maxlength="24" placeholder="random"></label>
          <div class="mini">The same seed gives the same region, the same Rift and the same first colonists.</div>
          <div class="ts-acts"><button class="act" data-act="back">Back</button><button class="act primary" data-act="go">Pitch camp</button></div>
        </div>
      </div>`;
    box.onclick = (e) => {
      const b = e.target.closest && e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'back') { this.showTitle(); return; }
      if (b.dataset.act === 'go') {
        const name = ($('#nc-name').value || '').trim(), seed = ($('#nc-seed').value || '').trim();
        this.startNewInSlot(n, seed, name);
        this.hideTitle();
      }
    };
    const inp = $('#nc-name'); if (inp && inp.focus) inp.focus();
  }

  // ---------------------------------------------------------- options --
  static OPTION_ROWS = [
    ['autosave', 'Autosave', 'Save to the colony\'s slot at every dawn, and when you leave the tab.'],
    ['hoverInfo', 'Hover cards', 'The small card that follows the pointer over the map.'],
    ['pauseOnFight', 'Pause when a fight starts', 'Stop the clock the moment anything comes to blows, anywhere.'],
    ['damageNumbers', 'Damage numbers', 'Numbers and words that float up off whoever is hit.'],
    ['reduceMotion', 'Reduce motion', 'No wobble on hover and no lunges; units still slide between tiles.'],
    ['edgeFog', 'Fog at the map\'s edge', 'The drifting dark around the border of every map.'],
  ];

  showOptions() {
    const box = $('#options');
    box.classList.remove('hidden');
    const render = () => {
      box.innerHTML = `<div class="op-card">
          <h3>🛠️ Options <button class="d-close" data-act="close" title="Close (Esc)">✕</button></h3>
          ${UI.OPTION_ROWS.map(([k, name, desc]) => `<label class="op-row">
            <span><b>${name}</b><em>${desc}</em></span>
            <input type="checkbox" data-opt="${k}"${this.opts[k] ? ' checked' : ''}><i class="op-sw"></i></label>`).join('')}
          <div class="mini op-credit">Icons: Shikashi's Fantasy Icons Pack by Shikashi (CC BY 4.0), after designs from game-icons.net (CC BY 3.0).</div>
        </div>`;
    };
    render();
    box.onclick = (e) => {
      if (e.target === box || (e.target.closest && e.target.closest('[data-act="close"]'))) { this.hide('#options'); return; }
    };
    box.onchange = (e) => {
      const k = e.target.dataset && e.target.dataset.opt; if (!k) return;
      this.opts[k] = !!e.target.checked;
      storeOptions(this.opts);
      this.applyOptions();
    };
  }

  /** Push the options into the parts of the game that read them. */
  applyOptions() {
    this.hoverInfo = this.opts.hoverInfo;
    if (!this.hoverInfo && this.tipSrc === 'map') this.hideTip();
    const r = this.renderer;
    if (r) { r.showNumbers = this.opts.damageNumbers; r.reduceMotion = this.opts.reduceMotion; r.edgeFog = this.opts.edgeFog; }
    this.renderTop();
  }

  // -------------------------------------------------------- game menu --
  showGameMenu(refresh = false) {
    const box = $('#gamemenu');
    // In co-op the clock is everyone's, so the menu doesn't stop it.
    if (!refresh && !this.coop) { this.menuWasPaused = this.paused; this.paused = true; }
    this.renderTop();
    box.classList.remove('hidden');
    const c = this.coop;
    const coopHtml = !c ? `<button class="act" data-act="coop"${this.coopBusy ? ' disabled' : ''} data-tipt="Let up to 3 friends into this colony. They type the 4-digit code into Join World on their title screen.">🤝 ${this.coopBusy ? 'Opening…' : 'Open to Co-op'}</button>`
      : c.role === 'host' ? `<div class="gm-coop"><div class="mini">Co-op is open. Friends join with</div><div class="gm-code">${c.code}</div>
          <div class="mini">${c.host.players.length} of 4 players · ${c.host.guests.map(p => esc(p.name) + ' ' + (p.id + 1)).join(', ') || 'waiting for friends'}</div></div>
          <button class="act" data-act="coopclose">Close co-op</button>`
      : `<div class="gm-coop"><div class="mini">You are a guest in world</div><div class="gm-code">${c.code}</div></div>
          <button class="act" data-act="coopleave">Leave world</button>`;
    box.innerHTML = `<div class="gm-card">
        <div class="gm-h">${this.coop ? 'Menu' : 'Paused'}</div>
        <button class="act primary" data-act="resume">Resume</button>
        ${coopHtml}
        <button class="act" data-act="save"${this.slot ? '' : ' disabled title="This run has no save slot (it was started from a ?seed= link)"'}>💾 Save now${this.slot ? ` (slot ${this.slot})` : ''}</button>
        <button class="act" data-act="options">🛠️ Options</button>
        <button class="act" data-act="help">❓ Controls</button>
        <button class="act" data-act="quit">${this.slot ? 'Save & quit to title' : 'Quit to title'}</button>
      </div>`;
    box.onclick = async (e) => {
      if (e.target === box) { this.hideGameMenu(); return; }
      const b = e.target.closest && e.target.closest('button'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'resume') this.hideGameMenu();
      else if (act === 'save') await this.saveToSlot('manual');
      else if (act === 'options') this.showOptions();
      else if (act === 'help') { this.hideGameMenu(); this.toggleHelp(); }
      else if (act === 'quit') { await this.saveToSlot('auto'); this.hideGameMenu(); this.showTitle(); }
      else if (act === 'coop') { this.openCoop(); this.showGameMenu(true); }
      else if (act === 'coopclose') { this.leaveCoop(); this.showGameMenu(true); }
      else if (act === 'coopleave') { this.hideGameMenu(); this.leaveCoop(); }
    };
  }

  hideGameMenu() {
    const box = $('#gamemenu');
    if (!box || box.classList.contains('hidden')) return;
    box.classList.add('hidden');
    if (!this.coop) this.paused = !!this.menuWasPaused;
    this.renderTop();
  }
}
