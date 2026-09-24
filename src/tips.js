// ============================================================================
// HOVER INSPECTORS. Every tooltip in the game is built here from live state,
// keyed by a short string ("res:food", "col:12", "bld:smithy", "tile:4,9"), so
// hovering anything — a resource, a portrait, a gizmo, a tech node, a thing on
// the map — answers "what is this and how is it doing?" without a click.
// Presentation only: it reads the game and never changes it.
// ============================================================================
import {
  BUILDINGS, FLOORS, RESOURCES, RESOURCE_SOURCES, RESOURCE_USES, RACES, CLASSES, SKILLS, SKILL_IDS, TRAITS, RESEARCH, RECIPES,
  THOUGHTS, ABILITIES, DUNGEON_THEMES, dispositionOf,
} from './data.js';
import { TERRAIN, FEATURES } from './world.js';
import { ANIMALS, isMature, beastPower, tameChance, BEAST_TRAITS, followersOf, PACK_PER_LOAD } from './husbandry.js';
import { CROPS, cropViability, growthStage, GROWTH_STAGES } from './farming.js';
import { SITE_KINDS, BIOMES } from './overworld.js';
import { PRICES } from './events.js';
import { powerOf } from './npc.js';
import { DAMAGE_TYPES, STATUSES, TAGS } from './elements.js';
import { FAMILIES, bestiaryKnowledge } from './monsters.js';
import { RARITIES, SLOT_ICONS, SLOT_NAMES, WEAPON_FAMILIES, WEIGHTS, PASSIVES, POTIONS } from './items.js';
import { CLASS_INFO } from './classes.js';
import { kw, kwList, traitSentiment, beastTraitSentiment } from './keywords.js';
import {
  RACE_ICON, ANIMAL_ICON, FEATURE_ICON, BUILDING_ICON, FLOOR_ICON, SITE_ICON, RESOURCE_ICON, CROP_ICON,
  TECH_ICON, taskIcon, moodStatus, levelStatus, STATUS, labourOf, LABOUR_BY_ID,
} from './icons.js';

const tEsc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tPct = (v) => Math.round(v * 100) + '%';
const tHead = (icon, title, sub) => `<div class="tt-h">${icon ? `<span class="tt-i">${icon}</span>` : ''}<span>${tEsc(title)}</span></div>${sub ? `<div class="tt-s">${sub}</div>` : ''}`;
const tRow = (k, v, color) => `<div class="tt-r"><span>${k}</span><b${color ? ` style="color:${color}"` : ''}>${v}</b></div>`;
const tBar = (label, frac, color, text) => `<div class="tt-b"><span>${label}</span><u><i style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%;background:${color}"></i></u><b>${text}</b></div>`;
const tDesc = (s) => `<div class="tt-d">${s}</div>`;
const tSep = '<div class="tt-sep"></div>';
const costStr = (cost, g) => Object.entries(cost).map(([k, v]) =>
  `<span style="color:${!g || (g.resources[k] || 0) >= v ? 'inherit' : STATUS.critical}">${RESOURCE_ICON[k] || ''}${v}</span>`).join(' ');

/** Days of eating the stores represent. Shared with the HUD. */
export function foodDaysOf(g) {
  const mouths = Math.max(1, g.colonists.filter(c => !c.away).length);
  const stock = (g.resources.food || 0) + (g.resources.meal || 0) * 2.5;
  return stock / (mouths * 4.5);
}

/** Build the tooltip body for a key. Returns '' when there is nothing to say. */
function abilityTip(id) {
  const a = ABILITIES[id];
  if (!a) return '';
  const dt = a.dmg && DAMAGE_TYPES[a.dmg];
  const shape = { single: 'one target', front: 'the front row', all: 'every enemy', self: 'self', ally: 'most wounded ally', party: 'whole party' }[a.shape] || a.shape;
  let html = tHead(dt ? dt.icon : '✨', a.name, `${a.kind} · ${shape}${a.range ? ' · ' + a.range : ''} · cooldown ${a.cd}`) + tDesc(tEsc(a.desc));
  if (dt) html += tRow('Damage', dt.name);
  if (a.spell) html += tRow('Spell', `${a.spell} — can be silenced`);
  if (a.windup) html += tRow('Telegraphed', `${a.windup} round windup — can be interrupted`);
  for (const [sid, ch] of a.apply || []) if (STATUSES[sid]) html += tRow(`${STATUSES[sid].icon} ${STATUSES[sid].name}`, `${Math.round(ch * 100)}% chance`);
  return html;
}

/** One line saying whether a trait helps or hurts, in the keyword colours. */
function tVerdict(sent) {
  const t = { good: 'Helps', bad: 'Hurts', mixed: 'A trade-off' }[sent] || '';
  return t ? `<div class="tt-l kw-${sent}-ink">${t}</div>` : '';
}

export function tipHtml(g, key) {
  const i = key.indexOf(':');
  const kind = i < 0 ? key : key.slice(0, i);
  const id = i < 0 ? '' : key.slice(i + 1);
  try {
    switch (kind) {
      case 'res': return tipResource(g, id);
      case 'col': return tipColonist(g, g.colonists.find(c => String(c.id) === id));
      case 'beast': return tipBeast(g, g.beasts.find(b => String(b.id) === id));
      case 'enemy': return tipEnemy(g, g.raiders.find(r => String(r.id) === id));
      case 'bld': return tipBuildingDef(g, id);
      case 'tile': { const [x, y] = id.split(',').map(Number); return tipTile(g, x, y); }
      case 'tech': return tipTech(g, id);
      case 'site': return tipSite(g, g.overworld.sites.find(s => String(s.id) === id));
      case 'rift': return tipRift(g);
      case 'stairs': return tipStairs(g, id);
      case 'trait': return TRAITS[id] ? tHead('', TRAITS[id].name) + tVerdict(traitSentiment(id)) + tDesc(tEsc(TRAITS[id].desc)) + traitMods(TRAITS[id].mods) : '';
      case 'btrait': return BEAST_TRAITS[id] ? tHead('', BEAST_TRAITS[id].name) + tVerdict(beastTraitSentiment(id)) + traitMods(BEAST_TRAITS[id].mods) : '';
      case 'skill': { const [cid, sk] = id.split('|'); return tipSkill(g, g.colonists.find(c => String(c.id) === cid), sk); }
      case 'arm': return tipItem(g.armory[+id]);
      case 'ti': return tipItem(TIP_ITEMS.get(+id));
      case 'eq': { const [cid, sl] = id.split(':'); const c = g.colonists.find(x => String(x.id) === cid); return c ? tipItem(c.equipment[sl]) : ''; }
      case 'potion': return POTIONS[id] ? tHead(POTIONS[id].icon, POTIONS[id].name, 'potion') + tDesc(tEsc(POTIONS[id].desc)) + tRow('Brew', Object.entries(POTIONS[id].cost).map(([k, v]) => v + ' ' + k).join(', ')) + tRow('In stock', g.potionCount(id)) : '';
      case 'crop': return tipCrop(g, id);
      case 'species': return tipSpecies(g, id);
      case 'ability': return abilityTip(id);
      case 'thought': return THOUGHTS[id] ? tHead(THOUGHTS[id].v > 0 ? '🙂' : '🙁', THOUGHTS[id].name) + tRow('Mood', (THOUGHTS[id].v > 0 ? '+' : '') + THOUGHTS[id].v, THOUGHTS[id].v > 0 ? STATUS.good : STATUS.critical) : '';
      default: return '';
    }
  } catch (e) { return ''; }
}

function traitMods(mods) {
  if (!mods) return '';
  const nice = {
    learn: 'Learning', mood: 'Mood', combat: 'Combat', luck: 'Luck', work: 'Work speed', move: 'Move speed',
    hp: 'Health', forage: 'Appetite', breed: 'Breeding', product: 'Yield', power: 'Power', tame: 'Tame difficulty',
  };
  return Object.entries(mods).map(([k, v]) => {
    const name = k.startsWith('skill.') ? (SKILLS[k.slice(6)] ? SKILLS[k.slice(6)].name : k) : (nice[k] || k);
    const val = Math.abs(v) < 1 && !k.startsWith('skill.') && k !== 'mood' ? `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` : `${v > 0 ? '+' : ''}${v}`;
    const bad = (k === 'tame' || k === 'forage') ? v > 0 : v < 0;
    return tRow(name, val, bad ? STATUS.bad : STATUS.good);
  }).join('');
}

// --- resources --------------------------------------------------------------
function tipResource(g, k) {
  const R = RESOURCES[k];
  if (!R) return '';
  const v = Math.floor(g.resources[k] || 0), cap = g.storageCap;
  let html = tHead(RESOURCE_ICON[k], R.name, `${R.cat} · worth ${PRICES[k] != null ? PRICES[k] + 'g' : '—'} each`);
  if (k === 'gold') html += tRow('Treasury', `${v} — gold has no storage limit`);
  else html += tBar('Stored', v / cap, v > cap ? STATUS.warn : R.color, `${v} / ${cap}`);
  if (v > cap && k !== 'gold') html += tDesc('Over the storage ceiling — new hauls are being lost. Build a 📦 Stockpile.');
  if (k === 'food' || k === 'meal') {
    const fd = foodDaysOf(g);
    html += tRow('Food lasts', `${fd >= 99 ? '99+' : fd.toFixed(1)} days`, fd > 6 ? STATUS.good : fd > 2.5 ? STATUS.warn : STATUS.critical);
  }
  const hist = g.history && g.history[k];
  if (hist && hist.length > 4) {
    const d = hist[hist.length - 1] - hist[Math.max(0, hist.length - 13)];
    html += tRow('Last day', `${d > 0 ? '▲ +' : d < 0 ? '▼ ' : '■ '}${d}`, d > 0 ? STATUS.good : d < 0 ? STATUS.bad : null);
  }
  // Where it comes from and where it goes — the two questions a stock raises.
  const from = [];
  for (const f in FEATURES) if (FEATURES[f].yield[k]) from.push(`${FEATURE_ICON[f] || ''} ${FEATURES[f].name}`);
  for (const r in RECIPES) if (RECIPES[r].outputs[k]) from.push(`⚒️ ${RECIPES[r].name}`);
  for (const c in CROPS) if (CROPS[c].product === k) from.push(`${CROP_ICON[c] || '🌱'} ${CROPS[c].name}`);
  for (const a in ANIMALS) if (ANIMALS[a].product && ANIMALS[a].product.res === k) from.push(`${ANIMAL_ICON[a]} ${ANIMALS[a].product.label}`);
  const into = [];
  for (const b in BUILDINGS) if (BUILDINGS[b].cost[k] && g.unlocked.has(b)) into.push(`${BUILDING_ICON[b] || '🧱'} ${BUILDINGS[b].name}`);
  for (const r in RECIPES) if (RECIPES[r].inputs[k]) into.push(`⚒️ ${RECIPES[r].name}`);
  // The curated lines lead; a derived one that says the same thing again goes.
  const merge = (curated, derived) => {
    const said = curated.join(' ').toLowerCase();
    return [...new Set([...curated, ...derived.filter(d => !said.includes(d.replace(/^\S+\s/, '').toLowerCase()))])];
  };
  from.splice(0, from.length, ...merge(RESOURCE_SOURCES[k] || [], from));
  into.splice(0, into.length, ...merge(RESOURCE_USES[k] || [], into));
  const locked = Object.keys(BUILDINGS).filter(b => BUILDINGS[b].cost[k] && !g.unlocked.has(b)).length;
  if (k === 'gold') {
    const last = (g.ledger && g.ledger.days || []).filter(d => d.net != null).slice(-3);
    if (last.length) {
      const avg = Math.round(last.reduce((a, d) => a + d.net, 0) / last.length);
      html += tRow('Per day', `${avg >= 0 ? '▲ +' : '▼ '}${avg} (last ${last.length} day${last.length > 1 ? 's' : ''})`, avg >= 0 ? STATUS.good : STATUS.bad);
    }
  }
  if (from.length) html += tSep + `<div class="tt-l"><em>Where from</em> ${from.slice(0, 7).join(' · ')}${from.length > 7 ? ' …' : ''}</div>`;
  else html += tSep + `<div class="tt-l"><em>Where from</em> —</div>`;
  if (into.length) html += `<div class="tt-l"><em>What for</em> ${into.slice(0, 7).join(' · ')}${into.length > 7 ? ' …' : ''}${locked ? ` · <span class="dim">+${locked} locked by research</span>` : ''}</div>`;
  return html;
}

// --- people -----------------------------------------------------------------
function tipColonist(g, c) {
  if (!c) return '';
  const m = moodStatus(c.mood);
  const disp = dispositionOf(c.hostility);
  let html = tHead(RACE_ICON[c.race] || '🧑', c.name.full,
    `${RACES[c.race].name} ${c.title || CLASSES[c.klass].name} · level ${c.level} · ⚔️ ${powerOf(c)}`);
  const foe = c.task && c.task.kind === 'fight' ? g.raiders.find(r => r.id === c.task.targetId) : null;
  const doing = c.away ? 'Away' : c.downed ? `Down — up again in ${Math.max(1, Math.ceil((c.downed.until - g.tick) / 60))}h`
    : foe ? `Fighting ${tEsc(foe.name.short)}` : tEsc(c.task ? c.task.kind : c.state);
  html += `<div class="tt-task">${taskIcon(c)} ${doing}${c.away || c.downed || foe ? '' : ` <span>· ${LABOUR_BY_ID[labourOf(c)].name}</span>`}</div>`;
  html += tBar('Mood', c.mood / 100, m.color, `${c.mood} ${m.icon}`);
  html += tBar('Health', c.hp / c.maxHp, levelStatus(c.hp / c.maxHp), `${Math.round(c.hp)}/${c.maxHp}`);
  html += tBar('Fed', c.needs.hunger, levelStatus(c.needs.hunger), tPct(c.needs.hunger));
  html += tBar('Stamina', c.needs.rest, levelStatus(c.needs.rest), tPct(c.needs.rest));
  html += tBar('Joy', c.needs.joy, levelStatus(c.needs.joy), tPct(c.needs.joy));
  const top = SKILL_IDS.map(s => [s, c.skills[s]]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  html += tSep + `<div class="tt-l"><em>Best at</em> ${top.map(([s, v]) => `${SKILLS[s].name} <b>${v}</b>${c.passions[s] === 'burning' ? '🔥' : ''}`).join(' · ')}</div>`;
  html += `<div class="tt-l"><em>Traits</em> ${kwList('trait', c.traits)}</div>`;
  const pets = followersOf(g.root || g, c);
  if (pets.length) html += `<div class="tt-l"><em>Beasts</em> ${pets.map(b => `${ANIMAL_ICON[b.species] || '🐾'} ${tEsc(b.name)}`).join(', ')}</div>`;
  html += `<div class="tt-l"><em>Loyalty</em> <span style="color:${disp.color}">${disp.name}</span>${c.injuries.length ? ` · <em>Injuries</em> ${c.injuries.length}` : ''}</div>`;
  return html;
}

function tipEnemy(g, r) {
  if (!r) return '';
  const best = g.colonists.filter(c => !c.away).reduce((m, c) => Math.max(m, powerOf(c)), 0);
  let html = tHead(r.icon || RACE_ICON[r.race] || '👺', r.name.full, r.monster
    ? `<span style="color:${STATUS.critical}">Hostile</span> · ${FAMILIES[r.family].name} · level ${r.level}`
    : `<span style="color:${STATUS.critical}">Hostile</span> · ${RACES[r.race].name} ${CLASSES[r.klass].name} · level ${r.level}`);
  html += tBar('Health', r.hp / r.maxHp, levelStatus(r.hp / r.maxHp), `${Math.round(r.hp)}/${r.maxHp}`);
  html += tRow('Power', `${powerOf(r)} <span class="tt-dim">vs your best ${best}</span>`, powerOf(r) > best ? STATUS.critical : STATUS.good);
  if (r.floorSpawn) html += tRow('State', r.awake ? 'hunting' : 'asleep at its post', r.awake ? STATUS.critical : STATUS.calm);
  const st = r.stamina == null ? 1 : r.stamina / 100;
  html += tBar('Stamina', st, levelStatus(st), st < 0.25 ? 'winded' : tPct(st));
  if (r.monster) {
    const k = bestiaryKnowledge(g, r.monsterId);
    const tags = (r.combat.tags || []).filter(t => TAGS[t] && !['humanoid', 'darkvision'].includes(t));
    if (k >= 1 && tags.length) html += tRow('Traits', tags.map(t => TAGS[t].icon + ' ' + TAGS[t].name).join(', '));
    if (k >= 2) {
      const weak = Object.entries(r.combat.res).filter(([t, v]) => v < 0 && DAMAGE_TYPES[t]).map(([t]) => DAMAGE_TYPES[t].icon + ' ' + DAMAGE_TYPES[t].name);
      if (weak.length) html += tRow('Weak to', weak.join(', '), STATUS.good);
    } else html += tRow('Weak to', '<span class="tt-dim">unknown</span>');
  } else html += tRow('Armed with', tEsc(r.equipment.weapon ? r.equipment.weapon.name : 'bare hands'));
  return html;
}

function tipBeast(g, b) {
  if (!b) return '';
  const A = ANIMALS[b.species];
  let html = tHead(ANIMAL_ICON[b.species] || '🐾', `${b.name} the ${A.name}`,
    `${b.tame ? 'Livestock' : A.wildAggressive ? `<span style="color:${STATUS.critical}">Wild · dangerous</span>` : 'Wild'} · ${b.sex === 'f' ? '♀' : '♂'} ${isMature(b) ? 'adult' : 'young'}`);
  if (b.downed) html += `<div class="tt-task">💤 Down — up again in ${Math.max(1, Math.ceil((b.downed.until - g.tick) / 60))}h</div>`;
  else if (b.handler) {
    const h = g.colonists.find(c => c.id === b.handler);
    if (h) html += `<div class="tt-task">🦮 Follows ${tEsc(h.name.short)}${b.heeling ? '' : ' <span>· at the pasture until they head out</span>'}</div>`;
  }
  html += tBar('Health', b.hp / b.maxHp, levelStatus(b.hp / b.maxHp), `${Math.round(b.hp)}/${b.maxHp}`);
  html += tBar('Fed', b.hunger, levelStatus(b.hunger), tPct(b.hunger));
  html += tRow('Combat power', beastPower(b));
  if (A.product) html += tRow(A.product.label, `${RESOURCE_ICON[A.product.res] || ''} every ${A.product.days}d${b.readyProduct ? ' · <span style="color:#7fc86b">ready</span>' : ''}`);
  if (A.pack) html += tRow('Carries for its handler', '+' + A.pack * PACK_PER_LOAD);
  if (A.war) html += tRow('Role', 'War beast');
  if (!b.tame) {
    const best = g.colonists.filter(c => !c.away).sort((x, y) => (y.skills.animals || 0) - (x.skills.animals || 0))[0];
    if (best) html += tRow('Tame chance', `${tPct(tameChance(best, b))} <span class="tt-dim">(${tEsc(best.name.short)})</span>`);
  }
  if (b.traits.length) html += `<div class="tt-l"><em>Traits</em> ${kwList('btrait', b.traits)}</div>`;
  html += tDesc(tEsc(A.desc));
  return html;
}

function tipSpecies(g, sp) {
  const A = ANIMALS[sp];
  if (!A) return '';
  let html = tHead(ANIMAL_ICON[sp], A.name, A.wildAggressive ? `<span style="color:${STATUS.critical}">dangerous while wild</span>` : '');
  html += tRow('Health', A.hp) + tRow('Power', A.power) + tRow('Eats / day', A.forage);
  html += tRow('Grown at', A.matureDays + ' days') + tRow('Litter', A.litter.join('–'));
  if (A.product) html += tRow('Gives', `${A.product.label} every ${A.product.days}d`);
  html += tRow('Butchered', costStr(A.butcher));
  return html + tDesc(tEsc(A.desc));
}

function tipSkill(g, c, s) {
  if (!c || !SKILLS[s]) return '';
  const v = c.skills[s], p = c.passions[s];
  let html = tHead('', `${SKILLS[s].name} ${v}`, `${c.name.short} · keyed to ${SKILLS[s].attr.toUpperCase()}`);
  html += tBar('Level', v / 20, '#3987e5', `${v} / 20`);
  html += tRow('Passion', p === 'burning' ? '🔥🔥 burning — learns fast, enjoys it' : p === 'minor' ? '🔥 interested' : 'none');
  const rank = g.colonists.filter(x => (x.skills[s] || 0) > v).length + 1;
  html += tRow('Hold rank', `#${rank} of ${g.colonists.length}`);
  return html;
}

/** Items shown outside the armory (shop stock, a trader's table) get a
 *  short-lived tooltip key of their own. */
const TIP_ITEMS = new Map(), TIP_OF = new WeakMap();
let TIP_N = 0;
export function itemTipKey(it) {
  let k = TIP_OF.get(it);
  if (k == null) {
    k = ++TIP_N; TIP_OF.set(it, k); TIP_ITEMS.set(k, it);
    if (TIP_ITEMS.size > 400) TIP_ITEMS.delete(TIP_ITEMS.keys().next().value);
  }
  return 'ti:' + k;
}

function tipItem(it) {
  if (!it) return '';
  const R = RARITIES[it.rarity] || RARITIES.common;
  const slot = it.slot || (it.kind === 'weapon' ? 'weapon' : 'armor');
  const fam = WEAPON_FAMILIES[it.family || it.type];
  let html = tHead(SLOT_ICONS[slot] || '🛡️', it.name, `<span style="color:${R.color}">${R.name}</span> · ${SLOT_NAMES[slot] || slot}${it.weight ? ' · ' + WEIGHTS[it.weight].name.toLowerCase() : ''}${fam ? ' · ' + fam.name.toLowerCase() + (it.hands === 2 ? ', two-handed' : '') : ''}`);
  if (it.desc) html += tDesc(tEsc(it.desc));
  if (it.dmg) html += tRow('Damage', `${it.dmg[0]}–${it.dmg[1]} ${fam && DAMAGE_TYPES[fam.type] ? DAMAGE_TYPES[fam.type].icon : ''}${it.element ? ' + ' + DAMAGE_TYPES[it.element].icon + ' ' + DAMAGE_TYPES[it.element].name : ''}`);
  if (it.armor) html += tRow('Armour', '+' + it.armor);
  const m = it.mods || {};
  const names = { acc: 'Accuracy', dmg: 'Damage', init: 'Initiative', def: 'Defence', armor: 'Armour', spell: 'Spell power', hp: 'Health', leech: 'Life steal' };
  for (const [k, v] of Object.entries(m)) {
    if (k === 'res' || !v || !names[k]) continue;
    const pct = k === 'spell' || k === 'hp' || k === 'leech';
    html += tRow(names[k], `${v > 0 ? '+' : ''}${pct ? Math.round(v * 100) + '%' : v}`, v < 0 ? STATUS.bad : STATUS.good);
  }
  for (const [k, v] of Object.entries(m.res || {})) if (DAMAGE_TYPES[k]) html += tRow(DAMAGE_TYPES[k].icon + ' ' + DAMAGE_TYPES[k].name, v >= 1 ? 'immune' : `resist ${Math.round(v * 100)}%`, STATUS.good);
  if (it.passive && PASSIVES[it.passive]) html += tRow('✦ ' + PASSIVES[it.passive].name, tEsc(PASSIVES[it.passive].desc), '#b07ae0');
  if (it.grants && ABILITIES[it.grants]) html += tRow('Grants', '✨ ' + ABILITIES[it.grants].name, '#e2a03c');
  if (fam) {
    const who = Object.entries(CLASS_INFO).filter(([, i]) => i.weapons.includes(it.family || it.type)).map(([k]) => CLASSES[k].name);
    html += `<div class="tt-l"><em>Wielded by</em> ${who.join(', ') || 'commoners'}</div>`;
  } else if (it.kind === 'shield') html += `<div class="tt-l"><em>Shield</em> — ${Object.entries(CLASS_INFO).filter(([, i]) => i.shield).map(([k]) => CLASSES[k].name).join(', ')}</div>`;
  else if (it.classes) html += `<div class="tt-l"><em>Focus for</em> ${it.classes.map(k => CLASSES[k].name).join(', ')}</div>`;
  if (it.reinforced) html += tRow('Reinforced', '+' + it.reinforced);
  return html;
}

// --- buildings, tiles -------------------------------------------------------
function buildingStats(def) {
  const out = [];
  if (def.rest) out.push(tRow('Rest', `×${def.rest}`));
  if (def.joy) out.push(tRow('Joy', `+${def.joy}`));
  if (def.beauty) out.push(tRow('Beauty', `+${def.beauty}`));
  if (def.light) out.push(tRow('Light radius', def.light));
  if (def.storage) out.push(tRow('Storage', `+${def.storage}`));
  if (def.hp) out.push(tRow('Toughness', def.hp));
  if (def.job) out.push(tRow('Work here', def.job));
  if (def.recipe && RECIPES[def.recipe]) {
    const r = RECIPES[def.recipe];
    out.push(tRow('Makes', `${costStr(r.inputs)} → ${costStr(r.outputs)}`));
  }
  if (def.solid) out.push(tRow('Blocks movement', 'yes'));
  return out.join('');
}

function tipBuildingDef(g, id) {
  const def = BUILDINGS[id];
  if (!def) return '';
  let html = tHead(BUILDING_ICON[id] || '🧱', def.name, `${def.cat}${def.unique ? ' · only one' : ''}`);
  html += tDesc(tEsc(def.desc));
  html += tRow('Cost', costStr(def.cost, g)) + tRow('Work to build', Math.round(def.work));
  html += buildingStats(def);
  const count = g.world.findBuildings(id).length;
  if (count) html += tRow('You have', count);
  const short = Object.entries(def.cost).filter(([k, v]) => (g.resources[k] || 0) < v);
  if (short.length) html += `<div class="tt-warn">Short of ${short.map(([k, v]) => `${Math.ceil(v - (g.resources[k] || 0))} ${RESOURCES[k].name}`).join(' and ')}</div>`;
  if (!g.unlocked.has(id)) {
    const t = Object.keys(RESEARCH).find(r => (RESEARCH[r].unlock || []).includes(id));
    html += `<div class="tt-warn">🔒 Needs research: ${t ? RESEARCH[t].name : '?'}</div>`;
  }
  return html;
}

function tipTile(g, x, y) {
  const w = g.world;
  if (!w.inside(x, y)) return '';
  const i = w.idx(x, y);
  const terr = TERRAIN[w.terrain[i]];
  const f = w.feature[i], bd = w.building[i];
  let html = '';
  if (bd) {
    const def = BUILDINGS[bd.id];
    html += tHead(BUILDING_ICON[bd.id] || '🧱', def.name, bd.done ? def.cat : `<span style="color:#9cc3e6">blueprint</span>`);
    if (!bd.done) html += tBar('Built', 1 - bd.workLeft / def.work, '#9cc3e6', tPct(1 - bd.workLeft / def.work));
    else if (def.job === 'farm') {
      const crop = CROPS[bd.crop];
      if (crop && bd.planted) {
        const v = cropViability(bd.crop, g.farmContext(x, y));
        html += tRow('Crop', `${CROP_ICON[bd.crop] || '🌱'} ${crop.name} · ${GROWTH_STAGES[growthStage(bd.growth || 0)]}`);
        html += tBar('Growth', bd.growth || 0, (bd.growth || 0) >= 1 ? STATUS.good : '#3987e5', (bd.growth || 0) >= 1 ? 'ready' : tPct(bd.growth || 0));
        html += tRow('Viability now', v > 0 ? tPct(v) : 'will not grow', v > 0.6 ? STATUS.good : v > 0 ? STATUS.warn : STATUS.critical);
      } else html += tRow('Crop', 'fallow');
    } else {
      html += tDesc(tEsc(def.desc));
      html += buildingStats(def);
      if (bd.hp != null && def.hp) html += tBar('Integrity', bd.hp / def.hp, levelStatus(bd.hp / def.hp), Math.round(bd.hp));
    }
    html += tSep;
  }
  const fl = w.floor[i];
  if (fl) {
    const fldef = FLOORS[fl.id];
    html += tRow(fl.done ? 'Floor' : 'Floor (laying)', `${FLOOR_ICON[fl.id] || ''} ${fldef.name}`);
    if (!fl.done) html += tBar('Laid', 1 - fl.workLeft / fldef.work, '#9cc3e6', tPct(1 - fl.workLeft / fldef.work));
  }
  if (f) {
    const fd = FEATURES[f];
    html += tHead(FEATURE_ICON[f] || '·', fd.name, fd.inRock ? 'ore seam — mine it' : 'harvest it');
    html += tRow('Yields', costStr(fd.yield)) + tRow('Work', fd.work);
  } else if (!bd) html += tHead(terr.mineable ? '🪨' : '', terr.name, terr.mineable ? 'rock — can be mined' : '');
  else html += `<div class="tt-l"><em>Ground</em> ${terr.name}</div>`;
  const d = w.designation[i];
  if (d) html += `<div class="tt-l" style="color:${d === 'mine' ? '#ffcf8a' : '#a8eab0'}">Marked for ${d === 'mine' ? '⛏️ mining' : '🌿 harvest'}</div>`;
  const items = g.ground.filter(it => it.x === x && it.y === y && it.qty > 0);
  if (items.length) html += `<div class="tt-l"><em>Waiting to be hauled</em> ${items.map(it => `${RESOURCE_ICON[it.res] || ''}${Math.floor(it.qty)}`).join(' ')}</div>`;
  const parts = [`💡 ${tPct(w.light[i])}`, `✨ ${w.beauty[i].toFixed(1)}`];
  if (w.soil && !terr.mineable) parts.push(`🟫 ${tPct(w.soil[i])}`);
  html += `<div class="tt-foot">${parts.join('  ')}  <span>${x},${y}</span></div>`;
  return html;
}

/** Whatever the pointer is over on the map, most important first. */
export function mapTipKey(g, x, y) {
  const c = (g.here || g.colonists).find(c => !c.away && c.x === x && c.y === y);
  if (c) return 'col:' + c.id;
  const r = g.raiders.find(r => r.hp > 0 && r.x === x && r.y === y);
  if (r) return 'enemy:' + r.id;
  const b = g.beasts.find(b => !b.dead && !b.away && b.x === x && b.y === y);
  if (b) return 'beast:' + b.id;
  if (!g.world.inside(x, y)) return '';
  if (g.world.isRift && g.world.isRift(x, y)) return 'rift';
  const su = g.world.stairsUp, sd = g.world.stairsDown;
  if (su && su.x === x && su.y === y) return 'stairs:up';
  if (sd && sd.x === x && sd.y === y) return 'stairs:down';
  return 'tile:' + x + ',' + y;
}

/** Stairs on a Rift floor: where they go, and how to use them. */
function tipStairs(g, dir) {
  const m = g._m;
  const up = dir === 'up';
  const where = up ? (m.depth === 1 ? 'the camp' : `floor ${m.depth - 1}`) : `floor ${m.depth + 1}`;
  let html = tHead(up ? '⬆️' : '⬇️', up ? 'Stairs up' : 'Stairs down', `Floor ${m.depth} of ${g.floorCount} · to ${where}`);
  if (!up) {
    const next = g.floorAt(m.depth + 1);
    html += tRow('Below', next ? `${next.raiders.filter(r => r.hp > 0 && !r.neutral).length} hostiles known` : 'unexplored');
    if (m.depth + 1 >= g.floorCount) html += `<div class="tt-warn">The lair is down there.</div>`;
  } else html += tRow('Carried out', 'everything in the packs goes to the stores at the top');
  return html + `<div class="tt-hint">Select people, then right-click the stairs to take them.</div>`;
}

/** The Rift Gate: its level, rank, what is inside now, and what comes out tonight. */
function tipRift(g) {
  const R = g.rift;
  if (!R) return '';
  const d = R.forecast;
  const f = g.waveForecast;
  let html = tHead('🌀', 'The Rift Gate', `SSS-class gate · currently <b style="color:#e6c8ff">rank ${g.riftRank}</b> · level ${R.level}`);
  html += g.isNight
    ? `<div class="tt-warn">OPEN — spawn walk the camp until dawn (${g.hoursToDawn}h)</div>`
    : `<div class="tt-task">Quiet by day · opens at dusk in ${g.hoursToDusk}h</div>`;
  if (g.riftNextLevelIn > 0) html += tBar('Deepens', 1 - g.riftNextLevelIn / 4, '#b07ae0', `in ${g.riftNextLevelIn}d`);
  html += tSep;
  if (d) {
    html += `<div class="tt-l"><em>Inside today</em> ${tEsc(d.name)}${d.surge ? ' (surge)' : ''} — ${g.floorCount} floor${g.floorCount === 1 ? '' : 's'} deep</div>`;
    html += tRow('Likely loot', Object.keys(d.loot || {}).map(k => RESOURCE_ICON[k] || k).join(' '));
  }
  html += tRow('Tonight', `~${f.size} spawn · strength ${f.power}`, STATUS.bad);
  const below = g.colonists.filter(c => c.mapId).length;
  if (below) html += `<div class="tt-l" style="color:#e6c8ff">${below} of ours are down there.</div>`;
  html += `<div class="tt-hint">${g.canEnterRift ? 'Select people and right-click the gate to send them in.' : 'Nobody goes in until dawn.'}</div>`;
  return html;
}

// --- research, world, delves ------------------------------------------------
function tipTech(g, id) {
  const T = RESEARCH[id];
  if (!T) return '';
  const done = g.research.done.has(id);
  const cur = g.research.current === id;
  const ok = T.req.every(q => g.research.done.has(q));
  const q = g.research.queue.indexOf(id);
  const state = done ? `<span style="color:${STATUS.good}">Researched</span>` : cur ? `<span style="color:#f2d479">Researching now</span>`
    : q >= 0 ? `Queued #${q + 1}` : ok ? 'Available' : '🔒 Locked';
  let html = tHead(TECH_ICON[id] || '🔬', T.name, `${state} · ${T.cost} insight`);
  html += tDesc(tEsc(T.desc));
  if (cur) html += tBar('Progress', g.research.progress / T.cost, '#3987e5', `${Math.round(g.research.progress)} / ${T.cost}`);
  if (T.unlock && T.unlock.length) html += `<div class="tt-l"><em>Unlocks</em> ${T.unlock.map(u => `${BUILDING_ICON[u] || ''} ${BUILDINGS[u] ? BUILDINGS[u].name : u}`).join(' · ')}</div>`;
  if (T.bonus) {
    const nice = { farmYield: 'Crop yield', herbYield: 'Herb yield', healRate: 'Healing', researchRate: 'Research speed', mineYield: 'Mining yield', combat: 'Combat', defence: 'Defence', loot: 'Loot', depth: 'Delve depth', husbandry: 'Husbandry', tame: 'Taming', scout: 'Scouting', haul: 'Hauling', storage: 'Storage' };
    html += `<div class="tt-l"><em>Bonus</em> ${Object.entries(T.bonus).map(([k, v]) => `${nice[k] || k} ${v < 1 ? '+' + Math.round(v * 100) + '%' : '+' + v}`).join(' · ')}</div>`;
  }
  if (T.req.length) html += `<div class="tt-l"><em>Needs</em> ${T.req.map(r => `<span style="color:${g.research.done.has(r) ? STATUS.good : STATUS.bad}">${RESEARCH[r].name}</span>`).join(', ')}</div>`;
  const leads = Object.keys(RESEARCH).filter(r => RESEARCH[r].req.includes(id));
  if (leads.length) html += `<div class="tt-l"><em>Leads to</em> ${leads.map(r => RESEARCH[r].name).join(', ')}</div>`;
  if (!done && !cur) html += `<div class="tt-hint">${ok ? 'Click to research now' + (g.research.current ? ' (the current project restarts later)' : '') : 'Click to queue it and everything it needs'}</div>`;
  return html;
}

function tipSite(g, s) {
  if (!s) return '';
  const K = SITE_KINDS[s.kind];
  let html = tHead(SITE_ICON[s.kind] || '📍', s.name, `${K.name} · ${BIOMES[s.biome].name} · tier ${s.tier}`);
  html += tRow('Distance', `${Math.round(s.dist)} · ${Math.round(g.overworld.travelTicks(g.overworld.colony, s) / 60)}h travel`);
  if (s.pop) html += tRow('Population', s.pop);
  if (s.hostility != null) {
    const h = dispositionOf(s.hostility);
    html += tBar('Hostility', s.hostility / 100, h.color, h.name);
  }
  if (s.stock) html += tRow('Trades in', Object.keys(s.stock).map(k => RESOURCE_ICON[k] || k).join(' '));
  if (K.hostileSite) html += `<div class="tt-warn">Hostile country</div>`;
  if (s.cleared) html += `<div class="tt-l" style="color:${STATUS.good}">Cleared</div>`;
  return html;
}


function tipCrop(g, id) {
  const C = CROPS[id];
  if (!C) return '';
  let html = tHead(CROP_ICON[id] || '🌱', C.name, `${C.indoor ? 'grows indoors · ' : ''}${C.growDays} days to grow`);
  html += tDesc(tEsc(C.desc));
  html += tRow('Yield', `${RESOURCE_ICON[C.product] || ''} ${C.yield}`) + tRow('Seed', costStr(C.seed));
  html += tRow('Wants soil', tPct(C.soil)) + tRow('Wants water', tPct(C.water));
  if (C.seasons) html += tRow('Seasons', C.seasons.map(s => ['🌱', '☀️', '🍂', '❄️'][s]).join(' '));
  return html;
}
