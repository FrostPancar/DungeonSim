// Minimal fake DOM so the view layer can be exercised headlessly. This is not a
// browser and not an interactive client — it only proves the UI and renderer
// execute every code path without throwing.
const CTX = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (t[k] = () => {})),
  set: (t, k, v) => { t[k] = v; return true; },
});

class ClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach(x => this.set.add(x)); }
  remove(...c) { c.forEach(x => this.set.delete(x)); }
  toggle(c, on) { if (on === undefined) on = !this.set.has(c); on ? this.set.add(c) : this.set.delete(c); return on; }
  contains(c) { return this.set.has(c); }
}

class E {
  constructor(tag = 'div') {
    this.tagName = (tag || 'div').toUpperCase();
    this._html = ''; this.children = []; this.style = {}; this.dataset = {};
    this.classList = new ClassList(); this.className = ''; this.textContent = '';
    this.scrollTop = 0; this.disabled = false; this.width = 0; this.height = 0;
    this._fc = { textContent: '' };
    this._q = new Map();
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get firstChild() { return this._fc; }
  get childElementCount() { return this.children.length; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); }
  remove() {}
  insertBefore(c) { this.children.push(c); return c; }
  querySelector(sel) { if (!this._q.has(sel)) this._q.set(sel, new E()); return this._q.get(sel); }
  querySelectorAll() { return []; }
  addEventListener() {} removeEventListener() {}
  getBoundingClientRect() { return { width: 1280, height: 800, left: 0, top: 0, right: 1280, bottom: 800 }; }
  getContext() { return CTX; }
  closest() { return null; }
  focus() {}
}

export function installDOM() {
  const cache = new Map();
  const doc = {
    createElement: (tag) => new E(tag),
    querySelector: (sel) => { if (!cache.has(sel)) cache.set(sel, new E(sel.includes('canvas') || sel === '#map' ? 'canvas' : 'div')); return cache.get(sel); },
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: new E('body'),
  };
  globalThis.document = doc;
  globalThis.window = globalThis;
  globalThis.devicePixelRatio = 1;
  globalThis.addEventListener = () => {};
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  globalThis.__frames = frames;
  return { doc, frames, E };
}
