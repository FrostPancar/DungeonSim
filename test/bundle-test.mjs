// Verifies the SHIPPED single-file build boots and runs — not just the sources.
import { readFileSync } from 'node:fs';
import { installDOM } from './dom-stub.mjs';
import vm from 'node:vm';

export function testBundle(path) {
  const html = readFileSync(path, 'utf8');
  const m = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/);
  if (!m) throw new Error('no inline script found in bundle');
  const code = m[1];
  if (/\bimport\s+[\w{*]/.test(code)) throw new Error('bundle still contains import statements');
  if (/^\s*export\s/m.test(code)) throw new Error('bundle still contains export statements');

  installDOM();
  globalThis.location = { search: '?seed=bundle-test', href: 'file:///riftgate.html' };
  vm.runInThisContext(code, { filename: path });
  const ui = globalThis.window.ui;
  if (!ui) throw new Error('bundle did not create window.ui');

  // Drive it like a real session.
  for (let i = 0; i < 3000; i++) { ui.game.step(); }
  const frames = globalThis.__frames;
  for (let i = 0; i < 15; i++) frames[frames.length - 1]();
  ui.auto = true;
  for (let i = 0; i < 2000; i++) { ui.game.step(); }
  // Panels catch their own drawing errors and log them; in the bundle that
  // must still count as a failure (an aliased import once hid the world map).
  const logged = [];
  const origErr = console.error;
  console.error = (...a) => logged.push(a.map(String).join(' '));
  try {
    for (const d of ['colony', 'people', 'region', 'party', 'farm', 'research', 'trade', 'log']) { ui.drawer = d; ui.sigs.drawer = null; ui.renderDrawer(); }
  } finally { console.error = origErr; }
  if (logged.length) throw new Error('bundle logged errors while drawing panels: ' + logged.join(' | '));
  ui.renderTop(); ui.renderRail();
  const snap = ui.game.snapshot();
  return { ui, snap, bytes: Buffer.byteLength(html), lines: code.split('\n').length };
}
