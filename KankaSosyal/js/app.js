// =========================================================
// app.js — Kanka: yönlendirme ve ekranlar (ana sayfa, reels, keşfet, paylaş,
// profil, gönderi + yorumlar, hikâye, DM, bildirimler, ayarlar, giriş/kayıt)
// =========================================================
import * as A from './api.js';
import { $, $$, esc, I, ic, TICK, avatar, uname, ago, num, toast, sheet, closeSheet, confirmSheet, promptSheet, pickFile, hydrate, mediaTag, autoplay, linkify } from './ui.js';
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
async function boot() {
  await A.initDb();
  // Eski sürümün oluşturduğu deneme hesaplarını ve içeriklerini tamamen kaldır
  if (A.db.mode === 'local' && A.db.hasDemo()) await A.db.clearDemo();
  if (A.db.serverError) toast('Sunucuya bağlanılamadı, yerel moddasın: ' + A.db.serverError, true);
  A.db.onAuth(async () => {
    A.clearCache();
    meP = A.me() ? await A.profile(A.me(), true) : null;
    location.hash = A.me() ? '#/home' : '#/login';
    route();
  });
  if (A.me()) meP = await A.profile(A.me(), true);
  window.addEventListener('hashchange', route);
  if (!location.hash || location.hash === '#/') location.hash = A.me() ? '#/home' : '#/login';
  route();
  setInterval(refreshBadges, 15000);
}

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
  app.classList.toggle('fullscreen', page === 'reels' || page === 'story');
  document.body.style.overflow = page === 'reels' ? 'hidden' : '';
  showTabs(!authPages.includes(page) && page !== 'story' && !(page === 'dm' && a) && page !== 'p', page);
  window.scrollTo(0, 0);
  try {
    const views = { login: vLogin, signup: vSignup, server: vServer, home: vHome, search: vSearch, create: vCreate, reels: vReels, u: vProfile, p: vPost, story: vStory, dm: a ? vChat : vInbox, notifs: vNotifs, settings: vSettings, edit: vEdit, follows: vFollows, admin: vAdmin, privacy: vPrivacy, requests: vRequests, blocked: vBlocked, verify: vVerify, legal: vLegal };
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
async function refreshBadges() {
  if (!A.me() || badgeBusy) return;
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
function vSignup() {
  app.innerHTML = `<div class="auth"><div class="logo">Kanka</div><p class="alt" style="margin-top:-12px">Arkadaşlarının fotoğraf ve videolarını görmek için kaydol.</p>
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
function postHtml(p) {
  const key = p.feedKey || p.id;
  return `<article class="post" data-k="${esc(key)}">
    ${p.reposter ? `<div class="rp-line">${I.repost}<a href="#/u/${esc(p.reposter.username)}">${esc(p.reposter.username)}</a> repost etti</div>` : ''}
    ${p.suggested ? `<div class="sugg">Senin için önerilen</div>` : ''}
    <div class="post-head"><a href="#/u/${esc(p.author.username)}">${avatar(p.author, 34)}</a>
      <a class="who" href="#/u/${esc(p.author.username)}">${uname(p.author)}${p.meta?.location ? `<span class="post-loc">${esc(p.meta.location)}</span>` : `<small>${ago(p.created_at, true)}</small>`}</a>
      <button class="ibtn" data-a="more">${I.dots}</button></div>
    <div class="media" data-a="dbl" ${vigStyle(p.meta)}>${mediaTag(p.media, p.kind, '', p.kind === 'video' ? 'data-auto ' + vidAttrs(p.meta) : '')}${p.kind === 'video' ? overlayHtml(p.meta) : ''}<div class="heart-pop">${I.heartFill}</div>${p.kind === 'video' ? `<button class="mute" data-a="mute">${I.mute}</button>` : ''}</div>
    <div class="acts"><button class="act ${p.liked ? 'on-like' : ''}" data-a="like">${I.heart}<span>${p.hideLikes ? '' : num(p.likeCount)}</span></button>
      <a class="act" href="#/p/${p.id}">${I.comment}<span>${num(p.commentCount)}</span></a>
      ${p.author.private ? '' : `<button class="act ${p.reposted ? 'on-rp' : ''}" data-a="repost">${I.repost}<span>${num(p.repostCount)}</span></button>`}
      <button class="act" data-a="share">${I.send}</button></div>
    ${p.caption ? `<div class="cap"><b>${esc(p.author.username)}</b>${linkify(p.caption)}</div>` : ''}
    ${p.commentCount ? `<a class="vc" href="#/p/${p.id}">${p.commentCount} yorumun tümünü gör</a>` : ''}
  </article>`;
}

/** Gönderi listesindeki butonları bağla. */
function bindPosts(root, list, onRemoved) {
  const find = (el) => list.find((p) => (p.feedKey || p.id) === el.closest('[data-k]')?.dataset.k);
  root.onclick = async (e) => {
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
    if (a === 'more') postMenu(p, () => onRemoved?.(p));
    if (a === 'mute') {
      e.stopPropagation();
      const v = $('video', b.parentElement);
      v.muted = !v.muted;
      b.innerHTML = v.muted ? I.mute : I.sound;
    }
  };
  // çift dokunuşla beğen
  let lastTap = 0;
  root.addEventListener('pointerup', (e) => {
    const m = e.target.closest('[data-a="dbl"]');
    if (!m || e.target.closest('.mute')) return;
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

function postMenu(p, onRemoved) {
  const mine = p.user_id === A.me();
  const admin = A.isAdminP(meP);
  const opts = [];
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
  const [groups, items, ann] = await Promise.all([A.storyGroups(), A.feed(homeMode), A.activeAnnouncements()]);
  if (stale(tok)) return;
  $('#ann').innerHTML = restrictBanner(A.banState(meP)) + ann.map((x) => `<div class="announce">${ic('megaphone', 18)}<span>${linkify(x.text)}</span></div>`).join('');
  if ($('#rBanner')) $('#rBanner').onclick = () => ((restrictShown = false), restrictNotice(A.banState(meP)));
  if (A.db.mode === 'local') $('#ann').insertAdjacentHTML('afterbegin', `<a class="announce" href="#/server" style="border-color:#5a1a22;background:#1a0a0d">${ic('device', 18)}<span><b>Sunucuya bağlı değilsin.</b> Arkadaşlarını göremezsin. Ayrıntı için dokun.</span></a>`);
  const mine = groups.find((g) => g.user.id === A.me());
  $('#stories').innerHTML =
    `<a class="st" href="${mine ? '#/story/' + A.me() : '#/create/story'}"><span class="wrap">${avatar(meP, 62, mine ? (mine.allSeen ? 'seen' : 'new') : '')}${mine ? '' : '<span class="plus">+</span>'}</span><span>Hikâyen</span></a>` +
    groups
      .filter((g) => g.user.id !== A.me())
      .map((g) => `<a class="st" href="#/story/${g.user.id}">${avatar(g.user, 62, g.allSeen ? 'seen' : 'new')}<span>${esc(g.user.username)}</span></a>`)
      .join('');
  const feed = $('#feed');
  if (!items.length) {
    feed.innerHTML = `<div class="empty"><div class="ico">${I.camera}</div><h3>Henüz gönderi yok</h3><p>İlk fotoğrafını ya da videonu paylaş, arkadaşlarını takip et.</p><a class="btn" href="#/create">Paylaş</a> <a class="btn gray" href="#/search">Kişi bul</a></div>`;
    return;
  }
  feed.innerHTML = items.map(postHtml).join('');
  bindPosts(feed, items, () => route());
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
          if (!timers.has(k)) timers.set(k, setTimeout(() => A.markSeen(items.find((p) => (p.feedKey || p.id) === k)?.id || k), 1000));
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
   Keşfet / arama
   ========================================================= */
async function vSearch(_a, _b, tok) {
  app.innerHTML = `<div class="topbar"><div class="search" style="flex:1;margin:0">${I.search}<input id="q" placeholder="Ara" autocomplete="off"></div></div><div id="res"></div>`;
  const res = $('#res');
  const showExplore = async () => {
    const posts = await A.explore();
    if (stale(tok)) return;
    res.innerHTML = posts.length ? `<div class="grid3">${posts.map((p) => `<a class="cell" href="#/p/${p.id}">${mediaTag(p.media, p.kind)}${p.kind === 'video' ? `<span class="badge">${I.play}</span>` : ''}</a>`).join('')}</div>` : '<div class="empty">Keşfedecek bir şey yok henüz.</div>';
    hydrate(res);
  };
  let t = null;
  $('#q').oninput = (e) => {
    clearTimeout(t);
    const q = e.target.value.trim().replace(/^@/, '');
    t = setTimeout(async () => {
      if (!q) return showExplore();
      const users = await A.searchUsers(q);
      res.innerHTML = users.length ? users.map((u) => `<a class="list-row" href="#/u/${esc(u.username)}">${avatar(u, 44)}<div class="grow">${uname(u)}<small>${esc(u.name)}</small></div></a>`).join('') : '<div class="empty">Kimse bulunamadı.</div>';
      hydrate(res);
    }, 250);
  };
  await showExplore();
}

/* =========================================================
   Paylaş (gönderi / hikâye / reels)
   ========================================================= */
async function vCreate(kind = 'post') {
  let mode = kind === 'story' ? 'story' : kind === 'reel' ? 'reel' : 'post';
  let file = null;
  let ed = null; // düzenleyici sonucu
  app.innerHTML = `${topbar('Yeni paylaşım', true, '<button class="btn sm" id="share" disabled>Paylaş</button>')}<div class="create">
    <div class="seg" id="seg"><button data-m="post">Gönderi</button><button data-m="story">Hikâye</button><button data-m="reel">Reels</button></div>
    <button class="pick" id="pick">${I.image}<span id="pickTxt"></span></button>
    <button class="btn block gray hidden" id="reedit">${ic('pen')} Düzenle (yazı, çıkartma, çizim, filtre)</button>
    <textarea class="field" id="cap" placeholder="Açıklama yaz... (@kullanıcı, #etiket)" maxlength="2200"></textarea>
    <input class="field" id="loc" placeholder="Konum ekle (isteğe bağlı)" maxlength="60">
    <p class="small muted" id="hint"></p></div>`;
  const seg = () => {
    $$('#seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    if ($('#pickTxt')) $('#pickTxt').textContent = mode === 'reel' ? 'Video seç (dikey video önerilir)' : 'Fotoğraf ya da video seç';
    $('#cap').classList.toggle('hidden', mode === 'story');
    $('#loc').classList.toggle('hidden', mode === 'story');
    $('#hint').textContent = mode === 'story' ? 'Hikâyeler 24 saat sonra kaybolur.' : mode === 'reel' ? 'Reels sekmesinde tam ekran, kaydırmalı görünür.' : '';
  };
  const aspectCss = (a) => (a === '1:1' ? '1' : a === '16:9' ? '16 / 9' : a === '9:16' ? '9 / 16' : a === 'orig' ? 'auto' : '4 / 5');
  const showPreview = () => {
    const pick = $('#pick');
    pick.style.aspectRatio = aspectCss(ed.meta.aspect);
    pick.style.position = 'relative';
    pick.style.containerType = 'inline-size';
    pick.innerHTML =
      ed.kind === 'video'
        ? `<video src="${ed.preview}" autoplay muted loop playsinline style="filter:${ed.meta.filter || 'none'}"></video>${ed.drawingBlob ? `<img class="ovl-draw" src="${URL.createObjectURL(ed.drawingBlob)}" style="position:absolute;inset:0;width:100%;height:100%">` : ''}${overlayHtml({ layers: ed.meta.layers })}`
        : `<img src="${ed.preview}">`;
    $('#reedit').classList.remove('hidden');
    $('#share').disabled = false;
  };
  const edit = async () => {
    const r = await openEditor(file, mode, ed?.state || null);
    if (r) {
      ed = r;
      showPreview();
    }
  };
  const clearPick = () => {
    file = null;
    ed = null;
    $('#pick').innerHTML = `${I.image}<span id="pickTxt"></span>`;
    $('#pick').style.aspectRatio = '';
    $('#reedit').classList.add('hidden');
    $('#share').disabled = true;
  };
  seg();
  $('#seg').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.m === mode) return;
    mode = b.dataset.m;
    if (file && (mode !== 'reel' || file.type.startsWith('video/'))) {
      // oran değişti: yeniden düzenle
      if (ed) ed.state.aspect = mode === 'post' ? '4:5' : '9:16';
      seg();
      edit();
    } else {
      clearPick();
      seg();
    }
  };
  $('#pick').onclick = async () => {
    const f = await pickFile(mode === 'reel' ? 'video/*' : 'image/*,video/*');
    if (!f) return;
    if (mode === 'reel' && !f.type.startsWith('video/')) return toast('Reels için video seç', true);
    file = f;
    ed = null;
    await edit();
  };
  $('#reedit').onclick = edit;
  $('#share').onclick = async () => {
    if (!file || !ed) return;
    const btn = $('#share');
    btn.disabled = true;
    btn.textContent = 'Yükleniyor...';
    const meta = { ...ed.meta };
    if (ed.kind === 'photo') delete meta.layers;
    const loc = $('#loc').value.trim();
    if (loc && mode !== 'story') meta.location = loc;
    try {
      if (mode === 'story') {
        await A.addStory(ed.blob, meta, ed.drawingBlob);
        toast('Hikâyen paylaşıldı');
        location.hash = '#/home';
      } else {
        await A.createPost({ file: ed.blob, caption: $('#cap').value.trim(), meta, drawingBlob: ed.drawingBlob });
        toast('Paylaşıldı');
        location.hash = mode === 'reel' ? '#/reels' : '#/home';
      }
      if (A.metaMissing && A.isAdminP(meP)) toast('Sunucuda güncelleme gerekiyor: supabase/guncelleme-1.sql dosyasını çalıştır', true);
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
  let list = await A.reels();
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
      (p) => `<section class="reel" data-k="${p.id}" ${vigStyle(p.meta)}>${mediaTag(p.media, 'video', '', 'data-reel ' + vidAttrs(p.meta) + (p.meta?.muted ? ' data-mute' : ''))}${overlayHtml(p.meta)}<div class="shade"></div><div class="paused hidden">${I.play}</div>
    <div class="side"><button class="act ${p.liked ? 'on-like' : ''}" data-a="like">${I.heart}<span>${num(p.likeCount)}</span></button>
      <a class="act" href="#/p/${p.id}">${I.comment}<span>${num(p.commentCount)}</span></a>
      <button class="act ${p.reposted ? 'on-rp' : ''}" data-a="repost">${I.repost}<span>${num(p.repostCount)}</span></button>
      <button class="act" data-a="share">${I.send}</button><button class="act" data-a="more">${I.dots}</button></div>
    <div class="info"><div class="who"><a href="#/u/${esc(p.author.username)}">${avatar(p.author, 32)}</a><a href="#/u/${esc(p.author.username)}">${uname(p.author)}</a>
      ${p.user_id !== A.me() && !fol.has(p.user_id) ? `<button class="fbtn" data-a="follow">Takip et</button>` : ''}</div>
      ${p.caption ? `<div>${linkify(p.caption)}</div>` : ''}</div></section>`
    )
    .join('');
  hydrate(box);
  const vids = $$('video', box);
  vids.forEach((v) => {
    v.muted = v.hasAttribute('data-mute');
    v.loop = true;
  });
  const io = new IntersectionObserver(
    (ents) => {
      for (const e of ents) {
        const v = e.target;
        if (e.isIntersecting && e.intersectionRatio > 0.7) {
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
  const [st, fstate, groups, v] = await Promise.all([A.stats(u.id), A.followState(u.id), A.storyGroups(), A.viewer()]);
  if (stale(tok)) return;
  const iBlocked = v.blocked.has(u.id);
  const locked = !mine && !admin && (iBlocked || v.blockedMe.has(u.id) || (u.private && fstate !== 'following'));
  const bs = A.banState(u);
  const fLabel = { following: 'Takip ediliyor', requested: 'İstek gönderildi', none: 'Takip et', self: '' };
  const g = groups.find((x) => x.user.id === u.id);
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
        ? `<a class="btn gray" href="#/edit">Profili düzenle</a><a class="btn gray" href="#/settings">Ayarlar</a>`
        : iBlocked
          ? `<button class="btn gray" id="unb">Engeli kaldır</button>`
          : `<button class="btn ${fstate === 'none' ? '' : 'gray'}" id="fol">${fLabel[fstate]}</button><button class="btn gray" id="msg">Mesaj</button>`
    }</div>
    ${mine && admin ? `<div class="prof-btns"><a class="btn green" href="#/admin">${I.shield} Yönetim paneli</a></div>` : ''}
  </div>
  <div class="tabs2"><button data-t="posts" class="${tab === 'posts' ? 'on' : ''}">${I.grid}</button><button data-t="reels" class="${tab === 'reels' ? 'on' : ''}">${I.reels}</button><button data-t="reposts" class="${tab === 'reposts' ? 'on' : ''}">${I.repost}</button></div>
  <div id="pgrid"></div>`;
  $$('.tabs2 button').forEach((b) => (b.onclick = () => (location.hash = `#/u/${encodeURIComponent(u.username)}/${b.dataset.t}`)));
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
  const posts = tab === 'reposts' ? await A.userReposts(u.id) : (await A.userPosts(u.id)).filter((p) => tab !== 'reels' || p.kind === 'video');
  if (stale(tok)) return;
  $('#pgrid').innerHTML = posts.length
    ? `<div class="grid3">${posts.map((p) => `<a class="cell ${tab === 'reels' ? 'tall' : ''}" href="${tab === 'reels' ? '#/reels/' + p.id : '#/p/' + p.id}">${mediaTag(p.media, p.kind)}${p.kind === 'video' && tab !== 'reels' ? `<span class="badge">${I.play}</span>` : ''}</a>`).join('')}</div>`
    : `<div class="empty"><div class="ico">${tab === 'reposts' ? I.repost : I.camera}</div><h3>${tab === 'reposts' ? 'Repost yok' : tab === 'reels' ? 'Reels yok' : 'Henüz gönderi yok'}</h3></div>`;
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
   Hikâye görüntüleyici
   ========================================================= */
async function vStory(uid, _b, tok) {
  const groups = await A.storyGroups();
  if (stale(tok)) return;
  let gi = groups.findIndex((g) => g.user.id === uid);
  if (gi < 0) return (location.hash = '#/home');
  let si = 0;
  let timer = null;
  let t0 = 0;
  let dur = 5000;
  let paused = false;
  const g0 = groups[gi];
  si = Math.max(0, g0.stories.findIndex((s) => !s.seen));
  const render = async () => {
    clearInterval(timer);
    const g = groups[gi];
    const s = g.stories[si];
    const mine = g.user.id === A.me();
    app.innerHTML = `<div class="story-view"><div class="bars">${g.stories.map((_, i) => `<i><b style="width:${i < si ? 100 : 0}%"></b></i>`).join('')}</div>
      <div class="shead">${avatar(g.user, 32)}${uname(g.user)}<span class="muted small">${ago(s.created_at)}</span><span style="flex:1"></span><button class="ibtn" id="sMore">${I.dots}</button><button class="ibtn" id="sX">${I.close}</button></div>
      <div class="stage">${s.kind === 'video' ? `<video data-m="${esc(s.media)}" autoplay playsinline ${s.meta?.muted ? 'muted' : ''} ${vidAttrs(s.meta)}></video>${overlayHtml(s.meta)}` : `<img data-m="${esc(s.media)}">`}</div>
      <div class="tapL"></div><div class="tapR"></div>
      <div class="sfoot">${mine ? `<button class="btn gray" id="sViews">${ic('eye')} Görenler</button>` : `<input id="sRep" placeholder="Yanıt gönder..."><button class="ibtn" id="sLike">${I.heart}</button><button class="ibtn" id="sSend">${I.send}</button>`}</div></div>`;
    hydrate(app);
    A.markStorySeen(s);
    const bar = $$('.bars b')[si];
    const v = $('video', app);
    dur = 5000;
    if (v) v.onloadedmetadata = () => (dur = Math.min(60000, (v.duration || 5) * 1000));
    t0 = performance.now();
    let el = 0;
    timer = setInterval(() => {
      if (paused) return (t0 = performance.now() - el);
      el = performance.now() - t0;
      bar.style.width = Math.min(100, (el / dur) * 100) + '%';
      if (el >= dur) next();
    }, 50);
    $('#sX').onclick = () => {
      clearInterval(timer);
      history.length > 1 ? history.back() : (location.hash = '#/home');
    };
    $('.tapL').onclick = prevS;
    $('.tapR').onclick = next;
    const hold = (on) => {
      paused = on;
      if (v) on ? v.pause() : v.play().catch(() => {});
    };
    for (const z of [$('.tapL'), $('.tapR')]) {
      z.onpointerdown = () => hold(true);
      z.onpointerup = z.onpointerleave = () => hold(false);
    }
    $('#sMore').onclick = () => {
      hold(true);
      const opts = [];
      if (mine || A.isAdminP(meP)) opts.push({ icon: I.trash, label: 'Hikâyeyi sil', red: true, run: async () => (await A.deleteStory(s.id), toast('Silindi'), (location.hash = '#/home')) });
      if (!mine) opts.push({ icon: I.flag, label: 'Şikâyet et', red: true, run: () => reportFlow('story', s.id) });
      sheet(opts.length ? opts : [{ label: 'Kapat' }]);
      $('.sheet-bg').addEventListener('click', () => hold(false), { once: true });
    };
    if (mine) {
      $('#sViews').onclick = async () => {
        hold(true);
        const vs = await A.storyViewers(s.id);
        sheet(`<h3>Görenler (${vs.length})</h3>${vs.map((u) => `<a class="list-row" href="#/u/${esc(u.username)}">${avatar(u, 40)}<div class="grow">${uname(u)}</div></a>`).join('') || '<p class="inner muted">Henüz kimse görmedi.</p>'}`);
      };
    } else {
      const inp = $('#sRep');
      inp.onfocus = () => hold(true);
      inp.onblur = () => hold(false);
      const sendRep = async (text) => {
        if (!text) return;
        const c = await A.conversationWith(g.user.id);
        await A.sendMessage(c, { text: `Hikâyene yanıt: ${text}` });
        toast('Gönderildi');
        inp.value = '';
      };
      $('#sSend').onclick = () => sendRep(inp.value.trim());
      inp.onkeydown = (e) => e.key === 'Enter' && sendRep(inp.value.trim());
      $('#sLike').onclick = () => sendRep('Hikâyeni beğendi');
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
      return (location.hash = '#/home');
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
  const myTok = tok;
  const stop = setInterval(() => {
    if (stale(myTok)) {
      clearInterval(timer);
      clearInterval(stop);
    }
  }, 300);
}

/* =========================================================
   Mesajlar (DM)
   ========================================================= */
async function vInbox(_a, _b, tok) {
  app.innerHTML = `${topbar(esc(meP.username), true, `<button class="ibtn" id="newDm">${I.plus}</button>`)}<div class="search">${I.search}<input id="q" placeholder="Ara"></div><div class="section-t">Mesajlar</div><div id="convs"><div class="empty"><div class="spin" style="margin:auto"></div></div></div>`;
  const cs = await A.conversations();
  if (stale(tok)) return;
  const draw = (q = '') => {
    const l = cs.filter((c) => !q || c.other.username.includes(q) || (c.other.name || '').toLowerCase().includes(q));
    $('#convs').innerHTML = l.length
      ? l
          .map(
            (c) => `<a class="list-row" href="#/dm/${c.id}">${avatar(c.other, 52)}<div class="grow">${uname(c.other)}<small>${c.last ? (c.last.sender_id === A.me() ? 'Sen: ' : '') + esc(c.last.text || (c.last.media_kind === 'gif' ? 'GIF gönderdi' : 'Fotoğraf/video gönderdi')) + ' · ' + ago(c.last.created_at) : 'Sohbeti başlat'}</small></div></a>`
          )
          .join('')
      : `<div class="empty"><div class="ico">${I.send}</div><h3>Mesaj yok</h3><p>Bir arkadaşına özelden yaz.</p></div>`;
    hydrate($('#convs'));
  };
  draw();
  $('#q').oninput = (e) => draw(e.target.value.trim().toLowerCase());
  $('#newDm').onclick = () =>
    promptSheet('Yeni mesaj', 'Kullanıcı adı', async (u) => {
      const p = await A.byUsername(u.replace(/^@/, '').toLowerCase());
      if (!p) return toast('Kullanıcı bulunamadı', true);
      if (p.id === A.me()) return toast('Kendine mesaj atamazsın', true);
      const c = await A.conversationWith(p.id);
      location.hash = '#/dm/' + c.id;
    });
}

async function vChat(convId, _b, tok) {
  const conv = await A.db.get('conversations', convId);
  if (stale(tok)) return;
  if (!conv) return renderMsg('Sohbet bulunamadı', '', true);
  const other = await A.profile(conv.a === A.me() ? conv.b : conv.a);
  app.innerHTML = `${topbar(`<a href="#/u/${esc(other.username)}" style="display:flex;align-items:center;gap:8px">${avatar(other, 30)}${uname(other)}</a>`, true, `<button class="ibtn" id="cMore">${I.dots}</button>`)}<div class="chat pad-composer" id="chat"></div>
    <div class="composer" id="mcomp"><div class="preview hidden" id="prev"></div><div class="row"><button class="ibtn" id="mImg">${I.image}</button><button class="ibtn" id="mGif">${I.gif}</button><input type="text" id="mTxt" placeholder="Mesaj..." maxlength="2000"><button class="send" id="mSend">Gönder</button></div></div>`;
  const att = attachments($('#mcomp'), () => {});
  let msgs = [];
  let lastKey = '';
  const draw = () => {
    const box = $('#chat');
    if (!box) return;
    const key = msgs.map((m) => m.id).join();
    if (key === lastKey) return;
    lastKey = key;
    let prevT = 0;
    box.innerHTML = msgs.length
      ? msgs
          .map((m) => {
            const t = new Date(m.created_at).getTime();
            const stamp = t - prevT > 30 * 60 * 1000 ? `<div class="stamp">${new Date(m.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>` : '';
            prevT = t;
            const mine = m.sender_id === A.me();
            const link = (m.text || '').match(/#\/p\/([\w-]+)/);
            return (
              stamp +
              (m.media ? `<div class="bub media ${mine ? 'mine' : ''}" data-m-id="${m.id}">${mediaTag(m.media, m.media_kind === 'video' ? 'video' : 'photo', '', m.media_kind === 'video' ? 'controls' : '')}</div>` : '') +
              (m.text ? `<div class="bub ${mine ? 'mine' : ''}" data-m-id="${m.id}">${link ? `<a href="#/p/${link[1]}" style="text-decoration:underline">${esc(m.text)}</a>` : linkify(m.text)}</div>` : '')
            );
          })
          .join('')
      : `<div class="empty">${avatar(other, 80)}<h3>${esc(other.name || other.username)}</h3><p>@${esc(other.username)} ile sohbete başla</p></div>`;
    hydrate(box);
    window.scrollTo(0, document.body.scrollHeight);
  };
  const load = async () => {
    try {
      msgs = await A.messages(conv.id);
      draw();
    } catch {
      /* ağ hatası: sonra tekrar */
    }
  };
  await load();
  pollT = setInterval(load, 3000);
  const send = async () => {
    const text = $('#mTxt').value.trim();
    const a = att.get();
    if (!text && !a) return;
    $('#mTxt').value = '';
    att.clear();
    try {
      const m = await A.sendMessage(conv, { text, file: a?.file, gifUrl: a?.gifUrl });
      msgs.push(m);
      draw();
    } catch (er) {
      toast(er.message, true);
    }
  };
  $('#mSend').onclick = send;
  $('#mTxt').onkeydown = (e) => e.key === 'Enter' && send();
  $('#chat').addEventListener('contextmenu', (e) => e.preventDefault());
  let pressT = null;
  $('#chat').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-m-id]');
    if (!b) return;
    pressT = setTimeout(() => {
      const m = msgs.find((x) => x.id === b.dataset.mId);
      if (m && m.sender_id === A.me()) confirmSheet('Mesaj herkesten silinsin mi?', async () => (await A.deleteMessage(m.id), (lastKey = ''), load()), 'Sil');
    }, 550);
  });
  $('#chat').addEventListener('pointerup', () => clearTimeout(pressT));
  $('#cMore').onclick = () => sheet([{ icon: I.user, label: 'Profili gör', run: () => (location.hash = '#/u/' + other.username) }, { icon: I.flag, label: 'Kullanıcıyı şikâyet et', red: true, run: () => reportFlow('user', other.id) }]);
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
    verified: '',
    system: '',
  };
  $('#nl').innerHTML = reqRow + (ns.length
    ? ns
        .map((n) => {
          const p = posts.get(n.post_id);
          const href = n.post_id ? `#/p/${n.post_id}` : `#/u/${esc(n.actor.username)}`;
          return `<a class="list-row" href="${href}" style="${n.read ? '' : 'background:#0a0f1a'}">${avatar(n.actor, 44)}<div class="grow" style="white-space:normal">${n.type === 'verified' || n.type === 'system' ? `${TICK} ${esc(n.text)}` : `<b>${esc(n.actor.username)}</b> ${txt[n.type] || ''} ${esc(n.text || '')}`} <span class="muted small">${ago(n.created_at)}</span></div>${p ? `<span style="width:44px;height:44px;flex:none;overflow:hidden;border-radius:4px">${mediaTag(p.media, p.kind)}</span>` : ''}</a>`;
        })
        .join('')
    : `<div class="empty"><div class="ico">${I.heart}</div><h3>Bildirim yok</h3><p>Beğeniler, yorumlar ve yeni takipçiler burada görünür.</p></div>`);
  hydrate($('#nl'));
  A.markAllRead().then(refreshBadges);
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
    <a class="list-row" href="#/verify">${TICK}<div class="grow">Mavi tik başvurusu<small>${meP.verified ? 'Hesabın zaten onaylı' : 'Yüz fotoğrafı ve yaş doğrulaması ile'}</small></div></a>
    <a class="list-row" href="#/notifs">${I.bell}<div class="grow">Bildirimler</div></a>
    <button class="list-row" id="pw" style="width:100%;text-align:left">${I.gear}<div class="grow">Şifre değiştir</div></button>
    <a class="list-row" href="#/server">${I.globe}<div class="grow">Sunucu<small>${local ? 'Yerel mod (sadece bu cihaz)' : 'Ortak sunucuya bağlı'}</small></div></a>
    ${window.KankaAndroid && (!window.KankaAndroid.selfUpdate || window.KankaAndroid.selfUpdate()) ? `<button class="list-row" id="upd" style="width:100%;text-align:left">${I.reply}<div class="grow">Güncellemeleri denetle<small>Yüklü sürüm: ${window.KankaAndroid.version()}</small></div></button>` : ''}
    <a class="list-row" href="#/legal">${I.bookmark}<div class="grow">Sözleşmeler ve kurallar<small>Gizlilik, kullanım koşulları, topluluk kuralları</small></div></a>
    <button class="list-row" id="del" style="width:100%;text-align:left;color:#ff6b77">${I.trash}<div class="grow">Hesabımı sil</div></button>
    <button class="list-row" id="out" style="width:100%;text-align:left;color:#ff6b77">${I.close}<div class="grow">Çıkış yap</div></button>
    <p class="small muted" style="padding:14px">Kanka 1.0 · @${esc(meP.username)}</p>`;
  $('#del').onclick = deleteAccountFlow;
  $('#pw').onclick = () =>
    promptSheet('Yeni şifre', 'En az 6 karakter', async (pw) => {
      if (pw.length < 6) return toast('En az 6 karakter', true);
      await A.db.changePassword(pw);
      toast('Şifre değişti');
    });
  if ($('#upd')) $('#upd').onclick = () => window.KankaAndroid.checkUpdate();
  $('#out').onclick = () => confirmSheet('Çıkış yapılsın mı?', () => A.db.signOut(), 'Çıkış yap');
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
