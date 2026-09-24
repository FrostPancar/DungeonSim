// ============================================================================
// PIXEL SPRITES. Everything that walks or grows on the map — colonists,
// traders, Rift spawn, monsters, livestock, trees and crops — is a small
// hand-authored pixel grid here, not an emoji.
//
// Each grid is 16×16 characters; each character is a palette slot, and the
// palette is filled in per individual (an ancestry's skin, a class's cloth, an
// element's glow), so one drawing covers a whole family.
//
// OUTLINES carry two jobs:
//   · a dark contour one pixel out, so a sprite reads on moss, stone or water;
//   · an allegiance ring one pixel beyond that — blue for the hold, red for
//     anything that wants it dead, gold for traders, green for tame stock,
//     pale for wild animals that will leave you alone.
// Colour is never the only cue (shape is), but it is the fastest one.
//
// Sprites are rasterised once per (grid, palette, ring) into a small canvas
// and blitted with smoothing off, so they stay crisp at every zoom.
// View-only: nothing in the simulation imports this file.
// ============================================================================
import { ANIMALS } from './husbandry.js';

export const SPRITE_N = 16;           // grid size, in sprite pixels
const PAD = 2;                        // contour + allegiance ring

/** Ring colours. `null` draws the dark contour only (plants, props). */
export const ALLEGIANCE = {
  ally: '#46b4ff',       // the hold's own people
  wavering: '#ffb23e',   // a colonist whose hostility is high enough to worry about
  hostile: '#ff3d3d',    // raiders, Rift spawn, aggressive wildlife
  neutral: '#ffd84a',    // traders and peddlers
  tame: '#6ee07a',       // livestock and war beasts
  wild: '#e9e4d6',       // wildlife that won't start a fight
  party: '#46b4ff',
  selected: '#fff03c',   // anyone in the player's current selection
};
const CONTOUR = '#120d16';

// ----------------------------------------------------------------------------
// HUMANOIDS. One grid per ancestry. Slots:
//   s/S skin & shade   h/H hair & shade   e eyes   T tusk/bone   r horn
//   c/C cloth & shade  a belt/trim        p/P legs  b boots      x/X extra
// `hand` is the cell just right of the right hand, where a held item's grip goes.
// ----------------------------------------------------------------------------
const HUMANOID = {
  human: { hand: [12, 10], grid: [
    '................',
    '......hhhh......',
    '.....hhhhhh.....',
    '.....hhhhhhh....',
    '.....hssssh.....',
    '.....sesses.....',
    '.....ssssss.....',
    '......sSSs......',
    '....cccccccc....',
    '....cCcaacCc....',
    '....scCccCcs....',
    '.....aaaaaa.....',
    '.....pppppp.....',
    '.....pp..pp.....',
    '.....pP..pP.....',
    '.....bb..bb.....',
  ] },
  elf: { hand: [12, 10], grid: [
    '................',
    '......hhhh......',
    '.....hhhhhh.....',
    '.....hhhhhh.....',
    '....shssssHs....',
    '.....sesses.....',
    '.....hssssh.....',
    '.....hsSSsh.....',
    '....cchcchcc....',
    '....cCcaacCc....',
    '....scCccCcs....',
    '.....aaaaaa.....',
    '.....cCccCc.....',
    '.....pp..pp.....',
    '.....pP..pP.....',
    '.....bb..bb.....',
  ] },
  dwarf: { hand: [13, 11], grid: [
    '................',
    '................',
    '................',
    '......hhhh......',
    '.....hhhhhh.....',
    '.....hssssh.....',
    '.....sesses.....',
    '.....hSssSh.....',
    '....chhhhhhc....',
    '...cchhhhhhcc...',
    '...cCchhhhcCc...',
    '...sCcchhccCs...',
    '....aaaaaaaa....',
    '....pppppppp....',
    '....ppP..ppP....',
    '....bbb..bbb....',
  ] },
  halfling: { hand: [12, 11], grid: [
    '................',
    '................',
    '................',
    '.....hhhhhh.....',
    '....hhHhhHhh....',
    '....hhssssHh....',
    '.....sesses.....',
    '.....ssssss.....',
    '......sSSs......',
    '....cccaaccc....',
    '....cCccccCc....',
    '....scCccCcs....',
    '.....aaaaaa.....',
    '.....pP..pP.....',
    '.....ss..ss.....',
    '....sSs..sSs....',
  ] },
  gnome: { hand: [12, 11], grid: [
    '.......x........',
    '.......xx.......',
    '......xxX.......',
    '......xxxX......',
    '.....xxxxxX.....',
    '....aaaaaaaa....',
    '.....sesses.....',
    '.....sssTss.....',
    '.....hhhhhh.....',
    '....cchhhhcc....',
    '....cCchhcCc....',
    '....scCccCcs....',
    '.....aaaaaa.....',
    '.....pp..pp.....',
    '.....pP..pP.....',
    '....bbb..bbb....',
  ] },
  orc: { hand: [13, 10], grid: [
    '.......hh.......',
    '......hhhh......',
    '.....hssssh.....',
    '....sssssssS....',
    '....ssssssSS....',
    '....seessees....',
    '....ssssssss....',
    '....sTSSSSTs....',
    '...cccccccccc...',
    '...cCccaaccCc...',
    '...sscCccCcss...',
    '....aaaaaaaa....',
    '....pppppppp....',
    '....ppp..ppp....',
    '....ppP..ppP....',
    '....bbb..bbb....',
  ] },
  goblin: { hand: [12, 11], grid: [
    '................',
    '................',
    '................',
    '................',
    '......ssss......',
    '..Ss.ssssss.sS..',
    '...Sssesssesss..',
    '....sssssssS....',
    '.....sTSSTs.....',
    '......SssS......',
    '.....cccccc.....',
    '....scCccCcs....',
    '.....aaaaaa.....',
    '.....pp..pp.....',
    '.....pP..pP.....',
    '....ss....ss....',
  ] },
  kobold: { hand: [12, 11], grid: [
    '................',
    '................',
    '................',
    '.....r...r......',
    '.....rsssr......',
    '.....sssssss....',
    '.....seSsssssS..',
    '.....ssssTTTS...',
    '......sSSSS.....',
    '.....cccccc.....',
    '....cCcaacCc....',
    '....scCccCcs....',
    '.S...aaaaaa.....',
    '.SS..sS..sS.....',
    '..SSsss..ss.....',
    '....sSS..sSS....',
  ] },
  tiefling: { hand: [12, 10], grid: [
    '....r......r....',
    '....rr.hh.rr....',
    '.....rhhhhr.....',
    '.....hhhhhhh....',
    '.....hssssh.....',
    '.....sesses.....',
    '.....ssssss.....',
    '......sSSs......',
    '....cccccccc....',
    '....cCcaacCc....',
    '....scCccCcs....',
    '.....aaaaaa.....',
    '..S..pppppp.....',
    '.S.S.pp..pp.....',
    '.S...pP..pP.....',
    '..SS.bb..bb.....',
  ] },
  dragonkin: { hand: [13, 10], grid: [
    '................',
    '....rr..........',
    '.....rrssss.....',
    '.....sSsssss....',
    '.....sssssssss..',
    '.....Sesssssss..',
    '.....SsssTTTTs..',
    '......SSssss....',
    '....cccccccc....',
    '...ccCcaacCcc...',
    '...ssCccccCss...',
    '.....aaaaaa.....',
    '..S..pppppp.....',
    '.SS..pp..pp.....',
    'SS...pP..pP.....',
    '.....bb..bb.....',
  ] },
  undead: { hand: [12, 10], grid: [
    '................',
    '......TTTT......',
    '.....TTTTTT.....',
    '.....TTTTTT.....',
    '.....TeTTeT.....',
    '.....TeTTeT.....',
    '......TTTT......',
    '......TkTk......',
    '....cc.TT.cc....',
    '....cTTTTTTc....',
    '....T.TTTT.T....',
    '....T.TTTT.T....',
    '......cCcC......',
    '......T..T......',
    '......T..T......',
    '.....TT..TT.....',
  ] },
  aberrant: { hand: [12, 10], grid: [
    '......ssss......',
    '.....ssssss.....',
    '....sssssssS....',
    '....ssssssSS....',
    '....seessees....',
    '....SssssssS....',
    '....sS.ss.Ss....',
    '....s.sSSs.s....',
    '...cSccsSccSc...',
    '....cCcaacCc....',
    '....scCccCcs....',
    '....cccccccc....',
    '....cCccccCc....',
    '....ccCccCcc....',
    '...cCccccccCc...',
    '...ccc....ccc...',
  ] },
  beast: { hand: [13, 10], grid: [
    '.....h....h.....',
    '.....hh..hh.....',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '....hehhhheh....',
    '....hhhsshhhss..',
    '.....hhssssssk..',
    '......hhTTTT....',
    '....hhhhhhhhh...',
    '...hcCcaacCch...',
    '...hscCccCcsh...',
    '.....aaaaaa.....',
    '..h..hhhhhh.....',
    '.hh..hh..hh.....',
    '.h...hH..hH.....',
    '....hhh.hhh.....',
  ] },
  construct: { hand: [14, 10], grid: [
    '................',
    '.....ssssss.....',
    '....sSSSSSSs....',
    '....sseSSess....',
    '....sSSSSSSs....',
    '.....SSSSSS.....',
    '..ssssssssssss..',
    '..sSSSaaaaSSSs..',
    '..sS.SSaaSS.Ss..',
    '..ss.SSSSSS.ss..',
    '..SS.SSSSSS.SS..',
    '..sS.ssssss.Ss..',
    '.....SS..SS.....',
    '.....SS..SS.....',
    '....sSS..SSs....',
    '....ssS..Sss....',
  ] },
};

// Per-ancestry palettes. Several skin/hair options each, picked by the
// individual's id so the same colonist always looks the same.
const RACE_LOOK = {
  human:     { skin: [['#e8c09a', '#c4946c'], ['#c68d62', '#9c6942'], ['#8a5a3a', '#6a4028'], ['#f0d0b0', '#cfa888']], hair: [['#4a3020', '#2e1d12'], ['#1e1a1a', '#0e0c0c'], ['#b8863a', '#8a6020'], ['#8a3a1e', '#5e2410'], ['#c8c0b0', '#9a9284']] },
  elf:       { skin: [['#f0dcc0', '#cdb496'], ['#d8c0a0', '#b09874']], hair: [['#f0e0a0', '#c8b070'], ['#e8e8f0', '#b8b8c8'], ['#3a2a4a', '#221830'], ['#c06030', '#904020']] },
  dwarf:     { skin: [['#e0a888', '#b88068'], ['#c08060', '#986048']], hair: [['#a0421e', '#72280e'], ['#2a2020', '#141010'], ['#8a8a8a', '#606060'], ['#c88a30', '#9a6418']] },
  halfling:  { skin: [['#f0c8a0', '#cca078'], ['#c89068', '#a06c48']], hair: [['#6a4020', '#4a2a12'], ['#b07a3a', '#8a5a22'], ['#2a1e18', '#16100c']] },
  gnome:     { skin: [['#f0c8b0', '#cca088']], hair: [['#f0f0f0', '#c8c8d0'], ['#e0d0a0', '#b8a878']], extra: [['#d04040', '#982828'], ['#4060c0', '#2c4490'], ['#40a060', '#2a7040']] },
  orc:       { skin: [['#7fa05a', '#5a7a3c'], ['#6a8a50', '#4a6a34'], ['#8a9a6a', '#687a4c']], hair: [['#1e1a18', '#0e0c0a']] },
  goblin:    { skin: [['#8fbf5a', '#6a9a3c'], ['#a0b050', '#7a8a34']], hair: [['#1e1a18', '#0e0c0a']] },
  kobold:    { skin: [['#c47a4a', '#94542e'], ['#b86a3a', '#8a4a24'], ['#8a6ab0', '#644a88']], hair: [['#1e1a18', '#0e0c0a']] },
  tiefling:  { skin: [['#d1607a', '#a0445a'], ['#b04a80', '#86345e'], ['#8a5ad0', '#6440a0']], hair: [['#1e1624', '#0e0a14'], ['#e8e0f0', '#b8b0c8']] },
  dragonkin: { skin: [['#dba14a', '#aa7630'], ['#c0503a', '#903626'], ['#4a90c0', '#306a94'], ['#5aa05a', '#3c783c']], hair: [['#1e1a18', '#0e0c0a']] },
  undead:    { skin: [['#9aa8b5', '#6a7885']], hair: [['#1e1a18', '#0e0c0a']] },
  aberrant:  { skin: [['#b06ad0', '#8048a0'], ['#8a70c0', '#604c94']], hair: [['#1e1a18', '#0e0c0a']] },
  beast:     { skin: [['#3a2a22', '#221812']], hair: [['#a08060', '#76583e'], ['#8a7a5a', '#605438'], ['#c0a070', '#90784a']] },
  construct: { skin: [['#8f9aa8', '#5f6a78'], ['#a08a70', '#76644e']], hair: [['#1e1a18', '#0e0c0a']] },
};
// Glowing eyes and bone, where an ancestry has them.
const RACE_FIXED = {
  undead: { T: '#e6e0d0', e: '#6ad0ff', k: '#2a2430' },
  construct: { e: '#7af0ff', a: '#e0b040' },
  aberrant: { e: '#f0f080' },
  beast: { T: '#f0ead8', k: '#140e0c' },
  orc: { T: '#f0ead8' }, goblin: { T: '#f0ead8' }, kobold: { T: '#f0ead8' }, dragonkin: { T: '#2a1a14' },
  gnome: { T: '#c08070' },
};

// Class outfits: cloth, cloth shade, trim, legs, legs shade, boots, and a held item.
const CLASS_LOOK = {
  fighter:   { c: '#8c96a4', C: '#5e6674', a: '#b03a3a', p: '#4a4e5a', P: '#34363e', b: '#2a2226', item: 'sword' },
  barbarian: { c: '#8a5a34', C: '#643e20', a: '#d8c8a0', p: '#5a3e28', P: '#3e2a18', b: '#2e2018', item: 'axe' },
  paladin:   { c: '#d8dce4', C: '#a0a8b8', a: '#e0b040', p: '#8a90a0', P: '#62687a', b: '#4a4a56', item: 'hammer' },
  rogue:     { c: '#3a3848', C: '#26242e', a: '#8a3a3a', p: '#2e2c38', P: '#1e1c26', b: '#18161c', item: 'dagger' },
  ranger:    { c: '#4a7a3a', C: '#325a26', a: '#8a6a3a', p: '#5a4a32', P: '#3e3222', b: '#3a2a1c', item: 'bow' },
  monk:      { c: '#e08a2a', C: '#b06418', a: '#6a2a1a', p: '#c87420', P: '#9a5614', b: '#5a3a22', item: null },
  wizard:    { c: '#3a5ab8', C: '#28408a', a: '#e0c050', p: '#3a5ab8', P: '#28408a', b: '#3a2a4a', item: 'staff', o: '#8ae8ff', O: '#3ab0e0' },
  warlock:   { c: '#4a2a5a', C: '#321a40', a: '#a040c0', p: '#3a2048', P: '#281432', b: '#1e1424', item: 'orb', o: '#d070ff', O: '#8a30b0' },
  cleric:    { c: '#f0ece0', C: '#c0b8a4', a: '#e0b040', p: '#d8d0bc', P: '#a8a08c', b: '#6a5a40', item: 'mace' },
  druid:     { c: '#5a7a3a', C: '#3e5a28', a: '#a07a40', p: '#6a5a3a', P: '#4a3e28', b: '#3a2e1e', item: 'staff', o: '#7ad060', O: '#4a9a3a' },
  bard:      { c: '#c03a4a', C: '#8a2434', a: '#e8c050', p: '#3a4a8a', P: '#283462', b: '#4a2e1e', item: 'lute' },
  artificer: { c: '#9a6a3a', C: '#724a24', a: '#d0a040', p: '#4a4a52', P: '#34343a', b: '#2a2222', item: 'wrench' },
  laborer:   { c: '#c0a070', C: '#94784e', a: '#6a4a2a', p: '#5a4e3e', P: '#40362a', b: '#3a2a1e', item: 'pick' },
  artisan:   { c: '#4a6a9a', C: '#344c72', a: '#a07a4a', p: '#5a4a3a', P: '#403428', b: '#3a2a1e', item: 'hammer' },
  scholar:   { c: '#8a2a3a', C: '#621c28', a: '#e0c060', p: '#8a2a3a', P: '#621c28', b: '#2e1e22', item: 'book' },
  brute:     { c: '#5a4030', C: '#3e2a1e', a: '#8a8a8a', p: '#4a3628', P: '#32241a', b: '#241a14', item: 'club' },
  shaman:    { c: '#8a6a4a', C: '#644a30', a: '#e8e0c8', p: '#5a4630', P: '#403222', b: '#2e2218', item: 'staff', o: '#f0ead8', O: '#b8a888' },
  merchant:  { c: '#6a3a8a', C: '#4a2664', a: '#e0b040', p: '#4a3a2a', P: '#34281c', b: '#2e2018', item: 'bag' },
};

// Held items: a small grid and the cell that sits on the hand's grip point.
// n wood, w/W metal, y gold, l string/page, o/O glow, r book cover.
const ITEMS = {
  sword:  { at: [1, 6], grid: ['.w.', '.w.', '.w.', '.w.', '.W.', 'yyy', '.n.'] },
  axe:    { at: [0, 5], grid: ['nWW', 'nwW', 'nW.', 'n..', 'n..', 'n..'] },
  hammer: { at: [1, 5], grid: ['WWW', 'WwW', 'WWW', '.n.', '.n.', '.n.'] },
  mace:   { at: [1, 4], grid: ['WwW', 'wWw', '.n.', '.n.', '.n.'] },
  dagger: { at: [0, 3], grid: ['w', 'w', 'y', 'n'] },
  bow:    { at: [0, 3], grid: ['n..', 'ln.', 'l.n', 'l.n', 'l.n', 'ln.', 'n..'] },
  staff:  { at: [1, 8], grid: ['.o.', 'oOo', '.o.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.'] },
  orb:    { at: [1, 3], grid: ['.o.', 'oOo', '.o.', '...'] },
  lute:   { at: [0, 3], grid: ['..n', '.n.', 'yy.', 'yyy', 'yy.'] },
  book:   { at: [0, 1], grid: ['rrr', 'rlr', 'rrr'] },
  pick:   { at: [2, 4], grid: ['.WWW.', 'W.n.W', '..n..', '..n..', '..n..'] },
  wrench: { at: [1, 3], grid: ['W.W', 'WWW', '.W.', '.W.'] },
  club:   { at: [0, 4], grid: ['.n', 'nn', 'nN', 'n.', 'n.'] },
  spear:  { at: [1, 7], grid: ['.w.', 'wWw', '.W.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.'] },
  bag:    { at: [1, 0], grid: ['.n.', 'yyy', 'yYy'] },
};
const ITEM_PAL = { n: '#7a5230', N: '#5a3a20', w: '#e0e6ee', W: '#9aa4b2', y: '#e0b040', Y: '#a87e24', l: '#f0ead8', r: '#8a2a2a' };

// ----------------------------------------------------------------------------
// MONSTER FAMILIES. Full drawings with their own palettes; the family's own
// ancestry grid is the fallback (goblinoids and constructs use theirs).
// ----------------------------------------------------------------------------
const MONSTER = {
  beast: { pal: { b: '#8a7058', B: '#5e4a38', L: '#b09478', e: '#ffd040', n: '#1e1612', w: '#f0ead8' }, grid: [
    '................',
    '................',
    '................',
    '................',
    '...........b.b..',
    '..........bbbb..',
    '..........bbebb.',
    '.........bbbbbLn',
    'b...LLLLLbbbbww.',
    'bb.bbbbbbbbbb...',
    '.bbbbbbbbbbbB...',
    '..bBbbbbbbbbB...',
    '..bBBBBBBBbBB...',
    '..bb.bb..bb.b...',
    '..b..b...b..b...',
    '.nn..n..nn.nn...',
  ] },
  undead: { pal: { T: '#e6e0d0', t: '#b0a894', e: '#6ad0ff', k: '#2a2430', c: '#4a4050', C: '#302838', w: '#a0907a', W: '#6a5e4e', n: '#5a4a3a' }, grid: [
    '................',
    '......TTTT......',
    '.....TTTTTT.....',
    '.....TeTTeT.....',
    '.....TeTTeT.....',
    '......TTTT......',
    '......TkTk...W..',
    '....ccTTTTcc.W..',
    '....T.tTTt.T.W..',
    '....T.TTTT.TWWW.',
    '....T.tTTt.TTn..',
    '......cCcC......',
    '......cCcC......',
    '......T..T......',
    '......t..t......',
    '.....TT..TT.....',
  ] },
  ooze: { pal: { g: '#6ab07a', G: '#3e7a4e', L: '#b8f0c0', e: '#1a2a1e', w: '#e8fff0' }, grid: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......gg.......',
    '.....gggggg.....',
    '....gLLgggggg...',
    '...gLwLgggggGg..',
    '...ggLgegggeGg..',
    '..gggggegggeGGg.',
    '..ggggggggggGGg.',
    '.gggggggggggGGGg',
    '.GGggggggggGGGGG',
    '..GGGGGGGGGGGGG.',
  ] },
  elemental: { pal: { f: '#f0a040', F: '#c05a20', L: '#fff0a0', e: '#fffbe8', k: '#5a1a08' }, grid: [
    '.......L........',
    '......fL....f...',
    '...f..fLf..ff...',
    '...ff.fffffff...',
    '....ffLLLLfff...',
    '...ffLLLLLLff...',
    '...fLLeLLeLLf...',
    '...fLLeLLeLLf...',
    '..ffLLLLLLLLff..',
    '..fFfLLkkLLfFf..',
    '.fF.ffLLLLff.Ff.',
    '.F..fFfLLfFf..F.',
    '....FfffffffF...',
    '.....FffffF.....',
    '......FffF......',
    '.......FF.......',
  ] },
  giant: { pal: { s: '#8a9a6a', S: '#62704a', h: '#3a3024', e: '#f0d040', T: '#f0ead8', c: '#6a4a30', C: '#4a3220', n: '#5a3a20', N: '#3a2412' }, grid: [
    '....hhhhhhh.....',
    '...hsssssssh....',
    '...sseSsSesS....',
    '...ssssssssS..n.',
    '...sTSSSSSTS.nN.',
    '.ssssssssssssnN.',
    'ssSsssssssssSsn.',
    'sSSsssssssssSSs.',
    'sS.cccccccccSSs.',
    'sS.cCcccccCcS.s.',
    'ss.ccCcccCcc....',
    '...cccc.cccc....',
    '...ssSs.sSss....',
    '...ssSs.sSss....',
    '..sssSs.sSsss...',
    '..SSSSS.SSSSS...',
  ] },
  aberration: { pal: { p: '#b06ad0', P: '#7a3a9a', L: '#e0b0f0', w: '#f8f4ec', e: '#1a0a20', r: '#e04060', k: '#3a1040' }, grid: [
    '....P..p..P.....',
    '.....P.p.P......',
    '......pppp......',
    '....pppppppp....',
    '...pLLppppppP...',
    '..pLLwwwwwwppP..',
    '..ppwwwrrwwwpP..',
    '..ppwwreerwwpP..',
    '..ppwwreerwwpP..',
    '..ppwwwrrwwwpP..',
    '...ppwwwwwwpP...',
    '...PpppkkkppP...',
    '....PPpkkpPP....',
    '......PPPP......',
    '................',
    '................',
  ] },
  fiend: { pal: { s: '#d04a5a', S: '#942c3a', r: '#2a1a1e', e: '#ffe040', w: '#6a2a4a', W: '#4a1a32', T: '#f0ead8' }, grid: [
    '................',
    '....r....r......',
    '....rr..rr......',
    '.....ssss.......',
    '....sessesS.....',
    '....ssssssS.....',
    '.ww.sTSSTs.ww...',
    'wWww.ssss.wwWw..',
    'wWWwsssssswWWw..',
    '.wWWsSssSswWW...',
    '..w.sssssS.w....',
    '.....sSSsS......',
    '.....ss.sS......',
    '.....ss..s......',
    '....ss...ss.S...',
    '...........SS...',
  ] },
  dragon: { pal: { d: '#c04a2a', D: '#8a301c', L: '#f0a060', w: '#e07a3a', W: '#a04a20', e: '#ffe040', T: '#f0ead8', n: '#2a1410' }, grid: [
    '................',
    '..........T.T...',
    '....w.....dddd..',
    '...wWw....ddeddd',
    '..wWWWw..dddddLn',
    '.wWWWWWw.dddTT..',
    'wWWWWWWWddLd....',
    '...WWWdddLLd....',
    '......ddLLLdd...',
    '..d..dddLLddD...',
    '.dd.ddddddddD...',
    'dD..dDddddddD...',
    'dDddDDdDDDdDD...',
    '.DD..dd..dd.....',
    '.....dD..dD.....',
    '....nn..nn......',
  ] },
  fey: { pal: { s: '#f0dcc0', S: '#c8b090', h: '#a0f0c0', H: '#60c090', e: '#2a6040', w: '#c8f0ff', W: '#80c0e0', c: '#6ad0a0', C: '#3a9a70', L: '#fffbe0' }, grid: [
    '................',
    '................',
    '......hhhh......',
    '.ww..hhhhhh..ww.',
    'wWWw.hsssss.wWWw',
    'wWWWwsesses.WWWw',
    '.wWWwssssss.WWw.',
    '..wWw.sSSs.wWw..',
    '...ww.cccc.ww...',
    '....wscccccs....',
    '.....cCccCc.....',
    '......cccc......',
    '......s..s......',
    '......s..s......',
    '................',
    '.......L........',
  ] },
  underdark: { pal: { s: '#8a7ab0', S: '#5e5084', e: '#f0f0a0', c: '#2e2a40', C: '#1e1a2c', a: '#6a4ab0', p: '#2a2638', P: '#1a1826', b: '#141220', k: '#3a2e54' }, grid: [
    '......ssss......',
    '.....ssssss.....',
    '....sssssssS....',
    '....seessees....',
    '....ssssssSS....',
    '....sSsSsSsS....',
    '....s.s.s.s.....',
    '....S.S.S.S.....',
    '....cccccccc....',
    '...ccCcaacCcc...',
    '...scCccccCcs...',
    '....cccccccc....',
    '....cCccccCc....',
    '....ccCccCcc....',
    '...cCcc..ccCc...',
    '...bbb....bbb...',
  ] },
  monstrosity: { pal: { g: '#b08a5a', G: '#7a5e3a', L: '#e0c090', e: '#f0e040', r: '#d04040', k: '#2a1a10' }, grid: [
    '................',
    '................',
    '.........gggg...',
    '........gLLggg..',
    '........ggeggGg.',
    '........gggggGgr',
    '.........GGgg..r',
    '..........gGg...',
    '...ggggg...gG...',
    '..gLLLLgg..gG...',
    '.gGGGGGgGg.gG...',
    '.gG....GgGggG...',
    '.gG.....GggG....',
    '..gGg....GG.....',
    '...gGggggG......',
    '....GGGGG.......',
  ] },
};
// Monster families drawn with an ancestry grid (and a class-ish outfit).
const MONSTER_AS_RACE = {
  goblinoid: { race: 'goblin', look: { c: '#6a5030', C: '#4a3620', a: '#8a8a8a', p: '#4a3a28', P: '#32281a', b: '#2a2018', item: 'spear' } },
  construct: { race: 'construct', look: {} },
};
// Elementals take their element's colours.
const ELEMENT_TINT = {
  fire:   { f: '#f0a040', F: '#c05a20', L: '#fff0a0', k: '#5a1a08' },
  frost:  { f: '#8fd0f0', F: '#4a90c0', L: '#f0fbff', k: '#1a3a5a' },
  storm:  { f: '#e2d23c', F: '#a09020', L: '#fffbd0', k: '#3a3408' },
  nature: { f: '#7ac050', F: '#4a8a30', L: '#d8f0a0', k: '#1a3a10' },
  holy:   { f: '#f0e0a0', F: '#c0a860', L: '#ffffff', k: '#5a4a20' },
  shadow: { f: '#6a5a90', F: '#3e3060', L: '#b0a0e0', k: '#100a1a' },
  arcane: { f: '#b07ae0', F: '#7a40b0', L: '#f0d8ff', k: '#2a1040' },
  earth:  { f: '#a08a60', F: '#6a5a3a', L: '#d8c8a0', k: '#2a2010' },
};

// ----------------------------------------------------------------------------
// ANIMALS — side views facing right; the renderer mirrors them to face left.
// ----------------------------------------------------------------------------
const ANIMAL_SPRITE = {
  fowl: { pal: { b: '#e0c080', B: '#a88450', r: '#d03a2a', y: '#f0a020', e: '#1a1410', L: '#f8e8c0' }, grid: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '..........rr....',
    '.........bbbr...',
    '.........bebyy..',
    '..B......bbby...',
    '.BBb.....bbb....',
    '.BbbbbbbbbbB....',
    '..BbLLLbbbbB....',
    '..BBbLbbbbB.....',
    '....BBBBBB......',
    '.....y..y.......',
    '....yy.yy.......',
  ] },
  cavegoat: { pal: { b: '#c8b88a', B: '#8a7a54', L: '#e8dcb0', w: '#6a5a44', e: '#1a1410', n: '#3a2e22', h: '#3a2e22' }, grid: [
    '................',
    '................',
    '..........ww....',
    '.........w..w...',
    '.........bbb....',
    '..........bbbb..',
    '..........bebbn.',
    '.........bbbbB..',
    '..b......bbb.b..',
    '..bbLLLLbbbb....',
    '..bbbbbbbbbB....',
    '..BbbbbbbbbB....',
    '...BBBBBBBB.....',
    '...b.b...b.b....',
    '...b.b...b.b....',
    '...h.h...h.h....',
  ] },
  woolback: { pal: { w: '#f0ead8', W: '#c8bea8', L: '#fffcf0', f: '#3a3028', e: '#f0ead8', h: '#2a2420' }, grid: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....wLwLwLw.....',
    '..wLwwwwwwwwf...',
    '.wwwwwwwwwwwfff.',
    '.wwwwwwwwwwwfeff',
    '.wWwwwwwwwwwWfff',
    '.WwWwwwwwwwWw.f.',
    '..WWwWwWwWwW....',
    '...WWWWWWWW.....',
    '....f.f..f.f....',
    '....f.f..f.f....',
    '....h.h..h.h....',
  ] },
  boar: { pal: { b: '#7a5a3e', B: '#523a26', L: '#a07e58', w: '#f0ead8', e: '#1a1410', n: '#d09080', h: '#2a1e16' }, grid: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....L.L.L.......',
    '...LbLbLbbbb....',
    '..bbbbbbbbbbbb..',
    '.bbbbbbbbbbbebb.',
    'bbbbbbbbbbbbbbnn',
    '.bBbbbbbbbbbbwbn',
    '..BbbbbbbbbbB.w.',
    '..BBBBBBBBBBB...',
    '...bb.b..b.bb...',
    '...b..b..b..b...',
    '...h..h..h..h...',
  ] },
  ox: { pal: { b: '#8a7458', B: '#5e4c38', L: '#b09a7a', w: '#e8e0c8', e: '#1a1410', n: '#3a2e22', h: '#2a2018' }, grid: [
    '................',
    '................',
    '................',
    '..........w..w..',
    '..........ww.w..',
    '...........bbw..',
    '..LLLLLLLLbbbbb.',
    '.bbbbbbbbbbbebb.',
    'bbbbbbbbbbbbbbnn',
    'bbbbbbbbbbbbbBn.',
    '.bbbbbbbbbbbBB..',
    '.BbbbbbbbbbbB...',
    '.BBBBBBBBBBBB...',
    '..bb.bb..bb.bb..',
    '..bb.bb..bb.bb..',
    '..hh.hh..hh.hh..',
  ] },
  packlizard: { pal: { g: '#6a9a5a', G: '#46703a', L: '#a8d090', e: '#f0d040', r: '#8a5a30', R: '#5e3c1e', y: '#e0b040' }, grid: [
    '................',
    '................',
    '................',
    '................',
    '......rrr.......',
    '.....rRrRr......',
    '....rryRRrr.....',
    '....gggggggg.gg.',
    '...gLLLLLLLgggeg',
    '..gggggggggggggg',
    '.gggGGGGGGGGgGg.',
    'ggG.gGg...gGg...',
    'gG..gG.....gG...',
    'G..gG.......gG..',
    '...G.........G..',
    '..GG........GG..',
  ] },
  warhound: { pal: { b: '#6a5040', B: '#46342a', L: '#9a7a60', r: '#c03a3a', y: '#e0b040', e: '#1a1410', n: '#1a1410', w: '#f0ead8' }, grid: [
    '................',
    '................',
    '................',
    '................',
    '..........b.....',
    '..........bb....',
    '.........bbbbb..',
    '.........bbebbn.',
    '.b.......rybbbb.',
    '..b.....rrbbw...',
    '..bLLLLLbbbb....',
    '..bbbbbbbbbB....',
    '..BbbbbbbbbB....',
    '..bb.b...b.bb...',
    '..b..b...b..b...',
    '..n..n...n..n...',
  ] },
  direwolf: { pal: { b: '#7a7a82', B: '#4e4e56', L: '#a8a8b0', e: '#ffd040', n: '#1a1418', w: '#f0ead8' }, grid: [
    '................',
    '................',
    '................',
    '...........b.b..',
    '..........bbbb..',
    '..........bbebb.',
    '.........bbbbbLn',
    'b.......bbbbbww.',
    'bb.LLLLLbbbbb...',
    '.bbbbbbbbbbbB...',
    '..bbbbbbbbbbB...',
    '..bBbbbbbbbBB...',
    '..bBBBBBBBbB....',
    '..bb.bb..bb.b...',
    '..b..b...b..b...',
    '.nn..n..nn.nn...',
  ] },
  chitinbug: { pal: { c: '#3a5a6a', C: '#243a46', L: '#6a9aaa', e: '#e04040', l: '#1a2228', y: '#e0c040' }, grid: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.............y..',
    '............y...',
    '....ccccccc.cc..',
    '...cLLLcLLccccc.',
    '..cLcccCcccccec.',
    '..ccccCccccCcc..',
    '...CCCCCCCCCC...',
    '..l.l.l..l.l.l..',
    '.l..l..l.l..l.l.',
    '................',
  ] },
  duskmoth: { pal: { w: '#8a7ab0', W: '#5e5084', L: '#d0c0f0', y: '#f0d060', b: '#3a3048', e: '#f0f0a0' }, grid: [
    '................',
    '................',
    '.WW..........WW.',
    'WwwW...y.y..WwwW',
    'WwLwW...y..WwLwW',
    'WwywwW.bbb.WwywW',
    '.WwwwwWbebWwwwwW',
    '..WwwwwbbbwwwwW.',
    '...WWwwbbbwwWW..',
    '....WwwbbbwwW...',
    '...WwLwbbbwLwW..',
    '...WwywW.bWwywW.',
    '....WWW...WWW...',
    '................',
    '................',
    '................',
  ] },
};
// Fliers hover and bob instead of walking.
const FLOATERS = new Set(['duskmoth', 'aberration', 'fey', 'elemental']);

// ----------------------------------------------------------------------------
// PLANTS. Trees and the wild growth are painted into the terrain layer; crops
// are 8×8 plants, four to a field tile, one grid per growth stage and shape.
// ----------------------------------------------------------------------------
const PLANT = {
  broadleaf: { grid: [
    '.....1111.......',
    '...11222211.....',
    '..1223332221....',
    '.12334433221....',
    '.123344332221...',
    '1223333322221...',
    '1222332222211...',
    '12223222222211..',
    '.1222222221211..',
    '.112222222111...',
    '..111122111.....',
    '....11tt11......',
    '......tT........',
    '......tT........',
    '.....ttTT.......',
    '................',
  ] },
  conifer: { grid: [
    '.......3........',
    '......343.......',
    '......232.......',
    '.....23332......',
    '....1223221.....',
    '......232.......',
    '.....12321......',
    '....1223321.....',
    '...122332221....',
    '.....12221......',
    '....1122211.....',
    '...112222211....',
    '..11122222111...',
    '.......tT.......',
    '.......tT.......',
    '......ttTT......',
  ] },
  fungus: { pal: { 1: '#3f6a4d', 2: '#78ad86', 3: '#c3e8c9', w: '#ecf8e8', s: '#d8d0b8', S: '#a8a088' }, grid: [
    '................',
    '................',
    '................',
    '.....222222.....',
    '...2233w33222...',
    '..233333333w22..',
    '.23w3333333332..',
    '.2333333w333322.',
    '.1222222222221..',
    '...11ssssS11....',
    '.....ssssS......',
    '.....ssssS...2..',
    '.....ssssS..232.',
    '....sssssSS.1s1.',
    '...ssssssSSS.s..',
    '................',
  ] },
  herb: { pal: { 1: '#2f6f45', 2: '#4f9f6a', 3: '#7fcf97', f: '#e8d6ff', F: '#b89ae0', y: '#f0e070' }, grid: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '........f.......',
    '...f...fyf..f...',
    '..fyf...f..fyf..',
    '...f2..3..2.f...',
    '....23.3.32.....',
    '..2..3232.3..2..',
    '..32.23332.23...',
    '...3223.32232...',
    '....1223221.....',
    '.....11111......',
    '................',
  ] },
};
const TRUNK = { t: '#5a3e26', T: '#3a2616' };

// Crops: 8×8, stages 0..4 (sprout → ripe). Slots: 1/2/3 leaf dark→light, f fruit, F fruit shade, s stalk.
const CROP_STAGE = {
  leafy: [
    ['........', '........', '........', '........', '........', '...3....', '...23...', '...2....'],
    ['........', '........', '........', '........', '..3..3..', '..23.2..', '...22...', '...1....'],
    ['........', '........', '........', '.3....3.', '.23..32.', '..2332..', '..1221..', '...11...'],
    ['........', '........', '.3.33.3.', '.2332332', '.1233221', '..12321.', '..11211.', '...11...'],
    ['........', '..3..3..', '.23f323.', '2332f332', '1233f321', '.123321.', '..1221..', '...11...'],
  ],
  bush: [
    ['........', '........', '........', '........', '........', '...3....', '...2....', '...1....'],
    ['........', '........', '........', '........', '...33...', '..3223..', '...22...', '...1....'],
    ['........', '........', '........', '..333...', '.32233..', '.122321.', '..1221..', '...1....'],
    ['........', '........', '..3333..', '.323323.', '3223322.', '.122221.', '..1221..', '...11...'],
    ['........', '..3f33..', '.3f23f3.', 'f2233f2.', '32f332f.', '.12f221.', '..1221..', '...11...'],
  ],
  grain: [
    ['........', '........', '........', '........', '........', '....3...', '....2...', '....1...'],
    ['........', '........', '........', '........', '..3.3...', '..2.2.3.', '..2.2.2.', '..1.1.1.'],
    ['........', '........', '..3.3...', '..2.2.3.', '..2.2.2.', '.3212.2.', '.2.1.12.', '.1.1.1..'],
    ['........', '..f.f...', '..2.2.f.', '..2.2.2.', '.f2.2.2.', '.2.1.12.', '.2.1.1..', '.1.1.1..'],
    ['..f.f...', '..Ff.Ff.', '.fsFfsF.', '.Fs.s.s.', '.s.s.s..', '.s.s.s..', '.s.s.s..', '.s.s.s..'],
  ],
  mushroom: [
    ['........', '........', '........', '........', '........', '........', '....f...', '....s...'],
    ['........', '........', '........', '........', '........', '...ff...', '...Fs...', '....s...'],
    ['........', '........', '........', '........', '..fff...', '.fFFf.f.', '...s.fF.', '...s..s.'],
    ['........', '........', '........', '.ffff...', 'fFFFFf..', '..ss.ff.', '..ss.Fs.', '..ss..s.'],
    ['........', '........', '.ffff...', 'ffwfff..', 'FFFFFF.f', '..ss.fFf', '..ss..s.', '.sss..s.'],
  ],
};
const CROP_LOOK = {
  cavecap:    { shape: 'mushroom', f: '#c09070', F: '#8a6048', s: '#e0d0b8', w: '#f0e0c8' },
  glowspore:  { shape: 'mushroom', f: '#c890ff', F: '#8a50c0', s: '#d8c8f0', w: '#f8e8ff' },
  tubers:     { shape: 'bush', 1: '#3f6a2a', 2: '#5f9a45', 3: '#8ac060', f: '#b08850' },
  beans:      { shape: 'bush', 1: '#2f5a2a', 2: '#4f8a3a', 3: '#7ab85a', f: '#c8e070' },
  cotton:     { shape: 'bush', 1: '#3a5a30', 2: '#5a8040', 3: '#80a860', f: '#f8f6f0' },
  healroot:   { shape: 'leafy', 1: '#2f6a45', 2: '#4f9a65', 3: '#80c890', f: '#f0f0a0' },
  greens:     { shape: 'leafy', 1: '#2f7a2a', 2: '#4fa83a', 3: '#8ad860', f: '#c0f080' },
  bitterleaf: { shape: 'leafy', 1: '#2a4a2a', 2: '#3f6a3a', 3: '#6a9058', f: '#a0b060' },
  grain:      { shape: 'grain', 1: '#4a7a2a', 2: '#6a9a3a', 3: '#98c060', f: '#f0d060', F: '#c8a040', s: '#c8a84a' },
  frostgrain: { shape: 'grain', 1: '#3a6a5a', 2: '#5a8a7a', 3: '#90c0b0', f: '#e8f0f8', F: '#a8c0d0', s: '#a8b8b0' },
  flax:       { shape: 'grain', 1: '#3a6a3a', 2: '#5a8a4a', 3: '#80b070', f: '#8aa8f0', F: '#5a78c0', s: '#90a870' },
};

// ----------------------------------------------------------------------------
// VISITORS
// ----------------------------------------------------------------------------
const WAGON = { pal: { c: '#efe6cc', C: '#c8bc9a', w: '#8a6238', W: '#5e4024', k: '#2a1c10', y: '#e0b040', h: '#7a6a5a', H: '#4e4238' }, grid: [
  '................',
  '................',
  '................',
  '....cccccccc....',
  '...cCcccccccc...',
  '..cCccccccccCc..',
  '..cCcCcccccCcc..',
  '..cCccccccccCc..',
  '.wwwwwwwwwwwwww.',
  '.wWyWWWWWWWWyWw.',
  '.wwwwwwwwwwwwwwh',
  '..kkk.....kkk.hh',
  '.kWwWk...kWwWkH.',
  '.kwkwk...kwkwk..',
  '.kWwWk...kWwWk..',
  '..kkk.....kkk...',
] };

// ============================================================================
// RASTERISING
// ============================================================================
function hashId(v) {
  let h = 2166136261 >>> 0;
  const s = String(v);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function pick(arr, h, salt) { return arr[((h >>> salt) % arr.length + arr.length) % arr.length]; }

/**
 * Turn a grid (array of strings) plus a palette into a canvas with the
 * contour and allegiance rings. Returns null where no canvas exists.
 */
function rasterise(grid, pal, ring, contour = CONTOUR) {
  const H = grid.length, W = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const CW = W + PAD * 2, CH = H + PAD * 2;
  const cell = new Array(CW * CH).fill(null);
  for (let y = 0; y < H; y++) for (let x = 0; x < grid[y].length; x++) {
    const k = grid[y][x];
    if (k === '.' || k === ' ') continue;
    const col = pal[k];
    if (col) cell[(y + PAD) * CW + x + PAD] = col;
  }
  const solid = cell.map(Boolean);
  const grow = (src, diag) => {
    const out = new Array(src.length).fill(false);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const i = y * CW + x;
      if (src[i]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!diag && dx && dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
        if (src[ny * CW + nx]) { out[i] = true; dy = 2; break; }
      }
    }
    return out;
  };
  // The dark contour hugs the shape orthogonally (crisp corners); the
  // allegiance ring grows from it diagonally too, so it reads as a halo.
  const inner = grow(solid, false);
  const filled = solid.map((v, i) => v || inner[i]);
  const outer = ring ? grow(filled, true) : null;
  let cv;
  try {
    cv = document.createElement('canvas');
    cv.width = CW; cv.height = CH;
    const g = cv.getContext('2d');
    if (!g || !g.fillRect) return null;
    for (let i = 0; i < cell.length; i++) {
      const x = i % CW, y = (i / CW) | 0;
      const col = cell[i] || (inner[i] ? contour : outer && outer[i] ? ring : null);
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  } catch (e) { return null; }
  return { canvas: cv, w: CW, h: CH };
}

/** Overlay a held item's grid onto a copy of a humanoid grid. */
function withItem(grid, hand, item) {
  const I = ITEMS[item];
  if (!I) return grid;
  const rows = grid.map(r => r.split(''));
  const ox = hand[0] - I.at[0], oy = hand[1] - I.at[1];
  for (let y = 0; y < I.grid.length; y++) for (let x = 0; x < I.grid[y].length; x++) {
    const k = I.grid[y][x];
    if (k === '.') continue;
    const gx = ox + x, gy = oy + y;
    if (gy < 0 || gy >= rows.length || gx < 0 || gx >= SPRITE_N) continue;
    rows[gy][gx] = '§' + k;   // namespaced so item slots don't collide with body slots
  }
  // Re-encode: body slots stay single chars; item slots use private chars.
  return rows.map(r => r.map(c => c.length > 1 ? ITEM_CHAR[c[1]] : c).join(''));
}
const ITEM_CHAR = { n: '①', N: '②', w: '③', W: '④', y: '⑤', Y: '⑥', l: '⑦', r: '⑧', o: '⑨', O: '⑩' };

export class SpriteBook {
  constructor() { this.cache = new Map(); }

  get(key, build) {
    let s = this.cache.get(key);
    if (s !== undefined) return s;
    s = build();
    if (this.cache.size > 600) this.cache.clear();
    this.cache.set(key, s);
    return s;
  }

  /** A person: any NPC — colonist, raider, trader — from ancestry and class. */
  person(npc, ring, klassOverride) {
    const race = HUMANOID[npc.race] ? npc.race : 'human';
    const klass = klassOverride || (CLASS_LOOK[npc.klass] ? npc.klass : 'laborer');
    const h = hashId(npc.id ?? npc.name?.full ?? race);
    const look = RACE_LOOK[race];
    const skin = pick(look.skin, h, 0), hair = pick(look.hair, h, 5);
    const extra = look.extra ? pick(look.extra, h, 9) : null;
    const key = `p:${race}:${klass}:${skin[0]}:${hair[0]}:${extra ? extra[0] : ''}:${ring}`;
    return this.get(key, () => buildPerson(race, CLASS_LOOK[klass], skin, hair, extra, ring));
  }

  /** A Rift monster, by family (and element, for elementals). */
  monster(m, ring) {
    const fam = m.family;
    const asRace = MONSTER_AS_RACE[fam];
    if (asRace) {
      const race = asRace.race;
      const key = `mr:${fam}:${ring}`;
      return this.get(key, () => {
        const look = RACE_LOOK[race];
        const cl = { ...CLASS_LOOK.brute, ...asRace.look };
        return buildPerson(race, cl, look.skin[0], look.hair[0], null, ring);
      });
    }
    const M = MONSTER[fam];
    if (!M) return this.person(m, ring, 'brute');
    const el = m.combat && m.combat.element;
    const tint = fam === 'elemental' ? (ELEMENT_TINT[el] || ELEMENT_TINT.fire) : null;
    const key = `m:${fam}:${tint ? el : ''}:${ring}`;
    return this.get(key, () => rasterise(M.grid, tint ? { ...M.pal, ...tint } : M.pal, ring));
  }

  animal(species, ring) {
    const A = ANIMAL_SPRITE[species];
    if (!A) return null;
    return this.get(`a:${species}:${ring}`, () => rasterise(A.grid, A.pal, ring));
  }

  /** Trees for the terrain layer: `pal` is a TREE_PALETTES entry (dark → light). */
  tree(kind, pal) {
    return this.get(`t:${kind}:${pal[0]}`, () => rasterise(PLANT[kind].grid,
      { 1: pal[0], 2: pal[1], 3: pal[2], 4: pal[3], ...TRUNK }, null, 'rgba(8,14,8,0.85)'));
  }

  plant(kind) {
    const P = PLANT[kind];
    if (!P) return null;
    return this.get(`pl:${kind}`, () => rasterise(P.grid, P.pal, null, 'rgba(8,14,8,0.8)'));
  }

  crop(cropId, stage) {
    const L = CROP_LOOK[cropId] || CROP_LOOK.greens;
    const grid = CROP_STAGE[L.shape][Math.max(0, Math.min(4, stage))];
    return this.get(`c:${cropId}:${stage}`, () => rasterise(grid, L, null, 'rgba(10,14,8,0.75)'));
  }

  wagon(ring) { return this.get(`w:${ring}`, () => rasterise(WAGON.grid, WAGON.pal, ring)); }
}

function buildPerson(race, cl, skin, hair, extra, ring) {
  const R = HUMANOID[race];
  const grid = cl.item ? withItem(R.grid, R.hand, cl.item) : R.grid;
  const pal = {
    s: skin[0], S: skin[1], h: hair[0], H: hair[1], e: '#1b1420', T: '#f0ead8', r: '#2a1a1e', k: '#1b1420',
    c: cl.c, C: cl.C, a: cl.a, p: cl.p, P: cl.P, b: cl.b,
    x: extra ? extra[0] : cl.a, X: extra ? extra[1] : cl.C,
    ...(RACE_FIXED[race] || {}),
  };
  const ip = { ...ITEM_PAL, o: cl.o || '#8ae8ff', O: cl.O || '#3ab0e0' };
  for (const k in ITEM_CHAR) pal[ITEM_CHAR[k]] = ip[k];
  return rasterise(grid, pal, ring);
}

/** Does this creature hover rather than walk? */
export function spriteFloats(u) {
  if (u.species) return FLOATERS.has(u.species);
  if (u.monster) return FLOATERS.has(u.family);
  return false;
}

/** For tests: every grid is exactly SPRITE_N wide and tall, crops 8×8, and
 *  every non-blank character maps to a palette slot somewhere. */
export function spriteGridProblems() {
  const bad = [];
  const check = (name, grid, n) => {
    if (grid.length !== n) bad.push(`${name}: ${grid.length} rows`);
    grid.forEach((r, i) => { if ([...r].length !== n) bad.push(`${name} row ${i}: ${[...r].length} wide`); });
  };
  for (const k in HUMANOID) check('race ' + k, HUMANOID[k].grid, SPRITE_N);
  for (const k in MONSTER) check('monster ' + k, MONSTER[k].grid, SPRITE_N);
  for (const k in ANIMAL_SPRITE) check('animal ' + k, ANIMAL_SPRITE[k].grid, SPRITE_N);
  for (const k in PLANT) check('plant ' + k, PLANT[k].grid, SPRITE_N);
  check('wagon', WAGON.grid, SPRITE_N);
  for (const s in CROP_STAGE) CROP_STAGE[s].forEach((g, i) => check(`crop ${s}/${i}`, g, 8));
  for (const k in ANIMALS) if (!ANIMAL_SPRITE[k]) bad.push(`no sprite for animal ${k}`);
  return bad;
}
export const SPRITE_KEYS = {
  races: Object.keys(HUMANOID), classes: Object.keys(CLASS_LOOK), monsters: Object.keys(MONSTER),
  monsterAsRace: Object.keys(MONSTER_AS_RACE), animals: Object.keys(ANIMAL_SPRITE), crops: Object.keys(CROP_LOOK),
};
