// Deterministic seeded RNG (mulberry32). Every system draws from a forked stream
// so that adding a new subsystem does not reshuffle existing generation.
export class RNG {
  constructor(seed) {
    this.s = (typeof seed === 'string') ? RNG.hash(seed) : (seed >>> 0);
    if (this.s === 0) this.s = 0x9e3779b9;
  }
  static hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(a = 0, b = 1) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(a + this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  pickMany(arr, n) { return this.shuffle(arr.slice()).slice(0, Math.min(n, arr.length)); }
  // entries: [[value, weight], ...]
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += Math.max(0, e[1]);
    if (total <= 0) return entries[0][0];
    let r = this.next() * total;
    for (const e of entries) { r -= Math.max(0, e[1]); if (r <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  }
  gauss(mean = 0, sd = 1) {
    const u = 1 - this.next(), v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  roll(n, d) { let s = 0; for (let i = 0; i < n; i++) s += this.int(1, d); return s; }
  // 4d6 drop lowest
  stat() {
    const r = [this.int(1, 6), this.int(1, 6), this.int(1, 6), this.int(1, 6)].sort((a, b) => a - b);
    return r[1] + r[2] + r[3];
  }
  fork(tag) { return new RNG((this.s ^ RNG.hash(String(tag))) >>> 0); }
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
