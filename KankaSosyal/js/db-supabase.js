// =========================================================
// db-supabase.js — Ortak sunucu (Supabase) veri katmanı.
// db-local.js ile aynı arayüz. Tablolar ve güvenlik kuralları: supabase/schema.sql
// =========================================================

export async function createSupabaseDb(url, key) {
  // APK içinde gömülü kütüphane (vendor/supabase.js) varsa onu kullan, yoksa internetten yükle
  let createClient = window.supabase?.createClient;
  if (!createClient) {
    try {
      ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm'));
    } catch {
      ({ createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4'));
    }
  }
  const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  let uid = (await sb.auth.getSession()).data.session?.user?.id || null;
  const listeners = new Set();
  sb.auth.onAuthStateChange((_e, s) => {
    const n = s?.user?.id || null;
    if (n !== uid) {
      uid = n;
      listeners.forEach((f) => f());
    }
  });
  const chk = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  const build = (q, o) => {
    if (o.eq) for (const [k, v] of Object.entries(o.eq)) q = q.eq(k, v);
    if (o.neq) for (const [k, v] of Object.entries(o.neq)) q = q.neq(k, v);
    if (o.in) q = q.in(o.in[0], o.in[1].length ? o.in[1] : ['00000000-0000-0000-0000-000000000000']);
    if (o.gte) for (const [k, v] of Object.entries(o.gte)) q = q.gte(k, v);
    if (o.ilike) for (const [k, v] of Object.entries(o.ilike)) q = q.ilike(k, `%${v}%`);
    if (o.order) q = q.order(o.order[0], { ascending: !!o.order[1] });
    if (o.limit) q = q.limit(o.limit);
    return q;
  };

  return {
    mode: 'supabase',
    async list(table, o = {}) {
      return chk(await build(sb.from(table).select('*'), o));
    },
    async get(table, id) {
      return chk(await sb.from(table).select('*').eq('id', id).maybeSingle());
    },
    async insert(table, row) {
      return chk(await sb.from(table).insert(row).select().single());
    },
    async update(table, id, patch) {
      return chk(await sb.from(table).update(patch).eq('id', id).select().maybeSingle());
    },
    async remove(table, match) {
      chk(await sb.from(table).delete().match(match));
    },
    async upload(blob, kind) {
      const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace('quicktime', 'mov');
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      chk(await sb.storage.from('media').upload(path, blob, { contentType: blob.type, upsert: false }));
      return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    },
    async resolve(u) {
      return u;
    },
    /** Gizli depoya yükle (mavi tik selfie'si). Dönen değer depodaki yol. */
    async uploadPrivate(blob) {
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      chk(await sb.storage.from('verify').upload(path, blob, { contentType: blob.type, upsert: false }));
      return path;
    },
    /** Gizli dosya için kısa süreli bağlantı (sadece sahibi ve yöneticiler alabilir). */
    async signedUrl(path) {
      if (!path) return '';
      const r = await sb.storage.from('verify').createSignedUrl(path, 600);
      return r.data?.signedUrl || '';
    },
    async removePrivate(path) {
      if (path) await sb.storage.from('verify').remove([path]);
    },
    async upsert(table, row, onConflict) {
      return chk(await sb.from(table).upsert(row, onConflict ? { onConflict } : undefined).select().maybeSingle());
    },
    /** Tablo değişikliklerini canlı dinle. Dönen fonksiyon dinlemeyi bırakır. */
    subscribe(table, filter, cb) {
      const ch = sb
        .channel(`t:${table}:${filter || 'all'}:${Math.random().toString(36).slice(2, 7)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, (p) => cb(p.new && Object.keys(p.new).length ? p.new : p.old, p.eventType))
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    /** Anlık mesajlaşma kanalı (arama sinyalleri için). */
    channel(name) {
      const ch = sb.channel(name, { config: { broadcast: { self: false, ack: false } } });
      const handlers = new Map();
      let ready = null;
      const join = () =>
        (ready =
          ready ||
          new Promise((res) => {
            for (const [ev, fn] of handlers) ch.on('broadcast', { event: ev }, ({ payload }) => fn(payload));
            ch.subscribe((st) => st === 'SUBSCRIBED' && res());
            setTimeout(res, 4000);
          }));
      return {
        on(ev, fn) {
          handlers.set(ev, fn);
        },
        join,
        async send(ev, payload) {
          await join();
          return ch.send({ type: 'broadcast', event: ev, payload });
        },
        close() {
          sb.removeChannel(ch);
        },
      };
    },
    realtime: true,
    url,
    key,
    async accessToken() {
      return (await sb.auth.getSession()).data.session?.access_token || '';
    },
    onToken(fn) {
      sb.auth.onAuthStateChange((_e, s) => s?.access_token && fn(s.access_token));
    },
    async rpc(name, args = {}) {
      return chk(await sb.rpc(name, args));
    },
    /** Hesabı sil: önce kendi dosyalarını, sonra hesabı (sunucudaki delete_my_account). */
    async deleteAccount() {
      for (const bucket of ['media', 'verify']) {
        try {
          const { data } = await sb.storage.from(bucket).list(uid, { limit: 1000 });
          if (data?.length) await sb.storage.from(bucket).remove(data.map((f) => `${uid}/${f.name}`));
        } catch {
          /* dosya yoksa sorun değil */
        }
      }
      chk(await sb.rpc('delete_my_account'));
      await sb.auth.signOut();
      uid = null;
      listeners.forEach((f) => f());
    },
    userId: () => uid,
    onAuth(fn) {
      listeners.add(fn);
    },
    async signUp({ email, password, username, name }) {
      const taken = chk(await sb.from('profiles').select('id').eq('username', username).maybeSingle());
      if (taken) throw new Error('Bu kullanıcı adı alınmış.');
      const r = chk(await sb.auth.signUp({ email: email.trim(), password, options: { data: { username, name } } }));
      if (!r.session) throw new Error('Hesap açıldı. E-postana gelen onay bağlantısına tıkla, sonra giriş yap. (Yönetici Supabase\'de e-posta onayını kapatırsa bu adım olmaz.)');
      uid = r.user.id;
      // profil satırı sunucudaki tetikleyiciyle (handle_new_user) otomatik açılır
      listeners.forEach((f) => f());
      return uid;
    },
    async signIn(email, password) {
      const r = chk(await sb.auth.signInWithPassword({ email: email.trim(), password }));
      uid = r.user.id;
      listeners.forEach((f) => f());
      return uid;
    },
    async signOut() {
      await sb.auth.signOut();
      uid = null;
      listeners.forEach((f) => f());
    },
    async changePassword(pw) {
      chk(await sb.auth.updateUser({ password: pw }));
    },
    isEmpty: () => false,
  };
}
