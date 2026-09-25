// ============================================================================
// NET: the wire under co-op. Browser only; the simulation never imports it.
//
// The site is static (Netlify), so there is no server of ours to meet at.
// Players meet through PeerJS's public signalling server and then talk
// browser-to-browser over a WebRTC data channel. The host's peer id is built
// from the 4-digit room code, so "join 4821" is all a friend needs.
//
// Messages are JSON. A data channel drops anything much over 64 KB, and a
// colony's save is far bigger, so long messages are gzipped and go out in
// numbered pieces, put back together on arrival (the channel is ordered and
// reliable).
// ============================================================================

const NET_PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const NET_ID_PREFIX = 'riftgate-coop-v1-';
const NET_CHUNK = 16000;

let netPeerLib = null;
/** Fetch PeerJS once, the first time someone opens or joins a world. */
function netLoadPeer() {
  if (typeof window !== 'undefined' && window.Peer) return Promise.resolve(window.Peer);
  if (netPeerLib) return netPeerLib;
  netPeerLib = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = NET_PEERJS_URL;
    s.async = true;
    s.onload = () => window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS did not load'));
    s.onerror = () => { netPeerLib = null; reject(new Error('Could not reach the co-op service. Are you online?')); };
    document.head.appendChild(s);
  });
  return netPeerLib;
}

/** gzip a string to base64, where the browser can; null where it can't. */
async function netGzip(text) {
  if (typeof CompressionStream === 'undefined') return null;
  const buf = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function netGunzip(b64) {
  const bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/**
 * Wrap a PeerJS connection: JSON in and out, split and joined in pieces, and
 * big messages (a colony's save) gzipped first. Compressing is async, so both
 * ends run their messages through a queue to keep them in the order sent.
 */
function netWrap(conn, onMessage) {
  const parts = new Map();
  let nextId = 1, inbox = Promise.resolve(), outbox = Promise.resolve();
  const deliver = (text, gz) => {
    inbox = inbox.then(async () => {
      try { onMessage(JSON.parse(gz ? await netGunzip(text) : text)); } catch (e) { /* a broken message is dropped */ }
    });
  };
  conn.on('data', (raw) => {
    if (typeof raw !== 'string') return;
    if (raw.startsWith('{"$chunk"')) {
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      let p = parts.get(m.$chunk);
      if (!p) { p = { got: 0, s: [] }; parts.set(m.$chunk, p); }
      if (p.s[m.i] === undefined) { p.s[m.i] = m.s; p.got++; }
      if (p.got === m.n) { parts.delete(m.$chunk); deliver(p.s.join(''), !!m.gz); }
      return;
    }
    deliver(raw, false);
  });
  const sendNow = async (msg) => {
    let s = JSON.stringify(msg), gz = false;
    if (s.length > NET_CHUNK * 4) { const z = await netGzip(s).catch(() => null); if (z) { s = z; gz = true; } }
    if (!conn.open) return;
    if (!gz && s.length <= NET_CHUNK) { conn.send(s); return; }
    const id = nextId++, n = Math.ceil(s.length / NET_CHUNK);
    for (let i = 0; i < n; i++) conn.send(JSON.stringify({ $chunk: id, i, n, gz: gz ? 1 : 0, s: s.slice(i * NET_CHUNK, (i + 1) * NET_CHUNK) }));
  };
  return (msg) => { outbox = outbox.then(() => sendNow(msg)).catch(() => {}); };
}

/**
 * Open a room. Tries codes until one is free. Resolves to
 * { code, send(peer, msg), close() }; peer null sends to everyone.
 */
export async function netHost({ makeCode, onMessage, onJoin, onLeave, onError }) {
  const Peer = await netLoadPeer();
  const conns = new Map();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const peer = new Peer(NET_ID_PREFIX + code, { debug: 0 });
    const opened = await new Promise((resolve) => {
      peer.on('open', () => resolve(true));
      peer.on('error', (e) => resolve(e && e.type === 'unavailable-id' ? false : e));
    });
    if (opened === false) { peer.destroy(); continue; }       // that code is taken: roll again
    if (opened !== true) { peer.destroy(); throw new Error(netErrorText(opened)); }
    peer.on('error', (e) => onError && onError(netErrorText(e)));
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        const send = netWrap(conn, (m) => onMessage(conn.peer, m));
        conns.set(conn.peer, { conn, send });
        onJoin && onJoin(conn.peer);
      });
      const gone = () => { if (conns.delete(conn.peer)) onLeave && onLeave(conn.peer); };
      conn.on('close', gone);
      conn.on('error', gone);
    });
    // Lost the signalling server: players already in keep playing; new ones can't find us until it's back.
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 2000); });
    return {
      code,
      send(to, msg) {
        if (to == null) { for (const c of conns.values()) c.send(msg); return; }
        const c = conns.get(to); if (c) c.send(msg);
      },
      close() { for (const c of conns.values()) c.conn.close(); conns.clear(); peer.destroy(); },
    };
  }
  throw new Error('Could not find a free room code. Try again.');
}

/** Join room `code`. Resolves to { send(msg), close() } once connected. */
export async function netJoin(code, { onMessage, onClose, onError }) {
  const Peer = await netLoadPeer();
  const peer = new Peer(undefined, { debug: 0 });
  await new Promise((resolve, reject) => {
    peer.on('open', resolve);
    peer.on('error', (e) => reject(new Error(netErrorText(e))));
  });
  const conn = peer.connect(NET_ID_PREFIX + code, { reliable: true, serialization: 'raw' });
  const send = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`No world is open with code ${code}.`)), 12000);
    peer.on('error', (e) => { clearTimeout(t); reject(new Error(e && e.type === 'peer-unavailable' ? `No world is open with code ${code}.` : netErrorText(e))); });
    conn.on('open', () => { clearTimeout(t); resolve(netWrap(conn, onMessage)); });
  });
  peer.on('error', (e) => onError && onError(netErrorText(e)));
  conn.on('close', () => onClose && onClose());
  return { send, close() { conn.close(); peer.destroy(); } };
}

function netErrorText(e) {
  if (!e) return 'Connection failed.';
  if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') return 'Could not reach the co-op service. Are you online?';
  if (e.type === 'browser-incompatible') return 'This browser cannot do peer-to-peer connections.';
  return e.message || String(e);
}
