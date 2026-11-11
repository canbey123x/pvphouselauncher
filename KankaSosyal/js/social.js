// =========================================================
// social.js — Ek sosyal özellikler: kaydedilenler, çoklu medya, kişi etiketleme, görüntülenme ve
// istatistikler, yakın arkadaşlar, hikâye anketi/soru, vitrin, grup sohbetleri, görüldü/yazıyor,
// sesli mesaj, hashtag, arama geçmişi ve öneriler, "ilgilenmiyorum", tema.
// (Sesli arama: calls.js)
// =========================================================
import { db, me, profile, profiles, decorate, viewer, notify, assertActive, friendly, uploadFile, byUsername } from './api.js';

const ls = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* dolu */
    }
  },
};

/* ---------- Kaydedilenler ---------- */
let savedCache = null;
export async function savedIds() {
  if (!savedCache) savedCache = new Set((await db.list('saved_posts', { eq: { user_id: me() } }).catch(() => [])).map((x) => x.post_id));
  return savedCache;
}
export async function toggleSave(post) {
  const s = await savedIds();
  if (s.has(post.id)) {
    await db.remove('saved_posts', { user_id: me(), post_id: post.id });
    s.delete(post.id);
    return false;
  }
  try {
    await db.insert('saved_posts', { user_id: me(), post_id: post.id });
  } catch (e) {
    throw friendly(e, 'Kaydedilemedi. Sunucu güncellemesi (guncelleme-3.sql) yapılmış mı?');
  }
  s.add(post.id);
  return true;
}
export async function savedPosts() {
  const rows = await db.list('saved_posts', { eq: { user_id: me() }, order: ['created_at', false] }).catch(() => []);
  if (!rows.length) return [];
  const posts = await db.list('posts', { in: ['id', rows.map((r) => r.post_id)] });
  return decorate(rows.map((r) => posts.find((p) => p.id === r.post_id)).filter(Boolean));
}

/* ---------- Gönderinin bütün medyası (çoklu fotoğraf/video) ---------- */
export function mediaItems(p) {
  const first = { url: p.media, kind: p.kind, filter: p.meta?.filter, layers: p.meta?.layers, drawing: p.meta?.drawing, vig: p.meta?.vig, muted: p.meta?.muted };
  return [first, ...(p.meta?.items || [])];
}

/* ---------- Kişi etiketleme ve bahsetme ---------- */
export async function saveTags(post, users) {
  for (const u of users) {
    try {
      await db.insert('post_tags', { post_id: post.id, user_id: u.id });
      notify(u.id, 'tag', { post_id: post.id });
    } catch {
      /* engelli ya da zaten etiketli */
    }
  }
}
export async function notifyMentions(post, text) {
  const names = [...new Set((text.match(/@([a-z0-9_.]{3,24})/gi) || []).map((x) => x.slice(1).toLowerCase()))].slice(0, 10);
  for (const n of names) {
    const u = await byUsername(n).catch(() => null);
    if (u && u.id !== me()) notify(u.id, 'mention', { post_id: post.id, text: text.slice(0, 80) });
  }
}
export async function postTags(postId) {
  const t = await db.list('post_tags', { eq: { post_id: postId } }).catch(() => []);
  const pm = await profiles(t.map((x) => x.user_id));
  return t.map((x) => pm.get(x.user_id)).filter(Boolean);
}
export async function taggedPosts(uid) {
  const t = await db.list('post_tags', { eq: { user_id: uid }, order: ['created_at', false] }).catch(() => []);
  if (!t.length) return [];
  const posts = await db.list('posts', { in: ['id', t.map((x) => x.post_id)] });
  return decorate(posts.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
}

/* ---------- Görüntülenme ve istatistikler ---------- */
const viewed = new Set();
export function recordView(postId, ownerId) {
  if (!postId || viewed.has(postId) || ownerId === me()) return;
  viewed.add(postId);
  db.insert('post_views', { post_id: postId, user_id: me() }).catch(() => {});
}
export async function insights(postId) {
  const r = await db.rpc('post_insights', { pid: postId });
  if (!r) throw new Error('İstatistikler alınamadı. Sunucu güncellemesi (guncelleme-3.sql) yapılmış mı?');
  return r;
}

/* ---------- Yakın arkadaşlar ---------- */
export async function closeFriends() {
  const r = await db.list('close_friends', { eq: { owner_id: me() } }).catch(() => []);
  const pm = await profiles(r.map((x) => x.friend_id));
  return r.map((x) => pm.get(x.friend_id)).filter(Boolean);
}
export async function setCloseFriend(uid, on) {
  if (on) await db.insert('close_friends', { owner_id: me(), friend_id: uid });
  else await db.remove('close_friends', { owner_id: me(), friend_id: uid });
}
/** Yerel modda yakın arkadaş hikâyelerini süz (sunucuda kural zaten süzer). */
export async function canSeeStory(s) {
  if (s.meta?.audience !== 'close' || s.user_id === me()) return true;
  const r = await db.list('close_friends', { eq: { owner_id: s.user_id, friend_id: me() } }).catch(() => []);
  return db.mode === 'local' ? r.length > 0 : true;
}

/* ---------- Hikâye anketi / soru ---------- */
export async function vote(story, choice) {
  await assertActive();
  try {
    await db.insert('story_votes', { story_id: story.id, user_id: me(), choice: String(choice).slice(0, 300) });
  } catch (e) {
    throw friendly(e, 'Cevap gönderilemedi.');
  }
  notify(story.user_id, 'story_vote', { text: String(choice).slice(0, 80) });
}
export async function pollResults(story) {
  if (db.mode === 'local') {
    const v = await db.list('story_votes', { eq: { story_id: story.id } });
    return { a: v.filter((x) => x.choice === 'a').length, b: v.filter((x) => x.choice === 'b').length, mine: v.find((x) => x.user_id === me())?.choice || null };
  }
  return (await db.rpc('story_poll_results', { sid: story.id }).catch(() => null)) || { a: 0, b: 0, mine: null };
}
export async function storyAnswers(storyId) {
  const v = await db.list('story_votes', { eq: { story_id: storyId }, order: ['created_at', false] }).catch(() => []);
  const pm = await profiles(v.map((x) => x.user_id));
  return v.map((x) => ({ ...x, user: pm.get(x.user_id) })).filter((x) => x.user);
}

/* ---------- Vitrin (öne çıkan hikâyeler) ---------- */
export async function myAllStories() {
  return db.list('stories', { eq: { user_id: me() }, order: ['created_at', false], limit: 200 });
}
export async function highlights(uid) {
  return db.list('highlights', { eq: { user_id: uid }, order: ['created_at', true] }).catch(() => []);
}
export async function createHighlight(title, stories) {
  await assertActive();
  return db.insert('highlights', { user_id: me(), title: title.slice(0, 20), cover: stories[0]?.media || '', story_ids: stories.map((s) => s.id) });
}
export const deleteHighlight = (id) => db.remove('highlights', { id });
export async function highlightStories(h) {
  if (!h.story_ids?.length) return [];
  const st = await db.list('stories', { in: ['id', h.story_ids] });
  return h.story_ids.map((id) => st.find((s) => s.id === id)).filter(Boolean);
}

/* ---------- Grup sohbetleri, görüldü, yazıyor ---------- */
export async function createGroup(title, users) {
  await assertActive();
  const c = await db.insert('conversations', { a: me(), b: me(), is_group: true, title: title.slice(0, 40), owner_id: me(), last_at: new Date().toISOString() });
  await db.insert('conversation_members', { conversation_id: c.id, user_id: me() });
  for (const u of users) {
    try {
      await db.insert('conversation_members', { conversation_id: c.id, user_id: u.id });
      notify(u.id, 'group_add', { text: c.title });
    } catch {
      /* mesaj izni kapalı */
    }
  }
  return c;
}
export async function members(conv) {
  if (!conv.is_group) return profiles([conv.a, conv.b]).then((m) => [...m.values()]);
  const r = await db.list('conversation_members', { eq: { conversation_id: conv.id } }).catch(() => []);
  const pm = await profiles(r.map((x) => x.user_id));
  return r.map((x) => pm.get(x.user_id)).filter(Boolean);
}
export async function addMembers(conv, users) {
  for (const u of users) {
    await db.insert('conversation_members', { conversation_id: conv.id, user_id: u.id }).catch(() => {});
    notify(u.id, 'group_add', { text: conv.title });
  }
}
export const removeMember = (conv, uid) => db.remove('conversation_members', { conversation_id: conv.id, user_id: uid });
export const leaveGroup = (conv) => db.remove('conversation_members', { conversation_id: conv.id, user_id: me() });
export const renameGroup = (conv, title) => db.update('conversations', conv.id, { title: title.slice(0, 40) });
/** Üye olduğum grup sohbetleri (birebir sohbetler api.conversations'ta). */
export async function myGroups() {
  const m = await db.list('conversation_members', { eq: { user_id: me() } }).catch(() => []);
  if (!m.length) return [];
  const cs = await db.list('conversations', { in: ['id', m.map((x) => x.conversation_id)] });
  return cs.filter((c) => c.is_group);
}

let lastTyping = 0;
export function typing(conv) {
  if (Date.now() - lastTyping < 2500) return;
  lastTyping = Date.now();
  db.upsert('conversation_reads', { conversation_id: conv.id, user_id: me(), typing_at: new Date().toISOString() }, 'conversation_id,user_id').catch(() => {});
}
export function markRead(conv) {
  db.upsert('conversation_reads', { conversation_id: conv.id, user_id: me(), last_read_at: new Date().toISOString(), typing_at: null }, 'conversation_id,user_id').catch(() => {});
}
export async function reads(conv) {
  return (await db.list('conversation_reads', { eq: { conversation_id: conv.id } }).catch(() => [])).filter((r) => r.user_id !== me());
}

/* ---------- Sesli mesaj ---------- */
export async function uploadVoice(blob) {
  return db.upload(blob, 'audio');
}

/* ---------- Hashtag ---------- */
export const tagRe = /(^|\s)#([\p{L}0-9_]{2,40})/gu;
export async function tagPosts(tag) {
  const t = tag.toLocaleLowerCase('tr-TR');
  const rows = await db.list('posts', { ilike: { caption: '#' + tag }, order: ['created_at', false], limit: 120 });
  const re = new RegExp(`(^|\\s)#${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}0-9_])`, 'iu');
  return decorate(rows.filter((p) => re.test(p.caption.toLocaleLowerCase('tr-TR'))));
}
export async function trendingTags(limit = 12) {
  const rows = await db.list('posts', { order: ['created_at', false], limit: 300 });
  const since = Date.now() - 7 * 86400000;
  const m = new Map();
  for (const p of rows) {
    if (new Date(p.created_at).getTime() < since) continue;
    for (const x of p.caption.matchAll(tagRe)) {
      const k = x[2].toLocaleLowerCase('tr-TR');
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([tag, n]) => ({ tag, n }));
}

/* ---------- Arama geçmişi ve öneriler ---------- */
const HIST = 'kanka.searchHistory';
export const searchHistory = () => ls.get(HIST, []);
export function addHistory(item) {
  const h = searchHistory().filter((x) => !(x.type === item.type && x.key === item.key));
  h.unshift(item);
  ls.set(HIST, h.slice(0, 20));
}
export const removeHistory = (item) => ls.set(HIST, searchHistory().filter((x) => !(x.type === item.type && x.key === item.key)));
export const clearHistory = () => ls.set(HIST, []);
/** Ortak arkadaşa göre öneriler ("x ortak arkadaş"). */
export async function suggestions(limit = 12) {
  const v = await viewer();
  const mine = [...v.following];
  const scores = new Map();
  if (mine.length) {
    const fof = await db.list('follows', { in: ['follower_id', mine.slice(0, 100)] });
    for (const f of fof) {
      if (f.following_id === me() || v.following.has(f.following_id) || v.blocked.has(f.following_id)) continue;
      const s = scores.get(f.following_id) || { mutual: new Set() };
      s.mutual.add(f.follower_id);
      scores.set(f.following_id, s);
    }
  }
  // beni takip edip benim takip etmediklerim
  for (const f of await db.list('follows', { eq: { following_id: me() } })) {
    if (v.following.has(f.follower_id) || v.blocked.has(f.follower_id)) continue;
    const s = scores.get(f.follower_id) || { mutual: new Set() };
    s.followsYou = true;
    scores.set(f.follower_id, s);
  }
  let ids = [...scores.keys()];
  if (ids.length < limit) {
    const recent = await db.list('profiles', { order: ['created_at', false], limit: 40 });
    for (const p of recent) if (p.id !== me() && !v.following.has(p.id) && !scores.has(p.id) && !v.blocked.has(p.id)) scores.set(p.id, { mutual: new Set() }) && ids.push(p.id);
  }
  const pm = await profiles(ids);
  return ids
    .map((id) => ({ user: pm.get(id), mutual: scores.get(id).mutual.size, followsYou: !!scores.get(id).followsYou }))
    .filter((x) => x.user && !x.user.banned)
    .sort((a, b) => b.followsYou - a.followsYou || b.mutual - a.mutual || (b.user.verified ? 1 : 0) - (a.user.verified ? 1 : 0))
    .slice(0, limit);
}

/* ---------- İlgilenmiyorum (algoritmaya geri bildirim) ---------- */
const NI = 'kanka.notInterested';
export function notInterested(post) {
  const d = ls.get(NI, { authors: {}, posts: [] });
  d.authors[post.user_id] = (d.authors[post.user_id] || 0) + 1;
  d.posts = [post.id, ...d.posts.filter((x) => x !== post.id)].slice(0, 500);
  ls.set(NI, d);
}
export function interestPenalty(p) {
  const d = ls.get(NI, { authors: {}, posts: [] });
  if (d.posts.includes(p.id)) return 0;
  return Math.pow(0.35, d.authors[p.user_id] || 0);
}

/* ---------- Tema ---------- */
export function applyTheme(t = ls.get('kanka.theme', 'dark')) {
  const sys = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  const light = t === 'light' || (t === 'system' && sys);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#ffffff' : '#000000');
  window.KankaAndroid?.setLightBars?.(light);
  return t;
}
export function setTheme(t) {
  ls.set('kanka.theme', t);
  applyTheme(t);
}
export const theme = () => ls.get('kanka.theme', 'dark');
