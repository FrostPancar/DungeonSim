// ============================================================================
// KEYWORDS: one look for every named thing a panel mentions.
//
// A trait, a resource, a skill, a class or a status reads the same wherever it
// appears — icon, name, a colour for whether it is good or bad for you, and
// the same tooltip (data-tip routes through tips.js). Panels call kw() rather
// than printing names, so the look can't drift apart again (the harness greps
// for stray TRAITS[..].name in ui.js and tips.js).
//
// Pure strings, no DOM: it loads in Node as well as the browser.
// ============================================================================
import { TRAITS, RESOURCES, SKILLS, CLASSES, BUILDINGS } from './data.js';
import { BEAST_TRAITS } from './husbandry.js';
import { RESOURCE_ICON, BUILDING_ICON } from './icons.js';

// How much of each modifier makes one "unit" of good (or bad, when negative).
// Hostility, needs, fleeing and incidents are costs, so they weigh against.
const TRAIT_WEIGHT = {
  mood: 1 / 6, work: 4, combat: 10, social: 3, hostility: -1 / 8, armor: 0.5, needs: -4, loot: 6, luck: 6,
  learn: 8, move: 4, flee: -2.5, incident: -3, dungeonMood: 1 / 8, trap: 3, nightWork: 3, dayWork: 3,
};
const BEAST_WEIGHT = { hp: 4, breed: 2.5, product: 3, power: 2.5, forage: -4, tame: -0.2 };

function score(mods, weights) {
  let up = 0, down = 0;
  for (const [k, v] of Object.entries(mods || {})) {
    const w = k.startsWith('skill.') ? 1 / 3 : weights[k];
    if (!w) continue;
    const s = v * w;
    if (s > 0) up += s; else down -= s;
  }
  return { up, down };
}
/** 'good', 'bad' or 'mixed': a trait with a real cost and a real gain is a trade-off, not a verdict. */
export function sentimentOf(mods, weights = TRAIT_WEIGHT) {
  const { up, down } = score(mods, weights);
  if (up >= 0.6 && down >= 0.6) return 'mixed';
  if (up - down >= 0.4) return 'good';
  if (down - up >= 0.4) return 'bad';
  return 'mixed';
}
export function traitSentiment(id) { return TRAITS[id] ? sentimentOf(TRAITS[id].mods) : 'mixed'; }
// Where the arithmetic misreads a trait: a runt eats a little less, but nobody keeps one on purpose.
const BEAST_VERDICT = { runt: 'bad' };
export function beastTraitSentiment(id) { return BEAST_VERDICT[id] || (BEAST_TRAITS[id] ? sentimentOf(BEAST_TRAITS[id].mods, BEAST_WEIGHT) : 'mixed'); }

const SENT_ICON = { good: '▲', bad: '▼', mixed: '◆' };

function kwEsc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/**
 * One keyword chip. type: trait | btrait | res | skill | class | bld.
 * opts.qty puts an amount in front ("12 🪵 Wood"); opts.short drops the name
 * (icon and amount only, for dense cost lines); opts.state overrides the colour.
 */
export function kw(type, id, opts = {}) {
  let icon = '', name = String(id), sent = 'neutral', tip = '';
  if (type === 'trait') {
    const T = TRAITS[id]; if (!T) return '';
    sent = traitSentiment(id); name = T.name; icon = SENT_ICON[sent]; tip = 'trait:' + id;
  } else if (type === 'btrait') {
    const T = BEAST_TRAITS[id]; if (!T) return '';
    sent = beastTraitSentiment(id); name = T.name; icon = SENT_ICON[sent]; tip = 'btrait:' + id;
  } else if (type === 'res') {
    const R = RESOURCES[id]; if (!R) return '';
    name = R.name; icon = RESOURCE_ICON[id] || ''; tip = 'res:' + id;
  } else if (type === 'skill') {
    const S = SKILLS[id]; if (!S) return '';
    name = S.name;
  } else if (type === 'class') {
    const C = CLASSES[id]; if (!C) return '';
    name = C.name; icon = '🎓';
  } else if (type === 'bld') {
    const B = BUILDINGS[id]; if (!B) return '';
    name = B.name; icon = BUILDING_ICON[id] || '🏠';
  }
  if (opts.state) sent = opts.state;
  const qty = opts.qty != null ? `<b>${opts.qty}</b> ` : '';
  const label = opts.short ? '' : `<span class="kw-n">${kwEsc(name)}</span>`;
  const tipAttr = tip && !opts.noTip ? ` data-tip="${tip}"` : opts.tipt ? ` data-tipt="${kwEsc(opts.tipt)}"` : '';
  return `<span class="kw kw-${type} kw-${sent}"${tipAttr}${opts.short ? ` title="${kwEsc(name)}"` : ''}>${qty}${icon ? `<i>${icon}</i>` : ''}${label}</span>`;
}

/** A list of keyword chips, or `none` when empty. */
export function kwList(type, ids, none = '') {
  return ids && ids.length ? ids.map(id => kw(type, id)).join('') : none;
}

/** A cost or reward line as resource chips: { wood: 12, gold: 5 } → "12 🪵 · 5 🪙". */
export function kwCost(cost, have = null) {
  return Object.entries(cost || {}).map(([k, v]) =>
    kw('res', k, { qty: v, short: true, state: have && (have[k] || 0) < v ? 'bad' : undefined })).join('');
}
