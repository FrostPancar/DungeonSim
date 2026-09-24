// ============================================================================
// CHARTS. Small inline-SVG builders, one per job the data has to do:
//
//   magnitude vs a ceiling  -> meter()
//   change over time        -> spark()
//   composition of a whole  -> stack() + legendRow()
//   a state on a scale      -> gauge()
//   one headline            -> statTile()
//   ordered magnitude       -> bars()
//
// House rules, applied here rather than remembered at each call site:
//  · thin marks, 2px lines, rounded data-ends anchored to the baseline
//  · a 2px surface gap between adjacent fills, so segments never bleed together
//  · recessive axes and grid; values are direct-labelled, never one per point
//  · a single series carries no legend (the title names it); two or more always do
//  · text wears text colours, never the series colour
//  · every mark has a <title>, which is the hover layer in a panel this size
//  · sequential encoding is one hue light->dark; status colours mean state only
// ============================================================================

const SURFACE = '#111417';   // the inset surface these charts sit on
const INK = '#e2e2e2';
const DIM = '#a3a7ab';
const DIM2 = '#767b80';
const TRACK = '#262b30';
const cesc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cnum = (v) => (Math.round(v * 100) / 100);

/** Sequential blue ramp, light -> dark. For continuous magnitude only. */
export const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
/** A 0..1 magnitude to a sequential step. Ordinal use starts at index 1. */
export function seqStep(frac, from = 1) {
  const span = SEQ.length - from;
  return SEQ[from + Math.min(span - 1, Math.max(0, Math.floor(frac * span)))];
}

/**
 * A horizontal magnitude bar against a ceiling. The ceiling is drawn as a tick
 * rather than implied by a full track, because "80/100" and "80/1000" must not
 * look the same.
 */
export function meter(opts) {
  const { label = '', value = 0, max = 1, color = '#3987e5', icon = '', note = '', cap = null, w = 100 } = opts;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const capFrac = cap != null && max > 0 ? Math.max(0, Math.min(1, cap / max)) : null;
  return `<div class="cv-meter" title="${cesc(label)}: ${cesc(String(value))} of ${cesc(String(max))}${note ? ' · ' + cesc(note) : ''}">
    <div class="cv-mlab">${icon ? `<span class="cv-i">${icon}</span>` : ''}<span>${cesc(label)}</span>
      <b>${cesc(String(value))}</b><span class="cv-of">/${cesc(String(max))}</span></div>
    <div class="cv-track" style="--w:${w}%">
      <i style="width:${cnum(frac * 100)}%;background:${color}"></i>
      ${capFrac != null ? `<u style="left:${cnum(capFrac * 100)}%"></u>` : ''}
    </div>
    ${note ? `<div class="cv-note">${cesc(note)}</div>` : ''}
  </div>`;
}

/**
 * Change over time, one series. Draws an area under a 2px line, labels only the
 * latest value and the range, and puts a hover band on every sample so the
 * numbers behind the shape are reachable without cluttering it.
 */
export function spark(opts) {
  const {
    label = '', series = [], color = '#3987e5', icon = '', w = 252, h = 40,
    fmt = (v) => String(Math.round(v)), unit = '', xlabel = (i) => `#${i}`, zero = false,
  } = opts;
  const pts = series.filter(v => Number.isFinite(v));
  if (pts.length < 2) {
    return `<div class="cv-spark"><div class="cv-shead">${icon ? `<span class="cv-i">${icon}</span>` : ''}
      <span>${cesc(label)}</span></div><div class="cv-note">Not enough history yet — comes in as days pass.</div></div>`;
  }
  let lo = Math.min(...pts), hi = Math.max(...pts);
  if (zero) lo = Math.min(0, lo);
  if (hi - lo < 1e-6) { hi = lo + 1; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const px = 3, py = 4;
  const X = (i) => px + (w - px * 2) * (pts.length === 1 ? 0 : i / (pts.length - 1));
  const Y = (v) => py + (h - py * 2) * (1 - (v - lo) / (hi - lo));
  const line = pts.map((v, i) => `${cnum(X(i))},${cnum(Y(v))}`).join(' ');
  const area = `${px},${h - py} ${line} ${cnum(w - px)},${h - py}`;
  const last = pts[pts.length - 1];
  const first = pts[0];
  const trend = last - first;
  const arrow = Math.abs(trend) < (hi - lo) * 0.04 ? '→' : trend > 0 ? '↑' : '↓';
  // Hover bands: one per sample, so a reader can recover any point's value.
  const bw = (w - px * 2) / Math.max(1, pts.length - 1);
  const bands = pts.map((v, i) =>
    `<rect x="${cnum(Math.max(0, X(i) - bw / 2))}" y="0" width="${cnum(bw)}" height="${h}" fill="transparent"
      data-tipt="${cesc(xlabel(i))}: ${cesc(fmt(v))}${unit}"></rect>`).join('');
  return `<div class="cv-spark">
    <div class="cv-shead">${icon ? `<span class="cv-i">${icon}</span>` : ''}<span>${cesc(label)}</span>
      <b>${cesc(fmt(last))}${unit}</b><span class="cv-of" title="change across the window shown">${arrow}</span></div>
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img"
         aria-label="${cesc(label)} over time, now ${cesc(fmt(last))}${unit}">
      <line x1="0" y1="${h - py}" x2="${w}" y2="${h - py}" stroke="${TRACK}" stroke-width="1"/>
      <polyline points="${area}" fill="${color}" fill-opacity="0.11" stroke="none"/>
      <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${cnum(X(pts.length - 1))}" cy="${cnum(Y(last))}" r="3" fill="${color}"
              stroke="${SURFACE}" stroke-width="2"/>
      ${bands}
    </svg>
    <div class="cv-srange"><span>${cesc(fmt(Math.min(...pts)))}</span><span>${cesc(fmt(Math.max(...pts)))}</span></div>
  </div>`;
}

/**
 * Composition of a whole, as one horizontal stacked bar. Segments are separated
 * by a 2px surface gap, and anything under the label threshold goes unlabelled
 * rather than overprinting its neighbour.
 */
export function stack(opts) {
  const { segments = [], total: givenTotal = null, h = 18, minLabel = 0.14 } = opts;
  const segs = segments.filter(s => s.value > 0);
  const total = givenTotal != null ? givenTotal : segs.reduce((s, x) => s + x.value, 0);
  if (!total) return `<div class="cv-note">Nobody on the books.</div>`;
  let x = 0;
  const parts = segs.map((s) => {
    const wpc = s.value / total * 100;
    const piece = { ...s, x, w: wpc };
    x += wpc;
    return piece;
  });
  return `<div class="cv-stack" style="height:${h}px">
    ${parts.map(p => `<div class="cv-seg" style="left:${cnum(p.x)}%;width:${cnum(p.w)}%;background:${p.color}"
        title="${cesc(p.name)}: ${cesc(String(p.value))} of ${total} (${Math.round(p.w)}%)">
        ${p.w / 100 >= minLabel ? `<span>${p.icon || ''}${p.value}</span>` : ''}</div>`).join('')}
  </div>`;
}

/** The legend a composition always carries. Swatch + name + value, in ink. */
export function legendRow(items) {
  return `<div class="cv-legend">${items.map(i =>
    `<span class="cv-key" title="${cesc(i.name)}${i.value != null ? ': ' + cesc(String(i.value)) : ''}">
      <i style="background:${i.color}"></i>${i.icon ? i.icon + ' ' : ''}${cesc(i.name)}${i.value != null ? ` <b>${cesc(String(i.value))}</b>` : ''}</span>`).join('')}</div>`;
}

/**
 * A state on a fixed scale — threat, hostility, a ratio of force. Poles are
 * coloured, the needle is neutral, and the verdict is spelled out in words so
 * the reading never depends on seeing the gradient.
 */
export function gauge(opts) {
  const { label = '', frac = 0, verdict = '', color = DIM, note = '', icon = '', ticks = [] } = opts;
  const f = Math.max(0, Math.min(1, frac));
  return `<div class="cv-gauge" title="${cesc(label)}: ${cesc(verdict)}">
    <div class="cv-mlab">${icon ? `<span class="cv-i">${icon}</span>` : ''}<span>${cesc(label)}</span>
      <b style="color:${color}">${cesc(verdict)}</b></div>
    <div class="cv-grail">
      ${ticks.map(t => `<u style="left:${cnum(t * 100)}%"></u>`).join('')}
      <i style="left:${cnum(f * 100)}%"></i>
    </div>
    ${note ? `<div class="cv-note">${cesc(note)}</div>` : ''}
  </div>`;
}

/** One headline number, where a chart would be more decoration than help. */
export function statTile(opts) {
  const { label = '', value = '', sub = '', icon = '', color = INK } = opts;
  return `<div class="cv-tile" title="${cesc(label)}${sub ? ' — ' + cesc(sub) : ''}">
    <div class="cv-tlab">${icon ? `<span class="cv-i">${icon}</span>` : ''}${cesc(label)}</div>
    <div class="cv-tval" style="color:${color}">${cesc(String(value))}</div>
    ${sub ? `<div class="cv-tsub">${cesc(sub)}</div>` : ''}
  </div>`;
}

/**
 * Ordered magnitude across a handful of named rows — a ranked bar chart laid on
 * its side, which is the readable orientation once names are involved.
 */
export function bars(opts) {
  const { rows = [], color = '#3987e5', fmt = (v) => String(v), max: givenMax = null } = opts;
  if (!rows.length) return `<div class="cv-note">Nothing to show.</div>`;
  const max = givenMax != null ? givenMax : Math.max(...rows.map(r => r.value), 1);
  return `<div class="cv-bars">${rows.map(r => `
    <div class="cv-brow" title="${cesc(r.name)}: ${cesc(fmt(r.value))}${r.note ? ' · ' + cesc(r.note) : ''}">
      <span class="cv-bname">${r.icon ? r.icon + ' ' : ''}${cesc(r.name)}</span>
      <span class="cv-btrack"><i style="width:${cnum(Math.max(0, Math.min(1, r.value / max)) * 100)}%;background:${r.color || color}"></i></span>
      <span class="cv-bval">${cesc(fmt(r.value))}</span>
    </div>`).join('')}</div>`;
}

/**
 * A sequential heat strip — one hue, light to dark, for a row of comparable
 * magnitudes (a colonist's skills, a field's soil). Values are printed in the
 * cells, which is what lets a single hue carry this much data safely.
 */
export function heatStrip(opts) {
  const { cells = [], max = 20 } = opts;
  return `<div class="cv-heat">${cells.map(c => {
    const frac = Math.max(0, Math.min(1, c.value / max));
    return `<span class="cv-cell" style="background:${frac <= 0.02 ? TRACK : seqStep(frac)};
      color:${frac > 0.55 ? '#eaf2fd' : DIM}" title="${cesc(c.name)}: ${cesc(String(c.value))}${c.note ? ' · ' + cesc(c.note) : ''}">
      <em>${cesc(c.short)}</em><b>${cesc(String(c.value))}</b></span>`;
  }).join('')}</div>`;
}

export const CHART_INK = { INK, DIM, DIM2, TRACK, SURFACE };
