// =========================================================
// Kanka "push" Edge Function — veritabanındaki yeni bildirim / mesaj / aramayı
// Firebase Cloud Messaging (HTTP v1) ile telefonlara iletir.
//
// Gerekli gizli ayar (Supabase > Edge Functions > Secrets):
//   FCM_SERVICE_ACCOUNT = Firebase > Proje ayarları > Hizmet hesapları > "Yeni özel anahtar oluştur"
//                         ile inen JSON dosyasının TAMAMI
// SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik verilir.
// Kurulum: "Verify JWT" KAPALI olmalı (veritabanı tetikleyicisi anahtarsız çağırır).
// Güvenlik: gelen kayıt veritabanından tekrar okunur; sahte istekler bir şey gönderemez.
// =========================================================
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SA = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') || '{}');

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`db ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}
const one = async (table: string, id: string, cols = '*') => (await db(`${table}?id=eq.${id}&select=${cols}`))[0] || null;

/* ---------- Google erişim anahtarı (hizmet hesabıyla imzalı JWT) ---------- */
let cached: { token: string; exp: number } | null = null;
const b64url = (b: ArrayBuffer | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function accessToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = String(SA.private_key || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${claim}.${b64url(sig)}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google anahtarı alınamadı: ' + JSON.stringify(j));
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

/** Kullanıcıların bütün telefonlarına "data" mesajı gönder (uygulama kendi bildirimini çizer). */
async function send(userIds: string[], data: Record<string, string>, ttl = '86400s') {
  userIds = [...new Set(userIds.filter(Boolean))];
  if (!userIds.length) return 0;
  const rows: { token: string }[] = await db(`device_tokens?user_id=in.(${userIds.join(',')})&select=token`);
  if (!rows.length) return 0;
  const tok = await accessToken();
  let ok = 0;
  await Promise.all(
    rows.map(async ({ token }) => {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token, data, android: { priority: 'high', ttl } } }),
      });
      if (r.ok) return ok++;
      const t = await r.text();
      // telefon uygulamayı sildiyse anahtarı temizle
      if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(t)) await db(`device_tokens?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' }).catch(() => {});
      else console.error('fcm', r.status, t);
    })
  );
  return ok;
}

const TXT: Record<string, string> = {
  like: 'gönderini beğendi',
  comment: 'yorum yaptı',
  follow: 'seni takip etmeye başladı',
  follow_request: 'seni takip etmek istiyor',
  follow_accept: 'takip isteğini kabul etti',
  repost: 'gönderini repost etti',
  tag: 'seni bir gönderide etiketledi',
  mention: 'senden bahsetti',
  group_add: 'seni bir gruba ekledi',
  story_vote: 'hikâyene cevap verdi',
  missed_call: 'seni aradı (cevapsız arama)',
};
const fresh = (iso: string, ms = 120_000) => Date.now() - new Date(iso).getTime() < ms;
const clip = (s: string, n = 120) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const plain = (s: string) => (s || '').replace(/::tepki:([a-z]+)::/g, '[tepki]');

Deno.serve(async (req) => {
  try {
    if (!SA.client_email) return new Response('FCM_SERVICE_ACCOUNT ayarlı değil', { status: 500 });
    const { type, table, record } = await req.json();
    if (!record?.id) return new Response('kayıt yok', { status: 400 });

    if (table === 'notifications' && type === 'INSERT') {
      const n = await one('notifications', record.id);
      if (!n || !fresh(n.created_at) || n.read) return new Response('eski');
      const actor = n.actor_id ? await one('profiles', n.actor_id, 'username') : null;
      const body =
        n.type === 'verified' || n.type === 'system' || !actor ? n.text || 'Yeni bildirim' : `@${actor.username} ${TXT[n.type] || ''}${n.text && n.type !== 'missed_call' ? ': ' + clip(n.text, 80) : ''}`;
      const sent = await send([n.user_id], { type: n.type === 'missed_call' ? 'missed_call' : 'notif', title: 'Kanka', body, post_id: n.post_id || '', username: actor?.username || '', tag: `n-${n.type}-${n.post_id || n.actor_id || ''}` });
      return Response.json({ sent });
    }

    if (table === 'messages' && type === 'INSERT') {
      const m = await one('messages', record.id);
      if (!m || !fresh(m.created_at)) return new Response('eski');
      const c = await one('conversations', m.conversation_id);
      if (!c) return new Response('sohbet yok');
      const to = c.is_group ? (await db(`conversation_members?conversation_id=eq.${c.id}&select=user_id`)).map((x: { user_id: string }) => x.user_id) : [c.a, c.b];
      const from = await one('profiles', m.sender_id, 'username');
      const what = m.media_kind === 'audio' ? 'Sesli mesaj' : m.text ? clip(plain(m.text)) : m.media_kind === 'gif' ? 'GIF' : 'Fotoğraf/video';
      const sent = await send(
        to.filter((u: string) => u !== m.sender_id),
        { type: 'message', title: c.is_group ? c.title || 'Grup' : `@${from?.username || 'kanka'}`, body: c.is_group ? `${from?.username || ''}: ${what}` : what, conversation_id: c.id, tag: `dm-${c.id}` }
      );
      return Response.json({ sent });
    }

    if (table === 'calls') {
      const call = await one('calls', record.id);
      if (!call) return new Response('arama yok');
      if (type === 'INSERT' && call.status === 'ringing' && fresh(call.created_at, 40_000)) {
        const from = await one('profiles', call.caller_id, 'username,name,avatar');
        // kısa ömürlü: 40 sn içinde ulaşmazsa hiç gösterme
        const sent = await send([call.callee_id], { type: 'call', call_id: call.id, kind: call.kind || 'audio', username: from?.username || '', name: from?.name || from?.username || 'Kanka', avatar: from?.avatar || '', created_at: call.created_at }, '40s');
        return Response.json({ sent });
      }
      if (type === 'UPDATE' && call.status !== 'ringing') {
        const sent = await send([call.callee_id], { type: 'call_end', call_id: call.id, status: call.status }, '60s');
        return Response.json({ sent });
      }
    }
    // grup araması: gruptaki herkese (başlatan hariç) çalan bildirim
    if (table === 'group_calls' && type === 'INSERT') {
      const gc = await one('group_calls', record.id);
      if (!gc || !fresh(gc.created_at, 40_000)) return new Response('eski');
      const c = await one('conversations', gc.conversation_id);
      const to = (await db(`conversation_members?conversation_id=eq.${gc.conversation_id}&select=user_id`)).map((x: { user_id: string }) => x.user_id);
      const from = await one('profiles', gc.started_by, 'username');
      const sent = await send(
        to.filter((u: string) => u !== gc.started_by),
        { type: 'group_call', group_call_id: gc.id, conversation_id: gc.conversation_id, kind: gc.kind, name: c?.title || 'Grup', username: from?.username || '', created_at: gc.created_at },
        '40s'
      );
      return Response.json({ sent });
    }

    // canlı yayın: takipçilere
    if (table === 'lives' && type === 'INSERT') {
      const lv = await one('lives', record.id);
      if (!lv || !fresh(lv.created_at) || lv.ended_at) return new Response('eski');
      const from = await one('profiles', lv.user_id, 'username');
      const fol = (await db(`follows?following_id=eq.${lv.user_id}&select=follower_id`)).map((x: { follower_id: string }) => x.follower_id);
      const sent = await send(fol, { type: 'live', live_id: lv.id, title: 'Kanka', body: `@${from?.username || ''} canlı yayında${lv.title ? ': ' + clip(lv.title, 60) : ''}`, tag: `live-${lv.user_id}` }, '3600s');
      return Response.json({ sent });
    }
    return new Response('geçildi');
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500 });
  }
});
