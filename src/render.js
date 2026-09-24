// ============================================================================
// CANVAS RENDERER.
//
// Two layers:
//   terrain    — ground, moss, water, rock and everything growing on it, painted
//                procedurally into an offscreen canvas at a fixed resolution and
//                patched tile-by-tile when the world changes (a mined tile
//                repaints a 5×5 patch, not the whole map).
//   the frame  — structures, people, animals, light, drawn every frame in
//                "tile units": each piece of art is authored on a 0..1 square
//                and the transform scales it, so a bed is a bed at any zoom.
//
// STRUCTURES. Adjacent buildings of one kind are read as one structure: five
// beds in a row are a barracks with a plank floor, walls, a door and a name
// plate, not five loose icons. The bigger the room, the bigger the building.
//
// READING THE MAP. People are discs, animals are rounded squares, loose items
// are diamonds — shape carries identity at any zoom, emoji ride on top once the
// tiles are big enough to hold them.
// ============================================================================
import { TERRAIN, FEATURES, T, anchorFor } from './world.js';
import { BUILDINGS, FLOORS, RACES } from './data.js';
import { ANIMALS } from './husbandry.js';
import { BIOMES, SITE_KINDS } from './overworld.js';
import { CROPS, growthStage } from './farming.js';
import { BIOMES_RIFT } from './biomes.js';
import { STATUSES } from './elements.js';
import { SpriteBook, ALLEGIANCE, spriteFloats, SPRITE_N } from './sprites.js';
import { pxOf, pxCanvas } from './pixicons.js';
import {
  EMOJI_FONT, RACE_ICON, ANIMAL_ICON, BUILDING_ICON, SITE_ICON, moodStatus, STATUS,
} from './icons.js';

const MIN_EMOJI_TILE = 11;
export const TILE_MIN = 10, TILE_MAX = 72, TILE_DEFAULT = 40;
const UI_FONT = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';
const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// What a ranged shot looks like in flight, by damage type.
const SHOT_COLOR = { fire: '#ff8a3a', frost: '#9fe0ff', storm: '#fff27a', nature: '#8fe06a', holy: '#fff0b0', shadow: '#b07ae0', arcane: '#d59aff', pierce: '#e8dcc0', slash: '#e8dcc0', crush: '#e8dcc0' };
// Tasks that earn the busy hourglass: someone at a bench, a seam or a blueprint.
const BUSY_KINDS = { mine: 1, harvest: 1, build: 1, floor: 1, craft: 1, research: 1, train: 1, pray: 1, heal: 1, plant: 1, farmTend: 1, farmHarvest: 1, compost: 1, tame: 1, gather: 1, butcher: 1, joy: 1 };
// Tasks whose progress gets a bar over the tile (blueprints draw their own).
const BAR_KINDS = { mine: 1, harvest: 1, craft: 1, research: 1, train: 1, pray: 1, heal: 1, plant: 1, farmTend: 1, farmHarvest: 1, compost: 1, tame: 1, gather: 1, butcher: 1 };

/** Deterministic 0..1 noise per (x, y, k). Art must repaint identically. */
function rhash(x, y, k = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((k | 0) + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Radial / linear gradients that degrade to a flat colour where unsupported. */
function radial(g, x, y, r0, r1, stops) {
  const gr = g.createRadialGradient ? g.createRadialGradient(x, y, r0, x, y, r1) : null;
  if (!gr || !gr.addColorStop) return stops[0][1];
  for (const [at, col] of stops) gr.addColorStop(at, col);
  return gr;
}
function linear(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient ? g.createLinearGradient(x0, y0, x1, y1) : null;
  if (!gr || !gr.addColorStop) return stops[0][1];
  for (const [at, col] of stops) gr.addColorStop(at, col);
  return gr;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
function fillRR(g, x, y, w, h, r, col) { roundRect(g, x, y, w, h, r); g.fillStyle = col; g.fill(); }
function disc(g, x, y, r, col) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = col; g.fill(); }
function oval(g, x, y, rx, ry, col, rot = 0) {
  g.beginPath();
  if (g.ellipse) g.ellipse(x, y, rx, ry, rot, 0, TAU); else g.arc(x, y, Math.max(rx, ry), 0, TAU);
  g.fillStyle = col; g.fill();
}
function line(g, x0, y0, x1, y1, col, w) {
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = col; g.lineWidth = w; g.stroke();
}

/**
 * Emoji are expensive to lay out and we draw the same few hundred every frame,
 * so each one is rasterised once at each size it is needed and then blitted.
 */
class EmojiAtlas {
  constructor() { this.cache = new Map(); this.ok = true; }
  get(char, size) {
    const px = Math.max(6, Math.round(size));
    const key = char + '@' + px;
    let c = this.cache.get(key);
    if (c !== undefined) return c;
    c = null;
    // Pixel icons first; one that isn't loaded yet is asked for again next frame.
    if (pxOf(char)) {
      const pc = pxCanvas(char, px);
      if (!pc) return null;
      this.cache.set(key, pc);
      return pc;
    }
    try {
      const cv = document.createElement('canvas');
      // Emoji overshoot their em box; a little padding keeps the edges intact.
      const dim = Math.ceil(px * 1.25);
      cv.width = dim; cv.height = dim;
      const g = cv.getContext('2d');
      if (g && g.fillText) {
        g.font = `${px}px ${EMOJI_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(char, dim / 2, dim / 2 + px * 0.06);
        c = cv;
      }
    } catch (e) { this.ok = false; }
    if (this.cache.size > 900) this.cache.clear();
    this.cache.set(key, c);
    return c;
  }
  /** Blit an emoji centred on a point. Returns false if emoji are unavailable. */
  draw(ctx, char, cx, cy, size, alpha = 1) {
    if (!char) return false;
    const img = this.get(char, size);
    if (!img || !img.width) return false;
    if (alpha !== 1) { ctx.save(); ctx.globalAlpha = alpha; }
    try { ctx.drawImage(img, cx - img.width / 2, cy - img.height / 2); } catch (e) { return false; }
    if (alpha !== 1) ctx.restore();
    return true;
  }
}

// ============================================================================
// TERRAIN
// ============================================================================
const GROUND = {
  dirt:   { base: '#58452f', dark: 'rgba(38,28,18,0.55)', light: 'rgba(140,112,78,0.35)' },
  gravel: { base: '#5c5546', dark: 'rgba(40,36,28,0.55)', light: 'rgba(150,142,120,0.5)' },
  rift:   { base: '#22182b', dark: 'rgba(10,4,16,0.6)',   light: 'rgba(150,90,200,0.25)' },
};
const MOSS = ['#3d5a33', '#43623a', '#39552f'];
const ROCK = { top: '#5d5c64', top2: '#56555d', face: '#34333a', lip: '#7c7b85', crack: 'rgba(30,30,36,0.55)' };
const TREE_PALETTES = [
  ['#1f3d1f', '#2e5a2a', '#3f7836', '#63a24c'],   // deep green
  ['#1d3b2c', '#2a5741', '#3a7556', '#5fa37a'],   // cavern teal
  ['#2a3f1c', '#40602a', '#587f36', '#86ad52'],   // olive
];

// ============================================================================
// TERRAIN SKINS
// Every camp biome (the region biome the colony sits in) and every Rift biome
// paints the same terrain types in its own materials: its dirt, its sand or
// gravel, what its "grass" is (moss, snow, scrub, fungus carpet...), its rock,
// its trees, its water, and one kind of surface detail scattered over the
// ground. Unlisted fields fall back to BASE_SKIN, the original look.
// ============================================================================
const BASE_SKIN = {
  dirt: GROUND.dirt, sand: { ...GROUND.gravel, dunes: false },
  moss: MOSS, blade: 'rgba(120,170,90,0.55)', bladeDark: 'rgba(20,35,15,0.5)',
  rock: ROCK, trees: TREE_PALETTES, conifer: 0.3,
  water: { deep: '#1e3a57', band: '90,140,170', hi: 'rgba(150,195,235,0.18)', bank: 'rgba(40,34,24,0.85)' },
  deco: null, decoRate: 0, wash: null,
};
const rockOf = (top, top2, face, lip, crack = 'rgba(30,30,36,0.55)') => ({ top, top2, face, lip, crack });
const soil = (base, dark, light) => ({ base, dark, light });
const SKINS = {
  // --- camp biomes --------------------------------------------------------
  grassland: { dirt: soil('#6a5536', 'rgba(44,32,18,0.5)', 'rgba(170,140,90,0.35)'), moss: ['#4f7a36', '#58853c', '#4a7232'], blade: 'rgba(150,200,100,0.6)',
    deco: 'flowers', decoRate: 0.22, rock: rockOf('#7a766c', '#716d64', '#48443c', '#98938a') },
  forest:    { dirt: soil('#4f3d28', 'rgba(30,22,12,0.55)', 'rgba(130,100,60,0.3)'), moss: ['#35562c', '#3b5f30', '#304f28'], deco: 'leaves', decoRate: 0.3,
    trees: [TREE_PALETTES[0], TREE_PALETTES[2], ['#243a18', '#365a22', '#4c7a2e', '#79a848']], conifer: 0.2 },
  deepwood:  { dirt: soil('#3a2e22', 'rgba(20,14,8,0.6)', 'rgba(110,90,60,0.25)'), moss: ['#263f22', '#2b4626', '#22381f'], blade: 'rgba(90,140,80,0.5)', deco: 'roots', decoRate: 0.18,
    trees: [['#132b17', '#1d3d20', '#2a5429', '#437a3a'], TREE_PALETTES[1]], conifer: 0.35 },
  taiga:     { dirt: soil('#4a4034', 'rgba(26,22,16,0.55)', 'rgba(150,140,120,0.3)'), moss: ['#3c5040', '#415746', '#37493b'], blade: 'rgba(140,170,140,0.5)', deco: 'needles', decoRate: 0.3,
    trees: [['#16302a', '#21443a', '#2e5a4c', '#4f8272'], ['#1a3322', '#27482f', '#36603f', '#5a8a62']], conifer: 0.9 },
  tundra:    { dirt: soil('#6f6a64', 'rgba(40,38,36,0.45)', 'rgba(220,225,230,0.35)'), sand: { ...soil('#8a8680', 'rgba(50,48,46,0.5)', 'rgba(230,232,236,0.5)'), dunes: false },
    moss: ['#dfe6ec', '#e8eef2', '#d4dce4'], blade: 'rgba(170,190,205,0.45)', bladeDark: 'rgba(120,140,160,0.35)', deco: 'snow', decoRate: 0.4,
    rock: rockOf('#8c929a', '#848a92', '#4f545c', '#e9eef3'), trees: [['#1e3530', '#2c4a44', '#3d625a', '#dfe8e8']], conifer: 1,
    water: { deep: '#3d5a70', band: '200,225,240', hi: 'rgba(235,245,255,0.35)', bank: 'rgba(90,96,104,0.85)' } },
  hills:     { dirt: soil('#5f4c32', 'rgba(38,28,16,0.5)', 'rgba(160,130,90,0.3)'), moss: ['#4a6a34', '#52743a', '#43612f'], deco: 'pebbles', decoRate: 0.25,
    rock: rockOf('#6f6a5e', '#676256', '#403c33', '#8e8878') },
  highland:  { dirt: soil('#5a5040', 'rgba(34,28,20,0.5)', 'rgba(170,160,140,0.3)'), moss: ['#5a6a44', '#62734a', '#52613e'], blade: 'rgba(170,180,130,0.5)', deco: 'heather', decoRate: 0.2,
    rock: rockOf('#6d6a68', '#65625f', '#3c3a38', '#8b8885') },
  mountain:  { deco: 'pebbles', decoRate: 0.18 },
  marsh:     { dirt: soil('#3e3a2a', 'rgba(20,20,12,0.6)', 'rgba(110,120,80,0.3)'), moss: ['#3d5236', '#44593a', '#374a31'], blade: 'rgba(130,160,90,0.55)', deco: 'reeds', decoRate: 0.22,
    water: { deep: '#26382e', band: '90,120,90', hi: 'rgba(170,200,160,0.18)', bank: 'rgba(32,34,22,0.85)' }, trees: [['#1f3322', '#2c4a2e', '#3d633c', '#6a8a52']], conifer: 0.1 },
  coast:     { dirt: soil('#6e5e44', 'rgba(44,36,22,0.45)', 'rgba(200,180,140,0.35)'), sand: { ...soil('#b9a577', 'rgba(120,100,60,0.35)', 'rgba(240,228,190,0.45)'), dunes: true },
    moss: ['#58743c', '#5f7d42', '#526b37'], deco: 'shells', decoRate: 0.12,
    water: { deep: '#1d4a66', band: '110,180,200', hi: 'rgba(200,235,250,0.3)', bank: 'rgba(150,130,90,0.7)' } },
  desert:    { dirt: soil('#a07a4c', 'rgba(90,60,30,0.4)', 'rgba(230,200,150,0.35)'), sand: { ...soil('#c9a86a', 'rgba(140,105,55,0.35)', 'rgba(245,225,170,0.5)'), dunes: true },
    moss: ['#7d7a44', '#86824a', '#737040'], blade: 'rgba(180,170,100,0.55)', deco: 'cracks', decoRate: 0.3,
    rock: rockOf('#a07e5c', '#987656', '#664a32', '#c29c74', 'rgba(80,50,30,0.5)'), trees: [['#3e4a1e', '#566628', '#6f8034', '#98a850']], conifer: 0 },
  badlands:  { dirt: soil('#8a5638', 'rgba(70,36,20,0.45)', 'rgba(210,150,110,0.3)'), sand: { ...soil('#a8744c', 'rgba(110,60,30,0.4)', 'rgba(230,180,130,0.4)'), dunes: false },
    moss: ['#6e6a3a', '#76723f', '#656135'], blade: 'rgba(170,150,90,0.5)', deco: 'cracks', decoRate: 0.35,
    rock: rockOf('#94593c', '#8b5337', '#5a3322', '#b8764f', 'rgba(60,30,18,0.55)'), trees: [['#40401c', '#585a26', '#707432', '#96984c']], conifer: 0.2 },
  ashland:   { dirt: soil('#3e3a3c', 'rgba(16,14,16,0.6)', 'rgba(140,130,130,0.3)'), sand: { ...soil('#4c4648', 'rgba(20,18,20,0.55)', 'rgba(170,160,160,0.3)'), dunes: false },
    moss: ['#4a4a40', '#525246', '#43433a'], blade: 'rgba(120,120,100,0.4)', deco: 'embers', decoRate: 0.14,
    rock: rockOf('#3c383c', '#353236', '#1e1b1e', '#5a5458', 'rgba(230,90,40,0.35)'), trees: [['#262222', '#3a3232', '#4e4442', '#6e605a']], conifer: 0.5,
    water: { deep: '#3a1a12', band: '240,120,50', hi: 'rgba(255,170,90,0.35)', bank: 'rgba(30,20,18,0.9)' } },

  // --- Rift biomes --------------------------------------------------------
  goblin_warrens:  { dirt: soil('#5a4a30', 'rgba(34,26,14,0.55)', 'rgba(150,130,80,0.3)'), moss: ['#56602e', '#5e6832', '#4e582a'], deco: 'bones', decoRate: 0.1,
    rock: rockOf('#5e5a48', '#575342', '#35322a', '#7a7560') },
  beast_hollows:   { dirt: soil('#4a3c26', 'rgba(26,20,10,0.55)', 'rgba(130,110,70,0.3)'), moss: ['#3e6230', '#456a35', '#38582b'], deco: 'leaves', decoRate: 0.25 },
  bandit_stronghold: { dirt: soil('#5c4a36', 'rgba(34,26,16,0.5)', 'rgba(170,140,100,0.3)'), deco: 'straw', decoRate: 0.2,
    rock: rockOf('#6e6254', '#66594c', '#3e352c', '#8c7e6c') },
  fungal_depths:   { dirt: soil('#2e3a36', 'rgba(10,20,18,0.6)', 'rgba(110,190,160,0.25)'), moss: ['#2f5a4e', '#346456', '#2a5046'], blade: 'rgba(120,230,190,0.5)', deco: 'spores', decoRate: 0.3,
    rock: rockOf('#3e4a48', '#384442', '#1e2826', '#5a6a66') },
  sunken_crypt:    { dirt: soil('#3a3640', 'rgba(14,12,18,0.6)', 'rgba(140,130,160,0.25)'), sand: { ...soil('#4a4652', 'rgba(20,18,26,0.55)', 'rgba(170,160,190,0.3)'), dunes: false },
    moss: ['#3c4a44', '#42504a', '#36423e'], deco: 'flagstones', decoRate: 0.5, rock: rockOf('#4e4a58', '#48445a', '#26232e', '#6e6a7c') },
  collapsed_mine:  { dirt: soil('#4c4030', 'rgba(26,20,12,0.55)', 'rgba(150,130,100,0.3)'), deco: 'rubble', decoRate: 0.3, rock: rockOf('#6a5e4e', '#625646', '#3a3228', '#8a7c68') },
  web_hive:        { dirt: soil('#3a3040', 'rgba(16,10,20,0.6)', 'rgba(200,180,220,0.25)'), moss: ['#43384e', '#4a3e56', '#3c3246'], blade: 'rgba(210,200,230,0.35)', deco: 'webs', decoRate: 0.18,
    rock: rockOf('#4a4252', '#443c4c', '#241e2a', '#6a607a') },
  drowned_grotto:  { dirt: soil('#3a4644', 'rgba(14,22,22,0.6)', 'rgba(120,180,180,0.3)'), moss: ['#2e5550', '#335c56', '#294c48'], deco: 'puddles', decoRate: 0.3,
    water: { deep: '#14465a', band: '90,190,210', hi: 'rgba(170,240,255,0.3)', bank: 'rgba(24,40,40,0.85)' }, rock: rockOf('#4a5a5c', '#445456', '#243234', '#6e8286') },
  ember_forge:     { dirt: soil('#3e2c24', 'rgba(20,10,6,0.6)', 'rgba(230,120,60,0.25)'), sand: { ...soil('#4a3428', 'rgba(24,12,8,0.55)', 'rgba(240,140,70,0.3)'), dunes: false },
    moss: ['#4a3026', '#52362a', '#442a22'], blade: 'rgba(240,130,60,0.4)', deco: 'embers', decoRate: 0.25,
    rock: rockOf('#4a3a34', '#44342e', '#24180f', '#6e5448', 'rgba(255,120,40,0.45)'),
    water: { deep: '#5a1e0c', band: '255,140,50', hi: 'rgba(255,200,120,0.4)', bank: 'rgba(40,20,14,0.9)' } },
  rime_caverns:    { dirt: soil('#56606a', 'rgba(26,32,40,0.5)', 'rgba(210,235,250,0.35)'), sand: { ...soil('#6a7680', 'rgba(30,40,50,0.5)', 'rgba(220,240,255,0.45)'), dunes: false },
    moss: ['#cfe2ee', '#d8eaf4', '#c4d8e6'], blade: 'rgba(160,200,230,0.45)', bladeDark: 'rgba(110,150,180,0.35)', deco: 'frost', decoRate: 0.35,
    rock: rockOf('#7a8c9a', '#728492', '#3e4c58', '#dff0fa'), water: { deep: '#5a88a8', band: '210,240,255', hi: 'rgba(240,250,255,0.5)', bank: 'rgba(120,140,155,0.8)' } },
  feywild_hollow:  { dirt: soil('#4a4034', 'rgba(26,20,14,0.5)', 'rgba(220,200,160,0.3)'), moss: ['#4e8a5a', '#56946a', '#467c52'], blade: 'rgba(170,240,190,0.6)', deco: 'glow', decoRate: 0.25,
    trees: [['#1e4a3a', '#2e6a52', '#46906e', '#8ad0a4'], ['#3a2a5a', '#52407a', '#6e5ca0', '#b8a8e8']], conifer: 0.1 },
  arcane_sanctum:  { dirt: soil('#34364a', 'rgba(14,14,26,0.6)', 'rgba(150,170,240,0.3)'), sand: { ...soil('#40425a', 'rgba(18,18,30,0.55)', 'rgba(170,190,250,0.3)'), dunes: false },
    moss: ['#3a3f66', '#40466e', '#343860'], blade: 'rgba(150,170,255,0.45)', deco: 'runes', decoRate: 0.12, rock: rockOf('#4c4e6a', '#464862', '#24253a', '#7478a0') },
  infernal_breach: { dirt: soil('#40221e', 'rgba(24,8,6,0.6)', 'rgba(230,90,70,0.25)'), sand: { ...soil('#4e2824', 'rgba(26,10,8,0.55)', 'rgba(240,110,80,0.3)'), dunes: false },
    moss: ['#4a2426', '#52282a', '#442022'], blade: 'rgba(240,90,80,0.4)', deco: 'embers', decoRate: 0.3,
    rock: rockOf('#4a2c2c', '#442828', '#241212', '#6e3e3a', 'rgba(255,80,60,0.5)'),
    water: { deep: '#6a1a0e', band: '255,110,50', hi: 'rgba(255,190,110,0.45)', bank: 'rgba(40,14,12,0.9)' } },
  aberrant_deep:   { dirt: soil('#2e2636', 'rgba(12,8,16,0.6)', 'rgba(190,130,230,0.25)'), moss: ['#3e2e52', '#44325a', '#382a4a'], blade: 'rgba(210,140,250,0.45)', deco: 'spores', decoRate: 0.25,
    rock: rockOf('#403850', '#3a324a', '#1c1624', '#62587a', 'rgba(200,120,255,0.4)') },
  dragons_lair:    { dirt: soil('#4a3626', 'rgba(26,16,8,0.55)', 'rgba(230,180,90,0.3)'), deco: 'coins', decoRate: 0.14,
    rock: rockOf('#5a4636', '#54402f', '#2e2218', '#7e644c', 'rgba(255,150,60,0.4)') },
};
SKINS.ocean = SKINS.coast;
const SKIN_CACHE = new Map();
/** The painter's materials for a map: its Rift biome on a floor, its region biome at camp. */
export function skinFor(world) {
  const key = world.riftBiome || world.biome || '';
  let sk = SKIN_CACHE.get(key);
  if (!sk) { sk = { ...BASE_SKIN, ...(SKINS[key] || {}) }; SKIN_CACHE.set(key, sk); }
  return sk;
}

/**
 * Paints the terrain layer. The canvas is P pixels per tile regardless of the
 * zoom (the frame scales it), so zooming never repaints; a changed tile
 * repaints only the patch around it because every stroke is seeded by rhash.
 */
class TerrainPainter {
  constructor(world, P) {
    this.world = world; this.P = P;
    this.canvas = document.createElement('canvas');
    this.canvas.width = world.w * P; this.canvas.height = world.h * P;
    this.g = this.canvas.getContext('2d');
    this.snapT = new Uint8Array(world.terrain.length);
    this.snapF = new Array(world.terrain.length).fill(null);
    this.full();
  }
  full() {
    const w = this.world;
    this.paint(0, 0, w.w - 1, w.h - 1);
    this.snapT.set(w.terrain);
    for (let i = 0; i < w.feature.length; i++) this.snapF[i] = w.feature[i];
  }
  /** Diff against the last paint and patch what moved. Cheap enough per frame. */
  sync() {
    const w = this.world, n = w.terrain.length;
    let changed = null;
    for (let i = 0; i < n; i++) {
      if (w.terrain[i] !== this.snapT[i] || w.feature[i] !== this.snapF[i]) {
        (changed || (changed = [])).push(i);
        this.snapT[i] = w.terrain[i]; this.snapF[i] = w.feature[i];
      }
    }
    if (!changed) return;
    if (changed.length > 80) { this.full(); return; }
    for (const i of changed) {
      const x = i % w.w, y = (i / w.w) | 0;
      this.paint(x - 2, y - 2, x + 2, y + 2);
    }
  }

  get skin() { return skinFor(this.world); }
  rockAt(x, y) { const w = this.world; return !w.inside(x, y) || w.terrain[w.idx(x, y)] === T.ROCK; }
  terrAt(x, y) { const w = this.world; return w.inside(x, y) ? w.terrain[w.idx(x, y)] : T.ROCK; }
  at(x, y) { const P = this.P; this.g.setTransform(P, 0, 0, P, x * P, y * P); }

  paint(cx0, cy0, cx1, cy1) {
    const w = this.world, g = this.g, P = this.P;
    cx0 = Math.max(0, cx0); cy0 = Math.max(0, cy0);
    cx1 = Math.min(w.w - 1, cx1); cy1 = Math.min(w.h - 1, cy1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.save();
    g.beginPath(); g.rect(cx0 * P, cy0 * P, (cx1 - cx0 + 1) * P, (cy1 - cy0 + 1) * P); g.clip();
    g.fillStyle = '#0c0d11';
    g.fillRect(cx0 * P, cy0 * P, (cx1 - cx0 + 1) * P, (cy1 - cy0 + 1) * P);
    const each = (m, fn) => {
      const ya = Math.max(0, cy0 - m), yb = Math.min(w.h - 1, cy1 + m);
      const xa = Math.max(0, cx0 - m), xb = Math.min(w.w - 1, cx1 + m);
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) fn.call(this, x, y, w.idx(x, y));
    };
    each(1, this.ground);
    each(1, this.moss);
    each(1, this.bank);
    each(1, this.liquid);
    each(1, this.rockShadow);
    each(1, this.rock);
    g.setTransform(1, 0, 0, 1, 0, 0);
    each(4, this.blotch);
    each(2, this.feature);
    if (w.riftBiome) this.floorDressing(cx0, cy0, cx1, cy1);
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * A Rift floor's own look, baked into the terrain layer: the biome's colour
   * washed over everything, then the stairs (or the lair's mark) on top.
   */
  floorDressing(cx0, cy0, cx1, cy1) {
    const w = this.world, g = this.g, P = this.P;
    const B = BIOMES_RIFT[w.riftBiome];
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (B && B.color) {
      g.save();
      g.globalCompositeOperation = 'soft-light';
      g.globalAlpha = SKINS[w.riftBiome] ? 0.22 : 0.55;
      g.fillStyle = B.color;
      g.fillRect(cx0 * P, cy0 * P, (cx1 - cx0 + 1) * P, (cy1 - cy0 + 1) * P);
      g.restore();
    }
    const inPatch = (s) => s && s.x >= cx0 - 1 && s.x <= cx1 + 1 && s.y >= cy0 - 1 && s.y <= cy1 + 1;
    if (inPatch(w.stairsUp)) { this.at(w.stairsUp.x, w.stairsUp.y); this.stairs(true); }
    if (inPatch(w.stairsDown)) { this.at(w.stairsDown.x, w.stairsDown.y); this.stairs(false); }
    if (inPatch(w.lair)) { this.at(w.lair.x, w.lair.y); this.lairMark(); }
  }

  /** Stone steps in a frame: up ones rise toward the light, down ones sink into a black mouth. */
  stairs(up) {
    const g = this.g;
    fillRR(g, 0.02, 0.04, 0.96, 0.94, 0.08, 'rgba(0,0,0,0.55)');
    fillRR(g, 0.06, 0.06, 0.88, 0.86, 0.06, up ? '#6b6470' : '#1a1520');
    for (let k = 0; k < 4; k++) {
      const y = 0.14 + k * 0.19, inset = up ? k * 0.05 : (3 - k) * 0.05;
      const shade = up ? 150 - k * 22 : 40 + k * 26;
      g.fillStyle = `rgb(${shade},${shade - 6},${shade - 2})`;
      g.fillRect(0.12 + inset, y, 0.76 - inset * 2, 0.13);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0.12 + inset, y + 0.11, 0.76 - inset * 2, 0.03);
    }
    // An arrow so up and down can't be mixed up at a glance.
    g.beginPath();
    if (up) { g.moveTo(0.5, 0.18); g.lineTo(0.66, 0.36); g.lineTo(0.34, 0.36); }
    else { g.moveTo(0.5, 0.82); g.lineTo(0.66, 0.64); g.lineTo(0.34, 0.64); }
    g.closePath(); g.fillStyle = up ? '#f2e3b3' : '#e8b347'; g.fill();
    g.strokeStyle = '#120d16'; g.lineWidth = 0.035; g.stroke();
  }

  lairMark() {
    const g = this.g;
    g.fillStyle = radial(g, 0.5, 0.5, 0, 0.9, [[0, 'rgba(200,40,60,0.55)'], [1, 'rgba(200,40,60,0)']]);
    g.fillRect(-0.4, -0.4, 1.8, 1.8);
    disc(g, 0.5, 0.52, 0.3, '#2a0d14');
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU;
      line(g, 0.5 + Math.cos(a) * 0.3, 0.52 + Math.sin(a) * 0.3, 0.5 + Math.cos(a) * 0.42, 0.52 + Math.sin(a) * 0.42, '#d24a5a', 0.05);
    }
  }

  /** Rift props: chests, cages, altars and the rest, each a small still life. */
  prop(f, x, y) {
    const g = this.g, kind = FEATURES[f].prop, col = FEATURES[f].color;
    oval(g, 0.52, 0.86, 0.4, 0.12, 'rgba(0,0,0,0.38)');
    const dark = '#120d16';
    switch (kind) {
      case 'chest': case 'hoard': {
        if (kind === 'hoard') {
          for (let k = 0; k < 14; k++) disc(g, 0.15 + rhash(x, y, 500 + k) * 0.7, 0.55 + rhash(x, y, 520 + k) * 0.3, 0.07, k & 1 ? '#f0cc5a' : '#c99a30');
        }
        fillRR(g, 0.18, 0.4, 0.64, 0.42, 0.05, dark);
        fillRR(g, 0.21, 0.43, 0.58, 0.36, 0.04, '#8a5a2c');
        fillRR(g, 0.21, 0.36, 0.58, 0.16, 0.06, '#a8773a');
        g.fillStyle = '#d8b04a'; g.fillRect(0.3, 0.36, 0.06, 0.43); g.fillRect(0.64, 0.36, 0.06, 0.43);
        fillRR(g, 0.45, 0.5, 0.1, 0.12, 0.02, '#f0d070');
        return;
      }
      case 'vault': {
        // A squat iron-banded strongbox set into a stone plinth, with a big lock.
        fillRR(g, 0.1, 0.5, 0.8, 0.36, 0.04, '#4a4a52');
        fillRR(g, 0.1, 0.46, 0.8, 0.1, 0.03, '#6a6a74');
        fillRR(g, 0.18, 0.2, 0.64, 0.34, 0.05, dark);
        fillRR(g, 0.21, 0.23, 0.58, 0.28, 0.04, '#6a5a4a');
        g.fillStyle = '#9a9aa6'; g.fillRect(0.21, 0.3, 0.58, 0.05); g.fillRect(0.21, 0.42, 0.58, 0.05);
        disc(g, 0.5, 0.38, 0.09, '#c9a23c');
        g.fillStyle = dark; g.fillRect(0.485, 0.36, 0.03, 0.07);
        return;
      }
      case 'cage': {
        fillRR(g, 0.16, 0.2, 0.68, 0.64, 0.04, 'rgba(20,16,24,0.55)');
        disc(g, 0.5, 0.6, 0.12, '#6a5a50');
        for (let k = 0; k < 6; k++) line(g, 0.2 + k * 0.12, 0.2, 0.2 + k * 0.12, 0.84, '#9aa0aa', 0.035);
        line(g, 0.16, 0.2, 0.84, 0.2, '#b6bcc6', 0.06); line(g, 0.16, 0.84, 0.84, 0.84, '#7a8088', 0.06);
        return;
      }
      case 'rack': {
        line(g, 0.2, 0.2, 0.2, 0.86, '#5a3c22', 0.07); line(g, 0.8, 0.2, 0.8, 0.86, '#5a3c22', 0.07);
        line(g, 0.16, 0.3, 0.84, 0.3, '#7a5a3a', 0.06); line(g, 0.16, 0.7, 0.84, 0.7, '#7a5a3a', 0.06);
        for (const bx of [0.35, 0.5, 0.65]) { line(g, bx, 0.2, bx, 0.75, '#c8ccd4', 0.04); disc(g, bx, 0.78, 0.03, '#7a5a3a'); }
        return;
      }
      case 'nest': {
        oval(g, 0.5, 0.62, 0.38, 0.22, '#6a5530');
        oval(g, 0.5, 0.6, 0.28, 0.14, '#3a2c18');
        for (let k = 0; k < 3; k++) oval(g, 0.4 + k * 0.1, 0.56, 0.06, 0.08, '#e8e0cc');
        for (let k = 0; k < 7; k++) line(g, 0.15 + k * 0.1, 0.5 + rhash(x, y, 540 + k) * 0.2, 0.25 + k * 0.1, 0.72, '#8a7040', 0.025);
        return;
      }
      case 'remains': {
        oval(g, 0.55, 0.66, 0.3, 0.12, '#5a4a3a');
        disc(g, 0.34, 0.58, 0.12, '#e3dac6'); disc(g, 0.3, 0.57, 0.025, dark); disc(g, 0.38, 0.57, 0.025, dark);
        line(g, 0.46, 0.68, 0.8, 0.6, '#d9d0bd', 0.05);
        return;
      }
      case 'tomb': {
        fillRR(g, 0.14, 0.3, 0.72, 0.56, 0.05, dark);
        fillRR(g, 0.17, 0.33, 0.66, 0.5, 0.04, '#6f6a78');
        fillRR(g, 0.14, 0.24, 0.72, 0.16, 0.05, '#8f8a9a');
        line(g, 0.5, 0.45, 0.5, 0.72, '#4a4552', 0.04); line(g, 0.4, 0.55, 0.6, 0.55, '#4a4552', 0.04);
        return;
      }
      case 'altar': {
        g.fillStyle = radial(g, 0.5, 0.35, 0, 0.7, [[0, 'rgba(180,140,255,0.55)'], [1, 'rgba(180,140,255,0)']]);
        g.fillRect(-0.2, -0.3, 1.4, 1.3);
        fillRR(g, 0.18, 0.42, 0.64, 0.42, 0.04, dark);
        fillRR(g, 0.21, 0.45, 0.58, 0.36, 0.03, '#77708a');
        fillRR(g, 0.14, 0.38, 0.72, 0.1, 0.03, '#9a93ad');
        for (const cx of [0.28, 0.72]) { g.fillStyle = '#e8e0cc'; g.fillRect(cx - 0.03, 0.26, 0.06, 0.12); disc(g, cx, 0.24, 0.035, '#ffd27a'); }
        disc(g, 0.5, 0.3, 0.07, '#d8b8ff');
        return;
      }
      case 'cart': {
        fillRR(g, 0.14, 0.36, 0.72, 0.36, 0.04, dark);
        fillRR(g, 0.17, 0.39, 0.66, 0.3, 0.03, '#6a5a48');
        for (let k = 0; k < 5; k++) disc(g, 0.26 + k * 0.12, 0.38, 0.07, k & 1 ? '#8a8f99' : '#5a5a62');
        disc(g, 0.3, 0.76, 0.08, dark); disc(g, 0.7, 0.76, 0.08, dark);
        return;
      }
      case 'cocoon': {
        oval(g, 0.5, 0.52, 0.22, 0.34, '#d8d2c2');
        for (let k = 0; k < 5; k++) line(g, 0.3, 0.3 + k * 0.1, 0.7, 0.35 + k * 0.1, 'rgba(150,140,120,0.8)', 0.02);
        line(g, 0.5, 0.18, 0.5, 0.02, 'rgba(230,230,220,0.6)', 0.02);
        return;
      }
      case 'wreck': {
        for (let k = 0; k < 4; k++) {
          g.save(); g.translate(0.5, 0.58); g.rotate((rhash(x, y, 560 + k) - 0.5) * 1.4);
          fillRR(g, -0.36, -0.06 + k * 0.05 - 0.1, 0.72, 0.09, 0.02, k & 1 ? '#5a4630' : '#72583a');
          g.restore();
        }
        return;
      }
      case 'anvil': {
        g.fillStyle = radial(g, 0.5, 0.5, 0, 0.6, [[0, 'rgba(255,120,40,0.4)'], [1, 'rgba(255,120,40,0)']]);
        g.fillRect(0, 0, 1, 1);
        fillRR(g, 0.34, 0.56, 0.32, 0.28, 0.03, dark);
        fillRR(g, 0.14, 0.36, 0.72, 0.2, 0.04, dark);
        fillRR(g, 0.17, 0.38, 0.66, 0.15, 0.03, '#4a4a52');
        g.fillStyle = '#ff9a4a'; g.fillRect(0.3, 0.38, 0.4, 0.03);
        return;
      }
      case 'frozen': {
        fillRR(g, 0.2, 0.14, 0.6, 0.72, 0.06, 'rgba(160,215,240,0.8)');
        oval(g, 0.5, 0.32, 0.1, 0.1, 'rgba(60,70,90,0.6)');
        fillRR(g, 0.4, 0.42, 0.2, 0.34, 0.05, 'rgba(60,70,90,0.5)');
        line(g, 0.26, 0.2, 0.36, 0.5, 'rgba(255,255,255,0.7)', 0.03);
        return;
      }
      case 'bookcase': {
        fillRR(g, 0.14, 0.1, 0.72, 0.78, 0.03, dark);
        fillRR(g, 0.17, 0.13, 0.66, 0.72, 0.02, '#4a3018');
        for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) {
          const hue = ['#8e3b3b', '#3b5f8e', '#4f7a45', '#8a6a2e', '#6b4a7a'][(rhash(x, y, 580 + r * 7 + k) * 5) | 0];
          g.fillStyle = hue; g.fillRect(0.2 + k * 0.1, 0.17 + r * 0.23, 0.08, 0.18);
        }
        return;
      }
      case 'cyst': {
        g.fillStyle = radial(g, 0.5, 0.55, 0, 0.55, [[0, 'rgba(200,120,255,0.45)'], [1, 'rgba(200,120,255,0)']]);
        g.fillRect(0, 0, 1, 1);
        oval(g, 0.5, 0.58, 0.28, 0.26, '#7a3a9a');
        oval(g, 0.44, 0.5, 0.1, 0.08, '#d8a0ff');
        return;
      }
      default: fillRR(g, 0.2, 0.3, 0.6, 0.5, 0.05, col || '#888');
    }
  }

  glowcap(x, y) {
    const g = this.g;
    g.fillStyle = radial(g, 0.5, 0.6, 0, 0.6, [[0, 'rgba(140,240,200,0.45)'], [1, 'rgba(140,240,200,0)']]);
    g.fillRect(-0.1, 0, 1.2, 1);
    for (let k = 0; k < 3; k++) {
      const cx = 0.28 + k * 0.22 + (rhash(x, y, 600 + k) - 0.5) * 0.1, h = 0.2 + rhash(x, y, 610 + k) * 0.2;
      line(g, cx, 0.86, cx, 0.86 - h, '#d8efe0', 0.05);
      oval(g, cx, 0.86 - h, 0.1, 0.06, k & 1 ? '#8ae0c0' : '#b8ffe0');
    }
  }

  ground(x, y, i) {
    const g = this.g, t = this.world.terrain[i], sk = this.skin;
    const G = t === T.SAND ? sk.sand : t === T.RIFT ? GROUND.rift : sk.dirt;
    this.at(x, y);
    g.fillStyle = G.base;
    g.fillRect(-0.01, -0.01, 1.02, 1.02);
    if (t === T.SAND && sk.sand.dunes) {
      // Real sand: wind ripples that run on across tiles, not round stones.
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const yy = ((k + 0.5) / 4 + (x * 0.13 + y * 0.07) % 0.25), amp = 0.04;
        g.moveTo(0, yy); g.quadraticCurveTo(0.5, yy - amp - rhash(x, y, 7 + k) * 0.05, 1, yy);
      }
      g.strokeStyle = G.light; g.lineWidth = 0.035; g.stroke();
      g.beginPath();
      for (let k = 0; k < 4; k++) { const yy = ((k + 0.5) / 4 + (x * 0.13 + y * 0.07) % 0.25) + 0.04; g.moveTo(0.1, yy); g.quadraticCurveTo(0.5, yy - 0.03, 0.9, yy); }
      g.strokeStyle = G.dark; g.lineWidth = 0.02; g.stroke();
    } else {
      // Clods and pebbles. Gravel is round stones; dirt is flecks.
      const n = t === T.SAND ? 9 : 7;
      for (let k = 0; k < n; k++) {
        const px = rhash(x, y, k * 5 + 1), py = rhash(x, y, k * 5 + 2), s = rhash(x, y, k * 5 + 3);
        g.fillStyle = s < 0.5 ? G.dark : G.light;
        if (t === T.SAND) disc(g, px, py, 0.025 + s * 0.05, g.fillStyle);
        else g.fillRect(px, py, 0.03 + s * 0.05, 0.02 + s * 0.03);
      }
    }
    if (sk.deco && t !== T.RIFT && rhash(x, y, 600) < sk.decoRate) this.deco(sk.deco, x, y, t);
    if (t === T.RIFT && rhash(x, y, 77) < 0.5) {
      // Hairline cracks glowing faintly where the Rift has burned the ground.
      line(g, rhash(x, y, 71), 0, rhash(x, y, 72), 1, 'rgba(170,90,230,0.28)', 0.035);
    }
  }

  moss(x, y, i) {
    if (this.world.terrain[i] !== T.GRASS) return;
    const g = this.g;
    this.at(x, y);
    const sk = this.skin;
    const col = sk.moss[(rhash(x, y, 11) * sk.moss.length) | 0];
    // Overlapping lobes spill past the tile edge, so a moss field has a soft,
    // ragged border instead of a staircase.
    // Lobes only reach out toward other moss; facing bare ground they stay
    // inside the tile at random depths, so the edge is ragged, not a staircase.
    const G = (dx, dy) => this.terrAt(x + dx, y + dy) === T.GRASS;
    g.fillStyle = col;
    g.beginPath();
    g.rect(0.2, 0.2, 0.6, 0.6);
    for (let k = 0; k < 6; k++) {
      let cx = 0.15 + rhash(x, y, 20 + k) * 0.7, cy = 0.15 + rhash(x, y, 30 + k) * 0.7;
      let r = 0.26 + rhash(x, y, 28 + k) * 0.2;
      if (!G(-1, 0)) cx = Math.max(cx, r * 0.7); if (!G(1, 0)) cx = Math.min(cx, 1 - r * 0.7);
      if (!G(0, -1)) cy = Math.max(cy, r * 0.7); if (!G(0, 1)) cy = Math.min(cy, 1 - r * 0.7);
      g.moveTo(cx + r, cy); g.arc(cx, cy, r, 0, TAU);
    }
    if (G(1, 0)) g.rect(0.5, 0.2, 0.6, 0.6);
    if (G(0, 1)) g.rect(0.2, 0.5, 0.6, 0.6);
    g.fill();
    // Blades
    g.beginPath();
    for (let k = 0; k < 9; k++) {
      const bx = rhash(x, y, 40 + k), by = rhash(x, y, 50 + k);
      const lean = (rhash(x, y, 60 + k) - 0.5) * 0.1;
      g.moveTo(bx, by); g.lineTo(bx + lean, by - 0.09);
    }
    g.strokeStyle = sk.blade; g.lineWidth = 0.022; g.stroke();
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const bx = rhash(x, y, 70 + k), by = rhash(x, y, 80 + k);
      g.moveTo(bx, by); g.lineTo(bx + 0.02, by - 0.07);
    }
    g.strokeStyle = sk.bladeDark; g.stroke();
  }

  /** A wet (or crumbling) lip that spills onto the dry neighbours. Its own
   *  pass, or a neighbour's bank would paint seams across the water. */
  bank(x, y, i) {
    const t = this.world.terrain[i];
    if (t !== T.WATER && t !== T.CHASM) return;
    const g = this.g;
    this.at(x, y);
    g.fillStyle = t === T.WATER ? this.skin.water.bank : 'rgba(34,30,40,0.9)';
    roundRect(g, -0.12, -0.12, 1.24, 1.24, 0.4); g.fill();
  }

  liquid(x, y, i) {
    const t = this.world.terrain[i];
    if (t !== T.WATER && t !== T.CHASM) return;
    const g = this.g, water = t === T.WATER;
    this.at(x, y);
    const same = (dx, dy) => this.terrAt(x + dx, y + dy) === t;
    const n = same(0, -1), s = same(0, 1), e = same(1, 0), wv = same(-1, 0);
    // Body: flush with its own kind, pulled in and rounded where it meets land,
    // so a lake reads as one sheet of water rather than a grid of pools.
    const l = wv ? 0 : 0.1, r = e ? 1 : 0.9, tp = n ? 0 : 0.1, b = s ? 1 : 0.9, rad = 0.36;
    const tl = !n && !wv ? rad : 0, tr = !n && !e ? rad : 0, br = !s && !e ? rad : 0, bl = !s && !wv ? rad : 0;
    g.beginPath();
    g.moveTo(l + tl, tp); g.lineTo(r - tr, tp); if (tr) g.quadraticCurveTo(r, tp, r, tp + tr);
    g.lineTo(r, b - br); if (br) g.quadraticCurveTo(r, b, r - br, b);
    g.lineTo(l + bl, b); if (bl) g.quadraticCurveTo(l, b, l, b - bl);
    g.lineTo(l, tp + tl); if (tl) g.quadraticCurveTo(l, tp, l + tl, tp);
    g.closePath();
    const Wt = this.skin.water;
    g.fillStyle = water ? Wt.deep : '#060609';
    g.fill();
    // Shallows: a paler band along every shore.
    g.save(); g.clip();
    const band = water ? `rgba(${Wt.band},0.28)` : 'rgba(80,70,95,0.45)';
    const fade = water ? `rgba(${Wt.band},0)` : 'rgba(80,70,95,0)';
    if (!n) { g.fillStyle = linear(g, 0, tp, 0, tp + 0.3, [[0, band], [1, fade]]); g.fillRect(0, tp, 1, 0.3); }
    if (!s) { g.fillStyle = linear(g, 0, b, 0, b - 0.3, [[0, band], [1, fade]]); g.fillRect(0, b - 0.3, 1, 0.3); }
    if (!wv) { g.fillStyle = linear(g, l, 0, l + 0.3, 0, [[0, band], [1, fade]]); g.fillRect(l, 0, 0.3, 1); }
    if (!e) { g.fillStyle = linear(g, r, 0, r - 0.3, 0, [[0, band], [1, fade]]); g.fillRect(r - 0.3, 0, 0.3, 1); }
    g.restore();
    if (water) {
      g.beginPath();
      for (let k = 0; k < 2; k++) {
        const hx = 0.15 + rhash(x, y, 90 + k) * 0.5, hy = 0.2 + rhash(x, y, 92 + k) * 0.6;
        g.moveTo(hx, hy); g.quadraticCurveTo(hx + 0.12, hy - 0.05, hx + 0.24, hy);
      }
      g.strokeStyle = Wt.hi; g.lineWidth = 0.03; g.stroke();
    }
  }

  rockShadow(x, y) {
    // Rock is taller than the floor: it drops a shadow south and a softer one east.
    if (!this.rockAt(x, y)) return;
    const g = this.g;
    if (!this.rockAt(x, y + 1)) {
      this.at(x, y + 1);
      g.fillStyle = linear(g, 0, 0, 0, 0.45, [[0, 'rgba(0,0,0,0.42)'], [1, 'rgba(0,0,0,0)']]);
      g.fillRect(0, 0, 1, 0.45);
    }
    if (!this.rockAt(x + 1, y)) {
      this.at(x + 1, y);
      g.fillStyle = linear(g, 0, 0, 0.3, 0, [[0, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]);
      g.fillRect(0, 0, 0.3, 1);
    }
  }

  rock(x, y, i) {
    if (!this.rockAt(x, y)) return;
    const g = this.g, R = this.rockAt.bind(this), ROCK = this.skin.rock;
    this.at(x, y);
    const n = R(x, y - 1), s = R(x, y + 1), e = R(x + 1, y), wv = R(x - 1, y);
    // Only exposed outer corners round off, so rock masses read as boulders.
    const rad = 0.34;
    const tl = !n && !wv ? rad : 0, tr = !n && !e ? rad : 0, br = !s && !e ? rad : 0, bl = !s && !wv ? rad : 0;
    g.beginPath();
    g.moveTo(tl, 0); g.lineTo(1 - tr, 0); if (tr) g.quadraticCurveTo(1, 0, 1, tr);
    g.lineTo(1, 1 - br); if (br) g.quadraticCurveTo(1, 1, 1 - br, 1);
    g.lineTo(bl, 1); if (bl) g.quadraticCurveTo(0, 1, 0, 1 - bl);
    g.lineTo(0, tl); if (tl) g.quadraticCurveTo(0, 0, tl, 0);
    g.closePath();
    g.fillStyle = rhash(x >> 1, y >> 1, 3) < 0.5 ? ROCK.top : ROCK.top2;
    g.fill();
    const exposed = !n || !s || !e || !wv;
    if (exposed) {
      g.save(); g.clip();
      if (!s) { g.fillStyle = ROCK.face; g.fillRect(0, 0.72, 1, 0.3); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0.93, 1, 0.08); }
      if (!n) { g.fillStyle = ROCK.lip; g.fillRect(0, 0, 1, 0.07); }
      if (!wv) { g.fillStyle = 'rgba(150,150,160,0.18)'; g.fillRect(0, 0, 0.07, 1); }
      if (!e) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0.93, 0, 0.08, 1); }
      g.restore();
    }
    // Cracks and grain
    g.beginPath();
    const ax = rhash(x, y, 101), ay = rhash(x, y, 102);
    g.moveTo(ax, ay); g.lineTo(ax + (rhash(x, y, 103) - 0.5) * 0.5, ay + (rhash(x, y, 104) - 0.5) * 0.5);
    g.lineTo(ax + (rhash(x, y, 105) - 0.5) * 0.7, ay + (rhash(x, y, 106) - 0.5) * 0.7);
    g.strokeStyle = ROCK.crack; g.lineWidth = 0.025; g.stroke();
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k & 1 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
      g.fillRect(rhash(x, y, 110 + k) * 0.85, rhash(x, y, 115 + k) * (s ? 0.9 : 0.6), 0.1, 0.06);
    }
    const f = this.world.feature[i];
    if (f && FEATURES[f].inRock) this.ore(f, x, y);
  }

  ore(f, x, y) {
    const g = this.g;
    const k = f === 'gems' ? 5 : f === 'crystal' || f === 'riftvein' ? 4 : 6;
    if (f === 'crystal' || f === 'gems' || f === 'gold' || f === 'riftvein') {
      const col = f === 'crystal' ? '190,120,255' : f === 'riftvein' ? '240,80,150' : f === 'gems' ? '110,220,240' : '240,200,90';
      g.fillStyle = radial(g, 0.5, 0.45, 0, 0.6, [[0, `rgba(${col},0.35)`], [1, `rgba(${col},0)`]]);
      g.fillRect(0, 0, 1, 1);
    }
    for (let j = 0; j < k; j++) {
      const cx = 0.18 + rhash(x, y, 130 + j) * 0.64, cy = 0.14 + rhash(x, y, 140 + j) * 0.52;
      const s = 0.07 + rhash(x, y, 150 + j) * 0.07;
      if (f === 'iron') {
        g.beginPath();
        g.moveTo(cx - s, cy); g.lineTo(cx - s * 0.2, cy - s * 0.9); g.lineTo(cx + s, cy - s * 0.3); g.lineTo(cx + s * 0.5, cy + s * 0.8);
        g.closePath();
        g.fillStyle = j & 1 ? '#9aa4b0' : '#7d8692'; g.fill();
        disc(g, cx + s * 0.3, cy + s * 0.2, s * 0.35, 'rgba(150,80,45,0.8)');
      } else if (f === 'gold') {
        line(g, cx - s, cy + s * 0.4, cx + s, cy - s * 0.4, '#e3b949', 0.045);
        disc(g, cx, cy, s * 0.35, '#fff1b0');
      } else {
        const col = f === 'gems' ? ['#2aa6c4', '#7ee6f7'] : f === 'riftvein' ? ['#a02a6a', '#ff9ad0'] : ['#7a3fc0', '#d5a8ff'];
        g.beginPath();
        g.moveTo(cx, cy - s * 1.6); g.lineTo(cx + s * 0.7, cy); g.lineTo(cx, cy + s * 0.8); g.lineTo(cx - s * 0.7, cy);
        g.closePath();
        g.fillStyle = col[0]; g.fill();
        g.beginPath(); g.moveTo(cx, cy - s * 1.6); g.lineTo(cx + s * 0.7, cy); g.lineTo(cx, cy); g.closePath();
        g.fillStyle = col[1]; g.fill();
      }
    }
  }

  /** One piece of a skin's surface detail on a ground tile, in tile space. */
  deco(kind, x, y, t) {
    const g = this.g, h = (k) => rhash(x, y, 610 + k);
    const px = 0.15 + h(0) * 0.7, py = 0.2 + h(1) * 0.65;
    switch (kind) {
      case 'flowers': {
        const cols = ['#e8d45a', '#e07a9a', '#f2f2f2', '#9ab8f0'];
        for (let k = 0; k < 3; k++) disc(g, px + (h(2 + k) - 0.5) * 0.3, py + (h(5 + k) - 0.5) * 0.25, 0.035, cols[(h(9) * cols.length) | 0]);
        return;
      }
      case 'leaves': for (let k = 0; k < 4; k++) oval(g, 0.1 + h(k) * 0.8, 0.1 + h(k + 4) * 0.8, 0.05, 0.03, ['#8a5a24', '#a8702c', '#6e4a1e', '#b8862e'][k]); return;
      case 'needles': for (let k = 0; k < 6; k++) { const a = h(k) * TAU, cx = 0.1 + h(k + 6) * 0.8, cy = 0.1 + h(k + 12) * 0.8; line(g, cx, cy, cx + Math.cos(a) * 0.08, cy + Math.sin(a) * 0.08, '#6a5638', 0.018); } return;
      case 'roots': g.beginPath(); g.moveTo(0, py); g.bezierCurveTo(0.3, py - 0.2, 0.6, py + 0.2, 1, py - 0.05); g.strokeStyle = 'rgba(70,48,28,0.8)'; g.lineWidth = 0.05; g.stroke(); return;
      case 'snow': oval(g, px, py, 0.22 + h(2) * 0.15, 0.1 + h(3) * 0.06, 'rgba(236,242,248,0.85)'); oval(g, px - 0.04, py - 0.02, 0.12, 0.05, 'rgba(255,255,255,0.7)'); return;
      case 'frost': for (let k = 0; k < 3; k++) { const cx = 0.15 + h(k) * 0.7, cy = 0.15 + h(k + 3) * 0.7; for (let a = 0; a < 3; a++) { const r = a * Math.PI / 3; line(g, cx - Math.cos(r) * 0.06, cy - Math.sin(r) * 0.06, cx + Math.cos(r) * 0.06, cy + Math.sin(r) * 0.06, 'rgba(230,245,255,0.75)', 0.015); } } return;
      case 'pebbles': for (let k = 0; k < 3; k++) { oval(g, 0.15 + h(k) * 0.7, 0.2 + h(k + 3) * 0.6, 0.06, 0.04, 'rgba(0,0,0,0.25)'); oval(g, 0.15 + h(k) * 0.7, 0.18 + h(k + 3) * 0.6, 0.055, 0.04, '#8a8478'); } return;
      case 'heather': for (let k = 0; k < 5; k++) disc(g, px + (h(k) - 0.5) * 0.3, py + (h(k + 5) - 0.5) * 0.2, 0.03, k & 1 ? '#9a6aa0' : '#b07ab8'); return;
      case 'reeds': for (let k = 0; k < 5; k++) { const bx = px + (h(k) - 0.5) * 0.25; line(g, bx, py + 0.1, bx + (h(k + 5) - 0.5) * 0.08, py - 0.25, '#7a8a48', 0.025); if (k < 2) oval(g, bx, py - 0.2, 0.02, 0.05, '#6a4a2a'); } return;
      case 'shells': disc(g, px, py, 0.045, '#e8dcc4'); line(g, px - 0.03, py, px + 0.03, py, 'rgba(120,100,70,0.6)', 0.012); return;
      case 'cracks': { g.beginPath(); let cx = h(0), cy = h(1); g.moveTo(cx, cy); for (let k = 0; k < 4; k++) { cx += (h(2 + k) - 0.5) * 0.4; cy += (h(6 + k) - 0.5) * 0.4; g.lineTo(cx, cy); } g.strokeStyle = 'rgba(60,36,18,0.55)'; g.lineWidth = 0.022; g.stroke(); return; }
      case 'embers': disc(g, px, py, 0.05, 'rgba(255,120,40,0.25)'); disc(g, px, py, 0.022, '#ff9a3a'); if (h(3) < 0.5) disc(g, px + 0.2, py - 0.1, 0.015, '#ffc060'); return;
      case 'bones': line(g, px - 0.08, py, px + 0.08, py - 0.04, '#d6ccb4', 0.035); disc(g, px - 0.08, py, 0.025, '#e2d8c0'); disc(g, px + 0.08, py - 0.04, 0.025, '#e2d8c0'); return;
      case 'straw': for (let k = 0; k < 5; k++) { const a = h(k) * TAU; line(g, px, py, px + Math.cos(a) * 0.1, py + Math.sin(a) * 0.1, '#c8a860', 0.02); } return;
      case 'spores': for (let k = 0; k < 4; k++) { const cx = 0.1 + h(k) * 0.8, cy = 0.1 + h(k + 4) * 0.8; disc(g, cx, cy, 0.05, 'rgba(140,240,200,0.14)'); disc(g, cx, cy, 0.018, 'rgba(180,255,220,0.8)'); } return;
      case 'flagstones': g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 0.025; g.strokeRect(0.04, 0.04, 0.92, 0.92); line(g, 0.5, 0.04, 0.5, 0.96, 'rgba(0,0,0,0.2)', 0.02); return;
      case 'rubble': for (let k = 0; k < 4; k++) { const cx = 0.1 + h(k) * 0.8, cy = 0.15 + h(k + 4) * 0.7, s = 0.04 + h(k + 8) * 0.05; fillRR(g, cx, cy + 0.02, s * 1.4, s, 0.01, 'rgba(0,0,0,0.3)'); fillRR(g, cx, cy, s * 1.4, s, 0.01, '#7a6e5c'); } return;
      case 'webs': g.beginPath(); for (let a = 0; a < 6; a++) { const r = a / 6 * TAU; g.moveTo(px, py); g.lineTo(px + Math.cos(r) * 0.28, py + Math.sin(r) * 0.28); } for (const rr of [0.1, 0.2]) { g.moveTo(px + rr, py); g.arc(px, py, rr, 0, TAU); } g.strokeStyle = 'rgba(230,225,240,0.35)'; g.lineWidth = 0.012; g.stroke(); return;
      case 'puddles': oval(g, px, py, 0.2, 0.09, 'rgba(70,140,160,0.45)'); oval(g, px - 0.05, py - 0.02, 0.08, 0.03, 'rgba(200,240,250,0.3)'); return;
      case 'glow': disc(g, px, py, 0.1, 'rgba(180,255,210,0.14)'); disc(g, px, py, 0.025, 'rgba(220,255,235,0.9)'); disc(g, px + 0.15, py + 0.1, 0.015, 'rgba(240,210,255,0.8)'); return;
      case 'runes': g.beginPath(); g.arc(0.5, 0.5, 0.3, 0, TAU); g.moveTo(0.5, 0.22); g.lineTo(0.72, 0.64); g.lineTo(0.28, 0.64); g.closePath(); g.strokeStyle = 'rgba(140,170,255,0.45)'; g.lineWidth = 0.025; g.stroke(); return;
      case 'coins': for (let k = 0; k < 3; k++) { disc(g, px + (h(k) - 0.5) * 0.2, py + (h(k + 3) - 0.5) * 0.15, 0.035, '#8a6a20'); disc(g, px + (h(k) - 0.5) * 0.2, py + (h(k + 3) - 0.5) * 0.15 - 0.01, 0.03, '#e8c050'); } return;
    }
  }

  blotch(x, y) {
    // Large, soft light and dark stains break up the tile grid at a scale
    // bigger than any tile, which is what makes ground read as ground.
    const r0 = rhash(x, y, 200);
    if (r0 > 0.06) return;
    const g = this.g, P = this.P;
    const r = (1.6 + rhash(x, y, 201) * 2.4) * P;
    const cx = (x + 0.5) * P, cy = (y + 0.5) * P;
    const dark = rhash(x, y, 202) < 0.6;
    const c = dark ? '0,0,0' : '230,210,160';
    const a = dark ? 0.13 : 0.06;
    g.fillStyle = radial(g, cx, cy, 0, r, [[0, `rgba(${c},${a})`], [1, `rgba(${c},0)`]]);
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  feature(x, y, i) {
    const f = this.world.feature[i];
    if (!f || FEATURES[f].inRock) return;
    this.at(x, y);
    const g = this.g;
    if (FEATURES[f].prop) return this.prop(f, x, y);
    switch (f) {
      case 'tree': return this.tree(x, y);
      case 'fungus': {
        oval(g, 0.52, 0.9, 0.4, 0.12, 'rgba(0,0,0,0.35)');
        drawFungusArt(g, (k) => rhash(x, y, 300 + k));
        return;
      }
      case 'herb': {
        oval(g, 0.5, 0.88, 0.26, 0.07, 'rgba(0,0,0,0.3)');
        drawHerbArt(g, (k) => rhash(x, y, 330 + k));
        return;
      }
      case 'bones': {
        const bone = (x0, y0, x1, y1) => {
          line(g, x0, y0, x1, y1, '#d9d0bd', 0.06);
          for (const [bx, by] of [[x0, y0], [x1, y1]]) { disc(g, bx, by, 0.045, '#e6ddca'); }
        };
        bone(0.2, 0.3, 0.6, 0.55); bone(0.55, 0.25, 0.8, 0.7);
        disc(g, 0.35, 0.7, 0.13, '#e3dac6');
        disc(g, 0.31, 0.69, 0.03, '#2a241c'); disc(g, 0.4, 0.69, 0.03, '#2a241c');
        return;
      }
      case 'glowcap': return this.glowcap(x, y);
      case 'ruin': {
        oval(g, 0.55, 0.62, 0.48, 0.3, 'rgba(0,0,0,0.35)');
        const blocks = [[0.08, 0.2, 0.42, 0.3], [0.52, 0.12, 0.38, 0.34], [0.2, 0.55, 0.5, 0.3]];
        for (let k = 0; k < blocks.length; k++) {
          const [bx, by, bw, bh] = blocks[k];
          g.save(); g.translate(bx + bw / 2, by + bh / 2); g.rotate((rhash(x, y, 370 + k) - 0.5) * 0.4);
          fillRR(g, -bw / 2, -bh / 2 + 0.05, bw, bh, 0.03, '#45454c');
          fillRR(g, -bw / 2, -bh / 2, bw, bh, 0.03, '#7b7a82');
          line(g, -bw / 2, 0, bw / 2, 0, 'rgba(0,0,0,0.3)', 0.02);
          g.restore();
        }
        oval(g, 0.3, 0.3, 0.12, 0.06, 'rgba(90,140,70,0.7)');
        return;
      }
    }
  }

  tree(x, y) {
    // Woods are drawn at the size of a real tree: a crown well over a tile
    // across that rises into the tile above, so a stand of them closes into
    // forest and the trunk still marks which tile the tree is on.
    const g = this.g;
    const sk = this.skin;
    const pal = sk.trees[(rhash(x, y, 400) * sk.trees.length) | 0];
    const conifer = rhash(x, y, 404) < sk.conifer;
    const size = 1.5 + rhash(x, y, 401) * 0.3;
    const cx = 0.5 + (rhash(x, y, 402) - 0.5) * 0.12;
    oval(g, cx + 0.12, 0.9, size * 0.36, size * 0.14, 'rgba(0,0,0,0.33)');
    drawTreeArt(g, cx, 0.98, size, pal, conifer, (k) => rhash(x, y, 410 + k));
  }
}

// ============================================================================
// PLANTS — vector art in the same hand as the buildings and props. (Only
// units are pixel sprites on the map.)
// ============================================================================
/** A tree standing on (cx, footY) in tile space, `size` tiles tall. */
function drawTreeArt(g, cx, footY, size, pal, conifer, h) {
  const trunkH = size * 0.26, trunkW = size * 0.09;
  fillRR(g, cx - trunkW / 2, footY - trunkH, trunkW, trunkH, trunkW * 0.3, '#5a3e26');
  g.fillStyle = '#3a2616'; g.fillRect(cx + trunkW * 0.1, footY - trunkH, trunkW * 0.4, trunkH);
  if (conifer) {
    // Three tiers, dark underneath to light on top, each overlapping the last.
    const tiers = 3, top = footY - size;
    for (let k = 0; k < tiers; k++) {
      const w = size * (0.62 - k * 0.14), yb = footY - trunkH * 0.7 - k * size * 0.22, yt = yb - size * 0.36;
      g.beginPath(); g.moveTo(cx - w / 2, yb); g.lineTo(cx, Math.max(top, yt)); g.lineTo(cx + w / 2, yb); g.closePath();
      g.fillStyle = pal[k]; g.fill();
      g.beginPath(); g.moveTo(cx, Math.max(top, yt)); g.lineTo(cx - w / 2, yb); g.lineTo(cx - w * 0.15, yb); g.closePath();
      g.fillStyle = pal[Math.min(3, k + 1)]; g.fill();
    }
    return;
  }
  // Broadleaf: a crown of overlapping blobs, shaded bottom-right, lit top-left.
  const cy = footY - trunkH - size * 0.26, r = size * 0.24;
  const blobs = [[-0.55, 0.25, 0.8], [0.55, 0.25, 0.8], [0, 0.35, 0.85], [-0.3, -0.35, 0.85], [0.35, -0.3, 0.8], [0, -0.05, 1]];
  for (const [dx, dy, k] of blobs) disc(g, cx + dx * r + r * 0.12, cy + dy * r + r * 0.14, r * k, pal[0]);
  for (const [dx, dy, k] of blobs) disc(g, cx + dx * r, cy + dy * r, r * k * 0.94, pal[1]);
  for (const [dx, dy, k] of blobs.slice(3)) disc(g, cx + dx * r - r * 0.12, cy + dy * r - r * 0.14, r * k * 0.62, pal[2]);
  disc(g, cx - r * 0.45, cy - r * 0.55, r * 0.32, pal[3]);
  // A few leaf flecks so the crown isn't a flat shape.
  for (let k = 0; k < 5; k++) disc(g, cx + (h(k) - 0.5) * r * 1.6, cy + (h(k + 9) - 0.5) * r * 1.4, r * 0.08, pal[3]);
}

/** Pale cave mushrooms in a small cluster. */
function drawFungusArt(g, h) {
  const caps = [['#c9b8a0', '#8f7a62'], ['#b89a86', '#7d6250'], ['#d4c7b0', '#9a8870']];
  for (let k = 0; k < 3; k++) {
    const cx = 0.26 + k * 0.24 + (h(k) - 0.5) * 0.08, s = 0.13 + h(k + 3) * 0.08, base = 0.88 - (k === 1 ? 0.06 : 0);
    fillRR(g, cx - s * 0.28, base - s * 1.2, s * 0.56, s * 1.2, s * 0.2, '#e8e0cf');
    const [top, under] = caps[k];
    g.beginPath(); g.ellipse(cx, base - s * 1.15, s * 0.95, s * 0.55, 0, Math.PI, 0); g.closePath(); g.fillStyle = top; g.fill();
    g.fillStyle = under; g.fillRect(cx - s * 0.95, base - s * 1.15, s * 1.9, s * 0.12);
    disc(g, cx - s * 0.35, base - s * 1.4, s * 0.12, 'rgba(255,255,255,0.45)');
  }
}

/** A tuft of herbs with a few flowers. */
function drawHerbArt(g, h) {
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.32 + (h(k) - 0.5) * 0.2, len = 0.26 + h(k + 7) * 0.14;
    const x1 = 0.5 + Math.cos(a) * len, y1 = 0.86 + Math.sin(a) * len;
    g.save(); g.translate((0.5 + x1) / 2, (0.86 + y1) / 2); g.rotate(a + Math.PI / 2);
    g.beginPath(); g.ellipse(0, 0, 0.045, len / 2, 0, 0, TAU); g.fillStyle = k & 1 ? '#3f7a34' : '#5c9a44'; g.fill();
    g.restore();
  }
  for (let k = 0; k < 3; k++) disc(g, 0.34 + h(k + 20) * 0.32, 0.5 + h(k + 23) * 0.2, 0.035, k & 1 ? '#f2e27a' : '#e8f0ff');
}

/** What each crop looks like: its shape, leaf, and the colour of what it bears. */
const CROP_VEC = {
  cavecap: { shape: 'cap', leaf: '#d9ccb4', fruit: '#9c7a5c' },
  glowspore: { shape: 'cap', leaf: '#cfeee0', fruit: '#6fe0c0', glow: true },
  grain: { shape: 'stalk', leaf: '#8a9a3a', fruit: '#e0c05a' },
  frostgrain: { shape: 'stalk', leaf: '#8aa6a0', fruit: '#d8e4f0' },
  flax: { shape: 'stalk', leaf: '#5d8a44', fruit: '#7fa6e8' },
  tubers: { shape: 'leafy', leaf: '#4f8a3a', fruit: '#a07a4a' },
  beans: { shape: 'leafy', leaf: '#4a8a3e', fruit: '#8fcf5a' },
  greens: { shape: 'leafy', leaf: '#62b04a', fruit: '#8fd070' },
  cotton: { shape: 'leafy', leaf: '#5a7a3e', fruit: '#f4f1ea' },
  healroot: { shape: 'leafy', leaf: '#3f8a52', fruit: '#e05a5a' },
  bitterleaf: { shape: 'leafy', leaf: '#7a8a4a', fruit: '#c9b25a' },
};
/** One crop plant at growth `stage` (0 seed … 4 ripe), centred on (cx, footY). */
function drawCropVec(g, cropId, stage, cx, footY, h) {
  const L = CROP_VEC[cropId] || CROP_VEC.greens;
  oval(g, cx, footY, 0.12, 0.04, 'rgba(30,18,8,0.45)');
  if (stage <= 0) { disc(g, cx - 0.03, footY - 0.02, 0.02, '#c9b27a'); disc(g, cx + 0.03, footY - 0.01, 0.02, '#c9b27a'); return; }
  const k = [0, 0.4, 0.62, 0.84, 1][stage];
  if (L.shape === 'cap') {
    const s = 0.13 * k;
    if (L.glow && stage >= 3) { g.fillStyle = radial(g, cx, footY - s, 0, s * 3, [[0, 'rgba(110,230,190,0.4)'], [1, 'rgba(110,230,190,0)']]); g.fillRect(cx - s * 3, footY - s * 4, s * 6, s * 6); }
    fillRR(g, cx - s * 0.25, footY - s * 1.1, s * 0.5, s * 1.1, s * 0.2, L.leaf);
    g.beginPath(); g.ellipse(cx, footY - s * 1.05, s * 0.9, s * 0.55, 0, Math.PI, 0); g.closePath(); g.fillStyle = L.fruit; g.fill();
    return;
  }
  if (L.shape === 'stalk') {
    for (let j = -1; j <= 1; j++) {
      const x = cx + j * 0.06, top = footY - 0.34 * k - (j ? 0 : 0.04 * k);
      line(g, x, footY, x + j * 0.02, top, L.leaf, 0.028);
      if (stage >= 3) oval(g, x + j * 0.02, top, 0.03, 0.07 * k, stage === 4 ? L.fruit : '#b6c46a');
    }
    return;
  }
  // Leafy: a rosette of leaves, with the crop showing when it's ripe.
  const r = 0.16 * k;
  for (let j = 0; j < 5; j++) {
    const a = -Math.PI / 2 + (j - 2) * 0.55;
    g.save(); g.translate(cx + Math.cos(a) * r * 0.5, footY - r * 0.4 + Math.sin(a) * r * 0.5); g.rotate(a + Math.PI / 2);
    g.beginPath(); g.ellipse(0, 0, r * 0.32, r * 0.62, 0, 0, TAU); g.fillStyle = j & 1 ? L.leaf : shade(L.leaf, 18); g.fill();
    g.restore();
  }
  if (stage >= 4) for (let j = 0; j < 3; j++) disc(g, cx + (h(j) - 0.5) * r * 1.2, footY - r * (0.5 + h(j + 3) * 0.5), r * 0.2, L.fruit);
}
/** Lighten a #rrggbb colour by `n`. */
function shade(hex, n) {
  const v = parseInt(hex.slice(1), 16);
  const c = (s) => Math.max(0, Math.min(255, ((v >> s) & 255) + n));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

// ============================================================================
// STRUCTURES — adjacent buildings of one class are one building.
// ============================================================================
const STRUCTURE_CLASS = {
  bed: 'barracks', table: 'hall', kitchen: 'hall',
  stockpile: 'store', shelf: 'store', farm: 'field', field: 'field', mushroom: 'fungusbed',
  carpenter: 'carpentry', smithy: 'smithy', alchemy: 'alchemy', library: 'library',
  infirmary: 'infirmary', training: 'yard', barn: 'barn', pasture: 'pasture', trough: 'pasture',
  combat_school: 'dojo', knight_academy: 'knightacad', mage_school: 'mageschool', wizardry_academy: 'wizacad',
  temple: 'temple', cathedral: 'cathedral', spellmason: 'spellmason', magic_lab: 'maglab',
  watchtower: 'tower', archive: 'archive', observatory: 'observatory', archery_range: 'archeryyard', proving_grounds: 'provingyard',
};
/** How each class is built: floor material, whether it is walled, its name. */
/** The structures worth a number on the map, and what it counts. */
const STRUCTURE_COUNT = {
  barracks: (s) => ['🛏️', s.n],
  field: (s) => ['🌾', s.n],
};
const STRUCTURE_STYLE = {
  barracks:  { floor: 'planks',   walls: true,  name: (s) => s.n > 1 ? `Barracks · ${s.n} beds` : 'Bedroom' },
  hall:      { floor: 'planks',   walls: true,  name: (s) => s.count.table >= 2 ? 'Mess Hall' : s.count.kitchen ? 'Cookhouse' : 'Dining Room' },
  carpentry: { floor: 'pale',     walls: true,  name: () => 'Carpentry' },
  smithy:    { floor: 'flags',    walls: true,  name: () => 'Smithy' },
  alchemy:   { floor: 'slate',    walls: true,  name: () => 'Alchemy Lab' },
  library:   { floor: 'dark',     walls: true,  name: () => 'Library' },
  infirmary: { floor: 'tiles',    walls: true,  name: () => 'Infirmary' },
  store:     { floor: 'yard',     walls: false, name: (s) => s.n > 1 ? 'Storehouse' : 'Stockpile' },
  yard:      { floor: 'sand',     walls: false, name: () => 'Training Yard' },
  field:     { floor: 'soil',     walls: false, fence: true, name: (s) => s.n > 1 ? `Fields · ${s.n} plots` : 'Field' },
  fungusbed: { floor: 'loam',     walls: false, name: () => 'Fungus Beds' },
  barn:      { floor: null,       walls: false, roof: true, name: () => 'Barn' },
  pasture:   { floor: null,       walls: false, name: () => 'Pasture' },
  dojo:       { floor: 'pale',  walls: true, name: () => 'Combat School' },
  knightacad: { floor: 'flags', walls: true, name: () => 'Knight Academy' },
  mageschool: { floor: 'slate', walls: true, name: () => 'Mage School' },
  wizacad:    { floor: 'slate', walls: true, name: () => 'Wizardry Academy' },
  temple:     { floor: 'tiles', walls: true, name: () => 'Temple' },
  cathedral:  { floor: 'tiles', walls: true, name: () => 'Cathedral' },
  spellmason: { floor: 'dark',  walls: true, name: () => 'Spellmason' },
  maglab:     { floor: 'slate', walls: true, name: () => 'Magic Lab' },
  tower:        { floor: 'flags', walls: true, name: () => 'Watchtower' },
  archive:      { floor: 'dark',  walls: true, name: () => 'Archive' },
  observatory:  { floor: 'slate', walls: true, name: () => 'Observatory' },
  archeryyard:  { floor: 'sand',  walls: false, name: () => 'Archery Range' },
  provingyard:  { floor: 'sand',  walls: false, name: () => 'Proving Grounds' },
};
const FLOOR = {
  planks: { base: '#7a5a3b', seam: 'rgba(40,24,12,0.55)', hi: 'rgba(255,220,170,0.08)', w: 0.2 },
  pale:   { base: '#8f7350', seam: 'rgba(50,32,16,0.5)',  hi: 'rgba(255,230,180,0.1)', w: 0.25 },
  dark:   { base: '#553a28', seam: 'rgba(20,10,4,0.6)',   hi: 'rgba(255,210,160,0.06)', w: 0.2 },
};
const WALL_IDS = new Set(['wall', 'timber_wall', 'door']);
const WALL_PAL = {
  stone:  { top: '#8f897d', face: '#4a4640', seam: 'rgba(40,36,30,0.45)' },
  timber: { top: '#8a653d', face: '#4a3220', seam: 'rgba(40,22,10,0.55)' },
};
const BLANKETS = ['#8e3b3b', '#3b5f8e', '#4f7a45', '#8a6a2e', '#6b4a7a', '#7a5a45'];

// Roofs by what a building is: shops red tile, schools slate, holy places pale
// stone with gold, farm buildings barn red, workshops and study green.
function roofOf(id, def) {
  if (id === 'temple' || id === 'cathedral' || id === 'reliquary') return ['#cfc3a0', '#a8997a', '#e2b23c'];
  if (id === 'barn' || id === 'stable') return ['#8c3a2a', '#6a2a1e', '#c8b090'];
  if (id === 'smithy') return ['#4c4c56', '#36363e', '#8a8a96'];
  if (def.shop || id === 'tavern' || id === 'spellmason') return ['#a8483a', '#80342a', '#e0c070'];
  if (def.cat === 'martial') return ['#44607e', '#324a62', '#b8c6d6'];
  if (id === 'magic_lab' || id === 'wizardry_academy' || id === 'observatory') return ['#56487e', '#403664', '#c8b8f0'];
  if (id === 'shed') return ['#7a5a3a', '#5a402a', '#a88a60'];
  return ['#4f6a48', '#3a5236', '#b8c8a0'];
}
/** A house `fw` x `fh` tiles in tile space: roof over the back, front wall with windows, door in the middle. */
function drawHouse(g, id, def, fw, fh, now) {
  const stone = (def.cost.stone || 0) >= (def.cost.wood || 0);
  const wall = stone ? ['#8f897d', '#6e685e', 'rgba(40,36,30,0.4)'] : ['#8a653d', '#6a4a2a', 'rgba(40,22,10,0.5)'];
  const [roof, roofDark, ridge] = roofOf(id, def);
  const frontTop = fh - 0.95, frontBot = fh - 0.04;
  // Shadow on the ground to the south-east.
  fillRR(g, 0.14, 0.2, fw - 0.04, fh - 0.1, 0.1, 'rgba(0,0,0,0.32)');
  // Front wall, the full width of the house, one tile tall.
  g.fillStyle = wall[0]; g.fillRect(0.04, frontTop, fw - 0.08, frontBot - frontTop);
  g.fillStyle = wall[1]; g.fillRect(0.04, frontBot - 0.12, fw - 0.08, 0.12);
  g.strokeStyle = wall[2]; g.lineWidth = 0.02;
  g.beginPath();
  if (stone) for (let r = frontTop + 0.2; r < frontBot - 0.1; r += 0.2) { g.moveTo(0.04, r); g.lineTo(fw - 0.04, r); }
  else for (let c = 0.2; c < fw - 0.05; c += 0.2) { g.moveTo(c, frontTop); g.lineTo(c, frontBot); }
  g.stroke();
  // Windows either side of the door, lit a little.
  const dc = fw >> 1;
  for (let c = 0; c < fw; c++) {
    if (c === dc) continue;
    fillRR(g, c + 0.3, frontTop + 0.22, 0.4, 0.34, 0.04, '#2a1e12');
    fillRR(g, c + 0.34, frontTop + 0.26, 0.32, 0.26, 0.03, 'rgba(240,200,120,0.75)');
    g.fillStyle = '#2a1e12'; g.fillRect(c + 0.49, frontTop + 0.26, 0.02, 0.26); g.fillRect(c + 0.34, frontTop + 0.38, 0.32, 0.02);
  }
  // The door.
  fillRR(g, dc + 0.24, frontTop + 0.3, 0.52, frontBot - frontTop - 0.3, 0.06, '#1e140a');
  fillRR(g, dc + 0.28, frontTop + 0.34, 0.44, frontBot - frontTop - 0.36, 0.04, '#6a4424');
  disc(g, dc + 0.64, frontTop + 0.66, 0.03, '#e2b23c');
  // Roof: covers everything behind the front wall and overhangs it, rising
  // into the row above so the house has height.
  const rt = -0.35, rb = frontTop + 0.08;
  g.beginPath();
  g.moveTo(-0.06, rb); g.lineTo(0.3, rt); g.lineTo(fw - 0.3, rt); g.lineTo(fw + 0.06, rb); g.closePath();
  g.fillStyle = roof; g.fill();
  g.save(); g.clip();
  g.strokeStyle = roofDark; g.lineWidth = 0.025;
  g.beginPath();
  for (let r = rt + 0.16; r < rb; r += 0.16) { g.moveTo(-0.1, r); g.lineTo(fw + 0.1, r); }
  g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(-0.1, rb - 0.12, fw + 0.2, 0.12);
  g.restore();
  line(g, 0.3, rt, fw - 0.3, rt, ridge, 0.06);
  // A chimney where there's a fire inside, with a curl of smoke.
  if (id === 'smithy' || id === 'tavern' || id === 'infirmary' || id === 'herbalist_hut') {
    const cx = fw - 0.7;
    g.fillStyle = '#5a524a'; g.fillRect(cx, rt - 0.15, 0.2, 0.4);
    const t = (now || 0) * 0.8;
    for (let k = 0; k < 3; k++) disc(g, cx + 0.1 + Math.sin(t + k) * 0.05, rt - 0.25 - k * 0.14 - ((t * 0.2) % 0.14), 0.06 + k * 0.02, `rgba(200,200,200,${0.25 - k * 0.07})`);
  }
}

function computeStructures(world) {
  const n = world.w * world.h;
  const of = new Int32Array(n).fill(-1);
  const list = [];
  for (let i = 0; i < n; i++) {
    const b = world.building[i];
    if (!b || !b.done || of[i] !== -1 || b.fp) continue;   // big buildings are their own structure
    const cls = STRUCTURE_CLASS[b.id];
    if (!cls) continue;
    const s = { cls, tiles: [], count: {}, x0: 1e9, y0: 1e9, x1: -1, y1: -1, id: list.length };
    const stack = [i]; of[i] = s.id;
    while (stack.length) {
      const j = stack.pop();
      const x = j % world.w, y = (j / world.w) | 0;
      const bj = world.building[j];
      s.tiles.push(j);
      s.count[bj.id] = (s.count[bj.id] || 0) + 1;
      if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x;
      if (y < s.y0) s.y0 = y; if (y > s.y1) s.y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!world.inside(nx, ny)) continue;
        const k = world.idx(nx, ny), bk = world.building[k];
        if (of[k] !== -1 || !bk || !bk.done || bk.fp || STRUCTURE_CLASS[bk.id] !== cls) continue;
        of[k] = s.id; stack.push(k);
      }
    }
    s.n = s.tiles.length;
    s.wide = (s.x1 - s.x0) >= (s.y1 - s.y0);
    // The door goes in the middle of the south wall.
    const mid = (s.x0 + s.x1) / 2;
    let best = -1, bd = 1e9;
    for (const j of s.tiles) {
      const x = j % world.w, y = (j / world.w) | 0;
      if (y + 1 < world.h && of[j + world.w] === s.id) continue;
      const d = (s.y1 - y) * 100 + Math.abs(x - mid);
      if (d < bd) { bd = d; best = j; }
    }
    s.door = best;
    list.push(s);
  }
  return { of, list };
}

// ============================================================================
// FURNITURE ART. Every function draws on a 0..1 tile square.
// ============================================================================
function shadowRR(g, x, y, w, h, r, a = 0.3) { fillRR(g, x + 0.05, y + 0.07, w, h, r, `rgba(0,0,0,${a})`); }

function flame(g, cx, cy, s, now, seed) {
  const f = 0.85 + 0.15 * Math.sin(now * 11 + seed * 7) + 0.08 * Math.sin(now * 23 + seed);
  g.fillStyle = radial(g, cx, cy, 0, s * 2.4, [[0, 'rgba(255,170,60,0.55)'], [1, 'rgba(255,120,30,0)']]);
  g.fillRect(cx - s * 2.4, cy - s * 2.4, s * 4.8, s * 4.8);
  g.beginPath();
  g.moveTo(cx - s * 0.7, cy + s * 0.4);
  g.quadraticCurveTo(cx - s * 0.6, cy - s * 0.6 * f, cx, cy - s * 1.3 * f);
  g.quadraticCurveTo(cx + s * 0.6, cy - s * 0.6 * f, cx + s * 0.7, cy + s * 0.4);
  g.closePath();
  g.fillStyle = '#f08a2c'; g.fill();
  oval(g, cx, cy + s * 0.05, s * 0.35, s * 0.55 * f, '#ffe08a');
}

const ART = {
  bed(g, o) {
    // Head to the north; the caller rotates it for north–south rooms.
    const col = BLANKETS[(rhash(o.x, o.y, 500) * BLANKETS.length) | 0];
    shadowRR(g, 0.16, 0.08, 0.68, 0.86, 0.06);
    fillRR(g, 0.16, 0.08, 0.68, 0.86, 0.06, '#5e4029');
    fillRR(g, 0.2, 0.13, 0.6, 0.77, 0.05, '#e3dccb');
    fillRR(g, 0.2, 0.36, 0.6, 0.54, 0.05, col);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0.2, 0.36, 0.6, 0.06);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0.2, 0.58, 0.6, 0.03);
    fillRR(g, 0.26, 0.16, 0.48, 0.15, 0.06, '#f4efe4');
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0.26, 0.26, 0.48, 0.05);
    fillRR(g, 0.14, 0.05, 0.72, 0.07, 0.02, '#3e2918');
  },
  table(g, o) {
    shadowRR(g, 0.14, 0.2, 0.72, 0.56, 0.08);
    // Stools
    for (const [sx, sy] of [[0.5, 0.1], [0.5, 0.9], [0.08, 0.48], [0.92, 0.48]]) disc(g, sx, sy, 0.08, '#4d3420');
    fillRR(g, 0.14, 0.2, 0.72, 0.56, 0.08, '#8a633e');
    g.beginPath();
    for (let k = 1; k < 4; k++) { g.moveTo(0.16, 0.2 + k * 0.14); g.lineTo(0.84, 0.2 + k * 0.14); }
    g.strokeStyle = 'rgba(40,24,10,0.45)'; g.lineWidth = 0.015; g.stroke();
    disc(g, 0.34, 0.4, 0.08, '#d9d4c7'); disc(g, 0.34, 0.4, 0.045, '#a66a3a');
    disc(g, 0.64, 0.56, 0.08, '#d9d4c7'); disc(g, 0.64, 0.56, 0.045, '#8aa84e');
    disc(g, 0.62, 0.34, 0.05, '#b08a4a');
  },
  kitchen(g, o) {
    // A stone hearth with a pot over the coals.
    disc(g, 0.53, 0.56, 0.4, 'rgba(0,0,0,0.3)');
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      disc(g, 0.5 + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3, 0.085, k & 1 ? '#77746f' : '#8d8a84');
    }
    disc(g, 0.5, 0.5, 0.24, '#241a14');
    line(g, 0.34, 0.42, 0.66, 0.6, '#5b3a22', 0.07); line(g, 0.34, 0.6, 0.66, 0.42, '#6b4528', 0.07);
    flame(g, 0.5, 0.52, 0.12, o.now, o.x + o.y);
    disc(g, 0.5, 0.46, 0.13, '#2b2b2f'); disc(g, 0.5, 0.46, 0.095, '#6a5a3a');
    g.beginPath(); g.arc(0.5, 0.46, 0.13, 0, TAU); g.strokeStyle = '#555'; g.lineWidth = 0.02; g.stroke();
  },
  brazier(g, o) {
    for (const a of [0.5, 2.6, 4.7]) line(g, 0.5, 0.5, 0.5 + Math.cos(a) * 0.36, 0.5 + Math.sin(a) * 0.36, '#2d2d33', 0.06);
    disc(g, 0.53, 0.55, 0.3, 'rgba(0,0,0,0.3)');
    disc(g, 0.5, 0.5, 0.28, '#3b3a40'); disc(g, 0.5, 0.5, 0.22, '#1c1410');
    disc(g, 0.5, 0.5, 0.18, radial(g, 0.5, 0.5, 0, 0.18, [[0, '#ffb040'], [1, '#8a2a10']]));
    flame(g, 0.5, 0.5, 0.15, o.now, o.x * 3 + o.y);
  },
  statue(g, o) {
    shadowRR(g, 0.12, 0.14, 0.76, 0.76, 0.06, 0.4);
    fillRR(g, 0.12, 0.14, 0.76, 0.76, 0.06, '#6f6d72');
    fillRR(g, 0.18, 0.2, 0.64, 0.64, 0.04, '#8c8a90');
    oval(g, 0.5, 0.56, 0.2, 0.14, '#b4b1b8');
    disc(g, 0.5, 0.38, 0.12, '#c8c5cb');
    oval(g, 0.34, 0.54, 0.06, 0.12, '#a9a6ad', 0.4); oval(g, 0.66, 0.54, 0.06, 0.12, '#a9a6ad', -0.4);
    disc(g, 0.46, 0.34, 0.04, 'rgba(255,255,255,0.35)');
  },
  tavern(g, o) {
    shadowRR(g, 0.1, 0.24, 0.8, 0.5, 0.06);
    fillRR(g, 0.1, 0.24, 0.8, 0.5, 0.06, '#6e4a2a');
    fillRR(g, 0.1, 0.24, 0.8, 0.12, 0.04, '#8a6038');
    for (let k = 0; k < 3; k++) {
      const mx = 0.26 + k * 0.24;
      fillRR(g, mx - 0.07, 0.42, 0.14, 0.18, 0.03, '#d8b25a');
      disc(g, mx, 0.44, 0.06, '#fff6d8');
    }
    // Keg
    disc(g, 0.82, 0.82, 0.14, '#5a3a20'); g.beginPath(); g.arc(0.82, 0.82, 0.1, 0, TAU); g.strokeStyle = '#2d2d2d'; g.lineWidth = 0.025; g.stroke();
  },
  stockpile(g, o) {
    const kind = (rhash(o.x, o.y, 510) * 4) | 0;
    if (kind === 0) {
      // Crates
      for (const [cx, cy, s] of [[0.3, 0.32, 0.34], [0.66, 0.6, 0.3]]) {
        shadowRR(g, cx - s / 2, cy - s / 2, s, s, 0.02, 0.35);
        fillRR(g, cx - s / 2, cy - s / 2, s, s, 0.02, '#9a7447');
        g.strokeStyle = '#5b3f22'; g.lineWidth = 0.025;
        g.strokeRect(cx - s / 2 + 0.02, cy - s / 2 + 0.02, s - 0.04, s - 0.04);
        line(g, cx - s / 2 + 0.03, cy - s / 2 + 0.03, cx + s / 2 - 0.03, cy + s / 2 - 0.03, '#5b3f22', 0.025);
      }
    } else if (kind === 1) {
      // Sacks
      for (const [cx, cy] of [[0.3, 0.35], [0.62, 0.3], [0.45, 0.66], [0.75, 0.68]]) {
        oval(g, cx + 0.04, cy + 0.05, 0.16, 0.13, 'rgba(0,0,0,0.3)');
        oval(g, cx, cy, 0.16, 0.13, '#b9a47a'); disc(g, cx, cy - 0.1, 0.035, '#8a7550');
      }
    } else if (kind === 2) {
      // Log stack
      shadowRR(g, 0.12, 0.2, 0.76, 0.6, 0.05, 0.35);
      for (let r = 0; r < 4; r++) {
        fillRR(g, 0.12, 0.2 + r * 0.15, 0.76, 0.14, 0.07, r & 1 ? '#6d4a2c' : '#7b5634');
        disc(g, 0.15, 0.27 + r * 0.15, 0.06, '#c6a377'); disc(g, 0.15, 0.27 + r * 0.15, 0.025, '#8a6a42');
      }
    } else {
      // Barrels
      for (const [cx, cy] of [[0.32, 0.34], [0.68, 0.36], [0.5, 0.7]]) {
        disc(g, cx + 0.04, cy + 0.05, 0.16, 'rgba(0,0,0,0.3)');
        disc(g, cx, cy, 0.16, '#7a5230'); disc(g, cx, cy, 0.11, '#94683e');
        g.beginPath(); g.arc(cx, cy, 0.145, 0, TAU); g.strokeStyle = '#3a3a3e'; g.lineWidth = 0.025; g.stroke();
      }
    }
  },
  carpenter(g, o) {
    shadowRR(g, 0.08, 0.26, 0.84, 0.36, 0.03);
    fillRR(g, 0.08, 0.26, 0.84, 0.36, 0.03, '#9b7446');
    line(g, 0.1, 0.44, 0.9, 0.44, 'rgba(60,36,16,0.5)', 0.015);
    // A plank on the bench and a saw
    fillRR(g, 0.18, 0.3, 0.5, 0.1, 0.01, '#d1ad76');
    g.beginPath(); g.moveTo(0.6, 0.48); g.lineTo(0.86, 0.5); g.lineTo(0.86, 0.58); g.lineTo(0.62, 0.56); g.closePath();
    g.fillStyle = '#c5c8cf'; g.fill(); fillRR(g, 0.52, 0.47, 0.1, 0.1, 0.02, '#5b3a22');
    for (let k = 0; k < 6; k++) disc(g, 0.15 + rhash(o.x, o.y, 520 + k) * 0.7, 0.7 + rhash(o.x, o.y, 530 + k) * 0.22, 0.02, 'rgba(230,200,150,0.6)');
  },
  smithy(g, o) {
    if (rhash(o.x, o.y, 540) < 0.5 || o.first) {
      // Forge
      shadowRR(g, 0.1, 0.1, 0.8, 0.6, 0.06, 0.4);
      fillRR(g, 0.1, 0.1, 0.8, 0.6, 0.06, '#5a5552');
      fillRR(g, 0.2, 0.2, 0.6, 0.38, 0.05, '#1f1512');
      const glow = 0.75 + 0.25 * Math.sin(o.now * 3 + o.x);
      fillRR(g, 0.24, 0.25, 0.52, 0.28, 0.05, radial(g, 0.5, 0.39, 0, 0.3, [[0, `rgba(255,200,90,${glow})`], [1, 'rgba(160,40,10,0.8)']]));
    }
    // Anvil
    shadowRR(g, 0.3, 0.72, 0.4, 0.16, 0.03, 0.35);
    g.beginPath(); g.moveTo(0.26, 0.72); g.lineTo(0.74, 0.72); g.lineTo(0.8, 0.78); g.lineTo(0.66, 0.88); g.lineTo(0.34, 0.88); g.closePath();
    g.fillStyle = '#3d3f45'; g.fill();
    line(g, 0.3, 0.74, 0.7, 0.74, 'rgba(255,255,255,0.3)', 0.02);
  },
  alchemy(g, o) {
    shadowRR(g, 0.1, 0.2, 0.8, 0.54, 0.05);
    fillRR(g, 0.1, 0.2, 0.8, 0.54, 0.05, '#6a4a30');
    const cols = ['#4ad0a0', '#c05ae0', '#e0a040', '#5aa0e0'];
    for (let k = 0; k < 4; k++) {
      const fx = 0.22 + k * 0.18, fy = 0.4 + (k & 1) * 0.14;
      disc(g, fx, fy, 0.07, 'rgba(230,240,255,0.5)');
      disc(g, fx, fy + 0.01, 0.05, cols[k]);
      disc(g, fx - 0.02, fy - 0.02, 0.015, '#fff');
    }
    const p = 0.5 + 0.5 * Math.sin(o.now * 2 + o.x);
    g.fillStyle = radial(g, 0.5, 0.45, 0, 0.5, [[0, `rgba(150,255,210,${0.12 + p * 0.1})`], [1, 'rgba(150,255,210,0)']]);
    g.fillRect(0, 0, 1, 1);
  },
  library(g, o) {
    // Shelves along the top edge, a desk below.
    shadowRR(g, 0.06, 0.06, 0.88, 0.22, 0.02, 0.35);
    fillRR(g, 0.06, 0.06, 0.88, 0.22, 0.02, '#3d281a');
    const spines = ['#8e3b3b', '#3b5f8e', '#4f7a45', '#b08a3a', '#6b4a7a', '#2f6a6a'];
    for (let k = 0; k < 11; k++) {
      g.fillStyle = spines[(rhash(o.x, o.y, 550 + k) * spines.length) | 0];
      g.fillRect(0.09 + k * 0.075, 0.09 + rhash(o.x, o.y, 570 + k) * 0.04, 0.06, 0.15);
    }
    shadowRR(g, 0.26, 0.5, 0.48, 0.3, 0.03);
    fillRR(g, 0.26, 0.5, 0.48, 0.3, 0.03, '#6e4a2c');
    fillRR(g, 0.36, 0.56, 0.26, 0.17, 0.01, '#efe6cf');
    line(g, 0.49, 0.56, 0.49, 0.73, 'rgba(0,0,0,0.3)', 0.012);
    disc(g, 0.68, 0.58, 0.04, '#ffcf70');
  },
  infirmary(g, o) {
    shadowRR(g, 0.2, 0.08, 0.6, 0.84, 0.05);
    fillRR(g, 0.2, 0.08, 0.6, 0.84, 0.05, '#bdb8ad');
    fillRR(g, 0.23, 0.12, 0.54, 0.76, 0.04, '#f2f0ea');
    fillRR(g, 0.28, 0.15, 0.44, 0.13, 0.05, '#ffffff');
    g.fillStyle = '#c84040';
    g.fillRect(0.45, 0.42, 0.1, 0.3); g.fillRect(0.35, 0.52, 0.3, 0.1);
  },
  training(g, o) {
    oval(g, 0.55, 0.6, 0.3, 0.16, 'rgba(0,0,0,0.3)');
    line(g, 0.3, 0.5, 0.7, 0.5, '#6d4a2a', 0.07);
    disc(g, 0.5, 0.5, 0.2, '#c9a45e');
    g.beginPath(); g.arc(0.5, 0.5, 0.2, 0, TAU); g.strokeStyle = '#8a6a3a'; g.lineWidth = 0.025; g.stroke();
    disc(g, 0.5, 0.3, 0.11, '#d6b672');
    g.beginPath(); for (const r of [0.14, 0.08]) { g.moveTo(0.5 + r, 0.54); g.arc(0.5, 0.54, r, 0, TAU); }
    g.strokeStyle = '#b03a2a'; g.lineWidth = 0.025; g.stroke();
  },
  shrine(g, o) {
    shadowRR(g, 0.16, 0.18, 0.68, 0.64, 0.08, 0.4);
    fillRR(g, 0.16, 0.18, 0.68, 0.64, 0.08, '#77737a');
    fillRR(g, 0.24, 0.26, 0.52, 0.42, 0.05, '#9a969f');
    fillRR(g, 0.32, 0.34, 0.36, 0.14, 0.03, '#d8cfb8');
    for (const cx of [0.26, 0.74]) { disc(g, cx, 0.74, 0.04, '#efe6d0'); flame(g, cx, 0.7, 0.045, o.now, cx * 9 + o.x); }
  },
  reliquary(g, o) {
    const p = 0.5 + 0.5 * Math.sin(o.now * 1.6 + o.y);
    g.fillStyle = radial(g, 0.5, 0.5, 0, 0.7, [[0, `rgba(240,200,110,${0.25 + p * 0.15})`], [1, 'rgba(240,200,110,0)']]);
    g.fillRect(-0.2, -0.2, 1.4, 1.4);
    shadowRR(g, 0.14, 0.14, 0.72, 0.72, 0.1, 0.4);
    fillRR(g, 0.14, 0.14, 0.72, 0.72, 0.1, '#6a5f55');
    fillRR(g, 0.24, 0.24, 0.52, 0.52, 0.06, '#c9a24a');
    fillRR(g, 0.32, 0.32, 0.36, 0.36, 0.04, '#8a6a2a');
    disc(g, 0.5, 0.5, 0.1, '#fff0c0');
  },
  barricade(g, o) {
    shadowRR(g, 0.06, 0.3, 0.88, 0.4, 0.04, 0.4);
    fillRR(g, 0.06, 0.34, 0.88, 0.32, 0.04, '#6a4a2c');
    for (let k = 0; k < 4; k++) {
      const x = 0.14 + k * 0.24;
      g.beginPath(); g.moveTo(x - 0.06, 0.6); g.lineTo(x + 0.12, 0.12); g.lineTo(x + 0.06, 0.62); g.closePath();
      g.fillStyle = '#8a643a'; g.fill();
    }
    line(g, 0.08, 0.5, 0.92, 0.5, '#3d3d42', 0.04);
  },
  watchpost(g, o) {
    // A tall tower: seen from above it is a platform, with a long shadow.
    fillRR(g, 0.24, 0.3, 0.9, 0.9, 0.04, 'rgba(0,0,0,0.35)');
    fillRR(g, 0.06, 0.06, 0.88, 0.88, 0.04, '#6b4a2c');
    g.beginPath(); for (let k = 1; k < 5; k++) { g.moveTo(0.08, 0.06 + k * 0.176); g.lineTo(0.92, 0.06 + k * 0.176); }
    g.strokeStyle = 'rgba(30,18,8,0.5)'; g.lineWidth = 0.02; g.stroke();
    g.strokeStyle = '#3e2a18'; g.lineWidth = 0.06; g.strokeRect(0.09, 0.09, 0.82, 0.82);
    for (const [px, py] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) disc(g, px, py, 0.07, '#4a3320');
  },
  pasture(g, o) {
    // A fence post with a rail stub.
    oval(g, 0.55, 0.58, 0.12, 0.07, 'rgba(0,0,0,0.35)');
    disc(g, 0.5, 0.5, 0.09, '#6d4c2d'); disc(g, 0.49, 0.49, 0.05, '#8d6a44');
  },
  trough(g, o) {
    shadowRR(g, 0.1, 0.3, 0.8, 0.4, 0.05);
    fillRR(g, 0.1, 0.3, 0.8, 0.4, 0.05, '#6e4c2c');
    fillRR(g, 0.16, 0.36, 0.68, 0.28, 0.03, '#b6a162');
    for (let k = 0; k < 6; k++) disc(g, 0.2 + rhash(o.x, o.y, 580 + k) * 0.6, 0.4 + rhash(o.x, o.y, 590 + k) * 0.2, 0.03, '#d6c07a');
  },
  butchery(g, o) {
    disc(g, 0.54, 0.56, 0.32, 'rgba(0,0,0,0.3)');
    disc(g, 0.5, 0.5, 0.32, '#7a5634'); disc(g, 0.5, 0.5, 0.26, '#a37a4c');
    g.beginPath(); for (const r of [0.08, 0.16]) { g.moveTo(0.5 + r, 0.5); g.arc(0.5, 0.5, r, 0, TAU); }
    g.strokeStyle = 'rgba(60,36,16,0.45)'; g.lineWidth = 0.015; g.stroke();
    oval(g, 0.62, 0.62, 0.08, 0.05, 'rgba(140,30,30,0.6)');
    fillRR(g, 0.32, 0.34, 0.26, 0.12, 0.02, '#c9ccd3'); fillRR(g, 0.56, 0.37, 0.14, 0.06, 0.02, '#3a2616');
  },
  compost(g, o) {
    oval(g, 0.55, 0.6, 0.4, 0.3, 'rgba(0,0,0,0.3)');
    oval(g, 0.5, 0.52, 0.38, 0.3, '#4a3421'); oval(g, 0.46, 0.46, 0.26, 0.2, '#5d4329');
    for (let k = 0; k < 6; k++) disc(g, 0.25 + rhash(o.x, o.y, 600 + k) * 0.5, 0.3 + rhash(o.x, o.y, 610 + k) * 0.4, 0.035, k & 1 ? '#6f8f3f' : '#9a7a4a');
  },
  combat_school(g, o) {
    // A sparring ring and a weapon rack.
    g.beginPath(); g.arc(0.5, 0.52, 0.34, 0, TAU); g.strokeStyle = 'rgba(200,170,110,0.7)'; g.lineWidth = 0.04; g.stroke();
    fillRR(g, 0.12, 0.08, 0.76, 0.12, 0.02, '#5a3e26');
    for (let k = 0; k < 4; k++) line(g, 0.2 + k * 0.2, 0.06, 0.24 + k * 0.2, 0.3, k & 1 ? '#c5c8cf' : '#8a643a', 0.035);
    oval(g, 0.5, 0.56, 0.1, 0.14, '#c9a45e');
  },
  knight_academy(g, o) {
    ART.combat_school(g, o);
    fillRR(g, 0.38, 0.66, 0.24, 0.22, 0.03, '#8a8a92'); g.fillStyle = '#c84040'; g.fillRect(0.47, 0.68, 0.06, 0.18);
    disc(g, 0.5, 0.2, 0.05, '#e2b23c');
  },
  mage_school(g, o) {
    for (const [x, y] of [[0.26, 0.3], [0.74, 0.3], [0.26, 0.72], [0.74, 0.72]]) { shadowRR(g, x - 0.12, y - 0.08, 0.24, 0.16, 0.02); fillRR(g, x - 0.12, y - 0.08, 0.24, 0.16, 0.02, '#5a4030'); fillRR(g, x - 0.07, y - 0.05, 0.1, 0.08, 0.01, '#efe6cf'); }
    const p = 0.5 + 0.5 * Math.sin(o.now * 2 + o.x);
    g.fillStyle = radial(g, 0.5, 0.5, 0, 0.25, [[0, `rgba(170,140,255,${0.5 + p * 0.3})`], [1, 'rgba(170,140,255,0)']]);
    g.fillRect(0.25, 0.25, 0.5, 0.5); disc(g, 0.5, 0.5, 0.07, '#d5c8ff');
  },
  wizardry_academy(g, o) {
    ART.mage_school(g, o);
    g.beginPath(); g.arc(0.5, 0.5, 0.3, 0, TAU); g.strokeStyle = 'rgba(190,150,255,0.6)'; g.lineWidth = 0.025; g.stroke();
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + o.now * 0.3; disc(g, 0.5 + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3, 0.025, '#e8dcff'); }
  },
  temple(g, o) {
    for (let r = 0; r < 3; r++) fillRR(g, 0.14, 0.42 + r * 0.17, 0.72, 0.08, 0.02, '#6e4a2c');
    shadowRR(g, 0.3, 0.08, 0.4, 0.22, 0.03); fillRR(g, 0.3, 0.08, 0.4, 0.22, 0.03, '#d8cfb8');
    for (const cx of [0.36, 0.64]) { disc(g, cx, 0.14, 0.03, '#efe6d0'); flame(g, cx, 0.12, 0.035, o.now, cx * 7 + o.y); }
  },
  cathedral(g, o) {
    ART.temple(g, o);
    const p = 0.5 + 0.5 * Math.sin(o.now * 1.2 + o.x);
    g.fillStyle = radial(g, 0.5, 0.2, 0, 0.45, [[0, `rgba(255,240,190,${0.25 + p * 0.15})`], [1, 'rgba(255,240,190,0)']]);
    g.fillRect(0, 0, 1, 1);
  },
  spellmason(g, o) {
    ART.library(g, o);
    for (let k = 0; k < 3; k++) { const x = 0.3 + k * 0.2; g.fillStyle = '#e8dcc0'; g.fillRect(x - 0.05, 0.55, 0.1, 0.14); line(g, x - 0.05, 0.55, x + 0.05, 0.55, '#a07a4a', 0.03); line(g, x - 0.05, 0.69, x + 0.05, 0.69, '#a07a4a', 0.03); }
  },
  magic_lab(g, o) {
    g.beginPath(); g.arc(0.5, 0.5, 0.36, 0, TAU); g.strokeStyle = 'rgba(176,122,224,0.6)'; g.lineWidth = 0.03; g.stroke();
    g.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * TAU * 2 - Math.PI / 2; g.lineTo(0.5 + Math.cos(a) * 0.36, 0.5 + Math.sin(a) * 0.36); } g.closePath(); g.strokeStyle = 'rgba(176,122,224,0.4)'; g.stroke();
    ART.alchemy(g, o);
  },
  barn(g, o) { /* drawn as one roof by the structure */ },
  fence(g, o) {
    // Low posts and rails — reads as a boundary without a wall's bulk.
    line(g, 0.04, 0.42, 0.96, 0.42, 'rgba(0,0,0,0.3)', 0.05);
    line(g, 0.04, 0.4, 0.96, 0.4, '#8a6a42', 0.045);
    line(g, 0.04, 0.62, 0.96, 0.62, 'rgba(0,0,0,0.3)', 0.05);
    line(g, 0.04, 0.6, 0.96, 0.6, '#7a5c38', 0.045);
    for (const x of [0.12, 0.5, 0.88]) { fillRR(g, x - 0.035, 0.16, 0.07, 0.68, 0.015, '#5a4128'); fillRR(g, x - 0.02, 0.16, 0.02, 0.68, 0.01, '#846238'); }
  },
  palisade(g, o) {
    // Stone-braced stakes: a fence with a rubble footing.
    fillRR(g, 0.05, 0.72, 0.9, 0.16, 0.03, '#5a574f');
    for (let k = 0; k < 5; k++) disc(g, 0.1 + rhash(o.x, o.y, 960 + k) * 0.8, 0.76 + rhash(o.x, o.y, 965 + k) * 0.08, 0.045, '#726e64');
    for (let k = 0; k < 6; k++) {
      const x = 0.1 + k * 0.16;
      g.beginPath(); g.moveTo(x - 0.045, 0.75); g.lineTo(x + 0.06, 0.08); g.lineTo(x + 0.045, 0.77); g.closePath();
      g.fillStyle = k & 1 ? '#6d4c2c' : '#7d5a36'; g.fill();
    }
  },
  banner(g, o) {
    // Wall-hung cloth — no footprint, just colour on the tile.
    fillRR(g, 0.42, 0.06, 0.06, 0.3, 0.01, '#4a3a28');
    const col = ['#8e3b3b', '#3b5f8e', '#4f7a45', '#8a6a2e'][(rhash(o.x, o.y, 970) * 4) | 0];
    g.beginPath();
    g.moveTo(0.32, 0.1); g.lineTo(0.68, 0.1); g.lineTo(0.68, 0.56); g.lineTo(0.5, 0.46); g.lineTo(0.32, 0.56);
    g.closePath(); g.fillStyle = col; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(0.32, 0.1, 0.36, 0.05);
  },
  lamppost(g, o) {
    oval(g, 0.54, 0.62, 0.1, 0.06, 'rgba(0,0,0,0.35)');
    fillRR(g, 0.47, 0.3, 0.06, 0.34, 0.01, '#3a3a40');
    disc(g, 0.5, 0.28, 0.11, '#232228');
    disc(g, 0.5, 0.28, 0.075, radial(g, 0.5, 0.28, 0, 0.075, [[0, '#ffe6a0'], [1, '#c99a3a']]));
    g.fillStyle = `rgba(255,220,140,${0.18 + 0.1 * Math.sin(o.now * 3 + o.x)})`;
    disc(g, 0.5, 0.28, 0.22, g.fillStyle);
  },
  statuette(g, o) {
    shadowRR(g, 0.28, 0.34, 0.44, 0.46, 0.04, 0.35);
    fillRR(g, 0.28, 0.34, 0.44, 0.46, 0.04, '#8c8a90');
    disc(g, 0.5, 0.42, 0.09, '#b4b1b8');
    oval(g, 0.5, 0.64, 0.14, 0.16, '#9a979e');
  },
  monument(g, o) {
    const p = 0.5 + 0.5 * Math.sin(o.now * 1.1 + o.x);
    g.fillStyle = radial(g, 0.5, 0.5, 0, 0.66, [[0, `rgba(230,200,120,${0.2 + p * 0.12})`], [1, 'rgba(230,200,120,0)']]);
    g.fillRect(-0.2, -0.2, 1.4, 1.4);
    shadowRR(g, 0.1, 0.16, 0.8, 0.76, 0.05, 0.4);
    fillRR(g, 0.1, 0.5, 0.8, 0.42, 0.04, '#6f6d72');
    fillRR(g, 0.22, 0.16, 0.56, 0.4, 0.05, '#8c8a90');
    disc(g, 0.5, 0.28, 0.16, '#b4b1b8');
    disc(g, 0.5, 0.28, 0.08, '#d8d5db');
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 0.02; g.strokeRect(0.14, 0.54, 0.72, 0.34);
  },
  turret_ballista(g, o) {
    // A crossbow bolted to a swivel platform — drawn resting, aimed north.
    shadowRR(g, 0.24, 0.34, 0.5, 0.5, 0.05, 0.35);
    fillRR(g, 0.24, 0.34, 0.5, 0.5, 0.05, '#4a3d30');
    disc(g, 0.49, 0.59, 0.16, '#6a5a44');
    disc(g, 0.49, 0.59, 0.16, radial(g, 0.44, 0.53, 0, 0.16, [[0, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]));
    // The bow arms, strung, aimed toward the top edge.
    line(g, 0.16, 0.3, 0.5, 0.1, '#a07a46', 0.06);
    line(g, 0.82, 0.3, 0.5, 0.1, '#a07a46', 0.06);
    line(g, 0.16, 0.3, 0.82, 0.3, '#2a2018', 0.025);
    // The bolt, nocked and ready.
    line(g, 0.49, 0.59, 0.49, 0.12, '#d8c89a', 0.03);
    g.beginPath(); g.moveTo(0.44, 0.16); g.lineTo(0.49, 0.04); g.lineTo(0.54, 0.16); g.closePath();
    g.fillStyle = '#c94a3a'; g.fill();
    disc(g, 0.49, 0.59, 0.06, '#241c14');
  },
  turret_arcane(g, o) {
    const p = 0.5 + 0.5 * Math.sin(o.now * 2 + o.y);
    fillRR(g, 0.3, 0.34, 0.4, 0.4, 0.06, '#4a3860');
    disc(g, 0.5, 0.42, 0.16, '#2a1e3e');
    disc(g, 0.5, 0.42, 0.09, radial(g, 0.5, 0.42, 0, 0.09, [[0, '#e0b0ff'], [1, '#8a4ac0']]));
    g.fillStyle = `rgba(180,120,230,${0.2 + p * 0.2})`; disc(g, 0.5, 0.42, 0.24, g.fillStyle);
    for (const a of [0.6, 2.4, 4.2]) line(g, 0.5, 0.42, 0.5 + Math.cos(a) * 0.22, 0.42 + Math.sin(a) * 0.22, '#3a2c50', 0.03);
  },
  watchtower(g, o) {
    // Taller and squarer than the Watchpost, with a rampart lip.
    fillRR(g, 0.14, 0.2, 0.94, 0.94, 0.04, 'rgba(0,0,0,0.35)');
    fillRR(g, 0, 0.06, 0.9, 0.9, 0.04, '#726a60');
    fillRR(g, 0.06, 0.12, 0.78, 0.78, 0.03, '#8a8074');
    g.strokeStyle = '#4a4238'; g.lineWidth = 0.05; g.strokeRect(0.045, 0.135, 0.81, 0.81);
    for (let k = 0; k < 4; k++) { const t = 0.1 + k * 0.22; g.fillStyle = '#4a4238'; g.fillRect(t, 0.06, 0.1, 0.05); }
  },
  armory(g, o) {
    shadowRR(g, 0.16, 0.16, 0.68, 0.68, 0.05, 0.35);
    fillRR(g, 0.16, 0.16, 0.68, 0.68, 0.05, '#5a4a3a');
    fillRR(g, 0.22, 0.22, 0.56, 0.56, 0.03, '#3a2f24');
    for (const [ax, ay, rot] of [[0.36, 0.5, -0.5], [0.64, 0.5, 0.5]]) {
      g.save(); g.translate(ax, ay); g.rotate(rot);
      g.fillStyle = '#b8b4a8'; g.fillRect(-0.02, -0.22, 0.04, 0.3);
      g.fillStyle = '#8a7a5a'; g.fillRect(-0.06, 0.04, 0.12, 0.05);
      g.restore();
    }
  },
  archive(g, o) {
    fillRR(g, 0.12, 0.1, 0.76, 0.8, 0.04, '#4a3626');
    for (let r = 0; r < 4; r++) {
      const y = 0.16 + r * 0.18;
      fillRR(g, 0.18, y, 0.64, 0.13, 0.015, '#6a4e34');
      for (let k = 0; k < 7; k++) g.fillStyle = ['#8a3b3b', '#3b5f8e', '#4f7a45', '#8a6a2e', '#6a4a8a'][(rhash(o.x + r, o.y + k, 980) * 5) | 0], g.fillRect(0.21 + k * 0.085, y + 0.015, 0.06, 0.1);
    }
  },
  observatory(g, o) {
    fillRR(g, 0.14, 0.4, 0.72, 0.5, 0.04, '#403a4a');
    disc(g, 0.5, 0.38, 0.32, '#5a5266');
    disc(g, 0.5, 0.38, 0.32, radial(g, 0.5, 0.38, 0, 0.32, [[0, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]));
    g.save(); g.translate(0.5, 0.38); g.rotate(-0.6);
    g.fillStyle = '#2a2432'; g.fillRect(-0.05, -0.3, 0.1, 0.3);
    g.fillStyle = '#7a7488'; g.fillRect(-0.06, -0.3, 0.12, 0.06);
    g.restore();
  },
  archery_range(g, o) {
    disc(g, 0.5, 0.5, 0.26, '#c9a45e');
    g.beginPath(); for (const r of [0.26, 0.17, 0.08]) { g.moveTo(0.5 + r, 0.5); g.arc(0.5, 0.5, r, 0, TAU); }
    g.strokeStyle = '#b03a2a'; g.lineWidth = 0.03; g.stroke();
    disc(g, 0.5, 0.5, 0.03, '#3a2818');
    line(g, 0.14, 0.86, 0.42, 0.58, '#6d4a2a', 0.03);
  },
  proving_grounds(g, o) {
    oval(g, 0.55, 0.62, 0.34, 0.2, 'rgba(0,0,0,0.3)');
    disc(g, 0.5, 0.5, 0.28, '#8a7454');
    g.strokeStyle = '#6a5638'; g.lineWidth = 0.03; g.beginPath(); g.arc(0.5, 0.5, 0.28, 0, TAU); g.stroke();
    for (const [ax, ay, rot] of [[0.4, 0.46, -0.7], [0.6, 0.54, 0.7]]) {
      g.save(); g.translate(ax, ay); g.rotate(rot);
      g.fillStyle = '#c8c4b8'; g.fillRect(-0.018, -0.2, 0.036, 0.26);
      g.restore();
    }
  },
  herbalist_hut(g, o) {
    shadowRR(g, 0.16, 0.28, 0.68, 0.5, 0.06, 0.3);
    fillRR(g, 0.16, 0.28, 0.68, 0.5, 0.06, '#4a5a34');
    for (let k = 0; k < 5; k++) {
      const hx = 0.24 + rhash(o.x, o.y, 990 + k) * 0.52, hy = 0.34 + rhash(o.x, o.y, 995 + k) * 0.36;
      disc(g, hx, hy, 0.05, k % 2 ? '#6fa848' : '#8ac05a');
    }
  },
  rug(g, o) {
    // Woven, with a border and a diamond — colour picked per tile.
    const pal = [['#8e3b3b', '#d8b25a'], ['#3b5f8e', '#d9d4c7'], ['#4f6a3a', '#c9a45e'], ['#6b4a7a', '#e0c8a0']][(rhash(o.x, o.y, 1000) * 4) | 0];
    fillRR(g, 0.08, 0.14, 0.84, 0.72, 0.03, 'rgba(0,0,0,0.22)');
    fillRR(g, 0.06, 0.12, 0.84, 0.72, 0.03, pal[0]);
    g.strokeStyle = pal[1]; g.lineWidth = 0.03; g.strokeRect(0.12, 0.18, 0.72, 0.6);
    g.beginPath(); g.moveTo(0.48, 0.28); g.lineTo(0.68, 0.48); g.lineTo(0.48, 0.68); g.lineTo(0.28, 0.48); g.closePath();
    g.fillStyle = pal[1]; g.fill();
    disc(g, 0.48, 0.48, 0.05, pal[0]);
    g.beginPath();
    for (let k = 0; k < 7; k++) { const x = 0.1 + k * 0.127; g.moveTo(x, 0.84); g.lineTo(x, 0.9); g.moveTo(x, 0.06); g.lineTo(x, 0.12); }
    g.strokeStyle = pal[1]; g.lineWidth = 0.015; g.stroke();
  },
  bedroll(g, o) {
    // A rolled pallet with a folded blanket and a stuffed-sack pillow.
    const col = BLANKETS[(rhash(o.x, o.y, 1010) * BLANKETS.length) | 0];
    fillRR(g, 0.26, 0.14, 0.52, 0.8, 0.1, 'rgba(0,0,0,0.28)');
    fillRR(g, 0.22, 0.1, 0.52, 0.8, 0.1, '#8a7a5a');
    fillRR(g, 0.25, 0.4, 0.46, 0.46, 0.08, col);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(0.25, 0.4, 0.46, 0.05);
    line(g, 0.26, 0.62, 0.7, 0.62, 'rgba(0,0,0,0.18)', 0.02);
    oval(g, 0.48, 0.24, 0.17, 0.08, '#cdbf9e');
    line(g, 0.36, 0.24, 0.6, 0.24, 'rgba(0,0,0,0.12)', 0.015);
  },
  campfire(g, o) {
    // A ring of stones, crossed logs and a fire; two log seats.
    for (const [lx, ly, rot] of [[0.14, 0.5, Math.PI / 2], [0.86, 0.5, Math.PI / 2]]) oval(g, lx, ly, 0.2, 0.06, '#6b4a2c', rot);
    disc(g, 0.52, 0.54, 0.27, 'rgba(0,0,0,0.25)');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      disc(g, 0.5 + Math.cos(a) * 0.22, 0.5 + Math.sin(a) * 0.22, 0.06, k & 1 ? '#77746f' : '#8d8a84');
    }
    disc(g, 0.5, 0.5, 0.16, '#2a1c14');
    line(g, 0.38, 0.4, 0.62, 0.6, '#5b3a22', 0.06); line(g, 0.38, 0.6, 0.62, 0.4, '#6b4528', 0.06);
    flame(g, 0.5, 0.5, 0.11, o.now, o.x * 5 + o.y);
  },
  torch(g, o) {
    // A pole driven into the ground, flame on top.
    oval(g, 0.56, 0.84, 0.1, 0.04, 'rgba(0,0,0,0.35)');
    line(g, 0.5, 0.84, 0.5, 0.36, '#5b3a22', 0.05);
    fillRR(g, 0.44, 0.3, 0.12, 0.1, 0.02, '#3a2a1c');
    flame(g, 0.5, 0.28, 0.08, o.now, o.x * 3 + o.y * 2);
  },
  planter(g, o) {
    // A plank box full of blooms.
    shadowRR(g, 0.12, 0.44, 0.76, 0.42, 0.04);
    fillRR(g, 0.12, 0.44, 0.76, 0.42, 0.04, '#7a5634');
    line(g, 0.14, 0.64, 0.86, 0.64, 'rgba(40,24,10,0.4)', 0.015);
    fillRR(g, 0.16, 0.44, 0.68, 0.08, 0.02, '#3d2a1a');
    const petals = ['#e06a8a', '#e0c04a', '#f2efe6', '#9a7ae0', '#e08a4a'];
    for (let k = 0; k < 7; k++) {
      const fx = 0.2 + k * 0.1, fy = 0.34 + rhash(o.x, o.y, 1020 + k) * 0.14;
      line(g, fx, fy, fx, 0.48, '#4f7a35', 0.018);
      disc(g, fx - 0.03, fy + 0.07, 0.03, '#6fa848');
      const c = petals[(rhash(o.x, o.y, 1030 + k) * petals.length) | 0];
      for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; disc(g, fx + Math.cos(a) * 0.03, fy + Math.sin(a) * 0.03, 0.022, c); }
      disc(g, fx, fy, 0.015, '#f0d060');
    }
  },
  bench(g, o) {
    shadowRR(g, 0.08, 0.36, 0.84, 0.26, 0.03);
    for (const lx of [0.14, 0.8]) fillRR(g, lx, 0.56, 0.06, 0.14, 0.01, '#3e2a18');
    fillRR(g, 0.08, 0.36, 0.84, 0.24, 0.03, '#8a633e');
    line(g, 0.1, 0.48, 0.9, 0.48, 'rgba(40,24,10,0.45)', 0.015);
    g.fillStyle = 'rgba(255,230,190,0.14)'; g.fillRect(0.1, 0.37, 0.8, 0.03);
  },
  game_table(g, o) {
    // A round table: cards, dice and a pile of coin, with stools.
    for (const [sx, sy] of [[0.5, 0.08], [0.5, 0.92], [0.08, 0.5], [0.92, 0.5]]) disc(g, sx, sy, 0.075, '#4d3420');
    disc(g, 0.53, 0.55, 0.36, 'rgba(0,0,0,0.3)');
    disc(g, 0.5, 0.5, 0.36, '#5b3a22');
    disc(g, 0.5, 0.5, 0.31, '#2f5a3a');
    g.beginPath(); g.arc(0.5, 0.5, 0.31, 0, TAU); g.strokeStyle = '#7a5634'; g.lineWidth = 0.02; g.stroke();
    for (const [cx, cy, r] of [[0.36, 0.4, -0.3], [0.42, 0.36, 0.15]]) {
      g.save(); g.translate(cx, cy); g.rotate(r); fillRR(g, -0.05, -0.07, 0.1, 0.14, 0.015, '#f2efe6'); g.fillStyle = '#c84040'; g.fillRect(-0.015, -0.02, 0.03, 0.04); g.restore();
    }
    for (const [dx, dy] of [[0.6, 0.62], [0.68, 0.54]]) { fillRR(g, dx - 0.04, dy - 0.04, 0.08, 0.08, 0.015, '#ece6d6'); disc(g, dx, dy, 0.012, '#222'); }
    for (let k = 0; k < 4; k++) disc(g, 0.36 + k * 0.02, 0.64 - k * 0.012, 0.035, k & 1 ? '#c9a24a' : '#e2c05a');
  },
  shelf(g, o) {
    // Racks against the north side, loaded with odds and ends.
    shadowRR(g, 0.06, 0.08, 0.88, 0.5, 0.02, 0.35);
    fillRR(g, 0.06, 0.08, 0.88, 0.5, 0.02, '#4a3220');
    for (let r = 0; r < 2; r++) {
      const y = 0.12 + r * 0.22;
      fillRR(g, 0.09, y, 0.82, 0.18, 0.01, '#6e4c2c');
      for (let k = 0; k < 4; k++) {
        const kind = (rhash(o.x + r, o.y + k, 1040) * 3) | 0, cx = 0.18 + k * 0.2;
        if (kind === 0) fillRR(g, cx - 0.07, y + 0.03, 0.14, 0.13, 0.01, '#a07a4a');
        else if (kind === 1) { disc(g, cx, y + 0.09, 0.065, '#7a5230'); disc(g, cx, y + 0.09, 0.04, '#94683e'); }
        else oval(g, cx, y + 0.1, 0.075, 0.06, '#b9a47a');
      }
    }
    for (const lx of [0.1, 0.86]) fillRR(g, lx, 0.56, 0.04, 0.1, 0.01, '#3a2616');
  },
  shed(g, o) {
    // Seen from above: a pitched plank roof over a small store.
    fillRR(g, 0.12, 0.14, 0.84, 0.82, 0.03, 'rgba(0,0,0,0.35)');
    fillRR(g, 0.04, 0.06, 0.88, 0.82, 0.03, '#6a4a2c');
    fillRR(g, 0.04, 0.06, 0.88, 0.41, 0.03, '#7d5a36');
    g.beginPath();
    for (let k = 1; k < 8; k++) { const x = 0.04 + k * 0.11; g.moveTo(x, 0.06); g.lineTo(x, 0.88); }
    g.strokeStyle = 'rgba(30,18,8,0.35)'; g.lineWidth = 0.012; g.stroke();
    line(g, 0.04, 0.47, 0.92, 0.47, '#4a3220', 0.035);
    fillRR(g, 0.38, 0.74, 0.2, 0.16, 0.02, '#3a2616');
    disc(g, 0.54, 0.82, 0.015, '#c9a24a');
  },
  well(g, o) {
    // A stone ring, dark water, and a windlass on two posts.
    disc(g, 0.53, 0.56, 0.36, 'rgba(0,0,0,0.3)');
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      disc(g, 0.5 + Math.cos(a) * 0.29, 0.52 + Math.sin(a) * 0.29, 0.085, k & 1 ? '#7a766e' : '#928d84');
    }
    disc(g, 0.5, 0.52, 0.21, '#1a2a38');
    disc(g, 0.5, 0.52, 0.17, radial(g, 0.46, 0.48, 0, 0.17, [[0, '#3a6a8a'], [1, '#12202c']]));
    const sh = 0.5 + 0.5 * Math.sin(o.now * 1.5 + o.x);
    oval(g, 0.44, 0.47, 0.06, 0.02, `rgba(200,230,255,${0.2 + sh * 0.2})`);
    for (const px of [0.16, 0.84]) fillRR(g, px - 0.04, 0.44, 0.08, 0.16, 0.02, '#5b3a22');
    line(g, 0.16, 0.5, 0.84, 0.5, '#7a5634', 0.05);
    fillRR(g, 0.44, 0.52, 0.12, 0.12, 0.02, '#8a643a');
    line(g, 0.5, 0.5, 0.5, 0.52, '#c9b88a', 0.012);
  },
  scarecrow(g, o) {
    // Crossed poles, a straw body and a patched hat; the straw frays in the wind.
    oval(g, 0.58, 0.84, 0.18, 0.05, 'rgba(0,0,0,0.3)');
    line(g, 0.5, 0.86, 0.5, 0.2, '#5b3a22', 0.045);
    const sway = Math.sin(o.now * 1.3 + o.x * 2) * 0.02;
    line(g, 0.18, 0.4 + sway, 0.82, 0.4 - sway, '#6b4528', 0.04);
    fillRR(g, 0.36, 0.36, 0.28, 0.3, 0.05, '#7a5a8a');
    g.fillStyle = '#b08a4a'; g.fillRect(0.46, 0.42, 0.08, 0.08);
    for (const [hx, dir] of [[0.18, -1], [0.82, 1]]) for (let k = 0; k < 3; k++) line(g, hx, 0.4, hx + dir * 0.06, 0.36 + k * 0.05, '#e0c070', 0.015);
    for (let k = 0; k < 4; k++) line(g, 0.4 + k * 0.06, 0.64, 0.38 + k * 0.07, 0.74, '#e0c070', 0.015);
    disc(g, 0.5, 0.26, 0.09, '#d9c080');
    disc(g, 0.47, 0.25, 0.012, '#2a1a10'); disc(g, 0.53, 0.25, 0.012, '#2a1a10');
    oval(g, 0.5, 0.18, 0.16, 0.04, '#5a4a30');
    fillRR(g, 0.42, 0.08, 0.16, 0.1, 0.03, '#5a4a30');
  },
  stakes(g, o) {
    // A row of sharpened stakes angled outward, lashed to a crossbar.
    oval(g, 0.52, 0.72, 0.44, 0.08, 'rgba(0,0,0,0.3)');
    line(g, 0.06, 0.62, 0.94, 0.62, '#4a3220', 0.045);
    for (let k = 0; k < 5; k++) {
      const x = 0.12 + k * 0.19, lean = (rhash(o.x, o.y, 1050 + k) - 0.5) * 0.06;
      g.beginPath(); g.moveTo(x - 0.05, 0.74); g.lineTo(x + 0.02 + lean, 0.12); g.lineTo(x + 0.05, 0.74); g.closePath();
      g.fillStyle = k & 1 ? '#7d5a36' : '#6d4c2c'; g.fill();
      g.beginPath(); g.moveTo(x - 0.012 + lean * 0.9, 0.24); g.lineTo(x + 0.02 + lean, 0.12); g.lineTo(x + 0.03 + lean * 0.9, 0.24); g.closePath();
      g.fillStyle = '#d1ad76'; g.fill();
    }
    line(g, 0.06, 0.6, 0.94, 0.6, '#5b3a22', 0.03);
  },
  apothecary(g, o) {
    // A narrow shelf of bottles over a counter.
    shadowRR(g, 0.1, 0.18, 0.8, 0.66, 0.05);
    fillRR(g, 0.1, 0.18, 0.8, 0.66, 0.05, '#4d3420');
    fillRR(g, 0.14, 0.22, 0.72, 0.18, 0.03, '#2e2016');
    const cols = ['#d04a4a', '#4a8ad0', '#5ac06a', '#e0b040', '#b06ad0'];
    for (let k = 0; k < 5; k++) { fillRR(g, 0.18 + k * 0.13, 0.25, 0.08, 0.13, 0.03, cols[k]); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0.19 + k * 0.13, 0.27, 0.02, 0.05); }
    fillRR(g, 0.14, 0.5, 0.72, 0.28, 0.04, '#8a633e');
    disc(g, 0.34, 0.63, 0.07, '#e8e0cf'); disc(g, 0.62, 0.64, 0.06, '#5ac06a');
  },
  trading_post(g, o) {
    // A counter under a striped awning, with a set of scales.
    shadowRR(g, 0.08, 0.34, 0.84, 0.5, 0.05);
    fillRR(g, 0.1, 0.4, 0.8, 0.44, 0.05, '#7a5230');
    g.fillStyle = '#5e4024'; g.fillRect(0.1, 0.52, 0.8, 0.04);
    for (let k = 0; k < 5; k++) { g.fillStyle = k & 1 ? '#e8dcc0' : '#c0503a'; g.fillRect(0.06 + k * 0.176, 0.12, 0.176, 0.2); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0.06, 0.3, 0.88, 0.03);
    line(g, 0.5, 0.44, 0.5, 0.7, '#d8b04a', 0.03); line(g, 0.34, 0.5, 0.66, 0.5, '#d8b04a', 0.03);
    disc(g, 0.34, 0.56, 0.06, '#e0b040'); disc(g, 0.66, 0.56, 0.06, '#e0b040');
  },
  counting_house(g, o) {
    // An iron strongbox behind a clerk's desk, a stack of coin on the ledger.
    shadowRR(g, 0.12, 0.2, 0.76, 0.66, 0.05);
    fillRR(g, 0.12, 0.2, 0.76, 0.66, 0.05, '#3c3c44');
    fillRR(g, 0.18, 0.26, 0.64, 0.34, 0.04, '#5a5a66');
    g.fillStyle = '#8a8a96'; g.fillRect(0.18, 0.36, 0.64, 0.04); g.fillRect(0.18, 0.48, 0.64, 0.04);
    disc(g, 0.5, 0.43, 0.07, '#c9a23c');
    fillRR(g, 0.2, 0.64, 0.6, 0.16, 0.03, '#8a633e');
    for (let k = 0; k < 3; k++) disc(g, 0.6, 0.72 - k * 0.035, 0.06, k & 1 ? '#f0cc5a' : '#c99a30');
    fillRR(g, 0.26, 0.67, 0.2, 0.1, 0.01, '#efe6cc');
  },
  stable(g, o) {
    // A stall: plank walls on three sides, straw and a manger.
    shadowRR(g, 0.08, 0.1, 0.84, 0.8, 0.04);
    fillRR(g, 0.08, 0.1, 0.84, 0.8, 0.04, '#6d4c2c');
    fillRR(g, 0.16, 0.18, 0.68, 0.72, 0.03, '#c9a95a');
    for (let k = 0; k < 9; k++) line(g, 0.2 + rhash(o.x, o.y, 1100 + k) * 0.6, 0.3 + rhash(o.x, o.y, 1110 + k) * 0.5, 0.26 + rhash(o.x, o.y, 1120 + k) * 0.5, 0.34 + rhash(o.x, o.y, 1130 + k) * 0.5, '#e0c47a', 0.02);
    fillRR(g, 0.2, 0.2, 0.6, 0.14, 0.03, '#5a3a22');
    fillRR(g, 0.24, 0.22, 0.52, 0.08, 0.02, '#8aa04a');
    line(g, 0.08, 0.5, 0.16, 0.5, '#4a3220', 0.04); line(g, 0.84, 0.5, 0.92, 0.5, '#4a3220', 0.04);
  },
  floor(g, o) {
    g.fillStyle = '#6c685f'; g.fillRect(0, 0, 1, 1);
    const sx = 0.35 + rhash(o.x, o.y, 620) * 0.3, sy = 0.35 + rhash(o.x, o.y, 621) * 0.3;
    const cells = [[0, 0, sx, sy], [sx, 0, 1 - sx, sy], [0, sy, sx, 1 - sy], [sx, sy, 1 - sx, 1 - sy]];
    for (let k = 0; k < 4; k++) {
      const [x, y, w, h] = cells[k];
      const v = 96 + ((rhash(o.x, o.y, 630 + k) * 22) | 0);
      fillRR(g, x + 0.025, y + 0.025, w - 0.05, h - 0.05, 0.04, `rgb(${v + 6},${v + 2},${v - 6})`);
    }
  },
};

/** Crops: four plants to a field tile, drawn at their growth stage. */
function drawCropArt(g, b, x, y) {
  const crop = CROPS[b.crop];
  if (!crop || !b.planted) return;
  const stage = growthStage(b.growth || 0);                 // 0..4
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const cx = 0.27 + c * 0.46 + (rhash(x, y, 700 + r * 2 + c) - 0.5) * 0.04;
    drawCropVec(g, b.crop, stage, cx, 0.44 + r * 0.46, (k) => rhash(x, y, 720 + r * 8 + c * 4 + k));
  }
}

// ============================================================================
// RENDERER
// ============================================================================
export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game;
    this.tile = TILE_DEFAULT;
    this.camX = game.world.start.x; this.camY = game.world.start.y;
    this.cacheVersion = -1;
    this.painter = null;
    this.structures = null; this.structVersion = -1; this.structWorld = null;
    this.hover = null;
    this.selection = null;
    this.selectedIds = new Set();   // multi-selected colonists
    this.dragRect = null;
    this.dragMode = null;           // 'marquee' while band-selecting, else tool name
    this.overlay = null;
    this.atlas = new EmojiAtlas();
    this.dpr = 1;
    this.now = 0;
    this.lightCanvas = document.createElement('canvas');
    this.sprites = new SpriteBook();
    this.motion = new WeakMap();    // unit → tween state, see motionOf()
    this.lastFrame = 0;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * dpr));
    this.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = r.width; this.viewH = r.height;
  }

  worldToScreen(x, y) {
    return [(x - this.camX) * this.tile + this.viewW / 2, (y - this.camY) * this.tile + this.viewH / 2];
  }
  screenToWorld(sx, sy) {
    return [Math.floor((sx - this.viewW / 2) / this.tile + this.camX), Math.floor((sy - this.viewH / 2) / this.tile + this.camY)];
  }
  /** Zoom by a factor, keeping the world point under (sx, sy) fixed on screen. */
  zoomAt(factor, sx = this.viewW / 2, sy = this.viewH / 2) {
    const t0 = this.tile;
    const t1 = Math.max(TILE_MIN, Math.min(TILE_MAX, t0 * factor));
    if (t1 === t0) return;
    const wx = (sx - this.viewW / 2) / t0 + this.camX, wy = (sy - this.viewH / 2) / t0 + this.camY;
    this.tile = t1;
    this.camX = wx - (sx - this.viewW / 2) / t1;
    this.camY = wy - (sy - this.viewH / 2) / t1;
  }

  get emojiOn() { return this.tile >= MIN_EMOJI_TILE && this.atlas.ok; }

  /** Put the context in tile units with the tile's top-left at (sx, sy). */
  tileSpace(sx, sy, scale = 1) {
    const d = this.dpr, t = this.tile * scale;
    this.ctx.setTransform(d * t, 0, 0, d * t, d * sx, d * sy);
  }
  screenSpace() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }

  /** The terrain layer's resolution: enough for the zoom, capped for memory. */
  wantP() {
    const w = this.game.world;
    const cap = Math.max(16, Math.floor(4096 / Math.max(w.w, w.h)));
    const need = this.tile * this.dpr;
    const P = need <= 24 ? 24 : need <= 40 ? 40 : 56;
    return Math.min(cap, P);
  }

  syncCaches() {
    const w = this.game.world;
    const P = this.wantP();
    // One painter per map, kept, so hopping between the camp and a floor
    // doesn't repaint either from scratch.
    if (!this.painters) this.painters = new WeakMap();
    let p = this.painters.get(w);
    if (!p || p.P !== P) { p = new TerrainPainter(w, P); this.painters.set(w, p); }
    else p.sync();
    this.painter = p;
    this.cacheVersion = w._bcVersion;
    if (this.structWorld !== w || this.structVersion !== w._bcVersion) {
      this.structures = computeStructures(w);
      this.structWorld = w; this.structVersion = w._bcVersion;
    }
  }

  draw() {
    if (!this.viewW) this.resize();
    this.now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    const game = this.game, w = game.world, ctx = this.ctx, t = this.tile;
    this.syncCaches();
    const emoji = this.emojiOn;

    this.screenSpace();
    ctx.fillStyle = '#08090c';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const x0 = Math.max(0, Math.floor(this.camX - this.viewW / 2 / t) - 1);
    const y0 = Math.max(0, Math.floor(this.camY - this.viewH / 2 / t) - 1);
    const x1 = Math.min(w.w - 1, Math.ceil(this.camX + this.viewW / 2 / t) + 1);
    const y1 = Math.min(w.h - 1, Math.ceil(this.camY + this.viewH / 2 / t) + 1);

    // Blit only the visible part of the terrain layer.
    const P = this.painter.P;
    const [dx, dy] = this.worldToScreen(x0, y0);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    try {
      ctx.drawImage(this.painter.canvas, x0 * P, y0 * P, (x1 - x0 + 1) * P, (y1 - y0 + 1) * P,
        dx, dy, (x1 - x0 + 1) * t, (y1 - y0 + 1) * t);
    } catch (e) { /* zero-size canvas in a headless run */ }

    this.drawWaterShimmer(x0, y0, x1, y1);
    this.drawOverlay(x0, y0, x1, y1);
    this.drawDesignations(x0, y0, x1, y1);
    this.drawTraps(x0, y0, x1, y1);
    this.drawBuildings(x0, y0, x1, y1, emoji);
    this.drawGround(x0, y0, x1, y1);
    this.drawLighting(x0, y0, x1, y1);
    this.drawRift();
    this.drawStructureLabels(x0, y0, x1, y1);
    this.drawUnits(x0, y0, x1, y1);
    if (this.edgeFog !== false) this.drawEdgeFog();
    this.drawCursor();
    this.drawVignette();
  }

  /**
   * The map's border fades into the dark instead of stopping at a hard line:
   * a gradient a few tiles deep on every side, with slow-drifting banks of fog
   * over it so the edge never reads as a ruler.
   */
  drawEdgeFog() {
    const ctx = this.ctx, t = this.tile, w = this.game.world;
    const [ax, ay] = this.worldToScreen(0, 0), [bx, by] = this.worldToScreen(w.w, w.h);
    const F = Math.max(36, Math.min(240, t * 4.5));
    if (ax > this.viewW || bx < 0 || ay > this.viewH || by < 0) return;
    this.screenSpace();
    const FOG = '8,9,12';
    const band = (x0, y0, x1, y1, gx0, gy0, gx1, gy1) => {
      ctx.fillStyle = linear(ctx, gx0, gy0, gx1, gy1, [[0, `rgba(${FOG},1)`], [0.45, `rgba(${FOG},0.6)`], [1, `rgba(${FOG},0)`]]);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    };
    band(ax, ay, bx, ay + F, 0, ay, 0, ay + F);
    band(ax, by - F, bx, by, 0, by, 0, by - F);
    band(ax, ay, ax + F, by, ax, 0, ax + F, 0);
    band(bx - F, ay, bx, by, bx, 0, bx - F, 0);
    // Drifting banks: soft blobs strung along each side, bobbing out of step.
    const now = this.now;
    const blob = (x, y, r, a) => {
      ctx.fillStyle = radial(ctx, x, y, 0, r, [[0, `rgba(${FOG},${a})`], [1, `rgba(${FOG},0)`]]);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const step = F * 0.9, r = F * 0.85;
    for (let k = 0, x = ax; x <= bx; x += step, k++) {
      if (x < -r || x > this.viewW + r) continue;
      const d = Math.sin(now * 0.35 + k * 1.7) * F * 0.18;
      if (ay > -r && ay < this.viewH + r) blob(x + d, ay + F * 0.15 + d * 0.5, r, 0.55);
      if (by > -r && by < this.viewH + r) blob(x - d, by - F * 0.15 - d * 0.5, r, 0.55);
    }
    for (let k = 0, y = ay; y <= by; y += step, k++) {
      if (y < -r || y > this.viewH + r) continue;
      const d = Math.sin(now * 0.3 + k * 2.1) * F * 0.18;
      if (ax > -r && ax < this.viewW + r) blob(ax + F * 0.15 + d * 0.5, y + d, r, 0.55);
      if (bx > -r && bx < this.viewW + r) blob(bx - F * 0.15 - d * 0.5, y - d, r, 0.55);
    }
  }

  drawWaterShimmer(x0, y0, x1, y1) {
    if (this.tile < 14) return;
    const w = this.game.world, ctx = this.ctx, now = this.now;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (w.terrain[w.idx(x, y)] !== T.WATER) continue;
      const [sx, sy] = this.worldToScreen(x, y);
      this.tileSpace(sx, sy);
      const p = (now * 0.35 + rhash(x, y, 900)) % 1;
      const a = Math.sin(p * Math.PI) * 0.22;
      ctx.beginPath();
      const hx = 0.15 + rhash(x, y, 901) * 0.5, hy = 0.2 + p * 0.6;
      ctx.moveTo(hx, hy); ctx.quadraticCurveTo(hx + 0.15, hy - 0.06, hx + 0.3, hy);
      ctx.strokeStyle = `rgba(190,225,255,${a})`; ctx.lineWidth = 0.035; ctx.stroke();
    }
    this.screenSpace();
  }

  /**
   * Night: a darkness layer with holes cut out wherever something gives light,
   * then a warm additive glow on top. Lights flicker; the Rift glows.
   */
  drawLighting(x0, y0, x1, y1) {
    const game = this.game, w = game.world, ctx = this.ctx, t = this.tile;
    // A Rift floor has no sky: it is always dark down there, day or night.
    // A cartographer's map lights the floor like a lamp in every corner.
    const night = w.dark ? (game._m && game._m.revealed ? 0.22 : 0.6) : game.isNight ? 0.55 : (game.hour < 8 || game.hour > 18 ? 0.28 : 0);
    if (night <= 0) return;
    const lc = this.lightCanvas;
    const s = 0.5;
    const lw = Math.max(1, Math.ceil(this.viewW * s)), lh = Math.max(1, Math.ceil(this.viewH * s));
    if (lc.width !== lw || lc.height !== lh) { lc.width = lw; lc.height = lh; }
    const g = lc.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, lw, lh);
    g.fillStyle = `rgba(8,10,26,${night})`;
    g.fillRect(0, 0, lw, lh);
    const lights = [];
    for (const rec of w.findBuildings()) {
      const def = BUILDINGS[rec.b.id];
      const r = def.light || (rec.b.id === 'kitchen' ? 4 : rec.b.id === 'smithy' ? 3 : rec.b.id === 'shrine' ? 2.5 : 0);
      if (!r) continue;
      if (rec.x < x0 - r || rec.x > x1 + r || rec.y < y0 - r || rec.y > y1 + r) continue;
      const flick = 1 + 0.04 * Math.sin(this.now * 7 + rec.x * 3.1 + rec.y);
      const [sx, sy] = this.worldToScreen(rec.x + 0.5, rec.y + 0.5);
      lights.push([sx, sy, r * t * flick * 0.8]);
    }
    const rf = w.rift;
    if (rf) {
      const [sx, sy] = this.worldToScreen(rf.x + 0.5, rf.y + 0.5);
      lights.push([sx, sy, (rf.rx + 4) * t, true]);
    }
    if (w.dark) {
      // Down there everyone carries a torch, and some things glow on their own.
      for (const c of game.here) {
        const m = this.motion.get(c);
        const [sx, sy] = this.worldToScreen((m ? m.x : c.x) + 0.5, (m ? m.y : c.y) + 0.5);
        lights.push([sx, sy, 3.6 * t * (1 + 0.05 * Math.sin(this.now * 9 + c.id))]);
      }
      for (let y = Math.max(0, y0 - 3); y <= Math.min(w.h - 1, y1 + 3); y++) for (let x = Math.max(0, x0 - 3); x <= Math.min(w.w - 1, x1 + 3); x++) {
        const f = w.feature[w.idx(x, y)];
        if (!f || !FEATURES[f].glow) continue;
        const [sx, sy] = this.worldToScreen(x + 0.5, y + 0.5);
        lights.push([sx, sy, FEATURES[f].glow * t, 'glow']);
      }
      for (const s of [w.stairsUp, w.stairsDown, w.lair]) {
        if (!s) continue;
        const [sx, sy] = this.worldToScreen(s.x + 0.5, s.y + 0.5);
        lights.push([sx, sy, 2.2 * t]);
      }
    }
    g.globalCompositeOperation = 'destination-out';
    for (const [sx, sy, r] of lights) {
      g.fillStyle = radial(g, sx * s, sy * s, 0, r * s, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]);
      g.fillRect((sx - r) * s, (sy - r) * s, r * 2 * s, r * 2 * s);
    }
    g.globalCompositeOperation = 'source-over';
    this.screenSpace();
    try { ctx.drawImage(lc, 0, 0, this.viewW, this.viewH); } catch (e) { /* headless */ }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [sx, sy, r, rift] of lights) {
      const col = rift === 'glow' ? '140,220,255' : rift ? (game.isNight ? '255,70,120' : '170,110,255') : '255,160,70';
      ctx.fillStyle = radial(ctx, sx, sy, 0, r, [[0, `rgba(${col},${0.3 * night})`], [1, `rgba(${col},0)`]]);
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  drawVignette() {
    const ctx = this.ctx, W = this.viewW, H = this.viewH;
    ctx.fillStyle = radial(ctx, W / 2, H / 2, Math.min(W, H) * 0.45, Math.max(W, H) * 0.8,
      [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]);
    ctx.fillRect(0, 0, W, H);
  }

  /**
   * The Rift Gate: a void ringed in violet light, its arms turning slowly. By
   * day it idles; at night it is open, and the glow runs red. A plaque above
   * names its level and rank so the threat is always on screen.
   */
  drawRift() {
    const g = this.game, r = g.world.rift;
    if (!r) return;
    const ctx = this.ctx, t = this.tile;
    const now = this.now;
    const open = g.isNight;
    const [cx, cy] = this.worldToScreen(r.x + 0.5, r.y + 0.5);
    const rx = (r.rx + 0.7) * t, ry = (r.ry + 0.7) * t;
    const pulse = 0.5 + 0.5 * Math.sin(now * (open ? 3.2 : 1.4));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    // Halo — spills light onto the ground around the gate.
    ctx.fillStyle = radial(ctx, 0, 0, rx * 0.2, rx * 1.9, open
      ? [[0, `rgba(255,70,110,${0.45 + pulse * 0.2})`], [0.5, 'rgba(170,30,90,0.22)'], [1, 'rgba(80,0,40,0)']]
      : [[0, `rgba(190,120,255,${0.35 + pulse * 0.12})`], [0.5, 'rgba(110,50,200,0.18)'], [1, 'rgba(50,0,90,0)']]);
    ctx.beginPath(); ctx.arc(0, 0, rx * 1.9, 0, TAU); ctx.fill();
    // A ragged stone lip around the void.
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) {
      const a = (k / 40) * TAU, d = rx * (1.08 + rhash(k, 3, 950) * 0.1);
      ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    ctx.closePath();
    ctx.fillStyle = '#2b2530'; ctx.fill();
    // The void itself.
    ctx.fillStyle = radial(ctx, 0, 0, 0, rx, [[0, '#030006'], [0.55, open ? '#2a0616' : '#170532'],
      [0.9, open ? '#b0305a' : '#6a2bb8'], [1, open ? 'rgba(255,150,170,0.95)' : 'rgba(210,160,255,0.95)']]);
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
    // Turning arms.
    ctx.rotate(now * (open ? 0.9 : 0.35));
    ctx.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      ctx.rotate(Math.PI / 3);
      ctx.strokeStyle = open ? `rgba(255,140,170,${0.28 + 0.04 * k})` : `rgba(215,170,255,${0.22 + 0.04 * k})`;
      ctx.lineWidth = Math.max(1, t * (0.08 + k * 0.02));
      ctx.beginPath(); ctx.arc(0, 0, rx * (0.25 + k * 0.12), 0, 1.1 + k * 0.08); ctx.stroke();
    }
    ctx.restore();
    // Rim sparks.
    for (let k = 0; k < 18; k++) {
      const a = now * 0.5 + k * 0.349;
      const px = cx + Math.cos(a) * rx * 1.02, py = cy + Math.sin(a) * ry * 1.02;
      ctx.fillStyle = open ? 'rgba(255,190,200,0.8)' : 'rgba(230,200,255,0.75)';
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    // Plaque.
    if (t >= 8) {
      const lv = g.rift.level;
      const label = `RIFT GATE · Lv ${lv} · Rank ${g.riftRank}${open ? ' · OPEN' : ''}`;
      ctx.save();
      ctx.font = `600 ${Math.max(11, Math.min(16, t * 0.45))}px ${UI_FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const mt = ctx.measureText && ctx.measureText(label);
      const tw = (mt && mt.width) || 120;
      const py = cy - ry - Math.max(14, t * 0.9);
      ctx.fillStyle = 'rgba(12,6,20,0.85)';
      ctx.fillRect(cx - tw / 2 - 8, py - 10, tw + 16, 20);
      ctx.strokeStyle = open ? 'rgba(255,110,140,0.9)' : 'rgba(190,140,255,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - tw / 2 - 8 + 0.5, py - 10 + 0.5, tw + 15, 19);
      ctx.fillStyle = open ? '#ffc2cf' : '#eadcff';
      ctx.fillText(label, cx, py + 1);
      ctx.restore();
    }
  }

  // Optional soil / water overlay — farming has to be legible to plan around.
  // One hue, light to dark, which is what a continuous magnitude wants.
  drawOverlay(x0, y0, x1, y1) {
    const w = this.game.world, ctx = this.ctx, t = this.tile;
    const field = this.overlay === 'soil' ? w.soil : this.overlay === 'water' ? w.water : null;
    if (!field) return;
    const rgb = this.overlay === 'soil' ? '110,210,120' : '90,160,230';
    ctx.save();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = w.idx(x, y);
      const [sx, sy] = this.worldToScreen(x, y);
      ctx.fillStyle = `rgba(${rgb},${field[i] * 0.42})`;
      ctx.fillRect(sx, sy, t, t);
    }
    ctx.restore();
  }

  drawDesignations(x0, y0, x1, y1) {
    const w = this.game.world, ctx = this.ctx;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = w.designation[w.idx(x, y)];
      if (!d) continue;
      const [sx, sy] = this.worldToScreen(x, y);
      this.tileSpace(sx, sy);
      if (d === 'mine') {
        // Hatched: this rock is coming out.
        ctx.save();
        ctx.beginPath(); ctx.rect(0.06, 0.06, 0.88, 0.88); ctx.clip();
        ctx.beginPath();
        for (let k = -1; k < 2; k += 0.25) { ctx.moveTo(k, 1); ctx.lineTo(k + 1, 0); }
        ctx.strokeStyle = 'rgba(255,190,90,0.35)'; ctx.lineWidth = 0.05; ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,190,90,0.9)'; ctx.lineWidth = 0.05;
        ctx.strokeRect(0.07, 0.07, 0.86, 0.86);
      } else {
        ctx.setLineDash([0.12, 0.08]);
        ctx.beginPath(); ctx.arc(0.5, 0.5, 0.44, 0, TAU);
        ctx.strokeStyle = 'rgba(140,230,150,0.95)'; ctx.lineWidth = 0.06; ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    this.screenSpace();
  }

  /**
   * Buildings in three passes: ground-level surfaces (flagstone, structure
   * floors and walls), then furniture and free-standing pieces in row order so
   * taller things overlap what is behind them, then blueprints on top.
   */
  drawBuildings(x0, y0, x1, y1, emoji) {
    const w = this.game.world, ctx = this.ctx;
    const S = this.structures;
    const now = this.now;
    // 1. Player floors — a layer under buildings. A queued one shows faded,
    // with the same dashed outline and progress bar as a building blueprint.
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const f = w.floor[w.idx(x, y)];
      if (!f) continue;
      const [sx, sy] = this.worldToScreen(x, y);
      this.tileSpace(sx, sy);
      if (f.done) { this.drawPlayerFloor(f.id, x, y); continue; }
      ctx.save(); ctx.globalAlpha = 0.4;
      this.drawPlayerFloor(f.id, x, y);
      ctx.restore();
      ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.lineWidth = 0.04; ctx.setLineDash([0.1, 0.08]);
      ctx.strokeRect(0.05, 0.05, 0.9, 0.9); ctx.setLineDash([]);
      const pct = Math.max(0, 1 - f.workLeft / FLOORS[f.id].work);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0.08, 0.84, 0.84, 0.08);
      ctx.fillStyle = 'rgba(120,200,255,0.9)'; ctx.fillRect(0.08, 0.84, 0.84 * pct, 0.08);
    }
    // 2. Structure bases.
    for (const s of S.list) {
      if (s.x1 < x0 - 1 || s.x0 > x1 + 1 || s.y1 < y0 - 1 || s.y0 > y1 + 1) continue;
      this.drawStructureBase(s);
    }
    // 3. Furniture, walls and doors, in row order.
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = w.idx(x, y);
      const b = w.building[i];
      if (!b || !b.done) continue;
      // A big building is drawn once, from the first of its tiles on screen.
      if (b.fp) { if (x === Math.max(b.fp[0], x0) && y === Math.max(b.fp[1], y0)) this.drawBigBuilding(b); continue; }
      const [sx, sy] = this.worldToScreen(x, y);
      this.tileSpace(sx, sy);
      if (b.id === 'wall' || b.id === 'timber_wall') { this.drawWall(x, y); continue; }
      if (b.id === 'door') { this.drawDoor(x, y); continue; }
      const sid = S.of[i];
      const s = sid >= 0 ? S.list[sid] : null;
      const o = { x, y, b, now, first: s ? s.tiles[0] === i : true };
      const art = ART[b.id];
      if (art) {
        // Beds lie across the long axis of their room.
        if (b.id === 'bed' && s && !s.wide) {
          ctx.translate(0.5, 0.5); ctx.rotate(-Math.PI / 2); ctx.translate(-0.5, -0.5);
        }
        art(ctx, o);
      } else if (emoji) {
        this.screenSpace();
        this.atlas.draw(ctx, BUILDING_ICON[b.id], sx + this.tile / 2, sy + this.tile / 2, this.tile * 0.66);
      }
      if (BUILDINGS[b.id].job === 'farm') { this.tileSpace(sx, sy); this.drawCrop(b, x, y); }
      // Levels: gold pips in the corner; an upgrade underway shows its scaffold and progress.
      if ((b.level || 1) > 1 || b.upgrade) {
        this.tileSpace(sx, sy);
        for (let k = 1; k < (b.level || 1); k++) { disc(ctx, 0.12 + (k - 1) * 0.14, 0.12, 0.055, '#12100c'); disc(ctx, 0.12 + (k - 1) * 0.14, 0.12, 0.04, '#eec45c'); }
        if (b.upgrade) {
          const U = b.upgrade, full = Math.max(1, Math.round(BUILDINGS[b.id].work * 0.7 * (U.to - 1)));
          ctx.strokeStyle = 'rgba(238,196,92,0.85)'; ctx.lineWidth = 0.04; ctx.setLineDash([0.1, 0.08]);
          ctx.strokeRect(0.05, 0.05, 0.9, 0.9); ctx.setLineDash([]);
          const pct = clamp01(1 - U.workLeft / full);
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0.08, 0.84, 0.84, 0.08);
          ctx.fillStyle = 'rgba(238,196,92,0.95)'; ctx.fillRect(0.08, 0.84, 0.84 * pct, 0.08);
        }
      }
    }
    // 4. Blueprints.
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const b = w.building[w.idx(x, y)];
      if (!b || b.done) continue;
      if (b.fp) { if (x === Math.max(b.fp[0], x0) && y === Math.max(b.fp[1], y0)) this.drawBigBuilding(b); continue; }
      const def = BUILDINGS[b.id];
      const [sx, sy] = this.worldToScreen(x, y);
      this.tileSpace(sx, sy);
      ctx.fillStyle = 'rgba(90,170,220,0.16)';
      ctx.fillRect(0.03, 0.03, 0.94, 0.94);
      const art = ART[b.id] || (b.id === 'timber_wall' ? ART.fence : null);
      if (art) {
        ctx.save(); ctx.globalAlpha = 0.4;
        if (b.id === 'wall' || b.id === 'timber_wall') this.drawWall(x, y, true);
        else art(ctx, { x, y, b, now, first: true });
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(120,200,255,0.8)';
      ctx.lineWidth = 0.04;
      ctx.setLineDash([0.1, 0.08]);
      ctx.strokeRect(0.05, 0.05, 0.9, 0.9);
      ctx.setLineDash([]);
      const pct = Math.max(0, 1 - b.workLeft / def.work);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0.08, 0.84, 0.84, 0.08);
      ctx.fillStyle = 'rgba(120,200,255,0.9)'; ctx.fillRect(0.08, 0.84, 0.84 * pct, 0.08);
    }
    this.screenSpace();
  }

  /**
   * A building bigger than one tile. Walled ones are houses: a pitched roof
   * over the whole footprint, a front wall with windows, and the door in the
   * middle with the building's sign over it. Yards are fenced ground with their
   * piece in the middle; the rest (monument, watchtower) are their art, bigger.
   */
  drawBigBuilding(b) {
    const ctx = this.ctx, def = BUILDINGS[b.id], [ax, ay, fw, fh] = b.fp;
    const [sx, sy] = this.worldToScreen(ax, ay);
    const ghost = !b.done;
    this.tileSpace(sx, sy);
    ctx.save();
    if (ghost) {
      ctx.fillStyle = 'rgba(90,170,220,0.16)'; ctx.fillRect(0.03, 0.03, fw - 0.06, fh - 0.06);
      ctx.globalAlpha = 0.4;
    }
    if (def.walled) drawHouse(ctx, b.id, def, fw, fh, this.now);
    else if (!def.solid) {
      // A yard: tamped ground, a post-and-rail fence, the piece in the middle.
      fillRR(ctx, 0.06, 0.06, fw - 0.12, fh - 0.12, 0.12, 'rgba(120,96,64,0.45)');
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 0.06;
      const gap = fw / 2;
      ctx.beginPath();
      ctx.moveTo(gap - 0.45, fh - 0.1); ctx.lineTo(0.1, fh - 0.1); ctx.lineTo(0.1, 0.1); ctx.lineTo(fw - 0.1, 0.1); ctx.lineTo(fw - 0.1, fh - 0.1); ctx.lineTo(gap + 0.45, fh - 0.1);
      ctx.stroke();
      for (let k = 0; k <= fw; k++) { disc(ctx, Math.min(fw - 0.1, Math.max(0.1, k)), 0.1, 0.06, '#4a321c'); if (Math.abs(k - gap) > 0.5) disc(ctx, Math.min(fw - 0.1, Math.max(0.1, k)), fh - 0.1, 0.06, '#4a321c'); }
      const art = ART[b.id];
      if (art) { ctx.translate(fw / 2 - 0.7, fh / 2 - 0.75); ctx.scale(1.4, 1.4); art(ctx, { x: ax, y: ay, b, now: this.now, first: true }); }
    } else {
      const art = ART[b.id];
      oval(ctx, fw / 2, fh - 0.1, fw * 0.42, 0.22, 'rgba(0,0,0,0.3)');
      if (art) { ctx.scale(fw, fh); art(ctx, { x: ax, y: ay, b, now: this.now, first: true }); }
    }
    ctx.restore();
    this.tileSpace(sx, sy);
    if (ghost) {
      ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.lineWidth = 0.04; ctx.setLineDash([0.1, 0.08]);
      ctx.strokeRect(0.05, 0.05, fw - 0.1, fh - 0.1); ctx.setLineDash([]);
      const pct = Math.max(0, 1 - b.workLeft / def.work);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0.12, fh - 0.2, fw - 0.24, 0.1);
      ctx.fillStyle = 'rgba(120,200,255,0.9)'; ctx.fillRect(0.12, fh - 0.2, (fw - 0.24) * pct, 0.1);
      this.screenSpace();
      return;
    }
    // The sign over the door (or over the middle of a yard or monument).
    const door = def.walled ? [fw >> 1, fh - 1] : [(fw - 1) / 2, (fh - 1) / 2];
    this.screenSpace();
    const icon = BUILDING_ICON[b.id];
    if (icon) {
      const cx = sx + (door[0] + 0.5) * this.tile, cy = sy + (def.walled ? door[1] - 0.12 : door[1] - 0.2) * this.tile;
      if (def.walled) {
        ctx.fillStyle = 'rgba(20,14,8,0.85)';
        ctx.fillRect(cx - this.tile * 0.3, cy - this.tile * 0.26, this.tile * 0.6, this.tile * 0.52);
      }
      this.atlas.draw(ctx, icon, cx, cy, this.tile * (def.walled ? 0.42 : 0.6));
    }
    // A shop with nobody behind the counter says so.
    if (b.shopClosed) {
      const cx = sx + (door[0] + 0.5) * this.tile, cy = sy + (door[1] + 0.62) * this.tile;
      ctx.font = `bold ${Math.max(8, this.tile * 0.2)}px ${UI_FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(cx - this.tile * 0.46, cy - this.tile * 0.13, this.tile * 0.92, this.tile * 0.26);
      ctx.fillStyle = '#e8b347'; ctx.fillText('CLOSED', cx, cy);
    }
    if ((b.level || 1) > 1 || b.upgrade) {
      this.tileSpace(sx, sy);
      for (let k = 1; k < (b.level || 1); k++) { disc(ctx, 0.14 + (k - 1) * 0.16, 0.14, 0.065, '#12100c'); disc(ctx, 0.14 + (k - 1) * 0.16, 0.14, 0.048, '#eec45c'); }
      if (b.upgrade) {
        ctx.strokeStyle = 'rgba(238,196,92,0.85)'; ctx.lineWidth = 0.04; ctx.setLineDash([0.1, 0.08]);
        ctx.strokeRect(0.05, 0.05, fw - 0.1, fh - 0.1); ctx.setLineDash([]);
      }
      this.screenSpace();
    }
  }

  /** A structure's floor, walls and door — or fence, or roof — sized to its footprint. */
  drawStructureBase(s) {
    const w = this.game.world, ctx = this.ctx, S = this.structures;
    const st = STRUCTURE_STYLE[s.cls];
    const inS = (x, y) => w.inside(x, y) && S.of[w.idx(x, y)] === s.id;
    if (st.roof) { this.drawRoof(s); return; }
    // Floor
    if (st.floor) for (const i of s.tiles) {
      const x = i % w.w, y = (i / w.w) | 0;
      const [sx, sy] = this.worldToScreen(x, y);
      this.tileSpace(sx, sy);
      this.drawFloor(st.floor, x, y, s);
    }
    // Shadow the structure drops to the south, then its walls.
    if (st.walls) {
      const th = 0.1;
      for (const i of s.tiles) {
        const x = i % w.w, y = (i / w.w) | 0;
        const [sx, sy] = this.worldToScreen(x, y);
        this.tileSpace(sx, sy);
        if (!inS(x, y + 1)) {
          ctx.fillStyle = linear(ctx, 0, 1, 0, 1.3, [[0, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]);
          ctx.fillRect(0, 1, 1, 0.3);
        }
      }
      for (const i of s.tiles) {
        const x = i % w.w, y = (i / w.w) | 0;
        const [sx, sy] = this.worldToScreen(x, y);
        this.tileSpace(sx, sy);
        const N = inS(x, y - 1), So = inS(x, y + 1), E = inS(x + 1, y), W = inS(x - 1, y);
        const wall = '#4a3322', top = '#8a6a48';
        const door = i === s.door;
        if (!N) { ctx.fillStyle = wall; ctx.fillRect(0, 0, 1, th); ctx.fillStyle = top; ctx.fillRect(0, 0, 1, th * 0.4); }
        if (!W) { ctx.fillStyle = wall; ctx.fillRect(0, 0, th, 1); ctx.fillStyle = top; ctx.fillRect(0, 0, th * 0.4, 1); }
        if (!E) { ctx.fillStyle = wall; ctx.fillRect(1 - th, 0, th, 1); ctx.fillStyle = top; ctx.fillRect(1 - th, 0, th * 0.4, 1); }
        if (!So) {
          ctx.fillStyle = wall;
          if (door) {
            ctx.fillRect(0, 1 - th, 0.3, th); ctx.fillRect(0.7, 1 - th, 0.3, th);
            ctx.fillStyle = '#9a7a52'; ctx.fillRect(0.3, 1 - th * 0.7, 0.4, th * 0.7);
            ctx.fillStyle = 'rgba(80,60,40,0.8)'; ctx.fillRect(0.34, 1.0, 0.32, 0.1);
          } else ctx.fillRect(0, 1 - th, 1, th);
          ctx.fillStyle = top;
          if (door) { ctx.fillRect(0, 1 - th, 0.3, th * 0.4); ctx.fillRect(0.7, 1 - th, 0.3, th * 0.4); }
          else ctx.fillRect(0, 1 - th, 1, th * 0.4);
        }
        // Corner posts
        const post = (px, py) => disc(ctx, px, py, 0.075, '#3a271a');
        if (!N && !W) post(0.05, 0.05);
        if (!N && !E) post(0.95, 0.05);
        if (!So && !W) post(0.05, 0.95);
        if (!So && !E) post(0.95, 0.95);
      }
    } else if (st.fence || s.cls === 'store' || s.cls === 'yard') {
      // Fenced (fields) or roped (yards, stores) boundary.
      const fence = st.fence;
      for (const i of s.tiles) {
        const x = i % w.w, y = (i / w.w) | 0;
        const [sx, sy] = this.worldToScreen(x, y);
        this.tileSpace(sx, sy);
        const col = fence ? '#7a5a36' : 'rgba(210,190,140,0.55)';
        const lw = fence ? 0.045 : 0.03;
        const edge = (ax, ay, bx, by) => line(ctx, ax, ay, bx, by, col, lw);
        if (!inS(x, y - 1)) edge(0, 0.03, 1, 0.03);
        if (!inS(x, y + 1)) edge(0, 0.97, 1, 0.97);
        if (!inS(x - 1, y)) edge(0.03, 0, 0.03, 1);
        if (!inS(x + 1, y)) edge(0.97, 0, 0.97, 1);
        if (fence) {
          for (const [px, py, need] of [[0.03, 0.03, !inS(x, y - 1) || !inS(x - 1, y)], [0.97, 0.03, !inS(x, y - 1) || !inS(x + 1, y)],
            [0.03, 0.97, !inS(x, y + 1) || !inS(x - 1, y)], [0.97, 0.97, !inS(x, y + 1) || !inS(x + 1, y)]]) {
            if (need) disc(ctx, px, py, 0.05, '#5a4026');
          }
        }
      }
    }
  }

  drawFloor(kind, x, y, s) {
    const ctx = this.ctx;
    const pl = FLOOR[kind];
    if (pl) {
      ctx.fillStyle = pl.base; ctx.fillRect(-0.005, -0.005, 1.01, 1.01);
      // Planks run along the room; joints stagger.
      const along = s.wide;
      ctx.beginPath();
      for (let k = 1; k * pl.w < 1; k++) {
        if (along) { ctx.moveTo(0, k * pl.w); ctx.lineTo(1, k * pl.w); } else { ctx.moveTo(k * pl.w, 0); ctx.lineTo(k * pl.w, 1); }
      }
      for (let k = 0; k * pl.w < 1; k++) {
        const j = rhash(x, y, 800 + k);
        if (along) { ctx.moveTo(j, k * pl.w); ctx.lineTo(j, (k + 1) * pl.w); } else { ctx.moveTo(k * pl.w, j); ctx.lineTo((k + 1) * pl.w, j); }
      }
      ctx.strokeStyle = pl.seam; ctx.lineWidth = 0.018; ctx.stroke();
      for (let k = 0; k * pl.w < 1; k++) {
        if (rhash(x, y, 820 + k) < 0.5) continue;
        ctx.fillStyle = pl.hi;
        if (along) ctx.fillRect(0, k * pl.w, 1, pl.w); else ctx.fillRect(k * pl.w, 0, pl.w, 1);
      }
      return;
    }
    if (kind === 'flags' || kind === 'slate' || kind === 'tiles') {
      const base = kind === 'flags' ? '#4f4b47' : kind === 'slate' ? '#434852' : '#a9a59b';
      const grout = kind === 'tiles' ? 'rgba(90,86,78,0.7)' : 'rgba(20,20,24,0.6)';
      ctx.fillStyle = base; ctx.fillRect(-0.005, -0.005, 1.01, 1.01);
      ctx.beginPath();
      const n = kind === 'tiles' ? 3 : 2;
      for (let k = 1; k < n; k++) { ctx.moveTo(0, k / n); ctx.lineTo(1, k / n); ctx.moveTo(k / n, 0); ctx.lineTo(k / n, 1); }
      ctx.strokeStyle = grout; ctx.lineWidth = 0.02; ctx.stroke();
      if (kind === 'flags') for (let k = 0; k < 3; k++) disc(ctx, rhash(x, y, 830 + k), rhash(x, y, 835 + k), 0.12, 'rgba(0,0,0,0.12)');
      return;
    }
    if (kind === 'soil' || kind === 'loam') {
      ctx.fillStyle = kind === 'soil' ? '#4b3726' : '#2f2620';
      ctx.fillRect(-0.005, -0.005, 1.01, 1.01);
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { ctx.moveTo(0.04, 0.2 + k * 0.3 + 0.08); ctx.lineTo(0.96, 0.2 + k * 0.3 + 0.08); }
      ctx.strokeStyle = 'rgba(20,12,6,0.55)'; ctx.lineWidth = 0.06; ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { ctx.moveTo(0.04, 0.2 + k * 0.3 - 0.03); ctx.lineTo(0.96, 0.2 + k * 0.3 - 0.03); }
      ctx.strokeStyle = 'rgba(140,105,70,0.35)'; ctx.lineWidth = 0.03; ctx.stroke();
      return;
    }
    if (kind === 'yard' || kind === 'sand') {
      ctx.fillStyle = kind === 'yard' ? 'rgba(110,92,64,0.75)' : 'rgba(150,130,90,0.7)';
      ctx.fillRect(-0.005, -0.005, 1.01, 1.01);
      for (let k = 0; k < 5; k++) disc(ctx, rhash(x, y, 840 + k), rhash(x, y, 845 + k), 0.02, 'rgba(0,0,0,0.2)');
    }
  }

  /** A player-laid floor tile: one tile at a time, not a whole room's pattern. */
  drawPlayerFloor(id, x, y) {
    const ctx = this.ctx;
    const kind = FLOORS[id].kind;
    if (kind === 'planks') { this.drawFloor('planks', x, y, { wide: true }); return; }
    if (kind === 'flags') { ART.floor(ctx, { x, y }); return; }
    if (kind === 'pebble') {
      ctx.fillStyle = '#5f5a4d'; ctx.fillRect(-0.005, -0.005, 1.01, 1.01);
      for (let k = 0; k < 8; k++) {
        const px = 0.12 + rhash(x, y, 850 + k) * 0.76, py = 0.12 + rhash(x, y, 860 + k) * 0.76;
        const v = 92 + ((rhash(x, y, 870 + k) * 40) | 0);
        disc(ctx, px, py, 0.045 + rhash(x, y, 880 + k) * 0.04, `rgb(${v},${v - 4},${v - 10})`);
      }
      return;
    }
    if (kind === 'crystal') {
      ctx.fillStyle = '#241736'; ctx.fillRect(-0.005, -0.005, 1.01, 1.01);
      const glow = 0.5 + 0.5 * Math.sin(this.now * 1.4 + x * 0.7 + y * 0.5);
      ctx.fillStyle = `rgba(160,106,208,${0.16 + glow * 0.14})`;
      ctx.fillRect(-0.005, -0.005, 1.01, 1.01);
      for (let k = 0; k < 3; k++) {
        const cx = 0.2 + rhash(x, y, 890 + k) * 0.6, cy = 0.2 + rhash(x, y, 895 + k) * 0.6;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 0.07); ctx.lineTo(cx + 0.05, cy); ctx.lineTo(cx, cy + 0.07); ctx.lineTo(cx - 0.05, cy);
        ctx.closePath();
        ctx.fillStyle = `rgba(220,190,255,${0.35 + glow * 0.3})`; ctx.fill();
      }
    }
  }

  /** A barn is a building you see the roof of: one gabled roof over its footprint. */
  drawRoof(s) {
    const ctx = this.ctx;
    const [sx, sy] = this.worldToScreen(s.x0, s.y0);
    const wT = s.x1 - s.x0 + 1, hT = s.y1 - s.y0 + 1;
    this.tileSpace(sx, sy);
    fillRR(ctx, 0.12, 0.2, wT, hT, 0.04, 'rgba(0,0,0,0.4)');
    const ridgeH = s.wide;
    // Two slopes, lit and shaded.
    if (ridgeH) {
      ctx.fillStyle = '#8a3a2a'; ctx.fillRect(0, 0, wT, hT / 2);
      ctx.fillStyle = '#6a2a1e'; ctx.fillRect(0, hT / 2, wT, hT / 2);
    } else {
      ctx.fillStyle = '#8a3a2a'; ctx.fillRect(0, 0, wT / 2, hT);
      ctx.fillStyle = '#6a2a1e'; ctx.fillRect(wT / 2, 0, wT / 2, hT);
    }
    ctx.beginPath();
    const step = 0.2;
    if (ridgeH) for (let y = step; y < hT; y += step) { ctx.moveTo(0, y); ctx.lineTo(wT, y); }
    else for (let x = step; x < wT; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, hT); }
    ctx.strokeStyle = 'rgba(30,10,6,0.35)'; ctx.lineWidth = 0.02; ctx.stroke();
    if (ridgeH) line(ctx, 0, hT / 2, wT, hT / 2, '#b5654a', 0.06); else line(ctx, wT / 2, 0, wT / 2, hT, '#b5654a', 0.06);
    ctx.strokeStyle = '#3a1a12'; ctx.lineWidth = 0.05; ctx.strokeRect(0.025, 0.025, wT - 0.05, hT - 0.05);
  }

  /** Walls connect to walls and doors next to them; stone blocks with a face. */
  drawWall(x, y, ghost) {
    const w = this.game.world, ctx = this.ctx;
    const joins = (dx, dy) => {
      const b = w.buildingAt(x + dx, y + dy);
      return !!b && WALL_IDS.has(b.id) && (b.done || ghost);
    };
    // Stone and timber walls share a footprint and join each other; only
    // their materials differ.
    const timber = w.buildingAt(x, y)?.id === 'timber_wall';
    const pal = timber ? WALL_PAL.timber : WALL_PAL.stone;
    const N = joins(0, -1), S = joins(0, 1), E = joins(1, 0), W = joins(-1, 0);
    const a = 0.2, b = 0.8, face = 0.16;
    const rects = [[a, a, b - a, b - a]];
    if (N) rects.push([a, 0, b - a, a]);
    if (S) rects.push([a, b, b - a, 1 - b]);
    if (W) rects.push([0, a, a, b - a]);
    if (E) rects.push([b, a, 1 - b, b - a]);
    // Shadow, face, top.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const [rx, ry, rw, rh] of rects) ctx.fillRect(rx + 0.06, ry + 0.1, rw, rh + (S ? 0 : face));
    ctx.fillStyle = pal.face;
    if (!S) ctx.fillRect(a, b, b - a, face);
    if (W) ctx.fillRect(0, b, a, face);
    if (E) ctx.fillRect(b, b, 1 - b, face);
    ctx.fillStyle = pal.top;
    for (const [rx, ry, rw, rh] of rects) ctx.fillRect(rx, ry, rw, rh);
    ctx.beginPath();
    if (timber) {
      // Plank seams run along the wall; a lashing where it turns.
      for (const t of [0.4, 0.6]) {
        ctx.moveTo(W ? 0 : a, t); ctx.lineTo(E ? 1 : b, t);
        ctx.moveTo(t, N ? 0 : a); ctx.lineTo(t, S ? 1 : b);
      }
    } else {
      // Block courses
      ctx.moveTo(a, 0.5); ctx.lineTo(b, 0.5);
      if (W) { ctx.moveTo(0, 0.5); ctx.lineTo(a, 0.5); }
      if (E) { ctx.moveTo(b, 0.5); ctx.lineTo(1, 0.5); }
      ctx.moveTo(0.5, a); ctx.lineTo(0.5, 0.5);
      if (N) { ctx.moveTo(0.5, 0); ctx.lineTo(0.5, a); }
    }
    ctx.strokeStyle = pal.seam; ctx.lineWidth = 0.02; ctx.stroke();
    if (timber) for (const [px, py] of [[a + 0.06, a + 0.06], [b - 0.06, a + 0.06], [a + 0.06, b - 0.06], [b - 0.06, b - 0.06]]) {
      ctx.beginPath(); ctx.arc(px, py, 0.025, 0, TAU); ctx.fillStyle = pal.face; ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,250,235,0.18)';
    if (!N) ctx.fillRect(a, a, b - a, 0.04);
  }

  drawDoor(x, y) {
    const w = this.game.world, ctx = this.ctx;
    const isWall = (dx, dy) => { const b = w.buildingAt(x + dx, y + dy); return !!b && b.done && (b.id === 'wall' || b.id === 'timber_wall'); };
    const horiz = isWall(-1, 0) || isWall(1, 0) || !(isWall(0, -1) || isWall(0, 1));
    if (!horiz) { ctx.translate(0.5, 0.5); ctx.rotate(Math.PI / 2); ctx.translate(-0.5, -0.5); }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0.02, 0.36, 1, 0.34);
    ctx.fillStyle = '#4a4640'; ctx.fillRect(0, 0.3, 0.14, 0.4); ctx.fillRect(0.86, 0.3, 0.14, 0.4);
    ctx.fillStyle = '#8f897d'; ctx.fillRect(0, 0.3, 0.14, 0.3); ctx.fillRect(0.86, 0.3, 0.14, 0.3);
    ctx.fillStyle = '#7a5230'; ctx.fillRect(0.14, 0.38, 0.72, 0.2);
    ctx.beginPath();
    for (let k = 1; k < 4; k++) { ctx.moveTo(0.14 + k * 0.18, 0.38); ctx.lineTo(0.14 + k * 0.18, 0.58); }
    ctx.strokeStyle = 'rgba(40,20,8,0.55)'; ctx.lineWidth = 0.02; ctx.stroke();
    disc(ctx, 0.74, 0.48, 0.03, '#d0b060');
  }

  // A field shows its crop, its growth stage, and a ring when it is ready to
  // cut — three things a bare progress bar could not say at once.
  drawCrop(b, x, y) {
    const ctx = this.ctx;
    const crop = CROPS[b.crop];
    if (crop && b.planted) {
      drawCropArt(ctx, b, x, y);
      if (b.growth >= 1) {
        ctx.strokeStyle = STATUS.warn;
        ctx.lineWidth = 0.05;
        ctx.strokeRect(0.05, 0.05, 0.9, 0.9);
      }
    } else if (b.failing > 600) {
      ctx.fillStyle = 'rgba(200,90,70,0.3)';
      ctx.fillRect(0.1, 0.1, 0.8, 0.8);
      line(ctx, 0.25, 0.25, 0.75, 0.75, 'rgba(120,70,40,0.8)', 0.05);
      line(ctx, 0.75, 0.25, 0.25, 0.75, 'rgba(120,70,40,0.8)', 0.05);
    }
  }

  /**
   * Structures aren't named on the map — their art says what they are. The
   * few whose size matters carry a small count: beds in a barracks, plots in
   * a field.
   */
  drawStructureLabels(x0, y0, x1, y1) {
    const t = this.tile;
    if (t < 20) return;
    const ctx = this.ctx;
    this.screenSpace();
    ctx.save();
    ctx.font = `700 ${Math.max(10, Math.min(12, t * 0.28))}px ${UI_FONT}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const s of this.structures.list) {
      if (s.x1 < x0 || s.x0 > x1 || s.y1 < y0 || s.y0 > y1) continue;
      const count = STRUCTURE_COUNT[s.cls];
      if (!count || s.n < 2) continue;
      const [icon, n] = count(s);
      const text = String(n);
      const [cx] = this.worldToScreen((s.x0 + s.x1 + 1) / 2, 0);
      const [, ty] = this.worldToScreen(0, s.y0);
      const mt = ctx.measureText && ctx.measureText(text);
      const tw = (mt && mt.width) || 10, isz = 14, w = isz + 4 + tw + 10;
      const py = ty - 8, left = cx - w / 2;
      fillRR(ctx, left, py - 8, w, 16, 8, 'rgba(14,12,10,0.78)');
      if (!this.atlas.draw(ctx, icon, left + 4 + isz / 2, py, isz)) ctx.fillText(icon, left + 4, py);
      ctx.fillStyle = '#efe3c8';
      ctx.fillText(text, left + 4 + isz + 3, py + 0.5);
    }
    ctx.restore();
  }

  // Loose hauls are small diamonds — a shape neither people nor animals use, so
  // a cluttered floor reads as a backlog rather than as a crowd.
  drawGround(x0, y0, x1, y1) {
    const ctx = this.ctx;
    for (const it of this.game.ground) {
      if (it.x < x0 || it.x > x1 || it.y < y0 || it.y > y1) continue;
      const [sx, sy] = this.worldToScreen(it.x, it.y);
      this.tileSpace(sx, sy);
      const cx = 0.5, cy = 0.72, r = 0.15;
      ctx.beginPath();
      ctx.moveTo(cx + 0.03, cy - r + 0.05); ctx.lineTo(cx + r + 0.03, cy + 0.05); ctx.lineTo(cx + 0.03, cy + r + 0.05); ctx.lineTo(cx - r + 0.03, cy + 0.05);
      ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fillStyle = '#c8ab72'; ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,20,0.8)'; ctx.lineWidth = 0.025; ctx.stroke();
      line(ctx, cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5, 'rgba(90,60,30,0.6)', 0.02);
    }
    this.screenSpace();
  }

  // ---------------------------------------------------------------- units --
  // Everything that walks is a pixel sprite. The simulation moves units a
  // whole tile at a time; the renderer slides each one there, so a step that
  // took 0.4 s of game time takes 0.4 s on screen at any speed setting.

  /** Tween state for a unit: where it is drawn right now, which way it faces,
   *  and how far it has walked (which drives the step bob). */
  motionOf(u, snapDist = 6, maxDur = 1.2) {
    const now = this.now;
    let m = this.motion.get(u);
    if (!m) {
      m = { x: u.x, y: u.y, fx: u.x, fy: u.y, tx: u.x, ty: u.y, t0: now, dur: 0.001, last: now - 1, stepDur: 0.4, face: 1, walked: 0, moving: false };
      this.motion.set(u, m);
    }
    if (u.x !== m.tx || u.y !== m.ty) {
      if (u.x !== m.tx) m.face = u.x > m.tx ? 1 : -1;
      if (Math.abs(u.x - m.x) > snapDist || Math.abs(u.y - m.y) > snapDist) {
        // A jump, not a walk (back from the Rift, nudged across a wall): snap.
        m.x = m.fx = m.tx = u.x; m.y = m.fy = m.ty = u.y; m.dur = 0.001;
      } else {
        m.fx = m.x; m.fy = m.y; m.tx = u.x; m.ty = u.y;
        // The step lasts as long as the gap since the last one, so walking is
        // one continuous glide at 1× and at 20× alike. The first step after
        // standing still has no real gap to go on; it borrows the last step's.
        const gap = now - m.last;
        const dur = m.stepDur && gap > m.stepDur * 1.8 ? m.stepDur : gap;
        m.dur = m.stepDur = Math.max(0.03, Math.min(maxDur, dur));
      }
      m.t0 = now; m.last = now;
    }
    const k = Math.min(1, (now - m.t0) / m.dur);
    const px = m.x, py = m.y;
    m.x = m.fx + (m.tx - m.fx) * k;
    m.y = m.fy + (m.ty - m.fy) * k;
    m.walked += Math.hypot(m.x - px, m.y - py);
    m.moving = k < 1;
    return m;
  }

  /** Blit a sprite with its feet at (cx, footY), in screen space. */
  blitSprite(spr, cx, footY, scale = 1, flip = false, alpha = 1, rot = 0) {
    if (!spr || !spr.canvas || !spr.w) return false;
    const ctx = this.ctx;
    const px = this.tile / SPRITE_N * scale;
    const w = spr.w * px, h = spr.h * px;
    // Grids leave their last row for feet; PAD rows of ring sit below it.
    const top = -(spr.h - 2) * px;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    try {
      // Pivot on the feet, so a wobble rocks the body over where it stands.
      ctx.translate(cx, footY);
      if (rot) ctx.rotate(rot);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(spr.canvas, -w / 2, top, w, h);
    } catch (e) { ctx.restore(); return false; }
    ctx.restore();
    return true;
  }

  /** A soft contact shadow, so a sprite stands on the ground rather than over it. */
  footShadow(cx, footY, r, lift = 0) {
    const ctx = this.ctx;
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(cx, footY, r, r * 0.34, 0, 0, TAU);
    ctx.fillStyle = `rgba(0,0,0,${0.34 - lift * 0.12})`; ctx.fill();
  }

  /** Every unit on screen, drawn back-to-front so a sprite in the row below
   *  overlaps the one above it — the tall ones need that. */
  drawUnits(x0, y0, x1, y1) {
    const g = this.game, t = this.tile;
    const list = [];
    const vis = (m) => m.x >= x0 - 1 && m.x <= x1 + 1 && m.y >= y0 - 1 && m.y <= y1 + 1;
    for (const b of g.beasts) {
      if (b.dead || b.away) continue;
      const m = this.motionOf(b);
      if (vis(m)) list.push({ kind: 'beast', u: b, m });
    }
    for (const r of g.raiders) {
      if (r.hp <= 0) continue;
      const m = this.motionOf(r);
      if (vis(m)) list.push({ kind: 'enemy', u: r, m });
    }
    for (const c of g.here) {
      if (c.away || c.carriedBy) continue;   // the carried are drawn over their carrier
      const m = this.motionOf(c);
      if (vis(m)) list.push({ kind: 'colonist', u: c, m });
    }
    if (this.visitors && g._m.kind === 'camp') for (const v of this.visitors) for (const mem of v.members) {
      const m = this.motionOf(mem);
      if (vis(m)) list.push({ kind: 'visitor', u: mem, m });
    }
    list.sort((a, b) => a.m.y - b.m.y || a.m.x - b.m.x);
    this.trackHover(list);
    this.drawOrderLines();
    for (const e of list) this.drawUnit(e);
    // Overlays last, so a bar is never hidden under the next row's sprite.
    for (const e of list) this.drawUnitMarks(e);
    this.drawWorkBars(x0, y0, x1, y1);
    this.drawCombatFx(list);
    this.screenSpace();
  }

  /**
   * The fight, made visible: shots in flight, numbers rising off whoever was
   * hit, what each fighter is suffering from, and how long the downed have
   * left on the ground. The sim records these on the map's field
   * (realtime.js); the renderer only times them in wall-clock seconds.
   */
  drawCombatFx(list) {
    const ctx = this.ctx, t = this.tile, now = this.now;
    this.screenSpace();
    // Shots: a short streak flying from the shooter to the target.
    for (const e of list) {
      const a = e.m.act;
      if (!a || !a.ranged) continue;
      const k = (now - a.t0) / 0.2;
      if (k < 0 || k > 1) continue;
      const [ax, ay] = this.worldToScreen(e.m.x + 0.5, e.m.y + 0.45);
      const [bx, by] = this.worldToScreen(a.tx + 0.5, a.ty + 0.45);
      const hx = ax + (bx - ax) * k, hy = ay + (by - ay) * k;
      const tl = Math.min(1, 0.35 * t / (Math.hypot(bx - ax, by - ay) || 1));
      const tx = hx - (bx - ax) * tl, ty = hy - (by - ay) * tl;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(3, t * 0.09);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = SHOT_COLOR[a.color] || '#e8dcc0'; ctx.lineWidth = Math.max(1.5, t * 0.05);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.restore();
    }
    // Status icons over anyone in the fight, and the downed timer.
    for (const e of list) {
      const u = e.u, sx = e.sx, sy = e.sy;
      if (u.fxSt && u.fxSt.length && t >= 16) {
        ctx.save();
        ctx.font = `${Math.round(Math.max(9, t * 0.26))}px ${UI_FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        u.fxSt.forEach((id, k) => {
          const S = STATUSES[id];
          if (!S) return;
          const x = sx + t * (0.2 + k * 0.3), y = sy - t * 0.02;
          ctx.fillStyle = 'rgba(12,14,17,0.75)';
          ctx.beginPath(); ctx.arc(x, y, t * 0.15, 0, TAU); ctx.fill();
          if (!this.atlas.draw(ctx, S.icon, x, y, t * 0.24)) { ctx.fillStyle = '#fff'; ctx.fillText(S.icon || '•', x, y + 1); }
        });
        ctx.restore();
      }
      if ((e.kind === 'colonist' || e.kind === 'beast') && u.downed) {
        const left = clamp01((u.downed.until - this.game.tick) / 400);
        const cx = sx + t * 0.5, cy = sy + t * 0.2, r = Math.max(5, t * 0.14);
        ctx.save();
        ctx.fillStyle = 'rgba(12,14,17,0.8)'; ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ff7a6a'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.stroke();
        ctx.restore();
      }
    }
    // Floating numbers and words.
    const f = this.game.field;
    if (!this.floaters) { this.floaters = []; this.fxSeen = new WeakMap(); }
    if (this.fxWorld !== this.game.world) { this.floaters = []; this.fxWorld = this.game.world; }
    if (f) {
      const seen = this.fxSeen.get(f) || 0;
      for (const x of f.fx) if (x.seq > seen) {
        // Several hits on one tile in a frame stack up instead of overprinting.
        const same = this.floaters.filter(o => o.x === x.x && o.y === x.y && now - o.t0 < 0.3).length;
        this.floaters.push({ ...x, t0: now + same * 0.08 });
      }
      this.fxSeen.set(f, f.fxSeq);
    }
    this.floaters = this.floaters.filter(o => now - o.t0 < 1.0);
    if (this.showNumbers === false) this.floaters.length = 0;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const o of this.floaters) {
      const k = now - o.t0;
      if (k < 0) continue;
      const [x, y] = this.worldToScreen(o.x + 0.5, o.y + 0.1 - k * 0.9);
      const size = o.kind === 'word' ? Math.max(10, t * 0.3) : Math.max(11, t * 0.38);
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = `800 ${Math.round(size)}px ${UI_FONT}`;
      if (pxOf(o.text) && this.atlas.draw(ctx, o.text, x, y, size * 1.3)) continue;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,9,12,0.9)';
      ctx.strokeText(o.text, x, y);
      ctx.fillStyle = o.color; ctx.fillText(o.text, x, y);
    }
    ctx.restore();
  }

  /**
   * Which unit the pointer is on, by tile — the same rule clicks and the hover
   * card use, so what wobbles is what a click would take. The unit grows a
   * little while hovered and gives a quick wobble on the way in and out.
   */
  trackHover(list) {
    const hv = this.hover && !this.dragRect ? this.hover : null;
    let hot = null;
    if (hv) for (const k of ['colonist', 'enemy', 'beast']) {
      hot = list.find(e => e.kind === k && e.u.x === hv[0] && e.u.y === hv[1]);
      if (hot) break;
    }
    const hotU = hot ? hot.u : null;
    if (hotU !== this.hoverUnit) {
      for (const u of [this.hoverUnit, hotU]) { const m = u && this.motion.get(u); if (m) m.jig = this.now; }
      this.hoverUnit = hotU;
    }
    const dt = Math.min(0.1, this.now - (this.hoverT || this.now));
    this.hoverT = this.now;
    for (const e of list) {
      const m = e.m, want = e.u === hotU ? 1 : 0;
      m.hov = (m.hov || 0) + (want - (m.hov || 0)) * Math.min(1, dt * 16);
    }
  }

  /** Spotted traps get a red warning mark; sprung ones are just wreckage. Hidden ones show nothing. */
  drawTraps(x0, y0, x1, y1) {
    const w = this.game.world, ctx = this.ctx;
    if (!w.traps || !w.traps.size) return;
    for (const [i, tr] of w.traps) {
      if (!tr.revealed && !tr.sprung) continue;
      const x = i % w.w, y = (i / w.w) | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const [sx, sy] = this.worldToScreen(x, y);
      this.tileSpace(sx, sy);
      if (tr.sprung) {
        for (let k = 0; k < 4; k++) line(ctx, 0.2 + k * 0.18, 0.72, 0.28 + k * 0.18, 0.5 + rhash(x, y, 700 + k) * 0.15, 'rgba(120,110,100,0.8)', 0.04);
        continue;
      }
      ctx.strokeStyle = 'rgba(255,80,60,0.85)'; ctx.lineWidth = 0.05; ctx.setLineDash([0.12, 0.08]);
      ctx.strokeRect(0.08, 0.08, 0.84, 0.84); ctx.setLineDash([]);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(0.24 + k * 0.2, 0.74); ctx.lineTo(0.34 + k * 0.2, 0.4); ctx.lineTo(0.44 + k * 0.2, 0.74); ctx.closePath();
        ctx.fillStyle = '#c8ccd4'; ctx.fill(); ctx.strokeStyle = '#120d16'; ctx.lineWidth = 0.03; ctx.stroke();
      }
    }
    this.screenSpace();
  }

  /** A dashed line from each colonist on a player order to where it's going. */
  drawOrderLines() {
    const ctx = this.ctx, t = this.tile;
    this.screenSpace();
    ctx.save();
    ctx.lineCap = 'round';
    for (const c of this.game.here) {
      const o = c.order;
      if (c.away || c.dead || !o) continue;
      if (o.work && c.state === 'working') continue;   // there and at it
      const m = this.motion.get(c);
      const ux = m ? m.x : c.x, uy = m ? m.y : c.y;
      // An attack order points at its target, wherever it has got to — in red.
      const foe = o.attack ? this.game.raiders.find(r => r.id === o.attack && r.hp > 0) : null;
      if (o.attack && (!foe || c.state === 'fighting')) continue;
      const fm = foe && this.motion.get(foe);
      const tx = foe ? (fm ? fm.x : foe.x) : o.x, ty = foe ? (fm ? fm.y : foe.y) : o.y;
      const col = foe ? '255,90,74' : '255,240,60';
      if (!o.work && Math.abs(ux - tx) < 0.05 && Math.abs(uy - ty) < 0.05) continue;
      const [ax, ay] = this.worldToScreen(ux + 0.5, uy + 0.7);
      const [bx, by] = this.worldToScreen(tx + 0.5, ty + 0.5);
      ctx.setLineDash([Math.max(4, t * 0.16), Math.max(3, t * 0.12)]);
      ctx.lineDashOffset = -this.now * t * 0.9;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = `rgba(${col},0.85)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      if (foe) continue;   // the target itself is the marker
      // The end: a ring on the ground for a move, a pulsing square for a job.
      const pulse = 1 + Math.sin(this.now * 5) * 0.08;
      if (o.work) {
        const [sx, sy] = this.worldToScreen(tx, ty), h = t * 0.5 * pulse;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 4; ctx.strokeRect(sx + t / 2 - h, sy + t / 2 - h, h * 2, h * 2);
        ctx.strokeStyle = 'rgba(255,240,60,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(sx + t / 2 - h, sy + t / 2 - h, h * 2, h * 2);
      } else {
        ctx.beginPath();
        if (ctx.ellipse) ctx.ellipse(bx, by + t * 0.25, t * 0.32 * pulse, t * 0.14 * pulse, 0, 0, TAU);
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,240,60,0.9)'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * One progress bar per tile being worked — a seam, a tree, a workbench —
   * however many hands are on it. Blueprints already carry their own bar.
   */
  drawWorkBars(x0, y0, x1, y1) {
    const g = this.game, ctx = this.ctx, t = this.tile;
    const seen = new Map();
    for (const c of g.here) {
      const k = c.task;
      if (c.away || c.state !== 'working' || !k || !BAR_KINDS[k.kind]) continue;
      if (k.x < x0 || k.x > x1 || k.y < y0 || k.y > y1) continue;
      let frac;
      if (k.kind === 'mine' || k.kind === 'harvest') frac = g.siteProgress(k.x, k.y);
      else frac = k.work ? 1 - (k.workLeft ?? k.work) / k.work : null;
      if (frac == null) continue;
      const key = k.x + ',' + k.y, e = seen.get(key);
      if (e) { e.n++; e.frac = Math.max(e.frac, frac); } else seen.set(key, { x: k.x, y: k.y, frac, n: 1 });
    }
    this.screenSpace();
    for (const { x, y, frac, n } of seen.values()) {
      const [sx, sy] = this.worldToScreen(x, y);
      // Inside the worked tile's lower edge: above it is where a worker stands.
      const h = Math.max(4, t * 0.12), bw = t * 0.84, bx = sx + (t - bw) / 2, by = sy + t * 0.8 - h;
      ctx.fillStyle = 'rgba(8,9,12,0.85)'; ctx.fillRect(bx - 1, by - 1, bw + 2, h + 2);
      ctx.fillStyle = '#e8b347'; ctx.fillRect(bx, by, bw * clamp01(frac), h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(bx, by, bw * clamp01(frac), Math.max(1, h * 0.35));
      if (n > 1 && t >= 20) {
        // Crew size, so it's plain why this bar is moving faster.
        ctx.font = `700 ${Math.round(Math.max(9, t * 0.24))}px ${UI_FONT}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText('×' + n, bx + bw + 4, by + h / 2 + 1);
        ctx.fillStyle = '#ffe9a8'; ctx.fillText('×' + n, bx + bw + 3, by + h / 2);
      }
    }
  }

  /**
   * An hourglass over a colonist who is busy at something — a bench, a seam,
   * a blueprint. The sand runs down, the glass turns over, and round it goes.
   */
  hourglass(cx, cy, size) {
    const ctx = this.ctx, T = 1.8, turn = 0.28;
    const ph = this.now % T;
    const flipping = ph > T - turn;
    const sand = flipping ? 0 : ph / (T - turn);             // share already fallen
    const rot = flipping ? ((ph - (T - turn)) / turn) * Math.PI : 0;
    const w = size * 0.5, h = size * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const glass = () => {
      ctx.beginPath();
      ctx.moveTo(-w * 0.8, -h); ctx.lineTo(w * 0.8, -h); ctx.lineTo(w * 0.12, 0);
      ctx.lineTo(w * 0.8, h); ctx.lineTo(-w * 0.8, h); ctx.lineTo(-w * 0.12, 0); ctx.closePath();
    };
    glass(); ctx.fillStyle = 'rgba(220,235,255,0.35)'; ctx.fill();
    ctx.save(); glass(); ctx.clip();
    ctx.fillStyle = '#f0c24a';
    // Top bulb drains from its surface down; the bottom one piles up.
    const topH = h * (1 - sand) * 0.85, botH = h * sand * 0.85;
    if (topH > 0.2) ctx.fillRect(-w, -topH * 0.9, w * 2, topH * 0.9);
    if (botH > 0.2) ctx.fillRect(-w, h - botH, w * 2, botH);
    if (!flipping && sand < 0.98) ctx.fillRect(-0.6, -h * 0.1, 1.2, h);
    ctx.restore();
    glass(); ctx.strokeStyle = '#120d16'; ctx.lineWidth = Math.max(1.5, size * 0.09); ctx.stroke();
    // Wooden caps top and bottom.
    const cap = size * 0.13;
    for (const y of [-h - cap, h]) {
      ctx.fillStyle = '#120d16'; ctx.fillRect(-w - 1.5, y - 1, w * 2 + 3, cap + 2);
      ctx.fillStyle = '#b07a3e'; ctx.fillRect(-w - 0.5, y, w * 2 + 1, cap);
    }
    ctx.restore();
  }

  unitLook(e) {
    const { u, kind } = e, S = this.sprites;
    if (kind === 'colonist') {
      const ring = this.selectedIds.has(u.id) ? ALLEGIANCE.selected : u.hostility > 55 ? ALLEGIANCE.wavering : ALLEGIANCE.ally;
      return { spr: S.person(u, ring), scale: 1 };
    }
    if (kind === 'enemy') {
      const scale = u.boss ? 1.35 : u.family === 'giant' ? 1.2 : 1;
      const ring = u.neutral ? ALLEGIANCE.neutral : ALLEGIANCE.hostile;   // a Rift merchant wears the traders' gold
      return { spr: u.monster ? S.monster(u, ring) : S.person(u, ring), scale };
    }
    if (kind === 'beast') {
      const A = ANIMALS[u.species];
      const ring = u.tame ? ALLEGIANCE.tame : A.wildAggressive ? ALLEGIANCE.hostile : ALLEGIANCE.wild;
      const young = u.age < A.matureDays;
      const big = u.species === 'ox' || u.species === 'packlizard' ? 1.1 : 1;
      return { spr: S.animal(u.species, ring), scale: (young ? 0.68 : 1) * big };
    }
    // visitor
    if (u.role === 'wagon') return { spr: S.wagon(ALLEGIANCE.neutral), scale: 1.15 };
    return { spr: S.person(u, ALLEGIANCE.neutral, u.klass || 'merchant'), scale: 1 };
  }

  drawUnit(e) {
    const t = this.tile, m = e.m;
    let [sx, sy] = this.worldToScreen(m.x, m.y);
    const floats = spriteFloats(e.u);
    const px = t / SPRITE_N;
    // Walking bobs a pixel per step; fliers hover on a slow sine instead.
    const bob = floats ? (1.5 + Math.sin(this.now * 3 + (e.u.id || 0)) * 1.2) * px
      : m.moving ? Math.abs(Math.sin(m.walked * Math.PI)) * px * 1.2 : 0;
    const footY = sy + t * 0.94;
    const look = this.unitLook(e), spr = look.spr;
    // A swing: lean hard toward the target and back. A shot: a small recoil.
    const act = e.u.fxAct;
    if (act && act.seq !== m.actSeq) { m.actSeq = act.seq; m.act = { t0: this.now, tx: act.tx, ty: act.ty, ranged: act.ranged, color: act.color }; }
    let lx = 0, ly = 0;
    if (m.act && !this.reduceMotion) {
      const k = (this.now - m.act.t0) / (m.act.ranged ? 0.18 : 0.24);
      if (k >= 1) { if (!m.act.ranged || k > 1.4) m.act.done = true; }
      else {
        const dx = m.act.tx - m.x, dy = m.act.ty - m.y, dl = Math.hypot(dx, dy) || 1;
        const push = Math.sin(k * Math.PI) * (m.act.ranged ? -0.08 : 0.38) * t;
        lx = dx / dl * push; ly = dy / dl * push;
      }
    }
    // Hover: ease up to a touch bigger, and wobble for a moment on the way
    // in and on the way out.
    const hov = this.reduceMotion ? 0 : m.hov || 0;
    const scale = look.scale * (1 + 0.14 * hov * (2 - hov));
    const js = m.jig != null && !this.reduceMotion ? this.now - m.jig : 9, JIG = 0.38;
    const rot = js < JIG ? Math.sin(js * 42) * 0.16 * (1 - js / JIG) : 0;
    e.scale = scale; e.sx = sx; e.sy = sy;
    const cx = sx + t / 2 + lx;
    const downed = (e.kind === 'colonist' || e.kind === 'beast') && e.u.downed;
    if (e.u.fxCharging) {
      // Gathering something big: a ring on the ground, there to be interrupted.
      const p = 0.5 + 0.5 * Math.sin(this.now * 8);
      const g = this.ctx;
      g.save();
      g.beginPath();
      if (g.ellipse) g.ellipse(sx + t / 2, footY, t * (0.42 + p * 0.08), t * (0.16 + p * 0.03), 0, 0, TAU);
      g.strokeStyle = `rgba(210,150,255,${0.5 + p * 0.4})`; g.lineWidth = 2.5; g.stroke();
      g.restore();
    }
    this.footShadow(cx, footY - px * 0.5 + ly, t * 0.3 * scale, floats ? 1 : 0);
    const flip = m.face < 0;
    // Carrying someone: they lie across the carrier's shoulders.
    const carried = e.kind === 'colonist' && e.u.carrying ? this.game.colonists.find(k => k.id === e.u.carrying) : null;
    const sleeping = e.kind === 'colonist' && e.u.state === 'sleeping';
    // Downed: on their side, a little faded, until they get back up.
    const lie = downed ? Math.PI / 2 * (flip ? -1 : 1) : 0;
    if (carried) this.blitSprite(this.sprites.person(carried, ALLEGIANCE.ally), cx + t * 0.05, footY - bob + ly - t * 0.42, 0.9, flip, 1, Math.PI / 2 * (flip ? 1 : -1));
    if (!this.blitSprite(spr, cx, footY - bob + ly + (downed ? -t * 0.18 : 0), scale, flip, sleeping ? 0.85 : downed ? 0.8 : 1, rot + lie)) {
      // No canvas (headless) or no sprite: the old shaded token still says who's who.
      const color = e.kind === 'enemy' ? '#e04a4a' : e.kind === 'beast' ? ANIMALS[e.u.species].color
        : e.kind === 'visitor' ? '#c9a24b' : (RACES[e.u.race] || RACES.human).color;
      this.token(cx, sy + t / 2, color, 'rgba(0,0,0,0.75)', 2);
    }
  }

  drawUnitMarks(e) {
    const ctx = this.ctx, t = this.tile;
    const { u, kind } = e, sx = e.sx, sy = e.sy;
    const top = sy - t * ((e.scale || 1) - 1);
    if (kind === 'colonist') {
      if (u.state === 'sleeping' && t >= 18) {
        ctx.save();
        ctx.font = `600 ${Math.round(t * 0.28)}px ${UI_FONT}`;
        ctx.fillStyle = 'rgba(210,225,255,0.9)'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('z', sx + t * 0.78, sy + t * 0.12 - Math.sin(this.now * 2 + u.id) * t * 0.05);
        ctx.restore();
      }
      if (u.hold && t >= 14) {
        ctx.save();
        ctx.font = `${Math.round(Math.max(9, t * 0.26))}px ${UI_FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(12,14,17,0.75)'; ctx.beginPath(); ctx.arc(sx + t * 0.14, sy + t * 0.86, t * 0.14, 0, TAU); ctx.fill();
        if (!this.atlas.draw(ctx, '⚓', sx + t * 0.14, sy + t * 0.86, t * 0.22)) { ctx.fillStyle = '#cfe2f5'; ctx.fillText('⚓', sx + t * 0.14, sy + t * 0.87); }
        ctx.restore();
      }
      // Mood pip: status colour, and the inspector spells the word out.
      this.badge(sx + t * 0.86, sy + t * 0.24, moodStatus(u.mood).color);
      if (u.hp < u.maxHp) this.hpBar(sx, top, u.hp / u.maxHp);
      if (u.state === 'working' && u.task && BUSY_KINDS[u.task.kind] && t >= 14) {
        const s = Math.max(10, t * 0.36);
        this.hourglass(sx + t / 2, top - s * 0.75 - (u.hp < u.maxHp ? t * 0.1 : 0) + Math.sin(this.now * 3 + u.id) * t * 0.02, s);
      }
    } else if (kind === 'enemy') {
      if (u.hp < u.maxHp) this.hpBar(sx, top, u.hp / u.maxHp);
      if (u.neutral) { this.atlas.draw(ctx, '🪙', sx + t * 0.82, top + t * 0.1, t * 0.3); }
      else if (u.floorSpawn && t >= 16) {
        ctx.save();
        ctx.font = `700 ${Math.round(t * (u.awake ? 0.34 : 0.26))}px ${UI_FONT}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        if (u.awake) { ctx.fillStyle = '#ff5a4a'; ctx.fillText('!', sx + t * 0.74, top + t * 0.16); }
        else { ctx.fillStyle = 'rgba(210,225,255,0.8)'; ctx.fillText('z', sx + t * 0.76, top + t * 0.14 - Math.sin(this.now * 2 + (u.id || 0)) * t * 0.05); }
        ctx.restore();
      }
    } else if (kind === 'beast') {
      if (u.markedButcher) {
        ctx.strokeStyle = STATUS.critical; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sx + 2, sy + 2); ctx.lineTo(sx + t - 2, sy + t - 2); ctx.stroke();
      }
      if (u.readyProduct > 0) this.badge(sx + t - 3, sy + 3, STATUS.warn);
      if (u.handler) this.badge(sx + 3, sy + 3, STATUS.calm);
    }
  }

  /** RimWorld's selection mark: four white corner brackets around the tile. */
  brackets(sx, sy, pad = 1) {
    const ctx = this.ctx, t = this.tile;
    const L = Math.max(4, t * 0.3), x0 = sx - pad, y0 = sy - pad, x1 = sx + t + pad, y1 = sy + t + pad;
    ctx.save();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'square';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
    ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
    ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
    ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
    ctx.stroke();
    ctx.restore();
  }

  /** A small corner badge. Used for "has something for you" states. */
  badge(cx, cy, color) {
    const ctx = this.ctx;
    const r = Math.max(2.6, this.tile * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  }

  /** A person token: ground shadow, shaded body disc, ring. The fallback when
   *  a sprite can't be drawn (no canvas), and nothing else. */
  token(cx, cy, color, ring, ringW) {
    const ctx = this.ctx, t = this.tile;
    const r = t * 0.34;
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(cx + t * 0.05, cy + r * 0.85, r * 0.9, r * 0.32, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = radial(ctx, cx - r * 0.35, cy - r * 0.4, 0, r * 1.3,
      [[0, 'rgba(255,255,255,0.35)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.35)']]);
    ctx.fill();
    ctx.lineWidth = ringW; ctx.strokeStyle = ring; ctx.stroke();
  }

  hpBar(sx, sy, frac) {
    const ctx = this.ctx, t = this.tile;
    const h = Math.max(2.5, t * 0.07);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(sx + t * 0.1, sy - h - 1, t * 0.8, h);
    ctx.fillStyle = frac > 0.5 ? STATUS.warn : STATUS.critical;
    ctx.fillRect(sx + t * 0.1, sy - h - 1, t * 0.8 * Math.max(0, frac), h);
  }

  // Hover, the drag band, and the tile selection. A marquee is dashed and
  // labelled with its count; a tool rect is solid and labelled with its area,
  // so the two modes are never mistaken for each other mid-drag.
  drawCursor() {
    const ctx = this.ctx, t = this.tile;
    this.screenSpace();
    if (this.dragRect) {
      const { x0: dx0, y0: dy0, x1: dx1, y1: dy1 } = this.dragRect;
      const [ax, ay] = this.worldToScreen(Math.min(dx0, dx1), Math.min(dy0, dy1));
      const cols = Math.abs(dx1 - dx0) + 1, rowsN = Math.abs(dy1 - dy0) + 1;
      const ww = cols * t, hh = rowsN * t;
      const marquee = this.dragMode === 'marquee';
      ctx.strokeStyle = marquee ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ax + 0.5, ay + 0.5, ww, hh);
      ctx.fillStyle = marquee ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.10)';
      ctx.fillRect(ax, ay, ww, hh);
      const label = marquee
        ? `${this.dragCount || 0} selected`
        : `${cols}×${rowsN}`;
      ctx.font = `12px ${UI_FONT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      const mt = ctx.measureText && ctx.measureText(label);
      const tw = (mt && mt.width) || 40;
      ctx.fillStyle = 'rgba(21,25,29,0.9)';
      ctx.fillRect(ax, ay - 16, tw + 10, 15);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, ax + 5, ay - 3);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    }
    // Build mode: the footprint of what would go down, green where it fits, red where it doesn't.
    if (this.ghostId && this.hover && !this.dragRect) {
      const a = anchorFor(this.ghostId, this.hover[0], this.hover[1]);
      const ok = this.game.world.canPlace(this.ghostId, this.hover[0], this.hover[1]);
      const [gx, gy] = this.worldToScreen(a.x, a.y);
      ctx.fillStyle = ok ? 'rgba(120,220,140,0.18)' : 'rgba(230,90,80,0.22)';
      ctx.fillRect(gx, gy, a.w * t, a.h * t);
      ctx.strokeStyle = ok ? 'rgba(140,240,160,0.9)' : 'rgba(240,110,100,0.9)';
      ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.strokeRect(gx + 0.5, gy + 0.5, a.w * t - 1, a.h * t - 1); ctx.setLineDash([]);
      if (BUILDINGS[this.ghostId].walled) {
        // Mark where the door will be.
        const dx = gx + ((a.w >> 1) + 0.5) * t, dy = gy + (a.h - 0.15) * t;
        ctx.fillStyle = ok ? 'rgba(140,240,160,0.95)' : 'rgba(240,110,100,0.95)';
        ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx - t * 0.15, dy - t * 0.22); ctx.lineTo(dx + t * 0.15, dy - t * 0.22); ctx.closePath(); ctx.fill();
      }
    }
    if (this.selection && this.selection.kind === 'tile') {
      const [hx, hy] = this.worldToScreen(this.selection.x, this.selection.y);
      this.brackets(hx, hy, 1);
    }
  }
}

/** Draws the region map into a small canvas for the Region panel. */
/**
 * A picture of one building or floor exactly as the map draws it, for the
 * build picker: the renderer's own tile art on a patch of bare ground. Walls
 * are shown as a short run, doors between two walls. Returns a data URL, or
 * null for things with no tile art (fields draw their crop instead).
 */
const THUMBS = new Map();
export function tileThumb(kind, id, px = 64) {
  const key = kind + ':' + id + ':' + px;
  if (THUMBS.has(key)) return THUMBS.get(key);
  let url = null;
  try {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const g = cv.getContext('2d');
    if (g && g.scale && cv.toDataURL) {
      const X = 5, Y = 5;
      const walls = new Set();
      if (kind === 'build' && (id === 'wall' || id === 'timber_wall')) { walls.add(X - 1); walls.add(X + 1); }
      if (kind === 'build' && id === 'door') { walls.add(X - 1); walls.add(X + 1); }
      const wallId = id === 'timber_wall' ? 'timber_wall' : 'wall';
      const world = {
        buildingAt: (x, y) => (y === Y && x === X && kind === 'build') ? { id, done: true }
          : (y === Y && walls.has(x)) ? { id: wallId, done: true } : null,
      };
      const fake = Object.create(Renderer.prototype);
      fake.ctx = g; fake.now = 0; fake.game = { world };
      g.scale(px, px);
      g.fillStyle = GROUND.dirt.base; g.fillRect(0, 0, 1, 1);
      let drew = true;
      if (kind === 'floor') fake.drawPlayerFloor(id, X, Y);
      else if (id === 'wall' || id === 'timber_wall') fake.drawWall(X, Y);
      else if (id === 'door') fake.drawDoor(X, Y);
      else if (ART[id]) ART[id](g, { x: X, y: Y, b: { id, done: true, hp: 100, growth: 1, progress: 0 }, now: 0, first: true });
      else drew = false;
      if (drew) url = cv.toDataURL();
    }
  } catch (e) { url = null; }
  THUMBS.set(key, url);
  return url;
}

/** Where the region map sits on a canvas: cell size (fractional) and offset. */
function overworldLayout(canvas, ow) {
  const cell = Math.max(1, Math.min(canvas.width / ow.w, canvas.height / ow.h));
  return { cell, ox: (canvas.width - cell * ow.w) / 2, oy: (canvas.height - cell * ow.h) / 2 };
}

// The terrain never changes after generation, so it's painted once at one
// pixel per cell and scaled up each redraw.
const OW_TERRAIN = new WeakMap();
function overworldTerrain(ow) {
  let cv = OW_TERRAIN.get(ow);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = ow.w; cv.height = ow.h;
  const c = cv.getContext('2d');
  const img = c.createImageData ? c.createImageData(ow.w, ow.h) : null;
  if (img && img.data) {
    const rgb = {};
    for (const [id, B] of Object.entries(BIOMES)) {
      const n = parseInt(B.color.slice(1), 16);
      rgb[id] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    for (let i = 0; i < ow.w * ow.h; i++) {
      const [r, g, b] = rgb[ow.biome[i]] || [34, 34, 34];
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  } else {
    for (let y = 0; y < ow.h; y++) for (let x = 0; x < ow.w; x++) {
      const B = BIOMES[ow.biomeAt(x, y)];
      c.fillStyle = B ? B.color : '#222';
      c.fillRect(x, y, 1, 1);
    }
  }
  OW_TERRAIN.set(ow, cv);
  return cv;
}

export function drawOverworld(canvas, game, opts = {}) {
  const ow = game.overworld;
  const ctx = canvas.getContext('2d');
  const cw = canvas.width, ch = canvas.height;
  const { cell, ox, oy } = overworldLayout(canvas, ow);
  ctx.fillStyle = '#07080b';
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(overworldTerrain(ow), ox, oy, cell * ow.w, cell * ow.h);
  // Roads, as worn tracks between the settlements they join. Drawn under the
  // fog so they dim with the land instead of giving the whole network away.
  if (ow.roads && ow.roads.length) {
    ctx.strokeStyle = 'rgba(226,204,150,0.8)';
    ctx.lineWidth = Math.max(1, cell * 0.28);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const p of ow.roads) {
      for (let i = 0; i < p.length; i += 2) {
        const px = ox + (p[i] + 0.5) * cell, py = oy + (p[i + 1] + 0.5) * cell;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
    }
    ctx.stroke();
  }
  // Unexplored country is dimmed rather than hidden, so the map reads as a map.
  ctx.fillStyle = 'rgba(6,8,14,0.62)';
  ctx.fillRect(ox, oy, cell * ow.w, cell * ow.h);
  for (const s of ow.sites) {
    if (!s.discovered) continue;
    const r = Math.max(6, cell * 3);
    const gx = ox + s.x * cell, gy = oy + s.y * cell;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(gx - r / 2, gy - r / 2, r, r);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const iconSize = Math.max(9, cell * 2.4);
  const atlas = opts.atlas;
  for (const s of ow.sites) {
    if (!s.discovered) continue;
    const K = SITE_KINDS[s.kind];
    const gx = ox + s.x * cell + cell / 2, gy = oy + s.y * cell + cell / 2;
    // Hostile country gets a warning wash under its icon.
    if (K.hostileSite) {
      ctx.fillStyle = 'rgba(224,74,74,0.18)';
      ctx.beginPath(); ctx.arc(gx, gy, iconSize * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    const drew = atlas && atlas.draw(ctx, SITE_ICON[s.kind], gx, gy, iconSize);
    if (!drew) {
      ctx.font = `${Math.max(8, cell * 2)}px ui-monospace, monospace`;
      ctx.fillStyle = K.color;
      ctx.fillText(K.glyph, gx, gy);
    }
    if (opts.selected && opts.selected.id === s.id) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.strokeRect(gx - cell * 1.6, gy - cell * 1.6, cell * 3.2, cell * 3.2);
    }
  }
  return { cell, ox, oy };
}
export function overworldHit(canvas, game, px, py) {
  const ow = game.overworld;
  const { cell, ox, oy } = overworldLayout(canvas, ow);
  const gx = (px - ox) / cell, gy = (py - oy) / cell;
  let best = null, bd = Math.max(1.5, 12 / cell);
  for (const s of ow.sites) {
    if (!s.discovered) continue;
    const d = Math.hypot(s.x + 0.5 - gx, s.y + 0.5 - gy);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
