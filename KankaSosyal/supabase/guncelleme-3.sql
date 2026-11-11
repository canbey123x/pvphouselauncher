-- =========================================================
-- Kanka güncellemesi 3: kaydedilenler, çoklu fotoğraf, etiketleme, görüntülenme istatistikleri,
-- yakın arkadaşlar, hikâye anketleri, vitrin (öne çıkan hikâyeler), grup sohbetleri, görüldü / yazıyor,
-- sesli mesaj, push bildirimleri için cihaz kayıtları, sesli arama ve SPAM ARAMA KORUMASI.
-- Önce guncelleme-2.sql çalıştırılmış olmalı.
-- Supabase > SQL Editor > New query > bu dosyanın TAMAMINI yapıştır > Run. Tekrar çalıştırmak zararsızdır.
-- =========================================================

-- ---------- Kaydedilen gönderiler ----------
create table if not exists saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

-- ---------- Gönderide kişi etiketleme ----------
create table if not exists post_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

-- ---------- Görüntülenme (istatistikler için) ----------
create table if not exists post_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

-- ---------- Yakın arkadaşlar (hikâye kitlesi) ----------
create table if not exists close_friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  friend_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, friend_id)
);

-- ---------- Hikâye anketleri ve soru cevapları ----------
create table if not exists story_votes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  choice text not null default '',
  created_at timestamptz not null default now(),
  unique (story_id, user_id)
);

-- ---------- Vitrin (öne çıkan hikâyeler) ----------
create table if not exists highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default '',
  cover text not null default '',
  story_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- Grup sohbetleri, görüldü, yazıyor ----------
alter table conversations add column if not exists is_group boolean not null default false;
alter table conversations add column if not exists title text not null default '';
alter table conversations add column if not exists avatar text not null default '';
alter table conversations add column if not exists owner_id uuid references profiles(id) on delete set null;

create table if not exists conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create table if not exists conversation_reads (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz,
  typing_at timestamptz,
  primary key (conversation_id, user_id)
);

-- ---------- Push bildirimleri: cihaz anahtarları ----------
create table if not exists device_tokens (
  token text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);

-- ---------- Sesli arama ----------
alter table profiles add column if not exists call_policy text not null default 'everyone'; -- everyone | following | none

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references profiles(id) on delete cascade,
  callee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'ringing',   -- ringing | accepted | declined | missed | cancelled | ended
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);
create index if not exists calls_callee_idx on calls (callee_id, created_at desc);
create index if not exists calls_caller_idx on calls (caller_id, created_at desc);

alter table saved_posts enable row level security;
alter table post_tags enable row level security;
alter table post_views enable row level security;
alter table close_friends enable row level security;
alter table story_votes enable row level security;
alter table highlights enable row level security;
alter table conversation_members enable row level security;
alter table conversation_reads enable row level security;
alter table device_tokens enable row level security;
alter table calls enable row level security;

-- ---------- Yardımcı fonksiyonlar ----------
create or replace function is_member(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations c where c.id = conv and auth.uid() in (c.a, c.b))
      or exists (select 1 from conversation_members m where m.conversation_id = conv and m.user_id = auth.uid());
$$;

create or replace function is_group_owner(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations c where c.id = conv and c.is_group and c.owner_id = auth.uid());
$$;

create or replace function post_owner(pid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from posts where id = pid;
$$;

create or replace function story_owner(sid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from stories where id = sid;
$$;

-- Yakın arkadaş hikâyesini görebilir miyim?
create or replace function can_view_story(owner uuid, meta jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select can_view(owner) and (
    coalesce(meta->>'audience', '') <> 'close'
    or owner = auth.uid() or is_admin()
    or exists (select 1 from close_friends f where f.owner_id = owner and f.friend_id = auth.uid())
  );
$$;

-- Gönderi istatistikleri (sadece gönderinin sahibi)
create or replace function post_insights(pid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare o uuid;
begin
  select user_id into o from posts where id = pid;
  if o is null or (o <> auth.uid() and not is_admin()) then raise exception 'Bu istatistikleri sadece gönderinin sahibi görebilir.'; end if;
  return json_build_object(
    'views', (select count(*) from post_views where post_id = pid),
    'follower_views', (select count(*) from post_views v where v.post_id = pid and exists (select 1 from follows f where f.follower_id = v.user_id and f.following_id = o)),
    'saves', (select count(*) from saved_posts where post_id = pid),
    'likes', (select count(*) from likes where post_id = pid),
    'comments', (select count(*) from comments where post_id = pid),
    'reposts', (select count(*) from reposts where post_id = pid),
    'shares', 0
  );
end $$;
grant execute on function post_insights(uuid) to authenticated;

-- Anket sonuçları (oy verenler ve hikâye sahibi yüzdeleri görebilsin)
create or replace function story_poll_results(sid uuid) returns json
language sql stable security definer set search_path = public as $$
  select case when can_view(story_owner(sid)) then json_build_object(
    'a', (select count(*) from story_votes where story_id = sid and choice = 'a'),
    'b', (select count(*) from story_votes where story_id = sid and choice = 'b'),
    'mine', (select choice from story_votes where story_id = sid and user_id = auth.uid())
  ) else null end;
$$;
grant execute on function story_poll_results(uuid) to authenticated;

-- ---------- Kurallar: yeni tablolar ----------
drop policy if exists "own_saved" on saved_posts;
create policy "own_saved" on saved_posts for select to authenticated using (user_id = auth.uid());
drop policy if exists "ins_saved" on saved_posts;
create policy "ins_saved" on saved_posts for insert to authenticated with check (user_id = auth.uid() and can_view(post_owner(post_id)));
drop policy if exists "del_saved" on saved_posts;
create policy "del_saved" on saved_posts for delete to authenticated using (user_id = auth.uid());

drop policy if exists "sel_tags" on post_tags;
create policy "sel_tags" on post_tags for select to authenticated using (can_view(post_owner(post_id)));
drop policy if exists "ins_tags" on post_tags;
create policy "ins_tags" on post_tags for insert to authenticated
  with check (post_owner(post_id) = auth.uid() and not is_blocked_between(user_id, auth.uid()));
drop policy if exists "del_tags" on post_tags;
create policy "del_tags" on post_tags for delete to authenticated using (post_owner(post_id) = auth.uid() or user_id = auth.uid() or is_admin());

drop policy if exists "sel_views" on post_views;
create policy "sel_views" on post_views for select to authenticated using (user_id = auth.uid() or post_owner(post_id) = auth.uid() or is_admin());
drop policy if exists "ins_views" on post_views;
create policy "ins_views" on post_views for insert to authenticated with check (user_id = auth.uid() and can_view(post_owner(post_id)));

drop policy if exists "sel_close" on close_friends;
create policy "sel_close" on close_friends for select to authenticated using (owner_id = auth.uid());
drop policy if exists "ins_close" on close_friends;
create policy "ins_close" on close_friends for insert to authenticated with check (owner_id = auth.uid() and friend_id <> auth.uid());
drop policy if exists "del_close" on close_friends;
create policy "del_close" on close_friends for delete to authenticated using (owner_id = auth.uid());

-- yakın arkadaş hikâyeleri sadece listedekilere
drop policy if exists "read_stories" on stories;
create policy "read_stories" on stories for select to authenticated using (can_view_story(user_id, meta));

drop policy if exists "sel_votes" on story_votes;
create policy "sel_votes" on story_votes for select to authenticated using (user_id = auth.uid() or story_owner(story_id) = auth.uid());
drop policy if exists "ins_votes" on story_votes;
create policy "ins_votes" on story_votes for insert to authenticated with check (user_id = auth.uid() and is_active() and can_view(story_owner(story_id)));

drop policy if exists "sel_highlights" on highlights;
create policy "sel_highlights" on highlights for select to authenticated using (can_view(user_id));
drop policy if exists "ins_highlights" on highlights;
create policy "ins_highlights" on highlights for insert to authenticated with check (user_id = auth.uid() and is_active());
drop policy if exists "upd_highlights" on highlights;
create policy "upd_highlights" on highlights for update to authenticated using (user_id = auth.uid());
drop policy if exists "del_highlights" on highlights;
create policy "del_highlights" on highlights for delete to authenticated using (user_id = auth.uid() or is_admin());
-- vitrindeki eski hikâyeler sahibinin profilinde görünebilsin (okuma kuralı zaten can_view)

-- Sohbetler: birebir + grup
drop policy if exists "sel_conversations" on conversations;
create policy "sel_conversations" on conversations for select to authenticated using (is_member(id));
drop policy if exists "ins_conversations" on conversations;
create policy "ins_conversations" on conversations for insert to authenticated with check (
  is_active() and (
    (not is_group and auth.uid() in (a, b) and dm_allowed(case when a = auth.uid() then b else a end))
    or (is_group and owner_id = auth.uid() and a = auth.uid() and b = auth.uid())
  )
);
drop policy if exists "upd_conversations" on conversations;
create policy "upd_conversations" on conversations for update to authenticated using (is_member(id));
drop policy if exists "del_conversations" on conversations;
create policy "del_conversations" on conversations for delete to authenticated using (is_group_owner(id));

drop policy if exists "sel_members" on conversation_members;
create policy "sel_members" on conversation_members for select to authenticated using (is_member(conversation_id));
drop policy if exists "ins_members" on conversation_members;
create policy "ins_members" on conversation_members for insert to authenticated
  with check (is_group_owner(conversation_id) and (user_id = auth.uid() or dm_allowed(user_id)));
drop policy if exists "del_members" on conversation_members;
create policy "del_members" on conversation_members for delete to authenticated using (user_id = auth.uid() or is_group_owner(conversation_id));

drop policy if exists "sel_reads" on conversation_reads;
create policy "sel_reads" on conversation_reads for select to authenticated using (is_member(conversation_id));
drop policy if exists "ins_reads" on conversation_reads;
create policy "ins_reads" on conversation_reads for insert to authenticated with check (user_id = auth.uid() and is_member(conversation_id));
drop policy if exists "upd_reads" on conversation_reads;
create policy "upd_reads" on conversation_reads for update to authenticated using (user_id = auth.uid());

drop policy if exists "sel_messages" on messages;
create policy "sel_messages" on messages for select to authenticated using (is_member(conversation_id));
drop policy if exists "ins_messages" on messages;
create policy "ins_messages" on messages for insert to authenticated
  with check (sender_id = auth.uid() and is_active() and is_member(conversation_id) and (
    exists (select 1 from conversations c where c.id = conversation_id and c.is_group)
    or exists (select 1 from conversations c where c.id = conversation_id and dm_allowed(case when c.a = auth.uid() then c.b else c.a end))
  ));

drop policy if exists "own_tokens" on device_tokens;
create policy "own_tokens" on device_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Arama kuralları + SPAM KORUMASI ----------
drop policy if exists "sel_calls" on calls;
create policy "sel_calls" on calls for select to authenticated using (auth.uid() in (caller_id, callee_id));
drop policy if exists "ins_calls" on calls;
create policy "ins_calls" on calls for insert to authenticated with check (caller_id = auth.uid());
drop policy if exists "upd_calls" on calls;
create policy "upd_calls" on calls for update to authenticated using (auth.uid() in (caller_id, callee_id));

create or replace function guard_call_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pol text;
  age interval;
begin
  new.caller_id := auth.uid();
  new.status := 'ringing';
  new.created_at := now();
  new.answered_at := null;
  new.ended_at := null;
  if new.callee_id = new.caller_id then raise exception 'Kendini arayamazsın.'; end if;
  if not is_active() then raise exception 'Hesabın kısıtlı ya da yasaklı; arama yapamazsın.'; end if;
  if is_blocked_between(new.callee_id, new.caller_id) then raise exception 'Bu kişiyi arayamazsın.'; end if;
  select call_policy into pol from profiles where id = new.callee_id;
  if pol = 'none' then raise exception 'Bu kişi arama kabul etmiyor.'; end if;
  if pol = 'following' and not exists (select 1 from follows where follower_id = new.callee_id and following_id = new.caller_id) then
    raise exception 'Bu kişi sadece takip ettiği kişilerden arama kabul ediyor.';
  end if;
  -- Spam koruması
  if exists (select 1 from calls where caller_id = new.caller_id and status in ('ringing', 'accepted') and created_at > now() - interval '60 seconds') then
    raise exception 'Zaten devam eden bir araman var.';
  end if;
  if (select count(*) from calls where caller_id = new.caller_id and created_at > now() - interval '10 minutes') >= 6 then
    raise exception 'Çok fazla arama yaptın. Biraz bekleyip tekrar dene.';
  end if;
  if (select count(*) from calls where caller_id = new.caller_id and callee_id = new.callee_id
      and status in ('ringing', 'missed', 'declined', 'cancelled') and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Bu kişiyi son bir saatte çok sık aradın ve cevap vermedi. Daha sonra tekrar dene.';
  end if;
  if (select count(*) from calls where caller_id = new.caller_id and created_at > now() - interval '1 day') >= 40 then
    raise exception 'Günlük arama sınırına ulaştın.';
  end if;
  select now() - created_at into age from profiles where id = new.caller_id;
  if age < interval '24 hours' and not exists (select 1 from follows where follower_id = new.callee_id and following_id = new.caller_id) then
    raise exception 'Yeni hesaplar ilk 24 saat sadece kendilerini takip eden kişileri arayabilir.';
  end if;
  return new;
end $$;

drop trigger if exists guard_call_insert_trg on calls;
create trigger guard_call_insert_trg before insert on calls for each row execute function guard_call_insert();

create or replace function guard_call_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id; new.caller_id := old.caller_id; new.callee_id := old.callee_id; new.created_at := old.created_at;
  if old.status in ('declined', 'missed', 'cancelled', 'ended') then
    raise exception 'Bu arama bitti.';
  end if;
  if new.status = 'accepted' then
    if auth.uid() <> old.callee_id or old.status <> 'ringing' then raise exception 'Aramayı sadece aranan kişi açabilir.'; end if;
    new.answered_at := now();
  elsif new.status = 'declined' then
    if auth.uid() <> old.callee_id then raise exception 'Geçersiz.'; end if;
    new.ended_at := now();
  elsif new.status in ('cancelled', 'missed') then
    if old.status <> 'ringing' then raise exception 'Geçersiz.'; end if;
    new.ended_at := now();
  elsif new.status = 'ended' then
    new.ended_at := now();
  else
    raise exception 'Geçersiz arama durumu.';
  end if;
  return new;
end $$;

drop trigger if exists guard_call_update_trg on calls;
create trigger guard_call_update_trg before update on calls for each row execute function guard_call_update();

-- ---------- Bildirim türleri ----------
drop policy if exists "ins_notifications" on notifications;
create policy "ins_notifications" on notifications for insert to authenticated
  with check (actor_id = auth.uid() and (type in ('like', 'comment', 'follow', 'repost', 'message', 'follow_request', 'follow_accept', 'tag', 'mention', 'group_add', 'story_vote', 'missed_call') or is_admin()));

-- ---------- Sesli mesaj dosyaları ----------
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp',
                               'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav', 'audio/x-m4a']
where id = 'media';

-- ---------- Telefon bildirim anahtarı (aynı telefonda hesap değişince devredilir) ----------
create or replace function register_device(tok text) returns void
language sql security definer set search_path = public as $$
  insert into device_tokens (token, user_id, platform, updated_at) values (tok, auth.uid(), 'android', now())
  on conflict (token) do update set user_id = auth.uid(), updated_at = now();
$$;
create or replace function unregister_device(tok text) returns void
language sql security definer set search_path = public as $$
  delete from device_tokens where token = tok and user_id = auth.uid();
$$;
revoke execute on function register_device(text) from anon;
revoke execute on function unregister_device(text) from anon;

-- ---------- Kilit ekranından "Reddet" (uygulama açılmadan) ----------
-- Arama numarası (uuid) sadece arayan, aranan ve bildirimde bilinir; sadece çalan aramayı reddeder.
create or replace function decline_call(cid uuid) returns void
language sql security definer set search_path = public as $$
  update calls set status = 'declined' where id = cid and status = 'ringing';
$$;
grant execute on function decline_call(uuid) to anon, authenticated;

-- ---------- Canlı bildirim (arama ekranı, yeni mesaj, yazıyor... anında gelsin) ----------
do $$
declare t text;
begin
  foreach t in array array['calls', 'messages', 'conversation_reads'] loop
    begin
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    exception when others then null;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
