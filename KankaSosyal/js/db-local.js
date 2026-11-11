// =========================================================
// db-local.js — Yerel mod veri katmanı: her şey bu cihazda (IndexedDB) saklanır.
// Supabase katmanıyla AYNI arayüzü sunar; uygulama hangisinin kullanıldığını bilmez.
// =========================================================

const DB_NAME = 'kanka-demo'; // eski kurulumlarla uyum için ad aynı kaldı
const SESSION_KEY = 'kanka.demo.session';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('kv');
      r.result.createObjectStore('media');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(db, store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
  });
}

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kanka:' + text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2));

function matches(row, q) {
  if (q.eq) for (const [k, v] of Object.entries(q.eq)) if (row[k] !== v) return false;
  if (q.neq) for (const [k, v] of Object.entries(q.neq)) if (row[k] === v) return false;
  if (q.in) {
    const [k, arr] = q.in;
    if (!arr.includes(row[k])) return false;
  }
  if (q.gte) for (const [k, v] of Object.entries(q.gte)) if (!(row[k] >= v)) return false;
  if (q.ilike) for (const [k, v] of Object.entries(q.ilike)) if (!String(row[k] ?? '').toLowerCase().includes(v.toLowerCase())) return false;
  return true;
}

export async function createLocalDb() {
  const db = await idb();
  let data = (await tx(db, 'kv', 'readonly', (s) => s.get('data'))) || {};
  let saveT = null;
  const persist = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => tx(db, 'kv', 'readwrite', (s) => s.put(data, 'data')), 120);
  };
  const T = (name) => (data[name] = data[name] || []);
  const mediaCache = new Map();
  let session = null;
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    session = null;
  }
  const listeners = new Set();
  const api = {
    mode: 'local',
    async list(table, q = {}) {
      let rows = T(table).filter((r) => matches(r, q));
      if (q.order) {
        const [k, asc] = q.order;
        rows.sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (q.limit) rows = rows.slice(0, q.limit);
      return rows.map((r) => ({ ...r }));
    },
    async get(table, id) {
      const r = T(table).find((x) => x.id === id);
      return r ? { ...r } : null;
    },
    async insert(table, row) {
      const r = { id: uuid(), created_at: new Date().toISOString(), ...row };
      T(table).push(r);
      persist();
      return { ...r };
    },
    async update(table, id, patch) {
      const r = T(table).find((x) => x.id === id);
      if (!r) return null;
      Object.assign(r, patch);
      persist();
      return { ...r };
    },
    async remove(table, match) {
      data[table] = T(table).filter((r) => !matches(r, { eq: match }));
      persist();
    },
    async upload(blob, kind) {
      const id = uuid();
      await tx(db, 'media', 'readwrite', (s) => s.put(blob, id));
      return 'idb:' + id;
    },
    async uploadPrivate(blob) {
      return api.upload(blob, 'photo');
    },
    async signedUrl(path) {
      return api.resolve(path);
    },
    async removePrivate(path) {
      if (path && path.startsWith('idb:')) await tx(db, 'media', 'readwrite', (s) => s.delete(path.slice(4)));
    },
    async rpc(name, args = {}) {
      if (name === 'post_insights') {
        const pid = args.pid;
        const count = (t, f) => T(t).filter((r) => r.post_id === pid && (!f || f(r))).length;
        const owner = T('posts').find((p) => p.id === pid)?.user_id;
        return {
          views: count('post_views'),
          follower_views: count('post_views', (v) => T('follows').some((f) => f.follower_id === v.user_id && f.following_id === owner)),
          saves: count('saved_posts'),
          likes: count('likes'),
          comments: count('comments'),
          reposts: count('reposts'),
          shares: 0,
        };
      }
      return null;
    },
    async upsert(table, row, onConflict) {
      const keys = (onConflict || 'id').split(',');
      const ex = T(table).find((r) => keys.every((k) => r[k] === row[k]));
      if (ex) {
        Object.assign(ex, row);
        persist();
        return { ...ex };
      }
      return api.insert(table, row);
    },
    subscribe() {
      return () => {};
    },
    /** Yerel mod: aynı tarayıcıdaki sekmeler arası (deneme için). */
    channel(name) {
      const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('kanka:' + name) : null;
      const handlers = new Map();
      if (bc) bc.onmessage = (e) => handlers.get(e.data.ev)?.(e.data.payload);
      return {
        on: (ev, fn) => handlers.set(ev, fn),
        join: async () => {},
        send: async (ev, payload) => bc?.postMessage({ ev, payload }),
        close: () => bc?.close(),
      };
    },
    realtime: false,
    /** Hesabı ve tüm verisini bu cihazdan sil. */
    async deleteAccount() {
      const me = session?.uid;
      if (!me) return;
      const p = T('profiles').find((x) => x.id === me);
      if (p && p.role === 'owner' && T('profiles').length > 1) throw new Error('Kurucu hesabı silinemez.');
      const refs = ['user_id', 'follower_id', 'following_id', 'sender_id', 'actor_id', 'reporter_id', 'requester_id', 'target_id', 'blocker_id', 'blocked_id', 'a', 'b'];
      const postIds = new Set(T('posts').filter((x) => x.user_id === me).map((x) => x.id));
      const convIds = new Set(T('conversations').filter((c) => c.a === me || c.b === me).map((c) => c.id));
      for (const t of Object.keys(data)) {
        data[t] = data[t].filter((r) => !(r.id === me && (t === 'profiles' || t === 'accounts')) && !refs.some((k) => r[k] === me) && !postIds.has(r.post_id) && !convIds.has(r.conversation_id));
      }
      persist();
      await api.signOut();
    },
    /** idb:… adreslerini görüntülenebilir adrese çevir. */
    async resolve(url) {
      if (!url || !url.startsWith('idb:')) return url;
      if (mediaCache.has(url)) return mediaCache.get(url);
      const blob = await tx(db, 'media', 'readonly', (s) => s.get(url.slice(4)));
      const u = blob ? URL.createObjectURL(blob) : '';
      mediaCache.set(url, u);
      return u;
    },

    /* ---------- Hesap ---------- */
    userId: () => session?.uid || null,
    onAuth(fn) {
      listeners.add(fn);
    },
    async signUp({ email, password, username, name }) {
      email = email.trim().toLowerCase();
      if (T('accounts').some((a) => a.email === email)) throw new Error('Bu e-posta ile zaten hesap var.');
      const holder = T('profiles').find((p) => p.username === username);
      if (holder) {
        throw new Error('Bu kullanıcı adı alınmış.');
      }
      const id = uuid();
      T('accounts').push({ id, email, pass: await sha(password) });
      const first = !T('profiles').some((p) => p.role === 'admin' || p.role === 'owner');
      T('profiles').push({ id, username, name, bio: '', avatar: '', verified: first, role: first ? 'owner' : 'user', banned: false, private: false, dm_policy: 'everyone', hide_likes: false, restricted: false, created_at: new Date().toISOString() });
      persist();
      session = { uid: id };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      listeners.forEach((f) => f());
      return id;
    },
    async signIn(email, password) {
      email = email.trim().toLowerCase();
      const a = T('accounts').find((x) => x.email === email);
      if (!a || a.pass !== (await sha(password))) throw new Error('E-posta ya da şifre yanlış.');
      session = { uid: a.id };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      listeners.forEach((f) => f());
      return a.id;
    },
    async signOut() {
      session = null;
      localStorage.removeItem(SESSION_KEY);
      listeners.forEach((f) => f());
    },
    async changePassword(pw) {
      const a = T('accounts').find((x) => x.id === session?.uid);
      if (a) a.pass = await sha(pw);
      persist();
    },
    hasDemo: () => T('accounts').some((a) => a.email.endsWith('@kanka.app')),
    /** Deneme hesaplarını ve tüm içeriklerini sil. */
    async clearDemo() {
      const ids = new Set(T('accounts').filter((a) => a.email.endsWith('@kanka.app')).map((a) => a.id));
      const refs = ['user_id', 'follower_id', 'following_id', 'sender_id', 'actor_id', 'reporter_id', 'a', 'b'];
      const postIds = new Set(T('posts').filter((p) => ids.has(p.user_id)).map((p) => p.id));
      const convIds = new Set(T('conversations').filter((c) => ids.has(c.a) || ids.has(c.b)).map((c) => c.id));
      const storyIds = new Set(T('stories').filter((st) => ids.has(st.user_id)).map((st) => st.id));
      for (const t of Object.keys(data)) {
        data[t] = data[t].filter((r) => !(ids.has(r.id) && (t === 'profiles' || t === 'accounts')) && !refs.some((k) => ids.has(r[k])) && !postIds.has(r.post_id) && !convIds.has(r.conversation_id) && !storyIds.has(r.story_id));
      }
      persist();
      if (ids.has(session?.uid)) await api.signOut();
    },
  };
  return api;
}
