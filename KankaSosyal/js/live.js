// =========================================================
// live.js — Canlı yayın. Yayıncı görüntüsünü her izleyiciye doğrudan gönderir
// (arkadaş ortamı için en fazla 20 izleyici). Yorum ve kalpler canlı kanaldan gider.
// Yayın kaydı "lives" tablosunda (guncelleme-6.sql).
// =========================================================
import { db, me, profile, profiles, followers, assertActive, friendly, notify } from './api.js';
import { avatar, uname, esc, toast, hydrate, I } from './ui.js';
import { CI, iceServers, tuneSdp, tuneSenders, flipCamera, VIDEO, inCall } from './calls.js';

const MAX_VIEWERS = 20;
let live = null; // yayıncı ya da izleyici durumu

/** Takip ettiklerimden şu an canlı olanlar (ana sayfadaki hikâye çubuğu için). */
export async function activeLives(followingIds) {
  if (!db.realtime && db.mode !== 'local') return [];
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const r = await db.list('lives', { gte: { created_at: since }, order: ['created_at', false], limit: 30 }).catch(() => []);
  const set = new Set(followingIds);
  const seen = new Set();
  return r.filter((l) => !l.ended_at && set.has(l.user_id) && l.user_id !== me() && !seen.has(l.user_id) && seen.add(l.user_id));
}

/* =========================================================
   Yayıncı
   ========================================================= */
export async function startLive(title = '') {
  if (live || inCall()) return toast('Önce mevcut aramayı / yayını bitir', true);
  if (!db.realtime) return toast('Canlı yayın için sunucuya bağlı olmalısın', true);
  await assertActive();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { ...VIDEO, width: { ideal: 720 }, height: { ideal: 1280 } } });
  } catch {
    return toast('Kamera ve mikrofona erişilemedi', true);
  }
  let row;
  try {
    row = await db.insert('lives', { user_id: me(), title: title.slice(0, 80) });
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    return toast(friendly(e, 'Canlı yayın başlatılamadı. Sunucu güncellemesi (guncelleme-6.sql) yapılmış mı?').message, true);
  }
  const meP = await profile(me());
  myNameCache = meP?.username || '';
  live = { host: true, id: row.id, row, user: meP, stream, viewers: new Map(), comments: [], hearts: 0, facing: 'user', started: Date.now() };
  window.KankaAndroid?.setInCall?.(true);
  openChannel();
  render();
  live.beat = setInterval(() => live?.ch.send('state', { from: me(), n: live.viewers.size, alive: true }), 5000);
  // takipçilere haber ver (uygulama içi bildirim; telefon bildirimi sunucudan)
  followers(me())
    .then((ids) => ids.slice(0, 200).forEach((uid) => notify(uid, 'live', { text: title.slice(0, 60) })))
    .catch(() => {});
}
async function hostPeer(uid) {
  const L = live;
  if (L.viewers.has(uid)) {
    try {
      L.viewers.get(uid).pc.close();
    } catch {
      /* kapalı */
    }
  }
  if (L.viewers.size >= MAX_VIEWERS) return L.ch.send('full', { from: me(), to: uid });
  const pc = new RTCPeerConnection({ iceServers: await iceServers(), bundlePolicy: 'max-bundle' });
  const v = { pc, pending: [] };
  L.viewers.set(uid, v);
  L.stream.getTracks().forEach((t) => pc.addTrack(t, L.stream));
  tuneSenders(pc);
  pc.onicecandidate = (e) => e.candidate && L.ch.send('ice', { from: me(), to: uid, c: e.candidate.toJSON() });
  pc.onconnectionstatechange = () => {
    if (['failed', 'closed'].includes(pc.connectionState) && L.viewers.get(uid) === v) {
      L.viewers.delete(uid);
      renderCount();
    }
  };
  const offer = tuneSdp(await pc.createOffer());
  await pc.setLocalDescription(offer);
  L.ch.send('offer', { from: me(), to: uid, sdp: offer });
  renderCount();
}
export async function endLive() {
  if (!live) return;
  const L = live;
  live = null;
  clearInterval(L.beat);
  if (L.host) {
    L.ch?.send('end', { from: me() });
    db.update('lives', L.id, { ended_at: new Date().toISOString() }).catch(() => {});
    for (const [, v] of L.viewers) {
      try {
        v.pc.close();
      } catch {
        /* kapalı */
      }
    }
    L.stream?.getTracks().forEach((t) => t.stop());
    toast(`Yayın bitti · ${L.peak || L.viewers.size} izleyici`);
  } else {
    L.ch?.send('leave', { from: me() });
    try {
      L.pc?.close();
    } catch {
      /* kapalı */
    }
  }
  window.KankaAndroid?.setInCall?.(false);
  setTimeout(() => L.ch?.close(), 600);
  document.getElementById('liveScreen')?.remove();
}

/* =========================================================
   İzleyici
   ========================================================= */
export async function watchLive(id) {
  if (live) {
    if (live.id === id) return;
    await endLive();
  }
  const row = await db.get('lives', id).catch(() => null);
  if (!row || row.ended_at) return toast('Bu yayın bitti', true);
  const host = await profile(row.user_id);
  if (!myNameCache) myNameCache = (await profile(me()))?.username || '';
  live = { host: false, id, row, user: host, comments: [], hearts: 0, n: 0, pending: [] };
  openChannel();
  render();
  // yayıncı hazır değilse birkaç kez tekrar dene
  let k = 0;
  const hi = () => {
    if (!live || live.id !== id || live.connected || k++ > 6) return;
    live.ch.send('join', { from: me() });
    setTimeout(hi, 3000);
  };
  live.ch.join().then(hi);
  live.dead = setTimeout(() => live && live.id === id && !live.connected && (toast('Yayına bağlanılamadı', true), endLive()), 25000);
}

/* =========================================================
   Kanal (sinyal + yorumlar)
   ========================================================= */
function openChannel() {
  const L = live;
  const ch = db.channel('live-' + L.id);
  L.ch = ch;
  const forMe = (m) => live === L && m.from !== me() && (!m.to || m.to === me());
  ch.on('join', (m) => forMe(m) && L.host && hostPeer(m.from));
  ch.on('leave', (m) => {
    if (!forMe(m) || !L.host) return;
    const v = L.viewers.get(m.from);
    if (v) {
      try {
        v.pc.close();
      } catch {
        /* kapalı */
      }
      L.viewers.delete(m.from);
      renderCount();
    }
  });
  ch.on('offer', async (m) => {
    if (!forMe(m) || L.host || !m.to) return;
    clearTimeout(L.dead);
    try {
      L.pc?.close();
    } catch {
      /* kapalı */
    }
    const pc = new RTCPeerConnection({ iceServers: await iceServers(), bundlePolicy: 'max-bundle' });
    L.pc = pc;
    pc.onicecandidate = (e) => e.candidate && ch.send('ice', { from: me(), to: m.from, c: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      L.connected = true;
      L.remote = e.streams[0] || new MediaStream([e.track]);
      const v = document.getElementById('lvVideo');
      if (v) {
        v.srcObject = L.remote;
        v.play?.().catch(() => {
          v.muted = true;
          v.play?.().catch(() => {});
          showUnmute();
        });
      }
      document.getElementById('lvWait')?.remove();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && live === L) ch.send('join', { from: me() });
    };
    await pc.setRemoteDescription(m.sdp);
    for (const x of L.pending) await pc.addIceCandidate(x).catch(() => {});
    L.pending = [];
    const ans = tuneSdp(await pc.createAnswer());
    await pc.setLocalDescription(ans);
    ch.send('answer', { from: me(), to: m.from, sdp: ans });
  });
  ch.on('answer', async (m) => {
    if (!forMe(m) || !L.host || !m.to) return;
    const v = L.viewers.get(m.from);
    if (!v || v.pc.signalingState !== 'have-local-offer') return;
    await v.pc.setRemoteDescription(m.sdp);
    for (const x of v.pending) await v.pc.addIceCandidate(x).catch(() => {});
    v.pending = [];
  });
  ch.on('ice', async (m) => {
    if (!forMe(m) || !m.to) return;
    const pc = L.host ? L.viewers.get(m.from)?.pc : L.pc;
    const pend = L.host ? L.viewers.get(m.from)?.pending : L.pending;
    if (pc && pc.remoteDescription) await pc.addIceCandidate(m.c).catch(() => {});
    else pend?.push(m.c);
  });
  ch.on('cmt', (m) => forMe(m) && addComment(m));
  ch.on('heart', (m) => forMe(m) && floatHeart());
  ch.on('state', (m) => {
    if (!forMe(m) || L.host) return;
    L.n = m.n;
    renderCount();
  });
  ch.on('full', (m) => forMe(m) && (toast('Yayın dolu, sonra tekrar dene', true), endLive()));
  ch.on('end', (m) => {
    if (!forMe(m) || L.host) return;
    toast('Yayın bitti');
    endLive();
    if (location.hash.startsWith('#/live/')) history.back();
  });
  if (L.host) ch.join();
}

/* =========================================================
   Ekran
   ========================================================= */
function render() {
  const L = live;
  if (!L) return;
  let el = document.getElementById('liveScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'liveScreen';
    document.body.appendChild(el);
  }
  el.innerHTML = `<video id="lvVideo" autoplay playsinline ${L.host ? 'muted' : ''} class="${L.host && L.facing === 'user' ? 'mirror' : ''}"></video>
    ${L.host ? '' : `<div class="lv-wait" id="lvWait"><div class="spin"></div><span>Yayına bağlanılıyor...</span></div>`}
    <div class="lv-top"><div class="lv-who">${avatar(L.user, 34)}<div>${uname(L.user)}${L.row.title ? `<small>${esc(L.row.title)}</small>` : ''}</div></div>
      <span class="lv-badge">CANLI</span><span class="lv-count" id="lvCount">${I.eye}<b>0</b></span><button class="ibtn" id="lvX">${I.close}</button></div>
    <div class="lv-cmts" id="lvCmts"></div><div class="lv-hearts" id="lvHearts"></div>
    <div class="lv-bottom"><input id="lvTxt" placeholder="Yorum yaz..." maxlength="150"><button class="ibtn" id="lvSend">${I.send}</button>
      ${L.host ? `<button class="ibtn" id="lvFlip">${CI.flip}</button>` : `<button class="ibtn lv-heart" id="lvHeart">${I.heartFill}</button>`}</div>`;
  hydrate(el);
  const v = el.querySelector('#lvVideo');
  if (L.host) v.srcObject = L.stream;
  else if (L.remote) v.srcObject = L.remote;
  renderCount();
  L.comments.forEach((c) => drawComment(c));
  el.querySelector('#lvX').onclick = () => (L.host ? confirmEnd() : (endLive(), location.hash.startsWith('#/live/') && history.back()));
  const send = () => {
    const inp = el.querySelector('#lvTxt');
    const t = inp.value.trim();
    if (!t) return;
    inp.value = '';
    const m = { from: me(), name: myName(), text: t.slice(0, 150) };
    L.ch.send('cmt', m);
    addComment(m);
  };
  el.querySelector('#lvSend').onclick = send;
  el.querySelector('#lvTxt').onkeydown = (e) => e.key === 'Enter' && send();
  const hb = el.querySelector('#lvHeart');
  if (hb)
    hb.onclick = () => {
      L.ch.send('heart', { from: me() });
      floatHeart();
    };
  const fb = el.querySelector('#lvFlip');
  if (fb)
    fb.onclick = async () => {
      L.facing = await flipCamera(L.stream, [...L.viewers.values()].map((x) => x.pc), L.facing);
      el.querySelector('#lvVideo').classList.toggle('mirror', L.facing === 'user');
    };
}
let myNameCache = '';
function myName() {
  if (!myNameCache) profile(me()).then((p) => (myNameCache = p?.username || ''));
  return myNameCache || '...';
}
function confirmEnd() {
  if (confirm('Canlı yayın bitirilsin mi?')) endLive();
}
function renderCount() {
  const L = live;
  const b = document.querySelector('#lvCount b');
  if (!L || !b) return;
  const n = L.host ? L.viewers.size : L.n || 0;
  if (L.host) L.peak = Math.max(L.peak || 0, n);
  b.textContent = n;
}
function addComment(m) {
  if (!live) return;
  live.comments.push(m);
  if (live.comments.length > 40) live.comments.shift();
  drawComment(m);
}
function drawComment(m) {
  const box = document.getElementById('lvCmts');
  if (!box) return;
  const d = document.createElement('div');
  d.className = 'lv-cmt';
  d.innerHTML = `<b>${esc(m.name || '')}</b> ${esc(m.text)}`;
  box.appendChild(d);
  while (box.children.length > 8) box.firstChild.remove();
}
function floatHeart() {
  const box = document.getElementById('lvHearts');
  if (!box) return;
  const h = document.createElement('span');
  h.innerHTML = I.heartFill;
  h.style.left = 10 + Math.random() * 30 + 'px';
  box.appendChild(h);
  setTimeout(() => h.remove(), 2200);
}
function showUnmute() {
  const el = document.getElementById('liveScreen');
  if (!el || el.querySelector('.lv-unmute')) return;
  const b = document.createElement('button');
  b.className = 'lv-unmute btn sm';
  b.textContent = 'Sesi aç';
  b.onclick = () => {
    const v = document.getElementById('lvVideo');
    v.muted = false;
    v.play?.();
    b.remove();
  };
  el.appendChild(b);
}
export const isLive = () => !!live;
export const liveBack = () => {
  if (!live) return false;
  if (live.host) confirmEnd();
  else endLive();
  return true;
};
