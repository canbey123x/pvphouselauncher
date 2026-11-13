// =========================================================
// app.js — Kanka: yönlendirme ve ekranlar (ana sayfa, reels, keşfet, paylaş,
// profil, gönderi + yorumlar, hikâye, DM, bildirimler, ayarlar, giriş/kayıt)
// =========================================================
import * as A from './api.js';
import { $, $$, esc, I, ic, TICK, avatar, uname, ago, num, toast, sheet, closeSheet, confirmSheet, promptSheet, pickFile, pickFiles, hydrate, mediaTag, autoplay, linkify } from './ui.js';
import * as S from './social.js';
import * as Calls from './calls.js';
import * as Group from './groupcall.js';
import * as Live from './live.js';
import { renderAdmin } from './admin.js';
import { openEditor, overlayHtml } from './editor.js';

const app = $('#app');
const tabbar = $('#tabbar');
let meP = null; // giriş yapan kullanıcının profili
let pollT = null;
let viewToken = 0;

/* =========================================================
   Başlangıç
   ========================================================= */
/* =========================================================
   Siteden uygulamaya geç: Android'de uygulama yüklüyse doğrudan uygulamada aç
   ========================================================= */
const APP_ID = 'com.kanka.sosyal';
const APK_URL = 'https://github.com/canbey123x/pvphouselauncher/releases/download/kanka-latest/Kanka.apk';
async function openInApp() {
  if (window.KankaAndroid || location.hostname === 'appassets.androidplatform.net' || !/Android/i.test(navigator.userAgent)) return;
  const ss = (k, v) => {
    try {
      return v === undefined ? sessionStorage.getItem(k) : sessionStorage.setItem(k, v);
    } catch {
      return null;
    }
  };
  const q = new URLSearchParams(location.search);
  if (q.has('web')) {
    // uygulama açılamadı (yüklü değil) ya da kullanıcı web'i seçti: bu oturumda bir daha sorma
    ss('kanka.web', '1');
    history.replaceState(null, '', location.pathname + location.hash);
  }
  let installed = null;
  try {
    if (navigator.getInstalledRelatedApps) installed = (await navigator.getInstalledRelatedApps()).some((a) => a.id === APP_ID);
  } catch {
    /* desteklenmiyor */
  }
  const hash = location.hash && location.hash.length > 2 ? location.hash : '#/home';
  const fallback = location.origin + location.pathname + '?web=1' + hash;
  const intent = `intent://open?h=${encodeURIComponent(hash)}#Intent;scheme=kanka;package=${APP_ID};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
  if (ss('kanka.web')) return;
  // yüklüyse hemen uygulamaya geç
  if (installed) {
    ss('kanka.web', '1');
    location.href = intent;
  }
  // tarayıcı otomatik geçişi engellerse tek dokunuşla açılsın
  let dismissed = false;
  try {
    dismissed = !installed && localStorage.getItem('kanka.appBar') === 'no';
  } catch {
    /* yok */
  }
  if (dismissed) return;
  const bar = document.createElement('div');
  bar.className = 'app-bar';
  bar.innerHTML = `<img src="icons/icon-192.png" alt=""><div class="grow"><b>Kanka uygulaması</b><small>${installed ? 'Telefonunda yüklü' : installed === false ? 'Bildirimler ve sesli arama için' : 'Yüklüyse uygulamada aç'}</small></div>
    ${installed === false ? `<a class="btn sm" href="${APK_URL}">İndir</a>` : `<a class="btn sm" href="${esc(intent)}">Aç</a>`}<button class="ibtn" aria-label="Kapat">${I.close}</button>`;
  document.body.appendChild(bar);
  $('.ibtn', bar).onclick = () => {
    bar.remove();
    ss('kanka.web', '1');
    try {
      if (!installed) localStorage.setItem('kanka.appBar', 'no');
    } catch {
      /* yok */
    }
  };
}

async function boot() {
  openInApp();
  S.applyTheme();
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => S.theme() === 'system' && S.applyTheme());
  // kankaa.com.tr/@kullanici bağlantısı -> profil
  const at = location.pathname.match(/\/@([a-z0-9_.]{2,30})\/?$/i);
  if (at) history.replaceState(null, '', location.pathname.replace(/@[^/]*\/?$/, '') + '#/u/' + at[1].toLowerCase());
  const inv = location.pathname.match(/\/davet\/([a-z0-9_.]{2,30})\/?$/i);
  if (inv) {
    setRef(inv[1]);
    history.replaceState(null, '', location.pathname.replace(/davet\/[^/]*\/?$/, '') + '#/signup/' + inv[1].toLowerCase());
  }
  await A.initDb();
  // Eski sürümün oluşturduğu deneme hesaplarını ve içeriklerini tamamen kaldır
  if (A.db.mode === 'local' && A.db.hasDemo()) await A.db.clearDemo();
  if (A.db.serverError) toast('Sunucuya bağlanılamadı, yerel moddasın: ' + A.db.serverError, true);
  A.db.onAuth(async () => {
    A.clearCache();
    meP = A.me() ? await A.profile(A.me(), true) : null;
    location.hash = A.me() ? '#/home' : '#/login';
    route();
    afterLogin();
  });
  if (A.me()) meP = await A.profile(A.me(), true);
  afterLogin();
  window.addEventListener('hashchange', route);
  if (!location.hash || location.hash === '#/') location.hash = A.me() ? '#/home' : '#/login';
  route();
  setInterval(() => !document.hidden && refreshBadges(true), 20000);
}

/** Giriş sonrası: gelen aramaları dinle, telefona bildirim anahtarı kaydet, Android'e oturumu ver. */
let pushDone = false;
function afterLogin() {
  if (!A.me()) {
    window.KankaAndroid?.setSession?.('', '', '', '');
    return;
  }
  Calls.listenIncoming();
  Group.listenGroupIncoming();
  applyRef().catch(() => {});
  A.db.rpc('touch_seen').catch(() => {});
  const K = window.KankaAndroid;
  if (!K) return;
  if (A.db.mode !== 'local' && K.setSession) {
    const send = () => K.setSession(A.db.url, A.db.key, A.db.accessToken() || '', A.me());
    send();
    A.db.onToken?.(send);
  }
  const reg = async () => {
    const tok = K.pushToken?.();
    if (!tok || pushDone || A.db.mode === 'local') return !!tok;
    pushDone = true;
    await A.db.rpc('register_device', { tok }).catch(() => (pushDone = false));
    return true;
  };
  // Firebase anahtarı geç gelebilir: bir dakika boyunca birkaç kez dene
  let tries = 0;
  const loop = async () => {
    await reg();
    if (!pushDone && ++tries < 8) setTimeout(loop, 8000);
  };
  loop();
  askNotifications();
  handleIntent();
}
/** Uygulama kapalıyken arama ve mesaj görebilmek için bildirim izni (tek sefer, açıklamalı). */
function askNotifications(force = false) {
  const K = window.KankaAndroid;
  if (!K?.notifEnabled || K.notifEnabled()) return;
  try {
    if (!force && localStorage.getItem('kanka.notifAsk')) return;
    localStorage.setItem('kanka.notifAsk', '1');
  } catch {
    /* yok */
  }
  sheet(
    `<div class="inner" style="text-align:center"><div style="width:52px;height:52px;margin:6px auto 10px">${I.bell}</div><h3 style="margin:0 0 6px">Aramaları kaçırma</h3>
    <p class="muted small">Uygulama kapalıyken ya da telefon kilitliyken gelen aramaları ve mesajları görebilmen için bildirimlere izin vermen gerekiyor.</p>
    <button class="btn block" id="nYes">İzin ver</button><button class="btn block gray" id="nNo" style="margin-top:8px">Şimdi değil</button></div>`,
    (c, close) => {
      $('#nYes', c).onclick = () => (close(), K.requestNotifications());
      $('#nNo', c).onclick = close;
    }
  );
}

/** Ayarlar > Bildirim testi: nerede takıldığını göster, kendine deneme bildirimi gönder. */
async function vNotifTest() {
  const K = window.KankaAndroid;
  const row = (ok, t, sub, id = '') => `<div class="list-row" ${id ? `id="${id}"` : ''}><span class="ic" style="width:22px;height:22px;color:${ok ? '#2ecc71' : '#ff6b77'}">${ok ? I.check : I.x}</span><div class="grow">${t}<small>${sub}</small></div></div>`;
  const tok = K?.pushToken?.() || '';
  let reg = false;
  if (tok && A.db.mode !== 'local') reg = !!(await A.db.list('device_tokens', { eq: { token: tok } }).catch(() => [])).length;
  const nOk = !!K?.notifEnabled?.();
  app.innerHTML = `${topbar('Bildirim testi', true)}
    ${!K ? `<p class="inner muted">Bu test Android uygulamasında çalışır.</p>` : ''}
    ${K ? row(nOk, 'Bildirim izni', nOk ? 'Açık' : 'Kapalı: açmak için dokun', 'ntPerm') : ''}
    ${K ? row(!!K.firebaseReady?.(), 'Uygulamada Firebase', K.firebaseReady?.() ? 'Var' : 'Bu sürümde yok') : ''}
    ${K ? row(!!tok, 'Telefon anahtarı', tok ? 'Alındı' : 'Alınamadı (internet ya da Google Play Hizmetleri)') : ''}
    ${K ? row(reg, 'Sunucuya kayıt', reg ? 'Kayıtlı' : 'Kayıtlı değil: uygulamayı kapatıp aç, bir dakika bekle') : ''}
    <div class="inner"><button class="btn block" id="ntSend">Kendime deneme bildirimi gönder</button>
    <p class="small muted">Birkaç saniye içinde bildirim çubuğunda "Bildirim testi" görünmeli. Görünmezse Supabase'deki "push" fonksiyonunun Logs kısmına bak.</p>
    <p class="small muted">Xiaomi, Huawei, Oppo, Vivo gibi telefonlarda: Ayarlar > Uygulamalar > Kanka > Pil tasarrufu "Kısıtlama yok" ve "Otomatik başlat" açık olmalı. Yoksa uygulama kapalıyken bildirim gelmez.</p></div>`;
  if ($('#ntPerm')) $('#ntPerm').onclick = () => K.requestNotifications();
  $('#ntSend').onclick = async () => {
    try {
      await A.db.insert('notifications', { user_id: A.me(), actor_id: A.me(), type: 'mention', post_id: null, text: 'Bildirim testi', read: false });
      toast('Gönderildi, bildirim çubuğuna bak');
    } catch (er) {
      toast(er.message, true);
    }
  };
}

/** Bildirime dokunarak açıldıysa ilgili sayfaya / aramaya git. */
function handleIntent(raw) {
  let it = raw;
  if (!it) {
    try {
      it = window.KankaAndroid?.takeIntent?.();
    } catch {
      it = null;
    }
  }
  if (!it) return;
  try {
    it = typeof it === 'string' ? JSON.parse(it) : it;
  } catch {
    return;
  }
  if (it.invite) {
    setRef(it.invite);
    if (!A.me()) return (location.hash = '#/signup/' + it.invite);
    return (location.hash = '#/u/' + it.invite);
  }
  if (!A.me()) return;
  if (it.share) return openShared(it);
  if (it.group_call_id) return Group.openFromNotification(it.group_call_id, it.action || '');
  if (it.call_id) return Calls.openFromNotification(it.call_id, it.action || '');
  if (it.live_id) return (location.hash = '#/live/' + it.live_id);
  if (it.conversation_id) return (location.hash = '#/dm/' + it.conversation_id);
  if (it.post_id) return (location.hash = '#/p/' + it.post_id);
  if (it.username) return (location.hash = '#/u/' + it.username);
  if (it.hash && /^#\/[\w\-\/%.@]*$/.test(it.hash)) return (location.hash = it.hash);
  if (it.type) location.hash = '#/notifs';
}
window.__kankaIntent = (it) => handleIntent(it);

/* ---------- Davet bağlantısı ---------- */
function setRef(u) {
  try {
    localStorage.setItem('kanka.ref', String(u).toLowerCase().replace(/[^a-z0-9_.]/g, ''));
  } catch {
    /* yok */
  }
}
/** Davetle kaydolduysa: davet edeni takip et, ona haber ver (bir kez). */
async function applyRef() {
  let ref = '';
  try {
    ref = localStorage.getItem('kanka.ref') || '';
  } catch {
    return;
  }
  if (!ref || !meP) return;
  try {
    localStorage.removeItem('kanka.ref');
  } catch {
    /* yok */
  }
  // sadece yeni hesaplar (son 1 gün) davetle sayılır
  if (Date.now() - new Date(meP.created_at || 0).getTime() > 86400000) return;
  const u = await A.byUsername(ref).catch(() => null);
  if (!u || u.id === A.me()) return;
  await A.follow(u.id).catch(() => {});
  A.notify(u.id, 'invite').catch(() => {});
  A.updateProfile({ invited_by: u.id }).catch(() => {});
  toast(`@${u.username} seni davet etti, onu takip ediyorsun`);
}
const inviteUrl = () => `${SITE}/davet/${meP?.username || ''}`;
function inviteSheet() {
  sheet(`<div class="invite-card"><h3 style="margin:0 0 4px">Arkadaşını Kanka'ya davet et</h3><p class="small muted" style="margin:0">Bu bağlantıyla kaydolan arkadaşın seni otomatik takip eder, sana da bildirim gelir.</p>
    <code>${esc(inviteUrl())}</code><button class="btn block" id="invShare">Bağlantıyı paylaş</button><button class="btn block gray" id="invCopy" style="margin-top:8px">Kopyala</button></div>`, (c, close) => {
    $('#invShare', c).onclick = () => (close(), shareLink(inviteUrl(), `Kanka'ya gel, beni @${meP.username} olarak bul:`));
    $('#invCopy', c).onclick = async () => {
      try {
        await navigator.clipboard.writeText(inviteUrl());
        toast('Kopyalandı');
      } catch {
        toast(inviteUrl());
      }
    };
  });
}

/* ---------- Paylaş > Kanka ---------- */
async function openShared(it) {
  const files = [];
  for (const f of it.share || []) {
    try {
      const r = await fetch('/shared/' + encodeURIComponent(f.name));
      const b = await r.blob();
      files.push(new File([b], f.name, { type: f.type || b.type }));
    } catch {
      /* okunamadı */
    }
  }
  window.__shareFiles = files;
  window.__shareText = it.text || '';
  if (!files.length && it.text) {
    // sadece yazı paylaşıldı: gönderi açıklamasına koy
    location.hash = '#/create/post';
    setTimeout(() => $('#cap') && ($('#cap').value = it.text.slice(0, 2200)), 400);
    return;
  }
  if (!files.length) return toast('Paylaşılan dosya açılamadı', true);
  location.hash = '#/create/share';
}
document.addEventListener('visibilitychange', () => !document.hidden && A.me() && handleIntent());

/* =========================================================
   Yönlendirme
   ========================================================= */
async function route() {
  clearInterval(pollT);
  closeSheet();
  const tok = ++viewToken;
  const h = location.hash.slice(2) || 'home';
  const [page, a, b] = h.split('/').map(decodeURIComponent);
  const authPages = ['login', 'signup', 'server', 'legal'];
  if (!A.me() && !authPages.includes(page)) return (location.hash = '#/login');
  if (!A.me() && page === 'legal') {
    tabbar.classList.add('hidden');
    return vLegal(a, b, tok);
  }
  if (A.me() && !meP) meP = await A.profile(A.me(), true);
  if (A.me() && !meP) {
    // profil henüz oluşmadıysa (sunucu tetikleyicisi) kısa bekle
    await new Promise((r) => setTimeout(r, 800));
    meP = await A.profile(A.me(), true);
    if (!meP) return renderMsg('Profil bulunamadı', 'Sunucu kurulumu eksik olabilir (supabase/schema.sql).', true);
  }
  if (A.me() && meP && !authPages.includes(page) && page !== 'legal') {
    const bs = A.banState(meP);
    if (bs.banned) return vBanned(bs);
    if (bs.restricted) restrictNotice(bs);
  }
  app.classList.toggle('fullscreen', page === 'reels' || page === 'story' || page === 'hl');
  document.body.style.overflow = page === 'reels' ? 'hidden' : '';
  showTabs(!authPages.includes(page) && page !== 'story' && page !== 'hl' && !(page === 'dm' && a) && page !== 'p', page);
  window.scrollTo(0, 0);
  try {
    const views = { login: vLogin, signup: vSignup, server: vServer, home: vHome, search: vSearch, create: vCreate, reels: vReels, u: vProfile, p: vPost, story: vStory, dm: a && !['msg', 'chan', 'calls'].includes(a) ? vChat : vInbox, notifs: vNotifs, settings: vSettings, edit: vEdit, follows: vFollows, admin: vAdmin, privacy: vPrivacy, requests: vRequests, blocked: vBlocked, verify: vVerify, legal: vLegal, tag: vTag, saved: vSaved, insights: vInsights, closefriends: vCloseFriends, appearance: vAppearance, group: vGroup, hl: vHighlight, notiftest: vNotifTest, live: vLive, nearby: vNearby };
    const fn = views[page] || vHome;
    await fn(a, b, tok);
  } catch (e) {
    console.error(e);
    if (tok === viewToken) renderMsg('Bir hata oldu', e.message || String(e), true);
  }
  hydrate(app);
  refreshBadges();
}
const stale = (tok) => tok !== viewToken;

function renderMsg(title, text, back) {
  app.innerHTML = `${back ? topbar(esc(title), true) : ''}<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

function showTabs(on, page) {
  tabbar.classList.toggle('hidden', !on);
  if (!on || !meP) return;
  tabbar.classList.toggle('dark', page === 'reels');
  const t = (id, icon, href) => `<a class="tab ${page === id ? 'on' : ''}" href="${href}">${icon}</a>`;
  tabbar.innerHTML =
    t('home', I.home, '#/home') +
    t('search', I.search, '#/search') +
    t('create', I.plus, '#/create') +
    t('reels', I.reels, '#/reels') +
    `<a class="tab ${page === 'u' && location.hash.includes(meP.username) ? 'on' : ''}" href="#/u/${encodeURIComponent(meP.username)}">${avatar(meP, 26)}</a>`;
  hydrate(tabbar);
}

function topbar(title, back = false, right = '', line = true) {
  return `<header class="topbar ${line ? 'line' : ''}">${back ? `<button class="ibtn" onclick="history.length>1?history.back():location.hash='#/home'">${I.back}</button>` : ''}<h1>${title}</h1>${right}</header>`;
}

let badgeBusy = false;
let badgeAt = 0;
async function refreshBadges(force = false) {
  if (!A.me() || badgeBusy) return;
  if (!force && Date.now() - badgeAt < 10000) return;
  badgeAt = Date.now();
  badgeBusy = true;
  try {
    const fresh = await A.profile(A.me(), true);
    if (fresh) {
      const was = A.banState(meP);
      const now = A.banState(fresh);
      meP = fresh;
      if (now.banned !== was.banned || now.restricted !== was.restricted) {
        if (!now.restricted) restrictShown = false;
        route();
      }
    }
    const n = await A.unreadCount();
    $$('.nbadge').forEach((el) => {
      el.textContent = n > 9 ? '9+' : n;
      el.classList.toggle('hidden', !n);
    });
  } catch {
    /* sessiz */
  }
  badgeBusy = false;
}

/* =========================================================
   Giriş / kayıt / sunucu
   ========================================================= */
function modeBadge() {
  if (A.db.mode !== 'local') return `<div class="modebadge">${ic('globe', 14)}Sunucuya bağlı. Arkadaşların aynı uygulamadan seni görür.</div>`;
  return `<div class="modebadge" style="text-align:left">${ic('device', 14)}<b>Sunucuya bağlanılamadı.</b> İnternet bağlantını kontrol et ya da yönetici sunucuyu henüz ayarlamamış olabilir.${A.db.serverError ? `<br><span class="small" style="color:#ff6b77">Hata: ${esc(A.db.serverError)}</span>` : ''}
    <button class="btn block gray" id="retry" type="button" style="margin-top:8px">Tekrar dene</button></div>`;
}
function bindRetry() {
  const r = $('#retry');
  if (r) r.onclick = () => location.reload();
}
function vLogin() {
  app.innerHTML = `<div class="auth"><div class="logo">Kanka</div>
    <form class="form" id="f"><input class="field" name="email" type="email" placeholder="E-posta" autocomplete="email" required>
    <input class="field" name="pass" type="password" placeholder="Şifre" autocomplete="current-password" required>
    <div class="err" id="err"></div><button class="btn block">Giriş yap</button></form>
    <div class="alt">Hesabın yok mu? <a href="#/signup">Kaydol</a></div>${modeBadge()}<div class="alt small"><a href="#/legal" style="color:var(--muted);font-weight:400">Sözleşmeler ve gizlilik</a></div></div>`;
  bindRetry();
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = $('button', f);
    btn.disabled = true;
    try {
      await A.db.signIn(f.email.value, f.pass.value);
    } catch (er) {
      $('#err').textContent = er.message;
      btn.disabled = false;
    }
  };
}
function vSignup(ref) {
  if (ref) setRef(ref);
  let refName = '';
  try {
    refName = localStorage.getItem('kanka.ref') || '';
  } catch {
    /* yok */
  }
  app.innerHTML = `<div class="auth"><div class="logo">Kanka</div><p class="alt" style="margin-top:-12px">Arkadaşlarının fotoğraf ve videolarını görmek için kaydol.</p>
    ${refName ? `<div class="ref-note"><b>@${esc(refName)}</b> seni Kanka'ya davet etti</div>` : ''}
    <form class="form" id="f"><input class="field" name="email" type="email" placeholder="E-posta" required>
    <input class="field" name="name" placeholder="Adı Soyadı" required maxlength="40">
    <input class="field" name="username" placeholder="Kullanıcı adı" required maxlength="24" autocapitalize="off">
    <input class="field" name="pass" type="password" placeholder="Şifre (en az 6 karakter)" minlength="6" required>
    <label class="small muted" style="margin-bottom:-6px">Doğum tarihi</label><input class="field" name="birth" type="date" required max="${new Date().toISOString().slice(0, 10)}">
    <label class="check"><input type="checkbox" name="terms" required> <span><a href="#/legal/kullanim-kosullari">Kullanım Koşulları</a>, <a href="#/legal/topluluk-kurallari">Topluluk Kuralları</a> ve <a href="#/legal/gizlilik-politikasi">Gizlilik Politikası</a>'nı okudum, kabul ediyorum.</span></label>
    <div class="err" id="err"></div><button class="btn block">Kaydol</button></form>
    <div class="alt">Hesabın var mı? <a href="#/login">Giriş yap</a></div>${modeBadge()}</div>`;
  bindRetry();
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const username = f.username.value.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (username.length < 3) return ($('#err').textContent = 'Kullanıcı adı en az 3 karakter olmalı (harf, rakam, _ ve .).');
    const age = A.ageOf(f.birth.value);
    if (age === null || age < A.MIN_AGE) return ($('#err').textContent = `Kanka'yı kullanmak için en az ${A.MIN_AGE} yaşında olmalısın.`);
    if (!f.terms.checked) return ($('#err').textContent = 'Devam etmek için sözleşmeleri kabul etmelisin.');
    const btn = $('button', f);
    btn.disabled = true;
    try {
      await A.db.signUp({ email: f.email.value, password: f.pass.value, username, name: f.name.value.trim() });
      await A.savePrivateInfo(f.birth.value);
      toast('Hoş geldin!');
    } catch (er) {
      $('#err').textContent = er.message;
      btn.disabled = false;
    }
  };
}
function vServer() {
  const cfg = A.serverConfig();
  const src = { manual: 'elle girildi', remote: 'otomatik', builtin: 'uygulamaya gömülü' }[cfg?.source] || '';
  app.innerHTML = `${topbar('Sunucu', true)}<div class="create">
    <div class="modebadge" style="text-align:left">${A.db.mode === 'local' ? `${ic('device', 14)}<b>Bağlı değil</b> (yerel mod: her şey sadece bu cihazda)` : `${ic('globe', 14)}<b>Bağlı:</b> ${esc(cfg?.url || '')}<br><span class="small">Kaynak: ${src}</span>`}</div>
    <details><summary class="muted" style="padding:8px 0">Gelişmiş: adres ve anahtarı elle gir</summary><div class="form">
      <input class="field" id="su" placeholder="Supabase URL (https://xxxx.supabase.co)" value="${esc(cfg?.url || '')}">
      <input class="field" id="sk" placeholder="publishable / anon anahtar" value="${esc(cfg?.key || '')}">
      <button class="btn block gray" id="save">Bağlan</button></div></details>
    ${cfg?.source === 'manual' ? '<button class="btn block gray" id="auto">Otomatik ayara dön</button>' : ''}
    <p class="small muted">Uygulama açılışta yöneticinin ayarladığı sunucuya kendiliğinden bağlanır. Elle girilen ayar bunun önüne geçer.</p></div>`;
  bindRetry();
  $('#save').onclick = () => {
    const url = $('#su').value.trim().replace(/\/$/, '');
    const key = $('#sk').value.trim();
    if (!/^https:\/\/.+/.test(url) || key.length < 20) return toast('URL ya da anahtar hatalı', true);
    if (/^sb_secret_/.test(key)) return toast('Bu secret anahtar! Publishable anahtarı gir.', true);
    A.setServerConfig({ url, key });
    location.hash = '#/login';
    location.reload();
  };
  if ($('#auto'))
    $('#auto').onclick = () => {
      A.setServerConfig(null);
      location.hash = '#/login';
      location.reload();
    };
}

/** Videonun filtre ayarı ve vinyet. */
function vidAttrs(m) {
  return m && m.filter ? `style="filter:${esc(m.filter)}"` : '';
}
function vigStyle(m) {
  return m && m.vig ? `style="--vig:${((m.vig / 100) * 0.75).toFixed(2)}"` : '';
}

/* =========================================================
   Gönderi kartı
   ========================================================= */
/** Hikâye tepkileri (kendi çizimimiz, emoji yok). DM'de ::tepki:ad:: olarak gider. */
const REACT = {
  kalp: '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.2-9.2C1.6 8 3.6 4.5 7 4.5c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.4 0 5.4 3.5 4.2 6.8-1.7 4.6-9.2 9.2-9.2 9.2z" fill="#ff3040"/></svg>',
  ates: '<svg viewBox="0 0 24 24"><path d="M12 2c1.5 4.5 6.5 6.2 6.5 12a6.5 6.5 0 0 1-13 0c0-3.3 1.9-5.1 2.8-7 .5 2.3 1.9 3.3 2.8 3.3-1-3.3 0-6 .9-8.3z" fill="#ff6a00"/><path d="M12 12.5c1 1.8 3.2 2.8 3.2 5a3.2 3.2 0 0 1-6.4 0c0-1.8 1.8-2.8 3.2-5z" fill="#ffd400"/></svg>',
  kahkaha: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ffd400"/><path d="M7 9.5l2 1-2 1M17 9.5l-2 1 2 1" stroke="#3a2a00" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 13.5h11c-.6 3-2.8 5-5.5 5s-4.9-2-5.5-5z" fill="#3a2a00"/></svg>',
  sasirma: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ffd400"/><circle cx="8.5" cy="9.5" r="1.4" fill="#3a2a00"/><circle cx="15.5" cy="9.5" r="1.4" fill="#3a2a00"/><ellipse cx="12" cy="15.5" rx="2.2" ry="2.8" fill="#3a2a00"/></svg>',
  alkis: '<svg viewBox="0 0 24 24"><path d="M8 21c-2.5-1.5-4-4-4-7l1-5c.2-.9 1.6-.8 1.6.1L6.5 12l3.7-6.4c.4-.7 1.6-.4 1.4.5L10.5 10l3.6-5.3c.5-.7 1.6-.2 1.3.6l-1.8 4.3 2.8-3.4c.6-.7 1.6 0 1.1.8L13 14l2.5-2c.7-.5 1.5.4.9 1L12 17c-1 1-2 3-4 4z" fill="#ffc400" stroke="#8a5a00" stroke-width=".8"/></svg>',
  uzgun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ffd400"/><circle cx="8.5" cy="10" r="1.3" fill="#3a2a00"/><circle cx="15.5" cy="10" r="1.3" fill="#3a2a00"/><path d="M8 17c1.2-1.6 2.5-2.2 4-2.2s2.8.6 4 2.2" stroke="#3a2a00" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M16.5 12.5c0 1 .9 2.6 1.4 2.6s1.1-1.6 1.1-2.6" fill="#4fb4ff"/></svg>',
};
const REACT_NAMES = { kalp: 'Kalp', ates: 'Ateş', kahkaha: 'Kahkaha', sasirma: 'Şaşırma', alkis: 'Alkış', uzgun: 'Üzgün' };
/** Mesaj metnindeki tepki kodlarını çizime çevir. */
function richText(t) {
  return linkify(t).replace(/::tepki:([a-z]+)::/g, (m, k) => (REACT[k] ? `<span class="react-big" title="${REACT_NAMES[k]}">${REACT[k]}</span>` : m));
}
const plainPreview = (t) => (t || '').replace(/::tepki:([a-z]+)::/g, (m, k) => `[${REACT_NAMES[k] || 'tepki'}]`);

/** Bağlantı paylaş: Android paylaş menüsü, tarayıcı paylaşımı ya da panoya kopyala. */
async function shareLink(url, text = '') {
  if (window.KankaAndroid?.share) return window.KankaAndroid.share(`${text ? text + ' ' : ''}${url}`);
  if (navigator.share) {
    try {
      return await navigator.share({ url, text });
    } catch {
      /* vazgeçti */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Bağlantı kopyalandı');
  } catch {
    promptSheet('Bağlantı', '', () => {}, false, url);
  }
}
const SITE = 'https://kankaa.com.tr';
const profileUrl = (u) => `${SITE}/@${u}`;
const postUrl = (id) => `${SITE}/#/p/${id}`;

/** Gönderi listelerini hazırla: kaydedilme durumu. */
async function prep(items) {
  const sv = await S.savedIds().catch(() => new Set());
  items.forEach((p) => (p.saved = sv.has(p.id)));
  return items;
}

function mediaHtml(p) {
  if (p.kind === 'poll') return pollCardHtml(p);
  const items = S.mediaItems(p);
  const one = (it) => `${mediaTag(it.url, it.kind, '', it.kind === 'video' ? 'data-auto ' + vidAttrs(it) : '')}${it.kind === 'video' ? overlayHtml(it) : ''}${it.kind === 'video' ? `<button class="mute" data-a="mute">${I.mute}</button>` : ''}`;
  const tags = p.meta?.tagged ? `<button class="tag-btn" data-a="tags">${ic('user', 14)}</button>` : '';
  if (items.length === 1) return `<div class="media" data-a="dbl" ${vigStyle(p.meta)}>${one(items[0])}${tags}<div class="heart-pop">${I.heartFill}</div></div>`;
  return `<div class="media multi" data-a="dbl"><div class="carousel">${items.map((it) => `<div class="slide" ${vigStyle(it)}>${one(it)}</div>`).join('')}</div>
    <span class="car-count">1/${items.length}</span>${tags}<div class="heart-pop">${I.heartFill}</div></div>
    <div class="car-dots">${items.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>`;
}

function postHtml(p) {
  const key = p.feedKey || p.id;
  const mine = p.user_id === A.me();
  return `<article class="post" data-k="${esc(key)}">
    ${p.reposter ? `<div class="rp-line">${I.repost}<a href="#/u/${esc(p.reposter.username)}">${esc(p.reposter.username)}</a> repost etti</div>` : ''}
    ${p.suggested ? `<div class="sugg">Senin için önerilen</div>` : ''}
    <div class="post-head"><a href="#/u/${esc(p.author.username)}">${avatar(p.author, 34)}</a>
      <a class="who" href="#/u/${esc(p.author.username)}">${uname(p.author)}${p.meta?.location ? `<span class="post-loc">${esc(p.meta.location)}</span>` : `<small>${ago(p.created_at, true)}</small>`}</a>
      <button class="ibtn" data-a="more">${I.dots}</button></div>
    ${mediaHtml(p)}
    <div class="acts"><button class="act ${p.liked ? 'on-like' : ''}" data-a="like">${I.heart}<span>${p.hideLikes ? '' : num(p.likeCount)}</span></button>
      <a class="act" href="#/p/${p.id}">${I.comment}<span>${num(p.commentCount)}</span></a>
      ${p.author.private ? '' : `<button class="act ${p.reposted ? 'on-rp' : ''}" data-a="repost">${I.repost}<span>${num(p.repostCount)}</span></button>`}
      <button class="act" data-a="share">${I.send}</button>
      <button class="act save ${p.saved ? 'on-save' : ''}" data-a="save" title="Kaydet">${I.bookmark}</button></div>
    ${p.caption && p.kind !== 'poll' ? `<div class="cap"><b>${esc(p.author.username)}</b>${linkify(p.caption)}</div>` : ''}
    ${p.commentCount ? `<a class="vc" href="#/p/${p.id}">${p.commentCount} yorumun tümünü gör</a>` : ''}
    ${mine ? `<a class="vc ins-link" href="#/insights/${p.id}">${ic('chart', 13)} İstatistikleri gör</a>` : ''}
  </article>`;
}

/** Gönderi listesindeki butonları bağla. */
function bindPosts(root, list, onRemoved) {
  const find = (el) => list.find((p) => (p.feedKey || p.id) === el.closest('[data-k]')?.dataset.k);
  hydratePolls(root, list);
  root.onclick = async (e) => {
    const pv = e.target.closest('[data-vote-i]');
    if (pv) {
      const card = pv.closest('.poll-card');
      const p = list.find((x) => x.id === card.dataset.poll);
      if (p && !card.dataset.voted) votePoll(p, +pv.dataset.voteI, card);
      return;
    }
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const p = find(b);
    if (!p) return;
    const a = b.dataset.a;
    if (a === 'like') return likeAnim(p, b.closest('.post'), false);
    if (a === 'repost') {
      try {
        await A.toggleRepost(p);
        b.classList.toggle('on-rp', p.reposted);
        $('span', b).textContent = num(p.repostCount);
        toast(p.reposted ? 'Profiline repost edildi' : 'Repost geri alındı');
      } catch (er) {
        toast(er.message, true);
      }
    }
    if (a === 'share') shareSheet(p);
    if (a === 'more') postMenu(p, () => onRemoved?.(p), b.closest('.post, .reel'));
    if (a === 'save') {
      try {
        p.saved = await S.toggleSave(p);
        b.classList.toggle('on-save', p.saved);
        toast(p.saved ? 'Kaydedildi' : 'Kaydedilenlerden çıkarıldı');
      } catch (er) {
        toast(er.message, true);
      }
    }
    if (a === 'tags') {
      e.stopPropagation();
      const users = await S.postTags(p.id);
      sheet(`<h3>Bu gönderide</h3>${users.map((u) => `<a class="list-row" href="#/u/${esc(u.username)}">${avatar(u, 40)}<div class="grow">${uname(u)}<small>${esc(u.name)}</small></div></a>`).join('') || '<p class="inner muted">Etiketlenen kimse yok.</p>'}`);
    }
    if (a === 'mute') {
      e.stopPropagation();
      const v = $('video', b.parentElement);
      v.muted = !v.muted;
      b.innerHTML = v.muted ? I.mute : I.sound;
    }
  };
  // çoklu medya: kaydırınca sayaç ve noktalar
  root.addEventListener(
    'scroll',
    (e) => {
      const c = e.target;
      if (!c.classList?.contains('carousel')) return;
      const i = Math.round(c.scrollLeft / c.clientWidth);
      const post = c.closest('.post');
      const n = c.children.length;
      $('.car-count', post).textContent = `${i + 1}/${n}`;
      $$('.car-dots i', post).forEach((d, k) => d.classList.toggle('on', k === i));
      $$('video', c).forEach((v, k) => (Math.round(v.closest('.slide').offsetLeft / c.clientWidth) === i ? v.play().catch(() => {}) : v.pause()));
    },
    true
  );
  // çift dokunuşla beğen
  let lastTap = 0;
  root.addEventListener('pointerup', (e) => {
    const m = e.target.closest('[data-a="dbl"]');
    if (!m || e.target.closest('.mute, .tag-btn')) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      const p = find(m);
      if (p) likeAnim(p, m.closest('.post'), true);
      lastTap = 0;
    } else lastTap = now;
  });
}
async function likeAnim(p, card, dbl) {
  if (dbl) {
    const h = $('.heart-pop', card);
    h.classList.remove('go');
    void h.offsetWidth;
    h.classList.add('go');
    if (p.liked) return;
  }
  try {
    await A.toggleLike(p);
  } catch (er) {
    return toast(er.message, true);
  }
  const btn = $('[data-a="like"]', card);
  btn.classList.toggle('on-like', p.liked);
  $('span', btn).textContent = p.hideLikes ? '' : num(p.likeCount);
}

function postMenu(p, onRemoved, card) {
  const mine = p.user_id === A.me();
  const admin = A.isAdminP(meP);
  const opts = [];
  opts.push({ icon: I.link, label: 'Bağlantıyı paylaş', run: () => shareLink(postUrl(p.id), `@${p.author.username} gönderisi`) });
  opts.push({ icon: I.bookmark, label: p.saved ? 'Kaydedilenlerden çıkar' : 'Kaydet', run: async () => ((p.saved = await S.toggleSave(p)), card && $('[data-a="save"]', card)?.classList.toggle('on-save', p.saved), toast(p.saved ? 'Kaydedildi' : 'Çıkarıldı')) });
  if (!mine)
    opts.push({
      icon: I.eye,
      label: 'İlgilenmiyorum',
      run: () => {
        S.notInterested(p);
        if (card) {
          card.style.transition = 'opacity .25s';
          card.style.opacity = '0';
          setTimeout(() => (card.outerHTML = `<div class="ni-note">${ic('check', 14)} Anlaşıldı. Bu tür gönderileri daha az göstereceğiz.</div>`), 250);
        }
        toast('Akışın buna göre düzenlenecek');
      },
    });
  if (mine) opts.push({ icon: I.chart, label: 'İstatistikler', run: () => (location.hash = '#/insights/' + p.id) });
  if (!mine) opts.push({ icon: I.user, label: `@${p.author.username} profiline git`, run: () => (location.hash = '#/u/' + p.author.username) });
  opts.push({ icon: I.comment, label: 'Yorumlar', run: () => (location.hash = '#/p/' + p.id) });
  if (!mine) opts.push({ icon: I.flag, label: 'Şikâyet et', red: true, run: () => reportFlow('post', p.id) });
  if (mine)
    opts.push({
      icon: I.pen,
      label: 'Açıklamayı düzenle',
      run: () =>
        promptSheet('Açıklama', 'Açıklama yaz...', async (t) => {
          try {
            await A.updateCaption(p, t);
            toast('Açıklama güncellendi');
            onRemoved?.();
          } catch (er) {
            toast(er.message, true);
          }
        }, true, p.caption),
    });
  if (mine || admin)
    opts.push({
      icon: I.trash,
      label: mine ? 'Gönderiyi sil' : 'Sil (yönetici)',
      red: true,
      run: () =>
        confirmSheet('Gönderi silinsin mi?', async () => {
          await A.deletePost(p.id);
          toast('Gönderi silindi');
          onRemoved?.();
        }, 'Sil'),
    });
  sheet(opts);
}
function reportFlow(type, id) {
  const reasons = ['Spam', 'Çıplaklık / müstehcenlik', 'Reşit olmayanlarla ilgili uygunsuz içerik', 'Nefret söylemi', 'Zorbalık / taciz', 'Şiddet veya tehdit', 'Kendine zarar verme', 'Sahte hesap / kimliğe bürünme', 'Telif hakkı ihlali', 'Diğer'];
  sheet(
    reasons.map((r) => ({
      label: r,
      run: async () => {
        await A.report(type, id, r);
        toast('Teşekkürler, şikâyetin yöneticilere iletildi');
      },
    }))
  );
}
async function shareSheet(p) {
  const fol = await A.following();
  const pm = await A.profiles(fol);
  const users = [...pm.values()];
  sheet(
    `<h3>Gönder</h3>${users.length ? users.map((u) => `<button class="opt" data-u="${u.id}">${avatar(u, 40)}<span>${uname(u)}<br><small class="muted">${esc(u.name)}</small></span></button>`).join('') : '<p class="muted inner">Takip ettiğin kimse yok.</p>'}`,
    (c, close) => {
      c.onclick = async (e) => {
        const b = e.target.closest('[data-u]');
        if (!b) return;
        const conv = await A.conversationWith(b.dataset.u);
        await A.sendMessage(conv, { text: `Gönderi paylaştı: #/p/${p.id}${p.caption ? ' — ' + p.caption.slice(0, 60) : ''}` });
        close();
        toast('Gönderildi');
      };
    }
  );
}

/* =========================================================
   Ana sayfa
   ========================================================= */
let homeMode = (() => {
  try {
    return localStorage.getItem('kanka.home') || 'foryou';
  } catch {
    return 'foryou';
  }
})();
async function vHome(_a, _b, tok) {
  app.innerHTML = `${topbar('<span class="logo">Kanka</span>', false, `<a class="ibtn" href="#/notifs">${I.heart}<span class="dot nbadge hidden"></span></a><a class="ibtn" href="#/dm">${I.send}</a>`, false)}<div id="ann"></div><div class="stories" id="stories"></div>
    <div class="feed-tabs" id="ftabs"><button data-m="foryou">Senin için</button><button data-m="following">Takip ettiklerin</button></div><div id="feed"><div class="empty"><div class="spin" style="margin:auto"></div></div></div>`;
  $$('#ftabs button').forEach((b) => b.classList.toggle('on', b.dataset.m === homeMode));
  $('#ftabs').onclick = (e) => {
    const b = e.target.closest('[data-m]');
    if (!b || b.dataset.m === homeMode) return;
    homeMode = b.dataset.m;
    try {
      localStorage.setItem('kanka.home', homeMode);
    } catch {
      /* yok */
    }
    route();
  };
  const [groups, items, ann, lives] = await Promise.all([A.storyGroups(), A.feed(homeMode).then(prep), A.activeAnnouncements(), A.following().then((f) => Live.activeLives(f)).catch(() => [])]);
  const livePm = await A.profiles(lives.map((l) => l.user_id));
  if (stale(tok)) return;
  $('#ann').innerHTML = restrictBanner(A.banState(meP)) + ann.map((x) => `<div class="announce">${ic('megaphone', 18)}<span>${linkify(x.text)}</span></div>`).join('');
  if ($('#rBanner')) $('#rBanner').onclick = () => ((restrictShown = false), restrictNotice(A.banState(meP)));
  if (A.db.mode === 'local') $('#ann').insertAdjacentHTML('afterbegin', `<a class="announce" href="#/server" style="border-color:#5a1a22;background:#1a0a0d">${ic('device', 18)}<span><b>Sunucuya bağlı değilsin.</b> Arkadaşlarını göremezsin. Ayrıntı için dokun.</span></a>`);
  const mine = groups.find((g) => g.user.id === A.me());
  $('#stories').innerHTML =
    `<a class="st" href="${mine ? '#/story/' + A.me() : '#/create/story'}"><span class="wrap">${avatar(meP, 62, mine ? (mine.allSeen ? 'seen' : 'new') : '')}${mine ? '' : '<span class="plus">+</span>'}</span><span>Hikâyen</span></a>` +
    lives.map((l) => `<a class="st live" href="#/live/${l.id}"><span class="wrap">${avatar(livePm.get(l.user_id), 62, 'live')}<span class="live-tag">CANLI</span></span><span>${esc(livePm.get(l.user_id)?.username || '')}</span></a>`).join('') +
    groups
      .filter((g) => g.user.id !== A.me())
      .map((g) => `<a class="st" href="#/story/${g.user.id}">${avatar(g.user, 62, g.allSeen ? 'seen' : g.stories.some((x) => !x.seen && x.meta?.audience === 'close') ? 'close' : 'new')}<span>${esc(g.user.username)}</span></a>`)
      .join('');
  const feed = $('#feed');
  if (!items.length) {
    feed.innerHTML = `<div class="empty"><div class="ico">${I.camera}</div><h3>Henüz gönderi yok</h3><p>İlk fotoğrafını ya da videonu paylaş, arkadaşlarını takip et.</p><a class="btn" href="#/create">Paylaş</a> <a class="btn gray" href="#/search">Kişi bul</a></div>`;
    return;
  }
  feed.innerHTML = items.map(postHtml).join('');
  bindPosts(feed, items, () => route());
  showMemory(feed).catch(() => {});
  hydrate(app);
  autoplay(feed);
  trackSeen(feed, items);
}
/** Ekranda 1 saniyeden uzun kalan gönderiler "görüldü" sayılır (algoritma bunları geriye atar). */
let seenIO = null;
function trackSeen(root, items) {
  seenIO?.disconnect();
  const timers = new Map();
  seenIO = new IntersectionObserver(
    (ents) => {
      for (const e of ents) {
        const k = e.target.dataset.k;
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
          if (!timers.has(k))
            timers.set(
              k,
              setTimeout(() => {
                const it = items.find((p) => (p.feedKey || p.id) === k);
                const id = it?.id || k;
                A.markSeen(id);
                S.recordView(id, it?.user_id);
              }, 1000)
            );
        } else {
          clearTimeout(timers.get(k));
          timers.delete(k);
        }
      }
    },
    { threshold: [0, 0.6] }
  );
  $$('.post[data-k]', root).forEach((el) => seenIO.observe(el));
}

/* =========================================================
   Keşfet / arama: geçmiş, gündemdeki etiketler, öneriler
   ========================================================= */
function userRow(u, extra = '') {
  return `<a class="list-row" href="#/u/${esc(u.username)}" data-hist-u="${esc(u.username)}">${avatar(u, 44)}<div class="grow">${uname(u)}<small>${esc(u.name)}${extra}</small></div></a>`;
}
function suggestCards(list) {
  if (!list.length) return '';
  return `<div class="section-t">Senin için öneriler</div><div class="sug-row">${list
    .map(
      (s) => `<div class="sug-card" data-u="${s.user.id}"><a href="#/u/${esc(s.user.username)}">${avatar(s.user, 64)}</a><div class="sug-n">${uname(s.user)}</div>
      <div class="sug-m">${s.followsYou ? 'Seni takip ediyor' : s.mutual ? `${s.mutual} ortak arkadaş` : 'Yeni kullanıcı'}</div><button class="btn sm" data-fol="${s.user.id}">Takip et</button></div>`
    )
    .join('')}</div>`;
}
function bindSuggest(root) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fol]');
    if (!b) return;
    e.preventDefault();
    try {
      const st = await A.follow(b.dataset.fol);
      b.textContent = st === 'requested' ? 'İstek gönderildi' : 'Takip ediliyor';
      b.classList.add('gray');
      b.disabled = true;
    } catch (er) {
      toast(er.message, true);
    }
  });
}
async function vSearch(_a, _b, tok) {
  app.innerHTML = `<div class="topbar"><div class="search" style="flex:1;margin:0">${I.search}<input id="q" placeholder="Kişi ya da #etiket ara" autocomplete="off"></div></div><div id="res"></div>`;
  const res = $('#res');
  const showHome = async () => {
    const [trend, sugg, posts] = await Promise.all([S.trendingTags(10), S.suggestions(10), A.explore()]);
    if (stale(tok) || $('#q').value.trim()) return;
    const hist = S.searchHistory();
    res.innerHTML =
      `<div class="chips quick"><a href="#/nearby">${ic('globe', 14)} Yakındakiler</a><a href="#/dm/chan">${ic('megaphone', 14)} Kanallar</a><a href="#/create/live">${ic('eye', 14)} Canlı yayın</a></div>` +
      (hist.length
        ? `<div class="section-t row-t">Son aramalar<button class="link" id="hClear">Temizle</button></div>${hist
            .map((h) => `<div class="list-row hist" data-type="${h.type}" data-key="${esc(h.key)}"><a class="grow" href="${h.type === 'tag' ? '#/tag/' + encodeURIComponent(h.key) : '#/u/' + encodeURIComponent(h.key)}">${h.type === 'tag' ? `<span class="tag-ico">#</span>` : I.user}<span>${h.type === 'tag' ? '#' : ''}${esc(h.key)}</span></a><button class="ibtn" data-x>${I.close}</button></div>`)
            .join('')}`
        : '') +
      (trend.length ? `<div class="section-t">Gündemdeki etiketler</div><div class="chips trend">${trend.map((t) => `<a href="#/tag/${encodeURIComponent(t.tag)}" data-hist-t="${esc(t.tag)}">#${esc(t.tag)} <small>${t.n}</small></a>`).join('')}</div>` : '') +
      suggestCards(sugg) +
      `<div class="section-t">Keşfet</div>` +
      (posts.length ? `<div class="grid3">${posts.map((p) => `<a class="cell" href="#/p/${p.id}">${mediaTag(p.media, p.kind)}${p.kind === 'video' ? `<span class="badge">${I.play}</span>` : p.meta?.items?.length ? `<span class="badge">${I.grid}</span>` : ''}</a>`).join('')}</div>` : '<div class="empty">Keşfedecek bir şey yok henüz.</div>');
    hydrate(res);
    if ($('#hClear')) $('#hClear').onclick = () => (S.clearHistory(), showHome());
  };
  res.addEventListener('click', (e) => {
    const x = e.target.closest('[data-x]');
    if (x) {
      const row = x.closest('.hist');
      S.removeHistory({ type: row.dataset.type, key: row.dataset.key });
      row.remove();
      return;
    }
    const u = e.target.closest('[data-hist-u]');
    if (u) S.addHistory({ type: 'user', key: u.dataset.histU });
    const t = e.target.closest('[data-hist-t]');
    if (t) S.addHistory({ type: 'tag', key: t.dataset.histT });
  });
  bindSuggest(res);
  let t = null;
  $('#q').oninput = (e) => {
    clearTimeout(t);
    const raw = e.target.value.trim();
    t = setTimeout(async () => {
      if (!raw) return showHome();
      if (raw.startsWith('#')) {
        const q = raw.slice(1).toLocaleLowerCase('tr-TR');
        const trend = (await S.trendingTags(50)).filter((x) => x.tag.includes(q));
        const tags = q && !trend.some((x) => x.tag === q) ? [{ tag: q, n: 0 }, ...trend] : trend;
        res.innerHTML = tags.length ? tags.map((x) => `<a class="list-row" href="#/tag/${encodeURIComponent(x.tag)}" data-hist-t="${esc(x.tag)}"><span class="tag-ico">#</span><div class="grow">#${esc(x.tag)}<small>${x.n ? x.n + ' gönderi (bu hafta)' : 'Etiketi aç'}</small></div></a>`).join('') : '<div class="empty">Etiket bulunamadı.</div>';
        return;
      }
      const q = raw.replace(/^@/, '');
      const users = await A.searchUsers(q);
      res.innerHTML = users.length ? users.map((u) => userRow(u)).join('') : '<div class="empty">Kimse bulunamadı.</div>';
      hydrate(res);
    }, 250);
  };
  await showHome();
}

/* ---------- Hashtag sayfası ---------- */
async function vTag(tag, _b, tok) {
  tag = (tag || '').toLocaleLowerCase('tr-TR');
  app.innerHTML = `${topbar('#' + esc(tag), true)}<div id="tg"><div class="empty"><div class="spin" style="margin:auto"></div></div></div>`;
  const posts = await prep(await S.tagPosts(tag));
  if (stale(tok)) return;
  S.addHistory({ type: 'tag', key: tag });
  const ranked = posts.slice().sort((a, b) => b.likeCount + b.commentCount * 2 - (a.likeCount + a.commentCount * 2));
  $('#tg').innerHTML = `<div class="tag-head"><div class="tag-big">#</div><div><b>#${esc(tag)}</b><div class="muted small">${posts.length} gönderi</div></div></div>
    ${posts.length ? `<div class="section-t">En popüler</div><div class="grid3">${ranked.map((p) => `<a class="cell" href="#/p/${p.id}">${mediaTag(p.media, p.kind)}${p.kind === 'video' ? `<span class="badge">${I.play}</span>` : ''}</a>`).join('')}</div>` : `<div class="empty"><h3>Henüz gönderi yok</h3><p>Açıklamana #${esc(tag)} yazarak ilk gönderiyi sen paylaş.</p></div>`}`;
  hydrate($('#tg'));
}

/* ---------- Kaydedilenler ---------- */
async function vSaved(_a, _b, tok) {
  app.innerHTML = `${topbar('Kaydedilenler', true)}<div id="sv"><div class="empty"><div class="spin" style="margin:auto"></div></div></div>`;
  const posts = await S.savedPosts();
  if (stale(tok)) return;
  $('#sv').innerHTML = posts.length
    ? `<p class="small muted" style="padding:8px 14px">Sadece sen görebilirsin.</p><div class="grid3">${posts.map((p) => `<a class="cell" href="#/p/${p.id}">${mediaTag(p.media, p.kind)}${p.kind === 'video' ? `<span class="badge">${I.play}</span>` : ''}</a>`).join('')}</div>`
    : `<div class="empty"><div class="ico">${I.bookmark}</div><h3>Kaydedilen yok</h3><p>Gönderilerin altındaki kaydet simgesine dokunarak sonra bakmak için sakla.</p></div>`;
  hydrate($('#sv'));
}

/* ---------- Gönderi istatistikleri ---------- */
async function vInsights(id, _b, tok) {
  app.innerHTML = `${topbar('İstatistikler', true)}<div id="ins"><div class="empty"><div class="spin" style="margin:auto"></div></div></div>`;
  try {
    const [p, r] = await Promise.all([A.getPost(id), S.insights(id)]);
    if (stale(tok)) return;
    const eng = r.likes + r.comments + r.reposts + r.saves;
    const rate = r.views ? Math.round((eng / r.views) * 1000) / 10 : 0;
    const c = (n, t, sub = '') => `<div class="card"><b>${num(n)}</b><span>${t}</span>${sub ? `<small class="muted">${sub}</small>` : ''}</div>`;
    $('#ins').innerHTML = `<div class="ins-head">${p ? `<span class="ins-thumb">${mediaTag(p.media, p.kind)}</span>` : ''}<div><b>Gönderi istatistikleri</b><div class="muted small">${p ? ago(p.created_at, true) : ''}</div></div></div>
      <div class="cards">${c(r.views, 'Erişilen hesap', `${r.follower_views} takipçi · ${Math.max(0, r.views - r.follower_views)} takipçi olmayan`)}${c(eng, 'Etkileşim', `Etkileşim oranı %${rate}`)}
      ${c(r.likes, 'Beğeni')}${c(r.comments, 'Yorum')}${c(r.reposts, 'Repost')}${c(r.saves, 'Kaydetme')}</div>
      <div class="ins-bar"><span style="width:${r.views ? Math.round((r.follower_views / r.views) * 100) : 0}%"></span></div>
      <p class="small muted" style="padding:0 14px">Mavi: takipçilerin · Gri: takip etmeyenler (keşif ve "Senin için" akışından gelenler)</p>`;
    hydrate($('#ins'));
  } catch (er) {
    $('#ins').innerHTML = `<div class="empty">${esc(er.message)}</div>`;
  }
}

/* ---------- Yakın arkadaşlar ---------- */
async function vCloseFriends(_a, _b, tok) {
  const [fol, close] = await Promise.all([A.following(), S.closeFriends().catch(() => [])]);
  const pm = await A.profiles(fol);
  if (stale(tok)) return;
  const set = new Set(close.map((u) => u.id));
  const list = [...pm.values()];
  app.innerHTML = `${topbar('Yakın arkadaşlar', true)}<p class="small muted" style="padding:10px 14px">Hikâye paylaşırken "Yakın arkadaşlar"ı seçersen sadece bu listedekiler görür. Listede olduğunu kimseye bildirmeyiz.</p>
    <div id="cf">${list.length ? list.map((u) => `<label class="list-row toggle-row">${avatar(u, 44)}<div class="grow">${uname(u)}<small>${esc(u.name)}</small></div><input type="checkbox" class="sw" data-u="${u.id}" ${set.has(u.id) ? 'checked' : ''}></label>`).join('') : '<div class="empty">Önce birkaç kişiyi takip et.</div>'}</div>`;
  $('#cf').onchange = async (e) => {
    const c = e.target.closest('[data-u]');
    if (!c) return;
    try {
      await S.setCloseFriend(c.dataset.u, c.checked);
    } catch (er) {
      c.checked = !c.checked;
      toast(er.message, true);
    }
  };
}

/* ---------- Görünüm (tema) ---------- */
function vAppearance() {
  const cur = S.theme();
  app.innerHTML = `${topbar('Görünüm', true)}<div class="create"><div class="seg" id="th"><button data-t="dark">Koyu</button><button data-t="light">Açık</button><button data-t="system">Sistemle aynı</button></div>
    <p class="small muted">Sistemle aynı: telefonun koyu/açık tema ayarını izler.</p></div>`;
  const mark = (t) => $$('#th button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  mark(cur);
  $('#th').onclick = (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    S.setTheme(b.dataset.t);
    mark(b.dataset.t);
  };
}

/* ---------- Kişi seçici (etiketleme, grup) ---------- */
function pickUsers(title, preselected = [], { max = 20, source = 'following' } = {}) {
  return new Promise(async (resolve) => {
    const picked = new Map(preselected.map((u) => [u.id, u]));
    const ids = source === 'following' ? await A.following() : [];
    const base = [...(await A.profiles(ids)).values()];
    sheet(
      `<h3>${esc(title)}</h3><div class="inner form"><div class="search" style="margin:0">${I.search}<input id="puQ" placeholder="Ara"></div></div><div id="puL" class="pu-list"></div><div class="inner"><button class="btn block" id="puOk">Tamam</button></div>`,
      (c, close) => {
        const draw = (list) => {
          $('#puL', c).innerHTML = list.length
            ? list.map((u) => `<label class="list-row toggle-row">${avatar(u, 40)}<div class="grow">${uname(u)}<small>${esc(u.name)}</small></div><input type="checkbox" class="pu-ck" data-u="${u.id}" ${picked.has(u.id) ? 'checked' : ''}></label>`).join('')
            : '<p class="inner muted">Kimse yok.</p>';
          hydrate($('#puL', c));
        };
        let all = base;
        draw(all);
        let t = null;
        $('#puQ', c).oninput = (e) => {
          clearTimeout(t);
          t = setTimeout(async () => {
            const q = e.target.value.trim();
            all = q ? (await A.searchUsers(q)).filter((u) => u.id !== A.me()) : base;
            draw(all);
          }, 250);
        };
        $('#puL', c).onchange = (e) => {
          const k = e.target.closest('[data-u]');
          if (!k) return;
          const u = all.find((x) => x.id === k.dataset.u) || picked.get(k.dataset.u);
          if (k.checked) {
            if (picked.size >= max) return (k.checked = false), toast(`En fazla ${max} kişi`, true);
            picked.set(u.id, u);
          } else picked.delete(u.id);
        };
        $('#puOk', c).onclick = () => {
          close();
          resolve([...picked.values()]);
        };
      }
    );
  });
}

/* =========================================================
   Paylaş: çoklu fotoğraf/video, düzenleyici, kişi etiketleme, yakın arkadaşlar
   ========================================================= */
async function vCreate(kind = 'post') {
  const shared = kind === 'share' ? window.__shareFiles || [] : [];
  if (kind === 'share') {
    window.__shareFiles = null;
    kind = shared.length === 1 && shared[0].type.startsWith('video/') ? 'reel' : 'post';
  }
  if (kind === 'poll') return vCreatePoll();
  if (kind === 'live') return vGoLive();
  let mode = kind === 'story' ? 'story' : kind === 'reel' ? 'reel' : 'post';
  let slides = []; // { file, ed }
  let cur = 0;
  let tagged = [];
  let audience = 'all';
  app.innerHTML = `${topbar('Yeni paylaşım', true, '<button class="btn sm" id="share" disabled>Paylaş</button>')}<div class="create">
    <div class="seg" id="seg"><button data-m="post">Gönderi</button><button data-m="story">Hikâye</button><button data-m="reel">Reels</button><button data-m="poll">Anket</button><button data-m="live">Canlı</button></div>
    <button class="pick" id="pick">${I.image}<span id="pickTxt"></span></button>
    <div class="thumbs hidden" id="thumbs"></div>
    <button class="btn block gray hidden" id="reedit">${ic('pen')} Düzenle (yazı, çıkartma, çizim, filtre${mode === 'story' ? ', anket' : ''})</button>
    <textarea class="field" id="cap" placeholder="Açıklama yaz... (@kullanıcı, #etiket)" maxlength="2200"></textarea>
    <input class="field" id="loc" placeholder="Konum ekle (isteğe bağlı)" maxlength="60">
    <button class="btn block gray" id="tagBtn">${ic('user')} Kişileri etiketle</button>
    <div class="seg hidden" id="aud"><button data-a="all" class="on">Herkes</button><button data-a="close">Yakın arkadaşlar</button></div>
    <p class="small muted" id="hint"></p></div>`;
  const seg = () => {
    $$('#seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    if ($('#pickTxt')) $('#pickTxt').textContent = mode === 'reel' ? 'Video seç (dikey video önerilir)' : mode === 'post' ? 'Fotoğraf ya da video seç (en fazla 10)' : 'Fotoğraf ya da video seç';
    for (const id of ['#cap', '#loc', '#tagBtn']) $(id).classList.toggle('hidden', mode === 'story');
    $('#aud').classList.toggle('hidden', mode !== 'story');
    $('#hint').textContent = mode === 'story' ? 'Hikâyeler 24 saat sonra kaybolur. Düzenleyicide anket ve soru çıkartması ekleyebilirsin.' : mode === 'reel' ? 'Reels sekmesinde tam ekran, kaydırmalı görünür.' : '';
    $('#reedit').innerHTML = `${ic('pen')} Düzenle (yazı, çıkartma, çizim, filtre${mode === 'story' ? ', anket' : ''})`;
  };
  const aspectCss = (a) => (a === '1:1' ? '1' : a === '16:9' ? '16 / 9' : a === '9:16' ? '9 / 16' : a === 'orig' ? 'auto' : '4 / 5');
  const showPreview = () => {
    const s = slides[cur];
    const pick = $('#pick');
    if (!s) {
      pick.innerHTML = `${I.image}<span id="pickTxt"></span>`;
      pick.style.aspectRatio = '';
      $('#reedit').classList.add('hidden');
      $('#thumbs').classList.add('hidden');
      $('#share').disabled = true;
      seg();
      return;
    }
    const url = s.ed ? s.ed.preview : URL.createObjectURL(s.file);
    const video = (s.ed ? s.ed.kind : s.file.type.startsWith('video/') ? 'video' : 'photo') === 'video';
    pick.style.aspectRatio = aspectCss(s.ed?.meta.aspect || (mode === 'post' ? '4:5' : '9:16'));
    pick.style.position = 'relative';
    pick.style.containerType = 'inline-size';
    pick.innerHTML = video
      ? `<video src="${url}" autoplay muted loop playsinline style="filter:${s.ed?.meta.filter || 'none'}"></video>${s.ed?.drawingBlob ? `<img class="ovl-draw" src="${URL.createObjectURL(s.ed.drawingBlob)}" style="position:absolute;inset:0;width:100%;height:100%">` : ''}${overlayHtml({ layers: s.ed?.meta.layers || [] })}`
      : `<img src="${url}">`;
    $('#reedit').classList.remove('hidden');
    $('#share').disabled = false;
    const th = $('#thumbs');
    th.classList.toggle('hidden', mode !== 'post');
    th.innerHTML =
      slides.map((x, i) => `<button class="thumb ${i === cur ? 'on' : ''}" data-i="${i}">${x.file.type.startsWith('video/') ? `<video src="${URL.createObjectURL(x.file)}" muted></video>` : `<img src="${x.ed ? x.ed.preview : URL.createObjectURL(x.file)}">`}<span class="tx" data-del="${i}">${I.close}</span></button>`).join('') +
      (slides.length < 10 ? `<button class="thumb add" id="addMore">${I.plus}</button>` : '');
  };
  const edit = async (i = cur) => {
    const s = slides[i];
    const r = await openEditor(s.file, mode, s.ed?.state || null);
    if (r) s.ed = r;
    showPreview();
  };
  const addFiles = async (multi) => {
    const fs = await pickFiles(mode === 'reel' ? 'video/*' : 'image/*,video/*', multi);
    if (!fs.length) return;
    if (mode === 'reel' && !fs[0].type.startsWith('video/')) return toast('Reels için video seç', true);
    const start = slides.length;
    for (const f of fs.slice(0, 10 - slides.length)) slides.push({ file: f, ed: null });
    cur = start;
    showPreview();
    await edit(start);
  };
  seg();
  if (shared.length) {
    for (const f of shared.slice(0, mode === 'post' ? 10 : 1)) slides.push({ file: f, ed: null });
    if (window.__shareText) $('#cap').value = window.__shareText.slice(0, 2200);
    window.__shareText = '';
    cur = 0;
    showPreview();
    setTimeout(() => edit(0), 50);
  }
  $('#seg').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.m === mode) return;
    if (b.dataset.m === 'poll' || b.dataset.m === 'live') return (location.hash = '#/create/' + b.dataset.m);
    mode = b.dataset.m;
    slides = mode === 'post' ? slides : slides.slice(0, 1);
    if (mode === 'reel' && slides[0] && !slides[0].file.type.startsWith('video/')) slides = [];
    cur = 0;
    seg();
    showPreview();
    // oran değişti: düzenlenmiş medyayı yeni oranla tekrar düzenle
    if (slides[0]?.ed) {
      slides[0].ed.state.aspect = mode === 'post' ? '4:5' : '9:16';
      edit(0);
    }
  };
  $('#pick').onclick = () => (slides.length ? edit() : addFiles(mode === 'post'));
  $('#thumbs').onclick = (e) => {
    const d = e.target.closest('[data-del]');
    if (d) {
      e.stopPropagation();
      slides.splice(+d.dataset.del, 1);
      cur = Math.min(cur, slides.length - 1);
      return showPreview();
    }
    if (e.target.closest('#addMore')) return addFiles(true);
    const t = e.target.closest('[data-i]');
    if (t) {
      cur = +t.dataset.i;
      showPreview();
    }
  };
  $('#reedit').onclick = () => edit();
  $('#tagBtn').onclick = async () => {
    tagged = await pickUsers('Kişileri etiketle', tagged, { max: 20 });
    $('#tagBtn').innerHTML = `${ic('user')} ${tagged.length ? tagged.map((u) => '@' + esc(u.username)).join(', ') : 'Kişileri etiketle'}`;
  };
  $('#aud').onclick = (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    audience = b.dataset.a;
    $$('#aud button').forEach((x) => x.classList.toggle('on', x === b));
  };
  $('#share').onclick = async () => {
    if (!slides.length) return;
    const btn = $('#share');
    btn.disabled = true;
    btn.textContent = 'Yükleniyor...';
    try {
      const out = slides.map((s) => s.ed || { blob: s.file, kind: s.file.type.startsWith('video/') ? 'video' : 'photo', meta: { aspect: mode === 'post' ? '4:5' : '9:16' } });
      const first = out[0];
      const meta = { ...first.meta };
      if (first.kind === 'photo') delete meta.layers;
      if (mode === 'story') {
        if (audience === 'close') meta.audience = 'close';
        await A.addStory(first.blob, meta, first.drawingBlob);
        toast(audience === 'close' ? 'Yakın arkadaşlarınla paylaşıldı' : 'Hikâyen paylaşıldı');
        location.hash = '#/home';
        return;
      }
      const loc = $('#loc').value.trim();
      if (loc) meta.location = loc;
      if (tagged.length) meta.tagged = tagged.length;
      if (out.length > 1) {
        meta.items = [];
        for (let i = 1; i < out.length; i++) {
          btn.textContent = `Yükleniyor ${i + 1}/${out.length}`;
          const o = out[i];
          const up = await A.uploadFile(o.blob);
          const it = { url: up.url, kind: up.kind === 'video' ? 'video' : 'photo' };
          if (it.kind === 'video') {
            if (o.meta.filter && o.meta.filter !== 'none') it.filter = o.meta.filter;
            if (o.meta.layers?.length) it.layers = o.meta.layers;
            if (o.meta.vig) it.vig = o.meta.vig;
            if (o.meta.muted) it.muted = true;
          }
          if (o.drawingBlob) it.drawing = await A.db.upload(o.drawingBlob, 'photo');
          meta.items.push(it);
        }
      }
      const caption = $('#cap').value.trim();
      const post = await A.createPost({ file: first.blob, caption, meta, drawingBlob: first.drawingBlob });
      if (tagged.length) await S.saveTags(post, tagged);
      if (caption) S.notifyMentions(post, caption);
      toast('Paylaşıldı');
      location.hash = mode === 'reel' ? '#/reels' : '#/home';
    } catch (er) {
      toast(er.message, true);
      btn.disabled = false;
      btn.textContent = 'Paylaş';
    }
  };
}

/* =========================================================
   Reels (dikey kaydırma)
   ========================================================= */
async function vReels(startId, _b, tok) {
  app.innerHTML = `<div class="reels-top"><span>Reels</span><a class="ibtn" href="#/create/reel">${I.camera}</a></div><div class="reels" id="reels"><div class="empty" style="padding-top:40vh"><div class="spin" style="margin:auto"></div></div></div>`;
  let list = await prep(await A.reels());
  if (stale(tok)) return;
  const box = $('#reels');
  if (!list.length) {
    box.innerHTML = `<div class="empty" style="padding-top:30vh"><div class="ico">${I.reels}</div><h3>Henüz reels yok</h3><p>İlk dikey videoyu sen paylaş!</p><a class="btn" href="#/create/reel">Reels çek / yükle</a></div>`;
    return;
  }
  if (startId) {
    const i = list.findIndex((p) => p.id === startId);
    if (i > 0) list = [...list.slice(i), ...list.slice(0, i)];
  }
  const fol = new Set(await A.following());
  box.innerHTML = list
    .map(
      (p) => `<section class="reel" data-k="${p.id}" ${vigStyle(p.meta)}><video data-src="${esc(p.media)}" data-reel playsinline loop preload="none" ${vidAttrs(p.meta)} ${p.meta?.muted ? 'data-mute' : ''}></video>${overlayHtml(p.meta)}<div class="shade"></div><div class="paused hidden">${I.play}</div>
    <div class="side"><button class="act ${p.liked ? 'on-like' : ''}" data-a="like">${I.heart}<span>${num(p.likeCount)}</span></button>
      <a class="act" href="#/p/${p.id}">${I.comment}<span>${num(p.commentCount)}</span></a>
      <button class="act ${p.reposted ? 'on-rp' : ''}" data-a="repost">${I.repost}<span>${num(p.repostCount)}</span></button>
      <button class="act" data-a="share">${I.send}</button><button class="act ${p.saved ? 'on-save' : ''}" data-a="save">${I.bookmark}</button><button class="act" data-a="more">${I.dots}</button></div>
    <div class="info"><div class="who"><a href="#/u/${esc(p.author.username)}">${avatar(p.author, 32)}</a><a href="#/u/${esc(p.author.username)}">${uname(p.author)}</a>
      ${p.user_id !== A.me() && !fol.has(p.user_id) ? `<button class="fbtn" data-a="follow">Takip et</button>` : ''}</div>
      ${p.caption ? `<div>${linkify(p.caption)}</div>` : ''}</div></section>`
    )
    .join('');
  hydrate(box);
  const vids = $$('video[data-reel]', box);
  vids.forEach((v) => {
    v.muted = v.hasAttribute('data-mute');
    v.loop = true;
  });
  // sadece ekrandaki ve sıradaki 1-2 video yüklenir; uzaktakiler bellekten atılır
  const load = (i, how) => {
    const v = vids[i];
    if (!v) return;
    if (!v.getAttribute('src')) {
      v.preload = how;
      v.src = v.dataset.src;
    } else if (how === 'auto' && v.preload !== 'auto') v.preload = 'auto';
  };
  const unload = (i) => {
    const v = vids[i];
    if (!v || !v.getAttribute('src')) return;
    v.pause();
    v.removeAttribute('src');
    v.load();
  };
  const io = new IntersectionObserver(
    (ents) => {
      for (const e of ents) {
        const v = e.target;
        const i = vids.indexOf(v);
        if (e.isIntersecting && e.intersectionRatio > 0.7) {
          load(i, 'auto');
          load(i + 1, 'auto');
          load(i + 2, 'metadata');
          vids.forEach((_, k) => (k < i - 2 || k > i + 3) && unload(k));
          v.currentTime = 0;
          v.play().catch(() => {
            v.muted = true;
            v.play().catch(() => {});
          });
        } else v.pause();
      }
    },
    { root: box, threshold: [0, 0.7] }
  );
  load(0, 'auto');
  load(1, 'metadata');
  vids.forEach((v) => io.observe(v));
  bindPosts(box, list, () => route());
  box.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-a="follow"]');
    if (f) {
      const p = list.find((x) => x.id === f.closest('[data-k]').dataset.k);
      await A.toggleFollow(p.user_id);
      f.remove();
      toast(`@${p.author.username} takip ediliyor`);
      return;
    }
    if (e.target.closest('.act, a, button')) return;
    const r = e.target.closest('.reel');
    if (!r) return;
    const v = $('video', r);
    if (v.paused) {
      v.play();
      $('.paused', r).classList.add('hidden');
    } else {
      v.pause();
      $('.paused', r).classList.remove('hidden');
    }
  });
}

/* =========================================================
   Profil
   ========================================================= */
async function vProfile(username, tab = 'posts', tok) {
  const u = await A.byUsername(username);
  if (stale(tok)) return;
  if (!u) return renderMsg('Kullanıcı bulunamadı', 'Bu hesap yok ya da silinmiş.', true);
  const mine = u.id === A.me();
  const admin = A.isAdminP(meP);
  const [st, fstate, ring, v, hls] = await Promise.all([A.stats(u.id), A.followState(u.id), A.storyRing(u.id), A.viewer(), S.highlights(u.id)]);
  if (stale(tok)) return;
  const iBlocked = v.blocked.has(u.id);
  const locked = !mine && !admin && (iBlocked || v.blockedMe.has(u.id) || (u.private && fstate !== 'following'));
  const bs = A.banState(u);
  const fLabel = { following: 'Takip ediliyor', requested: 'İstek gönderildi', none: 'Takip et', self: '' };
  const g = ring ? { allSeen: ring === 'seen' } : null;
  const right = mine
    ? `<a class="ibtn" href="#/create">${I.plus}</a><a class="ibtn" href="#/settings">${I.menu}</a>`
    : `<button class="ibtn" id="umore">${I.dots}</button>`;
  app.innerHTML = `${topbar(`${esc(u.username)}${u.verified ? TICK : ''}`, !mine, right)}<div class="prof">
    <div class="prof-top"><a ${g ? `href="#/story/${u.id}"` : ''}>${avatar(u, 86, g ? (g.allSeen ? 'seen' : 'new') : '')}</a>
      <div class="prof-stats"><div><b>${num(st.posts)}</b><span>gönderi</span></div><a href="#/follows/${u.id}/followers"><b id="fc">${num(st.followers)}</b><span>takipçi</span></a><a href="#/follows/${u.id}/following"><b>${num(st.following)}</b><span>takip</span></a></div></div>
    <div class="prof-name">${esc(u.name)} ${u.private ? `<span class="lock-chip">${ic('lock', 12)} Gizli</span>` : ''} ${u.role === 'owner' ? '<span class="role-chip">KURUCU</span>' : u.role === 'admin' ? '<span class="role-chip">YÖNETİCİ</span>' : ''} ${admin && bs.banned ? '<span class="ban-chip">YASAKLI</span>' : ''} ${admin && bs.restricted ? '<span class="ban-chip">KISITLI</span>' : ''}</div>
    ${u.bio ? `<div class="prof-bio">${linkify(u.bio)}</div>` : ''}
    <div class="prof-btns">${
      mine
        ? `<a class="btn gray" href="#/edit">Profili düzenle</a><button class="btn gray" id="pShare">Profili paylaş</button>`
        : iBlocked
          ? `<button class="btn gray" id="unb">Engeli kaldır</button>`
          : `<button class="btn ${fstate === 'none' ? '' : 'gray'}" id="fol">${fLabel[fstate]}</button><button class="btn gray" id="msg">Mesaj</button><button class="btn gray icon-btn" id="pCall" title="Sesli ara">${Calls.CI.phone}</button><button class="btn gray icon-btn" id="pVid" title="Görüntülü ara">${Calls.CI.video}</button>`
    }</div>
    ${mine && admin ? `<div class="prof-btns"><a class="btn green" href="#/admin">${I.shield} Yönetim paneli</a></div>` : ''}
    ${!locked && (hls.length || mine) ? `<div class="hl-row">${mine ? `<button class="hl" id="hlNew"><span class="hl-c add">${I.plus}</span><span>Yeni</span></button>` : ''}${hls.map((h) => `<a class="hl" href="#/hl/${h.id}"><span class="hl-c">${h.cover ? mediaTag(h.cover, 'photo') : ic('star', 24)}</span><span>${esc(h.title)}</span></a>`).join('')}</div>` : ''}
  </div>
  <div class="tabs2"><button data-t="posts" class="${tab === 'posts' ? 'on' : ''}">${I.grid}</button><button data-t="reels" class="${tab === 'reels' ? 'on' : ''}">${I.reels}</button><button data-t="reposts" class="${tab === 'reposts' ? 'on' : ''}">${I.repost}</button><button data-t="tagged" class="${tab === 'tagged' ? 'on' : ''}">${I.tag}</button>${mine ? `<button data-t="saved" class="${tab === 'saved' ? 'on' : ''}">${I.bookmark}</button>` : ''}</div>
  <div id="pgrid"></div>`;
  $$('.tabs2 button').forEach((b) => (b.onclick = () => (location.hash = `#/u/${encodeURIComponent(u.username)}/${b.dataset.t}`)));
  if ($('#pShare')) $('#pShare').onclick = () => shareLink(profileUrl(u.username), `Kanka'da @${u.username}`);
  if ($('#pCall')) $('#pCall').onclick = () => Calls.startCall(u.id, 'audio');
  if ($('#pVid')) $('#pVid').onclick = () => Calls.startCall(u.id, 'video');
  if ($('#hlNew')) $('#hlNew').onclick = newHighlightFlow;
  if (!mine) {
    if ($('#unb'))
      $('#unb').onclick = async () => {
        await A.unblockUser(u.id);
        toast('Engel kaldırıldı');
        route();
      };
    if ($('#fol'))
      $('#fol').onclick = async (e) => {
        const btn = e.currentTarget;
        const cur = await A.followState(u.id);
        const apply = (st) => {
          btn.textContent = fLabel[st];
          btn.classList.toggle('gray', st !== 'none');
        };
        try {
          if (cur === 'following') {
            if (u.private) return confirmSheet(`@${u.username} takipten çıkılsın mı? Hesap gizli olduğu için gönderilerini tekrar görmek için istek göndermen gerekir.`, async () => (await A.unfollow(u.id), route()), 'Takipten çık');
            apply(await A.unfollow(u.id));
          } else if (cur === 'requested') apply(await A.cancelRequest(u.id));
          else {
            const st = await A.follow(u.id);
            apply(st);
            if (st === 'requested') toast('Takip isteği gönderildi');
            else if (u.private) route();
          }
          const s2 = await A.stats(u.id);
          $('#fc').textContent = num(s2.followers);
        } catch (er) {
          toast(er.message, true);
        }
      };
    if ($('#msg'))
      $('#msg').onclick = async () => {
        try {
          const c = await A.conversationWith(u.id);
          location.hash = '#/dm/' + c.id;
        } catch (er) {
          toast(er.message, true);
        }
      };
    $('#umore').onclick = () => {
      const opts = [];
      opts.push({ icon: I.link, label: 'Profil bağlantısını paylaş', run: () => shareLink(profileUrl(u.username), `Kanka'da @${u.username}`) });
      opts.push({ icon: I.flag, label: 'Hesabı şikâyet et', red: true, run: () => reportFlow('user', u.id) });
      opts.push(
        iBlocked
          ? { icon: I.ban, label: 'Engeli kaldır', run: async () => (await A.unblockUser(u.id), toast('Engel kaldırıldı'), route()) }
          : {
              icon: I.ban,
              label: 'Engelle',
              red: true,
              run: () =>
                confirmSheet(`@${u.username} engellensin mi? Seni bulamaz, gönderilerini göremez ve sana yazamaz. Takip bağlantılarınız kaldırılır.`, async () => {
                  try {
                    await A.blockUser(u.id);
                    toast('Engellendi');
                    route();
                  } catch (er) {
                    toast(er.message, true);
                  }
                }, 'Engelle'),
            }
      );
      if (admin) {
        const prot = A.isAdminP(u);
        opts.unshift(
          { icon: I.shield, label: u.verified ? 'Mavi tiki kaldır' : 'Mavi tik ver', run: async () => (await A.adminSet(u.id, { verified: !u.verified }).catch((er) => toast(er.message, true)), route()) },
          prot ? { icon: I.shield, label: 'Yönetici koruması: kısıtlanamaz', run: () => toast('Yöneticiler kısıtlanamaz veya yasaklanamaz', true) } : { icon: I.ban, label: 'Kısıtla / yasakla', red: true, run: () => (location.hash = '#/admin/users/' + u.id) },
          { icon: I.gear, label: 'Yönetim panelinde aç', run: () => (location.hash = '#/admin/users/' + u.id) }
        );
      }
      sheet(opts);
    };
  }
  if (locked) {
    $('#pgrid').innerHTML = iBlocked
      ? `<div class="empty"><div class="ico">${I.ban}</div><h3>Bu hesabı engelledin</h3><p>Gönderilerini görmek için engeli kaldır.</p></div>`
      : `<div class="empty"><div class="ico">${ic('lock', 36)}</div><h3>Bu hesap gizli</h3><p>Gönderilerini, reels ve hikâyelerini görmek için takip et.</p></div>`;
    return;
  }
  const posts =
    tab === 'reposts' ? await A.userReposts(u.id) : tab === 'tagged' ? await S.taggedPosts(u.id) : tab === 'saved' && mine ? await S.savedPosts() : (await A.userPostsLite(u.id)).filter((p) => tab !== 'reels' || p.kind === 'video');
  if (stale(tok)) return;
  $('#pgrid').innerHTML = posts.length
    ? `${tab === 'saved' ? '<p class="small muted" style="padding:8px 14px">Kaydettiklerini sadece sen görebilirsin.</p>' : ''}<div class="grid3">${posts.map((p) => `<a class="cell ${tab === 'reels' ? 'tall' : ''}" href="${tab === 'reels' ? '#/reels/' + p.id : '#/p/' + p.id}">${mediaTag(p.media, p.kind)}${p.kind === 'video' && tab !== 'reels' ? `<span class="badge">${I.play}</span>` : p.meta?.items?.length ? `<span class="badge">${I.grid}</span>` : ''}</a>`).join('')}</div>`
    : `<div class="empty"><div class="ico">${{ reposts: I.repost, tagged: I.tag, saved: I.bookmark }[tab] || I.camera}</div><h3>${{ reposts: 'Repost yok', reels: 'Reels yok', tagged: 'Etiketlendiği gönderi yok', saved: 'Kaydedilen yok' }[tab] || 'Henüz gönderi yok'}</h3></div>`;
}

/** Vitrin: arşivdeki hikâyelerden seç, ad ver. */
async function newHighlightFlow() {
  const all = await S.myAllStories();
  if (!all.length) return toast('Önce bir hikâye paylaş', true);
  const picked = new Set();
  sheet(
    `<h3>Vitrine hikâye seç</h3><div class="hl-pick">${all.map((s) => `<button class="cell" data-s="${s.id}">${mediaTag(s.media, s.kind)}<span class="ck">${I.check}</span><small>${new Date(s.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</small></button>`).join('')}</div><div class="inner"><button class="btn block" id="hlNext" disabled>İleri</button></div>`,
    (c, close) => {
      hydrate(c);
      $('.hl-pick', c).onclick = (e) => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        picked.has(b.dataset.s) ? picked.delete(b.dataset.s) : picked.add(b.dataset.s);
        b.classList.toggle('on', picked.has(b.dataset.s));
        $('#hlNext', c).disabled = !picked.size;
      };
      $('#hlNext', c).onclick = () => {
        close();
        promptSheet('Vitrin adı', 'Örn. Yaz 2026', async (t) => {
          if (!t) return;
          try {
            await S.createHighlight(t, all.filter((s) => picked.has(s.id)));
            toast('Vitrin oluşturuldu');
            route();
          } catch (er) {
            toast(er.message, true);
          }
        });
      };
    }
  );
}

async function vFollows(uid, which = 'followers', tok) {
  const ids = which === 'followers' ? await A.followers(uid) : await A.following(uid);
  const pm = await A.profiles(ids);
  if (stale(tok)) return;
  const list = [...pm.values()];
  app.innerHTML = `${topbar(which === 'followers' ? 'Takipçiler' : 'Takip edilenler', true)}${list.length ? list.map((u) => `<a class="list-row" href="#/u/${esc(u.username)}">${avatar(u, 44)}<div class="grow">${uname(u)}<small>${esc(u.name)}</small></div></a>`).join('') : '<div class="empty">Liste boş.</div>'}`;
}

/* =========================================================
   Gönderi detayı + yorumlar (foto & GIF)
   ========================================================= */
async function vPost(id, _b, tok) {
  const p = await A.getPost(id);
  if (stale(tok)) return;
  if (!p) return renderMsg('Gönderi bulunamadı', 'Silinmiş olabilir.', true);
  await prep([p]);
  S.recordView(p.id, p.user_id);
  const list = [p];
  app.innerHTML = `${topbar('Gönderi', true)}<div class="pad-composer"><div id="pwrap">${postHtml(p)}</div><div id="cmts"></div></div>
    <div class="composer" id="comp"><div class="preview hidden" id="prev"></div><div class="row">${avatar(meP, 32)}<button class="ibtn" id="cImg">${I.image}</button><button class="ibtn" id="cGif">${I.gif}</button><input type="text" id="cTxt" placeholder="Yorum ekle..." maxlength="500"><button class="send" id="cSend" disabled>Paylaş</button></div></div>`;
  bindPosts($('#pwrap'), list, () => history.back());
  autoplay($('#pwrap'));
  const att = attachments($('#comp'), () => updateSend());
  const updateSend = () => ($('#cSend').disabled = !$('#cTxt').value.trim() && !att.get());
  $('#cTxt').oninput = updateSend;
  const load = async () => {
    const cs = await A.comments(p.id);
    const box = $('#cmts');
    if (!box) return;
    box.innerHTML = cs.length
      ? cs
          .map(
            (c) => `<div class="cmt" data-c="${c.id}"><a href="#/u/${esc(c.author.username)}">${avatar(c.author, 34)}</a><div class="body"><a href="#/u/${esc(c.author.username)}">${uname(c.author)}</a> <span class="muted small">${ago(c.created_at)}</span>
        ${c.text ? `<p>${linkify(c.text)}</p>` : ''}${c.media ? `<div class="att">${mediaTag(c.media, 'photo')}</div>` : ''}
        <div class="meta"><button data-r="${c.author.username}">Yanıtla</button>${c.user_id === A.me() || A.isAdminP(meP) || p.user_id === A.me() ? `<button data-d="${c.id}">Sil</button>` : `<button data-rep="${c.id}">Şikâyet et</button>`}</div></div></div>`
          )
          .join('')
      : '<div class="empty" style="padding:30px">Henüz yorum yok. İlk yorumu sen yap!</div>';
    hydrate(box);
  };
  $('#cmts').onclick = async (e) => {
    const d = e.target.closest('[data-d]');
    const r = e.target.closest('[data-r]');
    const rep = e.target.closest('[data-rep]');
    if (d) confirmSheet('Yorum silinsin mi?', async () => (await A.deleteComment(d.dataset.d), load()), 'Sil');
    if (r) {
      $('#cTxt').value = `@${r.dataset.r} `;
      $('#cTxt').focus();
      updateSend();
    }
    if (rep) reportFlow('comment', rep.dataset.rep);
  };
  $('#cSend').onclick = async () => {
    const text = $('#cTxt').value.trim();
    const a = att.get();
    $('#cSend').disabled = true;
    try {
      await A.addComment(p, { text, file: a?.file, gifUrl: a?.gifUrl });
      $('#cTxt').value = '';
      att.clear();
      await load();
      window.scrollTo(0, document.body.scrollHeight);
    } catch (er) {
      toast(er.message, true);
    }
    updateSend();
  };
  await load();
}

/** Yorum / mesaj için foto ve GIF eki. */
function attachments(comp, changed) {
  let cur = null;
  const prev = $('#prev', comp);
  const show = (src, video) => {
    prev.innerHTML = `${video ? `<video src="${src}" muted autoplay loop playsinline></video>` : `<img src="${esc(src)}">`}<button class="ibtn" id="pX">${I.close}</button>`;
    prev.classList.remove('hidden');
    $('#pX', prev).onclick = () => api.clear();
  };
  const api = {
    get: () => cur,
    clear() {
      cur = null;
      prev.classList.add('hidden');
      prev.innerHTML = '';
      changed();
    },
  };
  $('[id$="Img"]', comp).onclick = async () => {
    const f = await pickFile(comp.id === 'mcomp' ? 'image/*,video/*' : 'image/*');
    if (!f) return;
    cur = { file: f };
    show(URL.createObjectURL(f), f.type.startsWith('video/'));
    changed();
  };
  $('[id$="Gif"]', comp).onclick = () =>
    gifPicker((g) => {
      cur = g;
      show(g.file ? URL.createObjectURL(g.file) : g.gifUrl);
      changed();
    });
  return api;
}

/** GIF seçici: cihazdan GIF, bağlantı yapıştır ya da (anahtar varsa) GIPHY'de ara. */
function gifPicker(done) {
  sheet(
    `<h3>GIF ekle</h3><div class="inner form">
      <button class="btn block gray" id="gDev">${ic('folder')} Cihazdan GIF seç</button>
      <input class="field" id="gUrl" placeholder="ya da GIF bağlantısı yapıştır (https://...gif)">
      <button class="btn block" id="gOk">Bağlantıyı ekle</button>
      ${window.KANKA_GIPHY_KEY ? '<input class="field" id="gQ" placeholder="GIPHY\'de ara..."><div class="gif-grid" id="gRes"></div>' : '<p class="small muted">İpucu: GIPHY ya da Tenor\'da bir GIF\'e uzun basıp "Bağlantıyı kopyala" de, buraya yapıştır.</p>'}
    </div>`,
    (c, close) => {
      $('#gDev', c).onclick = async () => {
        const f = await pickFile('image/gif');
        if (!f) return;
        close();
        done({ file: f });
      };
      $('#gOk', c).onclick = () => {
        const u = $('#gUrl', c).value.trim();
        if (!/^https:\/\/\S+$/.test(u)) return toast('Geçerli bir https bağlantısı yapıştır', true);
        close();
        done({ gifUrl: u });
      };
      const q = $('#gQ', c);
      if (q) {
        let t = null;
        q.oninput = () => {
          clearTimeout(t);
          t = setTimeout(async () => {
            const r = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${window.KANKA_GIPHY_KEY}&q=${encodeURIComponent(q.value)}&limit=24&lang=tr`).then((x) => x.json()).catch(() => null);
            $('#gRes', c).innerHTML = (r?.data || []).map((g) => `<button data-g="${esc(g.images.fixed_height.url)}"><img src="${esc(g.images.fixed_height_small.url)}"></button>`).join('');
          }, 300);
        };
        $('#gRes', c).onclick = (e) => {
          const b = e.target.closest('[data-g]');
          if (!b) return;
          close();
          done({ gifUrl: b.dataset.g });
        };
      }
    }
  );
}

/* =========================================================
   Hikâye görüntüleyici (normal hikâyeler + vitrin)
   ========================================================= */
async function vStory(uid, _b, tok) {
  const groups = await A.storyGroups();
  if (stale(tok)) return;
  const gi = groups.findIndex((g) => g.user.id === uid);
  if (gi < 0) return (location.hash = '#/home');
  storyPlayer(groups, gi, tok, { start: Math.max(0, groups[gi].stories.findIndex((s) => !s.seen)) });
}
async function vHighlight(id, _b, tok) {
  const h = await A.db.get('highlights', id).catch(() => null);
  if (stale(tok)) return;
  if (!h) return renderMsg('Vitrin bulunamadı', 'Silinmiş olabilir.', true);
  const [user, stories] = await Promise.all([A.profile(h.user_id), S.highlightStories(h)]);
  if (stale(tok)) return;
  if (!stories.length) return renderMsg(h.title, 'Bu vitrinde hikâye kalmamış.', true);
  storyPlayer([{ user, stories: stories.map((s) => ({ ...s, seen: true })) }], 0, tok, { highlight: h });
}

function interactiveHtml(s, res) {
  const it = s.meta?.interactive;
  if (!it) return '';
  const pos = `left:${(it.x ?? 0.5) * 100}%;top:${(it.y ?? 0.62) * 100}%`;
  if (it.type === 'poll') {
    const tot = res ? res.a + res.b : 0;
    const pct = (n) => (tot ? Math.round((n / tot) * 100) : 0);
    const showRes = res && (res.mine || s.user_id === A.me());
    return `<div class="st-poll" style="${pos}"><div class="q">${esc(it.q)}</div>${['a', 'b']
      .map((k) => `<button class="opt ${res?.mine === k ? 'mine' : ''}" data-vote="${k}">${showRes ? `<i style="width:${pct(res[k])}%"></i>` : ''}<span>${esc(it[k])}</span>${showRes ? `<b>%${pct(res[k])}</b>` : ''}</button>`)
      .join('')}</div>`;
  }
  return `<div class="st-q" style="${pos}"><div class="q">${esc(it.q)}</div>${s.user_id === A.me() ? `<div class="hint">Cevaplar "Görenler" listesinde</div>` : `<button class="ans" data-ask>Cevabını yaz...</button>`}</div>`;
}

function storyPlayer(groups, gi, tok, { start = 0, highlight = null } = {}) {
  let si = start;
  let timer = null;
  let t0 = 0;
  let dur = 5000;
  let paused = false;
  const render = async () => {
    clearInterval(timer);
    const g = groups[gi];
    const s = g.stories[si];
    const mine = g.user.id === A.me();
    const close = s.meta?.audience === 'close';
    app.innerHTML = `<div class="story-view ${close ? 'close' : ''}"><div class="bars">${g.stories.map((_, i) => `<i><b style="width:${i < si ? 100 : 0}%"></b></i>`).join('')}</div>
      <div class="shead">${avatar(g.user, 32)}${uname(g.user)}${highlight ? `<span class="muted small">${esc(highlight.title)}</span>` : `<span class="muted small">${ago(s.created_at)}</span>`}${close ? `<span class="cf-badge">${ic('star', 12)} Yakın arkadaşlar</span>` : ''}<span style="flex:1"></span><button class="ibtn" id="sMore">${I.dots}</button><button class="ibtn" id="sX">${I.close}</button></div>
      <div class="stage">${s.kind === 'video' ? `<video data-m="${esc(s.media)}" autoplay playsinline ${s.meta?.muted ? 'muted' : ''} ${vidAttrs(s.meta)}></video>${overlayHtml(s.meta)}` : `<img data-m="${esc(s.media)}">`}<div id="sInt"></div></div>
      <div class="tapL"></div><div class="tapR"></div>
      <div class="sfoot">${
        mine
          ? `<button class="btn gray" id="sViews">${ic('eye')} Görenler</button>${highlight ? '' : `<button class="btn gray" id="sHl">${ic('star')} Vitrine ekle</button>`}`
          : `<div class="react-row" id="sReact">${Object.keys(REACT).map((k) => `<button data-r="${k}" title="${REACT_NAMES[k]}">${REACT[k]}</button>`).join('')}</div><div class="srep"><input id="sRep" placeholder="Yanıt gönder..."><button class="ibtn" id="sSend">${I.send}</button></div>`
      }</div></div>`;
    hydrate(app);
    if (!highlight) A.markStorySeen(s);
    const bar = $$('.bars b')[si];
    const v = $('video', app);
    dur = 5000;
    if (v) v.onloadedmetadata = () => (dur = Math.min(60000, (v.duration || 5) * 1000));
    t0 = performance.now();
    let el = 0;
    timer = setInterval(() => {
      if (stale(tok)) return clearInterval(timer);
      if (paused) return (t0 = performance.now() - el);
      el = performance.now() - t0;
      bar.style.width = Math.min(100, (el / dur) * 100) + '%';
      if (el >= dur) next();
    }, 50);
    const hold = (on) => {
      paused = on;
      if (v) on ? v.pause() : v.play().catch(() => {});
    };
    const sheetHold = () => {
      hold(true);
      $('.sheet-bg')?.addEventListener('click', () => hold(false), { once: true });
    };
    // anket / soru
    if (s.meta?.interactive) {
      const drawInt = async () => {
        const res = s.meta.interactive.type === 'poll' ? await S.pollResults(s) : null;
        if (g.stories[si] !== s || !$('#sInt')) return;
        $('#sInt').innerHTML = interactiveHtml(s, res);
      };
      drawInt();
      $('#sInt').onclick = async (e) => {
        e.stopPropagation();
        const vb = e.target.closest('[data-vote]');
        if (vb && !mine) {
          try {
            await S.vote(s, vb.dataset.vote);
          } catch (er) {
            return toast(er.message, true);
          }
          drawInt();
        }
        if (e.target.closest('[data-ask]')) {
          hold(true);
          promptSheet(s.meta.interactive.q, 'Cevabın...', async (t) => {
            hold(false);
            if (!t) return;
            try {
              await S.vote(s, t);
              toast('Cevabın gönderildi');
            } catch (er) {
              toast(er.message, true);
            }
          });
          $('.sheet-bg')?.addEventListener('click', () => hold(false), { once: true });
        }
      };
    }
    $('#sX').onclick = () => {
      clearInterval(timer);
      history.length > 1 ? history.back() : (location.hash = '#/home');
    };
    $('.tapL').onclick = prevS;
    $('.tapR').onclick = next;
    for (const z of [$('.tapL'), $('.tapR')]) {
      z.onpointerdown = () => hold(true);
      z.onpointerup = z.onpointerleave = () => hold(false);
    }
    $('#sMore').onclick = () => {
      const opts = [];
      if (highlight && mine) opts.push({ icon: I.trash, label: 'Vitrini sil', red: true, run: async () => (await S.deleteHighlight(highlight.id), toast('Vitrin silindi'), history.back()) });
      if (!highlight && (mine || A.isAdminP(meP))) opts.push({ icon: I.trash, label: 'Hikâyeyi sil', red: true, run: async () => (await A.deleteStory(s.id), toast('Silindi'), (location.hash = '#/home')) });
      if (!mine) opts.push({ icon: I.flag, label: 'Şikâyet et', red: true, run: () => reportFlow('story', s.id) });
      sheet(opts.length ? opts : [{ label: 'Kapat' }]);
      sheetHold();
    };
    if (mine) {
      $('#sViews').onclick = async () => {
        hold(true);
        const [vs, ans] = await Promise.all([A.storyViewers(s.id), s.meta?.interactive ? S.storyAnswers(s.id) : []]);
        const am = new Map(ans.map((a) => [a.user_id, a.choice]));
        const it = s.meta?.interactive;
        const label = (c) => (it?.type === 'poll' ? `Oy: ${esc(it[c] || c)}` : `"${esc(c)}"`);
        sheet(`<h3>Görenler (${vs.length})</h3>${vs.map((u) => `<a class="list-row" href="#/u/${esc(u.username)}">${avatar(u, 40)}<div class="grow">${uname(u)}${am.has(u.id) ? `<small>${label(am.get(u.id))}</small>` : ''}</div></a>`).join('') || '<p class="inner muted">Henüz kimse görmedi.</p>'}`);
        $('.sheet-bg')?.addEventListener('click', () => hold(false), { once: true });
      };
      if ($('#sHl'))
        $('#sHl').onclick = async () => {
          hold(true);
          const hs = await S.highlights(A.me());
          sheet(
            [
              {
                icon: I.plus,
                label: 'Yeni vitrin',
                run: () =>
                  promptSheet('Vitrin adı', 'Örn. Tatil', async (t) => {
                    if (!t) return;
                    try {
                      await S.createHighlight(t, [s]);
                      toast('Vitrine eklendi');
                    } catch (er) {
                      toast(er.message, true);
                    }
                  }),
              },
              ...hs.map((h) => ({
                icon: I.bookmark,
                label: h.title,
                run: async () => {
                  if (h.story_ids.includes(s.id)) return toast('Zaten bu vitrinde');
                  await A.db.update('highlights', h.id, { story_ids: [...h.story_ids, s.id] });
                  toast('Vitrine eklendi');
                },
              })),
            ]
          );
          $('.sheet-bg')?.addEventListener('click', () => hold(false), { once: true });
        };
    } else {
      const inp = $('#sRep');
      inp.onfocus = () => hold(true);
      inp.onblur = () => hold(false);
      const sendRep = async (text) => {
        if (!text) return;
        try {
          const c = await A.conversationWith(g.user.id);
          await A.sendMessage(c, { text });
          toast('Gönderildi');
          inp.value = '';
        } catch (er) {
          toast(er.message, true);
        }
      };
      $('#sSend').onclick = () => sendRep(inp.value.trim() && `Hikâyene yanıt: ${inp.value.trim()}`);
      inp.onkeydown = (e) => e.key === 'Enter' && sendRep(inp.value.trim() && `Hikâyene yanıt: ${inp.value.trim()}`);
      $('#sReact').onclick = (e) => {
        const b = e.target.closest('[data-r]');
        if (!b) return;
        b.classList.remove('pop');
        void b.offsetWidth;
        b.classList.add('pop');
        sendRep(`Hikâyene tepki verdi ::tepki:${b.dataset.r}::`);
      };
    }
  };
  const next = () => {
    const g = groups[gi];
    if (si < g.stories.length - 1) si++;
    else if (gi < groups.length - 1) {
      gi++;
      si = 0;
    } else {
      clearInterval(timer);
      return history.length > 1 ? history.back() : (location.hash = '#/home');
    }
    render();
  };
  const prevS = () => {
    if (si > 0) si--;
    else if (gi > 0) {
      gi--;
      si = 0;
    }
    render();
  };
  render();
}

/* =========================================================
   Mesajlar (DM + gruplar + kanallar + aramalar)
   ========================================================= */
function lastText(m) {
  if (!m) return '';
  if (m.once) return m.opened_at ? 'Tek seferlik fotoğraf (açıldı)' : 'Tek seferlik fotoğraf';
  if (m.media_kind === 'audio') return 'Sesli mesaj';
  if (m.text) return plainPreview(m.text);
  return m.media_kind === 'gif' ? 'GIF gönderdi' : 'Fotoğraf/video gönderdi';
}
function groupAvatar(c, size = 52) {
  return `<span class="gav ${c?.is_channel ? 'chan' : ''}" style="width:${size}px;height:${size}px">${ic(c?.is_channel ? 'megaphone' : 'users', Math.round(size * 0.5))}</span>`;
}
async function vInbox(tabArg, _b, tok) {
  app.innerHTML = `${topbar(esc(meP.username), true, `<button class="ibtn" id="newDm" title="Yeni">${I.plus}</button>`)}<div class="search">${I.search}<input id="q" placeholder="Ara"></div>
    <div class="feed-tabs" id="itabs"><button data-t="msg">Mesajlar</button><button data-t="chan">Kanallar</button><button data-t="calls">Aramalar</button></div><div id="convs"><div class="empty"><div class="spin" style="margin:auto"></div></div></div>`;
  const [cs, gs] = await Promise.all([A.conversations(), S.myGroups()]);
  if (stale(tok)) return;
  const gl = await A.lastMessages(gs.map((g) => g.id));
  for (const g of gs) g.last = gl.get(g.id) || null;
  const all = [...cs, ...gs.filter((g) => !g.is_channel)].sort((x, y) => ((x.last?.created_at || x.created_at) < (y.last?.created_at || y.created_at) ? 1 : -1));
  const myChans = gs.filter((g) => g.is_channel);
  let tab = ['msg', 'chan', 'calls'].includes(tabArg) ? tabArg : 'msg';
  const mark = () => $$('#itabs button').forEach((x) => x.classList.toggle('on', x.dataset.t === tab));
  mark();
  const convRow = (c) => {
    const head = c.is_group ? `${groupAvatar(c)}<div class="grow"><b>${esc(c.title || 'Grup')}</b>` : `${avatar(c.other, 52)}<div class="grow">${uname(c.other)}`;
    return `<a class="list-row" href="#/dm/${c.id}">${head}<small>${c.last ? (c.last.sender_id === A.me() ? 'Sen: ' : '') + esc(lastText(c.last)) + ' · ' + ago(c.last.created_at) : c.is_channel ? esc(c.description || 'Kanal') : c.is_group ? 'Grup oluşturuldu' : 'Sohbeti başlat'}</small></div></a>`;
  };
  const draw = async (q = '') => {
    if (tab === 'calls') {
      const calls = await Calls.recentCalls();
      const pm = await A.profiles(calls.map((c) => (c.caller_id === A.me() ? c.callee_id : c.caller_id)));
      if (tab !== 'calls') return;
      const st = { ended: 'Görüşüldü', accepted: 'Görüşüldü', missed: 'Cevapsız', cancelled: 'Cevapsız', declined: 'Reddedildi', ringing: 'Çalıyor' };
      $('#convs').innerHTML = calls.length
        ? calls
            .map((c) => {
              const out = c.caller_id === A.me();
              const u = pm.get(out ? c.callee_id : c.caller_id);
              if (!u) return '';
              const miss = !out && ['missed', 'cancelled'].includes(c.status);
              const len = c.answered_at && c.ended_at ? Math.round((new Date(c.ended_at) - new Date(c.answered_at)) / 1000) : 0;
              const vid = c.kind === 'video';
              return `<div class="list-row">${avatar(u, 48)}<div class="grow">${uname(u)}<small class="${miss ? 'miss' : ''}">${vid ? 'Görüntülü · ' : ''}${out ? 'Giden' : 'Gelen'} · ${st[c.status] || c.status}${len ? ` · ${Math.floor(len / 60)}:${String(len % 60).padStart(2, '0')}` : ''} · ${ago(c.created_at)}</small></div><button class="ibtn" data-call="${u.id}" data-kind="${vid ? 'video' : 'audio'}">${vid ? Calls.CI.video : Calls.CI.phone}</button></div>`;
            })
            .join('')
        : `<div class="empty"><div class="ico">${Calls.CI.phone}</div><h3>Arama yok</h3><p>Sohbetin üstündeki telefon ya da kamera simgesiyle arayabilirsin.</p></div>`;
      hydrate($('#convs'));
      return;
    }
    if (tab === 'chan') {
      const pub = await S.publicChannels(q).catch(() => []);
      if (tab !== 'chan') return;
      const mine = new Set(myChans.map((c) => c.id));
      const others = pub.filter((c) => !mine.has(c.id));
      $('#convs').innerHTML =
        `<div class="inner"><button class="btn block gray" id="newChan">${ic('megaphone')} Kanal oluştur</button></div>` +
        (myChans.length ? `<div class="section-t">Kanallarım</div>${myChans.filter((c) => !q || (c.title || '').toLowerCase().includes(q)).map(convRow).join('')}` : '') +
        (others.length ? `<div class="section-t">Keşfet</div>${others.map((c) => `<a class="list-row" href="#/dm/${c.id}">${groupAvatar(c)}<div class="grow"><b>${esc(c.title)}</b><small>${esc(c.description || '')}${c.members ? ` · ${c.members} takipçi` : ''}</small></div></a>`).join('')}` : '') +
        (!myChans.length && !others.length ? `<div class="empty"><div class="ico">${ic('megaphone', 40)}</div><h3>Kanal yok</h3><p>Kanalda sadece sahibi paylaşım yapar, katılanlar okur. Duyurular için ideal.</p></div>` : '');
      $('#newChan').onclick = newChannelFlow;
      hydrate($('#convs'));
      return;
    }
    const l = all.filter((c) => !q || (c.is_group ? (c.title || '').toLowerCase().includes(q) : c.other.username.includes(q) || (c.other.name || '').toLowerCase().includes(q)));
    $('#convs').innerHTML = l.length ? l.map(convRow).join('') : `<div class="empty"><div class="ico">${I.send}</div><h3>Mesaj yok</h3><p>Bir arkadaşına özelden yaz ya da grup kur.</p></div>`;
    hydrate($('#convs'));
  };
  draw();
  $('#q').oninput = (e) => draw(e.target.value.trim().toLowerCase());
  $('#itabs').onclick = (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    tab = b.dataset.t;
    mark();
    draw($('#q').value.trim().toLowerCase());
  };
  $('#convs').addEventListener('click', (e) => {
    const c = e.target.closest('[data-call]');
    if (c) Calls.startCall(c.dataset.call, c.dataset.kind);
  });
  $('#newDm').onclick = () =>
    sheet([
      {
        icon: I.send,
        label: 'Yeni mesaj',
        run: () =>
          promptSheet('Yeni mesaj', 'Kullanıcı adı', async (u) => {
            const p = await A.byUsername(u.replace(/^@/, '').toLowerCase());
            if (!p) return toast('Kullanıcı bulunamadı', true);
            if (p.id === A.me()) return toast('Kendine mesaj atamazsın', true);
            try {
              const c = await A.conversationWith(p.id);
              location.hash = '#/dm/' + c.id;
            } catch (er) {
              toast(er.message, true);
            }
          }),
      },
      { icon: I.users, label: 'Yeni grup', run: newGroupFlow },
      { icon: I.megaphone, label: 'Yeni kanal', run: newChannelFlow },
    ]);
}
function newChannelFlow() {
  promptSheet('Kanal adı', 'Örn. Kanka Duyurular', (t) => {
    if (!t) return;
    promptSheet('Kanal açıklaması', 'Kanal ne hakkında? (isteğe bağlı)', async (d) => {
      try {
        const c = await S.createChannel(t, d || '');
        toast('Kanal oluşturuldu');
        location.hash = '#/dm/' + c.id;
      } catch (er) {
        toast(er.message, true);
      }
    });
  });
}
async function newGroupFlow() {
  const users = await pickUsers('Gruba kişi ekle', [], { max: 31 });
  if (!users.length) return;
  promptSheet('Grup adı', 'Örn. Kankalar', async (t) => {
    try {
      const c = await S.createGroup(t || users.map((u) => u.username).slice(0, 3).join(', '), users);
      location.hash = '#/dm/' + c.id;
    } catch (er) {
      toast(er.message, true);
    }
  }, false, users.map((u) => u.username).slice(0, 3).join(', '));
}

/** Sesli mesaj oynatıcı. */
function voiceHtml(url, mine) {
  return `<div class="bub voice ${mine ? 'mine' : ''}"><button class="vplay" data-voice>${I.play}</button><span class="vbar"><i></i></span><span class="vtime">0:00</span><audio data-m="${esc(url)}" preload="metadata"></audio></div>`;
}
function bindVoice(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-voice]');
    if (!b) return;
    const box = b.closest('.voice');
    const au = $('audio', box);
    $$('audio', root).forEach((x) => x !== au && !x.paused && x.pause());
    if (au.paused) au.play().catch(() => toast('Ses çalınamadı', true));
    else au.pause();
  });
  root.addEventListener('play', (e) => e.target.tagName === 'AUDIO' && ($('[data-voice]', e.target.parentElement).innerHTML = ic('pause', 18)), true);
  root.addEventListener('pause', (e) => e.target.tagName === 'AUDIO' && ($('[data-voice]', e.target.parentElement).innerHTML = I.play), true);
  root.addEventListener(
    'timeupdate',
    (e) => {
      const au = e.target;
      if (au.tagName !== 'AUDIO') return;
      const box = au.parentElement;
      $('.vbar i', box).style.width = (au.duration ? (au.currentTime / au.duration) * 100 : 0) + '%';
      const t = Math.floor(au.currentTime || 0);
      $('.vtime', box).textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    },
    true
  );
  root.addEventListener(
    'loadedmetadata',
    (e) => {
      const au = e.target;
      if (au.tagName !== 'AUDIO' || !isFinite(au.duration)) return;
      const t = Math.round(au.duration);
      $('.vtime', au.parentElement).textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    },
    true
  );
}

/* ---------- Sohbet temaları ---------- */
const THEMES = {
  '': { name: 'Varsayılan', a: '#7b2ff7', b: '#3a6cf4' },
  gunbatimi: { name: 'Gün batımı', a: '#ff7a18', b: '#ee2a7b' },
  okyanus: { name: 'Okyanus', a: '#00b4db', b: '#0083b0' },
  orman: { name: 'Orman', a: '#11998e', b: '#38ef7d' },
  gece: { name: 'Gece', a: '#232526', b: '#414345' },
  pembe: { name: 'Pembe', a: '#f857a6', b: '#ff5858' },
  altin: { name: 'Altın', a: '#f7971e', b: '#ffd200' },
  bayrak: { name: 'Al bayrak', a: '#e30a17', b: '#b00012' },
};
const TTL = { '': 'Kapalı', 1: '1 saat', 24: '24 saat', 168: '7 gün' };

async function vChat(convId, _b, tok) {
  const conv = await A.db.get('conversations', convId);
  if (stale(tok)) return;
  if (!conv) return renderMsg('Sohbet bulunamadı', '', true);
  const group = !!conv.is_group;
  const chan = !!conv.is_channel;
  const mem = await S.members(conv);
  if (stale(tok)) return;
  const member = mem.some((u) => u.id === A.me());
  if (group && !chan && !member) return renderMsg('Bu gruptan çıktın', 'Tekrar katılmak için bir üyenin seni eklemesi gerekir.', true);
  const owner = conv.owner_id === A.me();
  const canWrite = !chan || owner;
  const other = group ? null : mem.find((u) => u.id !== A.me()) || (await A.profile(conv.a === A.me() ? conv.b : conv.a));
  const byId = new Map(mem.map((u) => [u.id, u]));
  const head = group
    ? `<a href="#/group/${conv.id}" style="display:flex;align-items:center;gap:8px">${groupAvatar(conv, 30)}<span><b>${esc(conv.title || 'Grup')}</b><small class="sub" id="cSub">${chan ? `${mem.length} takipçi` : `${mem.length} üye`}</small></span></a>`
    : `<a href="#/u/${esc(other.username)}" style="display:flex;align-items:center;gap:8px">${avatar(other, 30)}<span>${uname(other)}<small class="sub" id="cSub"></small></span></a>`;
  const callBtns = chan ? '' : `<button class="ibtn" id="cVid" title="Görüntülü ara">${Calls.CI.video}</button><button class="ibtn" id="cCall" title="Sesli ara">${Calls.CI.phone}</button>`;
  const th = THEMES[conv.theme] || THEMES[''];
  app.innerHTML = `${topbar(head, true, `${callBtns}<button class="ibtn" id="cMore">${I.dots}</button>`)}
    <div id="gBar"></div>${conv.ttl_hours ? `<div class="ttl-note">${ic('circle', 14)} Kaybolan mesajlar açık: ${TTL[conv.ttl_hours] || conv.ttl_hours + ' saat'} sonra silinir</div>` : ''}
    <div class="chat pad-composer" id="chat" style="--bub-a:${th.a};--bub-b:${th.b}"></div>
    ${
      canWrite
        ? `<div class="composer" id="mcomp"><div class="reply-bar hidden" id="rBar"></div><div class="preview hidden" id="prev"></div><div class="row" id="mRow"><button class="ibtn" id="mImg">${I.image}</button><button class="ibtn" id="mGif">${I.gif}</button><input type="text" id="mTxt" placeholder="${chan ? 'Kanala yaz...' : 'Mesaj...'}" maxlength="2000"><button class="ibtn" id="mMic" title="Basılı tut: sesli mesaj">${Calls.CI.mic}</button><button class="send hidden" id="mSend">Gönder</button></div>
      <div class="rec hidden" id="mRec"><span class="rdot"></span><span id="recT">0:00</span><span class="grow muted small">Kaydediliyor... bırakınca gönderilir</span><button class="ibtn" id="recX">${I.trash}</button></div></div>`
        : `<div class="composer chan-bar">${member ? `<span class="muted small grow">Bu kanalda sadece sahibi paylaşım yapar.</span><button class="btn sm gray" id="chLeave">Ayrıl</button>` : `<button class="btn block" id="chJoin">Kanala katıl</button>`}</div>`
    }`;
  let replyTo = null;
  let once = false;
  const att = canWrite
    ? attachments($('#mcomp'), () => {
        toggleSend();
        // tek seferlik fotoğraf seçeneği
        const pv = $('#prev');
        if (att?.get()?.file && !$('#onceBtn', pv)) {
          pv.insertAdjacentHTML('beforeend', `<button class="once-btn ${once ? 'on' : ''}" id="onceBtn" title="Bir kez görüntülenebilir">1</button>`);
          $('#onceBtn', pv).onclick = (e) => {
            once = !once;
            e.currentTarget.classList.toggle('on', once);
            toast(once ? 'Bir kez görüntülenebilir: açıldıktan sonra kaybolur' : 'Normal fotoğraf');
          };
        }
        if (!att?.get()) once = false;
      })
    : null;
  const toggleSend = () => {
    if (!canWrite) return;
    const has = $('#mTxt').value.trim() || att?.get();
    $('#mSend').classList.toggle('hidden', !has);
    $('#mMic').classList.toggle('hidden', !!has);
  };
  const setReply = (m) => {
    replyTo = m;
    const rb = $('#rBar');
    if (!rb) return;
    rb.classList.toggle('hidden', !m);
    if (m) {
      rb.innerHTML = `<div class="grow"><b>${m.sender_id === A.me() ? 'Kendine' : esc(byId.get(m.sender_id)?.username || '')}</b> yanıt veriyorsun<small>${esc(lastText(m)).slice(0, 80)}</small></div><button class="ibtn" id="rX">${I.close}</button>`;
      $('#rX').onclick = () => setReply(null);
      $('#mTxt').focus();
    }
  };
  let msgs = [];
  let reacts = [];
  let lastKey = '';
  let rd = [];
  const reactHtml = (m) => {
    const rs = reacts.filter((r) => r.message_id === m.id);
    if (!rs.length) return '';
    const by = {};
    rs.forEach((r) => (by[r.emoji] = (by[r.emoji] || 0) + 1));
    const mineR = rs.find((r) => r.user_id === A.me())?.emoji;
    return `<div class="reacts ${m.sender_id === A.me() ? 'mine' : ''}" data-rx="${m.id}">${Object.entries(by)
      .map(([k, n]) => `<span class="${k === mineR ? 'me' : ''}">${REACT[k] || ''}${n > 1 ? `<b>${n}</b>` : ''}</span>`)
      .join('')}</div>`;
  };
  const quoteHtml = (m) => {
    if (!m.reply_to) return '';
    const q = msgs.find((x) => x.id === m.reply_to);
    return `<div class="quote" data-jump="${m.reply_to}"><b>${q ? (q.sender_id === A.me() ? 'Sen' : esc(byId.get(q.sender_id)?.username || '')) : ''}</b>${q ? esc(lastText(q)).slice(0, 90) : 'Silinmiş mesaj'}</div>`;
  };
  const onceHtml = (m, mine) => {
    const opened = !!m.opened_at;
    if (mine) return `<div class="bub once ${mine ? 'mine' : ''}" data-m-id="${m.id}">${ic('circle', 16)} Tek seferlik ${m.media_kind === 'video' ? 'video' : 'fotoğraf'}<small>${opened ? 'Açıldı' : 'Henüz açılmadı'}</small></div>`;
    if (opened || !m.media) return `<div class="bub once" data-m-id="${m.id}">${ic('circle', 16)} Açıldı</div>`;
    return `<button class="bub once open" data-once="${m.id}">${ic('eye', 16)} Fotoğrafı aç<small>Bir kez görüntülenebilir</small></button>`;
  };
  const draw = () => {
    const box = $('#chat');
    if (!box) return;
    const lastMine = [...msgs].reverse().find((m) => m.sender_id === A.me());
    const seenBy = lastMine ? rd.filter((r) => r.last_read_at && r.last_read_at >= lastMine.created_at) : [];
    const typers = rd.filter((r) => r.typing_at && Date.now() - new Date(r.typing_at).getTime() < 6000);
    const key = msgs.map((m) => m.id + (m.opened_at || '')).join() + '|' + reacts.map((r) => r.message_id + r.emoji + r.user_id).join() + '|' + seenBy.length + '|' + typers.map((t) => t.user_id).join();
    if (key === lastKey) return;
    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
    lastKey = key;
    let prevT = 0;
    let prevS = '';
    box.innerHTML = msgs.length
      ? msgs
          .map((m) => {
            const t = new Date(m.created_at).getTime();
            const stamp = t - prevT > 30 * 60 * 1000 ? `<div class="stamp">${new Date(m.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>` : '';
            const mine = m.sender_id === A.me();
            const who = group && !chan && !mine && (prevS !== m.sender_id || stamp) ? `<div class="bub-who">${esc(byId.get(m.sender_id)?.username || 'eski üye')}</div>` : '';
            prevT = t;
            prevS = m.sender_id;
            const link = (m.text || '').match(/#\/p\/([\w-]+)/);
            const side = mine && !chan ? 'mine' : '';
            const body = m.once
              ? onceHtml(m, mine)
              : (m.media && m.media_kind === 'audio' ? voiceHtml(m.media, side).replace('class="bub', `data-m-id="${m.id}" class="bub`) : '') +
                (m.media && m.media_kind !== 'audio' ? `<div class="bub media ${side}" data-m-id="${m.id}">${mediaTag(m.media, m.media_kind === 'video' ? 'video' : 'photo', '', m.media_kind === 'video' ? 'controls' : '')}</div>` : '') +
                (m.text ? `<div class="bub ${side} ${/^[^:]*::tepki:[a-z]+::$/.test(m.text) ? 'reactmsg' : ''}" data-m-id="${m.id}">${link ? `<a href="#/p/${link[1]}" style="text-decoration:underline">${esc(m.text)}</a>` : richText(m.text)}</div>` : '');
            return stamp + who + `<div class="msg ${side}" id="m-${m.id}">${quoteHtml(m)}${body}${reactHtml(m)}</div>`;
          })
          .join('') +
        (!chan && seenBy.length && lastMine === msgs[msgs.length - 1] ? `<div class="seen">${group ? `Görenler: ${seenBy.map((r) => esc(byId.get(r.user_id)?.username || '')).join(', ')}` : `Görüldü ${ago(seenBy[0].last_read_at)}`}</div>` : '') +
        (typers.length ? `<div class="bub typing"><i></i><i></i><i></i></div>` : '')
      : `<div class="empty">${group ? groupAvatar(conv, 80) : avatar(other, 80)}<h3>${esc(group ? conv.title : other.name || other.username)}</h3><p>${chan ? esc(conv.description || 'Henüz paylaşım yok.') : group ? `${mem.length} üye` : `@${esc(other.username)} ile sohbete başla`}</p></div>`;
    if ($('#cSub')) $('#cSub').textContent = typers.length ? (group ? `${byId.get(typers[0].user_id)?.username || ''} yazıyor...` : 'yazıyor...') : chan ? `${mem.length} takipçi` : group ? `${mem.length} üye` : '';
    hydrate(box);
    if (atBottom || !prevLen) window.scrollTo(0, document.body.scrollHeight);
    prevLen = msgs.length;
  };
  let prevLen = 0;
  bindVoice($('#chat'));
  // full: son 60 mesajı baştan al (silme / açılma sonrası); değilse sadece yeni gelenler
  let busy = false;
  let tick = 0;
  const loadReacts = async () => {
    reacts = await S.reactions(msgs.map((m) => m.id));
    draw();
  };
  const loadReads = async () => {
    rd = await S.reads(conv);
    draw();
  };
  const load = async (full = true) => {
    if (busy) return;
    busy = true;
    try {
      if (full || !msgs.length) {
        const [m, r] = await Promise.all([A.messages(conv.id, null, conv.ttl_hours), S.reads(conv)]);
        msgs = m;
        rd = r;
        reacts = await S.reactions(msgs.map((x) => x.id));
      } else {
        const since = msgs[msgs.length - 1].created_at;
        const [nw, r] = await Promise.all([A.messages(conv.id, since, conv.ttl_hours), S.reads(conv)]);
        rd = r;
        let added = false;
        for (const m of nw) if (!msgs.some((x) => x.id === m.id)) (msgs.push(m), (added = true));
        if (added || ++tick % 5 === 0) reacts = await S.reactions(msgs.map((x) => x.id));
      }
      draw();
      if (!document.hidden && member) S.markRead(conv);
    } catch {
      /* ağ hatası: sonra tekrar */
    }
    busy = false;
  };
  await load();
  // devam eden grup araması
  const gbar = async () => {
    if (!group || chan) return;
    const row = await Group.activeCall(conv.id);
    const el = $('#gBar');
    if (!el) return;
    el.innerHTML = row && !Group.inGroupCall() ? `<div class="gcall-bar">${ic('users', 18)} Devam eden ${row.kind === 'video' ? 'görüntülü' : 'sesli'} grup araması<button class="btn sm" id="gJoin">Katıl</button></div>` : '';
    if ($('#gJoin')) $('#gJoin').onclick = () => Group.joinGroupCall(row, conv);
  };
  gbar();
  const unsubs = [
    A.db.subscribe('messages', `conversation_id=eq.${conv.id}`, (_row, ev) => load(ev !== 'INSERT')),
    A.db.subscribe('conversation_reads', `conversation_id=eq.${conv.id}`, loadReads),
    A.db.subscribe('message_reactions', null, (row) => row && msgs.some((m) => m.id === row.message_id) && loadReacts()),
  ];
  if (group && !chan) unsubs.push(A.db.subscribe('group_calls', `conversation_id=eq.${conv.id}`, gbar));
  let n = 0;
  pollT = setInterval(() => {
    if (stale(tok)) return unsubs.forEach((u) => u());
    if (document.hidden) return;
    load(false);
    if (++n % 4 === 0) gbar();
  }, A.db.realtime ? 5000 : 2500);

  // ---- mesaj işlemleri: basılı tut menüsü, çift dokunuşla kalp ----
  const msgMenu = (m) => {
    const mine = m.sender_id === A.me();
    sheet(
      `<div class="react-pick">${Object.keys(REACT).map((k) => `<button data-r="${k}" title="${REACT_NAMES[k]}">${REACT[k]}</button>`).join('')}</div>
      <div class="inner opts">${member ? `<button class="opt" data-o="reply">${I.reply}<span>Yanıtla</span></button>` : ''}${m.text ? `<button class="opt" data-o="copy">${I.link}<span>Kopyala</span></button>` : ''}
      ${mine || (chan && owner) ? `<button class="opt red" data-o="del">${I.trash}<span>Herkesten sil</span></button>` : `<button class="opt red" data-o="rep">${I.flag}<span>Şikâyet et</span></button>`}</div>`,
      (c, close) => {
        c.onclick = async (e) => {
          const r = e.target.closest('[data-r]');
          if (r) {
            close();
            try {
              await S.react(m, r.dataset.r);
              lastKey = '';
              load();
            } catch (er) {
              toast(er.message, true);
            }
            return;
          }
          const o = e.target.closest('[data-o]')?.dataset.o;
          if (!o) return;
          close();
          if (o === 'reply') setReply(m);
          if (o === 'copy') navigator.clipboard?.writeText(m.text).then(() => toast('Kopyalandı'));
          if (o === 'del') confirmSheet('Mesaj herkesten silinsin mi?', async () => (await A.deleteMessage(m.id), (lastKey = ''), load()), 'Sil');
          if (o === 'rep') reportFlow('user', m.sender_id);
        };
      }
    );
  };
  $('#chat').addEventListener('contextmenu', (e) => e.preventDefault());
  let pressT = null;
  let lastTap = 0;
  $('#chat').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-m-id]');
    if (!b) return;
    pressT = setTimeout(() => {
      const m = msgs.find((x) => x.id === b.dataset.mId);
      if (m) msgMenu(m);
    }, 480);
  });
  $('#chat').addEventListener('pointerup', (e) => {
    clearTimeout(pressT);
    const b = e.target.closest('[data-m-id]');
    if (!b || e.target.closest('a, button, video, audio')) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      const m = msgs.find((x) => x.id === b.dataset.mId);
      if (m && member) S.react(m, 'kalp').then(() => ((lastKey = ''), load())).catch(() => {});
      lastTap = 0;
    } else lastTap = now;
  });
  $('#chat').addEventListener('pointercancel', () => clearTimeout(pressT));
  $('#chat').addEventListener('scroll', () => clearTimeout(pressT), true);
  $('#chat').addEventListener('click', async (e) => {
    const j = e.target.closest('[data-jump]');
    if (j) {
      const el = document.getElementById('m-' + j.dataset.jump);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 1200);
      }
      return;
    }
    const rx = e.target.closest('[data-rx]');
    if (rx) {
      const rs = reacts.filter((r) => r.message_id === rx.dataset.rx);
      const pm = await A.profiles(rs.map((r) => r.user_id));
      return sheet(`<h3>Tepkiler</h3>${rs.map((r) => `<div class="list-row">${avatar(pm.get(r.user_id), 40)}<div class="grow">${uname(pm.get(r.user_id))}</div><span class="react-big">${REACT[r.emoji] || ''}</span></div>`).join('')}`);
    }
    const o = e.target.closest('[data-once]');
    if (o) {
      const m = msgs.find((x) => x.id === o.dataset.once);
      if (!m || !m.media) return;
      const src = await A.db.resolve(m.media);
      const v = document.createElement('div');
      v.className = 'once-view';
      v.innerHTML = `${m.media_kind === 'video' ? `<video src="${esc(src)}" autoplay playsinline></video>` : `<img src="${esc(src)}">`}<div class="once-hint">Kapatınca bir daha açılamaz</div><button class="ibtn once-x">${I.close}</button>`;
      document.body.appendChild(v);
      const close = async () => {
        v.remove();
        await S.markOpened(m).catch(() => {});
        lastKey = '';
        load();
      };
      $('.once-x', v).onclick = close;
      window.__onceClose = close;
    }
  });

  if (chan && !canWrite) {
    if ($('#chJoin'))
      $('#chJoin').onclick = async () => {
        try {
          await S.joinChannel(conv);
          toast('Kanala katıldın');
          route();
        } catch (er) {
          toast(er.message, true);
        }
      };
    if ($('#chLeave')) $('#chLeave').onclick = () => confirmSheet('Kanaldan ayrılınsın mı?', async () => (await S.leaveGroup(conv), route()), 'Ayrıl');
  }

  if (canWrite) {
    const send = async () => {
      const text = $('#mTxt').value.trim();
      const a = att.get();
      if (!text && !a) return;
      $('#mTxt').value = '';
      const isOnce = once && !!a?.file;
      const rep = replyTo;
      att.clear();
      setReply(null);
      once = false;
      toggleSend();
      try {
        const m = await A.sendMessage(conv, { text, file: a?.file, gifUrl: a?.gifUrl, replyTo: rep?.id, once: isOnce });
        msgs.push(m);
        lastKey = '';
        draw();
      } catch (er) {
        toast(er.message, true);
      }
    };
    $('#mSend').onclick = send;
    $('#mTxt').oninput = () => (toggleSend(), $('#mTxt').value && S.typing(conv));
    $('#mTxt').onkeydown = (e) => e.key === 'Enter' && send();

    // ---- sesli mesaj: basılı tut, bırakınca gönder ----
    let rec = null;
    let held = false;
    const stopRec = async (sendIt) => {
      if (!rec) return;
      const r = rec;
      rec = null;
      clearInterval(r.t);
      $('#mRec')?.classList.add('hidden');
      $('#mRow')?.classList.remove('hidden');
      r.cancel = !sendIt || Date.now() - r.start < 800;
      if (r.mr.state !== 'inactive') r.mr.stop();
    };
    $('#mMic').onpointerdown = async (e) => {
      e.preventDefault();
      if (rec) return;
      let stream;
      try {
        const hadMic = !window.KankaAndroid?.ensureMic || window.KankaAndroid.ensureMic();
        held = true;
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (!hadMic || !held) {
          stream.getTracks().forEach((t) => t.stop());
          return toast('Mikrofon hazır. Kaydetmek için basılı tut.');
        }
      } catch {
        return toast('Mikrofona erişilemedi', true);
      }
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      rec = { mr, start: Date.now(), cancel: false };
      const meRec = rec;
      mr.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (meRec.cancel || !chunks.length) return;
        const blob = new Blob(chunks, { type: (mr.mimeType || 'audio/webm').split(';')[0] });
        try {
          const url = await S.uploadVoice(blob);
          const m = await A.sendMessage(conv, { text: '', voiceUrl: url, replyTo: replyTo?.id });
          setReply(null);
          msgs.push(m);
          lastKey = '';
          draw();
        } catch (er) {
          toast(er.message, true);
        }
      };
      mr.start();
      $('#mRow').classList.add('hidden');
      $('#mRec').classList.remove('hidden');
      rec.t = setInterval(() => {
        const s = Math.floor((Date.now() - meRec.start) / 1000);
        $('#recT').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (s >= 120) stopRec(true);
      }, 250);
    };
    const up = (e) => {
      held = false;
      if (rec) stopRec(!e.target.closest?.('#recX'));
    };
    window.addEventListener('pointerup', up);
    $('#recX').onpointerdown = (e) => (e.stopPropagation(), stopRec(false));
    const cleanup = setInterval(() => stale(tok) && (window.removeEventListener('pointerup', up), stopRec(false), clearInterval(cleanup)), 500);
  }

  // ---- arama düğmeleri ----
  if ($('#cCall')) $('#cCall').onclick = () => (group ? Group.startGroupCall(conv, 'audio') : Calls.startCall(other.id, 'audio'));
  if ($('#cVid')) $('#cVid').onclick = () => (group ? Group.startGroupCall(conv, 'video') : Calls.startCall(other.id, 'video'));

  // ---- ayarlar menüsü ----
  const themeSheet = () =>
    sheet(`<h3>Sohbet teması</h3><div class="theme-pick">${Object.entries(THEMES)
      .map(([k, t]) => `<button data-th="${k}" class="${(conv.theme || '') === k ? 'on' : ''}"><i style="background:linear-gradient(135deg,${t.a},${t.b})"></i><span>${t.name}</span></button>`)
      .join('')}</div>`, (c, close) => {
      c.onclick = async (e) => {
        const b = e.target.closest('[data-th]');
        if (!b) return;
        close();
        try {
          await S.setConvSetting(conv, { theme: b.dataset.th });
          route();
        } catch (er) {
          toast(er.message, true);
        }
      };
    });
  const ttlSheet = () =>
    sheet(
      Object.entries(TTL).map(([k, v]) => ({
        icon: String(conv.ttl_hours || '') === k ? I.check : I.circle,
        label: k ? `Kaybolan mesajlar: ${v}` : 'Kaybolan mesajlar: Kapalı',
        run: async () => {
          try {
            await S.setConvSetting(conv, { ttl_hours: k ? +k : null });
            toast(k ? `Mesajlar ${v} sonra kaybolacak` : 'Kaybolan mesajlar kapatıldı');
            route();
          } catch (er) {
            toast(er.message, true);
          }
        },
      }))
    );
  $('#cMore').onclick = () => {
    const opts = [];
    if (chan) {
      if (owner) opts.push({ icon: I.pen, label: 'Kanal adı ve açıklaması', run: () => promptSheet('Kanal adı', '', async (t) => t && (await S.setConvSetting(conv, { title: t.slice(0, 40) }), route()), false, conv.title) });
      opts.push({ icon: I.link, label: 'Kanal bağlantısını paylaş', run: () => shareLink(`${SITE}/#/dm/${conv.id}`, `Kanka kanalı: ${conv.title}`) });
      if (member && !owner) opts.push({ icon: I.close, label: 'Kanaldan ayrıl', red: true, run: () => confirmSheet('Kanaldan ayrılınsın mı?', async () => (await S.leaveGroup(conv), route()), 'Ayrıl') });
      if (owner) opts.push({ icon: I.trash, label: 'Kanalı sil', red: true, run: () => confirmSheet('Kanal ve tüm paylaşımları silinsin mi?', async () => (await A.db.remove('conversations', { id: conv.id }), (location.hash = '#/dm/chan')), 'Sil') });
      return sheet(opts);
    }
    if (group) opts.push({ icon: I.users, label: 'Grup bilgisi', run: () => (location.hash = '#/group/' + conv.id) });
    else opts.push({ icon: I.user, label: 'Profili gör', run: () => (location.hash = '#/u/' + other.username) });
    opts.push({ icon: I.sun, label: 'Sohbet teması', run: themeSheet });
    opts.push({ icon: I.circle, label: `Kaybolan mesajlar (${TTL[conv.ttl_hours || ''] || conv.ttl_hours + ' saat'})`, run: ttlSheet });
    if (group) opts.push({ icon: I.close, label: 'Gruptan çık', red: true, run: () => confirmSheet('Gruptan çıkılsın mı?', async () => (await S.leaveGroup(conv), (location.hash = '#/dm'))) });
    else opts.push({ icon: I.flag, label: 'Kullanıcıyı şikâyet et', red: true, run: () => reportFlow('user', other.id) });
    sheet(opts);
  };
}

/* =========================================================
   Anket gönderisi
   ========================================================= */
function pollCardHtml(p) {
  const poll = p.meta?.poll || { q: p.caption, options: [] };
  return `<div class="poll-card" data-poll="${p.id}"><div class="pq">${esc(poll.q || '')}</div>${(poll.options || [])
    .map((o, i) => `<button class="po" data-vote-i="${i}"><i></i><span>${esc(o)}</span><b></b></button>`)
    .join('')}<small class="pt muted"></small></div>`;
}
async function hydratePolls(root, list) {
  for (const card of $$('.poll-card', root)) {
    const p = list.find((x) => x.id === card.dataset.poll);
    if (!p) continue;
    const r = await S.pollPostResults(p.id);
    drawPoll(card, p, r);
  }
}
function drawPoll(card, p, r) {
  const counts = r?.counts || {};
  const tot = Object.values(counts).reduce((a, b) => a + +b, 0);
  const voted = r?.mine !== null && r?.mine !== undefined;
  const show = voted || p.user_id === A.me();
  card.dataset.voted = voted ? '1' : '';
  $$('.po', card).forEach((b) => {
    const i = +b.dataset.voteI;
    const n = +(counts[i] || 0);
    const pct = tot ? Math.round((n / tot) * 100) : 0;
    b.classList.toggle('mine', r?.mine === i);
    b.classList.toggle('shown', show);
    $('i', b).style.width = show ? pct + '%' : '0';
    $('b', b).textContent = show ? `%${pct}` : '';
  });
  $('.pt', card).textContent = `${tot} oy${show ? '' : ' · oy verince sonuçları görürsün'}`;
  card.classList.toggle('voted', voted);
}
async function votePoll(p, i, card) {
  try {
    await S.votePost(p, i);
    drawPoll(card, p, await S.pollPostResults(p.id));
  } catch (er) {
    toast(er.message, true);
  }
}
function vCreatePoll() {
  app.innerHTML = `${topbar('Anket paylaş', true, '<button class="btn sm" id="pShare">Paylaş</button>')}<div class="create">
    <input class="field" id="pQ" placeholder="Soru (örn. Akşam ne yapalım?)" maxlength="140">
    <div id="pOpts"><input class="field po-in" placeholder="1. seçenek" maxlength="60"><input class="field po-in" placeholder="2. seçenek" maxlength="60"></div>
    <button class="btn block gray" id="pAdd">${I.plus} Seçenek ekle</button>
    <p class="small muted">En fazla 4 seçenek. Oy verenlerin kimliği gizlidir, sadece yüzdeler görünür.</p></div>`;
  $('#pAdd').onclick = () => {
    const n = $$('.po-in').length;
    if (n >= 4) return toast('En fazla 4 seçenek', true);
    $('#pOpts').insertAdjacentHTML('beforeend', `<input class="field po-in" placeholder="${n + 1}. seçenek" maxlength="60">`);
  };
  $('#pShare').onclick = async () => {
    const q = $('#pQ').value.trim();
    const options = $$('.po-in').map((x) => x.value.trim()).filter(Boolean);
    if (!q) return toast('Soruyu yaz', true);
    if (options.length < 2) return toast('En az 2 seçenek yaz', true);
    $('#pShare').disabled = true;
    try {
      const post = await A.createPollPost({ question: q, options });
      S.notifyMentions(post, q);
      toast('Anket paylaşıldı');
      location.hash = '#/home';
    } catch (er) {
      toast(er.message, true);
      $('#pShare').disabled = false;
    }
  };
}

/* =========================================================
   Canlı yayın
   ========================================================= */
function vGoLive() {
  app.innerHTML = `${topbar('Canlı yayın', true)}<div class="create" style="text-align:center">
    <div class="live-hero"><span class="lv-badge">CANLI</span></div>
    <input class="field" id="lvTitle" placeholder="Yayın başlığı (isteğe bağlı)" maxlength="80">
    <button class="btn block" id="lvGo">${Calls.CI.video} Yayını başlat</button>
    <p class="small muted">Takipçilerine bildirim gider. Arkadaş ortamı için en fazla 20 izleyici aynı anda izleyebilir. Yorumlar ve kalpler canlı görünür; yayın kaydedilmez.</p></div>`;
  $('#lvGo').onclick = () => Live.startLive($('#lvTitle').value.trim());
}
async function vLive(id) {
  app.innerHTML = `${topbar('Canlı yayın', true)}<div class="empty"><div class="spin" style="margin:auto"></div></div>`;
  await Live.watchLive(id);
}

/* =========================================================
   Anılar: "1 yıl önce bugün"
   ========================================================= */
async function showMemory(box) {
  const today = new Date();
  const key = today.toISOString().slice(0, 10);
  try {
    if (localStorage.getItem('kanka.memory') === key) return;
  } catch {
    /* yok */
  }
  const mine = await A.userPostsLite(A.me()).catch(() => []);
  const sameDay = (d) => d.getDate() === today.getDate();
  let pick = null;
  let label = '';
  for (const p of mine) {
    const d = new Date(p.created_at);
    if (!sameDay(d)) continue;
    const years = today.getFullYear() - d.getFullYear();
    const months = years * 12 + today.getMonth() - d.getMonth();
    if (years >= 1 && d.getMonth() === today.getMonth()) {
      pick = p;
      label = `${years} yıl önce bugün`;
      break;
    }
    if (!pick && months >= 1) {
      pick = p;
      label = months === 1 ? '1 ay önce bugün' : `${months} ay önce bugün`;
    }
  }
  if (!pick || !box) return;
  box.insertAdjacentHTML(
    'afterbegin',
    `<div class="memory"><a href="#/p/${pick.id}" class="mem-thumb">${mediaTag(pick.media, pick.kind)}</a><a href="#/p/${pick.id}" class="grow"><b>Anı</b><small>${label} paylaştığın ${pick.kind === 'video' ? 'video' : pick.kind === 'poll' ? 'anket' : 'fotoğraf'}</small></a>
    <button class="ibtn" id="memShare" title="Hikâyende paylaş">${I.repost}</button><button class="ibtn" id="memX">${I.close}</button></div>`
  );
  hydrate(box);
  $('#memX').onclick = () => {
    try {
      localStorage.setItem('kanka.memory', key);
    } catch {
      /* yok */
    }
    $('.memory')?.remove();
  };
  $('#memShare').onclick = () => shareLink(postUrl(pick.id), `Anı: ${label}`);
}

/* =========================================================
   Yakındakiler (yaklaşık konum, isteğe bağlı)
   ========================================================= */
async function vNearby(_a, _b, tok) {
  app.innerHTML = `${topbar('Yakındakiler', true)}<div id="nb"><div class="empty"><div class="spin" style="margin:auto"></div></div></div>`;
  const mine = await S.myLocation();
  if (stale(tok)) return;
  const box = $('#nb');
  if (!mine) {
    box.innerHTML = `<div class="empty"><div class="ico">${I.globe}</div><h3>Yakınındaki Kanka kullanıcıları</h3>
      <p>Konumunu paylaşırsan, konumunu paylaşan diğer kişileri uzaklıklarıyla görürsün. Tam konumun asla gösterilmez; yaklaşık 1 km'ye yuvarlanır. İstediğin an kapatabilirsin.</p>
      <button class="btn" id="nbOn">Konumumu paylaş</button></div>`;
    $('#nbOn').onclick = async () => {
      $('#nbOn').disabled = true;
      try {
        await S.shareLocation();
        route();
      } catch (er) {
        toast(er.message, true);
        $('#nbOn').disabled = false;
      }
    };
    return;
  }
  // konumu tazele (arka planda)
  S.shareLocation().catch(() => {});
  const list = await S.nearby(mine);
  if (stale(tok)) return;
  const km = (d) => (d < 1 ? '1 km içinde' : d < 10 ? `${d.toFixed(1)} km` : `${Math.round(d)} km`);
  box.innerHTML =
    `<div class="inner small muted">Konumun yaklaşık olarak paylaşılıyor. <button class="link" id="nbOff">Paylaşmayı durdur</button></div>` +
    (list.length
      ? list.map((x) => `<a class="list-row" href="#/u/${esc(x.user.username)}">${avatar(x.user, 48)}<div class="grow">${uname(x.user)}<small>${km(x.km)} · ${ago(x.at)}</small></div></a>`).join('')
      : `<div class="empty"><h3>Yakında kimse yok</h3><p>Konumunu paylaşan başka kullanıcı yok ya da hepsi uzakta. Arkadaşlarına da açmalarını söyle.</p></div>`);
  hydrate(box);
  $('#nbOff').onclick = async () => {
    await S.stopLocation();
    toast('Konum paylaşımı kapatıldı');
    route();
  };
}

/* ---------- Grup bilgisi ---------- */
async function vGroup(convId, _b, tok) {
  const conv = await A.db.get('conversations', convId);
  if (stale(tok)) return;
  if (!conv?.is_group) return renderMsg('Grup bulunamadı', '', true);
  const mem = await S.members(conv);
  if (stale(tok)) return;
  const owner = conv.owner_id === A.me();
  app.innerHTML = `${topbar('Grup bilgisi', true)}<div class="prof" style="text-align:center">${groupAvatar(conv, 86)}<h2 style="margin:10px 0 2px">${esc(conv.title || 'Grup')}</h2><div class="muted small">${mem.length} üye</div>
    <div class="prof-btns" style="margin-top:12px">${owner ? `<button class="btn gray" id="gRen">Adı değiştir</button>` : ''}<button class="btn gray" id="gAdd">Kişi ekle</button></div></div>
    <div class="section-t">Üyeler</div><div id="gMem">${mem
      .map((u) => `<div class="list-row">${avatar(u, 44)}<a class="grow" href="#/u/${esc(u.username)}">${uname(u)}<small>${u.id === conv.owner_id ? 'Grup kurucusu' : esc(u.name)}</small></a>${owner && u.id !== A.me() ? `<button class="btn sm gray" data-rm="${u.id}">Çıkar</button>` : ''}</div>`)
      .join('')}</div>
    <button class="list-row" id="gLeave" style="width:100%;text-align:left;color:#ff6b77">${I.close}<div class="grow">Gruptan çık</div></button>`;
  hydrate(app);
  if ($('#gRen'))
    $('#gRen').onclick = () =>
      promptSheet('Grup adı', '', async (t) => {
        if (!t) return;
        await S.renameGroup(conv, t);
        route();
      }, false, conv.title);
  $('#gAdd').onclick = async () => {
    const add = (await pickUsers('Gruba ekle', [], { max: 31 - mem.length })).filter((u) => !mem.some((m) => m.id === u.id));
    if (!add.length) return;
    await S.addMembers(conv, add);
    toast('Eklendi');
    route();
  };
  $('#gMem').onclick = (e) => {
    const b = e.target.closest('[data-rm]');
    if (b) confirmSheet('Gruptan çıkarılsın mı?', async () => (await S.removeMember(conv, b.dataset.rm), route()), 'Çıkar');
  };
  $('#gLeave').onclick = () => confirmSheet('Gruptan çıkılsın mı?', async () => (await S.leaveGroup(conv), (location.hash = '#/dm')), 'Çık');
}

/* =========================================================
   Bildirimler
   ========================================================= */
async function vNotifs(_a, _b, tok) {
  app.innerHTML = `${topbar('Bildirimler', true)}<div id="nl"><div class="empty"><div class="spin" style="margin:auto"></div></div></div>`;
  const [ns, reqs] = await Promise.all([A.notifications(), A.incomingRequests()]);
  if (stale(tok)) return;
  const reqRow = reqs.length ? `<a class="list-row" href="#/requests" style="background:#0d0d14">${avatar(reqs[0].user, 44)}<div class="grow"><b>Takip istekleri</b><small>${reqs.length} kişi seni takip etmek istiyor</small></div><span class="dot" style="position:static">${reqs.length}</span></a>` : '';
  const posts = new Map();
  for (const n of ns) if (n.post_id && !posts.has(n.post_id)) posts.set(n.post_id, await A.db.get('posts', n.post_id));
  const txt = {
    like: 'gönderini beğendi.',
    comment: 'yorum yaptı:',
    follow: 'seni takip etmeye başladı.',
    follow_request: 'seni takip etmek istiyor.',
    follow_accept: 'takip isteğini kabul etti.',
    repost: 'gönderini repost etti.',
    tag: 'seni bir gönderide etiketledi.',
    mention: 'senden bahsetti:',
    group_add: 'seni bir gruba ekledi:',
    story_vote: 'hikâyene cevap verdi:',
    missed_call: 'seni aradı (cevapsız arama).',
    live: 'canlı yayında:',
    group_call: 'grup araması başlattı.',
    invite: 'davetinle Kanka\'ya katıldı.',
    verified: '',
    system: '',
  };
  $('#nl').innerHTML = reqRow + (ns.length
    ? ns
        .map((n) => {
          const p = posts.get(n.post_id);
          const href = n.post_id ? `#/p/${n.post_id}` : n.type === 'group_add' ? '#/dm' : `#/u/${esc(n.actor.username)}`;
          return `<a class="list-row" href="${href}" style="${n.read ? '' : 'background:#0a0f1a'}">${avatar(n.actor, 44)}<div class="grow" style="white-space:normal">${n.type === 'verified' || n.type === 'system' ? `${TICK} ${esc(n.text)}` : `<b>${esc(n.actor.username)}</b> ${txt[n.type] || ''} ${esc(n.text || '')}`} <span class="muted small">${ago(n.created_at)}</span></div>${p ? `<span style="width:44px;height:44px;flex:none;overflow:hidden;border-radius:4px">${mediaTag(p.media, p.kind)}</span>` : ''}</a>`;
        })
        .join('')
    : `<div class="empty"><div class="ico">${I.heart}</div><h3>Bildirim yok</h3><p>Beğeniler, yorumlar ve yeni takipçiler burada görünür.</p></div>`);
  hydrate($('#nl'));
  A.markAllRead().then(() => refreshBadges(true));
}

/* =========================================================
   Ayarlar & profil düzenle
   ========================================================= */
async function vSettings() {
  const admin = A.isAdminP(meP);
  const local = A.db.mode === 'local';
  app.innerHTML = `${topbar('Ayarlar', true)}
    ${admin ? `<a class="list-row" href="#/admin">${I.shield}<div class="grow"><b>Yönetim paneli</b><small>Kullanıcılar, mavi tik, şikâyetler, içerik denetimi</small></div></a>` : ''}
    <a class="list-row" href="#/edit">${I.user}<div class="grow">Profili düzenle</div></a>
    <a class="list-row" href="#/privacy">${ic('lock', 24)}<div class="grow">Gizlilik<small>${meP.private ? 'Gizli hesap' : 'Herkese açık hesap'} · mesaj izni · engellenenler</small></div></a>
    <button class="list-row" id="invite" style="width:100%;text-align:left">${I.users}<div class="grow">Arkadaşını davet et<small>Bağlantıyla gelen seni otomatik takip eder</small></div></button>
    <a class="list-row" href="#/saved">${I.bookmark}<div class="grow">Kaydedilenler</div></a>
    <a class="list-row" href="#/closefriends">${ic('star', 24)}<div class="grow">Yakın arkadaşlar<small>Hikâyeleri sadece seçtiğin kişilerle paylaş</small></div></a>
    <a class="list-row" href="#/appearance">${I.sun}<div class="grow">Görünüm<small>${{ dark: 'Koyu tema', light: 'Açık tema', system: 'Sistemle aynı' }[S.theme()]}</small></div></a>
    <a class="list-row" href="#/verify">${TICK}<div class="grow">Mavi tik başvurusu<small>${meP.verified ? 'Hesabın zaten onaylı' : 'Yüz fotoğrafı ve yaş doğrulaması ile'}</small></div></a>
    <a class="list-row" href="#/notifs">${I.bell}<div class="grow">Bildirimler</div></a>
    ${window.KankaAndroid ? `<a class="list-row" href="#/notiftest">${I.bell}<div class="grow">Bildirim testi<small>Uygulama kapalıyken arama gelmiyorsa buraya bak</small></div></a>` : ''}
    <button class="list-row" id="pw" style="width:100%;text-align:left">${I.gear}<div class="grow">Şifre değiştir</div></button>
    <a class="list-row" href="#/server">${I.globe}<div class="grow">Sunucu<small>${local ? 'Yerel mod (sadece bu cihaz)' : 'Ortak sunucuya bağlı'}</small></div></a>
    ${window.KankaAndroid && (!window.KankaAndroid.selfUpdate || window.KankaAndroid.selfUpdate()) ? `<button class="list-row" id="upd" style="width:100%;text-align:left">${I.reply}<div class="grow">Güncellemeleri denetle<small>Yüklü sürüm: ${window.KankaAndroid.version()}</small></div></button>` : ''}
    <a class="list-row" href="#/legal">${ic('folder', 24)}<div class="grow">Sözleşmeler ve kurallar<small>Gizlilik, kullanım koşulları, topluluk kuralları</small></div></a>
    <button class="list-row" id="del" style="width:100%;text-align:left;color:#ff6b77">${I.trash}<div class="grow">Hesabımı sil</div></button>
    <button class="list-row" id="out" style="width:100%;text-align:left;color:#ff6b77">${I.close}<div class="grow">Çıkış yap</div></button>
    <p class="small muted" style="padding:14px">Kanka · @${esc(meP.username)}</p>`;
  $('#del').onclick = deleteAccountFlow;
  $('#invite').onclick = inviteSheet;
  $('#pw').onclick = () =>
    promptSheet('Yeni şifre', 'En az 6 karakter', async (pw) => {
      if (pw.length < 6) return toast('En az 6 karakter', true);
      await A.db.changePassword(pw);
      toast('Şifre değişti');
    });
  if ($('#upd')) $('#upd').onclick = () => window.KankaAndroid.checkUpdate();
  $('#out').onclick = () =>
    confirmSheet('Çıkış yapılsın mı?', async () => {
      const tok = window.KankaAndroid?.pushToken?.();
      if (tok && A.db.mode !== 'local') await A.db.rpc('unregister_device', { tok }).catch(() => {});
      pushDone = false;
      A.db.signOut();
    }, 'Çıkış yap');
}

async function vEdit() {
  let avatarFile = null;
  app.innerHTML = `${topbar('Profili düzenle', true, '<button class="btn sm" id="save">Bitti</button>')}<div class="create">
    <div style="text-align:center"><button id="av">${avatar(meP, 90)}<div style="color:#0095f6;font-weight:600;margin-top:8px">Fotoğrafı değiştir</div></button></div>
    <label class="small muted">Ad</label><input class="field" id="name" value="${esc(meP.name)}" maxlength="40">
    <label class="small muted">Kullanıcı adı</label><input class="field" id="un" value="${esc(meP.username)}" maxlength="24" autocapitalize="off">
    <label class="small muted">Biyografi</label><textarea class="field" id="bio" maxlength="150">${esc(meP.bio)}</textarea></div>`;
  $('#av').onclick = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    avatarFile = f;
    $('#av .av').innerHTML = `<img src="${URL.createObjectURL(f)}">`;
  };
  $('#save').onclick = async () => {
    const un = $('#un').value.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (un.length < 3) return toast('Kullanıcı adı en az 3 karakter', true);
    if (un !== meP.username && (await A.byUsername(un))) return toast('Bu kullanıcı adı alınmış', true);
    $('#save').disabled = true;
    try {
      const patch = { name: $('#name').value.trim(), username: un, bio: $('#bio').value.trim() };
      if (avatarFile) patch.avatar = (await A.uploadFile(await A.prepareImage(avatarFile, 400))).url;
      meP = await A.updateProfile(patch);
      toast('Profil güncellendi');
      location.hash = '#/u/' + meP.username;
    } catch (er) {
      toast(er.message, true);
      $('#save').disabled = false;
    }
  };
}

/* =========================================================
   Yönetim paneli
   ========================================================= */
async function vAdmin(section = 'dash', id, tok) {
  if (!A.isAdminP(meP)) return renderMsg('Yetkin yok', 'Bu sayfa sadece yöneticiler içindir.', true);
  await renderAdmin(app, { section, id, me: meP, topbar, stale: () => stale(tok), reroute: route });
}

/* =========================================================
   Yasak / kısıtlama ekranı
   ========================================================= */
const fmtDate = (iso) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function vBanned(b) {
  tabbar.classList.add('hidden');
  app.innerHTML = `<div class="ban-screen"><div class="ban-ico">${I.ban}</div>
    <h2>Hesabın yasaklandı</h2>
    <p class="muted">Kanka topluluk kurallarını ihlal ettiğin için hesabın ${b.banUntil ? `<b>${fmtDate(b.banUntil)}</b> tarihine kadar` : '<b>süresiz</b> olarak'} yasaklandı.</p>
    <div class="ban-reason"><small>Sebep</small><div>${esc(b.banReason || 'Belirtilmedi')}</div></div>
    <p class="small muted">Bu süre boyunca uygulamayı kullanamazsın. Hata olduğunu düşünüyorsan itiraz edebilirsin; yöneticiler inceler.</p>
    <button class="btn block" id="bAppeal">İtiraz et</button>
    <a class="btn block gray" href="#/legal/topluluk-kurallari">Topluluk kuralları</a>
    <button class="btn block gray" id="bOut">Çıkış yap</button></div>`;
  $('#bAppeal').onclick = () =>
    promptSheet('İtiraz', 'Neden yanlış olduğunu kısaca yaz...', async (t) => {
      if (!t) return;
      try {
        await A.appeal(t);
        toast('İtirazın yöneticilere iletildi');
      } catch (er) {
        toast(er.message, true);
      }
    }, true);
  $('#bOut').onclick = () => A.db.signOut();
}
let restrictShown = false;
function restrictNotice(b) {
  if (restrictShown) return;
  restrictShown = true;
  sheet(`<div class="ban-screen in-sheet"><div class="ban-ico warn">${I.ban}</div><h2>Hesabın kısıtlandı</h2>
    <p class="muted">${b.restrictUntil ? `<b>${fmtDate(b.restrictUntil)}</b> tarihine kadar` : 'Yöneticiler kaldırana kadar'} paylaşım, yorum, beğeni, takip ve mesaj gönderemezsin. Gönderileri görmeye devam edebilirsin.</p>
    <div class="ban-reason"><small>Sebep</small><div>${esc(b.restrictReason || 'Belirtilmedi')}</div></div>
    <button class="btn block" id="rOk">Anladım</button><button class="btn block gray" id="rAppeal">İtiraz et</button></div>`, (c, close) => {
    $('#rOk', c).onclick = close;
    $('#rAppeal', c).onclick = () => {
      close();
      promptSheet('İtiraz', 'Neden yanlış olduğunu kısaca yaz...', async (t) => t && (await A.appeal(t), toast('İtirazın yöneticilere iletildi')), true);
    };
  });
}
function restrictBanner(b) {
  return b.restricted ? `<a class="announce" id="rBanner" style="border-color:#5a3a12;background:#1a1206">${ic('ban', 18)}<span><b>Hesabın kısıtlı.</b> ${b.restrictUntil ? fmtDate(b.restrictUntil) + ' tarihine kadar' : 'Süresiz'} paylaşım ve etkileşim kapalı. Ayrıntı için dokun.</span></a>` : '';
}

/* =========================================================
   Gizlilik ayarları
   ========================================================= */
async function vPrivacy(_a, _b, tok) {
  const p = await A.profile(A.me(), true);
  const [reqs, blocked] = await Promise.all([A.incomingRequests(), A.blockedUsers()]);
  if (stale(tok)) return;
  const tg = (id, on, title, sub) => `<label class="list-row toggle-row"><div class="grow">${title}<small>${sub}</small></div><input type="checkbox" class="sw" id="${id}" ${on ? 'checked' : ''}></label>`;
  app.innerHTML = `${topbar('Gizlilik', true)}
    ${tg('pPriv', p.private, 'Gizli hesap', 'Gönderilerini, reels ve hikâyelerini sadece onayladığın takipçiler görür')}
    ${tg('pLikes', p.hide_likes, 'Beğeni sayılarını gizle', 'Başkaları gönderilerindeki beğeni sayısını göremez')}
    <div class="section-t">Sana kimler mesaj atabilir?</div>
    <div class="seg" style="margin:0 14px" id="pDm"><button data-v="everyone">Herkes</button><button data-v="following">Takip ettiklerim</button><button data-v="none">Kimse</button></div>
    <div class="section-t">Seni kimler sesli arayabilir?</div>
    <div class="seg" style="margin:0 14px" id="pCallP"><button data-v="everyone">Herkes</button><button data-v="following">Takip ettiklerim</button><button data-v="none">Kimse</button></div>
    <p class="small muted" style="padding:6px 14px 0">Spam koruması: kısa sürede çok arama yapan ya da yeni açılmış hesaplar otomatik engellenir.</p>
    <div class="section-t">Bağlantılar</div>
    <a class="list-row" href="#/requests">${I.users}<div class="grow">Takip istekleri<small>${reqs.length ? reqs.length + ' bekleyen istek' : 'Bekleyen istek yok'}</small></div></a>
    <a class="list-row" href="#/blocked">${I.ban}<div class="grow">Engellenen hesaplar<small>${blocked.length ? blocked.length + ' hesap' : 'Kimseyi engellemedin'}</small></div></a>`;
  const dmSeg = () => $$('#pDm button').forEach((b) => b.classList.toggle('on', b.dataset.v === (p.dm_policy || 'everyone')));
  dmSeg();
  const save = async (patch, msg) => {
    try {
      Object.assign(p, await A.setPrivacy(patch));
      meP = p;
      toast(msg);
    } catch (er) {
      toast(er.message, true);
      route();
    }
  };
  $('#pPriv').onchange = (e) => save({ private: e.target.checked }, e.target.checked ? 'Hesabın artık gizli' : 'Hesabın artık herkese açık');
  $('#pLikes').onchange = (e) => save({ hide_likes: e.target.checked }, 'Kaydedildi');
  $('#pDm').onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    p.dm_policy = b.dataset.v;
    dmSeg();
    save({ dm_policy: b.dataset.v }, 'Mesaj izni kaydedildi');
  };
  const cSeg = () => $$('#pCallP button').forEach((b) => b.classList.toggle('on', b.dataset.v === (p.call_policy || 'everyone')));
  cSeg();
  $('#pCallP').onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    p.call_policy = b.dataset.v;
    cSeg();
    save({ call_policy: b.dataset.v }, 'Arama izni kaydedildi');
  };
}
async function vRequests(_a, _b, tok) {
  const reqs = await A.incomingRequests();
  if (stale(tok)) return;
  app.innerHTML = `${topbar('Takip istekleri', true)}<div id="rq">${
    reqs.length
      ? reqs.map((r) => `<div class="list-row" data-r="${r.id}"><a href="#/u/${esc(r.user.username)}">${avatar(r.user, 44)}</a><div class="grow">${uname(r.user)}<small>${esc(r.user.name)}</small></div><button class="btn sm" data-ok>Onayla</button><button class="btn sm gray" data-no>Sil</button></div>`).join('')
      : `<div class="empty"><div class="ico">${I.users}</div><h3>İstek yok</h3><p>Hesabın gizliyken seni takip etmek isteyenler burada görünür.</p></div>`
  }</div>`;
  $('#rq').onclick = async (e) => {
    const row = e.target.closest('[data-r]');
    if (!row) return;
    const r = reqs.find((x) => x.id === row.dataset.r);
    try {
      if (e.target.closest('[data-ok]')) {
        await A.acceptRequest(r);
        toast(`@${r.user.username} artık seni takip ediyor`);
      } else if (e.target.closest('[data-no]')) await A.declineRequest(r);
      else return;
      row.remove();
    } catch (er) {
      toast(er.message, true);
    }
  };
}
async function vBlocked(_a, _b, tok) {
  const list = await A.blockedUsers();
  if (stale(tok)) return;
  app.innerHTML = `${topbar('Engellenen hesaplar', true)}<div id="bl">${
    list.length
      ? list.map((u) => `<div class="list-row" data-u="${u.id}">${avatar(u, 44)}<div class="grow">${uname(u)}<small>${esc(u.name)}</small></div><button class="btn sm gray">Engeli kaldır</button></div>`).join('')
      : `<div class="empty"><div class="ico">${I.ban}</div><h3>Engellenen yok</h3><p>Engellediğin kişiler seni bulamaz, gönderilerini göremez ve sana yazamaz.</p></div>`
  }</div>`;
  $('#bl').onclick = async (e) => {
    const row = e.target.closest('[data-u]');
    if (!row || !e.target.closest('button')) return;
    await A.unblockUser(row.dataset.u);
    row.remove();
    toast('Engel kaldırıldı');
  };
}

/* =========================================================
   Mavi tik başvurusu: ad, doğum tarihi (18+), yüz fotoğrafı
   ========================================================= */
async function vVerify(_a, _b, tok) {
  if (meP.verified) return renderMsg('Hesabın onaylı', 'Zaten mavi tikin var.', true);
  const mine = await A.db.list('verify_requests', { eq: { user_id: A.me() }, order: ['created_at', false], limit: 1 }).catch(() => []);
  if (stale(tok)) return;
  if (mine[0]?.status === 'open') return renderMsg('Başvurun inceleniyor', 'Yöneticiler başvurunu inceliyor. Sonuç bildirim olarak gelecek.', true);
  let selfie = null;
  let stream = null;
  app.innerHTML = `${topbar('Mavi tik başvurusu', true)}<div class="create">
    <p class="muted">Mavi tik, hesabın gerçekten sana ait olduğunu gösterir. Yaşını ve kimliğini doğrulamak için bir <b>yüz fotoğrafı</b> çek. Fotoğraf sadece yöneticilere görünür ve karar verildikten sonra silinir.</p>
    ${mine[0]?.status === 'rejected' ? `<div class="ban-reason"><small>Önceki başvuru reddedildi</small><div>${esc(mine[0].reject_reason || 'Sebep belirtilmedi')}</div></div>` : ''}
    <label class="small muted">Ad soyad (kimlikteki gibi)</label><input class="field" id="vName" maxlength="60" value="${esc(meP.name)}">
    <label class="small muted">Doğum tarihi (en az ${A.VERIFY_MIN_AGE} yaş)</label><input class="field" id="vBirth" type="date" max="${new Date().toISOString().slice(0, 10)}">
    <label class="small muted">Yüz fotoğrafı</label>
    <div class="selfie" id="selfie"><div class="selfie-guide"></div><span class="muted small" id="sHint">Yüzün ortadaki çerçevede, iyi ışıkta ve aksesuarsız olsun.</span></div>
    <div class="prof-btns" style="margin-top:0"><button class="btn" id="sCam">${ic('camera')} Kamerayla çek</button><button class="btn gray" id="sPick">${ic('image')} Galeriden seç</button></div>
    <label class="small muted">Neden onaylanmalısın? (isteğe bağlı)</label><textarea class="field" id="vNote" maxlength="300" placeholder="ör. içerik üreticisiyim, tanınan bir kişiyim..."></textarea>
    <label class="check"><input type="checkbox" id="vOk"> Bilgilerimin doğru olduğunu ve yüz fotoğrafımın doğrulama için yöneticilerce görülmesini kabul ediyorum (<a href="#/legal/gizlilik-politikasi">Gizlilik Politikası</a>).</label>
    <button class="btn block" id="vSend">Başvur</button></div>`;
  const box = $('#selfie');
  const showSel = (blob) => {
    selfie = blob;
    box.innerHTML = `<img src="${URL.createObjectURL(blob)}">`;
  };
  const stop = () => stream && stream.getTracks().forEach((t) => t.stop());
  $('#sPick').onclick = async () => {
    stop();
    const f = await pickFile('image/*');
    if (f) showSel(f);
  };
  $('#sCam').onclick = async () => {
    if (stream) {
      // fotoğrafı çek
      const v = $('video', box);
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const g = c.getContext('2d');
      g.translate(c.width, 0);
      g.scale(-1, 1);
      g.drawImage(v, 0, 0);
      stop();
      stream = null;
      $('#sCam').innerHTML = `${ic('camera')} Yeniden çek`;
      c.toBlob((b) => b && showSel(b), 'image/jpeg', 0.9);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 } }, audio: false });
    } catch {
      return toast('Kameraya erişilemedi. İzin ver ya da galeriden seç.', true);
    }
    box.innerHTML = `<video autoplay playsinline muted style="transform:scaleX(-1)"></video><div class="selfie-guide"></div>`;
    $('video', box).srcObject = stream;
    $('#sCam').innerHTML = `${ic('camera')} Fotoğrafı çek`;
  };
  $('#vSend').onclick = async () => {
    const fullName = $('#vName').value.trim();
    const birthDate = $('#vBirth').value;
    if (fullName.length < 3) return toast('Ad soyad yaz', true);
    if (!birthDate) return toast('Doğum tarihini seç', true);
    if (!selfie) return toast('Yüz fotoğrafı çek ya da seç', true);
    if (!$('#vOk').checked) return toast('Onay kutusunu işaretle', true);
    $('#vSend').disabled = true;
    $('#vSend').textContent = 'Gönderiliyor...';
    try {
      await A.requestVerify({ fullName, birthDate, selfie, note: $('#vNote').value.trim() });
      stop();
      toast('Başvurun alındı, yöneticiler inceleyecek');
      location.hash = '#/settings';
    } catch (er) {
      toast(er.message, true);
      $('#vSend').disabled = false;
      $('#vSend').textContent = 'Başvur';
    }
  };
  const myTok = tok;
  const watch = setInterval(() => {
    if (stale(myTok)) {
      stop();
      clearInterval(watch);
    }
  }, 500);
}

/* =========================================================
   Sözleşmeler (uygulama içinde) ve hesap silme
   ========================================================= */
const LEGAL = [
  ['gizlilik-politikasi', 'Gizlilik Politikası'],
  ['kullanim-kosullari', 'Kullanım Koşulları'],
  ['topluluk-kurallari', 'Topluluk Kuralları'],
  ['cocuk-guvenligi', 'Çocuk Güvenliği Standartları'],
  ['hesap-silme', 'Hesap ve Veri Silme'],
];
async function vLegal(doc, _b, tok) {
  if (!doc) {
    app.innerHTML = `${topbar('Sözleşmeler ve kurallar', true)}${LEGAL.map(([k, t]) => `<a class="list-row" href="#/legal/${k}">${I.bookmark}<div class="grow">${t}</div></a>`).join('')}`;
    return;
  }
  const t = (LEGAL.find((x) => x[0] === doc) || [doc, 'Belge'])[1];
  app.innerHTML = `${topbar(esc(t), true)}<div class="legal" id="lg"><div class="spin" style="margin:40px auto"></div></div>`;
  try {
    const html = await fetch(`legal/${doc}.html`, { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : Promise.reject()));
    if (stale(tok)) return;
    const m = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    $('#lg').innerHTML = (m ? m[1] : html).replace(/href="([a-z-]+)\.html"/g, 'href="#/legal/$1"');
  } catch {
    $('#lg').innerHTML = '<p class="muted">Belge yüklenemedi.</p>';
  }
}
function deleteAccountFlow() {
  if (A.isOwnerP(meP)) return toast('Kurucu hesabı silinemez. Önce başka birini kurucu yapman gerekir.', true);
  sheet(`<h3>Hesabını sil</h3><div class="inner form"><p class="muted small">Hesabın, gönderilerin, reels ve hikâyelerin, yorumların, beğenilerin, mesajların ve takip bilgilerin <b>kalıcı olarak silinir</b>. Bu işlem geri alınamaz.</p>
    <input class="field" id="dConfirm" placeholder='Onaylamak için "SİL" yaz' autocapitalize="characters">
    <button class="btn block red" id="dGo">Hesabımı kalıcı olarak sil</button><button class="btn block gray" id="dNo">Vazgeç</button></div>`, (c, close) => {
    $('#dNo', c).onclick = close;
    $('#dGo', c).onclick = async () => {
      if ($('#dConfirm', c).value.trim().toLocaleUpperCase('tr-TR') !== 'SİL') return toast('"SİL" yaz', true);
      $('#dGo', c).disabled = true;
      try {
        await A.deleteMyAccount();
        close();
        toast('Hesabın silindi');
      } catch (er) {
        toast(er.message, true);
        $('#dGo', c).disabled = false;
      }
    };
  });
}

/* =========================================================
   Web sürümü: otomatik güncelleme
   Site her açılışta ve birkaç dakikada bir version.json'a bakar; yeni sürüm
   yayınlandıysa sayfayı kendiliğinden yeniler. (APK kendi güncelleyicisini kullanır.)
   ========================================================= */
let webVersion = null;
async function checkWebUpdate() {
  if (window.KankaAndroid || location.hostname === 'appassets.androidplatform.net') return;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const v = (await r.json()).v;
    if (!v) return;
    if (webVersion === null) webVersion = v;
    else if (v !== webVersion) {
      const busy = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
      if (busy || $('.ed')) return; // yazarken ya da düzenleyicideyken bölme
      toast('Yeni sürüm yükleniyor...');
      if (navigator.serviceWorker) (await navigator.serviceWorker.getRegistrations()).forEach((x) => x.update());
      setTimeout(() => location.reload(), 800);
    }
  } catch {
    /* çevrimdışı */
  }
}
checkWebUpdate();
setInterval(checkWebUpdate, 3 * 60 * 1000);
document.addEventListener('visibilitychange', () => !document.hidden && checkWebUpdate());

/* ---------- Android geri tuşu ---------- */
window.__androidBack = () => {
  if (window.__editorBack) return window.__editorBack();
  if (Calls.inCall()) return true;
  if (Live.liveBack()) return true;
  if (window.__onceClose && document.querySelector('.once-view')) {
    window.__onceClose();
    return true;
  }
  if (!$('#sheet').classList.contains('hidden')) {
    closeSheet();
    return true;
  }
  const h = location.hash;
  if (h === '#/home' || h === '#/login' || !h) return false;
  history.back();
  return true;
};

boot().catch((e) => {
  app.innerHTML = `<div class="empty"><h3>Uygulama açılamadı</h3><p>${esc(e.message || e)}</p></div>`;
});
