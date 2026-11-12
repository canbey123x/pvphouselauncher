// =========================================================
// calls.js — Sesli arama (WebRTC). Sinyalleşme Supabase canlı kanalı üzerinden,
// arama kayıtları "calls" tablosunda (spam koruması sunucuda: guncelleme-3.sql).
// Uygulama açıkken gelen arama ekranı anında açılır; uygulama kapalı/kilitliyken
// Android tarafı (Firebase bildirimi) tam ekran arama ekranını gösterir.
// =========================================================
import { db, me, profile, assertActive, friendly, report, blockUser } from './api.js';
import { ICE_SERVERS } from './config.js';
import { avatar, uname, esc, toast, hydrate } from './ui.js';

const RING_MS = 40000;
const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const CI = {
  phone: P('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.9 2z"/>'),
  end: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-2.5 0-4.9.5-7 1.4-.8.4-1.3 1.2-1.3 2.1v2.3c0 .8.7 1.4 1.5 1.3l3.2-.5c.7-.1 1.2-.7 1.2-1.4v-1.8a10.7 10.7 0 0 1 4.8 0v1.8c0 .7.5 1.3 1.2 1.4l3.2.5c.8.1 1.5-.5 1.5-1.3v-2.3c0-.9-.5-1.7-1.3-2.1A17 17 0 0 0 12 9z"/></svg>',
  mic: P('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/>'),
  micOff: P('<path d="M2 2l20 20"/><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6"/><path d="M19 10v1a7 7 0 0 1-1.1 3.8M5 10v1a7 7 0 0 0 11.6 5.3M12 18v4"/>'),
  speaker: P('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  ban: P('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
};

let cur = null; // aktif arama durumu
let unsubIncoming = null;
let pollT = null;

/* ---------- Zil sesi (dosyasız, Web Audio) ---------- */
let ringCtx = null;
let ringT = null;
function ring(kind) {
  stopRing();
  try {
    ringCtx = ringCtx || new (window.AudioContext || window.webkitAudioContext)();
    ringCtx.resume?.();
  } catch {
    return;
  }
  const beep = (f, t0, d) => {
    const o = ringCtx.createOscillator();
    const g = ringCtx.createGain();
    o.frequency.value = f;
    o.type = 'sine';
    g.gain.setValueAtTime(0.0001, ringCtx.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(kind === 'in' ? 0.25 : 0.08, ringCtx.currentTime + t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ringCtx.currentTime + t0 + d);
    o.connect(g).connect(ringCtx.destination);
    o.start(ringCtx.currentTime + t0);
    o.stop(ringCtx.currentTime + t0 + d + 0.05);
  };
  const play = () => {
    if (kind === 'in') {
      beep(880, 0, 0.35);
      beep(660, 0.4, 0.35);
      beep(880, 0.8, 0.35);
      navigator.vibrate?.([400, 200, 400]);
    } else beep(425, 0, 1.0);
  };
  play();
  ringT = setInterval(play, kind === 'in' ? 2200 : 3500);
}
function stopRing() {
  clearInterval(ringT);
  ringT = null;
  navigator.vibrate?.(0);
}

/* ---------- Arama ekranı ---------- */
function screen() {
  let el = document.getElementById('callScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'callScreen';
    document.body.appendChild(el);
  }
  return el;
}
function fmt(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function render() {
  const el = screen();
  if (!cur) {
    el.remove();
    return;
  }
  const { other, incoming, state } = cur;
  const label = {
    calling: 'Aranıyor...',
    ringing: incoming ? 'Sesli arama' : 'Çalıyor...',
    connecting: 'Bağlanıyor...',
    live: cur.started ? fmt(Math.floor((Date.now() - cur.started) / 1000)) : 'Bağlandı',
    ended: cur.endText || 'Arama bitti',
  }[state];
  el.innerHTML = `<div class="call-bg">${other?.avatar ? `<img data-m="${esc(other.avatar)}">` : ''}</div>
    <div class="call-top"><div class="call-av">${avatar(other, 132)}</div><div class="call-name">${uname(other)}</div><div class="call-state" id="cState">${esc(label)}</div></div>
    <div class="call-btns">${
      incoming && state === 'ringing'
        ? `<div class="cb"><button class="cbtn red" id="cDecline">${CI.end}</button><span>Reddet</span></div>
           <div class="cb"><button class="cbtn green pulse" id="cAccept">${CI.phone}</button><span>Cevapla</span></div>`
        : state === 'ended'
          ? ''
          : `<div class="cb"><button class="cbtn ${cur.muted ? 'on' : ''}" id="cMute">${cur.muted ? CI.micOff : CI.mic}</button><span>${cur.muted ? 'Sessiz' : 'Mikrofon'}</span></div>
             <div class="cb"><button class="cbtn red" id="cEnd">${CI.end}</button><span>Kapat</span></div>
             <div class="cb"><button class="cbtn ${cur.speaker ? 'on' : ''}" id="cSpk">${CI.speaker}</button><span>Hoparlör</span></div>`
    }</div>
    ${incoming && state === 'ringing' ? `<button class="call-spam" id="cSpam">${CI.ban} Engelle ve spam olarak bildir</button>` : ''}`;
  hydrate(el);
  const on = (id, fn) => {
    const b = document.getElementById(id);
    if (b) b.onclick = fn;
  };
  on('cAccept', accept);
  on('cDecline', () => hangup('declined'));
  on('cEnd', () => hangup(cur.state === 'live' || cur.incoming ? 'ended' : 'cancelled'));
  on('cMute', () => {
    cur.muted = !cur.muted;
    cur.local?.getAudioTracks().forEach((t) => (t.enabled = !cur.muted));
    render();
  });
  on('cSpk', () => {
    cur.speaker = !cur.speaker;
    window.KankaAndroid?.setSpeaker?.(cur.speaker);
    render();
  });
  on('cSpam', async () => {
    const o = cur.other;
    await hangup('declined');
    try {
      await blockUser(o.id);
      await report('user', o.id, 'Spam arama');
      toast(`@${o.username} engellendi ve bildirildi`);
    } catch (er) {
      toast(er.message, true);
    }
  });
}
let tickT = null;
function startTick() {
  clearInterval(tickT);
  tickT = setInterval(() => {
    const s = document.getElementById('cState');
    if (cur?.state === 'live' && s && cur.started) s.textContent = fmt(Math.floor((Date.now() - cur.started) / 1000));
  }, 1000);
}

/* ---------- WebRTC ---------- */
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
let iceCache = null;
/** Bağlantı sunucuları: config.js + server.json'daki "turn" adresinden alınan TURN bilgileri (mobil ağlarda şart). */
async function iceServers() {
  if (iceCache && iceCache.exp > Date.now()) return iceCache.list;
  let list = [...STUN, ...(ICE_SERVERS || [])];
  // sunucudaki TURN bilgileri (guncelleme-5-arama-sunucusu.sql), sadece giriş yapmış kullanıcılar okuyabilir
  try {
    const row = (await db.list('call_config', { eq: { id: 1 } }))[0];
    if (Array.isArray(row?.ice)) list = [...list, ...row.ice.filter((x) => x && x.urls)];
  } catch {
    /* tablo yok */
  }
  let turnUrl = '';
  try {
    turnUrl = JSON.parse(localStorage.getItem('kanka.turn') || '""');
  } catch {
    /* yok */
  }
  if (turnUrl) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(turnUrl, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      const j = await r.json();
      const extra = Array.isArray(j) ? j : j.iceServers || [];
      if (extra.length) list = [...list, ...extra];
    } catch {
      /* TURN alınamadı: STUN ile dene */
    }
  }
  iceCache = { list, exp: Date.now() + 30 * 60 * 1000 };
  return list;
}
/** Ses kalitesi: Opus'ta kayıp telafisi (FEC) açık, sabit ve yeterli bit hızı, mono. */
function tuneSdp(desc) {
  const sdp = desc.sdp.replace(/a=fmtp:(\d+) (.*minptime.*)/g, (m, pt, params) => {
    const p = params.split(';').filter((x) => !/^(useinbandfec|usedtx|maxaveragebitrate|stereo|cbr)=/.test(x));
    return `a=fmtp:${pt} ${[...p, 'useinbandfec=1', 'usedtx=0', 'stereo=0', 'maxaveragebitrate=40000'].join(';')}`;
  });
  return { type: desc.type, sdp };
}
async function getMic() {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  } catch {
    throw new Error('Mikrofona erişilemedi. Ayarlardan Kanka için mikrofon iznini aç.');
  }
}
async function makePeer() {
  const pc = new RTCPeerConnection({ iceServers: await iceServers(), bundlePolicy: 'max-bundle' });
  cur.local.getTracks().forEach((t) => pc.addTrack(t, cur.local));
  pc.getSenders().forEach((sd) => {
    try {
      const prm = sd.getParameters();
      prm.encodings = (prm.encodings && prm.encodings.length ? prm.encodings : [{}]).map((e) => ({ ...e, priority: 'high', networkPriority: 'high', maxBitrate: 48000 }));
      sd.setParameters(prm).catch(() => {});
    } catch {
      /* desteklenmiyor */
    }
  });
  pc.onicecandidate = (e) => e.candidate && cur?.ch.send('ice', { from: me(), c: e.candidate.toJSON() });
  pc.ontrack = (e) => {
    // dalgalı ağlarda kesilmesin: biraz daha geniş tampon
    try {
      e.receiver.jitterBufferTarget = 120;
    } catch {
      /* eski sürüm */
    }
    try {
      e.receiver.playoutDelayHint = 0.12;
    } catch {
      /* eski sürüm */
    }
    let a = document.getElementById('callAudio');
    if (!a) {
      a = document.createElement('audio');
      a.id = 'callAudio';
      a.autoplay = true;
      a.setAttribute('playsinline', '');
      document.body.appendChild(a);
    }
    a.srcObject = e.streams[0] || new MediaStream([e.track]);
    a.play?.().catch(() => {});
  };
  let dropT = null;
  pc.onconnectionstatechange = () => {
    if (!cur || cur.pc !== pc) return;
    const st = pc.connectionState;
    if (st === 'connected') {
      clearTimeout(dropT);
      if (cur.state !== 'live') {
        cur.state = 'live';
        cur.started = Date.now();
        stopRing();
        render();
        startTick();
      } else setStateText(null);
    }
    if (st === 'disconnected' || st === 'failed') {
      // ağ değişti / koptu: yeniden bağlanmayı dene, 15 sn içinde olmazsa kapat
      setStateText('Yeniden bağlanıyor...');
      restartIce();
      clearTimeout(dropT);
      dropT = setTimeout(() => {
        if (cur && cur.pc === pc && pc.connectionState !== 'connected') {
          cur.endText = 'Bağlantı koptu';
          hangup('ended');
        }
      }, 15000);
    }
  };
  cur.pending = [];
  return pc;
}
function setStateText(t) {
  const s = document.getElementById('cState');
  if (s && t) s.textContent = t;
}
let restarting = false;
async function restartIce() {
  if (!cur?.pc || cur.incoming || restarting) return;
  restarting = true;
  try {
    const offer = tuneSdp(await cur.pc.createOffer({ iceRestart: true }));
    await cur.pc.setLocalDescription(offer);
    cur.ch.send('offer', { from: me(), sdp: offer, restart: true });
  } catch {
    /* sonra tekrar */
  }
  setTimeout(() => (restarting = false), 4000);
}
function openChannel(callId) {
  const ch = db.channel('call-' + callId);
  ch.on('ready', async (m) => {
    // aranan kişi hazır: teklif gönder (arayan taraf)
    if (!cur || cur.incoming || m.from === me()) return;
    if (cur.pc) {
      // tekrar gelen "hazır": teklif kaybolmuş olabilir, aynısını yeniden gönder
      if (cur.pc.localDescription && !cur.pc.remoteDescription) ch.send('offer', { from: me(), sdp: cur.pc.localDescription });
      return;
    }
    cur.state = 'connecting';
    clearTimeout(cur.timeout);
    stopRing();
    render();
    cur.pc = await makePeer();
    const offer = tuneSdp(await cur.pc.createOffer());
    await cur.pc.setLocalDescription(offer);
    ch.send('offer', { from: me(), sdp: offer });
  });
  ch.on('offer', async (m) => {
    if (!cur || !cur.incoming || m.from === me()) return;
    cur.gotOffer = true;
    if (!cur.pc) cur.pc = await makePeer();
    if (!m.restart && cur.pc.remoteDescription) {
      // aynı teklif ikinci kez geldi: cevabı tekrar gönder
      if (cur.pc.localDescription) ch.send('answer', { from: me(), sdp: cur.pc.localDescription });
      return;
    }
    await cur.pc.setRemoteDescription(m.sdp);
    for (const c of cur.pending) await cur.pc.addIceCandidate(c).catch(() => {});
    cur.pending = [];
    const ans = tuneSdp(await cur.pc.createAnswer());
    await cur.pc.setLocalDescription(ans);
    ch.send('answer', { from: me(), sdp: ans });
  });
  ch.on('answer', async (m) => {
    if (!cur || cur.incoming || m.from === me() || !cur.pc) return;
    if (cur.pc.signalingState !== 'have-local-offer') return; // tekrar gelen cevap
    await cur.pc.setRemoteDescription(m.sdp);
    for (const c of cur.pending) await cur.pc.addIceCandidate(c).catch(() => {});
    cur.pending = [];
  });
  ch.on('ice', async (m) => {
    if (!cur || m.from === me()) return;
    if (cur.pc && cur.pc.remoteDescription) await cur.pc.addIceCandidate(m.c).catch(() => {});
    else (cur.pending = cur.pending || []).push(m.c);
  });
  ch.on('bye', (m) => {
    if (!cur || m.from === me()) return;
    finish(m.reason === 'declined' ? 'Arama reddedildi' : 'Arama bitti');
  });
  ch.join();
  return ch;
}

/* ---------- Arama başlat ---------- */
export async function startCall(uid) {
  if (cur) return toast('Zaten bir aramadasın', true);
  if (!db.realtime) return toast('Sesli arama için sunucuya bağlı olmalısın', true);
  await assertActive();
  const other = await profile(uid, true);
  let local;
  try {
    local = await getMic();
  } catch (er) {
    return toast(er.message, true);
  }
  let call;
  try {
    call = await db.insert('calls', { caller_id: me(), callee_id: uid });
  } catch (e) {
    local.getTracks().forEach((t) => t.stop());
    return toast(friendly(e, 'Bu kişiyi arayamazsın.').message, true);
  }
  cur = { id: call.id, other, incoming: false, state: 'ringing', local, muted: false, speaker: false };
  window.KankaAndroid?.setInCall?.(true);
  cur.ch = openChannel(call.id);
  render();
  ring('out');
  cur.timeout = setTimeout(() => cur && cur.id === call.id && cur.state === 'ringing' && ((cur.endText = 'Cevap yok'), hangup('missed')), RING_MS);
  // aranan kişi reddederse / açarsa tablo değişir
  cur.unsub = db.subscribe('calls', `id=eq.${call.id}`, (row) => {
    if (!cur || row.id !== cur.id) return;
    if (row.status === 'declined') finish('Arama reddedildi');
    if (row.status === 'ended') finish('Arama bitti');
  });
}

/* ---------- Gelen arama ---------- */
async function showIncoming(call) {
  if (cur) {
    // meşgul: otomatik reddet (aynı arama iki kez geldiyse dokunma)
    if (cur.id !== call.id) db.update('calls', call.id, { status: 'declined' }).catch(() => {});
    return;
  }
  if (Date.now() - new Date(call.created_at).getTime() > RING_MS) return;
  const other = await profile(call.caller_id, true);
  cur = { id: call.id, other, incoming: true, state: 'ringing', muted: false, speaker: false };
  window.KankaAndroid?.setInCall?.(true);
  cur.ch = openChannel(call.id);
  render();
  ring('in');
  cur.timeout = setTimeout(() => cur && cur.id === call.id && cur.state === 'ringing' && finish('Cevapsız arama'), RING_MS);
  cur.unsub = db.subscribe('calls', `id=eq.${call.id}`, (row) => {
    if (!cur || row.id !== cur.id) return;
    if (['cancelled', 'missed'].includes(row.status)) finish('Cevapsız arama');
    if (row.status === 'ended') finish('Arama bitti');
  });
}
async function accept() {
  if (!cur) return;
  stopRing();
  cur.state = 'connecting';
  render();
  try {
    cur.local = await getMic();
  } catch (er) {
    toast(er.message, true);
    return hangup('declined');
  }
  try {
    await db.update('calls', cur.id, { status: 'accepted' });
  } catch (e) {
    toast(friendly(e, 'Arama açılamadı').message, true);
    return finish('Arama bitti');
  }
  const c = cur;
  c.pc = await makePeer();
  await c.ch.join();
  // "hazırım" mesajı kaybolursa diye teklif gelene kadar birkaç kez tekrarla
  for (let i = 0; i < 6 && cur === c && !c.gotOffer; i++) {
    c.ch.send('ready', { from: me() });
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (cur === c && !c.gotOffer) {
    c.endText = 'Bağlantı kurulamadı';
    hangup('ended');
  }
}

/** Kapat / reddet / iptal. */
export async function hangup(status = 'ended') {
  if (!cur) return;
  const c = cur;
  c.ch?.send('bye', { from: me(), reason: status }).catch?.(() => {});
  db.update('calls', c.id, { status }).catch(() => {});
  if (status === 'missed' && !c.incoming) db.insert('notifications', { user_id: c.other.id, actor_id: me(), type: 'missed_call', read: false, post_id: null, text: '' }).catch(() => {});
  finish(status === 'declined' ? 'Arama reddedildi' : status === 'missed' ? 'Cevap yok' : 'Arama bitti');
}
function finish(text) {
  if (!cur) return;
  const c = cur;
  stopRing();
  clearTimeout(c.timeout);
  clearInterval(tickT);
  c.unsub?.();
  try {
    c.pc?.close();
  } catch {
    /* zaten kapalı */
  }
  c.local?.getTracks().forEach((t) => t.stop());
  const a = document.getElementById('callAudio');
  if (a) a.srcObject = null;
  window.KankaAndroid?.setSpeaker?.(false);
  window.KankaAndroid?.setInCall?.(false);
  c.state = 'ended';
  c.endText = text;
  render();
  setTimeout(() => {
    c.ch?.close();
    if (cur === c) {
      cur = null;
      render();
    }
  }, 1400);
}

/* ---------- Gelen aramaları dinle ---------- */
export function listenIncoming() {
  unsubIncoming?.();
  clearInterval(pollT);
  if (!db.realtime || !me()) return;
  unsubIncoming = db.subscribe('calls', `callee_id=eq.${me()}`, (row, ev) => ev === 'INSERT' && row.status === 'ringing' && showIncoming(row));
  // yedek: canlı bağlantı kopsa da 5 sn'de bir bak
  const seen = new Set();
  pollT = setInterval(async () => {
    if (cur || document.hidden) return;
    const since = new Date(Date.now() - RING_MS).toISOString();
    const r = await db.list('calls', { eq: { callee_id: me(), status: 'ringing' }, gte: { created_at: since }, limit: 1 }).catch(() => []);
    if (r[0] && !seen.has(r[0].id)) {
      seen.add(r[0].id);
      showIncoming(r[0]);
    }
  }, 5000);
}
/** Android bildiriminden "Cevapla" ile gelindiyse aramayı aç ve cevapla. */
export async function openFromNotification(callId, action) {
  if (cur && cur.id === callId) {
    if (action === 'answer' && cur.incoming && cur.state === 'ringing') accept();
    return;
  }
  if (cur) return;
  const call = await db.get('calls', callId).catch(() => null);
  if (!call || call.status !== 'ringing') return toast('Arama sona ermiş', true);
  await showIncoming(call);
  if (action === 'answer') accept();
  if (action === 'decline') hangup('declined');
}
export async function recentCalls() {
  const [a, b] = await Promise.all([
    db.list('calls', { eq: { caller_id: me() }, order: ['created_at', false], limit: 20 }).catch(() => []),
    db.list('calls', { eq: { callee_id: me() }, order: ['created_at', false], limit: 20 }).catch(() => []),
  ]);
  return [...a, ...b].sort((x, y) => (x.created_at < y.created_at ? 1 : -1)).slice(0, 25);
}
export const inCall = () => !!cur;
