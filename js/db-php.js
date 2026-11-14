// =========================================================
// db-php.js — Kendi sunucumuz (cPanel: PHP + MySQL) veri katmanı.
// db-supabase.js ve db-local.js ile AYNI arayüz; uygulama hangisinin kullanıldığını bilmez.
// Canlı güncelleme: tek bir "sync" isteğiyle birkaç saniyede bir değişiklikler ve
// arama sinyalleri alınır (paylaşımlı hostingde WebSocket olmadığı için).
// =========================================================
const TOKEN_KEY = 'kanka.php.token';
const UID_KEY = 'kanka.php.uid';

export async function createPhpDb(apiUrl) {
  const api = apiUrl.endsWith('/') ? apiUrl + 'index.php' : apiUrl;
  const ls = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
      } catch {
        /* yok */
      }
    },
  };
  let token = ls.get(TOKEN_KEY);
  let uid = token ? ls.get(UID_KEY) : null;
  const listeners = new Set();
  const tokenListeners = new Set();
  const setSession = (t, u) => {
    token = t;
    uid = u;
    ls.set(TOKEN_KEY, t);
    ls.set(UID_KEY, u);
    tokenListeners.forEach((f) => f(t || ''));
    listeners.forEach((f) => f());
  };

  async function call(op, body = {}, form = null) {
    const used = token;
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    let opts;
    if (form) {
      form.append('op', op);
      if (token) form.append('_token', token);
      opts = { method: 'POST', headers, body: form };
    } else {
      headers['Content-Type'] = 'application/json';
      opts = { method: 'POST', headers, body: JSON.stringify({ op, ...body }) };
    }
    let r;
    try {
      r = await fetch(api, opts);
    } catch {
      throw new Error('Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.');
    }
    let j = null;
    try {
      j = await r.json();
    } catch {
      throw new Error(r.status === 413 ? 'Dosya sunucunun izin verdiğinden büyük.' : `Sunucu yanıt vermedi (${r.status}).`);
    }
    if (r.status === 401 && token && used === token) {
      // oturum geçersiz (başka bir oturuma geçilmediyse): çıkış yap
      setSession(null, null);
    }
    if (j.error) throw new Error(j.error);
    return j.data;
  }

  // açılışta oturum hâlâ geçerli mi? (internet yoksa son bilinen oturumla devam)
  let serverOk = true;
  try {
    const m = await call('me');
    if (token && !m?.user_id) setSession(null, null);
  } catch (e) {
    serverOk = false;
    if (/kurulmamış/.test(e.message)) throw e;
  }

  /* ---------- Canlı güncelleme ---------- */
  const subs = new Set(); // { table, col, val, cb }
  const chans = new Map(); // name -> { handlers: Map }
  let pollAfter = null;
  let recvAfter = null;
  let syncT = null;
  let busy = false;
  const schedule = (ms) => {
    clearTimeout(syncT);
    syncT = setTimeout(sync, ms);
  };
  const interval = () => (chans.size ? 700 : document.hidden ? 15000 : 2500);
  async function sync() {
    if (busy || !token || (!subs.size && !chans.size)) return;
    busy = true;
    try {
      const body = {};
      if (subs.size) body.poll = { after: pollAfter, tables: [...new Set([...subs].map((s) => s.table))] };
      if (chans.size) body.recv = { after: recvAfter, channels: [...chans.keys()] };
      const r = await call('sync', body);
      if (r.poll) {
        pollAfter = r.poll.last;
        for (const e of r.poll.events) for (const s of subs) if (s.table === e.table && (!s.col || String(e.row[s.col]) === s.val)) s.cb(e.row, e.ev);
      }
      if (r.recv) {
        recvAfter = r.recv.last;
        for (const it of r.recv.items) chans.get(it.channel)?.handlers.get(it.ev)?.(it.payload);
      }
    } catch {
      /* ağ hatası: sonra tekrar */
    }
    busy = false;
    if (subs.size || chans.size) schedule(interval());
  }
  document.addEventListener('visibilitychange', () => !document.hidden && schedule(50));

  const db = {
    mode: 'php',
    realtime: true,
    url: apiUrl,
    key: 'php',
    serverOk,
    async list(table, o = {}) {
      return call('list', { table, o });
    },
    async get(table, id) {
      return call('get', { table, id });
    },
    async insert(table, row) {
      return call('insert', { table, row });
    },
    async update(table, id, patch) {
      return call('update', { table, id, patch });
    },
    async remove(table, match) {
      await call('remove', { table, match });
    },
    async upsert(table, row, onConflict) {
      return call('upsert', { table, row, on: onConflict || null });
    },
    async rpc(name, args = {}) {
      return call('rpc', { name, args });
    },
    async upload(blob, kind) {
      const f = new FormData();
      const type = blob.type || (kind === 'audio' ? 'audio/webm' : kind === 'video' ? 'video/mp4' : 'image/jpeg');
      f.append('type', type);
      f.append('file', blob, 'dosya.' + (type.split('/')[1] || 'bin').split(';')[0]);
      return call('upload', {}, f);
    },
    async resolve(u) {
      return u;
    },
    async uploadPrivate(blob) {
      const f = new FormData();
      f.append('type', blob.type || 'image/jpeg');
      f.append('file', blob, 'selfie.jpg');
      return call('upload_private', {}, f);
    },
    async signedUrl(path) {
      return path ? call('signed_url', { path }) : '';
    },
    async removePrivate(path) {
      if (path) await call('remove_private', { path });
    },
    /** Tablo değişikliklerini dinle (birkaç saniyede bir). filtre: "sutun=eq.deger" */
    subscribe(table, filter, cb) {
      const m = filter ? /^(\w+)=eq\.(.+)$/.exec(filter) : null;
      const s = { table, col: m ? m[1] : null, val: m ? m[2] : null, cb };
      subs.add(s);
      if (pollAfter === null) schedule(10);
      else schedule(interval());
      return () => subs.delete(s);
    },
    /** Arama / canlı yayın sinyal kanalı. */
    channel(name) {
      const handlers = new Map();
      let joined = false;
      return {
        on(ev, fn) {
          handlers.set(ev, fn);
        },
        async join() {
          if (joined) return;
          joined = true;
          chans.set(name, { handlers });
          if (recvAfter === null) {
            const r = await call('recv', { channels: [], after: null }).catch(() => null);
            if (r && recvAfter === null) recvAfter = r.last;
          }
          schedule(10);
        },
        async send(ev, payload) {
          if (!joined) await this.join();
          await call('send', { channel: name, ev, payload });
          schedule(50);
        },
        close() {
          chans.delete(name);
        },
      };
    },
    async accessToken() {
      return token || '';
    },
    onToken(fn) {
      tokenListeners.add(fn);
    },
    async deleteAccount() {
      await call('delete_account');
      setSession(null, null);
    },
    userId: () => uid,
    onAuth(fn) {
      listeners.add(fn);
    },
    async signUp({ email, password, username, name }) {
      const r = await call('signup', { email: email.trim(), password, username, name });
      setSession(r.token, r.user_id);
      return r.user_id;
    },
    async signIn(email, password) {
      const r = await call('signin', { email: email.trim(), password });
      setSession(r.token, r.user_id);
      return r.user_id;
    },
    async signOut() {
      await call('signout').catch(() => {});
      setSession(null, null);
    },
    async changePassword(pw) {
      await call('password', { password: pw });
    },
    isEmpty: () => false,
  };
  return db;
}
