// =========================================================
// api.js — Uygulama mantığı: profiller, gönderiler, beğeni, repost, yorum,
// takip, hikâye, DM, bildirim, şikâyet, mavi tik ve yönetim işlemleri.
// Alttaki veri katmanı (yerel ya da Supabase) bunu bilmez.
// =========================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createLocalDb } from './db-local.js';
import { interestPenalty } from './social.js';

const SERVER_KEY = 'kanka.server';
export const STORY_MS = 24 * 3600 * 1000;

export let db = null;
const profileCache = new Map();

const REMOTE_KEY = 'kanka.remote';
/** Herkesin otomatik bağlandığı ortak ayar dosyası (GitHub'da). Değişince yeni APK gerekmez. */
export const REMOTE_URL = 'https://raw.githubusercontent.com/canbey123x/pvphouselauncher/ccr-111fa307-9zbgth/KankaSosyal/server.json';

const valid = (s) => s && /^https:\/\/\S+$/.test(s.url || '') && (s.key || '').length >= 20 && !/^sb_secret_/.test(s.key);
function readLS(k) {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
}

/** Uzak ayar dosyasını oku (en fazla 4 sn), başarılıysa sakla. */
async function fetchRemote() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(REMOTE_URL + '?t=' + Date.now(), { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok) return;
    const j = await r.json();
    // sesli arama için TURN sunucusu bilgisi adresi (isteğe bağlı)
    if (typeof j.turn === 'string' && /^https:\/\/\S+$/.test(j.turn)) localStorage.setItem('kanka.turn', JSON.stringify(j.turn));
    else localStorage.removeItem('kanka.turn');
    if (valid(j)) localStorage.setItem(REMOTE_KEY, JSON.stringify({ url: j.url.trim().replace(/\/$/, ''), key: j.key.trim() }));
    else localStorage.removeItem(REMOTE_KEY);
  } catch {
    /* internet yok: son bilinen ayar kullanılır */
  }
}

/** Öncelik: elle girilen > ortak ayar dosyası > uygulamaya gömülü (config.js). */
export function serverConfig() {
  const manual = readLS(SERVER_KEY);
  if (valid(manual)) return { ...manual, source: 'manual' };
  const remote = readLS(REMOTE_KEY);
  if (valid(remote)) return { ...remote, source: 'remote' };
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, source: 'builtin' };
  return null;
}
export function setServerConfig(cfg) {
  if (cfg) localStorage.setItem(SERVER_KEY, JSON.stringify({ url: cfg.url, key: cfg.key }));
  else localStorage.removeItem(SERVER_KEY);
}

export async function initDb() {
  // ilk açılışta ayar yoksa ortak dosyayı bekle; varsa arka planda tazele
  if (!serverConfig()) await fetchRemote();
  else fetchRemote();
  const cfg = serverConfig();
  if (cfg) {
    try {
      const { createSupabaseDb } = await import('./db-supabase.js');
      db = await createSupabaseDb(cfg.url, cfg.key);
      return db;
    } catch (e) {
      console.warn('Sunucuya bağlanılamadı, yerel moda geçiliyor', e);
      db = await createLocalDb();
      db.serverError = e.message || String(e);
      return db;
    }
  }
  db = await createLocalDb();
  return db;
}

export const me = () => db.userId();

/* ---------- Roller ve hesap durumu ---------- */
export const isAdminP = (p) => !!p && (p.role === 'admin' || p.role === 'owner');
export const isOwnerP = (p) => !!p && p.role === 'owner';
/** Yasak / kısıtlama şu an geçerli mi? (süresi dolmuşsa geçersiz) */
export function banState(p) {
  const now = Date.now();
  const live = (on, until) => !!on && (!until || new Date(until).getTime() > now);
  return {
    banned: live(p?.banned, p?.banned_until),
    restricted: live(p?.restricted, p?.restricted_until),
    banReason: p?.ban_reason || '',
    banUntil: p?.banned_until || null,
    restrictReason: p?.restrict_reason || '',
    restrictUntil: p?.restricted_until || null,
  };
}
export async function assertActive() {
  const p = await profile(me(), true);
  const b = banState(p);
  if (b.banned) throw new Error('Hesabın yasaklandı.');
  if (b.restricted) throw new Error('Hesabın kısıtlandı: şu an paylaşım, yorum, beğeni, takip ve mesaj yapamazsın.');
}
/** Sunucunun güvenlik kuralı reddederse anlaşılır mesaj ver. */
export function friendly(e, fallback) {
  const m = e?.message || String(e);
  if (/row-level security|violates|permission denied|42501/i.test(m)) return new Error(fallback);
  return e instanceof Error ? e : new Error(m);
}

/* ---------- Görünürlük: gizli hesap ve engelleme ---------- */
let vctx = null;
let vctxAt = 0;
export function resetViewer() {
  vctx = null;
}
/** Takip ettiklerim ve engellediklerim (20 sn önbellek). */
export async function viewer() {
  if (vctx && Date.now() - vctxAt < 20000) return vctx;
  const uid = me();
  const [fol, bl, blMe, mine] = await Promise.all([
    db.list('follows', { eq: { follower_id: uid } }),
    db.list('blocks', { eq: { blocker_id: uid } }).catch(() => []),
    db.list('blocks', { eq: { blocked_id: uid } }).catch(() => []),
    profile(uid),
  ]);
  vctx = {
    following: new Set(fol.map((f) => f.following_id)),
    blocked: new Set(bl.map((b) => b.blocked_id)),
    blockedMe: new Set(blMe.map((b) => b.blocker_id)),
    admin: isAdminP(mine),
  };
  vctxAt = Date.now();
  return vctx;
}
/** Bu kişinin içeriğini görebilir miyim? (sunucu da aynı kuralı uygular) */
export function canSee(author, v) {
  if (!author) return false;
  if (author.id === me() || v.admin) return true;
  if (v.blocked.has(author.id) || v.blockedMe.has(author.id)) return false;
  return !author.private || v.following.has(author.id);
}

/* ---------- Profiller ---------- */
export async function profile(id, fresh = false) {
  if (!id) return null;
  if (!fresh && profileCache.has(id)) return profileCache.get(id);
  const p = await db.get('profiles', id);
  if (p) profileCache.set(id, p);
  return p;
}
export async function profiles(ids) {
  const need = [...new Set(ids)].filter((i) => i && !profileCache.has(i));
  if (need.length) for (const p of await db.list('profiles', { in: ['id', need] })) profileCache.set(p.id, p);
  const m = new Map();
  for (const i of ids) if (profileCache.has(i)) m.set(i, profileCache.get(i));
  return m;
}
export async function byUsername(u) {
  const r = await db.list('profiles', { eq: { username: u } });
  if (r[0]) profileCache.set(r[0].id, r[0]);
  return r[0] || null;
}
export async function updateProfile(patch) {
  const p = await db.update('profiles', me(), patch);
  if (p) profileCache.set(p.id, p);
  return p;
}
export async function searchUsers(q) {
  const rows = q ? await db.list('profiles', { ilike: { username: q }, limit: 30 }) : await db.list('profiles', { order: ['created_at', false], limit: 30 });
  if (q) {
    const byName = await db.list('profiles', { ilike: { name: q }, limit: 30 });
    for (const r of byName) if (!rows.some((x) => x.id === r.id)) rows.push(r);
  }
  rows.forEach((p) => profileCache.set(p.id, p));
  return rows.filter((p) => !p.banned);
}
export const clearCache = () => profileCache.clear();

/* ---------- Medya ---------- */
/** Fotoğrafı küçült (en uzun kenar 1080) ve JPEG'e çevir. GIF'ler animasyonu bozulmasın diye olduğu gibi kalır. */
export async function prepareImage(file, max = 1080) {
  if (file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((r) => c.toBlob((b) => r(b || file), 'image/jpeg', 0.86));
}
export async function uploadFile(file) {
  const isVideo = file.type.startsWith('video/');
  if (isVideo && file.size > 60 * 1024 * 1024) throw new Error('Video çok büyük (en fazla 60 MB).');
  const blob = isVideo ? file : await prepareImage(file);
  return { url: await db.upload(blob, isVideo ? 'video' : 'photo'), kind: isVideo ? 'video' : file.type === 'image/gif' ? 'gif' : 'photo' };
}

/* ---------- Gönderiler ---------- */
/** Düzenleyici bilgisi (katmanlar, filtre, konum) ile kaydet. Sunucuda "meta" sütunu yoksa onsuz kaydeder. */
async function insertWithMeta(table, row, meta) {
  if (!meta || !Object.keys(meta).length) return db.insert(table, row);
  try {
    return await db.insert(table, { ...row, meta });
  } catch (e) {
    if (!/meta/i.test(e.message || '')) throw e;
    metaMissing = true;
    return db.insert(table, row);
  }
}
export let metaMissing = false;
async function buildMeta(meta, drawingBlob) {
  const m = { ...(meta || {}) };
  if (drawingBlob) m.drawing = await db.upload(drawingBlob, 'photo');
  for (const k of Object.keys(m)) if (m[k] === '' || m[k] === null || (Array.isArray(m[k]) && !m[k].length)) delete m[k];
  if (m.filter === 'none') delete m.filter;
  if (!m.vig) delete m.vig;
  if (!m.muted) delete m.muted;
  return m;
}
export async function createPost({ file, caption, meta, drawingBlob }) {
  await assertActive();
  const up = await uploadFile(file);
  const m = await buildMeta(meta, drawingBlob);
  return insertWithMeta('posts', { user_id: me(), kind: up.kind === 'video' ? 'video' : 'photo', media: up.url, caption }, m);
}
/** Anket gönderisi (fotoğrafsız). */
export async function createPollPost({ question, options }) {
  await assertActive();
  const q = question.slice(0, 140);
  const opts = options.slice(0, 4).map((o) => o.slice(0, 60));
  try {
    return await db.insert('posts', { user_id: me(), kind: 'poll', media: '', caption: q, meta: { poll: { q, options: opts } } });
  } catch (e) {
    throw friendly(e, 'Anket paylaşılamadı. Sunucu güncellemesi (guncelleme-1.sql ve guncelleme-6.sql) yapılmış mı?');
  }
}
export async function updateCaption(post, caption) {
  const r = await db.update('posts', post.id, { caption });
  if (!r) throw new Error('Açıklama değiştirilemedi');
  post.caption = caption;
}
export async function deletePost(id) {
  for (const t of ['likes', 'reposts', 'comments']) await db.remove(t, { post_id: id });
  await db.remove('posts', { id });
}

/** Gönderilere beğeni/repost/yorum sayıları ve sahip profillerini ekle. */
export async function decorate(posts) {
  if (!posts.length) return posts;
  const ids = posts.map((p) => p.id);
  const [likes, reposts, comments] = await Promise.all([
    db.list('likes', { in: ['post_id', ids] }),
    db.list('reposts', { in: ['post_id', ids] }),
    db.list('comments', { in: ['post_id', ids] }),
  ]);
  const pm = await profiles(posts.map((p) => p.user_id).concat(posts.map((p) => p.reposted_by).filter(Boolean)));
  const uid = me();
  const v = await viewer();
  for (const p of posts) {
    const l = likes.filter((x) => x.post_id === p.id);
    const r = reposts.filter((x) => x.post_id === p.id);
    p.likeCount = l.length;
    p.liked = l.some((x) => x.user_id === uid);
    p.repostCount = r.length;
    p.reposted = r.some((x) => x.user_id === uid);
    p.commentCount = comments.filter((x) => x.post_id === p.id).length;
    p.author = pm.get(p.user_id);
    if (p.reposted_by) p.reposter = pm.get(p.reposted_by);
    p.hideLikes = !!p.author?.hide_likes && p.user_id !== uid;
  }
  return posts.filter((p) => p.author && !banState(p.author).banned && canSee(p.author, v) && (!p.reposter || canSee(p.reposter, v)));
}

export async function following(uid = me()) {
  return (await db.list('follows', { eq: { follower_id: uid } })).map((f) => f.following_id);
}
export async function followers(uid = me()) {
  return (await db.list('follows', { eq: { following_id: uid } })).map((f) => f.follower_id);
}

/* =========================================================
   Akış algoritması
   Puan = (temel + etkileşim + yakınlık + ilişki) × tazelik × görülmüşlük × küçük rastgelelik
   - etkileşim: log(1 + beğeni + 2·yorum + 3·repost)
   - yakınlık: son zamanlarda bu kişinin gönderilerini beğenme/yorumlama sayın
   - ilişki: takip ettiğin > kendin > keşif
   - tazelik: yaklaşık 21 saatte yarıya inen üstel azalma
   - görülmüşlük: daha önce ekranda gördüğün gönderiler geriye düşer
   Sonra aynı kişinin gönderileri art arda gelmesin diye çeşitlendirilir.
   ========================================================= */
const SEEN_KEY = 'kanka.seen';
let seenSet = null;
function seen() {
  if (!seenSet) {
    try {
      seenSet = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
    } catch {
      seenSet = new Set();
    }
  }
  return seenSet;
}
export function markSeen(id) {
  const s = seen();
  if (s.has(id)) return;
  s.add(id);
  const arr = [...s].slice(-1500);
  seenSet = new Set(arr);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    /* dolu */
  }
}
let affCache = null;
let affAt = 0;
/** Kimin gönderileriyle ne kadar etkileşime girdin? */
async function affinity() {
  if (affCache && Date.now() - affAt < 60000) return affCache;
  const uid = me();
  const [lk, cm] = await Promise.all([
    db.list('likes', { eq: { user_id: uid }, order: ['created_at', false], limit: 300 }),
    db.list('comments', { eq: { user_id: uid }, order: ['created_at', false], limit: 200 }),
  ]);
  const ids = [...new Set([...lk, ...cm].map((x) => x.post_id))];
  const posts = ids.length ? await db.list('posts', { in: ['id', ids.slice(0, 300)] }) : [];
  const owner = new Map(posts.map((p) => [p.id, p.user_id]));
  const m = new Map();
  for (const x of lk) owner.has(x.post_id) && m.set(owner.get(x.post_id), (m.get(owner.get(x.post_id)) || 0) + 1);
  for (const x of cm) owner.has(x.post_id) && m.set(owner.get(x.post_id), (m.get(owner.get(x.post_id)) || 0) + 2);
  affCache = m;
  affAt = Date.now();
  return m;
}
function score(p, v, aff) {
  const ageH = Math.max(0, (Date.now() - new Date(p.sort_at || p.created_at).getTime()) / 3.6e6);
  const eng = Math.log1p((p.likeCount || 0) + 2 * (p.commentCount || 0) + 3 * (p.repostCount || 0));
  const near = Math.log1p(aff.get(p.user_id) || 0);
  const rel = p.user_id === me() ? 0.6 : v.following.has(p.user_id) ? 1 : 0.3;
  const fresh = Math.exp(-ageH / 30);
  const seenF = seen().has(p.id) ? 0.35 : 1;
  const bonus = (p.author?.verified ? 0.1 : 0) + (p.kind === 'video' ? 0.08 : 0) + (p.reposted_by ? 0.15 : 0);
  return (0.8 + eng * 0.6 + near * 0.7 + rel * 1.2 + bonus) * (0.2 + fresh) * seenF * interestPenalty(p) * (0.95 + Math.random() * 0.1);
}
function diversify(list) {
  const out = [];
  const pool = list.slice();
  while (pool.length) {
    const recent = out.slice(-2).map((x) => x.user_id);
    let i = pool.findIndex((x) => !recent.includes(x.user_id));
    if (i < 0) i = 0;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
async function rank(items) {
  const [v, aff] = await Promise.all([viewer(), affinity()]);
  items = items.filter((p) => interestPenalty(p) > 0 || p.user_id === me());
  items.forEach((p) => (p._score = score(p, v, aff)));
  items.sort((a, b) => b._score - a._score);
  return diversify(items);
}

/**
 * Ana sayfa. mode = 'foryou' (algoritmik, keşif dahil) | 'following' (takip ettiklerin, en yeni üstte).
 */
export async function feed(mode = 'foryou') {
  const uid = me();
  const v = await viewer();
  const fol = [...v.following];
  const all = await db.list('posts', { order: ['created_at', false], limit: 200 });
  const set = new Set([uid, ...fol]);
  let items = all.filter((p) => set.has(p.user_id));
  if (fol.length) {
    const rp = await db.list('reposts', { in: ['user_id', fol], order: ['created_at', false], limit: 60 });
    for (const r of rp) {
      const p = all.find((x) => x.id === r.post_id);
      if (p && p.user_id !== r.user_id && !items.some((x) => x.id === p.id && !x.reposted_by)) items.push({ ...p, reposted_by: r.user_id, sort_at: r.created_at, feedKey: 'r' + r.id });
    }
  }
  if (mode === 'following') {
    items.forEach((p) => (p.sort_at = p.sort_at || p.created_at));
    items.sort((a, b) => (a.sort_at < b.sort_at ? 1 : -1));
    return decorate(items.slice(0, 80));
  }
  // Senin için: takip + keşif (takip etmediğin, herkese açık, son gönderiler)
  const discover = all.filter((p) => !set.has(p.user_id)).slice(0, 60).map((p) => ({ ...p, suggested: true }));
  items = await decorate([...items, ...discover]);
  return (await rank(items)).slice(0, 80);
}
export async function reels() {
  const v = await db.list('posts', { eq: { kind: 'video' }, order: ['created_at', false], limit: 80 });
  return (await rank(await decorate(v))).slice(0, 60);
}
export async function explore() {
  const v = await viewer();
  const posts = await decorate(await db.list('posts', { order: ['created_at', false], limit: 120 }));
  const ranked = await rank(posts.filter((p) => p.user_id !== me()));
  // keşfette önce takip etmediklerin
  return [...ranked.filter((p) => !v.following.has(p.user_id)), ...ranked.filter((p) => v.following.has(p.user_id))].slice(0, 60);
}
export async function userPosts(uid) {
  return decorate(await db.list('posts', { eq: { user_id: uid }, order: ['created_at', false] }));
}
export async function userReposts(uid) {
  const r = await db.list('reposts', { eq: { user_id: uid }, order: ['created_at', false] });
  const posts = r.length ? await db.list('posts', { in: ['id', r.map((x) => x.post_id)] }) : [];
  return decorate(r.map((x) => posts.find((p) => p.id === x.post_id)).filter(Boolean));
}
export async function getPost(id) {
  const p = await db.get('posts', id);
  return p ? (await decorate([p]))[0] : null;
}

export async function notify(userId, type, extra = {}) {
  if (!userId || userId === me()) return;
  try {
    await db.insert('notifications', { user_id: userId, actor_id: me(), type, read: false, post_id: null, text: '', ...extra });
  } catch {
    /* bildirim kritik değil */
  }
}

export async function toggleLike(post) {
  if (post.liked) await db.remove('likes', { post_id: post.id, user_id: me() });
  else {
    await assertActive();
    await db.insert('likes', { post_id: post.id, user_id: me() });
    notify(post.user_id, 'like', { post_id: post.id });
  }
  post.liked = !post.liked;
  post.likeCount += post.liked ? 1 : -1;
}
export async function toggleRepost(post) {
  if (post.user_id === me()) throw new Error('Kendi gönderini repost edemezsin.');
  if (post.author?.private) throw new Error('Gizli hesapların gönderileri repost edilemez.');
  if (!post.reposted) await assertActive();
  if (post.reposted) await db.remove('reposts', { post_id: post.id, user_id: me() });
  else {
    await db.insert('reposts', { post_id: post.id, user_id: me() });
    notify(post.user_id, 'repost', { post_id: post.id });
  }
  post.reposted = !post.reposted;
  post.repostCount += post.reposted ? 1 : -1;
}

/* ---------- Yorumlar ---------- */
export async function comments(postId) {
  const c = await db.list('comments', { eq: { post_id: postId }, order: ['created_at', true] });
  const pm = await profiles(c.map((x) => x.user_id));
  const v = await viewer();
  c.forEach((x) => (x.author = pm.get(x.user_id)));
  return c.filter((x) => x.author && !banState(x.author).banned && !v.blocked.has(x.user_id) && !v.blockedMe.has(x.user_id));
}
export async function addComment(post, { text, file, gifUrl }) {
  await assertActive();
  let media = '';
  let media_kind = '';
  if (file) {
    const up = await uploadFile(file);
    media = up.url;
    media_kind = up.kind === 'gif' ? 'gif' : 'photo';
  } else if (gifUrl) {
    media = gifUrl;
    media_kind = 'gif';
  }
  let c;
  try {
    c = await db.insert('comments', { post_id: post.id, user_id: me(), text, media, media_kind });
  } catch (e) {
    throw friendly(e, 'Bu gönderiye yorum yapamazsın.');
  }
  notify(post.user_id, 'comment', { post_id: post.id, text: text.slice(0, 80) });
  return c;
}
export const deleteComment = (id) => db.remove('comments', { id });

/* ---------- Takip (gizli hesaplar için istek) ---------- */
export async function isFollowing(uid) {
  return (await db.list('follows', { eq: { follower_id: me(), following_id: uid } })).length > 0;
}
/** 'self' | 'following' | 'requested' | 'none' */
export async function followState(uid) {
  if (uid === me()) return 'self';
  if (await isFollowing(uid)) return 'following';
  const r = await db.list('follow_requests', { eq: { requester_id: me(), target_id: uid } }).catch(() => []);
  return r.length ? 'requested' : 'none';
}
export async function follow(uid) {
  await assertActive();
  const t = await profile(uid, true);
  try {
    if (t?.private) {
      await db.insert('follow_requests', { requester_id: me(), target_id: uid });
      notify(uid, 'follow_request');
      return 'requested';
    }
    await db.insert('follows', { follower_id: me(), following_id: uid });
  } catch (e) {
    throw friendly(e, 'Bu hesabı takip edemezsin.');
  }
  notify(uid, 'follow');
  resetViewer();
  return 'following';
}
export async function unfollow(uid) {
  await db.remove('follows', { follower_id: me(), following_id: uid });
  resetViewer();
  return 'none';
}
export async function cancelRequest(uid) {
  await db.remove('follow_requests', { requester_id: me(), target_id: uid });
  return 'none';
}
/** Eski çağrılar için: takip et / bırak (gizli hesapta istek). */
export async function toggleFollow(uid) {
  const st = await followState(uid);
  if (st === 'following') return (await unfollow(uid), false);
  if (st === 'requested') return (await cancelRequest(uid), false);
  return (await follow(uid)) === 'following';
}
export async function incomingRequests() {
  const r = await db.list('follow_requests', { eq: { target_id: me() }, order: ['created_at', false] }).catch(() => []);
  const pm = await profiles(r.map((x) => x.requester_id));
  r.forEach((x) => (x.user = pm.get(x.requester_id)));
  return r.filter((x) => x.user);
}
export async function acceptRequest(req) {
  await db.insert('follows', { follower_id: req.requester_id, following_id: me() });
  await db.remove('follow_requests', { id: req.id });
  notify(req.requester_id, 'follow_accept');
}
export const declineRequest = (req) => db.remove('follow_requests', { id: req.id });
export async function removeFollower(uid) {
  await db.remove('follows', { follower_id: uid, following_id: me() });
}

/* ---------- Engelleme ---------- */
export async function blockUser(uid) {
  await db.insert('blocks', { blocker_id: me(), blocked_id: uid });
  await db.remove('follows', { follower_id: me(), following_id: uid }).catch(() => {});
  await db.remove('follows', { follower_id: uid, following_id: me() }).catch(() => {});
  await db.remove('follow_requests', { requester_id: uid, target_id: me() }).catch(() => {});
  await db.remove('follow_requests', { requester_id: me(), target_id: uid }).catch(() => {});
  resetViewer();
}
export async function unblockUser(uid) {
  await db.remove('blocks', { blocker_id: me(), blocked_id: uid });
  resetViewer();
}
export async function blockedUsers() {
  const b = await db.list('blocks', { eq: { blocker_id: me() } }).catch(() => []);
  const pm = await profiles(b.map((x) => x.blocked_id));
  return b.map((x) => pm.get(x.blocked_id)).filter(Boolean);
}

/* ---------- Gizlilik ayarları ---------- */
export async function setPrivacy(patch) {
  const before = await profile(me(), true);
  const p = await updateProfile(patch);
  if (!p) throw new Error('Ayar kaydedilemedi. Sunucu güncellemesi (guncelleme-2.sql) yapılmış mı?');
  // Hesap herkese açık olunca bekleyen istekler kabul edilir
  if (before?.private && patch.private === false) for (const r of await incomingRequests()) await acceptRequest(r).catch(() => {});
  resetViewer();
  return p;
}

export async function stats(uid) {
  const [posts, fers, fing] = await Promise.all([db.list('posts', { eq: { user_id: uid } }), followers(uid), following(uid)]);
  return { posts: posts.length, followers: fers.length, following: fing.length };
}

/* ---------- Hikâyeler ---------- */
export async function addStory(file, meta, drawingBlob) {
  await assertActive();
  const up = await uploadFile(file);
  const m = await buildMeta(meta, drawingBlob);
  return insertWithMeta('stories', { user_id: me(), kind: up.kind === 'video' ? 'video' : 'photo', media: up.url }, m);
}
/** Son 24 saatteki hikâyeler, kullanıcıya göre gruplu. Önce sen, sonra görülmemişler. */
export async function storyGroups() {
  const since = new Date(Date.now() - STORY_MS).toISOString();
  const st = await db.list('stories', { gte: { created_at: since }, order: ['created_at', true] });
  if (!st.length) return [];
  const views = await db.list('story_views', { eq: { user_id: me() }, in: ['story_id', st.map((s) => s.id)] });
  const seen = new Set(views.map((v) => v.story_id));
  const fol = new Set([me(), ...(await following())]);
  const pm = await profiles(st.map((s) => s.user_id));
  const v = await viewer();
  // yakın arkadaş hikâyeleri: sunucuda kural süzer, yerel modda burada süz
  const cfOwners = db.mode === 'local' ? new Set((await db.list('close_friends', { eq: { friend_id: me() } }).catch(() => [])).map((x) => x.owner_id)) : null;
  const groups = new Map();
  for (const s of st) {
    if (cfOwners && s.meta?.audience === 'close' && s.user_id !== me() && !cfOwners.has(s.user_id)) continue;
    const u = pm.get(s.user_id);
    if (!u || banState(u).banned || !canSee(u, v)) continue;
    if (!fol.has(s.user_id) && fol.size > 1) continue;
    s.seen = seen.has(s.id);
    if (!groups.has(s.user_id)) groups.set(s.user_id, { user: u, stories: [] });
    groups.get(s.user_id).stories.push(s);
  }
  const arr = [...groups.values()];
  arr.forEach((g) => (g.allSeen = g.stories.every((s) => s.seen)));
  arr.sort((a, b) => (a.user.id === me() ? -1 : b.user.id === me() ? 1 : a.allSeen - b.allSeen));
  return arr;
}
export async function markStorySeen(s) {
  if (s.seen || s.user_id === me()) return;
  s.seen = true;
  try {
    await db.insert('story_views', { story_id: s.id, user_id: me() });
  } catch {
    /* zaten görüldü */
  }
}
export async function storyViewers(storyId) {
  const v = await db.list('story_views', { eq: { story_id: storyId } });
  const pm = await profiles(v.map((x) => x.user_id));
  return v.map((x) => pm.get(x.user_id)).filter(Boolean);
}
export const deleteStory = async (id) => {
  await db.remove('story_views', { story_id: id });
  await db.remove('stories', { id });
};

/* ---------- Mesajlar (DM) ---------- */
export async function conversations() {
  const uid = me();
  const [a, b] = await Promise.all([db.list('conversations', { eq: { a: uid } }), db.list('conversations', { eq: { b: uid } })]);
  const all = [...a, ...b].filter((c, i, arr) => !c.is_group && c.a !== c.b && arr.findIndex((x) => x.id === c.id) === i);
  const pm = await profiles(all.map((c) => (c.a === uid ? c.b : c.a)));
  for (const c of all) {
    c.other = pm.get(c.a === uid ? c.b : c.a);
    const last = await db.list('messages', { eq: { conversation_id: c.id }, order: ['created_at', false], limit: 1 });
    c.last = last[0] || null;
  }
  all.sort((x, y) => ((x.last?.created_at || x.created_at) < (y.last?.created_at || y.created_at) ? 1 : -1));
  return all.filter((c) => c.other);
}
export async function conversationWith(uid) {
  const m = me();
  const ex = (await db.list('conversations', { eq: { a: m, b: uid } }))[0] || (await db.list('conversations', { eq: { a: uid, b: m } }))[0];
  if (ex) return ex;
  await assertActive();
  const t = await profile(uid, true);
  const v = await viewer();
  if (v.blocked.has(uid)) throw new Error('Bu kişiyi engelledin. Mesaj atmak için önce engeli kaldır.');
  if (!v.admin && t?.dm_policy === 'none') throw new Error('Bu kişi mesaj almıyor.');
  try {
    return await db.insert('conversations', { a: m, b: uid, last_at: new Date().toISOString() });
  } catch (e) {
    throw friendly(e, 'Bu kişiye mesaj gönderemezsin (mesaj izni kapalı ya da engellenmiş).');
  }
}
export async function messages(convId, since, ttlHours) {
  const q = { eq: { conversation_id: convId }, order: ['created_at', true] };
  if (since) q.gte = { created_at: since };
  let r = await db.list('messages', q);
  // kaybolan mesajlar (sunucuda kural zaten gizler; yerel modda burada)
  if (ttlHours) {
    const lim = Date.now() - ttlHours * 3600 * 1000;
    r = r.filter((m) => new Date(m.created_at).getTime() > lim);
  }
  return r.slice(-400);
}
export async function sendMessage(conv, { text, file, gifUrl, voiceUrl, replyTo, once }) {
  await assertActive();
  let media = '';
  let media_kind = '';
  if (file) {
    const up = await uploadFile(file);
    media = up.url;
    media_kind = up.kind;
  } else if (gifUrl) {
    media = gifUrl;
    media_kind = 'gif';
  } else if (voiceUrl) {
    media = voiceUrl;
    media_kind = 'audio';
  }
  let msg;
  try {
    const row = { conversation_id: conv.id, sender_id: me(), text, media, media_kind };
    if (replyTo) row.reply_to = replyTo;
    if (once && media) row.once = true;
    msg = await db.insert('messages', row).catch((e) => {
      // sunucu güncellenmediyse yeni alanlar olmadan gönder
      if ((row.reply_to || row.once) && /reply_to|once/.test(e.message || '')) {
        delete row.reply_to;
        delete row.once;
        return db.insert('messages', row);
      }
      throw e;
    });
  } catch (e) {
    throw friendly(e, 'Bu kişiye mesaj gönderemezsin (mesaj izni kapalı ya da engellenmiş).');
  }
  db.update('conversations', conv.id, { last_at: msg.created_at }).catch(() => {});
  return msg;
}
export const deleteMessage = (id) => db.remove('messages', { id });

/* ---------- Bildirimler ---------- */
export async function notifications() {
  const n = await db.list('notifications', { eq: { user_id: me() }, order: ['created_at', false], limit: 60 });
  const pm = await profiles(n.map((x) => x.actor_id));
  n.forEach((x) => (x.actor = pm.get(x.actor_id)));
  return n.filter((x) => x.actor);
}
export async function unreadCount() {
  return (await db.list('notifications', { eq: { user_id: me(), read: false } })).length;
}
export async function markAllRead() {
  const n = await db.list('notifications', { eq: { user_id: me(), read: false } });
  await Promise.all(n.map((x) => db.update('notifications', x.id, { read: true })));
}

/* ---------- Şikâyet ve mavi tik başvurusu ---------- */
export const report = (target_type, target_id, reason) => db.insert('reports', { reporter_id: me(), target_type, target_id, reason, status: 'open' });
/** Yasak/kısıtlamaya itiraz: yöneticilere şikâyet kuyruğunda görünür. */
export const appeal = (text) => db.insert('reports', { reporter_id: me(), target_type: 'appeal', target_id: me(), reason: text.slice(0, 500), status: 'open' });

export function ageOf(birth) {
  if (!birth) return null;
  const b = new Date(birth);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}
export const MIN_AGE = 13;
export const VERIFY_MIN_AGE = 18;
/** Kayıtta doğum tarihi ve sözleşme onayı (herkese kapalı tabloya). */
export async function savePrivateInfo(birthDate) {
  try {
    await db.insert('private_info', { user_id: me(), birth_date: birthDate, terms_accepted_at: new Date().toISOString() });
  } catch {
    /* sunucu güncellemesi yapılmamışsa kayıt yine de tamamlanır */
  }
}
/** Mavi tik başvurusu: ad soyad, doğum tarihi (18+), yüz fotoğrafı (gizli depoya). */
export async function requestVerify({ fullName, birthDate, selfie, note }) {
  const ex = await db.list('verify_requests', { eq: { user_id: me(), status: 'open' } });
  if (ex.length) throw new Error('Zaten bekleyen bir başvurun var.');
  const age = ageOf(birthDate);
  if (age === null || age < VERIFY_MIN_AGE) throw new Error(`Mavi tik için en az ${VERIFY_MIN_AGE} yaşında olmalısın.`);
  if (!selfie) throw new Error('Yüz fotoğrafı gerekli.');
  const path = await db.uploadPrivate(await prepareImage(selfie, 900));
  try {
    return await db.insert('verify_requests', { user_id: me(), note, status: 'open', full_name: fullName, birth_date: birthDate, selfie: path });
  } catch (e) {
    await db.removePrivate(path).catch(() => {});
    if (/column|full_name|selfie|birth_date/i.test(e.message || '')) throw new Error('Sunucu güncellemesi gerekiyor (guncelleme-2.sql).');
    throw e;
  }
}
export async function deleteMyAccount() {
  await db.deleteAccount();
  clearCache();
  resetViewer();
}
export async function activeAnnouncements() {
  return db.list('announcements', { eq: { active: true }, order: ['created_at', false], limit: 3 });
}

/* ---------- Yönetim (admin) ---------- */
export async function adminStats() {
  const since = new Date(Date.now() - STORY_MS).toISOString();
  const [users, posts, comments, reports, verify, stories, msgs] = await Promise.all([
    db.list('profiles'),
    db.list('posts'),
    db.list('comments'),
    db.list('reports', { eq: { status: 'open' } }),
    db.list('verify_requests', { eq: { status: 'open' } }),
    db.list('stories', { gte: { created_at: since } }),
    db.list('posts', { gte: { created_at: since } }),
  ]);
  return {
    users: users.length,
    verified: users.filter((u) => u.verified).length,
    banned: users.filter((u) => banState(u).banned).length,
    restricted: users.filter((u) => banState(u).restricted).length,
    admins: users.filter((u) => isAdminP(u)).length,
    posts: posts.length,
    videos: posts.filter((p) => p.kind === 'video').length,
    comments: comments.length,
    reports: reports.length,
    verify: verify.length,
    stories: stories.length,
    postsToday: msgs.length,
    newUsers: users.filter((u) => u.created_at >= since).length,
  };
}
export async function adminUsers(q) {
  const rows = q ? await searchAll(q) : await db.list('profiles', { order: ['created_at', false] });
  return rows;
}
async function searchAll(q) {
  const a = await db.list('profiles', { ilike: { username: q } });
  const b = await db.list('profiles', { ilike: { name: q } });
  for (const r of b) if (!a.some((x) => x.id === r.id)) a.push(r);
  return a;
}
export async function adminSet(uid, patch) {
  const target = await profile(uid, true);
  const mine = await profile(me(), true);
  if (isOwnerP(target) && uid !== me()) throw new Error('Kurucu hesabı değiştirilemez.');
  if (isAdminP(target) && uid !== me() && !isOwnerP(mine)) throw new Error('Yönetici hesaplarını sadece kurucu düzenleyebilir.');
  if ('role' in patch && !isOwnerP(mine)) throw new Error('Yönetici yetkisini sadece kurucu verebilir.');
  let p;
  try {
    p = await db.update('profiles', uid, patch);
  } catch (e) {
    throw friendly(e, 'Bu değişikliğe yetkin yok.');
  }
  if (!p) throw new Error('Değiştirilemedi (yetki?)');
  profileCache.set(uid, p);
  if ('verified' in patch && patch.verified) notify(uid, 'verified', { text: 'Hesabın onaylandı, mavi tik aldın!' });
  return p;
}
/**
 * Yasakla / kısıtla / kaldır. days: süre (gün), boş = süresiz.
 * Yöneticiler ve kurucu korumalıdır (sunucu da reddeder).
 */
export async function adminModerate(uid, action, reason = '', days = null) {
  const target = await profile(uid, true);
  if (isAdminP(target) && (action === 'ban' || action === 'restrict')) throw new Error('Yöneticiler kısıtlanamaz veya yasaklanamaz (yönetici koruması).');
  const until = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
  const patch =
    action === 'ban'
      ? { banned: true, ban_reason: reason, banned_until: until }
      : action === 'restrict'
        ? { restricted: true, restrict_reason: reason, restricted_until: until }
        : action === 'unban'
          ? { banned: false, ban_reason: '', banned_until: null }
          : { restricted: false, restrict_reason: '', restricted_until: null };
  let p;
  try {
    p = await adminSet(uid, patch);
  } catch (e) {
    // eski sunucu (guncelleme-2 yok): sadece yasak alanı
    if (/ban_reason|restrict|column/i.test(e.message || '') && (action === 'ban' || action === 'unban')) p = await adminSet(uid, { banned: action === 'ban' });
    else throw e;
  }
  const txt = {
    ban: `Hesabın yasaklandı${days ? ` (${days} gün)` : ''}. Sebep: ${reason || 'belirtilmedi'}`,
    restrict: `Hesabın kısıtlandı${days ? ` (${days} gün)` : ''}. Sebep: ${reason || 'belirtilmedi'}`,
    unban: 'Hesabının yasağı kaldırıldı.',
    unrestrict: 'Hesabının kısıtlaması kaldırıldı.',
  }[action];
  notify(uid, 'system', { text: txt });
  return p;
}
/** Hesabı kapat: yasakla + tüm içeriğini sil. */
export async function adminWipeUser(uid) {
  await adminModerate(uid, 'ban', 'Hesap yönetici tarafından kapatıldı');
  const posts = await db.list('posts', { eq: { user_id: uid } });
  for (const p of posts) await deletePost(p.id);
  for (const t of ['comments', 'stories', 'likes', 'reposts']) await db.remove(t, { user_id: uid });
}
export async function adminReports() {
  const r = await db.list('reports', { order: ['created_at', false], limit: 100 });
  const pm = await profiles(r.map((x) => x.reporter_id));
  for (const x of r) {
    x.reporter = pm.get(x.reporter_id);
    if (x.target_type === 'post') x.target = await db.get('posts', x.target_id);
    else if (x.target_type === 'comment') x.target = await db.get('comments', x.target_id);
    else if (x.target_type === 'user' || x.target_type === 'appeal') x.target = await profile(x.target_id, true);
    else if (x.target_type === 'story') x.target = await db.get('stories', x.target_id);
    if (x.target && x.target.user_id) x.targetUser = await profile(x.target.user_id);
  }
  return r;
}
export const closeReport = (id) => db.update('reports', id, { status: 'closed' });
export async function adminVerifyRequests() {
  const r = await db.list('verify_requests', { order: ['created_at', false] });
  const pm = await profiles(r.map((x) => x.user_id));
  for (const x of r) {
    x.user = pm.get(x.user_id);
    x.age = ageOf(x.birth_date);
    x.selfieUrl = x.selfie && x.status === 'open' ? await db.signedUrl(x.selfie).catch(() => '') : '';
  }
  return r.filter((x) => x.user);
}
/** Karar ver; gizlilik için yüz fotoğrafı karardan sonra silinir. */
export async function decideVerify(req, ok, reason = '') {
  const patch = { status: ok ? 'approved' : 'rejected' };
  if (req.selfie !== undefined) Object.assign(patch, { reject_reason: ok ? '' : reason, reviewed_by: me(), selfie: '' });
  await db.update('verify_requests', req.id, patch).catch(() => db.update('verify_requests', req.id, { status: patch.status }));
  if (req.selfie) await db.removePrivate(req.selfie).catch(() => {});
  if (ok) await adminSet(req.user_id, { verified: true });
  else notify(req.user_id, 'system', { text: `Mavi tik başvurun reddedildi.${reason ? ' Sebep: ' + reason : ''}` });
}
export async function adminComments() {
  const c = await db.list('comments', { order: ['created_at', false], limit: 100 });
  const pm = await profiles(c.map((x) => x.user_id));
  c.forEach((x) => (x.author = pm.get(x.user_id)));
  return c;
}
export async function adminStories() {
  const since = new Date(Date.now() - STORY_MS).toISOString();
  const s = await db.list('stories', { gte: { created_at: since }, order: ['created_at', false] });
  const pm = await profiles(s.map((x) => x.user_id));
  s.forEach((x) => (x.author = pm.get(x.user_id)));
  return s;
}
export const announce = (text) => db.insert('announcements', { user_id: me(), text, active: true });
export const listAnnouncements = () => db.list('announcements', { order: ['created_at', false] });
export const setAnnouncement = (id, active) => db.update('announcements', id, { active });
export const deleteAnnouncement = (id) => db.remove('announcements', { id });
/** Herkese sistem bildirimi gönder. */
export async function broadcast(text) {
  const users = await db.list('profiles');
  for (const u of users) if (u.id !== me()) await notify(u.id, 'system', { text });
}
