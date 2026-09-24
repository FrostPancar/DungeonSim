// ============================================================================
// FARMING
// Crops with seasons, soil fertility, water and growth stages. A field is a
// standing decision (what to plant, when) rather than a single float, and the
// surrounding overworld biome decides what will actually thrive here.
// ============================================================================
import { clamp } from './rng.js';
import { BIOMES } from './overworld.js';

export const SEASONS = [
  { id: 'spring', name: 'Spring', temp: 0.55, growth: 1.15, forage: 1.1 },
  { id: 'summer', name: 'Summer', temp: 0.85, growth: 1.30, forage: 1.25 },
  { id: 'autumn', name: 'Autumn', temp: 0.50, growth: 0.95, forage: 0.9 },
  { id: 'winter', name: 'Winter', temp: 0.15, growth: 0.35, forage: 0.4 },
];
export const DAYS_PER_SEASON = 15;
export const DAYS_PER_YEAR = SEASONS.length * DAYS_PER_SEASON;

// growDays at ideal conditions; soil/water are requirements, not bonuses.
// `indoor` crops ignore season and light — the underground staple.
export const CROPS = {
  cavecap:   { name: 'Cave Cap',     product: 'food',    yield: 8,  growDays: 3.0, soil: 0.15, water: 0.25, temp: [0.00, 1.00], indoor: true,  seed: { food: 2 },            desc: 'Fungus. Grows anywhere, all year, badly.' },
  tubers:    { name: 'Tubers',       product: 'food',    yield: 17, growDays: 3.4, soil: 0.35, water: 0.40, temp: [0.20, 0.80], seasons: [0, 1, 2],  seed: { food: 3 },     desc: 'Hardy staple. Tolerates poor soil and cold.' },
  grain:     { name: 'Grain',        product: 'food',    yield: 26, growDays: 4.6, soil: 0.60, water: 0.50, temp: [0.35, 1.00], seasons: [0, 1],     seed: { food: 5 },     desc: 'Best yield per tile, but needs good ground.' },
  beans:     { name: 'Beans',        product: 'food',    yield: 15, growDays: 3.0, soil: 0.35, water: 0.45, temp: [0.30, 0.85], seasons: [0, 1, 2],  seed: { food: 3 }, fixes: 0.05, desc: 'Modest yield; restores the soil it grows in.' },
  greens:    { name: 'Greens',       product: 'food',    yield: 12, growDays: 2.0, soil: 0.45, water: 0.65, temp: [0.25, 0.70], seasons: [0, 2],     seed: { food: 2 },     desc: 'Fast and thirsty. Good in a cold snap.' },
  cotton:    { name: 'Cotton',       product: 'cloth',   yield: 13, growDays: 5.0, soil: 0.55, water: 0.55, temp: [0.55, 1.00], seasons: [1],        seed: { cloth: 2 },    desc: 'Summer only. The colony\'s cloth supply.' },
  flax:      { name: 'Flax',         product: 'cloth',   yield: 9,  growDays: 3.6, soil: 0.45, water: 0.50, temp: [0.30, 0.75], seasons: [0, 2],     seed: { cloth: 2 },    desc: 'Cooler-weather cloth. Lower yield than cotton.' },
  healroot:  { name: 'Healroot',     product: 'herbs',   yield: 10, growDays: 4.2, soil: 0.50, water: 0.60, temp: [0.30, 0.80], seasons: [0, 1, 2],  seed: { herbs: 2 },    desc: 'Medicine and potions.' },
  glowspore: { name: 'Glowspore',    product: 'dust',    yield: 6,  growDays: 6.5, soil: 0.25, water: 0.35, temp: [0.00, 1.00], indoor: true,  seed: { dust: 2 },          desc: 'Slow arcane fungus. A renewable dust supply.' },
  bitterleaf:{ name: 'Bitterleaf',   product: 'food',    yield: 12, growDays: 3.2, soil: 0.20, water: 0.20, temp: [0.60, 1.00], seasons: [1, 2],     seed: { food: 3 },     desc: 'Drought crop. Thrives where nothing else will.' },
  frostgrain:{ name: 'Frostgrain',   product: 'food',    yield: 16, growDays: 4.0, soil: 0.40, water: 0.35, temp: [0.00, 0.45], seasons: [2, 3],     seed: { food: 4 },     desc: 'The only thing that grows through winter.' },
};
export const CROP_IDS = Object.keys(CROPS);

// Which crops a biome favours — a +yield bonus, not a hard gate.
export const BIOME_CROPS = {
  grassland: ['grain', 'beans', 'flax', 'cotton'],
  forest:    ['tubers', 'greens', 'healroot'],
  deepwood:  ['healroot', 'cavecap', 'glowspore'],
  marsh:     ['greens', 'tubers', 'healroot'],
  coast:     ['flax', 'greens', 'beans'],
  hills:     ['tubers', 'beans', 'grain'],
  highland:  ['tubers', 'frostgrain'],
  mountain:  ['cavecap', 'glowspore'],
  taiga:     ['frostgrain', 'tubers'],
  tundra:    ['frostgrain', 'cavecap'],
  desert:    ['bitterleaf', 'cotton'],
  badlands:  ['bitterleaf', 'glowspore'],
  ashland:   ['glowspore', 'cavecap'],
};

export function seasonOf(day) { return Math.floor(((day - 1) / DAYS_PER_SEASON) % SEASONS.length); }
export function yearOf(day) { return Math.floor((day - 1) / DAYS_PER_YEAR) + 1; }

/**
 * How well a crop does right now, 0 = will not grow.
 * Combines season window, temperature band, soil fertility and water.
 */
export function cropViability(crop, { season, soil, water, biome }) {
  const C = CROPS[crop];
  if (!C) return 0;
  if (C.indoor) {
    // Fungus ignores weather but still wants damp, workable ground.
    const s = clamp(soil / Math.max(0.05, C.soil), 0, 1);
    const w = clamp(water / Math.max(0.05, C.water), 0, 1);
    return clamp(Math.min(s, w) * 0.95 * ((BIOME_CROPS[biome] || []).includes(crop) ? 1.18 : 1), 0, 1.25);
  }
  if (C.seasons && !C.seasons.includes(season)) return 0;
  // Local climate: a tundra summer is not a desert summer.
  const climate = (BIOMES[biome] && BIOMES[biome].temp) || 0;
  const temp = clamp(SEASONS[season].temp + climate, 0, 1);
  if (temp < C.temp[0] || temp > C.temp[1]) return 0;
  const mid = (C.temp[0] + C.temp[1]) / 2;
  const span = Math.max(0.12, (C.temp[1] - C.temp[0]) / 2);
  const tempFit = clamp(1 - Math.abs(temp - mid) / span * 0.55, 0.35, 1);
  const soilFit = clamp(soil / Math.max(0.05, C.soil), 0, 1);
  const waterFit = clamp(water / Math.max(0.05, C.water), 0, 1);
  const biomeBonus = (BIOME_CROPS[biome] || []).includes(crop) ? 1.18 : 1;
  return clamp(tempFit * soilFit * waterFit * biomeBonus, 0, 1.25);
}

/** Best crop for a tile right now — used by the planting UI and the autoplay. */
export function recommendCrop(ctx, unlocked = null) {
  let best = null, bestScore = -1;
  for (const id of CROP_IDS) {
    if (unlocked && !unlocked.has(id)) continue;
    const v = cropViability(id, ctx);
    if (v <= 0) continue;
    const score = v * CROPS[id].yield / CROPS[id].growDays;
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best;
}

export const GROWTH_STAGES = ['bare', 'sprouting', 'growing', 'maturing', 'ripe'];
export function growthStage(growth) {
  return clamp(Math.floor(growth * GROWTH_STAGES.length), 0, GROWTH_STAGES.length - 1);
}

// Soil is a real resource: harvesting drains it, beans and compost restore it.
export const SOIL_DRAIN = 0.055;
export const SOIL_REGEN = 0.0000085;

export function initSoil(world, biome) {
  const base = BIOMES[biome] ? BIOMES[biome].fertility : 0.5;
  const soil = new Float32Array(world.w * world.h);
  const water = new Float32Array(world.w * world.h);
  const bw = BIOMES[biome] ? BIOMES[biome].water : 0.5;
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    const i = world.idx(x, y);
    const t = world.terrain[i];
    // Terrain type modulates the biome's baseline fertility.
    let f = base;
    if (t === 2) f *= 1.25;          // moss
    else if (t === 1) f *= 1.05;     // dirt
    else if (t === 3) f *= 0.55;     // gravel
    else if (t === 0) f *= 0.35;     // stone
    const n = ((x * 31 + y * 17) % 13) / 13;
    soil[i] = clamp(f * (0.8 + n * 0.4), 0.05, 1);
    // Water falls off with distance from the nearest water tile.
    water[i] = clamp(bw * 0.55 + (0.2 + n * 0.2), 0.05, 1);
  }
  // Irrigation: tiles near water are much wetter.
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    if (world.terrain[world.idx(x, y)] !== 4) continue;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!world.inside(nx, ny)) continue;
      const d = Math.hypot(dx, dy);
      if (d > 4) continue;
      const i = world.idx(nx, ny);
      water[i] = clamp(Math.max(water[i], 1 - d / 5.5), 0, 1);
    }
  }
  world.soil = soil;
  world.water = water;
  return { soil, water };
}
