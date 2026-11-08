// =========================================================
// api.js — Uygulama mantığı: profiller, gönderiler, beğeni, repost, yorum,
// takip, hikâye, DM, bildirim, şikâyet, mavi tik ve yönetim işlemleri.
// Alttaki veri katmanı (yerel ya da Supabase) bunu bilmez.
// =========================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createLocalDb } from './db-local.js';

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
    if (valid(j)) localStorage.setItem(REMOTE_KEY, JSON.stringify({ url: j.url.trim().replace(/\/$/, ''), key: j.key.trim() }));
    else localStorage.removeItem(REMOTE_KEY);
  } catch {
    /* internet yok: son bilinen ayar kullanılır */
  }
}

/** Öncelik: davet kodu / elle girilen > ortak ayar dosyası > uygulamaya gömülü (config.js). */
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

/* ---------- Davet kodu: sunucu adresi + herkese açık anahtar ---------- */
export function makeInvite(cfg = serverConfig()) {
  if (!cfg) return '';
  const b = btoa(unescape(encodeURIComponent(JSON.stringify({ u: cfg.url, k: cfg.key }))));
  return 'KANKA-' + b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function parseInvite(code) {
  try {
    let b = String(code).trim().replace(/^KANKA-/i, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const j = JSON.parse(decodeURIComponent(escape(atob(b))));
    const cfg = { url: String(j.u || '').trim().replace(/\/$/, ''), key: String(j.k || '').trim() };
    return valid(cfg) ? cfg : null;
  } catch {
    return null;
  }
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
export async function createPost({ file, caption }) {
  const p = await profile(me(), true);
  if (p?.banned) throw new Error('Hesabın askıya alındı, paylaşım yapamazsın.');
  const up = await uploadFile(file);
  return db.insert('posts', { user_id: me(), kind: up.kind === 'video' ? 'video' : 'photo', media: up.url, caption });
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
  }
  return posts.filter((p) => p.author && !p.author.banned);
}

export async function following(uid = me()) {
  return (await db.list('follows', { eq: { follower_id: uid } })).map((f) => f.following_id);
}
export async function followers(uid = me()) {
  return (await db.list('follows', { eq: { following_id: uid } })).map((f) => f.follower_id);
}

/** Ana sayfa: takip ettiklerin + kendi gönderilerin + takip ettiklerinin repostları. Kimseyi takip etmiyorsan herkes. */
export async function feed() {
  const uid = me();
  const fol = await following(uid);
  const all = await db.list('posts', { order: ['created_at', false], limit: 150 });
  const set = new Set([uid, ...fol]);
  let items = fol.length ? all.filter((p) => set.has(p.user_id)) : all.slice();
  if (fol.length) {
    const rp = await db.list('reposts', { in: ['user_id', fol], order: ['created_at', false], limit: 60 });
    for (const r of rp) {
      const p = all.find((x) => x.id === r.post_id);
      if (p && p.user_id !== r.user_id) items.push({ ...p, reposted_by: r.user_id, sort_at: r.created_at, feedKey: 'r' + r.id });
    }
    // az içerik varsa keşfetten ekle
    if (items.length < 6) for (const p of all) if (!items.some((x) => x.id === p.id)) items.push({ ...p, suggested: true });
  }
  items.forEach((p) => (p.sort_at = p.sort_at || p.created_at));
  items.sort((a, b) => (a.sort_at < b.sort_at ? 1 : -1));
  return decorate(items.slice(0, 80));
}
export async function reels() {
  const v = await db.list('posts', { eq: { kind: 'video' }, order: ['created_at', false], limit: 60 });
  return decorate(v);
}
export async function explore() {
  return decorate(await db.list('posts', { order: ['created_at', false], limit: 60 }));
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

async function notify(userId, type, extra = {}) {
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
    await db.insert('likes', { post_id: post.id, user_id: me() });
    notify(post.user_id, 'like', { post_id: post.id });
  }
  post.liked = !post.liked;
  post.likeCount += post.liked ? 1 : -1;
}
export async function toggleRepost(post) {
  if (post.user_id === me()) throw new Error('Kendi gönderini repost edemezsin.');
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
  c.forEach((x) => (x.author = pm.get(x.user_id)));
  return c.filter((x) => x.author && !x.author.banned);
}
export async function addComment(post, { text, file, gifUrl }) {
  const p = await profile(me(), true);
  if (p?.banned) throw new Error('Hesabın askıya alındı.');
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
  const c = await db.insert('comments', { post_id: post.id, user_id: me(), text, media, media_kind });
  notify(post.user_id, 'comment', { post_id: post.id, text: text.slice(0, 80) });
  return c;
}
export const deleteComment = (id) => db.remove('comments', { id });

/* ---------- Takip ---------- */
export async function isFollowing(uid) {
  return (await db.list('follows', { eq: { follower_id: me(), following_id: uid } })).length > 0;
}
export async function toggleFollow(uid) {
  if (await isFollowing(uid)) {
    await db.remove('follows', { follower_id: me(), following_id: uid });
    return false;
  }
  await db.insert('follows', { follower_id: me(), following_id: uid });
  notify(uid, 'follow');
  return true;
}
export async function stats(uid) {
  const [posts, fers, fing] = await Promise.all([db.list('posts', { eq: { user_id: uid } }), followers(uid), following(uid)]);
  return { posts: posts.length, followers: fers.length, following: fing.length };
}

/* ---------- Hikâyeler ---------- */
export async function addStory(file) {
  const up = await uploadFile(file);
  return db.insert('stories', { user_id: me(), kind: up.kind === 'video' ? 'video' : 'photo', media: up.url });
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
  const groups = new Map();
  for (const s of st) {
    const u = pm.get(s.user_id);
    if (!u || u.banned) continue;
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
  const all = [...a, ...b];
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
  return db.insert('conversations', { a: m, b: uid, last_at: new Date().toISOString() });
}
export async function messages(convId, since) {
  const q = { eq: { conversation_id: convId }, order: ['created_at', true] };
  if (since) q.gte = { created_at: since };
  return db.list('messages', q);
}
export async function sendMessage(conv, { text, file, gifUrl }) {
  const p = await profile(me(), true);
  if (p?.banned) throw new Error('Hesabın askıya alındı.');
  let media = '';
  let media_kind = '';
  if (file) {
    const up = await uploadFile(file);
    media = up.url;
    media_kind = up.kind;
  } else if (gifUrl) {
    media = gifUrl;
    media_kind = 'gif';
  }
  const msg = await db.insert('messages', { conversation_id: conv.id, sender_id: me(), text, media, media_kind });
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
export async function requestVerify(note) {
  const ex = await db.list('verify_requests', { eq: { user_id: me(), status: 'open' } });
  if (ex.length) throw new Error('Zaten bekleyen bir başvurun var.');
  return db.insert('verify_requests', { user_id: me(), note, status: 'open' });
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
    banned: users.filter((u) => u.banned).length,
    admins: users.filter((u) => u.role === 'admin').length,
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
  const p = await db.update('profiles', uid, patch);
  if (!p) throw new Error('Değiştirilemedi (yetki?)');
  profileCache.set(uid, p);
  if ('verified' in patch && patch.verified) notify(uid, 'verified', { text: 'Hesabın onaylandı, mavi tik aldın!' });
  return p;
}
/** Hesabı kapat: askıya al + tüm içeriğini sil. */
export async function adminWipeUser(uid) {
  await adminSet(uid, { banned: true });
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
    else if (x.target_type === 'user') x.target = await profile(x.target_id);
    else if (x.target_type === 'story') x.target = await db.get('stories', x.target_id);
    if (x.target && x.target.user_id) x.targetUser = await profile(x.target.user_id);
  }
  return r;
}
export const closeReport = (id) => db.update('reports', id, { status: 'closed' });
export async function adminVerifyRequests() {
  const r = await db.list('verify_requests', { order: ['created_at', false] });
  const pm = await profiles(r.map((x) => x.user_id));
  r.forEach((x) => (x.user = pm.get(x.user_id)));
  return r.filter((x) => x.user);
}
export async function decideVerify(req, ok) {
  await db.update('verify_requests', req.id, { status: ok ? 'approved' : 'rejected' });
  if (ok) await adminSet(req.user_id, { verified: true });
  else notify(req.user_id, 'system', { text: 'Mavi tik başvurun reddedildi.' });
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
