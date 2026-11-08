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
