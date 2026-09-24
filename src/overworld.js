// ============================================================================
// OVERWORLD
// A region map generated per run: biomes from elevation/moisture/temperature,
// then sites (villages, ruins, dungeon mouths, camps, resource nodes) placed by
// biome suitability. The colony occupies one site; its biome decides local
// terrain, which crops grow, which animals live nearby and what neighbours
// trade. Raiders and caravans now come FROM somewhere.
// ============================================================================
import { RNG, clamp, lerp } from './rng.js';
import { FACTIONS, dispositionOf } from './data.js';
import { generateNPC, powerOf } from './npc.js';
import { generateName } from './names.js';

// --- biomes -----------------------------------------------------------------
// fertility drives farming, forage drives grazing, move is travel cost.
export const BIOMES = {
  ocean:     { name: 'Ocean',      color: '#1b3350', move: 99, fertility: 0,    forage: 0.1, danger: 0.2, water: 1.0, temp:  0.00, glyph: '~' },
  coast:     { name: 'Coast',      color: '#2f5a72', move: 1.2, fertility: 0.55, forage: 0.5, danger: 0.3, water: 0.9, temp:  0.02, glyph: '~' },
  marsh:     { name: 'Marsh',      color: '#3d5142', move: 2.0, fertility: 0.75, forage: 0.6, danger: 0.6, water: 1.0, temp:  0.06, glyph: '"' },
  grassland: { name: 'Grassland',  color: '#4e6b3a', move: 1.0, fertility: 0.90, forage: 1.0, danger: 0.3, water: 0.5, temp:  0.00, glyph: '.' },
  forest:    { name: 'Forest',     color: '#33512f', move: 1.5, fertility: 0.70, forage: 0.8, danger: 0.5, water: 0.6, temp: -0.05, glyph: '♣' },
  deepwood:  { name: 'Deepwood',   color: '#233d24', move: 2.1, fertility: 0.55, forage: 0.7, danger: 0.9, water: 0.6, temp: -0.10, glyph: '♠' },
  hills:     { name: 'Hills',      color: '#5c5840', move: 1.5, fertility: 0.55, forage: 0.7, danger: 0.5, water: 0.4, temp: -0.06, glyph: '∩' },
  highland:  { name: 'Highland',   color: '#6a6455', move: 2.0, fertility: 0.35, forage: 0.5, danger: 0.6, water: 0.3, temp: -0.16, glyph: '▲' },
  mountain:  { name: 'Mountain',   color: '#7b7b82', move: 3.2, fertility: 0.10, forage: 0.2, danger: 0.8, water: 0.3, temp: -0.30, glyph: '▲' },
  tundra:    { name: 'Tundra',     color: '#6d7a80', move: 1.4, fertility: 0.20, forage: 0.3, danger: 0.6, water: 0.4, temp: -0.38, glyph: '·' },
  taiga:     { name: 'Taiga',      color: '#35493f', move: 1.7, fertility: 0.40, forage: 0.6, danger: 0.6, water: 0.5, temp: -0.26, glyph: '♠' },
  desert:    { name: 'Desert',     color: '#8a7a52', move: 1.6, fertility: 0.12, forage: 0.2, danger: 0.7, water: 0.1, temp:  0.26, glyph: ':' },
  badlands:  { name: 'Badlands',   color: '#7a5340', move: 1.9, fertility: 0.18, forage: 0.3, danger: 0.9, water: 0.2, temp:  0.20, glyph: '%' },
  ashland:   { name: 'Ashland',    color: '#4a4048', move: 2.2, fertility: 0.08, forage: 0.1, danger: 1.2, water: 0.2, temp:  0.12, glyph: '▒' },
};
export const BIOME_IDS = Object.keys(BIOMES);

// --- site kinds -------------------------------------------------------------
export const SITE_KINDS = {
  colony:    { name: 'Rift Camp',      glyph: '⌂', color: '#ffffff', settle: true, rift: true },
  village:   { name: 'Village',        glyph: '⌂', color: '#d9c38a', settle: true, trade: true },
  town:      { name: 'Town',           glyph: '⌂', color: '#e8d9a8', settle: true, trade: true },
  freehold:  { name: 'Freehold',       glyph: '⌂', color: '#b9a878', settle: true, trade: true },
  camp:      { name: 'War Camp',       glyph: '▲', color: '#e07a4a', hostileSite: true },
  lair:      { name: 'Beast Lair',     glyph: '☠', color: '#b06ad0', hostileSite: true },
  dungeon:   { name: 'Delve',          glyph: '◘', color: '#9a7ad0', delve: true },
  ruin:      { name: 'Ruin',           glyph: '⌂', color: '#8a8a92', delve: true },
  barrow:    { name: 'Barrow',         glyph: '◘', color: '#7a6a9a', delve: true },
  quarry:    { name: 'Stone Quarry',   glyph: '◆', color: '#9aa3ad', node: 'stone' },
  lode:      { name: 'Iron Lode',      glyph: '◆', color: '#c0c6cc', node: 'iron' },
  grove:     { name: 'Old Grove',      glyph: '♣', color: '#6fcf97', node: 'wood' },
  herbfield: { name: 'Herb Meadow',    glyph: '✿', color: '#7fd0a0', node: 'herbs' },
  leyspring: { name: 'Ley Spring',     glyph: '✦', color: '#b07ae0', node: 'dust' },
  pasture:   { name: 'Wild Pasture',   glyph: '♆', color: '#9fc06a', wildlife: true },
  shrine:    { name: 'Wayshrine',      glyph: '†', color: '#e2b23c', shrine: true },
  // Landmarks: structures the world is built with. Not dungeons (the Rift is
  // the only one); they give the land a history and the roads somewhere to stop.
  tower:     { name: 'Old Watchtower', glyph: '♜', color: '#c9b48a', landmark: true },
  keep:      { name: 'Fallen Keep',    glyph: '♖', color: '#a89a86', landmark: true },
  stones:    { name: 'Standing Stones', glyph: '⁂', color: '#b8a8d8', landmark: true },
  inn:       { name: 'Roadside Inn',   glyph: '⌂', color: '#e0b070', landmark: true },
};

const VILLAGE_PREFIX = ['Ald', 'Bramble', 'Cold', 'Dun', 'East', 'Fen', 'Grey', 'Hollow', 'King', 'Long', 'Mill', 'North', 'Oak', 'Pine', 'Red', 'Salt', 'Stone', 'Thorn', 'Wind'];
const VILLAGE_SUFFIX = ['brook', 'bury', 'crag', 'dale', 'ford', 'gate', 'hollow', 'mere', 'reach', 'stead', 'thorpe', 'vale', 'watch', 'well', 'wick'];
const WILD_PREFIX = ['Broken', 'Black', 'Drowned', 'Gaunt', 'Hungry', 'Old', 'Shattered', 'Silent', 'Weeping'];
const INN_ADJ = ['Crooked', 'Drowsy', 'Golden', 'Laughing', 'Lame', 'Muddy', 'Rusty', 'Silver', 'Wandering'];
const INN_NOUN = ['Boar', 'Cart', 'Crow', 'Flagon', 'Lantern', 'Mule', 'Stag', 'Wheel', 'Wolf'];
const WILD_NOUN = ['Tor', 'Barrow', 'Scar', 'Hollow', 'Teeth', 'Crown', 'Maw', 'Stair', 'Cairn'];

function noise(rng, w, h, scale) {
  const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / scale, fy = y / scale;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    out[y * w + x] = lerp(
      lerp(g[y0 * gw + x0], g[y0 * gw + x0 + 1], sx),
      lerp(g[(y0 + 1) * gw + x0], g[(y0 + 1) * gw + x0 + 1], sx), sy);
  }
  return out;
}

/**
 * Layered noise: [scale, weight] octaves summed, then stretched back out to
 * roughly the 0..1 spread of a single octave (summing flattens the contrast).
 */
function fbm(rng, w, h, octaves) {
  const out = new Float32Array(w * h);
  let total = 0;
  for (const [scale, weight] of octaves) {
    const n = noise(rng, w, h, scale);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * weight;
    total += weight;
  }
  const stretch = 1 + 0.3 * (octaves.length - 1);
  for (let i = 0; i < out.length; i++) out[i] = clamp(0.5 + (out[i] / total - 0.5) * stretch, 0, 1);
  return out;
}

/** Whittaker-style biome pick from elevation / moisture / temperature, plus volcanic scarring. */
export function classify(elev, moist, temp, ash = 0) {
  if (elev < 0.32) return 'ocean';
  if (elev < 0.38) return 'coast';
  if (elev > 0.80) return 'mountain';
  if (ash > 0.74 && elev > 0.44) return 'ashland';
  if (elev > 0.70) return temp < 0.30 ? 'tundra' : 'highland';
  if (temp < 0.26) return moist > 0.48 ? 'taiga' : 'tundra';
  if (temp > 0.70) {
    if (moist < 0.34) return 'desert';
    if (moist < 0.52) return 'badlands';
    return 'marsh';
  }
  if (moist > 0.80) return elev < 0.46 ? 'marsh' : 'deepwood';
  if (moist > 0.58) return 'forest';
  if (elev > 0.56) return 'hills';
  return 'grassland';
}

// The region is ~10x the area of the original 52x34 map. A cell is still one
// league: biomes keep their old size, there are just far more of them, and
// danger, travel and scouting keep their old meaning.
export const OW_W = 164, OW_H = 108;

// Every run rolls the shape of its land before any noise is drawn, so two runs
// differ in kind (one continent, a spray of islands, a coast along one edge...),
// not just in where the same blobs fall.
export const WORLD_SHAPES = {
  continent:   'One great continent ringed by sea',
  archipelago: 'Scattered islands and narrow straits',
  twin:        'Two landmasses across a channel',
  coast:       'A long coast with the sea along one edge',
  inland:      'A continent around an inland sea',
};

/** Shape mask: how strongly each point is pushed up out of the sea (0..1). */
function shapeMask(climate, cx, cy) {
  const edge = Math.max(Math.abs(cx), Math.abs(cy));
  const ring = clamp(1.05 - Math.pow(edge, 2.2) * 1.15, 0, 1);
  switch (climate.shape) {
    case 'archipelago': return clamp(0.75 - Math.pow(edge, 3) * 0.9, 0, 1);
    case 'twin': {
      let best = 0;
      for (const [px, py] of climate.centres) {
        const d = Math.hypot((cx - px) / 0.62, (cy - py) / 0.85);
        best = Math.max(best, clamp(1.1 - d * d, 0, 1));
      }
      return Math.min(best, ring + 0.2);
    }
    case 'coast': {
      const [ax, ay] = climate.seaSide;                 // unit vector pointing at the sea
      const along = (cx * ax + cy * ay + 1) / 2;         // 0 inland .. 1 at the sea edge
      return Math.min(clamp(1.25 - Math.pow(along, 1.6) * 1.45, 0, 1), ring + 0.35);
    }
    case 'inland': {
      const [px, py] = climate.centres[0];
      const d = Math.hypot((cx - px) / 0.34, (cy - py) / 0.42);
      return clamp(ring - clamp(1 - d * d, 0, 1) * 0.85, 0, 1);
    }
    default: return ring;
  }
}

export class Overworld {
  constructor(seed, w = OW_W, h = OW_H) {
    this.w = w; this.h = h;
    this.rng = new RNG(seed);
    this.biome = new Array(w * h);
    this.climate = null;
    this.road = null;      // Uint8Array: 1 where a road runs (travel is quicker on it)
    this.roads = [];       // each road as a flat [x0, y0, x1, y1, ...] path, for drawing
    this.sites = [];
    this.day = 0;
    this.generate();
  }
  idx(x, y) { return y * this.w + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  biomeAt(x, y) { return this.inside(x, y) ? this.biome[this.idx(x, y)] : 'ocean'; }
  onRoad(x, y) { return !!(this.road && this.inside(x, y) && this.road[this.idx(x, y)]); }

  rollClimate() {
    const rng = this.rng;
    const shape = rng.weighted([['continent', 3], ['archipelago', 2], ['twin', 2], ['coast', 2], ['inland', 2]]);
    const climate = {
      shape,
      sea: rng.float(-0.04, 0.04),           // + raises the land, - drowns it
      warm: rng.float(-0.12, 0.12),
      wet: rng.float(-0.12, 0.12),
      volcanic: rng.float(-0.2, 0.05),      // how much ashland scars the region
      equator: rng.float(0.25, 0.75),        // where the warm band runs, top to bottom
      centres: [],
      seaSide: null,
    };
    if (shape === 'twin') {
      const vertical = rng.chance(0.5);
      const a = rng.float(0.38, 0.52), j = () => rng.float(-0.2, 0.2);
      climate.centres = vertical ? [[j(), -a], [j(), a]] : [[-a, j()], [a, j()]];
    } else if (shape === 'inland') {
      climate.centres = [[rng.float(-0.25, 0.25), rng.float(-0.2, 0.2)]];
    } else if (shape === 'coast') {
      climate.seaSide = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    }
    return climate;
  }

  generate() {
    const { w, h, rng } = this;
    const climate = this.climate = this.rollClimate();
    // Continental swell, regional relief and fine detail. Scales are in cells
    // (leagues), so a bigger map gets more regions, not blurrier ones.
    const elev = fbm(rng, w, h, [[34, 0.45], [11, 0.38], [4, 0.17]]);
    const moist = fbm(rng, w, h, [[20, 0.55], [8, 0.45]]);
    const heat = fbm(rng, w, h, [[26, 0.7], [9, 0.3]]);
    const ash = fbm(rng, w, h, [[14, 0.7], [5, 0.3]]);
    // Islands need the sea let in everywhere, not just at the rim.
    const drown = climate.shape === 'archipelago' ? 0.09 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = this.idx(x, y);
      const cx = (x / (w - 1)) * 2 - 1, cy = (y / (h - 1)) * 2 - 1;
      const mask = shapeMask(climate, cx, cy);
      const e = clamp(elev[i] * 0.78 + mask * 0.42 - 0.14 - drown + climate.sea, 0, 1);
      // Distance from this run's equator drives temperature; altitude cools it.
      const lat = 1 - Math.abs(y / (h - 1) - climate.equator) / Math.max(climate.equator, 1 - climate.equator);
      const t = clamp(lat * 0.66 + heat[i] * 0.42 - Math.max(0, e - 0.62) * 0.90 + climate.warm, 0, 1);
      const m = clamp(moist[i] * 0.92 + (e < 0.40 ? 0.10 : 0) - Math.max(0, e - 0.70) * 0.30 + climate.wet, 0, 1);
      this.biome[i] = classify(e, m, t, ash[i] + climate.volcanic);
    }
    this.placeSites();
    this.buildRoads();
    delete this._siteGrid;
  }

  landCells() {
    const out = [];
    for (let y = 1; y < this.h - 1; y++) for (let x = 1; x < this.w - 1; x++) {
      const b = this.biomeAt(x, y);
      if (b !== 'ocean') out.push([x, y]);
    }
    return out;
  }

  placeSites() {
    const rng = this.rng;
    const land = this.landCells();
    if (!land.length) return;

    // Pick the HOME BIOME first, weighted by habitability, then the best cell
    // within it. Scoring cells directly always lands in grassland and the whole
    // biome layer stops mattering across runs.
    const HOME_WEIGHT = {
      grassland: 5, forest: 4, hills: 4, coast: 3, taiga: 3, marsh: 2.5,
      highland: 2, deepwood: 2, tundra: 1.6, badlands: 1.6, desert: 1.6,
      mountain: 1, ashland: 0.7,
    };
    const present = {};
    for (const [x, y] of land) { const b = this.biomeAt(x, y); present[b] = (present[b] || 0) + 1; }
    const choices = Object.keys(present).filter(b => HOME_WEIGHT[b] && present[b] >= 6);
    const homeBiome = choices.length
      ? rng.weighted(choices.map(b => [b, HOME_WEIGHT[b] * Math.min(3, present[b] / 25)]))
      : 'grassland';
    const inBiome = land.filter(([x, y]) => this.biomeAt(x, y) === homeBiome);
    const candidates = inBiome.length >= 4 ? inBiome : land;

    const scored = candidates.map(([x, y]) => {
      const b = this.biomeAt(x, y);
      let s = BIOMES[b].fertility * 2 + BIOMES[b].forage;
      let nearRock = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nb = this.biomeAt(x + dx, y + dy);
        if (nb === 'mountain' || nb === 'hills' || nb === 'highland') nearRock++;
        if (nb === 'ocean') s -= 0.05;
      }
      s += Math.min(nearRock, 6) * 0.18;
      if (b === 'mountain' || b === 'ocean') s -= 5;
      // Keep the camp off the map's rim so there's country to explore every way.
      const rim = Math.min(x, y, this.w - 1 - x, this.h - 1 - y);
      if (rim < 14) s -= (14 - rim) * 0.12;
      return { x, y, s: s + rng.float(0, 0.5) };
    }).sort((a, b) => b.s - a.s);
    // Choose among the good sites rather than THE best one, or every run starts
    // in grassland and the biome layer stops mattering.
    const pool = scored.slice(0, Math.max(6, Math.floor(scored.length * 0.25)));
    const home = pool[Math.floor(Math.pow(rng.next(), 1.6) * pool.length)] || scored[0];

    this.colony = this.addSite('colony', home.x, home.y, { name: 'The Rift Gate', discovered: true, faction: 'colony' });

    // Site budget scales with how much land there is.
    const budget = Math.max(16, Math.round(land.length * 0.035));
    const plan = [
      ['village', Math.round(budget * 0.20)],
      ['freehold', Math.round(budget * 0.10)],
      ['town', Math.max(1, Math.round(budget * 0.05))],
      ['camp', Math.round(budget * 0.09)],
      ['lair', Math.round(budget * 0.07)],
      ['quarry', Math.round(budget * 0.04)],
      ['lode', Math.round(budget * 0.04)],
      ['grove', Math.round(budget * 0.05)],
      ['herbfield', Math.round(budget * 0.04)],
      ['leyspring', Math.max(1, Math.round(budget * 0.03))],
      ['pasture', Math.round(budget * 0.07)],
      ['shrine', Math.round(budget * 0.04)],
      ['tower', Math.max(1, Math.round(budget * 0.04))],
      ['keep', Math.max(1, Math.round(budget * 0.025))],
      ['stones', Math.max(1, Math.round(budget * 0.03))],
    ];
    for (const [kind, count] of plan) {
      for (let i = 0; i < count; i++) {
        const spot = this.findSpot(kind, land);
        if (spot) this.addSite(kind, spot[0], spot[1]);
      }
    }
    for (const s of this.sites) this.settleSite(s);
    this.finalizeSites();
  }

  /**
   * Roads: every settlement is tied into the network by a track to the nearest
   * place already on it, working outward from the camp, so the roads read as
   * grown rather than drawn. Tracks bend around mountains and share stretches
   * of road where they can. Settlements over the sea stay unconnected.
   */
  buildRoads() {
    const { w, h } = this;
    this.road = new Uint8Array(w * h);
    this.roads = [];
    const hubs = this.sites.filter(s => SITE_KINDS[s.kind].settle)
      .sort((a, b) => a.dist - b.dist);
    const linked = hubs.length ? [hubs[0]] : [];
    for (const s of hubs.slice(1)) {
      const near = linked.map(o => [o, Math.hypot(o.x - s.x, o.y - s.y)]).sort((a, b) => a[1] - b[1]);
      // Towns are crossroads: they take a second road where one is within reach.
      const links = s.kind === 'town' ? 2 : 1;
      let made = 0;
      for (const [o, d] of near) {
        if (made >= links || d > 42) break;
        const path = this.findRoute(s, o);
        if (!path) continue;
        for (let i = 0; i < path.length; i += 2) this.road[this.idx(path[i], path[i + 1])] = 1;
        this.roads.push(path);
        made++;
      }
      if (made) linked.push(s);
    }
    // Inns grow up along the longer roads, well clear of the towns they join.
    const rng = this.rng;
    for (const path of this.roads) {
      const n = path.length / 2;
      if (n < 8 || !rng.chance(Math.min(0.85, n / 22))) continue;
      const k = rng.int(Math.floor(n * 0.35), Math.floor(n * 0.65));
      const x = path[k * 2], y = path[k * 2 + 1];
      if (!this.crowded(x, y, 4)) this.addSite('inn', x, y);
    }
    for (const s of this.sites) if (s.kind === 'inn') this.settleSite(s);
  }

  /** A* over the land, cheaper on existing road. Returns a flat [x, y, ...] path, or null. */
  findRoute(a, b) {
    const { w, h } = this;
    const n = w * h;
    const cost = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const heap = [];
    const push = (i, f) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
        }
      }
      return top;
    };
    const start = this.idx(a.x, a.y), goal = this.idx(b.x, b.y);
    cost[start] = 0;
    push(start, 0);
    let expanded = 0;
    while (heap.length && expanded++ < 60000) {
      const [f, i] = pop();
      if (i === goal) break;
      const x = i % w, y = (i - x) / w;
      const g = cost[i];
      if (f - Math.hypot(x - b.x, y - b.y) * 0.3 > g + 1e-9) continue;   // stale entry
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        const bj = this.biome[j];
        if (bj === 'ocean') continue;
        const step = (this.road[j] ? 0.3 : BIOMES[bj].move) * (dx && dy ? 1.414 : 1);
        if (g + step < cost[j]) {
          cost[j] = g + step; from[j] = i;
          push(j, cost[j] + Math.hypot(nx - b.x, ny - b.y) * 0.3);
        }
      }
    }
    if (from[goal] < 0) return null;
    const path = [];
    for (let i = goal; i >= 0; i = from[i]) {
      const x = i % w;
      path.push(x, (i - x) / w);
      if (i === start) break;
    }
    return path;
  }

  /** Distance from home sets the tier band, so danger grows outward. */
  settleSite(s) {
    s.dist = Math.hypot(s.x - this.colony.x, s.y - this.colony.y);
    s.tier = clamp(1 + Math.round(s.dist / 4.2 + BIOMES[s.biome].danger * 1.6), 1, 14);
    // Reveal the neighbourhood so the player starts with something to do.
    if (s.dist <= 9) { s.discovered = true; if (s.dist <= 5) s.scouted = true; }
  }

  suitability(kind, x, y) {
    const b = this.biomeAt(x, y);
    const B = BIOMES[b];
    if (b === 'ocean') return -99;
    switch (kind) {
      case 'village': case 'town': case 'freehold': return B.fertility * 3 + B.forage - B.danger;
      case 'quarry': return (b === 'mountain' || b === 'highland' || b === 'hills') ? 3 : -2;
      case 'lode': return (b === 'mountain' || b === 'hills' || b === 'badlands') ? 3 : -2;
      case 'grove': return (b === 'forest' || b === 'deepwood' || b === 'taiga') ? 3 : -2;
      case 'herbfield': return (b === 'grassland' || b === 'marsh' || b === 'forest') ? 3 : -1.5;
      case 'pasture': return B.forage * 3 - B.danger;
      case 'leyspring': return B.danger * 1.5 + (b === 'ashland' || b === 'deepwood' || b === 'marsh' ? 2 : 0);
      case 'camp': case 'lair': return B.danger * 2 + 0.5;
      case 'dungeon': case 'barrow': case 'ruin': return 1 + B.danger * 0.6;
      case 'tower': return (b === 'hills' || b === 'highland' ? 2.5 : b === 'mountain' ? 0.5 : 0.8) - B.move * 0.2;
      case 'keep': return 1 + B.danger * 0.8 + (b === 'hills' || b === 'highland' ? 1 : 0);
      case 'stones': return (b === 'grassland' || b === 'tundra' || b === 'highland' || b === 'marsh' ? 2 : 0.6) + B.danger * 0.5;
      default: return 1;
    }
  }

  findSpot(kind, land) {
    const rng = this.rng;
    const minGap = (kind === 'town') ? 7 : (SITE_KINDS[kind].settle ? 4 : 3);
    let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 70; tries++) {
      const [x, y] = land[rng.int(0, land.length - 1)];
      if (this.crowded(x, y, minGap)) continue;
      const score = this.suitability(kind, x, y) + rng.float(0, 0.8);
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    return bestScore > 0 ? best : null;
  }

  /** Is any site closer than `gap` to (x, y)? Checks only nearby buckets. */
  crowded(x, y, gap) {
    const B = 8, grid = this._siteGrid;
    if (!grid) return this.sites.some(s => Math.hypot(s.x - x, s.y - y) < gap);
    const bx = Math.floor(x / B), by = Math.floor(y / B), r = Math.ceil(gap / B);
    for (let yy = by - r; yy <= by + r; yy++) for (let xx = bx - r; xx <= bx + r; xx++) {
      const cell = grid.get(yy * 4096 + xx);
      if (cell) for (const s of cell) if (Math.hypot(s.x - x, s.y - y) < gap) return true;
    }
    return false;
  }

  addSite(kind, x, y, extra = {}) {
    const rng = this.rng;
    const biome = this.biomeAt(x, y);
    const site = {
      id: 's' + (this.sites.length + 1),
      kind, x, y, biome,
      name: extra.name || this.nameFor(kind, biome),
      discovered: !!extra.discovered,
      scouted: !!extra.discovered,
      faction: extra.faction || null,
      tier: 1, dist: 0,
      depleted: 0, cleared: false, dungeon: null,
      ...extra,
    };
    this.sites.push(site);
    // A generation-time lookup only; dropped once the map is built (never saved).
    if (!this._siteGrid) this._siteGrid = new Map();
    const key = Math.floor(y / 8) * 4096 + Math.floor(x / 8);
    if (!this._siteGrid.has(key)) this._siteGrid.set(key, []);
    this._siteGrid.get(key).push(site);
    return site;
  }

  nameFor(kind, biome) {
    const rng = this.rng;
    const K = SITE_KINDS[kind];
    if (K.settle) return rng.pick(VILLAGE_PREFIX) + rng.pick(VILLAGE_SUFFIX);
    if (kind === 'tower') return `${rng.pick(VILLAGE_PREFIX)} Tower`;
    if (kind === 'keep') return `${rng.pick(VILLAGE_PREFIX)}${rng.pick(VILLAGE_SUFFIX)} Keep`;
    if (kind === 'stones') return `The ${rng.pick(WILD_PREFIX)} Stones`;
    if (kind === 'inn') return `The ${rng.pick(INN_ADJ)} ${rng.pick(INN_NOUN)}`;
    if (K.node || K.wildlife || K.shrine) return `${rng.pick(WILD_PREFIX)} ${K.name}`;
    return `${rng.pick(WILD_PREFIX)} ${rng.pick(WILD_NOUN)}`;
  }

  // Give settlements and hostile sites their populations, stock and standing.
  finalizeSites() {
    const rng = this.rng;
    for (const s of this.sites) {
      const K = SITE_KINDS[s.kind];
      if (s.kind === 'colony') continue;
      if (K.settle) {
        s.faction = rng.weighted([['merchants', 5], ['wanderers', 3], ['outlaws', s.biome === 'badlands' || s.biome === 'ashland' ? 3 : 1]]);
        s.pop = s.kind === 'town' ? rng.int(40, 140) : s.kind === 'village' ? rng.int(14, 48) : rng.int(5, 16);
        // Settlements get their own hostility meter — the same one people use.
        const leader = generateNPC(rng, { faction: s.faction, tier: clamp(s.tier, 0, 10) });
        s.leader = leader;
        s.hostility = clamp(Math.round(leader.hostility * 0.6 + FACTIONS[s.faction].base * 0.4 + BIOMES[s.biome].danger * 6), 0, 100);
        s.standing = 0;              // player-earned goodwill, shifts hostility
        s.stock = this.rollStock(rng, s);
        s.wants = rng.pickMany(['gold', 'gems', 'relics', 'dust', 'iron', 'meal', 'potion'], 2);
        s.quests = [];
        s.restock = 0;
      } else if (K.hostileSite) {
        s.faction = s.kind === 'lair'
          ? 'wild'
          : rng.weighted([['warband', 4], ['outlaws', 3], ['cult', s.tier > 5 ? 2 : 0], ['dead', s.tier > 7 ? 2 : 0]]);
        s.hostility = clamp(70 + rng.int(0, 25), 0, 100);
        s.strength = Math.round((3 + s.tier * 2.2) * rng.float(0.8, 1.3));
        s.raidTimer = rng.int(2, 8);
      } else if (K.delve) {
        s.faction = rng.weighted([['dead', 3], ['cult', 2], ['warband', 2], ['wild', 2], ['outlaws', 1]]);
        s.hostility = 80;
      } else if (K.node) {
        s.richness = rng.float(0.7, 1.6) * (1 + s.tier * 0.12);
        s.reserve = Math.round((60 + s.tier * 40) * s.richness);
      } else if (K.wildlife) {
        s.herd = null; // filled by husbandry
      }
    }
  }

  rollStock(rng, s) {
    const B = BIOMES[s.biome];
    const stock = {};
    const local = [];
    if (B.fertility > 0.6) local.push('food', 'herbs');
    if (s.biome === 'forest' || s.biome === 'deepwood' || s.biome === 'taiga') local.push('wood', 'leather');
    if (s.biome === 'mountain' || s.biome === 'hills' || s.biome === 'highland') local.push('stone', 'iron', 'gems');
    if (s.biome === 'coast' || s.biome === 'marsh') local.push('food', 'cloth');
    if (s.biome === 'desert' || s.biome === 'badlands') local.push('gems', 'dust');
    local.push('food', 'wood');
    const scale = s.kind === 'town' ? 2.2 : s.kind === 'village' ? 1.2 : 0.6;
    for (const res of new Set(local)) stock[res] = Math.round((18 + s.tier * 10) * scale * rng.float(0.6, 1.5));
    if (s.kind === 'town') { stock.potion = rng.int(2, 8); stock.gear = rng.int(1, 5); }
    return stock;
  }

  // --- queries --------------------------------------------------------------
  sitesOfKind(kind) { return this.sites.filter(s => s.kind === kind); }
  discovered() { return this.sites.filter(s => s.discovered); }
  nearest(kindPred, x, y) {
    let best = null, bd = Infinity;
    for (const s of this.sites) {
      if (!kindPred(s)) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  /** Travel cost in ticks between two sites, following terrain difficulty. */
  travelTicks(a, b, speed = 1) {
    const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)));
    let cost = 0;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(lerp(a.x, b.x, i / steps));
      const y = Math.round(lerp(a.y, b.y, i / steps));
      cost += this.onRoad(x, y) ? 0.6 : BIOMES[this.biomeAt(x, y)].move;
    }
    return Math.max(40, Math.round(cost * 13 / clamp(speed, 0.4, 3)));
  }
  /** Reveal sites within a radius — used by scouting and returning parties. */
  reveal(x, y, radius) {
    const found = [];
    for (const s of this.sites) {
      if (s.discovered) continue;
      if (Math.hypot(s.x - x, s.y - y) <= radius) { s.discovered = true; found.push(s); }
    }
    return found;
  }
}

export function siteSummary(s) {
  const K = SITE_KINDS[s.kind];
  return {
    id: s.id, kind: s.kind, kindName: K.name, name: s.name, biome: s.biome,
    biomeName: BIOMES[s.biome].name, tier: s.tier, dist: Math.round(s.dist),
    discovered: s.discovered, hostility: s.hostility ?? null,
    disposition: s.hostility != null ? dispositionOf(s.hostility).name : null,
  };
}
