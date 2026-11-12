// =========================================================
// groupcall.js — Grup araması (sesli / görüntülü, en fazla 6 kişi).
// Herkes herkese doğrudan bağlanır (mesh). Sinyalleşme "gcall-<id>" canlı kanalından,
// arama kaydı "group_calls" tablosunda (guncelleme-6.sql).
// =========================================================
import { db, me, profiles, assertActive, friendly } from './api.js';
import { avatar, esc, toast, hydrate } from './ui.js';
import { CI, iceServers, tuneSdp, getMedia, tuneSenders, flipCamera, ring, stopRing, busyOneToOne, setOtherBusy } from './calls.js';

const MAX = 6;
const RING_MS = 45000;
let g = null;
setOtherBusy(() => !!g);
export const inGroupCall = () => !!g;

/* ---------- Başlat / katıl ---------- */
export async function startGroupCall(conv, kind = 'audio') {
  if (g || busyOneToOne()) return toast('Zaten bir aramadasın', true);
  if (!db.realtime) return toast('Arama için sunucuya bağlı olmalısın', true);
  await assertActive();
  let row;
  try {
    row = await db.insert('group_calls', { conversation_id: conv.id, started_by: me(), kind });
  } catch (e) {
    return toast(friendly(e, 'Grup araması başlatılamadı. Sunucu güncellemesi (guncelleme-6.sql) yapılmış mı?').message, true);
  }
  await join(row, conv);
}
export async function joinGroupCall(row, conv) {
  if (g && g.id === row.id) return;
  if (g || busyOneToOne()) return toast('Zaten bir aramadasın', true);
  await join(row, conv);
}
async function join(row, conv) {
  conv = conv || (await db.get('conversations', row.conversation_id).catch(() => null));
  const video = row.kind === 'video';
  let local;
  try {
    local = await getMedia(video);
  } catch (er) {
    return toast(er.message, true);
  }
  g = { id: row.id, conv, title: conv?.title || 'Grup', kind: row.kind, video: video && local.getVideoTracks().length > 0, local, peers: new Map(), users: new Map(), state: 'live', muted: false, camOff: false, facing: 'user', started: Date.now() };
  const pm = await profiles([me()]);
  g.users = pm;
  window.KankaAndroid?.setInCall?.(true);
  window.KankaAndroid?.setSpeaker?.(true);
  g.speaker = true;
  stopRing();
  openRoom();
  render();
  g.tick = setInterval(updateTimer, 1000);
  // kimse katılmazsa kapat
  g.alone = setTimeout(() => g && g.peers.size === 0 && leave('Kimse katılmadı'), RING_MS + 15000);
}

/* ---------- Sinyalleşme ---------- */
function openRoom() {
  const c = g;
  const ch = db.channel('gcall-' + c.id);
  c.ch = ch;
  const mine = (m) => g === c && m.from !== me() && (!m.to || m.to === me());
  ch.on('hello', async (m) => {
    if (!mine(m) || c.peers.has(m.from)) return;
    if (c.peers.size + 1 >= MAX) return ch.send('full', { from: me(), to: m.from });
    // küçük numaralı taraf teklif eder; diğeri kendini tanıtır
    if (me() < m.from) await offerTo(m.from);
    else if (!m.to) ch.send('hello', { from: me(), to: m.from });
  });
  ch.on('offer', async (m) => {
    if (!mine(m) || !m.to) return;
    const p = await peer(m.from);
    if (!m.restart && p.pc.remoteDescription && p.pc.signalingState === 'stable') return;
    await p.pc.setRemoteDescription(m.sdp);
    for (const x of p.pending) await p.pc.addIceCandidate(x).catch(() => {});
    p.pending = [];
    const ans = tuneSdp(await p.pc.createAnswer());
    await p.pc.setLocalDescription(ans);
    ch.send('answer', { from: me(), to: m.from, sdp: ans });
  });
  ch.on('answer', async (m) => {
    if (!mine(m) || !m.to) return;
    const p = c.peers.get(m.from);
    if (!p || p.pc.signalingState !== 'have-local-offer') return;
    await p.pc.setRemoteDescription(m.sdp);
    for (const x of p.pending) await p.pc.addIceCandidate(x).catch(() => {});
    p.pending = [];
  });
  ch.on('ice', async (m) => {
    if (!mine(m) || !m.to) return;
    const p = await peer(m.from);
    if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.c).catch(() => {});
    else p.pending.push(m.c);
  });
  ch.on('leave', (m) => mine(m) && dropPeer(m.from));
  ch.on('full', (m) => {
    if (!mine(m)) return;
    toast('Arama dolu (en fazla 6 kişi)', true);
    leave();
  });
  ch.join().then(() => {
    // biri kaçırırsa diye birkaç kez kendini duyur
    let n = 0;
    const hi = () => {
      if (g !== c || n++ > 4) return;
      ch.send('hello', { from: me() });
      setTimeout(hi, 2500);
    };
    hi();
  });
}
async function peer(uid) {
  const c = g;
  if (c.peers.has(uid)) return c.peers.get(uid);
  const pc = new RTCPeerConnection({ iceServers: await iceServers(), bundlePolicy: 'max-bundle' });
  const p = { pc, pending: [], stream: null, video: false };
  c.peers.set(uid, p);
  clearTimeout(c.alone);
  c.local.getTracks().forEach((t) => pc.addTrack(t, c.local));
  tuneSenders(pc);
  pc.onicecandidate = (e) => e.candidate && c.ch.send('ice', { from: me(), to: uid, c: e.candidate.toJSON() });
  pc.ontrack = (e) => {
    try {
      e.receiver.jitterBufferTarget = 120;
    } catch {
      /* eski sürüm */
    }
    p.stream = e.streams[0] || new MediaStream([e.track]);
    if (e.track.kind === 'video') {
      p.video = true;
      e.track.onmute = () => ((p.video = false), render());
      e.track.onunmute = () => ((p.video = true), render());
    }
    render();
  };
  pc.onconnectionstatechange = () => {
    if (g !== c) return;
    if (pc.connectionState === 'failed' && me() < uid) offerTo(uid, true);
    if (pc.connectionState === 'closed') dropPeer(uid);
  };
  if (!c.users.has(uid)) profiles([uid]).then((m) => m.forEach((v, k) => c.users.set(k, v)) || render());
  render();
  return p;
}
async function offerTo(uid, restart = false) {
  const p = await peer(uid);
  const offer = tuneSdp(await p.pc.createOffer(restart ? { iceRestart: true } : {}));
  await p.pc.setLocalDescription(offer);
  g?.ch.send('offer', { from: me(), to: uid, sdp: offer, restart });
}
function dropPeer(uid) {
  if (!g) return;
  const p = g.peers.get(uid);
  if (!p) return;
  try {
    p.pc.close();
  } catch {
    /* kapalı */
  }
  g.peers.delete(uid);
  render();
}

/* ---------- Ayrıl ---------- */
export async function leave(text = 'Aramadan ayrıldın') {
  if (!g) return;
  const c = g;
  g = null;
  clearInterval(c.tick);
  clearTimeout(c.alone);
  c.ch?.send('leave', { from: me() }).catch?.(() => {});
  const last = c.peers.size === 0;
  for (const [, p] of c.peers) {
    try {
      p.pc.close();
    } catch {
      /* kapalı */
    }
  }
  c.local?.getTracks().forEach((t) => t.stop());
  if (last) db.update('group_calls', c.id, { ended_at: new Date().toISOString() }).catch(() => {});
  window.KankaAndroid?.setSpeaker?.(false);
  window.KankaAndroid?.setInCall?.(false);
  setTimeout(() => c.ch?.close(), 800);
  document.getElementById('gcallScreen')?.remove();
  toast(text);
}

/* ---------- Ekran ---------- */
function fmt(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function updateTimer() {
  const t = document.getElementById('gTime');
  if (t && g) t.textContent = g.peers.size ? fmt(Math.floor((Date.now() - g.started) / 1000)) : 'Diğerleri bekleniyor...';
}
function render() {
  if (!g) return;
  let el = document.getElementById('gcallScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gcallScreen';
    document.body.appendChild(el);
  }
  const tiles = [[me(), { stream: g.local, video: g.video && !g.camOff, self: true }], ...g.peers];
  const n = tiles.length;
  el.className = `gcall n${Math.min(n, 6)}`;
  el.innerHTML = `<div class="g-head"><b>${esc(g.title)}</b><span id="gTime"></span></div>
    <div class="g-grid">${tiles
      .map(([uid, p]) => {
        const u = g.users.get(uid);
        return `<div class="g-tile" data-u="${uid}">${p.video ? `<video autoplay playsinline muted class="${p.self && g.facing !== 'environment' ? 'mirror' : ''}"></video>` : `<div class="g-av">${avatar(u, 72)}</div>`}
          ${p.self ? '' : '<audio autoplay></audio>'}<span class="g-name">${p.self ? 'Sen' : esc(u?.username || '...')}${p.self && g.muted ? ' · sessiz' : ''}</span></div>`;
      })
      .join('')}</div>
    <div class="call-btns g-btns">
      <div class="cb"><button class="cbtn ${g.muted ? 'on' : ''}" id="gMute">${g.muted ? CI.micOff : CI.mic}</button><span>Mikrofon</span></div>
      ${g.video || g.kind === 'video' ? `<div class="cb"><button class="cbtn ${g.camOff ? 'on' : ''}" id="gCam">${g.camOff ? CI.videoOff : CI.video}</button><span>Kamera</span></div>` : ''}
      <div class="cb"><button class="cbtn red" id="gEnd">${CI.end}</button><span>Ayrıl</span></div>
      ${g.video ? `<div class="cb"><button class="cbtn" id="gFlip">${CI.flip}</button><span>Çevir</span></div>` : ''}
      <div class="cb"><button class="cbtn ${g.speaker ? 'on' : ''}" id="gSpk">${CI.speaker}</button><span>Hoparlör</span></div>
    </div>`;
  hydrate(el);
  for (const [uid, p] of tiles) {
    const t = el.querySelector(`.g-tile[data-u="${uid}"]`);
    if (!t || !p.stream) continue;
    const v = t.querySelector('video');
    if (v) v.srcObject = p.stream;
    const a = t.querySelector('audio');
    if (a) {
      a.srcObject = p.stream;
      a.play?.().catch(() => {});
    }
  }
  updateTimer();
  const on = (id, fn) => {
    const b = document.getElementById(id);
    if (b) b.onclick = fn;
  };
  on('gMute', () => {
    g.muted = !g.muted;
    g.local.getAudioTracks().forEach((t) => (t.enabled = !g.muted));
    render();
  });
  on('gCam', () => {
    g.camOff = !g.camOff;
    g.local.getVideoTracks().forEach((t) => (t.enabled = !g.camOff));
    render();
  });
  on('gFlip', async () => {
    g.facing = await flipCamera(g.local, [...g.peers.values()].map((p) => p.pc), g.facing);
    render();
  });
  on('gSpk', () => {
    g.speaker = !g.speaker;
    window.KankaAndroid?.setSpeaker?.(g.speaker);
    render();
  });
  on('gEnd', () => leave());
}

/* ---------- Gelen grup araması ---------- */
let incomingEl = null;
async function showIncoming(row) {
  if (g || busyOneToOne() || row.started_by === me() || incomingEl) return;
  if (Date.now() - new Date(row.created_at).getTime() > RING_MS || row.ended_at) return;
  const conv = await db.get('conversations', row.conversation_id).catch(() => null);
  if (!conv) return;
  const starter = (await profiles([row.started_by])).get(row.started_by);
  incomingEl = document.createElement('div');
  incomingEl.id = 'callScreen';
  incomingEl.innerHTML = `<div class="call-bg"></div><div class="call-top"><div class="call-av"><span class="gav" style="width:132px;height:132px">${CI.group}</span></div>
    <div class="call-name">${esc(conv.title || 'Grup')}</div><div class="call-state">${esc(starter?.username || '')} ${row.kind === 'video' ? 'görüntülü' : 'sesli'} grup araması başlattı</div></div>
    <div class="call-btns"><div class="cb"><button class="cbtn red" id="giNo">${CI.end}</button><span>Reddet</span></div>
    <div class="cb"><button class="cbtn green pulse" id="giYes">${row.kind === 'video' ? CI.video : CI.phone}</button><span>Katıl</span></div></div>`;
  document.body.appendChild(incomingEl);
  ring('in');
  const close = () => {
    stopRing();
    incomingEl?.remove();
    incomingEl = null;
    clearTimeout(t);
  };
  const t = setTimeout(close, RING_MS);
  incomingEl.querySelector('#giNo').onclick = close;
  incomingEl.querySelector('#giYes').onclick = () => {
    close();
    joinGroupCall(row, conv);
  };
}
let unsub = null;
let pollT = null;
export function listenGroupIncoming() {
  unsub?.();
  clearInterval(pollT);
  if (!db.realtime || !me()) return;
  const seen = new Set();
  const handle = (row) => {
    if (!row?.id || seen.has(row.id)) return;
    seen.add(row.id);
    showIncoming(row);
  };
  unsub = db.subscribe('group_calls', null, (row, ev) => ev === 'INSERT' && handle(row));
  pollT = setInterval(async () => {
    if (g || document.hidden) return;
    const since = new Date(Date.now() - RING_MS).toISOString();
    const r = await db.list('group_calls', { gte: { created_at: since }, order: ['created_at', false], limit: 3 }).catch(() => []);
    r.filter((x) => !x.ended_at && x.started_by !== me()).forEach(handle);
  }, 8000);
}
/** Sohbette "devam eden arama" çubuğu için. */
export async function activeCall(convId) {
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const r = await db.list('group_calls', { eq: { conversation_id: convId }, gte: { created_at: since }, order: ['created_at', false], limit: 1 }).catch(() => []);
  return r[0] && !r[0].ended_at ? r[0] : null;
}
/** Bildirimden "Katıl". */
export async function openFromNotification(id, action) {
  const row = await db.get('group_calls', id).catch(() => null);
  if (!row || row.ended_at) return toast('Grup araması bitmiş', true);
  if (action === 'answer') return joinGroupCall(row);
  showIncoming(row);
}
