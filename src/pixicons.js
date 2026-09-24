// ============================================================================
// PIXEL ICONS. Every emoji the game writes is drawn as a pixel icon instead:
// items, resources, statuses, buildings and tools come from Shikashi's Fantasy
// Icons Pack (assets/icons.png, see iconsheet.js); creatures — ancestries,
// livestock, monsters, trees — use the game's own map sprites, so a goblin in
// a panel is the goblin on the map.
//
// The rest of the client keeps writing emoji. Nothing at the call sites
// changes: panels are converted as they reach the page (pixify, below) and
// the map's emoji atlas asks pxCanvas() first. One table, `PX`, decides what
// every glyph looks like, so a glyph means the same picture everywhere.
// Plain typographic marks (arrows, ★, ♀/♂, ✓) are left as text.
// View-only: nothing in the simulation imports this file.
// ============================================================================
import { ICON_SHEET_URL, ICON_SHEET_COLS, ICON_SHEET_W, ICON_SHEET_H, ICON_CELL } from './iconsheet.js';
import { SpriteBook } from './sprites.js';

const pxP = (r, c) => ({ r, c });          // a cell of the icon sheet
const pxS = (spr) => ({ spr });            // one of the game's sprites

/** Glyph → picture. Keys are written without the emoji variation selector. */
export const PX = {
  // --- combat, damage and statuses
  '⚔': pxP(5, 9), '🗡': pxP(5, 6), '🏹': pxP(6, 3), '🔨': pxP(10, 4), '🛡': pxP(6, 2), '🪓': pxP(10, 1),
  '🔥': pxP(4, 2), '❄': pxP(21, 11), '⚡': pxP(0, 8), '☠': pxP(0, 1), '✨': pxP(0, 5), '🌑': pxP(18, 5), '🔮': pxP(18, 4),
  '💀': pxP(0, 0), '⚰': pxP(0, 0), '🩸': pxP(3, 0), '🧊': pxP(18, 1), '💤': pxP(0, 7), '😴': pxP(0, 2), '💨': pxP(3, 12),
  '📣': pxP(11, 8), '📢': pxP(11, 8), '🎯': pxP(3, 3), '💧': pxP(0, 10), '🫧': pxP(18, 1), '🌊': pxP(0, 10),
  '💫': pxP(0, 5), '💥': pxP(3, 11), '🌪': pxP(3, 12), '🌫': pxP(3, 12), '🔰': pxP(3, 8), '👤': pxP(4, 8), '🏃': pxP(4, 8),
  '💪': pxP(1, 4), '💚': pxP(3, 5), '⏩': pxP(2, 2), '⬆': pxP(2, 0), '⬇': pxP(2, 1), '🛢': pxP(19, 7), '🌵': pxP(11, 13),
  '💞': pxP(0, 6), '😱': pxP(0, 4), '😨': pxP(0, 4), '😵': pxP(0, 5), '🤐': pxP(0, 3), '🐌': pxP(10, 15), '🥀': pxP(2, 1),
  '🙈': pxP(0, 2), '🩶': pxP(2, 3), '🎶': pxP(11, 3), '😤': pxP(5, 15), '😡': pxP(0, 9), '😇': pxP(3, 15), '👼': pxP(3, 15),
  '🪽': pxP(17, 10), '🫥': pxP(1, 3), '🌒': pxP(21, 10), '🍀': pxP(13, 13), '👑': pxP(12, 7), '🎖': pxP(2, 0),
  '🕳': pxP(10, 3), '⛓': pxP(11, 2), '🪝': pxP(10, 5), '💋': pxP(0, 6), '🧠': pxP(1, 3), '👅': pxP(1, 2), '👄': pxP(1, 2),
  '🦷': pxP(17, 9), '🦴': pxP(16, 11), '🪶': pxP(17, 10), '🗿': pxP(11, 0), '⚙': pxP(17, 2),
  // --- health, mood and people's states
  '❤': pxP(1, 0), '❤‍🩹': pxP(9, 4), '💖': pxP(9, 8), '🩹': pxP(9, 15), '🙂': pxP(18, 2), '😐': pxP(18, 3), '🙁': pxP(18, 0),
  '😣': pxP(18, 0), '🤝': pxP(0, 6), '💬': pxP(4, 1), '🚶': pxP(16, 12), '🫳': pxP(10, 0), '🎒': pxP(10, 0), '🤰': pxP(15, 6),
  '🐣': pxP(15, 6), '⭐': pxP(2, 0), '📈': pxP(2, 2), '📊': pxP(2, 2), '✅': pxP(2, 4), '↩': pxP(2, 5), '⚠': pxP(10, 12),
  'ℹ': pxP(4, 0), '❓': pxP(4, 0), '🔒': pxP(11, 9), '🗝': pxP(11, 10), '⏳': pxP(10, 15), '🕓': pxP(10, 15), '⚓': pxP(10, 5),
  '🧹': pxP(10, 3), '🗑': pxP(3, 10), '🚫': pxP(3, 10), '💾': pxP(11, 11), '🔴': pxP(18, 0), '🔶': pxP(18, 3), '🟢': pxP(9, 2),
  // --- resources and goods
  '🍖': pxP(15, 0), '🪵': pxP(17, 0), '🪨': pxP(17, 1), '🧱': pxP(17, 1), '🦬': pxP(17, 8), '🧵': pxP(17, 7), '🌿': pxP(11, 15),
  '🪙': pxP(12, 7), '💎': pxP(17, 4), '🏺': pxP(16, 13), '💠': pxP(12, 14), '📖': pxP(13, 8), '🍲': pxP(15, 2), '🧪': pxP(9, 0),
  '🥾': pxP(8, 2), '⛑': pxP(7, 1), '🥋': pxP(7, 4), '📿': pxP(8, 6), '💍': pxP(8, 4), '🧴': pxP(9, 13), '🥛': pxP(15, 8),
  '🟫': pxP(20, 1), '☁': pxP(17, 5), '🧶': pxP(17, 6), '🪢': pxP(10, 13),
  // --- crops, plants and seasons
  '🌱': pxP(12, 3), '🌾': pxP(14, 7), '🍄': pxP(12, 0), '🥔': pxP(12, 2), '🫘': pxP(20, 3), '🥬': pxP(11, 13), '🌼': pxP(12, 5),
  '🌸': pxP(12, 1), '🍂': pxP(11, 14), '☀': pxP(21, 8), '🌙': pxP(21, 10),
  // --- buildings and places
  '🚪': pxP(19, 11), '🚧': pxP(19, 11), '🪑': pxP(19, 11), '🏚': pxP(19, 11), '🛏': pxP(0, 7), '🛌': pxP(17, 7), '🍽': pxP(14, 13),
  '🍺': pxP(15, 14), '📦': pxP(11, 11), '🗄': pxP(11, 11), '🥣': pxP(20, 0), '🪣': pxP(0, 10), '♻': pxP(20, 1), '🔪': pxP(5, 7),
  '🍳': pxP(19, 8), '🪚': pxP(4, 6), '⚒': pxP(4, 4), '⚗': pxP(19, 6), '📚': pxP(13, 1), '📕': pxP(13, 1), '📘': pxP(13, 0),
  '⚕': pxP(9, 15), '🛐': pxP(8, 7), '⛪': pxP(8, 7), '🙏': pxP(8, 7), '🕍': pxP(3, 15), '🔭': pxP(10, 7), '🏯': pxP(10, 7),
  '🎓': pxP(13, 6), '📜': pxP(13, 11), '📋': pxP(13, 10), '🏰': pxP(7, 3), '🤺': pxP(5, 0), '🚩': pxP(7, 14), '💡': pxP(10, 9),
  '🕯': pxP(10, 11), '🎲': pxP(13, 13), '🏛': pxP(11, 0), '🏕': pxP(4, 3), '🛖': pxP(4, 3), '🏘': pxP(4, 3), '🏡': pxP(4, 3),
  '🏠': pxP(4, 3), '🏙': pxP(12, 11), '🌀': pxP(3, 14), '🗺': pxP(13, 12), '🧭': pxP(13, 12), '📍': pxP(13, 12),
  '⛏': pxP(10, 2), '🔬': pxP(10, 8), '⚖': pxP(12, 12), '🖐': pxP(21, 0), '🪄': pxP(6, 8), '🛠': pxP(10, 4), '🐫': pxP(19, 10),
  // --- ancestries and people
  '🧑': pxS('person:human'), '🧑‍🤝‍🧑': pxS('person:human'), '👥': pxS('person:human'), '🧔': pxS('person:dwarf'),
  '🧝': pxS('person:elf'), '🧝‍♀': pxS('person:elf:druid'), '🧒': pxS('person:halfling'), '🎩': pxS('person:gnome'),
  '👹': pxS('person:orc'), '👺': pxS('person:goblin'), '🦎': pxS('person:kobold'), '😈': pxS('person:tiefling'),
  '🐲': pxS('person:dragonkin'), '🧟': pxS('person:undead'), '🧙': pxS('person:human:wizard'), '🧙‍♀': pxS('person:human:warlock'),
  '🤖': pxS('monster:construct'),
  // --- livestock and wildlife
  '🐾': pxS('animal:woolback'), '🐔': pxS('animal:fowl'), '🐓': pxS('animal:fowl'), '🐐': pxS('animal:cavegoat'),
  '🐑': pxS('animal:woolback'), '🐗': pxS('animal:boar'), '🐂': pxS('animal:ox'), '🐄': pxS('animal:ox'),
  '🦕': pxS('animal:packlizard'), '🐕': pxS('animal:warhound'), '🦮': pxS('animal:warhound'), '🐺': pxS('animal:direwolf'),
  '🪲': pxS('animal:chitinbug'), '🦋': pxS('animal:duskmoth'), '🐟': pxP(16, 3), '🪱': pxP(16, 2),
  '🌳': pxS('tree:broadleaf'), '🌲': pxS('tree:conifer'),
  // --- Rift monsters, by the family sprite they are drawn with
  '🐉': pxS('monster:dragon'), '🦖': pxS('monster:dragon'), '👁': pxS('monster:aberration'), '👁‍🗨': pxS('monster:aberration'),
  '🧚': pxS('monster:fey'), '🐍': pxS('monster:monstrosity'), '🦅': pxS('monster:monstrosity'), '🦁': pxS('monster:monstrosity'),
  '🦉': pxS('monster:monstrosity'), '🦂': pxS('monster:monstrosity'), '🦈': pxS('monster:monstrosity'),
  '🕷': pxS('monster:underdark'), '🕸': pxS('monster:underdark'), '🦑': pxS('monster:underdark'), '🦞': pxS('monster:underdark'),
  '🐛': pxS('monster:underdark'), '👻': pxS('monster:undead'), '🧛': pxS('monster:undead'), '🫠': pxS('monster:ooze'),
  '🧫': pxS('monster:ooze'), '👿': pxS('monster:fiend'), '🧌': pxS('monster:giant'), '🐘': pxS('monster:giant'),
  '🏔': pxS('monster:giant'), '🌋': pxS('monster:giant'), '🐀': pxS('monster:beast'), '🦇': pxS('monster:beast'),
  '🐆': pxS('monster:beast'), '🐜': pxS('monster:beast'), '🐭': pxS('monster:beast'), '🐸': pxS('monster:beast'),
};

const PX_VS = /\uFE0F/g;
/** The picture for a glyph, or null if it stays text. */
export function pxOf(glyph) { return glyph ? PX[glyph.replace(PX_VS, '')] || null : null; }

// --- the sheet image ---------------------------------------------------------
let pxSheet = null, pxSheetOk = false;
function pxSheetImage() {
  if (pxSheet || typeof Image === 'undefined') return pxSheet;
  pxSheet = new Image();
  pxSheet.onload = () => { pxSheetOk = true; };
  pxSheet.src = ICON_SHEET_URL;
  return pxSheet;
}

// --- sprites as icons ----------------------------------------------------------
const pxBook = typeof document !== 'undefined' ? new SpriteBook() : null;
const PX_TREE_PAL = { broadleaf: ['#1c3a1a', '#2e5c28', '#4a8a3a', '#7cb85a'], conifer: ['#16301c', '#244a2a', '#386e3c', '#5a9a50'] };
function pxSpriteCanvas(spr) {
  if (!pxBook) return null;
  const [kind, a, b] = spr.split(':');
  let r = null;
  try {
    if (kind === 'person') r = pxBook.person({ race: a, klass: b || 'laborer', id: a }, null);
    else if (kind === 'monster') r = pxBook.monster({ family: a, combat: {} }, null);
    else if (kind === 'animal') r = pxBook.animal(a, null);
    else if (kind === 'tree') r = pxBook.tree(a, PX_TREE_PAL[a] || PX_TREE_PAL.broadleaf);
  } catch (e) { /* a sprite that can't be drawn stays an emoji */ }
  return r && r.canvas ? r.canvas : null;
}

/**
 * The picture for a glyph drawn into a new canvas `dim` pixels square, for the
 * map's atlas. Null if the glyph stays text or the sheet hasn't loaded yet
 * (the caller shouldn't cache a null that came from "not yet").
 */
export function pxCanvas(glyph, dim) {
  const p = pxOf(glyph);
  if (!p || typeof document === 'undefined') return null;
  const src = p.spr ? pxSpriteCanvas(p.spr) : (pxSheetImage(), pxSheetOk ? pxSheet : null);
  if (!src) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = dim;
  const g = cv.getContext('2d');
  if (!g || !g.drawImage) return null;
  // Pixel art stays crisp when it's scaled up; smoothed when shrunk below its size.
  g.imageSmoothingEnabled = dim < (p.spr ? src.width : ICON_CELL);
  if (p.spr) g.drawImage(src, 0, 0, src.width, src.height, 0, 0, dim, dim);
  else g.drawImage(src, p.c * ICON_CELL, p.r * ICON_CELL, ICON_CELL, ICON_CELL, 0, 0, dim, dim);
  return cv;
}
export function pxSheetReady() { pxSheetImage(); return pxSheetOk; }

// --- panels: emoji in the page become icons as they arrive ---------------------
const PX_GLYPHS = Object.keys(PX).sort((a, b) => b.length - a.length)
  .map(k => [...k].map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\uFE0F?').join(''));
const PX_RX = new RegExp(PX_GLYPHS.join('|'), 'gu');
const PX_SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'TITLE', 'CANVAS']);
const pxSpriteUrls = new Map();

function pxSpriteUrl(spr) {
  if (pxSpriteUrls.has(spr)) return pxSpriteUrls.get(spr);
  const c = pxSpriteCanvas(spr);
  const url = c && c.toDataURL ? c.toDataURL() : null;
  pxSpriteUrls.set(spr, url);
  return url;
}

/** One icon element for a glyph (the glyph kept as its accessible name). */
export function pxElement(glyph) {
  const p = pxOf(glyph);
  if (!p) return null;
  // Its own tag, so no older rule written for `<i>` or `<span>` can restyle it.
  const i = document.createElement('px-i');
  i.className = p.spr ? 'px px-spr' : 'px';
  i.setAttribute('role', 'img');
  i.setAttribute('aria-label', glyph);
  if (p.spr) {
    const url = pxSpriteUrl(p.spr);
    if (!url) return null;
    i.style.backgroundImage = `url(${url})`;
  } else {
    i.style.backgroundPosition = `${(p.c / (ICON_SHEET_COLS - 1)) * 100}% ${(p.r * ICON_CELL / (ICON_SHEET_H - ICON_CELL)) * 100}%`;
  }
  return i;
}

/** Swap the emoji in one text node for icons. */
function pxText(t) {
  const s = t.nodeValue;
  if (!s || s.length > 4000) return;
  PX_RX.lastIndex = 0;
  if (!PX_RX.test(s)) return;
  const par = t.parentNode;
  if (!par || PX_SKIP.has(par.nodeName) || (par.closest && par.closest('.no-px'))) return;
  PX_RX.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0, m;
  while ((m = PX_RX.exec(s))) {
    const el = pxElement(m[0]);
    if (!el) continue;
    if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
    frag.appendChild(el);
    last = m.index + m[0].length;
  }
  if (!last) return;
  if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
  par.replaceChild(frag, t);
}

/** Convert every emoji under `root`. */
export function pixify(root) {
  if (!root) return;
  if (root.nodeType === 3) { pxText(root); return; }
  if (root.nodeType !== 1 || PX_SKIP.has(root.nodeName)) return;
  const walk = document.createTreeWalker(root, 4);
  const texts = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) texts.push(n);
  for (const t of texts) pxText(t);
}

/**
 * Start converting: the whole page now, and whatever is written into it from
 * here on. Also puts the sheet into the stylesheet the icons draw from.
 */
export function installPixIcons(doc = document) {
  if (!doc || !doc.body || typeof MutationObserver === 'undefined') return;
  pxSheetImage();
  doc.documentElement.style.setProperty('--px-sheet', `url(${ICON_SHEET_URL})`);
  pixify(doc.body);
  const mo = new MutationObserver((list) => {
    for (const r of list) {
      if (r.type === 'characterData') pxText(r.target);
      else for (const n of r.addedNodes) pixify(n);
    }
  });
  mo.observe(doc.body, { childList: true, subtree: true, characterData: true });
  return mo;
}
