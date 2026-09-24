// ============================================================================
// COLONY MAP: procedural cavern generation, tile queries, A* pathfinding.
// ============================================================================
import { RNG, clamp, lerp } from './rng.js';
import { BUILDINGS, FLOORS } from './data.js';

export const T = { ROCK: 0, DIRT: 1, GRASS: 2, SAND: 3, WATER: 4, CHASM: 5, RIFT: 6 };
export const TERRAIN = [
  { id: 'rock',  name: 'Stone',      solid: true,  mineable: true,  yield: { stone: 12 }, color: '#4a4a52', work: 110 },
  { id: 'dirt',  name: 'Dirt',       solid: false, mineable: false, color: '#5b4a38' },
  { id: 'grass', name: 'Moss',       solid: false, mineable: false, color: '#3f5a38' },
  { id: 'sand',  name: 'Gravel',     solid: false, mineable: false, color: '#5e5645' },
  { id: 'water', name: 'Water',      solid: true,  mineable: false, color: '#27415e' },
  { id: 'chasm', name: 'Chasm',      solid: true,  mineable: false, color: '#16161c' },
  { id: 'rift',  name: 'Rift Gate',  solid: true,  mineable: false, color: '#2a1238', rift: true },
];

// The Rift: one giant tear in the world, the only dungeon there is. It sits
// north of the map's centre with the camp pitched just south of its mouth, so
// every night's monsters have a short, readable road to the tents.
export const RIFT_RX = 5, RIFT_RY = 3;
export const FEATURES = {
  tree:     { name: 'Cavern Tree', work: 90,  yield: { wood: 14 },  solid: true,  color: '#4d7a3a', glyph: 'T' },
  fungus:   { name: 'Giant Fungus',work: 55,  yield: { food: 8, herbs: 2 }, solid: false, color: '#7ab08a', glyph: 'f' },
  herb:     { name: 'Herb Patch',  work: 40,  yield: { herbs: 6 },  solid: false, color: '#6fcf97', glyph: '*' },
  iron:     { name: 'Iron Vein',   work: 190, yield: { iron: 16, stone: 6 }, solid: true, inRock: true, color: '#9fa8b5', glyph: 'i' },
  gold:     { name: 'Gold Vein',   work: 230, yield: { gold: 14, stone: 4 }, solid: true, inRock: true, color: '#c9a13c', glyph: 'g' },
  gems:     { name: 'Gem Cluster', work: 260, yield: { gems: 10, stone: 4 }, solid: true, inRock: true, color: '#5ac3d8', glyph: 'G' },
  crystal:  { name: 'Arcane Node', work: 300, yield: { dust: 12, gems: 3 },  solid: true, inRock: true, color: '#a06ad0', glyph: 'A' },
  ruin:     { name: 'Old Masonry', work: 120, yield: { stone: 18, gold: 3 }, solid: true, color: '#6a6a72', glyph: 'n' },
  bones:    { name: 'Bone Pile',   work: 50,  yield: { relics: 1, food: 2 }, solid: false, color: '#b8b0a0', glyph: 'b' },
  // Rift props: what a floor's biome leaves lying about. They are opened, not
  // cut — the same harvest order, but the take is rolled when they break open
  // (floors.js propLoot), and a cage lets someone out.
  chest:    { name: 'Chest',       work: 45,  yield: { gold: 4 }, solid: true, prop: 'chest', skill: 'survival', loot: 1.0, color: '#a8773a' },
  hoard:    { name: 'Dragon Hoard',work: 120, yield: { gold: 30 }, solid: true, prop: 'hoard', skill: 'survival', loot: 3.0, color: '#e0b440' },
  cage:     { name: 'Cage',        work: 70,  yield: { iron: 3 }, solid: true, prop: 'cage', skill: 'smithing', prisoner: true, color: '#8a8f99' },
  rack:     { name: 'Weapon Rack', work: 40,  yield: { iron: 4, wood: 3 }, solid: true, prop: 'rack', skill: 'survival', gear: 0.35, color: '#7a5a3a' },
  nest:     { name: 'Nest',        work: 45,  yield: { leather: 4, food: 3 }, solid: false, prop: 'nest', skill: 'survival', loot: 0.4, color: '#8a7a50' },
  remains:  { name: 'Remains',     work: 30,  yield: { cloth: 2 }, solid: false, prop: 'remains', skill: 'survival', loot: 0.5, gear: 0.2, color: '#b8b0a0' },
  sarcophagus: { name: 'Sarcophagus', work: 90, yield: { relics: 2, stone: 6 }, solid: true, prop: 'tomb', skill: 'faith', loot: 1.2, color: '#8f8a9a' },
  altar:    { name: 'Altar',       work: 60,  yield: { relics: 1, dust: 3 }, solid: true, prop: 'altar', skill: 'faith', blessing: true, glow: 2.5, color: '#b58cf0' },
  cart:     { name: 'Ore Cart',    work: 40,  yield: { iron: 10, stone: 8 }, solid: true, prop: 'cart', skill: 'mining', color: '#6a5a48' },
  cocoon:   { name: 'Cocoon',      work: 50,  yield: { cloth: 6 }, solid: true, prop: 'cocoon', skill: 'survival', loot: 0.4, prisoner: 0.3, color: '#e0dcd0' },
  wreck:    { name: 'Wreck',       work: 70,  yield: { wood: 12, cloth: 3 }, solid: true, prop: 'wreck', skill: 'survival', loot: 0.8, color: '#5a4630' },
  anvil:    { name: 'Rift Anvil',  work: 80,  yield: { iron: 8, gold: 2 }, solid: true, prop: 'anvil', skill: 'smithing', gear: 0.4, glow: 1.5, color: '#4a4a52' },
  frozen:   { name: 'Frozen Body', work: 60,  yield: { cloth: 2, leather: 2 }, solid: true, prop: 'frozen', skill: 'survival', loot: 0.6, gear: 0.3, color: '#9fd8f0' },
  bookcase: { name: 'Bookcase',    work: 50,  yield: { knowledge: 3, wood: 4 }, solid: true, prop: 'bookcase', skill: 'research', insight: 10, color: '#6a4a2a' },
  vault:    { name: 'Sealed Vault', work: 90, yield: { gold: 25 }, solid: true, prop: 'vault', skill: 'survival', loot: 3.0, gear: 1, locked: true, color: '#c9a23c' },
  cyst:     { name: 'Cyst',        work: 55,  yield: { dust: 4 }, solid: true, prop: 'cyst', skill: 'arcana', loot: 0.5, glow: 1.5, color: '#b06ad0' },
  riftvein: { name: 'Rift Vein',   work: 240, yield: { riftshard: 3, stone: 4 }, solid: true, inRock: true, glow: 1.4, color: '#d25a9a' },
  glowcap:  { name: 'Glowcap',     work: 35,  yield: { dust: 2, food: 2 }, solid: false, color: '#8ae0c0', glow: 1.2 },
};

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function valueNoise(rng, w, h, scale) {
  const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / scale, fy = y / scale;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1];
      const c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
    }
  }
  return out;
}

/** A building's footprint in tiles (most things are 1x1). */
export function footprintOf(id) {
  const sz = BUILDINGS[id] && BUILDINGS[id].size;
  return sz ? { w: sz[0], h: sz[1] } : { w: 1, h: 1 };
}
/** The footprint of `id` placed with the cursor on (x, y): the cursor sits in its middle. */
export function anchorFor(id, x, y) {
  const { w, h } = footprintOf(id);
  return { x: x - ((w - 1) >> 1), y: y - ((h - 1) >> 1), w, h };
}

// How the camp's own map looks in each region biome. `rock` is the noise level
// above which ground turns to stone (higher = less rock); `rim` walls the map
// edge with cliffs; `grass`/`sand` are the damp/dry cut-offs; `water` is how
// wet a low spot must be to pool; the rest are feature densities per tile.
export const CAMP_TERRAIN = {
  grassland: { rock: 0.80, rim: false, grass: 0.30, sand: 0.12, water: 0.80, trees: 0.030, herbs: 0.060, fungus: 0.010, outcrops: 3 },
  forest:    { rock: 0.78, rim: false, grass: 0.22, sand: 0.08, water: 0.82, trees: 0.200, herbs: 0.050, fungus: 0.020, outcrops: 3 },
  deepwood:  { rock: 0.74, rim: false, grass: 0.18, sand: 0.05, water: 0.80, trees: 0.300, herbs: 0.040, fungus: 0.060, outcrops: 3 },
  taiga:     { rock: 0.72, rim: false, grass: 0.35, sand: 0.10, water: 0.80, trees: 0.160, herbs: 0.020, fungus: 0.020, outcrops: 4 },
  tundra:    { rock: 0.70, rim: false, grass: 0.70, sand: 0.25, water: 0.84, trees: 0.010, herbs: 0.015, fungus: 0.010, outcrops: 4 },
  hills:     { rock: 0.66, rim: false, grass: 0.40, sand: 0.14, water: 0.84, trees: 0.060, herbs: 0.040, fungus: 0.020, outcrops: 2 },
  highland:  { rock: 0.62, rim: true,  grass: 0.50, sand: 0.18, water: 0.86, trees: 0.040, herbs: 0.030, fungus: 0.020, outcrops: 1 },
  mountain:  { rock: 0.56, rim: true,  grass: 0.55, sand: 0.22, water: 0.78, trees: 0.085, herbs: 0.050, fungus: 0.035, outcrops: 0 },
  marsh:     { rock: 0.86, rim: false, grass: 0.25, sand: 0.05, water: 0.52, trees: 0.050, herbs: 0.080, fungus: 0.050, outcrops: 3 },
  coast:     { rock: 0.82, rim: false, grass: 0.45, sand: 0.40, water: 0.66, trees: 0.030, herbs: 0.030, fungus: 0.010, outcrops: 3, shore: true },
  ocean:     { rock: 0.82, rim: false, grass: 0.45, sand: 0.40, water: 0.66, trees: 0.030, herbs: 0.030, fungus: 0.010, outcrops: 3, shore: true },
  desert:    { rock: 0.76, rim: false, grass: 0.93, sand: 0.60, water: 0.96, trees: 0.004, herbs: 0.010, fungus: 0.004, outcrops: 3 },
  badlands:  { rock: 0.64, rim: false, grass: 0.88, sand: 0.42, water: 0.95, trees: 0.006, herbs: 0.010, fungus: 0.010, outcrops: 2 },
  ashland:   { rock: 0.64, rim: false, grass: 0.95, sand: 0.30, water: 0.97, trees: 0.000, herbs: 0.005, fungus: 0.060, outcrops: 2 },
};
const CAMP_DEFAULT = CAMP_TERRAIN.mountain;   // the old underground-ish look

export class World {
  constructor(seed, w = 72, h = 50, opts = {}) {
    this.w = w; this.h = h;
    this.biome = opts.biome || null;
    this.rng = new RNG(seed);
    const n = w * h;
    this.terrain = new Uint8Array(n);
    this.feature = new Array(n).fill(null);
    this.building = new Array(n).fill(null);   // { id, hp, done, workLeft, ... }
    this.floor = new Array(n).fill(null);      // { id, done, workLeft } — a layer under buildings
    this.reserved = new Int32Array(n).fill(0); // npc id that claimed this tile
    this.designation = new Array(n).fill(null);// 'mine' | 'chop' | {build:id}
    this.light = new Float32Array(n);
    this.beauty = new Float32Array(n);
    this._bcVersion = 1; this._bcBuilt = 0; this._bc = {}; this._bcAll = [];
    this._regions = new Int32Array(n).fill(-1); this._regDirty = true;
    this._terrainStamp = 0;
    // A Rift floor is carved by floors.js onto a blank, all-rock map.
    if (opts.blank) { this.rift = null; this.start = { x: w >> 1, y: h >> 1 }; }
    else this.generate();
  }
  idx(x, y) { return y * this.w + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  generate() {
    const { w, h, rng } = this;
    const P = this.terrainProfile();
    const base = valueNoise(rng, w, h, 9);
    const detail = valueNoise(rng, w, h, 4);
    const damp = valueNoise(rng, w, h, 14);
    // A coastal camp has the sea along one side of its map.
    const shoreSide = P.shore ? rng.int(0, 3) : -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = this.idx(x, y);
        const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
        // Only rugged country is walled in by cliffs; open land runs off the map.
        const edgeBias = P.rim && edge < 3 ? 1 : 0;
        const v = base[i] * 0.62 + detail[i] * 0.38 + edgeBias;
        const shore = shoreSide < 0 ? 99 : [y, h - 1 - y, x, w - 1 - x][shoreSide];
        let t;
        if (shore < 3 + detail[i] * 4) t = T.WATER;
        else if (shore < 6 + detail[i] * 4) t = T.SAND;
        else if (v > P.rock) t = T.ROCK;
        else if (damp[i] > P.water && v < 0.40 + (P.water < 0.6 ? 0.15 : 0)) t = T.WATER;
        else if (damp[i] > P.grass) t = T.GRASS;
        else if (v < P.sand || (P.sand > 0.35 && damp[i] < P.sand * 0.7)) t = T.SAND;
        else t = T.DIRT;
        this.terrain[i] = t;
      }
    }
    // Open country still needs stone to quarry and ore to mine: a few outcrops.
    for (let k = 0; k < P.outcrops; k++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(13, 22);
      const ox = clamp(Math.round(w / 2 + Math.cos(a) * d * 1.3), 4, w - 5);
      const oy = clamp(Math.round(h / 2 + Math.sin(a) * d), 4, h - 5);
      const r = rng.int(2, 4);
      for (let y = oy - r - 1; y <= oy + r + 1; y++) for (let x = ox - r - 1; x <= ox + r + 1; x++) {
        if (this.inside(x, y) && Math.hypot(x - ox, y - oy) + rng.float(-0.8, 0.8) <= r) this.terrain[this.idx(x, y)] = T.ROCK;
      }
    }
    // The Rift first, then the camp outside its mouth.
    const rcx = Math.floor(w / 2), rcy = Math.floor(h / 2) - 6;
    this.rift = { x: rcx, y: rcy, rx: RIFT_RX, ry: RIFT_RY };
    this.start = { x: rcx, y: rcy + RIFT_RY + 8 };
    this.carveBlob(rcx, rcy, RIFT_RX + 3, 1);
    this.carveCorridor(rcx, rcy + RIFT_RY + 1, this.start.x, this.start.y, 2);
    // Carve the camp clearing: a blobby open area south of the Rift.
    this.carveBlob(this.start.x, this.start.y, 9, 3);
    for (let k = 0; k < 5; k++) {
      const ax = clamp(this.start.x + rng.int(-14, 14), 4, w - 5);
      const ay = clamp(this.start.y + rng.int(-10, 10), 4, h - 5);
      this.carveBlob(ax, ay, rng.int(4, 8), 2);
      this.carveCorridor(this.start.x, this.start.y, ax, ay, rng.int(1, 2));
    }
    // A few deep chasms for flavour and pathing pressure
    for (let k = 0; k < rng.int(2, 5); k++) {
      const cx = rng.int(5, w - 6), cy = rng.int(5, h - 6);
      const len = rng.int(5, 14);
      let x = cx, y = cy;
      for (let s = 0; s < len; s++) {
        if (this.inside(x, y) && Math.hypot(x - this.start.x, y - this.start.y) > 12
          && Math.hypot(x - this.rift.x, y - this.rift.y) > RIFT_RX + 5) this.terrain[this.idx(x, y)] = T.CHASM;
        x += rng.int(-1, 1); y += rng.int(-1, 1);
      }
    }
    this.placeFeatures();
    this.stampRift();
    this.recomputeLight();
  }

  /** Lay the Rift's tiles and the ring of open ground its spawn pours onto. */
  stampRift() {
    const { x: cx, y: cy, rx, ry } = this.rift;
    const ring = [];
    for (let y = cy - ry - 2; y <= cy + ry + 2; y++) for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
      if (!this.inside(x, y)) continue;
      const i = this.idx(x, y);
      const d = ((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2;
      if (d <= 1) { this.terrain[i] = T.RIFT; this.feature[i] = null; }
      else if (d <= 2.1) {
        if (TERRAIN[this.terrain[i]].solid) this.terrain[i] = T.DIRT;
        this.feature[i] = null;
        ring.push([x, y]);
      }
    }
    this.rift.ring = ring;
    // The mouth faces the camp; parties go in and monsters come out here.
    this.rift.mouth = { x: cx, y: cy + ry + 1 };
  }
  isRift(x, y) { return this.inside(x, y) && this.terrain[this.idx(x, y)] === T.RIFT; }

  carveBlob(cx, cy, r, soft) {
    const { rng } = this;
    for (let y = cy - r - 2; y <= cy + r + 2; y++) {
      for (let x = cx - r - 2; x <= cx + r + 2; x++) {
        if (!this.inside(x, y)) continue;
        if (x < 2 || y < 2 || x > this.w - 3 || y > this.h - 3) continue;
        const d = Math.hypot(x - cx, y - cy) + rng.float(-soft, soft);
        if (d <= r) {
          const i = this.idx(x, y);
          this.terrain[i] = rng.chance(0.25) ? T.GRASS : T.DIRT;
          this.feature[i] = null;
        }
      }
    }
  }
  carveCorridor(x0, y0, x1, y1, width) {
    let x = x0, y = y0, guard = 0;
    while ((x !== x1 || y !== y1) && guard++ < 500) {
      if (x !== x1 && (y === y1 || this.rng.chance(0.5))) x += Math.sign(x1 - x);
      else y += Math.sign(y1 - y);
      for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!this.inside(nx, ny) || nx < 2 || ny < 2 || nx > this.w - 3 || ny > this.h - 3) continue;
        const i = this.idx(nx, ny);
        if (this.terrain[i] !== T.CHASM) { this.terrain[i] = T.DIRT; this.feature[i] = null; }
      }
    }
  }

  /** The camp terrain profile for this map's biome (the old look if it has none). */
  terrainProfile() { return CAMP_TERRAIN[this.biome] || CAMP_DEFAULT; }

  placeFeatures() {
    const { w, h, rng } = this;
    const P = this.terrainProfile();
    const oreNoise = valueNoise(rng, w, h, 6);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = this.idx(x, y);
        const t = this.terrain[i];
        const distStart = Math.hypot(x - this.start.x, y - this.start.y);
        if (t === T.ROCK) {
          const depth = clamp(distStart / (w * 0.5), 0, 1);
          const o = oreNoise[i];
          if (o > 0.86 && rng.chance(0.42)) this.feature[i] = 'iron';
          else if (o > 0.90 && rng.chance(0.22 + depth * 0.2)) this.feature[i] = 'gold';
          else if (o < 0.10 && rng.chance(0.18 + depth * 0.25)) this.feature[i] = 'gems';
          else if (o < 0.055 && rng.chance(0.12 + depth * 0.3)) this.feature[i] = 'crystal';
        } else if (!TERRAIN[t].solid) {
          if (t === T.GRASS && rng.chance(P.trees)) this.feature[i] = 'tree';
          else if (t === T.DIRT && rng.chance(P.trees * 0.35)) this.feature[i] = 'tree';
          else if (t === T.GRASS && rng.chance(P.herbs)) this.feature[i] = 'herb';
          else if (t === T.DIRT && rng.chance(P.fungus)) this.feature[i] = 'fungus';
          else if (rng.chance(0.006)) this.feature[i] = 'bones';
          else if (rng.chance(0.004) && distStart > 10) this.feature[i] = 'ruin';
        }
      }
    }
    // Guarantee the player can start: clear the immediate hall, seed nearby wood/ore.
    for (let dy = -4; dy <= 4; dy++) for (let dx = -5; dx <= 5; dx++) {
      const x = this.start.x + dx, y = this.start.y + dy;
      if (this.inside(x, y)) { const i = this.idx(x, y); if (TERRAIN[this.terrain[i]].solid) this.terrain[i] = T.DIRT; this.feature[i] = null; }
    }
    this.ensureNear('tree', 10, 14);
    this.ensureNear('iron', 6, 18);
    this.ensureNear('fungus', 8, 12);
    this.ensureNear('gems', 4, 20);
    this.ensureNear('crystal', 3, 22);
  }
  ensureNear(feat, count, radius) {
    const { rng } = this;
    let have = 0;
    for (let y = this.start.y - radius; y <= this.start.y + radius; y++)
      for (let x = this.start.x - radius; x <= this.start.x + radius; x++)
        if (this.inside(x, y) && this.feature[this.idx(x, y)] === feat) have++;
    let guard = 0;
    const wantSolid = !!FEATURES[feat].inRock;
    while (have < count && guard++ < 900) {
      const x = clamp(this.start.x + rng.int(-radius, radius), 2, this.w - 3);
      const y = clamp(this.start.y + rng.int(-radius, radius), 2, this.h - 3);
      const i = this.idx(x, y);
      if (Math.hypot(x - this.start.x, y - this.start.y) < 6) continue;
      const solid = TERRAIN[this.terrain[i]].solid;
      if (this.terrain[i] === T.CHASM || this.terrain[i] === T.WATER) continue;
      if (wantSolid !== solid) continue;
      if (this.feature[i]) continue;
      this.feature[i] = feat; have++;
    }
  }

  // --- queries --------------------------------------------------------------
  solidAt(x, y) {
    if (!this.inside(x, y)) return true;
    const i = this.idx(x, y);
    if (TERRAIN[this.terrain[i]].solid) return true;
    const f = this.feature[i];
    if (f && FEATURES[f].solid) return true;
    const b = this.building[i];
    if (b && b.done) {
      // A walled building is solid all round except for its door.
      if (b.fp && BUILDINGS[b.id].walled) { const d = this.doorOf(b); return !(d.x === x && d.y === y); }
      if (BUILDINGS[b.id].solid) return true;
    }
    return false;
  }

  // --- multi-tile buildings -----------------------------------------------------
  // A building bigger than 1x1 is ONE record shared by every tile it covers,
  // with `fp: [x, y, w, h]` naming its footprint. Anything that counts or
  // indexes buildings takes only the anchor (top-left) tile; anything that asks
  // "what's on this tile" gets the whole building from any of them.
  isAnchor(b, i) { return !b.fp || i === b.fp[1] * this.w + b.fp[0]; }
  /** The door of a walled building: the middle of its front (south) wall. */
  doorOf(b) { const [x, y, fw, fh] = b.fp; return { x: x + (fw >> 1), y: y + fh - 1 }; }
  /** Where a building is worked or visited from: its door, the middle of a yard, or its only tile. */
  useTile(b, i) {
    if (!b.fp) return { x: i % this.w, y: (i / this.w) | 0 };
    if (BUILDINGS[b.id].walled) return this.doorOf(b);
    const [x, y, fw, fh] = b.fp;
    return { x: x + (fw >> 1), y: y + (fh >> 1) };
  }
  /** Every tile index a building covers (`i`: any one of them). */
  tilesOf(b, i) {
    if (!b.fp) return [i];
    const [x0, y0, fw, fh] = b.fp, out = [];
    for (let y = y0; y < y0 + fh; y++) for (let x = x0; x < x0 + fw; x++) if (this.inside(x, y)) out.push(this.idx(x, y));
    return out;
  }
  /** Can a building of `id` go down with the cursor on (x, y)? Checks its whole footprint. */
  canPlace(id, x, y) {
    const a = anchorFor(id, x, y);
    for (let yy = a.y; yy < a.y + a.h; yy++) for (let xx = a.x; xx < a.x + a.w; xx++) {
      if (!this.inside(xx, yy)) return false;
      if (a.w * a.h > 1 && (xx < 1 || yy < 1 || xx > this.w - 2 || yy > this.h - 2)) return false;
      const i = this.idx(xx, yy);
      if (this.building[i]) return false;
      if (TERRAIN[this.terrain[i]].solid || this.terrain[i] === T.WATER || this.terrain[i] === T.RIFT) {
        if (a.w * a.h > 1 || TERRAIN[this.terrain[i]].solid) return false;
      }
      const f = this.feature[i];
      if (f && (FEATURES[f].solid || a.w * a.h > 1)) return false;
    }
    return true;
  }
  /** Put a building record down over its footprint (the cursor on (x, y)). */
  putBuilding(id, x, y, rec) {
    const a = anchorFor(id, x, y);
    if (a.w * a.h > 1) rec.fp = [a.x, a.y, a.w, a.h];
    for (let yy = a.y; yy < a.y + a.h; yy++) for (let xx = a.x; xx < a.x + a.w; xx++) this.building[this.idx(xx, yy)] = rec;
    this.touch();
    return rec;
  }
  /** Take away whatever building covers (x, y), all of it. Returns it. */
  removeBuilding(x, y) {
    if (!this.inside(x, y)) return null;
    const i = this.idx(x, y), b = this.building[i];
    if (!b) return null;
    for (const j of this.tilesOf(b, i)) if (this.building[j] === b) this.building[j] = null;
    this.touch();
    return b;
  }
  walkable(x, y) { return !this.solidAt(x, y); }
  moveCost(x, y) {
    const i = this.idx(x, y);
    const b = this.building[i];
    let c = 1;
    const f = this.floor[i];
    if (f && f.done) c -= FLOORS[f.id].speed;
    if (this.terrain[i] === T.SAND) c += 0.15;
    if (b && b.done && BUILDINGS[b.id].id === 'door') c += 0.2;
    return Math.max(0.4, c);
  }
  buildingAt(x, y) { return this.inside(x, y) ? this.building[this.idx(x, y)] : null; }
  // Any mutation of the building layer must call touch(); the index below is
  // read many times per tick and rebuilding it blindly dominated the profile.
  touch() { this._bcVersion++; this._regDirty = true; }
  // Connected components over walkable tiles. Lets pathfinding reject an
  // unreachable goal in O(1) instead of exhausting the whole search budget —
  // this was 76% of simulation time before it existed.
  _computeRegions() {
    const w = this.w, h = this.h, n = w * h;
    const reg = this._regions;
    reg.fill(-1);
    // Walkability once per tile: the fill below asks up to ~24 times per tile,
    // which on open country (grassland, desert) made this the top of the profile.
    const open = this._open && this._open.length === n ? this._open : (this._open = new Uint8Array(n));
    for (let i = 0, y = 0; y < h; y++) for (let x = 0; x < w; x++, i++) open[i] = this.walkable(x, y) ? 1 : 0;
    let label = 0;
    const stack = new Int32Array(n);
    for (let start = 0; start < n; start++) {
      if (reg[start] !== -1) continue;
      if (!open[start]) { reg[start] = -2; continue; }
      let sp = 0;
      stack[sp++] = start; reg[start] = label;
      while (sp > 0) {
        const cur = stack[--sp];
        const cx = cur % w, cy = (cur / w) | 0;
        for (let d = 0; d < 8; d++) {
          const dx = DIRS[d][0], dy = DIRS[d][1];
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!open[ni]) { if (reg[ni] === -1) reg[ni] = -2; continue; }
          // Match the pathfinder exactly: a diagonal step needs both of its
          // orthogonal neighbours open, or A* will refuse the squeeze.
          if (dx && dy && (!open[cy * w + nx] || !open[ny * w + cx])) continue;
          if (reg[ni] !== -1) continue;
          reg[ni] = label; stack[sp++] = ni;
        }
      }
      label++;
    }
    this._regDirty = false;
    this.regionCount = label;
  }
  regionAt(x, y) {
    if (this._regDirty) this._computeRegions();
    if (!this.inside(x, y)) return -2;
    return this._regions[this.idx(x, y)];
  }
  /** Can (sx,sy) reach (tx,ty), or a tile beside it when `adjacent`? */
  reachable(sx, sy, tx, ty, adjacent) {
    const from = this.regionAt(sx, sy);
    if (from < 0) return false;
    if (!adjacent) return this.regionAt(tx, ty) === from;
    for (const [dx, dy] of DIRS) if (this.regionAt(tx + dx, ty + dy) === from) return true;
    return false;
  }
  _rebuildIndex() {
    this._bc = {}; this._bcAll = [];
    for (let i = 0; i < this.building.length; i++) {
      const b = this.building[i];
      if (!b || !b.done || !this.isAnchor(b, i)) continue;
      const u = this.useTile(b, i);
      const rec = { b, x: u.x, y: u.y };
      this._bcAll.push(rec);
      (this._bc[b.id] || (this._bc[b.id] = [])).push(rec);
    }
    this._bcBuilt = this._bcVersion;
  }
  findBuildings(id) {
    if (this._bcBuilt !== this._bcVersion) this._rebuildIndex();
    return id ? (this._bc[id] || []) : this._bcAll;
  }

  recomputeLight() {
    this.light.fill(0);
    this.beauty.fill(0);
    // Floors add their own beauty to just the tile they cover — what you're
    // standing on, not a decoration radiating out over a room.
    for (let i = 0; i < this.floor.length; i++) {
      const f = this.floor[i];
      if (f && f.done) this.beauty[i] += FLOORS[f.id].beauty;
    }
    const sources = [];
    for (let i = 0; i < this.building.length; i++) {
      const b = this.building[i];
      if (!b || !b.done || !this.isAnchor(b, i)) continue;
      const def = BUILDINGS[b.id];
      const u = this.useTile(b, i);
      if (def.light) sources.push({ x: u.x, y: u.y, r: def.light });
      if (def.beauty) {
        const bx = u.x, by = u.y, r = Math.ceil(Math.sqrt(def.beauty) + 2);
        for (let y = by - r; y <= by + r; y++) for (let x = bx - r; x <= bx + r; x++) {
          if (!this.inside(x, y)) continue;
          const d = Math.hypot(x - bx, y - by);
          if (d <= r) this.beauty[this.idx(x, y)] += def.beauty * (1 - d / (r + 1));
        }
      }
    }
    for (const s of sources) {
      for (let y = s.y - s.r; y <= s.y + s.r; y++) for (let x = s.x - s.r; x <= s.x + s.r; x++) {
        if (!this.inside(x, y)) continue;
        const d = Math.hypot(x - s.x, y - s.y);
        if (d <= s.r) this.light[this.idx(x, y)] = Math.max(this.light[this.idx(x, y)], 1 - d / (s.r + 0.5));
      }
    }
  }

  // Is this tile inside an enclosed, roofed room? Cheap flood with a cap.
  enclosed(x, y, cap = 90) {
    if (!this.walkable(x, y)) return false;
    const seen = new Set([this.idx(x, y)]);
    const q = [[x, y]];
    let n = 0;
    while (q.length) {
      const [cx, cy] = q.pop();
      if (++n > cap) return false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inside(nx, ny)) return false;
        if (!this.walkable(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (seen.has(ni)) continue;
        seen.add(ni); q.push([nx, ny]);
      }
    }
    return true;
  }
}

// --- A* ---------------------------------------------------------------------
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v, p) { this.a.push({ v, p }); let i = this.a.length - 1; while (i > 0) { const par = (i - 1) >> 1; if (this.a[par].p <= this.a[i].p) break; const t = this.a[par]; this.a[par] = this.a[i]; this.a[i] = t; i = par; } }
  pop() {
    const top = this.a[0], last = this.a.pop();
    if (this.a.length) { this.a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let s = i; if (l < this.a.length && this.a[l].p < this.a[s].p) s = l; if (r < this.a.length && this.a[r].p < this.a[s].p) s = r; if (s === i) break; const t = this.a[s]; this.a[s] = this.a[i]; this.a[i] = t; i = s; } }
    return top.v;
  }
}

/**
 * A* path from (sx,sy) to (tx,ty). If `adjacent` is true the goal is any tile
 * orthogonally/diagonally next to the target (for mining, building, etc.).
 * Returns an array of [x,y] steps excluding the start, or null.
 * `avoid` (anything with `.has(tileIndex)`, e.g. the occupancy map) marks tiles
 * to route around — other bodies — without treating them as walls for good.
 */
/** Can (ax, ay) see (bx, by)? Walls and solid features block the view; bodies don't. */
export function lineOfSight(w, ax, ay, bx, by) {
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 80; guard++) {
    if (x === bx && y === by) return true;
    if ((x !== ax || y !== ay) && !w.walkable(x, y) && TERRAIN[w.terrain[w.idx(x, y)]].id !== 'water') return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return false;
}

export function findPath(world, sx, sy, tx, ty, adjacent = false, maxNodes = 4000, avoid = null) {
  if (!world.inside(tx, ty)) return null;
  if (!world.reachable(sx, sy, tx, ty, adjacent)) return null;
  if (sx === tx && sy === ty && !adjacent) return [];
  const goalTest = adjacent
    ? (x, y) => Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1 && !(x === tx && y === ty)
    : (x, y) => x === tx && y === ty;
  if (adjacent && goalTest(sx, sy)) return [];
  if (!adjacent && !world.walkable(tx, ty)) return null;
  const W = world.w;
  const open = new Heap();
  const g = new Map(), from = new Map();
  const start = sy * W + sx;
  g.set(start, 0);
  open.push(start, 0);
  let nodes = 0;
  while (open.size) {
    const cur = open.pop();
    const cx = cur % W, cy = (cur / W) | 0;
    if (goalTest(cx, cy)) {
      const path = [];
      let c = cur;
      while (c !== start) { path.push([c % W, (c / W) | 0]); c = from.get(c); }
      path.reverse();
      return path;
    }
    if (++nodes > maxNodes) break;
    const gc = g.get(cur);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!world.inside(nx, ny) || !world.walkable(nx, ny)) continue;
      if (dx && dy && (!world.walkable(cx + dx, cy) || !world.walkable(cx, cy + dy))) continue; // no corner cutting
      const ni = ny * W + nx;
      // Bodies block the way; an exact goal may be occupied (someone's on it), but
      // when any side of the target will do, a taken side isn't one of them.
      if (avoid && avoid.has(ni) && (adjacent || !goalTest(nx, ny))) continue;
      const step = world.moveCost(nx, ny) * (dx && dy ? 1.414 : 1);
      const ng = gc + step;
      if (g.has(ni) && g.get(ni) <= ng) continue;
      g.set(ni, ng); from.set(ni, cur);
      const hx = Math.abs(nx - tx), hy = Math.abs(ny - ty);
      const hcost = (hx + hy) + (1.414 - 2) * Math.min(hx, hy);
      open.push(ni, ng + hcost * 1.03);
    }
  }
  return null;
}

/** Nearest reachable tile satisfying pred, searched by BFS ring from origin. */
export function findNearest(world, sx, sy, pred, maxR = 40) {
  let best = null, bestD = Infinity;
  for (let r = 1; r <= maxR; r++) {
    if (best && bestD < r - 1) break;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sx + dx, y = sy + dy;
        if (!world.inside(x, y)) continue;
        if (!pred(x, y, world.idx(x, y))) continue;
        const d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; best = [x, y]; }
      }
    }
  }
  return best;
}
