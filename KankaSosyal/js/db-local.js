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
      const first = !T('profiles').some((p) => p.role === 'admin');
      T('profiles').push({ id, username, name, bio: '', avatar: '', verified: first, role: first ? 'admin' : 'user', banned: false, created_at: new Date().toISOString() });
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
